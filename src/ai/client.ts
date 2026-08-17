/**
 * The client: context in, validated stream out.
 *
 * Everything the panel renders passes through here, and nothing reaches the
 * panel unchecked. The validation runs on every delta rather than once at the
 * end, so the traceability marks appear as the sentence lands — which is also
 * the honest thing to show, because a reader watching an unsupported number
 * light up mid-sentence learns what the boundary is doing far better than a
 * summary line at the bottom would teach them.
 */

import {
  checkNumbers,
  segment,
  summarize,
  type CheckedToken,
  type NumberFact,
  type Segment,
  type ValidationSummary,
} from './numbers'
import { buildPrompt, splitReply, SUGGEST_MARKER } from './prompt'
import { parseSuggestions } from './suggest'
import { streamWithActiveProvider, type AiSettings } from './providers'
import type { AiContext, AiFailure, SceneSuggestion, Suggestion } from './types'

export type AiStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface AiRunState {
  status: AiStatus
  /** The prose half only. The suggestion block is never shown as prose. */
  prose: string
  segments: Segment[]
  checked: CheckedToken[]
  validation: ValidationSummary
  suggestions: Suggestion[]
  /** The scene it recommends watching, if it named one this app publishes. */
  scene: SceneSuggestion | null
  /** Ids the model proposed that are not in the catalogue — shown, never runnable. */
  rejectedIds: string[]
  failure?: AiFailure
  /** The allowed set this reply was judged against, for the "how this works" note. */
  factCount: number
}

export const EMPTY_RUN: AiRunState = {
  status: 'idle',
  prose: '',
  segments: [],
  checked: [],
  validation: { total: 0, supported: 0, unsupported: 0, pending: 0, offenders: [], clean: true },
  suggestions: [],
  scene: null,
  rejectedIds: [],
  factCount: 0,
}

/**
 * Hide a half-written marker.
 *
 * `<<<SUGG` arriving in a delta must not flash on screen as prose before the
 * rest of the marker lands.
 */
function trimPartialMarker(text: string): string {
  for (let n = Math.min(SUGGEST_MARKER.length - 1, text.length); n > 0; n--) {
    if (text.endsWith(SUGGEST_MARKER.slice(0, n))) return text.slice(0, text.length - n)
  }
  return text
}

/** Validate a prose snapshot. Exported because the panel re-renders from it. */
export function validateProse(prose: string, facts: NumberFact[], partial: boolean): {
  segments: Segment[]
  checked: CheckedToken[]
  validation: ValidationSummary
} {
  const checked = checkNumbers(prose, facts, { partial })
  return { checked, segments: segment(prose, checked), validation: summarize(checked) }
}

export interface RunOptions {
  settings: AiSettings
  onUpdate: (state: AiRunState) => void
  signal?: AbortSignal
}

/**
 * Ask the configured provider to explain the supplied context.
 *
 * Resolves with the final state. It never throws: every failure mode — no
 * provider, network, rate limit, timeout, empty or malformed stream — comes
 * back as `status: 'error'` with an `AiFailure` the panel can print. The page
 * around it keeps working either way.
 */
export async function runReasoning(ctx: AiContext, opts: RunOptions): Promise<AiRunState> {
  const { messages, facts } = buildPrompt(ctx)
  let raw = ''

  const snapshot = (status: AiStatus, extra: Partial<AiRunState> = {}): AiRunState => {
    const { prose: prosePart, suggestBlock } = splitReply(raw)
    const prose = trimPartialMarker(prosePart)
    const streaming = status === 'streaming'
    const { segments, checked, validation } = validateProse(prose, facts, streaming)
    const parsed = streaming
      ? { suggestions: [], rejected: [], scene: null }
      : parseSuggestions(suggestBlock, ctx.choices, facts, ctx.scenes)
    return {
      status,
      prose,
      segments,
      checked,
      validation,
      suggestions: parsed.suggestions,
      scene: parsed.scene,
      rejectedIds: parsed.rejected,
      factCount: facts.length,
      ...extra,
    }
  }

  opts.onUpdate(snapshot('streaming'))

  const result = await streamWithActiveProvider({
    messages,
    settings: opts.settings,
    signal: opts.signal,
    onDelta: (delta) => {
      raw += delta
      opts.onUpdate(snapshot('streaming'))
    },
  })

  if (!result.ok) {
    // Text already streamed is kept and still validated: a reply cut off by a
    // rate limit is partial, not untrustworthy, and throwing it away mid-demo
    // would look worse than saying what happened. The status stays `error` so
    // the panel prints the failure above whatever did arrive — the one thing
    // that must never happen is the panel looking as though it finished.
    const state = snapshot('error', { failure: result.failure })
    opts.onUpdate(state)
    return state
  }

  raw = result.text
  const final = snapshot('done')
  opts.onUpdate(final)
  return final
}
