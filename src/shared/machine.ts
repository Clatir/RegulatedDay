/**
 * The settings of this computer (spec „Macierz ustawień”, rows „na komputerze”): kept in config.json of the app data,
 * never synced. Every value read is checked – a wrong one falls back to its default, never breaks the start.
 */
import type { Rect } from './bounds'

/** The places the bar can be put to on a monitor (D304): the corners and the middles of the top and bottom edges. */
export type BarSpot = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export const BAR_SPOTS: readonly BarSpot[] = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

/** Where the desktop bar stands on this computer (spec „Widget”): the monitor by its name and bounds, never its number. */
export interface BarPlacement {
  display: { label: string; bounds: Rect }
  /**
   * A place picked (D304) – counted anew with the bar's size and the scale, so it keeps its margin – or null: a place of
   * your own, dragged by the handle (D303), at `offset`.
   */
  spot: BarSpot | null
  /** The folded bar's top-left corner relative to the work area's top-left, in DIP. */
  offset: { x: number; y: number }
}

export interface MachinePrefs {
  /** The interface's scale (90–150 %), in every window at once. */
  zoom: number
  /** Brightness of the backgrounds, graphics and accents (50–100 %); the text keeps its contrast. */
  brightness: number
  /** The room's motion and the bar's optional pulse; off = the colour alone. */
  animations: boolean
  /** The desktop bar beats softly at 5 and 0 min (D225, off by default; without animations the colour alone). */
  barPulse: boolean
  /** The desktop bar under the windows (on by default, off on any computer). */
  desktopBar: boolean
  /** The icon's panel and the desktop bar stay out of recordings and screen sharing. */
  hideFromCapture: boolean
  /** null = the default: the left bottom corner of the primary work area. */
  barPlacement: BarPlacement | null
  /** Filters of the lists, remembered one way, on this computer (spec „Listy i filtry”). */
  filters: Record<string, string[]>
  /**
   * „Używam tego komputera na zajęciach stacjonarnych” (D224): on it the question whether classes ended early is never
   * asked, the end of classes and the commute comes from the plan.
   */
  stationaryClasses: boolean
  /** An extra place for backups outside OneDrive: this computer copies the newest backup there (spec „Kopie zapasowe”). */
  backupDir: string | null
  /** „Zawsze na wierzchu” (D291): off (D229), the desktop bar, or the desktop bar and the icon's panel. */
  onTop: OnTop
  /** The session mode and the class mode on this computer (off: the widget behaves as usual then). */
  sessionMode: boolean
  classMode: boolean
  /** Windows notifications by event (spec „Powiadomienia i dźwięki”, D230: these on by default). */
  notices: Record<NoticeKind, boolean>
  /** The bar's quiet tones at 5 and 0 min (off by default), with their own volume (0.1–1). */
  sound: boolean
  soundVolume: number
}

export type OnTop = 'off' | 'bar' | 'barPanel'
export const ON_TOP: readonly OnTop[] = ['off', 'bar', 'barPanel']

/** The notifications on by default (D230): 5 min before a block waiting for „Zacznij”, classes and the commute; the hard end; the reserve. */
export type NoticeKind = 'start5' | 'hardEnd' | 'reserve'
export const NOTICE_KINDS: readonly NoticeKind[] = ['start5', 'hardEnd', 'reserve']

export const ZOOM_STEPS = [0.9, 1, 1.1, 1.25, 1.5] as const
export const BRIGHTNESS_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const

export const DEFAULT_MACHINE_PREFS: MachinePrefs = {
  zoom: 1,
  brightness: 1,
  animations: true,
  barPulse: false,
  desktopBar: true,
  hideFromCapture: true,
  barPlacement: null,
  filters: {},
  stationaryClasses: false,
  backupDir: null,
  onTop: 'off',
  sessionMode: true,
  classMode: true,
  notices: { start5: true, hardEnd: true, reserve: true },
  sound: false,
  soundVolume: 0.5
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
  // Saved before 0.10.0 without a place: its own (the corner's offset then kept as it was).
  const spot = BAR_SPOTS.includes(p.spot as BarSpot) ? (p.spot as BarSpot) : null
  return { display: { label: d.label, bounds: { ...d.bounds } }, spot, offset: { x: o.x, y: o.y } }
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
    barPulse: bool(r.barPulse, DEFAULT_MACHINE_PREFS.barPulse),
    desktopBar: bool(r.desktopBar, DEFAULT_MACHINE_PREFS.desktopBar),
    hideFromCapture: bool(r.hideFromCapture, DEFAULT_MACHINE_PREFS.hideFromCapture),
    barPlacement: placementFrom(r.barPlacement),
    filters: filtersFrom(r.filters),
    stationaryClasses: bool(r.stationaryClasses, DEFAULT_MACHINE_PREFS.stationaryClasses),
    backupDir: typeof r.backupDir === 'string' && r.backupDir.trim() ? r.backupDir.slice(0, 1000) : null,
    onTop: ON_TOP.includes(r.onTop as OnTop) ? (r.onTop as OnTop) : DEFAULT_MACHINE_PREFS.onTop,
    sessionMode: bool(r.sessionMode, DEFAULT_MACHINE_PREFS.sessionMode),
    classMode: bool(r.classMode, DEFAULT_MACHINE_PREFS.classMode),
    notices: Object.fromEntries(NOTICE_KINDS.map((k) => [k, bool((r.notices as Record<string, unknown> | undefined)?.[k], DEFAULT_MACHINE_PREFS.notices[k])])) as Record<NoticeKind, boolean>,
    sound: bool(r.sound, DEFAULT_MACHINE_PREFS.sound),
    soundVolume: num(r.soundVolume, 0.1, 1, DEFAULT_MACHINE_PREFS.soundVolume)
  }
}

/** A change from a window, checked: unknown keys and wrong values are dropped. */
export function patchMachinePrefs(prefs: MachinePrefs, patch: unknown): MachinePrefs {
  if (!patch || typeof patch !== 'object') return prefs
  return machinePrefsFrom({ ...prefs, ...(patch as Record<string, unknown>) })
}
