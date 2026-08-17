/**
 * The context the model reasons over.
 *
 * Everything here is a FACT THE APP ALREADY HAS: the twin's inputs and derived
 * state, the rules that actually fired with their ids, severities, mechanisms
 * and citations, the engine's ranked options with their score components, the
 * run summary, and — when it exists — the deterministic treatment plan.
 *
 * The model's job is to turn that into reasoning a doctor would recognise. It
 * is not to recall pharmacology: nothing it knows about lisinopril is wanted
 * here, because nothing it knows carries a citation this product can print.
 *
 * Each section records the numbers it put on the page as it renders them. That
 * list is the entire vocabulary the reply is allowed to use — see numbers.ts.
 */

import type {
  DrugId,
  PatientState,
  Regimen,
  RunSummary,
  SeverityId,
} from '../types'
import type { EvaluationResult } from '../rules/evaluate'
import type { ScoredOption } from '../report/score'
import type { NumberFact } from './numbers'
import { factsFromText } from './numbers'
import { describe } from './serialize'
import type { AiContext, ContextSection, RegimenChoice } from './types'

/** Cap what any one section can contribute, so a long run cannot crowd out the plan. */
const MAX_HITS = 8
const MAX_OPTIONS = 6
const MAX_HAZARDS = 6
const MAX_VARS = 14

/** Twin state variables worth reasoning about, in the order a clinician reads them. */
const VAR_PRIORITY = [
  'egfr',
  'egfr_ml_min_1_73',
  'creatinine_clearance',
  'sbp_mmHg',
  'dbp_mmHg',
  'map_mmHg',
  'hr_bpm',
  'serum_k',
  'serum_na',
  'serum_urate',
  'serum_creatinine',
  'plasma_volume',
  'renin_pra',
  'cardiac_output',
  'svr',
]

function section(id: string, title: string): ContextSection {
  return { id, title, lines: [], facts: [] }
}

function addNum(s: ContextSection, label: string, value: number, unit: NumberFact['unit'], source?: string) {
  if (!Number.isFinite(value)) return
  const rendered = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
  s.facts.push({ value, unit, label, source })
  s.lines.push(`${label}: ${rendered}${unit ? ` ${unit}` : ''}`)
}

