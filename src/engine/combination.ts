/**
 * ⭐ Layer B — THE COMBINATION RULE. Spec §4.4.
 *
 * This is the scientific core of the product and the only genuinely novel
 * computational claim in it. It is what makes "the 5 most efficient dosage
 * combinations" defensible rather than a made-up ranking.
 *
 * Three steps:
 *   1. per-drug Emax effect from the Law 2003 fit, then patient scaling;
 *   2. bounded pooling WITHIN a shared mechanistic pathway;
 *   3. bounded pooling ACROSS pathways.
 *
 * `C·(1 − Π(1 − e/C))` is Bliss independence on a bounded effect scale. It
 * tends to additive as e/C → 0 and saturates smoothly as effects approach the
 * ceiling. One formula covers both regimes; only the ceiling changes.
 *
 * Two emergent properties, neither hard-coded:
 *   - dual RAAS blockade ranks LAST of the ten drug pairs;
 *   - half doses of two drugs beat a double dose of one.
 *
 * ⚠️ HARD RULE (spec §6.1b(a)): the optimiser and EVERY ranked recommendation
 *    read from this module, never from the last frame of an ODE run. This
 *    calculation is steady-state and dose-based, so it is structurally immune to
 *    the amlodipine accumulation bias. Validation PK-13c.
 */

import type { DrugId, Regimen, RuleModifiers } from '../types'
import {
  EMAX_FIT,
  CLASS_PATHWAY,
  DRUG_CLASS,
  STANDARD_DOSE_MG,
  PATHWAY_CEILING,
  GLOBAL_CEILING,
  DOSE_WINDOW_MIN,
  DOSE_WINDOW_MAX,
  LAW_REFERENCE_SBP,
  LAW_REFERENCE_DBP,
  BASELINE_SLOPE_SBP,
  BASELINE_SLOPE_DBP,
  BASELINE_SCALE_CLAMP,
  ADVERSE_SYMPTOM_PREVALENCE,
  DOSABLE_DRUGS,
  BETA_RENIN_CROSSOVER,
  type DrugClass,
  type Pathway,
  type GlobalCalibration,
} from './constants'

export type Endpoint = 'sbp' | 'dbp'

export interface CombinationSubject {
  sbpBaseline: number
  dbpBaseline: number
}

export interface CombinationOptions {
  /** default `law2003` — see constants.GLOBAL_CEILING for why both exist */
  calibration?: GlobalCalibration
  /** multiplicative PD adjustments from rules.json, keyed by drug id */
  pdMultipliers?: Partial<Record<DrugId, number>>
}

export interface CombinationResult {
  dsbp: number
  ddbp: number
  /** per-drug contributions before pooling, for the report's waterfall */
  perDrug: { drugId: DrugId; doseMultiple: number; sbp: number; dbp: number }[]
  perPathway: { pathway: Pathway; sbp: number; dbp: number }[]
  /** any dose fell outside the 0.25x–4x validated window */
  extrapolated: boolean
  extrapolatedDrugs: DrugId[]
  /** three or more drugs — beyond every validating meta-analysis (FM-08) */
  beyondPairEvidence: boolean
  /** regimen contains an ACEi and an ARB together */
  dualRaas: boolean
  /** beta-blocker + RAS inhibitor — near-additive here but really sub-additive (FM-06) */
  betaPlusRasi: boolean
  covariateSource: 'rules' | 'default'
}

/** §4.5(a) pre-treatment blood-pressure scaling. */
export function baselineScaling(subject: CombinationSubject, ep: Endpoint): number {
  const s =
    ep === 'sbp'
      ? 1 + BASELINE_SLOPE_SBP * (subject.sbpBaseline - LAW_REFERENCE_SBP)
      : 1 + BASELINE_SLOPE_DBP * (subject.dbpBaseline - LAW_REFERENCE_DBP)
  return Math.min(BASELINE_SCALE_CLAMP[1], Math.max(BASELINE_SCALE_CLAMP[0], s))
}

/** Emax curve for one class at a dose expressed in multiples of standard. */
export function classEffect(cls: DrugClass, ep: Endpoint, doseMultiple: number): number {
  const { emax, ed50 } = EMAX_FIT[cls][ep]
  const d = Math.max(0, doseMultiple)
  if (d === 0) return 0
  return (emax * d) / (ed50 + d)
}

/** Bliss-independence pooling on a bounded scale. */
function push(
  map: Map<Pathway, { sbp: number[]; dbp: number[] }>,
  pathway: Pathway,
  sbp: number,
  dbp: number,
) {
  const bucket = map.get(pathway) ?? { sbp: [], dbp: [] }
  bucket.sbp.push(sbp)
  bucket.dbp.push(dbp)
  map.set(pathway, bucket)
}

