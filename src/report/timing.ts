/**
 * WHEN IN THE DAY TO TAKE IT.
 *
 * The product owner asked for a time of day. That request sits on top of the single most
 * contested question in antihypertensive prescribing, and the failure mode is specific and
 * severe: a user who has heard "take your blood-pressure tablets at night, it prevents
 * heart attacks" will read any timing advice from this product as agreement with that
 * claim unless the product says otherwise in words.
 *
 * ---------------------------------------------------------------------------
 * THREE KINDS OF CLAIM, NEVER BLURRED
 * ---------------------------------------------------------------------------
 * Every timing reason this module produces is tagged with which kind it is, and the three
 * are not interchangeable:
 *
 *   `outcome`         "taking it at night prevents heart attacks". PilSim makes exactly
 *                     one outcome claim about timing, and it is a NEGATIVE one: no time of
 *                     day is established to change cardiovascular outcomes. The type system
 *                     enforces it — `DoseTiming.claimsOutcomeBenefit` is the literal `false`
 *                     and cannot be set to anything else.
 *
 *   `tolerability`    "a thiazide taken late will wake you to urinate". Solid, labelled,
 *                     uncontroversial, and genuinely useful. This is where the product
 *                     actually helps, and it has nothing to do with cardiovascular risk.
 *
 *   `pharmacokinetic` "amlodipine's concentration barely moves across the day, so the hour
 *                     hardly matters". Derived, not asserted — `engine/timing.ts` reduces
 *                     the real steady-state concentration curve to a peak-to-trough swing
 *                     using the same PK the simulation runs on.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE EVIDENCE ACTUALLY STANDS (verified 2026-08-17, see TIMING_EVIDENCE)
 * ---------------------------------------------------------------------------
 * MAPEC (2010) and the Hygia Chronotherapy Trial (2020) reported large cardiovascular
 * benefits from bedtime dosing. Hygia carries TWO Expressions of Concern from the European
 * Heart Journal (2020;41(16):1600 and 2020;41(48):4564) and its source data has been the
 * subject of a published methodological challenge. Neither has been retracted.
 *
 * Two subsequent randomised trials looked for the effect and did not find it: TIME (Lancet
 * 2022, n=21 104, HR 0.95 [0.83–1.10]) and BedMed (JAMA 2025, n=3357, adjusted HR 0.96
 * [0.77–1.19]). BedMed also found no excess of falls, fractures, new glaucoma or cognitive
 * decline, which answers the mirror-image safety worry.
 *
 * What remains genuinely open is the night-time-blood-pressure subgroup: OMAN (JAMA Netw
 * Open 2025) found bedtime dosing lowered night-time systolic pressure by about 3 mmHg —
 * a SURROGATE, not an event. PilSim cannot identify such a patient in any case; see the
 * gaps this module emits.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS FILE OBEYS
 * ---------------------------------------------------------------------------
 * The same one plan.ts obeys: every printable sentence carries a `PlanBasis`. Timing adds
 * one basis kind, `literature`, because a published trial is not a rule in rules.json, not
 * a field in substances.json, not engine arithmetic and not the blood-pressure target — and
 * pretending it is any of those would hide exactly the thing a reader needs to weigh.
 *
 * ⚠️ data/rules.json emits no dose-timing effect for any of the five substances, so none of
 *    this comes from PilSim's guideline layer. It is read from the trials directly and is
 *    marked `literature`, never `guideline`.
 *
 * ---------------------------------------------------------------------------
 * LANGUAGE
 * ---------------------------------------------------------------------------
 * The sentences in this file are ones the PRODUCT wrote, so they translate. This module
 * cannot call `useT()` — it is run by tests, by the AI context builder and by the report —
 * so the translate function is INJECTED, the same way `nameOf` already is: pass `t` in
 * `PlanTimingInput` and every generated sentence comes back in that language. With no `t`
 * the default is `englishText`, which resolves the same dictionary in English, so the
 * plain-text export, the AI context and every existing test see exactly the sentences this
 * module produced before the indirection existed.
 *
 * What NEVER changes language, in any of the three: trial names (TIME, BedMed, MAPEC,
 * Hygia), journal names, PMIDs, DOIs, verbatim quoted titles, every number, unit and
 * statistic, and every drug name. They are interpolated into the translated sentence or
 * written into the translation unchanged, so a reader in Uzbek can still check us against
 * the paper. The verdict itself is NEGATIVE in all three languages — see the ⚠️ notes on
 * the `sim.timing.text.*` keys in src/i18n/dictionary.ts.
 */

