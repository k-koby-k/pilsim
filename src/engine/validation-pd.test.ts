/**
 * research/06-VALIDATION.md §2 — dose–response and saturation.
 *
 * §2a-bis (SAT-01…SAT-06) is the reason this file exists: if dose–response is
 * linear the optimiser always picks the maximum dose and the product's headline
 * "best dose" output is trivially and visibly wrong. These tests are written to
 * be UNPASSABLE by a linear implementation.
 */
import { describe, it, expect } from 'vitest'
import { monotherapyEffect, classEffect, combinationRule } from './combination'
import { DRUG_CLASS, STANDARD_DOSE_MG, LAW_REFERENCE_SBP, LAW_REFERENCE_DBP, type DrugClass } from './constants'
import { runSimulationSync, referencePatient, makeRegimen, NO_MODIFIERS } from './run'
import { buildPkParams, batemanSingle } from './pk'
import { hill, EC50_NG_ML, effectSiteDerivative } from './pd'
import type { DrugId, SimRequest } from '../types'

const LAW = { sbpBaseline: LAW_REFERENCE_SBP, dbpBaseline: LAW_REFERENCE_DBP }
const CLASSES: DrugClass[] = ['THIAZIDE', 'BETA', 'ACEI', 'ARB', 'CCB']
const REPRESENTATIVE: Record<DrugClass, DrugId> = {
  THIAZIDE: 'hydrochlorothiazide',
  BETA: 'metoprolol',
  ACEI: 'lisinopril',
  ARB: 'losartan',
  CCB: 'amlodipine',
}

describe('PD-01…PD-05 — monotherapy at standard dose, ±1.0 mmHg', () => {
  const expected: [DrugId, number, number][] = [
    ['lisinopril', 8.5, 4.7],
    ['losartan', 10.3, 5.7],
    ['amlodipine', 8.8, 5.9],
    ['hydrochlorothiazide', 8.8, 4.4],
    ['metoprolol', 9.2, 6.7],
  ]
  for (const [drug, sbp, dbp] of expected) {
    it(`${drug}: ΔSBP ${sbp}, ΔDBP ${dbp}`, () => {
      const r = monotherapyEffect(drug, 1, LAW)
      expect(Math.abs(r.dsbp - sbp)).toBeLessThanOrEqual(1.0)
      expect(Math.abs(r.ddbp - dbp)).toBeLessThanOrEqual(1.0)
    })
  }
})

describe('PD-06…PD-13 — dose–response shape', () => {
  const table: [DrugClass, number, number, number][] = [
    ['THIAZIDE', 7.4, 8.8, 10.3],
    ['BETA', 7.4, 9.2, 11.1],
    ['ACEI', 6.9, 8.5, 10.0],
    ['ARB', 7.8, 10.3, 12.3],
    ['CCB', 5.9, 8.8, 11.7],
  ]
  for (const [cls, half, std, dbl] of table) {
    it(`${cls}: ½× / 1× / 2× = ${half} / ${std} / ${dbl}`, () => {
      const d = REPRESENTATIVE[cls]
      expect(Math.abs(monotherapyEffect(d, 0.5, LAW).dsbp - half)).toBeLessThanOrEqual(1.0)
      expect(Math.abs(monotherapyEffect(d, 1, LAW).dsbp - std)).toBeLessThanOrEqual(1.0)
      expect(Math.abs(monotherapyEffect(d, 2, LAW).dsbp - dbl)).toBeLessThanOrEqual(1.0)
    })
  }

  /**
   * ⚠️ PD-11 as written in 06-VALIDATION.md contradicts PD-06…PD-10 in the same
   * document. It asks for 1 − E(0.5)/E(1.0) ∈ [0.15, 0.28] for EVERY class, but
   * Law 2003's own CCB row is 5.9 and 8.8 mmHg, which IS 0.33. You cannot pin
   * the CCB dose points and also hold that ratio band. The primary data wins:
   * the band is asserted on the MEAN (Law's own "about 20 % less" is a pooled
   * statement) and each class is held to a wider [0.15, 0.35].
   */
  it('PD-11: half dose is ~20 % less than standard (mean across classes)', () => {
    const drops = CLASSES.map((cls) => {
      const d = REPRESENTATIVE[cls]
      return 1 - monotherapyEffect(d, 0.5, LAW).dsbp / monotherapyEffect(d, 1, LAW).dsbp
    })
    const mean = drops.reduce((a, b) => a + b, 0) / drops.length
    expect(mean).toBeGreaterThanOrEqual(0.15)
    expect(mean).toBeLessThanOrEqual(0.28)
    for (const [i, drop] of drops.entries()) {
      expect(drop, CLASSES[i]).toBeGreaterThanOrEqual(0.15)
      expect(drop, CLASSES[i]).toBeLessThanOrEqual(0.35)
    }
  })

  it('PD-12: thiazide dose–response is FLAT — E(2×) − E(1×) < 2.0 mmHg', () => {
    const g =
      monotherapyEffect('hydrochlorothiazide', 2, LAW).dsbp -
      monotherapyEffect('hydrochlorothiazide', 1, LAW).dsbp
    expect(g).toBeLessThan(2.0)
  })

  it('PD-13: CCB dose–response is STEEP — E(2×) − E(1×) > 2.0 mmHg', () => {
    const g = monotherapyEffect('amlodipine', 2, LAW).dsbp - monotherapyEffect('amlodipine', 1, LAW).dsbp
    expect(g).toBeGreaterThan(2.0)
  })

  it('PD-14: 8× standard dose clamps to 4× and flags extrapolated', () => {
    const r = monotherapyEffect('lisinopril', 8, LAW)
    expect(r.extrapolated).toBe(true)
    expect(r.extrapolatedDrugs).toContain('lisinopril')
    expect(r.dsbp).toBeCloseTo(monotherapyEffect('lisinopril', 4, LAW).dsbp, 6)
  })
})

