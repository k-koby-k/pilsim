/**
 * End-of-run report — research/05-OUTPUT-REPORT-SPEC.md.
 *
 * Reads top to bottom the way a clinical summary does: what happened, stated in
 * a sentence; the headline numbers; why — the rules that fired and the
 * modelling assumptions they carry; then the evidence, the refusals and the
 * limits. Nothing that was on the old screen has been dropped; the order and
 * the weight have changed.
 *
 * Placement rules from §8.4 are structural: the full disclaimer sits at the
 * top, above the scores, never collapsed. Precision follows §7.4 — whole mmHg,
 * whole %, potassium to one decimal, and sourced ranges stay ranges.
 */

import { useMemo } from 'react'
import type { DrugId, RunSummary } from '../../types'
import { useT, type DictKey } from '../../i18n'
import { modellingCaveatChip, type DisclaimerText } from './scoring'
import {
  DRUG_LABEL,
  FIVE_YEAR_WORDING_KEY,
  FORMULATION_STATUS,
  SEVERITY_CLASS,
  STRUCTURAL_LIMITATIONS,
} from './presets'
import type { CompletedRun } from './useSimRunner'
import { useData } from '../../data/DataProvider'
import {
  buildTiming,
  type DoseTimeOfDay,
  type PlanTiming,
  type TimingClaimKind,
  type TimingConfidence,
} from '../../report/timing'
import type { PlanGap } from '../../report/plan'

const RISK_LABEL_KEY: Record<string, DictKey> = {
  angioedema: 'sim.report.riskAngioedema',
  bronchospasm: 'sim.report.riskBronchospasm',
  hyperkalemia: 'sim.report.riskHyperkalemia',
  acute_gfr_drop: 'sim.report.riskAcuteGfrDrop',
  bradycardia: 'sim.report.riskBradycardia',
  hyponatremia: 'sim.report.riskHyponatremia',
  hypokalemia: 'sim.report.riskHypokalemia',
  dizziness_orthostatic: 'sim.report.riskDizzinessOrthostatic',
  hyperuricemia_gout: 'sim.report.riskHyperuricemiaGout',
  peripheral_edema: 'sim.report.riskPeripheralEdema',
  cough: 'sim.report.riskCough',
}

// ---------------------------------------------------------------------------
// Timing — src/report/timing.ts, never rendered before now.
//
// The dose-time-of-day feature: what hour to take each drug, why, and the
// single outcome verdict that has to sit above every one of those hours (see
// `buildTimingOutcomeEvidence` in src/report/timing.ts and the plain-text
// ordering test in src/report/timing.test.ts, "the outcome verdict before
// any suggested hour"). The three claim kinds are colour-coded with the same
// severity tokens the rest of this panel already uses, so a reader learns to
// read the colour once and reuses it here.
// ---------------------------------------------------------------------------

const TIMING_CATEGORY_LABEL_KEY: Record<TimingClaimKind, DictKey> = {
  outcome: 'sim.timing.categoryOutcome',
  tolerability: 'sim.timing.categoryTolerability',
  pharmacokinetic: 'sim.timing.categoryPharmacokinetic',
}

/** Reuses the same severity palette as the rules list — never a new colour. */
const TIMING_CATEGORY_CLASS: Record<TimingClaimKind, string> = {
  outcome: 'sev-major',
  tolerability: 'sev-good',
  pharmacokinetic: 'sev-info',
}

const TIMING_CONFIDENCE_LABEL_KEY: Record<TimingConfidence, DictKey> = {
  high: 'sim.timing.confidenceHigh',
  moderate: 'sim.timing.confidenceModerate',
  low: 'sim.timing.confidenceLow',
}

/**
 * `DoseTimeOfDay` is the real enum `buildTiming` returns — translated here so the four
 * possible answers read in the user's language, while the generated reason sentences
 * (which carry citations, drug names and numbers) stay English like the rest of the report.
 */
const TIMING_TIME_LABEL_KEY: Record<DoseTimeOfDay, DictKey> = {
  morning: 'sim.timing.timeMorning',
  evening: 'sim.timing.timeEvening',
  bedtime: 'sim.timing.timeBedtime',
  any_consistent_time: 'sim.timing.timeAnyConsistent',
}

