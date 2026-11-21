/**
 * Where an axis of hours stands when its page opens or is returned to (D563, P6): today – the line „teraz” a third of the way
 * down the visible part; any other day (or a range without today) – the axis from an hour before the wake, so that the empty
 * night is not the first thing on the screen. Pure pixels here (`scrollTopFor`), the DOM only measures and sets (`scrollAxis`).
 */

/** Where „teraz” stands in the visible part: a third of its height from the top. */
export const NOW_FRACTION = 1 / 3
/** How long before the wake an axis of another day starts, in minutes. */
export const BEFORE_WAKE_MIN = 60

/** What the scroll is counted from – every distance in pixels from the top of the scrolled content. */
export interface AxisScrollInput {
  /** Where the axis' first hour is. */
  axisTop: number
  /** Where „teraz” is, or null – today is not in view (or now lies off the axis). */
  nowY: number | null
  /** Where the wake is, or null – no day with a known wake. */
  wakeY: number | null
  /** What an hour takes on the axis. */
  hourPx: number
  /** The part of the scrolled box a sticky heading covers at its top. */
  reserved: number
  /** The height of the scrolled box. */
  viewH: number
}

/**
 * The scroll position the axis is put at (never above the top of the page); null – nothing to go by, the page stays as it is.
 * With „teraz” in view: it stands a third of the way down the part not covered by the heading. Otherwise the hour before the wake
 * is the first line – and an axis that begins at or after that hour changes nothing but the page's top (the cards above it stay in view).
 */
export function scrollTopFor(i: AxisScrollInput): number | null {
  const visible = Math.max(0, i.viewH - i.reserved)
  if (i.nowY != null) return Math.max(0, Math.round(i.nowY - i.reserved - visible * NOW_FRACTION))
  if (i.wakeY == null) return null
  const from = i.wakeY - (BEFORE_WAKE_MIN / 60) * i.hourPx
  return from <= i.axisTop ? 0 : Math.max(0, Math.round(from - i.reserved))
}

/** The nearest ancestor of `el` that scrolls vertically (by its own style), or null. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if (y === 'auto' || y === 'scroll') return p
  }
  return null
}

/** The distance of `el`'s top from the top of `box`'s scrolled content. */
export const contentTop = (el: Element, box: HTMLElement): number => el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop

/**
 * Sets `box` at the position `scrollTopFor` gives (at once, no animation). `at` – the positions as the caller measured them
 * (`axisTop`, `nowY`, `wakeY` from `contentTop`); `reserved` – a sticky heading over the top of the box. Returns the position set, or null.
 */
export function scrollAxis(box: HTMLElement, at: Omit<AxisScrollInput, 'viewH' | 'reserved'> & { reserved?: number }): number | null {
  const top = scrollTopFor({ ...at, reserved: at.reserved ?? 0, viewH: box.clientHeight })
  if (top == null) return null
  box.scrollTop = top
  return top
}
