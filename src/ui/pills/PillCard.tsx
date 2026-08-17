/**
 * The library card and the focused composition view. Owned by Agent UI-A.
 *
 * The card is deliberately calm: name, strength, what is in it, and one line of
 * status. Colour appears only when a rule actually fired, so a grid of safe pills
 * reads as a quiet library rather than as an alarm panel.
 */

import { useState } from 'react'
import type { SubstanceRecord } from '../../data/load'
import { DOSABLE_DRUGS, listFormsForDrug } from '../../engine'
import { useT } from '../../i18n'
import type { DrugId } from '../../types'
import {
  Badge,
  Card,
  Disclosure,
  LibraryCard,
  NumberField,
  ProvenanceChip,
  ProvenanceDetail,
  Row,
  SliderField,
  type CardStatus,
} from '../shell/primitives'
import {
  actives,
  componentStrengthLabel,
  excipients,
  maxDailyMg,
  PRODUCT_CLASS_LABEL,
  prettyLabel,
  saltDetailCaption,
  type Pill,
} from './model'
import { VERDICT_KEY, verdictOf, type CompositionEvaluation } from './rulesAdapter'

/** Only a fired prohibition earns a coloured edge. "Warn" and "clear" stay plain. */
const VERDICT_TONE: Record<string, 'danger' | 'warn' | 'good' | undefined> = {
  blocked: 'danger',
  override: 'danger',
  warn: undefined,
  clear: undefined,
}

const DOSABLE_SET = new Set<string>(DOSABLE_DRUGS)

const VERDICT_STATUS_TONE: Record<string, CardStatus['tone']> = {
  blocked: 'bad',
  override: 'bad',
  warn: 'warn',
  clear: 'ok',
}

/**
 * The form chosen in the composer, read back for a saved composition. Says
 * plainly when a real alternate form carries no measured PK difference,
 * rather than letting the reader assume every named form behaves distinctly.
 */
function FormCaption({ substanceId, form }: { substanceId: DrugId; form: string }) {
  const t = useT()
  const listing = listFormsForDrug(substanceId).find((f) => f.form === form)
  if (!listing || listing.isReference) return null
  return (
    <p className="dose-form-note dim" style={{ fontSize: 'var(--fs-xs)', margin: '2px 0 0' }}>
      {t('pillcard.formNote', { form: listing.form })}
      {listing.existsRealWorld && listing.pkEquivalent
        ? t('pillcard.formNotePkEquivalent')
        : null}
    </p>
  )
}

function PillGlyph({ combo }: { combo: boolean }) {
  return (
    <svg width="28" height="17" viewBox="0 0 28 17" aria-hidden>
      <rect
        x="1"
        y="1"
        width="26"
        height="15"
        rx="7.5"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="1.4"
      />
      <path d="M14 1v15" stroke="var(--line-strong)" strokeWidth="1.4" />
      <circle cx="7.5" cy="8.5" r="2.1" fill="var(--accent)" />
      {combo ? <circle cx="20.5" cy="8.5" r="2.1" fill="var(--drug-amlodipine)" /> : null}
    </svg>
  )
}

