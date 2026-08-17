/**
 * The subject editor form. Humans only — the model is validated for adults and the
 * paediatric maturation functions are not implemented, so age is bounded accordingly.
 *
 * ONE COLUMN, CAUSE BESIDE EFFECT. The form is a single stack of full-width groups, and
 * each group carries the derived values ITS inputs produce, directly underneath them:
 * body size gives BSA, the vitals give mean pressure and cardiac output, creatinine gives
 * eGFR. Moving a slider therefore moves a number the reader is already looking at rather
 * than one two columns away, and those numbers ease into their new value and stay marked
 * for a moment, so the movement is impossible to miss.
 *
 * CONTROLS. Every editable value uses the shared primitives in src/ui/shell/fields — a
 * bounded physiological quantity is a track you can feel, not a box with spinner arrows.
 * Bounds and step come from data/patient_model.json where it states them, and the band
 * painted on a track is that field's `reference_range` — shown only where the model gives
 * one, never invented, so a creatinine above the laboratory range reads as high without a
 * word of explanation.
 *
 * The CYP2D6 control is the one thing given extra weight, because it is the single most
 * consequential input in the product: metoprolol stops being β1-selective above 80.2 ng/mL,
 * and a poor metaboliser reaches that on a standard dose while a normal metaboliser does not.
 *
 * EVERY GROUP SAYS WHY IT IS ASKED. research/10-LAYOUT-BLUEPRINT.md §7 patterns 1 and 2, and
 * the single biggest gap it found: named groups are not enough on their own. Asking for serum
 * creatinine and saying nothing about what it is for is what makes a form feel arbitrary, so
 * each group here carries one plain line describing what the PRODUCT does with it — creatinine
 * sets eGFR, which decides whether a drug is dose-reduced or avoided. Those lines are derived
 * from the derivation pipeline and the rules that read it; none of them is a clinical claim
 * this file invented.
 */

import type { ReactNode } from 'react'
import { useT, type DictKey } from '../../i18n'
import type { PatientInputs, PatientState, Sex } from '../../types'
import { Consequence, QuickJump } from '../shell/primitives'
import { Segmented, SliderField } from '../shell/fields'
import { DerivedChip } from './controls'
import {
  findField,
  GRADE_INPUT_KEY,
  presetGrades,
  presetModifiers,
  type PatientModelFile,
} from './patientModel'

const PHENOTYPE_KEY: Record<string, DictKey> = {
  Poor: 'subject.phenotype.poor',
  Intermediate: 'subject.phenotype.intermediate',
  Normal: 'subject.phenotype.normal',
  Ultrarapid: 'subject.phenotype.ultrarapid',
}

export interface ParameterPanelProps {
  inputs: PatientInputs
  onChange: (patch: Partial<PatientInputs>) => void
  model: PatientModelFile | null
  /** The twin these inputs derive, so each group can show what it produced. */
  twin: PatientState
  /** The same patient with no condition applied — the "was" figure. */
  reference: PatientState
  /** ckd_stage, cyp2d6_phenotype, cyp2c9_phenotype. */
  categoricals: Record<string, string>
}

/** CYP2D6 bins, quoted from CPIC 2024 via data/patient_model.json. */
const CYP2D6_OPTIONS: Array<{ score: number; phenotype: string; gate: number }> = [
  { score: 0, phenotype: 'Poor', gate: 0.0 },
  { score: 1.0, phenotype: 'Intermediate', gate: 0.5 },
  { score: 2.0, phenotype: 'Normal', gate: 1.0 },
  { score: 3.0, phenotype: 'Ultrarapid', gate: 1.6 },
]

const CYP2C9_OPTIONS: Array<{ score: number; label: string }> = [
  { score: 0, label: 'Poor' },
  { score: 1, label: 'Intermediate' },
  { score: 2, label: 'Normal' },
]