function TimingCitation({ citation }: { citation?: { source?: string; quote?: string; note?: string } }) {
  if (!citation?.source) return null
  return (
    <span className="sim-cite" title={citation.quote ?? citation.note ?? ''}>
      {citation.source}
    </span>
  )
}

function TimingSection({ timing, t }: { timing: PlanTiming; t: ReturnType<typeof useT> }) {
  return (
    <section className="sim-report-section sim-timing">
      <h4>{t('sim.timing.heading')}</h4>

      {/* THE OUTCOME VERDICT. It must read before any suggested hour below it —
          that ordering is the entire point of how this was researched. */}
      <div className="sim-form-verdict is-neutral sim-timing-outcome">
        <div className="sim-form-head">
          <span className={`sim-sev ${TIMING_CATEGORY_CLASS.outcome}`}>
            {t(TIMING_CATEGORY_LABEL_KEY.outcome)}
          </span>
          <span className="sim-muted">{t(TIMING_CONFIDENCE_LABEL_KEY[timing.outcomeEvidence.confidence])}</span>
        </div>
        {timing.outcomeEvidence.statements.map((s, i) => (
          <p key={i} className="sim-prose">
            {s.text}
          </p>
        ))}
        {timing.outcomeEvidence.citations.map((c, i) => (
          <TimingCitation key={i} citation={c} />
        ))}
      </div>

      {/* Per drug: a real suggested time — "same time every day" counts as one —
          the three kinds of reason behind it, each tagged, cited and confidence-rated. */}
      {timing.drugs.map((d) => (
        <div key={d.substanceId} className="sim-form-verdict is-ranked sim-timing-drug">
          <div className="sim-form-head">
            <strong>{d.name}</strong>
            <span className="sim-timing-suggested">
              {t('sim.timing.suggestedTimeLabel')}: {t(TIMING_TIME_LABEL_KEY[d.suggested])}
            </span>
          </div>
          {d.firstDose && (
            <p className="sim-prose">
              <strong>{t('sim.timing.firstDoseLabel')}: </strong>
              {t(TIMING_TIME_LABEL_KEY[d.firstDose.suggested])}
            </p>
          )}
          <ul className="sim-why-list">
            {d.reasons.map((r, i) => (
              <li key={i}>
                <span className={`sim-sev ${TIMING_CATEGORY_CLASS[r.kind]}`}>
                  {t(TIMING_CATEGORY_LABEL_KEY[r.kind])}
                </span>
                <div>
                  <p className="sim-prose">{r.text}</p>
                  <span className="sim-muted">{t(TIMING_CONFIDENCE_LABEL_KEY[r.confidence])}</span>
                  <TimingCitation citation={r.citation} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function DisclaimerPanel({ text, short }: { text: DisclaimerText; short?: boolean }) {
  const t = useT()
  if (short) {
    return (
      <div className="sim-disclaimer-bar" role="note">
        <span>{text.short_en}</span>
        <span lang="uz">{text.short_uz}</span>
        <span lang="ru">{text.short_ru}</span>
      </div>
    )
  }
  // Rendered from src/report/disclaimer.ts, never retyped: §8 says the wording
  // is normative and not paraphrasable, so the page and the export must share
  // one string.
  return (
    <section className="sim-disclaimer" role="note" aria-label={t('sim.report.disclaimerAria')}>
      <h4>{text.title}</h4>
      {text.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </section>
  )
}

function pct(p: number) {
  return `${Math.round(p * 100)} %`
}

function drugsIn(run: CompletedRun): DrugId[] {
  return [...new Set(run.regimen.doses.map((d) => d.substanceId))]
}

/**
 * RunSummary.deltaSbp is a placebo-corrected REDUCTION, so a positive value
 * means the pressure fell. Rendered as a signed change so nobody reads "+14"
 * as a rise. §7.4: whole mmHg.
 */
export function signedBp(reduction: number): string {
  const change = -Math.round(reduction)
  return change > 0 ? `+${change}` : String(change)
}

/**
 * The report in one sentence.
 *
 * Strictly a restatement of numbers already computed and already printed below
 * it — horizon, initial conditions, population size, the two pressures and the
 * two chemistries. It adds no claim of its own, and deliberately says "changed"
 * rather than anything that could be read as an outcome.
 */
function summaryLede(run: CompletedRun, t: ReturnType<typeof useT>): string {
  const s = run.summary
  const days = run.horizonHours / 24
  const period =
    run.horizonHours >= 48
      ? t('sim.report.periodDays', { days: days % 1 === 0 ? days : Number(days.toFixed(1)) })
      : t('sim.report.periodHours', { h: run.horizonHours })
  const who =
    run.populationN === 1 ? t('sim.report.singleVirtualTwin') : t('sim.report.virtualSubjects', { n: run.populationN })
  const basis = run.initial === 'steady_state' ? t('sim.report.fromSteadyState') : t('sim.report.fromFirstDose')
  return t('sim.report.ledeSentence', {
    period,
    basis,
    regimen: run.regimen.label,
    dsbp: signedBp(s.deltaSbp),
    ddbp: signedBp(s.deltaDbp),
    who,
    k: s.finalChem.serum_k.toFixed(1),
    cr: s.finalChem.serum_creatinine.toFixed(2),
  })
}

function Outcomes({ summary, t }: { summary: RunSummary; t: ReturnType<typeof useT> }) {
  const spread =
    summary.deltaSbpP05 != null && summary.deltaSbpP95 != null
      ? t('sim.report.spreadP', { p05: signedBp(summary.deltaSbpP05), p95: signedBp(summary.deltaSbpP95) })
      : ''
  return (
    <div className="sim-outcomes">
      <div className="sim-stat is-lead">
        <span className="sim-stat-value">{signedBp(summary.deltaSbp)}</span>
        <span className="sim-stat-unit">{t('sim.report.unitSystolic')}</span>
        {spread && <span className="sim-stat-note">{spread}</span>}
      </div>
      <div className="sim-stat">
        <span className="sim-stat-value">{signedBp(summary.deltaDbp)}</span>
        <span className="sim-stat-unit">{t('sim.report.unitDiastolic')}</span>
      </div>
      <div className="sim-stat">
        <span className="sim-stat-value">{summary.finalChem.serum_k.toFixed(1)}</span>
        <span className="sim-stat-unit">{t('sim.report.unitSerumK')}</span>
      </div>
      <div className="sim-stat">
        <span className="sim-stat-value">{summary.finalChem.serum_creatinine.toFixed(2)}</span>
        <span className="sim-stat-unit">{t('sim.report.unitCreatinine')}</span>
      </div>
    </div>
  )
}

/**
 * Which parts of the report to render.
 *
 * The report is not one idea, it is four, and research/10-LAYOUT-BLUEPRINT.md §3
 * puts them in three different zones of the simulation page:
 *
 *   headline → ANSWER   what happened, in a sentence, and the four figures.
 *   why      → EVIDENCE the rules that fired, with their citations, and the
 *                       modelling assumptions those rules carry.
 *   tables   → EVIDENCE steady-state exposure, adverse-event probability, and
 *                       the formulation verdicts including the sourced refusals.
 *   limits   → DETAIL   what the model does not represent, the five-year
 *                       projection wording, twin derivation warnings.
 *
 * Wording, precision and order inside each part are unchanged, and the default
 * is all four in the original order, so rendering <ReportPanel> with no
 * `sections` is exactly the report it always was.
 */
export type ReportSection = 'headline' | 'why' | 'tables' | 'limits'

const ALL_SECTIONS: ReportSection[] = ['headline', 'why', 'tables', 'limits']

export function ReportPanel({
  run,
  disclaimer,
  searchSpaceNote,
  troughToPeak,
  sections = ALL_SECTIONS,
  children,
}: {
  run: CompletedRun
  disclaimer: DisclaimerText
  /** §1 honesty constraint 1: "best" is always relative to a stated comparison set. */
  searchSpaceNote?: string
  /** Trough-to-peak ratio of the EFFECT, measured from the streamed frames. */
  troughToPeak?: number
  /** Which parts to render. Defaults to the whole report, in the original order. */
  sections?: ReportSection[]
  children?: React.ReactNode
}) {
  const t = useT()
  const has = (s: ReportSection) => sections.includes(s)
  const drugs = drugsIn(run)
  const hazards = Object.entries(run.summary.hazards)
    .filter(([, v]) => v > 0.0005)
    .sort((a, b) => b[1] - a[1])

  // The rules that fired and the assumptions they carry. Both come straight
  // from the evaluation this run was executed with; neither is re-derived here.
  const hits = run.modifiers?.hits ?? []
  const caveats = run.modifiers?.caveats ?? []

  // When in the day to take each drug — src/report/timing.ts, built already,
  // rendered nowhere until this panel. Nothing here is computed; `buildTiming`
  // only reads the regimen and the loaded dataset already sitting in context.
  const { data: pilsimData } = useData()
  const timing = useMemo(() => {
    const gaps: PlanGap[] = []
    const plan = buildTiming({
      regimen: run.regimen,
      nameOf: (id: DrugId) => DRUG_LABEL[id] ?? id,
      data: pilsimData,
      gaps,
    })
    return { plan, gaps }
  }, [run.regimen, pilsimData])

  return (
    <section className="sim-report" aria-label={t('sim.report.endOfRunAria')}>
      {/* §8.4 is structural: the full disclaimer sits at the top, above the
          scores, never collapsed. It travels with the headline, so wherever the
          headline is placed the disclaimer is still above the figures. */}
      {has('headline') && (
        <>
          <DisclaimerPanel text={disclaimer} />

          <header className="sim-report-head">
            <p className="sim-eyebrow">{t('sim.report.eyebrow')}</p>
            <h3>{run.regimen.label}</h3>
            <p className="sim-report-meta">
              {t('sim.report.hHorizon', { h: run.horizonHours })} ·{' '}
              {run.initial === 'steady_state' ? t('sim.report.steadyStateInitial') : t('sim.report.firstDoseInitial')} ·{' '}
              {run.populationN === 1 ? t('sim.report.singleTwin') : t('sim.report.virtualSubjects', { n: run.populationN })} ·{' '}
              {t('sim.report.framesEmittedCount', { n: run.summary.framesEmitted })}
              {troughToPeak != null && <>{t('sim.report.effectTroughPeak', { value: troughToPeak.toFixed(2) })}</>}
            </p>
          </header>

          <p className="sim-lede sim-prose">{summaryLede(run, t)}</p>

          <Outcomes summary={run.summary} t={t} />

          {searchSpaceNote && (
            <p className="sim-searchspace">
              <span>{t('sim.common.comparisonSet')}</span> {searchSpaceNote}
            </p>
          )}
        </>
      )}

      {children}

      {has('why') && (!!hits.length || !!caveats.length) && (
        <section className="sim-report-section">
          <h4>{t('sim.report.whyThisResult')}</h4>

          {!!hits.length && (
            <ul className="sim-why-list">
              {hits.map((h) => (
                <li key={h.ruleId}>
                  <span className={`sim-sev ${SEVERITY_CLASS[h.severity] ?? ''}`}>
                    {h.severity.replace(/_/g, ' ')}
                  </span>
                  <div>
                    <strong>{h.title}</strong>
                    <p className="sim-prose">{h.mechanism}</p>
                    {h.warningText && <p className="sim-prose sim-why-warning">{h.warningText}</p>}
                    {h.citation?.source && (
                      <span className="sim-cite" title={h.citation.quote ?? h.citation.note ?? ''}>
                        {h.citation.source}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Modelling assumptions sit beside the result, not in a tooltip. The
              amlodipine sex-by-dose interaction is the one that can change a
              recommendation, and its wording comes from the scorer. */}
          {!!caveats.length && (
            <div className="sim-assumptions">
              <h5>{t('sim.report.modellingAssumptions')}</h5>
              <ul>
                {caveats.map((c, i) => (
                  <li key={`${c.ruleId}-${i}`} className="sim-prose">
                    {modellingCaveatChip(c)}
                    {c.basis && <span className="sim-cite">{c.basis}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {has('tables') && (
      <div className="sim-report-grid">
        <section className="sim-report-section">
          <h4>{t('sim.report.steadyStateExposure')}</h4>
          <div className="sim-table-wrap">
            <table className="sim-table">
              <thead>
                <tr>
                  <th>{t('sim.report.tableMoiety')}</th>
                  <th>{t('sim.report.tablePeak')}</th>
                  <th>{t('sim.report.tableTrough')}</th>
                  <th>{t('sim.report.tablePeakTrough')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(run.summary.peakConc).map((k) => {
                  const d = k as DrugId
                  const peak = run.summary.peakConc[d] ?? 0
                  const trough = run.summary.troughConc[d] ?? 0
                  const ratio = trough > 0 ? peak / trough : null
                  return (
                    <tr key={k}>
                      <td>{DRUG_LABEL[d] ?? k}</td>
                      <td className="sim-num">{peak >= 100 ? peak.toFixed(0) : peak.toFixed(2)}</td>
                      <td className="sim-num">{trough >= 100 ? trough.toFixed(0) : trough.toFixed(2)}</td>
                      <td className="sim-num">
                        {ratio == null ? '—' : ratio >= 100 ? ratio.toFixed(0) : ratio.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="sim-table-unit">{t('sim.report.concentrationsUnitNote')}</p>
        </section>

        <section className="sim-report-section">
          <h4>{t('sim.report.adverseEventProbability')}</h4>
          {hazards.length ? (
            <div className="sim-table-wrap">
              <table className="sim-table">
                <tbody>
                  {hazards.map(([k, v]) => (
                    <tr key={k}>
                      <td>{RISK_LABEL_KEY[k] ? t(RISK_LABEL_KEY[k]) : k.replace(/_/g, ' ')}</td>
                      <td className="sim-num">{pct(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sim-muted">{t('sim.report.noAdverseEvents')}</p>
          )}
        </section>
      </div>
      )}

      {has('tables') && (
      <section className="sim-report-section">
        <h4>{t('sim.report.bestFormulationType')}</h4>
        {drugs
          .filter((d) => d !== 'exp3174')
          .map((d) => {
            const f = FORMULATION_STATUS[d]
            if (!f) return null
            return (
              <div
                key={d}
                className={`sim-form-verdict ${f.status === 'refused' ? 'is-refused' : f.status === 'not_indicated' ? 'is-neutral' : 'is-ranked'}`}
              >
                <div className="sim-form-head">
                  <strong>{DRUG_LABEL[d]}</strong>
                  {f.status === 'refused' && (
                    <span className="sim-refusal-badge">{t('sim.report.declinedNoData')}</span>
                  )}
                </div>
                <p className="sim-prose">{f.text}</p>
                {f.source && <span className="sim-cite">{f.source}</span>}
              </div>
            )
          })}
      </section>
      )}

      {has('tables') && <TimingSection timing={timing.plan} t={t} />}

      {has('limits') && (
      <section className="sim-report-section sim-limits">
        <h4>{t('sim.report.whatModelDoesNotRepresent')}</h4>
        <ul className="sim-prose">
          {STRUCTURAL_LIMITATIONS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        {/* The five-year output is a PROJECTION, never a prediction — the
            wording is normative. Translated via `sim.limits.fiveYearWording`;
            Uzbek and Russian must carry the same hedge, never a resolution. */}
        <p className="sim-five-year sim-prose">{t(FIVE_YEAR_WORDING_KEY)}</p>
        {!!timing.gaps.length && (
          <>
            <h5>{t('sim.timing.gapsHeading')}</h5>
            <ul className="sim-prose">
              {timing.gaps.map((g, i) => (
                <li key={i}>{g.why}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      )}

      {has('limits') && !!run.patient.warnings?.length && (
        <section className="sim-report-section sim-limits">
          <h4>{t('sim.report.twinDerivationWarnings')}</h4>
          <ul className="sim-prose">
            {run.patient.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
