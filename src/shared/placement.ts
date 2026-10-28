/**
 * Where the icon's panel and the desktop bar stand (spec „Widget”), pure. Both always stay in the work area of their
 * screen; the bar's width is the smaller of 480 DIP × the interface's scale and the work area's width less 16 DIP.
 */
import { clampInto, findDisplay, type DisplayInfo, type Rect } from './bounds'
import type { BarPlacement, BarSpot } from './machine'

export const BAR_BASE_WIDTH = 480
const MARGIN = 8

/** The width of the bar (and the panel) on a work area at a scale. */
export const barWidth = (workArea: Rect, zoom: number): number => Math.floor(Math.min(BAR_BASE_WIDTH * zoom, workArea.width - 16))

type Edge = 'bottom' | 'top' | 'left' | 'right'

/** The edge of the screen the taskbar stands at (from what the work area leaves out); bottom when nothing is left out. */
export function taskbarEdge(d: DisplayInfo): Edge {
  const b = d.bounds
  const w = d.workArea
  if (w.y + w.height < b.y + b.height) return 'bottom'
  if (w.y > b.y) return 'top'
  if (w.x > b.x) return 'left'
  if (w.x + w.width < b.x + b.width) return 'right'
  return 'bottom'
}

const contains = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height

/**
 * The icon's rectangle as Windows gave it, if it can be used: not empty, on a screen and outside its work area (on the
 * taskbar). Hidden under the arrow, Windows gives an empty rectangle or one somewhere else – then the cursor is used.
 */
export function usableIconRect(icon: Rect | null, displays: readonly DisplayInfo[]): { rect: Rect; display: DisplayInfo } | null {
  if (!icon || icon.width <= 0 || icon.height <= 0) return null
  const cx = icon.x + icon.width / 2
  const cy = icon.y + icon.height / 2
  const display = displays.find((d) => contains(d.bounds, cx, cy))
  if (!display || contains(display.workArea, cx, cy)) return null
  return { rect: icon, display }
}

/** The screen the panel opens on (its size is measured on it too): the usable icon's, or the cursor's. */
export function panelDisplay(icon: Rect | null, cursor: { x: number; y: number }, displays: readonly DisplayInfo[]): DisplayInfo {
  return usableIconRect(icon, displays)?.display ?? displays.find((d) => contains(d.bounds, cursor.x, cursor.y)) ?? displays[0]!
}

/** The panel's rectangle: by the icon, toward the screen's centre – or by the cursor; always inside the work area. */
export function panelRect(icon: Rect | null, cursor: { x: number; y: number }, displays: readonly DisplayInfo[], size: { width: number; height: number }): Rect {
  const at = usableIconRect(icon, displays)
  if (at) {
    const wa = at.display.workArea
    const cx = at.rect.x + at.rect.width / 2
    const cy = at.rect.y + at.rect.height / 2
    const edge = taskbarEdge(at.display)
    const r =
      edge === 'bottom'
        ? { x: cx - size.width / 2, y: wa.y + wa.height - size.height - MARGIN }
        : edge === 'top'
          ? { x: cx - size.width / 2, y: wa.y + MARGIN }
          : edge === 'left'
            ? { x: wa.x + MARGIN, y: cy - size.height / 2 }
            : { x: wa.x + wa.width - size.width - MARGIN, y: cy - size.height / 2 }
    return clampInto({ ...r, ...size }, wa)
  }
  const wa = panelDisplay(null, cursor, displays).workArea
  // The cursor at the panel's bottom right corner (it was clicked from the taskbar, usually at the bottom right).
  return clampInto({ x: cursor.x - size.width, y: cursor.y - size.height, ...size }, wa)
}

export interface BarRect {
  bounds: Rect
  display: DisplayInfo
  /** The bar unfolds upwards (a group, the variants), or downwards when it stands at the top of its screen. */
  growsUp: boolean
  /** The place it stands at (D304), or null – a place of its own, dragged (D303). */
  spot: BarSpot | null
}

/**
 * The desktop bar's rectangle: the saved place on its monitor (by name and bounds) or, by default and when that monitor
 * is gone (D303), the left bottom corner of the primary work area (above the taskbar). `height` is the folded bar's,
 * `unfoldedHeight` the current one.
 */
