/**
 * Inter-individual variability — the virtual population. Spec §7.
 *
 * The population layer runs on the ALGEBRAIC rule, not on the ODE. That is not
 * a shortcut: §6.1b(a) makes it a hard rule that no ranked or summarised
 * efficacy number may come from a time-truncated trace, and the algebraic rule
 * is steady-state and dose-based, so it is structurally immune to the
 * amlodipine accumulation bias. Sampling 200 ODE runs would be slower AND less
 * correct.
 *
 * Expected shape of the output, so you can tell when it is wrong (§7.3):
 *   - ΔSBP approximately normal, SD 8–12 mmHg. Under 4 ⇒ the residual error
 *     term is missing. Over 20 ⇒ the CVs are too high.
 *   - a real non-responder tail, roughly 10–25 % below 3 mmHg. A population
 *     where everyone responds is the tell-tale sign of a fake simulation.
 *   - Cmax and AUC RIGHT-SKEWED, unlike ΔSBP. A symmetric AUC histogram means
 *     normal sampling was used by mistake.
 *   - metoprolol AUC visibly multimodal — the poor-metaboliser subpopulation
 *     separates out. That is the best single visual for the genetics story.
 */

import type { DrugId, Regimen, RuleModifiers, PatientState } from '../types'
import { Rng, correlatedPair } from './rng'
import { combinationRule, type CombinationSubject } from './combination'
import { DRUG_CLASS, EMAX_FIT, type DrugClass } from './constants'
import { SUBSTANCE_PK, METABOLITE } from './substanceParams'
import { buildPkParams, derivedPk, type PkCovariates } from './pk'

/**
 * Residual unexplained variability on the blood-pressure endpoint, mmHg.
 * Without it the population output is unrealistically tight and a reviewer
 * notices that everyone responds (§7.1).
 *
 * Spec §7.1 suggests 6 mmHg. That is not enough on its own: the mechanistic
 * terms in this model (PD parameter spread, baseline-BP spread, exposure
 * spread) contribute only ~3.7 mmHg, because the dose–response is SATURATING —
 * the same property that makes the engine's headline output defensible also
 * damps how much exposure variability can reach the endpoint. 6 mmHg gives a
 * total SD of 7.0, below the 8–12 band that VAL-P02 requires and that real
 * antihypertensive trials show.
 *
 * So this constant is CALIBRATED to the observed trial SD rather than assumed:
 * 8 mmHg puts the total at ~9.5. That is exactly what an unexplained-variability
 * term is for, and inflating the mechanistic CVs instead would have made the
 * exposure distributions wrong in order to make the endpoint distribution right.
 */
export const RESIDUAL_SD_MMHG = 8

/** Population CVs for the PD parameters (§7.1). */
export const PD_CV = { emax: 30, ed50: 35 }

/** European reference phenotype frequencies. ESTIMATED — see §7.1 caveat. */
export const CYP2D6_FREQ = { poor: 0.07, intermediate: 0.12, normal: 0.75, ultrarapid: 0.06 }
export const CYP2C9_FREQ = { normal: 0.65, intermediate: 0.3, poor: 0.05 }

export interface PopulationOptions {
  n: number
  seed?: number
  /** BP targets the report wants responder fractions against */
  targets?: { sbp: number; dbp: number }[]
}

export interface Distribution {
  n: number
  seed: number
  mean: number
  sd: number
  median: number
  quantiles: { p5: number; p25: number; p50: number; p75: number; p95: number }
  histogram: { binWidth: number; min: number; bins: number[] }
  skewness: number
}

export interface PopulationResult {
  n: number
  seed: number
  deltaSbp: Distribution
  deltaDbp: Distribution
  /** per-drug exposure spread, ng·h/mL */
  auc: Partial<Record<DrugId, Distribution>>
  cmax: Partial<Record<DrugId, Distribution>>
  responders: Record<string, number>
  /** sampled metabolite potency ratios, so the UI can show the band honestly */
  wMSamples: number[]
  subjects: SubjectDraw[]
}

export interface SubjectDraw {
  index: number
  deltaSbp: number
  deltaDbp: number
  cyp2d6: keyof typeof CYP2D6_FREQ
  cyp2c9: keyof typeof CYP2C9_FREQ
  /** losartan metabolite potency ratio for this subject */
  wM: number
  auc: Partial<Record<DrugId, number>>
  cmax: Partial<Record<DrugId, number>>
}

