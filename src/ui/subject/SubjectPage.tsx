/**
 * Test subjects — a library of digital twins.
 *
 * LAID OUT AGAINST research/10-LAYOUT-BLUEPRINT.md, which is the authority.
 *
 * THE FRAME (§1), the same on every page: navigation on the left, ONE content
 * column in the centre, the anatomy rail on the right at 360–420px. The body is
 * a permanent fixture, not a panel in the flow, and it shows the selected
 * subject's UNTREATED baseline physiology — every drug concentration and every
 * target engagement in that frame is zero — so editing a patient visibly
 * changes a body before any drug is given. It says so on itself.
 *
 * THE CENTRE COLUMN IS FOUR ZONES (§2, §3), in this order, in both views:
 *
 *   ACT      the library, and adding or editing a patient. In the editor this
 *            is the form itself — six named groups, each saying what the
 *            product does with it.
 *   ANSWER   the derived twin: the headline physiology this patient implies.
 *   EVIDENCE which comorbidity moved which named state variable, and by how
 *            much. Absent when no condition is applied, because there is then
 *            nothing to explain — the Answer zone says so instead.
 *   DETAIL   the full derived state, the modifier audit trail, the derivation
 *            warnings. Collapsed.
 *
 * A wizard would be legitimate here — §7 says data entry may be stepped — but
 * the six groups fit one flow with a quick jump over them, so this stays
 * grouped rather than stepped, and the completeness strip says how far in the
 * reader is.
 *
 * Humans only. The model is validated for adults; paediatric maturation functions are not
 * implemented and the age control is bounded accordingly.
 */

import { useCallback, useMemo, useState } from 'react'
import type { PageId } from '../shell/Sidebar'
import {
  Completeness,
  Consequence,
  LibraryGrid,
  NextStep,
  StatusBlock,
  Zone,
} from '../shell/primitives'
import { LiverReactors, OrganFigure } from '../organs'
import { useT } from '../../i18n'
import './subject.css'
import { baselineFrameFromTwin } from './baselineBridge'
import { DerivedPanel, TwinHeadline } from './DerivedPanel'
import { ParameterPanel } from './ParameterPanel'
import { refRangesFrom, usePatientModel } from './patientModel'
import { SUBJECT_SEEDS } from './library'
import { SubjectCard } from './SubjectCard'
import {
  addSubject,
  deleteSubject,
  duplicateSubject,
  selectSubject,
  updateInputs,
  updateSubject,
  restoreSeeds,
  useSelectedId,
  useSubjects,
} from './subjectStore'
import { deriveTwinSafe, useTwin } from './twinAdapter'

