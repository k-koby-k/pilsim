/**
 * LUNGS — research/04-ORGAN-EFFECT-MAP.md §9. The lung is a drug TARGET organ here.
 *
 * Three stories from three drugs:
 *   lisinopril  pulmonary capillary endothelial ACE -> bradykinin haze -> cough channel
 *   losartan    the ABSENCE of that haze, rendered explicitly
 *   metoprolol  beta-2 spillover -> airway narrowing (the selectivity-loss channel)
 *
 * Honesty note (§9.2 / §14): HPA tissue specificity for ACE lists intestine and testis,
 * NOT lung. Pulmonary endothelial ACE is classical physiology, not supported by the
 * expression data pulled here. Tier T3 — rendered at tissue level, tooltip says
 * "mechanism inferred", and no cell population is named.
 *
 * DRAWING NOTES. Anterior view. The image-left field is the patient's right lung — three
 * lobes, wider, no notch. The image-right field is the patient's left lung — two lobes,
 * with the cardiac notch cut into its medial border where the heart sits.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { clamp, DRUGS, norm, ORGAN, onBoard, sig, sigOr, tintWash } from './channels'
import { OccupancyRing } from './primitives'

export interface LungProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  /** Inline readouts. The body figure turns these off and annotates from the margin. */
  labels?: boolean
}

/**
 * V6 applied to the bronchial lumen (§9.2):
 *   radius = base x (1 - 0.45 x beta2_occupancy)
 * The 0.45 gain is ESTIMATED and VISUAL, chosen so 38 % occupancy — the top of the
 * measured range at metoprolol 100 mg b.i.d. — gives a clearly visible ~17 % narrowing.
 */
export const AIRWAY_BASE_PX = 9
export const AIRWAY_BETA2_GAIN = 0.45

export function airwayWidth(beta2: number | null): number | null {
  if (beta2 === null) return null
  return AIRWAY_BASE_PX * (1 - AIRWAY_BETA2_GAIN * clamp(beta2, 0, 1))
}

/**
 * Patient's right lung — image left. Three lobes, no notch, slightly the wider of the two.
 * The medial borders of the pair are held apart so the mediastinum reads as a gap and the
 * chest does not collapse into one pink oval behind the heart.
 */
const D_RIGHT_LUNG =
  'M -14 2 C -32 6 -44 26 -50 56 C -56 86 -54 112 -43 123 C -34 132 -17 131 -13 120 ' +
  'C -11 111 -11 94 -11 78 L -12 10 Z'

/** Patient's left lung — image right. Two lobes, cardiac notch on the medial border. */
const D_LEFT_LUNG =
  'M 14 2 C 32 6 44 26 50 56 C 56 86 54 112 43 123 C 34 132 19 130 15 119 ' +
  'C 12 108 28 99 28 84 C 28 69 12 63 11 50 L 12 10 Z'

