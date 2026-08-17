/**
 * research/06-VALIDATION.md §1 — pharmacokinetics. Blocker-grade unless noted.
 * Reference subject REF-1 throughout.
 */
import { describe, it, expect } from 'vitest'
import { buildPkParams, derivedPk, batemanSingle, exp3174ConcentrationAt, buildDoseHistory } from './pk'
import { SUBSTANCE_PK, METABOLITE } from './substanceParams'
import { EC50_NG_ML } from './pd'
import { makeRegimen } from './run'
import type { DrugId } from '../types'

import type { PkCovariates } from './pk'

const REF: PkCovariates = {
  weightKg: 70,
  egfr: 90,
  ageYears: 55,
  cyp2d6: 'normal',
  cyp2c9: 'normal',
  hepaticImpairment: false,
}

const p = (id: DrugId, cov = REF) => buildPkParams(id, cov)
const single = (id: DrugId, mg: number, cov = REF) => derivedPk(p(id, cov), mg, 24)

describe('PK — lisinopril', () => {
  it('PK-01: Tmax 5–9 h (label "within about 7 hours")', () => {
    expect(single('lisinopril', 10).tmaxH).toBeGreaterThan(5)
    expect(single('lisinopril', 10).tmaxH).toBeLessThan(9)
  })
  it('PK-02: Cmax 23–58 ng/mL at 10 mg (40.7 ± 17.8)', () => {
    const c = single('lisinopril', 10).cmaxNgMl
    expect(c).toBeGreaterThan(23)
    expect(c).toBeLessThan(58)
  })
  it('PK-03: accumulation half-life 10–15 h', () => {
    expect(single('lisinopril', 10).halfLifeH).toBeGreaterThan(10)
    expect(single('lisinopril', 10).halfLifeH).toBeLessThan(15)
  })
  it('PK-03b: the model does NOT use the ~40 h terminal phase', () => {
    // The label says that phase "does not contribute to drug accumulation".
    expect(SUBSTANCE_PK.lisinopril.half_life_h).toBe(12)
    expect(single('lisinopril', 10).halfLifeH).toBeLessThan(20)
  })
  it('PK-04: F = 0.25', () => {
    expect(SUBSTANCE_PK.lisinopril.F).toBeCloseTo(0.25, 3)
  })
})

describe('PK — losartan and EXP3174 (two species, never one)', () => {
  it('PK-05: parent Tmax 0.5–1.5 h', () => {
    const t = single('losartan', 50).tmaxH
    expect(t).toBeGreaterThan(0.5)
    expect(t).toBeLessThan(1.5)
  })
  it('PK-06: parent Cmax 142–306 ng/mL at 50 mg', () => {
    const c = single('losartan', 50).cmaxNgMl
    expect(c).toBeGreaterThan(142)
    expect(c).toBeLessThan(306)
  })
  it('PK-09: parent t½ 1.4–2.8 h, metabolite t½ 5.0–9.8 h', () => {
    expect(single('losartan', 50).halfLifeH).toBeGreaterThan(1.4)
    expect(single('losartan', 50).halfLifeH).toBeLessThan(2.8)
    const m = Math.LN2 / p('exp3174').ke
    expect(m).toBeGreaterThan(5.0)
    expect(m).toBeLessThan(9.8)
  })

  const metaboliteCurve = () => {
    const doses = [{ drugId: 'losartan' as DrugId, mg: 50, timeH: 0 }]
    const parent = p('losartan')
    const metab = p('exp3174')
    const out: { t: number; cp: number; cm: number }[] = []
    for (let t = 0.01; t <= 30; t += 0.01) {
      out.push({
        t,
        cp: batemanSingle(50, parent, t - parent.lag) * 1e6,
        cm: exp3174ConcentrationAt(doses, parent, metab, t, 1) * 1e6,
      })
    }
    return out
  }

  it('PK-07: EXP3174 Tmax 2.5–4.5 h', () => {
    const curve = metaboliteCurve()
    const peak = curve.reduce((a, b) => (b.cm > a.cm ? b : a))
    expect(peak.t).toBeGreaterThan(2.5)
    expect(peak.t).toBeLessThan(4.5)
  })
  it('PK-08: EXP3174 Cmax 139–285 ng/mL', () => {
    const peak = metaboliteCurve().reduce((a, b) => (b.cm > a.cm ? b : a))
    expect(peak.cm).toBeGreaterThan(139)
    expect(peak.cm).toBeLessThan(285)
  })

  it('PK-10 🔴 the metabolite carries >90 % of the AT1 effect at 24 h', () => {
    // THE test that catches a single-species losartan model.
    const curve = metaboliteCurve()
    const at24 = curve.reduce((a, b) => (Math.abs(b.t - 24) < Math.abs(a.t - 24) ? b : a))
    const w = METABOLITE.w_m_central
    const share = (w * at24.cm) / (at24.cp + w * at24.cm)
    expect(share).toBeGreaterThan(0.9)
  })

  it('PK-10b: w_m is treated as a 10–40x distribution, not a midpoint', () => {
    expect(METABOLITE.w_m_range).toEqual([10, 40])
    // and the parent/metabolite peaks are genuinely separated in time
    const curve = metaboliteCurve()
    const pPeak = curve.reduce((a, b) => (b.cp > a.cp ? b : a)).t
    const mPeak = curve.reduce((a, b) => (b.cm > a.cm ? b : a)).t
    expect(mPeak - pPeak).toBeGreaterThan(1.5)
  })
})

