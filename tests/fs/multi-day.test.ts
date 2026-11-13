/**
 * SNT1 część A w folderze danych (D417, D418): „3 dni” i „Agenda” (`daysView` – dni w podanej kolejności, każdy jak w
 * tygodniu, z krzywą energii kolumny i budżetem), miesiąc „Kalendarza” (`monthView` – bloki stałe i obciążenie każdego dnia),
 * moduł energii z rd.json (wyłączony – bez krzywej; zmiana liczy dni od nowa), sprawdzanie wejścia w DataHub.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { threeDays } from '@shared/engine/week'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { DataHub } from '../../src/main/data/hub'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess } from '../../src/main/worker/host'

const TUE = '2026-11-03'
const WED = '2026-11-04'
const THU = '2026-11-05'
let root: string
let dataDir: string
const day = (date: string, blocks: Array<Record<string, unknown>>) => writeFileSync(join(dataDir, paths.day(date)), JSON.stringify({ schema: 1, date, blocks }))
const rd = (v: Record<string, unknown>) => writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, ...v }))
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-multiday-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  rd({})
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make() {
  const clock = { now: placeLogical(WED, 12 * 60) }
  const runs: string[] = []
  /** Each count of a day: its date and the module its curve was asked with (null – none). */
  const asked: Array<[string, boolean | null]> = []
  const run = (t: Parameters<typeof inProcess.run>[0]) => {
    runs.push(t.kind === 'horizon' ? `${t.kind}:${t.ctx.date}` : t.kind)
    if (t.kind === 'horizon') asked.push([t.ctx.date, t.energyOn ?? null])
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
    worker: { run: run as never },
    log: () => undefined
  })
  return { folder, runs, asked, clock }
}

