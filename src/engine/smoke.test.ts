/**
 * End-to-end smoke test. Not a validation test — just proves the whole path
 * runs, streams frames, and returns a populated summary.
 */
import { describe, it, expect } from 'vitest'
import { runSimulationSync, referencePatient, makeRegimen, NO_MODIFIERS } from './run'
import { streamSimulation } from './index'
import type { SimRequest, EffectFrame } from '../types'

export function req(overrides: Partial<SimRequest> = {}): SimRequest {
  return {
    kind: 'run',
    runId: 'smoke-1',
    patient: referencePatient(),
    regimen: makeRegimen([{ drugId: 'lisinopril', doseMultiple: 1 }]),
    modifiers: NO_MODIFIERS,
    options: {
      horizonHours: 72,
      outputEveryMin: 15,
      initial: 'steady_state',
    },
    ...overrides,
  }
}

/** Every leaf of an EffectFrame must be a finite number. */
export function assertFrameComplete(f: EffectFrame) {
  const walk = (obj: unknown, path: string) => {
    if (typeof obj === 'number') {
      expect(Number.isFinite(obj), `${path} = ${obj}`).toBe(true)
      return
    }
    expect(obj && typeof obj === 'object', `${path} missing`).toBe(true)
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) walk(v, `${path}.${k}`)
  }
  walk(f, 'frame')
}

describe('engine end-to-end', () => {
  it('runs, streams frames and returns a summary', () => {
    const frames: EffectFrame[] = []
    const { summary, diagnostics } = runSimulationSync(req(), (f) => frames.push(f))
    expect(frames.length).toBeGreaterThan(200)
    expect(summary.framesEmitted).toBe(frames.length)
    expect(summary.deltaSbp).toBeGreaterThan(0)
    expect(diagnostics.pathwayGains.ace).toBeGreaterThan(0)
    assertFrameComplete(frames[0])
    assertFrameComplete(frames[frames.length - 1])
  })

  it('populates every EffectFrame field on every frame', () => {
    const { frames } = runSimulationSync(
      req({ regimen: makeRegimen([{ drugId: 'losartan' }, { drugId: 'hydrochlorothiazide' }]) }),
    )
    for (const f of frames) assertFrameComplete(f)
  })

  it('streams through the async-iterable API', async () => {
    let n = 0
    const iter = streamSimulation(req(), { inProcess: true })
    let res = await iter.next()
    while (!res.done) {
      n++
      res = await iter.next()
    }
    expect(n).toBeGreaterThan(200)
    expect(res.value.framesEmitted).toBe(n)
  })

  it('FM-11: empty regimen returns a valid placebo trace with no NaNs', () => {
    const { frames, summary } = runSimulationSync(
      req({ regimen: { id: 'placebo', label: 'placebo', doses: [] } }),
    )
    expect(summary.deltaSbp).toBe(0)
    for (const f of frames) assertFrameComplete(f)
    expect(frames[frames.length - 1].haemo.sbp).toBeCloseTo(154, 0)
  })

  it('VAL-15: identical inputs give identical results', () => {
    const a = runSimulationSync(req())
    const b = runSimulationSync(req())
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames))
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary))
  })
})
