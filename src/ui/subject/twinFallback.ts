/**
 * Fallback twin derivation.
 *
 * `src/rules/twin.ts` (Agent RUL) is authoritative. This module exists so the Test-Subject
 * page is legible before that file lands, and so the page degrades to something honest
 * rather than to a blank panel. It implements data/patient_model.json's own
 * derivation_pipeline and its documented modifier composition rule — nothing is invented
 * here, every equation is the one the model file states.
 *
 * Composition rule (patient_model.json comorbidity_presets._composition_rule):
 *   apply in the order  set -> multiply -> add -> clamp_min -> clamp_max
 *   multiply composes multiplicatively, add composes additively,
 *   set is last-writer-wins and must raise a visible warning when two presets collide.
 */

import type { PatientInputs, PatientState } from '../../types'
import { GRADE_INPUT_KEY, presetModifiers, type Modifier, type PatientModelFile } from './patientModel'

/** Pipeline hooks that the model file itself expresses as comorbidity_multiplier(...). */
const PIPELINE_MULTIPLIER_TARGETS = new Set([
  'cardiac_output',
  'renal_blood_flow',
  'hepatic_blood_flow',
  'raas_activity',
  'sympathetic_tone',
])

/** Modifier targets that are inputs to the pipeline, so they must be applied BEFORE it. */
const INPUT_TARGETS = new Set([
  'scr_mg_dL',
  'heart_rate_bpm',
  'hematocrit_frac',
  'sbp_mmHg',
  'dbp_mmHg',
  'fasting_glucose_mg_dL',
  'hba1c_pct',
  'uacr_mg_g',
  'serum_k_mmol_L',
  'serum_na_mmol_L',
  'serum_urate_mg_dL',
  'serum_hco3_mmol_L',
  'serum_mg_mg_dL',
  'serum_ca_mg_dL',
  'hemoglobin_g_dL',
  'albumin_g_dL',
  'fev1_pct_predicted',
  'ldl_mg_dL',
  'hdl_mg_dL',
  'triglycerides_mg_dL',
])

