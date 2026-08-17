/**
 * The chat assistant. One floating button, one panel that can be closed.
 *
 * THE CONSTRAINT THAT SHAPED THIS FILE: it must not cover the page. So the
 * panel does not float over anything. On a wide viewport it DOCKS — fixed to
 * the right edge, with the app narrowed by exactly its width so the two boxes
 * never intersect. On a viewport with no column to spare it becomes a full,
 * opaque sheet: a deliberate second screen, not a translucent flap. There is no
 * scrim and no blur in this component or its stylesheet, because nothing on
 * this page is ever worth hiding behind one. See dock.ts for the arithmetic and
 * chat.css for the three shell selectors that carry out the reflow.
 *
 * THE OTHER CONSTRAINT: a chat box invites questions the dataset cannot answer,
 * which makes it the likeliest place in the product to hallucinate. Nothing
 * here talks to a model directly. Every question goes through `askChat`, which
 * is the same prompt-and-validate path the reasoning panel uses, and every
 * number in every reply is marked in place against the set of numbers the app
 * actually supplied. What this file renders is the verdict, never a bare number
 * from a model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { askChat, type ChatTurn } from '../../ai/chat'
import { groundedIn, type ChatContext, type ChatPage } from '../../ai/chatContext'
import type { Segment } from '../../ai/numbers'
import { activeModelLabel, activeProvider, loadSettings, type AiSettings } from '../../ai/providers'
import type { AiFailure } from '../../ai/types'
import { useT, type DictKey } from '../../i18n'
import { dockGeometry, type ChatMode } from './dock'
import './chat.css'

/** The i18n barrel exports the hook, not its return type; name it here. */
type TFunction = ReturnType<typeof useT>

// ---------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------

export interface ChatAssistantProps {
  /**
   * What the user is currently looking at. The assistant answers against this
   * and nothing else — see src/ai/chatContext.ts for the shape and for what
   * each field turns into in the prompt.
   */
  context: ChatContext
  /** Open the panel on mount. Off by default. */
  defaultOpen?: boolean
  /**
   * Override the AI settings. Omit and they are read exactly the way the
   * reasoning panel reads them (env, then window, then the settings the user
   * saved), refreshed each time the panel opens.
   */
  settings?: AiSettings
}

// ---------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------

const FAILURE_TITLE_KEY: Record<AiFailure['kind'], DictKey> = {
  'no-provider': 'sim.ai.failureTitleNoProvider',
  network: 'sim.ai.failureTitleNetwork',
  'rate-limit': 'sim.ai.failureTitleRateLimit',
  server: 'sim.ai.failureTitleServer',
  malformed: 'sim.ai.failureTitleMalformed',
  aborted: 'sim.ai.failureTitleAborted',
  timeout: 'sim.ai.failureTitleTimeout',
}

const GROUNDED_KEY: Record<string, DictKey> = {
  substance: 'chat.grounded.substance',
  patient: 'chat.grounded.patient',
  regimen: 'chat.grounded.regimen',
  run: 'chat.grounded.run',
  rules: 'chat.grounded.rules',
}

const STARTERS: Record<ChatPage, DictKey[]> = {
  home: ['chat.starter.home.a', 'chat.starter.home.b'],
  substances: ['chat.starter.substances.a', 'chat.starter.substances.b'],
  pills: ['chat.starter.pills.a', 'chat.starter.pills.b'],
  subject: ['chat.starter.subject.a', 'chat.starter.subject.b'],
  simulation: ['chat.starter.simulation.a', 'chat.starter.simulation.b'],
}

/** A number the model wrote, marked with whether the app actually supplied it. */
function NumberMark({ seg, t }: { seg: Segment; t: TFunction }) {
  if (seg.status === 'unsupported') {
    return (
      <span className="chatdock-num is-unsupported">
        <span className="chatdock-num-text">{seg.text}</span>
        <span className="chatdock-num-flag" aria-hidden="true">
          {t('chat.numberFlag')}
        </span>
        <span className="chatdock-sr">{t('chat.numberFlagSr')}</span>
      </span>
    )
  }
  if (seg.status === 'pending') return <span className="chatdock-num is-pending">{seg.text}</span>
  const trace = seg.fact
    ? `${seg.fact.label}${seg.fact.source ? ` — ${seg.fact.source}` : ''}`
    : t('chat.numberTrace')
  return (
    <span className="chatdock-num is-supported" title={trace}>
      {seg.text}
    </span>
  )
}

