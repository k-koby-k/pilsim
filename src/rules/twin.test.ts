import { describe, expect, it } from 'vitest'
import type { PatientInputs } from '../types'
import { loadDataFromDisk } from './testData'
import { deriveTwin, phenotypeCode, resolvePresets } from './twin'

const { patientModel } = loadDataFromDisk()

function inputs(over: Partial<PatientInputs> = {}): PatientInputs {
  return {
    age_years: 45,
    sex: 'male',
    weight_kg: 73,
    height_cm: 176,
    sbp_mmHg: 118,
    dbp_mmHg: 72,
    hr_bpm: 70,
    comorbidities: [],
    ...over,
  }
}

describe('digital twin — calibrate then run', () => {
  it('reproduces the entered blood pressure EXACTLY', () => {
    const cases: PatientInputs[] = [
      inputs(),
      inputs({ sbp_mmHg: 160, dbp_mmHg: 95 }),
      inputs({ sbp_mmHg: 178, dbp_mmHg: 104, age_years: 78, weight_kg: 58, height_cm: 158, sex: 'female' }),
      inputs({ sbp_mmHg: 92, dbp_mmHg: 58, age_years: 22, weight_kg: 52 }),
      inputs({ sbp_mmHg: 145, dbp_mmHg: 88, weight_kg: 120, height_cm: 170, comorbidities: ['obesity_metabolic'] }),
      inputs({ sbp_mmHg: 152, dbp_mmHg: 90, comorbidities: ['ckd', 't2dm'], ckd_stage: 'G4' }),
      inputs({ sbp_mmHg: 138, dbp_mmHg: 86, sex: 'female', pregnant: true, comorbidities: [] }),
      inputs({ sbp_mmHg: 130, dbp_mmHg: 82, comorbidities: ['hfref', 'elderly'], age_years: 71 }),
    ]
    for (const i of cases) {
      const twin = deriveTwin(i, patientModel)
      expect(twin.vars.sbp_mmHg, `SBP for ${JSON.stringify(i.comorbidities)}`).toBe(i.sbp_mmHg)
      expect(twin.vars.dbp_mmHg).toBe(i.dbp_mmHg)
      // and the identity the simulation runs forwards must hold at t = 0
      const map = twin.vars.cvp_mmHg + (twin.vars.svr_dyn_s_cm5 * twin.vars.cardiac_output_L_min) / 80
      expect(map).toBeCloseTo(twin.vars.map_mmHg, 9)
      const pp = twin.vars.stroke_volume_mL / twin.vars.arterial_compliance_mL_mmHg
      expect(pp).toBeCloseTo(twin.vars.pulse_pressure_mmHg, 9)
      expect(map + (2 / 3) * pp).toBeCloseTo(i.sbp_mmHg, 9)
      expect(map - (1 / 3) * pp).toBeCloseTo(i.dbp_mmHg, 9)
      // CO = HR x SV / 1000 must also hold, or the forward run jumps at t = 0
      expect((twin.vars.heart_rate_bpm * twin.vars.stroke_volume_mL) / 1000).toBeCloseTo(
        twin.vars.cardiac_output_L_min,
        9,
      )
    }
  })

  it('keeps every internal haemodynamic variable physiological', () => {
    const twin = deriveTwin(inputs({ sbp_mmHg: 160, dbp_mmHg: 95 }), patientModel)
    expect(twin.vars.svr_dyn_s_cm5).toBeGreaterThan(800)
    expect(twin.vars.svr_dyn_s_cm5).toBeLessThan(2000)
    expect(twin.vars.cardiac_output_L_min).toBeGreaterThan(4)
    expect(twin.vars.cardiac_output_L_min).toBeLessThan(8)
    expect(twin.vars.stroke_volume_mL).toBeGreaterThan(60)
    expect(twin.vars.stroke_volume_mL).toBeLessThan(120)
    expect(twin.vars.arterial_compliance_mL_mmHg).toBeGreaterThan(0.3)
    expect(twin.vars.arterial_compliance_mL_mmHg).toBeLessThan(3)
    expect(twin.vars.filtration_fraction).toBeGreaterThan(0.1)
    expect(twin.vars.filtration_fraction).toBeLessThan(0.3)
    expect(twin.vars.baroreflex_gain_bpm_per_mmHg).toBeLessThan(0)
  })

  it('runs all 44 pipeline steps and produces every keystone variable', () => {
    const twin = deriveTwin(inputs(), patientModel)
    for (const step of patientModel.derivation_pipeline) {
      const numeric = twin.vars[step.id]
      const categorical = twin.categoricals[step.id]
      expect(
        typeof numeric === 'number' || typeof categorical === 'string',
        `pipeline step ${step.step} (${step.id}) produced nothing`,
      ).toBe(true)
    }
  })
})

