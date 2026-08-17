/**
 * Narrow, typed views onto data/patient_model.json for the Test-Subject page.
 *
 * The file itself is loaded once by src/data/DataProvider (Agent DATA) and read here
 * through `useData()`. `PatientModelFile.inputs` and `state_variables` are typed as
 * Record<string, unknown> there, so this module provides the field-level shapes the
 * parameter panel needs and nothing more.
 *
 * Reference ranges are read from the file rather than hard-coded, because §7.5 and §12.1
 * of the organ effect map require the animation to take them from Agent D's model.
 */

import { useData } from '../../data/DataProvider'
import type { ComorbidityPreset, PatientModelFile, PresetModifier } from '../../data/load'
import type { RefRanges } from '../organs'
import { FALLBACK_REF } from '../organs'

export type { ComorbidityPreset, PatientModelFile, PresetModifier }
export type Modifier = PresetModifier

export interface FieldSpec {
  id: string
  label?: string
  units?: string
  type?: string
  values?: string[]
  default?: number | string | boolean | null
  default_male?: number
  default_female?: number
  min?: number
  max?: number
  step?: number
  allowed?: number[]
  reference_range?: [number, number]
  note?: string
}

export interface ModelLoad {
  model: PatientModelFile | null
  error: string | null
  loading: boolean
}

/** The patient model, from the app-wide data context. */
export function usePatientModel(): ModelLoad {
  const { patientModel, loading, error } = useData()
  return { model: patientModel, loading, error: error ? error.message : null }
}

// --------------------------------------------------------------------------- fields

function inputGroup(model: PatientModelFile | null, group: string): FieldSpec[] {
  const g = model?.inputs?.[group]
  return Array.isArray(g) ? (g as FieldSpec[]) : []
}

export function findField(model: PatientModelFile | null, id: string): FieldSpec | null {
  for (const group of ['demographics', 'vitals', 'labs', 'genotypes']) {
    const hit = inputGroup(model, group).find((f) => f.id === id)
    if (hit) return hit
  }
  return null
}

// --------------------------------------------------------------------------- presets

/**
 * Which PatientInputs key selects the grade for a graded preset.
 * These are the keys src/rules/twin.ts actually reads, so the panel writes to them
 * directly rather than keeping a parallel grade map the twin would never see.
 */
export const GRADE_INPUT_KEY: Record<string, string> = {
  ckd: 'ckd_stage',
  hepatic_impairment: 'child_pugh_class',
}

export function presetGrades(p: ComorbidityPreset): string[] {
  const byStage = p.modifiers_by_stage as Record<string, unknown> | undefined
  if (byStage) return Object.keys(byStage)
  const byClass = p.modifiers_by_class as Record<string, unknown> | undefined
  if (byClass) return Object.keys(byClass)
  return []
}

/** The modifier list a preset contributes at the chosen grade — for the "what moved" list. */
export function presetModifiers(p: ComorbidityPreset, grade?: string): Modifier[] {
  const out: Modifier[] = []
  const direct = p.modifiers as Modifier[] | undefined
  if (Array.isArray(direct)) out.push(...direct)

  const byStage = p.modifiers_by_stage as Record<string, Modifier[]> | undefined
  if (byStage) {
    const key = grade && byStage[grade] ? grade : Object.keys(byStage)[0]
    if (key && Array.isArray(byStage[key])) out.push(...byStage[key])
  }

  const byClass = p.modifiers_by_class as Record<string, Modifier[]> | undefined
  if (byClass) {
    const wanted = grade?.toUpperCase()
    const key = wanted && byClass[wanted] ? wanted : Object.keys(byClass)[0]
    if (key && Array.isArray(byClass[key])) out.push(...byClass[key])
  }

  const extra = p.additional_modifiers_all_classes as Modifier[] | undefined
  if (Array.isArray(extra)) out.push(...extra)

  return out.filter((m) => m && typeof m.target === 'string' && typeof m.value === 'number')
}

// --------------------------------------------------------------------------- ranges

/**
 * Laboratory reference bounds for the gauges and the badge gates.
 *
 * Note the deliberate distinction: the laboratory upper reference limit for potassium is
 * 5.0 mmol/L, but the hyperkalaemia BADGE fires at the clinical 5.5 mmol/L bound the organ
 * map specifies. Both meanings are kept rather than collapsed into one number.
 */
export function refRangesFrom(model: PatientModelFile | null): RefRanges {
  const labs = inputGroup(model, 'labs')
  const rr = (id: string): [number, number] | undefined =>
    labs.find((f) => f.id === id)?.reference_range as [number, number] | undefined

  const k = rr('serum_k_mmol_L')
  const na = rr('serum_na_mmol_L')
  const urate = rr('serum_urate_mg_dL')

  return {
    ...FALLBACK_REF,
    kLow: k?.[0] ?? FALLBACK_REF.kLow,
    kHigh: FALLBACK_REF.kHigh,
    naLow: na?.[0] ?? FALLBACK_REF.naLow,
    naHigh: na?.[1] ?? FALLBACK_REF.naHigh,
    urateHigh: urate?.[1] ?? FALLBACK_REF.urateHigh,
  }
}
