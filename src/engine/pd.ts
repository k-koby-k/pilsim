/**
 * Layer B — pharmacodynamics: effect-site concentration → target engagement.
 *
 * ⚠️⚠️ EVERY EC50 IN THIS FILE IS ANCHORED TO A CLINICAL QUANTITY. ⚠️⚠️
 *
 * Two admissible sources, and no others:
 *   (1) a LABEL-STATED concentration–effect relationship (metoprolol beta1: the
 *       Lopressor label gives exercise-heart-rate effect at 30 and 540 nmol/L,
 *       which solves to EC50 = 24 ng/mL with Hill ≈ 1); or
 *   (2) BACK-SOLVED from the therapeutic concentration range: EC50 is chosen so
 *       that occupancy at the standard dose's steady-state AVERAGE concentration
 *       equals the target in constants.OCCUPANCY_TARGET.
 *
 * NEVER an in-vitro IC50 / Ki / Kd. ChEMBL puts lisinopril's ACE IC50 at
 * 1.2–4.7 nM; therapeutic plasma lisinopril after 20 mg peaks near 140–200 nM.
 * Substituting the binding constant makes the model 99.97 % saturated at every
 * therapeutic dose, flattens the dose–response, and makes "half a tablet" and
 * "four tablets" indistinguishable — which destroys the product's headline
 * output. See spec §1. Construction (2) makes that error structurally
 * impossible: the anchor IS the therapeutic range.
 */

import type { DrugId } from '../types'
import {
  OCCUPANCY_TARGET,
  METOPROLOL_EC50_B1_NG_ML,
  METOPROLOL_RHO_SEL,
  METOPROLOL_BETA2_CROSSOVER_NG_ML,
  STANDARD_DOSE_MG,
} from './constants'
import { METABOLITE, SUBSTANCE_PK } from './substanceParams'
import { apparentVolumeScale, type DrugPkParams } from './pk'

/** Hill-1 occupancy. h = 1 throughout (spec §5.3). */
export function hill(c: number, ec50: number, thetaMax = 1): number {
  if (c <= 0) return 0
  return (thetaMax * c) / (ec50 + c)
}

/**
 * Back-solve EC50 from a target occupancy at a known concentration.
 * theta = C/(EC50 + C)  ⇒  EC50 = C·(1 − theta)/theta
 */
export function ec50FromTarget(concAtTarget: number, targetTheta: number): number {
  return (concAtTarget * (1 - targetTheta)) / targetTheta
}

/**
 * Steady-state average concentration for a once-daily standard dose, ng/mL,
 * computed from the reference PK parameters. C_avg = F·D/(CL·tau).
 * This is the anchor concentration for construction (2) above.
 */
export function referenceCavgNgMl(id: DrugId, doseMg: number, perDay = 1): number {
  const s = SUBSTANCE_PK[id]
  const scale = apparentVolumeScale(id)
  const ke = Math.LN2 / s.half_life_h
  const CL = ke * s.vd_l * scale
  const tau = 24 / perDay
  return ((s.F * doseMg) / (CL * tau)) * 1e6
}

/** EXP3174 steady-state average, ng/mL, from a losartan dose. */
export function referenceCavgExp3174(losartanMg: number, perDay = 1): number {
  const m = SUBSTANCE_PK.exp3174
  const scale = apparentVolumeScale('exp3174')
  const ke = Math.LN2 / m.half_life_h
  const CL = ke * m.vd_l * scale
  const tau = 24 / perDay
  const formedMg = (METABOLITE.f_m * losartanMg * m.mw) / SUBSTANCE_PK.losartan.mw
  return ((formedMg / (CL * tau)) * 1e6)
}

// ---------------------------------------------------------------------------
// EC50 table, solved once at module load. All ng/mL.
// ---------------------------------------------------------------------------

