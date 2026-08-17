/**
 * The substance WORKING SET, and the substances a user creates. Owned by Agent UI-A.
 *
 * THE MODEL. The database is, eventually, every substance in existence; today's 43
 * records are a demo slice of it. A catalogue that size is never rendered — a
 * scientist searches it, picks what they need, and works with that handful. So:
 *
 *   CATALOGUE      every record from data/substances.json. Reached by search only.
 *   WORKING SET    the ids the user picked or created. THIS is the card library, and
 *                  this is what gets composed into pills.
 *
 * The working set and any user-created substance are persisted to localStorage —
 * a shelf a researcher built has to survive a reload — and user-created substances
 * are mirrored into the sidebar's Saved list, exactly as `subjectStore` does for test
 * subjects. Seeded catalogue records are deliberately not mirrored: the Saved list is
 * for what you made, not for what shipped.
 *
 * PROVENANCE. Every value on a user-created substance carries status ESTIMATED with a
 * note saying it was user-entered. A number a person typed must never inherit the look
 * of a regulatory citation — that distinction is the product's credibility.
 */

import { useMemo, useSyncExternalStore } from 'react'
import type { SubstanceRecord } from '../../data/load'
import type { Measured, Provenance } from '../../types'
import { removeItem, saveItem } from '../shell/savedStore'

const USER_KEY = 'pilsim.substances.user.v1'
const SET_KEY = 'pilsim.substances.workingset.v1'

/** Marks a record the user made. Read it with `isUserSubstance`. */
export const USER_FLAG = '_user_created'

export const USER_PROVENANCE: Provenance = {
  status: 'ESTIMATED',
  note: 'User-entered value — not taken from a source.',
  confidence: 'LOW',
}

export function isUserSubstance(record: SubstanceRecord | null | undefined): boolean {
  return Boolean(record && (record as Record<string, unknown>)[USER_FLAG])
}

function userMeasured(unit?: string): Measured {
  return { value: null, unit, provenance: { ...USER_PROVENANCE } }
}

/** The parameters a new substance starts with, by role. Everything else is added by editing. */
const TEMPLATE: Record<'active' | 'excipient', [string, string | undefined][]> = {
  active: [
    ['dosing.typical_adult_start_mg', 'mg'],
    ['dosing.max_daily_mg', 'mg'],
    ['pk.half_life_h', 'h'],
    ['pk.tmax_h', 'h'],
    ['pk.bioavailability_fraction', 'fraction'],
    ['pd.clinical_effect.sbp_drop_mmhg', 'mmHg'],
  ],
  excipient: [
    ['typical_amount_mg', 'mg'],
    ['max_amount_per_day_mg', 'mg'],
  ],
}

// --------------------------------------------------------------------------- state

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

let userRecords: SubstanceRecord[] = (() => {
  const parsed = readJson<SubstanceRecord[]>(USER_KEY)
  if (!Array.isArray(parsed)) return []
  // Defensive: a library written by an older shape must not crash the page.
  return parsed.filter(
    (r): r is SubstanceRecord =>
      Boolean(r) && typeof r.id === 'string' && typeof r.name === 'string',
  )
})()

let workingSet: string[] = (() => {
  const parsed = readJson<string[]>(SET_KEY)
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
})()

let hasStoredSet = workingSet.length > 0

const listeners = new Set<() => void>()

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(userRecords))
    localStorage.setItem(SET_KEY, JSON.stringify(workingSet))
  } catch {
    // A full or disabled localStorage must not break the page.
  }
}

