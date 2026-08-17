/**
 * Run-control presets for the simulation view.
 *
 * Doses come from the licensed ladders confirmed in research/00-DECISIONS.md §6
 * ("losartan 25-100 mg and amlodipine 2.5-10 mg confirmed exactly", lisinopril
 * usual range 20-40 mg/day with a 10 mg start) and from data/products.json,
 * where metoprolol succinate ER 50 mg is 38.9 mg of metoprolol base.
 *
 * Nothing here is pharmacology the UI invented — these are dosing ladders and
 * archetype labels. The pharmacology lives in the engine and the data files.
 */

import type { DrugId, PatientInputs, Regimen } from '../../types'
import type { DictKey } from '../../i18n'

export const DRUG_LABEL: Record<DrugId, string> = {
  lisinopril: 'Lisinopril',
  losartan: 'Losartan (parent)',
  exp3174: 'EXP3174 (losartan active metabolite)',
  amlodipine: 'Amlodipine',
  hydrochlorothiazide: 'Hydrochlorothiazide',
  metoprolol: 'Metoprolol',
}

/**
 * SeverityId -> the class that paints it, shared by every panel on this view so
 * a "major" in the report is the same colour as a "major" in the ranking. The
 * classes themselves resolve to the shell's rank 0..7 ladder in simulation.css.
 */
export const SEVERITY_CLASS: Record<string, string> = {
  info: 'sev-info',
  preferred: 'sev-good',
  compelling: 'sev-good',
  minor: 'sev-minor',
  moderate: 'sev-moderate',
  major: 'sev-major',
  contraindicated_relative: 'sev-contra',
  contraindicated_absolute: 'sev-contra',
}

/**
 * Short names for direct chart labelling.
 *
 * A figure label sits at the end of its own line, so it has to be short enough
 * to read at a glance. The full name — including "losartan active metabolite"
 * for EXP3174 — stays in DRUG_LABEL and in every table and caption, so nothing
 * is lost; this is the label, not the definition.
 */
export const DRUG_SHORT: Record<DrugId, string> = {
  lisinopril: 'Lisinopril',
  losartan: 'Losartan (parent)',
  exp3174: 'EXP3174',
  amlodipine: 'Amlodipine',
  hydrochlorothiazide: 'HCTZ',
  metoprolol: 'Metoprolol',
}

/**
 * Per-drug identity hue, one per drug, aliased from the shell's tokens.
 *
 * These are CSS custom properties rather than literals so the colour a reader
 * learns for amlodipine on the concentration chart is the same one it has on
 * the engagement chart, the ranking bars and the organ figure — and so the
 * palette can be retuned in one place. `var(...)` resolves in an SVG `stroke`
 * and in an inline `background` alike.
 */
export const DRUG_COLOR: Record<DrugId, string> = {
  lisinopril: 'var(--drug-lisinopril, #2563c9)',
  losartan: 'var(--drug-losartan, #0f8a8a)',
  exp3174: 'var(--drug-exp3174, #0b6b6b)',
  amlodipine: 'var(--drug-amlodipine, #b3591e)',
  hydrochlorothiazide: 'var(--drug-hydrochlorothiazide, #6b3fb5)',
  metoprolol: 'var(--drug-metoprolol, #b3264f)',
}

/**
 * Drugs plotted on the shared concentration axis.
 *
 * LOSARTAN PARENT IS DELIBERATELY ABSENT. Peak-to-trough across this set spans
 * four orders of magnitude — amlodipine 1.30, lisinopril 2.7, EXP3174 6.8,
 * losartan parent about 2000 — so the parent on a shared linear axis flattens
 * every other curve to the baseline. EXP3174 is also the moiety carrying
 * 60-85 % of the effect, so it is the correct thing to plot. The parent gets
 * its own separate axis behind a toggle.
 */
