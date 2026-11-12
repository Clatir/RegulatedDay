/**
 * What the counts of series read in a data folder (T717): the types of the days a count reads are read once per its
 * inputs for a minute (a check every 15 s reads none again), never for a series whose type of day changes nothing, and a
 * series that ended before yesterday is not read again; this computer's write of a day reads at once. The window keeps
 * the series it saw when they cannot be read now (never „none”: the days to come would lose their occurrences).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { seriesJson, type Series } from '@shared/model/series'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { DataHub } from '../../src/main/data/hub'
import { DataService, type ServiceOptions } from '../../src/main/data/service'

let root: string
let dataDir: string
/** The folders a test opened: closed after it (`folderWithCount`). */
let opened: DataFolder[] = []
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-series-reads-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  opened = []
})
afterEach(async () => {
  try {
    for (const f of opened) await f.close('quit')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const write = (rel: string, value: unknown) => {
  mkdirSync(dirname(join(dataDir, rel)), { recursive: true })
  writeFileSync(join(dataDir, rel), JSON.stringify(value))
}

const block = { categoryId: 'inne', variantId: null, startMin: 22 * 60, durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null }
const series = (id: string, start: string, o: Partial<Series> & { special?: 'held' | 'skip' | 'ask' } = {}): Series => ({
  id,
  root: id,
  start,
  until: null,
  count: 5,
  archived: false,
  ...o,
  versions: [{ from: start, block, rule: { kind: 'daily' }, special: o.special ?? 'ask' }]
})

/**
 * A folder whose reads of days' files are counted (the stats and reads a count makes); `fail.read` – the file of a day
 * that cannot be read now, `fail.write` – the folder's writes fail (edits wait in the queue). Closed after the test.
 */
async function folderWithCount(today: string) {
  const reads = { days: 0 }
  const fail = { read: null as string | null, write: false }
  const counted = (p: string) => p.replace(/\\/g, '/').includes('/days/') && reads.days++
  const busy = () => Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
  const fs: DataFs = {
    ...nodeFs,
    stat: (p) => (counted(p), nodeFs.stat(p)),
    read: (p) => (counted(p), fail.read && p.replace(/\\/g, '/').endsWith(fail.read) ? busy() : nodeFs.read(p)),
    writeAtomic: (p, t) => (fail.write && p.replace(/\\/g, '/').includes('/days/') ? busy() : nodeFs.writeAtomic(p, t))
  }
  let mono = 0
  const now = placeLogical(today, 10 * 60)
  const folder = await DataFolder.open({ fs, dataDir, stateDir: join(root, 'state'), computer: 'pca', computerName: 'PC A', appVersion: '1.11.0', clock: { wall: () => now + mono, mono: () => mono }, holidays: marketDay, oneDriveRunning: () => true })
  opened.push(folder)
  return { folder, reads, fail, tick: (ms: number) => (mono += ms) }
}

const lastOf = async (folder: DataFolder, id: string, own = false) => (await folder.inputs(own)).series.find((p) => p.series.id === id)!.last
const wolne = (d: string) => recordEdit(paths.day(d), null, { schema: 1, date: d, dayType: 'wolne' })!

describe('odczyty licznika serii (T717)', () => {
  const today = '2026-11-12'

  it('drugie `inputs()` bez zmian nie czyta dni licznika; po minucie albo po własnym zapisie dnia – czyta', async () => {
    write(paths.record('series', 'fizjo'), seriesJson(series('fizjo', addDays(today, 1))))
    const { folder, reads, tick } = await folderWithCount(today)
    await folder.inputs()
    expect(reads.days).toBeGreaterThanOrEqual(5)
    const first = reads.days
    await folder.inputs()
    await folder.inputs(true)
    const afterOwn = reads.days
    await folder.inputs(true)
    expect(reads.days).toBe(afterOwn)
    expect(afterOwn - first).toBeGreaterThan(0)
    await folder.inputs()
    expect(reads.days).toBe(afterOwn)
    // This computer marks a day of the count „Wolne”: read again at once – the end moves a day further.
    const d = addDays(today, 2)
    await folder.edit([recordEdit(paths.day(d), null, { schema: 1, date: d, dayType: 'wolne' })!])
    expect((await folder.inputs()).series[0]!.last).toBe(addDays(today, 6))
    // A minute later the counts read again (a type set on another computer reaches them).
    const before = reads.days
    tick(61_000)
    await folder.inputs()
    expect(reads.days).toBeGreaterThan(before)
  })

  it('seria „odbywa się” i seria bez licznika nie czytają dni; seria zakończona przed wczoraj – raz', async () => {
    write(paths.record('series', 'held'), seriesJson(series('held', addDays(today, 1), { special: 'held' })))
    write(paths.record('series', 'free'), seriesJson(series('free', addDays(today, 1), { count: null })))
    const { folder, reads, tick } = await folderWithCount(today)
    expect((await folder.inputs()).series.map((p) => [p.series.id, p.last])).toEqual([
      ['free', null],
      ['held', addDays(today, 5)]
    ])
    expect(reads.days).toBe(0)
    // Ended before yesterday: its days are read once, never again (days gone by never change).
    write(paths.record('series', 'old'), seriesJson(series('old', addDays(today, -20))))
    tick(61_000)
    expect((await folder.inputs()).series.find((p) => p.series.id === 'old')!.last).toBe(addDays(today, -16))
    const once = reads.days
    expect(once).toBeGreaterThan(0)
    tick(61_000)
    await folder.inputs()
    expect(reads.days).toBe(once)
  })
})

describe('seria zakończona przed wczoraj: typy dni ustalone tylko z pewnych odczytów (T717)', () => {
  const today = '2026-11-12'
  const old = () => series('old', addDays(today, -20))

  it('dzień, którego nie dało się przeczytać, nie zostaje „bez typu” na zawsze: po minucie przeczytany znowu', async () => {
    write(paths.record('series', 'old'), seriesJson(old()))
    write(paths.day(addDays(today, -18)), { schema: 1, date: addDays(today, -18), dayType: 'wolne' })
    const { folder, fail, tick } = await folderWithCount(today)
    fail.read = paths.day(addDays(today, -18))
    expect(await lastOf(folder, 'old')).toBe(addDays(today, -16))
    fail.read = null
    tick(61_000)
    expect(await lastOf(folder, 'old')).toBe(addDays(today, -15))
  })

  it('plik dnia z zakresu, który doszedł potem (OneDrive), liczy się od nowa', async () => {
    write(paths.record('series', 'old'), seriesJson(old()))
    const { folder, tick } = await folderWithCount(today)
    expect(await lastOf(folder, 'old')).toBe(addDays(today, -16))
    write(paths.day(addDays(today, -18)), { schema: 1, date: addDays(today, -18), dayType: 'wolne' })
    tick(61_000)
    expect(await lastOf(folder, 'old')).toBe(addDays(today, -15))
  })

  it('niezapisana edycja z kolejki liczy się tylko w widoku okna, nigdy u prowadzącego (dane.md)', async () => {
    write(paths.record('series', 'old'), seriesJson(old()))
    const { folder, fail } = await folderWithCount(today)
    fail.write = true
    expect((await folder.edit([wolne(addDays(today, -18))]))[0]!.status).toBe('waiting')
    expect(await lastOf(folder, 'old', true)).toBe(addDays(today, -15))
    expect(await lastOf(folder, 'old')).toBe(addDays(today, -16))
  })
})

describe('pamięć liczenia okna po wpisach kolejki (T717)', () => {
  it('inna niezapisana edycja przy tej samej liczbie wpisów kolejki – policzone od nowa', async () => {
    const today = '2026-11-12'
    write(paths.record('series', 'fizjo'), seriesJson(series('fizjo', addDays(today, 1))))
    const { folder, fail } = await folderWithCount(today)
    fail.write = true
    expect((await folder.edit([wolne(addDays(today, 2))]))[0]!.status).toBe('waiting')
    expect(await lastOf(folder, 'fizjo', true)).toBe(addDays(today, 6))
    // That edit given up, another one of a day outside the count: one entry in the queue again.
    await folder.queue.resolve(folder.queue.pending[0]!.id, 'theirs')
    expect((await folder.edit([wolne(addDays(today, 30))]))[0]!.status).toBe('waiting')
    expect(folder.queue.pending).toHaveLength(1)
    expect(await lastOf(folder, 'fizjo', true)).toBe(addDays(today, 5))
  })

  it('drugie liczenie tej samej zmiany nie czyta znowu dni już przeczytanych (`seen`)', async () => {
    const today = '2026-11-12'
    const s = series('fizjo', addDays(today, 1))
    const { folder, reads } = await folderWithCount(today)
    const seen = new Map()
    await folder.countTypes([s], [], true, seen)
    const once = reads.days
    expect(once).toBeGreaterThan(0)
    await folder.countTypes([s], [], true, seen)
    expect(reads.days).toBe(once)
  })
})

describe('okno: serie przy nieczytelnych ustawieniach (T717)', () => {
  it('rd.json chwilowo nieczytelny – widok okna zostaje z seriami widzianymi ostatnio, nie bez nich', async () => {
    const today = logicalDayOf(Date.now())
    write(paths.record('series', 'fizjo'), seriesJson(series('fizjo', today, { count: null })))
    let busy = false
    let brokenRead = false
    const ebusy = () => Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
    const fs: DataFs = {
      ...nodeFs,
      stat: (p) => (busy && p.endsWith('rd.json') ? ebusy() : nodeFs.stat(p)),
      read: (p) => (brokenRead && p.endsWith('broken.json') ? ebusy() : nodeFs.read(p))
    }
    const hub = new DataHub({
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
      onChange: () => undefined,
      start: (o: ServiceOptions) => DataService.start({ ...o, fs })
    })
    try {
      // A file of a series never read that cannot be read leaves only that series out, from the first view on (uwaga 7).
      write(paths.record('series', 'broken'), seriesJson(series('broken', today, { count: null })))
      brokenRead = true
      expect(await hub.open(dataDir)).toBe(true)
      expect((await hub.view()).series.map((r) => r.id)).toEqual(['fizjo'])
      busy = true
      expect((await hub.view()).series.map((r) => r.id)).toEqual(['fizjo'])
    } finally {
      busy = false
      await hub.close('quit')
    }
  })
})
