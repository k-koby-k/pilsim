/**
 * Google Gemini, called straight from the browser with a user-supplied key.
 *
 * HONEST WARNING, repeated in the settings UI rather than buried here: a key
 * held in the browser is readable by anyone who opens devtools or reads the
 * network tab. That is acceptable for a hackathon demo running on the team's
 * own machine with a throwaway key, and it is not acceptable for anything real.
 * The Worker provider is the same model with the key server-side; prefer it
 * whenever the Worker is deployed.
 *
 * This path exists because it needs no deploy at all: paste a key, get a live
 * model. That is worth having on the morning of a demo.
 */

import { consumeSse } from '../sse'
import { classify, fromStatus, type AiProvider, type StreamResult } from './types'

const TIMEOUT_MS = 45_000
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiDirectProvider: AiProvider = {
  id: 'gemini-direct',
  label: 'Gemini (key in this browser)',
  blurb:
    'Calls Google directly from this page with a key you paste. Needs no deployment — but the key is ' +
    'visible to anyone with devtools open, so use a throwaway key and never ship this arrangement.',

  configured: (s) => s.geminiApiKey.trim().length > 10,
  missing: () => 'No Gemini API key pasted.',

  async stream({ messages, settings, onDelta, signal }): Promise<StreamResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const onOuterAbort = () => controller.abort()
    signal?.addEventListener('abort', onOuterAbort)

    const model = settings.geminiModel.trim() || 'gemini-2.5-flash'
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.geminiApiKey.trim() },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { temperature: 0.2, maxOutputTokens: settings.maxTokens },
        }),
        signal: controller.signal,
      })
      if (!res.ok) return { ok: false, failure: fromStatus(res.status, (await res.text()).slice(0, 400)) }
      if (!res.body)
        return { ok: false, failure: { kind: 'malformed', message: 'Gemini replied without a body.' } }
      const text = await consumeSse(res.body, onDelta)
      if (!text.trim())
        return {
          ok: false,
          failure: {
            kind: 'malformed',
            message: 'The stream carried no text.',
            remedy: 'Gemini returned nothing — often a safety filter or an exhausted quota.',
          },
        }
      return { ok: true, text }
    } catch (err) {
      if (!signal?.aborted && controller.signal.aborted)
        return { ok: false, failure: { kind: 'timeout', message: `No reply within ${TIMEOUT_MS / 1000} s.` } }
      return { ok: false, failure: classify(err) }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  },
}
