/**
 * Steps in the data folder (SNT5, D440, T786–T793) on a copy of a folder: two computers ticking off steps of one block –
 * A and B each from the file as it was before the other's tick, and a conflict copy of OneDrive – nothing lost, no
 * question; the fields a version without steps does not know stay in the files it writes; the bar's step line with its
 * tick („☐ Napisać testy · krok 1/4”, then the next, after the last „Wszystkie kroki ✓”), a task's block ticking the task
 * too – without a sound or a notification.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditEntry } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { tickEdits } from '@shared/engine/steps'
import { createDay } from '@shared/engine/createDay'
import { seriesBlockId } from '@shared/engine/series'
import { RULES_VERSION } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import { seriesFrom, seriesJson, seriesPlans, typeOfDays, type Series } from '@shared/model/series'
import { dayStart, logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { ALL_STEPS_TEXT, barStepText } from '@shared/widget'
import { DataFolder } from '../../src/main/data/folder'
import { DataHub } from '../../src/main/data/hub'
import { nodeFs } from '../../src/main/data/fsio'
import { WidgetEngine, type NotifyIn } from '../../src/main/widget'

const DAY = '2026-10-21'
const steps = [
  { id: 's1', title: 'Napisać testy', order: 0 },
  { id: 's2', title: 'Przygotować logikę', order: 1 },
  { id: 's3', title: 'Sprawdzić na Windowsie', order: 2 },
  { id: 's4', title: 'Zrobić commit', order: 3 }
]
const blockRaw = { id: 'wd', categoryId: 'inne', startMin: 10 * 60, durationMin: 90, fixed: false, origin: 'user', steps }

let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-steps-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  mkdirSync(join(dataDir, 'requests'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const write = (rel: string, v: unknown) => writeFileSync(join(dataDir, rel), JSON.stringify(v))
const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as Record<string, unknown>
const asEdits = (entries: EditEntry[]) => entries.map((e) => ({ ...e, edits: e.edits.map((x) => ({ ...x, path: x.path.map(String) })) }))

async function computer(id: string, clock: { now: number }) {
  const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, `state-${id}`), computer: id, computerName: id.toUpperCase(), appVersion: '1.14.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true })
  const shown: NotifyIn[] = []
  const w = new WidgetEngine({
    folder: () => folder,
    timer: async (c) => {
      const r = await folder.timerClick(c as never)
      return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
    },
    edit: async (entries) => (await folder.edit(asEdits(entries))).map((o) => ({ status: o.status })),
    answer: async () => ({ ok: true, why: null, confirm: null }),
    seen: async () => 0,
    clickedApp: () => undefined,
    modePrefs: () => ({ sessionMode: true, classMode: true }),
    notices: () => ({ start5: true, hardEnd: true, reserve: true }),
    notify: (n) => (shown.push(n), true),
    showMain: () => undefined,
    emit: () => undefined,
    log: () => undefined,
    now: () => clock.now,
    mono: () => clock.now
  })
  return { folder, w, shown }
}

/** A tick as the window or the bar makes it, from the file as this computer saw it (`before`). */
async function tickFrom(folder: DataFolder, before: Record<string, unknown> | null, block: PlanBlock, stepId: string) {
  const out = tickEdits({ date: DAY, day: before, block, stepId, done: true, task: null })
  if ('error' in out) throw new Error(out.error)
  return folder.edit(asEdits([recordEdit(paths.day(DAY), before, out.day)!]))
}

