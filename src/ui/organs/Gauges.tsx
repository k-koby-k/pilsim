/**
 * Composite chemistry gauges — research/04-ORGAN-EFFECT-MAP.md §7.5.
 *
 * The potassium gauge is a first-class element because two drugs in the set push K+ in
 * OPPOSITE directions: a thiazide wastes it, a RAAS blocker retains it, and on a
 * lisinopril + HCTZ combination the two effects partly cancel. That cancellation is the
 * pharmacological rationale for the real fixed-dose combination product.
 *
 * Zone thresholds are conventional laboratory reference bounds and are read from
 * data/patient_model.json where it has loaded; the fallbacks are marked as such.
 */

import type { EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import { clamp, FALLBACK_REF, ION, norm, ORGAN, sig, type RefRanges } from './channels'

export interface GaugeProps {
  frame: EffectFrame
  ref?: RefRanges
}

type Zone = 'low' | 'normal' | 'high' | 'unmodelled'

function zoneOf(v: number | null, lo: number, hi: number): Zone {
  if (v === null) return 'unmodelled'
  return v < lo ? 'low' : v > hi ? 'high' : 'normal'
}

export function ChemistryGauges({ frame, ref = FALLBACK_REF }: GaugeProps) {
  const t = useT()
  const k = sig(frame.chem?.serum_k)
  const na = sig(frame.chem?.serum_na)
  const urate = sig(frame.chem?.serum_urate)
  const scr = sig(frame.chem?.serum_creatinine)

  return (
    <div className="pil-gauges">
      <Gauge
        label={t('organ.gauges.potassiumLabel')}
        value={k}
        unit="mmol/L"
        digits={2}
        bounds={ref.kGauge}
        lo={ref.kLow}
        hi={ref.kHigh}
        colour={ION.K.colour}
        note={t('organ.gauges.potassiumNote')}
      />
      <Gauge
        label={t('organ.gauges.urateLabel')}
        value={urate}
        unit="mg/dL"
        digits={2}
        bounds={ref.urateGauge}
        lo={0}
        hi={ref.urateHigh}
        colour={ION.urate.colour}
        note={t('organ.gauges.urateNote')}
      />
      <Gauge
        label={t('organ.gauges.sodiumLabel')}
        value={na}
        unit="mmol/L"
        digits={0}
        bounds={[120, 155]}
        lo={ref.naLow}
        hi={ref.naHigh}
        colour={ION.Na.colour}
        note={t('organ.gauges.sodiumNote')}
      />
      <Gauge
        label={t('organ.gauges.creatinineLabel')}
        value={scr}
        unit="mg/dL"
        digits={2}
        bounds={[0.4, 3.0]}
        lo={0.6}
        hi={1.2}
        colour={ORGAN.creatinine}
        note="ATLAS: creatinine increased in 10 % on high-dose lisinopril vs 7 % on low dose."
      />
    </div>
  )
}

export function Gauge({
  label,
  value,
  unit,
  digits,
  bounds,
  lo,
  hi,
  colour,
  note,
}: {
  label: string
  value: number | null
  unit: string
  digits: number
  bounds: [number, number]
  lo: number
  hi: number
  colour: string
  note?: string
}) {
  const t = useT()
  const zone = zoneOf(value, lo, hi)
  const pos = value === null ? null : clamp(norm(value, bounds[0], bounds[1]), 0, 1)
  const loPos = norm(lo, bounds[0], bounds[1])
  const hiPos = norm(hi, bounds[0], bounds[1])

  return (
    <div className={`pil-gauge pil-gauge-${zone}`} title={note}>
      <div className="pil-gauge-head">
        <span className="pil-gauge-label">{label}</span>
        <span className="pil-gauge-value">{value === null ? t('organ.gauges.notModelled') : `${value.toFixed(digits)} ${unit}`}</span>
      </div>
      <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="pil-gauge-bar">
        <rect x={0} y={5} width={200} height={6} rx={3} className="pil-meter-track" />
        {/* the reference band — where this value is supposed to sit */}
        <rect
          x={loPos * 200}
          y={5}
          width={Math.max(0, (hiPos - loPos) * 200)}
          height={6}
          rx={3}
          className="pil-gauge-ref-band"
        />
        {pos !== null && <rect x={pos * 200 - 1.6} y={1} width={3.2} height={14} rx={1.6} fill={colour} />}
      </svg>
      <div className="pil-gauge-scale">
        <span>{bounds[0]}</span>
        <span className="pil-gauge-ref">
          {t('organ.gauges.reference')} {lo}–{hi}
        </span>
        <span>{bounds[1]}</span>
      </div>
    </div>
  )
}
