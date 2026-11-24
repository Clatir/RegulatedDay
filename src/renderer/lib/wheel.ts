/**
 * The mouse wheel over a number field (N8, D590, T2550), the rules the fields share:
 * - a page scroll in progress wins (`wheelClaim`): a turn over the field within `WHEEL_SCROLL_LATCH_MS` of the last wheel event beside
 *   it is left to the page – the content moving under a still cursor must not change a number. The wait is not renewed by the events
 *   over the field: a page scrolled to its end stops moving, and the field takes the wheel `WHEEL_SCROLL_LATCH_MS` after the last event
 *   beside it;
 * - a notch of a mouse is one step (`wheelInput`): Chromium's `wheelDelta*` is a multiple of 120 for a mouse, whatever the display
 *   scaling or the „lines per notch” setting – that many steps (usually 1); anything else (a touchpad, no `wheelDelta*`) sums the pixel
 *   deltas and makes a step each `WHEEL_NOTCH_PX`; lines and pages – one step per event;
 * - the horizontal wheel counts only with Shift and only as a mouse (`wheelDeltaX`); a touchpad's horizontal scroll with Shift is not
 *   taken (nor Ctrl / Meta – the zoom stays).
 * One listener on the window (capture, passive) keeps the time of the last event beside each field for all fields.
 */

/** A wheel event over a field this soon after one beside it belongs to the page's scrolling. */
export const WHEEL_SCROLL_LATCH_MS = 400
/** Pixels of small deltas (a touchpad) that make one step. */
export const WHEEL_NOTCH_PX = 100
/** The sum of small deltas is forgotten after this long without an event. */
export const WHEEL_SUM_RESET_MS = 400
/** `wheelDelta*` of one notch of a mouse (Chromium). */
export const WHEEL_DELTA_NOTCH = 120

// The latest wheel event's target and time (A) and the latest one on another target than A's (B): for a field, whichever is not the field.
let latest: { el: EventTarget | null; at: number } | null = null
let before: { el: EventTarget | null; at: number } | null = null
let installed = false
let sums = new WeakMap<Element, { sum: number; at: number }>()

function track(e: WheelEvent): void {
  const at = Date.now()
  if (latest && latest.el !== e.target) before = latest
  latest = { el: e.target, at }
}

/** Starts the one listener of the window (once). */
export function trackWheel(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('wheel', track, { capture: true, passive: true })
}

/** Forgets what the wheel did (tests – nothing carries over from one test to the next). */
export function resetWheel(): void {
  latest = null
  before = null
  sums = new WeakMap()
}

/**
 * Does the turn over `field` belong to the field? False – a page scroll is going on, the event is left to the page (no `preventDefault`,
 * no step). Called for the event that `trackWheel`'s listener has already seen (capture on the window comes first).
 */
export function wheelClaim(field: Element, now = Date.now()): boolean {
  const outside = latest && latest.el !== field ? latest : before && before.el !== field ? before : null
  return outside == null || now - outside.at >= WHEEL_SCROLL_LATCH_MS
}

/** The non-standard fields of Chromium's wheel event. */
type WheelLike = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey' | 'ctrlKey' | 'metaKey'> & { wheelDelta?: number; wheelDeltaX?: number; wheelDeltaY?: number }

/** What a turn of the wheel says: whole `notches` (+ up, − down) of a mouse / lines, or `px` of pixels to sum (− up); null – not the field's. */
export type WheelInput = { notches: number } | { px: number } | null

const isNotch = (n: number | undefined): n is number => n != null && n !== 0 && n % WHEEL_DELTA_NOTCH === 0

/** Reads the event (see the rules above). Ctrl / Meta and a horizontal turn without Shift or of a touchpad – null. */
export function wheelInput(e: WheelLike): WheelInput {
  if (e.ctrlKey || e.metaKey) return null
  if (e.deltaY !== 0) {
    if (e.deltaMode !== 0) return { notches: e.deltaY < 0 ? 1 : -1 }
    const wd = e.wheelDeltaY ?? e.wheelDelta
    return isNotch(wd) ? { notches: wd / WHEEL_DELTA_NOTCH } : { px: e.deltaY }
  }
  // Shift turns the wheel horizontal in Chromium on Windows (`deltaY` 0, `deltaX` set).
  if (!e.shiftKey || e.deltaX === 0) return null
  if (e.deltaMode !== 0) return { notches: e.deltaX < 0 ? 1 : -1 }
  return isNotch(e.wheelDeltaX) ? { notches: e.wheelDeltaX / WHEEL_DELTA_NOTCH } : null
}

/**
 * The steps of a read turn: a whole number, + up (a number up), − down, 0 – none yet (a touchpad's small deltas sum up to
 * `WHEEL_NOTCH_PX`; a change of direction or `WHEEL_SUM_RESET_MS` of quiet starts the sum again, what is over a whole step is kept).
 */
export function wheelSteps(field: Element, input: NonNullable<WheelInput>, now = Date.now()): number {
  if ('notches' in input) {
    sums.delete(field)
    return input.notches
  }
  const d = input.px
  const was = sums.get(field)
  const start = was && now - was.at < WHEEL_SUM_RESET_MS && Math.sign(was.sum) === Math.sign(d) ? was.sum : 0
  const sum = start + d
  const whole = Math.trunc(Math.abs(sum) / WHEEL_NOTCH_PX)
  sums.set(field, { sum: Math.sign(sum) * (Math.abs(sum) - whole * WHEEL_NOTCH_PX), at: now })
  return -Math.sign(sum) * whole
}
