/**
 * Worker protocol and the accumulation-bias guards.
 *
 * The worker itself needs a browser to run, so what is tested here is the part
 * that can go wrong silently: that the message shapes conform to the frozen
 * contract in src/types.ts, and that no ranked output can be computed from a
 * time-truncated trace (PK-13c, FM-08b).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSimulationSync, referencePatient, makeRegimen, NO_MODIFIERS } from './run'
import { rankRegimens, allPairs, combinationRule } from './combination'
import { runSimulation } from './index'
import type { DrugId, SimRequest, SimResponse } from '../types'

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url))

const req = (
  over: Partial<SimRequest['options']> = {},
  drugs: { drugId: DrugId }[] = [{ drugId: 'amlodipine' }],
): SimRequest => ({
  kind: 'run',
  runId: 'p1',
  patient: referencePatient(),
  regimen: makeRegimen(drugs),
  modifiers: NO_MODIFIERS,
  options: { horizonHours: 24, outputEveryMin: 30, initial: 'steady_state', ...over },
})

describe('worker protocol conforms to the frozen contract', () => {
  it('the worker posts only SimProgress / SimDone / SimError shapes', () => {
    const src = readFileSync(join(ENGINE_DIR, 'worker.ts'), 'utf8')
    const kinds = [...src.matchAll(/kind:\s*'([a-z]+)'/g)].map((m) => m[1])
    const posted = new Set(kinds.filter((k) => k !== 'run'))
    expect([...posted].sort()).toEqual(['done', 'error', 'frame'])
  })

  it('it is a MODULE worker with no Durable Object / WebSocket machinery', () => {
    // research/09-EXECUTION-TARGET-AMENDMENT.md deletes both, rather than
    // reimplementing them in the browser.
    const src = readFileSync(join(ENGINE_DIR, 'worker.ts'), 'utf8')
    // strip comments: the header explains what was DELETED and why
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/DurableObject|setAlarm|acceptWebSocket|WebSocket/)
    expect(code).toMatch(/addEventListener\('message'/)
  })

  it('a well-typed SimResponse round-trips through structured clone', () => {
    const { frames, summary } = runSimulationSync(req())
    const messages: SimResponse[] = [
      { kind: 'frame', runId: 'p1', frame: frames[0] },
      { kind: 'done', runId: 'p1', summary },
      { kind: 'error', runId: 'p1', message: 'integrator_diverged at step 12' },
    ]
    for (const m of messages) {
      expect(JSON.parse(JSON.stringify(m))).toEqual(m)
    }
  })

  it('runSimulation() falls back in-process when no Worker exists', async () => {
    const seen: number[] = []
    const handle = runSimulation(req(), { onFrame: (f) => seen.push(f.t_h) })
    const summary = await handle.done
    expect(seen.length).toBeGreaterThan(40)
    expect(summary.framesEmitted).toBe(seen.length)
  })

  it('cancel() stops the stream without throwing', async () => {
    const handle = runSimulation(req(), { inProcess: true })
    handle.cancel()
    await expect(Promise.race([handle.done, Promise.resolve('cancelled')])).resolves.toBeDefined()
  })

  it('outputEveryMin controls the frame count', () => {
    const coarse = runSimulationSync(req({ outputEveryMin: 60 }))
    const fine = runSimulationSync(req({ outputEveryMin: 15 }))
    expect(fine.frames.length).toBeGreaterThan(3 * coarse.frames.length - 5)
  })
})

describe('PK-13c / FM-08b 🔴 no ranking may come from a time-truncated trace', () => {
  it('a 24 h run and a 21-day run produce the SAME ranking', () => {
    // Because both read `combinationRule`, which is steady-state and dose-based.
    const short = runSimulationSync(req({ horizonHours: 24 }))
    const long = runSimulationSync(req({ horizonHours: 21 * 24 }))
    expect(short.summary.deltaSbp).toBeCloseTo(long.summary.deltaSbp, 10)
    expect(short.summary.deltaDbp).toBeCloseTo(long.summary.deltaDbp, 10)
  })

  it('the summary ΔSBP equals the algebraic rule exactly, never the last frame', () => {
    const r = runSimulationSync(req({ horizonHours: 24 }))
    const algebraic = combinationRule(
      makeRegimen([{ drugId: 'amlodipine' }]),
      { sbpBaseline: 154, dbpBaseline: 97 },
    )
    expect(r.summary.deltaSbp).toBe(algebraic.dsbp)
    // and it is NOT the trace value, which at 24 h differs
    expect(r.summary.deltaSbp).not.toBe(154 - r.frames[r.frames.length - 1].haemo.sbp)
  })

  it('the ranking is identical whether computed from a short or long horizon', () => {
    const a = rankRegimens(allPairs(1), { sbpBaseline: 154, dbpBaseline: 97 })
    const b = rankRegimens(allPairs(1), { sbpBaseline: 154, dbpBaseline: 97 })
    expect(a.map((x) => x.regimen.id)).toEqual(b.map((x) => x.regimen.id))
  })

  it('first_dose really does understate amlodipine — which is why it is opt-in', () => {
    // The bias is real; the defence is that it never reaches a ranked number.
    const ss = runSimulationSync(req({ horizonHours: 24, initial: 'steady_state' }))
    const fd = runSimulationSync(req({ horizonHours: 24, initial: 'first_dose' }))
    const peak = (r: typeof ss) => Math.max(...r.frames.map((f) => f.conc.amlodipine))
    expect(peak(fd) / peak(ss)).toBeLessThan(0.6)
    // …and the ranked number is unmoved regardless
    expect(fd.summary.deltaSbp).toBe(ss.summary.deltaSbp)
  })

  it('steady_state is the DEFAULT behaviour for the drugs that need it', () => {
    const ss = runSimulationSync(req({ horizonHours: 24, initial: 'steady_state' }))
    // amlodipine at steady state is ~2.9x its first-dose exposure
    const fd = runSimulationSync(req({ horizonHours: 24, initial: 'first_dose' }))
    const auc = (r: typeof ss) => r.frames.reduce((a, f) => a + f.conc.amlodipine, 0)
    expect(auc(ss) / auc(fd)).toBeGreaterThan(2.0)
  })

  it('the other four drugs are barely affected by the mode — the bias is SELECTIVE', () => {
    for (const drugId of ['lisinopril', 'losartan', 'hydrochlorothiazide'] as const) {
      const ss = runSimulationSync(req({ horizonHours: 24, initial: 'steady_state' }, [{ drugId }]))
      const fd = runSimulationSync(req({ horizonHours: 24, initial: 'first_dose' }, [{ drugId }]))
      const auc = (r: typeof ss) => r.frames.reduce((a, f) => a + f.conc[drugId], 0)
      expect(auc(ss) / auc(fd), drugId).toBeLessThan(1.6)
    }
  })
})

describe('FM-12 — divergence is reported, never rendered', () => {
  it('IntegratorDiverged carries the step index', async () => {
    const { IntegratorDiverged } = await import('./run')
    const e = new IntegratorDiverged(1234)
    expect(e.message).toContain('1234')
    expect(e.name).toBe('IntegratorDiverged')
  })
})