export function Lungs({ frame, x, y, scale = 1, labels = true }: LungProps) {
  const t = useT()
  const acePulm = sig(frame.engagement?.ace_inhibition_pulmonary)
  const beta2 = sig(frame.engagement?.beta2_occupancy)
  const bkAirway = sigOr(frame.lung?.bradykinin_airway_fold, 1.0)
  const fev1 = sig(frame.lung?.fev1_pct_baseline)
  const tone = sig(frame.lung?.airway_smooth_muscle_tone_index)

  const lisOn = onBoard(frame.conc?.lisinopril, 'lisinopril')
  const losOn = onBoard(frame.conc?.losartan, 'losartan') || onBoard(frame.conc?.exp3174, 'exp3174')

  // Bradykinin accumulation over the airways — lisinopril only, and it builds slowly.
  const haze = lisOn ? 0.32 * norm(bkAirway, 1.0, 3.0) : 0
  const airwayW = airwayWidth(beta2) ?? AIRWAY_BASE_PX
  const airwayT =
    tone === null ? (beta2 === null ? null : clamp(beta2, 0, 1)) : clamp((tone - 1) / 0.5, -1, 1)
  const airwayWash = tintWash(airwayT, 0.75)

  // ACE inhibition in the pulmonary capillary bed: the mesh gains contrast rather than glow,
  // because a halo on a white ground reads as a smudge and not as a signal.
  const mesh = acePulm === null ? 0 : clamp(acePulm, 0, 1)

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-lungs">
      <title>{t('organ.lungs.title')}</title>

      {/* ---- lung fields ---- */}
      <path d={D_RIGHT_LUNG} fill={ORGAN.lung} stroke={ORGAN.lungLine} strokeWidth={1.6} />
      <path d={D_LEFT_LUNG} fill={ORGAN.lung} stroke={ORGAN.lungLine} strokeWidth={1.6} />

      {/* ---- fissures: oblique both sides, horizontal on the right lung only ---- */}
      <g className="pil-fissure" stroke={ORGAN.lungShade} strokeWidth={1.6} fill="none" strokeLinecap="round">
        <path d="M -48 48 C -37 63 -24 76 -12 84" />
        <path d="M -46 34 C -35 41 -22 45 -12 46" />
        <path d="M 48 48 C 37 63 26 78 16 88" />
      </g>

      {/* ---- pulmonary capillary bed. Density and contrast carry ACE inhibition. ---- */}
      {mesh > 0.01 && (
        <g className="pil-cap-mesh">
          <title>{t('organ.lungs.capillaryBedTitle')}</title>
          {[28, 46, 64, 82, 100].map((yy) => (
            <g key={yy}>
              <path
                d={`M -42 ${yy} C -32 ${yy - 7} -20 ${yy + 7} -10 ${yy}`}
                fill="none"
                stroke={DRUGS.lisinopril.hue}
                strokeWidth={0.8 + 1.2 * mesh}
                strokeOpacity={0.25 + 0.55 * mesh}
              />
              <path
                d={`M 42 ${yy} C 32 ${yy - 7} 20 ${yy + 7} 10 ${yy}`}
                fill="none"
                stroke={DRUGS.lisinopril.hue}
                strokeWidth={0.8 + 1.2 * mesh}
                strokeOpacity={0.25 + 0.55 * mesh}
              />
            </g>
          ))}
        </g>
      )}

      {/* ---- bradykinin accumulation. Losartan deliberately has NO layer here. ---- */}
      {haze > 0.01 && (
        <g className="pil-haze">
          <title>{t('organ.lungs.hazeTitle')}</title>
          <path d={D_RIGHT_LUNG} fill={DRUGS.lisinopril.hue} opacity={haze} />
          <path d={D_LEFT_LUNG} fill={DRUGS.lisinopril.hue} opacity={haze} />
        </g>
      )}

      {/* ---- trachea and bronchial tree, calibre bound to beta-2 occupancy ---- */}
      <g className="pil-airway">
        <title>{t('organ.lungs.airwayTitle')}</title>
        <path d="M 0 -14 L 0 38" stroke={ORGAN.airway} strokeWidth={airwayW} strokeLinecap="round" fill="none" />
        <path
          d="M 0 38 C -10 48 -20 58 -27 76"
          stroke={ORGAN.airway}
          strokeWidth={airwayW * 0.75}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 0 38 C 10 48 20 58 27 76"
          stroke={ORGAN.airway}
          strokeWidth={airwayW * 0.75}
          strokeLinecap="round"
          fill="none"
        />
        {airwayWash.opacity > 0.01 && (
          <g opacity={airwayWash.opacity} stroke={airwayWash.colour} fill="none" strokeLinecap="round">
            <path d="M 0 -14 L 0 38" strokeWidth={airwayW} />
            <path d="M 0 38 C -10 48 -20 58 -27 76" strokeWidth={airwayW * 0.75} />
            <path d="M 0 38 C 10 48 20 58 27 76" strokeWidth={airwayW * 0.75} />
          </g>
        )}
        {/* cartilage rings on the trachea — shape cue only */}
        <g stroke={ORGAN.panel} strokeWidth={1} strokeOpacity={0.45}>
          {[-6, 2, 10, 18, 26].map((yy) => (
            <line key={yy} x1={-airwayW / 2 + 0.6} y1={yy} x2={airwayW / 2 - 0.6} y2={yy} />
          ))}
        </g>
      </g>

      {/* airway sensory nerve fibre — used ONLY for the cough channel */}
      <path
        d="M 4 -12 C 14 12 14 44 6 70"
        fill="none"
        stroke={ORGAN.nerve}
        strokeOpacity={0.55}
        strokeWidth={1.1}
        strokeDasharray="2 3"
      />

      {labels && (
        <>
          {losOn && !lisOn && (
            <text x={0} y={-24} textAnchor="middle" className="pil-label-sub pil-emph">
              {t('organ.lungs.noBradykinin')}
            </text>
          )}
          {/* Readouts sit BELOW the lung fields, and the ring keeps its own column to the
              left of them. Centring the FEV₁ line on the midline while the ring caption ran
              out from x = −62 on the same baseline put the two straight through each other
              at every occupancy value — they were never apart, not even at rest. */}
          <g transform="translate(-70 150)">
            <OccupancyRing cx={0} cy={0} r={12} value={beta2} colour={DRUGS.metoprolol.hue} label={t('organ.lungs.beta2AirwayLabel')} />
          </g>
          <text x={-10} y={150} className="pil-label-sub">
            {fev1 === null ? t('organ.lungs.fev1NotModelled') : t('organ.lungs.fev1Value', { value: fev1.toFixed(0) })}
          </text>
          <text x={-10} y={172} className="pil-tier-note">
            {t('organ.lungs.tierNote')}
          </text>
        </>
      )}
    </g>
  )
}
