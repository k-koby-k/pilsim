/**
 * Adapter between a pill composition and the rules engine. Owned by Agent UI-A.
 *
 * This calls the real engine — `evaluateRules` from `src/rules/evaluate.ts` (Agent
 * RUL) — and does nothing clever with the result. All 48 rules, the full boolean
 * trigger language and all 13 effect ops come from there. The adapter's whole job is
 * the impedance mismatch: the engine evaluates a *patient plus a regimen*, and the
 * Pills page has neither. It has a composition.
 *
 * HOW A COMPOSITION IS PRESENTED TO THE ENGINE
 *   - active components become a one-a-day `Regimen`;
 *   - excipient components become `RuleContext.excipients`;
 *   - the patient is an explicitly blank `PatientState` — no comorbidities, no labs,
 *     no pregnancy, no phenotype data.
 *
 * WHY THERE IS STILL A `deferred` LIST. With a blank patient the engine reports lab,
 * dose and excipient-quantity atoms in `unresolvedAtoms`, which is exactly right. But
 * `condition`, `demographic` and `phenotype` atoms resolve to a definite *false*
 * against a blank patient rather than to "unknown" — correct behaviour for a real
 * subject with none of those conditions, and misleading here, where the honest answer
 * is that nobody has been asked yet. So `deferred` is the union of two sources:
 *
 *   (a) the engine's own `unresolvedAtoms`, grouped by rule; and
 *   (b) a scan for rules that did not fire, name a patient-side atom type, and touch
 *       an ingredient actually present in this pill.
 *
 * (b) is what keeps a lactose-containing tablet reporting EXC-LACTOSE-GALACTOSEMIA as
 * pending a subject instead of silently clear. Dropping it would make the page claim
 * an all-clear it has not earned.
 *
 * Severity handling is the engine's, not ours: rank 7 blocks, rank 6 populates
 * `overrideRequired` and sets tier OVERRIDE_REQUIRED without blocking. Dual RAAS
 * blockade is rank 6 — the labels say avoid, not contraindicated.
 */

import type { PatientInputs, PatientState, Regimen, RuleHit, SeverityId, DrugId } from '../../types'
import type { RulesFile, RuleRecord, TriggerAtom, TriggerNode } from '../../data/load'
import { SUBSTANCE_CLASSES, evaluateRules, type EvaluationResult } from '../../rules/evaluate'

// ---------------------------------------------------------------------------

export interface CompositionComponent {
  substanceId: string
  role: 'active' | 'excipient' | string
  amountMg: number | null
  /**
   * Dosage form, matching a `formulations[].form` string in substances.json —
   * see `DoseSpec.form` (src/types.ts). Omitted means the substance's
   * reference immediate-release oral form. Not consumed by the rules check
   * (form does not change which rule fires); carried through purely so a
   * composition remembers what the user chose.
   */
  form?: string
  /**
   * Salt/ester actually labelled on the product (e.g. "metoprolol tartrate"),
   * present only where `data/products.json` composition carries `salt_form`.
   * Display-only — not consumed by the rules check.
   */
  saltForm?: string
  /**
   * The strength printed on the product label, in the labelled salt's own mg
   * (e.g. 50 for "metoprolol tartrate 50 mg"). `amountMg` above is the
   * MOIETY BASE mass used for PK and is frequently a different, unlicensed-
   * looking number (e.g. 39.1) — see `data/products.json`
   * `cross_file_dependencies.salt_basis_warning`. Present only where the
   * composition record carries `label_strength_mg`. Display-only.
   */
  labelStrengthMg?: number | null
}

export interface CompositionInput {
  components: CompositionComponent[]
}

export interface DeferredRule {
  id: string
  title: string
  severity: SeverityId
  /** Atom types or state paths that need a subject before this rule can be judged. */
  needs: string[]
}

export interface CompositionEvaluation {
  /** The engine's full result. Everything below is a view onto it. */
  result: EvaluationResult
  /** ALLOWED | OVERRIDE_REQUIRED | DISQUALIFIED, straight from the engine. */
  tier: EvaluationResult['tier']
  /** rank 7 — hard block. */
  blockers: RuleHit[]
  /** rank 6 — the engine's own `overrideRequired`; avoid, not contraindicated. */
  overrides: RuleHit[]
  /** ranks 3..5. */
  warnings: RuleHit[]
  /** ranks 1..2 — the engine returns positive indications too. */
  positives: RuleHit[]
  /** rank 0. */
  infos: RuleHit[]
  /** Rules this composition touches that need a subject before they can be judged. */
  deferred: DeferredRule[]
  engine: string
}

