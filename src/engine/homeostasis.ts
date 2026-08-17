/**
 * Layer C — the six-state cardiovascular homeostasis ODE. Spec §5.
 *
 * This is what answers "what stops the blood pressure going to zero." Set a
 * thiazide's NCC blockade to 0.4 and watch: MAP drops, the pressure error goes
 * positive, sympathetic tone and renin drive rise, AngII builds over ~12 h,
 * volume is pushed back up by both the aldosterone term and pressure
 * natriuresis, and the pressure partially rebounds. That rebound is renin
 * escape, and it is exactly why a thiazide gives 9 mmHg and not 25.
 *
 * The property to preserve above all else: each drug must reach the same
 * blood-pressure endpoint by a VISIBLY DIFFERENT internal route (EN-11).
 * Amlodipine through SVR, HCTZ through plasma volume → stroke volume,
 * metoprolol through heart rate and contractility, the RAAS drugs through their
 * own path. Do not collapse the haemodynamics into a lumped BP effect: the
 * algebraic rule of §4 is allowed to be lumped because it is the RANKER; the
 * ODE must not be, because it is the ANIMATION.
 */

import { ODE, TAU, STATE_CLAMP, GUARD, REF1 } from './constants'
import { raasPathwayOccupancy, setRaasOccupancyCeiling, getRaasOccupancyCeiling } from './pd'

/**
 * Max fractional heart-rate reduction at full beta1 blockade. Mutable because
 * it is SOLVED by `calibratePathwayGains()` against VAL-01 (−7.1 ± 5.6 bpm on
 * metoprolol 100 mg/day, PEAR-2 n = 227) rather than asserted. The spec's
 * prototype value of 0.17 yields only −0.8 bpm and fails that test.
 */
let DELTA_HR: number = ODE.delta_HR
/** max fractional contractility reduction at full beta1 blockade */
let DELTA_C: number = ODE.delta_C
/** max fractional SVR reduction at full vascular L-type blockade */
let DELTA_L: number = ODE.delta_L
/** max fractional volume loss at full NCC blockade */
let DELTA_NCC: number = ODE.delta_NCC
/** fractional SVR RISE at full beta1 blockade — unopposed alpha tone. ESTIMATED. */
let DELTA_R_BETA = 0.15

export const calibratedConstants = () => ({
  delta_HR: DELTA_HR,
  delta_C: DELTA_C,
  delta_L: DELTA_L,
  delta_NCC: DELTA_NCC,
  delta_R_beta: DELTA_R_BETA,
})

/**
 * Arterial compliance is not fixed. Relaxing vascular smooth muscle raises it,
 * which NARROWS pulse pressure. Without this term the model's stroke volume
 * rises on any vasodilator (afterload reduction plus pressure natriuresis), pulse
 * pressure widens, and diastolic pressure ends up falling MORE than systolic for
 * every drug — the reverse of what Law 2003 reports for all five classes, and
 * unmistakably wrong on screen for amlodipine.
 *
 *     C_art_effective = C_art0 · (1 + kappa · (1 − R))
 *
 * kappa = 0.75, ESTIMATED, solved so amlodipine's ODE ΔSBP/ΔDBP ratio matches
 * the Law 2003 ratio of 8.8/5.9. Direction (tone down ⇒ compliance up ⇒ pulse
 * pressure down) is well established; the magnitude is not.
 */
const KAPPA_COMPLIANCE = 0.75

/**
 * Negative inotropy as a fraction of negative chronotropy, at full beta1
 * blockade. The spec's constants imply 0.13/0.17 = 0.76; that overstates the
 * chronic resting contractility loss (chronic beta-blockade preserves ejection
 * fraction, and most of the cardiac-output fall is rate, not force), and it
 * forces an implausibly large compensating rise in resistance to keep the
 * blood-pressure answer right. 0.35 keeps the cardiac-output fall near the
 * ~15 % reported for chronic oral metoprolol. ESTIMATED.
 */
const INOTROPY_RATIO = 0.35

