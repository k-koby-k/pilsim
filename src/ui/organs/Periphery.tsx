/**
 * PERIPHERAL TISSUE — research/04-ORGAN-EFFECT-MAP.md §11. Where the oedema appears.
 *
 * Mechanism (§11.1): dihydropyridines dilate precapillary arterioles without a matching
 * change in postcapillary venules. The unmatched drop in precapillary resistance raises
 * capillary hydrostatic pressure and drives fluid into the interstitium at gravitationally
 * dependent sites. It is NOT salt-and-water retention — which is why a diuretic does not
 * fix it and why adding a RAAS blocker does.
 *
 * edema_grade (§11.3) is a PRESENTATIONAL BRIDGE, not a measurement. The clinical 0-3+
 * pitting scale is not defined in terms of interstitial volume. The run report must express
 * oedema as a probability from the label incidences, never as a grade computed this way.
 *
 * DRAWING NOTES. The shapes here are the same lower leg and foot the body silhouette draws,
 * so the swell reads as that limb thickening rather than as a second object appearing.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EffectFrame } from '../../types'
import { useT, type TFunction } from '../../i18n/useT'
import { clamp, DRUGS, norm, onBoard, ORGAN, sig, swell, tintWash, vars } from './channels'

export interface PeripheryProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  mirror?: boolean
  labels?: boolean
}

/** §11.3 — floor(4 * norm(interstitial_volume_index, 1.00, 1.16)), clamped 0..3. */
export function derivedEdemaGrade(idx: number | null): number | null {
  if (idx === null) return null
  return clamp(Math.floor(4 * norm(idx, 1.0, 1.16)), 0, 3)
}

/**
 * The lower leg and foot, in the SAME construction and the same local coordinates the body
 * silhouette uses for that limb: two round-capped capsules and a foot outline. Because the
 * geometry matches exactly, this layer is invisible at baseline and the swelling reads as
 * that leg thickening rather than as a second object appearing over it.
 */
const SEGMENTS = [
  { d: 'M -0.5 -42 L 1 2', w: 36 }, // calf belly
  { d: 'M 1 2 L 3 62', w: 27 }, // shin
  { d: 'M 3 62 L 4 88', w: 22 }, // ankle
]
const D_FOOT = 'M -8 76 C -14 96 -16 112 -8 118 C 2 124 22 122 26 114 C 30 104 22 90 18 76 Z'

/**
 * The limb's own bounding box, in local units — the box the V7 swell scales about its
 * top edge. Used to work out where the foot ends up so the captions can start below it.
 */
const LIMB_TOP = -60
const LIMB_BOTTOM = 128
/** Baseline-to-baseline pitch of the caption stack under the limb. */
const CAPTION_PITCH = 14
/** Clear space between the foot and the first caption baseline. */
const CAPTION_CLEARANCE = 18

function labelTop(s: { scale: number } | null): number {
  return LIMB_TOP + (LIMB_BOTTOM - LIMB_TOP) * (s?.scale ?? 1) + CAPTION_CLEARANCE
}

/** Only the lines this frame actually produced, so the stack never leaves a hole. */
function captionLines(
  t: TFunction,
  grade: number | null,
  amloOn: boolean,
  coldExtremity: boolean,
): Array<{ text: string; colour?: string }> {
  const out: Array<{ text: string; colour?: string }> = [
    { text: grade === null ? t('organ.periphery.oedemaNotModelled') : t('organ.periphery.pitting', { grade }) },
  ]
  if (amloOn && grade !== null && grade >= 1) {
    out.push({ text: t('organ.periphery.dependentOedema'), colour: DRUGS.amlodipine.hue })
  }
  if (coldExtremity) out.push({ text: t('organ.periphery.coldExtremity'), colour: DRUGS.lisinopril.hue })
  return out
}

/**
 * Ankle and foot. Gravity-dependent placement — V7 swell applies here and nowhere else.
 * Clicking pits the tissue and holds the indentation for 1.5 s x edema_grade.
 */
