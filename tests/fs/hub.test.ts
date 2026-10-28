/**
 * The data folder of the main window (fixes after the review of E3): the quit stops a folder that opens after its wait
 * and arms no retry, a folder chosen while another one is still opening is the one that opens, a backup before an update
 * that failed is made at the next opening, a computer whose own settings cannot be read is never shown the wizard, and a
 * day file changed on another computer reaches the window.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { DataHub, type HubOptions } from '../../src/main/data/hub'
import { STOP_TIMEOUT_MS, type DataService, type ServiceOptions } from '../../src/main/data/service'

let root: string
let dirA: string
let dirB: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-hub-'))
  dirA = join(root, 'a')
  dirB = join(root, 'b')
  mkdirSync(dirA, { recursive: true })
  mkdirSync(dirB, { recursive: true })
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}

/** A service that only counts its stops (the folder's own work is not what these tests look at). */
function fakeService(stops: string[], dir: string): DataService {
  return { stop: async () => void stops.push(dir), refreshGuardPlan: async () => undefined, hint: () => undefined } as unknown as DataService
}

function hubWith(extra: Partial<HubOptions> = {}) {
  const logs: string[] = []
  const o = { changes: 0 }
  const hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '0.3.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: (level, msg) => logs.push(`${level} ${msg}`),
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => void o.changes++,
    ...extra
  })
  return { hub, logs, o }
}

