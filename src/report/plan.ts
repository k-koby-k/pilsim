/**
 * THE TREATMENT PLAN.
 *
 * Hackathon problem 12 opens with "individuallashtirilgan davolash rejimi yo'q" — there
 * is no individualised TREATMENT REGIMEN. The thing the document asks for is a plan; the
 * digital twin is the means of producing one. A ranked list of scored arms is a
 * comparison, not a regimen: it tells a doctor which option scored best and nothing about
 * what to write on the prescription, when to come back, or what to check when they do.
 * This module closes that gap.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS FILE OBEYS
 * ---------------------------------------------------------------------------
 * NO NEW PHARMACOLOGY. Every clinical statement in a `TreatmentPlan` carries a
 * `PlanBasis` naming where it came from:
 *
 *   - `rule`      a fired rule from data/rules.json, with its own citation;
 *   - `dataset`   a value in data/substances.json or data/products.json, with its
 *                 `Provenance` attached;
 *   - `engine`    an arithmetic result of src/engine/**, with the computation named;
 *   - `guideline` the blood-pressure target, which `report/score.ts` already owns;
 *   - `unavailable` the data could not support this statement — said out loud.
 *
 * This module composes those facts into a clinically useful shape. It computes nothing
 * pharmacological of its own and it must never grow the ability to. If a section cannot
 * be supported for a patient, it emits a `PlanGap` instead of prose.
 *
 * ---------------------------------------------------------------------------
 * FOR THE RENDERER
 * ---------------------------------------------------------------------------
 * `TreatmentPlan` is designed to be rendered without further interpretation. Every
 * section carries a `heading` and a `statements: PlanStatement[]` list that can be
 * printed as bullets in order, plus structured fields where a component wants a table or
 * a chip instead of a sentence. `plan.gaps` is the honest-empty list: render it, do not
 * hide it. `plan.disclaimer` carries the normative wording from `./disclaimer.ts` — it is
 * reused, never retyped, and §8.4's placement rules still apply (full text at the top,
 * above everything else; DISQUALIFIED safety reasons above it).
 *
 * `planToPlainText(plan)` renders the whole thing as plain text for copy, export or
 * reading aloud.
 *
 * Owned by Agent RUL.
 */

import type {
  DrugId,
  PatientState,
  Provenance,
  RankedOption,
  Regimen,
  RuleEffect,
  RuleHit,
  RunSummary,
  SeverityId,
} from '../types'
import type { Measured } from '../types'
import type { PilSimData, SubstanceRecord } from '../data/load'
import { evaluateRules, type EvaluationResult } from '../rules/evaluate'
import {
  SCORE_WEIGHTS,
  bpTarget,
  labReferenceRanges,
  modellingCaveatChip,
  rankOptions,
  type BpTarget,
  type ScoreCandidate,
} from './score'
import {
  DISCLAIMER_FULL,
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_SHORT,
  DISCLAIMER_TITLE,
} from './disclaimer'
import { buildTiming, type PlanTiming } from './timing'
import { combinationRule, regimenAdverseBurden } from '../engine/combination'
import { project5Year, type Prognosis } from '../engine/prognosis'
import { SUBSTANCE_PK } from '../engine/substanceParams'
import { STANDARD_DOSE_MG } from '../engine/constants'

// ---------------------------------------------------------------------------
// Provenance of every sentence in the plan
// ---------------------------------------------------------------------------

export type PlanSectionId =
  | 'start'
  | 'titration'
  | 'target'
  | 'timing'
  | 'monitoring'
  | 'avoid'
  | 'escalation'
  | 'tolerability'
  | 'outlook'

/** Where a statement comes from. A statement with no basis may not be written. */
export type PlanBasis =
  | { kind: 'rule'; ruleId: string; severity: SeverityId; citation?: Provenance }
  | { kind: 'dataset'; field: string; provenance?: Provenance }
  | { kind: 'engine'; computation: string }
  | { kind: 'guideline'; source: string }
  /**
   * A published trial, quoted directly. Added for dose timing (`./timing.ts`), where the
   * evidence lives in the literature and NOT in any of the four sources above: rules.json
   * carries no timing rule, substances.json carries no timing field, the engine models no
   * circadian rhythm, and no guideline recommendation was verifiable. Filing that evidence
   * under any of the other kinds would hide exactly what a reader needs in order to weigh
   * it — that it is contested, external, and not something this product computed.
   */
  | { kind: 'literature'; citation: Provenance }
  | { kind: 'unavailable'; reason: string }

/** One printable clinical sentence and its provenance. */
export interface PlanStatement {
  text: string
  basis: PlanBasis
}

/**
 * A section a doctor would expect that this dataset could not fill. First-class, not a
 * footnote: "we do not know" is the answer the product is proudest of.
 */
