/**
 * The scoring-weight sliders.
 *
 * §4.2(b) asks for this explicitly, and the argument is worth restating on
 * screen rather than only in the file: every weight and all eleven
 * adverse-event severity values are ESTIMATED. The ordering is defensible, the
 * exact values are not. So the panel puts the ESTIMATED tag and the spec's own
 * justification next to each slider instead of behind a tooltip.
 *
 * Slider writes land on the scorer's own key names, so re-ranking needs no
 * translation layer and no re-simulation.
 */

import { useMemo, useState } from 'react'
import type { ScoreWeights } from '../../types'
import { useT } from '../../i18n'
import { GROUP_LABEL, SPEC_DEFAULTS, WEIGHT_SPECS, setWeight, type WeightGroup, type WeightSpec } from './weights'
import { defaultWeights } from './scoring'

export function WeightsPanel({
  weights,
  onChange,
  onRescore,
  rescoring,
  note,
}: {
  weights: ScoreWeights
  onChange: (w: ScoreWeights) => void
  onRescore?: () => void
  rescoring?: boolean
  note?: string
}) {
  const t = useT()
  // Only the three composite weights are open on arrival. The other thirty-odd
  // are one click away, which is the right distance for a value nobody needs to
  // touch to get an answer.
  const [open, setOpen] = useState<Record<string, boolean>>({ composite: true })

  const grouped = useMemo(() => {
    const m = new Map<WeightGroup, WeightSpec[]>()
    for (const s of WEIGHT_SPECS) {
      const arr = m.get(s.group) ?? []
      arr.push(s)
      m.set(s.group, arr)
    }
    return [...m.entries()]
  }, [])

  const compositeSum =
    Number(weights.efficacy ?? 0) + Number(weights.safety ?? 0) + Number(weights.appropriateness ?? 0)

  const movedCount = WEIGHT_SPECS.filter(
    (s) => Math.abs(Number(weights[s.key] ?? 0) - Number(SPEC_DEFAULTS[s.key] ?? 0)) > 1e-9,
  ).length

  return (
    <section className="sim-weights" aria-label={t('sim.weights.ariaLabel')}>
      <header className="sim-weights-head">
        <div>
          <p className="sim-prose sim-muted">
            {t('sim.weights.explainerPre')} <span className="tag tag-est">{t('sim.weights.estimatedTag')}</span>
            {t('sim.weights.explainerPost')}
          </p>
          {movedCount > 0 && (
            <p className="sim-inline-warn">{t('sim.weights.movedWarning', { n: movedCount })}</p>
          )}
          {note && <p className="sim-note">{note}</p>}
        </div>
        <div className="sim-weights-actions">
          <button className="btn btn--ghost" onClick={() => onChange(defaultWeights())}>
            {t('sim.weights.resetDefaults')}
          </button>
          {onRescore && (
            <button className="btn btn--primary" onClick={onRescore} disabled={rescoring}>
              {rescoring ? t('sim.weights.rescoring') : t('sim.weights.rescoreRanking')}
            </button>
          )}
        </div>
      </header>

      {Math.abs(compositeSum - 1) > 0.005 && (
        <p className="sim-inline-warn">
          {t('sim.weights.compositeSumWarning', { sum: compositeSum.toFixed(2) })}
        </p>
      )}

      {grouped.map(([group, specs]) => {
        const isOpen = !!open[group]
        return (
          <div className={`sim-wgroup${isOpen ? ' is-open' : ''}`} key={group}>
            <button
              className="sim-wgroup-head"
              onClick={() => setOpen((g) => ({ ...g, [group]: !g[group] }))}
              aria-expanded={isOpen}
            >
              <span className="sim-chevron">{isOpen ? '▾' : '▸'}</span>
              {GROUP_LABEL[group]}
              <span className="sim-wgroup-count">{specs.length}</span>
            </button>
            {isOpen && (
              <div className="sim-wgroup-body">
                {specs.map((s) => {
                  const def = Number(SPEC_DEFAULTS[s.key] ?? 0)
                  const value = Number(weights[s.key] ?? def)
                  const moved = Math.abs(value - def) > 1e-9
                  return (
                    <div className="sim-slider" key={s.key}>
                      <label htmlFor={`w-${s.key}`}>
                        <span className="sim-slider-label">{s.label}</span>
                        <span className={`sim-slider-value${moved ? ' is-moved' : ''}`}>
                          {s.step >= 1 ? value.toFixed(0) : value.toFixed(2)}
                          {moved && <em> {t('sim.weights.specDefault', { def })}</em>}
                        </span>
                      </label>
                      <input
                        id={`w-${s.key}`}
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={value}
                        onChange={(e) => onChange(setWeight(weights, s, Number(e.target.value)))}
                      />
                      <p className="sim-slider-why">
                        <span className="tag tag-est">{t('sim.weights.estimatedTag')}</span>
                        <span className="sim-ref">{s.ref}</span> {s.rationale}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
