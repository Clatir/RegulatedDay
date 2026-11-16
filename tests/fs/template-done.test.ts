/**
 * „Zastosuj szablon” – „Dodaj jako zrealizowane” (D547, D549, D550) w procesie głównym, na prawdziwych plikach, jako JEDEN krok: fakty bloków
 * minionych (start „według planu” i koniec zrobiony w planowanych godzinach, oceniane na dniu z plikiem po zmianie) i zmiana plików dni;
 * dzień, którego wpis nie wszedł – bez faktów; przebieg prowadzącego w trakcie kroku nic nie pisze. „Cofnij” – najpierw ocena wszystkich
 * dni (odmowa jednego – nic), potem pliki i fakty; blok zmieniony od tego czasu zostaje. Dzień zamrożony – ocena od nowa.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { foldFacts } from '@shared/engine/facts'
import { gridOf } from '@shared/engine/grid'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder, type EditIn } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

const DAY = '2026-10-25' // a Sunday: no sessions in the default day
const BEFORE = addDays(DAY, -1)
let root: string
let dataDir: string
const b = (id: string, startMin: number, durationMin: number) => ({ id, categoryId: 'inne', startMin, durationMin, fixed: false, origin: 'template', sourceId: id })
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-template-done-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  // „x” 07:30–07:45 – your own, it ran.
  writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ ...b('x', 450, 15), origin: 'user' }] }))
  writeFileSync(join(dataDir, paths.day(BEFORE)), JSON.stringify({ schema: 1, date: BEFORE, blocks: [] }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(o: { fs?: DataFs } = {}, start = placeLogical(DAY, 7 * 60 + 30)) {
  const clock = { now: start }
  const folder = await DataFolder.open({
    fs: o.fs ?? nodeFs,
    dataDir,
    stateDir: join(root, 'state-pca'),
    computer: 'pca',
    computerName: 'PCA',
    appVersion: '1.29.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock, at: (min: number) => (clock.now = placeLogical(DAY, min)) }
}

type Logged = AnyEvent & { block?: string; at?: number; how?: string; done?: boolean; rule?: string | null; target?: string }
const events = async (f: DataFolder, day = DAY): Promise<Logged[]> => (await f.readDay(day)).events as Logged[]
const fileIds = (day = DAY): string[] => (JSON.parse(readFileSync(join(dataDir, paths.day(day)), 'utf8')) as { blocks: Array<{ id: string }> }).blocks.map((x) => x.id)
/** The edit „Zastosuj” sends for a day: its blocks into the file (one field per block – as `editOf` makes it). */
const entryOf = (day: string, blocks: ReadonlyArray<Record<string, unknown>>, o: Partial<EditIn> = {}): EditIn => ({ rel: paths.day(day), edits: blocks.map((x) => ({ path: ['blocks', `#${String(x.id)}`], base: undefined, value: x })), ...o })
/** Its inverse („Cofnij”): each block back to none, with its value after as the base (as `inverseEdit`). */
const inverseOf = (day: string, blocks: ReadonlyArray<Record<string, unknown>>): EditIn => ({ rel: paths.day(day), edits: blocks.map((x) => ({ path: ['blocks', `#${String(x.id)}`], base: x, value: undefined })) })
/** „x” ran 07:30–07:45. */
async function ranX(m: Awaited<ReturnType<typeof make>>) {
  await m.folder.timerClick({ a: 'start', block: 'x' })
  m.at(7 * 60 + 45)
  await m.folder.timerClick({ a: 'pause' })
}

describe('D547 – plik i fakty jednym krokiem', () => {
  it('miniony – start „według planu” i koniec zrobiony; nachodzący na bieg i przyszły – w planie bez zaliczenia, z powodem', async () => {
    const m = await make()
    await ranX(m)
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60), b('b', 420, 60), b('c', 720, 60)])], [{ day: DAY, ids: ['a', 'b', 'c'], entry: 0 }])
    expect(r.outcomes.map((o) => o.status)).toEqual(['applied'])
    expect(r.facts).toEqual([expect.objectContaining({ day: DAY, taken: ['a'], skipped: expect.arrayContaining([{ id: 'b', why: 'ran' }, { id: 'c', why: 'notPast' }]), closed: false })])
    const ofA = (await events(m.folder)).filter((e) => e.block === 'a')
    expect(ofA.map((e) => [e.k, e.at, e.how ?? e.done])).toEqual([
      ['block.start', placeLogical(DAY, 360), 'plan'],
      ['block.end', placeLogical(DAY, 420), true]
    ])
    expect(r.facts[0]!.written).toEqual(ofA.map((e) => e.id))
    expect(fileIds()).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('wpis, który nie wszedł (zapis odrzucony), zabiera fakty dnia – zdarzenia cofnięte, nic nie zostaje zaliczone', async () => {
    const m = await make()
    m.at(10 * 60)
    // A new file where one is: the queue refuses the whole edit.
    const p = m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)], { create: true })], [{ day: DAY, ids: ['a'], entry: 0 }])
    await expect(p).rejects.toThrow()
    const list = await events(m.folder)
    expect(foldFacts(gridOf(DAY), list).blocks.get('a')?.startedAt ?? null).toBeNull()
    expect(fileIds()).toEqual(['x'])
  })

  it('przebieg prowadzącego w trakcie kroku nie pisze nic z dnia; następny – tak', async () => {
    let hold: (() => void) | null = null
    let armed = false
    const gated: DataFs = {
      ...nodeFs,
      list: async (abs) => {
        if (armed && abs.includes(join('log', '2026', DAY))) {
          armed = false
          await new Promise<void>((res) => (hold = res))
        }
        return nodeFs.list(abs)
      }
    }
    const m = await make({ fs: gated }, placeLogical(DAY, 9 * 60))
    // A block runs: the leader writes its minutes at every pass.
    await m.folder.timerClick({ a: 'start', block: 'x' })
    for (let i = 0; i < 12; i++) {
      m.clock.now += 60_000
      m.folder.noteInput(m.clock.now, true)
      await m.folder.check()
    }
    const minutes = async () => (await events(m.folder)).filter((e) => e.k === 'minutes').length
    const before = await minutes()
    expect(before).toBeGreaterThan(0)
    m.clock.now += 5 * 60_000
    m.folder.noteInput(m.clock.now, true)
    armed = true
    const step = m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 30)])], [{ day: DAY, ids: ['a'], entry: 0 }])
    await expect.poll(() => hold != null).toBe(true)
    await m.folder.check()
    expect(await minutes()).toBe(before)
    hold!()
    await step
    await m.folder.check()
    expect(await minutes()).toBeGreaterThan(before)
  })
})

