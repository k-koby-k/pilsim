/**
 * What the chat assistant is allowed to know.
 *
 * The reasoning panel gets its context from `context.ts`, which reaches into the
 * engine, the rules evaluation and the scorer. The chat surface cannot do that:
 * it floats over every page, and the page that mounts it is the only thing that
 * knows what is currently on screen. So the shape below is a PROP — the host
 * hands us a small, plain description of the visible state and we turn it into
 * the same `ContextSection[]` the rest of the AI layer already speaks.
 *
 * Two properties of this file matter more than its contents:
 *
 *  1. Every section it emits records the numbers it printed as `NumberFact`s.
 *     That list becomes the model's entire numeric vocabulary — see numbers.ts.
 *     A field that is not rendered here is a number the model may not write.
 *
 *  2. It always emits a COVERAGE section, even when the page is empty. A chat
 *     box invites questions the dataset cannot answer ("what about warfarin?",
 *     "is this safe in pregnancy?"), and the only honest answer to most of them
 *     is that PilSim does not model it. The model can only give that answer
 *     confidently if it has been told what the product's slice actually is, so
 *     the boundary of the product is itself part of the context.
 */

import { factsFromText, type NumberFact } from './numbers'
import type { CanonicalUnit } from './units'
import type { ContextSection } from './types'

// ---------------------------------------------------------------------------
// the prop shape — this is what the host passes in
// ---------------------------------------------------------------------------

export type ChatPage = 'home' | 'substances' | 'pills' | 'subject' | 'simulation'

/** The substance whose record is open, if the user is looking at one. */
export interface ChatSubstance {
  id: string
  name: string
  /** Pharmacological class, as the dataset words it. */
  drugClass?: string
  /** The plain description the page is already showing. */
  summary?: string
  /**
   * Key parameters as the page renders them. Numbers become quotable facts;
   * strings are passed through verbatim and their numbers harvested.
   */
  params?: Record<string, number | string | null | undefined>
}

/** The patient the user has selected. */
export interface ChatPatient {
  label: string
  ageYears?: number
  sex?: string
  weightKg?: number
  heightCm?: number
  sbpMmHg?: number
  dbpMmHg?: number
  hrBpm?: number
  creatinineMgDl?: number
  egfr?: number
  comorbidities?: string[]
  /** Twin warnings, derivation notes — whatever the page prints beside the twin. */
  notes?: string[]
}

/** The pill being composed, or the regimen ticked for a run. */
export interface ChatRegimen {
  label: string
  doses?: { substanceId: string; mg: number; perDay?: number }[]
  /** The safety verdict the rules engine already produced, in the app's own words. */
  verdict?: string
}

/** The result of the last completed run, if there is one. */
export interface ChatRun {
  horizonHours?: number
  populationN?: number
  deltaSbpMmHg?: number
  deltaDbpMmHg?: number
  finalSerumK?: number
  finalSerumCreatinineMgDl?: number
  /** Probabilities in 0..1, keyed by hazard name. Rendered as percentages. */
  hazards?: Record<string, number>
  /** Anything else the results panel is showing, one line each. */
  notes?: string[]
}

/** One rule that fired for what is on screen. */
export interface ChatRule {
  id: string
  title: string
  severity?: string
  mechanism?: string
  citation?: string
}

/**
 * What the product models AT ALL.
 *
 * Not what is on screen — what exists. This is what turns "I don't know" into
 * "PilSim does not model that", which is a different and far more useful answer.
 */
export interface ChatCatalogue {
  substances?: string[]
  comorbidities?: string[]
  /** One line naming what the simulation actually simulates, if the host has it. */
  scopeNote?: string
}

export interface ChatContext {
  /** Which page is on screen. The only required field. */
  page: ChatPage
  substance?: ChatSubstance | null
  patient?: ChatPatient | null
  regimen?: ChatRegimen | null
  run?: ChatRun | null
  rules?: ChatRule[]
  catalogue?: ChatCatalogue
  /**
   * Escape hatch: sections the host already built with `src/ai/context.ts`.
   * Appended verbatim, facts and all.
   */
  extra?: ContextSection[]
}

export const EMPTY_CHAT_CONTEXT: ChatContext = { page: 'home' }

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/** English, deliberately: the prompt is English whatever language the user types in. */
const PAGE_LABEL: Record<ChatPage, string> = {
  home: 'Overview',
  substances: 'Substances — the catalogue of modelled drugs',
  pills: 'Pills — composing a pill and checking it',
  subject: 'Test subjects — the patient library and the derived digital twin',
  simulation: 'Simulation — running a regimen against a patient and reading the result',
}

const LIMIT = { rules: 8, hazards: 6, params: 20, doses: 8, lines: 12 }

function section(id: string, title: string): ContextSection {
  return { id, title, lines: [], facts: [] }
}

