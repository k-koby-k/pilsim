/**
 * HEART — research/04-ORGAN-EFFECT-MAP.md §5.
 *
 * Four addressable sub-elements: SA node (region), atrial myocardium,
 * ventricular myocardium (the mass that pulses), coronary arterioles.
 *
 * §5.4 honesty note: ADRB1 is "cell type enhanced" in HPA single cell with tau 0.79 and
 * its top single-cell hit is cytotrophoblasts, NOT cardiomyocytes. Cardiac beta-1 is
 * solid classical pharmacology but no cell-resolved human dataset is cited here.
 * Therefore tier T2, rendered at tissue level, and the SA-node element is labelled
 * "sinoatrial node (region)" — never "pacemaker cells".
 *
 * DRAWING NOTES. Anterior view, so the apex points down and to the viewer's right —
 * that is the patient's left. The image-left border is the right atrium, the image-right
 * border is the left ventricle, the great vessels leave the base at the top. The only
 * thing that moves is the beat, and it moves at the modelled rate and depth.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import {
  beatAmplitude,
  beatPeriodS,
  bip,
  clamp,
  DRUGS,
  flow,
  norm,
  ORGAN,
  sig,
  sigOr,
  vars,
} from './channels'
import { OccupancyRing, Stream, TintOverlay } from './primitives'

export interface HeartProps {
  frame: EffectFrame
  /** translate into the body figure */
  x: number
  y: number
  scale?: number
  /** Inline readouts. The body figure turns these off and annotates from the margin. */
  labels?: boolean
}

/** Ventricular mass, anterior view. Apex at the lower right of the local box. */
const D_VENTRICLES =
  'M -34 -12 C -42 6 -40 26 -28 40 C -14 56 10 62 24 54 C 36 47 42 28 42 6 C 42 -2 41 -8 40 -14 Z'

/** Atrial mass and appendages, sitting above the coronary sulcus. */
const D_ATRIA =
  'M -34 -12 C -44 -22 -44 -38 -32 -44 C -18 -51 6 -52 22 -46 C 34 -41 42 -28 40 -14 C 20 -6 -12 -5 -34 -12 Z'

/** Anterior interventricular (LAD) and right coronary courses — the two stream paths. */
const D_LAD = 'M -2 -12 C 4 6 12 30 22 50'
const D_RCA = 'M -32 -10 C -34 8 -28 28 -18 40'

