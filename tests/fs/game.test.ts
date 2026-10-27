/**
 * The game in the data folder (E7, part one): the freeze stores the day's place in the game with its grade (the module
 * during the day from the first later change or the setting, the wizard's day outside), and the streak and notes count
 * from the files of grades of every computer, with the days still open to corrections counted as they would freeze.
 * Nothing counts before the first day with the game (T492).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { isKnown } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
const H = 3_600_000
let root: string
let dataDir: string

/** A line of a log as a computer writes it. */
const line = (day: string, c: string, n: number, k: string, at: number, extra: Record<string, unknown> = {}) => `${JSON.stringify({ id: `${c}-${n}`, c, n, t: at, l: at, v: 1, day, dom: 'meta', k, at, ...extra })}\n`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-game-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' }] }))
  // The wizard's day, long before: the first log in the folder.
  const first = '2026-09-01'
  mkdirSync(join(dataDir, paths.logDir(first)), { recursive: true })
  writeFileSync(join(dataDir, paths.log(first, 'pca')), line(first, 'pca', 0, 'presence.first', placeLogical(first, 8 * 60)))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(gameFrom: string | null, ritualFrom: string | null = DAY) {
  const clock = { now: placeLogical(DAY, 10 * 60) }
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.8.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true,
    ritualFrom,
    gameFrom
  })
  return { folder, clock }
}

/** A worked day: „a” 10:00–11:00 with „Koniec pracy”; the next morning a presence (the day is opened after its end). */
async function workedDay(gameFrom: string | null) {
  const m = await make(gameFrom)
  m.folder.noteInput(m.clock.now, true)
  await m.folder.check()
  await m.folder.timerClick({ a: 'start', block: 'a' })
  m.clock.now = placeLogical(DAY, 11 * 60)
  await m.folder.timerClick({ a: 'workEnd' })
  m.clock.now = placeLogical(addDays(DAY, 1), 8 * 60)
  m.folder.noteInput(m.clock.now, true)
  await m.folder.check()
  return m
}

async function freeze(m: Awaited<ReturnType<typeof make>>): Promise<Record<string, unknown>> {
  const from = placeLogical(addDays(DAY, 1), 8 * 60) + 24 * H
  for (let i = 0; i <= 12; i++) {
    m.clock.now = from + i * 60_000
    await m.folder.check()
  }
  const f = (await m.folder.readDay(DAY)).events.find((e) => isKnown(e) && e.k === 'day.freeze') as unknown as { grade: { game: Record<string, unknown> } } | undefined
  if (!f) throw new Error('dzień się nie zamroził')
  return f.grade.game
}

describe('gra przy zamrożeniu', () => {
  it('ocena niesie status, to, co dzień zdobył, i nuty', async () => {
    const game = await freeze(await workedDay('2026-10-01'))
    expect(game).toMatchObject({ v: 1, status: 'kept', out: null, earned: { boundary: true } })
    expect((game.notes as Record<string, number>).boundary).toBe(3)
  })

  it('przed pierwszym dniem z grą (T492) dzień jest poza grą, ale ocena zapisuje, co zdobył', async () => {
    const game = await freeze(await workedDay(null))
    expect(game).toMatchObject({ status: 'out', out: 'beforeGame', earned: { boundary: true }, notes: { boundary: 0 } })
  })

  it('moduł gry w dniu bez zmian: według pierwszej późniejszej zmiany (wyłączona następnego dnia – w tym dniu włączona)', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, general: { modules: { game: false } } }))
    const m = await workedDay('2026-10-01')
    const next = addDays(DAY, 1)
    m.folder.append({ day: next, dom: 'meta', k: 'module.set', at: placeLogical(next, 9 * 60), module: 'game', on: false, was: true })
    expect(await freeze(m)).toMatchObject({ status: 'kept' })
  })

  it('moduł gry bez żadnej zmiany: według ustawienia – wyłączona cały dzień, poza grą', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, general: { modules: { game: false } } }))
    expect(await freeze(await workedDay('2026-10-01'))).toMatchObject({ status: 'out', out: 'gameOff' })
  })

  it('dzień kreatora pierwszego komputera (pierwszy dzień z logiem) jest poza grą', async () => {
    rmSync(join(dataDir, 'log', '2026', '2026-09-01'), { recursive: true, force: true })
    const game = await freeze(await workedDay('2026-10-01'))
    expect(game).toMatchObject({ status: 'out', out: 'wizard' })
  })

  it('starszy log, który OneDrive przyniósł później, przesuwa dzień kreatora – wcześniej widziany dzień nie zostaje nim na zawsze', async () => {
    const old = join(dataDir, 'log', '2026', '2026-09-01')
    const kept = readFileSync(join(old, 'pca.jsonl'))
    rmSync(old, { recursive: true, force: true })
    const m = await workedDay('2026-10-01')
    // Counted once while 21.10 is the first day with a log.
    expect((await m.folder.gameState())!.steps.find((x) => x.date === DAY)?.move).toBe('skip')
    mkdirSync(old, { recursive: true })
    writeFileSync(join(old, 'pca.jsonl'), kept)
    expect(await freeze(m)).toMatchObject({ status: 'kept', out: null })
  })
})