export interface PlanGap {
  section: PlanSectionId
  /** What is missing, in the doctor's vocabulary. */
  what: string
  /** Why it is missing, in the dataset's vocabulary. */
  why: string
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface PlanDrugStart {
  substanceId: DrugId
  name: string
  /** What to write on the prescription today, mg per day. */
  startMgPerDay: number
  /** Administrations per day at that dose. */
  perDay: number
  /** Where titration is heading — the dose of the evaluated arm, mg per day. */
  targetMgPerDay: number
  /** The label's usual adult starting dose, mg per day. null when not in the dataset. */
  usualStartMgPerDay: number | null
  /** True when this patient starts somewhere other than the usual adult dose. */
  adjusted: boolean
  /** Maximum daily dose for this patient, from a rule cap or the label. */
  capMgPerDay: number | null
  /** Why this patient starts here rather than at the usual dose. */
  reasons: PlanStatement[]
  statements: PlanStatement[]
}

export interface PlanStart {
  heading: string
  drugs: PlanDrugStart[]
  statements: PlanStatement[]
}

export type TitrationVerdict = 'titrate' | 'hold' | 'at_ceiling' | 'at_target' | 'unknown'

/** Which harm estimate a titration verdict was computed on. */
export type HarmSource = 'cited_rule_incidence' | 'law2003_class_prevalence'

/**
 * The RANKER and the TITRATION step, put side by side on the same dose step.
 *
 * They answer different questions — "which arm scores best among the options considered"
 * against "is escalating from where this patient is now worth it" — and on amlodipine
 * they reach opposite conclusions. That is real clinical tension, not a defect, and the
 * product states it rather than letting a doctor discover it between two panels.
 *
 * See `reconcileDoseStep` for what is and is not shared between the two computations.
 */
export interface PlanDoseReconciliation {
  /** Composite scores of the two doses, as `report/score.ts` itself scores them. */
  compositeNow: number
  compositeNext: number
  compositeDelta: number
  rankerPrefersNextDose: boolean
  /** The gap is inside the ranker's own `tieThreshold`, so it is not a separation. */
  rankerCallsItTied: boolean
  titrationVerdict: TitrationVerdict
  /** False when the ranker climbs to a dose the titration would hold below. */
  agree: boolean
  /**
   * Percentage points of adverse effect the composite's weights trade for one mmHg,
   * derived from the ranker's own arithmetic on this step. Null when a score term
   * clamped, which would make the decomposition inexact.
   */
  impliedHarmPointsPerMmHg: number | null
  /** What the titration assumes instead — parity, and ESTIMATED. */
  titrationHarmPointsPerMmHg: number
  statements: PlanStatement[]
}

export interface PlanTitrationStep {
  substanceId: DrugId
  name: string
  fromMgPerDay: number
  /** The next dose on the licensed ladder, or null at the ceiling. */
  nextMgPerDay: number | null
  /** Days to wait before that step. */
  intervalDays: number | null
  intervalBasis: PlanBasis
  /** Extra systolic fall the step buys for THIS patient, mmHg. Engine-computed. */
  extraSbpDropMmHg: number | null
  /**
   * Extra drug-attributable adverse-effect prevalence over the step, percentage points.
   * This is the number the verdict rests on AND the number the ranker charges for —
   * see `harmSource`, and `reconciliation` for the comparison.
   */
  extraAdversePoints: number | null
  /** Where `extraAdversePoints` came from. */
  harmSource: HarmSource | null
  /** Law 2003 pooled class symptom prevalence, treated minus placebo, percentage points. */
  harmLaw2003Points: number | null
  /**
   * The rules' own dose-resolved incidence over the same step, percentage points. Null
   * when `rules.json` quantifies no adverse-effect channel for this substance at all —
   * which means the ranker's risk term is dose-blind for it.
   */
  harmCitedPoints: number | null
  /** The two harm estimates describe the same step within tolerance. */
  harmModelsAgree: boolean | null
  verdict: TitrationVerdict
  reconciliation: PlanDoseReconciliation | null
  statements: PlanStatement[]
}

export interface PlanTitration {
  heading: string
  steps: PlanTitrationStep[]
  statements: PlanStatement[]
}

export interface PlanTarget {
  heading: string
  target: BpTarget
  baselineSbp: number
  baselineDbp: number
  /** Projected steady-state pressure on the plan's target dose. */
  projectedSbp: number
  projectedDbp: number | null
  reachesTarget: boolean
  shortfallSbpMmHg: number
  /** ~5 elimination half-lives of the slowest drug in the arm, days. */
  pkSteadyStateDays: number | null
  /** When the antihypertensive effect is established, weeks. A different quantity. */
  fullEffectWeeks: number | null
  fullEffectBasis: PlanBasis
  statements: PlanStatement[]
}

export interface PlanMonitorItem {
  /** State-variable id, e.g. `serum_k_mmol_L`. */
  lab: string
  label: string
  /** Days after starting, ascending. */
  atDays: number[]
  ruleIds: string[]
  /** The reference range that defines an actionable result. */
  actionRange: [number, number] | null
  /** What a result outside that range would mean for the plan. */
  actionStatements: PlanStatement[]
}

export interface PlanMonitoring {
  heading: string
  items: PlanMonitorItem[]
  statements: PlanStatement[]
}

export interface PlanAvoidItem {
  ruleId: string
  title: string
  severity: SeverityId
  severityRank: number
  /** True only for rank-7 absolute contraindications. */
  absolute: boolean
  /** Plain clinical language, taken verbatim from the rule. */
  text: string
  mechanism: string
  citation?: Provenance
  /** Evaluated arms this rule ruled out or flagged. */
  affectsRegimens: string[]
}

export interface PlanAvoid {
  heading: string
  items: PlanAvoidItem[]
  statements: PlanStatement[]
}

export interface PlanEscalationOption {
  /** `add_class` | `increase_dose` | `switch` */
  kind: 'add_class' | 'increase_dose' | 'switch'
  regimen: Regimen
  label: string
  /** Systolic fall for this patient, mmHg — engine or ranker. */
  deltaSbp: number | null
  /** Composite score where the arm was ranked. */
  score: number | null
  /**
   * Feasibility tier of the evaluated arm. An OVERRIDE_REQUIRED option is offered — a
   * guideline says avoid, not forbid — but the renderer must show the tier beside it.
   * `increase_dose` options are constructed here rather than ranked and carry null.
   */
  tier: 'ALLOWED' | 'OVERRIDE_REQUIRED' | 'DISQUALIFIED' | null
  statements: PlanStatement[]
}

export interface PlanEscalation {
  heading: string
  /** Doubling the current arm's principal drug. Always computed, for the contrast. */
  doubling: PlanEscalationOption | null
  /** Adding a second class, drawn from the ranked alternatives. */
  addOn: PlanEscalationOption | null
  /** The rest of the evaluated menu, best first. */
  alternatives: PlanEscalationOption[]
  statements: PlanStatement[]
}

export interface PlanTolerabilitySwap {
  /** Adverse-effect channel, e.g. `cough`. */
  channel: string
  label: string
  /** The drug in the arm the channel is attributed to. */
  substanceId: DrugId
  /** Probability the rules attribute to it over the horizon, 0..1. null when unquantified. */
  probability: number | null
  /** The best evaluated arm that does not contain that drug. */
  switchTo: PlanEscalationOption | null
  statements: PlanStatement[]
}

export interface PlanTolerability {
  heading: string
  swaps: PlanTolerabilitySwap[]
  statements: PlanStatement[]
}

export interface PlanMarkerProjection {
  /** State-variable id. */
  id: string
  label: string
  baseline: number
  projected: number
  delta: number
  unit: string
  referenceRange: [number, number] | null
  outsideRange: boolean
}

/**
 * The five-year output, worded as research/00-DECISIONS.md §8 requires:
 * "projection of blood pressure control and organ-relevant markers".
 *
 * The engine produces blood pressure and laboratory values. It does not model strokes,
 * infarctions or deaths, and this section never predicts them. `classLevelRelativeRisk`
 * carries Ettehad 2016's published trial-population relative risks purely as literature
 * context; `notAPrediction` is required reading beside it and the renderer must not show
 * one without the other.
 */
export interface PlanOutlook {
  heading: string
  /** ΔSBP sustained over five years under the stated adherence assumption. */
  sustainedDeltaSbp: number
  adherenceAssumed: number
  projectedSbp: number
  projectedDbp: number | null
  atTarget: boolean
  markers: PlanMarkerProjection[]
  classLevelRelativeRisk: {
    perTenMmHg: Prognosis['relativeRisk']
    notAPrediction: string
    extrapolationWarning: string
  }
  statements: PlanStatement[]
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface TreatmentPlan {
  kind: 'treatment_plan'
  /** Who it is for. Rendered as the plan's subject line. */
  subject: {
    label: string
    ageYears: number
    sex: string
    baselineSbp: number
    baselineDbp: number
    conditions: string[]
  }
  /** The arm the plan is written for. */
  regimen: Regimen
  regimenLabel: string
  /**
   * Set when no arm could be planned — every evaluated option was disqualified. The
   * sections are still populated where they can be (`avoid` above all), and this field
   * is the thing the renderer leads with.
   */
  noPlan?: { reason: string; blockedBy: PlanAvoidItem[] }
  /**
   * Set when the arm this plan is written for carries a rank-6 avoidance rule — no
   * allowed arm was available. The plan is still written, because refusing to write one
   * for a patient who needs treatment is not a safer answer, but this must be the first
   * thing the reader sees after the disclaimer.
   */
  overrideRequired?: { reason: string; rules: PlanAvoidItem[] }
  start: PlanStart
  titration: PlanTitration
  target: PlanTarget
  /**
   * When in the day to take each drug — and, just as importantly, what that recommendation
   * does and does not claim. See `./timing.ts`: outcome, tolerability and pharmacokinetic
   * reasons are tagged separately and never merged, and no `DoseTiming` may claim a
   * cardiovascular benefit from timing (the type forbids it).
   */
  timing: PlanTiming
  monitoring: PlanMonitoring
  avoid: PlanAvoid
  escalation: PlanEscalation
  tolerability: PlanTolerability
  outlook: PlanOutlook
  gaps: PlanGap[]
  /** Verbatim from ./disclaimer.ts. Never rewritten here. */
  disclaimer: {
    title: string
    paragraphs: readonly string[]
    full: string
    short: string
  }
}

export interface TreatmentPlanInput {
  patient: PatientState
  /** Ranked options, best first, as `rankOptions()` returns them. */
  ranked: RankedOption[]
  /** Which arm to plan. Default: the first option that is not disqualified. */
  chosen?: RankedOption
  /** Fired rules for the chosen arm. Default: `chosen.hits`. */
  hits?: RuleHit[]
  /**
   * The rules evaluation for the chosen arm. Supplies the GUARDED dose starts, titration
   * intervals, dose caps and monitoring schedule. Without it those are read from the
   * fired rules' ungated effects only, and the plan says so — a `when`-guarded renal dose
   * reduction must not be applied to a patient with normal kidneys.
   */
  modifiers?: Partial<EvaluationResult>
  /** Engine run summary for the chosen arm. Supplies the projected laboratory values. */
  summary?: RunSummary
  data?: PilSimData | null
  /** Assumed long-run adherence, 0..1. Reported in the outlook. Default 1. */
  adherence?: number
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function r1(x: number): number {
  return Math.round(x * 10) / 10
}

function mgStr(mg: number): string {
  return `${r1(mg)} mg`
}

function perDayStr(perDay: number): string {
  return perDay <= 1 ? 'once daily' : perDay === 2 ? 'twice daily' : `${perDay}× daily`
}

/** Display names for the handful of state variables whose ids do not read as English. */
const LAB_LABEL: Record<string, string> = {
  egfr_ckdepi2021: 'eGFR (CKD-EPI 2021)',
  scr_mg_dL: 'Serum creatinine',
  uacr_mg_g: 'Urine albumin-to-creatinine ratio',
  serum_k_mmol_L: 'Serum potassium',
  serum_na_mmol_L: 'Serum sodium',
  serum_urate_mg_dL: 'Serum urate',
  fasting_glucose_mg_dL: 'Fasting glucose',
  hba1c_pct: 'HbA1c',
  serum_lithium_mmol_L: 'Serum lithium',
  fev1_pct_predicted: 'FEV1 (% predicted)',
}

function humanise(id: string): string {
  if (LAB_LABEL[id]) return LAB_LABEL[id]
  return id
    .replace(/_(mmol_L|mg_dL|mg_dl|pct|pct_predicted|mg_g|ml_min_1_73|bpm|mmHg)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (s) => s.toUpperCase())
}

function r2(x: number): number {
  return Math.round(x * 100) / 100
}

function firstSentence(s: string | undefined): string {
  if (!s) return ''
  const t = s.trim()
  const stop = t.search(/\.\s/)
  return stop > 0 ? t.slice(0, stop + 1) : t
}

function drugName(id: DrugId, data?: PilSimData | null): string {
  const rec = substanceRecord(id, data)
  if (rec?.name) return rec.name
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function substanceRecord(id: string, data?: PilSimData | null): SubstanceRecord | null {
  return data?.substances.substances.find((s) => s.id === id) ?? null
}

/** Read a `Measured` out of one of the loosely-typed data sections. */
function measuredAt(rec: SubstanceRecord | null, section: string, field: string): Measured | null {
  const bag = rec?.[section] as Record<string, unknown> | undefined
  const m = bag?.[field] as Measured | undefined
  if (!m || typeof m !== 'object') return null
  if (typeof m.value !== 'number') return null
  return m
}

/** `pd.clinical_effect.<field>`, which is one level deeper than `dosing.<field>`. */
function clinicalEffect(rec: SubstanceRecord | null, field: string): Measured | null {
  const pd = rec?.pd as Record<string, unknown> | undefined
  const ce = pd?.clinical_effect as Record<string, unknown> | undefined
  const m = ce?.[field] as Measured | undefined
  if (!m || typeof m !== 'object' || typeof m.value !== 'number') return null
  return m
}

function mgPerDayOf(regimen: Regimen, substanceId: DrugId): number {
  return regimen.doses
    .filter((d) => d.substanceId === substanceId)
    .reduce((s, d) => s + d.mg * (d.perDay || 1), 0)
}

function totalMgPerDay(regimen: Regimen): number {
  return regimen.doses.reduce((s, d) => s + d.mg * (d.perDay || 1), 0)
}

function substancesOf(regimen: Regimen): DrugId[] {
  return [...new Set(regimen.doses.filter((d) => d.mg > 0).map((d) => d.substanceId))]
}

function subjectOf(patient: PatientState) {
  return {
    sbpBaseline: patient.vars.sbp_mmHg ?? patient.inputs.sbp_mmHg,
    dbpBaseline: patient.vars.dbp_mmHg ?? patient.inputs.dbp_mmHg,
  }
}

/** `ScoredOption` carries a tier; a bare `RankedOption` does not, so infer one. */
export function optionTier(o: RankedOption): 'ALLOWED' | 'OVERRIDE_REQUIRED' | 'DISQUALIFIED' {
  const t = (o as { tier?: string }).tier
  if (t === 'ALLOWED' || t === 'OVERRIDE_REQUIRED' || t === 'DISQUALIFIED') return t
  if (o.hits.some((h) => h.blocks)) return 'DISQUALIFIED'
  if (o.hits.some((h) => h.severityRank === 6)) return 'OVERRIDE_REQUIRED'
  return 'ALLOWED'
}

/** Every effect of the given op on the fired rules, with the rule that carried it. */
function effectsOfOp(hits: RuleHit[], op: RuleEffect['op']): { hit: RuleHit; effect: RuleEffect }[] {
  const out: { hit: RuleHit; effect: RuleEffect }[] = []
  for (const hit of hits) for (const effect of hit.effects) if (effect.op === op) out.push({ hit, effect })
  return out
}

function ruleBasis(hit: RuleHit, effect?: RuleEffect): PlanBasis {
  const inline = effect?.provenance
  const citation =
    inline && typeof inline === 'object' ? (inline as Provenance) : hit.citation
  return { kind: 'rule', ruleId: hit.ruleId, severity: hit.severity, citation }
}

function citationLine(p?: Provenance): string {
  if (!p) return ''
  const bits = [p.source, p.url].filter(Boolean)
  if (bits.length === 0) return p.note ? `[${p.status}] ${p.note}` : `[${p.status}]`
  return bits.join(' — ')
}

// ---------------------------------------------------------------------------
// The licensed dose ladder
// ---------------------------------------------------------------------------

/**
 * Marketed tablet strengths for a substance, from `products.json available_strengths`
 * (CITED, tier 1). This is what makes "the next dose" a real dose rather than arithmetic.
 * Falls back to doubling when the dataset is not to hand.
 */
export function doseLadderMgPerDay(
  substanceId: DrugId,
  perDay: number,
  data?: PilSimData | null,
): number[] {
  const strengths = new Set<number>()
  for (const p of data?.products.products ?? []) {
    const actives = p.composition.filter((c) => /active/i.test(c.role))
    if (actives.length !== 1 || actives[0].substance_id !== substanceId) continue
    const raw = (p.available_strengths as Measured | undefined)?.value as unknown
    if (Array.isArray(raw)) for (const v of raw) if (typeof v === 'number' && v > 0) strengths.add(v)
  }
  const per = Math.max(1, perDay)
  return [...strengths].map((mg) => mg * per).sort((a, b) => a - b)
}

/** The next rung strictly above `mg`, capped. null at the ceiling. */
function nextRung(ladder: number[], mg: number, cap: number | null): number | null {
  const candidates = ladder.filter((v) => v > mg + 1e-9)
  const next = candidates.length > 0 ? candidates[0] : mg * 2
  if (cap !== null && next > cap + 1e-9) return null
  return next
}

/** Replace one drug's daily dose, keeping the administration frequency. */
function withDose(regimen: Regimen, substanceId: DrugId, mgPerDay: number): Regimen {
  const perDay = Math.max(1, regimen.doses.find((d) => d.substanceId === substanceId)?.perDay ?? 1)
  return {
    id: `${regimen.id}::${substanceId}@${mgPerDay}`,
    label: `${regimen.label} (${substanceId} ${r1(mgPerDay)} mg/day)`,
    doses: regimen.doses.map((d) =>
      d.substanceId === substanceId ? { ...d, mg: mgPerDay / perDay, perDay } : d,
    ),
  }
}

// ---------------------------------------------------------------------------
// 1. What to start
// ---------------------------------------------------------------------------

function buildStart(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  hits: RuleHit[],
  gaps: PlanGap[],
): PlanStart {
  const { data, modifiers } = input
  const drugs: PlanDrugStart[] = []
  const statements: PlanStatement[] = []

  const guardedStarts = modifiers?.doseStarts ?? null
  const guardedCaps = modifiers?.doseCaps ?? null
  const startEffects = effectsOfOp(hits, 'dose_start')
  const capEffects = effectsOfOp(hits, 'dose_cap')

  for (const substanceId of substancesOf(chosen.regimen)) {
    const rec = substanceRecord(substanceId, data)
    const name = drugName(substanceId, data)
    const prescribed = mgPerDayOf(chosen.regimen, substanceId)
    const perDay = Math.max(
      1,
      chosen.regimen.doses.find((d) => d.substanceId === substanceId)?.perDay ?? 1,
    )

    const usual = measuredAt(rec, 'dosing', 'typical_adult_start_mg')
    const usualStart = usual?.value ?? null

    // The rules' start dose. The guarded evaluation is authoritative when supplied: it
    // has already resolved every `when` gate, so the only job left here is to find the
    // effect that produced the applied dose and narrate it.
    const appliedStart = guardedStarts ? guardedStarts[substanceId] : undefined
    let ruleStart: number | null = appliedStart ?? null
    const startReasons: PlanStatement[] = []
    for (const { hit, effect } of startEffects) {
      if (effect.substance !== substanceId) continue
      const mg = Number(effect.start_mg_per_day)
      if (!Number.isFinite(mg)) continue

      if (guardedStarts) {
        // Nothing applied, or a different guard branch won — this effect is not the one.
        if (appliedStart === undefined || Math.abs(mg - appliedStart) > 1e-9) continue
      } else if (typeof effect.when === 'string') {
        // Without the evaluation a `when`-gated effect cannot be known to apply, and
        // applying a renal dose reduction to normal kidneys is worse than saying so.
        gaps.push({
          section: 'start',
          what: `whether ${name}'s reduced starting dose of ${mgStr(mg)}/day applies to this patient`,
          why:
            `Rule ${hit.ruleId} gates that dose on "${String(effect.when)}", and the plan was built ` +
            `without the rules evaluation that resolves the guard. Pass \`modifiers\` to resolve it.`,
        })
        continue
      } else {
        ruleStart = ruleStart === null ? mg : Math.min(ruleStart, mg)
      }

      startReasons.push({
        text:
          `${name} starts at ${mgStr(mg)}/day rather than the usual adult start` +
          (usualStart !== null ? ` of ${mgStr(usualStart)}/day` : '') +
          ` because of ${hit.title}. ${firstSentence(hit.warningText) || hit.mechanism}`,
        basis: ruleBasis(hit, effect),
      })
    }

    // Dose ceiling: the tightest of the rule caps and the label maximum.
    let cap: number | null = guardedCaps?.[substanceId] ?? null
    let capBasis: PlanBasis | null = null
    if (cap !== null) {
      const capHit = capEffects.find((e) => e.effect.substance === substanceId)
      capBasis = capHit ? ruleBasis(capHit.hit, capHit.effect) : null
    } else {
      for (const { hit, effect } of capEffects) {
        if (effect.substance !== substanceId) continue
        if (typeof effect.when === 'string') continue
        const max = Number(effect.max_mg_per_day)
        if (!Number.isFinite(max)) continue
        if (cap === null || max < cap) {
          cap = max
          capBasis = ruleBasis(hit, effect)
        }
      }
    }
    const labelMax = measuredAt(rec, 'dosing', 'max_daily_mg')
    if (labelMax && (cap === null || labelMax.value! < cap)) {
      cap = labelMax.value!
      capBasis = { kind: 'dataset', field: `${substanceId}.dosing.max_daily_mg`, provenance: labelMax.provenance }
    }

    // Start at the most cautious of: the rule's start, the label's usual start, and the
    // dose of the arm that was actually evaluated. Never above the evaluated dose — the
    // plan titrates up to it, it does not overshoot it.
    const floorCandidates = [ruleStart, usualStart].filter((v): v is number => v !== null)
    const startMgPerDay = floorCandidates.length > 0 ? Math.min(prescribed, ...floorCandidates) : prescribed
    const adjusted = usualStart !== null && Math.abs(startMgPerDay - usualStart) > 1e-9

    const drugStatements: PlanStatement[] = [
      {
        text: `Start ${name} ${mgStr(startMgPerDay / perDay)} ${perDayStr(perDay)} (${mgStr(startMgPerDay)}/day).`,
        basis:
          ruleStart !== null && Math.abs(startMgPerDay - ruleStart) < 1e-9 && startReasons.length > 0
            ? startReasons[0].basis
            : usual
              ? { kind: 'dataset', field: `${substanceId}.dosing.typical_adult_start_mg`, provenance: usual.provenance }
              : { kind: 'engine', computation: 'dose of the highest-ranked evaluated arm' },
      },
    ]

    if (usualStart === null) {
      gaps.push({
        section: 'start',
        what: `the usual adult starting dose of ${name}`,
        why: `data/substances.json has no \`dosing.typical_adult_start_mg\` value for ${substanceId}, so the plan starts at the evaluated arm's dose and says so.`,
      })
    } else if (!adjusted) {
      drugStatements.push({
        text: `That is the usual adult starting dose; nothing in this patient's profile calls for a lower one.`,
        basis: { kind: 'dataset', field: `${substanceId}.dosing.typical_adult_start_mg`, provenance: usual?.provenance },
      })
    }

    // A short note attached to the label's start dose — e.g. lisinopril's "5 mg if the
    // patient is already on a diuretic". Surfaced verbatim, only when it can apply.
    const note = usual?.provenance?.note
    if (typeof note === 'string' && note.length > 0 && note.length < 220) {
      drugStatements.push({
        text: `Label note on the starting dose: ${note}`,
        basis: { kind: 'dataset', field: `${substanceId}.dosing.typical_adult_start_mg`, provenance: usual?.provenance },
      })
    }

    if (prescribed > startMgPerDay + 1e-9) {
      drugStatements.push({
        text: `Titrate towards ${mgStr(prescribed)}/day, the dose of the arm that was simulated and ranked.`,
        basis: { kind: 'engine', computation: 'dose of the ranked arm this plan is written for' },
      })
    }
    if (cap !== null) {
      drugStatements.push({
        text: `Do not exceed ${mgStr(cap)}/day.`,
        basis: capBasis ?? { kind: 'dataset', field: `${substanceId}.dosing.max_daily_mg` },
      })
    }

    drugs.push({
      substanceId,
      name,
      startMgPerDay,
      perDay,
      targetMgPerDay: prescribed,
      usualStartMgPerDay: usualStart,
      adjusted,
      capMgPerDay: cap,
      reasons: startReasons,
      statements: drugStatements,
    })
  }

  if (drugs.length > 1) {
    statements.push({
      text:
        `Two classes are started together rather than one at a higher dose. The escalation section below ` +
        `carries the engine's comparison of the two strategies for this patient, in mmHg.`,
      basis: { kind: 'engine', computation: 'combinationRule() bounded pooling across pathways' },
    })
  }

  return { heading: 'What to start', drugs, statements }
}

// ---------------------------------------------------------------------------
// 2. How to titrate
// ---------------------------------------------------------------------------

/**
 * The escalation criterion, stated so it can be argued with.
 *
 * Benefit is the extra systolic fall the step buys THIS patient, from the engine's
 * combination rule. Harm is the extra drug-attributable adverse-effect prevalence over
 * the same step, in percentage points, taken from the BEST available source for that
 * drug — see `harmForStep`.
 *
 * The two are in different units — mmHg against percentage points — so comparing them
 * requires an exchange rate, and there is no sourced one. Parity (1 mmHg per 1 point) is
 * ESTIMATED and is the assumption the verdict rests on. It is stated in the plan text
 * rather than hidden here, and it reproduces the two answers the dataset makes obvious:
 * hydrochlorothiazide 12.5 → 25 mg buys ~1.7 mmHg for ~7.9 points, and amlodipine
 * 5 → 10 mg buys ~2.8 mmHg for ~6.7 points. Both are holds. Lisinopril, losartan and
 * metoprolol are not.
 *
 * ⚠️ THE RANKER USES A DIFFERENT EXCHANGE RATE AND CAN REACH THE OPPOSITE ANSWER.
 * `report/score.ts` composes 0.40·E + 0.35·S + 0.25·A. A percentage point of oedema costs
 * `risk_peripheral_edema` (0.25) × `safety` (0.35) = 0.0875 composite points; a mmHg buys
 * roughly 0.6, so the composite implicitly trades about SEVEN points of oedema for one
 * mmHg where this function trades one. Both rates are estimates and neither is sourced.
 * That is why the ranker climbs to amlodipine 10 mg while this function holds at 5 mg,
 * and `reconcileDoseStep` puts both answers in front of the reader with both numbers.
 */
export const TITRATION_PARITY_MMHG_PER_POINT = 1.0

/**
 * Two harm estimates for one dose step, in the same unit — percentage points of
 * drug-attributable adverse effect.
 *
 *  - `law2003` is the class-level pooled symptom prevalence (treated minus placebo) the
 *    engine already carries. Available for every drug, resolved by dose, not by drug.
 *  - `cited` is what `rules.json` itself quantifies for the substance at each dose, read
 *    by evaluating the real rules at both doses. Drug-specific, dose-resolved, CITED, and
 *    subgroup-resolved where the label supports it — and it is EXACTLY the quantity the
 *    ranker's safety term charges for, so using it makes the two computations share one
 *    harm model.
 *
 * `cited` is preferred when the rules quantify anything for the substance, because it is
 * the better evidence and it is what the ranker sees. Where they quantify nothing (the
 * thiazide) `law2003` is the only dose-resolved estimate that exists and is used instead.
 * Both are always reported so the reader can see whether they agree.
 */
function harmForStep(
  input: TreatmentPlanInput,
  regimenNow: Regimen,
  regimenNext: Regimen,
): { law2003: number; cited: number | null; used: number; source: HarmSource; agree: boolean | null } {
  const law2003 = (regimenAdverseBurden(regimenNext) - regimenAdverseBurden(regimenNow)) * 100

  let cited: number | null = null
  const rulesFile = input.data?.rules
  if (rulesFile) {
    const now = evaluateRules(input.patient, regimenNow, rulesFile, {}).risks
    const next = evaluateRules(input.patient, regimenNext, rulesFile, {}).risks
    const channels = new Set([...Object.keys(now), ...Object.keys(next)])
    // An empty risk map at BOTH doses means the rules quantify nothing for this drug —
    // which is not the same claim as "this step adds no risk", and must not be reported
    // as if it were.
    if (channels.size > 0) {
      let sum = 0
      for (const c of channels) sum += (next[c] ?? 0) - (now[c] ?? 0)
      cited = sum * 100
    }
  }

  const used = cited ?? law2003
  const source: HarmSource = cited === null ? 'law2003_class_prevalence' : 'cited_rule_incidence'
  // Agreement tolerance: one percentage point, or 20 % of the larger estimate.
  const agree =
    cited === null
      ? null
      : Math.abs(cited - law2003) <= Math.max(1, 0.2 * Math.max(Math.abs(cited), Math.abs(law2003)))

  return { law2003, cited, used, source, agree }
}

/**
 * Score the same two doses with the REAL ranker and report where it lands.
 *
 * What is shared and what is not, because this is the whole point of the section:
 *
 *  - SHARED: the harm figure. Both read the rules' dose-resolved incidence where it
 *    exists (`harmForStep`), so neither is charging for a different adverse effect.
 *  - SHARED: the efficacy figure. Both read ΔSBP from `combinationRule`, which spec
 *    §6.1b(a) already mandates for every ranked dose comparison.
 *  - NOT SHARED, and not shareable: what a mmHg is worth against a percentage point. The
 *    ranker's rate falls out of three ESTIMATED weights; this module's is an explicit
 *    parity assumption. Neither is sourced, so neither can correct the other.
 *
 * One limitation is stated in the output rather than papered over: the lab-excursion
 * penalty is held constant across the step, because separating it by dose needs an engine
 * run at each dose and a plan is built from one run. For hydrochlorothiazide — whose
 * dose-dependent harm is potassium and urate, not a labelled incidence — that is exactly
 * where its harm lives, so the ranker's view of a thiazide step is optimistic here.
 */
function reconcileDoseStep(args: {
  input: TreatmentPlanInput
  regimenNow: Regimen
  regimenNext: Regimen
  name: string
  fromMgPerDay: number
  nextMgPerDay: number
  deltaSbp: number
  harm: ReturnType<typeof harmForStep>
  verdict: TitrationVerdict
  gaps: PlanGap[]
}): PlanDoseReconciliation | null {
  const { input, regimenNow, regimenNext, name, deltaSbp, harm, verdict, gaps } = args
  const rulesFile = input.data?.rules
  if (!rulesFile) return null

  const subject = subjectOf(input.patient)
  const pdMultipliers = input.modifiers?.pdMultipliers ?? {}
  const baseSummary: RunSummary = input.summary ?? {
    deltaSbp: 0,
    deltaDbp: 0,
    peakConc: {},
    troughConc: {},
    hazards: {},
    finalChem: {
      plasma_volume: 0,
      ecf_volume: 0,
      serum_k: NaN,
      serum_na: NaN,
      serum_urate: NaN,
      serum_creatinine: NaN,
      fasting_glucose: NaN,
    },
    framesEmitted: 0,
  }

  const candidateFor = (r: Regimen, suffix: string): ScoreCandidate => {
    const c = combinationRule(r, subject, { pdMultipliers })
    return {
      regimen: { ...r, id: `${r.id}::${suffix}`, label: `${name} ${suffix === 'now' ? args.fromMgPerDay : args.nextMgPerDay} mg/day` },
      summary: { ...baseSummary, deltaSbp: c.dsbp, deltaDbp: c.ddbp },
      modifiers: evaluateRules(input.patient, r, rulesFile, {}),
    }
  }

  const scored = rankOptions({
    patient: input.patient,
    candidates: [candidateFor(regimenNow, 'now'), candidateFor(regimenNext, 'next')],
    data: input.data ?? null,
  })
  const oNow = scored.find((o) => o.regimen.id.endsWith('::now'))
  const oNext = scored.find((o) => o.regimen.id.endsWith('::next'))
  if (!oNow || !oNext) return null

  const compositeDelta = oNext.compositeExact - oNow.compositeExact
  const threshold = Number(SCORE_WEIGHTS.tieThreshold) || 0
  const rankerCallsItTied = Math.abs(compositeDelta) <= threshold
  const rankerPrefersNextDose = compositeDelta > 0

  // Decompose the ranker's own composite move into "paid for harm" and "bought with
  // mmHg", exactly, from the penalty terms it publishes. Skip it if any term clamped,
  // because then the decomposition is not an identity.
  const penTotal = (o: typeof oNow) => o.penalties.rule + o.penalties.risk + o.penalties.lab
  const costComposite = Number(SCORE_WEIGHTS.safety) * (penTotal(oNext) - penTotal(oNow))
  const benefitComposite = compositeDelta + costComposite
  const unclamped = [oNow, oNext].every(
    (o) => o.efficacyTerm > 0 && o.efficacyTerm < 100 && o.safetyTerm > 0 && o.safetyTerm < 100,
  )
  const impliedHarmPointsPerMmHg =
    unclamped && deltaSbp > 0 && harm.used > 0 && costComposite > 0 && benefitComposite > 0
      ? benefitComposite / deltaSbp / (costComposite / harm.used)
      : null

  // Disagreement runs both ways: the ranker climbing past a hold, and the ranker
  // preferring the lower dose while this step says titrate. A tie is not a disagreement —
  // the ranker is explicitly declining to separate the two arms.
  const agree =
    rankerCallsItTied ||
    (rankerPrefersNextDose ? verdict !== 'hold' : verdict !== 'titrate')
  const statements: PlanStatement[] = []

  // --- how the two harm estimates compare ------------------------------------
  if (harm.cited !== null && Math.abs(harm.cited) < 0.05 && Math.abs(harm.law2003) < 0.05) {
    statements.push({
      text:
        `Neither harm source attributes any extra adverse effect to this step: Law 2003's class symptom ` +
        `prevalence is flat across it, and the rules' own incidence figures for ${name} do not move with dose.`,
      basis: { kind: 'engine', computation: 'Law 2003 class prevalence against the rules’ dose-resolved incidence, same step' },
    })
  } else if (harm.cited === null) {
    statements.push({
      text:
        `The rules quantify no dose-resolved adverse-effect channel for ${name}, so the ranker charges nothing ` +
        `extra for this step beyond laboratory excursions — and separating those by dose needs an engine run at ` +
        `each dose, which a plan built from one run does not have. Law 2003's class figure of ` +
        `${r1(harm.law2003)} percentage points is the only dose-resolved harm estimate available here.`,
      basis: { kind: 'engine', computation: 'ADVERSE_SYMPTOM_PREVALENCE (Law 2003) with no rule-quantified channel to compare' },
    })
    gaps.push({
      section: 'titration',
      what: `the dose-resolved harm the ranker charges for a ${name} step`,
      why:
        `rules.json quantifies no adverse-effect incidence for ${args.regimenNext.doses[0]?.substanceId ?? name} that varies with dose, ` +
        `and this plan holds the laboratory-excursion term constant across the step because it is built from a ` +
        `single engine run. The ranker's view of this step is therefore optimistic and is reported as such.`,
    })
  } else if (harm.agree) {
    statements.push({
      text:
        `Two independent sources put the same size on this step's harm: Law 2003's pooled class symptom ` +
        `prevalence gives ${r1(harm.law2003)} percentage points and the label's own dose-resolved incidence ` +
        `gives ${r1(harm.cited)}. They agree to ${r1(Math.abs(harm.cited - harm.law2003))} points, so any ` +
        `disagreement about whether to take the step is not an accounting artefact.`,
      basis: { kind: 'engine', computation: 'Law 2003 class prevalence against the rules’ dose-resolved incidence, same step' },
    })
  } else {
    const caveat = (input.modifiers?.caveats ?? [])[0]
    statements.push({
      text:
        `The two harm estimates for this step differ: Law 2003's pooled class figure is ` +
        `${r1(harm.law2003)} percentage points, the label's dose-resolved incidence for this patient is ` +
        `${r1(harm.cited)}. The plan uses the second, because it is drug-specific and cited.` +
        (caveat ? ` It is also subgroup-resolved where the pooled figure is not. ${modellingCaveatChip(caveat)}` : ''),
      basis: { kind: 'engine', computation: 'Law 2003 class prevalence against the rules’ dose-resolved incidence, same step' },
    })
  }

  // --- where the ranker lands, and why it can differ ---------------------------
  if (agree) {
    statements.push({
      text: rankerCallsItTied
        ? `Scoring both doses as arms, the ranker cannot separate them: ${r1(oNow.compositeExact)} against ` +
          `${r1(oNext.compositeExact)}, inside its own ${r1(threshold)}-point tie threshold. It does not contradict ` +
          `this step either way.`
        : `Scoring both doses as arms, the ranker reaches the same conclusion: ${r1(oNow.compositeExact)} against ` +
          `${r1(oNext.compositeExact)}, so the ${verdict === 'titrate' ? 'higher' : 'lower'} dose is preferred by both.`,
      basis: { kind: 'engine', computation: 'report/score.ts composite on both doses of this step' },
    })
  } else {
    statements.push({
      text:
        `⚠️ The ranked recommendation and this titration step DISAGREE, and the disagreement is real. Scored as ` +
        `arms, ${name} ${r1(args.nextMgPerDay)} mg/day composes to ${r1(oNext.compositeExact)} against ` +
        `${r1(oNow.compositeExact)} for ${r1(args.fromMgPerDay)} mg/day, so the ranking prefers the ` +
        `${rankerPrefersNextDose ? 'higher' : 'lower'} dose` +
        (rankerPrefersNextDose
          ? `: it lowers systolic pressure by ${r1(deltaSbp)} mmHg more, and this drug is still climbing its ` +
            `dose-response curve. This step nonetheless reads as a poor trade, because those ${r1(deltaSbp)} mmHg ` +
            `cost ${r1(harm.used)} percentage points of adverse effect.`
          : `, while this step reads the ${r1(deltaSbp)} mmHg it buys as worth its ${r1(harm.used)} percentage ` +
            `points of adverse effect.`),
      basis: { kind: 'engine', computation: 'report/score.ts composite against the titration trade-off, same two doses' },
    })
    statements.push({
      text:
        impliedHarmPointsPerMmHg !== null
          ? `Both computations charge the SAME harm for the step. They differ only in what a mmHg is worth against ` +
            `it: the composite's weights imply ${r1(impliedHarmPointsPerMmHg)} percentage points of adverse effect ` +
            `per mmHg, this step assumes ${r1(TITRATION_PARITY_MMHG_PER_POINT)}. Neither exchange rate is a sourced ` +
            `number — the composite's falls out of three ESTIMATED weights and this one is an explicit assumption.`
          : `Both computations charge the same harm for the step and differ only in what a mmHg is worth against it. ` +
            `The composite's exchange rate could not be derived exactly here because a score term reached its ` +
            `bound, so only this module's assumption of parity is stated.`,
      basis: { kind: 'engine', computation: 'composite decomposition: (Δcomposite + w_safety·Δpenalties) / ΔSBP against w_safety·Δpenalties / harm points' },
    })
    statements.push({
      text:
        `This is a prescriber's judgement, not a computation: it is a judgement about how much ` +
        `${harm.source === 'cited_rule_incidence' ? 'of this specific adverse effect' : 'symptom burden'} this ` +
        `patient will accept for ${r1(deltaSbp)} mmHg. The product will not make it for you, and it will not ` +
        `hide that it has two defensible answers.`,
      basis: { kind: 'engine', computation: 'no sourced exchange rate exists between mmHg and adverse-effect incidence' },
    })
  }

  return {
    compositeNow: oNow.compositeExact,
    compositeNext: oNext.compositeExact,
    compositeDelta,
    rankerPrefersNextDose,
    rankerCallsItTied,
    titrationVerdict: verdict,
    agree,
    impliedHarmPointsPerMmHg,
    titrationHarmPointsPerMmHg: TITRATION_PARITY_MMHG_PER_POINT,
    statements,
  }
}

function buildTitration(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  hits: RuleHit[],
  start: PlanStart,
  gaps: PlanGap[],
): PlanTitration {
  const { data, patient, modifiers } = input
  const subject = subjectOf(patient)
  const pdMultipliers = modifiers?.pdMultipliers ?? {}
  const intervalEffects = effectsOfOp(hits, 'titration_interval_days')
  const steps: PlanTitrationStep[] = []
  const statements: PlanStatement[] = []

  // The regimen as the plan actually starts it, which is what titration steps off.
  let startRegimen: Regimen = chosen.regimen
  for (const d of start.drugs) startRegimen = withDose(startRegimen, d.substanceId, d.startMgPerDay)
  const startEffect = combinationRule(startRegimen, subject, { pdMultipliers })

  for (const d of start.drugs) {
    const rec = substanceRecord(d.substanceId, data)
    const ladder = doseLadderMgPerDay(d.substanceId, d.perDay, data)
    const next = nextRung(ladder, d.startMgPerDay, d.capMgPerDay)

    // Interval: rules first (they carry the guards), then the label field, then nothing.
    let intervalDays: number | null = modifiers?.titrationIntervalDays?.[d.substanceId] ?? null
    let intervalBasis: PlanBasis = { kind: 'unavailable', reason: 'no titration interval in the dataset' }
    const intervalHit = intervalEffects.find((e) => e.effect.substance === d.substanceId)
    if (intervalDays !== null && intervalHit) {
      intervalBasis = ruleBasis(intervalHit.hit, intervalHit.effect)
    } else if (intervalDays === null && intervalHit && typeof intervalHit.effect.when !== 'string') {
      intervalDays = Number(intervalHit.effect.days)
      intervalBasis = ruleBasis(intervalHit.hit, intervalHit.effect)
    }
    if (intervalDays === null) {
      const m = measuredAt(rec, 'dosing', 'titration_interval_days')
      if (m) {
        intervalDays = m.value!
        intervalBasis = {
          kind: 'dataset',
          field: `${d.substanceId}.dosing.titration_interval_days`,
          provenance: m.provenance,
        }
      }
    }
    if (intervalDays === null) {
      gaps.push({
        section: 'titration',
        what: `how long to wait between ${d.name} dose steps`,
        why: `No rule emitted a \`titration_interval_days\` effect for ${d.substanceId} and data/substances.json carries no \`dosing.titration_interval_days\` for it.`,
      })
    }

    let extraSbp: number | null = null
    let harm: ReturnType<typeof harmForStep> | null = null
    let verdict: TitrationVerdict = 'unknown'
    let reconciliation: PlanDoseReconciliation | null = null
    const stepStatements: PlanStatement[] = []

    if (next === null) {
      verdict = 'at_ceiling'
      stepStatements.push({
        text: `${d.name} is already at its ceiling of ${d.capMgPerDay !== null ? mgStr(d.capMgPerDay) : mgStr(d.startMgPerDay)}/day. Add a class rather than raise this one.`,
        basis: { kind: 'dataset', field: `${d.substanceId}.dosing.max_daily_mg` },
      })
    } else {
      const nextRegimen = withDose(startRegimen, d.substanceId, next)
      extraSbp = combinationRule(nextRegimen, subject, { pdMultipliers }).dsbp - startEffect.dsbp
      // ONE harm model, shared with the ranker wherever the rules quantify the channel.
      harm = harmForStep(input, startRegimen, nextRegimen)
      const worthIt = extraSbp >= harm.used * TITRATION_PARITY_MMHG_PER_POINT
      verdict = worthIt ? 'titrate' : 'hold'

      stepStatements.push({
        text:
          `Next step for ${d.name}: ${mgStr(next)}/day` +
          (intervalDays !== null ? `, no sooner than ${Math.round(intervalDays)} days after the current dose.` : '.'),
        basis: intervalDays !== null ? intervalBasis : { kind: 'dataset', field: 'products.json available_strengths' },
      })
      stepStatements.push({
        text:
          `That step is projected to buy ${r1(extraSbp)} mmHg more systolic fall in this patient and to add ` +
          `${r1(harm.used)} percentage points of drug-attributable adverse effect` +
          (harm.source === 'cited_rule_incidence'
            ? ` (the label incidence the safety score itself charges for).`
            : ` (Law 2003 pooled class symptom prevalence — the rules quantify no dose-resolved channel for this drug).`),
        basis: {
          kind: 'engine',
          computation:
            harm.source === 'cited_rule_incidence'
              ? 'combinationRule() ΔSBP difference and the rules’ dose-resolved incidence at both doses'
              : 'combinationRule() ΔSBP difference and regimenAdverseBurden() difference (Law 2003, treated minus placebo)',
        },
      })
      if (verdict === 'hold') {
        stepStatements.push({
          text:
            `Do NOT escalate ${d.name} for blood pressure alone: past this dose the response curve is nearly ` +
            `flat while the adverse burden keeps climbing. Add a second class instead. (Comparing mmHg with ` +
            `percentage points needs an exchange rate; parity is assumed and is an ESTIMATE.)`,
          basis: {
            kind: 'engine',
            computation: `benefit ${r1(extraSbp)} mmHg < harm ${r1(harm.used)} points × parity ${TITRATION_PARITY_MMHG_PER_POINT}`,
          },
        })
      }

      reconciliation = reconcileDoseStep({
        input,
        regimenNow: startRegimen,
        regimenNext: nextRegimen,
        name: d.name,
        fromMgPerDay: d.startMgPerDay,
        nextMgPerDay: next,
        deltaSbp: extraSbp,
        harm,
        verdict,
        gaps,
      })

      // Without the dataset the reconciliation cannot run, so the bare tension is still
      // reported rather than silently dropped.
      if (!reconciliation && verdict === 'hold' && d.targetMgPerDay > d.startMgPerDay + 1e-9) {
        stepStatements.push({
          text:
            `Note the tension: the arm that was ranked uses ${mgStr(d.targetMgPerDay)}/day of ${d.name}, and the ` +
            `same engine says the step to get there is a poor trade. Reach that dose only if a reason other ` +
            `than blood pressure calls for it.`,
          basis: { kind: 'engine', computation: 'ranked arm dose against the titration trade-off at the same dose step' },
        })
      }
    }

    steps.push({
      substanceId: d.substanceId,
      name: d.name,
      fromMgPerDay: d.startMgPerDay,
      nextMgPerDay: next,
      intervalDays,
      intervalBasis,
      extraSbpDropMmHg: extraSbp,
      extraAdversePoints: harm?.used ?? null,
      harmSource: harm?.source ?? null,
      harmLaw2003Points: harm?.law2003 ?? null,
      harmCitedPoints: harm?.cited ?? null,
      harmModelsAgree: harm?.agree ?? null,
      verdict,
      reconciliation,
      statements: stepStatements,
    })
  }

  // Section-level headline: if any step disagrees with the ranking, say so once, at the
  // top, rather than leaving it to be discovered inside a step.
  const disagreeing = steps.filter((s) => s.reconciliation && !s.reconciliation.agree)
  if (disagreeing.length > 0) {
    statements.unshift({
      text:
        `Read the ${disagreeing.map((s) => s.name).join(' and ')} step carefully: the ranked recommendation and ` +
        `this titration advice disagree about it. Both answers are computed, both are defensible, and the ` +
        `reason they differ is set out beside the step.`,
      basis: { kind: 'engine', computation: 'report/score.ts composite against the titration trade-off' },
    })
  }

  statements.push({
    text:
      'Re-measure blood pressure before every dose step, and take the reading at trough — just before the ' +
      'next dose — so the step is judged on the drug at its weakest point of the day.',
    basis: { kind: 'engine', computation: 'trough-to-peak coverage term of the efficacy score' },
  })

  return { heading: 'How to titrate', steps, statements }
}

// ---------------------------------------------------------------------------
// 3. The target
// ---------------------------------------------------------------------------

function buildTarget(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  gaps: PlanGap[],
): PlanTarget {
  const { patient, data, summary } = input
  const target = bpTarget(patient)
  const baselineSbp = patient.vars.sbp_mmHg ?? patient.inputs.sbp_mmHg
  const baselineDbp = patient.vars.dbp_mmHg ?? patient.inputs.dbp_mmHg
  const deltaSbp = chosen.deltaSbp
  const deltaDbp = summary?.deltaDbp ?? null
  const projectedSbp = baselineSbp - deltaSbp
  const projectedDbp = deltaDbp === null ? null : baselineDbp - deltaDbp
  const reaches = projectedSbp <= target.sbp && (projectedDbp === null || projectedDbp <= target.dbp)

  const statements: PlanStatement[] = [
    {
      text: `Blood-pressure goal for this patient: ${target.label}.`,
      basis: { kind: 'guideline', source: target.source },
    },
    {
      text:
        `On the planned regimen the model projects ${Math.round(projectedSbp)}` +
        (projectedDbp !== null ? `/${Math.round(projectedDbp)}` : '') +
        ` mmHg at steady state, from a baseline of ${Math.round(baselineSbp)}/${Math.round(baselineDbp)} — ` +
        `a fall of ${r1(deltaSbp)} mmHg systolic.`,
      basis: { kind: 'engine', computation: 'placebo-corrected steady-state ΔSBP from the ranked arm' },
    },
  ]

  // Pharmacokinetic steady state — five elimination half-lives of the slowest drug.
  let pkDays: number | null = null
  let slowest: DrugId | null = null
  for (const id of substancesOf(chosen.regimen)) {
    const t = SUBSTANCE_PK[id]?.half_life_h
    if (typeof t !== 'number') continue
    const days = (5 * t) / 24
    if (pkDays === null || days > pkDays) {
      pkDays = days
      slowest = id
    }
  }

  // Full antihypertensive effect — a different quantity, measured in weeks.
  let fullWeeks: number | null = null
  let fullBasis: PlanBasis = { kind: 'unavailable', reason: 'no time-to-full-effect value in the dataset' }
  const missing: string[] = []
  for (const id of substancesOf(chosen.regimen)) {
    const rec = substanceRecord(id, data)
    const m =
      clinicalEffect(rec, 'time_to_full_effect_weeks') ??
      clinicalEffect(rec, 'antihypertensive_full_effect_weeks')
    if (!m) {
      missing.push(drugName(id, data))
      continue
    }
    if (fullWeeks === null || m.value! > fullWeeks) {
      fullWeeks = m.value!
      fullBasis = { kind: 'dataset', field: `${id}.pd.clinical_effect`, provenance: m.provenance }
    }
  }

  if (pkDays !== null && slowest) {
    const howLong = pkDays >= 1 ? `${r1(pkDays)} days` : `${Math.round(pkDays * 24)} hours`
    statements.push({
      text:
        `Plasma concentrations reach steady state in about ${howLong} ` +
        `(five elimination half-lives of ${drugName(slowest, data)}). That is NOT when the blood pressure ` +
        `has finished falling — pharmacokinetic steady state and full antihypertensive effect are different things.`,
      basis: { kind: 'engine', computation: '5 × SUBSTANCE_PK.half_life_h of the slowest drug in the arm' },
    })
  }
  if (fullWeeks !== null) {
    statements.push({
      text:
        `The antihypertensive effect is established at about ${r1(fullWeeks)} weeks. Judge whether the target ` +
        `has been reached then, not at pharmacokinetic steady state — the vascular component of the response ` +
        `lags the plasma concentration by weeks.`,
      basis: fullBasis,
    })
  }
  if (missing.length > 0) {
    gaps.push({
      section: 'target',
      what: `time to full antihypertensive effect for ${missing.join(', ')}`,
      why: 'data/substances.json records no `time_to_full_effect_weeks` for those substances; the plan uses the longest value it does have and does not extrapolate the rest.',
    })
  }

  if (!reaches) {
    statements.push({
      text:
        `This regimen alone is not projected to reach ${target.label} — it falls ` +
        `${r1(projectedSbp - target.sbp)} mmHg short on systolic. Plan for the escalation step below from the start.`,
      basis: { kind: 'engine', computation: 'projected steady-state SBP against the guideline target' },
    })
  }

  return {
    heading: 'The target',
    target,
    baselineSbp,
    baselineDbp,
    projectedSbp,
    projectedDbp,
    reachesTarget: reaches,
    shortfallSbpMmHg: Math.max(0, projectedSbp - target.sbp),
    pkSteadyStateDays: pkDays,
    fullEffectWeeks: fullWeeks,
    fullEffectBasis: fullBasis,
    statements,
  }
}

// ---------------------------------------------------------------------------
// 4. What to monitor and when
// ---------------------------------------------------------------------------

function buildMonitoring(
  input: TreatmentPlanInput,
  hits: RuleHit[],
  gaps: PlanGap[],
): PlanMonitoring {
  const { data, modifiers, patient } = input
  const ranges = labReferenceRanges(data?.patientModel ?? null)

  const index = new Map<
    string,
    { lab: string; atDays: number[]; ruleIds: string[]; quotes: PlanStatement[] }
  >()
  for (const entry of modifiers?.monitoring ?? []) {
    index.set(entry.lab, {
      lab: entry.lab,
      atDays: [...entry.atDays],
      ruleIds: [...entry.ruleIds],
      quotes: [],
    })
  }
  // `monitor` effects carry no `when` guard, so reading them off the fired rules is
  // faithful even without the evaluation. Merge rather than replace.
  for (const { hit, effect } of effectsOfOp(hits, 'monitor')) {
    const labs = Array.isArray(effect.labs) ? (effect.labs as string[]) : []
    const atDays = Array.isArray(effect.at_days) ? (effect.at_days as number[]) : []
    for (const raw of labs) {
      const lab = normaliseLab(raw)
      const e = index.get(lab) ?? { lab, atDays: [], ruleIds: [], quotes: [] }
      e.atDays = [...new Set([...e.atDays, ...atDays])].sort((a, b) => a - b)
      if (!e.ruleIds.includes(hit.ruleId)) e.ruleIds.push(hit.ruleId)
      // The monitor effect's own provenance quote is the monitoring INSTRUCTION —
      // "check electrolytes 2-4 weeks after starting ... for hyperkalemia or an eGFR
      // decrease >30%". The rule's warning text is about drug choice, which is a
      // different sentence. Prefer the quote where the data carries one.
      const p = effect.provenance as Provenance | undefined
      if (p && typeof p.quote === 'string' && p.quote.length > 0) {
        if (!e.quotes.some((q) => q.text === p.quote)) {
          e.quotes.push({ text: p.quote!, basis: ruleBasis(hit, effect) })
        }
      }
      index.set(lab, e)
    }
  }

  const items: PlanMonitorItem[] = []
  for (const e of [...index.values()].sort((a, b) => a.lab.localeCompare(b.lab))) {
    const range = ranges[e.lab] ?? null
    const actions: PlanStatement[] = [...e.quotes]
    for (const ruleId of e.ruleIds) {
      const hit = hits.find((h) => h.ruleId === ruleId)
      if (!hit) continue
      actions.push({
        text: firstSentence(hit.warningText) || hit.mechanism,
        basis: ruleBasis(hit),
      })
    }
    if (range) {
      const baseline = patient.vars[e.lab]
      const alreadyOutside = typeof baseline === 'number' && (baseline < range[0] || baseline > range[1])
      actions.push({
        text: alreadyOutside
          ? `This patient's baseline is already ${r1(baseline)}, outside the ${range[0]}–${range[1]} reference range. Judge the follow-up against that baseline, not against the range: a further move away from it is what changes the plan.`
          : `A result outside ${range[0]}–${range[1]} changes the plan: hold the next dose step and reassess the drug that drives this channel.`,
        basis: { kind: 'dataset', field: `patient_model.json state_variables.${e.lab}.healthy_reference` },
      })
    } else {
      gaps.push({
        section: 'monitoring',
        what: `the result that would change the plan for ${humanise(e.lab)}`,
        why: `data/patient_model.json publishes no \`healthy_reference\` range for \`${e.lab}\`, so the plan schedules the test but will not invent a threshold.`,
      })
    }
    if (e.atDays.length === 0) {
      gaps.push({
        section: 'monitoring',
        what: `when to check ${humanise(e.lab)}`,
        why: `The rules that asked for it (${e.ruleIds.join(', ')}) emitted no \`at_days\` schedule.`,
      })
    }
    items.push({
      lab: e.lab,
      label: humanise(e.lab),
      atDays: e.atDays,
      ruleIds: e.ruleIds,
      actionRange: range,
      actionStatements: actions,
    })
  }

  const statements: PlanStatement[] = []
  if (items.length === 0) {
    statements.push({
      text: 'No fired rule requested laboratory monitoring for this regimen in this patient.',
      basis: { kind: 'unavailable', reason: 'no `monitor` effect fired' },
    })
    gaps.push({
      section: 'monitoring',
      what: 'a routine monitoring schedule',
      why: 'PilSim schedules only the tests a fired rule asks for. Absence of a rule is not evidence that no monitoring is needed — it means this dataset carries none for this combination.',
    })
  } else {
    statements.push({
      text: 'Day counts are days after starting or after each dose increase, whichever is later.',
      basis: { kind: 'dataset', field: 'rules.json monitor.at_days' },
    })
  }

  return { heading: 'What to monitor, and when', items, statements }
}

/** `serum_k_mmol_l` and `labs.serum_k_mmol_l` both mean `serum_k_mmol_L`. */
function normaliseLab(raw: string): string {
  const map: Record<string, string> = {
    egfr_ml_min_1_73: 'egfr_ckdepi2021',
    serum_creatinine_mg_dl: 'scr_mg_dL',
    serum_k_mmol_l: 'serum_k_mmol_L',
    serum_na_mmol_l: 'serum_na_mmol_L',
    serum_urate_mg_dl: 'serum_urate_mg_dL',
    uacr_mg_g: 'uacr_mg_g',
    fasting_glucose_mg_dl: 'fasting_glucose_mg_dL',
    hba1c_pct: 'hba1c_pct',
    serum_lithium_mmol_l: 'serum_lithium_mmol_L',
    fev1_pct_predicted: 'fev1_pct_predicted',
  }
  const bare = raw.replace(/^(labs|vitals)\./, '')
  return map[bare] ?? bare
}

// ---------------------------------------------------------------------------
// 5. What to avoid, and why
// ---------------------------------------------------------------------------

function buildAvoid(input: TreatmentPlanInput, hits: RuleHit[]): PlanAvoid {
  const byRule = new Map<string, PlanAvoidItem>()

  const consider = (hit: RuleHit, regimenLabel: string) => {
    if (hit.direction === 'positive') return
    if (hit.severityRank < 4 && !hit.blocks) return
    // A `modifier` rule below `major` changes how a drug is used rather than saying not
    // to use it — a pharmacogenomic starting dose belongs in "what to start", not here.
    // Above `major` a modifier is still an avoidance (do not stop metoprolol abruptly).
    if (hit.direction === 'modifier' && hit.severityRank < 5 && !hit.blocks) return
    const existing = byRule.get(hit.ruleId)
    if (existing) {
      if (!existing.affectsRegimens.includes(regimenLabel)) existing.affectsRegimens.push(regimenLabel)
      return
    }
    byRule.set(hit.ruleId, {
      ruleId: hit.ruleId,
      title: hit.title,
      severity: hit.severity,
      severityRank: hit.severityRank,
      absolute: hit.blocks,
      text: hit.warningText ?? hit.mechanism,
      mechanism: hit.mechanism,
      citation: hit.citation,
      affectsRegimens: [regimenLabel],
    })
  }

  for (const hit of hits) consider(hit, 'the planned regimen')
  for (const option of input.ranked) {
    const tier = optionTier(option)
    if (tier === 'ALLOWED') continue
    for (const hit of option.hits) consider(hit, option.regimen.label)
  }

  const items = [...byRule.values()].sort((a, b) => {
    if (a.absolute !== b.absolute) return a.absolute ? -1 : 1
    return b.severityRank - a.severityRank
  })

  const statements: PlanStatement[] = []
  if (items.length === 0) {
    statements.push({
      text: 'No contraindication, interaction or avoidance rule fired for this patient across the evaluated arms.',
      basis: { kind: 'unavailable', reason: 'no negative rule fired' },
    })
  } else if (items.some((i) => i.absolute)) {
    statements.push({
      text: 'The entries marked ABSOLUTE are not trade-offs. They rule the drug out for this patient; no score is shown beside them.',
      basis: { kind: 'rule', ruleId: items.find((i) => i.absolute)!.ruleId, severity: 'contraindicated_absolute' },
    })
  }

  return { heading: 'What to avoid, and why', items, statements }
}

// ---------------------------------------------------------------------------
// 6. If this does not work — the escalation path
// ---------------------------------------------------------------------------

function optionFrom(
  o: RankedOption,
  kind: PlanEscalationOption['kind'],
  statements: PlanStatement[] = [],
): PlanEscalationOption {
  const tier = optionTier(o)
  const all = [...statements]
  if (tier === 'OVERRIDE_REQUIRED') {
    const blocker = o.hits.find((h) => h.severityRank === 6)
    all.push({
      text: `This arm requires an override: ${blocker?.title ?? 'a guideline says avoid, not forbid'}. It is ranked below every option with no override requirement.`,
      basis: blocker
        ? ruleBasis(blocker)
        : { kind: 'unavailable', reason: 'tier reported without an identifiable rank-6 rule' },
    })
  }
  return {
    kind,
    regimen: o.regimen,
    label: o.regimen.label,
    deltaSbp: o.deltaSbp,
    score: o.score,
    tier,
    statements: all,
  }
}

/** ALLOWED arms first, then OVERRIDE_REQUIRED; the ranker's order is kept within a tier. */
function preferAllowed(options: RankedOption[]): RankedOption[] {
  const rank = (o: RankedOption) => (optionTier(o) === 'ALLOWED' ? 0 : optionTier(o) === 'OVERRIDE_REQUIRED' ? 1 : 2)
  return options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o)
}

function buildEscalation(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  hits: RuleHit[],
  gaps: PlanGap[],
): PlanEscalation {
  const { patient, ranked, data, modifiers } = input
  const subject = subjectOf(patient)
  const pdMultipliers = modifiers?.pdMultipliers ?? {}
  const current = substancesOf(chosen.regimen)
  const statements: PlanStatement[] = []

  // (a) Doubling the principal drug — always computable, and it is the contrast.
  let doubling: PlanEscalationOption | null = null
  const principal = [...current].sort((a, b) => mgPerDayOf(chosen.regimen, b) / STANDARD_DOSE_MG[b] - mgPerDayOf(chosen.regimen, a) / STANDARD_DOSE_MG[a])[0]
  const baseEffect = combinationRule(chosen.regimen, subject, { pdMultipliers })
  if (principal) {
    const doubled = withDose(chosen.regimen, principal, mgPerDayOf(chosen.regimen, principal) * 2)
    const eff = combinationRule(doubled, subject, { pdMultipliers })
    doubling = {
      kind: 'increase_dose',
      regimen: doubled,
      label: `${drugName(principal, data)} at double the planned dose`,
      deltaSbp: eff.dsbp,
      score: null,
      tier: null,
      statements: [
        {
          text: `Doubling ${drugName(principal, data)} is projected to move systolic from ${r1(baseEffect.dsbp)} to ${r1(eff.dsbp)} mmHg of fall — ${r1(eff.dsbp - baseEffect.dsbp)} mmHg more.`,
          basis: { kind: 'engine', computation: 'combinationRule() at twice the planned dose' },
        },
      ],
    }
  }

  // (b) Adding a class — only from arms the rules engine actually evaluated.
  const viable = preferAllowed(
    ranked.filter((o) => optionTier(o) !== 'DISQUALIFIED' && o.regimen.id !== chosen.regimen.id),
  )
  const superset = viable.filter((o) => {
    const ids = substancesOf(o.regimen)
    return current.every((c) => ids.includes(c)) && ids.length > current.length
  })
  const addOn = superset.length > 0 ? optionFrom(superset[0], 'add_class') : null

  if (addOn && doubling && addOn.deltaSbp !== null && doubling.deltaSbp !== null) {
    const better = addOn.deltaSbp - doubling.deltaSbp
    addOn.statements.push({
      text:
        `Adding a class (${addOn.label}) is projected at ${r1(addOn.deltaSbp)} mmHg against ${r1(doubling.deltaSbp)} mmHg ` +
        `for doubling ${drugName(principal, data)} — ${r1(Math.abs(better))} mmHg ${better >= 0 ? 'more' : 'less'}. ` +
        `Nothing in the engine says "combine"; this falls out of pooling two mechanisms against separate ceilings.`,
      basis: { kind: 'engine', computation: 'combinationRule() add-on versus dose-doubling on this patient' },
    })
  } else if (!addOn) {
    gaps.push({
      section: 'escalation',
      what: 'a second-line regimen that adds a class to the planned one',
      why: 'No evaluated arm contained every drug in the planned regimen plus another. Escalation options are drawn only from arms the rules engine has cleared — the plan will not propose a drug that was never checked against this patient.',
    })
  }

  // (c) The rest of the menu, and any class a positive rule prefers for this patient.
  const alternatives = viable.slice(0, 4).map((o) => optionFrom(o, superset.includes(o) ? 'add_class' : 'switch'))

  if (!ranked.some((o) => optionTier(o) === 'ALLOWED')) {
    statements.push({
      text:
        'No evaluated arm was free of an avoidance rule for this patient. Every option here carries one, and ' +
        'the guideline-preferred agents named in the avoidance section are outside PilSim’s five-drug set — ' +
        'the product cannot rank a drug it does not model.',
      basis: { kind: 'unavailable', reason: 'no ALLOWED arm among the evaluated regimens' },
    })
    gaps.push({
      section: 'escalation',
      what: 'a first-line agent that is appropriate for this patient',
      why: 'The guideline text quoted in the avoidance section names agents PilSim does not model. The product will not rank a drug for which it has no pharmacokinetics, no dose-response and no rules.',
    })
  }

  for (const hit of hits) {
    if (hit.direction !== 'positive') continue
    const preferred = new Set<string>()
    for (const e of hit.effects) {
      if (e.op !== 'score_delta' || e.objective !== 'appropriateness') continue
      if (Array.isArray(e.applies_to)) for (const s of e.applies_to as string[]) preferred.add(String(s))
    }
    if (preferred.size === 0) continue
    statements.push({
      text:
        `${hit.title}: ${firstSentence(hit.warningText) || hit.mechanism} Prefer ${[...preferred].map((p) => drugName(p as DrugId, data)).join(' or ')} when escalating.`,
      basis: ruleBasis(hit),
    })
  }

  if (statements.length === 0) {
    statements.push({
      text: 'No guideline rule fired that prefers a particular class for this patient beyond the four co-equal first-line classes.',
      basis: { kind: 'unavailable', reason: 'no `compelling` or `preferred` rule with an `applies_to` scope fired' },
    })
  }

  return { heading: 'If this does not work', doubling, addOn, alternatives, statements }
}

// ---------------------------------------------------------------------------
// 7. Alternatives if not tolerated
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<string, string> = {
  cough: 'dry cough',
  peripheral_edema: 'ankle swelling',
  hyperkalemia: 'high potassium',
  hypokalemia: 'low potassium',
  angioedema: 'angioedema',
  bradycardia: 'slow heart rate',
  bronchospasm: 'wheeze or breathlessness',
  dizziness_orthostatic: 'dizziness on standing',
  hyperuricemia_gout: 'gout flare',
  gout_flare: 'gout flare',
  hyponatremia: 'low sodium',
}

function buildTolerability(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  hits: RuleHit[],
  gaps: PlanGap[],
): PlanTolerability {
  const { ranked, data, modifiers } = input
  const inArm = new Set(substancesOf(chosen.regimen))
  const swaps: PlanTolerabilitySwap[] = []
  const seen = new Set<string>()

  // Only channels a fired rule ATTRIBUTES to a drug in the arm. An engine hazard with no
  // substance tag cannot be answered with "switch away from X" without guessing which X.
  for (const { hit, effect } of effectsOfOp(hits, 'risk_set')) {
    const substance = typeof effect.substance === 'string' ? (effect.substance as DrugId) : null
    if (!substance || !inArm.has(substance)) continue
    const channel = String(effect.target).replace(/^risk\./, '')
    const key = `${channel}:${substance}`
    if (seen.has(key)) continue
    seen.add(key)

    const probability = modifiers?.risks?.[`risk.${channel}`] ?? modifiers?.risks?.[channel] ?? null

    // The best evaluated arm that does not contain the offending drug.
    const without = preferAllowed(
      ranked.filter((o) => optionTier(o) !== 'DISQUALIFIED' && !substancesOf(o.regimen).includes(substance)),
    )[0]
    const switchTo = without ? optionFrom(without, 'switch') : null

    const statements: PlanStatement[] = [
      {
        text:
          `${cap1(CHANNEL_LABEL[channel] ?? humanise(channel).toLowerCase())} is attributed to ${drugName(substance, data)}` +
          (probability !== null
            ? ` at a modelled ${Math.round(probability * 100)}% excess over placebo.`
            : '. The dataset states this channel as a relative measure with no baseline to convert it, so no probability is given rather than an invented one.'),
        basis: ruleBasis(hit, effect),
      },
    ]
    if (switchTo) {
      statements.push({
        text:
          `If it occurs and is not tolerated, the highest-ranked evaluated arm without ${drugName(substance, data)} ` +
          `is ${switchTo.label}` +
          (switchTo.deltaSbp !== null ? ` (${r1(switchTo.deltaSbp)} mmHg systolic fall` : '') +
          (switchTo.score !== null ? `, composite ${switchTo.score})` : switchTo.deltaSbp !== null ? ')' : '') +
          '.',
        basis: { kind: 'engine', computation: 'best-ranked evaluated arm not containing the implicated drug' },
      })
    } else {
      gaps.push({
        section: 'tolerability',
        what: `what to switch to if ${drugName(substance, data)} causes ${CHANNEL_LABEL[channel] ?? humanise(channel).toLowerCase()}`,
        why: 'Every evaluated arm contained that drug, so the plan has no cleared alternative to offer. Evaluate an arm without it before answering.',
      })
    }

    // A drug-level mechanism the dataset states about the substitute is worth quoting —
    // it is what makes the swap a mechanism rather than a preference.
    const mech = adverseMechanism(substance, channel, data)
    if (mech) statements.push(mech)

    swaps.push({
      channel,
      label: CHANNEL_LABEL[channel] ?? humanise(channel).toLowerCase(),
      substanceId: substance,
      probability,
      switchTo,
      statements,
    })
  }

  swaps.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))

