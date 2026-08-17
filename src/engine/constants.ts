/**
 * PilSim engine constants.
 *
 * Every number here is traceable to research/03-SIMULATION-SPEC.md,
 * research/06-VALIDATION.md or research/08-EXTERNAL-RECONCILIATION.md.
 * Where a value is ESTIMATED that is said out loud.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  THE POTENCY TRAP — read research/03-SIMULATION-SPEC.md §1 before touching
 *     anything in this file or in pd.ts.
 *
 *     NO in-vitro binding constant (IC50 / Ki / Kd) may enter the numeric path.
 *     ChEMBL reports lisinopril ACE IC50 at 1.2–4.7 nM. Therapeutic plasma
 *     lisinopril after 20 mg peaks near 140–200 nM, i.e. 30–150x that. Feed the
 *     in-vitro number in as an EC50 and every therapeutic dose saturates at
 *     99.97 % of Emax, the dose–response goes flat, and "half a tablet" and
 *     "four tablets" give the same blood pressure.
 *
 *     Every concentration→effect parameter below is derived from CLINICAL
 *     dose–response or label-stated concentration–effect data. `substances.json`
 *     fields `pd.potency.ic50_nm` / `ki_nm` / `kd_nm` are never read by
 *     src/engine/**. There is a test (potency-trap.test.ts) that greps for them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DrugId } from '../types'

export const ENGINE_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Drug classes and pathways — spec §4.4 "the mechanism graph"
// ---------------------------------------------------------------------------

export type DrugClass = 'ACEI' | 'ARB' | 'CCB' | 'THIAZIDE' | 'BETA'
export type Pathway = 'RAAS' | 'LTYPE' | 'NCC' | 'B1'

export const DRUG_CLASS: Record<DrugId, DrugClass> = {
  lisinopril: 'ACEI',
  losartan: 'ARB',
  // EXP3174 is losartan's active metabolite. It is never dosed directly; it is
  // carried as a separate species because half-life, clearance, potency,
  // protein binding and receptor mechanism all differ from the parent.
  exp3174: 'ARB',
  amlodipine: 'CCB',
  hydrochlorothiazide: 'THIAZIDE',
  metoprolol: 'BETA',
}

/**
 * ⚠️ CLASS PAIRS ARE NOT SYMMETRIC, and a single global pooling rule cannot
 * express that. This constant is the mechanism graph's one cross-link.
 *
 * A beta-blocker suppresses renin secretion and lowers angiotensin II — it has
 * already done part of an ACE inhibitor's job before the ACE inhibitor arrives.
 * The add-on meta-analysis (PMC9994166) measures the consequence directly: the
 * incremental effect of adding a beta-blocker is
 *      on a diuretic          −10.2 mmHg (−14.2, −6.2)
 *      on a calcium blocker    −4.1 mmHg (−7.1, −1.0)
 *      on a RAS inhibitor      −2.9 mmHg (−4.3, −1.5)
 * So beta-blocker + RAS inhibitor is the sub-additive pair, and beta-blocker +
 * thiazide is the near-additive one.
 *
 * Modelled by routing this FRACTION of a beta-blocker's effect through the RAAS
 * pathway pool rather than its own, so the sub-additivity emerges from the same
 * ceiling arithmetic that produces the dual-RAAS result. No new formula.
 *
 * 0.20 is a MODERATE penalty, deliberately. Those add-on trials ran at lower
 * on-treatment baseline pressures, and effect size scales with pre-treatment
 * pressure (§4.5a), so part of the observed attenuation is confounding rather
 * than pharmacology — and Wald 2009's own beta-blocker obs/exp ratio was 1.00
 * (0.76–1.24). Applying the full 0.31 attenuation the add-on data implies would
 * be over-reading it. ESTIMATED.
 *
 * research/00-DECISIONS.md §10.6 states the asymmetry the other way round
 * (beta-blocker + thiazide sub-additive). The add-on meta-analysis quoted in
 * 03-SIMULATION-SPEC.md §4.3, which carries the actual numbers and a citation,
 * says the opposite, and it is followed here.
 */