describe('„Cofnij” jednym krokiem', () => {
  it('pliki i fakty razem; drugi raz – nic więcej; zdarzenia nie tego kroku – odmowa', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60), b('c', 420, 15)])], [{ day: DAY, ids: ['a', 'c'], entry: 0 }])
    const written = r.facts[0]!.written
    expect(written).toHaveLength(4)
    const j = await m.folder.judgeTemplateUndo([{ day: DAY, written }])
    expect(j).toEqual({ ok: true, kept: [{ day: DAY, blocks: [] }] })
    m.at(10 * 60 + 5)
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60), b('c', 420, 15)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: [] }])
    expect(u.ok && u.undone).toEqual([{ day: DAY, blocks: ['a', 'c'] }])
    const undos = async () => (await events(m.folder)).filter((e) => e.k === 'undo').map((e) => e.target)
    expect((await undos()).sort()).toEqual([...written].sort())
    expect(fileIds()).toEqual(['x'])
    const x = (await events(m.folder)).filter((e) => e.k === 'undo')[0]!
    expect(await m.folder.judgeTemplateUndo([{ day: DAY, written: [x.id] }])).toMatchObject({ ok: false })
  })

  it('blok ze zdarzeniem od tego czasu (poprawka) zostaje, jaki jest; inaczej powiedziane – odmowa całego kroku, nic nie cofnięte', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60), b('c', 420, 15)])], [{ day: DAY, ids: ['a', 'c'], entry: 0 }])
    const written = r.facts[0]!.written
    m.folder.append({ day: DAY, dom: 'timer', k: 'block.fix', block: 'a', at: m.clock.now, start: null, end: placeLogical(DAY, 400) })
    expect(await m.folder.judgeTemplateUndo([{ day: DAY, written }])).toEqual({ ok: true, kept: [{ day: DAY, blocks: ['a'] }] })
    // The window was told nothing kept: refused, nothing written.
    const refused = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60), b('c', 420, 15)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: [] }])
    expect(refused.ok).toBe(false)
    expect((await events(m.folder)).filter((e) => e.k === 'undo')).toEqual([])
    expect(fileIds()).toEqual(expect.arrayContaining(['a', 'c']))
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('c', 420, 15)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: ['a'] }])
    expect(u.ok && u.undone).toEqual([{ day: DAY, blocks: ['c'] }])
    const facts = foldFacts(gridOf(DAY), await events(m.folder))
    expect(facts.blocks.get('a')!.startedAt).not.toBeNull()
    expect(facts.blocks.get('c')?.startedAt ?? null).toBeNull()
    expect(fileIds()).toEqual(expect.arrayContaining(['a']))
    expect(fileIds()).not.toContain('c')
  })
})

describe('D549, D550 – dni minione i zamknięte', () => {
  it('dzień miniony – każdy blok; dzień, który się jeszcze nie zaczął – odmowa', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }])
    expect(r.facts[0]!.taken).toEqual(['p'])
    expect((await events(m.folder, BEFORE)).filter((e) => e.block === 'p').map((e) => e.k)).toEqual(['block.start', 'block.end'])
    const next = addDays(DAY, 1)
    await expect(m.folder.applyTemplateDays([entryOf(next, [b('q', 360, 30)])], [{ day: next, ids: ['q'], entry: 0 }])).rejects.toThrow()
  })

  it('dzień zamrożony: ocena od nowa – nowe zamrożenie liczy fakty (wygrywa), linia mówi „zamknięty”; „Cofnij” – znów od nowa', async () => {
    const m = await make()
    m.at(10 * 60)
    // BEFORE frozen with nothing in it.
    m.folder.append({ day: BEFORE, dom: 'game', k: 'day.freeze', at: m.clock.now, how: 'timeout', know: {}, missing: [], grade: {} })
    const was = foldFacts(gridOf(BEFORE), await events(m.folder, BEFORE)).frozen!
    const r = await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }])
    expect(r.facts[0]).toMatchObject({ taken: ['p'], closed: true, regradeFailed: null })
    const frozen = () => events(m.folder, BEFORE).then((l) => foldFacts(gridOf(BEFORE), l).frozen!)
    const after = await frozen()
    expect(after.id).not.toBe(was.id)
    expect(after.know.pca).toBeGreaterThan(-1)
    m.at(10 * 60 + 5)
    const u = await m.folder.undoTemplateDays([inverseOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, written: r.facts[0]!.written, entry: 0 }], [{ day: BEFORE, blocks: [] }])
    expect(u.ok && u.closed).toEqual([BEFORE])
    const back = await frozen()
    expect(back.id).not.toBe(after.id)
    expect(back.know.pca).toBeGreaterThan(after.know.pca!)
  })
})
