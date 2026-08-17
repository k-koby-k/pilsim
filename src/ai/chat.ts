/**
 * The chat path. Same boundary as the reasoning panel, harder problem.
 *
 * `client.ts` explains a fixed artefact: the app decides what is being explained
 * and the model only narrates it. Chat inverts that — the user chooses the
 * question, and most interesting questions a person types into a box next to a
 * pharmacology app are questions this dataset cannot answer. So the honesty
 * machinery is not merely reused here, it is the reason the surface can exist:
 *
 *  - Numbers. `buildChatPrompt` fixes the allowed set the same way `buildPrompt`
 *    does, and every delta goes through `validateProse`. There is deliberately
 *    no second transport and no second validator; `askChat` calls
 *    `streamWithActiveProvider` exactly like `runReasoning` does.
 *
 *  - THE USER'S OWN NUMBERS ARE NOT FACTS. If someone types "what about 80 mg?",
 *    that 80 is in the prompt but it is not something the app knows, and
 *    harvesting it would let the model echo an invented dose back with the
 *    styling of a sourced one. So the harvest runs over the app-rendered context
 *    and the system prompt ONLY — never the question, never a previous answer.
 *    The prompt says this out loud to the model as well.
 *
 *  - Coverage. The context always carries a section naming the edge of the
 *    product (see chatContext.ts), and the system prompt makes "PilSim does not
 *    model that" a required answer rather than a fallback. A confident sentence
 *    about a drug we hold no parameters for is the exact failure this whole
 *    architecture exists to prevent, and it is far likelier here than anywhere
 *    else in the product.
 */

import { validateProse } from './client'
import { extractNumbers, type NumberFact, type Segment, type ValidationSummary } from './numbers'
import { chatSections, type ChatContext } from './chatContext'
import { streamWithActiveProvider, type AiSettings } from './providers'
import type { AiFailure, ChatMessage, ContextSection } from './types'

export type ChatStatus = 'idle' | 'streaming' | 'done' | 'error'

/** One message in the visible conversation. */
export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  /** Raw text. For an assistant turn this is the model's reply, unedited. */
  text: string
  /** Assistant turns only: the reply split so each number can be marked in place. */
  segments?: Segment[]
  validation?: ValidationSummary
  failure?: AiFailure
  /** How many app-supplied numbers this reply was judged against. */
  factCount?: number
  /** Still arriving. */
  streaming?: boolean
}

/** How much of the conversation is sent back to the model. */
export const HISTORY_TURNS = 8
const HISTORY_CHARS = 700

// ---------------------------------------------------------------------------
// the prompt
// ---------------------------------------------------------------------------

/**
 * Written as prohibitions with the reason attached, like the panel's prompt, and
 * with one addition the panel does not need: an explicit instruction that
 * refusing is a correct answer. Models treat "I don't know" as a failure state
 * unless told otherwise, and here it is very often the only true sentence.
 */
export const CHAT_SYSTEM_PROMPT = [
  'You are the assistant inside PilSim, a hypertension digital-twin simulator. The user is looking at a',
  'page of the app and is asking about what is in front of them. Everything you may draw on is in the',
  'CONTEXT block below: it was assembled from the dataset, the cited rules engine and the deterministic',
  'simulation engine, which have already computed every value. You are not computing anything.',
  '',
  'ABSOLUTE CONSTRAINTS — the first is checked mechanically after you reply, and any number you write',
  'that was not supplied is struck through and flagged in red beside your text:',
  '1. Use ONLY numbers that appear in the CONTEXT. Never introduce a dose, a percentage, a pressure, a',
  '   concentration, a laboratory value, a half-life or a date that is not written there. If you need a',
  '   number you were not given, say in words that the value is not available.',
  '2. A number the USER typed is not a fact. Questions may contain doses or figures the app knows',
  '   nothing about. Do not repeat them as if the product supplied them, and do not build on them.',
  '3. Never recall pharmacology from memory. Every mechanism you state must be one the CONTEXT states.',
  '   Your training data carries no citation this product can print, so it is worthless here.',
  '4. Never compute a new number from two given ones, and never round a number into a different claim.',
  '5. Never predict strokes, heart attacks or deaths, and never give advice about a real patient. This',
  '   is a simulator running on virtual patients.',
  '',
  'WHEN THE ANSWER IS NOT IN THE CONTEXT, SAY SO. This is a correct and useful answer, not a failure.',
  'PilSim models a deliberately narrow slice — read WHAT PILSIM MODELS below for its exact edge. If the',
  'question is about a drug, a condition, an outcome or a mechanism outside that slice, say plainly that',
  'PilSim does not model it, in one sentence, and stop. Do not reason from general medical knowledge to',
  'fill the gap, do not guess, and do not soften the refusal with a plausible-sounding paragraph. If the',
  'question is inside the slice but the specific value is simply not on the screen, say which part of',
  'the app would have it.',
  '',
  'ATTRIBUTE EVERYTHING. Say where each claim came from the way the rest of the product does: name a',
  'fired rule by its id in square brackets, or say "the dataset record", or "the engine computed". A',
  'sentence with no attribution reads as your own opinion, and you are not entitled to one here.',
  '',
  'STYLE: answer in the language the user wrote in — English, Uzbek or Russian. One to three short',
  'paragraphs, usually one. No headings, no bullet lists, no markdown emphasis. Plain sentences for a',
  'clinician who is short of time. Do not restate the disclaimer; the interface already shows it.',
].join('\n')

