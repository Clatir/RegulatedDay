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

async function make() {
  const clock = { now: placeLogical(TUE, 9 * 60) }
  const runs: string[] = []
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
    worker: { run: (t) => (runs.push(t.kind === 'horizon' ? `${t.kind}:${t.ctx.date}` : t.kind), inProcess.run(t)) }
  })
  return { folder, clock, runs, at: (date: string, min: number) => (clock.now = placeLogical(date, min)) }
}

/** Your presence and study 10:00–11:00 on Tuesday, then Wednesday 12:00. */
async function studied() {
  const m = await make()
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

describe('cele miesiąca w folderze danych', () => {
  it('cele z rd.json, poprzedniego miesiąca, postęp od pierwszego do dziś', async () => {
    const { folder } = await studied()
    const g = await folder.goalsView('2026-11')
    expect(g.goals).toEqual({ ...NO_GOALS, study: 40 })
    expect(g.previous).toEqual({ ...NO_GOALS, study: 30, regen: 15 })
    expect(g.progress).toMatchObject({ month: '2026-11', days: 4, study: { min: 60, goalMin: 2400 }, regen: { goal: null }, trading: { clean: 0, goal: null } })
    expect((await folder.goalsView('2026-12')).progress.days).toBe(0)
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

  it('bez rd.json (przed kreatorem) cele się nie zapisują', async () => {
    rmSync(join(dataDir, paths.settings))
    const { folder } = await make()
    await expect(folder.setGoals('2026-11', { study: 10 })).rejects.toThrow('nie ma jeszcze ustawień')
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
