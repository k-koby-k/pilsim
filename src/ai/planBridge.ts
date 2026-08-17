/**
 * Optional binding to the deterministic treatment plan.
 *
 * `src/report/plan.ts` is owned by another agent and does not exist yet. This
 * module binds to it the way `src/ui/simulation/adapters.ts` binds to the
 * engine — an `import.meta.glob` over an EXACT filename, so the build succeeds
 * whether or not the file is there, and starts using it the moment it lands
 * with no edit here.
 *
 * The plan is treated as an opaque object. Nothing downstream knows a field of
 * it by name (see serialize.ts), so this bridge does not need to either: it
 * finds a builder, calls it, and hands back whatever comes out. If the shape
 * turns out to be something else entirely, the serializer still renders it and
 * the number boundary still holds.
 */

import type { PatientState, Regimen } from '../types'
import type { EvaluationResult } from '../rules/evaluate'

const planGlob = import.meta.glob('../report/plan.ts')

/** Names to try, in order. Widened deliberately — a miss costs the plan section. */
const BUILDER_NAMES = [
  'buildTreatmentPlan',
  'buildPlan',
  'treatmentPlan',
  'makeTreatmentPlan',
  'makePlan',
  'planFor',
  'createPlan',
  'plan',
  'default',
]

export interface PlanRequest {
  patient: PatientState
  evaluation: EvaluationResult | null
  regimen?: Regimen | null
  /** Anything else the builder might want. Passed through untouched. */
  [k: string]: unknown
}

export interface PlanBinding {
  available: boolean
  /** `src/report/plan.ts#buildTreatmentPlan`, for the panel's provenance line. */
  from?: string
  note?: string
}

let cached: { fn: (arg: unknown) => unknown; from: string } | null | undefined

async function resolveBuilder() {
  if (cached !== undefined) return cached
  for (const path of Object.keys(planGlob)) {
    try {
      const mod = (await planGlob[path]()) as Record<string, unknown>
      for (const name of BUILDER_NAMES) {
        if (typeof mod?.[name] === 'function') {
          cached = {
            fn: mod[name] as (arg: unknown) => unknown,
            from: `${path.replace(/^\.\.\//, 'src/')}#${name}`,
          }
          return cached
        }
      }
    } catch {
      /* the module is mid-write by its owner; try again next call */
      cached = undefined
      return null
    }
  }
  cached = null
  return cached
}

export async function planBinding(): Promise<PlanBinding> {
  const b = await resolveBuilder()
  return b
    ? { available: true, from: b.from }
    : {
        available: false,
        note: 'src/report/plan.ts has not landed yet — the AI is explaining the run and the ranking instead.',
      }
}

/**
 * Build a plan, or return null.
 *
 * Two call shapes are tried because the builder's signature is not settled: a
 * single options object first, then positional arguments. A throw from the
 * builder is swallowed — a half-finished plan module must not be able to take
 * the simulation page down.
 */
export async function buildPlanIfAvailable(req: PlanRequest): Promise<unknown | null> {
  const b = await resolveBuilder()
  if (!b) return null
  const attempts: (() => unknown)[] = [
    () => b.fn(req),
    () => (b.fn as unknown as (...a: unknown[]) => unknown)(req.patient, req.evaluation, req.regimen),
    () => (b.fn as unknown as (...a: unknown[]) => unknown)(req.patient, req.regimen, req.evaluation),
  ]
  for (const attempt of attempts) {
    try {
      const out = attempt()
      const settled = out instanceof Promise ? await out : out
      if (settled && typeof settled === 'object') return settled
    } catch {
      /* wrong shape — try the next */
    }
  }
  return null
}
