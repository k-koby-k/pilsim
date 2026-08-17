import { describe, expect, it } from 'vitest'
import type { DoseSpec, PatientInputs, Regimen } from '../types'
import { loadDataFromDisk } from './testData'
import { deriveTwin, type Twin } from './twin'
import {
  HANDLED_EFFECT_OPS,
  evaluateRules,
  interpolateDoseResponse,
  phenoconvertCyp2d6,
  type RuleContext,
} from './evaluate'

const data = loadDataFromDisk()
const { rules, patientModel } = data
const GATES = rules.demo_gate_rule_ids

function twinOf(over: Partial<PatientInputs> = {}): Twin {
  const inputs: PatientInputs = {
    age_years: 55,
    sex: 'male',
    weight_kg: 82,
    height_cm: 176,
    sbp_mmHg: 152,
    dbp_mmHg: 94,
    hr_bpm: 74,
    comorbidities: [],
    ...over,
  }
  return deriveTwin(inputs, patientModel)
}

function regimen(...doses: [string, number, number][]): Regimen {
  return {
    id: doses.map((d) => `${d[0]}${d[1]}`).join('+'),
    label: doses.map((d) => `${d[0]} ${d[1]} mg`).join(' + '),
    doses: doses.map(([substanceId, mg, perDay]) => ({ substanceId, mg, perDay }) as DoseSpec),
  }
}

function run(t: Twin, r: Regimen, ctx: RuleContext = {}) {
  return evaluateRules(t, r, rules, ctx)
}

function hit(res: ReturnType<typeof run>, id: string) {
  return res.hits.find((h) => h.ruleId === id)
}

// ---------------------------------------------------------------------------