export function SubjectPage({ onNavigate }: { onNavigate?: (p: PageId) => void } = {}) {
  const t = useT()
  const { model, error, loading } = usePatientModel()
  const subjects = useSubjects()
  const selectedId = useSelectedId()
  const [editingId, setEditingId] = useState<string | null>(null)

  const selected = subjects.find((s) => s.id === selectedId) ?? subjects[0]
  const editing = editingId ? (subjects.find((s) => s.id === editingId) ?? null) : null

  /** Condition id -> human label, for the card badges. */
  const conditionLabel = useMemo(() => {
    const presets = model?.comorbidity_presets ?? {}
    const out: Record<string, string> = {}
    for (const [id, p] of Object.entries(presets)) {
      if (id.startsWith('_')) continue
      out[id] = typeof p?.label === 'string' ? p.label : id
    }
    return out
  }, [model])

  /** One derivation pass for the whole library, so each card can show its own eGFR. */
  const cardData = useMemo(() => {
    const out: Record<string, { egfr: number | undefined; phenotype: string }> = {}
    for (const s of subjects) {
      const t = deriveTwinSafe(s.inputs, model)
      out[s.id] = {
        egfr: t.state.vars.egfr_ckdepi2021,
        phenotype: t.categoricals.cyp2d6_phenotype ?? '',
      }
    }
    return out
  }, [subjects, model])

  // The rail follows whichever subject the reader is working on: the one being edited,
  // otherwise the one selected for simulation. One figure, one place, always live.
  const railSubject = editing ?? selected
  const railTwin = useTwin(railSubject?.inputs ?? EMPTY_INPUTS, model)
  const railFrame = useMemo(() => baselineFrameFromTwin(railTwin.state), [railTwin.state])
  const refRanges = useMemo(() => refRangesFrom(model), [model])

  // The same selected patient with no condition applied — the diff baseline the
  // headline chips mark themselves against. Same derivation, no extra work in
  // the common case where nothing is applied.
  const railReferenceInputs = useMemo(
    () => ({ ...(railSubject?.inputs ?? EMPTY_INPUTS), comorbidities: [] }),
    [railSubject],
  )
  const railReference = useTwin(railReferenceInputs, model)

  // Deleting every shipped scenario is easy and irreversible without this; the button only
  // appears once something is actually missing, so it costs nothing in the normal case.
  const have = new Set(subjects.map((s) => s.id))
  const missingSeeds = SUBJECT_SEEDS.filter((s) => !have.has(s.id)).length

  if (loading) return <StatusBlock kind="loading" title={t('subject.loadingModel')} />

  return (
    <div className="subj-page">
      <div className="subj-shell">
        <div className="subj-centre">
          {error && (
            <p className="subj-note subj-note-warn subj-banner">
              {t('subject.modelLoadError', { error })}
            </p>
          )}

          {editing ? (
            <SubjectEditor
              key={editing.id}
              subjectId={editing.id}
              label={editing.label}
              interesting={editing.interesting}
              inputs={editing.inputs}
              model={model}
              onBack={() => setEditingId(null)}
              onNavigate={onNavigate}
            />
          ) : (
            <>
              {/* ============================================ ZONE 1 — ACT === */}
              <Zone
                kind="act"
                id="subj-act"
                title={t('subject.zone.act')}
                lead={t('subject.zone.actLead')}
                aside={
                  <div className="cluster">
                    {missingSeeds > 0 && (
                      <button type="button" className="btn btn--sm" onClick={restoreSeeds}>
                        {t('subject.restoreScenarios', { n: missingSeeds })}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => setEditingId(addSubject().id)}
                    >
                      {t('subject.addSubject')}
                    </button>
                  </div>
                }
              >
                {subjects.length === 0 ? (
                  <Consequence tone="warn">{t('subject.emptyLibrary')}</Consequence>
                ) : (
                  <LibraryGrid>
                    {subjects.map((s) => (
                      <SubjectCard
                        key={s.id}
                        subject={s}
                        egfr={cardData[s.id]?.egfr}
                        phenotype={cardData[s.id]?.phenotype ?? ''}
                        conditionLabels={(s.inputs.comorbidities ?? []).map((c) => conditionLabel[c] ?? c)}
                        selected={s.id === selectedId}
                        onSelect={() => selectSubject(s.id)}
                        onEdit={() => {
                          selectSubject(s.id)
                          setEditingId(s.id)
                        }}
                        onDuplicate={() => setEditingId(duplicateSubject(s.id)?.id ?? null)}
                        onDelete={() => deleteSubject(s.id)}
                      />
                    ))}
                  </LibraryGrid>
                )}
              </Zone>

              {/* ========================================= ZONE 2 — ANSWER ===
                  Selecting a subject IS the act on this view, so the twin that
                  selection implies is the answer. Absent until something is
                  selected, rather than an empty panel holding its place. */}
              {selected && (
                <Zone
                  kind="answer"
                  id="subj-answer"
                  title={t('subject.zone.answer')}
                  lead={t('subject.zone.answerLead')}
                >
                  <section className="subj-card">
                    <TwinHeadline
                      twin={railTwin.state}
                      reference={railReference.state}
                      source={railTwin.source}
                      categoricals={railTwin.categoricals}
                    />
                  </section>
                </Zone>
              )}

              {/* Forward motion — always visible, blueprint §7 pattern 5. */}
              {selected && onNavigate && (
                <NextStep
                  title={t('subject.isSelected', { label: selected.label })}
                  description={t('subject.runRegimen')}
                  actions={
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => onNavigate('simulation')}
                    >
                      {t('subject.runSimulation')}
                    </button>
                  }
                />
              )}
            </>
          )}
        </div>

        <aside className="subj-rail" aria-label={t('subject.affectedAnatomyAria')}>
          <OrganFigure
            frame={railFrame}
            variant="rail"
            refRanges={refRanges}
            caption={railSubject?.label ?? t('subject.untreatedBaseline')}
            gates={
              railSubject?.inputs.pregnant
                ? {
                    pregnancyBarrier: true,
                    note: t('subject.pregnancyGate'),
                  }
                : undefined
            }
          />
        </aside>
      </div>
    </div>
  )
}

/** Only reached before the store has produced its first subject. */
const EMPTY_INPUTS: import('../../types').PatientInputs = {
  age_years: 45,
  sex: 'male',
  weight_kg: 73,
  height_cm: 176,
  sbp_mmHg: 118,
  dbp_mmHg: 72,
  hr_bpm: 70,
  serum_creatinine_mg_dl: 0.9,
  comorbidities: [],
}

