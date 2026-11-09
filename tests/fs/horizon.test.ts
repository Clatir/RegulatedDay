/**
 * The week and the month's goals in the data folder (D356): the days as this computer sees them (your queued edits
 * included), each counted by the helper process and again only when what it is made of changed (today also every
 * minute); a frozen day by its grade; a day whose file cannot be read – unknown, never empty; the goals as fields of
 * rd.json through the queue, one change at a time.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay } from '@shared/engine/createDay'
import { NO_GOALS } from '@shared/model/goals'
import { dayFileFrom } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { DataHub } from '../../src/main/data/hub'
import type { RdApi } from '@shared/api'
import type { MonthGoals } from '@shared/model/goals'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess } from '../../src/main/worker/host'

/** A Tuesday with study 10:00–11:00 in its file; the week from Monday 2.11. */
const TUE = '2026-11-03'
const WED = '2026-11-04'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-horizon-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  writeFileSync(join(dataDir, paths.day(TUE)), JSON.stringify({ schema: 1, date: TUE, blocks: [{ id: 'n', categoryId: 'nauka', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' }] }))
  writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, goals: { '2026-10': { study: 30, regen: 15 }, '2026-11': { study: 40 } } }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** The helper process of the folder: `fails` – the days whose count fails (a time limit, a restart of the process). */
async function make(o: { fails?: (date: string) => boolean; slowMs?: number; hold?: (date: string) => Promise<void> | null } = {}) {
  const clock = { now: placeLogical(TUE, 9 * 60) }
  const runs: string[] = []
  const logged: Array<[string, string]> = []
  const run = (t: Parameters<typeof inProcess.run>[0]) => {
    const held = t.kind === 'horizon' ? o.hold?.(t.ctx.date) : null
    if (held) return held.then(() => inProcess.run(t))
    if (t.kind === 'horizon' && o.fails?.(t.ctx.date)) return Promise.reject(new Error('proces pomocniczy: przekroczony czas zadania'))
    // A real helper process answers later (a message from another process): asks at the same time overlap.
    if (t.kind === 'horizon' && o.slowMs) return new Promise((done) => setTimeout(done, o.slowMs)).then(() => inProcess.run(t))
    return inProcess.run(t)
  }
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '1.2.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true,
    worker: { run: (t) => (runs.push(t.kind === 'horizon' ? `${t.kind}:${t.ctx.date}` : t.kind), run(t)) as never },
    log: (level, msg) => logged.push([level, msg])
  })
  return { folder, clock, runs, logged, at: (date: string, min: number) => (clock.now = placeLogical(date, min)) }
}

/** Your presence and study 10:00–11:00 on Tuesday, then Wednesday 12:00. */
async function studied(o: Parameters<typeof make>[0] = {}) {
  const m = await make(o)
  m.at(TUE, 10 * 60)
  // Your presence that day (the first use of a computer – `noteInput` writes it).
  m.folder.append({ day: TUE, dom: 'meta', k: 'presence.first', at: placeLogical(TUE, 9 * 60) })
  await m.folder.timerClick({ a: 'start', block: 'n' })
  m.at(TUE, 11 * 60)
  await m.folder.timerClick({ a: 'next' })
  m.at(WED, 12 * 60)
  return m
}

describe('tydzień w folderze danych', () => {
  it('siedem dni: miniony jak było, dziś, przyszłe z planu – każdy liczony raz przez proces pomocniczy', async () => {
    const { folder, runs, at } = await studied()
    const w = await folder.weekView(WED)
    expect(w.week).toBe('2026-11-02')
    expect(w.days.map((d) => [d.date, d.when])).toEqual([
      ['2026-11-02', 'past'],
      [TUE, 'past'],
      [WED, 'today'],
      ['2026-11-05', 'future'],
      ['2026-11-06', 'future'],
      ['2026-11-07', 'future'],
      ['2026-11-08', 'future']
    ])
    const tue = w.days[1]!
    expect(tue.blocks.find((b) => b.id === 'n')).toMatchObject({ state: 'ran', startMin: 10 * 60, endMin: 11 * 60 })
    expect(tue.studyMin).toBe(60)
    // Monday has no log (no presence): free, as its freeze would make it.
    expect(w.days[0]!.boundary).toBe('free')
    expect(w.days[2]!.boundary).toBe('open')
    // Thursday, an ordinary weekday: the sessions of the layer.
    expect(w.days[3]!.blocks.map((b) => b.named.sourceId)).toEqual(['londyn', 'ny'])
    expect(runs.filter((r) => r.startsWith('horizon'))).toHaveLength(7)
    // The same minute, nothing changed: nothing counted again; the next minute – only today.
    runs.length = 0
    await folder.weekView('2026-11-08')
    expect(runs).toEqual([])
    at(WED, 12 * 60 + 1)
    await folder.weekView(WED)
    expect(runs).toEqual([`horizon:${WED}`])
  })

  it('zmiana rd.json (zapisany cel) nie liczy od nowa dni, które prowadzący utworzył (migawka w logu) – tylko pozostałe', async () => {
    const { folder, runs } = await studied()
    const raw = JSON.parse(readFileSync(join(dataDir, paths.day(TUE)), 'utf8')) as unknown
    const snapshot = createDay({ date: TUE, changes: [], templates: [], lectures: [], dayFile: dayFileFrom(raw, TUE), holidays: marketDay, at: placeLogical(TUE, 5 * 60) })
    folder.append({ day: TUE, dom: 'timer', k: 'day.create', snapshot })
    await folder.log.flush()
    await folder.weekView(WED)
    runs.length = 0
    await folder.setGoals('2026-11', { study: 50 })
    await folder.weekView(WED)
    expect(runs).not.toContain(`horizon:${TUE}`)
    expect(runs).toContain('horizon:2026-11-05')
  })

  it('zmiana pliku dnia (Twoja edycja w kolejce) liczy ten dzień od nowa', async () => {
    const { folder, runs } = await studied()
    await folder.weekView(WED)
    runs.length = 0
    const rel = paths.day('2026-11-06')
    await folder.edit([{ rel, create: true, edits: [{ path: ['schema'], base: undefined, value: 1 }, { path: ['date'], base: undefined, value: '2026-11-06' }, { path: ['dayType'], base: undefined, value: 'wolne' }] }])
    const w = await folder.weekView(WED)
    expect(runs).toContain('horizon:2026-11-06')
    expect(w.days[4]).toMatchObject({ dayType: 'wolne', boundary: 'free' })
  })

  it('dzień zamrożony – z jego oceny; dzień, którego pliku nie da się odczytać – nieznany', async () => {
    const { folder } = await studied()
    const n = (await folder.readDay(TUE)).events.filter((e) => e.c === 'pca').reduce((m, e) => Math.max(m, e.n), -1)
    folder.append({ day: TUE, dom: 'game', k: 'day.freeze', at: placeLogical(WED, 11 * 60), how: 'ready', know: { pca: n }, missing: [], grade: { boundary: 'noData', free: false, extensionMin: 0, regen: { towardMin: 30, requiredMin: 90, reached: false, counts: true } } })
    await folder.log.flush()
    writeFileSync(join(dataDir, paths.day('2026-11-05')), '{ zepsuty')
    const w = await folder.weekView(WED)
    expect(w.days[1]).toMatchObject({ frozen: true, boundary: 'noData', regen: { towardMin: 30, reached: false }, studyMin: 60 })
    expect(w.days[3]).toMatchObject({ read: 'unknown', blocks: [], dayType: null })
  })
})

describe('tydzień w folderze danych – błędy jednego dnia i pamięć', () => {
  it('liczenie jednego dnia nie udało się (limit czasu, nowy proces pomocniczy): ten dzień nieznany, reszta tygodnia i postęp liczą się dalej', async () => {
    const { folder, logged } = await studied({ fails: (date) => date === '2026-11-02' })
    const w = await folder.weekView(WED)
    expect(w.days[0]).toMatchObject({ date: '2026-11-02', read: 'unknown' })
    // Said in the log – the day and the kind of the error, never its content.
    expect(logged).toContainEqual(['warn', 'tydzień i cele: dzień 2026-11-02 nieznany (Error)'])
    expect(logged.some(([, m]) => m.includes('przekroczony'))).toBe(false)
    expect(w.days[1]).toMatchObject({ date: TUE, read: 'full', studyMin: 60 })
    const g = await folder.goalsView('2026-11')
    expect(g.progress).toMatchObject({ unknown: ['2026-11-02'], study: { min: 60 } })
  })

  it('rd.json chwilowo nieczytelny: tydzień i cele bez odmowy – dni nieznane, bez celów', async () => {
    // Another run of the app (nothing known of rd.json yet), the file half-brought by OneDrive.
    await (await studied()).folder.close()
    writeFileSync(join(dataDir, paths.settings), '{ zepsuty')
    const { folder, at } = await make()
    at(WED, 12 * 60)
    const w = await folder.weekView(WED)
    expect(w.days.map((d) => d.read)).toEqual(Array(7).fill('unknown'))
    const g = await folder.goalsView('2026-11')
    expect(g.goals).toEqual(NO_GOALS)
    expect(g.progress.unknown).toEqual(['2026-11-01', '2026-11-02', TUE, WED])
  })

  it('tydzień i cele naraz: każdy dzień liczony raz (wspólne zadanie w toku)', async () => {
    const { folder, runs } = await studied({ slowMs: 30 })
    await Promise.all([folder.weekView(WED), folder.weekView(WED), folder.goalsView('2026-11')])
    const horizon = runs.filter((r) => r.startsWith('horizon'))
    expect(horizon).toHaveLength(new Set(horizon).size)
    // The week (7 days) and the 1st of November (Sunday before the week).
    expect(new Set(horizon).size).toBe(8)
  })

  it('pamięć: wynik liczenia zaczętego wcześniej nie nadpisuje wyniku dnia zmienionego w międzyczasie', async () => {
    const D = '2026-11-06'
    let release = () => undefined as void
    const gate = new Promise<void>((done) => (release = done))
    let first = true
    const { folder, runs } = await studied({ hold: (date) => (date === D && first ? ((first = false), gate) : null) })
    // The first week waits on Friday's count (a slow helper process)…
    const a = folder.weekView(WED)
    while (!runs.includes(`horizon:${D}`)) await new Promise((done) => setTimeout(done, 5))
    // …meanwhile Friday's file changes and a second ask counts it again – and ends first.
    const rel = paths.day(D)
    await folder.edit([{ rel, create: true, edits: [{ path: ['schema'], base: undefined, value: 1 }, { path: ['date'], base: undefined, value: D }, { path: ['dayType'], base: undefined, value: 'wolne' }] }])
    const b = await folder.weekView(WED)
    expect(b.days[4]).toMatchObject({ dayType: 'wolne' })
    release()
    await a
    // The day as it is now stays remembered: nothing counted again.
    runs.length = 0
    expect((await folder.weekView(WED)).days[4]).toMatchObject({ dayType: 'wolne' })
    expect(runs).toEqual([])
  })

  it('pamięć: dzień, o który pytano niedawno, zostaje (trafienie przesuwa go na koniec), wypadają najdawniej pytane', async () => {
    const { folder, runs } = await studied()
    // Ten weeks gone by – 70 days, as many as are remembered.
    const weeks = Array.from({ length: 10 }, (_, i) => addDays('2026-08-24', 7 * i))
    for (const w of weeks) await folder.weekView(w)
    runs.length = 0
    await folder.weekView(weeks[0]!)
    expect(runs).toEqual([])
    // A week more: the 7 days asked longest ago go – the week of 31.08, not the one just asked again.
    await folder.weekView('2026-08-17')
    runs.length = 0
    await folder.weekView(weeks[0]!)
    expect(runs).toEqual([])
    await folder.weekView(weeks[1]!)
    expect(runs).toHaveLength(7)
  })
})

describe('cele miesiąca w folderze danych', () => {
  it('cele z rd.json, poprzedniego miesiąca, postęp od pierwszego do dziś', async () => {
    const { folder } = await studied()
    const g = await folder.goalsView('2026-11')
    expect(g.goals).toEqual({ ...NO_GOALS, study: 40 })
    expect(g.previous).toEqual({ ...NO_GOALS, study: 30, regen: 15 })
    expect(g.progress).toMatchObject({ month: '2026-11', study: { min: 60, goalMin: 2400 }, regen: { goal: null }, trading: { clean: 0, goal: null } })
    expect((await folder.goalsView('2026-12')).progress).toMatchObject({ study: { min: 0 }, preliminary: 0, unknown: [] })
  })

  it('zapis: pola rd.json przez kolejkę, po kolei (dwie zmiany naraz – bez pytania), inne pola pliku zostają', async () => {
    const { folder } = await studied()
    const [a, b] = await Promise.all([folder.setGoals('2026-11', { regen: 20 }), folder.setGoals('2026-11', { trading: 30, study: null })])
    expect([...a, ...b].map((o) => o.status)).toEqual(['applied', 'applied'])
    expect(await folder.setGoals('2026-11', { regen: 20 })).toEqual([])
    await folder.setGoals('2026-12', { skipped: true })
    const file = JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')) as { goals: unknown; schema: number }
    expect(file.schema).toBe(1)
    expect(file.goals).toEqual({ '2026-10': { study: 30, regen: 15 }, '2026-11': { study: null, regen: 20, trading: 30 }, '2026-12': { skipped: true } })
    expect((await folder.goalsView('2026-11')).goals).toEqual({ ...NO_GOALS, regen: 20, trading: 30 })
  })

  it('bez rd.json: zapis celu go tworzy, jak każda zmiana ustawień (schema i zmienione pola)', async () => {
    rmSync(join(dataDir, paths.settings))
    const { folder } = await make()
    expect(await folder.setGoals('2026-11', { study: 10, skipped: true })).toEqual([expect.objectContaining({ status: 'applied' })])
    const file = JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')) as Record<string, unknown>
    expect(file).toMatchObject({ schema: 1, goals: { '2026-11': { study: 10, skipped: true } } })
    expect((await folder.goalsView('2026-11')).goals).toEqual({ ...NO_GOALS, study: 10, skipped: true })
  })

  it('rd.json nieczytelny (w tym uruchomieniu jeszcze nieodczytany): odmowa z powodem, nic nie czeka', async () => {
    writeFileSync(join(dataDir, paths.settings), '{ zepsuty')
    const { folder } = await make()
    await expect(folder.setGoals('2026-11', { study: 10 })).rejects.toThrow('plik ustawień (rd.json) jest teraz nieczytelny – cele nie zostały zapisane, spróbuj za chwilę')
    expect(readFileSync(join(dataDir, paths.settings), 'utf8')).toBe('{ zepsuty')
  })
})

describe('okno – tydzień i cele przez DataHub', () => {
  it('data i miesiąc sprawdzone; cel spoza zakresu odrzucony z powodem; zapis jak każda zmiana (wynik kolejki)', async () => {
    const dir = join(root, 'hub')
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = new DataHub({
      userData: join(root, 'appdata'),
      computer: () => 'pca',
      computerName: 'PC A',
      appVersion: '1.2.0',
      runId: 'run-horizon',
      holidays: marketDay,
      idleSeconds: () => 0,
      log: () => undefined,
      writeGuardPlan: false,
      extraBackupDir: () => null,
      previousVersion: () => null,
      onChange: () => undefined
    })
    try {
      expect(await hub.open(dir)).toBe(true)
      await expect(hub.weekView('2026-02-30')).rejects.toThrow('data tygodnia')
      await expect(hub.goals('2026-13')).rejects.toThrow('miesiąc celów')
      await expect(hub.setGoals('2026-11', { regen: 31 })).rejects.toThrow('cel musi być liczbą całkowitą od 1 do 30')
      expect(await hub.setGoals('2026-11', { regen: 20, skipped: true })).toEqual([{ status: 'applied' }])
      expect((await hub.goals('2026-11')).goals).toEqual({ ...NO_GOALS, regen: 20, skipped: true })
      expect((await hub.weekView('2026-11-04')).days).toHaveLength(7)
      // The window's way (`trySaveGoals`): in its turn, the view read again; a refusal is a toast, never a success.
      ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd: { dataView: () => hub.view(), setGoals: (m, x) => hub.setGoals(m, x) } }
      const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
      const { trySaveGoals, useData } = await load<{ trySaveGoals: (m: string, p: Record<string, unknown>) => Promise<unknown[] | null>; useData: { getState: () => { rd: { goals: Record<string, MonthGoals> } } } }>('../../src/renderer/store/data')
      const { useUi } = await load<{ useUi: { getState: () => { toasts: Array<{ text: string }> } } }>('../../src/renderer/store/ui')
      expect(await trySaveGoals('2026-12', { study: 25 })).toEqual([{ status: 'applied' }])
      expect(useData.getState().rd.goals['2026-12']).toEqual({ ...NO_GOALS, study: 25 })
      expect(await trySaveGoals('2026-12', { study: 0 })).toBeNull()
      expect(useUi.getState().toasts.at(-1)?.text).toBe('Nie zapisano: cel musi być liczbą całkowitą od 1 do 300')
    } finally {
      await hub.close('quit')
    }
  })
})