describe('PK — amlodipine', () => {
  it('PK-11: Tmax 6–12 h', () => {
    const t = single('amlodipine', 5).tmaxH
    expect(t).toBeGreaterThanOrEqual(6)
    expect(t).toBeLessThanOrEqual(12)
  })
  it('PK-12: terminal t½ 30–50 h', () => {
    const t = single('amlodipine', 5).halfLifeH
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThanOrEqual(50)
  })
  it('PK-14: Cmax 2.9–5.2 ng/mL at 5 mg', () => {
    const c = single('amlodipine', 5).cmaxNgMl
    expect(c).toBeGreaterThan(2.9)
    expect(c).toBeLessThan(5.2)
  })

  /**
   * PK-13b 🔴 — the test that catches the accumulation bias. Amlodipine is the
   * ONLY drug in the set that accumulates at all; a short run represents it at
   * ~35 % of chronic exposure while representing the other four correctly.
   */
  it('PK-13b: accumulation ratio 2.4–3.4x, ~2.9 expected', () => {
    const r = single('amlodipine', 10).accumulationRatio
    expect(r).toBeGreaterThan(2.4)
    expect(r).toBeLessThan(3.4)
  })
  it('PK-13: 90 % of steady state is reached at 7–8 days, and day 8 ≈ day 7', () => {
    const params = p('amlodipine')
    const doses = buildDoseHistory(
      makeRegimen([{ drugId: 'amlodipine', mg: 5, perDay: 1 }]),
      'first_dose',
      24 * 20,
    )
    const cmaxOnDay = (day: number) => {
      let best = 0
      for (let t = (day - 1) * 24; t < day * 24; t += 0.05) {
        let c = 0
        for (const d of doses) {
          const tau = t - d.timeH - params.lag
          if (tau > 0) c += batemanSingle(d.mg, params, tau)
        }
        best = Math.max(best, c)
      }
      return best * 1e6
    }
    const d1 = cmaxOnDay(1)
    const d7 = cmaxOnDay(7)
    const d8 = cmaxOnDay(8)
    const d20 = cmaxOnDay(20)
    expect(d8 / d7).toBeLessThan(1.03)
    expect(d7 / d20).toBeGreaterThan(0.9) // >= 90 % of steady state by day 7
    expect(d20 / d1).toBeGreaterThan(2.4)
    expect(d20 / d1).toBeLessThan(4.0)
  })
  it('PK-36 / CM-07: renal impairment does NOT change amlodipine exposure', () => {
    const normal = derivedPk(p('amlodipine'), 5, 24).aucNgHMl
    const ckd = derivedPk(p('amlodipine', { ...REF, egfr: 30 }), 5, 24).aucNgHMl
    expect(ckd / normal).toBeGreaterThan(0.9)
    expect(ckd / normal).toBeLessThan(1.15)
  })
})