export function Ankle({ frame, x, y, scale = 1, mirror = false, labels = true }: PeripheryProps) {
  const t = useT()
  const idx = sig(frame.periph?.interstitial_volume_index)
  const busGrade = sig(frame.periph?.edema_grade)
  const grade = busGrade ?? derivedEdemaGrade(idx)
  const capP = sig(frame.haemo?.capillary_hydrostatic_p)

  const s = swell(idx)
  const amloOn = onBoard(frame.conc?.amlodipine, 'amlodipine')
  const metoOn = onBoard(frame.conc?.metoprolol, 'metoprolol')
  const beta1 = sig(frame.engagement?.beta1_occupancy)

  // Amlodipine's warm swell vs metoprolol's cool extremity — deliberately distinct.
  const warm = idx === null ? null : norm(idx, 1.0, 1.15)
  const cool = metoOn && beta1 !== null ? clamp(beta1, 0, 1) : 0
  const limbT = warm === null && !metoOn ? null : (warm ?? 0) * 0.9 - cool * 0.8
  const wash = tintWash(limbT, 0.55)

  const [pitting, setPitting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function pit() {
    if (!grade || grade < 1) return
    setPitting(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setPitting(false), 1500 * grade)
  }

  return (
    <g
      transform={`translate(${x} ${y}) scale(${mirror ? -scale : scale} ${scale})`}
      className="pil-organ pil-ankle"
      onClick={pit}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') pit() }}
    >
      <title>
        {grade === null
          ? t('organ.periphery.notModelledTitle')
          : t('organ.periphery.pittingTitle', { grade })}
      </title>

      <g
        className={`pil-swell${pitting ? ' pil-pitting' : ''}`}
        style={vars({ '--pil-swell': (s?.scale ?? 1).toFixed(3) })}
      >
        {/* V7's soft edge. On a light ground a blur filter reads as a rendering fault, so the
            same 0->3 px signal is drawn as a band of interstitial fluid outside the limb. */}
        {s && s.blurPx > 0.05 && (
          <g className="pil-interstitium" opacity={0.14 + 0.2 * (s.blurPx / 3)}>
            {SEGMENTS.map((seg, i) => (
              <path
                key={i}
                d={seg.d}
                fill="none"
                stroke={DRUGS.amlodipine.hue}
                strokeWidth={seg.w + s.blurPx * 3}
                strokeLinecap="round"
              />
            ))}
            <path d={D_FOOT} fill="none" stroke={DRUGS.amlodipine.hue} strokeWidth={s.blurPx * 3} strokeLinejoin="round" />
          </g>
        )}
        {SEGMENTS.map((seg, i) => (
          <path key={i} d={seg.d} fill="none" stroke={ORGAN.skin} strokeWidth={seg.w} strokeLinecap="round" />
        ))}
        <path d={D_FOOT} fill={ORGAN.skin} stroke="none" />
        {wash.opacity > 0.01 && (
          <g opacity={wash.opacity}>
            {SEGMENTS.map((seg, i) => (
              <path key={i} d={seg.d} fill="none" stroke={wash.colour} strokeWidth={seg.w} strokeLinecap="round" />
            ))}
            <path d={D_FOOT} fill={wash.colour} />
          </g>
        )}
        {/* malleolus, so the ankle reads as an ankle */}
        <ellipse cx={-6} cy={78} rx={3.2} ry={4.4} fill={ORGAN.skinShade} />
        {pitting && <ellipse cx={2} cy={58} rx={7} ry={4.6} fill={ORGAN.skinLine} opacity={0.7} />}
      </g>

      {labels && (
        <g transform={mirror ? 'scale(-1 1)' : undefined}>
          {/* The captions live outside the swelling group, so they do NOT scale with the
              limb — which is right, type must not grow — but it also means a fixed caption
              baseline is only clear of the foot at grade 0. The swell scales about the top
              of the limb, so the foot travels down by the full growth of the shape and, at
              grade 3, straight over the readouts. The first baseline is therefore derived
              from where the foot actually ends up. */}
          {captionLines(t, grade, amloOn, metoOn && cool > 0.3).map((l, i) => (
            <text
              key={l.text}
              x={2}
              y={labelTop(s) + i * CAPTION_PITCH}
              textAnchor="middle"
              className="pil-label-sub"
              fill={l.colour}
            >
              {l.text}
            </text>
          ))}
          {capP !== null && (
            /* Above the calf, not across it: the limb's own bounding box starts at −60. */
            <text x={2} y={-72} textAnchor="middle" className="pil-label-sub">
              {t('organ.periphery.capPressure', { value: (capP / 25).toFixed(2) })}
            </text>
          )}
        </g>
      )}
    </g>
  )
}

/**
 * A compact explanation block that appears next to the figure when oedema is present.
 * It states the mechanism, because the mechanism is the reason a clinician judge cares.
 */
export function EdemaExplainer({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const idx = sig(frame.periph?.interstitial_volume_index)
  const grade = sig(frame.periph?.edema_grade) ?? derivedEdemaGrade(idx)
  const amloOn = onBoard(frame.conc?.amlodipine, 'amlodipine')
  const raasOn =
    onBoard(frame.conc?.lisinopril, 'lisinopril') ||
    onBoard(frame.conc?.losartan, 'losartan') ||
    onBoard(frame.conc?.exp3174, 'exp3174')
  const hctzOn = onBoard(frame.conc?.hydrochlorothiazide, 'hydrochlorothiazide')

  if (!amloOn || grade === null || grade < 1) return null

  return (
    <div className="pil-explainer">
      <OrganLabelText>{t('organ.periphery.explainerHeading', { grade })}</OrganLabelText>
      <p>
        {t('organ.periphery.explainerLead')} <strong>{t('organ.periphery.explainerNot')}</strong>{' '}
        {t('organ.periphery.explainerTail')}
      </p>
      {hctzOn && !raasOn && (
        <p className="pil-negative-result">{t('organ.periphery.thiazideNegative')}</p>
      )}
      {raasOn && (
        <p className="pil-positive-result">{t('organ.periphery.raasPositive')}</p>
      )}
      <p className="pil-source">
        Label incidence: 1.8 / 3.0 / 10.8 % at 2.5 / 5 / 10 mg vs 0.6 % placebo; female 14.6 % vs
        male 5.6 %. FDA label, amlodipine besylate, retrieved 2026-08-17. The grade shown above is a
        presentational bridge, not a measurement.
      </p>
    </div>
  )
}

function OrganLabelText({ children }: { children: ReactNode }) {
  return <h4 className="pil-explainer-title">{children}</h4>
}
