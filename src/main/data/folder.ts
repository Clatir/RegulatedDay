/**
 * One data folder in the main process (spec „Dane, komputery i ustawienia”, „Kilka komputerów”): the local journal and
 * the logs, the records and the queue of edits, this computer's presence and the others', who leads, „nieustalony”, and
 * the leader's tasks of E1 – creating the day and writing the segments of minutes (the questions, notifications and
 * backups are run by the scheduler of E4a from the same decisions). Everything this computer's state needs that is not
 * in the folder – the journal, the queue, the life marker – lives in `stateDir`, separate for every folder.
 *
 * The scheduler calls `check()` every 15 s (and on events of the watcher); the sync simulator of E1 calls it on its own
 * virtual clock with a faulty file system.
 */
import { join } from 'node:path'
import { EventClock, type ClockSources } from '@shared/data/clock'
import { classify, paths, ID_COLLECTIONS } from '@shared/data/paths'
import { createDay, dayPlan, dayWakeMin, nextWakeForBedtime, type HolidayLookup } from '@shared/engine/createDay'
import { computeDay, newSegments, type DayState } from '@shared/engine/day'
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

  /** A wake, a lock longer than 10 min or the network's return: „nieustalony” again; after a sleep the observation resumes. */
  unsettle(reason: SettleReason): void {
    const now = this.clock.now()
    if (reason === 'wake') {
      this.clock.rebase()
      this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.from', at: now, why: 'resume' })
    }
    this.settle.begin(reason, now)
  }

  /** Going to sleep: the observation ends (nothing is known of the time after it). */
  suspend(): void {
    const now = this.clock.now()
    this.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.to', at: now, why: 'suspend' })
    void this.log.flush()
  }

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
    if (r.status !== 'ok') return old?.value
    this.cache.set(rel, { ...st, value: r.value })
    return r.value
  }

  /** A folder of records; a listing that fails keeps the names listed before (unknown is never empty). */
  private async cachedDir(dir: string, parse: (v: unknown) => unknown): Promise<unknown[]> {
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
      const v = parse(await this.cachedJson(`${dir}/${name}`))
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
    return (await this.cachedDir(ID_COLLECTIONS[kind], (v) => v)) as Array<Record<string, unknown>>
  }

  async dayFile(date: string): Promise<DayFile | null> {
    const v = await this.cachedJson(paths.day(date))
    return v === undefined ? null : dayFileFrom(v, date)
  }

  /** The engine's day: the snapshot from the log, or – before the leader wrote it – the one this computer computes. */
  async dayState(date: string, read?: DayRead, at = this.clock.now()): Promise<DayState> {
    const inp = await this.inputs()
    const file = await this.dayFile(date)
    const events = (read ?? (await this.log.readDay(date))).events
    const snapshot = daySnapshotOf(events) ?? createDay({ date, ...inp, dayFile: file, holidays: this.o.holidays, at })
    const nextDate = addDays(date, 1)
    const nextFile = await this.dayFile(nextDate)
    return computeDay({
      date,
      snapshot,
      plan: dayPlan(snapshot, file),
      wakeMin: dayWakeMin(snapshot, file),
      nextWakeMin: nextWakeForBedtime(null, nextFile, inp.changes, nextDate),
      events,
      now: at
    })
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
    await this.log.flush()
    for (const d of new Set([day, ...this.log.pendingDays])) await this.log.ensure(d).catch((e) => problems.push(`log ${d}: ${String(e)}`))
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
    // The leader's tasks need a settled computer, a complete view of the day's logs and a sane clock.
    if (this.leader.iLead && settled && read?.complete && !this.clock.aheadSeen) {
      try {
        // The day is made once, by the leader (a derived id: two leaders after a pause of sync write the same event).
        if (!daySnapshotOf(read.events)) {
          const inp = await this.inputs()
          const snapshot = createDay({ date: day, ...inp, dayFile: await this.dayFile(day), holidays: this.o.holidays, at: now })
          this.append({ id: derivedId(day, 'day.create'), day, dom: 'timer', k: 'day.create', snapshot })
          created = day
          read = await this.log.readDay(day)
        }
        // The segments of minutes: only minutes every computer with a fresh presence has caught up with.
        const state = await this.dayState(day, read, now)
        const gate = minuteGate(now, day, this.peers, read.lastByComputer)
        const writtenTo = state.facts.segments.reduce((m, s) => Math.max(m, s.to), 0)
        const from = state.grid.start + writtenTo * 60_000
        for (const seg of newSegments(state, from, Math.min(gate, now))) {
          this.append({ day, dom: 'timer', k: 'minutes', ...seg })
          segments++
        }
        if (state.hardEnd.passed != null && !state.facts.hardEndPass && state.grid.start + state.hardEnd.passed * 60_000 <= gate) {
          this.append({ id: derivedId(day, 'hardend.pass'), day, dom: 'timer', k: 'hardend.pass', at: state.grid.start + state.hardEnd.passed * 60_000, basis: 'prowadzący' })
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