import type { DrugId, Provenance, Regimen } from '../types'
import type { PilSimData, SubstanceRecord } from '../data/load'
import type { Measured } from '../types'
import type { PlanBasis, PlanGap, PlanStatement } from './plan'
import { englishText, type Translate } from '../i18n/dictionary'
import {
  doseIntervalCoverage,
  TIMING_MARKED_TROUGH_FRACTION,
  TIMING_NEGLIGIBLE_TROUGH_FRACTION,
  type DoseIntervalCoverage,
} from '../engine/timing'

// ---------------------------------------------------------------------------
// The shape of a timing recommendation
// ---------------------------------------------------------------------------

/** Which of the three kinds of claim a reason is. They are never interchangeable. */
export type TimingClaimKind = 'outcome' | 'tolerability' | 'pharmacokinetic'

/**
 * How much weight the reason will carry.
 *
 *  - `high`     a labelled fact, or two adequately powered randomised trials agreeing;
 *  - `moderate` the underlying hazard is cited but the timing remedy is inferred from it;
 *  - `low`      mechanistic or surrogate evidence only.
 */
export type TimingConfidence = 'high' | 'moderate' | 'low'

/**
 * `any_consistent_time` is a FIRST-CLASS answer, not an empty field. For four of the five
 * drugs it is the honest one, and the product states it with high confidence rather than
 * leaving a blank where a user will read agreement with whatever they already believe.
 */
export type DoseTimeOfDay = 'morning' | 'evening' | 'bedtime' | 'any_consistent_time'

export const DOSE_TIME_LABEL: Record<DoseTimeOfDay, string> = {
  morning: 'in the morning',
  evening: 'in the evening',
  bedtime: 'at bedtime',
  any_consistent_time: 'at the same time every day — any hour that suits you',
}

export interface DoseTimingReason {
  kind: TimingClaimKind
  /** One plain sentence. */
  text: string
  confidence: TimingConfidence
  citation?: Provenance
  basis: PlanBasis
}

export interface DoseTimingFirstDose {
  suggested: DoseTimeOfDay
  label: string
  reason: DoseTimingReason
}

export interface DoseTiming {
  substanceId: DrugId
  name: string
  perDay: number
  /** When to take the ongoing daily dose. */
  suggested: DoseTimeOfDay
  suggestedLabel: string
  /**
   * A different time for the FIRST dose only, where one is warranted — the ACE-inhibitor
   * and ARB first-dose-hypotension case. Null when the first dose is like every other.
   */
  firstDose: DoseTimingFirstDose | null
  /** Which kind of claim the suggested time actually rests on. */
  primaryKind: TimingClaimKind
  confidence: TimingConfidence
  /**
   * ⚠️ THE INVARIANT, IN THE TYPE SYSTEM. No `DoseTiming` may ever claim that its
   * suggested time reduces cardiovascular events, because no such claim is supported.
   * The literal type makes `true` a compile error, not a code-review catch.
   */
  claimsOutcomeBenefit: false
  reasons: DoseTimingReason[]
  /** What the engine's own PK says about how much room timing has. */
  coverage: DoseIntervalCoverage
  statements: PlanStatement[]
}

/**
 * The outcome question, answered once for the whole plan rather than per drug — it is a
 * property of the evidence, not of the molecule.
 *
 * Both sides are stated with their own numbers, following the precedent
 * `reconcileDoseStep` sets for the ranker/titration conflict: where two defensible bodies
 * of work disagree, the plan prints both and names what separates them, rather than
 * quietly picking one.
 */
export interface TimingOutcomeEvidence {
  /** PilSim's position. The literal type is the point. */
  verdict: 'no_established_outcome_benefit'
  confidence: TimingConfidence
  /** The trials that reported a benefit, the trials that did not, and what separates them. */
  statements: PlanStatement[]
  citations: Provenance[]
}

export interface PlanTiming {
  heading: string
  drugs: DoseTiming[]
  outcomeEvidence: TimingOutcomeEvidence
  statements: PlanStatement[]
}

// ---------------------------------------------------------------------------
// The evidence, cited
// ---------------------------------------------------------------------------

const RETRIEVED = '2026-08-17'

