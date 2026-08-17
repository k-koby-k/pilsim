/**
 * KIDNEY, down to nephron segment — research/04-ORGAN-EFFECT-MAP.md §7.
 *
 * Four of the five drugs act here, in four anatomically distinct places, and the
 * viewer can see all four at once (§7.2). The thiazide target and the RAAS targets are
 * in DIFFERENT nephron segments, so the segments are drawn and labelled distinctly.
 *
 * §7.4 carries the ONE T1 row in the whole document: NCC / SLC12A3 in distal
 * convoluted tubule cells. That is the only place in this UI where a cell population
 * is named. Every other element stops at tissue level.
 *
 * DRAWING NOTES. The whole-organ view is a bean with the hilum on the medial side, a
 * cortex rim, medullary pyramids and a pelvis draining to the ureter. The nephron panel
 * runs left to right in the direction of flow: glomerulus, proximal tubule, loop, distal
 * tubule, collecting duct, ureter — with each segment given its own silhouette so the
 * four drug sites are told apart by shape as well as by label.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import {
  bip,
  clamp,
  DRUGS,
  dropsPerS,
  flow,
  ION,
  lumen,
  norm,
  onBoard,
  ORGAN,
  sig,
  T1_CELL_POPULATION,
  tint,
  tintWash,
} from './channels'
import { IonStream, Leader, OccupancyRing, OrganLabel, Stream, TintOverlay, TintStroke } from './primitives'

/**
 * Caption lanes for the top block. The glomerulus caption is the widest line in the panel
 * and sits directly over both arteriole captions, so the three of them get separate lanes
 * with a full line of clear space between, rather than being packed until they touch.
 */
const GLOMERULUS_LABEL_Y = 28
const ARTERIOLE_LABEL_Y = 70

const BASE_P_GLOM = 55 // the baseline this PROXY index is expressed against. NOT a claim.
const BASE_URATE_EXCRETION = 25 // mg/h, baselineFrame reference
const BASE_K_EXCRETION = 2.5 // mmol/h, baselineFrame reference

/** The glomerular capillary tuft, inside Bowman's capsule. */
const D_TUFT =
  'M 178 90 C 187 78 206 80 213 92 C 220 104 213 118 199 120 C 185 122 176 113 178 101 Z'

/** Whole-organ bean. Hilum notch on the +x (medial) side; `mirror` puts it on the left. */
const D_KIDNEY =
  'M 4 0 C -12 0 -23 13 -26 31 C -29 51 -19 65 -2 65 C 11 65 19 57 19 47 ' +
  'C 19 39 11 35 11 32 C 11 29 19 26 19 17 C 19 7 13 0 4 0 Z'

/** Cortex rim — the same bean, inset. */
const D_KIDNEY_CORTEX =
  'M 5 7 C -8 7 -17 18 -19 32 C -22 47 -14 58 -2 58 C 8 58 13 52 13 46 ' +
  'C 13 39 5 36 5 32 C 5 28 13 25 13 18 C 13 11 10 7 5 7 Z'

export interface KidneyProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  labels?: boolean
}

/** Whole-kidney view for the body figure. Colour carries acute filtration stress. */
export function KidneyOutline({
  frame,
  x,
  y,
  scale = 1,
  mirror = false,
  labels = true,
}: KidneyProps & { mirror?: boolean }) {
  const t = useT()
  const gfr = sig(frame.renal?.gfr)
  const pGlom = sig(frame.renal?.p_glomerular)
  const gfrDrop = sig(frame.hazards?.acute_gfr_drop)
  const washT = pGlom === null ? null : bip(pGlom, BASE_P_GLOM, 12)
  const stressed = (gfrDrop ?? 0) >= 0.3

  return (
    <g transform={`translate(${x} ${y}) scale(${mirror ? -scale : scale} ${scale})`} className="pil-organ pil-kidney">
      <title>{t('organ.kidney.outlineTitle')}</title>

      {/* renal artery, vein and ureter leaving the hilum, drawn behind the organ */}
      <path d="M 9 26 L 22 23" fill="none" stroke={ORGAN.artery} strokeWidth={3.6} strokeLinecap="round" />
      <path d="M 9 33 L 23 33" fill="none" stroke={ORGAN.vein} strokeWidth={4.4} strokeLinecap="round" />
      <path d="M 9 40 C 18 45 21 54 22 66" fill="none" stroke={ORGAN.kidneyPelvis} strokeWidth={3.4} strokeLinecap="round" />

      <path d={D_KIDNEY} fill={ORGAN.kidney} stroke={ORGAN.kidneyLine} strokeWidth={1.6} />
      <path d={D_KIDNEY_CORTEX} fill={ORGAN.kidneyMedulla} fillOpacity={0.75} stroke="none" />

      {/* medullary pyramids, apices pointing at the hilum */}
      <g fill={ORGAN.kidney} fillOpacity={0.55}>
        <path d="M -19 17 L -7 22 L -19 27 Z" />
        <path d="M -21 32 L -7 32 L -21 37 Z" />
        <path d="M -18 46 L -6 42 L -12 53 Z" />
      </g>

      <TintOverlay d={D_KIDNEY} t={washT} />
      {stressed && (
        <path d={D_KIDNEY} fill="none" stroke={ORGAN.bad} strokeWidth={2.4} strokeOpacity={0.85} strokeDasharray="5 4" />
      )}

      {labels && (
        <text
          x={-4}
          y={80}
          textAnchor="middle"
          className="pil-label-sub"
          transform={mirror ? 'scale(-1 1)' : undefined}
        >
          {gfr === null ? t('organ.kidney.egfrNotModelled') : `${Math.round(gfr)} mL/min/1.73m²`}
        </text>
      )}
    </g>
  )
}

