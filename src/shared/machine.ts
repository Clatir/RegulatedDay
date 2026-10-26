/**
 * The settings of this computer (spec „Macierz ustawień”, rows „na komputerze”): kept in config.json of the app data,
 * never synced. Every value read is checked – a wrong one falls back to its default, never breaks the start.
 */
import type { Rect } from './bounds'

/** Where the desktop bar stands on this computer (spec „Widget”): the monitor by its name and bounds, never its number. */
export interface BarPlacement {
  display: { label: string; bounds: Rect }
  /** The bar's top-left corner relative to the work area's top-left, in DIP. */
  offset: { x: number; y: number }
}

export interface MachinePrefs {
  /** The interface's scale (90–150 %), in every window at once. */
  zoom: number
  /** Brightness of the backgrounds, graphics and accents (50–100 %); the text keeps its contrast. */
  brightness: number
  /** The room's motion and the bar's optional pulse; off = the colour alone. */
  animations: boolean
  /** The desktop bar under the windows (on by default, off on any computer). */
  desktopBar: boolean
  /** The icon's panel and the desktop bar stay out of recordings and screen sharing. */
  hideFromCapture: boolean
  /** null = the default: the left bottom corner of the primary work area. */
  barPlacement: BarPlacement | null
  /** Filters of the lists, remembered one way, on this computer (spec „Listy i filtry”). */
  filters: Record<string, string[]>
}

export const ZOOM_STEPS = [0.9, 1, 1.1, 1.25, 1.5] as const
export const BRIGHTNESS_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const

export const DEFAULT_MACHINE_PREFS: MachinePrefs = {
  zoom: 1,
  brightness: 1,
  animations: true,
  desktopBar: true,
  hideFromCapture: true,
  barPlacement: null,
  filters: {}
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const isRect = (v: unknown): v is Rect =>
  !!v && typeof v === 'object' && ['x', 'y', 'width', 'height'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number' && Number.isFinite((v as Record<string, number>)[k]))

function placementFrom(v: unknown): BarPlacement | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Partial<BarPlacement>
  const d = p.display
  const o = p.offset
  if (!d || typeof d.label !== 'string' || !isRect(d.bounds) || !o || typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return null
  return { display: { label: d.label, bounds: { ...d.bounds } }, offset: { x: o.x, y: o.y } }
}

function filtersFrom(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === 'string').slice(0, 200)
  }
  return out
}

/** The settings from what config.json holds (anything else: the defaults). */
export function machinePrefsFrom(raw: unknown): MachinePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    zoom: num(r.zoom, 0.9, 1.5, DEFAULT_MACHINE_PREFS.zoom),
    brightness: num(r.brightness, 0.5, 1, DEFAULT_MACHINE_PREFS.brightness),
    animations: bool(r.animations, DEFAULT_MACHINE_PREFS.animations),
    desktopBar: bool(r.desktopBar, DEFAULT_MACHINE_PREFS.desktopBar),
    hideFromCapture: bool(r.hideFromCapture, DEFAULT_MACHINE_PREFS.hideFromCapture),
    barPlacement: placementFrom(r.barPlacement),
    filters: filtersFrom(r.filters)
  }
}

/** A change from a window, checked: unknown keys and wrong values are dropped. */
export function patchMachinePrefs(prefs: MachinePrefs, patch: unknown): MachinePrefs {
  if (!patch || typeof patch !== 'object') return prefs
  return machinePrefsFrom({ ...prefs, ...(patch as Record<string, unknown>) })
}
