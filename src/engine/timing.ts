/**
 * HOW MUCH CAN THE TIME OF DAY EVEN MATTER? — the pharmacokinetic half of the answer.
 *
 * This module answers exactly one question, and it answers it by arithmetic on parameters
 * the engine already carries: across one dosing interval, how far does this drug's
 * concentration fall before the next dose is due?
 *
 * That number bounds what timing can possibly do. A drug whose concentration is still at
 * two thirds of its peak 24 hours later covers every hour of the day about equally, so
 * moving the dose from breakfast to bedtime moves almost nothing. A drug that is down to
 * one percent of its peak at 24 hours has a real hole in its coverage, and the hour it is
 * taken decides where in the day that hole sits.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES **NOT** DO
 * ---------------------------------------------------------------------------
 * It says nothing about whether covering one part of the day is better than covering
 * another. It cannot: the engine carries no circadian rhythm at all — data/patient_model.json
 * lists "Circadian rhythm in blood pressure — no dipper/non-dipper pattern" under
 * `validity_limits.not_modelled` — so there is no night-time blood pressure in this
 * simulation to protect. `src/report/timing.ts` is where the clinical claim is made, and it
 * is required to keep that claim separate from this one.
 *
 * Nothing here is new pharmacology. `ka`, `lag`, `ke` and the formulation overrides are
 * read through `buildPkParams`/`resolveForm` exactly as `run.ts` reads them, and the
 * concentration curve is the same Bateman superposition the simulation itself integrates.
 * The only thing added is the reduction of that curve to two ratios.
 */

import type { DrugId, Regimen } from '../types'
import { SUBSTANCE_PK } from './substanceParams'
import {
  buildDoseHistory,
  buildPkParams,
  concentrationAt,
  exp3174ConcentrationAt,
  type PkCovariates,
} from './pk'

/**
 * How much room the time of day has to make any difference at all.
 *
 *  - `negligible` the concentration barely moves across the interval, so every hour is
 *                 covered about equally and the clock is close to irrelevant;
 *  - `modest`     a real but bounded swing;
 *  - `marked`     the drug is essentially gone before the next dose, so a once-daily
 *                 schedule leaves part of every day uncovered whichever hour is chosen.
 */
export type TimingSensitivity = 'negligible' | 'modest' | 'marked'

/**
 * Trough at or above half the peak ⇒ `negligible`. Chosen, not fitted: at half the peak
 * the drug's own diurnal variation is smaller than the between-subject spread in every
 * `cv` figure in substanceParams.ts, so a shifted dose cannot be distinguished from a
 * different patient. Amlodipine is the only one of the five that clears it, and it clears
 * it on the strength of a 40 h half-life alone.
 */
export const TIMING_NEGLIGIBLE_TROUGH_FRACTION = 0.5

/**
 * Trough below a tenth of the peak ⇒ `marked` — a ten-fold or worse swing within one day.
 * Metoprolol immediate-release taken once daily is the case this threshold exists for.
 */
export const TIMING_MARKED_TROUGH_FRACTION = 0.1

/**
 * The reference subject the coverage figures are computed on when no covariates are
 * supplied: 70 kg, eGFR 90, 55 years, normal CYP2D6/CYP2C9, no hepatic impairment. The
 * same reference `formulations.test.ts` uses. Coverage is then a property of the DRUG,
 * which is what the recommendation wants to talk about; pass real covariates when the
 * point is this patient's own clearance.
 */
export const TIMING_REFERENCE_SUBJECT: PkCovariates = {
  weightKg: 70,
  egfr: 90,
  ageYears: 55,
  cyp2d6: 'normal',
  cyp2c9: 'normal',
  hepaticImpairment: false,
}

