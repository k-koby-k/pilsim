/**
 * LIVER — research/04-ORGAN-EFFECT-MAP.md §8. Three enzymes, three stories.
 *
 *   CYP2C9  losartan -> EXP3174        (a second, more potent molecule appears)
 *   CYP3A4  amlodipine (+ losartan minor)  (shared reactor — visible competition)
 *   CYP2D6  metoprolol                 (polymorphic — the personalisation animation)
 *
 * Lisinopril is drawn passing straight through untouched: "Lisinopril does not undergo
 * metabolism and is excreted unchanged entirely in the urine" (FDA label, Zestril).
 * HCTZ likewise passes through in this model.
 *
 * Liver expression is well sourced (CYP3A4 3367.1, CYP2C9 1607.6, CYP2D6 386.2 nTPM,
 * all liver-specific). Zone-3 predominance is NOT sourced — zonation here is decorative
 * and the tooltip says so. Tier T2, tissue level, no cell population named.
 *
 * DRAWING NOTES. The organ view is an anterior liver: large right lobe on the image left,
 * smaller left lobe crossing the midline, falciform ligament between them, gallbladder
 * under the inferior border. The reactor panel is a flow diagram, not an organ — portal
 * inflow on the left, hepatic outflow on the right, one lane per enzyme.
 */

import type { EffectFrame } from '../../types'
import { useT, type TFunction } from '../../i18n/useT'
import { clamp, cloud, DRUGS, norm, onBoard, ORGAN, sig, sigOr } from './channels'
import { OrganLabel, Stream } from './primitives'

/** §8.3 — the gate aperture the CYP2D6 reactor binds to. */
export const CYP2D6_GATE_BASE_PX = 26

/**
 * Caption lanes inside a reactor row, as offsets from the row's centre line.
 *
 * The gate's own two captions are centred on the gate, which stands beside the CYP2D6
 * reactor — so they land in the same horizontal span as that reactor's source caption and
 * the only thing keeping them apart is vertical distance. At the previous offsets that
 * distance was three units, which is less than the descender of the line above: the two
 * captions touched. The row now reserves a lane for each: source caption, then gate value,
 * then phenotype, each with a clear line between it and the next.
 */
const REACTOR_SOURCE_DY = 42
const GATE_VALUE_Y = 312
const GATE_PHENO_Y = 326

export interface LiverProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  labels?: boolean
}

const D_LIVER =
  'M 0 20 C 2 7 15 0 36 0 C 58 0 78 3 96 9 C 108 13 114 22 112 30 ' +
  'C 110 41 97 49 79 53 C 58 58 34 59 18 53 C 6 48 -1 34 0 20 Z'

/** Small liver view for the body figure. */
export function LiverOutline({ frame, x, y, scale = 1, labels = true }: LiverProps) {
  const t = useT()
  const flux =
    sigOr(frame.liver?.cyp3a4_flux, 0) + sigOr(frame.liver?.cyp2c9_flux, 0) + sigOr(frame.liver?.cyp2d6_flux, 0)
  const busy = norm(flux, 0, 12)
  const capFold = sig(frame.liver?.cyp2d6_capacity_fold)

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-liver">
      <title>{t('organ.liver.outlineTitle')}</title>

      <path d={D_LIVER} fill={ORGAN.liver} stroke="var(--pil-stroke, #6b5a52)" strokeWidth={1.5} />
      {/* falciform ligament — the landmark that makes a liver read as a liver */}
      <path d="M 74 2 C 72 14 72 26 74 36" fill="none" stroke={ORGAN.liverDeep} strokeWidth={2.2} strokeLinecap="round" />
      {/* inferior border shading */}
      <path
        d="M 8 38 C 26 50 62 54 96 42"
        fill="none"
        stroke={ORGAN.liverDeep}
        strokeOpacity={0.45}
        strokeWidth={1.6}
      />
      {/* gallbladder */}
      <path
        d="M 38 42 C 32 50 34 60 43 62 C 52 63 56 54 53 43 Z"
        fill={ORGAN.gallbladder}
        stroke="var(--pil-stroke, #6b5a52)"
        strokeWidth={1.1}
      />

      {/* Hepatic activity: metabolising lobules light up as discrete marks, which reads on a
          white ground where a halo does not. Count follows total modelled CYP flux. */}
      {busy > 0.02 && (
        <g className="pil-hepatic-activity" opacity={0.35 + 0.55 * busy}>
          {[
            [22, 20],
            [40, 14],
            [58, 22],
            [30, 36],
            [50, 38],
            [70, 30],
            [88, 22],
            [84, 38],
          ]
            .slice(0, Math.max(2, Math.round(2 + 6 * busy)))
            .map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.6} fill={ORGAN.hepatocyte} />
            ))}
        </g>
      )}

      {labels && (
        <text x={56} y={82} textAnchor="middle" className="pil-label-sub">
          {capFold === null ? t('organ.liver.gateNotModelled') : t('organ.liver.gateValue', { value: capFold.toFixed(2) })}
        </text>
      )}
    </g>
  )
}