/** Paragraph breaks are preserved. Nothing else in the model's text is interpreted. */
function Prose({ segments, t }: { segments: Segment[]; t: TFunction }) {
  const paragraphs: Segment[][] = [[]]
  for (const seg of segments) {
    if (seg.kind === 'text' && seg.text.includes('\n\n')) {
      const parts = seg.text.split(/\n{2,}/)
      paragraphs[paragraphs.length - 1].push({ ...seg, text: parts[0] })
      for (const p of parts.slice(1)) paragraphs.push([{ kind: 'text', text: p }])
      continue
    }
    paragraphs[paragraphs.length - 1].push(seg)
  }
  return (
    <>
      {paragraphs
        .filter((p) => p.some((s) => s.text.trim()))
        .map((p, i) => (
          <p key={i}>
            {p.map((seg, j) =>
              seg.kind === 'number' ? (
                <NumberMark key={j} seg={seg} t={t} />
              ) : (
                <span key={j}>{seg.text}</span>
              ),
            )}
          </p>
        ))}
    </>
  )
}

function Failure({ failure, t }: { failure: AiFailure; t: TFunction }) {
  return (
    <div className={`chatdock-failure${failure.kind === 'aborted' ? ' is-quiet' : ''}`} role="status">
      <strong>{t(FAILURE_TITLE_KEY[failure.kind])}.</strong> {failure.remedy ?? failure.message}
      {failure.remedy && failure.message !== failure.remedy && (
        <span className="chatdock-failure-detail">{failure.message}</span>
      )}
    </div>
  )
}

