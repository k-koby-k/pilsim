/**
 * The provider seam.
 *
 * The product must not be married to one vendor. Which model answers is a
 * configuration value the team can change on the morning of the demo — if
 * Workers AI is throttling, Gemini takes over without a code change and without
 * a rebuild. Everything above this interface (context, prompt, validation,
 * panel) is provider-agnostic; everything below it is transport.
 */

import type { AiFailure, ChatMessage } from '../types'

export type ProviderId = 'worker' | 'gemini-direct'

/** What the Worker should ask for on our behalf. Ignored by direct providers. */
export type UpstreamId = 'workers-ai' | 'gemini'

export interface AiSettings {
  /** `auto` picks the first configured provider in registry order. */
  provider: ProviderId | 'auto'
  /** Full URL of the deployed proxy Worker. */
  workerEndpoint: string
  /** Which model family the Worker should call. */
  workerUpstream: UpstreamId
  /** Browser-held Gemini key. See the warning on the direct provider. */
  geminiApiKey: string
  geminiModel: string
  maxTokens: number
}

export interface StreamRequest {
  messages: ChatMessage[]
  settings: AiSettings
  onDelta: (delta: string) => void
  signal?: AbortSignal
}

export type StreamResult = { ok: true; text: string } | { ok: false; failure: AiFailure }

export interface AiProvider {
  id: ProviderId
  label: string
  /** One sentence for the settings panel, including any honest caveat. */
  blurb: string
  /** Is there enough configuration to try? */
  configured(s: AiSettings): boolean
  /** What is missing, when it is not configured. */
  missing(s: AiSettings): string
  stream(req: StreamRequest): Promise<StreamResult>
}

/** Map a transport error onto the failure vocabulary the panel renders. */
export function classify(err: unknown): AiFailure {
  if (err instanceof DOMException && err.name === 'AbortError')
    return { kind: 'aborted', message: 'Cancelled.' }
  const message = err instanceof Error ? err.message : String(err)
  if (/abort/i.test(message)) return { kind: 'aborted', message: 'Cancelled.' }
  return {
    kind: 'network',
    message,
    remedy: 'The request never reached the model. Check the endpoint and that you are online.',
  }
}

export function fromStatus(status: number, body: string): AiFailure {
  if (status === 429)
    return {
      kind: 'rate-limit',
      status,
      message: body || 'Rate limited.',
      remedy: 'The free allocation is throttling. Wait a moment, or switch provider in AI settings.',
    }
  if (status === 401 || status === 403)
    return {
      kind: 'server',
      status,
      message: body || 'Rejected.',
      remedy: 'The key was rejected. Check it in AI settings.',
    }
  return {
    kind: 'server',
    status,
    message: body || `Upstream returned ${status}.`,
    remedy: 'The provider answered with an error. The rest of the product is unaffected.',
  }
}
