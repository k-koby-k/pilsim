/**
 * The digital twin — baseline derivation.
 *
 * Runs the 44-step ordered derivation pipeline from `data/patient_model.json` and
 * produces a `PatientState`.
 *
 * THE DESIGN DECISION: CALIBRATE, THEN RUN.
 * Blood pressure is an INPUT at baseline and an OUTPUT during simulation. The circulation
 * is expressed through two identities:
 *
 *     MAP = CVP + SVR * CO / 80
 *     PP  = SV / C_a
 *
 * At baseline they run backwards. Cardiac output comes from the ICRP reference individual
 * scaled by body surface area (step 19-20); stroke volume follows from CO and the entered
 * heart rate (step 22); MAP and pulse pressure come from the entered pressures (steps
 * 23-24); then *systemic vascular resistance is solved* (step 26) and *arterial compliance
 * is solved* (step 27). The twin therefore reproduces the entered blood pressure exactly,
 * by construction, while every internal variable stays physiological. See
 * `twin.test.ts` for the assertion, and research/02-VIRTUAL-HUMAN.md section 2.
 *
 * Renal function follows the 2021 race-free CKD-EPI creatinine equation. The
 * 1.73 m² INDEXED value carries guideline thresholds; the DE-INDEXED value
 * (`egfr_absolute_mL_min = egfr * BSA / 1.73`) is what the PK layer must use to scale
 * renal clearance. Cockcroft-Gault is computed for label cross-reference and is
 * DISPLAY-ONLY.
 *
 * Owned by Agent RUL.
 */

import type {
  Cyp2c9Phenotype,
  Cyp2d6Phenotype,
  PatientInputs,
  PatientState,
} from '../types'
import type { ComorbidityPreset, PatientModelFile, PresetModifier } from '../data/load'
import { MATH_FNS, evaluateExpr, type ExprValue } from './expr'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * `PatientState` plus the non-numeric derivation outputs, which `vars` (a
 * `Record<string, number>`) structurally cannot hold. A `Twin` IS a `PatientState`.
 */
export interface Twin extends PatientState {
  /** Categorical pipeline outputs: ckd_stage, cyp2d6_phenotype, cyp2c9_phenotype. */
  categoricals: Record<string, string>
  /** Resolved condition keys for the rules engine (`condition` atoms bind to these). */
  conditions: string[]
  /** Every value in `vars` that came from a preset modifier, for the audit panel. */
  presetEffects: AppliedModifier[]
}

export interface AppliedModifier {
  preset: string
  target: string
  op: PresetModifier['op']
  value: number
  before: number
  after: number
}

/** Ladder positions CPIC publishes; the twin stores the score, not just the label. */
const CYP2D6_ACTIVITY_SCORE: Record<Cyp2d6Phenotype, number> = {
  poor: 0,
  intermediate: 1.0,
  normal: 2.0,
  ultrarapid: 3.0,
}
const CYP2C9_ACTIVITY_SCORE: Record<Cyp2c9Phenotype, number> = {
  poor: 0,
  intermediate: 1,
  normal: 2,
}

/**
 * Baseline values for every symbol the pipeline can read. Sex-dependent defaults are
 * resolved at derivation time. Sourced from `patient_model.json` `inputs`; restated
 * here so the twin has a total symbol table even when the UI omits a field.
 */
const INPUT_DEFAULTS: Record<string, number | ((sex: string) => number)> = {
  age_years: 45,
  height_cm: (s) => (s === 'female' ? 163 : 176),
  weight_kg: (s) => (s === 'female' ? 60 : 73),
  sbp_mmHg: 118,
  dbp_mmHg: 72,
  heart_rate_bpm: 70,
  hematocrit_frac: (s) => (s === 'female' ? 0.41 : 0.47),
  scr_mg_dL: (s) => (s === 'female' ? 0.7 : 0.9),
  serum_k_mmol_L: 4.2,
  serum_na_mmol_L: 140,
  serum_cl_mmol_L: 100,
  serum_hco3_mmol_L: 25,
  serum_mg_mg_dL: 1.8,
  serum_ca_mg_dL: 9.3,
  serum_urate_mg_dL: 5.5,
  fasting_glucose_mg_dL: 90,
  hba1c_pct: 5.3,
  albumin_g_dL: 4.4,
  hemoglobin_g_dL: (s) => (s === 'female' ? 14 : 15.5),
  uacr_mg_g: 10,
  fev1_pct_predicted: 100,
  alt_u_L: 22,
  urine_calcium_mg_day: 200,
  cyp2d6_activity_score: 2,
  cyp2c9_activity_score: 2,
  cyp3a_activity_multiplier: 1,
  gestational_week: 20,
  // State variables that are not pipeline outputs but need a baseline.
  lvef_pct: 62,
  contractility_index: 1,
  distal_na_delivery_index: 1,
  urine_output_mL_day: 1500,
  ldl_mg_dL: 110,
  hdl_mg_dL: 50,
  triglycerides_mg_dL: 120,
  portal_vein_flow_fraction: 1,
  hepatic_artery_flow_fraction: 1,
  serum_lithium_mmol_L: 0,
}

