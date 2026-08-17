/**
 * The right rail: which view of the body you are watching, and the body.
 *
 * A scene is a LENS ON THE SAME FRAME STREAM, never a different simulation, so
 * switching one changes nothing about what was computed — that is stated on the
 * panel rather than left to be inferred, because a selector that re-runs a
 * model and a selector that re-frames one look identical from the outside.
 *
 * The scene system belongs to `src/ui/organs`. This file selects and hosts; it
 * draws no anatomy of its own, and it degrades in three steps if the scene
 * exports are not there yet — see scenes.ts.
 */

import { useEffect, useState } from 'react'
import type { EffectFrame } from '../../types'
import { useT } from '../../i18n'
import type { EvaluationResult } from './adapters'
import { OrganPanel } from './OrganPanel'
import {
  EMPTY_BINDING,
  loadSceneBinding,
  orderScenesFor,
  type SceneBinding,
  type SceneId,
} from './scenes'

export function useSceneBinding(): SceneBinding {
  const [binding, setBinding] = useState<SceneBinding>(EMPTY_BINDING)
  useEffect(() => {
    let live = true
    void loadSceneBinding().then((b) => {
      if (live) setBinding(b)
    })
    return () => {
      live = false
    }
  }, [])
  return binding
}

export interface ScenePanelProps {
  binding: SceneBinding
  sceneId: SceneId | null
  onScene: (id: SceneId) => void
  frame: EffectFrame | null
  history: EffectFrame[]
  caption?: string
  evaluation?: EvaluationResult | null
  /** Drug ids in the regimen, used to order scenes and to draw the static view. */
  substanceIds: string[]
  /** True once a run has produced at least one frame. */
  live: boolean
}

export function ScenePanel({
  binding,
  sceneId,
  onScene,
  frame,
  history,
  caption,
  evaluation,
  substanceIds,
  live,
}: ScenePanelProps) {
  const t = useT()
  const scenes = orderScenesFor(binding.scenes, substanceIds)
  const current = scenes.find((s) => s.id === sceneId) ?? scenes[0] ?? null
  const Scene = binding.OrganScene
  const Static = binding.AffectedAnatomy

  return (
    <section className="sim-card sim-organ-card sim-scene" aria-label={t('sim.scene.anatomy')}>
      <header className="sim-scene-head">
        <h3 className="sim-card-title">{t('sim.scene.anatomy')}</h3>
        {!!scenes.length && <p className="sim-scene-note">{t('sim.scene.everySceneNote')}</p>}
      </header>

      {!!scenes.length && (
        <div className="sim-scene-picker" role="tablist" aria-label={t('sim.scene.tablistAria')}>
          {scenes.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={current?.id === s.id}
              className={current?.id === s.id ? 'is-active' : ''}
              onClick={() => onScene(s.id)}
              title={s.blurb}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {current?.blurb && <p className="sim-scene-blurb">{current.blurb}</p>}

      {Scene && current ? (
        <Scene scene={current.id} frame={frame} history={history} caption={caption} />
      ) : live || !Static ? (
        // The live figure is already correct and frame-bound; it stays the
        // fallback rather than a placeholder, so nothing is lost while the
        // scene system lands.
        <OrganPanel frame={frame} caption={caption} evaluation={evaluation} />
      ) : (
        <>
          <Static substanceIds={substanceIds} caption={caption} variant="rail" />
          <p className="sim-scene-static">{t('sim.scene.staticCaption')}</p>
        </>
      )}
    </section>
  )
}
