/**
 * T1447 (T1433): a save of a routine with another cost writes its `routine.cost` to the journal without fsync – one synchronous line, as
 * the end of the Windows session does – and the next write of the logs (the check, every 15 s) waits for the disk with it. The line is in
 * the journal, the event in the day as this computer reads it, in the same turn as the record; the order of the events stays.
 * T1446: a journal that does not take the line – the record is saved and the window says the begun block counts the cost it had.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'

// Which file each fsync waited for (by the descriptor `openSync` gave).
// `failJournal`: a line of the journal without fsync fails (a full disk).
const track = vi.hoisted(() => ({ opened: new Map<number, string>(), fsyncs: [] as string[], failJournal: false }))
vi.mock('node:fs', async (importOriginal) => {
  const m = await importOriginal<typeof import('node:fs')>()
  return {
    ...m,
    appendFileSync: ((...args: Parameters<typeof m.appendFileSync>) => {
      if (track.failJournal && String(args[0]).endsWith('journal.v1.jsonl')) throw Object.assign(new Error('ENOSPC: brak miejsca na dysku'), { code: 'ENOSPC' })
      return m.appendFileSync(...args)
    }) as typeof m.appendFileSync,
    openSync: ((...args: Parameters<typeof m.openSync>) => {
      const fd = m.openSync(...args)
      track.opened.set(fd, String(args[0]))
      return fd
    }) as typeof m.openSync,
    fsyncSync: (fd: number) => {
      track.fsyncs.push(track.opened.get(fd) ?? '?')
      return m.fsyncSync(fd)
    }
  }
})

const { DataFolder } = await import('../../src/main/data/folder')
const { EventLog } = await import('../../src/main/data/eventLog')
const { nodeFs } = await import('../../src/main/data/fsio')
const { DataHub } = await import('../../src/main/data/hub')
// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
const { reloadData, ROUTINE_COST_KEPT_TEXT } = await load<{ reloadData: () => Promise<void>; ROUTINE_COST_KEPT_TEXT: string }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Array<{ text: string; kind?: string }> }; setState: (s: { toasts: [] }) => void } }>('../../src/renderer/store/ui')
const { saveRoutineRecord } = await load<{ saveRoutineRecord: (id: string, patch: Record<string, unknown>) => Promise<{ out: Array<{ status: string }> | null }> }>('../../src/renderer/features/routines/routineCost')

const DAY = '2026-10-21'
const C0 = { head: 4, emotions: 0, senses: 1, body: 1 }
const C1 = { head: 5, emotions: 0, senses: 1, body: 2 }
const rut = paths.record('routine', 'r1')
let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-rcjournal-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(join(dataDir, 'routines'), { recursive: true })
  writeFileSync(join(dataDir, rut), JSON.stringify({ schema: 1, id: 'r1', name: 'Poranna', normal: [], worse: [], archived: false, costs: C0 }))
})
afterEach(() => {
  track.failJournal = false
  rmSync(root, { recursive: true, force: true })
})

describe('routine.cost w dzienniku bez fsync, fsync przy najbliższym sprawdzeniu (T1447)', () => {
  it('zapis rutyny: linia w dzienniku i zdarzenie w dniu od razu, bez czekania na dysk; sprawdzenie czeka na dysk raz; inne zdarzenia jak dotąd', async () => {
    const now = placeLogical(DAY, 10 * 60)
    const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir, computer: 'pca', computerName: 'PC A', appVersion: '0.2.0', clock: { wall: () => now, mono: () => now }, holidays: marketDay, oneDriveRunning: () => true })
    const journal = folder.log.journalPath
    const journalSyncs = () => track.fsyncs.filter((p) => p === journal).length
    track.fsyncs.length = 0
    expect((await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C0, value: C1 }] }]))[0]!.status).toBe('applied')
    expect(journalSyncs()).toBe(0)
    // In the same turn: the line in the journal (the last one, the next number) and the event in the day this computer reads.
    const lines = readLogText(readFileSync(journal, 'utf8')).events
    expect(lines.at(-1)).toMatchObject({ k: 'routine.cost', costs: C1, was: C0 })
    expect(lines.map((e) => e.n)).toEqual([...lines.map((e) => e.n)].sort((a, b) => a - b))
    expect((await folder.readDay(DAY)).events.filter((e) => e.k === 'routine.cost')).toHaveLength(1)
    // The next event of the window: fsync at once, as before, after the line – in its order.
    await folder.userEvents([{ k: 'tree.change', day: DAY }])
    expect(journalSyncs()).toBe(1)
    expect(readLogText(readFileSync(journal, 'utf8')).events.slice(-2).map((e) => e.k)).toEqual(['routine.cost', 'tree.change'])
    // Another save, then the check: one fsync of the journal for what waited.
    await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C1, value: C0 }] }])
    expect(journalSyncs()).toBe(1)
    await folder.check()
    expect(journalSyncs()).toBe(2)
    // Nothing waits: the next check waits for nothing.
    await folder.check()
    expect(journalSyncs()).toBe(2)
    // The journal read again (a start after it): both changes, in their order.
    expect(EventLog.readJournal(stateDir).events.filter((e) => e.k === 'routine.cost').map((e) => (e as unknown as { costs: unknown }).costs)).toEqual([C1, C0])
    await folder.close()
  })
})

describe('dziennik nie przyjął routine.cost (T1446)', () => {
  it('rekord zapisany; okno mówi, że zaczęty blok liczy na razie dotychczasowy koszt – raz, przy tym zapisie', async () => {
    const hub = new DataHub({ userData: join(root, 'appdata'), computer: () => 'pca', computerName: 'PC A', appVersion: '1.25.0', runId: `run-${Math.random()}`, holidays: marketDay, idleSeconds: () => 0, log: () => undefined, writeGuardPlan: false, extraBackupDir: () => null, previousVersion: () => null, onChange: () => undefined })
    expect(await hub.open(dataDir)).toBe(true)
    ;(globalThis as unknown as { window: { rd: Record<string, unknown> } }).window = { rd: { dataView: () => hub.view(), dayFiles: (dates: string[]) => hub.dayFiles(dates), dayData: (date: string) => hub.day(date), edit: (entries: never) => hub.edit(entries), logEvents: (events: never) => hub.events(events) } }
    useUi.setState({ toasts: [] })
    try {
      await reloadData()
      track.failJournal = true
      const { out } = await saveRoutineRecord('r1', { costs: C1 })
      track.failJournal = false
      expect(out).toEqual([{ status: 'applied', routineCostKept: true }])
      expect(JSON.parse(readFileSync(join(dataDir, rut), 'utf8')).costs).toEqual(C1)
      expect(useUi.getState().toasts.map((t) => [t.text, t.kind])).toEqual([[ROUTINE_COST_KEPT_TEXT, 'error']])
      // The next save writes its event: nothing more said.
      useUi.setState({ toasts: [] })
      expect((await saveRoutineRecord('r1', { costs: C0 })).out).toEqual([{ status: 'applied' }])
      expect(useUi.getState().toasts).toEqual([])
    } finally {
      await hub.close('quit')
      delete (globalThis as { window?: unknown }).window
    }
  })
})
