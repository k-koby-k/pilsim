/**
 * The one thing this page needs that the shared form primitives do not provide: a derived
 * value that shows itself moving.
 *
 * Every editable control on the subject page comes from `src/ui/shell/fields` — the
 * spinner-free NumberField, the SliderField with its sourced band, the Segmented control —
 * so this form looks like every other form in the product. What is local is the READ-ONLY
 * side: switch on a comorbidity and named state variables move, and that movement is the
 * whole argument of the page. It used to happen between two frames, which is to say
 * invisibly. Now the figure eases from its old value to its new one and stays marked for a
 * moment afterwards, so the reader sees WHICH numbers the condition touched.
 *
 * Reduced motion jumps straight to the value and keeps the marker: the information is in
 * the marker, the delight is in the tween, and only the second one is optional.
 */

import { useEffect, useRef, useState } from 'react'

function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Eases `target` from its previous value, and reports while it is on the move. */
export function useTweenedNumber(target: number | undefined, ms = 460): { shown?: number; moving: boolean } {
  const [shown, setShown] = useState<number | undefined>(target)
  const [moving, setMoving] = useState(false)
  const from = useRef<number | undefined>(target)
  const raf = useRef<number | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const start = from.current
    from.current = target

    if (target === undefined || start === undefined || start === target) {
      setShown(target)
      return
    }

    setMoving(true)
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setMoving(false), ms + 600)

    if (reducedMotion()) {
      setShown(target)
      return
    }

    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(start + (target - start) * eased)
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [target, ms])

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      if (settle.current) clearTimeout(settle.current)
    },
    [],
  )

  return { shown, moving }
}

export function AnimatedNumber({
  value,
  digits = 0,
  placeholder = '—',
}: {
  value: number | undefined
  digits?: number
  placeholder?: string
}) {
  const { shown, moving } = useTweenedNumber(value)
  return (
    <span className={`num${moving ? ' is-moving' : ''}`}>
      {shown === undefined ? placeholder : shown.toFixed(digits)}
    </span>
  )
}

/**
 * One derived value shown next to the input that produced it: label, animated figure,
 * unit, and — when a condition has moved it — what it was before.
 */
export function DerivedChip({
  label,
  value,
  unit,
  digits = 0,
  was,
  title,
  text,
}: {
  label: string
  value?: number
  unit?: string
  digits?: number
  was?: number
  title?: string
  /** A categorical value — a CKD stage, a phenotype — shown instead of a number. */
  text?: string
}) {
  const moved =
    text === undefined && value !== undefined && was !== undefined && Math.abs(value - was) > Math.abs(was) * 1e-6
  return (
    <span className={`dchip${moved ? ' is-moved' : ''}`} title={title}>
      <span className="dchip-label">{label}</span>
      <span className="dchip-value">
        {text !== undefined ? text : <AnimatedNumber value={value} digits={digits} />}
        {unit && text === undefined && <span className="dchip-unit">{unit}</span>}
      </span>
      {moved && was !== undefined && <span className="dchip-was">was {was.toFixed(digits)}</span>}
    </span>
  )
}
