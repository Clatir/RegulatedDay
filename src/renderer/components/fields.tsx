// adapted from FI src/renderer/components/ui.tsx @ de81f2b (NumberField, useTextDraft)
/**
 * Fields that save on leaving them or on Enter, never at every key (spec „Edycja pól”): Esc throws the edit away (the
 * next Esc closes what is around), a refused value goes back with its message, the field of whole numbers refuses a
 * fraction. Durations („90”, „1:30”, „1h30”), times of the logical day („+1” before 04:00) and dates without a year
 * („3.01” – the nearest such date) are parsed by @shared/format.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { clock, durationLabel, logicalClock, parseDate, parseDuration, parseInteger, parseLogicalTime, plDate, type Parsed } from '@shared/format'
import { parseField } from '@shared/model/fields'
import { nextDayNote, parseEnd } from '@shared/blockEnd'
import { toast } from '../store/ui'
import { useEscapeLayer } from '../lib/escape'
import { cx } from './ui'

interface CommitFieldProps<T> {
  value: T | null
  onCommit: (value: T) => void
  parse: (text: string) => Parsed<T>
  format: (value: T) => string
  placeholder?: string
  /** The input's own look (a text size …). */
  className?: string
  /** The field's place in the layout (a width, `flex-1`, `min-w-0` …): on the shell, the input fills it. */
  shellClassName?: string
  /** Where the reason of a refused value sits (D347): `'float'` by default. */
  errorPlacement?: ErrorPlacement
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

/** Where the reason of a refused value sits: in the flow under the field (the row grows), or floating under it (the layout stays). */
export type ErrorPlacement = 'below' | 'float'

/**
 * A field with the reason it was refused under it (D347, E8k.3), for as long as the value stays refused, next to the
 * corner's message and the red frame. Every field of the common handling goes through it. The shell is the field's
 * element in the layout (`.field-shell`: the row's width, unless `className` – a width, `flex-1`, `min-w-0` … – says
 * otherwise); the input fills it. `placement` is the field's choice, never guessed: `'float'` (the default; never moves
 * what is around, takes no clicks) for fields in rows and grids, `'below'` for a form where there is room for a line.
 */
export function FieldShell({ error, errorId, className, placement = 'float', testId, children }: { error: string | null; errorId: string; className?: string; placement?: ErrorPlacement; testId?: string; children: ReactNode }) {
  return (
    <span className={cx('field-shell', className)}>
      {children}
      {error != null && (
        <span
          id={errorId}
          role="alert"
          data-testid={testId ? `${testId}-error` : undefined}
          className={cx('text-[11px] leading-snug text-rose', placement === 'float' ? 'pointer-events-none absolute left-0 top-full z-10 mt-0.5 w-max max-w-[260px] rounded bg-panel px-1' : 'mt-0.5 block')}
        >
          {error}
        </span>
      )}
    </span>
  )
}

// The refused value's message goes away with Esc – wherever the focus is (the layer is the newest, so it is first). Only the message
// and the frame: the value stays refused (A6-14: `onAccept` is not called, „Zapisz” of an answer still refuses).
export function CommitField<T>({ value, onCommit, parse, format, placeholder, className, shellClassName, errorPlacement, readOnly, check, onReject, onAccept, ...rest }: CommitFieldProps<T>) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  useEscapeLayer(error != null, () => setError(null))
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
    <FieldShell error={error} errorId={errorId} className={shellClassName} placement={errorPlacement} testId={rest['data-testid']}>
      <input
        className={cx('input num', className)}
        value={shown}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
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
    </FieldShell>
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

/**
 * The end of a block (D464): the hour it ends at, from its `startMin` and `durationMin`. Typing it commits the new length
 * (`onCommit(durationMin)` – the start stays); an end at or before the start is the next day's, said beside the field
 * („+1 dzień”, `data-testid` + „-day”). Refused (under 5 min, over 24 h) with the message under the field as every field.
 */