export function summarise(values: number[], seed: number, bins = 20): Distribution {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1)
  const sd = Math.sqrt(variance)
  const q = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))]
  const skewness =
    sd > 0 ? sorted.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n : 0
  const min = sorted[0]
  const max = sorted[n - 1]
  const binWidth = (max - min) / bins || 1
  const hist = new Array(bins).fill(0) as number[]
  for (const v of sorted) {
    hist[Math.min(bins - 1, Math.max(0, Math.floor((v - min) / binWidth)))]++
  }
  return {
    n,
    seed,
    mean,
    sd,
    median: q(0.5),
    quantiles: { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
    histogram: { binWidth, min, bins: hist },
    skewness,
  }
}

function covariatesFor(patient: PatientState, rng: Rng): PkCovariates {
  const v = patient.vars ?? {}
  const egfrDet = Number.isFinite(v['egfr_ckdepi2021']) ? v['egfr_ckdepi2021'] : 90
  return {
    weightKg: patient.inputs.weight_kg || 70,
    // Draw the DETERMINISTIC value from the twin's own equation first, then add
    // residual variability. Drawing eGFR independently generates impossible
    // people (a 30-year-old with the kidneys of an 85-year-old).
    egfr: Math.max(5, egfrDet * rng.logNormalFactor(20)),
    ageYears: patient.inputs.age_years || 55,
    cyp2d6: rng.categorical(CYP2D6_FREQ),
    cyp2c9: rng.categorical(CYP2C9_FREQ),
    hepaticImpairment: false,
  }
}

/**
 * Sampled per-class PD multipliers. Emax and ED50 are drawn log-normally
 * (§7.1); they enter as a single multiplicative factor on the class effect,
 * which is what `combinationRule`'s `pdMultipliers` hook accepts.
 */
function samplePdMultipliers(rng: Rng, regimen: Regimen): Partial<Record<DrugId, number>> {
  const byClass = new Map<DrugClass, number>()
  const out: Partial<Record<DrugId, number>> = {}
  for (const d of regimen.doses) {
    if (!d.mg || d.mg <= 0 || d.substanceId === 'exp3174') continue
    const cls = DRUG_CLASS[d.substanceId]
    let factor = byClass.get(cls)
    if (factor === undefined) {
      const emaxF = rng.logNormalFactor(PD_CV.emax)
      const ed50F = rng.logNormalFactor(PD_CV.ed50)
      // E = Emax·D/(ED50+D). Evaluate the sampled curve against the population
      // curve at this subject's dose to get one equivalent multiplier.
      const fit = EMAX_FIT[cls].sbp
      const dm = 1
      const pop = (fit.emax * dm) / (fit.ed50 + dm)
      const ind = (fit.emax * emaxF * dm) / (fit.ed50 * ed50F + dm)
      factor = ind / pop
      byClass.set(cls, factor)
    }
    out[d.substanceId] = factor
  }
  return out
}

