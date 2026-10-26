/**
 * The data folder's own rules (fixes after the review of E1): a record that cannot be read never makes the day from
 * defaults, the journal keeps only its last days, a stale segment is written again, a far-ahead clock stops the
 * leader's tasks only while it lasts, the observation after a sleep, the queue held by an antivirus, the gate of minutes
 * with a lost copy of a derived event, and one pass of writes per check.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { eventLine, readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { EditQueue } from '../../src/main/data/editQueue'
import { EventLog } from '../../src/main/data/eventLog'
import { EventClock } from '@shared/data/clock'

const DAY = '2026-10-21'
let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-folder-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A folder on a fake clock, with an optional faulty file system. */
async function make(o: { fs?: DataFs; at?: string } = {}) {
  let now = placeLogical(DAY, Number((o.at ?? '10:00').split(':')[0]) * 60 + Number((o.at ?? '10:00').split(':')[1]))
  const folder = await DataFolder.open({
    fs: o.fs ?? nodeFs,
    dataDir,
    stateDir,
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.2.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  const advance = async (min: number) => {
    let last = await folder.check()
    for (let i = 0; i < min; i++) {
      now += 60_000
      folder.noteInput(now, true)
      last = await folder.check()
    }
    return last
  }
  return { folder, advance, get now() { return now }, set now(v: number) { now = v } }
}

const events = (day = DAY, computer = 'pca'): AnyEvent[] => {
  try {
    return readLogText(readFileSync(join(dataDir, paths.log(day, computer)), 'utf8')).events
  } catch {
    return []
  }
}

describe('folder danych', () => {
  it('nieczytelny rd.json nie tworzy dnia z ustawień domyślnych; po odczycie dzień powstaje z jego ustawieniami', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, settings: [{ id: 's', from: '2026-01-01', at: null, patch: { boundaryBufferMin: 25 } }] }))
    let fail = true
    const fs: DataFs = { ...nodeFs, read: async (abs) => (fail && abs.endsWith('rd.json') ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : nodeFs.read(abs)) }
    const f = await make({ fs })
    const r = await f.advance(5)
    expect(r.leader.iLead && r.settled).toBe(true)
    expect(events().some((e) => e.k === 'day.create')).toBe(false)
    fail = false
    await f.advance(1)
    const created = events().find((e) => e.k === 'day.create') as { snapshot: { settings: { boundaryBufferMin: number } } } | undefined
    expect(created?.snapshot.settings.boundaryBufferMin).toBe(25)
  })

  it('dziennik trzyma ostatnie dni: starsze potwierdzone w folderze odpadają, niezapisane zostają', async () => {
    const f = await make()
    const old = addDays(DAY, -30)
    f.folder.append({ day: old, dom: 'meta', k: 'observe.alive', at: placeLogical(old, 600) })
    await f.advance(2)
    const journal = readFileSync(join(stateDir, 'journal.v1.jsonl'), 'utf8')
    expect(journal).not.toContain(`"day":"${old}"`)
    expect(events(old).length).toBe(1)
    expect(journal).toContain(`"day":"${DAY}"`)
  })

  it('odcinek unieważniony spóźnionym zdarzeniem prowadzący zapisuje od nowa', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, settings: [] }))
    const f = await make({ at: '09:00' })
    f.folder.append({ day: DAY, dom: 'timer', k: 'block.start', block: 'x', at: f.now, bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 600, tag: null, fixed: false }, confirmUntil: null, how: 'click' })
    await f.advance(10)
    const before = events().filter((e) => e.k === 'minutes').length
    expect(before).toBeGreaterThan(0)
    // The laptop's log arrives late with an event about the block at 09:02 the leader never saw: the minutes of the
    // segments after it are counted again and written again, now knowing the laptop's log.
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    const at = placeLogical(DAY, 9 * 60 + 2)
    appendFileSync(join(dataDir, paths.log(DAY, 'pcb')), eventLine({ id: 'pcb-0', c: 'pcb', n: 0, t: at, l: at, v: 1, day: DAY, dom: 'timer', k: 'block.confirm', block: 'x', at } as unknown as AnyEvent))
    await f.advance(1)
    const after = events().filter((e) => e.k === 'minutes') as unknown as Array<{ from: number; to: number; know: Record<string, number> }>
    expect(after.some((x) => x.know.pcb === 0 && x.from <= at + 60_000 && x.to > at)).toBe(true)
  })

  it('zdarzenie innego komputera ponad 24 h do przodu wstrzymuje zadania prowadzącego tylko, dopóki zegary się rozjeżdżają', async () => {
    const f = await make()
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    const ahead = f.now + 30 * 3_600_000
    appendFileSync(join(dataDir, paths.log(DAY, 'pcb')), eventLine({ id: 'pcb-0', c: 'pcb', n: 0, t: ahead, l: ahead, v: 1, day: DAY, dom: 'meta', k: 'observe.alive', at: ahead } as unknown as AnyEvent))
    const r = await f.advance(5)
    expect(r.problems.some((p) => p.startsWith('zegar'))).toBe(true)
    expect(events().some((e) => e.k === 'day.create')).toBe(false)
    // This computer's clock was the wrong one: once it is right (7 h later here), the tasks go on.
    f.now += 7 * 3_600_000
    await f.advance(4)
    expect(events().some((e) => e.k === 'day.create')).toBe(true)
  })

  it('obserwacja po uśpieniu: koniec przy uśpieniu, początek po wybudzeniu – raz, którakolwiek droga powie pierwsza', async () => {
    const f = await make()
    f.folder.suspend()
    f.folder.suspend()
    f.now += 20_000
    f.folder.unsettle('wake')
    f.folder.unsettle('wake')
    const own = f.folder.log.ownEvents(DAY)
    expect(own.filter((e) => e.k === 'observe.to').length).toBe(1)
    expect(own.filter((e) => e.k === 'observe.from' && (e as { why: string }).why === 'resume').length).toBe(1)
    // A sleep nobody announced (the scheduler's gap): the observation ends at the last check and starts again now.
    const last = f.now
    f.now += 3_600_000
    f.folder.unsettle('wake', last)
    const later = f.folder.log.ownEvents(DAY)
    expect(later.some((e) => e.k === 'observe.to' && (e as { at: number }).at === last)).toBe(true)
    expect(later.filter((e) => e.k === 'observe.from' && (e as { why: string }).why === 'resume').length).toBe(2)
  })

  it('jedno sprawdzenie listuje folder logu dnia dwa razy (własne kopie i odczyt), nie trzy', async () => {
    let lists = 0
    const fs: DataFs = { ...nodeFs, list: async (abs) => (abs.replace(/\\/g, '/').endsWith(paths.logDir(DAY)) && lists++, nodeFs.list(abs)) }
    const f = await make({ fs })
    await f.folder.check()
    // A click waits for the folder: the check writes it in one pass (no second comparison of the same log).
    f.folder.append({ day: DAY, dom: 'timer', k: 'disconnect.start', at: f.now })
    lists = 0
    await f.folder.check()
    expect(lists).toBe(2)
  })
})

