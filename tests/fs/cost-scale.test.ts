/**
 * „Przelicz koszty ×N” (D566, D567) na prawdziwym folderze danych: jeden zapis (jedno `edit`) zmienia podkategorię (wpis ustawień od jutra),
 * rutynę (jej rekord), blok dnia z przyszłości (plik dnia) i szablon (wersja od jutra); dzień miniony – bez zmian. „Cofnij” z linii
 * przywraca wszystko; wartość zmieniona w międzyczasie zostaje, a „Cofnij” to mówi.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditEntry, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { templateJson } from '@shared/model/defaults'
import { planBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
type Costs = { head: number; emotions: number; senses: number; body: number }
type Opts = { n: number; pools: string[]; scope: string[] }
type Done = { saved: unknown[]; undo: (() => Promise<string | void>) | null } | null
const { reloadData, updateRecord } = await load<{ reloadData: () => Promise<void>; updateRecord: (rel: string, fn: (raw: Record<string, unknown>) => Record<string, unknown>) => Promise<unknown> }>('../../src/renderer/store/data')
const { applyCostScale } = await load<{ applyCostScale: (f: { from: string; at: number | null }, o: Opts, label: string) => Promise<Done> }>('../../src/renderer/features/settings/costScale')
const { useGroupLine } = await load<{ useGroupLine: { getState: () => { lines: Record<string, { text: string } | undefined> } } }>('../../src/renderer/store/groupLine')

const c = (head: number, emotions: number, senses: number, body: number): Costs => ({ head, emotions, senses, body })
const ALL: Opts = { n: 2, pools: ['head', 'emotions', 'senses', 'body'], scope: ['categories', 'variants', 'routines', 'blocks', 'templates'] }

let root: string
let dir: string
let hub: DataHub
let edits: EditEntry[][]
const today = logicalDayOf(Date.now())
const tomorrow = addDays(today, 1)
const future = addDays(today, 3)
const past = addDays(today, -2)
const first = addDays(today, -30)

const write = (rel: string, v: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>
const dayCosts = (date: string, id: string) => (read(paths.day(date)).blocks as Array<{ id: string; costs: Costs }>).find((b) => b.id === id)!.costs
const tplCosts = (from: string) => (read(paths.record('template', 't1')).versions as Record<string, { blocks: Array<{ costs: Costs }> }>)[from]?.blocks[0]?.costs
const lastChange = () => (read(paths.settings).settings as Array<{ from: string; at: number | null; patch: { categories?: Record<string, { costs?: Costs }> } }>).at(-1)!

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-scale-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  const own = (id: string, costs: Costs) => ({ id, categoryId: 'inne', startMin: 600, durationMin: 30, fixed: false, costs })
  write(paths.record('routine', 'r1'), { schema: 1, id: 'r1', name: 'Poranek', normal: [], worse: [], costs: c(2, 1, 0, 0), extra: 'zostaje' })
  write(paths.day(future), { schema: 1, date: future, blocks: [own('fut', c(60, 0, 0, 0))] })
  write(paths.day(past), { schema: 1, date: past, blocks: [own('old', c(2, 0, 0, 0))] })
  const block = planBlock({ id: 'tb', categoryId: 'inne', durationMin: 30, startMin: 600, origin: 'template', costs: c(1, 1, 0, 0) })
  write(paths.record('template', 't1'), templateJson({ id: 't1', name: 'Zwykły', dayType: 'zwykly', weekdays: [1], archived: false, versions: [{ from: first, blocks: [block], budgetMin: null, maxMin: null }] }))
  hub = new DataHub({ userData: join(root, 'appdata'), computer: () => 'pca', computerName: 'PC A', appVersion: '1.35.0', runId: `run-${Math.random()}`, holidays: marketDay, idleSeconds: () => 0, log: () => undefined, writeGuardPlan: false, extraBackupDir: () => null, previousVersion: () => null, onChange: () => undefined })
  expect(await hub.open(dir)).toBe(true)
  edits = []
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayDatesFrom: (from) => hub.dayDatesFrom(from),
      dayData: (date) => hub.day(date),
      edit: (entries) => {
        edits.push(entries)
        return hub.edit(entries)
      },
      logEvents: (events) => hub.events(events)
    }
  }
  await reloadData()
})
afterEach(async () => {
  await hub.close('quit')
  rmSync(root, { recursive: true, force: true })
})

describe('„Przelicz koszty ×2” na folderze danych (D566, D567)', () => {
  it('jeden zapis: podkategoria od jutra, rutyna, blok przyszłego dnia, szablon od jutra; dzień miniony bez zmian; „Cofnij” przywraca wszystko', async () => {
    const done = await applyCostScale({ from: tomorrow, at: null }, ALL, '×2')
    expect(done?.saved.length).toBeGreaterThan(3)
    expect(edits).toHaveLength(1)
    expect(edits[0]!.map((e) => e.rel).sort()).toEqual([paths.day(future), paths.record('routine', 'r1'), paths.record('template', 't1'), paths.settings].sort())
    const ch = lastChange()
    expect([ch.from, ch.at, ch.patch.categories?.analiza?.costs]).toEqual([tomorrow, null, c(6, 2, 2, 0)])
    expect(read(paths.record('routine', 'r1'))).toMatchObject({ costs: c(4, 2, 0, 0), extra: 'zostaje' })
    // 60 × 2 would be 120: clipped to the range of a cost, 100 (D568).
    expect(dayCosts(future, 'fut')).toEqual(c(100, 0, 0, 0))
    expect(dayCosts(past, 'old')).toEqual(c(2, 0, 0, 0))
    expect([tplCosts(first), tplCosts(tomorrow)]).toEqual([c(1, 1, 0, 0), c(2, 2, 0, 0)])
    expect(useGroupLine.getState().lines.settings?.text).toMatch(/^Przeliczono \d+ kosztów ×2$/)

    expect(await done!.undo!()).toBeUndefined()
    expect(edits).toHaveLength(2)
    const back = lastChange()
    expect([back.from, back.at, back.patch.categories?.analiza?.costs]).toEqual([tomorrow, null, c(3, 1, 1, 0)])
    expect(read(paths.record('routine', 'r1'))).toMatchObject({ costs: c(2, 1, 0, 0), extra: 'zostaje' })
    expect(dayCosts(future, 'fut')).toEqual(c(60, 0, 0, 0))
    expect(tplCosts(tomorrow)).toEqual(c(1, 1, 0, 0))
  })

  it('„od dziś”: dzisiejszy niezaczęty blok z własnym kosztem tak, zaczęty nie; migawka dnia po wpisie ustawień', async () => {
    const own = (id: string) => ({ id, categoryId: 'inne', startMin: 27 * 60, durationMin: 30, fixed: false, costs: c(1, 1, 0, 0) })
    write(paths.day(today), { schema: 1, date: today, blocks: [own('a'), own('run')] })
    await reloadData()
    expect((await hub.timer({ a: 'start', block: 'run', day: today, confirm: true })).ok).toBe(true)
    const at = Date.now()
    const done = await applyCostScale({ from: today, at }, { ...ALL, scope: ['categories', 'blocks'] }, '×2')
    expect(done?.saved.length).toBeGreaterThan(1)
    expect(edits).toHaveLength(1)
    expect([dayCosts(today, 'a'), dayCosts(today, 'run')]).toEqual([c(2, 2, 0, 0), c(1, 1, 0, 0)])
    expect([lastChange().from, lastChange().at]).toEqual([today, at])
    const snaps = ((await hub.day(today)).events as Array<{ k: string; at: number; reason: string }>).filter((e) => e.k === 'day.snapshot')
    expect(snaps.some((e) => e.at === at && e.reason === 'today')).toBe(true)
  })

  it('wartość zmieniona w międzyczasie zostaje, „Cofnij” to mówi', async () => {
    const done = await applyCostScale({ from: tomorrow, at: null }, { ...ALL, scope: ['routines', 'blocks'] }, '×2')
    expect(edits).toHaveLength(1)
    await updateRecord(paths.record('routine', 'r1'), (raw) => ({ ...raw, costs: c(-1, 0, 0, 0) }))
    expect(await done!.undo!()).toBe('Cofnięto · 1 koszt zmieniony w międzyczasie – został')
    expect(read(paths.record('routine', 'r1')).costs).toEqual(c(-1, 0, 0, 0))
    expect(dayCosts(future, 'fut')).toEqual(c(60, 0, 0, 0))
  })
})

