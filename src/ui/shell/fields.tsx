/**
 * Shared form primitives. Owned by Agent UI-A (src/ui/shell/**), free for any UI
 * agent to import — and the ONLY sanctioned way to render an editable value:
 *
 *     import { NumberField, SliderField, Segmented, TextField } from '../shell/fields'
 *
 * Why these exist. A parameter that can be changed must LOOK changeable at a glance,
 * and it must not look like a browser default while doing it. Native number spinners
 * are suppressed product-wide (see styles.css); nothing in PilSim should ever show
 * those up/down arrows.
 *
 * Choosing a control — deliberately, per parameter:
 *   SliderField   the range is bounded and meaningful (a dose inside its approved
 *                 range, a fraction 0..1, a weight). `band` paints the sourced range
 *                 on the track so an expert can feel where the evidence sits.
 *   NumberField   an exact value matters, or the range is open-ended.
 *   Segmented     two to four exclusive options. Never more.
 *   TextField     free text.
 *
 * Every control is --control-h tall, so a row of mixed controls lines up.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useT } from '../../i18n'

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

export function NumberField({
  value,
  onChange,
  unit,
  placeholder,
  min,
  max,
  step = 'any',
  size = 'md',
  full,
  modified,
  disabled,
  ariaLabel,
  title,
}: {
  /** `null` renders empty. Strings pass through unchanged so a half-typed "0." survives. */
  value: number | string | null
  /** Raw field text. Empty string means "cleared" — the caller decides what that is. */
  onChange: (raw: string) => void
  unit?: string | null
  placeholder?: string
  min?: number
  max?: number
  step?: number | 'any'
  /** `lg` is the headline value on a card detail. */
  size?: 'md' | 'lg'
  full?: boolean
  /** Paint it as a user override. */
  modified?: boolean
  disabled?: boolean
  ariaLabel?: string
  title?: string
}) {
  // While the field has focus the user's own text wins, so a half-typed "1." or a
  // cleared field survives the round trip through a numeric store.
  const [draft, setDraft] = useState<string | null>(null)
  const external = value === null || value === undefined ? '' : String(value)
  const text = draft ?? external
  const pulse = useExternalChangePulse(external) && draft === null

  const cls = [
    'num-field',
    size === 'lg' ? 'num-field--lg' : '',
    full ? 'num-field--full' : '',
    modified ? 'num-field--modified' : '',
    pulse ? 'num-field--pulse' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={cls} title={title}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        placeholder={placeholder ?? '—'}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
        onBlur={() => setDraft(null)}
      />
      {unit ? <span className="num-field-unit">{unit}</span> : null}
    </span>
  )
}

/**
 * A short highlight when a value changes from outside the field — a revert, a preset,
 * a value arriving from another panel. Typing does not trigger it, because the user
 * already knows what they typed.
 */
function useExternalChangePulse(text: string): boolean {
  const prev = useRef(text)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (prev.current === text) return
    prev.current = text
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 340)
    return () => clearTimeout(t)
  }, [text])

  return pulse
}

// ---------------------------------------------------------------------------
// SliderField
// ---------------------------------------------------------------------------

export function SliderField({
  label,
  value,
  onChange,
  onText,
  min,
  max,
  step,
  unit,
  band,
  modified,
  right,
  ariaLabel,
}: {
  label?: ReactNode
  value: number | null
  /** Fires on drag with a clamped number. */
  onChange: (n: number) => void
  /** Fires from the paired readout with raw text, so it can be cleared. */
  onText?: (raw: string) => void
  min: number
  max: number
  step?: number
  unit?: string | null
  /** The sourced range, painted on the track. */
  band?: [number, number] | null
  modified?: boolean
  /** Rendered at the right of the label row — a chip, a revert button. */
  right?: ReactNode
  ariaLabel?: string
}) {
  const t = useT()
  const id = useId()
  const span = max - min || 1
  const at = value === null ? min : Math.min(max, Math.max(min, value))
  const pct = ((at - min) / span) * 100
  const bandLeft = band ? ((Math.max(min, band[0]) - min) / span) * 100 : 0
  const bandRight = band ? ((Math.min(max, band[1]) - min) / span) * 100 : 0

  return (
    <div className={modified ? 'slider slider--modified' : 'slider'}>
      {label || right ? (
        <div className="slider-top">
          <label className="field-label" htmlFor={id}>
            {label}
          </label>
          <NumberField
            value={value}
            onChange={(raw) => (onText ? onText(raw) : onChange(Number(raw)))}
            unit={unit}
            min={min}
            ariaLabel={ariaLabel}
            modified={modified}
          />
        </div>
      ) : null}

      <div className="slider-track">
        <span className="slider-rail" />
        {band && bandRight > bandLeft ? (
          <span
            className="slider-band"
            style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }}
            title={t('common.sourcedRangeTitle', { lo: band[0], hi: band[1], unit: unit ? ` ${unit}` : '' })}
          />
        ) : null}
        <span className="slider-fill" style={{ width: `${value === null ? 0 : pct}%` }} />
        <input
          id={id}
          className="slider-input"
          type="range"
          min={min}
          max={max}
          step={step ?? (max - min) / 100}
          value={at}
          aria-label={ariaLabel}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      <div className="slider-scale">
        <span>{format(min)}</span>
        {right ? <span>{right}</span> : null}
        <span>
          {format(max)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    </div>
  )
}

function format(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toPrecision(3)))
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** Extra modifier class, e.g. a provenance status. */
  variant?: string
  title?: string
}

/** Exclusive choice, two to four options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          className={o.variant ? `seg-btn seg-btn--${o.variant}` : 'seg-btn'}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The same control shape for independent on/off filters. */
export function SegmentedToggles<T extends string>({
  options,
  values,
  onToggle,
  ariaLabel,
}: {
  options: SegmentOption<T>[]
  values: T[]
  onToggle: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          className={o.variant ? `seg-btn seg-btn--${o.variant}` : 'seg-btn'}
          aria-pressed={values.includes(o.value)}
          onClick={() => onToggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TextField + the label wrapper
// ---------------------------------------------------------------------------

export function TextField({
  value,
  onChange,
  placeholder,
  size = 'md',
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  size?: 'md' | 'lg'
  ariaLabel?: string
}) {
  return (
    <input
      className={size === 'lg' ? 'text-field text-field--lg' : 'text-field'}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Label above, control below, footer under it. The rhythm of every form. */
export function FieldShell({
  label,
  right,
  foot,
  children,
}: {
  label?: ReactNode
  right?: ReactNode
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="field">
      {label || right ? (
        <div className="field-label">
          <span className="grow">{label}</span>
          {right}
        </div>
      ) : null}
      {children}
      {foot ? <div className="field-foot">{foot}</div> : null}
    </div>
  )
}
