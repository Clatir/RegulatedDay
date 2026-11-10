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
 * The month whose goals the top of the page shows (T555): the current one when the week holds today, else the month of
 * the week's Thursday (the month most of its days belong to – on a turn of months the one with four of them).
 */
export function goalsMonthOfWeek(week: string, today: string): string {
  return today >= week && today <= addDays(week, 6) ? monthOfDate(today) : monthOfDate(addDays(week, 3))
}

/** The width of the small window of a new block (D366), pixels. */
export const NEW_BLOCK_WIDTH = 264
const POPOVER_GAP = 4

/**
 * Where the small window of a new block stands beside a column of the grid (D366): to the right of it when it fits within
 * the grid's width, else to its left; at `top` – never above the grid nor left of it. Pixels from the grid's corner.
 */
export function popoverPlace(o: { gridWidth: number; colLeft: number; colRight: number; top: number; width: number }): { left: number; top: number } {
  const right = o.colRight + POPOVER_GAP
  const left = right + o.width <= o.gridWidth ? right : o.colLeft - POPOVER_GAP - o.width
  return { left: Math.max(0, left), top: Math.max(0, o.top) }
}

/**
 * The column under `x` (D371: a drag over several days), among the rectangles the columns really have on the screen
 * (left to right): the one that holds `x`; in a gap, or beyond the first or the last (a drag may leave the grid) – the nearest.
 */
export function columnAt(x: number, cols: ReadonlyArray<{ left: number; right: number }>): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  cols.forEach((c, i) => {
    const distance = x < c.left ? c.left - x : x > c.right ? x - c.right : 0
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

/** A drag over the columns that has not changed (its columns and hours): nothing to draw again (D371). */
export function sameDrag(a: { from: number; to: number; range: { startMin: number; endMin: number } } | null, b: typeof a): boolean {
  return a === b || (a != null && b != null && a.from === b.from && a.to === b.to && a.range.startMin === b.range.startMin && a.range.endMin === b.range.endMin)
}

/** The columns from `a` to `b`, either way round (D371: a drag from the right to the left takes the same days). */
export function dayIndexes(a: number, b: number): number[] {
  const lo = Math.min(a, b)
  return Array.from({ length: Math.abs(a - b) + 1 }, (_, k) => lo + k)
}
