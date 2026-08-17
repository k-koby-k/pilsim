/**
 * Provider registry and runtime settings.
 *
 * Settings resolve in three layers, weakest first: build-time environment,
 * then anything a host page published on `window`, then whatever the user
 * typed into the AI settings panel (persisted in localStorage). The last layer
 * is what lets the team switch provider mid-demo without a rebuild.
 *
 * NONE configured is a first-class state, not an error path. The product is
 * fully usable with the AI switched off, so `activeProvider` returning null is
 * ordinary and the panel says so plainly.
 */

import type { AiFailure } from '../types'
import { geminiDirectProvider } from './gemini'
import { workerProvider } from './worker'
import type { AiProvider, AiSettings, ProviderId, StreamRequest, StreamResult, UpstreamId } from './types'

export type { AiProvider, AiSettings, ProviderId, StreamRequest, StreamResult, UpstreamId }

/** Order matters: `auto` takes the first configured entry. The Worker is preferred. */
export const PROVIDERS: AiProvider[] = [workerProvider, geminiDirectProvider]

export const STORAGE_KEY = 'pilsim.ai.settings'

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'auto',
  workerEndpoint: '',
  workerUpstream: 'workers-ai',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  maxTokens: 900,
}

function env(key: string): string {
  try {
    const bag = (import.meta as { env?: Record<string, string | undefined> }).env
    return bag?.[key] ?? ''
  } catch {
    return ''
  }
}

function fromWindow(): Partial<AiSettings> {
  if (typeof window === 'undefined') return {}
  const w = window as Window & { __pilsim_ai__?: Partial<AiSettings> }
  return w.__pilsim_ai__ && typeof w.__pilsim_ai__ === 'object' ? w.__pilsim_ai__ : {}
}

function fromStorage(): Partial<AiSettings> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<AiSettings>) : {}
  } catch {
    return {}
  }
}

/** Merge the layers, discarding anything of the wrong type. */
export function mergeSettings(...layers: Partial<AiSettings>[]): AiSettings {
  const out: AiSettings = { ...DEFAULT_SETTINGS }
  for (const layer of layers) {
    if (!layer) continue
    if (layer.provider === 'auto' || layer.provider === 'worker' || layer.provider === 'gemini-direct')
      out.provider = layer.provider
    if (typeof layer.workerEndpoint === 'string') out.workerEndpoint = layer.workerEndpoint
    if (layer.workerUpstream === 'workers-ai' || layer.workerUpstream === 'gemini')
      out.workerUpstream = layer.workerUpstream
    if (typeof layer.geminiApiKey === 'string') out.geminiApiKey = layer.geminiApiKey
    if (typeof layer.geminiModel === 'string' && layer.geminiModel.trim()) out.geminiModel = layer.geminiModel
    if (typeof layer.maxTokens === 'number' && layer.maxTokens >= 128 && layer.maxTokens <= 4096)
      out.maxTokens = Math.round(layer.maxTokens)
  }
  return out
}

export function envSettings(): Partial<AiSettings> {
  const upstream = env('VITE_AI_WORKER_UPSTREAM')
  return {
    workerEndpoint: env('VITE_AI_WORKER_ENDPOINT') || undefined,
    workerUpstream: upstream === 'gemini' || upstream === 'workers-ai' ? upstream : undefined,
    geminiApiKey: env('VITE_GEMINI_API_KEY') || undefined,
    geminiModel: env('VITE_GEMINI_MODEL') || undefined,
  } as Partial<AiSettings>
}

export function loadSettings(): AiSettings {
  return mergeSettings(envSettings(), fromWindow(), fromStorage())
}

export function saveSettings(s: AiSettings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* private-mode browsers refuse; the settings still apply for this session */
  }
}

export function providerById(id: ProviderId): AiProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

/** The provider that will actually answer, or null when nothing is configured. */
export function activeProvider(s: AiSettings): AiProvider | null {
  if (s.provider === 'auto') return PROVIDERS.find((p) => p.configured(s)) ?? null
  const chosen = providerById(s.provider)
  return chosen && chosen.configured(s) ? chosen : null
}

/** Human sentence naming the model that will answer, for the panel header. */
export function activeModelLabel(s: AiSettings): string {
  const p = activeProvider(s)
  if (!p) return 'no provider configured'
  if (p.id === 'worker')
    return s.workerUpstream === 'gemini'
      ? 'Gemini, via the PilSim Worker'
      : 'Workers AI, via the PilSim Worker'
  return `${s.geminiModel || 'gemini'}, called directly from this browser`
}

export const NO_PROVIDER: AiFailure = {
  kind: 'no-provider',
  message: 'No AI provider is configured.',
  remedy:
    'Open AI settings and paste either the deployed Worker URL or a Gemini key. Everything else on ' +
    'this page works without one.',
}

/** Single entry point the client uses; keeps provider choice out of the caller. */
export async function streamWithActiveProvider(req: StreamRequest): Promise<StreamResult> {
  const provider = activeProvider(req.settings)
  if (!provider) return { ok: false, failure: NO_PROVIDER }
  return provider.stream(req)
}
