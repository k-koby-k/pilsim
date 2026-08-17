/**
 * "What does this substance touch?" — the static anatomy view.
 *
 * WHAT IT IS. Given one or more substance ids it draws the body, lights up the organs
 * those substances act on, names the receptor or transporter and the direction, and
 * leaves everything else quiet. It answers *where does this drug work* before a dose is
 * given, which is the question a reader has on the substance and pill pages, where no
 * simulation exists yet.
 *
 * WHAT IT IS NOT. It is not a run view. It takes no `EffectFrame`, reads no concentration
 * and no engagement value, and shows no magnitude: everything it says comes from the
 * static map in effectMap.ts, which restates research/04-ORGAN-EFFECT-MAP.md. The one
 * frame in this file is the documented resting-adult constant from channels.ts, used
 * solely as drawing input so the existing organ artwork can be reused unchanged — it is
 * a still life, not simulation output, and nothing on screen is derived from a run.
 *
 * MOTION. The halo over an acting organ breathes, and only an acting organ has one, so
 * movement on this figure means "the drug works here" and nothing else. Organs ease
 * between quiet and lit when the selection changes rather than snapping. Everything
 * stops under prefers-reduced-motion, where the halo holds its bright frame.
 *
 * COLOUR. Per-drug hue throughout, the same hue the reader learns on the charts and on
 * the run figure. Where two drugs act on one organ, each mechanism line keeps its own
 * drug's colour, so a combination reads as a combination.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { DrugId } from '../../types'
import './organs.css'
import { useT } from '../../i18n/useT'
import { BodySilhouette } from './BodyFigure'
import { Adrenal } from './Adrenal'
import { Heart } from './Heart'
import { KidneyOutline } from './Kidney'
import { LiverOutline } from './Liver'
import { Lungs } from './Lungs'
import { Ankle } from './Periphery'
import { Conduit } from './Vessels'
import { baselineFrame, DRUGS, vars } from './channels'
import {
  LEFT_COLUMN,
  MAX_CALLOUT_ROWS,
  ORGAN_SITES,
  RIGHT_COLUMN,
  hasOrganAction,
  organActions,
  substanceLabel,
  type OrganAction,
  type OrganSite,
  type OrganSiteId,
} from './effectMap'
import { layoutLane, LINE_PITCH, TITLE_LEAD } from './primitives'

/**
 * The resting, untreated reference from channels.ts. Drawing input only: every
 * concentration and every engagement in it is zero, so every organ module renders its
 * own quiet baseline artwork and no channel carries a signal. Nothing here is a run.
 */
const REST = baselineFrame()

export interface AffectedAnatomyProps {
  /** Substance ids, e.g. ['amlodipine'] or the actives of a pill. */
  substanceIds: string[]
  /** Optional caption under the figure. */
  caption?: string
  /** 'rail' fills its container height; 'inline' sizes to content. Default 'rail'. */
  variant?: 'rail' | 'inline'
}

/** One mechanism line, already attributed to the drug that owns it. */
interface Mechanism {
  drug: DrugId
  action: OrganAction
}

interface Resolved {
  /** Substances that act somewhere, in the order they were passed. */
  acting: DrugId[]
  /** Substances with no modelled organ action — every excipient. */
  inert: string[]
  /** site id -> the mechanisms landing on it, acting drugs first. */
  bySite: Map<OrganSiteId, Mechanism[]>
  /** Sites that are actually lit: at least one `target` row. */
  litSites: Set<OrganSiteId>
  /** Type metrics per drug, for the legend. */
  siteCount: Map<DrugId, number>
}

