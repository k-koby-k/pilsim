/**
 * Layer A — pharmacokinetics. Spec §3.
 *
 * Analytic (closed-form Bateman) one-compartment PK with first-order absorption
 * and an absorption lag, plus:
 *   - a link/effect compartment per drug (§3.4b) — MANDATORY, not optional;
 *   - the losartan → EXP3174 parent/metabolite chain (§3.4) — two species.
 *
 * The PK is NEVER integrated. Only the CV states and the effect compartments
 * are (spec §6.1).
 */

import type { DrugId, PatientState, RuleModifiers, Regimen } from '../types'
import { SUBSTANCE_PK, METABOLITE, type SubstancePk } from './substanceParams'
import { CYP2D6_CL_FACTOR, CYP2D6_F_FACTOR, CYP2C9_FM_DIVISOR, ALL_DRUG_IDS } from './constants'
import type { Rng } from './rng'
import { resolveForm, kaScaleForForm, type ResolvedForm } from './formulations'
export { resolveForm, kaScaleForForm, UnavailableFormError, type ResolvedForm } from './formulations'

export interface DrugPkParams {
  id: DrugId
  F: number
  ka: number
  lag: number
  /** apparent volume actually used by the model, L (already volume-scaled) */
  V: number
  /** clearance actually used, L/h (already volume-scaled) */
  CL: number
  ke: number
  ke0: number
  mw: number
}

/** One administration. */
export interface DoseEvent {
  drugId: DrugId
  mg: number
  /** hours relative to the start of the OUTPUT window; may be negative */
  timeH: number
}

const FLIP_FLOP_EPS = 0.01

/**
 * Bateman for a single dose, at `tau` hours after the dose (lag already removed).
 * Returns mg/L. Includes the flip-flop guard of §3.1 / FM-13: when |ka − ke| is
 * small the closed form divides by ~0, so switch to the limiting form.
 */
export function batemanSingle(doseMg: number, p: DrugPkParams, tau: number): number {
  if (tau <= 0) return 0
  const { F, ka, ke, V } = p
  if (Math.abs(ka - ke) < FLIP_FLOP_EPS) {
    return (F * doseMg) / V * ke * tau * Math.exp(-ke * tau)
  }
  return ((F * doseMg * ka) / (V * (ka - ke))) * (Math.exp(-ke * tau) - Math.exp(-ka * tau))
}

/** Superposition over a dose history. Linear PK is assumed (true for all five). */
export function concentrationAt(doses: DoseEvent[], p: DrugPkParams, t: number): number {
  let c = 0
  for (const d of doses) {
    if (d.drugId !== p.id) continue
    const tau = t - d.timeH - p.lag
    if (tau <= 0) continue
    // Doses older than 7 half-lives contribute < 1 %.
    if (tau > (7 * Math.LN2) / p.ke + 24) continue
    c += batemanSingle(d.mg, p, tau)
  }
  return c
}

// ---------------------------------------------------------------------------
// Losartan → EXP3174. Spec §3.4. Formation-rate parameterisation, split
// between a pre-systemic (first-pass) and a systemic route so the metabolite's
// labelled Tmax of 3.5 h is reproduced (PK-07); see substanceParams METABOLITE.
// ---------------------------------------------------------------------------

/** Unit-amount shape: gut (ka) → metabolite (ke_m). Pre-systemic conversion. */
function shapePreSystemic(ka: number, keM: number, t: number): number {
  if (t <= 0) return 0
  if (Math.abs(ka - keM) < FLIP_FLOP_EPS) return ke0Limit(ka, t)
  return (ka / (ka - keM)) * (Math.exp(-keM * t) - Math.exp(-ka * t))
}
function ke0Limit(k: number, t: number): number {
  return k * t * Math.exp(-k * t)
}

/** Unit-amount shape: gut (ka) → parent (ke_p) → metabolite (ke_m). */
function shapeSystemic(ka: number, keP: number, keM: number, t: number): number {
  if (t <= 0) return 0
  const d1 = (keP - ka) * (keM - ka)
  const d2 = (ka - keP) * (keM - keP)
  const d3 = (ka - keM) * (keP - keM)
  if (Math.abs(d1) < 1e-9 || Math.abs(d2) < 1e-9 || Math.abs(d3) < 1e-9) {
    // degenerate rate constants — fall back to the pre-systemic shape rather
    // than dividing by zero. Only reachable for pathological sampled subjects.
    return shapePreSystemic(ka, keM, t)
  }
  return (
    ka *
    keP *
    (Math.exp(-ka * t) / d1 + Math.exp(-keP * t) / d2 + Math.exp(-keM * t) / d3)
  )
}

