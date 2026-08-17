/**
 * The orchestrating run loop. Spec §9.
 *
 * Consumes a SimRequest, emits EffectFrames, returns a RunSummary.
 * Pure and synchronous — no worker, no DOM, no fetch. worker.ts wraps it.
 */

import type {
  DrugId,
  EffectFrame,
  RunSummary,
  SimRequest,
  PatientState,
  Regimen,
  RuleModifiers,
} from '../types'
import {
  buildDoseHistory,
  buildPkParams,
  concentrationAt,
  exp3174ConcentrationAt,
  drugsInRegimen,
  formForDrug,
  losartanFmScale,
  type DrugPkParams,
  type DoseEvent,
  type PkCovariates,
} from './pk'
import { computeEngagement, effectSiteDerivative, type Engagement } from './pd'
import {
  deriveBaseline,
  initialState,
  haemodynamics,
  rk4Step,
  applyGuards,
  isDiverged,
  calibratePathwayGains,
  solveSteadyState,
  NO_FLAGS,
  type CvState,
  type CvBaseline,
  type OdeDrugInput,
  type GuardFlags,
} from './homeostasis'
import { raasPathwayOccupancy } from './pd'
import { assembleFrame, defaultFrameBaselines, type FrameBaselines, type LabState } from './frame'
import { combinationRule, optionsFromModifiers } from './combination'
import { LAB_GAINS, LAB_TAU, CYP2D6_CL_FACTOR, REF1, STANDARD_DOSE_MG } from './constants'
import { METABOLITE } from './substanceParams'
import { Rng } from './rng'
import { runPopulation, type PopulationResult } from './population'

export class IntegratorDiverged extends Error {
  constructor(public step: number) {
    super(`integrator_diverged at step ${step}`)
    this.name = 'IntegratorDiverged'
  }
}

export interface RunExtras {
  /** metabolite potency ratio in use; default the central 20 (spec §3.4a) */
  wM?: number
  /** log every algebraic-vs-ODE disagreement for VAL-14 */
  onDiagnostics?: (d: RunDiagnostics) => void
}

export interface RunDiagnostics {
  algebraicDeltaSbp: number
  algebraicDeltaDbp: number
  odeDeltaSbp: number
  odeDeltaDbp: number
  /** the single scalar applied to the BP trace so the reported numbers are the
   *  authoritative algebraic ones (spec §5.4 reconciliation note) */
  reconciliationScaleSbp: number
  reconciliationScaleDbp: number
  pathwayGains: ReturnType<typeof calibratePathwayGains>
  extrapolated: boolean
  beyondPairEvidence: boolean
  /**
   * Means over the FINAL 24 simulated hours. Every published endpoint the engine
   * is validated against is a clinic measurement at an unspecified point in the
   * dosing interval, so an interval mean is the honest comparator — and it is
   * far more stable than the value at whatever instant the run happened to end,
   * which for a twice-daily drug is a trough.
   */
  meanLast24h: { sbp: number; dbp: number; hr: number; cardiacOutput: number }
}

function covariatesFrom(patient: PatientState): PkCovariates {
  const v = patient.vars ?? {}
  const egfr = Number.isFinite(v['egfr_ckdepi2021']) ? v['egfr_ckdepi2021'] : 90
  return {
    weightKg: patient.inputs.weight_kg || REF1.weight_kg,
    egfr,
    ageYears: patient.inputs.age_years || REF1.age_years,
    cyp2d6: (patient.inputs.cyp2d6 ?? 'normal') as keyof typeof CYP2D6_CL_FACTOR,
    cyp2c9: (patient.inputs.cyp2c9 ?? 'normal') as 'normal' | 'intermediate' | 'poor',
    hepaticImpairment: (patient.inputs.comorbidities ?? []).some((c) =>
      /hepatic|liver|cirrhos/i.test(c),
    ),
  }
}

function airwaySensitivityFrom(patient: PatientState): number {
  const c = (patient.inputs.comorbidities ?? []).join(' ').toLowerCase()
  // Asthma and COPD are kept as DISTINCT values, never averaged (CM-21):
  // asthma −6.9 % FEV1 with a CI not crossing zero; COPD −2.05 % with a CI that
  // does. Genuinely different populations.
  if (/asthma/.test(c)) return 1.0
  if (/copd/.test(c)) return 0.6
  return 0
}

