/**
 * research/06-VALIDATION.md §4 and §5a — non-BP physiology, target engagement
 * and counter-regulation. These validate the fields the organ animation binds
 * to; without them the animation is decoration.
 */
import { describe, it, expect } from 'vitest'
import { runSimulationSync, referencePatient, makeRegimen, NO_MODIFIERS } from './run'
import {
  deriveBaseline,
  baroreflexSensitivity,
  solveSteadyState,
  NO_DRUG,
  calibratePathwayGains,
} from './homeostasis'
import { amlodipineEdemaIncidence } from './frame'
import { FRAME_FIELD_TIERS, PROXY_FIELDS } from './tiers'
import { METOPROLOL_BETA2_CROSSOVER_NG_ML, REF1 } from './constants'
import type { DrugId, EffectFrame, PatientState, SimRequest } from '../types'

interface Spec {
  drugId: DrugId
  mg?: number
  doseMultiple?: number
  perDay?: number
}

function run(
  drugs: Spec[],
  opts: { patient?: PatientState; hours?: number } = {},
): { frames: EffectFrame[]; last: EffectFrame; diagnostics: ReturnType<typeof runSimulationSync>['diagnostics'] } {
  const req: SimRequest = {
    kind: 'run',
    runId: 'v',
    patient: opts.patient ?? referencePatient(),
    regimen: makeRegimen(drugs),
    modifiers: NO_MODIFIERS,
    options: { horizonHours: opts.hours ?? 48, outputEveryMin: 30, initial: 'steady_state' },
  }
  const r = runSimulationSync(req)
  return { frames: r.frames, last: r.frames[r.frames.length - 1], diagnostics: r.diagnostics }
}

const baselineRun = () => run([])

describe('VAL-01…VAL-03 — heart rate on metoprolol', () => {
  it('VAL-01 🔴 100 mg/day in a normal metaboliser: ΔHR −4 to −11 bpm', () => {
    const base = baselineRun()
    const met = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }])
    const d = met.diagnostics.meanLast24h.hr - base.diagnostics.meanLast24h.hr
    expect(d).toBeLessThan(-4)
    expect(d).toBeGreaterThan(-11)
  })

  it('VAL-02 🔴 a CYP2D6 poor metaboliser drops a further 3–9 bpm', () => {
    const nm = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }])
    const pm = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }], {
      patient: referencePatient({ cyp2d6: 'poor' }),
    })
    const extra = nm.diagnostics.meanLast24h.hr - pm.diagnostics.meanLast24h.hr
    expect(extra).toBeGreaterThan(2.0)
  })

  it('VAL-03: the PM also gains additional blood-pressure lowering', () => {
    const nm = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }])
    const pm = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }], {
      patient: referencePatient({ cyp2d6: 'poor' }),
    })
    expect(nm.diagnostics.meanLast24h.sbp - pm.diagnostics.meanLast24h.sbp).toBeGreaterThan(1.0)
  })
})