export const BETA_RENIN_CROSSOVER = 0.2

export const CLASS_PATHWAY: Record<DrugClass, Pathway> = {
  ACEI: 'RAAS',
  ARB: 'RAAS',
  CCB: 'LTYPE',
  THIAZIDE: 'NCC',
  BETA: 'B1',
}

/**
 * The D = 1 anchor for the whole engine (spec §11 cross-agent note to Agent B).
 * Doses are converted to multiples of these before the Emax fit is evaluated.
 * metoprolol is the tartrate immediate-release standard.
 */
export const STANDARD_DOSE_MG: Record<DrugId, number> = {
  lisinopril: 20,
  losartan: 50,
  exp3174: 50, // not dosed; present only so the record is total
  amlodipine: 5,
  hydrochlorothiazide: 25,
  metoprolol: 100,
}

/** Drugs a user can actually put in a regimen. exp3174 is metabolite-only. */
export const DOSABLE_DRUGS: DrugId[] = [
  'lisinopril',
  'losartan',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

export const ALL_DRUG_IDS: DrugId[] = [
  'lisinopril',
  'losartan',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

// ---------------------------------------------------------------------------
// §4.1 — Law 2003 Emax fits. THE clinical dose–response anchor.
// Law MR, Wald NJ, Morris JK, Jordan RE. BMJ 2003;326:1427.
// https://pmc.ncbi.nlm.nih.gov/articles/PMC162261/
//
// E(D) = Emax * D / (ED50 + D),  D in MULTIPLES OF THE STANDARD DOSE.
// Fitted by least squares over the paper's three published dose points
// (1/2x, 1x, 2x). RMSE <= 0.15 mmHg.
//
// ⚠️ Emax here is a CURVE-FIT ASYMPTOTE, not a physiological maximum, and must
//    never be shown to a user as "the maximum possible effect".
// ---------------------------------------------------------------------------

export interface EmaxFit {
  emax: number
  ed50: number
}

export const EMAX_FIT: Record<DrugClass, { sbp: EmaxFit; dbp: EmaxFit }> = {
  THIAZIDE: { sbp: { emax: 11.75, ed50: 0.305 }, dbp: { emax: 5.64, ed50: 0.267 } },
  BETA: { sbp: { emax: 13.25, ed50: 0.409 }, dbp: { emax: 8.91, ed50: 0.305 } },
  ACEI: { sbp: { emax: 11.71, ed50: 0.357 }, dbp: { emax: 6.93, ed50: 0.449 } },
  ARB: { sbp: { emax: 15.23, ed50: 0.477 }, dbp: { emax: 7.64, ed50: 0.347 } },
  CCB: { sbp: { emax: 17.41, ed50: 0.977 }, dbp: { emax: 12.0, ed50: 1.036 } },
}

/** Law 2003 all-category row, used for the Lancet-2025 global anchors. */
export const EMAX_FIT_ALL = {
  sbp: { emax: 13.24, ed50: 0.44 },
  dbp: { emax: 7.7, ed50: 0.383 },
}

/**
 * VALIDITY WINDOW (spec §4.1, validation FM-01). The fit spans three points at
 * 0.5x–2x standard dose. Outside 0.25x–4x it is an extrapolation: clamp and
 * flag. `Emax` is not a physiological ceiling.
 */
export const DOSE_WINDOW_MIN = 0.25
export const DOSE_WINDOW_MAX = 4.0

// ---------------------------------------------------------------------------
// §4.4 — pooling ceilings, mmHg. All ESTIMATED.
// ---------------------------------------------------------------------------

export const PATHWAY_CEILING: Record<Pathway, { sbp: number; dbp: number }> = {
  // Calibrated so ACEi + ARB reproduces the ONTARGET increment (+2.4/1.4 mmHg
  // over ramipril alone). The least evidence-backed constant in the engine and
  // the one that decides the dual-RAAS answer — see 06-VALIDATION.md FM-07.
  RAAS: { sbp: 11.5, dbp: 7.0 },
  // Placeholders: only bind if a SECOND drug on the same pathway is added.
  // Inert for the shipped five-drug set.
  NCC: { sbp: 11.8, dbp: 5.7 },
  LTYPE: { sbp: 17.5, dbp: 12.0 },
  B1: { sbp: 13.3, dbp: 8.9 },
}

/**
 * Global cross-pathway ceiling. Two calibrations are shipped and the choice is
 * explicit, because the two source bodies genuinely disagree:
 *
 *  - `law2003`  (DEFAULT, and what 03-SIMULATION-SPEC.md §4.4 specifies)
 *    C_g = 150/90. Makes step 3 near-additive, reproducing Wald 2009's
 *    observed/expected ratio of 1.01 (95 % CI 0.90–1.12).
 *
 *  - `lancet2025`
 *    C_g = 30.3/18.2. Reproduces the 2025 Lancet meta-analysis (484 trials,
 *    104 176 participants, PMID 40885583): monotherapy −8.7 mmHg, dual
 *    combination at one standard dose −14.9 mmHg, i.e. 0.856 of strict
 *    additivity. Derived: E = e1 + e2 − e1·e2/C ⇒ 17.4 − 8.7²/C = 14.9
 *    ⇒ C = 30.3. DBP scaled by the same factor (the abstract gives no DBP
 *    anchor).
 *
 * These two cannot both be satisfied — see research/08-EXTERNAL-RECONCILIATION
 * §1. The default follows the spec; the alternative exists so the disagreement
 * is inspectable rather than hidden.
 */
export type GlobalCalibration = 'law2003' | 'lancet2025'

export const GLOBAL_CEILING: Record<GlobalCalibration, { sbp: number; dbp: number }> = {
  law2003: { sbp: 150, dbp: 90 },
  lancet2025: { sbp: 30.3, dbp: 18.2 },
}

// ---------------------------------------------------------------------------
// §4.5(a) — pre-treatment blood-pressure scaling. Law 2003, verbatim:
// "If the pretreatment blood pressure was 10 mm Hg higher, the reduction in
//  blood pressure with one drug at standard dose increased on average by
//  1.0 (0.7 to 1.2) mm Hg systolic and 1.1 (0.8 to 1.4) mm Hg diastolic."
//
// The single most important guard against nonsense in the healthy-volunteer
// case: without it a normotensive twin gets a full 9 mmHg drop per drug.
// ---------------------------------------------------------------------------

export const LAW_REFERENCE_SBP = 154
export const LAW_REFERENCE_DBP = 97
/**
 * Efficacy lost per mmHg of LOWER pre-treatment systolic pressure, as a fraction
 * of the mean 9.1 mmHg monotherapy effect.
 *
 * Law 2003 gives 1.0 mmHg per 10 mmHg (95 % CI 0.7–1.2). The 2025 Lancet
 * meta-analysis (PMID 40885583, 484 trials, 104 176 participants — ten times
 * Law's and Wald's combined participant count) gives **1.3 mmHg per 10 mmHg
 * (1.0–1.5)**, and research/08-EXTERNAL-RECONCILIATION.md §1 names this as the
 * one anchor from that paper the engine did not previously have and should
 * simply adopt.
 *
 * We use 1.3. It sits inside Law's own upper CI, it is the better-powered
 * estimate, and it matters: at 1.0 a normotensive 118/76 subject still receives
 * a 5.2 mmHg drop from a single drug, which is above the 5.0 mmHg ceiling PD-17
 * sets as the guard against nonsense output in the healthy-volunteer case. At
 * 1.3 the same subject gets 4.2 mmHg. Understating this term overstates benefit
 * precisely in mildly hypertensive patients — the population where a clinician
 * would question the output first.
 */
export const BASELINE_SLOPE_SBP = 1.3 / 10 / 9.1
/** 1.1 mmHg per 10 mmHg against the 5.5 mmHg mean. */
export const BASELINE_SLOPE_DBP = 1.1 / 10 / 5.5
export const BASELINE_SCALE_CLAMP: [number, number] = [0.4, 1.8]

// ---------------------------------------------------------------------------
// §4.7 — Law 2003 adverse-symptom prevalence (treated minus placebo), by dose.
// Efficacy rises sub-linearly with dose; visible harm rises supra-linearly.
// That asymmetry is why PilSim recommends a BEST dose, not a MAXIMUM dose.
// Consumed by the report/ranker as the safety term (SAT-05).
// ---------------------------------------------------------------------------

export const ADVERSE_SYMPTOM_PREVALENCE: Record<
  DrugClass,
  { half: number; standard: number; double: number; withdrawal: number }
> = {
  THIAZIDE: { half: 0.02, standard: 0.099, double: 0.178, withdrawal: 0.001 },
  BETA: { half: 0.055, standard: 0.075, double: 0.094, withdrawal: 0.008 },
  ACEI: { half: 0.039, standard: 0.039, double: 0.039, withdrawal: 0.001 },
  ARB: { half: -0.018, standard: 0.0, double: 0.019, withdrawal: -0.002 },
  CCB: { half: 0.016, standard: 0.083, double: 0.149, withdrawal: 0.014 },
}

/**
 * NORVASC label adverse-reaction table, N = 275/296/268/520.
 * Peripheral oedema by amlodipine dose. Steeply supra-linear — the best single
 * number in the whole dataset for the safety half of the objective function.
 * Sex effect from the same label: 14.6 % women vs 5.6 % men.
 */
export const AMLODIPINE_EDEMA = {
  placebo: 0.006,
  mg2_5: 0.018,
  mg5: 0.03,
  mg10: 0.108,
  femaleRate: 0.146,
  maleRate: 0.056,
}

// ---------------------------------------------------------------------------
// §5.4 — the six-state cardiovascular homeostasis ODE.
// All ESTIMATED; their provenance is the calibration in homeostasis.ts, which
// bisects each drug's pathway gain until the ODE's converged ΔSBP equals the
// §4.1 Emax value at D = 1.
// ---------------------------------------------------------------------------

export const ODE = {
  /** baroreflex gain on the (resetting) pressure error */
  G_b: 0.55,
  /** renin response to the (non-resetting, renal) pressure error */
  G_r: 0.9,
  /** beta1-mediated renin release from sympathetic tone */
  G_s: 0.6,
  /** fraction of renin secretion that is beta1-dependent */
  rho_b1: 0.65,
  /** pressure-natriuresis gain */
  k_p: 0.55,
  /** aldosterone-driven Na/volume retention */
  k_a: 0.28,
  /** SVR sensitivity to AngII */
  g_A: 0.42,
  /** SVR sensitivity to sympathetic tone */
  g_S: 0.35,
  /**
   * HR sensitivity to sympathetic tone. NOT the spec's 0.55 — it is solved at
   * run time so that the ACUTE baroreflex slope equals Agent D's derived
   * −1.23 bpm/mmHg at the subject's own baseline heart rate (EN-12). The spec
   * explicitly instructs this substitution (§5.2 binding note).
   */
  h_S_fallback: 0.55,
  /** contractility sensitivity to sympathetic tone */
  c_S: 0.4,
  /** Frank–Starling exponent, normalised */
  alpha: 0.9,
  /** max fractional volume loss at full NCC blockade */
  delta_NCC: 0.26,
  /** max fractional SVR reduction at full L-type blockade */
  delta_L: 0.155,
  /** max fractional HR reduction at full beta1 blockade (calibrated, VAL-01) */
  delta_HR: 0.17,
  /** max fractional contractility reduction at full beta1 blockade */
  delta_C: 0.13,
  /**
   * Baroreceptor resetting. NOT in the spec's six states; added because EN-12
   * (acute baroreflex slope −1.23 bpm/mmHg) and VAL-09 (chronic amlodipine
   * ΔHR within −4…+3 bpm) are mutually unsatisfiable without it. Neural
   * baroreflex setpoint drifts toward prevailing pressure over ~1 day; the
   * RENAL function curve does not reset, which is why pressure-natriuresis and
   * renin still see the original setpoint. Standard Guyton position.
   * ESTIMATED.
   */
  reset_fraction: 0.85,
  tau_reset_h: 24,
} as const

/** Time constants, hours. These are what produce the plausible time course. */
export const TAU = {
  HR: 2 / 60,
  S: 5 / 60,
  R: 30 / 60,
  C: 30 / 60,
  A: 6,
  /** why thiazides take ~2 weeks to reach full effect */
  V: 72,
  Pset: ODE.tau_reset_h,
  /** plasma renin activity readout */
  PRA: 2,
} as const

/** §5.6 hard physiological constraints, applied after every step. */
export const GUARD = {
  MAP_FLOOR: 60,
  SBP_SYMPTOM: 90,
  DBP_SYMPTOM: 50,
  HR_BRADY: 45,
  K_HIGH: 5.5,
  K_LOW: 3.0,
} as const

export const STATE_CLAMP = {
  S: [0.2, 3.0] as [number, number],
  A: [0.02, 5.0] as [number, number],
  V: [0.5, 1.5] as [number, number],
  R: [0.3, 2.5] as [number, number],
  C: [0.4, 2.0] as [number, number],
}

// ---------------------------------------------------------------------------
// §8.6b — receptor-occupancy targets. All ESTIMATED, all anchored to the
// THERAPEUTIC concentration range at the standard dose (never to a binding
// assay — see the header of this file).
// ---------------------------------------------------------------------------

export const OCCUPANCY_TARGET = {
  /** lisinopril 20 mg, plasma ACE */
  ace: 0.8,
  /** losartan 50 mg, parent + w_m x EXP3174 */
  at1: 0.85,
  /** losartan 50 mg, PARENT ONLY — this is why it peaks ~2.5 h earlier */
  urat1: 0.3,
  /** amlodipine 5 mg */
  cav12: 0.5,
  /** HCTZ 25 mg — driven by DOSE, not plasma concentration */
  ncc: 0.45,
} as const

/**
 * Metoprolol beta1 EC50. UNLIKE every other EC50 in the engine this one is
 * label-sourced rather than back-fitted: the Lopressor label states the
 * concentration–effect relationship for exercise heart rate directly
 * (30 nmol/L → 30 % of maximum, 540 nmol/L → 80 %), which solves to
 * EC50 = 90 nmol/L = 24 ng/mL with Hill ≈ 1.
 * It is a CLINICAL concentration–effect curve, not a binding constant, so it is
 * admissible under §1. It independently reproduces Agent F's 0.73 beta1
 * occupancy target at 100 mg b.i.d. — a genuine cross-check.
 * Source: FDA LOPRESSOR SPL 0283bc9d-6998-493a-824a-d4c85f704111.
 */
export const METOPROLOL_EC50_B1_NG_ML = 24.0

/**
 * beta2 / beta1 EC50 ratio. DERIVED from Agent F's sourced occupancy target
 * pair (beta1 0.73, beta2 0.16 at 100 mg b.i.d.):
 *   rho = (θ1(1−θ2)) / (θ2(1−θ1)) = (0.73·0.84)/(0.16·0.27) ≈ 14.2
 * Supersedes the ESTIMATED 75 in spec §3.5. A dimensionless RATIO, so it is
 * not subject to the §1 potency trap.
 */
export const METOPROLOL_RHO_SEL = 14.2

/**
 * ⚠️ The concentration at which metoprolol stops being cardioselective.
 * FDA LOPRESSOR label, verbatim: "The relative beta1-selectivity of metoprolol
 * diminishes and blockade of beta2-adrenoceptors increases at plasma
 * concentration above 300 nmol/L." 300 nmol/L x 0.26736 = 80.2 ng/mL.
 * CITED, tier 1. This is what makes the asthma interaction dose- and
 * genotype-dependent rather than binary (CM-04, CM-05).
 */
export const METOPROLOL_BETA2_CROSSOVER_NG_ML = 80.2

// ---------------------------------------------------------------------------
// §8.6c — plasma renin activity output equation gains. ESTIMATED, calibrated
// to the one sourced anchor: losartan 100 mg doubles-to-triples PRA.
// PRA is an OUTPUT, not an ODE state feeding back: AT1 blockade decouples renin
// from its downstream effect, so PRA rises 2–3x while the vascular AngII signal
// falls. Feeding PRA back into `A` would wrongly propagate that rise into BP.
// ---------------------------------------------------------------------------

export const PRA_GAIN = { at1: 1.5, ace: 1.2, ncc: 0.8 } as const

// ---------------------------------------------------------------------------
// §5.5 — empirical electrolyte / urate offsets. Not a nephron model.
// Magnitudes validated against VAL-05…VAL-08 and VAL-11.
// Expressed per unit of the driving target engagement at steady state.
// ---------------------------------------------------------------------------

export const LAB_GAINS = {
  /** mmol/L serum K per unit ACE inhibition. VAL-11: +0.1 at lisinopril 20 mg (ace 0.80). */
  k_from_ace: 0.1 / 0.8,
  /** smaller than the ACE inhibitor's. ESTIMATED direction-certain. */
  k_from_at1: 0.06 / 0.85,
  /** VAL-05: −0.30 mmol/L at HCTZ 25 mg (ncc 0.45). */
  k_from_ncc: -0.3 / 0.45,
  /** VAL-07: +0.55 mg/dL urate at HCTZ 25 mg. */
  urate_from_ncc: 0.55 / 0.45,
  /** VAL-08: −0.29 mg/dL urate at losartan 50 mg (urat1 0.30). Placebo-controlled figure. */
  urate_from_urat1: -0.29 / 0.3,
  /**
   * Serum sodium on HCTZ: genuinely NOT_FOUND as a pooled number (06-VALIDATION
   * §11 item 8 — Cochrane omitted sodium; a 2019 review states the data does not
   * exist). Do NOT publish a number. Zero, and the UI says so.
   */
  na_from_ncc: 0,
} as const

/** Slow channels ramp with these time constants (§5.5). */
export const LAB_TAU = { k: 72, na: 72, urate: 168 } as const

// ---------------------------------------------------------------------------
// §3.3 — CYP2D6 clearance multipliers for metoprolol.
// PM anchored to CPIC 2024 (PMID 38951961): "nearly five-fold increase in AUC"
// ⇒ f_CYP(PM) = 1/4.8 ≈ 0.21. IM/UM are ESTIMATED; CPIC issues a therapeutic
// recommendation ONLY for the poor metaboliser and NONE for the ultrarapid, so
// the report must not recommend a dose change for IM or UM.
// ---------------------------------------------------------------------------

/**
 * ⚠️ CYP2D6 acts on metoprolol TWICE — systemic clearance AND first pass — and a
 * clearance-only model reproduces exactly one of the three published ratios.
 *
 * Blake 2013 (PMC3818912) gives all three for PM vs NM: AUC 4.9x, Cmax 2.3x,
 * t½ 2.3x. Putting the whole 4.9-fold exposure change into clearance gives
 * t½ 16.7 h (the label says PM t½ is 7–9 h) and Cmax only 1.2x. It fails PK-26
 * and PK-27 while passing PK-25.
 *
 * Splitting it reproduces all three, and it is the right mechanism: metoprolol's
 * 50 % bioavailability is limited by pre-systemic CYP2D6 metabolism, which a poor
 * metaboliser barely performs. The label corroborates it from the other end —
 * PMs excrete "up to 30 % or 40 %" unchanged against "less than 5 %" in NMs.
 *
 *   t½ ratio 2.3   ⇒ CL factor  = 1/2.3 = 0.435
 *   AUC ratio 4.9  ⇒ F factor   = 4.9 x 0.435 ≈ 1.9  (F 0.50 → 0.95)
 *
 * IM/UM factors remain ESTIMATED. CPIC 2024 issues a therapeutic recommendation
 * ONLY for the poor metaboliser and NONE for the ultrarapid, so the report may
 * show an exposure difference for IM/UM but must not recommend a dose change.
 */
export const CYP2D6_CL_FACTOR = { poor: 0.435, intermediate: 0.78, normal: 1.0, ultrarapid: 1.3 }
export const CYP2D6_F_FACTOR = { poor: 1.9, intermediate: 1.2, normal: 1.0, ultrarapid: 0.92 }

/**
 * §3.4a CYP2C9 → losartan conversion fraction. Yasar 2002 (PMID 11823761),
 * implemented as a divisor on f_m. Evidence is CONTESTED (Bae 2012 found no
 * difference; a 2021 meta-analysis found it significant only in Asian
 * subgroups) and there is NO CPIC or DPWG guideline for losartan — the highest
 * evidence is PharmGKB level 3. The UI must carry a "contested evidence" badge.
 */
export const CYP2C9_FM_DIVISOR = { normal: 1.0, intermediate: 2.0, poor: 30.0 }

// ---------------------------------------------------------------------------
// §6.2 — Ettehad 2016 Lancet 387:957-967 (PMID 26724178), 5-year projection.
// "every 10 mm Hg reduction in systolic blood pressure significantly reduced
//  the risk of major cardiovascular disease events (RR 0.80, 0.77–0.83),
//  coronary heart disease (0.83, 0.78–0.88), stroke (0.73, 0.68–0.77), and
//  heart failure (0.72, 0.67–0.78) … 13 % reduction in all-cause mortality
//  (0.87, 0.84–0.91)."
// ---------------------------------------------------------------------------

export const ETTEHAD_RR_PER_10 = {
  majorCvEvent: { point: 0.8, lo: 0.77, hi: 0.83 },
  coronaryHeartDisease: { point: 0.83, lo: 0.78, hi: 0.88 },
  stroke: { point: 0.73, lo: 0.68, hi: 0.77 },
  heartFailure: { point: 0.72, lo: 0.67, hi: 0.78 },
  allCauseDeath: { point: 0.87, lo: 0.84, hi: 0.91 },
} as const

// ---------------------------------------------------------------------------
// research/08-EXTERNAL-RECONCILIATION.md §1 — the four verified 2025 Lancet
// anchors (PMID 40885583, 484 trials, 104 176 participants, baseline 154/100).
// ---------------------------------------------------------------------------

export const LANCET_2025 = {
  baselineSbp: 154,
  baselineDbp: 100,
  monotherapyStandardDose: { point: 8.7, lo: 8.2, hi: 9.2 },
  perDoublingMonotherapy: { point: 1.5, lo: 1.2, hi: 1.7 },
  dualCombinationStandardDose: { point: 14.9, lo: 13.1, hi: 16.8 },
  perDoublingDual: { point: 2.5, lo: 1.4, hi: 3.7 },
  /** efficacy lost per 10 mmHg LOWER baseline systolic, monotherapy */
  perTenLowerBaseline: { point: 1.3, lo: 1.0, hi: 1.5 },
} as const

// ---------------------------------------------------------------------------
// Reference subject REF-1 (06-VALIDATION.md header). 55 y male, 70 kg, BMI 26,
// eGFR 90, CYP2D6 NM, CYP2C9 *1/*1, no comorbidities, 154/97, HR 72, CO 5.0,
// K 4.2, Na 140, urate 5.5.
// ---------------------------------------------------------------------------

export const REF1 = {
  age_years: 55,
  sex: 'male' as const,
  weight_kg: 70,
  height_cm: 175,
  sbp: 154,
  dbp: 97,
  hr: 72,
  co: 5.0,
  cvp: 5,
  egfr: 90,
  serum_k: 4.2,
  serum_na: 140,
  serum_urate: 5.5,
  serum_creatinine: 1.0,
  fasting_glucose: 95,
}
