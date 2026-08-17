/**
 * Hand-rolled SVG charts. No charting library, by instruction.
 *
 * These are meant to read like figures in a clinical paper rather than like a
 * dashboard: light ground, one thin axis rule per side, restrained horizontal
 * gridlines, 2px strokes with no glow, and every series labelled at the end of
 * its own line so the eye never has to travel to a legend and back. Units live
 * in the axis caption, not in a tooltip.
 *
 * The log-scale path is load-bearing, not decoration. A CYP2D6 poor metaboliser's
 * metoprolol peak is an order of magnitude above a normal metaboliser's; on a
 * linear axis both curves and the 80.2 ng/mL threshold collapse into the bottom
 * tenth of the plot.
 */

import { useId, useMemo } from 'react'
import { useT } from '../../i18n'

export interface Point {
  x: number
  y: number
}

export interface Series {
  id: string
  label: string
  /** Short form used for the label drawn at the end of the line. Falls back to `label`. */
  shortLabel?: string
  color: string
  points: Point[]
  /** Rendered dashed — used for comparison overlays. */
  dashed?: boolean
  width?: number
}

export interface ThresholdLine {
  y: number
  label: string
  color?: string
}

export interface BandRegion {
  from: number
  to: number
  label?: string
  color?: string
}

export type AxisScale = 'linear' | 'log'

const VB_W = 960
/** Floor, not a fixed height: the plot grows when a chart carries many series. */
const VB_H_MIN = 340
/** The generous right pad is the label gutter — direct labelling needs the room. */
const PAD = { top: 30, right: 200, bottom: 54, left: 78 }
const LABEL_GAP = 19
/** Tallest a figure may grow before labels start sharing the space instead. */
const PLOT_H_MAX = 560

/* The direct labels live in the right pad and must never leave the viewBox, so
   the room they get is derived from the pad rather than guessed. 12.5px at
   weight 600 averages a shade under 7.3px per character across the labels this
   view actually draws; the 8px tail keeps the last glyph off the edge. */
const LABEL_X_OFFSET = 12
const LABEL_CHAR_W = 7.3
const LABEL_MAX_CHARS = Math.floor((PAD.right - LABEL_X_OFFSET - 8) / LABEL_CHAR_W)

function niceTicks(min: number, max: number, target = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [min, max]
  const span = max - min
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag
  const first = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = first; v <= max + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(min))
  const hi = Math.ceil(Math.log10(max))
  const out: number[] = []
  for (let e = lo; e <= hi; e++) {
    const v = Math.pow(10, e)
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v)
  }
  return out.length >= 2 ? out : [min, max]
}

function fmt(v: number): string {
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 1000) return v.toFixed(0)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, '')
  if (a >= 1) return v.toFixed(2).replace(/0$/, '').replace(/\.$/, '')
  if (a >= 0.01) return v.toFixed(3)
  return v.toExponential(0)
}

