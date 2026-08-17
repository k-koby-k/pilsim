/**
 * Substances — a catalogue you search, and a shelf you work from. Owned by Agent UI-A.
 *
 * THE MODEL (see substanceStore.ts). The database is eventually every substance in
 * existence; the 43 records here are a demo slice. A catalogue that size is never
 * rendered, so the page has two halves:
 *
 *   SEARCH   the whole catalogue, ranked, capped, paged. How things get onto the shelf.
 *   SHELF    the working set — what the user picked or created, as library cards, and
 *            what the Pills page composes from.
 *
 * Opening a card is the heart of the page: every parameter is a real control, sized
 * and chosen per value — a slider where the range is bounded and sourced, a number
 * field where an exact value matters. Editing is a first-class feature, because the
 * audience are pharmacologists who legitimately change numbers.
 *
 * PROVENANCE IS NON-NEGOTIABLE. An edited value is marked as user-entered, shows the
 * sourced value it replaced, and can be reverted. Overrides on catalogue records live
 * in component state and are never written back to the data files; values on
 * user-created substances are theirs, persisted, and carry ESTIMATED provenance.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../../data/DataProvider'
import type { SubstanceRecord } from '../../data/load'
import { useT } from '../../i18n'
import type { ProvenanceStatus } from '../../types'
import type { PageId } from '../shell/Sidebar'
import {
  AnatomyRail,
  Badge,
  Card,
  Disclosure,
  LibraryCard,
  LibraryGrid,
  NextStep,
  NumberField,
  ProvenanceChip,
  ProvenanceDetail,
  ProvenanceLedger,
  Row,
  SearchInput,
  Segmented,
  SegmentedToggles,
  SliderField,
  StatusBlock,
  TextField,
} from '../shell/primitives'
import {
  cardSummary,
  collectMeasuredFields,
  countProvenance,
  humanise,
  pickKeyFields,
  scalarEntries,
  sectionLabel,
  sectionsOf,
  spreadText,
  trim,
  type MeasuredField,
} from './fields'
import { buildIndex, searchCatalog, type CatalogEntry } from './catalog'
import {
  addToWorkingSet,
  createSubstance,
  deleteSubstance,
  isUserSubstance,
  removeFromWorkingSet,
  seedWorkingSet,
  setUserValue,
  updateSubstanceMeta,
  useAllSubstances,
  useUserSubstances,
  useWorkingSet,
} from './substanceStore'
import { requestCompose } from '../shell/handoff'
import { startDoseMg } from '../pills/model'
import {
  evaluateComposition,
  type CompositionComponent,
  type CompositionEvaluation,
} from '../pills/rulesAdapter'
import { FindingsList, VerdictBanner } from '../pills/Findings'

type RoleFilter = 'all' | 'active' | 'excipient'

const ALL_STATUSES: ProvenanceStatus[] = ['CITED', 'ESTIMATED', 'NOT_FOUND']

const statusOptions = (t: ReturnType<typeof useT>) => [
  { value: 'CITED' as const, label: t('substances.status.cited'), variant: 'CITED' },
  { value: 'ESTIMATED' as const, label: t('substances.status.estimated'), variant: 'ESTIMATED' },
  { value: 'NOT_FOUND' as const, label: t('substances.status.notFound'), variant: 'NOT_FOUND' },
]

const roleOptions = (t: ReturnType<typeof useT>) => [
  { value: 'all' as const, label: t('substances.filter.all') },
  { value: 'active' as const, label: t('substances.filter.active') },
  { value: 'excipient' as const, label: t('substances.filter.excipient') },
]

/** How many search results are rendered before "show more". */
const PAGE_SIZE = 12

const isActive = (s: SubstanceRecord) => s.role === 'active' || s.role === 'active_metabolite'

function overrideKey(substanceId: string, path: string): string {
  return `${substanceId}::${path}`
}