/**
 * EXP3174 concentration, mg/L, from the losartan dose history.
 * `fmScale` carries CYP2C9 phenoconversion and the 1 % non-converter preset.
 */
export function exp3174ConcentrationAt(
  doses: DoseEvent[],
  parent: DrugPkParams,
  metab: DrugPkParams,
  t: number,
  fmScale: number,
): number {
  const phi = METABOLITE.firstPassFraction
  const mwr = metab.mw / parent.mw
  let c = 0
  for (const d of doses) {
    if (d.drugId !== 'losartan') continue
    const tau = t - d.timeH - parent.lag
    if (tau <= 0) continue
    if (tau > (7 * Math.LN2) / metab.ke + 48) continue
    const amount = METABOLITE.f_m * fmScale * d.mg * mwr // mg of EXP3174 formed
    const shape =
      phi * shapePreSystemic(parent.ka, metab.ke, tau) +
      (1 - phi) * shapeSystemic(parent.ka, parent.ke, metab.ke, tau)
    c += (amount / metab.V) * shape
  }
  return c
}

// ---------------------------------------------------------------------------
// Covariate model — spec §3.3
// ---------------------------------------------------------------------------

export interface PkCovariates {
  weightKg: number
  egfr: number
  ageYears: number
  cyp2d6: keyof typeof CYP2D6_CL_FACTOR
  cyp2c9: keyof typeof CYP2C9_FM_DIVISOR
  hepaticImpairment: boolean
}

/** f_renal = f_ru·(eGFR/90) + (1 − f_ru), floored at eGFR/90 = 0.1 (FM-04). */
export function renalFactor(fRenalUnchanged: number, egfr: number): number {
  const r = Math.max(0.1, egfr / 90)
  return fRenalUnchanged * r + (1 - fRenalUnchanged)
}

export function cypFactor(id: DrugId, cov: PkCovariates): number {
  if (id === 'metoprolol') return CYP2D6_CL_FACTOR[cov.cyp2d6] ?? 1
  // ⚠️ Amlodipine + a strong CYP3A inhibitor gets NO exposure multiplier. No
  // quantified AUC ratio exists in any regulatory label for that pair. The only
  // quantitative evidence is epidemiologic (clarithromycin AKI OR 1.61,
  // 1.29–2.02, Gandhi JAMA 2013) and belongs on the adverse-event panel, not
  // here. Fabricating a fold-change is exactly what PK-36 exists to prevent.
  return 1
}

/**
 * Amlodipine-only age term. The label states elderly patients have 40–60 %
 * higher amlodipine AUC from reduced intrinsic clearance. Applied here and only
 * here, because amlodipine has no renal clearance component for f_renal to
 * capture. For every other drug the age effect already lives inside eGFR and
 * applying a second term would double-count (spec §3.3 f_age).
 */
export function amlodipineAgeFactor(ageYears: number): number {
  if (ageYears < 65) return 1
  const t = Math.min(1, (ageYears - 65) / 15)
  return 1 / (1 + 0.5 * t) // AUC x1.0 → x1.5 across 65 → 80 y
}

/**
 * Solve the apparent-volume scale so the model reproduces the labelled Cmax at
 * the reference dose while leaving ke (hence t½ and Tmax) untouched.
 * See the block comment in substanceParams.ts — this is a stated one-compartment
 * compromise, not a fudge factor, and it makes absolute AUC non-clinical while
 * leaving every AUC RATIO exact.
 */
