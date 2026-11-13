/**
 * Series in a real data folder (OPS1, D381, D382, D401): „Powtarzaj” writes series/<id>.json and the day's file in one
 * edit of the queue (the block becomes the first occurrence; today's occurrence is written into today's file), the window
 * sees the series and the plans of days have their occurrences, „Cała seria” adds a version from today (yesterday as it
 * was), „To i następne” splits the series (the same root), „Tylko to” changes one day's file, a removal of the whole series
 * cancels today's occurrence and takes the ones changed on their days, the morning's answer, „Cofnij”, and refusals.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { snapshotOf } from '@shared/engine/context'
import { createDay, dayPlan } from '@shared/engine/createDay'
import { RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { dayStart, logicalMinuteOf } from '@shared/time/day'
import { seriesAskKey, seriesBlockId } from '@shared/engine/series'
import { attachmentRel } from '@shared/model/attachment'
import { dayFileFrom, planBlock, type PlanBlock } from '@shared/model/plan'
import { seriesFrom, seriesJson, seriesPlans, typeOfDays, type Series } from '@shared/model/series'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

let root: string
let dir: string
let hub: DataHub
let today: string

const write = (rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const onDisk = (rel: string) => (existsSync(join(dir, rel)) ? (JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>) : null)
const seriesOnDisk = (): Series[] =>
  existsSync(join(dir, 'series'))
    ? readdirSync(join(dir, 'series'))
        .map((n) => seriesFrom(onDisk(`series/${n}`)))
        .filter((s): s is Series => !!s)
    : []

/** The plan of a day as the window counts it: the view's series, the day's log and file. */
async function planOn(date: string): Promise<PlanBlock[]> {
  const view = await hub.view()
  const list = view.series.map(seriesFrom).filter((s): s is Series => !!s)
  const plans = seriesPlans(list, typeOfDays([], (d) => (view.seriesDays[d] as never) ?? null), marketDay)
  const data = await hub.day(date)
  const file = data.dayFile ? dayFileFrom(data.dayFile, date) : null
  const { snapshot } = snapshotOf({ changes: [], templates: [], lectures: [], series: plans }, { date, events: data.events as AnyEvent[], dayFile: file, nextFile: null }, marketDay, Date.now())
  return dayPlan(snapshot, file)
}

const own = (id: string, at: number, extra: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: at, durationMin: 45, name: 'Angielski', ...extra })
const dayFileWith = (date: string, blocks: PlanBlock[], extra: Record<string, unknown> = {}) => ({ schema: 1, date, blocks: Object.fromEntries(blocks.map((b) => [b.id, b])), ...extra })

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-series-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '1.11.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
  expect(await hub.open(dir)).toBe(true)
  today = logicalDayOf(Date.now())
})
afterEach(async () => {
  await hub.close('quit')
  rmSync(root, { recursive: true, force: true })
})

