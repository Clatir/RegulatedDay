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
import { deepEqual, sameContentAs, setAt, valueAt, type Path } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { earlierOnce } from '@shared/model/rd'
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
  /** A removal: the record as you saw it (undefined – an entry written before 0.25.0: removed as it is). */
  base?: unknown
  /**
   * The entries (ids) this one goes with (T923): it is laid only once they are – while one of them waits or is a question,
   * it waits too; one answered „theirs” takes it out with it (the attachments a removal took go back to how they were).
   */
  after?: string[]
}

/** Why an entry waits behind an earlier one for the same file that is still a question (it never goes by itself). */
export const BEHIND_QUESTION = 'czeka na odpowiedź na wcześniejsze pytanie'
/** Why an entry waits for the entries it goes with (`QueuedEdit.after`). */
export const AFTER_OWNER = 'czeka na zapis zmiany, z którą idzie'

export type Outcome =
  | { id: string; status: 'applied' }
  | { id: string; status: 'conflict'; fields: Array<FieldEdit & { now: unknown }> }
  | { id: string; status: 'removedElsewhere' }
  /** You removed the record here, and it changed elsewhere since you saw it (A3-09): a question. */
  | { id: string; status: 'changedElsewhere' }
  | { id: string; status: 'broken' }
  | { id: string; status: 'waiting'; why: string }

