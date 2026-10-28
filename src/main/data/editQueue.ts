/**
 * The local queue of edits (spec „Edycje plików dni, ustawień i rekordów trafiają najpierw do lokalnej trwałej kolejki w
 * danych aplikacji, a potem do folderu, z ponowieniem”): an entry is a change of fields with the values those fields had
 * when you changed them (their base) and the schema's number. It is laid onto the file as it is now, like a conflict copy:
 * a field nobody else changed takes your value, a field changed on both sides is a question, a record removed elsewhere
 * is a question too – never quietly brought back. Kept on disk (written before the edit counts as made), so a quit, a
 * crash or an unavailable folder loses nothing; the bar says „N zmian zapisze się po powrocie folderu”.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { deepEqual, setAt, valueAt, type Path } from '@shared/data/merge'
import { BrokenRecordError, type RecordStore } from './records'

const pathEq = (a: Path, b: Path): boolean => a.length === b.length && a.every((x, i) => x === b[i])

export const QUEUE_FILE = 'queue.v1.json'
export const QUEUE_FORMAT = 1

export interface FieldEdit {
  path: Path
  /** The value the field had when you changed it (undefined: it was not there). */
  base: unknown
  value: unknown
}

export interface QueuedEdit {
  id: string
  rel: string
  at: number
  schema: number
  edits: FieldEdit[]
  /** A new record (no file before). */
  create?: boolean
  /** The record removed. */
  remove?: boolean
}

/** Why an entry waits behind an earlier one for the same file that is still a question (it never goes by itself). */
export const BEHIND_QUESTION = 'czeka na odpowiedź na wcześniejsze pytanie'

export type Outcome =
  | { id: string; status: 'applied' }
  | { id: string; status: 'conflict'; fields: Array<FieldEdit & { now: unknown }> }
  | { id: string; status: 'removedElsewhere' }
  | { id: string; status: 'broken' }
  | { id: string; status: 'waiting'; why: string }

interface QueueFile {
  format: number
  entries: QueuedEdit[]
}

export class EditQueue {
  private entries: QueuedEdit[] = []
  /** The last outcome of each entry still queued (the questions the main window shows). */
  private readonly outcomes = new Map<string, Outcome>()
  /** Fields the file held that this version does not know (kept when it writes the file). */
  private extra: Record<string, unknown> = {}
  /**
   * The file is there but could not be read (held by an antivirus at the start): nothing is written over it; new edits
   * wait in memory and join the file's entries once it is read (spec: an unreadable file is never taken as empty).
   */
  private unread = false

  constructor(
    private readonly o: { stateDir: string; computer: string; read?: (file: string) => string }
  ) {}

  get file(): string {
    return join(this.o.stateDir, QUEUE_FILE)
  }

  /** Reads the queue; a broken one is set aside (never dropped), an unreadable one is read again at the next apply. */
  load(): void {
    if (!existsSync(this.file)) {
      this.unread = false
      return
    }
    let text: string
    try {
      text = (this.o.read ?? ((f) => readFileSync(f, 'utf8')))(this.file)
    } catch {
      this.unread = true
      return
    }
    const waiting = this.unread ? this.entries : []
    this.unread = false
    try {
      const raw = JSON.parse(text) as Partial<QueueFile> & Record<string, unknown>
      const { format: _f, entries, ...extra } = raw
      this.extra = extra
      const read = Array.isArray(entries) ? entries.filter((e) => e && typeof e.id === 'string' && typeof e.rel === 'string' && Array.isArray(e.edits)) : []
      const ids = new Set(read.map((e) => e.id))
      this.entries = [...read, ...waiting.filter((e) => !ids.has(e.id))]
    } catch {
      // A broken queue is set aside for a look; a rename that fails leaves it where it is (and nothing is written over).
      try {
        renameSync(this.file, join(this.o.stateDir, `queue.uszkodzona-${Date.now()}.json`))
      } catch {
        this.unread = true
        this.entries = waiting
        return
      }
      this.entries = waiting
    }
    if (waiting.length) this.persist()
  }