/**
 * Every trial this module names, with what it actually reported.
 *
 * ⚠️ Hygia's effect size is deliberately NOT quoted. Two Expressions of Concern stand
 *    against the paper and its source data has been challenged in print; reproducing its
 *    hazard ratio here would put a precise, memorable, contested number in front of a
 *    reader who has no way to weigh it. Its CLAIM is quoted — from its own title — and its
 *    status is quoted beside it. That is the honest amount to say.
 */
export const TIMING_EVIDENCE: Record<string, Provenance> = {
  time2022: {
    status: 'CITED',
    tier: 2,
    source:
      'Mackenzie IS, Rogers A, Poulter NR, et al. Cardiovascular outcomes in adults with ' +
      'hypertension with evening versus morning dosing of usual antihypertensives in the UK ' +
      '(TIME study): a prospective, randomised, open-label, blinded-endpoint clinical trial. ' +
      'Lancet 2022;400(10361):1417–1425. PMID 36240838.',
    url: 'https://doi.org/10.1016/S0140-6736(22)01786-X',
    quote:
      'Evening dosing of usual antihypertensive medication was not different from morning ' +
      'dosing in terms of major cardiovascular outcomes. Patients can be advised that they ' +
      'can take their regular antihypertensive medications at a convenient time that ' +
      'minimises any undesirable effects.',
    retrieved: RETRIEVED,
    confidence: 'HIGH',
    note:
      '21 104 randomised (10 503 evening, 10 601 morning), median follow-up 5.2 years. Primary ' +
      'endpoint (vascular death, non-fatal MI or non-fatal stroke) in 362 (3.4 %) evening vs ' +
      '390 (3.7 %) morning; unadjusted hazard ratio 0.95 (95 % CI 0.83–1.10), p=0.53. No safety ' +
      'concerns identified.',
  },
  bedmed2025: {
    status: 'CITED',
    tier: 2,
    source:
      'Garrison SR, Youngson E, Perry D, et al. Antihypertensive Medication Timing and ' +
      'Cardiovascular Events and Death: The BedMed Randomized Clinical Trial. JAMA 2025. ' +
      'PMID 40354045. ClinicalTrials.gov NCT02990663.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40354045/',
    quote:
      'Among adults with hypertension in primary care, bedtime administration of ' +
      'antihypertensive medications was safe but did not reduce cardiovascular risk. ' +
      'Antihypertensive medication administration time did not affect the risks and benefits ' +
      'of blood pressure-lowering medication and instead should be guided by patient preferences.',
    retrieved: RETRIEVED,
    confidence: 'HIGH',
    note:
      '3357 adults, median age 67, median follow-up 4.6 years. Composite of death or ' +
      'hospitalisation/ED visit for stroke, acute coronary syndrome or heart failure: 2.3 vs ' +
      '2.4 per 100 patient-years, adjusted hazard ratio 0.96 (95 % CI 0.77–1.19), p=.70. No ' +
      'difference in falls or fractures, new glaucoma diagnoses, or 18-month cognitive decline.',
  },
  hygia2020: {
    status: 'CITED',
    tier: 2,
    source:
      'Hermida RC, Crespo JJ, Domínguez-Sardiña M, et al. Bedtime hypertension treatment ' +
      'improves cardiovascular risk reduction: the Hygia Chronotherapy Trial. Eur Heart J ' +
      '2020;41(48):4565–4576. PMID 31641769.',
    url: 'https://doi.org/10.1093/eurheartj/ehz754',
    quote: 'Bedtime hypertension treatment improves cardiovascular risk reduction',
    retrieved: RETRIEVED,
    confidence: 'LOW',
    note:
      'CONTESTED. The European Heart Journal has published TWO Expressions of Concern about ' +
      'this paper (Eur Heart J 2020;41(16):1600 and Eur Heart J 2020;41(48):4564). It has not ' +
      'been retracted. PilSim quotes the paper\'s claim, from its own title, and deliberately ' +
      'does not reproduce its effect size — see the header of src/report/timing.ts.',
  },
  mapec2010: {
    status: 'CITED',
    tier: 2,
    source:
      'Hermida RC, Ayala DE, Mojón A, Fernández JR. Influence of circadian time of hypertension ' +
      'treatment on cardiovascular risk: results of the MAPEC study. Chronobiol Int ' +
      '2010;27(8):1629–1651. PMID 20854139.',
    url: 'https://doi.org/10.3109/07420528.2010.510230',
    quote:
      'subjects ingesting ≥1 BP-lowering medications at bedtime exhibited a significantly ' +
      'lower relative risk of total CVD events',
    retrieved: RETRIEVED,
    confidence: 'LOW',
    note:
      'CONTESTED. 2156 participants, median follow-up 5.6 years, single-group-of-investigators ' +
      'open design. Same research group as Hygia, and subject to the same source-data challenge.',
  },
  brunstrom2021: {
    status: 'CITED',
    tier: 2,
    source:
      'Brunström M, Kjeldsen SE, Kreutz R, Gjesdal K, Narkiewicz K, Burnier M, Oparil S, Mancia G. ' +
      'Missing Verification of Source Data in Hypertension Research: The HYGIA PROJECT in ' +
      'Perspective. Hypertension 2021;78(2):555–558. PMID 34232677.',
    url: 'https://doi.org/10.1161/HYPERTENSIONAHA.121.17356',
    quote: 'Missing Verification of Source Data in Hypertension Research: The HYGIA PROJECT in Perspective',
    retrieved: RETRIEVED,
    confidence: 'MEDIUM',
    note:
      'The published methodological challenge to the Hygia project, by eight hypertension ' +
      'researchers including three past or present authors of the European hypertension ' +
      'guidelines. PilSim quotes its title, which carries its charge; the article body was not ' +
      'retrieved, so nothing is attributed to it beyond that.',
  },
  oman2025: {
    status: 'CITED',
    tier: 2,
    source:
      'Ye R, et al. Morning vs Bedtime Dosing and Nocturnal Blood Pressure Reduction (OMAN ' +
      'randomized clinical trial). JAMA Netw Open 2025. PMID 40632538.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40632538/',
    quote:
      'significantly greater reductions in nighttime systolic blood pressure',
    retrieved: RETRIEVED,
    confidence: 'MEDIUM',
    note:
      'SURROGATE ENDPOINT, NOT EVENTS. Bedtime dosing lowered night-time systolic pressure by ' +
      'about 3 mmHg more than morning dosing, without more hypotension. A blood-pressure ' +
      'difference is not an outcome difference, and this trial did not measure outcomes.',
  },
  koreanStatement2023: {
    status: 'CITED',
    tier: 2,
    source:
      'Park S, et al. Statement on chronotherapy for the treatment of hypertension — Korean ' +
      'Society of Hypertension. Clin Hypertens 2023. PMID 37653547.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37653547/',
    quote:
      'no consistent evidence to suggest that routine administration of antihypertensive ' +
      'medications at bedtime can improve nocturnal BP',
    retrieved: RETRIEVED,
    confidence: 'MEDIUM',
    note:
      'A national society statement, not a guideline recommendation. PilSim found no ' +
      'time-of-day recommendation in the 2024 ESC hypertension guideline text it was able to ' +
      'retrieve, and could not retrieve the 2025 AHA/ACC guideline text at all — so this ' +
      'module makes no claim about what guidelines say, only about what trials found.',
  },
}

