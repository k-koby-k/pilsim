/**
 * Rendering the rules-engine result for a composition. Owned by Agent UI-A.
 *
 * The engine returns positive rules as well as prohibitions, and the three negative
 * tiers are not interchangeable, so they are rendered differently and in this order:
 *
 *   BLOCKERS   rank 7, contraindicated_absolute — the run is refused
 *   OVERRIDE   rank 6, contraindicated_relative — proceeds only on an explicit override
 *   WARNINGS   ranks 3-5, minor / moderate / major
 *   POSITIVES  ranks 1-2, preferred / compelling — reasons TO use this composition
 *   INFO       rank 0
 */

import { useState } from 'react'
import { useT, type DictKey } from '../../i18n'
import type { RuleHit } from '../../types'
import { ProvenanceDetail, SeverityBadge } from '../shell/primitives'
import {
  VERDICT_KEY,
  verdictOf,
  type CompositionEvaluation,
  type Verdict,
} from './rulesAdapter'

const VERDICT_TEXT_KEY: Record<Verdict, DictKey> = {
  blocked: 'findings.verdictText.blocked',
  override: 'findings.verdictText.override',
  warn: 'findings.verdictText.warn',
  clear: 'findings.verdictText.clear',
}

export function VerdictBanner({ evaluation }: { evaluation: CompositionEvaluation }) {
  const t = useT()
  const v = verdictOf(evaluation)
  return (
    <div className={`verdict-banner verdict--${v}`}>
      <VerdictGlyph verdict={v} />
      <div className="grow">
        <strong>{t(VERDICT_KEY[v])}</strong>
        <div style={{ color: 'var(--text-dim)', fontWeight: 400, marginTop: 2 }}>
          {t(VERDICT_TEXT_KEY[v])}
        </div>
      </div>
    </div>
  )
}

function VerdictGlyph({ verdict }: { verdict: Verdict }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (verdict === 'blocked') {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.4" />
        <path d="M5.2 5.2 14.8 14.8" />
      </svg>
    )
  }
  if (verdict === 'clear') {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.4" />
        <path d="m6.4 10.2 2.5 2.5 4.7-5.2" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M10 2.6 18.2 16.6H1.8Z" />
      <path d="M10 7.6v4" />
      <path d="M10 14.1h.01" />
    </svg>
  )
}