export function solveApparentVolumeScale(s: SubstancePk): number {
  if (s.cmaxTargetNgMl == null) return 1
  const ke = Math.LN2 / s.half_life_h
  if (s.id === 'exp3174') {
    const parent = SUBSTANCE_PK.losartan
    const kaP = parent.ka
    const keM = ke
    const keP = Math.LN2 / parent.half_life_h
    const phi = METABOLITE.firstPassFraction
    let peak = 0
    for (let t = 0.01; t < 24; t += 0.01) {
      const v = phi * shapePreSystemic(kaP, keM, t) + (1 - phi) * shapeSystemic(kaP, keP, keM, t)
      if (v > peak) peak = v
    }
    const amount = (METABOLITE.f_m * s.cmaxRefDoseMg * s.mw) / parent.mw
    const cmax = ((amount / s.vd_l) * peak) * 1e6 // mg/L → ng/mL
    return cmax / s.cmaxTargetNgMl
  }
  const ka = s.ka
  const p: DrugPkParams = {
    id: s.id,
    F: s.F,
    ka,
    lag: s.lag,
    V: s.vd_l,
    CL: ke * s.vd_l,
    ke,
    ke0: s.ke0,
    mw: s.mw,
  }
  const tmax =
    Math.abs(ka - ke) < FLIP_FLOP_EPS ? 1 / ke : Math.log(ka / ke) / (ka - ke)
  const cmax = batemanSingle(s.cmaxRefDoseMg, p, tmax) * 1e6
  return cmax / s.cmaxTargetNgMl
}

/** Cached, because it is the same for every run. */
const VOLUME_SCALE: Partial<Record<DrugId, number>> = {}
export function apparentVolumeScale(id: DrugId): number {
  let v = VOLUME_SCALE[id]
  if (v === undefined) {
    v = solveApparentVolumeScale(SUBSTANCE_PK[id])
    VOLUME_SCALE[id] = v
  }
  return v
}

/**
 * Build the per-drug PK parameter set for a subject.
 * `rng` is optional: pass it for a virtual-population subject, omit it for the
 * deterministic single twin.
 */
export function buildPkParams(
  id: DrugId,
  cov: PkCovariates,
  modifiers?: RuleModifiers,
  rng?: Rng,
  form?: string,
): DrugPkParams {
  const s = SUBSTANCE_PK[id]
  const scale = apparentVolumeScale(id)

  // Dosage form (spec: DoseSpec.form). Throws UnavailableFormError when the
  // requested form does not exist in the real world — see formulations.ts.
  // `form` omitted resolves to fRelative 1 / no ka or lag override, which is
  // exactly today's behaviour (byte-identical).
  const resolved: ResolvedForm = resolveForm(id, form)

  const wtCl = Math.pow(cov.weightKg / 70, 0.75)
  const wtV = cov.weightKg / 70

  let F = s.F * resolved.fRelative
  // CYP2D6 also gates metoprolol's FIRST PASS — see constants.CYP2D6_F_FACTOR.
  if (id === 'metoprolol') F = Math.min(1, F * (CYP2D6_F_FACTOR[cov.cyp2d6] ?? 1))
  // A directly-cited ka (metoprolol ER) wins; otherwise a Tmax-derived scale
  // factor (identity when the form carries no Tmax override).
  let ka = resolved.kaPerH ?? s.ka * kaScaleForForm(id, resolved)
  const lag = resolved.lagH ?? s.lag
  let V = s.vd_l * scale * wtV
  let CL =
    s.cl_l_h *
    scale *
    wtCl *
    renalFactor(s.f_renal_unchanged, cov.egfr) *
    cypFactor(id, cov) *
    (cov.hepaticImpairment && s.f_renal_unchanged < 0.5 ? 0.5 : 1)

  if (id === 'amlodipine') CL *= amlodipineAgeFactor(cov.ageYears)

  // Keep ke pinned to the CITED half-life for the reference subject. The data
  // file's Vd and CL are not always mutually consistent with the labelled t½
  // (PD-19); the half-life is the better-sourced quantity, so CL is expressed
  // as ke·V and then modulated by the covariates above.
  const keRef = Math.LN2 / s.half_life_h
  const clRef = keRef * s.vd_l * scale
  CL *= clRef / (s.cl_l_h * scale)

  if (rng) {
    F *= rng.logNormalFactor(s.cv.F)
    F = Math.min(1, Math.max(0.01, F))
    ka *= rng.logNormalFactor(s.cv.ka)
    // CL and Vd are drawn correlated (rho ~ 0.3) in buildPopulationPkParams;
    // here the simple independent draw is used only when a caller opts in.
    V *= rng.logNormalFactor(s.cv.vd)
    CL *= rng.logNormalFactor(s.cv.cl)
  }

  const pkMul = modifiers?.pkMultipliers?.[id]
  if (pkMul && pkMul > 0) {
    // rules.json `pk_multiply` is expressed as an EXPOSURE multiplier
    // (AUC fold-change), and AUC ∝ 1/CL, so it divides clearance.
    CL /= pkMul
  }

  return { id, F, ka, lag, V, CL, ke: CL / V, ke0: s.ke0, mw: s.mw }
}