describe('kolejka edycji zablokowana przy starcie', () => {
  it('blokada pliku to nie uszkodzenie: kolejka nie jest odkładana ani nadpisywana i wraca po odczycie', async () => {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, 'queue.v1.json'), JSON.stringify({ format: 1, entries: [{ id: 'e1', rel: 'templates/t.json', at: 1, schema: 1, edits: [{ path: ['name'], base: 'a', value: 'b' }] }] }))
    let busy = true
    const q = new EditQueue({ stateDir, computer: 'pca', read: (f) => (busy ? (() => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }) })() : readFileSync(f, 'utf8')) })
    q.load()
    q.add({ id: 'e2', rel: 'templates/t.json', at: 2, schema: 1, edits: [{ path: ['note'], base: undefined, value: 'x' }] })
    // Nothing set aside, nothing written over.
    expect(JSON.parse(readFileSync(join(stateDir, 'queue.v1.json'), 'utf8')).entries.map((e: { id: string }) => e.id)).toEqual(['e1'])
    busy = false
    q.load()
    expect(q.pending.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(JSON.parse(readFileSync(join(stateDir, 'queue.v1.json'), 'utf8')).entries.map((e: { id: string }) => e.id)).toEqual(['e1', 'e2'])
  })
})

describe('bramka minut i kopia zdarzenia o wyliczonym identyfikatorze', () => {
  it('numer przegranej kopii zdarzenia (dwa komputery zapisały to samo id) jest widoczny jako ostatni tego komputera', async () => {
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    const base = { day: DAY, dom: 'timer', k: 'hardend.pass', v: 1, id: 'auto-1' }
    writeFileSync(join(dataDir, paths.log(DAY, 'pca')), eventLine({ ...base, c: 'pca', n: 3, t: 10, l: 10, at: 10 } as unknown as AnyEvent))
    writeFileSync(join(dataDir, paths.log(DAY, 'pcb')), eventLine({ ...base, c: 'pcb', n: 7, t: 20, l: 20, at: 20 } as unknown as AnyEvent))
    const log = new EventLog({ fs: nodeFs, dataDir, stateDir, computer: 'pcc', clock: new EventClock({ wall: () => 1000, mono: () => 0 }), rulesVersion: 1 })
    const read = await log.readDay(DAY)
    expect(read.events).toHaveLength(1)
    expect(read.lastByComputer).toEqual({ pca: 3, pcb: 7 })
  })
})
