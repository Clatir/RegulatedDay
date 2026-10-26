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
import type { DataFs } from './fsio'

export const MAX_PER_RECORD = 40
const EDIT_MERGE_MS = 60_000

export type HistoryReason = 'edit' | 'delete' | 'merge' | 'restore' | 'conflict'

export interface Snapshot {
  savedAt: number
  savedBy: string
  reason: HistoryReason
  record: unknown
}

const safe = (s: string) => s.replace(/[^0-9A-Za-z_-]/g, '')
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:.]/g, '')

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
  async snapshot(kind: string, id: string, record: unknown, reason: HistoryReason): Promise<string | null> {
    try {
      const key = `${kind}/${id}`
      const now = this.o.now()
      if (reason === 'edit') {
        const last = this.last.get(key)
        if (last != null && now - last < EDIT_MERGE_MS) return null
      }
      const name = `${stamp(now)}_${reason}_${randomBytes(2).toString('hex')}.json`
      const file = join(this.dir(kind, id), name)
      const body: Snapshot = { savedAt: now, savedBy: this.o.computer, reason, record }
      await this.o.fs.writeAtomic(file, `${JSON.stringify(body, null, 2)}\n`)
      this.last.set(key, now)
      await this.prune(this.dir(kind, id)).catch(() => undefined)
      return file
    } catch (e) {
      this.o.failed?.(e)
      return null
    }
  }

  private async names(dir: string): Promise<string[]> {
    try {
      return (await this.o.fs.list(dir)).filter((e) => !e.dir && e.name.endsWith('.json') && !e.name.startsWith('.')).map((e) => e.name).sort()
    } catch {
      return []
    }
  }

  private async prune(dir: string): Promise<void> {
    const names = await this.names(dir)
    for (const n of names.slice(0, Math.max(0, names.length - MAX_PER_RECORD))) await this.o.fs.remove(join(dir, n))
  }

  /** Versions of a record, newest first (unreadable ones skipped). */
  async list(kind: string, id: string): Promise<Array<Snapshot & { file: string }>> {
    const dir = this.dir(kind, id)
    const out: Array<Snapshot & { file: string }> = []
    for (const name of (await this.names(dir)).reverse()) {
      try {
        const bytes = await this.o.fs.read(join(dir, name))
        if (!bytes) continue
        const s = JSON.parse(bytes.toString('utf8')) as Snapshot
        if (s && typeof s === 'object' && typeof s.savedAt === 'number') out.push({ ...s, file: name })
      } catch {
        /* a broken version is skipped */
      }
    }
    return out
  }
}
