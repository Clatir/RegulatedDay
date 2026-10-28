/**
 * The game in the data folder (E7, part one): the freeze stores the day's place in the game with its grade (the module
 * during the day from the first later change or the setting, the wizard's day outside), and the streak and notes count
 * from the files of grades of every computer, with the days still open to corrections counted as they would freeze.
 * Nothing counts before the first day with the game (T492).
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import type { GameView } from '@shared/engine/progress'
import { isKnown, RULES_VERSION } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess, type Worker } from '../../src/main/worker/host'

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

async function make(gameFrom: string | null, ritualFrom: string | null = DAY, worker?: Worker, rulesVersion?: number) {
  const clock = { now: placeLogical(DAY, 10 * 60) }
  const folder = await DataFolder.open({
    ...(worker ? { worker } : {}),
    ...(rulesVersion ? { rulesVersion } : {}),
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
async function workedDay(gameFrom: string | null, rulesVersion?: number) {
  const m = await make(gameFrom, DAY, undefined, rulesVersion)
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

  it('dzień gry zamrożony przez starszą wersję reguł jako „przed grą”: wersja z grą ocenia go ponownie do tych samych zdarzeń, nowsza ocena wygrywa (z przeglądu)', async () => {
    // A computer still on the version before the game (rules 1) froze the day while this one was closed.
    const old = await workedDay(null, 1)
    expect(await freeze(old)).toMatchObject({ status: 'out', out: 'beforeGame' })
    const at = old.clock.now
    await old.folder.close('quit')
    const m = await make('2026-10-01')
    for (let i = 1; i <= 12; i++) {
      m.clock.now = at + i * 60_000
      await m.folder.check()
    }
    const freezes = (await m.folder.readDay(DAY)).events.filter((e) => isKnown(e) && e.k === 'day.freeze') as unknown as Array<{ v: number; know: Record<string, number>; grade: { game: { status: string } } }>
    expect(freezes.map((f) => [f.v, f.grade.game.status])).toEqual([
      [1, 'out'],
      [RULES_VERSION, 'kept']
    ])
    expect(freezes[1]!.know).toEqual(freezes[0]!.know)
    const game = (await m.folder.gameState())!
    expect(game.notes.final).toBeGreaterThanOrEqual(3)
    expect(game.steps.find((s) => s.date === DAY)?.move).toBe('up')
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
    expect(s!.steps).toEqual([{ date: d, move: 'held', streak: 0, frozen: false }])
  })

  it('liczona raz na zmianę (T501): dzień otwarty ocenia proces pomocniczy tylko po zmianie jego logu albo pliku dnia, a bez zmian widok jest ten sam', async () => {
    const d = '2026-10-15'
    mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(d, 'lap')), line(d, 'lap', 0, 'presence.first', placeLogical(d, 8 * 60)))
    let grades = 0
    const counting: Worker = {
      run: (task) => {
        if (task.kind === 'grade') grades++
        return inProcess.run(task)
      }
    }
    const m = await make('2026-10-01', '2026-10-01', counting)
    const first = await m.folder.gameState()
    expect(await m.folder.gameState()).toBe(first)
    expect(grades).toBe(1)
    // The laptop's log of the day grows (OneDrive brought more): counted again.
    appendFileSync(join(dataDir, paths.log(d, 'lap')), line(d, 'lap', 1, 'observe.alive', placeLogical(d, 9 * 60)))
    await m.folder.gameState()
    expect(grades).toBe(2)
    // The day's file comes (a free day): counted again, now outside the game.
    writeFileSync(join(dataDir, paths.day(d)), JSON.stringify({ schema: 1, date: d, dayType: 'wolne', blocks: [] }))
    const free = await m.folder.gameState()
    expect(grades).toBe(3)
    expect(free!.steps.map((x) => x.move)).toEqual(['skip'])
  })

  it('liczona raz na zmianę (T501): nowa ocena w pliku ocen liczy się od razu', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), grade('2026-10-14', 'kept', 6))
    const m = await make('2026-10-01')
    expect((await m.folder.gameState())!.notes.final).toBe(6)
    appendFileSync(join(dataDir, paths.grades('2026', 'pca')), grade('2026-10-15', 'kept', 3))
    expect((await m.folder.gameState())!.notes.final).toBe(9)
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
    // The room from the frozen notes; the week of 12.10 closed by its Sunday? Not frozen – no cassette yet.
    expect(s!.room.unlocked.map((x) => x.id)).toEqual(['roslina-1'])
    expect(s!.cassettes).toEqual([])
  })

  it('kaseta tygodnia z zamrożoną niedzielą: ulubiona regeneracja z minut zapisanych w ocenach', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    const withWays = (day: string, ways: Record<string, number>) =>
      `${JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: 1, how: 'ready', know: { pca: 10 }, missing: [], grade: { boundary: 'kept', game: { v: 1, status: 'kept', out: null, notes: { boundary: 3 } }, regenWays: ways } })}\n`
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), [5, 6, 7, 8, 9, 10, 11].map((d) => withWays(`2026-10-${String(d).padStart(2, '0')}`, d === 7 ? { spacer: 90 } : { drzemka: 20 })).join(''))
    const m = await make('2026-10-01')
    const s = await m.folder.gameState()
    expect(s!.cassettes).toEqual([{ week: '2026-10-05', season: 'autumn', favourite: 'drzemka', kept: 7, counted: 7, sticker: true }])
  })

  it('zamrożenie zapisuje w ocenie minuty regeneracji według sposobu (okładka kasety)', async () => {
    const m = await workedDay('2026-10-01')
    m.folder.append({ day: DAY, dom: 'timer', k: 'disconnect.start', at: placeLogical(DAY, 20 * 60) })
    m.folder.append({ day: DAY, dom: 'timer', k: 'disconnect.end', at: placeLogical(DAY, 20 * 60 + 30) })
    await freeze(m)
    const f = (await m.folder.readDay(DAY)).events.find((e) => isKnown(e) && e.k === 'day.freeze') as unknown as { grade: { regenWays: Record<string, number> } }
    expect(f.grade.regenWays).toEqual({ odcinam: 30 })
  })
})

describe('„Strona B tygodnia” i kalibracja z folderu', () => {
  it('Strona B tygodnia, który się skończył: dni z ich miarą, wstępna do zamrożenia niedzieli', async () => {
    const m = await workedDay('2026-10-01')
    m.clock.now = placeLogical('2026-10-27', 9 * 60)
    const b = await m.folder.sideB()
    expect(b.week).toBe('2026-10-19')
    expect(b.preliminary).toBe(true)
    expect(b.days.find((d) => d.date === DAY)).toMatchObject({ boundary: 'kept', disconnects: 0, signals: 0, projectsMin: 0 })
    expect(b.totals.boundaries.kept).toBeGreaterThanOrEqual(1)
  })

  /** A day closed by the ritual, frozen, with five blocks of analysis (60 min planned, 80 real) clicked on this computer. */
  function calibrationDay(day: string): string {
    const lines: string[] = []
    let n = 0
    const ev = (k: string, at: number, extra: Record<string, unknown> = {}) => lines.push(`${JSON.stringify({ id: `pca-${day}-${n}`, c: 'pca', n: n++, t: at, l: at, v: 1, day, dom: 'timer', k, at, ...extra })}`)
    ev('presence.first', placeLogical(day, 7 * 60))
    for (let i = 0; i < 5; i++) {
      const from = placeLogical(day, 8 * 60 + i * 90)
      ev('block.start', from, { block: `b${i}`, bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 60, tag: null, fixed: false }, confirmUntil: null, how: 'click' })
      ev('block.end', from + 80 * 60_000, { block: `b${i}`, done: true, rule: null })
    }
    ev('ritual.close', placeLogical(day, 21 * 60), { how: 'ritual' })
    return lines.join('\n') + '\n'
  }

  it('okres kalibracji od pierwszego rytuału, propozycja czasu z bloków jego dni; w okresie reakcje energii bez wariantów', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    const grade = (day: string) => `${JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: 1, how: 'ready', know: { pca: 100 }, missing: [], grade: { boundary: 'kept', closed: 'ritual', dayType: 'zwykly' } })}\n`
    const first = '2026-10-12'
    const list = [0, 1, 2, 3, 4].map((i) => addDays(first, i))
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), list.map(grade).join(''))
    for (const d of list) {
      mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
      writeFileSync(join(dataDir, paths.log(d, 'pca')), calibrationDay(d))
    }
    const m = await make('2026-10-01')
    const c = await m.folder.calibration()
    expect(c.period).toMatchObject({ from: first, done: false, days: list })
    // 25 samples of analysis, real ÷ planned = 80 / 60.
    expect(c.time).toEqual([expect.objectContaining({ category: 'analiza', samples: 25, multiplier: 1.33 })])
    // The bar's energy in the period: reactions only inform.
    expect((await m.folder.widgetModel()).energy.variants).toBe(false)
  })

  it('odczuwany koszt z rytuału w kalibracji: ostatnia odpowiedź dnia dla każdej kategorii, dni każdej odpowiedzi (D319)', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    const grade = (day: string) => `${JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: 1, how: 'ready', know: { pca: 100 }, missing: [], grade: { boundary: 'kept', closed: 'ritual', dayType: 'zwykly' } })}\n`
    const days = ['2026-10-12', '2026-10-13']
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), days.map(grade).join(''))
    const felt = (d: string, n: number, feel: string) => line(d, 'pca', n, 'cost.felt', placeLogical(d, 21 * 60 + n), { dom: 'energy', category: 'analiza', feel })
    for (const d of days) mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
    // The first day changed its mind: „lżej”, then „ciężej” – the last counts.
    writeFileSync(join(dataDir, paths.log(days[0]!, 'pca')), felt(days[0]!, 0, 'lighter') + felt(days[0]!, 1, 'heavier'))
    // The second day frozen after its „jak zwykle”: an answer that came after the freeze is outside it (z przeglądu).
    const freeze = line(days[1]!, 'pca', 1, 'day.freeze', placeLogical(addDays(days[1]!, 2), 9 * 60), { dom: 'game', how: 'ready', know: { pca: 0 }, missing: [], grade: { boundary: 'kept', closed: 'ritual', dayType: 'zwykly' } })
    writeFileSync(join(dataDir, paths.log(days[1]!, 'pca')), felt(days[1]!, 0, 'usual') + freeze + felt(days[1]!, 2, 'lighter'))
    const m = await make('2026-10-01')
    expect((await m.folder.calibration()).felt).toEqual({ analiza: { lighter: 0, usual: 1, heavier: 1 } })
  })

  it('poza okresem kalibracji (przed pierwszym rytuałem) reakcje energii mają warianty', async () => {
    const m = await make('2026-10-01')
    expect((await m.folder.calibration()).period).toBeNull()
    expect((await m.folder.widgetModel()).energy.variants).toBe(true)
  })

  it('pliki ocen, których nie da się teraz przeczytać, nie zatrzymują paska (ostatnia odpowiedź zostaje)', async () => {
    // „grades” is a file: listing it fails (as OneDrive mid-sync can).
    writeFileSync(join(dataDir, 'grades'), 'x')
    const m = await make('2026-10-01')
    const w = await m.folder.widgetModel()
    expect(w.energy.variants).toBe(true)
  })

  it('dzień sprzed pierwszego dnia rytuału nie liczy się do okresu, choć ma log z zamknięciem', async () => {
    const d = '2026-10-11'
    mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(d, 'pca')), `${JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: placeLogical(d, 21 * 60), l: placeLogical(d, 21 * 60), v: 1, day: d, dom: 'timer', k: 'ritual.close', at: placeLogical(d, 21 * 60), how: 'ritual' })}\n`)
    const m = await make('2026-10-01', '2026-10-15')
    expect((await m.folder.calibration()).period).toBeNull()
  })

  it('dzień zamknięty rytuałem, a jeszcze bez oceny, liczy się do okresu także starszy niż 4 dni', async () => {
    const d = '2026-10-11'
    mkdirSync(join(dataDir, paths.logDir(d)), { recursive: true })
    writeFileSync(join(dataDir, paths.log(d, 'pca')), line(d, 'pca', 0, 'presence.first', placeLogical(d, 8 * 60)) + `${JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: placeLogical(d, 21 * 60), l: placeLogical(d, 21 * 60), v: 1, day: d, dom: 'timer', k: 'ritual.close', at: placeLogical(d, 21 * 60), how: 'ritual' })}\n`)
    const m = await make('2026-10-01', '2026-10-01')
    expect((await m.folder.calibration()).period).toMatchObject({ from: d, days: [d] })
  })

  it('Strona B nie mierzy dnia bez Twojej obecności (dzień utworzony, a nikogo przy komputerze)', async () => {
    const m = await workedDay('2026-10-01')
    const empty = '2026-10-20'
    m.folder.append({ day: empty, dom: 'meta', k: 'observe.alive', at: placeLogical(empty, 9 * 60) })
    m.clock.now = placeLogical('2026-10-27', 9 * 60)
    const b = await m.folder.sideB()
    expect(b.days.map((d) => d.date)).not.toContain(empty)
    expect(b.days.map((d) => d.date)).toContain(DAY)
  })
})

