/**
 * Pills — the library and the composition bench. Owned by Agent UI-A.
 *
 * Seeded from `data/products.json` rather than starting empty: the eight records are
 * real marketed products, two of them fixed-dose combinations, which is the evidence
 * that "a pill is a composition of substances" is a description of reality and not a
 * modelling convenience. Anything composed here goes through the same rules check.
 *
 * Layout follows the house law — one column of full-width cards in the centre, the
 * body rail on the right — and one task on screen at a time: the library, or one pill,
 * or the composer. Amounts are adjustable everywhere they appear, and every edit is
 * marked as an edit.
 *
 * Substances come from the catalogue PLUS anything the user created on the Substances
 * page, so a molecule invented five minutes ago can be composed into a pill.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../../data/DataProvider'
import type { SubstanceRecord } from '../../data/load'
import { useT } from '../../i18n'
import type { PageId } from '../shell/Sidebar'
import {
  AnatomyRail,
  Badge,
  Card,
  Disclosure,
  LibraryGrid,
  NextStep,
  SearchInput,
  StatusBlock,
} from '../shell/primitives'
import { saveItem } from '../shell/savedStore'
import { takeCompose } from '../shell/handoff'
import { useAllSubstances } from '../substances/substanceStore'
import { Composer, type DraftRow } from './Composer'
import { DeferredNote, EngineOutput, FindingsList, VerdictBanner } from './Findings'
import { PillComposition, PillGridCard } from './PillCard'
import { actives, customPill, pillFromProduct, strengthLine, type Pill } from './model'
import { evaluateComposition, type CompositionEvaluation } from './rulesAdapter'

let draftSeq = 0
const newRow = (): DraftRow => ({ key: `r${++draftSeq}`, substanceId: '', amountMg: '' })

type View = 'library' | 'detail' | 'compose'

/** A composed pill, as persisted. Rebuilt against the substance list on load. */
interface CustomDraft {
  id: string
  name: string
  components: { substanceId: string; amountMg: number | null; form?: string }[]
}

const CUSTOM_KEY = 'pilsim.pills.custom.v1'

function readCustom(): CustomDraft[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (d): d is CustomDraft =>
        Boolean(d) && typeof d.id === 'string' && Array.isArray(d.components),
    )
  } catch {
    return []
  }
}