function baselineFrom(patient: PatientState): CvBaseline {
  const v = patient.vars ?? {}
  return deriveBaseline({
    sbp: patient.inputs.sbp_mmHg || REF1.sbp,
    dbp: patient.inputs.dbp_mmHg || REF1.dbp,
    hr: patient.inputs.hr_bpm || (Number.isFinite(v['heart_rate_bpm']) ? v['heart_rate_bpm'] : REF1.hr),
    co: Number.isFinite(v['cardiac_output_L_min']) ? v['cardiac_output_L_min'] : REF1.co,
    cvp: Number.isFinite(v['cvp_mmHg']) ? v['cvp_mmHg'] : REF1.cvp,
  })
}

export interface RunResult {
  frames: EffectFrame[]
  summary: RunSummary
  diagnostics: RunDiagnostics
  /** present only when options.populationN > 1 */
  population?: PopulationResult
}

/**
 * Run one acute simulation.
 * `onFrame` is called for every emitted frame so a worker can stream without
 * buffering the whole trace.
 */
export function runSimulationSync(
  req: SimRequest,
  onFrame?: (f: EffectFrame) => void,
  extras: RunExtras = {},
): RunResult {
  const { patient, regimen, modifiers, options } = req
  const gains = calibratePathwayGains()
  const cov = covariatesFrom(patient)
  const cvb = baselineFrom(patient)
  const wM = extras.wM ?? METABOLITE.w_m_central

  const drugs = drugsInRegimen(regimen)
  const pk: Partial<Record<DrugId, DrugPkParams>> = {}
  for (const id of drugs) pk[id] = buildPkParams(id, cov, modifiers, undefined, formForDrug(regimen, id))

  const horizon = Math.max(1, options.horizonHours)
  const doses: DoseEvent[] = buildDoseHistory(regimen, options.initial, horizon)
  const fmScale = losartanFmScale(patient)

  // HCTZ is DOSE-driven, never concentration-driven (§00-DECISIONS §10.5).
  let hctzDailyMg = 0
  let amlodipineDoseMg = 0
  for (const d of regimen.doses) {
    if (d.substanceId === 'hydrochlorothiazide') hctzDailyMg += d.mg * (d.perDay || 1)
    if (d.substanceId === 'amlodipine') amlodipineDoseMg = d.mg
  }

  const frameBase: FrameBaselines = defaultFrameBaselines(patient.vars ?? {}, patient.inputs, {
    airwaySensitivity: airwaySensitivityFrom(patient),
    cyp2d6CapacityFold: CYP2D6_CL_FACTOR[cov.cyp2d6] ?? 1,
    amlodipineDoseMg,
  })

  // Δt = 1 minute, always.
  // The spec suggests relaxing to 5 min beyond 7 days on the grounds that the
  // 2-minute heart-rate dynamics stop being interesting. They stop being
  // interesting but they do not stop being STIFF: dt/tau_HR = 2.5 sits past
  // RK4's stability limit for this system, and the first build of this file
  // duly produced a "steady state" with amlodipine RAISING blood pressure by
  // 14 mmHg. A 14-day run at 1 min is 20 160 cheap steps. Not worth the risk.
  const dtH = 1 / 60
  const nSteps = Math.round(horizon / dtH)
  const emitEvery = Math.max(1, Math.round(options.outputEveryMin / (dtH * 60)))

  let st: CvState = initialState(cvb)
  const ce: Partial<Record<DrugId, number>> = {}
  for (const id of drugs) ce[id] = 0
  const labs: LabState = { dK: 0, dNa: 0, dUrate: 0 }
  const flags: GuardFlags = { ...NO_FLAGS }
  let hctzOnset = options.initial === 'steady_state' ? 1 : 0

  const pdMul = modifiers?.pdMultipliers ?? {}

  // --- steady-state pre-convergence ---------------------------------------
  // The DEFAULT. Drug history is pre-loaded to convergence by superposition and
  // the ODE states are pre-converged, so the display window shows ongoing
  // therapy rather than a truncated first-dose transient. Without this a 24 h
  // run represents four of the five drugs correctly and amlodipine at ~35 % of
  // its chronic exposure — a SELECTIVE distortion that silently biases the
  // combination ranking against amlodipine (spec §6.1b, FM-08b).
  // Steady-state PK is exact by superposition (the dose history is pre-loaded to
  // ten half-lives), so only the effect compartments and the ODE states need
  // initialising. Both are done WITHOUT a long integration:
  //   - effect compartments: integrated forward over the 7 days before t = 0,
  //     which is >= 10 equilibration half-lives for every drug in the set;
  //   - ODE states: set to the EXACT steady state for the dosing-interval-average
  //     engagement, via the 1-D root solve in homeostasis.ts.
  // This replaced a 21-day integrated warm-up, which is both slower and, at any
  // step size large enough to be worth doing, numerically unstable.
  if (options.initial === 'steady_state') {
    const preH = 7 * 24
    const preSteps = Math.round(preH / dtH)
    for (let i = 0; i < preSteps; i++) evaluate(-preH + i * dtH, dtH)

    // average engagement over one dosing interval
    const interval = 24
    const samples = 96
    const acc = { ace: 0, at1: 0, urat1: 0, cav12: 0, ncc: 0, beta1: 0 }
    const ceSnapshot = { ...ce }
    for (let i = 0; i < samples; i++) {
      const e = evaluate(-interval + (i * interval) / samples, interval / samples)
      acc.ace += e.ace / samples
      acc.at1 += e.at1 / samples
      acc.urat1 += e.urat1 / samples
      acc.cav12 += e.cav12 / samples
      acc.ncc += e.ncc / samples
      acc.beta1 += e.beta1 / samples
    }
    Object.assign(ce, ceSnapshot)

    const avgInput = odeInput(
      { ...acc, beta2: 0, selectivityRatio: 1, selectivityLost: false, metoprololCe: 0 },
      gains,
    )
    st = solveSteadyState(cvb, avgInput).state
    // guards apply to the initial state too — a regimen severe enough to breach
    // the floor must be clamped from frame zero, not from frame one (FM-03)
    st = applyGuards(st, cvb, flags)
    labs.dK =
      LAB_GAINS.k_from_ace * acc.ace +
      LAB_GAINS.k_from_at1 * acc.at1 +
      LAB_GAINS.k_from_ncc * acc.ncc
    labs.dNa = LAB_GAINS.na_from_ncc * acc.ncc
    labs.dUrate = LAB_GAINS.urate_from_ncc * acc.ncc + LAB_GAINS.urate_from_urat1 * acc.urat1
  }

  const frames: EffectFrame[] = []
  const peak: Partial<Record<DrugId, number>> = {}
  const trough: Partial<Record<DrugId, number>> = {}
  const hazardPeak: Record<string, number> = {}

  let lastEngagement: Engagement | null = null
  let lastFrame: EffectFrame | null = null

  for (let i = 0; i <= nSteps; i++) {
    const t = i * dtH
    const eng = evaluate(t, dtH)
    lastEngagement = eng

    if (i % emitEvery === 0 || i === nSteps) {
      const h = haemodynamics(st, cvb)
      const conc = concSnapshot(t)
      for (const id of drugs) {
        const c = conc[id] ?? 0
        peak[id] = Math.max(peak[id] ?? 0, c)
        trough[id] = trough[id] === undefined ? c : Math.min(trough[id]!, c)
      }
      const frame = assembleFrame({
        tHours: t,
        conc,
        engagement: eng,
        state: st,
        haemo: h,
        baseline: cvb,
        base: frameBase,
        labs,
        flags,
      })
      for (const [k, v] of Object.entries(frame.hazards)) {
        hazardPeak[k] = Math.max(hazardPeak[k] ?? 0, v)
      }
      frames.push(frame)
      lastFrame = frame
      onFrame?.(frame)
    }

    if (i === nSteps) break
    st = rk4Step(st, dtH, cvb, odeInput(eng, gains))
    st = applyGuards(st, cvb, flags)
    if (isDiverged(st, cvb)) throw new IntegratorDiverged(i)
  }

  // --- reconciliation ------------------------------------------------------
  // The algebraic rule of §4 is AUTHORITATIVE for reported numbers; the ODE is
  // authoritative for shape and organ state. Both are logged (VAL-14 asserts the
  // unscaled disagreement stays under 2.0 mmHg).
  const algebraic = combinationRule(
    regimen,
    { sbpBaseline: cvb.sbp0, dbpBaseline: cvb.dbp0 },
    optionsFromModifiers(modifiers),
  )
  const mean = meanOverLast24h(frames, horizon)
  const odeDsbp = cvb.sbp0 - mean.sbp
  const odeDdbp = cvb.dbp0 - mean.dbp
  const diagnostics: RunDiagnostics = {
    algebraicDeltaSbp: algebraic.dsbp,
    algebraicDeltaDbp: algebraic.ddbp,
    odeDeltaSbp: odeDsbp,
    odeDeltaDbp: odeDdbp,
    reconciliationScaleSbp: algebraic.dsbp / Math.max(0.1, odeDsbp),
    reconciliationScaleDbp: algebraic.ddbp / Math.max(0.1, odeDdbp),
    pathwayGains: gains,
    extrapolated: algebraic.extrapolated,
    beyondPairEvidence: algebraic.beyondPairEvidence,
    meanLast24h: mean,
  }
  extras.onDiagnostics?.(diagnostics)

  const summary: RunSummary = {
    deltaSbp: algebraic.dsbp,
    deltaDbp: algebraic.ddbp,
    peakConc: peak,
    troughConc: trough,
    hazards: hazardPeak,
    finalChem: lastFrame
      ? lastFrame.chem
      : {
          plasma_volume: frameBase.plasmaVolume,
          ecf_volume: frameBase.ecfVolume,
          serum_k: frameBase.serumK,
          serum_na: frameBase.serumNa,
          serum_urate: frameBase.serumUrate,
          serum_creatinine: frameBase.serumCreatinine,
          fasting_glucose: frameBase.fastingGlucose,
        },
    framesEmitted: frames.length,
  }

  // Virtual population. Runs on the ALGEBRAIC rule, never on the time trace —
  // see population.ts and spec §6.1b(a).
  let population: PopulationResult | undefined
  if ((options.populationN ?? 1) > 1) {
    population = runPopulation(patient, regimen, modifiers, {
      n: options.populationN as number,
      seed: options.seed,
    })
    summary.deltaSbp = population.deltaSbp.mean
    summary.deltaDbp = population.deltaDbp.mean
    summary.deltaSbpP05 = population.deltaSbp.quantiles.p5
    summary.deltaSbpP95 = population.deltaSbp.quantiles.p95
  }

  return { frames, summary, diagnostics, population }

  // -------------------------------------------------------------------------

  function concSnapshot(t: number): Record<DrugId, number> {
    const out = {
      lisinopril: 0,
      losartan: 0,
      exp3174: 0,
      amlodipine: 0,
      hydrochlorothiazide: 0,
      metoprolol: 0,
    } as Record<DrugId, number>
    for (const id of drugs) {
      const p = pk[id]
      if (!p) continue
      if (id === 'exp3174') {
        const parent = pk.losartan
        if (parent) out.exp3174 = exp3174ConcentrationAt(doses, parent, p, t, fmScale) * 1e6
      } else {
        out[id] = concentrationAt(doses, p, t) * 1e6
      }
    }
    return out
  }

  /** advance the effect compartments and slow lab channels, then read engagement */
  function evaluate(t: number, dt: number): Engagement {
    const conc = concSnapshot(t)
    for (const id of drugs) {
      const p = pk[id]
      if (!p) continue
      const cur = ce[id] ?? 0
      // RK2 (midpoint) on the link compartment — plenty at dt = 1 min against
      // the fastest k_e0 of 1.4 h⁻¹.
      const k1 = effectSiteDerivative(conc[id], cur, p.ke0)
      const k2 = effectSiteDerivative(conc[id], cur + (dt / 2) * k1, p.ke0)
      ce[id] = Math.max(0, cur + dt * k2)
    }
    if (hctzDailyMg > 0 && hctzOnset < 1) {
      // ramp with the same k_e0 the drug carries, so first_dose runs show an
      // onset rather than a step at t = 0
      hctzOnset = Math.min(1, hctzOnset + dt * 0.5 * (1 - hctzOnset) * 2)
    }
    const eng = computeEngagement({
      ce,
      hctzDailyMg,
      hctzOnsetFraction: hctzDailyMg > 0 ? hctzOnset : 0,
      wM,
      pdMultipliers: pdMul,
    })
    advanceLabs(eng, dt)
    return eng
  }

  function advanceLabs(e: Engagement, dt: number) {
    const targetK =
      LAB_GAINS.k_from_ace * e.ace + LAB_GAINS.k_from_at1 * e.at1 + LAB_GAINS.k_from_ncc * e.ncc
    const targetNa = LAB_GAINS.na_from_ncc * e.ncc
    // Losartan LOWERS urate and HCTZ raises it — opposite signs that partially
    // cancel. That is the mechanism behind the losartan/HCTZ combination product
    // and it falls out of the sum for free (VAL-08b).
    const targetUrate = LAB_GAINS.urate_from_ncc * e.ncc + LAB_GAINS.urate_from_urat1 * e.urat1
    labs.dK += (dt / LAB_TAU.k) * (targetK - labs.dK)
    labs.dNa += (dt / LAB_TAU.na) * (targetNa - labs.dNa)
    labs.dUrate += (dt / LAB_TAU.urate) * (targetUrate - labs.dUrate)
  }
}

