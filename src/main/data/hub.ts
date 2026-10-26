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
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DataView, DayData, EditEntry, EditOutcome, EditQuestion, EventIn, FolderProbe, HistoryRecord, HistoryVersion, RawRecord } from '@shared/api'
import { diffRecords } from '@shared/data/merge'
import { classify, ID_COLLECTIONS, paths, SETTINGS_FILE, type IdKind } from '@shared/data/paths'
import type { HolidayLookup } from '@shared/engine/createDay'
import { logicalDayOf } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import { compareVersions } from '@shared/update'
import { createUpdateBackup } from './backup'
import { historyKey } from './records'
import { DataService, STOP_TIMEOUT_MS, type ServiceOptions } from './service'

export interface HubOptions {
  userData: string
  computer: () => string
  computerName: string
  appVersion: string
  runId: string
  holidays: HolidayLookup
  idleSeconds: () => number
  log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void
  writeGuardPlan: boolean
  extraBackupDir: () => string | null
  /** The version that ran here before this one (config.json): a newer one backs the folder up before opening it. */
  previousVersion: () => string | null
  /** Something the window shows changed (the hub tells it once per change of what it would read). */
  onChange: () => void
  /** Starts the folder's service (tests: a slow or failing folder). */
  start?: (o: ServiceOptions) => Promise<DataService>
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

/** Files OneDrive and Windows put in any folder: they do not make it „not empty”. */
const NOISE = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])

/** Where a record kind of the history lives. */
function relOf(kind: string, id: string): string | null {
  if (kind === 'settings') return SETTINGS_FILE
  if (kind === 'day') return isIsoDate(id) ? paths.day(id) : null
  if (kind in ID_COLLECTIONS) return paths.record(kind as IdKind, id)
  return null
}

const isPlain = (v: unknown): v is RawRecord => !!v && typeof v === 'object' && !Array.isArray(v)

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
    // Another folder open before (the wizard on a computer that had one): it closes first.
    const old = this.service
    this.service = null
    if (old) await old.stop('quit')
    this.status = 'opening'
    this.folder = dir
    this.error = null
    this.changed()
    try {
      // A folder that is not there (OneDrive not ready yet): nothing is created in its place (spec „W niedostępnym folderze
      // niczego nie tworzy”) – it is tried again.
      const st = await stat(dir).catch(() => null)
      if (!st?.isDirectory()) throw new Error('folder jest niedostępny')
      // The first opening by a newer version: a backup before it touches anything (the data still in the old format).
      const prev = this.o.previousVersion()
      if (prev && !this.backedUp && isNewer(this.o.appVersion, prev)) {
        const r = await createUpdateBackup(dir, join(dir, 'backups'), prev, this.o.appVersion)
        // Made (or there already): not again; failed: tried again at the next opening.
        if (!r || r.ok) this.backedUp = true
        if (r?.ok) this.o.log('info', `kopia przed aktualizacją ${prev} → ${this.o.appVersion}: ${r.files} plików`)
        else if (r) this.o.log('error', `kopia przed aktualizacją nie powiodła się: ${r.error}`)
      }
      const s = await (this.o.start ?? ((o: ServiceOptions) => DataService.start(o)))({
        dataDir: dir,
        userData: this.o.userData,
        computer: this.o.computer(),
        computerName: this.o.computerName,
        appVersion: this.o.appVersion,
        runId: this.o.runId,
        holidays: this.o.holidays,
        idleSeconds: this.o.idleSeconds,
        log: this.o.log,
        writeGuardPlan: this.o.writeGuardPlan,
        extraBackupDir: this.o.extraBackupDir,
        onChecked: () => this.changed()
      })
      if (this.closing || this.shutdown) {
        await s.stop('quit')
        return false
      }
      this.service = s
      this.status = 'open'
      void s.refreshGuardPlan()
      this.o.log('info', `folder danych otwarty: ${dir}`)
      this.changed()
      return true
    } catch (e) {
      this.status = 'failed'
      this.error = e instanceof Error ? e.message : String(e)
      this.o.log('error', `folder danych ${dir} nie otworzył się`, e)
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
    const head = `${this.status}|${this.folder}|${this.error}`
    if (!f) return head
    const today = logicalDayOf(f.clock.now())
    const read = await f.readDay(today)
    // The day files the window reads with today (yesterday's and tomorrow's beside it): a change of the plan made on
    // another computer reaches the window like a change of the settings.
    const days = await Promise.all([-1, 0, 1].map((d) => f.recordView(paths.day(addDays(today, d))).catch((e: unknown) => `?${String(e)}`)))
    return `${head}|${today}|${JSON.stringify(await this.records())}|${JSON.stringify(days)}|${read.events.length}|${f.unsynced}|${f.queue.questions().length}|${f.copyConflicts.size}|${f.leader.leader}`
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
      today: logicalDayOf(f ? f.clock.now() : Date.now())
    }
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
    for (const d of dates.slice(0, 62)) if (isIsoDate(d)) out[d] = (await f.recordView(paths.day(d)).catch(() => undefined)) ?? null
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
    const now = await f.recordView(rel)
    const entry: EditEntry = now
      ? { rel, edits: diffRecords(now, v.record).map((c) => ({ path: c.path, base: c.before, value: c.after })) }
      : { rel, create: true, edits: Object.entries(v.record).map(([k, x]) => ({ path: [k], base: undefined, value: x })) }
    if (!entry.edits.length) return []
    return this.edit([entry])
  }

  /** The first computer's folder made at „Zakończ” (the only place the app creates a data folder). */
  static async create(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true })
  }

  /** Where the wizard proposes the data folder: OneDrive\RegulatedDay, else Documents\RegulatedDay. */
  static defaultFolder(documents: string): string {
    const od = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial
    return join(od || documents, 'RegulatedDay')
  }

  /** Inside one of this user's OneDrive folders (by the environment; E4a reads the registry). */
  static inOneDrive(dir: string): boolean {
    const p = resolve(dir).toLowerCase()
    return [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
      .filter((x): x is string => !!x)
      .some((root) => {
        const r = resolve(root).toLowerCase()
        return p === r || p.startsWith(`${r}\\`) || p.startsWith(`${r}/`)
      })
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
