import { describe, expect, it } from 'vitest'
import { stubRun } from './stubEngine'
import { combinationArms } from './demoScripts'
import { SUBJECT_PRESETS } from './presets'

describe('placeholder engine fallback', () => {
  it('produces complete frames and a sign-correct summary', () => {
    const subj = SUBJECT_PRESETS[0]
    for (const regimen of combinationArms().slice(0, 3)) {
      const { frames, summary } = stubRun({
        kind: 'run',
        runId: 'x',
        patient: { inputs: subj.inputs, vars: {}, appliedPresets: [], warnings: [] },
        regimen,
        modifiers: {
          hits: [], blocked: false, blockReasons: [], pkMultipliers: {},
          pdMultipliers: {}, stateShifts: {}, doseCaps: {}, phenoconversions: {},
        },
        options: { horizonHours: 192, outputEveryMin: 30, initial: 'steady_state', populationN: 50 },
      })
      expect(frames.length).toBeGreaterThan(100)
      expect(Number.isFinite(frames[0].haemo.sbp)).toBe(true)
      expect(Number.isFinite(frames[0].chem.serum_k)).toBe(true)
      // deltaSbp is a REDUCTION: positive means the pressure came down.
      expect(summary.deltaSbp).toBeGreaterThan(0)
      console.log(regimen.label, '→ reduction', summary.deltaSbp.toFixed(1), 'mmHg')
    }
  })
})