/** Derived quantities the UI wants (spec §3.1). */
export function derivedPk(p: DrugPkParams, doseMg: number, intervalH: number) {
  const tmax =
    Math.abs(p.ka - p.ke) < FLIP_FLOP_EPS
      ? 1 / p.ke
      : Math.log(p.ka / p.ke) / (p.ka - p.ke)
  return {
    tmaxH: tmax,
    cmaxNgMl: batemanSingle(doseMg, p, tmax) * 1e6,
    aucNgHMl: ((p.F * doseMg) / p.CL) * 1e6,
    halfLifeH: Math.LN2 / p.ke,
    accumulationRatio: 1 / (1 - Math.exp(-p.ke * intervalH)),
  }
}

/**
 * Expand a regimen into a dose history.
 *
 * `steady_state` (the DEFAULT, and the clinically meaningful mode) pre-loads
 * enough prior doses that every drug has converged before t = 0.
 *
 * ⚠️ Why this matters more than it looks (spec §6.1b): amlodipine needs 7–8 days
 * and accumulates ~2.9-fold, while the other four are at steady state within a
 * day. A short first-dose run therefore shows amlodipine at ~35 % of its chronic
 * exposure WHILE SHOWING THE OTHERS CORRECTLY — a selective distortion that
 * biases any regimen comparison against amlodipine and looks entirely plausible
 * on screen. `first_dose` is an explicit opt-in and disables ranking.
 */
export function buildDoseHistory(
  regimen: Regimen,
  mode: 'steady_state' | 'first_dose',
  horizonHours: number,
): DoseEvent[] {
  const out: DoseEvent[] = []
  for (const d of regimen.doses) {
    if (!d.mg || d.mg <= 0 || !d.perDay || d.perDay <= 0) continue
    const interval = 24 / d.perDay
    if (mode === 'steady_state') {
      // 10 half-lives of prior dosing is exact superposition, not a warm-up
      // approximation. Amlodipine's 40 h t½ dominates: ~17 days of history.
      const s = SUBSTANCE_PK[d.substanceId]
      const preloadH = Math.max(72, (10 * s.half_life_h) / Math.LN2)
      for (let t = -Math.ceil(preloadH / interval) * interval; t < 0; t += interval) {
        out.push({ drugId: d.substanceId, mg: d.mg, timeH: t })
      }
    }
    for (let t = 0; t <= horizonHours; t += interval) {
      out.push({ drugId: d.substanceId, mg: d.mg, timeH: t })
    }
  }
  return out
}

export function drugsInRegimen(regimen: Regimen): DrugId[] {
  const ids = new Set<DrugId>()
  for (const d of regimen.doses) if (d.mg > 0) ids.add(d.substanceId)
  if (ids.has('losartan')) ids.add('exp3174')
  return ALL_DRUG_IDS.filter((id) => ids.has(id))
}

/**
 * The dosage form specified for `id` in this regimen, if any. EXP3174 always
 * returns undefined — it is never dosed directly; its formation kinetics
 * follow the losartan dose's own form via `pk.losartan`'s ka (see
 * exp3174ConcentrationAt), so it needs no form of its own.
 */
export function formForDrug(regimen: Regimen, id: DrugId): string | undefined {
  if (id === 'exp3174') return undefined
  return regimen.doses.find((d) => d.substanceId === id && d.mg > 0)?.form
}

/** CYP2C9 divisor on f_m, plus the archived 1 % non-converter preset. */
export function losartanFmScale(patient: PatientState): number {
  const pheno = (patient.inputs.cyp2c9 ?? 'normal') as keyof typeof CYP2C9_FM_DIVISOR
  let scale = 1 / (CYP2C9_FM_DIVISOR[pheno] ?? 1)
  // 2009 COZAAR label (since removed — cite it as archived): "Minimal conversion
  // of losartan to the active metabolite (less than 1 % of the dose compared to
  // 14 % of the dose in normal subjects) was seen in about one percent of
  // individuals studied." Selectable preset; PK-32.
  if (patient.inputs.losartan_non_converter === true) scale = 0.01 / 0.14
  return scale
}