function solveEc50s() {
  // Lisinopril → plasma ACE. Target 0.80 at 20 mg once daily.
  const aceCavg = referenceCavgNgMl('lisinopril', STANDARD_DOSE_MG.lisinopril, 1)
  const ace = ec50FromTarget(aceCavg, OCCUPANCY_TARGET.ace)

  // AT1: driven by losartan PARENT + w_m x EXP3174 (spec §3.4). Target 0.85 at
  // 50 mg. Note the check at 100 mg: doubling C gives 0.919 against Agent F's
  // 0.90 target — the single Hill-1 EC50 reproduces both points, so no second
  // parameter is needed.
  const lp = referenceCavgNgMl('losartan', STANDARD_DOSE_MG.losartan, 1)
  const lm = referenceCavgExp3174(STANDARD_DOSE_MG.losartan, 1)
  const at1Anchor = lp + METABOLITE.w_m_central * lm
  const at1 = ec50FromTarget(at1Anchor, OCCUPANCY_TARGET.at1)

  // URAT1: driven by losartan PARENT ONLY. This is what makes it peak at the
  // parent's Tmax ≈ 1 h while at1_blockade peaks at ≈ 3.5 h. That 2.5 h
  // dissociation is real, sourced, and the most interesting single frame in the
  // losartan animation (EN-04). Target 0.30 at 50 mg, calibrated so
  // Δurate = −0.29 mg/dL (VAL-08).
  const urat1 = ec50FromTarget(lp, OCCUPANCY_TARGET.urat1)

  // Amlodipine → vascular L-type Cav1.2. Target 0.50 at 5 mg, consistent with
  // the CCB ED50 ≈ 0.98x standard: amlodipine at 5 mg genuinely sits near
  // half-maximal, which is why it is the one drug where escalation pays.
  const cavCavg = referenceCavgNgMl('amlodipine', STANDARD_DOSE_MG.amlodipine, 1)
  const cav12 = ec50FromTarget(cavCavg, OCCUPANCY_TARGET.cav12)

  return { ace, at1, urat1, cav12 }
}

export const EC50_NG_ML = {
  ...solveEc50s(),
  /** LABEL-SOURCED, not back-fitted. See constants.METOPROLOL_EC50_B1_NG_ML. */
  beta1: METOPROLOL_EC50_B1_NG_ML,
  /** rho_sel DERIVED from a sourced occupancy target pair, not assumed. */
  beta2: METOPROLOL_EC50_B1_NG_ML * METOPROLOL_RHO_SEL,
}

/**
 * ⚠️ HCTZ IS DRIVEN BY DOSE, NOT BY PLASMA CONCENTRATION.
 *
 * Its action is tubular — it is secreted into the proximal tubule and acts from
 * the luminal side on the distal convoluted tubule NCC. NO plasma
 * concentration–effect relationship exists for hydrochlorothiazide, and
 * inventing one would be a fabrication that happens to look plausible on a
 * chart. (research/00-DECISIONS.md §10.5.)
 *
 * Dose-based Emax, anchored so ncc_inhibition = 0.45 at 25 mg/day
 * (constants.OCCUPANCY_TARGET.ncc), consistent with the fitted thiazide
 * ED50 ≈ 0.31 x standard. The plasma concentration is still COMPUTED and
 * emitted in `conc.hydrochlorothiazide` — it is real PK and the UI may plot it —
 * it simply does not drive the effect.
 */
export const HCTZ_DOSE_EC50_MG = ec50FromTarget(
  STANDARD_DOSE_MG.hydrochlorothiazide,
  OCCUPANCY_TARGET.ncc,
)

export function nccInhibitionFromDose(mgPerDay: number): number {
  return hill(mgPerDay, HCTZ_DOSE_EC50_MG)
}

// ---------------------------------------------------------------------------
// Effect compartment — spec §3.4b. dCe/dt = k_e0·(C_plasma − Ce).
//
// MANDATORY. Lisinopril's PD onset is ~1 h; its plasma Tmax is ~7 h. Effect
// PRECEDES peak concentration. A direct-effect model cannot reproduce that
// ordering at all: plot concentration against effect and the real drug gives a
// counter-clockwise hysteresis loop where a direct model gives a straight line.
// Invisible until someone plots it — which is why PD-18 exists.
// ---------------------------------------------------------------------------

export function effectSiteDerivative(cPlasma: number, ce: number, ke0: number): number {
  return ke0 * (cPlasma - ce)
}

// ---------------------------------------------------------------------------
// Engagement assembly
// ---------------------------------------------------------------------------

export interface EngagementInput {
  /** effect-site concentrations, ng/mL, keyed by drug */
  ce: Partial<Record<DrugId, number>>
  /** total daily HCTZ dose, mg — HCTZ is dose-driven, not concentration-driven */
  hctzDailyMg: number
  /** effect-compartment ramp for HCTZ so first_dose runs are not a step at t=0 */
  hctzOnsetFraction: number
  /** metabolite potency ratio in use for this run (10–40, central 20) */
  wM: number
  /** per-drug PD multipliers from rules.json */
  pdMultipliers: Partial<Record<DrugId, number>>
}

export interface Engagement {
  ace: number
  at1: number
  urat1: number
  cav12: number
  ncc: number
  beta1: number
  beta2: number
  /** beta1/beta2 — falls toward 1.0 as concentration rises (EN-03) */
  selectivityRatio: number
  /** true once metoprolol exceeds the label's 300 nmol/L cardioselectivity limit */
  selectivityLost: boolean
  /** metoprolol effect-site concentration, ng/mL — the gate variable */
  metoprololCe: number
}