export function PillGridCard({
  pill,
  evaluation,
  selected,
  onSelect,
}: {
  pill: Pill
  evaluation: CompositionEvaluation
  selected: boolean
  onSelect: () => void
}) {
  const t = useT()
  const act = actives(pill)
  const exc = excipients(pill)
  const verdict = verdictOf(evaluation)
  const isFdc = pill.productClass === 'fixed_dose_combination'

  // If the title already names every active, the ingredient line is redundant —
  // show what kind of tablet it is instead.
  const ingredientLine = act.map((c) => prettyLabel(c.name)).join(' + ')
  const titleNamesAll = act.every((c) =>
    pill.name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0]),
  )

  return (
    <LibraryCard
      glyph={<PillGlyph combo={act.length > 1} />}
      title={pill.name}
      subtitle={
        titleNamesAll && pill.dosageForm
          ? pill.dosageForm.charAt(0).toUpperCase() + pill.dosageForm.slice(1)
          : ingredientLine
      }
      tone={VERDICT_TONE[verdict]}
      selected={selected}
      onClick={onSelect}
      tags={
        <>
          <Badge tone={isFdc ? 'accent' : pill.source === 'custom' ? 'modified' : undefined}>
            {PRODUCT_CLASS_LABEL[pill.productClass] ?? prettyLabel(pill.productClass)}
          </Badge>
          {pill.lactoseFree === false ? <Badge tone="warn">{t('pillcard.containsLactose')}</Badge> : null}
        </>
      }
      stats={act.map((c) => {
        // Labelled strength, not the base moiety mass — see componentStrengthLabel.
        // "Metoprolol 39 mg" is a strength that was never licensed; a card must
        // never headline it.
        const [value, ...rest] = componentStrengthLabel(c).split(' ')
        return {
          label: prettyLabel(c.name).split(' ')[0],
          value,
          unit: rest.length > 0 ? rest.join(' ') : undefined,
        }
      })}
      meta={t('pillcard.excipientCount', { n: exc.length, interval: pill.dosingIntervalH ?? '' })}
      status={{ label: t(VERDICT_KEY[verdict]), tone: VERDICT_STATUS_TONE[verdict] }}
    />
  )
}

/**
 * The opened pill. The active ingredients are the answer to "what is in this", and
 * their amounts are ADJUSTABLE: each is a real control, bounded by the substance's own
 * approved daily ceiling where the data supplies one. Changing one re-runs the same
 * rules check. The label amount and its citation stay on screen next to the edit, so a
 * dose someone typed can never pass for a dose someone sourced.
 *
 * The excipient list is long, quantities are trade secret, and nobody reads it first —
 * so it stays one click away with its count on the button.
 */
