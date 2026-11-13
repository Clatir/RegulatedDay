/**
 * What the views of several days take from the calendar filter (D419, D425) – the same `filterBlocks` / `filterAllDay` as
 * `useVisibleBlocks` / `useVisibleAllDay`, for the shapes the views have: days with their blocks (the columns of „Tydzień” and „3
 * dni”, „Agenda”) and the all-day events overlapping the days a view shows. Only for the views of the window; the engine, the
 * curve of energy, the bar and the notifications never ask (the day's own numbers – boundary, regeneration, load – stay whole).
 */
import { useMemo } from 'react'
import type { AllDayEvent } from '@shared/model/allDay'
import { eventsInRange } from '@shared/model/allDay'
import { calendarName, calendarOfCategory, filterBlocks } from '@shared/model/calendars'
import { useData } from '../../store/data'
import { useCalendarFilter, useVisibleAllDay } from './calendarFilter'

const NONE: never[] = []

/**
 * The days with the blocks outside the unchecked calendars only, how many blocks that took out of all of them („ukryte: N”) and out
 * of each day (`hiddenByDay`, the days' order). Nothing hidden – the very array it was given. `null` (not counted yet) – no days and
 * none hidden.
 */
export function useVisibleDays<B extends { categoryId: string }, D extends { blocks: readonly B[] }>(days: readonly D[] | null | undefined): { days: D[]; hiddenCount: number; hiddenByDay: number[] } {
  const rd = useData((x) => x.rd)
  const hidden = useCalendarFilter((x) => x.hidden)
  return useMemo(() => {
    if (!days) return { days: NONE, hiddenCount: 0, hiddenByDay: NONE }
    const rs = days.map((d) => filterBlocks(d.blocks, hidden, rd))
    const hiddenCount = rs.reduce((n, r) => n + r.hiddenCount, 0)
    return {
      days: hiddenCount === 0 ? (days as D[]) : days.map((d, i) => (rs[i]!.hiddenCount === 0 ? d : { ...d, blocks: rs[i]!.shown })),
      hiddenCount,
      hiddenByDay: rs.map((r) => r.hiddenCount)
    }
  }, [days, hidden, rd])
}

/**
 * What the axis of „Dziś” draws of its items once the unchecked calendars' blocks are out (`shown`): the block whose panel is open
 * (`openId` – Ctrl K found it, or it was open when its calendar was unchecked, D427) and the blocks that must stay (`always`: running,
 * begun outside the plan – T1002) come back, each with the calendar's name (`hiddenIn`). `hiddenCount` – the blocks still hidden
 * („ukryte: N” counts only what the view would not show). Nothing hidden – `shown` itself.
 */
export function axisWithRevealed<T extends { id: string; categoryId: string; always?: boolean; hiddenIn?: string }>(
  items: readonly T[],
  shown: T[],
  openId: string | null,
  rd: Parameters<typeof calendarOfCategory>[0] & { calendars: ReadonlyArray<{ id: string; name: string }> }
): { items: T[]; hiddenCount: number } {
  if (shown.length === items.length) return { items: shown, hiddenCount: 0 }
  const drawn = new Set(shown)
  let revealed = 0
  const list = items.flatMap((i): T[] => {
    if (drawn.has(i)) return [i]
    if (!i.always && i.id !== openId) return []
    revealed++
    return [{ ...i, hiddenIn: calendarName(rd, calendarOfCategory(rd, i.categoryId)) }]
  })
  return { items: list, hiddenCount: items.length - shown.length - revealed }
}

/**
 * The all-day events a view draws (`shown`: all the events the unchecked calendars let through, and the one Ctrl K found – D427)
 * and how many events overlapping `from`–`to` (dates, inclusive) they hide (each event once) – one hook for the view and its count.
 */
export function useVisibleAllDayIn(from: string, to: string): { shown: AllDayEvent[]; hiddenInRange: number; revealedId: string | null } {
  const events = useData((x) => x.allDay)
  const seen = useVisibleAllDay(events)
  const hiddenInRange = useMemo(() => (seen.hiddenCount === 0 ? 0 : eventsInRange(events, from, to).length - eventsInRange(seen.shown, from, to).length), [events, seen, from, to])
  return { shown: seen.shown, hiddenInRange, revealedId: seen.revealedId }
}
