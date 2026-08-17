/**
 * The safety rules engine.
 *
 * Evaluates every rule in `data/rules.json` against a `PatientState` and a `Regimen`,
 * and folds the fired rules' effects into a `RuleModifiers` for the simulation engine
 * and the report.
 *
 * Three things are worth knowing before reading the code:
 *
 * 1. THE SEVERITY LADDER HAS EIGHT RUNGS AND ONLY THE TOP ONE HARD-BLOCKS.
 *    Rank 7 `contraindicated_absolute` blocks. Rank 6 `contraindicated_relative`
 *    requires an override — it is an AVOID, not an absolute contraindication, and the
 *    engine keeps those two states distinct because clinically they are not the same
 *    claim. Dual RAAS blockade is rank 6: the label says "in general, avoid combined
 *    use of RAS inhibitors", not "contraindicated". Asthma plus metoprolol is likewise
 *    rank 6 with a concentration-gated FEV1 effect, because asthma does not appear in
 *    metoprolol's CONTRAINDICATIONS section at all — it is Warning 5.3.
 *
 * 2. TRIGGERS ARE A SMALL BOOLEAN LANGUAGE over typed atoms. `all` / `any` / `not`
 *    combinators over `substance`, `drug_class`, `condition`, `lab`, `phenotype`,
 *    `excipient`, `dose`, `demographic`, `route` and `event` atoms. Every atom type is
 *    resolved through an explicit resolver; an unresolvable atom makes its rule NOT
 *    fire and is reported in `unresolvedAtoms`, never silently treated as false.
 *
 * 3. PHENOCONVERSION IS REAL. Per CPIC's 2024 beta-blocker guideline a strong CYP2D6
 *    inhibitor forces the activity score to zero (treat as a poor metaboliser) and a
 *    moderate inhibitor halves it. That is applied here, before any rule keyed on
 *    phenotype is evaluated, so PGX-CYP2D6-PM-METOPROLOL fires for a genotypic normal
 *    metaboliser taking paroxetine.
 *
 * Owned by Agent RUL.
 */

import type {
  DrugId,
  Provenance,
  Regimen,
  RuleEffect,
  RuleHit,
  RuleModifiers,
  PatientState,
  SeverityId,
} from '../types'
import type { RuleRecord, RulesFile, TriggerAtom, TriggerNode } from '../data/load'
import { evidenceToProvenance } from '../data/provenance'
import type { PhenotypeCode, Twin } from './twin'

// ---------------------------------------------------------------------------
// Context — everything a rule can ask about that is not in PatientState/Regimen
// ---------------------------------------------------------------------------

