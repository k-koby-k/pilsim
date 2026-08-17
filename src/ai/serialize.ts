/**
 * Structure -> labelled prose, generically.
 *
 * The treatment plan (`src/report/plan.ts`) is owned by another agent and is
 * still moving. Hard-coding its field names here would mean this module breaks
 * every time that one grows a field, and — worse — would quietly stop sending
 * the model the parts of the plan it does not know about, so the reasoning
 * would drift out of step with what the doctor is reading.
 *
 * So nothing here knows a plan field by name. It walks whatever object it is
 * given, humanizes the keys, infers units from them, recognises the two shapes
 * that recur across this codebase (`Measured` and `Provenance`), and emits
 * flat labelled lines. Every number it renders is registered as a NumberFact at
 * the same moment, which is what keeps the validation boundary exactly as wide
 * as the context and not one number wider.
 */

import { canonicalUnit, type CanonicalUnit } from './units'
import type { NumberFact } from './numbers'

export interface Described {
  lines: string[]
  facts: NumberFact[]
}

export interface DescribeOptions {
  /** Prefix for every label, e.g. "plan". */
  path?: string
  maxDepth?: number
  maxItems?: number
  maxLines?: number
  maxStringLength?: number
  /** Keys to skip wholesale — noisy internals nobody needs to reason about. */
  skipKeys?: string[]
  source?: string
}

const DEFAULTS: Required<Omit<DescribeOptions, 'path' | 'source'>> = {
  maxDepth: 5,
  maxItems: 10,
  maxLines: 260,
  maxStringLength: 400,
  skipKeys: ['__proto__', 'frames', 'trace', 'raw', 'debug'],
}

/** camelCase / snake_case / kebab -> spaced words. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Pull a unit out of a field name.
 *
 * `startDoseMg` is a dose in mg and `time_to_target_days` is in days; the name
 * is the only place that information exists once the value is a bare number, so
 * losing it here would turn a strong unit-checked fact into a weak bare one.
 */
export function unitFromKey(key: string): { unit: CanonicalUnit | null; label: string } {
  const words = humanizeKey(key).split(' ').filter(Boolean)
  if (!words.length) return { unit: null, label: humanizeKey(key) }

  // `hr` is the one genuinely ambiguous suffix: in a UNIT it means hours, in a
  // FIELD NAME it means heart rate. Field names win here, so `restingHr` is not
  // silently recorded as a duration.
  if (/^(hr|bpm|pulse)$/.test(words[words.length - 1])) {
    return { unit: 'bpm', label: words.slice(0, -1).join(' ') || words.join(' ') }
  }

  for (const take of [3, 2, 1]) {
    if (words.length <= take) continue
    const tail = words.slice(-take)
    for (const joiner of ['', '/', ' ']) {
      const unit = canonicalUnit(tail.join(joiner))
      if (unit) return { unit, label: words.slice(0, -take).join(' ') }
    }
  }

  // Semantic fallbacks for names the app prints with a unit it never spells in
  // the key. Kept deliberately short — a wrong unit here weakens a check.
  const label = words.join(' ')
  if (/\b(sbp|dbp|systolic|diastolic|pressure|mmhg)\b/.test(label)) return { unit: 'mmHg', label }
  if (/\b(hr|heart rate|pulse)\b/.test(label)) return { unit: 'bpm', label }
  return { unit: null, label }
}

/** Names whose 0..1 value is a proportion the app shows as a percentage. */
const PROPORTION_RE = /\b(p|prob|probability|risk|hazard|attainment|fraction|frac|rate|incidence|ratio|share|adherence)\b/

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v)
  const trimmed = Number(v.toPrecision(6))
  return String(trimmed)
}

function isMeasured(v: Record<string, unknown>): boolean {
  return 'provenance' in v && 'value' in v
}

function isProvenance(v: Record<string, unknown>): boolean {
  return 'status' in v && ('source' in v || 'note' in v || 'url' in v)
}

function provenanceLabel(p: Record<string, unknown>): string {
  const status = typeof p.status === 'string' ? p.status : ''
  const source = typeof p.source === 'string' ? p.source : ''
  if (source) return `${source}${status && status !== 'CITED' ? ` [${status}]` : ''}`
  const note = typeof p.note === 'string' ? p.note : ''
  return status === 'ESTIMATED' ? `ESTIMATED — ${note || 'no source'}` : status || note || 'no source'
}

/**
 * Walk a value and produce labelled lines plus the facts behind them.
 *
 * Facts are recorded ONLY for numbers that actually reach a line, so the
 * allowed set can never exceed what the model was shown.
 */