function literature(citation: Provenance): PlanBasis {
  return { kind: 'literature', citation }
}

// ---------------------------------------------------------------------------
// Tolerability — the part that is solid, labelled, and actually useful
// ---------------------------------------------------------------------------

function substanceRecord(id: string, data?: PilSimData | null): SubstanceRecord | null {
  return data?.substances.substances.find((s) => s.id === id) ?? null
}

function clinicalEffect(rec: SubstanceRecord | null, field: string): Measured | null {
  const pd = rec?.pd as Record<string, unknown> | undefined
  const ce = pd?.clinical_effect as Record<string, unknown> | undefined
  const m = ce?.[field] as Measured | undefined
  if (!m || typeof m !== 'object' || typeof m.value !== 'number') return null
  return m
}

/** The named adverse-effect entry from `pd.adverse_effects`, or null. */
function adverseEffect(
  rec: SubstanceRecord | null,
  name: string,
): { onset?: string; mechanism?: string; provenance?: Provenance } | null {
  const pd = rec?.pd as Record<string, unknown> | undefined
  const list = pd?.adverse_effects
  if (!Array.isArray(list)) return null
  const entry = (list as Record<string, unknown>[]).find(
    (a) => String(a.name ?? '').toLowerCase() === name,
  )
  if (!entry) return null
  const inc = entry.incidence_fraction as Measured | undefined
  return {
    onset: typeof entry.onset === 'string' ? entry.onset : undefined,
    mechanism: typeof entry.mechanism === 'string' ? entry.mechanism : undefined,
    provenance: inc?.provenance,
  }
}