/**
 * Targets the pipeline consumes through `comorbidity_multiplier(...)` rather than as a
 * post-hoc shift. Re-applying a multiplier to these would double-count it.
 */
const INLINE_MULTIPLIER_TARGETS = new Set([
  'cardiac_output',
  'renal_blood_flow',
  'hepatic_blood_flow',
  'raas_activity',
  'sympathetic_tone',
])

/**
 * Solved-at-baseline variables. A preset modifier on these is REFUSED, not applied.
 *
 * This is a real disagreement between `patient_model.json` and its own design: several
 * presets declare `svr_dyn_s_cm5` and `arterial_compliance_mL_mmHg` multipliers (hfref
 * 1.25, obesity 0.80, pregnancy 0.80, ckd 1.08-1.15, cirrhosis 0.75; compliance t2dm
 * 0.83, elderly 0.59), but those two variables are the ones the calibration SOLVES so
 * that the twin reproduces the entered blood pressure. Applying both would mean the
 * displayed pressure is not the entered pressure. The entered pressure wins; the
 * refused modifiers are surfaced as warnings and kept in `vars` under a
 * `*_preset_multiplier_advisory` key so the engine and the UI can still see the
 * direction the preset intended.
 *
 * `stroke_volume_mL` is refused for the same class of reason: it is solved from CO and
 * HR at step 22, and a direct shift would break the identity CO = HR x SV / 1000 that
 * the simulation runs forwards.
 */
const SOLVED_TARGETS = new Set(['svr_dyn_s_cm5', 'arterial_compliance_mL_mmHg', 'stroke_volume_mL'])

// ---------------------------------------------------------------------------
// Preset resolution
// ---------------------------------------------------------------------------

interface ResolvedPreset {
  id: string
  preset: ComorbidityPreset
  modifiers: PresetModifier[]
}

function presetModifiers(
  id: string,
  preset: ComorbidityPreset,
  inputs: PatientInputs,
  warnings: string[],
): PresetModifier[] {
  const out: PresetModifier[] = [...(preset.modifiers ?? [])]

  if (preset.modifiers_by_stage) {
    const requested = String(inputs.ckd_stage ?? 'G3a')
    const table = preset.modifiers_by_stage as Record<string, PresetModifier[]>
    const stage = table[requested] ? requested : 'G3a'
    if (stage !== requested) {
      warnings.push(
        `Preset ${id}: stage "${requested}" is not parameterised (${Object.keys(table).join(', ')}). Using ${stage}.`,
      )
    }
    out.push(...(table[stage] ?? []))
  }

  if (preset.modifiers_by_class) {
    const requested = String(inputs.child_pugh_class ?? 'B').toUpperCase()
    const table = preset.modifiers_by_class as Record<string, unknown>
    const cls = Array.isArray(table[requested]) ? requested : 'B'
    if (cls !== requested) {
      warnings.push(`Preset ${id}: Child-Pugh class "${requested}" not parameterised. Using B.`)
    }
    const list = table[cls]
    if (Array.isArray(list)) out.push(...(list as PresetModifier[]))
    if (Array.isArray(preset.additional_modifiers_all_classes)) {
      out.push(...preset.additional_modifiers_all_classes)
    }
  }

  return out
}