export function EndField({ startMin, durationMin, onCommit, ...p }: Omit<CommitFieldProps<number>, 'parse' | 'format' | 'value' | 'onCommit'> & { startMin: number; durationMin: number; onCommit: (durationMin: number) => void }) {
  const end = startMin + durationMin
  const note = nextDayNote(startMin, end)
  const id = p['data-testid']
  return (
    <span className="flex items-center gap-2">
      <CommitField {...p} value={end} onCommit={(e) => onCommit(e - startMin)} parse={(t) => parseEnd(t, startMin)} format={logicalClock} placeholder={p.placeholder ?? 'np. 9:30'} />
      {note && (
        <span className="shrink-0 text-[12px] text-muted" data-testid={id ? `${id}-day` : undefined}>
          {note}
        </span>
      )}
    </span>
  )
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
export function TextField({ value, onCommit, max = 80, multiline, placeholder, className, shellClassName, errorPlacement, required, readOnly, autoFocus, onEnter, ...rest }: {
  value: string
  onCommit: (v: string) => void
  max?: number
  multiline?: boolean
  placeholder?: string
  className?: string
  shellClassName?: string
  errorPlacement?: ErrorPlacement
  /** An empty text is refused (a name). */
  required?: boolean
  readOnly?: boolean
  /** The cursor in the field when it appears (the name of a new block, D430) – without scrolling what is around it. */
  autoFocus?: boolean
  /**
   * Enter in a single-line field (not while a character is composed): the text committed, then this with it (trimmed) – the
   * name of a new block adds it (D431). `false`: nothing was done – the cursor stays in the field, Enter may come again.
   */
  onEnter?: (v: string) => boolean | void
  'aria-label'?: string
  'data-testid'?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  useEscapeLayer(error != null, () => setError(null))
  const cancelled = useRef(false)
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  // The cursor in it once it appears; the page does not jump to it (a window that brings itself into view does that).
  // Only when it appears, as the attribute `autoFocus` does.
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true })
  }, [])
  const shown = draft ?? value
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      setError(null)
      return
    }
    if (draft == null || readOnly) return
    const v = draft.trim().slice(0, max)
    setDraft(null)
    if (required && !v) {
      toast('To pole nie może być puste.', 'error', 5000)
      setError('To pole nie może być puste.')
      return
    }
    setError(null)
    if (v !== value) onCommit(v)
  }
  const common = {
    value: shown,
    placeholder,
    maxLength: max,
    spellCheck: false,
    readOnly,
    ref: input,
    'aria-label': rest['aria-label'],
    'data-testid': rest['data-testid'],
    onBlur: commit,
    'aria-invalid': !!error,
    'aria-describedby': error ? errorId : undefined,
    onChange: (e: { currentTarget: { value: string } }) => {
      setDraft(e.currentTarget.value)
      setError(null)
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // A character being composed (IME): its Enter is the composition's, not the field's.
      if (e.key === 'Enter' && (!multiline || e.ctrlKey) && !e.nativeEvent.isComposing) {
        const v = (draft ?? value).trim().slice(0, max)
        const el = e.currentTarget
        el.blur()
        if (onEnter && !multiline && !readOnly && !(required && !v) && onEnter(v) === false) el.focus({ preventScroll: true })
      }
      // Esc while a character is composed (IME) is the composition's: the edit stays, nothing around closes.
      if (e.key === 'Escape' && e.nativeEvent.isComposing) e.stopPropagation()
      else if (e.key === 'Escape' && draft != null) {
        e.stopPropagation()
        e.preventDefault()
        cancelled.current = true
        e.currentTarget.blur()
      }
    }
  }
  return (
    <FieldShell error={error} errorId={errorId} className={shellClassName} placement={errorPlacement} testId={rest['data-testid']}>
      {multiline ? <textarea {...common} rows={3} className={cx('input h-auto py-1.5 leading-snug', className)} /> : <input {...common} className={cx('input', className)} />}
    </FieldShell>
  )
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