function r1(x: number): number {
  return Math.round(x * 10) / 10
}

/** First sentence only. Dataset mechanism strings often run to two, and the second is label boilerplate. */
function firstSentence(s: string | undefined): string {
  if (!s) return ''
  const t = s.trim()
  const stop = t.search(/\.\s/)
  return (stop > 0 ? t.slice(0, stop + 1) : t).replace(/\.$/, '')
}

/**
 * A provenance is only quotable as a SOURCE when it actually cites something. The dataset
 * carries NOT_FOUND provenances (losartan's hypotension incidence: "Rate not extracted
 * within timebox"), and rendering one under a "Source:" heading would dress an admission of
 * ignorance up as a citation.
 */
function quotableCitation(p?: Provenance): Provenance | undefined {
  return p && p.status === 'CITED' ? p : undefined
}

/**
 * Hydrochlorothiazide: take it in the morning.
 *
 * This is the clearest, least contested timing statement the product can make, and it is
 * built entirely out of the label figures already in the dataset — diuresis begins within
 * about 2 h, peaks at about 4 h and lasts about 6–12 h. Put the dose in the evening and
 * that whole window lands in the night. It says NOTHING about cardiovascular risk, and the
 * sentence is written so it cannot be read as if it did.
 */
function thiazideMorningReason(
  name: string,
  data: PilSimData | null | undefined,
  t: Translate,
): DoseTimingReason | null {
  const rec = substanceRecord('hydrochlorothiazide', data)
  const onset = clinicalEffect(rec, 'onset_h')
  const peak = clinicalEffect(rec, 'peak_effect_h')
  const duration = clinicalEffect(rec, 'duration_h')
  if (!duration) return null

  const range = Array.isArray(duration.range) ? (duration.range as number[]) : null
  const durationText =
    range && range.length === 2
      ? t('sim.timing.text.durationRange', { lo: r1(range[0]), hi: r1(range[1]) })
      : t('sim.timing.text.durationSingle', { value: r1(duration.value!) })

  return {
    kind: 'tolerability',
    confidence: 'high',
    text: t('sim.timing.text.thiazideMorning', {
      name,
      onset: onset ? r1(onset.value!) : 2,
      peakClause: peak ? t('sim.timing.text.thiazidePeakClause', { peak: r1(peak.value!) }) : '',
      duration: durationText,
    }),
    citation: quotableCitation(duration.provenance),
    basis: {
      kind: 'dataset',
      field: 'hydrochlorothiazide.pd.clinical_effect.duration_h',
      provenance: duration.provenance,
    },
  }
}

/**
 * ACE inhibitors and ARBs: the FIRST dose at bedtime, then whenever suits.
 *
 * Honesty about what is cited and what is inferred: the dataset carries the HAZARD from the
 * FDA label — first-dose hypotension, worst in volume- or salt-depleted patients. It does
 * not carry the REMEDY. "Take the first one at bedtime so a symptomatic fall happens while
 * you are already lying down" is an inference from the labelled hazard, and it is marked
 * `moderate`, not `high`, for exactly that reason.
 */
function firstDoseHypotensionReason(
  substanceId: DrugId,
  name: string,
  data: PilSimData | null | undefined,
  t: Translate,
): DoseTimingReason | null {
  const rec = substanceRecord(substanceId, data)
  const ae = adverseEffect(rec, 'hypotension')
  if (!ae || !/first[- ]dose|first dose/i.test(`${ae.onset ?? ''} ${ae.mechanism ?? ''}`)) return null
  const mechanism = firstSentence(ae.mechanism)

  return {
    kind: 'tolerability',
    confidence: 'moderate',
    // `ae.onset` and `mechanism` are the DATASET's own words, quoted under a citation.
    // They stay exactly as the dataset words them in every language.
    text: t('sim.timing.text.firstDoseHypotension', {
      name,
      onset: ae.onset ?? 'first dose, hours',
      mechanismClause: mechanism ? t('sim.timing.text.datasetOwnWords', { mechanism }) : '',
    }),
    citation: quotableCitation(ae.provenance),
    basis: {
      kind: 'dataset',
      field: `${substanceId}.pd.adverse_effects.hypotension`,
      provenance: quotableCitation(ae.provenance),
    },
  }
}