/** Render the sections into the single block the model reads. */
export function renderChatContext(sections: ContextSection[]): string {
  const parts: string[] = [
    'CONTEXT — this is the whole of what the app knows right now, and every number you may use is in',
    'this block.',
    '',
  ]
  for (const s of sections) {
    if (!s.lines.length) continue
    parts.push(`## ${s.title}`)
    parts.push(...s.lines)
    parts.push('')
  }
  return parts.join('\n')
}

export interface BuiltChatPrompt {
  messages: ChatMessage[]
  /**
   * The allowed number set: the typed facts the sections recorded, plus every
   * number tokenized out of the rendered context and the system prompt. The
   * user's question and the previous replies are excluded on purpose — see the
   * file header.
   */
  facts: NumberFact[]
  approxChars: number
}

/** Keep a long previous answer from crowding out the context. */
function clip(text: string): string {
  const t = text.trim()
  return t.length <= HISTORY_CHARS ? t : `${t.slice(0, HISTORY_CHARS)}…`
}

export function buildChatPrompt(ctx: ChatContext, history: ChatTurn[], question: string): BuiltChatPrompt {
  const sections = chatSections(ctx)
  const rendered = renderChatContext(sections)
  const system = `${CHAT_SYSTEM_PROMPT}\n\n${rendered}`

  const recent = history
    .filter((t) => t.text.trim() && !t.failure)
    .slice(-HISTORY_TURNS)
    .map<ChatMessage>((t) => ({ role: t.role, content: clip(t.text) }))

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...recent,
    { role: 'user', content: question.trim() },
  ]

  const typed = sections.flatMap((s) => s.facts)
  const harvested: NumberFact[] = [
    ...extractNumbers(rendered),
    ...extractNumbers(CHAT_SYSTEM_PROMPT),
  ].map((t) => ({
    value: t.value,
    unit: t.unit,
    label: 'stated in the context supplied to the model',
  }))

  return {
    messages,
    facts: [...typed, ...harvested],
    approxChars: messages.reduce((n, m) => n + m.content.length, 0),
  }
}

// ---------------------------------------------------------------------------
// asking
// ---------------------------------------------------------------------------

export interface AskChatOptions {
  context: ChatContext
  history: ChatTurn[]
  settings: AiSettings
  onUpdate: (turn: Omit<ChatTurn, 'id' | 'role'>) => void
  signal?: AbortSignal
}

export interface ChatAnswer {
  status: ChatStatus
  text: string
  segments: Segment[]
  validation: ValidationSummary
  failure?: AiFailure
  factCount: number
}

/**
 * Ask the configured provider a question about the screen.
 *
 * Never throws. Every failure — no provider, network, rate limit, timeout,
 * empty stream — resolves as `status: 'error'` with an `AiFailure` the panel
 * prints, and whatever text did arrive is kept and still validated. A reply cut
 * off half way is partial, not untrustworthy; the status is what stops the
 * panel looking as though it finished.
 */
export async function askChat(question: string, opts: AskChatOptions): Promise<ChatAnswer> {
  const { messages, facts } = buildChatPrompt(opts.context, opts.history, question)
  let raw = ''

  const snapshot = (status: ChatStatus, failure?: AiFailure): ChatAnswer => {
    const streaming = status === 'streaming'
    const { segments, validation } = validateProse(raw, facts, streaming)
    return { status, text: raw, segments, validation, failure, factCount: facts.length }
  }

  const emit = (a: ChatAnswer) => {
    opts.onUpdate({
      text: a.text,
      segments: a.segments,
      validation: a.validation,
      failure: a.failure,
      factCount: a.factCount,
      streaming: a.status === 'streaming',
    })
  }

  emit(snapshot('streaming'))

  const result = await streamWithActiveProvider({
    messages,
    settings: opts.settings,
    signal: opts.signal,
    onDelta: (delta) => {
      raw += delta
      emit(snapshot('streaming'))
    },
  })

  if (!result.ok) {
    const state = snapshot('error', result.failure)
    emit(state)
    return state
  }

  raw = result.text
  const final = snapshot('done')
  emit(final)
  return final
}