describe('digital twin — renal function', () => {
  it('uses the 2021 race-free CKD-EPI equation', () => {
    // NIDDK worked value: male, 60 y, SCr 1.0 -> 87 mL/min/1.73m^2 (rounded).
    const twin = deriveTwin(inputs({ age_years: 60, serum_creatinine_mg_dl: 1.0 }), patientModel)
    expect(twin.vars.egfr_ckdepi2021).toBeGreaterThan(85)
    expect(twin.vars.egfr_ckdepi2021).toBeLessThan(90)

    // Race-free: no ancestry term may change the result.
    const a = deriveTwin(inputs({ ancestry_group: 'European' }), patientModel)
    const b = deriveTwin(inputs({ ancestry_group: 'Sub-Saharan African' }), patientModel)
    expect(a.vars.egfr_ckdepi2021).toBe(b.vars.egfr_ckdepi2021)
  })

  it('de-indexes eGFR by BSA/1.73 for drug clearance, and keeps Cockcroft-Gault separate', () => {
    const twin = deriveTwin(inputs({ weight_kg: 110, height_cm: 180 }), patientModel)
    expect(twin.vars.egfr_absolute_mL_min).toBeCloseTo(
      (twin.vars.egfr_ckdepi2021 * twin.vars.bsa_m2) / 1.73,
      9,
    )
    // A large patient must have a HIGHER absolute clearance than the indexed value.
    expect(twin.vars.egfr_absolute_mL_min).toBeGreaterThan(twin.vars.egfr_ckdepi2021)
    // Cockcroft-Gault exists but is a different number; it is display-only.
    expect(twin.vars.crcl_cockcroft_gault_mL_min).toBeGreaterThan(0)
    expect(twin.vars.crcl_cockcroft_gault_mL_min).not.toBe(twin.vars.egfr_absolute_mL_min)
  })

  it('CKD presets set creatinine and let eGFR follow, landing in the right KDIGO band', () => {
    const bands: Record<string, [number, number]> = { G3a: [45, 59], G3b: [30, 44], G4: [15, 29] }
    for (const [stage, [lo, hi]] of Object.entries(bands)) {
      const twin = deriveTwin(inputs({ age_years: 60, comorbidities: ['ckd'], ckd_stage: stage }), patientModel)
      expect(twin.vars.egfr_ckdepi2021, `stage ${stage}`).toBeGreaterThanOrEqual(lo)
      expect(twin.vars.egfr_ckdepi2021, `stage ${stage}`).toBeLessThanOrEqual(hi)
      expect(twin.categoricals.ckd_stage).toBe(stage)
    }
  })
})