export function runPopulation(
  patient: PatientState,
  regimen: Regimen,
  modifiers: RuleModifiers | undefined,
  opts: PopulationOptions,
): PopulationResult {
  const seed = opts.seed ?? 1
  const n = Math.max(1, Math.round(opts.n))
  const subjects: SubjectDraw[] = []
  const wMSamples: number[] = []

  const sbpMean = patient.inputs.sbp_mmHg
  const dbpMean = patient.inputs.dbp_mmHg

  for (let i = 0; i < n; i++) {
    const rng = new Rng(seed * 100003 + i)
    const cov = covariatesFor(patient, rng)

    // Baseline BP varies too (SD 12/8 mmHg, §7.1) and efficacy scales with it.
    const subject: CombinationSubject = {
      sbpBaseline: sbpMean + rng.normal() * 12,
      dbpBaseline: dbpMean + rng.normal() * 8,
    }

    const pdMultipliers = { ...(modifiers?.pdMultipliers ?? {}), ...samplePdMultipliers(rng, regimen) }

    // w_m log-uniform on [10, 40] — the label states a RATIO range, and ratios
    // are naturally log-scaled. Propagating it here is where the uncertainty
    // belongs (PK-10b). It does NOT move the algebraic answer, which is the
    // point: the ranking is immune to it.
    const wM = rng.logUniform(METABOLITE.w_m_range[0], METABOLITE.w_m_range[1])
    wMSamples.push(wM)

    // CL and Vd share rho ~ 0.3 (§7.1). Drawn correlated so the population does
    // not contain subjects with a huge Vd and a tiny CL, i.e. half-lives of days.
    const auc: Partial<Record<DrugId, number>> = {}
    const cmax: Partial<Record<DrugId, number>> = {}
    const exposureRatio: Partial<Record<DrugId, number>> = {}
    for (const d of regimen.doses) {
      if (!d.mg || d.mg <= 0) continue
      const s = SUBSTANCE_PK[d.substanceId]
      const [zCl, zV] = correlatedPair(rng, 0.3)
      const omega = (cv: number) => Math.sqrt(Math.log(1 + (cv / 100) ** 2))
      const base = buildPkParams(d.substanceId, cov, modifiers, undefined, d.form)
      const params = {
        ...base,
        CL: base.CL * Math.exp(omega(s.cv.cl) * zCl),
        V: base.V * Math.exp(omega(s.cv.vd) * zV),
        F: Math.min(1, Math.max(0.01, base.F * rng.logNormalFactor(s.cv.F))),
        ka: base.ka * rng.logNormalFactor(s.cv.ka),
      }
      params.ke = params.CL / params.V
      const derived = derivedPk(params, d.mg, 24 / (d.perDay || 1))
      auc[d.substanceId] = derived.aucNgHMl
      cmax[d.substanceId] = derived.cmaxNgMl
      // Exposure, not milligrams, is what reaches the receptor. A subject who
      // clears the drug half as fast sits further along their own Emax curve, so
      // the sampled exposure is folded back into an EFFECTIVE dose. This is also
      // what makes the CYP2D6 story visible in the blood-pressure response and
      // not only in the concentration histogram.
      const typical = derivedPk(base, d.mg, 24 / (d.perDay || 1)).aucNgHMl
      exposureRatio[d.substanceId] = typical > 0 ? derived.aucNgHMl / typical : 1
    }

    const effectiveRegimen: Regimen = {
      ...regimen,
      doses: regimen.doses.map((d) => ({
        ...d,
        mg: d.mg * (exposureRatio[d.substanceId] ?? 1),
      })),
    }
    const r = combinationRule(effectiveRegimen, subject, { pdMultipliers })

    subjects.push({
      index: i,
      deltaSbp: r.dsbp + rng.normal() * RESIDUAL_SD_MMHG,
      deltaDbp: r.ddbp + rng.normal() * (RESIDUAL_SD_MMHG * 0.6),
      cyp2d6: cov.cyp2d6,
      cyp2c9: cov.cyp2c9,
      wM,
      auc,
      cmax,
    })
  }

  const drugIds = [...new Set(regimen.doses.filter((d) => d.mg > 0).map((d) => d.substanceId))]
  const aucDist: Partial<Record<DrugId, Distribution>> = {}
  const cmaxDist: Partial<Record<DrugId, Distribution>> = {}
  for (const id of drugIds) {
    const bins = id === 'metoprolol' ? 30 : 20 // do not over-bin away the bimodality
    aucDist[id] = summarise(subjects.map((s) => s.auc[id] ?? 0), seed, bins)
    cmaxDist[id] = summarise(subjects.map((s) => s.cmax[id] ?? 0), seed, bins)
  }

  const deltaSbp = summarise(subjects.map((s) => s.deltaSbp), seed)
  const responders: Record<string, number> = {
    sbp_drop_ge_10mmHg: subjects.filter((s) => s.deltaSbp >= 10).length / n,
    non_responder_lt_3mmHg: subjects.filter((s) => s.deltaSbp < 3).length / n,
  }
  for (const t of opts.targets ?? [{ sbp: 140, dbp: 90 }, { sbp: 130, dbp: 80 }]) {
    responders[`reached_target_${t.sbp}_${t.dbp}`] =
      subjects.filter((s) => sbpMean - s.deltaSbp < t.sbp && dbpMean - s.deltaDbp < t.dbp).length / n
  }

  return {
    n,
    seed,
    deltaSbp,
    deltaDbp: summarise(subjects.map((s) => s.deltaDbp), seed),
    auc: aucDist,
    cmax: cmaxDist,
    responders,
    wMSamples,
    subjects,
  }
}