function resolve(ids: string[]): Resolved {
  const acting: DrugId[] = []
  const inert: string[] = []
  const bySite = new Map<OrganSiteId, Mechanism[]>()
  const litSites = new Set<OrganSiteId>()
  const siteCount = new Map<DrugId, number>()

  for (const raw of ids) {
    if (!hasOrganAction(raw)) {
      if (!inert.includes(raw)) inert.push(raw)
      continue
    }
    if (acting.includes(raw)) continue
    acting.push(raw)

    const own = new Set<OrganSiteId>()
    for (const action of organActions(raw)) {
      const list = bySite.get(action.site) ?? []
      list.push({ drug: raw, action })
      bySite.set(action.site, list)
      if (action.tone === 'target') {
        litSites.add(action.site)
        own.add(action.site)
      }
    }
    siteCount.set(raw, own.size)
  }

  // Within one callout the acting rows come first; an "it deliberately does nothing here"
  // row is a footnote to the site, not its headline.
  for (const list of bySite.values()) {
    list.sort((a, b) => (a.action.tone === b.action.tone ? 0 : a.action.tone === 'target' ? -1 : 1))
  }

  return { acting, inert, bySite, litSites, siteCount }
}

// ---------------------------------------------------------------------------
// The box, measured on the element rather than on the window.
//
// This component is dropped into containers of wildly different shapes — a 360 px rail
// eight hundred pixels tall, a half-page panel, a full-width card — and it has two
// drawings to choose between: the anatomical plate, body centred with a column of
// mechanism callouts down each margin, and the body alone with the mechanisms listed
// underneath as text. A viewport media query cannot see which of those fits, because the
// container is the window less a navigation rail, less page gutters and less whatever
// column sits beside it.
//
// The plate needs width. In a rail it also needs the box not to be far taller than it is
// wide, or the drawing shrinks to fit the width and leaves half the rail empty. Height is
// only consulted for `variant="rail"`, where the parent fixes it: an inline figure sizes
// ITSELF from the drawing, so reading its height back would decide the layout from the
// layout it just chose.
// ---------------------------------------------------------------------------

const COMPACT_PX = 460
const PLATE_MIN_PX = 520
/** Below this width/height ratio a rail is a tall slot, and the plate cannot fill it. */
const PLATE_MIN_RATIO = 0.85

interface Box {
  width: number
  height: number
}