export const PLOTTED_DRUGS: DrugId[] = [
  'lisinopril',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

export const PARENT_ONLY_DRUGS: DrugId[] = ['losartan']

export const PEAK_TO_TROUGH_NOTE =
  'Peak-to-trough ratio: amlodipine 1.30 · lisinopril 2.7 · EXP3174 6.8 · losartan parent ≈ 2000. ' +
  'The parent is plotted on its own axis because a shared linear axis with it on is unreadable, ' +
  'and because EXP3174 is the moiety that carries the effect.'

// ---------------------------------------------------------------------------
// standard / half / double dose ladders
// ---------------------------------------------------------------------------

export interface DoseLadder {
  drug: DrugId
  /** The dose the demo treats as "standard", mg per administration. */
  standard: number
  half: number
  double: number
  perDay: number
  /** Full licensed ladder for the "best dose" search. */
  ladder: number[]
  unitNote?: string
}

export const LADDERS: Record<Exclude<DrugId, 'exp3174' | 'losartan'> | 'losartan', DoseLadder> = {
  lisinopril: { drug: 'lisinopril', standard: 20, half: 10, double: 40, perDay: 1, ladder: [5, 10, 20, 40] },
  losartan: { drug: 'losartan', standard: 50, half: 25, double: 100, perDay: 1, ladder: [25, 50, 100] },
  amlodipine: { drug: 'amlodipine', standard: 5, half: 2.5, double: 10, perDay: 1, ladder: [2.5, 5, 10] },
  hydrochlorothiazide: {
    drug: 'hydrochlorothiazide',
    standard: 25,
    half: 12.5,
    double: 50,
    perDay: 1,
    ladder: [6.25, 12.5, 25, 50],
  },
  metoprolol: {
    drug: 'metoprolol',
    standard: 39,
    half: 19.5,
    double: 78,
    perDay: 1,
    ladder: [19.5, 39, 78, 156],
    unitNote: 'mg metoprolol base — 39 mg base ≈ 50 mg succinate ER (data/products.json)',
  },
}

export const COMBINABLE: DrugId[] = [
  'lisinopril',
  'losartan',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

function shortName(d: DrugId) {
  return { lisinopril: 'Lisinopril', losartan: 'Losartan', amlodipine: 'Amlodipine', hydrochlorothiazide: 'HCTZ', metoprolol: 'Metoprolol', exp3174: 'EXP3174' }[d]
}

/**
 * Every `LADDERS.metoprolol` figure (standard/half/double/ladder) is metoprolol
 * BASE mg, deliberately base-matched to the metoprolol succinate ER label
 * strengths so the tartrate and succinate products are comparable (see the
 * ladder's own `unitNote` and `data/products.json`
 * `cross_file_dependencies.salt_basis_warning`). None of those base figures is
 * a strength that was ever licensed or printed on a label — "Metoprolol 39 mg"
 * reads as an invented product to a prescriber. This maps each base mg used in
 * the ladder back to the succinate ER strength a clinician would recognise, for
 * DISPLAY ONLY; the mg values actually dosed into the engine are untouched.
 */
const METOPROLOL_LABEL_MG: Record<number, number> = { 19.5: 25, 39: 50, 78: 100, 156: 200 }

/** The amount half of a regimen label — "39 mg", or for metoprolol the
 * labelled succinate ER strength this base mg was matched to. */
function amountText(drug: DrugId, mg: number): string {
  if (drug === 'metoprolol') {
    const label = METOPROLOL_LABEL_MG[mg]
    if (label != null) return `succinate ER ${label} mg`
  }
  return `${mg} mg`
}

export function mono(drug: DrugId, mg: number, perDay = 1): Regimen {
  return {
    id: `${drug}_${mg}`,
    label: `${shortName(drug)} ${amountText(drug, mg)}${perDay > 1 ? ` ×${perDay}/day` : ''}`,
    doses: [{ substanceId: drug, mg, perDay }],
  }
}

export function pair(a: DrugId, aMg: number, b: DrugId, bMg: number): Regimen {
  return {
    id: `${a}_${aMg}__${b}_${bMg}`,
    label: `${shortName(a)} ${amountText(a, aMg)} + ${shortName(b)} ${amountText(b, bMg)}`,
    doses: [
      { substanceId: a, mg: aMg, perDay: 1 },
      { substanceId: b, mg: bMg, perDay: 1 },
    ],
  }
}

/**
 * Demo moment 1 — the combination bench.
 *
 * All ten unordered pairs of the five drugs at HALF the standard dose of each,
 * plus the five monotherapies at DOUBLE the standard dose. Fifteen arms, one
 * comparison set, no arm privileged. Whether dual RAAS blockade sinks to the
 * bottom, and whether half-and-half beats double-of-one, is the engine's
 * answer, not this file's.
 */
export function combinationBenchArms(): Regimen[] {
  const arms: Regimen[] = []
  for (let i = 0; i < COMBINABLE.length; i++) {
    for (let j = i + 1; j < COMBINABLE.length; j++) {
      const a = COMBINABLE[i]
      const b = COMBINABLE[j]
      arms.push(pair(a, LADDERS[a as keyof typeof LADDERS].half, b, LADDERS[b as keyof typeof LADDERS].half))
    }
  }
  for (const d of COMBINABLE) {
    arms.push(mono(d, LADDERS[d as keyof typeof LADDERS].double))
  }
  return arms
}

/** The dual-RAAS arm, flagged so the UI can point at it without pre-judging its rank. */
export const DUAL_RAAS_ARM_ID = `lisinopril_${LADDERS.lisinopril.half}__losartan_${LADDERS.losartan.half}`

// ---------------------------------------------------------------------------
// pill / regimen library (fallback when the Pills page has not handed us one)
// ---------------------------------------------------------------------------

/** Seeded from data/products.json — the eight modelled products. */
export const PRODUCT_REGIMENS: Regimen[] = [
  mono('lisinopril', 20),
  mono('losartan', 50),
  mono('amlodipine', 5),
  mono('amlodipine', 10),
  mono('hydrochlorothiazide', 25),
  mono('metoprolol', 39),
  {
    id: 'prod_lisinopril_hctz_fdc',
    label: 'Lisinopril 20 + HCTZ 12.5 mg (fixed-dose combination)',
    doses: [
      { substanceId: 'lisinopril', mg: 20, perDay: 1 },
      { substanceId: 'hydrochlorothiazide', mg: 12.5, perDay: 1 },
    ],
  },
  {
    id: 'prod_losartan_hctz_fdc',
    label: 'Losartan 50 + HCTZ 12.5 mg (fixed-dose combination)',
    doses: [
      { substanceId: 'losartan', mg: 50, perDay: 1 },
      { substanceId: 'hydrochlorothiazide', mg: 12.5, perDay: 1 },
    ],
  },
]

/**
 * Bridge for the Pills page. If another view publishes composed pills on this
 * global, the picker uses them; otherwise it falls back to PRODUCT_REGIMENS.
 * Documented here so the Pills agent has a one-line handoff.
 */
declare global {
  interface Window {
    __pilsim_pills__?: Regimen[]
  }
}

export function availableRegimens(): { regimens: Regimen[]; fromPillsPage: boolean } {
  const shared = typeof window !== 'undefined' ? window.__pilsim_pills__ : undefined
  if (Array.isArray(shared) && shared.length) return { regimens: shared, fromPillsPage: true }
  return { regimens: PRODUCT_REGIMENS, fromPillsPage: false }
}

// ---------------------------------------------------------------------------
// test subjects
// ---------------------------------------------------------------------------

export interface SubjectPreset {
  id: string
  label: string
  note: string
  inputs: PatientInputs
}

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
  cyp2c9: 'normal',
  ...over,
})

