/**
 * Streaming AI state for the simulation view.
 *
 * Deltas arrive faster than a browser needs to repaint, and each one re-runs the
 * number check over the whole reply, so updates are coalesced onto a frame the
 * same way `useSimRunner` coalesces engine frames. The text still appears to
 * type itself — which is the point of streaming here — without React
 * re-rendering the panel three hundred times.
 *
 * Settings live here too, because switching provider mid-demo has to take
 * effect on the next question without a reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_RUN, runReasoning, type AiRunState } from '../../ai/client'
import {
  DEFAULT_SETTINGS,
  activeModelLabel,
  activeProvider,
  loadSettings,
  saveSettings,
  type AiSettings,
} from '../../ai/providers'
import type { AiContext } from '../../ai/types'

export interface AiReasoningApi {
  state: AiRunState
  settings: AiSettings
  /** Null when nothing is configured — an ordinary state, not an error. */
  providerId: string | null
  modelLabel: string
  configured: boolean
  running: boolean
  updateSettings: (patch: Partial<AiSettings>) => void
  ask: (build: () => AiContext | Promise<AiContext>) => Promise<void>
  cancel: () => void
  reset: () => void
}

export function useAiReasoning(): AiReasoningApi {
  const [settings, setSettings] = useState<AiSettings>(() => DEFAULT_SETTINGS)
  const [state, setState] = useState<AiRunState>(EMPTY_RUN)
  const pending = useRef<AiRunState | null>(null)
  const raf = useRef<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const settingsRef = useRef(settings)

  // Read persisted settings after mount rather than during render: localStorage
  // does not exist during a server or test render, and this view must not
  // depend on it existing.
  useEffect(() => {
    const loaded = loadSettings()
    settingsRef.current = loaded
    setSettings(loaded)
  }, [])

  useEffect(
    () => () => {
      abort.current?.abort()
      if (raf.current != null) cancelAnimationFrame(raf.current)
    },
    [],
  )

  const flush = useCallback(() => {
    raf.current = null
    if (pending.current) {
      setState(pending.current)
      pending.current = null
    }
  }, [])

  const schedule = useCallback(
    (next: AiRunState) => {
      pending.current = next
      // A terminal state is never left waiting on a frame that may not come.
      if (next.status !== 'streaming') {
        if (raf.current != null) cancelAnimationFrame(raf.current)
        flush()
        return
      }
      if (raf.current == null && typeof requestAnimationFrame === 'function') {
        raf.current = requestAnimationFrame(flush)
      } else if (typeof requestAnimationFrame !== 'function') {
        flush()
      }
    },
    [flush],
  )

  const updateSettings = useCallback((patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      settingsRef.current = next
      saveSettings(next)
      return next
    })
  }, [])

  const cancel = useCallback(() => {
    abort.current?.abort()
    abort.current = null
  }, [])

  const reset = useCallback(() => {
    cancel()
    pending.current = null
    setState(EMPTY_RUN)
  }, [cancel])

  const ask = useCallback(
    async (build: () => AiContext | Promise<AiContext>) => {
      cancel()
      const controller = new AbortController()
      abort.current = controller
      setState({ ...EMPTY_RUN, status: 'streaming' })
      let ctx: AiContext
      try {
        ctx = await build()
      } catch (err) {
        setState({
          ...EMPTY_RUN,
          status: 'error',
          failure: {
            kind: 'malformed',
            message: `The context could not be assembled: ${err instanceof Error ? err.message : String(err)}`,
            remedy: 'Run a simulation first, then ask again.',
          },
        })
        return
      }
      await runReasoning(ctx, {
        settings: settingsRef.current,
        signal: controller.signal,
        onUpdate: schedule,
      })
      if (abort.current === controller) abort.current = null
    },
    [cancel, schedule],
  )

  const provider = activeProvider(settings)
  return {
    state,
    settings,
    providerId: provider?.id ?? null,
    modelLabel: activeModelLabel(settings),
    configured: !!provider,
    running: state.status === 'streaming',
    updateSettings,
    ask,
    cancel,
    reset,
  }
}