export function describe(value: unknown, opts: DescribeOptions = {}): Described {
  const cfg = { ...DEFAULTS, ...opts }
  const lines: string[] = []
  const facts: NumberFact[] = []
  const seen = new WeakSet<object>()

  const push = (line: string) => {
    if (lines.length < cfg.maxLines) lines.push(line)
  }

  const addNumber = (v: number, label: string, unit: CanonicalUnit | null, indent: string) => {
    if (!Number.isFinite(v)) return
    let rendered = formatNumber(v)
    facts.push({ value: v, unit, label, source: opts.source })

    // A proportion is shown as a percentage everywhere else in this product, so
    // send BOTH renderings. Otherwise the model writes "10.8 %" of a supplied
    // 0.108 and the validator flags a number that is, in fact, ours.
    if (!unit && v >= 0 && v <= 1 && PROPORTION_RE.test(label)) {
      const pct = Number((v * 100).toPrecision(6))
      facts.push({ value: pct, unit: '%', label: `${label} (as a percentage)`, source: opts.source })
      rendered = `${formatNumber(pct)} % (${rendered} as a fraction)`
    } else if (unit) {
      rendered = `${rendered} ${unit}`
    }
    push(`${indent}${label}: ${rendered}`)
  }

  const walk = (v: unknown, label: string, depth: number, unitHint: CanonicalUnit | null) => {
    const indent = '  '.repeat(Math.max(0, depth))
    if (v == null) return
    if (typeof v === 'number') return addNumber(v, label, unitHint, indent)
    if (typeof v === 'boolean') return push(`${indent}${label}: ${v ? 'yes' : 'no'}`)
    if (typeof v === 'string') {
      const s = v.length > cfg.maxStringLength ? `${v.slice(0, cfg.maxStringLength)}…` : v
      if (s.trim()) push(`${indent}${label}: ${s}`)
      return
    }
    if (typeof v !== 'object') return
    if (seen.has(v as object)) return
    seen.add(v as object)
    if (depth >= cfg.maxDepth) return

    if (Array.isArray(v)) {
      if (!v.length) return
      const primitives = v.every((x) => typeof x === 'string' || typeof x === 'number')
      if (primitives && v.length <= cfg.maxItems) {
        const nums = v.filter((x): x is number => typeof x === 'number')
        for (const n of nums) facts.push({ value: n, unit: unitHint, label, source: opts.source })
        const body = v.map((x) => (typeof x === 'number' ? formatNumber(x) : String(x))).join(', ')
        push(`${indent}${label}: ${body}${unitHint ? ` (${unitHint})` : ''}`)
        return
      }
      push(`${indent}${label} (${v.length}):`)
      for (const [i, item] of v.slice(0, cfg.maxItems).entries()) {
        walk(item, `${label} ${i + 1}`, depth + 1, unitHint)
      }
      if (v.length > cfg.maxItems) push(`${indent}  … ${v.length - cfg.maxItems} more not shown`)
      return
    }

    const obj = v as Record<string, unknown>

    if (isMeasured(obj)) {
      const unit = canonicalUnit(typeof obj.unit === 'string' ? obj.unit : null) ?? unitHint
      const prov = obj.provenance && typeof obj.provenance === 'object'
        ? provenanceLabel(obj.provenance as Record<string, unknown>)
        : ''
      if (typeof obj.value === 'number') {
        facts.push({ value: obj.value, unit, label, source: prov || opts.source })
        const range = Array.isArray(obj.range) && obj.range.length === 2 ? obj.range : null
        if (range) for (const r of range) if (typeof r === 'number') facts.push({ value: r, unit, label: `${label} range`, source: prov })
        const rangeText = range ? ` (range ${formatNumber(Number(range[0]))}–${formatNumber(Number(range[1]))})` : ''
        push(`${indent}${label}: ${formatNumber(obj.value)}${unit ? ` ${unit}` : ''}${rangeText}${prov ? ` — ${prov}` : ''}`)
      } else {
        push(`${indent}${label}: no value${prov ? ` — ${prov}` : ''}`)
      }
      return
    }

    if (isProvenance(obj)) {
      const text = provenanceLabel(obj)
      push(`${indent}${label}: ${text}`)
      if (typeof obj.quote === 'string' && obj.quote.trim()) push(`${indent}  quoted: “${obj.quote}”`)
      return
    }

    const keys = Object.keys(obj).filter((k) => !cfg.skipKeys.includes(k))
    if (!keys.length) return
    if (label) push(`${indent}${label}:`)
    for (const k of keys.slice(0, 60)) {
      const { unit, label: childLabel } = unitFromKey(k)
      walk(obj[k], childLabel || k, depth + (label ? 1 : 0), unit ?? null)
    }
  }

  walk(value, opts.path ?? '', 0, null)
  return { lines, facts }
}
