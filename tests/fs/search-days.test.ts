/**
 * The days for the global search (SNT6, T651): every day file of the data folder, past and coming, as the blocks the
 * window can open – named by their routine, people, variant or category (never an id), with their notes; a block cancelled
 * or moved away is not on that day; a day that cannot be read now makes the answer incomplete, never empty; a second look
 * reads no file that did not change.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

const TODAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-search-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(fs: DataFs = nodeFs) {
  const now = placeLogical(TODAY, 10 * 60)
  return DataFolder.open({
    fs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.2.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
}

const slashed = (p: string) => p.split(String.fromCharCode(92)).join('/')
const write = (rel: string, v: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), typeof v === 'string' ? v : JSON.stringify(v))
}
// Blocks as a list or, as the app writes them, a map by id.
const dayFile = (date: string, blocks: unknown, more: Record<string, unknown> = {}) => write(paths.day(date), { schema: 1, date, blocks, ...more })
const blk = (id: string, extra: Record<string, unknown> = {}) => ({ id, categoryId: 'analiza', startMin: 600, durationMin: 60, fixed: false, ...extra })

describe('dni do wyszukiwarki', () => {
  it('bloki ze wszystkich dni (minionych, dzisiejszego i przyszłych), z nazwą bez id i z notatką', async () => {
    write('routines/rano.json', { schema: 1, id: 'rano', name: 'Poranna rutyna', normal: [{ id: 's1', name: 'woda', min: 5 }], worse: [], archived: false })
    write('requests/r1.json', { schema: 1, id: 'r1', person: null, note: '', state: 'queued', createdAt: 1 })
    dayFile('2025-03-02', [blk('a', { note: 'telefon do Kowalskiego' })])
    dayFile(TODAY, [blk('b', { routine: 'rano' }), blk('c', { categoryId: 'nauka', variantId: 'sluchanie' })])
    dayFile('2026-11-05', [blk('d', { categoryId: 'inne', name: 'Spotkanie w Łodzi', note: 'Żółw' })])
    const folder = await make()
    const c = await folder.searchDays()
    expect(c.complete).toBe(true)
    const by = (id: string) => c.blocks.find((b) => b.id === id)
    expect(by('a')).toEqual({ date: '2025-03-02', id: 'a', title: 'Analiza', note: 'telefon do Kowalskiego' })
    expect(by('b')!.title).toBe('Poranna rutyna')
    expect(by('c')!.title).toBe('Nauka — słuchanie')
    expect(by('d')).toEqual({ date: '2026-11-05', id: 'd', title: 'Spotkanie w Łodzi', note: 'Żółw' })
    // The day's whole plan: the layers the settings add (sessions …) are there too, each of ours once.
    for (const id of ['a', 'b', 'c', 'd']) expect(c.blocks.filter((b) => b.id === id)).toHaveLength(1)
    // Never an id as a name.
    expect(c.blocks.map((b) => b.title).join(' ')).not.toMatch(/rano|sluchanie|analiza\b/)
  })

  it('blok odwołany na dniu i przeniesiony na inny dzień nie jest wynikiem tego dnia', async () => {
    dayFile('2026-10-22', [blk('x'), blk('gone'), blk('moved')], { cancelled: ['gone'], movedTo: { moved: '2026-10-23' } })
    dayFile('2026-10-23', [blk('moved', { note: 'tu jest teraz' })])
    const c = await (await make()).searchDays()
    expect(c.blocks.filter((b) => ['x', 'gone', 'moved'].includes(b.id)).map((b) => `${b.date}:${b.id}`).sort()).toEqual(['2026-10-22:x', '2026-10-23:moved'])
  })

  it('dzień nieczytelny w tej chwili: odpowiedź niekompletna, reszta dni jest', async () => {
    dayFile('2026-10-20', [blk('ok')])
    dayFile('2026-10-19', [blk('later')])
    const bad = slashed(join(dataDir, paths.day('2026-10-19')))
    const fs: DataFs = { ...nodeFs, read: (abs) => (slashed(abs) === bad ? Promise.reject(new Error('EBUSY')) : nodeFs.read(abs)) }
    const c = await (await make(fs)).searchDays()
    expect(c.complete).toBe(false)
    expect(c.blocks.filter((b) => ['ok', 'later'].includes(b.id)).map((b) => b.id)).toEqual(['ok'])
  })

  it('folder bez dni: pusta, ale kompletna odpowiedź', async () => {
    expect(await (await make()).searchDays()).toEqual({ blocks: [], complete: true })
  })

  it('zmiana notatki z okna widać od razu (kolejka), a drugi odczyt nie czyta plików, które się nie zmieniły', async () => {
    for (let d = 1; d <= 30; d++) dayFile(`2026-09-${String(d).padStart(2, '0')}`, { [`b${d}`]: blk(`b${d}`, { note: 'stara' }) })
    let reads = 0
    const fs: DataFs = { ...nodeFs, read: (abs) => (abs.includes('days') ? (reads++, nodeFs.read(abs)) : nodeFs.read(abs)) }
    const folder = await make(fs)
    await folder.searchDays()
    const first = reads
    expect(first).toBeGreaterThanOrEqual(30)
    reads = 0
    const again = await folder.searchDays()
    expect(reads).toBe(0)
    expect(again.blocks.filter((b) => /^b\d+$/.test(b.id))).toHaveLength(30)
    await folder.edit([{ rel: paths.day('2026-09-07'), edits: [{ path: ['blocks', 'b7', 'note'], base: 'stara', value: 'nowa' }] }])
    const changed = await folder.searchDays()
    expect(changed.blocks.find((b) => b.id === 'b7')!.note).toBe('nowa')
  })

  it('blok z szablonu, którego dzień z plikiem nie zmienił (tylko pobudka), też jest znaleziony – pełny plan dnia jak w „Dziś”', async () => {
    write(paths.record('template', 'zwykly'), {
      schema: 1,
      id: 'zwykly',
      name: 'Zwykły',
      dayType: 'zwykly',
      weekdays: [],
      versions: [{ from: '2000-01-01', blocks: [blk('tpl', { categoryId: 'nauka', note: 'powtórka rozdziału' })] }]
    })
    dayFile('2026-10-14', [], { wakeMin: 7 * 60 })
    const c = await (await make()).searchDays()
    const found = c.blocks.filter((b) => b.date === '2026-10-14' && b.title === 'Nauka (NotebookLM)')
    expect(found).toHaveLength(1)
    expect(found[0]!.note).toBe('powtórka rozdziału')
  })

  it('błąd odczytu ustawień: odpowiedź niekompletna, bloki dni są', async () => {
    dayFile('2026-10-20', [blk('ok')])
    const folder = await make()
    write('rd.json', '{nie json')
    const c = await folder.searchDays()
    expect(c.complete).toBe(false)
    expect(c.blocks.some((b) => b.id === 'ok')).toBe(true)
  })

  it.each(['routines', 'requests'])('lista %s nie do odczytania: odpowiedź niekompletna, nie „pusta”', async (dir) => {
    dayFile('2026-10-20', [blk('ok')])
    let broken = false
    const fs: DataFs = { ...nodeFs, list: (abs) => (broken && slashed(abs).endsWith(`/${dir}`) ? Promise.reject(new Error('EBUSY')) : nodeFs.list(abs)) }
    const folder = await make(fs)
    broken = true
    const c = await folder.searchDays()
    expect(c.complete).toBe(false)
    expect(c.blocks.some((b) => b.id === 'ok')).toBe(true)
  })

  it('lista jednego roku nie do odczytania: inne lata są, ten rok oznacza niekompletność', async () => {
    dayFile('2025-12-30', [blk('old')])
    dayFile('2026-10-20', [blk('new')])
    const fs: DataFs = { ...nodeFs, list: (abs) => (slashed(abs).endsWith('/days/2025') ? Promise.reject(new Error('EBUSY')) : nodeFs.list(abs)) }
    const c = await (await make(fs)).searchDays()
    expect(c.complete).toBe(false)
    expect(c.blocks.some((b) => b.id === 'new')).toBe(true)
  })

  it('log dnia nieczytelny w tej chwili: odpowiedź niekompletna, ale własne bloki dnia są', async () => {
    dayFile('2026-10-20', [blk('mine', { note: 'notatka' })])
    let broken = false
    const fs: DataFs = { ...nodeFs, list: (abs) => (broken && slashed(abs).includes('/log/') ? Promise.reject(new Error('EBUSY')) : nodeFs.list(abs)) }
    const folder = await make(fs)
    broken = true
    const c = await folder.searchDays()
    expect(c.complete).toBe(false)
    expect(c.blocks.find((b) => b.id === 'mine')?.note).toBe('notatka')
  })
})
