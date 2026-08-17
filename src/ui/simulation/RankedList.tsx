/**
 * Ranked recommendation rows.
 *
 * Three renderer invariants from §9.1 are enforced structurally here rather than
 * documented:
 *
 *  - "The composite is never displayed alone" (§6.2). There is no code path in
 *    this file that draws a composite without E, S and A beside it.
 *  - A DISQUALIFIED arm shows NO numbers (§4.1). It shows the rule, the
 *    mechanism, the warning and the citation. Printing "safety 12/100" next to
 *    an absolute contraindication invites reading it as a tradeoff, and it is
 *    not one.
 *  - `tiedWithLeader` is rendered as a visible "too close to call" mark, not
 *    swallowed. Presenting a 0.1-point gap as a winner claims a discrimination
 *    the model does not have.
 *
 * Reasons are rendered as sentences at a readable measure rather than as chips.
 * Two of them — the tie note and the amlodipine sex-by-dose modelling
 * assumption — are full sentences whose meaning does not survive being clipped
 * into a pill, and both must be readable without interaction.
 *
 * Refusals render in place of a ranking wherever the scorer declines
 * (`RankedOption.refusal`) — formulation ranking for lisinopril, losartan and
 * hydrochlorothiazide, because the data does not exist.
 */

import type { DrugId, Provenance } from '../../types'
import { useT } from '../../i18n'
import { useData } from '../../data/DataProvider'
import { CompositeBar } from './charts'
import { SEVERITY_CLASS } from './presets'
import { CitationDisclosure, EvidenceDisclosure, doseEvidence, signedBp } from './ReportPanel'
import type { ScoredOption } from './scoring'

/**
 * A citation used to be a grey line with the quote hidden in a `title=`
 * tooltip: unreachable on a tablet, invisible to anyone who does not hover, and
 * therefore not evidence at all. It is now the same disclosure the report uses
 * — status mark, source, and the source's own sentence one click below.
 */
function Citation({ p }: { p?: Provenance }) {
  return <CitationDisclosure citation={p} />
}

/**
 * The doses in this arm, each against the label that licenses it.
 *
 * Only ever rendered for an arm that is being ranked. §4.1 is explicit that a
 * DISQUALIFIED arm shows NO numbers, and a labelled dose range is a number.
 */
function ArmDoseEvidence({ drugs }: { drugs: DrugId[] }) {
  const t = useT()
  const { data } = useData()
  const items = drugs.flatMap((id) => doseEvidence(data, id, t))
  if (!items.length) return null
  return <EvidenceDisclosure className="sim-evi-inline" title={t('sim.evidence.armBasis')} items={items} />
}

export function RefusalCard({ text, citation }: { text: string; citation?: Provenance }) {
  const t = useT()
  return (
    <div className="sim-refusal">
      <span className="sim-refusal-badge">{t('sim.ranked.declinedToRank')}</span>
      <p>{text}</p>
      {citation ? (
        <Citation p={citation} />
      ) : (
        <p className="sim-note">{t('sim.ranked.refusalNote')}</p>
      )}
    </div>
  )
}

