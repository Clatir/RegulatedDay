/**
 * Records of the data folder – rd.json, templates, the plan of lectures, days, requests, routines (spec „Pliki na
 * OneDrive”). Written atomically with retries; a broken file goes to the list of problems and is never written over (it
 * can be brought back from the history); a file that cannot be read now is read again and never taken as empty.
 * Conflict copies are compared by content: the same content goes, different ones are joined field by field and list
 * items by id; both versions go to the history; fields changed to different values on both sides stay a question
 * (E3 asks, „Przyjmij nowsze” answers many at once). Fields this version does not know stay in the file.
 */
import { join } from 'node:path'
import { classify, paths, type Classified } from '@shared/data/paths'
import { deepEqual, merge3, type MergeConflict } from '@shared/data/merge'
import { earlierOnce } from '@shared/model/rd'
import type { DataFs } from './fsio'
import type { RecordHistory } from './history'

export type RecordRead =
  | { status: 'ok'; value: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'broken'; why: string }
  | { status: 'unreadable'; why: string }

export class BrokenRecordError extends Error {
  constructor(readonly rel: string) {
    super(`Uszkodzony plik ${rel} nie jest nadpisywany`)
  }
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The history's key of a record: its kind and id (a day by its date, rd.json as „rd”). */
export function historyKey(c: Classified): { kind: string; id: string } {
  return { kind: c.kind, id: c.id ?? c.date ?? c.computer ?? 'rd' }
}

export class RecordStore {
  readonly problems = new Map<string, string>()

  constructor(private readonly o: { fs: DataFs; dataDir: string; computer: string; history: RecordHistory; now: () => number }) {}

  async read(rel: string): Promise<RecordRead> {
    let bytes: Buffer | null
    try {
      bytes = await this.o.fs.read(join(this.o.dataDir, rel))
    } catch (e) {
      return { status: 'unreadable', why: e instanceof Error ? e.message : String(e) }
    }
    if (!bytes) return { status: 'missing' }
    try {
      const value = JSON.parse(bytes.toString('utf8')) as unknown
      if (!isPlain(value)) throw new Error('nie obiekt')
      this.problems.delete(rel)
      return { status: 'ok', value }
    } catch (e) {
      const why = `uszkodzony: ${e instanceof Error ? e.message : String(e)}`
      this.problems.set(rel, why)
      return { status: 'broken', why }
    }
  }

  /**
   * Writes a record; `reason` 'edit' (your edit) keeps the version before it in the history. A broken file is never
   * written over.
   */
  async write(rel: string, value: Record<string, unknown>, reason: 'edit' | 'auto' | 'merge' = 'edit'): Promise<void> {
    const before = await this.read(rel)
    if (before.status === 'broken') throw new BrokenRecordError(rel)
    if (before.status === 'unreadable') throw new Error(before.why)
    const c = classify(rel)
    if (before.status === 'ok' && c && reason !== 'auto' && !deepEqual(before.value, value)) {
      const { kind, id } = historyKey(c)
      await this.o.history.snapshot(kind, id, before.value, reason === 'merge' ? 'merge' : 'edit')
    }
    await this.o.fs.writeAtomic(join(this.o.dataDir, rel), `${JSON.stringify(value, null, 2)}\n`)
  }

  /** Removes a record, keeping its last version in the history. */
  async remove(rel: string): Promise<void> {
    const before = await this.read(rel)
    const c = classify(rel)
    if (before.status === 'ok' && c) {
      const { kind, id } = historyKey(c)
      await this.o.history.snapshot(kind, id, before.value, 'delete')
    }
    await this.o.fs.remove(join(this.o.dataDir, rel))
  }

  /** Conflict copies in a folder of the data (relative paths with the file each is a copy of). */
  async conflictCopies(dirRel: string): Promise<Array<{ copy: string; canonical: string }>> {
    const out: Array<{ copy: string; canonical: string }> = []
    for (const e of await this.o.fs.list(join(this.o.dataDir, dirRel))) {
      if (e.dir) continue
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name
      const c = classify(rel)
      if (c?.conflict && c.kind !== 'log' && c.kind !== 'presence' && c.kind !== 'grades') out.push({ copy: rel, canonical: c.canonical })
    }
    return out
  }

  /**
   * Joins a conflict copy into its file: the same content – the copy goes; otherwise fields and list items only one side
   * has are taken, the same ones stay, and fields with different values on both sides are the conflicts left to ask
   * (then nothing is written and the copy stays). Both versions go to the history.
   */
  async joinCopy(copyRel: string, canonicalRel: string, answer?: (c: MergeConflict) => 'mine' | 'theirs'): Promise<{ joined: boolean; conflicts: MergeConflict[] }> {
    const [copy, canon] = await Promise.all([this.read(copyRel), this.read(canonicalRel)])
    if (copy.status !== 'ok') return { joined: false, conflicts: [] }
    if (canon.status === 'missing') {
      // The record was removed on purpose (its last version in the history is the deletion): it stays removed and the
      // copy's content goes to the history – a copy never brings back quietly a record removed (spec, A3-11).
      // (Other copies kept on the way never count – a second copy of the record finds the deletion still.) A copy whose
      // content could not be kept stays where it is, tried again later.
      const c = classify(canonicalRel)
      const key = c ? historyKey(c) : null
      if (key && (await this.o.history.lastReason(key.kind, key.id, ['conflict'])) === 'delete') {
        if (!(await this.o.history.snapshot(key.kind, key.id, copy.value, 'conflict'))) return { joined: false, conflicts: [] }
      } else await this.o.fs.writeAtomic(join(this.o.dataDir, canonicalRel), `${JSON.stringify(copy.value, null, 2)}\n`)
      await this.o.fs.remove(join(this.o.dataDir, copyRel))
      return { joined: true, conflicts: [] }
    }
    if (canon.status !== 'ok') return { joined: false, conflicts: [] }
    if (deepEqual(copy.value, canon.value)) {
      await this.o.fs.remove(join(this.o.dataDir, copyRel))
      return { joined: true, conflicts: [] }
    }
    // Without a common base: what only one side has is an addition, what both have differently is a question – unless
    // `answer` (your answer: „mine” the file, „theirs” the copy) decides it.
    const asked: MergeConflict[] = []
    const { merged } = merge3<Record<string, unknown>>(undefined, canon.value, copy.value, (c) => {
      if (c.mine === undefined) return 'theirs'
      if (c.theirs === undefined) return 'mine'
      // A day of rd.json written once by two leaders apart: the earlier wins, never a question (T513, A3-10).
      const once = canonicalRel === paths.settings ? earlierOnce(c.path, c.mine, c.theirs) : null
      if (once != null) return once === c.mine ? 'mine' : 'theirs'
      if (answer) return answer(c)
      asked.push(c)
      return 'mine'
    })
    if (asked.length) return { joined: false, conflicts: asked }
    const c = classify(canonicalRel)
    if (c) {
      const { kind, id } = historyKey(c)
      await this.o.history.snapshot(kind, id, canon.value, 'conflict')
      await this.o.history.snapshot(kind, id, copy.value, 'conflict')
    }
    await this.o.fs.writeAtomic(join(this.o.dataDir, canonicalRel), `${JSON.stringify(merged, null, 2)}\n`)
    await this.o.fs.remove(join(this.o.dataDir, copyRel))
    return { joined: true, conflicts: [] }
  }
}
