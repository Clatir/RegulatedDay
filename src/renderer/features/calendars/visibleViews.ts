/**
 * What the views of several days take from the calendar filter (D419, D425) – the same `filterBlocks` / `filterAllDay` as
 * `useVisibleBlocks` / `useVisibleAllDay`, for the shapes the views have: days with their blocks (the columns of „Tydzień” and „3
 * dni”, „Agenda”) and the all-day events overlapping the days a view shows. Only for the views of the window; the engine, the
 * curve of energy, the bar and the notifications never ask (the day's own numbers – boundary, regeneration, load – stay whole).
 */
import { useMemo } from 'react'
import { eventsInRange } from '@shared/model/allDay'
import { filterBlocks } from '@shared/model/calendars'
import { useData } from '../../store/data'
import { useCalendarFilter, useVisibleAllDay } from './calendarFilter'

const NONE: never[] = []

/**
 * The days with the blocks outside the unchecked calendars only, and how many blocks that took out of all of them („ukryte: N”).
 * Nothing hidden – the very array it was given. `null` (not counted yet) – no days and none hidden.
 */
export function useVisibleDays<B extends { categoryId: string }, D extends { blocks: readonly B[] }>(days: readonly D[] | null | undefined): { days: D[]; hiddenCount: number } {
  const rd = useData((x) => x.rd)
  const hidden = useCalendarFilter((x) => x.hidden)
  return useMemo(() => {
    if (!days) return { days: NONE, hiddenCount: 0 }
    let hiddenCount = 0
    const out = days.map((d) => {
      const r = filterBlocks(d.blocks, hidden, rd)
      hiddenCount += r.hiddenCount
      return r.hiddenCount === 0 ? d : { ...d, blocks: r.shown }
    })
    return { days: hiddenCount === 0 ? (days as D[]) : out, hiddenCount }
  }, [days, hidden, rd])
}

/** How many all-day events overlapping `from`–`to` (dates, inclusive) the unchecked calendars hide (each event once). */
export function useHiddenAllDay(from: string, to: string): number {
  const events = useData((x) => x.allDay)
  const inRange = useMemo(() => eventsInRange(events, from, to), [events, from, to])
  return useVisibleAllDay(inRange).hiddenCount
}
