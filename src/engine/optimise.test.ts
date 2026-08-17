/**
 * Top-N dose combination search (src/engine/optimise.ts).
 */
import { describe, it, expect } from 'vitest'
import {
  enumerateCandidateRegimens,
  evaluateCandidates,
  findTopCombinations,
  LICENSED_STRENGTHS_MG,
  defaultOptimiseScore,
} from './optimise'
import { DOSABLE_DRUGS, STANDARD_DOSE_MG } from './constants'
import { LAW_REFERENCE_SBP, LAW_REFERENCE_DBP } from './constants'
import type { CombinationSubject } from './combination'

const SUBJECT: CombinationSubject = { sbpBaseline: LAW_REFERENCE_SBP, dbpBaseline: LAW_REFERENCE_DBP }

describe('enumerateCandidateRegimens', () => {
  it('enumerates monotherapy at every licensed strength of every dosable drug', () => {
    const regimens = enumerateCandidateRegimens({ includePairs: false })
    const expected = DOSABLE_DRUGS.reduce((n, id) => n + LICENSED_STRENGTHS_MG[id].length, 0)
    expect(regimens.length).toBe(expected)
    for (const r of regimens) expect(r.doses.length).toBe(1)
  })

  it('enumerates every unordered pair of two DIFFERENT drugs at every strength combination, once each', () => {
    const regimens = enumerateCandidateRegimens({ includeMonotherapy: false })
    let expected = 0
    for (let i = 0; i < DOSABLE_DRUGS.length; i++) {
      for (let j = i + 1; j < DOSABLE_DRUGS.length; j++) {
        expected +=
          LICENSED_STRENGTHS_MG[DOSABLE_DRUGS[i]].length * LICENSED_STRENGTHS_MG[DOSABLE_DRUGS[j]].length
      }
    }
    expect(regimens.length).toBe(expected)
    for (const r of regimens) {
      expect(r.doses.length).toBe(2)
      expect(r.doses[0].substanceId).not.toBe(r.doses[1].substanceId)
    }
  })

  it('does not duplicate a pair in the opposite order', () => {
    const regimens = enumerateCandidateRegimens({ includeMonotherapy: false })
    const keys = new Set(
      regimens.map((r) => r.doses.map((d) => d.substanceId).sort().join('+')),
    )
    // one unordered-drug-pair key per (drug,drug) combo, not per strength —
    // check there is no regimen whose drug pair, reversed, also appears as a
    // SEPARATE candidate set (i.e. no lisinopril+losartan AND losartan+lisinopril
    // treated as different keys — they collapse to the same sorted key here,
    // and every regimen's own substance ids are never equal to each other).
    expect(keys.size).toBe((DOSABLE_DRUGS.length * (DOSABLE_DRUGS.length - 1)) / 2)
  })

  it('is milliseconds of arithmetic for the shipped five-drug set (~200 candidates)', () => {
    const regimens = enumerateCandidateRegimens()
    expect(regimens.length).toBeGreaterThan(100)
    expect(regimens.length).toBeLessThan(400)
  })
})

describe('evaluateCandidates', () => {
  it('uses the analytic combinationRule, never an ODE run — synchronous and cheap', () => {
    const regimens = enumerateCandidateRegimens()
    const t0 = performance.now()
    const evaluated = evaluateCandidates(regimens, SUBJECT)
    const elapsedMs = performance.now() - t0
    expect(evaluated.length).toBe(regimens.length)
    expect(elapsedMs).toBeLessThan(200)
    for (const c of evaluated) {
      expect(typeof c.result.dsbp).toBe('number')
      expect(typeof c.adverseBurden).toBe('number')
    }
  })
})

describe('findTopCombinations', () => {
  it('returns 5 by default, best first by the default score', () => {
    const top = findTopCombinations(SUBJECT)
    expect(top.length).toBe(5)
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score)
      expect(defaultOptimiseScore(top[i - 1])).toBeCloseTo(top[i - 1].score, 9)
    }
    expect(top.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it('respects a custom n', () => {
    expect(findTopCombinations(SUBJECT, { n: 3 }).length).toBe(3)
    expect(findTopCombinations(SUBJECT, { n: 12 }).length).toBe(12)
  })

  it('does NOT drop dual-RAAS pairs by default — they appear and rank wherever the arithmetic puts them', () => {
    const all = findTopCombinations(SUBJECT, { n: 1000 })
    const dualRaas = all.filter((c) => c.result.dualRaas)
    expect(dualRaas.length).toBeGreaterThan(0)
    // and they should not be artificially placed first either — the whole
    // point is that the arithmetic, not a hardcoded rule, demotes them.
    const bestDualRaasRank = Math.min(...dualRaas.map((c) => c.rank))
    expect(bestDualRaasRank).toBeGreaterThan(1)
  })

  it('a supplied filter removes candidates from the ranked output entirely', () => {
    const withoutFilter = findTopCombinations(SUBJECT, { n: 1000 })
    const blockedCount = withoutFilter.filter((c) => c.result.dualRaas).length
    expect(blockedCount).toBeGreaterThan(0)

    const filtered = findTopCombinations(SUBJECT, { n: 1000, filter: (c) => !c.result.dualRaas })
    expect(filtered.length).toBe(withoutFilter.length - blockedCount)
    expect(filtered.every((c) => !c.result.dualRaas)).toBe(true)
  })

  it('a supplied score callback overrides ranking (e.g. rank by raw efficacy)', () => {
    const byEfficacy = findTopCombinations(SUBJECT, { score: (c) => c.result.dsbp })
    // Ranking on efficacy alone should push a max-strength monotherapy or an
    // aggressive pair to the top — different from the default's top pick,
    // demonstrating the callback is actually used.
    const byDefault = findTopCombinations(SUBJECT)
    expect(byEfficacy[0].regimen.id).not.toBe(byDefault[0].regimen.id)
  })

  it('the default score is NOT efficacy alone (efficacy-only would push every drug to max strength)', () => {
    const top = findTopCombinations(SUBJECT, { n: 1 })[0]
    const maxMonoDsbp = Math.max(
      ...DOSABLE_DRUGS.map((id) => {
        const maxMg = Math.max(...LICENSED_STRENGTHS_MG[id])
        return evaluateCandidates(
          [{ id: 'x', label: 'x', doses: [{ substanceId: id, mg: maxMg, perDay: 1 }] }],
          SUBJECT,
        )[0].result.dsbp
      }),
    )
    // The top pick under the real (burden-aware) default should not simply be
    // "whichever single drug has the biggest raw effect at its max strength".
    expect(top.result.dsbp === maxMonoDsbp && top.regimen.doses.length === 1).toBe(false)
  })

  it('strengths come from STANDARD_DOSE_MG-anchored, licensed values (sanity: standard dose is licensed)', () => {
    for (const id of DOSABLE_DRUGS) {
      expect(LICENSED_STRENGTHS_MG[id]).toContain(STANDARD_DOSE_MG[id])
    }
  })
})
