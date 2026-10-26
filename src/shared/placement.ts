/**
 * Where the icon's panel and the desktop bar stand (spec „Widget”), pure. Both always stay in the work area of their
 * screen; the bar's width is the smaller of 480 DIP × the interface's scale and the work area's width less 16 DIP.
 */
import { clampInto, findDisplay, type DisplayInfo, type Rect } from './bounds'
import type { BarPlacement } from './machine'

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
  const display = displays.find((d) => contains(d.bounds, cursor.x, cursor.y)) ?? displays[0]!
  const wa = display.workArea
  // The cursor at the panel's bottom right corner (it was clicked from the taskbar, usually at the bottom right).
  return clampInto({ x: cursor.x - size.width, y: cursor.y - size.height, ...size }, wa)
}

export interface BarRect {
  bounds: Rect
  display: DisplayInfo
  /** The bar unfolds upwards (a group, the variants), or downwards when it stands at the top of its screen. */
  growsUp: boolean
}

/**
 * The desktop bar's rectangle: the saved place on its monitor (by name and bounds) or, by default, the left bottom
 * corner of the primary work area (above the taskbar). `height` is the folded bar's, `unfoldedHeight` the current one.
 */
export function barRect(placement: BarPlacement | null, displays: readonly DisplayInfo[], primary: DisplayInfo, zoom: number, height: number, unfoldedHeight = height): BarRect {
  const display = (placement && findDisplay(placement.display, displays)) ?? primary
  const wa = display.workArea
  const width = barWidth(wa, zoom)
  const folded = placement
    ? clampInto({ x: wa.x + placement.offset.x, y: wa.y + placement.offset.y, width, height }, wa)
    : clampInto({ x: wa.x + MARGIN, y: wa.y + wa.height - height - MARGIN, width, height }, wa)
  const growsUp = folded.y + folded.height / 2 >= wa.y + wa.height / 2
  const tall = Math.min(unfoldedHeight, wa.height)
  const y = growsUp ? folded.y + folded.height - tall : folded.y
  return { bounds: clampInto({ x: folded.x, y, width, height: tall }, wa), display, growsUp }
}

/** The corners the bar can be moved to (settings and the trial): the offset within the work area. */
export function cornerOffset(corner: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right', workArea: Rect, size: { width: number; height: number }): { x: number; y: number } {
  const right = workArea.width - size.width - MARGIN
  const bottom = workArea.height - size.height - MARGIN
  return {
    x: corner.endsWith('left') ? MARGIN : right,
    y: corner.startsWith('top') ? MARGIN : bottom
  }
}
