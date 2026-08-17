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

import { useMemo, type ReactNode } from 'react'
import type { DrugId, Measured, Provenance, ProvenanceStatus, RunSummary, SourceTier } from '../../types'
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
import { findSubstance, type PilSimData } from '../../data/load'
import { isMeasured, view } from '../../data/provenance'
import './evidence.css'
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
// EVIDENCE — provenance rendered where the claim is made.
//
// A clinician testing this product said, of a recommendation, that she did not
// know how correct the response was. The evidence was already there: every
// number traces to a regulatory label, a named trial, or an explicit ESTIMATED
// marker, and `src/data/provenance.ts` has returned all of it — status, tier,
// source, verbatim quote, URL — since the data layer was written. It was simply
// never shown at the moment a reader decides whether to believe a result.
//
// What is rendered here, and why in this shape:
//
//  - The STATUS MARK is never softened. CITED, ESTIMATED and NOT FOUND are the
//    dataset's own three words, printed as they appear in the file and in every
//    language, because a translated status could not be matched back to the
//    data. A NOT FOUND is shown as prominently as a CITED — lisinopril's label
//    states no numeric blood-pressure reduction at all, and saying so is the
//    single most trust-building thing on the screen.
//  - The VERBATIM QUOTE is the payload. It is what lets a doctor check us
//    against a document she already trusts, so it is always one click away and
//    never more than one. It is never translated, never paraphrased, and never
//    shortened.
//  - Source names, quotes, drug names, units, trial names and PMIDs are
//    rendered exactly as the source words them, in every language — the same
//    rule the dictionary header states.
//
// Nothing in this section computes or alters a value. It reads the dataset that
// is already loaded and the provenance objects that already exist.
// ---------------------------------------------------------------------------

/** One value plus everything needed to check it. Assembled, never invented. */
export interface EvidenceItem {
  id: string
  /** What the parameter is — UI chrome, translated. */
  label: string
  /** The value and its unit, verbatim from the dataset. Never translated. */
  display: string
  status: ProvenanceStatus
  source: string | null
  quote: string | null
  url: string | null
  tier: SourceTier | null
  note: string | null
  retrieved: string | null
  /**
   * Notes in the dataset serve two different purposes. On an ESTIMATED or
   * NOT_FOUND value the note IS the evidence — the justification, or what was
   * searched — and must be read. On a CITED value with a quote beside it the
   * note is usually the data author's working commentary, and printing it
   * buries the label's own sentence under our internal chatter. So a note is
   * shown whenever it is load-bearing (no quote, or not CITED) and otherwise
   * only when the caller says it is essential.
   */
  noteIsEssential?: boolean
}

export interface EvidenceCounts {
  cited: number
  estimated: number
  notFound: number
  total: number
}

export function countEvidence(items: EvidenceItem[]): EvidenceCounts {
  let cited = 0
  let estimated = 0
  let notFound = 0
  for (const i of items) {
    if (i.status === 'CITED') cited++
    else if (i.status === 'ESTIMATED') estimated++
    else notFound++
  }
  return { cited, estimated, notFound, total: items.length }
}

const TIER_LABEL_KEY: Record<SourceTier, DictKey> = {
  1: 'sim.evidence.tier1',
  2: 'sim.evidence.tier2',
  3: 'sim.evidence.tier3',
  4: 'sim.evidence.tier4',
}