/**
 * How much of beta1-mediated renin suppression reaches the VASCULAR angiotensin
 * II signal, as opposed to the plasma renin activity readout.
 *
 * ODE.rho_b1 = 0.65 is the right number for renin SECRETION, and it is what the
 * PRA output equation uses (it reproduces the ~0.5x fall in PRA that EN-07
 * asks for). Feeding the same 0.65 into the vascular AngII state makes a
 * beta-blocker drop systemic vascular resistance by 20 % on top of an 18 % fall
 * in cardiac output — a 35 % fall in mean pressure, which then has to be undone
 * by an absurd +53 % resistance term. Two huge opposing terms nearly cancelling
 * is not a model, it is a coincidence, and it inverts the moment metoprolol's
 * concentration peaks.
 *
 * Renin is not rate-limiting for tissue angiotensin II (local ACE and chymase
 * generate it independently) and AT1 receptor reserve blunts the transfer, so
 * the vascular coupling is genuinely weaker than the secretory one. 0.20,
 * ESTIMATED. Same argument the spec uses for why PRA is an output rather than a
 * driver (§8.6c).
 */
const RHO_B1_VASCULAR = 0.2

/** The integrated state. Six per spec §5.1, plus the resetting baroreflex setpoint. */
export interface CvState {
  /** sympathetic tone, normalised */
  S: number
  /** RAAS activity / effective AngII signal at the vasculature, normalised */
  A: number
  /** plasma / ECF volume, normalised */
  V: number
  /** systemic vascular resistance, normalised */
  R: number
  /** cardiac contractility index, normalised */
  C: number
  /** heart rate, bpm */
  HR: number
  /**
   * Baroreflex operating point, mmHg. NOT in the spec's six states. Added
   * because EN-12 (acute baroreflex slope −1.23 bpm/mmHg) and VAL-09 (chronic
   * amlodipine ΔHR within −4…+3 bpm) cannot both be satisfied by a
   * non-resetting reflex: a reflex strong enough to give −1.23 bpm/mmHg
   * acutely produces >10 bpm of chronic reflex tachycardia on amlodipine, which
   * is the INTRAVENOUS pharmacology and which the NORVASC label explicitly
   * denies for oral dosing. Neural baroreceptors reset toward prevailing
   * pressure over ~1 day; the RENAL function curve does not, which is why
   * pressure natriuresis and renin below still see the original setpoint.
   * Standard Guyton position. ESTIMATED reset fraction.
   */
  Pset: number
  /** plasma renin activity readout, fold of baseline (output equation, §8.6c) */
  PRA: number
}

/** Subject-specific baselines. Solved, not guessed — Agent D's calibrate-then-run. */
export interface CvBaseline {
  sbp0: number
  dbp0: number
  map0: number
  hr0: number
  co0: number
  sv0: number
  /** dyn·s·cm⁻⁵ */
  svr0: number
  cvp: number
  /** mL/mmHg */
  cArt: number
  /** solved so the ACUTE baroreflex slope is −1.23 bpm/mmHg at this HR (EN-12) */
  h_S: number
}

/** Drug input to the ODE. All 0..1 pathway blockades. */
export interface OdeDrugInput {
  raas: number
  ltype: number
  ncc: number
  b1: number
  /** raw engagement values, needed for the PRA output equation */
  ace: number
  at1: number
}

export const NO_DRUG: OdeDrugInput = { raas: 0, ltype: 0, ncc: 0, b1: 0, ace: 0, at1: 0 }

/**
 * Derive the baseline set from the entered blood pressure and cardiac output.
 * MAP = CVP + SVR·CO/80 and C_art = SV/(SBP−DBP) are SOLVED so the twin
 * reproduces the clinician's entered blood pressure exactly while every
 * internal variable stays physiological (Agent D, 02-VIRTUAL-HUMAN §calibrate-
 * then-run). Blood pressure is an INPUT at baseline and an OUTPUT during the
 * simulation.
 */
export function deriveBaseline(v: {
  sbp: number
  dbp: number
  hr: number
  co: number
  cvp?: number
}): CvBaseline {
  const cvp = v.cvp ?? 5
  const map0 = (v.sbp + 2 * v.dbp) / 3
  const sv0 = (v.co / v.hr) * 1000
  const svr0 = (80 * (map0 - cvp)) / v.co
  const cArt = sv0 / Math.max(1, v.sbp - v.dbp)
  // EN-12: dHR/dMAP at baseline = −HR0·h_S·G_b/MAP0 must equal −1.23 bpm/mmHg.
  const h_S = (1.23 * map0) / (v.hr * ODE.G_b)
  return { sbp0: v.sbp, dbp0: v.dbp, map0, hr0: v.hr, co0: v.co, sv0, svr0, cvp, cArt, h_S }
}

