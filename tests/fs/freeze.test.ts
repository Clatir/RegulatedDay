/**
 * Freezing in the data folder (E6, part two): the leader freezes a day once its window of corrections has ended and the
 * day's files are quiet, writes the freeze with the grade to the day's log and to its file of grades; it waits for a
 * computer whose records have not arrived, and after 72 h freezes without waiting, naming it. Nothing freezes before
 * the first day of the ritual (T482).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { isKnown } from '@shared/model/events'
import { dayEnd, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
const H = 3_600_000
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-freeze-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' }] }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(ritualFrom: string | null) {
  const clock = { now: placeLogical(DAY, 10 * 60) }
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.7.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true,
    ritualFrom
  })
  return { folder, clock }
}

/** A worked day: „a” 10:00–11:00 with „Koniec pracy”; the next morning a presence (the day is opened after its end). */
async function workedDay(ritualFrom: string | null) {
  const m = await make(ritualFrom)
  await m.folder.timerClick({ a: 'start', block: 'a' })
  m.clock.now = placeLogical(DAY, 11 * 60)
  await m.folder.timerClick({ a: 'workEnd' })
  m.clock.now = placeLogical(addDays(DAY, 1), 8 * 60)
  m.folder.noteInput(m.clock.now, true)
  await m.folder.check()
  return m
}

/** Checks every minute for `minutes` from `from` (ms): settled, the files quiet. */
async function checks(m: Awaited<ReturnType<typeof make>>, from: number, minutes: number): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i <= minutes; i++) {
    m.clock.now = from + i * 60_000
    out.push(...(await m.folder.check()).frozen)
  }
  return out
}

const freezes = async (f: DataFolder) => (await f.readDay(DAY)).events.filter((e) => isKnown(e) && e.k === 'day.freeze') as unknown as Array<{ how: string; know: Record<string, number>; missing: string[]; grade: { boundary: string; endConfirmed: boolean } }>

describe('eksport CSV z folderu danych', () => {
  it('dni z zakresu do trzech plików; dzień bez zdarzeń bez wierszy; zły zakres – odmowa', async () => {
    const m = await workedDay(null)
    const out = join(root, 'export')
    expect(await m.folder.exportCsv(addDays(DAY, -1), DAY, out)).toEqual(['bloki.csv', 'prosby.csv', 'checkiny.csv'])
    const rows = readFileSync(join(out, 'bloki.csv'), 'utf8').trim().split('\r\n').slice(1)
    // „a” and the Wednesday's sessions of the layer (London, NY), which did not start.
    expect(rows).toHaveLength(3)
    expect(rows).toContain('21.10.2026;Inne obowiązki;Inne obowiązki;praca;10:00;11:00;10:00;11:00;60;0;0;zrobiony;')
    expect(rows.filter((r) => r.includes(';niezaczęty;'))).toHaveLength(2)
    await expect(m.folder.exportCsv(DAY, addDays(DAY, -1), out)).rejects.toThrow('zły zakres dat')
  })
})

