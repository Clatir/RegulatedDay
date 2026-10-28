/**
 * The data folder's own rules (fixes after the review of E1): a record that cannot be read never makes the day from
 * defaults, the journal keeps only its last days, a stale segment is written again, a far-ahead clock stops the
 * leader's tasks only while it lasts, the observation after a sleep, the queue held by an antivirus, the gate of minutes
 * with a lost copy of a derived event, and one pass of writes per check.
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { eventLine, readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder, LIST_TRUST_MS } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { EditQueue } from '../../src/main/data/editQueue'
import type { RecordStore } from '../../src/main/data/records'
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
async function make(o: { fs?: DataFs; at?: string; oneDriveProcess?: () => boolean } = {}) {
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
    oneDriveRunning: () => true,
    ...(o.oneDriveProcess ? { oneDriveProcess: o.oneDriveProcess } : {})
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

  it('odblokowanie ekranu przy nagrywanym wykładzie (blokada usypiania tego komputera) to obecność dla dźwięku (D331)', async () => {
    mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'w', categoryId: 'wyklad', startMin: 10 * 60, durationMin: 90, fixed: true, origin: 'user', recorder: 'pca' }] }))
    const f = await make()
    await f.advance(1)
    // Before the lecture: no block of sleep – an unlock is no presence for the sound.
    await f.folder.powerNeed(null, f.now)
    f.folder.noteUnlock(f.now)
    expect(f.folder.presence.own.soundPresence ?? null).toBeNull()
    expect((await f.folder.timerClick({ a: 'start', block: 'w' })).ok).toBe(true)
    expect((await f.folder.powerNeed(null, f.now)).system).toBe(true)
    f.folder.noteUnlock(f.now)
    expect(f.folder.presence.own.soundPresence).toBe(f.now)
  })

  it('stan nieustalony liczy się od chwili, gdy proces OneDrive działa – nie od 5 min „nie działa” (przegląd 0.23.0)', async () => {
    let process = false
    const f = await make({ oneDriveProcess: () => process })
    const r = await f.advance(5)
    expect(r.settled).toBe(false)
    process = true
    expect((await f.advance(5)).settled).toBe(true)
  })

  it('folder danych znika w trakcie pracy: nic nie powstaje w jego miejscu, zapisy czekają i wracają z folderem (A3-01)', async () => {
    const f = await make()
    await f.advance(2)
    rmSync(dataDir, { recursive: true, force: true })
    const r = await f.advance(3)
    expect(r.problems.some((p) => p.startsWith('folder danych niedostępny'))).toBe(true)
    expect(r.settled).toBe(false)
    expect(existsSync(dataDir)).toBe(false)
    // Back (restored from the bin): the events written meanwhile reach it.
    mkdirSync(dataDir, { recursive: true })
    await f.advance(1)
    expect(events().some((e) => e.k === 'observe.alive' && (e as { at: number }).at > f.now - 3 * 60_000)).toBe(true)
  })

  it('ucięta ostatnia linia dziennika (twarde wyłączenie) nie zabiera pierwszego zdarzenia po starcie (A3-12)', async () => {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, 'journal.v1.jsonl'), '{"id":"pca-0","c":"pca","n":0,"t":1')
    await make()
    expect(EventLog.readJournal(stateDir).events.some((e) => e.k === 'observe.from')).toBe(true)
  })

  it('obecność po ponownym uruchomieniu znów podaje ostatnie zdarzenie dni sprzed niego (A8-06)', async () => {
    const f = await make()
    const yesterday = addDays(DAY, -1)
    const e = f.folder.append({ day: yesterday, dom: 'meta', k: 'observe.alive', at: placeLogical(yesterday, 23 * 60) })
    await f.advance(2)
    const again = await make({ at: '11:00' })
    expect(again.folder.presence.own.lastEvents[yesterday]).toBe(e.n)
  })

  it('kopia konfliktowa rekordu usuniętego celowo nie przywraca go po cichu – jej treść idzie do historii (A3-11)', async () => {
    const f = await make()
    const rel = paths.record('request', 'r1')
    await f.folder.edit([{ rel, create: true, edits: [{ path: ['id'], base: undefined, value: 'r1' }, { path: ['title'], base: undefined, value: 'zakupy' }] }])
    await f.advance(1)
    await f.folder.edit([{ rel, remove: true, edits: [] }])
    await f.advance(1)
    expect(existsSync(join(dataDir, rel))).toBe(false)
    writeFileSync(join(dataDir, 'requests', 'r1-LAPTOP.json'), JSON.stringify({ id: 'r1', title: 'zakupy i apteka' }))
    await f.advance(2)
    expect(existsSync(join(dataDir, rel))).toBe(false)
    expect(existsSync(join(dataDir, 'requests', 'r1-LAPTOP.json'))).toBe(false)
    expect((await f.folder.history.list('request', 'r1')).some((s) => s.reason === 'conflict' && (s.record as { title: string }).title === 'zakupy i apteka')).toBe(true)
    // A second copy coming later finds the deletion still (the first copy's version in the history does not count).
    writeFileSync(join(dataDir, 'requests', 'r1-LAPTOP2.json'), JSON.stringify({ id: 'r1', title: 'zakupy, apteka i poczta' }))
    f.now += 61_000
    await f.advance(1)
    expect(existsSync(join(dataDir, rel))).toBe(false)
  })

  it('stare zdarzenie innego komputera z zegara, który był rok z przodu, nie wstrzymuje zadań, gdy jego nowsze są zgodne', async () => {
    const f = await make()
    mkdirSync(join(dataDir, paths.logDir(DAY)), { recursive: true })
    const far = f.now + 365 * 24 * 3_600_000
    const line = (n: number, t: number) => eventLine({ id: `pcb-${n}`, c: 'pcb', n, t, l: Math.max(far, t) + n, v: 1, day: DAY, dom: 'meta', k: 'observe.alive', at: t } as unknown as AnyEvent)
    appendFileSync(join(dataDir, paths.log(DAY, 'pcb')), line(0, far) + line(1, f.now))
    const r = await f.advance(5)
    expect(r.problems.some((p) => p.startsWith('zegar'))).toBe(false)
    expect(events().some((e) => e.k === 'day.create')).toBe(true)
  })

  it('nowy rekord nad uszkodzonym plikiem: komunikat mówi, że trzeba go przywrócić z Historii (A3-18)', async () => {
    mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
    writeFileSync(join(dataDir, paths.day('2026-11-03')), '{"schema":1,')
    const f = await make()
    await expect(f.folder.edit([{ rel: paths.day('2026-11-03'), create: true, edits: [{ path: ['date'], base: undefined, value: '2026-11-03' }] }])).rejects.toThrow('uszkodzony')
  })

  it('dni zapisywane raz od dwóch prowadzących (kopia konfliktowa rd.json): wcześniejszy wygrywa bez pytania (A3-10)', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, settings: [], gameFrom: '2026-11-16', note: 'a' }))
    writeFileSync(join(dataDir, 'rd-LAPTOP.json'), JSON.stringify({ schema: 1, settings: [], gameFrom: '2026-11-15', note: 'a' }))
    const f = await make()
    await f.advance(1)
    expect(f.folder.copyConflicts.size).toBe(0)
    expect(JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')).gameFrom).toBe('2026-11-15')
    expect(existsSync(join(dataDir, 'rd-LAPTOP.json'))).toBe(false)
  })

  it('własny zegar rok do przodu i z powrotem: zegar logiczny wraca, zadania prowadzącego nie stają (A8-01)', async () => {
    const f = await make()
    const right = f.now
    f.now = right + 365 * 24 * 3_600_000
    f.folder.clock.rebase()
    f.folder.append({ day: DAY, dom: 'meta', k: 'observe.alive', at: f.now })
    f.now = right
    f.folder.clock.rebase()
    const r = await f.advance(5)
    expect(r.problems.some((p) => p.startsWith('zegar'))).toBe(false)
    expect(events().some((e) => e.k === 'day.create')).toBe(true)
    expect(f.folder.log.ownEvents(DAY).at(-1)!.l).toBeLessThan(right + 24 * 3_600_000)
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

  it('lista do pokazania (prośby): plik sprawdzony przed chwilą z pamięci; własna zmiana od razu, cudza najpóźniej po LIST_TRUST_MS', async () => {
    mkdirSync(join(dataDir, 'requests'), { recursive: true })
    const file = join(dataDir, paths.record('request', 'r1'))
    writeFileSync(file, JSON.stringify({ schema: 1, id: 'r1', createdAt: 1, state: 'queued', person: null, estimateMin: 15, note: 'a' }))
    let stats = 0
    const fs: DataFs = { ...nodeFs, stat: async (abs) => (abs.includes('requests') && stats++, nodeFs.stat(abs)) }
    const f = await make({ fs })
    const note = async () => ((await f.folder.collection('request')).find((r) => r.id === 'r1') as { note?: string } | undefined)?.note
    expect(await note()).toBe('a')
    stats = 0
    expect(await note()).toBe('a')
    expect(stats).toBe(0)
    // Another computer's change of the file: within the trust it is not looked at, after it – it is.
    writeFileSync(file, JSON.stringify({ schema: 1, id: 'r1', createdAt: 1, state: 'queued', person: null, estimateMin: 15, note: 'z laptopa' }))
    expect(await note()).toBe('a')
    f.now += LIST_TRUST_MS
    expect(await note()).toBe('z laptopa')
    // This computer's own edit: shown at once, also after the queue wrote it.
    await f.folder.edit([{ rel: paths.record('request', 'r1'), edits: [{ path: ['note'], base: 'z laptopa', value: 'moja' }], create: false, remove: false }])
    expect(await note()).toBe('moja')
    await f.folder.check()
    expect(await note()).toBe('moja')
    expect(JSON.parse(readFileSync(file, 'utf8')).note).toBe('moja')
    // A new file of another computer is looked at at once (the listing is read every time).
    writeFileSync(join(dataDir, paths.record('request', 'r2')), JSON.stringify({ schema: 1, id: 'r2', createdAt: 2, state: 'queued', person: null, estimateMin: 15, note: 'nowa' }))
    expect((await f.folder.collection('request')).map((r) => r.id)).toEqual(['r1', 'r2'])
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

  it('łączenie kopii konfliktowej idzie po przebiegu kolejki – nigdy między jego odczytem a zapisem (A3-03)', async () => {
    mkdirSync(stateDir, { recursive: true })
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.load()
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const records = {
      read: async () => {
        order.push('kolejka: odczyt')
        await gate
        order.push('kolejka: zapis')
        return { status: 'missing' }
      },
      write: async () => undefined,
      remove: async () => undefined
    } as unknown as RecordStore
    q.add({ id: 'e1', rel: 'requests/r.json', at: 1, schema: 1, create: true, edits: [{ path: ['id'], base: undefined, value: 'r' }] })
    const a = q.apply(records)
    const b = q.exclusive(async () => void order.push('kopia'))
    await new Promise((r) => setTimeout(r, 10))
    release()
    await Promise.all([a, b])
    expect(order).toEqual(['kolejka: odczyt', 'kolejka: zapis', 'kopia'])
  })

  it('wpis, którego nie udało się zapisać, nie zostaje w pamięci – nic go nie zapisze później (A3-15)', () => {
    mkdirSync(stateDir, { recursive: true })
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.load()
    // The queue's file is a folder: the write fails (not a lock – no retry).
    mkdirSync(join(stateDir, 'queue.v1.json'))
    expect(() => q.add({ id: 'e1', rel: 'templates/t.json', at: 1, schema: 1, edits: [{ path: ['name'], base: 'a', value: 'b' }] })).toThrow()
    expect(q.pending).toEqual([])
    // A save of several records is one write: none of them stays behind.
    expect(() => q.add({ id: 'e2', rel: 'templates/t.json', at: 2, schema: 1, edits: [] }, { id: 'e3', rel: 'rd.json', at: 2, schema: 1, edits: [] })).toThrow()
    expect(q.pending).toEqual([])
  })
})

describe('zejście do rezerwy (E2)', () => {
  it('prowadzący rejestruje zejście raz, z identyfikatorem wyliczonym z dnia, puli i chwili', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, settings: [] }))
    const f = await make({ at: '08:00' })
    const yes = [2, 2] as const
    f.folder.append({ day: DAY, dom: 'energy', k: 'energy.checkin', at: f.now, answers: { head: yes, emotions: yes, senses: yes } })
    const r = await f.advance(5)
    expect(r.leader.iLead && r.settled).toBe(true)
    // Głowa 25 → 15: rezerwa o 08:05.
    f.folder.append({ day: DAY, dom: 'energy', k: 'energy.relative', at: f.now, pool: 'head', delta: -10, before: { head: 25, emotions: 25, senses: 25 } })
    const at = f.now
    // Minuta zejścia nie jest jeszcze zamknięta (zdarzenia do 30 s po niej też do niej należą): bez zapisu.
    await f.folder.check()
    expect(events().filter((e) => e.k === 'energy.reserve')).toEqual([])
    await f.advance(3)
    const reserve = events().filter((e) => e.k === 'energy.reserve')
    expect(reserve).toEqual([expect.objectContaining({ dom: 'energy', pool: 'head', at, silent: false })])
    const { energy } = await f.folder.energyState(DAY)
    expect(energy.descents.map((d) => d.recorded)).toEqual([true])
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