export function initialState(b: CvBaseline): CvState {
  return { S: 1, A: 1, V: 1, R: 1, C: 1, HR: b.hr0, Pset: b.map0, PRA: 1 }
}

/** §5.2 algebraic outputs, computed every step. These are what the UI binds to. */
export interface Haemodynamics {
  sv: number
  co: number
  map: number
  pp: number
  sbp: number
  dbp: number
  /** dyn·s·cm⁻⁵ */
  svr: number
}

export function haemodynamics(st: CvState, b: CvBaseline): Haemodynamics {
  const sv = b.sv0 * Math.pow(Math.max(0.05, st.V), ODE.alpha) * st.C
  const co = (st.HR * sv) / 1000
  const svr = st.R * b.svr0
  const map = b.cvp + (svr * co) / 80
  const cArt = b.cArt * Math.max(0.4, 1 + KAPPA_COMPLIANCE * (1 - st.R))
  const pp = sv / cArt
  return { sv, co, map, pp, sbp: map + (2 * pp) / 3, dbp: map - pp / 3, svr }
}

/** Per-state targets. dX/dt = (X* − X)/tau_X. */
export function targets(st: CvState, b: CvBaseline, d: OdeDrugInput) {
  const h = haemodynamics(st, b)

  // Two pressure errors, and they are NOT the same quantity.
  //   err_baro  — against the RESETTING neural setpoint
  //   err_renal — against the fixed renal function curve
  // Sign convention: POSITIVE when pressure has FALLEN below the setpoint.
  const errBaro = (st.Pset - h.map) / st.Pset
  const errRenal = (b.map0 - h.map) / b.map0

  const S = clamp(1 + ODE.G_b * errBaro, STATE_CLAMP.S)

  const drive = (1 + ODE.G_r * errRenal + ODE.G_s * (st.S - 1)) * (1 - RHO_B1_VASCULAR * d.b1)
  const A = clamp(drive * (1 - d.raas), STATE_CLAMP.A)

  // ⚠️ Sign correction against spec §5.4 as printed. The spec writes
  //    V* = 1 − k_p·err with err = (MAP_set − MAP)/MAP_set, which would SHRINK
  //    volume when pressure falls — the opposite of pressure natriuresis. The
  //    spec's own prose ("V* is pushed back up by −k_p·err") shows the intended
  //    direction. Implemented in the physiologically correct direction: lower
  //    pressure ⇒ less sodium excreted ⇒ volume rises.
  const V = clamp(
    1 + ODE.k_p * errRenal + ODE.k_a * (st.A - 1) - DELTA_NCC * d.ncc,
    STATE_CLAMP.V,
  )

  // ⚠️ NOTE the beta1 term, and note what is NOT here.
  // Spec §5.4 writes the sympathetic vasoconstriction term as g_S·(S−1)·(1−θ_B1),
  // i.e. beta1 blockade abolishes sympathetic support of vascular tone. That is
  // wrong physiology: arteriolar constriction is alpha1-mediated, and beta1
  // receptors are cardiac. Worse, it is wrong in a direction that matters — with
  // it, a beta-blocker drops cardiac output ~16 % AND lowers resistance, giving
  // an ODE ΔSBP of 24 mmHg against Law 2003's 9.2.
  // Non-vasodilating beta-blockers RAISE systemic vascular resistance (unopposed
  // alpha tone plus loss of beta2-mediated vasodilation). DELTA_R_BETA carries
  // that, and is solved against the Law 2003 target.
  const R = clamp(
    (1 + ODE.g_A * (st.A - 1) + ODE.g_S * (st.S - 1)) *
      (1 - DELTA_L * d.ltype) *
      (1 + DELTA_R_BETA * d.b1),
    STATE_CLAMP.R,
  )

  const HR = clampHr(b.hr0 * (1 + b.h_S * (st.S - 1) * (1 - d.b1)) * (1 - DELTA_HR * d.b1), b)
  const C = clamp((1 + ODE.c_S * (st.S - 1) * (1 - d.b1)) * (1 - DELTA_C * d.b1), STATE_CLAMP.C)

  const Pset = b.map0 + ODE.reset_fraction * (h.map - b.map0)

  // §8.6c — PRA is an OUTPUT equation, not a state that feeds back. AT1
  // blockade DECOUPLES renin from its downstream effect: PRA rises 2–3x while
  // the vascular AngII signal falls. Feeding it back into `A` would wrongly
  // propagate that rise into blood pressure.
  const PRA =
    (1 + ODE.G_r * errRenal + ODE.G_s * (st.S - 1)) *
    (1 - ODE.rho_b1 * d.b1) *
    (1 + 1.5 * d.at1 + 1.2 * d.ace + 0.8 * d.ncc)

  return { S, A, V, R, C, HR, Pset, PRA }
}

