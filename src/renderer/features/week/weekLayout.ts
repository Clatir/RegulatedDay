/**
 * The layout of „Tydzień” (D356): the common axis of hours in pixels, a block's place on it, blocks that overlap in a day
 * side by side, and which month's goals the top of the page shows. Pure – the screen only draws what these give.
 */
import { monthOfDate } from '@shared/model/goals'
import { addDays } from '@shared/time/zone'

/** Pixels a minute takes on the axis (a 16-hour day is about 770 px; the day's plan has 1.1). */
export const WEEK_PPM = 0.8
/** The shortest a block is drawn (a 5-minute block stays a line of text). */
export const WEEK_MIN_BLOCK_PX = 14

/** The axis in whole hours around `from`–`to` (logical minutes). */
export function axisRange(from: number, to: number): { lo: number; hi: number } {
  const lo = Math.floor(from / 60) * 60
  const hi = Math.max(lo + 60, Math.ceil(to / 60) * 60)
  return { lo, hi }
}

/** The height of the axis in pixels. */
export const axisHeight = (lo: number, hi: number): number => Math.round((hi - lo) * WEEK_PPM)

/** The marks of the hours: every full hour from `lo` to `hi`. */
export function hourMarks(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let h = lo; h <= hi; h += 60) out.push(h)
  return out
}

/** A minute's distance from the top of the axis, in pixels. */
export const axisY = (min: number, lo: number): number => Math.round((min - lo) * WEEK_PPM * 10) / 10

/** Where a block sits on the axis: its top and height in pixels (never shorter than `WEEK_MIN_BLOCK_PX`). */
export function blockSpan(b: { startMin: number; endMin: number }, lo: number): { top: number; height: number } {
  return { top: axisY(b.startMin, lo), height: Math.max(WEEK_MIN_BLOCK_PX, Math.round((b.endMin - b.startMin) * WEEK_PPM * 10) / 10 - 1) }
}

export interface Lane<T> {
  item: T
  /** The lane the block takes (0 – the first, from the left). */
  lane: number
  /** How many lanes its cluster of overlapping blocks has: its width is 1 / lanes. */
  lanes: number
}

/**
 * Blocks of one day side by side where they overlap (a block in the background, a collision): in time order each takes the
 * first lane that is free at its start; blocks that touch through a chain of overlaps share the same number of lanes, the
 * rest of the day keeps the whole width.
 */
export function laneLayout<T extends { startMin: number; endMin: number }>(items: readonly T[]): Array<Lane<T>> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const out: Array<Lane<T>> = []
  let cluster: Array<Lane<T>> = []
  let laneEnds: number[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY
  const close = () => {
    for (const l of cluster) l.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }
  for (const item of sorted) {
    if (item.startMin >= clusterEnd) close()
    let lane = laneEnds.findIndex((end) => end <= item.startMin)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = item.endMin
    clusterEnd = Math.max(clusterEnd, item.endMin)
    const placed: Lane<T> = { item, lane, lanes: 1 }
    cluster.push(placed)
    out.push(placed)
  }
  close()
  return out
}

/**
 * The month whose goals the top of the page shows (T-nowa): the current one when the week holds today, else the month of
 * the week's Thursday (the month most of its days belong to – on a turn of months the one with four of them).
 */
export function goalsMonthOfWeek(week: string, today: string): string {
  return today >= week && today <= addDays(week, 6) ? monthOfDate(today) : monthOfDate(addDays(week, 3))
}