describe('serie w folderze danych (D381)', () => {
  it('„Powtarzaj” z bloku dnia przyszłego: plik serii i plik dnia jedną zmianą; blok jest pierwszym wystąpieniem; okno widzi serię', async () => {
    const d = addDays(today, 2)
    write(paths.day(d), dayFileWith(d, [own('ang', 18 * 60)]))
    const out = await hub.seriesCreate({ date: d, blockId: 'ang', rule: { kind: 'daily' }, count: 3 })
    expect([out.ok, out.error]).toEqual([true, null])
    const [s] = seriesOnDisk()
    expect([s!.id, s!.start, s!.count, s!.versions[0]!.block.startMin, s!.versions[0]!.special]).toEqual([out.seriesId, d, 3, 18 * 60, 'ask'])
    // The block left its day: the occurrence is there instead, the next days have theirs, the fourth day none.
    expect(dayFileFrom(onDisk(paths.day(d)), d).blocks).toEqual([])
    const occ = (await planOn(d)).find((b) => b.origin === 'series')!
    expect([occ.id, occ.startMin, occ.name]).toEqual([seriesBlockId(d, s!.root), 18 * 60, 'Angielski'])
    expect((await planOn(addDays(d, 2))).some((b) => b.origin === 'series')).toBe(true)
    expect((await planOn(addDays(d, 3))).some((b) => b.origin === 'series')).toBe(false)
    expect((await hub.view()).series.map((r) => r.id)).toEqual([s!.id])
    // The search finds the series as one record (the window's data), never its occurrences as blocks of days (D401).
    const corpus = await hub.searchDays()
    expect(corpus.complete).toBe(true)
    expect(corpus.blocks.some((x) => x.id === occ.id)).toBe(false)
    // „Cofnij”: the series and the day's file as before.
    const back = await hub.seriesUndo(out.undo)
    expect(back.ok).toBe(true)
    expect(seriesOnDisk()).toEqual([])
    expect(dayFileFrom(onDisk(paths.day(d)), d).blocks.map((b) => b.id)).toEqual(['ang'])
  })

  it('„Powtarzaj” dziś: dzisiejsze wystąpienie trafia do pliku dnia (migawka w logu go nie ma), blok – nie', async () => {
    write(paths.day(today), dayFileWith(today, [own('ang', 21 * 60)]))
    const out = await hub.seriesCreate({ date: today, blockId: 'ang', rule: { kind: 'daily' } })
    expect(out.ok).toBe(true)
    const file = dayFileFrom(onDisk(paths.day(today)), today)
    expect(file.blocks.map((b) => [b.id, b.origin, b.startMin])).toEqual([[seriesBlockId(today, out.seriesId!), 'series', 21 * 60]])
    expect((await planOn(today)).filter((b) => b.origin === 'series' || b.id === 'ang').map((b) => b.id)).toEqual([seriesBlockId(today, out.seriesId!)])
  })

  it('blok sesji nie powtarza się w serii; nieznany blok – odmowa, nic nie zapisane', async () => {
    const d = addDays(today, 3)
    write(paths.day(d), dayFileWith(d, [own('s', 9 * 60, { origin: 'session', sourceId: 'londyn', fixed: true }), own('u', 18 * 60)]))
    expect((await hub.seriesCreate({ date: d, blockId: 's', rule: { kind: 'daily' } })).code).toBe('kind')
    expect((await hub.seriesCreate({ date: d, blockId: 'nie-ma', rule: { kind: 'daily' } })).code).toBe('notFound')
    expect((await hub.seriesCreate({ date: d, blockId: 'u', rule: { kind: 'co-tydzien' } })).code).toBe('invalid')
    expect(seriesOnDisk()).toEqual([])
  })

  it('blok zadania ani blok próśb nie powtarzają się w serii: odmowa z powodem, nic nie zapisane (D408)', async () => {
    const d = addDays(today, 3)
    write(paths.day(d), dayFileWith(d, [own('z', 9 * 60, { task: 't1' }), own('p', 11 * 60, { categoryId: 'prosby', requests: ['r1'] })]))
    const before = JSON.stringify(onDisk(paths.day(d)))
    const task = await hub.seriesCreate({ date: d, blockId: 'z', rule: { kind: 'daily' } })
    expect([task.ok, task.code, task.error]).toEqual([false, 'task', 'Blok zadania należy do jednego dnia – zadanie nie powtarza się w serii.'])
    expect((await hub.seriesCreate({ date: d, blockId: 'p', rule: { kind: 'daily' } })).code).toBe('requests')
    expect(seriesOnDisk()).toEqual([])
    expect(JSON.stringify(onDisk(paths.day(d)))).toBe(before)
  })
})

