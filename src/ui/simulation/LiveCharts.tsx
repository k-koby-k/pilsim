/**
 * Frames -> chart series.
 *
 * The one detail that matters most here: the shared concentration axis carries
 * EXP3174, never losartan parent. See PEAK_TO_TROUGH_NOTE in presets.ts for
 * why. The parent is available on its own axis behind a toggle, which is the
 * only honest way to show it at all.
 *
 * Every colour is a token. A drug keeps one hue across every chart on the page,
 * so the reader learns it once; the haemodynamic and engagement channels sit on
 * a separate, deliberately quieter set so they cannot be mistaken for drugs.
 */

import { useMemo } from 'react'
import type { DrugId, EffectFrame } from '../../types'
import { useT, type DictKey } from '../../i18n'
import { LineChart, type Series, type ThresholdLine } from './charts'
import {
  DRUG_COLOR,
  DRUG_LABEL,
  DRUG_SHORT,
  PARENT_ONLY_DRUGS,
  PEAK_TO_TROUGH_NOTE,
  PLOTTED_DRUGS,
} from './presets'
import { METOPROLOL_BETA1_SELECTIVITY_NG_ML } from './stubEngine'

export interface Overlay {
  id: string
  label: string
  frames: EffectFrame[]
}

function decimate<T>(arr: T[], maxPoints = 900): T[] {
  if (arr.length <= maxPoints) return arr
  const step = Math.ceil(arr.length / maxPoints)
  const out: T[] = []
  for (let i = 0; i < arr.length; i += step) out.push(arr[i])
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1])
  return out
}

/**
 * `compared` marks the live run when dashed overlays share the plot, so the
 * solid curve is named "· this run" — the same words the threshold callout
 * below the chart uses for it. Without that the live metoprolol trace and the
 * dashed one from the other genotype read as the same unnamed thing.
 */
function concSeries(
  frames: EffectFrame[],
  drugs: DrugId[],
  opts: { overlay?: { label: string }; compared?: boolean; thisRunSuffix?: string } = {},
): Series[] {
  const { overlay, compared, thisRunSuffix = ' · this run' } = opts
  const f = decimate(frames)
  const present = drugs.filter((d) => frames.some((fr) => fr.conc[d] > 0))
  return present.map((d) => ({
    id: `${d}${overlay ? `—${overlay.label}` : ''}`,
    label: overlay ? `${DRUG_LABEL[d]} — ${overlay.label}` : DRUG_LABEL[d],
    // With one drug in an overlay run the run's own name is the clearer label;
    // with several the drug has to be named too or the labels collide in meaning.
    shortLabel: overlay
      ? present.length > 1
        ? `${DRUG_SHORT[d]} · ${overlay.label}`
        : overlay.label
      : compared
        ? `${DRUG_SHORT[d]}${thisRunSuffix}`
        : DRUG_SHORT[d],
    color: DRUG_COLOR[d],
    dashed: !!overlay,
    points: f.map((fr) => ({ x: fr.t_h, y: fr.conc[d] })),
  }))
}

