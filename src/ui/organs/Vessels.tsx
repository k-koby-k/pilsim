/**
 * ARTERIES AND ARTERIOLES — research/04-ORGAN-EFFECT-MAP.md §6.
 *
 * Three vessel classes are drawn separately because the drugs hit them differently,
 * and that difference IS the amlodipine oedema story (§11.1):
 *   conduit arteries   base_px 14
 *   precapillary arterioles (the SVR element) base_px 6
 *   postcapillary venules base_px 8  <- amlodipine barely touches these
 *
 * Tier T3 throughout. HPA tissue specificity for CACNA1C is intestine (25.0 nTPM) and for
 * AGTR1 is liver/placenta — vascular localisation of both is classical pharmacology, not
 * cell-resolved here. No cell population is named.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { bip, clamp, DRUGS, flow, lumen, norm, onBoard, ORGAN, sig, sigOr, VESSEL_BASE_PX } from './channels'
import { OccupancyRing, OrganLabel, Stream, TintStroke } from './primitives'

/**
 * The V6 lumen values are 4-13 px, sized for the whole-body figure. The resistance-unit
 * inset is drawn in a 640-unit panel, so the SAME clamped index is multiplied by a display
 * constant to keep the arteriole/venule asymmetry visible at panel scale. Presentation only.
 */
const VESSEL_DISPLAY = 2.6

export interface VesselProps {
  frame: EffectFrame
  x: number
  y: number
  scale?: number
  labels?: boolean
}

/** The aorta and its iliac branches, drawn down the midline of the figure. */
export function Conduit({ frame, x, y, scale = 1 }: VesselProps) {
  const t = useT()
  const idx = sig(frame.haemo?.arteriolar_radius_index)
  const co = sig(frame.haemo?.cardiac_output)
  const svr = sig(frame.haemo?.svr)

  // Conduit arteries follow the systemic tone only weakly; use half the index deflection.
  const conduitIdx = idx === null ? null : 1 + (clamp(idx, 0.7, 1.6) - 1) * 0.4
  const w = lumen(VESSEL_BASE_PX.conduit, conduitIdx) ?? VESSEL_BASE_PX.conduit
  const svrT = svr === null ? null : bip(norm(svr, 700, 2200), 0.5, 0.5)
  const f = flow(co === null ? null : norm(co, 2.5, 8.0), 260)

  const aorta = 'M 0 0 C 4 60 2 120 0 178'
  const iliacL = 'M 0 178 C -8 196 -22 214 -30 246'
  const iliacR = 'M 0 178 C 8 196 22 214 30 246'

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-conduit">
      <title>{t('organ.vessels.conduitTitle')}</title>
      {[aorta, iliacL, iliacR].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke={ORGAN.artery} strokeWidth={w} strokeLinecap="round" />
          <TintStroke d={d} t={svrT} width={w} gain={0.28} />
        </g>
      ))}
      {f && (
        <>
          <Stream d={aorta} count={f.count} durationS={f.durationS} colour={ORGAN.perfusion} r={1.5} opacity={0.75} />
          <Stream d={iliacL} count={Math.round(f.count / 2)} durationS={f.durationS} colour={ORGAN.perfusion} r={1.3} opacity={0.7} />
          <Stream d={iliacR} count={Math.round(f.count / 2)} durationS={f.durationS} colour={ORGAN.perfusion} r={1.3} opacity={0.7} />
        </>
      )}
    </g>
  )
}

/**
 * The resistance unit: precapillary arteriole -> capillary bed -> postcapillary venule.
 *
 * This inset is where the viewer can literally see why a dihydropyridine causes oedema:
 * the arteriole widens hard while the venule does not, so capillary hydrostatic pressure
 * rises and fluid leaves the capillary at gravitationally dependent sites (§11.1).
 * It is NOT salt and water retention — which is why a diuretic does not fix it.
 */