describe('⭐ SAT-01…SAT-06 — the tests a linear implementation cannot pass', () => {
  /**
   * ⚠️ SAT-01's stated figure ("≈ 2.7 mmHg across a 16-fold range, tolerance
   * 1.5–4.5") is not consistent with the ARB Emax fit that PD-09 pins in the
   * same document: Emax 15.23 / ED50 0.477 gives E(0.25) = 5.24 and E(4) = 13.61,
   * a gain of 8.4 mmHg. 2.7 mmHg is roughly the 1×→2× gain, not the ¼×→4× one.
   *
   * The test's STATED PURPOSE — "a linear model spans ~40 mmHg here and fails by
   * an order of magnitude" — is what is asserted instead, and it is asserted
   * against the linear model explicitly rather than against a transcribed
   * constant.
   */
  it('SAT-01: ARB gain over a SIXTEEN-fold dose range is a small fraction of linear', () => {
    const e025 = monotherapyEffect('losartan', 0.25, LAW).dsbp
    const e1 = monotherapyEffect('losartan', 1, LAW).dsbp
    const e4 = monotherapyEffect('losartan', 4, LAW).dsbp
    const gain = e4 - e025
    const linearGain = e1 * 4 - e1 * 0.25 // what a linear-in-dose model would give
    expect(linearGain).toBeGreaterThan(35)
    expect(gain).toBeLessThan(0.3 * linearGain)
    expect(gain).toBeLessThan(12)
    expect(gain).toBeGreaterThan(1.5)
  })

  it('SAT-02: HCTZ gains 2.5–5.5 mmHg from 6.25 mg to 25 mg', () => {
    const lo = combinationRule(
      makeRegimen([{ drugId: 'hydrochlorothiazide', mg: 6.25 }]),
      LAW,
    ).dsbp
    const hi = combinationRule(makeRegimen([{ drugId: 'hydrochlorothiazide', mg: 25 }]), LAW).dsbp
    expect(hi - lo).toBeGreaterThan(2.5)
    expect(hi - lo).toBeLessThan(5.5)
  })

  it('SAT-03 🔴 each doubling buys STRICTLY less than the previous one, all five classes', () => {
    // The cleanest single test that the curve is concave. A linear model gives
    // equality; an exponential gives the reverse.
    for (const cls of CLASSES) {
      const d = REPRESENTATIVE[cls]
      const e05 = monotherapyEffect(d, 0.5, LAW).dsbp
      const e1 = monotherapyEffect(d, 1, LAW).dsbp
      const e2 = monotherapyEffect(d, 2, LAW).dsbp
      expect(e2 - e1, cls).toBeLessThan(e1 - e05)
    }
  })

  it('SAT-04: elasticity d(logE)/d(logD) at standard dose is < 0.5 for every class', () => {
    for (const cls of CLASSES) {
      const d = REPRESENTATIVE[cls]
      const eps = 0.001
      const lo = monotherapyEffect(d, 1 - eps, LAW).dsbp
      const hi = monotherapyEffect(d, 1 + eps, LAW).dsbp
      const elasticity = (Math.log(hi) - Math.log(lo)) / (Math.log(1 + eps) - Math.log(1 - eps))
      expect(elasticity, cls).toBeLessThan(0.5)
      expect(elasticity, cls).toBeGreaterThan(0)
    }
  })

  /**
   * ⚠️ SAT-06 states the expected order as CCB > β-blocker > ARB > ACEi >
   * thiazide. Law 2003's own published table puts ARB ahead of the β-blocker:
   * the 1×→2× increments are CCB 2.9, ARB 2.0, β-blocker 1.9, ACEi 1.5,
   * thiazide 1.5. The fitted curves reproduce that, so the engine's order is
   * CCB > ARB > BETA > ACEi > thiazide.
   *
   * The point of the test survives intact and is asserted here: the five slopes
   * must be DISTINCT (a single global slope gives five ties and fails), CCB must
   * be first and thiazide last. Worth noting that the 2025 Lancet meta-analysis
   * disagrees with Law on this ordering too — it puts thiazide second-steepest —
   * which research/08-EXTERNAL-RECONCILIATION.md records as an open, disclosed
   * discrepancy rather than resolving it.
   */
  it('SAT-06 🔴 per-class slopes are distinct, CCB steepest, thiazide flattest', () => {
    const ranked = CLASSES.map((cls) => {
      const d = REPRESENTATIVE[cls]
      return { cls, gain: monotherapyEffect(d, 2, LAW).dsbp - monotherapyEffect(d, 1, LAW).dsbp }
    }).sort((a, b) => b.gain - a.gain)
    expect(ranked.map((r) => r.cls)).toEqual(['CCB', 'ARB', 'BETA', 'ACEI', 'THIAZIDE'])
    // no ties — this is what a single global slope cannot do
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].gain - ranked[i].gain, `${ranked[i - 1].cls} vs ${ranked[i].cls}`)
        .toBeGreaterThan(0.05)
    }
  })

  it('the class effect is a true Emax curve, not a piecewise fit of the three points', () => {
    for (const cls of CLASSES) {
      // strictly increasing, strictly concave, and zero at zero dose
      expect(classEffect(cls, 'sbp', 0)).toBe(0)
      let prevSlope = Infinity
      for (let d = 0.25; d < 4; d += 0.25) {
        const slope = classEffect(cls, 'sbp', d + 0.25) - classEffect(cls, 'sbp', d)
        expect(slope, `${cls} @ ${d}`).toBeGreaterThan(0)
        expect(slope, `${cls} @ ${d}`).toBeLessThan(prevSlope)
        prevSlope = slope
      }
    }
  })
})

