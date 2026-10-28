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
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '../datastore/atomic'
import { EventClock, type ClockSources } from '@shared/data/clock'
import type { MergeConflict } from '@shared/data/merge'
import { classify, paths, ID_COLLECTIONS } from '@shared/data/paths'
import { readLogText } from '@shared/data/logText'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, autoActions, nextDeadline, questionsOf, type Question } from '@shared/engine/auto'
import { createDay, type HolidayLookup } from '@shared/engine/createDay'
import { dayContextOf } from '@shared/engine/context'
import { computeDay, newSegments, type DayContext, type DayState } from '@shared/engine/day'
import { NO_POWER, powerNeedOf, type PowerNeed } from '@shared/engine/power'
import { isRunningRequest, requestAction, type RequestAction } from '@shared/engine/requests'
import { timerAction, timerNow, type ActionResult, type TimerAction, type TimerDraft } from '@shared/engine/timer'
import { dayStart } from '@shared/time/day'
import { computeEnergy, newDescents, type EnergyState } from '@shared/engine/energy'
import { betterFreeze, foldFacts, isRunning, type DayFacts } from '@shared/engine/facts'
import { correctionEnd, freezeDecision, gradeLineFrom, isFreeDay, lastEventsOf, openedAtOf, WRITERS_DAYS, type GradeLine } from '@shared/engine/freeze'
import { dayGame, notesSum, storedGame, weekOf, type GameDay, type GameDayInput } from '@shared/engine/game'
import { gameView, regenWaysOf, ROOM_ITEMS, storedWays, type Celebration, type GameView } from '@shared/engine/progress'
import { sideBOf, storedModules, type DayMeasure, type SideB } from '@shared/engine/sideB'
import type { DaySummary } from '@shared/engine/daySummary'
import { calibrationPeriod, costProposals, inCalibration, timeProposals, type CalibrationDay, type CalibrationPeriod, type CostEvidence, type CostProposal, type TimeProposal, type TimeSample } from '@shared/engine/calibration'

import { inProcess, type Worker } from '../worker/host'
import { CLOSE_WINDOW_H, closeEvents, closeRefusal, ritualActivity, ritualAnswer, ritualRows, unclosedDays, type DayLog, type RitualValue, type RitualView } from '@shared/engine/ritual'
import { atOf, gridOf, idxOf } from '@shared/engine/grid'
import { derivedId } from '@shared/model/ids'
import { CLOSE_HOWS, compareEvents, daySnapshotOf, isKnown, parseEvent, RULES_VERSION, type AnyEvent, type CloseHow, type Domain, type Signal } from '@shared/model/events'
import type { Pool } from '@shared/model/categories'
import { dayFileFrom, lectureFrom, templateFrom, type DayFile, type LectureSeries, type Template } from '@shared/model/plan'
import { MODULES, personName, rdFrom, type ModuleId, type WriteOnceField } from '@shared/model/rd'
import { runningRequestOf } from '@shared/engineView'
import type { RunningRequest } from '@shared/widget'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import type { CsvDay } from '@shared/engine/csv'
import { isDayTypeId, settingsOn, type SettingsChange } from '@shared/model/settings'
import { decideLeader, minuteGate, SILENT_MS, type LeaderDecision, type Peer } from '@shared/sync/leader'
import type { Presence } from '@shared/sync/presence'
import { Settle, type SettleReason } from '@shared/sync/settle'
import { logicalDayOf } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import { EditQueue, type Outcome, type QueuedEdit } from './editQueue'
import { EventLog, type DayRead, type EventDraft } from './eventLog'
import type { DataFs } from './fsio'
import { RecordHistory } from './history'
import { PresenceStore } from './presenceStore'
import { RecordStore } from './records'

export const OBSERVE_EVERY_MS = 5 * 60_000

/** What the main window may write to a day's log, and what each concerns (spec „Każde zdarzenie podaje, czego dotyczy”). */
const USER_EVENTS: Record<string, Domain> = {
  'boundary.approve': 'timer',
  'boundary.undo': 'timer',
  'boundary.exception': 'timer',
  'block.park': 'timer',
  'block.cancel': 'timer',
  'block.addConfirm': 'timer',
  'block.exchange': 'game',
  'work.end': 'timer',
  'day.snapshot': 'timer',
  'energy.checkin': 'energy',
  'energy.module': 'energy',
  'module.set': 'meta',
  // The ritual's felt cost of a category (D319): passive, never the timer's (an older version installs no faster for it).
  'cost.felt': 'energy'
}
/** The journal keeps own events of this many days back (spec: until the day's freeze plus 7 days – freezing is E6). */
export const JOURNAL_KEEP_DAYS = 14
const COMPACT_EVERY_MS = 60 * 60_000
/** Conflict copies of the records are looked for this often (and at the first check). */
const COPY_SCAN_MS = 60_000
/**
 * Days back the leader looks for one to freeze: 72 h after a day's end reaches four of them, but every computer may be
 * off for weeks – a day frozen is remembered and not read again.
 */
const FREEZE_LOOKBACK_DAYS = 60
/** A day whose freeze failed (a file held, the helper hung) is tried again after this. */
const FREEZE_RETRY_MS = 15 * 60_000
/** The days back whose own logs this computer checks for conflict copies (the days still to freeze). */
const OWN_COPY_DAYS = 4
/** A day's files quiet this long before its freeze (spec „nie zmieniają się od 1 min po przeskanowaniu folderu”). */
const QUIET_MS = 60_000
const CALIBRATION_RECHECK_MS = 10 * 60_000
/** The room's items this computer has seen unlocked, in its state folder. */
const ROOM_FILE = 'room.json'
/** The full-screen celebrations shown on this computer (its state folder, T510). */
const CELEBRATED_FILE = 'celebrated.json'
/** „Prośba ▸” ranks the people by the requests of this many days (D311). */
const PEOPLE_DAYS = 28
/** The days before today are counted again this often (late logs of other computers). */
const PEOPLE_RECOUNT_MS = 15 * 60_000
/** The rituals of this many days back are remembered (the morning shows at most 72 h of days to close). */
const RITUAL_MEMO_DAYS = 4

/** Why an answer of the ritual was refused, in words (never the choice's id). */
function refusalOf(choice: string): string {
  if (choice === 'endedAt' || choice === 'workedUntil' || choice === 'projectUntil' || choice === 'work' || choice === 'project') return 'ta godzina jest poza czasem bloku albo po teraz'
  if (choice === 'notRest') return 'odcinek: „od” musi być przed „do”'
  if (choice === 'person') return 'wybierz osobę z listy'
  return 'tego wyboru nie ma w tym wierszu'
}

/**
 * A block of the day runs now (started, not ended, not paused – „Cofnij” counted): one running through 04:00 keeps its
 * day (spec „Timer”); a block left paused is no reason to stay on the day before.
 */
function hasRunning(day: string, events: readonly AnyEvent[]): boolean {
  if (!events.some((e) => e.k === 'block.start')) return false
  for (const f of foldFacts(gridOf(day), events).blocks.values()) if (f.endedAt == null && isRunning(f)) return true
  return false
}

/**
 * A request of the day runs (not ended – „Cofnij” counted): one through 04:00, or from a day the computer slept through,
 * keeps its day until its end (by „Koniec” or its rules).
 */
function hasOpenRequest(day: string, events: readonly AnyEvent[], id: string | null = null): boolean {
  if (!events.some((e) => e.k === 'request.start')) return false
  return foldFacts(gridOf(day), events).requests.some((r) => r.to === Number.POSITIVE_INFINITY && r.mode !== 'after' && (id == null || r.id === id))
}

/** The day before still has something of now: a running block or request, or „Odcinam się” to be closed at 04:00. */
function spillsOver(day: string, events: readonly AnyEvent[]): boolean {
  if (hasRunning(day, events) || hasOpenRequest(day, events)) return true
  return events.some((e) => e.k === 'disconnect.start') && foldFacts(gridOf(day), events).disconnect.some((d) => d.to === Number.POSITIVE_INFINITY)
}

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
  /** The first day of the ritual: days from it are closed and frozen (null – none yet, before its screens, T482). */
  ritualFrom?: string | null
  /** The version has the ritual's screens: its first day comes from rd.json (written once by the leader, D320). */
  ritualScreens?: boolean
  /** The first day in the game: days before it are outside (null – no game yet, before its screens, T492). */
  gameFrom?: string | null
  /** The version has the game's screens: its first day comes from rd.json (written once by the leader, T509). */
  gameScreens?: boolean
  /** The helper process (T190): the grades of days to freeze, the CSV export; default: this process. */
  worker?: Worker
}

export interface CheckResult {
  leader: LeaderDecision
  settled: boolean
  created: string | null
  segments: number
  /** Automatic actions the leader wrote in this check. */
  autos: number
  /** The next instant the timer has something due (ms): the scheduler's exact timer. */
  nextAt: number | null
  /** Days the leader froze in this check. */
  frozen: string[]
  problems: string[]
}