export function computeEngagement(inp: EngagementInput): Engagement {
  const pm = (id: DrugId) => inp.pdMultipliers[id] ?? 1
  const ce = (id: DrugId) => Math.max(0, inp.ce[id] ?? 0)

  const ace = clamp01(hill(ce('lisinopril'), EC50_NG_ML.ace) * pm('lisinopril'))

  // at1_blockade = losartan PARENT + w_m x EXP3174. Both species.
  const at1Drive = ce('losartan') + inp.wM * ce('exp3174')
  const at1 = clamp01(hill(at1Drive, EC50_NG_ML.at1) * pm('losartan'))

  // urat1_inhibition = PARENT ONLY. Different driver ⇒ different peak time.
  const urat1 = clamp01(hill(ce('losartan'), EC50_NG_ML.urat1) * pm('losartan'))

  const cav12 = clamp01(hill(ce('amlodipine'), EC50_NG_ML.cav12) * pm('amlodipine'))

  const ncc = clamp01(
    nccInhibitionFromDose(inp.hctzDailyMg) *
      inp.hctzOnsetFraction *
      pm('hydrochlorothiazide'),
  )

  // Two occupancies, ONE concentration, two EC50s. That is the whole
  // selectivity-loss mechanism: if they shared an EC50 the ratio would be
  // constant and the feature would be fake (EN-03).
  const cMet = ce('metoprolol')
  const beta1 = clamp01(hill(cMet, EC50_NG_ML.beta1) * pm('metoprolol'))
  const beta2 = clamp01(hill(cMet, EC50_NG_ML.beta2) * pm('metoprolol'))

  return {
    ace,
    at1,
    urat1,
    cav12,
    ncc,
    beta1,
    beta2,
    selectivityRatio: beta2 > 1e-9 ? beta1 / beta2 : METOPROLOL_RHO_SEL,
    selectivityLost: cMet > METOPROLOL_BETA2_CROSSOVER_NG_ML,
    metoprololCe: cMet,
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Pathway occupancy for the ODE. Spec §5.3 gives independent blockade,
 * theta_p = 1 − Π(1 − theta_i), which for a single drug is exact but for TWO
 * drugs on the RAAS pathway is wrong in the direction that matters: it makes an
 * ACE inhibitor plus an ARB block MORE of the pathway than either alone, giving
 * an ODE ΔSBP of ~17 mmHg against the algebraic rule's ceiling-limited 11.2 —
 * a 5.8 mmHg disagreement that breaks VAL-14 for exactly the regimen the
 * product most needs to get right.
 *
 * The physiology: an ARB blocks the AT1 receptor whatever generated the ligand,
 * so it already covers most of what an ACE inhibitor could add, and ONTARGET
 * measured the consequence — dual blockade adds ~23 % of the naive expectation.
 * So the same BOUNDED pooling used by the algebraic rule (§4.4 step 2) is used
 * here, on an occupancy ceiling rather than a mmHg one, with the same max()
 * guard so a lone drug passes through exactly.
 *
 * The ceiling is SOLVED by `calibratePathwayGains()` against the algebraic
 * dual-RAAS answer, not chosen.
 */
let RAAS_OCCUPANCY_CEILING = 0.2646

export function setRaasOccupancyCeiling(c: number) {
  RAAS_OCCUPANCY_CEILING = c
}
export function getRaasOccupancyCeiling(): number {
  return RAAS_OCCUPANCY_CEILING
}

export function raasPathwayOccupancy(aceTheta: number, at1Theta: number): number {
  if (aceTheta <= 0) return at1Theta
  if (at1Theta <= 0) return aceTheta
  const c = Math.max(RAAS_OCCUPANCY_CEILING, aceTheta, at1Theta) / 0.98
  const pooled = c * (1 - (1 - aceTheta / c) * (1 - at1Theta / c))
  return Math.min(1, Math.max(aceTheta, at1Theta, pooled))
}

/**
 * Bronchial effect. The label's 300 nmol/L (= 80.2 ng/mL) crossover is used as
 * a documented ESCALATION gate on top of the plain beta2 occupancy, so the
 * lung panel is quiet at metoprolol 25 mg in a normal metaboliser and escalates
 * at 200 mg — or at 100 mg in a CYP2D6 poor metaboliser, whose AUC is ~5x
 * higher. Same patient, same drug, different genotype, different safety verdict
 * (CM-04, CM-05).
 */
export function bronchialRisk(eng: Engagement, airwaySensitivity: number): number {
  const gate = 1 / (1 + Math.exp(-(eng.metoprololCe - METOPROLOL_BETA2_CROSSOVER_NG_ML) / 20))
  return clamp01(eng.beta2 * airwaySensitivity * (0.5 + 1.0 * gate))
}
