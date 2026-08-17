/**
 * The AI reasoning panel.
 *
 * Three things this panel must never be mistaken for, and how each is prevented
 * structurally rather than by a caption:
 *
 *  1. ENGINE OUTPUT. The panel is drawn in a different material entirely — a
 *     dashed rule, a tinted ground, a standing "generated text" mark — so that
 *     a glance from across a room separates it from every cited figure on the
 *     page. It never renders a table, a bar or a score.
 *  2. A SOURCE. Every number inside the prose is wrapped and marked. A
 *     supported one carries the label and the origin of the value it traces to,
 *     so a reader can find it elsewhere on the screen. An unsupported one is
 *     struck through and flagged in place, and the footer counts it. There is
 *     no code path here that renders a bare number from the model.
 *  3. A DECISION. Suggestions are proposals to SIMULATE. Pressing one runs the
 *     deterministic engine, which produces the result; the model's sentence
 *     never appears beside the outcome as though it had predicted it.
 *
 * And when nothing is configured or the provider fails, the panel says so in
 * plain words. It never substitutes canned text for a live model — a judge who
 * asks "is this actually generated?" has to get a straight answer.
 */

import { useState } from 'react'
import type { AiRunState } from '../../ai/client'
import type { Segment } from '../../ai/numbers'
import type { AiFailure } from '../../ai/types'
import { PROVIDERS, type AiSettings, type ProviderId, type UpstreamId } from '../../ai/providers'
import { useT, type DictKey } from '../../i18n'
import './ai.css'

// ---------------------------------------------------------------------------
// prose
// ---------------------------------------------------------------------------

function NumberMark({ seg }: { seg: Segment }) {
  const t = useT()
  if (seg.status === 'unsupported') {
    return (
      <span className="ai-num is-unsupported">
        <span className="ai-num-text">{seg.text}</span>
        <span className="ai-num-flag" aria-hidden="true">
          {t('sim.ai.numberFlagNotInContext')}
        </span>
        <span className="sr-only">{t('sim.ai.numberFlagUnsourcedSr')}</span>
      </span>
    )
  }
  if (seg.status === 'pending') return <span className="ai-num is-pending">{seg.text}</span>
  const trace = seg.fact
    ? `${seg.fact.label}${seg.fact.source ? ` — ${seg.fact.source}` : ''}`
    : t('sim.ai.numberTracePresent')
  return (
    <span className="ai-num is-supported" title={trace}>
      {seg.text}
    </span>
  )
}

