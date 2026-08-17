/**
 * PilSim — simulation view.
 *
 * LAID OUT AGAINST research/10-LAYOUT-BLUEPRINT.md, which is the authority. A
 * component does not choose where it appears; that document does.
 *
 * THE FRAME (§1): the app's navigation on the left, ONE column of content in the
 * centre. Cards in the centre stack one per row, full width, never two across.
 *
 * THIS PAGE HAS NO RIGHT RAIL, and that is deliberate — see the blueprint's
 * amendment to §1/§4. The rail here used to hold the anatomy scene, and the
 * Evidence zone held the SAME scene again at full column width: the same tab
 * strip, the same title, the same figure, the same caption. Two copies of one
 * instrument, the rail's copy too small to read. The product owner's call was to
 * keep the large one and drop the rail outright rather than find the rail
 * something else to do: the charts, the ranking, the plan and the body are what
 * the user came for, and they are better served by the width than by a second,
 * illegible view of one of them. So the centre column takes the whole band the
 * centre-plus-rail used to occupy (`.sim-column` in simulation.css) — nothing on
 * this page got narrower, and there is no empty track left behind.
 *
 * Substances, Pills and Test subjects keep their rails untouched: there the
 * anatomy is the ONLY copy, so it is the page's headline result and stays put.
 *
 * THE CENTRE COLUMN IS FOUR ZONES (§2), in this order, always:
 *
 *   1. ACT — everything needed to run a simulation and nothing else: the pills
 *      to test, the patient, the Run button, and the guided demonstrations as a
 *      secondary way in. This is the WHOLE page before a run. A dose
 *      recommendation is a FINDING of the simulation, not an input to it, so
 *      nothing that reports a finding renders here.
 *
 *   2. ANSWER — what the product concluded. The run's own headline (the
 *      disclaimer above it, per §8.4 of the report spec, then the sentence and
 *      the four figures), and the best-scoring alternatives for this patient.
 *
 *   3. EVIDENCE — why. The curves, the body at full width, the benches with
 *      their ranking read back as found, the generated reasoning, the rules that
 *      fired with their citations, and the exposure tables.
 *
 *   4. DETAIL — fine print, collapsed. Scoring weights, engine and data state,
 *      the run settings as used, and what the model does not represent.
 *
 * Zones 2–4 do not exist before the user has acted, and a zone with no content
 * is ABSENT rather than an empty placeholder — no "run a simulation to see
 * this" panels sitting in the layout. That rule is what removes most of the
 * "data popping up everywhere" feeling the product owner described.
 *
 * NO NUMBERED STEPS. The owner rejected the four-step wizard on this page and he
 * was right: a wizard suits DATA ENTRY, where each step gates the next, not a
 * results page. Wizard for input, zones for output.
 *
 * Nothing was deleted in this pass and no number changed. TopCombinationsPanel,
 * the benches, the scenes, the AI panel, the report all compute exactly what
 * they computed before; they have been assigned to zones, and the four report
 * parts (headline / why / tables / limits) are placed in the three zones the
 * blueprint puts them in rather than stacked in one tab.
 *
 * Owned by Agent UI-C.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EvaluationResult } from './adapters'
import type { DrugId, PatientInputs, PatientState, Regimen, ScoreWeights, SimRequest } from '../../types'
import { listFormsForDrug } from '../../engine'
import type { PageId } from '../shell/Sidebar'
import {
  Completeness,
  Consequence,
  Disclosure,
  FieldGroup,
  NextStep,
  QuickJump,
  Zone,
} from '../shell/primitives'
import { useData } from '../../data/DataProvider'
import { derivePatient, evaluate, getEngineBinding, lastRunWasSynthetic, runSimulationQuiet } from './adapters'
import { DISCLAIMER, defaultWeights, effectTroughToPeak, rank } from './scoring'
import type { ScoredOption } from './scoring'
import { BenchPanel } from './BenchPanel'
import { ConcentrationChart, EngagementChart, HaemodynamicChart, type Overlay } from './LiveCharts'
import { ScenePanel, useSceneBinding } from './ScenePanel'
import { sceneChoiceLines, type SceneId } from './scenes'
import { DisclaimerPanel, ReportPanel, signedBp } from './ReportPanel'
import { PillPicker, RunPanel, SubjectPicker, settingsSummary, type RunOptions } from './RunControls'
import { TopCombinationsPanel } from './TopCombinationsPanel'
import { RankedList } from './RankedList'
import { SUBJECT_PRESETS, availableRegimens } from './presets'
import {
  AMLODIPINE_DENOMINATOR,
  AMLODIPINE_EDEMA_LABEL_QUOTE,
  AMLODIPINE_EDEMA_SOURCE,
  COMBINATION_DENOMINATOR,
  DEMOS,
  amlodipineDoseArms,
  combinationArms,
  metoprololArm,
} from './demoScripts'
import { useBench } from './useBench'
import { nextRunId, useSimRunner, type CompletedRun } from './useSimRunner'
import { WeightsPanel } from './WeightsPanel'
import { WEIGHT_SPECS } from './weights'
import { AiPanel } from './AiPanel'
import { useAiReasoning } from './useAiReasoning'
import { buildContext, choicesFrom } from '../../ai/context'
import { buildPlanIfAvailable, planBinding, type PlanBinding } from '../../ai/planBridge'
import type { AiContext } from '../../ai/types'
import { useT } from '../../i18n'
import { recordHistoryEntry } from '../shell/historyStore'
import { takeRunReplay } from '../shell/handoff'
import './simulation.css'

/**
 * Anchor ids for the Evidence zone's sections. They are the targets of the
 * quick jump (blueprint §7 pattern 5) and of the guided demonstrations, which
 * used to switch a tab and now scroll to the section they produced. Tabs are
 * gone: a tab hides evidence behind a click and gives no clue that the other
 * three views exist, which is the "where did that go" half of the complaint.
 */
