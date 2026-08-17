/**
 * End to end through the real transport, with only `fetch` faked.
 *
 * The two things proved here are the two that would embarrass the team live:
 * a model reply carrying an invented dose must arrive at the panel already
 * marked as unsupported, and every way the provider can fail must come back as
 * a stated failure rather than as silence or as canned text.
 */

import { afterEach, describe as suite, expect, it, vi } from 'vitest'
import { runReasoning, type AiRunState } from './client'
import { buildContext } from './context'
import { SUGGEST_MARKER } from './prompt'
import { DEFAULT_SETTINGS, activeProvider, loadSettings, mergeSettings } from './providers'
import type { AiSettings } from './providers/types'
import type { PatientState, RunSummary, Regimen } from '../types'

// --- fixtures ---------------------------------------------------------------

const patient: PatientState = {
  inputs: {
    age_years: 61,
    sex: 'male',
    weight_kg: 82,
    height_cm: 175,
    sbp_mmHg: 158,
    dbp_mmHg: 94,
    hr_bpm: 74,
    serum_creatinine_mg_dl: 1.1,
    comorbidities: ['gout'],
  },
  vars: { egfr: 71 },
  appliedPresets: ['gout'],
  warnings: [],
}

const regimen: Regimen = {
  id: 'amlodipine_5',
  label: 'Amlodipine 5 mg',
  doses: [{ substanceId: 'amlodipine', mg: 5, perDay: 1 }],
}

const summary: RunSummary = {
  deltaSbp: 12.4,
  deltaDbp: 7.1,
  peakConc: { amlodipine: 6.2 },
  troughConc: { amlodipine: 4.8 },
  hazards: { peripheral_edema: 0.03 },
  finalChem: {
    plasma_volume: 3,
    ecf_volume: 14,
    serum_k: 4.2,
    serum_na: 140,
    serum_urate: 380,
    serum_creatinine: 1.12,
    fasting_glucose: 5.4,
  },
  framesEmitted: 400,
}

function context() {
  return buildContext({
    patient,
    evaluation: null,
    regimen,
    summary,
    runMeta: { horizonHours: 192, initial: 'steady_state', populationN: 200 },
    choices: [
      { id: 'amlodipine_5', label: 'Amlodipine 5 mg' },
      { id: 'amlodipine_10', label: 'Amlodipine 10 mg' },
    ],
  })
}

const settings: AiSettings = { ...DEFAULT_SETTINGS, workerEndpoint: 'https://pilsim-ai.example.workers.dev' }

/** A fake SSE body, chunked mid-token so the streaming path is exercised. */
function sseBody(text: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const frames: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    frames.push(`data: ${JSON.stringify({ response: text.slice(i, i + chunkSize) })}\n\n`)
  }
  frames.push('data: [DONE]\n\n')
  return new ReadableStream({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f))
      c.close()
    },
  })
}

/**
 * `body` is deliberately `unknown`: the DOM `Response.body` is typed over
 * `Uint8Array<ArrayBuffer>` while the platform `ReadableStream` constructor
 * yields `ArrayBufferLike`, and the two do not unify. Nothing about that
 * distinction is what these tests are checking.
 */
function stubFetch(res: { ok?: boolean; status?: number; text?: () => Promise<string>; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, text: async () => '', ...res }) as unknown as Response),
  )
}

afterEach(() => vi.unstubAllGlobals())

async function run(reply: string): Promise<{ final: AiRunState; updates: AiRunState[] }> {
  stubFetch({ body: sseBody(reply) })
  const updates: AiRunState[] = []
  const final = await runReasoning(context(), { settings, onUpdate: (s) => updates.push(s) })
  return { final, updates }
}

// --- tests ------------------------------------------------------------------

suite('a well-behaved reply', () => {
  it('streams, validates clean, and yields runnable suggestions', async () => {
    const { final, updates } = await run(
      'Amlodipine 5 mg lowered systolic pressure by 12.4 mmHg in this 61 year old.\n' +
        `${SUGGEST_MARKER}\namlodipine_10 | settles whether the higher rung is worth its oedema cost\n`,
    )
    expect(final.status).toBe('done')
    expect(final.validation.clean).toBe(true)
    expect(final.validation.supported).toBeGreaterThan(2)
    expect(final.suggestions).toEqual([
      expect.objectContaining({ regimenId: 'amlodipine_10', label: 'Amlodipine 10 mg' }),
    ])
    // Streaming actually happened rather than one final blob.
    expect(updates.length).toBeGreaterThan(5)
    expect(updates.filter((u) => u.status === 'streaming').length).toBeGreaterThan(4)
  })

  it('never shows the suggestion marker or its block as prose', async () => {
    const { final, updates } = await run(`Short answer.\n${SUGGEST_MARKER}\namlodipine_10 | why\n`)
    for (const u of [...updates, final]) {
      expect(u.prose).not.toContain(SUGGEST_MARKER)
      expect(u.prose).not.toContain('amlodipine_10 |')
      // Not even a half-arrived marker may flash on screen.
      expect(u.prose).not.toMatch(/<<<S?U?G?G?E?S?T?>?>?>?$/)
    }
  })
})

