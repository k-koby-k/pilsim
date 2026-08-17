/**
 * Language store — a module-level store in the same shape as savedStore.ts and
 * substanceStore.ts, so it needs no provider and any component can read or set it.
 *
 * Owned by Agent UI-A (src/i18n/**).
 *
 * Default: Uzbek if the browser's language is Uzbek, Russian if the browser's language
 * is Russian, English otherwise. Uzbek is checked first so a browser reporting both
 * (unlikely, but 'uz' is checked before 'ru' below regardless) resolves the same way
 * this store has always resolved it. The choice is then persisted to localStorage so a
 * reload keeps what the user picked.
 */

import { useSyncExternalStore } from 'react'
import type { Lang } from './dictionary'

const STORAGE_KEY = 'pilsim.lang.v1'

function detectDefault(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const langs = navigator.languages && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
  for (const l of langs) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('uz')) return 'uz'
  }
  for (const l of langs) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('ru')) return 'ru'
  }
  return 'en'
}

function readStored(): Lang | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'en' || raw === 'uz' || raw === 'ru' ? raw : null
  } catch {
    return null
  }
}

let lang: Lang = readStored() ?? detectDefault()
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

function getSnapshot(): Lang {
  return lang
}

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  if (next === lang) return
  lang = next
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* a full or disabled localStorage must not break the page */
    }
  }
  emit()
}

/** Subscribes the component to the current language so it re-renders on toggle. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
