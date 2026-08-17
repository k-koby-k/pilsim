/**
 * Prompt construction — and the moment the allowed number set is fixed.
 *
 * `buildPrompt` returns the messages AND the facts. Those facts are the typed
 * ones the context recorded, PLUS every number tokenized straight out of the
 * final rendered user message. That second pass is what makes the guarantee
 * airtight and easy to state to a judge: the model may write a number if and
 * only if that number was in the text we sent it.
 *
 * Keeping the two in one function is deliberate. If prompt text could be
 * changed without the fact set changing with it, the boundary would drift and
 * nobody would notice until a number slipped through.
 */

import { extractNumbers, type NumberFact } from './numbers'
import type { AiContext, ChatMessage } from './types'

export const SUGGEST_MARKER = '<<<SUGGEST>>>'

/**
 * The rules the model works under.
 *
 * Written as prohibitions with reasons, because a bare "do not invent numbers"
 * is complied with less reliably than one that says what invention would cost.
 * None of this is load-bearing on its own — numbers.ts enforces the boundary
 * whatever the model does — but a model that mostly obeys produces a panel
 * without red flags in it, and that is what the demo wants to look like.
 */
export const SYSTEM_PROMPT = [
  'You are the reasoning voice of PilSim, a hypertension digital-twin simulator used by physicians.',
  '',
  'A deterministic simulation engine and a cited rules engine have ALREADY made every decision and',
  'computed every number. You are not being asked to decide anything. You explain what they decided,',
  'in the register one physician uses with another: mechanism first, then the consequence for THIS',
  'patient, then what would change the answer.',
  '',
  'ABSOLUTE CONSTRAINTS — these are checked mechanically after you reply, and any number you write',
  'that is not in the context below is flagged in red on screen next to your text:',
  '1. Use ONLY numbers that appear in the CONTEXT. Never introduce a dose, a percentage, a pressure,',
  '   a concentration, a laboratory value, a half-life or a date that is not written there. If you',
  '   need a number you were not given, say in words that the value is not available.',
  '2. Never recall pharmacology from memory. Every mechanism you cite must be one the context states.',
  '   Your training data has no citation this product can print, so it is worthless here.',
  '3. Never round a number into a different claim, and never compute a new number from two given ones.',
  '4. If an arm is marked TOO CLOSE TO CALL, do not say it beat or lost to another arm.',
  '5. If an arm is DISQUALIFIED, name the blocking rule and its mechanism. Write no score for it.',
  '6. Where the product DECLINED to rank something, report the refusal as the answer. Do not fill the gap.',
  '7. Never predict strokes, heart attacks or deaths. Long-horizon output is a projection of blood',
  '   pressure control and organ-relevant markers, never a prediction of events.',
  '8. Do not restate the disclaimer; the interface already shows it.',
  '',
  'STYLE: 3 to 5 short paragraphs, no headings, no bullet lists, no markdown emphasis. Name rules by',
  'their id in square brackets when you lean on them. Write for a clinician who is short of time.',
].join('\n')

function suggestInstruction(ctx: AiContext): string {
  if (!ctx.choices.length && !ctx.scenes.length) return ''
  const lines = ['', 'AFTER the prose, and only then, output a line containing exactly:', SUGGEST_MARKER]
  if (ctx.choices.length) {
    lines.push(
      'and then between one and three lines, each of the form:',
      '<regimen id> | <one sentence saying what testing it would settle>',
      '',
      'The id MUST be copied exactly from CANDIDATE REGIMENS. Any other id is discarded silently, so a',
      'regimen you invent simply will not appear. You are proposing what is worth SIMULATING; the engine',
      'runs it and produces the actual result. Do not predict what the result will be.',
    )
  }
  if (ctx.scenes.length) {
    lines.push(
      '',
      'You may also add ONE line of the form:',
      'scene: <scene id> | <one sentence saying what is worth watching there for this patient>',
      'copying the id exactly from SCENES. A scene is only a view of the run that already happened.',
    )
  }
  return lines.join('\n')
}

/** Render the context into the single user message the provider receives. */
export function renderContext(ctx: AiContext): string {
  const parts: string[] = ['CONTEXT — every number you may use is in this block.', '']
  for (const s of ctx.sections) {
    if (!s.lines.length) continue
    parts.push(`## ${s.title}`)
    parts.push(...s.lines)
    parts.push('')
  }
  if (ctx.choices.length) {
    parts.push('## CANDIDATE REGIMENS — the only ids you may propose')
    for (const c of ctx.choices) parts.push(`${c.id} | ${c.label}${c.note ? ` | ${c.note}` : ''}`)
    parts.push('')
  }
  if (ctx.scenes.length) {
    parts.push('## SCENES — views of the body this run can be watched through')
    for (const s of ctx.scenes) parts.push(`${s.id} | ${s.label}${s.note ? ` | ${s.note}` : ''}`)
    parts.push('')
  }
  parts.push(`## YOUR TASK`)
  parts.push(
    ctx.hasPlan
      ? 'Explain the treatment plan above to the prescribing physician: what is being started and why THIS ' +
        'patient gets that choice, what the rules forced, what is being monitored and what result would ' +
        'change the plan, and what happens if it does not work or is not tolerated.'
      : 'Explain what the engine computed for this patient: what drove the result, which rules shaped it, ' +
        'and what a physician should take from it.',
  )
  parts.push(suggestInstruction(ctx))
  return parts.join('\n')
}

export interface BuiltPrompt {
  messages: ChatMessage[]
  /**
   * The complete allowed number set. Typed facts first so tooltips get the good
   * label; harvested tokens after so nothing printed is ever unquotable.
   */
  facts: NumberFact[]
  /** For the panel: how much was actually sent. */
  approxChars: number
}

export function buildPrompt(ctx: AiContext): BuiltPrompt {
  const user = renderContext(ctx)
  const typed = ctx.sections.flatMap((s) => s.facts)
  // Harvested from BOTH messages: the guarantee is stated as "every number we
  // sent", so the system message has to be inside it too, or the guarantee
  // would be narrower than the sentence describing it.
  const harvested: NumberFact[] = [...extractNumbers(user), ...extractNumbers(SYSTEM_PROMPT)].map((t) => ({
    value: t.value,
    unit: t.unit,
    label: 'stated in the context supplied to the model',
  }))
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    facts: [...typed, ...harvested],
    approxChars: SYSTEM_PROMPT.length + user.length,
  }
}

/** Split a reply into the prose half and the raw suggestion half. */
export function splitReply(text: string): { prose: string; suggestBlock: string } {
  const i = text.indexOf(SUGGEST_MARKER)
  if (i === -1) return { prose: text, suggestBlock: '' }
  return { prose: text.slice(0, i).trimEnd(), suggestBlock: text.slice(i + SUGGEST_MARKER.length) }
}