/** Comorbidity ids are the preset keys in data/patient_model.json. */
export const SUBJECT_PRESETS: SubjectPreset[] = [
  {
    id: 'healthy_55',
    label: 'Reference adult, 55',
    note: 'Uncomplicated hypertension. The comparison baseline.',
    inputs: base({}),
  },
  {
    id: 't2dm',
    label: 'Type 2 diabetes, 58',
    note: 'ACE/ARB preference applies only with albuminuria, reduced eGFR or coronary disease (00-DECISIONS §6).',
    inputs: base({ age_years: 58, weight_kg: 94, comorbidities: ['t2dm'], sbp_mmHg: 156, dbp_mmHg: 92 }),
  },
  {
    id: 'ckd',
    label: 'CKD stage 3, 64',
    note: 'No thiazide penalty above eGFR 30. Must not license ACEi + ARB together — VA NEPHRON-D stopped early.',
    inputs: base({
      age_years: 64,
      comorbidities: ['ckd'],
      serum_creatinine_mg_dl: 1.6,
      sbp_mmHg: 158,
      dbp_mmHg: 88,
    }),
  },
  {
    id: 'asthma_copd_pm',
    label: 'Asthma + CYP2D6 poor metaboliser, 47',
    note: 'Demo moment 2. Metoprolol selectivity is a concentration gate at 80.2 ng/mL, not a ban.',
    inputs: base({ age_years: 47, sex: 'female', weight_kg: 68, comorbidities: ['asthma_copd'], cyp2d6: 'poor' }),
  },
  {
    id: 'asthma_copd_nm',
    label: 'Asthma + CYP2D6 normal metaboliser, 47',
    note: 'The control arm for demo moment 2 — identical except for genotype.',
    inputs: base({ age_years: 47, sex: 'female', weight_kg: 68, comorbidities: ['asthma_copd'], cyp2d6: 'normal' }),
  },
  {
    id: 'gout',
    label: 'Gout, 61',
    note: 'Thiazide raises urate — +36 µmol/L already at 12.3 mg.',
    inputs: base({ age_years: 61, comorbidities: ['gout'] }),
  },
  {
    id: 'elderly',
    label: 'Elderly, 78',
    note: 'SPRINT showed no excess injurious falls; intensive treatment reduced orthostatic hypotension.',
    inputs: base({ age_years: 78, weight_kg: 68, sbp_mmHg: 162, dbp_mmHg: 84 }),
  },
  {
    id: 'obesity_metabolic',
    label: 'Obesity, metabolic, 49',
    note: 'High-output, low-resistance state. ACCOMPLISH: the HCTZ arm did best here.',
    inputs: base({ age_years: 49, weight_kg: 118, height_cm: 174, comorbidities: ['obesity_metabolic'] }),
  },
  {
    id: 'pregnancy',
    label: 'Pregnant, 31',
    note: 'The one draft claim that survived unamended: ACE/ARB absolutely contraindicated.',
    inputs: base({
      age_years: 31,
      sex: 'female',
      weight_kg: 74,
      height_cm: 166,
      comorbidities: ['pregnancy'],
      pregnant: true,
      sbp_mmHg: 148,
      dbp_mmHg: 96,
    }),
  },
]