function addText(s: ContextSection, label: string, text: string, source?: string) {
  if (!text?.trim()) return
  s.lines.push(`${label}: ${text}`)
  s.facts.push(...factsFromText(text, label, source))
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

export function patientSection(patient: PatientState): ContextSection {
  const s = section('patient', 'The patient (digital twin)')
  const i = patient.inputs
  addNum(s, 'age', i.age_years, 'years')
  s.lines.push(`sex: ${i.sex}`)
  addNum(s, 'weight', i.weight_kg, 'kg')
  addNum(s, 'height', i.height_cm, 'cm')
  addNum(s, 'baseline systolic pressure', i.sbp_mmHg, 'mmHg')
  addNum(s, 'baseline diastolic pressure', i.dbp_mmHg, 'mmHg')
  if (typeof i.hr_bpm === 'number') addNum(s, 'baseline heart rate', i.hr_bpm, 'bpm')
  if (typeof i.serum_creatinine_mg_dl === 'number')
    addNum(s, 'serum creatinine', i.serum_creatinine_mg_dl, 'mg/dL')
  s.lines.push(`comorbidities: ${i.comorbidities?.length ? i.comorbidities.join(', ') : 'none recorded'}`)
  if (i.cyp2d6) s.lines.push(`CYP2D6 phenotype: ${i.cyp2d6}`)
  if (i.cyp2c9) s.lines.push(`CYP2C9 phenotype: ${i.cyp2c9}`)
  if (i.pregnant) s.lines.push('pregnant: yes')

  const varKeys = Object.keys(patient.vars ?? {})
  const ordered = [
    ...VAR_PRIORITY.filter((k) => k in (patient.vars ?? {})),
    ...varKeys.filter((k) => !VAR_PRIORITY.includes(k)),
  ].slice(0, MAX_VARS)
  if (ordered.length) {
    s.lines.push('derived twin state:')
    const { lines, facts } = describe(
      Object.fromEntries(ordered.map((k) => [k, patient.vars[k]])),
      { source: 'derived twin state', maxDepth: 2 },
    )
    s.lines.push(...lines.map((l) => `  ${l.trim()}`))
    s.facts.push(...facts)
  }
  for (const w of patient.warnings ?? []) s.lines.push(`twin warning: ${w}`)
  return s
}

const SEVERITY_WORD: Record<SeverityId, string> = {
  info: 'informational',
  preferred: 'preferred',
  compelling: 'compelling indication',
  minor: 'minor',
  moderate: 'moderate',
  major: 'major',
  contraindicated_relative: 'relative contraindication (blocks unless overridden)',
  contraindicated_absolute: 'absolute contraindication (blocks)',
}

export function rulesSection(evaluation: EvaluationResult | null): ContextSection {
  const s = section('rules', 'Rules that fired, with their citations')
  if (!evaluation) {
    s.lines.push('No rule evaluation is available for this run.')
    return s
  }
  s.lines.push(`feasibility tier: ${evaluation.tier}`)
  if (evaluation.blocked) s.lines.push(`blocked because: ${evaluation.blockReasons.join('; ')}`)
  if (!evaluation.hits.length) s.lines.push('No rule fired for this combination of patient and regimen.')

  for (const h of evaluation.hits.slice(0, MAX_HITS)) {
    s.lines.push(`- [${h.ruleId}] ${h.title} — ${SEVERITY_WORD[h.severity] ?? h.severity}`)
    addText(s, '  mechanism', h.mechanism, h.citation?.source)
    if (h.warningText) addText(s, '  warning', h.warningText, h.citation?.source)
    if (h.citation?.source) {
      s.lines.push(`  citation: ${h.citation.source}${h.citation.status === 'ESTIMATED' ? ' [ESTIMATED]' : ''}`)
      s.facts.push(...factsFromText(h.citation.source, `citation for ${h.ruleId}`, h.citation.source))
      if (h.citation.quote) {
        s.lines.push(`  quoted: “${h.citation.quote}”`)
        s.facts.push(...factsFromText(h.citation.quote, `quote for ${h.ruleId}`, h.citation.source))
      }
    }
  }
  if (evaluation.hits.length > MAX_HITS)
    s.lines.push(`… ${evaluation.hits.length - MAX_HITS} further rules fired and are not reproduced here.`)

  const risks = Object.entries(evaluation.risks ?? {}).filter(([, v]) => v > 0.0005)
  for (const [k, v] of risks.slice(0, MAX_HAZARDS)) {
    addNum(s, `rule-set risk, ${k.replace(/_/g, ' ')}`, Number((v * 100).toPrecision(4)), '%', 'rules engine')
  }
  for (const m of evaluation.monitoring ?? []) {
    s.lines.push(`monitor ${m.lab} at day ${m.atDays.join(', ')} (rules ${m.ruleIds.join(', ')})`)
    s.facts.push(...m.atDays.map((d) => ({ value: d, unit: 'days' as const, label: `monitoring day for ${m.lab}` })))
  }
  for (const c of evaluation.caveats ?? []) addText(s, 'modelling caveat', c.text, c.basis)
  return s
}

export function runSection(
  regimen: Regimen,
  summary: RunSummary,
  meta: { horizonHours: number; initial: string; populationN: number },
): ContextSection {
  const s = section('run', 'What the deterministic engine computed for this regimen')
  s.lines.push(`regimen: ${regimen.label}`)
  for (const d of regimen.doses) {
    s.lines.push(`  dose: ${d.substanceId} ${d.mg} mg × ${d.perDay}/day`)
    s.facts.push({ value: d.mg, unit: 'mg', label: `${d.substanceId} dose`, source: 'regimen' })
    s.facts.push({ value: d.perDay, unit: null, label: `${d.substanceId} administrations per day`, source: 'regimen' })
  }
  addNum(s, 'horizon', meta.horizonHours, 'h')
  s.lines.push(`initial conditions: ${meta.initial}`)
  addNum(s, 'virtual population size', meta.populationN, null)
  addNum(s, 'placebo-corrected systolic reduction', summary.deltaSbp, 'mmHg', 'engine')
  addNum(s, 'placebo-corrected diastolic reduction', summary.deltaDbp, 'mmHg', 'engine')
  if (typeof summary.deltaSbpP05 === 'number') addNum(s, 'systolic reduction P05', summary.deltaSbpP05, 'mmHg', 'engine')
  if (typeof summary.deltaSbpP95 === 'number') addNum(s, 'systolic reduction P95', summary.deltaSbpP95, 'mmHg', 'engine')

  for (const [k, v] of Object.entries(summary.peakConc ?? {})) {
    if (typeof v !== 'number') continue
    addNum(s, `steady-state peak ${k}`, Number(v.toPrecision(4)), 'ng/mL', 'engine')
  }
  for (const [k, v] of Object.entries(summary.troughConc ?? {})) {
    if (typeof v !== 'number') continue
    addNum(s, `steady-state trough ${k}`, Number(v.toPrecision(4)), 'ng/mL', 'engine')
  }
  const hazards = Object.entries(summary.hazards ?? {})
    .filter(([, v]) => v > 0.0005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HAZARDS)
  for (const [k, v] of hazards) {
    addNum(s, `probability of ${k.replace(/_/g, ' ')} over the horizon`, Number((v * 100).toPrecision(4)), '%', 'engine')
  }
  addNum(s, 'final serum potassium', Number(summary.finalChem.serum_k.toFixed(2)), 'mmol/L', 'engine')
  addNum(s, 'final serum creatinine', Number(summary.finalChem.serum_creatinine.toFixed(3)), 'mg/dL', 'engine')
  addNum(s, 'final serum sodium', Number(summary.finalChem.serum_na.toFixed(1)), 'mmol/L', 'engine')
  addNum(s, 'final serum urate', Number(summary.finalChem.serum_urate.toFixed(1)), null, 'engine')
  return s
}

export function rankingSection(ranked: ScoredOption[] | null, denominator: string): ContextSection {
  const s = section('ranking', 'The engine’s ranked options')
  if (!ranked?.length) {
    s.lines.push('No ranking has been computed. Do not describe one.')
    return s
  }
  addText(s, 'comparison set', denominator || 'not stated')
  addNum(s, 'number of arms ranked', ranked.length, null, 'scorer')
  ranked.slice(0, MAX_OPTIONS).forEach((o, i) => {
    const name = o.regimen?.label ?? o.regimen?.id ?? 'unnamed arm'
    s.lines.push(`- position ${i + 1}: ${name} (${o.tier})`)
    s.facts.push({ value: i + 1, unit: null, label: `rank position of ${name}`, source: 'scorer' })
    if (o.tier === 'DISQUALIFIED') {
      s.lines.push('  disqualified — no scores are shown for this arm anywhere in the product, and none may be written.')
      for (const h of o.hits?.filter((x) => x.blocks || x.severityRank >= 6) ?? []) {
        s.lines.push(`  blocking rule [${h.ruleId}] ${h.title}: ${h.mechanism}`)
      }
      return
    }
    addNum(s, `  composite score of ${name}`, o.composite ?? o.score, 'points', 'scorer')
    addNum(s, `  efficacy component of ${name}`, o.efficacyTerm, 'points', 'scorer')
    addNum(s, `  safety component of ${name}`, o.safetyTerm, 'points', 'scorer')
    addNum(s, `  appropriateness component of ${name}`, o.appropriatenessTerm, 'points', 'scorer')
    addNum(s, `  systolic reduction of ${name}`, o.deltaSbp, 'mmHg', 'engine')
    if (typeof o.goalAttainment === 'number')
      addNum(s, `  proportion reaching ${o.target?.label ?? 'target'} on ${name}`, Number((o.goalAttainment * 100).toPrecision(4)), '%', 'scorer')
    if (o.tiedWithLeader)
      s.lines.push('  TOO CLOSE TO CALL — inside the tie threshold. Must not be described as beaten or beating the leader.')
    for (const r of o.reasons?.slice(0, 4) ?? []) addText(s, '  reason', r, 'scorer')
    if (o.refusal) s.lines.push(`  the product DECLINED to rank part of this arm: ${o.refusal.reason}`)
  })
  if (ranked.length > MAX_OPTIONS) s.lines.push(`… ${ranked.length - MAX_OPTIONS} lower-ranked arms omitted.`)
  return s
}

/** The treatment plan, whatever shape it has today. See serialize.ts. */
export function planSection(plan: unknown): ContextSection {
  const s = section('plan', 'The deterministic treatment plan (this is what you are explaining)')
  if (!plan) {
    s.lines.push('No treatment plan is available for this patient yet.')
    return s
  }
  // The real plan renders to a little over 200 lines / 11 kB. The cap sits well
  // above that on purpose: truncating a plan silently would mean the model
  // explains a document the doctor is reading a longer version of, and the
  // first section to be cut would be `gaps` — the honest admissions at the end,
  // which are exactly the part that must not go missing.
  const { lines, facts } = describe(plan, { source: 'treatment plan', maxLines: 400, maxStringLength: 320 })
  s.lines.push(...lines)
  s.facts.push(...facts)
  return s
}

export function choicesFrom(regimens: Regimen[], notes: Record<string, string> = {}): RegimenChoice[] {
  const seen = new Set<string>()
  const out: RegimenChoice[] = []
  for (const r of regimens) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push({ id: r.id, label: r.label, note: notes[r.id] })
  }
  return out
}

