/**
 * Turns a derived PatientState into an EffectFrame describing the UNTREATED baseline.
 *
 * This is what lets the figure on the Test-Subject page respond to edits: add heart failure
 * and the heart visibly slows its ejection and the kidney dims, add asthma and the airway
 * narrows, set a CYP2D6 poor-metaboliser genotype and the hepatic gate closes — all before
 * any drug is given.
 *
 * IMPORTANT: every drug concentration and every target engagement is zero here. Nothing in
 * this frame is a simulation output; it is the patient's starting physiology. The page
 * labels it as such.
 */

import type { EffectFrame, PatientState } from '../../types'
import { baselineFrame } from '../organs'

const v = (s: PatientState, id: string, fallback: number): number => {
  const x = s.vars[id]
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback
}

export function baselineFrameFromTwin(state: PatientState): EffectFrame {
  const female = state.inputs.sex === 'female'
  const hr = v(state, 'heart_rate_bpm', 70)
  const sbp = v(state, 'sbp_mmHg', state.inputs.sbp_mmHg)
  const dbp = v(state, 'dbp_mmHg', state.inputs.dbp_mmHg)
  const co = v(state, 'cardiac_output_L_min', 6.5)
  const gfr = v(state, 'egfr_ckdepi2021', 100)

  return baselineFrame({
    t_h: 0,
    haemo: {
      sbp,
      dbp,
      map: v(state, 'map_mmHg', dbp + (sbp - dbp) / 3),
      hr,
      stroke_volume: v(state, 'stroke_volume_mL', (1000 * co) / hr),
      cardiac_output: co,
      svr: v(state, 'svr_dyn_s_cm5', 1010),
      arteriolar_radius_index: 1.0,
      venous_tone_index: 1.0,
      capillary_hydrostatic_p: 25,
      contractility_index: v(state, 'contractility_index', 1.0),
    },
    renal: {
      gfr,
      renal_blood_flow: v(state, 'renal_blood_flow_mL_min', 1235),
      filtration_fraction: v(state, 'filtration_fraction', 0.2),
      // p_glomerular is PROXY tier and uncalibrated. At baseline it sits at its own
      // reference by definition; it is never rendered with absolute units anywhere.
      p_glomerular: 55,
      afferent_radius_index: 1.0,
      efferent_radius_index: 1.0,
      na_excretion_rate: 6,
      k_excretion_rate: 2.5,
      urate_excretion_rate: 25,
      urine_flow: v(state, 'urine_output_mL_day', 1500) / 24,
      frac_na_reab_pt: 0.65,
      frac_na_reab_tal: 0.25,
      frac_na_reab_dct: 0.05,
      frac_na_reab_cd: 0.04,
    },
    chem: {
      plasma_volume: v(state, 'plasma_volume_L', female ? 2.6 : 3.0),
      ecf_volume: v(state, 'ecf_L', 17),
      serum_k: v(state, 'serum_k_mmol_L', 4.2),
      serum_na: v(state, 'serum_na_mmol_L', 140),
      serum_urate: v(state, 'serum_urate_mg_dL', 5.5),
      serum_creatinine: v(state, 'scr_mg_dL', female ? 0.7 : 0.9),
      fasting_glucose: v(state, 'fasting_glucose_mg_dL', 90),
    },
    mediators: {
      renin_pra: v(state, 'plasma_renin_activity_ng_mL_h', 1.0),
      renin_pra_fold: v(state, 'raas_activity', 1.0),
      ang_ii: 20 * v(state, 'raas_activity', 1.0),
      ang_ii_fold: v(state, 'raas_activity', 1.0),
      aldosterone: 10 * v(state, 'raas_activity', 1.0),
      aldosterone_fold: v(state, 'raas_activity', 1.0),
      bradykinin_fold: 1.0,
      sympathetic_tone_fold: v(state, 'sympathetic_tone', 1.0),
    },
    lung: {
      fev1_pct_baseline: v(state, 'fev1_pct_predicted', 100),
      airway_smooth_muscle_tone_index: 1.0,
      bradykinin_airway_fold: 1.0,
      cough_hazard: 0,
    },
    liver: {
      cyp3a4_flux: 0,
      cyp2c9_flux: 0,
      cyp2d6_flux: 0,
      // The gate aperture the metoprolol animation binds to, set purely by genotype here.
      cyp2d6_capacity_fold: v(state, 'cyp2d6_pathway_multiplier', 1.0),
      first_pass_extraction: { losartan: 0, amlodipine: 0, metoprolol: 0 },
    },
  })
}
