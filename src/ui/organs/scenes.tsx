/**
 * SCENES — one body, several lenses, one camera.
 *
 * WHAT THIS IS. A scene is a place to stand while a simulation runs. Every scene draws the
 * SAME body from the SAME EffectFrame; what changes is where the camera is and which
 * diagram is open beside it. Moving from the overview to the kidney is a camera push, not a
 * cut to a different picture, because the thing being explained is one patient and a viewer
 * who loses their bearings between shots learns nothing.
 *
 * WHAT THIS IS NOT. A scene is never a different simulation, a different time point, or a
 * smoothed version of the run. Whatever is on screen is literally true of the frame that
 * was last handed in. When the engine did not model a field, the scene says "not modelled"
 * rather than drawing a zero, because zero is a physiological claim and null is not.
 *
 * THE CAMERA. The whole figure lives in one world: the body occupies 0..600 x 0..720 — the
 * coordinates BodyFigure has always drawn in — and each scene's detail plate is laid out to
 * the right of it. A scene declares the region of the body it is about and the plate that
 * goes with it; the camera rect is the union of the two, padded, and fitted into a sane
 * aspect. Changing scene interpolates that rect. The interpolation carries a small pull-back
 * — the frame widens slightly at the midpoint, proportional to how far the camera travels —
 * which is what a real camera operator does and what stops a long move feeling like a slide.
 *
 * REDUCED MOTION. Under prefers-reduced-motion the camera cuts instead of moving and the
 * plates swap instead of crossing. Every scene still works; it simply does not animate
 * between states, which is the point of the setting.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EffectFrame } from '../../types'
import './organs.css'
import './scenes.css'
import { useT, type DictKey, type TFunction } from '../../i18n/useT'
import { Annotations, BodyInterior, BODY_SIZE } from './BodyFigure'
import { useCoughEvents } from './Badges'
import {
  BADGES,
  baselineFrame,
  clamp,
  DRUGS,
  FALLBACK_REF,
  formatSignal,
  onBoard,
  sig,
  type RefRanges,
} from './channels'
import {
  HEART_PLATE,
  HeartPlate,
  JOURNEY_PLATE,
  JourneyPlate,
  JourneyRoute,
  KIDNEY_PLATE,
  KidneyPlate,
  LIMBS_PLATE,
  LimbsPlate,
  LIVER_PLATE,
  LiverPlate,
  LUNGS_PLATE,
  LungsPlate,
  RAAS_PLATE,
  RaasPlate,
  SAFETY_PLATE,
  SafetyMarks,
  SafetyPlate,
  VESSELS_PLATE,
  VesselsPlate,
  latchFor,
  type Rect,
  type SafetyGates,
} from './scenePlates'

// ---------------------------------------------------------------------------
// The published contract
// ---------------------------------------------------------------------------

export type SceneId = string

export interface SceneDef {
  id: SceneId
  /** Short, for a scene selector. */
  label: string
  /** One plain sentence: what you are about to watch. */
  blurb: string
  /** Substances that make this scene worth watching, for auto-suggestion. */
  relevantTo?: string[]
}

const ALL_ACTIVES = [
  'lisinopril',
  'losartan',
  'exp3174',
  'amlodipine',
  'hydrochlorothiazide',
  'metoprolol',
]

/**
 * The set, in the order a demo should walk them: open wide, teach the pharmacokinetics,
 * then go organ by organ down the body, then step back out to what it cost.
 */