export interface DoseIntervalCoverage {
  substanceId: DrugId
  /**
   * The species that actually carries the effect across the interval. For losartan this
   * is EXP3174, not losartan: the metabolite carries most of the AT1 effect and its
   * half-life — not the parent's 2.1 h — is what makes once-daily dosing work at all
   * (substanceParams.ts METABOLITE). Deriving that rather than asserting it is the whole
   * reason this field exists.
   */
  effectiveSpeciesId: DrugId
  /** The cited elimination half-life of that species, h. */
  effectiveHalfLifeH: number
  /** The dosage form the figures were computed for; undefined = the reference IR form. */
  form?: string
  perDay: number
  /** Hours between administrations. */
  intervalH: number
  /** Steady-state peak ÷ trough concentration across one interval. */
  peakTroughRatio: number
  /** Trough as a fraction of the interval's peak, 0..1. */
  troughFractionOfPeak: number
  sensitivity: TimingSensitivity
}

export interface DoseIntervalCoverageInput {
  substanceId: DrugId
  /** Milligrams per administration. Cancels out of both ratios; taken for realism. */
  mg: number
  perDay: number
  form?: string
  covariates?: PkCovariates
  /**
   * CYP2C9 scale on the losartan → EXP3174 conversion. It scales the whole metabolite
   * curve, so it cancels out of both ratios; accepted so a caller need not know that.
   */
  fmScale?: number
}

function classify(troughFractionOfPeak: number): TimingSensitivity {
  if (troughFractionOfPeak >= TIMING_NEGLIGIBLE_TROUGH_FRACTION) return 'negligible'
  if (troughFractionOfPeak < TIMING_MARKED_TROUGH_FRACTION) return 'marked'
  return 'modest'
}

/** Sampling step through the interval, hours. 0.005 h matches formulations.test.ts. */
const STEP_H = 0.005

/**
 * Reduce one steady-state dosing interval to its peak-to-trough swing.
 *
 * The dose history is built at `steady_state`, which pre-loads ten half-lives of prior
 * dosing — for amlodipine that is about seventeen days. Doing this on a first-dose history
 * instead would understate amlodipine's flatness by its ~2.9-fold accumulation factor and
 * would make the drug for which timing matters LEAST look like the one where it matters
 * most. That is the trap `buildDoseHistory`'s own header warns about, and it applies here
 * with unusual force.
 */
export function doseIntervalCoverage(input: DoseIntervalCoverageInput): DoseIntervalCoverage {
  const { substanceId, mg, form } = input
  const perDay = Math.max(1, input.perDay || 1)
  const intervalH = 24 / perDay
  const cov = input.covariates ?? TIMING_REFERENCE_SUBJECT

  const regimen: Regimen = {
    id: `timing::${substanceId}`,
    label: `timing probe: ${substanceId}`,
    doses: [{ substanceId, mg, perDay, form }],
  }
  const doses = buildDoseHistory(regimen, 'steady_state', intervalH)

  // Losartan is dosed but EXP3174 is what acts, so the interval is read on the metabolite.
  const viaMetabolite = substanceId === 'losartan'
  const effectiveSpeciesId: DrugId = viaMetabolite ? 'exp3174' : substanceId
  const parent = buildPkParams(substanceId, cov, undefined, undefined, form)
  const metab = viaMetabolite ? buildPkParams('exp3174', cov) : null

  const at = (t: number): number =>
    metab ? exp3174ConcentrationAt(doses, parent, metab, t, input.fmScale ?? 1) : concentrationAt(doses, parent, t)

  let peak = 0
  let trough = Infinity
  for (let t = STEP_H; t <= intervalH + 1e-9; t += STEP_H) {
    const c = at(t)
    if (c > peak) peak = c
    if (c < trough) trough = c
  }

  // A degenerate curve (zero dose, or a form that never absorbs) must not be reported as
  // a flat one — "no concentration at all" is not "even coverage".
  const usable = peak > 0 && Number.isFinite(trough) && trough >= 0
  const troughFractionOfPeak = usable ? trough / peak : 0
  const peakTroughRatio = usable && trough > 0 ? peak / trough : Infinity

  return {
    substanceId,
    effectiveSpeciesId,
    effectiveHalfLifeH: SUBSTANCE_PK[effectiveSpeciesId].half_life_h,
    form,
    perDay,
    intervalH,
    peakTroughRatio,
    troughFractionOfPeak,
    sensitivity: classify(troughFractionOfPeak),
  }
}
