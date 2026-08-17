/**
 * PilSim AI proxy — a thin edge relay, not an application.
 *
 * It receives an already-constructed chat payload, forwards it to one of two
 * providers, and streams the reply back as `data: {"response": "..."}` SSE
 * lines terminated by `data: [DONE]`. It holds no prompt, no pharmacology and
 * no state: prompt construction and the number-validation boundary live in
 * `src/ai/`, in the browser, where they are unit-tested.
 *
 * Two providers behind one wire format, chosen per request so the team can
 * switch on the morning of the demo without a redeploy of the app:
 *   - `workers-ai` — the `AI` binding (Cloudflare Workers AI, free allocation).
 *   - `gemini`     — Google Generative Language, keyed by a SERVER-SIDE secret.
 *
 * Routing Gemini through here is the point: the key stays in the Worker
 * instead of in a browser bundle.
 */

export interface Env {
  AI: { run: (model: string, body: unknown) => Promise<ReadableStream> }
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  WORKERS_AI_MODEL?: string
  /** Comma-separated allowlist. Unset = reflect any origin (local dev). */
  ALLOWED_ORIGINS?: string
}

const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
/** A structured PilSim context is a few KB. Anything larger is not our payload. */
const MAX_BYTES = 96 * 1024
const MAX_OUTPUT_TOKENS = 900

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

function cors(env: Env, origin: string | null): Record<string, string> {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const allow = list.length === 0 ? (origin ?? '*') : list.includes(origin ?? '') ? origin! : list[0]
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

function fail(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  })
}

const SSE_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }

/** Re-emit an upstream SSE body as our own `{"response": "..."}` frames. */
function transcode(upstream: ReadableStream, pick: (json: unknown) => string): ReadableStream {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let buf = ''
  return upstream.pipeThrough(
    new TransformStream({
      transform(chunk, ctrl) {
        buf += dec.decode(chunk, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() ?? ''
        for (const line of parts) {
          const raw = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!raw || raw === '[DONE]') continue
          try {
            const text = pick(JSON.parse(raw))
            if (text) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ response: text })}\n\n`))
          } catch {
            /* a partial or non-JSON frame is skipped, never guessed at */
          }
        }
      },
      flush(ctrl) {
        ctrl.enqueue(enc.encode('data: [DONE]\n\n'))
      },
    }),
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const head = cors(env, request.headers.get('origin'))
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head })
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          providers: { 'workers-ai': true, gemini: !!env.GEMINI_API_KEY },
          models: {
            'workers-ai': env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
            gemini: env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
          },
        }),
        { headers: { ...head, 'content-type': 'application/json' } },
      )
    }
    if (request.method !== 'POST') return fail(405, 'POST a chat payload.', head)

    const body = await request.text()
    if (body.length > MAX_BYTES) return fail(413, `Payload over ${MAX_BYTES} bytes.`, head)

    let payload: { provider?: string; messages?: Msg[]; maxTokens?: number; temperature?: number }
    try {
      payload = JSON.parse(body)
    } catch {
      return fail(400, 'Body is not JSON.', head)
    }
    const messages = (payload.messages ?? []).filter(
      (m) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role),
    )
    if (!messages.length || messages.length > 12) return fail(400, 'messages must be 1..12 chat turns.', head)

    const maxTokens = Math.min(Math.max(Number(payload.maxTokens) || MAX_OUTPUT_TOKENS, 64), MAX_OUTPUT_TOKENS)
    const temperature = Math.min(Math.max(Number(payload.temperature ?? 0.2), 0), 1)
    const provider = payload.provider === 'gemini' ? 'gemini' : 'workers-ai'

    try {
      if (provider === 'gemini') {
        if (!env.GEMINI_API_KEY) return fail(503, 'This Worker has no GEMINI_API_KEY configured.', head)
        const model = env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
        const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
        const turns = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: JSON.stringify({
              contents: turns,
              ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
              generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
          },
        )
        if (!res.ok || !res.body) return fail(res.status === 429 ? 429 : 502, `Gemini: ${await res.text()}`, head)
        const pick = (j: unknown) =>
          (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('') ?? ''
        return new Response(transcode(res.body, pick), { headers: { ...head, ...SSE_HEADERS } })
      }

      const stream = await env.AI.run(env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL, {
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
      })
      return new Response(stream, { headers: { ...head, ...SSE_HEADERS } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const rate = /rate limit|429|capacity|quota/i.test(message)
      return fail(rate ? 429 : 502, message, head)
    }
  },
}