function useElementBox<T extends HTMLElement>(ref: RefObject<T | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      const r = el.getBoundingClientRect()
      setBox({ width: r.width, height: r.height })
      return
    }
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setBox({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return box
}

// ---------------------------------------------------------------------------

export function AffectedAnatomy({ substanceIds, caption, variant = 'rail' }: AffectedAnatomyProps) {
  const t = useT()
  const key = substanceIds.join('|')
  // Keyed on the joined ids, not on the array identity: a caller that rebuilds the array
  // every render must not re-resolve the map on every render.
  const { acting, inert, bySite, litSites, siteCount } = useMemo(() => resolve(key ? key.split('|') : []), [key])

  const stage = useRef<HTMLDivElement>(null)
  const box = useElementBox(stage)
  // Until the observer has reported, assume the roomy layout: the callouts are the point
  // of the view, and flashing them out on first paint is worse than one reflow.
  const compact =
    box !== null &&
    (variant === 'rail'
      ? box.width < PLATE_MIN_PX || (box.height > 0 && box.width / box.height < PLATE_MIN_RATIO)
      : box.width < COMPACT_PX)

  const nothingActs = acting.length === 0
  const label =
    acting.length === 0
      ? t('organ.affected.ariaNone')
      : t('organ.affected.ariaActing', { list: acting.map((d) => DRUGS[d].label).join(', ') })

  return (
    <figure className={`pil-organ-figure pil-anatomy pil-anatomy-${variant}`}>
      <div className="aa-stage" ref={stage}>
        <svg
          className="aa-svg"
          viewBox={compact ? '176 8 248 704' : '-90 0 780 720'}
          role="img"
          aria-label={label}
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{label}</title>

          <BodySilhouette />

          <OrganLayer lit={litSites} />

          {/* Keyed on the selection so a change re-runs the entrance, while the organ
              groups above keep their identity and therefore keep transitioning. */}
          <g className="aa-marks" key={key}>
            {[...bySite.entries()].map(([siteId, list]) => {
              const target = list.find((m) => m.action.tone === 'target')
              if (!target) return null
              return <Highlight key={siteId} site={ORGAN_SITES[siteId]} hue={DRUGS[target.drug].hue} />
            })}
          </g>

          {!compact && (
            <g className="aa-callouts">
              <Column side="left" ids={LEFT_COLUMN} bySite={bySite} />
              <Column side="right" ids={RIGHT_COLUMN} bySite={bySite} />
            </g>
          )}
        </svg>
      </div>

      {compact && bySite.size > 0 && (
        <ul className="aa-list">
          {[...bySite.entries()].map(([siteId, list]) => (
            <li key={siteId}>
              <span className="aa-list-site">{ORGAN_SITES[siteId].label}</span>
              {list.map((m, i) => (
                <span key={i} className={`aa-list-row${m.action.tone === 'absent' ? ' is-absent' : ''}`}>
                  <span className="aa-list-where" style={{ color: DRUGS[m.drug].hue }}>
                    {m.action.where}
                  </span>
                  <span className="aa-list-what">{m.action.what}</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}

      <figcaption className="aa-caption">
        {nothingActs ? (
          <p className="aa-none">
            <strong>{t('organ.affected.noneTitle')}</strong>{' '}
            {inert.length === 0
              ? t('organ.affected.nothingSelected')
              : t('organ.affected.excipientNote', {
                  names: listOf(inert.map(substanceLabel), t('organ.affected.and')),
                  count: inert.length,
                })}
          </p>
        ) : (
          <>
            <ul className="aa-legend">
              {acting.map((d) => (
                <li key={d} style={{ borderColor: DRUGS[d].hue }}>
                  <span className="aa-swatch" style={{ background: DRUGS[d].hue }} />
                  <span className="aa-legend-name">{DRUGS[d].label}</span>
                  <span className="aa-legend-count">
                    {t('organ.affected.siteCount', { n: siteCount.get(d) ?? 0 })}
                  </span>
                </li>
              ))}
            </ul>
            {inert.length > 0 && (
              <p className="aa-inert">
                {t('organ.affected.noOrganAction', { names: listOf(inert.map(substanceLabel), t('organ.affected.and')) })}
              </p>
            )}
          </>
        )}
        {caption && <p className="aa-note">{caption}</p>}
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------
// Figure layers
// ---------------------------------------------------------------------------

/**
 * Every organ, drawn once, in the same places the run figure draws them. A lit organ
 * carries its full anatomical colour; the rest are held back — desaturated and dimmed —
 * so the eye lands on the drug's targets and nowhere else.
 */
function OrganLayer({ lit }: { lit: Set<OrganSiteId> }) {
  const cls = (id: OrganSiteId) => `aa-organ${lit.has(id) ? ' is-lit' : ''}`
  return (
    <g className="aa-organs">
      <g className={cls('lungs')}>
        <Lungs frame={REST} x={300} y={150} scale={1.1} labels={false} />
      </g>
      <g className={cls('arterioles')}>
        <Conduit frame={REST} x={302} y={244} scale={0.6} />
      </g>
      <g className={cls('liver')}>
        <LiverOutline frame={REST} x={250} y={256} scale={0.72} labels={false} />
      </g>
      <g className={cls('adrenal')}>
        <Adrenal frame={REST} x={332} y={290} scale={0.55} labels={false} streamPath="M 0 14 C -30 70 -54 130 -62 196" />
      </g>
      <g className={cls('kidney')}>
        <KidneyOutline frame={REST} x={268} y={300} scale={0.62} labels={false} />
        <KidneyOutline frame={REST} x={332} y={300} scale={0.62} mirror labels={false} />
      </g>
      <g className={cls('heart')}>
        <Heart frame={REST} x={308} y={226} scale={0.58} labels={false} />
      </g>
      <g className={cls('limbs')}>
        <Ankle frame={REST} x={268} y={576} labels={false} />
        <Ankle frame={REST} x={332} y={576} mirror labels={false} />
      </g>
    </g>
  )
}

/** The breathing halo — the one thing on this figure that moves, and it means "here". */
function Highlight({ site, hue }: { site: OrganSite; hue: string }) {
  return (
    <g className="aa-highlight" style={vars({ '--aa-hue': hue })}>
      {site.halos.map((h, i) => (
        <g key={i}>
          <ellipse className="aa-halo" cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={hue} />
          <ellipse className="aa-ring" cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} stroke={hue} fill="none" />
        </g>
      ))}
      {(site.paths ?? []).map((d, i) => (
        <path key={`p${i}`} className="aa-vessel" d={d} stroke={hue} fill="none" />
      ))}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Margin callouts.
//
// Same discipline as the run figure: a block states a preferred baseline and its own line
// count, and layoutLane() pushes it down where the block above has grown into it. A drug
// with four mechanisms on one organ therefore cannot overprint the callout beneath it,
// and no baseline in this file is a hardcoded coincidence.
// ---------------------------------------------------------------------------

const LEFT_X = 186
const RIGHT_X = 414
const ELBOW = 10

function Column({
  side,
  ids,
  bySite,
}: {
  side: 'left' | 'right'
  ids: OrganSiteId[]
  bySite: Map<OrganSiteId, Mechanism[]>
}) {
  const items = ids
    .map((id) => {
      const all = bySite.get(id) ?? []
      return {
        site: ORGAN_SITES[id],
        list: all.slice(0, MAX_CALLOUT_ROWS),
        hidden: Math.max(0, all.length - MAX_CALLOUT_ROWS),
      }
    })
    .filter((it) => it.list.length > 0)

  // Two lines per mechanism — the site, then what happens there — plus one for the
  // "and n more" line where a callout had to summarise.
  const ys = layoutLane(
    items.map((it) => ({ y: it.site.y, lines: it.list.length * 2 + (it.hidden > 0 ? 1 : 0) })),
  )

  return (
    <>
      {items.map((it, i) => (
        <Callout
          key={it.site.id}
          side={side}
          site={it.site}
          list={it.list}
          hidden={it.hidden}
          y={ys[i] ?? it.site.y}
        />
      ))}
    </>
  )
}

function Callout({
  side,
  site,
  list,
  hidden,
  y,
}: {
  side: 'left' | 'right'
  site: OrganSite
  list: Mechanism[]
  hidden: number
  y: number
}) {
  const t = useT()
  const anchor = side === 'left' ? 'end' : 'start'
  const x = side === 'left' ? LEFT_X : RIGHT_X
  const elbow = side === 'left' ? x + ELBOW : x - ELBOW
  const live = list.some((m) => m.action.tone === 'target')

  let line = 0
  return (
    <g className={`aa-callout${live ? '' : ' is-absent'}`}>
      <path className={`pil-leader${live ? '' : ' aa-leader-absent'}`} d={`M ${elbow} ${y - 4} L ${site.anchor[0]} ${site.anchor[1]}`} />
      <circle className="pil-leader-dot" cx={site.anchor[0]} cy={site.anchor[1]} r={2.4} />
      <text x={x} y={y} textAnchor={anchor} className="aa-title">
        {site.label}
      </text>
      {list.map((m, i) => {
        const yWhere = y + TITLE_LEAD + line++ * LINE_PITCH
        const yWhat = y + TITLE_LEAD + line++ * LINE_PITCH
        const absent = m.action.tone === 'absent'
        return (
          <g key={i} className={absent ? 'aa-mech is-absent' : 'aa-mech'}>
            {/* One string, not an interpolated list: an SVG <title> takes a single text
                child, and React warns on every render if it is handed an array. */}
            <title>
              {`${DRUGS[m.drug].label} · ${m.action.where} — ${m.action.what} · tier ${m.action.tier}, research/04-ORGAN-EFFECT-MAP.md ${m.action.ref}`}
            </title>
            <text
              x={x}
              y={yWhere}
              textAnchor={anchor}
              className={`aa-where${m.action.tier === 'T1' ? ' aa-t1' : ''}`}
              fill={absent ? undefined : DRUGS[m.drug].hue}
            >
              {absent ? `${m.action.where} ·` : m.action.where}
            </text>
            <text x={x} y={yWhat} textAnchor={anchor} className="aa-what">
              {m.action.what}
            </text>
          </g>
        )
      })}
      {hidden > 0 && (
        <text x={x} y={y + TITLE_LEAD + line * LINE_PITCH} textAnchor={anchor} className="aa-what">
          {t('organ.affected.moreHere', { n: hidden })}
        </text>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------

function listOf(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

export default AffectedAnatomy
