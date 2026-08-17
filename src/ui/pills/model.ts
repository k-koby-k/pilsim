/**
 * The Pills page's view model. Owned by Agent UI-A.
 *
 * A pill is a composition of substances. The eight records in `data/products.json` are
 * real marketed products — five monotherapies, one alternate salt/formulation and two
 * fixed-dose combinations — so the grid starts populated with things that exist rather
 * than with an empty state. A pill the user composes is the same shape, flagged
 * `source: 'custom'`, and goes through exactly the same incompatibility check.
 */

import type { ProductRecord, SubstanceRecord } from '../../data/load'
import { isMeasured } from '../../data/provenance'
import type { Provenance } from '../../types'
import type { CompositionComponent } from './rulesAdapter'

export interface PillComponent extends CompositionComponent {
  /** Resolved display name, falling back to the raw id. */
  name: string
  amountProvenance?: Provenance
}

export interface Pill {
  id: string
  name: string
  genericName?: string
  productClass: string
  dosageForm?: string
  route?: string
  brands: string[]
  components: PillComponent[]
  lactoseFree?: boolean | null
  lactoseNote?: string
  dosingIntervalH?: number | null
  modeledStrengthMg: number | null
  modeledStrengthProvenance?: Provenance
  availableStrengths: number[]
  notes?: string
  excipientProvenance?: Provenance
  patientFlags: string[]
  source: 'product' | 'custom'
}

export const PRODUCT_CLASS_LABEL: Record<string, string> = {
  monotherapy: 'Monotherapy',
  fixed_dose_combination: 'Fixed-dose combination',
  alternate_formulation: 'Alternate formulation',
  custom: 'User composition',
}

/**
 * Presentation only. Some ids have no substance record — `potassium_content` is the
 * documented example, an open item in research/00-DECISIONS.md §12 — and some product
 * classes are not in the label map. Rather than print a raw snake_case token at a
 * clinician, spell it out. Nothing about the underlying value changes.
 */
