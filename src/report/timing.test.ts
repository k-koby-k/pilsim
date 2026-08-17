/**
 * Dose-timing tests.
 *
 * The headline test in this file is `does not claim an outcome benefit the evidence does
 * not support`. Everything else exists to keep the three kinds of claim from bleeding into
 * each other, because that bleed is the failure mode: a tolerability sentence that reads
 * like an outcome promise is worse than no timing feature at all.
 *
 * Like the rest of the report suite these run against the SHIPPED data files.
 */

import { describe, expect, it } from 'vitest'
import type { PatientInputs, Regimen, RunSummary } from '../types'
import { loadDataFromDisk } from '../rules/testData'
import { deriveTwin } from '../rules/twin'
import { evaluateRules } from '../rules/evaluate'
import { rankOptions, type ScoreCandidate } from './score'
import { buildTreatmentPlan, planToPlainText, type TreatmentPlan } from './plan'
import {
  DOSE_TIME_LABEL,
  TIMING_EVIDENCE,
  buildTimingOutcomeEvidence,
  type DoseTiming,
  type DoseTimingReason,
} from './timing'
import {
  TIMING_MARKED_TROUGH_FRACTION,
  TIMING_NEGLIGIBLE_TROUGH_FRACTION,
  doseIntervalCoverage,
} from '../engine/timing'

const data = loadDataFromDisk()
const { patientModel, rules } = data

function twinOf(over: Partial<PatientInputs> = {}) {
  return deriveTwin(
    {
      age_years: 55,
      sex: 'male',
      weight_kg: 82,
      height_cm: 176,
      sbp_mmHg: 152,
      dbp_mmHg: 94,
      hr_bpm: 74,
      comorbidities: [],
      ...over,
    },
    patientModel,
  )
}

const SUMMARY: RunSummary = {
  deltaSbp: 12,
  deltaDbp: 7,
  peakConc: {},
  troughConc: {},
  hazards: {},
  finalChem: {
    plasma_volume: 3,
    ecf_volume: 17,
    serum_k: 4.6,
    serum_na: 140,
    serum_urate: 6.1,
    serum_creatinine: 1.0,
    fasting_glucose: 95,
  },
  framesEmitted: 288,
}

function reg(id: string, doses: [string, number, number][]): Regimen {
  return {
    id,
    label: id,
    doses: doses.map(([s, mg, perDay]) => ({ substanceId: s, mg, perDay }) as never),
  }
}

function planFor(regimens: Regimen[], patient = twinOf()): TreatmentPlan {
  const candidates: ScoreCandidate[] = regimens.map((r) => ({
    regimen: r,
    summary: SUMMARY,
    modifiers: evaluateRules(patient, r, rules, {}),
  }))
  const ranked = rankOptions({ patient, candidates, data })
  const chosen = ranked.find((o) => o.regimen.id === regimens[0].id) ?? ranked[0]
  return buildTreatmentPlan({
    patient,
    ranked,
    chosen,
    summary: SUMMARY,
    data,
    modifiers: evaluateRules(patient, regimens[0], rules, {}),
  })
}

const HCTZ = reg('hctz', [['hydrochlorothiazide', 25, 1]])
const AMLODIPINE = reg('amlodipine', [['amlodipine', 5, 1]])
const LISINOPRIL = reg('lisinopril', [['lisinopril', 20, 1]])
const LOSARTAN = reg('losartan', [['losartan', 50, 1]])
const METOPROLOL_OD = reg('metoprolol od', [['metoprolol', 100, 1]])
const METOPROLOL_BD = reg('metoprolol bd', [['metoprolol', 50, 2]])

function timingFor(regimens: Regimen[], substanceId: string): DoseTiming {
  const t = planFor(regimens).timing.drugs.find((d) => d.substanceId === substanceId)
  expect(t, `no DoseTiming for ${substanceId}`).toBeDefined()
  return t!
}

function reasonsOfKind(t: DoseTiming, kind: DoseTimingReason['kind']): DoseTimingReason[] {
  return t.reasons.filter((r) => r.kind === kind)
}

/** Words that would turn a timing sentence into a promise about events. */
const OUTCOME_BENEFIT_WORDS =
  /(reduce|reduces|reducing|lower|lowers|prevent|prevents|preventing|protect|protects|cut|cuts)\b[^.]{0,80}\b(heart attack|myocardial infarction|stroke|death|deaths|mortality|cardiovascular (?:risk|event|events))/i