/** A click of the widget or the main window, with the day it concerns (default: the day of the running block, else today). */
export type TimerClick = (TimerAction | RequestAction) & { day?: string }

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
  private editSeq = 0
  private lastCopyScan = 0
  /** Conflict copies with fields different on both sides (copy → the file and the fields). */
  readonly copyConflicts = new Map<string, { canonical: string; conflicts: MergeConflict[] }>()
  /** The files of each day a freeze waits on: what they held at the last look and since when (spec: quiet for 1 min). */
  private readonly dayQuiet = new Map<string, { sig: string; since: number }>()
  /** Days known frozen (never read again for the freeze), and days whose freeze failed – tried again after this. */
  private readonly frozenDays = new Set<string>()
  private readonly freezeRetry = new Map<string, number>()
  /** The files of grades as last read (by size and time of modification). */
  private readonly gradeFiles = new Map<string, { size: number; mtimeMs: number; lines: GradeLine[] }>()
  /** The grades merged from those files, by the signature of the files (T501). */
  private gradedMemo: { sig: string; lines: Map<string, GradeLine> } | null = null
  /**
   * The game counted once per change of what it is made of (T501): the frozen days of the files of grades, each day
   * still open (by its log, records and inputs; today also by the minute) and the view made of them.
   */
  private frozenGameDays: { key: string; days: GameDay[] } | null = null
  private openGameDays = new Map<string, { key: string; day: GameDay }>()
  private gameMemo: { key: string; view: GameView } | null = null
  /** In the calibration period: last counted (the day, when), see `calibrating`. */
  private calibrationNow: { day: string; at: number; on: boolean; retryMs: number } | null = null
  /** The starts of requests by person on the days before today (counted once a day, D311). */
  private peopleCounts: { day: string; at: number; before: Map<string, number> } | null = null
  /** The rituals of the last days, each counted again only on a change of what it is made of (the morning asks often). */
  private readonly ritualMemo = new Map<string, { key: string; view: RitualView }>()

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
    await f.continueOwnNumbers(logicalDayOf(now))
    f.settle.begin('start', now)
    if (o.previousRun && !o.previousRun.clean) f.append({ day: logicalDayOf(o.previousRun.lastAt), dom: 'meta', k: 'observe.to', at: o.previousRun.lastAt, why: 'crash' })
    f.append({ day: logicalDayOf(now), dom: 'meta', k: 'observe.from', at: now, why: 'start' })
    f.lastObserve = now
    for (const e of f.log.ownEvents(logicalDayOf(now))) if (e.k === 'presence.first') f.firstPresence.add(e.day)
    await f.presence.tick(true).catch(() => undefined)
    return f
  }

  /**
   * This computer's own logs of the last days may hold numbers its journal lacks (a whole backup restored into a new
   * folder, a reinstall): the numbers go on after the highest – an id never repeats, a number never goes back.
   */
  private async continueOwnNumbers(today: string): Promise<void> {
    for (let i = 0; i <= JOURNAL_KEEP_DAYS; i++) {
      const bytes = await this.o.fs.read(join(this.o.dataDir, paths.log(addDays(today, -i), this.o.computer))).catch(() => null)
      if (!bytes) continue
      for (const e of readLogText(bytes.toString('utf8')).events) if (e.c === this.o.computer) this.clock.continueAfter(e.n, e.l)
    }
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
    // The day's files must be quiet for a minute after the folder is scanned again (spec „także po wybudzeniu”).
    this.dayQuiet.clear()
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

  /** A record as this computer sees it: the file with your queued edits laid over it (shown at once, also offline). */
  async recordView(rel: string): Promise<Record<string, unknown> | undefined> {
    return this.queue.overlay(rel, (await this.cachedJson(rel)) as Record<string, unknown> | undefined)
  }

  /** A record as the folder holds it (no queued edits): what the leader makes the shared day from. */
  private async shared(rel: string): Promise<Record<string, unknown> | undefined> {
    return (await this.cachedJson(rel)) as Record<string, unknown> | undefined
  }

  /**
   * A folder of records – as the folder holds it, or (`own`) as this computer sees it, with your queued edits and new
   * records still in the queue; a listing that fails keeps the names listed before (unknown is never empty).
   */
  private async cachedDir(dir: string, parse: (v: unknown) => unknown, lenient = false, own = false): Promise<unknown[]> {
    let names: string[]
    try {
      names = (await this.o.fs.list(join(this.o.dataDir, dir))).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name)
      this.listed.set(dir, names)
    } catch (e) {
      const before = this.listed.get(dir)
      if (!before) throw e
      names = before
    }
    const rels = new Set(names.map((n) => `${dir}/${n}`))
    if (own) for (const rel of this.queue.relsUnder(dir)) rels.add(rel)
    const out: unknown[] = []
    for (const rel of [...rels].sort()) {
      const c = classify(rel)
      if (!c || c.conflict) continue
      let raw: unknown
      try {
        raw = own ? await this.recordView(rel) : await this.shared(rel)
      } catch (e) {
        // A list for showing (requests) goes on without the unknown record; what a day is made from does not.
        if (lenient && e instanceof UnknownRecordError) continue
        throw e
      }
      if (raw === undefined) continue
      const v = parse(raw)
      if (v) out.push(v)
    }
    return out
  }

  /**
   * rd.json's changes, the templates and the plan of lectures – as the folder holds them (the leader makes the shared
   * day from them, never from edits not yet written nor answers not yet given), or (`own`) with your queued edits.
   */
  async inputs(own = false): Promise<Inputs> {
    const changes = rdFrom(own ? await this.recordView(paths.settings) : await this.shared(paths.settings)).settings
    const templates = (await this.cachedDir(ID_COLLECTIONS.template, templateFrom, false, own)) as Template[]
    const lectures = (await this.cachedDir(ID_COLLECTIONS.schedule, lectureFrom, false, own)) as LectureSeries[]
    return { changes, templates, lectures }
  }

  /** The records of a collection as this computer sees them (requests, routines …), through the same cache. */
  async collection(kind: keyof typeof ID_COLLECTIONS): Promise<Array<Record<string, unknown>>> {
    return (await this.cachedDir(ID_COLLECTIONS[kind], (v) => v, true, true)) as Array<Record<string, unknown>>
  }

  async dayFile(date: string, own = false): Promise<DayFile | null> {
    const v = own ? await this.recordView(paths.day(date)) : await this.shared(paths.day(date))
    return v === undefined ? null : dayFileFrom(v, date)
  }

  /**
   * Your edits from the main window (spec „Edycje plików … trafiają najpierw do lokalnej trwałej kolejki”): each goes to
   * the queue on the disk first, then the queue is laid onto the folder; what met a change elsewhere stays a question.
   */
  async edit(entries: ReadonlyArray<Omit<QueuedEdit, 'id' | 'at' | 'schema'> & { schema?: number }>): Promise<Outcome[]> {
    // A new record only where there is none: a file that is there but cannot be read now (OneDrive still fetching it) or
    // that came meanwhile is never taken as missing – its every field would be a question about a change you never made.
    for (const e of entries) {
      if (!e.create) continue
      const now = await this.records.read(e.rel)
      if (now.status !== 'missing' || this.queue.overlay(e.rel, undefined) !== undefined)
        throw new Error(now.status === 'ok' ? 'ten rekord już jest w folderze (zmienił się w międzyczasie) – zmiana nie została zapisana, spróbuj jeszcze raz' : 'plik jest teraz nieczytelny – zmiana nie została zapisana, spróbuj za chwilę')
    }
    const at = this.clock.now()
    const ids: string[] = []
    for (const e of entries) {
      const id = `${this.o.computer}-${at.toString(36)}-${(this.editSeq++).toString(36)}`
      ids.push(id)
      this.queue.add({ id, at, schema: e.schema ?? 1, rel: e.rel, edits: e.edits, ...(e.create ? { create: true } : {}), ...(e.remove ? { remove: true } : {}) })
    }
    const outcomes = await this.queue.apply(this.records)
    // One outcome per entry, in their order: an entry a run chained before this one laid has its outcome in the queue.
    return ids.map((id) => outcomes.find((o) => o.id === id) ?? this.queue.outcomeOf(id))
  }

  /** What the engine counts a day from: the snapshot from the log, or – before the leader wrote it – the one this computer computes. */
  private async dayContext(date: string, read: DayRead | undefined, at: number): Promise<DayContext> {
    const inp = await this.inputs()
    const dayFile = await this.dayFile(date)
    const events = (read ?? (await this.log.readDay(date))).events
    const nextFile = await this.dayFile(addDays(date, 1))
    return dayContextOf(inp, { date, events, dayFile, nextFile }, this.o.holidays, at)
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
    if (now - this.lastCopyScan >= COPY_SCAN_MS) {
      this.lastCopyScan = now
      await this.joinCopies(day).catch((e) => problems.push(`kopie konfliktowe: ${String(e)}`))
      // Its own logs of the last days too: only this computer joins their copies, and a day with a copy freezes only
      // after 72 h (spec „w plikach … nie ma kopii konfliktowych”).
      for (let i = 1; i <= OWN_COPY_DAYS; i++) await this.log.ensure(addDays(day, -i)).catch((e) => problems.push(`kopie konfliktowe logu: ${String(e)}`))
    }
    const settled = this.settle.settled(now)
    this.leader = decideLeader({
      now,
      self: { computer: this.o.computer, rulesVersion: this.rulesVersion, crashed: this.ownVersionCrashed, lastPresence: this.presence.own.lastPresence, oneDriveRunning: this.o.oneDriveRunning() },
      peers: this.peers,
      current: this.current,
      currentClaimed: this.leader.claimed
    })
    this.current = this.leader.leader
    this.presence.update({ seenLeader: this.leader.leader, settled })

    let created: string | null = null
    let segments = 0
    let autos = 0
    let nextAt: number | null = null
    let frozen: string[] = []
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
        // What the app does by itself (spec „Działania automatyczne”): today's, and yesterday's while a block of it runs
        // through 04:00 (it belongs to the day it began). Apart, so the timer never stops the rest.
        try {
          const r = await this.autoTasks(day, read, ctx, state, now, gate)
          autos += r.written
          nextAt = r.nextAt
          const yesterday = addDays(day, -1)
          const yRead = await this.log.readDay(yesterday)
          if (yRead.complete && spillsOver(yesterday, yRead.events)) {
            const yCtx = await this.dayContext(yesterday, yRead, now)
            // Input after 04:00 is in today's logs: both gates hold.
            const y = await this.autoTasks(yesterday, yRead, yCtx, computeDay(yCtx), now, Math.min(gate, minuteGate(now, yesterday, this.peers, yRead.lastByComputer)))
            autos += y.written
            if (y.nextAt != null) nextAt = nextAt == null ? y.nextAt : Math.min(nextAt, y.nextAt)
          }
        } catch (e) {
          problems.push(`timer: ${String(e)}`)
        }
        // The first day of the ritual, once (D320); then freezing the days whose window of corrections has ended. Apart,
        // so a day that cannot freeze stops nothing else.
        try {
          await this.ritualStart(now)
          await this.gameStart(now)
          frozen = await this.freezeTasks(now, settled, problems)
        } catch (e) {
          problems.push(`zamrażanie: ${String(e)}`)
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
    return { leader: this.leader, settled, created, segments, autos, nextAt, frozen, problems }
  }

  /**
   * The first day of the ritual (D320): the option, or – with the ritual's screens – rd.json's as this computer sees it
   * (its own edit still in the queue included: the bar, the window and the leader agree), read each time.
   */
  async ritualDay(): Promise<string | null> {
    if (!this.o.ritualScreens) return this.o.ritualFrom ?? null
    return rdFrom(await this.recordView(paths.settings).catch(() => undefined)).ritualFrom
  }

  /**
   * D320, T504: the leader of a version with the ritual's screens writes its first day into rd.json once – today; an
   * older version ignores the field (it never freezes). A folder without rd.json (no wizard yet) waits; an edit of it
   * still in the queue (waiting, or a question) is not written again.
   */
  private async ritualStart(now: number): Promise<void> {
    if (this.o.ritualScreens) await this.writeOnce('ritualFrom', logicalDayOf(now))
  }

  /**
   * The first day in the game: the option, or – with the game's screens – rd.json's. For the screens as this computer
   * sees it; for the leader's grades (`files`) as the folder holds it – never an edit not written yet – and a read that
   * fails rejects: the day waits, never graded as „outside the game” (T509).
   */
  async gameDay(files = false): Promise<string | null> {
    if (!this.o.gameScreens) return this.o.gameFrom ?? null
    if (files) return rdFrom(await this.shared(paths.settings)).gameFrom
    return rdFrom(await this.recordView(paths.settings).catch(() => undefined)).gameFrom
  }

  /**
   * T509: the leader of a version with the game's screens writes the game's first day into rd.json once – tomorrow (the
   * spec: the day before the version with the game and the day of its installation are outside the game), one date for
   * every computer; an older version ignores the field.
   */
  private async gameStart(now: number): Promise<void> {
    if (this.o.gameScreens) await this.writeOnce('gameFrom', addDays(logicalDayOf(now), 1))
  }

  /**
   * A day of rd.json written once (D320, T504, T509): only when there is none. A folder without rd.json (no wizard yet)
   * waits; an edit of it still in the queue (waiting, or a question) is not written again.
   */
  private async writeOnce(field: WriteOnceField, value: string): Promise<void> {
    const raw = await this.recordView(paths.settings)
    if (!raw || isIsoDate(raw[field]) || this.queue.pending.some((e) => e.rel === paths.settings)) return
    // The base is what the file holds (a value that is no date is replaced, never a question).
    await this.edit([{ rel: paths.settings, edits: [{ path: [field], base: raw[field], value }] }])
  }

  /**
   * The leader freezes the days whose window of corrections has ended (spec „Ocena dnia”), from the first day of the
   * ritual (none before the version with its screens, T482): the grade as written up to the last event of every computer
   * it sees, in the day's log and in this computer's file of grades (derived – the logs can make it again).
   */
  private async freezeTasks(now: number, settled: boolean, problems: string[]): Promise<string[]> {
    const from = await this.ritualDay()
    if (from == null) return []
    const today = logicalDayOf(now)
    const mayFreeze = this.mayFreeze(settled, now)
    const out: string[] = []
    // The computers that wrote in the last 7 days, and the days' inputs of the game: once per check, only when a day is
    // due (the first due day is the earliest – the inputs cover every later one).
    let writers: Promise<Set<string>> | null = null
    let inputs: Promise<(day: string) => GameDayInput> | null = null
    let gameFrom: Promise<string | null> | null = null
    for (let i = FREEZE_LOOKBACK_DAYS; i >= 1; i--) {
      const day = addDays(today, -i)
      if (day < from || this.frozenDays.has(day) || (this.freezeRetry.get(day) ?? 0) > now) continue
      // Each day apart: one that fails (a file held, the helper hung) is tried again later and stops no other.
      try {
        const read = await this.log.readDay(day)
        if (!read.complete) continue
        const freezes = read.events.filter((e) => isKnown(e) && e.k === 'day.freeze')
        if (freezes.some((e) => e.v >= this.rulesVersion)) {
          this.frozenDays.add(day)
          continue
        }
        if (freezes.length) {
          // Frozen by an older version (rules before this one – e.g. while this computer was closed): a day of the game is
          // graded again by these rules up to the events that freeze counted, and the newer grade wins (spec „zostaje
          // ocena według nowszej wersji reguł”, T509). Days before the game stay as they are.
          if (!mayFreeze) continue
          gameFrom ??= this.gameDay(true)
          const from = await gameFrom
          const was = foldFacts(gridOf(day), read.events).frozen
          // No game day yet in the folder's rd.json: asked again at a later check (the leader may be writing it now).
          if (from == null) continue
          if (day < from || !was) {
            this.frozenDays.add(day)
            continue
          }
          inputs ??= this.gameInputs(day, today)
          const grade = await (this.o.worker ?? inProcess).run({ kind: 'grade', ctx: await this.dayContext(day, read, now), know: was.know, game: (await inputs)(day) })
          const line = { day, at: now, v: this.rulesVersion, how: was.how, know: was.know, missing: was.missing, grade }
          await this.o.fs.append(join(this.o.dataDir, paths.grades(day.slice(0, 4), this.o.computer)), `${JSON.stringify(line)}\n`)
          this.append({ id: derivedId(day, 'freeze', this.o.computer, String(this.rulesVersion)), day, dom: 'game', k: 'day.freeze', at: now, how: was.how, know: was.know, missing: was.missing, grade })
          this.frozenDays.add(day)
          out.push(day)
          continue
        }
        const quiet = this.quietFor(day, read, await this.dayFile(day), now)
        const openedAt = openedAtOf((await this.log.readDay(addDays(day, 1))).events)
        if (now < correctionEnd(day, openedAt)) continue
        writers ??= this.writerIds(today)
        const ids = new Set([...(await writers), ...Object.keys(read.lastByComputer)])
        const computers = [...ids].map((id) => ({ id, self: id === this.o.computer, presence: this.peers.find((p) => p.presence.computer === id)?.presence ?? null, visibleLast: read.lastByComputer[id] ?? -1 }))
        const decision = freezeDecision({ date: day, now, mayFreeze, openedAt, computers, filesQuiet: read.copies === 0 && quiet })
        if (!decision.freeze) continue
        const know = { ...read.lastByComputer }
        inputs ??= this.gameInputs(day, today)
        const game = (await inputs)(day)
        const grade = await (this.o.worker ?? inProcess).run({ kind: 'grade', ctx: await this.dayContext(day, read, now), know, game })
        // The file of grades first: a freeze in the log is never left without its line (the line is derived – a second
        // one after a failed log write is harmless, the freeze event is what counts).
        const line = { day, at: now, v: this.rulesVersion, how: decision.how, know, missing: decision.missing, grade }
        await this.o.fs.append(join(this.o.dataDir, paths.grades(day.slice(0, 4), this.o.computer)), `${JSON.stringify(line)}\n`)
        this.append({ id: derivedId(day, 'freeze', this.o.computer), day, dom: 'game', k: 'day.freeze', at: now, how: decision.how, know, missing: decision.missing, grade })
        this.frozenDays.add(day)
        out.push(day)
      } catch (e) {
        this.freezeRetry.set(day, now + FREEZE_RETRY_MS)
        problems.push(`zamrażanie ${day}: ${String(e)}`)
      }
    }
    return out
  }

  /**
   * The modules during each day from `from` to today before its first change that day (spec „Moduły”; the day's own
   * changes the engine reads from its log) – one pass back from today: the first change on a later day says what it
   * was, before any the setting now.
   */
  private async moduleStates(from: string, today: string): Promise<(day: string) => Record<ModuleId, boolean>> {
    const cur = { ...rdFrom(await this.shared(paths.settings)).general.modules }
    const during = new Map<string, Record<ModuleId, boolean>>()
    for (let d = today; d >= from; d = addDays(d, -1)) {
      during.set(d, { ...cur })
      const firsts = new Set<ModuleId>()
      for (const e of (await this.log.readDay(d)).events.filter(isKnown).sort(compareEvents)) {
        const m = e.k === 'energy.module' ? 'energy' : e.k === 'module.set' && (MODULES as readonly string[]).includes(e.module) ? (e.module as ModuleId) : null
        if (!m || firsts.has(m)) continue
        firsts.add(m)
        const t = e as { on: boolean; was?: boolean }
        cur[m] = t.was ?? !t.on
      }
    }
    return (day) => during.get(day) ?? cur
  }

  /**
   * What the days from `from` to today need for their place in the game besides their logs (spec „Statusy dni i passa”,
   * „Moduły”): the first day with the game, the wizard's day, the game and energy modules during each day.
   */
  private async gameInputs(from: string, today: string): Promise<(day: string) => GameDayInput> {
    const states = await this.moduleStates(from, today)
    const wizardDay = await this.firstLogDay()
    // As the folder holds it: grades are shared, and a read that fails stops them (never „no game”).
    const gameFrom = await this.gameDay(true)
    return (day) => {
      const s = states(day)
      return { from: gameFrom, wizardDay, gameOn: s.game, energyOn: s.energy, projectsOn: s.projects, requestsOn: s.requests }
    }
  }

  /**
   * Days counted as their grades count them, by the helper process (the „Strona B”, the calibration): a frozen day up to
   * the events its freeze names, with the modules its grade keeps; one not frozen yet with all its events and the
   * modules of one pass back from today (made at the first such day – call in the order of dates). Null: no record.
   */
  private summaries(today: string, at: number): (day: string) => Promise<{ summary: DaySummary; frozen: boolean } | null> {
    let states: Promise<(day: string) => Record<ModuleId, boolean>> | null = null
    let graded: Promise<Map<string, GradeLine>> | null = null
    return async (day) => {
      const read = await this.log.readDay(day)
      if (!read.events.length) return null
      const frozen = foldFacts(gridOf(day), read.events).frozen
      graded ??= this.gradeIndex().then((x) => x.lines)
      let modules = storedModules(frozen?.grade) ?? storedModules((await graded).get(day)?.grade)
      if (!modules) {
        const s = (await (states ??= this.moduleStates(day, today)))(day)
        modules = { energy: s.energy, projects: s.projects, requests: s.requests }
      }
      const summary = await (this.o.worker ?? inProcess).run({ kind: 'summary', ctx: await this.dayContext(day, read, at), know: frozen?.know ?? lastEventsOf(read.events), modules })
      return { summary, frozen: frozen != null }
    }
  }

  /**
   * The „Strona B tygodnia” of the week before today's (spec: on Monday, the week that ended): its days and the week
   * before them, each counted as its grade counts it; preliminary until its Sunday is frozen. A day without your
   * presence is not measured.
   */
  async sideB(at = this.clock.now()): Promise<SideB> {
    const today = logicalDayOf(at)
    const week = addDays(weekOf(today), -7)
    const sunday = addDays(week, 6)
    const summaryOf = this.summaries(today, at)
    const measures: DayMeasure[] = []
    let sundayFrozen = false
    for (let d = addDays(week, -7); d <= sunday; d = addDays(d, 1)) {
      const s = await summaryOf(d)
      if (d === sunday) sundayFrozen = s?.frozen ?? false
      if (s?.summary.measure) measures.push(s.summary.measure)
    }
    return sideBOf(week, measures, sundayFrozen)
  }

  /**
   * Every day's close and type (the calibration period): frozen days from their grades, the days the leader will still
   * freeze (from the ritual's first day, within its look back) from their logs; without the ritual – none closed.
   */
  private async calibrationDays(today: string): Promise<CalibrationDay[]> {
    const graded = (await this.gradeIndex()).lines
    const out: CalibrationDay[] = []
    for (const [date, line] of graded) {
      const closed = (CLOSE_HOWS as readonly unknown[]).includes(line.grade.closed) ? (line.grade.closed as CloseHow) : null
      out.push({ date, closed, dayType: typeof line.grade.dayType === 'string' ? line.grade.dayType : 'zwykly' })
    }
    const ritualFrom = await this.ritualDay()
    if (ritualFrom == null) return out
    for (let i = FREEZE_LOOKBACK_DAYS; i >= 0; i--) {
      const date = addDays(today, -i)
      if (date < ritualFrom || graded.has(date)) continue
      const read = await this.log.readDay(date)
      if (!read.events.length) continue
      const f = foldFacts(gridOf(date), read.events)
      out.push({ date, closed: f.closed?.how ?? null, dayType: f.snapshots.at(-1)?.dayType ?? daySnapshotOf(read.events)?.dayType ?? 'zwykly' })
    }
    return out
  }

  /**
   * The calibration now (spec „Kalibracja”): its period and – once there is one – the proposals of its review from the
   * period's qualifying days, each counted as its grade counts it: time for the templates as in force today, costs
   * against the settings of today.
   */
  async calibration(at = this.clock.now()): Promise<{ period: CalibrationPeriod | null; time: TimeProposal[]; costs: CostProposal[] }> {
    const today = logicalDayOf(at)
    const period = calibrationPeriod(await this.calibrationDays(today), today)
    if (!period) return { period, time: [], costs: [] }
    const summaryOf = this.summaries(today, at)
    const samples: TimeSample[] = []
    const evidence: CostEvidence[] = []
    for (const d of period.days) {
      const s = await summaryOf(d)
      if (!s) continue
      samples.push(...s.summary.samples)
      if (s.summary.costs) evidence.push(s.summary.costs)
    }
    const inp = await this.inputs()
    return { period, time: timeProposals(samples, inp.templates, today), costs: costProposals(evidence, settingsOn(inp.changes, today)) }
  }

  /**
   * In the calibration period now (reactions of energy only inform, without variants): counted at most every 10 min and
   * at the change of the day – the period moves by whole days. Files that cannot be read now never stop the bar: the
   * last answer stays (none yet – not in the period) and the count is tried again in a minute.
   */
  async calibrating(at = this.clock.now()): Promise<boolean> {
    const today = logicalDayOf(at)
    const c = this.calibrationNow
    if (c && c.day === today && at - c.at < c.retryMs) return c.on
    try {
      const on = inCalibration(calibrationPeriod(await this.calibrationDays(today), today))
      this.calibrationNow = { day: today, at, on, retryMs: CALIBRATION_RECHECK_MS }
      return on
    } catch {
      const on = c?.on ?? false
      this.calibrationNow = { day: today, at, on, retryMs: 60_000 }
      return on
    }
  }

  /**
   * The first day with a log in the folder: the day of the first computer's wizard (outside the game). Looked for every
   * time – OneDrive may still be bringing older days to a computer that just joined.
   */
  private async firstLogDay(): Promise<string | null> {
    const root = join(this.o.dataDir, 'log')
    const years = (await this.o.fs.list(root)).filter((e) => e.dir && /^\d{4}$/.test(e.name)).map((e) => e.name).sort()
    for (const y of years) {
      const days = (await this.o.fs.list(join(root, y))).filter((e) => e.dir && isIsoDate(e.name)).map((e) => e.name).sort()
      if (days.length) return days[0]!
    }
    return null
  }

  /**
   * The game now (spec „Statusy dni i passa”, „Progresja”): the streak and the notes from the grades of frozen days (the
   * files of grades, derived from the logs), the days the leader will still freeze counted as they would freeze now and
   * today's notes so far – both „w toku”. Null without the game (before the version with its screens, T492) or without
   * freezing (no ritual yet: no day would ever get its grade).
   */
  async gameState(at = this.clock.now()): Promise<GameView | null> {
    const ritualFrom = await this.ritualDay()
    const gameFrom = await this.gameDay()
    if (gameFrom == null || ritualFrom == null) return null
    const today = logicalDayOf(at)
    const graded = await this.gradeIndex()
    // The frozen days of the files of grades: made again only when a file changed (T501).
    const frozenKey = `${graded.sig}|${gameFrom}|${today}`
    if (this.frozenGameDays?.key !== frozenKey) {
      const list: GameDay[] = []
      for (const [date, line] of graded.lines) if (date >= gameFrom && date < today) list.push({ date, ...storedGame(line.grade), frozen: true, regenWays: storedWays(line.grade) })
      this.frozenGameDays = { key: frozenKey, days: list }
    }
    // Not frozen yet: only days the leader will still freeze (from the ritual's first day, within its look back).
    const from = gameFrom > ritualFrom ? gameFrom : ritualFrom
    const later: GameDay[] = []
    const open: Array<{ date: string; read: DayRead }> = []
    for (let i = FREEZE_LOOKBACK_DAYS; i >= 0; i--) {
      const date = addDays(today, -i)
      if (date < from || graded.lines.has(date)) continue
      const read = await this.log.readDay(date)
      const frozen = foldFacts(gridOf(date), read.events).frozen
      if (frozen) later.push({ date, ...storedGame(frozen.grade), frozen: true, regenWays: storedWays(frozen.grade) })
      else if (read.events.length) open.push({ date, read })
    }
    const inputs = open.length ? await this.gameInputs(open[0]!.date, today) : null
    // The records the days are made from, read once (by stats, through the cache): their signatures below.
    if (open.length) await this.inputs()
    const openNow = new Map<string, { key: string; day: GameDay }>()
    for (const { date, read } of open) {
      await this.dayFile(date)
      await this.dayFile(addDays(date, 1))
      const game = inputs!(date)
      // Counted again only when the day's log, its records or the game's inputs changed – today also every minute (its
      // notes so far grow with the time).
      const key = JSON.stringify([date < today ? null : Math.floor(at / 60_000), read.lastByComputer, read.events.length, read.copies, this.contextSig(date), game])
      const was = this.openGameDays.get(date)
      let day = was?.key === key ? was.day : null
      if (!day) {
        const ctx = await this.dayContext(date, read, at)
        if (date < today) {
          const grade = await (this.o.worker ?? inProcess).run({ kind: 'grade', ctx, know: lastEventsOf(read.events), game })
          day = { date, status: grade.game.status, notes: notesSum(grade.game.notes), frozen: false, regenWays: grade.regenWays }
        } else {
          const state = computeDay(ctx)
          const g = dayGame({ ctx, state, energy: computeEnergy(ctx, state, { moduleOn: game.energyOn }), free: isFreeDay(state, ctx.events), game, over: false })
          day = { date, status: null, notes: notesSum(g.notes), frozen: false, regenWays: regenWaysOf(state) }
        }
      }
      openNow.set(date, { key, day })
      later.push(day)
    }
    // Only the days still open stay remembered.
    this.openGameDays = openNow
    // Once unlocked, an item stays (spec): this computer remembers what its room had.
    const kept = this.roomKept()
    const keyOf = (room: Iterable<string>) => JSON.stringify([frozenKey, later, [...room].sort()])
    if (this.gameMemo?.key === keyOf(kept)) return this.gameMemo.view
    const view = gameView([...this.frozenGameDays.days, ...later], today, ROOM_ITEMS, kept)
    const fresh = view.room.unlocked.filter((x) => !kept.has(x.id)).map((x) => x.id)
    if (fresh.length) {
      await mkdir(this.o.stateDir, { recursive: true })
      await writeFileAtomic(join(this.o.stateDir, ROOM_FILE), JSON.stringify({ unlocked: [...kept, ...fresh] }))
    }
    // The items just remembered were unlocked by the notes already: the same view with them kept.
    this.gameMemo = { key: keyOf([...kept, ...fresh]), view }
    return view
  }

  /**
   * What a day's context is made of in the folder – the settings, the templates, the plan of lectures, the day's file and
   * the next one's – by size and time of modification as last read (call after reading them: `inputs`, `dayFile`): a day
   * is counted again only when one of them changed (T501).
   */
  private contextSig(date: string): string {
    const of = (rel: string) => {
      const c = this.cache.get(rel)
      return c ? `${c.size}:${c.mtimeMs}` : '-'
    }
    const dir = (d: string) => (this.listed.get(d) ?? []).map((n) => `${n}=${of(`${d}/${n}`)}`).join(',')
    return [of(paths.settings), dir(ID_COLLECTIONS.template), dir(ID_COLLECTIONS.schedule), of(paths.day(date)), of(paths.day(addDays(date, 1)))].join('|')
  }

  /**
   * The full-screen celebrations not shown on this computer yet (spec „raz”, T510): the memory of shown ones is in its
   * state folder, like the room. Without one (the first time, a computer that just joined) the celebrations of days
   * before yesterday count as shown – no series of old news.
   */
  async celebrationsDue(view: GameView, today: string): Promise<Celebration[]> {
    let shown: string[] | null
    try {
      shown = this.stateList(CELEBRATED_FILE, 'shown')
    } catch {
      // Unreadable now (held, damaged): nothing to celebrate rather than every celebration again.
      return []
    }
    if (shown == null) {
      shown = view.celebrations.filter((c) => c.date < addDays(today, -1)).map((c) => c.key)
      await this.markCelebrated(shown)
    }
    const seen = new Set(shown)
    return view.celebrations.filter((c) => !seen.has(c.key))
  }

  /** Celebrations shown in the main window: never again on this computer. One write at a time; an unreadable file is never written over. */
  markCelebrated(keys: readonly string[]): Promise<void> {
    const run = this.celebratedWrites.then(async () => {
      const shown = this.stateList(CELEBRATED_FILE, 'shown') ?? []
      if (keys.every((k) => shown.includes(k))) return
      await mkdir(this.o.stateDir, { recursive: true })
      await writeFileAtomic(join(this.o.stateDir, CELEBRATED_FILE), JSON.stringify({ shown: [...new Set([...shown, ...keys])] }))
    })
    this.celebratedWrites = run.catch(() => undefined)
    return run
  }

  private celebratedWrites: Promise<void> = Promise.resolve()

  /** The room's items this computer has seen unlocked (its state folder); unreadable now – rejects, never „none” (it would be written over). */
  private roomKept(): Set<string> {
    return new Set(this.stateList(ROOM_FILE, 'unlocked') ?? [])
  }

  /**
   * A list of strings in a JSON file of the state folder (the room, the celebrations shown): null – no such file (the
   * first time); a file that cannot be read or parsed rejects – never taken for an empty list.
   */
  private stateList(file: string, key: string): string[] | null {
    let text: string
    try {
      text = readFileSync(join(this.o.stateDir, file), 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    const v = JSON.parse(text) as Record<string, unknown>
    const list = v?.[key]
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  }

  /**
   * The grades of frozen days from every computer's file of grades (also conflict copies): of two, the better (spec) –
   * with the signature of the files, merged again only when a file changed (T501).
   */
  private async gradeIndex(): Promise<{ sig: string; lines: Map<string, GradeLine> }> {
    const files: Array<{ sig: string; lines: GradeLine[] }> = []
    const root = join(this.o.dataDir, 'grades')
    for (const y of await this.o.fs.list(root)) {
      if (!y.dir) continue
      for (const f of await this.o.fs.list(join(root, y.name))) {
        const rel = `grades/${y.name}/${f.name}`
        const c = classify(rel)
        if (f.dir || c?.kind !== 'grades' || !c.computer) continue
        files.push(await this.gradeFile(rel, c.computer))
      }
    }
    const sig = files.map((f) => f.sig).join('|')
    if (this.gradedMemo?.sig === sig) return this.gradedMemo
    const lines = new Map<string, GradeLine>()
    for (const f of files) {
      for (const line of f.lines) {
        const was = lines.get(line.day)
        if (!was || betterFreeze(line, was)) lines.set(line.day, line)
      }
    }
    this.gradedMemo = { sig, lines }
    return this.gradedMemo
  }

  /** A file of grades through the cache: read again only when its size or time of modification differs. */
  private async gradeFile(rel: string, computer: string): Promise<{ sig: string; lines: GradeLine[] }> {
    const abs = join(this.o.dataDir, rel)
    const st = await this.o.fs.stat(abs)
    if (!st) return { sig: `${rel}:-`, lines: [] }
    const sig = `${rel}:${st.size}:${st.mtimeMs}`
    const old = this.gradeFiles.get(rel)
    if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) return { sig, lines: old.lines }
    const bytes = await this.o.fs.read(abs)
    const lines = (bytes ? bytes.toString('utf8') : '').split('\n').flatMap((t) => {
      const line = t.trim() ? gradeLineFrom(t, computer) : null
      return line ? [line] : []
    })
    this.gradeFiles.set(rel, { size: st.size, mtimeMs: st.mtimeMs, lines })
    return { sig, lines }
  }

  /** A day's files unchanged for a minute since this computer saw them so (spec „nie zmieniają się od 1 min”). */
  private quietFor(day: string, read: DayRead, file: DayFile | null, now: number): boolean {
    const sig = JSON.stringify([read.lastByComputer, read.events.length, file])
    const was = this.dayQuiet.get(day)
    if (!was || was.sig !== sig) {
      this.dayQuiet.set(day, { sig, since: now })
      return false
    }
    return now - was.since >= QUIET_MS
  }

  /**
   * The leader, settled, with rules not older than the newest without a crash among the computers awake (as in the rules
   * of leading: a closed or long-silent computer with newer rules never stops the freezing, spec D163).
   */
  private mayFreeze(settled: boolean, now: number): boolean {
    if (!this.leader.iLead || !settled) return false
    const awake = this.peers.filter((p) => p.presence.state !== 'closed' && now - p.fileSeenAt < SILENT_MS)
    const versions = [{ v: this.rulesVersion, crashed: this.ownVersionCrashed }, ...awake.map((p) => ({ v: p.presence.rulesVersion, crashed: p.crashed }))]
    const sane = versions.filter((x) => !x.crashed)
    return this.rulesVersion >= Math.max(...(sane.length ? sane : versions).map((x) => x.v))
  }

  /** The computers that wrote to the folder in the last 7 days (their logs). */
  private async writerIds(today: string): Promise<Set<string>> {
    const ids = new Set<string>()
    for (let i = 0; i <= WRITERS_DAYS; i++) {
      const r = await this.log.readDay(addDays(today, -i)).catch(() => null)
      for (const c of Object.keys(r?.lastByComputer ?? {})) ids.add(c)
    }
    return ids
  }

  /** The leader's automatic actions of one day up to the gate, and the day's next deadline. */
  private async autoTasks(day: string, read: DayRead, ctx: DayContext, state: DayState, now: number, gate: number): Promise<{ written: number; nextAt: number | null }> {
    const activity = await this.activityFor(day, read, now)
    let written = 0
    for (const e of autoActions({ ctx, state, activity, now, gate: Math.min(gate, now) })) {
      this.append({ ...e, day, dom: 'timer' })
      written++
    }
    return { written, nextAt: nextDeadline(state) }
  }

  /**
   * Input and use of every computer from the day's 04:00 to now: the day before too (an observation or a gap through
   * 04:00 began there) and, for a day that is over (a block running through 04:00), the days after it up to today –
   * gaps and observations after 04:00 are written to the new day's logs.
   */
  private async activityFor(day: string, read: DayRead, now: number): Promise<ReturnType<typeof activityOf>> {
    const events = [...((await this.log.readDay(addDays(day, -1)).catch(() => null))?.events ?? []), ...read.events]
    const today = logicalDayOf(now)
    for (let d = addDays(day, 1); d <= today; d = addDays(d, 1)) events.push(...((await this.log.readDay(d).catch(() => null))?.events ?? []))
    return activityOf(events, dayStart(day), now, this.observing ? this.o.computer : null)
  }

  /**
   * The day a click concerns: the one with a block still running from before 04:00, else today; „Koniec” of a request –
   * the day it runs in (one from before 04:00 keeps its day).
   */
  private async activeDay(now: number, request: string | null = null): Promise<string> {
    const today = logicalDayOf(now)
    const yesterday = addDays(today, -1)
    const y = await this.log.readDay(yesterday).catch(() => null)
    if (request != null) return y && hasOpenRequest(yesterday, y.events, request) ? yesterday : today
    return y && hasRunning(yesterday, y.events) ? yesterday : today
  }

  /** The day as you see it (your queued edits laid over the files): clicks and answers are judged on it. */
  private async ownContext(date: string, read: DayRead, at: number, inp?: Inputs): Promise<DayContext> {
    return dayContextOf(inp ?? (await this.inputs(true)), { date, events: read.events, dayFile: await this.dayFile(date, true), nextFile: await this.dayFile(addDays(date, 1), true) }, this.o.holidays, at)
  }

  /** Writes drafts of the timer to a day's log, each checked as a line of the log first. */
  private async writeTimer(day: string, drafts: readonly TimerDraft[]): Promise<void> {
    const now = this.clock.now()
    const ready: EventDraft[] = []
    for (const d of drafts) {
      const draft: EventDraft = { ...d, day, dom: 'timer' }
      const check = parseEvent(JSON.stringify({ ...draft, id: 'x', c: this.o.computer, n: 0, t: now, l: now, v: this.rulesVersion }))
      if (!check.ok || !isKnown(check.event)) throw new Error(`zdarzenie ${d.k}: ${check.ok ? 'nieznane' : check.why}`)
      ready.push(draft)
    }
    for (const d of ready) this.append(d)
    await this.log.flush()
  }

  private clicks: Promise<unknown> = Promise.resolve()

  /**
   * A click of the timer (spec „Akcje widgetu wykonuje proces główny i zapisuje je jako zdarzenia w logu”): judged on the
   * day as it is now – a second click of the same action finds it done and does nothing (no two entries) – one at a time.
   */
  timerClick(click: TimerClick): Promise<ActionResult> {
    const run = async (): Promise<ActionResult> => {
      const now = this.clock.now()
      const day = click.day && isIsoDate(click.day) ? click.day : await this.activeDay(now, click.a === 'requestEnd' ? click.request : null)
      const read = await this.log.readDay(day)
      if (!read.complete) return { ok: false, why: 'nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę', confirm: null }
      const ctx = await this.ownContext(day, read, now)
      const { day: _d, ...act } = click
      void _d
      const state = computeDay(ctx)
      // Requests („zrobione teraz”, urgent, after the fact, „Koniec”) and the rest of the timer.
      const r = act.a === 'requestNow' || act.a === 'requestEnd' || act.a === 'requestAfter' ? requestAction(state, act as RequestAction, now) : timerAction(ctx, state, act as TimerAction, now)
      if (r.ok && r.events.length) await this.writeTimer(day, r.events)
      return r
    }
    const p = this.clicks.then(run, run)
    this.clicks = p.catch(() => undefined)
    return p
  }

  /** The questions open now on a day, as this computer sees them. */
  async questions(day: string, at = this.clock.now()): Promise<Question[]> {
    const read = await this.log.readDay(day)
    const ctx = await this.ownContext(day, read, at)
    const state = computeDay(ctx)
    return questionsOf({ ctx, state, activity: await this.activityFor(day, read, at), now: at })
  }

  /**
   * Your answer to a question (`id` names its day). An answer that is an action of the timer („Dalej”, „Przedłuż”,
   * „Koniec pracy”, „Pracuję”) goes as that click; an answer on one computer closes the question on every one.
   */
  answer(id: string, answer: string, value: number | null = null): Promise<ActionResult> {
    const run = async (): Promise<ActionResult> => {
      const day = id.split(':')[1] ?? ''
      if (!isIsoDate(day)) return { ok: false, why: 'pytanie bez dnia', confirm: null }
      const now = this.clock.now()
      const q = (await this.questions(day, now)).find((x) => x.id === id)
      if (!q) return { ok: false, why: 'to pytanie już nie czeka', confirm: null }
      const read = await this.log.readDay(day)
      const ctx = await this.ownContext(day, read, now)
      const state = computeDay(ctx)
      const drafts = answerEvents(state, q, answer, now, value)
      if (drafts) {
        await this.writeTimer(day, drafts)
        return { ok: true, events: drafts, confirm: null }
      }
      const act: TimerAction | null =
        answer === 'next' ? { a: 'next', confirm: value === 1 } : answer === 'extend' ? { a: 'extend', minutes: value ?? 15, confirm: false } : answer === 'workEnd' ? { a: 'workEnd' } : answer === 'working' ? { a: 'startNew', block: `${this.o.computer}-${now.toString(36)}`, categoryId: 'inne', durationMin: 30, confirm: value === 1 } : null
      if (!act) return { ok: false, why: `nieznana odpowiedź ${answer}`, confirm: null }
      const r = timerAction(ctx, state, act, now)
      if (r.ok && r.events.length) await this.writeTimer(day, [...r.events, ...(q.kind === 'workEnd' ? [{ k: 'question.answer', at: now, question: q.id, answer, value: null }] : [])])
      return r
    }
    const p = this.clicks.then(run, run)
    this.clicks = p.catch(() => undefined)
    return p
  }

  /** Questions seen on this computer (spec D231): each written once, to its day's log. */
  async markSeen(ids: readonly string[], how: 'panel' | 'main' | 'notification' | 'bar'): Promise<number> {
    const now = this.clock.now()
    let n = 0
    const byDay = new Map<string, string[]>()
    for (const id of ids) {
      const day = id.split(':')[1] ?? ''
      if (isIsoDate(day)) byDay.set(day, [...(byDay.get(day) ?? []), id])
    }
    for (const [day, list] of byDay) {
      const read = await this.log.readDay(day)
      const seen = new Set(read.events.filter((e) => isKnown(e) && e.k === 'question.seen').map((e) => (e as { question: string }).question))
      const fresh = list.filter((id) => !seen.has(id))
      if (!fresh.length) continue
      await this.writeTimer(day, fresh.map((question) => ({ k: 'question.seen', at: now, question, how })))
      n += fresh.length
    }
    return n
  }

  /** The version running here has a crash recorded (spec D163: such a version never counts as the newest). */
  get ownVersionCrashed(): boolean {
    const own = this.presence.own
    return (own.versions.find((v) => v.version === own.appVersion)?.crashes ?? 0) > 0
  }

  /** This computer's versions with their first and last runs and crashes (versions.json), in its presence. */
  setVersions(versions: Presence['versions']): void {
    this.presence.update({ versions: versions.slice(0, 10) })
  }

  /** „Instaluję wersję X” in this computer's presence (spec D162), null: nothing. */
  setInstalling(version: string | null): void {
    this.presence.update({ installing: version })
  }

  /** The night's quiet now (from the effective bedtime of the logical day to its wake), by today's day. */
  async nightQuiet(at = this.clock.now()): Promise<boolean> {
    const day = logicalDayOf(at)
    const s = await this.dayState(day, undefined, at)
    return at >= atOf(s.grid, s.bedtime.effective) || at < atOf(s.grid, s.wake)
  }

  /** A block runs now (today's, or yesterday's through 04:00). */
  async anyBlockRunning(at = this.clock.now()): Promise<boolean> {
    const today = logicalDayOf(at)
    for (const day of [addDays(today, -1), today]) {
      const read = await this.log.readDay(day)
      if (hasRunning(day, read.events)) {
        const t = timerNow(await this.dayState(day, read, at))
        if (t.fg || t.bg.length) return true
      }
    }
    return false
  }

  /** Events of the timer of a kind this version does not know, today (spec: install without the 24 h). */
  async unknownTimerEvents(at = this.clock.now()): Promise<boolean> {
    const read = await this.log.readDay(logicalDayOf(at))
    return read.events.some((e) => !isKnown(e) && e.dom === 'timer')
  }

  /** What this computer must hold against sleep now (today's blocks and yesterday's still running). */
  async powerNeed(lastInput: number | null, at = this.clock.now()): Promise<PowerNeed> {
    const today = logicalDayOf(at)
    let need: PowerNeed = NO_POWER
    for (const day of [addDays(today, -1), today]) {
      const read = await this.log.readDay(day)
      if (day !== today && !hasRunning(day, read.events)) continue
      const ctx = await this.dayContext(day, read, at)
      const n = powerNeedOf(ctx, computeDay(ctx), { computer: this.o.computer, leads: this.leader.iLead, lastPresence: this.presence.own.lastPresence, lastInput, now: at })
      need = { system: need.system || n.system, display: need.display || n.display, reason: need.reason ?? n.reason }
    }
    return need
  }

  /**
   * What the widget is made from now (spec „Widget”): the day of the running block (a block through 04:00 keeps its day)
   * as this computer sees it, its energy, the activity of every computer and rd.json (the names, the care settings).
   */
  async widgetModel(at = this.clock.now()): Promise<{
    ctx: DayContext
    state: DayState
    energy: EnergyState
    activity: ReturnType<typeof activityOf>
    rd: ReturnType<typeof rdFrom>
    people: Array<{ id: string; name: string }>
    carried: RunningRequest | null
  }> {
    const day = await this.activeDay(at)
    const read = await this.log.readDay(day)
    const ctx = await this.ownContext(day, read, at)
    const state = computeDay(ctx)
    const rd = rdFrom(await this.recordView(paths.settings))
    const calibration = await this.calibrating(at)
    const today = logicalDayOf(at)
    return {
      ctx,
      state,
      energy: computeEnergy(ctx, state, { moduleOn: rd.general.modules.energy, calibration }),
      activity: await this.activityFor(day, read, at),
      rd,
      // Today's log only for ranking the people: one not readable now never stops the bar.
      people: await this.topPeople(rd, today, day === today ? read.events : ((await this.log.readDay(today).catch(() => null))?.events ?? []), at),
      carried: day === today ? await this.carriedRequest(addDays(today, -1), rd) : null
    }
  }

  /**
   * „Prośba ▸” (D311): the people asked most often in the last 28 days (the starts of requests in the logs), never an
   * archived one; with less history the dictionary's order fills up to 3. The days before today are counted together,
   * again every 15 min (logs of other computers come late) – and not kept while one of them cannot be read in full.
   */
  private async topPeople(rd: ReturnType<typeof rdFrom>, today: string, todayEvents: readonly AnyEvent[], at: number): Promise<Array<{ id: string; name: string }>> {
    const count = (events: readonly AnyEvent[], into: Map<string, number>) => {
      for (const e of events) {
        const p = e.k === 'request.start' ? (e as { person?: unknown }).person : null
        if (typeof p === 'string') into.set(p, (into.get(p) ?? 0) + 1)
      }
    }
    let before = this.peopleCounts?.day === today && at - this.peopleCounts.at < PEOPLE_RECOUNT_MS ? this.peopleCounts.before : null
    if (!before) {
      const reads = await Promise.all(Array.from({ length: PEOPLE_DAYS - 1 }, (_, i) => this.log.readDay(addDays(today, -(i + 1))).catch(() => null)))
      before = new Map<string, number>()
      for (const r of reads) count(r?.events ?? [], before)
      this.peopleCounts = reads.every((r) => r?.complete) ? { day: today, at, before } : null
    }
    const counts = new Map(before)
    count(todayEvents, counts)
    const active = rd.people.filter((p) => !p.archived)
    const order = new Map(active.map((p, i) => [p.id, i]))
    return [...active]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || order.get(a.id)! - order.get(b.id)!)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name }))
  }

  /** A request of the day before still running after 04:00 (D312): the bar of today shows it, its „Koniec” goes to its day. */
  private async carriedRequest(day: string, rd: ReturnType<typeof rdFrom>): Promise<RunningRequest | null> {
    const read = await this.log.readDay(day).catch(() => null)
    if (!read?.events.some((e) => e.k === 'request.start')) return null
    const grid = gridOf(day)
    const r = foldFacts(grid, read.events)
      .requests.filter(isRunningRequest)
      .sort((a, b) => a.from - b.from)
      .at(-1)
    return r ? runningRequestOf(r, grid, (id) => personName(rd, id)) : null
  }

  /**
   * A signal or the relative assessment from the bar (spec „Sygnały w ciągu dnia”): an anchor with the exact state before
   * it as this computer knows it now – later corrections of earlier times never change the state after it.
   */
  async energySignal(s: { signal: Signal } | { pool: Pool; delta: -10 | 0 | 10 }): Promise<void> {
    const at = this.clock.now()
    const day = logicalDayOf(at)
    const read = await this.log.readDay(day)
    const ctx = await this.ownContext(day, read, at)
    const state = computeDay(ctx)
    const before = computeEnergy(ctx, state).now
    const draft: EventDraft = 'signal' in s ? { day, dom: 'energy', k: 'energy.signal', at, signal: s.signal, before } : { day, dom: 'energy', k: 'energy.relative', at, pool: s.pool, delta: s.delta, before }
    const check = parseEvent(JSON.stringify({ ...draft, id: 'x', c: this.o.computer, n: 0, t: at, l: at, v: this.rulesVersion }))
    if (!check.ok) throw new Error(`sygnał: ${check.why}`)
    this.append(draft)
    await this.log.flush()
  }

  /** A Windows notification the leader showed (its stable id in the day's log: shown once, also after a restart). */
  markNotice(day: string, notice: string, at = this.clock.now()): void {
    this.append({ day, dom: 'meta', k: 'notice.shown', at, notice })
  }

  /** The timer of a day as this computer sees it now (for the bar of the main process and the tests). */
  async timer(day: string, at = this.clock.now()): Promise<ReturnType<typeof timerNow>> {
    const read = await this.log.readDay(day)
    return timerNow(computeDay(await this.ownContext(day, read, at)))
  }

  /**
   * A day's closing ritual as this computer sees it (spec „Rytuał zamknięcia”): its rows, what each ✓ changes, what
   * „Jak zapisano” changes, and how the day was closed – counted by the helper process (many counts of the day, T190).
   */
  async ritual(day: string, at = this.clock.now()): Promise<RitualView> {
    const read = await this.log.readDay(day)
    const ctx = await this.ownContext(day, read, at)
    // Counted again only when the day's log, its records or your queued edits changed – today also every minute (the
    // evening's effects count with the forecast to the bedtime).
    const key = JSON.stringify([day < logicalDayOf(at) ? null : Math.floor(at / 60_000), read.lastByComputer, read.events.length, read.copies, this.contextSig(day), this.queue.pending.length])
    const was = this.ritualMemo.get(day)
    if (was?.key === key) return was.view
    const view = await (this.o.worker ?? inProcess).run({ kind: 'ritual', ctx, at })
    this.ritualMemo.set(day, { key, view })
    for (const d of this.ritualMemo.keys()) if (d < addDays(logicalDayOf(at), -RITUAL_MEMO_DAYS)) this.ritualMemo.delete(d)
    return view
  }

  /** Your answer to a row of a day's ritual: judged on the day as it is now and written to its log, one at a time. */
  ritualAnswer(day: string, rowId: string, choice: string, value: RitualValue = null, item: string | null = null): Promise<ActionResult> {
    return this.dayAction(day, (state, now, ctx) => {
      const row = ritualRows(state, ritualActivity(ctx, state)).find((r) => r.id === rowId)
      if (!row) return 'tego wiersza już nie ma'
      return ritualAnswer(state, row, choice, now, value, item) ?? refusalOf(choice)
    })
  }

  /** Closing a day: the evening ritual, or the morning's „Jak zapisano”, „Wolne”, „Nie pamiętam” (spec). */
  closeDay(day: string, how: CloseHow): Promise<ActionResult> {
    return this.dayAction(day, (state, now) => (day > logicalDayOf(now) ? 'ten dzień jeszcze się nie zaczął' : (closeRefusal(state, how) ?? closeEvents(state, how, now))))
  }

  /**
   * The CSV export (spec „Eksport CSV”, D300): the days from `from` to `to` as this computer sees them (with your queued
   * edits; a day nobody worked has no rows), three files to `dir`, counted and written by the helper process.
   */
  async exportCsv(from: string, to: string, dir: string, at = this.clock.now()): Promise<string[]> {
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new Error('zły zakres dat')
    const rd = rdFrom(await this.recordView(paths.settings))
    const routines = (await this.collection('routine')).map(routineFrom).filter((r): r is Routine => !!r)
    const requests = (await this.collection('request')).map(requestFrom).filter((r): r is RequestRecord => !!r)
    const inp = await this.inputs(true)
    const days: CsvDay[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const read = await this.log.readDay(d)
      if (!read.complete) throw new Error(`log dnia ${d} jest teraz nieczytelny – spróbuj za chwilę`)
      if (!read.events.length) continue
      const ctx = await this.ownContext(d, read, at, inp)
      days.push({ ctx, names: { rd, settings: ctx.snapshot.settings, routines, requests } })
    }
    return (this.o.worker ?? inProcess).run({ kind: 'csv', days, dir })
  }

  /** The days the morning shows to close (spec); `ritualFrom` – the first day with the ritual (null: none yet, T482). */
  async unclosedDays(ritualFrom: string | null, at = this.clock.now()): Promise<Array<{ date: string; presence: boolean }>> {
    if (ritualFrom == null) return []
    const today = logicalDayOf(at)
    const days: DayLog[] = []
    for (let i = 1; i <= Math.ceil(CLOSE_WINDOW_H / 24) + 1; i++) {
      const date = addDays(today, -i)
      // A day whose logs cannot all be read now is not taken for closed nor for open: it waits for the next look.
      const read = await this.log.readDay(date).catch(() => null)
      if (read?.complete) days.push({ date, events: read.events })
    }
    return unclosedDays(days, today, at, ritualFrom)
  }

  /** An action on a day's log judged on the day as you see it now (a text: refused, why), one at a time like clicks. */
  private dayAction(day: string, act: (state: DayState, now: number, ctx: DayContext) => TimerDraft[] | string): Promise<ActionResult> {
    const run = async (): Promise<ActionResult> => {
      if (!isIsoDate(day)) return { ok: false, why: 'zły dzień', confirm: null }
      const now = this.clock.now()
      const read = await this.log.readDay(day)
      if (!read.complete) return { ok: false, why: 'nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę', confirm: null }
      const ctx = await this.ownContext(day, read, now)
      const r = act(computeDay(ctx), now, ctx)
      if (typeof r === 'string') return { ok: false, why: r, confirm: null }
      if (r.length) await this.writeTimer(day, r)
      return { ok: true, events: r, confirm: null }
    }
    const p = this.clicks.then(run, run)
    this.clicks = p.catch(() => undefined)
    return p
  }

  /**
   * OneDrive's conflict copies of the records (spec „Kopie konfliktowe OneDrive są porównywane po treści”): the same
   * content goes, fields only one side has join, both versions go to the history; fields different on both sides stay
   * a question (`copyConflicts`) until you answer it. Every folder of records, the days of this year and the next.
   */
  private async joinCopies(day: string): Promise<void> {
    const year = Number(day.slice(0, 4))
    // Last year's days too (a copy of 31.12 seen on 1.01).
    const dirs = ['', ID_COLLECTIONS.template, ID_COLLECTIONS.schedule, ID_COLLECTIONS.request, ID_COLLECTIONS.routine, `days/${year - 1}`, `days/${year}`, `days/${year + 1}`]
    const scanned = new Set(dirs)
    const seen = new Set<string>()
    for (const dir of dirs) {
      let copies: Array<{ copy: string; canonical: string }>
      try {
        copies = await this.records.conflictCopies(dir)
      } catch {
        // A folder that cannot be listed now: its questions stay as they were.
        for (const k of this.copyConflicts.keys()) if ((k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '') === dir) seen.add(k)
        continue
      }
      for (const c of copies) {
        seen.add(c.copy)
        const r = await this.records.joinCopy(c.copy, c.canonical)
        if (r.joined) this.copyConflicts.delete(c.copy)
        else if (r.conflicts.length) this.copyConflicts.set(c.copy, { canonical: c.canonical, conflicts: r.conflicts })
      }
    }
    // A question goes only when its folder was looked at and the copy is not there any more (joined, removed).
    const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
    for (const k of [...this.copyConflicts.keys()]) if (scanned.has(dirOf(k)) && !seen.has(k)) this.copyConflicts.delete(k)
  }

  /** Your answer to a conflict copy: „mine” – the file's values, „theirs” – the copy's; then the copy goes. */
  async resolveCopy(copyRel: string, choice: 'mine' | 'theirs'): Promise<void> {
    const q = this.copyConflicts.get(copyRel)
    if (!q) return
    const r = await this.records.joinCopy(copyRel, q.canonical, () => choice)
    if (r.joined) this.copyConflicts.delete(copyRel)
  }

  /** The computers that wrote a presence, this one first (names as each computer calls itself). */
  get computers(): Array<{ id: string; name: string }> {
    const out = [{ id: this.o.computer, name: this.o.computerName }]
    for (const p of this.peers) if (p.presence.computer !== this.o.computer) out.push({ id: p.presence.computer, name: p.presence.name || p.presence.computer })
    return out
  }

  /**
   * Actions of the main window as events of a day's log (spec: facts you set live only in the log): only the kinds a
   * window may write, each checked as a line of the log before it is written; an action without its instant gets now. A
   * snapshot „od dziś” or of a change of type takes the settings in force at its instant (with your queued changes).
   */
  async userEvents(drafts: ReadonlyArray<Record<string, unknown>>): Promise<void> {
    const now = this.clock.now()
    const ready: EventDraft[] = []
    for (const d of drafts) {
      const k = String(d.k ?? '')
      const dom = USER_EVENTS[k]
      if (!dom) throw new Error(`zdarzenie ${k} nie pochodzi z okna`)
      if (typeof d.day !== 'string' || !isIsoDate(d.day)) throw new Error(`zdarzenie ${k}: dzień`)
      const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : now
      const draft: EventDraft = { ...d, day: d.day, dom, k, at }
      delete draft.id
      if (k === 'day.snapshot') {
        if (!isDayTypeId(d.dayType)) throw new Error('zdarzenie day.snapshot: typ dnia')
        // Your own action: the settings with your own queued change (a change „od dziś” just made, also offline).
        draft.settings = settingsOn((await this.inputs(true)).changes, d.day, at)
      }
      const check = parseEvent(JSON.stringify({ ...draft, id: 'x', c: this.o.computer, n: 0, t: now, l: now, v: this.rulesVersion }))
      if (!check.ok || !isKnown(check.event)) throw new Error(`zdarzenie ${k}: ${check.ok ? 'nieznane' : check.why}`)
      ready.push(draft)
    }
    for (const d of ready) this.append(d)
    await this.log.flush()
  }

  /** The events of the given kinds of every day of a month ('RRRR-MM'), as this computer sees them now. */
  async monthEvents(month: string, kinds: readonly string[]): Promise<AnyEvent[]> {
    const out: AnyEvent[] = []
    const want = new Set(kinds)
    for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
      const read = await this.log.readDay(d).catch(() => null)
      if (read) for (const e of read.events) if (want.has(e.k)) out.push(e)
    }
    return out
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
