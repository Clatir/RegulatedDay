/**
 * One data folder in the main process (spec „Dane, komputery i ustawienia”, „Kilka komputerów”): the local journal and
 * the logs, the records and the queue of edits, this computer's presence and the others', who leads, „nieustalony”, and
 * the leader's tasks – creating the day, writing the segments of minutes and the descents to the reserve (the questions,
 * notifications and backups are run by the scheduler of E4a from the same decisions). Everything this computer's state
 * needs that is not in the folder – the journal, the queue, the life marker – lives in `stateDir`, separate for every
 * folder.
 *
 * The scheduler calls `check()` every 15 s (and on events of the watcher); the sync simulator of E1 calls it on its own
 * virtual clock with a faulty file system.
 */
import { join } from 'node:path'
import { EventClock, type ClockSources } from '@shared/data/clock'
import { classify, paths, ID_COLLECTIONS } from '@shared/data/paths'
import { createDay, dayPlan, dayWakeMin, nextWakeForBedtime, type HolidayLookup } from '@shared/engine/createDay'
import { computeDay, newSegments, type DayContext, type DayState } from '@shared/engine/day'
import { computeEnergy, newDescents, type EnergyState } from '@shared/engine/energy'
import { idxOf } from '@shared/engine/grid'
import { derivedId } from '@shared/model/ids'
import { daySnapshotOf, isKnown, RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { dayFileFrom, lectureFrom, templateFrom, type DayFile, type LectureSeries, type Template } from '@shared/model/plan'
import { changeFrom, type SettingsChange } from '@shared/model/settings'
import { decideLeader, minuteGate, type LeaderDecision, type Peer } from '@shared/sync/leader'
import { Settle, type SettleReason } from '@shared/sync/settle'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { EditQueue } from './editQueue'
import { EventLog, type DayRead, type EventDraft } from './eventLog'
import type { DataFs } from './fsio'
import { RecordHistory } from './history'
import { PresenceStore } from './presenceStore'
import { RecordStore } from './records'

export const OBSERVE_EVERY_MS = 5 * 60_000
/** The journal keeps own events of this many days back (spec: until the day's freeze plus 7 days – freezing is E6). */
export const JOURNAL_KEEP_DAYS = 14
const COMPACT_EVERY_MS = 60 * 60_000

/** A record the day is made from that cannot be read now (or is broken) and was never read before: unknown. */
export class UnknownRecordError extends Error {
  constructor(
    readonly rel: string,
    why: string
  ) {
    super(`${rel}: ${why}`)
  }
}

export interface FolderOptions {
  fs: DataFs
  dataDir: string
  stateDir: string
  computer: string
  computerName: string
  windowsId?: string | null
  appVersion: string
  rulesVersion?: number
  clock: ClockSources
  holidays: HolidayLookup
  /** Whether the OneDrive process runs (a folder outside OneDrive: always true). */
  oneDriveRunning: () => boolean
  /** How the previous run of this folder ended (its life marker): an end without a close writes the observation's end. */
  previousRun?: { lastAt: number; clean: boolean } | null
}

export interface CheckResult {
  leader: LeaderDecision
  settled: boolean
  created: string | null
  segments: number
  problems: string[]
}

/** The records the day is made from, read through a cache checked by size and time of modification. */
interface Inputs {
  changes: SettingsChange[]
  templates: Template[]
  lectures: LectureSeries[]
}

export class DataFolder {
  readonly clock: EventClock
  readonly log: EventLog
  readonly presence: PresenceStore
  readonly records: RecordStore
  readonly history: RecordHistory
  readonly queue: EditQueue
  readonly settle = new Settle()
  leader: LeaderDecision = { leader: null, iLead: false, why: 'start', claimed: false }
  private current: string | null = null
  private peers: Peer[] = []
  private lastObserve = 0
  private readonly firstPresence = new Set<string>()
  private readonly cache = new Map<string, { size: number; mtimeMs: number; value: unknown }>()
  private lastSeenPeers = new Map<string, number>()
  private observing = true
  private lastCompact = 0
  private readonly listed = new Map<string, string[]>()
  private readonly rulesVersion: number

  private constructor(private readonly o: FolderOptions) {
    this.rulesVersion = o.rulesVersion ?? RULES_VERSION
    const restored = EventLog.readJournal(o.stateDir)
    this.clock = new EventClock(o.clock, { lastN: restored.lastN, lastL: restored.lastL })
    const now = () => this.clock.now()
    this.log = new EventLog({ fs: o.fs, dataDir: o.dataDir, stateDir: o.stateDir, computer: o.computer, clock: this.clock, rulesVersion: this.rulesVersion })
    this.history = new RecordHistory({ fs: o.fs, dataDir: o.dataDir, computer: o.computer, now })
    this.records = new RecordStore({ fs: o.fs, dataDir: o.dataDir, computer: o.computer, history: this.history, now })
    this.queue = new EditQueue({ stateDir: o.stateDir, computer: o.computer })
    this.presence = new PresenceStore(
      { fs: o.fs, dataDir: o.dataDir, computer: o.computer, now },
      {
        format: 1,
        name: o.computerName,
        windowsId: o.windowsId ?? null,
        appVersion: o.appVersion,
        rulesVersion: this.rulesVersion,
        versions: [],
        installing: null,
        lastPresence: null,
        lastUse: null,
        lastOutsideInput: null,
        state: 'idle',
        locked: false,
        power: null,
        seenLeader: null,
        settled: false,
        lastEvents: {}
      }
    )
  }

  /** Opens the folder: the journal and the queue, the observation's start (and the end a crash left unwritten). */
  static async open(o: FolderOptions): Promise<DataFolder> {
    const f = new DataFolder(o)
    f.log.open()
    f.queue.load()
    const now = f.clock.now()
    f.settle.begin('start', now)
    if (o.previousRun && !o.previousRun.clean) f.append({ day: logicalDayOf(o.previousRun.lastAt), dom: 'meta', k: 'observe.to', at: o.previousRun.lastAt, why: 'crash' })
    f.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.from', at: now, why: 'start' })
    f.lastObserve = now
    for (const e of f.log.ownEvents(logicalDayOf(now))) if (e.k === 'presence.first') f.firstPresence.add(e.day)
    await f.presence.tick(true).catch(() => undefined)
    return f
  }

  /** A new event of this computer; the presence names its last event of the day. */
  append(draft: EventDraft, opts: { system?: boolean } = {}): AnyEvent {
    const e = this.log.append(draft, opts)
    this.presence.update({ lastEvents: { ...this.presence.own.lastEvents, [e.day]: e.n } })
    return e
  }

  /** Input at this computer (from the helper): presence, and outside the app also use; the first of the day is logged. */
  noteInput(at: number, outsideApp: boolean): void {
    const day = logicalDayOf(at)
    if (!this.firstPresence.has(day)) {
      this.firstPresence.add(day)
      this.append({ day, dom: 'meta', k: 'presence.first', at })
    }
    this.presence.update({ lastPresence: at, state: 'used', ...(outsideApp ? { lastOutsideInput: at, lastUse: at } : {}) })
  }

  /** No input for a while: the state is idle (the file is then written every 5 min). */
  noteIdle(): void {
    this.presence.update({ state: 'idle' })
  }

  /**
   * A wake, a lock longer than 10 min or the network's return: „nieustalony” again. After a sleep the observation
   * starts again – once, whether the system's wake event or the scheduler's gap tells it first; a sleep nobody announced
   * (`sleptFrom`: the last check before the gap) closes the observation there first.
   */
  unsettle(reason: SettleReason, sleptFrom: number | null = null): void {
    if (reason === 'wake') this.clock.rebase()
    const now = this.clock.now()
    if (reason === 'wake') {
      if (this.observing && sleptFrom != null) this.append({ day: logicalDayOf(sleptFrom), dom: 'meta', k: 'observe.to', at: sleptFrom, why: 'suspend' })
      if (!this.observing || sleptFrom != null) {
        this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.from', at: now, why: 'resume' })
        this.observing = true
      }
    }
    this.settle.begin(reason, now)
  }

  /** Going to sleep: the observation ends (nothing is known of the time after it). */
  suspend(): void {
    if (!this.observing) return
    const now = this.clock.now()
    this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.to', at: now, why: 'suspend' })
    this.observing = false
    void this.log.flush()
  }

  /** The observation is open (not ended by a sleep or the end of the session). */
  get isObserving(): boolean {
    return this.observing
  }

  /**
   * A record through the cache. A file that cannot be read now, or is broken, keeps the version read before; without
   * one it is unknown – never taken as missing (a day made from it would be made from defaults, for good).
   */
  private async cachedJson(rel: string): Promise<unknown> {
    const abs = join(this.o.dataDir, rel)
    const st = await this.o.fs.stat(abs)
    if (!st) {
      this.cache.delete(rel)
      return undefined
    }
    const old = this.cache.get(rel)
    if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) return old.value
    const r = await this.records.read(rel)
    if (r.status === 'missing') {
      this.cache.delete(rel)
      return undefined
    }
    if (r.status !== 'ok') {
      if (old) return old.value
      throw new UnknownRecordError(rel, r.why)
    }
    this.cache.set(rel, { ...st, value: r.value })
    return r.value
  }

  /** A folder of records; a listing that fails keeps the names listed before (unknown is never empty). */
  private async cachedDir(dir: string, parse: (v: unknown) => unknown, lenient = false): Promise<unknown[]> {
    let names: string[]
    try {
      names = (await this.o.fs.list(join(this.o.dataDir, dir))).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name)
      this.listed.set(dir, names)
    } catch (e) {
      const before = this.listed.get(dir)
      if (!before) throw e
      names = before
    }
    const out: unknown[] = []
    for (const name of names) {
      const c = classify(`${dir}/${name}`)
      if (!c || c.conflict) continue
      let raw: unknown
      try {
        raw = await this.cachedJson(`${dir}/${name}`)
      } catch (e) {
        // A list for showing (requests) goes on without the unknown record; what a day is made from does not.
        if (lenient && e instanceof UnknownRecordError) continue
        throw e
      }
      const v = parse(raw)
      if (v) out.push(v)
    }
    return out
  }

  /** rd.json's changes, the templates and the plan of lectures. */
  async inputs(): Promise<Inputs> {
    const rd = (await this.cachedJson(paths.settings)) as { settings?: unknown } | undefined
    const changes = Array.isArray(rd?.settings) ? rd.settings.map(changeFrom).filter((c): c is SettingsChange => !!c) : []
    const templates = (await this.cachedDir(ID_COLLECTIONS.template, templateFrom)) as Template[]
    const lectures = (await this.cachedDir(ID_COLLECTIONS.schedule, lectureFrom)) as LectureSeries[]
    return { changes, templates, lectures }
  }

  /** The records of a collection (requests, routines …), through the same cache. */
  async collection(kind: keyof typeof ID_COLLECTIONS): Promise<Array<Record<string, unknown>>> {
    return (await this.cachedDir(ID_COLLECTIONS[kind], (v) => v, true)) as Array<Record<string, unknown>>
  }

  async dayFile(date: string): Promise<DayFile | null> {
    const v = await this.cachedJson(paths.day(date))
    return v === undefined ? null : dayFileFrom(v, date)
  }

  /** What the engine counts a day from: the snapshot from the log, or – before the leader wrote it – the one this computer computes. */
  private async dayContext(date: string, read: DayRead | undefined, at: number): Promise<DayContext> {
    const inp = await this.inputs()
    const file = await this.dayFile(date)
    const events = (read ?? (await this.log.readDay(date))).events
    const snapshot = daySnapshotOf(events) ?? createDay({ date, ...inp, dayFile: file, holidays: this.o.holidays, at })
    const nextDate = addDays(date, 1)
    const nextFile = await this.dayFile(nextDate)
    return {
      date,
      snapshot,
      plan: dayPlan(snapshot, file),
      wakeMin: dayWakeMin(snapshot, file),
      nextWakeMin: nextWakeForBedtime(null, nextFile, inp.changes, nextDate),
      events,
      now: at
    }
  }

  /** The engine's day. */
  async dayState(date: string, read?: DayRead, at = this.clock.now()): Promise<DayState> {
    return computeDay(await this.dayContext(date, read, at))
  }

  /** The day's energy with the day it is counted from (spec „Model energii”); the module counts as on until its setting (E3). */
  async energyState(date: string, read?: DayRead, at = this.clock.now()): Promise<{ day: DayState; energy: EnergyState }> {
    const ctx = await this.dayContext(date, read, at)
    const day = computeDay(ctx)
    return { day, energy: computeEnergy(ctx, day) }
  }

  /** One check (every 15 s): presences, who leads, the journal against OneDrive, the queue, and the leader's tasks. */
  async check(): Promise<CheckResult> {
    const now = this.clock.now()
    const problems: string[] = []
    const day = logicalDayOf(now)
    try {
      this.peers = await this.presence.scan()
      for (const p of this.peers) {
        if (this.lastSeenPeers.get(p.presence.computer) !== p.fileSeenAt) this.settle.changeSeen(now)
        this.lastSeenPeers.set(p.presence.computer, p.fileSeenAt)
      }
    } catch (e) {
      problems.push(String(e))
    }
    this.settle.oneDrive(this.o.oneDriveRunning(), now)
    // One pass of writes: today's own log is compared with the journal at every check (OneDrive may swap it).
    this.log.markPending(day)
    await this.log.flush()
    if (this.log.pendingDays.length) problems.push(`log: ${this.log.pendingDays.length} dni czeka na zapis w folderze`)
    // The journal keeps the last days (confirmed ones older go; days not yet on OneDrive always stay).
    if (now - this.lastCompact >= COMPACT_EVERY_MS) {
      try {
        this.log.compact(addDays(day, -JOURNAL_KEEP_DAYS))
        this.lastCompact = now
      } catch (e) {
        problems.push(`dziennik: ${String(e)}`)
      }
    }
    let read: DayRead | null = null
    try {
      read = await this.log.readDay(day)
      if (read.complete) this.settle.scannedFolder()
      else problems.push(...read.problems.map((p) => `${p.file}: ${p.why}`))
    } catch (e) {
      problems.push(String(e))
    }
    await this.queue.apply(this.records).catch((e) => problems.push(`kolejka: ${String(e)}`))
    // Conflict copies of the open day's file are joined (what differs on both sides stays a question for E3).
    try {
      for (const c of await this.records.conflictCopies(paths.day(day).slice(0, paths.day(day).lastIndexOf('/')))) {
        if (c.canonical !== paths.day(day)) continue
        const r = await this.records.joinCopy(c.copy, c.canonical)
        if (!r.joined && r.conflicts.length) problems.push(`konflikt ${c.copy}: ${r.conflicts.map((x) => x.path.join('.')).join(', ')}`)
      }
    } catch (e) {
      problems.push(`kopie konfliktowe: ${String(e)}`)
    }
    const settled = this.settle.settled(now)
    this.leader = decideLeader({
      now,
      self: { computer: this.o.computer, rulesVersion: this.rulesVersion, crashed: false, lastPresence: this.presence.own.lastPresence, oneDriveRunning: this.o.oneDriveRunning() },
      peers: this.peers,
      current: this.current,
      currentClaimed: this.leader.claimed
    })
    this.current = this.leader.leader
    this.presence.update({ seenLeader: this.leader.leader, settled })

    let created: string | null = null
    let segments = 0
    // The leader's tasks need a settled computer, a complete view of the day's logs and clocks that agree.
    if (read?.ahead) problems.push('zegar: zdarzenie innego komputera ponad 24 h przed zegarem tego komputera – działania automatyczne czekają')
    if (this.leader.iLead && settled && read?.complete && !read.ahead) {
      try {
        // The day is made once, by the leader (a derived id: two leaders after a pause of sync write the same event).
        if (!daySnapshotOf(read.events)) {
          const inp = await this.inputs()
          const snapshot = createDay({ date: day, ...inp, dayFile: await this.dayFile(day), holidays: this.o.holidays, at: now })
          this.append({ id: derivedId(day, 'day.create'), day, dom: 'timer', k: 'day.create', snapshot })
          created = day
          read = await this.log.readDay(day)
        }
        // The segments of minutes: only minutes every computer with a fresh presence has caught up with – from the day's
        // start, as minutes already written are skipped and a stale segment's minutes are written again (T416).
        const ctx = await this.dayContext(day, read, now)
        const state = computeDay(ctx)
        const gate = minuteGate(now, day, this.peers, read.lastByComputer)
        for (const seg of newSegments(state, state.grid.start, Math.min(gate, now))) {
          this.append({ day, dom: 'timer', k: 'minutes', ...seg })
          segments++
        }
        if (state.hardEnd.passed != null && !state.facts.hardEndPass && state.grid.start + state.hardEnd.passed * 60_000 <= gate) {
          this.append({ id: derivedId(day, 'hardend.pass'), day, dom: 'timer', k: 'hardend.pass', at: state.grid.start + state.hardEnd.passed * 60_000, basis: 'prowadzący' })
        }
        // Descents to the reserve, registered once their minute is closed by the gate (events up to 30 s after a minute
        // still round into it): they stay whatever later corrections say (spec). Apart, so energy never stops the rest.
        try {
          const gateIdx = idxOf(state.grid, gate)
          for (const d of newDescents(state.grid, computeEnergy(ctx, state))) {
            if (idxOf(state.grid, d.at) >= gateIdx) continue
            this.append({ id: derivedId(day, 'energy.reserve', d.pool, d.at), day, dom: 'energy', k: 'energy.reserve', at: d.at, pool: d.pool, silent: d.silent })
          }
        } catch (e) {
          problems.push(`energia: ${String(e)}`)
        }
      } catch (e) {
        problems.push(`zadania prowadzącego: ${String(e)}`)
      }
    }
    if (now - this.lastObserve >= OBSERVE_EVERY_MS) {
      this.append({ day, dom: 'meta', k: 'observe.alive', at: now })
      this.lastObserve = now
    }
    await this.log.flush()
    await this.presence.tick().catch((e) => problems.push(`obecność: ${String(e)}`))
    return { leader: this.leader, settled, created, segments, problems }
  }

  /** The end of the Windows session: the observation's end as one synchronous line in the journal, without fsync. */
  systemEnd(): void {
    // Asked and then ended (or asked in every window): one line.
    if (!this.observing) return
    const now = this.clock.now()
    this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.to', at: now, why: 'system' }, { system: true })
    this.observing = false
  }

  /** Closing the folder: the observation's end, the presence „closed”, everything written that can be. */
  async close(why: 'quit' | 'system' = 'quit'): Promise<void> {
    const now = this.clock.now()
    this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.to', at: now, why }, { system: why === 'system' })
    if (why === 'system') return
    this.presence.update({ state: 'closed' })
    await this.log.flush()
    await this.presence.tick(true).catch(() => undefined)
  }

  /** Own events of a day not yet on OneDrive (the bar: „N zmian zapisze się po powrocie folderu”). */
  get unsynced(): number {
    return this.log.pendingDays.length + this.queue.pending.length
  }

  /** The events of a day as this computer sees them now. */
  readDay(day: string): Promise<DayRead> {
    return this.log.readDay(day)
  }

  /** Whether an event of a day is known (for tests and the simulator). */
  static hasKind(events: readonly AnyEvent[], k: string): boolean {
    return events.some((e) => isKnown(e) && e.k === k)
  }
}
