/**
 * The number boundary.
 *
 * This is the file the product's credibility rests on. A language model writing
 * clinical prose will, unprompted, produce a dose or a mmHg figure that sounds
 * right and is not in the data. If that renders looking like the rest of the
 * report, a clinician judge finds it in under a minute and everything else on
 * the screen becomes suspect.
 *
 * The rule enforced here is deliberately mechanical, so it cannot be argued
 * with at demo time:
 *
 *   THE SET OF NUMBERS THE MODEL MAY WRITE IS THE SET OF NUMBERS WE SENT IT.
 *
 * Both sides are tokenized by the SAME function, so "supported" means the exact
 * token, at the precision written, was present in the prompt. Two refinements
 * keep that from being either too strict or too loose:
 *
 *  - Rounding is allowed. A model that writes "12 mmHg" for a supplied 12.4 has
 *    rounded, not invented, so a match counts when the supplied value falls
 *    within half a unit of the last decimal place the model actually wrote.
 *  - Units are checked. A number carrying a unit must match a supplied number
 *    carrying the SAME unit. Without this, "amlodipine 7 mg" passes because the
 *    integer 7 appears somewhere as a severity rank, which is exactly the
 *    failure this file exists to prevent.
 *
 * Sign is compared on magnitude. The app prints reductions as "−12 mmHg" and
 * prose says "reduced by 12 mmHg"; treating those as different numbers would
 * flag correct writing and train the reader to ignore the flags.
 */

import { readUnit, type CanonicalUnit } from './units'

/** A number the app supplied to the model, with what it means and where it came from. */
export interface NumberFact {
  value: number
  unit: CanonicalUnit | null
  /** Human label, shown in the tooltip so a reader can trace the figure. */
  label: string
  /** Where the app got it: engine summary, a rule citation, the plan, the twin. */
  source?: string
}

/** One numeric token found in a piece of text. */
export interface NumberToken {
  /** Exactly as written, without the unit. */
  raw: string
  value: number
  unit: CanonicalUnit | null
  /** Character offsets into the text, covering the number AND its unit. */
  start: number
  end: number
  /** Decimal places the writer actually used — the precision a match is judged at. */
  decimals: number
}

/**
 * Numbers, with optional thousands separators and an optional sign.
 *
 * A leading `-` is only taken as a sign when it is not preceded by a word
 * character, so "EXP-3174" does not become the number −3174, and identifiers
 * like "HTN-014" tokenize the way they do on both sides of the boundary.
 */
const NUMBER_RE = /(?<![\w.])[-−–]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])[-−–]?\d+(?:\.\d+)?/g

/** Tokenize every number in a piece of text. Used on the prompt AND on the reply. */
export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = []
  NUMBER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBER_RE.exec(text))) {
    const raw = m[0]
    const normalized = raw.replace(/,/g, '').replace(/[−–]/g, '-')
    const value = Number(normalized)
    if (!Number.isFinite(value)) continue
    const numberEnd = m.index + raw.length
    const unitHit = readUnit(text, numberEnd)
    const dot = normalized.indexOf('.')
    out.push({
      raw,
      value,
      unit: unitHit ? unitHit.unit : null,
      start: m.index,
      end: unitHit ? numberEnd + unitHit.length : numberEnd,
      decimals: dot === -1 ? 0 : normalized.length - dot - 1,
    })
  }
  return out
}

/**
 * Does a supplied value support a written token?
 *
 * Half a unit of the written precision, so "12" supports 11.5..12.5 and "12.4"
 * supports 12.35..12.45. Writing more digits than the source had therefore
 * makes the claim STRICTER, which is the correct direction: a model that
 * invents precision loses its match.
 */
export function valueSupports(supplied: number, token: Pick<NumberToken, 'value' | 'decimals'>): boolean {
  const tolerance = 0.5 * Math.pow(10, -token.decimals) + 1e-9
  return Math.abs(Math.abs(supplied) - Math.abs(token.value)) <= tolerance
}

export type TokenStatus = 'supported' | 'unsupported' | 'pending'