describe('VAL-05…VAL-08b — electrolytes and urate', () => {
  it('VAL-05 🔴 HCTZ 25 mg: Δ serum K −0.20 to −0.42 mmol/L', () => {
    const d = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last.chem.serum_k - REF1.serum_k
    expect(d).toBeLessThan(-0.2)
    expect(d).toBeGreaterThan(-0.42)
  })

  it('VAL-06 🔴 HCTZ 12.5 and 50 mg: monotonic, −0.16 and −0.48 ± 0.12', () => {
    const k = (mg: number) => run([{ drugId: 'hydrochlorothiazide', mg }]).last.chem.serum_k - REF1.serum_k
    const lo = k(12.5)
    const mid = k(25)
    const hi = k(50)
    expect(lo).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(hi)
    expect(Math.abs(lo - -0.16)).toBeLessThanOrEqual(0.12)
    expect(Math.abs(hi - -0.48)).toBeLessThanOrEqual(0.12)
  })

  it('VAL-07 🔴 HCTZ 25 mg: Δ serum urate +0.30 to +0.90 mg/dL', () => {
    const d = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last.chem.serum_urate - REF1.serum_urate
    expect(d).toBeGreaterThan(0.3)
    expect(d).toBeLessThan(0.9)
  })

  it('VAL-08 🔴 losartan 50 mg: Δ serum urate −0.10 to −0.60 mg/dL (placebo-controlled figure)', () => {
    const d = run([{ drugId: 'losartan', mg: 50 }]).last.chem.serum_urate - REF1.serum_urate
    expect(d).toBeLessThan(-0.1)
    expect(d).toBeGreaterThan(-0.6)
  })

  it('VAL-08b 🔴 losartan + HCTZ raises urate LESS than HCTZ alone', () => {
    // Opposite signs partially cancelling — the mechanism behind the fixed-dose
    // combination product, and it falls out of the sum for free.
    const combo = run([{ drugId: 'losartan', mg: 50 }, { drugId: 'hydrochlorothiazide', mg: 25 }])
      .last.chem.serum_urate
    const alone = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last.chem.serum_urate
    expect(combo).toBeLessThan(alone)
  })

  it('VAL-11 🟠 lisinopril 20 mg: Δ serum K +0.05 to +0.25 mmol/L', () => {
    const d = run([{ drugId: 'lisinopril', mg: 20 }]).last.chem.serum_k - REF1.serum_k
    expect(d).toBeGreaterThan(0.05)
    expect(d).toBeLessThan(0.25)
  })

  it('lisinopril + HCTZ: the K terms partially cancel', () => {
    const both = run([{ drugId: 'lisinopril', mg: 20 }, { drugId: 'hydrochlorothiazide', mg: 25 }])
      .last.chem.serum_k
    const hctz = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last.chem.serum_k
    const lis = run([{ drugId: 'lisinopril', mg: 20 }]).last.chem.serum_k
    expect(both).toBeGreaterThan(hctz)
    expect(both).toBeLessThan(lis)
  })

  it('serum sodium on HCTZ is NOT given a fabricated value', () => {
    // Genuinely NOT_FOUND as a pooled number (06-VALIDATION §11 item 8).
    const d = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last.chem.serum_na - REF1.serum_na
    expect(d).toBe(0)
  })
})

describe('VAL-09 🔴 amlodipine does NOT cause reflex tachycardia on chronic oral dosing', () => {
  it('ΔHR stays within −4 to +3 bpm', () => {
    // Fails if the model animates the INTRAVENOUS pharmacology while claiming to
    // model a tablet. ASCOT measured −1.3 (SD 12.1) bpm.
    const base = baselineRun()
    for (const mg of [5, 10]) {
      const d = run([{ drugId: 'amlodipine', mg }]).diagnostics.meanLast24h.hr -
        base.diagnostics.meanLast24h.hr
      expect(d, `${mg} mg`).toBeGreaterThan(-4)
      expect(d, `${mg} mg`).toBeLessThan(3)
    }
  })
})

describe('VAL-10 🔴 amlodipine oedema is steeply supra-linear in dose', () => {
  it('reproduces the NORVASC label table within 2 percentage points', () => {
    const male = (mg: number) => amlodipineEdemaIncidence(mg, 'male')
    const female = (mg: number) => amlodipineEdemaIncidence(mg, 'female')
    const avg = (mg: number) => (male(mg) + female(mg)) / 2
    expect(Math.abs(avg(2.5) - 0.018)).toBeLessThan(0.02)
    expect(Math.abs(avg(5) - 0.03)).toBeLessThan(0.02)
    expect(Math.abs(avg(10) - 0.108)).toBeLessThan(0.02)
  })

  it('doubling 5 → 10 mg costs far more than doubling 2.5 → 5 mg', () => {
    const avg = (mg: number) =>
      (amlodipineEdemaIncidence(mg, 'male') + amlodipineEdemaIncidence(mg, 'female')) / 2
    expect(avg(10) - avg(5)).toBeGreaterThan(3 * (avg(5) - avg(2.5)))
  })

  it('sex is a REAL modifier, not cosmetic — 14.6 % women vs 5.6 % men', () => {
    expect(amlodipineEdemaIncidence(5, 'female')).toBeGreaterThan(
      2 * amlodipineEdemaIncidence(5, 'male'),
    )
  })
})

