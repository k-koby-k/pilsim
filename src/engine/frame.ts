/**
 * EffectFrame assembly. Spec §8.6a is the engine ⇄ animation contract.
 * Every field of the interface is populated on every frame.
 *
 * Where the engine cannot produce a quantity honestly (no tissue compartments,
 * no venous compartment, no nephron model, no glucose model) the field is still
 * emitted, but it is marked PROXY in tiers.ts and the UI is contractually
 * forbidden from rendering it with absolute units.
 */

import type { DrugId, EffectFrame } from '../types'
import type { Engagement } from './pd'
import { bronchialRisk } from './pd'
import type { CvState, CvBaseline, Haemodynamics, GuardFlags } from './homeostasis'
import { AMLODIPINE_EDEMA, GUARD } from './constants'

/** Baselines the frame assembler needs beyond the CV set. */
export interface FrameBaselines {
  gfr: number
  renalBloodFlow: number
  filtrationFraction: number
  plasmaVolume: number
  ecfVolume: number
  serumK: number
  serumNa: number
  serumUrate: number
  serumCreatinine: number
  fastingGlucose: number
  fev1Pct: number
  /** fractional sodium reabsorption by segment; sums with excretion to 1 */
  fracNaPt: number
  fracNaTal: number
  fracNaDct: number
  fracNaCd: number
  /** absolute mediator baselines; null when Agent D has not published them */
  reninPra: number | null
  angII: number | null
  aldosterone: number | null
  /** 0 = no lung disease, 1 = asthma, 0.6 = COPD */
  airwaySensitivity: number
  /** 1.0 normal metaboliser; scales with CYP2D6 activity */
  cyp2d6CapacityFold: number
  sex: 'male' | 'female'
  amlodipineDoseMg: number
}

/** Slow empirical lab channels (§5.5), integrated separately from the CV ODE. */
export interface LabState {
  dK: number
  dNa: number
  dUrate: number
}

export interface FrameInputs {
  tHours: number
  conc: Record<DrugId, number>
  engagement: Engagement
  state: CvState
  haemo: Haemodynamics
  baseline: CvBaseline
  base: FrameBaselines
  labs: LabState
  flags: GuardFlags
}