export interface RuleContext {
  /**
   * Drug classes present from co-medication the twin does not model
   * pharmacokinetically (NSAIDs, lithium, potassium supplements, CYP inhibitors,
   * aliskiren, sacubitril/valsartan...). Vocabulary: `rules.json` trigger_vocab.drug_classes.
   */
  coMedicationClasses?: string[]
  /** Named partners, for effects with `applies_to_partner` (propafenone, diltiazem...). */
  coMedications?: string[]
  /** Excipients present in the chosen products, plus numeric excipient facts. */
  excipients?: Record<string, boolean | number>
  /** Event flags, e.g. `metoprolol_discontinued_without_taper`. */
  events?: string[]
  /** Extra condition keys beyond those the twin resolved. */
  conditions?: string[]
  /** Which metoprolol salt/product the arm uses. Gates CI-HFREF-METOPROLOL-SUCCINATE. */
  metoprololSalt?: 'succinate_er' | 'tartrate_ir'
  /** Product ids in the arm, for `applies_to_product` score deltas. */
  productIds?: string[]
  /**
   * A moderate CYP2D6 inhibitor is present. `rules.json` has no
   * `cyp2d6_inhibitor_moderate` drug class, so CPIC's "halve the activity score" arm
   * is carried here rather than invented into the data file.
   */
  moderateCyp2d6Inhibitor?: boolean
  /** Clinical context flags used by effects with a `when` guard. */
  flags?: string[]
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface EvaluationResult extends RuleModifiers {
  /** Hits that only require an override — an AVOID, not an absolute contraindication. */
  overrideRequired: RuleHit[]
  /** Feasibility tier per research/05-OUTPUT-REPORT-SPEC.md section 4.1. */
  tier: 'ALLOWED' | 'OVERRIDE_REQUIRED' | 'DISQUALIFIED'
  /** Aggregated `score_delta`, by objective, before the report applies its weights. */
  scoreDeltas: { efficacy: number; safety: number; appropriateness: number }
  /** Per-substance appropriateness deltas from `applies_to` scoped rules. */
  scoreDeltasBySubstance: Record<string, { efficacy: number; safety: number; appropriateness: number }>
  /** `risk.<name>` channels the rules set, 0..1. */
  risks: Record<string, number>
  /** `monitor` effects, merged by lab. */
  monitoring: { lab: string; atDays: number[]; ruleIds: string[] }[]
  /** `annotate_organ` effects for the animation layer. */
  organAnnotations: { organ: string; channel: string; direction: string; ruleId: string }[]
  /** Dose ceilings for co-medications the twin does not model, e.g. simvastatin 20 mg. */
  externalDoseCaps: Record<string, number>
  /** Starting doses in mg/day, keyed by substance id. */
  doseStarts: Record<string, number>
  /** Titration intervals in days, keyed by substance id. */
  titrationIntervalDays: Record<string, number>
  /** Atoms that could not be resolved. Non-empty means a rule silently did not fire. */
  unresolvedAtoms: { ruleId: string; atom: TriggerAtom; reason: string }[]
  /**
   * Effect ops this engine does not implement. Non-empty means `rules.json` grew a
   * capability the code has not caught up with, and that capability is currently INERT.
   * Treat as a build defect, not a warning to live with.
   */
  unhandledEffectOps?: { op: string; ruleId: string }[]
  /**
   * Modelling caveats carried by fired effects. These are limitations of how the data
   * was combined, not pharmacology, and the report MUST surface them rather than
   * leaving them in a tooltip — an assumption that changes a recommendation has to be
   * visible next to the recommendation.
   */
  caveats?: { ruleId: string; channel?: string; text: string; basis?: string }[]
}

/**
 * A canonical empty result, for callers that need a placeholder before any rule has
 * run. Prefer this to a hand-written object literal: when `EvaluationResult` grows a
 * field, every literal has to be found and updated, and the ones that are missed either
 * break the build or quietly carry the wrong default.
 */
export function emptyEvaluation(): EvaluationResult {
  return {
    hits: [],
    blocked: false,
    blockReasons: [],
    pkMultipliers: {},
    pdMultipliers: {},
    stateShifts: {},
    doseCaps: {},
    phenoconversions: {},
    overrideRequired: [],
    tier: 'ALLOWED',
    scoreDeltas: { efficacy: 0, safety: 0, appropriateness: 0 },
    scoreDeltasBySubstance: {},
    risks: {},
    monitoring: [],
    organAnnotations: [],
    unhandledEffectOps: [],
    caveats: [],
    externalDoseCaps: {},
    doseStarts: {},
    titrationIntervalDays: {},
    unresolvedAtoms: [],
  }
}

/**
 * Every effect op `evaluateRules` actually implements. Asserted against `rules.json`
 * `effect_ops` in the test suite so a newly declared op cannot ship inert.
 */
export const HANDLED_EFFECT_OPS: readonly string[] = [
  'block',
  'require_override',
  'pk_multiply',
  'pd_multiply',
  'state_shift',
  'risk_set',
  'risk_modify',
  'dose_cap',
  'dose_start',
  'titration_interval_days',
  'phenoconvert',
  'score_delta',
  'monitor',
  'annotate_organ',
] as const

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Classes each modelled substance itself belongs to, for `drug_class` atoms. */
export const SUBSTANCE_CLASSES: Record<string, string[]> = {
  lisinopril: ['ace_inhibitor'],
  losartan: ['arb'],
  exp3174: ['arb'],
  amlodipine: ['dhp_ccb'],
  hydrochlorothiazide: ['thiazide'],
  metoprolol: ['beta_blocker_b1_selective'],
}

const SEVERITY_RANK: Record<SeverityId, number> = {
  info: 0,
  preferred: 1,
  compelling: 2,
  minor: 3,
  moderate: 4,
  major: 5,
  contraindicated_relative: 6,
  contraindicated_absolute: 7,
}

/** `pk.<substance>.<param>` / `pd.<substance>.<param>` -> substance id. */
function targetSubstance(target: unknown): string | null {
  if (typeof target !== 'string') return null
  const parts = target.split('.')
  if (parts.length < 2) return null
  const id = parts[1]
  if (id === 'losartan_e3174') return 'exp3174'
  return id
}

// ---------------------------------------------------------------------------
// Atom resolution
// ---------------------------------------------------------------------------

export interface EvalEnv {
  patient: PatientState
  twin: Twin | null
  regimen: Regimen
  ctx: RuleContext
  substanceIds: Set<string>
  drugClasses: Set<string>
  conditions: Set<string>
  phenotypes: Record<string, PhenotypeCode>
  labs: Record<string, number>
  demographics: Record<string, number | boolean | string>
  dosesPerDay: Record<string, number>
  unresolved: { atom: TriggerAtom; reason: string }[]
}

function compare(op: string, actual: unknown, expected: unknown): boolean | null {
  switch (op) {
    case 'present':
      return actual === true || (typeof actual === 'number' && actual !== 0)
    case 'absent':
      return !(actual === true || (typeof actual === 'number' && actual !== 0))
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never)
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never)
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
    case 'between':
      return (
        typeof actual === 'number' &&
        Array.isArray(expected) &&
        expected.length === 2 &&
        actual >= Number(expected[0]) &&
        actual <= Number(expected[1])
      )
    default:
      return null
  }
}

