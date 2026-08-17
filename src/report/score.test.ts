import { describe, expect, it } from 'vitest'
import type { EffectFrame, PatientInputs, Regimen, RunSummary } from '../types'
import { loadDataFromDisk } from '../rules/testData'
import { deriveTwin } from '../rules/twin'
import { evaluateRules } from '../rules/evaluate'
import {
  DISCLAIMER_FULL,
  DISCLAIMER_SHORT,
  DISCLAIMER_SHORT_I18N,
  FORMULATION_REFUSAL_TEXT,
} from './disclaimer'
import {
  SCORE_WEIGHTS,
  defaultWeights,
  formulationDataAvailable,
  formulationRefusal,
  rankOptions,
  resetWeights,
  type ScoreCandidate,
} from './score'

const data = loadDataFromDisk()
const { rules, patientModel } = data

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

function regimen(id: string, doses: [string, number, number][]): Regimen {
  return {
    id,
    label: id,
    doses: doses.map(([substanceId, mg, perDay]) => ({ substanceId, mg, perDay }) as never),
  }
}

const CHEM: EffectFrame['chem'] = {
  plasma_volume: 3,
  ecf_volume: 17,
  serum_k: 4.2,
  serum_na: 140,
  serum_urate: 5.5,
  serum_creatinine: 0.9,
  fasting_glucose: 90,
}

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    deltaSbp: 12,
    deltaDbp: 7,
    peakConc: { lisinopril: 60 },
    troughConc: { lisinopril: 24 },
    hazards: {},
    finalChem: { ...CHEM },
    framesEmitted: 288,
    ...over,
  }
}

function candidate(
  patient: ReturnType<typeof twinOf>,
  reg: Regimen,
  over: Partial<ScoreCandidate> = {},
): ScoreCandidate {
  return {
    regimen: reg,
    summary: summary(),
    modifiers: evaluateRules(patient, reg, rules, over.modifiers ? undefined : {}) as never,
    ...over,
  }
}

describe('report — the disclaimer is verbatim', () => {
  it('carries the exact normative wording', () => {
    expect(DISCLAIMER_SHORT).toBe('Simulation only — not medical advice. Not a validated medical device.')
    expect(DISCLAIMER_FULL).toContain('This is a simulation, not medical advice.')
    expect(DISCLAIMER_FULL).toContain('It has not been clinically validated, it is not a medical device')
    expect(DISCLAIMER_FULL).toContain(
      'Every number here carries a source or is marked as an estimate. Where we could not find a value, we say so rather than guess.',
    )
    expect(DISCLAIMER_SHORT_I18N.uz).toContain('Faqat simulyatsiya')
    expect(DISCLAIMER_SHORT_I18N.ru).toContain('Только симуляция')
  })
})

describe('report — refusal where data is absent', () => {
  it('refuses to rank formulations for lisinopril, losartan and hydrochlorothiazide', () => {
    for (const id of ['lisinopril', 'losartan', 'hydrochlorothiazide']) {
      expect(formulationDataAvailable(id, data), id).toBe(false)
      const r = formulationRefusal(id, data)
      expect(r, id).not.toBeNull()
      expect(r!.reason).toBe(FORMULATION_REFUSAL_TEXT)
      expect(r!.citation?.status).toBe('NOT_FOUND')
      expect(r!.citation?.note).toMatch(/section 5\.4/)
    }
  })

  it('DOES rank formulations for metoprolol, because the release-profile data was sourced', () => {
    expect(formulationDataAvailable('metoprolol', data)).toBe(true)
    expect(formulationRefusal('metoprolol', data)).toBeNull()
  })

  it('surfaces the refusal on the ranked option rather than inventing a score', () => {
    const t = twinOf()
    const ranked = rankOptions({
      patient: t,
      data,
      candidates: [candidate(t, regimen('lisinopril-10', [['lisinopril', 10, 1]]))],
    })
    expect(ranked[0].formulation.available).toBe(false)
    expect(ranked[0].formulation.score).toBeNull()
    expect(ranked[0].refusal?.reason).toBe(FORMULATION_REFUSAL_TEXT)
    // The arm still ranks on efficacy/safety/appropriateness — only the formulation
    // sub-question refuses.
    expect(ranked[0].score).toBeGreaterThan(0)
  })
})