describe('PD-15…PD-17 — baseline-BP dependence', () => {
  it('PD-15: +10 mmHg pre-treatment SBP buys 0.6–1.4 mmHg more ΔSBP', () => {
    const a = monotherapyEffect('lisinopril', 1, { sbpBaseline: 154, dbpBaseline: 97 }).dsbp
    const b = monotherapyEffect('lisinopril', 1, { sbpBaseline: 164, dbpBaseline: 97 }).dsbp
    expect(b - a).toBeGreaterThan(0.6)
    expect(b - a).toBeLessThan(1.4)
  })

  it('PD-16: +10 mmHg pre-treatment DBP buys 0.7–1.6 mmHg more ΔDBP', () => {
    const a = monotherapyEffect('lisinopril', 1, { sbpBaseline: 154, dbpBaseline: 97 }).ddbp
    const b = monotherapyEffect('lisinopril', 1, { sbpBaseline: 154, dbpBaseline: 107 }).ddbp
    expect(b - a).toBeGreaterThan(0.7)
    expect(b - a).toBeLessThan(1.6)
  })

  it('FM-02 / PD-17 🔴 a NORMOTENSIVE subject gets < 5 mmHg and never goes below 100', () => {
    // The single most important guard against nonsense output.
    const r = monotherapyEffect('lisinopril', 1, { sbpBaseline: 118, dbpBaseline: 76 })
    expect(r.dsbp).toBeLessThan(5.0)
    expect(118 - r.dsbp).toBeGreaterThan(100)
  })
})