describe('VAL-14 🔴 engine self-consistency: algebraic vs ODE within 2.0 mmHg', () => {
  const regimens: Spec[][] = [
    [{ drugId: 'lisinopril' }],
    [{ drugId: 'losartan' }],
    [{ drugId: 'amlodipine' }],
    [{ drugId: 'hydrochlorothiazide' }],
    [{ drugId: 'metoprolol', mg: 50, perDay: 2 }],
    [{ drugId: 'lisinopril' }, { drugId: 'hydrochlorothiazide' }],
    [{ drugId: 'amlodipine' }, { drugId: 'metoprolol', mg: 50, perDay: 2 }],
    [{ drugId: 'lisinopril' }, { drugId: 'losartan' }],
  ]
  for (const spec of regimens) {
    it(spec.map((s) => s.drugId).join(' + '), () => {
      const d = run(spec).diagnostics
      expect(Math.abs(d.algebraicDeltaSbp - d.odeDeltaSbp)).toBeLessThan(2.0)
    })
  }
})

describe('EN-01…EN-03 — metoprolol beta1/beta2 selectivity', () => {
  it('EN-01 🔴 100 mg b.i.d.: beta1 0.54–0.92, beta2 0.06–0.38', () => {
    const f = run([{ drugId: 'metoprolol', mg: 100, perDay: 2 }]).last
    expect(f.engagement.beta1_occupancy).toBeGreaterThan(0.54)
    expect(f.engagement.beta1_occupancy).toBeLessThan(0.92)
    expect(f.engagement.beta2_occupancy).toBeGreaterThan(0.06)
    expect(f.engagement.beta2_occupancy).toBeLessThan(0.38)
  })

  it('EN-02 🔴 selectivity ratio ≈ 4.6 (2.5–9.0)', () => {
    const f = run([{ drugId: 'metoprolol', mg: 100, perDay: 2 }]).last
    const ratio = f.engagement.beta1_occupancy / f.engagement.beta2_occupancy
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(9.0)
  })

  it('EN-03 🔴 the ratio falls MONOTONICALLY toward 1.0 across 25 → 400 mg', () => {
    // If it were constant, the two occupancies share one EC50 and the whole
    // selectivity-loss feature is fake.
    const ratios = [25, 50, 100, 200, 400].map((mg) => {
      const f = run([{ drugId: 'metoprolol', mg, perDay: 2 }]).last
      return f.engagement.beta1_occupancy / f.engagement.beta2_occupancy
    })
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i], `step ${i}`).toBeLessThan(ratios[i - 1])
    }
    expect(ratios[ratios.length - 1]).toBeLessThan(ratios[0])
    expect(ratios[ratios.length - 1]).toBeGreaterThan(1.0)
  })

  it('CM-04 🔴 asthma: bronchial risk at 200 mg is > 2x that at 25 mg', () => {
    const asthma = referencePatient({ comorbidities: ['asthma'] })
    const low = run([{ drugId: 'metoprolol', mg: 25, perDay: 2 }], { patient: asthma }).last
    const high = run([{ drugId: 'metoprolol', mg: 200, perDay: 2 }], { patient: asthma }).last
    expect(high.engagement.beta2_occupancy).toBeGreaterThan(2 * low.engagement.beta2_occupancy)
    expect(high.hazards.bronchospasm).toBeGreaterThan(2 * low.hazards.bronchospasm)
    expect(low.lung.fev1_pct_baseline).toBeGreaterThan(high.lung.fev1_pct_baseline)
  })

  it('CM-05 🔴 the same dose crosses the label threshold in a PM but not an NM', () => {
    // FDA label: cardioselectivity is lost above 300 nmol/L = 80.2 ng/mL.
    // Same patient, same drug, different genotype, different safety verdict.
    const nm = run([{ drugId: 'metoprolol', mg: 100, perDay: 2 }]).frames
    const pm = run([{ drugId: 'metoprolol', mg: 100, perDay: 2 }], {
      patient: referencePatient({ cyp2d6: 'poor' }),
    }).frames
    const trough = (fs: EffectFrame[]) => Math.min(...fs.slice(-48).map((f) => f.conc.metoprolol))
    expect(trough(nm)).toBeLessThan(METOPROLOL_BETA2_CROSSOVER_NG_ML)
    expect(trough(pm)).toBeGreaterThan(METOPROLOL_BETA2_CROSSOVER_NG_ML)
  })
})