describe('report — ranking', () => {
  it('never ranks a DISQUALIFIED arm, and shows it no numbers', () => {
    const t = twinOf({ sex: 'female', pregnant: true, age_years: 31 })
    const lis = regimen('lisinopril-10', [['lisinopril', 10, 1]])
    const amlo = regimen('amlodipine-5', [['amlodipine', 5, 1]])
    const ranked = rankOptions({
      patient: t,
      data,
      candidates: [candidate(t, lis), candidate(t, amlo)],
    })
    const blocked = ranked.find((r) => r.regimen.id === 'lisinopril-10')!
    expect(blocked.tier).toBe('DISQUALIFIED')
    expect(ranked[ranked.length - 1].regimen.id).toBe('lisinopril-10')
    expect(blocked.score).toBe(0)
    expect(blocked.efficacyTerm).toBe(0)
    expect(blocked.safetyTerm).toBe(0)
    expect(blocked.refusal?.reason).toMatch(/not ranked/)
    expect(blocked.refusal?.citation?.url).toMatch(/fda\.gov/)
    expect(blocked.reasons.join(' ')).toMatch(/fetal/i)
  })

  it('ranks an OVERRIDE_REQUIRED arm below every ALLOWED arm', () => {
    const t = twinOf({ comorbidities: ['gout'] })
    const hctz = regimen('hctz-25', [['hydrochlorothiazide', 25, 1]])
    const los = regimen('losartan-50', [['losartan', 50, 1]])
    const ranked = rankOptions({
      patient: t,
      data,
      candidates: [
        // give the disfavoured arm the BIGGER blood-pressure effect on purpose
        candidate(t, hctz, { summary: summary({ deltaSbp: 20 }) }),
        candidate(t, los, { summary: summary({ deltaSbp: 10 }) }),
      ],
    })
    expect(ranked[0].regimen.id).toBe('losartan-50')
    expect(ranked[0].tier).toBe('ALLOWED')
    expect(ranked[1].tier).toBe('OVERRIDE_REQUIRED')
    // and the reason, in words, not just a number
    expect(ranked[1].reasons.join(' ')).toMatch(/avoid, not forbid/)
    expect(ranked[0].appropriatenessTerm).toBeGreaterThan(ranked[1].appropriatenessTerm)
  })

  it('exposes E, S and A alongside the composite, always', () => {
    const t = twinOf()
    const ranked = rankOptions({
      patient: t,
      data,
      candidates: [candidate(t, regimen('amlodipine-5', [['amlodipine', 5, 1]]))],
    })
    const r = ranked[0]
    expect(Number.isInteger(r.efficacyTerm)).toBe(true)
    expect(Number.isInteger(r.safetyTerm)).toBe(true)
    expect(Number.isInteger(r.appropriatenessTerm)).toBe(true)
    expect(r.composite).toBe(r.score)
    expect(r.reasons.length).toBeGreaterThanOrEqual(2)
    expect(r.target.label).toBe('<130/80 mmHg')
    expect(r.populationN).toBe(1)
  })

  it('penalises lab excursions using ranges read from patient_model.json', () => {
    const t = twinOf()
    const reg = regimen('hctz-50', [['hydrochlorothiazide', 50, 1]])
    const clean = rankOptions({ patient: t, data, candidates: [candidate(t, reg)] })[0]
    const hypoK = rankOptions({
      patient: t,
      data,
      candidates: [candidate(t, reg, { summary: summary({ finalChem: { ...CHEM, serum_k: 3.1 } }) })],
    })[0]
    expect(hypoK.penalties.lab).toBeGreaterThan(clean.penalties.lab)
    expect(hypoK.safetyTerm).toBeLessThan(clean.safetyTerm)
    expect(hypoK.reasons.join(' ')).toMatch(/reference range/)
  })

  it('lets the safety floor beat the weighted sum', () => {
    const t = twinOf({ comorbidities: ['asthma'] })
    const meto = regimen('metoprolol-100', [['metoprolol', 50, 2]])
    const amlo = regimen('amlodipine-5', [['amlodipine', 5, 1]])
    const ranked = rankOptions({
      patient: t,
      data,
      candidates: [
        candidate(t, meto, { summary: summary({ deltaSbp: 24 }) }),
        candidate(t, amlo, { summary: summary({ deltaSbp: 8 }) }),
      ],
    })
    expect(ranked[0].regimen.id).toBe('amlodipine-5')
  })
})