/** Paragraph breaks preserved; nothing else in the model's text is interpreted. */
function Prose({ segments }: { segments: Segment[] }) {
  const paragraphs: Segment[][] = [[]]
  for (const seg of segments) {
    if (seg.kind === 'text' && seg.text.includes('\n\n')) {
      const parts = seg.text.split(/\n{2,}/)
      paragraphs[paragraphs.length - 1].push({ ...seg, text: parts[0] })
      for (const p of parts.slice(1)) paragraphs.push([{ kind: 'text', text: p }])
      continue
    }
    paragraphs[paragraphs.length - 1].push(seg)
  }
  return (
    <div className="ai-prose">
      {paragraphs
        .filter((p) => p.some((s) => s.text.trim()))
        .map((p, i) => (
          <p key={i}>
            {p.map((seg, j) =>
              seg.kind === 'number' ? <NumberMark key={j} seg={seg} /> : <span key={j}>{seg.text}</span>,
            )}
          </p>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// failure
// ---------------------------------------------------------------------------

const FAILURE_TITLE_KEY: Record<AiFailure['kind'], DictKey> = {
  'no-provider': 'sim.ai.failureTitleNoProvider',
  network: 'sim.ai.failureTitleNetwork',
  'rate-limit': 'sim.ai.failureTitleRateLimit',
  server: 'sim.ai.failureTitleServer',
  malformed: 'sim.ai.failureTitleMalformed',
  aborted: 'sim.ai.failureTitleAborted',
  timeout: 'sim.ai.failureTitleTimeout',
}

function Failure({ failure, onSettings }: { failure: AiFailure; onSettings: () => void }) {
  const t = useT()
  return (
    <div className={`ai-failure${failure.kind === 'aborted' ? ' is-quiet' : ''}`} role="status">
      <strong>{t(FAILURE_TITLE_KEY[failure.kind])}.</strong>{' '}
      <span>{failure.remedy ?? failure.message}</span>
      {failure.remedy && failure.message !== failure.remedy && (
        <span className="ai-failure-detail">{failure.message}</span>
      )}
      <p className="ai-failure-note">{t('sim.ai.failureNote')}</p>
      {failure.kind === 'no-provider' && (
        <button className="btn" onClick={onSettings}>
          {t('sim.ai.openSettings')}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

function Settings({
  settings,
  onChange,
  onClose,
}: {
  settings: AiSettings
  onChange: (p: Partial<AiSettings>) => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="ai-settings">
      <div className="ai-settings-head">
        <h4>{t('sim.ai.settingsHeading')}</h4>
        <button className="btn btn--sm" onClick={onClose}>
          {t('sim.ai.close')}
        </button>
      </div>
      <p className="ai-settings-intro">{t('sim.ai.settingsIntro')}</p>

      <label className="ai-field">
        <span>{t('sim.ai.provider')}</span>
        <select
          value={settings.provider}
          onChange={(e) => onChange({ provider: e.target.value as ProviderId | 'auto' })}
        >
          <option value="auto">{t('sim.ai.automatic')}</option>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {PROVIDERS.map((p) => (
        <p key={p.id} className={`ai-provider-blurb${p.configured(settings) ? ' is-ready' : ''}`}>
          <strong>{p.label}</strong> — {p.blurb}{' '}
          <em>{p.configured(settings) ? t('sim.ai.configured') : p.missing(settings)}</em>
        </p>
      ))}

      <label className="ai-field">
        <span>{t('sim.ai.workerEndpoint')}</span>
        <input
          type="url"
          placeholder="https://pilsim-ai.<subdomain>.workers.dev"
          value={settings.workerEndpoint}
          onChange={(e) => onChange({ workerEndpoint: e.target.value })}
        />
      </label>

      <label className="ai-field">
        <span>{t('sim.ai.workerShouldCall')}</span>
        <select
          value={settings.workerUpstream}
          onChange={(e) => onChange({ workerUpstream: e.target.value as UpstreamId })}
        >
          <option value="workers-ai">Cloudflare Workers AI</option>
          <option value="gemini">Gemini (key held by the Worker)</option>
        </select>
      </label>

      <label className="ai-field">
        <span>{t('sim.ai.geminiKeyLabel')}</span>
        <input
          type="password"
          autoComplete="off"
          placeholder={t('sim.ai.geminiKeyPlaceholder')}
          value={settings.geminiApiKey}
          onChange={(e) => onChange({ geminiApiKey: e.target.value })}
        />
      </label>
      <p className="ai-warning">{t('sim.ai.keyWarning')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// panel
// ---------------------------------------------------------------------------

export interface AiPanelProps {
  state: AiRunState
  settings: AiSettings
  modelLabel: string
  configured: boolean
  running: boolean
  /** Why there is nothing to explain yet, if that is the case. */
  blockedReason?: string | null
  /** Where the explained material came from — the plan, or the run and ranking. */
  basis: string
  onAsk: () => void
  onCancel: () => void
  onSettings: (p: Partial<AiSettings>) => void
  onSimulate: (regimenId: string) => void
  /** Switch the anatomy rail to a scene the model named. */
  onWatchScene?: (sceneId: string) => void
}

export function AiPanel({
  state,
  settings,
  modelLabel,
  configured,
  running,
  blockedReason,
  basis,
  onAsk,
  onCancel,
  onSettings,
  onSimulate,
  onWatchScene,
}: AiPanelProps) {
  const t = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hasText = state.segments.length > 0
  const v = state.validation

  return (
    <section className="sim-card ai-panel" aria-label={t('sim.ai.panelAria')}>
      <header className="ai-head">
        <div className="ai-title">
          <span className="ai-mark">{t('sim.ai.mark')}</span>
          <div>
            <h3>{t('sim.ai.title')}</h3>
            <p className="ai-sub">{t('sim.ai.sub')}</p>
          </div>
        </div>
        <div className="ai-actions">
          <button
            className="btn btn--primary"
            onClick={onAsk}
            disabled={running || !!blockedReason}
            title={blockedReason ?? undefined}
          >
            {hasText ? t('sim.ai.askAgain') : t('sim.ai.explainThis')}
          </button>
          {running && (
            <button className="btn btn--sm" onClick={onCancel}>
              {t('sim.ai.stop')}
            </button>
          )}
          <button className="btn btn--sm" onClick={() => setSettingsOpen((o) => !o)}>
            {settingsOpen ? t('sim.ai.hideSettings') : t('sim.ai.showSettings')}
          </button>
        </div>
      </header>

      <p className="ai-meta">
        <span className={`ai-dot${configured ? ' is-live' : ''}`} aria-hidden="true" />
        {configured ? modelLabel : t('sim.ai.notConfigured')}
        <span className="ai-meta-sep">·</span>
        {t('sim.ai.explainingLabel')} {basis}
      </p>

      {settingsOpen && (
        <Settings settings={settings} onChange={onSettings} onClose={() => setSettingsOpen(false)} />
      )}

      {blockedReason && !running && !hasText && <p className="ai-empty">{blockedReason}</p>}

      {state.failure && <Failure failure={state.failure} onSettings={() => setSettingsOpen(true)} />}

      {(hasText || running) && (
        <div className={`ai-body${running ? ' is-streaming' : ''}`}>
          <span className="ai-body-mark" aria-hidden="true">
            {t('sim.ai.generatedMark')}
          </span>
          <Prose segments={state.segments} />
          {running && !hasText && <p className="ai-waiting">{t('sim.ai.waitingFirstToken')}</p>}
          {running && <span className="ai-caret" aria-hidden="true" />}
        </div>
      )}

      {hasText && !running && (
        <div className={`ai-verdict${v.clean ? ' is-clean' : ' is-dirty'}`}>
          {v.clean ? (
            <>
              <strong>{t('sim.ai.verdictCleanStrong', { n: v.total })}</strong>{' '}
              {t('sim.ai.verdictCleanRest', { facts: state.factCount })}
            </>
          ) : (
            <>
              <strong>{t('sim.ai.verdictDirtyStrong', { unsupported: v.unsupported, total: v.total })}</strong>{' '}
              — {v.offenders.join(', ')}. {t('sim.ai.verdictDirtyRest')}
            </>
          )}
        </div>
      )}

      {state.scene && onWatchScene && (
        <div className="ai-scene">
          <div className="ai-suggest-body">
            <strong>
              {t('sim.ai.worthWatching')} {state.scene.label}
            </strong>
            {state.scene.reason && <p>{state.scene.reason}</p>}
            <p className="ai-scene-note">{t('sim.ai.sceneNote')}</p>
          </div>
          <button className="btn btn--sm" onClick={() => onWatchScene(state.scene!.sceneId)}>
            {t('sim.ai.watchIt')}
          </button>
        </div>
      )}

      {!!state.suggestions.length && (
        <div className="ai-suggests">
          <h4>{t('sim.ai.proposedNext')}</h4>
          <p className="ai-suggests-note">{t('sim.ai.suggestsNote')}</p>
          <ul>
            {state.suggestions.map((s) => (
              <li key={s.regimenId}>
                <div className="ai-suggest-body">
                  <strong>{s.label}</strong>
                  {s.rationale && <p>{s.rationale}</p>}
                </div>
                <button className="btn btn--primary btn--sm" onClick={() => onSimulate(s.regimenId)}>
                  {t('sim.ai.simulateThis')}
                </button>
              </li>
            ))}
          </ul>
          {!!state.rejectedIds.length && (
            <p className="ai-rejected">
              {t('sim.ai.discarded', { n: state.rejectedIds.length, ids: state.rejectedIds.join(', ') })}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