/**
 * Which presets are active, and which `condition` keys the rules engine should see.
 *
 * `PatientInputs.comorbidities` may hold either preset ids (`asthma_copd`, `gout`) or
 * condition keys (`asthma`, `hyperkalemia`, `sulfonamide_hypersensitivity`, ...). Both
 * are accepted, and the distinction decides what gets asserted:
 *
 *   - A PRESET ID asserts every key in its `satisfies_condition_keys`. Entering `gout`
 *     asserts `hyperuricemia` too, because gout implies it; entering `asthma_copd`
 *     asserts both airway conditions, because that is what the caller asked for.
 *   - A CONDITION KEY that is not itself a preset id activates the preset but asserts
 *     only that key. Entering `asthma` activates `asthma_copd` for its physiology but
 *     does NOT assert `copd` — otherwise every asthmatic twin would also fire
 *     RX-COPD-METOPROLOL-NO-CARDIAC-INDICATION, which is a different clinical claim.
 */
export function resolvePresets(
  inputs: PatientInputs,
  model: PatientModelFile,
): { presetIds: string[]; conditions: Set<string> } {
  const presets = model.comorbidity_presets
  const conditionKeys = model.rules_engine_binding?.condition_keys ?? {}
  const declared = new Set<string>((inputs.comorbidities ?? []).map(String))
  if (inputs.pregnant === true) declared.add('pregnancy')
  if (inputs.lactating === true) declared.add('lactation')

  const conditions = new Set<string>(declared)
  const active = new Set<string>()

  for (const key of declared) {
    if (key in presets && !key.startsWith('_')) {
      active.add(key)
      // A preset named directly asserts every condition key it satisfies.
      for (const c of (presets[key].satisfies_condition_keys ?? []) as string[]) conditions.add(c)
      continue
    }
    const bound = conditionKeys[key]
    if (bound?.kind === 'preset' && bound.preset && bound.preset in presets) {
      active.add(bound.preset)
    }
  }

  // Declaration order in the file, so `set` last-writer-wins is deterministic.
  const presetIds = Object.keys(presets).filter((k) => !k.startsWith('_') && active.has(k))
  return { presetIds, conditions }
}

// ---------------------------------------------------------------------------
// Modifier table
// ---------------------------------------------------------------------------

interface TargetModifiers {
  set?: { value: number; preset: string }
  setConflicts: string[]
  multiply: { value: number; preset: string }[]
  add: { value: number; preset: string }[]
  clampMin?: { value: number; preset: string }
  clampMax?: { value: number; preset: string }
}

function buildModifierTable(
  resolved: ResolvedPreset[],
  warnings: string[],
  suppress: (presetId: string, target: string) => boolean,
): Map<string, TargetModifiers> {
  const table = new Map<string, TargetModifiers>()
  const slot = (t: string): TargetModifiers => {
    let s = table.get(t)
    if (!s) {
      s = { setConflicts: [], multiply: [], add: [] }
      table.set(t, s)
    }
    return s
  }

  for (const { id, modifiers } of resolved) {
    for (const m of modifiers) {
      if (!m || typeof m.target !== 'string' || typeof m.value !== 'number') continue
      if (suppress(id, m.target)) continue
      const s = slot(m.target)
      switch (m.op) {
        case 'set':
          if (s.set && s.set.preset !== id) {
            // The composition rule calls silent overwriting a defect. Say it out loud.
            s.setConflicts.push(s.set.preset)
            warnings.push(
              `Presets ${s.set.preset} and ${id} both \`set\` ${m.target}; using ${id}'s value ${m.value} ` +
                `(declaration order). Previous value was ${s.set.value}.`,
            )
          }
          s.set = { value: m.value, preset: id }
          break
        case 'multiply':
          s.multiply.push({ value: m.value, preset: id })
          break
        case 'add':
          s.add.push({ value: m.value, preset: id })
          break
        case 'clamp_min':
          s.clampMin = { value: m.value, preset: id }
          break
        case 'clamp_max':
          s.clampMax = { value: m.value, preset: id }
          break
        default:
          warnings.push(`Unknown preset modifier op "${String(m.op)}" on ${m.target}; ignored.`)
      }
    }
  }
  return table
}