describe('EN-04 🔴 losartan: URAT1 and AT1 peak at different times', () => {
  it('urat1_inhibition (parent) peaks > 1.5 h before at1_blockade (parent + metabolite)', () => {
    const r = runSimulationSync({
      kind: 'run',
      runId: 'en04',
      patient: referencePatient(),
      regimen: makeRegimen([{ drugId: 'losartan', mg: 50 }]),
      modifiers: NO_MODIFIERS,
      options: { horizonHours: 24, outputEveryMin: 5, initial: 'first_dose' },
    })
    const peakAt = (get: (f: EffectFrame) => number) =>
      r.frames.reduce((a, b) => (get(b) > get(a) ? b : a)).t_h
    const tUrat = peakAt((f) => f.engagement.urat1_inhibition)
    const tAt1 = peakAt((f) => f.engagement.at1_blockade)
    expect(tAt1 - tUrat).toBeGreaterThan(1.5)
  })
})

describe('EN-05…EN-09 — counter-regulation, the demo that proves feedback exists', () => {
  it('EN-05 🔴 losartan 100 mg: renin PRA 1.7–3.5x baseline', () => {
    const f = run([{ drugId: 'losartan', mg: 100 }]).last
    expect(f.mediators.renin_pra_fold).toBeGreaterThan(1.7)
    expect(f.mediators.renin_pra_fold).toBeLessThan(3.5)
  })

  it('EN-06 🔴 PRA RISES while vascular AngII and SBP both FALL, simultaneously', () => {
    // If PRA does not rise while BP falls, the model has no feedback and a
    // clinician judge sees it immediately.
    const base = baselineRun()
    const los = run([{ drugId: 'losartan', mg: 100 }])
    expect(los.last.mediators.renin_pra_fold).toBeGreaterThan(base.last.mediators.renin_pra_fold)
    expect(los.last.mediators.ang_ii_fold).toBeLessThan(base.last.mediators.ang_ii_fold)
    expect(los.diagnostics.meanLast24h.sbp).toBeLessThan(base.diagnostics.meanLast24h.sbp)
  })

  it('EN-07 🔴 metoprolol LOWERS renin — PRA < 0.85', () => {
    const f = run([{ drugId: 'metoprolol', mg: 50, perDay: 2 }]).last
    expect(f.mediators.renin_pra_fold).toBeLessThan(0.85)
  })

  it('EN-08 🔴 HCTZ RAISES renin — PRA 1.15–1.8', () => {
    const f = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last
    expect(f.mediators.renin_pra_fold).toBeGreaterThan(1.15)
    expect(f.mediators.renin_pra_fold).toBeLessThan(1.8)
  })

  it('EN-09 🔴 bradykinin rises on lisinopril and is EXACTLY 1.00 on losartan', () => {
    // The cleanest class contrast in the product: cough is an ACE-inhibitor
    // channel, not an ARB one.
    expect(run([{ drugId: 'lisinopril', mg: 20 }]).last.mediators.bradykinin_fold).toBeGreaterThan(1.5)
    expect(run([{ drugId: 'losartan', mg: 50 }]).last.mediators.bradykinin_fold).toBe(1)
    expect(run([{ drugId: 'losartan', mg: 50 }]).last.hazards.cough).toBe(0)
    expect(run([{ drugId: 'lisinopril', mg: 20 }]).last.hazards.cough).toBeGreaterThan(0.015)
    expect(run([{ drugId: 'lisinopril', mg: 20 }]).last.hazards.cough).toBeLessThan(0.04)
  })

  it('EN-10 🔴 amlodipine is vascular-selective — myocardial block < 5 % of vascular', () => {
    const f = run([{ drugId: 'amlodipine', mg: 10 }]).last
    expect(f.engagement.cav12_block_myocardium / f.engagement.cav12_block_vsmc).toBeLessThan(0.05)
  })
})

