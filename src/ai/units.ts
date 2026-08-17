/**
 * The unit lexicon the number boundary is built on.
 *
 * A closed set on purpose. The validator's strongest rule is that a number the
 * model wrote WITH a unit must appear in the supplied context WITH THE SAME
 * unit — that is what stops "amlodipine 7 mg" from passing because the integer
 * 7 happened to appear somewhere as a severity rank. A closed lexicon is what
 * makes "same unit" decidable; anything not listed here is treated as no unit
 * at all, which falls back to the weaker (but still real) any-fact rule.
 *
 * Add a unit here only when the app actually prints it. An over-broad lexicon
 * silently converts strong checks into weak ones.
 */

/** Canonical unit ids. Every alias below resolves to one of these. */
export type CanonicalUnit =
  | 'mg'
  | 'mg/day'
  | 'g'
  | 'µg'
  | 'kg'
  | 'cm'
  | 'mmHg'
  | '%'
  | 'ng/mL'
  | 'µg/mL'
  | 'mg/dL'
  | 'mmol/L'
  | 'µmol/L'
  | 'nmol/L'
  | 'mEq/L'
  | 'mL/min'
  | 'mL/min/1.73m2'
  | 'L'
  | 'mL'
  | 'h'
  | 'min'
  | 'days'
  | 'weeks'
  | 'months'
  | 'years'
  | 'bpm'
  | 'fold'
  | 'points'

/**
 * Alias -> canonical. Keys are matched case-insensitively after whitespace in
 * the candidate is collapsed, so "mm Hg", "mmhg" and "mmHg" are one unit.
 */
const ALIASES: Record<string, CanonicalUnit> = {
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  'mg/day': 'mg/day',
  'mg/d': 'mg/day',
  'mgdaily': 'mg/day',
  g: 'g',
  gram: 'g',
  grams: 'g',
  ug: 'µg',
  'µg': 'µg',
  mcg: 'µg',
  microgram: 'µg',
  micrograms: 'µg',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  cm: 'cm',
  mmhg: 'mmHg',
  torr: 'mmHg',
  '%': '%',
  pct: '%',
  percent: '%',
  percentage: '%',
  'ng/ml': 'ng/mL',
  'ng/l': 'ng/mL',
  'ug/ml': 'µg/mL',
  'µg/ml': 'µg/mL',
  'mcg/ml': 'µg/mL',
  'mg/dl': 'mg/dL',
  'mmol/l': 'mmol/L',
  'mmol': 'mmol/L',
  'umol/l': 'µmol/L',
  'µmol/l': 'µmol/L',
  'nmol/l': 'nmol/L',
  'meq/l': 'mEq/L',
  'ml/min': 'mL/min',
  'ml/min/1.73m2': 'mL/min/1.73m2',
  'ml/min/1.73': 'mL/min/1.73m2',
  l: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  ml: 'mL',
  h: 'h',
  hr: 'h',
  hrs: 'h',
  hour: 'h',
  hours: 'h',
  min: 'min',
  mins: 'min',
  minute: 'min',
  minutes: 'min',
  d: 'days',
  day: 'days',
  days: 'days',
  wk: 'weeks',
  week: 'weeks',
  weeks: 'weeks',
  mo: 'months',
  month: 'months',
  months: 'months',
  yr: 'years',
  yrs: 'years',
  year: 'years',
  years: 'years',
  'year-old': 'years',
  'yearold': 'years',
  bpm: 'bpm',
  'beats/min': 'bpm',
  fold: 'fold',
  point: 'points',
  points: 'points',
}

/** Longest alias first, so "mg/day" wins over "mg" and "ng/mL" over "ng". */
const ALIAS_KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length)

/** The character class a unit token may be built from — letters, %, /, µ, dot, dash. */
const UNIT_CHARS = /[A-Za-zµ%/.\-0-9]/

/**
 * Read a unit immediately following a number.
 *
 * `text.slice(from)` is inspected with at most one space of separation, because
 * "10 mg" and "10mg" are the same claim while "10 patients took mg" is not.
 * Returns the canonical unit and how many characters it consumed.
 */
export function readUnit(text: string, from: number): { unit: CanonicalUnit; length: number } | null {
  let i = from
  let gap = 0
  while (i < text.length && /[ \t\u00a0\u2009]/.test(text[i])) {
    i++
    gap++
    if (gap > 1) return null
  }
  if (i >= text.length) return null

  // "mm Hg" is the one alias with an internal space worth honouring.
  const mmHg = /^mm\s?hg/i.exec(text.slice(i, i + 6))
  if (mmHg) return { unit: 'mmHg', length: gap + mmHg[0].length }

  let j = i
  while (j < text.length && UNIT_CHARS.test(text[j])) j++
  const rawSpan = text.slice(i, j)
  if (!rawSpan) return null

  const normalized = rawSpan.toLowerCase()
  for (const key of ALIAS_KEYS) {
    if (normalized.startsWith(key)) {
      // Reject a partial word: "mg" must not match inside "mgx" or "days" inside
      // "daylight". The next character has to be a boundary.
      const next = normalized.slice(key.length, key.length + 1)
      if (next && /[a-z0-9µ]/.test(next)) continue
      return { unit: ALIASES[key], length: gap + key.length }
    }
  }
  return null
}

/** Canonicalize a unit string supplied by the app (never by the model). */
export function canonicalUnit(raw: string | null | undefined): CanonicalUnit | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (ALIASES[key]) return ALIASES[key]
  const hit = readUnit(raw.trim(), 0)
  return hit ? hit.unit : null
}
