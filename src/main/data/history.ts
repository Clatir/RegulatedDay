// adapted from FI src/main/datastore/history.ts @ 39d14e8
/**
 * Earlier versions of records (spec „Historia zapisuje migawki tylko przy Twoich edycjach i usunięciach, łącząc zmiany
 * z jednej minuty”): before a record is overwritten or removed by your edit, the version on disk goes to
 * `.history/<kind>/<id>/<time>_<reason>_<rand>.json` (a dot folder: never scanned at the start, never in backups; synced,
 * so every computer has the same history). Changed against FI: edits of one minute make one snapshot (FI: 10 min), the
 * folder goes through DataFs (the sync simulator), a merge of conflict copies keeps both versions.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { HISTORY_DIR } from '@shared/data/paths'
import { REMOVED_MS, type DayRemoval } from '@shared/data/removed'
import type { DataFs } from './fsio'

export const MAX_PER_RECORD = 40
const EDIT_MERGE_MS = 60_000

/** `archive` – a series archived, i.e. removed (D381, N24): kept whole, never merged with the minute's edits; not `delete` – its file stays. */
export type HistoryReason = 'edit' | 'delete' | 'archive' | 'merge' | 'restore' | 'conflict'

export interface Snapshot {
  savedAt: number
  savedBy: string
  reason: HistoryReason
  record: unknown
  /** A removal: when you made it (the queue's entry – it may be written later, the folder away; N24). */
  at?: number
  /** A removal: the attachments its edit took with it, id → the `removedAt` written (N24). */
  taken?: Record<string, number>
}

/**
 * The removals of blocks from days' plans (N24, „Ostatnio usunięte”): one file for each edit of a day that took blocks out of
 * it, `.history/.removed/<time>_delete_<rand>.json`, kept `REMOVED_MS` from the removal (older ones go at the next removal).
 * A dot folder of files: `records()` passes it over (an older version too – it lists only folders of records there).
 */
export const REMOVED_DIR = '.removed'

/** A removal of blocks from a day's plan as kept: when, by which computer, the day and its blocks (`DayRemoval`). */
export interface Removal {
  savedAt: number
  savedBy: string
  date: string
  removed: DayRemoval[]
  /** The attachments the edit took with these blocks, id → the `removedAt` written. */
  taken?: Record<string, number>
  /** Of those, the ones of a block: id → the block's id. */
  takenBy?: Record<string, string>
}

const safe = (s: string) => s.replace(/[^0-9A-Za-z_-]/g, '')
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:.]/g, '')

/** The time a version's file name starts with (`stamp`), 0 when it cannot be read. */
function stampTime(name: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(name)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])) : 0
}

export class RecordHistory {
  private readonly last = new Map<string, number>()

  constructor(
    private readonly o: { fs: DataFs; dataDir: string; computer: string; now: () => number; failed?: (e: unknown) => void }
  ) {}

  private dir(kind: string, id: string): string {
    return join(this.o.dataDir, HISTORY_DIR, safe(kind), safe(id))
  }

  /**
   * Keeps `record` (the version about to be replaced or removed). Never throws – a failed snapshot never blocks the
   * save (it is reported). Edits of one minute keep one snapshot: the version from before the first of them.
   */
  async snapshot(kind: string, id: string, record: unknown, reason: HistoryReason, at?: number, taken?: Record<string, number>): Promise<string | null> {
    try {
      const key = `${kind}/${id}`
      const now = this.o.now()
      if (reason === 'edit') {
        const last = this.last.get(key)
        if (last != null && now - last < EDIT_MERGE_MS) return null
      }
      const name = `${stamp(now)}_${reason}_${randomBytes(2).toString('hex')}.json`
      const file = join(this.dir(kind, id), name)
      const body: Snapshot = { savedAt: now, savedBy: this.o.computer, reason, record, ...(at != null ? { at } : {}), ...(taken && Object.keys(taken).length ? { taken } : {}) }
      await this.o.fs.writeAtomic(file, `${JSON.stringify(body, null, 2)}\n`)
      this.last.set(key, now)
      await this.prune(this.dir(kind, id)).catch(() => undefined)
      return file
    } catch (e) {
      this.o.failed?.(e)
      return null
    }
  }

  /** The versions' file names of a folder, in order; a folder that cannot be listed now – none, said to `unread` (unknown, not „none”). */
  private async names(dir: string, unread?: () => void): Promise<string[]> {
    try {
      return (await this.o.fs.list(dir)).filter((e) => !e.dir && e.name.endsWith('.json') && !e.name.startsWith('.')).map((e) => e.name).sort()
    } catch {
      unread?.()
      return []
    }
  }

  /**
   * Why the newest version of a record was kept, from the file names (nothing is read), passing over `ignore` (e.g. the
   * conflict copies kept on the way); null – no other version.
   */
  async lastReason(kind: string, id: string, ignore: readonly HistoryReason[] = []): Promise<HistoryReason | null> {
    for (const name of (await this.names(this.dir(kind, id))).reverse()) {
      const reason = name.split('_')[1] as HistoryReason | undefined
      if (reason && !ignore.includes(reason)) return reason
    }
    return null
  }

