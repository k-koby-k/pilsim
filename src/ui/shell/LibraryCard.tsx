/**
 * The shared library card. Owned by Agent UI-A, and the house pattern for every
 * "choose one of these" screen in the product — pills, substances, test subjects.
 *
 *     import { LibraryCard, LibraryGrid } from '../shell/primitives'
 *
 *     <LibraryGrid>
 *       {items.map((it) => (
 *         <LibraryCard
 *           key={it.id}
 *           title="Amlodipine"
 *           subtitle="Relaxes arteries by blocking calcium entry"
 *           tags={<Badge>Calcium channel blocker</Badge>}
 *           stats={[{ label: 'Start dose', value: 5, unit: 'mg' }]}
 *           meta="41 of 118 values cited"
 *           status={{ label: 'Allowed', tone: 'ok' }}
 *           onClick={() => open(it.id)}
 *         />
 *       ))}
 *     </LibraryGrid>
 *
 * Rules of the pattern, so the three pages read as one product:
 *   · CARDS STACK ONE PER ROW — LibraryGrid is a single-column stack, never a
 *     multi-column grid. A card owns the full width of the centre column, so it
 *     is generous inside: name and plain phrase on the left, its numbers on the
 *     same line to the right.
 *   · A card identifies one thing. Name, one short plain phrase, at most three
 *     headline numbers. Everything else belongs in the detail view behind it.
 *   · `subtitle` is a phrase a non-specialist can read, not a taxonomy string.
 *   · `stats` are numbers, rendered in the mono face so cards line up with each
 *     other. Three is the ceiling; two is usually better.
 *   · `tone` is for a fired rule, not for decoration. A grid of safe things must
 *     look like a calm grid.
 *
 * TWO ACTIONS ON ONE CARD. Pass `onPick` as well as `onClick` and the card grows a
 * checkbox on its left edge: ticking gathers the item into a selection, clicking the
 * rest of the card still opens its detail. The two are deliberately not the same
 * shape — the tick is a bordered control with its own word ("Select" / "Selected"),
 * the open target is the card body and says so in its footer — because a user who
 * meant to inspect one thing must never find they have started building a set, and a
 * user who meant to build a set must not have to guess that ticking is possible.
 */

import type { ReactNode } from 'react'
import { useT } from '../../i18n'

export interface CardStat {
  label: string
  /** The number. Rendered in the tabular mono face. */
  value: ReactNode
  /** Unit or short qualifier, set after the value in small type. */
  unit?: string
}

export interface CardStatus {
  label: string
  tone?: 'ok' | 'warn' | 'bad' | 'muted'
}

const STATUS_COLOR: Record<NonNullable<CardStatus['tone']>, string> = {
  ok: 'var(--sev-preferred-fg)',
  warn: 'var(--sev-moderate-fg)',
  bad: 'var(--sev-ci-absolute-fg)',
  muted: 'var(--text-faint)',
}

export function LibraryGrid({ children }: { children: ReactNode }) {
  return <div className="lib-grid">{children}</div>
}

export function LibraryCard({
  title,
  subtitle,
  glyph,
  tags,
  stats,
  meta,
  status,
  tone,
  mine,
  selected,
  onClick,
  onPick,
  picked,
  pickLabel,
}: {
  title: ReactNode
  /** One short plain phrase. What this is, in words a patient would understand. */
  subtitle?: ReactNode
  /** Optional 28×17-ish mark, drawn to the left of the title. */
  glyph?: ReactNode
  /** Badges. Two at most. */
  tags?: ReactNode
  /** At most three headline numbers. */
  stats?: CardStat[]
  /** Small left-hand footer note. */
  meta?: ReactNode
  /** Small right-hand footer status with a dot. */
  status?: CardStatus
  /** Only for a fired rule — never decoration. */
  tone?: 'danger' | 'warn' | 'good'
  /** The user made this one; it is not a sourced record. Draws a violet edge. */
  mine?: boolean
  selected?: boolean
  onClick?: () => void
  /**
   * Give the card a tick box that gathers it into a multi-selection. Separate from
   * `onClick`, which keeps meaning "open this one".
   */
  onPick?: () => void
  /** Whether the tick box is ticked. Only meaningful with `onPick`. */
  picked?: boolean
  /** What the tick box is called to a screen reader, e.g. "Select amlodipine". */
  pickLabel?: string
}) {
  const t = useT()
  const pickable = Boolean(onPick)
  const cls = [
    'lib-card',
    tone ? `lib-card--${tone}` : '',
    mine ? 'lib-card--mine' : '',
    selected ? 'lib-card--selected' : '',
    onClick ? 'lib-card--interactive' : '',
    pickable ? 'lib-card--pickable' : '',
    pickable && picked ? 'lib-card--picked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const body = (
    <>
      {/* One card per row, so identity sits on the left and the numbers line up
          on the right of the SAME line rather than stacking into a narrow tile. */}
      <div className="lib-card-head">
        {glyph ? <span className="lib-glyph">{glyph}</span> : null}
        <span className="grow lib-card-id">
          <span className="lib-title">{title}</span>
          {subtitle ? <span className="lib-sub">{subtitle}</span> : null}
          {tags ? <span className="lib-tags">{tags}</span> : null}
        </span>

        {stats && stats.length > 0 ? (
          <span className="lib-stats">
            {stats.slice(0, 3).map((s) => (
              <span className="lib-stat" key={s.label}>
                <span className="lib-stat-label">{s.label}</span>
                <span className="lib-stat-value">
                  {s.value}
                  {s.unit ? <span className="lib-stat-unit">{s.unit}</span> : null}
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {meta || status || pickable ? (
        <span className="lib-foot">
          <span className="lib-meta">{meta}</span>
          {status ? (
            <span
              className="lib-status"
              style={{ color: STATUS_COLOR[status.tone ?? 'muted'] }}
            >
              <span className="lib-status-dot" />
              {status.label}
            </span>
          ) : null}
          {/* Says out loud what the rest of the card does, so the tick box on the
              left cannot be mistaken for the only thing that is clickable. */}
          {pickable && onClick ? <span className="lib-open-hint">{t('common.openDetails')}</span> : null}
        </span>
      ) : null}
    </>
  )

  if (pickable) {
    return (
      <div className={cls}>
        <button
          type="button"
          className="lib-pick"
          role="checkbox"
          aria-checked={Boolean(picked)}
          aria-label={pickLabel}
          onClick={onPick}
        >
          <span className="lib-pick-box" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="m2.6 6.2 2.3 2.3 4.5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="lib-pick-text">{picked ? t('common.selectedDetail') : t('common.selectDetail')}</span>
        </button>
        {onClick ? (
          <button type="button" className="lib-card-open" onClick={onClick}>
            {body}
          </button>
        ) : (
          <div className="lib-card-open lib-card-open--static">{body}</div>
        )}
      </div>
    )
  }

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
