/**
 * The right-hand body rail. Owned by Agent UI-A (src/ui/shell/**).
 *
 *     <aside className="rail">
 *       <AnatomyRail substanceIds={['amlodipine']} caption="Where amlodipine acts" />
 *     </aside>
 *
 * Substances, Pills and Test subjects all mount this in the same place, so the three
 * pages read as one product: the centre column scrolls, the body stays.
 *
 * It is a tolerant wrapper around `AffectedAnatomy` from `src/ui/organs`, which is
 * owned by another agent:
 *
 *     AffectedAnatomy({ substanceIds, caption?, variant?: 'rail' | 'inline' })
 *
 * The import is dynamic and the export is looked up by name, so these pages compile
 * and run whether or not that component has landed yet. Until it does, the rail shows
 * a quiet placeholder rather than a broken column.
 */

import { useEffect, useState, type ComponentType } from 'react'
import { useT } from '../../i18n'

export interface AffectedAnatomyProps {
  substanceIds: string[]
  caption?: string
  variant?: 'rail' | 'inline'
}

type AnatomyComponent = ComponentType<AffectedAnatomyProps>

let cached: AnatomyComponent | null = null

function useAffectedAnatomy(): AnatomyComponent | null {
  // MUST be a lazy initialiser, not `useState(cached)`. `cached` holds a COMPONENT,
  // i.e. a function, and useState treats a bare function argument as a lazy
  // initialiser — so React would CALL AffectedAnatomy() with no props and the
  // component would throw "(destructured parameter) is undefined" on its own props.
  // It only bit after the module had been cached by a previous mount, which is why
  // the first page load worked and a later navigation crashed.
  const [component, setComponent] = useState<AnatomyComponent | null>(() => cached)

  useEffect(() => {
    if (cached) return
    let alive = true
    // The module is resolved at runtime and the export read by name, so a missing
    // component is a placeholder rather than a compile error or a blank page.
    import('../organs')
      .then((mod) => {
        const found = (mod as Record<string, unknown>).AffectedAnatomy
        if (typeof found !== 'function') return
        cached = found as AnatomyComponent
        if (alive) setComponent(() => cached)
      })
      .catch(() => {
        /* the rail simply stays a placeholder */
      })
    return () => {
      alive = false
    }
  }, [])

  return component
}

export function AnatomyRail({
  substanceIds,
  caption,
  title,
  empty,
}: {
  substanceIds: string[]
  caption?: string
  title?: string
  /** Shown when nothing is selected. Keep it to one line. */
  empty?: string
}) {
  const t = useT()
  const Anatomy = useAffectedAnatomy()
  const shownTitle = title ?? t('rail.affectedAnatomy')
  const shownEmpty = empty ?? t('rail.pickSubstance')

  return (
    <div className="rail-panel">
      <div className="rail-head">
        <span>{shownTitle}</span>
        {substanceIds.length > 1 ? <span className="mono">{substanceIds.length}</span> : null}
      </div>

      {substanceIds.length === 0 ? (
        <p className="rail-note">{shownEmpty}</p>
      ) : (
        // Keyed on the selection so the figure re-enters when the subject changes —
        // the body visibly reacting is the point of the rail.
        <div className="rail-body rail-anim" key={substanceIds.join(',')}>
          {Anatomy ? (
            <Anatomy substanceIds={substanceIds} caption={caption} variant="rail" />
          ) : (
            <div className="rail-skeleton" aria-hidden />
          )}
        </div>
      )}

      {caption && !Anatomy ? <p className="rail-note">{caption}</p> : null}
    </div>
  )
}
