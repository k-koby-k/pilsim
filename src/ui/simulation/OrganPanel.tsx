/**
 * Host for the organ figure exported by src/ui/organs (Agent UI-B).
 *
 * The contract is `{ frame: EffectFrame | null }`, so this file does nothing
 * but pass the current streamed frame straight through, plus the optional
 * extras the figure accepts: the regimen caption and the hard gates from the
 * rules engine, which the figure needs in order to render a pregnancy barrier
 * or a disqualified state rather than an animation of a blocked arm.
 */

import { OrganFigure } from '../organs'
import type { EffectFrame } from '../../types'
import type { EvaluationResult } from './adapters'

export function OrganPanel({
  frame,
  caption,
  evaluation,
}: {
  frame: EffectFrame | null
  caption?: string
  evaluation?: EvaluationResult | null
}) {
  const gates = evaluation
    ? {
        disqualified: evaluation.tier === 'DISQUALIFIED',
        pregnancyBarrier: evaluation.hits.some((h) => /preg|fetal/i.test(h.ruleId + h.title)),
        note: evaluation.blockReasons[0],
      }
    : undefined

  return (
    <div className="sim-organs">
      <OrganFigure frame={frame} caption={caption} gates={gates} />
    </div>
  )
}
