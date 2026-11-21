/**
 * Ctrl+N on „Tydzień”, „3 dni” and the calendar (D6, D563 P9): the small window of a new block today – or on the first day shown that is not
 * gone by – at the nearest free hour of that day. Pure: the screens only open the window with what these give.
 */
import type { DayTypeId } from '@shared/model/settings'
import { weekday } from '@shared/time/zone'
import { startSearchFrom } from '../cases/casesUi'

/** Ctrl+N where every day shown is gone by (D6, P9): nothing opens, this says why. */
export const NO_NEW_DAY_TEXT = 'W tym widoku nie ma dnia od dziś – wróć do bieżącego okresu (Home).'

/** The first of `dates` (ascending) that is `today` or later; null – every day shown is gone by. */
export function newBlockDay(dates: readonly string[], today: string): string | null {
  return dates.find((d) => d >= today) ?? null
}

/** What a block of a day tells the search for a free hour. */
export interface BusySpan {
  startMin: number
  endMin: number
  background?: boolean
  /** A block taken off the day (parked, cancelled) does not take the place – as in the forecast of „Dziś”. */
  state?: string
}

/** The last minute a block of the new window may start at – a block of `lengthMin` still ends within the logical day plus its night (04:00). */
const DAY_END_MIN = 1680

/**
 * The nearest start from which `lengthMin` is free in the foreground of the day (the blocks in the background and the ones taken off the day do not take the place): today from
 * the next quarter after now (not before the wake), another day an hour after the wake – the rule of Ctrl+N of „Dziś” (`startSearchFrom`).
 */
export function freeHourStart(blocks: readonly BusySpan[], where: { isToday: boolean; nowMin: number; wakeMin: number }, lengthMin = 60): number {
  let at = startSearchFrom(where)
  for (const b of [...blocks].filter((x) => !x.background && x.state !== 'parked' && x.state !== 'cancelled').sort((a, b) => a.startMin - b.startMin)) {
    if (b.endMin <= at) continue
    if (b.startMin >= at + lengthMin) break
    at = Math.max(at, b.endMin)
  }
  return Math.min(at, DAY_END_MIN - lengthMin)
}

/** The wake the settings give a day whose own wake is not known (not read): the type in force (`dayType`) else the weekday's type. */
export function typeWakeMin(s: { dayTypes: Record<DayTypeId, { wakeMin: number }>; weekTypes: readonly DayTypeId[] }, date: string, dayType: string | null): number {
  const type = dayType != null && dayType in s.dayTypes ? (dayType as DayTypeId) : s.weekTypes[weekday(date) - 1]!
  return s.dayTypes[type].wakeMin
}
