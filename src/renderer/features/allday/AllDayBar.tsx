/**
 * The strip of all-day events (D405) over the axis of „Dziś” (one column) and under the headings of „Tydzień” (seven): always
 * there, one line high while empty. Every event is a bar over the columns of its days – the first three rows, the rest „+N
 * więcej” in their column (a click unfolds them all, the next folds them); ‹ / › where it goes on beyond the days shown. Under
 * the bars there is always one free row (T747) – „+N więcej” stands in it, the rest of it is a place to click. A click
 * on an empty place opens the card of a new event on that day, in „Tydzień” a drag over several days – on that range; a click on a
 * bar – the card of that event. The gesture is the strip's own (a horizontal one, over the cells below): it never starts the
 * gestures of the axis, which stands in another element. The events never touch the plan (D405).
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { newId } from '@shared/model/ids'
import { ALL_DAY_COLOR_HEX, blockFill } from '@shared/theme'
import { weekStart } from '@shared/time/day'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { showAllDayLine, type AllDayLinePage } from '../../store/allDayLine'
import { useMachine } from '../../store/machine'
import { calendarName, calendarOfEvent, filterAllDay } from '@shared/model/calendars'
import { useCalendarFilter, useVisibleAllDay } from '../calendars/calendarFilter'
import { columnAt, popoverPlace } from '../week/weekLayout'
import { ALL_DAY_CARD_WIDTH, AllDayCard } from './AllDayCard'
import { barTitle } from './allDayText'
import { allDayLayout, dragDates } from './allDayView'
import { FreeTodayDialog } from './FreeTodayDialog'
import type { FreeDaysResult } from './freeDays'

/** A bar's height and the gap between rows (px). */
const ROW_PX = 20
const ROW_GAP_PX = 2

interface Open {
  seq: number
  event: AllDayEvent
  base: AllDayEvent | null
  place: { left: number; top: number }
  /** Opened by Ctrl K (D427): its bar stays in the strip while the card is open, though its calendar is unchecked. */
  revealed?: boolean
}

