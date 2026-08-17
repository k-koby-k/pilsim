/**
 * ADRENAL GLAND — research/04-ORGAN-EFFECT-MAP.md §10.
 *
 * Small organ, disproportionate narrative value: a drug acting on the LUNG's enzyme
 * changes a hormone made ABOVE THE KIDNEY which changes POTASSIUM. That chain, animated
 * with a deliberate lag, is the whole argument for mechanistic simulation.
 *
 * Rendered as "outer cortex (zona glomerulosa)" at tissue level. Tier T3 — HPA tissue
 * specificity for AGTR1 lists liver and placenta, so adrenal AT1 is classical rather than
 * cell-resolved here. No cell population is named.
 *
 * Aldosterone breakthrough (partial escape over weeks) is NOT modelled — stated, not hidden.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { bip, DRUGS, flow, norm, onBoard, ORGAN, sig, tintWash } from './channels'
import { OrganLabel, Stream, TintOverlay } from './primitives'

export interface AdrenalProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  /** Path the aldosterone sprites travel toward the collecting duct. */
  streamPath?: string
  labels?: boolean
}

/** The gland: a flattened pyramidal cap that sits over the upper pole of the kidney. */
const D_GLAND = 'M -22 14 C -21 -2 -10 -15 0 -15 C 11 -15 22 -2 23 14 C 12 21 -10 21 -22 14 Z'

/** The outer cortex band, hugging the capsule — the zona glomerulosa, at tissue level. */
const D_CORTEX =
  'M -22 14 C -21 -2 -10 -15 0 -15 C 11 -15 22 -2 23 14 C 18 16 15 11 13 8 ' +
  'C 6 -2 -6 -2 -13 8 C -15 11 -17 16 -22 14 Z'

export function Adrenal({ frame, x, y, scale = 1, streamPath, labels = true }: AdrenalProps) {
  const t = useT()
  const aldoFold = sig(frame.mediators?.aldosterone_fold)
  const aldo = sig(frame.mediators?.aldosterone)

  // V1 of the zona glomerulosa band: bip(aldosterone_fold, 1.0, 0.6) -> blue as it falls.
  const bandT = aldoFold === null ? null : bip(aldoFold, 1.0, 0.6)

  // V12 sprite stream adrenal -> collecting duct, spawn rate over norm(aldo_fold, 0.3, 1.8).
  const stream = flow(aldoFold === null ? null : norm(aldoFold, 0.3, 1.8), 160)

  const raasBlocked =
    onBoard(frame.conc?.lisinopril, 'lisinopril') ||
    onBoard(frame.conc?.losartan, 'losartan') ||
    onBoard(frame.conc?.exp3174, 'exp3174')
  const hctzOn = onBoard(frame.conc?.hydrochlorothiazide, 'hydrochlorothiazide')

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-adrenal">
      <title>{t('organ.adrenal.title')}</title>

      <path d={D_GLAND} fill={ORGAN.adrenal} stroke={ORGAN.adrenalLine} strokeWidth={1.4} />
      <path d={D_CORTEX} fill={ORGAN.adrenalCortex} />
      <TintOverlay d={D_CORTEX} t={bandT} gain={0.7} />
      {/* medulla hint — the darker core, drawn only so the cortex band reads as a band */}
      <path d="M -12 10 C -6 1 6 1 12 10 C 6 14 -6 14 -12 10 Z" fill={ORGAN.adrenalMedulla} fillOpacity={0.7} />

      {labels && (
        <>
          <OrganLabel
            x={0}
            y={36}
            anchor="middle"
            text={t('organ.adrenal.cortexLabel')}
            sub={aldoFold === null ? t('organ.adrenal.aldosteroneNotModelled') : t('organ.adrenal.aldosteroneValue', { value: aldoFold.toFixed(2) })}
            title={t('organ.adrenal.cortexTitle')}
          />
          {aldo !== null && (
            <text x={0} y={64} textAnchor="middle" className="pil-label-sub">
              {aldo.toFixed(1)} ng/dL
            </text>
          )}
          {(raasBlocked || hctzOn) && (
            <text x={0} y={78} textAnchor="middle" className="pil-label-sub pil-emph">
              {raasBlocked && hctzOn
                ? t('organ.adrenal.raasAndThiazide')
                : raasBlocked
                  ? t('organ.adrenal.raasOnly')
                  : t('organ.adrenal.thiazideOnly')}
            </text>
          )}
        </>
      )}

      {/* hormone sprites travelling adrenal -> collecting duct */}
      {streamPath && stream && (
        <Stream d={streamPath} count={stream.count} durationS={stream.durationS} colour={ORGAN.aldosterone} r={2.2} showTrack />
      )}
    </g>
  )
}

