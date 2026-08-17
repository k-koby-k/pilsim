/**
 * BETA-1 / BETA-2 SELECTIVITY PANEL.
 *
 * beta1_occupancy and beta2_occupancy are separate bus fields for exactly this reason:
 * metoprolol's beta-1 selectivity is lost above 300 nmol/L = 80.2 ng/mL, and a CYP2D6
 * poor metaboliser crosses that at a standard dose while a normal metaboliser does not.
 * Genotype turns a usable drug into an unsafe one, and this panel is where you see it.
 *
 * Threshold source (Tier 1, CITED):
 *   FDA label, LOPRESSOR (metoprolol tartrate) tablets, DailyMed SPL
 *   0283bc9d-6998-493a-824a-d4c85f704111, retrieved 2026-08-17:
 *   "The relative beta1-selectivity of metoprolol diminishes and blockade of
 *    beta2-adrenoceptors increases at plasma concentration above 300 nmol/L."
 *   300 nmol/L x 0.26736 = 80.2 ng/mL.
 *
 * The measured occupancy range at metoprolol 100 mg b.i.d. is beta1 54-92 % vs
 * beta2 6-38 % in the same subjects — that is the calibration anchor, not a claim
 * this panel invents.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import {
  clamp,
  DRUGS,
  METOPROLOL_BETA2_CROSSOVER_NG_ML,
  METOPROLOL_CROSSOVER_QUOTE,
  METOPROLOL_CROSSOVER_SOURCE,
  sig,
  TINT_ACTIVATED,
} from './channels'
import { OccupancyRing } from './primitives'

/** VISUAL x-axis ceiling for the concentration bar, in ng/mL. */
const CONC_AXIS_MAX = 220

/**
 * Crossing the threshold is the one moment on this panel that is allowed to shout, so it
 * borrows the "+1, stressed" end of the V1 ramp rather than inventing a colour: the same
 * red that means "turned up" everywhere else on the figure.
 */
const CROSSED = TINT_ACTIVATED
const QUIET = 'var(--text-faint, #8a95a3)'

export function SelectivityPanel({ frame }: { frame: EffectFrame }) {
  const t = useT()
  const conc = sig(frame.conc?.metoprolol)
  const beta1 = sig(frame.engagement?.beta1_occupancy)
  const beta2 = sig(frame.engagement?.beta2_occupancy)
  const capFold = sig(frame.liver?.cyp2d6_capacity_fold)
  const hr = sig(frame.haemo?.hr)

  const crossed = conc !== null && conc > METOPROLOL_BETA2_CROSSOVER_NG_ML
  const xThreshold = (METOPROLOL_BETA2_CROSSOVER_NG_ML / CONC_AXIS_MAX) * 560
  const xConc = conc === null ? null : clamp(conc / CONC_AXIS_MAX, 0, 1) * 560

  return (
    <div className={`pil-selectivity${crossed ? ' pil-selectivity-crossed' : ''}`}>
      <h4 className="pil-panel-title">{t('organ.selectivity.title')}</h4>

      <svg viewBox="0 0 640 212" role="img" aria-label={t('organ.selectivity.ariaLabel')}>
        <title>{t('organ.selectivity.svgTitle')}</title>

        {/* dual rings, side by side — the viewer sees selectivity being lost */}
        <g transform="translate(96 62)">
          <OccupancyRing cx={0} cy={0} r={30} value={beta1} colour={DRUGS.metoprolol.hue} label={t('organ.selectivity.beta1Cardiac')} />
        </g>
        <g transform="translate(226 62)">
          <OccupancyRing cx={0} cy={0} r={30} value={beta2} colour={crossed ? CROSSED : QUIET} label={t('organ.selectivity.beta2Airway')} />
        </g>

        <text x={314} y={40} className="pil-label-sub">
          {t('organ.selectivity.measuredAnchor')}
        </text>
        <text x={314} y={58} className="pil-label-sub">
          β1 54–92 % · β2 6–38 %
        </text>
        <text x={314} y={82} className="pil-label-sub">
          {capFold === null ? t('organ.selectivity.cyp2d6NotModelled') : t('organ.selectivity.cyp2d6Value', { value: capFold.toFixed(2) })}
        </text>

        {/* concentration axis with the sourced threshold marked */}
        <g transform="translate(40 152)">
          <rect x={0} y={0} width={560} height={14} rx={7} className="pil-meter-track" />
          {xConc !== null && (
            <rect x={0} y={0} width={xConc} height={14} rx={7} fill={crossed ? CROSSED : DRUGS.metoprolol.hue} opacity={0.9} />
          )}
          <line x1={xThreshold} y1={-9} x2={xThreshold} y2={23} stroke={CROSSED} strokeWidth={2.4} />
          <text x={xThreshold} y={-15} textAnchor="middle" className="pil-threshold-label">
            80.2 ng/mL
          </text>
          <text x={0} y={40} className="pil-label-sub">
            0
          </text>
          <text x={560} y={40} textAnchor="end" className="pil-label-sub">
            {CONC_AXIS_MAX} ng/mL
          </text>
          <text x={280} y={40} textAnchor="middle" className="pil-label-sub">
            metoprolol {conc === null ? '—' : `${conc.toFixed(1)} ng/mL`}
          </text>
        </g>
      </svg>

      <p className={crossed ? 'pil-warn-text' : 'pil-ok-text'}>
        {conc === null
          ? t('organ.selectivity.concNotModelled')
          : crossed
            ? t('organ.selectivity.aboveCrossover', {
                suffix: hr !== null && hr < 50 ? t('organ.selectivity.bradycardicSuffix') : '',
              })
            : t('organ.selectivity.belowCrossover')}
      </p>

      <details className="pil-source-details">
        <summary>{t('organ.selectivity.sourceSummary')}</summary>
        <p>{METOPROLOL_CROSSOVER_QUOTE}</p>
        <p className="pil-source">{METOPROLOL_CROSSOVER_SOURCE}</p>
        <p className="pil-source">{t('organ.selectivity.sourceNote')}</p>
      </details>
    </div>
  )
}