describe('report — weights are tunable and all ESTIMATED', () => {
  it('composite weights are 0.40 / 0.35 / 0.25 by default', () => {
    const w = defaultWeights()
    expect(w.efficacy).toBe(0.4)
    expect(w.safety).toBe(0.35)
    expect(w.appropriateness).toBe(0.25)
    expect(w.eff_goalAttainment + w.eff_effectMagnitude + w.eff_dailyCoverage).toBeCloseTo(1, 9)
    expect(w.form_troughToPeak + w.form_fluctuation + w.form_forgiveness + w.form_adherence).toBeCloseTo(1, 9)
  })

  it('the severity ladder is super-linear, so one major rule outweighs several minor ones', () => {
    const w = defaultWeights()
    expect(w.pen_rank4_moderate).toBeGreaterThan(2 * w.pen_rank3_minor)
    expect(w.pen_rank5_major).toBeGreaterThan(2 * w.pen_rank4_moderate)
    expect(w.pen_rank6_contraindicated_relative).toBeGreaterThan(w.pen_rank5_major)
  })

  it('adverse-event weights order airway and potassium above cough and oedema', () => {
    const w = defaultWeights()
    expect(w.risk_angioedema).toBeGreaterThan(w.risk_bronchospasm)
    expect(w.risk_bronchospasm).toBeGreaterThan(w.risk_hyperkalemia)
    expect(w.risk_hyperkalemia).toBeGreaterThan(w.risk_peripheral_edema)
    expect(w.risk_peripheral_edema).toBeGreaterThan(w.risk_cough)
  })

  it('moving a slider moves the ranking', () => {
    const t = twinOf({ comorbidities: ['gout'] })
    const hctz = regimen('hctz-25', [['hydrochlorothiazide', 25, 1]])
    const before = rankOptions({ patient: t, data, candidates: [candidate(t, hctz)] })[0]
    SCORE_WEIGHTS.risk_gout_flare = 1.0
    SCORE_WEIGHTS.pen_rank6_contraindicated_relative = 90
    const after = rankOptions({ patient: t, data, candidates: [candidate(t, hctz)] })[0]
    expect(after.safetyTerm).toBeLessThan(before.safetyTerm)
    resetWeights()
    expect(SCORE_WEIGHTS.pen_rank6_contraindicated_relative).toBe(45)
  })
})

// ---------------------------------------------------------------------------
// Dose sensitivity. research/06-VALIDATION.md §4.4: "If the engine's scoring never
// returns a sub-maximal dose for any archetype, the scoring is broken."
// ---------------------------------------------------------------------------

import { runSimulationSync } from '../engine/run'
import type { DrugId } from '../types'

function armsFor(patient: ReturnType<typeof twinOf>, drug: string, doses: number[]): ScoreCandidate[] {
  return doses.map((mg) => {
    const reg: Regimen = {
      id: `${drug}-${mg}`,
      label: `${drug} ${mg} mg`,
      doses: [{ substanceId: drug as DrugId, mg, perDay: 1 }],
    }
    const modifiers = evaluateRules(patient, reg, rules, { metoprololSalt: 'succinate_er' })
    const s = runSimulationSync({
      kind: 'run',
      runId: 'r',
      patient,
      regimen: reg,
      modifiers,
      options: { horizonHours: 48, outputEveryMin: 30, initial: 'steady_state' },
    }).summary
    return { regimen: reg, summary: s, modifiers: modifiers as never }
  })
}

describe('report — the safety term must be dose-sensitive', () => {
  it('reads the engine hazard channels, not just the dose-invariant rule risks', () => {
    const t = twinOf()
    const arms = armsFor(t, 'hydrochlorothiazide', [6.25, 50])
    // The rules quantify nothing numerically for HCTZ, so every bit of this arm's
    // adverse-event signal comes from RunSummary.hazards plus the lab excursions.
    expect(Object.keys(arms[0].modifiers.risks)).toHaveLength(0)
    const ranked = rankOptions({ patient: t, data, candidates: arms })
    const lo = ranked.find((r) => r.regimen.id.endsWith('6.25'))!
    const hi = ranked.find((r) => r.regimen.id.endsWith('50'))!
    expect(hi.safetyTerm).toBeLessThan(lo.safetyTerm)
  })

  it('penalises amlodipine oedema more at 10 mg than at 5 mg', () => {
    const t = twinOf()
    const ranked = rankOptions({ patient: t, data, candidates: armsFor(t, 'amlodipine', [2.5, 5, 10]) })
    const s = (mg: number) => ranked.find((r) => r.regimen.id === `amlodipine-${mg}`)!
    expect(s(10).penalties.risk).toBeGreaterThan(s(5).penalties.risk)
    expect(s(5).penalties.risk).toBeGreaterThan(s(2.5).penalties.risk)
    expect(s(10).safetyTerm).toBeLessThan(s(2.5).safetyTerm)
  })

  it('returns a sub-maximal dose for hydrochlorothiazide — §4.4 is satisfied', () => {
    const t = twinOf()
    const doses = [6.25, 12.5, 25, 50]
    const ranked = rankOptions({ patient: t, data, candidates: armsFor(t, 'hydrochlorothiazide', doses) })
    const bestMg = Number(ranked[0].regimen.id.split('-')[1])
    expect(bestMg).toBeLessThan(Math.max(...doses))
    // and the reason is legible, not just a number
    expect(ranked[0].reasons.join(' ')).toMatch(/potassium|reference range/i)
  })

  it('lets amlodipine land at the maximum, because that is what its data says', () => {
    // Amlodipine's fitted ED50 is ~1x the standard dose, so 5->10 mg still buys
    // 2.9 mmHg — label-confirmed. The oedema penalty is applied and real, it simply
    // does not overcome that gain in the reference male. This expectation exists so
    // nobody "fixes" it by tuning weights until amlodipine capitulates.
    const t = twinOf()
    const ranked = rankOptions({ patient: t, data, candidates: armsFor(t, 'amlodipine', [2.5, 5, 10]) })
    expect(ranked[0].regimen.id).toBe('amlodipine-10')
    expect(ranked[0].penalties.risk).toBeGreaterThan(0)
  })
})

