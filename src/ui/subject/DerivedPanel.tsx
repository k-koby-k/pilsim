/**
 * Read-only derived state.
 *
 * The headline numbers used to live here. They now sit in the form itself, directly under
 * the inputs that produce them, because a value two columns away from its cause is a value
 * nobody watches change. What is left here is the evidence: which named state variables a
 * condition moved, the full derivation table, and the modifier audit trail.
 *
 * The one thing that must stay loud is the shift list: switching on a condition moves
 * NAMED state variables by visible amounts, and that is the difference between a twin and a
 * label on a chart. It is shown as soon as anything moves, and each row arrives with a
 * short motion so the reader sees WHICH rows are new.
 */

import { useState } from 'react'
import { useT, type DictKey } from '../../i18n'
import type { PatientState } from '../../types'
import type { Twin } from '../../rules/twin'
import { Consequence, Disclosure } from '../shell/primitives'
import { DerivedChip } from './controls'
import type { TwinSource } from './twinAdapter'

/**
 * Which part of the derived state to render.
 *
 * research/10-LAYOUT-BLUEPRINT.md §3 splits this panel's contents across two
 * zones of the Test subjects page, so the panel takes an explicit list rather
 * than deciding for itself where it belongs:
 *
 *   shifts   → EVIDENCE  which comorbidity moved which variable, and by how much.
 *   table    → DETAIL    the full derived state.
 *   audit    → DETAIL    the modifier-by-modifier derivation trail.
 *   warnings → DETAIL    anything the derivation itself flagged.
 *
 * The default is all four in the original order, so an existing call site that
 * passes no `sections` renders exactly what it always did.
 */
export type DerivedSection = 'shifts' | 'table' | 'audit' | 'warnings'

const ALL_DERIVED: DerivedSection[] = ['shifts', 'table', 'audit', 'warnings']

export interface DerivedPanelProps {
  twin: PatientState
  /** The same patient with no comorbidity preset applied — the diff baseline. */
  reference: PatientState
  source: TwinSource
  /** ckd_stage, cyp2d6_phenotype, cyp2c9_phenotype from the derivation pipeline. */
  categoricals: Record<string, string>
  /** The twin's own audit trail of which preset moved which variable. */
  presetEffects?: Twin['presetEffects']
  /** Which parts to render. Defaults to the whole panel. */
  sections?: DerivedSection[]
}

interface Readout {
  id: string
  labelKey: DictKey
  unit: string
  digits: number
  equation?: string
}

const SECONDARY: Readout[] = [
  { id: 'bsa_m2', labelKey: 'subj.readout.bsa', unit: 'm²', digits: 2, equation: 'Du Bois & Du Bois (1916)' },
  { id: 'bmi', labelKey: 'subj.readout.bmi', unit: 'kg/m²', digits: 1 },
  { id: 'lbw_kg', labelKey: 'subj.readout.lbw', unit: 'kg', digits: 1, equation: 'Janmahasatian (2005)' },
  { id: 'tbw_L', labelKey: 'subj.readout.tbw', unit: 'L', digits: 1, equation: 'Watson (1980)' },
  { id: 'plasma_volume_L', labelKey: 'subj.readout.plasmaVolume', unit: 'L', digits: 2, equation: 'Nadler (1962) × (1 − haematocrit)' },
  { id: 'map_mmHg', labelKey: 'subj.readout.map', unit: 'mmHg', digits: 1 },
  { id: 'cardiac_output_L_min', labelKey: 'subj.readout.cardiacOutput', unit: 'L/min', digits: 2 },
  { id: 'stroke_volume_mL', labelKey: 'subj.readout.strokeVolume', unit: 'mL', digits: 1 },
  { id: 'svr_dyn_s_cm5', labelKey: 'subj.readout.svr', unit: 'dyn·s·cm⁻⁵', digits: 0, equation: '80 × (MAP − CVP) / CO' },
  { id: 'arterial_compliance_mL_mmHg', labelKey: 'subj.readout.arterialCompliance', unit: 'mL/mmHg', digits: 2 },
  { id: 'egfr_ckdepi2021', labelKey: 'subj.readout.egfr', unit: 'mL/min/1.73 m²', digits: 0, equation: 'CKD-EPI 2021 — no race coefficient' },
  { id: 'egfr_absolute_mL_min', labelKey: 'subj.readout.absoluteGfr', unit: 'mL/min', digits: 1 },
  { id: 'crcl_cockcroft_gault_mL_min', labelKey: 'subj.readout.crcl', unit: 'mL/min', digits: 1, equation: 'Cockcroft–Gault' },
  { id: 'renal_blood_flow_mL_min', labelKey: 'subj.readout.renalBloodFlow', unit: 'mL/min', digits: 0 },
  { id: 'filtration_fraction', labelKey: 'subj.readout.filtrationFraction', unit: '', digits: 3 },
  { id: 'hepatic_blood_flow_L_min', labelKey: 'subj.readout.hepaticBloodFlow', unit: 'L/min', digits: 2 },
  { id: 'plasma_renin_activity_ng_mL_h', labelKey: 'subj.readout.plasmaReninActivity', unit: 'ng/mL/h', digits: 2 },
  { id: 'sympathetic_tone', labelKey: 'subj.readout.sympatheticTone', unit: '× baseline', digits: 2 },
  { id: 'allometric_cl_scalar', labelKey: 'subj.readout.allometricClScalar', unit: '', digits: 3, equation: '(weight/70)^0.75' },
]