// ---------------------------------------------------------------------------
// Pharmacokinetics — derived, never asserted
// ---------------------------------------------------------------------------

const EXTENDED_RELEASE_METOPROLOL =
  'extended-release tablet (metoprolol succinate, multiple-unit pellet system)'

/**
 * Turn the engine's peak-to-trough swing into a sentence about how much room the clock
 * has. Every number in the text comes out of `doseIntervalCoverage`; none is written here.
 */
function pharmacokineticReason(
  name: string,
  c: DoseIntervalCoverage,
  tolerabilityNamesAnHour: boolean,
  t: Translate,
): DoseTimingReason {
  const troughPct = Math.round(c.troughFractionOfPeak * 100)
  const swing = Number.isFinite(c.peakTroughRatio)
    ? t('sim.timing.text.pkSwingFold', { value: r1(c.peakTroughRatio) })
    : t('sim.timing.text.pkSwingUnbounded')
  const via =
    c.effectiveSpeciesId !== c.substanceId
      ? t('sim.timing.text.pkViaMetabolite', {
          name,
          species: c.effectiveSpeciesId.toUpperCase(),
          halfLife: r1(c.effectiveHalfLifeH),
        })
      : ''
  const perDayNote = c.perDay > 1 ? t('sim.timing.text.pkPerDayNote', { perDay: c.perDay }) : ''

  if (c.sensitivity === 'negligible') {
    return {
      kind: 'pharmacokinetic',
      confidence: 'high',
      text: t('sim.timing.text.pkNegligible', {
        name,
        halfLife: r1(c.effectiveHalfLifeH),
        swing,
        intervalH: r1(c.intervalH),
        troughPct,
        via,
        perDayNote,
      }),
      basis: {
        kind: 'engine',
        computation: 'doseIntervalCoverage() — steady-state peak-to-trough on the Bateman superposition the simulation runs on',
      },
    }
  }

  if (c.sensitivity === 'marked') {
    return {
      kind: 'pharmacokinetic',
      confidence: 'high',
      text: t('sim.timing.text.pkMarked', {
        name,
        swing,
        intervalH: r1(c.intervalH),
        troughPct,
        via,
        perDayNote,
      }),
      basis: {
        kind: 'engine',
        computation: 'doseIntervalCoverage() — steady-state peak-to-trough on the Bateman superposition the simulation runs on',
      },
    }
  }

  return {
    kind: 'pharmacokinetic',
    confidence: 'high',
    text: t('sim.timing.text.pkModerate', {
      name,
      troughPct,
      swing,
      intervalH: r1(c.intervalH),
      tolerabilityClause: tolerabilityNamesAnHour ? t('sim.timing.text.pkHourFromTolerability') : '',
      via,
      perDayNote,
    }),
    basis: {
      kind: 'engine',
      computation: 'doseIntervalCoverage() — steady-state peak-to-trough on the Bateman superposition the simulation runs on',
    },
  }
}

/**
 * The metoprolol contrast, computed rather than claimed: how much flatter the same daily
 * dose is as extended-release, or split twice daily. Only offered when the immediate-release
 * once-daily schedule is the one with the hole in it.
 */
function metoprololFormContrast(
  mgPerDay: number,
  form: string | undefined,
  t: Translate,
): PlanStatement | null {
  if (form) return null
  const ir = doseIntervalCoverage({ substanceId: 'metoprolol', mg: mgPerDay, perDay: 1 })
  if (ir.sensitivity !== 'marked') return null
  const er = doseIntervalCoverage({
    substanceId: 'metoprolol',
    mg: mgPerDay,
    perDay: 1,
    form: EXTENDED_RELEASE_METOPROLOL,
  })
  const bid = doseIntervalCoverage({ substanceId: 'metoprolol', mg: mgPerDay / 2, perDay: 2 })
  return {
    text: t('sim.timing.text.metoprololContrast', {
      mgPerDay: r1(mgPerDay),
      ir: r1(ir.peakTroughRatio),
      er: r1(er.peakTroughRatio),
      bid: r1(bid.peakTroughRatio),
    }),
    basis: {
      kind: 'engine',
      computation: 'doseIntervalCoverage() on the same daily dose as IR once daily, ER once daily and IR twice daily',
    },
  }
}