const SEC = {
  curves: 'sim-sec-curves',
  body: 'sim-sec-body',
  alternatives: 'sim-sec-alternatives',
  bestDose: 'sim-sec-best-dose',
  reasoning: 'sim-sec-reasoning',
  rules: 'sim-sec-rules',
  compare: 'sim-sec-compare',
} as const

/**
 * Scroll to a section once React has committed the result that created it.
 * Guarded for the server renderer, where there is no document at all.
 */
function jumpTo(id: string) {
  if (typeof document === 'undefined') return
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 80)
}

/** The claim of each demo, trimmed to its first sentence for the button face. */
function firstSentence(s: string): string {
  const i = s.indexOf('. ')
  return i === -1 ? s : s.slice(0, i + 1)
}

export function SimulationPage({ onNavigate }: { onNavigate?: (p: PageId) => void } = {}) {
  const t = useT()
  const { data, patientModel, rules, loading, error: dataError } = useData()

  const { regimens, fromPillsPage } = useMemo(() => availableRegimens(), [])
  const [regimenId, setRegimenId] = useState(regimens[0]?.id ?? '')
  /**
   * Pills ticked to run. Empty means "just the primary one", so the common
   * single-arm case needs no selection at all. Ticking several runs them as
   * comparison arms through the ranking that already exists.
   */
  const [extraSelectedIds, setExtraSelectedIds] = useState<string[]>([])
  const [subjectId, setSubjectId] = useState(SUBJECT_PRESETS[0].id)
  /**
   * Whether a patient has actually been picked at step 3, as opposed to the
   * page merely resting on `SUBJECT_PRESETS[0]` because state has to start
   * somewhere. This is the flag that decides whether the step-2 ranking is
   * shown against `DEFAULT_REFERENCE_SUBJECT` (labelled as such) or against a
   * real, named patient — the distinction the clinician's feedback turns on.
   */
  const [patientChosen, setPatientChosen] = useState(false)
  const [options, setOptions] = useState<RunOptions>({
    horizonHours: 192,
    outputEveryMin: 15,
    initial: 'steady_state',
    populationN: 200,
  })
  const [weights, setWeights] = useState<ScoreWeights>(() => defaultWeights())
  const [logScale, setLogScale] = useState(false)
  const [showParent, setShowParent] = useState(false)
  const [tray, setTray] = useState<CompletedRun[]>([])
  const [overlayIds, setOverlayIds] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null)
  const [weightsOpen, setWeightsOpen] = useState(false)
  /** The two other Detail folds. All three start closed: Detail is opened
   *  deliberately, never met on the way past. */
  const [engineOpen, setEngineOpen] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)
  /**
   * Chosen dosage form per regimen, per drug: doseForms[regimenId][substanceId].
   * Omitted -> that drug's reference immediate-release oral form, so switching
   * pills or leaving this untouched changes nothing. Keyed by regimen id, not
   * globally, so a form chosen for one pill does not silently follow the user
   * onto an unrelated one that happens to share a drug.
   */
  const [doseForms, setDoseForms] = useState<Record<string, Record<string, string>>>({})

  const runner = useSimRunner()
  const comboBench = useBench()
  const doseBench = useBench()

  const subject = SUBJECT_PRESETS.find((s) => s.id === subjectId) ?? SUBJECT_PRESETS[0]
  const regimen = regimens.find((r) => r.id === regimenId) ?? regimens[0]

  // The twin for whichever subject is currently selected — independent of any
  // run having happened, so the top-5 search can re-rank the instant the
  // subject changes rather than waiting for a simulation to finish.
  const currentPatient = useMemo(
    () => derivePatient(subject.inputs, patientModel),
    [subject, patientModel],
  )

  /**
   * Step 3 — picking a subject here is an explicit choice, not just a change
   * of `subjectId`, so it also flips `patientChosen`. Everywhere a subject is
   * set for a reason a user would recognise as "picking a patient" — the
   * picker itself, or a guided demonstration landing on a named archetype —
   * goes through this rather than `setSubjectId` directly.
   */
  const chooseSubject = useCallback((id: string) => {
    setSubjectId(id)
    setPatientChosen(true)
  }, [])

  // The default reference twin — computed once patientModel is ready, kept
  // around for the whole page's lifetime so the top-5 panel always has
  // something to diff a chosen patient's ranking against, even long after the
  // default has stopped being what is shown.
  const defaultReferencePatient = useMemo(
    () => currentPatient,
    [patientModel],
  )

  // Step 2's ranking subject: the default reference adult until step 3 has
  // actually been used, the chosen patient afterwards.
  /** What is ticked. Always includes the primary arm so the Run button is never
   *  disabled by an empty selection in the ordinary single-pill case. */
  const selectedRegimenIds = useMemo(
    () => (regimenId ? [regimenId, ...extraSelectedIds.filter((id) => id !== regimenId)] : extraSelectedIds),
    [regimenId, extraSelectedIds],
  )

  /** Ticking the primary arm promotes the next ticked pill rather than leaving
   *  nothing selected — the page always has an arm to draw charts for. */
  const toggleRegimen = useCallback(
    (id: string) => {
      if (id === regimenId) {
        const next = extraSelectedIds[0]
        if (!next) return
        setRegimenId(next)
        setExtraSelectedIds((prev) => prev.filter((x) => x !== next))
        return
      }
      setExtraSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
    },
    [regimenId, extraSelectedIds],
  )

  const rankingSubject = subject
  const rankingPatient = currentPatient

  /**
   * Apply this regimen's chosen dosage forms, if any. Defensive as well as
   * convenient: a stale override pointing at a form that is no longer real is
   * dropped rather than sent to the engine, so an `UnavailableFormError` can
   * only ever come from the engine's own data changing, never from this page.
   */
  const withDoseForms = useCallback(
    (r: Regimen): Regimen => {
      const overrides = doseForms[r.id]
      if (!overrides || !Object.keys(overrides).length) return r
      return {
        ...r,
        doses: r.doses.map((d) => {
          const form = overrides[d.substanceId]
          if (!form) return d
          const listing = listFormsForDrug(d.substanceId).find((f) => f.form === form)
          if (!listing || !listing.existsRealWorld) return d
          return { ...d, form: listing.isReference ? undefined : form }
        }),
      }
    },
    [doseForms],
  )

  const setDoseForm = useCallback((forRegimenId: string, substanceId: DrugId, form: string | undefined) => {
    setDoseForms((prev) => {
      const next = { ...prev }
      const forRegimen = { ...(next[forRegimenId] ?? {}) }
      if (form) forRegimen[substanceId] = form
      else delete forRegimen[substanceId]
      next[forRegimenId] = forRegimen
      return next
    })
  }, [])

  const buildRequest = useCallback(
    (
      regimenArg = regimen,
      subjectArg = subject,
      optionsArg = options,
    ): { req: SimRequest; patient: PatientState; modifiers: EvaluationResult } | null => {
      if (!regimenArg) return null
      const effectiveRegimen = withDoseForms(regimenArg)
      const patient = derivePatient(subjectArg.inputs, patientModel)
      const modifiers = evaluate(patient, effectiveRegimen, rules)
      return {
        patient,
        modifiers,
        req: {
          kind: 'run',
          runId: nextRunId(),
          patient,
          regimen: effectiveRegimen,
          modifiers,
          options: {
            horizonHours: optionsArg.horizonHours,
            outputEveryMin: optionsArg.outputEveryMin,
            initial: optionsArg.initial,
            populationN: optionsArg.populationN,
          },
        },
      }
    },
    [regimen, subject, options, patientModel, rules, withDoseForms],
  )

  /**
   * Records one completed run to the sidebar's History section (see
   * `src/ui/shell/historyStore.ts`) — the regimen and patient it ran with, the
   * settings it ran under, and the headline BP change, so History can show an
   * honest, past-tense summary without persisting the full streamed frames.
   */
  const recordRun = useCallback(
    (
      regimenUsed: Regimen,
      subjectUsed: { id: string; label: string; inputs: PatientInputs },
      optionsUsed: RunOptions,
      done: CompletedRun,
    ) => {
      recordHistoryEntry({
        regimen: regimenUsed,
        regimenLabel: regimenUsed.label,
        subjectId: subjectUsed.id,
        subjectLabel: subjectUsed.label,
        subjectInputs: subjectUsed.inputs,
        options: {
          horizonHours: optionsUsed.horizonHours,
          outputEveryMin: optionsUsed.outputEveryMin,
          initial: optionsUsed.initial,
          populationN: optionsUsed.populationN,
        },
        deltaSbp: done.summary.deltaSbp,
        deltaDbp: done.summary.deltaDbp,
      })
    },
    [],
  )

  const doRun = useCallback(
    async (regimenArg = regimen, subjectArg = subject, optionsArg = options) => {
      const built = buildRequest(regimenArg, subjectArg, optionsArg)
      if (!built) return null
      setEvaluation(built.modifiers)
      const label = `${built.req.regimen.label} · ${subjectArg.label}`
      const done = await runner.run(built.req, label, built.modifiers)
      if (done) {
        setTray((t) => [done, ...t].slice(0, 8))
        recordRun(built.req.regimen, subjectArg, optionsArg, done)
      }
      return done
    },
    [buildRequest, runner, regimen, subject, options, recordRun],
  )

  /**
   * Consumes a hand-off from the sidebar's History section, if the page was
   * just navigated to with one waiting — see `takeRunReplay` in
   * `src/ui/shell/handoff.ts`. Runs once, on mount: the entry is a one-shot
   * mailbox, so a later visit to this page is a clean slate, exactly like the
   * Pills compose hand-off it is modelled on.
   *
   * Deliberately RE-RUNS rather than trying to restore the old frames — see
   * `historyStore.ts` for why a past result must never be resurrected as if
   * it were live. The picker is updated only where the replayed arm or
   * subject still match the current catalogue; the run itself is correct
   * either way, since it is built from the entry's own snapshot.
   */
  useEffect(() => {
    const replay = takeRunReplay()
    if (!replay) return
    if (regimens.some((r) => r.id === replay.regimen.id)) setRegimenId(replay.regimen.id)
    const matchingPreset = SUBJECT_PRESETS.find((s) => s.id === replay.subjectId)
    if (matchingPreset) chooseSubject(matchingPreset.id)
    void doRun(
      replay.regimen,
      { id: replay.subjectId, label: replay.subjectLabel, note: '', inputs: replay.subjectInputs },
      replay.options,
    )
    jumpTo(SEC.curves)
    // Deliberately once, on mount — see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- demo moment 1: the combination ranking ------------------------------
  const runCombinationDemo = useCallback(async () => {
    const demo = DEMOS[0]
    setBusy(demo.id)
    chooseSubject(demo.subjects[0])
    const subj = SUBJECT_PRESETS.find((s) => s.id === demo.subjects[0]) ?? subject
    const patient = derivePatient(subj.inputs, patientModel)
    await comboBench.run(
      combinationArms(),
      patient,
      weights,
      { horizonHours: demo.horizonHours, outputEveryMin: 30, initial: demo.initial, populationN: demo.populationN },
      COMBINATION_DENOMINATOR,
      data,
    )
    setBusy(null)
    jumpTo(SEC.alternatives)
  }, [comboBench, weights, subject, patientModel, data, chooseSubject])

  // --- demo moment 2: the CYP2D6 metoprolol threshold ----------------------
  const runCyp2d6Demo = useCallback(async () => {
    const demo = DEMOS[1]
    setBusy(demo.id)
    // A poor metaboliser's peak is an order of magnitude above a normal
    // metaboliser's. On a linear axis both curves and the 80.2 ng/mL line
    // collapse into the bottom tenth of the plot, so this comparison is only
    // legible on a log axis.
    setLogScale(true)
    const arm = metoprololArm()
    const opts: RunOptions = {
      horizonHours: demo.horizonHours,
      outputEveryMin: 5,
      initial: demo.initial,
      populationN: demo.populationN,
    }
    const fresh: CompletedRun[] = []
    for (const sid of demo.subjects) {
      const subj = SUBJECT_PRESETS.find((s) => s.id === sid)
      if (!subj) continue
      const built = buildRequest(arm, subj, opts)
      if (!built) continue
      setEvaluation(built.modifiers)
      const done = await runner.run(built.req, `Metoprolol · CYP2D6 ${subj.inputs.cyp2d6}`, built.modifiers)
      if (done) {
        fresh.push(done)
        recordRun(built.req.regimen, subj, opts, done)
      }
    }
    if (fresh.length) {
      setTray((t) => [...fresh.slice().reverse(), ...t].slice(0, 8))
      // Overlay every run but the last, which stays live on the chart.
      setOverlayIds(fresh.slice(0, -1).map((r) => r.id))
      setRegimenId(regimens.find((r) => r.doses.some((d) => d.substanceId === 'metoprolol'))?.id ?? regimenId)
      chooseSubject(demo.subjects[demo.subjects.length - 1])
      setOptions(opts)
    }
    setBusy(null)
    jumpTo(SEC.curves)
  }, [buildRequest, runner, regimens, regimenId, chooseSubject, recordRun])

  // --- demo moment 3: the efficacy-harm asymmetry --------------------------
  const runDoseDemo = useCallback(async () => {
    const demo = DEMOS[2]
    setBusy(demo.id)
    chooseSubject(demo.subjects[0])
    const subj = SUBJECT_PRESETS.find((s) => s.id === demo.subjects[0]) ?? subject
    const patient = derivePatient(subj.inputs, patientModel)
    await doseBench.run(
      amlodipineDoseArms(),
      patient,
      weights,
      { horizonHours: demo.horizonHours, outputEveryMin: 30, initial: demo.initial, populationN: demo.populationN },
      AMLODIPINE_DENOMINATOR,
      data,
    )
    setBusy(null)
    jumpTo(SEC.bestDose)
  }, [doseBench, weights, subject, patientModel, data, chooseSubject])

  const overlays: Overlay[] = useMemo(
    () =>
      tray
        .filter((r) => overlayIds.includes(r.id))
        .map((r) => ({ id: r.id, label: r.label, frames: r.frames })),
    [tray, overlayIds],
  )

  const binding = runner.binding ?? getEngineBinding()
  const latestRun = tray[0] ?? null
  const cursorX = runner.running && runner.latest ? runner.latest.t_h : null

  const reportTpr = useMemo(() => {
    if (!latestRun) return undefined
    const baselineMap =
      latestRun.patient.inputs.dbp_mmHg +
      (latestRun.patient.inputs.sbp_mmHg - latestRun.patient.inputs.dbp_mmHg) / 3
    return effectTroughToPeak(latestRun.frames, baselineMap)
  }, [latestRun])

  const demoRunners: Record<string, () => Promise<void>> = {
    combination: runCombinationDemo,
    cyp2d6: runCyp2d6Demo,
    dose_asymmetry: runDoseDemo,
  }

  const noRegimen = !regimen

  // --- what exists to show -------------------------------------------------
  //
  // Blueprint §5.2: nothing appears before it is meaningful. A zone with no
  // content is ABSENT, not empty, and there are no "run a simulation to see
  // this" placeholders anywhere on this page. These four flags are the whole
  // gate: each names a real artefact, so a section can only render once the
  // thing it is about actually exists.
  const hasCurves = runner.frames.length > 0
  const hasCombo = comboBench.arms.length > 0 || comboBench.running || !!comboBench.error
  const hasDose = doseBench.arms.length > 0 || doseBench.running || !!doseBench.error
  const hasResult = !!latestRun || hasCurves || hasCombo || hasDose

  // --- the AI layer --------------------------------------------------------
  //
  // The model explains; the engine decides. Nothing below sends the model a
  // number the app did not already compute, and nothing it sends back reaches
  // the screen without every figure in it being checked (src/ai/numbers.ts).

  const ai = useAiReasoning()
  const [planInfo, setPlanInfo] = useState<PlanBinding>({ available: false })
  useEffect(() => {
    let live = true
    void planBinding().then((b) => {
      if (live) setPlanInfo(b)
    })
    return () => {
      live = false
    }
  }, [])

  // The anatomy scenes belong to src/ui/organs and are bound at runtime, so this
  // view compiles and runs whether or not they have landed — see scenes.ts.
  const sceneBinding = useSceneBinding()
  const [sceneId, setSceneId] = useState<SceneId | null>(null)

  /** Drug ids in whatever is currently being watched. Orders the scenes. */
  const sceneSubstances = useMemo(
    () => [...new Set((latestRun?.regimen ?? regimen)?.doses.map((d) => d.substanceId) ?? [])],
    [latestRun, regimen],
  )

  /**
   * Scenes the AI may name.
   *
   * `SceneDef.relevantTo` is the scene author's own statement about which
   * substances make a scene worth watching, so it travels into the prompt as
   * written. Recommending a scene is the one recommendation the model can make
   * that cannot move a number: a scene is a lens on the run that already
   * happened, never a different simulation.
   */
  const aiScenes = useMemo(
    () =>
      sceneChoiceLines(sceneBinding.scenes, sceneSubstances).map((line) => {
        const [id, label, ...rest] = line.split(' | ')
        return { id, label, note: rest.join(' — ') }
      }),
    [sceneBinding.scenes, sceneSubstances],
  )

  /**
   * Everything the model may propose, by id.
   *
   * The catalogue is built from the app's own dosing ladders, so a suggestion
   * can only ever be a regimen the engine can actually run — see
   * src/ai/suggest.ts, which discards any id that is not in this list.
   */
  const aiChoices = useMemo(
    () => choicesFrom([...regimens, ...combinationArms(), ...amlodipineDoseArms()]),
    [regimens],
  )
  const aiCatalog = useMemo(() => {
    const map = new Map<string, Regimen>()
    for (const r of [...regimens, ...combinationArms(), ...amlodipineDoseArms()]) {
      if (!map.has(r.id)) map.set(r.id, r)
    }
    return map
  }, [regimens])

  /** Whichever bench actually produced a ranking, so the AI reads the live one. */
  const activeBench = comboBench.ranked?.length ? comboBench : doseBench.ranked?.length ? doseBench : null

  /**
   * A plan needs a ranked arm to be written for, so the module merely existing
   * is not enough. The header names what the model will ACTUALLY be reading —
   * claiming it is explaining a plan that was never built would be exactly the
   * kind of small dishonesty this panel exists to avoid.
   */
  const planPossible = planInfo.available && (!!activeBench?.ranked?.length || !!latestRun)

  const aiBasis = planPossible
    ? `the treatment plan from ${planInfo.from ?? 'src/report/plan.ts'}`
    : latestRun
      ? 'this run and the rules that fired'
      : activeBench
        ? 'the ranking and the rules that fired'
        : 'the patient and the rules that fired — nothing has been simulated yet'

  const aiBlockedReason = loading
    ? 'The data files are still loading.'
    : !latestRun && !activeBench
      ? 'Nothing has been simulated yet. Run the current pill, or start a guided demonstration, and the ' +
        'model will explain the plan the engine and the rules produced for this patient.'
      : null

  const buildAiContext = useCallback(async (): Promise<AiContext> => {
    const patient = latestRun?.patient ?? derivePatient(subject.inputs, patientModel)
    const forRegimen = latestRun?.regimen ?? regimen ?? null
    const modifiers =
      latestRun?.modifiers ?? evaluation ?? (forRegimen ? evaluate(patient, forRegimen, rules) : null)

    // `buildTreatmentPlan` plans an arm out of a RANKED set. A bench supplies
    // one; a single live run does not, so the arm just run is scored on its own
    // to give the planner something to choose. That is not a "best of" claim —
    // the bench is what makes those, and it suppresses single-arm rankings by
    // design — it is only how the plan learns which arm it is writing for.
    const rankedForPlan =
      activeBench?.ranked?.length
        ? activeBench.ranked
        : latestRun && modifiers
          ? (rank(
              patient,
              [
                {
                  regimen: latestRun.regimen,
                  summary: latestRun.summary,
                  modifiers,
                  populationN: latestRun.populationN,
                  troughToPeakRatio: reportTpr,
                },
              ],
              weights,
              data,
            ).ranked ?? null)
          : null

    // The plan is the thing worth explaining when it exists: it is a decision a
    // doctor can act on, where a ranking is only a comparison. The bridge
    // returns null if src/report/plan.ts is absent or refuses, and the context
    // falls back to the run and the ranking without the panel changing shape.
    const plan = rankedForPlan?.length
      ? await buildPlanIfAvailable({
          patient,
          ranked: rankedForPlan,
          modifiers: modifiers ?? undefined,
          summary: latestRun?.summary,
          data,
          // Not part of TreatmentPlanInput; carried for the bridge's positional
          // fallbacks, which are what keep this working if the signature moves.
          evaluation: modifiers,
          regimen: forRegimen,
        })
      : null

    return buildContext({
      patient,
      evaluation: modifiers,
      plan,
      regimen: latestRun?.regimen ?? null,
      summary: latestRun?.summary ?? null,
      runMeta: latestRun
        ? {
            horizonHours: latestRun.horizonHours,
            initial: latestRun.initial,
            populationN: latestRun.populationN,
          }
        : undefined,
      ranked: activeBench?.ranked ?? null,
      denominator: activeBench?.denominator ?? '',
      choices: aiChoices,
      scenes: aiScenes,
    })
  }, [latestRun, subject, patientModel, regimen, evaluation, rules, activeBench, weights, data, aiChoices, aiScenes, reportTpr])

  /**
   * The suggestion hand-off — AI proposes, engine adjudicates.
   *
   * The id has already been matched against `aiChoices`, so this lookup cannot
   * miss; if it somehow did, nothing happens rather than something invented.
   */
  const runSuggestion = useCallback(
    (regimenId: string) => {
      const proposed = aiCatalog.get(regimenId)
      if (!proposed) return
      jumpTo(SEC.curves)
      void doRun(proposed)
    },
    [aiCatalog, doRun],
  )

  /**
   * One-click hand-off from the top-5 search to a real run. The candidate is a
   * plain `Regimen` produced by `findTopCombinations` — `doRun` accepts any
   * regimen directly, so this is the same run path as pressing "Run
   * simulation" with it selected, worker and all, not a second code path.
   * Runs against `rankingSubject` — the same subject the ranking it was
   * chosen from was computed for, whether that is a chosen patient or the
   * default reference adult.
   */
  const runCombo = useCallback(
    (candidate: Regimen) => {
      jumpTo(SEC.curves)
      void doRun(candidate, rankingSubject)
    },
    [doRun, rankingSubject],
  )

  /**
   * The Evidence zone's quick jump — blueprint §7 pattern 5. It lists only
   * sections that actually exist, so it can never point at nothing.
   */
  const evidenceJump: { id: string; label: string }[] = []
  if (hasCurves) evidenceJump.push({ id: SEC.curves, label: t('sim.section.curves') })
  if (hasResult) evidenceJump.push({ id: SEC.body, label: t('sim.section.body') })
  if (hasCombo) evidenceJump.push({ id: SEC.alternatives, label: t('sim.section.alternatives') })
  if (hasDose) evidenceJump.push({ id: SEC.bestDose, label: t('sim.section.bestDose') })
  evidenceJump.push({ id: SEC.reasoning, label: t('sim.ai.title') })
  if (latestRun) evidenceJump.push({ id: SEC.rules, label: t('sim.section.rulesTables') })
  if (tray.length) evidenceJump.push({ id: SEC.compare, label: t('sim.section.compare') })

  return (
    <div className="sim-page">
      {/* The short disclaimer bar that used to sit here is removed. It rendered
          all three languages at once, which read as a banner of noise above every
          run rather than as a statement anyone would take in. The disclaimer is
          NOT lost: it stands in the sidebar in the reader's own language, and the
          full text still sits above the scores in the report per report-spec §8.4,
          which is the place it actually has to be. Only the alerts remain here —
          they say the screen cannot be trusted, so they are genuinely frame. */}

      {binding?.synthetic && (
        <div className="sim-alert" role="alert">
          <strong>{t('sim.alert.syntheticTitle')}</strong> {binding.notice} {t('sim.alert.syntheticBody')}
        </div>
      )}

      {dataError && (
        <div className="sim-alert" role="alert">
          <strong>{t('sim.alert.dataErrorTitle')}</strong> {t('sim.alert.dataErrorBody', { message: dataError.message })}
        </div>
      )}

      <header className="sim-header">
        <h2>{t('nav.simulation')}</h2>
      </header>

      {/* One column, and only one. `.page-split` / `.page-col` are the shell's
          centre-plus-rail pair and are deliberately NOT used here: with the rail
          gone, `.page-split` would leave a 420–520px grid track standing empty
          and `.page-col` would hold the content at 940px in the middle of it. */}
      <div className="sim-shell">
        <div className="sim-column">
          {/* ============================================== ZONE 1 — ACT ===
              What the user came here to do, at the top, containing the primary
              action. Before a run this is the entire page. */}
          <Zone
            kind="act"
            id="sim-act"
            title={t('sim.zone.act')}
            lead={t('sim.zone.actLead')}
            aside={
              <Completeness
                items={[
                  { label: t('sim.act.checkPill'), done: !noRegimen && selectedRegimenIds.length > 0 },
                  { label: t('sim.act.checkPatient'), done: patientChosen },
                  { label: t('sim.act.checkRun'), done: hasResult },
                ]}
              />
            }
          >
            {noRegimen ? (
              /* An empty state that says what FOLLOWS from the emptiness, not
                 that something is missing — blueprint §7 pattern 3. */
              <section className="sim-card sim-guide">
                <Consequence tone="warn">{t('sim.act.noPillConsequence')}</Consequence>
                {onNavigate && (
                  <button className="btn btn--primary btn--lg sim-btn-block" onClick={() => onNavigate('pills')}>
                    {t('pills.composeTitle')}
                  </button>
                )}
              </section>
            ) : (
              <>
                <section className="sim-card sim-controls">
                  <PillPicker
                    regimens={regimens}
                    selectedIds={selectedRegimenIds}
                    onToggle={toggleRegimen}
                    fromPillsPage={fromPillsPage}
                    onComposePill={onNavigate ? () => onNavigate('pills') : undefined}
                    doseFormsByArm={doseForms}
                    onArmDoseForm={setDoseForm}
                    why={t('sim.pill.why')}
                  />
                  {/* The stray "Testing the eight modelled products against the
                      archetype subjects" line that used to sit here is gone: the
                      group's WHY line above and the picker's own note below
                      already say both halves of it, and three sentences around
                      one control is the clutter this pass exists to remove. */}
                </section>

                <section className="sim-card sim-controls">
                  <SubjectPicker
                    subjects={SUBJECT_PRESETS}
                    subjectId={subjectId}
                    onSubject={chooseSubject}
                    onEditSubject={onNavigate ? () => onNavigate('subject') : undefined}
                    why={t('sim.subject.why')}
                  />
                </section>

                {/* The primary action, and visually the strongest thing in the
                    zone. The run settings stay folded inside this card because
                    they configure the action; what the settings WERE is
                    restated in the Detail zone once a run exists. */}
                <section className="sim-card sim-controls">
                  <RunPanel
                    title={t('sim.run.groupTitle')}
                    why={t('sim.run.why')}
                    options={options}
                    onOptions={setOptions}
                    onRun={() => void doRun()}
                    onCancel={runner.cancel}
                    running={runner.running}
                    disabled={!!busy || loading}
                    progress={runner.progress}
                  />
                </section>
              </>
            )}

            {/* A second, quieter way to act. Each demonstration sets up a pill,
                a patient and a horizon and runs them, so it belongs in Act —
                but it is never the primary affordance. */}
            <section className="sim-card sim-demos" aria-label={t('sim.demos.title')}>
              <FieldGroup title={t('sim.demos.title')} why={t('sim.demos.why')}>
                <div className="sim-demo-grid">
                  {DEMOS.map((d) => (
                    <button
                      key={d.id}
                      className={`sim-demo-card${busy === d.id ? ' is-busy' : ''}`}
                      disabled={!!busy || runner.running || loading}
                      onClick={() => void demoRunners[d.id]?.()}
                      title={d.claim}
                    >
                      <span className="sim-demo-order">{d.order}</span>
                      <span className="sim-demo-body">
                        <span className="sim-demo-name">{d.title}</span>
                        <span className="sim-demo-claim">{firstSentence(d.claim)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </FieldGroup>
            </section>
          </Zone>

          {/* =========================================== ZONE 2 — ANSWER ===
              What the product concluded. Renders only once something has been
              run, and is the first thing visible after acting. */}
          {hasResult && (
            <Zone
              kind="answer"
              id="sim-answer"
              title={t('sim.zone.answer')}
              lead={t('sim.zone.answerLead')}
            >
              {runner.error && <p className="sim-inline-warn">Run failed: {runner.error}</p>}

              {/* The report's headline part — the full disclaimer above the
                  scores as §8.4 requires, the run in one sentence, the four
                  figures, and the comparison set the word "best" is relative
                  to. The rules, the tables and the limits are further down, in
                  the zones the blueprint puts them in. */}
              {latestRun && (
                <ReportPanel
                  run={latestRun}
                  disclaimer={DISCLAIMER}
                  troughToPeak={reportTpr}
                  sections={['headline']}
                  searchSpaceNote={
                    comboBench.denominator || doseBench.denominator || 'single arm — no comparison set searched'
                  }
                />
              )}

              {/* The alternatives evaluated for this same patient — the top of
                  this list is the regimen and dose the search recommends. */}
              <TopCombinationsPanel
                patient={rankingPatient}
                rules={rules}
                onRun={runCombo}
                disabled={runner.running || !!busy}
                subjectLabel={rankingSubject.label}
                isDefaultSubject={!patientChosen}
                referencePatient={defaultReferencePatient}
              />
            </Zone>
          )}

          {/* ========================================= ZONE 3 — EVIDENCE ===
              Why it concluded that. Always below the answer, never above it.
              Nothing here is behind a tab any more: a tab hid three of these
              four views and gave no sign they existed. */}
          {hasResult && (
            <Zone
              kind="evidence"
              id="sim-evidence"
              title={t('sim.zone.evidence')}
              lead={t('sim.zone.evidenceLead')}
              aside={<QuickJump items={evidenceJump} />}
            >
              {hasCurves && (
                <div className="sim-section" id={SEC.curves}>
                  <div className="sim-chart-toggles">
                    <label>
                      <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
                      {t('sim.chart.logAxis')}
                    </label>
                    <label>
                      <input type="checkbox" checked={showParent} onChange={(e) => setShowParent(e.target.checked)} />
                      {t('sim.chart.showParent')}
                    </label>
                    <span className="sim-frame-count">
                      {t('sim.chart.framesStreamed', { n: runner.frames.length, streaming: runner.running })}
                    </span>
                  </div>

                  {/* The three figures are the causal chain in order: how much
                      drug is in the plasma — EXP3174 plotted, not the losartan
                      parent, which is a separate opt-in axis — what that drug
                      is holding at its targets, and what the pressure does as a
                      result. */}
                  <ConcentrationChart
                    frames={runner.frames}
                    overlays={overlays}
                    logScale={logScale}
                    showParent={showParent}
                    cursorX={cursorX}
                  />
                  <EngagementChart frames={runner.frames} cursorX={cursorX} />
                  <HaemodynamicChart
                    frames={runner.frames}
                    overlays={overlays}
                    cursorX={cursorX}
                    baseline={{ sbp: subject.inputs.sbp_mmHg, dbp: subject.inputs.dbp_mmHg }}
                  />
                </div>
              )}

              {/* Blueprint §4: the anatomy is a headline result, not decoration.
                  THE ONLY COPY ON THIS PAGE, at full column width, because a
                  reader who has scrolled this far to study the organs wants
                  them large. It keeps its own scene selector (`.sim-scene-picker`
                  in ScenePanel) — the rail copy that used to mirror this one is
                  gone, so there is no second picker that could disagree with
                  this one. */}
              <div className="sim-section sim-scene-wide" id={SEC.body}>
                <ScenePanel
                  binding={sceneBinding}
                  sceneId={sceneId}
                  onScene={setSceneId}
                  frame={runner.latest}
                  history={runner.frames}
                  caption={(latestRun?.regimen ?? regimen)?.label}
                  evaluation={runner.evaluation ?? evaluation}
                  substanceIds={sceneSubstances}
                  live={!!runner.latest}
                />
              </div>

              {hasCombo && (
                <div className="sim-section" id={SEC.alternatives}>
                  <BenchPanel
                    bench={comboBench}
                    title={t('sim.bench.comboTitle')}
                    intro={DEMOS[0].claim}
                    readback="combination"
                  />
                </div>
              )}

              {hasDose && (
                /* The label quote is the source under the bench that used it,
                   not a free-standing paragraph a column-gap away. */
                <div className="sim-section sim-stack" id={SEC.bestDose}>
                  <BenchPanel bench={doseBench} title={t('sim.bench.doseTitle')} intro={DEMOS[2].claim} readback="dose" />
                  <p className="sim-cite sim-label-quote">
                    {t('sim.bench.labelAsStated')} “{AMLODIPINE_EDEMA_LABEL_QUOTE}” — {AMLODIPINE_EDEMA_SOURCE}
                  </p>
                </div>
              )}

              {/* Drawn in a visibly different material from every card around
                  it — see ai.css — so generated prose can never be taken for a
                  cited figure. */}
              <div className="sim-section" id={SEC.reasoning}>
                <AiPanel
                  state={ai.state}
                  settings={ai.settings}
                  modelLabel={ai.modelLabel}
                  configured={ai.configured}
                  running={ai.running}
                  blockedReason={aiBlockedReason}
                  basis={aiBasis}
                  onAsk={() => void ai.ask(buildAiContext)}
                  onCancel={ai.cancel}
                  onSettings={ai.updateSettings}
                  onSimulate={runSuggestion}
                  onWatchScene={sceneBinding.scenes.length ? setSceneId : undefined}
                />
              </div>

              {/* The rules that fired with their citations, the modelling
                  assumptions those rules carry — the amlodipine sex-by-dose
                  caveat among them — and the exposure and adverse-event
                  tables, including the sourced formulation refusals. */}
              {latestRun && (
                <div className="sim-section" id={SEC.rules}>
                  <ReportPanel
                    run={latestRun}
                    disclaimer={DISCLAIMER}
                    troughToPeak={reportTpr}
                    sections={['why', 'tables']}
                  />
                </div>
              )}

              {!!tray.length && (
                <section className="sim-card sim-tray" id={SEC.compare} aria-label={t('sim.section.compare')}>
                  <h3 className="sim-card-title">{t('sim.section.compare')}</h3>
                  <p className="sim-note">{t('sim.tray.tickToOverlay')}</p>
                  <ul>
                    {tray.map((r) => (
                      <li key={r.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={overlayIds.includes(r.id)}
                            onChange={(e) =>
                              setOverlayIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))
                            }
                          />
                          <span>{r.label}</span>
                          <em>
                            {signedBp(r.summary.deltaSbp)} mmHg · {t('sim.tray.day', { steadyState: r.initial === 'steady_state' })}
                          </em>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Zone>
          )}

          {/* =========================================== ZONE 4 — DETAIL ===
              Fine print. Collapsed by default, opened deliberately. */}
          {hasResult && (
            <Zone
              kind="detail"
              id="sim-detail"
              title={t('sim.zone.detail')}
              lead={t('sim.zone.detailLead')}
            >
              <Disclosure
                summary={t('sim.detail.weights')}
                meta={`${WEIGHT_SPECS.length} estimated`}
                open={weightsOpen}
                onToggle={() => setWeightsOpen((o) => !o)}
              >
                <WeightsPanel
                  weights={weights}
                  onChange={(w) => {
                    setWeights(w)
                    comboBench.rescore(w)
                    doseBench.rescore(w)
                  }}
                  rescoring={comboBench.running || doseBench.running}
                  note={
                    comboBench.arms.length || doseBench.arms.length
                      ? t('sim.weights.rerankNote')
                      : t('sim.weights.runBenchFirst')
                  }
                  onRescore={() => {
                    comboBench.rescore(weights)
                    doseBench.rescore(weights)
                  }}
                />
              </Disclosure>

              <Disclosure
                summary={t('sim.detail.engine')}
                meta={settingsSummary(options)}
                open={engineOpen}
                onToggle={() => setEngineOpen((o) => !o)}
              >
                <p className="sim-status">
                  {binding
                    ? t('sim.detail.engineLabel', { source: binding.source, worker: binding.mode === 'worker' })
                    : t('sim.detail.engineNotProbed')}
                  {loading ? t('sim.detail.loadingData') : data ? t('sim.detail.dataLoaded') : ''}
                </p>
              </Disclosure>

              {latestRun && (
                <Disclosure
                  summary={t('sim.detail.limits')}
                  meta={latestRun.patient.warnings?.length ? `${latestRun.patient.warnings.length}` : undefined}
                  open={limitsOpen}
                  onToggle={() => setLimitsOpen((o) => !o)}
                >
                  <ReportPanel run={latestRun} disclaimer={DISCLAIMER} sections={['limits']} />
                </Disclosure>
              )}
            </Zone>
          )}

          {/* Forward motion is always visible — blueprint §7 pattern 5. This is
              the page's exit, not a card, so it sits below every zone. */}
          {onNavigate && (
            <NextStep
              title={t('sim.next.title')}
              description={t('sim.next.desc')}
              actions={
                <>
                  <button className="btn" onClick={() => onNavigate('pills')}>
                    {t('pills.composeTitle')}
                  </button>
                  <button className="btn" onClick={() => onNavigate('subject')}>
                    {t('sim.next.buildSubject')}
                  </button>
                </>
              }
            />
          )}
        </div>
        {/* No rail. The body is in the Evidence zone above, once, at the size it
            is worth reading at. */}
      </div>
    </div>
  )
}
