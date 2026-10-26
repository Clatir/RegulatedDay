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
import { historyKey } from './records'
import { DataService, STOP_TIMEOUT_MS } from './service'

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
  /** Something the window shows changed (the hub tells it once per change of what it would read). */
  onChange: () => void
}

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

  constructor(private readonly o: HubOptions) {}

  /** Opens `dir` (the data folder chosen here); a folder that cannot be opened leaves the app working without it. */
  open(dir: string): Promise<boolean> {
    if (this.opening) return this.opening
    this.opening = this.openNow(dir).finally(() => {
      this.opening = null
    })
    return this.opening
  }

  private async openNow(dir: string): Promise<boolean> {
    // Another folder open before (the wizard on a computer that had one): it closes first.
    const old = this.service
    this.service = null
    if (old) await old.stop('quit')
    this.status = 'opening'
    this.folder = dir
    this.error = null
    this.changed()
    try {
      await mkdir(dir, { recursive: true })
      const s = await DataService.start({
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
      if (this.closing) {
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
      return false
    }
  }

  /**
   * Closes the folder (the quit waits for it within its limit): also while it is still opening – the opening then stops
   * the folder it opened at once.
   */
  async close(why: 'quit' | 'system'): Promise<void> {
    this.closing = true
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
    return `${head}|${today}|${JSON.stringify(await this.records())}|${read.events.length}|${f.unsynced}|${f.queue.questions().length}|${f.leader.leader}`
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
    return {
      status: this.status,
      folder: this.folder,
      error: this.error,
      computer: this.o.computer(),
      computerName: this.o.computerName,
      ...records,
      computers: f?.computers ?? [{ id: this.o.computer(), name: this.o.computerName }],
      unsynced: f?.unsynced ?? 0,
      questions: f ? this.questions() : [],
      problems,
      leader: f?.leader.leader ?? null,
      today: logicalDayOf(f ? f.clock.now() : Date.now())
    }
  }

  private questions(): EditQuestion[] {
    const f = this.service!.folder
    return f.queue.questions().map(({ edit, outcome }) => ({
      id: edit.id,
      rel: edit.rel,
      kind: outcome.status === 'conflict' ? 'conflict' : outcome.status === 'removedElsewhere' ? 'removed' : 'broken',
      at: edit.at,
      fields: outcome.status === 'conflict' ? outcome.fields.map((x) => ({ path: x.path, mine: x.value, theirs: x.now })) : edit.edits.map((x) => ({ path: x.path, mine: x.value, theirs: undefined }))
    }))
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
    const file = async (d: string) => (await f.recordView(paths.day(d)).catch(() => undefined)) ?? null
    return { date, dayFile: await file(date), nextFile: await file(addDays(date, 1)), prevFile: await file(addDays(date, -1)), events: read.events, complete: read.complete }
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
    f.queue.resolve(id, choice, restoreFrom)
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