describe('„3 dni” i „Agenda” w folderze danych', () => {
  it('dni w podanej kolejności (także przez granicę tygodnia), każdy liczony raz; przyszły – krzywa od przyjętego check-inu', async () => {
    day(THU, [{ id: 'a', categoryId: 'inne', startMin: 11 * 60, durationMin: 120, fixed: false, origin: 'user' }])
    const { folder, runs } = await make()
    const v = await folder.daysView(threeDays(WED))
    expect(v.today).toBe(WED)
    expect(v.days.map((d) => [d.date, d.when, d.read])).toEqual([
      [TUE, 'past', 'full'],
      [WED, 'today', 'full'],
      [THU, 'future', 'full']
    ])
    const thu = v.days[2]!
    expect(thu.blocks.find((b) => b.id === 'a')).toMatchObject({ movable: true, startMin: 11 * 60, endMin: 13 * 60 })
    expect(thu.energy).toMatchObject({ assumed: true })
    expect(thu.energy!.samples[0]).toEqual({ at: 240, head: 100, emotions: 100, senses: 100 })
    // No check-in today: unknown, as „Dziś” shows it.
    expect(v.days[1]!.energy).toBeNull()
    expect(thu.budget!.limitMin).toBe(DEFAULT_SETTINGS.dayTypes.zwykly.budgetMin)
    // Asked again without a change: from memory.
    const before = runs.length
    await folder.daysView(threeDays(WED))
    expect(runs.slice(before).filter((r) => r.startsWith('horizon:') && r !== `horizon:${WED}`)).toEqual([])
    // Monday and Sunday on both sides of a week's border.
    expect((await folder.daysView(threeDays('2026-11-09'))).days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
  })

  it('moduł energii wyłączony w rd.json – bez krzywej; włączony z powrotem – dzień liczony od nowa', async () => {
    rd({ general: { modules: { energy: false } } })
    const { folder } = await make()
    expect((await folder.daysView([THU])).days[0]!.energy).toBeNull()
    rd({ general: { modules: { energy: true } } })
    expect((await folder.daysView([THU])).days[0]!.energy).toMatchObject({ assumed: true })
  })

  it('po przeniesieniu bloku (zapis pliku dnia) krzywa dnia liczy się od nowa', async () => {
    // A Saturday: no sessions of the layer the forecast would put the block after.
    const SAT = '2026-11-07'
    day(SAT, [{ id: 'a', categoryId: 'analiza', startMin: 9 * 60, durationMin: 180, fixed: false, origin: 'user' }])
    const { folder } = await make()
    const was = (await folder.daysView([SAT])).days[0]!
    await folder.edit([{ rel: paths.day(SAT), edits: [{ path: ['blocks', '#a', 'startMin'], base: 9 * 60, value: 16 * 60 }] }])
    const now = (await folder.daysView([SAT])).days[0]!
    expect(now.blocks.find((b) => b.id === 'a')!.startMin).toBe(16 * 60)
    const at = (d: typeof was, min: number) => d.energy!.samples.find((s) => s.at === min)!.head
    // The analysis 09:00–12:00 no more: at 12:30 the head is higher, at 19:30 (after it) lower than at 15:30.
    expect(at(now, 12 * 60 + 30)).toBeGreaterThan(at(was, 12 * 60 + 30))
    expect(at(now, 19 * 60 + 30)).toBeLessThan(at(now, 15 * 60 + 30))
  })
})

describe('krzywa energii w folderze danych – moduł dnia i kto ją liczy (T913, T914)', () => {
  it('dzień miniony: moduł z tamtego dnia (wyłączony dopiero dziś – krzywa jest), nie dzisiejsze ustawienie', async () => {
    rd({ general: { modules: { energy: false } } })
    const { folder } = await make()
    // Tuesday: you used it and gave a check-in; today at 08:00 the module went off (its state before: on).
    folder.append({ day: TUE, dom: 'meta', k: 'presence.first', at: placeLogical(TUE, 7 * 60) })
    folder.append({ day: TUE, dom: 'energy', k: 'energy.checkin', at: placeLogical(TUE, 7 * 60 + 30), answers: { head: [0, 0], emotions: [0, 0], senses: [0, 0] } })
    folder.append({ day: WED, dom: 'energy', k: 'energy.module', at: placeLogical(WED, 8 * 60), on: false, was: true })
    const v = await folder.daysView([TUE, THU])
    expect(v.days[0]!.energy).not.toBeNull()
    // A day to come – as the settings have it now (off).
    expect(v.days[1]!.energy).toBeNull()
  })

  it('miesiąc i cele nie liczą krzywej; tydzień po miesiącu liczy dzień od nowa z krzywą, miesiąc po tygodniu – z pamięci', async () => {
    const { folder, asked } = await make()
    await folder.monthView('2026-11')
    expect(asked.length).toBe(30)
    expect(asked.every(([, e]) => e === null)).toBe(true)
    asked.length = 0
    const v = await folder.daysView([THU])
    expect(asked).toEqual([[THU, true]])
    expect(v.days[0]!.energy).toMatchObject({ assumed: true })
    asked.length = 0
    await folder.monthView('2026-11')
    // THU is remembered with its curve (it serves the month); the rest of the month too – only today goes on with the minute.
    expect(asked.filter(([d]) => d === THU)).toEqual([])
    asked.length = 0
    await folder.daysView([THU])
    expect(asked).toEqual([])
  })
})

describe('miesiąc „Kalendarza” w folderze danych (D418)', () => {
  it('każdy dzień miesiąca: bloki stałe bez sesji i obciążenie pracy wobec budżetu', async () => {
    day(THU, [
      { id: 'meet', categoryId: 'inne', startMin: 18 * 60, durationMin: 60, fixed: true, origin: 'user' },
      { id: 'flex', categoryId: 'inne', startMin: 11 * 60, durationMin: 60, fixed: false, origin: 'user' }
    ])
    day('2026-11-06', [{ id: 'long', categoryId: 'inne', startMin: 18 * 60, durationMin: 600, fixed: false, origin: 'user' }])
    const { folder } = await make()
    const m = await folder.monthView('2026-11')
    expect(m).toMatchObject({ month: '2026-11', today: WED })
    expect(m.days).toHaveLength(30)
    expect(m.days[0]!.date).toBe('2026-11-01')
    const thu = m.days.find((d) => d.date === THU)!
    // The sessions of the layer (London, NY) are fixed too – not in the cell (T905).
    expect(thu.fixed.map((b) => b.id)).toEqual(['meet'])
    expect(thu.load).not.toBeNull()
    expect(m.days.find((d) => d.date === '2026-11-06')!.load).toBe('high')
  })
})

describe('okno – „3 dni”, „Agenda” i miesiąc przez DataHub', () => {
  it('daty sprawdzone: lista 1–14 dat bez powtórzeń; miesiąc RRRR-MM', async () => {
    const dir = join(root, 'hub')
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = new DataHub({
      userData: join(root, 'appdata'),
      computer: () => 'pca',
      computerName: 'PC A',
      appVersion: '1.2.0',
      runId: 'run-multiday',
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
      for (const bad of [null, '2026-11-04', [], ['2026-02-30'], [WED, WED], Array.from({ length: 15 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)]) await expect(hub.daysView(bad)).rejects.toThrow('dni widoku')
      expect((await hub.daysView([THU, WED])).days.map((d) => d.date)).toEqual([THU, WED])
      for (const bad of ['2026-13', '2026-1', 202611, null]) await expect(hub.monthView(bad)).rejects.toThrow('miesiąc kalendarza')
      expect((await hub.monthView('2026-02')).days).toHaveLength(28)
    } finally {
      await hub.close('quit')
    }
  })
})
