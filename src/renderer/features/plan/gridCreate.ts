/**
 * A new block taken from the grid of time (D366): the minute under a pointer and the range a drag over an empty place
 * gives – on the 5-min grid of the dragging (D305), never shorter than 5 min. Pure; `gridDrag.tsx` holds the gesture.
 */
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN } from '@shared/model/plan'

/** A drag starts past 4 px – a shorter move is a click (D305, D366). */
export const DRAG_FROM_PX = 4

/** The length of a new block that was only clicked, or dragged across days without a move up or down (D366, D371). */
export const DEFAULT_NEW_BLOCK_MIN = 60

/** A move of the pointer by (`dx`, `dy`) pixels from where it went down is a drag, not a click: the distance, either way (D371). */
export const dragStarted = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_FROM_PX

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
 * column (`lo`–`hi` minutes); the end under 5 min after the start goes to 5 min (the start stays), and never past the
 * longest block (24 h). A drag that did not move up or down (both ends on the same minute of the grid – a drag across the
 * days, D371) is `flatMin` long when that is given, as a click is.
 */
export function gridRange(fromPx: number, toPx: number, lo: number, hi: number, ppm: number, flatMin?: number): GridRange {
  const clamp = (min: number) => Math.min(Math.max(min, lo), hi)
  const a = snapMinute(clamp(minuteAtPx(Math.min(fromPx, toPx), lo, ppm)))
  const b = snapMinute(clamp(minuteAtPx(Math.max(fromPx, toPx), lo, ppm)))
  const shortest = b === a && flatMin != null ? flatMin : MIN_BLOCK_MIN
  return { startMin: a, endMin: Math.min(Math.max(b, a + shortest), a + MAX_BLOCK_MIN) }
}
