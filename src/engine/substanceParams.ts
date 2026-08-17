/**
 * Per-substance pharmacokinetic / effect-compartment parameters.
 *
 * SOURCE OF TRUTH: `data/substances.json`, field `<substance>.pk.model_defaults`
 * plus the cited `pk.tmax_h`, `pk.half_life_h`, `pk.lag_time_h` and
 * `pk.fraction_excreted_unchanged_urine`. Values are mirrored here rather than
 * imported so the engine stays a dependency-free module that typechecks in
 * milliseconds and runs unchanged inside a Web Worker with no fetch.
 * `substance-data-drift.test.ts` reads data/substances.json off disk and fails
 * if this table and the file disagree — the mirror cannot silently rot.
 *
 * ⚠️ NOTHING under `pd.potency` (`ic50_nm`, `ki_nm`, `kd_nm`) is read here or
 *    anywhere else in src/engine/**. See constants.ts header, spec §1.
 */

import type { DrugId } from '../types'

export interface SubstancePk {
  id: DrugId
  /** oral bioavailability, fraction */
  F: number
  /** first-order absorption rate constant, 1/h */
  ka: number
  /** absorption lag, h */
  lag: number
  /** apparent volume of distribution, L */
  vd_l: number
  /** clearance, L/h */
  cl_l_h: number
  /** cited elimination half-life, h — the ACCUMULATION half-life, not terminal */
  half_life_h: number
  /** fraction of the dose cleared unchanged by the kidney (spec §3.3 f_ru) */
  f_renal_unchanged: number
  /** effect-compartment equilibration rate constant, 1/h (spec §3.4b). ESTIMATED. */
  ke0: number
  /** population CV% for the log-normal sampler (spec §7.1) */
  cv: { ka: number; F: number; vd: number; cl: number }
  /**
   * Labelled/published Cmax at `cmaxRefDoseMg`, ng/mL — used to solve the
   * apparent-volume scale (see APPARENT_VOLUME_SCALE below). null = no calibration.
   */
  cmaxTargetNgMl: number | null
  cmaxRefDoseMg: number
  /** molecular weight, g/mol — needed for the parent→metabolite molar conversion */
  mw: number
}

/**
 * ⚠️ VOLUMES OF DISTRIBUTION FOR LOSARTAN AND EXP3174 — READ BEFORE "FIXING".
 *
 * The COZAAR label prints Vd = 34 L (losartan) and 12 L (EXP3174). Those are
 * STEADY-STATE volumes and they are mutually inconsistent with the CLEARANCE
 * and HALF-LIFE on the very same label:
 *
 *     ke = CL / Vd = 36 / 34 = 1.06 h⁻¹  ⇒  t½ = 0.65 h,
 *     against the label's own stated 2 h.
 *
 * Using the printed numbers makes losartan disappear roughly THREE TIMES too
 * fast, and once-daily dosing stops working in the model. The engine therefore
 * uses the DERIVED terminal-phase volumes 109 L and 32 L, each of which
 * satisfies V = CL / ke with the labelled clearance and the labelled half-life.
 *
 * This is deliberate. A reviewer comparing the engine against the label will
 * otherwise conclude it is a transcription error. It is not.
 * (research/00-DECISIONS.md §10.3; spec §3.4c; validation PD-19.)
 *
 * General rule: whenever CL, Vd and t½ are all quoted from one label, check
 * t½ = ln2·Vd/CL before use. PD-19 asserts it across the whole dataset.
 */
export const SUBSTANCE_PK: Record<DrugId, SubstancePk> = {
  lisinopril: {
    id: 'lisinopril',
    F: 0.25, // label: "approximately 25 %, with large intersubject variability (6 % to 60 %)"
    ka: 0.285,
    lag: 0.5,
    vd_l: 124,
    cl_l_h: 4.7,
    // 12 h EFFECTIVE/accumulation half-life, NOT the ~40 h terminal phase, which
    // the label itself says "does not contribute to drug accumulation" and which
    // represents saturable ACE binding — a PD phenomenon, not a PK compartment.
    // PK-03b asserts the engine does not use 40 h.
    half_life_h: 12,
    f_renal_unchanged: 1.0, // "excreted unchanged entirely in the urine"
    // Fast k_e0 on a SLOWLY-absorbing drug: the effect site tracks the rising
    // limb closely, so ACE inhibition is near-maximal long before plasma peaks.
    // This is what makes onset ~1 h precede Tmax ~7 h (PD-18). ESTIMATED.
    ke0: 1.4,
    cv: { ka: 40, F: 64, vd: 30, cl: 45 },
    cmaxTargetNgMl: 40.7, // PK-02, 10 mg, Beermann via label PK study
    cmaxRefDoseMg: 10,
    mw: 405.5,
  },
  losartan: {
    id: 'losartan',
    F: 0.33,
    ka: 2.25,
    lag: 0.25,
    vd_l: 109, // DERIVED — see the block comment above. NOT the label's 34 L.
    cl_l_h: 36, // label: 600 mL/min
    half_life_h: 2.1,
    f_renal_unchanged: 0.04,
    ke0: 0.7,
    cv: { ka: 40, F: 35, vd: 30, cl: 39 },
    cmaxTargetNgMl: 224, // PK-06, COZAAR SPL Table 2, 50 mg x 7 d
    cmaxRefDoseMg: 50,
    mw: 422.9,
  },
  exp3174: {
    id: 'exp3174',
    F: 1, // formed, not absorbed — see METABOLITE below
    ka: 0,
    lag: 0,
    vd_l: 32, // DERIVED — see the block comment above. NOT the label's 12 L.
    cl_l_h: 3, // label: 50 mL/min
    half_life_h: 7.4,
    f_renal_unchanged: 0.06,
    ke0: 0.7,
    cv: { ka: 0, F: 45, vd: 30, cl: 27 },
    cmaxTargetNgMl: 212, // PK-08, COZAAR SPL Table 2, after losartan 50 mg
    cmaxRefDoseMg: 50,
    mw: 436.9,
  },
  amlodipine: {
    id: 'amlodipine',
    F: 0.77,
    ka: 0.35,
    lag: 0.5,
    vd_l: 1470,
    cl_l_h: 25.5,
    half_life_h: 40,
    f_renal_unchanged: 0.1,
    ke0: 0.35,
    cv: { ka: 40, F: 13, vd: 30, cl: 35 },
    cmaxTargetNgMl: 4.042, // PK-14, Faulkner 1986 (peer-reviewed; not in the label)
    cmaxRefDoseMg: 5,
    mw: 408.9,
  },
  hydrochlorothiazide: {
    id: 'hydrochlorothiazide',
    F: 0.7,
    ka: 0.9,
    lag: 0.25,
    vd_l: 210,
    cl_l_h: 14.7,
    half_life_h: 10,
    f_renal_unchanged: 0.7, // "about 70 % ... eliminated in the urine as unchanged drug"
    ke0: 0.5,
    cv: { ka: 40, F: 25, vd: 30, cl: 35 },
    cmaxTargetNgMl: 142, // PK-17
    cmaxRefDoseMg: 25,
    mw: 297.7,
  },
  metoprolol: {
    id: 'metoprolol',
    F: 0.5, // "about 50 % because of pre-systemic metabolism"
    ka: 1.6,
    lag: 0.2,
    vd_l: 308,
    cl_l_h: 61,
    half_life_h: 3.5,
    f_renal_unchanged: 0.05,
    ke0: 1.0,
    cv: { ka: 45, F: 40, vd: 25, cl: 50 },
    cmaxTargetNgMl: 154.6, // PK-20, published PK study (CV 84 %)
    cmaxRefDoseMg: 100,
    mw: 267.4,
  },
}

