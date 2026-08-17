/**
 * The "saved items" list that hangs under the nav in the sidebar.
 *
 * A deliberately tiny module-level store rather than a context, so that any page can
 * register something without the shell having to know about that page. Owned by
 * Agent UI-A but open to all UI agents:
 *
 *     import { saveItem, removeItem } from '../shell/savedStore'
 *     saveItem({ id: 'pill_custom_1', kind: 'pill', label: 'My combination', page: 'pills' })
 *
 * Nothing here persists across a reload — this is demo-session state, not storage.
 */

import { useSyncExternalStore } from 'react'
import type { PageId } from './Sidebar'

export type SavedKind = 'pill' | 'subject' | 'run' | 'substance'

export interface SavedItem {
  id: string
  kind: SavedKind
  label: string
  /** Which page to open when the item is clicked. */
  page: PageId
  /** Optional secondary line, e.g. "10 mg + 12.5 mg". */
  detail?: string
}

let items: SavedItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function getSnapshot(): SavedItem[] {
  return items
}

export function saveItem(item: SavedItem): void {
  const i = items.findIndex((x) => x.id === item.id)
  items = i >= 0 ? items.map((x, n) => (n === i ? item : x)) : [...items, item]
  emit()
}

export function removeItem(id: string): void {
  if (!items.some((x) => x.id === id)) return
  items = items.filter((x) => x.id !== id)
  emit()
}

export function getSavedItems(): SavedItem[] {
  return items
}

export function useSavedItems(): SavedItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Colour dot per kind. Tokens are documented in shell/styles.css. */
export const SAVED_KIND_COLOR: Record<SavedKind, string> = {
  pill: 'var(--accent)',
  subject: 'var(--sev-preferred-fg)',
  run: 'var(--sev-moderate-fg)',
  substance: 'var(--modified)',
}
