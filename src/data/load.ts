/**
 * Data loading and validation for the four PilSim JSON files.
 *
 * The files live in `public/data/` and are served at `/data/*.json`. Nothing here
 * invents a value: if a file is missing, malformed, or short of the record counts the
 * generating agents documented, loading FAILS LOUDLY. A silently half-loaded dataset
 * would let the simulator render numbers with no provenance behind them, which is the
 * one failure mode this product cannot have.
 *
 * Owned by Agent RUL. Types here are structural descriptions of the data files; the
 * normative cross-module contract is `src/types.ts` and is not restated.
 */

import type { Measured, Provenance, SeverityId, RuleEffect } from '../types'

// ---------------------------------------------------------------------------
// substances.json
// ---------------------------------------------------------------------------

export interface SubstanceFormulation {
  form: string
  route?: string
  strengths_mg?: number[]
  exists_real_world: boolean
  f_relative?: Measured
  tmax_h?: Measured
  peak_to_trough_swing?: Measured
  [k: string]: unknown
}

export interface SubstanceRecord {
  id: string
  name: string
  synonyms?: string[]
  /** 'active' for the six modelled molecules, 'excipient' for the rest. */
  role: string
  parent_substance_id?: string | null
  drug_class?: string | null
  atc_codes?: string[]
  identifiers?: Record<string, unknown>
  physchem?: Record<string, Measured | unknown>
  pk?: Record<string, unknown>
  pd?: Record<string, unknown>
  formulations?: SubstanceFormulation[]
  dosing?: Record<string, unknown>
  simulation_hooks?: Record<string, unknown>
  flags?: Record<string, unknown>
  record_notes?: unknown
  [k: string]: unknown
}

export interface SubstancesFile {
  schema_version: string
  disclaimer: string
  provenance_legend: Record<string, unknown>
  substances: SubstanceRecord[]
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// products.json
// ---------------------------------------------------------------------------

export interface ProductComposition {
  substance_id: string
  /** 'active' | 'excipient' | 'counter_ion' | 'COUNTER_ION' */
  role: string
  amount_mg: number | null
  amount_provenance?: Provenance
  [k: string]: unknown
}

export interface ProductRecord {
  id: string
  name: string
  product_class?: string
  dosage_form: string
  route?: string
  reference_brand_names?: string[]
  generic_name?: string
  available_strengths?: unknown
  modeled_strength_mg?: number | null
  composition: ProductComposition[]
  patient_flags_from_excipients?: string[]
  lactose_free?: boolean | null
  dosing_interval_h?: number | null
  typical_daily_dose_mg?: unknown
  /** Present only where a sourced IR-vs-ER comparison exists. Metoprolol only. */
  formulation_pk?: Measured
  [k: string]: unknown
}

export interface ProductsFile {
  schema_version: string
  disclaimer: string
  products: ProductRecord[]
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// rules.json
// ---------------------------------------------------------------------------

export type TriggerCombinator =
  | { all: TriggerNode[] }
  | { any: TriggerNode[] }
  /** `not` is documented as a combinator; in the shipped data it always wraps an array. */
  | { not: TriggerNode[] | TriggerNode }

export type AtomType =
  | 'substance'
  | 'drug_class'
  | 'condition'
  | 'lab'
  | 'demographic'
  | 'phenotype'
  | 'excipient'
  | 'dose'
  | 'route'
  | 'event'

export type AtomOperator =
  | 'present'
  | 'absent'
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'

export interface TriggerAtom {
  type: AtomType
  key: string
  op: AtomOperator
  value?: unknown
}

export type TriggerNode = TriggerCombinator | TriggerAtom

export interface RuleEvidence {
  source: string
  url?: string
  quote?: string
  type?: string
  retrieved?: string
  note?: string
}

export interface RuleRecord {
  id: string
  kind: string
  direction: 'negative' | 'positive' | 'modifier'
  title: string
  trigger: TriggerNode
  severity: SeverityId
  mechanism: string
  effects: RuleEffect[]
  warning?: { short: string; full: string }
  evidence?: RuleEvidence[]
  tags?: string[]
  confidence?: string
  [k: string]: unknown
}

export interface SeverityLevel {
  rank: number
  id: SeverityId
  blocks: boolean | 'unless_override'
  ui: string
}

export interface RulesFile {
  schema_version: string
  disclaimer: string
  severity_levels: SeverityLevel[]
  effect_ops: string[]
  demo_gate_rule_ids: Record<string, string>
  trigger_vocab: Record<string, unknown>
  organ_binding: Record<string, unknown>
  renal_function_contract: Record<string, unknown>
  rules: RuleRecord[]
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// patient_model.json
// ---------------------------------------------------------------------------

export interface DerivationStep {
  step: number
  id: string
  units?: string
  expr: string
  equation_name?: string
  [k: string]: unknown
}

export interface PresetModifier {
  target: string
  op: 'set' | 'multiply' | 'add' | 'clamp_min' | 'clamp_max'
  value: number
  prov?: unknown
  note?: string
}

export interface ComorbidityPreset {
  label?: string
  modifiers?: PresetModifier[]
  modifiers_by_stage?: Record<string, PresetModifier[]>
  modifiers_by_class?: Record<string, PresetModifier[] | unknown>
  additional_modifiers_all_classes?: PresetModifier[]
  satisfies_condition_keys?: string[]
  parameterised_by?: string
  evidence?: unknown
  [k: string]: unknown
}

export interface StateVariableSpec {
  id: string
  units?: string
  class?: 'dynamic' | 'derived' | 'static' | 'slow'
  physiological_range?: [number, number]
  healthy_reference?: [number, number]
  hard_clamp?: [number, number]
  expr?: string
  [k: string]: unknown
}

export interface PatientModelFile {
  meta: Record<string, unknown>
  inputs: Record<string, unknown>
  derivation_pipeline: DerivationStep[]
  state_variables: Record<string, unknown>
  comorbidity_presets: Record<string, ComorbidityPreset>
  pharmacogenomic_presets: Record<string, unknown>
  rules_engine_binding: {
    labs: Record<string, { stateVar: string | null; status: string; note?: string }>
    vitals: Record<string, { stateVar: string | null; status: string }>
    demographic: Record<string, { stateVar: string | null; status: string }>
    phenotype: Record<string, { stateVar: string | null; status: string; transform?: string }>
    condition_keys: Record<string, { kind?: string; preset?: string; [k: string]: unknown }>
    risk_channels: Record<string, unknown>
    [k: string]: unknown
  }
  validity_limits: {
    hard_output_clamps: Record<string, [number, number] | unknown>
    [k: string]: unknown
  }
  [k: string]: unknown
}

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

export interface PilSimData {
  substances: SubstancesFile
  products: ProductsFile
  rules: RulesFile
  patientModel: PatientModelFile
}

/** Counts the generating agents documented. A shortfall means a truncated file. */
export const EXPECTED_COUNTS = {
  substances: 43,
  products: 8,
  rules: 48,
  derivationSteps: 44,
} as const

export class DataLoadError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DataLoadError'
  }
}

function requireArray(file: string, field: string, v: unknown, expected: number): unknown[] {
  if (!Array.isArray(v)) {
    throw new DataLoadError(`${file}: expected \`${field}\` to be an array, got ${typeof v}.`, file)
  }
  if (v.length !== expected) {
    // Not fatal in itself, but it means the file is not the one this build was
    // written against. Loud is correct: a missing rule is a missing safety gate.
    throw new DataLoadError(
      `${file}: expected ${expected} entries in \`${field}\`, found ${v.length}. ` +
        `This build binds to the documented record counts; refusing to load a dataset ` +
        `that does not match rather than silently dropping a safety rule.`,
      file,
    )
  }
  return v
}

function requireObject(file: string, field: string, v: unknown): void {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new DataLoadError(`${file}: missing required object \`${field}\`.`, file)
  }
}

