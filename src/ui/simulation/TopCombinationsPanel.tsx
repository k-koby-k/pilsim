/**
 * "It should give 5 most efficient doses first, then pick a human model to
 * simulate."
 *
 * A clinician tester's own words, and the reason this panel is reachable
 * before a patient is chosen at all. Answered by calling the engine's own
 * `findTopCombinations` (src/engine/optimise.ts) — every dosable drug at every
 * licensed strength, alone and as unordered pairs, scored analytically
 * (combinationRule, never the ODE) so this re-runs in milliseconds whenever the
 * selected subject changes. This panel does not compute anything the engine did
 * not already compute; it only calls, filters and renders.
 *
 * Before a patient is picked, `patient` is a default reference twin — see
 * SimulationPage's `DEFAULT_REFERENCE_SUBJECT` — and `isDefaultSubject` says so
 * on screen rather than presenting a stand-in as if it were someone real.
 * Once a patient is picked, `referencePatient` (still that same default twin)
 * is ranked a second time purely so the panel can point at what moved: which
 * drugs left the top 5 and how many more candidates became hard-blocked. A
 * pregnant patient losing lisinopril and losartan outright is the clearest
 * version of that change.
 *
 * Three things this panel is careful about, all load-bearing:
 *
 *  - The `filter` passed to `findTopCombinations` is wired to the real rules
 *    engine (`evaluate`, which wraps `evaluateRules` from src/rules/evaluate.ts)
 *    so a combination that is hard-blocked (rank 7, `blocked: true`) for THIS
 *    patient — an ACE inhibitor for a pregnant subject — never appears. Nothing
 *    softer than a hard block is filtered: an override-required or a warning
 *    still shows up and simply carries the flag on its row.
 *
 *  - Dual RAAS blockade is NEVER filtered out by this panel. It ranks wherever
 *    the arithmetic puts it — usually low, because ACEi and ARB compete for the
 *    same saturating pathway — and that low rank, reached with nothing telling
 *    the search to avoid it, is the demonstration. The row is flagged, not
 *    hidden.
 *
 *  - The "reranked for this patient" callout is read off the SAME two calls
 *    to `findTopCombinations` that already produced the two rankings — it
 *    diffs their outputs, it does not re-derive anything.
 */

import { useMemo } from 'react'
import type { PatientState, Regimen } from '../../types'
import type { RulesFile } from '../../data/load'
import { useT } from '../../i18n'
import {
  enumerateCandidateRegimens,
  findTopCombinations,
  type CombinationSubject,
  type RankedOptimiseCandidate,
} from '../../engine'
import { evaluate } from './adapters'
import { DRUG_LABEL } from './presets'
import { EvidenceDisclosure, doseEvidence, modelBasisEvidence, signedBp } from './ReportPanel'
import { useData } from '../../data/DataProvider'

function doseLine(regimen: Regimen): string {
  return regimen.doses.map((d) => `${DRUG_LABEL[d.substanceId] ?? d.substanceId} ${d.mg} mg`).join(' + ')
}

/** "Why it ranked there" — read off the same CombinationResult the score was built from. */
function comboReasons(c: RankedOptimiseCandidate, t: ReturnType<typeof useT>): string[] {
  const reasons: string[] = [
    t('sim.topcombos.reasonPrimary', {
      dsbp: signedBp(c.result.dsbp),
      ddbp: signedBp(c.result.ddbp),
      burden: (c.adverseBurden * 100).toFixed(1),
    }),
  ]
  if (c.result.dualRaas) {
    reasons.push(t('sim.topcombos.reasonDualRaas'))
  }
  if (c.result.betaPlusRasi) {
    reasons.push(t('sim.topcombos.reasonBetaRas'))
  }
  if (c.result.extrapolated) {
    reasons.push(
      t('sim.topcombos.reasonExtrapolated', {
        drugs: c.result.extrapolatedDrugs.map((d) => DRUG_LABEL[d] ?? d).join(', '),
      }),
    )
  }
  return reasons
}