describe('rules engine — the six demo gates', () => {
  it('gate 1: pregnancy + ACE inhibitor BLOCKS', () => {
    const t = twinOf({ sex: 'female', pregnant: true, age_years: 31 })
    const res = run(t, regimen(['lisinopril', 10, 1]))
    const h = hit(res, GATES.pregnancy_ace_inhibitor)
    expect(h, 'RX-PREG-ACEI must fire').toBeDefined()
    expect(h!.severity).toBe('contraindicated_absolute')
    expect(h!.severityRank).toBe(7)
    expect(h!.blocks).toBe(true)
    expect(res.blocked).toBe(true)
    expect(res.tier).toBe('DISQUALIFIED')
    expect(res.blockReasons.join(' ')).toMatch(/boxed warning/i)
    expect(h!.citation?.url).toMatch(/accessdata\.fda\.gov/)
    // and it must be the headline hit
    expect(res.hits[0].ruleId).toBe(GATES.pregnancy_ace_inhibitor)
    expect(res.organAnnotations.some((a) => a.organ === 'fetus')).toBe(true)
  })

  it('gate 2: pregnancy + ARB BLOCKS', () => {
    const t = twinOf({ sex: 'female', pregnant: true, age_years: 29 })
    const res = run(t, regimen(['losartan', 50, 1]))
    expect(hit(res, GATES.pregnancy_arb)?.blocks).toBe(true)
    expect(res.blocked).toBe(true)
  })

  it('gate 3: gout + hydrochlorothiazide WARNS — a relative contraindication, not a block', () => {
    const t = twinOf({ comorbidities: ['gout'] })
    const res = run(t, regimen(['hydrochlorothiazide', 25, 1]))
    const h = hit(res, GATES.gout_hydrochlorothiazide)
    expect(h).toBeDefined()
    expect(h!.severity).toBe('contraindicated_relative')
    expect(h!.severityRank).toBe(6)
    expect(h!.blocks).toBe(false)
    expect(res.blocked).toBe(false)
    expect(res.tier).toBe('OVERRIDE_REQUIRED')
    expect(res.overrideRequired.map((x) => x.ruleId)).toContain(GATES.gout_hydrochlorothiazide)
    // the mechanism must show up as a urate shift and a monitoring instruction
    expect(res.stateShifts.serum_urate_mg_dL).toBeCloseTo(0.8, 9)
    expect(res.monitoring.some((m) => m.lab === 'serum_urate_mg_dL')).toBe(true)
    expect(res.organAnnotations.some((a) => a.organ === 'joint')).toBe(true)
    // gout is a warning for HCTZ, but a positive for losartan — same state variable,
    // opposite direction. That is the demo.
    const los = run(t, regimen(['losartan', 50, 1]))
    expect(hit(los, 'CI-GOUT-PREFER-LOSARTAN')).toBeDefined()
    expect(los.stateShifts.serum_urate_mg_dL).toBeLessThan(0)
    // +25 for the gout preference, +10 for being one of the four first-line classes.
    expect(los.scoreDeltasBySubstance.losartan.appropriateness).toBe(35)
  })

  it('gate 3b: the urate LAB alone fires the same rule without a gout diagnosis', () => {
    const t = twinOf({ serum_urate_mg_dL: 7.4 })
    expect(t.vars.serum_urate_mg_dL).toBe(7.4)
    const res = run(t, regimen(['hydrochlorothiazide', 25, 1]))
    expect(hit(res, GATES.gout_hydrochlorothiazide)).toBeDefined()
  })

  it('gate 4: asthma + metoprolol is a CONCENTRATION-GATED WARNING, not a binary block', () => {
    const t = twinOf({ comorbidities: ['asthma'] })
    const res = run(t, regimen(['metoprolol', 50, 2]))
    const h = hit(res, GATES.asthma_metoprolol)
    expect(h).toBeDefined()
    // Asthma is Warning 5.3 on the metoprolol label, NOT a contraindication.
    expect(h!.severity).toBe('contraindicated_relative')
    expect(h!.blocks).toBe(false)
    expect(res.blocked).toBe(false)
    expect(res.tier).toBe('OVERRIDE_REQUIRED')
    // The effect is graded: a measured FEV1 fall and a graded bronchospasm probability,
    // driven by beta-1 selectivity being relative and dose/concentration dependent.
    expect(res.stateShifts.fev1_pct_predicted).toBeCloseTo(-6.9, 9)
    expect(res.risks['risk.bronchospasm']).toBeCloseTo(0.125, 9)
    expect(res.pdMultipliers.metoprolol).toBeDefined()
    expect(h!.warningText).toMatch(/NOT listed in the metoprolol CONTRAINDICATIONS/)
    expect(h!.warningText).toMatch(/propranolol/i)
    expect(res.organAnnotations.some((a) => a.organ === 'lung.airway')).toBe(true)
    // Asthma alone must not drag in the COPD rule.
    expect(hit(res, GATES.copd_metoprolol)).toBeUndefined()
  })

  it('gate 5: COPD + metoprolol with no cardiac indication fires; a cardiac indication suppresses it', () => {
    const copd = twinOf({ comorbidities: ['copd'] })
    expect(hit(run(copd, regimen(['metoprolol', 50, 2])), GATES.copd_metoprolol)).toBeDefined()

    const copdWithMi = twinOf({ comorbidities: ['copd', 'prior_mi'] })
    const res = run(copdWithMi, regimen(['metoprolol', 50, 2]))
    // The `not` combinator has to work, or a post-MI COPD patient is warned off the
    // drug that keeps them alive.
    expect(hit(res, GATES.copd_metoprolol)).toBeUndefined()
  })

  it('gate 6: dual RAAS blockade is AVOID, not an absolute contraindication', () => {
    const t = twinOf()
    const res = run(t, regimen(['lisinopril', 20, 1], ['losartan', 50, 1]))
    const h = hit(res, GATES.dual_raas_blockade)
    expect(h, 'DDI-DUAL-RAAS must fire on an ACEi + ARB regimen').toBeDefined()
    expect(h!.severity).toBe('contraindicated_relative')
    expect(h!.severityRank).toBe(6)
    // THE POINT: it does not block.
    expect(h!.blocks).toBe(false)
    expect(res.blocked).toBe(false)
    expect(res.blockReasons).toHaveLength(0)
    expect(res.tier).toBe('OVERRIDE_REQUIRED')
    expect(res.overrideRequired.map((x) => x.ruleId)).toContain(GATES.dual_raas_blockade)
    expect(h!.warningText).toMatch(/VA NEPHRON-D|no additional benefit|without additional/i)
    expect(res.stateShifts.serum_k_mmol_L).toBeGreaterThan(0)
    expect(res.risks['risk.hyperkalemia']).toBeGreaterThan(0)
    expect(res.risks['risk.aki']).toBeGreaterThan(0)
    // ~10% incremental BP effect only — the two agents are largely redundant.
    expect(res.pdMultipliers.lisinopril).toBeCloseTo(1.1, 9)
    expect(res.pdMultipliers.losartan).toBeCloseTo(1.1, 9)
  })
})

