/**
 * Flattening a substance record into an editable, provenance-carrying field list.
 *
 * The 43 substance records are deeply and heterogeneously nested — `physchem.logp`,
 * `physchem.pka[0]`, `pk.absorption.tmax_h`, `pd.targets[1].ic50` — and no two records
 * carry the same set of keys. Rather than hand-listing fields, we walk the record and
 * pick out every `Measured` wrapper wherever it sits. That way a value added to the
 * data file later shows up in the UI without a code change, and — the part that
 * matters — nothing can be rendered without dragging its provenance along with it.
 *
 * Owned by Agent UI-A.
 */

import type { Measured, ProvenanceStatus } from '../../types'
import { isMeasured } from '../../data/provenance'
import type { SubstanceRecord } from '../../data/load'
import type { DictKey } from '../../i18n'

/** A minimal translate function — avoids importing the useT hook into this non-React module. */
export type T = (key: DictKey, vars?: Record<string, string | number>) => string

export interface MeasuredField {
  /** Dotted path into the record, e.g. `pk.absorption.tmax_h` or `physchem.pka[0]`. */
  path: string
  /** First path segment, used to group the table. `general` for top-level values. */
  section: string
  /** Humanised leaf name for display. */
  label: string
  /** Path minus the section, for the small grey sub-line. */
  subPath: string
  measured: Measured
  status: ProvenanceStatus
}

const SKIP_KEYS = new Set(['provenance_legend', 'schema_version'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Depth-first walk collecting every `Measured` leaf with its dotted path. */
export function collectMeasuredFields(record: SubstanceRecord): MeasuredField[] {
  const out: MeasuredField[] = []

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 8 || node == null) return

    if (isMeasured(node)) {
      const section = sectionOf(path)
      const subPath =
        section === 'general' ? path : path.slice(section.length).replace(/^\./, '')
      out.push({
        path,
        section,
        label: humanise(leafOf(path)),
        subPath,
        measured: node as Measured,
        status: (node as Measured).provenance?.status ?? 'NOT_FOUND',
      })
      return
    }

    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, depth + 1))
      return
    }

    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('_') || SKIP_KEYS.has(k)) continue
        walk(v, path ? `${path}.${k}` : k, depth + 1)
      }
    }
  }

  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('_') || SKIP_KEYS.has(k)) continue
    if (k === 'id' || k === 'name' || k === 'role') continue
    walk(v, k, 0)
  }

  return out
}

/**
 * Group key for a dotted path. The array index is deliberately dropped, so that
 * `formulations[0].tmax_h` and `formulations[3].tmax_h` land in one `formulations`
 * table rather than in four one-row tables. The index survives in `subPath`.
 */
function sectionOf(path: string): string {
  const dot = path.indexOf('.')
  const bracket = path.indexOf('[')
  if (dot === -1 && bracket === -1) return 'general'
  const cut = dot === -1 ? bracket : bracket === -1 ? dot : Math.min(dot, bracket)
  return path.slice(0, cut)
}

function leafOf(path: string): string {
  const bracket = path.match(/^(.*)\[(\d+)\]$/)
  if (bracket) return `${leafOf(bracket[1])} #${Number(bracket[2]) + 1}`
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i + 1) : path
}

const ACRONYMS: Record<string, string> = {
  pk: 'PK',
  pd: 'PD',
  logp: 'logP',
  logd: 'logD',
  pka: 'pKa',
  auc: 'AUC',
  cmax: 'Cmax',
  tmax: 'Tmax',
  ic50: 'IC50',
  ec50: 'EC50',
  ed50: 'ED50',
  emax: 'Emax',
  cl: 'CL',
  vd: 'Vd',
  bcs: 'BCS',
  gfr: 'GFR',
  mg: 'mg',
  ml: 'mL',
  cyp3a4: 'CYP3A4',
  cyp2c9: 'CYP2C9',
  cyp2d6: 'CYP2D6',
  h: 'h',
  l: 'L',
  ph: 'pH',
}