function combinationSubjectOf(patient: PatientState): CombinationSubject {
  return { sbpBaseline: patient.inputs.sbp_mmHg, dbpBaseline: patient.inputs.dbp_mmHg }
}

export function TopCombinationsPanel({
  patient,
  rules,
  onRun,
  disabled,
  subjectLabel,
  isDefaultSubject,
  referencePatient,
}: {
  /** The derived twin the ranking is currently computed against — the default
   * reference subject until a patient is picked, that patient afterwards. */
  patient: PatientState | null
  rules: RulesFile | null
  /** Runs a candidate through the real simulation via the existing run path. */
  onRun: (regimen: Regimen) => void
  disabled?: boolean
  /** Who `patient` represents, for the header sentence. */
  subjectLabel?: string
  /** True while `patient` is the default reference twin, not a chosen patient. */
  isDefaultSubject?: boolean
  /** The default reference twin, always — used only to diff against once a real
   * patient has been picked, so the panel can say what changed and why. */
  referencePatient?: PatientState | null
}) {
  const t = useT()
  const { data: pilsimData } = useData()
  // Static — depends only on the licensed-strength ladders, not the patient.
  const totalCount = useMemo(() => enumerateCandidateRegimens().length, [])

  const ranked = useMemo(() => {
    if (!patient) return []
    return findTopCombinations(combinationSubjectOf(patient), {
      // n large enough to return everything not hard-blocked, so the excluded
      // count below is exact rather than estimated from a truncated top slice.
      n: totalCount,
      filter: (c) => !evaluate(patient, c.regimen, rules).blocked,
    })
  }, [patient, rules, totalCount])

  const top5 = ranked.slice(0, 5)
  const excludedCount = totalCount - ranked.length

  // The reference ranking, recomputed only once a real patient has replaced
  // the default subject — this is what "reranked for this patient" is a diff
  // against. Skipped while nothing has changed yet, so no work is wasted on
  // every keystroke of a run the user hasn't taken.
  const referenceRanked = useMemo(() => {
    if (isDefaultSubject || !referencePatient) return null
    return findTopCombinations(combinationSubjectOf(referencePatient), {
      n: totalCount,
      filter: (c) => !evaluate(referencePatient, c.regimen, rules).blocked,
    })
  }, [isDefaultSubject, referencePatient, rules, totalCount])

  const change = useMemo(() => {
    if (!referenceRanked) return null
    const refTop5 = referenceRanked.slice(0, 5)
    const curIds = new Set(top5.map((c) => c.regimen.id))
    const refIds = new Set(refTop5.map((c) => c.regimen.id))
    const dropped = refTop5.filter((c) => !curIds.has(c.regimen.id))
    const added = top5.filter((c) => !refIds.has(c.regimen.id))
    const excludedDelta = excludedCount - (totalCount - referenceRanked.length)
    if (!dropped.length && !added.length && excludedDelta === 0) return null
    return { dropped, added, excludedDelta }
  }, [referenceRanked, top5, excludedCount, totalCount])

  return (
    <section className="sim-card sim-bench" aria-label={t('sim.topcombos.ariaLabel')}>
      <header className="sim-bench-head">
        <h3 className="sim-card-title">
          {t('sim.topcombos.title')}
          {!isDefaultSubject && subjectLabel ? ` — ${subjectLabel}` : ''}
        </h3>
        <p className="sim-prose sim-muted">
          {isDefaultSubject ? (
            <>
              {t('sim.topcombos.noPatientPre')}{' '}
              <strong>{subjectLabel ?? t('sim.topcombos.typicalAdultFallback')}</strong>{' '}
              {t('sim.topcombos.noPatientPost')}
            </>
          ) : (
            <>{t('sim.topcombos.rankedFor', { subject: subjectLabel })}</>
          )}
          {t('sim.topcombos.everyDrugNote', { total: totalCount })}
        </p>
        {excludedCount > 0 && (
          <p className="sim-searchspace">
            <span>{t('sim.common.excluded')}</span>{' '}
            {t('sim.topcombos.excludedNote', { excluded: excludedCount, total: totalCount })}
          </p>
        )}
        {/* This list is the first clinical claim on the page — five regimens,
            ranked — so what it rests on is stated once, here, rather than left
            to be discovered in the report further down. The four terms behind
            every row's pressure change are the report's own, two cited and two
            estimated, and they open onto their sources. */}
        <p className="sim-note">{t('sim.evidence.rankingBasisNote')}</p>
        <EvidenceDisclosure
          className="sim-evi-inline"
          title={t('sim.evidence.rankingBasis')}
          items={modelBasisEvidence(t, true)}
        />
        {change && (
          <div className="sim-tie-banner" role="status">
            <strong>{t('sim.topcombos.rerankedFor', { subject: subjectLabel })}</strong>{' '}
            {t('sim.topcombos.rerankedAgainst')}{' '}
            {change.excludedDelta > 0 && t('sim.topcombos.moreBlocked', { n: change.excludedDelta })}
            {!!change.dropped.length &&
              t('sim.topcombos.droppedTop5', { list: change.dropped.map((c) => doseLine(c.regimen)).join('; ') })}
            {!!change.added.length &&
              t('sim.topcombos.newTop5', { list: change.added.map((c) => doseLine(c.regimen)).join('; ') })}
          </div>
        )}
      </header>

      {!patient ? (
        <p className="sim-prose">{t('sim.topcombos.pickSubject')}</p>
      ) : top5.length === 0 ? (
        <p className="sim-inline-warn">{t('sim.topcombos.allBlocked')}</p>
      ) : (
        <ol className="sim-ranked-list">
          {top5.map((c) => (
            <li
              key={c.regimen.id}
              className={`sim-ranked-row${c.result.dualRaas ? ' is-bad' : ''}`}
            >
              <div className="sim-ranked-head">
                <span className="sim-ranked-index">{c.rank}</span>
                <div className="sim-ranked-ident">
                  <span className="sim-ranked-name">{doseLine(c.regimen)}</span>
                  <span className="sim-ranked-marks">
                    {c.result.dualRaas && <span className="sim-tag sim-tag-note">{t('sim.topcombos.tagDualRaas')}</span>}
                    {c.result.betaPlusRasi && (
                      <span className="sim-tag sim-tag-note">{t('sim.topcombos.tagBetaRas')}</span>
                    )}
                    {c.result.extrapolated && (
                      <span className="sim-tag sim-tag-note">{t('sim.topcombos.tagDoseExtrapolated')}</span>
                    )}
                  </span>
                </div>
              </div>

              <dl className="sim-ranked-metrics">
                <div>
                  <dt>{t('sim.ranked.systolicChange')}</dt>
                  <dd>{signedBp(c.result.dsbp)} mmHg</dd>
                </div>
                <div>
                  <dt>{t('sim.topcombos.diastolicChange')}</dt>
                  <dd>{signedBp(c.result.ddbp)} mmHg</dd>
                </div>
                <div>
                  <dt>{t('sim.topcombos.adverseBurden')}</dt>
                  <dd>{(c.adverseBurden * 100).toFixed(1)} pts</dd>
                </div>
              </dl>

              <ul className="sim-reasons">
                {comboReasons(c, t).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>

              {/* Every milligram figure on this row against the label that
                  licenses it, with the label's own sentence one click away. */}
              <EvidenceDisclosure
                className="sim-evi-inline"
                title={t('sim.evidence.armBasis')}
                items={[...new Set(c.regimen.doses.map((d) => d.substanceId))].flatMap((id) =>
                  doseEvidence(pilsimData, id, t),
                )}
              />

              <button
                type="button"
                className="btn btn--primary"
                disabled={disabled}
                onClick={() => onRun(c.regimen)}
              >
                {t('sim.topcombos.runThroughSimulation')}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