  private async prune(dir: string): Promise<void> {
    const names = await this.names(dir)
    for (const n of names.slice(0, Math.max(0, names.length - MAX_PER_RECORD))) await this.o.fs.remove(join(dir, n))
  }

  /**
   * Every record with versions kept: its kind and id, how many and the newest one's time (from the file names – nothing
   * is read). Listed on demand only (the history screen), never at the start. `only` – only these kinds are looked at (the
   * others never listed). A folder that cannot be listed now is passed over and said to `unread` (the list is not whole then).
   */
  async records(unread?: () => void, only?: readonly string[]): Promise<Array<{ kind: string; id: string; versions: number; last: number }>> {
    const root = join(this.o.dataDir, HISTORY_DIR)
    const out: Array<{ kind: string; id: string; versions: number; last: number }> = []
    let kinds: Array<{ name: string; dir: boolean }>
    try {
      kinds = await this.o.fs.list(root)
    } catch {
      unread?.()
      return []
    }
    for (const k of kinds) {
      if (!k.dir || k.name.startsWith('.') || (only && !only.includes(k.name))) continue
      let ids: Array<{ name: string; dir: boolean }>
      try {
        ids = await this.o.fs.list(join(root, k.name))
      } catch {
        unread?.()
        continue
      }
      for (const i of ids) {
        if (!i.dir) continue
        const names = await this.names(join(root, k.name, i.name), unread)
        if (!names.length) continue
        out.push({ kind: k.name, id: i.name, versions: names.length, last: stampTime(names.at(-1)!) })
      }
    }
    return out.sort((a, b) => b.last - a.last)
  }

  /**
   * Keeps the blocks an edit of `date`'s file took out of its plan (N24), at `at` – when you made the edit (it may be written
   * later, the folder away). Never throws – a failed note never undoes the save (it is reported); the notes older than
   * `REMOVED_MS` go then.
   */
  async removal(date: string, removed: readonly DayRemoval[], at: number = this.o.now(), marks: { taken?: Record<string, number>; takenBy?: Record<string, string> } = {}): Promise<void> {
    if (!removed.length) return
    try {
      const now = this.o.now()
      const dir = join(this.o.dataDir, HISTORY_DIR, REMOVED_DIR)
      const { taken, takenBy } = marks
      const body: Removal = { savedAt: at, savedBy: this.o.computer, date, removed: [...removed], ...(taken && Object.keys(taken).length ? { taken } : {}), ...(takenBy && Object.keys(takenBy).length ? { takenBy } : {}) }
      await this.o.fs.writeAtomic(join(dir, `${stamp(at)}_delete_${randomBytes(4).toString('hex')}.json`), `${JSON.stringify(body, null, 2)}\n`)
      for (const n of await this.names(dir)) if (stampTime(n) < now - REMOVED_MS) await this.o.fs.remove(join(dir, n)).catch(() => undefined)
    } catch (e) {
      this.o.failed?.(e)
    }
  }

  /**
   * The removals of blocks kept since `since` (by the time in their names – older ones are not read), newest first; a broken
   * note is skipped, one that cannot be read now is skipped and said to `unread`, a folder that cannot be listed now throws
   * (unknown is never „none”).
   */
  async removals(since: number, unread?: () => void): Promise<Removal[]> {
    const dir = join(this.o.dataDir, HISTORY_DIR, REMOVED_DIR)
    const names = (await this.o.fs.list(dir)).filter((e) => !e.dir && e.name.endsWith('.json') && !e.name.startsWith('.') && stampTime(e.name) >= since).map((e) => e.name)
    const out: Removal[] = []
    for (const name of names.sort().reverse()) {
      const bytes = await this.read(join(dir, name), unread)
      if (!bytes) continue
      try {
        const r = JSON.parse(bytes.toString('utf8')) as Removal
        if (r && typeof r.savedAt === 'number' && typeof r.date === 'string' && Array.isArray(r.removed)) out.push(r)
      } catch {
        /* a broken note is skipped */
      }
    }
    return out
  }

  /** A file's bytes; one that cannot be read now – null, said to `unread`. */
  private async read(abs: string, unread?: () => void): Promise<Buffer | null> {
    try {
      return await this.o.fs.read(abs)
    } catch {
      unread?.()
      return null
    }
  }

  /** Versions of a record, newest first (broken ones skipped; one that cannot be read now – skipped and said to `unread`). */
  async list(kind: string, id: string, unread?: () => void): Promise<Array<Snapshot & { file: string }>> {
    const dir = this.dir(kind, id)
    const out: Array<Snapshot & { file: string }> = []
    for (const name of (await this.names(dir, unread)).reverse()) {
      const bytes = await this.read(join(dir, name), unread)
      if (!bytes) continue
      try {
        const s = JSON.parse(bytes.toString('utf8')) as Snapshot
        if (s && typeof s === 'object' && typeof s.savedAt === 'number') out.push({ ...s, file: name })
      } catch {
        /* a broken version is skipped */
      }
    }
    return out
  }
}
