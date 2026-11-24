/**
 * A field of a setting with a number (fields.ts): the same limits as the schema, a value refused with its message, saved
 * on leaving the field or Enter (spec „Każdy limit w schemacie ma taki sam limit w polu edycji”).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { checkField, formatField, parseField, type FieldKind } from '@shared/model/fields'
import { CommitField, type ErrorPlacement } from '../../components/fields'

/** Quiet after the last turn of the wheel – then the gesture is one save. */
export const WHEEL_COMMIT_MS = 400
/** How long the number the wheel set stays shown while the saved one does not change (a refused save, one without an echo). */
export const WHEEL_SHOWN_MS = 5000
/** A turn of the wheel with Shift (N8). */
export const WHEEL_BIG = 10

/**
 * The mouse wheel over a number (N8, T2550): ±1, with Shift ±`WHEEL_BIG`, cut to `range`. The field shows its own number while the wheel
 * turns (`shown`; each turn counts from it, from `value` when there is none) and saves it ONCE per gesture – `WHEEL_COMMIT_MS` after the
 * last turn, at once on leaving the field (`flush`) and on unmount; a number equal to the saved one is not saved. The own number goes
 * when `value` changes from outside (the echo of the save, [−], „Cofnij”, another computer) or `WHEEL_SHOWN_MS` after the save with
 * `value` unchanged (refused); that fade runs only while nothing waits to be saved (each turn stops it). The echo of this hook's own save
 * during the next gesture only moves the start (that gesture stands).
 * `mode` (T2551): `'gesture'` – the above (a save that lasts: Settings, the tile's window); `'step'` – every turn is `commit`ed at once from
 * the number shown (a form with its own state, read by „Zastosuj” / Enter / „Zapisz” at any moment); no waiting, no `flush`.
 */
export type WheelMode = 'gesture' | 'step'

export function useWheelValue(value: number, range: readonly [number, number], commit: (v: number) => void, mode: WheelMode = 'gesture') {
  // `own.base` – the saved value the own number started from; `pending` – the number turned and not saved yet; `sent` – the last saved one.
  const [own, setOwn] = useState<{ v: number; base: number } | null>(null)
  const ownRef = useRef(own)
  const pending = useRef<number | null>(null)
  const sent = useRef<number | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ value, commit })
  useLayoutEffect(() => {
    latest.current = { value, commit }
  })
  const set = (next: { v: number; base: number } | null) => {
    ownRef.current = next
    setOwn(next)
  }
  const drop = () => {
    clearTimeout(commitTimer.current)
    clearTimeout(shownTimer.current)
    pending.current = null
    sent.current = null
    set(null)
  }
  /** Sends the number turned, when it differs from the saved one; the own number stays shown for `WHEEL_SHOWN_MS`. */
  const send = (then: 'keep' | 'unmount') => {
    clearTimeout(commitTimer.current)
    const v = pending.current
    pending.current = null
    const base = ownRef.current?.base
    if (v == null || base == null) return
    if (v === base) {
      if (then === 'keep') drop()
      return
    }
    sent.current = v
    latest.current.commit(v)
    if (then === 'keep') {
      clearTimeout(shownTimer.current)
      shownTimer.current = setTimeout(fade, WHEEL_SHOWN_MS)
    }
  }
  /** The own number fades 5 s after the save – only when no turn waits (a turn stops the fade, its save starts it again). */
  const fade = () => {
    if (pending.current == null) drop()
  }
  // `value` came from outside: the own number goes – except the echo of this hook's own save while the next gesture is on (it moves the start).
  useLayoutEffect(() => {
    const o = ownRef.current
    if (!o || value === o.base) return
    if (value === sent.current && pending.current != null) set({ v: o.v, base: value })
    else drop()
  }, [value])
  useEffect(
    () => () => {
      clearTimeout(shownTimer.current)
      send('unmount')
    },
    []
  )
  const step = (dir: 1 | -1, big: boolean) => {
    const o = ownRef.current
    const from = o && o.base === latest.current.value ? o.v : latest.current.value
    const next = Math.min(range[1], Math.max(range[0], from + dir * (big ? WHEEL_BIG : 1)))
    if (next === from) return
    clearTimeout(shownTimer.current)
    clearTimeout(commitTimer.current)
    set({ v: next, base: o && o.base === latest.current.value ? o.base : latest.current.value })
    if (mode === 'step') {
      sent.current = next
      latest.current.commit(next)
      shownTimer.current = setTimeout(fade, WHEEL_SHOWN_MS)
      return
    }
    pending.current = next
    commitTimer.current = setTimeout(() => send('keep'), WHEEL_COMMIT_MS)
  }
  return { shown: own && own.base === value ? own.v : null, step, flush: () => send('keep') }
}

export function SettingNumber({
  field,
  value,
  onCommit,
  className,
  errorPlacement,
  wheel,
  onShown,
  ...rest
}: {
  field: { kind: FieldKind; range: readonly [number, number]; offAllowed?: boolean; label?: string; unit?: string }
  value: number
  onCommit: (v: number) => void
  className?: string
  errorPlacement?: ErrorPlacement
  /** The mouse wheel over the field changes the number (N8) – the fields of a cost: one save per gesture, or at every turn (`WheelMode`, T2551). */
  wheel?: WheelMode
  /** The number the wheel turned and shows instead of `value` (null – none): told on every change, for what says what the number would do before it is saved (N19). */
  onShown?: (v: number | null) => void
  'aria-label'?: string
  'data-testid'?: string
}) {
  const commit = (v: number) => checkField(field, v).ok && onCommit(v)
  const turned = useWheelValue(value, field.range, commit, wheel)
  const told = useRef(onShown)
  told.current = onShown
  useEffect(() => {
    told.current?.(turned.shown)
  }, [turned.shown])
  return (
    <span className="inline-flex items-center gap-1.5">
      <CommitField
        value={turned.shown ?? value}
        parse={(t) => parseField(field, t)}
        format={(v) => (field.offAllowed && v === 0 ? '0' : formatField(field, v))}
        onCommit={commit}
        onWheelStep={wheel ? turned.step : undefined}
        onLeave={wheel ? turned.flush : undefined}
        shellClassName={className ?? 'w-[96px]'}
        errorPlacement={errorPlacement}
        aria-label={rest['aria-label'] ?? field.label}
        data-testid={rest['data-testid']}
      />
      {field.unit && <span className="text-[12px] text-muted">{field.unit}</span>}
    </span>
  )
}
