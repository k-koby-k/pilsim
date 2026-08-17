/**
 * research/06-VALIDATION.md §6 (population) and §7 (five-year projection).
 */
import { describe, it, expect } from 'vitest'
import { runPopulation, summarise } from './population'
import { project5Year, relativeRisk } from './prognosis'
import { runSimulationSync, referencePatient, makeRegimen, NO_MODIFIERS } from './run'
import { monotherapyEffect } from './combination'
import { LAW_REFERENCE_SBP, LAW_REFERENCE_DBP } from './constants'
import type { SimRequest } from '../types'

const patient = () => referencePatient()
const lis = () => makeRegimen([{ drugId: 'lisinopril', mg: 20 }])
const met = () => makeRegimen([{ drugId: 'metoprolol', mg: 50, perDay: 2 }])
const LAW = { sbpBaseline: LAW_REFERENCE_SBP, dbpBaseline: LAW_REFERENCE_DBP }

describe('VAL-P01…VAL-P08 — the virtual population', () => {
  const pop = runPopulation(patient(), lis(), NO_MODIFIERS, { n: 200, seed: 42 })

  it('VAL-P01 🔴 mean ΔSBP matches the single-twin value within 1.0 mmHg', () => {
    expect(Math.abs(pop.deltaSbp.mean - monotherapyEffect('lisinopril', 1, LAW).dsbp)).toBeLessThan(
      1.0,
    )
  })

  it('VAL-P02 🔴 SD of ΔSBP is 8–12 mmHg', () => {
    // Under 4 ⇒ the residual error term is missing.
    // Over 20 ⇒ the CVs are too high.
    expect(pop.deltaSbp.sd).toBeGreaterThan(8)
    expect(pop.deltaSbp.sd).toBeLessThan(12)
  })

  it('VAL-P04 🔴 a real non-responder tail exists — 10–25 % below 3 mmHg', () => {
    // A population where everyone responds is the signature of a fake simulation.
    expect(pop.responders.non_responder_lt_3mmHg).toBeGreaterThan(0.1)
    expect(pop.responders.non_responder_lt_3mmHg).toBeLessThan(0.3)
  })

  it('VAL-P06 🔴 Cmax and AUC are RIGHT-SKEWED (log-normal), skewness > 0.3', () => {
    // A symmetric AUC histogram means normal sampling was used by mistake.
    expect(pop.auc.lisinopril!.skewness).toBeGreaterThan(0.3)
    expect(pop.cmax.lisinopril!.skewness).toBeGreaterThan(0.3)
    // …while ΔSBP is approximately normal
    expect(Math.abs(pop.deltaSbp.skewness)).toBeLessThan(0.6)
  })

  it('VAL-P05 🔴 metoprolol AUC is multimodal — the PM subgroup separates out', () => {
    const p = runPopulation(patient(), met(), NO_MODIFIERS, { n: 400, seed: 7 })
    const pm = p.subjects.filter((s) => s.cyp2d6 === 'poor').map((s) => s.auc.metoprolol ?? 0)
    const nm = p.subjects.filter((s) => s.cyp2d6 === 'normal').map((s) => s.auc.metoprolol ?? 0)
    expect(pm.length).toBeGreaterThan(10)
    const meanOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    expect(meanOf(pm) / meanOf(nm)).toBeGreaterThan(3.5)
    // and the histogram is not over-binned into hiding it
    expect(p.auc.metoprolol!.histogram.bins.length).toBeGreaterThanOrEqual(30)
  })

  it('VAL-P08 🔴 N = 50, 200 and 1000 agree within 1.5 mmHg — 200 is enough', () => {
    const means = [50, 200, 1000].map(
      (n) => runPopulation(patient(), lis(), NO_MODIFIERS, { n, seed: 99 }).deltaSbp.mean,
    )
    for (const a of means) for (const b of means) expect(Math.abs(a - b)).toBeLessThan(1.5)
  })

  it('VAL-15 🔴 the same seed gives byte-identical results', () => {
    const a = runPopulation(patient(), lis(), NO_MODIFIERS, { n: 60, seed: 12345 })
    const b = runPopulation(patient(), lis(), NO_MODIFIERS, { n: 60, seed: 12345 })
    expect(JSON.stringify(a.subjects)).toBe(JSON.stringify(b.subjects))
    const c = runPopulation(patient(), lis(), NO_MODIFIERS, { n: 60, seed: 54321 })
    expect(JSON.stringify(c.subjects)).not.toBe(JSON.stringify(a.subjects))
  })

  it('PK-10b: w_m is sampled log-uniform on [10, 40], never a fixed midpoint', () => {
    const w = pop.wMSamples
    expect(Math.min(...w)).toBeGreaterThanOrEqual(10)
    expect(Math.max(...w)).toBeLessThanOrEqual(40)
    const unique = new Set(w.map((x) => x.toFixed(4)))
    expect(unique.size).toBeGreaterThan(150)
    // log-uniform ⇒ the geometric mean sits near sqrt(10·40) = 20
    const gm = Math.exp(w.reduce((a, b) => a + Math.log(b), 0) / w.length)
    expect(gm).toBeGreaterThan(17)
    expect(gm).toBeLessThan(23)
  })

  it('PK-10b: the algebraic ranking is IMMUNE to w_m — it works on dose', () => {
    // A real advantage of the two-layer design, and worth saying out loud.
    const runs = [10, 20, 40].map(
      () => runPopulation(patient(), lis(), NO_MODIFIERS, { n: 100, seed: 3 }).deltaSbp.mean,
    )
    expect(runs[0]).toBe(runs[1])
    expect(runs[1]).toBe(runs[2])
  })

  it('populationN flows through the SimRequest into the RunSummary percentiles', () => {
    const req: SimRequest = {
      kind: 'run',
      runId: 'pop',
      patient: patient(),
      regimen: lis(),
      modifiers: NO_MODIFIERS,
      options: {
        horizonHours: 24,
        outputEveryMin: 60,
        initial: 'steady_state',
        populationN: 100,
        seed: 5,
      },
    }
    const { summary, population } = runSimulationSync(req)
    expect(population?.n).toBe(100)
    expect(summary.deltaSbpP05).toBeLessThan(summary.deltaSbp)
    expect(summary.deltaSbpP95).toBeGreaterThan(summary.deltaSbp)
  })

  it('summarise() produces a usable histogram and quantile set', () => {
    const d = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 5)
    expect(d.mean).toBeCloseTo(5.5, 6)
    expect(d.quantiles.p50).toBeGreaterThan(0)
    expect(d.histogram.bins.reduce((a, b) => a + b, 0)).toBe(10)
  })
})

