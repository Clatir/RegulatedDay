/**
 * „Nieustalony” (spec „Kilka komputerów”): after the start, a wake, a lock longer than 10 min or the network's return a
 * computer does not do the leader's tasks until it has scanned the folder and seen 60 s without incoming changes. After
 * the start and a wake this lasts at least 3 min, counted from the moment the OneDrive process runs, at most 10 min;
 * after a lock and the network's return at most 3 min. The widget works normally meanwhile.
 */

export type SettleReason = 'start' | 'wake' | 'lock' | 'network'

const QUIET_MS = 60_000
const MIN_AFTER_START_MS = 3 * 60_000
const MAX_AFTER_START_MS = 10 * 60_000
const MAX_AFTER_LOCK_MS = 3 * 60_000

export class Settle {
  private since: number | null = null
  private reason: SettleReason = 'start'
  private lastChange = 0
  private scanned = false
  private oneDriveSince: number | null = null

  begin(reason: SettleReason, now: number): void {
    this.since = now
    this.reason = reason
    this.lastChange = now
    this.scanned = false
    this.oneDriveSince = null
  }

  /** A change came in from the folder (another computer's file changed). */
  changeSeen(now: number): void {
    this.lastChange = now
  }

  /** The folder was scanned in full. */
  scannedFolder(): void {
    this.scanned = true
  }

  /** The OneDrive process is (not) running now (a folder outside OneDrive: always running). */
  oneDrive(running: boolean, now: number): void {
    if (running && this.oneDriveSince == null) this.oneDriveSince = now
    if (!running) this.oneDriveSince = null
  }

  settled(now: number): boolean {
    if (this.since == null) return true
    const done = (() => {
      const after = this.reason === 'start' || this.reason === 'wake'
      const max = after ? MAX_AFTER_START_MS : MAX_AFTER_LOCK_MS
      if (now - this.since >= max) return true
      if (!this.scanned || now - this.lastChange < QUIET_MS) return false
      if (after) return this.oneDriveSince != null && now - this.oneDriveSince >= MIN_AFTER_START_MS
      return true
    })()
    if (done) this.since = null
    return done
  }
}
