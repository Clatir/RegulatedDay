/**
 * A double click on a free spot of the desktop bar opens the main window (D560, T1976): two releases of the left button
 * within `BAR_DOUBLE_MS`, at most `BAR_DOUBLE_PX` apart, both beside every control. Counted from the releases – the window
 * without activation often never hears the press (T1500), so Chromium's own `dblclick` (counted from the presses) misses it.
 */

/** The time of a double click as Windows sets it by default (fixed – not read from the system's own setting, T1976). */
export const BAR_DOUBLE_MS = 500
/**
 * How far the second release may land from the first (screen px, either way) – farther is two clicks of two spots. Wider
 * than Windows' own ±2 px on purpose: a touchpad's tap moves the cursor a little (T1976).
 */
export const BAR_DOUBLE_PX = 4

/** One release of the left button on a free spot: when (the event's own time) and where on the screen. */
export interface BarRelease {
  at: number
  x: number
  y: number
}

/**
 * What acts by itself – a release on it is never a half of the bar's double click, nor a click of the icon's panel's free
 * spot (D558; a label passes its click to its own). One list for both.
 */
export const OWN = 'button, a, input, textarea, select, label, [role="button"], [contenteditable]:not([contenteditable="false"])'

/** A spot of the bar that is free: not a control, nor inside one. */
export const freeSpot = (el: EventTarget | null): boolean => el instanceof Element && !el.closest(OWN)

/** The second release of a double click: the first one waits, within the time and the distance. */
export function secondRelease(first: BarRelease | null, now: BarRelease): boolean {
  if (!first) return false
  const dt = now.at - first.at
  return dt >= 0 && dt <= BAR_DOUBLE_MS && Math.abs(now.x - first.x) <= BAR_DOUBLE_PX && Math.abs(now.y - first.y) <= BAR_DOUBLE_PX
}