export function pool(effects: number[], ceiling: number): number {
  if (effects.length === 0) return 0
  let prod = 1
  for (const e of effects) prod *= 1 - Math.min(e, 0.98 * ceiling) / ceiling
  return ceiling * (1 - prod)
}

export function combinationRule(
  regimen: Regimen,
  subject: CombinationSubject,
  opts: CombinationOptions = {},
): CombinationResult {
  const calibration: GlobalCalibration = opts.calibration ?? 'law2003'
  const pdMul = opts.pdMultipliers ?? {}

  const perDrug: CombinationResult['perDrug'] = []
  const byPathway = new Map<Pathway, { sbp: number[]; dbp: number[] }>()
  const extrapolatedDrugs: DrugId[] = []
  const classesPresent = new Set<DrugClass>()

  for (const d of regimen.doses) {
    if (!d.mg || d.mg <= 0) continue
    // EXP3174 is a metabolite. If a caller passes it as a dosed species, ignore
    // it here: losartan already carries the ARB class effect, and counting both
    // would double-count the same pathway node.
    if (d.substanceId === 'exp3174') continue

    const cls = DRUG_CLASS[d.substanceId]
    const pathway = CLASS_PATHWAY[cls]
    classesPresent.add(cls)

    const raw = (d.mg * (d.perDay || 1)) / STANDARD_DOSE_MG[d.substanceId]
    if (raw < DOSE_WINDOW_MIN || raw > DOSE_WINDOW_MAX) extrapolatedDrugs.push(d.substanceId)
    // FM-01: clamp, never extrapolate the fit. Emax is a curve-fit asymptote.
    const dm = Math.min(DOSE_WINDOW_MAX, Math.max(DOSE_WINDOW_MIN, raw))

    const covar = pdMul[d.substanceId] ?? 1
    const eSbp = classEffect(cls, 'sbp', dm) * baselineScaling(subject, 'sbp') * covar
    const eDbp = classEffect(cls, 'dbp', dm) * baselineScaling(subject, 'dbp') * covar

    perDrug.push({ drugId: d.substanceId, doseMultiple: raw, sbp: eSbp, dbp: eDbp })

    // A beta-blocker's effect is SPLIT across two pathways, because part of it
    // is renin suppression and therefore competes with a RAS inhibitor for the
    // same mechanistic room. See constants.BETA_RENIN_CROSSOVER.
    if (cls === 'BETA' && BETA_RENIN_CROSSOVER > 0) {
      push(byPathway, 'RAAS', eSbp * BETA_RENIN_CROSSOVER, eDbp * BETA_RENIN_CROSSOVER)
      push(byPathway, pathway, eSbp * (1 - BETA_RENIN_CROSSOVER), eDbp * (1 - BETA_RENIN_CROSSOVER))
    } else {
      push(byPathway, pathway, eSbp, eDbp)
    }
  }

  const perPathway: CombinationResult['perPathway'] = []
  const pooledSbp: number[] = []
  const pooledDbp: number[] = []

  for (const [pathway, es] of byPathway) {
    const ceil = PATHWAY_CEILING[pathway]
    // Why max(): without it a LONE drug on a pathway is distorted by the
    // ceiling and stops reproducing Law 2003. With it, a lone drug passes
    // through exactly.
    const sbp =
      es.sbp.length === 1 ? es.sbp[0] : Math.max(Math.max(...es.sbp), pool(es.sbp, ceil.sbp))
    const dbp =
      es.dbp.length === 1 ? es.dbp[0] : Math.max(Math.max(...es.dbp), pool(es.dbp, ceil.dbp))
    perPathway.push({ pathway, sbp, dbp })
    pooledSbp.push(sbp)
    pooledDbp.push(dbp)
  }

  const g = GLOBAL_CEILING[calibration]
  const dualRaas = classesPresent.has('ACEI') && classesPresent.has('ARB')

  return {
    dsbp: pool(pooledSbp, g.sbp),
    ddbp: pool(pooledDbp, g.dbp),
    perDrug,
    perPathway,
    extrapolated: extrapolatedDrugs.length > 0,
    extrapolatedDrugs,
    beyondPairEvidence: perDrug.length >= 3,
    dualRaas,
    betaPlusRasi:
      classesPresent.has('BETA') && (classesPresent.has('ACEI') || classesPresent.has('ARB')),
    covariateSource: Object.keys(pdMul).length > 0 ? 'rules' : 'default',
  }
}

