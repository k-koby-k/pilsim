/**
 * Bench results.
 *
 * Demo moment 1 lives here. The point of the combination bench is that nothing
 * in the code says dual RAAS blockade should rank last, or that half-doses of
 * two drugs should beat a double dose of one — the arms are enumerated
 * mechanically in presets.ts and the ordering is whatever the engine and the
 * scorer produce. So this panel prints the ordering and then *reads it back*
 * rather than asserting the expected answer: if dual RAAS does not land last,
 * the callout says so.
 */

import { useMemo } from 'react'
import { useT } from '../../i18n'
import { BarChart, type BarRow } from './charts'
import { RankedList, ScoringUnavailable } from './RankedList'
import { DUAL_RAAS_ARM_ID } from './presets'
import type { BenchState } from './useBench'

function isCombination(id: string) {
  return id.includes('__')
}

export function BenchPanel({
  bench,
  title,
  intro,
  readback = 'combination',
}: {
  bench: BenchState
  title: string
  intro?: string
  readback?: 'combination' | 'dose' | 'none'
}) {
  const t = useT()
  const order = useMemo(() => {
    if (bench.ranked?.length) {
      return bench.ranked.map((r) => r.regimen?.id ?? '')
    }
    // RunSummary.deltaSbp is a REDUCTION — bigger is better, so descending.
    return [...bench.arms]
      .sort((a, b) => b.summary.deltaSbp - a.summary.deltaSbp)
      .map((a) => a.regimen.id)
  }, [bench.ranked, bench.arms])

  const rankedByScorer = !!bench.ranked?.length

  const effRows: BarRow[] = useMemo(
    () =>
      [...bench.arms]
        .sort((a, b) => b.summary.deltaSbp - a.summary.deltaSbp)
        .map((a) => ({
          id: a.regimen.id,
          label: a.regimen.label,
          value: a.summary.deltaSbp,
          color: isCombination(a.regimen.id) ? 'var(--sim-a)' : 'var(--sim-e)',
          highlight: a.regimen.id === DUAL_RAAS_ARM_ID,
          annotation:
            a.edemaP > 0.005 ? `oedema ${Math.round(a.edemaP * 100)} %` : undefined,
        })),
    [bench.arms],
  )

  const readbackText = useMemo(() => {
    if (readback === 'none' || !bench.done || !order.length) return null

    if (readback === 'combination') {
      const dualIdx = order.indexOf(DUAL_RAAS_ARM_ID)
      const lines: string[] = []
      if (dualIdx === -1) {
        lines.push('Dual RAAS blockade (lisinopril + losartan) was not present in this comparison set.')
      } else if (dualIdx === order.length - 1) {
        lines.push(
          `Dual RAAS blockade ranks LAST of ${order.length} arms — position ${dualIdx + 1}. Nothing in the ` +
            'code says it should. Both drugs act on one saturating pathway, so the second drug buys almost ' +
            'nothing while its own risks add.',
        )
      } else {
        lines.push(
          `Dual RAAS blockade ranks ${dualIdx + 1} of ${order.length}, not last. That is the model's ` +
            'answer under the current weights, and it is reported as found rather than adjusted.',
        )
      }

      // half-of-two vs double-of-one, read off the same ordering
      const firstCombo = order.findIndex(isCombination)
      const firstMono = order.findIndex((id) => id && !isCombination(id))
      if (firstCombo !== -1 && firstMono !== -1) {
        lines.push(
          firstCombo < firstMono
            ? `The best combination arm (position ${firstCombo + 1}) outranks the best double-dose ` +
              `monotherapy (position ${firstMono + 1}): half-doses of two drugs beat a double dose of one.`
            : `The best double-dose monotherapy (position ${firstMono + 1}) outranks the best combination ` +
              `arm (position ${firstCombo + 1}) under the current weights.`,
        )
      }
      return lines
    }

    if (readback === 'dose') {
      const lines: string[] = []
      // The asymmetry itself, stated from the two arms regardless of ranking:
      // efficacy rises sub-linearly, visible harm supra-linearly.
      const byDose = [...bench.arms].sort((a, b) => a.summary.deltaSbp - b.summary.deltaSbp)
      const lo = byDose[byDose.length - 2]
      const hi = byDose[byDose.length - 1]
      if (lo && hi && hi !== lo) {
        const dEff = hi.summary.deltaSbp - lo.summary.deltaSbp
        const dHarm = (hi.edemaP - lo.edemaP) * 100
        lines.push(
          `${hi.regimen.label} against ${lo.regimen.label}: ${dEff.toFixed(1)} mmHg more systolic ` +
            `reduction, and ${dHarm.toFixed(1)} more points of oedema incidence. Efficacy rises ` +
            'sub-linearly, visible harm supra-linearly. That asymmetry is why the product recommends ' +
            'a best dose rather than a maximum.',
        )
      }

      const arm = bench.arms.find((a) => a.regimen.id === order[0])
      const biggestDrop = byDose[byDose.length - 1]
      if (arm && biggestDrop) {
        lines.push(
          arm.regimen.id === biggestDrop.regimen.id
            ? `The top-ranked arm is also the one with the largest blood-pressure drop ` +
              `(${biggestDrop.summary.deltaSbp.toFixed(1)} mmHg). The spec treats that as a smoke test: ` +
              'if the scoring never returns a sub-maximal dose for any archetype, the scoring is broken. ' +
              'Reported as found, not adjusted — try lowering the safety floor or raising the oedema ' +
              'severity weight and watch this move.'
            : `The top-ranked arm is ${arm.regimen.label} at ${arm.summary.deltaSbp.toFixed(1)} mmHg, not ` +
              `${biggestDrop.regimen.label} at ${biggestDrop.summary.deltaSbp.toFixed(1)} mmHg. ` +
              'The product recommends a best dose, not a maximum.',
        )
      }
      return lines
    }
    return null
  }, [readback, bench.done, bench.arms, order])

  return (
    <section className="sim-card sim-bench" aria-label={title}>
      <header className="sim-bench-head">
        <h3 className="sim-card-title">{title}</h3>
        {intro && <p className="sim-prose sim-muted">{intro}</p>}
        {bench.denominator && (
          <p className="sim-searchspace">
            <span>{t('sim.common.comparisonSet')}</span> {bench.denominator}
          </p>
        )}
      </header>

      {bench.running && (
        <div
          className="sim-progress sim-progress-wide"
          role="progressbar"
          aria-valuenow={Math.round(bench.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.round(bench.progress * 100)}%` }} />
        </div>
      )}

      {bench.error && <p className="sim-inline-warn">{t('sim.bench.failed', { error: bench.error })}</p>}

      {bench.synthetic && bench.done && (
        <p className="sim-inline-warn">{t('sim.bench.syntheticWarning')}</p>
      )}

      {bench.singleArm && bench.done && (
        <p className="sim-inline-warn">{t('sim.bench.singleArmWarning')}</p>
      )}

      {!!readbackText?.length && (
        <div className="sim-readback">
          <h4>{t('sim.bench.orderingSays')}</h4>
          {readbackText.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      )}

      {rankedByScorer ? (
        <RankedList
          options={bench.ranked ?? []}
          highlights={{ [DUAL_RAAS_ARM_ID]: 'bad' }}
          // Same key TopCombinationsPanel tags this arm with, so the two panels
          // cannot name one thing two ways — and so it is not English-only here
          // while the tag two zones up is translated.
          notes={{ [DUAL_RAAS_ARM_ID]: t('sim.topcombos.tagDualRaas') }}
        />
      ) : (
        bench.done && (
          <>
            <ScoringUnavailable reason={bench.scoringError} />
            <div className="sim-fallback-order">
              <h4>{t('sim.bench.bpEffectOnly')}</h4>
              <p className="sim-prose sim-muted">{t('sim.bench.effectOnlyNote')}</p>
              <BarChart
                rows={effRows}
                valueLabel={t('sim.chart.systolicReductionLabel')}
                formatValue={(v) => `−${Math.round(v)} mmHg`}
              />
            </div>
          </>
        )
      )}
    </section>
  )
}
