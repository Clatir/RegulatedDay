// adapted from FI src/renderer/components/ui.tsx @ de81f2b (NumberField, useTextDraft)
/**
 * Fields that save on leaving them or on Enter, never at every key (spec „Edycja pól”): Esc throws the edit away (the
 * next Esc closes what is around), a refused value goes back with its message, the field of whole numbers refuses a
 * fraction. Durations („90”, „1:30”, „1h30”), times of the logical day („+1” before 04:00) and dates without a year
 * („3.01” – the nearest such date) are parsed by @shared/format.
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { durationLabel, logicalClock, parseDate, parseDuration, parseInteger, parseLogicalTime, plDate, type Parsed } from '@shared/format'
import { toast } from '../store/ui'
import { cx } from './ui'

interface CommitFieldProps<T> {
  value: T | null
  onCommit: (value: T) => void
  parse: (text: string) => Parsed<T>
  format: (value: T) => string
  placeholder?: string
  className?: string
  readOnly?: boolean
  'aria-label'?: string
  'data-testid'?: string
}

export function CommitField<T>({ value, onCommit, parse, format, placeholder, className, readOnly, ...rest }: CommitFieldProps<T>) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Esc: the blur it causes runs with this render's draft – it must not apply it.
  const cancelled = useRef(false)
  const shown = draft ?? (value == null ? '' : format(value))
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      setError(null)
      return
    }
    if (draft == null || readOnly) return
    const r = parse(draft)
    if (!r.ok) {
      // Refused: the saved value comes back, the message says why.
      toast(r.message, 'error', 6000)
      setError(r.message)
      setDraft(null)
      return
    }
    setDraft(null)
    setError(null)
    if (value == null || format(r.value) !== format(value)) onCommit(r.value)
  }
  return (
    <input
      className={cx('input num', className)}
      value={shown}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
      aria-invalid={!!error}
      aria-label={rest['aria-label']}
      data-testid={rest['data-testid']}
      data-error={error ?? undefined}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setDraft(e.currentTarget.value)
        setError(null)
      }}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape' && draft != null) {
          // The first Esc only cancels the edit; the next one goes to whatever is around.
          e.stopPropagation()
          e.preventDefault()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function DurationField(p: Omit<CommitFieldProps<number>, 'parse' | 'format'>) {
  return <CommitField {...p} parse={(t) => parseDuration(t)} format={durationLabel} placeholder={p.placeholder ?? 'np. 90, 1:30, 1h30'} />
}

export function IntegerField({ min, max, ...p }: Omit<CommitFieldProps<number>, 'parse' | 'format'> & { min: number; max: number }) {
  return <CommitField {...p} parse={(t) => parseInteger(t, min, max)} format={(n) => String(n)} />
}

/** A time of the logical day: minutes since 00:00 of its date (00:00–03:59 is the night after, „+1”). */
export function TimeField(p: Omit<CommitFieldProps<number>, 'parse' | 'format'>) {
  return <CommitField {...p} parse={parseLogicalTime} format={logicalClock} placeholder={p.placeholder ?? 'np. 7:05'} />
}

/** A date: „21.10.2026”, or „3.01” – the nearest such date from `today` on. */
export function DateField({ today, ...p }: Omit<CommitFieldProps<string>, 'parse' | 'format'> & { today: string }) {
  return <CommitField {...p} parse={(t) => parseDate(t, today)} format={plDate} placeholder={p.placeholder ?? 'np. 21.10.2026 albo 3.01'} />
}
