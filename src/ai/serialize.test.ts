/**
 * The plan serializer.
 *
 * `src/report/plan.ts` is being written by another agent while this runs, so
 * these tests use a plan-SHAPED object rather than the real type. That is the
 * point: nothing here may depend on a field name, or the AI panel silently
 * stops mentioning whatever the plan grows next.
 */

import { describe as suite, expect, it } from 'vitest'
import { extractNumbers } from './numbers'
import { describe, humanizeKey, unitFromKey } from './serialize'

suite('key humanizing and unit inference', () => {
  it('reads the unit out of the field name', () => {
    expect(unitFromKey('startDoseMg')).toEqual({ unit: 'mg', label: 'start dose' })
    expect(unitFromKey('time_to_target_days')).toEqual({ unit: 'days', label: 'time to target' })
    expect(unitFromKey('targetSbpMmHg').unit).toBe('mmHg')
    expect(unitFromKey('serum_k_mmol_l').unit).toBe('mmol/L')
    expect(unitFromKey('goalAttainmentPct').unit).toBe('%')
  })

  it('falls back on the few names the app prints with an unspoken unit', () => {
    expect(unitFromKey('deltaSbp').unit).toBe('mmHg')
    expect(unitFromKey('restingHr').unit).toBe('bpm')
  })

  it('leaves a name it cannot read as unitless rather than guessing', () => {
    expect(unitFromKey('titrationSteps').unit).toBeNull()
    expect(humanizeKey('what_to_avoid')).toBe('what to avoid')
  })
})

suite('describing a plan-shaped object', () => {
  const plan = {
    startWith: { substanceId: 'amlodipine', doseMg: 5, perDay: 1 },
    whyThisDose: 'Half the licensed maximum, because the oedema risk rises supra-linearly.',
    targetSbpMmHg: 130,
    projectedTimeToTargetDays: 28,
    monitoring: [
      { lab: 'serum potassium', atDays: [7, 28], changesPlanIfAbove: 5.5 },
      { lab: 'creatinine', atDays: [7], changesPlanIfAbove: 1.9 },
    ],
    avoid: [{ ruleId: 'HTN-014', reason: 'ACE inhibitor with an ARB', citation: { status: 'CITED', source: 'VA NEPHRON-D' } }],
    halfLife: { value: 35, unit: 'h', provenance: { status: 'CITED', source: 'FDA label', quote: '30 to 50 hours' } },
  }

  it('renders every leaf as a labelled line', () => {
    const { lines } = describe(plan)
    const text = lines.join('\n')
    expect(text).toContain('dose: 5 mg')
    expect(text).toContain('target sbp: 130 mmHg')
    expect(text).toContain('projected time to target: 28 days')
    expect(text).toContain('Half the licensed maximum')
  })

  it('registers a fact for every number it renders, with the inferred unit', () => {
    const { facts } = describe(plan)
    expect(facts).toContainEqual(expect.objectContaining({ value: 5, unit: 'mg' }))
    expect(facts).toContainEqual(expect.objectContaining({ value: 130, unit: 'mmHg' }))
    expect(facts).toContainEqual(expect.objectContaining({ value: 28, unit: 'days' }))
    expect(facts).toContainEqual(expect.objectContaining({ value: 7, unit: 'days' }))
  })

  it('never registers a fact for a number it did not print', () => {
    // The invariant the whole boundary rests on: the allowed set is exactly as
    // wide as what the model was shown, never one number wider.
    const { lines, facts } = describe(plan)
    const printed = extractNumbers(lines.join('\n')).map((t) => Math.abs(t.value))
    for (const f of facts) {
      const v = Math.abs(f.value)
      expect(
        printed.some((p) => Math.abs(p - v) <= 1e-6 * Math.max(1, v)),
        `fact ${f.value} (${f.label}) was registered but never printed`,
      ).toBe(true)
    }
  })

  it('stops at the depth cap instead of walking a whole object graph', () => {
    const deep = { one: { two: { three: { four: 1234 } } } }
    const { lines, facts } = describe(deep, { maxDepth: 2 })
    expect(lines.join('\n')).not.toContain('1234')
    expect(facts.map((f) => f.value)).not.toContain(1234)
  })

  it('renders a Measured with its provenance and its quote', () => {
    const { lines, facts } = describe(plan)
    const text = lines.join('\n')
    expect(text).toContain('35 h')
    expect(text).toContain('FDA label')
    expect(facts).toContainEqual(expect.objectContaining({ value: 35, unit: 'h', source: 'FDA label' }))
  })

  it('renders a Provenance as its source rather than as an object', () => {
    expect(describe(plan).lines.join('\n')).toContain('VA NEPHRON-D')
  })

  it('sends a proportion in both renderings, so a percentage is not a violation', () => {
    // The rest of the product prints 0.108 as "10.8 %". If only the fraction
    // were supplied, the model writing the percentage would be flagged for
    // quoting our own number back at us.
    const { lines, facts } = describe({ edemaProbability: 0.108 })
    expect(lines.join('\n')).toContain('10.8 %')
    expect(facts).toContainEqual(expect.objectContaining({ value: 10.8, unit: '%' }))
    expect(facts).toContainEqual(expect.objectContaining({ value: 0.108 }))
  })

  it('survives a cycle and an unknown shape without throwing', () => {
    const cyclic: Record<string, unknown> = { name: 'x' }
    cyclic.self = cyclic
    expect(() => describe(cyclic)).not.toThrow()
    expect(() => describe(null)).not.toThrow()
    expect(() => describe([1, 2, 3])).not.toThrow()
  })

  it('caps a long list rather than flooding the prompt', () => {
    const { lines } = describe({ steps: Array.from({ length: 40 }, (_, i) => ({ n: i })) }, { maxItems: 4 })
    expect(lines.join('\n')).toContain('36 more not shown')
  })
})
