/**
 * SCENE PLATES — the readable detail each scene closes in on.
 *
 * A plate is a group drawn in world coordinates beside the body, holding the diagram the
 * scene exists to show. Every plate obeys the same three rules as the rest of the figure:
 *
 *   1. Nothing here computes physiology. A plate reads named EffectFrame fields through
 *      the same helpers the organ modules use and draws them; it never derives a new
 *      clinical quantity, and it never substitutes zero for a field the engine did not send.
 *   2. PROXY-tier fields go through formatSignal(), which refuses to print a unit beside an
 *      uncalibrated index. Intraglomerular pressure, capillary hydrostatic pressure and the
 *      interstitial volume index are all shown as a relative index and nothing else.
 *   3. Every stack of captions is laid out by layoutLane() from a declared line count, so a
 *      block that grows a line pushes the block below it down instead of printing over it.
 *      There is no baseline in this file that is a coincidence.
 *
 * Motion is signal. Where a segment of a plate has no bus field behind it — the route from
 * the mouth to the gut is the honest example, because this build models plasma
 * concentration and not gut transit — it is drawn as a dashed static route and labelled as
 * one. Showing an animated tablet sliding down an unmodelled oesophagus would be the
 * prettiest lie in the product.
 */

import type { ReactNode } from 'react'
import type { DrugId, EffectFrame } from '../../types'
import { useT, type TFunction } from '../../i18n/useT'
import { RaasCascadeContent } from './Adrenal'
import { Ankle, derivedEdemaGrade } from './Periphery'
import { Heart } from './Heart'
import { LiverReactorsContent } from './Liver'
import { Lungs } from './Lungs'
import { NephronContent } from './Kidney'
import { ResistanceUnit } from './Vessels'
import {
  BADGES,
  clamp,
  cloud,
  DRUGS,
  DRUG_ORDER,
  dropsPerS,
  FALLBACK_REF,
  formatSignal,
  latchBadges,
  METOPROLOL_BETA2_CROSSOVER_NG_ML,
  onBoard,
  ORGAN,
  sig,
  type RefRanges,
} from './channels'
import { layoutLane, LINE_PITCH, Stream, TITLE_LEAD } from './primitives'

// ---------------------------------------------------------------------------
// Type metrics used by the plates. Mirrored from the rules in scenes.css, and fed to
// layoutLane() so that reserved space is computed from the size the type is actually set in.
// ---------------------------------------------------------------------------

export const PLATE_TYPE = {
  title: 17,
  sub: 12,
  blockTitle: 13,
  line: 11.5,
} as const

/** Vertical room a plate reserves above its content for its own heading. */
export const PLATE_HEAD = 48

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// Small shared drawing helpers
// ---------------------------------------------------------------------------

/**
 * A stack of value blocks down one column. Each block declares its own lines, and the
 * lane pushes the next one clear — the same guarantee the body figure's margin uses.
 */
export interface Block {
  title: string
  lines: Array<{ text: string; colour?: string; muted?: boolean } | null>
  hint?: string
}

export function BlockColumn({
  x,
  y,
  blocks,
  anchor = 'start',
}: {
  x: number
  y: number
  blocks: Block[]
  anchor?: 'start' | 'middle' | 'end'
}) {
  const packed = blocks.map((b) => ({
    ...b,
    lines: b.lines.filter(Boolean) as Array<{ text: string; colour?: string; muted?: boolean }>,
  }))
  const ys = layoutLane(
    packed.map((b) => ({ y, lines: b.lines.length, size: PLATE_TYPE.blockTitle, lineSize: PLATE_TYPE.line })),
  )
  return (
    <>
      {packed.map((b, i) => {
        const by = ys[i] ?? y
        return (
          <g key={b.title} className="pil-plate-block">
            {b.hint && <title>{b.hint}</title>}
            <text x={x} y={by} textAnchor={anchor} className="pil-plate-block-title">
              {b.title}
            </text>
            {b.lines.map((l, j) => (
              <text
                key={j}
                x={x}
                y={by + TITLE_LEAD + j * LINE_PITCH}
                textAnchor={anchor}
                className={`pil-plate-line${l.muted ? ' is-muted' : ''}`}
                fill={l.colour}
              >
                {l.text}
              </text>
            ))}
          </g>
        )
      })}
    </>
  )
}

/**
 * A trajectory. `history` is the frames emitted so far this run, so the shape of the line
 * is the run itself — a rise to peak and a decay is a dose curve, and a step down that
 * holds is an acute effect that has reached its plateau.
 *
 * The trace carries NO axis numbers. Its vertical extent is the range the series actually
 * covered, which is a different scale on every run; printing tick values there would invite
 * the reader to compare two runs on axes that are not the same. The current value is
 * printed as a number, in its own units, beside it.
 */