export function deriveTwinFallback(inputs: PatientInputs, model: PatientModelFile | null): PatientState {
  const warnings: string[] = []
  const applied: string[] = []

  // ------------------------------------------------------------------ modifiers
  const mods: Modifier[] = []
  if (model) {
    for (const id of inputs.comorbidities ?? []) {
      const preset = model.comorbidity_presets?.[id]
      if (!preset) {
        warnings.push(`Unknown comorbidity preset "${id}" — ignored.`)
        continue
      }
      applied.push(id)
      const gradeKey = GRADE_INPUT_KEY[id]
      const grade = gradeKey ? asString(inputs[gradeKey]) : undefined
      mods.push(...presetModifiers(preset, grade))
    }
  } else if ((inputs.comorbidities ?? []).length) {
    warnings.push('patient_model.json is not loaded, so comorbidity presets could not shift any state variable.')
  }

  // A diabetic patient cannot simultaneously hyperfilter and sit in CKD G3+.
  const both = applied.includes('t2dm') && applied.includes('ckd')
  const effective = both
    ? mods.filter((m) => !(m.target === 'egfr_ckdepi2021' && m.op === 'multiply' && m.value === 1.15))
    : mods
  if (both) warnings.push('Diabetic hyperfiltration suppressed: the CKD preset is also active.')

  // Detect colliding `set` writes — silent overwriting is a defect, per the model file.
  const setsByTarget = new Map<string, number[]>()
  for (const m of effective) {
    if (m.op !== 'set') continue
    const list = setsByTarget.get(m.target) ?? []
    list.push(m.value)
    setsByTarget.set(m.target, list)
  }
  for (const [target, values] of setsByTarget) {
    if (values.length > 1) {
      warnings.push(`Two active presets both set ${target} (${values.join(', ')}); the last one wins.`)
    }
  }

  const applyTo = (target: string, current: number): number => apply(effective, target, current)
  const multiplierFor = (target: string): number =>
    effective
      .filter((m) => m.target === target && m.op === 'multiply')
      .reduce((acc, m) => acc * m.value, 1)

  // ------------------------------------------------------------------ inputs
  const sex = inputs.sex
  const female = sex === 'female'
  const age = inputs.age_years
  const height_cm = inputs.height_cm
  const weight_kg = inputs.weight_kg

  let scr = applyTo('scr_mg_dL', num(inputs.serum_creatinine_mg_dl, female ? 0.7 : 0.9))
  let hr = applyTo('heart_rate_bpm', num(inputs.hr_bpm, 70))
  const hct = applyTo('hematocrit_frac', num(inputs.hematocrit_frac, female ? 0.41 : 0.47))
  const sbp = applyTo('sbp_mmHg', inputs.sbp_mmHg)
  const dbp = applyTo('dbp_mmHg', inputs.dbp_mmHg)

  const inputVars: Record<string, number> = {}
  for (const t of INPUT_TARGETS) {
    const base = defaultFor(t, female)
    if (base === null) continue
    inputVars[t] = applyTo(t, num(inputs[t], base))
  }
  inputVars.scr_mg_dL = scr
  inputVars.heart_rate_bpm = hr
  inputVars.hematocrit_frac = hct
  inputVars.sbp_mmHg = sbp
  inputVars.dbp_mmHg = dbp

  // ------------------------------------------------------------------ pipeline
  const height_m = height_cm / 100
  const bmi = weight_kg / (height_m * height_m)
  const bsa_m2 = 0.007184 * Math.pow(height_cm, 0.725) * Math.pow(weight_kg, 0.425)
  const bsa_mosteller_m2 = Math.sqrt((height_cm * weight_kg) / 3600)
  const ibw_kg = (female ? 45 : 50) + 2.3 * (height_cm / 2.54 - 60)
  const lbw_raw = female
    ? (9270 * weight_kg) / (8780 + 244 * bmi)
    : (9270 * weight_kg) / (6680 + 216 * bmi)
  const lbw_kg = applyTo('lbw_kg', lbw_raw)
  const fat_mass_kg = weight_kg - lbw_kg
  const body_fat_pct = (100 * fat_mass_kg) / weight_kg
  const adjbw_kg = ibw_kg + 0.4 * (weight_kg - ibw_kg)
  const tbw_L = female
    ? -2.097 + 0.1069 * height_cm + 0.2466 * weight_kg
    : 2.447 - 0.09516 * age + 0.1074 * height_cm + 0.3362 * weight_kg
  const ecf_L = 0.414 * tbw_L + 0.306
  const icf_L = tbw_L - ecf_L
  const blood_volume_L = female
    ? 0.3561 * Math.pow(height_m, 3) + 0.03308 * weight_kg + 0.1833
    : 0.3669 * Math.pow(height_m, 3) + 0.03219 * weight_kg + 0.6041
  const plasma_volume_L = applyTo('plasma_volume_L', blood_volume_L * (1 - hct))

  const kappa = female ? 0.7 : 0.9
  const alpha = female ? -0.241 : -0.302
  const egfr_raw =
    142 *
    Math.pow(Math.min(scr / kappa, 1), alpha) *
    Math.pow(Math.max(scr / kappa, 1), -1.2) *
    Math.pow(0.9938, age) *
    (female ? 1.012 : 1)
  const egfr_ckdepi2021 = applyTo('egfr_ckdepi2021', egfr_raw)
  const egfr_absolute_mL_min = (egfr_ckdepi2021 * bsa_m2) / 1.73
  const cgWeight = weight_kg < ibw_kg ? weight_kg : bmi >= 30 ? adjbw_kg : ibw_kg
  const crcl_cockcroft_gault_mL_min = (((140 - age) * cgWeight) / (72 * scr)) * (female ? 0.85 : 1)
  const ckd_stage =
    egfr_ckdepi2021 >= 90 ? 'G1' : egfr_ckdepi2021 >= 60 ? 'G2' : egfr_ckdepi2021 >= 45 ? 'G3a' : egfr_ckdepi2021 >= 30 ? 'G3b' : egfr_ckdepi2021 >= 15 ? 'G4' : 'G5'

  const cardiac_output_ref_L_min = (female ? 5.9 : 6.5) * (bsa_m2 / (female ? 1.66 : 1.9))
  const cardiac_output_L_min = cardiac_output_ref_L_min * multiplierFor('cardiac_output')
  const cardiac_index_L_min_m2 = cardiac_output_L_min / bsa_m2
  const stroke_volume_mL = applyTo('stroke_volume_mL', (1000 * cardiac_output_L_min) / hr)
  const map_mmHg = dbp + (sbp - dbp) / 3
  const pulse_pressure_mmHg = sbp - dbp
  const cvp_mmHg = 5
  const svr_dyn_s_cm5 = applyTo('svr_dyn_s_cm5', (80 * (map_mmHg - cvp_mmHg)) / cardiac_output_L_min)
  const arterial_compliance_mL_mmHg = applyTo('arterial_compliance_mL_mmHg', stroke_volume_mL / pulse_pressure_mmHg)

  const renal_blood_flow_mL_min = 1000 * cardiac_output_L_min * (female ? 0.17 : 0.19) * multiplierFor('renal_blood_flow')
  const renal_plasma_flow_mL_min = renal_blood_flow_mL_min * (1 - hct)
  const filtration_fraction = applyTo('filtration_fraction', egfr_absolute_mL_min / renal_plasma_flow_mL_min)
  const hepatic_blood_flow_L_min = cardiac_output_L_min * (female ? 0.27 : 0.255) * multiplierFor('hepatic_blood_flow')
  const liver_mass_g = applyTo('liver_mass_g', (female ? 1400 : 1800) * (bsa_m2 / (female ? 1.66 : 1.9)))
  const kidney_mass_g = (female ? 275 : 310) * (bsa_m2 / (female ? 1.66 : 1.9))
  const heart_mass_g = (female ? 250 : 330) * (bsa_m2 / (female ? 1.66 : 1.9))

  const cyp2d6_activity_score = num(inputs.cyp2d6_activity_score, phenotypeToScore(inputs.cyp2d6))
  const cyp2d6_phenotype =
    cyp2d6_activity_score > 2.25 ? 'Ultrarapid' : cyp2d6_activity_score >= 1.25 ? 'Normal' : cyp2d6_activity_score > 0 ? 'Intermediate' : 'Poor'
  const cyp2d6_pathway_multiplier =
    cyp2d6_phenotype === 'Poor' ? 0 : cyp2d6_phenotype === 'Intermediate' ? 0.5 : cyp2d6_phenotype === 'Ultrarapid' ? 1.6 : 1.0
  const cyp2c9_activity_score = num(inputs.cyp2c9_activity_score, inputs.cyp2c9 === 'poor' ? 0.5 : inputs.cyp2c9 === 'intermediate' ? 1 : 2)
  const cyp2c9_phenotype = cyp2c9_activity_score === 2 ? 'Normal' : cyp2c9_activity_score >= 1 ? 'Intermediate' : 'Poor'
  const cyp2c9_pathway_multiplier = cyp2c9_activity_score / 2

  const raas_activity = 1.0 * multiplierFor('raas_activity')
  const plasma_renin_activity_ng_mL_h = (age < 40 ? 1.9 : 1.0) * raas_activity
  const sympathetic_tone = 1.0 * multiplierFor('sympathetic_tone')
  const baroreflex_gain_bpm_per_mmHg = applyTo(
    'baroreflex_gain_bpm_per_mmHg',
    -(60000 / Math.pow(60000 / hr, 2)) * 15 * (age <= 35 ? 1.0 : age <= 60 ? 0.67 : 0.4),
  )
  const allometric_cl_scalar = Math.pow(weight_kg / 70, 0.75)
  const allometric_v_scalar = weight_kg / 70

  const lvef_pct = applyTo('lvef_pct', 60)
  const contractility_index = applyTo('contractility_index', 1.0)
  const uacr_mg_g = applyTo('uacr_mg_g', 10)
  const urine_output_mL_day = applyTo('urine_output_mL_day', 1500)
  const distal_na_delivery_index = applyTo('distal_na_delivery_index', 1.0)

  // hr may itself be modified by a preset; the pipeline uses the modified value throughout.
  hr = inputVars.heart_rate_bpm ?? hr
  scr = inputVars.scr_mg_dL ?? scr

  const vars: Record<string, number> = {
    ...inputVars,
    age_years: age,
    weight_kg,
    height_cm,
    height_m,
    bmi,
    bsa_m2,
    bsa_mosteller_m2,
    ibw_kg,
    lbw_kg,
    fat_mass_kg,
    body_fat_pct,
    adjbw_kg,
    tbw_L,
    ecf_L,
    icf_L,
    blood_volume_L,
    plasma_volume_L,
    egfr_ckdepi2021,
    egfr_absolute_mL_min,
    crcl_cockcroft_gault_mL_min,
    cardiac_output_ref_L_min,
    cardiac_output_L_min,
    cardiac_index_L_min_m2,
    stroke_volume_mL,
    map_mmHg,
    pulse_pressure_mmHg,
    cvp_mmHg,
    svr_dyn_s_cm5,
    arterial_compliance_mL_mmHg,
    renal_blood_flow_mL_min,
    renal_plasma_flow_mL_min,
    filtration_fraction,
    hepatic_blood_flow_L_min,
    liver_mass_g,
    kidney_mass_g,
    heart_mass_g,
    cyp2d6_activity_score,
    cyp2d6_pathway_multiplier,
    cyp2c9_activity_score,
    cyp2c9_pathway_multiplier,
    raas_activity,
    plasma_renin_activity_ng_mL_h,
    sympathetic_tone,
    baroreflex_gain_bpm_per_mmHg,
    allometric_cl_scalar,
    allometric_v_scalar,
    lvef_pct,
    contractility_index,
    uacr_mg_g,
    urine_output_mL_day,
    distal_na_delivery_index,
  }

  // Categorical outputs are carried alongside as strings on the state's warnings-free path.
  CATEGORICAL.ckd_stage = ckd_stage
  CATEGORICAL.cyp2d6_phenotype = cyp2d6_phenotype
  CATEGORICAL.cyp2c9_phenotype = cyp2c9_phenotype

  return { inputs, vars, appliedPresets: applied, warnings }
}