describe('„Wymień” z okna', () => {
  it('zdarzenie wymiany, jak je pisze okno, trafia do logu dnia (dziedzina gry); wymiana bez ustępujących albo z długością 0 – odmowa', async () => {
    const m = await make('2026-10-01')
    await m.folder.userEvents([{ k: 'block.exchange', day: DAY, block: 'n', minutes: 60, yielding: [{ block: 'a', minutes: 60 }] }, { k: 'block.park', day: DAY, block: 'a', rule: 'exchange' }])
    const x = (await m.folder.readDay(DAY)).events.find((e) => isKnown(e) && e.k === 'block.exchange')
    expect(x).toMatchObject({ dom: 'game', block: 'n', minutes: 60, yielding: [{ block: 'a', minutes: 60 }] })
    await expect(m.folder.userEvents([{ k: 'block.exchange', day: DAY, block: 'n', minutes: 60, yielding: [] }])).rejects.toThrow(/yielding/)
    await expect(m.folder.userEvents([{ k: 'block.exchange', day: DAY, block: 'n', minutes: 0, yielding: [{ block: 'a', minutes: 60 }] }])).rejects.toThrow(/minutes/)
  })
})

describe('passa i nuty z folderu', () => {
  /** A line of a file of grades. */
  const grade = (day: string, status: string, notes: number, o: { v?: number; know?: Record<string, number> } = {}) =>
    `${JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: o.v ?? 1, how: 'ready', know: o.know ?? { pca: 10 }, missing: [], grade: { boundary: 'kept', game: { v: 1, status, out: null, notes: { boundary: notes } } } })}\n`

  it('bez gry (przed wersją z jej ekranami) albo bez zamrażania (przed ekranem rytuału): brak stanu gry', async () => {
    expect(await (await make(null)).folder.gameState()).toBeNull()
    expect(await (await make('2026-10-01', null)).folder.gameState()).toBeNull()
  })

  it('dzisiejszy dzień wolny: bez nut „w toku” (zamrozi się poza grą)', async () => {
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, dayType: 'wolne', blocks: [] }))
    const m = await make('2026-10-01')
    m.folder.noteInput(m.clock.now, true)
    await m.folder.check()
    const s = await m.folder.gameState()
    expect(s!.notes).toEqual({ final: 0, pending: 0 })
  })

  it('dzień bez oceny starszy niż okno korekty liczy się „w toku”, dopóki prowadzący go nie zamrozi', async () => {
    const d = '2026-10-15'
    mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(d, 'lap')), line(d, 'lap', 0, 'presence.first', placeLogical(d, 8 * 60)))
    const m = await make('2026-10-01', '2026-10-01')
    const s = await m.folder.gameState()
    // Presence only, the template's work without „Koniec pracy”: without data, holding the streak.
    expect(s!.steps).toEqual([{ date: d, move: 'held', streak: 0 }])
  })

  it('z plików ocen wszystkich komputerów (lepsza z dwóch ocen dnia), z dniami jeszcze otwartymi na poprawki i dzisiejszymi nutami „w toku”', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), grade('2026-10-14', 'kept', 6) + grade('2026-10-15', 'out', 0) + grade('2026-10-16', 'broken', 3) + grade('2026-10-19', 'kept', 6))
    // The laptop froze 16.10 counting more events: its grade wins. A day before the game does not count.
    writeFileSync(join(dataDir, paths.grades('2026', 'lap')), grade('2026-10-16', 'kept', 6, { know: { pca: 10, lap: 4 } }) + grade('2026-09-30', 'kept', 9) + 'zepsuta linia\n')
    const m = await workedDay('2026-10-01')
    const s = await m.folder.gameState()
    expect(s).not.toBeNull()
    // 14.10, 16.10, 19.10 frozen and kept; 21.10 open to corrections, counted as it would freeze now (kept).
    expect(s!.steps.map((x) => [x.date, x.move])).toEqual([
      ['2026-10-14', 'up'],
      ['2026-10-15', 'skip'],
      ['2026-10-16', 'up'],
      ['2026-10-19', 'up'],
      ['2026-10-21', 'up']
    ])
    expect(s!.streak).toBe(4)
    expect(s!.notes.final).toBe(18)
    expect(s!.notes.pending).toBeGreaterThan(0)
  })
})
