/**
 * Something dragged from outside the axis of „Dziś” (a sprawa from the panel beside it, D384): the minute of the axis
 * under the pointer. The axis tells its own scale in `data-lo` and `data-ppm` (`Timeline`), so the code that drags needs
 * nothing of it but the element. Pure parts first (tests in `tests/web/cases-screens.test.ts`).
 */
import { MIN_BLOCK_MIN } from '@shared/model/plan'
import { gridMinute } from './gridCreate'

/** The width of the column of hours left of the axis – it counts as the axis too (as for a new block, D366). */
export const HOURS_PX = 46

/** The axis as the drop reads it: its rectangle on the screen, the minute at its top (`lo`) and bottom (`hi`), pixels a minute. */
export interface AxisPoint {
  rect: { left: number; right: number; top: number; bottom: number }
  lo: number
  hi: number
  ppm: number
}

/**
 * The minute under the pointer at (`x`, `y`), on the 5-min grid and at least 5 min before the axis's bottom (a block must
 * start where it can be drawn); null – the pointer is not over the axis (or its column of hours).
 */
export function dropMinute(p: AxisPoint, x: number, y: number): number | null {
  if (x < p.rect.left - HOURS_PX || x > p.rect.right || y < p.rect.top || y > p.rect.bottom) return null
  return Math.min(Math.max(gridMinute(y - p.rect.top, p.lo, p.ppm), p.lo), p.hi - MIN_BLOCK_MIN)
}

/** The axis of the day on the screen now (null – none shown). */
export function axisPoint(): AxisPoint | null {
  const el = document.querySelector<HTMLElement>('[data-testid="timeline-axis"]')
  const lo = Number(el?.dataset.lo)
  const hi = Number(el?.dataset.hi)
  const ppm = Number(el?.dataset.ppm)
  if (!el || !Number.isFinite(lo) || !Number.isFinite(hi) || !(ppm > 0)) return null
  const r = el.getBoundingClientRect()
  return { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, lo, hi, ppm }
}
