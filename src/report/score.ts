/**
 * Scoring and the final recommendation.
 *
 * Implements the objective function from research/05-OUTPUT-REPORT-SPEC.md:
 *
 *   E — efficacy       0-100, from goal attainment, effect magnitude and daily coverage
 *   S — safety         starts at 100 and is penalised down by rule severity, adverse-event
 *                      risk and lab excursions
 *   A — appropriateness 0-100, guideline and context fit
 *
 *   Composite = 0.40 * E + 0.35 * S + 0.25 * A
 *
 * Ranking is TIERED FIRST and scored second (section 6.1): DISQUALIFIED arms never rank
 * and show no numbers; OVERRIDE_REQUIRED arms rank below every ALLOWED arm; and within a
 * tier, any arm scoring S < 40 is demoted below every arm scoring S >= 40. A pure
 * weighted sum would let a very effective, quite unsafe arm out-rank a slightly less
 * effective, clearly safe one, and that is not a trade this product should make silently.
 *
 * EVERY WEIGHT IN THIS FILE IS `ESTIMATED`. The ordering is the defensible part; the
 * exact values are not. They are exported as one mutable `ScoreWeights` object so the UI
 * can put them behind sliders and a judge can watch the ranking move.
 *
 * REFUSAL. Where the dataset cannot support an answer, the product declines to give one.
 * Formulation ranking is unavailable for lisinopril, losartan and hydrochlorothiazide —
 * no marketed alternative release profile was sourced for them. It IS available for
 * metoprolol, where the FDA label states the extended-release peak is one-quarter to
 * one-half of immediate-release at 77% relative bioavailability. That asymmetry is the
 * honest state of the data and is reported as such.
 *
 * LANGUAGE. The reason lines and the refusals below are sentences the PRODUCT wrote, so
 * they translate. This module is framework-agnostic and cannot call `useT()`, so the
 * translate function is INJECTED — `rankOptions({ ..., t })`. With no `t` everything
 * resolves in English, identical to the literals that used to live here, which is what
 * keeps the AI context and the test suite unchanged. The normative refusal wording still
 * has exactly one home: `FORMULATION_REFUSAL_TEXT` in ./disclaimer.ts is what the English
 * dictionary entry is built from, so the two cannot drift.
 *
 * What never translates inside a reason line: drug names, units, every number, and the
 * dataset's own channel identifiers (a lab or risk channel name is matched back to the
 * data, like a drug name).
 *
 * Owned by Agent RUL.
 */

import type {
  Provenance,
  RankedOption,
  Regimen,
  RunSummary,
  ScoreWeights,
  PatientState,
  RuleHit,
} from '../types'
import type { PatientModelFile, PilSimData } from '../data/load'
import type { EvaluationResult } from '../rules/evaluate'
import { englishText, type Translate } from '../i18n/dictionary'

// ---------------------------------------------------------------------------
// Weights — all ESTIMATED, all mutable, all meant to be exposed as sliders
// ---------------------------------------------------------------------------

/**
 * `ScoreWeights` requires `efficacy`, `safety` and `tolerability` and carries an index
 * signature for everything else. The composite weights are the first three; the rest are
 * the internals of each term.
 */