export function Trace({
  x,
  y,
  w,
  h,
  values,
  colour,
  label,
}: {
  x: number
  y: number
  w: number
  h: number
  values: Array<number | null>
  colour: string
  label?: string
}) {
  const t = useT()
  const pts = values.filter((v): v is number => v !== null)
  if (pts.length < 3) {
    return (
      <g className="pil-trace is-empty">
        <rect x={x} y={y} width={w} height={h} rx={6} className="pil-trace-well" />
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" className="pil-plate-line is-muted">
          {t('organ.plate.traceBuilds')}
        </text>
      </g>
    )
  }
  let lo = Math.min(...pts)
  let hi = Math.max(...pts)
  if (hi - lo < 1e-9) {
    // A flat series is a real result — it must read as flat, centred, not as a full-scale line.
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.12
  lo -= pad
  hi += pad

  const n = values.length
  const px = (i: number) => x + (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const py = (v: number) => y + h - ((v - lo) / (hi - lo)) * h

  let d = ''
  let started = false
  values.forEach((v, i) => {
    if (v === null) {
      started = false
      return
    }
    d += `${started ? ' L' : ' M'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`
    started = true
  })

  // Explicit accumulator type: without it TS widens `acc` to the array's own
  // `number | null` element type and every downstream index/arithmetic use fails.
  const lastIdx = values.reduce<number>((acc, v, i) => (v === null ? acc : i), -1)
  const last = lastIdx >= 0 ? values[lastIdx] : null

  return (
    <g className="pil-trace">
      <rect x={x} y={y} width={w} height={h} rx={6} className="pil-trace-well" />
      <path d={d.trim()} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last !== null && lastIdx >= 0 && <circle cx={px(lastIdx)} cy={py(last)} r={3.2} fill={colour} />}
      {label && (
        <text x={x} y={y - 5} className="pil-plate-line is-muted">
          {label}
        </text>
      )}
    </g>
  )
}

/**
 * Wrap a sentence to a character budget. Crude by design: the budget is the box the type
 * is ALLOWED, not a measurement of the glyphs, so a long word eats slack reserved for it —
 * the same convention the type metrics in primitives.tsx use.
 */
export function wrapText(s: string, maxChars: number): string[] {
  const words = s.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur.length === 0) cur = w
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/** The plate's card and heading. Content is drawn from (0, PLATE_HEAD) downward. */
export function PlateCard({
  rect,
  title,
  sub,
  children,
}: {
  rect: Rect
  title: string
  sub?: string
  children: ReactNode
}) {
  return (
    <g transform={`translate(${rect.x} ${rect.y})`} className="pil-plate">
      <rect
        className="pil-plate-card"
        x={-18}
        y={-18}
        width={rect.w + 36}
        height={rect.h + 36}
        rx={18}
      />
      <text x={0} y={20} className="pil-plate-title">
        {title}
      </text>
      {sub && (
        <text x={0} y={38} className="pil-plate-sub">
          {sub}
        </text>
      )}
      {children}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Facts about how each drug leaves the body. Every line restates something already
// stated in the organ modules — Liver.tsx §8 for the metabolic routes, and the FDA
// label quote for lisinopril. Nothing new is asserted here.
// ---------------------------------------------------------------------------

interface ClearanceFact {
  /** Does it have a first-pass step in this model at all? */
  firstPass: 'losartan' | 'amlodipine' | 'metoprolol' | null
  /** Cleared unchanged by the kidney, rather than metabolised in the liver first. Drives
   * JourneyRoute's renal branch — kept as a plain flag so the branch survives translation
   * of the display `route` string below. */
  kidneyCleared: boolean
  route: string
  note: string
}

function clearanceFacts(t: TFunction): Record<DrugId, ClearanceFact> {
  return {
    lisinopril: {
      firstPass: null,
      kidneyCleared: true,
      route: t('organ.journeyPlate.routeKidneyUnchanged'),
      note: t('organ.journeyPlate.noteLisinopril'),
    },
    losartan: {
      firstPass: 'losartan',
      kidneyCleared: false,
      route: t('organ.journeyPlate.routeLiverCyp2c9'),
      note: t('organ.journeyPlate.noteLosartan'),
    },
    exp3174: {
      firstPass: null,
      kidneyCleared: false,
      route: t('organ.journeyPlate.routeMadeInLiver'),
      note: t('organ.journeyPlate.noteExp3174'),
    },
    amlodipine: {
      firstPass: 'amlodipine',
      kidneyCleared: false,
      route: t('organ.journeyPlate.routeLiverCyp3a4'),
      note: t('organ.journeyPlate.noteAmlodipine'),
    },
    hydrochlorothiazide: {
      firstPass: null,
      kidneyCleared: true,
      route: t('organ.journeyPlate.routeKidneyUnchanged'),
      note: t('organ.journeyPlate.noteHctz'),
    },
    metoprolol: {
      firstPass: 'metoprolol',
      kidneyCleared: false,
      route: t('organ.journeyPlate.routeLiverCyp2d6'),
      note: t('organ.journeyPlate.noteMetoprolol'),
    },
  }
}

export function onBoardDrugs(frame: EffectFrame): DrugId[] {
  return DRUG_ORDER.filter((d) => onBoard(frame.conc?.[d], d))
}

// ---------------------------------------------------------------------------
// JOURNEY — the route drawn on the body
// ---------------------------------------------------------------------------

/** Mouth to gut, and gut to the portal vein: route only, and labelled as route only. */
const D_SWALLOW = 'M 302 100 C 306 152 302 220 298 268 C 296 300 292 316 288 330'
const D_PORTAL = 'M 288 330 C 276 318 266 300 260 282'
/** Liver out to the right heart, then down the aorta — the circulating pool. */
const D_SYSTEMIC = 'M 262 262 C 278 250 294 242 304 234 C 306 272 304 312 302 352'
const D_RENAL_L = 'M 302 300 C 292 302 284 304 280 306'
const D_RENAL_R = 'M 302 300 C 312 302 320 304 324 306'
const D_URINE = 'M 278 332 C 284 360 292 396 296 432'

/**
 * The route a dose travels, laid over the body. Segments with a bus field behind them
 * carry sprites at the modelled density; segments without one are dashed and static, and
 * say so. That distinction is the point of the scene as much as the anatomy is.
 */
export function JourneyRoute({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const on = onBoardDrugs(frame)
  const urine = sig(frame.renal?.urine_flow)
  const drops = urine === null ? null : dropsPerS(urine)
  const clearance = clearanceFacts(t)
  const renal = on.filter((d) => clearance[d].kidneyCleared)

  return (
    <g className="pil-journey-route">
      <title>{t('organ.journeyPlate.routeTitle')}</title>

      {/* --- unmodelled route: drawn, named, and deliberately still --- */}
      <g className="pil-route-static">
        <path d={D_SWALLOW} />
        <path d={D_PORTAL} />
      </g>
      <RouteTag x={318} y={120} text={t('organ.journeyPlate.swallowed')} sub={t('organ.journeyPlate.routeOnly')} />
      <RouteTag x={196} y={330} text={t('organ.liver.portalVein')} sub={t('organ.journeyPlate.firstPass')} anchor="end" />

      {/* --- circulating: density is the plasma level --- */}
      <path className="pil-route-live" d={D_SYSTEMIC} />
      {on.map((d) => {
        const spec = cloud(d, sig(frame.conc?.[d]))
        if (!spec) return null
        return (
          <Stream
            key={d}
            d={D_SYSTEMIC}
            count={clamp(Math.round(spec.count / 3), 1, 7)}
            durationS={2.6}
            colour={DRUGS[d].hue}
            r={2.6}
            opacity={spec.opacity}
          />
        )
      })}
      <RouteTag x={362} y={244} text={t('organ.journeyPlate.inBlood')} sub={t('organ.journeyPlate.densityPlasma')} />

      {/* --- to the kidney, and out --- */}
      <path className="pil-route-live" d={D_RENAL_L} />
      <path className="pil-route-live" d={D_RENAL_R} />
      {renal.map((d) => {
        const spec = cloud(d, sig(frame.conc?.[d]))
        if (!spec) return null
        return (
          <g key={d}>
            <Stream d={D_RENAL_L} count={clamp(Math.round(spec.count / 6), 1, 4)} durationS={1.5} colour={DRUGS[d].hue} r={2.2} />
            <Stream d={D_RENAL_R} count={clamp(Math.round(spec.count / 6), 1, 4)} durationS={1.5} colour={DRUGS[d].hue} r={2.2} />
          </g>
        )
      })}
      <path className="pil-route-live" d={D_URINE} />
      {drops !== null && (
        <Stream
          d={D_URINE}
          count={clamp(Math.round(drops * 2.2), 1, 10)}
          durationS={2.4}
          colour={ORGAN.filtrate}
          r={3}
        />
      )}
      <RouteTag
        x={214}
        y={432}
        text={t('organ.journeyPlate.cleared')}
        sub={urine === null ? t('organ.bodyFigure.urineNotModelled') : t('organ.bodyFigure.urineValue', { value: Math.round(urine) })}
        anchor="end"
      />
    </g>
  )
}

function RouteTag({
  x,
  y,
  text,
  sub,
  anchor = 'start',
}: {
  x: number
  y: number
  text: string
  sub: string
  anchor?: 'start' | 'end'
}) {
  return (
    <g className="pil-route-tag">
      <text x={x} y={y} textAnchor={anchor} className="pil-route-tag-main">
        {text}
      </text>
      <text x={x} y={y + 14} textAnchor={anchor} className="pil-route-tag-sub">
        {sub}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// JOURNEY — the station board
// ---------------------------------------------------------------------------

export const JOURNEY_PLATE = { w: 900, h: 566 }

export function JourneyPlate({
  rect,
  frame,
  history,
}: {
  rect: Rect
  frame: EffectFrame
  history: EffectFrame[]
}) {
  const t = useT()
  const on = onBoardDrugs(frame)
  const rows = on.length > 0 ? on : []
  const clearance = clearanceFacts(t)

  // Three lines per row: name, plasma level, clearance note. Reserved from the count, so a
  // row that grows a line pushes the next one down rather than printing through it.
  const ys = layoutLane(
    rows.map(() => ({ y: PLATE_HEAD + 22, lines: 2, size: PLATE_TYPE.blockTitle, lineSize: PLATE_TYPE.line })),
    26,
  )

  return (
    <PlateCard rect={rect} title={t('organ.journeyPlate.title')} sub={t('organ.journeyPlate.sub')}>
      {rows.length === 0 && (
        <text x={0} y={PLATE_HEAD + 24} className="pil-plate-line is-muted">
          {t('organ.journeyPlate.noneOnBoard')}
        </text>
      )}

      {rows.map((d, i) => {
        const y = ys[i] ?? PLATE_HEAD
        const conc = sig(frame.conc?.[d])
        const fact = clearance[d]
        const fp = fact.firstPass ? sig(frame.liver?.first_pass_extraction?.[fact.firstPass]) : null
        const series = history.map((f) => sig(f.conc?.[d]))
        return (
          <g key={d} className="pil-journey-row">
            {/* who */}
            <rect x={0} y={y - 10} width={11} height={11} rx={3} fill={DRUGS[d].hue} />
            <text x={20} y={y} className="pil-plate-block-title">
              {DRUGS[d].label}
            </text>
            <text x={20} y={y + TITLE_LEAD} className="pil-plate-line">
              {conc === null ? t('organ.journeyPlate.plasmaNotModelled') : t('organ.journeyPlate.plasmaValue', { value: conc.toFixed(1) })}
            </text>

            {/* first pass — an aperture, the same idiom as the CYP2D6 gate */}
            <g transform={`translate(268 ${y + 4})`}>
              <FirstPassGate extraction={fp} hue={DRUGS[d].hue} />
            </g>
            <text x={268} y={y + TITLE_LEAD + LINE_PITCH} textAnchor="middle" className="pil-plate-line is-muted">
              {fp === null ? t('organ.journeyPlate.noFirstPass') : t('organ.journeyPlate.firstPassRemoves', { value: Math.round(fp * 100) })}
            </text>

            {/* what the run did to it */}
            <Trace x={380} y={y - 20} w={300} h={44} values={series} colour={DRUGS[d].hue} />

            {/* where it goes */}
            <text x={706} y={y} className="pil-plate-line">
              {fact.route}
            </text>
            <text x={706} y={y + TITLE_LEAD} className="pil-plate-line is-muted">
              {fact.note}
            </text>
          </g>
        )
      })}

      <text x={0} y={rect.h - 26} className="pil-plate-line is-muted">
        {t('organ.journeyPlate.gutNote1')}
      </text>
      <text x={0} y={rect.h - 10} className="pil-plate-line is-muted">
        {t('organ.journeyPlate.gutNote2')}
      </text>
    </PlateCard>
  )
}

/** The fraction that survives the liver on the way in, drawn as an open aperture. */
function FirstPassGate({ extraction, hue }: { extraction: number | null; hue: string }) {
  const t = useT()
  const H = 42
  const open = extraction === null ? null : clamp(1 - extraction, 0, 1) * H
  return (
    <g>
      <title>
        {extraction === null
          ? t('organ.journeyPlate.noExtraction')
          : t('organ.journeyPlate.extractionTitle', { value: extraction.toFixed(2) })}
      </title>
      <rect x={-9} y={-H / 2} width={18} height={H} rx={4} fill={ORGAN.panel} stroke={ORGAN.panelLine} strokeWidth={1.4} />
      {open !== null ? (
        <rect x={-9} y={-open / 2} width={18} height={open} rx={4} fill={hue} fillOpacity={0.9} />
      ) : (
        <path d={`M -9 ${-H / 2} L 9 ${H / 2}`} stroke={ORGAN.panelLine} strokeWidth={1.6} />
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// HEART
// ---------------------------------------------------------------------------

export const HEART_PLATE = { w: 600, h: 470 }

export function HeartPlate({ rect, frame, history }: { rect: Rect; frame: EffectFrame; history: EffectFrame[] }) {
  const t = useT()
  const hr = sig(frame.haemo?.hr)
  const co = sig(frame.haemo?.cardiac_output)
  const sv = sig(frame.haemo?.stroke_volume)
  const ci = sig(frame.haemo?.contractility_index)
  const beta1 = sig(frame.engagement?.beta1_occupancy)
  const beta2 = sig(frame.engagement?.beta2_occupancy)
  const meto = sig(frame.conc?.metoprolol)
  const bradycardic = hr !== null && hr < 50
  const crossed = meto !== null && meto > METOPROLOL_BETA2_CROSSOVER_NG_ML

  return (
    <PlateCard rect={rect} title={t('organ.heartPlate.title')} sub={t('organ.heartPlate.sub')}>
      <g transform="translate(190 268)">
        <Heart frame={frame} x={0} y={0} scale={1.9} />
      </g>

      <BlockColumn
        x={352}
        y={PLATE_HEAD + 26}
        blocks={[
          {
            title: t('organ.heartPlate.rateTitle'),
            hint: t('organ.heartPlate.rateHint'),
            lines: [
              { text: hr === null ? t('organ.heartPlate.notModelled') : `${Math.round(hr)} bpm`, colour: bradycardic ? ORGAN.warn : undefined },
              bradycardic ? { text: t('organ.heartPlate.bradycardicGate'), colour: ORGAN.warn } : null,
            ],
          },
          {
            title: t('organ.heartPlate.forceTitle'),
            hint: t('organ.heartPlate.forceHint'),
            lines: [{ text: formatSignal('haemo.contractility_index', ci, undefined, 2) }],
          },
          {
            title: t('organ.heartPlate.outputTitle'),
            lines: [
              { text: co === null ? t('organ.heartPlate.coNotModelled') : `CO ${co.toFixed(1)} L/min` },
              { text: sv === null ? t('organ.heartPlate.svNotModelled') : `SV ${Math.round(sv)} mL` },
            ],
          },
          {
            title: t('organ.heartPlate.receptorsTitle'),
            hint: t('organ.heartPlate.receptorsHint'),
            lines: [
              {
                text: beta1 === null ? t('organ.heartPlate.beta1NotModelled') : t('organ.heartPlate.beta1Value', { value: Math.round(beta1 * 100) }),
                colour: DRUGS.metoprolol.hue,
              },
              {
                text: beta2 === null ? t('organ.heartPlate.beta2NotModelled') : t('organ.heartPlate.beta2Value', { value: Math.round(beta2 * 100) }),
                colour: crossed ? ORGAN.bad : undefined,
              },
              crossed ? { text: t('organ.heartPlate.selectivityFading'), colour: ORGAN.bad } : null,
            ],
          },
        ]}
      />

      <Trace
        x={352}
        y={rect.h - 96}
        w={rect.w - 352}
        h={54}
        values={history.map((f) => sig(f.haemo?.hr))}
        colour={DRUGS.metoprolol.hue}
        label={t('organ.heartPlate.traceLabel')}
      />
      <text x={0} y={rect.h - 8} className="pil-plate-note">
        {t('organ.heartPlate.note')}
      </text>
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// VESSELS
// ---------------------------------------------------------------------------

export const VESSELS_PLATE = { w: 700, h: 372 }

export function VesselsPlate({ rect, frame }: { rect: Rect; frame: EffectFrame }) {
  const t = useT()
  const sbp = sig(frame.haemo?.sbp)
  const dbp = sig(frame.haemo?.dbp)
  const svr = sig(frame.haemo?.svr)
  const art = sig(frame.haemo?.arteriolar_radius_index)
  const ven = sig(frame.haemo?.venous_tone_index)
  const capP = sig(frame.haemo?.capillary_hydrostatic_p)

  return (
    <PlateCard rect={rect} title={t('organ.vesselsPlate.title')} sub={t('organ.vesselsPlate.sub')}>
      <g>
        <ResistanceUnit frame={frame} x={44} y={PLATE_HEAD - 6} />
      </g>

      <BlockColumn
        x={0}
        y={rect.h - 62}
        blocks={[
          {
            title: t('organ.vesselsPlate.pressureTitle'),
            lines: [
              { text: sbp === null || dbp === null ? t('organ.vesselsPlate.bpNotModelled') : `${Math.round(sbp)} / ${Math.round(dbp)} mmHg` },
              { text: svr === null ? t('organ.vesselsPlate.svrNotModelled') : `SVR ${Math.round(svr)} dyn·s·cm⁻⁵` },
            ],
          },
        ]}
      />
      <BlockColumn
        x={250}
        y={rect.h - 62}
        blocks={[
          {
            title: t('organ.vesselsPlate.inletOutletTitle'),
            hint: t('organ.vesselsPlate.inletOutletHint'),
            lines: [
              { text: t('organ.vesselsPlate.arteriolePrefix', { value: formatSignal('haemo.arteriolar_radius_index', art, undefined, 2) }) },
              { text: t('organ.vesselsPlate.venulePrefix', { value: formatSignal('haemo.venous_tone_index', ven, undefined, 2) }) },
            ],
          },
        ]}
      />
      <BlockColumn
        x={520}
        y={rect.h - 62}
        blocks={[
          {
            title: t('organ.vesselsPlate.capillaryTitle'),
            hint: t('organ.vesselsPlate.capillaryHint'),
            lines: [{ text: formatSignal('haemo.capillary_hydrostatic_p', capP === null ? null : capP / 25, undefined, 2) }],
          },
        ]}
      />
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// LUNGS
// ---------------------------------------------------------------------------

export const LUNGS_PLATE = { w: 660, h: 520 }

export function LungsPlate({ rect, frame }: { rect: Rect; frame: EffectFrame }) {
  const t = useT()
  const fev1 = sig(frame.lung?.fev1_pct_baseline)
  const beta2 = sig(frame.engagement?.beta2_occupancy)
  const bk = sig(frame.lung?.bradykinin_airway_fold)
  const coughHazard = sig(frame.lung?.cough_hazard)
  const acePulm = sig(frame.engagement?.ace_inhibition_pulmonary)
  const lisOn = onBoard(frame.conc?.lisinopril, 'lisinopril')
  const losOn = onBoard(frame.conc?.losartan, 'losartan') || onBoard(frame.conc?.exp3174, 'exp3174')

  return (
    <PlateCard rect={rect} title={t('organ.lungsPlate.title')} sub={t('organ.lungsPlate.sub')}>
      <g transform={`translate(178 ${PLATE_HEAD + 18})`}>
        <Lungs frame={frame} x={0} y={0} scale={1.95} />
      </g>

      <BlockColumn
        x={392}
        y={PLATE_HEAD + 26}
        blocks={[
          {
            title: t('organ.lungsPlate.airflowTitle'),
            lines: [{ text: fev1 === null ? t('organ.bodyFigure.fev1NotModelled') : t('organ.lungs.fev1Value', { value: fev1.toFixed(0) }) }],
          },
          {
            title: t('organ.lungsPlate.beta2SpilloverTitle'),
            hint: t('organ.lungsPlate.beta2SpilloverHint'),
            lines: [
              {
                text: beta2 === null ? t('organ.lungsPlate.notModelled') : t('organ.lungsPlate.occupiedPct', { value: Math.round(beta2 * 100) }),
                colour: DRUGS.metoprolol.hue,
              },
            ],
          },
          {
            title: t('organ.lungsPlate.bradykininTitle'),
            hint: t('organ.lungsPlate.bradykininHint'),
            lines: [
              {
                text: t('organ.lungsPlate.airwayPrefix', { value: formatSignal('lung.bradykinin_airway_fold', bk, undefined, 2) }),
                colour: DRUGS.lisinopril.hue,
              },
              {
                text:
                  acePulm === null
                    ? t('organ.lungsPlate.pulmonaryAceNotModelled')
                    : t('organ.lungsPlate.pulmonaryAceValue', { value: Math.round(acePulm * 100) }),
              },
              coughHazard === null
                ? null
                : { text: t('organ.lungsPlate.coughChannel', { value: formatSignal('lung.cough_hazard', coughHazard, undefined, 2) }) },
            ],
          },
          losOn && !lisOn
            ? {
                title: t('organ.lungsPlate.absenceTitle'),
                hint: t('organ.lungsPlate.absenceHint'),
                lines: [
                  { text: t('organ.lungsPlate.noBradykininAccumulation'), colour: DRUGS.losartan.hue },
                  { text: t('organ.lungsPlate.noCoughChannelAtAll'), colour: DRUGS.losartan.hue },
                ],
              }
            : null,
        ].filter(Boolean) as Block[]}
      />

      <text x={0} y={rect.h - 8} className="pil-plate-note">
        {t('organ.lungsPlate.note')}
      </text>
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// LIVER
// ---------------------------------------------------------------------------

export const LIVER_PLATE = { w: 720, h: 486 }

export function LiverPlate({ rect, frame }: { rect: Rect; frame: EffectFrame }) {
  const t = useT()
  const capFold = sig(frame.liver?.cyp2d6_capacity_fold)
  const metoOn = onBoard(frame.conc?.metoprolol, 'metoprolol')
  const meto = sig(frame.conc?.metoprolol)
  const crossed = meto !== null && meto > METOPROLOL_BETA2_CROSSOVER_NG_ML

  return (
    <PlateCard rect={rect} title={t('organ.liverPlate.title')} sub={t('organ.liverPlate.sub')}>
      <g transform={`translate(10 ${PLATE_HEAD})`}>
        <LiverReactorsContent frame={frame} />
      </g>

      <text x={0} y={rect.h - 26} className="pil-plate-note">
        {capFold === null
          ? t('organ.liverPlate.capacityNotModelled')
          : t('organ.liverPlate.gateNote', { value: capFold.toFixed(2) })}
      </text>
      <text x={0} y={rect.h - 8} className={crossed ? 'pil-plate-note is-alert' : 'pil-plate-note'}>
        {!metoOn
          ? t('organ.liverPlate.idle')
          : crossed
            ? t('organ.liverPlate.aboveThreshold')
            : t('organ.liverPlate.belowThreshold')}
      </text>
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// KIDNEY
// ---------------------------------------------------------------------------

export const KIDNEY_PLATE = { w: 780, h: 592 }

export function KidneyPlate({ rect, frame, history }: { rect: Rect; frame: EffectFrame; history: EffectFrame[] }) {
  const t = useT()
  const gfr = sig(frame.renal?.gfr)
  const pGlom = sig(frame.renal?.p_glomerular)

  return (
    <PlateCard rect={rect} title={t('organ.kidneyPlate.title')} sub={t('organ.kidneyPlate.sub')}>
      <g transform={`translate(10 ${PLATE_HEAD}) scale(1.0)`}>
        <NephronContent frame={frame} />
      </g>

      <BlockColumn
        x={0}
        y={rect.h - 52}
        blocks={[
          {
            title: t('organ.kidneyPlate.filtrationTitle'),
            hint: t('organ.kidneyPlate.filtrationHint'),
            lines: [
              { text: gfr === null ? t('organ.bodyFigure.egfrNotModelled') : `eGFR ${Math.round(gfr)} mL/min/1.73m²` },
              {
                text: t('organ.kidneyPlate.pGlomPrefix', {
                  value: formatSignal('renal.p_glomerular', pGlom === null ? null : pGlom / 55, undefined, 2),
                }),
              },
            ],
          },
        ]}
      />
      <Trace
        x={300}
        y={rect.h - 62}
        w={rect.w - 300}
        h={52}
        values={history.map((f) => sig(f.renal?.gfr))}
        colour={DRUGS.lisinopril.hue}
        label={t('organ.kidneyPlate.traceLabel')}
      />
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// RAAS — counter-regulation
// ---------------------------------------------------------------------------

export const RAAS_PLATE = { w: 700, h: 300 }

export function RaasPlate({ rect, frame }: { rect: Rect; frame: EffectFrame }) {
  const t = useT()
  const renin = sig(frame.mediators?.renin_pra_fold)
  const aldo = sig(frame.mediators?.aldosterone_fold)
  const ace = sig(frame.engagement?.ace_inhibition_plasma)
  const at1 = sig(frame.engagement?.at1_blockade)
  const dual = (ace ?? 0) > 0.15 && (at1 ?? 0) > 0.15

  return (
    <PlateCard rect={rect} title={t('organ.raasPlate.title')} sub={t('organ.raasPlate.sub')}>
      <g transform={`translate(30 ${PLATE_HEAD})`}>
        <RaasCascadeContent frame={frame} />
      </g>

      <text x={0} y={rect.h - 44} className="pil-plate-note">
        {renin === null ? t('organ.raasPlate.reninNotModelled') : t('organ.raasPlate.reninNote', { value: renin.toFixed(2) })}
      </text>
      <text x={0} y={rect.h - 26} className="pil-plate-note">
        {aldo === null
          ? t('organ.raasPlate.aldosteroneNotModelled')
          : t('organ.raasPlate.aldosteroneNote', { value: aldo.toFixed(2) })}
      </text>
      <text x={0} y={rect.h - 8} className={dual ? 'pil-plate-note is-alert' : 'pil-plate-note'}>
        {dual ? t('organ.raasPlate.dualNote') : t('organ.raasPlate.singleNote')}
      </text>
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// LIMBS
// ---------------------------------------------------------------------------

export const LIMBS_PLATE = { w: 700, h: 356 }

export function LimbsPlate({ rect, frame }: { rect: Rect; frame: EffectFrame }) {
  const t = useT()
  const idx = sig(frame.periph?.interstitial_volume_index)
  const grade = sig(frame.periph?.edema_grade) ?? derivedEdemaGrade(idx)
  const capP = sig(frame.haemo?.capillary_hydrostatic_p)
  const amloOn = onBoard(frame.conc?.amlodipine, 'amlodipine')
  const hctzOn = onBoard(frame.conc?.hydrochlorothiazide, 'hydrochlorothiazide')
  const raasOn =
    onBoard(frame.conc?.lisinopril, 'lisinopril') ||
    onBoard(frame.conc?.losartan, 'losartan') ||
    onBoard(frame.conc?.exp3174, 'exp3174')

  const swollen = grade !== null && grade >= 1 && amloOn
  const verdict = !swollen
    ? t('organ.limbsPlate.noSwelling')
    : hctzOn && !raasOn
      ? t('organ.limbsPlate.thiazideOnly')
      : raasOn
        ? t('organ.limbsPlate.raasOn')
        : t('organ.limbsPlate.default')

  const verdictLines = wrapText(verdict, 46)

  return (
    <PlateCard rect={rect} title={t('organ.limbsPlate.title')} sub={t('organ.limbsPlate.sub')}>
      <g transform={`translate(120 ${PLATE_HEAD + 96})`}>
        <Ankle frame={frame} x={0} y={0} scale={1.15} />
      </g>
      <g transform={`translate(300 ${PLATE_HEAD + 96})`}>
        <Ankle frame={frame} x={0} y={0} scale={1.15} mirror />
      </g>

      <BlockColumn
        x={410}
        y={PLATE_HEAD + 26}
        blocks={[
          {
            title: t('organ.limbsPlate.interstitiumTitle'),
            hint: t('organ.limbsPlate.interstitiumHint'),
            lines: [
              { text: formatSignal('periph.interstitial_volume_index', idx, undefined, 3) },
              {
                text:
                  grade === null
                    ? t('organ.limbsPlate.pittingNotModelled')
                    : t('organ.limbsPlate.pittingPresentational', { grade }),
              },
            ],
          },
          {
            title: t('organ.limbsPlate.capillaryTitle'),
            lines: [
              { text: formatSignal('haemo.capillary_hydrostatic_p', capP === null ? null : capP / 25, undefined, 2) },
            ],
          },
          {
            title: t('organ.limbsPlate.whatHappeningTitle'),
            lines: verdictLines.map((line) => ({ text: line, muted: !swollen })),
          },
        ]}
      />

      <text x={0} y={rect.h - 8} className="pil-plate-note">
        {t('organ.limbsPlate.note')}
      </text>
    </PlateCard>
  )
}

// ---------------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------------

export const SAFETY_PLATE = { w: 640, h: 596 }

/** Where a fired channel is marked on the body. Anatomy of the finding, not of the drug. */
export const BADGE_SITES: Record<string, [number, number]> = {
  cough: [330, 96],
  angioedema: [276, 92],
  dizziness_orthostatic: [300, 52],
  bronchospasm: [262, 196],
  bradycardia: [336, 220],
  acute_gfr_drop: [346, 306],
  hyperkalemia: [302, 268],
  hypokalemia: [302, 268],
  hyponatremia: [316, 282],
  hyperuricemia_gout: [268, 322],
  peripheral_edema: [268, 632],
}

export interface SafetyGates {
  pregnancyBarrier?: boolean
  disqualified?: boolean
  note?: string
}

export function firedBadges(
  frame: EffectFrame | null,
  latched: ReadonlySet<string>,
): typeof BADGES {
  if (!frame) return []
  return BADGES.filter((b) => latched.has(b.id))
}

/** The numbered markers on the body. Numbers, not words — the words live on the plate. */
export function SafetyMarks({ fired }: { fired: typeof BADGES }) {
  return (
    <g className="pil-safety-marks">
      {fired.map((b, i) => {
        const at = BADGE_SITES[b.id]
        if (!at) return null
        return (
          <g key={b.id} className={`pil-safety-mark${b.rare ? ' is-rare' : ''}`}>
            <title>{`${b.label} — ${b.drugs}`}</title>
            <circle cx={at[0]} cy={at[1]} r={11} />
            <text x={at[0]} y={at[1] + 4.5} textAnchor="middle" className="pil-safety-mark-n">
              {i + 1}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function SafetyPlate({
  rect,
  frame,
  fired,
  gates,
}: {
  rect: Rect
  frame: EffectFrame | null
  fired: typeof BADGES
  gates?: SafetyGates
}) {
  const t = useT()
  const hardGate = Boolean(gates?.disqualified || gates?.pregnancyBarrier)

  // Every row's height is derived from the text it actually carries, wrapped first and
  // counted second, so a long incidence string cannot run into the row beneath it.
  const rows = fired.map((b, i) => {
    const lines: string[] = [
      t('organ.safetyPlate.drivenBy', { drugs: b.drugs }),
      ...wrapText(t('organ.safetyPlate.incidence', { value: b.incidence }), 62),
    ]
    return { badge: b, n: i + 1, lines }
  })

  const top = PLATE_HEAD + (hardGate ? 92 : 22)
  const ys = layoutLane(
    rows.map((r) => ({ y: top, lines: r.lines.length, size: PLATE_TYPE.blockTitle, lineSize: PLATE_TYPE.line })),
    16,
  )

  return (
    <PlateCard rect={rect} title={t('organ.safetyPlate.title')} sub={t('organ.safetyPlate.sub')}>
      {hardGate && (
        <g className="pil-safety-gate">
          <rect x={0} y={PLATE_HEAD} width={rect.w} height={74} rx={10} />
          <text x={16} y={PLATE_HEAD + 26} className="pil-plate-block-title is-alert">
            {gates?.disqualified ? t('organ.safetyPlate.haltedGate') : t('organ.safetyPlate.fetalBarrier')}
          </text>
          {wrapText(
            gates?.note ??
              (gates?.pregnancyBarrier
                ? t('organ.safetyPlate.pregnancyNote')
                : t('organ.safetyPlate.contraindicatedNote')),
            66,
          )
            .slice(0, 2)
            .map((line, i) => (
              <text key={i} x={16} y={PLATE_HEAD + 44 + i * LINE_PITCH} className="pil-plate-line">
                {line}
              </text>
            ))}
        </g>
      )}

      {rows.length === 0 && (
        <text x={0} y={top} className="pil-plate-line is-muted">
          {frame ? t('organ.safetyPlate.noneAboveThreshold') : t('organ.safetyPlate.noRun')}
        </text>
      )}

      {rows.map((r, i) => {
        const y = ys[i] ?? top
        return (
          <g key={r.badge.id} className={`pil-safety-row${r.badge.rare ? ' is-rare' : ''}`}>
            <circle cx={11} cy={y - 4} r={11} className="pil-safety-row-dot" />
            <text x={11} y={y + 0.5} textAnchor="middle" className="pil-safety-mark-n">
              {r.n}
            </text>
            <text x={32} y={y} className="pil-plate-block-title">
              {r.badge.label}
              {r.badge.rare ? t('organ.safetyPlate.rareSuffix') : ''}
            </text>
            {r.lines.map((line, j) => (
              <text key={j} x={32} y={y + TITLE_LEAD + j * LINE_PITCH} className="pil-plate-line is-muted">
                {line}
              </text>
            ))}
          </g>
        )
      })}

      <text x={0} y={rect.h - 8} className="pil-plate-note">
        {t('organ.safetyPlate.note')}
      </text>
    </PlateCard>
  )
}

/** Latch helper shared with the scene, so the marks and the rows can never disagree. */
export function latchFor(
  frame: EffectFrame | null,
  prev: ReadonlySet<string>,
  ranges: RefRanges = FALLBACK_REF,
): Set<string> {
  if (!frame) return new Set<string>()
  return latchBadges(frame.hazards, prev, {
    hr: sig(frame.haemo?.hr),
    serumK: sig(frame.chem?.serum_k),
    serumUrate: sig(frame.chem?.serum_urate),
    kLow: ranges.kLow,
    kHigh: ranges.kHigh,
    urateHigh: ranges.urateHigh,
  })
}

