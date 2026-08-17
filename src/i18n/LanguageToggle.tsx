/**
 * The English / Uzbek / Russian toggle. Owned by Agent UI-A (src/i18n/**), mounted
 * once in the sidebar (src/ui/shell/Sidebar.tsx) so it is reachable from every page.
 */

import { useLang, setLang } from './store'
import { useT } from './useT'

export function LanguageToggle() {
  const lang = useLang()
  const t = useT()
  return (
    <div className="seg" role="group" aria-label={t('lang.toggle.label')}>
      <button
        type="button"
        className="seg-btn"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        className="seg-btn"
        aria-pressed={lang === 'uz'}
        onClick={() => setLang('uz')}
      >
        {t('lang.uz')}
      </button>
      <button
        type="button"
        className="seg-btn"
        aria-pressed={lang === 'ru'}
        onClick={() => setLang('ru')}
      >
        {t('lang.ru')}
      </button>
    </div>
  )
}