/** An entry as read from the queue's file: `after` only as a list of ids (anything else would stop every run – T929). */
function withAfterRead(e: QueuedEdit): QueuedEdit {
  const raw = (e as { after?: unknown }).after
  if (raw === undefined) return e
  const after = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  const { after: _a, ...rest } = e
  return after.length ? { ...rest, after } : rest
}

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
    this.bound = null
    try {
      const raw = JSON.parse(text) as Partial<QueueFile> & Record<string, unknown>
      const { format: _f, entries, ...extra } = raw
      this.extra = extra
      const read = (Array.isArray(entries) ? entries.filter((e) => e && typeof e.id === 'string' && typeof e.rel === 'string' && Array.isArray(e.edits)) : []).map(withAfterRead)
      const ids = new Set(read.map((e) => e.id))
      this.entries = [...read, ...waiting.filter((e) => !ids.has(e.id))]
      this.bound = null
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

  private persist(entries: readonly QueuedEdit[] = this.entries): void {
    if (this.unread) return
    mkdirSync(this.o.stateDir, { recursive: true })
    const tmp = `${this.file}.tmp-${process.pid}`
    const text = `${JSON.stringify({ ...this.extra, format: QUEUE_FORMAT, entries }, null, 2)}\n`
    // The file held a moment by an antivirus or the indexer (EPERM, EBUSY): tried again, as every write of the data (A3-15).
    for (let attempt = 0; ; attempt++) {
      try {
        const fd = openSync(tmp, 'w')
        try {
          writeSync(fd, text)
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        renameSync(tmp, this.file)
        return
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1))
      }
    }
  }

  /** Queues edits, all at once (on disk before it returns; a write that fails leaves none behind – nothing saves them later). */
  add(...edits: QueuedEdit[]): void {
    this.persist([...this.entries, ...edits])
    this.entries.push(...edits)
    this.bound = null
  }

  /** `answerBound` counted once per change of the entries or their outcomes. */
  private bound: Set<string> | null = null

  /**
   * The entries that wait for your answer to a question, not for the folder (T927): the questions, the entries behind one
   * for the same file, and those that go with one of these (`after`) – in their order, so a chain is followed through.
   */
  answerBound(): ReadonlySet<string> {
    if (this.bound) return this.bound
    const asked = new Set(this.questions().map((q) => q.edit.id))
    const out = new Set<string>()
    const rels = new Set<string>()
    for (const e of this.entries) {
      if (!asked.has(e.id) && !rels.has(e.rel) && !e.after?.some((a) => out.has(a))) continue
      out.add(e.id)
      rels.add(e.rel)
    }
    this.bound = out
    return out
  }

  /**
   * A record as this computer sees it: `value` (the file now; undefined = no file) with the queued edits of `rel` laid
   * over it in order – your change shows at once, also while the folder is away. An entry that goes with one waiting for
   * your answer is not laid (T928): „theirs” would take it out – till then the record is as the folder has it. Nor is an
   * entry others go with that is itself a question (T967): it is laid whole or not at all (T960), so nothing of it is in
   * the folder – a change made from what the window sees (a move asked again) never takes it for written.
   */
  overlay(rel: string, value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    let v: unknown = value
    const bound = this.entries.some((e) => e.rel === rel && e.after) ? this.answerBound() : null
    const owners = new Set(this.entries.flatMap((e) => e.after ?? []))
    const asked = this.entries.some((e) => e.rel === rel && owners.has(e.id)) ? new Set(this.questions().map((q) => q.edit.id)) : null
    for (const e of this.entries) {
      if (e.rel !== rel) continue
      if (bound && e.after?.some((a) => bound.has(a))) continue
      if (asked?.has(e.id) && owners.has(e.id)) continue
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

  /**
   * Another read, join and write of records (a conflict copy joined, your answer to it) in the same line as the queue's
   * runs: never between one's read and write, so neither writes over the other (A3-03).
   */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.running.then(fn)
    this.running = run.catch(() => undefined)
    return run
  }

  private async applyNow(records: RecordStore): Promise<Outcome[]> {
    // The file could not be read before: nothing is applied until it is (its entries come first).
    if (this.unread) this.load()
    if (this.unread) return this.entries.map((e) => ({ id: e.id, status: 'waiting' as const, why: 'kolejka nieczytelna' }))
    const out: Outcome[] = []
    const keep: QueuedEdit[] = []
    // An entry for a file waits behind an earlier one for the same file that is still a question (its fields come after);
    // one that goes with others waits until they are laid (T923).
    const blocked = new Set<string>()
    const pending = new Set(this.entries.map((e) => e.id))
    for (const edit of [...this.entries]) {
      const behind = blocked.has(edit.rel)
      if (behind || edit.after?.some((id) => pending.has(id))) {
        const waiting: Outcome = { id: edit.id, status: 'waiting', why: behind ? BEHIND_QUESTION : AFTER_OWNER }
        out.push(waiting)
        this.outcomes.set(edit.id, waiting)
        this.bound = null
        keep.push(edit)
        // A later edit of its file goes after it, as after any entry not laid (T926).
        blocked.add(edit.rel)
        continue
      }
      const outcome = await this.applyOne(records, edit)
      out.push(outcome)
      if (outcome.status === 'applied') {
        this.outcomes.delete(edit.id)
        pending.delete(edit.id)
      } else {
        this.outcomes.set(edit.id, outcome)
        this.bound = null
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
    this.bound = null
    return out
  }

  /** The questions now: entries whose fields met a change elsewhere, or whose record was removed elsewhere. */
  questions(): Array<{ edit: QueuedEdit; outcome: Outcome }> {
    const out: Array<{ edit: QueuedEdit; outcome: Outcome }> = []
    for (const e of this.entries) {
      const o = this.outcomes.get(e.id)
      if (o && (o.status === 'conflict' || o.status === 'removedElsewhere' || o.status === 'changedElsewhere' || o.status === 'broken')) out.push({ edit: e, outcome: o })
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
      // The entries that go with it leave with it (T923), and those that go with them.
      const drop = new Set([id])
      for (let grew = true; grew; ) {
        grew = false
        for (const x of this.entries) {
          if (drop.has(x.id) || !x.after?.some((a) => drop.has(a))) continue
          drop.add(x.id)
          grew = true
        }
      }
      this.entries = this.entries.filter((x) => !drop.has(x.id))
      for (const x of drop) if (x !== id) this.outcomes.delete(x)
    } else if (o.status === 'conflict') {
      for (const f of e.edits) {
        const met = o.fields.find((x) => pathEq(x.path, f.path))
        if (met) f.base = met.now
      }
    } else if (o.status === 'changedElsewhere') {
      // „Usuń mimo to”: removed as it is now.
      e.base = undefined
    } else if (o.status === 'removedElsewhere') {
      let value: unknown = restoreFrom ?? {}
      for (const f of e.edits) value = setAt(value, f.path, f.value)
      e.edits = Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ path: [k], base: undefined, value: v }))
      e.create = true
    } else return false
    this.outcomes.delete(id)
    this.bound = null
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
      // „Usunięcie na jednym komputerze przy edycji na drugim zawsze kończy się pytaniem” (spec, A3-09).
      if (edit.base !== undefined && !sameContentAs(cur.value, edit.base)) return { id: edit.id, status: 'changedElsewhere' }
      await records.remove(edit.rel)
      return { id: edit.id, status: 'applied' }
    }
    let value: unknown = cur.value
    const conflicts: Array<FieldEdit & { now: unknown }> = []
    const applied: FieldEdit[] = []
    for (const f of edit.edits) {
      const now = valueAt(value, f.path)
      if (deepEqual(now, f.value)) continue
      // A day of rd.json written once that another leader wrote meanwhile: the earlier stays, never a question (A3-10).
      const once = edit.rel === paths.settings ? earlierOnce(f.path, now, f.value) : null
      if (once != null) {
        if (once !== now) {
          value = setAt(value, f.path, once)
          applied.push(f)
        }
        continue
      }
      if (deepEqual(now, f.base)) {
        value = setAt(value, f.path, f.value)
        applied.push(f)
      } else conflicts.push({ ...f, now })
    }
    // An entry others go with (`after`) is laid whole or not at all (T960): with a field that met a change elsewhere nothing
    // of it is written until you answer – „theirs” then takes it and them out with nothing of it left (a block moved to
    // another day never stays on both: its target is the owner, the source goes with it).
    if (conflicts.length && this.entries.some((x) => x.after?.includes(edit.id))) return { id: edit.id, status: 'conflict', fields: conflicts }
    if (applied.length) await records.write(edit.rel, { ...(value as Record<string, unknown>), updatedAt: stamp, updatedBy: this.o.computer }, 'edit')
    if (conflicts.length) {
      // What did not meet a change elsewhere is written; the rest stays queued as a question.
      edit.edits = conflicts.map(({ now: _now, ...f }) => f)
      return { id: edit.id, status: 'conflict', fields: conflicts }
    }
    return { id: edit.id, status: 'applied' }
  }
}
