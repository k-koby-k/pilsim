/**
 * The human figure and its mechanism panels, driven by one EffectFrame.
 *
 * PUBLIC PROP SURFACE — deliberately just `{ frame: EffectFrame | null }`.
 * Everything else is optional and defaulted, so a caller can render this with
 * nothing but a frame. `frame === null` means no run is in progress: the figure
 * falls back to a resting untreated baseline and says so, rather than pretending
 * to show simulation output.
 */

import { useMemo, type ReactNode } from 'react'
import type { DrugId, EffectFrame } from '../../types'
import { useT } from '../../i18n/useT'
import './organs.css'
import { BadgeStrip, useCoughEvents } from './Badges'
import { BodyFigure } from './BodyFigure'
import { ChemistryGauges } from './Gauges'
import { LiverReactors } from './Liver'
import { Nephron } from './Kidney'
import { RaasCascade } from './Adrenal'
import { EdemaExplainer } from './Periphery'
import { ResistanceUnit } from './Vessels'
import { SelectivityPanel } from './Selectivity'
import {
  baselineFrame,
  cloud,
  DRUGS,
  DRUG_ORDER,
  FALLBACK_REF,
  onBoard,
  sig,
  T1_CELL_POPULATION,
  type RefRanges,
} from './channels'

export interface OrganFigureProps {
  /** The only required prop. Null when no simulation is running. */
  frame: EffectFrame | null
  /**
   * 'full'   — mechanism panels beside the figure.
   * 'figure' — the body alone, sized by its own aspect ratio.
   * 'rail'   — the body alone, filling the height of the column it is given, with a
   *            one-line head. For a page where the figure is a permanent fixture rather
   *            than a panel in the flow.
   */
  variant?: 'full' | 'figure' | 'rail'
  /** Laboratory reference bounds, ideally from data/patient_model.json. */
  refRanges?: RefRanges
  /** Hard gates from the rules engine (§13). */
  gates?: { pregnancyBarrier?: boolean; disqualified?: boolean; note?: string }
  /** Caption shown above the figure, e.g. the regimen under test. */
  caption?: string
  className?: string
}