describe('zmiany i usunięcie serii (D381)', () => {
  const start = () => addDays(today, -7)
  const series = (): Series => ({
    id: 'fizjo',
    root: 'fizjo',
    start: start(),
    until: null,
    count: null,
    versions: [{ from: start(), block: { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null, steps: [] }, rule: { kind: 'daily' }, special: 'ask' }],
    archived: false
  })

  it('„Cała seria” od dziś: wersja od dziś, wczoraj bez zmian, dzisiejsze niezaczęte w pliku dnia, jutro z nową godziną', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const out = await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { block: { startMin: 22 * 60 + 30 } })
    expect(out.ok).toBe(true)
    const [s] = seriesOnDisk()
    expect(s!.versions.map((v) => [v.from, v.block.startMin])).toEqual([
      [start(), 22 * 60],
      [today, 22 * 60 + 30]
    ])
    const at = async (d: string) => (await planOn(d)).find((b) => b.origin === 'series')!.startMin
    expect(await at(addDays(today, -1))).toBe(22 * 60)
    expect(await at(today)).toBe(22 * 60 + 30)
    expect(dayFileFrom(onDisk(paths.day(today)), today).blocks.find((b) => b.id === seriesBlockId(today, 'fizjo'))!.startMin).toBe(22 * 60 + 30)
    expect(onDisk(paths.day(addDays(today, -1)))).toBeNull()
    expect(await at(addDays(today, 5))).toBe(22 * 60 + 30)
  })

  it('dziś z migawką w logu: „Cała seria” zapisuje dzisiejsze wystąpienie w pliku dnia; zaczęte zostaje jak w logu', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const plans = seriesPlans([series()], typeOfDays([], () => null), marketDay)
    const snapshot = createDay({ date: today, changes: [], templates: [], lectures: [], series: plans, dayFile: null, holidays: marketDay, at: null })
    const t0 = dayStart(today)
    const base = { c: 'pcb', v: RULES_VERSION, day: today, dom: 'timer' }
    const lines = [{ ...base, id: 'pcb-0', n: 0, t: t0, l: t0, k: 'day.create', snapshot }]
    const jsonl = (xs: unknown[]) => `${xs.map((x) => JSON.stringify(x)).join('\n')}\n`
    write(paths.log(today, 'pcb'), jsonl(lines))
    const id = seriesBlockId(today, 'fizjo')
    expect((await planOn(today)).find((b) => b.id === id)!.startMin).toBe(22 * 60)
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { block: { startMin: 22 * 60 + 30 } })).ok).toBe(true)
    expect((await planOn(today)).find((b) => b.id === id)!.startMin).toBe(22 * 60 + 30)

    // Begun (a start in the log): a later change of the whole series leaves today's as it is.
    const started = { ...base, id: 'pcb-1', n: 1, t: t0 + 60_000, l: t0 + 60_000, k: 'block.start', block: id, at: t0 + 60_000, bg: false, how: 'click', planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: true } }
    write(paths.log(today, 'pcb'), jsonl([...lines, started]))
    const before = onDisk(paths.day(today))
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { block: { startMin: 23 * 60 } })).ok).toBe(true)
    expect(dayFileFrom(onDisk(paths.day(today)), today).blocks.find((b) => b.id === id)!.startMin).toBe(dayFileFrom(before, today).blocks.find((b) => b.id === id)!.startMin)
    expect((await planOn(addDays(today, 1))).find((b) => b.origin === 'series')!.startMin).toBe(23 * 60)
  })

  it('„To i następne” to wersja od dnia jednej serii: kolejne zmiany i usunięcie działają na całej serii (T715)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 3)
    const out = await hub.seriesChange({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'following', { block: { durationMin: 30 } })
    expect([out.ok, out.seriesId]).toEqual([true, 'fizjo'])
    expect(seriesOnDisk().map((x) => [x.id, x.until, x.versions.map((v) => [v.from, v.block.durationMin])])).toEqual([
      [
        'fizjo',
        null,
        [
          [start(), 60],
          [d, 30]
        ]
      ]
    ])
    const len = async (x: string) => (await planOn(x)).find((b) => b.origin === 'series')?.durationMin ?? null
    expect([await len(today), await len(addDays(d, -1)), await len(d), await len(addDays(d, 4))]).toEqual([60, 60, 30, 30])
    expect(onDisk(paths.day(today))).toBeNull()
    // „To i następne” once more, later: still one series; „Cała seria” from today reaches every version.
    const e = addDays(today, 6)
    expect((await hub.seriesChange({ date: e, blockId: seriesBlockId(e, 'fizjo') }, 'following', { block: { startMin: 21 * 60 } })).ok).toBe(true)
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { block: { name: 'Rehabilitacja' } })).ok).toBe(true)
    const [one, ...more] = seriesOnDisk()
    expect(more).toEqual([])
    expect(one!.versions.map((v) => [v.from, v.block.startMin, v.block.durationMin, v.block.name])).toEqual([
      [start(), 22 * 60, 60, 'Fizjoterapeuta'],
      [today, 22 * 60, 60, 'Rehabilitacja'],
      [d, 22 * 60, 30, 'Rehabilitacja'],
      [e, 21 * 60, 30, 'Rehabilitacja']
    ])
    expect((await hub.view()).series.map((r) => r.id)).toEqual(['fizjo'])
    // Removed from today: no occurrence on any day after, the days gone by keep theirs.
    expect((await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')).ok).toBe(true)
    expect([await len(addDays(d, 1)), await len(addDays(e, 1)), await len(addDays(today, -1))]).toEqual([null, null, 60])
  })

  it('„To i następne” na dniu przyszłym: jego własny wpis (rozsunięty) dostaje zmienione pola, inne dni z wpisem – bez zmian (T715)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const [d, e] = [addDays(today, 2), addDays(today, 5)]
    const entry = (x: string) => planBlock({ ...series().versions[0]!.block, id: seriesBlockId(x, 'fizjo'), startMin: 22 * 60 + 15, origin: 'series', sourceId: 'fizjo' })
    write(paths.day(d), dayFileWith(d, [entry(d)]))
    write(paths.day(e), dayFileWith(e, [entry(e)]))
    expect((await hub.seriesChange({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'following', { block: { durationMin: 30 } })).ok).toBe(true)
    const at = (x: string) => dayFileFrom(onDisk(paths.day(x)), x).blocks.map((b) => [b.startMin, b.durationMin])
    expect(at(d)).toEqual([[22 * 60 + 15, 30]])
    expect(at(e)).toEqual([[22 * 60 + 15, 60]])
  })

  it('zmiana z wersją z jutra (zegar innego komputera z przodu): pola sprawdzane na wersji z dziś, jutrzejsza zachowuje swoją godzinę (uwaga 14)', async () => {
    const s0 = series()
    write(paths.record('series', 'fizjo'), seriesJson({ ...s0, versions: [...s0.versions, { ...s0.versions[0]!, from: addDays(today, 1), block: { ...s0.versions[0]!.block, startMin: 19 * 60 } }] }))
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { block: { durationMin: 45 } })).ok).toBe(true)
    expect(seriesOnDisk()[0]!.versions.map((v) => [v.from, v.block.startMin, v.block.durationMin])).toEqual([
      [start(), 22 * 60, 60],
      [today, 22 * 60, 45],
      [addDays(today, 1), 19 * 60, 45]
    ])
  })

  it('„Cała seria” z dzisiejszego bloku z wpisem dnia: dłuższe wystąpienie rozsuwa elastyczny blok po nim (uwaga 1 drugiej rundy, D367)', async (ctx) => {
    // On today's axis from now on (a day without the sessions of the layer – they never ran in this folder's log, so the
    // forecast would put them at now): the occurrence a little later than now, a flexible block of yours right after it.
    const start = Math.ceil((logicalMinuteOf(today, Date.now()) + 20) / 5) * 5
    if (start + 90 + 30 + 15 > 1679) return ctx.skip()
    write(paths.day(today), dayFileWith(today, [own('ang', start), own('next', start + 45, { durationMin: 30, name: 'Po' })], { dayType: 'weekend' }))
    const made = await hub.seriesCreate({ date: today, blockId: 'ang', rule: { kind: 'daily' } })
    expect(made.ok).toBe(true)
    const id = seriesBlockId(today, made.seriesId!)
    expect(dayFileFrom(onDisk(paths.day(today)), today).blocks.map((b) => [b.id, b.startMin])).toEqual([
      ['next', start + 45],
      [id, start]
    ])
    expect((await hub.seriesChange({ date: today, blockId: id }, 'all', { block: { durationMin: 90 } })).ok).toBe(true)
    const file = dayFileFrom(onDisk(paths.day(today)), today)
    expect(file.blocks.find((b) => b.id === id)!.durationMin).toBe(90)
    expect(file.blocks.find((b) => b.id === 'next')!.startMin).toBeGreaterThanOrEqual(start + 90)
  })

  it('koniec przesunięty wcześniej zdejmuje wystąpienia zmienione pojedynczo po nim, jak „Zakończ serię” (D404, uwaga 5)', async () => {
    const s0 = series()
    write(paths.record('series', 'fizjo'), seriesJson({ ...s0, start: today, versions: [{ ...s0.versions[0]!, from: today }] }))
    const d = addDays(today, 5)
    const id = seriesBlockId(d, 'fizjo')
    write(paths.day(d), dayFileWith(d, [planBlock({ ...s0.versions[0]!.block, id, startMin: 20 * 60, origin: 'series', sourceId: 'fizjo' })]))
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { count: 3 })).ok).toBe(true)
    expect(dayFileFrom(onDisk(paths.day(d)), d).blocks.filter((b) => b.origin === 'series')).toEqual([])
    expect((await planOn(d)).some((b) => b.origin === 'series')).toBe(false)
    expect((await planOn(addDays(today, 2))).some((b) => b.origin === 'series')).toBe(true)
  })

  it('„Tylko to” zmienia jedno wystąpienie w pliku jego dnia; seria bez zmian', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 2)
    const id = seriesBlockId(d, 'fizjo')
    const out = await hub.seriesChange({ date: d, blockId: id }, 'only', { block: { startMin: 19 * 60 } })
    expect(out.ok).toBe(true)
    expect(dayFileFrom(onDisk(paths.day(d)), d).blocks.map((b) => [b.id, b.startMin, b.fixed])).toEqual([[id, 19 * 60, true]])
    expect(seriesOnDisk()[0]!.versions).toHaveLength(1)
    expect((await planOn(addDays(d, 1))).find((b) => b.origin === 'series')!.startMin).toBe(22 * 60)
  })

  it('usunięcie „Cała seria”: koniec wczoraj, poza listą, dzisiejsze odwołane, zmienione pojedynczo w przyszłości zdjęte; dni minione zostają', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 4)
    const id = seriesBlockId(d, 'fizjo')
    // An occurrence changed on its day (an exception kept by every change of the series).
    write(paths.day(d), dayFileWith(d, [planBlock({ ...series().versions[0]!.block, id, startMin: 20 * 60, origin: 'series', sourceId: 'fizjo' })]))
    const out = await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')
    expect(out.ok).toBe(true)
    const [s] = seriesOnDisk()
    expect([s!.until, s!.archived]).toEqual([addDays(today, -1), true])
    expect(dayFileFrom(onDisk(paths.day(today)), today).cancelled).toEqual([seriesBlockId(today, 'fizjo')])
    expect(dayFileFrom(onDisk(paths.day(d)), d).blocks).toEqual([])
    expect((await planOn(today)).some((b) => b.origin === 'series')).toBe(false)
    expect((await planOn(d)).some((b) => b.origin === 'series')).toBe(false)
    expect((await planOn(addDays(today, -1))).some((b) => b.origin === 'series')).toBe(true)
  })

  it('odpowiedź planu porannego „odwołaj” w dniu zjazdu: pytanie zapisane, wystąpienie odwołane', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 1)
    write(paths.day(d), { schema: 1, date: d, dayType: 'zjazd-stacjonarny' })
    const id = seriesBlockId(d, 'fizjo')
    expect((await planOn(d)).some((b) => b.id === id)).toBe(true)
    expect((await hub.seriesAnswer(d, id, false)).ok).toBe(true)
    const file = dayFileFrom(onDisk(paths.day(d)), d)
    expect([file.asked[seriesAskKey(id)], file.cancelled]).toEqual(['no', [id]])
    expect((await planOn(d)).some((b) => b.id === id)).toBe(false)
  })

  it('licznik ustawiony serii bez licznika liczy dni minione z typów z plików: dni „Wolne” pominięte się nie liczą (T717)', async () => {
    // Daily from 20 days ago, „pomiń” on special days; 5 of the days gone by were „Wolne”: 15 occurrences stood in plans.
    const from = addDays(today, -20)
    write(paths.record('series', 'fizjo'), seriesJson({ ...series(), start: from, versions: [{ ...series().versions[0]!, from, special: 'skip' }] }))
    for (const k of [2, 5, 8, 11, 14]) write(paths.day(addDays(from, k)), { schema: 1, date: addDays(from, k), dayType: 'wolne' })
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { count: 18 })).ok).toBe(true)
    const [s] = seriesOnDisk()
    expect([s!.count, s!.until]).toEqual([18, null])
    // 3 more from today: today, tomorrow and the day after – none later.
    const has = async (x: string) => (await planOn(x)).some((b) => b.origin === 'series')
    expect([await has(addDays(today, 2)), await has(addDays(today, 3))]).toEqual([true, false])
  })

  it('usunięcie „To i następne”: wystąpienie z dnia po nim przeniesione na dzień przed nim (od dziś) też znika (D404, uwaga 6)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const [moved, target, from] = [addDays(today, 9), addDays(today, 1), addDays(today, 3)]
    const id = seriesBlockId(moved, 'fizjo')
    write(paths.day(moved), { schema: 1, date: moved, movedTo: { [id]: target } })
    write(paths.day(target), dayFileWith(target, [planBlock({ ...series().versions[0]!.block, id, startMin: 20 * 60, origin: 'series', sourceId: 'fizjo', movedFrom: moved })]))
    expect((await planOn(target)).some((b) => b.id === id)).toBe(true)
    expect((await hub.seriesRemove({ date: from, blockId: seriesBlockId(from, 'fizjo') }, 'following')).ok).toBe(true)
    expect((await planOn(target)).some((b) => b.id === id)).toBe(false)
    // The day's own occurrence (before the end) stays.
    expect((await planOn(target)).some((b) => b.id === seriesBlockId(target, 'fizjo'))).toBe(true)
  })

  it('„po N” liczy dni z typem z pliku dnia: dzień „Wolne” przedłuża serię (okno dostaje typy tych dni)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson({ ...series(), start: addDays(today, 1), versions: [{ ...series().versions[0]!, from: addDays(today, 1) }], count: 2 }))
    expect((await planOn(addDays(today, 3))).some((b) => b.origin === 'series')).toBe(false)
    // Marked „Wolne” in the calendar of this computer (its own write: the counts read the day again at once, T717).
    const d1 = addDays(today, 1)
    expect((await hub.edit([recordEdit(paths.day(d1), null, { schema: 1, date: d1, dayType: 'wolne' })!]))[0]!.status).toBe('applied')
    expect((await hub.view()).seriesDays).toEqual({ [d1]: 'wolne' })
    expect((await planOn(addDays(today, 1))).some((b) => b.origin === 'series')).toBe(false)
    expect((await planOn(addDays(today, 3))).some((b) => b.origin === 'series')).toBe(true)
    expect((await planOn(addDays(today, 4))).some((b) => b.origin === 'series')).toBe(false)
  })
})

