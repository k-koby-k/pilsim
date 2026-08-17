/**
 * Shared presentational primitives. Owned by Agent UI-A, free for any UI agent
 * to import:
 *
 *     import { Card, Row, SeverityBadge, ProvenanceChip } from '../shell/primitives'
 *
 * Props are deliberately minimal. Everything visual lives in src/ui/shell/styles.css
 * — see the comment block at the top of that file for the palette tokens.
 *
 * Rule of the house: a number never appears without its provenance nearby.
 */

import type { ReactNode } from 'react'
import type { Provenance, ProvenanceStatus, SeverityId, SourceTier } from '../../types'
import { STATUS_LABEL, TIER_LABEL } from '../../data/provenance'
import { useT, type DictKey } from '../../i18n'

/**
 * The house pattern for every "choose one of these" screen — pills, substances,
 * test subjects. Re-exported here so there is one import path for UI agents.
 * See src/ui/shell/LibraryCard.tsx for the rules of the pattern.
 */
export { LibraryCard, LibraryGrid } from './LibraryCard'
export type { CardStat, CardStatus } from './LibraryCard'

/**
 * Editable values. Every changeable parameter in the product is rendered with one of
 * these — never a bare `<input type="number">`, whose spinners are suppressed anyway.
 * See src/ui/shell/fields.tsx for which control to choose.
 */
export {
  NumberField,
  SliderField,
  Segmented,
  SegmentedToggles,
  TextField,
  FieldShell,
} from './fields'
export type { SegmentOption } from './fields'

/** The sticky right-hand body rail shared by Substances, Pills and Test subjects. */
export { AnatomyRail } from './AnatomyRail'

// ---------------------------------------------------------------------------
// Severity ladder — the 8 levels of SeverityId, mirrored from
// data/rules.json `severity_levels`. Rank ordering is normative.
// ---------------------------------------------------------------------------

export interface SeverityMeta {
  rank: number
  label: string
  /** true = hard block, 'override' = blocks unless the user overrides. */
  blocks: boolean | 'override'
  direction: 'bad' | 'good' | 'neutral'
}

export const SEVERITY: Record<SeverityId, SeverityMeta> = {
  info: { rank: 0, label: 'Info', blocks: false, direction: 'neutral' },
  preferred: { rank: 1, label: 'Preferred', blocks: false, direction: 'good' },
  compelling: { rank: 2, label: 'Compelling', blocks: false, direction: 'good' },
  minor: { rank: 3, label: 'Minor', blocks: false, direction: 'bad' },
  moderate: { rank: 4, label: 'Moderate', blocks: false, direction: 'bad' },
  major: { rank: 5, label: 'Major', blocks: false, direction: 'bad' },
  contraindicated_relative: {
    rank: 6,
    label: 'Relative contra',
    blocks: 'override',
    direction: 'bad',
  },
  contraindicated_absolute: {
    rank: 7,
    label: 'Absolute contra',
    blocks: true,
    direction: 'bad',
  },
}

/** DictKey per severity level — the English `SEVERITY[s].label` above stays the
 * fallback text baked into the dictionary itself, so this is only consulted for
 * translation, never for the rank/blocks/direction metadata. */
const SEVERITY_KEY: Record<SeverityId, DictKey> = {
  info: 'severity.info',
  preferred: 'severity.preferred',
  compelling: 'severity.compelling',
  minor: 'severity.minor',
  moderate: 'severity.moderate',
  major: 'severity.major',
  contraindicated_relative: 'severity.contraindicated_relative',
  contraindicated_absolute: 'severity.contraindicated_absolute',
}