function meanOverLast24h(
  frames: EffectFrame[],
  horizon: number,
): { sbp: number; dbp: number; hr: number; cardiacOutput: number } {
  const from = Math.max(0, horizon - 24)
  const window = frames.filter((f) => f.t_h >= from)
  const use = window.length > 0 ? window : frames
  if (use.length === 0) return { sbp: 0, dbp: 0, hr: 0, cardiacOutput: 0 }
  let sbp = 0
  let dbp = 0
  let hr = 0
  let co = 0
  for (const f of use) {
    sbp += f.haemo.sbp
    dbp += f.haemo.dbp
    hr += f.haemo.hr
    co += f.haemo.cardiac_output
  }
  return {
    sbp: sbp / use.length,
    dbp: dbp / use.length,
    hr: hr / use.length,
    cardiacOutput: co / use.length,
  }
}

function odeInput(e: Engagement, gains: ReturnType<typeof calibratePathwayGains>): OdeDrugInput {
  return {
    raas: raasPathwayOccupancy(
      Math.min(1, gains.ace * e.ace),
      Math.min(1, gains.at1 * e.at1),
    ),
    ltype: Math.min(1, gains.ltype * e.cav12),
    ncc: Math.min(1, gains.ncc * e.ncc),
    b1: Math.min(1, gains.b1 * e.beta1),
    ace: e.ace,
    at1: e.at1,
  }
}

