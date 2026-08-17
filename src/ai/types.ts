/**
 * Shared contracts for the AI layer.
 *
 * `src/types.ts` is frozen and owned by the lead, so everything the AI layer
 * needs of its own is declared here, per that file's instruction.
 */

import type { NumberFact } from './numbers'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** One labelled block of the context, and the numbers it put in front of the model. */
export interface ContextSection {
  id: string
  title: string
  lines: string[]
  facts: NumberFact[]
}

/**
 * A regimen the model is allowed to propose.
 *
 * The model never writes a drug and a dose. It returns ids from this list and
 * nothing else is accepted, so a suggestion cannot contain a dose the app did
 * not already define, let alone one the engine cannot run.
 */
export interface RegimenChoice {
  id: string
  label: string
  /** Short note the app already knows, e.g. "half dose of each". */
  note?: string
}

export interface AiContext {
  sections: ContextSection[]
  choices: RegimenChoice[]
  /**
   * Scenes of the anatomy the model may recommend watching, by id.
   *
   * Same discipline as `choices`: an id from a supplied list, matched exactly,
   * discarded if it does not match. A scene is only ever a lens on the run that
   * already happened, so recommending one cannot change a number — which is
   * what makes it a safe thing to let a model choose.
   */
  scenes: RegimenChoice[]
  /** What the model is being asked to do, in one line, for the panel header. */
  taskLabel: string
  /** True when a TreatmentPlan was available; changes the framing of the ask. */
  hasPlan: boolean
}

export type AiFailureKind =
  | 'no-provider'
  | 'network'
  | 'rate-limit'
  | 'server'
  | 'malformed'
  | 'aborted'
  | 'timeout'

export interface AiFailure {
  kind: AiFailureKind
  message: string
  status?: number
  /** What the user can actually do about it, in plain words. */
  remedy?: string
}

export interface StreamHandlers {
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

/** A parsed, id-matched suggestion. `regimenId` always exists in the catalogue. */
export interface Suggestion {
  regimenId: string
  label: string
  /** The model's rationale, already stripped of any number that traces to nothing. */
  rationale: string
}

/** A scene the model recommends watching. Always one the app published. */
export interface SceneSuggestion {
  sceneId: string
  label: string
  reason: string
}
