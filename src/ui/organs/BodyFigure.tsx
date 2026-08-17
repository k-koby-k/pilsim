/**
 * The whole-body figure: a calm, recognisable adult human with the organs drawn in place
 * and every readout carried out to the margin on a leader line, the way an anatomical
 * plate does it. The silhouette itself is T4 — visual continuity only, no physiological
 * claim; every organ inside it binds to the effect bus through its own module.
 *
 * CONSTRUCTION. The body is drawn twice. The first pass strokes every part in the outline
 * colour; the second pass fills the same parts with no stroke. Because the fills are all
 * painted after all the strokes, any stroke lying inside another part is covered, and only
 * the true outer boundary of the union survives. That gives one continuous contour around
 * head, torso and legs without seams where the parts meet, which is what separates a
 * figure that reads as a body from one that reads as a pile of shapes.
 *
 * PROPORTION. Seven and a half heads tall, shoulders a little under a quarter of the
 * height, a real waist, and a few millimetres of daylight between the arms and the ribs —
 * without that gap the outline closes up and the figure stops being a person.
 *
 * Body centre line is x = 300; the margins either side are the label columns.
 */

import type { ReactNode } from 'react'
import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { Adrenal } from './Adrenal'
import { Heart } from './Heart'
import { KidneyOutline } from './Kidney'
import { LiverOutline } from './Liver'
import { Lungs } from './Lungs'
import { Ankle, derivedEdemaGrade } from './Periphery'
import { Conduit } from './Vessels'
import { layoutLane, LINE_PITCH, TITLE_LEAD, TYPE } from './primitives'
import { DRUGS, onBoard, ORGAN, sig, vars } from './channels'

export interface BodyFigureProps {
  frame: EffectFrame
  /** Cough events jolt the torso — set by the badge layer. */
  coughing?: boolean
  /** Hard gate: a contraindicated combination greys the figure out and stops the animation. */
  disqualified?: boolean
  /** Pregnancy + a RAAS drug draws a barrier over the uterus region. */
  pregnancyBarrier?: boolean
}

// ---------------------------------------------------------------------------
// Silhouette geometry
// ---------------------------------------------------------------------------

const D_HEAD = 'M 300 30 C 318 30 332 49 332 74 C 332 99 318 118 300 118 C 282 118 268 99 268 74 C 268 49 282 30 300 30 Z'
const D_NECK = 'M 286 100 L 314 100 L 316 144 L 284 144 Z'

const D_TORSO =
  'M 300 108 C 326 110 342 121 353 134 C 366 144 374 156 374 174 ' +
  'C 374 196 368 214 364 236 C 360 262 348 280 348 300 ' +
  'C 350 322 356 340 358 360 C 358 372 352 380 342 380 ' +
  'L 258 380 C 248 380 242 372 242 360 ' +
  'C 244 340 250 322 252 300 C 252 280 240 262 236 236 ' +
  'C 232 214 226 196 226 174 C 226 156 234 144 247 134 ' +
  'C 258 121 274 110 300 108 Z'

interface Limb {
  d: string
  w: number
}

/** Arms hang just clear of the ribs; legs meet at the top of the thigh and taper down. */
const LIMBS: Limb[] = [
  // left arm: deltoid, upper arm, elbow, forearm, hand
  { d: 'M 242 168 L 232 214', w: 31 },
  { d: 'M 232 214 L 220 264', w: 27 },
  { d: 'M 220 264 L 212 312', w: 23 },
  { d: 'M 212 312 L 206 352', w: 21 },
  { d: 'M 206 352 L 204 390', w: 20 },
  // right arm
  { d: 'M 358 168 L 368 214', w: 31 },
  { d: 'M 368 214 L 380 264', w: 27 },
  { d: 'M 380 264 L 388 312', w: 23 },
  { d: 'M 388 312 L 394 352', w: 21 },
  { d: 'M 394 352 L 396 390', w: 20 },
  // left leg: upper thigh, lower thigh, knee, calf belly, shin, ankle
  { d: 'M 272 354 L 269 436', w: 52 },
  { d: 'M 269 436 L 266 508', w: 42 },
  { d: 'M 266 508 L 267 534', w: 34 },
  { d: 'M 267 534 L 269 578', w: 36 },
  { d: 'M 269 578 L 271 638', w: 27 },
  { d: 'M 271 638 L 272 664', w: 22 },
  // right leg
  { d: 'M 328 354 L 331 436', w: 52 },
  { d: 'M 331 436 L 334 508', w: 42 },
  { d: 'M 334 508 L 333 534', w: 34 },
  { d: 'M 333 534 L 331 578', w: 36 },
  { d: 'M 331 578 L 329 638', w: 27 },
  { d: 'M 329 638 L 328 664', w: 22 },
]