export function OrganFigure({
  frame,
  variant = 'full',
  refRanges = FALLBACK_REF,
  gates,
  caption,
  className,
}: OrganFigureProps) {
  const t = useT()
  const idle = frame === null
  const f = useMemo(() => frame ?? baselineFrame(), [frame])
  const coughing = useCoughEvents(frame)

  const onBoardDrugs = DRUG_ORDER.filter((d) => onBoard(f.conc?.[d], d))
  // A frame with nothing on board is a starting physiology, not a point on a dose curve,
  // so it must not print a clock "since first dose" for a dose that was never given.
  const untreated = !idle && onBoardDrugs.length === 0 && f.t_h === 0

  // One line, whichever state the figure is in. The full sentence it replaces said the
  // same thing three times over; what a reader needs is the state, not the essay.
  //
  // The clock is `organ.scene.clockStatus` — the SAME key the scene view renders, so the
  // two figures cannot drift apart and the line is translated in all three languages.
  // It used to be a hardcoded English template here, which meant a Uzbek or Russian
  // reader saw the scene's clock translated and this one not.
  const status = idle
    ? t('organ.figure.restingBaseline')
    : untreated
      ? t('organ.figure.untreated')
      : t('organ.scene.clockStatus', { t: f.t_h.toFixed(1) })

  if (variant === 'rail') {
    return (
      <div className={`pil-organ-figure pil-organ-figure-rail${className ? ` ${className}` : ''}`}>
        <header className="pil-rail-head">
          <h3>{caption ?? t('organ.figure.testSubject')}</h3>
          {onBoardDrugs.length > 0 ? (
            <DrugLegend frame={f} active={onBoardDrugs} />
          ) : (
            <p className="pil-rail-status">{status}</p>
          )}
        </header>
        {gates?.disqualified && (
          <div className="pil-gate-banner" role="alert">
            <strong>{t('organ.figure.haltedShort')}</strong>{' '}
            {gates.note ?? t('organ.figure.contraindicatedNote')}
          </div>
        )}
        <div className="pil-figure-body">
          <div className="pil-figure-col">
            <BodyFigure
              frame={f}
              coughing={coughing}
              disqualified={Boolean(gates?.disqualified)}
              pregnancyBarrier={Boolean(gates?.pregnancyBarrier)}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`pil-organ-figure pil-organ-figure-${variant}${className ? ` ${className}` : ''}`}>
      <header className="pil-figure-head">
        <div className="pil-figure-title">
          <h3>{caption ?? t('organ.figure.testSubject')}</h3>
          <p className={idle || untreated ? 'pil-idle-note' : 'pil-clock'}>{status}</p>
        </div>
        <DrugLegend frame={f} active={onBoardDrugs} />
      </header>

      {gates?.disqualified && (
        <div className="pil-gate-banner" role="alert">
          <strong>{t('organ.figure.haltedFull')}</strong>{' '}
          {gates.note ?? t('organ.figure.contraindicatedNote')}
        </div>
      )}

      <div className="pil-figure-body">
        <div className="pil-figure-col">
          <BodyFigure
            frame={f}
            coughing={coughing}
            disqualified={Boolean(gates?.disqualified)}
            pregnancyBarrier={Boolean(gates?.pregnancyBarrier)}
          />
        </div>

        {variant === 'full' && (
          <div className="pil-panel-col">
            <Panel
              title={t('organ.figure.kidneyPanelTitle')}
              note={t('organ.figure.kidneyPanelNote')}
            >
              <Nephron frame={f} />
              <p className="pil-t1-note">
                <strong>{T1_CELL_POPULATION.cellPopulation}</strong> {t('organ.figure.t1NoteMid')}{' '}
                {T1_CELL_POPULATION.evidence}. {T1_CELL_POPULATION.source}. {t('organ.figure.t1NoteTail')}
              </p>
            </Panel>

            <Panel title={t('organ.figure.liverPanelTitle')} note={t('organ.figure.liverPanelNote')}>
              <LiverReactors frame={f} />
            </Panel>

            <SelectivityPanel frame={f} />

            <Panel title={t('organ.figure.raasPanelTitle')} note={t('organ.figure.raasPanelNote')}>
              <RaasCascade frame={f} />
            </Panel>

            <Panel
              title={t('organ.figure.resistancePanelTitle')}
              note={t('organ.figure.resistancePanelNote')}
            >
              <svg viewBox="0 0 640 240" className="pil-resistance-svg" role="img" aria-label={t('organ.figure.resistancePanelTitle')}>
                <ResistanceUnit frame={f} x={26} y={8} />
              </svg>
            </Panel>

            <ChemistryGauges frame={f} ref={refRanges} />
            <BadgeStrip frame={frame} ranges={refRanges} />
            <EdemaExplainer frame={f} />

            <p className="pil-disclaimer">{t('organ.figure.disclaimer')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="pil-panel">
      <h4 className="pil-panel-title">{title}</h4>
      {note && <p className="pil-panel-note">{note}</p>}
      {children}
    </section>
  )
}

/** V12 sprite clouds, reduced to a legend strip so the viewer can see what is on board. */
function DrugLegend({ frame, active }: { frame: EffectFrame; active: DrugId[] }) {
  const t = useT()
  return (
    <ul className="pil-drug-legend">
      {active.length === 0 && <li className="pil-drug-none">{t('organ.figure.noDrugOnBoard')}</li>}
      {active.map((d) => {
        const c = sig(frame.conc?.[d])
        const spec = cloud(d, c)
        return (
          <li key={d} style={{ borderColor: DRUGS[d].hue }}>
            <span className="pil-drug-swatch" style={{ background: DRUGS[d].hue, opacity: spec?.opacity ?? 0.5 }} />
            <span className="pil-drug-name">{DRUGS[d].label}</span>
            <span className="pil-drug-conc">{c === null ? '—' : `${c.toFixed(1)} ng/mL`}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default OrganFigure
