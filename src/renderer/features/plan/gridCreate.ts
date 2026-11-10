/**
 * A new block taken from the grid of time (D366): the minute under a pointer and the range a drag over an empty place
 * gives – on the 5-min grid of the dragging (D305), never shorter than 5 min. Pure; `gridDrag.tsx` holds the gesture.
 */
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN } from '@shared/model/plan'

/** A drag starts past 4 px – a shorter move is a click (D305, D366). */
export const DRAG_FROM_PX = 4

/** The length of a new block that was only clicked, or dragged across days without a move up or down (D366, D371). */
export const DEFAULT_NEW_BLOCK_MIN = 60

/**
 * A move of the pointer by (`dx`, `dy`) pixels from where it went down is a drag, not a click. On a single column (`'y'`,
 * the axes of „Dziś” and „Szablony”) only the move up or down counts, as before D366; where a move to the side means
 * something too (`'xy'`, the columns of „Tydzień”, D371) – the distance, either way.
 */
export const dragStarted = (dx: number, dy: number, axis: 'y' | 'xy' = 'xy'): boolean => (axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy)) >= DRAG_FROM_PX

/** The planned span of a block taken from the grid (logical minutes). */
export interface GridRange {
  startMin: number
  endMin: number
}

/** A minute on the 5-min grid (the nearest). */
export const snapMinute = (min: number): number => Math.round(min / DRAG_STEP_MIN) * DRAG_STEP_MIN

/** The minute at `px` from the top of a column whose top is `lo` minutes, `ppm` pixels a minute – as it is, off the grid. */
export const minuteAtPx = (px: number, lo: number, ppm: number): number => lo + px / ppm

/** The minute under `px`, on the 5-min grid. */
export const gridMinute = (px: number, lo: number, ppm: number): number => snapMinute(minuteAtPx(px, lo, ppm))

/**
 * The range of a drag from `fromPx` to `toPx` (either way) on a column: both ends on the 5-min grid, kept within the
 * column (`lo`–`hi` minutes); the end under 5 min after the start goes to 5 min (the start stays – at the bottom edge the
 * start goes up instead, the end never past `hi`), and never past the longest block (24 h). A drag that did not move up or
 * down (both ends on the same minute of the grid before they were kept within the column – a drag across the days, D371)
 * is `flatMin` long when that is given, as a click is, but no longer than the column holds.
 */
export function gridRange(fromPx: number, toPx: number, lo: number, hi: number, ppm: number, flatMin?: number): GridRange {
  const clamp = (min: number) => Math.min(Math.max(min, lo), hi)
  const top = minuteAtPx(Math.min(fromPx, toPx), lo, ppm)
  const bottom = minuteAtPx(Math.max(fromPx, toPx), lo, ppm)
  const a = snapMinute(clamp(top))
  const b = snapMinute(clamp(bottom))
  const shortest = snapMinute(top) === snapMinute(bottom) && flatMin != null ? flatMin : MIN_BLOCK_MIN
  const end = Math.min(Math.max(b, a + shortest), a + MAX_BLOCK_MIN)
  // Kept within the column: what would end past its bottom ends there, the start going up if it must for 5 min.
  return end > hi ? { startMin: Math.min(a, hi - MIN_BLOCK_MIN), endMin: hi } : { startMin: a, endMin: end }
}