describe('digital twin — presets', () => {
  it('applies comorbidity presets as state-variable shifts', () => {
    const base = deriveTwin(inputs(), patientModel)
    const gout = deriveTwin(inputs({ comorbidities: ['gout'] }), patientModel)
    expect(base.vars.serum_urate_mg_dL).toBe(5.5)
    expect(gout.vars.serum_urate_mg_dL).toBe(9.2)
    expect(gout.appliedPresets).toContain('gout')
    expect(gout.conditions).toContain('gout')
    expect(gout.conditions).toContain('hyperuricemia')

    const dm = deriveTwin(inputs({ comorbidities: ['t2dm'] }), patientModel)
    expect(dm.vars.fasting_glucose_mg_dL).toBe(145)
    expect(dm.vars.hba1c_pct).toBe(7.6)
    expect(dm.vars.uacr_mg_g).toBe(45)
    expect(dm.vars.heart_rate_bpm).toBe(80) // 70 + 10
    // hyperfiltration
    expect(dm.vars.egfr_ckdepi2021).toBeGreaterThan(base.vars.egfr_ckdepi2021)
  })

  it('suppresses the diabetic hyperfiltration multiplier when CKD is also active', () => {
    const ckd = deriveTwin(inputs({ age_years: 60, comorbidities: ['ckd'] }), patientModel)
    const both = deriveTwin(inputs({ age_years: 60, comorbidities: ['ckd', 't2dm'] }), patientModel)
    expect(both.vars.egfr_ckdepi2021).toBeCloseTo(ckd.vars.egfr_ckdepi2021, 9)
  })

  it('refuses preset modifiers on the solved variables, loudly', () => {
    const twin = deriveTwin(inputs({ comorbidities: ['hfref'] }), patientModel)
    expect(twin.warnings.join(' ')).toMatch(/svr_dyn_s_cm5 refused/)
    expect(twin.vars.svr_dyn_s_cm5_preset_multiplier_advisory).toBeCloseTo(1.25, 9)
  })

  it('accepts a condition key as well as a preset id, without over-asserting', () => {
    const asthma = deriveTwin(inputs({ comorbidities: ['asthma'] }), patientModel)
    expect(asthma.appliedPresets).toContain('asthma_copd')
    expect(asthma.conditions).toContain('asthma')
    // asthma_copd `satisfies_condition_keys` lists copd too, but the user said asthma.
    expect(asthma.conditions).not.toContain('copd')
    expect(asthma.vars.fev1_pct_predicted).toBe(62)
  })

  it('flags equations that are not valid in this patient rather than hiding them', () => {
    const preg = deriveTwin(inputs({ sex: 'female', pregnant: true }), patientModel)
    expect(preg.appliedPresets).toContain('pregnancy')
    expect(preg.warnings.join(' ')).toMatch(/CKD-EPI 2021 is not valid in pregnancy/)
    expect(preg.vars.egfr_ckdepi2021).toBeGreaterThan(0)
  })

  it('honours the hard output clamps', () => {
    const twin = deriveTwin(inputs({ sbp_mmHg: 250, dbp_mmHg: 150, hr_bpm: 180 }), patientModel)
    expect(twin.vars.sbp_mmHg).toBe(250)
    expect(twin.vars.svr_dyn_s_cm5).toBeLessThanOrEqual(4000)
    expect(twin.vars.cardiac_output_L_min).toBeLessThanOrEqual(15)
  })
})

describe('digital twin — pharmacogenomics', () => {
  it('bins CYP2D6 activity score on the 2019 consensus, not the older bins', () => {
    expect(phenotypeCode(deriveTwin(inputs({ cyp2d6: 'poor' }), patientModel), 'cyp2d6')).toBe('PM')
    expect(phenotypeCode(deriveTwin(inputs({ cyp2d6: 'intermediate' }), patientModel), 'cyp2d6')).toBe('IM')
    expect(phenotypeCode(deriveTwin(inputs({ cyp2d6: 'normal' }), patientModel), 'cyp2d6')).toBe('NM')
    expect(phenotypeCode(deriveTwin(inputs({ cyp2d6: 'ultrarapid' }), patientModel), 'cyp2d6')).toBe('UM')
    // Activity score 1.0 is INTERMEDIATE under the current standard.
    const as1 = deriveTwin(inputs({ cyp2d6_activity_score: 1.0 }), patientModel)
    expect(as1.categoricals.cyp2d6_phenotype).toBe('Intermediate')
  })

  it('scales the CYP2D6 pathway multiplier to reproduce the observed 5x AUC in poor metabolisers', () => {
    const pm = deriveTwin(inputs({ cyp2d6: 'poor' }), patientModel)
    expect(pm.vars.cyp2d6_pathway_multiplier).toBe(0)
    const im = deriveTwin(inputs({ cyp2d6: 'intermediate' }), patientModel)
    expect(im.vars.cyp2d6_pathway_multiplier).toBe(0.5)
  })
})

describe('preset resolution', () => {
  it('returns presets in file declaration order so `set` last-writer-wins is deterministic', () => {
    const a = resolvePresets(inputs({ comorbidities: ['gout', 't2dm'] }), patientModel)
    const b = resolvePresets(inputs({ comorbidities: ['t2dm', 'gout'] }), patientModel)
    expect(a.presetIds).toEqual(b.presetIds)
  })
})
