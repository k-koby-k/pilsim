import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { deriveTwin } from '../../rules/twin'
import type { PatientModelFile } from '../../data/load'
import type { PatientInputs } from '../../types'
import { deriveTwinFallback } from './twinFallback'
import { baselineFrameFromTwin } from './baselineBridge'
import { latchBadges, cloud, arcPath, baselineFrame, FALLBACK_REF } from '../organs/channels'

const model = JSON.parse(readFileSync('data/patient_model.json', 'utf8')) as PatientModelFile

const base: PatientInputs = {
  age_years: 45, sex: 'male', weight_kg: 73, height_cm: 176,
  sbp_mmHg: 118, dbp_mmHg: 72, hr_bpm: 70, serum_creatinine_mg_dl: 0.9,
  comorbidities: [], ckd_stage: 'G3b', cyp2d6_activity_score: 2,
}

describe('subject page plumbing', () => {
  it('real twin + bridge produces a finite frame', () => {
    const t = deriveTwin(base, model)
    const f = baselineFrameFromTwin(t)
    expect(Number.isFinite(f.haemo.hr)).toBe(true)
    expect(Number.isFinite(f.renal.gfr)).toBe(true)
    expect(f.conc.metoprolol).toBe(0)
    expect(f.liver.cyp2d6_capacity_fold).toBeGreaterThan(0)
  })

  it('comorbidities visibly shift state variables', () => {
    const well = deriveTwin(base, model)
    const sick = deriveTwin({ ...base, comorbidities: ['t2dm'] }, model)
    const moved = Object.keys(sick.vars).filter(
      (k) => typeof well.vars[k] === 'number' && Math.abs(sick.vars[k] - well.vars[k]) > 1e-6,
    )
    expect(moved.length).toBeGreaterThan(0)
  })

  it('CYP2D6 poor metaboliser closes the hepatic gate', () => {
    const normal = baselineFrameFromTwin(deriveTwin({ ...base, cyp2d6_activity_score: 2 }, model))
    const poor = baselineFrameFromTwin(deriveTwin({ ...base, cyp2d6_activity_score: 0 }, model))
    expect(poor.liver.cyp2d6_capacity_fold).toBeLessThan(normal.liver.cyp2d6_capacity_fold)
  })

  it('fallback derivation runs without a model', () => {
    const s = deriveTwinFallback(base, null)
    expect(Number.isFinite(s.vars.bsa_m2)).toBe(true)
    expect(Number.isFinite(s.vars.egfr_ckdepi2021)).toBe(true)
  })

  it('badge latching has hysteresis', () => {
    const g = { hr: null, serumK: null, serumUrate: null, kLow: 3.5, kHigh: 5.5, urateHigh: 6.8 }
    const on = latchBadges({ cough: 0.32 }, new Set(), g)
    expect(on.has('cough')).toBe(true)
    const still = latchBadges({ cough: 0.25 }, on, g)
    expect(still.has('cough')).toBe(true)
    const off = latchBadges({ cough: 0.15 }, still, g)
    expect(off.has('cough')).toBe(false)
  })

  it('channel helpers behave', () => {
    expect(cloud('amlodipine', 12)?.count).toBe(28)
    expect(arcPath(0, 0, 10, 90)).toContain('A 10 10')
    expect(baselineFrame().haemo.hr).toBe(70)
    expect(FALLBACK_REF.kHigh).toBe(5.5)
  })
})