// ---------------------------------------------------------------------------
// The claim the product must never make
// ---------------------------------------------------------------------------

describe('dose timing — the outcome claim the evidence does not support', () => {
  const plan = planFor([HCTZ, LISINOPRIL, AMLODIPINE])

  it('never claims that a suggested time reduces cardiovascular events', () => {
    // The structural half: the type says `false` and every instance honours it.
    for (const d of plan.timing.drugs) {
      expect(d.claimsOutcomeBenefit, d.name).toBe(false)
    }
    expect(plan.timing.outcomeEvidence.verdict).toBe('no_established_outcome_benefit')

    // The prose half, which is the one that could actually mislead a reader. Any sentence
    // that pairs a benefit verb with a cardiovascular endpoint must be NEGATED — "has NOT
    // been shown to prevent", "found no difference" — never asserted.
    const sentences = [
      ...plan.timing.statements,
      ...plan.timing.outcomeEvidence.statements,
      ...plan.timing.drugs.flatMap((d) => d.statements),
      ...plan.timing.drugs.flatMap((d) => d.reasons.map((r) => ({ text: r.text, basis: r.basis }))),
    ].flatMap((s) => s.text.split(/(?<=[.:;])\s+/))

    const asserted = sentences.filter(
      (s) =>
        OUTCOME_BENEFIT_WORDS.test(s) &&
        !/\bnot\b|\bno\b|\bnever\b|\bnothing\b|\bdid not\b|\bcannot\b|\bwithout\b/i.test(s),
    )
    expect(asserted, `unnegated outcome-benefit claim:\n${asserted.join('\n')}`).toEqual([])
  })

  it('says so out loud rather than staying silent, because silence reads as agreement', () => {
    const text = plan.timing.outcomeEvidence.statements.map((s) => s.text).join(' ')
    expect(text).toMatch(/has NOT been shown to prevent heart attacks, strokes or deaths/)
    expect(text).toMatch(/this product does not agree/i)
  })

  it('states BOTH sides of the disagreement with their own numbers, as the dose-step section does', () => {
    const text = plan.timing.outcomeEvidence.statements.map((s) => s.text).join(' ')
    // The trials that found nothing, with their effect sizes.
    expect(text).toContain('21 104')
    expect(text).toContain('0.95')
    expect(text).toContain('0.96')
    // The trials that reported a benefit, named rather than buried.
    expect(text).toMatch(/MAPEC/)
    expect(text).toMatch(/Hygia/)
    // And precisely what separates them.
    expect(text).toMatch(/Expressions of Concern/)
    expect(text).toMatch(/Missing Verification of Source Data/)
    expect(text).toMatch(/Neither has been retracted/)
  })

  it('does not reproduce the contested trial’s effect size', () => {
    // Quoting a precise hazard ratio from a paper carrying two Expressions of Concern puts
    // a memorable number in front of a reader with no way to weigh it. The claim is quoted;
    // the number is not.
    const hygiaSentence = plan.timing.outcomeEvidence.statements
      .map((s) => s.text)
      .find((t) => t.includes('Hygia'))!
    expect(hygiaSentence).toMatch(/does not reproduce Hygia's effect size/)
    expect(TIMING_EVIDENCE.hygia2020.quote).toBe(
      'Bedtime hypertension treatment improves cardiovascular risk reduction',
    )
    expect(TIMING_EVIDENCE.hygia2020.note).toMatch(/CONTESTED/)
    expect(TIMING_EVIDENCE.hygia2020.confidence).toBe('LOW')
  })

  it('keeps the surrogate endpoint labelled as a surrogate', () => {
    const oman = plan.timing.outcomeEvidence.statements.map((s) => s.text).find((t) => t.includes('OMAN'))!
    expect(oman).toMatch(/surrogate/i)
    expect(oman).toMatch(/No trial has shown/)
    expect(TIMING_EVIDENCE.oman2025.note).toMatch(/SURROGATE ENDPOINT, NOT EVENTS/)
  })

  it('answers the mirror-image safety worry too, rather than only the benefit claim', () => {
    const text = plan.timing.outcomeEvidence.statements.map((s) => s.text).join(' ')
    expect(text).toMatch(/falls or fractures/)
    expect(text).toMatch(/glaucoma/)
    expect(text).toMatch(/not "night-time dosing is dangerous" either/)
  })
})

// ---------------------------------------------------------------------------
// The three kinds of claim, kept apart
// ---------------------------------------------------------------------------

describe('dose timing — the three kinds of claim', () => {
  it('tags every reason with exactly one kind, and cites or computes all of them', () => {
    const plan = planFor([reg('all', [
      ['hydrochlorothiazide', 25, 1],
      ['lisinopril', 20, 1],
    ])])
    expect(plan.timing.drugs.length).toBe(2)
    for (const d of plan.timing.drugs) {
      expect(d.reasons.length).toBeGreaterThan(1)
      for (const r of d.reasons) {
        expect(['outcome', 'tolerability', 'pharmacokinetic']).toContain(r.kind)
        expect(['high', 'moderate', 'low']).toContain(r.confidence)
        expect(r.text.length).toBeGreaterThan(40)
        // Outcome reasons must carry a citation; PK reasons must name a computation.
        if (r.kind === 'outcome') expect(r.basis.kind).toBe('literature')
        if (r.kind === 'pharmacokinetic') expect(r.basis.kind).toBe('engine')
        if (r.kind === 'tolerability') expect(r.basis.kind).toBe('dataset')
      }
      // Every drug carries the outcome answer, so a renderer showing one drug alone
      // still shows it.
      expect(reasonsOfKind(d, 'outcome').length).toBe(1)
      expect(reasonsOfKind(d, 'pharmacokinetic').length).toBe(1)
    }
  })

  it('only ever lets a TOLERABILITY reason name an hour', () => {
    for (const regimens of [[HCTZ], [AMLODIPINE], [LISINOPRIL], [LOSARTAN], [METOPROLOL_OD]]) {
      const d = planFor(regimens).timing.drugs[0]
      if (d.suggested === 'any_consistent_time') {
        expect(d.primaryKind, d.name).toBe('outcome')
      } else {
        expect(d.primaryKind, d.name).toBe('tolerability')
        expect(reasonsOfKind(d, 'tolerability').length, d.name).toBeGreaterThan(0)
      }
    }
  })

  it('never presents a citation that is not actually a citation', () => {
    // losartan's hypotension incidence is NOT_FOUND in the dataset ("Rate not extracted
    // within timebox"). Rendering that under a Source: heading would dress an admission of
    // ignorance up as evidence.
    const losartan = timingFor([LOSARTAN], 'losartan')
    for (const r of losartan.reasons) {
      if (r.citation) expect(r.citation.status, r.text).toBe('CITED')
    }
    expect(reasonsOfKind(losartan, 'tolerability')[0]?.citation).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// "No best time" as a first-class answer
// ---------------------------------------------------------------------------

describe('dose timing — "the same time each day" is an answer, not a blank', () => {
  it('states it confidently for the drugs where it is the honest answer', () => {
    for (const [regimens, id] of [
      [[AMLODIPINE], 'amlodipine'],
      [[LISINOPRIL], 'lisinopril'],
      [[LOSARTAN], 'losartan'],
      [[METOPROLOL_OD], 'metoprolol'],
    ] as const) {
      const d = timingFor([...regimens], id)
      expect(d.suggested, id).toBe('any_consistent_time')
      expect(d.confidence, id).toBe('high')
      expect(d.suggestedLabel).toBe(DOSE_TIME_LABEL.any_consistent_time)
      expect(d.statements[0].text).toMatch(/That is the answer, not a missing one/)
    }
  })

  it('distinguishes "no best hour" from "any hour on any day"', () => {
    const text = buildTimingOutcomeEvidence()
      .statements.map((s) => s.text)
      .join(' ')
    expect(text).toMatch(/"no best hour" is not "any hour on any day"/)
    expect(text).toMatch(/one consistent time, not a moving one/)
  })
})

// ---------------------------------------------------------------------------
// Tolerability — the part that genuinely helps
// ---------------------------------------------------------------------------

describe('dose timing — tolerability', () => {
  it('puts the thiazide in the morning, on the label’s own diuresis figures', () => {
    const d = timingFor([HCTZ], 'hydrochlorothiazide')
    expect(d.suggested).toBe('morning')
    expect(d.primaryKind).toBe('tolerability')
    expect(d.confidence).toBe('high')

    const reason = reasonsOfKind(d, 'tolerability')[0]
    expect(reason.text).toMatch(/2 hours after the dose/)
    expect(reason.text).toMatch(/6–12 hours/)
    expect(reason.text).toMatch(/wakes you to pass urine/)
    // And it refuses to be mistaken for a cardiovascular claim.
    expect(reason.text).toMatch(/about your sleep, not about your heart/)
    expect(reason.citation?.status).toBe('CITED')
    expect(reason.citation?.quote).toMatch(/lasts about 6 to 12 hours/)
    expect(reason.basis.kind).toBe('dataset')
    if (reason.basis.kind === 'dataset') {
      expect(reason.basis.field).toBe('hydrochlorothiazide.pd.clinical_effect.duration_h')
    }
  })

  it('moves only the FIRST ACE-inhibitor / ARB dose to bedtime, and marks it as an inference', () => {
    for (const [regimens, id] of [
      [[LISINOPRIL], 'lisinopril'],
      [[LOSARTAN], 'losartan'],
    ] as const) {
      const d = timingFor([...regimens], id)
      expect(d.firstDose, id).not.toBeNull()
      expect(d.firstDose!.suggested).toBe('bedtime')
      // The ONGOING dose is not moved — only the first one.
      expect(d.suggested, id).toBe('any_consistent_time')
      const r = d.firstDose!.reason
      expect(r.kind).toBe('tolerability')
      // The hazard is cited; the remedy is inferred, and the confidence says so.
      expect(r.confidence).toBe('moderate')
      expect(r.text).toMatch(/inference FROM it and not a labelled instruction/)
      expect(r.text).toMatch(/already lying down/)
    }
  })

  it('gives amlodipine and metoprolol no tolerability-driven hour, because the data supports none', () => {
    for (const [regimens, id] of [
      [[AMLODIPINE], 'amlodipine'],
      [[METOPROLOL_OD], 'metoprolol'],
    ] as const) {
      const d = timingFor([...regimens], id)
      expect(reasonsOfKind(d, 'tolerability').length, id).toBe(0)
      expect(d.firstDose, id).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Pharmacokinetics — derived from the engine, not asserted
// ---------------------------------------------------------------------------

describe('dose timing — pharmacokinetic room', () => {
  it('derives amlodipine’s flatness rather than asserting it', () => {
    const d = timingFor([AMLODIPINE], 'amlodipine')
    expect(d.coverage.effectiveHalfLifeH).toBe(40)
    expect(d.coverage.troughFractionOfPeak).toBeGreaterThan(TIMING_NEGLIGIBLE_TROUGH_FRACTION)
    expect(d.coverage.sensitivity).toBe('negligible')
    expect(d.coverage.peakTroughRatio).toBeLessThan(1.5)
    expect(reasonsOfKind(d, 'pharmacokinetic')[0].text).toMatch(/close to irrelevant/)
  })

  it('reads losartan through EXP3174, whose half-life is the one that makes daily dosing work', () => {
    const d = timingFor([LOSARTAN], 'losartan')
    expect(d.coverage.effectiveSpeciesId).toBe('exp3174')
    expect(d.coverage.effectiveHalfLifeH).toBe(7.4)
    expect(reasonsOfKind(d, 'pharmacokinetic')[0].text).toMatch(/metabolite EXP3174/)
    // The parent's own 2.1 h half-life must not be the number the reader is given.
    expect(reasonsOfKind(d, 'pharmacokinetic')[0].text).not.toMatch(/2\.1 h/)
  })

  it('separates metoprolol immediate-release from extended-release and from a divided dose', () => {
    const od = timingFor([METOPROLOL_OD], 'metoprolol')
    expect(od.coverage.sensitivity).toBe('marked')
    expect(od.coverage.troughFractionOfPeak).toBeLessThan(TIMING_MARKED_TROUGH_FRACTION)

    const contrast = od.statements.map((s) => s.text).find((t) => t.startsWith('Concretely:'))!
    expect(contrast).toMatch(/extended-release succinate/)
    expect(contrast).toMatch(/not the clock/)

    // Twice daily is a genuinely different profile, and the engine says so.
    const bd = timingFor([METOPROLOL_BD], 'metoprolol')
    expect(bd.coverage.intervalH).toBe(12)
    expect(bd.coverage.peakTroughRatio).toBeLessThan(od.coverage.peakTroughRatio / 5)
    expect(bd.coverage.sensitivity).not.toBe('marked')
    expect(reasonsOfKind(bd, 'pharmacokinetic')[0].text).toMatch(/spacing rather than which hour/)
  })

  it('orders the five drugs by how much room timing has, from the engine alone', () => {
    const frac = (id: string, mg: number, perDay = 1) =>
      doseIntervalCoverage({ substanceId: id as never, mg, perDay }).troughFractionOfPeak
    // Amlodipine flattest, metoprolol IR once daily by far the peakiest.
    expect(frac('amlodipine', 5)).toBeGreaterThan(frac('lisinopril', 20))
    expect(frac('lisinopril', 20)).toBeGreaterThan(frac('hydrochlorothiazide', 25))
    expect(frac('hydrochlorothiazide', 25)).toBeGreaterThan(frac('losartan', 50))
    expect(frac('losartan', 50)).toBeGreaterThan(frac('metoprolol', 100))
  })

  it('is a property of the drug, not of the dose', () => {
    const a = doseIntervalCoverage({ substanceId: 'amlodipine', mg: 5, perDay: 1 })
    const b = doseIntervalCoverage({ substanceId: 'amlodipine', mg: 10, perDay: 1 })
    expect(b.peakTroughRatio).toBeCloseTo(a.peakTroughRatio, 6)
  })
})

// ---------------------------------------------------------------------------
// Honesty about what the product cannot do
// ---------------------------------------------------------------------------

describe('dose timing — what it refuses to answer', () => {
  const plan = planFor([HCTZ, AMLODIPINE])

  it('records that it cannot identify the one subgroup where the question is still open', () => {
    const gap = plan.gaps.find(
      (g) => g.section === 'timing' && /bedtime dose/.test(g.what),
    )
    expect(gap).toBeDefined()
    expect(gap!.why).toMatch(/no dipper\/non-dipper pattern/)
    expect(gap!.why).toMatch(/validity_limits\.not_modelled/)
  })

  it('refuses to simulate a morning-versus-evening comparison whose answer it already fixed', () => {
    const gap = plan.gaps.find(
      (g) => g.section === 'timing' && /morning against an evening dose/.test(g.what),
    )
    expect(gap).toBeDefined()
    expect(gap!.why).toMatch(/no circadian rhythm/)
  })

  it('does not dress the trials up as a guideline recommendation', () => {
    const s = plan.timing.statements.find((x) => x.text.includes('guideline layer'))!
    expect(s.basis.kind).toBe('unavailable')
    expect(s.text).toMatch(/data\/rules\.json emits no timing effect/)
    // Nothing in the timing section may claim `guideline` provenance.
    const all = [
      ...plan.timing.statements,
      ...plan.timing.outcomeEvidence.statements,
      ...plan.timing.drugs.flatMap((d) => d.statements),
    ]
    expect(all.some((x) => x.basis.kind === 'guideline')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('dose timing — in the plan', () => {
  // One ARM containing two drugs, not two competing arms — the timing section is written
  // for the regimen the plan actually starts.
  const plan = planFor([
    reg('hctz + lisinopril', [
      ['hydrochlorothiazide', 25, 1],
      ['lisinopril', 20, 1],
    ]),
  ])

  it('appears in the plain-text plan with the outcome verdict before any suggested hour', () => {
    const text = planToPlainText(plan)
    const section = text.indexOf(plan.timing.heading.toUpperCase())
    expect(section).toBeGreaterThan(0)
    const verdict = text.indexOf('has NOT been shown to prevent heart attacks')
    const hour = text.indexOf('in the morning', section)
    expect(verdict).toBeGreaterThan(section)
    expect(verdict).toBeLessThan(hour)
  })

  it('prints the coverage arithmetic and the sources beside every drug', () => {
    const text = planToPlainText(plan)
    expect(text).toMatch(/Coverage: [\d.]+-fold peak-to-trough over 24 h/)
    expect(text).toMatch(/\[outcome\] Source: Mackenzie IS/)
    expect(text).toMatch(/\[tolerability\] Source: FDA label, Hydrochlorothiazide/)
  })

  it('covers every drug in the started regimen, once each', () => {
    expect(plan.timing.drugs.map((d) => d.substanceId).sort()).toEqual([
      'hydrochlorothiazide',
      'lisinopril',
    ])
  })
})
