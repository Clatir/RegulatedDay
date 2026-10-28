/**
 * The event log of this computer (spec „Każde zdarzenie trafia najpierw do lokalnego dziennika w danych aplikacji,
 * zapisanego na dysk w chwili powstania, a potem do logu na OneDrive”): an event goes to the local journal first
 * (written to disk at once), then to log/RRRR/RRRR-MM-DD/<computer>.jsonl with retries while the file is held. Before an
 * append the line is ended if the file does not end with a newline. At the start and at every check the own log on
 * OneDrive is compared with the journal and the missing events are appended – OneDrive may swap the file while the app
 * runs. Conflict copies of the own log are joined into it by this computer only (the sum of events by id).
 *
 * Reading a day joins the logs of every computer and their conflict copies through a cache checked by size and time of
 * modification (compared only for being different: OneDrive sets them by the other computer's clock); a log that got
 * shorter is read from its start; a listing that fails makes the day „unknown”, never empty.
 */
import { appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { classify, paths } from '@shared/data/paths'
import { eventLine, mergeEvents, readLogText, type ReadLog } from '@shared/data/logText'
import { AHEAD_LIMIT_MS, type EventClock } from '@shared/data/clock'
import { type AnyEvent, type Domain } from '@shared/model/events'
import type { DataFs } from './fsio'

export const JOURNAL_FILE = 'journal.v1.jsonl'

/** An event before its stamps: the day, what it concerns, its kind and fields; `id` only for derived ids. */
export type EventDraft = { day: string; dom: Domain; k: string; id?: string } & Record<string, unknown>

export interface DayRead {
  events: AnyEvent[]
  /** Every file of the day's folder was listed and read (false: „unknown” – never treat the day as empty). */
  complete: boolean
  problems: Array<{ file: string; why: string }>
  /** The logs seen, by computer: their last event number (what the presence's „last event” is checked against). */
  lastByComputer: Record<string, number>
  /**
   * An event of another computer more than 24 h ahead of this computer's clock is in the day (spec: automatic actions
   * wait, the bar warns) – judged at every read, so it ends once the clocks agree again.
   */
  ahead: boolean
  /** Conflict copies of logs in the day's folder (joined into the events; the freeze waits until there are none). */
  copies: number
}

/** The app's own bookkeeping in the log: no change of yours (A3-07). */
const BOOKKEEPING = new Set(['observe.from', 'observe.alive', 'observe.to', 'gap.open', 'gap.close', 'presence.first', 'minutes', 'hardend.pass', 'day.create', 'notice.shown', 'question.seen', 'energy.reserve', 'day.freeze'])

/** A change you made (a click, an answer, an action of a window), never an automatic action of the app. */
const isYourChange = (e: AnyEvent): boolean => !BOOKKEEPING.has(e.k) && !(e as { autoRule?: unknown }).autoRule

interface Cached {
  size: number
  mtimeMs: number
  read: ReadLog
}

export class EventLog {
  private readonly own = new Map<string, Map<string, AnyEvent>>()
  private readonly pending = new Set<string>()
  private readonly cache = new Map<string, Cached>()
  /** What this computer last saw of its own file on OneDrive (an unexpected change means it was swapped). */
  private readonly ownStat = new Map<string, { size: number; mtimeMs: number }>()
  private writing: Promise<void> = Promise.resolve()
  /** When this run began (its computer's clock): what counts as written in it. */
  private readonly openedAt: number

  constructor(
    private readonly o: {
      fs: DataFs
      dataDir: string
      /** This computer's state for the data folder (journal, queue, life marker – separate per folder). */
      stateDir: string
      computer: string
      clock: EventClock
      rulesVersion: number
    }
  ) {
    this.openedAt = o.clock.now()
  }

  get journalPath(): string {
    return join(this.o.stateDir, JOURNAL_FILE)
  }

  /** The journal's events and the last number and logical clock in it (to restore the clock at the start). */
  static readJournal(stateDir: string): { events: AnyEvent[]; lastN: number; lastL: number } {
    const file = join(stateDir, JOURNAL_FILE)
    if (!existsSync(file)) return { events: [], lastN: -1, lastL: 0 }
    const { events } = readLogText(readFileSync(file, 'utf8'))
    let lastN = -1
    let lastL = 0
    for (const e of events) {
      lastN = Math.max(lastN, e.n)
      lastL = Math.max(lastL, e.l)
    }
    return { events, lastN, lastL }
  }

  /** Loads the journal (own events of every day it still keeps); every day in it is checked against OneDrive. */
  open(): void {
    mkdirSync(this.o.stateDir, { recursive: true })
    // A last line cut by a hard power-off: the line is ended first, so the next event never sticks to its rest and is
    // lost with it (spec „kończy linię, jeśli plik nie kończy się znakiem nowej linii”, A3-12).
    if (existsSync(this.journalPath)) {
      const fd = openSync(this.journalPath, 'r')
      let cut = false
      try {
        const size = fstatSync(fd).size
        const last = Buffer.alloc(1)
        cut = size > 0 && readSync(fd, last, 0, 1, size - 1) === 1 && last[0] !== 0x0a
      } finally {
        closeSync(fd)
      }
      if (cut) appendFileSync(this.journalPath, '\n')
    }
    for (const e of EventLog.readJournal(this.o.stateDir).events) {
      if (e.c !== this.o.computer) continue
      this.ownDay(e.day).set(e.id, e)
      this.pending.add(e.day)
    }
  }

  private ownDay(day: string): Map<string, AnyEvent> {
    let m = this.own.get(day)
    if (!m) this.own.set(day, (m = new Map()))
    return m
  }

  /**
   * A new event of this computer: stamped, written to the journal at once (fsync; `system`: at the end of the Windows
   * session – one synchronous write without fsync), then queued for the log on OneDrive.
   */
  append(draft: EventDraft, opts: { system?: boolean } = {}): AnyEvent {
    const { t, l, n } = this.o.clock.stamp()
    const { id, ...fields } = draft
    const e = { ...fields, id: id ?? `${this.o.computer}-${n}`, c: this.o.computer, n, t, l, v: this.o.rulesVersion } as unknown as AnyEvent
    const line = eventLine(e)
    if (opts.system) appendFileSync(this.journalPath, line)
    else {
      const fd = openSync(this.journalPath, 'a')
      try {
        writeSync(fd, line)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
    this.ownDay(e.day).set(e.id, e)
    this.pending.add(e.day)
    return e
  }

  /** Own events of a day (from the journal). */
  ownEvents(day: string): AnyEvent[] {
    return [...(this.own.get(day)?.values() ?? [])]
  }

  /** Writes what is queued to OneDrive (one write at a time; a failure leaves it queued for the next check). */
  flush(): Promise<void> {
    return this.serial(async () => {
      for (const day of [...this.pending]) {
        try {
          await this.ensureNow(day)
          this.pending.delete(day)
        } catch {
          /* the folder is unavailable or the file held: the next check tries again */
        }
      }
    })
  }

  /** Every write of the own logs goes one after another (two at once would append the same missing events twice). */
  private serial(fn: () => Promise<void>): Promise<void> {
    const run = this.writing.then(fn)
    this.writing = run.catch(() => undefined)
    return run
  }

  /** The check of a day's own log against the journal (OneDrive may have swapped the file), in turn with the writes. */
  ensure(day: string): Promise<void> {
    return this.serial(() => this.ensureNow(day))
  }

  /** Days with own events not yet confirmed on OneDrive (the bar: „N zmian zapisze się po powrocie folderu”). */
  get pendingDays(): string[] {
    return [...this.pending]
  }

  /**
   * Your own changes of those days not in the folder's log as last seen – what „N zmian” counts (A3-07): never the app's
   * own bookkeeping (observation, gaps of input, minutes, notices – A3-07 review). A day whose file this run has not read
   * yet is not known to be empty: only events written in this run count there.
   */
  private unsyncedEvents(): AnyEvent[] {
    const out: AnyEvent[] = []
    for (const day of this.pending) {
      const cached = this.cache.get(paths.log(day, this.o.computer))
      const there = new Set(cached?.read.events.map((e) => e.id) ?? [])
      for (const e of this.own.get(day)?.values() ?? []) {
        if (there.has(e.id) || !isYourChange(e) || (!cached && e.t < this.openedAt)) continue
        out.push(e)
      }
    }
    return out
  }

  get pendingEvents(): number {
    return this.unsyncedEvents().length
  }

  /** The oldest of them (its computer's clock, ms), null: none. */
  get pendingSince(): number | null {
    const ts = this.unsyncedEvents().map((e) => e.t)
    return ts.length ? Math.min(...ts) : null
  }

  /**
   * Makes the own log of a day on OneDrive hold every journal event: joins own conflict copies into it, appends the
   * missing events (ending the last line first), and rewrites it whole when a copy had to be joined.
   */
  private async ensureNow(day: string): Promise<void> {
    const rel = paths.log(day, this.o.computer)
    const abs = join(this.o.dataDir, rel)
    const mine = this.own.get(day) ?? new Map<string, AnyEvent>()
    const st = await this.o.fs.stat(abs)
    const known = this.ownStat.get(rel)
    const copies = await this.ownCopies(day)
    // Our own last write left the file as it is: only the new events go on.
    if (st && known && st.size === known.size && st.mtimeMs === known.mtimeMs && !copies.length) {
      const cached = this.cache.get(rel)
      const there = new Set(cached?.read.events.map((e) => e.id) ?? [])
      const missing = [...mine.values()].filter((e) => !there.has(e.id))
      if (missing.length) await this.appendTo(abs, rel, missing, cached?.read.endsWithNewline ?? true)
      return
    }
    const bytes = await this.o.fs.read(abs)
    const read = readLogText(bytes ? bytes.toString('utf8') : '')
    if (copies.length) {
      const all = mergeEvents(read.events, [...mine.values()], ...copies.map((c) => c.events.filter((e) => e.c === this.o.computer)))
      const text = all.sort((a, b) => a.n - b.n).map(eventLine).join('')
      await this.o.fs.writeAtomic(abs, text)
      for (const c of copies) await this.o.fs.remove(join(this.o.dataDir, c.rel))
      for (const e of all) if (e.c === this.o.computer && !mine.has(e.id)) mine.set(e.id, e)
      await this.remember(abs, rel, readLogText(text))
      return
    }
    const there = new Set(read.events.map((e) => e.id))
    const missing = [...mine.values()].filter((e) => !there.has(e.id))
    // Events in the file the journal lacks (a journal from before a reinstall): kept in memory as own.
    for (const e of read.events) if (e.c === this.o.computer && !mine.has(e.id)) mine.set(e.id, e)
    if (missing.length) await this.appendTo(abs, rel, missing, read.endsWithNewline, read)
    else await this.remember(abs, rel, read)
  }

  private async appendTo(abs: string, rel: string, events: readonly AnyEvent[], endsWithNewline: boolean, before?: ReadLog): Promise<void> {
    const text = (endsWithNewline ? '' : '\n') + [...events].sort((a, b) => a.n - b.n).map(eventLine).join('')
    await this.o.fs.append(abs, text)
    const prev = before ?? this.cache.get(rel)?.read
    await this.remember(abs, rel, {
      events: [...(prev?.events ?? []), ...events],
      problems: prev?.problems ?? [],
      cutTail: false,
      endsWithNewline: true
    })
  }

  private async remember(abs: string, rel: string, read: ReadLog): Promise<void> {
    const st = await this.o.fs.stat(abs)
    if (!st) return
    this.ownStat.set(rel, st)
    this.cache.set(rel, { ...st, read })
  }

  /** Conflict copies of this computer's own log of a day. */
  private async ownCopies(day: string): Promise<Array<{ rel: string; events: AnyEvent[] }>> {
    const dir = paths.logDir(day)
    const out: Array<{ rel: string; events: AnyEvent[] }> = []
    for (const entry of await this.o.fs.list(join(this.o.dataDir, dir))) {
      if (entry.dir) continue
      const rel = `${dir}/${entry.name}`
      const c = classify(rel)
      if (!c || c.kind !== 'log' || !c.conflict || c.canonical !== paths.log(day, this.o.computer)) continue
      const bytes = await this.o.fs.read(join(this.o.dataDir, rel))
      out.push({ rel, events: bytes ? readLogText(bytes.toString('utf8')).events : [] })
    }
    return out
  }

  /** Every computer's log of a day (with conflict copies), joined with this computer's journal. */
  async readDay(day: string): Promise<DayRead> {
    const dir = paths.logDir(day)
    const problems: DayRead['problems'] = []
    const lists: AnyEvent[][] = [this.ownEvents(day)]
    let complete = true
    let entries: Array<{ name: string; dir: boolean }> = []
    let copies = 0
    try {
      entries = await this.o.fs.list(join(this.o.dataDir, dir))
    } catch (e) {
      complete = false
      problems.push({ file: dir, why: `lista plików: ${e instanceof Error ? e.message : String(e)}` })
      // What was read before stays: the day is „unknown”, never empty.
      for (const [rel, c] of this.cache) if (rel.startsWith(`${dir}/`)) lists.push(c.read.events)
    }
    for (const entry of entries) {
      if (entry.dir) continue
      const rel = `${dir}/${entry.name}`
      const c = classify(rel)
      if (!c || c.kind !== 'log') continue
      if (c.conflict) copies++
      try {
        const read = await this.readCached(rel)
        lists.push(read.events)
        for (const p of read.problems) problems.push({ file: rel, why: `linia ${p.line}: ${p.why}` })
      } catch (e) {
        complete = false
        problems.push({ file: rel, why: e instanceof Error ? e.message : String(e) })
        const old = this.cache.get(rel)
        if (old) lists.push(old.read.events)
      }
    }
    const events = mergeEvents(...lists)
    // The last number of each computer over every line read – also of an event that lost to another computer's copy
    // of the same derived id (its presence names it, and the gate of minutes must see it).
    const lastByComputer: Record<string, number> = {}
    for (const list of lists) for (const e of list) lastByComputer[e.c] = Math.max(lastByComputer[e.c] ?? -1, e.n)
    // Only another computer's clock far ahead stops the automatic actions, and only while it lasts (T435): its newest
    // event, by its own time `t` – never this computer's events, nor an older one from a clock that has come back
    // (A8-01, T515).
    const newest = new Map<string, AnyEvent>()
    for (const e of events) {
      this.o.clock.observe(e.l)
      if (e.c === this.o.computer) continue
      const was = newest.get(e.c)
      if (!was || e.n > was.n) newest.set(e.c, e)
    }
    const ahead = [...newest.values()].some((e) => e.t > this.o.clock.now() + AHEAD_LIMIT_MS)
    return { events, complete, problems, lastByComputer, ahead, copies }
  }

  /** A day to compare with OneDrive at the next write (every check does it for today). */
  markPending(day: string): void {
    this.pending.add(day)
  }

  /** A log file through the cache: read again only when its size or time of modification differs. */
  private async readCached(rel: string): Promise<ReadLog> {
    const abs = join(this.o.dataDir, rel)
    const st = await this.o.fs.stat(abs)
    const old = this.cache.get(rel)
    if (!st) return { events: [], problems: [], cutTail: false, endsWithNewline: true }
    if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) return old.read
    const bytes = await this.o.fs.read(abs)
    const read = readLogText(bytes ? bytes.toString('utf8') : '')
    this.cache.set(rel, { ...st, read })
    return read
  }

  /**
   * Keeps the journal small (spec: until the day's freeze plus 7 days): the days before `keepFrom` leave it, written
   * through a temp file and a rename.
   */
  compact(keepFrom: string): void {
    const keep = EventLog.readJournal(this.o.stateDir).events.filter((e) => e.day >= keepFrom || this.pending.has(e.day))
    const tmp = `${this.journalPath}.tmp-compact`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, keep.map(eventLine).join(''))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.journalPath)
    for (const day of [...this.own.keys()]) if (day < keepFrom && !this.pending.has(day)) this.own.delete(day)
  }
}
