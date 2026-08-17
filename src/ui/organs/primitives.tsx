/**
 * Shared SVG primitives for the organ illustration.
 * Nothing here makes a physiological claim — these are the drawing tools that the
 * per-organ modules bind bus signals to.
 *
 * Drawn for a light clinical ground: outlines carry the shape, fills are soft and flat,
 * and colour is spent only where it means something.
 */

import type { ReactNode } from 'react'
import { useT } from '../../i18n/useT'
import { arcPath, clamp, ION, ORGAN, qdur, tintWash, vars, type IonId } from './channels'

// ---------------------------------------------------------------------------
// V5 / V9 / V12 — particles travelling a path
// ---------------------------------------------------------------------------

export interface StreamProps {
  /** SVG path data, in this element's user space. */
  d: string
  /** How many sprites are alive on the path. 0 hides the stream entirely. */
  count: number
  /** Seconds for one traversal. */
  durationS: number
  colour: string
  r?: number
  /** Travel the path backwards — used for the reversed urate arrow (§7.4). */
  reverse?: boolean
  opacity?: number
  /** Rendered behind the sprites so the viewer can see where they are going. */
  showTrack?: boolean
  trackDasharray?: string
  className?: string
}

/**
 * A stream of sprites along a path. Duration is quantised so that a stream does
 * not visibly restart on every emitted frame.
 *
 * Motion here is the signal: the spawn rate and the traversal speed are both bound to a
 * bus field, so a fast stream means fast flow and a still one means none. Nothing on the
 * figure moves for decoration.
 */
export function Stream({
  d,
  count,
  durationS,
  colour,
  r = 2.4,
  reverse = false,
  opacity = 1,
  showTrack = false,
  trackDasharray = '3 5',
  className,
}: StreamProps) {
  const n = clamp(Math.round(count), 0, 18)
  const dur = qdur(durationS)
  const sprites: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    sprites.push(
      <circle
        key={i}
        className="pil-particle"
        r={r}
        fill={colour}
        style={vars({
          offsetPath: `path("${d}")`,
          '--pil-dur': `${dur}s`,
          '--pil-delay': `${(-(i * dur) / n).toFixed(3)}s`,
          '--pil-dir': reverse ? 'reverse' : 'normal',
          opacity,
        })}
      />,
    )
  }
  return (
    <g className={className}>
      {showTrack && (
        <path
          d={d}
          fill="none"
          stroke={colour}
          strokeOpacity={0.3}
          strokeWidth={1}
          strokeDasharray={trackDasharray}
        />
      )}
      {sprites}
    </g>
  )
}

/** V9 — typed ion sprites. Colour is identity, locked per ion. */
export function IonStream(props: Omit<StreamProps, 'colour'> & { ion: IonId }) {
  const { ion, ...rest } = props
  return <Stream {...rest} colour={ION[ion].colour} r={rest.r ?? 3} />
}

// ---------------------------------------------------------------------------
// V1 — the diverging wash, laid over natural anatomical colour
// ---------------------------------------------------------------------------

/**
 * Paint the diverging ramp over a shape without destroying its anatomical colour.
 * `d` is the same path data as the organ underneath; at baseline the wash is fully
 * transparent, so untreated tissue looks untreated.
 */
export function TintOverlay({
  d,
  t,
  gain,
  className,
}: {
  d: string
  t: number | null
  gain?: number
  className?: string
}) {
  const w = tintWash(t, gain)
  if (w.opacity < 0.01) return null
  return <path className={className} d={d} fill={w.colour} opacity={w.opacity} pointerEvents="none" />
}

/** The same wash for a stroked element (a tubule segment, a vessel). */
export function TintStroke({
  d,
  t,
  width,
  gain,
  linecap = 'round',
}: {
  d: string
  t: number | null
  width: number
  gain?: number
  linecap?: 'round' | 'butt'
}) {
  const w = tintWash(t, gain)
  if (w.opacity < 0.01) return null
  return (
    <path
      d={d}
      fill="none"
      stroke={w.colour}
      strokeWidth={width}
      strokeLinecap={linecap}
      opacity={w.opacity}
      pointerEvents="none"
    />
  )
}

