/**
 * The binding to the scene system in src/ui/organs.
 *
 * What matters here is the degradation, not the scenes themselves — those
 * belong to the agent who owns that directory. This view has to compile and run
 * before the exports land, keep the live organ figure working while they are
 * missing, and pick them up without an edit when they arrive.
 */

import { describe as suite, expect, it } from 'vitest'
import { loadSceneBinding, orderScenesFor, sceneChoiceLines, type SceneDef } from './scenes'

const scenes: SceneDef[] = [
  { id: 'overview', label: 'Overview', blurb: 'The whole body at once.' },
  { id: 'kidney', label: 'Kidney', blurb: 'Nephron and sodium handling.', relevantTo: ['hydrochlorothiazide'] },
  { id: 'liver', label: 'Liver', blurb: 'First pass and CYP flux.', relevantTo: ['metoprolol', 'losartan'] },
  { id: 'safety', label: 'What was blocked', blurb: 'Rules that stopped an arm.' },
]

suite('resolving the binding', () => {
  it('never throws and never invents a scene', async () => {
    const b = await loadSceneBinding()
    expect(Array.isArray(b.scenes)).toBe(true)
    // Whatever src/ui/organs exports today, a scene without an id and a label
    // is not usable as a tab and is dropped rather than rendered blank.
    expect(b.scenes.every((s) => typeof s.id === 'string' && typeof s.label === 'string')).toBe(true)
  })

  it('caches, so the rail does not re-import on every render', async () => {
    expect(await loadSceneBinding()).toBe(await loadSceneBinding())
  })
})

suite('ordering scenes for a regimen', () => {
  it('puts the relevant ones first without hiding the rest', () => {
    const ordered = orderScenesFor(scenes, ['metoprolol'])
    expect(ordered[0].id).toBe('liver')
    expect(ordered).toHaveLength(scenes.length)
  })

  it('preserves the author’s order inside each group', () => {
    expect(orderScenesFor(scenes, ['hydrochlorothiazide', 'metoprolol']).map((s) => s.id)).toEqual([
      'kidney',
      'liver',
      'overview',
      'safety',
    ])
  })

  it('leaves the order alone when nothing is being simulated', () => {
    expect(orderScenesFor(scenes, [])).toEqual(scenes)
  })
})

suite('what the AI is told about scenes', () => {
  it('offers ids and says why each is worth watching for THIS regimen', () => {
    const lines = sceneChoiceLines(scenes, ['metoprolol'])
    expect(lines[0]).toContain('liver | Liver')
    expect(lines[0]).toContain('relevant to metoprolol in this regimen')
    // The relevance claim comes from the scene author's own `relevantTo`, so a
    // scene with no stated relevance is offered without one invented for it.
    expect(lines.find((l) => l.startsWith('overview'))).not.toContain('relevant to')
  })
})