describe('zamrażanie w folderze danych', () => {
  it('po oknie korekty (24 h od otwarcia dnia po jego końcu) prowadzący zamraża dzień raz, z oceną w logu i w pliku ocen', async () => {
    const m = await workedDay(DAY)
    // 23 h after the opening: still the window of corrections.
    expect(await checks(m, placeLogical(addDays(DAY, 1), 8 * 60) + 23 * H, 10)).toEqual([])
    expect(await checks(m, placeLogical(addDays(DAY, 1), 8 * 60) + 24 * H, 12)).toEqual([DAY])
    const f = await freezes(m.folder)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ how: 'ready', missing: [], grade: { boundary: 'kept', endConfirmed: true } })
    expect(f[0]!.know.pca).toBeGreaterThan(0)
    const grades = readFileSync(join(dataDir, paths.grades('2026', 'pca')), 'utf8').trim().split('\n')
    expect(grades.map((l) => (JSON.parse(l) as { day: string }).day)).toEqual([DAY])
  })

  it('przed pierwszym dniem rytuału nic się nie zamraża (T482)', async () => {
    const m = await workedDay(null)
    expect(await checks(m, dayEnd(DAY) + 75 * H, 12)).toEqual([])
    expect(await freezes(m.folder)).toEqual([])
  })

  it('wyłączony komputer z nowszymi regułami (zamknięty) nie blokuje zamrażania', async () => {
    const m = await workedDay(DAY)
    mkdirSync(join(dataDir, '.presence'), { recursive: true })
    const at = placeLogical(DAY, 20 * 60)
    writeFileSync(join(dataDir, '.presence', 'lap.json'), JSON.stringify({ format: 1, computer: 'lap', name: 'Laptop', appVersion: '0.9.0', rulesVersion: 9, versions: [], lastPresence: at, lastUse: at, state: 'closed', seenLeader: 'pca', settled: true, lastEvents: {}, writtenAt: at }))
    expect(await checks(m, placeLogical(addDays(DAY, 1), 8 * 60) + 24 * H, 12)).toEqual([DAY])
  })

  it('dzień, którego okno minęło, gdy żaden komputer nie działał (tydzień przerwy), zamraża się przy powrocie', async () => {
    const m = await workedDay(DAY)
    const frozen = await checks(m, dayEnd(DAY) + 8 * 24 * H, 12)
    expect(frozen[0]).toBe(DAY)
    // The days nobody worked in meanwhile freeze too – as free (no presence, no answer).
    expect(frozen).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
  })

  it('nieudany zapis do pliku ocen: dzień jeszcze nie zamrożony, próba ponowiona później', async () => {
    const m = await workedDay(DAY)
    let fail = true
    const real = nodeFs.append.bind(nodeFs)
    ;(m.folder as unknown as { o: { fs: typeof nodeFs } }).o.fs = { ...nodeFs, append: async (abs: string, text: string) => (fail && abs.includes('grades') ? Promise.reject(new Error('plik zajęty')) : real(abs, text)) }
    const start = placeLogical(addDays(DAY, 1), 8 * 60) + 24 * H
    expect(await checks(m, start, 12)).toEqual([])
    expect(await freezes(m.folder)).toEqual([])
    fail = false
    expect(await checks(m, start + 30 * 60_000, 2)).toEqual([DAY])
    expect(await freezes(m.folder)).toHaveLength(1)
  })

  it('kopia konfliktowa własnego logu z poprzednich dni łączy się (inaczej dzień czekałby na zamrożenie 72 h)', async () => {
    const m = await workedDay(DAY)
    const copy = join(dataDir, 'log', '2026', DAY, 'pca-LAPTOP.jsonl')
    writeFileSync(copy, readFileSync(join(dataDir, 'log', '2026', DAY, 'pca.jsonl')))
    await checks(m, placeLogical(addDays(DAY, 1), 9 * 60), 2)
    expect(existsSync(copy)).toBe(false)
  })

  it('czeka na komputer, którego zapisy nie dotarły; po 72 h zamraża bez czekania i go wymienia', async () => {
    const m = await workedDay(DAY)
    // The laptop wrote to the day, and its presence (written before the day's end) names an event not visible yet.
    mkdirSync(join(dataDir, 'log', '2026', DAY), { recursive: true })
    writeFileSync(join(dataDir, 'log', '2026', DAY, 'lap.jsonl'), `${JSON.stringify({ id: 'lap-0', c: 'lap', n: 0, t: placeLogical(DAY, 9 * 60), l: placeLogical(DAY, 9 * 60), v: 1, day: DAY, dom: 'meta', k: 'presence.first', at: placeLogical(DAY, 9 * 60) })}\n`)
    mkdirSync(join(dataDir, '.presence'), { recursive: true })
    const at = placeLogical(DAY, 20 * 60)
    writeFileSync(join(dataDir, '.presence', 'lap.json'), JSON.stringify({ format: 1, computer: 'lap', name: 'Laptop', appVersion: '0.7.0', rulesVersion: 1, versions: [], lastPresence: at, lastUse: at, state: 'idle', seenLeader: 'pca', settled: true, lastEvents: { [DAY]: 5 }, writtenAt: at }))
    expect(await checks(m, placeLogical(addDays(DAY, 1), 8 * 60) + 30 * H, 12)).toEqual([])
    expect(await checks(m, dayEnd(DAY) + 72 * H, 12)).toEqual([DAY])
    expect((await freezes(m.folder))[0]).toMatchObject({ how: 'timeout', missing: ['lap'] })
  })
})
