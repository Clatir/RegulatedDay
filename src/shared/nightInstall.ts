/**
 * The night installation (spec „Instalacja, aktualizacje i log”, D162, T219): an update installs by itself at night – in
 * the night's quiet, with the screen locked or nobody using the computer for 30 min, on mains power, with no block
 * running and the state of notifications showing no game, presentation, busy state or full-screen app (switchable).
 *
 * The first computer installs a new version without waiting; every next one only once another computer has run it for
 * at least 24 h (clock time from its first run there, by that computer's presence), and a crash on that version
 * recorded meanwhile holds the next computers until the next release. The first is the one that sees the release while
 * no other wrote „instaluję wersję X” in its presence; each waits a random 0–30 min before it installs, and of two at
 * once the lower id goes first. A computer that sees events of the timer it does not know installs without the 24 h.
 * Pure: the main process feeds it the presences and the state of this computer.
 */
import type { VersionRun } from './sync/presence'

export const RUN_BEFORE_NEXT_MS = 24 * 60 * 60_000
export const MAX_WAIT_MS = 30 * 60_000
export const IDLE_FOR_NIGHT_MS = 30 * 60_000

export interface PeerVersions {
  computer: string
  appVersion: string
  versions: readonly VersionRun[]
  installing: string | null
}

export interface NightState {
  now: number
  /** The night's quiet now (from the effective bedtime to the wake). */
  quiet: boolean
  locked: boolean
  /** Ms since the last input on this computer. */
  idleMs: number
  /** On mains power (null: unknown – a desktop answers true). */
  onMains: boolean | null
  /** A block runs (in the foreground or the background) on any day this computer sees. */
  blockRunning: boolean
  /** The state of notifications (the helper): only „accepts” lets it install („quietTime” and unknown too). */
  notificationState: string | null
  /** „Automatyczna instalacja aktualizacji w nocy” on this computer. */
  enabled: boolean
  helperRunning: boolean
}

export interface NightInput {
  me: string
  /** The version downloaded and ready (null: none). */
  ready: string | null
  peers: readonly PeerVersions[]
  /** This computer sees events of the timer of a newer version (it may count wrong: install without the 24 h). */
  unknownTimerEvents: boolean
  /** When this computer began its own wait for `ready` (it wrote „instaluję”), null: not yet. */
  waitFrom: number | null
  /** Its random wait (0–30 min). */
  waitMs: number
  state: NightState
}

export type NightDecision =
  | { act: 'none'; why: string }
  /** Write „instaluję wersję X” and wait the random time. */
  | { act: 'claim'; version: string; why: string }
  /** Another computer goes first: the claim is taken back, this one waits for the 24 h. */
  | { act: 'yield'; why: string }
  | { act: 'install'; version: string; why: string }

/** The conditions of the night on this computer (without the rule of computers). */
export function nightReady(s: NightState): string | null {
  if (!s.enabled) return 'instalacja w nocy wyłączona'
  if (!s.helperRunning) return 'pomocnik nie działa'
  if (!s.quiet) return 'poza ciszą nocną'
  if (!s.locked && s.idleMs < IDLE_FOR_NIGHT_MS) return 'komputer używany w ostatnich 30 min'
  if (s.onMains === false) return 'zasilanie z baterii'
  if (s.blockRunning) return 'biegnie blok'
  if (s.notificationState && !['accepts', 'quietTime', 'unknown'].includes(s.notificationState)) return `stan powiadomień: ${s.notificationState}`
  return null
}

/** How the version stands on the other computers: run 24 h without a crash, a crash, running shorter, nobody yet. */
export function versionOnPeers(version: string, peers: readonly PeerVersions[], now: number): { ranLongEnough: boolean; crashed: boolean; runningSince: number | null; claimedBy: string[] } {
  let ranLongEnough = false
  let crashed = false
  let runningSince: number | null = null
  const claimedBy: string[] = []
  for (const p of peers) {
    const run = p.versions.find((v) => v.version === version)
    if (run) {
      if (run.crashes > 0) crashed = true
      runningSince = runningSince == null ? run.firstRun : Math.min(runningSince, run.firstRun)
      if (now - run.firstRun >= RUN_BEFORE_NEXT_MS) ranLongEnough = true
    } else if (p.appVersion === version) runningSince = runningSince ?? now
    if (p.installing === version) claimedBy.push(p.computer)
  }
  return { ranLongEnough: ranLongEnough && !crashed, crashed, runningSince, claimedBy: claimedBy.sort() }
}

export function nightDecision(inp: NightInput): NightDecision {
  const { ready, state } = inp
  if (!ready) return { act: 'none', why: 'nic nie czeka na instalację' }
  const blocked = nightReady(state)
  if (blocked) return { act: 'none', why: blocked }
  const v = versionOnPeers(ready, inp.peers, state.now)
  if (v.crashed && !inp.unknownTimerEvents) return { act: 'none', why: `awaria wersji ${ready} na innym komputerze – czeka na następne wydanie` }
  // Unknown events of the timer: this version may count wrong – the newest release without a crash, without the 24 h.
  if (inp.unknownTimerEvents && !v.crashed) return { act: 'install', version: ready, why: 'nieznane zdarzenia timera – instalacja bez czekania' }
  if (v.ranLongEnough) return { act: 'install', version: ready, why: `wersja ${ready} działa na innym komputerze co najmniej 24 h` }
  if (v.runningSince != null) return { act: 'none', why: `wersja ${ready} działa na innym komputerze krócej niż 24 h` }
  // Nobody runs it yet: the first computer installs without waiting – after its random wait, unless a lower id claimed it.
  const rivals = v.claimedBy.filter((c) => c !== inp.me)
  if (inp.waitFrom == null) {
    if (rivals.length) return { act: 'none', why: `inny komputer (${rivals[0]}) instaluje wersję ${ready} jako pierwszy` }
    return { act: 'claim', version: ready, why: 'pierwszy komputer – losowe czekanie przed instalacją' }
  }
  if (rivals.some((c) => c < inp.me)) return { act: 'yield', why: `remis z ${rivals.find((c) => c < inp.me)} – pierwszeństwo ma niższy identyfikator` }
  if (state.now - inp.waitFrom < inp.waitMs) return { act: 'none', why: 'losowe czekanie przed instalacją' }
  return { act: 'install', version: ready, why: 'pierwszy komputer – instalacja bez czekania 24 h' }
}