async function fetchJson(url: string, file: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (cause) {
    throw new DataLoadError(`Could not fetch ${url} (${file}). Is it served from public/data/?`, file, cause)
  }
  if (!res.ok) {
    throw new DataLoadError(`Fetching ${url} (${file}) failed with HTTP ${res.status} ${res.statusText}.`, file)
  }
  try {
    return await res.json()
  } catch (cause) {
    throw new DataLoadError(`${file} is not valid JSON.`, file, cause)
  }
}

/** Shape checks that run on already-parsed objects, so tests can reuse them. */
export function validateSubstances(raw: unknown): SubstancesFile {
  const f = raw as SubstancesFile
  requireObject('substances.json', '<root>', raw)
  requireArray('substances.json', 'substances', f.substances, EXPECTED_COUNTS.substances)
  for (const s of f.substances) {
    if (!s || typeof s.id !== 'string') {
      throw new DataLoadError('substances.json: a substance record has no `id`.', 'substances.json')
    }
  }
  return f
}

export function validateProducts(raw: unknown): ProductsFile {
  const f = raw as ProductsFile
  requireObject('products.json', '<root>', raw)
  requireArray('products.json', 'products', f.products, EXPECTED_COUNTS.products)
  for (const p of f.products) {
    if (!p || typeof p.id !== 'string') {
      throw new DataLoadError('products.json: a product record has no `id`.', 'products.json')
    }
    if (!Array.isArray(p.composition)) {
      throw new DataLoadError(`products.json: product ${p.id} has no \`composition\` array.`, 'products.json')
    }
  }
  return f
}