export function assembleFrame(inp: FrameInputs): EffectFrame {
  const { engagement: e, state: st, haemo: h, base: b, baseline: cvb } = inp

  // --- mediators -----------------------------------------------------------
  // aldosterone tracks AngII sub-proportionally. ESTIMATED exponent.
  const aldosteroneFold = Math.pow(Math.max(0.01, st.A), 0.8)
  // ACE degrades bradykinin, so inhibiting ACE raises it. EXACTLY 1.00 for every
  // non-ACE-inhibitor, which is why cough is a lisinopril channel and not a
  // losartan one — the single cleanest class contrast in the product (EN-09).
  const bradykininFold = 1 + 1.5 * e.ace

  // --- haemodynamic derived ------------------------------------------------
  // Poiseuille: R ∝ r⁻⁴ ⇒ r_index = R_normalised^(−1/4)
  const arteriolarRadiusIndex = Math.pow(Math.max(0.05, st.R), -0.25)
  const venousToneIndex = 1 - 0.4 * (1 - st.S) // PROXY: no venous compartment
  // The amlodipine oedema mechanism: dihydropyridines dilate the ARTERIOLE
  // preferentially, so capillary hydrostatic pressure rises. Direction is
  // well established; the magnitude is ESTIMATED. PROXY.
  const capillaryHydrostatic = 1 + 0.6 * (1 - 1 / arteriolarRadiusIndex)

  // --- renal ---------------------------------------------------------------
  const afferentRadiusIndex = 1 + 0.1 * e.cav12
  // AngII constricts the efferent arteriole; blocking it dilates. ESTIMATED
  // magnitudes, well-established direction.
  const efferentRadiusIndex = 1 + 0.25 * e.at1 + 0.22 * e.ace
  // PROXY, normalised to 1.00 at baseline. Never render with mmHg.
  const pGlomerularIndex =
    (1 + 0.35 * (h.map / cvb.map0 - 1)) * (afferentRadiusIndex / efferentRadiusIndex)
  const gfr = b.gfr * Math.max(0.2, pGlomerularIndex)
  const renalBloodFlow = b.renalBloodFlow * (afferentRadiusIndex * (h.co / cvb.co0))
  const filtrationFraction = b.filtrationFraction * (gfr / b.gfr) / Math.max(0.2, renalBloodFlow / b.renalBloodFlow)

  const fracNaDct = b.fracNaDct * (1 - e.ncc)
  // Aldosterone drives collecting-duct Na/K exchange — the indirect K path.
  const fracNaCd = b.fracNaCd * (0.6 + 0.4 * aldosteroneFold)
  const naReabTotal = b.fracNaPt + b.fracNaTal + fracNaDct + fracNaCd
  const naExcretionFraction = Math.max(0.001, 1 - naReabTotal)
  const naExcretionRate = (gfr * 140 * naExcretionFraction) / 1000 // mmol/min-ish index
  // K secretion falls with aldosterone (the hyperkalaemia channel) and rises
  // with distal sodium delivery (the hypokalaemia channel). Opposite signs,
  // partial cancellation — the reason the lisinopril/HCTZ product exists.
  const distalNaDelivery = 1 + 2.2 * e.ncc
  const kExcretionRate = 1 * aldosteroneFold * distalNaDelivery
  const urateExcretionRate = 1 + 1.4 * e.urat1 - 0.8 * e.ncc
  const urineFlow = 1 + 0.9 * e.ncc + 0.3 * (1 - st.V)

  // --- chem ----------------------------------------------------------------
  const serumK = b.serumK + inp.labs.dK
  const serumNa = b.serumNa + inp.labs.dNa
  const serumUrate = b.serumUrate + inp.labs.dUrate
  const serumCreatinine = b.serumCreatinine * (b.gfr / Math.max(1, gfr))

  // --- periphery -----------------------------------------------------------
  const interstitialVolumeIndex = 1 + 0.55 * (capillaryHydrostatic - 1) + 0.15 * (st.V - 1)
  const edemaGrade = amlodipineEdemaGrade(b.amlodipineDoseMg, b.sex, e.cav12)

  // --- liver ---------------------------------------------------------------
  const firstPassLosartan = 1 - 0.33
  const firstPassAmlodipine = 1 - 0.77
  const firstPassMetoprolol = 1 - 0.5 * b.cyp2d6CapacityFold

  // --- lung ----------------------------------------------------------------
  const bronchial = bronchialRisk(e, b.airwaySensitivity)
  // Asthma −6.9 % FEV1 and COPD −2.05 % are DIFFERENT populations and must not
  // be pooled (CM-21). airwaySensitivity carries which one applies.
  const fev1 = b.fev1Pct * (1 - 0.069 * bronchial)
  const airwayTone = 1 + 0.5 * bronchial
  const coughHazard = coughRisk(e.ace)

  const conc = inp.conc

  return {
    t_h: inp.tHours,
    conc: {
      lisinopril: conc.lisinopril ?? 0,
      losartan: conc.losartan ?? 0,
      exp3174: conc.exp3174 ?? 0,
      amlodipine: conc.amlodipine ?? 0,
      hydrochlorothiazide: conc.hydrochlorothiazide ?? 0,
      metoprolol: conc.metoprolol ?? 0,
    },
    engagement: {
      ace_inhibition_plasma: e.ace,
      ace_inhibition_pulmonary: e.ace, // PROXY — no tissue compartments
      ace_inhibition_renal: e.ace, // PROXY — no tissue compartments
      at1_blockade: e.at1, // losartan + EXP3174 together
      cav12_block_vsmc: e.cav12,
      cav12_block_myocardium: 0.03 * e.cav12, // amlodipine is vascular-selective
      ncc_inhibition: e.ncc,
      urat1_inhibition: e.urat1, // PARENT losartan only
      beta1_occupancy: e.beta1,
      beta2_occupancy: e.beta2, // the selectivity-loss channel
    },
    mediators: {
      renin_pra: b.reninPra == null ? 0 : b.reninPra * st.PRA,
      renin_pra_fold: st.PRA,
      ang_ii: b.angII == null ? 0 : b.angII * st.A,
      ang_ii_fold: st.A,
      aldosterone: b.aldosterone == null ? 0 : b.aldosterone * aldosteroneFold,
      aldosterone_fold: aldosteroneFold,
      bradykinin_fold: bradykininFold,
      sympathetic_tone_fold: st.S,
    },
    haemo: {
      sbp: h.sbp,
      dbp: h.dbp,
      map: h.map,
      hr: st.HR,
      stroke_volume: h.sv,
      cardiac_output: h.co,
      svr: h.svr,
      arteriolar_radius_index: arteriolarRadiusIndex,
      venous_tone_index: venousToneIndex,
      capillary_hydrostatic_p: capillaryHydrostatic,
      contractility_index: st.C,
    },
    renal: {
      gfr,
      renal_blood_flow: renalBloodFlow,
      filtration_fraction: filtrationFraction,
      p_glomerular: pGlomerularIndex, // PROXY — index, not mmHg
      afferent_radius_index: afferentRadiusIndex,
      efferent_radius_index: efferentRadiusIndex,
      na_excretion_rate: naExcretionRate,
      k_excretion_rate: kExcretionRate,
      urate_excretion_rate: urateExcretionRate,
      urine_flow: urineFlow,
      frac_na_reab_pt: b.fracNaPt,
      frac_na_reab_tal: b.fracNaTal,
      frac_na_reab_dct: fracNaDct,
      frac_na_reab_cd: fracNaCd,
    },
    chem: {
      plasma_volume: b.plasmaVolume * st.V,
      ecf_volume: b.ecfVolume * st.V,
      serum_k: serumK,
      serum_na: serumNa,
      serum_urate: serumUrate,
      serum_creatinine: serumCreatinine,
      fasting_glucose: b.fastingGlucose, // PROXY — unmodelled, emitted unchanged
    },
    periph: {
      interstitial_volume_index: interstitialVolumeIndex,
      edema_grade: edemaGrade,
    },
    liver: {
      cyp3a4_flux: 1 + 0.4 * e.cav12,
      cyp2c9_flux: 1 + 0.8 * Math.min(1, (conc.losartan ?? 0) / 100),
      cyp2d6_flux: 1 + 0.6 * e.beta1,
      cyp2d6_capacity_fold: b.cyp2d6CapacityFold,
      first_pass_extraction: {
        losartan: firstPassLosartan,
        amlodipine: firstPassAmlodipine,
        metoprolol: firstPassMetoprolol,
      },
    },
    lung: {
      fev1_pct_baseline: fev1,
      airway_smooth_muscle_tone_index: airwayTone,
      bradykinin_airway_fold: bradykininFold,
      cough_hazard: coughHazard,
    },
    hazards: {
      cough: coughHazard,
      dizziness_orthostatic: orthostaticRisk(h, inp.flags),
      peripheral_edema: Math.min(1, edemaGrade / 3),
      bradycardia: st.HR < GUARD.HR_BRADY ? 1 : Math.max(0, (60 - st.HR) / 20),
      bronchospasm: bronchial,
      hyperkalemia: hyperkalaemiaRisk(serumK),
    },
  }
}

