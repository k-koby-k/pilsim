/**
 * Run controls for the compact pre-run card.
 *
 * The product owner rejected the earlier four-step wizard as too long and
 * backwards: dose recommendations are a FINDING of the simulation, not an
 * input to it. The whole pre-run state is now three decisions in one card —
 * pick what to test, pick the patient, press Run — with everything else
 * (the top 5, the plan, the charts, the report, the ranking) appearing only
 * once a run has produced results, in SimulationPage.
 *
 *  - `PillPicker` — builds the SET OF ARMS to compare. Two moves, not one
 *    flat grid: ADD an arm from the searchable, grouped library, then
 *    CONFIGURE it on its own row, where its dosage forms live. Several arms
 *    run together as comparison arms — `runSelected` in SimulationPage
 *    reuses `rank` (report/score.ts) and the comparison tray for that,
 *    rather than a parallel path.
 *  - `SubjectPicker` — pick the patient. A patient is chosen before any run,
 *    so nothing downstream needs a "default reference adult" caveat.
 *  - `RunPanel` — the button, the progress bar and the run settings
 *    (horizon, initial conditions, population, frame interval) behind their
 *    own disclosure.
 *
 * `settingsSummary` and `RunOptions` are unchanged so nothing downstream
 * (the demo scripts, the AI panel) had to move.
 *
 * The steady-state / first-dose switch is a labelled toggle and a demo asset,
 * not a bug: amlodipine needs 7–8 days to steady state with about 2.9-fold
 * accumulation, so day 1 and day 8 are genuinely different pictures and the
 * control says so on screen.
 */

import { Fragment, useState } from 'react'
import type { DrugId, Regimen } from '../../types'
import { listFormsForDrug } from '../../engine'
import { Consequence, Disclosure, SearchInput } from '../shell/primitives'
import { useT } from '../../i18n'
import type { TFunction } from '../../i18n/useT'
import type { SubjectPreset } from './presets'
import { DRUG_SHORT } from './presets'

/** One line of `<option>` text for a dosage-form picker — shared by the pill
 * composer and this run control so the wording is identical wherever a form
 * is chosen. */
function formOptionLabel(t: TFunction, f: ReturnType<typeof listFormsForDrug>[number]): string {
  if (f.isReference) return t('composer.formStandard', { form: f.form })
  if (!f.existsRealWorld) return t('composer.formNotReal', { form: f.form })
  if (f.pkEquivalent) return t('composer.formPkEquivalent', { form: f.form })
  return t('composer.formDifferent', { form: f.form })
}

export interface RunOptions {
  horizonHours: number
  outputEveryMin: number
  initial: 'steady_state' | 'first_dose'
  populationN: number
}

const HORIZONS = [
  { h: 24, label: '24 h' },
  { h: 48, label: '48 h' },
  { h: 168, label: '7 d' },
  { h: 192, label: '8 d' },
]

const POPULATIONS = [1, 50, 200, 500]

function horizonLabel(h: number): string {
  return HORIZONS.find((x) => x.h === h)?.label ?? `${h} h`
}

export function settingsSummary(o: RunOptions): string {
  return [
    horizonLabel(o.horizonHours),
    o.initial === 'steady_state' ? 'steady state' : 'first dose',
    o.populationN === 1 ? 'single twin' : `N = ${o.populationN}`,
    `${o.outputEveryMin} min frames`,
  ].join(' · ')
}

// ------------------------------------------------------- the arms to compare --

/*
 * WHAT THIS SECTION IS AND WHY IT WAS REBUILT
 *
 * The old control was one flat three-column grid of eight checkboxes with a
 * single page-level "Dosage form" dropdown hanging underneath it. That
 * dropdown could only exist when exactly ONE box was ticked, because a
 * page-level control has nowhere to live once there are two selections — so
 * ticking a second pill made the form picker vanish and a form became
 * unsettable. That was not a missing feature; the layout was wrong about what
 * owns a form. A DOSAGE FORM IS A PROPERTY OF A DRUG INSIDE AN ARM, so it is
 * rendered inside that arm and nowhere else. One arm and five arms now behave
 * identically and the bug cannot come back by construction.
 *
 * The thing being assembled is a SET OF ARMS TO COMPARE, and assembling it is
 * two moves:
 *
 *   1. ADD — the product library, searchable and split into monotherapies and
 *      fixed-dose combinations, because those are different kinds of thing and
 *      reading eight (later many more) interleaved rows is what made the old
 *      grid unscannable.
 *   2. CONFIGURE — every chosen arm is its own row showing what it contains,
 *      a form selector PER ACTIVE INGREDIENT, and a way to remove it.
 *
 * Both halves are height-capped and scroll, so the Act zone stays roughly one
 * screen no matter how many arms are picked (blueprint §2).
 */