export function ParameterPanel({
  inputs,
  onChange,
  model,
  twin,
  reference,
  categoricals,
}: ParameterPanelProps) {
  const t = useT()
  const presets = model?.comorbidity_presets ?? {}
  const presetIds = Object.keys(presets).filter((k) => !k.startsWith('_'))
  const activityScore = numOr(inputs.cyp2d6_activity_score, 2.0)
  const chosen = binOf(activityScore)
  const conditionCount = (inputs.comorbidities ?? []).length

  const bound = (id: string, fallback: { min: number; max: number; step: number }) => {
    const f = findField(model, id)
    return {
      min: typeof f?.min === 'number' ? f.min : fallback.min,
      max: typeof f?.max === 'number' ? f.max : fallback.max,
      step: typeof f?.step === 'number' ? f.step : fallback.step,
    }
  }
  const band = (id: string): [number, number] | null => {
    const r = findField(model, id)?.reference_range
    return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : null
  }

  const hrBand = band('heart_rate_bpm')
  const scrBand = band('scr_mg_dL')

  const d = (id: string) => twin.vars[id]
  const w = (id: string) => reference.vars[id]

  return (
    <div className="subj-form">
      {/* Forward motion inside long content — blueprint §7 pattern 5. Six groups
          is more than one screen, so the reader can always see the rest of the
          form and reach it without scrolling blind. */}
      <QuickJump
        ariaLabel={t('subject.form.quickJumpAria')}
        items={[
          { id: GROUP_ID.who, label: t('subject.group.who') },
          { id: GROUP_ID.body, label: t('subject.group.body') },
          { id: GROUP_ID.circulation, label: t('subject.group.circulation') },
          { id: GROUP_ID.kidney, label: t('subject.group.kidney') },
          { id: GROUP_ID.genotype, label: t('subject.group.genotype') },
          { id: GROUP_ID.conditions, label: t('subject.group.conditions') },
        ]}
      />

      {/* ------------------------------------------------------------- who --- */}
      <Group id={GROUP_ID.who} title={t('subject.group.who')} why={t('subject.group.whoWhy')}>
        <div className="subj-row">
          <div className="field">
            <div className="field-label">
              <b>{t('subject.sexAtBirth')}</b>
              <span title={t('subject.sexTitle')}>
                {t('subject.sexCovariate')}
              </span>
            </div>
            <Segmented
              ariaLabel={t('subject.sexAtBirth')}
              value={inputs.sex}
              onChange={(v) => onChange({ sex: v as Sex })}
              options={[
                { value: 'male', label: t('subject.male') },
                { value: 'female', label: t('subject.female') },
              ]}
            />
          </div>

          <div className="field">
            <div className="field-label">
              <b>{t('subject.pregnant')}</b>
              <span>{t('subject.pregnantGateHint')}</span>
            </div>
            {inputs.sex === 'female' ? (
              <Segmented
                ariaLabel={t('subject.pregnant')}
                value={inputs.pregnant ? 'yes' : 'no'}
                onChange={(v) => onChange({ pregnant: v === 'yes' })}
                options={[
                  { value: 'no', label: t('subject.no') },
                  { value: 'yes', label: t('subject.yes') },
                ]}
              />
            ) : (
              <p className="subj-note">{t('common.na')}</p>
            )}
          </div>
        </div>

        <SliderField
          label={<b>{t('subject.age')}</b>}
          ariaLabel={t('subject.age')}
          unit="yr"
          value={inputs.age_years}
          {...bound('age_years', { min: 18, max: 95, step: 1 })}
          onChange={(v) => onChange({ age_years: v })}
          right={<span className="subj-band-note">{t('subject.ageHint')}</span>}
        />
      </Group>

      {/* ------------------------------------------------------------ body --- */}
      <Group id={GROUP_ID.body} title={t('subject.group.body')} why={t('subject.group.bodyWhy')}>
        <SliderField
          label={<b>{t('subject.weight')}</b>}
          ariaLabel={t('subject.weight')}
          unit="kg"
          value={inputs.weight_kg}
          {...bound('weight_kg', { min: 35, max: 200, step: 0.5 })}
          onChange={(v) => onChange({ weight_kg: v })}
        />
        <SliderField
          label={<b>{t('subject.height')}</b>}
          ariaLabel={t('subject.height')}
          unit="cm"
          value={inputs.height_cm}
          {...bound('height_cm', { min: 140, max: 210, step: 1 })}
          onChange={(v) => onChange({ height_cm: v })}
        />
        <Derived>
          <DerivedChip label={t('subject.derived.bsa')} value={d('bsa_m2')} was={w('bsa_m2')} unit="m²" digits={2} title="Du Bois & Du Bois (1916)" />
          <DerivedChip label={t('subject.derived.bmi')} value={d('bmi')} was={w('bmi')} unit="kg/m²" digits={1} />
          <DerivedChip label={t('subject.derived.bodyWater')} value={d('tbw_L')} was={w('tbw_L')} unit="L" digits={1} title="Watson (1980)" />
        </Derived>
      </Group>

      {/* ----------------------------------------------------- circulation --- */}
      <Group
        id={GROUP_ID.circulation}
        title={t('subject.group.circulation')}
        why={t('subject.group.circulationWhy')}
      >
        <SliderField
          label={<b>{t('subject.systolic')}</b>}
          ariaLabel={t('subject.systolic')}
          unit="mmHg"
          value={inputs.sbp_mmHg}
          {...bound('sbp_mmHg', { min: 70, max: 250, step: 1 })}
          onChange={(v) => onChange({ sbp_mmHg: v })}
        />
        <SliderField
          label={<b>{t('subject.diastolic')}</b>}
          ariaLabel={t('subject.diastolic')}
          unit="mmHg"
          value={inputs.dbp_mmHg}
          {...bound('dbp_mmHg', { min: 40, max: 150, step: 1 })}
          onChange={(v) => onChange({ dbp_mmHg: v })}
        />
        <SliderField
          label={<b>{t('subject.heartRate')}</b>}
          ariaLabel={t('subject.heartRate')}
          unit="bpm"
          value={numOr(inputs.hr_bpm, 70)}
          {...bound('heart_rate_bpm', { min: 30, max: 180, step: 1 })}
          band={hrBand}
          onChange={(v) => onChange({ hr_bpm: v })}
          right={
            hrBand ? (
              <span className="subj-band-note">
                {t('subject.reference', { lo: hrBand[0], hi: hrBand[1] })}
              </span>
            ) : undefined
          }
        />
        <Derived>
          <DerivedChip label={t('subject.derived.meanPressure')} value={d('map_mmHg')} was={w('map_mmHg')} unit="mmHg" digits={0} />
          <DerivedChip label={t('subject.derived.cardiacOutput')} value={d('cardiac_output_L_min')} was={w('cardiac_output_L_min')} unit="L/min" digits={2} />
          <DerivedChip
            label={t('subject.derived.vascularResistance')}
            value={d('svr_dyn_s_cm5')}
            was={w('svr_dyn_s_cm5')}
            unit="dyn·s·cm⁻⁵"
            digits={0}
            title="80 × (MAP − CVP) / CO"
          />
        </Derived>
      </Group>

      {/* ---------------------------------------------------------- kidney --- */}
      <Group id={GROUP_ID.kidney} title={t('subject.group.kidney')} why={t('subject.group.kidneyWhy')}>
        <SliderField
          label={<b>{t('subject.serumCreatinine')}</b>}
          ariaLabel={t('subject.serumCreatinine')}
          unit="mg/dL"
          value={numOr(inputs.serum_creatinine_mg_dl, inputs.sex === 'female' ? 0.7 : 0.9)}
          min={0.2}
          max={12}
          step={0.05}
          band={scrBand}
          onChange={(v) => onChange({ serum_creatinine_mg_dl: v })}
          right={
            scrBand ? (
              <span className="subj-band-note">
                {t('subject.reference', { lo: scrBand[0], hi: scrBand[1] })}
              </span>
            ) : undefined
          }
        />
        <Derived>
          <DerivedChip
            label={t('subject.derived.egfr')}
            value={d('egfr_ckdepi2021')}
            was={w('egfr_ckdepi2021')}
            unit="mL/min/1.73 m²"
            digits={0}
            title="CKD-EPI 2021 — no race coefficient"
          />
          <DerivedChip
            label={t('subject.derived.renalBloodFlow')}
            value={d('renal_blood_flow_mL_min')}
            was={w('renal_blood_flow_mL_min')}
            unit="mL/min"
            digits={0}
          />
          {categoricals.ckd_stage && <DerivedChip label={t('subject.derived.ckdStage')} text={categoricals.ckd_stage} />}
        </Derived>
      </Group>

      {/* -------------------------------------------------------- genotype --- */}
      <Group
        id={GROUP_ID.genotype}
        title={t('subject.group.genotype')}
        why={t('subject.group.genotypeWhy')}
      >
        <div className="subj-row">
          <div className="field">
            <div className="field-label">
              <b>{t('subject.cyp2d6')}</b>
              <span>{t('subject.cyp2d6Hint')}</span>
            </div>
            <Segmented
              ariaLabel={t('subject.derived.cyp2d6Phenotype')}
              value={chosen}
              onChange={(phenotype) => {
                const o = CYP2D6_OPTIONS.find((x) => x.phenotype === phenotype)
                if (!o) return
                onChange({
                  cyp2d6_activity_score: o.score,
                  cyp2d6: o.phenotype.toLowerCase() as PatientInputs['cyp2d6'],
                })
              }}
              options={CYP2D6_OPTIONS.map((o) => ({
                value: o.phenotype,
                title: t('subject.cyp2d6GateTitle', { gate: o.gate.toFixed(2) }),
                label: (
                  <span className="subj-seg-two">
                    <span>{t(PHENOTYPE_KEY[o.phenotype] ?? 'subject.phenotype.normal')}</span>
                    <span className="subj-seg-sub">{o.gate.toFixed(2)}×</span>
                  </span>
                ),
              }))}
            />
          </div>

          <div className="field">
            <div className="field-label">
              <b>{t('subject.cyp2c9')}</b>
              <span>{t('subject.cyp2c9Hint')}</span>
            </div>
            <Segmented
              ariaLabel={t('subj.cyp2c9Activity')}
              value={String(nearestC9(numOr(inputs.cyp2c9_activity_score, 2)))}
              onChange={(v) => {
                const s = Number(v)
                onChange({
                  cyp2c9_activity_score: s,
                  cyp2c9: (s === 2 ? 'normal' : s >= 1 ? 'intermediate' : 'poor') as PatientInputs['cyp2c9'],
                })
              }}
              options={CYP2C9_OPTIONS.map((o) => ({
                value: String(o.score),
                label: t(PHENOTYPE_KEY[o.label] ?? 'subject.phenotype.normal'),
              }))}
            />
          </div>
        </div>
        <Derived>
          <DerivedChip
            label={t('subject.derived.hepaticGate')}
            value={d('cyp2d6_pathway_multiplier')}
            was={w('cyp2d6_pathway_multiplier')}
            unit="× normal"
            digits={2}
          />
          {categoricals.cyp2d6_phenotype && (
            <DerivedChip label={t('subject.derived.cyp2d6Phenotype')} text={categoricals.cyp2d6_phenotype} />
          )}
        </Derived>
      </Group>

      {/* ------------------------------------------------------ conditions --- */}
      <Group
        id={GROUP_ID.conditions}
        title={t('subject.group.conditions')}
        note={
          conditionCount > 0
            ? t('subject.group.conditionsOn', { n: conditionCount })
            : t('subject.group.conditionsOff')
        }
        why={t('subject.group.conditionsWhy')}
      >
        {!model && (
          <p className="subj-note subj-note-warn">
            {t('subject.modelNotLoaded')}
          </p>
        )}

        {/* An empty state that states the CONSEQUENCE, not the absence —
            blueprint §7 pattern 3, in the exact case it names. */}
        {conditionCount === 0 && (
          <Consequence>{t('subject.group.conditionsNoneConsequence')}</Consequence>
        )}
        <div className="subj-cond-grid">
          {presetIds.map((id) => {
            const preset = presets[id]
            if (!preset) return null
            const isOn = (inputs.comorbidities ?? []).includes(id)
            const gradeOptions = presetGrades(preset)
            const gradeKey = GRADE_INPUT_KEY[id] ?? `${id}_grade`
            const grade = String(inputs[gradeKey] ?? gradeOptions[0] ?? '')
            const mods = presetModifiers(preset, grade)
            return (
              <div key={id} className={`subj-cond${isOn ? ' subj-cond-on' : ''}`}>
                <label className="subj-check">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(e) => {
                      const set = new Set(inputs.comorbidities ?? [])
                      if (e.target.checked) set.add(id)
                      else set.delete(id)
                      onChange({ comorbidities: [...set] })
                    }}
                  />
                  <span className="subj-cond-label">{str(preset.label) || id}</span>
                  {isOn && mods.length > 0 && (
                    <span className="subj-cond-count">{t('subject.modifierCount', { n: mods.length })}</span>
                  )}
                </label>
                {isOn && gradeOptions.length > 0 && (
                  <select
                    className="text-field subj-cond-grade"
                    value={grade}
                    onChange={(e) => onChange({ [gradeKey]: e.target.value })}
                    aria-label={t('subj.condition.gradeAria', { label: str(preset.label) || id })}
                  >
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </Group>
    </div>
  )
}

// --------------------------------------------------------------------------- bits

/** Anchor ids for the six groups, so the quick jump above the form can reach them. */
const GROUP_ID = {
  who: 'subj-g-who',
  body: 'subj-g-body',
  circulation: 'subj-g-circulation',
  kidney: 'subj-g-kidney',
  genotype: 'subj-g-genotype',
  conditions: 'subj-g-conditions',
} as const

/**
 * A NAMED GROUP that says WHY it is asked. `why` is not optional in spirit: a
 * group of inputs with no statement of what the product does with them is the
 * exact thing the blueprint calls out, so add the line rather than the group.
 */
function Group({
  id,
  title,
  note,
  why,
  children,
}: {
  id?: string
  title: string
  note?: string
  why?: string
  children: ReactNode
}) {
  return (
    <section className="subj-group" id={id}>
      <h4 className="subj-group-title">
        {title}
        {note && <span className="subj-group-note">{note}</span>}
      </h4>
      {why && <p className="subj-group-why">{why}</p>}
      <div className="subj-group-body">{children}</div>
    </section>
  )
}

/** The derived consequences of the group above, on the same card as their cause. */
function Derived({ children }: { children: ReactNode }) {
  return <div className="subj-derived-row">{children}</div>
}

function binOf(score: number): string {
  if (score > 2.25) return 'Ultrarapid'
  if (score >= 1.25) return 'Normal'
  if (score > 0) return 'Intermediate'
  return 'Poor'
}

/** Legacy subjects may carry 0.5 or 1.5; snap them onto the three named bins. */
function nearestC9(score: number): number {
  if (score >= 1.75) return 2
  if (score >= 0.75) return 1
  return 0
}

/** The shared ComorbidityPreset type carries most fields as `unknown`. */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