/**
 * VAL-10 — NORVASC label adverse-reaction table: peripheral oedema 1.8 / 3.0 /
 * 10.8 % at 2.5 / 5 / 10 mg against 0.6 % placebo (N = 275/296/268/520).
 * STRONGLY supra-linear in dose, not linear. Sex effect from the same label:
 * 14.6 % in women vs 5.6 % in men — so sex is a real modifier, not cosmetic.
 * Mapped onto the 0..3 clinical pitting scale.
 */
export function amlodipineEdemaIncidence(doseMg: number, sex: 'male' | 'female'): number {
  if (doseMg <= 0) return AMLODIPINE_EDEMA.placebo
  // The label's three points are NOT a power law — the dose ratios are 1.67 then
  // 3.6, i.e. the curve steepens sharply between 5 and 10 mg. Fitting a single
  // exponent through the endpoints smooths away exactly the feature that stops
  // the optimiser recommending 10 mg. Interpolate log-linearly BETWEEN the
  // published points and extrapolate on the last segment's slope.
  const pts: [number, number][] = [
    [2.5, AMLODIPINE_EDEMA.mg2_5],
    [5, AMLODIPINE_EDEMA.mg5],
    [10, AMLODIPINE_EDEMA.mg10],
  ]
  const ld = Math.log(doseMg)
  let p: number
  if (doseMg <= pts[0][0]) {
    p = pts[0][1] * (doseMg / pts[0][0])
  } else {
    let i = 0
    while (i < pts.length - 2 && doseMg > pts[i + 1][0]) i++
    const [d0, p0] = pts[i]
    const [d1, p1] = pts[i + 1]
    const f = (ld - Math.log(d0)) / (Math.log(d1) - Math.log(d0))
    p = Math.exp(Math.log(p0) + f * (Math.log(p1) - Math.log(p0)))
  }
  const sexFactor =
    sex === 'female'
      ? AMLODIPINE_EDEMA.femaleRate / ((AMLODIPINE_EDEMA.femaleRate + AMLODIPINE_EDEMA.maleRate) / 2)
      : AMLODIPINE_EDEMA.maleRate / ((AMLODIPINE_EDEMA.femaleRate + AMLODIPINE_EDEMA.maleRate) / 2)
  return Math.min(1, p * sexFactor + AMLODIPINE_EDEMA.placebo)
}