/**
 * The nephron plate's own drawing space. Published so a camera can place the same plate
 * inside a larger scene without re-measuring it by eye.
 */
export const NEPHRON_SIZE = { w: 760, h: 470 } as const

/**
 * The schematic nephron as a standalone panel.
 */
export function Nephron({ frame }: { frame: EffectFrame }) {
  const t = useT()
  return (
    <svg
      className="pil-nephron"
      viewBox={`0 0 ${NEPHRON_SIZE.w} ${NEPHRON_SIZE.h}`}
      role="img"
      aria-label={t('organ.kidney.nephronAriaLabel')}
    >
      <title>{t('organ.kidney.nephronTitle')}</title>
      <NephronContent frame={frame} />
    </svg>
  )
}

/**
 * The same drawing as a plain group, so it can be transformed into another coordinate
 * space. One nephron, one set of bindings — the panel and the scene draw the same thing.
 */
export function NephronContent({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const r = frame.renal
  const e = frame.engagement

  const affIdx = sig(r?.afferent_radius_index)
  const effIdx = sig(r?.efferent_radius_index)
  const pGlom = sig(r?.p_glomerular)
  const gfr = sig(r?.gfr)
  const reninFold = sig(frame.mediators?.renin_pra_fold)
  const ncc = sig(e?.ncc_inhibition)
  const urat1 = sig(e?.urat1_inhibition)
  const naEx = sig(r?.na_excretion_rate)
  const kEx = sig(r?.k_excretion_rate)
  const urateEx = sig(r?.urate_excretion_rate)
  const urineFlow = sig(r?.urine_flow)

  const affW = lumen(7, affIdx) ?? 7
  const effW = lumen(7, effIdx) ?? 7

  const glomT = pGlom === null ? null : bip(pGlom, BASE_P_GLOM, 12)
  const jgaT = reninFold === null ? null : bip(reninFold, 1.0, 2.0)
  const dctT = ncc === null ? null : -clamp(ncc, 0, 1)
  const cdT = kEx === null ? null : bip(kEx, BASE_K_EXCRETION, 2.0)
  const effT = effIdx === null ? null : bip(clamp(effIdx, 0.7, 1.6), 1.0, 0.45) * -1

  const filtration = flow(gfr === null ? null : norm(gfr, 15, 130), 90)

  // §7.4: urate arrow direction is the whole point. Losartan flushes urate OUT via the
  // proximal tubule; HCTZ (volume contraction) pushes it back IN. Same element, opposite arrows.
  const urateOut = urateEx !== null && urateEx > BASE_URATE_EXCRETION
  const urateMag = urateEx === null ? null : Math.abs(urateEx - BASE_URATE_EXCRETION) / BASE_URATE_EXCRETION
  const urateStream = flow(urateMag === null ? null : clamp(urateMag, 0, 1), 70)

  const naStream = flow(naEx === null ? null : norm(naEx, 0, 25), 150)
  const kStream = flow(kEx === null ? null : norm(kEx, 0, 8), 90)

  const drops = urineFlow === null ? null : dropsPerS(urineFlow)
  const dropStream = drops === null ? null : { count: clamp(Math.round(drops * 2.4), 1, 14), durationS: 2.4 }

  const dualRaas =
    onBoard(frame.conc?.lisinopril, 'lisinopril') &&
    (onBoard(frame.conc?.losartan, 'losartan') || onBoard(frame.conc?.exp3174, 'exp3174'))

  // Segment centre lines, in the direction of flow. Every label below sits in a lane that
  // no drawn element crosses — a diagram whose captions overlap its own anatomy is worse
  // than no diagram, and this is the panel the whole renal argument rests on.
  const dAff = 'M 46 104 L 156 104'
  const dEff = 'M 236 104 L 352 104'
  const dPct = 'M 196 150 C 196 172 234 166 234 188 C 234 210 196 204 196 226'
  const dLoop = 'M 196 226 L 196 292 C 196 316 240 316 240 292 L 240 226'
  const dDct = 'M 240 226 L 372 226'
  const dCd = 'M 372 226 L 560 226 L 560 300'
  const dUreter = 'M 560 300 C 560 330 600 340 634 344'
  const dFilt = 'M 196 138 L 196 150'

  return (
    <>
      {dualRaas && (
        <g className="pil-dual-raas">
          <title>{t('organ.kidney.dualRaasTitle')}</title>
          <rect x={20} y={22} width={520} height={126} rx={12} fill={ORGAN.bad} opacity={0.06} stroke={ORGAN.bad} strokeDasharray="5 4" />
          <text x={536} y={18} textAnchor="end" className="pil-warn-text">
            {t('organ.kidney.dualRaasLabel')}
          </text>
        </g>
      )}

      {/* ---------------- afferent arteriole (reference — stays near baseline) -------
          The two arteriole captions sit in their own lane BELOW the glomerulus caption.
          Sharing a band with it put three captions in 45 units of height with 5 units
          between rows, and since the glomerulus line is the widest of the three it ran
          straight over both of them. Lanes are separated by a full line of clear space. */}
      <path d={dAff} stroke={ORGAN.artery} strokeWidth={affW} strokeLinecap="round" fill="none" />
      <OrganLabel
        x={46}
        y={ARTERIOLE_LABEL_Y}
        text={t('organ.kidney.afferentArteriole')}
        sub={affIdx === null ? t('organ.kidney.notModelled') : t('organ.kidney.timesBaseline', { value: affIdx.toFixed(2) })}
        title={t('organ.kidney.afferentTitle')}
      />

      {/* ---------------- juxtaglomerular apparatus ---------------------------------- */}
      <g className="pil-jga">
        <title>{t('organ.kidney.jgaTitle')}</title>
        <circle cx={152} cy={128} r={10} fill={ORGAN.kidneyMedulla} stroke="var(--pil-stroke, #6b5a52)" strokeWidth={1.2} />
        {jgaT !== null && (
          <circle cx={152} cy={128} r={10} fill={tintWash(jgaT).colour} opacity={tintWash(jgaT).opacity} />
        )}
        <OrganLabel
          x={40}
          y={152}
          text="JGA"
          sub={reninFold === null ? t('organ.kidney.reninNotModelled') : t('organ.kidney.reninValue', { value: reninFold.toFixed(2) })}
        />
      </g>

      {/* ---------------- glomerulus ------------------------------------------------- */}
      <g className="pil-glomerulus">
        <title>{t('organ.kidney.glomerulusTitle')}</title>
        {/* Bowman's capsule */}
        <circle cx={196} cy={104} r={34} fill={ORGAN.filtrate} stroke="var(--pil-stroke, #6b5a52)" strokeWidth={1.5} />
        {/* capillary tuft */}
        <path
          d={D_TUFT}
          fill={ORGAN.artery}
          fillOpacity={0.9}
          stroke="var(--pil-stroke, #6b5a52)"
          strokeWidth={1.2}
        />
        <path
          d="M 182 94 C 191 87 200 105 210 96 M 181 108 C 191 101 200 119 211 108"
          fill="none"
          stroke="var(--pil-stroke, #6b5a52)"
          strokeOpacity={0.4}
          strokeWidth={1.2}
        />
        <TintOverlay d={D_TUFT} t={glomT} />
      </g>
      <OrganLabel
        x={196}
        y={GLOMERULUS_LABEL_Y}
        anchor="middle"
        text={t('organ.kidney.glomerulus')}
        sub={
          pGlom === null
            ? t('organ.kidney.pGlomNotModelled')
            : t('organ.kidney.pGlomValue', { value: (pGlom / BASE_P_GLOM).toFixed(2) })
        }
        title={t('organ.kidney.pGlomTitle')}
      />

      {/* filtration particles into Bowman's space */}
      {filtration && (
        <Stream d={dFilt} count={filtration.count} durationS={filtration.durationS} colour={ORGAN.filtrate} r={2.2} />
      )}

      {/* ---------------- efferent arteriole ----------------------------------------- */}
      <path d={dEff} stroke={ORGAN.artery} strokeWidth={effW} strokeLinecap="round" fill="none" />
      <TintStroke d={dEff} t={effT} width={effW} />
      <OrganLabel
        x={352}
        y={ARTERIOLE_LABEL_Y}
        anchor="end"
        text={t('organ.kidney.efferentArteriole')}
        sub={effIdx === null ? t('organ.kidney.notModelled') : t('organ.kidney.timesBaseline', { value: effIdx.toFixed(2) })}
        title={t('organ.kidney.efferentTitle')}
      />
      <g transform="translate(396 104)">
        <OccupancyRing cx={0} cy={0} r={16} value={sig(e?.ace_inhibition_renal)} colour={DRUGS.lisinopril.hue} label={t('organ.kidney.aceRenalLabel')} />
      </g>
      <g transform="translate(496 104)">
        <OccupancyRing cx={0} cy={0} r={16} value={sig(e?.at1_blockade)} colour={DRUGS.losartan.hue} label="AT1" />
      </g>

      {/* ---------------- proximal convoluted tubule --------------------------------- */}
      <path d={dPct} stroke={ORGAN.tubuleDeep} strokeWidth={15} fill="none" strokeLinecap="round" />
      <path d={dPct} stroke={ORGAN.tubule} strokeWidth={11} fill="none" strokeLinecap="round" />
      <OrganLabel
        x={30}
        y={196}
        text={t('organ.kidney.proximalTubule')}
        sub={t('organ.kidney.naReabsorbed', { value: fmtFrac(sig(frame.renal?.frac_na_reab_pt)) })}
        title={t('organ.kidney.proximalTitle')}
      />
      <g transform="translate(288 180)">
        <OccupancyRing cx={0} cy={0} r={13} value={urat1} colour={DRUGS.losartan.hue} label="URAT1" />
      </g>
      {urateStream && urateMag !== null && urateMag > 0.02 && (
        <IonStream
          ion="urate"
          d="M 252 190 L 214 190"
          count={urateStream.count}
          durationS={urateStream.durationS}
          reverse={!urateOut}
          showTrack
        />
      )}
      <text x={30} y={232} className="pil-label-sub" fill={ION.urate.colour}>
        {urateEx === null ? t('organ.kidney.urateNotModelled') : urateOut ? t('organ.kidney.urateOut') : t('organ.kidney.urateBackIn')}
      </text>
      <text x={30} y={246} className="pil-label-sub" fill={ION.urate.colour}>
        {urateEx === null ? '' : urateOut ? t('organ.kidney.uricosuric') : t('organ.kidney.retained')}
      </text>

      {/* ---------------- loop of Henle / thick ascending limb ----------------------- */}
      <path d={dLoop} stroke={ORGAN.tubuleDeep} strokeWidth={15} fill="none" strokeLinecap="round" />
      <path d={dLoop} stroke={ORGAN.tubule} strokeWidth={11} fill="none" strokeLinecap="round" />
      <OrganLabel
        x={24}
        y={300}
        text={t('organ.kidney.thickAscendingLimb')}
        sub={t('organ.kidney.naReabsorbed', { value: fmtFrac(sig(frame.renal?.frac_na_reab_tal)) })}
        title={t('organ.kidney.thickAscendingTitle')}
      />

      {/* ---------------- distal convoluted tubule — the ONE T1 element -------------- */}
      <g className="pil-dct">
        <title>
          {t('organ.kidney.dctTitle', {
            protein: T1_CELL_POPULATION.protein,
            gene: T1_CELL_POPULATION.gene,
            uniprot: T1_CELL_POPULATION.uniprot,
            cellPopulation: T1_CELL_POPULATION.cellPopulation,
            evidence: T1_CELL_POPULATION.evidence,
            source: T1_CELL_POPULATION.source,
          })}
        </title>
        <path d={dDct} stroke={ORGAN.tubuleDeep} strokeWidth={17} fill="none" strokeLinecap="round" />
        <path d={dDct} stroke={ORGAN.tubule} strokeWidth={13} fill="none" strokeLinecap="round" />
        <TintStroke d={dDct} t={dctT} width={13} />
        {/* the thiazide target, marked in the drug's own hue on the apical membrane */}
        <rect
          x={296}
          y={232}
          width={42}
          height={26}
          rx={5}
          fill={ORGAN.panel}
          stroke={DRUGS.hydrochlorothiazide.hue}
          strokeWidth={1.6}
        />
        <line x1={296} y1={232} x2={338} y2={232} stroke={DRUGS.hydrochlorothiazide.hue} strokeWidth={3} />
        <g transform="translate(317 232)">
          <OccupancyRing cx={0} cy={0} r={12} value={ncc} colour={DRUGS.hydrochlorothiazide.hue} label="NCC" labelDy={20} />
        </g>
      </g>
      {/* The T1 leader runs up the clear channel to the RIGHT of the NCC caption and lands
          on the distal tubule itself. It used to start on the transporter and drop straight
          down through its own "NCC nn %" caption to a dot in empty space above the label —
          a line through the text it was meant to connect, pointing at nothing. */}
      <Leader x1={348} y1={372} x2={356} y2={236} />
      <OrganLabel
        x={30}
        y={366}
        tier="T1"
        text={t('organ.kidney.distalConvolutedTubule')}
        sub={t('organ.kidney.distalConvolutedTubuleCells')}
        title={`${T1_CELL_POPULATION.evidence} — ${T1_CELL_POPULATION.source}`}
      />
      <text x={30} y={396} className="pil-label-sub">
        {t('organ.kidney.naReabsorbedHere', { value: fmtFrac(sig(frame.renal?.frac_na_reab_dct)) })}
      </text>

      {/* Na and Cl streaming PAST the blocked DCT and out through the ureter */}
      {naStream && (
        <>
          <IonStream ion="Na" d="M 350 210 L 552 210" count={naStream.count} durationS={naStream.durationS} showTrack />
          <IonStream ion="Cl" d="M 350 198 L 552 198" count={naStream.count} durationS={naStream.durationS * 1.15} />
        </>
      )}

      {/* ---------------- connecting tubule + collecting duct ------------------------ */}
      <g className="pil-cd">
        <title>{t('organ.kidney.cdTitle')}</title>
        <path d={dCd} stroke={ORGAN.tubuleDeep} strokeWidth={16} fill="none" strokeLinecap="round" />
        <path d={dCd} stroke={ORGAN.tubule} strokeWidth={12} fill="none" strokeLinecap="round" />
        <TintStroke d={dCd} t={cdT} width={12} />
      </g>
      <OrganLabel
        x={578}
        y={180}
        text={t('organ.kidney.collectingDuct')}
        sub={t('organ.kidney.naReabsorbed', { value: fmtFrac(sig(frame.renal?.frac_na_reab_cd)) })}
      />
      <text x={578} y={208} className="pil-tier-note">
        {t('organ.kidney.inferredT3')}
      </text>
      {kStream && kEx !== null && (
        <IonStream
          ion="K"
          d="M 578 244 L 632 244"
          count={kStream.count}
          durationS={kStream.durationS}
          reverse={kEx < BASE_K_EXCRETION}
          showTrack
        />
      )}
      <text x={578} y={272} className="pil-label-sub" fill={ION.K.colour}>
        {t('organ.kidney.kStatus', {
          value: kEx === null ? '—' : kEx > BASE_K_EXCRETION ? t('organ.kidney.wasting') : kEx < BASE_K_EXCRETION ? t('organ.kidney.retained2') : t('organ.kidney.baseline'),
        })}
      </text>

      {/* ---------------- ureter -> bladder: V8 droplets, the HCTZ signature --------- */}
      <path d={dUreter} stroke={ORGAN.kidneyPelvis} strokeWidth={10} fill="none" strokeLinecap="round" />
      {dropStream && (
        <IonStream ion="H2O" d={dUreter} count={dropStream.count} durationS={dropStream.durationS} r={3.4} />
      )}
      <OrganLabel
        x={752}
        y={378}
        anchor="end"
        text={t('organ.kidney.ureter')}
        sub={urineFlow === null ? t('organ.kidney.notModelled') : `${Math.round(urineFlow)} mL/h`}
      />

      {/* A neutral reference chip so the reader can decode the wash without a legend hunt. */}
      <g className="pil-ramp-key" transform="translate(30 456)">
        <rect x={0} y={-10} width={15} height={10} rx={2} fill={tint(-1)} />
        <rect x={16} y={-10} width={15} height={10} rx={2} fill={tint(0)} />
        <rect x={32} y={-10} width={15} height={10} rx={2} fill={tint(1)} />
        <text x={54} y={-1} className="pil-tier-note">
          {t('organ.kidney.rampKey')}
        </text>
      </g>
    </>
  )
}

function fmtFrac(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)} %`
}
