/**
 * A month as a grid (D295): weeks from Monday, every day a cell with its colour and marks; several dates are selected
 * by dragging or with Ctrl (Shift extends from the last one), a plain click on a day opens it (when the host wants that).
 */
import { useRef, useState, type ReactNode } from 'react'
import { addDays, weekday } from '@shared/time/zone'
import { cx } from '../../components/ui'

export const MONTH_NAMES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const WEEKDAYS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd']

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const t = (y * 12 + (m - 1) + n)
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** The dates of the month's grid: from the Monday of its first week to the Sunday of its last. */
export function gridDates(month: string): string[] {
  const first = `${month}-01`
  let d = addDays(first, -(weekday(first) - 1))
  const out: string[] = []
  while (out.length < 42) {
    out.push(d)
    d = addDays(d, 1)
    if (out.length >= 28 && out.length % 7 === 0 && !d.startsWith(month)) break
  }
  return out
}

export function MonthGrid({
  month,
  selected,
  onSelect,
  onOpen,
  cell,
  today,
  ...rest
}: {
  month: string
  selected: ReadonlySet<string>
  onSelect: (dates: Set<string>) => void
  /** A plain click: open the day (otherwise the click selects it). */
  onOpen?: (date: string) => void
  cell: (date: string) => { tone: string | null; marks: ReactNode; title?: string }
  today: string
  'data-testid'?: string
}) {
  const dates = gridDates(month)
  const [drag, setDrag] = useState<{ from: string; base: Set<string> } | null>(null)
  const last = useRef<string | null>(null)
  const range = (a: string, b: string) => {
    const [x, y] = a <= b ? [a, b] : [b, a]
    const out: string[] = []
    for (let d = x; d <= y; d = addDays(d, 1)) out.push(d)
    return out
  }
  return (
    <div className="flex flex-col gap-1" data-testid={rest['data-testid'] ?? 'month-grid'} onMouseLeave={() => setDrag(null)} onMouseUp={() => setDrag(null)}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const c = cell(d)
          const inMonth = d.startsWith(month)
          const sel = selected.has(d)
          return (
            <button
              key={d}
              type="button"
              data-testid={`day-${d}`}
              aria-pressed={sel}
              title={c.title}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if (e.shiftKey && last.current) {
                  onSelect(new Set([...selected, ...range(last.current, d)]))
                  return
                }
                if (e.ctrlKey) {
                  const next = new Set(selected)
                  if (next.has(d)) next.delete(d)
                  else next.add(d)
                  last.current = d
                  onSelect(next)
                  return
                }
                setDrag({ from: d, base: new Set() })
                last.current = d
              }}
              onMouseEnter={() => {
                if (!drag || drag.from === d) return
                onSelect(new Set([...drag.base, ...range(drag.from, d)]))
              }}
              onMouseUp={(e) => {
                if (!drag || e.ctrlKey || e.shiftKey) return
                if (drag.from === d) {
                  // A plain click: open the day, or select only it.
                  if (onOpen) onOpen(d)
                  else onSelect(new Set([d]))
                }
                setDrag(null)
              }}
              className={cx(
                'relative flex h-[58px] flex-col items-start rounded border px-1.5 py-1 text-left',
                sel ? 'border-lamp ring-1 ring-lamp' : 'border-line',
                // Outside the month: a dashed edge and a muted number – its text keeps its contrast (A8-05).
                !inMonth && 'border-dashed text-muted',
                d === today && 'outline outline-1 outline-fg/60'
              )}
              style={{ background: c.tone ?? undefined }}
            >
              <span className="num text-[12px]">{Number(d.slice(8, 10))}</span>
              <span className="mt-auto flex w-full flex-wrap gap-0.5 text-[10px] leading-tight text-fg">{c.marks}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