/** Categorical pipeline outputs, which do not fit PatientState.vars (a Record<string, number>). */
export const CATEGORICAL: Record<string, string> = {
  ckd_stage: 'G1',
  cyp2d6_phenotype: 'Normal',
  cyp2c9_phenotype: 'Normal',
}

// --------------------------------------------------------------------------- internals

function apply(mods: Modifier[], target: string, current: number): number {
  if (PIPELINE_MULTIPLIER_TARGETS.has(target)) return current
  let v = current
  const at = mods.filter((m) => m.target === target)
  for (const m of at) if (m.op === 'set') v = m.value
  for (const m of at) if (m.op === 'multiply') v *= m.value
  for (const m of at) if (m.op === 'add') v += m.value
  for (const m of at) if (m.op === 'clamp_min') v = Math.max(v, m.value)
  for (const m of at) if (m.op === 'clamp_max') v = Math.min(v, m.value)
  return v
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function phenotypeToScore(p: unknown): number {
  switch (p) {
    case 'poor':
      return 0
    case 'intermediate':
      return 1.0
    case 'ultrarapid':
      return 3.0
    default:
      return 2.0
  }
}

function defaultFor(target: string, female: boolean): number | null {
  const table: Record<string, number> = {
    scr_mg_dL: female ? 0.7 : 0.9,
    heart_rate_bpm: 70,
    hematocrit_frac: female ? 0.41 : 0.47,
    sbp_mmHg: 118,
    dbp_mmHg: 72,
    fasting_glucose_mg_dL: 90,
    hba1c_pct: 5.3,
    uacr_mg_g: 10,
    serum_k_mmol_L: 4.2,
    serum_na_mmol_L: 140,
    serum_urate_mg_dL: 5.5,
    serum_hco3_mmol_L: 25,
    serum_mg_mg_dL: 1.8,
    serum_ca_mg_dL: 9.3,
    hemoglobin_g_dL: female ? 14.0 : 15.5,
    albumin_g_dL: 4.4,
    fev1_pct_predicted: 100,
    ldl_mg_dL: 110,
    hdl_mg_dL: female ? 55 : 45,
    triglycerides_mg_dL: 120,
  }
  return table[target] ?? null
}
