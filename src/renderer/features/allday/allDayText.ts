/**
 * What the screens say of an all-day event where the strip is not (D405): the line of a bar pointed at, the day of the month grid.
 * Apart from `allDayView` so the month grid (which `weekText` imports) needs nothing of the week.
 */
import { rangeText, type AllDayEvent } from '@shared/model/allDay'

/** What a bar says when pointed at: the whole title and the dates (a long title is cut on the bar). */
export const barTitle = (e: AllDayEvent): string => `${e.title} · ${rangeText(e)}${e.free ? ' · wolne' : ''}`

/** The first of the event's lines on a day of the month grid and what remains: „Konferencja” + „+2”. */
export function monthLabel(events: readonly AllDayEvent[]): { first: AllDayEvent; more: number; title: string } | null {
  const first = events[0]
  if (!first) return null
  return { first, more: events.length - 1, title: events.map(barTitle).join('\n') }
}
