/**
 * A subject in the library grid.
 *
 * Renders through the shared <LibraryCard> — the same component Pills and Substances
 * use — so the three libraries read as one product rather than three designs that
 * merely resemble each other.
 *
 * What a clinician scans, in order: who this is, the two numbers that decide a
 * hypertension conversation (blood pressure and eGFR), which conditions are switched
 * on, and one line saying what this subject is interesting FOR.
 *
 * Colour appears only where it carries a decision — a hard gate, or a genotype that is
 * not the normal metaboliser — so a grid of ten patients stays a quiet library.
 *
 * LibraryCard renders as a <button>, so it must not contain buttons. The per-card
 * actions are therefore a SIBLING overlay, not a child.
 */

import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import type { PatientInputs } from '../../types'
import { Badge, LibraryCard } from '../shell/primitives'
import type { Subject } from './subjectStore'

export interface SubjectCardProps {
  subject: Subject
  /** Headline derived values, already computed by the page in one pass. */
  egfr: number | undefined
  /** CYP2D6 phenotype from the derivation pipeline, e.g. "Poor". */
  phenotype: string
  conditionLabels: string[]
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function SubjectCard({
  subject,
  egfr,
  phenotype,
  conditionLabels,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: SubjectCardProps) {
  const t = useT()
  const i = subject.inputs
  // Delete is two-step rather than a modal: one click arms it, the next removes the
  // subject, and it disarms itself after a few seconds. Losing a patient you built
  // mid-demo to a stray click is worse than one extra click.
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const pregnant = i.pregnant === true
  const oddPhenotype = phenotype !== '' && phenotype.toLowerCase() !== 'normal'

  // Two tags at most, per the pattern. A hard gate and an unusual genotype outrank
  // a comorbidity name, because they are what changes the recommendation.
  const tags: React.ReactNode[] = []
  if (pregnant) tags.push(<Badge key="preg" tone="bad">{t('subject.card.pregnant')}</Badge>)
  if (oddPhenotype) {
    tags.push(
      <Badge key="pheno" tone="modified">
        CYP2D6 {phenotype.toLowerCase()}
      </Badge>,
    )
  }
  for (const c of conditionLabels) {
    if (tags.length >= 2) break
    tags.push(<Badge key={c}>{c}</Badge>)
  }
  if (tags.length === 0) tags.push(<Badge key="none">{t('subject.card.noComorbidity')}</Badge>)

  const hidden = conditionLabels.length + (pregnant ? 1 : 0) + (oddPhenotype ? 1 : 0) - tags.length

  return (
    <div className={`subj-card-wrap${selected ? ' is-selected' : ''}`}>
      <LibraryCard
        title={subject.label}
        glyph={<SexAgeGlyph sex={i.sex} />}
        subtitle={subject.interesting}
        tags={
          <>
            {tags}
            {hidden > 0 ? <Badge key="more">{t('subject.card.moreCount', { n: hidden })}</Badge> : null}
          </>
        }
        stats={[
          { label: t('subject.card.bloodPressure'), value: `${i.sbp_mmHg}/${i.dbp_mmHg}`, unit: 'mmHg' },
          { label: t('subject.card.egfr'), value: egfr === undefined ? '—' : Math.round(egfr) },
        ]}
        meta={t('subject.card.meta', {
          age: i.age_years,
          sex: i.sex === 'female' ? t('subject.card.female') : t('subject.card.male'),
          weight: i.weight_kg,
        })}
        status={selected ? { label: t('subject.card.selected'), tone: 'ok' } : undefined}
        tone={pregnant ? 'danger' : undefined}
        selected={selected}
        onClick={onSelect}
      />

      <div className="subj-card-actions">
        <button type="button" className="btn btn--sm" onClick={onEdit}>
          {t('subject.card.edit')}
        </button>
        <button type="button" className="btn btn--sm" onClick={onDuplicate}>
          {t('subject.card.duplicate')}
        </button>
        <button
          type="button"
          className={`btn btn--sm${armed ? ' btn--danger' : ''}`}
          aria-label={
            armed
              ? t('subject.card.confirmDelete', { label: subject.label })
              : t('subject.card.deleteLabel', { label: subject.label })
          }
          onClick={() => {
            if (armed) {
              onDelete()
              return
            }
            setArmed(true)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => setArmed(false), 4000)
          }}
        >
          {armed ? t('subject.card.confirm') : t('subject.card.delete')}
        </button>
      </div>
    </div>
  )
}

/** A tiny figure mark so a card is recognisable before it is read. */
function SexAgeGlyph({ sex }: { sex: PatientInputs['sex'] }) {
  return (
    <svg className="subj-glyph" width="16" height="20" viewBox="0 0 16 20" aria-hidden>
      <circle cx="8" cy="4" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {sex === 'female' ? (
        <path d="M8 8.4 3.4 18h9.2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <path
          d="M3.6 18v-6.2a4.4 4.4 0 0 1 8.8 0V18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