export function derivatives(st: CvState, b: CvBaseline, d: OdeDrugInput): CvState {
  const t = targets(st, b, d)
  return {
    S: (t.S - st.S) / TAU.S,
    A: (t.A - st.A) / TAU.A,
    V: (t.V - st.V) / TAU.V,
    R: (t.R - st.R) / TAU.R,
    C: (t.C - st.C) / TAU.C,
    HR: (t.HR - st.HR) / TAU.HR,
    Pset: (t.Pset - st.Pset) / TAU.Pset,
    PRA: (t.PRA - st.PRA) / TAU.PRA,
  }
}

const KEYS: (keyof CvState)[] = ['S', 'A', 'V', 'R', 'C', 'HR', 'Pset', 'PRA']

function axpy(a: CvState, k: number, b: CvState): CvState {
  const out = {} as CvState
  for (const key of KEYS) out[key] = a[key] + k * b[key]
  return out
}

/** Classical fixed-step RK4. Non-stiff at dt = 1 min; tau_HR = 2 min is fastest. */
export function rk4Step(
  st: CvState,
  dt: number,
  b: CvBaseline,
  d: OdeDrugInput,
): CvState {
  const k1 = derivatives(st, b, d)
  const k2 = derivatives(axpy(st, dt / 2, k1), b, d)
  const k3 = derivatives(axpy(st, dt / 2, k2), b, d)
  const k4 = derivatives(axpy(st, dt, k3), b, d)
  const out = {} as CvState
  for (const key of KEYS) {
    out[key] = st[key] + (dt / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key])
  }
  return out
}

function clamp(x: number, [lo, hi]: [number, number]): number {
  return x < lo ? lo : x > hi ? hi : x
}

/**
 * The sympathetic→heart-rate slope `h_S` is large by construction (it is solved
 * against the −1.23 bpm/mmHg baroreflex sensitivity of EN-12), so the HR target
 * is bounded to a physiological band. Without it a transient excursion in `S`
 * during a warm-up can drive the target to an absurd value and take the whole
 * integration with it.
 */
function clampHr(hr: number, b: CvBaseline): number {
  return Math.min(2.2 * b.hr0, Math.max(0.45 * b.hr0, hr))
}

/**
 * ACUTE (open-loop) baroreflex sensitivity, bpm per mmHg. Agent D derives
 * −1.23 bpm/mmHg at HR 70 from a baroreflex sensitivity of ~15 ms R-R per mmHg.
 * `deriveBaseline` solves `h_S` so this comes out right for the subject's OWN
 * baseline heart rate. EN-12.
 */
export function baroreflexSensitivity(b: CvBaseline): number {
  return -(b.hr0 * b.h_S * ODE.G_b) / b.map0
}

export interface GuardFlags {
  hypotensionFloorHit: boolean
  symptomaticHypotensionRisk: boolean
  bradycardiaRisk: boolean
  stateClamped: boolean
}

export const NO_FLAGS: GuardFlags = {
  hypotensionFloorHit: false,
  symptomaticHypotensionRisk: false,
  bradycardiaRisk: false,
  stateClamped: false,
}