function trimNumber(n: number): string {
  const s = n.toFixed(2)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * `preferRange` exists for the label's dosing range, whose `value` is the
 * midpoint of the range. Printing "30 mg" for a 20–40 mg/day range would invent
 * a recommendation the label does not make, so the range is shown as a range.
 */
function measuredDisplay(m: Measured | null, preferRange: boolean): string {
  const v = view(m, 2)
  if (preferRange && v.range) {
    return `${trimNumber(v.range[0])}–${trimNumber(v.range[1])}${v.unit ? ` ${v.unit}` : ''}`
  }
  return v.display
}

function measuredItem(id: string, label: string, m: Measured | null, preferRange = false): EvidenceItem {
  const v = view(m, 2)
  return {
    id,
    label,
    display: measuredDisplay(m, preferRange),
    status: v.status,
    source: v.provenance.source ?? null,
    quote: v.quote,
    url: v.url,
    tier: v.tier,
    note: v.provenance.note ?? null,
    retrieved: v.provenance.retrieved ?? null,
  }
}

export function provenanceItem(id: string, label: string, p: Provenance, display = ''): EvidenceItem {
  return {
    id,
    label,
    display,
    status: p.status,
    source: p.source ?? null,
    quote: p.quote ?? null,
    url: p.url ?? null,
    tier: p.tier ?? null,
    note: p.note ?? null,
    retrieved: p.retrieved ?? null,
  }
}

function pick(obj: Record<string, unknown> | undefined, key: string): Measured | null {
  const v = obj?.[key]
  return isMeasured(v) ? v : null
}

function substanceGroups(data: PilSimData | null, id: DrugId) {
  const s = data ? findSubstance(data, id) : undefined
  const pd = s?.pd as Record<string, unknown> | undefined
  return {
    found: !!s,
    pk: s?.pk as Record<string, unknown> | undefined,
    effect: pd?.clinical_effect as Record<string, unknown> | undefined,
    dosing: s?.dosing as Record<string, unknown> | undefined,
  }
}

/**
 * The three dosing numbers a prescriber checks first, all of them label-cited
 * with the label's own sentence attached. This is the fastest possible audit of
 * a recommended dose: read our milligrams, read the label's, compare.
 */
const DOSE_PARAMS: { field: string; labelKey: DictKey; preferRange?: boolean }[] = [
  { field: 'typical_adult_start_mg', labelKey: 'sim.evidence.doseStart' },
  { field: 'typical_adult_range_mg', labelKey: 'sim.evidence.doseUsual', preferRange: true },
  { field: 'max_daily_mg', labelKey: 'sim.evidence.doseMax' },
]

/**
 * The ten parameters every drug in this product is described by — the six that
 * drive its concentration curve and the four that drive its effect. Chosen
 * because they are what the engine actually consumes (see the mirror table in
 * src/engine/substanceParams.ts) rather than because they look well sourced:
 * across the six molecules these ten include NOT_FOUND and ESTIMATED entries,
 * and showing them is the point.
 */
const HEADLINE_PARAMS: { field: string; from: 'pk' | 'effect'; labelKey: DictKey }[] = [
  { from: 'pk', field: 'bioavailability_fraction', labelKey: 'sim.evidence.paramF' },
  { from: 'pk', field: 'tmax_h', labelKey: 'sim.evidence.paramTmax' },
  { from: 'pk', field: 'half_life_h', labelKey: 'sim.evidence.paramHalfLife' },
  { from: 'pk', field: 'vd_l', labelKey: 'sim.evidence.paramVd' },
  { from: 'pk', field: 'clearance_l_h', labelKey: 'sim.evidence.paramClearance' },
  { from: 'pk', field: 'fraction_excreted_unchanged_urine', labelKey: 'sim.evidence.paramRenal' },
  { from: 'effect', field: 'sbp_drop_mmhg', labelKey: 'sim.evidence.paramSbpDrop' },
  { from: 'effect', field: 'dbp_drop_mmhg', labelKey: 'sim.evidence.paramDbpDrop' },
  { from: 'effect', field: 'onset_h', labelKey: 'sim.evidence.paramOnset' },
  { from: 'effect', field: 'duration_h', labelKey: 'sim.evidence.paramDuration' },
]

export function doseEvidence(data: PilSimData | null, id: DrugId, t: ReturnType<typeof useT>): EvidenceItem[] {
  const g = substanceGroups(data, id)
  if (!g.found) return []
  return DOSE_PARAMS.map((p) =>
    measuredItem(`${id}.${p.field}`, t(p.labelKey), pick(g.dosing, p.field), !!p.preferRange),
  )
}

export function drugParamEvidence(data: PilSimData | null, id: DrugId, t: ReturnType<typeof useT>): EvidenceItem[] {
  const g = substanceGroups(data, id)
  if (!g.found) return []
  return HEADLINE_PARAMS.map((p) =>
    measuredItem(`${id}.${p.field}`, t(p.labelKey), pick(p.from === 'pk' ? g.pk : g.effect, p.field)),
  )
}

/**
 * What the projected blood-pressure change rests on.
 *
 * Transcribed from the engine's own provenance — src/engine/constants.ts §4.1,
 * §4.4 and §4.5(a), and src/engine/homeostasis.ts — which name their sources in
 * the same file as the constants they justify. Two of these four are cited
 * anchors and two are estimates, and a reader is told which is which: the
 * dose–response curve and the pre-treatment-pressure term come from published
 * trials, while the pooling ceiling and the homeostasis gains are calibrations.
 *
 * Source strings, quotes, PMIDs and trial names are rendered verbatim in every
 * language for the same reason the data layer's are: a translated citation
 * cannot be looked up.
 */
const LAW_2003 =
  'Law MR, Wald NJ, Morris JK, Jordan RE. Value of low dose combination treatment with blood pressure ' +
  'lowering drugs: analysis of 354 randomised trials. BMJ 2003;326:1427'
const LAW_2003_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC162261/'

export function modelBasisEvidence(t: ReturnType<typeof useT>, combination: boolean): EvidenceItem[] {
  const items: EvidenceItem[] = [
    {
      id: 'model.doseResponse',
      label: t('sim.evidence.modelDoseResponse'),
      display: '',
      status: 'CITED',
      source: LAW_2003,
      url: LAW_2003_URL,
      quote: null,
      tier: 2,
      note:
        'Emax and ED50 for each drug class are a least-squares fit to the three dose points this paper ' +
        'publishes (half, one and two times the standard dose), RMSE ≤ 0.15 mmHg. The trial data are the ' +
        "paper's; the fitted curve is ours. Emax is a curve-fit asymptote, not a physiological maximum.",
      retrieved: null,
      noteIsEssential: true,
    },
    {
      id: 'model.baseline',
      label: t('sim.evidence.modelBaseline'),
      display: '',
      status: 'CITED',
      source: LAW_2003,
      url: LAW_2003_URL,
      quote:
        'If the pretreatment blood pressure was 10 mm Hg higher, the reduction in blood pressure with one ' +
        'drug at standard dose increased on average by 1.0 (0.7 to 1.2) mm Hg systolic and 1.1 (0.8 to 1.4) ' +
        'mm Hg diastolic.',
      tier: 2,
      note:
        'The engine applies 1.3 mmHg per 10 mmHg (1.0–1.5), from the 2025 meta-analysis of 484 randomised ' +
        "trials and 104 176 participants (PMID 40885583), which sits inside Law 2003's own upper confidence " +
        'limit and is the better-powered estimate. Without this term a normotensive subject would be given ' +
        'the full hypertensive response.',
      retrieved: null,
      noteIsEssential: true,
    },
  ]
  if (combination) {
    items.push({
      id: 'model.pooling',
      label: t('sim.evidence.modelPooling'),
      display: '',
      status: 'ESTIMATED',
      source: null,
      url: null,
      quote: null,
      tier: null,
      note:
        'The ceiling that stops two drugs being strictly additive has no source of its own. It is calibrated ' +
        'so that a cross-class pair reproduces the observed/expected additivity ratio of 1.01 (95 % CI ' +
        '0.90–1.12) reported by Wald 2009, and so that an ACE inhibitor plus an ARB reproduces the ONTARGET ' +
        'dual-blockade increment. It is the least evidence-backed constant in the engine and it is the one ' +
        'that decides the dual-RAAS answer.',
      retrieved: null,
      noteIsEssential: true,
    })
  }
  items.push({
    id: 'model.homeostasis',
    label: t('sim.evidence.modelHomeostasis'),
    display: '',
    status: 'ESTIMATED',
    source: null,
    url: null,
    quote: null,
    tier: null,
    note:
      'The six-state cardiovascular model (baroreflex, renin, aldosterone, volume, resistance, rate) has no ' +
      "external source for its gains. Each pathway gain is solved until the model's converged systolic change " +
      'equals the dose–response value above, so the model reproduces that trial anchor rather than adding to it.',
    retrieved: null,
    noteIsEssential: true,
  })
  return items
}

// --------------------------------------------------------------- rendering

/**
 * CITED / ESTIMATED / NOT FOUND, in the dataset's own words. Deliberately not
 * translated: this is a data value, not chrome, and it must read identically to
 * what a reader would find in the file.
 */
export function ProvenanceMark({ status }: { status: ProvenanceStatus }) {
  return <span className={`sim-prov sim-prov-${status.toLowerCase()}`}>{status.replace(/_/g, ' ')}</span>
}

/** The at-a-glance answer to "how much of this is sourced?" */
export function EvidenceCountPills({ counts }: { counts: EvidenceCounts }) {
  return (
    <span className="sim-prov-counts">
      {counts.cited > 0 && <span className="sim-prov sim-prov-cited">{counts.cited} CITED</span>}
      {counts.estimated > 0 && <span className="sim-prov sim-prov-estimated">{counts.estimated} ESTIMATED</span>}
      {counts.notFound > 0 && <span className="sim-prov sim-prov-not_found">{counts.notFound} NOT FOUND</span>}
    </span>
  )
}

/** The source's own words, its tier, its link — and, when there are none, that. */
function EvidenceBody({ item }: { item: EvidenceItem }) {
  const t = useT()
  return (
    <>
      {item.quote ? (
        <blockquote
          className={`sim-evi-quote${item.status === 'ESTIMATED' ? ' sim-evi-quote-estimated' : ''}`}
          lang="en"
        >
          “{item.quote}”
        </blockquote>
      ) : (
        <p className="sim-evi-absent">
          {item.status === 'NOT_FOUND' ? t('sim.evidence.notSourced') : t('sim.evidence.noQuote')}
        </p>
      )}
      {item.note && (item.noteIsEssential || !item.quote || item.status !== 'CITED') && (
        <p className="sim-evi-note" lang="en">
          {item.note}
        </p>
      )}
      {(item.source || item.tier) && (
        <p className="sim-evi-src" lang="en">
          {item.source}
          {item.tier && <span className="sim-evi-tier">{t(TIER_LABEL_KEY[item.tier])}</span>}
          {item.retrieved && <em> · retrieved {item.retrieved}</em>}
        </p>
      )}
      {item.url && (
        <a className="sim-evi-link" href={item.url} target="_blank" rel="noreferrer noopener">
          {t('sim.evidence.openSource')} ↗
        </a>
      )}
    </>
  )
}

/**
 * One value inside an opened group: its own mark, value and source text.
 *
 * `hideHead` is set when the disclosure holds a single item, whose mark, label
 * and value are already on the summary line above — repeating them there and
 * again here would push the quote, the only thing worth reading, further down.
 */
function EvidenceQuote({ item, hideHead }: { item: EvidenceItem; hideHead?: boolean }) {
  return (
    <div className="sim-evi-q">
      {!hideHead && (
        <div className="sim-evi-qhead">
          <ProvenanceMark status={item.status} />
          <span className="sim-evi-label">{item.label}</span>
          {item.display && (
            <span className="sim-evi-value sim-num" lang="en">
              {item.display}
            </span>
          )}
        </div>
      )}
      <EvidenceBody item={item} />
    </div>
  )
}

/**
 * A claim, its provenance mark, and the source text one click below it.
 *
 * Collapsed by default and one line tall: a wall of citations is as unreadable
 * as none. What stays visible is the part a sceptical reader scans — is this
 * cited or estimated, and by whom.
 */
export function EvidenceDisclosure({
  title,
  meta,
  source,
  items,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  source?: string
  items: EvidenceItem[]
  className?: string
}) {
  if (!items.length) return null
  const counts = countEvidence(items)
  return (
    <details className={`sim-evi${className ? ` ${className}` : ''}`}>
      <summary>
        <span className="sim-evi-sum">
          {items.length === 1 ? <ProvenanceMark status={items[0].status} /> : <EvidenceCountPills counts={counts} />}
          <span className="sim-evi-label">{title}</span>
          {meta != null && <span className="sim-evi-meta">{meta}</span>}
          {source && (
            <span className="sim-evi-source-line" lang="en">
              {source}
            </span>
          )}
        </span>
      </summary>
      <div className="sim-evi-body">
        {items.map((it) => (
          <EvidenceQuote key={it.id} item={it} hideHead={items.length === 1} />
        ))}
      </div>
    </details>
  )
}

export function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <EvidenceDisclosure
      title={item.label}
      meta={
        item.display ? (
          <span className="sim-num" lang="en">
            {item.display}
          </span>
        ) : undefined
      }
      source={item.source ?? undefined}
      items={[item]}
    />
  )
}