  const statements: PlanStatement[] = []
  if (swaps.length === 0) {
    statements.push({
      text: 'No fired rule attributed a dose-dependent adverse-effect channel to a drug in this regimen.',
      basis: { kind: 'unavailable', reason: 'no `risk_set` effect naming a substance in the arm' },
    })
  }

  return { heading: 'Alternatives if not tolerated', swaps, statements }
}

/** The dataset's own mechanism sentence for an adverse effect, quoted, not invented. */
function adverseMechanism(
  substanceId: string,
  channel: string,
  data?: PilSimData | null,
): PlanStatement | null {
  const rec = substanceRecord(substanceId, data)
  const pd = rec?.pd as Record<string, unknown> | undefined
  const list = pd?.adverse_effects
  if (!Array.isArray(list)) return null
  const wanted = channel.replace(/_/g, ' ')
  const entry = (list as Record<string, unknown>[]).find((a) => {
    const n = String(a.name ?? a.effect ?? '').toLowerCase()
    return n === channel || n === wanted || n.includes(channel)
  })
  const mech = entry?.mechanism
  if (typeof mech !== 'string' || mech.length === 0) return null
  return {
    text: firstSentence(mech),
    basis: { kind: 'dataset', field: `${substanceId}.pd.adverse_effects.${channel}.mechanism` },
  }
}

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// 8. The five-year outlook
// ---------------------------------------------------------------------------

/**
 * research/00-DECISIONS.md §8, verbatim: "The engine produces blood pressure and
 * laboratory values, not strokes, infarctions or deaths. The five-year output must be
 * worded 'projection of blood pressure control and organ-relevant markers'. A projection
 * that appears to predict events is the most serious overclaim available to this team."
 */
export const OUTLOOK_HEADING = 'Five-year projection of blood-pressure control and organ-relevant markers'

export const OUTLOOK_NOT_A_PREDICTION =
  'The engine produces blood pressure and laboratory values. It does not model strokes, ' +
  'myocardial infarctions or deaths, and nothing on this page predicts them. The relative ' +
  'risks below are published trial-population figures quoted for context — they describe what ' +
  'randomised trials observed per 10 mmHg, not what will happen to this patient.'

const MARKERS: { chem: keyof RunSummary['finalChem']; stateVar: string; unit: string }[] = [
  { chem: 'serum_k', stateVar: 'serum_k_mmol_L', unit: 'mmol/L' },
  { chem: 'serum_na', stateVar: 'serum_na_mmol_L', unit: 'mmol/L' },
  { chem: 'serum_urate', stateVar: 'serum_urate_mg_dL', unit: 'mg/dL' },
  { chem: 'serum_creatinine', stateVar: 'scr_mg_dL', unit: 'mg/dL' },
  { chem: 'fasting_glucose', stateVar: 'fasting_glucose_mg_dL', unit: 'mg/dL' },
]

function buildOutlook(
  input: TreatmentPlanInput,
  chosen: RankedOption,
  target: PlanTarget,
  gaps: PlanGap[],
): PlanOutlook {
  const { patient, data, summary } = input
  const adherence = input.adherence ?? 1
  // Baseline five-year event risks are NOT in this dataset, so none are supplied. With an
  // empty map `project5Year` returns relative risks and zero absolute quantities, which is
  // exactly right: the relative risks are literature, the absolute ones would be invention.
  const prognosis = project5Year(chosen.deltaSbp, {}, adherence)
  const projectedSbp = target.baselineSbp - prognosis.deltaSbpSustained
  const projectedDbp = target.projectedDbp

  const ranges = labReferenceRanges(data?.patientModel ?? null)
  const markers: PlanMarkerProjection[] = []
  if (summary?.finalChem) {
    for (const m of MARKERS) {
      const projected = summary.finalChem[m.chem]
      const baseline = patient.vars[m.stateVar]
      if (typeof projected !== 'number' || typeof baseline !== 'number') continue
      const range = ranges[m.stateVar] ?? null
      markers.push({
        id: m.stateVar,
        label: humanise(m.stateVar),
        baseline,
        projected,
        delta: projected - baseline,
        unit: m.unit,
        referenceRange: range,
        outsideRange: range ? projected < range[0] || projected > range[1] : false,
      })
    }
  } else {
    gaps.push({
      section: 'outlook',
      what: 'projected laboratory values at five years',
      why: 'No engine run summary was supplied with the plan, so the organ-relevant markers could not be projected. Pass `summary` from the simulation run.',
    })
  }

  const statements: PlanStatement[] = [
    {
      text:
        `Held on this regimen, the model projects a sustained systolic reduction of ${r1(prognosis.deltaSbpSustained)} mmHg, ` +
        `i.e. about ${Math.round(projectedSbp)}` +
        (projectedDbp !== null ? `/${Math.round(projectedDbp)}` : '') +
        ` mmHg, ${projectedSbp <= target.target.sbp ? 'at' : 'above'} the ${target.target.label} goal.`,
      basis: { kind: 'engine', computation: 'project5Year() — closed form, not integrated' },
    },
    {
      text:
        adherence >= 1
          ? 'This assumes the regimen is taken as described. Adherence is assumed complete; the model contains no adherence dynamics.'
          : `This assumes ${Math.round(adherence * 100)}% adherence, which scales the sustained reduction proportionally.`,
      basis: { kind: 'engine', computation: 'project5Year() adherence multiplier' },
    },
    {
      text:
        'The projection is closed-form, not five simulated years: the model contains no disease progression and no ageing, so every simulated step past week three would reproduce the same steady state.',
      basis: { kind: 'engine', computation: 'engine/prognosis.ts — approximated, never integrated' },
    },
    { text: OUTLOOK_NOT_A_PREDICTION, basis: { kind: 'engine', computation: 'scope limit, research/00-DECISIONS.md §8' } },
  ]

  for (const m of markers) {
    statements.push({
      text:
        `${m.label}: ${r1(m.baseline)} → ${r1(m.projected)} ${m.unit}` +
        (m.referenceRange ? ` (reference ${m.referenceRange[0]}–${m.referenceRange[1]})` : '') +
        (m.outsideRange ? ' — outside the reference range, and the monitoring schedule above covers it.' : '.'),
      basis: { kind: 'engine', computation: 'steady-state chemistry from the simulation run' },
    })
  }

  gaps.push({
    section: 'outlook',
    what: "this patient's absolute five-year event risk",
    why: 'No baseline event-risk model is in this dataset, and none is computed. Relative risks per 10 mmHg are quoted from Ettehad 2016 as trial-population literature only.',
  })

  return {
    heading: OUTLOOK_HEADING,
    sustainedDeltaSbp: prognosis.deltaSbpSustained,
    adherenceAssumed: adherence,
    projectedSbp,
    projectedDbp,
    atTarget: projectedSbp <= target.target.sbp,
    markers,
    classLevelRelativeRisk: {
      perTenMmHg: prognosis.relativeRisk,
      notAPrediction: OUTLOOK_NOT_A_PREDICTION,
      extrapolationWarning: prognosis.extrapolationWarning,
    },
    statements,
  }
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Compose a `TreatmentPlan` from a patient, the ranked arms and the fired rules.
 *
 * Pass `modifiers` (the `EvaluationResult` for the chosen arm) whenever you have it: it
 * carries the GUARDED dose starts, dose caps, titration intervals and monitoring
 * schedule. Without it the plan reads only the ungated effects and records the guarded
 * ones as gaps rather than applying them blind.
 */
export function buildTreatmentPlan(input: TreatmentPlanInput): TreatmentPlan {
  const gaps: PlanGap[] = []
  const { patient, ranked } = input

  const chosen =
    input.chosen ?? ranked.find((o) => optionTier(o) === 'ALLOWED') ?? ranked.find((o) => optionTier(o) !== 'DISQUALIFIED') ?? ranked[0]

  if (!chosen) {
    throw new Error('buildTreatmentPlan: no ranked options were supplied')
  }

  const hits = input.hits ?? chosen.hits
  const chosenTier = optionTier(chosen)

  const start = buildStart(input, chosen, hits, gaps)
  const titration = buildTitration(input, chosen, hits, start, gaps)
  const target = buildTarget(input, chosen, gaps)
  // Timing is built from the regimen AS THE PLAN STARTS IT, not as it was ranked: the
  // patient takes the starting dose tomorrow morning, and a per-administration mg figure
  // is what the coverage arithmetic needs.
  let startedRegimen: Regimen = chosen.regimen
  for (const d of start.drugs) startedRegimen = withDose(startedRegimen, d.substanceId, d.startMgPerDay)
  const timing = buildTiming({
    regimen: startedRegimen,
    nameOf: (id) => drugName(id, input.data),
    data: input.data,
    gaps,
  })
  const monitoring = buildMonitoring(input, hits, gaps)
  const avoid = buildAvoid(input, hits)
  const escalation = buildEscalation(input, chosen, hits, gaps)
  const tolerability = buildTolerability(input, chosen, hits, gaps)
  const outlook = buildOutlook(input, chosen, target, gaps)

  const conditions =
    (patient as { conditions?: string[] }).conditions ?? patient.inputs.comorbidities ?? []

  const plan: TreatmentPlan = {
    kind: 'treatment_plan',
    subject: {
      label: `${patient.inputs.age_years}-year-old ${patient.inputs.sex}`,
      ageYears: patient.inputs.age_years,
      sex: patient.inputs.sex,
      baselineSbp: target.baselineSbp,
      baselineDbp: target.baselineDbp,
      conditions: [...conditions],
    },
    regimen: chosen.regimen,
    regimenLabel: chosen.regimen.label,
    start,
    titration,
    target,
    timing,
    monitoring,
    avoid,
    escalation,
    tolerability,
    outlook,
    gaps,
    disclaimer: {
      title: DISCLAIMER_TITLE,
      paragraphs: DISCLAIMER_PARAGRAPHS,
      full: DISCLAIMER_FULL,
      short: DISCLAIMER_SHORT,
    },
  }

  if (chosenTier === 'OVERRIDE_REQUIRED') {
    const rank6 = new Set(hits.filter((h) => h.severityRank === 6).map((h) => h.ruleId))
    const allowedExists = ranked.some((o) => optionTier(o) === 'ALLOWED')
    plan.overrideRequired = {
      reason: allowedExists
        ? 'This plan is written for an arm that requires an explicit clinical override, and an arm without ' +
          'that requirement was available and ranked higher. Read the avoidance section before the plan itself.'
        : 'No evaluated regimen was free of an avoidance rule for this patient, so the plan is written for an ' +
          'arm that requires an explicit clinical override. Read the avoidance section before the plan itself. ' +
          'PilSim models five antihypertensives; an agent outside that set may be the right answer here, and ' +
          'this product cannot tell you which.',
      rules: avoid.items.filter((i) => rank6.has(i.ruleId)),
    }
  }

  if (chosenTier === 'DISQUALIFIED') {
    plan.noPlan = {
      reason:
        'Every evaluated regimen was disqualified for this patient. There is no treatment plan to write from ' +
        'this drug set; what follows is only what must be avoided and why.',
      blockedBy: avoid.items.filter((i) => i.absolute),
    }
    gaps.push({
      section: 'start',
      what: 'a regimen to start',
      why: 'No evaluated arm cleared the absolute contraindications that fired for this patient. PilSim models five antihypertensives; a drug outside that set may well be appropriate and this product cannot say so.',
    })
  }

  return plan
}

// ---------------------------------------------------------------------------
// Plain text, for copy / export / reading aloud
// ---------------------------------------------------------------------------

function textSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) return []
  return ['', title.toUpperCase(), '-'.repeat(title.length), ...lines]
}

