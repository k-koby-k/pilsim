/**
 * i18n barrel. Owned by Agent UI-A.
 *
 *     import { useT, useLang, setLang, LanguageToggle } from '../../i18n'
 */

export { useT } from './useT'
export { useLang, getLang, setLang } from './store'
export type { Lang, DictKey } from './dictionary'
export { LanguageToggle } from './LanguageToggle'
