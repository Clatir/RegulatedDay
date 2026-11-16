/**
 * „Zastosuj szablon” – „Dodaj jako zrealizowane” (D547, D549, D550) w procesie głównym, na prawdziwych plikach, jako JEDEN krok: fakty bloków
 * minionych (start „według planu” i koniec zrobiony w planowanych godzinach, oceniane na dniu z plikiem po zmianie) i zmiana plików dni;
 * dzień, którego wpis nie wszedł – bez faktów; przebieg prowadzącego w trakcie kroku nic nie pisze. „Cofnij” – najpierw ocena wszystkich
 * dni (odmowa jednego – nic), potem pliki i fakty; blok zmieniony od tego czasu zostaje. Dzień zamrożony – ocena od nowa.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { foldFacts } from '@shared/engine/facts'
import { gridOf } from '@shared/engine/grid'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder, type EditIn } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import type { Worker } from '../../src/main/worker/host'

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

async function make(o: { fs?: DataFs; worker?: Worker } = {}, start = placeLogical(DAY, 7 * 60 + 30)) {
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
    oneDriveRunning: () => true,
    ...(o.worker ? { worker: o.worker } : {})
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

  it('edycja odrzucona przed kolejką (nowy plik tam, gdzie jest): nic nie zapisane – ani pliki, ani fakty, ani zapamiętane zaliczenia', async () => {
    const m = await make()
    m.at(10 * 60)
    const p = m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)]), entryOf(DAY, [b('a', 360, 60)], { create: true })], [{ day: BEFORE, ids: ['p'], entry: 0 }, { day: DAY, ids: ['a'], entry: 1 }])
    await expect(p).rejects.toThrow()
    expect((await events(m.folder, BEFORE)).filter((e) => e.block === 'p')).toEqual([])
    expect(fileIds()).toEqual(['x'])
    expect(fileIds(BEFORE)).toEqual([])
    expect(m.folder.queue.pending).toEqual([])
  })

  it('D552: plik dnia zajęty – wpis zostaje w kolejce, zaliczenia dopisują się w turze kolejki, która go kładzie; inny dzień stoi od razu', async () => {
    // DAY goes now; BEFORE's file cannot be written: its entry waits for the folder.
    const beforeAbs = join(dataDir, paths.day(BEFORE))
    let held = true
    const fsHeld: DataFs = {
      ...nodeFs,
      writeAtomic: async (abs, data) => {
        if (held && abs === beforeAbs) throw Object.assign(new Error('plik zajęty'), { code: 'EBUSY' })
        return nodeFs.writeAtomic(abs, data)
      }
    }
    const m = await make({ fs: fsHeld })
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)]), entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: DAY, ids: ['a'], entry: 0 }, { day: BEFORE, ids: ['p'], entry: 1 }])
    expect(r.outcomes.map((o) => o.status)).toEqual(['applied', 'waiting'])
    expect(r.facts.map((f) => [f.day, f.taken, !!f.pending])).toEqual([[DAY, ['a'], false], [BEFORE, [], true]])
    expect((await events(m.folder, BEFORE)).filter((e) => e.block === 'p')).toEqual([])
    expect(m.folder.queue.pending.map((e) => e.rel)).toEqual([paths.day(BEFORE)])
    // The folder is back: the run of the queue that lays the entry writes its facts, on the plan the folder holds.
    held = false
    await m.folder.edit([])
    expect(fileIds(BEFORE)).toContain('p')
    expect((await events(m.folder, BEFORE)).filter((e) => e.block === 'p').map((e) => e.k)).toEqual(['block.start', 'block.end'])
  })

  it('D552: „Cofnij” dnia, którego wpis wciąż czeka – wpis wycofany, zaliczeń nie ma i nie będzie', async () => {
    const beforeAbs = join(dataDir, paths.day(BEFORE))
    let held = true
    const fsHeld: DataFs = {
      ...nodeFs,
      writeAtomic: async (abs, data) => {
        if (held && abs === beforeAbs) throw Object.assign(new Error('plik zajęty'), { code: 'EBUSY' })
        return nodeFs.writeAtomic(abs, data)
      }
    }
    const m = await make({ fs: fsHeld })
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }])
    const pending = r.facts[0]!.pending!
    const u = await m.folder.undoTemplateDays([inverseOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, written: [], entry: 0, pending }], [{ day: BEFORE, blocks: [] }])
    expect(u.ok && u.undone).toEqual([{ day: BEFORE, blocks: [], stayed: [] }])
    expect(m.folder.queue.pending).toEqual([])
    held = false
    await m.folder.edit([])
    expect(fileIds(BEFORE)).toEqual([])
    expect((await events(m.folder, BEFORE)).filter((e) => e.block === 'p')).toEqual([])
  })

  it('wpis, który spotkał zmianę z innego komputera: nie zapisuje nic (w całości albo wcale), wycofany w tej samej turze, z powodem; bez faktów', async () => {
    const m = await make()
    m.at(10 * 60)
    // Another computer set the wake meanwhile: the window's entry changes it from what it saw (none) – a question about that field.
    const raw = JSON.parse(readFileSync(join(dataDir, paths.day(DAY)), 'utf8')) as Record<string, unknown>
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ ...raw, wakeMin: 7 * 60 }))
    const e = entryOf(DAY, [b('a', 360, 60), b('c', 720, 60)])
    const r = await m.folder.applyTemplateDays([{ ...e, edits: [...e.edits, { path: ['wakeMin'], base: undefined, value: 6 * 60 }] }], [{ day: DAY, ids: ['a'], entry: 0 }])
    expect(r.outcomes).toEqual([expect.objectContaining({ status: 'withdrawn', why: 'changed' })])
    expect(r.facts[0]).toMatchObject({ day: DAY, written: [], taken: [] })
    expect(r.facts[0]!.pending).toBeUndefined()
    expect((await events(m.folder)).filter((x) => x.block === 'a')).toEqual([])
    expect(fileIds()).toEqual(['x'])
    expect(m.folder.queue.pending).toEqual([])
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
    expect(u.ok && u.undone).toEqual([{ day: DAY, blocks: ['a', 'c'], stayed: [] }])
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
    expect(u.ok && u.undone).toEqual([{ day: DAY, blocks: ['c'], stayed: [] }])
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

describe('runda 2 – „Cofnij” i ocena od nowa', () => {
  it('odwrotność, która spotkała zmianę z innego komputera: wycofana, dzień nie cofnięty (bloki i fakty zostają), wynik to mówi', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)])], [{ day: DAY, ids: ['a'], entry: 0 }])
    const written = r.facts[0]!.written
    // Another computer changed the block meanwhile: the inverse (its base – the block as written) meets it.
    const raw = JSON.parse(readFileSync(join(dataDir, paths.day(DAY)), 'utf8')) as { blocks: Array<Record<string, unknown>> }
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ ...raw, blocks: raw.blocks.map((x) => (x.id === 'a' ? { ...x, durationMin: 45 } : x)) }))
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: [] }])
    expect(u.ok && u.notUndone).toEqual([DAY])
    expect((await events(m.folder)).filter((e) => e.k === 'undo')).toEqual([])
    expect(fileIds()).toContain('a')
    expect(m.folder.queue.pending).toEqual([])
  })

  it('blok, który po odwrotności został w planie, zachowuje fakty („został”); usunięcie pliku przechodzi przez kolejkę', async () => {
    const m = await make()
    m.at(10 * 60)
    // NEXT has no file: „Zastosuj” makes it (create); its inverse removes it (`remove`, no fields).
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60), b('c', 420, 15)]), { rel: paths.day(BEFORE), create: false, edits: [{ path: ['blocks', '#p'], base: undefined, value: b('p', 20 * 60, 60) }] }], [{ day: DAY, ids: ['a', 'c'], entry: 0 }, { day: BEFORE, ids: ['p'], entry: 1 }])
    const [fa, fb] = r.facts
    // The window kept „c” in the file (its inverse without it): its facts stay.
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60)]), inverseOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: DAY, written: fa!.written, entry: 0 }, { day: BEFORE, written: fb!.written, entry: 1 }], [{ day: DAY, blocks: [] }, { day: BEFORE, blocks: [] }])
    expect(u.ok && u.undone).toEqual([{ day: DAY, blocks: ['a'], stayed: ['c'] }, { day: BEFORE, blocks: ['p'], stayed: [] }])
    const facts = foldFacts(gridOf(DAY), await events(m.folder))
    expect(facts.blocks.get('c')!.startedAt).not.toBeNull()
    expect(facts.blocks.get('a')?.startedAt ?? null).toBeNull()
  })

  it('odwrotność usuwająca plik (`remove`, bez pól) idzie przez kolejkę', async () => {
    const m = await make()
    m.at(10 * 60)
    const next = '2026-10-22'
    const made = { schema: 1, date: next, blocks: [b('q', 20 * 60, 60)] }
    const r = await m.folder.applyTemplateDays([{ rel: paths.day(next), create: true, edits: Object.entries(made).map(([k, v]) => ({ path: [k], base: undefined, value: v })) }], [{ day: next, ids: ['q'], entry: 0 }])
    expect(r.facts[0]!.taken).toEqual(['q'])
    const u = await m.folder.undoTemplateDays([{ rel: paths.day(next), remove: true, edits: [], base: made }], [{ day: next, written: r.facts[0]!.written, entry: 0 }], [{ day: next, blocks: [] }])
    expect(u.ok && u.undone).toEqual([{ day: next, blocks: ['q'], stayed: [] }])
    expect(existsSync(join(dataDir, paths.day(next)))).toBe(false)
  })

  it('wyjątek po plikach: także wpis, który zapisał część (pytanie o inne pole), wraca w całości', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)]), entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: DAY, ids: ['a'], entry: 0 }, { day: BEFORE, ids: ['p'], entry: 1 }])
    // DAY's inverse also sets the wake back – another computer changed it meanwhile: a question about it, „a” goes all the same.
    const raw = JSON.parse(readFileSync(join(dataDir, paths.day(DAY)), 'utf8')) as Record<string, unknown>
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ ...raw, wakeMin: 7 * 60 }))
    const inv = inverseOf(DAY, [b('a', 360, 60)])
    const partial = { ...inv, edits: [...inv.edits, { path: ['wakeMin'], base: 6 * 60, value: undefined }] }
    const inner = m.folder as unknown as { writeOn: (...a: unknown[]) => Promise<unknown> }
    const spy = vi.spyOn(inner, 'writeOn').mockRejectedValueOnce(new Error('log zajęty'))
    const u = await m.folder.undoTemplateDays([partial, inverseOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: DAY, written: r.facts[0]!.written, entry: 0 }, { day: BEFORE, written: r.facts[1]!.written, entry: 1 }], [{ day: DAY, blocks: [] }, { day: BEFORE, blocks: [] }])
    spy.mockRestore()
    expect(u.ok).toBe(false)
    expect(fileIds()).toContain('a')
    expect(fileIds(BEFORE)).toContain('p')
    expect(m.folder.queue.pending).toEqual([])
  })

  it('zapis cofnięcia faktów pada po plikach: pliki wracają, fakty stoją, ponowne „Cofnij” działa', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)])], [{ day: DAY, ids: ['a'], entry: 0 }])
    const written = r.facts[0]!.written
    const inner = m.folder as unknown as { writeOn: (...a: unknown[]) => Promise<unknown> }
    const spy = vi.spyOn(inner, 'writeOn').mockRejectedValueOnce(new Error('log zajęty'))
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: [] }])
    spy.mockRestore()
    expect(u.ok).toBe(false)
    expect(fileIds()).toContain('a')
    expect(foldFacts(gridOf(DAY), await events(m.folder)).blocks.get('a')!.startedAt).not.toBeNull()
    const again = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60)])], [{ day: DAY, written, entry: 0 }], [{ day: DAY, blocks: [] }])
    expect(again.ok && again.undone).toEqual([{ day: DAY, blocks: ['a'], stayed: [] }])
    expect(fileIds()).not.toContain('a')
    expect(foldFacts(gridOf(DAY), await events(m.folder)).blocks.get('a')?.startedAt ?? null).toBeNull()
  })

  it('jedno odczytanie wejść (z kolejką) na krok, niezależnie od liczby dni', async () => {
    const m = await make()
    m.at(10 * 60)
    const inner = m.folder as unknown as { inputs: (own?: boolean) => Promise<unknown> }
    const spy = vi.spyOn(inner, 'inputs')
    await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)]), entryOf(DAY, [b('a', 360, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }, { day: DAY, ids: ['a'], entry: 1 }])
    expect(spy.mock.calls.filter((c) => c[0] === true)).toHaveLength(1)
    spy.mockRestore()
  })

  it('odwrotność, która spotkała zmianę: powód w wyniku („Cofnij” mówi właściwy tekst)', async () => {
    const m = await make()
    m.at(10 * 60)
    const r = await m.folder.applyTemplateDays([entryOf(DAY, [b('a', 360, 60)])], [{ day: DAY, ids: ['a'], entry: 0 }])
    const raw = JSON.parse(readFileSync(join(dataDir, paths.day(DAY)), 'utf8')) as { blocks: Array<Record<string, unknown>> }
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ ...raw, blocks: raw.blocks.map((x) => (x.id === 'a' ? { ...x, durationMin: 45 } : x)) }))
    const u = await m.folder.undoTemplateDays([inverseOf(DAY, [b('a', 360, 60)])], [{ day: DAY, written: r.facts[0]!.written, entry: 0 }], [{ day: DAY, blocks: [] }])
    expect(u.ok && u.outcomes).toEqual([expect.objectContaining({ status: 'withdrawn', why: 'changed' })])
  })
})

describe('runda 3 – ocena od nowa (D550)', () => {
  const regradeFile = () => join(root, 'state-pca', 'regrade.json')
  /** Checks until the computer is settled (and a bit more). */
  async function settle(m: Awaited<ReturnType<typeof make>>) {
    for (let i = 0; i < 12; i++) {
      m.clock.now += 60_000
      m.folder.noteInput(m.clock.now, true)
      await m.folder.check()
    }
  }
  const failing: Worker = { run: async () => { throw new Error('pomocnik padł') } }

  it('dzień z listy, który nie jest zamrożony (nie ma czego oceniać) – zdjęty z listy', async () => {
    mkdirSync(join(root, 'state-pca'), { recursive: true })
    writeFileSync(regradeFile(), JSON.stringify({ days: [BEFORE] }))
    const m = await make({}, placeLogical(DAY, 9 * 60))
    await settle(m)
    expect(JSON.parse(readFileSync(regradeFile(), 'utf8'))).toEqual({ days: [] })
  })

  it('nieudana ocena przy nieczytelnej liście – lista nie jest nadpisywana; w dymku „Cofnij” dzień nie jest „przeliczony”', async () => {
    mkdirSync(join(root, 'state-pca'), { recursive: true })
    writeFileSync(regradeFile(), '{ to nie jest JSON')
    const m = await make({ worker: failing })
    m.at(10 * 60)
    m.folder.append({ day: BEFORE, dom: 'game', k: 'day.freeze', at: m.clock.now, how: 'timeout', know: {}, missing: [], grade: {} })
    const r = await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }])
    expect(r.facts[0]).toMatchObject({ regradeLater: false })
    expect(r.facts[0]!.regradeFailed).toBeTruthy()
    expect(readFileSync(regradeFile(), 'utf8')).toBe('{ to nie jest JSON')
    const u = await m.folder.undoTemplateDays([inverseOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, written: r.facts[0]!.written, entry: 0 }], [{ day: BEFORE, blocks: [] }])
    expect(u.ok && [u.closed, u.regradeLater, u.regradeFailed]).toEqual([[], [], [BEFORE]])
  })

  it('dane gry nieczytelne przy ocenie: krok nie jest odrzucany, dzień czeka na późniejszą ocenę', async () => {
    const m = await make()
    m.at(10 * 60)
    m.folder.append({ day: BEFORE, dom: 'game', k: 'day.freeze', at: m.clock.now, how: 'timeout', know: {}, missing: [], grade: {} })
    const inner = m.folder as unknown as { gameInputs: (...a: unknown[]) => Promise<unknown> }
    const spy = vi.spyOn(inner, 'gameInputs').mockRejectedValue(new Error('rd.json nieczytelny'))
    const r = await m.folder.applyTemplateDays([entryOf(BEFORE, [b('p', 20 * 60, 60)])], [{ day: BEFORE, ids: ['p'], entry: 0 }])
    spy.mockRestore()
    expect(r.facts[0]).toMatchObject({ taken: ['p'], regradeLater: true })
    expect(JSON.parse(readFileSync(regradeFile(), 'utf8'))).toEqual({ days: [BEFORE] })
  })

  it('dzień z listy, którego plik czeka w kolejce – nie oceniany, dopóki plik nie wejdzie do folderu', async () => {
    const beforeAbs = join(dataDir, paths.day(BEFORE))
    let fail = true
    const held: DataFs = {
      ...nodeFs,
      writeAtomic: async (abs, data) => {
        if (fail && abs === beforeAbs) throw Object.assign(new Error('plik zajęty'), { code: 'EBUSY' })
        return nodeFs.writeAtomic(abs, data)
      }
    }
    const m = await make({ fs: held }, placeLogical(DAY, 9 * 60))
    m.folder.append({ day: BEFORE, dom: 'game', k: 'day.freeze', at: m.clock.now, how: 'timeout', know: {}, missing: [], grade: {} })
    m.folder.append({ day: BEFORE, dom: 'timer', k: 'block.fix', block: 'z', at: m.clock.now, start: null, end: null })
    const was = foldFacts(gridOf(BEFORE), await events(m.folder, BEFORE)).frozen!
    mkdirSync(join(root, 'state-pca'), { recursive: true })
    writeFileSync(regradeFile(), JSON.stringify({ days: [BEFORE] }))
    await m.folder.edit([{ rel: paths.day(BEFORE), edits: [{ path: ['wakeMin'], base: undefined, value: 6 * 60 }] }])
    await settle(m)
    expect(JSON.parse(readFileSync(regradeFile(), 'utf8'))).toEqual({ days: [BEFORE] })
    expect(foldFacts(gridOf(BEFORE), await events(m.folder, BEFORE)).frozen!.id).toBe(was.id)
    fail = false
    await settle(m)
    expect(JSON.parse(readFileSync(regradeFile(), 'utf8'))).toEqual({ days: [] })
    expect(foldFacts(gridOf(BEFORE), await events(m.folder, BEFORE)).frozen!.id).not.toBe(was.id)
  })
})
