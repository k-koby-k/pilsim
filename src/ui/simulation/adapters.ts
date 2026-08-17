/**
 * Bindings to the modules owned by other agents.
 *
 * The report, rules, twin, data and organ modules have landed, so they are
 * imported directly — that is the point of the frozen contract in src/types.ts.
 *
 * The ENGINE is still reached indirectly, for two reasons:
 *  1. The specified execution target is a Web Worker (09-EXECUTION-TARGET-
 *     AMENDMENT.md), which needs Vite's `?worker` query rather than a plain
 *     import, and
 *  2. `src/engine/index.ts` does not exist yet — today the runner is
 *     `runSimulationSync` in `src/engine/run.ts`. `import.meta.glob` binds to
 *     whichever appears without this view failing to compile in between.
 *
 * The glob patterns are EXACT FILENAMES on purpose. A wildcard over a whole
 * directory pulls in that directory's test helpers, and `src/rules/testData.ts`
 * imports `node:fs`, which breaks the browser build.
 */

import type {
  EffectFrame,
  PatientInputs,
  PatientState,
  Regimen,
  RunSummary,
  SimRequest,
  SimResponse,
} from '../../types'
import type { PatientModelFile, PilSimData, RulesFile } from '../../data/load'
import { evaluateRules as evaluateRulesImpl, type EvaluationResult, type RuleContext } from '../../rules/evaluate'
import { deriveTwin } from '../../rules/twin'
import { STUB_ENGINE_NOTICE, stubRun } from './stubEngine'

export type { EvaluationResult }

// ---------------------------------------------------------------------------
// engine discovery
// ---------------------------------------------------------------------------

/** Preferred path: the module Web Worker specified in 09-EXECUTION-TARGET-AMENDMENT.md. */
const workerGlob = import.meta.glob('../../engine/worker.ts', {
  query: '?worker',
  import: 'default',
}) as Record<string, () => Promise<new () => Worker>>

/** Fallbacks, in order: the index the engine agent will publish, then today's run.ts. */
const engineIndexGlob = import.meta.glob('../../engine/index.ts')
const engineRunGlob = import.meta.glob('../../engine/run.ts')

export interface EngineBinding {
  synthetic: boolean
  source: string
  mode: 'worker' | 'inline' | 'stub'
  notice?: string
}

let engineBinding: EngineBinding | null = null
/** Tracks the placeholder even for runs that do not update the reported binding. */
let lastRunSynthetic = false

export function getEngineBinding(): EngineBinding | null {
  return engineBinding
}

/** True when the most recent run of any kind came from the placeholder. */
export function lastRunWasSynthetic(): boolean {
  return lastRunSynthetic
}

export type ResponseSink = (r: SimResponse) => void

/** The worker batches frames as `{kind:'frames'}` to keep postMessage traffic sane. */
type WorkerMessage = SimResponse | { kind: 'frames'; runId: string; frames: EffectFrame[] }

let workerCtor: (new () => Worker) | null | undefined

async function getWorkerCtor(): Promise<(new () => Worker) | null> {
  if (workerCtor !== undefined) return workerCtor
  const key = Object.keys(workerGlob)[0]
  if (!key || typeof Worker === 'undefined') {
    workerCtor = null
    return null
  }
  try {
    workerCtor = await workerGlob[key]()
  } catch {
    workerCtor = null
  }
  return workerCtor ?? null
}

function runInWorker(Ctor: new () => Worker, req: SimRequest, sink: ResponseSink): Promise<void> {
  return new Promise((resolve) => {
    const w = new Ctor()
    const finish = () => {
      w.terminate()
      resolve()
    }
    w.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as WorkerMessage
      if (!msg || typeof msg !== 'object') return
      if (msg.kind === 'frames') {
        for (const frame of msg.frames) sink({ kind: 'frame', runId: msg.runId, frame })
        return
      }
      sink(msg)
      if (msg.kind === 'done' || msg.kind === 'error') finish()
    }
    w.onerror = (ev) => {
      sink({ kind: 'error', runId: req.runId, message: (ev as ErrorEvent).message || 'worker error' })
      finish()
    }
    w.postMessage(req)
  })
}

type InlineRunner = (req: SimRequest, onFrame?: (f: EffectFrame) => void) => unknown

let inlineRunner: { fn: InlineRunner; from: string } | null | undefined

async function getInlineRunner() {
  if (inlineRunner !== undefined) return inlineRunner
  const candidates: [Record<string, () => Promise<unknown>>, string[]][] = [
    [engineIndexGlob, ['runSimulation', 'runSimulationSync', 'run', 'default']],
    [engineRunGlob, ['runSimulation', 'runSimulationSync', 'run', 'default']],
  ]
  for (const [glob, names] of candidates) {
    for (const path of Object.keys(glob)) {
      try {
        const mod = (await glob[path]()) as Record<string, unknown>
        for (const name of names) {
          if (typeof mod?.[name] === 'function') {
            inlineRunner = { fn: mod[name] as InlineRunner, from: `${path.replace(/^\.\.\/\.\.\//, 'src/')}#${name}` }
            return inlineRunner
          }
        }
      } catch {
        /* next */
      }
    }
  }
  inlineRunner = null
  return inlineRunner
}

