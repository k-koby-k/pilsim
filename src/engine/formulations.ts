/**
 * Dosage-form pharmacokinetics. Spec: `DoseSpec.form` (src/types.ts).
 *
 * SOURCE OF TRUTH: `data/substances.json`, field `<substance>.formulations[]`.
 * Mirrored here for the same reason substanceParams.ts mirrors
 * `pk.model_defaults` — the engine stays dependency-free and typechecks
 * without a fetch (see that file's header for the full rationale).
 *
 * Three rules, in order:
 *
 *   1. `form` omitted -> the substance's reference (immediate-release oral)
 *      form. Byte-identical to today's behaviour — no override is applied.
 *   2. `form` given and REAL but pharmacokinetically indistinguishable from
 *      the reference form (no cited f_relative / tmax_h difference) ->
 *      `pkEquivalent: true`, no numeric override. The UI is expected to
 *      surface this ("an oral solution exists and behaves the same") rather
 *      than implying a difference that was never measured.
 *   3. `form` given and `exists_real_world: false` in the data (extended-
 *      release lisinopril, transdermal amlodipine, ...) -> REFUSED. Simulating
 *      a product that does not exist is worse than refusing to run at all;
 *      `resolveForm` throws `UnavailableFormError` rather than returning a
 *      best-guess.
 *
 * Only two substances have a form with a genuinely different, cited PK
 * profile: metoprolol (extended-release succinate, oral solution, IV) and
 * hydrochlorothiazide (capsule). Every other real alternate form of every
 * other substance is cited as numerically identical to its reference form and
 * is therefore `pkEquivalent`.
 */

import type { DrugId } from '../types'
import { SUBSTANCE_PK } from './substanceParams'

export interface FormulationOverride {
  /** matches `formulations[].form` in data/substances.json, for traceability */
  form: string
  existsRealWorld: boolean
  /** relative bioavailability vs the reference (IR) form. Omitted = 1.0 (F unchanged). */
  fRelative?: number
  /** cited Tmax, h, for this form at its own reference dose. Omitted = unchanged from the reference form. */
  tmaxH?: number
  /**
   * Directly-cited absorption rate constant, h^-1 (`formulations[].ka_per_h`
   * in the data — only metoprolol ER carries one). Takes priority over
   * `tmaxH`-derived solving when present, since a cited ka is more
   * authoritative than one back-solved from a Tmax range.
   */
  kaPerH?: number
  /** Directly-cited absorption lag, h (`formulations[].lag_time_h`). Omitted = unchanged from the reference form. */
  lagH?: number
  /**
   * True when the form is real-world but the data carries no PK difference
   * from the reference form (either the cited values match, or no citation
   * exists at all). Set explicitly rather than merely inferred, so the
   * "equivalent" claim is a deliberate statement, not an absence of data
   * read as a difference.
   */
  pkEquivalent?: boolean
}

/**
 * The reference (immediate-release oral) form name and its own cited Tmax per
 * substance — i.e. row zero of each substance's `formulations[]`. Needed
 * because `kaScaleForForm` below computes a form's target Tmax RELATIVE to
 * this reference, not as an absolute value the one-compartment model is
 * re-fit to hit exactly (the model does not exactly reproduce the reference
 * form's own cited Tmax either — see substanceParams.ts — so scaling by the
 * cited RATIO is the honest move, matching how AUC ratios rather than
 * absolute AUC are used everywhere else in this engine).
 */
export const REFERENCE_FORM: Record<DrugId, { form: string; tmaxH: number }> = {
  lisinopril: { form: 'immediate-release tablet', tmaxH: 7.0 },
  losartan: { form: 'immediate-release film-coated tablet', tmaxH: 1.0 },
  exp3174: { form: 'immediate-release film-coated tablet', tmaxH: 1.0 }, // metabolite; form is inherited from losartan, never dosed directly
  amlodipine: { form: 'immediate-release tablet (amlodipine besylate)', tmaxH: 9.0 },
  hydrochlorothiazide: { form: 'immediate-release tablet', tmaxH: 3.5 },
  metoprolol: { form: 'immediate-release tablet (metoprolol tartrate)', tmaxH: 1.75 },
}