suite('a misbehaving reply', () => {
  it('marks an invented dose unsupported before it can render as sourced', async () => {
    const { final } = await run('Start amlodipine 7 mg daily, which gives about 21 mmHg.')
    expect(final.validation.clean).toBe(false)
    expect(final.validation.offenders).toEqual(expect.arrayContaining(['7 mg', '21 mmHg']))
    const flagged = final.segments.filter((s) => s.kind === 'number' && s.status === 'unsupported')
    expect(flagged.map((s) => s.text)).toEqual(expect.arrayContaining(['7 mg', '21 mmHg']))
  })

  it('discards a proposed regimen the app never defined', async () => {
    const { final } = await run(`Text.\n${SUGGEST_MARKER}\namlodipine_7 | seven\namlodipine_10 | ten\n`)
    expect(final.suggestions.map((s) => s.regimenId)).toEqual(['amlodipine_10'])
    expect(final.rejectedIds).toContain('amlodipine_7')
  })

  it('keeps every rendered number attributable, supported or not', async () => {
    const { final } = await run('5 mg, 12.4 mmHg and an invented 99 mmHg.')
    const numbers = final.segments.filter((s) => s.kind === 'number')
    expect(numbers).toHaveLength(3)
    expect(numbers.every((n) => n.status !== 'pending')).toBe(true)
    expect(numbers.filter((n) => n.status === 'supported').every((n) => !!n.fact)).toBe(true)
  })
})

suite('absence, at every level', () => {
  it('reports no provider rather than pretending', async () => {
    const state = await runReasoning(context(), { settings: DEFAULT_SETTINGS, onUpdate: () => {} })
    expect(state.status).toBe('error')
    expect(state.failure?.kind).toBe('no-provider')
    expect(state.failure?.remedy).toBeTruthy()
    expect(state.prose).toBe('')
  })

  it('reports a rate limit as a rate limit, with a remedy', async () => {
    stubFetch({ ok: false, status: 429, text: async () => 'daily neuron allocation exhausted' })
    const state = await runReasoning(context(), { settings, onUpdate: () => {} })
    expect(state.failure).toMatchObject({ kind: 'rate-limit', status: 429 })
    expect(state.failure?.remedy).toMatch(/switch provider/i)
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))
    const state = await runReasoning(context(), { settings, onUpdate: () => {} })
    expect(state.failure?.kind).toBe('network')
  })

  it('reports an empty stream rather than rendering a blank panel as success', async () => {
    stubFetch({ body: sseBody('') })
    const state = await runReasoning(context(), { settings, onUpdate: () => {} })
    expect(state.status).toBe('error')
    expect(state.failure?.kind).toBe('malformed')
  })

  it('keeps the partial text when the stream is cut off, and still calls it an error', async () => {
    // A truncated reply is partial, not untrustworthy — but the panel must not
    // look as though the model finished.
    const enc = new TextEncoder()
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      // `error()` clears anything still queued, so the failure has to arrive on
      // a later pull for this to model a connection dropping mid-reply.
      pull(c) {
        if (pulls++ === 0) c.enqueue(enc.encode(`data: ${JSON.stringify({ response: 'Amlodipine 5 mg was' })}\n\n`))
        else c.error(new Error('connection reset'))
      },
    })
    stubFetch({ body })
    const state = await runReasoning(context(), { settings, onUpdate: () => {} })
    expect(state.status).toBe('error')
    expect(state.prose).toContain('Amlodipine 5 mg')
    expect(state.failure?.kind).toBe('network')
  })
})

suite('provider selection', () => {
  it('is null until something is configured, which is an ordinary state', () => {
    expect(activeProvider(DEFAULT_SETTINGS)).toBeNull()
  })

  it('prefers the Worker, where the key is server-side', () => {
    const both = mergeSettings(settings, { geminiApiKey: 'AIza-not-a-real-key-000' })
    expect(activeProvider(both)?.id).toBe('worker')
  })

  it('falls back to the direct Gemini path when only a key is present', () => {
    expect(activeProvider(mergeSettings({ geminiApiKey: 'AIza-not-a-real-key-000' }))?.id).toBe('gemini-direct')
  })

  it('honours an explicit choice, and reports nothing when that choice is unconfigured', () => {
    expect(activeProvider(mergeSettings(settings, { provider: 'gemini-direct' }))).toBeNull()
    expect(activeProvider(mergeSettings(settings, { provider: 'worker' }))?.id).toBe('worker')
  })

  it('rejects junk from storage instead of adopting it', () => {
    const merged = mergeSettings({ provider: 'chatgpt' as never, maxTokens: 999999 as never })
    expect(merged.provider).toBe('auto')
    expect(merged.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens)
  })

  it('loads without a window or a localStorage present', () => {
    expect(() => loadSettings()).not.toThrow()
  })
})
