/**
 * The three demo moments, as data.
 *
 * Each script names the subject, the arms and the chart the moment lands on.
 * None of them assert a conclusion — the arms are enumerated and the ordering
 * is read back from whatever the engine and scorer return.
 */

import type { Regimen } from '../../types'
import { LADDERS, combinationBenchArms, mono } from './presets'

export type DemoId = 'combination' | 'cyp2d6' | 'dose_asymmetry'

export interface DemoScript {
  id: DemoId
  order: 1 | 2 | 3
  title: string
  claim: string
  /** SubjectPreset ids this script needs. */
  subjects: string[]
  horizonHours: number
  initial: 'steady_state' | 'first_dose'
  populationN: number
}

export const DEMOS: DemoScript[] = [
  {
    id: 'combination',
    order: 1,
    title: 'Combination ranking',
    claim:
      'Ten pairs at half dose against five monotherapies at double dose. Whether dual RAAS blockade ' +
      'sinks to the bottom, and whether half-doses of two beat a double dose of one, is emergent — ' +
      'no line of code encodes either answer.',
    subjects: ['healthy_55'],
    horizonHours: 192,
    initial: 'steady_state',
    populationN: 200,
  },
  {
    id: 'cyp2d6',
    order: 2,
    title: 'CYP2D6 metoprolol threshold',
    claim:
      'Two subjects identical except for genotype, same standard dose. β1 selectivity is lost above ' +
      '300 nmol/L = 80.2 ng/mL, so the poor metaboliser crosses a line the normal metaboliser does not. ' +
      'Genotype converts a usable drug into an unsafe one.',
    subjects: ['asthma_copd_nm', 'asthma_copd_pm'],
    horizonHours: 48,
    initial: 'steady_state',
    populationN: 1,
  },
  {
    id: 'dose_asymmetry',
    order: 3,
    title: 'Efficacy–harm asymmetry',
    claim:
      'Amlodipine 5 → 10 mg buys 2.9 mmHg and 7.8 points of oedema incidence (1.8 / 3.0 / 10.8 % at ' +
      '2.5 / 5 / 10 mg against 0.6 % placebo, FDA label). Efficacy rises sub-linearly, visible harm ' +
      'supra-linearly. That is why the product recommends a best dose rather than a maximum.',
    subjects: ['healthy_55'],
    horizonHours: 192,
    initial: 'steady_state',
    populationN: 200,
  },
]

export function combinationArms(): Regimen[] {
  return combinationBenchArms()
}

export const COMBINATION_DENOMINATOR =
  '15 arms — all 10 unordered pairs of the 5 drugs at half the standard dose of each, plus all 5 ' +
  'monotherapies at double the standard dose. One patient, one horizon, steady-state initial conditions.'

export function amlodipineDoseArms(): Regimen[] {
  return LADDERS.amlodipine.ladder.map((mg) => mono('amlodipine', mg))
}

export const AMLODIPINE_DENOMINATOR =
  '3 arms — amlodipine 2.5, 5 and 10 mg once daily, the full licensed ladder, one patient, ' +
  'steady-state initial conditions.'

export function metoprololArm(): Regimen {
  return mono('metoprolol', LADDERS.metoprolol.standard)
}

/** FDA label [P1] — quoted as stated, including the one decimal the label uses. */
export const AMLODIPINE_EDEMA_LABEL_QUOTE =
  'Edema 1.8 (2.5 mg) 3.0 (5 mg) 10.8 (10 mg) 0.6 (placebo)'
export const AMLODIPINE_EDEMA_SOURCE = 'FDA label, amlodipine besylate (openFDA), retrieved 2026-08-17 [P1]'