export const SCENES: SceneDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    blurb: 'The whole body at once — every organ this regimen reaches, with its numbers in the margin.',
    relevantTo: ALL_ACTIVES,
  },
  {
    id: 'journey',
    label: 'Journey of a dose',
    blurb:
      'Follow the drug: swallowed, taken through the liver on the way in, out into the blood, and cleared.',
    relevantTo: ALL_ACTIVES,
  },
  {
    id: 'heart',
    label: 'Heart',
    blurb: 'Rate, force and output, and how much of the β1 receptor pool is currently occupied.',
    relevantTo: ['metoprolol', 'amlodipine'],
  },
  {
    id: 'vessels',
    label: 'Vessels',
    blurb:
      'A single resistance unit: the arteriole opens, the venule does not, and the pressure between them explains the ankles.',
    relevantTo: ['amlodipine', 'lisinopril', 'losartan', 'exp3174'],
  },
  {
    id: 'lungs',
    label: 'Lungs',
    blurb:
      'Two drugs reach the airway — one lets bradykinin build, one blocks β2 — and the one that does neither is shown doing neither.',
    relevantTo: ['lisinopril', 'metoprolol', 'losartan'],
  },
  {
    id: 'liver',
    label: 'Liver',
    blurb: 'Three CYP enzymes and one gate whose size is set by genotype, not by the dose.',
    relevantTo: ['losartan', 'metoprolol', 'amlodipine'],
  },
  {
    id: 'kidney',
    label: 'Kidney',
    blurb: 'Four drugs acting in four anatomically different nephron segments, all at the same time.',
    relevantTo: ['hydrochlorothiazide', 'lisinopril', 'losartan', 'exp3174', 'amlodipine'],
  },
  {
    id: 'raas',
    label: 'Counter-regulation',
    blurb: 'The loop that fights back: renin climbs while the blood pressure falls, and that is expected.',
    relevantTo: ['lisinopril', 'losartan', 'exp3174', 'hydrochlorothiazide'],
  },
  {
    id: 'limbs',
    label: 'Dependent limbs',
    blurb: 'Where gravity puts the fluid — and why a diuretic does not fix this particular swelling.',
    relevantTo: ['amlodipine'],
  },
  {
    id: 'safety',
    label: 'Safety',
    blurb: 'What fired, where on the body it shows, and the reported incidence behind each one.',
    relevantTo: ALL_ACTIVES,
  },
]

export const DEFAULT_SCENE: SceneId = 'overview'

export function sceneDef(id: SceneId): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0]!
}

/**
 * `SCENES` is published as a plain, static array — `src/ui/simulation/scenes.ts` resolves
 * and caches it once at import time, and expects `{ id, label, blurb, relevantTo? }` with
 * plain strings, not a value that depends on a hook. So the canonical `SCENES` export stays
 * English, and this overlay is what UI inside this file renders instead: same ids and
 * `relevantTo`, `label`/`blurb` swapped for the current language via `organ.scene.<id>.*`.
 */
function localizedSceneDef(t: TFunction, def: SceneDef): SceneDef {
  return {
    ...def,
    label: t(`organ.scene.${def.id}.label` as DictKey),
    blurb: t(`organ.scene.${def.id}.blurb` as DictKey),
  }
}

function localizeScenes(t: TFunction, defs: SceneDef[]): SceneDef[] {
  return defs.map((d) => localizedSceneDef(t, d))
}

/** Scenes worth watching for a given substance list, always including the two openers. */
export function scenesFor(substanceIds: string[]): SceneDef[] {
  const ids = new Set(substanceIds)
  return SCENES.filter(
    (s) => !s.relevantTo || s.relevantTo.length === ALL_ACTIVES.length || s.relevantTo.some((d) => ids.has(d)),
  )
}

/** The single scene that teaches most about this particular regimen. */
export function suggestScene(substanceIds: string[]): SceneId {
  const ids = new Set(substanceIds)
  if (ids.has('hydrochlorothiazide')) return 'kidney'
  if (ids.has('metoprolol')) return 'liver'
  if (ids.has('amlodipine')) return 'limbs'
  if (ids.has('lisinopril')) return 'lungs'
  if (ids.has('losartan') || ids.has('exp3174')) return 'kidney'
  return DEFAULT_SCENE
}

// ---------------------------------------------------------------------------
// World geometry
// ---------------------------------------------------------------------------

/** Left edge of the plate column, in world units. The body ends at x = 600. */
const PLATE_X = 664

/** How much clear world space the camera keeps around what a scene is about. */
const CAMERA_PAD = 40

/**
 * The frame the camera is allowed to take. A rect far outside this band letterboxes badly
 * in a normal panel, so a scene whose subject is very wide or very tall is opened out about
 * its own centre until it fits. Presentation geometry only.
 */
const MIN_ASPECT = 0.78
const MAX_ASPECT = 1.95

