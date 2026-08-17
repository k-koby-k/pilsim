/**
 * Slider metadata for the scorer's weights.
 *
 * The VALUES live in src/report/score.ts — this file never redefines them, it
 * only says what each one means and why the spec picked the number it did.
 * Keys are the scorer's own key names, so a slider write lands directly on the
 * `ScoreWeights` object the ranker reads.
 *
 * research/05-OUTPUT-REPORT-SPEC.md §4.2(b): "All eleven severity_weight values
 * are ESTIMATED ... Expose these as a tunable panel in the UI. A judge who can
 * move the sliders and watch the ranking change will trust the model more than
 * one who is handed a fixed number."
 */

import type { ScoreWeights } from '../../types'
import { defaultWeights } from './scoring'

export type WeightGroup = 'composite' | 'efficacy' | 'risk' | 'rule' | 'gate' | 'formulation' | 'lab'

export interface WeightSpec {
  key: string
  label: string
  group: WeightGroup
  min: number
  max: number
  step: number
  /** Keys that must move with this one — the scorer carries alias channels. */
  aliases?: string[]
  rationale: string
  ref: string
}

export const WEIGHT_SPECS: WeightSpec[] = [
  // --- §6.2 composite ------------------------------------------------------
  { key: 'efficacy', label: 'Efficacy E', group: 'composite', min: 0, max: 1, step: 0.01, ref: '§6.2',
    rationale: 'Composite = 0.40·E + 0.35·S + 0.25·A. Safety sits deliberately close to efficacy; the safety floor does the rest.' },
  { key: 'safety', label: 'Safety S', group: 'composite', min: 0, max: 1, step: 0.01, ref: '§6.2',
    rationale: 'A pure weighted sum would let a very effective, quite unsafe arm outrank a clearly safe one. §6.1 adds a floor for exactly that reason.' },
  { key: 'appropriateness', label: 'Appropriateness A', group: 'composite', min: 0, max: 1, step: 0.01, aliases: ['tolerability'], ref: '§2, §6.2',
    rationale: 'Carries "this worked beautifully but a guideline says another class is first-line here". It is what lets the product recommend rather than only reject.' },
  { key: 'appropriatenessBase', label: 'Appropriateness neutral prior', group: 'composite', min: 0, max: 100, step: 1, ref: '§2',
    rationale: 'A drug with no guideline statement either way lands at the midpoint rather than at either extreme.' },

  // --- §3.1 efficacy -------------------------------------------------------
  { key: 'eff_goalAttainment', label: 'Goal attainment', group: 'efficacy', min: 0, max: 1, step: 0.01, ref: '§3.1',
    rationale: 'Dominates because it is the endpoint trials and guidelines are written around, and because it is a population quantity — which is what separates this from a calculator.' },
  { key: 'eff_effectMagnitude', label: 'Effect magnitude', group: 'efficacy', min: 0, max: 1, step: 0.01, ref: '§3.1',
    rationale: 'Kept separate and smaller so a drug that overshoots in the sensitive tail does not outscore one that lands more patients in range.' },
  { key: 'eff_dailyCoverage', label: 'Daily coverage (trough:peak)', group: 'efficacy', min: 0, max: 1, step: 0.01, ref: '§3.1',
    rationale: 'Without it, an immediate-release and an extended-release arm with the same AUC score identically and "best formulation type" collapses.' },
  { key: 'eff_magnitudeCeilingMmHg', label: 'Magnitude ceiling (mmHg)', group: 'efficacy', min: 10, max: 50, step: 1, ref: '§3.1',
    rationale: 'Monotherapy in this set lands roughly −4 to −13 mmHg systolic; 25 leaves headroom for combination arms without saturating.' },
  { key: 'assumedDeltaSbpSdMmHg', label: 'Assumed ΔSBP SD, single twin', group: 'efficacy', min: 0, max: 20, step: 0.5, ref: '§7.1',
    rationale: 'Without it, goal attainment for a single twin is a step function of one number. Run a virtual population instead where the answer matters.' },

  // --- §4.2(b) all eleven adverse-event severity weights -------------------
  { key: 'risk_angioedema', label: 'Angioedema', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P2]',
    rationale: 'Rare; the lisinopril label carries a dedicated warning. Top of the ladder because it can kill. Frequency is already in excess_p — this is seriousness only.' },
  { key: 'risk_bronchospasm', label: 'Bronchospasm', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P4]',
    rationale: 'Metoprolol label: wheezing, dyspnoea. Airway compromise outranks cough and ankle swelling.' },
  { key: 'risk_hyperkalemia', label: 'Hyperkalaemia', group: 'risk', min: 0, max: 1, step: 0.01, aliases: ['risk_hyperkalemia_severe'], ref: '§4.2(b) [P2]',
    rationale: 'ATLAS: 6 % on high dose vs 4 % on low. Potassium disturbance can kill.' },
  { key: 'risk_acute_gfr_drop', label: 'Acute GFR drop', group: 'risk', min: 0, max: 1, step: 0.01, aliases: ['risk_aki'], ref: '§4.2(b) [P2]',
    rationale: 'ATLAS: creatinine increased 10 % vs 7 %.' },
  { key: 'risk_bradycardia', label: 'Bradycardia', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P4]',
    rationale: 'Among the most common reactions on the metoprolol label.' },
  { key: 'risk_hyponatremia', label: 'Hyponatraemia', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P10]',
    rationale: 'Direction sourced, magnitude NOT_FOUND — the weight is doing more work here than the data is.' },
  { key: 'risk_hypokalemia', label: 'Hypokalaemia', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P10]',
    rationale: 'ΔK −0.35 mmol/L at 25–50 mg, SECONDARY source.' },
  { key: 'risk_dizziness_orthostatic', label: 'Dizziness / orthostatic', group: 'risk', min: 0, max: 1, step: 0.01, aliases: ['risk_orthostatic_hypotension'], ref: '§4.2(b) [P2][P1]',
    rationale: 'ATLAS 19 % vs 12 %; amlodipine 1.1 / 3.4 / 3.4 % against placebo 1.5 %.' },
  { key: 'risk_hyperuricemia_gout', label: 'Hyperuricaemia / gout', group: 'risk', min: 0, max: 1, step: 0.01, aliases: ['risk_gout_flare'], ref: '§4.2(b) [P10]',
    rationale: '≈ +90 µmol/L at ≥50 mg hydrochlorothiazide, SECONDARY source. Harm arrives at half the dose of full benefit.' },
  { key: 'risk_peripheral_edema', label: 'Peripheral oedema', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P1]',
    rationale: '1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg against 0.6 % placebo. Low on the ladder because it does not kill — but frequent, and frequency enters through excess_p.' },
  { key: 'risk_cough', label: 'Cough', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b) [P5][P11]',
    rationale: '3.9 % on label, 5–35 % in the literature. The sourced range stays a range; collapsing it to a midpoint invents precision.' },
  { key: 'risk_default', label: 'Unlisted risk channel', group: 'risk', min: 0, max: 1, step: 0.01, ref: '§4.2(b)',
    rationale: 'Fallback for a risk channel the rules set that has no weight of its own.' },

  // --- §4.2(a) rule severity ladder ---------------------------------------
  { key: 'pen_rank3_minor', label: 'minor', group: 'rule', min: 0, max: 60, step: 1, ref: '§4.2(a)',
    rationale: 'The ladder is super-linear (3 → 9 → 25 → 45) so one major rule outweighs several minor ones. A linear ladder lets a pile of trivia equal a serious warning.' },
  { key: 'pen_rank4_moderate', label: 'moderate', group: 'rule', min: 0, max: 60, step: 1, ref: '§4.2(a)', rationale: 'Second rung of the super-linear ladder.' },
  { key: 'pen_rank5_major', label: 'major', group: 'rule', min: 0, max: 60, step: 1, ref: '§4.2(a)', rationale: 'Third rung. One of these should dominate any stack of minors.' },
  { key: 'pen_rank6_contraindicated_relative', label: 'relative contraindication', group: 'rule', min: 0, max: 100, step: 1, ref: '§4.2(a), §4.1',
    rationale: 'Plus a tier demotion — the arm ranks below every ALLOWED arm regardless of its score. Rank 7 is not on this ladder: it disqualifies and shows no numbers at all.' },

  // --- §6.1 ranking gate ---------------------------------------------------
  { key: 'safetyFloor', label: 'Safety floor', group: 'gate', min: 0, max: 80, step: 1, ref: '§6.1',
    rationale: 'Any arm scoring S below this is demoted beneath every arm above it, so a very effective, quite unsafe arm cannot win on weighted-sum arithmetic alone.' },

  // --- §5.1 formulation ----------------------------------------------------
  { key: 'form_troughToPeak', label: 'Trough-to-peak ratio', group: 'formulation', min: 0, max: 1, step: 0.01, ref: '§5.1',
    rationale: 'TPR and forgiveness are the two properties that genuinely differ between release profiles of the same molecule, so they carry half the weight between them.' },
  { key: 'form_fluctuation', label: 'Peak-trough fluctuation', group: 'formulation', min: 0, max: 1, step: 0.01, ref: '§5.1', rationale: 'Scored inverted — less fluctuation is better.' },
  { key: 'form_forgiveness', label: 'Forgiveness (missed dose)', group: 'formulation', min: 0, max: 1, step: 0.01, ref: '§5.1', rationale: 'Hours of maintained effect beyond the dosing interval after a missed dose.' },
  { key: 'form_adherence', label: 'Adherence burden', group: 'formulation', min: 0, max: 1, step: 0.01, ref: '§5.1', rationale: 'Capped at 0.20 because it is a behavioural assumption, not a pharmacokinetic one.' },

  // --- §4.2(c) lab excursion ----------------------------------------------
  { key: 'lab_serum_k_mmol_L', label: 'Serum K', group: 'lab', min: 0, max: 1, step: 0.05, ref: '§4.2(c)', rationale: 'Reference ranges come from data/patient_model.json, never hard-coded in the report.' },
  { key: 'lab_serum_na_mmol_L', label: 'Serum Na', group: 'lab', min: 0, max: 1, step: 0.05, ref: '§4.2(c)', rationale: 'Reference ranges come from data/patient_model.json.' },
  { key: 'lab_scr_mg_dL', label: 'Creatinine', group: 'lab', min: 0, max: 1, step: 0.05, ref: '§4.2(c)', rationale: 'Reference ranges come from data/patient_model.json.' },
  { key: 'lab_serum_urate_mg_dL', label: 'Urate', group: 'lab', min: 0, max: 1, step: 0.05, ref: '§4.2(c)', rationale: 'Reference ranges come from data/patient_model.json.' },
  { key: 'lab_fasting_glucose_mg_dL', label: 'Fasting glucose', group: 'lab', min: 0, max: 1, step: 0.05, ref: '§4.2(c)', rationale: 'Reference ranges come from data/patient_model.json.' },
]

export const GROUP_LABEL: Record<WeightGroup, string> = {
  composite: 'Composite objective — §6.2',
  efficacy: 'Efficacy sub-weights — §3.1',
  risk: 'Adverse-event severity — §4.2(b), all eleven',
  rule: 'Rule severity penalties — §4.2(a)',
  gate: 'Ranking gate — §6.1',
  formulation: 'Formulation sub-objective — §5.1',
  lab: 'Lab excursion weights — §4.2(c)',
}

/** Spec defaults, read from the scorer so the two can never drift apart. */
export const SPEC_DEFAULTS: ScoreWeights = defaultWeights()

export function setWeight(weights: ScoreWeights, spec: WeightSpec, value: number): ScoreWeights {
  const next: ScoreWeights = { ...weights, [spec.key]: value }
  for (const alias of spec.aliases ?? []) next[alias] = value
  return next
}