export const FORMULATIONS: Record<DrugId, FormulationOverride[]> = {
  lisinopril: [
    { form: 'oral solution', existsRealWorld: true, pkEquivalent: true },
    {
      form: 'fixed-dose combination tablet with hydrochlorothiazide',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 7.0,
      pkEquivalent: true,
    },
    { form: 'extended-release tablet', existsRealWorld: false },
    { form: 'transdermal / sublingual / injectable', existsRealWorld: false },
  ],
  losartan: [
    {
      form: 'oral suspension (extemporaneous, prepared from tablets per label section 2.5)',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 1.0,
      pkEquivalent: true,
    },
    {
      form: 'fixed-dose combination tablet with hydrochlorothiazide',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 1.0,
      pkEquivalent: true,
    },
    { form: 'extended-release tablet', existsRealWorld: false },
    { form: 'intravenous / transdermal / sublingual', existsRealWorld: false },
  ],
  exp3174: [],
  amlodipine: [
    { form: 'oral suspension (amlodipine benzoate)', existsRealWorld: true, pkEquivalent: true },
    { form: 'oral solution (amlodipine)', existsRealWorld: true, pkEquivalent: true },
    {
      form: 'fixed-dose combination tablets',
      existsRealWorld: true,
      tmaxH: 9.0,
      pkEquivalent: true,
    },
    { form: 'extended-release tablet', existsRealWorld: false },
    { form: 'intravenous / transdermal / sublingual', existsRealWorld: false },
  ],
  hydrochlorothiazide: [
    // The genuine difference (spec): tablet Tmax 3.5 h, capsule Tmax 1.5 h.
    { form: 'capsule', existsRealWorld: true, fRelative: 1.0, tmaxH: 1.5, pkEquivalent: false },
    {
      form: 'fixed-dose combination tablet',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 3.5,
      pkEquivalent: true,
    },
    { form: 'extended-release', existsRealWorld: false },
    { form: 'intravenous', existsRealWorld: false },
  ],
  metoprolol: [
    // The genuine differences (spec): ER succinate f_relative 0.77 / Tmax 6.5 h
    // (flatter, later, lower exposure than the IR tablet); oral solution and IV
    // keep the reference bioavailability but peak faster.
    //
    // ka_per_h 0.2 / lag_time_h 0.5 are CITED directly in the data (ESTIMATED
    // by the data team specifically to reproduce the TOPROL-XL label's Cmax
    // ratio of 0.25-0.50 vs IR) and take priority over solving ka from tmaxH.
    {
      form: 'extended-release tablet (metoprolol succinate, multiple-unit pellet system)',
      existsRealWorld: true,
      fRelative: 0.77,
      tmaxH: 6.5,
      kaPerH: 0.2,
      lagH: 0.5,
      pkEquivalent: false,
    },
    {
      form: 'oral solution (metoprolol tartrate)',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 1.0,
      pkEquivalent: false,
    },
    {
      form: 'solution for injection (metoprolol tartrate)',
      existsRealWorld: true,
      fRelative: 1.0,
      tmaxH: 0.33,
      pkEquivalent: false,
    },
    { form: 'transdermal', existsRealWorld: false },
    { form: 'sublingual', existsRealWorld: false },
  ],
}

export interface ResolvedForm {
  /** the matched form string; undefined when `form` was omitted (the reference form applies) */
  form?: string
  existsRealWorld: boolean
  /** true when real-world but modelled identically to the reference form */
  pkEquivalent: boolean
  /** multiplies the substance's reference F. 1 = unchanged. */
  fRelative: number
  /** cited Tmax, h, for this form. undefined = unchanged from the reference form. */
  tmaxH?: number
  /** directly-cited ka, h^-1, when the data has one (only metoprolol ER). Takes priority over tmaxH-derived solving. */
  kaPerH?: number
  /** directly-cited absorption lag, h. undefined = unchanged from the reference form's lag. */
  lagH?: number
}

const DEFAULT_RESOLVED: ResolvedForm = { existsRealWorld: true, pkEquivalent: true, fRelative: 1 }

/**
 * Thrown by `resolveForm` when a requested form is not a real-world product
 * (`exists_real_world: false`, e.g. extended-release lisinopril, transdermal
 * amlodipine) or is not a recognised formulation of the substance at all.
 * Callers (worker.ts, index.ts's in-process runner) already propagate thrown
 * errors as `SimError` / a rejected promise, so this refusal surfaces as a
 * normal engine error — the UI is expected to render `.drugId` / `.form` as a
 * clear "this product does not exist" message rather than a stack trace.
 */
export class UnavailableFormError extends Error {
  readonly drugId: DrugId
  readonly form: string
  constructor(drugId: DrugId, form: string) {
    super(`"${form}" is not a real-world formulation of ${drugId} — refusing to simulate it.`)
    this.name = 'UnavailableFormError'
    this.drugId = drugId
    this.form = form
  }
}

/**
 * Resolve a `DoseSpec.form` string to its PK override, or throw
 * `UnavailableFormError` if the form does not exist in the real world (or is
 * not a recognised formulation at all — an unrecognised string is refused for
 * the same reason: the engine cannot verify it exists, so it must not guess).
 *
 * `form` omitted returns the byte-identical default: today's behaviour is
 * `resolveForm(id, undefined)` with `fRelative: 1`, no Tmax override.
 */