export interface BuildContextInput {
  patient: PatientState
  evaluation: EvaluationResult | null
  /** The treatment plan from src/report/plan.ts, if the module has landed. */
  plan?: unknown
  regimen?: Regimen | null
  summary?: RunSummary | null
  runMeta?: { horizonHours: number; initial: string; populationN: number }
  ranked?: ScoredOption[] | null
  denominator?: string
  choices: RegimenChoice[]
  /** Anatomy scenes the model may recommend watching. Optional; empty is fine. */
  scenes?: RegimenChoice[]
  drugsInPlay?: DrugId[]
}

export function buildContext(input: BuildContextInput): AiContext {
  const sections: ContextSection[] = [patientSection(input.patient)]
  const hasPlan = !!input.plan
  if (hasPlan) sections.push(planSection(input.plan))
  sections.push(rulesSection(input.evaluation))
  if (input.regimen && input.summary && input.runMeta)
    sections.push(runSection(input.regimen, input.summary, input.runMeta))
  if (input.ranked?.length) sections.push(rankingSection(input.ranked, input.denominator ?? ''))

  return {
    sections,
    choices: input.choices,
    scenes: input.scenes ?? [],
    hasPlan,
    taskLabel: hasPlan
      ? 'Explain the treatment plan the engine and rules produced for this patient'
      : 'Explain what the engine computed for this patient',
  }
}

/** Every number the context contains, as one list. */
export function contextFacts(ctx: AiContext): NumberFact[] {
  return ctx.sections.flatMap((s) => s.facts)
}
