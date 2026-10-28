/**
 * The data folder for the main window (E3): which folder this computer works in (chosen in the wizard, kept in its
 * config.json; RD_DATA_DIR wins in tests and the developer's version), whether it is open, and what the window reads and
 * does with it – the records with your queued edits laid over them, a day with its log, edits through the queue, actions
 * as events of the log, the questions of the queue, the history of records, the wizard's end.
 *
 * The folder's own work (presence, who leads, the leader's tasks, backups) stays in DataService; this only opens and
 * closes it and answers the window.
 */
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { BackupRecord, CalibrationScreen, ComputerRow, DataView, DayData, EditEntry, EditOutcome, EditQuestion, EventIn, FolderProbe, GameScreen, HistoryRecord, HistoryVersion, MovedTo, RawRecord, RequestCounters, RestoreOutcome, TimerIn, TimerResult, UnclosedDay } from '@shared/api'
import type { RitualValue, RitualView } from '@shared/engine/ritual'
import type { CloseHow } from '@shared/model/events'
import { deepEqual, diffRecords } from '@shared/data/merge'
import { classify, ID_COLLECTIONS, paths, SETTINGS_FILE, type IdKind } from '@shared/data/paths'
import type { HolidayLookup } from '@shared/engine/createDay'
import { CSV_HEADERS } from '@shared/engine/csv'
import { reviewPrompt } from '@shared/engine/calibration'
import type { SideB } from '@shared/engine/sideB'
import { keptOnRestore, rdFrom } from '@shared/model/rd'
import { requestCounters } from '@shared/engine/requests'
import type { AnyEvent } from '@shared/model/events'
import { logicalDayOf, weekStart } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import { compareVersions } from '@shared/update'
import { writeFileAtomic } from '../datastore/atomic'
import { backupEntries, createUpdateBackup, listBackups, readBackupFiles, restoreToFolder, type BackupInfo } from './backup'
import { BEHIND_QUESTION } from './editQueue'
import type { DataFolder, TimerClick } from './folder'
import { nodeFs, type DataFs } from './fsio'
import { historyKey } from './records'
import { DataService, STOP_TIMEOUT_MS, type ServiceOptions } from './service'

export interface HubOptions {
  userData: string
  computer: () => string
  computerName: string
  /** Windows' own id of this computer (its presence names it, A3-05). */
  windowsId?: () => string | null
  appVersion: string
  runId: string
  holidays: HolidayLookup
  idleSeconds: () => number
  /** The main window or the icon's panel has the focus (input then is not use). */
  appFocused?: () => boolean
  /** OneDrive runs in this session (the helper). */
  oneDriveRunning?: () => boolean
  /** What this computer must hold against sleep (after every check). */
  onPower?: ServiceOptions['onPower']
  /** The versions that ran here (into the presence). */
  versions?: ServiceOptions['versions']
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  writeGuardPlan: boolean
  extraBackupDir: () => string | null
  /** The version that ran here before this one (config.json): a newer one backs the folder up before opening it. */
  previousVersion: () => string | null
  /** The folder opened by this version, its backup before the update there (config.json's `dataVersion`, A3-17). */
  dataOpened?: (version: string) => void
  /** Something the window shows changed (the hub tells it once per change of what it would read). */
  onChange: () => void
  /** Starts the folder's service (tests: a slow or failing folder). */
  start?: (o: ServiceOptions) => Promise<DataService>
  /** The helper process for the heavy work (T190). */
  worker?: ServiceOptions['worker']
  /** The first day of the ritual (none before its screens, T482). */
  ritualFrom?: string | null
  /** The ritual's screens: its first day from rd.json (D320). */
  ritualScreens?: boolean
  /** The first day in the game (none before its screens, T492). */
  gameFrom?: string | null
  /** The game's screens: its first day from rd.json (T509). */
  gameScreens?: boolean
  /** This computer now works in another folder (a whole backup restored into a new one): its config remembers it. */
  onFolder?: (dir: string) => void
}

/** `a` is a newer version than `b` (versions that cannot be compared: no). */
function isNewer(a: string, b: string): boolean {
  try {
    return compareVersions(a, b) > 0
  } catch {
    return false
  }
}

/** The questions of conflict copies have ids of their own (the copy's path after this). */
const COPY_PREFIX = 'copy:'

/** A folder that did not open is tried again this often (spec: „ponawia otwarcie co 30 s”). */
const RETRY_MS = 30_000

/** A question in the window counts as seen when this computer had input this recently (presence at it). */
const SEEN_PRESENCE_MS = 60_000

/** Files OneDrive and Windows put in any folder: they do not make it „not empty”. */
const NOISE = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])

/** The marker „przeniesiono do …” in a folder whose backup was restored into a new one (hidden: never in a backup). */
export const MOVED_FILE = '.moved.json'
/** In this computer's app data: a restored backup whose folder did not open yet – it waits there also after a restart. */
export const PENDING_MOVE_FILE = 'pending-move.json'

/** Where a record kind of the history lives. */
function relOf(kind: string, id: string): string | null {
  if (kind === 'settings') return SETTINGS_FILE
  if (kind === 'day') return isIsoDate(id) ? paths.day(id) : null
  if (kind in ID_COLLECTIONS) return paths.record(kind as IdKind, id)
  return null
}

const isPlain = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v)

/** A record a backup can give back one by one: settings, templates, lectures, requests, routines, days. */
function isRecordRel(rel: string): boolean {
  const c = classify(rel)
  return !!c && !c.conflict && c.kind !== 'log' && c.kind !== 'presence' && c.kind !== 'grades'
}