/**
 * A rule's, a refusal's or a timing claim's citation — the same disclosure, so
 * a reader learns the interaction once. Replaces a `title=` tooltip, which is
 * unreachable on touch and invisible to anyone who does not hover.
 */
export function CitationDisclosure({ citation, label }: { citation?: Provenance; label?: string }) {
  const t = useT()
  if (!citation) return null
  // A provenance object with nothing in it is still a fact worth printing —
  // "ESTIMATED, no source" is information. It just has nothing to disclose.
  if (!citation.source && !citation.quote && !citation.note && !citation.url) {
    return (
      <span className="sim-cite">
        <ProvenanceMark status={citation.status} />
      </span>
    )
  }
  const item = provenanceItem('citation', label ?? t('sim.evidence.sourceLabel'), citation)
  return (
    <EvidenceDisclosure
      className="sim-evi-inline"
      title={item.label}
      source={item.source ?? undefined}
      items={[item]}
    />
  )
}

/**
 * The summary affordance: for the result in front of the reader, how much of it
 * is cited and how much is estimated — then every one of those values, with the
 * source's own sentence, behind a single disclosure.
 *
 * The counts are over VALUES: the label dosing behind the recommended dose, the
 * ten headline parameters of each drug in it, and the model terms behind the
 * projected pressure change. Fired safety rules are counted separately and
 * named as rules, because a rule is a claim with a citation, not a value.
 */