/**
 * The dosage forms of ONE arm, one row per active ingredient.
 *
 * The three-way distinction the engine already draws is the whole point and is
 * kept verbatim: a real form with different pharmacokinetics is offered
 * plainly; a real form that is pharmacokinetically equivalent SAYS SO rather
 * than implying a difference; a form that does not exist in reality is listed,
 * disabled and captioned with the reason, so a user who goes looking for
 * extended-release lisinopril learns that no such product exists instead of
 * quietly getting something invented. `listFormsForDrug` is non-throwing and
 * supplies all three cases, so nothing here has to guess.
 *
 * Choosing nothing means the drug's reference immediate-release oral form —
 * an untouched arm is exactly the arm the engine ran before this control
 * existed.
 */
function ArmForms({
  arm,
  chosen,
  editable,
  onChange,
}: {
  arm: Regimen
  /** substanceId -> chosen form for THIS arm. */
  chosen: Record<string, string>
  /** False only while the page has no channel to store this arm's forms. */
  editable: boolean
  onChange: (substanceId: DrugId, form: string | undefined) => void
}) {
  const t = useT()

  return (
    <div className="rc-arm-forms">
      {arm.doses.map((d) => {
        const forms = listFormsForDrug(d.substanceId)
        if (forms.length === 0) return null
        const drug = DRUG_SHORT[d.substanceId] ?? d.substanceId

        // One known form is not a choice, so it is stated rather than offered.
        if (forms.length === 1) {
          return (
            <Fragment key={d.substanceId}>
              <span className="rc-arm-drug">{drug}</span>
              <span className="rc-arm-static">{forms[0].form}</span>
            </Fragment>
          )
        }

        const id = `sim-form-${arm.id}-${d.substanceId}`
        const current = chosen[d.substanceId] ?? ''
        const selectedForm = forms.find((f) => (f.isReference ? '' : f.form) === current)
        const note =
          selectedForm && !selectedForm.isReference && selectedForm.existsRealWorld
            ? selectedForm.pkEquivalent
              ? t('sim.pill.formNotePkEquivalent')
              : t('sim.pill.formNoteDifferent')
            : null

        return (
          <Fragment key={d.substanceId}>
            <label className="rc-arm-drug" htmlFor={id}>
              {drug}
            </label>
            <select
              id={id}
              value={current}
              disabled={!editable}
              aria-label={t('sim.form.aria', { drug })}
              onChange={(e) => onChange(d.substanceId, e.target.value || undefined)}
            >
              {forms.map((f) => (
                <option key={f.form} value={f.isReference ? '' : f.form} disabled={!f.existsRealWorld}>
                  {formOptionLabel(t, f)}
                </option>
              ))}
            </select>
            {note && <p className="rc-arm-formnote">{note}</p>}
          </Fragment>
        )
      })}
    </div>
  )
}

/** A monotherapy and a fixed-dose combination are different kinds of product
 *  and are never interleaved in the library — one active ingredient or more
 *  than one is the only test needed, and it works for a composed pill from the
 *  Pills page exactly as it does for a shipped one. */
function armKind(r: Regimen): 'mono' | 'combo' {
  return r.doses.length > 1 ? 'combo' : 'mono'
}

/**
 * Build the set of arms to compare.
 *
 * `selectedIds` is ordered: the first is the PRIMARY arm — the one the charts
 * and the body follow — and the rest are comparison arms, ranked against it.
 * That was already true of the page state; it is now said on screen instead of
 * being something a user could only infer.
 */