function AssistantTurn({ turn, t }: { turn: ChatTurn; t: TFunction }) {
  const v = turn.validation
  const hasText = !!turn.segments?.length
  return (
    <div className="chatdock-msg chatdock-msg--ai">
      <div className="chatdock-msg-who">{t('chat.assistant')}</div>
      {turn.failure && <Failure failure={turn.failure} t={t} />}
      {(hasText || turn.streaming) && (
        <div className="chatdock-bubble">
          <span className="chatdock-generated" aria-hidden="true">
            {t('chat.generatedMark')}
          </span>
          <Prose segments={turn.segments ?? []} t={t} />
          {turn.streaming && !hasText && <p className="chatdock-waiting">{t('chat.waiting')}</p>}
          {turn.streaming && <span className="chatdock-caret" aria-hidden="true" />}
          {!turn.streaming && v && (
            <div className={`chatdock-verdict${v.clean ? '' : ' is-dirty'}`}>
              {v.total === 0
                ? t('chat.verdictNone')
                : v.clean
                  ? t('chat.verdictClean', { n: v.total, facts: turn.factCount ?? 0 })
                  : t('chat.verdictDirty', {
                      unsupported: v.unsupported,
                      total: v.total,
                      ids: v.offenders.join(', '),
                    })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// viewport
// ---------------------------------------------------------------------------

/** 1440 is only the server-render guess; the effect corrects it on mount. */
function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}

let seq = 0
const nextId = () => `chat-${++seq}`

// ---------------------------------------------------------------------------
// the component
// ---------------------------------------------------------------------------

export function ChatAssistant({ context, defaultOpen = false, settings: override }: ChatAssistantProps) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [stored, setStored] = useState<AiSettings>(() => loadSettings())

  const viewport = useViewportWidth()
  const geometry = useMemo(() => dockGeometry(viewport), [viewport])
  const mode: ChatMode = geometry.mode

  const settings = override ?? stored
  const configured = !!activeProvider(settings)
  const modelLabel = useMemo(() => activeModelLabel(settings), [settings])

  // Refs so the async send never closes over a stale screen or stale settings:
  // the user may navigate or change a selection while a reply is streaming.
  // Written in an effect rather than during render, so a double render under
  // StrictMode cannot be observed as a side effect.
  const contextRef = useRef(context)
  const settingsRef = useRef(settings)
  const turnsRef = useRef(turns)
  useEffect(() => {
    contextRef.current = context
    settingsRef.current = settings
    turnsRef.current = turns
  })

  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Pick up whatever the AI settings panel saved, each time the panel opens.
  useEffect(() => {
    if (open && !override) setStored(loadSettings())
  }, [open, override])

  // THE REFLOW. Docked, the app is narrowed by exactly the panel's width, so
  // the panel sits beside the page rather than on top of it. A sheet reserves
  // nothing, because it covers the viewport outright and by intention.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const body = document.body
    const docked = open && mode === 'dock'
    if (docked) {
      document.documentElement.style.setProperty('--pilsim-chat-w', `${geometry.width}px`)
      body.classList.add('pilsim-chat-docked')
      body.classList.toggle('pilsim-chat-stack-rail', geometry.stackRail)
    } else {
      body.classList.remove('pilsim-chat-docked', 'pilsim-chat-stack-rail')
    }
    return () => {
      body.classList.remove('pilsim-chat-docked', 'pilsim-chat-stack-rail')
    }
  }, [open, mode, geometry.width, geometry.stackRail])

  // Escape closes, wherever focus is.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  // Cancel any stream still running when the panel is unmounted.
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q || abortRef.current) return
      const history = turnsRef.current
      const userId = nextId()
      const aiId = nextId()
      setTurns((prev) => [
        ...prev,
        { id: userId, role: 'user', text: q },
        { id: aiId, role: 'assistant', text: '', streaming: true },
      ])
      setDraft('')
      setBusy(true)

      const controller = new AbortController()
      abortRef.current = controller

      void askChat(q, {
        context: contextRef.current,
        history,
        settings: settingsRef.current,
        signal: controller.signal,
        onUpdate: (patch) =>
          setTurns((prev) =>
            prev.map((turn) =>
              turn.id === aiId ? { ...turn, ...patch, id: aiId, role: 'assistant' } : turn,
            ),
          ),
      }).finally(() => {
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
      })
    },
    [],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setTurns([])
  }, [])

  const grounded = useMemo(() => groundedIn(context), [context])

  if (!open) {
    return (
      <button
        type="button"
        className="chatdock-fab"
        onClick={() => setOpen(true)}
        aria-label={t('chat.openAria')}
      >
        <span className="chatdock-fab-mark" aria-hidden="true">
          AI
        </span>
        <span className="chatdock-fab-label">{t('chat.open')}</span>
      </button>
    )
  }

  return (
    <aside
      className={`chatdock chatdock--${mode}`}
      role="dialog"
      aria-modal="false"
      aria-label={t('chat.panelAria')}
    >
      <header className="chatdock-head">
        <div className="chatdock-head-text">
          <h2>{t('chat.title')}</h2>
          <p className="chatdock-sub">{t('chat.sub')}</p>
        </div>
        <button
          type="button"
          className="chatdock-close"
          onClick={() => setOpen(false)}
          aria-label={t('chat.closeAria')}
        >
          ×
        </button>
      </header>

      <div className="chatdock-meta">
        <div className="chatdock-meta-inner">
          <span className={`chatdock-dot${configured ? ' is-live' : ''}`} aria-hidden="true" />{' '}
          {configured ? modelLabel : t('chat.notConfigured')}
          <span className="chatdock-meta-sep"> · </span>
          {t('chat.groundedIn')}{' '}
          <span className="chatdock-grounded">
            {grounded.length
              ? grounded.map((g) => t(GROUNDED_KEY[g])).join(', ')
              : t('chat.grounded.pageOnly')}
          </span>
        </div>
      </div>

      <div className="chatdock-log" ref={logRef}>
        {/* Stays up for as long as it is true, not only on the empty state: a
            failed send must not be the only remaining explanation of why. */}
        {!configured && (
          <div className="chatdock-notice">
            <strong>{t('chat.noProviderTitle')}</strong>
            {t('chat.noProviderBody')}
          </div>
        )}

        {!turns.length && (
          <div className="chatdock-intro">
            <p>{t('chat.introLead')}</p>
            <p>
              <strong>{t('chat.introBoundaryLead')}</strong> {t('chat.introBoundary')}
            </p>
            <div className="chatdock-starters">
              {(STARTERS[context.page] ?? STARTERS.home).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="chatdock-starter"
                  onClick={() => send(t(key))}
                  disabled={busy}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="chatdock-msg chatdock-msg--user">
              <div className="chatdock-msg-who">{t('chat.you')}</div>
              <div className="chatdock-bubble">{turn.text}</div>
            </div>
          ) : (
            <AssistantTurn key={turn.id} turn={turn} t={t} />
          ),
        )}
      </div>

      <div className="chatdock-composer">
        <div className="chatdock-composer-inner">
          <div className="chatdock-composer-row">
            <textarea
              ref={inputRef}
              className="chatdock-input"
              rows={2}
              value={draft}
              placeholder={t('chat.placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            {busy ? (
              <button type="button" className="chatdock-stop" onClick={stop}>
                {t('chat.stop')}
              </button>
            ) : (
              <button
                type="button"
                className="chatdock-send"
                onClick={() => send(draft)}
                disabled={!draft.trim()}
              >
                {t('chat.send')}
              </button>
            )}
          </div>
          <div className="chatdock-foot">
            <p className="chatdock-disclaimer">{t('chat.disclaimer')}</p>
            {!!turns.length && (
              <button type="button" className="chatdock-clear" onClick={clear}>
                {t('chat.clear')}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