export function PillComposition({
  pill,
  substances = [],
  overrides = {},
  onAmount,
  onRevert,
}: {
  pill: Pill
  substances?: SubstanceRecord[]
  /** substanceId -> edited amount in mg. */
  overrides?: Record<string, number>
  onAmount?: (substanceId: string, raw: string) => void
  onRevert?: (substanceId: string) => void
}) {
  const t = useT()
  const act = actives(pill)
  const exc = excipients(pill)
  const [showExcipients, setShowExcipients] = useState(false)

  return (
    <div className="stack">
      <Card title={t('pillcard.activeIngredients', { n: act.length })}>
        <div className="dose-list">
          {act.map((c) => {
            const edited = overrides[c.substanceId]
            const isModified = edited !== undefined
            const shown = isModified ? edited : c.amountMg
            const ceiling = maxDailyMg(substances.find((s) => s.id === c.substanceId))
            const saltDetail = saltDetailCaption(c)

            return (
              <div
                key={c.substanceId}
                className={isModified ? 'dose-row dose-row--modified' : 'dose-row'}
              >
                <div className="dose-id">
                  <span className="dose-name">{prettyLabel(c.name)}</span>
                  {saltDetail && c.amountMg !== null ? (
                    <p className="dose-form-note dim" style={{ fontSize: 'var(--fs-xs)', margin: '2px 0 0' }}>
                      {t('pillcard.baseContent', { salt: saltDetail, base: c.amountMg })}
                    </p>
                  ) : null}
                  <span className="dose-source">
                    {isModified ? (
                      <>
                        <Badge tone="modified">{t('common.edited')}</Badge>
                        <span className="dim">
                          {t('pillcard.label', { amount: componentStrengthLabel(c) })}
                        </span>
                        {onRevert ? (
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => onRevert(c.substanceId)}
                          >
                            {t('common.revert')}
                          </button>
                        ) : null}
                      </>
                    ) : c.amountProvenance ? (
                      <ProvenanceChip provenance={c.amountProvenance} />
                    ) : (
                      <Badge tone="modified">{t('common.userEntered')}</Badge>
                    )}
                  </span>
                </div>

                {c.form && DOSABLE_SET.has(c.substanceId) ? (
                  <FormCaption substanceId={c.substanceId as DrugId} form={c.form} />
                ) : null}

                <div className="dose-control">
                  {onAmount && ceiling ? (
                    <SliderField
                      value={shown}
                      min={0}
                      max={ceiling}
                      step={ceiling <= 20 ? 0.5 : 1}
                      unit="mg"
                      band={[0, ceiling]}
                      modified={isModified}
                      ariaLabel={t('common.amountAria', { name: c.name })}
                      label={<span className="dim">{t('pillcard.dose')}</span>}
                      onChange={(n) => onAmount(c.substanceId, String(n))}
                      onText={(raw) => onAmount(c.substanceId, raw)}
                    />
                  ) : (
                    <NumberField
                      value={shown}
                      unit="mg"
                      size="lg"
                      modified={isModified}
                      disabled={!onAmount}
                      ariaLabel={t('common.amountAria', { name: c.name })}
                      onChange={(raw) => onAmount?.(c.substanceId, raw)}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title={t('pillcard.identity')}>
        <Row label={t('pillcard.productClass')}>
          {PRODUCT_CLASS_LABEL[pill.productClass] ?? prettyLabel(pill.productClass)}
        </Row>
        {pill.genericName ? <Row label={t('pillcard.generic')}>{pill.genericName}</Row> : null}
        {pill.dosageForm ? <Row label={t('pillcard.dosageForm')}>{pill.dosageForm}</Row> : null}
        {pill.route ? <Row label={t('pillcard.route')}>{pill.route}</Row> : null}
        {pill.dosingIntervalH ? (
          <Row label={t('pillcard.dosingInterval')} mono>
            {t('pillcard.every', { h: pill.dosingIntervalH })}
          </Row>
        ) : null}
        {pill.availableStrengths.length > 0 ? (
          <Row label={t('pillcard.strengths')} mono hint={t('pillcard.asMarketed')}>
            {pill.availableStrengths.join(' / ')} mg
          </Row>
        ) : null}
        {pill.modeledStrengthMg !== null ? (
          <Row label={t('pillcard.modelledStrength')} mono>
            {pill.modeledStrengthMg} mg{' '}
            {pill.modeledStrengthProvenance ? (
              <ProvenanceChip provenance={pill.modeledStrengthProvenance} />
            ) : null}
          </Row>
        ) : null}
        {pill.brands.length > 0 ? (
          <Row label={t('pillcard.referenceBrands')} wide>
            <span className="dim" style={{ fontSize: 'var(--fs-xs)' }}>
              {pill.brands.join(' · ')}
            </span>
          </Row>
        ) : null}
        {pill.lactoseNote ? (
          <Row label={t('pillcard.lactose')} wide>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' }}>
              {pill.lactoseNote}
            </span>
          </Row>
        ) : null}
      </Card>

      <Disclosure
        summary={t('pillcard.excipients')}
        meta={
          exc.length === 0
            ? t('pillcard.noneInComposition')
            : t('pillcard.tradeSecret', { n: exc.length })
        }
        open={showExcipients}
        onToggle={() => setShowExcipients((v) => !v)}
        flush
      >
        {exc.length === 0 ? (
          <div className="mtable-empty">{t('pillcard.noExcipients')}</div>
        ) : (
          <div className="scroll-y">
            <table className="excipient-table">
              <thead>
                <tr>
                  <th>{t('pillcard.substance')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pillcard.amount')}</th>
                  <th>{t('substances.source')}</th>
                </tr>
              </thead>
              <tbody>
                {exc.map((c) => (
                  <tr key={c.substanceId}>
                    <td>{prettyLabel(c.name)}</td>
                    <td className="num dim">
                      {c.amountMg === null ? t('pillcard.notDisclosed') : `${c.amountMg} mg`}
                    </td>
                    <td>
                      {c.amountProvenance ? (
                        <ProvenanceChip provenance={c.amountProvenance} />
                      ) : (
                        <span className="dim">{t('pillcard.userEntered')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pill.excipientProvenance ? (
          <div style={{ padding: 'var(--sp-4) var(--sp-5) var(--sp-5)' }}>
            <ProvenanceDetail provenance={pill.excipientProvenance} />
          </div>
        ) : null}
      </Disclosure>

      {pill.notes ? (
        <Card title={t('pillcard.notes')}>
          <p className="prose">{pill.notes}</p>
        </Card>
      ) : null}
    </div>
  )
}