/** `dir` is `root` or lies inside it (Windows: letters of either case). */
export function within(dir: string, root: string): boolean {
  const r = relative(resolve(root), resolve(dir))
  return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r))
}

export class DataHub {
  status: DataView['status'] = 'none'
  folder: string | null = null
  error: string | null = null
  service: DataService | null = null
  private opening: Promise<boolean> | null = null
  private closing = false
  private lastSignature = ''
  private retry: ReturnType<typeof setTimeout> | null = null
  private backedUp = false
  private openingDir: string | null = null
  /** The app quits: nothing opens any more. */
  private shutdown = false
  /**
   * A whole backup restored into a new folder that did not open yet (then the old one gets its marker): the window offers
   * „Spróbuj ponownie” with why it did not open.
   */
  private moving: { from: string | null; to: string; at: number; error: string | null } | null = null
  /** Why the last opening failed (also when the folder before stayed open). */
  private lastOpenError: string | null = null
  /** The waiting move of a restored backup was looked for (once, at the first folder opened). */
  private pendingLoaded = false

  constructor(private readonly o: HubOptions) {}

  /**
   * The folder this computer will open as soon as the start allows (it opens beside the rest of the start): from now
   * the window shows „opening”, never the wizard of a computer without a folder (no flash of a wrong view).
   */
  expect(dir: string): void {
    if (this.status !== 'none') return
    this.status = 'opening'
    this.folder = dir
  }

  /**
   * This computer's own settings (config.json) cannot be read now, so the folder it works in is unknown: „failed”, never
   * the wizard of a computer without a folder (it would start a second folder beside the real one). The config is read
   * again by itself; then `open` or `noFolder`.
   */
  unknownFolder(why: string): void {
    if (this.status !== 'none') return
    this.status = 'failed'
    this.error = why
    this.changed()
  }

  /** The settings read at last, without a folder in them: a computer without a folder after all (the wizard). */
  noFolder(): void {
    if (this.status !== 'failed' || this.folder !== null) return
    this.status = 'none'
    this.error = null
    this.changed()
  }

  /**
   * Opens `dir` (the data folder chosen here); a folder that cannot be opened leaves the app working without it. An
   * opening of another folder under way (a retry of the one before) finishes first – this one opens after it, never
   * answered by it.
   */
  open(dir: string): Promise<boolean> {
    if (this.shutdown) return Promise.resolve(false)
    if (this.opening && this.openingDir === dir) return this.opening
    if (!this.opening && this.status === 'open' && this.folder === dir && this.service) return Promise.resolve(true)
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    const before = this.opening ?? Promise.resolve(false)
    this.openingDir = dir
    const run = before
      .catch(() => false)
      .then(() => this.openNow(dir))
      .finally(() => {
        if (this.opening === run) {
          this.opening = null
          this.openingDir = null
        }
      })
    this.opening = run
    return run
  }

  private async openNow(dir: string): Promise<boolean> {
    if (this.shutdown) return false
    // Another folder open before (the wizard, „Przejdź”, a restored backup): it keeps working until the new one opens and
    // closes only after (spec „najpierw otwiera nowy folder, a stary zamyka dopiero po sukcesie”).
    const old = this.service
    const oldFolder = this.folder
    this.status = 'opening'
    this.folder = dir
    this.error = null
    this.lastOpenError = null
    this.changed()
    try {
      // A folder that is not there (OneDrive not ready yet): nothing is created in its place (spec „W niedostępnym folderze
      // niczego nie tworzy”) – it is tried again.
      const st = await stat(dir).catch(() => null)
      if (!st?.isDirectory()) throw new Error('folder jest niedostępny')
      // The first opening by a newer version: a backup before it touches anything (the data still in the old format).
      const prev = this.o.previousVersion()
      const due = !!prev && isNewer(this.o.appVersion, prev)
      if (due && !this.backedUp) {
        const r = await createUpdateBackup(dir, join(dir, 'backups'), prev, this.o.appVersion)
        // Made (or there already): not again; failed: tried again at the next opening.
        if (!r || r.ok) this.backedUp = true
        if (r?.ok) this.o.log('info', `kopia przed aktualizacją ${prev} → ${this.o.appVersion}: ${r.files} plików`)
        else if (r) this.o.log('error', `kopia przed aktualizacją nie powiodła się: ${r.error}`)
      }
      // Only with the backup there the folder counts as this version's: a session that never opened it (OneDrive not
      // ready after a night's install) leaves the backup to the next one (A3-17).
      if (!due || this.backedUp) this.o.dataOpened?.(this.o.appVersion)
      const s = await (this.o.start ?? ((o: ServiceOptions) => DataService.start(o)))({
        dataDir: dir,
        userData: this.o.userData,
        computer: this.o.computer(),
        computerName: this.o.computerName,
        windowsId: this.o.windowsId?.() ?? null,
        appVersion: this.o.appVersion,
        runId: this.o.runId,
        holidays: this.o.holidays,
        idleSeconds: this.o.idleSeconds,
        appFocused: this.o.appFocused,
        oneDriveRunning: this.o.oneDriveRunning,
        onPower: this.o.onPower,
        versions: this.o.versions,
        log: this.o.log,
        writeGuardPlan: this.o.writeGuardPlan,
        extraBackupDir: this.o.extraBackupDir,
        worker: this.o.worker,
        ritualFrom: this.o.ritualFrom ?? null,
        ritualScreens: this.o.ritualScreens === true,
        gameFrom: this.o.gameFrom ?? null,
        gameScreens: this.o.gameScreens === true,
        onChecked: () => this.changed()
      })
      if (this.closing || this.shutdown) {
        await s.stop('quit')
        return false
      }
      this.service = s
      this.status = 'open'
      if (old) {
        await old.stop('quit')
        // Its stop let the computer sleep: the new folder says at once what it holds.
        s.hint()
      }
      void s.refreshGuardPlan()
      this.o.log('info', `folder danych otwarty: ${dir}`)
      await this.loadPendingMove(dir)
      this.changed()
      return true
    } catch (e) {
      this.lastOpenError = e instanceof Error ? e.message : String(e)
      this.o.log('error', `folder danych ${dir} nie otworzył się`, e)
      if (old && this.service === old) {
        // The folder before stays as it was – nothing of it closed.
        this.status = 'open'
        this.folder = oldFolder
        this.changed()
        return false
      }
      this.status = 'failed'
      this.error = this.lastOpenError
      this.changed()
      // OneDrive not ready at the start: the app tries again every 30 s by itself (spec „czekam na folder”).
      if (!this.closing && !this.shutdown) {
        this.retry = setTimeout(() => {
          this.retry = null
          if (this.status === 'failed' && this.folder === dir) void this.open(dir)
        }, RETRY_MS)
        this.retry.unref?.()
      }
      return false
    }
  }