export function ResistanceUnit({ frame, x, y, scale = 1 }: VesselProps) {
  const t = useT()
  const artIdx = sig(frame.haemo?.arteriolar_radius_index)
  const venIdx = sig(frame.haemo?.venous_tone_index)
  const capP = sig(frame.haemo?.capillary_hydrostatic_p)
  const cav = sig(frame.engagement?.cav12_block_vsmc)
  const at1 = sig(frame.engagement?.at1_blockade)
  const acePlasma = sig(frame.engagement?.ace_inhibition_plasma)
  const bkFold = sigOr(frame.mediators?.bradykinin_fold, 1.0)

  const artW = lumen(VESSEL_BASE_PX.arteriole, artIdx) ?? VESSEL_BASE_PX.arteriole
  const venW = lumen(VESSEL_BASE_PX.venule, venIdx) ?? VESSEL_BASE_PX.venule

  // §6.3 — the same blue = turned down convention as everywhere.
  const artT = artIdx === null ? null : bip(clamp(artIdx, 0.7, 1.6), 1.0, 0.45) * -1
  const venT = venIdx === null ? null : bip(clamp(venIdx, 0.7, 1.6), 1.0, 0.45) * -1

  // Lisinopril only: bradykinin along the endothelium. Losartan deliberately has none.
  const lisOn = onBoard(frame.conc?.lisinopril, 'lisinopril')
  const bk = lisOn ? 0.3 * norm(bkFold, 1.0, 3.0) : 0

  // Drawn directly in the 640-unit panel space every other mechanism panel uses, so the
  // captions here are the same size as the captions on the nephron. Vessel calibre is the
  // §3 V6 value scaled for display only — the binding and its clamp are untouched.
  const dArt = 'M 10 92 L 210 92'
  const dCap = 'M 210 92 C 258 44 328 44 376 92'
  const dVen = 'M 376 92 L 578 92'

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="pil-organ pil-resistance-unit">
      <title>{t('organ.vessels.resistanceTitle')}</title>

      {/* endothelial bradykinin — lisinopril only */}
      {bk > 0.01 && (
        <rect x={0} y={62} width={584} height={60} rx={30} fill={DRUGS.lisinopril.hue} opacity={bk} className="pil-haze" />
      )}

      <path d={dArt} stroke={ORGAN.artery} strokeWidth={artW * VESSEL_DISPLAY} strokeLinecap="round" fill="none" />
      <TintStroke d={dArt} t={artT} width={artW * VESSEL_DISPLAY} />
      <path d={dCap} stroke={ORGAN.artery} strokeOpacity={0.6} strokeWidth={5} fill="none" />
      <path d={dVen} stroke={ORGAN.vein} strokeWidth={venW * VESSEL_DISPLAY} strokeLinecap="round" fill="none" />
      <TintStroke d={dVen} t={venT} width={venW * VESSEL_DISPLAY} />

      <OrganLabel x={10} y={50} text={t('organ.vessels.precapillary')} sub={artIdx === null ? t('organ.vessels.notModelled') : t('organ.vessels.timesBaseline', { value: artIdx.toFixed(2) })} />
      <OrganLabel x={578} y={50} anchor="end" text={t('organ.vessels.postcapillary')} sub={venIdx === null ? t('organ.vessels.notModelled') : t('organ.vessels.timesBaseline', { value: venIdx.toFixed(2) })} />

      {/* Capillary hydrostatic pressure — the link to §11. PROXY, no absolute unit. */}
      <g className="pil-cap-pressure">
        <text x={293} y={20} textAnchor="middle" className="pil-label-sub">
          {t('organ.vessels.capillaryPressureLabel')}{' '}
          {capP === null ? t('organ.vessels.capillaryPressureNotModelled') : t('organ.vessels.capillaryPressureValue', { value: (capP / 25).toFixed(2) })}
        </text>
      </g>

      {/* Receptor / channel icons with V11 rings */}
      <g transform="translate(96 158)">
        <OccupancyRing cx={0} cy={0} r={15} value={cav} colour={DRUGS.amlodipine.hue} label="Cav1.2" />
      </g>
      <g transform="translate(293 158)">
        <OccupancyRing cx={0} cy={0} r={15} value={at1} colour={DRUGS.losartan.hue} label="AT1" />
      </g>
      <g transform="translate(490 158)">
        <OccupancyRing cx={0} cy={0} r={15} value={acePlasma} colour={DRUGS.lisinopril.hue} label="ACE" />
      </g>
      <text x={293} y={216} textAnchor="middle" className="pil-tier-note">
        {t('organ.vessels.tierNote')}
      </text>
    </g>
  )
}