/**
 * Run one simulation. Frames reach `sink` as they are produced; the promise
 * settles when the engine has emitted `done` or `error`.
 */
export async function runSimulation(
  req: SimRequest,
  sink: ResponseSink,
  opts: { preferInline?: boolean; record?: boolean } = {},
): Promise<void> {
  const record = opts.record !== false
  const set = (b: EngineBinding) => {
    lastRunSynthetic = b.synthetic
    if (record) engineBinding = b
  }

  // Benches run many arms and discard the frames, so they take the inline path:
  // spawning one worker per arm and structured-cloning every frame back costs
  // far more than it saves when nothing is being animated.
  const Ctor = opts.preferInline ? null : await getWorkerCtor()
  if (Ctor) {
    set({ synthetic: false, source: 'src/engine/worker.ts', mode: 'worker' })
    await runInWorker(Ctor, req, sink)
    return
  }

  const inline = await getInlineRunner()
  if (inline) {
    set({ synthetic: false, source: inline.from, mode: 'inline' })
    try {
      const result = inline.fn(req, (f) => sink({ kind: 'frame', runId: req.runId, frame: f }))
      const settled = result instanceof Promise ? await result : result
      const bag = settled as { frames?: EffectFrame[]; summary?: RunSummary } | undefined
      if (bag?.summary) sink({ kind: 'done', runId: req.runId, summary: bag.summary })
      else sink({ kind: 'error', runId: req.runId, message: `${inline.from} produced no RunSummary.` })
    } catch (err) {
      sink({ kind: 'error', runId: req.runId, message: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  set({
    synthetic: true,
    source: 'src/ui/simulation/stubEngine.ts',
    mode: 'stub',
    notice: STUB_ENGINE_NOTICE,
  })
  await runStub(req, sink)
}

/** The placeholder, chunked so it streams rather than blocking the frame. */
async function runStub(req: SimRequest, sink: ResponseSink): Promise<void> {
  const { frames, summary } = stubRun(req)
  const chunk = Math.max(1, Math.ceil(frames.length / 60))
  for (let i = 0; i < frames.length; i += chunk) {
    for (let j = i; j < Math.min(i + chunk, frames.length); j++) {
      sink({ kind: 'frame', runId: req.runId, frame: frames[j] })
    }
    await new Promise((r) => setTimeout(r, 16))
  }
  sink({ kind: 'done', runId: req.runId, summary })
}

/** Non-streaming variant for the benches, which run many arms back to back. */
export async function runSimulationQuiet(
  req: SimRequest,
): Promise<{ frames: EffectFrame[]; summary: RunSummary | null; error?: string }> {
  const frames: EffectFrame[] = []
  let summary: RunSummary | null = null
  let error: string | undefined
  await runSimulation(
    req,
    (r) => {
      if (r.kind === 'frame') frames.push(r.frame)
      else if (r.kind === 'done') summary = r.summary
      else error = r.message
    },
    // `record: false` keeps the header reporting the STREAMING binding — a
    // bench should not make the page claim the live run is inline.
    { preferInline: true, record: false },
  )
  return { frames, summary, error }
}

// ---------------------------------------------------------------------------
// rules + twin
// ---------------------------------------------------------------------------

const EMPTY_EVALUATION: EvaluationResult = {
  hits: [],
  blocked: false,
  blockReasons: [],
  pkMultipliers: {},
  pdMultipliers: {},
  stateShifts: {},
  doseCaps: {},
  phenoconversions: {},
  overrideRequired: [],
  tier: 'ALLOWED',
  scoreDeltas: { efficacy: 0, safety: 0, appropriateness: 0 },
  scoreDeltasBySubstance: {},
  risks: {},
  monitoring: [],
  organAnnotations: [],
  externalDoseCaps: {},
  doseStarts: {},
  titrationIntervalDays: {},
  unresolvedAtoms: [],
}

export function evaluate(
  patient: PatientState,
  regimen: Regimen,
  rules: RulesFile | null,
  ctx: RuleContext = {},
): EvaluationResult {
  if (!rules) return { ...EMPTY_EVALUATION }
  try {
    return evaluateRulesImpl(patient, regimen, rules, ctx)
  } catch {
    return { ...EMPTY_EVALUATION }
  }
}

/**
 * Derive the twin. Agent D's pipeline needs patient_model.json; until the data
 * context has it we return a minimal state whose warning travels with it rather
 * than a state vector filled in with guesses.
 */
export function derivePatient(inputs: PatientInputs, model: PatientModelFile | null): PatientState {
  if (model) {
    try {
      return deriveTwin(inputs, model)
    } catch (err) {
      return {
        inputs,
        vars: {},
        appliedPresets: [],
        warnings: [`Twin derivation failed: ${err instanceof Error ? err.message : String(err)}`],
      }
    }
  }
  return {
    inputs,
    vars: {},
    appliedPresets: inputs.comorbidities ?? [],
    warnings: [
      'data/patient_model.json has not loaded — the state vector is empty and comorbidity presets ' +
        'have not been applied to state variables.',
    ],
  }
}

export type { PilSimData, RulesFile, PatientModelFile }