describe('report — ranking must not depend on how an arm was named', () => {
  it('sorts on the unrounded composite and breaks true ties on the lower dose', () => {
    const t = twinOf()
    const arms = armsFor(t, 'losartan', [25, 100])
    // Force an exact tie by handing both arms identical inputs.
    arms[1].summary = { ...arms[0].summary }
    const ranked = rankOptions({ patient: t, data, candidates: arms })
    expect(ranked[0].regimen.id).toBe('losartan-25')

    // Reversing the alphabetical order of the ids must not change the winner.
    const relabelled = arms.map((a, i) => ({ ...a, regimen: { ...a.regimen, id: i === 0 ? 'zzz-25' : 'aaa-100' } }))
    const ranked2 = rankOptions({ patient: t, data, candidates: relabelled })
    expect(ranked2[0].regimen.doses[0].mg).toBe(25)
  })
})

describe('report — subgroup risk and its caveat reach the recommendation', () => {
  it('penalises amlodipine oedema harder in women, from the label sex table', () => {
    const m = twinOf({ sex: 'male' })
    const f = twinOf({ sex: 'female', weight_kg: 68, height_cm: 162 })
    const rm = rankOptions({ patient: m, data, candidates: armsFor(m, 'amlodipine', [10]) })[0]
    const rf = rankOptions({ patient: f, data, candidates: armsFor(f, 'amlodipine', [10]) })[0]
    expect(rf.penalties.risk).toBeGreaterThan(rm.penalties.risk)
    expect(rf.safetyTerm).toBeLessThan(rm.safetyTerm)
  })

  it('states the sex-by-dose interaction as an assumption, in the reasons, not a tooltip', () => {
    const f = twinOf({ sex: 'female', weight_kg: 68, height_cm: 162 })
    const r = rankOptions({ patient: f, data, candidates: armsFor(f, 'amlodipine', [2.5, 5, 10]) })[0]
    const chip = r.reasons.find((x) => x.startsWith('Modelling assumption'))
    expect(chip, `reasons were: ${JSON.stringify(r.reasons)}`).toBeDefined()
    expect(chip).toMatch(/assumed, not labelled/)
    // It must never read as though the label prescribes a lower dose in women.
    expect(r.reasons.join(' ')).not.toMatch(/label recommends|label prescribes/i)
  })

  it('reports near-tied arms as tied rather than ranking on a fraction of a point', () => {
    // Amlodipine 5 vs 10 mg in women separates by ~0.2 composite points at default
    // weights and flips on an oedema weight of 0.25 -> 0.30. Ranking that is a claim
    // the model cannot support.
    const f = twinOf({ sex: 'female', weight_kg: 68, height_cm: 162 })
    const ranked = rankOptions({ patient: f, data, candidates: armsFor(f, 'amlodipine', [2.5, 5, 10]) })
    const five = ranked.find((r) => r.regimen.id === 'amlodipine-5')!
    const ten = ranked.find((r) => r.regimen.id === 'amlodipine-10')!
    expect(Math.abs(five.compositeExact - ten.compositeExact)).toBeLessThan(1)
    expect(five.tiedWithLeader).toBe(true)
    expect(ten.tiedWithLeader).toBe(true)
    expect(ranked[0].reasons[0]).toMatch(/Too close to call/)
  })

  it('does not flag a tie when the arms are genuinely separated', () => {
    const t = twinOf()
    const ranked = rankOptions({ patient: t, data, candidates: armsFor(t, 'amlodipine', [2.5, 10]) })
    expect(ranked[0].regimen.id).toBe('amlodipine-10')
    expect(ranked.find((r) => r.regimen.id === 'amlodipine-2.5')!.tiedWithLeader).toBe(false)
  })
})
