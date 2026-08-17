/**
 * Adapter over the twin derivation.
 *
 * `src/rules/twin.ts` (Agent RUL) is authoritative and is used whenever the patient model
 * file has loaded. The local fallback in `twinFallback.ts` covers the one case the page has
 * to survive: the model file not being available, in which case the page says so rather
 * than showing plausible-looking invented numbers.
 *
 * The page always displays WHICH derivation produced what is on screen. A twin that
 * silently swaps its own physics is exactly the black box this page exists to avoid.
 */

import { useMemo } from 'react'
import type { PatientInputs, PatientState } from '../../types'
import { deriveTwin, type Twin } from '../../rules/twin'
import type { PatientModelFile } from './patientModel'
import { CATEGORICAL, deriveTwinFallback } from './twinFallback'

export type TwinSource = 'rules/twin.ts' | 'page fallback'

export interface TwinResult {
  state: PatientState
  source: TwinSource
  /** ckd_stage, cyp2d6_phenotype, cyp2c9_phenotype. */
  categoricals: Record<string, string>
  /** Every value in `vars` that a preset modifier moved, when the real twin is in use. */
  presetEffects: Twin['presetEffects']
}

/**
 * The derivation itself, without the hook wrapper.
 *
 * The card library derives a twin for every subject in one pass, which cannot be done with
 * a hook, so the logic lives here and `useTwin` is a thin memo over it. One derivation path,
 * used by both — a library card must never disagree with the editor it opens.
 */
export function deriveTwinSafe(inputs: PatientInputs, model: PatientModelFile | null): TwinResult {
  if (model) {
    try {
      const twin = deriveTwin(inputs, model)
      return {
        state: twin,
        source: 'rules/twin.ts',
        categoricals: twin.categoricals ?? {},
        presetEffects: twin.presetEffects ?? [],
      }
    } catch (e) {
      const state = deriveTwinFallback(inputs, null)
      return {
        state: {
          ...state,
          warnings: [
            ...state.warnings,
            `rules/twin.ts threw (${e instanceof Error ? e.message : String(e)}); the page fallback derivation was used.`,
          ],
        },
        source: 'page fallback',
        categoricals: { ...CATEGORICAL },
        presetEffects: [],
      }
    }
  }
  const state = deriveTwinFallback(inputs, null)
  return { state, source: 'page fallback', categoricals: { ...CATEGORICAL }, presetEffects: [] }
}

export function useTwin(inputs: PatientInputs, model: PatientModelFile | null): TwinResult {
  return useMemo<TwinResult>(() => deriveTwinSafe(inputs, model), [inputs, model])
}
