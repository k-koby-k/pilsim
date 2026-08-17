/**
 * Five-year prognosis. Spec §6.2 — APPROXIMATED, NEVER INTEGRATED.
 *
 * Integrating five years at one-minute resolution is 2.6 million steps and is
 * scientifically worthless: the model contains no disease progression, no
 * adherence dynamics and no ageing, so all 2.6 million steps would reproduce
 * the steady state already reached in week three. LH-07 asserts the engine does
 * not try.
 *
 * Source: Ettehad D, Emdin CA, et al. Lancet 2016;387:957–967, PMID 26724178.
 */

import { ETTEHAD_RR_PER_10 } from './constants'

export type Endpoint = keyof typeof ETTEHAD_RR_PER_10

export interface PrognosisBand {
  point: number
  lo: number
  hi: number
}

export interface Prognosis {
  deltaSbpSustained: number
  adherence: number
  relativeRisk: Record<Endpoint, PrognosisBand>
  eventsPreventedPer1000: Record<Endpoint, PrognosisBand>
  nnt5y: Record<Endpoint, PrognosisBand>
  /** Mandatory on-screen text — FM-10. */
  extrapolationWarning: string
}

/** RR_endpoint = RR_10 ^ (ΔSBP / 10). Exponential form, asserted by LH-03. */
export function relativeRisk(endpoint: Endpoint, deltaSbp: number): PrognosisBand {
  const r = ETTEHAD_RR_PER_10[endpoint]
  const p = deltaSbp / 10
  return {
    point: Math.pow(r.point, p),
    lo: Math.pow(r.lo, p),
    hi: Math.pow(r.hi, p),
  }
}

/** 10-year → 5-year under a constant-hazard assumption. Label it ESTIMATED. */
export function tenYearToFiveYear(risk10y: number): number {
  return 1 - Math.pow(1 - risk10y, 0.5)
}

export function project5Year(
  deltaSbp: number,
  baselineRisk5y: Partial<Record<Endpoint, number>>,
  adherence = 1.0,
): Prognosis {
  // LH-06: adherence multiplies the sustained reduction, and the report must
  // say the assumption was made.
  const sustained = deltaSbp * adherence
  const rr = {} as Record<Endpoint, PrognosisBand>
  const prevented = {} as Record<Endpoint, PrognosisBand>
  const nnt = {} as Record<Endpoint, PrognosisBand>

  for (const key of Object.keys(ETTEHAD_RR_PER_10) as Endpoint[]) {
    const band = relativeRisk(key, sustained)
    rr[key] = band
    const base = baselineRisk5y[key] ?? 0
    const mk = (x: number) => 1000 * (base - base * x)
    prevented[key] = { point: mk(band.point), lo: mk(band.hi), hi: mk(band.lo) }
    const nntOf = (x: number) => {
      const abs = base - base * x
      return abs > 1e-9 ? 1 / abs : Infinity
    }
    nnt[key] = { point: nntOf(band.point), lo: nntOf(band.lo), hi: nntOf(band.hi) }
  }

  return {
    deltaSbpSustained: sustained,
    adherence,
    relativeRisk: rr,
    eventsPreventedPer1000: prevented,
    nnt5y: nnt,
    extrapolationWarning:
      "Ettehad 2016's relative risks come from randomised-trial populations followed for " +
      'about four years. Applying them to a synthetic individual with user-entered ' +
      'characteristics is a double extrapolation — population to individual, and four ' +
      'years to five. This is reported as a band, never as "your risk is X %".',
  }
}