// ---------------------------------------------------------------------------
// Type metrics and lane layout.
//
// Every caption on this figure is positioned by a computed coordinate, so two of them
// clear each other only if something guarantees it. Optimistic placement holds at rest
// and fails the moment a value grows a digit, a third line appears under a callout or a
// swelling limb grows into a label — which is to say, it fails during the demo rather
// than before it. These are the numbers and the one function that make the guarantee.
//
// The metrics are deliberately generous: they are the box the type is ALLOWED, not a
// measurement of the glyphs, so a longer string eats slack that was reserved for it.
// ---------------------------------------------------------------------------

/** Ascent above the baseline, as a multiple of font-size. */
export const TEXT_ASCENT = 0.8
/** Descent below the baseline, as a multiple of font-size. */
export const TEXT_DESCENT = 0.25

/** Font sizes, mirrored from the type rules in organs.css. `calloutTitle`/`calloutLine` —
 * the margin readouts, i.e. the numbers a reader leans in to read — were bumped from
 * 14/11 after a clinician reported them too small to read in the rail: the rail draws
 * this whole figure at a fraction of its native 600 x 720 size, so every SVG-unit font
 * size here is that same fraction on screen. `labelMain`/`labelSub` (labels printed ON
 * an organ, at that organ's own small zoom scale) are untouched — there is no lane
 * layout guarding those against the specific anatomy they sit beside, so growing them is
 * a separate, more careful pass. */
export const TYPE = {
  calloutTitle: 16,
  calloutLine: 12.5,
  labelMain: 13,
  labelSub: 11,
  ringLabel: 10.5,
  tierNote: 10.5,
} as const

/** Baseline drop from a block's heading to its first value line. */
export const TITLE_LEAD = 18
/** Baseline-to-baseline pitch for stacked lines of one caption block. */
export const LINE_PITCH = 16
/** Minimum clear space between two caption blocks that share a lane. */
export const LANE_GAP = 13
/** Baseline offset of a ring caption below the ring's own edge. */
export const RING_LABEL_GAP = 13

/**
 * Lay a set of caption blocks out down one lane so that no two of them touch.
 *
 * Each block asks for a preferred baseline; the layout honours it where it can and pushes
 * the block down where it cannot, so the guarantee holds no matter how many lines a block
 * grew. Blocks are laid out in the order given, which is also the order their leader lines
 * meet the figure — keeping both monotonic is what stops the leaders crossing.
 *
 * Presentation geometry only: nothing here reads or reshapes a bus value.
 */
export interface LaneItem {
  /** Where this block would like its first baseline to sit. */
  y: number
  /** How many lines follow the first one. */
  lines: number
  /** Font size of the first line; the rest use `lineSize`. */
  size?: number
  lineSize?: number
}

export function layoutLane(items: LaneItem[], gap = LANE_GAP): number[] {
  const out: number[] = []
  let cursor = -Infinity
  for (const it of items) {
    const size = it.size ?? TYPE.calloutTitle
    const lineSize = it.lineSize ?? TYPE.calloutLine
    const top = size * TEXT_ASCENT
    const y = Math.max(it.y, cursor + top)
    out.push(y)
    const bottom =
      it.lines > 0
        ? y + TITLE_LEAD + LINE_PITCH * (it.lines - 1) + lineSize * TEXT_DESCENT
        : y + size * TEXT_DESCENT
    cursor = bottom + gap
  }
  return out
}

// ---------------------------------------------------------------------------
// V11 — occupancy ring
// ---------------------------------------------------------------------------

export interface RingProps {
  cx: number
  cy: number
  r: number
  /** engagement fraction, 0..1, or null when the engine did not model it */
  value: number | null
  colour: string
  label?: string
  /** Second concentric arc, e.g. the β2 ring beside the β1 ring. */
  strokeWidth?: number
  labelDy?: number
  /**
   * Shift the caption sideways off the ring's own centre. Needed where the ring sits on
   * top of anatomy and the caption has to be parked in clear space beside it rather than
   * printed over the thing it annotates.
   */
  labelDx?: number
}

