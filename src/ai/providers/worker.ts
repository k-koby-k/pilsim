/**
 * The Cloudflare Worker proxy provider.
 *
 * This is the arrangement to prefer for anything beyond a laptop demo: the
 * browser sends a structured payload to our own Worker, the Worker holds the
 * credentials, and the Worker decides whether Workers AI or Gemini answers.
 * The page never sees a key.
 */

import { consumeSse } from '../sse'
import { classify, fromStatus, type AiProvider, type StreamResult } from './types'

const TIMEOUT_MS = 45_000

export const workerProvider: AiProvider = {
  id: 'worker',
  label: 'Cloudflare Worker proxy',
  blurb:
    'Calls a Worker we deploy, which holds the credentials server-side and forwards to Workers AI or ' +
    'Gemini. No key is present in the browser.',

  configured: (s) => /^https?:\/\//i.test(s.workerEndpoint.trim()),
  missing: () => 'No Worker endpoint set. Deploy worker/ and paste its https URL.',

  async stream({ messages, settings, onDelta, signal }): Promise<StreamResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const onOuterAbort = () => controller.abort()
    signal?.addEventListener('abort', onOuterAbort)
    try {
      const res = await fetch(settings.workerEndpoint.trim(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: settings.workerUpstream,
          messages,
          maxTokens: settings.maxTokens,
        }),
        signal: controller.signal,
      })
      if (!res.ok) return { ok: false, failure: fromStatus(res.status, (await res.text()).slice(0, 400)) }
      if (!res.body)
        return {
          ok: false,
          failure: {
            kind: 'malformed',
            message: 'The Worker replied without a body.',
            remedy: 'Check `wrangler tail` — the Worker returned a response the browser cannot stream.',
          },
        }
      const text = await consumeSse(res.body, onDelta)
      if (!text.trim())
        return {
          ok: false,
          failure: {
            kind: 'malformed',
            message: 'The stream carried no text.',
            remedy: 'The model produced nothing. Try again, or switch provider in AI settings.',
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
