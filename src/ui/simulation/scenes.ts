/**
 * Defensive binding to the scene system in `src/ui/organs`.
 *
 * `SCENES` and `OrganScene` are being written by the agent who owns that
 * directory and are not exported yet, so a static import would not compile.
 * They are resolved at runtime and looked up by name — the same arrangement
 * `src/ui/shell/AnatomyRail.tsx` uses for `AffectedAnatomy`, and the same one
 * `adapters.ts` uses for the engine. This view therefore compiles and runs
 * today, and starts showing scenes the moment they land, with no edit here.
 *
 * The fallback chain, in order of how much it can show:
 *   1. `OrganScene`      — the scene the user picked, driven by the frame stream.
 *   2. `OrganFigure`     — today's live figure, via OrganPanel. Already correct.
 *   3. `AffectedAnatomy` — where the regimen acts, before a run has produced
 *                          a frame. Static, and honest about being static.
 *
 * Nothing here implements a scene. That is not this agent's directory.
 */

import type { ComponentType } from 'react'
import type { EffectFrame } from '../../types'

export type SceneId = string

/** Mirrors the published contract: `{ id, label, blurb, relevantTo? }`. */
export interface SceneDef {
  id: SceneId
  label: string
  blurb?: string
  /** Substance ids that make this scene worth watching. */
  relevantTo?: string[]
}

export interface OrganSceneProps {
  scene: SceneId
  frame: EffectFrame | null
  history?: EffectFrame[]
  caption?: string
  /**
   * Render the figure's OWN tab strip. The published component defaults this to
   * true, so a host that draws its own selector — ScenePanel does — must pass
   * false or the page ends up with two scene tab strips stacked on one figure.
   */
  showSelector?: boolean
}

export interface AffectedAnatomyProps {
  substanceIds: string[]
  caption?: string
  variant?: 'rail' | 'inline'
}

export interface SceneBinding {
  scenes: SceneDef[]
  OrganScene: ComponentType<OrganSceneProps> | null
  AffectedAnatomy: ComponentType<AffectedAnatomyProps> | null
}

export const EMPTY_BINDING: SceneBinding = { scenes: [], OrganScene: null, AffectedAnatomy: null }

let cached: SceneBinding | null = null
let inflight: Promise<SceneBinding> | null = null

function isSceneDef(v: unknown): v is SceneDef {
  const o = v as Record<string, unknown> | null
  return !!o && typeof o.id === 'string' && typeof o.label === 'string'
}

/** Resolve once, then serve from cache. Never throws. */
export function loadSceneBinding(): Promise<SceneBinding> {
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = import('../organs')
    .then((mod) => {
      const bag = mod as Record<string, unknown>
      const raw = bag.SCENES
      const scenes = Array.isArray(raw) ? raw.filter(isSceneDef) : []
      const OrganScene = typeof bag.OrganScene === 'function' ? (bag.OrganScene as ComponentType<OrganSceneProps>) : null
      const AffectedAnatomy =
        typeof bag.AffectedAnatomy === 'function'
          ? (bag.AffectedAnatomy as ComponentType<AffectedAnatomyProps>)
          : null
      cached = { scenes, OrganScene, AffectedAnatomy }
      return cached
    })
    .catch(() => {
      cached = EMPTY_BINDING
      return cached
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * Order the scenes for a regimen.
 *
 * `relevantTo` is the scene author's own statement about which substances make
 * a scene worth watching, so it is used as given rather than second-guessed:
 * relevant scenes first, everything else after, original order preserved inside
 * each group. Nothing is hidden — a user who wants the liver for a regimen
 * without a hepatic story is allowed to look at the liver.
 */
export function orderScenesFor(scenes: SceneDef[], substanceIds: string[]): SceneDef[] {
  if (!substanceIds.length) return scenes
  const wanted = new Set(substanceIds)
  const relevant = scenes.filter((s) => s.relevantTo?.some((x) => wanted.has(x)))
  const rest = scenes.filter((s) => !relevant.includes(s))
  return [...relevant, ...rest]
}

/** Scenes the AI may name, as `id | label | why it is worth watching`. */
export function sceneChoiceLines(scenes: SceneDef[], substanceIds: string[]): string[] {
  return orderScenesFor(scenes, substanceIds).map((s) => {
    const relevance = s.relevantTo?.filter((x) => substanceIds.includes(x)) ?? []
    return `${s.id} | ${s.label}${s.blurb ? ` | ${s.blurb}` : ''}${
      relevance.length ? ` | relevant to ${relevance.join(', ')} in this regimen` : ''
    }`
  })
}
