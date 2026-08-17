/**
 * PilSim engine — public API.
 *
 * UI agents: this is your entire surface. Two ways to run a simulation.
 *
 *   // callback stream (simplest — good for requestAnimationFrame rendering)
 *   const handle = runSimulation(req, {
 *     onFrame: (f) => setLatest(f),
 *     onDone:  (s) => setSummary(s),
 *     onError: (e) => setError(e),
 *   })
 *   handle.cancel()            // tears the worker down
 *   await handle.done          // Promise<RunSummary>
 *
 *   // async iterable (good for `for await` in an effect)
 *   for await (const f of streamSimulation(req)) { ... }
 *
 * Both create and dispose the Web Worker for you. In a non-browser context
 * (vitest, SSR) they transparently fall back to running in-process, so tests do
 * not need a worker shim.
 *
 * The ranking / "5 most efficient combinations" feature does NOT need any of
 * this — call `rankRegimens()` directly. It is pure arithmetic, ~10 µs per
 * regimen, and it is the ONLY thing allowed to produce a ranked recommendation
 * (spec §6.1b(a), validation PK-13c).
 */

import type { EffectFrame, RunSummary, SimRequest, SimResponse } from '../types'
import { runSimulationSync } from './run'

export type FrameBatchMessage = { kind: 'frames'; runId: string; frames: EffectFrame[] }
export type EngineMessage = SimResponse | FrameBatchMessage

export interface RunHandle {
  /** resolves with the summary, rejects on engine error */
  done: Promise<RunSummary>
  cancel(): void
}

export interface RunCallbacks {
  onFrame?: (frame: EffectFrame) => void
  onDone?: (summary: RunSummary) => void
  onError?: (message: string) => void
  /** force in-process execution (tests, SSR); default is a worker when available */
  inProcess?: boolean
}

function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined'
}

/**
 * Create the engine worker. Kept in its own function so bundlers can see the
 * `new URL(..., import.meta.url)` form, which is what vite needs to emit the
 * worker chunk (`worker: { format: 'es' }` is already set in vite.config.ts).
 */
export function createEngineWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}

export function runSimulation(req: SimRequest, cb: RunCallbacks = {}): RunHandle {
  if (cb.inProcess || !workerSupported()) return runInProcess(req, cb)

  let worker: Worker | null
  try {
    worker = createEngineWorker()
  } catch {
    return runInProcess(req, cb)
  }

  let settled = false
  const w = worker
  const done = new Promise<RunSummary>((resolve, reject) => {
    w.addEventListener('message', (ev: MessageEvent) => {
      const msg = ev.data as EngineMessage
      if (!msg || msg.runId !== req.runId) return
      switch (msg.kind) {
        case 'frames':
          for (const f of msg.frames) cb.onFrame?.(f)
          break
        case 'frame':
          cb.onFrame?.(msg.frame)
          break
        case 'done':
          settled = true
          cb.onDone?.(msg.summary)
          resolve(msg.summary)
          w.terminate()
          break
        case 'error':
          settled = true
          cb.onError?.(msg.message)
          reject(new Error(msg.message))
          w.terminate()
          break
      }
    })
    w.addEventListener('error', (ev) => {
      if (settled) return
      settled = true
      const message = (ev as ErrorEvent).message || 'engine worker failed'
      cb.onError?.(message)
      reject(new Error(message))
    })
  })

  w.postMessage(req)

  return {
    done,
    cancel() {
      if (!settled) w.terminate()
    },
  }
}

function runInProcess(req: SimRequest, cb: RunCallbacks): RunHandle {
  let cancelled = false
  const done = new Promise<RunSummary>((resolve, reject) => {
    // defer so callers can attach handlers before anything fires
    Promise.resolve().then(() => {
      if (cancelled) return
      try {
        const { summary } = runSimulationSync(req, (f) => {
          if (!cancelled) cb.onFrame?.(f)
        })
        if (cancelled) return
        cb.onDone?.(summary)
        resolve(summary)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        cb.onError?.(message)
        reject(new Error(message))
      }
    })
  })
  return {
    done,
    cancel() {
      cancelled = true
    },
  }
}