const ENGINE_NAME = 'src/rules/evaluate.ts'

/** Atom types answerable from a composition alone. Everything else needs a subject. */
const COMPOSITION_ATOMS = new Set(['substance', 'drug_class', 'excipient', 'route'])

const DRUG_IDS = new Set<string>(Object.keys(SUBSTANCE_CLASSES))

/** Mirrors data/rules.json `severity_levels`; used only to order the deferred list. */
const SEVERITY_RANK: Record<SeverityId, number> = {
  info: 0,
  preferred: 1,
  compelling: 2,
  minor: 3,
  moderate: 4,
  major: 5,
  contraindicated_relative: 6,
  contraindicated_absolute: 7,
}

// ---------------------------------------------------------------------------
// Presenting a composition to the engine
// ---------------------------------------------------------------------------

/**
 * A deliberately blank subject. Not a plausible average patient — a stand-in that
 * asserts nothing, so that no rule fires on a demographic or comorbidity the user has
 * not entered. `vars` is empty on purpose: it makes every lab atom unresolvable rather
 * than accidentally normal.
 */
function blankPatient(): PatientState {
  const inputs: PatientInputs = {
    age_years: 0,
    sex: 'female',
    weight_kg: 0,
    height_cm: 0,
    sbp_mmHg: 0,
    dbp_mmHg: 0,
    comorbidities: [],
  }
  return { inputs, vars: {}, appliedPresets: [], warnings: [] }
}

function regimenFrom(components: CompositionComponent[]): Regimen {
  return {
    id: 'composition',
    label: 'Composition under inspection',
    doses: components
      .filter((c) => !/excipient/i.test(c.role) && DRUG_IDS.has(c.substanceId))
      .map((c) => ({
        substanceId: c.substanceId as DrugId,
        mg: c.amountMg ?? 0,
        perDay: 1,
        form: c.form,
      })),
  }
}

function excipientContext(components: CompositionComponent[]): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {}
  for (const c of components) {
    if (/excipient/i.test(c.role)) out[c.substanceId] = true
  }
  return out
}

// ---------------------------------------------------------------------------
// The "pending a subject" scan — see the file header for why this exists
// ---------------------------------------------------------------------------

interface ScanResult {
  /** Patient-side atom types the rule asks about. */
  patientAtoms: Set<string>
  /** Did any positive presence atom match something in this pill? */
  touched: boolean
}

function isAtom(node: TriggerNode): node is TriggerAtom {
  return typeof (node as TriggerAtom).type === 'string'
}

function scanTrigger(
  node: TriggerNode,
  present: Set<string>,
  classes: Set<string>,
  out: ScanResult,
): void {
  if (!node) return

  if (isAtom(node)) {
    if (!COMPOSITION_ATOMS.has(node.type)) {
      // Use the state path for lab atoms so this merges with the engine's own
      // `unresolvedAtoms` entry for the same atom instead of double-listing it.
      out.patientAtoms.add(node.type === 'lab' ? node.key : node.type)
      return
    }
    if (node.op === 'absent') return
    if (node.type === 'drug_class' ? classes.has(node.key) : present.has(node.key)) {
      out.touched = true
    }
    return
  }

  const n = node as Record<string, unknown>
  for (const key of ['all', 'any', 'not'] as const) {
    const branch = n[key]
    if (branch === undefined) continue
    const children = Array.isArray(branch) ? (branch as TriggerNode[]) : [branch as TriggerNode]
    for (const child of children) scanTrigger(child, present, classes, out)
  }
}

