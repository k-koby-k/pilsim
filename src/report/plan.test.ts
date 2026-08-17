/**
 * Treatment-plan tests.
 *
 * These run against the SHIPPED data files, like the rest of the report suite: the plan
 * is only worth anything if it composes the real rules, the real labels and the real
 * engine. Every assertion below is either "the plan says the clinically correct thing for
 * this patient" or "the plan refuses to say something the data cannot support".
 *
 * The five demo patients are the ones the pitch uses:
 *   1. diabetic with reduced kidney function  — monitoring and the renal starting dose
 *   2. gout on a thiazide                     — urate monitoring and the losartan swap
 *   3. asthmatic on metoprolol                — avoid, relative not absolute
 *   4. pregnant                               — most of the plan becomes what to avoid
 *   5. CYP2D6 poor metaboliser                — the starting dose itself changes
 */

import { describe, expect, it } from 'vitest'
import type { EffectFrame, PatientInputs, Regimen, RunSummary } from '../types'
import { loadDataFromDisk } from '../rules/testData'
import { deriveTwin } from '../rules/twin'
import { evaluateRules } from '../rules/evaluate'
import { rankOptions, type ScoreCandidate, type ScoredOption } from './score'
import { DISCLAIMER_FULL, DISCLAIMER_SHORT, DISCLAIMER_TITLE } from './disclaimer'
import {
  OUTLOOK_HEADING,
  buildTreatmentPlan,
  doseLadderMgPerDay,
  planToPlainText,
  type PlanStatement,
  type TreatmentPlan,
} from './plan'

const data = loadDataFromDisk()
const { rules, patientModel } = data

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const CHEM: EffectFrame['chem'] = {
  plasma_volume: 3,
  ecf_volume: 17,
  serum_k: 4.6,
  serum_na: 140,
  serum_urate: 6.1,
  serum_creatinine: 1.0,
  fasting_glucose: 95,
}