export function barRect(placement: BarPlacement | null, displays: readonly DisplayInfo[], primary: DisplayInfo, zoom: number, height: number, unfoldedHeight = height): BarRect {
  const saved = placement ? findDisplay(placement.display, displays) : null
  const display = saved ?? primary
  const wa = display.workArea
  const width = barWidth(wa, zoom)
  const kept = saved ? placement : null
  const spot = kept ? kept.spot : 'bottom-left'
  // A place picked is counted with the bar's size now (it grows with a question, with the scale): it keeps its margin.
  const offset = kept && !kept.spot ? kept.offset : spotOffset(spot ?? 'bottom-left', wa, { width, height })
  const folded = clampInto({ x: wa.x + offset.x, y: wa.y + offset.y, width, height }, wa)
  const growsUp = folded.y + folded.height / 2 >= wa.y + wa.height / 2
  const tall = Math.min(unfoldedHeight, wa.height)
  const y = growsUp ? folded.y + folded.height - tall : folded.y
  return { bounds: clampInto({ x: folded.x, y, width, height: tall }, wa), display, growsUp, spot }
}

/** A place's offset within the work area (the folded bar's top left corner), 8 DIP from the edges (D304). */
export function spotOffset(spot: BarSpot, workArea: Rect, size: { width: number; height: number }): { x: number; y: number } {
  const right = workArea.width - size.width - MARGIN
  const bottom = workArea.height - size.height - MARGIN
  return {
    x: spot.endsWith('left') ? MARGIN : spot.endsWith('right') ? right : Math.round((workArea.width - size.width) / 2),
    y: spot.startsWith('top') ? MARGIN : bottom
  }
}

/** The bar put to a place of a monitor (the settings' mock-up, the wizard). */
export function spotPlacement(display: DisplayInfo, spot: BarSpot, size: { width: number; height: number }): BarPlacement {
  return { display: { label: display.label, bounds: display.bounds }, spot, offset: spotOffset(spot, display.workArea, size) }
}

/**
 * Where a dragged bar stays (D303): a place of its own on the monitor under its middle (else the nearest), its folded
 * rectangle kept in that work area – unfolded upwards, the folded part is the bottom of the window.
 */
export function placementAfterDrag(bounds: Rect, displays: readonly DisplayInfo[], foldedHeight: number, growsUp: boolean): BarPlacement {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const dist = (r: Rect) => Math.hypot(Math.max(r.x - cx, 0, cx - (r.x + r.width)), Math.max(r.y - cy, 0, cy - (r.y + r.height)))
  const display = displays.find((d) => contains(d.bounds, cx, cy)) ?? [...displays].sort((a, b) => dist(a.bounds) - dist(b.bounds))[0]!
  const wa = display.workArea
  const top = growsUp ? bounds.y + bounds.height - foldedHeight : bounds.y
  const folded = clampInto({ x: bounds.x, y: top, width: bounds.width, height: foldedHeight }, wa)
  return { display: { label: display.label, bounds: display.bounds }, spot: null, offset: { x: folded.x - wa.x, y: folded.y - wa.y } }
}

/**
 * A drag of the bar whose end never came (its view reloaded) holds the layout at most this long after its last message
 * – long enough for a hand that holds the bar still while choosing its place (A4-12).
 */
export const DRAG_HOLD_MS = 2 * 60_000

/** The drag still holds the bar's layout (its last message `last`). */
export const dragHolds = (last: number, now: number): boolean => now - last < DRAG_HOLD_MS

/**
 * A drag of the bar (D303): its rectangle moved by the cursor's way, free across the monitors – kept only within the
 * box around their work areas; where it is let go, `placementAfterDrag` puts it into one of them.
 */
export function draggedBounds(start: Rect, from: { x: number; y: number }, to: { x: number; y: number }, displays: readonly DisplayInfo[]): Rect {
  const areas = displays.map((d) => d.workArea)
  const x = Math.min(...areas.map((a) => a.x))
  const y = Math.min(...areas.map((a) => a.y))
  const box = { x, y, width: Math.max(...areas.map((a) => a.x + a.width)) - x, height: Math.max(...areas.map((a) => a.y + a.height)) - y }
  return clampInto({ ...start, x: start.x + to.x - from.x, y: start.y + to.y - from.y }, box)
}
