// adapted from FI src/renderer/components/ui.tsx @ de81f2b (NumberField, useTextDraft)
/**
 * Fields that save on leaving them or on Enter, never at every key (spec „Edycja pól”): Esc throws the edit away (the
 * next Esc closes what is around), a refused value goes back with its message, the field of whole numbers refuses a
 * fraction. Durations („90”, „1:30”, „1h30”), times of the logical day („+1” before 04:00) and dates without a year
 * („3.01” – the nearest such date) are parsed by @shared/format.
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { clock, durationLabel, logicalClock, parseDate, parseDuration, parseInteger, parseLogicalTime, plDate, type Parsed } from '@shared/format'
import { parseField } from '@shared/model/fields'
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
  /** A value parsed but still refused (a skipped hour of the change of time): its message, null – accepted. */
  check?: (value: T) => string | null
  /** A refused text: the saved value came back (an answer waiting for „Zapisz” must not take it, A6-14). */
  onReject?: (message: string) => void
  /** Every text accepted – also one equal to the value – and an edit cancelled (Esc): what the field holds now. */
  onAccept?: (value: T) => void
  'aria-label'?: string
  'data-testid'?: string
}

/**
 * What leaving a field with `draft` does: refused (its message – also a value parsed but failing `check`), or accepted
 * – `changed` when it differs from `value` (only then is it committed; an equal one is still accepted, ending a refusal).
 */
export function fieldCommit<T>(draft: string, value: T | null, parse: (t: string) => Parsed<T>, format: (v: T) => string, check?: (v: T) => string | null): { refused: string } | { value: T; changed: boolean } {
  const parsed = parse(draft)
  if (!parsed.ok) return { refused: parsed.message }
  const refused = check?.(parsed.value) ?? null
  if (refused != null) return { refused }
  return { value: parsed.value, changed: value == null || format(parsed.value) !== format(value) }
}

export function CommitField<T>({ value, onCommit, parse, format, placeholder, className, readOnly, check, onReject, onAccept, ...rest }: CommitFieldProps<T>) {
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
      if (value != null) onAccept?.(value)
      return
    }
    if (draft == null || readOnly) return
    const r = fieldCommit(draft, value, parse, format, check)
    setDraft(null)
    if ('refused' in r) {
      // Refused: the saved value comes back, the message says why.
      toast(r.refused, 'error', 6000)
      setError(r.refused)
      onReject?.(r.refused)
      return
    }
    setError(null)
    onAccept?.(r.value)
    if (r.changed) onCommit(r.value)
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

/** A length typed within `range`: one outside is refused with its message – never cut to the bound in silence (A6-19). */
export const durationParser =
  (range?: readonly [number, number]) =>
  (t: string): Parsed<number> => {
    const r = parseDuration(t, range?.[1])
    // Shorter than the range: refused too (the model's schema would drop it in silence).
    return r.ok && range && r.value < range[0] ? { ok: false, message: `Najkrócej ${durationLabel(range[0])}.` } : r
  }

export function DurationField({ range, ...p }: Omit<CommitFieldProps<number>, 'parse' | 'format'> & { range?: readonly [number, number] }) {
  return <CommitField {...p} parse={durationParser(range)} format={durationLabel} placeholder={p.placeholder ?? 'np. 90, 1:30, 1h30'} />
}

export function IntegerField({ min, max, ...p }: Omit<CommitFieldProps<number>, 'parse' | 'format'> & { min: number; max: number }) {
  return <CommitField {...p} parse={(t) => parseInteger(t, min, max)} format={(n) => String(n)} />
}

/**
 * A time of the logical day: minutes since 00:00 of its date (00:00–03:59 is the night after, „+1”); with `range`, a time
 * outside it is refused with its message (never saved to be dropped by the model's schema).
 */
export function TimeField({ range, ...p }: Omit<CommitFieldProps<number>, 'parse' | 'format'> & { range?: readonly [number, number] }) {
  const parse = range ? (t: string) => parseField({ kind: 'time', range, offAllowed: false }, t) : parseLogicalTime
  return <CommitField {...p} parse={parse} format={logicalClock} placeholder={p.placeholder ?? 'np. 7:05'} />
}

/** A wall time of another zone (a session's hours in New York time): 00:00–23:59, no „+1”. */
export function ClockField(p: Omit<CommitFieldProps<number>, 'parse' | 'format'>) {
  return (
    <CommitField
      {...p}
      parse={(t) => {
        const r = parseLogicalTime(t)
        return r.ok ? { ok: true, value: r.value % 1440 } : r
      }}
      format={clock}
      placeholder={p.placeholder ?? 'np. 8:00'}
    />
  )
}

/** A date: „21.10.2026”, or „3.01” – the nearest such date from `today` on. */
export function DateField({ today, past, ...p }: Omit<CommitFieldProps<string>, 'parse' | 'format'> & { today: string; past?: boolean }) {
  return <CommitField {...p} parse={(t) => parseDate(t, today, { past })} format={plDate} placeholder={p.placeholder ?? 'np. 21.10.2026 albo 3.01'} />
}

/** A text (a name, a note): saved on leaving the field or Enter, Esc throws the edit away; trimmed, at most `max` characters. */
export function TextField({ value, onCommit, max = 80, multiline, placeholder, className, required, ...rest }: {
  value: string
  onCommit: (v: string) => void
  max?: number
  multiline?: boolean
  placeholder?: string
  className?: string
  /** An empty text is refused (a name). */
  required?: boolean
  'aria-label'?: string
  'data-testid'?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const shown = draft ?? value
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      return
    }
    if (draft == null) return
    const v = draft.trim().slice(0, max)
    setDraft(null)
    if (required && !v) {
      toast('To pole nie może być puste.', 'error', 5000)
      return
    }
    if (v !== value) onCommit(v)
  }
  const common = {
    value: shown,
    placeholder,
    maxLength: max,
    spellCheck: false,
    'aria-label': rest['aria-label'],
    'data-testid': rest['data-testid'],
    onBlur: commit,
    onChange: (e: { currentTarget: { value: string } }) => setDraft(e.currentTarget.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (!multiline || e.ctrlKey)) e.currentTarget.blur()
      if (e.key === 'Escape' && draft != null) {
        e.stopPropagation()
        e.preventDefault()
        cancelled.current = true
        e.currentTarget.blur()
      }
    }
  }
  return multiline ? <textarea {...common} rows={3} className={cx('input h-auto py-1.5 leading-snug', className)} /> : <input {...common} className={cx('input', className)} />
}

/** A choice from a list (a native list: the main window only – the bar never opens one, D229). */
export function Choice<T extends string>({ value, options, onChange, className, ...rest }: {
  value: T | null
  options: Array<{ value: T; label: string; disabled?: boolean }>
  onChange: (v: T) => void
  className?: string
  placeholder?: string
  'aria-label'?: string
  'data-testid'?: string
}) {
  return (
    <select
      className={cx('input pr-6', className)}
      value={value ?? ''}
      aria-label={rest['aria-label']}
      data-testid={rest['data-testid']}
      onChange={(e) => onChange(e.currentTarget.value as T)}
    >
      {value == null && <option value="">{rest.placeholder ?? '— wybierz —'}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
