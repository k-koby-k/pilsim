/**
 * Dosage-form PK (spec: DoseSpec.form). Two behaviours are the required tests
 * per the feature spec:
 *   1. metoprolol ER vs IR at the same dose gives a materially different
 *      peak-to-trough ratio (flatter, later, lower exposure).
 *   2. a non-existent form is refused, not simulated.
 * Plus coverage of the "pkEquivalent" exposure and the byte-identical
 * omitted-form default.
 */
import { describe, it, expect } from 'vitest'
import { buildPkParams, buildDoseHistory, concentrationAt, type PkCovariates } from './pk'
import { UnavailableFormError, resolveForm, listFormsForDrug } from './formulations'
import type { Regimen } from '../types'

const REF: PkCovariates = {
  weightKg: 70,
  egfr: 90,
  ageYears: 55,
  cyp2d6: 'normal',
  cyp2c9: 'normal',
  hepaticImpairment: false,
}

const METOPROLOL_ER_FORM =
  'extended-release tablet (metoprolol succinate, multiple-unit pellet system)'

/** Steady-state peak/trough plasma-concentration ratio over one dosing interval. */
function peakToTroughRatio(form: string | undefined, mg: number, perDay: number): number {
  const params = buildPkParams('metoprolol', REF, undefined, undefined, form)
  const regimen: Regimen = {
    id: `pk-test-${form ?? 'ir'}`,
    label: 'test',
    doses: [{ substanceId: 'metoprolol', mg, perDay, form }],
  }
  const interval = 24 / perDay
  const doses = buildDoseHistory(regimen, 'steady_state', interval)
  let peak = 0
  let trough = Infinity
  for (let t = 0.005; t <= interval; t += 0.005) {
    const c = concentrationAt(doses, params, t)
    if (c > peak) peak = c
    if (c < trough) trough = c
  }
  return peak / trough
}

describe('formulations — metoprolol ER vs IR', () => {
  it('gives a materially different (much flatter) peak-to-trough ratio at the same dose', () => {
    const ir = peakToTroughRatio(undefined, 100, 1)
    const er = peakToTroughRatio(METOPROLOL_ER_FORM, 100, 1)
    expect(er).toBeLessThan(ir * 0.5)
  })

  it('ER has a later time-to-peak than IR', () => {
    const paramsIr = buildPkParams('metoprolol', REF)
    const paramsEr = buildPkParams('metoprolol', REF, undefined, undefined, METOPROLOL_ER_FORM)
    const tmaxOf = (p: typeof paramsIr) => {
      let peakT = 0
      let peakC = 0
      for (let t = 0.01; t <= 30; t += 0.01) {
        const c = concentrationAt([{ drugId: 'metoprolol', mg: 100, timeH: 0 }], p, t)
        if (c > peakC) {
          peakC = c
          peakT = t
        }
      }
      return peakT
    }
    expect(tmaxOf(paramsEr)).toBeGreaterThan(tmaxOf(paramsIr))
  })

  it('ER has lower peak exposure than IR at the same dose (F 0.77 and a flatter absorption)', () => {
    const paramsIr = buildPkParams('metoprolol', REF)
    const paramsEr = buildPkParams('metoprolol', REF, undefined, undefined, METOPROLOL_ER_FORM)
    let peakIr = 0
    let peakEr = 0
    for (let t = 0.01; t <= 30; t += 0.01) {
      peakIr = Math.max(peakIr, concentrationAt([{ drugId: 'metoprolol', mg: 100, timeH: 0 }], paramsIr, t))
      peakEr = Math.max(peakEr, concentrationAt([{ drugId: 'metoprolol', mg: 100, timeH: 0 }], paramsEr, t))
    }
    expect(peakEr).toBeLessThan(peakIr)
  })

  it('omitting form is byte-identical to today’s (pre-feature) default', () => {
    const withUndefined = buildPkParams('metoprolol', REF, undefined, undefined, undefined)
    const withoutArg = buildPkParams('metoprolol', REF)
    expect(withUndefined).toEqual(withoutArg)
  })
})

describe('formulations — refusal of non-existent products', () => {
  it('refuses extended-release lisinopril (exists_real_world: false)', () => {
    expect(() =>
      buildPkParams('lisinopril', REF, undefined, undefined, 'extended-release tablet'),
    ).toThrow(UnavailableFormError)
  })

  it('refuses transdermal amlodipine (exists_real_world: false)', () => {
    expect(() =>
      buildPkParams('amlodipine', REF, undefined, undefined, 'intravenous / transdermal / sublingual'),
    ).toThrow(UnavailableFormError)
  })

  it('the thrown error carries the drug and form for the UI to render', () => {
    try {
      buildPkParams('amlodipine', REF, undefined, undefined, 'extended-release tablet')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnavailableFormError)
      const e = err as UnavailableFormError
      expect(e.drugId).toBe('amlodipine')
      expect(e.form).toBe('extended-release tablet')
    }
  })

  it('refuses an unrecognised form string rather than silently defaulting', () => {
    expect(() =>
      buildPkParams('metoprolol', REF, undefined, undefined, 'nasal spray'),
    ).toThrow(UnavailableFormError)
  })
})

describe('formulations — PK-equivalent forms are labelled, not silently defaulted', () => {
  it('lisinopril oral solution is real and exposed as pkEquivalent', () => {
    const resolved = resolveForm('lisinopril', 'oral solution')
    expect(resolved.existsRealWorld).toBe(true)
    expect(resolved.pkEquivalent).toBe(true)
    expect(resolved.fRelative).toBe(1)
  })

  it('hydrochlorothiazide capsule is real but NOT pkEquivalent (tmax 1.5 h vs tablet 3.5 h)', () => {
    const resolved = resolveForm('hydrochlorothiazide', 'capsule')
    expect(resolved.existsRealWorld).toBe(true)
    expect(resolved.pkEquivalent).toBe(false)
    expect(resolved.tmaxH).toBe(1.5)
  })

  it('listFormsForDrug enumerates every form without throwing, refused ones included', () => {
    const forms = listFormsForDrug('amlodipine')
    expect(forms.some((f) => f.isReference)).toBe(true)
    const transdermal = forms.find((f) => f.form.includes('transdermal'))
    expect(transdermal?.existsRealWorld).toBe(false)
  })
})
