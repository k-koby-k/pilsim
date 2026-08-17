/**
 * The number boundary. This is the most important test file in src/ai.
 *
 * The claim it defends: a number the model wrote that was not in the context
 * cannot render as though it were sourced. Everything else in the AI layer is
 * presentation; this is the part that stops a language model from putting a
 * plausible, uncited dose in front of a clinician.
 */

import { describe as suite, expect, it } from 'vitest'
import {
  checkNumbers,
  extractNumbers,
  factsFromText,
  findSupport,
  segment,
  stripUnsupported,
  summarize,
  UNSOURCED_MARK,
  valueSupports,
  type NumberFact,
} from './numbers'
import { canonicalUnit, readUnit } from './units'

const facts = (...f: [number, NumberFact['unit'], string?][]): NumberFact[] =>
  f.map(([value, unit, label]) => ({ value, unit, label: label ?? 'fact' }))

suite('tokenizing', () => {
  it('reads a number and the unit written after it, spaced or not', () => {
    const [a, b] = extractNumbers('amlodipine 5 mg and 10mg')
    expect(a).toMatchObject({ value: 5, unit: 'mg', decimals: 0 })
    expect(b).toMatchObject({ value: 10, unit: 'mg' })
  })

  it('canonicalizes the ways a unit gets written', () => {
    expect(extractNumbers('fell 12 mmHg')[0].unit).toBe('mmHg')
    expect(extractNumbers('fell 12 mm Hg')[0].unit).toBe('mmHg')
    expect(extractNumbers('62 %')[0].unit).toBe('%')
    expect(extractNumbers('62%')[0].unit).toBe('%')
    expect(extractNumbers('80.2 ng/mL')[0].unit).toBe('ng/mL')
    expect(extractNumbers('4.9 mmol/L')[0].unit).toBe('mmol/L')
    expect(canonicalUnit('mg/dL')).toBe('mg/dL')
  })

  it('refuses a word that merely starts like a unit', () => {
    // "5 doses" must not become 5 days, or the day-based monitoring facts would
    // start supporting numbers that have nothing to do with them.
    expect(extractNumbers('5 doses were taken')[0].unit).toBeNull()
    expect(readUnit('5 daylight', 1)).toBeNull()
  })

  it('does not turn an identifier into a negative number', () => {
    // EXP-3174 and HTN-014 appear all over the rules; tokenizing the hyphen as a
    // sign would make the two sides of the boundary disagree about the same text.
    expect(extractNumbers('EXP-3174').map((t) => t.value)).toEqual([3174])
    expect(extractNumbers('rule HTN-014 fired').map((t) => t.value)).toEqual([14])
  })

  it('handles thousands separators and unicode minus', () => {
    expect(extractNumbers('10,000 Neurons')[0].value).toBe(10000)
    expect(extractNumbers('−12 mmHg')[0].value).toBe(-12)
  })

  it('records offsets covering the number AND its unit', () => {
    const t = extractNumbers('gave 5 mg daily')[0]
    expect('gave 5 mg daily'.slice(t.start, t.end)).toBe('5 mg')
  })
})

suite('matching a written number against a supplied one', () => {
  it('accepts rounding to the precision the model actually wrote', () => {
    expect(valueSupports(12.4, { value: 12, decimals: 0 })).toBe(true)
    expect(valueSupports(12.4, { value: 12.4, decimals: 1 })).toBe(true)
  })

  it('rejects invented precision', () => {
    // Writing more digits than the source had is a stronger claim, so it loses.
    expect(valueSupports(12, { value: 12.37, decimals: 2 })).toBe(false)
  })

  it('compares magnitude, because a reduction is printed both ways', () => {
    expect(valueSupports(-12.4, { value: 12, decimals: 0 })).toBe(true)
  })

  it('requires the same unit when the model wrote one', () => {
    const supplied = facts([25, 'mg', 'hydrochlorothiazide dose'])
    const [mmHg] = extractNumbers('25 mmHg')
    const [mg] = extractNumbers('25 mg')
    expect(findSupport(mmHg, supplied)).toBeNull()
    expect(findSupport(mg, supplied)).not.toBeNull()
  })

  it('lets a bare number match any supplied fact', () => {
    const [bare] = extractNumbers('ranked 3 of 15')
    expect(findSupport(bare, facts([3, 'mg']))).not.toBeNull()
  })
})