const D_FOOT_L = 'M 260 652 C 254 672 252 688 260 694 C 270 700 290 698 294 690 C 298 680 290 666 286 652 Z'
const D_FOOT_R = 'M 340 652 C 346 672 348 688 340 694 C 330 700 310 698 306 690 C 302 680 310 666 314 652 Z'

const CLOSED_PARTS = [D_HEAD, D_NECK, D_TORSO, D_FOOT_L, D_FOOT_R]

const OUTLINE_W = 1.6

/** One pass over every body part. `mode` decides whether it strokes or fills. */
function BodyParts({ mode }: { mode: 'outline' | 'fill' }) {
  const outline = mode === 'outline'
  return (
    <g>
      {CLOSED_PARTS.map((d, i) => (
        <path
          key={`c${i}`}
          d={d}
          fill={outline ? ORGAN.skinLine : ORGAN.skin}
          stroke={outline ? ORGAN.skinLine : 'none'}
          strokeWidth={outline ? OUTLINE_W * 2 : 0}
          strokeLinejoin="round"
        />
      ))}
      {LIMBS.map((l, i) => (
        <path
          key={`l${i}`}
          d={l.d}
          fill="none"
          stroke={outline ? ORGAN.skinLine : ORGAN.skin}
          strokeWidth={outline ? l.w + OUTLINE_W * 2 : l.w}
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

/**
 * The silhouette on its own: outline pass, fill pass, interior modelling, face.
 *
 * Exported because the static "what does this substance touch" view draws the same body
 * and must not carry a second, slightly different copy of it — one body, one file. It is
 * T4 throughout: visual continuity only, no physiological claim, no bus binding.
 */
export function BodySilhouette() {
  return (
    <g className="pil-silhouette">
      <BodyParts mode="outline" />
      <BodyParts mode="fill" />
      {/* soft interior modelling — clavicles and the midline of the abdomen */}
      <g className="pil-body-detail" fill="none" stroke={ORGAN.skinShade} strokeWidth={2} strokeLinecap="round">
        <path d="M 248 154 C 264 146 280 144 292 148" />
        <path d="M 352 154 C 336 146 320 144 308 148" />
        <path d="M 300 306 L 300 362" />
      </g>
      {/* face — three quiet marks. A figure with no face reads as a corpse. */}
      <g className="pil-face">
        <ellipse cx={288} cy={68} rx={2.4} ry={3} fill={ORGAN.skinLine} />
        <ellipse cx={312} cy={68} rx={2.4} ry={3} fill={ORGAN.skinLine} />
        <path d="M 292 94 L 308 94" fill="none" stroke={ORGAN.skinLine} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  )
}

/**
 * The figure's own drawing space. The scene camera pans across a larger world that
 * contains this box, so it is published rather than measured by eye at the call site.
 */
export const BODY_SIZE = { w: 600, h: 720 } as const

/** Is the figure unsteady on its feet this frame? One rule, read by figure and scene alike. */
export function isUnsteady(frame: EffectFrame): boolean {
  return (sig(frame.hazards?.dizziness_orthostatic) ?? 0) >= 0.35
}

export function BodyFigure({
  frame,
  coughing = false,
  disqualified = false,
  pregnancyBarrier = false,
}: BodyFigureProps) {
  const t = useT()
  const unsteady = isUnsteady(frame)

  return (
    <svg
      className="pil-body"
      viewBox={`0 0 ${BODY_SIZE.w} ${BODY_SIZE.h}`}
      role="img"
      aria-label={t('organ.bodyFigure.ariaLabel')}
      style={vars({ '--pil-tilt': unsteady ? '1deg' : '0deg' })}
    >
      <title>{t('organ.bodyFigure.titleFull')}</title>
      <BodyInterior
        frame={frame}
        coughing={coughing}
        disqualified={disqualified}
        pregnancyBarrier={pregnancyBarrier}
      />
      <Annotations frame={frame} unsteady={unsteady} />
    </svg>
  )
}

/**
 * The body and its organs as a plain group, in the same 600 x 720 space, with no margin
 * annotations. The scene camera draws this directly so that zooming in on an organ is the
 * same body seen closer rather than a second, slightly different drawing of it.
 */
export function BodyInterior({
  frame,
  coughing = false,
  disqualified = false,
  pregnancyBarrier = false,
}: BodyFigureProps) {
  const t = useT()
  const unsteady = isUnsteady(frame)
  const metoOn = onBoard(frame.conc?.metoprolol, 'metoprolol')

  return (
    <g className={`pil-body-interior${disqualified ? ' pil-body-disqualified' : ''}`}>
      <g className={`pil-figure${coughing ? ' pil-cough-jolt' : ''}${unsteady ? ' pil-tilt' : ''}`}>
        {/* ---- silhouette (T4, visual continuity only) ---- */}
        <BodySilhouette />

        {/* ---- thoracic and abdominal organs, back to front ---- */}
        <Lungs frame={frame} x={300} y={150} scale={1.1} labels={false} />
        <Conduit frame={frame} x={302} y={244} scale={0.6} />
        <LiverOutline frame={frame} x={250} y={256} scale={0.72} labels={false} />
        <Adrenal frame={frame} x={332} y={290} scale={0.55} labels={false} streamPath="M 0 14 C -30 70 -54 130 -62 196" />
        <KidneyOutline frame={frame} x={268} y={300} scale={0.62} labels={false} />
        <KidneyOutline frame={frame} x={332} y={300} scale={0.62} mirror labels={false} />
        <Heart frame={frame} x={308} y={226} scale={0.58} labels={false} />

        {/* ---- pregnancy hard gate ---- */}
        {pregnancyBarrier && (
          <g className="pil-preg-barrier">
            <title>{t('organ.bodyFigure.pregnancyBarrierTitle')}</title>
            <rect x={268} y={320} width={64} height={52} rx={12} fill={ORGAN.bad} fillOpacity={0.12} stroke={ORGAN.bad} strokeWidth={2} />
            <path d="M 276 328 L 324 364 M 324 328 L 276 364" stroke={ORGAN.bad} strokeWidth={2.6} strokeLinecap="round" />
          </g>
        )}

        {/* ---- dependent limbs: the oedema site ---- */}
        <Ankle frame={frame} x={268} y={576} labels={false} />
        <Ankle frame={frame} x={332} y={576} mirror labels={false} />

        {/* ---- metoprolol cold-extremity marker on the hands ---- */}
        {metoOn && (
          <g className="pil-cold-hands">
            <title>{t('organ.bodyFigure.coldExtremitiesTitle')}</title>
            <circle cx={204} cy={390} r={9} fill={DRUGS.lisinopril.hue} opacity={0.22} />
            <circle cx={396} cy={390} r={9} fill={DRUGS.lisinopril.hue} opacity={0.22} />
          </g>
        )}

        {/* ---- cough puff at the mouth ---- */}
        {coughing && (
          <g className="pil-cough-puff">
            <circle cx={326} cy={90} r={4} />
            <circle cx={340} cy={84} r={6} />
            <circle cx={356} cy={77} r={8} />
          </g>
        )}
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Margin annotation. Every number the organ modules used to print on top of
// themselves now lives out here, at a size that survives a projector.
//
// GEOMETRY RULE. A callout's height depends on how many of its lines are live, and that
// changes with the frame: the heart grows a "bradycardic" line below 50 bpm, the lungs
// grow a β2 line on a beta blocker, the limbs grow an oedema line at grade 1. Placing the
// next callout at a coordinate that happens to clear the one above it at rest is therefore
// not a layout, it is a coincidence. Instead every column is laid out through layoutLane():
// each callout states a preferred baseline and its own line count, and the lane pushes it
// down where the block above has grown into it. Nothing can collide, whatever the frame.
//
// LEADER RULE. Within a column the callouts are declared in the order their leaders meet
// the body, top to bottom, and the lane preserves that order. Two leaders can only cross
// if one column entry's anchor sits above the previous one's, so keeping both sequences
// monotonic is what keeps the leaders untangled.
// ---------------------------------------------------------------------------

/** Inner edge of each margin column. Text is anchored here and grows outward. */
const LEFT_X = 178
const RIGHT_X = 422
/** Distance the leader's elbow stands off the text edge, so the line never touches type. */
const ELBOW = 10

interface CalloutSpec {
  /** Preferred baseline for the heading. The lane may push it down, never up. */
  y: number
  /** Where the leader lands on the body. Must increase down the column. */
  to: [number, number]
  title: string
  lines: Array<{ text: string; colour?: string } | null>
  hint?: string
}

function Callout({
  side,
  y,
  to,
  title,
  lines,
  hint,
}: CalloutSpec & { side: 'left' | 'right' }) {
  const anchor = side === 'left' ? 'end' : 'start'
  const x = side === 'left' ? LEFT_X : RIGHT_X
  const elbow = side === 'left' ? x + ELBOW : x - ELBOW

  return (
    <g className="pil-callout">
      {hint && <title>{hint}</title>}
      <path className="pil-leader" d={`M ${elbow} ${y - 4} L ${to[0]} ${to[1]}`} />
      <circle className="pil-leader-dot" cx={to[0]} cy={to[1]} r={2.4} />
      <text x={x} y={y} textAnchor={anchor} className="pil-callout-title">
        {title}
      </text>
      {lines.map((l, i) =>
        l ? (
          <text
            key={i}
            x={x}
            y={y + TITLE_LEAD + i * LINE_PITCH}
            textAnchor={anchor}
            className="pil-callout-line"
            fill={l.colour}
          >
            {l.text}
          </text>
        ) : null,
      )}
    </g>
  )
}

/** Drop the lines the frame did not produce, then lay the column out so nothing touches. */
function CalloutColumn({ side, items }: { side: 'left' | 'right'; items: CalloutSpec[] }) {
  const packed = items.map((it) => ({
    ...it,
    lines: it.lines.filter(Boolean) as Array<{ text: string; colour?: string }>,
  }))
  const ys = layoutLane(
    packed.map((it) => ({ y: it.y, lines: it.lines.length, size: TYPE.calloutTitle, lineSize: TYPE.calloutLine })),
  )
  return (
    <>
      {packed.map((it, i) => (
        <Callout key={it.title} {...it} side={side} y={ys[i] ?? it.y} />
      ))}
    </>
  )
}

/**
 * The margin callout columns. Exported as `BodyAnnotations` so the overview scene draws
 * the same readouts in the same lanes rather than a second set that could disagree.
 */
export function Annotations({ frame, unsteady }: { frame: EffectFrame; unsteady: boolean }): ReactNode {
  const t = useT()
  const hr = sig(frame.haemo?.hr)
  const co = sig(frame.haemo?.cardiac_output)
  const svr = sig(frame.haemo?.svr)
  const sbp = sig(frame.haemo?.sbp)
  const dbp = sig(frame.haemo?.dbp)
  const gfr = sig(frame.renal?.gfr)
  const urine = sig(frame.renal?.urine_flow)
  const fev1 = sig(frame.lung?.fev1_pct_baseline)
  const capFold = sig(frame.liver?.cyp2d6_capacity_fold)
  const aldoFold = sig(frame.mediators?.aldosterone_fold)
  const idx = sig(frame.periph?.interstitial_volume_index)
  const grade = sig(frame.periph?.edema_grade) ?? derivedEdemaGrade(idx)
  const beta2 = sig(frame.engagement?.beta2_occupancy)

  const lisOn = onBoard(frame.conc?.lisinopril, 'lisinopril')
  const losOn = onBoard(frame.conc?.losartan, 'losartan') || onBoard(frame.conc?.exp3174, 'exp3174')
  const amloOn = onBoard(frame.conc?.amlodipine, 'amlodipine')
  const metoOn = onBoard(frame.conc?.metoprolol, 'metoprolol')
  const bradycardic = hr !== null && hr < 50

  // Left column, declared top to bottom — and so are the points their leaders land on.
  const left: CalloutSpec[] = [
    {
      y: 182,
      to: [250, 192],
      title: t('organ.bodyFigure.lungsTitle'),
      hint: t('organ.bodyFigure.lungsHint'),
      lines: [
        {
          text:
            fev1 === null
              ? t('organ.bodyFigure.fev1NotModelled')
              : t('organ.lungs.fev1Value', { value: fev1.toFixed(0) }),
        },
        metoOn && beta2 !== null
          ? { text: t('organ.bodyFigure.beta2Airway', { value: Math.round(beta2 * 100) }), colour: DRUGS.metoprolol.hue }
          : null,
        losOn && !lisOn ? { text: t('organ.bodyFigure.noCoughChannel'), colour: DRUGS.losartan.hue } : null,
      ],
    },
    {
      y: 278,
      to: [262, 268],
      title: t('organ.bodyFigure.liverTitle'),
      hint: t('organ.bodyFigure.liverHint'),
      lines: [
        {
          text:
            capFold === null
              ? t('organ.bodyFigure.gateNotModelled')
              : t('organ.bodyFigure.cyp2d6GateNormal', { value: capFold.toFixed(2) }),
        },
      ],
    },
    {
      y: 352,
      to: [256, 320],
      title: t('organ.bodyFigure.kidneysTitle'),
      hint: t('organ.bodyFigure.kidneysHint'),
      lines: [
        { text: gfr === null ? t('organ.bodyFigure.egfrNotModelled') : `eGFR ${Math.round(gfr)} mL/min/1.73m²` },
        { text: urine === null ? t('organ.bodyFigure.urineNotModelled') : t('organ.bodyFigure.urineValue', { value: Math.round(urine) }) },
      ],
    },
    {
      y: 610,
      to: [254, 622],
      title: t('organ.bodyFigure.limbsTitle'),
      hint: t('organ.bodyFigure.limbsHint'),
      lines: [
        { text: grade === null ? t('organ.bodyFigure.oedemaNotModelled') : t('organ.bodyFigure.pitting', { grade }) },
        amloOn && grade !== null && grade >= 1
          ? { text: t('organ.bodyFigure.dependentOedema'), colour: DRUGS.amlodipine.hue }
          : null,
      ],
    },
  ]

  // Right column. The adrenal sits ABOVE the point where the conduit leader meets the
  // aorta, so it is declared first — the previous order sent the two leaders across each
  // other just left of the right flank, which is the tangle this ordering removes.
  const right: CalloutSpec[] = [
    ...(unsteady
      ? [
          {
            y: 96,
            to: [336, 86] as [number, number],
            title: t('organ.bodyFigure.dizzinessTitle'),
            hint: t('organ.bodyFigure.dizzinessHint'),
            lines: [{ text: t('organ.bodyFigure.standingToleranceDown'), colour: ORGAN.warn }],
          },
        ]
      : []),
    {
      y: 204,
      to: [334, 222],
      title: t('organ.bodyFigure.heartTitle'),
      hint: t('organ.bodyFigure.heartHint'),
      lines: [
        {
          text: hr === null ? t('organ.bodyFigure.hrNotModelled') : `${Math.round(hr)} bpm`,
          colour: bradycardic ? ORGAN.warn : undefined,
        },
        bradycardic ? { text: t('organ.bodyFigure.bradycardicLt50'), colour: ORGAN.warn } : null,
        { text: co === null ? t('organ.bodyFigure.coNotModelled') : `CO ${co.toFixed(1)} L/min` },
      ],
    },
    {
      y: 300,
      to: [340, 292],
      title: t('organ.bodyFigure.adrenalTitle'),
      hint: t('organ.bodyFigure.adrenalHint'),
      lines: [
        {
          text:
            aldoFold === null
              ? t('organ.bodyFigure.aldosteroneNotModelled')
              : t('organ.bodyFigure.aldosteroneValue', { value: aldoFold.toFixed(2) }),
        },
      ],
    },
    {
      y: 372,
      // Low on the aorta, just above the bifurcation: high enough up the vessel and the
      // leader clips the lower pole of the right kidney on its way in.
      to: [302, 348],
      title: t('organ.bodyFigure.conduitTitle'),
      hint: t('organ.bodyFigure.conduitHint'),
      lines: [
        {
          text:
            sbp === null || dbp === null
              ? t('organ.bodyFigure.bpNotModelled')
              : `${Math.round(sbp)} / ${Math.round(dbp)} mmHg`,
        },
        { text: svr === null ? t('organ.bodyFigure.svrNotModelled') : `SVR ${Math.round(svr)} dyn·s·cm⁻⁵` },
      ],
    },
  ]

  return (
    <g className="pil-annotations">
      <CalloutColumn side="left" items={left} />
      <CalloutColumn side="right" items={right} />
    </g>
  )
}
