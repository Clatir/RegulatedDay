/**
 * The data service of the main process (fixes after the review of E1): the end of the Windows session is no crash of
 * the folder at the next start, a stop waits for a check under way (no events after the observation's end), and the
 * guard's plan of sessions and classes is refreshed every hour.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { placeLogical } from '@shared/time/day'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { DataService, stateDirFor, type ServiceOptions } from '../../src/main/data/service'

const DAY = '2026-10-21'
let root: string
let dataDir: string
let userData: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-service-'))
  dataDir = join(root, 'data')
  userData = join(root, 'appdata')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function options(clock: { now: number }, extra: Partial<ServiceOptions> = {}): ServiceOptions {
  const logs: string[] = []
  return {
    dataDir,
    userData,
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.2.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: (level, msg) => logs.push(`${level} ${msg}`),
    writeGuardPlan: false,
    clock: { wall: () => clock.now, mono: () => clock.now },
    // The checks are driven by hand: the scheduler's timer never fires by itself.
    timers: { set: () => null, clear: () => undefined },
    ...extra
  }
}

const journal = () => readLogText(readFileSync(join(stateDirFor(userData, dataDir), 'journal.v1.jsonl'), 'utf8')).events

describe('usługa folderu danych', () => {
  it('koniec sesji Windows zapisuje zamknięcie znacznika życia folderu: następny start to nie awaria', async () => {
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const s = await DataService.start(options(clock))
    s.systemEnd()
    s.systemEnd()
    clock.now += 10 * 60_000
    const again = await DataService.start(options(clock))
    const ev = journal()
    expect(ev.filter((e) => e.k === 'observe.to' && (e as { why: string }).why === 'system')).toHaveLength(1)
    expect(ev.some((e) => e.k === 'observe.to' && (e as { why: string }).why === 'crash')).toBe(false)
    await again.stop('quit')
  })

  it('zatrzymanie czeka na trwające sprawdzenie: po końcu obserwacji nie ma już zdarzeń', async () => {
    const clock = { now: placeLogical(DAY, 10 * 60) }
    // A slow folder: every read takes a while, so a check is under way when the quit comes.
    const slow: DataFs = { ...nodeFs, read: async (abs) => (await new Promise((r) => setTimeout(r, 30)), nodeFs.read(abs)), list: async (abs) => (await new Promise((r) => setTimeout(r, 30)), nodeFs.list(abs)) }
    const s = await DataService.start(options(clock, { fs: slow }))
    // The first check (at the start) ends; six minutes on: the check will write „observation goes on” near its end.
    await s.tick()
    clock.now += 6 * 60_000
    void s.tick()
    await s.stop('quit')
    const ev = journal()
    const end = ev.findIndex((e) => e.k === 'observe.to' && (e as { why: string }).why === 'quit')
    expect(end).toBeGreaterThan(-1)
    expect(ev.slice(end + 1)).toEqual([])
    expect(ev.some((e) => e.k === 'observe.alive')).toBe(true)
  })

  it('plik planu dla strażnika odświeża się co godzinę (także na komputerze, który nie tworzy dnia)', async () => {
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const s = await DataService.start(options(clock, { writeGuardPlan: true }))
    await s.tick()
    const file = join(userData, 'plan-blocks.json')
    expect(existsSync(file)).toBe(true)
    const first = JSON.parse(readFileSync(file, 'utf8')) as { from: number; blocks: Array<{ kind: string }> }
    expect(first.blocks.some((b) => b.kind === 'session')).toBe(true)
    // A day later (the computer never restarted, another one leads): the plan covers the new days.
    clock.now += 24 * 3_600_000
    await s.tick()
    const next = JSON.parse(readFileSync(file, 'utf8')) as { from: number }
    expect(next.from).toBeGreaterThan(first.from)
    await s.stop('quit')
  })
})
