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
  /** Fields the file held that this version does not know (kept when it writes the file). */
  private extra: Record<string, unknown> = {}

  constructor(private readonly o: { stateDir: string; computer: string }) {}

  get file(): string {
    return join(this.o.stateDir, QUEUE_FILE)
  }

  load(): void {
    if (!existsSync(this.file)) return
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<QueueFile> & Record<string, unknown>
      const { format: _f, entries, ...extra } = raw
      this.extra = extra
      this.entries = Array.isArray(entries) ? entries.filter((e) => e && typeof e.id === 'string' && typeof e.rel === 'string' && Array.isArray(e.edits)) : []
    } catch {
      // A queue that cannot be read is set aside, never dropped: it stays for a look.
      renameSync(this.file, join(this.o.stateDir, `queue.uszkodzona-${Date.now()}.json`))
      this.entries = []
    }
  }

  private persist(): void {
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

  get pending(): readonly QueuedEdit[] {
    return this.entries
  }

  /** Lays every queued edit onto its file; applied ones leave the queue, the others stay with why. */
  async apply(records: RecordStore): Promise<Outcome[]> {
    const out: Outcome[] = []
    const keep: QueuedEdit[] = []
    for (const edit of this.entries) {
      const outcome = await this.applyOne(records, edit)
      out.push(outcome)
      if (outcome.status !== 'applied') keep.push(edit)
    }
    // Applied entries leave; a question keeps only its fields that met a change elsewhere.
    if (out.some((o) => o.status === 'applied' || o.status === 'conflict')) {
      this.entries = keep
      this.persist()
    }
    return out
  }

  private async applyOne(records: RecordStore, edit: QueuedEdit): Promise<Outcome> {
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
    if (applied.length) {
      try {
        await records.write(edit.rel, { ...(value as Record<string, unknown>), updatedAt: edit.at, updatedBy: this.o.computer }, 'edit')
      } catch (e) {
        if (e instanceof BrokenRecordError) return { id: edit.id, status: 'broken' }
        return { id: edit.id, status: 'waiting', why: e instanceof Error ? e.message : String(e) }
      }
    }
    if (conflicts.length) {
      // What did not meet a change elsewhere is written; the rest stays queued as a question.
      edit.edits = conflicts.map(({ now: _now, ...f }) => f)
      return { id: edit.id, status: 'conflict', fields: conflicts }
    }
    return { id: edit.id, status: 'applied' }
  }
}
