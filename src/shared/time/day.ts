/**
 * The logical day (spec „Dzień i czas”): from 04:00 to 04:00 Polish time; work after midnight belongs to the day before.
 * A day's id is its date. Times of a day are „logical minutes”: minutes since 00:00 of its date, 240–1679, where
 * 1440–1679 is 00:00–03:59 of the night after („+1”). The one definition of „which day” – every module asks here.
 */
import { LOGICAL_DAY_START_MIN } from '../format'
import { HOUR, MINUTE, PL_ZONE, addDays, placeWall, resolveWall, wallOf, weekday, type Instant, type Resolved, type WallPick } from './zone'

export { LOGICAL_DAY_START_MIN }
/** The end of the logical day in logical minutes (04:00 of the next date). */
export const LOGICAL_DAY_END_MIN = LOGICAL_DAY_START_MIN + 1440

const startCache = new Map<string, Instant>()

/** The instant the logical day `date` starts: 04:00 Polish time (never in a doubled or skipped hour). */
export function dayStart(date: string): Instant {
  let at = startCache.get(date)
  if (at === undefined) {
    at = placeWall(PL_ZONE, date, LOGICAL_DAY_START_MIN)
    if (startCache.size > 50_000) startCache.clear()
    startCache.set(date, at)
  }
  return at
}

/** The instant the logical day `date` ends (the next one starts): 23, 24 or 25 h after its start. */
export function dayEnd(date: string): Instant {
  return dayStart(addDays(date, 1))
}

/** The logical day `at` belongs to. */
export function logicalDayOf(at: Instant): string {
  const wall = wallOf(PL_ZONE, at)
  return wall.minutes < LOGICAL_DAY_START_MIN ? addDays(wall.date, -1) : wall.date
}

/** The Monday of the week of `date` (weeks, streaks and cassettes count in logical days from Monday). */
export function weekStart(date: string): string {
  return addDays(date, 1 - weekday(date))
}

/** The calendar date and its minutes for a logical minute of `date` (1440 and later: the next date). */
function calendarOf(date: string, logicalMin: number): { date: string; minutes: number } {
  return logicalMin >= 1440 ? { date: addDays(date, 1), minutes: logicalMin - 1440 } : { date, minutes: logicalMin }
}

/**
 * A logical minute of `date` as typed (spec „Dzień i czas”): 00:00–03:59 is the next date; the doubled hour means the
 * first occurrence unless `pick` is 'second'; a skipped hour is refused.
 */
export function resolveLogical(date: string, logicalMin: number, pick: WallPick = 'first'): Resolved {
  const c = calendarOf(date, logicalMin)
  return resolveWall(PL_ZONE, c.date, c.minutes, pick)
}

/** A logical minute of `date` placed anyway (templates, plans): a skipped time goes to the first instant after it. */
export function placeLogical(date: string, logicalMin: number): Instant {
  const c = calendarOf(date, logicalMin)
  return placeWall(PL_ZONE, c.date, c.minutes)
}

/**
 * The logical minute of `date` an instant shows on the Polish clock (for display and for templates read back). A
 * doubled hour shows the same minutes twice – the instant, not this number, is the truth.
 */
export function logicalMinuteOf(date: string, at: Instant): number {
  const wall = wallOf(PL_ZONE, at)
  if (wall.date === date) return wall.minutes
  if (wall.date === addDays(date, 1)) return wall.minutes + 1440
  return (at - dayStart(date)) / MINUTE + LOGICAL_DAY_START_MIN
}

/** The length of the logical day `date` in minutes (1380, 1440 or 1500). */
export function dayLengthMin(date: string): number {
  return Math.round((dayEnd(date) - dayStart(date)) / MINUTE)
}

/** True when the day's clock changes (a 23- or 25-hour day). */
export function isClockChangeDay(date: string): boolean {
  return dayEnd(date) - dayStart(date) !== 24 * HOUR
}