export function ConcentrationChart({
  frames,
  overlays = [],
  logScale,
  showParent,
  cursorX,
}: {
  frames: EffectFrame[]
  overlays?: Overlay[]
  logScale: boolean
  showParent: boolean
  cursorX?: number | null
}) {
  const t = useT()
  const thisRunSuffix = t('sim.chart.thisRunSuffix')
  const series = useMemo(() => {
    const base = concSeries(frames, PLOTTED_DRUGS, { compared: overlays.length > 0, thisRunSuffix })
    const extra = overlays.flatMap((o) =>
      concSeries(o.frames, PLOTTED_DRUGS, { overlay: { label: o.label } }).map((s) => ({
        ...s,
        id: `${s.id}-${o.id}`,
      })),
    )
    return [...base, ...extra]
  }, [frames, overlays, thisRunSuffix])

  const metoprololPresent =
    frames.some((f) => f.conc.metoprolol > 0) || overlays.some((o) => o.frames.some((f) => f.conc.metoprolol > 0))

  const thresholds: ThresholdLine[] = metoprololPresent
    ? [
        {
          y: METOPROLOL_BETA1_SELECTIVITY_NG_ML,
          label: 'β1-selectivity threshold — 80.2 ng/mL (300 nmol/L)',
          color: 'var(--sim-threshold)',
        },
      ]
    : []

  // Demo moment 2 made explicit: say in words whether the line was crossed.
  const crossings = useMemo(() => {
    if (!metoprololPresent) return []
    const rows: { label: string; crossed: boolean; peak: number }[] = []
    const check = (label: string, fs: EffectFrame[]) => {
      const peak = fs.reduce((m, f) => Math.max(m, f.conc.metoprolol), 0)
      if (peak > 0) rows.push({ label, crossed: peak > METOPROLOL_BETA1_SELECTIVITY_NG_ML, peak })
    }
    check('this run', frames)
    for (const o of overlays) check(o.label, o.frames)
    return rows
  }, [frames, overlays, metoprololPresent])

  return (
    <>
      <LineChart
        title={t('sim.chart.plasmaConcentration')}
        subtitle={t('sim.chart.concSubtitle')}
        series={series}
        xLabel={t('sim.chart.hoursSinceFirstDose')}
        yLabel="ng/mL"
        yScale={logScale ? 'log' : 'linear'}
        thresholds={thresholds}
        cursorX={cursorX}
        emptyMessage={t('sim.chart.emptyConcentration')}
        footnote={PEAK_TO_TROUGH_NOTE}
      />

      {!!crossings.length && (
        <div className="sim-callout">
          <h5 className="sim-callout-head">β1 selectivity, read off the curve</h5>
          <ul className="sim-callout-list">
            {crossings.map((c) => (
              <li key={c.label} className={c.crossed ? 'is-crossed' : 'is-clear'}>
                <span className="sim-callout-tag">{c.crossed ? 'crossed' : 'below'}</span>
                <span>
                  <strong>{c.label}</strong> — metoprolol peak {c.peak.toFixed(1)} ng/mL,{' '}
                  {c.crossed
                    ? 'above 80.2 ng/mL: β1 selectivity is lost at peak.'
                    : 'below 80.2 ng/mL: β1 selectivity is retained.'}
                </span>
              </li>
            ))}
          </ul>
          <p className="sim-note">
            300 nmol/L = 80.2 ng/mL. Tier 1. The asthma rule is a concentration gate, not a ban — which is
            why a CYP2D6 poor metaboliser can cross it at a standard dose while a normal metaboliser does
            not. research/00-DECISIONS.md §7.
          </p>
        </div>
      )}

      {showParent && (
        <LineChart
          title={t('sim.chart.losartanParentTitle')}
          subtitle={t('sim.chart.losartanParentSubtitle')}
          series={concSeries(frames, PARENT_ONLY_DRUGS)}
          xLabel={t('sim.chart.hoursSinceFirstDose')}
          yLabel="ng/mL"
          yScale={logScale ? 'log' : 'linear'}
          cursorX={cursorX}
          emptyMessage={t('sim.chart.noLosartanInRegimen')}
          footnote={t('sim.chart.concParentFootnote')}
        />
      )}
    </>
  )
}

export function HaemodynamicChart({
  frames,
  overlays = [],
  cursorX,
  baseline,
}: {
  frames: EffectFrame[]
  overlays?: Overlay[]
  cursorX?: number | null
  baseline?: { sbp: number; dbp: number } | null
}) {
  const t = useT()
  const series = useMemo(() => {
    const f = decimate(frames)
    const suffix = overlays.length ? t('sim.chart.thisRunSuffix') : ''
    const base: Series[] = [
      {
        id: 'sbp',
        label: t('sim.chart.systolicBp'),
        shortLabel: `${t('sim.chart.systolicShort')}${suffix}`,
        color: 'var(--sim-sbp)',
        points: f.map((x) => ({ x: x.t_h, y: x.haemo.sbp })),
      },
      {
        id: 'dbp',
        label: t('sim.chart.diastolicBp'),
        shortLabel: t('sim.chart.diastolicShort'),
        color: 'var(--sim-dbp)',
        points: f.map((x) => ({ x: x.t_h, y: x.haemo.dbp })),
      },
      {
        id: 'map',
        label: t('sim.chart.meanArterialPressure'),
        shortLabel: t('sim.chart.meanArterialShort'),
        color: 'var(--sim-map)',
        points: f.map((x) => ({ x: x.t_h, y: x.haemo.map })),
      },
      {
        id: 'hr',
        label: t('sim.chart.heartRate'),
        shortLabel: t('sim.chart.heartRate'),
        color: 'var(--sim-hr)',
        points: f.map((x) => ({ x: x.t_h, y: x.haemo.hr })),
      },
    ]
    const extra = overlays.flatMap((o) => {
      const of = decimate(o.frames)
      return [
        {
          id: `sbp-${o.id}`,
          label: `${t('sim.chart.systolicShort')} — ${o.label}`,
          shortLabel: o.label,
          color: 'var(--sim-sbp)',
          dashed: true,
          points: of.map((x) => ({ x: x.t_h, y: x.haemo.sbp })),
        },
      ] as Series[]
    })
    return [...base, ...extra]
  }, [frames, overlays, t])

  const thresholds: ThresholdLine[] = baseline
    ? [
        {
          y: baseline.sbp,
          label: t('sim.chart.untreatedBaselineSystolic', { value: Math.round(baseline.sbp) }),
          color: 'var(--sim-baseline)',
        },
      ]
    : []

  return (
    <LineChart
      title={t('sim.chart.haemodynamicResponse')}
      subtitle={t('sim.chart.haemoSubtitle')}
      series={series}
      xLabel={t('sim.chart.hoursSinceFirstDose')}
      yLabel="mmHg · bpm"
      thresholds={thresholds}
      cursorX={cursorX}
      emptyMessage={t('sim.chart.emptyHaemodynamic')}
    />
  )
}