export function RankedRow({
  option,
  index,
  highlight,
  note,
}: {
  option: ScoredOption
  index: number
  highlight?: 'good' | 'bad' | null
  note?: string
}) {
  const t = useT()
  const disqualified = option.tier === 'DISQUALIFIED'

  return (
    <li
      className={[
        'sim-ranked-row',
        disqualified ? 'is-disqualified' : '',
        option.tier === 'OVERRIDE_REQUIRED' ? 'is-override' : '',
        option.tiedWithLeader ? 'is-tied' : '',
        highlight === 'good' ? 'is-good' : '',
        highlight === 'bad' ? 'is-bad' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sim-ranked-head">
        <span className="sim-ranked-index">{disqualified ? '—' : index + 1}</span>
        <div className="sim-ranked-ident">
          <span className="sim-ranked-name">{option.regimen?.label ?? option.regimen?.id ?? 'unnamed arm'}</span>
          <span className="sim-ranked-marks">
            {option.tier !== 'ALLOWED' && (
              <span className={`sim-tag sim-tier-${option.tier.toLowerCase()}`}>
                {option.tier.replace(/_/g, ' ').toLowerCase()}
              </span>
            )}
            {!disqualified && option.tiedWithLeader && (
              <span className="sim-tag sim-tag-tied">{t('sim.ranked.tooCloseToCall')}</span>
            )}
            {note && <span className="sim-tag sim-tag-note">{note}</span>}
          </span>
        </div>
      </div>

      {disqualified ? (
        <div className="sim-disq">
          {option.hits
            ?.filter((h) => h.blocks || h.severityRank >= 6)
            .map((h) => (
              <div key={h.ruleId} className="sim-disq-rule">
                <span className={`sim-sev ${SEVERITY_CLASS[h.severity] ?? ''}`}>
                  {h.severity.replace(/_/g, ' ')}
                </span>{' '}
                <strong>{h.title}</strong>
                <p>{h.mechanism}</p>
                {h.warningText && <p className="sim-disq-warning">{h.warningText}</p>}
                <Citation p={h.citation} />
              </div>
            ))}
          {!option.hits?.length && <p>{t('sim.ranked.disqualifiedNoRule')}</p>}
        </div>
      ) : (
        <div className="sim-ranked-body">
          <CompositeBar
            composite={option.composite ?? option.score}
            efficacy={option.efficacyTerm}
            safety={option.safetyTerm}
            appropriateness={option.appropriatenessTerm}
          />
          <dl className="sim-ranked-metrics">
            <div>
              <dt>{t('sim.ranked.systolicChange')}</dt>
              <dd>{signedBp(option.deltaSbp)} mmHg</dd>
            </div>
            {option.goalAttainment != null && (
              <div>
                <dt>{t('sim.ranked.reached', { target: option.target?.label ?? 'target' })}</dt>
                <dd>
                  {Math.round(option.goalAttainment * 100)} %
                  {option.populationN > 1 ? <em> of N = {option.populationN}</em> : null}
                </dd>
              </div>
            )}
            {option.penalties && (
              <div>
                <dt>{t('sim.ranked.safetyPenalties')}</dt>
                <dd>
                  {t('sim.ranked.penaltyBreakdown', {
                    rule: Math.round(option.penalties.rule),
                    risk: Math.round(option.penalties.risk),
                    lab: Math.round(option.penalties.lab),
                  })}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* The label behind the milligrams above, one click from the row that
          recommends them — a ranked alternative is a prescribing claim, and a
          reader comparing arms should not have to leave the list to check it. */}
      {!disqualified && (
        <ArmDoseEvidence drugs={[...new Set((option.regimen?.doses ?? []).map((d) => d.substanceId))]} />
      )}

      {option.refusal && <RefusalCard text={option.refusal.reason} citation={option.refusal.citation} />}
      {!option.refusal && option.formulation && !option.formulation.available && option.formulation.refusal && (
        <RefusalCard text={option.formulation.refusal.reason} citation={option.formulation.refusal.citation} />
      )}

      {!!option.reasons?.length && (
        <ul className="sim-reasons">
          {option.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {!disqualified && !!option.hits?.length && (
        <ul className="sim-hits">
          {option.hits.map((h) => (
            <li key={h.ruleId} className={`sim-chip ${SEVERITY_CLASS[h.severity] ?? ''}`} title={h.mechanism}>
              {h.title}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function RankedList({
  options,
  highlights,
  notes,
}: {
  options: ScoredOption[]
  /** arm id -> emphasis, so the demo can point at a row without pre-ranking it. */
  highlights?: Record<string, 'good' | 'bad'>
  notes?: Record<string, string>
}) {
  const t = useT()
  // The scorer already sorts tier-first; DISQUALIFIED arms are split out so
  // they are visibly not part of the ranking rather than merely last in it.
  const ranked = options.filter((o) => o.tier !== 'DISQUALIFIED')
  const disq = options.filter((o) => o.tier === 'DISQUALIFIED')
  const tiedCount = ranked.filter((o) => o.tiedWithLeader).length

  return (
    <div className="sim-ranked">
      {tiedCount > 1 && (
        <p className="sim-tie-banner">
          <strong>{t('sim.ranked.tieBannerStrong', { n: tiedCount })}</strong> {t('sim.ranked.tieBannerRest')}
        </p>
      )}

      <ol className="sim-ranked-list">
        {ranked.map((o, i) => (
          <RankedRow
            key={o.regimen?.id ?? i}
            option={o}
            index={i}
            highlight={highlights?.[o.regimen?.id ?? ''] ?? null}
            note={notes?.[o.regimen?.id ?? '']}
          />
        ))}
      </ol>

      {!!disq.length && (
        <section className="sim-disq-section">
          <h4>{t('sim.ranked.disqualifiedSectionHeading')}</h4>
          <ol className="sim-ranked-list">
            {disq.map((o, i) => (
              <RankedRow key={`dq-${o.regimen?.id ?? i}`} option={o} index={i} />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

export function ScoringUnavailable({ reason }: { reason?: string }) {
  const t = useT()
  return (
    <div className="sim-refusal sim-refusal-hard">
      <span className="sim-refusal-badge">{t('sim.ranked.rankingUnavailable')}</span>
      <p>{reason ?? t('sim.ranked.noRankingDefault')}</p>
      <p className="sim-note">{t('sim.ranked.simOutputRealNote')}</p>
    </div>
  )
}