  /**
   * Closes the folder (the quit waits for it within its limit): also while it is still opening – the opening then stops
   * the folder it opened at once.
   */
  async close(why: 'quit' | 'system'): Promise<void> {
    // The quit: for good – an opening that ends after the wait below (a slow folder, the backup before an update) stops
    // the folder it opened, and no retry is armed any more.
    this.shutdown = true
    this.closing = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    try {
      if (this.opening) await Promise.race([this.opening, new Promise((r) => setTimeout(r, STOP_TIMEOUT_MS))])
      const s = this.service
      this.service = null
      if (s) await s.stop(why)
    } finally {
      this.closing = false
    }
  }

  /** The window reads again only when what it would read changed (every check of the folder calls this). */
  changed(): void {
    void this.signature()
      .then((sig) => {
        if (sig === this.lastSignature) return
        this.lastSignature = sig
        this.o.onChange()
      })
      .catch(() => this.o.onChange())
  }

  private async signature(): Promise<string> {
    const f = this.service?.folder
    const head = `${this.status}|${this.folder}|${this.error}|${JSON.stringify(this.pendingMove())}`
    if (!f) return head
    const today = logicalDayOf(f.clock.now())
    const read = await f.readDay(today)
    // The day files the window reads with today (yesterday's and tomorrow's beside it): a change of the plan made on
    // another computer reaches the window like a change of the settings.
    const days = await Promise.all([-1, 0, 1].map((d) => f.recordView(paths.day(addDays(today, d))).catch((e: unknown) => `?${String(e)}`)))
    // The marker „przeniesiono do …” OneDrive brings from another computer shows without any other change.
    const moved = await this.movedTo()
    return `${head}|${today}|${JSON.stringify(await this.records())}|${JSON.stringify(days)}|${read.events.length}|${f.unsynced}|${f.queue.questions().length}|${f.copyConflicts.size}|${f.leader.leader}|${JSON.stringify(moved)}`
  }

  private async records(): Promise<Pick<DataView, 'rd' | 'templates' | 'lectures' | 'requests' | 'routines'>> {
    const f = this.service?.folder
    if (!f) return { rd: null, templates: [], lectures: [], requests: [], routines: [] }
    const settled = async <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
    return {
      rd: (await settled(f.recordView(SETTINGS_FILE), undefined)) ?? null,
      templates: await settled(f.collection('template'), []),
      lectures: await settled(f.collection('schedule'), []),
      requests: await settled(f.collection('request'), []),
      routines: await settled(f.collection('routine'), [])
    }
  }