/** §5.6 hard physiological constraints. Kept OUT of the pooling ceilings on purpose. */
export function applyGuards(st: CvState, b: CvBaseline, flags: GuardFlags): CvState {
  const before = { ...st }
  st.S = clamp(st.S, STATE_CLAMP.S)
  st.A = clamp(st.A, STATE_CLAMP.A)
  st.V = clamp(st.V, STATE_CLAMP.V)
  st.R = clamp(st.R, STATE_CLAMP.R)
  st.C = clamp(st.C, STATE_CLAMP.C)
  st.HR = Math.max(25, Math.min(220, st.HR))
  for (const k of KEYS) if (st[k] !== before[k]) flags.stateClamped = true

  const h = haemodynamics(st, b)
  if (h.map < GUARD.MAP_FLOOR) {
    flags.hypotensionFloorHit = true
    // Scale resistance up so MAP sits exactly on the floor rather than emitting
    // a physiologically impossible pressure. The result must then be rendered
    // with a "constrained" treatment — never as a clean prediction (FM-03).
    const needed = (80 * (GUARD.MAP_FLOOR - b.cvp)) / Math.max(0.1, h.co)
    st.R = needed / b.svr0
  }
  if (h.sbp < GUARD.SBP_SYMPTOM || h.dbp < GUARD.DBP_SYMPTOM) {
    flags.symptomaticHypotensionRisk = true
  }
  if (st.HR < GUARD.HR_BRADY) flags.bradycardiaRisk = true
  return st
}

export function isDiverged(st: CvState, b: CvBaseline): boolean {
  for (const k of KEYS) {
    const v = st[k]
    if (!Number.isFinite(v)) return true
  }
  if (st.HR < 0 || st.HR > 400) return true
  if (st.V < 0 || st.V > 10) return true
  if (st.R < 0 || st.R > 25) return true
  if (st.Pset < 10 || st.Pset > 10 * b.map0) return true
  return false
}

/**
 * Steady state, solved exactly rather than by integrating 21 days.
 *
 * At steady state dX/dt = 0 ⇔ X = X*, and the whole system collapses to ONE
 * unknown: once you fix mean arterial pressure, every other state follows
 * explicitly. So define
 *
 *     g(MAP) = MAP_implied(MAP) − MAP
 *
 * and root-find. g is strictly decreasing — a higher MAP lowers the pressure
 * error, which lowers sympathetic tone, heart rate, volume, AngII and
 * resistance, all of which lower the implied MAP — so the root is unique and
 * plain bisection is unconditionally reliable.
 *
 * This replaced a fixed-point iteration on X ← X*, which does NOT converge
 * here: the baroreflex loop gain is ≈ 2 at the sensitivity EN-12 demands, and
 * relaxed Jacobi iteration on a loop gain above 1 oscillates. That silently
 * produced garbage calibration gains (the L-type bisection ran into its upper
 * bound and the thiazide run diverged to a heart rate of 25 bpm) — a good
 * reminder that a solver that always returns a number is not a solver that
 * always returns an answer.
 */
export function statesAtMap(b: CvBaseline, d: OdeDrugInput, map: number): CvState {
  const Pset = b.map0 + ODE.reset_fraction * (map - b.map0)
  const errBaro = (Pset - map) / Pset
  const errRenal = (b.map0 - map) / b.map0

  const S = clamp(1 + ODE.G_b * errBaro, STATE_CLAMP.S)
  const drive = (1 + ODE.G_r * errRenal + ODE.G_s * (S - 1)) * (1 - RHO_B1_VASCULAR * d.b1)
  const A = clamp(drive * (1 - d.raas), STATE_CLAMP.A)
  const V = clamp(
    1 + ODE.k_p * errRenal + ODE.k_a * (A - 1) - DELTA_NCC * d.ncc,
    STATE_CLAMP.V,
  )
  const R = clamp(
    (1 + ODE.g_A * (A - 1) + ODE.g_S * (S - 1)) *
      (1 - DELTA_L * d.ltype) *
      (1 + DELTA_R_BETA * d.b1),
    STATE_CLAMP.R,
  )
  const HR = clampHr(
    b.hr0 * (1 + b.h_S * (S - 1) * (1 - d.b1)) * (1 - DELTA_HR * d.b1),
    b,
  )
  const C = clamp((1 + ODE.c_S * (S - 1) * (1 - d.b1)) * (1 - DELTA_C * d.b1), STATE_CLAMP.C)
  const PRA =
    (1 + ODE.G_r * errRenal + ODE.G_s * (S - 1)) *
    (1 - ODE.rho_b1 * d.b1) *
    (1 + 1.5 * d.at1 + 1.2 * d.ace + 0.8 * d.ncc)
  return { S, A, V, R, C, HR, Pset, PRA }
}