function evalAtom(atom: TriggerAtom, env: EvalEnv): boolean {
  const fail = (reason: string): boolean => {
    env.unresolved.push({ atom, reason })
    return false
  }

  switch (atom.type) {
    case 'substance': {
      const present = env.substanceIds.has(atom.key)
      const r = compare(atom.op, present, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for substance atoms`)
    }
    case 'drug_class': {
      const present = env.drugClasses.has(atom.key)
      const r = compare(atom.op, present, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for drug_class atoms`)
    }
    case 'condition': {
      const present = env.conditions.has(atom.key)
      const r = compare(atom.op, present, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for condition atoms`)
    }
    case 'event': {
      const present = (env.ctx.events ?? []).includes(atom.key)
      const r = compare(atom.op, present, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for event atoms`)
    }
    case 'excipient': {
      const raw = env.ctx.excipients?.[atom.key]
      if (atom.op === 'present' || atom.op === 'absent') {
        return compare(atom.op, raw === true || (typeof raw === 'number' && raw > 0), atom.value) ?? false
      }
      if (typeof raw !== 'number') {
        // Not knowing the sodium content is not the same as knowing it is zero.
        return fail(`excipient quantity "${atom.key}" was not supplied in the rule context`)
      }
      const r = compare(atom.op, raw, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for excipient atoms`)
    }
    case 'phenotype': {
      const code = env.phenotypes[atom.key]
      if (!code) return fail(`phenotype "${atom.key}" is not modelled`)
      const r = compare(atom.op, code, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for phenotype atoms`)
    }
    case 'lab': {
      const v = env.labs[atom.key]
      if (typeof v !== 'number') return fail(`state path "${atom.key}" does not resolve to a twin variable`)
      const r = compare(atom.op, v, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for lab atoms`)
    }
    case 'demographic': {
      const v = env.demographics[atom.key]
      if (v === undefined) return fail(`demographic "${atom.key}" is not available`)
      const r = compare(atom.op, v, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for demographic atoms`)
    }
    case 'dose': {
      const v = env.dosesPerDay[atom.key]
      if (typeof v !== 'number') return fail(`no dose recorded for "${atom.key}"`)
      const r = compare(atom.op, v, atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for dose atoms`)
    }
    case 'route': {
      // Every modelled product is oral. Anything else cannot be asserted.
      const r = compare(atom.op, atom.key === 'oral', atom.value)
      return r ?? fail(`operator ${atom.op} is not defined for route atoms`)
    }
    default:
      return fail(`unknown atom type "${String((atom as TriggerAtom).type)}"`)
  }
}

function isAtom(n: TriggerNode): n is TriggerAtom {
  return typeof (n as TriggerAtom).type === 'string' && typeof (n as TriggerAtom).key === 'string'
}

export function evalTrigger(node: TriggerNode, env: EvalEnv): boolean {
  if (!node) return false
  if (isAtom(node)) return evalAtom(node, env)
  const n = node as Record<string, unknown>
  if (Array.isArray(n.all)) return (n.all as TriggerNode[]).every((c) => evalTrigger(c, env))
  if (Array.isArray(n.any)) return (n.any as TriggerNode[]).some((c) => evalTrigger(c, env))
  if (n.not !== undefined) {
    // `not` is documented as a combinator; in the shipped data it always wraps an
    // array of one node. NOT(all of them) is the reading that makes every shipped
    // instance correct and degrades sensibly for a single node.
    const children = Array.isArray(n.not) ? (n.not as TriggerNode[]) : [n.not as TriggerNode]
    return !children.every((c) => evalTrigger(c, env))
  }
  return false
}

// ---------------------------------------------------------------------------
// Environment construction
// ---------------------------------------------------------------------------

function isTwin(p: PatientState): p is Twin {
  return Array.isArray((p as Twin).conditions) && typeof (p as Twin).categoricals === 'object'
}

/**
 * `rules.json` addresses the twin through `labs.*` / `vitals.*` namespaced keys.
 * `patient_model.json` `rules_engine_binding` is the authoritative translation; this
 * mirror is kept in code so the engine works even when the model file is not to hand,
 * and `buildEnv` prefers the file's map when it is available.
 */
export const STATE_PATH_BINDING: Record<string, string> = {
  'labs.egfr_ml_min_1_73': 'egfr_ckdepi2021',
  'labs.serum_creatinine_mg_dl': 'scr_mg_dL',
  'labs.serum_k_mmol_l': 'serum_k_mmol_L',
  'labs.serum_na_mmol_l': 'serum_na_mmol_L',
  'labs.serum_urate_mg_dl': 'serum_urate_mg_dL',
  'labs.serum_calcium_mg_dl': 'serum_ca_mg_dL',
  'labs.urine_calcium_mg_day': 'urine_calcium_mg_day',
  'labs.uacr_mg_g': 'uacr_mg_g',
  'labs.fasting_glucose_mg_dl': 'fasting_glucose_mg_dL',
  'labs.hba1c_pct': 'hba1c_pct',
  'labs.ldl_mg_dl': 'ldl_mg_dL',
  'labs.triglycerides_mg_dl': 'triglycerides_mg_dL',
  'labs.alt_u_l': 'alt_u_L',
  'labs.serum_lithium_mmol_l': 'serum_lithium_mmol_L',
  'labs.lvef_pct': 'lvef_pct',
  'vitals.sbp_mmhg': 'sbp_mmHg',
  'vitals.dbp_mmhg': 'dbp_mmHg',
  'vitals.hr_bpm': 'heart_rate_bpm',
  'vitals.map_mmhg': 'map_mmHg',
  'vitals.cardiac_output_l_min': 'cardiac_output_L_min',
  'vitals.lvef_pct': 'lvef_pct',
  'vitals.svr_dyn_s_cm5': 'svr_dyn_s_cm5',
  'vitals.plasma_volume_l': 'plasma_volume_L',
  'vitals.fev1_pct_predicted': 'fev1_pct_predicted',
}

function buildEnv(patient: PatientState, regimen: Regimen, ctx: RuleContext): EvalEnv {
  const twin = isTwin(patient) ? patient : null

  const substanceIds = new Set<string>(regimen.doses.map((d) => d.substanceId))
  const drugClasses = new Set<string>(ctx.coMedicationClasses ?? [])
  for (const id of substanceIds) for (const c of SUBSTANCE_CLASSES[id] ?? []) drugClasses.add(c)

  const conditions = new Set<string>([
    ...(twin?.conditions ?? (patient.inputs.comorbidities ?? []).map(String)),
    ...(ctx.conditions ?? []),
  ])
  if (patient.inputs.pregnant === true) conditions.add('pregnancy')

  const labs: Record<string, number> = {}
  for (const [path, stateVar] of Object.entries(STATE_PATH_BINDING)) {
    const v = patient.vars[stateVar]
    if (typeof v === 'number') labs[path] = v
  }

  const dosesPerDay: Record<string, number> = {}
  for (const d of regimen.doses) {
    dosesPerDay[d.substanceId] = (dosesPerDay[d.substanceId] ?? 0) + d.mg * d.perDay
  }

  const demographics: Record<string, number | boolean | string> = {
    age_years: patient.inputs.age_years,
    sex: patient.inputs.sex,
    weight_kg: patient.inputs.weight_kg,
    bmi: patient.vars.bmi,
    pregnant: patient.inputs.pregnant === true,
    lactating: patient.inputs.lactating === true || conditions.has('lactation'),
  }

  // --- Phenoconversion, before any phenotype atom is read ---------------------
  const phenotypes: Record<string, PhenotypeCode> = {
    cyp2d6: codeFor(patient, twin, 'cyp2d6'),
    cyp2c9: codeFor(patient, twin, 'cyp2c9'),
    cyp3a4: 'NM',
  }

  return {
    patient,
    twin,
    regimen,
    ctx,
    substanceIds,
    drugClasses,
    conditions,
    phenotypes,
    labs,
    demographics,
    dosesPerDay,
    unresolved: [],
  }
}

const CYP2D6_BINS: [number, PhenotypeCode][] = [
  [2.25, 'UM'],
  [1.25, 'NM'],
  [0, 'IM'],
]

/** CPIC 2024 Table 1 bins. AS 1.0 is INTERMEDIATE under the 2019 consensus, not normal. */
export function cyp2d6CodeFromActivityScore(score: number): PhenotypeCode {
  if (score > CYP2D6_BINS[0][0]) return 'UM'
  if (score >= CYP2D6_BINS[1][0]) return 'NM'
  if (score > CYP2D6_BINS[2][0]) return 'IM'
  return 'PM'
}

export function cyp2c9CodeFromActivityScore(score: number): PhenotypeCode {
  if (score === 2) return 'NM'
  if (score >= 1) return 'IM'
  return 'PM'
}

function codeFor(patient: PatientState, twin: Twin | null, gene: 'cyp2d6' | 'cyp2c9'): PhenotypeCode {
  const long = twin?.categoricals?.[`${gene}_phenotype`]
  if (long) {
    const map: Record<string, PhenotypeCode> = {
      Poor: 'PM',
      Intermediate: 'IM',
      Normal: 'NM',
      Ultrarapid: 'UM',
      Indeterminate: 'NM',
    }
    return map[long] ?? 'NM'
  }
  const score = patient.vars[`${gene}_activity_score`]
  if (typeof score === 'number') {
    return gene === 'cyp2d6' ? cyp2d6CodeFromActivityScore(score) : cyp2c9CodeFromActivityScore(score)
  }
  return 'NM'
}

/**
 * CPIC 2024 beta-blocker guideline, phenoconversion rule, verbatim:
 * "assume a CYP2D6 activity score of zero (i.e., poor metabolizer) in patients taking
 * adequate doses of a concomitant strong CYP2D6 inhibitor and to reduce the predicted
 * activity score by half in patients taking a moderate inhibitor. No activity score
 * adjustment is suggested for weak inhibitors."
 */
export function phenoconvertCyp2d6(
  activityScore: number,
  opts: { strongInhibitor: boolean; moderateInhibitor: boolean },
): { score: number; code: PhenotypeCode; applied: 'strong' | 'moderate' | null } {
  if (opts.strongInhibitor) return { score: 0, code: 'PM', applied: 'strong' }
  if (opts.moderateInhibitor) {
    const s = activityScore / 2
    return { score: s, code: cyp2d6CodeFromActivityScore(s), applied: 'moderate' }
  }
  return { score: activityScore, code: cyp2d6CodeFromActivityScore(activityScore), applied: null }
}

// ---------------------------------------------------------------------------
// Effect guards
// ---------------------------------------------------------------------------

/**
 * `when` guards on `pk_multiply` / `dose_start` / `dose_cap` / `titration_interval_days`.
 * An unrecognised guard means the effect does not apply — the alternative is applying a
 * renal dose reduction to a patient with normal kidneys.
 */
function guardHolds(effect: RuleEffect, env: EvalEnv): boolean {
  const when = effect.when
  if (typeof when !== 'string') return true
  const egfr = env.labs['labs.egfr_ml_min_1_73'] ?? NaN
  const flags = new Set(env.ctx.flags ?? [])
  switch (when) {
    case 'crcl_10_to_30':
      return egfr > 10 && egfr <= 30
    case 'crcl_lt_10_or_hemodialysis':
      return egfr <= 10 || flags.has('hemodialysis')
    case 'hepatic_impairment':
      return env.conditions.has('hepatic_impairment') || env.conditions.has('cirrhosis')
    case 'elderly':
      return env.patient.inputs.age_years >= 75 || env.conditions.has('elderly')
    case 'heart_failure':
      return env.conditions.has('hfref') || env.conditions.has('hfpef')
    case 'nyha_2':
      return flags.has('nyha_2')
    default:
      return flags.has(when)
  }
}

function partnerHolds(effect: RuleEffect, env: EvalEnv): boolean {
  const p = effect.applies_to_partner
  if (typeof p !== 'string') return true
  const named = new Set((env.ctx.coMedications ?? []).map((s) => s.toLowerCase()))
  if (p === 'strong_3a4_inhibitor') return env.drugClasses.has('cyp3a4_inhibitor_strong')
  return named.has(p.toLowerCase())
}

function phenotypeHolds(effect: RuleEffect, env: EvalEnv): boolean {
  const p = effect.applies_to_phenotype
  if (typeof p !== 'string') return true
  return env.phenotypes.cyp2d6 === p || env.phenotypes.cyp2c9 === p
}

function saltHolds(effect: RuleEffect, env: EvalEnv): boolean {
  const s = effect.requires_salt
  if (typeof s !== 'string') return true
  return env.ctx.metoprololSalt === s
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function severityRank(id: SeverityId, rules?: RulesFile): number {
  const fromFile = rules?.severity_levels?.find((l) => l.id === id)
  return fromFile?.rank ?? SEVERITY_RANK[id] ?? 0
}

function firstEvidence(rule: RuleRecord): Provenance | undefined {
  const e = rule.evidence?.[0]
  return e ? evidenceToProvenance(e) : undefined
}

function emptyDeltas() {
  return { efficacy: 0, safety: 0, appropriateness: 0 }
}

/**
 * Evaluate every rule and fold the fired effects into a `RuleModifiers`.
 *
 * `blocked` is true only when a rank 7 rule fired AND carried a `block` effect. A rank 6
 * `require_override` rule sets `tier = 'OVERRIDE_REQUIRED'` and populates
 * `overrideRequired`, but does NOT block: the report ranks that arm below every allowed
 * one instead of refusing to compute it.
 */
export function evaluateRules(
  patient: PatientState,
  regimen: Regimen,
  rules: RulesFile,
  ctx: RuleContext = {},
): EvaluationResult {
  const env = buildEnv(patient, regimen, ctx)

  // --- Phenoconversion pre-pass ---------------------------------------------
  const phenoconversions: Record<string, string> = {}
  const strong2d6 = env.drugClasses.has('cyp2d6_inhibitor_strong')
  const moderate2d6 = ctx.moderateCyp2d6Inhibitor === true
  if (strong2d6 || moderate2d6) {
    const baseScore = typeof patient.vars.cyp2d6_activity_score === 'number' ? patient.vars.cyp2d6_activity_score : 2
    const conv = phenoconvertCyp2d6(baseScore, {
      strongInhibitor: strong2d6,
      moderateInhibitor: moderate2d6,
    })
    env.phenotypes.cyp2d6 = conv.code
    phenoconversions['phenotype.cyp2d6'] = conv.code
    phenoconversions['cyp2d6_activity_score'] = String(conv.score)
  }
  // Reduced CYP2C9 capacity in cirrhosis mimics a poor metaboliser pharmacologically.
  if (env.conditions.has('hepatic_impairment') && env.phenotypes.cyp2c9 === 'NM') {
    const m = patient.vars.cyp2c9_pathway_multiplier
    if (typeof m === 'number' && m <= 0.65) {
      env.phenotypes.cyp2c9 = 'IM'
      phenoconversions['phenotype.cyp2c9'] = 'IM'
    }
  }

  // --- Fire rules ------------------------------------------------------------
  const hits: RuleHit[] = []
  const unresolvedAtoms: EvaluationResult['unresolvedAtoms'] = []

  for (const rule of rules.rules) {
    env.unresolved = []
    const fired = evalTrigger(rule.trigger, env)
    for (const u of env.unresolved) unresolvedAtoms.push({ ruleId: rule.id, ...u })
    if (!fired) continue

    const rank = severityRank(rule.severity, rules)
    hits.push({
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      severityRank: rank,
      blocks: rank === 7 && rule.effects.some((e) => e.op === 'block'),
      direction: rule.direction,
      mechanism: rule.mechanism,
      warningText: rule.warning?.full ?? rule.warning?.short,
      effects: rule.effects,
      citation: firstEvidence(rule),
    })
  }

  // Most severe first; ties broken by negative-before-positive then rule id, so the
  // ordering is stable across runs and the UI can rely on hits[0] being the headline.
  hits.sort((a, b) => {
    if (b.severityRank !== a.severityRank) return b.severityRank - a.severityRank
    const dir = (h: RuleHit) => (h.direction === 'negative' ? 0 : h.direction === 'modifier' ? 1 : 2)
    if (dir(a) !== dir(b)) return dir(a) - dir(b)
    return a.ruleId.localeCompare(b.ruleId)
  })

  // --- Fold effects ----------------------------------------------------------
  const result: EvaluationResult = {
    hits,
    blocked: false,
    blockReasons: [],
    pkMultipliers: {},
    pdMultipliers: {},
    stateShifts: {},
    doseCaps: {},
    phenoconversions,
    overrideRequired: [],
    tier: 'ALLOWED',
    scoreDeltas: emptyDeltas(),
    scoreDeltasBySubstance: {},
    risks: {},
    monitoring: [],
    organAnnotations: [],
    unhandledEffectOps: [],
    caveats: [],
    externalDoseCaps: {},
    doseStarts: {},
    titrationIntervalDays: {},
    unresolvedAtoms,
  }

  const monitorIndex = new Map<string, { lab: string; atDays: number[]; ruleIds: string[] }>()
  const pendingRiskModifiers: { effect: RuleEffect; hit: RuleHit }[] = []

  for (const hit of hits) {
    // A rule scoped to particular substances (CI-GOUT-PREFER-LOSARTAN is scoped to
    // losartan, CI-HFREF-METOPROLOL-SUCCINATE to metoprolol) may still FIRE on a
    // regimen that does not contain them — its trigger is a patient-state statement,
    // not a prescription. But its PHARMACOLOGY must not be applied to an arm that does
    // not contain the drug: losartan's urate-lowering effect is losartan's, and
    // crediting it to a hydrochlorothiazide arm would invert the exact contrast the
    // gout demo exists to show. The hit is kept; the drug-specific effects are not.
    const scope = ruleSubstanceScope(hit)
    const inScope = scope.length === 0 || scope.some((s) => env.substanceIds.has(s))

    for (const effect of hit.effects) {
      switch (effect.op) {
        // ---- 1. block: only a rank 7 rule hard-blocks -----------------------
        case 'block': {
          if (hit.severityRank === 7) {
            result.blocked = true
            result.blockReasons.push(
              `${hit.title} — ${String(effect.reason ?? hit.warningText ?? hit.mechanism)}`,
            )
          } else {
            // Defensive: a `block` below rank 7 is downgraded, not honoured. Only the
            // top rung of the ladder is an absolute contraindication.
            result.overrideRequired.push(hit)
          }
          break
        }

        // ---- 2. require_override: AVOID, not contraindicated ----------------
        case 'require_override': {
          if (!result.overrideRequired.some((h) => h.ruleId === hit.ruleId)) result.overrideRequired.push(hit)
          break
        }

        // ---- 3/4. pk_multiply / pd_multiply --------------------------------
        case 'pk_multiply':
        case 'pd_multiply': {
          if (!inScope) break
          if (!guardHolds(effect, env) || !partnerHolds(effect, env) || !phenotypeHolds(effect, env)) break
          const factor = Number(effect.factor)
          if (!Number.isFinite(factor)) break
          const sub = targetSubstance(effect.target)
          const bag = effect.op === 'pk_multiply' ? result.pkMultipliers : result.pdMultipliers
          if (sub === '*' || sub === 'combined') {
            // `pd.*.sbp_drop_mmhg` applies to every drug in the arm.
            for (const d of regimen.doses) {
              const k = d.substanceId
              bag[k] = (bag[k] ?? 1) * factor
            }
          } else if (sub && (env.substanceIds.has(sub) || sub === 'exp3174')) {
            const k = sub as DrugId
            bag[k] = (bag[k] ?? 1) * factor
          }
          // Targets naming an unmodelled partner (lithium, simvastatin, hypoglycemia
          // symptom visibility) are intentionally dropped from the PK/PD bags; they are
          // still visible on the hit for the report to narrate.
          break
        }

        // ---- 5. state_shift -------------------------------------------------
        case 'state_shift': {
          if (!inScope) break
          const target = String(effect.target)
          const stateVar = STATE_PATH_BINDING[target] ?? target
          const delta = Number(effect.delta)
          if (!Number.isFinite(delta)) break
          result.stateShifts[stateVar] = (result.stateShifts[stateVar] ?? 0) + delta
          break
        }

        // ---- 6. risk_set ----------------------------------------------------
        case 'risk_set': {
          if (!inScope) break
          // A risk effect tagged with a `substance` belongs to that drug. AE-CHANNELS-
          // VISIBLE fires on ANY of lisinopril / amlodipine / hydrochlorothiazide and
          // then lists each drug's own adverse-effect channel; without this gate an
          // amlodipine-only arm inherits lisinopril's cough, angioedema and
          // hyperkalaemia, each carrying a real FDA citation pointing at a drug the
          // patient is not taking.
          const substance = typeof effect.substance === 'string' ? effect.substance : null
          if (substance && !env.substanceIds.has(substance)) break

          const target = String(effect.target)
          const p = riskProbability(effect, substance ? (env.dosesPerDay[substance] ?? 0) : 0)
          if (p === null) break
          // Two entries on the SAME channel are two estimates of one quantity, not two
          // independent events — AE-CHANNELS-VISIBLE gives ACE-inhibitor cough twice,
          // 2.5% placebo-subtracted from the label and 11.48% real-world pooled, with
          // the data telling us to prefer the second. Composing them as independent
          // hazards would report 13.7%, a number no source states. Take the maximum.
          result.risks[target] = Math.max(result.risks[target] ?? 0, p)
          break
        }

        // ---- 6b. risk_modify -------------------------------------------------
        case 'risk_modify': {
          if (!inScope) break
          const substance = typeof effect.substance === 'string' ? effect.substance : null
          if (substance && !env.substanceIds.has(substance)) break
          // Deferred: risk_modify SCALES a probability that risk_set must already have
          // established. Applying it inline would make the result depend on the order
          // effects happen to appear in within the rule. Collected now, applied after
          // every risk_set across every fired rule has run.
          pendingRiskModifiers.push({ effect, hit })
          break
        }

        // ---- 7. dose_cap ----------------------------------------------------
        case 'dose_cap': {
          if (!inScope || !guardHolds(effect, env)) break
          const sub = String(effect.substance)
          const max = Number(effect.max_mg_per_day)
          if (!Number.isFinite(max)) break
          if (effect.salt && env.ctx.metoprololSalt && effect.salt !== env.ctx.metoprololSalt) break
          if (sub in SUBSTANCE_CLASSES) {
            const key = sub as DrugId
            const existing = result.doseCaps[key]
            result.doseCaps[key] = existing === undefined ? max : Math.min(existing, max)
          } else {
            // A cap on a drug the twin does not model (simvastatin). Kept separately so
            // `doseCaps` stays exactly what the frozen contract says it is.
            const existing = result.externalDoseCaps[sub]
            result.externalDoseCaps[sub] = existing === undefined ? max : Math.min(existing, max)
          }
          break
        }

        // ---- 8. dose_start --------------------------------------------------
        case 'dose_start': {
          if (!inScope || !guardHolds(effect, env)) break
          const sub = String(effect.substance)
          const mg = Number(effect.start_mg_per_day)
          if (!Number.isFinite(mg)) break
          // Most cautious start wins.
          result.doseStarts[sub] =
            result.doseStarts[sub] === undefined ? mg : Math.min(result.doseStarts[sub], mg)
          break
        }

        // ---- 9. titration_interval_days -------------------------------------
        case 'titration_interval_days': {
          if (!inScope || !guardHolds(effect, env)) break
          const sub = String(effect.substance)
          const days = Number(effect.days)
          if (!Number.isFinite(days)) break
          // Slowest titration wins.
          result.titrationIntervalDays[sub] = Math.max(result.titrationIntervalDays[sub] ?? 0, days)
          break
        }

        // ---- 10. phenoconvert ----------------------------------------------
        case 'phenoconvert': {
          const target = String(effect.target)
          const to = String(effect.to)
          result.phenoconversions[target] = to
          if (target === 'phenotype.cyp2d6') {
            env.phenotypes.cyp2d6 = to as PhenotypeCode
            if (to === 'PM') result.phenoconversions['cyp2d6_activity_score'] = '0'
          }
          if (target === 'phenotype.cyp2c9') env.phenotypes.cyp2c9 = to as PhenotypeCode
          break
        }

        // ---- 11. score_delta ------------------------------------------------
        case 'score_delta': {
          if (!saltHolds(effect, env)) break
          const objective = String(effect.objective) as keyof ReturnType<typeof emptyDeltas>
          const delta = Number(effect.delta)
          if (!Number.isFinite(delta) || !(objective in result.scoreDeltas)) break
          if (Array.isArray(effect.applies_to_product)) {
            const wanted = (effect.applies_to_product as string[]).map(String)
            const have = (env.ctx.productIds ?? []).map(String)
            if (!wanted.some((w) => have.some((h) => h.includes(w)))) break
          }
          if (typeof effect.applies_to_regimen === 'string') {
            if (effect.applies_to_regimen === 'two_class_combination' && regimen.doses.length < 2) break
          }
          if (Array.isArray(effect.applies_to)) {
            for (const sub of effect.applies_to as string[]) {
              if (!env.substanceIds.has(sub)) continue
              const bag = (result.scoreDeltasBySubstance[sub] ??= emptyDeltas())
              bag[objective] += delta
              result.scoreDeltas[objective] += delta
            }
          } else {
            result.scoreDeltas[objective] += delta
          }
          break
        }

        // ---- 12. monitor ----------------------------------------------------
        case 'monitor': {
          const labs = Array.isArray(effect.labs) ? (effect.labs as string[]) : []
          const atDays = Array.isArray(effect.at_days) ? (effect.at_days as number[]) : []
          for (const raw of labs) {
            // Monitor targets are bare lab names (`serum_urate_mg_dl`); everything else
            // in the file is a namespaced state path. Normalise to state-variable ids
            // so the UI has one vocabulary.
            const lab = STATE_PATH_BINDING[`labs.${raw}`] ?? STATE_PATH_BINDING[`vitals.${raw}`] ?? raw
            const entry = monitorIndex.get(lab) ?? { lab, atDays: [], ruleIds: [] }
            entry.atDays = [...new Set([...entry.atDays, ...atDays])].sort((a, b) => a - b)
            if (!entry.ruleIds.includes(hit.ruleId)) entry.ruleIds.push(hit.ruleId)
            monitorIndex.set(lab, entry)
          }
          break
        }

        // ---- 13. annotate_organ ---------------------------------------------
        case 'annotate_organ': {
          result.organAnnotations.push({
            organ: String(effect.organ),
            channel: String(effect.channel),
            direction: String(effect.direction),
            ruleId: hit.ruleId,
          })
          break
        }

        // ---- unknown --------------------------------------------------------
        default: {
          // A silently-ignored effect op is the worst failure mode this engine has:
          // the data file grows a new capability, every test still passes, and the
          // feature is simply inert. `risk_modify` shipped and sat dead for exactly
          // this reason. Record it loudly instead. `HANDLED_EFFECT_OPS` below is
          // asserted against `rules.json` `effect_ops` in the test suite, so the next
          // addition fails at CI rather than no-opping in production.
          const op = String((effect as RuleEffect).op)
          const seen = (result.unhandledEffectOps ??= [])
          if (!seen.some((u) => u.op === op && u.ruleId === hit.ruleId)) seen.push({ op, ruleId: hit.ruleId })
          break
        }
      }
    }
  }

  // --- second pass: subgroup modifiers on established risks ------------------
  for (const { effect, hit } of pendingRiskModifiers) {
    const target = String(effect.target)
    const base = result.risks[target]
    if (typeof base !== 'number') {
      // Nothing established this channel, so there is nothing to scale. Silently
      // multiplying a zero would hide the fact that the subgroup data never landed.
      (result.unhandledEffectOps ??= []).push({ op: 'risk_modify (no base risk to scale)', ruleId: hit.ruleId })
      continue
    }
    const factor = subgroupMultiplier(effect, env)
    if (factor === null) continue
    result.risks[target] = clamp01(base * factor)
    if (typeof effect.caveat === 'string') {
      ;(result.caveats ??= []).push({
        ruleId: hit.ruleId,
        channel: target,
        text: effect.caveat,
        basis: typeof effect.recommended_multiplier === 'object' && effect.recommended_multiplier !== null
          ? String((effect.recommended_multiplier as Record<string, unknown>).basis ?? '')
          : undefined,
      })
    }
  }

  result.monitoring = [...monitorIndex.values()].sort((a, b) => a.lab.localeCompare(b.lab))
  result.tier = result.blocked
    ? 'DISQUALIFIED'
    : result.overrideRequired.length > 0
      ? 'OVERRIDE_REQUIRED'
      : 'ALLOWED'

  return result
}

/**
 * The substances a rule's recommendation is scoped to, read from the `applies_to` lists
 * on its `score_delta` effects. Empty means the rule applies to whatever is prescribed.
 */
function ruleSubstanceScope(hit: RuleHit): string[] {
  const out = new Set<string>()
  for (const e of hit.effects) {
    if (Array.isArray(e.applies_to)) for (const s of e.applies_to as string[]) out.add(String(s))
  }
  return [...out]
}

/**
 * Interpolate a `dose_response` table at the prescribed daily dose.
 *
 * The amlodipine oedema table is the only dose-resolved adverse-effect data in the
 * whole dataset — 1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg against 0.6 % placebo, straight
 * off the NORVASC label. The dose ratios of the incidences are 1.67 then 3.6, so the
 * curve STEEPENS sharply over the last doubling. Fitting one exponent through the
 * endpoints would smooth away exactly the feature that makes 10 mg a bad trade.
 * Interpolate log-linearly between the published points and hold the endpoints flat
 * outside the studied range rather than extrapolating a labelled incidence.
 */
export function interpolateDoseResponse(
  table: { mg: number; pct: number }[],
  mgPerDay: number,
): number | null {
  const pts = table
    .filter((p) => typeof p?.mg === 'number' && typeof p?.pct === 'number')
    .sort((a, b) => a.mg - b.mg)
  if (pts.length === 0) return null
  if (mgPerDay <= pts[0].mg) return pts[0].pct
  if (mgPerDay >= pts[pts.length - 1].mg) return pts[pts.length - 1].pct
  let i = 0
  while (i < pts.length - 2 && mgPerDay > pts[i + 1].mg) i++
  const a = pts[i]
  const b = pts[i + 1]
  const f = (Math.log(mgPerDay) - Math.log(a.mg)) / (Math.log(b.mg) - Math.log(a.mg))
  return Math.exp(Math.log(a.pct) + f * (Math.log(b.pct) - Math.log(a.pct)))
}

/**
 * Resolve the subgroup factor a `risk_modify` effect applies to an established risk.
 *
 * USE `recommended_multiplier`, NEVER `alternative_multiplier`. The two exist because
 * the amlodipine label's sex-stratified oedema table shows the PLACEBO arm carrying the
 * same skew — 1.4% male against 5.1% female, versus 5.6% and 14.6% on drug. So a large
 * part of the raw gap is background oedema in women rather than anything amlodipine did.
 * `recommended_multiplier` (male 0.86, female 1.94) is placebo-subtracted attributable
 * risk; `alternative_multiplier` (0.68 / 1.77) is raw incidence and is retained only so
 * the derivation stays auditable. Using the raw set would overstate the drug's sex
 * difference by attributing the background rate to the drug.
 *
 * Note on provenance: the four percentages, the four Ns and the placebo comparators are
 * quoted verbatim from the label and are CITED. The multipliers themselves are DERIVED
 * arithmetic over those figures, and `riskProvenanceStatus` reports them as such rather
 * than letting derived numbers inherit the label's authority.
 */
function subgroupMultiplier(effect: RuleEffect, env: EvalEnv): number | null {
  const table = effect.recommended_multiplier
  if (typeof table !== 'object' || table === null) return null

  const stratifyBy = typeof effect.stratify_by === 'string' ? effect.stratify_by : null
  if (!stratifyBy) return null

  // `demographic.sex` -> the demographics map buildEnv already assembled.
  const [namespace, key] = stratifyBy.split('.')
  let stratum: string | null = null
  if (namespace === 'demographic' && key) {
    const v = env.demographics[key]
    if (v !== undefined) stratum = String(v)
  } else if (namespace === 'condition' && key) {
    stratum = env.conditions.has(key) ? 'true' : 'false'
  }
  if (stratum === null) return null

  const factor = (table as Record<string, unknown>)[stratum]
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return null
  return factor
}

/**
 * Whether a risk channel's value rests on a cited figure or on arithmetic derived from
 * one. A subgroup-modified risk is DERIVED even when its inputs are cited, because the
 * combination step is ours.
 */
export function riskProvenanceStatus(
  channel: string,
  result: Pick<EvaluationResult, 'caveats'>,
): 'cited' | 'derived' {
  return (result.caveats ?? []).some((c) => c.channel === channel) ? 'derived' : 'cited'
}

/**
 * Turn a `risk_set` effect into an EXCESS probability over the run horizon, or null
 * when the rule expresses risk in a unit the report cannot convert (a bare relative
 * risk or odds ratio needs a baseline the rule does not supply).
 *
 * "Excess" is the quantity research/05-OUTPUT-REPORT-SPEC.md section 4.2b asks for:
 * `excess_p = max(0, p_event - p_baseline)`. Charging an arm for the placebo rate would
 * penalise every drug for events that would have happened anyway.
 */
function riskProbability(effect: RuleEffect, mgPerDay = 0): number | null {
  const baseline = typeof effect.baseline_pct === 'number' ? effect.baseline_pct : 0

  if (Array.isArray(effect.dose_response)) {
    const pct = interpolateDoseResponse(effect.dose_response as { mg: number; pct: number }[], mgPerDay)
    if (pct === null) return null
    return clamp01(Math.max(0, pct - baseline) / 100)
  }
  if (typeof effect.absolute_pct === 'number') {
    // `basis: placebo_subtracted` means the value is already an excess.
    const already = effect.basis === 'placebo_subtracted'
    return clamp01(Math.max(0, already ? effect.absolute_pct : effect.absolute_pct - baseline) / 100)
  }
  if (typeof effect.events_per_100_py === 'number') {
    const excess =
      effect.events_per_100_py - (typeof effect.comparator_events_per_100_py === 'number' ? effect.comparator_events_per_100_py : 0)
    // Events per 100 person-years -> annual probability, Poisson.
    return clamp01(1 - Math.exp(-Math.max(0, excess) / 100))
  }
  if (typeof effect.relative_risk === 'number' && baseline > 0) {
    return clamp01(Math.max(0, (baseline / 100) * effect.relative_risk - baseline / 100))
  }
  // A bare relative_risk, odds_ratio or hazard_ratio has no baseline in the rule
  // (hydrochlorothiazide's squamous-cell OR 3.98 is the example, and it is conditioned
  // on 50,000 mg cumulative exposure this run does not reach). Refuse rather than
  // invent a denominator; the hit is still shown with its own wording and citation.
  return null
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Convenience for the UI: bind the rules file once. */
export function makeRuleEngine(rules: RulesFile) {
  return (patient: PatientState, regimen: Regimen, ctx: RuleContext = {}) =>
    evaluateRules(patient, regimen, rules, ctx)
}