export interface SceneGeom {
  /** The region of the BODY this scene is about, in the figure's own 600 x 720 space. */
  focus: Rect
  /** Where this scene's detail plate is drawn, in world space. */
  plate?: Rect
}

export const SCENE_GEOMETRY: Record<SceneId, SceneGeom> = {
  overview: { focus: { x: -34, y: -12, w: 668, h: 744 } },
  journey: {
    focus: { x: -6, y: 20, w: 612, h: 700 },
    plate: { x: PLATE_X, y: 44, ...JOURNEY_PLATE },
  },
  heart: {
    focus: { x: 248, y: 146, w: 124, h: 146 },
    plate: { x: PLATE_X, y: 74, ...HEART_PLATE },
  },
  vessels: {
    focus: { x: 236, y: 200, w: 132, h: 260 },
    plate: { x: PLATE_X, y: 150, ...VESSELS_PLATE },
  },
  lungs: {
    focus: { x: 226, y: 132, w: 148, h: 178 },
    plate: { x: PLATE_X, y: 40, ...LUNGS_PLATE },
  },
  liver: {
    focus: { x: 230, y: 236, w: 114, h: 78 },
    plate: { x: PLATE_X, y: 60, ...LIVER_PLATE },
  },
  kidney: {
    focus: { x: 238, y: 284, w: 124, h: 70 },
    plate: { x: PLATE_X, y: 40, ...KIDNEY_PLATE },
  },
  raas: {
    focus: { x: 236, y: 268, w: 124, h: 84 },
    plate: { x: PLATE_X, y: 180, ...RAAS_PLATE },
  },
  limbs: {
    focus: { x: 234, y: 498, w: 132, h: 214 },
    plate: { x: PLATE_X, y: 400, ...LIMBS_PLATE },
  },
  safety: {
    focus: { x: -20, y: 14, w: 640, h: 700 },
    plate: { x: PLATE_X, y: 30, ...SAFETY_PLATE },
  },
}

function union(a: Rect, b?: Rect): Rect {
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

function pad(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }
}

/** Open the rect out about its own centre until its aspect is inside the allowed band. */
function fitAspect(r: Rect, lo = MIN_ASPECT, hi = MAX_ASPECT): Rect {
  const a = r.w / r.h
  if (a > hi) {
    const h = r.w / hi
    return { x: r.x, y: r.y + (r.h - h) / 2, w: r.w, h }
  }
  if (a < lo) {
    const w = r.h * lo
    return { x: r.x + (r.w - w) / 2, y: r.y, w, h: r.h }
  }
  return r
}

/** The camera rect for a scene. Pure geometry — no frame, no state, no time. */
export function sceneCamera(id: SceneId): Rect {
  const g = SCENE_GEOMETRY[id] ?? SCENE_GEOMETRY[DEFAULT_SCENE]!
  return fitAspect(pad(union(g.focus, g.plate), CAMERA_PAD))
}

const viewBoxOf = (r: Rect): string =>
  `${r.x.toFixed(2)} ${r.y.toFixed(2)} ${Math.max(1, r.w).toFixed(2)} ${Math.max(1, r.h).toFixed(2)}`

// ---------------------------------------------------------------------------
// Camera motion
// ---------------------------------------------------------------------------

const TWEEN_MS = 640
const cx = (r: Rect) => r.x + r.w / 2
const cy = (r: Rect) => r.y + r.h / 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

interface CameraState {
  rect: Rect
  /** 0 at the start of a move, 1 when it has landed. */
  phase: number
  /** The scene being left, mounted only while the move is running. */
  outgoing: SceneId | null
}

/**
 * Interpolate the camera between two scenes. The width and height carry a hump whose size
 * is proportional to how far the centre has to travel, so a long move pulls back before it
 * pushes in and the viewer can see where they are going.
 */