export function prettyLabel(raw: string): string {
  if (!/^[a-z0-9_]+$/.test(raw)) return raw
  const words = raw.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** First-letter capitalisation for free-text strings (e.g. `salt_form` values,
 * which are plain lowercase prose like "metoprolol tartrate", not snake_case). */
function capitalize(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function nameOf(substances: SubstanceRecord[], id: string): string {
  return substances.find((s) => s.id === id)?.name ?? id
}

function roleOf(substances: SubstanceRecord[], id: string, declared: string): string {
  if (declared) return declared
  const rec = substances.find((s) => s.id === id)
  return rec?.role === 'excipient' ? 'excipient' : 'active'
}

/** Numbers in products.json are sometimes bare, sometimes `Measured`-wrapped. */
function readNumber(v: unknown): { value: number | null; provenance?: Provenance } {
  if (typeof v === 'number') return { value: v }
  if (isMeasured(v)) {
    return { value: typeof v.value === 'number' ? v.value : null, provenance: v.provenance }
  }
  return { value: null }
}

function readNumberList(v: unknown): number[] {
  const raw = isMeasured(v) ? (v as { value: unknown }).value : v
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : []
}

export function pillFromProduct(product: ProductRecord, substances: SubstanceRecord[]): Pill {
  const strength = readNumber(product.modeled_strength_mg)
  return {
    id: product.id,
    name: product.name,
    genericName: product.generic_name,
    productClass: product.product_class ?? 'monotherapy',
    dosageForm: product.dosage_form,
    route: product.route,
    brands: product.reference_brand_names ?? [],
    components: (product.composition ?? []).map((c) => ({
      substanceId: c.substance_id,
      role: roleOf(substances, c.substance_id, c.role),
      amountMg: typeof c.amount_mg === 'number' ? c.amount_mg : null,
      name: nameOf(substances, c.substance_id),
      amountProvenance: c.amount_provenance,
      saltForm: typeof c.salt_form === 'string' ? c.salt_form : undefined,
      labelStrengthMg: typeof c.label_strength_mg === 'number' ? c.label_strength_mg : null,
    })),
    lactoseFree: product.lactose_free ?? null,
    lactoseNote: typeof product.lactose_free_note === 'string' ? product.lactose_free_note : undefined,
    dosingIntervalH: product.dosing_interval_h ?? null,
    modeledStrengthMg: strength.value,
    modeledStrengthProvenance: strength.provenance,
    availableStrengths: readNumberList(product.available_strengths),
    notes: typeof product.notes === 'string' ? product.notes : undefined,
    excipientProvenance:
      (product.excipient_provenance as Provenance | undefined) ?? undefined,
    patientFlags: product.patient_flags_from_excipients ?? [],
    source: 'product',
  }
}

export function customPill(
  id: string,
  name: string,
  components: { substanceId: string; amountMg: number | null; form?: string }[],
  substances: SubstanceRecord[],
): Pill {
  return {
    id,
    name,
    productClass: 'custom',
    dosageForm: 'immediate-release tablet (assumed)',
    route: 'oral',
    brands: [],
    components: components.map((c) => ({
      substanceId: c.substanceId,
      role: roleOf(substances, c.substanceId, ''),
      amountMg: c.amountMg,
      name: nameOf(substances, c.substanceId),
      form: c.form,
    })),
    lactoseFree: null,
    dosingIntervalH: 24,
    modeledStrengthMg: null,
    availableStrengths: [],
    patientFlags: [],
    source: 'custom',
  }
}

/** A milligram figure that may be bare or `Measured`-wrapped. */
function readMg(raw: unknown): number | null {
  if (typeof raw === 'number') return raw
  if (isMeasured(raw) && typeof raw.value === 'number') return raw.value
  return null
}

/**
 * The approved daily ceiling for a substance, when the record carries one. Used to
 * bound the dose slider — a slider is only honest where the range is sourced.
 */
export function maxDailyMg(record: SubstanceRecord | undefined): number | null {
  const dosing = record?.dosing
  if (!dosing || typeof dosing !== 'object') return null
  return readMg((dosing as Record<string, unknown>).max_daily_mg)
}

/**
 * The dose a composition should START at for this substance — the dataset's own
 * `dosing.typical_adult_start_mg`, or for an excipient its typical amount.
 *
 * Used when substances are handed to the composer from the Substances page. A pill
 * prefilled with zeros is not runnable and teaches the user nothing; a pill prefilled
 * with the sourced starting dose produces a real result on the first attempt, and the
 * dose sliders are right there to change it. Nothing is written back to the record —
 * this only reads a value that already exists.
 */
export function startDoseMg(record: SubstanceRecord | undefined): number | null {
  if (!record) return null
  const dosing = record.dosing
  if (dosing && typeof dosing === 'object') {
    const start = readMg((dosing as Record<string, unknown>).typical_adult_start_mg)
    if (start !== null) return start
  }
  const typical = readMg(record.typical_amount_mg)
  if (typical !== null) return typical
  // Last resort for a record with a ceiling but no quoted start: never invent one.
  return null
}

export function actives(pill: Pill): PillComponent[] {
  return pill.components.filter((c) => !/excipient/i.test(c.role))
}

export function excipients(pill: Pill): PillComponent[] {
  return pill.components.filter((c) => /excipient/i.test(c.role))
}

/**
 * The strength a prescriber would recognise for one active component.
 *
 * Composition `amountMg` is the moiety BASE mass used for PK (see
 * `CompositionComponent.amountMg`), and for a base-matched product like
 * metoprolol that number does not correspond to any licensed strength — e.g.
 * 39.1 mg base for a "50 mg" metoprolol tartrate tablet. Where the record
 * carries a `labelStrengthMg` (the number actually printed on the product),
 * that is the headline; the base mass stays available as the technical
 * detail elsewhere (see `PillComposition`'s active-ingredient row) rather
 * than standing in for a strength that was never marketed.
 */
export function componentStrengthLabel(c: PillComponent): string {
  if (c.labelStrengthMg != null) {
    const salt = c.saltForm ? saltQualifier(c) : null
    return salt ? `${c.labelStrengthMg} mg ${salt}` : `${c.labelStrengthMg} mg`
  }
  return c.amountMg === null ? '—' : `${c.amountMg} mg`
}

/** "metoprolol tartrate" -> "tartrate" (drops the leading moiety name already
 * shown elsewhere); falls back to the full salt form if it doesn't prefix-match. */
function saltQualifier(c: PillComponent): string {
  const salt = c.saltForm ?? ''
  const prefix = c.name.toLowerCase()
  return salt.toLowerCase().startsWith(prefix) ? salt.slice(prefix.length).trim() : salt
}

/**
 * The base-mass detail line for a component labelled in a different salt —
 * e.g. "Metoprolol tartrate 50 mg · base content 39.1 mg". Null for any
 * component with no salt/label distinction, so callers can omit the row
 * entirely rather than print a redundant one.
 */
export function saltDetailCaption(c: PillComponent): string | null {
  if (c.labelStrengthMg == null || !c.saltForm || c.amountMg === null) return null
  return `${capitalize(c.saltForm)} ${c.labelStrengthMg} mg`
}

/** "10 mg + 12.5 mg" — the line under a card title and in the sidebar. */
export function strengthLine(pill: Pill): string {
  const a = actives(pill)
  if (a.length === 0) return 'no active ingredient'
  return a.map((c) => (c.amountMg === null ? `${c.name} —` : componentStrengthLabel(c))).join(' + ')
}

export function totalActiveMg(pill: Pill): number | null {
  const a = actives(pill)
  if (a.length === 0 || a.some((c) => c.amountMg === null)) return null
  return a.reduce((sum, c) => sum + (c.amountMg ?? 0), 0)
}