function amlodipineEdemaGrade(doseMg: number, sex: 'male' | 'female', occupancy: number): number {
  const incidence = amlodipineEdemaIncidence(doseMg, sex)
  // grade scales with incidence and with how much of the channel is engaged now
  return Math.min(3, incidence * 12 * Math.max(0, occupancy))
}

/**
 * Lisinopril cough. The label gives ONLY the placebo-subtracted excess
 * ("cough (by 2.5 %)"); an absolute lisinopril-vs-placebo rate is NOT_FOUND in
 * any current FDA label. So this returns the EXCESS, and the report must say so
 * rather than quoting an absolute rate (VAL-13).
 */
export function coughRisk(aceInhibition: number): number {
  return 0.025 * (aceInhibition / 0.8)
}

function orthostaticRisk(h: Haemodynamics, flags: GuardFlags): number {
  if (flags.hypotensionFloorHit) return 1
  const margin = (h.sbp - GUARD.SBP_SYMPTOM) / 30
  return Math.min(1, Math.max(0, 1 - margin))
}

function hyperkalaemiaRisk(k: number): number {
  if (k >= GUARD.K_HIGH) return 1
  return Math.min(1, Math.max(0, (k - 4.8) / (GUARD.K_HIGH - 4.8)))
}

/** Default baselines when the twin has not published a variable. */
export function defaultFrameBaselines(
  vars: Record<string, number>,
  inputs: { sex: 'male' | 'female'; weight_kg: number },
  extras: Partial<FrameBaselines> = {},
): FrameBaselines {
  const g = (k: string, d: number) => (Number.isFinite(vars[k]) ? vars[k] : d)
  return {
    gfr: g('egfr_absolute_mL_min', g('egfr_ckdepi2021', 90)),
    renalBloodFlow: g('renal_blood_flow_mL_min', 1200),
    filtrationFraction: g('filtration_fraction', 0.2),
    plasmaVolume: g('plasma_volume_L', 3.0),
    ecfVolume: g('ecf_L', 14),
    serumK: g('serum_k_mmol_L', 4.2),
    serumNa: g('serum_na_mmol_L', 140),
    serumUrate: g('serum_urate_mg_dL', 5.5),
    serumCreatinine: g('scr_mg_dL', 1.0),
    fastingGlucose: g('fasting_glucose_mg_dL', 95),
    fev1Pct: g('fev1_pct_predicted', 100),
    // Segmental sodium reabsorption fractions: PT 0.65, TAL 0.25, DCT 0.05,
    // CD 0.03, leaving ~2 % excreted. Textbook values, PROXY tier — the engine
    // has no nephron model and only the DCT term is genuinely mechanistic.
    fracNaPt: 0.65,
    fracNaTal: 0.25,
    fracNaDct: 0.05,
    fracNaCd: 0.03,
    reninPra: Number.isFinite(vars['plasma_renin_activity_ng_mL_h'])
      ? vars['plasma_renin_activity_ng_mL_h']
      : null,
    angII: null,
    aldosterone: null,
    airwaySensitivity: 0,
    cyp2d6CapacityFold: 1,
    sex: inputs.sex,
    amlodipineDoseMg: 0,
    ...extras,
  }
}
