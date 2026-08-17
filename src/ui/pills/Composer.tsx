/**
 * The "compose a new pill" form. Owned by Agent UI-A.
 *
 * Presentational only — PillsPage owns the draft state so it can re-run the
 * incompatibility check on every keystroke and show the verdict live.
 *
 * Each component is a block rather than a table row: the substance on one line, and
 * under it the dose as a real control — a slider bounded by that substance's own
 * approved daily ceiling where the record supplies one, a number field where it does
 * not. Substances the user created appear in their own group at the top of the list.
 */

import type { ReactNode } from 'react'
import type { SubstanceRecord } from '../../data/load'
import { DOSABLE_DRUGS, listFormsForDrug } from '../../engine'
import { useT } from '../../i18n'
import type { DrugId } from '../../types'
import { Badge, Card, NumberField, SliderField, TextField } from '../shell/primitives'
import { isUserSubstance } from '../substances/substanceStore'
import { maxDailyMg } from './model'

export interface DraftRow {
  key: string
  substanceId: string
  amountMg: string
  /** Dosage form, matching `DoseSpec.form`. Omitted = the substance's reference form. */
  form?: string
}

const DOSABLE_SET = new Set<string>(DOSABLE_DRUGS)

/** Matches the wording RunControls uses for the same picker on the run screen. */
function formOptionLabel(t: ReturnType<typeof useT>, f: ReturnType<typeof listFormsForDrug>[number]): string {
  if (f.isReference) return t('composer.formStandard', { form: f.form })
  if (!f.existsRealWorld) return t('composer.formNotReal', { form: f.form })
  if (f.pkEquivalent) return t('composer.formPkEquivalent', { form: f.form })
  return t('composer.formDifferent', { form: f.form })
}

export function Composer({
  name,
  rows,
  substances,
  canSave,
  saveHint,
  onNameChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onSave,
  onClear,
  children,
}: {
  name: string
  rows: DraftRow[]
  substances: SubstanceRecord[]
  canSave: boolean
  saveHint?: string
  onNameChange: (v: string) => void
  onRowChange: (key: string, patch: Partial<DraftRow>) => void
  onAddRow: () => void
  onRemoveRow: (key: string) => void
  onSave: () => void
  onClear: () => void
  /** Live evaluation output, rendered under the form. */
  children?: ReactNode
}) {
  const t = useT()
  const userList = substances.filter(isUserSubstance)
  const activeList = substances.filter((s) => !isUserSubstance(s) && s.role !== 'excipient')
  const excipientList = substances.filter((s) => !isUserSubstance(s) && s.role === 'excipient')

  return (
    <Card title={t('composer.newComposition')}>
      <div className="composer">
        <div className="field">
          <span className="field-label">{t('composer.name')}</span>
          <TextField
            value={name}
            size="lg"
            ariaLabel={t('pill.compose.nameAria')}
            placeholder={t('composer.namePlaceholder')}
            onChange={onNameChange}
          />
        </div>

        <div className="stack">
          {rows.map((row) => {
            const rec = substances.find((s) => s.id === row.substanceId)
            const isExcipient = rec?.role === 'excipient'
            const ceiling = maxDailyMg(rec)

            return (
              <div className="composer-block" key={row.key}>
                <div className="composer-row">
                  <select
                    className="text-field"
                    value={row.substanceId}
                    aria-label={t('pillcard.substance')}
                    onChange={(e) => onRowChange(row.key, { substanceId: e.target.value })}
                  >
                    <option value="">{t('composer.selectSubstance')}</option>
                    {userList.length > 0 ? (
                      <optgroup label={t('composer.yoursGroup', { n: userList.length })}>
                        {userList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label={t('composer.activeGroup', { n: activeList.length })}>
                      {activeList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('composer.excipientGroup', { n: excipientList.length })}>
                      {excipientList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {row.substanceId ? (
                    <Badge tone={isExcipient ? undefined : 'ok'}>
                      {isExcipient ? t('common.excipient') : t('common.active')}
                    </Badge>
                  ) : (
                    <span className="dim">—</span>
                  )}

                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('composer.removeComponent')}
                    onClick={() => onRemoveRow(row.key)}
                  >
                    ×
                  </button>
                </div>

                {row.substanceId ? (
                  <div className="composer-dose">
                    {ceiling ? (
                      <SliderField
                        label={t('composer.dose')}
                        value={row.amountMg === '' ? null : Number(row.amountMg)}
                        min={0}
                        max={ceiling}
                        step={ceiling <= 20 ? 0.5 : 1}
                        band={[0, ceiling]}
                        unit="mg"
                        ariaLabel={t('common.amountAria', { name: rec?.name ?? '' })}
                        onChange={(n) => onRowChange(row.key, { amountMg: String(n) })}
                        onText={(raw) => onRowChange(row.key, { amountMg: raw })}
                      />
                    ) : (
                      <div className="field">
                        <span className="field-label">{t('composer.dose')}</span>
                        <NumberField
                          value={row.amountMg === '' ? null : row.amountMg}
                          unit="mg"
                          ariaLabel={t('common.amountAria', { name: rec?.name ?? '' })}
                          onChange={(raw) => onRowChange(row.key, { amountMg: raw })}
                        />
                      </div>
                    )}
                    {DOSABLE_SET.has(row.substanceId) &&
                      (() => {
                        const forms = listFormsForDrug(row.substanceId as DrugId)
                        if (forms.length === 0) return null
                        const current = row.form ?? ''
                        return (
                          <div className="field">
                            <span className="field-label">{t('composer.form')}</span>
                            <select
                              className="text-field"
                              value={current}
                              aria-label={t('pillcard.dosageForm')}
                              onChange={(e) => onRowChange(row.key, { form: e.target.value || undefined })}
                            >
                              {forms.map((f) => (
                                <option
                                  key={f.form}
                                  value={f.isReference ? '' : f.form}
                                  disabled={!f.existsRealWorld}
                                >
                                  {formOptionLabel(t, f)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })()}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="composer-add">
          <button type="button" className="btn" onClick={onAddRow}>
            {t('composer.addAnother')}
          </button>
          {rows.filter((r) => r.substanceId).length === 1 ? (
            <span className="dim" style={{ fontSize: 'var(--fs-xs)' }}>
              {t('composer.singleSubstanceHint')}
            </span>
          ) : null}
        </div>

        {children}

        <div className="composer-foot">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSave}
            title={saveHint}
            onClick={onSave}
          >
            {t('composer.saveToLibrary')}
          </button>
          <button type="button" className="btn" onClick={onClear}>
            {t('composer.clear')}
          </button>
          {saveHint ? <span className="dim">{saveHint}</span> : null}
        </div>
      </div>
    </Card>
  )
}
