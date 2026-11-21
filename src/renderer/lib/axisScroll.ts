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
  /** Where the first card that asks you something stands (a morning plan not approved, a late wake, a ritual…), or null – none. The page never goes past it. */
  maxTop: number | null
}

/**
 * The scroll position the axis is put at (never above the top of the page); null – nothing to go by, the page stays as it is.
 * With „teraz” in view: it stands a third of the way down the part not covered by the heading. Otherwise the hour before the wake
 * is the first line – and an axis that begins at or after that hour changes nothing but the page's top (the cards above it stay in view).
 * Either way the page does not go past the top of the first card that asks you something (`maxTop`): its top stays in view.
 */
export function scrollTopFor(i: AxisScrollInput): number | null {
  const top = wanted(i)
  return top == null || i.maxTop == null ? top : Math.min(top, Math.max(0, Math.round(i.maxTop)))
}

function wanted(i: AxisScrollInput): number | null {
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
export function scrollAxis(box: HTMLElement, at: Omit<AxisScrollInput, 'viewH' | 'reserved' | 'maxTop'> & { reserved?: number; maxTop?: number | null }): number | null {
  const top = scrollTopFor({ ...at, reserved: at.reserved ?? 0, maxTop: at.maxTop ?? null, viewH: box.clientHeight })
  if (top == null) return null
  box.scrollTop = top
  return top
}

/** How long the following of the content lasts at most – a safety, the first action of yours ends it sooner. */
export const FOLLOW_MS = 60_000

/**
 * The page's content over the axis may still change after the axis was put (a strip of all-day events, a card that asks you something
 * arriving from a slow read, the chips of the calendars): `apply` – the measuring and setting of the axis – runs again whenever `content`
 * changes its size. It ends with the first thing that is not its own: the wheel over `box`, a press or a key anywhere in the window, any scroll of
 * `box` it did not make (`scrollIntoView` of a card or of the ritual: the position is not the one `apply` left), or `windowMs` (`FOLLOW_MS`).
 * While it lasts the browser does not keep the page in place by itself (`overflow-anchor`). Returns the stop, which says whether it ended the
 * following (true) or it was ended already (false) – a page leaving before that asks the axis to be put again at its next opening.
 * Without `ResizeObserver` it does nothing.
 */
export function followAxis(box: HTMLElement, content: HTMLElement, apply: () => void, windowMs = FOLLOW_MS): () => boolean {
  if (typeof ResizeObserver === 'undefined') return () => false
  let live = true
  const doc = box.ownerDocument
  const anchor = box.style.overflowAnchor
  box.style.overflowAnchor = 'none'
  // Where the page stands after `apply`: a scroll event that finds it elsewhere is somebody else's.
  let expected = box.scrollTop
  const observer = new ResizeObserver(() => {
    if (!live) return
    apply()
    expected = box.scrollTop
  })
  const stop = (): boolean => {
    if (!live) return false
    live = false
    observer.disconnect()
    clearTimeout(timer)
    box.style.overflowAnchor = anchor
    box.removeEventListener('wheel', stop, true)
    box.removeEventListener('scroll', moved)
    for (const type of ['pointerdown', 'touchstart', 'keydown']) doc.removeEventListener(type, stop, true)
    return true
  }
  const moved = (): void => {
    if (Math.abs(box.scrollTop - expected) > 1) stop()
  }
  const timer = setTimeout(stop, windowMs)
  box.addEventListener('wheel', stop, { capture: true, passive: true })
  box.addEventListener('scroll', moved, { passive: true })
  for (const type of ['pointerdown', 'touchstart']) doc.addEventListener(type, stop, { capture: true, passive: true })
  doc.addEventListener('keydown', stop, true)
  observer.observe(content)
  return stop
}