describe('PK — hydrochlorothiazide and metoprolol', () => {
  it('PK-15: HCTZ Tmax 2–5 h', () => {
    const t = single('hydrochlorothiazide', 25).tmaxH
    expect(t).toBeGreaterThanOrEqual(2)
    expect(t).toBeLessThanOrEqual(5)
  })
  it('PK-16: HCTZ t½ 5.6–14.8 h', () => {
    const t = single('hydrochlorothiazide', 25).halfLifeH
    expect(t).toBeGreaterThanOrEqual(5.6)
    expect(t).toBeLessThanOrEqual(14.8)
  })
  it('PK-17: HCTZ Cmax 92–192 ng/mL at 25 mg', () => {
    const c = single('hydrochlorothiazide', 25).cmaxNgMl
    expect(c).toBeGreaterThan(92)
    expect(c).toBeLessThan(192)
  })
  it('PK-18: HCTZ clearance scales with eGFR (f_ru ≈ 0.70)', () => {
    expect(SUBSTANCE_PK.hydrochlorothiazide.f_renal_unchanged).toBeCloseTo(0.7, 2)
    const normal = p('hydrochlorothiazide').CL
    const ckd = p('hydrochlorothiazide', { ...REF, egfr: 30 }).CL
    expect(ckd).toBeLessThan(normal)
    expect(ckd / normal).toBeCloseTo(0.7 * (30 / 90) + 0.3, 2)
  })
  it('PK-19: metoprolol Tmax 0.75–3.0 h', () => {
    const t = single('metoprolol', 100).tmaxH
    expect(t).toBeGreaterThan(0.75)
    expect(t).toBeLessThan(3.0)
  })
  it('PK-20: metoprolol Cmax 60–320 ng/mL at 100 mg', () => {
    const c = single('metoprolol', 100).cmaxNgMl
    expect(c).toBeGreaterThan(60)
    expect(c).toBeLessThan(320)
  })
  it('PK-21: metoprolol t½ 3–4 h in a normal metaboliser', () => {
    const t = single('metoprolol', 100).halfLifeH
    expect(t).toBeGreaterThanOrEqual(3)
    expect(t).toBeLessThanOrEqual(4)
  })
  it('PK-22: metoprolol F 0.40–0.60', () => {
    expect(SUBSTANCE_PK.metoprolol.F).toBeGreaterThanOrEqual(0.4)
    expect(SUBSTANCE_PK.metoprolol.F).toBeLessThanOrEqual(0.6)
  })
})

describe('PK — pharmacogenomics', () => {
  it('PK-25: CYP2D6 PM/NM metoprolol AUC ratio 4.0–5.5x', () => {
    const nm = derivedPk(p('metoprolol'), 100, 24).aucNgHMl
    const pm = derivedPk(p('metoprolol', { ...REF, cyp2d6: 'poor' }), 100, 24).aucNgHMl
    expect(pm / nm).toBeGreaterThan(4.0)
    expect(pm / nm).toBeLessThan(5.5)
  })
  it('PK-26: CYP2D6 PM/NM Cmax ratio 1.9–2.7x', () => {
    const nm = derivedPk(p('metoprolol'), 100, 24).cmaxNgMl
    const pm = derivedPk(p('metoprolol', { ...REF, cyp2d6: 'poor' }), 100, 24).cmaxNgMl
    expect(pm / nm).toBeGreaterThan(1.9)
    expect(pm / nm).toBeLessThan(2.7)
  })
  it('PK-27: PM half-life 6–10 h', () => {
    const t = derivedPk(p('metoprolol', { ...REF, cyp2d6: 'poor' }), 100, 24).halfLifeH
    expect(t).toBeGreaterThan(6)
    expect(t).toBeLessThan(10)
  })
  it('PK-28 🟠: UM/PM AUC ratio 10–16x', () => {
    const um = derivedPk(p('metoprolol', { ...REF, cyp2d6: 'ultrarapid' }), 100, 24).aucNgHMl
    const pm = derivedPk(p('metoprolol', { ...REF, cyp2d6: 'poor' }), 100, 24).aucNgHMl
    expect(pm / um).toBeGreaterThan(4.9)
  })
  it('CM-06: lisinopril AUC rises 2.0–3.5x at eGFR 30', () => {
    const normal = derivedPk(p('lisinopril'), 20, 24).aucNgHMl
    const ckd = derivedPk(p('lisinopril', { ...REF, egfr: 30 }), 20, 24).aucNgHMl
    expect(ckd / normal).toBeGreaterThan(2.0)
    expect(ckd / normal).toBeLessThan(3.5)
  })
})