const SHIFTS_SHOWN = 6

export function DerivedPanel({
  twin,
  reference,
  source,
  presetEffects = [],
  sections = ALL_DERIVED,
}: DerivedPanelProps) {
  const t = useT()
  const has = (x: DerivedSection) => sections.includes(x)
  const shifts = diff(reference.vars, twin.vars)
  const [showAll, setShowAll] = useState(false)
  const [showRest, setShowRest] = useState(false)
  const [showAudit, setShowAudit] = useState(false)

  const head = shifts.slice(0, SHIFTS_SHOWN)
  const rest = shifts.slice(SHIFTS_SHOWN)

  return (
    <div className="subj-derived">
      {has('shifts') && (
        <div className="subj-derived-head">
          <h3>{t('subject.derivedPanel.title')}</h3>
          <span className={`subj-source subj-source-${source === 'rules/twin.ts' ? 'engine' : 'fallback'}`}>
            {source === 'rules/twin.ts'
              ? t('subject.derivedPanel.source.engine')
              : t('subject.derivedPanel.source.fallback')}
          </span>
        </div>
      )}

      {has('shifts') && twin.appliedPresets.length === 0 && (
        <Consequence>{t('subject.group.conditionsNoneConsequence')}</Consequence>
      )}

      {has('shifts') && twin.appliedPresets.length > 0 && (
        <section className="subj-shifts">
          <h4>
            {t('subject.derivedPanel.whatMoved')}
            <span className="subj-shift-count">
              {t('subject.derivedPanel.stateVarCount', { n: shifts.length })}
            </span>
          </h4>
          {shifts.length === 0 ? (
            <p className="subj-note subj-note-warn">
              {t('subject.derivedPanel.nothingMoved')}
            </p>
          ) : (
            <>
              <ul className="subj-shift-list">
                {head.map((s) => (
                  <ShiftRow key={s.id} shift={s} />
                ))}
              </ul>
              {rest.length > 0 && (
                <Disclosure
                  summary={t('subject.derivedPanel.moreShifted')}
                  meta={`${rest.length}`}
                  open={showRest}
                  onToggle={() => setShowRest((v) => !v)}
                >
                  <ul className="subj-shift-list">
                    {rest.map((s) => (
                      <ShiftRow key={s.id} shift={s} />
                    ))}
                  </ul>
                </Disclosure>
              )}
            </>
          )}
        </section>
      )}

      {has('table') && (
      <Disclosure
        summary={t('subject.derivedPanel.allDerived')}
        meta={`${SECONDARY.length}`}
        open={showAll}
        onToggle={() => setShowAll((v) => !v)}
      >
        <table className="subj-table">
          <tbody>
            {SECONDARY.map((r) => {
              const v = twin.vars[r.id]
              const w = reference.vars[r.id]
              const moved = v !== undefined && w !== undefined && Math.abs(v - w) > Math.abs(w) * 1e-6
              return (
                <tr key={r.id} className={moved ? 'subj-moved' : undefined}>
                  <th scope="row" title={r.equation}>
                    {t(r.labelKey)}
                  </th>
                  <td>{v === undefined ? '—' : `${v.toFixed(r.digits)}${r.unit ? ` ${r.unit}` : ''}`}</td>
                  <td className="subj-was">
                    {moved && w !== undefined ? t('subject.derivedPanel.was', { value: w.toFixed(r.digits) }) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Disclosure>
      )}

      {has('audit') && presetEffects.length > 0 && (
        <Disclosure
          summary={t('subject.derivedPanel.auditTrail')}
          meta={`${presetEffects.length}`}
          open={showAudit}
          onToggle={() => setShowAudit((v) => !v)}
        >
          <ul className="subj-shift-list subj-audit-list">
            {presetEffects.map((e, i) => (
              <li key={`${e.preset}-${e.target}-${i}`}>
                <code>{e.target}</code>
                <span className="subj-shift-from">{fmt(e.before)}</span>
                <span className={`subj-arrow ${e.after > e.before ? 'up' : 'down'}`}>{e.after > e.before ? '↑' : '↓'}</span>
                <span className="subj-shift-to">{fmt(e.after)}</span>
                <span className="subj-shift-pct">
                  {e.preset} · {e.op} {e.value}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {has('warnings') && twin.warnings.length > 0 && (
        <section className="subj-warnings">
          <h4>{t('subject.derivedPanel.warnings')}</h4>
          <ul>
            {twin.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * The ANSWER zone of the Test subjects page — blueprint §3: "the derived twin:
 * the headline physiology this patient implies".
 *
 * Every figure here is read straight out of `twin.vars` and `categoricals`,
 * which the derivation pipeline has already produced for the rail and for the
 * form's inline chips. Nothing is computed, re-derived or rounded differently
 * here; this is a placement, not a calculation. The source badge travels with
 * it because a twin that will not say which derivation produced it is exactly
 * the black box this page exists to avoid.
 */
export function TwinHeadline({
  twin,
  reference,
  source,
  categoricals,
}: {
  twin: PatientState
  reference: PatientState
  source: TwinSource
  categoricals: Record<string, string>
}) {
  const t = useT()
  const d = (id: string) => twin.vars[id]
  const w = (id: string) => reference.vars[id]

  return (
    <div className="subj-headline">
      <div className="subj-derived-head">
        <h3>{t('subject.headline.title')}</h3>
        <span className={`subj-source subj-source-${source === 'rules/twin.ts' ? 'engine' : 'fallback'}`}>
          {source === 'rules/twin.ts'
            ? t('subject.derivedPanel.source.engine')
            : t('subject.derivedPanel.source.fallback')}
        </span>
      </div>

      <div className="subj-derived-row">
        <DerivedChip
          label={t('subj.readout.egfr')}
          value={d('egfr_ckdepi2021')}
          was={w('egfr_ckdepi2021')}
          unit="mL/min/1.73 m²"
          digits={0}
          title="CKD-EPI 2021 — no race coefficient"
        />
        {categoricals.ckd_stage && (
          <DerivedChip label={t('subject.derived.ckdStage')} text={categoricals.ckd_stage} />
        )}
        <DerivedChip
          label={t('subj.readout.map')}
          value={d('map_mmHg')}
          was={w('map_mmHg')}
          unit="mmHg"
          digits={0}
        />
        <DerivedChip
          label={t('subj.readout.cardiacOutput')}
          value={d('cardiac_output_L_min')}
          was={w('cardiac_output_L_min')}
          unit="L/min"
          digits={2}
        />
        <DerivedChip
          label={t('subject.derived.hepaticGate')}
          value={d('cyp2d6_pathway_multiplier')}
          was={w('cyp2d6_pathway_multiplier')}
          unit="× normal"
          digits={2}
        />
        {categoricals.cyp2d6_phenotype && (
          <DerivedChip
            label={t('subject.derived.cyp2d6Phenotype')}
            text={categoricals.cyp2d6_phenotype}
          />
        )}
      </div>

      <p className="subj-note">{t('subject.headline.untreated')}</p>
    </div>
  )
}

function ShiftRow({ shift }: { shift: Shift }) {
  return (
    <li>
      <code>{shift.id}</code>
      <span className="subj-shift-from">{fmt(shift.from)}</span>
      <span className={`subj-arrow ${shift.to > shift.from ? 'up' : 'down'}`}>{shift.to > shift.from ? '↑' : '↓'}</span>
      <span className="subj-shift-to">{fmt(shift.to)}</span>
      <span className="subj-shift-pct">{shift.from === 0 ? '' : `${((shift.to / shift.from - 1) * 100).toFixed(1)} %`}</span>
    </li>
  )
}

interface Shift {
  id: string
  from: number
  to: number
}

function diff(from: Record<string, number>, to: Record<string, number>): Shift[] {
  const out: Shift[] = []
  for (const id of Object.keys(to)) {
    const a = from[id]
    const b = to[id]
    if (typeof a !== 'number' || typeof b !== 'number') continue
    if (Math.abs(b - a) <= Math.max(1e-9, Math.abs(a) * 1e-6)) continue
    out.push({ id, from: a, to: b })
  }
  return out.sort((x, y) => Math.abs(y.to / (y.from || 1) - 1) - Math.abs(x.to / (x.from || 1) - 1))
}

function fmt(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1000) return v.toFixed(0)
  if (abs >= 10) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}