export function Heart({ frame, x, y, scale = 1, labels = true }: HeartProps) {
  const t = useT()
  const hr = sig(frame.haemo?.hr)
  const ci = sig(frame.haemo?.contractility_index)
  const beta1 = sig(frame.engagement?.beta1_occupancy)
  const sympathetic = sigOr(frame.mediators?.sympathetic_tone_fold, 1.0)
  const co = sig(frame.haemo?.cardiac_output)

  // §5.3 composite spec, verbatim.
  const periodS = beatPeriodS(sigOr(hr, 70))
  const amp = beatAmplitude(sigOr(ci, 1.0))
  const tintT = clamp(bip(1 - sigOr(beta1, 0), 1.0, 1.0) + 0.35 * norm(sympathetic, 1.0, 1.8), -1, 1)
  const washT = hr === null && beta1 === null ? null : tintT

  // Coronary arterioles — V5 over norm(cardiac_output, 2.5, 8.0).
  const coronary = flow(co === null ? null : norm(co, 2.5, 8.0), 150)

  const bradycardic = hr !== null && hr < 50

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-heart">
      <title>{t('organ.heart.title')}</title>

      {/* ---- great vessels, drawn behind the chambers ---- */}
      <g className="pil-great-vessels">
        {/* aortic arch, sweeping to the patient's left */}
        <path
          d="M 0 -40 C 0 -62 8 -78 26 -80 C 42 -81 50 -70 51 -56"
          fill="none"
          stroke={ORGAN.artery}
          strokeWidth={13}
          strokeLinecap="round"
        />
        {/* pulmonary trunk */}
        <path
          d="M -12 -40 C -18 -58 -12 -70 2 -73"
          fill="none"
          stroke={ORGAN.vein}
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* superior vena cava */}
        <path
          d="M -32 -40 C -35 -56 -34 -68 -32 -78"
          fill="none"
          stroke={ORGAN.vein}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </g>

      {/* ---- the mass that pulses (V3 rate, V4 depth) ---- */}
      <g
        className="pil-beat"
        style={vars({ '--pil-period': `${periodS.toFixed(3)}s`, '--pil-amp': amp.toFixed(4) })}
      >
        {/* atrial myocardium */}
        <path className="pil-atria" d={D_ATRIA} fill={ORGAN.atrium} stroke="var(--pil-stroke, #6b5a52)" strokeWidth={1.4} />
        <TintOverlay d={D_ATRIA} t={washT} gain={0.5} />

        {/* ventricular myocardium */}
        <path
          className="pil-ventricles"
          d={D_VENTRICLES}
          fill={ORGAN.myocardium}
          stroke="var(--pil-stroke, #6b5a52)"
          strokeWidth={1.6}
        />
        <TintOverlay d={D_VENTRICLES} t={washT} />

        {/* coronary sulcus and interventricular groove — readability only (T4) */}
        <path
          d="M -34 -12 C -12 -4 20 -5 40 -14"
          fill="none"
          stroke="var(--pil-stroke, #6b5a52)"
          strokeOpacity={0.28}
          strokeWidth={1.2}
        />
        <path d={D_LAD} fill="none" stroke="var(--pil-stroke, #6b5a52)" strokeOpacity={0.22} strokeWidth={1.1} />

        {/* coronary arteries on the surface, with perfusion sprites */}
        <g className="pil-coronary">
          <path d={D_LAD} fill="none" stroke={ORGAN.artery} strokeOpacity={0.85} strokeWidth={2.2} strokeLinecap="round" />
          <path d={D_RCA} fill="none" stroke={ORGAN.artery} strokeOpacity={0.85} strokeWidth={2.2} strokeLinecap="round" />
          {coronary && (
            <>
              <Stream d={D_LAD} count={coronary.count} durationS={coronary.durationS} colour={ORGAN.perfusion} r={1.5} />
              <Stream d={D_RCA} count={coronary.count} durationS={coronary.durationS} colour={ORGAN.perfusion} r={1.5} />
            </>
          )}
        </g>
      </g>

      {/* ---- SA node (region) — at the SVC / right-atrial junction. T2: region, not cells. ---- */}
      <g className="pil-sa-node">
        <title>{t('organ.heart.saNodeTitle')}</title>
        <circle cx={-28} cy={-38} r={4.2} fill={bradycardic ? ORGAN.warn : ORGAN.node} />
        {/* Inside the body figure the ring and its caption are clutter on a 60 px heart, so
            the node is left as a marked region and the β1 number goes to the margin. */}
        {labels && (
          <OccupancyRing
            cx={-28}
            cy={-38}
            r={11}
            value={beta1}
            colour={DRUGS.metoprolol.hue}
            label="β1"
            /* Parked out to the left of the atrium. Straight above the node the caption
               printed over the superior vena cava and the pulmonary trunk; straight below
               it printed over the atrial myocardium. The flank beside the base is the only
               clear space, so that is where it goes. */
            labelDx={-52}
            labelDy={-40}
          />
        )}
        {!labels && beta1 !== null && beta1 > 0.02 && (
          <circle
            cx={-28}
            cy={-38}
            r={8}
            fill="none"
            stroke={DRUGS.metoprolol.hue}
            strokeWidth={2.4}
            strokeDasharray={`${(2 * Math.PI * 8 * clamp(beta1, 0, 1)).toFixed(1)} 999`}
            transform="rotate(-90 -28 -38)"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* bradycardia read-out: §12 gate fires at hr < 50 */}
      {labels && (
        <text className={`pil-hr${bradycardic ? ' pil-hr-alert' : ''}`} x={4} y={80} textAnchor="middle">
          {hr === null ? t('organ.heart.hrNotModelled') : `${Math.round(hr)} bpm`}
        </text>
      )}
    </g>
  )
}