  private persist(): void {
    if (this.unread) return
    mkdirSync(this.o.stateDir, { recursive: true })
    const tmp = `${this.file}.tmp-${process.pid}`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, `${JSON.stringify({ ...this.extra, format: QUEUE_FORMAT, entries: this.entries }, null, 2)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.file)
  }

  /** Queues an edit (on disk before it returns). */
  add(edit: QueuedEdit): void {
    this.entries.push(edit)
    this.persist()
  }

  /**
   * A record as this computer sees it: `value` (the file now; undefined = no file) with the queued edits of `rel` laid
   * over it in order – your change shows at once, also while the folder is away.
   */
  overlay(rel: string, value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    let v: unknown = value
    for (const e of this.entries) {
      if (e.rel !== rel) continue
      if (e.remove) {
        v = undefined
        continue
      }
      if (v === undefined && !e.create) continue
      for (const f of e.edits) v = setAt(v ?? {}, f.path, f.value)
    }
    return v as Record<string, unknown> | undefined
  }

  /** Files with queued edits under a folder of the data (new records not on the disk yet among them). */
  relsUnder(dir: string): string[] {
    return [...new Set(this.entries.filter((e) => e.rel.startsWith(`${dir}/`)).map((e) => e.rel))]
  }

  get pending(): readonly QueuedEdit[] {
    return this.entries
  }

  /**
   * The last outcome of an entry: stored while it stays queued; gone from the queue – applied (an earlier run, already
   * under way when it was added, laid it).
   */
  outcomeOf(id: string): Outcome {
    const o = this.outcomes.get(id)
    if (o) return o
    return this.entries.some((e) => e.id === id) ? { id, status: 'waiting', why: 'czeka w kolejce' } : { id, status: 'applied' }
  }

  /**
   * Lays every queued edit onto its file; applied ones leave the queue, the others stay with why. One run at a time: the
   * check of the folder and an edit of the window never lay the same entry twice nor lose one between them.
   */
  apply(records: RecordStore): Promise<Outcome[]> {
    const run = this.running.then(() => this.applyNow(records))
    this.running = run.catch(() => [])
    return run
  }

  private running: Promise<unknown> = Promise.resolve()

  private async applyNow(records: RecordStore): Promise<Outcome[]> {
    // The file could not be read before: nothing is applied until it is (its entries come first).
    if (this.unread) this.load()
    if (this.unread) return this.entries.map((e) => ({ id: e.id, status: 'waiting' as const, why: 'kolejka nieczytelna' }))
    const out: Outcome[] = []
    const keep: QueuedEdit[] = []
    // An entry for a file waits behind an earlier one for the same file that is still a question (its fields come after).
    const blocked = new Set<string>()
    for (const edit of [...this.entries]) {
      if (blocked.has(edit.rel)) {
        const waiting: Outcome = { id: edit.id, status: 'waiting', why: BEHIND_QUESTION }
        out.push(waiting)
        this.outcomes.set(edit.id, waiting)
        keep.push(edit)
        continue
      }
      const outcome = await this.applyOne(records, edit)
      out.push(outcome)
      if (outcome.status === 'applied') this.outcomes.delete(edit.id)
      else {
        this.outcomes.set(edit.id, outcome)
        keep.push(edit)
        // A later edit of the file was made on top of this one (its bases are this one's values): it goes after it.
        blocked.add(edit.rel)
      }
    }
    // Applied entries leave; a question keeps only its fields that met a change elsewhere. Entries added while this ran
    // (an edit during a slow write) stay for the next run.
    if (out.some((o) => o.status === 'applied' || o.status === 'conflict')) {
      const seen = new Set(out.map((o) => o.id))
      this.entries = [...keep, ...this.entries.filter((e) => !seen.has(e.id))]
      this.persist()
    }
    return out
  }

  /** The questions now: entries whose fields met a change elsewhere, or whose record was removed elsewhere. */
  questions(): Array<{ edit: QueuedEdit; outcome: Outcome }> {
    const out: Array<{ edit: QueuedEdit; outcome: Outcome }> = []
    for (const e of this.entries) {
      const o = this.outcomes.get(e.id)
      if (o && (o.status === 'conflict' || o.status === 'removedElsewhere' || o.status === 'broken')) out.push({ edit: e, outcome: o })
    }
    return out
  }

  /**
   * Your answer to a question: „mine” – your values win (their bases become the values there now, so the next run writes
   * them; a record removed elsewhere is created again from `restoreFrom`, your fields laid over it); „theirs” – the
   * change elsewhere stays and your entry leaves.
   */
  resolve(id: string, choice: 'mine' | 'theirs', restoreFrom?: Record<string, unknown>): Promise<boolean> {
    // In turn with the runs of the queue: a run under way never puts back an entry you answered meanwhile.
    const run = this.running.then(() => this.resolveNow(id, choice, restoreFrom))
    this.running = run.catch(() => false)
    return run
  }

  private resolveNow(id: string, choice: 'mine' | 'theirs', restoreFrom?: Record<string, unknown>): boolean {
    const e = this.entries.find((x) => x.id === id)
    const o = this.outcomes.get(id)
    if (!e || !o) return false
    if (choice === 'theirs') {
      this.entries = this.entries.filter((x) => x.id !== id)
    } else if (o.status === 'conflict') {
      for (const f of e.edits) {
        const met = o.fields.find((x) => pathEq(x.path, f.path))
        if (met) f.base = met.now
      }
    } else if (o.status === 'removedElsewhere') {
      let value: unknown = restoreFrom ?? {}
      for (const f of e.edits) value = setAt(value, f.path, f.value)
      e.edits = Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ path: [k], base: undefined, value: v }))
      e.create = true
    } else return false
    this.outcomes.delete(id)
    this.persist()
    return true
  }

  /** One entry laid onto its file; a write that fails (the folder away) leaves it waiting – the run goes on. */
  private async applyOne(records: RecordStore, edit: QueuedEdit): Promise<Outcome> {
    try {
      return await this.applyOneNow(records, edit)
    } catch (e) {
      if (e instanceof BrokenRecordError) return { id: edit.id, status: 'broken' }
      return { id: edit.id, status: 'waiting', why: e instanceof Error ? e.message : String(e) }
    }
  }

  private async applyOneNow(records: RecordStore, edit: QueuedEdit): Promise<Outcome> {
    const cur = await records.read(edit.rel)
    if (cur.status === 'unreadable') return { id: edit.id, status: 'waiting', why: cur.why }
    if (cur.status === 'broken') return { id: edit.id, status: 'broken' }
    if (cur.status === 'missing') {
      // A record you edited that is gone now was removed elsewhere: a question, never brought back quietly.
      if (!edit.create) return { id: edit.id, status: edit.remove ? 'applied' : 'removedElsewhere' }
      let value: unknown = {}
      for (const f of edit.edits) value = setAt(value, f.path, f.value)
      await records.write(edit.rel, { ...(value as Record<string, unknown>), updatedAt: edit.at, updatedBy: this.o.computer }, 'edit')
      return { id: edit.id, status: 'applied' }
    }
    // The file's stamp of its last change never goes back (an older edit laid on later keeps the newer time – „Przyjmij
    // nowsze” compares it).
    const stamp = Math.max(edit.at, typeof cur.value.updatedAt === 'number' ? cur.value.updatedAt : 0)
    if (edit.remove) {
      await records.remove(edit.rel)
      return { id: edit.id, status: 'applied' }
    }
    let value: unknown = cur.value
    const conflicts: Array<FieldEdit & { now: unknown }> = []
    const applied: FieldEdit[] = []
    for (const f of edit.edits) {
      const now = valueAt(value, f.path)
      if (deepEqual(now, f.value)) continue
      if (deepEqual(now, f.base)) {
        value = setAt(value, f.path, f.value)
        applied.push(f)
      } else conflicts.push({ ...f, now })
    }
    if (applied.length) await records.write(edit.rel, { ...(value as Record<string, unknown>), updatedAt: stamp, updatedBy: this.o.computer }, 'edit')
    if (conflicts.length) {
      // What did not meet a change elsewhere is written; the rest stays queued as a question.
      edit.edits = conflicts.map(({ now: _now, ...f }) => f)
      return { id: edit.id, status: 'conflict', fields: conflicts }
    }
    return { id: edit.id, status: 'applied' }
  }
}
