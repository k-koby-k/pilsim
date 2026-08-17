/**
 * Binding to the scorer (src/report/score.ts, Agent RUL) and the normative
 * disclaimer wording (src/report/disclaimer.ts).
 *
 * The disclaimer is imported, never retyped. §8 of the report spec says the
 * wording is normative and not paraphrasable, so the page and the export must
 * come from one string.
 */

import type { PatientState, RunSummary, Regimen, ScoreWeights } from '../../types'
import type { PilSimData } from '../../data/load'
import {
  modellingCaveatChip,
  rankOptions,
  defaultWeights as scorerDefaultWeights,
  type ScoreCandidate,
  type ScoredOption,
} from '../../report/score'
import {
  DISCLAIMER_FULL,
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_SHORT_I18N,
  DISCLAIMER_TITLE,
} from '../../report/disclaimer'
import type { EvaluationResult } from './adapters'

export type { ScoredOption, ScoreCandidate }

/**
 * Re-exported so the report renders the scorer's own wording for a modelling
 * caveat rather than a second paraphrase of it. The amlodipine sex-by-dose
 * sentence in particular is worded so it cannot be misread as the label
 * prescribing a lower dose in women, and that wording has exactly one home.
 */
export { modellingCaveatChip }

export interface DisclaimerText {
  title: string
  paragraphs: readonly string[]
  full: string
  short_en: string
  short_uz: string
  short_ru: string
}

export const DISCLAIMER: DisclaimerText = {
  title: DISCLAIMER_TITLE,
  paragraphs: DISCLAIMER_PARAGRAPHS,
  full: DISCLAIMER_FULL,
  short_en: DISCLAIMER_SHORT_I18N.en,
  short_uz: DISCLAIMER_SHORT_I18N.uz,
  short_ru: DISCLAIMER_SHORT_I18N.ru,
}

export interface ArmForScoring {
  regimen: Regimen
  summary: RunSummary
  modifiers: EvaluationResult
  populationN: number
  dosesPerDay?: number
  productIds?: string[]
  troughToPeakRatio?: number
}

/** The scorer owns the defaults; this view only presents them. */
export function defaultWeights(): ScoreWeights {
  return scorerDefaultWeights()
}

export function rank(
  patient: PatientState,
  arms: ArmForScoring[],
  weights: ScoreWeights,
  data: PilSimData | null,
): { ranked: ScoredOption[] | null; error?: string } {
  if (!arms.length) return { ranked: [] }
  const candidates: ScoreCandidate[] = arms.map((a) => ({
    regimen: a.regimen,
    summary: a.summary,
    modifiers: a.modifiers,
    populationN: a.populationN,
    dosesPerDay: a.dosesPerDay ?? Math.max(...a.regimen.doses.map((d) => d.perDay || 1)),
    productIds: a.productIds,
    troughToPeakRatio: a.troughToPeakRatio,
  }))
  try {
    return { ranked: rankOptions({ patient, candidates, data, weights }) }
  } catch (err) {
    return { ranked: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Trough-to-peak ratio of the EFFECT over the last dosing interval.
 *
 * The scorer takes it as an optional input and falls back to a default when it
 * is absent; computing it here from the streamed frames is strictly better than
 * letting the default stand, because it is what makes the daily-coverage term
 * — and therefore the formulation comparison — mean anything.
 */
export function effectTroughToPeak(
  frames: { t_h: number; haemo: { map: number } }[],
  baselineMap: number,
  intervalH = 24,
): number | undefined {
  if (frames.length < 4) return undefined
  const end = frames[frames.length - 1].t_h
  const window = frames.filter((f) => f.t_h >= end - intervalH)
  if (window.length < 4) return undefined
  const effects = window.map((f) => baselineMap - f.haemo.map)
  const peak = Math.max(...effects)
  const trough = Math.min(...effects)
  if (!isFinite(peak) || peak <= 0.2) return undefined
  return Math.max(0, Math.min(1, trough / peak))
}