function useCamera(target: Rect, sceneId: SceneId, reduced: boolean): CameraState {
  const [state, setState] = useState<CameraState>(() => ({ rect: target, phase: 1, outgoing: null }))
  const rectRef = useRef(target)
  const sceneRef = useRef(sceneId)
  const rafRef = useRef(0)

  useEffect(() => {
    if (sceneRef.current === sceneId) return
    const leaving = sceneRef.current
    sceneRef.current = sceneId
    const from = rectRef.current

    if (reduced) {
      rectRef.current = target
      setState({ rect: target, phase: 1, outgoing: null })
      return
    }

    const dist = Math.hypot(cx(target) - cx(from), cy(target) - cy(from))
    const bump = clamp(dist / (from.w + target.w), 0, 1) * 0.26
    const t0 = typeof performance === 'undefined' ? Date.now() : performance.now()

    const step = (now: number) => {
      const t = clamp((now - t0) / TWEEN_MS, 0, 1)
      const e = easeInOut(t)
      const k = 1 + bump * Math.sin(Math.PI * t)
      const w = lerp(from.w, target.w, e) * k
      const h = lerp(from.h, target.h, e) * k
      const centreX = lerp(cx(from), cx(target), e)
      const centreY = lerp(cy(from), cy(target), e)
      const rect = { x: centreX - w / 2, y: centreY - h / 2, w, h }
      rectRef.current = rect
      setState({ rect, phase: t, outgoing: t < 1 ? leaving : null })
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [sceneId, target, reduced])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  return state
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

const NO_HISTORY: EffectFrame[] = []

/**
 * The resting, untreated reference the figure holds when there is no run. Every number in it
 * is a resting-adult reference value and NOT simulation output, which is why the header says
 * so whenever it is in use. One definition of "untreated" in the product, in channels.ts.
 */
const RESTING: EffectFrame = baselineFrame()

const Body = memo(BodyInterior)
const BodyMargin = memo(Annotations)

/**
 * Everything a scene adds on top of the shared body: its marks on the figure and its plate.
 * Kept in one component so the camera can fade a whole scene in or out as one thing.
 */
const SceneLayer = memo(function SceneLayer({
  id,
  frame,
  history,
  fired,
  gates,
}: {
  id: SceneId
  frame: EffectFrame
  history: EffectFrame[]
  fired: typeof BADGES
  gates?: SafetyGates
}) {
  const g = SCENE_GEOMETRY[id] ?? SCENE_GEOMETRY[DEFAULT_SCENE]!
  const plate = g.plate

  return (
    <g className={`pil-scene-layer pil-scene-${id}`}>
      {/* --- what this scene adds to the body itself --- */}
      {id === 'journey' && <JourneyRoute frame={frame} />}
      {id === 'safety' && <SafetyMarks fired={fired} />}
      {id === 'overview' && <BodyMargin frame={frame} unsteady={(sig(frame.hazards?.dizziness_orthostatic) ?? 0) >= 0.35} />}

      {/* --- the focus treatment: everything outside the subject is held back --- */}
      {plate && <Vignette focus={g.focus} />}
      {plate && <Magnifier focus={g.focus} plate={plate} />}

      {/* --- the plate --- */}
      {plate && id === 'journey' && <JourneyPlate rect={plate} frame={frame} history={history} />}
      {plate && id === 'heart' && <HeartPlate rect={plate} frame={frame} history={history} />}
      {plate && id === 'vessels' && <VesselsPlate rect={plate} frame={frame} />}
      {plate && id === 'lungs' && <LungsPlate rect={plate} frame={frame} />}
      {plate && id === 'liver' && <LiverPlate rect={plate} frame={frame} />}
      {plate && id === 'kidney' && <KidneyPlate rect={plate} frame={frame} history={history} />}
      {plate && id === 'raas' && <RaasPlate rect={plate} frame={frame} />}
      {plate && id === 'limbs' && <LimbsPlate rect={plate} frame={frame} />}
      {plate && id === 'safety' && <SafetyPlate rect={plate} frame={frame} fired={fired} gates={gates} />}
    </g>
  )
})

/** The world beyond the camera's subject, in the sense of "out of focus" and nothing else. */
const WORLD = { x: -1200, y: -1200, w: 4200, h: 3400 }

function Vignette({ focus }: { focus: Rect }) {
  const r = pad(focus, 14)
  const outer = `M ${WORLD.x} ${WORLD.y} H ${WORLD.x + WORLD.w} V ${WORLD.y + WORLD.h} H ${WORLD.x} Z`
  const hole = `M ${r.x} ${r.y} H ${r.x + r.w} V ${r.y + r.h} H ${r.x} Z`
  return (
    <g className="pil-scene-vignette" aria-hidden="true">
      <path d={`${outer} ${hole}`} fillRule="evenodd" />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={12} className="pil-scene-focus-frame" />
    </g>
  )
}

/** The two guide lines an anatomical plate draws from an organ to its magnified detail. */
function Magnifier({ focus, plate }: { focus: Rect; plate: Rect }) {
  const f = pad(focus, 14)
  const p = pad(plate, 18)
  return (
    <g className="pil-scene-magnifier" aria-hidden="true">
      <path d={`M ${f.x + f.w} ${f.y} L ${p.x} ${p.y}`} />
      <path d={`M ${f.x + f.w} ${f.y + f.h} L ${p.x} ${p.y + p.h}`} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// The caption — a scene that does not say what to look at teaches nothing
// ---------------------------------------------------------------------------

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`)

/**
 * One line of plain clinical language about THIS frame, for THIS scene. Every number is
 * read straight off the bus and every uncalibrated one goes through formatSignal(), so the
 * sentence cannot say more than the engine does.
 */
export function sceneWatch(t: TFunction, id: SceneId, frame: EffectFrame | null, fired: typeof BADGES = []): string {
  if (!frame) return t('organ.scene.watch.noRun')
  const f = frame
  switch (id) {
    case 'journey': {
      const on = (Object.keys(DRUGS) as Array<keyof typeof DRUGS>).filter((d) => onBoard(f.conc?.[d], d))
      if (on.length === 0) return t('organ.scene.watch.journeyNone')
      const fp = sig(f.liver?.first_pass_extraction?.metoprolol)
      const lead = t('organ.scene.watch.journeyLead', { n: on.length })
      return fp !== null && onBoard(f.conc?.metoprolol, 'metoprolol')
        ? t('organ.scene.watch.journeyWithGate', { lead, pct: Math.round(fp * 100) })
        : t('organ.scene.watch.journeyNoGate', { lead })
    }
    case 'heart': {
      const hr = sig(f.haemo?.hr)
      const b1 = sig(f.engagement?.beta1_occupancy)
      return t('organ.scene.watch.heart', {
        hr: hr === null ? t('organ.heartPlate.notModelled') : `${Math.round(hr)} bpm`,
        b1: pct(b1),
      })
    }
    case 'vessels': {
      const art = sig(f.haemo?.arteriolar_radius_index)
      const ven = sig(f.haemo?.venous_tone_index)
      return t('organ.scene.watch.vessels', {
        inlet: formatSignal('haemo.arteriolar_radius_index', art, undefined, 2),
        outlet: formatSignal('haemo.venous_tone_index', ven, undefined, 2),
      })
    }
    case 'lungs': {
      const b2 = sig(f.engagement?.beta2_occupancy)
      const lisOn = onBoard(f.conc?.lisinopril, 'lisinopril')
      const losOn = onBoard(f.conc?.losartan, 'losartan') || onBoard(f.conc?.exp3174, 'exp3174')
      if (losOn && !lisOn) return t('organ.scene.watch.lungsAbsence')
      return t('organ.scene.watch.lungs', { pct: pct(b2) })
    }
    case 'liver': {
      const cap = sig(f.liver?.cyp2d6_capacity_fold)
      return cap === null ? t('organ.scene.watch.liverNone') : t('organ.scene.watch.liver', { value: cap.toFixed(2) })
    }
    case 'kidney': {
      const ncc = sig(f.engagement?.ncc_inhibition)
      const ace = sig(f.engagement?.ace_inhibition_renal)
      const at1 = sig(f.engagement?.at1_blockade)
      return t('organ.scene.watch.kidney', { ncc: pct(ncc), ace: pct(ace), at1: pct(at1) })
    }
    case 'raas': {
      const renin = sig(f.mediators?.renin_pra_fold)
      const map = sig(f.haemo?.map)
      return t('organ.scene.watch.raas', {
        renin: renin === null ? '—' : t('organ.vessels.timesBaseline', { value: renin.toFixed(2) }),
        map: map === null ? '—' : `${Math.round(map)} mmHg`,
      })
    }
    case 'limbs': {
      const idx = sig(f.periph?.interstitial_volume_index)
      return t('organ.scene.watch.limbs', { value: formatSignal('periph.interstitial_volume_index', idx, undefined, 3) })
    }
    case 'safety': {
      if (fired.length === 0) return t('organ.scene.watch.safetyNone')
      return t('organ.scene.watch.safety', { n: fired.length })
    }
    default: {
      const sbp = sig(f.haemo?.sbp)
      const dbp = sig(f.haemo?.dbp)
      const hr = sig(f.haemo?.hr)
      const gfr = sig(f.renal?.gfr)
      const bp = sbp === null || dbp === null ? t('organ.bodyFigure.bpNotModelled') : `${Math.round(sbp)}/${Math.round(dbp)} mmHg`
      return t('organ.scene.watch.default', {
        bp,
        hr: `${hr === null ? '—' : Math.round(hr)} bpm`,
        gfr: gfr === null ? '—' : Math.round(gfr),
      })
    }
  }
}

// ---------------------------------------------------------------------------
// The selector
// ---------------------------------------------------------------------------

export function SceneSelector({
  scene,
  scenes = SCENES,
  onSelect,
  playing = false,
}: {
  scene: SceneId
  scenes?: SceneDef[]
  onSelect: (id: SceneId) => void
  /** Shows which tab the auto-walk is sitting on. */
  playing?: boolean
}) {
  const t = useT()
  return (
    <div className="pil-scene-tabs" role="tablist" aria-label={t('organ.scene.selectorAriaLabel')}>
      {scenes.map((raw) => {
        const s = localizedSceneDef(t, raw)
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === scene}
            className={`pil-scene-tab${s.id === scene ? ' is-active' : ''}${s.id === scene && playing ? ' is-playing' : ''}`}
            title={s.blurb}
            onClick={() => onSelect(s.id)}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

export interface OrganSceneProps {
  scene: SceneId
  frame: EffectFrame | null
  /** Frames so far this run, for scenes that show a trajectory. */
  history?: EffectFrame[]
  caption?: string
  /** Laboratory reference bounds, ideally from data/patient_model.json. */
  refRanges?: RefRanges
  /** Hard gates from the rules engine, shown by the safety scene. */
  gates?: SafetyGates
  /**
   * Walk the scenes on a timer so the demo can be left to play itself. It stops the instant
   * the viewer touches anything inside the figure — a presenter has to be able to take
   * control mid-sentence — and never restarts on its own.
   */
  autoAdvance?: boolean
  /** Wall-clock seconds a scene is held before the walk moves on. */
  autoAdvanceS?: number
  /** Which scenes the walk visits. Defaults to all of them, in order. */
  autoAdvanceScenes?: SceneId[]
  onSceneChange?: (id: SceneId) => void
  /** Render the built-in tab strip. Off if the host provides its own selector. */
  showSelector?: boolean
  className?: string
}

export function OrganScene({
  scene,
  frame,
  history = NO_HISTORY,
  caption,
  refRanges = FALLBACK_REF,
  gates,
  autoAdvance = false,
  autoAdvanceS = 8,
  autoAdvanceScenes,
  onSceneChange,
  showSelector = true,
  className,
}: OrganSceneProps): ReactNode {
  const t = useT()
  const known = SCENE_GEOMETRY[scene] ? scene : DEFAULT_SCENE

  // The requested scene is the source of truth; the walk moves it, and any touch stops
  // the walk. Keeping one piece of state means a controlled host and an uncontrolled one
  // behave identically.
  const [active, setActive] = useState<SceneId>(known)
  const [walking, setWalking] = useState(autoAdvance)
  const propRef = useRef(known)

  useEffect(() => {
    if (propRef.current === known) return
    propRef.current = known
    setActive(known)
  }, [known])

  useEffect(() => setWalking(autoAdvance), [autoAdvance])

  const select = useCallback(
    (id: SceneId) => {
      setActive(id)
      onSceneChange?.(id)
    },
    [onSceneChange],
  )

  const walkList = useMemo(
    () => (autoAdvanceScenes && autoAdvanceScenes.length > 0 ? autoAdvanceScenes : SCENES.map((s) => s.id)),
    [autoAdvanceScenes],
  )

  useEffect(() => {
    if (!walking) return
    const id = setTimeout(() => {
      const i = walkList.indexOf(active)
      select(walkList[(i + 1) % walkList.length] ?? walkList[0]!)
    }, Math.max(1500, autoAdvanceS * 1000))
    return () => clearTimeout(id)
  }, [walking, active, walkList, autoAdvanceS, select])

  /** The presenter's override. Any deliberate input inside the figure ends the walk. */
  const takeControl = useCallback(() => setWalking(false), [])

  const reduced = useReducedMotion()
  const target = useMemo(() => sceneCamera(active), [active])
  const camera = useCamera(target, active, reduced)

  const idle = frame === null
  const f = useMemo(() => frame ?? RESTING, [frame])
  const coughing = useCoughEvents(frame)

  // Badge latching lives here rather than in the safety plate, so the numbered marks on
  // the body and the sourced rows beside it are always the same set with the same hysteresis.
  const [latched, setLatched] = useState<ReadonlySet<string>>(() => new Set<string>())
  const latchedRef = useRef<ReadonlySet<string>>(latched)
  useEffect(() => {
    const next = latchFor(frame, latchedRef.current, refRanges)
    if (next.size !== latchedRef.current.size || [...next].some((k) => !latchedRef.current.has(k))) {
      latchedRef.current = next
      setLatched(next)
    }
  }, [frame, refRanges])

  const fired = useMemo(() => BADGES.filter((b) => latched.has(b.id)), [latched])

  const def = localizedSceneDef(t, sceneDef(active))
  const outgoingDef = camera.outgoing ? sceneDef(camera.outgoing) : null
  const fadeIn = reduced ? 1 : clamp((camera.phase - 0.45) / 0.55, 0, 1)
  const fadeOut = reduced ? 0 : clamp(1 - camera.phase / 0.4, 0, 1)

  const status = idle
    ? t('organ.figure.restingBaseline')
    : t('organ.scene.clockStatus', { t: f.t_h.toFixed(1) })

  return (
    <section
      className={`pil-organ-figure pil-scene${className ? ` ${className}` : ''}`}
      onPointerDownCapture={takeControl}
      onKeyDownCapture={takeControl}
      onWheelCapture={takeControl}
    >
      <header className="pil-scene-head">
        <div className="pil-scene-title">
          <h3>{caption ?? def.label}</h3>
          <p className={idle ? 'pil-idle-note' : 'pil-clock'}>{status}</p>
        </div>
        {showSelector && (
          <SceneSelector scene={active} onSelect={select} playing={walking} />
        )}
      </header>

      <div className="pil-scene-stage">
        <svg
          className="pil-scene-svg"
          viewBox={viewBoxOf(camera.rect)}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${def.label} — ${def.blurb}`}
        >
          <title>{`${def.label}: ${def.blurb}`}</title>

          {/* The body is drawn once, in its own coordinates, for every scene. Nothing about
              it changes between scenes — only where the camera is standing. */}
          <g className="pil-scene-body" transform={`translate(0 0)`}>
            <Body
              frame={f}
              coughing={coughing}
              disqualified={Boolean(gates?.disqualified)}
              pregnancyBarrier={Boolean(gates?.pregnancyBarrier)}
            />
          </g>

          {outgoingDef && (
            <g style={{ opacity: fadeOut }} aria-hidden="true">
              <SceneLayer id={outgoingDef.id} frame={f} history={history} fired={fired} gates={gates} />
            </g>
          )}
          <g style={{ opacity: fadeIn }}>
            <SceneLayer id={active} frame={f} history={history} fired={fired} gates={gates} />
          </g>
        </svg>
      </div>

      <figcaption className="pil-scene-caption">
        <p className="pil-scene-blurb">{def.blurb}</p>
        <p className="pil-scene-watch">{sceneWatch(t, active, frame, fired)}</p>
      </figcaption>
    </section>
  )
}

export default OrganScene