/** Convenience for a single drug at a dose multiple, at the Law reference baseline. */
export function monotherapyEffect(
  drugId: DrugId,
  doseMultiple: number,
  subject: CombinationSubject = { sbpBaseline: LAW_REFERENCE_SBP, dbpBaseline: LAW_REFERENCE_DBP },
  opts: CombinationOptions = {},
): CombinationResult {
  return combinationRule(
    {
      id: `mono-${drugId}-${doseMultiple}`,
      label: `${drugId} x${doseMultiple}`,
      doses: [
        { substanceId: drugId, mg: STANDARD_DOSE_MG[drugId] * doseMultiple, perDay: 1 },
      ],
    },
    subject,
    opts,
  )
}

// ---------------------------------------------------------------------------
// Safety term — §4.7. Efficacy rises sub-linearly with dose; VISIBLE HARM rises
// supra-linearly. That asymmetry is the whole reason PilSim recommends a BEST
// dose rather than a MAXIMUM dose, and amlodipine's own label proves it:
// doubling 5 → 10 mg buys 2.9 mmHg and 7.8 percentage points of oedema.
//
// The safety term must be at least quadratic in dose or it will not out-run the
// efficacy term at the top of the range (SAT-05).
// ---------------------------------------------------------------------------

export function adverseSymptomBurden(cls: DrugClass, doseMultiple: number): number {
  const t = ADVERSE_SYMPTOM_PREVALENCE[cls]
  // Log-quadratic interpolation through the three published points
  // (0.5x, 1x, 2x). Beyond 2x it continues to accelerate, which is the point.
  const x = Math.log2(Math.max(0.125, doseMultiple)) // −1, 0, +1 at ½, 1, 2
  const a = (t.double + t.half) / 2 - t.standard
  const b = (t.double - t.half) / 2
  return Math.max(0, t.standard + b * x + a * x * x)
}

export function regimenAdverseBurden(regimen: Regimen): number {
  let total = 0
  for (const d of regimen.doses) {
    if (!d.mg || d.mg <= 0 || d.substanceId === 'exp3174') continue
    const dm = (d.mg * (d.perDay || 1)) / STANDARD_DOSE_MG[d.substanceId]
    total += adverseSymptomBurden(DRUG_CLASS[d.substanceId], dm)
  }
  return total
}

// ---------------------------------------------------------------------------
// The fast ranker. Pure arithmetic, ~10 µs per regimen — it never needs the ODE.
// ---------------------------------------------------------------------------

export interface RankedCombination {
  regimen: Regimen
  dsbp: number
  ddbp: number
  adverseBurden: number
  /** efficacy − safetyWeight·harm; the report may re-weight */
  score: number
  result: CombinationResult
}

/** Every unordered pair of the five dosable drugs, at a given dose multiple. */
export function allPairs(doseMultiple = 1): Regimen[] {
  const out: Regimen[] = []
  for (let i = 0; i < DOSABLE_DRUGS.length; i++) {
    for (let j = i + 1; j < DOSABLE_DRUGS.length; j++) {
      const a = DOSABLE_DRUGS[i]
      const b = DOSABLE_DRUGS[j]
      out.push({
        id: `${a}+${b}@${doseMultiple}`,
        label: `${a} + ${b}`,
        doses: [
          { substanceId: a, mg: STANDARD_DOSE_MG[a] * doseMultiple, perDay: 1 },
          { substanceId: b, mg: STANDARD_DOSE_MG[b] * doseMultiple, perDay: 1 },
        ],
      })
    }
  }
  return out
}

export function rankRegimens(
  regimens: Regimen[],
  subject: CombinationSubject,
  opts: CombinationOptions & { safetyWeight?: number } = {},
): RankedCombination[] {
  const w = opts.safetyWeight ?? 0
  return regimens
    .map((regimen) => {
      const result = combinationRule(regimen, subject, opts)
      const adverseBurden = regimenAdverseBurden(regimen)
      return {
        regimen,
        dsbp: result.dsbp,
        ddbp: result.ddbp,
        adverseBurden,
        // harm enters on a mmHg-equivalent scale so the two terms are comparable
        score: result.dsbp - w * adverseBurden * 100,
        result,
      }
    })
    .sort((a, b) => b.score - a.score)
}

/** Apply rules-engine modifiers to the options object. */
export function optionsFromModifiers(
  modifiers: RuleModifiers | undefined,
  calibration?: GlobalCalibration,
): CombinationOptions {
  return { calibration, pdMultipliers: modifiers?.pdMultipliers ?? {} }
}