export function AllDayBar({
  dates,
  page,
  today,
  axisPx,
  endPx = 0,
  gapClass = '',
  openId = null,
  onOpened
}: {
  dates: readonly string[]
  page: AllDayLinePage
  today: string
  axisPx: number
  endPx?: number
  gapClass?: string
  /** The event whose card to open once (Ctrl K, D405) – by the strip of the week of its first day; `onOpened` says it was. */
  openId?: string | null
  onOpened?: () => void
}) {
  const events = useData((s) => s.allDay)
  const brightness = useMachine((s) => s.prefs.brightness)
  const wrap = useRef<HTMLDivElement>(null)
  const asks = useRef(0)
  const [expanded, setExpanded] = useState(false)
  const [card, setCard] = useState<Open | null>(null)
  const [held, setHeld] = useState<{ from: number; to: number } | null>(null)
  const [typeToday, setTypeToday] = useState(false)
  const unlisten = useRef<(() => void) | null>(null)
  useEffect(() => () => unlisten.current?.(), [])
  // The bars of the unchecked calendars are not drawn (D425) – but the event Ctrl K found is, with its card open (D427: `revealed`
  // of the filter, `Open.revealed`); a card of an event whose calendar is unchecked meanwhile closes (its bar is gone).
  const rd = useData((s) => s.rd)
  const hiddenCalendars = useCalendarFilter((s) => s.hidden)
  const reveal = useCalendarFilter((s) => s.reveal)
  const { shown, revealedId } = useVisibleAllDay(events)
  const layout = allDayLayout(shown, dates, expanded)
  const revealedId0 = card?.revealed ? card.event.id : null
  useEffect(() => {
    if (!revealedId0) return
    reveal(revealedId0)
    return () => reveal(null)
  }, [revealedId0, reveal])
  useEffect(() => {
    if (card && !card.revealed && card.base && filterAllDay([card.base], hiddenCalendars, rd).hiddenCount > 0) setCard(null)
  }, [card, hiddenCalendars, rd])
  const columns = `${axisPx}px repeat(${dates.length}, minmax(0, 1fr))${endPx ? ` ${endPx}px` : ''}`
  const col = (i: number) => i + 2

  const cellRect = (i: number): DOMRect | null => wrap.current?.querySelector(`[data-allday-cell="${i}"]`)?.getBoundingClientRect() ?? null
  /** Where the card stands: beside `left`–`right` (screen x), under the strip. */
  const placeAt = (left: number, right: number): { left: number; top: number } => {
    const w = wrap.current?.getBoundingClientRect()
    if (!w) return { left: 0, top: 0 }
    return popoverPlace({ gridWidth: w.width, colLeft: left - w.left, colRight: right - w.left, top: w.height + 4, width: ALL_DAY_CARD_WIDTH })
  }
  const openNew = (from: number, to: number, left: number, right: number) => {
    const { startDate, endDate } = dragDates(dates, from, to)
    setCard({ seq: ++asks.current, event: allDayDraft(newId(), startDate, endDate), base: null, place: placeAt(left, right) })
  }
  const openEdit = (event: AllDayEvent, left: number, right: number) => setCard({ seq: ++asks.current, event, base: event, place: placeAt(left, right) })

  // Ctrl K (D405): the card of the event the page asked for – once, by the strip of the week of its first day.
  useEffect(() => {
    if (!openId || page !== 'week') return
    const e = events.find((x) => x.id === openId)
    if (!e || dates[0] !== weekStart(e.startDate)) return
    onOpened?.()
    const col0 = Math.max(0, dates.indexOf(e.startDate))
    const r = cellRect(col0)
    setCard({ seq: ++asks.current, event: e, base: e, place: placeAt(r?.left ?? 0, r?.right ?? 0), revealed: true })
  }, [openId, events, dates, page])

  /** The drag over several columns („Tydzień” only): from the column it began in to the one under the pointer. */
  const down = (e: PointerEvent<HTMLButtonElement>, from: number) => {
    if (e.button !== 0 || dates.length < 2) return
    const rects: Array<{ left: number; right: number }> = []
    for (let i = 0; i < dates.length; i++) {
      const r = cellRect(i)
      if (!r) return
      rects.push({ left: r.left, right: r.right })
    }
    const id = e.pointerId
    let to = from
    const end = () => {
      unlisten.current?.()
      unlisten.current = null
      setHeld(null)
    }
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return
      // No button held: the release was never heard (outside the window).
      if (ev.buttons === 0) return end()
      to = columnAt(ev.clientX, rects, from)
      setHeld((h) => (to === from ? null : h && h.from === from && h.to === to ? h : { from, to }))
    }
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return
      end()
      // The same column: a click, which the cell handles itself.
      if (to !== from) openNew(from, to, rects[Math.min(from, to)]!.left, rects[Math.max(from, to)]!.right)
    }
    unlisten.current?.()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    unlisten.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
    }
  }

  const band = held ?? (card && !card.base ? { from: Math.max(0, dates.indexOf(card.event.startDate)), to: Math.max(0, dates.indexOf(card.event.endDate)) } : null)
  const onFree = (r: FreeDaysResult) => {
    if (r.change) showAllDayLine(page, { kind: 'free', change: r.change })
    // Today, the day made: its change of type is the one during the day, with its own proposals (D406).
    if (r.duringDay) setTypeToday(true)
  }

  return (
    <div ref={wrap} className="relative select-none" data-testid={`allday-${page}`} data-rows={layout.rows}>
      <div className={cx('grid', gapClass)} style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${layout.rows}, ${ROW_PX}px)`, rowGap: ROW_GAP_PX }}>
        <span className="truncate pr-1.5 text-right text-[10px] leading-[20px] text-muted" style={{ gridColumn: 1, gridRow: 1 }} title="Wydarzenia całodniowe i wielodniowe">
          całodn.
        </span>
        {dates.map((d, i) => (
          <button
            key={d}
            type="button"
            data-allday-cell={i}
            data-testid={`allday-cell-${d}`}
            aria-label="Dodaj wydarzenie całodniowe"
            title="Kliknij, żeby dodać wydarzenie całodniowe"
            className="rounded-sm border-x border-line hover:bg-hover"
            style={{ gridColumn: col(i), gridRow: `1 / ${layout.rows + 1}` }}
            onPointerDown={(e) => down(e, i)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              // A click from the keyboard has no place: the cell's middle.
              const x = e.detail === 0 ? (r.left + r.right) / 2 : e.clientX
              openNew(i, i, x, x)
            }}
          />
        ))}
        {band && (
          <div
            className="pointer-events-none z-[1] rounded-sm border border-lamp bg-lamp/20"
            style={{ gridColumn: `${col(Math.min(band.from, band.to))} / ${col(Math.max(band.from, band.to)) + 1}`, gridRow: `1 / ${layout.rows + 1}` }}
            data-testid="allday-range"
            data-from={dates[Math.min(band.from, band.to)]}
            data-to={dates[Math.max(band.from, band.to)]}
          />
        )}
        {layout.lanes.bars.map((b) => {
          const hex = ALL_DAY_COLOR_HEX[b.event.color]
          // D427: where a bar shown in spite of its unchecked calendar comes from.
          const from = b.event.id === revealedId ? `z ukrytego kalendarza ${calendarName(rd, calendarOfEvent(rd, b.event))}` : null
          return (
            <button
              key={b.event.id}
              type="button"
              title={from ? `${barTitle(b.event)} · ${from}` : barTitle(b.event)}
              data-testid={`allday-bar-${b.event.id}`}
              data-hidden-calendar={from ?? undefined}
              data-lane={b.lane}
              data-from={dates[b.fromCol]}
              data-to={dates[b.toCol]}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const x = e.detail === 0 ? (r.left + r.right) / 2 : e.clientX
                openEdit(b.event, x, x)
              }}
              className="relative z-[2] flex min-w-0 items-center gap-1 overflow-hidden rounded-[3px] border-l-[3px] px-1 text-left text-[11px] leading-[16px]"
              style={{ gridColumn: `${col(b.fromCol)} / ${col(b.toCol) + 1}`, gridRow: b.lane + 1, background: blockFill(hex, brightness), borderLeftColor: hex }}
            >
              {b.cutLeft && (
                <span className="shrink-0 text-muted" aria-hidden="true">
                  ‹
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-fg">{b.event.title}</span>
              {from && (
                <span className="shrink-0 truncate text-muted" data-testid="allday-hidden-calendar">
                  {from}
                </span>
              )}
              {b.cutRight && (
                <span className="shrink-0 text-muted" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
          )
        })}
        {layout.moreRow != null &&
          layout.more.map((n, i) =>
            n > 0 ? (
              <button
                key={dates[i]}
                type="button"
                className="relative z-[2] max-w-full truncate rounded-sm px-1 text-left text-[11px] leading-[16px] text-muted hover:bg-hover hover:text-fg"
                // Only as wide as its words: the rest of the free row stays a place to click (T747).
                style={{ gridColumn: col(i), gridRow: layout.moreRow!, justifySelf: 'start' }}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                data-testid={`allday-more-${dates[i]}`}
              >
                {expanded ? 'Zwiń' : `+${n} więcej`}
              </button>
            ) : null
          )}
      </div>
      {card && (
        <AllDayCard
          key={card.seq}
          event={card.event}
          base={card.base}
          today={today}
          place={card.place}
          brightness={brightness}
          onClose={() => setCard(null)}
          onRemoved={(title, raw) => showAllDayLine(page, { kind: 'removed', title, raw })}
          onFree={onFree}
        />
      )}
      {typeToday && <FreeTodayDialog today={today} onClose={() => setTypeToday(false)} />}
    </div>
  )
}
