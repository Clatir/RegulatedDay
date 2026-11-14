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
import type { ComputerRow, SearchCorpus } from '@shared/api'
import { EventClock, type ClockSources } from '@shared/data/clock'
import { sameContentAs, setAt, type MergeConflict } from '@shared/data/merge'
import { classify, paths, ID_COLLECTIONS } from '@shared/data/paths'
import { readLogText } from '@shared/data/logText'
import { activityOf, type Activity } from '@shared/engine/activity'
import { answerEvents, autoActions, closedSince, fixedStartPausesClosed, nextDeadline, questionsOf, runFromOf, shutdownActions, type AutoEvent, type Question } from '@shared/engine/auto'
import { simEvents } from '@shared/engine/sim'
import { createDay, nextWakeForBedtime, type HolidayLookup } from '@shared/engine/createDay'
import { dayContextOf } from '@shared/engine/context'
import { computeDay, newSegments, type DayContext, type DayState } from '@shared/engine/day'
import { NO_POWER, powerNeedOf, type PowerNeed } from '@shared/engine/power'
import { requestAction, type RequestAction } from '@shared/engine/requests'
import { timerAction, timerNow, type ActionResult, type TimerAction, type TimerDraft } from '@shared/engine/timer'
import { dayStart, weekStart } from '@shared/time/day'
import { goalsDates, goalsProgress, type GoalsView } from '@shared/engine/goals'
import { daysViewOf, unknownDay, weekDates, weekViewOf, whenOf, type DaysView, type HorizonDay, type WeekView } from '@shared/engine/week'
import { monthDates, monthDayOf, type MonthView } from '@shared/engine/calendarViews'
import { goalsEdits, NO_GOALS, previousMonth, type GoalsPatch } from '@shared/model/goals'
import { computeEnergy, newDescents, type EnergyState } from '@shared/engine/energy'
import { betterFreeze, foldFacts, isRunning, isRunningRequest, type BlockFact, type DayFacts } from '@shared/engine/facts'
import { correctionEnd, countedEvents, freezeDecision, gradeLineFrom, isFreeDay, lastEventsOf, openedAtOf, WRITERS_DAYS, type GradeLine } from '@shared/engine/freeze'
import { dayGame, notesSum, storedGame, weekOf, type GameDay, type GameDayInput } from '@shared/engine/game'
import { gameView, regenWaysOf, ROOM_ITEMS, storedWays, type Celebration, type GameView } from '@shared/engine/progress'
import { sideBOf, storedModules, type DayMeasure, type MeasureModules, type SideB } from '@shared/engine/sideB'
import type { DaySummary } from '@shared/engine/daySummary'
import { periodFrom, statsOf, type DayStats, type StatsPeriod, type StatsResult } from '@shared/engine/stats'
import { calibrationPeriod, costProposals, inCalibration, timeProposals, type CalibrationDay, type CalibrationPeriod, type CostEvidence, type CostProposal, type FeltCounts, type TimeProposal, type TimeSample } from '@shared/engine/calibration'

import { inProcess, type Worker } from '../worker/host'
import { casesFrom, casesRitual, dayFactsOf, taskQuestions, type CasesRitual } from '@shared/engine/cases'
import { CLOSE_WINDOW_H, closeEvents, closeRefusal, closeUndoEvents, ritualActivity, ritualAnswer, ritualRows, unclosedDays, type DayLog, type RitualValue, type RitualView } from '@shared/engine/ritual'
import { atOf, gridOf, idxOf } from '@shared/engine/grid'
import { derivedId } from '@shared/model/ids'
import { CLOSE_HOWS, compareEvents, daySnapshotOf, isKnown, parseEvent, RULES_VERSION, type AnyEvent, type CloseHow, type Domain, type FeltCost, type Signal } from '@shared/model/events'
import { placeOf, type Pool } from '@shared/model/categories'
import { dayFileFrom, lectureFrom, templateFrom, type DayFile, type LectureSeries, type PlanBlock, type Template } from '@shared/model/plan'
import { MODULES, personName, RD_SCHEMA, rdFrom, type ModuleId, type WriteOnceField } from '@shared/model/rd'
import { runningRequestOf } from '@shared/engineView'
import type { RunningRequest } from '@shared/widget'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { blockName, type Names } from '@shared/blockName'
import { routineFrom, type Routine } from '@shared/model/routines'
import { countDatesToRead, ruleDates, seriesFrom, seriesLast, seriesPlans, typeOfDays, type Series, type SeriesPlan } from '@shared/model/series'
import type { CsvDay } from '@shared/engine/csv'
import { changeOrder, isDayTypeId, settingsOn, type DayTypeId, type SettingsChange } from '@shared/model/settings'
import { decideLeader, minuteGate, SILENT_MS, soundComputer, type LeaderDecision, type Peer } from '@shared/sync/leader'
import type { SyncState } from '@shared/sync/syncLines'
import type { Presence } from '@shared/sync/presence'
import { Settle, type SettleReason } from '@shared/sync/settle'
import { logicalDayOf } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import { EditQueue, type Outcome, type QueuedEdit } from './editQueue'
import { EventLog, type DayRead, type EventDraft } from './eventLog'
import { isRootGone, rootGuarded, type DataFs } from './fsio'
import { RecordHistory } from './history'
import { PresenceStore, stillForgotten } from './presenceStore'
import { RecordStore } from './records'
import { nodeAttachmentFiles, type AttachmentFiles } from './attachments'
import { attachmentFrom, purgeDue } from '@shared/model/attachment'
import { mapLimit } from '../datastore/concurrency'

export const OBSERVE_EVERY_MS = 5 * 60_000
/** The leader looks for attachments to delete this often (T806). */
export const ATTACHMENT_SWEEP_MS = 60 * 60_000

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
  'cost.felt': 'energy',
  // Time freed in today's plan (D375): the timer's – an older version, whose bar would not ask about the gap, installs at once.
  'plan.freed': 'timer'
}
/** The journal keeps own events of this many days back (spec: until the day's freeze plus 7 days – freezing is E6). */
export const JOURNAL_KEEP_DAYS = 14
const COMPACT_EVERY_MS = 60 * 60_000
/** Conflict copies of the records are looked for this often (and at the first check). */
const COPY_SCAN_MS = 60_000
/** Own changes waiting this long with the folder there are said too (A3-07 review). */
export const UNSYNCED_SAY_MS = 5 * 60_000
/** Files of a folder of records read side by side (A3-08). */
const DIR_CONCURRENCY = 16
/**
 * A record of a list for showing (the requests of years, routines, templates in the window) looked at this recently is
 * taken from memory without looking at its file again – one look at thousands of files per change was over 0.1 s on a
 * plain disk (spec „Skala”). This computer's own writes are known at once; another computer's change shows at most this
 * much later. What a day is made from is always looked at.
 */
export const LIST_TRUST_MS = 60_000
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
/**
 * What the curve of a counted day of the horizon was counted with (T966): none (null), its own module (a day gone by – T950),
 * or the module now, on or off (today, a day to come).
 */
type CurveKey = null | 'own' | 'on' | 'off'

/**
 * The days of the horizon remembered at most (the ones asked last): a month of goals, the month of „Kalendarz” (D418), the
 * week shown, „3 dni” and „Agenda” (D417), with room – 14 weeks (T907; before SNT1: 70).
 */
const HORIZON_MEMO_DAYS = 98

/** Why an answer of the ritual was refused, in words (never the choice's id). */
function refusalOf(choice: string): string {
  if (choice === 'endedAt' || choice === 'workedUntil' || choice === 'projectUntil' || choice === 'work' || choice === 'project') return 'ta godzina jest poza czasem bloku albo po teraz'
  if (choice === 'notRest') return 'odcinek: tylko wieczór od końca pracy albo czas „Odcinam się”, a „od” przed „do”'
  if (choice === 'person') return 'wybierz osobę z listy'
  return 'tego wyboru nie ma w tym wierszu'
}

/** A new record as the fields of its entry make it (`create`: every field from nothing, as the queue lays it). */
function newRecordOf(edits: QueuedEdit['edits']): unknown {
  let value: unknown = {}
  for (const f of edits) value = setAt(value, f.path, f.value)
  return value
}

/** The day as the bar shows it (`DataFolder.barDay`, D345): its activity (null – not counted), the ends laid over it. */
interface BarDay {
  ctx: DayContext
  state: DayState
  activity: Activity | null
  laid: AutoEvent[]
}

/** `BarDay` with the activity always counted. */
type BarDayWith = BarDay & { activity: Activity }

/**
 * A block of the day runs now (started, not ended, not paused – „Cofnij” counted): one running through 04:00 keeps its
 * day (spec „Timer”); a block left paused is no reason to stay on the day before.
 */
function hasRunning(day: string, events: readonly AnyEvent[]): boolean {
  return runningFacts(day, events).length > 0
}