  async view(): Promise<DataView> {
    const f = this.service?.folder
    const records = await this.records()
    const problems = f ? [...f.records.problems.entries()].map(([rel, why]) => `${rel}: ${why}`) : []
    if (f) {
      // rd.json there but not readable now: the window must not take its defaults for it (a change waits for it).
      try {
        await f.recordView(SETTINGS_FILE)
      } catch (e) {
        problems.push(`${SETTINGS_FILE}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const questions = f ? await this.questions() : []
    return {
      status: this.status,
      folder: this.folder,
      error: this.error,
      computer: this.o.computer(),
      computerName: this.o.computerName,
      ...records,
      computers: f?.computers ?? [{ id: this.o.computer(), name: this.o.computerName }],
      unsynced: f?.unsynced ?? 0,
      questions,
      problems,
      leader: f?.leader.leader ?? null,
      today: logicalDayOf(f ? f.clock.now() : Date.now()),
      calibration: f ? await f.calibrating() : false,
      moved: f ? await this.movedTo() : null,
      pendingMove: this.pendingMove()
    }
  }

  /** The restored backup's folder that did not open (once tried): where it is and why. */
  private pendingMove(): DataView['pendingMove'] {
    const m = this.moving
    return m?.error != null ? { to: m.to, error: m.error } : null
  }

  private async questions(): Promise<EditQuestion[]> {
    const f = this.service!.folder
    const out: EditQuestion[] = []
    for (const { edit, outcome } of f.queue.questions()) {
      // The file's own stamp of its last save (written with every edit), for „Przyjmij nowsze”.
      const now = await f.records.read(edit.rel).catch(() => null)
      const theirsAt = now?.status === 'ok' && typeof now.value.updatedAt === 'number' ? now.value.updatedAt : null
      out.push({
        id: edit.id,
        rel: edit.rel,
        kind: outcome.status === 'conflict' ? 'conflict' : outcome.status === 'removedElsewhere' ? 'removed' : 'broken',
        at: edit.at,
        theirsAt,
        fields: outcome.status === 'conflict' ? outcome.fields.map((x) => ({ path: x.path, mine: x.value, theirs: x.now })) : edit.edits.map((x) => ({ path: x.path, mine: x.value, theirs: undefined }))
      })
    }
    // OneDrive's conflict copies with fields different on both sides: the file („tutaj”) against the copy („tam”).
    for (const [copy, q] of f.copyConflicts) {
      const st = await f.records.read(copy).catch(() => null)
      const theirsAt = st?.status === 'ok' && typeof st.value.updatedAt === 'number' ? st.value.updatedAt : null
      const now = await f.records.read(q.canonical).catch(() => null)
      const mineAt = now?.status === 'ok' && typeof now.value.updatedAt === 'number' ? now.value.updatedAt : 0
      out.push({ id: `${COPY_PREFIX}${copy}`, rel: q.canonical, kind: 'conflict', at: mineAt, theirsAt, fields: q.conflicts.map((c) => ({ path: c.path, mine: c.mine, theirs: c.theirs })) })
    }
    return out
  }

  private need() {
    const f = this.service?.folder
    if (!f) throw new Error('Folder danych nie jest otwarty.')
    return f
  }

  async day(date: string): Promise<DayData> {
    if (!isIsoDate(date)) throw new Error('data dnia')
    const f = this.need()
    const read = await f.readDay(date)
    let unknown = false
    const file = async (d: string, main = false) => {
      try {
        return (await f.recordView(paths.day(d))) ?? null
      } catch {
        // There but not readable now: never shown as a day without changes (and never edited as a new one).
        if (main) unknown = true
        return null
      }
    }
    const dayFile = await file(date, true)
    return { date, dayFile, nextFile: await file(addDays(date, 1)), prevFile: await file(addDays(date, -1)), events: read.events, complete: read.complete && !unknown, unknown }
  }

  async dayFiles(dates: string[]): Promise<Record<string, RawRecord | null>> {
    const f = this.need()
    const out: Record<string, RawRecord | null> = {}
    // A file that cannot be read now is left out: unknown is never „no file” (an edit made against nothing would meet it).
    for (const d of dates.slice(0, 62)) {
      if (!isIsoDate(d)) continue
      try {
        out[d] = (await f.recordView(paths.day(d))) ?? null
      } catch {
        /* unreadable now */
      }
    }
    return out
  }

  async edit(entries: EditEntry[]): Promise<EditOutcome[]> {
    const f = this.need()
    const clean = entries.map((e) => {
      const c = classify(e.rel)
      if (!c || c.conflict || c.kind === 'log' || c.kind === 'presence' || c.kind === 'grades') throw new Error(`nie można edytować ${e.rel}`)
      return { rel: c.canonical, edits: e.edits.map((x) => ({ path: x.path.map(String), base: x.base, value: x.value })), create: e.create === true, remove: e.remove === true }
    })
    const out = await f.edit(clean)
    this.changed()
    return out.map((o) => ({ status: o.status, ...(o.status === 'waiting' ? { why: o.why } : {}) }))
  }

  async events(drafts: EventIn[]): Promise<void> {
    await this.need().userEvents(drafts)
    this.changed()
  }

  /**
   * A click of the timer (spec „Akcje widgetu wykonuje proces główny”): written at once, then a check of the folder, so
   * the leader's automatic consequences (a fixed block waiting behind a regeneration, the boundary) follow without 15 s.
   */
  async timer(click: TimerIn): Promise<TimerResult> {
    const r = await this.need().timerClick(click as TimerClick)
    if (click.probe) return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
    this.changed()
    if (r.ok) void this.service?.tick()
    return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
  }

  /** A day's ritual (D318) – counted by the helper process. */
  ritual(day: string): Promise<RitualView> {
    return this.need().ritual(day)
  }

  /** An answer to a row of a day's ritual, written to its log. */
  async ritualAnswer(day: string, row: string, choice: string, value: RitualValue, item: string | null): Promise<TimerResult> {
    const r = await this.need().ritualAnswer(day, row, choice, value, item)
    this.changed()
    // The leader's own effects of an answer (an automatic end undone, the end of work) at once, not at the next check.
    if (r.ok) void this.service?.tick()
    return { ok: r.ok, why: r.ok ? null : r.why, confirm: null }
  }

  /** A day closed (the ritual, „Jak zapisano”, „Wolne”, „Nie pamiętam”). */
  async closeDay(day: string, how: CloseHow): Promise<TimerResult> {
    const r = await this.need().closeDay(day, how)
    this.changed()
    if (r.ok) void this.service?.tick()
    return { ok: r.ok, why: r.ok ? null : r.why, confirm: null }
  }

  /** The computers of the folder for the settings (A3-13); without a folder only this one. */
  computerList(): ComputerRow[] {
    return this.service?.folder?.computerList() ?? [{ id: this.o.computer(), name: this.o.computerName, self: true, seenAt: null, state: 'used', forgotten: false, lastPresence: null }]
  }

  /** The days the morning shows to close, each with its ritual (from the ritual's first day, D320). */
  async unclosedDays(): Promise<UnclosedDay[]> {
    const f = this.need()
    const from = await f.ritualDay()
    const out: UnclosedDay[] = []
    const open = await f.unclosedDays(from)
    // A day that cannot be counted now (its log not readable) waits; the others are shown.
    for (const d of open) {
      const ritual = await f.ritual(d.date).catch(() => null)
      if (ritual) out.push({ ...d, closed: false, ritual })
    }
    // Yesterday closed, with what came after the close (spec „rano widać je w jednym wierszu informacji”).
    const yesterday = addDays(logicalDayOf(f.clock.now()), -1)
    if (from && yesterday >= from && !open.some((d) => d.date === yesterday)) {
      const ritual = await f.ritual(yesterday).catch(() => null)
      if (ritual?.closed && ritual.rows.some((r) => r.afterClose)) out.push({ date: yesterday, presence: true, closed: true, ritual })
    }
    return out
  }

  /**
   * The game for the window (D322): the streak, the notes, the room, the cassettes, and the full-screen celebrations not
   * shown on this computer yet; null – no game (before its first day is written, no ritual yet).
   */
  game(): Promise<GameScreen | null> {
    const f = this.need()
    // One count at a time for the window's asks (every change of the data, every minute): a slow first count – days
    // graded by the helper process – is never started again beside itself.
    if (this.gameRun?.folder === f) return this.gameRun.run
    const run = (async () => {
      const view = await f.gameState()
      if (!view) return null
      return { ...view, due: await f.celebrationsDue(view, logicalDayOf(f.clock.now())) }
    })().finally(() => {
      if (this.gameRun?.run === run) this.gameRun = null
    })
    this.gameRun = { folder: f, run }
    return run
  }

  private gameRun: { folder: DataFolder; run: Promise<GameScreen | null> } | null = null

  /** Celebrations the main window showed (or let go): never again on this computer. */
  celebrated(keys: readonly string[]): Promise<void> {
    return this.need().markCelebrated(keys)
  }

  /** „Strona B tygodnia” of the week that ended (spec „Plan poranny”): its days and the week before, each as its grade counts it. */
  sideB(): Promise<SideB> {
    return this.need().sideB()
  }

  /**
   * The calibration (spec „Kalibracja”): its period, the proposals of its review with the felt cost gathered, and where
   * the review waits today – the morning plan, the settings after 3 × „Nie teraz” (D119), or nowhere.
   */
  async calibration(): Promise<CalibrationScreen> {
    const f = this.need()
    const c = await f.calibration()
    // rd.json not readable now: its review's state is unknown – proposed nowhere (a review done would come back).
    const raw = await f.recordView(SETTINGS_FILE).then(
      (v) => ({ ok: true as const, v }),
      () => ({ ok: false as const, v: undefined })
    )
    const review = rdFrom(raw.v).calibrationReview
    const prompt = raw.ok ? reviewPrompt(c.period, logicalDayOf(f.clock.now()), { deferrals: review.deferrals, reviewed: review.reviewed != null }) : 'none'
    return { ...c, prompt, ...review }
  }

  /** Your answer to a question of the timer (its id names its day). */
  async answer(id: string, answer: string, value: number | null): Promise<TimerResult> {
    const r = await this.need().answer(id, answer, value)
    this.changed()
    if (r.ok) void this.service?.tick()
    return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
  }

  /**
   * Questions the window showed (spec D231: seen only in the open icon's panel or the main window in the foreground with
   * presence at this computer): written when this computer had input in the last minute.
   */
  async seen(ids: string[], how: 'panel' | 'main' | 'notification' | 'bar'): Promise<number> {
    const s = this.service
    if (!s || !ids.length) return 0
    const last = s.lastInput
    if (how !== 'notification' && how !== 'bar' && (last == null || s.folder.clock.now() - last > SEEN_PRESENCE_MS)) return 0
    const n = await s.folder.markSeen(ids.slice(0, 20), how)
    if (n) this.changed()
    return n
  }

  /** A click of the desktop bar or the icon (input in the next 10 s is the app's own). */
  clickedApp(): void {
    this.service?.clickedApp()
  }

  async resolve(id: string, choice: 'mine' | 'theirs'): Promise<void> {
    const f = this.need()
    if (id.startsWith(COPY_PREFIX)) {
      await f.resolveCopy(id.slice(COPY_PREFIX.length), choice)
      this.changed()
      return
    }
    const q = f.queue.questions().find((x) => x.edit.id === id)
    let restoreFrom: RawRecord | undefined
    // A record removed elsewhere comes back from its last version in the history, your fields laid over it.
    if (q && q.outcome.status === 'removedElsewhere' && choice === 'mine') {
      const c = classify(q.edit.rel)
      if (c) {
        const { kind, id: rid } = historyKey(c)
        const last = (await f.history.list(kind, rid))[0]
        if (isPlain(last?.record)) restoreFrom = last.record
      }
    }
    await f.queue.resolve(id, choice, restoreFrom)
    await f.queue.apply(f.records)
    this.changed()
  }

  async monthEvents(month: string, kinds: string[]): Promise<unknown[]> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('miesiąc')
    return this.need().monthEvents(month, kinds)
  }

  /**
   * The counters of requests – today, this week (from Monday), per person in the week – from the logs of the days (T479,
   * A6-03): requests from the bar are there, the queue's estimates are not the time. `complete` false: a day's logs could
   * not all be read now (the numbers may be short).
   */
  async requestCounters(): Promise<RequestCounters> {
    const f = this.need()
    const now = f.clock.now()
    const today = logicalDayOf(now)
    const from = weekStart(today)
    const dates: string[] = []
    for (let d = from; d <= today; d = addDays(d, 1)) dates.push(d)
    // The days of the week read side by side (a slow folder never waits for seven reads in a row).
    const reads = await Promise.all(dates.map(async (date) => ({ date, read: await f.readDay(date) })))
    const days = reads.map(({ date, read }) => ({ date, events: read.events as AnyEvent[] }))
    return { ...requestCounters(days, today, from, now), complete: reads.every((r) => r.read.complete) }
  }

  async historyList(): Promise<HistoryRecord[]> {
    const f = this.need()
    const out: HistoryRecord[] = []
    for (const r of await f.history.records()) {
      const rel = relOf(r.kind, r.id)
      const exists = rel ? (await f.recordView(rel).catch(() => undefined)) !== undefined : false
      out.push({ ...r, rel, exists })
    }
    return out
  }

  async historyVersions(kind: string, id: string): Promise<HistoryVersion[]> {
    return (await this.need().history.list(kind, id)).map((v) => ({ file: v.file, savedAt: v.savedAt, savedBy: v.savedBy, reason: v.reason, record: v.record }))
  }

  /** A version from the history becomes the record again: your edit of the fields it differs in (or the record anew). */
  async historyRestore(kind: string, id: string, file: string): Promise<EditOutcome[]> {
    const f = this.need()
    const rel = relOf(kind, id)
    if (!rel) throw new Error('nieznany rekord')
    const v = (await f.history.list(kind, id)).find((x) => x.file === file)
    if (!v || !isPlain(v.record)) throw new Error('nie ma takiej wersji')
    const entry = await this.restoreEntry(rel, v.record)
    return entry ? this.edit([entry]) : []
  }

  /** The edit that makes `rel` hold `value` again: the fields it differs in, or the record anew; null – the same already. */
  private async restoreEntry(rel: string, value: RawRecord): Promise<EditEntry | null> {
    const now = await this.need().recordView(rel)
    // The days written once (the ritual's and the game's first, D320, T509) and the review's state: an older version of
    // rd.json never takes them away nor back (T504, A3-02) – the game would start again, a done review be proposed again.
    if (rel === SETTINGS_FILE && now) value = keptOnRestore(now, value)
    const entry: EditEntry = now
      ? { rel, edits: diffRecords(now, value).map((c) => ({ path: c.path, base: c.before, value: c.after })) }
      : { rel, create: true, edits: Object.entries(value).map(([k, x]) => ({ path: [k], base: undefined, value: x })) }
    return entry.edits.length ? entry : null
  }

  /** The backups of the open folder, newest first (spec „Kopie zapasowe”). */
  async backups(): Promise<BackupInfo[]> {
    if (!this.folder) return []
    return listBackups(join(this.folder, 'backups'))
  }

  /** The records a backup holds that can be taken back one by one (settings, templates, lectures, requests, routines, days). */
  async backupRecords(zipFile: string): Promise<string[]> {
    return (await backupEntries(zipFile)).filter(isRecordRel)
  }

  /**
   * The records of a backup as the window lists them (D321): each with its kind and what names it in the interface –
   * a day its date, a template, routine or lecture its name, a request its note, person and day it was added – never an
   * id. The ZIP is read once.
   */
  async backupContents(zipFile: string): Promise<BackupRecord[]> {
    const named = (rel: string) => isRecordRel(rel) && !['settings', 'day'].includes(classify(rel)!.kind)
    const { entries, files } = await readBackupFiles(zipFile, named)
    return entries.filter(isRecordRel).map((rel) => {
      const c = classify(rel)!
      let v: unknown = null
      try {
        v = JSON.parse(files.get(rel)?.toString('utf8') ?? 'null')
      } catch {
        v = null
      }
      const r = isPlain(v) ? v : {}
      const text = (x: unknown) => (typeof x === 'string' && x.trim()) || null
      return {
        rel,
        kind: c.kind,
        date: c.date,
        name: text(r.name) ?? text(r.note),
        person: c.kind === 'request' ? text(r.person) : null,
        // 0 – the model's „unknown” (`requestFrom`), never a date.
        at: c.kind === 'request' && typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt > 0 ? r.createdAt : null
      }
    })
  }

  /**
   * This computer to another folder (the banner „Dane przeniesiono do …”, D321, or the move of a restored backup tried
   * again): opened, and config.json remembers it; the folder it worked in stays when the new one does not open.
   */
  async moveTo(dir: string): Promise<{ ok: boolean; error: string | null }> {
    const to = resolve(dir)
    const r = await this.switchTo(to)
    if (!r.ok) {
      if (this.moving?.to === to) {
        this.moving.error = r.error
        await this.savePendingMove()
        this.changed()
      }
      return r
    }
    const m = this.moving
    if (m?.to === to) {
      this.moving = null
      await this.savePendingMove()
      if (m.from) await this.markMoved(m.from, to, m.at)
    }
    this.o.onFolder?.(to)
    return r
  }

  /** The restored backup's folder that did not open, kept in this computer's app data (gone once it opened). */
  private async savePendingMove(): Promise<void> {
    const file = join(this.o.userData, PENDING_MOVE_FILE)
    const m = this.moving
    await (m?.error != null ? mkdir(this.o.userData, { recursive: true }).then(() => writeFileAtomic(file, JSON.stringify(m))) : rm(file, { force: true })).catch((e) =>
      this.o.log('warn', 'stan przywróconej kopii nie zapisał się', e)
    )
  }

  /** After a restart: the restored backup's folder that did not open waits again in „Dane” of the folder it came from. */
  private async loadPendingMove(dir: string): Promise<void> {
    if (this.pendingLoaded || this.moving) return
    this.pendingLoaded = true
    try {
      const v = JSON.parse(await readFile(join(this.o.userData, PENDING_MOVE_FILE), 'utf8')) as unknown
      if (!isPlain(v) || v.from !== dir || typeof v.to !== 'string' || typeof v.at !== 'number') return
      // The restored folder removed meanwhile: nothing left to move to.
      if (!(await stat(v.to).catch(() => null))) return void (await rm(join(this.o.userData, PENDING_MOVE_FILE), { force: true }).catch(() => undefined))
      this.moving = { from: dir, to: v.to, at: v.at, error: typeof v.error === 'string' ? v.error : 'folder nie otworzył się' }
    } catch {
      // None (or unreadable): nothing waits.
    }
  }

  /**
   * Opens another folder the way the spec changes it („najpierw otwiera nowy folder, a stary zamyka dopiero po
   * sukcesie”): one without this app's data – not there, or OneDrive still bringing its rd.json – is refused at once;
   * one that still does not open leaves the folder before working (`openNow`) – or, when that one was not open either,
   * tried again instead of the new one.
   */
  private async switchTo(to: string): Promise<{ ok: boolean; error: string | null }> {
    const probe = await DataHub.probe(to)
    if (!probe.exists) return { ok: false, error: 'tego folderu nie ma na tym komputerze (OneDrive mógł go jeszcze nie pobrać)' }
    if (probe.unreadable) return { ok: false, error: `nie mogę go teraz odczytać (${probe.unreadable})` }
    if (!probe.hasData) return { ok: false, error: 'nie ma w nim (jeszcze) danych Regulated Day – gdy OneDrive je pobierze, spróbuj ponownie' }
    const before = this.folder
    if (await this.open(to)) return { ok: true, error: null }
    const error = this.lastOpenError ?? 'folder nie otworzył się'
    if (!this.service && before && before !== to) void this.open(before)
    return { ok: false, error }
  }

  /** The CSV export of a range of days into a folder (D300, D321): the paths of its files. */
  exportCsv(from: string, to: string, dir: string): Promise<string[]> {
    return this.need().exportCsv(from, to, dir)
  }

  /**
   * Chosen records of a backup taken back (spec „Przywracanie w aplikacji: wybrane rekordy”): each is your edit of the
   * fields it differs in (or the record anew), through the queue – so the history keeps what it was before.
   */
  async restoreRecords(zipFile: string, rels: readonly string[]): Promise<RestoreOutcome[]> {
    const wanted = new Set(rels)
    const backup = await readBackupFiles(zipFile, (rel) => wanted.has(rel))
    const files = backup.files
    const allowed = new Set(backup.entries.filter(isRecordRel))
    for (const rel of rels) if (!allowed.has(rel)) throw new Error(`w kopii nie ma rekordu ${rel}`)
    const entries: EditEntry[] = []
    const same: string[] = []
    for (const rel of [...wanted]) {
      const bytes = files.get(rel)
      let value: unknown
      try {
        value = bytes ? JSON.parse(bytes.toString('utf8')) : null
      } catch {
        throw new Error(`rekord ${rel} w kopii jest uszkodzony`)
      }
      if (!isPlain(value)) throw new Error(`rekord ${rel} w kopii jest uszkodzony`)
      const entry = await this.restoreEntry(rel, value)
      if (entry) entries.push(entry)
      else same.push(rel)
    }
    // One outcome per record chosen: what the queue did with it – waiting behind a question is its own (it never goes by
    // itself) – or „the same already” (nothing written).
    const done = entries.length ? await this.edit(entries) : []
    const statusOf = (o: EditOutcome | undefined): RestoreOutcome['status'] => (!o ? 'waiting' : o.status === 'waiting' && o.why === BEHIND_QUESTION ? 'behindQuestion' : o.status)
    return [...entries.map((e, i) => ({ rel: e.rel, status: statusOf(done[i]) })), ...same.map((rel) => ({ rel, status: 'same' as const }))]
  }

  /**
   * The whole backup into a new folder (spec „cały folder do nowego folderu”, T117): written there – never over a folder
   * with anything in it, nor inside the open folder (each of its backups would carry the copy) – then the folder it came
   * from gets the marker „przeniesiono do …” (the other computers propose the move) and this computer works in the new
   * one. A new folder that does not open leaves this computer in the one before; the move waits for `moveTo` (its
   * „Spróbuj ponownie”).
   */
  async restoreWhole(zipFile: string, target: string, at = Date.now()): Promise<{ to: string; ok: boolean; error: string | null }> {
    const to = resolve(target)
    if (this.folder && within(to, this.folder)) throw new Error('Nowy folder leży w obecnym folderze danych – wybierz folder poza nim.')
    const files = await restoreToFolder(zipFile, to)
    this.o.log('info', `kopia ${zipFile} przywrócona do ${to}: ${files} plików`)
    this.moving = { from: this.folder, to, at, error: null }
    return { to, ...(await this.moveTo(to)) }
  }

  /**
   * The marker „przeniesiono do …” in the folder moved from (best effort – the restore stands): the new folder also by
   * its path from the old one, so a computer whose OneDrive lies elsewhere (another user's profile) finds it.
   */
  private async markMoved(from: string, to: string, at: number): Promise<void> {
    const marker = { to, rel: relative(from, to), at, by: this.o.computer() }
    await writeFileAtomic(join(from, MOVED_FILE), `${JSON.stringify(marker, null, 2)}\n`).catch((e) => this.o.log('warn', `znacznik „przeniesiono do …” w ${from} nie zapisał się`, e))
  }

  /**
   * The marker „przeniesiono do …” in the open folder (another computer restored a backup into a new one), or null:
   * the new folder found from this one by the marker's relative path (the absolute one of the computer that wrote it
   * only without it).
   */
  async movedTo(): Promise<MovedTo | null> {
    const folder = this.folder
    if (!folder) return null
    try {
      const v = JSON.parse(await readFile(join(folder, MOVED_FILE), 'utf8')) as unknown
      if (!isPlain(v) || typeof v.to !== 'string' || typeof v.at !== 'number' || typeof v.by !== 'string') return null
      return { to: typeof v.rel === 'string' && v.rel ? resolve(folder, v.rel) : v.to, at: v.at, by: v.by }
    } catch {
      return null
    }
  }

  /**
   * The first computer's folder and shared data, made at „Zakończ” (the only place the app creates a data folder) and
   * before the folder opens: its first check – the leader making today's day – sees the wizard's settings, never the
   * defaults. rd.json goes last, so a folder with it holds the whole set. A file already there is never written over: the
   * same content is skipped (a „Zakończ” again after a failed one), another refuses – OneDrive may still be bringing
   * the data of a folder whose rd.json has not come yet.
   */
  static async createFirst(dir: string, records: ReadonlyArray<{ rel: string; value: RawRecord }>, computer: string, at: number, fs: DataFs = nodeFs): Promise<void> {
    await mkdir(dir, { recursive: true })
    const stamp = (v: RawRecord) => {
      const { updatedAt: _a, updatedBy: _b, ...rest } = v
      return rest
    }
    const ordered = [...records.filter((r) => r.rel !== SETTINGS_FILE), ...records.filter((r) => r.rel === SETTINGS_FILE)]
    for (const r of ordered) {
      const c = classify(r.rel)
      if (!c || c.conflict || c.kind === 'log' || c.kind === 'presence' || c.kind === 'grades') throw new Error(`nie można utworzyć ${r.rel}`)
      const abs = join(dir, c.canonical)
      const now = await fs.read(abs)
      if (now) {
        let same = false
        try {
          const old = JSON.parse(now.toString('utf8')) as unknown
          same = isPlain(old) && deepEqual(stamp(old), stamp(r.value))
        } catch {
          // A broken file is someone's data too: refused below.
        }
        if (same) continue
        throw new Error(`w folderze jest już ${c.canonical} – jeśli to dane z innego komputera, poczekaj, aż OneDrive je pobierze, i dołącz do nich`)
      }
      await fs.writeAtomic(abs, `${JSON.stringify({ ...r.value, updatedAt: at, updatedBy: computer }, null, 2)}\n`)
    }
  }

  /** Where the wizard proposes the data folder: OneDrive\RegulatedDay, else Documents\RegulatedDay. */
  static defaultFolder(documents: string): string {
    const od = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial
    return join(od || documents, 'RegulatedDay')
  }

  /**
   * The files of a CSV export (D300) already in `dir`: an earlier export there. A folder that is not there has none; one
   * whose list cannot be read rejects – never taken for an empty one (its files would be replaced without the question).
   */
  static async csvFilesIn(dir: string): Promise<string[]> {
    let list: string[]
    try {
      list = await readdir(dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`nie mogę odczytać folderu ${dir} (${e instanceof Error ? e.message : String(e)})`)
    }
    const names = new Set(list.map((n) => n.toLowerCase()))
    return Object.keys(CSV_HEADERS).filter((n) => names.has(n))
  }

  /** Inside one of this user's OneDrive folders (by the environment; E4a reads the registry). */
  static inOneDrive(dir: string): boolean {
    return [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter((x): x is string => !!x).some((root) => within(dir, root))
  }

  /** What is in a folder the wizard is pointed at: nothing, this app's data (rd.json), or something else. */
  static async probe(dir: string): Promise<FolderProbe> {
    const path = resolve(dir)
    const base: FolderProbe = { path, exists: false, empty: true, hasData: false, unreadable: null, entries: 0, inOneDrive: DataHub.inOneDrive(path) }
    const st = await stat(path).catch(() => null)
    if (!st) return base
    if (!st.isDirectory()) return { ...base, exists: true, empty: false, unreadable: 'To jest plik, nie folder.' }
    let names: string[]
    try {
      names = await readdir(path)
    } catch (e) {
      return { ...base, exists: true, empty: false, unreadable: e instanceof Error ? e.message : String(e) }
    }
    const entries = names.filter((n) => !NOISE.has(n.toLowerCase()))
    const out: FolderProbe = { ...base, exists: true, empty: entries.length === 0, entries: entries.length }
    if (!names.includes(SETTINGS_FILE)) return out
    // rd.json there: this app's data – read to be sure (a file OneDrive is still fetching is unknown, never missing).
    try {
      JSON.parse(await readFile(join(path, SETTINGS_FILE), 'utf8'))
      return { ...out, hasData: true }
    } catch (e) {
      return { ...out, hasData: true, unreadable: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * „Zawsze przechowuj na tym urządzeniu” (spec „Kilka komputerów”): the folder and everything in it pinned in OneDrive,
   * backups/ left as OneDrive decides (each computer would otherwise fetch every backup). attrib, no administrator.
   */
  static pin(dir: string): Promise<void> {
    const run = (args: string[]) =>
      new Promise<void>((done, fail) => execFile('attrib.exe', args, { windowsHide: true, timeout: 120_000 }, (e) => (e ? fail(e) : done())))
    return (async () => {
      await run(['+P', '-U', dir])
      await run(['+P', '-U', join(dir, '*'), '/S', '/D'])
      const backups = join(dir, 'backups')
      if (await stat(backups).catch(() => null)) {
        await run(['-P', backups])
        await run(['-P', join(backups, '*'), '/S', '/D'])
      }
    })()
  }
}
