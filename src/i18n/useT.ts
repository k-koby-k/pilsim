/**
 * `useT()` — the translate hook. Owned by Agent UI-A (src/i18n/**).
 *
 *     const t = useT()
 *     <h1>{t('substances.pageTitle')}</h1>
 *     <p>{t('substances.matchCount', { total: 12, capped: false })}</p>
 *
 * Falls back current-language -> English -> the key itself, in that order, so a
 * missing translation (Uzbek or Russian) is never worse than readable English and a
 * typo'd key is at least visible during development rather than silently blank.
 */

import { useCallback } from 'react'
import { dictionaries, type DictKey, type Lang } from './dictionary'
import { useLang } from './store'

type Vars = Record<string, string | number | boolean | undefined>

function resolve(lang: Lang, key: DictKey, vars: Vars): string {
  const localized = lang === 'uz' ? dictionaries.uz[key] : lang === 'ru' ? dictionaries.ru[key] : undefined
  const entry = localized ?? dictionaries.en[key]
  if (entry === undefined) return key
  return typeof entry === 'function' ? entry(vars as Record<string, string | number>) : entry
}

export type TFunction = (key: DictKey, vars?: Vars) => string

export function useT(): TFunction {
  const lang = useLang()
  return useCallback((key: DictKey, vars: Vars = {}) => resolve(lang, key, vars), [lang])
}

export { useLang, getLang, setLang } from './store'
export type { Lang, DictKey } from './dictionary'
