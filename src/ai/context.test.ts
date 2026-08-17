/**
 * The context, against the REAL treatment plan.
 *
 * This is the join between two agents' work, so it is tested against
 * `src/report/plan.ts` itself rather than against a mock of it. What is being
 * checked is not that particular sentences appear — those belong to the plan's
 * own tests — but that the join holds:
 *
 *  - the plan actually reaches the model, through a bridge that must keep
 *    working when the plan grows fields nobody told this module about;
 *  - the model is TOLD the honesty rules the renderer enforces structurally,
 *    so its prose does not contradict the screen beside it;
 *  - and the number set the reply is judged against is exactly the set of
 *    numbers the plan put in front of it — no wider, or an invented figure
 *    would have somewhere to hide.
 */

import { describe as suite, expect, it } from 'vitest'
import { buildTreatmentPlan } from '../report/plan'
import { rankOptions } from '../report/score'
import { emptyEvaluation } from '../rules/evaluate'
import type { PatientState, RunSummary, Regimen } from '../types'
import { buildContext, choicesFrom, contextFacts, rankingSection } from './context'
import { buildPrompt, renderContext, SYSTEM_PROMPT } from './prompt'
import { checkNumbers, extractNumbers, summarize } from './numbers'
import { buildPlanIfAvailable, planBinding } from './planBridge'

const patient: PatientState = {
  inputs: {
    age_years: 64,
    sex: 'male',
    weight_kg: 88,
    height_cm: 176,
    sbp_mmHg: 158,
    dbp_mmHg: 94,
    hr_bpm: 72,
    serum_creatinine_mg_dl: 1.6,
    comorbidities: ['ckd'],
  },
  vars: { sbp_mmHg: 158, dbp_mmHg: 94, egfr_ckdepi2021: 46 },
  appliedPresets: ['ckd'],
  warnings: [],
}

const regimen: Regimen = {
  id: 'amlodipine_5',
  label: 'Amlodipine 5 mg',
  doses: [{ substanceId: 'amlodipine', mg: 5, perDay: 1 }],
}

const summary: RunSummary = {
  deltaSbp: 13.7,
  deltaDbp: 7.9,
  deltaSbpP05: 6.1,
  deltaSbpP95: 21.4,
  peakConc: { amlodipine: 6.24 },
  troughConc: { amlodipine: 4.81 },
  hazards: { peripheral_edema: 0.03, dizziness_orthostatic: 0.012 },
  finalChem: {
    plasma_volume: 3.1,
    ecf_volume: 14.2,
    serum_k: 4.3,
    serum_na: 139,
    serum_urate: 372,
    serum_creatinine: 1.62,
    fasting_glucose: 5.5,
  },
  framesEmitted: 769,
}

const ranked = rankOptions({
  patient,
  candidates: [{ regimen, summary, modifiers: emptyEvaluation(), populationN: 200, dosesPerDay: 1 }],
})

const plan = buildTreatmentPlan({ patient, ranked, summary, modifiers: emptyEvaluation() })

function fullContext(withPlan = true) {
  return buildContext({
    patient,
    evaluation: emptyEvaluation(),
    plan: withPlan ? plan : undefined,
    regimen,
    summary,
    runMeta: { horizonHours: 192, initial: 'steady_state', populationN: 200 },
    ranked,
    denominator: '1 arm',
    choices: choicesFrom([regimen, { id: 'amlodipine_10', label: 'Amlodipine 10 mg', doses: [] }]),
  })
}