describe('PD-18 🔴 effect compartment — effect must PRECEDE peak concentration', () => {
  it('lisinopril effect onset ≈ 1 h while plasma Tmax ≈ 7 h', () => {
    // A DIRECT-EFFECT MODEL CANNOT PASS THIS. It is the whole reason the link
    // compartment exists.
    const p = buildPkParams('lisinopril', {
      weightKg: 70,
      egfr: 90,
      ageYears: 55,
      cyp2d6: 'normal',
      cyp2c9: 'normal',
      hepaticImpairment: false,
    })
    const dt = 1 / 60
    let ce = 0
    let peakConc = 0
    let tPeakConc = 0
    const trace: { t: number; c: number; eff: number }[] = []
    for (let t = 0; t <= 24; t += dt) {
      const c = batemanSingle(20, p, t - p.lag) * 1e6
      ce += dt * effectSiteDerivative(c, ce, p.ke0)
      const eff = hill(ce, EC50_NG_ML.ace)
      trace.push({ t, c, eff })
      if (c > peakConc) {
        peakConc = c
        tPeakConc = t
      }
    }
    const peakEff = Math.max(...trace.map((x) => x.eff))
    const tHalfEff = trace.find((x) => x.eff >= 0.5 * peakEff)!.t

    expect(tPeakConc).toBeGreaterThan(5) // plasma Tmax ~7 h
    expect(tHalfEff).toBeLessThan(2.5) // effect onset ~1 h
    expect(tHalfEff).toBeLessThan(tPeakConc) // STRICT ORDERING

    // …and the concentration-vs-effect plot must form a COUNTER-CLOCKWISE
    // hysteresis loop, not a line. Signed area of the (c, eff) polygon.
    let area = 0
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1]
      const b = trace[i]
      area += (b.c - a.c) * (b.eff + a.eff) * 0.5
    }
    expect(Math.abs(area)).toBeGreaterThan(0.05) // a straight line encloses zero
  })
})

describe('HCTZ is driven by DOSE, not plasma concentration', () => {
  it('doubling HCTZ clearance leaves NCC inhibition unchanged', () => {
    const base: SimRequest = {
      kind: 'run',
      runId: 'hctz',
      patient: referencePatient(),
      regimen: makeRegimen([{ drugId: 'hydrochlorothiazide', mg: 25 }]),
      modifiers: NO_MODIFIERS,
      options: { horizonHours: 48, outputEveryMin: 60, initial: 'steady_state' },
    }
    const normal = runSimulationSync(base)
    const fastClearance = runSimulationSync({
      ...base,
      modifiers: { ...NO_MODIFIERS, pkMultipliers: { hydrochlorothiazide: 0.25 } },
    })
    const nccA = normal.frames[normal.frames.length - 1].engagement.ncc_inhibition
    const nccB = fastClearance.frames[fastClearance.frames.length - 1].engagement.ncc_inhibition
    // plasma concentration changed fourfold; tubular effect did not move
    expect(nccA).toBeCloseTo(nccB, 6)
    expect(normal.frames[10].conc.hydrochlorothiazide).not.toBeCloseTo(
      fastClearance.frames[10].conc.hydrochlorothiazide,
      1,
    )
  })

  it('NCC inhibition is monotone in dose and saturating', () => {
    const run = (mg: number) => {
      const r = runSimulationSync({
        kind: 'run',
        runId: `h${mg}`,
        patient: referencePatient(),
        regimen: makeRegimen([{ drugId: 'hydrochlorothiazide', mg }]),
        modifiers: NO_MODIFIERS,
        options: { horizonHours: 24, outputEveryMin: 60, initial: 'steady_state' },
      })
      return r.frames[r.frames.length - 1].engagement.ncc_inhibition
    }
    const a = run(12.5)
    const b = run(25)
    const c = run(37.5)
    const d = run(50)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(d).toBeGreaterThan(c)
    // concave: EQUAL absolute dose increments buy progressively less
    expect(c - b).toBeLessThan(b - a)
    expect(d - c).toBeLessThan(c - b)
    expect(b).toBeCloseTo(0.45, 2) // the §8.6b anchor
  })
})

describe('dose windows and standard doses', () => {
  it('standard doses are the documented D = 1 anchors', () => {
    expect(STANDARD_DOSE_MG.lisinopril).toBe(20)
    expect(STANDARD_DOSE_MG.losartan).toBe(50)
    expect(STANDARD_DOSE_MG.amlodipine).toBe(5)
    expect(STANDARD_DOSE_MG.hydrochlorothiazide).toBe(25)
    expect(STANDARD_DOSE_MG.metoprolol).toBe(100)
  })
  it('drug→class map is complete', () => {
    for (const id of Object.keys(STANDARD_DOSE_MG) as DrugId[]) {
      expect(DRUG_CLASS[id]).toBeTruthy()
    }
  })
})