/** Async-iterable form. Yields every frame, then returns. */
export async function* streamSimulation(
  req: SimRequest,
  opts: { inProcess?: boolean } = {},
): AsyncGenerator<EffectFrame, RunSummary, void> {
  const queue: EffectFrame[] = []
  let notify: (() => void) | null = null
  let finished = false
  const box: { failure: Error | null; summary: RunSummary | null } = {
    failure: null,
    summary: null,
  }

  const wake = () => {
    const n = notify
    notify = null
    n?.()
  }

  const handle = runSimulation(req, {
    inProcess: opts.inProcess,
    onFrame: (f) => {
      queue.push(f)
      wake()
    },
    onDone: (s) => {
      box.summary = s
      finished = true
      wake()
    },
    onError: (m) => {
      box.failure = new Error(m)
      finished = true
      wake()
    },
  })
  handle.done.catch(() => {
    /* surfaced through `failure` */
  })

  try {
    while (true) {
      while (queue.length > 0) yield queue.shift() as EffectFrame
      if (finished) break
      await new Promise<void>((r) => {
        notify = r
      })
    }
    if (box.failure) throw box.failure
    if (!box.summary) throw new Error('engine finished without a summary')
    return box.summary
  } finally {
    handle.cancel()
  }
}

/** Synchronous, worker-free run. Returns every frame at once. */
export function simulate(req: SimRequest) {
  return runSimulationSync(req)
}

// ---------------------------------------------------------------------------
// Re-exports — everything the UI, the report and the ranker need.
// ---------------------------------------------------------------------------

export {
  runSimulationSync,
  referencePatient,
  makeRegimen,
  NO_MODIFIERS,
  IntegratorDiverged,
  rngFor,
} from './run'
export type { RunResult, RunDiagnostics, RunExtras } from './run'

export {
  combinationRule,
  monotherapyEffect,
  rankRegimens,
  allPairs,
  classEffect,
  baselineScaling,
  pool,
  adverseSymptomBurden,
  regimenAdverseBurden,
  optionsFromModifiers,
} from './combination'
export type {
  CombinationResult,
  CombinationOptions,
  CombinationSubject,
  RankedCombination,
  Endpoint,
} from './combination'

export {
  enumerateCandidateRegimens,
  evaluateCandidates,
  defaultOptimiseScore,
  findTopCombinations,
  LICENSED_STRENGTHS_MG,
} from './optimise'
export type {
  OptimiseCandidate,
  EnumerateOptions,
  OptimiseScoreFn,
  OptimiseFilterFn,
  FindTopCombinationsOptions,
  RankedOptimiseCandidate,
} from './optimise'

export { project5Year, relativeRisk, tenYearToFiveYear } from './prognosis'
export type { Prognosis, PrognosisBand } from './prognosis'

export { FRAME_FIELD_TIERS, PROXY_FIELDS, fieldTier } from './tiers'
export { assembleFrame, defaultFrameBaselines, amlodipineEdemaIncidence, coughRisk } from './frame'
export type { FrameBaselines, LabState } from './frame'

export {
  buildPkParams,
  buildDoseHistory,
  concentrationAt,
  exp3174ConcentrationAt,
  batemanSingle,
  derivedPk,
  drugsInRegimen,
  formForDrug,
  apparentVolumeScale,
  resolveForm,
  kaScaleForForm,
  UnavailableFormError,
} from './pk'
export type { DrugPkParams, DoseEvent, PkCovariates, ResolvedForm } from './pk'

export { FORMULATIONS, REFERENCE_FORM, listFormsForDrug } from './formulations'
export type { FormulationOverride, FormListing } from './formulations'

export {
  computeEngagement,
  hill,
  EC50_NG_ML,
  HCTZ_DOSE_EC50_MG,
  nccInhibitionFromDose,
  referenceCavgNgMl,
  referenceCavgExp3174,
  bronchialRisk,
} from './pd'
export type { Engagement } from './pd'

export {
  deriveBaseline,
  haemodynamics,
  solveSteadyState,
  calibratePathwayGains,
  initialState,
  rk4Step,
  NO_DRUG,
} from './homeostasis'
export type { CvState, CvBaseline, OdeDrugInput, Haemodynamics } from './homeostasis'

export { runPopulation, summarise, RESIDUAL_SD_MMHG, CYP2D6_FREQ, CYP2C9_FREQ } from './population'
export type { PopulationResult, PopulationOptions, Distribution, SubjectDraw } from './population'

export { Rng, correlatedPair } from './rng'
export { SUBSTANCE_PK, METABOLITE } from './substanceParams'
export * from './constants'