/**
 * Losartan → EXP3174. Spec §3.4. Two species, never one.
 *
 * 14 % of the dose x 10–40x the potency by weight ⇒ the metabolite carries
 * roughly 60–85 % of the total AT1 effect, and its 6–9 h half-life — not
 * losartan's 2.1 h — is what makes once-daily dosing work. A single-species
 * losartan model gives a drug that is gone by lunchtime.
 */
export const METABOLITE = {
  /**
   * COZAAR label: "About 14 % of an orally-administered dose of losartan is
   * converted to the active metabolite." Note "of an ADMINISTERED dose", not of
   * the absorbed fraction — conversion happens substantially on first pass, so
   * f_m is applied to D, not to F·D. Applying it to F·D under-predicts the
   * labelled EXP3174 Cmax threefold.
   */
  f_m: 0.14,
  /**
   * Fraction of the conversion that is PRE-SYSTEMIC (first pass), the remainder
   * being formed from parent already in plasma. DERIVED, not guessed: a purely
   * pre-systemic chain peaks at 1.5 h and a purely systemic one at 5.9 h, while
   * the label states EXP3174 Tmax = 3.5 h (PK-07). Solving for the mixture that
   * reproduces 3.5 h gives 0.507 — i.e. about half the conversion is first-pass,
   * which is consistent with losartan's 33 % oral bioavailability.
   */
  firstPassFraction: 0.5074,
  /**
   * ⚠️ w_m, the metabolite:parent potency ratio by weight, is a 4-FOLD RANGE,
   * not a number. COZAAR label: "10 to 40 times more potent by weight."
   * It is the single widest uncertainty in the whole parameter set.
   *
   *  - virtual population: sample LOG-uniform on [10, 40] (`w_m = 10·4^u`),
   *    because the label states a RATIO range and ratios are log-scaled;
   *  - single twin: run at 10 / 20 / 40 and report losartan as a BAND;
   *  - the §4 algebraic combination rule is UNAFFECTED — it works on dose, so
   *    the ranking is immune to w_m. That is a real advantage of the two-layer
   *    design and worth saying out loud.
   * Validation: PK-10b.
   */
  w_m_range: [10, 40] as [number, number],
  w_m_central: 20,
}

/**
 * ⚠️ APPARENT-VOLUME SCALE — a documented one-compartment compromise.
 *
 * The engine is one-compartment (spec §3.1). Real plasma profiles for all five
 * drugs are at least two-compartment: they peak high and then distribute. If we
 * use the terminal volume of distribution, the model reproduces Tmax and t½
 * exactly but under-predicts the LABELLED Cmax by roughly two- to threefold,
 * because a one-compartment model dilutes the whole dose into the terminal
 * volume instantly.
 *
 * You cannot have both in one compartment. We choose to reproduce Cmax and t½,
 * by scaling V and CL together by a single factor s per drug:
 *
 *     V_model = s·V_terminal,  CL_model = s·CL   ⇒  ke unchanged
 *     ⇒ t½ unchanged, Tmax unchanged, Cmax scaled by 1/s, AUC scaled by 1/s.
 *
 * Consequence stated plainly: ABSOLUTE AUC from this engine is not a clinical
 * AUC and must not be quoted as one. AUC RATIOS (which is all the validation
 * suite and the pharmacogenomics story use — PK-25, PK-28, CM-06) are exact,
 * because s cancels.
 *
 * The scale is SOLVED, not tuned: `s = Cmax_uncalibrated / Cmax_labelled`.
 * See pk.ts `solveApparentVolumeScale`.
 */
export const APPARENT_VOLUME_SCALE_ENABLED = true
