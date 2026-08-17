/**
 * The seeded subject library.
 *
 * WHY THESE TEN. Every card here changes the answer. Each one switches on a comorbidity
 * preset that exists in `data/patient_model.json` and that the rules engine actually
 * evaluates, or a genotype the twin actually reads — so opening a subject and running it
 * produces a visibly different recommendation, a fired rule, a blocked drug or a shifted
 * state variable. A scenario the engine cannot see would render beautifully and mean
 * nothing, and a clinician looking at this would notice inside a minute.
 *
 * The clinical definitions are kept identical to the benchmark archetypes in
 * `src/ui/simulation/presets.ts` (Agent UI-C) so that "the elderly patient" and "the stage 3
 * patient" mean the same thing on both pages. They are copied rather than imported: this
 * page must not break when that file is being edited by another agent, and a subject
 * library is a different thing from a benchmark arm even when the numbers agree.
 *
 * `interesting` is the one line a reader gets on the card. It says what the subject
 * DEMONSTRATES, in plain words, because a grid of ten hypertensive adults is otherwise
 * indistinguishable.
 */

import type { PatientInputs } from '../../types'

export interface SubjectSeed {
  id: string
  label: string
  /** What this subject demonstrates, in one plain sentence. Shown on the card. */
  interesting: string
  inputs: PatientInputs
}

/** Shared starting point: a 55-year-old with stage 2 hypertension and nothing else. */
const base = (over: Partial<PatientInputs>): PatientInputs => ({
  age_years: 55,
  sex: 'male',
  weight_kg: 82,
  height_cm: 175,
  sbp_mmHg: 152,
  dbp_mmHg: 94,
  hr_bpm: 74,
  serum_creatinine_mg_dl: 0.95,
  comorbidities: [],
  cyp2d6: 'normal',
  cyp2d6_activity_score: 2.0,
  cyp2c9: 'normal',
  cyp2c9_activity_score: 2.0,
  pregnant: false,
  ...over,
})

/** Comorbidity ids are the preset keys in data/patient_model.json. */
export const SUBJECT_SEEDS: SubjectSeed[] = [
  {
    id: 'seed_baseline',
    label: 'Uncomplicated hypertension',
    interesting: 'The comparison arm. Nothing is blocked and nothing is compelled, so every other card is read against this one.',
    inputs: base({}),
  },
  {
    id: 'seed_t2dm',
    label: 'Type 2 diabetes',
    interesting: 'ACE inhibitor and ARB preference applies only with albuminuria, reduced eGFR or coronary disease — not to diabetes alone.',
    inputs: base({ age_years: 58, weight_kg: 94, sbp_mmHg: 156, dbp_mmHg: 92, comorbidities: ['t2dm'] }),
  },
  {
    id: 'seed_ckd',
    label: 'Chronic kidney disease, stage 3',
    interesting: 'A thiazide still works above eGFR 30, and an ACE inhibitor plus an ARB together must never be licensed here — VA NEPHRON-D stopped early.',
    inputs: base({
      age_years: 64,
      sbp_mmHg: 158,
      dbp_mmHg: 88,
      serum_creatinine_mg_dl: 1.6,
      comorbidities: ['ckd'],
      ckd_stage: 'G3b',
    }),
  },
  {
    id: 'seed_gout',
    label: 'Gout',
    interesting: 'The clearest reject case: a thiazide pushes urate up, and losartan is the one agent in the set that pushes it down.',
    inputs: base({ age_years: 61, comorbidities: ['gout'] }),
  },
  {
    id: 'seed_asthma_nm',
    label: 'Asthma, normal metaboliser',
    interesting: 'The control for the genotype pair. On a standard metoprolol dose this patient stays below the selectivity threshold.',
    inputs: base({
      age_years: 47,
      sex: 'female',
      weight_kg: 68,
      height_cm: 164,
      serum_creatinine_mg_dl: 0.75,
      comorbidities: ['asthma_copd'],
    }),
  },
  {
    id: 'seed_asthma_pm',
    label: 'Asthma, CYP2D6 poor metaboliser',
    interesting: 'The strongest case in the product: the same dose crosses 80.2 ng/mL, β1 selectivity is lost and the airway channel opens.',
    inputs: base({
      age_years: 47,
      sex: 'female',
      weight_kg: 68,
      height_cm: 164,
      serum_creatinine_mg_dl: 0.75,
      comorbidities: ['asthma_copd'],
      cyp2d6: 'poor',
      cyp2d6_activity_score: 0,
    }),
  },
  {
    id: 'seed_pregnancy',
    label: 'Pregnant, second trimester',
    interesting: 'A hard gate: an ACE inhibitor and an ARB are both absolutely contraindicated, and the simulation refuses to run them.',
    inputs: base({
      age_years: 31,
      sex: 'female',
      weight_kg: 74,
      height_cm: 166,
      sbp_mmHg: 148,
      dbp_mmHg: 96,
      serum_creatinine_mg_dl: 0.6,
      comorbidities: ['pregnancy'],
      pregnant: true,
    }),
  },
  {
    id: 'seed_hfref',
    label: 'Heart failure, reduced ejection fraction',
    interesting: 'The opposite of a contraindication — a compelling indication that pulls a RAAS blocker and a beta blocker up the ranking.',
    inputs: base({
      age_years: 68,
      weight_kg: 78,
      sbp_mmHg: 138,
      dbp_mmHg: 82,
      hr_bpm: 84,
      serum_creatinine_mg_dl: 1.2,
      comorbidities: ['hfref'],
    }),
  },
  {
    id: 'seed_elderly',
    label: 'Elderly, isolated systolic hypertension',
    interesting: 'Wide pulse pressure and a stiff arterial tree. Orthostatic dizziness is the channel to watch on this one.',
    inputs: base({
      age_years: 78,
      weight_kg: 68,
      height_cm: 170,
      sbp_mmHg: 162,
      dbp_mmHg: 84,
      serum_creatinine_mg_dl: 1.1,
      comorbidities: ['elderly'],
    }),
  },
  {
    id: 'seed_obesity',
    label: 'Obesity and metabolic syndrome',
    interesting: 'A high-output, low-resistance state, and the archetype where ACCOMPLISH found the thiazide arm did best.',
    inputs: base({
      age_years: 49,
      weight_kg: 118,
      height_cm: 174,
      sbp_mmHg: 154,
      dbp_mmHg: 96,
      comorbidities: ['obesity_metabolic'],
    }),
  },
]

/** A blank-ish subject for the "Add subject" button. */
export function newSubjectInputs(): PatientInputs {
  return base({})
}
