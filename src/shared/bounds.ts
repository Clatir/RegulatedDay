// adapted from FI src/shared/bounds.ts @ de81f2b
/**
 * The windows' places against the displays there are now (FI B54): a window closed on a monitor that is gone would open
 * off every screen – only its button on the taskbar to see. Spec „Widget”: after a monitor is unplugged every window,
 * also the main one, comes back to a visible screen; a monitor is recognised by its name and bounds, never its number.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The main window's smallest size (spec „Dostępność”); a smaller work area gets the whole work area. */
export const MIN_WINDOW = { width: 1024, height: 700 }
export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 }
/** The title bar must show this much on some display for the saved place to stay. */
const TITLE_BAR = 32
const MIN_VISIBLE_WIDTH = 100

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/**
 * Bounds for the main window: the saved place when its title bar shows on one of the work areas; otherwise none (the
 * window centres) and the size within the primary display's work area.
 */
export function windowBounds(saved: Partial<Rect> | null | undefined, workAreas: readonly Rect[], primary: Rect): { x?: number; y?: number; width: number; height: number } {
  const width = saved?.width ?? DEFAULT_WINDOW_SIZE.width
  const height = saved?.height ?? DEFAULT_WINDOW_SIZE.height
  const { x, y } = saved ?? {}
  if (x != null && y != null) {
    const shows = workAreas.some((a) => overlap(x, x + width, a.x, a.x + a.width) >= MIN_VISIBLE_WIDTH && overlap(y, y + TITLE_BAR, a.y, a.y + a.height) >= TITLE_BAR)
    if (shows) return { x, y, width, height }
  }
  return { width: Math.min(width, primary.width), height: Math.min(height, primary.height) }
}

/** The main window's minimum: 1024×700, or the whole work area when it is smaller (the content scrolls vertically). */
export function minimumSize(workArea: Rect): { width: number; height: number } {
  return { width: Math.min(MIN_WINDOW.width, workArea.width), height: Math.min(MIN_WINDOW.height, workArea.height) }
}

/** `r` moved (not resized when it fits) into `area`; a bigger one is cut to it. */
export function clampInto(r: Rect, area: Rect): Rect {
  const width = Math.min(r.width, area.width)
  const height = Math.min(r.height, area.height)
  const x = Math.min(Math.max(r.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(r.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * The display a saved place belongs to: the one with the same name and bounds, else the same name, else the same bounds;
 * null = it is not there now.
 */
export function findDisplay(saved: { label: string; bounds: Rect }, displays: readonly DisplayInfo[]): DisplayInfo | null {
  return (
    displays.find((d) => d.label === saved.label && sameRect(d.bounds, saved.bounds)) ??
    displays.find((d) => !!saved.label && d.label === saved.label) ??
    displays.find((d) => sameRect(d.bounds, saved.bounds)) ??
    null
  )
}
