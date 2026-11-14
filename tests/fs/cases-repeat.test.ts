/**
 * U6 (D465) in the data folder, two computers: a task that repeats ticked off on both (or on one with a view not fresh) gives
 * one next task – its id derived from the task's, its content the same on both, so the second write is laid without a
 * question; the same file made on both before OneDrive synced (a conflict copy `-PCB`) joins at once; the bar's „Tak” of
 * „Zadanie zrobione?” makes the next one too (`WidgetEngine`) – laid only after the answer (T923: an answer that meets a move
 * of the task elsewhere keeps it waiting, „ich” takes it out); a version before „Powtarzaj” keeps the field.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditEntry } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { nextTaskId, nextTaskRaw } from '@shared/engine/caseRepeat'
import { listedRaw, patchedRaw, taskQuestionId } from '@shared/engine/cases'
import { newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { WidgetEngine } from '../../src/main/widget'

let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-repeat-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  mkdirSync(join(dataDir, 'requests'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const DAY = '2026-11-16'
const rel = (id: string) => paths.record('request', id)
const write = (r: string, v: unknown) => writeFileSync(join(dataDir, r), JSON.stringify(v))
const read = (r: string) => JSON.parse(readFileSync(join(dataDir, r), 'utf8')) as Record<string, unknown>
const asEdits = (entries: EditEntry[]) => entries.map((e) => ({ ...e, edits: e.edits.map((x) => ({ ...x, path: x.path.map(String) })) }))
const requestFiles = () => readdirSync(join(dataDir, 'requests')).sort()

/** „Podlać kwiaty” every Monday and Thursday, „Wykonać” on Monday 16.11 – as the page writes it. */
function repeating(extra: Record<string, unknown> = {}) {
  const t = { ...newTask('t1', placeLogical('2026-11-14', 9 * 60), '2026-11-14', { title: 'Podlać kwiaty', doDate: DAY })!, ...extra }
  const r = patchedRaw(t, { repeat: { rule: { kind: 'weekly', every: 1, days: [1, 4], anchor: '' }, until: null, count: null } }, placeLogical('2026-11-14', 9 * 60))
  if ('error' in r) throw new Error(r.error)
  return r.raw
}

async function folderOf(id: string, clock: { now: number }) {
  return DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, `state-${id}`), computer: id, computerName: id.toUpperCase(), appVersion: '1.20.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true })
}

/** The window's tick (`changeRecord`): the task to „Zrobione” and its next one going with it (T923), as the edits of one change. */
function tickEntries(before: Record<string, unknown>, at: number): EditEntry[] {
  const after = listedRaw(before, 'done', at)
  const next = nextTaskRaw(before, after, at, marketDay)!
  return [recordEdit(rel('t1'), before, after)!, { ...recordEdit(rel(next.id), null, next.raw)!, after: [0] }]
}