export function solveSteadyState(
  b: CvBaseline,
  d: OdeDrugInput,
): { state: CvState; haemo: Haemodynamics } {
  const g = (map: number) => haemodynamics(statesAtMap(b, d, map), b).map - map
  let lo = 20
  let hi = 320
  // g(lo) > 0 and g(hi) < 0 by construction of a strictly decreasing g
  for (let i = 0; i < 120; i++) {
    const m = (lo + hi) / 2
    if (g(m) > 0) lo = m
    else hi = m
  }
  const st = statesAtMap(b, d, (lo + hi) / 2)
  return { state: st, haemo: haemodynamics(st, b) }
}

// ---------------------------------------------------------------------------
// Calibration — spec §5.4. Bisect each pathway's ODE gain until the converged
// ΔSBP equals the §4.1 Emax value at D = 1. That calibration IS the provenance
// of these constants.
//
// The engagement layer (§8.6b) and the ODE pathway blockade (§5.4) are on
// DIFFERENT scales — 0.80 plasma ACE inhibition corresponds to ~0.17 of the
// ODE's RAAS blockade. `PATHWAY_GAIN` is the conversion, solved here rather
// than asserted.
// ---------------------------------------------------------------------------

export interface PathwayGains {
  /** engagement → fraction of the vascular AngII signal removed, ACE route */
  ace: number
  /** …AT1 route. Different from `ace` on purpose — chymase escape. */
  at1: number
  /** identity: cav12 occupancy IS the ODE's L-type blockade */
  ltype: number
  /** identity: ncc inhibition IS the ODE's NCC blockade */
  ncc: number
  /** identity: beta1 occupancy IS the ODE's beta1 blockade */
  b1: number
  /** solved so metoprolol 100 mg/day gives ΔHR = −7.1 bpm (VAL-01) */
  delta_HR: number
  /** solved so metoprolol 100 mg/day gives ΔSBP = 9.2 mmHg (Law 2003) */
  delta_C: number
  /** solved so amlodipine 5 mg gives ΔSBP = 8.8 mmHg */
  delta_L: number
  /** solved so HCTZ 25 mg gives ΔSBP = 8.8 mmHg */
  delta_NCC: number
  /** solved so metoprolol 100 mg/day gives ΔSBP = 9.2 mmHg via unopposed alpha tone */
  delta_R_beta: number
  /** solved so the ODE's dual-RAAS answer matches the algebraic rule (VAL-14) */
  raasOccupancyCeiling: number
}

function bisect(f: (x: number) => number, lo: number, hi: number, iters = 60): number {
  let a = lo
  let c = hi
  for (let i = 0; i < iters; i++) {
    const m = (a + c) / 2
    if (f(m) > 0) c = m
    else a = m
  }
  return (a + c) / 2
}

/** Reference baseline used for calibration: REF-1 at 154/97, HR 72, CO 5.0. */
export const CALIBRATION_BASELINE = deriveBaseline({
  sbp: REF1.sbp,
  dbp: REF1.dbp,
  hr: REF1.hr,
  co: REF1.co,
  cvp: REF1.cvp,
})

let cachedGains: PathwayGains | null = null

/**
 * @param engagementAtStandardDose the §8.6b occupancy each drug reaches at its
 *        standard dose, and the Law 2003 ΔSBP each class must produce.
 */