function statementLines(statements: PlanStatement[], indent = ''): string[] {
  return statements.map((s) => `${indent}- ${s.text}`)
}

/**
 * Render a plan as plain text. The full disclaimer leads, per §8.4 placement rule 1.
 * Citations are appended under the sections that carry them so the text stands alone
 * when pasted into a note or read out.
 */
export function planToPlainText(plan: TreatmentPlan): string {
  const out: string[] = []

  out.push(plan.disclaimer.title)
  out.push('')
  for (const p of plan.disclaimer.paragraphs) {
    out.push(p)
    out.push('')
  }
  out.push('='.repeat(72))
  out.push(`TREATMENT PLAN — ${plan.regimenLabel}`)
  out.push(
    `Subject: ${plan.subject.label}, baseline ${Math.round(plan.subject.baselineSbp)}/${Math.round(plan.subject.baselineDbp)} mmHg` +
      (plan.subject.conditions.length > 0 ? `, ${plan.subject.conditions.join(', ')}` : ''),
  )
  out.push('='.repeat(72))

  if (plan.noPlan) {
    out.push('')
    out.push('NO PLAN COULD BE WRITTEN')
    out.push(plan.noPlan.reason)
  }
  if (plan.overrideRequired) {
    out.push('')
    out.push('OVERRIDE REQUIRED')
    out.push(plan.overrideRequired.reason)
  }

  const startLines: string[] = []
  for (const d of plan.start.drugs) {
    startLines.push(`${d.name}:`)
    startLines.push(...statementLines(d.statements, '  '))
    if (d.reasons.length > 0) startLines.push(...statementLines(d.reasons, '  '))
  }
  startLines.push(...statementLines(plan.start.statements))
  out.push(...textSection(plan.start.heading, startLines))

  const titrationLines: string[] = []
  for (const s of plan.titration.steps) {
    titrationLines.push(`${s.name} (${s.verdict.replace('_', ' ')}):`)
    titrationLines.push(...statementLines(s.statements, '  '))
    if (s.reconciliation) {
      titrationLines.push(
        s.reconciliation.agree
          ? '  Ranked recommendation, same two doses — agrees:'
          : '  Ranked recommendation, same two doses — DISAGREES:',
      )
      titrationLines.push(...statementLines(s.reconciliation.statements, '    '))
    }
  }
  titrationLines.push(...statementLines(plan.titration.statements))
  out.push(...textSection(plan.titration.heading, titrationLines))

  out.push(...textSection(plan.target.heading, statementLines(plan.target.statements)))

  // The outcome verdict leads the timing section. A reader who stops after one paragraph
  // must have read "no time of day is established to change outcomes", not a suggested hour.
  const timingLines: string[] = [
    'What the evidence says about OUTCOMES (read this first):',
    ...statementLines(plan.timing.outcomeEvidence.statements, '  '),
  ]
  for (const c of plan.timing.outcomeEvidence.citations) {
    const line = citationLine(c)
    if (line) timingLines.push(`    Source: ${line}`)
  }
  for (const d of plan.timing.drugs) {
    timingLines.push('')
    timingLines.push(
      `${d.name} — ${d.suggestedLabel} [${d.primaryKind}, ${d.confidence} confidence]` +
        (d.firstDose ? `; FIRST dose ${d.firstDose.label}` : ''),
    )
    timingLines.push(...statementLines(d.statements, '  '))
    timingLines.push(
      `  Coverage: ${r1(d.coverage.peakTroughRatio)}-fold peak-to-trough over ${r1(d.coverage.intervalH)} h, ` +
        `trough at ${Math.round(d.coverage.troughFractionOfPeak * 100)}% of peak (${d.coverage.sensitivity}).`,
    )
    for (const r of d.reasons) {
      const line = citationLine(r.citation)
      if (line) timingLines.push(`    [${r.kind}] Source: ${line}`)
    }
  }
  timingLines.push('')
  timingLines.push(...statementLines(plan.timing.statements))
  out.push(...textSection(plan.timing.heading, timingLines))

  const monLines: string[] = []
  for (const m of plan.monitoring.items) {
    monLines.push(
      `${m.label} — ${m.atDays.length > 0 ? `day ${m.atDays.join(', day ')}` : 'schedule not specified'}` +
        (m.actionRange ? ` (reference ${m.actionRange[0]}–${m.actionRange[1]})` : ''),
    )
    monLines.push(...statementLines(m.actionStatements, '  '))
  }
  monLines.push(...statementLines(plan.monitoring.statements))
  out.push(...textSection(plan.monitoring.heading, monLines))

  const avoidLines: string[] = []
  for (const a of plan.avoid.items) {
    avoidLines.push(`${a.absolute ? '[ABSOLUTE] ' : `[${a.severity}] `}${a.title}`)
    avoidLines.push(`  ${a.text}`)
    const c = citationLine(a.citation)
    if (c) avoidLines.push(`  Source: ${c}`)
  }
  avoidLines.push(...statementLines(plan.avoid.statements))
  out.push(...textSection(plan.avoid.heading, avoidLines))

  const escLines: string[] = []
  if (plan.escalation.addOn) {
    escLines.push(`Add a class: ${plan.escalation.addOn.label}`)
    escLines.push(...statementLines(plan.escalation.addOn.statements, '  '))
  }
  if (plan.escalation.doubling) {
    escLines.push(`Increase the dose: ${plan.escalation.doubling.label}`)
    escLines.push(...statementLines(plan.escalation.doubling.statements, '  '))
  }
  if (plan.escalation.alternatives.length > 0) {
    escLines.push('Evaluated alternatives, best first:')
    for (const a of plan.escalation.alternatives) {
      escLines.push(
        `  - ${a.label}${a.deltaSbp !== null ? ` — ${r1(a.deltaSbp)} mmHg` : ''}${a.score !== null ? `, composite ${a.score}` : ''}${a.tier === 'OVERRIDE_REQUIRED' ? ' [OVERRIDE REQUIRED]' : ''}`,
      )
      for (const s of a.statements) escLines.push(`      ${s.text}`)
    }
  }
  escLines.push(...statementLines(plan.escalation.statements))
  out.push(...textSection(plan.escalation.heading, escLines))

  const tolLines: string[] = []
  for (const s of plan.tolerability.swaps) {
    tolLines.push(`If ${s.label} occurs:`)
    tolLines.push(...statementLines(s.statements, '  '))
  }
  tolLines.push(...statementLines(plan.tolerability.statements))
  out.push(...textSection(plan.tolerability.heading, tolLines))

  const outlookLines = statementLines(plan.outlook.statements)
  outlookLines.push('')
  outlookLines.push('Class-level relative risk per 10 mmHg, from randomised trials (context, not a prediction):')
  for (const [endpoint, band] of Object.entries(plan.outlook.classLevelRelativeRisk.perTenMmHg)) {
    outlookLines.push(`  - ${humanise(endpoint)}: RR ${r2(band.point)} (${r2(band.lo)}–${r2(band.hi)})`)
  }
  outlookLines.push(`  ${plan.outlook.classLevelRelativeRisk.extrapolationWarning}`)
  out.push(...textSection(plan.outlook.heading, outlookLines))

  if (plan.gaps.length > 0) {
    const gapLines = plan.gaps.map((g) => `- [${g.section}] ${g.what} — ${g.why}`)
    out.push(...textSection('What this plan could not answer', gapLines))
  }

  out.push('')
  out.push(plan.disclaimer.short)
  return out.join('\n')
}
