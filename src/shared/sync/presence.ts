/**
 * The presence of a computer (spec „Pliki na OneDrive”, .presence/<komputer>.json): the app's and rules' versions, the
 * last versions with their first and last runs and crashes, „instaluję wersję X”, the last presence, the last use, the
 * last input outside the app, the state, the screen lock, power, the leader it sees, the state of sync and the last event
 * written for every open day (also without events). Written at every change of state, every 60 s while used and every
 * 5 min otherwise, never more often than every 15 s (spec „Obecność zapisuje się …”).
 */

export const PRESENCE_FORMAT = 1
export const PRESENCE_USED_EVERY_MS = 60_000
export const PRESENCE_IDLE_EVERY_MS = 5 * 60_000
export const PRESENCE_MIN_GAP_MS = 15_000
/** A presence file refreshed within this is fresh (also by a computer nobody uses). */
export const FRESH_MS = 10 * 60_000

export type PresenceState = 'used' | 'idle' | 'disconnect' | 'fewer' | 'closed'

export interface VersionRun {
  version: string
  firstRun: number
  lastRun: number
  crashes: number
}

export interface Presence {
  format: number
  computer: string
  name: string
  /** Windows' own id of the machine: a copied app data folder gets a new computer id (spec). */
  windowsId: string | null
  appVersion: string
  rulesVersion: number
  versions: VersionRun[]
  installing: string | null
  /** The last presence at the computer (any input, also in the app) – what leadership is decided by. */
  lastPresence: number | null
  lastUse: number | null
  lastOutsideInput: number | null
  state: PresenceState
  locked: boolean
  power: { source: 'ac' | 'battery'; saver: boolean } | null
  /**
   * The screen unlocked on this computer while it held the block of sleep of a passive block (spec „tylko przy tym wyborze
   * … liczy się jak obecność także samo odblokowanie ekranu”, D331): a presence for the choice of the sound only.
   */
  soundPresence?: number | null
  /** The computer this one sees as the leader; pointing at another one hands leadership over. */
  seenLeader: string | null
  /** Settled (scanned the folder and saw 60 s without incoming changes) or not. */
  settled: boolean
  /** The last event this computer wrote for each open day (−1: none yet). */
  lastEvents: Record<string, number>
  /** This computer's clock when it wrote the file. */
  writtenAt: number
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const STATES = new Set(['used', 'idle', 'disconnect', 'fewer', 'closed'])

/** A presence from its file; null when it is not one (a broken file is listed by the reader, never trusted). */
export function presenceFrom(raw: unknown): Presence | null {
  if (!isPlain(raw) || typeof raw.computer !== 'string' || !raw.computer) return null
  const writtenAt = num(raw.writtenAt)
  if (writtenAt == null) return null
  const lastEvents: Record<string, number> = {}
  if (isPlain(raw.lastEvents)) for (const [d, n] of Object.entries(raw.lastEvents)) if (typeof n === 'number' && Number.isInteger(n)) lastEvents[d] = n
  const source = isPlain(raw.power) ? raw.power.source : null
  const power: Presence['power'] = isPlain(raw.power) && (source === 'ac' || source === 'battery') ? { source, saver: raw.power.saver === true } : null
  return {
    format: num(raw.format) ?? PRESENCE_FORMAT,
    computer: raw.computer,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : raw.computer,
    windowsId: typeof raw.windowsId === 'string' ? raw.windowsId : null,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '0.0.0',
    rulesVersion: Number.isInteger(raw.rulesVersion) ? (raw.rulesVersion as number) : 0,
    versions: Array.isArray(raw.versions)
      ? raw.versions.filter(isPlain).flatMap((v) => (typeof v.version === 'string' && num(v.firstRun) != null ? [{ version: v.version, firstRun: num(v.firstRun)!, lastRun: num(v.lastRun) ?? num(v.firstRun)!, crashes: num(v.crashes) ?? 0 }] : [])).slice(-10)
      : [],
    installing: typeof raw.installing === 'string' ? raw.installing : null,
    lastPresence: num(raw.lastPresence),
    lastUse: num(raw.lastUse),
    lastOutsideInput: num(raw.lastOutsideInput),
    state: STATES.has(raw.state as string) ? (raw.state as PresenceState) : 'idle',
    locked: raw.locked === true,
    power,
    soundPresence: num(raw.soundPresence),
    seenLeader: typeof raw.seenLeader === 'string' ? raw.seenLeader : null,
    settled: raw.settled === true,
    lastEvents,
    writtenAt
  }
}

/**
 * When the presence file is next due (spec): at a change of state at once (but never within 15 s of the last write),
 * else 60 s after the last write while used and 5 min otherwise.
 */
export function presenceDue(lastWrite: number | null, now: number, changed: boolean, used: boolean): number {
  if (lastWrite == null) return now
  const earliest = lastWrite + PRESENCE_MIN_GAP_MS
  if (changed) return Math.max(now, earliest)
  return Math.max(earliest, lastWrite + (used ? PRESENCE_USED_EVERY_MS : PRESENCE_IDLE_EVERY_MS))
}