function addNum(
  s: ContextSection,
  label: string,
  value: number | undefined | null,
  unit: CanonicalUnit | null,
  source?: string,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const rendered = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
  s.facts.push({ value, unit, label, source })
  s.lines.push(`${label}: ${rendered}${unit ? ` ${unit}` : ''}`)
}

function addText(s: ContextSection, label: string, text: string | undefined | null, source?: string): void {
  if (!text || !String(text).trim()) return
  s.lines.push(`${label}: ${text}`)
  s.facts.push(...factsFromText(String(text), label, source))
}

/** A bare line with no label. Numbers inside it are still harvested. */
function addLine(s: ContextSection, text: string, label: string, source?: string): void {
  if (!text.trim()) return
  s.lines.push(text)
  s.facts.push(...factsFromText(text, label, source))
}

function nonEmpty(s: ContextSection): ContextSection | null {
  return s.lines.length ? s : null
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

export function screenSection(ctx: ChatContext): ContextSection {
  const s = section('screen', 'The screen the question is being asked about')
  s.lines.push(`page: ${PAGE_LABEL[ctx.page] ?? ctx.page}`)
  const open: string[] = []
  if (ctx.substance) open.push(`substance "${ctx.substance.name}"`)
  if (ctx.patient) open.push(`patient "${ctx.patient.label}"`)
  if (ctx.regimen) open.push(`regimen "${ctx.regimen.label}"`)
  s.lines.push(
    open.length
      ? `currently open: ${open.join(', ')}`
      : 'nothing is open on this page yet — the user has not selected anything.',
  )
  if (!ctx.run) s.lines.push('no simulation has been run in this session, so there is no result to discuss.')
  return s
}

export function substanceSection(sub: ChatSubstance): ContextSection {
  const s = section('substance', 'The substance the user is looking at')
  s.lines.push(`name: ${sub.name}`)
  s.lines.push(`dataset id: ${sub.id}`)
  addText(s, 'class', sub.drugClass, 'substance record')
  addText(s, 'description', sub.summary, 'substance record')
  const entries = Object.entries(sub.params ?? {}).slice(0, LIMIT.params)
  if (entries.length) s.lines.push('parameters shown on this page:')
  for (const [k, v] of entries) {
    if (v === null || v === undefined) continue
    const label = `  ${k.replace(/_/g, ' ')}`
    if (typeof v === 'number') addNum(s, label, v, null, 'substance record')
    else addText(s, label, v, 'substance record')
  }
  return s
}

export function patientSection(p: ChatPatient): ContextSection {
  const s = section('patient', 'The patient currently selected')
  s.lines.push(`label: ${p.label}`)
  addNum(s, 'age', p.ageYears, 'years', 'patient record')
  if (p.sex) s.lines.push(`sex: ${p.sex}`)
  addNum(s, 'weight', p.weightKg, 'kg', 'patient record')
  addNum(s, 'height', p.heightCm, 'cm', 'patient record')
  addNum(s, 'baseline systolic pressure', p.sbpMmHg, 'mmHg', 'patient record')
  addNum(s, 'baseline diastolic pressure', p.dbpMmHg, 'mmHg', 'patient record')
  addNum(s, 'baseline heart rate', p.hrBpm, 'bpm', 'patient record')
  addNum(s, 'serum creatinine', p.creatinineMgDl, 'mg/dL', 'patient record')
  addNum(s, 'eGFR', p.egfr, 'mL/min/1.73m2', 'derived twin state')
  s.lines.push(
    `comorbidities: ${p.comorbidities?.length ? p.comorbidities.join(', ') : 'none recorded'}`,
  )
  for (const n of (p.notes ?? []).slice(0, LIMIT.lines)) addLine(s, `note: ${n}`, 'twin note', 'digital twin')
  return s
}

export function regimenSection(r: ChatRegimen): ContextSection {
  const s = section('regimen', 'The pill or regimen on screen')
  s.lines.push(`label: ${r.label}`)
  for (const d of (r.doses ?? []).slice(0, LIMIT.doses)) {
    const perDay = typeof d.perDay === 'number' ? ` × ${d.perDay}/day` : ''
    s.lines.push(`  dose: ${d.substanceId} ${d.mg} mg${perDay}`)
    s.facts.push({ value: d.mg, unit: 'mg', label: `${d.substanceId} dose`, source: 'regimen on screen' })
    if (typeof d.perDay === 'number')
      s.facts.push({
        value: d.perDay,
        unit: null,
        label: `${d.substanceId} administrations per day`,
        source: 'regimen on screen',
      })
  }
  addText(s, 'safety verdict already computed by the rules engine', r.verdict, 'rules engine')
  return s
}

export function runSection(run: ChatRun): ContextSection {
  const s = section('run', 'The result of the last run — computed by the deterministic engine')
  addNum(s, 'horizon', run.horizonHours, 'h', 'engine')
  addNum(s, 'virtual population size', run.populationN, null, 'engine')
  addNum(s, 'placebo-corrected systolic reduction', run.deltaSbpMmHg, 'mmHg', 'engine')
  addNum(s, 'placebo-corrected diastolic reduction', run.deltaDbpMmHg, 'mmHg', 'engine')
  addNum(s, 'final serum potassium', run.finalSerumK, 'mmol/L', 'engine')
  addNum(s, 'final serum creatinine', run.finalSerumCreatinineMgDl, 'mg/dL', 'engine')
  const hazards = Object.entries(run.hazards ?? {})
    .filter(([, v]) => typeof v === 'number' && v > 0.0005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT.hazards)
  for (const [k, v] of hazards) {
    addNum(
      s,
      `probability of ${k.replace(/_/g, ' ')} over the horizon`,
      Number((v * 100).toPrecision(4)),
      '%',
      'engine',
    )
  }
  for (const n of (run.notes ?? []).slice(0, LIMIT.lines)) addLine(s, `note: ${n}`, 'run note', 'engine')
  return s
}

export function rulesSection(rules: ChatRule[]): ContextSection {
  const s = section('rules', 'Rules that fired for what is on screen, with their citations')
  for (const r of rules.slice(0, LIMIT.rules)) {
    s.lines.push(`- [${r.id}] ${r.title}${r.severity ? ` — ${r.severity}` : ''}`)
    addText(s, '  mechanism', r.mechanism, r.citation)
    if (r.citation) addText(s, '  citation', r.citation, r.citation)
  }
  if (rules.length > LIMIT.rules)
    s.lines.push(`… ${rules.length - LIMIT.rules} further rules fired and are not reproduced here.`)
  return s
}

/**
 * The boundary of the product, stated as context.
 *
 * This section is never empty, because "not modelled" has to be answerable even
 * on an empty page.
 */
export function coverageSection(ctx: ChatContext): ContextSection {
  const s = section('coverage', 'WHAT PILSIM MODELS — the edge of this product')
  const c = ctx.catalogue
  if (c?.substances?.length) {
    s.lines.push(`the only substances in the dataset: ${c.substances.join(', ')}`)
    s.lines.push(
      'any other drug is NOT modelled. There is no parameter, no rule and no citation for it in this ' +
        'product, so no statement can be made about it.',
    )
  } else {
    s.lines.push(
      'the substance catalogue was not supplied to this conversation, so do not claim which drugs are ' +
        'or are not in it.',
    )
  }
  if (c?.comorbidities?.length)
    s.lines.push(`the only comorbidities the twin models: ${c.comorbidities.join(', ')}`)
  if (c?.scopeNote) addLine(s, c.scopeNote, 'scope note', 'product scope')
  s.lines.push(
    'PilSim simulates blood pressure control and organ-relevant markers over a horizon. It does not ' +
      'model clinical events, mortality, pregnancy outcomes, paediatric dosing, or any drug outside the ' +
      'catalogue above.',
  )
  s.lines.push(
    'It is a research simulator on virtual patients. It is not a prescribing tool and gives no advice ' +
      'about a real person.',
  )
  return s
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

/** Turn the host's description of the screen into the sections the model sees. */
export function chatSections(ctx: ChatContext): ContextSection[] {
  const out: ContextSection[] = [screenSection(ctx)]
  if (ctx.substance) out.push(substanceSection(ctx.substance))
  if (ctx.patient) out.push(patientSection(ctx.patient))
  if (ctx.regimen) out.push(regimenSection(ctx.regimen))
  if (ctx.run) out.push(runSection(ctx.run))
  if (ctx.rules?.length) out.push(rulesSection(ctx.rules))
  for (const e of ctx.extra ?? []) {
    const kept = nonEmpty(e)
    if (kept) out.push(kept)
  }
  out.push(coverageSection(ctx))
  return out
}

/** Every number the chat context contains, as one list. */
export function chatContextFacts(ctx: ChatContext): NumberFact[] {
  return chatSections(ctx).flatMap((s) => s.facts)
}

/**
 * Short, human list of what the assistant is grounded in, for the panel header.
 *
 * Ids, not sentences, so it stays honest: the panel says "grounded in: patient,
 * regimen, last run" and the user can see for themselves that nothing else was
 * sent. Localised by the caller.
 */
export function groundedIn(ctx: ChatContext): Array<'substance' | 'patient' | 'regimen' | 'run' | 'rules'> {
  const out: Array<'substance' | 'patient' | 'regimen' | 'run' | 'rules'> = []
  if (ctx.substance) out.push('substance')
  if (ctx.patient) out.push('patient')
  if (ctx.regimen) out.push('regimen')
  if (ctx.run) out.push('run')
  if (ctx.rules?.length) out.push('rules')
  return out
}
