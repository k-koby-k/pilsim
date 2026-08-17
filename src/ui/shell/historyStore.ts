/**
 * Run history — the sidebar's last section, "History" (replacing "Saved").
 *
 * The product owner's own words: it should show "the history of the analyses,
 * like simulations that were done" — not composed pills, not created
 * substances, not built subjects. Those still register with
 * `src/ui/shell/savedStore.ts` (subjectStore, substanceStore and the Pills
 * page all call it), but the sidebar no longer renders that list; this module
 * is what it renders instead.
 *
 * PERSISTENCE follows `subjectStore.ts`'s pattern exactly: one localStorage
 * key, a module-level array, `useSyncExternalStore` for the read side, and
 * defensive parsing on load — a stored entry written by an older build is
 * discarded rather than crashing the page (see `isEntry` below). Capped at
 * `MAX_ENTRIES`; the oldest entry is evicted first so the list cannot grow
 * without bound.
 *
 * WHAT AN ENTRY DOES NOT DO: it never redisplays a frozen result as though it
 * were live. `deltaSbp`/`deltaDbp` are shown as the headline number a past run
 * produced, labelled with its own timestamp — never merged into the current
 * page state. Re-opening a past run (see `requestRunReplay` in `handoff.ts`)
 * always re-runs the same regimen against the same patient through the
 * CURRENT engine and CURRENT data, rather than trying to resurrect the old
 * frames — which is also why an entry stores the regimen and the patient
 * inputs it ran with, not the streamed output itself. That is a deliberate,
 * honest second-best to reopening the exact result: see the task brief this
 * module was built against for why reconstructing the exact frames was judged
 * not practical (storage size, and the same staleness risk this file exists
 * to avoid).
 */

import { useSyncExternalStore } from 'react'
import type { PatientInputs, Regimen } from '../../types'

export interface RunHistoryEntry {
  id: string
  /** Epoch ms when the run completed. */
  at: number
  regimen: Regimen
  regimenLabel: string
  /** The subject preset id this ran against, if any — best-effort, for re-selecting
   *  the same picker entry on replay. May no longer exist; `subjectInputs` below is
   *  what replay actually runs against, so this going stale is harmless. */
  subjectId: string
  subjectLabel: string
  subjectInputs: PatientInputs
  options: {
    horizonHours: number
    outputEveryMin: number
    initial: 'steady_state' | 'first_dose'
    populationN: number
  }
  /** The headline this run produced — a placebo-corrected reduction, signed the same
   *  way `signedBp` in ReportPanel.tsx reads it. Shown as a PAST number, never
   *  re-derived or merged into a later run. */
  deltaSbp: number
  deltaDbp: number
}

const HISTORY_KEY = 'pilsim.history.v1'
const MAX_ENTRIES = 20

function isPatientInputs(v: unknown): v is PatientInputs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.age_years === 'number' &&
    (o.sex === 'male' || o.sex === 'female') &&
    typeof o.weight_kg === 'number' &&
    typeof o.height_cm === 'number' &&
    typeof o.sbp_mmHg === 'number' &&
    typeof o.dbp_mmHg === 'number'
  )
}

function isRegimen(v: unknown): v is Regimen {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.label === 'string' && Array.isArray(o.doses)
}

function isOptions(v: unknown): v is RunHistoryEntry['options'] {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.horizonHours === 'number' &&
    typeof o.outputEveryMin === 'number' &&
    (o.initial === 'steady_state' || o.initial === 'first_dose') &&
    typeof o.populationN === 'number'
  )
}

/** The whole shape of one stored entry, checked field by field — an older or
 *  malformed build's leftovers must be discarded, never thrown. */
function isEntry(v: unknown): v is RunHistoryEntry {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.at === 'number' &&
    isRegimen(o.regimen) &&
    typeof o.regimenLabel === 'string' &&
    typeof o.subjectId === 'string' &&
    typeof o.subjectLabel === 'string' &&
    isPatientInputs(o.subjectInputs) &&
    isOptions(o.options) &&
    typeof o.deltaSbp === 'number' &&
    typeof o.deltaDbp === 'number'
  )
}

function readStorage(): RunHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

let entries: RunHistoryEntry[] = readStorage()
const listeners = new Set<() => void>()

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // A full or disabled localStorage must not break the page; the session still works.
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

function getSnapshot(): RunHistoryEntry[] {
  return entries
}

export function useHistory(): RunHistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getHistory(): RunHistoryEntry[] {
  return entries
}

let counter = 0
function nextId(): string {
  counter += 1
  return `hist_${Date.now().toString(36)}_${counter}`
}

/** Record one completed simulation. Newest first; oldest evicted past `MAX_ENTRIES`. */
export function recordHistoryEntry(entry: Omit<RunHistoryEntry, 'id' | 'at'>): void {
  const full: RunHistoryEntry = { ...entry, id: nextId(), at: Date.now() }
  entries = [full, ...entries].slice(0, MAX_ENTRIES)
  emit()
}

export function clearHistory(): void {
  if (entries.length === 0) return
  entries = []
  emit()
}