describe('zadanie powtarzane na dwóch komputerach (D465)', () => {
  it('odhaczone na A i na B (B z widokiem sprzed odhaczenia) – jedno następne, jego drugi zapis bez pytania', async () => {
    const task = repeating()
    write(rel('t1'), task)
    const clock = { now: placeLogical(DAY, 9 * 60) }
    const a = await folderOf('pca', clock)
    const b = await folderOf('pcb', clock)
    try {
      expect((await a.edit(asEdits(tickEntries(task, clock.now)))).map((o) => o.status)).toEqual(['applied', 'applied'])
      const made = read(rel(nextTaskId('t1')))
      expect(requestFrom(made)).toMatchObject({ title: 'Podlać kwiaty', doDate: '2026-11-19', state: 'queued', repeat: { n: 2 } })
      // B ticks off the same task from the file as it saw it before A's tick, later on the same day.
      clock.now = placeLogical(DAY, 18 * 60)
      const outcomes = await b.edit(asEdits(tickEntries(task, clock.now)))
      // The task itself: the moment of „Zrobione” differs – the question it always was; the next one waits with it.
      expect(outcomes.map((o) => o.status)).toEqual(['conflict', 'waiting'])
      expect(b.queue.questions().map((q) => q.edit.rel)).toEqual([rel('t1')])
      // „Moje”: B's moment, and its next one – the same file A made – laid with no question of its own.
      await b.queue.resolve(b.queue.questions()[0]!.edit.id, 'mine')
      await b.check()
      expect(b.queue.questions()).toEqual([])
      expect(requestFrom(read(rel('t1')))).toMatchObject({ doneAt: placeLogical(DAY, 18 * 60) })
      expect(requestFiles()).toEqual([`${nextTaskId('t1')}.json`, 't1.json'].sort())
      const { updatedAt: _a, updatedBy: _b, ...content } = read(rel(nextTaskId('t1')))
      const { updatedAt: _c, updatedBy: _d, ...first } = made
      expect(content).toEqual(first)
    } finally {
      await a.close('quit')
      await b.close('quit')
    }
  })

  it('ten sam plik następnego zrobiony na obu przed synchronizacją (kopia konfliktowa) – łączy się od razu, bez pytania', async () => {
    const task = repeating()
    const after = listedRaw(task, 'done', placeLogical(DAY, 9 * 60))
    const next = nextTaskRaw(task, after, placeLogical(DAY, 9 * 60), marketDay)!
    write(rel('t1'), after)
    write(rel(next.id), { ...next.raw, updatedAt: 1, updatedBy: 'pca' })
    write(`requests/${next.id}-PCB.json`, { ...nextTaskRaw(task, listedRaw(task, 'done', placeLogical(DAY, 18 * 60)), placeLogical(DAY, 18 * 60), marketDay)!.raw, updatedAt: 2, updatedBy: 'pcb' })
    const clock = { now: placeLogical(DAY, 19 * 60) }
    const f = await folderOf('pca', clock)
    try {
      await f.check()
      expect(existsSync(join(dataDir, `requests/${next.id}-PCB.json`))).toBe(false)
      expect(f.copyConflicts.size).toBe(0)
      expect(requestFiles()).toEqual([`${next.id}.json`, 't1.json'].sort())
    } finally {
      await f.close('quit')
    }
  })

  /**
   * The bar of `folder` over the task `t1` planned in the block `tb` of DAY 10:00–10:30, the block ended (its line
   * „Zadanie zrobione?” shown); `meanwhile` runs just before the bar's edit (another computer's change landing then).
   */
  async function barAsking(folder: DataFolder, clock: { now: number }, meanwhile: () => void = () => undefined) {
    const sent: EditEntry[][] = []
    const w = new WidgetEngine({
      folder: () => folder,
      timer: async (c) => {
        const r = await folder.timerClick(c as never)
        return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
      },
      edit: async (entries) => (meanwhile(), sent.push(entries), (await folder.edit(asEdits(entries))).map((o) => ({ status: o.status }))),
      answer: async () => ({ ok: true, why: null, confirm: null }),
      seen: async () => 0,
      clickedApp: () => undefined,
      modePrefs: () => ({ sessionMode: true, classMode: true }),
      notices: () => ({ start5: true, hardEnd: true, reserve: true }),
      notify: () => true,
      showMain: () => undefined,
      emit: () => undefined,
      log: () => undefined,
      now: () => clock.now,
      mono: () => clock.now
    })
    expect((await folder.timerClick({ a: 'start', block: 'tb', day: DAY } as never)).ok).toBe(true)
    clock.now = placeLogical(DAY, 10 * 60 + 30)
    expect((await folder.timerClick({ a: 'next', day: DAY } as never)).ok).toBe(true)
    await folder.log.flush()
    clock.now = placeLogical(DAY, 10 * 60 + 32)
    await w.refresh()
    return { w, sent }
  }
  const planned = () => ({ ...repeating(), state: 'planned', day: DAY, block: 'tb', list: 'today', listDay: DAY })
  const writeBlock = () => write(paths.day(DAY), { schema: 1, date: DAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, fixed: false, origin: 'user', task: 't1' }] })

  it('pasek: „Zadanie zrobione? · Tak” zadania, które się powtarza – zadanie w „Zrobione” i od razu następne (jedna edycja)', async () => {
    writeBlock()
    write(rel('t1'), planned())
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const folder = await folderOf('pca', clock)
    try {
      const { w, sent } = await barAsking(folder, clock)
      await w.act('line', `${taskQuestionId(DAY, 'tb')}|done`, 'bar')
      expect(sent).toHaveLength(1)
      expect(sent[0]!.map((e) => e.rel).sort()).toEqual([rel('t1'), rel(nextTaskId('t1'))].sort())
      expect(requestFrom(read(rel('t1')))).toMatchObject({ state: 'done', list: 'done' })
      expect(requestFrom(read(rel(nextTaskId('t1'))))).toMatchObject({ doDate: '2026-11-19', state: 'queued', block: null, repeat: { n: 2 } })
    } finally {
      await folder.close('quit')
    }
  })

  it('pasek: „Tak” spotyka przeniesienie zadania na drugim komputerze – następne czeka za pytaniem, „ich” zabiera je (T923)', async () => {
    writeBlock()
    write(rel('t1'), planned())
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const folder = await folderOf('pca', clock)
    // PCB moves the task to „W tym tygodniu” just as the bar's answer is written.
    const moved = () => write(rel('t1'), { ...listedRaw(planned(), 'week', placeLogical(DAY, 10 * 60 + 31)), updatedAt: placeLogical(DAY, 10 * 60 + 31), updatedBy: 'pcb' })
    try {
      const { w, sent } = await barAsking(folder, clock, moved)
      await w.act('line', `${taskQuestionId(DAY, 'tb')}|done`, 'bar')
      expect(sent).toHaveLength(1)
      // The answer waits as a question; its next task is not laid meanwhile – it goes with the answer.
      expect(folder.queue.questions().map((q) => q.edit.rel)).toEqual([rel('t1')])
      expect(existsSync(join(dataDir, rel(nextTaskId('t1'))))).toBe(false)
      const tick = sent[0]!.findIndex((e) => e.rel === rel('t1'))
      expect(sent[0]!.find((e) => e.rel === rel(nextTaskId('t1')))!.after).toEqual([tick])
      await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'theirs')
      await folder.check()
      // „Ich”: the task stays as PCB moved it – open, and no second open copy of it.
      expect(requestFrom(read(rel('t1')))).toMatchObject({ list: 'week', state: 'planned', doneAt: null })
      expect(requestFiles()).toEqual(['t1.json'])
    } finally {
      await folder.close('quit')
    }
  })

  it('pasek: to samo pytanie, odpowiedź „moje” – zadanie w „Zrobione” i następne kładzie się za nim', async () => {
    writeBlock()
    write(rel('t1'), planned())
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const folder = await folderOf('pca', clock)
    const moved = () => write(rel('t1'), { ...listedRaw(planned(), 'week', placeLogical(DAY, 10 * 60 + 31)), updatedAt: placeLogical(DAY, 10 * 60 + 31), updatedBy: 'pcb' })
    try {
      const { w } = await barAsking(folder, clock, moved)
      await w.act('line', `${taskQuestionId(DAY, 'tb')}|done`, 'bar')
      await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine')
      await folder.check()
      expect(requestFrom(read(rel('t1')))).toMatchObject({ list: 'done', state: 'done' })
      expect(requestFrom(read(rel(nextTaskId('t1'))))).toMatchObject({ doDate: '2026-11-19', state: 'queued', repeat: { n: 2 } })
    } finally {
      await folder.close('quit')
    }
  })

  it('starsza wersja na drugim komputerze: jej zmiana zadania (pole po polu) zostawia `repeat`; plik czyta się bez błędu', async () => {
    const task = repeating()
    write(rel('t1'), task)
    const clock = { now: placeLogical(DAY, 9 * 60) }
    const b = await folderOf('pcb', clock)
    try {
      // What an older version sends: the fields it changes over the file as it read it (unknown fields untouched).
      const before = (await b.recordView(rel('t1')))!
      expect((await b.edit(asEdits([recordEdit(rel('t1'), before, { ...before, title: 'Podlać kwiaty i balkon' })!]))).map((o) => o.status)).toEqual(['applied'])
      expect(requestFrom(read(rel('t1')))).toMatchObject({ title: 'Podlać kwiaty i balkon', repeat: { rule: { kind: 'weekly', days: [1, 4] }, n: 1 } })
    } finally {
      await b.close('quit')
    }
  })
})