export function PillsPage({ onNavigate }: { onNavigate?: (p: PageId) => void } = {}) {
  const t = useT()
  const { products, substances, rules, loading, error, reload } = useData()

  // A single-shot mailbox from the Substances page (src/ui/shell/handoff.ts): a set of
  // picked substances, each at its own starting dose. Consumed once, on mount — the
  // component remounts fresh every time App.tsx switches to this page, so a plain
  // useState initializer is enough; a later visit with nothing pending is a clean
  // slate. Landing straight in the composer, already filled in, is the whole point —
  // without this, "select several substances" still dead-ended at an empty form.
  const [handoff] = useState(() => takeCompose())

  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>(() => (handoff ? 'compose' : 'library'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<CustomDraft[]>(readCustom)
  const [draftName, setDraftName] = useState(() => handoff?.name ?? '')
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() =>
    handoff && handoff.substanceIds.length > 0
      ? handoff.substanceIds.map((id) => ({
          key: `r${++draftSeq}`,
          substanceId: id,
          amountMg: handoff.doses[id] == null ? '' : String(handoff.doses[id]),
        }))
      : [newRow(), newRow()],
  )
  /** `pillId::substanceId` -> edited amount. Session only; never written to the data. */
  const [amountEdits, setAmountEdits] = useState<Record<string, number>>({})

  const catalogue: SubstanceRecord[] = useMemo(
    () => substances?.substances ?? [],
    [substances],
  )
  const substanceList = useAllSubstances(catalogue)

  // A composed pill survives a reload, and re-registers itself in the sidebar.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(drafts))
    } catch {
      /* a full or disabled localStorage must not break the page */
    }
  }, [drafts])

  const custom = useMemo(
    () => drafts.map((d) => customPill(d.id, d.name, d.components, substanceList)),
    [drafts, substanceList],
  )

  useEffect(() => {
    for (const pill of custom) {
      saveItem({
        id: pill.id,
        kind: 'pill',
        label: pill.name,
        page: 'pills',
        detail: strengthLine(pill),
      })
    }
  }, [custom])

  const seeded = useMemo(
    () => (products?.products ?? []).map((p) => pillFromProduct(p, substanceList)),
    [products, substanceList],
  )

  const allPills = useMemo(() => [...custom, ...seeded], [custom, seeded])

  /** A pill as the user has adjusted it. With no edits this is the pill itself. */
  const withEdits = useMemo(() => {
    const apply = (pill: Pill): Pill => {
      const edited = pill.components.map((c) => {
        const at = amountEdits[`${pill.id}::${c.substanceId}`]
        return at === undefined ? c : { ...c, amountMg: at }
      })
      return edited.some((c, i) => c !== pill.components[i]) ? { ...pill, components: edited } : pill
    }
    return new Map(allPills.map((p) => [p.id, apply(p)]))
  }, [allPills, amountEdits])

  const evaluations = useMemo(() => {
    const map = new Map<string, CompositionEvaluation>()
    for (const pill of allPills) {
      const shown = withEdits.get(pill.id) ?? pill
      map.set(pill.id, evaluateComposition(rules, { components: shown.components }))
    }
    return map
  }, [allPills, withEdits, rules])

  const draftComponents = useMemo(
    () =>
      draftRows
        .filter((r) => r.substanceId)
        .map((r) => ({
          substanceId: r.substanceId,
          role:
            substanceList.find((s) => s.id === r.substanceId)?.role === 'excipient'
              ? 'excipient'
              : 'active',
          amountMg: r.amountMg.trim() === '' ? null : Number(r.amountMg),
          form: r.form,
        })),
    [draftRows, substanceList],
  )

  const draftEvaluation = useMemo(
    () => evaluateComposition(rules, { components: draftComponents }),
    [rules, draftComponents],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allPills
    return allPills.filter((p) =>
      [p.name, p.genericName ?? '', p.productClass, ...p.components.map((c) => c.name)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [allPills, query])

  const selected = useMemo(
    () => (selectedId ? (withEdits.get(selectedId) ?? null) : null),
    [withEdits, selectedId],
  )

  if (loading) {
    return (
      <PageFrame>
        <StatusBlock kind="loading" message={t('pills.readingLibrary')} />
      </PageFrame>
    )
  }

  if (error) {
    return (
      <PageFrame>
        <StatusBlock
          kind="error"
          title={t('pills.loadError')}
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

  const distinctDraftIds = new Set(draftComponents.map((c) => c.substanceId))
  const hasDuplicate = distinctDraftIds.size !== draftComponents.length
  const draftActives = draftComponents.filter((c) => c.role !== 'excipient')
  const canSave = draftName.trim().length > 0 && draftComponents.length > 0 && !hasDuplicate
  const saveHint = hasDuplicate
    ? t('composer.duplicateHint')
    : draftComponents.length === 0
      ? t('composer.addAtLeastOne')
      : draftName.trim() === ''
        ? t('composer.giveItName')
        : undefined

  const patchRow = (key: string, patch: Partial<DraftRow>) =>
    setDraftRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const save = () => {
    if (!canSave) return
    const draft: CustomDraft = {
      id: `pill_custom_${Date.now()}`,
      name: draftName.trim(),
      components: draftComponents.map((c) => ({
        substanceId: c.substanceId,
        amountMg: c.amountMg,
        form: c.form,
      })),
    }
    setDrafts((prev) => [draft, ...prev])
    setSelectedId(draft.id)
    setView('detail')
    setDraftName('')
    setDraftRows([newRow(), newRow()])
  }

  const openLibrary = () => {
    setSelectedId(null)
    setView('library')
  }

  const setAmount = (pillId: string, substanceId: string, raw: string) => {
    const key = `${pillId}::${substanceId}`
    setAmountEdits((prev) => {
      const next = { ...prev }
      const trimmed = raw.trim()
      if (trimmed === '') {
        delete next[key]
        return next
      }
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return prev
      next[key] = n
      return next
    })
  }

  const revertAmount = (pillId: string, substanceId: string) =>
    setAmountEdits((prev) => {
      const next = { ...prev }
      delete next[`${pillId}::${substanceId}`]
      return next
    })

  const selectedEvaluation =
    selected != null
      ? (evaluations.get(selected.id) ??
        evaluateComposition(rules, { components: selected.components }))
      : null

  // ------------------------------------------------------------------ compose
  if (view === 'compose') {
    const draftActiveIds = draftActives.map((c) => c.substanceId)
    return (
      <PageFrame
        rail={
          <AnatomyRail
            substanceIds={draftActiveIds}
            caption={t('pills.rail.composeCaption')}
            empty={t('pills.rail.composeEmpty')}
          />
        }
      >
        <div className="pill-focus view-enter">
          <div className="pill-focus-head">
            <div className="pill-focus-title">{t('pills.composeTitle')}</div>
            <button type="button" className="btn" onClick={openLibrary}>
              {t('pills.allPills')}
            </button>
          </div>

          <div className="pill-two">
            <Composer
              name={draftName}
              rows={draftRows}
              substances={substanceList}
              canSave={canSave}
              saveHint={saveHint}
              onNameChange={setDraftName}
              onRowChange={patchRow}
              onAddRow={() => setDraftRows((rows) => [...rows, newRow()])}
              onRemoveRow={(key) =>
                setDraftRows((rows) =>
                  rows.length > 1 ? rows.filter((r) => r.key !== key) : rows,
                )
              }
              onSave={save}
              onClear={() => {
                setDraftName('')
                setDraftRows([newRow(), newRow()])
              }}
            >
              {hasDuplicate ? (
                <p className="note-line" style={{ color: 'var(--bad)' }}>
                  {t('pills.duplicateSubstance')}
                </p>
              ) : null}
            </Composer>

            <Card
              title={t('pills.safetyCheck')}
              subtitle={
                draftComponents.length === 0
                  ? t('pills.runsOnFirst')
                  : t('pills.activeExcipientCount', {
                      active: draftActives.length,
                      excipient: draftComponents.length - draftActives.length,
                    })
              }
            >
              {draftComponents.length === 0 ? (
                <p className="prose">{t('pills.twoActivesHint')}</p>
              ) : (
                <>
                  <VerdictBanner evaluation={draftEvaluation} />
                  <FindingsList evaluation={draftEvaluation} />
                  <EngineOutput evaluation={draftEvaluation} />
                  <DeferredNote evaluation={draftEvaluation} />
                </>
              )}
            </Card>
          </div>

          <CheckScopeCard />
        </div>
      </PageFrame>
    )
  }

  // ------------------------------------------------------------------- detail
  if (view === 'detail' && selected && selectedEvaluation) {
    const pillEdits: Record<string, number> = {}
    for (const c of selected.components) {
      const at = amountEdits[`${selected.id}::${c.substanceId}`]
      if (at !== undefined) pillEdits[c.substanceId] = at
    }
    const editCount = Object.keys(pillEdits).length

    return (
      <PageFrame
        rail={
          <AnatomyRail
            substanceIds={actives(selected).map((c) => c.substanceId)}
            caption={t('pills.rail.actsOn', { name: selected.name })}
          />
        }
      >
        <div className="pill-focus view-enter">
          <div className="pill-focus-head">
            <div>
              <div className="pill-focus-title">{selected.name}</div>
              <div className="pill-focus-sub mono">{strengthLine(selected)}</div>
            </div>
            <div className="cluster">
              {editCount > 0 ? (
                <Badge tone="modified">{t('pills.doseEdited', { n: editCount })}</Badge>
              ) : null}
              <button type="button" className="btn" onClick={openLibrary}>
                {t('pills.allPills')}
              </button>
            </div>
          </div>

          <div className="pill-two">
            <PillComposition
              pill={selected}
              substances={substanceList}
              overrides={pillEdits}
              onAmount={(substanceId, raw) => setAmount(selected.id, substanceId, raw)}
              onRevert={(substanceId) => revertAmount(selected.id, substanceId)}
            />

            <Card title={t('pills.safetyCheck')} subtitle={t('pills.compositionOnly')}>
              <VerdictBanner evaluation={selectedEvaluation} />
              <FindingsList evaluation={selectedEvaluation} />
              <EngineOutput evaluation={selectedEvaluation} />
              <DeferredNote evaluation={selectedEvaluation} />
            </Card>

            <CheckScopeCard />
          </div>

          {onNavigate ? (
            <NextStep
              title={t('pills.next.choosePatient')}
              actions={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => onNavigate('subject')}
                >
                  {t('pills.pickPatient')}
                </button>
              }
            />
          ) : null}
        </div>
      </PageFrame>
    )
  }

  // ------------------------------------------------------------------ library
  const libraryActives = Array.from(
    new Set(allPills.flatMap((p) => actives(p).map((c) => c.substanceId))),
  )

  return (
    <PageFrame
      rail={
        <AnatomyRail
          substanceIds={libraryActives}
          caption={t('pills.rail.libraryCaption')}
          empty={t('pills.rail.libraryEmpty')}
        />
      }
    >
      <div className="lib-stack">
        <div className="lib-bar lib-bar--sticky">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('pills.searchPlaceholder')}
            count={`${filtered.length}/${allPills.length}`}
          />
          {custom.length > 0 ? (
            <Badge tone="modified">{t('substances.yoursCount', { n: custom.length })}</Badge>
          ) : null}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setView('compose')}
          >
            {t('pills.compose')}
          </button>
        </div>

        {custom.length === 0 ? (
          <p className="note-line">{t('pills.composeEmptyHint')}</p>
        ) : null}

        {filtered.length === 0 ? (
          <Card>
            <StatusBlock
              kind="empty"
              message={t('pills.noPillMatch', { query })}
              action={
                <button type="button" className="btn btn--primary" onClick={() => setView('compose')}>
                  {t('pills.compose')}
                </button>
              }
            />
          </Card>
        ) : (
          <LibraryGrid>
            {filtered.map((pill) => (
              <PillGridCard
                key={pill.id}
                pill={withEdits.get(pill.id) ?? pill}
                evaluation={
                  evaluations.get(pill.id) ??
                  evaluateComposition(rules, { components: pill.components })
                }
                selected={false}
                onSelect={() => {
                  setSelectedId(pill.id)
                  setView('detail')
                }}
              />
            ))}
          </LibraryGrid>
        )}
      </div>

      {onNavigate ? (
        <NextStep
          title={t('pills.next.pickPatient')}
          actions={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onNavigate('subject')}
            >
              {t('pills.pickPatient')}
            </button>
          }
        />
      ) : null}
    </PageFrame>
  )
}

function CheckScopeCard() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Disclosure
      summary={t('pills.checkScope.summary')}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <p className="prose">{t('pills.checkScope.body')}</p>
    </Disclosure>
  )
}

function PageFrame({ children, rail }: { children: ReactNode; rail?: ReactNode }) {
  const t = useT()
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">{t('pills.pageTitle')}</h1>
        <p className="page-sub">{t('pills.pageSub')}</p>
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