function emit() {
  persist()
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// --------------------------------------------------------------------------- reads

export function getUserSubstances(): SubstanceRecord[] {
  return userRecords
}

export function getWorkingSet(): string[] {
  return workingSet
}

export function useUserSubstances(): SubstanceRecord[] {
  return useSyncExternalStore(subscribe, getUserSubstances, getUserSubstances)
}

export function useWorkingSet(): string[] {
  return useSyncExternalStore(subscribe, getWorkingSet, getWorkingSet)
}

/**
 * The catalogue plus everything the user made. Pills compose from this, so a substance
 * created on the Substances page is immediately available in the composer.
 */
export function useAllSubstances(catalogue: SubstanceRecord[]): SubstanceRecord[] {
  const mine = useUserSubstances()
  return useMemo(() => (mine.length === 0 ? catalogue : [...mine, ...catalogue]), [mine, catalogue])
}

// --------------------------------------------------------------------------- writes

let counter = 0
function nextId(): string {
  counter += 1
  return `user_${Date.now().toString(36)}_${counter}`
}

function mirror(record: SubstanceRecord) {
  saveItem({
    id: `substance_${record.id}`,
    kind: 'substance',
    label: record.name,
    page: 'substances',
    detail: typeof record.drug_class === 'string' ? record.drug_class : 'user substance',
  })
}

/** Seed the shelf on first run. Called once the catalogue has loaded. */
export function seedWorkingSet(ids: string[]): void {
  if (hasStoredSet || ids.length === 0) return
  hasStoredSet = true
  workingSet = [...ids]
  emit()
}

export function addToWorkingSet(id: string): void {
  if (workingSet.includes(id)) return
  workingSet = [id, ...workingSet]
  hasStoredSet = true
  emit()
}

export function removeFromWorkingSet(id: string): void {
  if (!workingSet.includes(id)) return
  workingSet = workingSet.filter((x) => x !== id)
  hasStoredSet = true
  emit()
}

export function createSubstance(
  name = 'New substance',
  role: 'active' | 'excipient' = 'active',
): SubstanceRecord {
  const record: SubstanceRecord = {
    id: nextId(),
    name,
    role,
    drug_class: null,
    [USER_FLAG]: true,
    record_notes: '',
  }
  for (const [path, unit] of TEMPLATE[role]) setAtPath(record, path, userMeasured(unit))

  userRecords = [record, ...userRecords]
  workingSet = [record.id, ...workingSet]
  hasStoredSet = true
  mirror(record)
  emit()
  return record
}

export function updateSubstanceMeta(
  id: string,
  patch: { name?: string; role?: string; drug_class?: string | null; record_notes?: string },
): void {
  let touched: SubstanceRecord | null = null
  userRecords = userRecords.map((r) => {
    if (r.id !== id) return r
    const next: SubstanceRecord = { ...r, ...patch }
    // Switching role brings the parameters that role is described by.
    const role = next.role === 'excipient' ? 'excipient' : 'active'
    for (const [path, unit] of TEMPLATE[role]) {
      if (readAtPath(next, path) === undefined) setAtPath(next, path, userMeasured(unit))
    }
    touched = next
    return next
  })
  if (touched) mirror(touched)
  emit()
}

/** Write a number onto a user-created substance. Its provenance stays user-entered. */
export function setUserValue(id: string, path: string, value: number | null): void {
  userRecords = userRecords.map((r) => {
    if (r.id !== id) return r
    const next = structuredCloneish(r)
    const existing = readAtPath(next, path)
    const measured: Measured =
      existing && typeof existing === 'object' && 'provenance' in (existing as object)
        ? { ...(existing as Measured), value }
        : { value, provenance: { ...USER_PROVENANCE } }
    measured.provenance = { ...USER_PROVENANCE }
    setAtPath(next, path, measured)
    return next
  })
  emit()
}

export function deleteSubstance(id: string): void {
  if (!userRecords.some((r) => r.id === id)) return
  userRecords = userRecords.filter((r) => r.id !== id)
  workingSet = workingSet.filter((x) => x !== id)
  removeItem(`substance_${id}`)
  emit()
}

// --------------------------------------------------------------------------- paths

/** Dotted-path read. User records never carry array indices, so no bracket handling. */
function readAtPath(obj: Record<string, unknown>, path: string): unknown {
  let node: unknown = obj
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let node = obj
  for (const key of keys.slice(0, -1)) {
    const child = node[key]
    if (typeof child !== 'object' || child === null) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[keys[keys.length - 1]] = value
}

/** Structural copy deep enough for the nested plain objects a user record holds. */
function structuredCloneish(record: SubstanceRecord): SubstanceRecord {
  return JSON.parse(JSON.stringify(record)) as SubstanceRecord
}