// ---------------------------------------------------------------------------
// The outcome question, answered once
// ---------------------------------------------------------------------------

/**
 * ⚠️ READ THIS BEFORE EDITING ANY SENTENCE BELOW.
 *
 * This is the section whose failure mode is a confident clinical instruction the evidence
 * does not support. It follows the precedent `reconcileDoseStep` sets for the ranker vs
 * titration conflict: state BOTH bodies of work with their own numbers, name precisely what
 * separates them, and do not let the reader discover the disagreement somewhere else.
 *
 * The difference from that precedent is that here the two sides are NOT co-equal, and
 * pretending otherwise would be its own dishonesty. Two adequately powered randomised
 * trials with blinded endpoint adjudication looked for the effect and did not find it; the
 * trials that did find it come from one group, carry two Expressions of Concern between
 * them, and have been challenged in print over source-data verification. The product says
 * which way it lands and why, and it does not hedge into silence.
 */
export function buildTimingOutcomeEvidence(t: Translate = englishText): TimingOutcomeEvidence {
  const statements: PlanStatement[] = [
    {
      text: t('sim.timing.text.outcomeVerdict'),
      basis: literature(TIMING_EVIDENCE.time2022),
    },
    {
      text: t('sim.timing.text.outcomeTrials'),
      basis: literature(TIMING_EVIDENCE.time2022),
    },
    {
      text: t('sim.timing.text.outcomeContested'),
      basis: literature(TIMING_EVIDENCE.hygia2020),
    },
    {
      text: t('sim.timing.text.outcomeSafetyMirror'),
      basis: literature(TIMING_EVIDENCE.bedmed2025),
    },
    {
      text: t('sim.timing.text.outcomeSurrogate'),
      basis: literature(TIMING_EVIDENCE.oman2025),
    },
    {
      text: t('sim.timing.text.outcomeConsistentTime'),
      basis: literature(TIMING_EVIDENCE.time2022),
    },
  ]

  return {
    verdict: 'no_established_outcome_benefit',
    confidence: 'high',
    statements,
    citations: [
      TIMING_EVIDENCE.time2022,
      TIMING_EVIDENCE.bedmed2025,
      TIMING_EVIDENCE.hygia2020,
      TIMING_EVIDENCE.mapec2010,
      TIMING_EVIDENCE.brunstrom2021,
      TIMING_EVIDENCE.oman2025,
      TIMING_EVIDENCE.koreanStatement2023,
    ],
  }
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface PlanTimingInput {
  regimen: Regimen
  /** Display names, resolved by the caller so this module does not duplicate plan.ts's lookup. */
  nameOf: (id: DrugId) => string
  data?: PilSimData | null
  gaps: PlanGap[]
  /**
   * The translate function, injected exactly like `nameOf` — this module cannot call the
   * `useT()` hook. Omit it and every sentence comes back in English, unchanged.
   */
  t?: Translate
}

/** The four possible answers, in the reader's language. */
const DOSE_TIME_LABEL_KEY = {
  morning: 'sim.timing.timeMorning',
  evening: 'sim.timing.timeEvening',
  bedtime: 'sim.timing.timeBedtime',
  any_consistent_time: 'sim.timing.timeAnyConsistent',
} as const

function timeLabel(t: Translate, when: DoseTimeOfDay): string {
  return t(DOSE_TIME_LABEL_KEY[when])
}

/** Which drugs get a `morning` recommendation, and on what grounds. Tolerability only. */
function tolerabilityReasonFor(
  substanceId: DrugId,
  name: string,
  data: PilSimData | null | undefined,
  t: Translate,
): { suggested: DoseTimeOfDay; reason: DoseTimingReason } | null {
  if (substanceId === 'hydrochlorothiazide') {
    const reason = thiazideMorningReason(name, data, t)
    return reason ? { suggested: 'morning', reason } : null
  }
  return null
}

export function buildTiming(input: PlanTimingInput): PlanTiming {
  const { regimen, nameOf, data, gaps } = input
  const t = input.t ?? englishText
  const outcomeEvidence = buildTimingOutcomeEvidence(t)
  const drugs: DoseTiming[] = []

  const seen = new Set<DrugId>()
  for (const dose of regimen.doses) {
    if (!dose.mg || dose.mg <= 0) continue
    if (seen.has(dose.substanceId)) continue
    seen.add(dose.substanceId)

    const substanceId = dose.substanceId
    const name = nameOf(substanceId)
    const perDay = Math.max(1, dose.perDay || 1)
    const mgPerDay = regimen.doses
      .filter((d) => d.substanceId === substanceId)
      .reduce((s, d) => s + d.mg * (d.perDay || 1), 0)

    const coverage = doseIntervalCoverage({
      substanceId,
      mg: mgPerDay / perDay,
      perDay,
      form: dose.form,
    })

    const reasons: DoseTimingReason[] = []

    // 1. Outcome — the same negative claim for every drug, attached per drug so a
    //    renderer showing one drug in isolation still shows it.
    reasons.push({
      kind: 'outcome',
      confidence: 'high',
      text: t('sim.timing.text.drugOutcome', { name }),
      citation: TIMING_EVIDENCE.time2022,
      basis: literature(TIMING_EVIDENCE.time2022),
    })

    // 2. Tolerability — where the product genuinely helps.
    const tolerability = tolerabilityReasonFor(substanceId, name, data, t)
    if (tolerability) reasons.push(tolerability.reason)

    // 3. Pharmacokinetics — derived from the engine.
    reasons.push(pharmacokineticReason(name, coverage, tolerability !== null, t))

    // First dose only: ACE inhibitors and ARBs.
    const firstDoseReason = firstDoseHypotensionReason(substanceId, name, data, t)
    const firstDose: DoseTimingFirstDose | null = firstDoseReason
      ? { suggested: 'bedtime', label: timeLabel(t, 'bedtime'), reason: firstDoseReason }
      : null
    if (firstDoseReason) reasons.push(firstDoseReason)

    // The suggested time. A tolerability reason is the only thing that moves it off
    // `any_consistent_time`, because tolerability is the only kind of claim that has
    // earned the right to name an hour.
    const suggested: DoseTimeOfDay = tolerability?.suggested ?? 'any_consistent_time'
    const primaryKind: TimingClaimKind = tolerability ? 'tolerability' : 'outcome'
    const confidence: TimingConfidence = tolerability?.reason.confidence ?? 'high'

    const statements: PlanStatement[] = []
    if (suggested === 'any_consistent_time') {
      statements.push({
        text: t('sim.timing.text.anyTimeStatement', {
          name,
          label: timeLabel(t, 'any_consistent_time'),
        }),
        basis: literature(TIMING_EVIDENCE.time2022),
      })
    } else {
      statements.push({
        text: t('sim.timing.text.takeAtStatement', { name, label: timeLabel(t, suggested) }),
        basis: tolerability!.reason.basis,
      })
    }
    for (const r of reasons) statements.push({ text: r.text, basis: r.basis })

    if (substanceId === 'metoprolol') {
      const contrast = metoprololFormContrast(mgPerDay, dose.form, t)
      if (contrast) statements.push(contrast)
    }

    drugs.push({
      substanceId,
      name,
      perDay,
      suggested,
      suggestedLabel: timeLabel(t, suggested),
      firstDose,
      primaryKind,
      confidence,
      claimsOutcomeBenefit: false,
      reasons,
      coverage,
      statements,
    })
  }

  const statements: PlanStatement[] = [
    {
      text: t('sim.timing.text.threeKinds'),
      basis: { kind: 'engine', computation: 'src/report/timing.ts — TimingClaimKind, one tag per reason' },
    },
    {
      text: t('sim.timing.text.noGuidelineTiming'),
      basis: { kind: 'unavailable', reason: 'data/rules.json contains no dose-timing effect for any substance' },
    },
  ]

  // The two gaps that matter, both about the one subgroup where the question is still open.
  // `why` is rendered in the report's limits section, so it translates; the file paths and
  // the quoted `validity_limits` entry inside it do not.
  gaps.push({
    section: 'timing',
    what: t('sim.timing.text.gapNonDipperWhat'),
    why: t('sim.timing.text.gapNonDipperWhy'),
  })
  gaps.push({
    section: 'timing',
    what: t('sim.timing.text.gapMorningEveningWhat'),
    why: t('sim.timing.text.gapMorningEveningWhy'),
  })

  return { heading: t('sim.timing.heading'), drugs, outcomeEvidence, statements }
}