describe('EN-11 🔴 each drug reaches the endpoint by a DIFFERENT internal route', () => {
  it('the dominant haemodynamic term differs across all four mechanism groups', () => {
    const base = baselineRun().last
    const profile = (spec: Spec[]) => {
      const f = run(spec).last
      return {
        svr: (f.haemo.svr - base.haemo.svr) / base.haemo.svr,
        hr: (f.haemo.hr - base.haemo.hr) / base.haemo.hr,
        sv: (f.haemo.stroke_volume - base.haemo.stroke_volume) / base.haemo.stroke_volume,
        co: (f.haemo.cardiac_output - base.haemo.cardiac_output) / base.haemo.cardiac_output,
        vol: (f.chem.plasma_volume - base.chem.plasma_volume) / base.chem.plasma_volume,
        pra: f.mediators.renin_pra_fold,
      }
    }
    const amlo = profile([{ drugId: 'amlodipine', mg: 5 }])
    const hctz = profile([{ drugId: 'hydrochlorothiazide', mg: 25 }])
    const meto = profile([{ drugId: 'metoprolol', mg: 50, perDay: 2 }])
    const lis = profile([{ drugId: 'lisinopril', mg: 20 }])

    // amlodipine: resistance route, cardiac output UP, heart rate essentially flat
    expect(amlo.svr).toBeLessThan(-0.05)
    expect(amlo.co).toBeGreaterThan(0)
    expect(Math.abs(amlo.hr)).toBeLessThan(0.05)

    // HCTZ: volume route → stroke volume and cardiac output DOWN
    expect(hctz.vol).toBeLessThan(-0.02)
    expect(hctz.sv).toBeLessThan(0)
    expect(hctz.co).toBeLessThan(0)

    // metoprolol: rate and contractility route
    expect(meto.hr).toBeLessThan(-0.03)
    expect(meto.co).toBeLessThan(0)
    expect(meto.pra).toBeLessThan(1)

    // lisinopril: resistance route with renin UP and heart rate flat
    expect(lis.svr).toBeLessThan(-0.02)
    expect(lis.pra).toBeGreaterThan(1.5)
    expect(Math.abs(lis.hr)).toBeLessThan(0.05)

    // and the routes are genuinely distinct, not four labels on one mechanism
    expect(amlo.co).toBeGreaterThan(hctz.co)
    expect(amlo.co).toBeGreaterThan(meto.co)
    expect(meto.hr).toBeLessThan(hctz.hr)
    expect(lis.pra).toBeGreaterThan(meto.pra)
  })
})

describe('EN-12 🔴 baroreflex sensitivity is Agent D\'s derived −1.23 bpm/mmHg', () => {
  it('holds at HR 70 and scales with the subject\'s own baseline heart rate', () => {
    const b70 = deriveBaseline({ sbp: 154, dbp: 97, hr: 70, co: 5.0, cvp: 5 })
    expect(baroreflexSensitivity(b70)).toBeCloseTo(-1.23, 2)
    const b90 = deriveBaseline({ sbp: 154, dbp: 97, hr: 90, co: 5.0, cvp: 5 })
    expect(baroreflexSensitivity(b90)).toBeCloseTo(-1.23, 2)
  })
})

