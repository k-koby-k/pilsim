/**
 * Suggestions. The tight constraint here is that the model cannot name a dose:
 * it returns an id, and an id that is not in the catalogue is discarded rather
 * than repaired. Anything the panel offers to run is therefore a regimen the
 * app itself defined and the engine can execute.
 */

import { describe as suite, expect, it } from 'vitest'
import { parseSuggestions } from './suggest'
import { factsFromText, UNSOURCED_MARK } from './numbers'
import type { RegimenChoice } from './types'

const choices: RegimenChoice[] = [
  { id: 'amlodipine_5', label: 'Amlodipine 5 mg' },
  { id: 'amlodipine_10', label: 'Amlodipine 10 mg' },
  { id: 'lisinopril_20__hydrochlorothiazide_12.5', label: 'Lisinopril 20 + HCTZ 12.5 mg' },
]
const facts = factsFromText('amlodipine 5 mg, 10 mg, 12.4 mmHg', 'context')

suite('parsing the suggestion block', () => {
  it('accepts the plain form', () => {
    const { suggestions } = parseSuggestions(
      '\namlodipine_5 | settles whether the lower dose already reaches target\n',
      choices,
      facts,
    )
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ regimenId: 'amlodipine_5', label: 'Amlodipine 5 mg' })
  })

  it('tolerates the decoration small models add', () => {
    const block = [
      '1. `amlodipine_5` — would settle the dose question',
      '- amlodipine_10 | tests the upper rung',
      '* lisinopril_20__hydrochlorothiazide_12.5 – tests a second mechanism',
    ].join('\n')
    expect(parseSuggestions(block, choices, facts).suggestions.map((s) => s.regimenId)).toEqual([
      'amlodipine_5',
      'amlodipine_10',
      'lisinopril_20__hydrochlorothiazide_12.5',
    ])
  })

  it('DISCARDS an id that is not in the catalogue rather than guessing at it', () => {
    // "amlodipine 7 mg" is the whole reason this code exists. There is no
    // nearest-match repair: an arm the app never defined cannot reach a button.
    const { suggestions, rejected } = parseSuggestions(
      'amlodipine_7 | try seven milligrams\namlodipine_5 | the real one',
      choices,
      facts,
    )
    expect(suggestions.map((s) => s.regimenId)).toEqual(['amlodipine_5'])
    expect(rejected).toContain('amlodipine_7')
  })

  it('strips an unsupported number out of the rationale', () => {
    // A rationale sits on a button beside engine output, so a flagged-but-visible
    // number could still read as sourced. Here it is removed outright.
    const { suggestions } = parseSuggestions(
      'amlodipine_5 | would likely give 18 mmHg more reduction',
      choices,
      facts,
    )
    expect(suggestions[0].rationale).toContain(UNSOURCED_MARK)
    expect(suggestions[0].rationale).not.toContain('18 mmHg')
  })

  it('keeps a rationale number that was supplied', () => {
    const { suggestions } = parseSuggestions('amlodipine_5 | compares against 12.4 mmHg', choices, facts)
    expect(suggestions[0].rationale).toContain('12.4 mmHg')
  })

  it('caps at three and never repeats an arm', () => {
    const block = ['amlodipine_5 | a', 'amlodipine_5 | b', 'amlodipine_10 | c', 'lisinopril_20__hydrochlorothiazide_12.5 | d'].join('\n')
    expect(parseSuggestions(block, choices, facts).suggestions).toHaveLength(3)
  })

  it('returns nothing at all for an empty or prose-only block', () => {
    expect(parseSuggestions('', choices, facts).suggestions).toEqual([])
    expect(parseSuggestions('I would try a calcium channel blocker.', choices, facts).suggestions).toEqual([])
  })
})

suite('recommending a scene to watch', () => {
  const scenes: RegimenChoice[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'liver', label: 'Liver' },
    { id: 'safety', label: 'What was blocked' },
  ]

  it('matches a scene the app publishes', () => {
    const { scene } = parseSuggestions(
      'scene: liver | the poor metaboliser clears metoprolol slowly',
      choices,
      facts,
      scenes,
    )
    expect(scene).toMatchObject({ sceneId: 'liver', label: 'Liver' })
    expect(scene?.reason).toContain('clears metoprolol slowly')
  })

  it('discards a scene the app does not have', () => {
    const { scene, rejected } = parseSuggestions('scene: pancreas | look here', choices, facts, scenes)
    expect(scene).toBeNull()
    expect(rejected).toContain('pancreas')
  })

  it('takes only the first scene line, and does not consume a regimen slot', () => {
    const { scene, suggestions } = parseSuggestions(
      ['scene: liver | first', 'scene: safety | second', 'amlodipine_5 | still parsed'].join('\n'),
      choices,
      facts,
      scenes,
    )
    expect(scene?.sceneId).toBe('liver')
    expect(suggestions.map((s) => s.regimenId)).toEqual(['amlodipine_5'])
  })

  it('strips an unsupported number from the scene reason too', () => {
    const { scene } = parseSuggestions('scene: liver | clearance falls 40 %', choices, facts, scenes)
    expect(scene?.reason).toContain(UNSOURCED_MARK)
    expect(scene?.reason).not.toContain('40 %')
  })

  it('is absent when no scenes were offered', () => {
    expect(parseSuggestions('scene: liver | x', choices, facts).scene).toBeNull()
  })
})