describe('folder danych okna głównego (DataHub)', () => {
  it('zamknięcie aplikacji w trakcie długiego otwierania: folder otwarty po jego czasie zostaje zamknięty', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const gate = deferred<void>()
    const stops: string[] = []
    let started = 0
    const { hub } = hubWith({ start: async (o: ServiceOptions) => (started++, await gate.promise, fakeService(stops, o.dataDir)) })
    const opened = hub.open(dirA)
    await vi.waitFor(() => expect(started).toBe(1))
    const closed = hub.close('quit')
    await vi.advanceTimersByTimeAsync(STOP_TIMEOUT_MS)
    await closed
    // The folder answers only now (after the quit's wait): it is stopped at once, never left running.
    gate.resolve()
    expect(await opened).toBe(false)
    expect(stops).toEqual([dirA])
    expect(hub.service).toBeNull()
    expect(await hub.open(dirA)).toBe(false)
    expect(started).toBe(1)
  })

  it('zamknięcie aplikacji w trakcie otwierania, które potem się nie udaje: żadnych ponowień', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const gate = deferred<void>()
    let started = 0
    const { hub } = hubWith({ start: async () => (started++, await gate.promise, Promise.reject(new Error('EBUSY'))) })
    const opened = hub.open(dirA)
    await vi.waitFor(() => expect(started).toBe(1))
    const closed = hub.close('quit')
    await vi.advanceTimersByTimeAsync(STOP_TIMEOUT_MS)
    await closed
    gate.resolve()
    expect(await opened).toBe(false)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    // A retry would be opening now (its look at the folder is real I/O: given time to end).
    expect(hub.status).toBe('failed')
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
    expect(started).toBe(1)
  })

  it('inny folder wybrany w trakcie otwierania poprzedniego: otwiera się ten nowy', async () => {
    const gate = deferred<void>()
    const stops: string[] = []
    const starts: string[] = []
    const { hub } = hubWith({
      start: async (o: ServiceOptions) => {
        starts.push(o.dataDir)
        if (o.dataDir === dirA) await gate.promise
        return fakeService(stops, o.dataDir)
      }
    })
    const a = hub.open(dirA)
    await vi.waitFor(() => expect(starts).toEqual([dirA]))
    const b = hub.open(dirB)
    gate.resolve()
    expect(await a).toBe(true)
    expect(await b).toBe(true)
    expect(starts).toEqual([dirA, dirB])
    expect(stops).toEqual([dirA])
    expect(hub.folder).toBe(dirB)
    expect(hub.status).toBe('open')
    // The same folder again while it is open: nothing is reopened.
    expect(await hub.open(dirB)).toBe(true)
    expect(starts).toEqual([dirA, dirB])
  })

  it('kopia przed aktualizacją, która się nie udała, powstaje przy następnym otwarciu', async () => {
    const stops: string[] = []
    const { hub, logs } = hubWith({ previousVersion: () => '0.2.0', start: async (o: ServiceOptions) => fakeService(stops, o.dataDir) })
    // backups/ is a file in the first folder: the backup cannot be made there.
    writeFileSync(join(dirA, 'backups'), 'x')
    writeFileSync(join(dirA, paths.settings), '{"schema":1}')
    writeFileSync(join(dirB, paths.settings), '{"schema":1}')
    expect(await hub.open(dirA)).toBe(true)
    expect(logs.some((l) => l.startsWith('error kopia przed aktualizacją'))).toBe(true)
    expect(await hub.open(dirB)).toBe(true)
    expect(logs.some((l) => l.startsWith('info kopia przed aktualizacją 0.2.0 → 0.3.0'))).toBe(true)
  })

  it('folder liczy się jako tej wersji dopiero z kopią przed aktualizacją – inaczej następne uruchomienie ją robi (A3-17)', async () => {
    const stops: string[] = []
    const opened: string[] = []
    const { hub } = hubWith({ previousVersion: () => '0.2.0', dataOpened: (v: string) => opened.push(v), start: async (o: ServiceOptions) => fakeService(stops, o.dataDir) })
    writeFileSync(join(dirA, 'backups'), 'x')
    writeFileSync(join(dirA, paths.settings), '{"schema":1}')
    writeFileSync(join(dirB, paths.settings), '{"schema":1}')
    expect(await hub.open(dirA)).toBe(true)
    expect(opened).toEqual([])
    expect(await hub.open(dirB)).toBe(true)
    expect(opened).toEqual(['0.3.0'])
  })

  it('ustawienia komputera nieczytelne: folder nieznany (nie kreator); odczytane bez folderu – kreator', () => {
    const { hub } = hubWith()
    hub.unknownFolder('config.json nieczytelny')
    expect(hub.status).toBe('failed')
    expect(hub.folder).toBeNull()
    hub.noFolder()
    expect(hub.status).toBe('none')
    // A computer whose folder is known is never turned into one without it.
    const known = hubWith().hub
    known.expect(dirA)
    known.unknownFolder('x')
    known.noFolder()
    expect(known.status).toBe('opening')
  })

  it('dane wspólne pierwszego komputera: przed otwarciem folderu, rd.json na końcu, nic nie jest nadpisywane', async () => {
    const dir = join(root, 'first')
    const records = [
      { rel: paths.settings, value: { schema: 1, people: [{ id: 'p1', name: 'Mama' }] } },
      { rel: paths.record('template', 'zwykly'), value: { schema: 1, id: 'zwykly' } },
      { rel: paths.record('template', 'sobota'), value: { schema: 1, id: 'sobota' } }
    ]
    const order: string[] = []
    const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (order.push(p.slice(dir.length + 1).replace(/\\/g, '/')), nodeFs.writeAtomic(p, t)) }
    await DataHub.createFirst(dir, records, 'pca', 1000, fs)
    expect(order).toEqual([paths.record('template', 'zwykly'), paths.record('template', 'sobota'), paths.settings])
    expect(JSON.parse(readFileSync(join(dir, paths.settings), 'utf8'))).toMatchObject({ people: [{ name: 'Mama' }], updatedAt: 1000, updatedBy: 'pca' })
    // „Zakończ” again after a failed one: the same files are skipped.
    order.length = 0
    await DataHub.createFirst(dir, records, 'pca', 2000, fs)
    expect(order).toEqual([])
    // Another computer's data still coming through OneDrive (rd.json not yet here): never written over.
    const other = join(root, 'other')
    mkdirSync(join(other, 'templates'), { recursive: true })
    writeFileSync(join(other, paths.record('template', 'sobota')), JSON.stringify({ schema: 1, id: 'sobota', note: 'z laptopa' }))
    await expect(DataHub.createFirst(other, records, 'pca', 1000)).rejects.toThrow(/jest już templates\/sobota\.json/)
    expect(JSON.parse(readFileSync(join(other, paths.record('template', 'sobota')), 'utf8')).note).toBe('z laptopa')
    expect(existsSync(join(other, paths.settings))).toBe(false)
  })

  it('plik dzisiejszego dnia zmieniony na innym komputerze: okno dostaje zmianę', async () => {
    const { hub, o } = hubWith()
    expect(await hub.open(dirA)).toBe(true)
    try {
      await vi.waitFor(() => expect(o.changes).toBeGreaterThan(0))
      // Settled: a check with nothing new tells the window nothing.
      const settled = async () => {
        let before = -1
        while (before !== o.changes) {
          before = o.changes
          hub.changed()
          await new Promise((r) => setTimeout(r, 50))
        }
      }
      await settled()
      const n = o.changes
      const today = logicalDayOf(hub.service!.folder.clock.now())
      mkdirSync(join(dirA, paths.day(today), '..'), { recursive: true })
      writeFileSync(join(dirA, paths.day(today)), JSON.stringify({ schema: 1, date: today, wakeMin: 7 * 60 }))
      hub.changed()
      await vi.waitFor(() => expect(o.changes).toBe(n + 1))
    } finally {
      await hub.close('quit')
    }
  })

  it('widok danych mówi oknu, czy trwa okres kalibracji (energia okna liczy się jak paska)', async () => {
    const { hub } = hubWith()
    expect(await hub.open(dirA)).toBe(true)
    try {
      expect((await hub.view()).calibration).toBe(false)
      // A day closed by the ritual yesterday (its grade): the period started, it lasts.
      const yesterday = addDays(logicalDayOf(hub.service!.folder.clock.now()), -1)
      mkdirSync(join(dirA, 'grades', yesterday.slice(0, 4)), { recursive: true })
      writeFileSync(join(dirA, paths.grades(yesterday.slice(0, 4), 'lap')), `${JSON.stringify({ day: yesterday, v: 1, know: { lap: 3 }, grade: { closed: 'ritual', dayType: 'zwykly' } })}\n`)
      const fresh = hubWith()
      expect(await fresh.hub.open(dirA)).toBe(true)
      try {
        expect((await fresh.hub.view()).calibration).toBe(true)
      } finally {
        await fresh.hub.close('quit')
      }
    } finally {
      await hub.close('quit')
    }
  })
})
