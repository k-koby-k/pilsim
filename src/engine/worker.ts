/**
 * Web Worker entry point for the simulation engine.
 *
 * Per research/09-EXECUTION-TARGET-AMENDMENT.md this REPLACES the Durable
 * Object execution plan in 03-SIMULATION-SPEC.md §8. There is no alarm-based
 * chunked continuation and no WebSocket hibernation here — those existed only
 * to work around the Workers 10 ms CPU ceiling, which does not exist on the
 * user's own machine. The model, equations, combination rule, numerics and
 * constants from that spec are unchanged and remain authoritative.
 *
 * Protocol: receive `SimRequest`, post `SimProgress` frames, then `SimDone`.
 * On failure post `SimError`. Must be a module worker (`worker: {format:'es'}`).
 */

import type { SimRequest, SimResponse, EffectFrame } from '../types'
import { runSimulationSync } from './run'

/**
 * One `SimProgress` per emitted frame, exactly as src/types.ts defines it.
 *
 * Spec §8.6 warns against flooding the UI with frames, but that constraint was
 * written for a server streaming over a WebSocket in real time. Here the whole
 * run finishes in ~100 ms and the frame count is bounded by `outputEveryMin`
 * (864 frames for a 72 h run at 5-minute output). Batching would mean inventing
 * a message shape the frozen contract does not contain, which is a worse trade
 * than a few hundred structured-clone calls. Pace the ANIMATION on the main
 * thread, where the frame budget actually lives.
 */
function post(msg: SimResponse) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)
}

function handle(req: SimRequest) {
  try {
    const { summary } = runSimulationSync(req, (frame: EffectFrame) => {
      post({ kind: 'frame', runId: req.runId, frame })
    })
    post({ kind: 'done', runId: req.runId, summary })
  } catch (err) {
    post({
      kind: 'error',
      runId: req.runId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

self.addEventListener('message', (ev: MessageEvent) => {
  const data = ev.data as SimRequest | undefined
  if (!data || data.kind !== 'run') return
  handle(data)
})

export {}
