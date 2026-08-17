/**
 * Streaming run state.
 *
 * Frames arrive continuously during a run and the streaming itself is part of
 * the demo, so frames land in a ref (cheap, unbounded) and a rAF tick drives
 * re-render. Re-rendering per frame would make the run look janky at exactly
 * the moment we want it to look alive.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EffectFrame, PatientState, Regimen, RunSummary, SimRequest } from '../../types'
import { getEngineBinding, runSimulation, type EngineBinding, type EvaluationResult } from './adapters'

export interface CompletedRun {
  id: string
  label: string
  regimen: Regimen
  patient: PatientState
  modifiers: EvaluationResult | null
  frames: EffectFrame[]
  summary: RunSummary
  initial: 'steady_state' | 'first_dose'
  horizonHours: number
  populationN: number
  synthetic: boolean
  at: number
}

export interface RunnerState {
  running: boolean
  frames: EffectFrame[]
  latest: EffectFrame | null
  summary: RunSummary | null
  error: string | null
  progress: number
  binding: EngineBinding | null
}

let runCounter = 0
export function nextRunId(prefix = 'run'): string {
  runCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${runCounter}`
}

export function useSimRunner() {
  const framesRef = useRef<EffectFrame[]>([])
  const cancelRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  const [state, setState] = useState<RunnerState>({
    running: false,
    frames: [],
    latest: null,
    summary: null,
    error: null,
    progress: 0,
    binding: null,
  })

  useEffect(() => {
    return () => {
      cancelRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const schedulePaint = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setTick((t) => t + 1)
    })
  }, [])

  const cancel = useCallback(() => {
    cancelRef.current = null
    setState((s) => ({ ...s, running: false }))
  }, [])

  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null)

  const run = useCallback(
    async (req: SimRequest, label: string, modifiers: EvaluationResult | null = null): Promise<CompletedRun | null> => {
      setEvaluation(modifiers)
      framesRef.current = []
      cancelRef.current = req.runId
      setState({
        running: true,
        frames: [],
        latest: null,
        summary: null,
        error: null,
        progress: 0,
        binding: getEngineBinding(),
      })

      let summary: RunSummary | null = null
      let error: string | null = null
      const horizon = req.options.horizonHours || 1

      await runSimulation(req, (r) => {
        if (cancelRef.current !== req.runId) return
        if (r.kind === 'frame') {
          framesRef.current.push(r.frame)
          schedulePaint()
          const p = Math.min(1, r.frame.t_h / horizon)
          setState((s) =>
            p - s.progress > 0.02 || p >= 1
              ? { ...s, progress: p, latest: r.frame, binding: getEngineBinding() }
              : { ...s, latest: r.frame },
          )
        } else if (r.kind === 'done') {
          summary = r.summary
        } else {
          error = r.message
        }
      })

      if (cancelRef.current !== req.runId) return null
      cancelRef.current = null

      const frames = framesRef.current.slice()
      const binding = getEngineBinding()
      setState({
        running: false,
        frames,
        latest: frames[frames.length - 1] ?? null,
        summary,
        error,
        progress: 1,
        binding,
      })

      if (!summary || error) return null
      return {
        id: req.runId,
        label,
        regimen: req.regimen,
        patient: req.patient,
        modifiers,
        frames,
        summary,
        initial: req.options.initial,
        horizonHours: req.options.horizonHours,
        populationN: req.options.populationN ?? 1,
        synthetic: !!binding?.synthetic,
        at: Date.now(),
      }
    },
    [schedulePaint],
  )

  // The ref holds the authoritative frame list while a run is in flight; the
  // tick above is what makes it visible.
  const liveFrames = state.running ? framesRef.current : state.frames

  return {
    ...state,
    frames: liveFrames,
    latest: liveFrames.length ? liveFrames[liveFrames.length - 1] : state.latest,
    evaluation,
    run,
    cancel,
  }
}