// ---------------------------------------------------------------------------

describe('rules engine — the trigger language', () => {
  it('resolves drug_class atoms from the regimen itself, not just co-medication', () => {
    const t = twinOf()
    const res = run(t, regimen(['lisinopril', 20, 1], ['losartan', 50, 1]))
    expect(hit(res, 'DDI-DUAL-RAAS')).toBeDefined()
  })

  it('resolves drug_class atoms from unmodelled co-medication', () => {
    const t = twinOf()
    const res = run(t, regimen(['lisinopril', 20, 1], ['hydrochlorothiazide', 25, 1]), {
      coMedicationClasses: ['nsaid'],
    })
    expect(hit(res, 'DDI-TRIPLE-WHAMMY'), 'ACEi + thiazide + NSAID').toBeDefined()
    expect(hit(res, 'DDI-RAAS-NSAID-EFFICACY')).toBeDefined()
    expect(res.pdMultipliers.lisinopril).toBeCloseTo(0.7, 9)
  })

  it('resolves lab atoms through the patient_model state-path binding', () => {
    const t = twinOf({ age_years: 70, serum_creatinine_mg_dl: 2.6 })
    expect(t.vars.egfr_ckdepi2021).toBeLessThan(30)
    const res = run(t, regimen(['lisinopril', 20, 1], ['hydrochlorothiazide', 25, 1]))
    expect(hit(res, 'DOSE-RENAL-LISINOPRIL')).toBeDefined()
    expect(res.doseStarts.lisinopril).toBe(5)
    expect(res.pkMultipliers.lisinopril).toBeCloseTo(0.35, 9)
    expect(hit(res, 'EFF-HCTZ-ADVANCED-CKD')).toBeDefined()
    expect(res.pdMultipliers.hydrochlorothiazide).toBeCloseTo(0.75, 9)
  })

  it('resolves excipient atoms, and refuses to guess an undisclosed quantity', () => {
    const t = twinOf({ comorbidities: ['galactosemia'] })
    const withLactose = run(t, regimen(['metoprolol', 50, 2]), {
      excipients: { lactose_monohydrate: true },
    })
    expect(hit(withLactose, 'EXC-LACTOSE-GALACTOSEMIA')).toBeDefined()

    // Sodium content unknown: the rule must not fire, and must say why.
    const noSodium = run(twinOf(), regimen(['lisinopril', 20, 1]), { excipients: {} })
    expect(hit(noSodium, 'EXC-SODIUM-HIGH')).toBeUndefined()
    expect(
      noSodium.unresolvedAtoms.some((u) => u.atom.key === 'sodium_total_mg_per_max_daily_dose'),
    ).toBe(true)

    const highSodium = run(twinOf({ comorbidities: ['low_sodium_diet'] }), regimen(['lisinopril', 20, 1]), {
      excipients: { sodium_total_mg_per_max_daily_dose: 500 },
    })
    expect(hit(highSodium, 'EXC-SODIUM-HIGH')).toBeDefined()
  })

  it('handles the `not` combinator', () => {
    const plain = twinOf({ comorbidities: ['lactose_intolerance'] })
    const res = run(plain, regimen(['metoprolol', 50, 2]), { excipients: { lactose_monohydrate: true } })
    // Ordinary lactose intolerance is explicitly NOT a contraindication.
    expect(hit(res, 'EXC-LACTOSE-INTOLERANCE-INFO')).toBeDefined()
    expect(hit(res, 'EXC-LACTOSE-INTOLERANCE-INFO')!.severity).toBe('info')

    const galactosemic = twinOf({ comorbidities: ['lactose_intolerance', 'galactosemia'] })
    const res2 = run(galactosemic, regimen(['metoprolol', 50, 2]), {
      excipients: { lactose_monohydrate: true },
    })
    expect(hit(res2, 'EXC-LACTOSE-INTOLERANCE-INFO')).toBeUndefined()
    expect(hit(res2, 'EXC-LACTOSE-GALACTOSEMIA')).toBeDefined()
  })

  it('reports an unresolvable atom instead of treating it as false', () => {
    const res = run(twinOf(), regimen(['metoprolol', 50, 2]), {})
    expect(res.unresolvedAtoms.length).toBeGreaterThan(0)
    for (const u of res.unresolvedAtoms) expect(u.reason).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------

describe('rules engine — phenoconversion (CPIC 2024)', () => {
  it('a strong CYP2D6 inhibitor forces the activity score to zero', () => {
    expect(phenoconvertCyp2d6(2, { strongInhibitor: true, moderateInhibitor: false })).toEqual({
      score: 0,
      code: 'PM',
      applied: 'strong',
    })
  })

  it('a moderate CYP2D6 inhibitor halves the activity score', () => {
    expect(phenoconvertCyp2d6(2, { strongInhibitor: false, moderateInhibitor: true })).toEqual({
      score: 1,
      code: 'IM',
      applied: 'moderate',
    })
    // AS 1.0 halved to 0.5 is still intermediate, not poor.
    expect(phenoconvertCyp2d6(1, { strongInhibitor: false, moderateInhibitor: true }).code).toBe('IM')
  })

  it('no adjustment for a weak inhibitor', () => {
    expect(phenoconvertCyp2d6(2, { strongInhibitor: false, moderateInhibitor: false }).applied).toBeNull()
  })

  it('phenoconverts a genotypic normal metaboliser to PM, so the PM rule then fires', () => {
    const t = twinOf({ cyp2d6: 'normal' })
    const res = run(t, regimen(['metoprolol', 50, 2]), {
      coMedicationClasses: ['cyp2d6_inhibitor_strong'],
      coMedications: ['paroxetine'],
    })
    expect(res.phenoconversions['phenotype.cyp2d6']).toBe('PM')
    expect(res.phenoconversions['cyp2d6_activity_score']).toBe('0')
    expect(hit(res, 'DDI-METOPROLOL-CYP2D6-INHIBITOR')).toBeDefined()
    // The pre-pass ran before the phenotype atoms were evaluated, so the PM rule fires
    // for a patient whose genotype is normal.
    expect(hit(res, 'PGX-CYP2D6-PM-METOPROLOL')).toBeDefined()
    expect(res.doseStarts.metoprolol).toBe(25)
    expect(res.pkMultipliers.metoprolol).toBeGreaterThan(4)
  })

  it('a moderate inhibitor halves the score in the engine too', () => {
    const t = twinOf({ cyp2d6: 'normal' })
    const res = run(t, regimen(['metoprolol', 50, 2]), { moderateCyp2d6Inhibitor: true })
    expect(res.phenoconversions['phenotype.cyp2d6']).toBe('IM')
    expect(res.phenoconversions['cyp2d6_activity_score']).toBe('1')
    expect(hit(res, 'PGX-CYP2D6-PM-METOPROLOL')).toBeUndefined()
    expect(hit(res, 'PGX-CYP2D6-IM-NM-METOPROLOL')).toBeDefined()
  })

  it('a genotypic poor metaboliser fires the PM rule with no inhibitor present', () => {
    const res = run(twinOf({ cyp2d6: 'poor' }), regimen(['metoprolol', 50, 2]))
    expect(hit(res, 'PGX-CYP2D6-PM-METOPROLOL')).toBeDefined()
    expect(res.stateShifts.heart_rate_bpm).toBeCloseTo(-5.5, 9)
  })

  it('CYP2C9 poor metaboliser reduces the losartan active metabolite', () => {
    const res = run(twinOf({ cyp2c9: 'poor' }), regimen(['losartan', 50, 1]))
    expect(hit(res, 'PGX-CYP2C9-PM-LOSARTAN')).toBeDefined()
    expect(res.pkMultipliers.exp3174).toBeCloseTo(0.4, 9)
    expect(res.pdMultipliers.losartan).toBeCloseTo(0.7, 9)
  })
})

// ---------------------------------------------------------------------------

describe('rules engine — effect folding', () => {
  it('IMPLEMENTS every effect op the data file declares', () => {
    // This assertion replaces one that merely checked declared ops appeared in the
    // data. That version passed while `risk_modify` shipped and sat completely inert,
    // because it never asked whether the ENGINE handled anything. An unimplemented op
    // is silently dropped at runtime, so the only thing that catches it is this test.
    for (const op of rules.effect_ops) {
      expect(HANDLED_EFFECT_OPS, `rules.json declares effect op "${op}" and evaluate.ts does not implement it`).toContain(op)
    }
    const inData = new Set<string>()
    for (const r of rules.rules) for (const e of r.effects) inData.add(e.op)
    for (const op of inData) {
      expect(HANDLED_EFFECT_OPS, `a rule uses effect op "${op}" and evaluate.ts does not implement it`).toContain(op)
      expect(rules.effect_ops, `effect op "${op}" is used but not declared in effect_ops`).toContain(op)
    }
  })

  it('reports an unrecognised effect op instead of dropping it', () => {
    const patched = {
      ...rules,
      rules: rules.rules.map((r) =>
        r.id === 'AE-CHANNELS-VISIBLE'
          ? { ...r, effects: [...r.effects, { op: 'risk_teleport' as never, target: 'risk.cough' }] }
          : r,
      ),
    }
    const res = evaluateRules(twinOf(), regimen(['amlodipine', 5, 1]), patched, {})
    expect((res.unhandledEffectOps ?? []).map((u) => u.op)).toContain('risk_teleport')
  })

  it('finds no unhandled op on the shipped data, for any of the five drugs', () => {
    for (const drug of ['lisinopril', 'losartan', 'amlodipine', 'hydrochlorothiazide', 'metoprolol']) {
      const res = run(twinOf({ comorbidities: ['gout', 'asthma'] }), regimen([drug, 10, 1]))
      expect(res.unhandledEffectOps ?? [], `${drug}: ${JSON.stringify(res.unhandledEffectOps)}`).toHaveLength(0)
    }
  })

  it('takes the most cautious dose cap and the slowest titration', () => {
    const t = twinOf({ comorbidities: ['hfref'], lvef_pct: 30 })
    const res = run(t, regimen(['metoprolol', 50, 1]), { metoprololSalt: 'succinate_er' })
    // DOSE-CAPS-ALL says 400 mg/day; CI-HFREF-METOPROLOL-SUCCINATE says 200 in heart failure.
    expect(res.doseCaps.metoprolol).toBe(200)
    // 7 days generally, 14 days in heart failure.
    expect(res.titrationIntervalDays.metoprolol).toBe(14)
    expect(res.scoreDeltasBySubstance.metoprolol.appropriateness).toBeGreaterThan(0)
  })

  it('gates a salt-specific positive rule on the salt actually chosen', () => {
    const t = twinOf({ comorbidities: ['hfref'], lvef_pct: 30 })
    const ir = run(t, regimen(['metoprolol', 50, 2]), { metoprololSalt: 'tartrate_ir' })
    // The rule still fires (the patient has HFrEF) but its +35 appropriateness credit
    // requires the succinate ER salt, which is the form with the mortality evidence.
    expect(hit(ir, 'CI-HFREF-METOPROLOL-SUCCINATE')).toBeDefined()
    expect(ir.scoreDeltasBySubstance.metoprolol?.appropriateness ?? 0).toBeLessThan(35)
  })

  it('keeps caps on unmodelled co-medications out of the frozen doseCaps contract', () => {
    const res = run(twinOf(), regimen(['amlodipine', 10, 1]), {
      coMedicationClasses: ['statin_simvastatin'],
    })
    expect(hit(res, 'DDI-AMLODIPINE-SIMVASTATIN')).toBeDefined()
    expect(res.externalDoseCaps.simvastatin).toBe(20)
    expect('simvastatin' in res.doseCaps).toBe(false)
  })

  it('sorts hits most-severe-first and stably', () => {
    const t = twinOf({ sex: 'female', pregnant: true, comorbidities: ['gout'], age_years: 33 })
    const res = run(t, regimen(['lisinopril', 20, 1], ['hydrochlorothiazide', 25, 1]))
    const ranks = res.hits.map((h) => h.severityRank)
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks)
    expect(res.hits[0].severityRank).toBe(7)
    const again = run(t, regimen(['lisinopril', 20, 1], ['hydrochlorothiazide', 25, 1]))
    expect(again.hits.map((h) => h.ruleId)).toEqual(res.hits.map((h) => h.ruleId))
  })

  it('a healthy twin on a first-line drug produces no negative hit', () => {
    const t = twinOf({ sbp_mmHg: 148, dbp_mmHg: 92 })
    const res = run(t, regimen(['amlodipine', 5, 1]))
    expect(res.blocked).toBe(false)
    expect(res.tier).toBe('ALLOWED')
    expect(res.hits.every((h) => h.severityRank <= 3)).toBe(true)
    expect(hit(res, 'CI-FIRSTLINE-FOUR-CLASSES')).toBeDefined()
    expect(res.scoreDeltasBySubstance.amlodipine.appropriateness).toBe(10)
  })
})

// ---------------------------------------------------------------------------

describe('rules engine — dose-resolved adverse-effect risk', () => {
  it('attributes a substance-tagged risk only to the drug that is actually prescribed', () => {
    // AE-CHANNELS-VISIBLE fires on ANY of lisinopril / amlodipine / hydrochlorothiazide
    // and then lists each drug's own channel. Without the substance gate an
    // amlodipine-only arm inherited lisinopril's cough, angioedema and hyperkalaemia,
    // each carrying an FDA citation pointing at a drug the patient is not taking.
    const amlo = run(twinOf(), regimen(['amlodipine', 5, 1]))
    expect(hit(amlo, 'AE-CHANNELS-VISIBLE')).toBeDefined()
    expect(amlo.risks['risk.peripheral_edema']).toBeGreaterThan(0)
    expect(amlo.risks['risk.cough']).toBeUndefined()
    expect(amlo.risks['risk.angioedema']).toBeUndefined()
    expect(amlo.risks['risk.hyperkalemia']).toBeUndefined()

    const lis = run(twinOf(), regimen(['lisinopril', 20, 1]))
    expect(lis.risks['risk.cough']).toBeGreaterThan(0)
    expect(lis.risks['risk.peripheral_edema']).toBeUndefined()
  })

  it('reads the amlodipine oedema dose-response table and reports EXCESS over placebo', () => {
    // NORVASC label: 1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg against 0.6 % placebo.
    // The raw dose curve, before any subgroup modifier.
    const raw = (mg: number) =>
      interpolateDoseResponse(
        [
          { mg: 2.5, pct: 1.8 },
          { mg: 5, pct: 3 },
          { mg: 10, pct: 10.8 },
        ],
        mg,
      )!
    expect((raw(2.5) - 0.6) / 100).toBeCloseTo(0.012, 6)
    expect((raw(5) - 0.6) / 100).toBeCloseTo(0.024, 6)
    expect((raw(10) - 0.6) / 100).toBeCloseTo(0.102, 6)

    // As delivered to the report, with the sex modifier applied (male 0.86).
    const at = (mg: number) => run(twinOf(), regimen(['amlodipine', mg, 1])).risks['risk.peripheral_edema']
    expect(at(2.5)).toBeCloseTo(0.012 * 0.86, 6)
    expect(at(5)).toBeCloseTo(0.024 * 0.86, 6)
    expect(at(10)).toBeCloseTo(0.102 * 0.86, 6)

    // Strictly increasing, and steepening over the last doubling — that shape is the
    // whole reason the dose tradeoff is visible at all.
    expect(at(10) - at(5)).toBeGreaterThan(at(5) - at(2.5))
  })

  it('interpolates between published points and does not extrapolate past them', () => {
    expect(interpolateDoseResponse([{ mg: 2.5, pct: 1.8 }, { mg: 5, pct: 3 }, { mg: 10, pct: 10.8 }], 5)).toBeCloseTo(3, 9)
    const mid = interpolateDoseResponse([{ mg: 5, pct: 3 }, { mg: 10, pct: 10.8 }], 7.07)!
    expect(mid).toBeGreaterThan(3)
    expect(mid).toBeLessThan(10.8)
    // Outside the studied range the endpoints hold flat; inventing a labelled
    // incidence at a dose nobody studied is exactly what we must not do.
    expect(interpolateDoseResponse([{ mg: 2.5, pct: 1.8 }, { mg: 10, pct: 10.8 }], 40)).toBe(10.8)
    expect(interpolateDoseResponse([{ mg: 2.5, pct: 1.8 }, { mg: 10, pct: 10.8 }], 0.5)).toBe(1.8)
  })

  it('treats two estimates of one channel as one quantity, not two independent events', () => {
    // AE-CHANNELS-VISIBLE gives ACE-inhibitor cough twice: 2.5% placebo-subtracted off
    // the label, and 11.48% real-world pooled, with the data saying to use the second.
    // Composing them as independent hazards would report 13.7%, a number no source states.
    const lis = run(twinOf(), regimen(['lisinopril', 20, 1]))
    expect(lis.risks['risk.cough']).toBeCloseTo(0.1148, 6)
  })

  it('refuses a bare odds ratio with no baseline rather than inventing a denominator', () => {
    // HCTZ squamous-cell OR 3.98, conditioned on 50,000 mg cumulative exposure.
    const h = run(twinOf(), regimen(['hydrochlorothiazide', 25, 1]))
    expect(hit(h, 'AE-CHANNELS-VISIBLE')).toBeDefined()
    expect(h.risks['risk.nonmelanoma_skin_cancer']).toBeUndefined()
    expect(h.risks['risk.acute_angle_closure_glaucoma']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------

describe('rules engine — risk_modify (subgroup risk)', () => {
  const edema = (t: ReturnType<typeof twinOf>, mg: number) =>
    run(t, regimen(['amlodipine', mg, 1])).risks['risk.peripheral_edema']

  it('scales an established risk by the placebo-subtracted subgroup multiplier', () => {
    // recommended_multiplier: male 0.86, female 1.94.
    const male = twinOf({ sex: 'male' })
    const female = twinOf({ sex: 'female' })
    expect(edema(male, 10)).toBeCloseTo(0.102 * 0.86, 6)
    expect(edema(female, 10)).toBeCloseTo(0.102 * 1.94, 6)
    expect(edema(female, 10) / edema(male, 10)).toBeCloseTo(1.94 / 0.86, 6)
  })

  it('uses the placebo-subtracted set, NOT the raw-incidence alternative', () => {
    // The placebo arm carries the same skew (1.4% male vs 5.1% female), so a large part
    // of the raw gap is background oedema in women rather than drug effect. Using
    // alternative_multiplier (0.68 / 1.77) would attribute that background to
    // amlodipine and overstate its sex difference.
    const female = twinOf({ sex: 'female' })
    expect(edema(female, 10)).toBeCloseTo(0.102 * 1.94, 6)
    expect(edema(female, 10)).not.toBeCloseTo(0.102 * 1.77, 4)
    const male = twinOf({ sex: 'male' })
    expect(edema(male, 10)).toBeCloseTo(0.102 * 0.86, 6)
    expect(edema(male, 10)).not.toBeCloseTo(0.102 * 0.68, 4)
  })

  it('modifies without disturbing the dose-response shape', () => {
    const female = twinOf({ sex: 'female' })
    const ratio = (a: number, b: number) => edema(female, a) / edema(female, b)
    // Multiplicative, so every dose ratio is preserved exactly.
    expect(ratio(10, 5)).toBeCloseTo(0.102 / 0.024, 6)
    expect(ratio(5, 2.5)).toBeCloseTo(0.024 / 0.012, 6)
  })

  it('is gated on the substance actually prescribed', () => {
    const female = twinOf({ sex: 'female' })
    const lis = run(female, regimen(['lisinopril', 20, 1]))
    expect(lis.risks['risk.peripheral_edema']).toBeUndefined()
    expect(lis.caveats ?? []).toHaveLength(0)
  })

  it('carries the modelling caveat, flagged as an assumption rather than a label claim', () => {
    const female = twinOf({ sex: 'female' })
    const res = run(female, regimen(['amlodipine', 10, 1]))
    expect(res.caveats ?? []).toHaveLength(1)
    const c = (res.caveats ?? [])[0]
    expect(c.ruleId).toBe('AE-CHANNELS-VISIBLE')
    expect(c.channel).toBe('risk.peripheral_edema')
    expect(c.basis).toBe('placebo_subtracted_attributable_risk')
    // The label pools sex across doses and publishes no sex-by-dose cell; the
    // interaction is ours, not the label's.
    expect(c.text).toMatch(/POOLED ACROSS DOSES/)
    expect(c.text).toMatch(/constant proportional hazard/)
  })
})
