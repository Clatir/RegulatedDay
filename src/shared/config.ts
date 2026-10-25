/**
 * config.json – the settings of this computer in its app data (spec „Dane, komputery i ustawienia”). It has a format
 * number that never changes in 1.x: it only grows by new fields, and every version keeps the fields it does not know, on
 * every level, when it writes the file (FI's code dropped them – changed here). A change an older version could not read
 * goes to a new file beside it (config.v2.json), never into this one.
 */
import { DEFAULT_MACHINE_PREFS, machinePrefsFrom, type MachinePrefs } from './machine'

export const CONFIG_FORMAT = 1

export interface WindowPlace {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface MachineConfig {
  format: number
  /** The copy of this computer's id (the file `computer-id` is the source; an unreadable config.json never makes a new one). */
  computerId: string | null
  window: WindowPlace | null
  prefs: MachinePrefs
  /** The switch „Uruchamiaj z Windows” as last set here; the real state is read from Windows (spec „Instalacja”). */
  autostart: { enabled: boolean }
  updates: {
    /** The version that ran here last: „Co nowego” after an update. */
    lastRunVersion: string | null
    /** Automatic installation at night (on by default, spec „Aktualizacja instaluje się”). */
    nightInstall: boolean
  }
}

export const DEFAULT_CONFIG: MachineConfig = {
  format: CONFIG_FORMAT,
  computerId: null,
  window: null,
  prefs: DEFAULT_MACHINE_PREFS,
  autostart: { enabled: false },
  updates: { lastRunVersion: null, nightInstall: true }
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function windowFrom(v: unknown): WindowPlace | null {
  if (!isPlain(v)) return null
  const n = (k: string) => (typeof v[k] === 'number' && Number.isFinite(v[k]) ? (v[k] as number) : null)
  const [x, y, width, height] = [n('x'), n('y'), n('width'), n('height')]
  if (x == null || y == null || width == null || height == null || width < 200 || height < 200) return null
  return { x, y, width, height, maximized: v.maximized === true }
}

/** The settings from config.json's text; anything wrong in a field: that field's default. */
export function configFrom(raw: unknown): MachineConfig {
  const r = isPlain(raw) ? raw : {}
  const updates = isPlain(r.updates) ? r.updates : {}
  const autostart = isPlain(r.autostart) ? r.autostart : {}
  return {
    format: typeof r.format === 'number' && Number.isInteger(r.format) && r.format >= 1 ? r.format : CONFIG_FORMAT,
    computerId: typeof r.computerId === 'string' && /^[0-9a-z]{8,64}$/i.test(r.computerId) ? r.computerId : null,
    window: windowFrom(r.window),
    prefs: machinePrefsFrom(r.prefs),
    autostart: { enabled: autostart.enabled === true },
    updates: {
      lastRunVersion: typeof updates.lastRunVersion === 'string' ? updates.lastRunVersion : null,
      nightInstall: typeof updates.nightInstall === 'boolean' ? updates.nightInstall : DEFAULT_CONFIG.updates.nightInstall
    }
  }
}

/**
 * The text to write: `known` laid over what the file held (`raw`), object by object – fields this version does not know
 * stay, on every level; a list or a value is replaced as a whole.
 */
export function mergePreserving(raw: unknown, known: unknown): unknown {
  if (!isPlain(known)) return known
  const base = isPlain(raw) ? raw : {}
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(known)) out[k] = mergePreserving(base[k], v)
  return out
}