/** The reactor plate's own drawing space, published so a camera can place it. */
export const LIVER_REACTORS_SIZE = { w: 700, h: 380 } as const

/** The three-reactor detail panel. */
export function LiverReactors({ frame }: { frame: EffectFrame }) {
  const t = useT()
  return (
    <svg
      className="pil-liver-panel"
      viewBox={`0 0 ${LIVER_REACTORS_SIZE.w} ${LIVER_REACTORS_SIZE.h}`}
      role="img"
      aria-label={t('organ.liver.reactorsAriaLabel')}
    >
      <title>{t('organ.liver.reactorsTitle')}</title>
      <LiverReactorsContent frame={frame} />
    </svg>
  )
}

/** The same drawing as a plain group, for placement inside a larger scene. */
export function LiverReactorsContent({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const l = frame.liver
  const capFold = sig(l?.cyp2d6_capacity_fold)
  const c2d6 = sig(l?.cyp2d6_flux)
  const c2c9 = sig(l?.cyp2c9_flux)
  const c3a4 = sig(l?.cyp3a4_flux)

  const losartanOn = onBoard(frame.conc?.losartan, 'losartan')
  const amlodipineOn = onBoard(frame.conc?.amlodipine, 'amlodipine')
  const metoprololOn = onBoard(frame.conc?.metoprolol, 'metoprolol')
  const lisinoprilOn = onBoard(frame.conc?.lisinopril, 'lisinopril')
  const hctzOn = onBoard(frame.conc?.hydrochlorothiazide, 'hydrochlorothiazide')

  // §8.3 aperture: clamp(cyp2d6_capacity_fold, 0.05, 2.0) x base
  const aperture = capFold === null ? null : clamp(capFold, 0.05, 2.0) * CYP2D6_GATE_BASE_PX
  const phenoLabel = capFold === null ? t('organ.liver.notModelled') : describeCapacity(t, capFold)

  const losParent = cloud('losartan', sig(frame.conc?.losartan))
  const exp = cloud('exp3174', sig(frame.conc?.exp3174))
  const amlo = cloud('amlodipine', sig(frame.conc?.amlodipine))
  const meto = cloud('metoprolol', sig(frame.conc?.metoprolol))

  // One lane per enzyme, left to right in the direction of flow. The panel is 700 units
  // wide like every other panel in the column, so a 12 px caption is the same size here as
  // it is on the nephron — a diagram that silently rescales its own type is unreadable.
  const dIn3a4 = 'M 70 66 L 290 66'
  const dOut3a4 = 'M 410 66 L 630 66'
  const dIn2c9 = 'M 70 156 L 290 156'
  const dOut2c9 = 'M 410 156 L 630 156'
  const dIn2d6 = 'M 70 246 L 290 246'
  const dOut2d6 = 'M 450 246 L 630 246'
  const dPass = 'M 70 340 L 630 340'

  return (
    <>
      {/* portal inflow / hepatic outflow rails */}
      <path d="M 56 34 L 56 352" stroke={ORGAN.vein} strokeWidth={9} strokeLinecap="round" />
      <path d="M 644 34 L 644 352" stroke={ORGAN.vein} strokeWidth={9} strokeLinecap="round" />
      <text x={56} y={22} textAnchor="middle" className="pil-label-sub">
        {t('organ.liver.portalVein')}
      </text>
      <text x={644} y={22} textAnchor="middle" className="pil-label-sub">
        {t('organ.liver.hepaticVein')}
      </text>

      {/* ---------------- CYP3A4 — shared reactor, visible competition ------------- */}
      <Reactor
        y={66}
        label="CYP3A4"
        sub={t('organ.liver.cyp3a4Sub')}
        flux={c3a4}
        hue={ORGAN.cyp3a4}
        title={t('organ.liver.cyp3a4Title')}
      />
      {amlodipineOn && amlo && (
        <>
          <Stream d={dIn3a4} count={Math.min(amlo.count, 10)} durationS={2.4} colour={DRUGS.amlodipine.hue} opacity={amlo.opacity} showTrack />
          <Stream d={dOut3a4} count={Math.min(Math.round(amlo.count * 0.5), 8)} durationS={3.0} colour={DRUGS.amlodipine.hue} opacity={amlo.opacity * 0.7} />
        </>
      )}
      {amlodipineOn && losartanOn && (
        <text x={350} y={26} textAnchor="middle" className="pil-warn-text pil-small">
          {t('organ.liver.sharedReactor')}
        </text>
      )}

      {/* ---------------- CYP2C9 — the signature conversion ------------------------ */}
      <Reactor
        y={156}
        label="CYP2C9"
        sub={t('organ.liver.cyp2c9Sub')}
        flux={c2c9}
        hue={DRUGS.losartan.hue}
        title={t('organ.liver.cyp2c9Title')}
      />
      {losartanOn && losParent && (
        <Stream d={dIn2c9} count={Math.min(losParent.count, 12)} durationS={1.8} colour={DRUGS.losartan.hue} opacity={losParent.opacity} showTrack />
      )}
      {exp && exp.count > 2 && (
        <Stream d={dOut2c9} count={Math.min(exp.count, 12)} durationS={2.6} colour={DRUGS.exp3174.hue} opacity={exp.opacity} r={3.1} />
      )}
      {losartanOn && (
        <text x={430} y={138} className="pil-label-sub" fill={DRUGS.exp3174.hue}>
          {t('organ.liver.exp3174MorePotent')}
        </text>
      )}

      {/* ---------------- CYP2D6 — the gate. The personalisation animation. -------- */}
      <Reactor
        y={246}
        label="CYP2D6"
        sub={t('organ.liver.cyp2d6Sub')}
        flux={c2d6}
        hue={DRUGS.metoprolol.hue}
        title={t('organ.liver.cyp2d6Title')}
      />
      {/* the gate itself, standing between the reactor and the hepatic vein */}
      <g className="pil-cyp2d6-gate">
        <title>{t('organ.liver.gateApertureTitle', { base: CYP2D6_GATE_BASE_PX, pheno: phenoLabel })}</title>
        <rect
          x={424}
          y={246 - CYP2D6_GATE_BASE_PX}
          width={18}
          height={CYP2D6_GATE_BASE_PX * 2}
          rx={4}
          fill={ORGAN.panel}
          stroke={ORGAN.panelLine}
          strokeWidth={1.6}
        />
        {aperture !== null && (
          <rect
            x={424}
            y={246 - aperture / 2}
            width={18}
            height={aperture}
            rx={4}
            fill={DRUGS.metoprolol.hue}
            fillOpacity={0.9}
          />
        )}
        <text x={433} y={GATE_VALUE_Y} textAnchor="middle" className="pil-label-sub">
          {t('organ.liver.gateShort', { value: capFold === null ? '—' : `${capFold.toFixed(2)}×` })}
        </text>
        <text x={433} y={GATE_PHENO_Y} textAnchor="middle" className="pil-label-sub pil-emph">
          {phenoLabel}
        </text>
      </g>
      {metoprololOn && meto && (
        <>
          <Stream d={dIn2d6} count={Math.min(meto.count, 14)} durationS={1.6} colour={DRUGS.metoprolol.hue} opacity={meto.opacity} showTrack />
          <Stream
            d={dOut2d6}
            count={Math.max(1, Math.round(Math.min(meto.count, 14) * clamp(sigOr(capFold, 1) / 1.6, 0.05, 1)))}
            durationS={2.6}
            colour={DRUGS.metoprolol.hue}
            opacity={meto.opacity * 0.6}
          />
        </>
      )}

      {/* ---------------- passthrough: lisinopril and HCTZ ------------------------- */}
      <path d={dPass} stroke={ORGAN.panelLine} strokeWidth={2.4} strokeDasharray="5 6" fill="none" />
      <text x={350} y={362} textAnchor="middle" className="pil-label-sub">
        {t('organ.liver.passthrough')}
      </text>
      {lisinoprilOn && <Stream d={dPass} count={8} durationS={2.2} colour={DRUGS.lisinopril.hue} r={2.4} />}
      {hctzOn && <Stream d={dPass} count={8} durationS={2.6} colour={DRUGS.hydrochlorothiazide.hue} r={2.4} />}
    </>
  )
}

function Reactor({
  y,
  label,
  sub,
  flux,
  hue,
  title,
}: {
  y: number
  label: string
  sub: string
  flux: number | null
  hue: string
  title: string
}) {
  const t = useT()
  const g = flux === null ? null : norm(flux, 0, 8)
  return (
    <g className={flux === null ? 'pil-unmodelled' : undefined}>
      <title>{title}</title>
      <rect
        x={290}
        y={y - 28}
        width={120}
        height={56}
        rx={12}
        fill={ORGAN.reactor}
        stroke={hue}
        strokeWidth={g === null ? 1.4 : 1.4 + 2.2 * g}
      />
      {/* working fraction: a filled base whose height is the modelled flux */}
      {g !== null && g > 0.01 && (
        <rect x={290} y={y + 28 - 56 * g} width={120} height={56 * g} rx={12} fill={hue} fillOpacity={0.14} />
      )}
      <text x={350} y={y - 3} textAnchor="middle" className="pil-reactor-label">
        {label}
      </text>
      <text x={350} y={y + 15} textAnchor="middle" className="pil-label-sub">
        {flux === null ? t('organ.liver.fluxNotModelled') : t('organ.liver.fluxValue', { value: flux.toFixed(2) })}
      </text>
      <text x={350} y={y + REACTOR_SOURCE_DY} textAnchor="middle" className="pil-label-sub">
        {sub}
      </text>
    </g>
  )
}

/**
 * §8.3 maps genotype to the capacity fold. These four values are ESTIMATED and ordinal;
 * Agent D's patient_model.json carries the authoritative CPIC activity scores.
 * Here we only describe the fold the engine actually sent.
 */
function describeCapacity(t: TFunction, fold: number): string {
  if (fold >= 1.4) return t('organ.liver.ultrarapid')
  if (fold >= 0.8) return t('organ.liver.normal')
  if (fold >= 0.4) return t('organ.liver.intermediate')
  return t('organ.liver.poor')
}
