/**
 * Top-N dose combination search — "the 5 most efficient dosage combinations."
 *
 * Enumerates monotherapy at every licensed strength and every UNORDERED pair
 * of two different dosable drugs at every combination of their own licensed
 * strengths (full cross-product within a pair; a pair in the opposite order
 * is the same candidate and appears once), scores each candidate, and returns
 * the best N (default 5).
 *
 * Scored with the analytic `combinationRule()` (combination.ts) — NEVER the
 * ODE. combinationRule is steady-state and dose-based, costs ~10 µs per
 * regimen, and is the only thing spec §6.1b(a) / validation PK-13c allow to
 * produce a ranked recommendation. ~192 candidates for the shipped five-drug
 * set (21 monotherapy + 171 pairs) is milliseconds of arithmetic; this module
 * stays fully synchronous and must not become an ODE-per-candidate loop.
 *
 * Two things this module deliberately does NOT decide, both load-bearing:
 *
 *  1. What "best" means. "Efficient" is benefit weighed against adverse
 *     burden, NOT the largest blood-pressure drop — ranking on efficacy alone
 *     puts every drug at its ceiling dose, which this product has already
 *     established is the wrong answer (see `defaultOptimiseScore` below for
 *     the built-in fallback). The real objective (weights, safety floor,
 *     tiering) lives in src/report/score.ts, which this module does not own.
 *     `findTopCombinations` therefore takes a `score` callback; pass one
 *     built on the real scorer to rank by the product's actual objective
 *     instead of the built-in default.
 *
 *  2. Which combinations are disqualified. Dual-RAAS pairs (e.g. lisinopril +
 *     losartan) must still APPEAR in the output and rank wherever the
 *     arithmetic puts them — the product's value is DISCOVERING that dual
 *     RAAS blockade is a bad combination, not being told about it in advance.
 *     `findTopCombinations` takes a `filter` callback for hard exclusions
 *     (e.g. a rank-7 block from src/rules/**, which this module does not
 *     own). The default filter keeps every candidate, dual-RAAS included.
 */

import type { DrugId, Regimen, DoseSpec } from '../types'
import { DOSABLE_DRUGS } from './constants'
import {
  combinationRule,
  regimenAdverseBurden,
  type CombinationOptions,
  type CombinationResult,
  type CombinationSubject,
} from './combination'

/**
 * Licensed strengths, mg, for the reference (immediate-release oral tablet)
 * form of each dosable drug.
 *
 * SOURCE OF TRUTH: data/substances.json `<substance>.formulations[0].strengths_mg`
 * — row zero of each substance's formulations array is its reference tablet
 * form (see formulations.ts `REFERENCE_FORM`) — mirrored here for the same
 * dependency-free reason substanceParams.ts mirrors the rest of the substance
 * data. These are exactly the rows data/products.json `available_strengths`
 * carries for the five single-ingredient tablet products, so both cited
 * sources agree.
 *
 * Deliberately excludes non-tablet strength fields that are concentrations
 * rather than discrete dose strengths (e.g. the lisinopril oral solution's
 * "1.0" means 1 mg/mL, not a 1 mg licensed strength) and the metoprolol ER
 * succinate strengths (25/50/100/200 mg) — a *strength* search, not a *form*
 * search; see `DoseSpec.form` / formulations.ts for dosage form instead.
 */
export const LICENSED_STRENGTHS_MG: Record<DrugId, number[]> = {
  lisinopril: [2.5, 5, 10, 20, 30, 40],
  losartan: [25, 50, 100],
  exp3174: [], // metabolite, never dosed directly
  amlodipine: [2.5, 5, 10],
  hydrochlorothiazide: [12.5, 25, 50],
  metoprolol: [12.5, 25, 37.5, 50, 75, 100],
}

export interface OptimiseCandidate {
  regimen: Regimen
  result: CombinationResult
  /** regimenAdverseBurden(regimen) — sum of per-drug adverse-symptom prevalence at this dose */
  adverseBurden: number
}

export interface EnumerateOptions {
  /** which drugs to search. Default: every dosable drug (DOSABLE_DRUGS). */
  drugs?: DrugId[]
  /** override the licensed-strength list for one or more drugs. Default: LICENSED_STRENGTHS_MG. */
  strengths?: Partial<Record<DrugId, number[]>>
  /** Default true. */
  includeMonotherapy?: boolean
  /** Default true. */
  includePairs?: boolean
}

/**
 * Enumerate the candidate regimens: pure, deterministic, no scoring. Every
 * regimen doses once daily (`perDay: 1`) at a licensed strength — consistent
 * with how combination.ts's own `allPairs`/`monotherapyEffect` express a dose,
 * since `combinationRule` only reads the total daily mg (`mg * perDay`).
 */
