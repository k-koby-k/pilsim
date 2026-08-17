/**
 * Left navigation rail. Owned by Agent UI-A.
 *
 * The `PageId` union and the `{ current, onNavigate }` props are the contract with
 * src/App.tsx, which this agent does not own. Do not change either signature.
 */

import { useState, type ReactNode } from 'react'
import { useData } from '../../data/DataProvider'
import { DISCLAIMER_SHORT_I18N } from '../../report/disclaimer'
import { LanguageToggle, useLang, useT, type DictKey } from '../../i18n'
import { clearHistory, useHistory } from './historyStore'
import { requestRunReplay } from './handoff'
import { signedBp } from '../simulation/ReportPanel'

export type PageId = 'home' | 'substances' | 'pills' | 'subject' | 'simulation'

interface NavEntry {
  id: PageId
  labelKey: DictKey
  icon: ReactNode
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const NAV: NavEntry[] = [
  {
    id: 'home',
    labelKey: 'nav.home',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
        <path d="M2.2 7.2 8 2.4l5.8 4.8" />
        <path d="M3.8 8.4v5.2h8.4V8.4" />
      </svg>
    ),
  },
  {
    id: 'substances',
    labelKey: 'nav.substances',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
        <path d="M6.2 1.8v3.6L2.9 11.3a2 2 0 0 0 1.7 3h6.8a2 2 0 0 0 1.7-3L9.8 5.4V1.8" />
        <path d="M5.2 1.8h5.6" />
        <path d="M4.4 9.4h7.2" />
      </svg>
    ),
  },
  {
    id: 'pills',
    labelKey: 'nav.pills',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
        <rect x="1.2" y="4.8" width="13.6" height="6.4" rx="3.2" />
        <path d="M8 4.8v6.4" />
      </svg>
    ),
  },
  {
    id: 'subject',
    labelKey: 'nav.subject',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
        <circle cx="8" cy="4.4" r="2.6" />
        <path d="M2.6 14.2a5.4 5.4 0 0 1 10.8 0" />
      </svg>
    ),
  },
  {
    id: 'simulation',
    labelKey: 'nav.simulation',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
        <path d="M1.4 9.6h2.4l1.6-5.4 2.2 8.6 1.8-5 1.2 2.6h3.9" />
      </svg>
    ),
  },
]

export function Sidebar({
  current,
  onNavigate,
}: {
  current: PageId
  onNavigate: (p: PageId) => void
}) {
  const history = useHistory()
  const { loading, error } = useData()
  const t = useT()
  const lang = useLang()
  const [settingsOpen, setSettingsOpen] = useState(false)

  /** A past run, handed to the Simulation page — which re-runs it against the
   *  current engine and data rather than resurrecting the old frames. See
   *  `historyStore.ts` for why. */
  const replay = (entry: (typeof history)[number]) => {
    requestRunReplay({
      regimen: entry.regimen,
      subjectId: entry.subjectId,
      subjectLabel: entry.subjectLabel,
      subjectInputs: entry.subjectInputs,
      options: entry.options,
    })
    onNavigate('simulation')
  }

  return (
    <nav className="sidebar" aria-label={t('sidebar.primaryNav')}>
      <div className="sidebar-brand">
        <svg
          className="sidebar-mark"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <rect
            x="2.5"
            y="7.5"
            width="19"
            height="9"
            rx="4.5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.6"
          />
          <path d="M12 7.5v9" stroke="var(--accent)" strokeWidth="1.6" />
          <circle cx="7.2" cy="12" r="1.5" fill="var(--accent)" />
        </svg>
        <div>
          <div className="sidebar-wordmark">PilSim</div>
          <span className="sidebar-tagline">{t('app.tagline')}</span>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="nav-item"
            aria-current={current === entry.id ? 'page' : undefined}
            onClick={() => onNavigate(entry.id)}
          >
            <span className="nav-icon">{entry.icon}</span>
            <span>{t(entry.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <span>{t('sidebar.history')}</span>
        <span className="mono">{history.length}</span>
      </div>

      <div className="sidebar-saved">
        {history.length === 0 ? (
          <p className="sidebar-empty">{t('sidebar.historyEmpty')}</p>
        ) : (
          <>
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="saved-item history-item"
                title={t('sidebar.replayRun', { regimen: entry.regimenLabel, subject: entry.subjectLabel })}
                onClick={() => replay(entry)}
              >
                <span className="saved-dot history-dot" />
                <span className="history-item-body">
                  <span className="saved-label">
                    {entry.regimenLabel} · {entry.subjectLabel}
                  </span>
                  <span className="history-item-meta">
                    {t('sidebar.historyBp', { value: signedBp(entry.deltaSbp) })} ·{' '}
                    {new Date(entry.at).toLocaleString(lang)}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" className="sidebar-clear" onClick={clearHistory}>
              {t('sidebar.clearHistory')}
            </button>
          </>
        )}
      </div>

      <div className="sidebar-foot">
        {loading ? (
          <>{t('sidebar.loading')}</>
        ) : error ? (
          <span style={{ color: 'var(--bad)' }}>{t('sidebar.error')}</span>
        ) : (
          <>
            <strong>{t('sidebar.researchSimulator')}</strong>
            {DISCLAIMER_SHORT_I18N[lang]}
          </>
        )}
      </div>
      {/* Pinned bottom-left, visually separated from the nav above by its own
          border — settings are configuration, not a destination, so they do
          not join the PageId nav. The language toggle lives here now instead
          of loose in the sidebar body; the AI provider settings stay inside
          the AI panel on the Simulation page, where opening them is already
          wired to that panel's own ask/retry flow. */}
      <div className="sidebar-settings">
        <button
          type="button"
          className="sidebar-settings-btn"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <span className="nav-icon">
            <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps} aria-hidden>
              <circle cx="8" cy="8" r="2.3" />
              <path d="M8 1.8v1.7M8 12.5v1.7M14.2 8h-1.7M3.5 8H1.8M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2M12.4 12.4l-1.2-1.2M4.8 4.8 3.6 3.6" />
            </svg>
          </span>
          <span>{t('sidebar.settings')}</span>
        </button>
        {settingsOpen && (
          <div className="sidebar-settings-panel" role="dialog" aria-label={t('sidebar.settings')}>
            <div className="sidebar-settings-row">
              <span className="sidebar-settings-label">{t('lang.toggle.label')}</span>
              <LanguageToggle />
            </div>
          </div>
        )}
      </div>

    </nav>
  )
}