/** Composition order from `_composition_rule`: set -> multiply -> add -> clamps. */
function applyTarget(
  base: number,
  mods: TargetModifiers | undefined,
  target: string,
  log: AppliedModifier[],
): number {
  if (!mods) return base
  let v = base
  const step = (preset: string, op: PresetModifier['op'], value: number, next: number) => {
    log.push({ preset, target, op, value, before: v, after: next })
    v = next
  }
  if (mods.set) step(mods.set.preset, 'set', mods.set.value, mods.set.value)
  for (const m of mods.multiply) step(m.preset, 'multiply', m.value, v * m.value)
  for (const m of mods.add) step(m.preset, 'add', m.value, v + m.value)
  if (mods.clampMin) step(mods.clampMin.preset, 'clamp_min', mods.clampMin.value, Math.max(v, mods.clampMin.value))
  if (mods.clampMax) step(mods.clampMax.preset, 'clamp_max', mods.clampMax.value, Math.min(v, mods.clampMax.value))
  return v
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

function inputDefault(key: string, sex: string): number | undefined {
  const d = INPUT_DEFAULTS[key]
  if (d === undefined) return undefined
  return typeof d === 'function' ? d(sex) : d
}

/** Map the frozen `PatientInputs` contract onto the model's symbol names. */
function seedSymbols(inputs: PatientInputs): Record<string, ExprValue> {
  const sex = inputs.sex === 'female' ? 'female' : 'male'
  const sym: Record<string, ExprValue> = {}

  // Pass through any extra numeric/string/boolean fields the UI supplies (the frozen
  // PatientInputs carries an index signature exactly so this stays open).
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') sym[k] = v
  }

  sym.sex = sex
  sym.age_years = inputs.age_years
  sym.weight_kg = inputs.weight_kg
  sym.height_cm = inputs.height_cm
  sym.sbp_mmHg = inputs.sbp_mmHg
  sym.dbp_mmHg = inputs.dbp_mmHg
  sym.pregnant = inputs.pregnant === true
  if (typeof inputs.hr_bpm === 'number') sym.heart_rate_bpm = inputs.hr_bpm
  if (typeof inputs.serum_creatinine_mg_dl === 'number') sym.scr_mg_dL = inputs.serum_creatinine_mg_dl
  if (inputs.cyp2d6) sym.cyp2d6_activity_score = CYP2D6_ACTIVITY_SCORE[inputs.cyp2d6]
  if (inputs.cyp2c9) sym.cyp2c9_activity_score = CYP2C9_ACTIVITY_SCORE[inputs.cyp2c9]

  for (const [k] of Object.entries(INPUT_DEFAULTS)) {
    if (typeof sym[k] !== 'number') {
      const d = inputDefault(k, sex)
      if (d !== undefined) sym[k] = d
    }
  }
  return sym
}

export interface DeriveOptions {
  /** Skip the hard output clamps. Only for testing the raw equations. */
  skipClamps?: boolean
}