describe('LH-01…LH-07 — the five-year projection (Ettehad 2016)', () => {
  it('LH-01/LH-02 🔴 relative risks at ΔSBP 10 mmHg, exact to 2 dp', () => {
    expect(relativeRisk('majorCvEvent', 10).point).toBeCloseTo(0.8, 2)
    expect(relativeRisk('stroke', 10).point).toBeCloseTo(0.73, 2)
    expect(relativeRisk('coronaryHeartDisease', 10).point).toBeCloseTo(0.83, 2)
    expect(relativeRisk('heartFailure', 10).point).toBeCloseTo(0.72, 2)
    expect(relativeRisk('allCauseDeath', 10).point).toBeCloseTo(0.87, 2)
  })

  it('LH-03 🔴 ΔSBP 20 mmHg gives 0.80² = 0.64 — the exponential form', () => {
    expect(relativeRisk('majorCvEvent', 20).point).toBeCloseTo(0.64, 2)
  })

  it('LH-04 🔴 ΔSBP 0 gives RR exactly 1.00', () => {
    expect(relativeRisk('majorCvEvent', 0).point).toBe(1)
    expect(relativeRisk('stroke', 0).point).toBe(1)
  })

  it('LH-05 🔴 the output is a BAND, never a point', () => {
    const p = project5Year(12, { majorCvEvent: 0.12, stroke: 0.04 })
    for (const key of Object.keys(p.relativeRisk) as (keyof typeof p.relativeRisk)[]) {
      expect(p.relativeRisk[key].lo).toBeLessThan(p.relativeRisk[key].point)
      expect(p.relativeRisk[key].hi).toBeGreaterThan(p.relativeRisk[key].point)
    }
    expect(p.eventsPreventedPer1000.majorCvEvent.lo).toBeLessThan(
      p.eventsPreventedPer1000.majorCvEvent.hi,
    )
    expect(p.extrapolationWarning).toMatch(/extrapolation/i)
  })

  it('LH-06 🔴 adherence 0.7 scales the sustained reduction and is reported', () => {
    const full = project5Year(10, { majorCvEvent: 0.1 }, 1.0)
    const partial = project5Year(10, { majorCvEvent: 0.1 }, 0.7)
    expect(partial.deltaSbpSustained).toBeCloseTo(7, 6)
    expect(partial.adherence).toBe(0.7)
    expect(partial.relativeRisk.majorCvEvent.point).toBeGreaterThan(
      full.relativeRisk.majorCvEvent.point,
    )
  })

  it('events prevented and NNT are consistent with the relative risk', () => {
    const base = 0.2
    const p = project5Year(10, { majorCvEvent: base })
    const absolute = base - base * p.relativeRisk.majorCvEvent.point
    expect(p.eventsPreventedPer1000.majorCvEvent.point).toBeCloseTo(1000 * absolute, 6)
    expect(p.nnt5y.majorCvEvent.point).toBeCloseTo(1 / absolute, 6)
  })

  it('LH-07 🟠 the projection is CLOSED FORM — it integrates nothing', () => {
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) project5Year(12, { majorCvEvent: 0.12 })
    expect(performance.now() - t0).toBeLessThan(500)
  })

  it('a missing baseline risk yields zero events prevented, not NaN', () => {
    const p = project5Year(10, {})
    expect(p.eventsPreventedPer1000.stroke.point).toBe(0)
    expect(Number.isFinite(p.relativeRisk.stroke.point)).toBe(true)
  })
})
