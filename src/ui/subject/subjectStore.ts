/**
 * The subject library store.
 *
 * PERSISTENCE. `src/ui/shell/savedStore.ts` is the right place to register something so it
 * appears under the sidebar's Saved list, and this module does exactly that — but that store
 * says of itself "nothing here persists across a reload", and a library of patients a user
 * built during a demo has to survive one. So the library itself lives in localStorage under
 * one key, and every user-created subject is ALSO pushed into savedStore so the sidebar
 * behaves the same as it does for pills. Seeded scenarios are deliberately not pushed: the
 * Saved list is for what you made, not for what shipped with the product.
 *
 * The selected subject is what the simulation runs against, so it is persisted separately and
 * published on `window.__pilsim_subject__`, mirroring the `window.__pilsim_pills__` handoff
 * that src/ui/simulation/presets.ts already documents for the Pills page.
 */

import { useSyncExternalStore } from 'react'
import type { PatientInputs } from '../../types'
import { removeItem, saveItem } from '../shell/savedStore'
import { SUBJECT_SEEDS, newSubjectInputs } from './library'

export interface Subject {
  id: string
  label: string
  /** One plain sentence describing what this subject demonstrates. */
  interesting: string
  inputs: PatientInputs
  /** True for the scenarios that ship with the product. */
  seeded: boolean
}

const LIBRARY_KEY = 'pilsim.subjects.v1'
const SELECTED_KEY = 'pilsim.subject.selected.v1'

declare global {
  interface Window {
    /** The subject the simulation should run against. Read-only handoff for other pages. */
    __pilsim_subject__?: { id: string; label: string; inputs: PatientInputs }
  }
}

function seeded(): Subject[] {
  return SUBJECT_SEEDS.map((s) => ({
    id: s.id,
    label: s.label,
    interesting: s.interesting,
    inputs: s.inputs,
    seeded: true,
  }))
}

function readStorage(): Subject[] | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    // Defensive: a stored library from an older shape must not crash the page.
    return parsed.filter(
      (s): s is Subject =>
        s && typeof s.id === 'string' && typeof s.label === 'string' && s.inputs && typeof s.inputs === 'object',
    )
  } catch {
    return null
  }
}

let subjects: Subject[] = readStorage() ?? seeded()
let selectedId: string =
  (typeof localStorage !== 'undefined' ? localStorage.getItem(SELECTED_KEY) : null) ?? subjects[0]?.id ?? ''

if (!subjects.some((s) => s.id === selectedId)) selectedId = subjects[0]?.id ?? ''

const listeners = new Set<() => void>()

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(subjects))
    localStorage.setItem(SELECTED_KEY, selectedId)
  } catch {
    // A full or disabled localStorage must not break the page; the session still works.
  }
}

function publishSelected() {
  if (typeof window === 'undefined') return
  const s = subjects.find((x) => x.id === selectedId)
  window.__pilsim_subject__ = s ? { id: s.id, label: s.label, inputs: s.inputs } : undefined
}

function emit() {
  persist()
  publishSelected()
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// --------------------------------------------------------------------------- reads

export function getSubjects(): Subject[] {
  return subjects
}

export function getSelectedId(): string {
  return selectedId
}

export function useSubjects(): Subject[] {
  return useSyncExternalStore(subscribe, getSubjects, getSubjects)
}

export function useSelectedId(): string {
  return useSyncExternalStore(subscribe, getSelectedId, getSelectedId)
}

// --------------------------------------------------------------------------- writes

let counter = 0
function nextId(): string {
  counter += 1
  return `subj_${Date.now().toString(36)}_${counter}`
}

/** Mirror a user-built subject into the sidebar's Saved list. Seeds stay out of it. */
function mirror(s: Subject) {
  if (s.seeded) return
  saveItem({
    id: `subject_${s.id}`,
    kind: 'subject',
    label: s.label,
    page: 'subject',
    detail: describe(s.inputs),
  })
}

export function describe(i: PatientInputs): string {
  const sex = i.sex === 'female' ? 'F' : 'M'
  const conds = (i.comorbidities ?? []).length
  return `${i.age_years} ${sex} · ${i.sbp_mmHg}/${i.dbp_mmHg} mmHg${conds ? ` · ${conds} condition${conds === 1 ? '' : 's'}` : ''}`
}

export function selectSubject(id: string): void {
  if (selectedId === id) return
  selectedId = id
  emit()
}

export function addSubject(label = 'New subject'): Subject {
  const s: Subject = {
    id: nextId(),
    label,
    interesting: '',
    inputs: newSubjectInputs(),
    seeded: false,
  }
  subjects = [...subjects, s]
  selectedId = s.id
  mirror(s)
  emit()
  return s
}

export function duplicateSubject(id: string): Subject | null {
  const src = subjects.find((s) => s.id === id)
  if (!src) return null
  const copy: Subject = {
    id: nextId(),
    label: `${src.label} (copy)`,
    interesting: src.interesting,
    inputs: { ...src.inputs, comorbidities: [...(src.inputs.comorbidities ?? [])] },
    seeded: false,
  }
  const at = subjects.findIndex((s) => s.id === id)
  subjects = [...subjects.slice(0, at + 1), copy, ...subjects.slice(at + 1)]
  selectedId = copy.id
  mirror(copy)
  emit()
  return copy
}

export function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>): void {
  let touched: Subject | null = null
  subjects = subjects.map((s) => {
    if (s.id !== id) return s
    // Editing a shipped scenario makes it yours; it stops being a seed so a library reset
    // cannot silently throw the edit away.
    touched = { ...s, ...patch, seeded: false }
    return touched
  })
  if (touched) mirror(touched)
  emit()
}

export function updateInputs(id: string, patch: Partial<PatientInputs>): void {
  const s = subjects.find((x) => x.id === id)
  if (!s) return
  updateSubject(id, { inputs: { ...s.inputs, ...patch } })
}

export function deleteSubject(id: string): void {
  if (!subjects.some((s) => s.id === id)) return
  const at = subjects.findIndex((s) => s.id === id)
  subjects = subjects.filter((s) => s.id !== id)
  removeItem(`subject_${id}`)
  if (selectedId === id) selectedId = subjects[Math.min(at, subjects.length - 1)]?.id ?? ''
  emit()
}

/** Put the shipped scenarios back, keeping anything the user built. */
export function restoreSeeds(): void {
  const mine = subjects.filter((s) => !s.seeded)
  const have = new Set(subjects.map((s) => s.id))
  const missing = seeded().filter((s) => !have.has(s.id))
  subjects = [...seeded().filter((s) => have.has(s.id) || missing.some((m) => m.id === s.id)), ...mine]
  if (!subjects.some((s) => s.id === selectedId)) selectedId = subjects[0]?.id ?? ''
  emit()
}

publishSelected()