/** Convenience: a REF-1-like patient for tests and for UI defaults. */
export function referencePatient(overrides: Partial<PatientState['inputs']> = {}): PatientState {
  return {
    inputs: {
      age_years: REF1.age_years,
      sex: REF1.sex,
      weight_kg: REF1.weight_kg,
      height_cm: REF1.height_cm,
      sbp_mmHg: REF1.sbp,
      dbp_mmHg: REF1.dbp,
      hr_bpm: REF1.hr,
      serum_creatinine_mg_dl: REF1.serum_creatinine,
      comorbidities: [],
      cyp2d6: 'normal',
      cyp2c9: 'normal',
      ...overrides,
    },
    vars: {
      heart_rate_bpm: REF1.hr,
      cardiac_output_L_min: REF1.co,
      cvp_mmHg: REF1.cvp,
      egfr_ckdepi2021: REF1.egfr,
      egfr_absolute_mL_min: REF1.egfr,
      serum_k_mmol_L: REF1.serum_k,
      serum_na_mmol_L: REF1.serum_na,
      serum_urate_mg_dL: REF1.serum_urate,
      scr_mg_dL: REF1.serum_creatinine,
      fasting_glucose_mg_dL: REF1.fasting_glucose,
      plasma_volume_L: 3.0,
      ecf_L: 14,
      fev1_pct_predicted: 100,
      renal_blood_flow_mL_min: 1200,
      filtration_fraction: 0.2,
    },
    appliedPresets: [],
    warnings: [],
  }
}

export const NO_MODIFIERS: RuleModifiers = {
  hits: [],
  blocked: false,
  blockReasons: [],
  pkMultipliers: {},
  pdMultipliers: {},
  stateShifts: {},
  doseCaps: {},
  phenoconversions: {},
}

/** Build a one-or-two drug regimen at a dose multiple of the standard dose. */
export function makeRegimen(
  spec: { drugId: DrugId; doseMultiple?: number; mg?: number; perDay?: number }[],
  label?: string,
): Regimen {
  return {
    id: spec.map((s) => `${s.drugId}:${s.mg ?? s.doseMultiple ?? 1}`).join('+'),
    label: label ?? spec.map((s) => s.drugId).join(' + '),
    doses: spec.map((s) => ({
      substanceId: s.drugId,
      mg: s.mg ?? STANDARD_DOSE_MG[s.drugId] * (s.doseMultiple ?? 1),
      perDay: s.perDay ?? 1,
    })),
  }
}

/** Reusable seeded RNG factory so population runs stay reproducible (VAL-15). */
export function rngFor(seed: number | undefined, subjectIndex: number): Rng {
  return new Rng((seed ?? 1) * 100003 + subjectIndex)
}
