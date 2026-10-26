/**
 * The minute grid of a logical day: the engine counts in whole minutes since the day's 04:00 (index 0), 1380, 1440 or
 * 1500 of them (spec „Każda minuta pracy jest klasyfikowana … według wartości obowiązujących w chwili jej
 * rozpoczęcia”). Instants of events are rounded to the nearest minute (T412): a click at 10:00:40 counts from 10:01.
 * Plan times (logical minutes) go through the Polish clock, so a 25-hour day has its doubled hour twice.
 */
import { dayLengthMin, dayStart, placeLogical } from '../time/day'
import { MINUTE } from '../time/zone'

export interface Grid {
  date: string
  /** The instant of index 0 (04:00). */
  start: number
  /** Minutes in the day. */
  length: number
}

export function gridOf(date: string): Grid {
  return { date, start: dayStart(date), length: dayLengthMin(date) }
}

/** The index of an instant, rounded to the nearest minute (may fall outside the day). */
export const idxOf = (g: Grid, at: number): number => Math.round((at - g.start) / MINUTE)

/** The instant of an index. */
export const atOf = (g: Grid, idx: number): number => g.start + idx * MINUTE

/** The index of a logical minute of the plan (a skipped hour goes to the first minute after it). */
export const idxOfLogical = (g: Grid, logicalMin: number): number => idxOf(g, placeLogical(g.date, logicalMin))

/** An index kept within the day [0, length]. */
export const clampIdx = (g: Grid, idx: number): number => Math.max(0, Math.min(g.length, idx))
