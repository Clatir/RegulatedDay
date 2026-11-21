/**
 * A month as a grid (D295): weeks from Monday, every day a cell with its colour and marks; several dates are selected
 * by dragging or with Ctrl (Shift extends from the last one), a plain click on a day opens it (when the host wants that).
 * A host that keeps its selection with `useSelection` (D527, the calendar) gives it as `selection`: the clicks, the drag and the right button
 * go through its model (anchor, the part kept before a Shift range, Ctrl+A, Shift+arrows, Esc are the hook's); the others (the wizard, the
 * copy of a day) keep `selected` / `onSelect`.
 * A host may give the day's all-day events (D405): the first one with its colour's dot and „+N” for the rest, read only – or the
 * detail of the day (D418, D422: up to three miniature bars, „+N” for all the rest, the dot of the load), which takes their place.
 */
import { useRef, useState, type ReactNode } from 'react'
import type { AllDayEvent } from '@shared/model/allDay'
import { ALL_DAY_COLOR_HEX, PALETTE } from '@shared/theme'
import { addDays, weekday } from '@shared/time/zone'
import { menuBind } from '../../components/ContextMenu'
import { cx } from '../../components/ui'
import type { SelectionApi } from '../../lib/useSelection'
import { monthLabel } from '../allday/allDayText'
import type { MonthCellView } from './monthCellView'

export const MONTH_NAMES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
/** The dot of the load in three shades of one colour (D418): the more of the budget, the fuller its fill; its edge is always whole. */
const LOAD_FILL = { low: 0.3, mid: 0.65, high: 1 } as const
const lamp = (alpha: number): string => {
  const n = Number.parseInt(PALETTE.lamp.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
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

/** How the grid keeps its selection: a set the host owns, or the hook's model (then the right button and the menu key ask the host for its menu). */
type Picking =
  | { selected: ReadonlySet<string>; onSelect: (dates: Set<string>) => void; selection?: undefined; onContext?: undefined }
  | {
      selection: SelectionApi
      /** The right button (or Shift+F10, the menu key) on a day: the dates the menu is for (the whole selection, or only that day) and where to open it. */
      onContext?: (dates: readonly string[], at: { x: number; y: number }) => void
      selected?: undefined
      onSelect?: undefined
    }

export function MonthGrid({
  month,
  selected,
  onSelect,
  selection,
  onContext,
  onOpen,
  cell,
  today,
  ...rest
}: Picking & {
  month: string
  /** A plain click: open the day (otherwise the click selects it). */
  onOpen?: (date: string) => void
  cell: (date: string) => {
    tone: string | null
    marks: ReactNode
    title?: string
    /** The day's events in their order (`eventsOn`); the wizard gives none. */
    events?: readonly AllDayEvent[]
    /** The bars, „+N” and the load of the day (D418, `monthCellView`); none – the first event's line, as the wizard has it. */
    detail?: MonthCellView
  }
  today: string
  'data-testid'?: string
}) {
  const dates = gridDates(month)
  const [drag, setDrag] = useState<{ from: string; base: Set<string> } | null>(null)
  const last = useRef<string | null>(null)
  /** A drag of the selection model has entered another day (so it is a range, not a click). */
  const ranged = useRef(false)
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
          const sel = selection ? selection.isSelected(d) : selected.has(d)
          const ev = monthLabel(c.events ?? [])
          return (
            <button
              key={d}
              type="button"
              data-testid={`day-${d}`}
              aria-pressed={sel}
              title={[c.title, ev?.title].filter(Boolean).join('\n') || undefined}
              {...(selection && onContext ? menuBind((at) => onContext(selection.onItemContext(d), at)) : {})}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if (selection) {
                  // The model: Ctrl – toggles the day, Shift – the range from the anchor. A plain press only may start a drag: it changes nothing
                  // until the pointer enters another day (a click opens the day and leaves the selection as it is).
                  if (e.shiftKey || e.ctrlKey) return void selection.onItemClick(d, e)
                  ranged.current = false
                  setDrag({ from: d, base: new Set() })
                  return
                }
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
                if (!drag) return
                if (selection) {
                  // The first other day entered starts the range from the day pressed; back on that day the range is only it again.
                  if (drag.from === d) return void (ranged.current && selection.onItemClick(d, { ctrlKey: false, shiftKey: false }))
                  if (!ranged.current) {
                    ranged.current = true
                    selection.onItemClick(drag.from, { ctrlKey: false, shiftKey: false })
                  }
                  return void selection.onItemClick(d, { ctrlKey: false, shiftKey: true })
                }
                if (drag.from === d) return
                onSelect!(new Set([...drag.base, ...range(drag.from, d)]))
              }}
              onMouseUp={(e) => {
                if (!drag || e.ctrlKey || e.shiftKey) return
                // A plain click (no range was dragged): open the day, or select only it.
                if (drag.from === d && !(selection && ranged.current)) {
                  if (onOpen) onOpen(d)
                  else if (!selection) onSelect!(new Set([d]))
                }
                setDrag(null)
              }}
              className={cx(
                'relative flex flex-col items-start rounded border px-1.5 py-1 text-left',
                c.detail ? 'min-h-[84px]' : 'min-h-[58px]',
                sel ? 'border-lamp ring-1 ring-lamp' : 'border-line',
                // Outside the month: a dashed edge and a muted number – its text keeps its contrast (A8-05).
                !inMonth && 'border-dashed text-muted',
                d === today && 'outline outline-1 outline-fg/60'
              )}
              style={{ background: c.tone ?? undefined }}
            >
              <span className="num text-[12px]">{Number(d.slice(8, 10))}</span>
              {c.detail?.load && (
                <span
                  className="absolute top-1.5 right-1.5 inline-block h-[8px] w-[8px] rounded-full ring-1 ring-lamp"
                  style={{ background: lamp(LOAD_FILL[c.detail.load.level]) }}
                  title={c.detail.load.title}
                  aria-label={c.detail.load.title}
                  data-testid={`month-load-${d}`}
                  data-level={c.detail.load.level}
                />
              )}
              {c.detail ? (
                <span className="flex w-full min-w-0 flex-col gap-px" data-testid={`month-bars-${d}`}>
                  {c.detail.bars.map((b) => (
                    <span key={b.key} className="block h-[12px] truncate rounded-[2px] border-l-2 px-1 text-[9.5px] leading-[12px] text-fg" style={{ background: b.fill, borderLeftColor: b.edge }} title={b.title} data-testid={`month-bar-${d}`}>
                      {b.label}
                    </span>
                  ))}
                  {c.detail.more > 0 && (
                    <span className="num truncate text-[10px] leading-tight text-muted" title={c.detail.moreTitle} data-testid={`month-more-${d}`}>
                      {c.detail.moreText}
                    </span>
                  )}
                </span>
              ) : (
                ev && (
                  <span className="flex w-full min-w-0 items-center gap-1 text-[10px] leading-tight text-fg" data-testid={`day-events-${d}`}>
                    <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: ALL_DAY_COLOR_HEX[ev.first.color] }} aria-hidden="true" />
                    <span className="min-w-0 truncate">{ev.first.title}</span>
                    {ev.more > 0 && <span className="shrink-0 text-muted">+{ev.more}</span>}
                  </span>
                )
              )}
              <span className="mt-auto flex w-full flex-wrap gap-0.5 text-[10px] leading-tight text-fg">{c.marks}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