suite('the failure this file exists to prevent', () => {
  const context =
    'amlodipine dose: 5 mg\n' +
    'placebo-corrected systolic reduction: 12.4 mmHg\n' +
    'probability of peripheral edema over the horizon: 3 %\n'
  const supplied = [
    ...facts([5, 'mg', 'amlodipine dose'], [12.4, 'mmHg', 'systolic reduction'], [3, '%', 'oedema']),
    ...factsFromText(context, 'context text'),
  ]

  it('flags an invented dose', () => {
    const reply = 'Start amlodipine 7 mg once daily.'
    const checked = checkNumbers(reply, supplied)
    expect(checked).toHaveLength(1)
    expect(checked[0]).toMatchObject({ value: 7, unit: 'mg', status: 'unsupported' })
    expect(summarize(checked).clean).toBe(false)
  })

  it('flags a dose that borrowed a number from a different unit', () => {
    // 12.4 is in the context — as mmHg. As a milligram dose it is invented.
    const checked = checkNumbers('Give 12.4 mg.', supplied)
    expect(checked[0].status).toBe('unsupported')
  })

  it('accepts the supplied numbers, including rounded', () => {
    const checked = checkNumbers('Amlodipine 5 mg lowered systolic pressure by 12 mmHg.', supplied)
    expect(summarize(checked)).toMatchObject({ total: 2, supported: 2, unsupported: 0, clean: true })
  })

  it('flags an invented percentage even when the digits appear elsewhere', () => {
    const checked = checkNumbers('Oedema risk is 5 %.', supplied)
    expect(checked[0].status).toBe('unsupported')
  })

  it('flags an invented citation year', () => {
    const checked = checkNumbers('per the 2019 guideline', supplied)
    expect(checked[0].status).toBe('unsupported')
  })

  it('strips rather than renders, where prose sits beside engine output', () => {
    const out = stripUnsupported('Start amlodipine 7 mg, expect 12 mmHg.', supplied)
    expect(out).toBe(`Start amlodipine ${UNSOURCED_MARK}, expect 12 mmHg.`)
    expect(out).not.toContain('7 mg')
  })

  it('marks every number in the rendered segments, so none can render as plain prose', () => {
    const reply = 'Amlodipine 5 mg gives 12 mmHg; the 7 mg step is not modelled.'
    const segs = segment(reply, checkNumbers(reply, supplied))
    const numbers = segs.filter((s) => s.kind === 'number')
    expect(numbers).toHaveLength(3)
    expect(numbers.every((n) => n.status === 'supported' || n.status === 'unsupported')).toBe(true)
    expect(numbers.find((n) => n.text.startsWith('7'))?.status).toBe('unsupported')
    // Reassembling the segments must give the text back untouched.
    expect(segs.map((s) => s.text).join('')).toBe(reply)
  })

  it('carries the supporting fact so every rendered number is traceable', () => {
    const checked = checkNumbers('12 mmHg', supplied)
    expect(checked[0].fact?.label).toBe('systolic reduction')
  })
})

suite('streaming', () => {
  it('holds a half-written trailing number as pending, not as a violation', () => {
    const supplied = facts([12.4, 'mmHg', 'systolic reduction'])
    // "12" would be flagged the instant it arrives if the tail were judged.
    expect(checkNumbers('a fall of 12', supplied, { partial: true })[0].status).toBe('pending')
    expect(checkNumbers('a fall of 12.4 mmHg today', supplied, { partial: true })[0].status).toBe('supported')
  })
})