/**
 * Engagement channels take the hue of the drug that drives them, so a reader who
 * has learned amlodipine's colour on the concentration chart recognises its two
 * calcium-channel traces here without consulting anything.
 */
const ENGAGEMENT_ROWS: {
  key: keyof EffectFrame['engagement']
  labelKey: DictKey
  shortKey: DictKey
  /** Drug name suffix — never translated (see HARD RULES: drug/substance names). */
  drugSuffix: string
  color: string
}[] = [
  {
    key: 'ace_inhibition_plasma',
    labelKey: 'sim.chart.engAceInhibitionPlasma',
    shortKey: 'sim.chart.engShortAce',
    drugSuffix: 'lisinopril',
    color: 'var(--drug-lisinopril)',
  },
  {
    key: 'at1_blockade',
    labelKey: 'sim.chart.engAt1Blockade',
    shortKey: 'sim.chart.engShortAt1',
    drugSuffix: 'losartan + EXP3174',
    color: 'var(--drug-exp3174)',
  },
  {
    key: 'cav12_block_vsmc',
    labelKey: 'sim.chart.engCav12Vessel',
    shortKey: 'sim.chart.engShortCav12Vessel',
    drugSuffix: 'amlodipine',
    color: 'var(--drug-amlodipine)',
  },
  {
    key: 'cav12_block_myocardium',
    labelKey: 'sim.chart.engCav12Heart',
    shortKey: 'sim.chart.engShortCav12Heart',
    drugSuffix: 'amlodipine',
    color: 'var(--sim-amlodipine-2)',
  },
  {
    key: 'ncc_inhibition',
    labelKey: 'sim.chart.engNccInhibition',
    shortKey: 'sim.chart.engShortNcc',
    drugSuffix: 'hydrochlorothiazide',
    color: 'var(--drug-hydrochlorothiazide)',
  },
  {
    key: 'beta1_occupancy',
    labelKey: 'sim.chart.engBeta1Occupancy',
    shortKey: 'sim.chart.engShortBeta1',
    drugSuffix: 'metoprolol',
    color: 'var(--drug-metoprolol)',
  },
  {
    key: 'beta2_occupancy',
    labelKey: 'sim.chart.engBeta2Occupancy',
    shortKey: 'sim.chart.engShortBeta2',
    drugSuffix: 'metoprolol',
    color: 'var(--sim-metoprolol-2)',
  },
]

export function EngagementChart({ frames, cursorX }: { frames: EffectFrame[]; cursorX?: number | null }) {
  const t = useT()
  const series = useMemo(() => {
    const f = decimate(frames)
    return ENGAGEMENT_ROWS.filter((r) => frames.some((fr) => fr.engagement[r.key] > 0.001)).map((r) => ({
      id: r.key as string,
      label: `${t(r.labelKey)} — ${r.drugSuffix}`,
      shortLabel: t(r.shortKey),
      color: r.color,
      points: f.map((fr) => ({ x: fr.t_h, y: fr.engagement[r.key] })),
    }))
  }, [frames, t])

  return (
    <LineChart
      title={t('sim.chart.targetEngagement')}
      subtitle={t('sim.chart.engagementSubtitle')}
      series={series}
      xLabel={t('sim.chart.hoursSinceFirstDose')}
      yLabel={t('sim.chart.fractionEngaged')}
      yMin={0}
      yMax={1}
      cursorX={cursorX}
      emptyMessage={t('sim.chart.emptyEngagement')}
      footnote={t('sim.chart.engagementFootnote')}
    />
  )
}
