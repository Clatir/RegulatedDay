/**
 * The one window of days (D544, D565 P24, F6): „Zastosuj do…” / „Odwołaj w…” of a template and „Skopiuj ten dzień do…” choose days in it. A month
 * like the Calendar's (`MonthGrid`: a click – that day, Ctrl+click – one more or one less, Shift+click – the range from the last one, a drag – a
 * range) and the fields „Od” and „Do” (DD.MM.RRRR – the typing of every field of a date: dots, dashes, slashes, eight digits, „3.01”); a range typed
 * replaces the selection, the selection in the month shows its first and last day in the fields.
 */
import { useState, type ComponentProps, type ReactNode } from 'react'
import { daysFromTo, dmy, isBadDmy, parseDmy, typedDmy } from '@shared/dateInput'
import { countLabel } from '@shared/format'
import { Dialog } from '../../components/Dialog'
import { MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from './MonthGrid'

/** The most days a range typed may have when the caller gives no `max`: a range of centuries is never built (ten years). */
const TYPED_MAX = 3660

/** A field of a date: eight digits become the date (DD.MM.RRRR) as soon as they are typed; a text that is no date is marked. */
function DmyField({ label, value, today, onChange, testId }: { label: string; value: string; today: string; onChange: (v: string) => void; testId: string }) {
  const bad = isBadDmy(value, today)
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <input
        className={`input num w-[120px] ${bad ? 'border-rose' : ''}`}
        value={value}
        placeholder="DD.MM.RRRR"
        inputMode="numeric"
        maxLength={10}
        aria-label={label}
        aria-invalid={bad}
        onChange={(e) => onChange(typedDmy(e.target.value))}
        data-testid={testId}
      />
    </label>
  )
}

export function DaysDialog({
  title,
  verb,
  today,
  busy,
  onClose,
  onPick,
  testId,
  okTestId,
  max,
  past: isPast,
  pastLabel = 'minione',
  month: firstMonth,
  skip,
  cell,
  note,
  onChange,
  footer
}: {
  title: string
  /** The accent button: „Zastosuj”, „Odwołaj”, „Skopiuj” – with the number of days chosen. */
  verb: string
  today: string
  busy: boolean
  onClose: () => void
  onPick: (dates: string[]) => void
  testId: string
  /** The test id of the accent button (`<testId>-ok` by default). */
  okTestId?: string
  /** The most days at once (a range longer is said and not taken). */
  max?: number
  /** Which days count as „minione” in the line below (a day before today by default; the copy: the days its warning names, today included). */
  past?: (date: string) => boolean
  /** What the line below calls those days: „minione” by default (the copy: „już trwały”). */
  pastLabel?: string
  /** The month shown first (the one of today by default). */
  month?: string
  /** A day that is never a target (the day copied from): it may stay marked in the month, it is not counted nor picked. */
  skip?: string
  /** What the month shows in a day's cell (a mark on the day `skip`, …). */
  cell?: ComponentProps<typeof MonthGrid>['cell']
  /** A line under the month. */
  note?: string
  /** The days chosen changed (the grid or the fields). */
  onChange?: (dates: string[]) => void
  /** Replaces the buttons of the window (a warning that needs its own answer, as the copy of a day that already ran). */
  footer?: ReactNode
}) {
  const [month, setMonth] = useState(firstMonth ?? monthOf(today))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tooLong, setTooLong] = useState(false)
  const listOf = (days: Iterable<string>) => [...days].filter((d) => d !== skip).sort()

  const chosen = (days: string[]) => {
    setSel(new Set(days))
    onChange?.(listOf(days))
  }
  /** The fields typed: both dates – the range, only „Od” – that day; the month shows the first one. */
  const typed = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    const a = parseDmy(f, today)
    const b = parseDmy(t, today)
    setTooLong(false)
    // Nothing in „Od”, or a field that is no date: nothing chosen – the old selection would stay behind fields that do not show it (the grid, the
    // count and the caller's own state – the copy's warning – would go on with days no field names).
    if (!f.trim() || isBadDmy(f, today) || isBadDmy(t, today)) return chosen([])
    if (!a) return
    // Counted before the days are listed (without the day `skip`): a range of centuries is never built.
    const limit = max ?? TYPED_MAX
    const span = Math.abs(Date.parse(b ?? a) - Date.parse(a)) / 86_400_000 + 1
    const [x, y] = a <= (b ?? a) ? [a, b ?? a] : [b ?? a, a]
    if (span - (skip != null && skip >= x && skip <= y ? 1 : 0) > limit) {
      setTooLong(true)
      return chosen([])
    }
    const days = daysFromTo(a, b ?? a)
    chosen(days)
    setMonth(monthOf(days[0]!))
  }
  /** The grid picked: the fields show the first and the last day. */
  const picked = (next: Set<string>) => {
    setTooLong(false)
    chosen([...next])
    const list = listOf(next)
    setFrom(list.length ? dmy(list[0]!) : '')
    setTo(list.length > 1 ? dmy(list[list.length - 1]!) : '')
  }
  const list = listOf(sel)
  const past = list.filter(isPast ?? ((d) => d < today)).length
  const [y, m] = month.split('-')
  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      data-testid={testId}
      actions={
        footer ?? (
          <>
            <span className="mr-auto text-[12px] text-muted" data-testid={`${testId}-count`}>
              {tooLong ? `Zakres dłuższy niż ${max ?? TYPED_MAX} dni – wybierz krótszy.` : list.length ? `Wybrane: ${countLabel(list.length, 'dzień', 'dni', 'dni')}${past ? ` (${pastLabel}: ${past})` : ''}` : 'Kliknij dzień; Ctrl+klik dodaje, Shift+klik – zakres.'}
            </span>
            <button type="button" className="btn" onClick={onClose}>
              Anuluj
            </button>
            <button type="button" className="btn btn-accent" disabled={!list.length || busy || tooLong || isBadDmy(from, today) || isBadDmy(to, today)} onClick={() => onPick(list)} data-testid={okTestId ?? `${testId}-ok`}>
              {verb}
              {list.length ? ` (${list.length})` : ''}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <DmyField label="Od" value={from} today={today} onChange={(v) => typed(v, to)} testId={`${testId}-from`} />
        <DmyField label="Do" value={to} today={today} onChange={(v) => typed(from, v)} testId={`${testId}-to`} />
        <span className="flex-1" />
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc">
          ‹
        </button>
        <span className="w-[150px] text-center">
          {MONTH_NAMES[Number(m) - 1]} {y}
        </span>
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc">
          ›
        </button>
      </div>
      <MonthGrid month={month} today={today} selected={sel} onSelect={picked} cell={cell ?? (() => ({ tone: null, marks: null }))} data-testid={`${testId}-month`} />
      {note && <p className="text-[12px] text-muted">{note}</p>}
    </Dialog>
  )
}