/** The blocks of the day running now by its log (`hasRunning`). */
function runningFacts(day: string, events: readonly AnyEvent[]): BlockFact[] {
  if (!events.some((e) => e.k === 'block.start')) return []
  return [...foldFacts(gridOf(day), events).blocks.values()].filter((f) => f.endedAt == null && isRunning(f))
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

/**
 * A record of a collection kept one file per id (a request, routine, template, plan of lectures): a new one has an id
 * made at that moment, so no other computer has its file – it may wait for a data folder that is away (E8b.1).
 */
function isIdRecord(rel: string): boolean {
  const c = classify(rel)
  return !!c && !c.conflict && Object.hasOwn(ID_COLLECTIONS, c.kind)
}

/** A record the day is made from that cannot be read now (or is broken) and was never read before: unknown. */
export class UnknownRecordError extends Error {
  constructor(
    readonly rel: string,
    why: string,
    /** The file is broken (not only unreadable now): it will not be read as it is until restored. */
    readonly broken = false
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
  /**
   * The OneDrive process runs by its last answer (spec: the unsettled state counts „od chwili, gdy działa proces
   * OneDrive” – the raw answer, not the 5 min of `oneDriveRunning`); default: as `oneDriveRunning`.
   */
  oneDriveProcess?: () => boolean
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
  /** The app's log (main.log): what the folder leaves out and why – a day the statistics could not count, never the content of a record. */
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
  /** The files of attachments (D410; tests: a faulty one) – the leader deletes them 30 days after a removal (T806). */
  attachmentFiles?: AttachmentFiles
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
/** `probe`: only judged – its cost or refusal – never written (a step of „Przedłuż” before its second click). */
export type TimerClick = (TimerAction | RequestAction) & { day?: string; probe?: boolean }

/** An action on a day's log (`dayAction`); done – with the ids its events got in the log, in their order (D468). */
export type DayActionResult = Exclude<ActionResult, { ok: true }> | (Extract<ActionResult, { ok: true }> & { written: string[] })

/** The records the day is made from, read through a cache checked by size and time of modification. */
export interface Inputs {
  changes: SettingsChange[]
  templates: Template[]
  lectures: LectureSeries[]
  /** The series with their last days (D381, `seriesPlans`). */
  series: SeriesPlan[]
  /** The own types of the days the counts of the series read (date → type; a day without one is not here). */
  seriesDays: Record<string, DayTypeId>
}

/** The rounds of reading the days a count of a series reads (a day read may move its end – `countDatesToRead`). */
const SERIES_READ_ROUNDS = 20
/** How long the types of a series ended before yesterday stand without reading its days again (a file changed in place elsewhere). */
const SETTLED_TRUST_MS = 10 * 60_000

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
  /** The other computers' presences were scanned once (`check`): before that the leader's gate is not known (D345). */
  private peersScanned = false
  private lastObserve = 0
  /** The last days of the series as the last `inputs` counted them (a day counted again only when they change – `contextSig`). */
  private seriesSig = ''
  /** The types of days the counts of the series read, by the view (`own`) – for `LIST_TRUST_MS` (`seriesOf`, T717). */
  private readonly seriesMemo = new Map<boolean, { key: string; at: number; days: Record<string, DayTypeId> }>()
  /** Writes of this computer of what the counts read (days, series, settings): a memory of counts before them is stale. */
  private seriesWrites = 0
  /** Series that ended before yesterday, by view and content: the types of their days as read then (`settledTypes`). */
  private readonly seriesSettled = new Map<string, { types: Record<string, DayTypeId | null>; writes: number; queue: string; listing: string; at: number }>()
  /** The data folder's root was gone at the last check (it is unsettled again when it comes back). */
  private rootGone = false

  /** The data folder is not there now (the leader does nothing of its own meanwhile – the bar's notifications neither). */
  get unavailable(): boolean {
    return this.rootGone
  }
  private readonly firstPresence = new Set<string>()
  private readonly cache = new Map<string, { size: number; mtimeMs: number; value: unknown }>()
  /** When a cached record was last looked at on the disk (the monotonic clock) – for the lists for showing. */
  private readonly lookedAt = new Map<string, number>()
  /**
   * Records this run looked at and found not there, none of its own writes since (`written`): with the data folder away
   * they are still not there for the window (a new file of such a day waits in the queue), the others are unknown.
   */
  private readonly absent = new Set<string>()
  private lastSeenPeers = new Map<string, number>()
  /** Computers seen with a fresh presence in this run: one that stops refreshing it is „Brak zmian z … od …” (A8-07). */
  private readonly freshSeen = new Set<string>()
  /** The last check saw an event of another computer more than 24 h ahead (A8-02). */
  private dayAhead = false
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
  /** The statistics of each frozen day, counted again only when what it is made of changed (D358). */
  private readonly statsMemo = new Map<string, { key: string; stats: DayStats }>()
  /** The counts of statistics in progress, by period (the same period asked again shares it). */
  private readonly statsRuns = new Map<StatsPeriod, Promise<StatsResult>>()
  /**
   * The days of the horizon (the week, the month's goals – D356, T553), each counted again only on a change of what it is
   * made of; the ones asked last stay (a hit goes to the end). Days being counted now: one count of a day for every ask.
   * `curve` – what its curve was counted with (`CurveKey`; null: none counted – T914, T966).
   */
  private readonly horizonMemo = new Map<string, { key: string; day: HorizonDay; seq: number; curve: CurveKey }>()
  private readonly horizonRuns = new Map<string, { key: string; curve: CurveKey; run: Promise<HorizonDay>; seq: number }>()
  /** The counts of days of the horizon begun so far: a later one's result is never written over by an earlier one's. */
  private horizonSeq = 0
  /** Changes of the goals one at a time, each made from rd.json as it is in its turn. */
  private goalsTurn: Promise<unknown> = Promise.resolve()
  /** When the leader last looked for attachments to delete (T806). */
  private lastAttachmentSweep: number | null = null

  private constructor(private readonly o: FolderOptions) {
    this.rulesVersion = o.rulesVersion ?? RULES_VERSION
    const restored = EventLog.readJournal(o.stateDir)
    this.clock = new EventClock(o.clock, { lastN: restored.lastN, lastL: restored.lastL })
    const now = () => this.clock.now()
    this.log = new EventLog({ fs: o.fs, dataDir: o.dataDir, stateDir: o.stateDir, computer: o.computer, clock: this.clock, rulesVersion: this.rulesVersion })
    this.history = new RecordHistory({ fs: o.fs, dataDir: o.dataDir, computer: o.computer, now })
    this.records = new RecordStore({
      fs: o.fs,
      dataDir: o.dataDir,
      computer: o.computer,
      history: this.history,
      now,
      written: (rel, now) => {
        this.lookedAt.delete(rel)
        // Done: what the file holds now is known (looked at again at the next read – the size never matches); failed:
        // the file is as it was, with what is known of it.
        if (!now) return
        // What the counts of series read changed here (a failed write changed nothing).
        if (rel === paths.settings || rel.startsWith('days/') || rel.startsWith(`${ID_COLLECTIONS.series}/`)) this.seriesWrites++
        if (now.value) {
          this.cache.set(rel, { size: -1, mtimeMs: -1, value: now.value })
          this.absent.delete(rel)
        } else {
          this.cache.delete(rel)
          this.absent.add(rel)
        }
      }
    })
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
    const f = new DataFolder({ ...o, fs: rootGuarded(o.fs, o.dataDir) })
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
    // The presence names the last event of each day again (its logs, the journal's events not there yet): after a restart
    // a freeze still waits for this computer's log of a day that has not reached the others (spec „.presence”, A8-06).
    const last: Record<string, number> = {}
    for (let i = 0; i <= JOURNAL_KEEP_DAYS; i++) {
      const day = addDays(today, -i)
      const bytes = await this.o.fs.read(join(this.o.dataDir, paths.log(day, this.o.computer))).catch(() => null)
      for (const e of this.log.ownEvents(day)) last[day] = Math.max(last[day] ?? -1, e.n)
      if (!bytes) continue
      for (const e of readLogText(bytes.toString('utf8')).events) {
        if (e.c !== this.o.computer) continue
        this.clock.continueAfter(e.n, e.l)
        last[e.day] = Math.max(last[e.day] ?? -1, e.n)
      }
    }
    if (Object.keys(last).length) this.presence.update({ lastEvents: { ...last, ...this.presence.own.lastEvents } })
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
    // The other computers' presences are known again only after the next scan: nothing laid over the bar till then (D345).
    this.peersScanned = false
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
   * A record through the cache. A file that cannot be read now – or looked at: the data folder away (E8b.1), a lock – or
   * is broken, keeps the version read before; with the folder away a file this run saw not there is still not there.
   * Without either it is unknown – never taken as missing (a day made from it would be made from defaults, for good).
   */
  private async cachedJson(rel: string): Promise<unknown> {
    const abs = join(this.o.dataDir, rel)
    const looked = this.o.clock.mono()
    const old = this.cache.get(rel)
    let st: Awaited<ReturnType<DataFs['stat']>>
    try {
      st = await this.o.fs.stat(abs)
    } catch (e) {
      // The folder away: nothing there changes it here – the known version is trusted as one just looked at (a list for
      // showing never stats every file again at each refresh); a file not looked at now (a lock) is looked at again.
      if (old && isRootGone(e)) this.lookedAt.set(rel, looked)
      else this.lookedAt.delete(rel)
      if (old) return old.value
      if (isRootGone(e) && this.absent.has(rel)) return undefined
      throw new UnknownRecordError(rel, e instanceof Error ? e.message : String(e))
    }
    if (!st) return this.missing(rel)
    if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) {
      this.lookedAt.set(rel, looked)
      return old.value
    }
    const r = await this.records.read(rel)
    if (r.status === 'missing') return this.missing(rel)
    if (r.status !== 'ok') {
      this.lookedAt.delete(rel)
      if (old) return old.value
      throw new UnknownRecordError(rel, r.why, r.status === 'broken')
    }
    this.absent.delete(rel)
    this.cache.set(rel, { ...st, value: r.value })
    this.lookedAt.set(rel, looked)
    return r.value
  }

  /** A record looked at and not there (remembered for a folder that goes away – `cachedJson`). */
  private missing(rel: string): undefined {
    this.cache.delete(rel)
    this.lookedAt.delete(rel)
    this.absent.add(rel)
    return undefined
  }

  /** A cached record looked at within `LIST_TRUST_MS` (undefined: look at its file). */
  private trusted(rel: string): { value: unknown } | undefined {
    const at = this.lookedAt.get(rel)
    const c = this.cache.get(rel)
    return at != null && c && this.o.clock.mono() - at < LIST_TRUST_MS ? { value: c.value } : undefined
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
    const list = [...rels].sort().filter((rel) => {
      const c = classify(rel)
      return !!c && !c.conflict
    })
    // Thousands of requests after years: their files are looked at side by side, not one after another (A3-08) – and a
    // list for showing takes a file looked at a moment ago from memory (`LIST_TRUST_MS`).
    const raws = await mapLimit(list, DIR_CONCURRENCY, async (rel) => {
      try {
        const known = lenient ? this.trusted(rel) : undefined
        if (known) return own ? this.queue.overlay(rel, known.value as Record<string, unknown> | undefined) : known.value
        return own ? await this.recordView(rel) : await this.shared(rel)
      } catch (e) {
        // A list for showing (requests) goes on without the unknown record; what a day is made from does not.
        if (lenient && e instanceof UnknownRecordError) return undefined
        throw e
      }
    })
    const out: unknown[] = []
    for (const raw of raws) {
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
    const list = (await this.cachedDir(ID_COLLECTIONS.series, seriesFrom, false, own)) as Series[]
    const { plans, days } = await this.seriesOf(list, changes, own)
    return { changes, templates, lectures, series: plans, seriesDays: days }
  }

  /**
   * The series with their last days (D401: a count ends on the day of its N-th occurrence a special day did not skip): the
   * own types of the days the counts read come from their files (`countTypes`). Counted once per its inputs (the series,
   * the settings' changes, your queued edits and this computer's writes of days, series and settings) for `LIST_TRUST_MS`
   * (T717): a type set on another computer reaches the counts within a minute, never at every check of 15 s.
   */
  private async seriesOf(list: readonly Series[], changes: readonly SettingsChange[], own: boolean): Promise<{ plans: SeriesPlan[]; days: Record<string, DayTypeId> }> {
    const key = JSON.stringify([own, own ? this.queueRevision() : '', this.seriesWrites, logicalDayOf(this.clock.now()), list, changes.map((c) => [c.id, c.from, c.at, c.made])])
    const memo = this.seriesMemo.get(own)
    let days: Record<string, DayTypeId>
    if (memo && memo.key === key && this.o.clock.mono() - memo.at < LIST_TRUST_MS) days = memo.days
    else {
      days = await this.countTypes(list, changes, own)
      this.seriesMemo.set(own, { key, at: this.o.clock.mono(), days })
    }
    const plans = seriesPlans(list, typeOfDays(changes, (d) => days[d] ?? null), this.o.holidays)
    // The key of a day counted from the folder's files (`contextSig`) – never from your queued edits.
    if (!own) this.seriesSig = JSON.stringify(plans.map((p) => [p.series.id, p.last]))
    return { plans, days }
  }

  /** Your queued edits as they are (their ids): the view with them changes whenever one comes, goes or is answered. */
  private queueRevision(): string {
    return this.queue.pending.map((e) => e.id).join(',')
  }

  /**
   * The own types of the days the counts of `list` read, from the days' files (side by side, `DIR_CONCURRENCY`), read
   * until the ends stand (a skipped day moves an end – `countDatesToRead`); `seen` – days already read for this change
   * (also those without a type), filled with the ones read now. Not read: a series whose type of day changes nothing
   * (every version „odbywa się”), and one whose end was found before yesterday from days all read (`settledTypes`). A
   * day's file that cannot be read now counts by its weekday – a count of a series never stops the day being made.
   */
  async countTypes(list: readonly Series[], changes: readonly SettingsChange[], own = true, seen: Map<string, DayTypeId | null> = new Map()): Promise<Record<string, DayTypeId>> {
    const known = seen
    const failed = new Set<string>()
    const yesterday = addDays(logicalDayOf(this.clock.now()), -1)
    const open: Series[] = []
    for (const s of list) {
      if (s.count == null || s.versions.every((v) => v.special === 'held')) continue
      const settled = await this.settledTypes(s, own)
      if (settled) for (const [d, t] of Object.entries(settled)) known.set(d, t)
      else open.push(s)
    }
    for (let round = 0; round < SERIES_READ_ROUNDS; round++) {
      const need = countDatesToRead(open, changes, (d) => known.get(d), this.o.holidays)
      if (!need.length) break
      const read = await mapLimit(need, DIR_CONCURRENCY, async (d) => {
        try {
          return (await this.dayFile(d, own))?.dayType ?? null
        } catch {
          failed.add(d)
          return null
        }
      })
      need.forEach((d, i) => known.set(d, read[i] ?? null))
    }
    const days: Record<string, DayTypeId> = {}
    for (const [d, t] of known) if (t) days[d] = t
    const typeOf = typeOfDays(changes, (d) => days[d] ?? null)
    for (const s of open) {
      const last = seriesLast(s, typeOf, this.o.holidays)
      if (last == null || last >= yesterday) continue
      const dates = [...ruleDates(s, s.start, last, this.o.holidays)]
      // Settled only from days all read now (a day that could not be read is unknown, never „no type”).
      if (dates.some((d) => failed.has(d) || !known.has(d))) continue
      const listing = await this.dayListing(s.start, last)
      if (listing == null) continue
      const types: Record<string, DayTypeId | null> = {}
      for (const d of dates) types[d] = known.get(d) ?? null
      this.seriesSettled.set(`${own}|${JSON.stringify(s)}`, { types, writes: this.seriesWrites, queue: own ? this.queueRevision() : '', listing, at: this.o.clock.mono() })
    }
    if (this.seriesSettled.size > 500) this.seriesSettled.clear()
    return days
  }

  /**
   * The types of the days of a series that ended before yesterday, as read when it ended (`countTypes`) – of this view
   * (`own`: with your queued edits, else as the folder holds them – a queued edit never reaches the leader's count), while
   * nothing the count read can have changed: no write of a day, a series or the settings by this computer, the same
   * queued edits, the same files of days in its range (one listing per year – a day's file brought by OneDrive), at most
   * `SETTLED_TRUST_MS` (a file changed in place on another computer). Else null: read again.
   */
  private async settledTypes(s: Series, own: boolean): Promise<Record<string, DayTypeId | null> | null> {
    const key = `${own}|${JSON.stringify(s)}`
    const e = this.seriesSettled.get(key)
    if (!e) return null
    const fresh = e.writes === this.seriesWrites && e.queue === (own ? this.queueRevision() : '') && this.o.clock.mono() - e.at < SETTLED_TRUST_MS
    if (!fresh) {
      this.seriesSettled.delete(key)
      return null
    }
    const dates = Object.keys(e.types).sort()
    if ((await this.dayListing(dates[0] ?? s.start, dates.at(-1) ?? s.start)) !== e.listing) {
      this.seriesSettled.delete(key)
      return null
    }
    return e.types
  }

  /** The days' files from `from` to `to` (their names, one listing per year); null – a year that cannot be listed now. */
  private async dayListing(from: string, to: string): Promise<string | null> {
    const out: string[] = []
    try {
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        for (const f of await this.o.fs.list(join(this.o.dataDir, 'days', String(y)))) {
          const date = classify(`days/${y}/${f.name}`)?.date
          if (!f.dir && date && date >= from && date <= to) out.push(f.name)
        }
      }
    } catch {
      return null
    }
    return out.sort().join(',')
  }

  /**
   * The series for the window (D381): their records as this computer sees them (with your queued edits; a list for showing,
   * `collection`) and the own types of the days their counts read with `changes` (the window counts their last days as
   * `inputs(true)` does).
   */
  async seriesView(changes: readonly SettingsChange[]): Promise<{ records: Array<Record<string, unknown>>; days: Record<string, DayTypeId> }> {
    // A file of a series that cannot be read (never read before) leaves only that series out, as every list of the window.
    const records = await this.collection('series')
    const list = records.map(seriesFrom).filter((x): x is Series => !!x)
    return { records, days: (await this.seriesOf(list, changes, true)).days }
  }

  /** The records of a collection as this computer sees them (requests, routines, all-day events …), through the same cache. */
  async collection(kind: keyof typeof ID_COLLECTIONS): Promise<Array<Record<string, unknown>>> {
    return (await this.cachedDir(ID_COLLECTIONS[kind], (v) => v, true, true)) as Array<Record<string, unknown>>
  }

  /**
   * The blocks of every day with a file, for the global search (T651): the day's whole plan as „Dziś” shows it
   * (`ownContext`: the day's snapshot – the log's or made from the templates – with your edits and queued edits laid
   * over it, so a block of the template the file did not change is there, one cancelled or moved away is not), named as
   * everywhere (`blockName`, the settings of that day) – never by id. Files go through `recordView` (looked at by size
   * and time, parsed again only when they changed on disk). Whatever cannot be read now – the settings, the routines, the
   * requests, a year's list, a day's file or log – makes the answer incomplete: unknown is never „none”.
   */
  async searchDays(): Promise<SearchCorpus> {
    let complete = true
    const settled = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p
      } catch {
        complete = false
        return fallback
      }
    }
    const rd = rdFrom(await settled(this.recordView(paths.settings), undefined))
    const routines = (await settled(this.collection('routine'), [])).map(routineFrom).filter((r): r is Routine => !!r)
    const requests = (await settled(this.collection('request'), [])).map(requestFrom).filter((r): r is RequestRecord => !!r)
    const rels = new Set<string>()
    const root = join(this.o.dataDir, 'days')
    // Each year on its own: a year that cannot be listed leaves the others.
    const years = await settled(this.o.fs.list(root), [])
    for (const y of years) {
      if (!y.dir) continue
      const files = await settled(this.o.fs.list(join(root, y.name)), [])
      for (const f of files) {
        const rel = `days/${y.name}/${f.name}`
        const c = classify(rel)
        if (!f.dir && c?.kind === 'day' && !c.conflict) rels.add(rel)
      }
    }
    // A new day waiting in the queue (the folder away) is a day too.
    for (const rel of this.queue.relsUnder('days')) {
      const c = classify(rel)
      if (c?.kind === 'day' && !c.conflict) rels.add(rel)
    }
    // The settings in force differ only where a change begins: one set of names per number of changes laid on.
    const changes = [...rd.settings].sort(changeOrder)
    const settingsFor = new Map<number, ReturnType<typeof settingsOn>>()
    const namesOn = (date: string): Names => {
      const n = changes.filter((c) => c.from < date || (c.from === date && c.at == null)).length
      let s = settingsFor.get(n)
      if (!s) settingsFor.set(n, (s = settingsOn(changes, date)))
      return { rd, settings: s, routines, requests }
    }
    const inp = await settled(this.inputs(true), null)
    const at = this.clock.now()
    const per = await mapLimit([...rels].sort(), DIR_CONCURRENCY, async (rel) => {
      const date = classify(rel)?.date
      if (!date) return []
      let plan: readonly PlanBlock[]
      try {
        const read = await this.log.readDay(date)
        if (!read.complete && !read.away) complete = false
        if (!inp) throw new Error('inputs')
        plan = (await this.ownContext(date, read, at, inp)).plan
      } catch {
        complete = false
        // The day's own blocks at least (the file as this computer sees it), when its plan cannot be made now.
        try {
          const raw = await this.recordView(rel)
          const f = raw === undefined ? null : dayFileFrom(raw, date)
          plan = f ? f.blocks.filter((b) => !f.cancelled.includes(b.id) && !(b.id in f.movedTo)) : []
        } catch {
          return []
        }
      }
      const names = namesOn(date)
      // An occurrence of a series is found as its series (one record, D401), never once per day.
      return plan.filter((b) => b.origin !== 'series').map((b) => ({ date, id: b.id, title: blockName(b, names), note: b.note, ...(b.steps.length ? { steps: b.steps.map((x) => ({ title: x.title })) } : {}) }))
    })
    return { blocks: per.flat(), complete }
  }

  /**
   * The days from `from` on that have a file (also one still in the queue), in order – a change of a series looks at the
   * occurrences changed on their days (D381). A year that cannot be listed now is an error (unknown is never „none”).
   */
  async dayDatesFrom(from: string): Promise<string[]> {
    const out = new Set<string>()
    const root = join(this.o.dataDir, 'days')
    for (const y of await this.o.fs.list(root)) {
      if (!y.dir || !/^\d{4}$/.test(y.name) || y.name < from.slice(0, 4)) continue
      for (const f of await this.o.fs.list(join(root, y.name))) {
        const c = classify(`days/${y.name}/${f.name}`)
        if (!f.dir && c?.kind === 'day' && !c.conflict && c.date! >= from) out.add(c.date!)
      }
    }
    for (const rel of this.queue.relsUnder('days')) {
      const c = classify(rel)
      if (c?.kind === 'day' && !c.conflict && c.date! >= from) out.add(c.date!)
    }
    return [...out].sort()
  }

  async dayFile(date: string, own = false): Promise<DayFile | null> {
    const v = own ? await this.recordView(paths.day(date)) : await this.shared(paths.day(date))
    return v === undefined ? null : dayFileFrom(v, date)
  }

  /**
   * Your edits from the main window (spec „Edycje plików … trafiają najpierw do lokalnej trwałej kolejki”): each goes to
   * the queue on the disk first, then the queue is laid onto the folder; what met a change elsewhere stays a question.
   */
  async edit(entries: ReadonlyArray<Omit<QueuedEdit, 'id' | 'at' | 'schema' | 'after'> & { schema?: number; after?: readonly number[] }>): Promise<Outcome[]> {
    // A new record only where there is none: a file that is there but cannot be read now (OneDrive still fetching it) or
    // that came meanwhile is never taken as missing – its every field would be a question about a change you never made.
    const fresh: string[] = []
    for (const e of entries) {
      if (!e.create) continue
      const now = await this.records.read(e.rel)
      const inQueue = this.queue.overlay(e.rel, undefined) !== undefined
      // The data folder away (E8b.1) – that read's own answer: a new record of an id made now, or a file this run saw not
      // there, waits in the queue – laid on its return like any new record (a file that came meanwhile: its fields are
      // questions, never written over); any other file is not known here.
      if (now.status === 'unreadable' && now.gone && !inQueue) {
        if (!isIdRecord(e.rel) && !this.absent.has(e.rel)) throw new Error('folder danych jest niedostępny – zmiana nie została zapisana, spróbuj po jego powrocie')
        fresh.push(e.rel)
        continue
      }
      // The very record made on another computer (T1041 – an id derived from its data, the same content: the next task of a
      // task that repeats, ticked off on both): nothing to refuse – the queue lays it as no change.
      if (now.status === 'ok' && !inQueue && sameContentAs(now.value, newRecordOf(e.edits))) continue
      if (now.status !== 'missing' || inQueue)
        throw new Error(
          now.status === 'ok'
            ? 'ten rekord już jest w folderze (zmienił się w międzyczasie) – zmiana nie została zapisana, spróbuj jeszcze raz'
            : now.status === 'broken'
              ? 'plik jest uszkodzony – przywróć go z Historii; zmiana nie została zapisana'
              : 'plik jest teraz nieczytelny – zmiana nie została zapisana, spróbuj za chwilę'
        )
    }
    const at = this.clock.now()
    const ids: string[] = []
    const queued: QueuedEdit[] = []
    for (const e of entries) {
      const id = `${this.o.computer}-${at.toString(36)}-${(this.editSeq++).toString(36)}`
      // The entries before it in this edit it goes with (T923), by their place.
      const after = [...new Set(e.after ?? [])].filter((i) => Number.isInteger(i) && i >= 0 && i < ids.length).map((i) => ids[i]!)
      ids.push(id)
      queued.push({ id, at, schema: e.schema ?? 1, rel: e.rel, edits: e.edits, ...(e.create ? { create: true } : {}), ...(e.remove ? { remove: true, ...(e.base !== undefined ? { base: e.base } : {}) } : {}), ...(after.length ? { after } : {}) })
    }
    // All of them on the disk at once, or none (A3-15): a save that fails leaves no part of it to be written later.
    this.queue.add(...queued)
    // A new record waiting for the folder is not there till then: shown from the queue, never „unknown” (the bar, lists).
    for (const rel of fresh) this.absent.add(rel)
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
    // A data folder gone while the app works (moved, deleted, OneDrive not there) is unavailable, never empty: no leader's
    // tasks and no writes – they wait in the journal and the queue (spec „Kilka komputerów”, A3-01). Back, the computer
    // is unsettled first, as after the network's return.
    let root: 'here' | 'gone' | 'unknown' = 'here'
    try {
      if (!(await this.o.fs.stat(this.o.dataDir))) root = 'gone'
    } catch (e) {
      // Only a root that is not there is gone; one that cannot be looked at now (a lock) only skips this check.
      root = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'gone' : 'unknown'
    }
    if (root !== 'here') {
      if (root === 'gone') this.rootGone = true
      problems.push(root === 'gone' ? 'folder danych niedostępny – zapisy czekają w dzienniku i kolejce' : 'folder danych chwilowo nieczytelny – sprawdzenie pominięte')
      return { leader: this.leader, settled: false, created: null, segments: 0, autos: 0, nextAt: null, frozen: [], problems }
    }
    if (this.rootGone) {
      this.rootGone = false
      this.unsettle('network')
    }
    try {
      // Computers forgotten in the settings (A3-13): nobody waits for them while they are not used again – as the folder
      // holds rd.json (a forget still in the queue, maybe a question, never decides a freeze).
      const forgotten = rdFrom(await this.shared(paths.settings).catch(() => undefined)).forgotten
      this.presence.forgotten = new Map(Object.entries(forgotten).map(([id, f]) => [id, f.lastPresence]))
      this.peers = await this.presence.scan()
      this.peersScanned = true
      for (const p of this.peers) {
        if (this.lastSeenPeers.get(p.presence.computer) !== p.fileSeenAt) this.settle.changeSeen(now)
        this.lastSeenPeers.set(p.presence.computer, p.fileSeenAt)
        if (now - p.fileSeenAt < SILENT_MS) this.freshSeen.add(p.presence.computer)
      }
    } catch (e) {
      problems.push(String(e))
    }
    this.settle.oneDrive((this.o.oneDriveProcess ?? this.o.oneDriveRunning)(), now)
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
    if (read) this.dayAhead = read.ahead
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
        const gate = await this.gateOf(day, read, now)
        for (const seg of newSegments(state, state.grid.start, Math.min(gate, now))) {
          this.append({ day, dom: 'timer', k: 'minutes', ...seg })
          segments++
        }
        if (state.hardEnd.passed != null && !state.facts.hardEndPass && state.grid.start + state.hardEnd.passed * 60_000 <= gate) {
          this.append({ id: derivedId(day, 'hardend.pass'), day, dom: 'timer', k: 'hardend.pass', at: state.grid.start + state.hardEnd.passed * 60_000, basis: 'prowadzący', quiet: state.hardEnd.nothingMissing })
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
            // Input after 04:00 is in today's logs: both gates hold (`gateOf` – the bar's overlay takes the same, D345).
            const y = await this.autoTasks(yesterday, yRead, yCtx, computeDay(yCtx), now, await this.gateOf(yesterday, yRead, now))
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
        // Attachments removed 30 days ago go with their files (D410, T806). Apart, so they never stop the rest.
        await this.attachmentSweep(now, problems).catch((e) => problems.push(`załączniki: ${String(e)}`))
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

  /** A line of this computer's file of grades – after ending a last line a hard power-off cut (A3-12). */
  private async appendGrade(day: string, line: unknown): Promise<void> {
    const abs = join(this.o.dataDir, paths.grades(day.slice(0, 4), this.o.computer))
    const bytes = await this.o.fs.read(abs)
    const cut = !!bytes && bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a
    await this.o.fs.append(abs, `${cut ? '\n' : ''}${JSON.stringify(line)}\n`)
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
          await this.appendGrade(day, line)
          this.append({ id: derivedId(day, 'freeze', this.o.computer, String(this.rulesVersion)), day, dom: 'game', k: 'day.freeze', at: now, how: was.how, know: was.know, missing: was.missing, grade })
          this.frozenDays.add(day)
          out.push(day)
          continue
        }
        const quiet = this.quietFor(day, read, await this.dayFile(day), now)
        // The day opened after its end: the first presence of the next days – a day with nobody at a computer between
        // counts on to the first one used (spec „24 h od otwarcia dnia po jego końcu … najwyżej 72 h”, A2-07).
        let openedAt: number | null = null
        for (let i = 1; i <= 3 && openedAt == null; i++) if (addDays(day, i) <= today) openedAt = openedAtOf((await this.log.readDay(addDays(day, i))).events)
        if (now < correctionEnd(day, openedAt)) continue
        writers ??= this.writerIds(today)
        // A computer forgotten in the settings is not waited for (spec „zamrażanie przestaje na niego czekać”).
        const ids = new Set([...(await writers), ...Object.keys(read.lastByComputer)].filter((id) => id === this.o.computer || !this.presence.isForgotten(id)))
        const computers = [...ids].map((id) => ({ id, self: id === this.o.computer, presence: this.peers.find((p) => p.presence.computer === id)?.presence ?? null, visibleLast: read.lastByComputer[id] ?? -1 }))
        // No conflict copies in the files its grade reads – the log, the day's and the next day's file, rd.json, the
        // templates and the plan of lectures – until you answer them (spec „Ocena dnia”, A2-03); after 72 h it freezes
        // without waiting, as with the log's copies.
        const readsCopy = [...this.copyConflicts.values()].some(({ canonical: c }) => c === paths.day(day) || c === paths.day(addDays(day, 1)) || c === paths.settings || c.startsWith(`${ID_COLLECTIONS.template}/`) || c.startsWith(`${ID_COLLECTIONS.schedule}/`) || c.startsWith(`${ID_COLLECTIONS.series}/`))
        const decision = freezeDecision({ date: day, now, mayFreeze, openedAt, computers, filesQuiet: read.copies === 0 && !readsCopy && quiet })
        if (!decision.freeze) continue
        const know = { ...read.lastByComputer }
        inputs ??= this.gameInputs(day, today)
        const game = (await inputs)(day)
        const grade = await (this.o.worker ?? inProcess).run({ kind: 'grade', ctx: await this.dayContext(day, read, now), know, game })
        // The file of grades first: a freeze in the log is never left without its line (the line is derived – a second
        // one after a failed log write is harmless, the freeze event is what counts).
        const line = { day, at: now, v: this.rulesVersion, how: decision.how, know, missing: decision.missing, grade }
        await this.appendGrade(day, line)
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
   * was, before any the setting now. `tolerant` (the statistics): a day whose log cannot be read stops the pass – the
   * changes of that day and of every day before it are unknown, so the days before it get no answer (the function
   * throws for them: the caller leaves such a day out) instead of failing the whole pass.
   */
  private async moduleStates(from: string, today: string, tolerant = false): Promise<(day: string) => Record<ModuleId, boolean>> {
    const cur = { ...rdFrom(await this.shared(paths.settings)).general.modules }
    const during = new Map<string, Record<ModuleId, boolean>>()
    let unknownBefore: string | null = null
    for (let d = today; d >= from; d = addDays(d, -1)) {
      during.set(d, { ...cur })
      const firsts = new Set<ModuleId>()
      let read: DayRead
      try {
        read = await this.log.readDay(d)
        if (tolerant && !read.complete) throw new Error('log dnia niepełny')
      } catch (e) {
        if (!tolerant) throw e
        unknownBefore = d
        break
      }
      for (const e of read.events.filter(isKnown).sort(compareEvents)) {
        const m = e.k === 'energy.module' ? 'energy' : e.k === 'module.set' && (MODULES as readonly string[]).includes(e.module) ? (e.module as ModuleId) : null
        if (!m || firsts.has(m)) continue
        firsts.add(m)
        const t = e as { on: boolean; was?: boolean }
        cur[m] = t.was ?? !t.on
      }
    }
    return (day) => {
      if (unknownBefore != null && day < unknownBefore) throw new Error(`moduły dnia ${day} nieznane – log dnia ${unknownBefore} nieczytelny`)
      return during.get(day) ?? cur
    }
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
   * The statistics of the frozen days of a period before today (D358): each day counted as its grade counts it, by the
   * helper process, once per change of what it is made of; days not frozen yet are not in it – only confirmed data. A
   * frozen day whose own records cannot be read now (its log, its files, a later day's log its modules need), or whose
   * data the engine fails on, is left out and counted („nieczytelne”); a failure that is not one day's (the settings, the
   * helper process dying or hanging, the files of grades) fails the whole count. The
   * same period asked again while it is being counted shares the count.
   */
  stats(period: StatsPeriod, at = this.clock.now()): Promise<StatsResult> {
    const run = this.statsRuns.get(period)
    if (run) return run
    const started = this.statsOnce(period, at).finally(() => this.statsRuns.delete(period))
    this.statsRuns.set(period, started)
    return started
  }

  private async statsOnce(period: StatsPeriod, at: number): Promise<StatsResult> {
    const today = logicalDayOf(at)
    const from = periodFrom(period, today)
    const lines = [...(await this.gradeIndex()).lines.values()].filter((l) => l.day < today && (from == null || l.day >= from)).sort((a, b) => (a.day < b.day ? -1 : 1))
    const inp = await this.inputs()
    // A grade from before the modules: the modules of the day from one pass back from today, made at the first such day.
    let states: Promise<(day: string) => Record<ModuleId, boolean>> | null = null
    const days: DayStats[] = []
    let unreadable = 0
    for (const line of lines) {
      let read: DayRead
      let dayFile: DayFile | null
      let nextFile: DayFile | null
      try {
        read = await this.log.readDay(line.day)
        if (!read.complete || !read.events.length) {
          unreadable++
          continue
        }
        dayFile = await this.dayFile(line.day)
        nextFile = await this.dayFile(addDays(line.day, 1))
      } catch {
        unreadable++
        continue
      }
      let modules = storedModules(line.grade)
      if (!modules) {
        const lookup = await (states ??= this.moduleStates(line.day, today, true))
        try {
          const s = lookup(line.day)
          modules = { energy: s.energy, projects: s.projects, requests: s.requests }
        } catch {
          // A later day's log cannot be read: the modules of this day are not known – it is left out (counted).
          unreadable++
          continue
        }
      }
      // The key first: a day counted before is not built (its context) again.
      const key = JSON.stringify([read.lastByComputer, read.events.length, read.copies, this.contextSig(line.day), line.v, line.know, modules, line.grade.boundary, line.grade.free])
      const was = this.statsMemo.get(line.day)
      if (was?.key === key) {
        days.push(was.stats)
        continue
      }
      const ctx = dayContextOf(inp, { date: line.day, events: read.events, dayFile, nextFile }, this.o.holidays, at)
      const stats = await (this.o.worker ?? inProcess).run({ kind: 'stats', ctx, know: line.know, modules, grade: line.grade })
      if ('error' in stats) {
        // The engine failed on this day's data (not the process): the day is left out, the period still counts.
        this.o.log?.('warn', `statystyki: dzień ${line.day} pominięty – błąd silnika (${stats.error})`)
        unreadable++
        continue
      }
      this.statsMemo.set(line.day, { key, stats })
      days.push(stats)
    }
    return statsOf(period, days, unreadable)
  }

  /**
   * Days of the horizon (D356: the week, the month's goals; T553) as this computer sees them – your queued edits
   * included – each counted by the helper process (`horizonDay`): a day gone by as its grade counts it (a frozen one up
   * to the events its freeze named), today live, a day to come from its plan. rd.json or the list of templates not
   * readable now (OneDrive still bringing them): every day unknown – never a refusal of the week or of the progress.
   */
  private async horizonDays(dates: readonly string[], at: number, energy = false): Promise<HorizonDay[]> {
    const today = logicalDayOf(at)
    const inp = await this.inputs(true).catch(() => null)
    // The curves (D417): the energy module as the settings have it now (your queued change too) – for today and the days to
    // come; a day gone by tells its own from its grade and its log (`horizonDay`, T950) – nothing read for it here.
    const moduleOn = energy && inp ? rdFrom(await this.recordView(paths.settings).catch(() => undefined)).general.modules.energy : true
    const out: HorizonDay[] = []
    for (const date of dates) out.push(inp ? await this.horizonDay(date, today, at, inp, energy, moduleOn) : unknownDay(date, whenOf(date, today)))
    // The days asked last stay remembered (`HORIZON_MEMO_DAYS`: the month of „Kalendarz”, the goals, the week and the days shown).
    for (const d of this.horizonMemo.keys()) if (this.horizonMemo.size > HORIZON_MEMO_DAYS) this.horizonMemo.delete(d)
    return out
  }

  /**
   * One day of the horizon: first the key of what it is made of – its log, its file and the next one's (each only looked
   * at), for a day the leader made (its snapshot in the log) the next wake instead of every record – then counted again
   * only on a change, once for every ask at the same time; a count begun earlier never writes over the result of one
   * begun later (the day changed meanwhile). Its log or file not readable now, or its count failed (the helper process
   * timed out or started again): this day unknown – said in the log, by its date and the kind of the error – the others
   * go on.
   */
  private async horizonDay(date: string, today: string, at: number, inp: Inputs, curve: boolean, moduleOn: boolean): Promise<HorizonDay> {
    const when = whenOf(date, today)
    const next = addDays(date, 1)
    // What the curve is counted with (T914, T966): none, or with the module of the day – a day gone by its own (T950), today
    // and a day to come the module now. A count serves an ask when it is of the same day and has the curve asked for: one
    // without a curve (the month, the goals, „Agenda”) is served by any; one with it only by a count with the same.
    const want: CurveKey = !curve ? null : when === 'past' ? 'own' : moduleOn ? 'on' : 'off'
    const serves = (e: CurveKey) => want == null || e === want
    try {
      const read = await this.log.readDay(date)
      const dayFile = await this.dayFile(date, true)
      const nextFile = await this.dayFile(next, true)
      const made = daySnapshotOf(read.events) != null
      const records = made ? [this.recordSig(paths.day(date)), this.recordSig(paths.day(next)), nextWakeForBedtime(null, nextFile, inp.changes, next)] : this.contextSig(date)
      const key = JSON.stringify([when === 'today' ? Math.floor(at / 60_000) : when === 'future' ? today : null, read.lastByComputer, read.events.length, read.copies, records, this.queue.pending.length])
      const was = this.horizonMemo.get(date)
      let day: HorizonDay
      let seq: number
      let counted: CurveKey
      if (was?.key === key && serves(was.curve)) ({ day, seq, curve: counted } = was)
      else {
        let job = this.horizonRuns.get(date)
        if (job?.key !== key || !serves(job.curve)) {
          const run = (async () => {
            const ctx = dayContextOf(inp, { date, events: read.events, dayFile, nextFile }, this.o.holidays, at)
            const frozen = when === 'past' ? foldFacts(gridOf(date), read.events).frozen : null
            return (this.o.worker ?? inProcess).run({ kind: 'horizon', ctx, when, frozen: frozen ? { know: frozen.know, grade: frozen.grade } : null, curve, moduleOn })
          })()
          const mine = { key, curve: want, run, seq: ++this.horizonSeq }
          job = mine
          this.horizonRuns.set(date, mine)
          void run.then(
            () => this.horizonRuns.get(date) === mine && this.horizonRuns.delete(date),
            () => this.horizonRuns.get(date) === mine && this.horizonRuns.delete(date)
          )
        }
        day = await job.run
        seq = job.seq
        counted = job.curve
      }
      // Remembered (the last asked at the end) – unless a count begun later has written the day already, or the same day is
      // remembered with its curve (a count without one never takes its place).
      const now = this.horizonMemo.get(date)
      const richer = now != null && now.key === key && now.curve != null && counted == null
      if (!now || (now.seq <= seq && !richer)) {
        this.horizonMemo.delete(date)
        this.horizonMemo.set(date, { key, day, seq, curve: counted })
      } else if (richer) {
        this.horizonMemo.delete(date)
        this.horizonMemo.set(date, now)
      }
      return read.complete ? day : { ...day, read: 'partial' }
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code
      const kind = `${(e as object | null)?.constructor?.name ?? typeof e}${typeof code === 'string' ? ` ${code}` : ''}`
      this.o.log?.('warn', `tydzień i cele: dzień ${date} nieznany (${kind})`)
      return unknownDay(date, when)
    }
  }

  /** The week of `date` (D356): its seven days from Monday, as this computer sees them. */
  async weekView(date: string, at = this.clock.now()): Promise<WeekView> {
    const week = weekStart(date)
    return weekViewOf(week, logicalDayOf(at), await this.horizonDays(weekDates(week), at, true))
  }

  /** Days of the horizon on one axis (D417 „3 dni”, D418 „Agenda”): each as the week counts it, in the order asked. */
  async daysView(dates: readonly string[], at = this.clock.now(), energy = true): Promise<DaysView> {
    return daysViewOf(dates, logicalDayOf(at), await this.horizonDays(dates, at, energy))
  }

  /**
   * The month shown in „Kalendarz” (D418): each of its days as the week counts it, given as its blocks (D429) and its load of
   * work against the budget (`monthDayOf`) – the cell's bars and „+N” the window lays with the all-day events (`monthCell`).
   */
  async monthView(month: string, at = this.clock.now()): Promise<MonthView> {
    const days = await this.horizonDays(monthDates(month), at)
    return { month, today: logicalDayOf(at), days: days.map(monthDayOf) }
  }

  /**
   * A month's goals (D356) as this computer sees rd.json, the month before's (to take over), and the progress: the days
   * from its first to today, each as the week counts it, preliminary from the ritual's first day (D320). rd.json not
   * readable now – no goals (the progress still counts).
   */
  async goalsView(month: string, at = this.clock.now()): Promise<GoalsView> {
    const all = rdFrom(await this.recordView(paths.settings).catch(() => undefined)).goals
    const goals = all[month] ?? NO_GOALS
    const days = await this.horizonDays(goalsDates(month, logicalDayOf(at)), at)
    return { month, goals, previous: all[previousMonth(month)] ?? null, progress: goalsProgress(month, goals, days, await this.ritualDay()) }
  }

  /**
   * A change of a month's goals (D356, T552) – the numbers, the morning's step skipped – as fields of rd.json through the
   * queue, one change at a time, each made from rd.json as this computer sees it in its turn (only what differs; nothing –
   * []). No rd.json yet: it is made, as every change of the settings makes it (`trySaveRd`: `schema` and the changed
   * fields; one that came meanwhile is never written over – the change is refused). rd.json not readable now (never read
   * in this run): refused with why – nothing waits, the window says „Nie zapisano”.
   */
  setGoals(month: string, patch: GoalsPatch): Promise<Outcome[]> {
    const run = this.goalsTurn.then(async () => {
      let raw: Record<string, unknown> | undefined
      try {
        raw = await this.recordView(paths.settings)
      } catch {
        throw new Error('plik ustawień (rd.json) jest teraz nieczytelny – cele nie zostały zapisane, spróbuj za chwilę')
      }
      const edits = goalsEdits(raw ?? {}, month, patch)
      if (!edits.length) return []
      if (raw) return this.edit([{ rel: paths.settings, edits }])
      let goals: unknown = {}
      for (const x of edits) goals = setAt(goals, x.path.slice(1), x.value)
      return this.edit([{ rel: paths.settings, create: true, edits: [{ path: ['schema'], base: undefined, value: RD_SCHEMA }, { path: ['goals'], base: undefined, value: goals }] }])
    })
    this.goalsTurn = run.catch(() => undefined)
    return run
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
  async calibration(at = this.clock.now()): Promise<{ period: CalibrationPeriod | null; time: TimeProposal[]; costs: CostProposal[]; felt: FeltCounts }> {
    const today = logicalDayOf(at)
    const period = calibrationPeriod(await this.calibrationDays(today), today)
    if (!period) return { period, time: [], costs: [], felt: {} }
    const summaryOf = this.summaries(today, at)
    const samples: TimeSample[] = []
    const evidence: CostEvidence[] = []
    const felt: FeltCounts = {}
    for (const d of period.days) {
      const s = await summaryOf(d)
      if (s) {
        samples.push(...s.summary.samples)
        if (s.summary.costs) evidence.push(s.summary.costs)
      }
      // The felt cost of the ritual (D319): a source beside the signals (spec „dodatkowe źródło”) – the day's last answer
      // for each category, a frozen day's up to the events its freeze counted (as the rest of the review).
      const events = (await this.log.readDay(d)).events
      const frozen = foldFacts(gridOf(d), events).frozen
      const last = new Map<string, FeltCost>()
      for (const e of (frozen ? countedEvents(events, frozen.know) : events).filter(isKnown).sort(compareEvents)) if (e.k === 'cost.felt') last.set(e.category, e.feel)
      for (const [cat, feel] of last) (felt[cat] ??= { lighter: 0, usual: 0, heavier: 0 })[feel]++
    }
    // The proposals go against the values the window changes – its own view, with your edits still in the queue.
    const inp = await this.inputs(true)
    return { period, time: timeProposals(samples, inp.templates, today), costs: costProposals(evidence, settingsOn(inp.changes, today, at)), felt }
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
    const of = (rel: string) => this.recordSig(rel)
    const dir = (d: string) => (this.listed.get(d) ?? []).map((n) => `${n}=${of(`${d}/${n}`)}`).join(',')
    return [of(paths.settings), dir(ID_COLLECTIONS.template), dir(ID_COLLECTIONS.schedule), dir(ID_COLLECTIONS.series), this.seriesSig, of(paths.day(date)), of(paths.day(addDays(date, 1)))].join('|')
  }

  /** A record as last read: by size and time of modification ('-': not read, or not there). */
  private recordSig(rel: string): string {
    const c = this.cache.get(rel)
    return c ? `${c.size}:${c.mtimeMs}` : '-'
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
   * The day a click and the bar concern: the one with a block still running from before 04:00, else today; „Koniec” of
   * a request – the day it runs in (one from before 04:00 keeps its day). A block of the day before the app's close
   * interrupted runs no more for the bar either (D345). With what it counted: the day before chosen – its read and its
   * `barDay`, for the caller to take again.
   */
  private async barActiveDay(now: number, request: string | null = null): Promise<{ day: string; read?: DayRead; bar?: BarDayWith; before?: AutoEvent[] }> {
    const today = logicalDayOf(now)
    const yesterday = addDays(today, -1)
    const y = await this.log.readDay(yesterday).catch(() => null)
    if (request != null) return { day: y && hasOpenRequest(yesterday, y.events, request) ? yesterday : today }
    if (!y || !hasRunning(yesterday, y.events)) return { day: today }
    const bar = await this.barDay(yesterday, y, now, true)
    const t = timerNow(bar.state)
    // Today by the ends laid over the day before: what is written on today's bar writes them first (`writeOn`).
    return t.fg || t.bg.length ? { day: yesterday, read: y, bar } : { day: today, before: bar.laid }
  }

  /**
   * The leader's gate for a day's automatic actions (`check`): the day's own, and for a day before today also today's
   * (input after 04:00 is in today's logs).
   */
  private async gateOf(day: string, read: DayRead, now: number): Promise<number> {
    const today = logicalDayOf(now)
    const own = minuteGate(now, day, this.peers, read.lastByComputer)
    if (day >= today) return own
    const t = await this.log.readDay(today).catch(() => null)
    return Math.min(own, t ? minuteGate(now, today, this.peers, t.lastByComputer) : Number.NEGATIVE_INFINITY)
  }

  /** The day as you see it (your queued edits laid over the files): clicks and answers are judged on it. */
  private async ownContext(date: string, read: DayRead, at: number, inp?: Inputs): Promise<DayContext> {
    return dayContextOf(inp ?? (await this.inputs(true)), { date, events: read.events, dayFile: await this.dayFile(date, true), nextFile: await this.dayFile(addDays(date, 1), true) }, this.o.holidays, at)
  }

  /**
   * The day as the bar shows it (`ownContext`) with the ends of blocks the app's close interrupted laid over it (D345):
   * the rule 'shutdown' of the leader (`shutdownActions`, up to the same gate – `gateOf`, the same derived ids), due and
   * not written yet, never written by itself – a computer just started is unsettled for at least 3 min and writes
   * nothing meanwhile (spec „Kilka komputerów”). The bar, its questions, the answers, the clicks and the actions of the
   * day are judged on it, so the block no longer counts and its line „… przerwany zamknięciem aplikacji o …” stands
   * from the start. Whatever writes on it writes `laid` first (`writeOn`): what you clicked stays as the bar showed it.
   * Without a click the leader writes the ends once settled; a log of another computer that comes before that and shows
   * the block running there takes them away – the line goes and the block counts on. Nothing is laid where the leader
   * writes nothing either – a day whose logs are not all readable now or with another computer's clock far ahead, before
   * the first scan of the other computers' presences (the gate) – nor when the leader's same pass starts a fixed block
   * that pauses the interrupted one (its pause comes before the end at the close): the bar waits for the settling then, as
   * in 1.0.1. The activity is counted only while a block runs (`withActivity` – always; `known` – counted already).
   */
  private async barDay(day: string, read: DayRead, at: number, withActivity: true, known?: Activity | null): Promise<BarDayWith>
  private async barDay(day: string, read: DayRead, at: number, withActivity?: boolean, known?: Activity | null): Promise<BarDay>
  private async barDay(day: string, read: DayRead, at: number, withActivity = false, known: Activity | null = null): Promise<BarDay> {
    const ctx = await this.ownContext(day, read, at)
    const state = computeDay(ctx)
    const t = timerNow(state)
    const runs = t.fg != null || t.bg.length > 0
    const activity = known ?? (runs || withActivity ? await this.activityFor(day, read, at) : null)
    if (!runs || !activity || !(await this.mayLay(day, read, at))) return { ctx, state, activity, laid: [] }
    const written = new Set(ctx.events.map((e) => e.id))
    const inp = { ctx, state, activity, now: at, gate: await this.gateOf(day, read, at) }
    const shutdowns = shutdownActions(inp, t)
    const laid = [...shutdowns.values()].filter((x) => x.due && !written.has(x.end.id) && !state.facts.undone.has(x.end.id)).map((x) => x.end)
    if (!laid.length || fixedStartPausesClosed(inp, t, shutdowns)) return { ctx, state, activity, laid: [] }
    // As the leader would write them now: after every event seen, the next numbers of this computer.
    const n = ctx.events.reduce((m, e) => (e.c === this.o.computer ? Math.max(m, e.n + 1) : m), 0)
    const over = { ...ctx, events: [...ctx.events, ...simEvents(ctx, laid, at, { c: this.o.computer, n })] }
    return { ctx: over, state: computeDay(over), activity, laid }
  }

  /**
   * The leader would write automatic actions of a day so read (`check`) and its gate is known (D345): the presences
   * scanned since the computer last became unsettled; today's logs readable in full with no other clock far ahead (the
   * leader does nothing without it, yesterday's tasks neither) and, for yesterday, its logs too. Only today and yesterday –
   * the leader judges no older day.
   */
  private async mayLay(day: string, read: DayRead, at: number): Promise<boolean> {
    const readable = (r: DayRead | null) => !!r && r.complete && !r.ahead
    if (!this.peersScanned || !readable(read)) return false
    const today = logicalDayOf(at)
    if (day === today) return true
    if (day !== addDays(today, -1)) return false
    return readable(await this.log.readDay(today).catch(() => null))
  }

  /**
   * `barDay` may lay something over the day – its cheap part first (`ritual`): the leader's conditions (`mayLay`), a
   * block running by the log and a stretch the app's close interrupted since its run began (`closedSince`). The
   * activity counted for it (to pass on), null – nothing to lay.
   */
  private async mayLayOn(day: string, read: DayRead, at: number): Promise<Activity | null> {
    if (!(await this.mayLay(day, read, at))) return null
    const grid = gridOf(day)
    const runs = runningFacts(day, read.events).map((f) => runFromOf(grid, f))
    if (!runs.length) return null
    const activity = await this.activityFor(day, read, at)
    return closedSince(activity, Math.min(...runs), at) ? activity : null
  }

  /**
   * What a click, an answer, an action of the day or a signal judged on `barDay` writes (one at a time – `serial`): the
   * laid ends first – only those not in the day's log yet (the leader's check may have written them meanwhile) – then its
   * own events. On today's bar the ends laid over the day before go first, to its log: the bar left that day by them
   * (`barActiveDay` – `before`, counted again when not given). All checked first and written in one go: with an end laid,
   * the days' logs readable in full now; a part that fails leaves nothing behind (the click fails, as it did). Answers the
   * events of `drafts` as written, in their order (their ids – „Cofnij” of a close, D468).
   */
  private async writeOn(day: string, laid: readonly AutoEvent[], drafts: readonly TimerDraft[], before?: readonly AutoEvent[]): Promise<AnyEvent[]> {
    const at = this.clock.now()
    const yesterday = addDays(day, -1)
    const carried = before ?? (day === logicalDayOf(at) ? ((await this.barActiveDay(at)).before ?? []) : [])
    const seen = new Set<string>()
    if (carried.length || laid.length) {
      for (const d of carried.length ? [yesterday, day] : [day]) {
        const read = await this.log.readDay(d)
        if (!read.complete) throw new Error('nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę')
        for (const e of read.events) seen.add(`${d}|${e.id}`)
      }
    }
    // Nothing awaited from here to the writes: this computer's own writes since the reads (the leader's check) are in
    // its journal.
    for (const d of [yesterday, day]) for (const e of this.log.ownEvents(d)) seen.add(`${d}|${e.id}`)
    const fresh = (d: string, list: readonly AutoEvent[]) => list.filter((e) => !seen.has(`${d}|${e.id}`))
    // All three checked before the first write (a part that fails leaves nothing behind); written in this order.
    const early = this.checked(yesterday, fresh(yesterday, carried))
    const ends = this.checked(day, fresh(day, laid))
    const own = this.checked(day, drafts)
    for (const d of [...early, ...ends]) this.append(d)
    const written = own.map((d) => this.append(d))
    if (early.length || ends.length || own.length) await this.log.flush()
    return written
  }

  /** Drafts of the timer as lines of a day's log, each checked first (an error: none of them). */
  private checked(day: string, drafts: readonly TimerDraft[]): EventDraft[] {
    const now = this.clock.now()
    const ready: EventDraft[] = []
    for (const d of drafts) {
      // A record that changes no timing (a routine ticked off) says so: an older version skips it without waiting for an update.
      const draft: EventDraft = { ...d, day, dom: d.dom === 'meta' ? 'meta' : 'timer' }
      const check = parseEvent(JSON.stringify({ ...draft, id: 'x', c: this.o.computer, n: 0, t: now, l: now, v: this.rulesVersion }))
      if (!check.ok || !isKnown(check.event)) throw new Error(`zdarzenie ${d.k}: ${check.ok ? 'nieznane' : check.why}`)
      ready.push(draft)
    }
    return ready
  }

  /** Writes drafts of the timer to a day's log, each checked as a line of the log first. */
  private async writeTimer(day: string, drafts: readonly TimerDraft[]): Promise<void> {
    for (const d of this.checked(day, drafts)) this.append(d)
    await this.log.flush()
  }

  private clicks: Promise<unknown> = Promise.resolve()

  /** One at a time with the other clicks, answers, actions of the day and signals (`clicks`). */
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const p = this.clicks.then(run, run)
    this.clicks = p.catch(() => undefined)
    return p
  }

  /**
   * A click of the timer (spec „Akcje widgetu wykonuje proces główny i zapisuje je jako zdarzenia w logu”): judged on the
   * day as it is now – a second click of the same action finds it done and does nothing (no two entries) – one at a time.
   */
  timerClick(click: TimerClick): Promise<ActionResult> {
    const run = async (): Promise<ActionResult> => {
      const now = this.clock.now()
      // The day before chosen – counted once, by the choice itself (as `widgetModel`).
      const chosen = click.day && isIsoDate(click.day) ? { day: click.day } : await this.barActiveDay(now, click.a === 'requestEnd' ? click.request : null)
      const day = chosen.day
      const read = chosen.read ?? (await this.log.readDay(day))
      // With the data folder away: judged on the day as last read and the journal, it waits there (E8b.1).
      if (!read.complete && !read.away) return { ok: false, why: 'nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę', confirm: null }
      const { ctx, state, laid } = chosen.bar ?? (await this.barDay(day, read, now))
      const { day: _d, probe, ...act } = click
      void _d
      // Requests („zrobione teraz”, urgent, after the fact, „Koniec”) and the rest of the timer.
      const r = act.a === 'requestNow' || act.a === 'requestEnd' || act.a === 'requestAfter' ? requestAction(state, act as RequestAction, now) : timerAction(ctx, state, act as TimerAction, now)
      if (r.ok && r.events.length && !probe) await this.writeOn(day, laid, r.events, chosen.before)
      return r
    }
    return this.serial(run)
  }

  /** The questions open now on a day, as this computer sees them. */
  async questions(day: string, at = this.clock.now()): Promise<Question[]> {
    const read = await this.log.readDay(day)
    const { ctx, state, activity } = await this.barDay(day, read, at, true)
    return questionsOf({ ctx, state, activity, now: at })
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
      const read = await this.log.readDay(day)
      const { ctx, state, activity, laid } = await this.barDay(day, read, now, true)
      const q = questionsOf({ ctx, state, activity, now }).find((x) => x.id === id)
      if (!q) return { ok: false, why: 'to pytanie już nie czeka', confirm: null }
      const drafts = answerEvents(state, q, answer, now, value, ctx.plan)
      if (drafts) {
        await this.writeOn(day, laid, drafts)
        return { ok: true, events: drafts, confirm: null }
      }
      const act: TimerAction | null =
        answer === 'next' ? { a: 'next', confirm: value === 1 } : answer === 'extend' ? { a: 'extend', minutes: value ?? 15, confirm: false } : answer === 'workEnd' ? { a: 'workEnd' } : answer === 'working' ? { a: 'startNew', block: `${this.o.computer}-${now.toString(36)}`, categoryId: 'inne', durationMin: 30, confirm: value === 1 } : null
      if (!act) return { ok: false, why: `nieznana odpowiedź ${answer}`, confirm: null }
      const r = timerAction(ctx, state, act, now)
      if (r.ok && r.events.length) await this.writeOn(day, laid, [...r.events, ...(q.kind === 'workEnd' ? [{ k: 'question.answer', at: now, question: q.id, answer, value: null }] : [])])
      return r
    }
    return this.serial(run)
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
    let passive = false
    for (const day of [addDays(today, -1), today]) {
      const read = await this.log.readDay(day)
      if (day !== today && !hasRunning(day, read.events)) continue
      const ctx = await this.dayContext(day, read, at)
      const state = computeDay(ctx)
      const n = powerNeedOf(ctx, state, { computer: this.o.computer, leads: this.leader.iLead, lastPresence: this.presence.own.lastPresence, lastInput, now: at })
      need = { system: need.system || n.system, display: need.display || n.display, reason: need.reason ?? n.reason }
      const t = timerNow(state)
      passive ||= n.system && [t.fg, ...t.bg].some((x) => x != null && placeOf(x.info.rules, x.info.variantId) === 'passive')
      if (day === today) this.disconnectedNow = state.facts.disconnect.some((d) => d.to === Number.POSITIVE_INFINITY)
    }
    this.passiveHold = passive
    return need
  }

  /** „Odcinam się” runs on today's day (by the last `powerNeed`): the guard never holds the lock of sleep then (T523). */
  disconnectedNow = false

  /** This computer holds the block of sleep of a passive block running now (by the last `powerNeed`, D331). */
  private passiveHold = false

  /** The screen unlocked: on the computer holding a passive block's sleep it is a presence for the sound's choice (D331). */
  noteUnlock(at = this.clock.now()): void {
    if (this.passiveHold) this.presence.update({ soundPresence: at })
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
    // The day before chosen – counted once, by the choice itself.
    const chosen = await this.barActiveDay(at)
    const day = chosen.day
    const read = chosen.read ?? (await this.log.readDay(day))
    const { ctx, state, activity } = chosen.bar ?? (await this.barDay(day, read, at, true))
    const rd = rdFrom(await this.recordView(paths.settings))
    const calibration = await this.calibrating(at)
    const today = logicalDayOf(at)
    return {
      ctx,
      state,
      energy: computeEnergy(ctx, state, { moduleOn: rd.general.modules.energy, calibration }),
      activity,
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
  energySignal(s: { signal: Signal } | { pool: Pool; delta: -10 | 0 | 10 }): Promise<void> {
    // One at a time with the clicks: both may write the ends laid over the day (D345).
    const run = async (): Promise<void> => {
      const at = this.clock.now()
      const day = logicalDayOf(at)
      const read = await this.log.readDay(day)
      // The state before it as the bar shows the day (D345): with the ends the app's close made, written first.
      const { ctx, state, laid } = await this.barDay(day, read, at)
      const before = computeEnergy(ctx, state).now
      const draft: EventDraft = 'signal' in s ? { day, dom: 'energy', k: 'energy.signal', at, signal: s.signal, before } : { day, dom: 'energy', k: 'energy.relative', at, pool: s.pool, delta: s.delta, before }
      const check = parseEvent(JSON.stringify({ ...draft, id: 'x', c: this.o.computer, n: 0, t: at, l: at, v: this.rulesVersion }))
      if (!check.ok) throw new Error(`sygnał: ${check.why}`)
      await this.writeOn(day, laid, [])
      this.append(draft)
      await this.log.flush()
    }
    return this.serial(run)
  }

  /** A Windows notification the leader showed (its stable id in the day's log: shown once, also after a restart). */
  markNotice(day: string, notice: string, at = this.clock.now()): void {
    this.append({ day, dom: 'meta', k: 'notice.shown', at, notice })
  }

  /** The timer of a day as this computer sees it now (for the bar of the main process and the tests). */
  async timer(day: string, at = this.clock.now()): Promise<ReturnType<typeof timerNow>> {
    const read = await this.log.readDay(day)
    return timerNow((await this.barDay(day, read, at)).state)
  }

  /**
   * A day's closing ritual as this computer sees it (spec „Rytuał zamknięcia”): its rows, what each ✓ changes, what
   * „Jak zapisano” changes, and how the day was closed – counted by the helper process (many counts of the day, T190).
   */
  async ritual(day: string, at = this.clock.now()): Promise<RitualView> {
    const read = await this.log.readDay(day)
    // The day as the bar shows it (D345: with the ends the app's close made) – counted in full only when something may be
    // laid over it (cheaply first, `mayLayOn`).
    const activity = await this.mayLayOn(day, read, at)
    const bar = activity ? await this.barDay(day, read, at, false, activity) : null
    const ctx = bar?.ctx ?? (await this.ownContext(day, read, at))
    const laid = bar?.laid ?? []
    // Counted again only when the day's log, its records or your queued edits changed – today also every minute (the
    // evening's effects count with the forecast to the bedtime) – or the ends laid over it.
    const key = JSON.stringify([day < logicalDayOf(at) ? null : Math.floor(at / 60_000), read.lastByComputer, read.events.length, read.copies, this.contextSig(day), this.queue.pending.length, laid.map((e) => e.id)])
    const was = this.ritualMemo.get(day)
    if (was?.key === key) return was.view
    const view = await (this.o.worker ?? inProcess).run({ kind: 'ritual', ctx, at })
    this.ritualMemo.set(day, { key, view })
    for (const d of this.ritualMemo.keys()) if (d < addDays(logicalDayOf(at), -RITUAL_MEMO_DAYS)) this.ritualMemo.delete(d)
    return view
  }

  /**
   * What the evening ritual of a day says about „Sprawy” (D383, D384, D402): the sprawy of its „Dziś” not done (back in „W
   * tym tygodniu” at 04:00), the tasks whose block ended without an answer to „Zadanie zrobione?”, on Sunday the number in
   * „Kiedyś / Może”. From the records as this computer sees them and the day as the bar and the ritual count it (D345:
   * `barDay`, with the ends the app's close made – cheaply first, `mayLayOn`), only its facts (the blocks that ended) –
   * cheap enough to need no memory (T771).
   */
  async casesRitual(day: string, at = this.clock.now()): Promise<CasesRitual> {
    const records = casesFrom(await this.collection('request'))
    const read = await this.log.readDay(day)
    const activity = await this.mayLayOn(day, read, at)
    const bar = activity ? await this.barDay(day, read, at, false, activity) : null
    const ctx = bar?.ctx ?? (await this.ownContext(day, read, at))
    return casesRitual(day, logicalDayOf(at), records, taskQuestions(ctx, dayFactsOf(day, ctx.events), records))
  }

  /** Your answer to a row of a day's ritual: judged on the day as it is now and written to its log, one at a time. */
  ritualAnswer(day: string, rowId: string, choice: string, value: RitualValue = null, item: string | null = null): Promise<DayActionResult> {
    return this.dayAction(day, (state, now, ctx) => {
      const row = ritualRows(state, ritualActivity(ctx, state)).find((r) => r.id === rowId)
      if (!row) return 'tego wiersza już nie ma'
      return ritualAnswer(state, row, choice, now, value, item, ctx.plan) ?? refusalOf(choice)
    })
  }

  /**
   * Closing a day: the evening ritual, or the morning's „Jak zapisano”, „Wolne”, „Nie pamiętam” (spec); `written` – the ids
   * of the events of the close, for its „Cofnij” (D468, T1081).
   */
  closeDay(day: string, how: CloseHow): Promise<DayActionResult> {
    return this.dayAction(day, (state, now) => (day > logicalDayOf(now) ? 'ten dzień jeszcze się nie zaczął' : (closeRefusal(state, how) ?? closeEvents(state, how, now))))
  }

  /**
   * „Cofnij” of a close (D468): an `undo` of each event of it (`ids` – what `closeDay` answered), judged on the day as you
   * see it now like the close itself (`dayAction`: one at a time, `barDay`, the day's logs read in full) – refused on a
   * frozen day, a close undone or gone, and while another close of the day stays (`closeUndoEvents`).
   */
  undoClose(day: string, ids: readonly string[]): Promise<DayActionResult> {
    return this.dayAction(day, (state, now, ctx) => closeUndoEvents(state, ctx.events, ids, now))
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

  /**
   * An action on a day's log judged on the day as you see it now – as the bar shows it (`barDay`, D345) – (a text:
   * refused, why), one at a time like clicks.
   */
  private dayAction(day: string, act: (state: DayState, now: number, ctx: DayContext) => TimerDraft[] | string): Promise<DayActionResult> {
    const run = async (): Promise<DayActionResult> => {
      if (!isIsoDate(day)) return { ok: false, why: 'zły dzień', confirm: null }
      const now = this.clock.now()
      const read = await this.log.readDay(day)
      if (!read.complete && !read.away) return { ok: false, why: 'nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę', confirm: null }
      const { ctx, state, laid } = await this.barDay(day, read, now)
      const r = act(state, now, ctx)
      if (typeof r === 'string') return { ok: false, why: r, confirm: null }
      const written = r.length ? await this.writeOn(day, laid, r) : []
      return { ok: true, events: r, confirm: null, written: written.map((e) => e.id) }
    }
    return this.serial(run)
  }

  /**
   * OneDrive's conflict copies of the records (spec „Kopie konfliktowe OneDrive są porównywane po treści”): the same
   * content goes, fields only one side has join, both versions go to the history; fields different on both sides stay
   * a question (`copyConflicts`) until you answer it. Every folder of records, the days of this year and the next.
   */
  private async joinCopies(day: string): Promise<void> {
    const year = Number(day.slice(0, 4))
    // Last year's days too (a copy of 31.12 seen on 1.01).
    const dirs = ['', ID_COLLECTIONS.template, ID_COLLECTIONS.schedule, ID_COLLECTIONS.request, ID_COLLECTIONS.routine, ID_COLLECTIONS.series, ID_COLLECTIONS.allDay, ID_COLLECTIONS.attachment, `days/${year - 1}`, `days/${year}`, `days/${year + 1}`]
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
        const r = await this.queue.exclusive(() => this.records.joinCopy(c.copy, c.canonical))
        if (r.joined) this.copyConflicts.delete(c.copy)
        else if (r.conflicts.length) this.copyConflicts.set(c.copy, { canonical: c.canonical, conflicts: r.conflicts })
      }
    }
    // A question goes only when its folder was looked at and the copy is not there any more (joined, removed).
    const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
    for (const k of [...this.copyConflicts.keys()]) if (scanned.has(dirOf(k)) && !seen.has(k)) this.copyConflicts.delete(k)
  }

  /**
   * The leader's deletion of attachments (D410, T806): at most once per `ATTACHMENT_SWEEP_MS`, every record removed 30
   * days ago or more – its folder attachments/<id>/ first, then the record (its last version stays in the history). A
   * listing that fails deletes nothing (unknown is never empty); a record that cannot be read now, is broken, or has an
   * edit of this computer still in the queue („Cofnij”) is left; each is read again before it goes, beside the queue
   * (`queue.exclusive`). Answers how many went.
   */
  async attachmentSweep(now = this.clock.now(), problems: string[] = []): Promise<number> {
    if (this.lastAttachmentSweep != null && now - this.lastAttachmentSweep < ATTACHMENT_SWEEP_MS) return 0
    const dir = ID_COLLECTIONS.attachment
    // Tried again in an hour also after a listing that failed (no warning every 15 s; 30 days are not counted to the minute).
    this.lastAttachmentSweep = now
    const entries = await this.o.fs.list(join(this.o.dataDir, dir))
    const files = this.o.attachmentFiles ?? nodeAttachmentFiles
    let gone = 0
    for (const e of entries) {
      if (e.dir || !e.name.endsWith('.json')) continue
      const rel = `${dir}/${e.name}`
      const c = classify(rel)
      if (!c || c.conflict || c.kind !== 'attachment' || !c.id) continue
      const id = c.id
      if (this.queue.relsUnder(dir).includes(rel)) continue
      try {
        const done = await this.queue.exclusive(async () => {
          const r = await this.records.read(rel)
          const a = r.status === 'ok' ? attachmentFrom(r.value) : null
          if (!a || !purgeDue(a, now) || this.queue.relsUnder(dir).includes(rel)) return false
          await files.removeDir(this.o.dataDir, id)
          await this.records.remove(rel)
          return true
        })
        if (done) gone++
      } catch (err) {
        problems.push(`załącznik ${id}: ${String(err)}`)
      }
    }
    if (gone) this.o.log?.('info', `załączniki: usunięto ${gone} (30 dni po usunięciu)`)
    return gone
  }

  /** Your answer to a conflict copy: „mine” – the file's values, „theirs” – the copy's; then the copy goes. */
  async resolveCopy(copyRel: string, choice: 'mine' | 'theirs'): Promise<void> {
    const q = this.copyConflicts.get(copyRel)
    if (!q) return
    const r = await this.queue.exclusive(() => this.records.joinCopy(copyRel, q.canonical, () => choice))
    if (r.joined) this.copyConflicts.delete(copyRel)
  }

  /**
   * What the bar says quietly of the computers (A8-02, A8-07): OneDrive not running here, leading without it (the others'
   * questions may come too), a computer seen with a fresh presence that stopped refreshing it, a clock ahead. `battery` –
   * the main process's own (the power of this computer).
   */
  syncState(now = this.clock.now()): Omit<SyncState, 'battery' | 'backupFailed'> {
    const name = (p: Peer) => p.presence.name || p.presence.computer
    const oneDriveDown = !this.o.oneDriveRunning()
    const awake = this.peers.filter((p) => p.presence.state !== 'closed')
    return {
      oneDriveDown,
      sharedWith: oneDriveDown && this.leader.iLead ? awake.map(name) : [],
      // Taken for asleep only as the rules of leading take it: with OneDrive running here and the computer settled (after a
      // wake the others' files come first).
      asleep: oneDriveDown || !this.settle.settled(now) ? [] : awake.filter((p) => this.freshSeen.has(p.presence.computer) && now - p.fileSeenAt >= SILENT_MS).map((p) => ({ id: p.presence.computer, name: name(p), since: p.fileSeenAt })),
      clockAhead: this.peers.filter((p) => this.presence.clockAhead.has(p.presence.computer)).map((p) => ({ id: p.presence.computer, name: name(p), minutes: Math.round(this.presence.clockAhead.get(p.presence.computer)! / 60_000) })),
      dayAhead: this.dayAhead,
      // Changes waiting: while the folder is away, or for long with it there (A3-07).
      unsynced: this.unavailable || (this.unsyncedSince != null && now - this.unsyncedSince >= UNSYNCED_SAY_MS) ? this.unsynced : 0,
      folderAway: this.unavailable
    }
  }

  /** The bar's tones play here (spec „Włączony dźwięk gra na jednym komputerze”, A8-04); `recorders` – recording a lecture now. */
  soundHere(recorders: readonly string[], now = this.clock.now()): boolean {
    return soundComputer({ now, self: { computer: this.o.computer, lastPresence: this.presence.own.lastPresence, soundPresence: this.presence.own.soundPresence }, peers: this.peers, leader: this.leader.leader, recorders, oneDriveRunning: this.o.oneDriveRunning() }) === this.o.computer
  }

  /**
   * The computers for the settings (A3-13): this one first, then every other that wrote a presence – when this computer
   * last saw its file change (its own clock), its state, whether it is forgotten, its „last presence” (kept when it is
   * forgotten: a change of it means it is used again).
   */
  async computerList(): Promise<ComputerRow[]> {
    const own = this.presence.own
    // As you see rd.json – your „Zapomnij” shows at once, before the folder holds it.
    const forgotten = rdFrom(await this.recordView(paths.settings).catch(() => undefined)).forgotten
    return [
      { id: this.o.computer, name: this.o.computerName, self: true, seenAt: null, state: own.state, forgotten: false, lastPresence: own.lastPresence },
      ...this.presence.all().map((s) => {
        const f = forgotten[s.presence.computer]
        return { id: s.presence.computer, name: s.presence.name || s.presence.computer, self: false, seenAt: s.fileSeenAt, state: s.presence.state, forgotten: !!f && stillForgotten(f.lastPresence, s.presence.lastPresence), lastPresence: s.presence.lastPresence }
      })
    ]
  }

  /**
   * The computers that wrote a presence, this one first (names as each computer calls itself); another computer present
   * (not forgotten) carries the version of its app – the warning of a long note (D388) needs it.
   */
  get computers(): Array<{ id: string; name: string; appVersion?: string }> {
    // Forgotten ones too: their names stay in the history and on the lectures they record (A3-13 review).
    const out: Array<{ id: string; name: string; appVersion?: string }> = [{ id: this.o.computer, name: this.o.computerName }]
    for (const s of this.presence.all()) if (s.presence.computer !== this.o.computer) out.push({ id: s.presence.computer, name: s.presence.name || s.presence.computer, ...(s.forgotten ? {} : { appVersion: s.presence.appVersion }) })
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

  /**
   * Your own changes not yet in the folder (spec „N zmian zapisze się po powrocie folderu”, A3-07): your events not in its
   * logs (no bookkeeping of the app's own – A3-07 review) and the queue's edits waiting for the folder – none that waits for
   * your answer (`answerBound`: a question, one behind it for its file, one that goes with these – T927).
   */
  get unsynced(): number {
    const asked = this.queue.answerBound()
    return this.log.pendingEvents + this.queue.pending.filter((e) => !asked.has(e.id)).length
  }

  /**
   * The oldest of those changes (ms, null: none): one waiting longer than `UNSYNCED_SAY_MS` with the folder there (a file
   * held by OneDrive or an antivirus, a share failing) is said too – nothing pretends to be saved.
   */
  get unsyncedSince(): number | null {
    const asked = this.queue.answerBound()
    const times = [this.log.pendingSince, ...this.queue.pending.filter((e) => !asked.has(e.id)).map((e) => e.at)].filter((x): x is number => x != null)
    return times.length ? Math.min(...times) : null
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
