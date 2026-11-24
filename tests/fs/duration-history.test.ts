/**
 * „Długość z historii” z folderu (N6, D625, T2905–T2906): the minutes the blocks finished on the last 90 days before today ran, by
 * subcategory, from the logs of the days (frozen or not); a block running, parked, cancelled, ended without „Skończyłem”, said by the
 * ritual („odbył się”), today's and one of 91 days ago are not in it; the pauses do not count; a day is folded again only when its log
 * changed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { durationHint, hintRulesOf } from '@shared/durationHint'
import { DEFAULT_GENERAL } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const TODAY = '2026-11-24'
let root: string
let dataDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-duration-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(o: { fs?: typeof nodeFs } = {}) {
  const clock = { now: placeLogical(TODAY, 10 * 60) }
  const folder = await DataFolder.open({
    fs: o.fs ?? nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '1.38.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock }
}

type Block = {
  id: string
  category?: string
  /** Logical minutes of the start and the end. */
  from: number
  to: number
  /** The end: „Skończyłem” (default), an end of an absence (no `fin`), a park after the start – or none (still running). */
  end?: 'done' | 'absence' | 'park' | 'none' | { rule: string | null; auto?: true; done?: boolean | null }
  /** When the end was written (logical minutes; default – its instant): a click after the planned end of a fixed block is cut to it. */
  endWritten?: number
  /** Its end corrected afterwards (`block.fix` with the end, logical minutes). */
  fixEnd?: number
  fixed?: true
  how?: 'click' | 'plan'
  pause?: [number, number]
  requests?: string[]
  /** A buffer of decompression (D386, T2452): its start says so. */
  decompress?: true
}
type Gone = { id: string; at: number; k: 'block.cancel' | 'block.park' }

/** A day's log of PC A with the blocks given (by default „Analiza”, started by a click and ended by „Skończyłem”). */
function writeDay(day: string, blocks: Block[], gone: Gone[] = [], file = 'pca'): void {
  mkdirSync(join(dataDir, paths.logDir(day)), { recursive: true })
  const lines: string[] = []
  let n = 0
  const at = (m: number) => placeLogical(day, m)
  const ev = (k: string, dom: string, when: number, extra: Record<string, unknown> = {}, written = when) => lines.push(JSON.stringify({ id: `${file}-${day}-${n}`, c: file, n: n++, t: written, l: written, v: 1, day, dom, k, at: when, ...extra }))
  ev('presence.first', 'meta', at(7 * 60))
  for (const b of blocks) {
    const planned = { categoryId: b.category ?? 'analiza', variantId: null, durationMin: 30, fixed: b.fixed === true, ...(b.requests ? { requests: b.requests } : {}), ...(b.decompress ? { decompress: true } : {}) }
    ev('block.start', 'timer', at(b.from), { block: b.id, bg: false, planned, confirmUntil: null, how: b.how ?? 'click' })
    if (b.pause) {
      ev('block.pause', 'timer', at(b.pause[0]), { block: b.id })
      ev('block.resume', 'timer', at(b.pause[1]), { block: b.id, confirmUntil: null })
    }
    const end = b.end ?? 'done'
    const written = b.endWritten != null ? at(b.endWritten) : at(b.to)
    if (end === 'done') ev('block.end', 'timer', at(b.to), { block: b.id, done: b.fixed ? null : true, rule: null, fin: true }, written)
    else if (end === 'absence') ev('block.end', 'timer', at(b.to), { block: b.id, done: null, rule: 'absence', autoRule: 'absence', fin: false })
    else if (end === 'park') ev('block.end', 'timer', at(b.to), { block: b.id, done: false, rule: 'park' })
    else if (typeof end === 'object') ev('block.end', 'timer', at(b.to), { block: b.id, done: end.done ?? null, rule: end.rule, fin: true, ...(end.auto ? { autoRule: end.rule } : {}) }, written)
    if (b.fixEnd != null) ev('block.fix', 'timer', at(b.fixEnd), { block: b.id, start: null, end: at(b.fixEnd) }, at(b.fixEnd + 60))
  }
  for (const g of gone) ev(g.k, 'timer', at(g.at), { block: g.id, rule: 'user' })
  writeFileSync(join(dataDir, paths.log(day, file)), lines.join('\n') + '\n')
}

const days = (back: number[]) => back.map((b) => addDays(TODAY, -b))