export function resolveForm(id: DrugId, form?: string): ResolvedForm {
  if (!form) return DEFAULT_RESOLVED
  const norm = form.trim().toLowerCase()
  const ref = REFERENCE_FORM[id]
  if (ref && norm === ref.form.toLowerCase()) {
    return { form, existsRealWorld: true, pkEquivalent: true, fRelative: 1 }
  }
  const hit = (FORMULATIONS[id] ?? []).find((f) => f.form.toLowerCase() === norm)
  if (!hit) throw new UnavailableFormError(id, form)
  if (!hit.existsRealWorld) throw new UnavailableFormError(id, form)
  return {
    form: hit.form,
    existsRealWorld: true,
    pkEquivalent:
      hit.pkEquivalent ??
      (hit.fRelative === undefined && hit.tmaxH === undefined && hit.kaPerH === undefined),
    fRelative: hit.fRelative ?? 1,
    tmaxH: hit.tmaxH,
    kaPerH: hit.kaPerH,
    lagH: hit.lagH,
  }
}

export interface FormListing {
  form: string
  isReference: boolean
  existsRealWorld: boolean
  /** only meaningful when existsRealWorld is true */
  pkEquivalent: boolean
}

/**
 * Every form known for `id` — reference plus alternates — WITHOUT throwing,
 * so a UI can build a form picker (and grey out / caption the non-existent
 * ones) without try/catching `resolveForm` per option.
 */
export function listFormsForDrug(id: DrugId): FormListing[] {
  const ref = REFERENCE_FORM[id]
  const out: FormListing[] = ref
    ? [{ form: ref.form, isReference: true, existsRealWorld: true, pkEquivalent: true }]
    : []
  for (const f of FORMULATIONS[id] ?? []) {
    out.push({
      form: f.form,
      isReference: false,
      existsRealWorld: f.existsRealWorld,
      pkEquivalent: f.existsRealWorld
        ? (f.pkEquivalent ?? (f.fRelative === undefined && f.tmaxH === undefined && f.kaPerH === undefined))
        : false,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// ka solving — turning a cited form Tmax into an absorption rate constant.
// ---------------------------------------------------------------------------

const FLIP_FLOP_EPS = 1e-7

/** Bateman single-dose Tmax for the given (ka, ke), lag already excluded. */
function tmaxForKa(ka: number, ke: number): number {
  if (Math.abs(ka - ke) < FLIP_FLOP_EPS) return 1 / ke
  return Math.log(ka / ke) / (ka - ke)
}

/**
 * Solve for the absorption rate constant `ka` (h^-1) that reproduces
 * `targetTmax` given a fixed elimination rate `ke`.
 *
 * `tmaxForKa(ka, ke)` is strictly decreasing in `ka` over (0, inf): it runs
 * from +inf as ka -> 0 (absorption never really finishes) down to 1/ke at
 * ka = ke, and on to 0 as ka -> inf (near-instant absorption). A slow,
 * flip-flop-kinetics form — this is exactly what a multi-particulate
 * extended-release pellet product is — needs ka BELOW ke to reach a Tmax
 * later than 1/ke; that is expected, not a bug. Geometric bisection handles
 * the wide dynamic range cleanly since ka spans orders of magnitude.
 */
export function solveKaForTmax(targetTmax: number, ke: number): number {
  let lo = ke * 1e-8
  let hi = ke * 1e8
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi)
    const t = tmaxForKa(mid, ke)
    if (t > targetTmax) lo = mid
    else hi = mid
  }
  return Math.sqrt(lo * hi)
}

const KA_SCALE_CACHE = new Map<string, number>()

/**
 * Multiplicative scale factor applied to a substance's reference `ka` to
 * reproduce a form's cited Tmax, expressed relative to how well the model
 * already reproduces the REFERENCE form's own cited Tmax (see the block
 * comment above `REFERENCE_FORM`). Returns 1 when the form carries no Tmax
 * override (omitted form, or a pkEquivalent form) — the identity case that
 * keeps default behaviour byte-identical.
 *
 * Cached per (drugId, form): the solve is patient-independent (it runs on the
 * substance's own reference ka/ke, not the covariate-adjusted patient value),
 * same pattern as `apparentVolumeScale` in pk.ts.
 */
export function kaScaleForForm(id: DrugId, resolved: ResolvedForm): number {
  if (resolved.tmaxH === undefined) return 1
  const key = `${id}:${resolved.form}`
  const cached = KA_SCALE_CACHE.get(key)
  if (cached !== undefined) return cached

  const s = SUBSTANCE_PK[id]
  const ke = Math.LN2 / s.half_life_h
  const refLabelTmax = REFERENCE_FORM[id].tmaxH
  const refModelTmax = tmaxForKa(s.ka, ke)
  const targetModelTmax = refModelTmax * (resolved.tmaxH / refLabelTmax)
  const kaForm = solveKaForTmax(targetModelTmax, ke)
  const scale = kaForm / s.ka

  KA_SCALE_CACHE.set(key, scale)
  return scale
}