export function FindingsList({ evaluation }: { evaluation: CompositionEvaluation }) {
  const t = useT()
  const groups: { key: string; label: string; hits: RuleHit[] }[] = [
    { key: 'blockers', label: t('findings.group.blockers'), hits: evaluation.blockers },
    { key: 'overrides', label: t('findings.group.overrides'), hits: evaluation.overrides },
    { key: 'warnings', label: t('findings.group.warnings'), hits: evaluation.warnings },
    { key: 'positives', label: t('findings.group.positives'), hits: evaluation.positives },
    { key: 'info', label: t('findings.group.info'), hits: evaluation.infos },
  ].filter((g) => g.hits.length > 0)

  if (groups.length === 0) {
    return (
      <p className="note-line">{t('findings.noRuleFired')}</p>
    )
  }

  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="composer-head" style={{ marginBottom: 'var(--sp-2)' }}>
            {g.label} · {g.hits.length}
          </div>
          <div className="findings">
            {g.hits.map((hit) => (
              <Finding key={hit.ruleId} hit={hit} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Finding({ hit }: { hit: RuleHit }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className={`finding finding--${hit.severity}`}>
      <div className="finding-head">
        <div className="grow">
          <div className="finding-title">{hit.title}</div>
          {hit.warningText ? <div className="finding-short">{hit.warningText}</div> : null}
        </div>
        <div className="card-actions">
          <SeverityBadge severity={hit.severity} showRank />
          <span className="finding-id">{hit.ruleId}</span>
        </div>
      </div>

      {hit.mechanism ? <div className="finding-mech">{hit.mechanism}</div> : null}

      <div className="cluster" style={{ marginTop: 'var(--sp-2)' }}>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(!open)}>
          {open ? t('findings.hideEvidence') : t('findings.evidenceAndEffects')}
        </button>
        <span className="dim" style={{ fontSize: 'var(--fs-xs)' }}>
          {t('findings.effectCount', { direction: hit.direction, n: hit.effects.length })}
        </span>
      </div>

      {open ? (
        <>
          {hit.citation ? <ProvenanceDetail provenance={hit.citation} /> : null}
          <div className="prov-detail">
            <div className="prov-detail-line">
              <span className="prov-detail-key">{t('findings.effects')}</span>
              <span className="prov-detail-val mono" style={{ fontSize: 'var(--fs-xs)' }}>
                {hit.effects.length === 0
                  ? '—'
                  : hit.effects.map((e, i) => (
                      <div key={i}>
                        {e.op}
                        {typeof e.target === 'string' ? ` → ${e.target}` : ''}
                        {typeof e.substance === 'string' ? ` → ${e.substance}` : ''}
                        {typeof e.factor === 'number' ? ` ×${e.factor}` : ''}
                        {typeof e.delta === 'number' ? ` ${e.delta > 0 ? '+' : ''}${e.delta}` : ''}
                        {typeof e.max_mg_per_day === 'number' ? ` ≤${e.max_mg_per_day} mg/day` : ''}
                      </div>
                    ))}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Rules this composition touches but which cannot be judged without a test subject. */
export function DeferredNote({ evaluation }: { evaluation: CompositionEvaluation }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (evaluation.deferred.length === 0) {
    return (
      <p className="note-line">
        {t('findings.deferred.noneRemain', { engine: evaluation.engine })}
      </p>
    )
  }
  return (
    <div>
      <p className="note-line">
        {t('findings.deferred.some', { engine: evaluation.engine })}{' '}
        <b style={{ color: 'var(--sev-moderate-fg)' }}>
          {t('findings.deferred.moreRules', { n: evaluation.deferred.length })}
        </b>{' '}
        {t('findings.deferred.matchNeedSubject')}{' '}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(!open)}>
          {open ? t('findings.deferred.hide') : t('findings.deferred.list')}
        </button>
      </p>
      {open ? (
        <div className="prov-detail" style={{ borderLeftColor: 'var(--sev-moderate-line)' }}>
          {evaluation.deferred.map((d) => (
            <div key={d.id} className="prov-detail-line">
              <span className="prov-detail-key">
                <SeverityBadge severity={d.severity} showRank />
              </span>
              <span className="prov-detail-val">
                {d.title}{' '}
                <span className="dim mono">
                  — {t('findings.deferred.needs', { needs: d.needs.join(', ') })}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The rest of what the engine returns. Not decoration — the dose ceilings, risk
 * channels and monitoring plan are what the simulation and the report consume, so
 * showing them here makes the hand-off between the two pages legible on stage.
 */
export function EngineOutput({ evaluation }: { evaluation: CompositionEvaluation }) {
  const t = useT()
  const r = evaluation.result
  const risks = Object.entries(r.risks).filter(([, v]) => v > 0)
  const caps = Object.entries(r.doseCaps)
  const monitors = r.monitoring

  if (risks.length === 0 && caps.length === 0 && monitors.length === 0) return null

  return (
    <div className="prov-detail">
      <div className="prov-detail-line">
        <span className="prov-detail-key">{t('findings.engine.tier')}</span>
        <span className="prov-detail-val mono">{evaluation.tier}</span>
      </div>
      {caps.length > 0 ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('findings.engine.doseCaps')}</span>
          <span className="prov-detail-val mono">
            {caps.map(([k, v]) => `${k} ≤ ${v} mg/day`).join(' · ')}
          </span>
        </div>
      ) : null}
      {risks.length > 0 ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('findings.engine.risks')}</span>
          <span className="prov-detail-val mono">
            {risks
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${k.replace(/^risk\./, '')} ${(v * 100).toFixed(1)}%`)
              .join(' · ')}
          </span>
        </div>
      ) : null}
      {monitors.length > 0 ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('findings.engine.monitor')}</span>
          <span className="prov-detail-val mono">
            {monitors
              .map((m) => `${m.lab}${m.atDays.length ? ` @ d${m.atDays.join(',')}` : ''}`)
              .join(' · ')}
          </span>
        </div>
      ) : null}
    </div>
  )
}