export function severityRank(s: SeverityId): number {
  return SEVERITY[s]?.rank ?? 0
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  title,
  subtitle,
  actions,
  tone,
  selected,
  flush,
  className,
  children,
  onClick,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  tone?: 'danger' | 'warn' | 'good'
  selected?: boolean
  /** Drop the body padding — for tables that draw their own edges. */
  flush?: boolean
  className?: string
  children?: ReactNode
  onClick?: () => void
}) {
  const cls = [
    'card',
    tone ? `card--${tone}` : '',
    selected ? 'card--selected' : '',
    onClick ? 'card--interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const head =
    title || subtitle || actions ? (
      <div className="card-head">
        <div className="grow">
          {title ? <div className="card-title">{title}</div> : null}
          {subtitle ? <div className="card-sub">{subtitle}</div> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
    ) : null

  const body = (
    <div className={flush ? 'card-body card-body--flush' : 'card-body'}>{children}</div>
  )

  if (onClick) {
    return (
      <div
        className={cls}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {head}
        {children != null ? body : null}
      </div>
    )
  }

  return (
    <div className={cls}>
      {head}
      {children != null ? body : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Labelled table row
// ---------------------------------------------------------------------------

export function Row({
  label,
  hint,
  mono,
  wide,
  children,
}: {
  label: ReactNode
  /** Small secondary line under the label. */
  hint?: ReactNode
  /** Render the value in the tabular mono face. Use for every number. */
  mono?: boolean
  /** Stack label over value instead of side by side — for long prose. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={wide ? 'row row--wide' : 'row'}>
      <div className="row-label">
        {label}
        {hint ? <span className="row-hint">{hint}</span> : null}
      </div>
      <div className={mono ? 'row-value row-value--mono' : 'row-value'}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function Badge({
  tone,
  title,
  children,
}: {
  tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'modified'
  title?: string
  children: ReactNode
}) {
  return (
    <span className={tone ? `badge badge--${tone}` : 'badge'} title={title}>
      {children}
    </span>
  )
}

/** The 8-level ladder. Pass `showRank` to expose the numeric rank on stage. */
export function SeverityBadge({
  severity,
  showRank,
  label,
}: {
  severity: SeverityId
  showRank?: boolean
  label?: ReactNode
}) {
  const t = useT()
  const meta = SEVERITY[severity] ?? SEVERITY.info
  const text = t(SEVERITY_KEY[severity] ?? 'severity.info')
  return (
    <span
      className={`sev-badge sev-${severity}`}
      title={`${text} — rank ${meta.rank} of 7${
        meta.blocks === true
          ? ', hard block'
          : meta.blocks === 'override'
            ? ', blocks unless overridden'
            : ''
      }`}
    >
      {label ?? text}
      {showRank ? <span className="sev-rank">{meta.rank}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

const STATUS_SHORT: Record<ProvenanceStatus, string> = {
  CITED: 'Cited',
  ESTIMATED: 'Estimated',
  NOT_FOUND: 'Not found',
}

const STATUS_KEY: Record<ProvenanceStatus, DictKey> = {
  CITED: 'prov.status.CITED',
  ESTIMATED: 'prov.status.ESTIMATED',
  NOT_FOUND: 'prov.status.NOT_FOUND',
}

/**
 * The chip that says whether a number is real.
 *
 * Deliberately quiet: a coloured dot and a lower-case word, no border, no fill. It
 * sits next to every value so a reader can tell at a glance that sourcing exists,
 * without any single row shouting. It is never hidden behind a hover, and clicking
 * it opens the full source, quote and note.
 */
export function ProvenanceChip({
  provenance,
  onClick,
  full,
}: {
  provenance: Provenance | null | undefined
  /** Wire this to open the detail drawer. */
  onClick?: () => void
  /** Spell the status out instead of abbreviating. */
  full?: boolean
}) {
  const t = useT()
  const p: Provenance = provenance ?? { status: 'NOT_FOUND' }
  const tier = p.tier as SourceTier | undefined
  const text = t(STATUS_KEY[p.status])
  const cls = `prov-chip prov-${p.status}${full ? ' prov-chip--full' : ''}`
  const title =
    p.status === 'CITED'
      ? `${p.source ?? STATUS_LABEL.CITED}${tier ? ` — tier ${tier}: ${TIER_LABEL[tier]}` : ''}`
      : (p.note ?? t(STATUS_KEY[p.status]))

  const inner = (
    <>
      {text}
      {tier ? <span className="prov-tier">T{tier}</span> : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={cls} title={title} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <span className={cls} title={title}>
      {inner}
    </span>
  )
}

/** The expanded audit view: source, tier, retrieval date, verbatim quote, note. */
export function ProvenanceDetail({ provenance }: { provenance: Provenance | null | undefined }) {
  const t = useT()
  const p: Provenance = provenance ?? {
    status: 'NOT_FOUND',
    note: t('prov.detail.noneOnField'),
  }
  const tier = p.tier as SourceTier | undefined
  return (
    <div className={`prov-detail prov-detail--${p.status}`}>
      <div className="prov-detail-line">
        <span className="prov-detail-key">{t('prov.detail.status')}</span>
        <span className="prov-detail-val">
          <ProvenanceChip provenance={p} full />
          {tier ? <span className="dim"> &nbsp;{t('prov.tier', { tier, label: TIER_LABEL[tier] })}</span> : null}
          {p.confidence ? <span className="dim"> &nbsp;{t('prov.confidence', { value: p.confidence })}</span> : null}
        </span>
      </div>
      {p.source ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('prov.detail.source')}</span>
          <span className="prov-detail-val">
            {p.source}
            {p.retrieved ? <span className="dim"> — {t('prov.retrieved', { date: p.retrieved })}</span> : null}
          </span>
        </div>
      ) : null}
      {p.url ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('prov.detail.url')}</span>
          <span className="prov-detail-val">
            <a href={p.url} target="_blank" rel="noreferrer">
              {p.url}
            </a>
          </span>
        </div>
      ) : null}
      {p.quote ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('prov.detail.quote')}</span>
          <span className="prov-detail-val prov-quote">&ldquo;{p.quote}&rdquo;</span>
        </div>
      ) : null}
      {p.note ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">
            {p.status === 'ESTIMATED'
              ? t('prov.detail.basis')
              : p.status === 'NOT_FOUND'
                ? t('prov.detail.searched')
                : t('prov.detail.note')}
          </span>
          <span className="prov-detail-val">{p.note}</span>
        </div>
      ) : null}
      {!p.source && !p.quote && !p.note ? (
        <div className="prov-detail-line">
          <span className="prov-detail-key">{t('prov.detail.note')}</span>
          <span className="prov-detail-val dim">{t('prov.detail.noSourceRecorded')}</span>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout + status
// ---------------------------------------------------------------------------

export function Section({
  title,
  actions,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h3 className="section-title">{title}</h3>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Progressive disclosure. The product holds far more data than a reader can take in
 * at once — 820 provenance-wrapped values across 43 substances — so a page shows the
 * handful that matter and puts the rest behind one of these. Explicit affordance,
 * never a hover, and the count is on the button so nothing feels hidden.
 */
export function Disclosure({
  summary,
  meta,
  open,
  onToggle,
  flush,
  children,
}: {
  summary: ReactNode
  /** Right-aligned count or hint, e.g. "106 values". */
  meta?: ReactNode
  open: boolean
  onToggle: () => void
  /** Drop the panel padding — for tables that draw their own edges. */
  flush?: boolean
  children: ReactNode
}) {
  return (
    <div className="disclosure">
      <button
        type="button"
        className="disclosure-btn"
        aria-expanded={open}
        onClick={onToggle}
      >
        <svg
          className="disclosure-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m4.2 2.4 4 3.6-4 3.6" />
        </svg>
        <span>{summary}</span>
        {meta ? <span className="disclosure-meta">{meta}</span> : null}
      </button>
      {open ? (
        <div className={flush ? 'disclosure-panel disclosure-panel--flush' : 'disclosure-panel'}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The "what to do next" strip. Every page ends with one so the user is handed the
 * next step in the flow instead of having to hunt in the sidebar.
 */
export function NextStep({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="next-step">
      <div className="next-step-text">
        <b>{title}</b>
        {description}
      </div>
      <div className="card-actions">{actions}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The four zones — research/10-LAYOUT-BLUEPRINT.md §2.
//
// Every centre column in the product is Act → Answer → Evidence → Detail, in
// that order, always. A card belongs to exactly one zone; if you cannot name a
// card's zone it does not belong on the page. Two rules are structural rather
// than stylistic and are the whole reason this primitive exists:
//
//   · Nothing from Evidence or Detail may render above Answer.
//   · Nothing renders before the user has acted except Act. A zone with no
//     content is ABSENT, never an empty placeholder — so the CALLER decides
//     whether to mount a <Zone>, and mounting one with nothing in it is the
//     mistake this is meant to stop.
//
// The zone NAMES are for the blueprint, not for the reader: each page words its
// own heading in the user's terms ("What the simulation found", not "Answer").
// ---------------------------------------------------------------------------

export type ZoneKind = 'act' | 'answer' | 'evidence' | 'detail'

export function Zone({
  kind,
  id,
  title,
  lead,
  aside,
  children,
}: {
  kind: ZoneKind
  /** Anchor id, so a quick-jump can reach the zone. */
  id: string
  title: ReactNode
  /** One plain line saying what this zone is. Capped at --measure. */
  lead?: ReactNode
  /** A status or control that belongs to the heading, not to the body. */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`zone zone--${kind}`} id={id} aria-labelledby={`${id}-title`}>
      <header className="zone-head">
        <div className="zone-head-row">
          <h2 className="zone-title" id={`${id}-title`}>
            {title}
          </h2>
          {aside ? <div className="zone-aside">{aside}</div> : null}
        </div>
        {lead ? <p className="zone-lead">{lead}</p> : null}
      </header>
      <div className="zone-body">{children}</div>
    </section>
  )
}

/**
 * Forward motion, pattern 5 of the blueprint's §7: within long content the
 * reader can always see where else it goes without hunting the sidebar. Plain
 * fragment links, so it works with keyboard, back button and no JavaScript.
 */
export function QuickJump({
  items,
  label,
  ariaLabel,
}: {
  items: { id: string; label: ReactNode }[]
  label?: ReactNode
  ariaLabel?: string
}) {
  const t = useT()
  if (!items.length) return null
  return (
    <nav className="quick-jump" aria-label={ariaLabel ?? undefined}>
      <span className="quick-jump-label">{label ?? t('zone.quickJump')}</span>
      <ul className="quick-jump-list">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`}>{i.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Completeness is explicit — pattern 4. The user always knows what is done and
 * what remains, without having to infer it from which buttons are enabled.
 */
export function Completeness({ items }: { items: { label: ReactNode; done: boolean }[] }) {
  const t = useT()
  const done = items.filter((i) => i.done).length
  const all = done === items.length
  return (
    <div className={`completeness${all ? ' is-complete' : ''}`} role="status">
      <span className="completeness-state">
        {all ? t('zone.complete') : t('zone.doneOfTotal', { done, total: items.length })}
      </span>
      <ul className="completeness-list">
        {items.map((i, n) => (
          <li key={n} className={i.done ? 'is-done' : undefined}>
            <span className="completeness-mark" aria-hidden>
              {i.done ? '✓' : '○'}
            </span>
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * An empty state that states the CONSEQUENCE, not the absence — pattern 3.
 * Never "no comorbidities"; always "no comorbidities, so the twin will be a
 * healthy adult of this age and weight". If you cannot say what follows from
 * the emptiness, the panel should not be on screen at all.
 */
export function Consequence({
  children,
  tone,
}: {
  children: ReactNode
  tone?: 'neutral' | 'warn'
}) {
  return (
    <p className={tone === 'warn' ? 'consequence consequence--warn' : 'consequence'}>{children}</p>
  )
}

/**
 * A NAMED GROUP of fields — pattern 1 — carrying one plain line saying WHY it
 * is asked — pattern 2, and the biggest single gap the blueprint found. Derive
 * `why` from what the product actually does with the input; never invent a
 * clinical claim to fill it in.
 */
export function FieldGroup({
  id,
  title,
  why,
  meta,
  children,
}: {
  id?: string
  title: ReactNode
  why?: ReactNode
  /** Right-aligned status for the heading row — a count, a state. */
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="fgroup" id={id}>
      <div className="fgroup-head">
        <h3 className="fgroup-title">{title}</h3>
        {meta ? <span className="fgroup-meta">{meta}</span> : null}
      </div>
      {why ? <p className="fgroup-why">{why}</p> : null}
      <div className="fgroup-body">{children}</div>
    </section>
  )
}

export function StatusBlock({
  kind,
  title,
  message,
  action,
}: {
  kind: 'loading' | 'error' | 'empty'
  title?: string
  message?: ReactNode
  action?: ReactNode
}) {
  const defaults = {
    loading: { title: 'Loading dataset', message: 'Fetching substances, products and rules…' },
    error: { title: 'Data failed to load', message: 'The dataset could not be read.' },
    empty: { title: 'Nothing to show', message: '' },
  }[kind]

  return (
    <div className={`status status--${kind}`}>
      {kind === 'loading' ? <div className="spinner" aria-hidden /> : null}
      <div className="status-title">{title ?? defaults.title}</div>
      {message ?? defaults.message ? (
        <div className="status-msg">{message ?? defaults.message}</div>
      ) : null}
      {action}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  count,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Rendered on the right — e.g. "12/43". */
  count?: ReactNode
  autoFocus?: boolean
}) {
  return (
    <label className="search">
      <svg
        className="search-icon"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.6" />
        <path d="M10.4 10.4 14 14" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {count != null ? <span className="search-count">{count}</span> : null}
    </label>
  )
}

/** A stacked CITED / ESTIMATED / NOT_FOUND ledger bar with a counted legend. */
export function ProvenanceLedger({
  cited,
  estimated,
  notFound,
  label,
}: {
  cited: number
  estimated: number
  notFound: number
  label?: ReactNode
}) {
  const total = cited + estimated + notFound
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  return (
    <div>
      <div className="prov-bar" role="img" aria-label={`${cited} cited, ${estimated} estimated, ${notFound} not found`}>
        <div className="prov-bar-seg prov-bar-seg--CITED" style={{ width: `${pct(cited)}%` }} />
        <div
          className="prov-bar-seg prov-bar-seg--ESTIMATED"
          style={{ width: `${pct(estimated)}%` }}
        />
        <div
          className="prov-bar-seg prov-bar-seg--NOT_FOUND"
          style={{ width: `${pct(notFound)}%` }}
        />
      </div>
      <div className="prov-legend">
        <span style={{ color: 'var(--prov-cited-fg)' }}>
          <b>{cited}</b> cited
        </span>
        <span style={{ color: 'var(--prov-estimated-fg)' }}>
          <b>{estimated}</b> estimated
        </span>
        <span style={{ color: 'var(--prov-notfound-fg)' }}>
          <b>{notFound}</b> not found
        </span>
        <span>{label ?? <>of <b>{total}</b> values</>}</span>
      </div>
    </div>
  )
}