export function humanise(key: string): string {
  const parts = key.split(/[_\s]+/).filter(Boolean)
  const words = parts.map((p) => {
    const lower = p.toLowerCase()
    if (ACRONYMS[lower]) return ACRONYMS[lower]
    return p
  })
  const joined = words.join(' ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

export const SECTION_ORDER = [
  'general',
  'physchem',
  'pk',
  'pd',
  'dosing',
  'formulations',
  'simulation_hooks',
  'flags',
  'identifiers',
]

/** English fallback labels — kept for callers that have no translate function handy. */
export const SECTION_LABEL: Record<string, string> = {
  general: 'Record-level values',
  physchem: 'Physicochemistry',
  pk: 'Pharmacokinetics',
  pd: 'Pharmacodynamics',
  dosing: 'Dosing',
  formulations: 'Formulations',
  simulation_hooks: 'Simulation hooks',
  flags: 'Flags',
  identifiers: 'Identifiers',
}

/** DictKey per section — see src/i18n/dictionary.ts `section.*`. */
export const SECTION_LABEL_KEY: Record<string, DictKey> = {
  general: 'section.general',
  physchem: 'section.physchem',
  pk: 'section.pk',
  pd: 'section.pd',
  dosing: 'section.dosing',
  formulations: 'section.formulations',
  simulation_hooks: 'section.simulation_hooks',
  flags: 'section.flags',
  identifiers: 'section.identifiers',
}

/** Translated section label, falling back to the English default then a humanised key. */
export function sectionLabel(section: string, t: T): string {
  const key = SECTION_LABEL_KEY[section]
  return key ? t(key) : (SECTION_LABEL[section] ?? humanise(section))
}

export function sectionsOf(fields: MeasuredField[]): string[] {
  const present = Array.from(new Set(fields.map((f) => f.section)))
  present.sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a)
    const ib = SECTION_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return present
}

// ---------------------------------------------------------------------------
// Progressive disclosure: which handful of the 100+ values actually matter.
//
// A substance record carries up to 160 provenance-wrapped values. Showing them all
// at once is a wall, and a wall reads as noise rather than as rigour. So the page
// leads with these — the ones a clinician or pharmacologist would ask for first —
// and everything else sits behind an explicit "All parameters" disclosure. Nothing
// is removed; the ordering below is the whole of the editorial judgement.
// ---------------------------------------------------------------------------

export interface KeyFieldSpec {
  path: string
  /** English fallback — used only if no translate function is supplied. */
  label: string
  labelKey: DictKey
}

export const KEY_FIELD_SPECS: KeyFieldSpec[] = [
  // what you would prescribe
  { path: 'dosing.typical_adult_start_mg', label: 'Typical starting dose', labelKey: 'field.typicalStartingDose' },
  { path: 'dosing.max_daily_mg', label: 'Maximum daily dose', labelKey: 'field.maxDailyDose' },
  // how the body handles it
  { path: 'pk.half_life_h', label: 'Half-life', labelKey: 'field.halfLife' },
  { path: 'pk.tmax_h', label: 'Time to peak', labelKey: 'field.timeToPeak' },
  { path: 'pk.bioavailability_fraction', label: 'Oral bioavailability', labelKey: 'field.oralBioavailability' },
  // what it does
  { path: 'pd.clinical_effect.sbp_drop_mmhg', label: 'Systolic BP change', labelKey: 'field.systolicBpChange' },
  { path: 'pd.clinical_effect.ed50_mg', label: 'ED50', labelKey: 'field.ed50' },
  { path: 'pd.clinical_effect.onset_h', label: 'Onset of effect', labelKey: 'field.onsetOfEffect' },
  { path: 'pd.clinical_effect.duration_h', label: 'Duration of effect', labelKey: 'field.durationOfEffect' },
  { path: 'pk.clearance_l_h', label: 'Clearance', labelKey: 'field.clearance' },
  { path: 'pk.vd_l', label: 'Volume of distribution', labelKey: 'field.volumeOfDistribution' },
  { path: 'pk.protein_binding_fraction', label: 'Protein binding', labelKey: 'field.proteinBinding' },
  { path: 'pk.fraction_excreted_unchanged_urine', label: 'Excreted unchanged in urine', labelKey: 'field.excretedUnchangedUrine' },
  // excipients carry almost nothing else, so these are their headline values
  { path: 'typical_amount_mg', label: 'Typical amount per tablet', labelKey: 'field.typicalAmountPerTablet' },
  { path: 'max_amount_per_day_mg', label: 'Maximum per day', labelKey: 'field.maximumPerDay' },
  { path: 'physchem.molecular_weight', label: 'Molecular weight', labelKey: 'field.molecularWeight' },
]

export const KEY_FIELD_LIMIT = 10

/**
 * The key values for one record, in the editorial order above, relabelled for a
 * reader rather than for the JSON path. If a record is shaped unusually and matches
 * almost nothing, fall back to its first fields so the card is never empty.
 */
export function pickKeyFields(
  fields: MeasuredField[],
  t?: T,
  limit: number = KEY_FIELD_LIMIT,
): MeasuredField[] {
  const byPath = new Map(fields.map((f) => [f.path, f]))
  const picked: MeasuredField[] = []

  for (const spec of KEY_FIELD_SPECS) {
    if (picked.length >= limit) break
    const field = byPath.get(spec.path)
    if (field) picked.push({ ...field, label: t ? t(spec.labelKey) : spec.label })
  }

  if (picked.length < 3) {
    const taken = new Set(picked.map((f) => f.path))
    for (const field of fields) {
      if (picked.length >= limit) break
      if (taken.has(field.path)) continue
      picked.push(field)
    }
  }

  return picked
}

// ---------------------------------------------------------------------------
// Card summary: what a substance looks like on a library card.
//
// A card carries a name, one plain phrase, and two or three numbers. `drug_class`
// in the data file is a taxonomy string — "beta-1 selective (cardioselective)
// adrenergic receptor blocking agent, without intrinsic sympathomimetic activity" —
// which is correct and unreadable. These maps turn it into something a non-specialist
// can read on a card; the full string is still shown on the detail view, unedited.
// ---------------------------------------------------------------------------

export interface CardSummary {
  /** Short class label for the badge, e.g. "ACE inhibitor". */
  className: string | null
  /** One plain phrase: what this does, in ordinary words. */
  plain: string | null
  stats: { label: string; value: string; unit?: string }[]
}

const CLASS_MATCHERS: { test: RegExp; labelKey: DictKey; plainKey: DictKey }[] = [
  {
    test: /ace inhibitor|angiotensin.converting/i,
    labelKey: 'field.class.aceInhibitor',
    plainKey: 'field.plain.aceInhibitor',
  },
  {
    test: /angiotensin ii receptor|\barb\b/i,
    labelKey: 'field.class.arb',
    plainKey: 'field.plain.arb',
  },
  {
    test: /calcium channel/i,
    labelKey: 'field.class.ccb',
    plainKey: 'field.plain.ccb',
  },
  {
    test: /thiazide|diuretic/i,
    labelKey: 'field.class.thiazide',
    plainKey: 'field.plain.thiazide',
  },
  {
    test: /adrenergic receptor blocking|beta.?blocker|beta-1/i,
    labelKey: 'field.class.betaBlocker',
    plainKey: 'field.plain.betaBlocker',
  },
]

const FUNCTION_PLAIN: Record<string, DictKey> = {
  filler: 'field.fn.filler',
  disintegrant: 'field.fn.disintegrant',
  binder: 'field.fn.binder',
  lubricant: 'field.fn.lubricant',
  glidant: 'field.fn.glidant',
  coating: 'field.fn.coating',
  colorant: 'field.fn.colorant',
  colorant_substrate: 'field.fn.colorant_substrate',
  surfactant: 'field.fn.surfactant',
  preservative: 'field.fn.preservative',
  sweetener: 'field.fn.sweetener',
  vehicle: 'field.fn.vehicle',
  buffer: 'field.fn.buffer',
  chelator: 'field.fn.chelator',
  viscosity_modifier: 'field.fn.viscosity_modifier',
}

/** Stat candidates, in order. The first three with a value are shown. */
const CARD_STATS: { path: string; labelKey: DictKey }[] = [
  { path: 'dosing.typical_adult_start_mg', labelKey: 'field.startDose' },
  { path: 'pk.half_life_h', labelKey: 'field.halfLife' },
  { path: 'dosing.max_daily_mg', labelKey: 'field.maxPerDayShort' },
  { path: 'pk.tmax_h', labelKey: 'field.timeToPeak' },
  { path: 'pk.bioavailability_fraction', labelKey: 'field.bioavailability' },
  { path: 'typical_amount_mg', labelKey: 'field.typicalAmount' },
  { path: 'max_amount_per_day_mg', labelKey: 'field.maxPerDayShort' },
  { path: 'physchem.molecular_weight', labelKey: 'field.molecularWeight' },
]

export function cardSummary(record: SubstanceRecord, fields: MeasuredField[], t?: T): CardSummary {
  const drugClass = typeof record.drug_class === 'string' ? record.drug_class : ''
  const fn =
    typeof record.excipient_function === 'string' ? record.excipient_function : null

  let className: string | null = null
  let plain: string | null = null

  const matched = CLASS_MATCHERS.find((m) => m.test.test(drugClass))
  if (matched) {
    className = t ? t(matched.labelKey) : drugClass
    plain = t ? t(matched.plainKey) : null
  } else if (fn) {
    className = humanise(fn)
    const plainKey = FUNCTION_PLAIN[fn]
    plain = plainKey && t ? t(plainKey) : null
  } else if (drugClass) {
    className = shortClass(drugClass)
  }

  const byPath = new Map(fields.map((f) => [f.path, f]))
  const stats: CardSummary['stats'] = []
  for (const spec of CARD_STATS) {
    if (stats.length >= 3) break
    const value = byPath.get(spec.path)?.measured
    if (!value || typeof value.value !== 'number') continue
    stats.push({
      label: t ? t(spec.labelKey) : spec.labelKey,
      value: trim(value.value),
      unit: value.unit ?? undefined,
    })
  }

  return { className, plain, stats }
}

/** First clause of a taxonomy string, so a badge never wraps to four lines. */
function shortClass(s: string): string {
  const clause = s.split(/[,;(]/)[0].trim()
  return clause.length > 34 ? `${clause.slice(0, 33).trimEnd()}…` : clause
}

export interface ProvenanceCounts {
  cited: number
  estimated: number
  notFound: number
  total: number
}

export function countProvenance(fields: MeasuredField[]): ProvenanceCounts {
  let cited = 0
  let estimated = 0
  let notFound = 0
  for (const f of fields) {
    if (f.status === 'CITED') cited++
    else if (f.status === 'ESTIMATED') estimated++
    else notFound++
  }
  return { cited, estimated, notFound, total: fields.length }
}

/** Format the range / CV / n column without inventing precision. */
export function spreadText(m: Measured): string {
  const bits: string[] = []
  const r = m.range
  if (Array.isArray(r) && r.length === 2) bits.push(`${trim(r[0])}–${trim(r[1])}`)
  if (typeof m.cv_percent === 'number') bits.push(`CV ${trim(m.cv_percent)}%`)
  if (typeof m.n === 'number') bits.push(`n=${m.n}`)
  if (m.distribution) bits.push(String(m.distribution))
  return bits.join('  ')
}

export function trim(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  const abs = Math.abs(n)
  const digits = abs >= 100 ? 1 : abs >= 1 ? 3 : 5
  return String(Number(n.toPrecision(digits + 1))).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

/**
 * Free-text and identifier leaves — everything the walker deliberately skipped.
 * Used for the identity card, which is read-only.
 */
export function scalarEntries(obj: unknown): [string, string][] {
  if (!isPlainObject(obj)) return []
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_') || v == null || v === '') continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push([humanise(k), String(v)])
    }
  }
  return out
}