export function PillPicker({
  regimens,
  selectedIds,
  onToggle,
  fromPillsPage,
  onComposePill,
  doseForms,
  onDoseForm,
  doseFormsByArm,
  onArmDoseForm,
  why,
}: {
  regimens: Regimen[]
  /** Ids of the chosen arms, primary first. */
  selectedIds: string[]
  onToggle: (id: string) => void
  fromPillsPage: boolean
  /** Hands the user to the Pills page when no pill of their own exists yet. */
  onComposePill?: () => void
  /**
   * Per-arm dosage forms — `doseFormsByArm[regimenId][substanceId]` — and its
   * setter. This is the shape the control wants, because a form belongs to a
   * drug inside ONE arm; pass these two and every arm is configurable.
   */
  doseFormsByArm?: Record<string, Record<string, string>>
  onArmDoseForm?: (regimenId: string, substanceId: DrugId, form: string | undefined) => void
  /**
   * The older single-arm channel: the PRIMARY arm's forms only, kept so the
   * page keeps working unchanged while `onArmDoseForm` is wired. With only
   * this, comparison arms show their forms read-only rather than pretending a
   * choice that could not be stored.
   */
  doseForms?: Record<string, string>
  onDoseForm?: (substanceId: DrugId, form: string | undefined) => void
  /** One plain line saying what the product does with this group — blueprint §7
   * pattern 2. Sits directly under the group's own heading, never in a tooltip. */
  why?: React.ReactNode
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  // The library arrives folded when arms already exist, which is what keeps the
  // Act zone to one screen, and open when none do, because adding the first arm
  // is then the only thing there is to do.
  const [libraryOpen, setLibraryOpen] = useState(() => selectedIds.length === 0)

  const byId = new Map(regimens.map((r) => [r.id, r]))
  const arms = selectedIds.map((id) => byId.get(id)).filter((r): r is Regimen => !!r)
  const primaryId = arms[0]?.id

  const formsOf = (armId: string): Record<string, string> =>
    doseFormsByArm?.[armId] ?? (armId === primaryId ? doseForms : undefined) ?? {}
  const canSetForm = (armId: string) => !!onArmDoseForm || (armId === primaryId && !!onDoseForm)
  const setForm = (armId: string, substanceId: DrugId, form: string | undefined) => {
    if (onArmDoseForm) onArmDoseForm(armId, substanceId, form)
    else if (armId === primaryId) onDoseForm?.(substanceId, form)
  }
  const someArmLocked = arms.some((r) => !canSetForm(r.id))

  const q = query.trim().toLowerCase()
  const matches = (r: Regimen) =>
    !q ||
    r.label.toLowerCase().includes(q) ||
    r.doses.some(
      (d) =>
        d.substanceId.toLowerCase().includes(q) ||
        (DRUG_SHORT[d.substanceId] ?? '').toLowerCase().includes(q),
    )
  const shown = regimens.filter(matches)
  const groups = (['mono', 'combo'] as const)
    .map((kind) => ({ kind, items: shown.filter((r) => armKind(r) === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="sim-field">
      <div className="sim-field-top">
        <label id="sim-pill-label">{t('sim.pill.armsLabel')}</label>
        <span className="sim-pill-count">{t('sim.pill.armCount', { n: arms.length })}</span>
        {onComposePill && (
          <button type="button" className="sim-link" onClick={onComposePill}>
            {fromPillsPage ? t('sim.pill.editPills') : t('sim.pill.composeOwn')}
          </button>
        )}
      </div>

      {why && <p className="fgroup-why">{why}</p>}

      {/* ------------------------------------------------ configure the arms -- */}
      {arms.length === 0 ? (
        <Consequence tone="warn">{t('sim.pill.noneConsequence')}</Consequence>
      ) : (
        <>
          <ul className="rc-arms" aria-labelledby="sim-pill-label">
            {arms.map((r) => {
              const isPrimary = r.id === primaryId
              return (
                <li key={r.id} className={isPrimary ? 'rc-arm is-primary' : 'rc-arm'}>
                  <div className="rc-arm-head">
                    <span className="rc-arm-name">{r.label}</span>
                    <span className="rc-arm-role">
                      {isPrimary ? t('sim.pill.rolePrimary') : t('sim.pill.roleComparison')}
                    </span>
                    {/* The run needs an arm, so the last one cannot be removed —
                        disabled with the reason spelled out under the list,
                        never a button that silently does nothing. */}
                    <button
                      type="button"
                      className="rc-arm-remove"
                      aria-label={t('sim.pill.removeArm', { name: r.label })}
                      disabled={arms.length === 1}
                      onClick={() => onToggle(r.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <ArmForms
                    arm={r}
                    chosen={formsOf(r.id)}
                    editable={canSetForm(r.id)}
                    onChange={(substanceId, form) => setForm(r.id, substanceId, form)}
                  />
                </li>
              )
            })}
          </ul>

          <p className="sim-field-note">
            {arms.length === 1 ? t('sim.pill.singleArmNote') : t('sim.pill.primaryNote')}
          </p>
          {someArmLocked && <p className="sim-field-note">{t('sim.form.primaryOnly')}</p>}
        </>
      )}

      {/* ------------------------------------------------------- add an arm -- */}
      <div className="rc-add">
        <Disclosure
          summary={t('sim.pill.addArm')}
          meta={t('sim.pill.libraryCount', { n: regimens.length })}
          open={libraryOpen}
          onToggle={() => setLibraryOpen((o) => !o)}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('sim.pill.searchPlaceholder')}
            count={`${shown.length}/${regimens.length}`}
          />

          {groups.length === 0 ? (
            <Consequence>{t('sim.pill.noMatch', { q: query.trim() })}</Consequence>
          ) : (
            <div className="rc-lib" role="group" aria-label={t('sim.pill.addArm')}>
              {groups.map((g) => (
                <Fragment key={g.kind}>
                  <p className="rc-lib-group">
                    <span>{g.kind === 'mono' ? t('sim.pill.groupMono') : t('sim.pill.groupCombo')}</span>
                    <span className="rc-lib-count">{g.items.length}</span>
                  </p>
                  {g.items.map((r) => {
                    const added = selectedIds.includes(r.id)
                    return (
                      <label key={r.id} className="sim-pill-check">
                        <input
                          type="checkbox"
                          checked={added}
                          disabled={added && arms.length === 1 && r.id === primaryId}
                          onChange={() => onToggle(r.id)}
                        />
                        <span>{r.label}</span>
                        {added && <span className="rc-lib-added">{t('sim.pill.added')}</span>}
                      </label>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          )}

          <p className="sim-field-note">
            {fromPillsPage ? t('sim.pill.composedNote') : t('sim.pill.eightProducts')}
          </p>
        </Disclosure>
      </div>
    </div>
  )
}

// -------------------------------------------------------- pick the patient --

/** Pick the patient. Always a real, named person before a run happens — the
 * top-5 panel and everything else that reads this patient's twin never has
 * a "default reference adult" state to caveat. */
export function SubjectPicker({
  subjects,
  subjectId,
  onSubject,
  onEditSubject,
  why,
}: {
  subjects: SubjectPreset[]
  subjectId: string
  onSubject: (id: string) => void
  /** Hands the user to the Subject page to build a twin of their own. */
  onEditSubject?: () => void
  /** What the product does with this patient — blueprint §7 pattern 2. */
  why?: React.ReactNode
}) {
  const t = useT()
  const subject = subjects.find((s) => s.id === subjectId)

  return (
    <div className="sim-field">
      <div className="sim-field-top">
        <label htmlFor="sim-subject">{t('sim.subject.label')}</label>
        {onEditSubject && (
          <button type="button" className="sim-link" onClick={onEditSubject}>
            {t('sim.subject.build')}
          </button>
        )}
      </div>

      {why && <p className="fgroup-why">{why}</p>}
      <select id="sim-subject" value={subjectId} onChange={(e) => onSubject(e.target.value)}>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {subject && (
        <>
          <ul className="sim-chip-row">
            <li>
              {subject.inputs.sbp_mmHg}/{subject.inputs.dbp_mmHg} mmHg
            </li>
            <li>
              {subject.inputs.age_years} y, {subject.inputs.sex}
            </li>
            <li>{subject.inputs.weight_kg} kg</li>
            <li>CYP2D6 {subject.inputs.cyp2d6}</li>
            {!!subject.inputs.comorbidities.length && <li>{subject.inputs.comorbidities.join(', ')}</li>}
          </ul>
          <p className="sim-field-note">{subject.note}</p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------ run the pill --

/** The button, its progress bar, and the settings that change what the
 * engine does with the pill(s) and patient already chosen above (horizon,
 * initial conditions, population, frame interval). */
export function RunPanel({
  options,
  onOptions,
  onRun,
  onCancel,
  running,
  disabled,
  disabledReason,
  progress,
  title,
  why,
}: {
  options: RunOptions
  onOptions: (o: RunOptions) => void
  onRun: () => void
  onCancel: () => void
  running: boolean
  disabled?: boolean
  /** Shown under the button when disabled — Run must never fail silently. */
  disabledReason?: string
  progress: number
  /** Heading for the group. The button alone is not a named group. */
  title?: React.ReactNode
  /** What pressing this actually does — blueprint §7 pattern 2. */
  why?: React.ReactNode
}) {
  const t = useT()
  // Closed on arrival. Every value is on the fold's own face, so nothing is
  // hidden — it just isn't in the way of pressing Run.
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      {/* A named group, not a naked button: the primary action of the page says
          what it is and what it does before it is pressed — blueprint §7
          patterns 1 and 2. */}
      {title && <h3 className="sim-card-title sim-run-title">{title}</h3>}
      {why && <p className="fgroup-why sim-run-why">{why}</p>}

      <div className="sim-run-row">
        {running ? (
          <button className="btn btn--danger sim-btn-block" onClick={onCancel}>
            {t('sim.run.stop')}
          </button>
        ) : (
          <button className="btn btn--primary btn--lg sim-btn-block" onClick={onRun} disabled={disabled}>
            {t('sim.run.run')}
          </button>
        )}
      </div>
      {disabled && !running && disabledReason && <p className="sim-inline-warn">{disabledReason}</p>}
      {running && (
        <div
          className="sim-progress"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      <div className="sim-settings-fold">
        <Disclosure
          summary={t('sim.run.settings')}
          meta={settingsSummary(options)}
          open={settingsOpen}
          onToggle={() => setSettingsOpen((o) => !o)}
        >
          <div className="sim-field">
            <label>{t('sim.run.horizon')}</label>
            <div className="sim-segmented">
              {HORIZONS.map((h) => (
                <button
                  key={h.h}
                  className={options.horizonHours === h.h ? 'is-active' : ''}
                  onClick={() => onOptions({ ...options, horizonHours: h.h })}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sim-field">
            <label>{t('sim.run.initialConditions')}</label>
            <div className="sim-segmented">
              <button
                className={options.initial === 'steady_state' ? 'is-active' : ''}
                onClick={() => onOptions({ ...options, initial: 'steady_state' })}
              >
                {t('sim.run.steadyState')}
              </button>
              <button
                className={options.initial === 'first_dose' ? 'is-active' : ''}
                onClick={() => onOptions({ ...options, initial: 'first_dose' })}
              >
                {t('sim.run.firstDose')}
              </button>
            </div>
            <p className="sim-field-note">
              {options.initial === 'steady_state' ? t('sim.run.steadyStateNote') : t('sim.run.firstDoseNote')}
            </p>
          </div>

          <div className="sim-field">
            <label>{t('sim.run.population')}</label>
            <div className="sim-segmented">
              {POPULATIONS.map((n) => (
                <button
                  key={n}
                  className={options.populationN === n ? 'is-active' : ''}
                  onClick={() => onOptions({ ...options, populationN: n })}
                >
                  {n === 1 ? t('sim.run.singleTwin') : t('sim.run.populationN', { n })}
                </button>
              ))}
            </div>
            <p className="sim-field-note">{t('sim.run.populationNote')}</p>
          </div>

          <div className="sim-field">
            <label htmlFor="sim-step">{t('sim.run.frameInterval')}</label>
            <input
              id="sim-step"
              type="range"
              min={5}
              max={60}
              step={5}
              value={options.outputEveryMin}
              onChange={(e) => onOptions({ ...options, outputEveryMin: Number(e.target.value) })}
            />
            <p className="sim-field-note">{t('sim.run.frameMinutes', { n: options.outputEveryMin })}</p>
          </div>
        </Disclosure>
      </div>
    </>
  )
}