describe('kroki na dwóch komputerach (T788)', () => {
  it('A i B odhaczają różne kroki, każdy z pliku sprzed odhaczenia drugiego: oba zostają, bez pytania', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [blockRaw] })
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer('pca', clock)
    const b = await computer('pcb', clock)
    const seen = (await b.folder.recordView(paths.day(DAY)))!
    const block = dayFileFrom(seen, DAY).blocks[0]!
    expect((await tickFrom(a.folder, (await a.folder.recordView(paths.day(DAY)))!, block, 's1')).map((o) => o.status)).toEqual(['applied'])
    // B's tick made from the file before A's (the first tick of the block on both – the map is new on both sides).
    expect((await tickFrom(b.folder, seen, block, 's3')).map((o) => o.status)).toEqual(['applied'])
    expect(dayFileFrom(read(paths.day(DAY)), DAY).stepsDone.wd!.sort()).toEqual(['s1', 's3'])
    await a.folder.close('quit')
    await b.folder.close('quit')
  })

  it('kopia konfliktowa OneDrive: odhaczenia z obu stron łączą się same, bez pytania (odhaczony wygrywa)', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [blockRaw], stepsDone: { wd: { s1: true } } })
    write(`days/2026/${DAY}-PCB.json`, { schema: 1, date: DAY, blocks: [blockRaw], stepsDone: { wd: { s2: true, s4: true } } })
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer('pca', clock)
    await a.folder.check()
    expect(a.folder.copyConflicts.size).toBe(0)
    expect(dayFileFrom(read(paths.day(DAY)), DAY).stepsDone.wd!.sort()).toEqual(['s1', 's2', 's4'])
    await a.folder.close('quit')
  })

  it('starsza wersja (bez kroków) zachowuje listę i odhaczenia przy zapisie innego pola bloku, dnia i zadania', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [{ ...blockRaw, later: 'pole nowszej wersji' }], stepsDone: { wd: { s1: true } } })
    const rel = paths.record('request', 't1')
    write(rel, { schema: 1, id: 't1', kind: 'task', title: 'Wdrożenie', estimateMin: 30, categoryId: 'inne', note: '', createdAt: 1, state: 'queued', day: null, block: null, list: 'today', listDay: DAY, doneAt: null, steps, stepsDone: { s2: true } })
    const clock = { now: placeLogical(DAY, 9 * 60) }
    const a = await computer('pca', clock)
    // As a version without steps writes: the fields it changed over the file as it is (`blockJson`, the raw record).
    const day = (await a.folder.recordView(paths.day(DAY)))!
    const blocks = day.blocks as Array<Record<string, unknown>>
    const before = (await a.folder.recordView(rel))!
    await a.folder.edit(asEdits([recordEdit(paths.day(DAY), day, { ...day, wakeMin: 7 * 60, blocks: [{ ...blocks[0]!, note: 'inna notatka' }] })!, recordEdit(rel, before, { ...before, note: 'zmiana starszej wersji' })!]))
    const file = read(paths.day(DAY))
    expect((file.blocks as Array<Record<string, unknown>>)[0]).toMatchObject({ note: 'inna notatka', steps, later: 'pole nowszej wersji' })
    expect(file.stepsDone).toEqual({ wd: { s1: true } })
    const task = requestFrom(read(rel))!
    expect(task.steps.map((s) => [s.id, s.done])).toEqual([
      ['s1', false],
      ['s2', true],
      ['s3', false],
      ['s4', false]
    ])
    await a.folder.close('quit')
  })
})

describe('linia kroku na pasku (D440, T793)', () => {
  it('„☐ Napisać testy · krok 1/4”, klik odhacza i pokazuje następny, po ostatnim „Wszystkie kroki ✓”; bez dźwięku i powiadomień', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [blockRaw] })
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer('pca', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'wd', day: DAY } as never)).ok).toBe(true)
    clock.now += 60_000
    await a.w.refresh()
    const line = () => (a.w.current().steps ? barStepText(a.w.current().steps!) : null)
    expect(line()).toBe('Napisać testy · krok 1/4')
    await a.w.act('step', 'wd|s1', 'bar')
    expect(line()).toBe('Przygotować logikę · krok 2/4')
    expect(dayFileFrom(read(paths.day(DAY)), DAY).stepsDone.wd).toEqual(['s1'])
    // A double click is one click (0.5 s): the second step is not ticked by it.
    await a.w.act('step', 'wd|s2', 'bar')
    clock.now += 1_000
    await a.w.act('step', 'wd|s2', 'bar')
    for (const s of ['s3', 's4']) {
      clock.now += 1_000
      await a.w.act('step', `wd|${s}`, 'bar')
    }
    expect(line()).toBe(ALL_STEPS_TEXT)
    expect(a.w.current().steps!.step).toBeNull()
    expect(dayFileFrom(read(paths.day(DAY)), DAY).stepsDone.wd!.sort()).toEqual(['s1', 's2', 's3', 's4'])
    expect(a.shown).toEqual([])
    // A step gone (removed on another computer): the bar says so, nothing written.
    clock.now += 1_000
    await a.w.act('step', 'wd|nie-ma', 'bar')
    expect(a.w.current().note?.text).toBe('Tego kroku już nie ma.')
    await a.folder.close('quit')
  })

  it('blok usunięty w międzyczasie (inny komputer, pasek jeszcze go pokazuje): „Tego bloku już nie ma w planie.”, nic nie zapisane (przegląd 2)', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [blockRaw, { ...blockRaw, id: 'inny', startMin: 14 * 60 }] })
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer('pca', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'wd', day: DAY } as never)).ok).toBe(true)
    clock.now += 60_000
    await a.w.refresh()
    expect(a.w.current().steps?.block).toBe('wd')
    // Another computer took the block out of the day's file; the bar has not counted since.
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [{ ...blockRaw, id: 'inny', startMin: 14 * 60 }], updatedAt: 1 })
    await a.w.act('step', 'wd|s1', 'bar')
    expect(a.w.current().note?.text).toBe('Tego bloku już nie ma w planie.')
    expect(read(paths.day(DAY)).stepsDone).toBeUndefined()
    await a.folder.close('quit')
  })

  it('blok zadania: ptaszek na pasku odhacza krok w bloku i w zadaniu, jedną edycją', async () => {
    write(paths.day(DAY), { schema: 1, date: DAY, blocks: [{ ...blockRaw, task: 't1' }] })
    const rel = paths.record('request', 't1')
    write(rel, { schema: 1, id: 't1', kind: 'task', title: 'Wdrożenie', estimateMin: 90, categoryId: 'inne', note: '', createdAt: 1, state: 'planned', day: DAY, block: 'wd', list: 'today', listDay: DAY, doneAt: null, steps })
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer('pca', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'wd', day: DAY } as never)).ok).toBe(true)
    clock.now += 60_000
    await a.w.refresh()
    await a.w.act('step', 'wd|s1', 'bar')
    expect(requestFrom(read(rel))!.steps.map((s) => s.done)).toEqual([true, false, false, false])
    expect(dayFileFrom(read(paths.day(DAY)), DAY).stepsDone.wd).toEqual(['s1'])
    await a.folder.close('quit')
  })
})