// ---------------------------------------------------------------------------
// formulation refusals — research/05-OUTPUT-REPORT-SPEC.md §5.4 / §5.3
// ---------------------------------------------------------------------------

/* The refusal wording is normative and lives in src/report/disclaimer.ts.
   Re-exported, never retyped — the report, the chip and this page must agree.

   These verdicts are sentences the PRODUCT wrote, so they are held as dictionary
   KEYS and rendered through `t()` at the call site: they used to print in English
   under every language, above headings that were translated. The English entry
   behind `sim.formulation.text.refusal` is built from FORMULATION_REFUSAL_TEXT
   itself, so the normative wording still has exactly one home. Source lines,
   drug names and the label citations beside them stay verbatim. */
export { FORMULATION_REFUSAL_TEXT } from '../../report/disclaimer'

export const FORMULATION_STATUS: Record<
  string,
  { status: 'ranked' | 'refused' | 'not_indicated'; textKey: DictKey; source?: string }
> = {
  metoprolol: {
    status: 'ranked',
    textKey: 'sim.formulation.text.metoprololRanked',
    source: 'FDA label, metoprolol succinate ER (openFDA), retrieved 2026-08-17 [P4]',
  },
  amlodipine: {
    status: 'not_indicated',
    textKey: 'sim.formulation.text.amlodipineNotIndicated',
    source: 'FDA label, amlodipine besylate (openFDA), retrieved 2026-08-17 [P1]',
  },
  lisinopril: { status: 'refused', textKey: 'sim.formulation.text.refusal' },
  losartan: { status: 'refused', textKey: 'sim.formulation.text.refusal' },
  hydrochlorothiazide: { status: 'refused', textKey: 'sim.formulation.text.refusal' },
}

// ---------------------------------------------------------------------------
// structural limitations — §7.3, rendered verbatim at the foot of every report
// ---------------------------------------------------------------------------

/**
 * Translated as dictionary keys, not plain strings — `sim.limits.*` in
 * `src/i18n/dictionary.ts`. `sim.limits.noHardOutcomes` and
 * `FIVE_YEAR_WORDING_KEY` below both carry the same normative hedge (§ the
 * task brief this pass was built against): a long-horizon view is a
 * PROJECTION of blood pressure control and organ-relevant markers, never a
 * prediction of events. Uzbek and Russian must keep that same hedge — never a
 * confident resolution — if either is ever edited.
 */
export const STRUCTURAL_LIMITATIONS: DictKey[] = [
  'sim.limits.noAldosteroneEscape',
  'sim.limits.noBaroreflexAdaptation',
  'sim.limits.noPdTolerance',
  'sim.limits.noAdherenceBehaviour',
  'sim.limits.noHardOutcomes',
  'sim.limits.cellLevelOneTarget',
]

export const FIVE_YEAR_WORDING_KEY: DictKey = 'sim.limits.fiveYearWording'