// ---------------------------------------------------------------------------
// The editor — the same four zones, one per idea, stacked.
// ---------------------------------------------------------------------------

function SubjectEditor({
  subjectId,
  label,
  interesting,
  inputs,
  model,
  onBack,
  onNavigate,
}: {
  subjectId: string
  label: string
  interesting: string
  inputs: import('../../types').PatientInputs
  model: import('./patientModel').PatientModelFile | null
  onBack: () => void
  onNavigate?: (p: PageId) => void
}) {
  const t = useT()
  const onChange = useCallback(
    (patch: Partial<import('../../types').PatientInputs>) => updateInputs(subjectId, patch),
    [subjectId],
  )

  // The same patient with no condition applied — the diff baseline that makes an added
  // illness visibly move named state variables rather than just attach a label.
  const referenceInputs = useMemo(() => ({ ...inputs, comorbidities: [] }), [inputs])

  const { state: twin, source, categoricals, presetEffects } = useTwin(inputs, model)
  const { state: reference } = useTwin(referenceInputs, model)

  const frame = useMemo(() => baselineFrameFromTwin(twin), [twin])

  const conditionsApplied = twin.appliedPresets.length > 0

  return (
    <div className="subj-editor">
      <header className="subj-head">
        <div className="subj-head-id">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onBack}>
            {t('subject.library')}
          </button>
          <input
            className="subj-title-input"
            value={label}
            aria-label={t('subject.subjectName')}
            onChange={(e) => updateSubject(subjectId, { label: e.target.value })}
          />
        </div>
        {onNavigate && (
          <button type="button" className="btn btn--primary" onClick={() => onNavigate('simulation')}>
            {t('subject.editor.continue')}
          </button>
        )}
      </header>

      {interesting && <p className="subj-why">{interesting}</p>}

      {/* ================================================== ZONE 1 — ACT === */}
      <Zone
        kind="act"
        id="subj-edit-act"
        title={t('subject.editor.zoneAct')}
        lead={t('subject.editor.zoneActLead')}
        aside={
          <Completeness
            items={[
              { label: t('subject.group.who'), done: true },
              { label: t('subject.group.body'), done: true },
              { label: t('subject.group.circulation'), done: true },
              { label: t('subject.group.kidney'), done: inputs.serum_creatinine_mg_dl != null },
              { label: t('subject.group.genotype'), done: inputs.cyp2d6_activity_score != null },
              { label: t('subject.group.conditions'), done: conditionsApplied },
            ]}
          />
        }
      >
        <section className="subj-card">
          <ParameterPanel
            inputs={inputs}
            onChange={onChange}
            model={model}
            twin={twin}
            reference={reference}
            categoricals={categoricals}
          />
        </section>
      </Zone>

      {/* =============================================== ZONE 2 — ANSWER === */}
      <Zone
        kind="answer"
        id="subj-edit-answer"
        title={t('subject.zone.answer')}
        lead={t('subject.zone.answerLead')}
      >
        <section className="subj-card">
          <TwinHeadline
            twin={twin}
            reference={reference}
            source={source}
            categoricals={categoricals}
          />
        </section>
      </Zone>

      {/* ============================================= ZONE 3 — EVIDENCE ===
          Which condition moved which named state variable, and the hepatic
          gate the genotype opens. Absent entirely when no condition is
          applied — there is then nothing to explain, and the Answer zone has
          already said what follows from that. */}
      {conditionsApplied && (
        <Zone
          kind="evidence"
          id="subj-edit-evidence"
          title={t('subject.zone.evidence')}
          lead={t('subject.zone.evidenceLead')}
        >
          <section className="subj-card">
            <DerivedPanel
              twin={twin}
              reference={reference}
              source={source}
              categoricals={categoricals}
              presetEffects={presetEffects}
              sections={['shifts']}
            />
          </section>
        </Zone>
      )}

      {/* =============================================== ZONE 4 — DETAIL === */}
      <Zone
        kind="detail"
        id="subj-edit-detail"
        title={t('subject.zone.detail')}
        lead={t('subject.zone.detailLead')}
      >
        <section className="subj-card subj-gate">
          <h3>{t('subject.hepaticGate')}</h3>
          <p className="subj-note">{t('subject.hepaticGateNote')}</p>
          <LiverReactors frame={frame} />
        </section>

        <section className="subj-card">
          <DerivedPanel
            twin={twin}
            reference={reference}
            source={source}
            categoricals={categoricals}
            presetEffects={presetEffects}
            sections={['table', 'audit', 'warnings']}
          />
        </section>

        <footer className="subj-footer">{t('subject.footer')}</footer>
      </Zone>
    </div>
  )
}