describe('kroki serii w turze zapisu (przegląd, T790)', () => {
  it('dzisiejsze wystąpienie zaczęte: „Cała seria” + krok A, potem + krok B z tego samego panelu – seria ma oba', async () => {
    const today = logicalDayOf(Date.now())
    const start = addDays(today, -7)
    const series: Series = {
      id: 'ang',
      root: 'ang',
      start,
      until: null,
      count: null,
      versions: [{ from: start, block: { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: [{ id: 's1', title: 'Słówka', order: 0, done: false }] }, rule: { kind: 'daily' }, special: 'held' }],
      archived: false
    }
    mkdirSync(join(dataDir, 'series'), { recursive: true })
    write(paths.record('series', 'ang'), seriesJson(series))
    // Today made and its occurrence begun (a start in the log): a change of the series leaves today's block as it is.
    const snapshot = createDay({ date: today, changes: [], templates: [], lectures: [], series: seriesPlans([series], typeOfDays([], () => null), marketDay), dayFile: null, holidays: marketDay, at: null })
    const id = seriesBlockId(today, 'ang')
    const t0 = dayStart(today)
    const base = { c: 'pcb', v: RULES_VERSION, day: today, dom: 'timer' }
    const lines = [
      { ...base, id: 'pcb-0', n: 0, t: t0, l: t0, k: 'day.create', snapshot },
      { ...base, id: 'pcb-1', n: 1, t: t0 + 60_000, l: t0 + 60_000, k: 'block.start', block: id, at: t0 + 60_000, bg: false, how: 'click', planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false } }
    ]
    mkdirSync(join(dataDir, 'log', today.slice(0, 4), today), { recursive: true })
    writeFileSync(join(dataDir, paths.log(today, 'pcb')), `${lines.map((x) => JSON.stringify(x)).join('\n')}\n`)
    const hub = new DataHub({ userData: join(root, 'appdata'), computer: () => 'pca', computerName: 'PC A', appVersion: '1.14.0', runId: `run-${Math.random()}`, holidays: marketDay, idleSeconds: () => 0, log: () => undefined, writeGuardPlan: false, extraBackupDir: () => null, previousVersion: () => null, onChange: () => undefined })
    try {
      expect(await hub.open(dataDir)).toBe(true)
      const target = { date: today, blockId: id }
      for (const [k, title] of [['A', 'Krok A'], ['B', 'Krok B']] as const) {
        const out = await hub.seriesChange(target, 'all', { stepsOp: { op: 'add', id: k, title, after: null } })
        expect([out.ok, out.error]).toEqual([true, null])
      }
      const onDisk = seriesFrom(read(paths.record('series', 'ang')))!
      expect(onDisk.versions.map((v) => [v.from, v.block.steps.map((x) => x.id)])).toEqual([
        [start, ['s1']],
        [today, ['s1', 'A', 'B']]
      ])
    } finally {
      await hub.close('quit')
    }
  })
})
