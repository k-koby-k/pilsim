/**
 * Provenance tier for every `EffectFrame` field. Spec §8.6a.
 *
 *   COMPUTED — a state or direct algebraic output of the engine. Render at full
 *              confidence.
 *   DERIVED  — a monotone transform of a computed quantity through a documented
 *              ESTIMATED relationship. Render normally, footnote the relation.
 *   PROXY    — an index normalised to 1.00 at baseline with NO absolute
 *              physiological calibration.
 *
 * ⚠️ A PROXY FIELD MUST NEVER BE RENDERED WITH ABSOLUTE UNITS NEXT TO IT.
 *    `renal.p_glomerular` is the one that matters most: the RAAS-drug
 *    efferent-dilation story is the key renal-protection animation and it is
 *    entirely ESTIMATED. Showing "48 mmHg" would be inventing a measurement.
 *    Validation EN-13.
 */

import type { FrameFieldTier } from '../types'

/** Dotted paths into EffectFrame. */
export const FRAME_FIELD_TIERS: Record<string, FrameFieldTier> = {
  t_h: 'COMPUTED',

  'conc.lisinopril': 'COMPUTED',
  'conc.losartan': 'COMPUTED',
  'conc.exp3174': 'COMPUTED',
  'conc.amlodipine': 'COMPUTED',
  'conc.hydrochlorothiazide': 'COMPUTED',
  'conc.metoprolol': 'COMPUTED',

  'engagement.ace_inhibition_plasma': 'COMPUTED',
  // The engine has NO tissue compartments (spec §2.1). These are emitted equal
  // to the plasma value and marked PROXY. Do NOT fabricate a tissue gradient.
  'engagement.ace_inhibition_pulmonary': 'PROXY',
  'engagement.ace_inhibition_renal': 'PROXY',
  'engagement.at1_blockade': 'COMPUTED',
  'engagement.cav12_block_vsmc': 'COMPUTED',
  'engagement.cav12_block_myocardium': 'DERIVED',
  'engagement.ncc_inhibition': 'COMPUTED',
  'engagement.urat1_inhibition': 'COMPUTED',
  'engagement.beta1_occupancy': 'COMPUTED',
  'engagement.beta2_occupancy': 'COMPUTED',

  'mediators.renin_pra': 'DERIVED',
  'mediators.renin_pra_fold': 'COMPUTED',
  'mediators.ang_ii': 'DERIVED',
  'mediators.ang_ii_fold': 'COMPUTED',
  'mediators.aldosterone': 'DERIVED',
  'mediators.aldosterone_fold': 'DERIVED',
  'mediators.bradykinin_fold': 'DERIVED',
  'mediators.sympathetic_tone_fold': 'COMPUTED',

  'haemo.sbp': 'COMPUTED',
  'haemo.dbp': 'COMPUTED',
  'haemo.map': 'COMPUTED',
  'haemo.hr': 'COMPUTED',
  'haemo.stroke_volume': 'COMPUTED',
  'haemo.cardiac_output': 'COMPUTED',
  'haemo.svr': 'DERIVED',
  'haemo.arteriolar_radius_index': 'DERIVED',
  'haemo.venous_tone_index': 'PROXY',
  'haemo.capillary_hydrostatic_p': 'PROXY',
  'haemo.contractility_index': 'COMPUTED',

  'renal.gfr': 'COMPUTED',
  'renal.renal_blood_flow': 'DERIVED',
  'renal.filtration_fraction': 'DERIVED',
  // ⚠️ THE IMPORTANT ONE. Uncalibrated index; never show absolute mmHg.
  'renal.p_glomerular': 'PROXY',
  'renal.afferent_radius_index': 'DERIVED',
  'renal.efferent_radius_index': 'DERIVED',
  'renal.na_excretion_rate': 'DERIVED',
  'renal.k_excretion_rate': 'DERIVED',
  'renal.urate_excretion_rate': 'DERIVED',
  'renal.urine_flow': 'DERIVED',
  'renal.frac_na_reab_pt': 'PROXY',
  'renal.frac_na_reab_tal': 'PROXY',
  // The HCTZ target, and the one renal field that is genuinely mechanistic.
  'renal.frac_na_reab_dct': 'COMPUTED',
  'renal.frac_na_reab_cd': 'PROXY',

  'chem.plasma_volume': 'DERIVED',
  'chem.ecf_volume': 'DERIVED',
  'chem.serum_k': 'COMPUTED',
  'chem.serum_na': 'COMPUTED',
  'chem.serum_urate': 'COMPUTED',
  'chem.serum_creatinine': 'DERIVED',
  // Thiazide and beta-blocker dysglycaemia are real but UNMODELLED. Emitted at
  // baseline. Do not animate a glucose response the engine did not compute.
  'chem.fasting_glucose': 'PROXY',

  'periph.interstitial_volume_index': 'DERIVED',
  'periph.edema_grade': 'DERIVED',

  'liver.cyp3a4_flux': 'PROXY',
  'liver.cyp2c9_flux': 'DERIVED',
  'liver.cyp2d6_flux': 'DERIVED',
  'liver.cyp2d6_capacity_fold': 'COMPUTED',
  'liver.first_pass_extraction.losartan': 'DERIVED',
  'liver.first_pass_extraction.amlodipine': 'DERIVED',
  'liver.first_pass_extraction.metoprolol': 'DERIVED',

  'lung.fev1_pct_baseline': 'DERIVED',
  'lung.airway_smooth_muscle_tone_index': 'DERIVED',
  'lung.bradykinin_airway_fold': 'PROXY',
  'lung.cough_hazard': 'DERIVED',

  'hazards.cough': 'DERIVED',
  'hazards.dizziness_orthostatic': 'DERIVED',
  'hazards.peripheral_edema': 'DERIVED',
  'hazards.bradycardia': 'DERIVED',
  'hazards.bronchospasm': 'DERIVED',
  'hazards.hyperkalemia': 'DERIVED',
}

/** Fields the UI must never render with absolute units. */
export const PROXY_FIELDS: string[] = Object.entries(FRAME_FIELD_TIERS)
  .filter(([, tier]) => tier === 'PROXY')
  .map(([path]) => path)

export function fieldTier(path: string): FrameFieldTier | undefined {
  return FRAME_FIELD_TIERS[path]
}