export function deriveTwin(
  inputs: PatientInputs,
  model: PatientModelFile,
  options: DeriveOptions = {},
): Twin {
  const warnings: string[] = []
  const presetEffects: AppliedModifier[] = []

  const { presetIds, conditions } = resolvePresets(inputs, model)

  const resolved: ResolvedPreset[] = presetIds.map((id) => ({
    id,
    preset: model.comorbidity_presets[id],
    modifiers: presetModifiers(id, model.comorbidity_presets[id], inputs, warnings),
  }))

  // "Suppressed when the ckd preset is also active; a patient cannot be simultaneously
  // hyperfiltering and in CKD category G3+." — t2dm egfr modifier note.
  const ckdActive = presetIds.includes('ckd')
  const suppress = (presetId: string, target: string): boolean =>
    ckdActive && presetId === 't2dm' && target === 'egfr_ckdepi2021'

  const table = buildModifierTable(resolved, warnings, suppress)

  for (const target of SOLVED_TARGETS) {
    const mods = table.get(target)
    if (!mods) continue
    const named = [...mods.multiply, ...mods.add, ...(mods.set ? [mods.set] : [])]
    warnings.push(
      `Preset modifier on ${target} refused (from ${[...new Set(named.map((m) => m.preset))].join(', ')}): ` +
        `${target} is SOLVED at baseline so the twin reproduces the entered blood pressure exactly. ` +
        `The intended direction is retained as ${target}_preset_multiplier_advisory.`,
    )
  }

  const sym = seedSymbols(inputs)

  const comorbidityMultiplier = (name: ExprValue): number => {
    const t = String(name)
    const mods = table.get(t)
    if (!mods) return 1
    let f = 1
    for (const m of mods.multiply) f *= m.value
    return f
  }

  const scope = {
    vars: sym,
    fns: { ...MATH_FNS, comorbidity_multiplier: comorbidityMultiplier },
  }

  // --- Stage 1: modifiers that target INPUT symbols, before anything reads them.
  // Pregnancy's creatinine multiplier has to land before CKD-EPI runs, or the twin's
  // eGFR is wrong; the same goes for heart rate before stroke volume is solved.
  const pipelineIds = new Set(model.derivation_pipeline.map((s) => s.id))
  for (const [target, mods] of table) {
    if (pipelineIds.has(target) || INLINE_MULTIPLIER_TARGETS.has(target) || SOLVED_TARGETS.has(target)) continue
    if (typeof sym[target] !== 'number') continue
    sym[target] = applyTarget(sym[target] as number, mods, target, presetEffects)
  }

  // --- Stage 2: the 44-step ordered pipeline, in array order (topologically sorted).
  const categoricals: Record<string, string> = {}
  for (const step of model.derivation_pipeline) {
    let v: ExprValue
    try {
      v = evaluateExpr(step.expr, scope)
    } catch (e) {
      throw new Error(
        `Derivation step ${step.step} (${step.id}) failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
    if (typeof v === 'string') {
      categoricals[step.id] = v
      sym[step.id] = v
      continue
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`Derivation step ${step.step} (${step.id}) produced a non-finite value: ${String(v)}`)
    }
    sym[step.id] = v
    // Apply preset modifiers the instant their target exists, so downstream steps see
    // the modified value (eGFR -> de-indexed eGFR -> filtration fraction).
    const mods = table.get(step.id)
    if (mods && !SOLVED_TARGETS.has(step.id)) {
      const skipMultiply = INLINE_MULTIPLIER_TARGETS.has(step.id)
      sym[step.id] = applyTarget(
        v,
        skipMultiply ? { ...mods, multiply: [] } : mods,
        step.id,
        presetEffects,
      )
    }
  }

  // --- Stage 3: remaining state variables that are neither inputs nor pipeline steps.
  for (const [target, mods] of table) {
    if (SOLVED_TARGETS.has(target) || INLINE_MULTIPLIER_TARGETS.has(target)) continue
    if (typeof sym[target] === 'number') continue
    // No baseline exists for this target, so there is nothing to shift. Inventing one
    // would be fabrication; say so instead.
    const presets = [...new Set([...mods.multiply, ...mods.add, ...(mods.set ? [mods.set] : [])].map((m) => m.preset))]
    warnings.push(
      `Preset modifier on unknown state variable "${target}" (from ${presets.join(', ')}) was not applied — ` +
        `the twin has no baseline for it.`,
    )
  }

  // --- Assemble vars ---------------------------------------------------------
  const vars: Record<string, number> = {}
  for (const [k, v] of Object.entries(sym)) {
    if (typeof v === 'number' && Number.isFinite(v)) vars[k] = v
    else if (typeof v === 'boolean') vars[k] = v ? 1 : 0
  }

  // Derived state variables the pipeline does not itself emit.
  vars.cardiac_index_L_min_m2 = vars.cardiac_output_L_min / vars.bsa_m2
  vars.blood_volume_L = vars.plasma_volume_L / (1 - vars.hematocrit_frac)
  vars.mean_arterial_pressure_mmHg = vars.map_mmHg
  vars.cyp2d6_activity_score = Number(sym.cyp2d6_activity_score ?? 2)
  vars.cyp2c9_activity_score = Number(sym.cyp2c9_activity_score ?? 2)

  // Advisory copies of the refused solved-variable multipliers.
  for (const target of SOLVED_TARGETS) {
    const mods = table.get(target)
    if (!mods) continue
    let f = 1
    for (const m of mods.multiply) f *= m.value
    vars[`${target}_preset_multiplier_advisory`] = f
  }

  // --- Validity clamps -------------------------------------------------------
  if (!options.skipClamps) {
    const clamps = (model.validity_limits?.hard_output_clamps ?? {}) as Record<string, unknown>
    for (const [k, bounds] of Object.entries(clamps)) {
      if (!Array.isArray(bounds) || bounds.length !== 2) continue
      const v = vars[k]
      if (typeof v !== 'number') continue
      const [lo, hi] = bounds as [number, number]
      if (v < lo || v > hi) {
        const clamped = Math.min(hi, Math.max(lo, v))
        warnings.push(
          `Hard clamp fired on ${k}: ${round(v)} -> ${round(clamped)} (allowed ${lo}-${hi}). ` +
            `A clamp firing at baseline means an input is outside what the equations support.`,
        )
        vars[k] = clamped
      }
    }
  }
  warnings.push(...physiologicalRangeWarnings(vars, model))
  warnings.push(...equationValidityWarnings(inputs, vars, conditions))

  return {
    inputs,
    vars,
    appliedPresets: presetIds,
    warnings,
    categoricals,
    conditions: [...conditions],
    presetEffects,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Soft plausibility check against each state variable's `physiological_range`. */
function physiologicalRangeWarnings(vars: Record<string, number>, model: PatientModelFile): string[] {
  const out: string[] = []
  for (const group of Object.values(model.state_variables ?? {})) {
    if (!Array.isArray(group)) continue
    for (const spec of group as { id: string; physiological_range?: [number, number] }[]) {
      const r = spec?.physiological_range
      const v = vars[spec?.id]
      if (!Array.isArray(r) || typeof v !== 'number') continue
      if (v < r[0] || v > r[1]) {
        out.push(`${spec.id} = ${round(v)} is outside its physiological range ${r[0]}-${r[1]}.`)
      }
    }
  }
  return out
}

/** `validity_limits.equation_validity`, applied to this particular twin. */
function equationValidityWarnings(
  inputs: PatientInputs,
  vars: Record<string, number>,
  conditions: Set<string>,
): string[] {
  const out: string[] = []
  if (inputs.pregnant === true || conditions.has('pregnancy')) {
    out.push(
      'CKD-EPI 2021 is not valid in pregnancy — show the eGFR with a "not valid in this patient" badge, not hidden.',
    )
    out.push('Nadler blood volume and Watson total body water are not valid in pregnancy; treat as approximate.')
  }
  if (vars.bmi >= 40) out.push('Watson TBW is not validated in morbid obesity; treat body water as approximate.')
  if (vars.bmi < 16) out.push('Janmahasatian lean body weight is not validated below BMI 16; value clamped in spirit only.')
  if (vars.heart_rate_bpm > 100) {
    out.push('MAP = DBP + PP/3 under-estimates mean pressure above about 100 bpm; error is a few mmHg.')
  }
  if (conditions.has('hfref')) {
    out.push(
      'HFrEF: an acute run shows a beta-blocker reducing cardiac output before any chronic benefit. Do not present the acute result as the whole story.',
    )
  }
  if (inputs.age_years < 18 || inputs.age_years > 95) {
    out.push('Model is validated for adults 18-95 only; no paediatric maturation functions are implemented.')
  }
  return out
}

// ---------------------------------------------------------------------------
// Accessors the rules engine and the report share
// ---------------------------------------------------------------------------

export type PhenotypeCode = 'PM' | 'IM' | 'NM' | 'UM'

const CYP2D6_CODE: Record<string, PhenotypeCode> = {
  Poor: 'PM',
  Intermediate: 'IM',
  Normal: 'NM',
  Ultrarapid: 'UM',
  // Mapped so a rule does not silently fail to fire. The UI must say
  // "phenotype indeterminate — treated as normal metabolizer" rather than asserting NM.
  Indeterminate: 'NM',
}
const CYP2C9_CODE: Record<string, PhenotypeCode> = {
  Poor: 'PM',
  Intermediate: 'IM',
  Normal: 'NM',
}

/** Short CPIC codes, which is the vocabulary `rules.json` phenotype atoms compare against. */
export function phenotypeCode(twin: Twin, gene: 'cyp2d6' | 'cyp2c9' | 'cyp3a4'): PhenotypeCode {
  if (gene === 'cyp3a4') return 'NM' // unmodelled by design — see rules_engine_binding
  const long = twin.categoricals[`${gene}_phenotype`] ?? 'Normal'
  return (gene === 'cyp2d6' ? CYP2D6_CODE[long] : CYP2C9_CODE[long]) ?? 'NM'
}

/** True when the CKD-EPI result must be shown with a "not valid" badge. */
export function egfrIsValid(twin: Twin): boolean {
  return twin.inputs.pregnant !== true && !twin.conditions.includes('pregnancy')
}