describe('długość z historii z folderu', () => {
  it('„Gotowe, gdy”: 5 zakończonych bloków po 45 min w ostatnich 90 dniach – mediana 45, przy planie 30 podpowiedź; 4 – bez', async () => {
    for (const d of days([1, 2, 10, 40, 90])) writeDay(d, [{ id: 'b', from: 9 * 60, to: 9 * 60 + 45 }])
    const { folder } = await make()
    const h = await folder.durationHistory()
    expect(h).toMatchObject({ from: addDays(TODAY, -90), to: addDays(TODAY, -1), days: 90, unreadable: 0 })
    expect(h.byCategory.analiza).toEqual([45, 45, 45, 45, 45])
    expect(durationHint(h.byCategory.analiza, 30, hintRulesOf(DEFAULT_GENERAL))).toEqual({ minutes: 45, count: 5 })
    expect(durationHint(h.byCategory.analiza!.slice(1), 30, hintRulesOf(DEFAULT_GENERAL))).toBeNull()
  })

  it('blok sprzed 91 dni i dzisiejszy pominięte', async () => {
    writeDay(addDays(TODAY, -91), [{ id: 'old', from: 9 * 60, to: 9 * 60 + 45 }])
    writeDay(TODAY, [{ id: 'now', from: 8 * 60, to: 8 * 60 + 45 }])
    writeDay(addDays(TODAY, -90), [{ id: 'edge', from: 9 * 60, to: 9 * 60 + 50 }])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ analiza: [50] })
  })

  it('trwający, odwołany, zaparkowany (przed i po starcie), skończony nieobecnością i „odbył się” z rytuału pominięte; pauza się nie liczy', async () => {
    writeDay(addDays(TODAY, -3), [
      { id: 'running', from: 9 * 60, to: 0, end: 'none' },
      { id: 'parkedAfter', from: 10 * 60, to: 10 * 60 + 20, end: 'park' },
      { id: 'absence', from: 11 * 60, to: 11 * 60 + 40, end: 'absence' },
      { id: 'ritual', from: 12 * 60, to: 12 * 60 + 30, how: 'plan' },
      { id: 'paused', category: 'nauka', from: 14 * 60, to: 15 * 60, pause: [14 * 60 + 20, 14 * 60 + 35] }
    ], [
      { id: 'cancelled', at: 8 * 60, k: 'block.cancel' },
      { id: 'parked', at: 8 * 60, k: 'block.park' }
    ])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ nauka: [45] })
  })

  it('blok próśb jednej prośby osobno (szacunek prośby); blok kilku próśb tylko w swojej podkategorii', async () => {
    writeDay(addDays(TODAY, -2), [
      { id: 'one', category: 'prosby', from: 9 * 60, to: 9 * 60 + 20, requests: ['r1'] },
      { id: 'two', category: 'prosby', from: 10 * 60, to: 10 * 60 + 50, requests: ['r2', 'r3'] }
    ])
    const { folder } = await make()
    const h = await folder.durationHistory()
    expect(h.byCategory.prosby).toEqual([20, 50])
    expect(h.oneRequest).toEqual([20])
  })

  it('dzień liczony od nowa tylko po zmianie logu; ten sam wynik bez zmian', async () => {
    const d = addDays(TODAY, -5)
    writeDay(d, [{ id: 'b', from: 9 * 60, to: 9 * 60 + 45 }])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory.analiza).toEqual([45])
    expect((await folder.durationHistory()).byCategory.analiza).toEqual([45])
    // Another computer's log of the day: a second block.
    writeDay(d, [{ id: 'c', from: 13 * 60, to: 14 * 60 }], [], 'pcb')
    expect((await folder.durationHistory()).byCategory.analiza).toEqual([45, 60])
  })

  it('bufor dekompresji (długość z planu, nie pomiar) pominięty', async () => {
    writeDay(addDays(TODAY, -4), [
      { id: 'buffer', category: 'regeneracja', from: 10 * 60, to: 10 * 60 + 15, decompress: true },
      { id: 'own', category: 'regeneracja', from: 12 * 60, to: 12 * 60 + 25 }
    ])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ regeneracja: [25] })
  })

  it('liczenie w toku dla innego dnia logicznego nie jest dzielone (okno nowego dnia)', async () => {
    writeDay(addDays(TODAY, -1), [{ id: 'b', from: 9 * 60, to: 9 * 60 + 45 }])
    writeDay(TODAY, [{ id: 'c', from: 9 * 60, to: 9 * 60 + 50 }])
    const { folder } = await make()
    const at = placeLogical(TODAY, 10 * 60)
    const before = folder.durationHistory(at)
    const next = folder.durationHistory(at + 24 * 3_600_000)
    const same = folder.durationHistory(at + 24 * 3_600_000)
    expect(same).toBe(next)
    expect(await before).toMatchObject({ to: addDays(TODAY, -1), byCategory: { analiza: [45] } })
    expect(await next).toMatchObject({ to: TODAY, byCategory: { analiza: [45, 50] } })
  })

  it('końce automatyczne o planowanym końcu (bez Twojej reakcji) pominięte; ostatni krok i „Skończyłem” liczą się (T2919)', async () => {
    writeDay(addDays(TODAY, -6), [
      { id: 'fixedBg', from: 8 * 60, to: 9 * 60, end: { rule: 'plan', auto: true } },
      { id: 'fixedFg', from: 9 * 60, to: 10 * 60, end: { rule: 'fixedNoReaction', auto: true } },
      { id: 'commute', from: 10 * 60, to: 10 * 60 + 30, end: { rule: 'awayPlan', auto: true } },
      { id: 'chain', from: 11 * 60, to: 11 * 60 + 20, end: { rule: 'awayChain', auto: true } },
      { id: 'behind', from: 12 * 60, to: 12 * 60 + 40, end: { rule: 'groupPlan', auto: true, done: true } },
      { id: 'steps', from: 13 * 60, to: 13 * 60 + 35, end: { rule: 'steps', done: true } },
      { id: 'clicked', from: 14 * 60, to: 14 * 60 + 25 }
    ])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ analiza: [35, 25] })
  })

  it('dzień nieczytelny teraz, a policzony wcześniej – jego próbki zostają (liczony jako nieczytelny)', async () => {
    const d = addDays(TODAY, -7)
    writeDay(d, [{ id: 'b', from: 9 * 60, to: 9 * 60 + 45 }])
    let broken = false
    const failing = { ...nodeFs, list: async (abs: string) => (broken && abs.replace(/\\/g, '/').includes(d) ? Promise.reject(new Error('EIO')) : nodeFs.list(abs)) }
    const { folder } = await make({ fs: failing })
    expect(await folder.durationHistory()).toMatchObject({ days: 90, unreadable: 0, missing: 0, byCategory: { analiza: [45] } })
    broken = true
    // Counted as unreadable, but its blocks are there – nothing missing; only the days really read in `days`.
    expect(await folder.durationHistory()).toMatchObject({ days: 89, unreadable: 1, missing: 0, byCategory: { analiza: [45] } })
  })

  it('odpowiedź mówi, dla którego folderu liczono', async () => {
    const { folder } = await make()
    expect((await folder.durationHistory()).folder).toBe(dataDir)
  })

  it('dzień nieczytelny, którego nie policzono wcześniej – brakuje go (`missing`)', async () => {
    const d = addDays(TODAY, -8)
    writeDay(d, [{ id: 'b', from: 9 * 60, to: 9 * 60 + 45 }])
    const failing = { ...nodeFs, list: async (abs: string) => (abs.replace(/\\/g, '/').includes(d) ? Promise.reject(new Error('EIO')) : nodeFs.list(abs)) }
    const { folder } = await make({ fs: failing })
    expect(await folder.durationHistory()).toMatchObject({ days: 89, unreadable: 1, missing: 1, byCategory: {} })
  })

  it('blok stały skończony kliknięciem po planowanym końcu (koniec przycięty do planu) – nie próbka; skończony wcześniej – próbka (T2935)', async () => {
    writeDay(addDays(TODAY, -9), [
      { id: 'late', fixed: true, from: 9 * 60, to: 10 * 60, endWritten: 10 * 60 + 25 },
      { id: 'early', fixed: true, from: 11 * 60, to: 11 * 60 + 40 }
    ])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ analiza: [40] })
  })

  it('koniec automatyczny poprawiony przez Ciebie („Skończył się o …” w poprawce) – pomiar, liczy się (T2936)', async () => {
    writeDay(addDays(TODAY, -10), [
      { id: 'fixed', fixed: true, from: 9 * 60, to: 10 * 60, end: { rule: 'plan', auto: true }, fixEnd: 9 * 60 + 50 },
      { id: 'clipped', fixed: true, from: 11 * 60, to: 12 * 60, endWritten: 12 * 60 + 20, fixEnd: 11 * 60 + 55 },
      { id: 'untouched', fixed: true, from: 13 * 60, to: 14 * 60, end: { rule: 'plan', auto: true } }
    ])
    const { folder } = await make()
    expect((await folder.durationHistory()).byCategory).toEqual({ analiza: [50, 55] })
  })

  it('liczenie starszego dnia, które skończy się po nowszym, nie wyrzuca z pamięci dni nowszego okna (T2939)', async () => {
    const at = placeLogical(TODAY, 10 * 60)
    writeDay(TODAY, [{ id: 'c', from: 9 * 60, to: 9 * 60 + 50 }])
    // The oldest day of today's window waits – today's count ends after tomorrow's.
    const oldest = addDays(TODAY, -90)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const slow = { ...nodeFs, list: async (abs: string) => (abs.replace(/\\/g, '/').includes(oldest) ? gate.then(() => nodeFs.list(abs)) : nodeFs.list(abs)) }
    const { folder } = await make({ fs: slow })
    const before = folder.durationHistory(at)
    expect(await folder.durationHistory(at + 24 * 3_600_000)).toMatchObject({ to: TODAY, byCategory: { analiza: [50] } })
    release()
    await before
    expect((folder as unknown as { durationMemo: Map<string, unknown> }).durationMemo.has(TODAY)).toBe(true)
  })
})