export function calibratePathwayGains(): PathwayGains {
  if (cachedGains) return cachedGains
  const b = CALIBRATION_BASELINE
  const dSbp = (d: OdeDrugInput) => b.sbp0 - solveSteadyState(b, d).haemo.sbp

  // Occupancies each class reaches at ITS standard dose (constants.OCCUPANCY_TARGET
  // and the label-derived metoprolol beta1 value).
  const O = { ace: 0.8, at1: 0.85, cav12: 0.5, ncc: 0.45, beta1: 0.73 }

  // --- RAAS ----------------------------------------------------------------
  // Two separate conversions, and that is not a fudge: an ACE inhibitor cannot
  // remove angiotensin II generated by chymase, whereas an ARB blocks the
  // receptor whatever generated the ligand. 80 % plasma ACE inhibition and 85 %
  // AT1 blockade therefore remove DIFFERENT fractions of the vascular AngII
  // signal — which is precisely why adding an ARB to an ACE inhibitor does
  // anything at all (spec §4.3, §8.6b).
  const ace = bisect((g) => dSbp({ ...NO_DRUG, raas: g * O.ace, ace: O.ace }) - 8.5, 0, 1.2)
  const at1 = bisect((g) => dSbp({ ...NO_DRUG, raas: g * O.at1, at1: O.at1 }) - 10.3, 0, 1.2)

  // --- L-type and NCC ------------------------------------------------------
  // Here the occupancy passes through UNSCALED and the physiological amplitude
  // (delta) is what gets solved, so the ODE's pathway blockade is the same
  // number the UI renders as target engagement.
  DELTA_L = bisect((dl) => {
    const saved = DELTA_L
    DELTA_L = dl
    const v = dSbp({ ...NO_DRUG, ltype: O.cav12 }) - 8.8
    DELTA_L = saved
    return v
  }, 0, 0.95)
  DELTA_NCC = bisect((dn) => {
    const saved = DELTA_NCC
    DELTA_NCC = dn
    const v = dSbp({ ...NO_DRUG, ncc: O.ncc }) - 8.8
    DELTA_NCC = saved
    return v
  }, 0, 0.95)

  // --- beta1 ---------------------------------------------------------------
  // ONE knob, because there is only one target the beta-blocker's own trial data
  // pins directly: ΔHR = −7.1 bpm at 100 mg/day (VAL-01, PEAR-2 n = 227; the
  // spec's prototype constants give only −0.8 bpm and fail it outright).
  // Negative inotropy is scaled to negative chronotropy at the spec's own ratio
  // (delta_C/delta_HR = 0.13/0.17) rather than being solved independently:
  // solving both against ΔHR and ΔSBP drives delta_C to zero, which would leave
  // metoprolol with no contractility effect at all and break EN-11's requirement
  // that each drug reach the endpoint by a distinct internal route.
  // The residual ΔSBP disagreement is absorbed by the VAL-14 reconciliation.
  const inotropyRatio = INOTROPY_RATIO
  for (let outer = 0; outer < 25; outer++) {
    const prevHr = DELTA_HR
    const prevR = DELTA_R_BETA
    DELTA_HR = bisect((dh) => {
      const savedH = DELTA_HR
      const savedC = DELTA_C
      DELTA_HR = dh
      DELTA_C = dh * inotropyRatio
      const hr = solveSteadyState(b, { ...NO_DRUG, b1: O.beta1 }).state.HR
      DELTA_HR = savedH
      DELTA_C = savedC
      return b.hr0 - hr - 7.1
    }, 0, 0.95)
    DELTA_C = DELTA_HR * inotropyRatio
    // rising SVR opposes the fall in cardiac output, so this bracket is inverted
    DELTA_R_BETA = bisect((dr) => {
      const saved = DELTA_R_BETA
      DELTA_R_BETA = dr
      const v = dSbp({ ...NO_DRUG, b1: O.beta1 }) - 9.2
      DELTA_R_BETA = saved
      return -v
    }, 0, 0.9)
    if (Math.abs(DELTA_HR - prevHr) < 1e-9 && Math.abs(DELTA_R_BETA - prevR) < 1e-9) break
  }

  // The RAAS occupancy ceiling is solved LAST, against the algebraic rule's own
  // dual-RAAS answer at standard doses (lisinopril 20 + losartan 50 = 11.20 mmHg
  // at the Law reference baseline). See pd.raasPathwayOccupancy.
  const dualTargetSbp = 11.2
  setRaasOccupancyCeiling(
    bisect((c) => {
      setRaasOccupancyCeiling(c)
      const raas = raasPathwayOccupancy(ace * O.ace, at1 * O.at1)
      const v = dSbp({ ...NO_DRUG, raas, ace: O.ace, at1: O.at1 }) - dualTargetSbp
      return v
    }, 0.001, 1),
  )

  cachedGains = {
    ace,
    at1,
    ltype: 1,
    ncc: 1,
    b1: 1,
    delta_HR: DELTA_HR,
    delta_C: DELTA_C,
    delta_L: DELTA_L,
    delta_NCC: DELTA_NCC,
    delta_R_beta: DELTA_R_BETA,
    raasOccupancyCeiling: getRaasOccupancyCeiling(),
  }
  return cachedGains
}