export function enumerateCandidateRegimens(opts: EnumerateOptions = {}): Regimen[] {
  const drugs = opts.drugs ?? DOSABLE_DRUGS
  const strengthsFor = (id: DrugId): number[] => opts.strengths?.[id] ?? LICENSED_STRENGTHS_MG[id] ?? []
  const dose = (id: DrugId, mg: number): DoseSpec => ({ substanceId: id, mg, perDay: 1 })

  const out: Regimen[] = []

  if (opts.includeMonotherapy ?? true) {
    for (const id of drugs) {
      for (const mg of strengthsFor(id)) {
        out.push({ id: `mono:${id}@${mg}`, label: `${id} ${mg} mg`, doses: [dose(id, mg)] })
      }
    }
  }

  if (opts.includePairs ?? true) {
    for (let i = 0; i < drugs.length; i++) {
      for (let j = i + 1; j < drugs.length; j++) {
        const a = drugs[i]
        const b = drugs[j]
        for (const mgA of strengthsFor(a)) {
          for (const mgB of strengthsFor(b)) {
            out.push({
              id: `pair:${a}@${mgA}+${b}@${mgB}`,
              label: `${a} ${mgA} mg + ${b} ${mgB} mg`,
              doses: [dose(a, mgA), dose(b, mgB)],
            })
          }
        }
      }
    }
  }

  return out
}

/**
 * Evaluate a set of regimens with the analytic combination rule. Cheap
 * (~10 µs per regimen), synchronous, no ODE — see the module header.
 */
export function evaluateCandidates(
  regimens: Regimen[],
  subject: CombinationSubject,
  opts: CombinationOptions = {},
): OptimiseCandidate[] {
  return regimens.map((regimen) => ({
    regimen,
    result: combinationRule(regimen, subject, opts),
    adverseBurden: regimenAdverseBurden(regimen),
  }))
}

export type OptimiseScoreFn = (candidate: OptimiseCandidate) => number
/** Return false to drop a candidate from the ranked output entirely (hard exclusion, e.g. a rules-engine block). */
export type OptimiseFilterFn = (candidate: OptimiseCandidate) => boolean

/**
 * Built-in default scorer, used only when `findTopCombinations` is not given
 * one: efficacy (ΔSBP) weighed against adverse burden on a comparable
 * mmHg-equivalent scale (same shape as combination.ts's `rankRegimens` with a
 * nonzero `safetyWeight`). This exists so the search works with zero
 * configuration and does not degenerate into "rank by ΔSBP alone" (which
 * would put every candidate at its maximum licensed strength). It is NOT the
 * product's real objective function — that is src/report/score.ts, which
 * this module does not own. Pass a `score` callback built on it for the real
 * ranking.
 */
export function defaultOptimiseScore(c: OptimiseCandidate): number {
  return c.result.dsbp - 100 * c.adverseBurden
}

export interface FindTopCombinationsOptions extends CombinationOptions, EnumerateOptions {
  /** how many to return, best first. Default 5. */
  n?: number
  /** Efficacy-vs-burden scoring, higher = better. Default: defaultOptimiseScore. */
  score?: OptimiseScoreFn
  /**
   * Hard-exclusion predicate. Return false to drop a candidate entirely —
   * e.g. wire this to a rank-7 (absolute contraindication) block from
   * src/rules/**. Default keeps every candidate: in particular, dual-RAAS
   * pairs are NOT filtered out by default, because the point of this feature
   * is discovering that they rank badly, not hiding them from view.
   */
  filter?: OptimiseFilterFn
}

export interface RankedOptimiseCandidate extends OptimiseCandidate {
  score: number
  /** 1-based, best first */
  rank: number
}

/**
 * The top-N dose combination search. Enumerate -> evaluate -> filter -> score
 * -> sort -> take the best `n` (default 5).
 *
 * UI / report usage — bind the two callbacks to the modules that actually own
 * scoring and blocking:
 *
 *   const top5 = findTopCombinations(subject, {
 *     score:  (c) => realScoreFromReportScoreTs(c.regimen, c.result, c.adverseBurden),
 *     filter: (c) => !evaluateRules(c.regimen, ctx).blocked, // src/rules/**
 *   })
 *
 * With no options this still returns a sensible, zero-config top 5 using
 * `defaultOptimiseScore` and no filtering.
 */
export function findTopCombinations(
  subject: CombinationSubject,
  opts: FindTopCombinationsOptions = {},
): RankedOptimiseCandidate[] {
  const n = opts.n ?? 5
  const score = opts.score ?? defaultOptimiseScore
  const filter = opts.filter ?? (() => true)

  const regimens = enumerateCandidateRegimens(opts)
  const evaluated = evaluateCandidates(regimens, subject, opts)

  return evaluated
    .filter(filter)
    .map((c) => ({ ...c, score: score(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((c, i) => ({ ...c, rank: i + 1 }))
}