/**
 * The RAAS cascade panel (§10). A horizontal cascade with a stop-bar at [ACE] for
 * lisinopril and at [AT1] for losartan, the bar height bound to the matching engagement
 * value. Upstream nodes rise (renin and AngI) while downstream nodes fall.
 * Two stop-bars on one cascade is what makes the dual-RAAS-blockade case self-evident.
 */
export const RAAS_CASCADE_SIZE = { w: 640, h: 156 } as const

export function RaasCascade({ frame }: { frame: EffectFrame }) {
  const t = useT()
  return (
    <svg
      className="pil-raas"
      viewBox={`0 0 ${RAAS_CASCADE_SIZE.w} ${RAAS_CASCADE_SIZE.h}`}
      role="img"
      aria-label={t('organ.adrenal.raasAriaLabel')}
    >
      <title>{t('organ.adrenal.raasTitle')}</title>
      <RaasCascadeContent frame={frame} />
    </svg>
  )
}

/** The same cascade as a plain group, for placement inside a larger scene. */
export function RaasCascadeContent({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const m = frame.mediators
  const aceBlock = sig(frame.engagement?.ace_inhibition_plasma)
  const at1Block = sig(frame.engagement?.at1_blockade)
  const reninFold = sig(m?.renin_pra_fold)
  const angFold = sig(m?.ang_ii_fold)
  const aldoFold = sig(m?.aldosterone_fold)

  const nodes: Array<{ x: number; label: string; fold: number | null; span: number }> = [
    { x: 64, label: 'renin', fold: reninFold, span: 2.0 },
    { x: 196, label: 'Ang I', fold: reninFold, span: 2.0 },
    { x: 360, label: 'Ang II', fold: angFold, span: 0.8 },
    { x: 536, label: 'aldosterone', fold: aldoFold, span: 0.6 },
  ]

  return (
    <>
      <path d="M 64 58 L 576 58" stroke={ORGAN.panelLine} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {nodes.map((n) => {
        const t = n.fold === null ? null : bip(n.fold, 1.0, n.span)
        const w = tintWash(t, 0.8)
        return (
          <g key={n.label}>
            <circle cx={n.x} cy={58} r={20} fill={ORGAN.reactor} stroke="var(--pil-stroke, #6b5a52)" strokeWidth={1.4} />
            {w.opacity > 0.01 && <circle cx={n.x} cy={58} r={20} fill={w.colour} opacity={w.opacity} />}
            <text x={n.x} y={98} textAnchor="middle" className="pil-label-main">
              {n.label}
            </text>
            <text x={n.x} y={114} textAnchor="middle" className="pil-label-sub">
              {n.fold === null ? '—' : `${n.fold.toFixed(2)}×`}
            </text>
          </g>
        )
      })}

      <StopBar x={272} value={aceBlock} label="ACE" hue={DRUGS.lisinopril.hue} />
      <StopBar x={452} value={at1Block} label="AT1" hue={DRUGS.losartan.hue} />

      <text x={620} y={146} textAnchor="end" className="pil-label-sub">
        {t('organ.adrenal.reninRising')}
      </text>
    </>
  )
}

function StopBar({ x, value, label, hue }: { x: number; value: number | null; label: string; hue: string }) {
  const t = useT()
  const h = value === null ? 0 : 48 * Math.min(1, Math.max(0, value))
  return (
    <g className={value === null ? 'pil-unmodelled' : undefined}>
      <title>
        {value === null
          ? t('organ.adrenal.stopBarNotModelled', { label })
          : t('organ.adrenal.stopBarValue', { label, pct: Math.round(value * 100) })}
      </title>
      <rect x={x - 6} y={34} width={12} height={48} rx={4} fill={ORGAN.panel} stroke={hue} strokeWidth={1.4} />
      {h > 0 && <rect x={x - 6} y={82 - h} width={12} height={h} rx={4} fill={hue} />}
      <text x={x} y={26} textAnchor="middle" className="pil-label-sub" fill={hue}>
        {label}
      </text>
    </g>
  )
}