function reg(id: string, doses: [string, number, number][]): Regimen {
  return { id, label: id, doses: doses.map(([s, mg, perDay]) => ({ substanceId: s, mg, perDay }) as never) }
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

/** Rank a set of arms for a patient and build the plan, optionally forcing the arm. */
function planFor(
  patient: ReturnType<typeof twinOf>,
  regimens: Regimen[],
  forceRegimenId?: string,
): { plan: TreatmentPlan; ranked: ScoredOption[] } {
  const candidates: ScoreCandidate[] = regimens.map((r) => ({
    regimen: r,
    summary: summary(),
    modifiers: evaluateRules(patient, r, rules, {}),
  }))
  const ranked = rankOptions({ patient, candidates, data })
  const chosen = forceRegimenId ? ranked.find((o) => o.regimen.id === forceRegimenId) : undefined
  const target = chosen ?? ranked.find((o) => o.tier !== 'DISQUALIFIED') ?? ranked[0]
  const plan = buildTreatmentPlan({
    patient,
    ranked,
    chosen,
    modifiers: evaluateRules(patient, target.regimen, rules, {}),
    summary: summary(),
    data,
  })
  return { plan, ranked }
}

function allStatements(plan: TreatmentPlan): PlanStatement[] {
  return [
    ...plan.start.statements,
    ...plan.start.drugs.flatMap((d) => [...d.statements, ...d.reasons]),
    ...plan.titration.statements,
    ...plan.titration.steps.flatMap((s) => [...s.statements, ...(s.reconciliation?.statements ?? [])]),
    ...plan.target.statements,
    ...plan.timing.statements,
    ...plan.timing.outcomeEvidence.statements,
    ...plan.timing.drugs.flatMap((d) => d.statements),
    ...plan.monitoring.statements,
    ...plan.monitoring.items.flatMap((m) => m.actionStatements),
    ...plan.avoid.statements,
    ...plan.escalation.statements,
    ...(plan.escalation.doubling?.statements ?? []),
    ...(plan.escalation.addOn?.statements ?? []),
    ...plan.escalation.alternatives.flatMap((a) => a.statements),
    ...plan.tolerability.statements,
    ...plan.tolerability.swaps.flatMap((s) => s.statements),
    ...plan.outlook.statements,
  ]
}

const LISINOPRIL_20 = reg('lisinopril 20', [['lisinopril', 20, 1]])
const AMLODIPINE_5 = reg('amlodipine 5', [['amlodipine', 5, 1]])
const LOSARTAN_50 = reg('losartan 50', [['losartan', 50, 1]])
const HCTZ_25 = reg('hctz 25', [['hydrochlorothiazide', 25, 1]])
const METOPROLOL_100 = reg('metoprolol 100', [['metoprolol', 50, 2]])

// ---------------------------------------------------------------------------
// The contract every plan honours
// ---------------------------------------------------------------------------

describe('treatment plan — the contract', () => {
  const { plan } = planFor(twinOf(), [LISINOPRIL_20, AMLODIPINE_5])

  it('gives every clinical statement a traceable basis', () => {
    const kinds = new Set(['rule', 'dataset', 'engine', 'guideline', 'literature', 'unavailable'])
    const statements = allStatements(plan)
    expect(statements.length).toBeGreaterThan(10)
    for (const s of statements) {
      expect(s.text.length, s.text).toBeGreaterThan(0)
      expect(kinds.has(s.basis.kind), `${s.text} -> ${s.basis.kind}`).toBe(true)
      if (s.basis.kind === 'rule') expect(s.basis.ruleId.length).toBeGreaterThan(0)
      if (s.basis.kind === 'engine') expect(s.basis.computation.length).toBeGreaterThan(0)
      if (s.basis.kind === 'unavailable') expect(s.basis.reason.length).toBeGreaterThan(0)
      // A `literature` basis exists precisely so the reader can weigh the source, so an
      // uncited one would defeat the point of the kind.
      if (s.basis.kind === 'literature') {
        expect(s.basis.citation.source, s.text).toBeTruthy()
        expect(s.basis.citation.url, s.text).toBeTruthy()
      }
    }
  })

  it('reuses the normative disclaimer rather than retyping it', () => {
    expect(plan.disclaimer.title).toBe(DISCLAIMER_TITLE)
    expect(plan.disclaimer.full).toBe(DISCLAIMER_FULL)
    expect(plan.disclaimer.short).toBe(DISCLAIMER_SHORT)
  })

  it('carries every section a doctor would look for', () => {
    expect(plan.start.drugs.length).toBeGreaterThan(0)
    expect(plan.titration.steps.length).toBeGreaterThan(0)
    expect(plan.target.target.label).toBe('<130/80 mmHg')
    expect(plan.escalation.doubling).not.toBeNull()
    expect(plan.outlook.heading).toBe(OUTLOOK_HEADING)
  })

  it('renders to plain text with the disclaimer first and the short form last', () => {
    const text = planToPlainText(plan)
    expect(text.indexOf(DISCLAIMER_TITLE)).toBe(0)
    expect(text.trimEnd().endsWith(DISCLAIMER_SHORT)).toBe(true)
    for (const heading of [
      plan.start.heading,
      plan.titration.heading,
      plan.target.heading,
      plan.timing.heading,
      plan.monitoring.heading,
      plan.avoid.heading,
      plan.escalation.heading,
      plan.tolerability.heading,
      plan.outlook.heading,
    ]) {
      expect(text).toContain(heading.toUpperCase())
    }
    expect(text).toContain('WHAT THIS PLAN COULD NOT ANSWER')
  })

  it('reads the licensed dose ladder off the products file rather than doubling blindly', () => {
    // ZESTRIL SPL: "2.5 mg, 5 mg, 10 mg, 20 mg, 30 mg and 40 mg tablets".
    expect(doseLadderMgPerDay('lisinopril', 1, data)).toEqual([2.5, 5, 10, 20, 30, 40])
    // Twice-daily dosing doubles every rung, because the ladder is mg PER DAY.
    expect(doseLadderMgPerDay('lisinopril', 2, data)).toEqual([5, 10, 20, 40, 60, 80])
  })
})

// ---------------------------------------------------------------------------
// 1. The diabetic with reduced kidney function
// ---------------------------------------------------------------------------

describe('demo patient — diabetes with reduced kidney function', () => {
  const patient = twinOf({ comorbidities: ['t2dm', 'ckd'], serum_creatinine_mg_dl: 1.9, age_years: 64 })

  it('has the kidney disease the demo needs', () => {
    expect(patient.vars.egfr_ckdepi2021).toBeLessThan(60)
    expect(patient.vars.uacr_mg_g).toBeGreaterThanOrEqual(30)
  })

  it('schedules potassium, renal function and albuminuria with the guideline interval', () => {
    const { plan } = planFor(patient, [LISINOPRIL_20, AMLODIPINE_5])
    const labs = plan.monitoring.items.map((m) => m.lab)
    expect(labs).toContain('serum_k_mmol_L')
    expect(labs).toContain('egfr_ckdepi2021')
    expect(labs).toContain('uacr_mg_g')

    const potassium = plan.monitoring.items.find((m) => m.lab === 'serum_k_mmol_L')!
    expect(potassium.atDays).toContain(21)
    expect(potassium.ruleIds).toContain('CI-ALBUMINURIA-RAASI')
    // The monitoring INSTRUCTION comes from the rule's own quote, not from us.
    expect(potassium.actionStatements.some((s) => /electrolytes should be checked/i.test(s.text))).toBe(true)
    expect(potassium.actionRange).toEqual([3.5, 5])
  })

  it('surfaces the guideline preference for a RAAS inhibitor when escalating', () => {
    const { plan } = planFor(patient, [LISINOPRIL_20, AMLODIPINE_5])
    const pref = plan.escalation.statements.find((s) => /albuminuric CKD|diabetic kidney disease/i.test(s.text))
    expect(pref).toBeDefined()
    expect(pref!.basis.kind).toBe('rule')
    if (pref!.basis.kind === 'rule') expect(pref!.basis.ruleId).toBe('CI-ALBUMINURIA-RAASI')
  })

  it('halves the lisinopril starting dose once the label threshold is actually crossed', () => {
    const severe = twinOf({ comorbidities: ['t2dm', 'ckd'], ckd_stage: 'G4', age_years: 70 })
    expect(severe.vars.egfr_ckdepi2021).toBeGreaterThan(10)
    expect(severe.vars.egfr_ckdepi2021).toBeLessThanOrEqual(30)

    const { plan } = planFor(severe, [LISINOPRIL_20])
    const lisinopril = plan.start.drugs.find((d) => d.substanceId === 'lisinopril')!
    expect(lisinopril.startMgPerDay).toBe(5)
    expect(lisinopril.usualStartMgPerDay).toBe(10)
    expect(lisinopril.adjusted).toBe(true)

    const reason = lisinopril.reasons[0]
    expect(reason.text).toMatch(/rather than the usual adult start/)
    expect(reason.basis.kind).toBe('rule')
    if (reason.basis.kind === 'rule') {
      expect(reason.basis.ruleId).toBe('DOSE-RENAL-LISINOPRIL')
      expect(reason.basis.citation?.quote).toMatch(/half of the usual recommended dose/i)
    }
  })

  it('does NOT apply the renal reduction to a patient whose kidneys do not qualify', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20])
    const lisinopril = plan.start.drugs.find((d) => d.substanceId === 'lisinopril')!
    expect(lisinopril.startMgPerDay).toBe(10)
    expect(lisinopril.adjusted).toBe(false)
    expect(lisinopril.reasons).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Gout on a thiazide
// ---------------------------------------------------------------------------

describe('demo patient — gout', () => {
  const patient = twinOf({ comorbidities: ['gout'] })

  it('schedules urate where a thiazide meets gout, and judges it against the baseline', () => {
    const { plan } = planFor(patient, [HCTZ_25, LOSARTAN_50], 'hctz 25')
    const urate = plan.monitoring.items.find((m) => m.lab === 'serum_urate_mg_dL')
    expect(urate).toBeDefined()
    expect(urate!.atDays).toEqual([28, 90])
    expect(urate!.ruleIds).toContain('RX-GOUT-HCTZ')
    // This patient's urate is already above the reference range, so the plan must not
    // pretend the range is the decision rule.
    expect(patient.vars.serum_urate_mg_dL).toBeGreaterThan(urate!.actionRange![1])
    expect(urate!.actionStatements.some((s) => /baseline is already/.test(s.text))).toBe(true)
  })

  it('puts the thiazide in "what to avoid" with its citation, as a relative not absolute bar', () => {
    const { plan } = planFor(patient, [HCTZ_25, LOSARTAN_50], 'hctz 25')
    const item = plan.avoid.items.find((i) => i.ruleId === 'RX-GOUT-HCTZ')!
    expect(item).toBeDefined()
    expect(item.absolute).toBe(false)
    expect(item.severity).toBe('contraindicated_relative')
    expect(item.text).toMatch(/raise serum urate/i)
    expect(item.citation?.url).toBeTruthy()
    expect(plan.overrideRequired).toBeDefined()
  })

  it('names losartan as the preferred escalation, from the rule that says so', () => {
    const { plan } = planFor(patient, [HCTZ_25, LOSARTAN_50], 'hctz 25')
    const pref = plan.escalation.statements.find((s) => /Prefer Losartan/.test(s.text))
    expect(pref).toBeDefined()
    if (pref!.basis.kind === 'rule') expect(pref!.basis.ruleId).toBe('CI-GOUT-PREFER-LOSARTAN')
    // and the losartan arm is the offered swap if the thiazide is not tolerated
    const swap = plan.tolerability.swaps.find((s) => s.substanceId === 'hydrochlorothiazide')
    expect(swap?.switchTo?.regimen.id).toBe('losartan 50')
  })

  it('tells the doctor NOT to escalate the thiazide — flat efficacy, climbing harm', () => {
    const { plan } = planFor(patient, [HCTZ_25], 'hctz 25')
    const step = plan.titration.steps.find((s) => s.substanceId === 'hydrochlorothiazide')!
    expect(step.fromMgPerDay).toBe(12.5)
    expect(step.nextMgPerDay).toBe(25)
    expect(step.verdict).toBe('hold')
    expect(step.extraSbpDropMmHg!).toBeLessThan(3)
    expect(step.extraAdversePoints!).toBeGreaterThan(step.extraSbpDropMmHg!)
    expect(step.statements.some((s) => /Do NOT escalate/.test(s.text))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. The asthmatic
// ---------------------------------------------------------------------------

describe('demo patient — asthma', () => {
  const patient = twinOf({ comorbidities: ['asthma_copd'] })

  it('flags metoprolol as avoid-with-override, not as an absolute contraindication', () => {
    const { plan } = planFor(patient, [METOPROLOL_100, AMLODIPINE_5], 'metoprolol 100')
    const item = plan.avoid.items.find((i) => i.ruleId === 'RX-ASTHMA-METOPROLOL')!
    expect(item).toBeDefined()
    expect(item.absolute).toBe(false)
    expect(item.severity).toBe('contraindicated_relative')
    expect(item.text).toMatch(/NOT listed in the metoprolol CONTRAINDICATIONS section/i)
    expect(plan.overrideRequired).toBeDefined()
    // An arm without the override requirement existed and ranked higher — say so.
    expect(plan.overrideRequired!.reason).toMatch(/ranked higher/)
  })

  it('schedules the airway measurement the rule asks for', () => {
    const { plan } = planFor(patient, [METOPROLOL_100, AMLODIPINE_5], 'metoprolol 100')
    const fev1 = plan.monitoring.items.find((m) => m.lab === 'fev1_pct_predicted')
    expect(fev1).toBeDefined()
    expect(fev1!.atDays).toEqual([1, 7])
  })

  it('plans the calcium blocker instead when left to choose', () => {
    const { plan } = planFor(patient, [METOPROLOL_100, AMLODIPINE_5])
    expect(plan.regimen.id).toBe('amlodipine 5')
    expect(plan.overrideRequired).toBeUndefined()
    // and metoprolol still appears in what to avoid, because the arm was evaluated
    expect(plan.avoid.items.map((i) => i.ruleId)).toContain('RX-ASTHMA-METOPROLOL')
  })
})

// ---------------------------------------------------------------------------
// 4. The pregnant patient — most of the plan is what to avoid
// ---------------------------------------------------------------------------

describe('demo patient — pregnancy', () => {
  const patient = twinOf({ sex: 'female', pregnant: true, comorbidities: ['pregnancy'], age_years: 31 })

  it('refuses to write a plan when every evaluated arm is disqualified', () => {
    const { plan } = planFor(patient, [LISINOPRIL_20, LOSARTAN_50])
    expect(plan.noPlan).toBeDefined()
    expect(plan.noPlan!.blockedBy.map((i) => i.ruleId).sort()).toEqual(['RX-PREG-ACEI', 'RX-PREG-ARB'])
    for (const item of plan.noPlan!.blockedBy) {
      expect(item.absolute).toBe(true)
      expect(item.severity).toBe('contraindicated_absolute')
      expect(item.citation?.url).toBeTruthy()
    }
    expect(plan.gaps.some((g) => g.section === 'start' && /no regimen|a regimen to start/i.test(g.what))).toBe(true)
    expect(planToPlainText(plan)).toContain('NO PLAN COULD BE WRITTEN')
  })

  it('leads with the boxed warnings in plain clinical language', () => {
    const { plan } = planFor(patient, [LISINOPRIL_20, LOSARTAN_50, HCTZ_25])
    expect(plan.avoid.items[0].absolute).toBe(true)
    const acei = plan.avoid.items.find((i) => i.ruleId === 'RX-PREG-ACEI')!
    expect(acei.text).toMatch(/injury and death to the developing fetus/i)
    expect(acei.affectsRegimens).toContain('lisinopril 20')
  })

  it('says the guideline-preferred agents are outside the modelled drug set', () => {
    const { plan } = planFor(patient, [LISINOPRIL_20, LOSARTAN_50, HCTZ_25])
    // The thiazide is the only arm left and it is avoid-not-forbid.
    expect(plan.regimen.id).toBe('hctz 25')
    expect(plan.overrideRequired).toBeDefined()
    expect(plan.overrideRequired!.reason).toMatch(/five antihypertensives/)
    const hctz = plan.avoid.items.find((i) => i.ruleId === 'RX-PREG-HCTZ')!
    expect(hctz.text).toMatch(/labetalol/i)
    expect(plan.gaps.some((g) => g.section === 'escalation' && /first-line agent/.test(g.what))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. The CYP2D6 poor metaboliser — the starting dose itself changes
// ---------------------------------------------------------------------------

describe('demo patient — CYP2D6 poor metaboliser', () => {
  it('starts metoprolol at the CPIC dose and says why', () => {
    const patient = twinOf({ cyp2d6: 'poor' })
    const { plan } = planFor(patient, [METOPROLOL_100, AMLODIPINE_5], 'metoprolol 100')
    const metoprolol = plan.start.drugs.find((d) => d.substanceId === 'metoprolol')!

    expect(metoprolol.startMgPerDay).toBe(25)
    expect(metoprolol.usualStartMgPerDay).toBe(50)
    expect(metoprolol.adjusted).toBe(true)
    expect(metoprolol.targetMgPerDay).toBe(100)

    const reason = metoprolol.reasons[0]
    expect(reason.basis.kind).toBe('rule')
    if (reason.basis.kind === 'rule') {
      expect(reason.basis.ruleId).toBe('PGX-CYP2D6-PM-METOPROLOL')
      expect(reason.basis.citation?.source).toMatch(/CPIC 2024/i)
      expect(reason.basis.citation?.quote).toMatch(/lowest recommended starting dose/i)
    }
    // The prescription line itself carries the reduced dose, not just the rationale.
    expect(metoprolol.statements[0].text).toMatch(/12\.5 mg twice daily \(25 mg\/day\)/)
  })

  it('leaves the normal metaboliser at the label dose', () => {
    const { plan } = planFor(twinOf({ cyp2d6: 'normal' }), [METOPROLOL_100], 'metoprolol 100')
    const metoprolol = plan.start.drugs.find((d) => d.substanceId === 'metoprolol')!
    expect(metoprolol.startMgPerDay).toBe(50)
    expect(metoprolol.adjusted).toBe(false)
  })

  it('carries the label titration interval for metoprolol', () => {
    const { plan } = planFor(twinOf({ cyp2d6: 'poor' }), [METOPROLOL_100], 'metoprolol 100')
    const step = plan.titration.steps.find((s) => s.substanceId === 'metoprolol')!
    expect(step.intervalDays).toBe(7)
    expect(step.intervalBasis.kind).toBe('rule')
  })
})

// ---------------------------------------------------------------------------
// The dose-escalation economics the product exists to show
// ---------------------------------------------------------------------------

describe('treatment plan — titration economics come from the engine, not from prose', () => {
  it('holds amlodipine at 5 mg: the labelled 2.9 mmHg is not worth the oedema', () => {
    const { plan } = planFor(twinOf(), [AMLODIPINE_5])
    const step = plan.titration.steps[0]
    expect(step.nextMgPerDay).toBe(10)
    expect(step.extraSbpDropMmHg!).toBeGreaterThan(2.4)
    expect(step.extraSbpDropMmHg!).toBeLessThan(3.4)
    expect(step.extraAdversePoints!).toBeGreaterThan(step.extraSbpDropMmHg!)
    expect(step.verdict).toBe('hold')
    expect(step.intervalDays).toBe(10)
  })

  it('titrates lisinopril, where the symptom curve is flat across the dose range', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20])
    const step = plan.titration.steps[0]
    expect(step.fromMgPerDay).toBe(10)
    expect(step.nextMgPerDay).toBe(20)
    expect(step.verdict).toBe('titrate')
    expect(step.extraAdversePoints!).toBeLessThan(step.extraSbpDropMmHg!)
  })

  it('shows adding a class against doubling a drug, with both numbers', () => {
    const combo = reg('lisinopril 20 + amlodipine 5', [
      ['lisinopril', 20, 1],
      ['amlodipine', 5, 1],
    ])
    const { plan } = planFor(twinOf(), [LISINOPRIL_20, AMLODIPINE_5, combo], 'lisinopril 20')
    expect(plan.escalation.addOn).not.toBeNull()
    expect(plan.escalation.addOn!.regimen.id).toBe('lisinopril 20 + amlodipine 5')
    expect(plan.escalation.doubling).not.toBeNull()
    const comparison = plan.escalation.addOn!.statements.find((s) => /against/.test(s.text))
    expect(comparison).toBeDefined()
    expect(comparison!.basis.kind).toBe('engine')
    expect(comparison!.text).toMatch(/mmHg more/)
  })

  it('records a gap instead of inventing an add-on that was never evaluated', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20])
    expect(plan.escalation.addOn).toBeNull()
    expect(
      plan.gaps.some((g) => g.section === 'escalation' && /adds a class/.test(g.what)),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Ranker vs titration — the reconciliation
//
// These two computations answer different questions and CAN disagree. The tests below
// pin down what is shared (the harm figure, the efficacy figure) and what is not (the
// exchange rate between mmHg and percentage points), because that distinction is the
// whole reason the disagreement is legitimate rather than a bug.
// ---------------------------------------------------------------------------

const AMLODIPINE_10 = reg('amlodipine 10', [['amlodipine', 10, 1]])

describe('treatment plan — ranker and titration, reconciled', () => {
  it('the two harm models AGREE on the amlodipine step — the disagreement is not an accounting artefact', () => {
    const { plan } = planFor(twinOf({ sex: 'male' }), [AMLODIPINE_10])
    const step = plan.titration.steps[0]
    // Law 2003 pooled CCB symptom prevalence over 5 -> 10 mg.
    expect(step.harmLaw2003Points!).toBeCloseTo(6.6, 1)
    // The NORVASC label's own dose-resolved oedema table, as the rules apply it.
    expect(step.harmCitedPoints!).toBeCloseTo(6.7, 1)
    expect(Math.abs(step.harmCitedPoints! - step.harmLaw2003Points!)).toBeLessThan(0.5)
    expect(step.harmModelsAgree).toBe(true)
  })

  it('uses ONE harm figure, the one the safety score itself charges for', () => {
    const { plan } = planFor(twinOf({ sex: 'male' }), [AMLODIPINE_10])
    const step = plan.titration.steps[0]
    expect(step.harmSource).toBe('cited_rule_incidence')
    expect(step.extraAdversePoints).toBe(step.harmCitedPoints)
  })

  it('states the disagreement in words, with both numbers, when the ranker climbs past a hold', () => {
    const { plan } = planFor(twinOf({ sex: 'male' }), [AMLODIPINE_10])
    const step = plan.titration.steps[0]
    const rec = step.reconciliation!
    expect(rec).toBeDefined()
    expect(step.verdict).toBe('hold')
    expect(rec.rankerPrefersNextDose).toBe(true)
    expect(rec.rankerCallsItTied).toBe(false)
    expect(rec.agree).toBe(false)
    expect(rec.compositeNext).toBeGreaterThan(rec.compositeNow)

    const text = rec.statements.map((s) => s.text).join(' ')
    expect(text).toMatch(/DISAGREE/)
    expect(text).toMatch(/still climbing its dose-response curve/)
    expect(text).toMatch(/prescriber's judgement/)
    // both numbers present
    expect(text).toContain(`${Math.round(rec.compositeNext * 10) / 10}`)
    expect(text).toMatch(/2\.8 mmHg/)
    expect(text).toMatch(/6\.7 percentage points/)
  })

  it('derives the ranker’s own exchange rate rather than asserting one', () => {
    const { plan } = planFor(twinOf({ sex: 'male' }), [AMLODIPINE_10])
    const rec = plan.titration.steps[0].reconciliation!
    // 0.25 (oedema weight) x 0.35 (safety weight) = 0.0875 composite per point against
    // roughly 0.6 composite per mmHg, so the composite trades about seven points per mmHg.
    expect(rec.impliedHarmPointsPerMmHg).not.toBeNull()
    expect(rec.impliedHarmPointsPerMmHg!).toBeGreaterThan(5)
    expect(rec.impliedHarmPointsPerMmHg!).toBeLessThan(9)
    expect(rec.titrationHarmPointsPerMmHg).toBe(1)
    expect(rec.statements.some((s) => /Neither exchange rate is a sourced number/.test(s.text))).toBe(true)
  })

  it('raises the disagreement once at the top of the section, not only inside the step', () => {
    const { plan } = planFor(twinOf({ sex: 'male' }), [AMLODIPINE_10])
    expect(plan.titration.statements[0].text).toMatch(/disagree about it/)
    expect(planToPlainText(plan)).toContain('Ranked recommendation, same two doses — DISAGREES:')
  })

  it('converges for a woman, because the label’s sex-resolved oedema closes the gap', () => {
    const { plan } = planFor(twinOf({ sex: 'female' }), [AMLODIPINE_10])
    const step = plan.titration.steps[0]
    // The sex multiplier more than doubles the attributable oedema for the same step.
    expect(step.harmCitedPoints!).toBeGreaterThan(2 * step.harmLaw2003Points!)
    expect(step.harmModelsAgree).toBe(false)
    expect(step.verdict).toBe('hold')
    // and the ranker can no longer separate the two doses, so the two answers agree
    expect(step.reconciliation!.rankerCallsItTied).toBe(true)
    expect(step.reconciliation!.agree).toBe(true)
    expect(step.reconciliation!.statements.some((s) => /sex difference is applied as a constant/.test(s.text))).toBe(true)
  })

  it('says the ranker is dose-blind on a thiazide step, and files that as a gap', () => {
    const { plan } = planFor(twinOf(), [HCTZ_25], 'hctz 25')
    const step = plan.titration.steps[0]
    expect(step.harmCitedPoints).toBeNull()
    expect(step.harmSource).toBe('law2003_class_prevalence')
    expect(step.harmLaw2003Points!).toBeCloseTo(7.9, 1)
    expect(step.verdict).toBe('hold')
    expect(step.reconciliation!.agree).toBe(true)
    expect(
      step.reconciliation!.statements.some((s) => /quantify no dose-resolved adverse-effect channel/.test(s.text)),
    ).toBe(true)
    expect(
      plan.gaps.some((g) => g.section === 'titration' && /dose-resolved harm the ranker charges/.test(g.what)),
    ).toBe(true)
  })

  it('agrees, quietly, where nothing about the step is contested', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20])
    const step = plan.titration.steps[0]
    expect(step.verdict).toBe('titrate')
    expect(step.harmModelsAgree).toBe(true)
    expect(step.reconciliation!.agree).toBe(true)
    expect(
      step.reconciliation!.statements.some((s) => /Neither harm source attributes any extra adverse effect/.test(s.text)),
    ).toBe(true)
    expect(plan.titration.statements[0].text).not.toMatch(/disagree/)
  })
})

// ---------------------------------------------------------------------------
// Tolerability swaps
// ---------------------------------------------------------------------------

describe('treatment plan — alternatives if not tolerated', () => {
  it('answers ACE-inhibitor cough with the arm that does not contain the ACE inhibitor', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20, LOSARTAN_50], 'lisinopril 20')
    const cough = plan.tolerability.swaps.find((s) => s.channel === 'cough')!
    expect(cough).toBeDefined()
    expect(cough.substanceId).toBe('lisinopril')
    expect(cough.probability).toBeGreaterThan(0)
    expect(cough.switchTo!.regimen.id).toBe('losartan 50')
    // and the mechanism sentence is quoted from the dataset, not written here
    expect(cough.statements.some((s) => /bradykinin/i.test(s.text))).toBe(true)
  })

  it('records a gap when every evaluated arm contains the offending drug', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20], 'lisinopril 20')
    expect(plan.tolerability.swaps.every((s) => s.switchTo === null)).toBe(true)
    expect(plan.gaps.some((g) => g.section === 'tolerability')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The five-year projection — present, and honest
// ---------------------------------------------------------------------------

describe('treatment plan — the five-year projection', () => {
  const { plan } = planFor(twinOf(), [LISINOPRIL_20, AMLODIPINE_5])

  it('is worded as a projection of blood-pressure control and organ-relevant markers', () => {
    expect(plan.outlook.heading).toBe(
      'Five-year projection of blood-pressure control and organ-relevant markers',
    )
    expect(plan.outlook.sustainedDeltaSbp).toBeCloseTo(12, 6)
    expect(plan.outlook.projectedSbp).toBeCloseTo(140, 6)
  })

  it('projects the organ-relevant markers against their reference ranges', () => {
    const potassium = plan.outlook.markers.find((m) => m.id === 'serum_k_mmol_L')!
    expect(potassium).toBeDefined()
    expect(potassium.projected).toBe(4.6)
    expect(potassium.referenceRange).toEqual([3.5, 5])
    expect(potassium.outsideRange).toBe(false)
  })

  it('NEVER predicts strokes, infarctions or deaths', () => {
    // The relative risks are present as literature, and cannot be rendered without the
    // sentence that frames them.
    expect(plan.outlook.classLevelRelativeRisk.perTenMmHg.stroke.point).toBeLessThan(1)
    expect(plan.outlook.classLevelRelativeRisk.notAPrediction).toMatch(/does not model strokes/)
    expect(plan.outlook.classLevelRelativeRisk.extrapolationWarning).toMatch(/double extrapolation/)

    // Absolute event quantities are not carried at all: `project5Year` computes
    // events-prevented and NNT, and putting either in a plan would turn a projection of
    // surrogate markers into a prediction of events.
    const serialised = JSON.stringify(plan)
    expect(serialised).not.toMatch(/eventsPrevented/)
    expect(serialised).not.toMatch(/nnt5y/i)

    const text = planToPlainText(plan)
    expect(text).not.toMatch(/will (have|suffer|die|prevent)/i)
    expect(text).not.toMatch(/strokes? prevented/i)
    expect(text).not.toMatch(/events prevented/i)
    // "your risk" may appear ONLY inside the engine's own prohibition of the phrase.
    for (const m of text.matchAll(/your risk/gi)) {
      expect(text.slice(Math.max(0, (m.index ?? 0) - 12), m.index)).toMatch(/never as "/)
    }
    expect(text).toContain('not what will happen to this patient')
  })

  it('states the adherence assumption and the closed-form nature of the projection', () => {
    expect(plan.outlook.adherenceAssumed).toBe(1)
    expect(plan.outlook.statements.some((s) => /Adherence is assumed complete/.test(s.text))).toBe(true)
    expect(plan.outlook.statements.some((s) => /closed-form, not five simulated years/.test(s.text))).toBe(true)
    expect(plan.gaps.some((g) => g.section === 'outlook' && /absolute five-year event risk/.test(g.what))).toBe(true)
  })

  it('scales the sustained reduction by a partial adherence assumption', () => {
    const candidates: ScoreCandidate[] = [
      { regimen: LISINOPRIL_20, summary: summary(), modifiers: evaluateRules(twinOf(), LISINOPRIL_20, rules, {}) },
    ]
    const patient = twinOf()
    const ranked = rankOptions({ patient, candidates, data })
    const partial = buildTreatmentPlan({ patient, ranked, summary: summary(), data, adherence: 0.7 })
    expect(partial.outlook.sustainedDeltaSbp).toBeCloseTo(8.4, 6)
    expect(partial.outlook.statements.some((s) => /70% adherence/.test(s.text))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The target, and the two different kinds of "how long"
// ---------------------------------------------------------------------------

describe('treatment plan — the target', () => {
  it('separates pharmacokinetic steady state from full antihypertensive effect', () => {
    const { plan } = planFor(twinOf(), [HCTZ_25], 'hctz 25')
    expect(plan.target.pkSteadyStateDays).toBeGreaterThan(0)
    expect(plan.target.pkSteadyStateDays!).toBeLessThan(3)
    // The label's diuresis is hours; the antihypertensive effect is weeks.
    expect(plan.target.fullEffectWeeks).toBe(4)
    expect(plan.target.fullEffectBasis.kind).toBe('dataset')
    const text = plan.target.statements.map((s) => s.text).join(' ')
    expect(text).toMatch(/pharmacokinetic steady state and full antihypertensive effect are different things/)
  })

  it('says so when the dataset has no time-to-full-effect for a drug', () => {
    const { plan } = planFor(twinOf(), [AMLODIPINE_5])
    expect(plan.target.fullEffectWeeks).toBeNull()
    expect(
      plan.gaps.some((g) => g.section === 'target' && /time to full antihypertensive effect/.test(g.what)),
    ).toBe(true)
  })

  it('flags the shortfall when the arm alone will not reach goal', () => {
    const { plan } = planFor(twinOf(), [LISINOPRIL_20])
    expect(plan.target.reachesTarget).toBe(false)
    expect(plan.target.shortfallSbpMmHg).toBeCloseTo(10, 6)
    expect(plan.target.statements.some((s) => /falls 10 mmHg short/.test(s.text))).toBe(true)
  })
})