suite('the bridge to src/report/plan.ts', () => {
  it('finds the builder without knowing its signature in advance', async () => {
    const binding = await planBinding()
    expect(binding.available).toBe(true)
    expect(binding.from).toMatch(/plan\.ts#/)
  })

  it('builds a plan through the bridge', async () => {
    const built = await buildPlanIfAvailable({
      patient,
      evaluation: emptyEvaluation(),
      regimen,
      ranked,
      summary,
    } as never)
    expect(built).toBeTruthy()
    expect((built as { kind?: string }).kind).toBe('treatment_plan')
  })

  it('degrades to the run and the ranking when no plan is supplied', () => {
    const ctx = fullContext(false)
    expect(ctx.hasPlan).toBe(false)
    expect(ctx.sections.map((s) => s.id)).not.toContain('plan')
    expect(renderContext(ctx)).toContain('Explain what the engine computed')
  })
})

suite('what the plan puts in front of the model', () => {
  const ctx = fullContext()
  const text = renderContext(ctx)

  it('carries the plan, not just a ranking', () => {
    expect(ctx.hasPlan).toBe(true)
    expect(text).toContain('deterministic treatment plan')
    // The plan is the thing being explained, so the task line has to say so.
    expect(text).toContain('what is being started and why THIS patient gets that choice')
  })

  it('reaches the parts of the plan a prescriber acts on', () => {
    const lower = text.toLowerCase()
    for (const topic of ['start', 'titration', 'target', 'monitoring', 'avoid', 'escalation', 'outlook']) {
      expect(lower, `the plan section "${topic}" never reached the model`).toContain(topic)
    }
  })

  it('adapts to fields nobody wired by hand', () => {
    // Nothing in src/ai names a plan field. Adding one to plan.ts must make it
    // appear here with no edit, which is only true if the walker is generic.
    const extended = { ...(plan as object), someFieldInventedLater: { doseMg: 42 } }
    const ctx2 = buildContext({ patient, evaluation: null, plan: extended, choices: [] })
    const rendered = renderContext(ctx2)
    expect(rendered).toContain('some field invented later')
    expect(rendered).toContain('42 mg')
    expect(contextFacts(ctx2)).toContainEqual(expect.objectContaining({ value: 42, unit: 'mg' }))
  })
})

suite('the honesty rules the model is given', () => {
  it('forbids inventing a number, and says what happens if it does', () => {
    expect(SYSTEM_PROMPT).toMatch(/ONLY numbers that appear in the CONTEXT/)
    expect(SYSTEM_PROMPT).toMatch(/flagged in red/)
  })

  it('forbids recalling pharmacology from training data', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never recall pharmacology from memory/)
  })

  it('carries the renderer invariants into the prose', () => {
    // These match guarantees RankedList.tsx enforces structurally. The prose has
    // to agree with the screen it sits under, or the panel contradicts the card.
    expect(SYSTEM_PROMPT).toMatch(/TOO CLOSE TO CALL/)
    expect(SYSTEM_PROMPT).toMatch(/DISQUALIFIED.*Write no score/s)
    expect(SYSTEM_PROMPT).toMatch(/DECLINED to rank.*Do not fill the gap/s)
    expect(SYSTEM_PROMPT).toMatch(/never a prediction of events/)
  })

  it('marks a tied and a disqualified arm in the context itself, not only in the rules', () => {
    const tied = rankingSection(
      [
        { ...ranked[0], tiedWithLeader: true },
        { ...ranked[0], regimen: { id: 'x', label: 'X', doses: [] }, tier: 'DISQUALIFIED' },
      ] as typeof ranked,
      '2 arms',
    )
    const body = tied.lines.join('\n')
    expect(body).toContain('TOO CLOSE TO CALL')
    expect(body).toContain('no scores are shown for this arm anywhere in the product')
    // A disqualified arm contributes no score facts, so a score for it cannot
    // even be quoted back at us as "supported".
    expect(tied.facts.filter((f) => f.label.includes('composite score of X'))).toHaveLength(0)
  })
})

suite('the allowed number set is exactly the prompt', () => {
  const { messages, facts } = buildPrompt(fullContext())
  const sent = messages.map((m) => m.content).join('\n')

  it('admits every number that was sent', () => {
    const tokens = extractNumbers(sent)
    expect(tokens.length).toBeGreaterThan(30)
    const checked = checkNumbers(sent, facts)
    expect(summarize(checked).unsupported).toBe(0)
  })

  it('admits nothing that was not', () => {
    // 8887 appears nowhere in a plan for this patient. If the allowed set were
    // built from anything other than the text we sent, this would pass.
    const checked = checkNumbers('The dose is 8887 mg and the target is 8887 mmHg.', facts)
    expect(checked.every((t) => t.status === 'unsupported')).toBe(true)
  })

  it('rejects a plausible dose the plan did not choose', () => {
    const checked = checkNumbers('Titrate to 7.5 mg.', facts)
    expect(checked[0].status).toBe('unsupported')
  })

  it('is small enough to send on a free tier', () => {
    // A short reasoning task on a small instruct model. Roughly four characters
    // to a token, so this keeps the request well inside a 128k window and well
    // inside a daily free allocation.
    expect(sent.length).toBeLessThan(24_000)
  })
})