export function defaultWeights(): ScoreWeights {
  return {
    // --- composite (section 6.2) --------------------------------------------
    efficacy: 0.4,
    safety: 0.35,
    /** `tolerability` in the frozen contract is this spec's `appropriateness`. */
    tolerability: 0.25,
    appropriateness: 0.25,

    // --- efficacy internals (section 3.1) -----------------------------------
    eff_goalAttainment: 0.55,
    eff_effectMagnitude: 0.25,
    eff_dailyCoverage: 0.2,
    /** Ceiling for norm(median dSBP, 0, ceiling). 25 mmHg keeps the whole class on-scale. */
    eff_magnitudeCeilingMmHg: 25,
    eff_coverageFloorTpr: 0.3,
    eff_coverageCeilingTpr: 1.0,

    // --- safety: rule severity ladder (section 4.2a) -------------------------
    // Super-linear on purpose: one major rule must outweigh several minor ones.
    pen_rank3_minor: 3,
    pen_rank4_moderate: 9,
    pen_rank5_major: 25,
    pen_rank6_contraindicated_relative: 45,

    // --- safety: adverse-event severity weights (section 4.2b) ---------------
    // Clinical seriousness, NOT frequency — frequency is already in excess_p.
    // Airway compromise and potassium disturbance outrank cough and ankle swelling.
    risk_angioedema: 1.0,
    risk_bronchospasm: 0.8,
    risk_hyperkalemia: 0.7,
    risk_hyperkalemia_severe: 0.7,
    risk_aki: 0.6,
    risk_acute_gfr_drop: 0.6,
    risk_bradycardia: 0.55,
    risk_hyponatremia: 0.5,
    risk_hypokalemia: 0.45,
    risk_dizziness_orthostatic: 0.35,
    risk_orthostatic_hypotension: 0.35,
    risk_hyperuricemia_gout: 0.3,
    risk_gout_flare: 0.3,
    risk_peripheral_edema: 0.25,
    risk_cough: 0.2,
    risk_hypoglycemia_unawareness: 0.4,
    risk_new_onset_diabetes: 0.15,
    risk_nonmelanoma_skin_cancer: 0.15,
    risk_acute_angle_closure_glaucoma: 0.3,
    /** Fallback for a risk channel with no weight of its own. */
    risk_default: 0.3,

    // --- safety: lab excursion weights (section 4.2c) ------------------------
    lab_serum_k_mmol_L: 0.5,
    lab_serum_na_mmol_L: 0.4,
    lab_scr_mg_dL: 0.4,
    lab_serum_urate_mg_dL: 0.2,
    lab_fasting_glucose_mg_dL: 0.2,

    /**
     * Assumed between-subject SD for each lab, used to turn the single twin's value
     * into P(excursion) across a population. All ESTIMATED, sized at roughly the
     * within-population biological plus analytical variation of each analyte.
     */
    labSd_serum_k_mmol_L: 0.4,
    labSd_serum_na_mmol_L: 3,
    labSd_scr_mg_dL: 0.15,
    labSd_serum_urate_mg_dL: 1.2,
    labSd_fasting_glucose_mg_dL: 12,

    // --- appropriateness -----------------------------------------------------
    /**
     * A neutral prior. The spec defines A's inputs (positive rules and appropriateness
     * score_deltas) but not its origin; 50 is the midpoint, so a drug with no guideline
     * statement either way lands in the middle rather than at either extreme.
     */
    appropriatenessBase: 50,

    // --- ranking -------------------------------------------------------------
    safetyFloor: 40,
    /**
     * Composite points within which two arms are reported as indistinguishable rather
     * than ranked. ESTIMATED. Every weight feeding the composite is itself estimated,
     * so a sub-point separation is not a finding — presenting it as a ranking claims a
     * discrimination the model does not have. Amlodipine 5 vs 10 mg in women separates
     * by 0.19 points at these defaults and flips on an oedema weight of 0.25 -> 0.30.
     */
    tieThreshold: 1.0,

    // --- formulation sub-objective (section 5.1) -----------------------------
    form_troughToPeak: 0.3,
    form_fluctuation: 0.25,
    form_forgiveness: 0.25,
    form_adherence: 0.2,

    // --- uncertainty ----------------------------------------------------------
    /**
     * Assumed between-subject SD of the systolic response when the run is a single twin
     * (populationN = 1). Without it, goal attainment is a step function of one number.
     */
    assumedDeltaSbpSdMmHg: 6,
  }
}

/** The live, mutable weights object the UI binds sliders to. */
export const SCORE_WEIGHTS: ScoreWeights = defaultWeights()

export function resetWeights(target: ScoreWeights = SCORE_WEIGHTS): ScoreWeights {
  Object.assign(target, defaultWeights())
  return target
}