function deferredScan(
  rules: RuleRecord[],
  fired: Set<string>,
  components: CompositionComponent[],
): Map<string, DeferredRule> {
  const present = new Set(components.map((c) => c.substanceId))
  const classes = new Set<string>()
  for (const c of components) {
    if (/excipient/i.test(c.role)) continue
    for (const k of SUBSTANCE_CLASSES[c.substanceId] ?? []) classes.add(k)
  }

  const map = new Map<string, DeferredRule>()
  for (const rule of rules) {
    if (fired.has(rule.id)) continue
    const scan: ScanResult = { patientAtoms: new Set(), touched: false }
    scanTrigger(rule.trigger, present, classes, scan)
    if (!scan.touched || scan.patientAtoms.size === 0) continue
    map.set(rule.id, {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      needs: Array.from(scan.patientAtoms).sort(),
    })
  }
  return map
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function evaluateComposition(
  rulesFile: RulesFile | null,
  input: CompositionInput,
): CompositionEvaluation {
  if (!rulesFile) return emptyEvaluation('rules not loaded')

  const result = evaluateRules(blankPatient(), regimenFrom(input.components), rulesFile, {
    excipients: excipientContext(input.components),
  })

  const fired = new Set(result.hits.map((h) => h.ruleId))
  const byRule = new Map<string, RuleRecord>(rulesFile.rules.map((r) => [r.id, r]))

  // (a) the engine's own unresolved atoms, grouped by rule
  const deferred = deferredScan(rulesFile.rules, fired, input.components)
  for (const u of result.unresolvedAtoms) {
    if (fired.has(u.ruleId)) continue
    const rule = byRule.get(u.ruleId)
    if (!rule) continue
    const entry = deferred.get(u.ruleId) ?? {
      id: u.ruleId,
      title: rule.title,
      severity: rule.severity,
      needs: [],
    }
    const need = u.atom.type === 'lab' ? u.atom.key : u.atom.type
    if (!entry.needs.includes(need)) entry.needs = [...entry.needs, need].sort()
    deferred.set(u.ruleId, entry)
  }

  return view(result, Array.from(deferred.values()), ENGINE_NAME)
}

function view(
  result: EvaluationResult,
  deferred: DeferredRule[],
  engine: string,
): CompositionEvaluation {
  const hits = result.hits
  const overrideIds = new Set(result.overrideRequired.map((h) => h.ruleId))
  return {
    result,
    tier: result.tier,
    blockers: hits.filter((h) => h.severityRank === 7),
    // Trust the engine's list; fall back to rank for any rank-6 hit it did not classify.
    overrides: hits.filter((h) => overrideIds.has(h.ruleId) || h.severityRank === 6),
    warnings: hits.filter((h) => h.severityRank >= 3 && h.severityRank <= 5),
    positives: hits.filter((h) => h.severityRank === 1 || h.severityRank === 2),
    infos: hits.filter((h) => h.severityRank === 0),
    // Most severe pending rule first — a pregnancy contraindication awaiting a subject
    // matters more than a first-line-choice hint awaiting a blood pressure.
    deferred: deferred.sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.id.localeCompare(b.id),
    ),
    engine,
  }
}

function emptyEvaluation(engine: string): CompositionEvaluation {
  const result: EvaluationResult = {
    hits: [],
    blocked: false,
    blockReasons: [],
    pkMultipliers: {},
    pdMultipliers: {},
    stateShifts: {},
    doseCaps: {},
    phenoconversions: {},
    overrideRequired: [],
    tier: 'ALLOWED',
    scoreDeltas: { efficacy: 0, safety: 0, appropriateness: 0 },
    scoreDeltasBySubstance: {},
    risks: {},
    monitoring: [],
    organAnnotations: [],
    externalDoseCaps: {},
    doseStarts: {},
    titrationIntervalDays: {},
    unresolvedAtoms: [],
  }
  return view(result, [], engine)
}

// ---------------------------------------------------------------------------
// Headline verdict
// ---------------------------------------------------------------------------

export type Verdict = 'blocked' | 'override' | 'warn' | 'clear'

export function verdictOf(e: CompositionEvaluation): Verdict {
  if (e.tier === 'DISQUALIFIED' || e.blockers.length > 0) return 'blocked'
  if (e.tier === 'OVERRIDE_REQUIRED' || e.overrides.length > 0) return 'override'
  if (e.warnings.length > 0) return 'warn'
  return 'clear'
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  blocked: 'Blocked',
  override: 'Override required',
  warn: 'Warnings',
  clear: 'No conflicts',
}