export function validateRules(raw: unknown): RulesFile {
  const f = raw as RulesFile
  requireObject('rules.json', '<root>', raw)
  requireArray('rules.json', 'rules', f.rules, EXPECTED_COUNTS.rules)
  requireArray('rules.json', 'severity_levels', f.severity_levels, 8)
  requireObject('rules.json', 'demo_gate_rule_ids', f.demo_gate_rule_ids)
  const ids = new Set<string>()
  for (const r of f.rules) {
    if (!r || typeof r.id !== 'string') {
      throw new DataLoadError('rules.json: a rule has no `id`.', 'rules.json')
    }
    if (ids.has(r.id)) {
      throw new DataLoadError(`rules.json: duplicate rule id ${r.id}.`, 'rules.json')
    }
    ids.add(r.id)
    if (!r.trigger) throw new DataLoadError(`rules.json: rule ${r.id} has no \`trigger\`.`, 'rules.json')
    if (!Array.isArray(r.effects)) {
      throw new DataLoadError(`rules.json: rule ${r.id} has no \`effects\` array.`, 'rules.json')
    }
  }
  // Every demo gate must resolve, or the four locked reject cases cannot be shown.
  for (const [gate, ruleId] of Object.entries(f.demo_gate_rule_ids)) {
    if (gate.startsWith('_') || gate === 'comment') continue
    if (!ids.has(ruleId)) {
      throw new DataLoadError(
        `rules.json: demo gate \`${gate}\` points at rule id \`${ruleId}\`, which does not exist.`,
        'rules.json',
      )
    }
  }
  return f
}

export function validatePatientModel(raw: unknown): PatientModelFile {
  const f = raw as PatientModelFile
  requireObject('patient_model.json', '<root>', raw)
  requireArray('patient_model.json', 'derivation_pipeline', f.derivation_pipeline, EXPECTED_COUNTS.derivationSteps)
  requireObject('patient_model.json', 'comorbidity_presets', f.comorbidity_presets)
  requireObject('patient_model.json', 'rules_engine_binding', f.rules_engine_binding)
  requireObject('patient_model.json', 'validity_limits', f.validity_limits)
  f.derivation_pipeline.forEach((s, i) => {
    if (!s || typeof s.id !== 'string' || typeof s.expr !== 'string') {
      throw new DataLoadError(
        `patient_model.json: derivation_pipeline[${i}] needs both \`id\` and \`expr\`.`,
        'patient_model.json',
      )
    }
  })
  return f
}

/**
 * Fetch and validate all four files. Rejects with a `DataLoadError` naming the file.
 * `base` exists so a test harness or a sub-path deployment can move the directory.
 */
export async function loadPilSimData(
  // Derived from Vite's BASE_URL (always ends in `/`), so the app works both at a
  // domain root and under a sub-path such as GitHub Pages' /<repo>/ without a
  // code change. Falls back to '/' when import.meta.env is absent, e.g. in tests.
  base = `${import.meta.env?.BASE_URL ?? '/'}data`,
): Promise<PilSimData> {
  const [substances, products, rules, patientModel] = await Promise.all([
    fetchJson(`${base}/substances.json`, 'substances.json'),
    fetchJson(`${base}/products.json`, 'products.json'),
    fetchJson(`${base}/rules.json`, 'rules.json'),
    fetchJson(`${base}/patient_model.json`, 'patient_model.json'),
  ])
  return {
    substances: validateSubstances(substances),
    products: validateProducts(products),
    rules: validateRules(rules),
    patientModel: validatePatientModel(patientModel),
  }
}

// ---------------------------------------------------------------------------
// Small access helpers the UI keeps needing
// ---------------------------------------------------------------------------

/** The six modelled molecules, in the order the report presents them. */
export const ACTIVE_SUBSTANCE_IDS = [
  'lisinopril',
  'losartan',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
] as const

export function findSubstance(data: PilSimData, id: string): SubstanceRecord | undefined {
  return data.substances.substances.find((s) => s.id === id)
}

export function findProduct(data: PilSimData, id: string): ProductRecord | undefined {
  return data.products.products.find((p) => p.id === id)
}

export function findRule(data: PilSimData, id: string): RuleRecord | undefined {
  return data.rules.rules.find((r) => r.id === id)
}

/** Actives only — the six molecules, not the 37 excipient records. */
export function activeSubstances(data: PilSimData): SubstanceRecord[] {
  return data.substances.substances.filter((s) => s.role === 'active')
}

/** Products whose composition contains this substance in an `active` role. */
export function productsContaining(data: PilSimData, substanceId: string): ProductRecord[] {
  return data.products.products.filter((p) =>
    p.composition.some((c) => c.substance_id === substanceId && /active/i.test(c.role)),
  )
}

/** Excipient substance ids present in a product. */
export function productExcipientIds(product: ProductRecord): string[] {
  return product.composition.filter((c) => /excipient/i.test(c.role)).map((c) => c.substance_id)
}
