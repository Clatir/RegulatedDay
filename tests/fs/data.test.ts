/**
 * The data layer on a real folder: names of files and conflict copies, the log's text, the event log with its journal
 * (OneDrive swapping the own log, conflict copies of it, other computers' logs, a failed listing, a log that got shorter),
 * records (broken never written over, conflict copies joined), the queue of edits and the presence files.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classify, paths } from '@shared/data/paths'
import { eventLine, mergeEvents, readLogText } from '@shared/data/logText'
import { AHEAD_LIMIT_MS, EventClock } from '@shared/data/clock'
import type { AnyEvent } from '@shared/model/events'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'
import { EventLog } from '../../src/main/data/eventLog'
import { RecordHistory } from '../../src/main/data/history'
import { RecordStore } from '../../src/main/data/records'
import { EditQueue } from '../../src/main/data/editQueue'
import { PresenceStore } from '../../src/main/data/presenceStore'

let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-data-'))
  dataDir = join(root, 'OneDrive', 'RegulatedDay')
  stateDir = join(root, 'appdata', 'folders', 'x')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const clockAt = (start: number) => {
  let wall = start
  let mono = 0
  const src = { wall: () => wall, mono: () => mono }
  return { src, advance: (ms: number) => ((wall += ms), (mono += ms)), jumpWall: (ms: number) => (wall += ms) }
}

const ev = (c: string, n: number, extra: Record<string, unknown> = {}): AnyEvent =>
  ({ id: `${c}-${n}`, c, n, t: 1000 + n, l: 1000 + n, v: 1, day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1000 + n, ...extra }) as AnyEvent

describe('nazwy plików', () => {
  it('rozpoznaje pliki danych i kopie konfliktowe OneDrive', () => {
    expect(classify('days/2026/2026-10-21.json')).toMatchObject({ kind: 'day', conflict: false, date: '2026-10-21' })
    expect(classify('days/2026/2026-10-21-DESKTOP-ABC12.json')).toMatchObject({ kind: 'day', conflict: true, canonical: 'days/2026/2026-10-21.json' })
    expect(classify('log/2026/2026-10-21/a1b2c3.jsonl')).toMatchObject({ kind: 'log', conflict: false, computer: 'a1b2c3' })
    expect(classify('log/2026/2026-10-21/a1b2c3-LAPTOP.jsonl')).toMatchObject({ kind: 'log', conflict: true, canonical: 'log/2026/2026-10-21/a1b2c3.jsonl' })
    expect(classify('templates/szablon-sobota.json')).toMatchObject({ kind: 'template', conflict: false, id: 'szablon-sobota' })
    expect(classify('templates/szablon-sobota-DESKTOP-1.json')).toMatchObject({ kind: 'template', conflict: true, canonical: 'templates/szablon-sobota.json' })
    expect(classify('templates/abc (1).json')).toMatchObject({ conflict: true, canonical: 'templates/abc.json' })
    expect(classify('rd-DESKTOP-ABC.json')).toMatchObject({ kind: 'settings', conflict: true })
    expect(classify('.presence/pca.json')).toMatchObject({ kind: 'presence', computer: 'pca' })
    expect(classify('days/2026/.2026-10-21.json.tmp-abcd')).toBeNull()
    expect(classify('notes.txt')).toBeNull()
  })
})

describe('tekst logu', () => {
  it('pomija uciętą ostatnią linię, uszkodzoną w środku zgłasza, plik zostaje do dopisywania', () => {
    const text = eventLine(ev('a', 0)) + '{"broken"\n' + eventLine(ev('a', 2)) + eventLine(ev('a', 3)).slice(0, 20)
    const r = readLogText(text)
    expect(r.events.map((e) => e.n)).toEqual([0, 2])
    expect(r.problems).toEqual([{ line: 2, why: 'składnia' }])
    expect(r.cutTail).toBe(true)
    expect(r.endsWithNewline).toBe(false)
  })

  it('zachowuje nieznane zdarzenia i pola innych wersji', () => {
    const line = JSON.stringify({ ...ev('b', 1), k: 'future.kind', extra: { x: 1 } })
    const [e] = readLogText(`${line}\n`).events
    expect(e && 'unknown' in e).toBe(true)
    expect(JSON.parse(eventLine(e!))).toMatchObject({ k: 'future.kind', extra: { x: 1 } })
  })

  it('suma po identyfikatorach; ten sam identyfikator: nowsza wersja reguł, potem mniejszy zegar logiczny', () => {
    const a = { ...ev('a', 1), id: 'auto-x', v: 1, l: 50 } as AnyEvent
    const b = { ...ev('b', 1), id: 'auto-x', v: 1, l: 40 } as AnyEvent
    const c = { ...ev('b', 2), id: 'auto-x', v: 2, l: 90 } as AnyEvent
    expect(mergeEvents([a], [b]).map((e) => e.c)).toEqual(['b'])
    expect(mergeEvents([a], [b], [c])[0]!.v).toBe(2)
  })
})

describe('zegar zdarzeń', () => {
  it('zegar logiczny rośnie, długości liczy zegar monotoniczny mimo skoku zegara ściennego', () => {
    const k = clockAt(Date.parse('2026-10-21T08:00:00Z'))
    const clock = new EventClock(k.src)
    const first = clock.stamp()
    k.advance(60_000)
    k.jumpWall(-3_600_000)
    const second = clock.stamp()
    expect(second.t - first.t).toBe(60_000)
    expect(second.l).toBeGreaterThan(first.l)
    expect(second.n).toBe(first.n + 1)
  })

  it('zdarzenie innego komputera ponad 24 h do przodu nie przesuwa zegara logicznego i daje ostrzeżenie', () => {
    const k = clockAt(Date.parse('2026-10-21T08:00:00Z'))
    const clock = new EventClock(k.src, { lastN: 9, lastL: 0 })
    expect(clock.observe(clock.now() + AHEAD_LIMIT_MS + 1)).toBe(false)
    expect(clock.aheadSeen).toBe(true)
    expect(clock.observe(clock.now() + 5 * 60_000)).toBe(true)
    const s = clock.stamp()
    expect(s.n).toBe(10)
    expect(s.l).toBe(clock.now() + 5 * 60_000 + 1)
  })
})

describe('log zdarzeń z lokalnym dziennikiem', () => {
  const make = (computer = 'pca', fs: DataFs = nodeFs) => {
    const k = clockAt(Date.parse('2026-10-21T08:00:00Z'))
    const restored = EventLog.readJournal(stateDir)
    const clock = new EventClock(k.src, restored)
    const log = new EventLog({ fs, dataDir, stateDir, computer, clock, rulesVersion: 1 })
    log.open()
    return { log, clock, k }
  }
  const own = () => join(dataDir, paths.log('2026-10-21', 'pca'))

  it('zdarzenie trafia najpierw do dziennika, potem do logu na OneDrive', async () => {
    const { log } = make()
    const e = log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    expect(readFileSync(join(stateDir, 'journal.v1.jsonl'), 'utf8')).toContain(e.id)
    expect(existsSync(own())).toBe(false)
    await log.flush()
    expect(readLogText(readFileSync(own(), 'utf8')).events.map((x) => x.id)).toEqual([e.id])
  })

  it('log podmieniony przez OneDrive na starszy dostaje brakujące zdarzenia przy sprawdzeniu', async () => {
    const { log } = make()
    const a = log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    await log.flush()
    const older = readFileSync(own(), 'utf8')
    const b = log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.end', at: 2 })
    await log.flush()
    writeFileSync(own(), older)
    await log.ensure('2026-10-21')
    expect(readLogText(readFileSync(own(), 'utf8')).events.map((x) => x.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('zapis i sprawdzenie logu naraz nie dopisują tego samego zdarzenia dwa razy', async () => {
    const { log } = make()
    const e = log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    await Promise.all([log.flush(), log.ensure('2026-10-21'), log.ensure('2026-10-21')])
    const lines = readFileSync(own(), 'utf8').split('\n').filter(Boolean)
    expect(lines.filter((l) => l.includes(e.id))).toHaveLength(1)
  })

  it('przed dopisaniem kończy linię, gdy plik nie kończy się znakiem nowej linii', async () => {
    const { log } = make()
    mkdirSync(join(dataDir, paths.logDir('2026-10-21')), { recursive: true })
    writeFileSync(own(), eventLine(ev('pca', 100)).slice(0, -1))
    log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    await log.flush()
    const r = readLogText(readFileSync(own(), 'utf8'))
    expect(r.events).toHaveLength(2)
    expect(r.problems).toEqual([])
  })

  it('kopie konfliktowe własnego logu łączy tylko jego komputer, jako sumę po identyfikatorach', async () => {
    const { log } = make()
    const a = log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    await log.flush()
    const copy = join(dataDir, paths.logDir('2026-10-21'), 'pca-LAPTOP.jsonl')
    writeFileSync(copy, eventLine(ev('pca', 50)))
    await log.ensure('2026-10-21')
    expect(existsSync(copy)).toBe(false)
    expect(readLogText(readFileSync(own(), 'utf8')).events.map((x) => x.id).sort()).toEqual([a.id, 'pca-50'].sort())
    // Another computer leaves a copy of someone else's log alone.
    const other = join(dataDir, paths.logDir('2026-10-21'), 'pcb-DESKTOP.jsonl')
    writeFileSync(other, eventLine(ev('pcb', 1)))
    await log.ensure('2026-10-21')
    expect(existsSync(other)).toBe(true)
    const day = await log.readDay('2026-10-21')
    expect(day.events.map((x) => x.id)).toContain('pcb-1')
  })

  it('czyta logi wszystkich komputerów; błąd listy plików to „nieznane”, nigdy pusty dzień', async () => {
    const { log } = make()
    mkdirSync(join(dataDir, paths.logDir('2026-10-21')), { recursive: true })
    writeFileSync(join(dataDir, paths.log('2026-10-21', 'pcb')), eventLine(ev('pcb', 0)) + eventLine(ev('pcb', 1)))
    const ok = await log.readDay('2026-10-21')
    expect(ok.complete).toBe(true)
    expect(ok.lastByComputer.pcb).toBe(1)
    const failing: DataFs = { ...nodeFs, list: async () => Promise.reject(new Error('EIO')) }
    const log2 = new EventLog({ fs: failing, dataDir, stateDir, computer: 'pca', clock: new EventClock(clockAt(0).src), rulesVersion: 1 })
    const unknown = await log2.readDay('2026-10-21')
    expect(unknown.complete).toBe(false)
    // The same log object keeps what it had read: still not empty.
    const cachedFail = await new EventLog({ fs: { ...nodeFs, list: (p) => (p.includes('log') ? Promise.reject(new Error('EIO')) : nodeFs.list(p)) }, dataDir, stateDir, computer: 'pca', clock: new EventClock(clockAt(0).src), rulesVersion: 1 }).readDay('2026-10-21')
    expect(cachedFail.complete).toBe(false)
  })

  it('log, który się skrócił, jest czytany od początku', async () => {
    const { log } = make()
    const file = join(dataDir, paths.log('2026-10-21', 'pcb'))
    mkdirSync(join(dataDir, paths.logDir('2026-10-21')), { recursive: true })
    writeFileSync(file, eventLine(ev('pcb', 0)) + eventLine(ev('pcb', 1)) + eventLine(ev('pcb', 2)))
    expect((await log.readDay('2026-10-21')).events).toHaveLength(3)
    writeFileSync(file, eventLine(ev('pcb', 5)))
    const again = await log.readDay('2026-10-21')
    expect(again.events.map((e) => e.id)).toEqual(['pcb-5'])
  })

  it('po restarcie dziennik odtwarza numer zdarzenia i zegar logiczny', async () => {
    const first = make()
    first.log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 1 })
    const e2 = first.log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.end', at: 2 })
    const second = make()
    const e3 = second.log.append({ day: '2026-10-21', dom: 'timer', k: 'disconnect.start', at: 3 })
    expect(e3.n).toBe(e2.n + 1)
    expect(e3.l).toBeGreaterThan(e2.l)
    expect(second.log.pendingDays).toContain('2026-10-21')
  })
})

describe('rekordy, historia i kolejka edycji', () => {
  const make = () => {
    let now = Date.parse('2026-10-21T08:00:00Z')
    const history = new RecordHistory({ fs: nodeFs, dataDir, computer: 'pca', now: () => now })
    const records = new RecordStore({ fs: nodeFs, dataDir, computer: 'pca', history, now: () => now })
    return { records, history, tick: (ms: number) => (now += ms) }
  }

  it('uszkodzony plik trafia na listę problemów i nigdy nie jest nadpisywany', async () => {
    const { records } = make()
    mkdirSync(join(dataDir, 'templates'), { recursive: true })
    writeFileSync(join(dataDir, 'templates/t1.json'), '{"id": "t1", ')
    expect((await records.read('templates/t1.json')).status).toBe('broken')
    await expect(records.write('templates/t1.json', { id: 't1' })).rejects.toThrow(/Uszkodzony/)
    expect(readFileSync(join(dataDir, 'templates/t1.json'), 'utf8')).toBe('{"id": "t1", ')
    expect(records.problems.has('templates/t1.json')).toBe(true)
  })

  it('historia: edycje z jednej minuty dają jedną migawkę', async () => {
    const { records, history, tick } = make()
    await records.write('templates/t1.json', { id: 't1', name: 'a' })
    await records.write('templates/t1.json', { id: 't1', name: 'b' })
    tick(20_000)
    await records.write('templates/t1.json', { id: 't1', name: 'c' })
    tick(61_000)
    await records.write('templates/t1.json', { id: 't1', name: 'd' })
    const versions = await history.list('template', 't1')
    expect(versions.map((v) => (v.record as { name: string }).name)).toEqual(['c', 'a'])
  })

  it('kopia konfliktowa: ta sama treść znika, dopisania łączą się, różne wartości zostają pytaniem', async () => {
    const { records } = make()
    await records.write('days/2026/2026-10-21.json', { date: '2026-10-21', wakeMin: 360, blocks: [{ id: 'a', durationMin: 30 }] })
    writeFileSync(join(dataDir, 'days/2026/2026-10-21-LAPTOP.json'), JSON.stringify({ date: '2026-10-21', wakeMin: 360, blocks: [{ id: 'a', durationMin: 30 }] }))
    expect(await records.joinCopy('days/2026/2026-10-21-LAPTOP.json', 'days/2026/2026-10-21.json')).toEqual({ joined: true, conflicts: [] })
    writeFileSync(join(dataDir, 'days/2026/2026-10-21-LAPTOP.json'), JSON.stringify({ date: '2026-10-21', wakeMin: 360, blocks: [{ id: 'a', durationMin: 30 }, { id: 'b', durationMin: 15 }] }))
    expect((await records.joinCopy('days/2026/2026-10-21-LAPTOP.json', 'days/2026/2026-10-21.json')).joined).toBe(true)
    const day = (await records.read('days/2026/2026-10-21.json')) as { status: 'ok'; value: { blocks: unknown[] } }
    expect(day.value.blocks).toHaveLength(2)
    writeFileSync(join(dataDir, 'days/2026/2026-10-21-LAPTOP.json'), JSON.stringify({ date: '2026-10-21', wakeMin: 330, blocks: [{ id: 'a', durationMin: 30 }, { id: 'b', durationMin: 15 }] }))
    const asked = await records.joinCopy('days/2026/2026-10-21-LAPTOP.json', 'days/2026/2026-10-21.json')
    expect(asked.joined).toBe(false)
    expect(asked.conflicts.map((c) => c.path.join('.'))).toEqual(['wakeMin'])
    expect(await records.conflictCopies('days/2026')).toEqual([{ copy: 'days/2026/2026-10-21-LAPTOP.json', canonical: 'days/2026/2026-10-21.json' }])
  })

  it('kolejka: zmiana pól z wartościami bazowymi; zmiana po obu stronach to pytanie, usunięty gdzie indziej – nigdy cicho przywracany', async () => {
    const { records } = make()
    await records.write('templates/t1.json', { id: 't1', name: 'a', note: 'x' })
    const q = new EditQueue({ stateDir, computer: 'pca' })
    q.add({ id: 'e1', rel: 'templates/t1.json', at: 1, schema: 1, edits: [{ path: ['name'], base: 'a', value: 'b' }] })
    // The queue is on disk: a new start sees it.
    const q2 = new EditQueue({ stateDir, computer: 'pca' })
    q2.load()
    expect(q2.pending).toHaveLength(1)
    expect((await q2.apply(records))[0]!.status).toBe('applied')
    q2.add({ id: 'e2', rel: 'templates/t1.json', at: 2, schema: 1, edits: [{ path: ['note'], base: 'y', value: 'z' }, { path: ['name'], base: 'b', value: 'c' }] })
    const out = await q2.apply(records)
    expect(out[0]).toMatchObject({ status: 'conflict', fields: [{ path: ['note'], now: 'x' }] })
    expect(((await records.read('templates/t1.json')) as unknown as { value: { name: string } }).value.name).toBe('c')
    expect(q2.pending[0]!.edits.map((e) => e.path[0])).toEqual(['note'])
    q2.add({ id: 'e3', rel: 'templates/gone.json', at: 3, schema: 1, edits: [{ path: ['name'], base: 'a', value: 'b' }] })
    expect((await q2.apply(records)).find((o) => o.id === 'e3')!.status).toBe('removedElsewhere')
    expect(existsSync(join(dataDir, 'templates/gone.json'))).toBe(false)
  })
})

describe('obecność', () => {
  it('zapis co 60 s przy używaniu, co 5 min bez, przy zmianie stanu od razu, nie częściej niż co 15 s', async () => {
    let now = 0
    const store = new PresenceStore(
      { fs: nodeFs, dataDir, computer: 'pca', now: () => now },
      { format: 1, name: 'PC A', windowsId: null, appVersion: '0.1.1', rulesVersion: 1, versions: [], installing: null, lastPresence: 0, lastUse: 0, lastOutsideInput: 0, state: 'used', locked: false, power: null, seenLeader: null, settled: false, lastEvents: {} }
    )
    expect(await store.tick()).toBe(true)
    now = 30_000
    expect(await store.tick()).toBe(false)
    now = 60_000
    expect(await store.tick()).toBe(true)
    store.update({ state: 'idle' })
    now = 65_000
    expect(await store.tick()).toBe(false)
    now = 75_000
    expect(await store.tick()).toBe(true)
    now = 75_000 + 4 * 60_000
    expect(await store.tick()).toBe(false)
    now = 75_000 + 5 * 60_000
    expect(await store.tick()).toBe(true)
  })

  it('cudzą obecność śledzi czasem tego komputera: kiedy zobaczył zmianę pliku i pola „ostatnia obecność”', async () => {
    let now = 1_000_000
    const base = { format: 1, name: 'x', windowsId: null, appVersion: '0.1.1', rulesVersion: 1, versions: [], installing: null, lastUse: 0, lastOutsideInput: 0, state: 'used' as const, locked: false, power: null, seenLeader: null, settled: true, lastEvents: {} }
    const a = new PresenceStore({ fs: nodeFs, dataDir, computer: 'pca', now: () => now }, { ...base, lastPresence: now })
    const b = new PresenceStore({ fs: nodeFs, dataDir, computer: 'pcb', now: () => now + 7 * 60_000 }, { ...base, lastPresence: now + 7 * 60_000 })
    await b.tick()
    const first = (await a.scan())[0]!
    expect(first.presenceSeenAt).toBeNull()
    expect(first.fileSeenAt).toBe(now)
    now += 30_000
    b.update({ lastPresence: now + 7 * 60_000, state: 'idle' })
    await b.tick(true)
    const second = (await a.scan())[0]!
    expect(second.presenceSeenAt).toBe(now)
    expect(second.fileSeenAt).toBe(now)
  })
})