describe('EN-13 🔴 EffectFrame completeness and the PROXY contract', () => {
  it('every leaf field has a declared provenance tier', () => {
    const f = run([{ drugId: 'lisinopril' }]).last
    const paths: string[] = []
    const walk = (obj: unknown, prefix: string) => {
      if (typeof obj === 'number') {
        paths.push(prefix)
        return
      }
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        walk(v, prefix ? `${prefix}.${k}` : k)
      }
    }
    walk(f, '')
    const missing = paths.filter((path) => !FRAME_FIELD_TIERS[path])
    expect(missing).toEqual([])
    expect(paths.length).toBeGreaterThan(60)
  })

  it('intraglomerular pressure is PROXY — an index at 1.00, never absolute mmHg', () => {
    // The one that matters most: the renal-protection animation rests on it and
    // it is entirely ESTIMATED.
    expect(FRAME_FIELD_TIERS['renal.p_glomerular']).toBe('PROXY')
    expect(PROXY_FIELDS).toContain('renal.p_glomerular')
    const base = baselineRun().last
    expect(base.renal.p_glomerular).toBeCloseTo(1.0, 1)
    // and it MOVES in the right direction on a RAS inhibitor (efferent dilation)
    const lis = run([{ drugId: 'lisinopril', mg: 20 }]).last
    expect(lis.renal.efferent_radius_index).toBeGreaterThan(1)
    expect(lis.renal.p_glomerular).toBeLessThan(base.renal.p_glomerular)
  })

  it('tissue ACE inhibition is PROXY and equal to plasma — no fabricated gradient', () => {
    const f = run([{ drugId: 'lisinopril' }]).last
    expect(f.engagement.ace_inhibition_pulmonary).toBe(f.engagement.ace_inhibition_plasma)
    expect(f.engagement.ace_inhibition_renal).toBe(f.engagement.ace_inhibition_plasma)
    expect(FRAME_FIELD_TIERS['engagement.ace_inhibition_pulmonary']).toBe('PROXY')
  })

  it('fasting glucose is emitted unchanged — the engine does not model dysglycaemia', () => {
    expect(FRAME_FIELD_TIERS['chem.fasting_glucose']).toBe('PROXY')
    const f = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last
    expect(f.chem.fasting_glucose).toBe(REF1.fasting_glucose)
  })

  it('the HCTZ target is the one genuinely mechanistic renal field', () => {
    expect(FRAME_FIELD_TIERS['renal.frac_na_reab_dct']).toBe('COMPUTED')
    const base = baselineRun().last
    const hctz = run([{ drugId: 'hydrochlorothiazide', mg: 25 }]).last
    expect(hctz.renal.frac_na_reab_dct).toBeLessThan(base.renal.frac_na_reab_dct)
    expect(hctz.renal.urine_flow).toBeGreaterThan(base.renal.urine_flow)
  })
})

describe('FM-03 / §5.6 — physiological floor', () => {
  it('a massive regimen clamps rather than emitting an impossible pressure', () => {
    const r = run(
      [
        { drugId: 'lisinopril', mg: 80 },
        { drugId: 'amlodipine', mg: 20 },
        { drugId: 'hydrochlorothiazide', mg: 100 },
        { drugId: 'metoprolol', mg: 400, perDay: 2 },
      ],
      { patient: referencePatient({ sbp_mmHg: 120, dbp_mmHg: 75 }) },
    )
    for (const f of r.frames) {
      expect(f.haemo.map).toBeGreaterThanOrEqual(59.9)
      expect(Number.isFinite(f.haemo.sbp)).toBe(true)
    }
  })
})

describe('calibration is solved, not asserted', () => {
  it('every pathway gain reproduces its Law 2003 target at the standard dose', () => {
    const g = calibratePathwayGains()
    const b = deriveBaseline({ sbp: REF1.sbp, dbp: REF1.dbp, hr: REF1.hr, co: REF1.co, cvp: REF1.cvp })
    const d = (input: Parameters<typeof solveSteadyState>[1]) =>
      b.sbp0 - solveSteadyState(b, input).haemo.sbp
    expect(d({ ...NO_DRUG, raas: g.ace * 0.8, ace: 0.8 })).toBeCloseTo(8.5, 1)
    expect(d({ ...NO_DRUG, raas: g.at1 * 0.85, at1: 0.85 })).toBeCloseTo(10.3, 1)
    expect(d({ ...NO_DRUG, ltype: 0.5 })).toBeCloseTo(8.8, 1)
    expect(d({ ...NO_DRUG, ncc: 0.45 })).toBeCloseTo(8.8, 1)
    expect(d({ ...NO_DRUG, b1: 0.73 })).toBeCloseTo(9.2, 1)
    // …and the beta1 heart-rate target
    expect(b.hr0 - solveSteadyState(b, { ...NO_DRUG, b1: 0.73 }).state.HR).toBeCloseTo(7.1, 1)
  })
})
