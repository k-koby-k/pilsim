/**
 * Cross-page INTENT handoff. Owned by Agent UI-A, open to any UI agent.
 *
 * WHY THIS EXISTS. `src/App.tsx` routes by unmounting one page and mounting the next,
 * and it deliberately passes nothing but `onNavigate`. That is fine for "take me to
 * Pills" and useless for "take me to Pills WITH THESE THREE SUBSTANCES ALREADY IN THE
 * COMPOSER". Without somewhere to put that intent, every hand-off lands the user on an
 * empty form and asks them to redo the choice they just made — which is exactly how the
 * combination feature became invisible: the only route to a multi-drug pill was to
 * leave Substances, guess that the composer existed, and retype the selection.
 *
 * So: a module-level, single-shot mailbox, in the same spirit as `savedStore`.
 *
 *     // sender, on the Substances page
 *     requestCompose({ substanceIds, doses, name })
 *     onNavigate('pills')
 *
 *     // receiver, on mount
 *     const handoff = takeCompose()   // consumes it; a later visit is a clean slate
 *
 * `takeCompose` empties the box, so navigating back to Pills next week does not
 * silently resurrect a stale draft. Nothing here is persisted — this is the width of
 * one click, not storage.
 */

import type { PatientInputs, Regimen } from '../../types'

export interface ComposeHandoff {
  /** In the order the user picked them. */
  substanceIds: string[]
  /**
   * Starting dose in mg per substance id, read from the dataset's own
   * `dosing.typical_adult_start_mg`. `null` where the record quotes none — the field
   * is then left empty rather than filled with an invented number.
   */
  doses: Record<string, number | null>
  /** A suggested composition name, e.g. "Lisinopril + amlodipine". Editable on arrival. */
  name: string
}

let pending: ComposeHandoff | null = null

/** Queue substances for the pill composer. Call immediately before `onNavigate('pills')`. */
export function requestCompose(handoff: ComposeHandoff): void {
  pending = handoff
}

/** Read and clear the pending hand-off. Returns null when there is nothing waiting. */
export function takeCompose(): ComposeHandoff | null {
  const held = pending
  pending = null
  return held
}

/** Read without consuming. For tests and diagnostics. */
export function peekCompose(): ComposeHandoff | null {
  return pending
}

// ---------------------------------------------------------------------------
// run replay — the sidebar's History section handing a past run back to the
// Simulation page. Same one-shot-mailbox shape as ComposeHandoff above; see
// `src/ui/shell/historyStore.ts` for why replay RE-RUNS rather than trying to
// restore the old frames verbatim.
// ---------------------------------------------------------------------------

export interface RunReplayHandoff {
  regimen: Regimen
  subjectId: string
  subjectLabel: string
  subjectInputs: PatientInputs
  options: {
    horizonHours: number
    outputEveryMin: number
    initial: 'steady_state' | 'first_dose'
    populationN: number
  }
}

let pendingReplay: RunReplayHandoff | null = null

/** Queue a past run to be re-simulated. Call immediately before `onNavigate('simulation')`. */
export function requestRunReplay(handoff: RunReplayHandoff): void {
  pendingReplay = handoff
}

/** Read and clear the pending replay. Returns null when there is nothing waiting. */
export function takeRunReplay(): RunReplayHandoff | null {
  const held = pendingReplay
  pendingReplay = null
  return held
}