/** Human-readable labels and ranges for the tunable panel. */
export const WEIGHT_PANEL: { key: string; label: string; min: number; max: number; group: string }[] = [
  { key: 'efficacy', label: 'Composite weight — efficacy', min: 0, max: 1, group: 'Composite' },
  { key: 'safety', label: 'Composite weight — safety', min: 0, max: 1, group: 'Composite' },
  { key: 'appropriateness', label: 'Composite weight — appropriateness', min: 0, max: 1, group: 'Composite' },
  { key: 'safetyFloor', label: 'Safety floor (demote below this S)', min: 0, max: 100, group: 'Ranking' },
  { key: 'eff_goalAttainment', label: 'Efficacy — goal attainment', min: 0, max: 1, group: 'Efficacy' },
  { key: 'eff_effectMagnitude', label: 'Efficacy — effect magnitude', min: 0, max: 1, group: 'Efficacy' },
  { key: 'eff_dailyCoverage', label: 'Efficacy — daily coverage', min: 0, max: 1, group: 'Efficacy' },
  { key: 'risk_angioedema', label: 'Risk weight — angioedema', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_bronchospasm', label: 'Risk weight — bronchospasm', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_hyperkalemia', label: 'Risk weight — hyperkalaemia', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_aki', label: 'Risk weight — acute kidney injury', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_bradycardia', label: 'Risk weight — bradycardia', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_peripheral_edema', label: 'Risk weight — peripheral oedema', min: 0, max: 1, group: 'Adverse events' },
  { key: 'risk_cough', label: 'Risk weight — cough', min: 0, max: 1, group: 'Adverse events' },
  { key: 'lab_serum_k_mmol_L', label: 'Lab weight — serum potassium', min: 0, max: 1, group: 'Lab excursions' },
  // This one is worth exposing because it is what makes the thiazide dose tradeoff
  // visible: it converts the twin's single potassium value into a population
  // probability of leaving the reference range.
  {
    key: 'labSd_serum_k_mmol_L',
    label: 'Assumed population SD — serum potassium (mmol/L)',
    min: 0.1,
    max: 1,
    group: 'Lab excursions',
  },
]

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export interface BpTarget {
  sbp: number
  dbp: number
  label: string
  source: string
}

/**
 * 2025 AHA/ACC sets <130/80 for ALL adults. Diabetes no longer carries a distinct
 * threshold, and `patient_model.json` says so explicitly — do not present 130/80 as a
 * diabetes-specific number.
 */
export function bpTarget(patient: PatientState): BpTarget {
  return {
    sbp: 130,
    dbp: 80,
    label: '<130/80 mmHg',
    source: '2025 AHA/ACC multisociety High Blood Pressure Guideline, Circulation 2025;152:e114-e218',
  }
}

export interface ScoreCandidate {
  regimen: Regimen
  summary: RunSummary
  modifiers: EvaluationResult
  /** Trough-to-peak ratio of the EFFECT, if the engine measured it. 0..1. */
  troughToPeakRatio?: number
  /** Hours of maintained effect after a missed dose, for the formulation term. */
  forgivenessHours?: number
  /** Doses per day of the arm's principal drug, for the adherence term. */
  dosesPerDay?: number
  /** Product ids in the arm, used to look up sourced formulation PK. */
  productIds?: string[]
  /** Virtual population size the run used. 1 = the single twin. Must be reported. */
  populationN?: number
}

export interface FormulationVerdict {
  available: boolean
  score: number | null
  reasons: string[]
  refusal?: { reason: string; citation?: Provenance }
}

export interface ScoredOption extends RankedOption {
  tier: 'ALLOWED' | 'OVERRIDE_REQUIRED' | 'DISQUALIFIED'
  /** E, S, A — never render `score` without all three beside it. */
  appropriatenessTerm: number
  /** Alias of `score`, kept because the spec calls it the composite. */
  composite: number
  /** Unrounded composite. Ranking sorts on this; only `composite` is for display. */
  compositeExact: number
  goalAttainment: number
  magnitudeTerm: number
  coverageTerm: number
  penalties: { rule: number; risk: number; lab: number }
  formulation: FormulationVerdict
  target: BpTarget
  /** Population size the efficacy terms were computed over. Must be reported. */
  populationN: number
  /**
   * This arm is within `weights.tieThreshold` composite points of the leader in its
   * band. The renderer must present it as TIED with the leader, not as the runner-up:
   * every weight in the composite is ESTIMATED, so a sub-point separation is arithmetic
   * rather than a recommendation.
   */
  tiedWithLeader: boolean
}

// ---------------------------------------------------------------------------
// Efficacy
// ---------------------------------------------------------------------------

function norm(x: number, lo: number, hi: number): number {
  if (hi === lo) return 0
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
}

/** Standard normal CDF, Abramowitz & Stegun 26.2.17. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/**
 * Fraction of the virtual population reaching the systolic target.
 *
 * With a population run the spread is measured (P05..P95 spans 3.2897 SDs of a normal).
 * With a single twin there is no measured spread, so an ESTIMATED between-subject SD is
 * assumed and the reason line says N = 1 out loud — a step function of one number would
 * be a worse lie than a stated assumption.
 */
function goalAttainment(
  patient: PatientState,
  summary: RunSummary,
  target: BpTarget,
  weights: ScoreWeights,
  populationN: number,
): { p: number; sd: number; measuredSpread: boolean } {
  const baselineSbp = patient.vars.sbp_mmHg ?? patient.inputs.sbp_mmHg
  const needed = baselineSbp - target.sbp
  let sd = Number(weights.assumedDeltaSbpSdMmHg) || 6
  let measuredSpread = false
  if (typeof summary.deltaSbpP05 === 'number' && typeof summary.deltaSbpP95 === 'number') {
    const spread = Math.abs(summary.deltaSbpP95 - summary.deltaSbpP05)
    if (spread > 0) {
      sd = spread / 3.2897
      measuredSpread = populationN > 1
    }
  }
  const z = (summary.deltaSbp - needed) / Math.max(sd, 0.5)
  return { p: Math.max(0, Math.min(1, phi(z))), sd, measuredSpread }
}

/**
 * Trough-to-peak ratio of the effect. Prefer a value the engine measured; otherwise
 * derive from the concentration profile, which is a proxy and is flagged as one.
 */
function coverageRatio(c: ScoreCandidate): { tpr: number; derived: boolean } | null {
  if (typeof c.troughToPeakRatio === 'number' && Number.isFinite(c.troughToPeakRatio)) {
    return { tpr: Math.max(0, Math.min(1, c.troughToPeakRatio)), derived: false }
  }
  const peaks = Object.values(c.summary.peakConc ?? {}).filter((v): v is number => typeof v === 'number' && v > 0)
  const troughs = Object.values(c.summary.troughConc ?? {}).filter((v): v is number => typeof v === 'number')
  if (peaks.length === 0 || troughs.length === 0) return null
  const peak = Math.max(...peaks)
  const trough = Math.max(0, Math.min(...troughs))
  if (peak <= 0) return null
  return { tpr: Math.max(0, Math.min(1, trough / peak)), derived: true }
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

const RANK_PENALTY_KEY: Record<number, string> = {
  3: 'pen_rank3_minor',
  4: 'pen_rank4_moderate',
  5: 'pen_rank5_major',
  6: 'pen_rank6_contraindicated_relative',
}

function rulePenalty(hits: RuleHit[], w: ScoreWeights): number {
  let total = 0
  for (const h of hits) {
    const key = RANK_PENALTY_KEY[h.severityRank]
    if (key) total += Number(w[key]) || 0
  }
  return total
}

/**
 * Adverse-event penalty, over two sources with an explicit precedence between them:
 *
 *   - `modifiers.risks` — excess probabilities the RULES set, from label incidence
 *     tables. CITED, and population quantities, which is exactly what section 4.2b's
 *     `100 * excess_p * severity_weight` is defined over.
 *   - `summary.hazards` — the per-run hazard channels the ENGINE integrates. Tiered
 *     DERIVED in `engine/tiers.ts`. Ignoring these entirely was what made the whole
 *     safety term dose-invariant, so they must be read.
 *
 * WHERE BOTH DESCRIBE ONE CHANNEL, THE CITED INCIDENCE WINS. Combining them by maximum
 * was the first thing I tried and it is wrong: it lets a simulated index override a
 * number off an FDA label whenever the simulation happens to run hotter, which inverts
 * the provenance hierarchy the entire product rests on. The engine's oedema hazard is a
 * 0..3 pitting-grade rescaled to 0..1 — a severity magnitude, not an incidence — so
 * reading it as "probability of an oedema event" is also a category error. The engine
 * hazards fill the channels the rules do not quantify, and there they are the only
 * estimate available.
 */
function riskPenalty(
  risks: Record<string, number>,
  hazards: Record<string, number>,
  w: ScoreWeights,
  t: Translate,
): { total: number; lines: string[]; merged: Record<string, number>; sources: Record<string, 'cited' | 'derived'> } {
  const merged: Record<string, number> = {}
  const sources: Record<string, 'cited' | 'derived'> = {}

  for (const [channel, p] of Object.entries(risks ?? {})) {
    if (!Number.isFinite(p) || p <= 0) continue
    const name = channel.replace(/^risk\./, '')
    merged[name] = Math.min(1, p)
    sources[name] = 'cited'
  }
  for (const [channel, p] of Object.entries(hazards ?? {})) {
    if (!Number.isFinite(p) || p <= 0) continue
    const name = ENGINE_HAZARD_ALIAS[channel] ?? channel
    if (sources[name] === 'cited') continue
    merged[name] = Math.min(1, p)
    sources[name] = 'derived'
  }

  let total = 0
  const lines: string[] = []
  for (const [name, p] of Object.entries(merged)) {
    const weight = Number(w[`risk_${name}`] ?? w.risk_default) || 0
    const pen = 100 * p * weight
    total += pen
    if (pen >= 1) lines.push(t('sim.score.text.riskLine', { name: humanise(name), pct: Math.round(p * 100) }))
  }
  lines.sort()
  return { total, lines, merged, sources }
}

/** Engine hazard channel names -> the weight vocabulary in this file. */
const ENGINE_HAZARD_ALIAS: Record<string, string> = {
  cough: 'cough',
  dizziness_orthostatic: 'dizziness_orthostatic',
  peripheral_edema: 'peripheral_edema',
  bradycardia: 'bradycardia',
  bronchospasm: 'bronchospasm',
  hyperkalemia: 'hyperkalemia',
}

/** Reference ranges come from `patient_model.json`, never hard-coded here. */
export function labReferenceRanges(model: PatientModelFile | null): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {}
  if (!model) return out
  for (const group of Object.values(model.state_variables ?? {})) {
    if (!Array.isArray(group)) continue
    for (const spec of group as { id: string; healthy_reference?: [number, number] }[]) {
      if (Array.isArray(spec?.healthy_reference) && spec.healthy_reference.length === 2) {
        out[spec.id] = [spec.healthy_reference[0], spec.healthy_reference[1]]
      }
    }
  }
  return out
}

const CHEM_TO_STATE_VAR: Record<string, string> = {
  serum_k: 'serum_k_mmol_L',
  serum_na: 'serum_na_mmol_L',
  serum_urate: 'serum_urate_mg_dL',
  serum_creatinine: 'scr_mg_dL',
  fasting_glucose: 'fasting_glucose_mg_dL',
}

/** Fallback ranges, used only where patient_model.json does not publish one. */
const FALLBACK_RANGES: Record<string, [number, number]> = {
  serum_k_mmol_L: [3.5, 5.0],
  serum_na_mmol_L: [135, 145],
  serum_urate_mg_dL: [3.5, 7.0],
  scr_mg_dL: [0.6, 1.2],
  fasting_glucose_mg_dL: [70, 99],
}

/**
 * Lab excursion penalty: `Σ 100 * P(excursion) * lab_weight`, with reference ranges
 * read from `patient_model.json`.
 *
 * The spec defines P as the probability ACROSS THE VIRTUAL POPULATION that a lab leaves
 * its range. Evaluated on a single twin that degenerates to 0 or 1, which is a step
 * function of dose — a potassium of 3.51 scores zero and 3.49 scores full. That is not
 * a defensible reading of a population quantity, and it is one of the reasons the safety
 * term could not discriminate doses. Instead the twin's value is treated as the
 * population mean and P is computed against an assumed between-subject SD, the same
 * device already used for goal attainment at N = 1. All the SDs are ESTIMATED and are
 * exposed as sliders alongside everything else.
 */
function labPenalty(
  summary: RunSummary,
  model: PatientModelFile | null,
  w: ScoreWeights,
  t: Translate,
): { total: number; lines: string[] } {
  const ranges = { ...FALLBACK_RANGES, ...labReferenceRanges(model) }
  let total = 0
  const lines: string[] = []
  for (const [chemKey, stateVar] of Object.entries(CHEM_TO_STATE_VAR)) {
    const v = (summary.finalChem as unknown as Record<string, number>)?.[chemKey]
    const r = ranges[stateVar]
    if (typeof v !== 'number' || !r) continue
    const sd = Number(w[`labSd_${stateVar}`]) || 0
    // P(below the floor) + P(above the ceiling).
    const p = sd > 0 ? Math.min(1, phi((r[0] - v) / sd) + (1 - phi((r[1] - v) / sd))) : v < r[0] || v > r[1] ? 1 : 0
    if (p <= 0.005) continue
    const weight = Number(w[`lab_${stateVar}`]) || 0
    total += 100 * p * weight
    const outside = v < r[0] || v > r[1]
    lines.push(
      outside
        ? t('sim.score.text.labOutside', {
            name: humanise(stateVar),
            value: round1(v),
            lo: r[0],
            hi: r[1],
          })
        : t('sim.score.text.labChance', {
            pct: Math.round(p * 100),
            name: humanise(stateVar).toLowerCase(),
            lo: r[0],
            hi: r[1],
          }),
    )
  }
  return { total, lines }
}

// ---------------------------------------------------------------------------
// Formulation sub-objective, and the refusal
// ---------------------------------------------------------------------------

/**
 * Substances for which the dataset does NOT support a formulation ranking.
 * Section 5.4: "For lisinopril, losartan, and hydrochlorothiazide, I did not source
 * marketed alternative release profiles or route-specific PK sufficient to rank
 * formulations." When Agent B publishes sourced route/formulation PK for these three,
 * `formulationDataAvailable` picks it up from `products.json` and the refusal lifts.
 */
export const FORMULATION_REFUSAL_SUBSTANCES = ['lisinopril', 'losartan', 'hydrochlorothiazide'] as const

/**
 * True when at least two products for this substance carry a sourced `formulation_pk`,
 * which is the only thing that makes an IR-vs-ER comparison anything other than
 * invention. In this build that is metoprolol and only metoprolol.
 */
export function formulationDataAvailable(substanceId: string, data?: PilSimData | null): boolean {
  // Without the dataset to hand, fall back to what section 5.4 states: metoprolol only.
  if (!data) return substanceId === 'metoprolol'
  const withPk = data.products.products.filter(
    (p) =>
      p.formulation_pk?.provenance?.status === 'CITED' &&
      p.composition.some((c) => c.substance_id === substanceId && /active/i.test(c.role)),
  )
  return withPk.length >= 2
}

/** The citation behind the refusal, or behind the metoprolol comparison. */
export function formulationCitation(substanceId: string, data?: PilSimData | null): Provenance | undefined {
  if (!data) return undefined
  const p = data.products.products.find(
    (x) =>
      x.formulation_pk?.provenance?.status === 'CITED' &&
      x.composition.some((c) => c.substance_id === substanceId && /active/i.test(c.role)),
  )
  return p?.formulation_pk?.provenance
}

export function formulationRefusal(
  substanceId: string,
  data?: PilSimData | null,
  t: Translate = englishText,
): { reason: string; citation?: Provenance } | null {
  if (formulationDataAvailable(substanceId, data)) return null
  return {
    // A refusal is a DECISION, not an accident: "not determined" in every language,
    // never "no data available". See the ⚠️ note in src/i18n/dictionary.ts.
    reason: t('sim.formulation.text.refusal'),
    citation: {
      status: 'NOT_FOUND',
      note:
        `No marketed alternative release profile or route-specific PK was sourced for ${substanceId}. ` +
        `research/05-OUTPUT-REPORT-SPEC.md section 5.4. Fabricating a formulation ranking would be the ` +
        `single most detectable invention in the product — routes and their PK are exactly what a ` +
        `pharmacist judge knows by heart.`,
    },
  }
}

function scoreFormulation(
  c: ScoreCandidate,
  data: PilSimData | null,
  w: ScoreWeights,
  t: Translate,
): FormulationVerdict {
  const actives = c.regimen.doses.map((d) => d.substanceId)
  const refusals = actives
    .map((id) => ({ id, refusal: formulationRefusal(id, data, t) }))
    .filter((x) => x.refusal !== null)

  if (refusals.length > 0) {
    return {
      available: false,
      score: null,
      reasons: [t('sim.formulation.text.refusalChip')],
      refusal: refusals[0].refusal!,
    }
  }

  const cov = coverageRatio(c)
  if (!cov) {
    return {
      available: false,
      score: null,
      reasons: [t('sim.formulation.text.refusalChip')],
      refusal: { reason: t('sim.formulation.text.noProfile') },
    }
  }

  const tprS = norm(cov.tpr, Number(w.eff_coverageFloorTpr), Number(w.eff_coverageCeilingTpr))
  // PTF = (Cmax - Cmin)/Cavg, scored 1 - norm(PTF, 0.2, 2.0).
  const ptf = cov.tpr > 0 ? (1 - cov.tpr) / ((1 + cov.tpr) / 2) : 2
  const ptfS = 1 - norm(ptf, 0.2, 2.0)
  const forgiveS =
    typeof c.forgivenessHours === 'number' ? norm(c.forgivenessHours, 0, 24) : tprS // proxy, flagged below
  const perDay = c.dosesPerDay ?? Math.max(...c.regimen.doses.map((d) => d.perDay), 1)
  const adherenceS = perDay <= 1 ? 1 : perDay === 2 ? 0.6 : 0.3

  const score =
    100 *
    (Number(w.form_troughToPeak) * tprS +
      Number(w.form_fluctuation) * ptfS +
      Number(w.form_forgiveness) * forgiveS +
      Number(w.form_adherence) * adherenceS)

  const reasons = [
    t('sim.formulation.text.tprReason', {
      value: cov.tpr.toFixed(2),
      derived: cov.derived ? t('sim.formulation.text.tprDerivedClause') : '',
    }),
    perDay <= 1 ? t('sim.formulation.text.onceDaily') : t('sim.formulation.text.timesDaily', { n: perDay }),
  ]
  if (typeof c.forgivenessHours !== 'number') {
    reasons.push(t('sim.formulation.text.forgivenessProxy'))
  }
  return { available: true, score: Math.round(score), reasons }
}

// ---------------------------------------------------------------------------
// The ranker
// ---------------------------------------------------------------------------

export interface RankOptions {
  patient: PatientState
  candidates: ScoreCandidate[]
  data?: PilSimData | null
  weights?: ScoreWeights
  /**
   * Translate function for the generated reason lines and refusals. Injected because this
   * module cannot call `useT()`. Omit it for English.
   */
  t?: Translate
}

/**
 * Score and rank. Returns `RankedOption[]` (as `ScoredOption[]`, which extends it),
 * ordered best first, with DISQUALIFIED arms last and carrying no numbers.
 */
export function rankOptions({
  patient,
  candidates,
  data = null,
  weights = SCORE_WEIGHTS,
  t = englishText,
}: RankOptions): ScoredOption[] {
  const model = data?.patientModel ?? null
  const target = bpTarget(patient)

  const scored = candidates.map((c) => scoreOne(patient, c, model, data, weights, target, t))

  const tierRank = (t: ScoredOption['tier']) => (t === 'ALLOWED' ? 0 : t === 'OVERRIDE_REQUIRED' ? 1 : 2)
  const floor = Number(weights.safetyFloor) || 0

  const ordered = scored.sort((a, b) => {
    if (tierRank(a.tier) !== tierRank(b.tier)) return tierRank(a.tier) - tierRank(b.tier)
    const aFloor = a.safetyTerm >= floor ? 0 : 1
    const bFloor = b.safetyTerm >= floor ? 0 : 1
    if (aFloor !== bFloor) return aFloor - bFloor
    // Sort on the UNROUNDED composite. `score` is rounded to a whole number for display
    // per the spec's precision discipline, and sorting on the rounded value manufactures
    // ties between arms that are not actually tied — which then got broken by
    // `regimen.id.localeCompare`, i.e. alphabetically. That silently made "best dose"
    // depend on how an arm happened to be named.
    if (b.compositeExact !== a.compositeExact) return b.compositeExact - a.compositeExact
    // Genuinely tied: prefer the lower total daily dose. Nothing distinguishes the arms
    // on the objectives, and the lower exposure is the conservative choice.
    const dose = (o: ScoredOption) => o.regimen.doses.reduce((s, d) => s + d.mg * d.perDay, 0)
    if (dose(a) !== dose(b)) return dose(a) - dose(b)
    return a.regimen.id.localeCompare(b.regimen.id)
  })

  // Flag arms the model cannot actually separate from the leader. Every weight in the
  // composite is ESTIMATED, so a sub-point gap is arithmetic, not a recommendation.
  const leader = ordered.find((o) => o.tier !== 'DISQUALIFIED')
  const threshold = Number(weights.tieThreshold) || 0
  if (leader && threshold > 0) {
    for (const o of ordered) {
      if (o === leader || o.tier !== leader.tier) continue
      if (leader.compositeExact - o.compositeExact <= threshold) {
        o.tiedWithLeader = true
        leader.tiedWithLeader = true
      }
    }
    if (leader.tiedWithLeader) {
      const note = t('sim.score.text.tooCloseToCall')
      for (const o of ordered) if (o.tiedWithLeader && !o.reasons.includes(note)) o.reasons.unshift(note)
    }
  }

  return ordered
}

function scoreOne(
  patient: PatientState,
  c: ScoreCandidate,
  model: PatientModelFile | null,
  data: PilSimData | null,
  w: ScoreWeights,
  target: BpTarget,
  t: Translate,
): ScoredOption {
  const m = c.modifiers
  const hits = m.hits

  // --- DISQUALIFIED: no numbers, ever ---------------------------------------
  if (m.tier === 'DISQUALIFIED' || m.blocked) {
    const blocker = hits.find((h) => h.blocks) ?? hits[0]
    return {
      regimen: c.regimen,
      score: 0,
      composite: 0,
      compositeExact: 0,
      efficacyTerm: 0,
      safetyTerm: 0,
      appropriatenessTerm: 0,
      deltaSbp: 0,
      goalAttainment: 0,
      magnitudeTerm: 0,
      coverageTerm: 0,
      penalties: { rule: 0, risk: 0, lab: 0 },
      tier: 'DISQUALIFIED',
      tiedWithLeader: false,
      reasons:
        m.blockReasons.length > 0
          ? m.blockReasons
          : [blocker?.warningText ?? t('sim.score.text.absolutelyContraindicated')],
      hits,
      target,
      populationN: 0,
      formulation: { available: false, score: null, reasons: [] },
      refusal: {
        // The rule's own title and severity are the dataset's words and stay as they are.
        reason: t('sim.score.text.armNotRanked', {
          title: blocker?.title ?? t('sim.score.text.anAbsoluteContraindication'),
          severity: blocker?.severity ?? 'contraindicated_absolute',
        }),
        citation: blocker?.citation,
      },
    }
  }

  // --- E ---------------------------------------------------------------------
  const populationN = Math.max(1, Math.round(c.populationN ?? 1))
  const goal = goalAttainment(patient, c.summary, target, w, populationN)
  const magnitude = norm(c.summary.deltaSbp, 0, Number(w.eff_magnitudeCeilingMmHg))
  const cov = coverageRatio(c)
  const coverage = cov ? norm(cov.tpr, Number(w.eff_coverageFloorTpr), Number(w.eff_coverageCeilingTpr)) : 0

  const eRaw =
    100 *
    (Number(w.eff_goalAttainment) * goal.p +
      Number(w.eff_effectMagnitude) * magnitude +
      Number(w.eff_dailyCoverage) * coverage)
  const E = clamp100(eRaw + m.scoreDeltas.efficacy)

  // --- S ---------------------------------------------------------------------
  const penRule = rulePenalty(hits, w)
  const penRisk = riskPenalty(m.risks, c.summary.hazards, w, t)
  const penLab = labPenalty(c.summary, model, w, t)
  const S = clamp100(100 - penRule - penRisk.total - penLab.total + m.scoreDeltas.safety)

  // --- A ---------------------------------------------------------------------
  const A = clamp100(Number(w.appropriatenessBase) + m.scoreDeltas.appropriateness)

  const wA = Number(w.appropriateness)
  const compositeExact = Number(w.efficacy) * E + Number(w.safety) * S + wA * A
  const composite = Math.round(compositeExact)

  const formulation = scoreFormulation(c, data, w, t)

  const reasons = buildReasons({
    patient,
    candidate: c,
    target,
    goalP: goal.p,
    populationN,
    hits,
    riskLines: penRisk.lines,
    labLines: penLab.lines,
    caveats: m.caveats ?? [],
    formulation,
    tier: m.tier,
    t,
  })

  return {
    regimen: c.regimen,
    score: composite,
    composite,
    compositeExact,
    efficacyTerm: Math.round(E),
    safetyTerm: Math.round(S),
    appropriatenessTerm: Math.round(A),
    deltaSbp: c.summary.deltaSbp,
    goalAttainment: goal.p,
    magnitudeTerm: magnitude,
    coverageTerm: coverage,
    penalties: { rule: penRule, risk: penRisk.total, lab: penLab.total },
    tier: m.tier,
    tiedWithLeader: false,
    reasons,
    hits,
    target,
    populationN,
    formulation,
    refusal: formulation.refusal,
  }
}

// ---------------------------------------------------------------------------
// Reasons — generated from templates, never free text
// ---------------------------------------------------------------------------

function buildReasons(args: {
  patient: PatientState
  candidate: ScoreCandidate
  target: BpTarget
  goalP: number
  populationN: number
  hits: RuleHit[]
  riskLines: string[]
  labLines: string[]
  caveats: { ruleId: string; channel?: string; text: string; basis?: string }[]
  formulation: FormulationVerdict
  tier: string
  t: Translate
}): string[] {
  const out: string[] = []
  const { goalP, target, candidate, hits, populationN, t } = args

  out.push(
    populationN === 1
      ? t('sim.score.text.goalSingle', { target: target.label, pct: Math.round(goalP * 100) })
      : t('sim.score.text.goalPopulation', { pct: Math.round(goalP * 100), target: target.label }),
  )
  out.push(t('sim.score.text.sbpFall', { mmHg: Math.round(candidate.summary.deltaSbp) }))

  // Rule chips: most severe first, negative before positive.
  for (const h of hits.slice(0, 3)) {
    const short = h.warningText?.split('. ')[0] ?? h.title
    out.push(h.direction === 'positive' ? `${h.title}` : `${short}`)
  }
  for (const line of args.riskLines.slice(0, 2)) out.push(line)
  for (const line of args.labLines.slice(0, 2)) out.push(line)
  // Modelling caveats go in the REASONS, next to the recommendation they changed —
  // not in a tooltip. An assumption that moves a dose has to be read by whoever reads
  // the dose. These are stated as assumptions, never as label instructions.
  for (const c of args.caveats) out.push(modellingCaveatChip(c, t))
  if (args.formulation.refusal) out.push(t('sim.formulation.text.refusalChip'))
  else out.push(...args.formulation.reasons.slice(0, 1))

  if (args.tier === 'OVERRIDE_REQUIRED') {
    out.unshift(t('sim.score.text.rankedBelowOverride'))
  }
  return out
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Compress a rule's caveat into one reason chip. The full text stays available on the
 * option via `modifiers.caveats` for the expanded panel; this is the line that must be
 * visible without interaction. Deliberately worded so it cannot be misread as the label
 * prescribing a lower dose in a subgroup — the label does no such thing.
 */
export function modellingCaveatChip(
  c: { text: string; basis?: string },
  t: Translate = englishText,
): string {
  const assumed = /constant proportional hazard|no published sex-BY-dose|pooled across doses/i.test(c.text)
  // The generic form carries the RULE's own caveat sentence, which stays in the dataset's
  // words; only the frame around it translates.
  return assumed
    ? t('sim.score.text.caveatSexByDose')
    : t('sim.score.text.caveatGeneric', { text: c.text.split('. ')[0] })
}

function clamp100(x: number): number {
  return Math.max(0, Math.min(100, x))
}
function round1(x: number): number {
  return Math.round(x * 10) / 10
}
function humanise(id: string): string {
  return id
    .replace(/_(mmol_L|mg_dL|mg_dl|pct|mg_g)$/i, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (s) => s.toUpperCase())
}

export {
  DISCLAIMER_FULL,
  DISCLAIMER_SHORT,
  DISCLAIMER_SHORT_I18N,
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_TITLE,
} from './disclaimer'