function ellipsis(s: string, max = LABEL_MAX_CHARS): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`
}

export interface LineChartProps {
  title: string
  subtitle?: string
  series: Series[]
  xLabel: string
  yLabel: string
  yScale?: AxisScale
  /** Forced axis bounds. */
  yMin?: number
  yMax?: number
  xMin?: number
  xMax?: number
  thresholds?: ThresholdLine[]
  /** Shaded vertical bands, e.g. "day 1" vs "day 8". */
  bands?: BandRegion[]
  /** Vertical cursor at the newest streamed sample. */
  cursorX?: number | null
  emptyMessage?: string
  footnote?: string
}

export function LineChart(props: LineChartProps) {
  const {
    title,
    subtitle,
    series,
    xLabel,
    yLabel,
    yScale = 'linear',
    thresholds = [],
    bands = [],
    cursorX = null,
    emptyMessage,
    footnote,
  } = props

  const t = useT()
  const clipId = useId().replace(/:/g, '')
  const resolvedEmptyMessage = emptyMessage ?? t('sim.chart.noSamplesYet')

  const geom = useMemo(() => {
    const pts = series.flatMap((s) => s.points)
    if (!pts.length) return null

    const xMin = props.xMin ?? Math.min(...pts.map((p) => p.x))
    let xMax = props.xMax ?? Math.max(...pts.map((p) => p.x))
    if (xMax - xMin < 1e-9) xMax = xMin + 1

    const thresholdYs = thresholds.map((t) => t.y)
    const ysRaw = pts.map((p) => p.y).concat(thresholdYs)

    let yMin: number
    let yMax: number
    if (yScale === 'log') {
      const positive = ysRaw.filter((v) => v > 0)
      const hi = positive.length ? Math.max(...positive) : 1
      const floor = hi / 1e4
      const lo = positive.length ? Math.max(Math.min(...positive), floor) : floor
      yMin = props.yMin ?? Math.pow(10, Math.floor(Math.log10(lo)))
      yMax = props.yMax ?? Math.pow(10, Math.ceil(Math.log10(hi)))
      if (yMax <= yMin) yMax = yMin * 10
    } else {
      const lo = props.yMin ?? Math.min(...ysRaw)
      const hi = props.yMax ?? Math.max(...ysRaw)
      const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.08 || 1
      yMin = props.yMin ?? lo - pad
      yMax = props.yMax ?? hi + pad
      if (yMax - yMin < 1e-9) yMax = yMin + 1
    }

    const plotW = VB_W - PAD.left - PAD.right
    /* Space is reserved for the labels rather than taken from the plot: a chart
       with seven engagement channels grows taller instead of stacking seven
       names into the same 256px and letting them overprint. */
    const labelled = series.filter((s) => s.points.length >= 2).length
    const plotH = Math.max(
      VB_H_MIN - PAD.top - PAD.bottom,
      Math.min(PLOT_H_MAX, (labelled - 1) * LABEL_GAP + 24),
    )
    const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW
    const sy = (y: number) => {
      if (yScale === 'log') {
        const v = Math.max(y, yMin)
        const t = (Math.log10(v) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))
        return PAD.top + (1 - t) * plotH
      }
      return PAD.top + (1 - (y - yMin) / (yMax - yMin)) * plotH
    }

    return {
      xMin,
      xMax,
      yMin,
      yMax,
      sx,
      sy,
      plotW,
      plotH,
      vbH: plotH + PAD.top + PAD.bottom,
      xTicks: niceTicks(xMin, xMax, 6),
      yTicks: yScale === 'log' ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, 5),
    }
  }, [series, thresholds, yScale, props.xMin, props.xMax, props.yMin, props.yMax])

  /**
   * Direct labels. Each line is named beside its own end point, and the labels
   * are pushed apart vertically so two close curves never overprint. A leader
   * line is drawn whenever a label had to move off its true height, so the
   * reader can still tell which name belongs to which curve.
   *
   * Two failure modes are closed here rather than hoped away. The gap shrinks
   * to whatever the column can actually hold, so the pass that pushes labels
   * back up from the bottom edge can never drive the first one out through the
   * top of the figure. And if even that is not enough room — far more series
   * than any of these charts is asked to carry — the labels that will not fit
   * are dropped rather than drawn on top of one another; their end-point dots
   * stay, and every series is still named in the figure's aria-label.
   */
  const labels = useMemo(() => {
    if (!geom) return []
    const raw = series
      .filter((s) => s.points.length >= 2)
      .map((s) => {
        const last = s.points[s.points.length - 1]
        return {
          id: s.id,
          text: s.shortLabel ?? s.label,
          full: s.label,
          color: s.color,
          dashed: !!s.dashed,
          endX: geom.sx(last.x),
          endY: geom.sy(last.y),
          y: geom.sy(last.y),
        }
      })
      .sort((a, b) => a.y - b.y)

    // The label is centred on its baseline, so the band it occupies is inset
    // from the plot edges by half its own height at each end.
    const top = PAD.top + 8
    const bottom = PAD.top + geom.plotH - 8
    const room = bottom - top
    const kept = raw.slice(0, Math.max(1, Math.floor(room / 13) + 1))
    const gap = kept.length > 1 ? Math.min(LABEL_GAP, room / (kept.length - 1)) : LABEL_GAP

    for (let i = 0; i < kept.length; i++) {
      const min = i === 0 ? top : kept[i - 1].y + gap
      if (kept[i].y < min) kept[i].y = min
    }
    for (let i = kept.length - 1; i >= 0; i--) {
      const max = i === kept.length - 1 ? bottom : kept[i + 1].y - gap
      if (kept[i].y > max) kept[i].y = max
    }
    return kept
  }, [series, geom])

  return (
    <figure className="sim-chart">
      <figcaption className="sim-chart-head">
        <h4 className="sim-chart-title">{title}</h4>
        {subtitle && <p className="sim-chart-sub">{subtitle}</p>}
      </figcaption>

      {!geom ? (
        <div className="sim-chart-empty">{resolvedEmptyMessage}</div>
      ) : (
        <svg
          className="sim-chart-svg"
          viewBox={`0 0 ${VB_W} ${geom.vbH}`}
          role="img"
          aria-label={`${title}. ${yLabel} against ${xLabel}. Series: ${series.map((s) => s.label).join('; ')}`}
        >
          <defs>
            <clipPath id={`clip-${clipId}`}>
              <rect x={PAD.left} y={PAD.top} width={geom.plotW} height={geom.plotH} />
            </clipPath>
          </defs>

          {bands.map((b, i) => (
            <g key={`band-${i}`}>
              <rect
                x={geom.sx(Math.max(b.from, geom.xMin))}
                y={PAD.top}
                width={Math.max(0, geom.sx(Math.min(b.to, geom.xMax)) - geom.sx(Math.max(b.from, geom.xMin)))}
                height={geom.plotH}
                fill={b.color ?? 'var(--sim-band)'}
              />
              {b.label && (
                <text className="sim-band-label" x={geom.sx(Math.max(b.from, geom.xMin)) + 8} y={PAD.top + 16}>
                  {b.label}
                </text>
              )}
            </g>
          ))}

          {/* Horizontal gridlines only. Vertical rules add ink without adding reading. */}
          {geom.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className="sim-grid" x1={PAD.left} x2={PAD.left + geom.plotW} y1={geom.sy(t)} y2={geom.sy(t)} />
              <text className="sim-tick" x={PAD.left - 12} y={geom.sy(t) + 4} textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}

          {geom.xTicks.map((t) => (
            <g key={`x${t}`}>
              <line
                className="sim-axis-tick"
                x1={geom.sx(t)}
                x2={geom.sx(t)}
                y1={PAD.top + geom.plotH}
                y2={PAD.top + geom.plotH + 5}
              />
              <text className="sim-tick" x={geom.sx(t)} y={PAD.top + geom.plotH + 22} textAnchor="middle">
                {fmt(t)}
              </text>
            </g>
          ))}

          {/* Two thin rules, not a box. */}
          <line
            className="sim-axis"
            x1={PAD.left}
            x2={PAD.left}
            y1={PAD.top}
            y2={PAD.top + geom.plotH}
          />
          <line
            className="sim-axis"
            x1={PAD.left}
            x2={PAD.left + geom.plotW}
            y1={PAD.top + geom.plotH}
            y2={PAD.top + geom.plotH}
          />

          {/* Units read horizontally, above the axis they belong to. Anchored at
              the axis and running right, into the empty band above the plot:
              anchored the other way, a caption as long as "Fraction engaged"
              runs off the left of the figure. */}
          <text className="sim-axis-label" x={PAD.left} y={PAD.top - 12} textAnchor="start">
            {yLabel}
          </text>
          <text
            className="sim-axis-label"
            x={PAD.left + geom.plotW / 2}
            y={PAD.top + geom.plotH + 46}
            textAnchor="middle"
          >
            {xLabel}
          </text>

          <g clipPath={`url(#clip-${clipId})`}>
            {thresholds.map((t, i) => (
              <g key={`th-${i}`}>
                <line
                  className="sim-threshold"
                  x1={PAD.left}
                  x2={PAD.left + geom.plotW}
                  y1={geom.sy(t.y)}
                  y2={geom.sy(t.y)}
                  stroke={t.color ?? 'var(--sim-warn)'}
                />
                <text
                  className="sim-threshold-label"
                  x={PAD.left + 8}
                  /* Kept inside the plot when the line sits near the top edge. */
                  y={Math.max(geom.sy(t.y) - 8, PAD.top + 12)}
                  fill={t.color ?? 'var(--sim-warn)'}
                >
                  {t.label}
                </text>
              </g>
            ))}

            {series.map((s) => {
              if (s.points.length < 2) return null
              const d = s.points
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${geom.sx(p.x).toFixed(2)},${geom.sy(p.y).toFixed(2)}`)
                .join(' ')
              return (
                <path
                  key={s.id}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width ?? 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '7 5' : undefined}
                  opacity={s.dashed ? 0.95 : 1}
                />
              )
            })}

            {cursorX != null && cursorX >= geom.xMin && cursorX <= geom.xMax && (
              <line
                className="sim-cursor"
                x1={geom.sx(cursorX)}
                x2={geom.sx(cursorX)}
                y1={PAD.top}
                y2={PAD.top + geom.plotH}
              />
            )}
          </g>

          {/* Direct labels, outside the clip so they may sit in the gutter. */}
          {labels.map((l) => (
            <g key={`lab-${l.id}`}>
              <circle cx={l.endX} cy={l.endY} r={2.6} fill={l.color} />
              <polyline
                className="sim-leader"
                points={`${l.endX + 4},${l.endY} ${PAD.left + geom.plotW + LABEL_X_OFFSET - 4},${l.y}`}
                fill="none"
                stroke={l.color}
              />
              <text
                className="sim-series-label"
                x={PAD.left + geom.plotW + LABEL_X_OFFSET}
                y={l.y}
                fill={l.color}
              >
                {ellipsis(l.text)}
                <title>{l.full}</title>
              </text>
            </g>
          ))}
        </svg>
      )}

      {footnote && <p className="sim-chart-foot">{footnote}</p>}
    </figure>
  )
}

// ---------------------------------------------------------------------------
// horizontal bar chart — used for the combination ranking and the risk table
// ---------------------------------------------------------------------------

export interface BarRow {
  id: string
  label: string
  value: number
  color?: string
  /** Rendered on the right of the bar. */
  annotation?: string
  highlight?: boolean
  muted?: boolean
}

export function BarChart({
  rows,
  valueLabel,
  max,
  min = 0,
  formatValue = (v: number) => fmt(v),
}: {
  rows: BarRow[]
  valueLabel: string
  max?: number
  min?: number
  formatValue?: (v: number) => string
}) {
  const t = useT()
  if (!rows.length) return <div className="sim-chart-empty">{t('sim.chart.nothingToRankYet')}</div>
  const hi = max ?? Math.max(...rows.map((r) => r.value), 0)
  const lo = Math.min(min, ...rows.map((r) => r.value))
  const span = hi - lo || 1
  /* Every row is its own grid, so the annotation column has to be reserved for
     the whole table or not at all: sized per row, one row carrying "oedema 9 %"
     would shorten its own bar and the bars would stop being comparable. */
  const hasNotes = rows.some((r) => !!r.annotation)

  return (
    <div className={`sim-bars${hasNotes ? ' has-notes' : ''}`} role="table" aria-label={valueLabel}>
      {rows.map((r, i) => {
        const zero = ((0 - lo) / span) * 100
        const v = ((r.value - lo) / span) * 100
        const left = Math.min(zero, v)
        const width = Math.abs(v - zero)
        return (
          <div
            key={r.id}
            className={`sim-bar-row${r.highlight ? ' is-highlight' : ''}${r.muted ? ' is-muted' : ''}`}
            role="row"
          >
            <span className="sim-bar-rank">{i + 1}</span>
            <span className="sim-bar-label" role="cell" title={r.label}>
              {r.label}
            </span>
            <span className="sim-bar-track" role="cell">
              <span
                className="sim-bar-fill"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.4)}%`,
                  background: r.color ?? 'var(--sim-accent)',
                }}
              />
            </span>
            <span className="sim-bar-value" role="cell">
              {formatValue(r.value)}
            </span>
            {r.annotation && <span className="sim-bar-note">{r.annotation}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// stacked composite bar — §6.2: the composite is never drawn without E, S, A
// ---------------------------------------------------------------------------

export function CompositeBar({
  efficacy,
  safety,
  appropriateness,
  composite,
}: {
  efficacy: number
  safety: number
  appropriateness: number
  composite: number
}) {
  const t = useT()
  const parts = [
    { key: 'E', label: t('sim.chart.efficacy'), value: efficacy, color: 'var(--sim-e)' },
    { key: 'S', label: t('sim.chart.safety'), value: safety, color: 'var(--sim-s)' },
    { key: 'A', label: t('sim.chart.appropriateness'), value: appropriateness, color: 'var(--sim-a)' },
  ]
  return (
    <div className="sim-composite">
      <div className="sim-composite-total">
        <strong>{Math.round(composite)}</strong>
        <span>{t('sim.chart.composite')}</span>
      </div>
      <div className="sim-composite-parts">
        {parts.map((p) => (
          <div className="sim-composite-part" key={p.key}>
            <span className="sim-composite-key">{p.label}</span>
            <span className="sim-composite-track">
              <span
                className="sim-composite-fill"
                style={{ width: `${Math.max(0, Math.min(100, p.value))}%`, background: p.color }}
              />
            </span>
            <span className="sim-composite-num">{Math.round(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
