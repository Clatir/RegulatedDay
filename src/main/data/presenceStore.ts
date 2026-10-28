/**
 * Presence files in the data folder (spec „Kilka komputerów”): this computer's own, written when due (presenceDue), and
 * the others', read at every check and tracked by this computer's own clock – when it saw each file change at all, and
 * when it saw the field „last presence” change (what leadership compares). Times of modification are compared only for
 * being different: OneDrive sets them by the other computer's clock.
 */
import { join } from 'node:path'
import { PRESENCE_DIR, classify, paths } from '@shared/data/paths'
import { presenceDue, presenceFrom, type Presence } from '@shared/sync/presence'
import type { Peer } from '@shared/sync/leader'
import type { DataFs } from './fsio'

/** A clock ahead by more than this is a warning (spec „o ponad 2 min”). */
export const CLOCK_AHEAD_MS = 2 * 60_000

/**
 * A forgotten computer is not used again while its „last presence” is the one it had when forgotten – or none at all: an
 * app started again with nobody at it writes none (A3-13 review); only a new presence brings it back.
 */
export const stillForgotten = (atForget: number | null, now: number | null): boolean => now == null || now === atForget

interface Seen {
  size: number
  mtimeMs: number
  presence: Presence
  fileSeenAt: number
  presenceSeenAt: number | null
  /** When this computer saw its presence for the sound change (D331). */
  soundSeenAt: number | null
}

export class PresenceStore {
  private mine: Presence
  private lastWrite: number | null = null
  private changed = true
  private readonly seen = new Map<string, Seen>()
  /**
   * Computers forgotten in the settings („Zapomnij komputer”, rd.json): by id, the „last presence” their file had then –
   * nobody waits for them while it is the same (used again, a computer counts again).
   */
  forgotten = new Map<string, number | null>()
  /**
   * The clocks of other computers ahead of this one (spec „wyprzedza chwilę jej nadejścia o ponad 2 min”): by id, how far
   * the time written in its presence was ahead of this computer's clock when the file arrived (also at the first read).
   */
  readonly clockAhead = new Map<string, number>()
  problems: Array<{ file: string; why: string }> = []

  constructor(
    private readonly o: { fs: DataFs; dataDir: string; computer: string; now: () => number },
    initial: Omit<Presence, 'writtenAt' | 'computer'>
  ) {
    this.mine = { ...initial, computer: o.computer, writtenAt: o.now() }
  }

  get own(): Presence {
    return this.mine
  }

  /** A change of this computer's presence; a change of state is written at once (not within 15 s of the last write). */
  update(patch: Partial<Omit<Presence, 'computer' | 'writtenAt'>>): void {
    const before = this.mine
    this.mine = { ...this.mine, ...patch }
    const stateChanged =
      before.state !== this.mine.state ||
      before.locked !== this.mine.locked ||
      before.seenLeader !== this.mine.seenLeader ||
      before.settled !== this.mine.settled ||
      before.installing !== this.mine.installing ||
      before.soundPresence !== this.mine.soundPresence ||
      JSON.stringify(before.lastEvents) !== JSON.stringify(this.mine.lastEvents)
    if (stateChanged) this.changed = true
  }

  /** When the own file is next due. */
  due(now = this.o.now()): number {
    return presenceDue(this.lastWrite, now, this.changed, this.mine.state === 'used')
  }

  /** Writes the own file when due (or `force`: at the quit, „closed”). */
  async tick(force = false): Promise<boolean> {
    const now = this.o.now()
    if (!force && this.due(now) > now) return false
    this.mine = { ...this.mine, writtenAt: now }
    await this.o.fs.writeAtomic(join(this.o.dataDir, paths.presence(this.o.computer)), `${JSON.stringify(this.mine, null, 2)}\n`)
    this.lastWrite = now
    this.changed = false
    return true
  }

  /** Reads the other computers' presence files; a failed listing keeps what was seen before. */
  async scan(): Promise<Peer[]> {
    const now = this.o.now()
    this.problems = []
    let entries: Array<{ name: string; dir: boolean }> | null = null
    try {
      entries = await this.o.fs.list(join(this.o.dataDir, PRESENCE_DIR))
    } catch (e) {
      this.problems.push({ file: PRESENCE_DIR, why: e instanceof Error ? e.message : String(e) })
    }
    for (const entry of entries ?? []) {
      if (entry.dir) continue
      const rel = `${PRESENCE_DIR}/${entry.name}`
      const c = classify(rel)
      if (!c || c.kind !== 'presence' || c.conflict || !c.computer || c.computer === this.o.computer) continue
      try {
        const abs = join(this.o.dataDir, rel)
        const st = await this.o.fs.stat(abs)
        if (!st) continue
        const old = this.seen.get(c.computer)
        if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) continue
        const bytes = await this.o.fs.read(abs)
        if (!bytes) continue
        let presence: Presence | null = null
        try {
          presence = presenceFrom(JSON.parse(bytes.toString('utf8')))
        } catch {
          presence = null
        }
        if (!presence) {
          this.problems.push({ file: rel, why: 'uszkodzony plik obecności' })
          continue
        }
        const presenceChanged = !old || old.presence.lastPresence !== presence.lastPresence
        if (!old || old.presence.writtenAt !== presence.writtenAt) {
          const ahead = presence.writtenAt - now
          if (ahead > CLOCK_AHEAD_MS) this.clockAhead.set(c.computer, ahead)
          else this.clockAhead.delete(c.computer)
        }
        this.seen.set(c.computer, {
          ...st,
          presence,
          // First read after the start: the age comes from the time in the content (never in the future).
          fileSeenAt: !old ? Math.min(now, presence.writtenAt) : old.presence.writtenAt === presence.writtenAt ? old.fileSeenAt : now,
          // The first read after the start has not seen a change: the age comes from the content (leader.ts).
          presenceSeenAt: old ? (presenceChanged ? now : old.presenceSeenAt) : null,
          soundSeenAt: old ? ((old.presence.soundPresence ?? null) !== (presence.soundPresence ?? null) ? now : old.soundSeenAt) : null
        })
      } catch (e) {
        this.problems.push({ file: rel, why: e instanceof Error ? e.message : String(e) })
      }
    }
    return this.peers()
  }

  /** A computer forgotten and not used since (its „last presence” as when it was forgotten). */
  isForgotten(id: string): boolean {
    return this.forgotten.has(id) && stillForgotten(this.forgotten.get(id)!, this.seen.get(id)?.presence.lastPresence ?? null)
  }

  /** The peers as last seen (without forgotten computers). */
  peers(crashedVersion: (p: Presence) => boolean = (p) => (p.versions.find((v) => v.version === p.appVersion)?.crashes ?? 0) > 0): Peer[] {
    return [...this.seen.values()]
      .filter((s) => !this.isForgotten(s.presence.computer))
      .map((s) => ({ presence: s.presence, presenceSeenAt: s.presenceSeenAt, fileSeenAt: s.fileSeenAt, crashed: crashedVersion(s.presence), soundSeenAt: s.soundSeenAt }))
  }

  /** Every other computer seen, forgotten ones too (the settings' list of computers). */
  all(): Array<{ presence: Presence; fileSeenAt: number; forgotten: boolean }> {
    return [...this.seen.values()].map((s) => ({ presence: s.presence, fileSeenAt: s.fileSeenAt, forgotten: this.isForgotten(s.presence.computer) }))
  }
}
