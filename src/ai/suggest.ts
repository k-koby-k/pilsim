/**
 * Suggestions — the AI proposes, the engine adjudicates.
 *
 * This is the interaction the whole architecture is arguing for, so the
 * boundary here is stricter than anywhere else: the model does not name a drug
 * and it does not name a dose. It returns an id, that id is looked up in the
 * catalogue the app already built from its own dosing ladders, and anything
 * that is not an exact match is DISCARDED — not corrected, not fuzzy-matched to
 * the nearest plausible arm, discarded. A regimen the app cannot run therefore
 * cannot reach the screen, and pressing "Simulate this" always runs a regimen
 * the engine defined.
 *
 * The rationale sentence is prose, so it goes through the number boundary with
 * unsupported figures STRIPPED rather than flagged: it sits on a button next to
 * engine output, which is exactly the place a flagged-but-visible number could
 * still be misread as sourced.
 */

import { stripUnsupported, type NumberFact } from './numbers'
import type { RegimenChoice, SceneSuggestion, Suggestion } from './types'

export interface ParsedSuggestions {
  suggestions: Suggestion[]
  /** Ids the model produced that are not in the catalogue. Shown, never used. */
  rejected: string[]
  /** The scene it recommends watching, if it named one the app publishes. */
  scene: SceneSuggestion | null
}

const MAX_SUGGESTIONS = 3
const MAX_RATIONALE = 240

/**
 * Parse the block after the marker.
 *
 * Tolerant of the shapes small instruct models drift into — a leading "1.",
 * a dash, backticks around the id, an em dash instead of a pipe — because the
 * cost of a strict parser here is a blank suggestion list at demo time, and the
 * id lookup is what actually provides the safety, not the punctuation.
 */
export function parseSuggestions(
  block: string,
  choices: RegimenChoice[],
  facts: NumberFact[],
  scenes: RegimenChoice[] = [],
): ParsedSuggestions {
  const byId = new Map(choices.map((c) => [c.id, c]))
  const sceneById = new Map(scenes.map((c) => [c.id, c]))
  const suggestions: Suggestion[] = []
  const rejected: string[] = []
  const used = new Set<string>()
  let scene: SceneSuggestion | null = null

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim().replace(/^[-*•\d.)\s]+/, '').trim()
    if (!line) continue

    // A scene line is answered first: it is a view, not an arm, and it is the
    // one recommendation here that cannot change a number.
    const sceneMatch = /^scene\s*[:=]\s*(.+)$/i.exec(line)
    if (sceneMatch) {
      const [rawId, ...why] = sceneMatch[1].split(/\s*[|—–]\s*/)
      const id = rawId.replace(/[`"'*]/g, '').trim()
      const hit = sceneById.get(id)
      if (hit && !scene) {
        scene = {
          sceneId: hit.id,
          label: hit.label,
          reason: stripUnsupported(why.join(' — ').trim(), facts).replace(/\s+/g, ' ').trim(),
        }
      } else if (!hit && /^[\w.:-]+$/.test(id) && id.length > 2) {
        rejected.push(id)
      }
      continue
    }

    if (suggestions.length >= MAX_SUGGESTIONS) continue

    const [idPartRaw, ...rest] = line.split(/\s*[|—–]\s*/)
    const idPart = idPartRaw.replace(/[`"'*]/g, '').trim()
    if (!idPart) continue

    const choice = byId.get(idPart)
    if (!choice) {
      // Only report it as a rejection if it looked like an id attempt at all.
      if (/^[\w.:-]+$/.test(idPart) && idPart.length > 2) rejected.push(idPart)
      continue
    }
    if (used.has(choice.id)) continue
    used.add(choice.id)

    const raw = rest.join(' — ').trim()
    const clean = stripUnsupported(raw, facts).replace(/\s+/g, ' ').trim()
    suggestions.push({
      regimenId: choice.id,
      label: choice.label,
      rationale: clean.length > MAX_RATIONALE ? `${clean.slice(0, MAX_RATIONALE)}…` : clean,
    })
  }

  return { suggestions, rejected, scene }
}
