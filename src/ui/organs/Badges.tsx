/**
 * ADVERSE-EFFECT BADGES — research/04-ORGAN-EFFECT-MAP.md §12.
 *
 * A simulation that only shows benefit is not convincing. These are the channels a viewer
 * recognises. Every badge is a claim that something HAPPENED, so:
 *   - hysteresis is mandatory (theta_on > theta_off), or they flicker and the demo looks broken;
 *   - rare events are styled differently from common ones — angioedema must never carry the
 *     same visual weight as ankle swelling;
 *   - every badge is clickable and shows its source. That is the cheapest thing that makes
 *     the whole animation feel like an evidence trail rather than a cartoon.
 *
 * Where a source gives a range (ACE-inhibitor cough: 3.9 % on the label vs 5-35 % in the
 * literature) the badge shows THE RANGE. A point estimate there would be false precision.
 */

import { useEffect, useRef, useState } from 'react'
import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { BADGES, FALLBACK_REF, latchBadges, sig, type BadgeSpec, type RefRanges } from './channels'

export interface BadgeState {
  active: ReadonlySet<string>
}

/** Latches badge state across frames with the mandatory hysteresis. */
export function useBadges(frame: EffectFrame | null, ranges: RefRanges = FALLBACK_REF): ReadonlySet<string> {
  const [active, setActive] = useState<ReadonlySet<string>>(() => new Set<string>())
  const prev = useRef<ReadonlySet<string>>(active)

  useEffect(() => {
    if (!frame) {
      if (prev.current.size) {
        prev.current = new Set<string>()
        setActive(prev.current)
      }
      return
    }
    const next = latchBadges(frame.hazards, prev.current, {
      hr: sig(frame.haemo?.hr),
      serumK: sig(frame.chem?.serum_k),
      serumUrate: sig(frame.chem?.serum_urate),
      kLow: ranges.kLow,
      kHigh: ranges.kHigh,
      urateHigh: ranges.urateHigh,
    })
    if (!sameSet(next, prev.current)) {
      prev.current = next
      setActive(next)
    }
  }, [frame, ranges])

  return active
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

export function BadgeStrip({ frame, ranges = FALLBACK_REF }: { frame: EffectFrame | null; ranges?: RefRanges }) {
  const t = useT()
  const active = useBadges(frame, ranges)
  const [open, setOpen] = useState<string | null>(null)
  const shown = BADGES.filter((b) => active.has(b.id))

  return (
    <div className="pil-badges">
      <div className="pil-badges-head">
        {t('organ.badges.header')}
        <span className="pil-badges-count">{t('organ.badges.firingCount', { n: shown.length })}</span>
      </div>
      {shown.length === 0 && (
        <p className="pil-badges-empty">
          {frame ? t('organ.badges.noneFiring') : t('organ.badges.noRun')}
        </p>
      )}
      <ul className="pil-badge-list">
        {shown.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={`pil-badge${b.rare ? ' pil-badge-rare' : ''}${open === b.id ? ' pil-badge-open' : ''}`}
              onClick={() => setOpen(open === b.id ? null : b.id)}
            >
              <span className={`pil-badge-icon pil-icon-${b.icon}`} aria-hidden="true" />
              <span className="pil-badge-label">{b.label}</span>
              {b.rare && <span className="pil-badge-rare-tag">{t('organ.badges.rare')}</span>}
            </button>
            {open === b.id && <BadgeSource badge={b} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BadgeSource({ badge }: { badge: BadgeSpec }) {
  const t = useT()
  return (
    <div className="pil-badge-source">
      <p>
        <strong>{t('organ.badges.drivenBy')}</strong> {badge.drugs}
      </p>
      <p>
        <strong>{t('organ.badges.reportedIncidence')}</strong> {badge.incidence}
      </p>
      <p className="pil-source">{badge.source}</p>
      <p className="pil-source">
        {t('organ.badges.thresholdNote', { on: badge.thetaOn, off: badge.thetaOff })}
      </p>
    </div>
  )
}

/**
 * The cough badge also fires a visible event on the figure — a puff at the mouth and a
 * short torso jolt — because a badge alone reads as a label rather than an event.
 */
export function useCoughEvents(frame: EffectFrame | null): boolean {
  const [jolt, setJolt] = useState(false)
  const hazard = frame ? sig(frame.hazards?.cough) : null

  useEffect(() => {
    if (hazard === null || hazard <= 0) return
    // §9.2: fire stochastically at 0.5 x hazards.cough events per simulated hour.
    // The wall-clock cadence here is a presentation choice, not a rate claim.
    const meanGapMs = Math.max(1200, 9000 / (0.5 * hazard + 0.05))
    const id = setInterval(() => {
      setJolt(true)
      setTimeout(() => setJolt(false), 250)
    }, meanGapMs)
    return () => clearInterval(id)
  }, [hazard])

  return jolt
}