function EvidenceLedger({
  run,
  data,
  ruleCount,
}: {
  run: CompletedRun
  data: PilSimData | null
  ruleCount: number
}) {
  const t = useT()
  const drugs = drugsIn(run)
  const doseGroups = drugs.map((id) => ({ id, items: doseEvidence(data, id, t) }))
  const paramGroups = drugs.map((id) => ({ id, items: drugParamEvidence(data, id, t) }))
  const model = modelBasisEvidence(t, drugs.length > 1)
  const params = paramGroups.flatMap((g) => g.items)
  const all = [...doseGroups.flatMap((g) => g.items), ...params, ...model]
  const counts = countEvidence(all)
  // No dataset in context means no provenance to show. Rendering an empty
  // ledger would read as "nothing is sourced", which is the opposite of true.
  if (!doseGroups.some((g) => g.items.length)) return null

  return (
    <section className="sim-evidence" aria-label={t('sim.evidence.aria')}>
      <p className="sim-evidence-heading">{t('sim.evidence.heading')}</p>
      <div className="sim-evidence-lede">
        <EvidenceCountPills counts={counts} />
        <span className="sim-evidence-sentence">
          {t('sim.evidence.restsOn', { cited: counts.cited, estimated: counts.estimated })}
          {counts.notFound > 0 ? ` ${t('sim.evidence.notFoundClause', { n: counts.notFound })}` : ''}
          {ruleCount > 0 ? ` ${t('sim.evidence.rulesClause', { n: ruleCount })}` : ''}
        </span>
      </div>

      <div className="sim-evi-list">
        {/* The recommended dose, against the label that licenses it. */}
        {doseGroups.map((g) => {
          const dose = run.regimen.doses.find((d) => d.substanceId === g.id)
          const perDay = dose && dose.perDay > 1 ? ` × ${dose.perDay}` : ''
          return (
            <EvidenceDisclosure
              key={g.id}
              title={
                <span lang="en">
                  {DRUG_LABEL[g.id] ?? g.id} {dose ? `${dose.mg} mg${perDay}` : ''}
                </span>
              }
              meta={t('sim.evidence.doseAgainstLabel')}
              items={g.items}
            />
          )
        })}

        {/* The headline figure, and the four things it is built from. */}
        <EvidenceDisclosure
          title={t('sim.evidence.bpHeading')}
          meta={
            <span className="sim-num" lang="en">
              {signedBp(run.summary.deltaSbp)} mmHg
            </span>
          }
          items={model}
        />

        {/* Everything else, opened deliberately rather than shown by default. */}
        <details className="sim-evi sim-evi-all">
          <summary>
            <span className="sim-evi-sum">
              <EvidenceCountPills counts={countEvidence(params)} />
              <span className="sim-evi-label">{t('sim.evidence.showAll')}</span>
            </span>
          </summary>
          <div className="sim-evi-body">
            {paramGroups.map((g) => (
              <div key={g.id}>
                <h6 className="sim-evi-drug" lang="en">
                  {DRUG_LABEL[g.id] ?? g.id}
                </h6>
                {g.items.map((it) => (
                  <EvidenceRow key={it.id} item={it} />
                ))}
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  )
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

/**
 * Timing citations are full `Provenance` objects, so they get the same
 * disclosure as every other claim on the page — the label's sentence one click
 * away rather than in a `title=` tooltip nobody on a tablet can reach.
 */
function TimingCitation({ citation }: { citation?: Provenance }) {
  return <CitationDisclosure citation={citation} />
}

/**
 * The short answer, next to the regimen and dose it belongs with — what to take, how
 * much, and now when — so a reader never has to scroll into the Evidence zone to learn
 * the one fact she actually asked for. One line per drug, real answer even when that
 * answer is "any consistent time": a missing row reads as "we don't know", which is the
 * impression that buried this feature the first time.
 *
 * Never recomputes anything — `timing` is the same `buildTiming` result rendered in full
 * by `<TimingSection>` below, just reformatted. `DoseTiming.suggested` can only ever rest
 * on tolerability or pharmacokinetic grounds (`claimsOutcomeBenefit: false` is enforced in
 * the type itself, see src/report/timing.ts), so naming an hour here never implies the
 * contested cardiovascular-outcome claim — that question stays in the full section, whose
 * verdict the "why" link below points to.
 */
function TimingHeadline({
  run,
  timing,
  t,
}: {
  run: CompletedRun
  timing: PlanTiming
  t: ReturnType<typeof useT>
}) {
  if (!timing.drugs.length) return null
  return (
    <div className="sim-timing-headline">
      <h5>{t('sim.timing.headlineHeading')}</h5>
      <ul className="sim-timing-headline-list">
        {timing.drugs.map((d) => {
          const dose = run.regimen.doses.find((x) => x.substanceId === d.substanceId)
          const perDay = dose && dose.perDay > 1 ? ` × ${dose.perDay}` : ''
          return (
            <li key={d.substanceId}>
              <span lang="en">
                {d.name} {dose ? `${dose.mg} mg${perDay}` : ''}
              </span>
              {' — '}
              {t(TIMING_TIME_LABEL_KEY[d.suggested])}
            </li>
          )
        })}
      </ul>
      <a href="#sim-timing-detail" className="sim-timing-headline-link">
        {t('sim.timing.headlineDetailLink')}
      </a>
    </div>
  )
}

function TimingSection({ timing, t }: { timing: PlanTiming; t: ReturnType<typeof useT> }) {
  return (
    <section id="sim-timing-detail" className="sim-report-section sim-timing">
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

          {/* Directly under the four figures, because this is where a reader
              decides whether to believe them: how much of this result is cited
              and how much estimated, the recommended dose against the label
              that licenses it, and the trial the projected pressure change is
              fitted to — each opening onto the source's own words. */}
          <EvidenceLedger run={run} data={pilsimData} ruleCount={hits.length} />

          {/* What/how much is right above; this is when — the fact a prescriber reads
              as part of the same answer, not a detail to dig for in the Evidence zone.
              Full reasoning and the outcome verdict stay in <TimingSection> below. */}
          <TimingHeadline run={run} timing={timing.plan} t={t} />

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
                    {/* Every one of the 48 rules carries a source AND its
                        verbatim sentence. Showing the sentence is what lets a
                        reader check a fired rule against the label itself. */}
                    <CitationDisclosure citation={h.citation} />
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
        {/* No heading. The only place this section renders is inside the Detail
            zone's disclosure, whose button already reads "What this model does not
            represent" (`sim.detail.limits`) — the identical sentence, one element
            above. The disclosure's label is the heading. */}
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
