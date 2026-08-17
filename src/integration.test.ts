/**
 * Lead-owned cross-module regression guards. Not owned by any build agent.
 *
 * These exist because the properties they assert span module boundaries, so no
 * single agent's suite would catch a regression in them.
 */
import { describe, it, expect } from 'vitest'
import { combinationRule } from './engine/index'
import type { DrugId, Regimen } from './types'

const SUBJECT = { sbpBaseline: 154, dbpBaseline: 100 } as never

const DRUGS: { id: DrugId; doses: number[]; saturates: boolean }[] = [
  { id: 'lisinopril', doses: [5, 10, 20, 40], saturates: true },
  { id: 'losartan', doses: [25, 50, 100], saturates: true },
  { id: 'hydrochlorothiazide', doses: [6.25, 12.5, 25], saturates: true },
  { id: 'metoprolol', doses: [25, 50, 100, 200], saturates: true },
  // Amlodipine is the deliberate exception. Its fitted ED50 is 0.98x the standard
  // dose, so at 5 mg it sits only halfway up its own curve and doubling still
  // climbs the steep part. Three independent sources agree this is real:
  // Law 2003's fitted CCB ED50, the 2025 Lancet giving CCBs the largest
  // per-doubling gain (-2.6 mmHg), and the amlodipine label's own 5->10 mg
  // increment of 2.9 mmHg. Do NOT "fix" this into saturating.
  { id: 'amlodipine', doses: [2.5, 5, 10], saturates: false },
]

function effectAt(id: DrugId, mg: number): number {
  const regimen: Regimen = {
    id: `${id}-${mg}`,
    label: `${id} ${mg} mg`,
    doses: [{ substanceId: id, mg, perDay: 1 }],
  }
  return combinationRule(regimen, SUBJECT).dsbp
}

describe('dose-response must not be linear', () => {
  it.each(DRUGS)('$id has the expected curve shape', ({ id, doses, saturates }) => {
    const effects = doses.map((mg) => effectAt(id, mg))
    const steps = effects.slice(1).map((e, i) => e - effects[i])

    for (const s of steps) expect(s).toBeGreaterThan(0)

    const first = steps[0]
    const last = steps[steps.length - 1]

    if (saturates) {
      // Diminishing returns. A linear implementation fails here, which is the
      // point: if efficacy is linear in dose the optimiser always picks the
      // maximum and the product's headline "best dose" output is meaningless.
      expect(last).toBeLessThan(first * 0.95)
    } else {
      // Still must not ACCELERATE with dose.
      expect(last).toBeLessThanOrEqual(first + 1e-6)
    }
  })

  it('amlodipine 5->10 mg reproduces the labelled 2.9 mmHg increment', () => {
    const increment = effectAt('amlodipine', 10) - effectAt('amlodipine', 5)
    expect(increment).toBeGreaterThan(2.4)
    expect(increment).toBeLessThan(3.4)
  })
})

describe('combination beats dose escalation', () => {
  it('two half-dose drugs beat one double-dose drug', () => {
    const doubleMono = combinationRule(
      {
        id: 'mono-double',
        label: 'lisinopril 40',
        doses: [{ substanceId: 'lisinopril', mg: 40, perDay: 1 }],
      },
      SUBJECT,
    ).dsbp

    const halfPair = combinationRule(
      {
        id: 'pair-half',
        label: 'lisinopril 5 + amlodipine 2.5',
        doses: [
          { substanceId: 'lisinopril', mg: 5, perDay: 1 },
          { substanceId: 'amlodipine', mg: 2.5, perDay: 1 },
        ],
      },
      SUBJECT,
    ).dsbp

    expect(halfPair).toBeGreaterThan(doubleMono)
  })

  it('dual RAAS blockade is markedly sub-additive', () => {
    const lis = combinationRule(
      { id: 'l', label: 'l', doses: [{ substanceId: 'lisinopril', mg: 10, perDay: 1 }] },
      SUBJECT,
    ).dsbp
    const los = combinationRule(
      { id: 'r', label: 'r', doses: [{ substanceId: 'losartan', mg: 50, perDay: 1 }] },
      SUBJECT,
    ).dsbp
    const both = combinationRule(
      {
        id: 'dual',
        label: 'dual RAAS',
        doses: [
          { substanceId: 'lisinopril', mg: 10, perDay: 1 },
          { substanceId: 'losartan', mg: 50, perDay: 1 },
        ],
      },
      SUBJECT,
    )

    // ONTARGET: adding the second RAS inhibitor buys ~2.4/1.4 mmHg, not the
    // ~10 mmHg a naive additive rule predicts.
    const incremental = both.dsbp - Math.max(lis, los)
    expect(incremental).toBeLessThan(4)
    expect(both.dualRaas).toBe(true)
  })
})
