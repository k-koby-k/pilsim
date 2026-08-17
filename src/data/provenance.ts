/**
 * Reading `Measured` values without losing their provenance.
 *
 * Every numeric pharmacological value in the data files is wrapped as
 * `{ value, unit, range, cv_percent, n, distribution, provenance }`. The whole point of
 * that wrapper is that the UI can always answer "where did this number come from?".
 * These helpers make that cheap, and — importantly — they never substitute a default
 * for a missing value. `NOT_FOUND` stays `NOT_FOUND` all the way to the screen.
 *
 * Owned by Agent RUL.
 */

import type { Measured, Provenance, ProvenanceStatus, SourceTier } from '../types'

/** Anything shaped like a `Measured`. Data files are typed loosely in places. */
export function isMeasured(v: unknown): v is Measured {
  return (
    typeof v === 'object' &&
    v !== null &&
    'value' in v &&
    'provenance' in v &&
    typeof (v as Measured).provenance === 'object'
  )
}

/** The number, or `null` when the source could not supply one. Never a silent 0. */
export function value(m: Measured | null | undefined): number | null {
  if (!m || typeof m.value !== 'number' || !Number.isFinite(m.value)) return null
  return m.value
}

/**
 * The number, or an explicit fallback. Use ONLY where the caller has decided what an
 * absent value means and can defend it; prefer `value()` plus a branch elsewhere.
 */
export function valueOr(m: Measured | null | undefined, fallback: number): number {
  return value(m) ?? fallback
}

export function unit(m: Measured | null | undefined): string | null {
  return m?.unit ?? null
}

export function range(m: Measured | null | undefined): [number, number] | null {
  const r = m?.range
  return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : null
}

export function status(m: Measured | null | undefined): ProvenanceStatus {
  return m?.provenance?.status ?? 'NOT_FOUND'
}

export function isCited(m: Measured | null | undefined): boolean {
  return status(m) === 'CITED'
}
export function isEstimated(m: Measured | null | undefined): boolean {
  return status(m) === 'ESTIMATED'
}
export function isNotFound(m: Measured | null | undefined): boolean {
  return status(m) === 'NOT_FOUND'
}

export function provenance(m: Measured | null | undefined): Provenance {
  return m?.provenance ?? { status: 'NOT_FOUND', note: 'No provenance object on this field.' }
}

export function tier(m: Measured | null | undefined): SourceTier | null {
  return m?.provenance?.tier ?? null
}

export const TIER_LABEL: Record<SourceTier, string> = {
  1: 'Regulatory labeling',
  2: 'Peer-reviewed study',
  3: 'Chemical/drug database',
  4: 'Secondary summary',
}

export const STATUS_LABEL: Record<ProvenanceStatus, string> = {
  CITED: 'Cited',
  ESTIMATED: 'Estimated',
  NOT_FOUND: 'Not found',
}

/** UI hint. Keep the three states visually distinct; do not collapse them. */
export const STATUS_TONE: Record<ProvenanceStatus, 'good' | 'warn' | 'absent'> = {
  CITED: 'good',
  ESTIMATED: 'warn',
  NOT_FOUND: 'absent',
}

/**
 * One line of attribution, ready to render. Never returns an empty string — an
 * unsourced number must still say so out loud.
 */
export function citation(m: Measured | null | undefined): string {
  const p = provenance(m)
  switch (p.status) {
    case 'CITED':
      return p.source ? `${p.source}${p.retrieved ? ` (retrieved ${p.retrieved})` : ''}` : 'Cited — source string missing.'
    case 'ESTIMATED':
      return `ESTIMATED — ${p.note ?? 'no justification recorded.'}`
    case 'NOT_FOUND':
    default:
      return `NOT FOUND — ${p.note ?? 'searched, no source located.'}`
  }
}

/** The source's own words, where we have them. Hover text, tooltips, audit panels. */
export function quote(m: Measured | null | undefined): string | null {
  return provenance(m).quote ?? null
}

export function sourceUrl(m: Measured | null | undefined): string | null {
  return provenance(m).url ?? null
}

/**
 * Format for display, honouring the report spec's precision discipline: ranges stay
 * ranges, absent stays absent. `digits` applies to the point value only.
 */
export function format(m: Measured | null | undefined, digits = 2): string {
  const v = value(m)
  if (v === null) return '—'
  const u = m?.unit ? ` ${m.unit}` : ''
  const r = range(m)
  const point = trimNumber(v, digits)
  if (r && (r[0] !== v || r[1] !== v)) {
    return `${point}${u} (${trimNumber(r[0], digits)}–${trimNumber(r[1], digits)})`
  }
  return `${point}${u}`
}

function trimNumber(n: number, digits: number): string {
  const s = n.toFixed(digits)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** Everything the UI needs to render one value plus its provenance chip. */
export interface MeasuredView {
  value: number | null
  unit: string | null
  range: [number, number] | null
  cvPercent: number | null
  n: number | null
  status: ProvenanceStatus
  statusLabel: string
  tone: 'good' | 'warn' | 'absent'
  tier: SourceTier | null
  tierLabel: string | null
  citation: string
  quote: string | null
  url: string | null
  display: string
  provenance: Provenance
}

export function view(m: Measured | null | undefined, digits = 2): MeasuredView {
  const st = status(m)
  const t = tier(m)
  return {
    value: value(m),
    unit: unit(m),
    range: range(m),
    cvPercent: m?.cv_percent ?? null,
    n: m?.n ?? null,
    status: st,
    statusLabel: STATUS_LABEL[st],
    tone: STATUS_TONE[st],
    tier: t,
    tierLabel: t ? TIER_LABEL[t] : null,
    citation: citation(m),
    quote: quote(m),
    url: sourceUrl(m),
    display: format(m, digits),
    provenance: provenance(m),
  }
}

/** Walk a record of Measured-ish fields and pick out the ones we could not source. */
export function notFoundFields(obj: Record<string, unknown>): string[] {
  return Object.entries(obj)
    .filter(([, v]) => isMeasured(v) && v.provenance.status === 'NOT_FOUND')
    .map(([k]) => k)
}

/** Counts for a "how sourced is this record?" badge. */
export function provenanceSummary(obj: Record<string, unknown>): {
  cited: number
  estimated: number
  notFound: number
  total: number
} {
  let cited = 0
  let estimated = 0
  let notFound = 0
  for (const v of Object.values(obj)) {
    if (!isMeasured(v)) continue
    if (v.provenance.status === 'CITED') cited++
    else if (v.provenance.status === 'ESTIMATED') estimated++
    else notFound++
  }
  return { cited, estimated, notFound, total: cited + estimated + notFound }
}

/** Rule `evidence[]` entries are shaped like a Provenance without the status field. */
export function evidenceToProvenance(e: {
  source: string
  url?: string
  quote?: string
  retrieved?: string
  type?: string
  note?: string
}): Provenance {
  return {
    status: 'CITED',
    source: e.source,
    url: e.url,
    quote: e.quote,
    retrieved: e.retrieved,
    tier: e.type === 'regulatory_label' ? 1 : 2,
    note: e.note,
  }
}