/**
 * The honest "how much of the target is engaged" readout. Arc sweep 0->360 deg in the
 * drug's own hue, drawn around the receptor/enzyme it belongs to, on a pale track so an
 * unengaged target still reads as a target rather than as nothing.
 */
export function OccupancyRing({
  cx,
  cy,
  r,
  value,
  colour,
  label,
  strokeWidth = 3.4,
  labelDy = 0,
  labelDx = 0,
}: RingProps) {
  const unmodelled = value === null
  const pct = unmodelled ? 0 : clamp(value, 0, 1)
  return (
    <g className={unmodelled ? 'pil-unmodelled' : undefined}>
      <circle cx={cx} cy={cy} r={r} fill={ORGAN.panel} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeOpacity={0.22} strokeWidth={strokeWidth} />
      {!unmodelled && pct > 0.002 && (
        <path
          d={arcPath(cx, cy, r, 360 * pct)}
          fill="none"
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
      {label && (
        <text
          className="pil-ring-label"
          x={cx + labelDx}
          y={cy + r + RING_LABEL_GAP + labelDy}
          textAnchor="middle"
          fill={colour}
        >
          {label} {unmodelled ? '—' : `${Math.round(pct * 100)}%`}
        </text>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Unmodelled state — §2 bus completeness check
// ---------------------------------------------------------------------------

/**
 * Wrap any organ channel whose driving signal arrived null.
 * Dashed outline, reduced opacity, explicit tooltip. Never falls back to zero.
 */
export function Unmodelled({ children, what }: { children: ReactNode; what: string }) {
  const t = useT()
  return (
    <g className="pil-unmodelled">
      <title>{t('organ.common.notModelledInBuild', { what })}</title>
      {children}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export interface OrganLabelProps {
  x: number
  y: number
  text: string
  sub?: string
  anchor?: 'start' | 'middle' | 'end'
  /** T1 labels are visually marked because there is exactly one of them. */
  tier?: 'T1' | 'T2' | 'T3' | 'T4'
  title?: string
}

export function OrganLabel({ x, y, text, sub, anchor = 'start', tier, title }: OrganLabelProps) {
  return (
    <g className={`pil-label${tier ? ` pil-tier-${tier}` : ''}`}>
      {title && <title>{title}</title>}
      <text x={x} y={y} textAnchor={anchor} className="pil-label-main">
        {text}
      </text>
      {sub && (
        <text x={x} y={y + 13} textAnchor={anchor} className="pil-label-sub">
          {sub}
        </text>
      )}
    </g>
  )
}

/** A short leader line from a label to an anatomical element. */
export function Leader({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g className="pil-leader-g">
      <path className="pil-leader" d={`M ${x1} ${y1} L ${x2} ${y2}`} />
      <circle className="pil-leader-dot" cx={x2} cy={y2} r={2.1} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// A horizontal meter, used for gauges that must not carry absolute units.
// ---------------------------------------------------------------------------

export interface MeterProps {
  /** 0..1 fill position */
  position: number | null
  /** Optional coloured zones as [from, to, colour] in 0..1 space. */
  zones?: Array<[number, number, string]>
  colour: string
  width?: number
  height?: number
}

export function Meter({ position, zones = [], colour, width = 120, height = 8 }: MeterProps) {
  return (
    <svg className="pil-meter" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <rect x={0} y={0} width={width} height={height} rx={height / 2} className="pil-meter-track" />
      {zones.map(([a, b, c], i) => (
        <rect key={i} x={a * width} y={0} width={(b - a) * width} height={height} fill={c} opacity={0.3} />
      ))}
      {position !== null && (
        <rect
          x={clamp(position, 0, 1) * width - 1.5}
          y={-1}
          width={3}
          height={height + 2}
          rx={1.5}
          fill={colour}
          className="pil-meter-needle"
        />
      )}
    </svg>
  )
}