export function SubstancesPage({ onNavigate }: { onNavigate?: (p: PageId) => void } = {}) {
  const t = useT()
  const { substances, rules, loading, error, reload } = useData()

  const catalogue: SubstanceRecord[] = useMemo(
    () => substances?.substances ?? [],
    [substances],
  )
  const userRecords = useUserSubstances()
  const workingIds = useWorkingSet()
  const records = useAllSubstances(catalogue)

  const [query, setQuery] = useState('')
  const [searchRole, setSearchRole] = useState<RoleFilter>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [openId, setOpenId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ProvenanceStatus[]>(ALL_STATUSES)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const [showIdentifiers, setShowIdentifiers] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  /**
   * Substances ticked for a combination pill — separate from the shelf, which is
   * everything a user has ever gathered. Picking is a short-lived selection that
   * empties once handed to the composer. A Set, but iteration order still reflects
   * pick order because insertion order is exactly what JS Sets preserve.
   */
  const [picked, setPicked] = useState<Set<string>>(() => new Set())

  // First run seeds the shelf with the active molecules; excipients are a search away.
  useEffect(() => {
    if (catalogue.length > 0) seedWorkingSet(catalogue.filter(isActive).map((s) => s.id))
  }, [catalogue])

  // Built once per catalogue, not per keystroke.
  const index = useMemo(() => buildIndex(records), [records])
  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])

  const results = useMemo(
    () => searchCatalog(index, query, { limit, role: searchRole }),
    [index, query, limit, searchRole],
  )

  const shelf = useMemo(
    () => workingIds.map((id) => byId.get(id)).filter((r): r is SubstanceRecord => Boolean(r)),
    [workingIds, byId],
  )

  // Only the shelf and the open record are ever walked for their measured fields.
  const shelfFields = useMemo(() => {
    const map = new Map<string, MeasuredField[]>()
    for (const record of shelf) map.set(record.id, collectMeasuredFields(record))
    return map
  }, [shelf])

  const open = openId ? (byId.get(openId) ?? null) : null
  const fields = useMemo(
    () => (open ? (shelfFields.get(open.id) ?? collectMeasuredFields(open)) : []),
    [open, shelfFields],
  )
  const counts = useMemo(() => countProvenance(fields), [fields])
  const keyFields = useMemo(() => pickKeyFields(fields, t), [fields, t])
  const fieldByPath = useMemo(() => new Map(fields.map((f) => [f.path, f])), [fields])

  const pickedRecords = useMemo(
    () => Array.from(picked).map((id) => byId.get(id)).filter((r): r is SubstanceRecord => Boolean(r)),
    [picked, byId],
  )

  // Live safety preview of the picks, run the moment two things collide — this is the
  // composition check surfacing before the user has even reached the composer.
  const pickedComponents = useMemo<CompositionComponent[]>(
    () =>
      pickedRecords.map((r) => ({
        substanceId: r.id,
        role: r.role === 'excipient' ? 'excipient' : 'active',
        amountMg: startDoseMg(r) ?? 0,
      })),
    [pickedRecords],
  )

  const pickEvaluation = useMemo(
    () =>
      pickedRecords.length > 0 ? evaluateComposition(rules, { components: pickedComponents }) : null,
    [rules, pickedComponents, pickedRecords.length],
  )

  if (loading) {
    return (
      <PageFrame>
        <StatusBlock kind="loading" message={t('substances.readingLibrary')} />
      </PageFrame>
    )
  }

  if (error) {
    return (
      <PageFrame>
        <StatusBlock
          kind="error"
          title={t('substances.loadError')}
          message={error.message}
          action={
            <button type="button" className="btn btn--primary" onClick={reload}>
              {t('common.retry')}
            </button>
          }
        />
      </PageFrame>
    )
  }

  const mine = open ? isUserSubstance(open) : false

  /** One edit. On a catalogue record it is a session override; on yours it is the value. */
  const setValue = (path: string, raw: string) => {
    if (!open) return
    const trimmed = raw.trim()
    if (mine) {
      setUserValue(open.id, path, trimmed === '' ? null : Number(trimmed))
      return
    }
    setOverrides((prev) => {
      const next = { ...prev }
      if (trimmed === '') {
        delete next[overrideKey(open.id, path)]
        return next
      }
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return prev
      next[overrideKey(open.id, path)] = n
      return next
    })
  }

  const revert = (path: string) => {
    if (!open || mine) return
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[overrideKey(open.id, path)]
      return next
    })
  }

  const toggleStatus = (s: ProvenanceStatus) =>
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const toggleExpanded = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const openCard = (id: string, addToShelf = false) => {
    if (addToShelf) addToWorkingSet(id)
    setOpenId(id)
    setShowAll(false)
    setShowIdentifiers(false)
  }

  const createAndOpen = () => {
    const record = createSubstance()
    openCard(record.id)
  }

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clearPicked = () => setPicked(new Set())

  /**
   * Hand the picks to the Pills composer, prefilled at each substance's own starting
   * dose — never zero, so the composed pill is runnable on the first attempt. See
   * src/ui/shell/handoff.ts for why this needs a mailbox rather than route params.
   */
  const composeFromPicked = () => {
    if (pickedRecords.length === 0) return
    const doses: Record<string, number | null> = {}
    for (const r of pickedRecords) doses[r.id] = startDoseMg(r)
    requestCompose({
      substanceIds: pickedRecords.map((r) => r.id),
      doses,
      name: pickedRecords.map((r) => r.name.split('(')[0].trim()).join(' + '),
    })
    clearPicked()
    onNavigate?.('pills')
  }

  // ------------------------------------------------------------------- detail
  if (open) {
    const visibleFields = fields.filter((f) => statusFilter.includes(f.status))
    const sections = sectionsOf(visibleFields)
    const openOverrides = Object.keys(overrides).filter((k) =>
      k.startsWith(`${open.id}::`),
    ).length
    const onShelf = workingIds.includes(open.id)

    return (
      <PageFrame
        rail={
          <AnatomyRail
            substanceIds={[open.id]}
            caption={t('substances.rail.whereActs', { name: open.name.split('(')[0].trim() })}
          />
        }
      >
        <div className="subs-detail view-enter">
          <div className="spread">
            <div className="grow">
              <div className="subs-headline">
                {mine ? (
                  <TextField
                    value={open.name}
                    size="lg"
                    ariaLabel={t('common.name')}
                    onChange={(v) => updateSubstanceMeta(open.id, { name: v })}
                  />
                ) : (
                  <h2>{open.name}</h2>
                )}
                <RoleBadge role={open.role} />
                {mine ? <Badge tone="modified">{t('common.yours')}</Badge> : null}
                {openOverrides > 0 ? (
                  <Badge tone="modified">{t('substances.editedCount', { n: openOverrides })}</Badge>
                ) : null}
                <span className="subs-id">{open.id}</span>
              </div>
              {mine ? null : open.drug_class ? (
                <p className="subs-class">{String(open.drug_class)}</p>
              ) : null}
            </div>
            <div className="cluster">
              <button
                type="button"
                className="btn"
                onClick={() => (onShelf ? removeFromWorkingSet(open.id) : addToWorkingSet(open.id))}
              >
                {onShelf ? t('substances.removeFromShelf') : t('substances.addToShelf')}
              </button>
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                {t('substances.backToShelf')}
              </button>
            </div>
          </div>

          {mine ? (
            <Card title={t('substances.identity')}>
              <div className="keygrid">
                <div className="field">
                  <span className="field-label">{t('common.role')}</span>
                  <Segmented
                    ariaLabel={t('common.role')}
                    value={open.role === 'excipient' ? 'excipient' : 'active'}
                    options={[
                      { value: 'active', label: t('common.active') },
                      { value: 'excipient', label: t('common.excipient') },
                    ]}
                    onChange={(v) => updateSubstanceMeta(open.id, { role: v })}
                  />
                </div>
                <div className="field">
                  <span className="field-label">{t('common.class')}</span>
                  <TextField
                    value={typeof open.drug_class === 'string' ? open.drug_class : ''}
                    placeholder={t('substances.classPlaceholder')}
                    ariaLabel={t('common.class')}
                    onChange={(v) => updateSubstanceMeta(open.id, { drug_class: v })}
                  />
                </div>
              </div>
              <div className="field-foot" style={{ marginTop: 'var(--gap-group)' }}>
                <span>{t('substances.everyValueEstimated')}</span>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => {
                    deleteSubstance(open.id)
                    setOpenId(null)
                  }}
                >
                  {t('substances.delete')}
                </button>
              </div>
            </Card>
          ) : null}

          <Card
            title={t('substances.keyParameters')}
            actions={
              openOverrides > 0 ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() =>
                    setOverrides((prev) =>
                      Object.fromEntries(
                        Object.entries(prev).filter(([k]) => !k.startsWith(`${open.id}::`)),
                      ),
                    )
                  }
                >
                  {t('substances.resetEdits', { n: openOverrides })}
                </button>
              ) : null
            }
          >
            {keyFields.length === 0 ? (
              <p className="prose">{t('substances.noMeasuredValues')}</p>
            ) : (
              <div className="keygrid">
                {keyFields.map((f) => (
                  <ParamField
                    key={f.path}
                    field={f}
                    byPath={fieldByPath}
                    override={mine ? undefined : overrides[overrideKey(open.id, f.path)]}
                    userOwned={mine}
                    expanded={expanded.has(f.path)}
                    onToggle={() => toggleExpanded(f.path)}
                    onChange={(v) => setValue(f.path, v)}
                    onRevert={() => revert(f.path)}
                  />
                ))}
              </div>
            )}

            <hr className="hr" />

            <div className="subs-sourcing">
              <div className="grow" style={{ minWidth: 200 }}>
                <ProvenanceLedger
                  cited={counts.cited}
                  estimated={counts.estimated}
                  notFound={counts.notFound}
                />
              </div>
            </div>
          </Card>

          <Disclosure
            summary={t('common.allParameters')}
            meta={`${counts.total}`}
            open={showAll}
            onToggle={() => setShowAll((v) => !v)}
            flush
          >
            <div
              className="spread"
              style={{ alignItems: 'center', padding: 'var(--pad-tight) var(--pad-box)' }}
            >
              <SegmentedToggles
                ariaLabel={t('substances.filterByStatus')}
                options={statusOptions(t)}
                values={statusFilter}
                onToggle={toggleStatus}
              />
            </div>

            {sections.length === 0 ? (
              <div className="mtable-empty">{t('substances.noFilterMatch')}</div>
            ) : (
              sections.map((section) => {
                const rows = visibleFields.filter((f) => f.section === section)
                return (
                  <div key={section}>
                    <div className="mtable-section">
                      {sectionLabel(section, t)} <span>· {rows.length}</span>
                    </div>
                    <div className="mtable">
                      <div className="mtable-head">
                        <span>{t('substances.field')}</span>
                        <span style={{ textAlign: 'right' }}>{t('substances.value')}</span>
                        <span className="mcol-spread">{t('substances.rangeSpread')}</span>
                        <span>{t('substances.source')}</span>
                        <span />
                      </div>
                      {rows.map((f) => (
                        <FieldRow
                          key={f.path}
                          field={f}
                          override={mine ? undefined : overrides[overrideKey(open.id, f.path)]}
                          userOwned={mine}
                          expanded={expanded.has(f.path)}
                          onToggle={() => toggleExpanded(f.path)}
                          onChange={(v) => setValue(f.path, v)}
                          onRevert={() => revert(f.path)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </Disclosure>

          <IdentityDisclosure
            record={open}
            open={showIdentifiers}
            onToggle={() => setShowIdentifiers((v) => !v)}
          />

          {onNavigate ? (
            <NextStep
              title={t('substances.next.putInPill')}
              actions={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => onNavigate('pills')}
                >
                  {t('substances.goToPills')}
                </button>
              }
            />
          ) : null}
        </div>
      </PageFrame>
    )
  }

  // ------------------------------------------------------------------ library
  const shelfActives = shelf.filter(isActive).map((s) => s.id)

  return (
    <PageFrame
      rail={
        <AnatomyRail
          substanceIds={shelfActives}
          caption={t('substances.rail.shelfCaption')}
          empty={t('substances.rail.shelfEmpty')}
        />
      }
    >
      <div className="lib-stack">
        <div className="lib-bar lib-bar--sticky">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setLimit(PAGE_SIZE)
            }}
            placeholder={t('substances.searchPlaceholder')}
            count={query ? `${results.total}${results.capped ? '+' : ''}` : `${records.length}`}
          />
          <Segmented
            ariaLabel={t('substances.filter.all')}
            options={roleOptions(t)}
            value={searchRole}
            onChange={(v) => {
              setSearchRole(v)
              setLimit(PAGE_SIZE)
            }}
          />
          <button type="button" className="btn btn--primary" onClick={createAndOpen}>
            {t('substances.newSubstance')}
          </button>
        </div>

        {pickedRecords.length > 0 ? (
          <PickTray
            records={pickedRecords}
            evaluation={pickEvaluation}
            onRemove={togglePick}
            onClear={clearPicked}
            onCompose={composeFromPicked}
          />
        ) : null}

        {query.trim() ? (
          <Card
            flush
            title={t('substances.catalogue')}
            subtitle={
              results.total === 0
                ? t('substances.noMatchShort')
                : t('substances.matchCount', { total: results.total, capped: results.capped })
            }
          >
            {results.items.length === 0 ? (
              <div className="mtable-empty">
                {t('substances.noMatch', { query })}
              </div>
            ) : (
              <div className="mtable">
                {results.items.map((entry) => (
                  <ResultRow
                    key={entry.id}
                    entry={entry}
                    onShelf={workingIds.includes(entry.id)}
                    picked={picked.has(entry.id)}
                    onOpen={() => openCard(entry.id, true)}
                    onAdd={() => addToWorkingSet(entry.id)}
                    onPick={() => togglePick(entry.id)}
                  />
                ))}
                {results.total > results.items.length ? (
                  <div className="mtable-more">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    >
                      {t('substances.showMore', {
                        n: Math.min(PAGE_SIZE, results.total - results.items.length),
                      })}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}

        <div>
          <div className="lib-section-head">
            {t('substances.yourShelf')} <span>{shelf.length}</span>
            {userRecords.length > 0 ? (
              <Badge tone="modified">{t('substances.yoursCount', { n: userRecords.length })}</Badge>
            ) : null}
          </div>

          {shelf.length === 0 ? (
            <Card>
              <StatusBlock
                kind="empty"
                title={t('substances.shelfEmptyTitle')}
                message={t('substances.shelfEmptyMessage')}
              />
            </Card>
          ) : (
            <LibraryGrid>
              {shelf.map((record) => (
                <SubstanceCard
                  key={record.id}
                  record={record}
                  fields={shelfFields.get(record.id) ?? []}
                  picked={picked.has(record.id)}
                  onOpen={() => openCard(record.id)}
                  onPick={() => togglePick(record.id)}
                />
              ))}
            </LibraryGrid>
          )}
        </div>
      </div>

      {onNavigate ? (
        <NextStep
          title={t('substances.next.compose')}
          actions={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onNavigate('pills')}
            >
              {t('substances.goToPills')}
            </button>
          }
        />
      ) : null}
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------

/** One catalogue hit. Compact by design — the catalogue is scanned, not browsed. */
function ResultRow({
  entry,
  onShelf,
  picked,
  onOpen,
  onAdd,
  onPick,
}: {
  entry: CatalogEntry
  onShelf: boolean
  picked: boolean
  onOpen: () => void
  onAdd: () => void
  onPick: () => void
}) {
  const t = useT()
  return (
    <div className="result-row">
      <button
        type="button"
        className={picked ? 'result-pick result-pick--picked' : 'result-pick'}
        role="checkbox"
        aria-checked={picked}
        aria-label={
          picked
            ? t('substances.deselect', { name: entry.name })
            : t('substances.select', { name: entry.name })
        }
        onClick={onPick}
      >
        <span className="result-pick-box" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="m2.6 6.2 2.3 2.3 4.5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <button type="button" className="result-main" onClick={onOpen}>
        <span className="result-name">{entry.name.split('(')[0].trim()}</span>
        {entry.kind ? <span className="result-kind">{shorten(entry.kind)}</span> : null}
      </button>
      <span className="dim mono">{entry.role === 'excipient' ? t('common.excipient') : t('common.active')}</span>
      {onShelf ? (
        <span className="dim">{t('substances.onShelf')}</span>
      ) : (
        <button type="button" className="btn btn--sm" onClick={onAdd}>
          {t('substances.addShort')}
        </button>
      )}
    </div>
  )
}

function shorten(s: string): string {
  const clause = s.split(/[,;(]/)[0].trim()
  return clause.length > 42 ? `${clause.slice(0, 41).trimEnd()}…` : clause
}

function SubstanceCard({
  record,
  fields,
  picked,
  onOpen,
  onPick,
}: {
  record: SubstanceRecord
  fields: MeasuredField[]
  picked: boolean
  onOpen: () => void
  onPick: () => void
}) {
  const summary = cardSummary(record, fields)
  const counts = countProvenance(fields)
  const flags = Array.isArray(record.patient_flags) ? record.patient_flags : []
  const mine = isUserSubstance(record)
  const plainName = record.name.split('(')[0].trim()

  const t = useT()
  return (
    <LibraryCard
      title={plainName}
      subtitle={summary.plain ?? summary.className ?? undefined}
      mine={mine}
      picked={picked}
      pickLabel={picked ? t('substances.deselect', { name: plainName }) : t('substances.select', { name: plainName })}
      onPick={onPick}
      tags={
        <>
          {mine ? <Badge tone="modified">{t('common.yours')}</Badge> : null}
          {summary.className ? (
            <Badge tone={isActive(record) ? 'accent' : undefined}>{summary.className}</Badge>
          ) : null}
          {record.role === 'active_metabolite' ? <Badge tone="modified">{t('substances.metaboliteTag')}</Badge> : null}
          {flags.length > 0 ? <Badge tone="warn">{humanise(String(flags[0]))}</Badge> : null}
        </>
      }
      stats={summary.stats}
      meta={mine ? t('substances.userEnteredValues', { n: counts.total }) : t('substances.citedOfTotal', { cited: counts.cited, total: counts.total })}
      onClick={onOpen}
    />
  )
}

/**
 * What is picked, how many, a way to clear it, and the one action that matters:
 * hand them to the composer. The safety check runs live on the picks themselves —
 * two RAAS blockers should object to each other here, before a pill even exists,
 * because that is the more convincing demonstration of what the engine is for.
 */
function PickTray({
  records,
  evaluation,
  onRemove,
  onClear,
  onCompose,
}: {
  records: SubstanceRecord[]
  evaluation: CompositionEvaluation | null
  onRemove: (id: string) => void
  onClear: () => void
  onCompose: () => void
}) {
  const t = useT()
  const n = records.length
  const hasFindings =
    evaluation !== null &&
    evaluation.blockers.length +
      evaluation.overrides.length +
      evaluation.warnings.length +
      evaluation.positives.length >
      0

  return (
    <Card className="pick-tray view-enter">
      <div className="pick-tray-head">
        <div className="grow">
          <div className="pick-tray-title">
            {t('substances.substancesSelected', { n })}
          </div>
          <div className="pick-tray-chips">
            {records.map((r) => (
              <span className="pick-chip" key={r.id}>
                {r.name.split('(')[0].trim()}
                <button
                  type="button"
                  aria-label={t('substances.removeFromSelection', { name: r.name })}
                  onClick={() => onRemove(r.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="cluster">
          <button type="button" className="btn btn--sm" onClick={onClear}>
            {t('common.clear')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onCompose}>
            {t('substances.createPillFrom', { n })}
          </button>
        </div>
      </div>

      {hasFindings && evaluation ? (
        <div className="pick-tray-check">
          <VerdictBanner evaluation={evaluation} />
          <FindingsList evaluation={evaluation} />
        </div>
      ) : n > 1 ? (
        <p className="note-line">{t('substances.noConflictYet')}</p>
      ) : null}
    </Card>
  )
}

function PageFrame({
  children,
  rail,
}: {
  children: ReactNode
  rail?: ReactNode
}) {
  const t = useT()
  return (
    <div className="page">
      <header className="page-head">
        <div className="spread">
          <h1 className="page-title">{t('substances.pageTitle')}</h1>
        </div>
        <p className="page-sub">{t('substances.pageSub')}</p>
      </header>
      <div className="page-body">
        {rail ? (
          <div className="page-split">
            <div className="page-col">{children}</div>
            <aside className="rail">{rail}</aside>
          </div>
        ) : (
          <div className="page-col">{children}</div>
        )}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const t = useT()
  if (role === 'excipient') return <Badge>{t('common.excipient')}</Badge>
  if (role === 'active_metabolite') return <Badge tone="modified">{t('common.metabolite')}</Badge>
  return <Badge tone="ok">{t('common.active')}</Badge>
}

/** Registry identifiers and synonyms. Reference material, so it is folded away. */
function IdentityDisclosure({
  record,
  open,
  onToggle,
}: {
  record: SubstanceRecord
  open: boolean
  onToggle: () => void
}) {
  const t = useT()
  const ids = scalarEntries(record.identifiers)
  const synonyms = record.synonyms ?? []
  const atc = record.atc_codes ?? []

  if (ids.length === 0 && synonyms.length === 0 && atc.length === 0) return null

  return (
    <Disclosure
      summary={t('common.identifiersAndSynonyms')}
      meta={`${ids.length + atc.length}`}
      open={open}
      onToggle={onToggle}
    >
      <div className="kv-grid">
        {atc.length > 0 ? (
          <Row label="ATC" mono>
            {atc.join(', ')}
          </Row>
        ) : null}
        {ids.map(([k, v]) => (
          <Row key={k} label={k} mono>
            {v}
          </Row>
        ))}
      </div>
      {synonyms.length > 0 ? (
        <>
          <hr className="hr" />
          <Row label={t('common.synonyms')} wide>
            <span className="dim" style={{ fontSize: 'var(--fs-xs)' }}>
              {synonyms.join(' · ')}
            </span>
          </Row>
        </>
      ) : null}
    </Disclosure>
  )
}

// ---------------------------------------------------------------------------
// Editable parameters
// ---------------------------------------------------------------------------

interface Bounds {
  min: number
  max: number
  step: number
  band: [number, number] | null
}

/**
 * Slider or number field? A slider only where the range is genuinely bounded — a
 * fraction, a dose inside its own approved ceiling, or a value whose source quotes a
 * range. Anything open-ended gets a number field, because a slider on an unbounded
 * value invents a maximum that nobody sourced.
 */
function boundsFor(field: MeasuredField, byPath: Map<string, MeasuredField>): Bounds | null {
  const m = field.measured
  const range =
    Array.isArray(m.range) && m.range.length === 2 && m.range[1] > m.range[0]
      ? ([m.range[0], m.range[1]] as [number, number])
      : null

  if (/fraction$/.test(field.path)) {
    return { min: 0, max: 1, step: 0.01, band: range }
  }

  if (field.path === 'dosing.typical_adult_start_mg') {
    const ceiling = byPath.get('dosing.max_daily_mg')?.measured.value
    if (typeof ceiling === 'number' && ceiling > 0) {
      return { min: 0, max: ceiling, step: stepFor(ceiling), band: range }
    }
  }

  if (range) {
    const pad = (range[1] - range[0]) * 0.5
    const min = range[0] - pad < 0 ? 0 : round(range[0] - pad)
    const max = round(range[1] + pad)
    return { min, max, step: stepFor(max - min), band: range }
  }

  return null
}

function stepFor(span: number): number {
  if (span <= 1) return 0.01
  if (span <= 10) return 0.1
  if (span <= 200) return 0.5
  return 1
}

function round(n: number): number {
  return Number(n.toPrecision(3))
}

/**
 * One editable parameter. The value is a control, not text that happens to take a
 * click; and when it has been changed, the row says so and says what it was.
 */
function ParamField({
  field,
  byPath,
  override,
  userOwned,
  expanded,
  onToggle,
  onChange,
  onRevert,
}: {
  field: MeasuredField
  byPath: Map<string, MeasuredField>
  override: number | undefined
  /** The record belongs to the user, so an edit is the value rather than an override. */
  userOwned: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (raw: string) => void
  onRevert: () => void
}) {
  const t = useT()
  const m = field.measured
  const sourceValue = typeof m.value === 'number' ? m.value : null
  const isModified = override !== undefined
  const shown = isModified ? override : sourceValue
  const bounds = boundsFor(field, byPath)

  return (
    <div className={isModified ? 'keyrow keyrow--modified' : 'keyrow'}>
      {bounds ? (
        <SliderField
          label={field.label}
          value={shown}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          band={bounds.band}
          unit={m.unit}
          modified={isModified}
          ariaLabel={field.label}
          onChange={(n) => onChange(String(n))}
          onText={onChange}
        />
      ) : (
        <>
          <div className="keyrow-label">{field.label}</div>
          <div className="keyrow-main">
            <NumberField
              value={shown}
              size="lg"
              unit={m.unit}
              modified={isModified}
              ariaLabel={field.label}
              onChange={onChange}
            />
          </div>
        </>
      )}

      <div className="keyrow-foot">
        {isModified ? (
          <>
            <Badge tone="modified">{t('common.edited')}</Badge>
            <span>
              {t('common.was', {
                value: `${sourceValue === null ? '—' : trim(sourceValue)}${m.unit ? ` ${m.unit}` : ''}`,
              })}
            </span>
            <button type="button" className="btn btn--sm" onClick={onRevert}>
              {t('common.revert')}
            </button>
          </>
        ) : userOwned ? (
          <Badge tone="modified">{t('common.userEntered')}</Badge>
        ) : (
          <ProvenanceChip provenance={m.provenance} onClick={onToggle} />
        )}
      </div>

      {expanded ? <ProvenanceDetail provenance={m.provenance} /> : null}
    </div>
  )
}

function FieldRow({
  field,
  override,
  userOwned,
  expanded,
  onToggle,
  onChange,
  onRevert,
}: {
  field: MeasuredField
  override: number | undefined
  userOwned: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (raw: string) => void
  onRevert: () => void
}) {
  const t = useT()
  const m = field.measured
  const sourceValue = typeof m.value === 'number' ? m.value : null
  const isModified = override !== undefined
  const shown = isModified ? override : sourceValue

  return (
    <div className={isModified ? 'mrow mrow--modified' : 'mrow'}>
      <div className="mrow-grid">
        <div className="mrow-name">
          {field.label}
          <span className="mrow-path" title={field.path}>
            {field.subPath}
          </span>
        </div>

        <NumberField
          value={shown}
          full
          unit={m.unit}
          modified={isModified}
          placeholder={sourceValue === null ? t('substances.valuePlaceholderNone') : '—'}
          ariaLabel={field.label}
          onChange={onChange}
        />

        <span className="mrow-spread">
          {isModified
            ? t('common.was', { value: sourceValue === null ? '—' : trim(sourceValue) })
            : spreadText(m)}
        </span>

        <span className="chips">
          {isModified ? (
            <>
              <Badge tone="modified" title={t('substances.editedTitle')}>
                {t('common.edited')}
              </Badge>
              <button type="button" className="btn btn--sm" onClick={onRevert}>
                {t('common.revert')}
              </button>
            </>
          ) : userOwned ? (
            <Badge tone="modified">{t('common.userEntered')}</Badge>
          ) : (
            <ProvenanceChip provenance={m.provenance} onClick={onToggle} />
          )}
        </span>

        <button
          type="button"
          className="mrow-expand"
          aria-expanded={expanded}
          aria-label={expanded ? t('substances.hideSource') : t('substances.showSource')}
          onClick={onToggle}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {expanded ? (
        <div className="mrow-drawer">
          <ProvenanceDetail provenance={m.provenance} />
        </div>
      ) : null}
    </div>
  )
}