describe('świętowanie raz na tym komputerze (T510)', () => {
  const cel = (date: string, key: string) => ({ key, kind: 'room' as const, date, streak: null, item: { id: key, name: key, notes: 30 } })

  it('pierwszy raz (komputer bez pamięci): święta sprzed wczoraj uznane za pokazane; pokazane już nie wracają', async () => {
    const m = await make('2026-10-01')
    const view = { celebrations: [cel('2026-10-10', 'old'), cel('2026-10-20', 'yesterday'), cel('2026-10-21', 'today')] } as unknown as GameView
    expect((await m.folder.celebrationsDue(view, '2026-10-21')).map((c) => c.key)).toEqual(['yesterday', 'today'])
    await m.folder.markCelebrated(['yesterday'])
    expect((await m.folder.celebrationsDue(view, '2026-10-21')).map((c) => c.key)).toEqual(['today'])
    // A later celebration is news again.
    const later = { celebrations: [...view.celebrations, cel('2026-10-25', 'later')] } as unknown as GameView
    expect((await m.folder.celebrationsDue(later, '2026-10-26')).map((c) => c.key)).toEqual(['today', 'later'])
  })

  it('pamięć, której nie da się odczytać: żadnego świętowania teraz i nic jej nie nadpisuje (z przeglądu: seria starych świąt)', async () => {
    const m = await make('2026-10-01')
    mkdirSync(join(root, 'state'), { recursive: true })
    writeFileSync(join(root, 'state', 'celebrated.json'), '{"shown": ["a"')
    const view = { celebrations: [cel('2026-10-21', 'today')] } as unknown as GameView
    expect(await m.folder.celebrationsDue(view, '2026-10-21')).toEqual([])
    await expect(m.folder.markCelebrated(['today'])).rejects.toThrow()
    expect(readFileSync(join(root, 'state', 'celebrated.json'), 'utf8')).toBe('{"shown": ["a"')
  })

  it('zapisy pamięci po kolei: dwa naraz nie gubią żadnego klucza (z przeglądu)', async () => {
    const m = await make('2026-10-01')
    await Promise.all([m.folder.markCelebrated(['a']), m.folder.markCelebrated(['b']), m.folder.markCelebrated(['c'])])
    expect((JSON.parse(readFileSync(join(root, 'state', 'celebrated.json'), 'utf8')) as { shown: string[] }).shown.sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('pokój na zawsze', () => {
  it('raz odblokowany element zostaje, choć nuty zamrożonych dni policzono potem niżej', async () => {
    mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
    const line6 = (day: string, notes: number, v = 1) => `${JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v, how: 'ready', know: { pca: 10 }, missing: [], grade: { boundary: 'kept', game: { v: 1, status: 'kept', out: null, notes: { boundary: notes } } } })}\n`
    writeFileSync(join(dataDir, paths.grades('2026', 'pca')), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) => line6(d, 8)).join(''))
    const m = await make('2026-10-01')
    expect((await m.folder.gameState())!.room.unlocked.map((x) => x.id)).toContain('plyta-1')
    // A newer freeze of two days with fewer notes (16 instead of 32 in all, below 30): the record stays.
    writeFileSync(join(dataDir, paths.grades('2026', 'lap')), ['2026-10-12', '2026-10-13'].map((d) => line6(d, 0, 2)).join(''))
    const again = (await m.folder.gameState())!
    expect(again.notes.final).toBe(16)
    expect(again.room.unlocked.map((x) => x.id)).toContain('plyta-1')
  })
})