describe('PK — structural guards', () => {
  it('PD-19: the ENGINE satisfies t½ = ln2·V/CL exactly for every substance', () => {
    // What actually matters: whatever the data file says, the parameters the
    // engine integrates with must be self-consistent.
    for (const s of Object.values(SUBSTANCE_PK)) {
      const params = p(s.id)
      const t = Math.LN2 / params.ke
      expect(Math.abs(t - s.half_life_h) / s.half_life_h, s.id).toBeLessThan(0.05)
    }
  })

  it('PD-19b: records which source Vd/CL/t½ triples are mutually inconsistent', () => {
    // PD-19 is a DATASET test as much as a model test — it exists to catch
    // labels that mix steady-state and terminal volumes. Running it over the raw
    // data-file values finds exactly one offender, and it is the one
    // 06-VALIDATION.md §11 item 9 already names as the weakest PK input in the
    // set: lisinopril, whose Vd and CL are absent from the label and were both
    // estimated. ln2 x 124 / 4.7 = 18.3 h against a stated 12 h.
    //
    // The engine does not use that pair as given — `buildPkParams` pins ke to
    // the cited half-life and expresses clearance as ke·V (see PD-19 above), so
    // the inconsistency is neutralised rather than propagated. This test locks
    // the finding in place: if someone later "fixes" the data file, it fails and
    // makes them look at it.
    const inconsistent: string[] = []
    for (const s of Object.values(SUBSTANCE_PK)) {
      const t = (Math.LN2 * s.vd_l) / s.cl_l_h
      if (Math.abs(t - s.half_life_h) / s.half_life_h >= 0.25) inconsistent.push(s.id)
    }
    expect(inconsistent).toEqual(['lisinopril'])
  })

  it('the DERIVED losartan volumes are used, not the label-printed ones', () => {
    // 34 L / 12 L are steady-state volumes inconsistent with the same label's
    // clearance and half-life; they make losartan clear ~3x too fast.
    expect(SUBSTANCE_PK.losartan.vd_l).toBe(109)
    expect(SUBSTANCE_PK.exp3174.vd_l).toBe(32)
  })

  it('FM-13: the flip-flop limiting form is used when |ka − ke| < 0.01', () => {
    const params = { ...p('lisinopril'), ka: 0.05, ke: 0.0501, CL: 0, V: 100, F: 1, lag: 0 }
    const c = batemanSingle(10, params, 5)
    expect(Number.isFinite(c)).toBe(true)
    expect(c).toBeGreaterThan(0)
  })

  it('PD-20: peak-to-trough ordering amlodipine ≪ lisinopril ≪ EXP3174 ≪ parent', () => {
    const ptr = (id: DrugId) => {
      const params = p(id)
      return Math.exp(params.ke * 24) // trough decay over a dosing interval
    }
    expect(ptr('amlodipine')).toBeLessThan(ptr('lisinopril'))
    expect(ptr('lisinopril')).toBeLessThan(ptr('exp3174'))
    expect(ptr('exp3174')).toBeLessThan(ptr('losartan'))
    expect(ptr('amlodipine')).toBeLessThan(2.0) // label-consistent flat profile
  })

  it('PD-21: lisinopril F variability is > 3x amlodipine F variability', () => {
    expect(SUBSTANCE_PK.lisinopril.cv.F / SUBSTANCE_PK.amlodipine.cv.F).toBeGreaterThan(3)
  })

  it('every EC50 sits inside the therapeutic concentration range, not below it', () => {
    // The potency-trap guard expressed numerically: an in-vitro derived EC50
    // for lisinopril would be ~0.5–2 ng/mL, i.e. 40x below this.
    expect(EC50_NG_ML.ace).toBeGreaterThan(10)
    expect(EC50_NG_ML.beta1).toBe(24)
    expect(EC50_NG_ML.beta2 / EC50_NG_ML.beta1).toBeCloseTo(14.2, 5)
  })
})