export interface CheckedToken extends NumberToken {
  status: TokenStatus
  /** The supplied fact that supports it, for the traceability tooltip. */
  fact?: NumberFact
}

/**
 * Find the supplied fact backing a token, or null.
 *
 * With a unit, only same-unit facts are eligible. Without one, any fact is —
 * a bare "15" in prose is usually a count or an ordinal, and flagging those
 * would bury the flags that matter under noise.
 */
export function findSupport(token: NumberToken, facts: NumberFact[]): NumberFact | null {
  let loose: NumberFact | null = null
  for (const f of facts) {
    if (!valueSupports(f.value, token)) continue
    if (token.unit) {
      if (f.unit === token.unit) return f
      continue
    }
    // Prefer a fact that also has no unit; fall back to any match.
    if (!f.unit) return f
    if (!loose) loose = f
  }
  return token.unit ? null : loose
}

/** Turn app-supplied text into facts, so free prose in the context is quotable. */
export function factsFromText(text: string, label: string, source?: string): NumberFact[] {
  return extractNumbers(text).map((t) => ({ value: t.value, unit: t.unit, label, source }))
}

export interface CheckOptions {
  /**
   * The text is still streaming. A number at the very end may be half-written
   * ("12" that will become "12.4"), so the last token is held as `pending`
   * rather than flashing red and then correcting itself.
   */
  partial?: boolean
}

/** Classify every number in `text` against `facts`. */
export function checkNumbers(text: string, facts: NumberFact[], opts: CheckOptions = {}): CheckedToken[] {
  const tokens = extractNumbers(text)
  return tokens.map((t, i) => {
    const last = i === tokens.length - 1
    if (opts.partial && last && t.end >= text.length) {
      return { ...t, status: 'pending' as const }
    }
    const fact = findSupport(t, facts)
    return fact ? { ...t, status: 'supported' as const, fact } : { ...t, status: 'unsupported' as const }
  })
}

export interface Segment {
  kind: 'text' | 'number'
  text: string
  status?: TokenStatus
  fact?: NumberFact
  unit?: CanonicalUnit | null
}

/** Split text into renderable runs so each number can be marked in place. */
export function segment(text: string, checked: CheckedToken[]): Segment[] {
  const out: Segment[] = []
  let cursor = 0
  for (const t of checked) {
    if (t.start > cursor) out.push({ kind: 'text', text: text.slice(cursor, t.start) })
    out.push({
      kind: 'number',
      text: text.slice(t.start, t.end),
      status: t.status,
      fact: t.fact,
      unit: t.unit,
    })
    cursor = t.end
  }
  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) })
  return out
}

/** The marker put in place of a number that traces to nothing. */
export const UNSOURCED_MARK = '[unsourced]'

/**
 * Remove every unsupported number from the text.
 *
 * Used wherever generated prose sits next to engine output closely enough that
 * a flagged-but-visible number could still be read as sourced — suggestion
 * rationales, exports. The reasoning panel FLAGS instead of stripping, because
 * seeing the model's mistake caught is more informative than seeing it hidden.
 */
export function stripUnsupported(text: string, facts: NumberFact[]): string {
  const checked = checkNumbers(text, facts)
  let out = ''
  let cursor = 0
  for (const t of checked) {
    if (t.status !== 'unsupported') continue
    out += text.slice(cursor, t.start) + UNSOURCED_MARK
    cursor = t.end
  }
  return out + text.slice(cursor)
}

export interface ValidationSummary {
  total: number
  supported: number
  unsupported: number
  pending: number
  /** The offending tokens, verbatim, for the panel's footer. */
  offenders: string[]
  clean: boolean
}

export function summarize(checked: CheckedToken[]): ValidationSummary {
  const unsupported = checked.filter((t) => t.status === 'unsupported')
  return {
    total: checked.length,
    supported: checked.filter((t) => t.status === 'supported').length,
    unsupported: unsupported.length,
    pending: checked.filter((t) => t.status === 'pending').length,
    offenders: unsupported.map((t) => (t.unit ? `${t.raw} ${t.unit}` : t.raw)),
    clean: unsupported.length === 0,
  }
}
