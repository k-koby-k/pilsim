/**
 * Benches — many arms, one comparison set.
 *
 * §1 honesty constraint 1: "best" is always relative to a stated comparison
 * set, and the report must print the denominator. Every bench carries the arm
 * list it searched so the UI can print it.
 *
 * §1 honesty constraint 2: a recommendation with no runner-up is suppressed.
 * `singleArm` carries that case.
 *
 * Re-scoring after a slider move does NOT re-simulate. The summaries and rule
 * evaluations are kept, so moving a weight re-ranks instantly — which is the
 * entire point of exposing the weights.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PatientState, Regimen, RunSummary, ScoreWeights } from '../../types'
import type { PilSimData } from '../../data/load'
import { evaluate, lastRunWasSynthetic, runSimulationQuiet, type EvaluationResult } from './adapters'
import { effectTroughToPeak, rank, type ScoredOption } from './scoring'
import { nextRunId } from './useSimRunner'
import { useLang, useT } from '../../i18n'

export interface BenchArmResult {
  regimen: Regimen
  summary: RunSummary
  modifiers: EvaluationResult
  troughToPeakRatio?: number
  peakMetoprolol: number
  edemaP: number
}

export interface BenchOptions {
  horizonHours: number
  outputEveryMin: number
  initial: 'steady_state' | 'first_dose'
  populationN: number
}

export interface BenchState {
  running: boolean
  progress: number
  arms: BenchArmResult[]
  ranked: ScoredOption[] | null
  scoringError?: string
  error: string | null
  denominator: string
  singleArm: boolean
  synthetic: boolean
  done: boolean
  populationN: number
}

const EMPTY: BenchState = {
  running: false,
  progress: 0,
  arms: [],
  ranked: null,
  error: null,
  denominator: '',
  singleArm: false,
  synthetic: false,
  done: false,
  populationN: 1,
}

export function useBench() {
  const [state, setState] = useState<BenchState>(EMPTY)
  const armsRef = useRef<BenchArmResult[]>([])
  const patientRef = useRef<PatientState | null>(null)
  const dataRef = useRef<PilSimData | null>(null)
  const popRef = useRef(1)
  // The scorer writes its reason lines and refusals as sentences, and those go on
  // screen, so it is handed this hook's `t`. Kept in a ref because `run` and
  // `rescore` are stable callbacks, and re-ranked below when the language changes —
  // re-scoring is pure arithmetic over the arms already simulated, so a language
  // switch never re-runs the engine.
  const t = useT()
  const lang = useLang()
  const tRef = useRef(t)
  tRef.current = t
  const weightsRef = useRef<ScoreWeights | null>(null)

  const run = useCallback(
    async (
      regimens: Regimen[],
      patient: PatientState,
      weights: ScoreWeights,
      opts: BenchOptions,
      denominator: string,
      data: PilSimData | null,
    ) => {
      armsRef.current = []
      patientRef.current = patient
      dataRef.current = data
      popRef.current = opts.populationN
      weightsRef.current = weights
      setState({
        ...EMPTY,
        running: true,
        denominator,
        singleArm: regimens.length < 2,
        populationN: opts.populationN,
      })

      const baselineMap = patient.inputs.dbp_mmHg + (patient.inputs.sbp_mmHg - patient.inputs.dbp_mmHg) / 3
      const arms: BenchArmResult[] = []

      for (let i = 0; i < regimens.length; i++) {
        const regimen = regimens[i]
        const modifiers = evaluate(patient, regimen, data?.rules ?? null)
        const { frames, summary, error } = await runSimulationQuiet({
          kind: 'run',
          runId: nextRunId('bench'),
          patient,
          regimen,
          modifiers,
          options: { ...opts },
        })
        if (error) {
          setState((s) => ({ ...s, running: false, error, done: true }))
          return
        }
        if (summary) {
          arms.push({
            regimen,
            summary,
            modifiers,
            troughToPeakRatio: effectTroughToPeak(frames, baselineMap),
            peakMetoprolol: summary.peakConc.metoprolol ?? 0,
            edemaP: summary.hazards.peripheral_edema ?? 0,
          })
        }
        setState((s) => ({ ...s, progress: (i + 1) / regimens.length, arms: arms.slice() }))
        // Yield so the progress bar paints between arms.
        await new Promise((r) => setTimeout(r, 0))
      }

      armsRef.current = arms
      const { ranked, error: scoringError } = rank(
        patient,
        arms.map((a) => ({ ...a, populationN: opts.populationN })),
        weights,
        data,
        tRef.current,
      )

      setState({
        running: false,
        progress: 1,
        arms,
        ranked,
        scoringError,
        error: null,
        denominator,
        singleArm: regimens.length < 2,
        synthetic: lastRunWasSynthetic(),
        done: true,
        populationN: opts.populationN,
      })
    },
    [],
  )

  /** Re-rank the arms already simulated, under new weights. No re-simulation. */
  const rescore = useCallback((weights: ScoreWeights) => {
    const arms = armsRef.current
    const patient = patientRef.current
    if (!arms.length || !patient) return
    weightsRef.current = weights
    const { ranked, error } = rank(
      patient,
      arms.map((a) => ({ ...a, populationN: popRef.current })),
      weights,
      dataRef.current,
      tRef.current,
    )
    setState((s) => ({ ...s, ranked, scoringError: error }))
  }, [])

  // A ranking already on screen was written in the language it was scored in, so a
  // language switch re-scores it. Same arms, same weights, same numbers — only the
  // sentences change.
  useEffect(() => {
    if (armsRef.current.length && patientRef.current && weightsRef.current) rescore(weightsRef.current)
  }, [lang, rescore])

  const reset = useCallback(() => {
    armsRef.current = []
    patientRef.current = null
    setState(EMPTY)
  }, [])

  return { ...state, run, rescore, reset }
}