describe('załączniki przy usuwaniu serii (D415, zastępuje D411)', () => {
  const start = () => addDays(today, -7)
  const series = (id = 'fizjo'): Series => ({
    id,
    root: id,
    start: start(),
    until: null,
    count: null,
    versions: [{ from: start(), block: { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null, steps: [] }, rule: { kind: 'daily' }, special: 'ask' }],
    archived: false
  })
  /** A link of a block (no file to copy): its record only. */
  const attach = (id: string, owner: Record<string, unknown>) =>
    write(attachmentRel(id), { schema: 1, id, kind: 'link', name: '', file: null, link: { url: 'https://example.org/', title: null, iconDataUrl: null, domain: 'example.org' }, owner, addedAt: 1, removedAt: null })
  const removedAt = (id: string) => onDisk(attachmentRel(id))?.removedAt ?? null
  const occ = (date: string, root = 'fizjo') => ({ scope: 'day', date, blockId: seriesBlockId(date, root) })

  it('„Cała seria”: załączniki serii znikają ze wszystkich dni, własne – od dziś; dni minione i inne serie zostają; „Cofnij” przywraca', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    write(paths.record('series', 'inna'), seriesJson(series('inna')))
    const [past, fut] = [addDays(today, -2), addDays(today, 3)]
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('dzis', occ(today))
    attach('przysz', occ(fut))
    attach('minione', occ(past))
    attach('inna-ser', { scope: 'series', root: 'inna' })
    attach('inna-dzien', occ(fut, 'inna'))
    attach('obcy', { scope: 'day', date: fut, blockId: 'ang' })
    const out = await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')
    expect(out.ok).toBe(true)
    const at = removedAt('ser')
    expect(at).toEqual(expect.any(Number))
    expect(['dzis', 'przysz'].map(removedAt)).toEqual([at, at])
    expect(['minione', 'inna-ser', 'inna-dzien', 'obcy'].map(removedAt)).toEqual([null, null, null, null])
    // Only the records change (the files stay 30 days), in the change's own edit – back with its „Cofnij”.
    expect(out.undo.map((u) => u.rel)).toEqual(expect.arrayContaining(['ser', 'dzis', 'przysz'].map(attachmentRel)))
    expect((await hub.seriesUndo(out.undo)).ok).toBe(true)
    expect(['ser', 'dzis', 'przysz'].map(removedAt)).toEqual([null, null, null])
    expect(seriesOnDisk().find((s) => s.id === 'fizjo')!.archived).toBe(false)
  })

  it('„Cała seria” z dzisiejszym wystąpieniem zaczętym: ono zostaje razem z własnymi załącznikami', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const plans = seriesPlans([series()], typeOfDays([], () => null), marketDay)
    const snapshot = createDay({ date: today, changes: [], templates: [], lectures: [], series: plans, dayFile: null, holidays: marketDay, at: null })
    const t0 = dayStart(today)
    const base = { c: 'pcb', v: RULES_VERSION, day: today, dom: 'timer' }
    const id = seriesBlockId(today, 'fizjo')
    const lines = [
      { ...base, id: 'pcb-0', n: 0, t: t0, l: t0, k: 'day.create', snapshot },
      { ...base, id: 'pcb-1', n: 1, t: t0 + 60_000, l: t0 + 60_000, k: 'block.start', block: id, at: t0 + 60_000, bg: false, how: 'click', planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: true } }
    ]
    write(paths.log(today, 'pcb'), `${lines.map((x) => JSON.stringify(x)).join('\n')}\n`)
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('dzis', occ(today))
    attach('jutro', occ(addDays(today, 1)))
    expect((await hub.seriesRemove({ seriesId: 'fizjo' }, 'all')).ok).toBe(true)
    expect([removedAt('ser'), removedAt('jutro')]).toEqual([expect.any(Number), expect.any(Number)])
    expect(removedAt('dzis')).toBeNull()
  })

  it('„To i następne”: załączniki serii znikają, własne – od dnia wystąpienia; dni przed nim zostają', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const [before, d, after] = [addDays(today, 1), addDays(today, 3), addDays(today, 5)]
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('przed', occ(before))
    attach('to', occ(d))
    attach('po', occ(after))
    const out = await hub.seriesRemove({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'following')
    expect(out.ok).toBe(true)
    expect(['ser', 'to', 'po'].map(removedAt)).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)])
    expect(removedAt('przed')).toBeNull()
    expect((await hub.seriesUndo(out.undo)).ok).toBe(true)
    expect(['ser', 'to', 'po'].map(removedAt)).toEqual([null, null, null])
  })

  it('„To i następne”: wystąpienie przeniesione na dzień przed końcem znika z własnymi załącznikami (dodanymi w dniu, na który je przeniesiono)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const [moved, target, from] = [addDays(today, 9), addDays(today, 1), addDays(today, 3)]
    const id = seriesBlockId(moved, 'fizjo')
    write(paths.day(moved), { schema: 1, date: moved, movedTo: { [id]: target } })
    write(paths.day(target), dayFileWith(target, [planBlock({ ...series().versions[0]!.block, id, startMin: 20 * 60, origin: 'series', sourceId: 'fizjo', movedFrom: moved })]))
    attach('przeniesione', { scope: 'day', date: target, blockId: id })
    attach('wlasne-dnia', occ(target))
    expect((await hub.seriesRemove({ date: from, blockId: seriesBlockId(from, 'fizjo') }, 'following')).ok).toBe(true)
    expect(removedAt('przeniesione')).toEqual(expect.any(Number))
    expect(removedAt('wlasne-dnia')).toBeNull()
  })

  it('„Zakończ serię”: załączniki serii i dni przed końcem zostają; własne wystąpień po końcu – do kosza, z „Cofnij” (T920)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const [last, changed] = [addDays(today, 2), addDays(today, 5)]
    // An occurrence after the end changed on its day: the end takes it out of its file (D404) – and its own attachment.
    write(paths.day(changed), dayFileWith(changed, [planBlock({ ...series().versions[0]!.block, id: seriesBlockId(changed, 'fizjo'), startMin: 20 * 60, origin: 'series', sourceId: 'fizjo' })]))
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('dzis', occ(today))
    attach('ostatni', occ(last))
    attach('po', occ(addDays(today, 3)))
    attach('zmienione', occ(changed))
    const out = await hub.seriesEnd('fizjo', last)
    expect(out.ok).toBe(true)
    expect(seriesOnDisk()[0]!.until).toBe(last)
    expect(['ser', 'dzis', 'ostatni'].map(removedAt)).toEqual([null, null, null])
    expect(['po', 'zmienione'].map(removedAt)).toEqual([expect.any(Number), expect.any(Number)])
    expect((await hub.seriesUndo(out.undo)).ok).toBe(true)
    expect(['po', 'zmienione'].map(removedAt)).toEqual([null, null])
  })

  it('koniec przesunięty wcześniej („po N”): własne załączniki wystąpień po nowym końcu – do kosza; serii zostają (T920)', async () => {
    const s0 = series()
    write(paths.record('series', 'fizjo'), seriesJson({ ...s0, start: today, versions: [{ ...s0.versions[0]!, from: today }] }))
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('drugi', occ(addDays(today, 1)))
    attach('piaty', occ(addDays(today, 4)))
    expect((await hub.seriesChange({ seriesId: 'fizjo' }, 'all', { count: 3 })).ok).toBe(true)
    expect(['ser', 'drugi'].map(removedAt)).toEqual([null, null])
    expect(removedAt('piaty')).toEqual(expect.any(Number))
  })

  it('seria dzielona na części (starsza wersja, T702): usunięcie jednej części nie rusza drugiej – załączników serii ani jej dni (T849)', async () => {
    const s0 = series()
    const split = addDays(today, 6)
    write(paths.record('series', 'fizjo'), seriesJson({ ...s0, until: addDays(split, -1) }))
    write(paths.record('series', 'fizjo-b'), seriesJson({ ...s0, id: 'fizjo-b', start: split, versions: [{ ...s0.versions[0]!, from: split }] }))
    const [inA, inB] = [addDays(today, 2), addDays(split, 2)]
    // An occurrence of the part that goes on, changed on its day.
    write(paths.day(inB), dayFileWith(inB, [planBlock({ ...s0.versions[0]!.block, id: seriesBlockId(inB, 'fizjo'), startMin: 20 * 60, origin: 'series', sourceId: 'fizjo' })]))
    attach('ser', { scope: 'series', root: 'fizjo' })
    attach('a', occ(inA))
    attach('b', occ(inB))
    expect((await hub.seriesRemove({ date: inA, blockId: seriesBlockId(inA, 'fizjo') }, 'all')).ok).toBe(true)
    expect(removedAt('a')).toEqual(expect.any(Number))
    expect(['ser', 'b'].map(removedAt)).toEqual([null, null])
    expect(dayFileFrom(onDisk(paths.day(inB)), inB).blocks.map((x) => x.startMin)).toEqual([20 * 60])
  })

  it('„Cofnij”: plik dnia, w którym bloku nie ma (dzień dodania przeniesionego wystąpienia), nie wstrzymuje załącznika (T921)', async () => {
    const [d, e] = [addDays(today, 2), addDays(today, 3)]
    const id = seriesBlockId(d, 'fizjo')
    attach('przen', { scope: 'day', date: d, blockId: id })
    const live = onDisk(attachmentRel('przen'))!
    write(attachmentRel('przen'), { ...live, removedAt: 7 })
    write(paths.day(d), { schema: 1, date: d, movedTo: { [id]: e }, note: 'teraz' })
    write(paths.day(e), dayFileWith(e, [own('ang', 9 * 60)]))
    // The day it was added on is in the „Cofnij” and changed since (not the block – it only moved away from there); the
    // block stood in the other day's file, which goes back.
    const moved = planBlock({ ...series().versions[0]!.block, id, startMin: 20 * 60, origin: 'series', sourceId: 'fizjo', movedFrom: d })
    await hub.seriesUndo([
      { rel: paths.day(d), before: { schema: 1, date: d, movedTo: { [id]: e } }, after: { schema: 1, date: d, movedTo: { [id]: e }, note: 'wtedy' } },
      { rel: paths.day(e), before: dayFileWith(e, [own('ang', 9 * 60), moved]), after: dayFileWith(e, [own('ang', 9 * 60)]) },
      { rel: attachmentRel('przen'), before: live, after: { ...live, removedAt: 7 } }
    ])
    expect(dayFileFrom(onDisk(paths.day(e)), e).blocks.some((x) => x.id === id)).toBe(true)
    expect(removedAt('przen')).toBeNull()
  })

  it('„Cofnij” dużej zmiany: ponad 400 plików dni – załączniki i tak wracają (T922)', async () => {
    attach('z', occ(addDays(today, 1)))
    const live = onDisk(attachmentRel('z'))!
    write(attachmentRel('z'), { ...live, removedAt: 7 })
    // 400 days changed since (they stay), the attachment's record after them.
    const days = Array.from({ length: 400 }, (_, i) => {
      const d = addDays(today, 100 + i)
      return { rel: paths.day(d), before: null, after: { schema: 1, date: d, note: 'zmiana' } }
    })
    await hub.seriesUndo([...days, { rel: attachmentRel('z'), before: live, after: { ...live, removedAt: 7 } }])
    expect(removedAt('z')).toBeNull()
  })

  it('„Cofnij”, gdy dzień jest już taki jak przed zmianą (cofnięty na drugim komputerze): załączniki wracają (T921)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 2)
    attach('wlasny', occ(d))
    const out = await hub.seriesRemove({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'only')
    expect(out.ok).toBe(true)
    const day = out.undo.find((u) => u.rel === paths.day(d))!
    if (day.before) write(paths.day(d), day.before)
    else rmSync(join(dir, paths.day(d)))
    expect((await hub.seriesUndo(out.undo)).ok).toBe(true)
    expect(removedAt('wlasny')).toBeNull()
  })

  it('„Cofnij”, gdy plik dnia zmienił się w międzyczasie: dzień zostaje, a jego załączniki zostają w koszu (bez załączników bez bloku)', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series()))
    const d = addDays(today, 2)
    attach('wlasny', occ(d))
    const out = await hub.seriesRemove({ date: d, blockId: seriesBlockId(d, 'fizjo') }, 'only')
    expect(out.ok).toBe(true)
    const at = removedAt('wlasny')
    expect(at).toEqual(expect.any(Number))
    // Another computer changes the day meanwhile: „Cofnij” never writes over it – the occurrence stays out of the plan.
    write(paths.day(d), { ...onDisk(paths.day(d))!, blocks: { ang: own('ang', 9 * 60) } })
    await hub.seriesUndo(out.undo)
    expect((await planOn(d)).some((b) => b.id === seriesBlockId(d, 'fizjo'))).toBe(false)
    expect(removedAt('wlasny')).toBe(at)
  })
})
