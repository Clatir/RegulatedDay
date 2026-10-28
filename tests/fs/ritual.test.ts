/**
 * The closing ritual in the data folder (E6): its rows as this computer sees the day, an answer written once to the
 * day's log, the day closed (yesterday's too, in the morning), the days the morning shows – none before the version with
 * the ritual's screens (T482).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { addDays } from '@shared/time/zone'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess } from '../../src/main/worker/host'

const DAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-ritual-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  writeFileSync(
    join(dataDir, paths.day(DAY)),
    JSON.stringify({
      schema: 1,
      date: DAY,
      blocks: [
        { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
        { id: 'b', categoryId: 'inne', startMin: 12 * 60, durationMin: 60, fixed: false, origin: 'user' }
      ]
    })
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(start = placeLogical(DAY, 10 * 60)) {
  const clock = { now: start }
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.6.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock, at: (date: string, min: number) => (clock.now = placeLogical(date, min)) }
}

const kinds = async (f: DataFolder, day = DAY) => (await f.readDay(day)).events.filter((e) => e.dom === 'timer').map((e) => e.k)

describe('rytuał w folderze danych – liczenie poza procesem głównym', () => {
  it('wiersze i skutki rytuału liczy proces pomocniczy (wiele pełnych przeliczeń dnia)', async () => {
    const kinds: string[] = []
    const clock = { now: placeLogical(DAY, 20 * 60) }
    const folder = await DataFolder.open({
      fs: nodeFs,
      dataDir,
      stateDir: join(root, 'state'),
      computer: 'pca',
      computerName: 'PC A',
      appVersion: '0.7.0',
      clock: { wall: () => clock.now, mono: () => clock.now },
      holidays: marketDay,
      oneDriveRunning: () => true,
      worker: { run: (t) => (kinds.push(t.kind), inProcess.run(t)) }
    })
    const r = await folder.ritual(DAY)
    expect(r.rows.length).toBeGreaterThan(0)
    expect(kinds).toEqual(['ritual'])
  })
})

describe('rytuał w folderze danych', () => {
  it('wiersze dnia, odpowiedź zapisana raz, zamknięcie dnia potwierdza koniec pracy', async () => {
    const { folder, at } = await make()
    await folder.timerClick({ a: 'start', block: 'a' })
    at(DAY, 11 * 60)
    await folder.timerClick({ a: 'next' })
    at(DAY, 12 * 60)
    await folder.timerClick({ a: 'next' })
    at(DAY, 20 * 60)
    const r = await folder.ritual(DAY)
    // The Wednesday's sessions of the layer (London, NY) did not start: skipped, to confirm or cancel.
    expect(r.rows.map((x) => x.kind)).toEqual(['workEnd', 'skipped', 'skipped', 'rest'])
    expect(r.closed).toBeNull()
    // „Jak zapisano” would confirm the end of work: the boundary kept instead of without data.
    expect(r.asWritten.changes).toContainEqual({ kind: 'boundary', before: 'noData', after: 'kept' })
    // London did not happen: cancelled. A second answer to a row that is gone is refused.
    const skipped = r.rows.find((x) => x.kind === 'skipped')!
    const [p1, p2] = await Promise.all([folder.ritualAnswer(DAY, skipped.id, 'cancel'), folder.ritualAnswer(DAY, skipped.id, 'cancel')])
    expect(p1.ok).toBe(true)
    expect(p2).toMatchObject({ ok: false, why: 'tego wiersza już nie ma' })
    expect(await folder.ritualAnswer(DAY, r.rows[0]!.id, 'nonsense')).toMatchObject({ ok: false })
    expect(await folder.closeDay(DAY, 'bogus' as never)).toMatchObject({ ok: false, why: 'nieznany sposób zamknięcia dnia' })
    // A double click closes once: the second finds the day closed.
    const [c1, c2] = await Promise.all([folder.closeDay(DAY, 'ritual'), folder.closeDay(DAY, 'ritual')])
    expect(c1.ok).toBe(true)
    expect(c2).toMatchObject({ ok: false, why: 'ten dzień jest już zamknięty' })
    expect((await kinds(folder)).slice(-2)).toEqual(['work.end', 'ritual.close'])
    expect((await kinds(folder)).filter((k) => k === 'ritual.close')).toHaveLength(1)
    const after = await folder.ritual(DAY)
    expect(after.closed).toMatchObject({ how: 'ritual' })
    expect(after.rows.find((x) => x.kind === 'workEnd')).toMatchObject({ confirmed: true })
  })

  it('sesja bez „Zacznij”, która „odbyła się”: czasy z użycia komputera zapisanego w logu (T500)', async () => {
    const { folder, at } = await make()
    // This computer observed 14:30–16:00 only (the NY session's window 14:00–17:00).
    folder.append({ day: DAY, dom: 'meta', k: 'observe.from', at: placeLogical(DAY, 14 * 60 + 30), why: 'start' })
    folder.append({ day: DAY, dom: 'meta', k: 'observe.to', at: placeLogical(DAY, 16 * 60), why: 'quit' })
    await folder.log.flush()
    at(DAY, 20 * 60)
    // The layer's sessions (London, then NY) come first, fixed; the plan's own blocks after them.
    const sessions = (await folder.ritual(DAY)).rows.filter((x) => x.kind === 'skipped' && x.fixed)
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatchObject({ used: null })
    const ny = sessions[1]!
    expect(ny).toMatchObject({ used: { from: placeLogical(DAY, 14 * 60 + 30), to: placeLogical(DAY, 16 * 60) } })
    expect((await folder.ritualAnswer(DAY, ny.id, 'happened')).ok).toBe(true)
    const b = (await folder.dayState(DAY)).facts.blocks.get((ny as { block: string }).block)!
    // Minutes of the day from 04:00: 14:30 and 16:00.
    expect([b.startedAt, b.endedAt]).toEqual([14 * 60 + 30 - 240, 16 * 60 - 240])
  })

  it('rano: niezamknięty wczorajszy dzień, „Nie pamiętam” go zamyka bez potwierdzenia końca pracy', async () => {
    const { folder, at } = await make()
    await folder.timerClick({ a: 'start', block: 'a' })
    at(DAY, 11 * 60)
    await folder.timerClick({ a: 'next' })
    const next = addDays(DAY, 1)
    at(next, 8 * 60)
    // Before the version with the ritual's screens nothing waits (T482).
    expect(await folder.unclosedDays(null)).toEqual([])
    expect((await folder.unclosedDays(DAY)).map((d) => d.date)).toEqual([DAY])
    expect((await folder.closeDay(DAY, 'unknown')).ok).toBe(true)
    expect(await folder.unclosedDays(DAY)).toEqual([])
    expect((await kinds(folder)).slice(-1)).toEqual(['ritual.close'])
    // A day not begun yet cannot be closed.
    expect(await folder.closeDay(addDays(next, 1), 'ritual')).toMatchObject({ ok: false, why: 'ten dzień jeszcze się nie zaczął' })
  })
})

describe('rytuał dla okna (D318)', () => {
  it('odrzucona odpowiedź: powód słowami, nie identyfikator wyboru', async () => {
    const { folder, at } = await make()
    at(DAY, 20 * 60)
    // The layer's session did not start: a skipped row; a time for it it does not take.
    const skipped = (await folder.ritual(DAY)).rows.find((r) => r.kind === 'skipped')!
    expect(await folder.ritualAnswer(DAY, skipped.id, 'endedAt', placeLogical(DAY, 15 * 60))).toMatchObject({ ok: false, why: 'ta godzina jest poza czasem bloku albo po teraz' })
    expect(await folder.ritualAnswer(DAY, skipped.id, 'nonsense')).toMatchObject({ ok: false, why: 'tego wyboru nie ma w tym wierszu' })
  })

  it('odczuwany koszt z okna: zdarzenie bierne energii – nie timera (starsza wersja nie instaluje przez nie szybciej)', async () => {
    const { folder, at } = await make()
    at(DAY, 20 * 60)
    await folder.userEvents([{ k: 'cost.felt', day: DAY, at: placeLogical(DAY, 20 * 60), category: 'inne', feel: 'heavier' }])
    const e = (await folder.readDay(DAY)).events.find((x) => x.k === 'cost.felt')
    expect(e).toMatchObject({ dom: 'energy', category: 'inne', feel: 'heavier' })
    await expect(folder.userEvents([{ k: 'cost.felt', day: DAY, at: placeLogical(DAY, 20 * 60), category: 'inne', feel: 'bardzo' }])).rejects.toThrow()
  })

  it('widok rytuału liczony raz na zmianę dnia: bez zmian proces pomocniczy nie liczy go znowu', async () => {
    const kinds: string[] = []
    const clock = { now: placeLogical(DAY, 20 * 60) }
    const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, 'state'), computer: 'pca', computerName: 'PC A', appVersion: '0.12.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true, worker: { run: (t) => (kinds.push(t.kind), inProcess.run(t)) } })
    const v1 = await folder.ritual(DAY)
    expect(await folder.ritual(DAY)).toBe(v1)
    expect(kinds.filter((k) => k === 'ritual')).toHaveLength(1)
    folder.append({ day: DAY, dom: 'timer', k: 'rest.not', at: clock.now, from: placeLogical(DAY, 19 * 60), to: placeLogical(DAY, 19 * 60 + 30) })
    await folder.log.flush()
    await folder.ritual(DAY)
    expect(kinds.filter((k) => k === 'ritual')).toHaveLength(2)
  })
})

describe('pierwszy dzień rytuału (D320, T504)', () => {
  async function screens(ritualScreens: boolean, computer = 'pca') {
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, `state-${computer}`), computer, computerName: computer, appVersion: '0.12.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true, ritualScreens })
    // The leader's tasks run once it leads, settled (a few checks a minute apart).
    const settle = async () => {
      for (let i = 0; i < 6; i++) {
        clock.now += 60_000
        await folder.check()
      }
    }
    return { folder, clock, settle }
  }
  const rdNow = () => JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')) as { ritualFrom?: string }

  it('wersja z ekranem rytuału: prowadzący zapisuje w rd.json dzień instalacji raz; każdy komputer czyta go stamtąd', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, people: [] }))
    const a = await screens(true)
    expect(await a.folder.ritualDay()).toBeNull()
    await a.settle()
    expect(rdNow().ritualFrom).toBe(DAY)
    expect(await a.folder.ritualDay()).toBe(DAY)
    // A day later it stays the first day.
    a.clock.now = placeLogical(addDays(DAY, 1), 10 * 60)
    await a.settle()
    expect(rdNow().ritualFrom).toBe(DAY)
  })

  it('wersja bez ekranu rytuału niczego nie zapisuje (stary sposób – dzień z opcji)', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, people: [] }))
    const a = await screens(false)
    await a.settle()
    expect(rdNow().ritualFrom).toBeUndefined()
    expect(await a.folder.ritualDay()).toBeNull()
  })

  it('pytanie o rd.json w kolejce: prowadzący nie dokłada wpisów przy każdym sprawdzeniu, czeka', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, people: [] }))
    const a = await screens(true)
    // An edit of rd.json that met another change: a question, held in the queue.
    await a.folder.edit([{ rel: paths.settings, edits: [{ path: ['note'], base: 'było inaczej', value: 'moja zmiana' }] }])
    const held = () => a.folder.queue.pending.filter((e) => e.rel === paths.settings).length
    expect(held()).toBe(1)
    await a.settle()
    expect(held()).toBe(1)
    expect(rdNow().ritualFrom).toBeUndefined()
  })

  it('w rd.json data, która nie jest dniem: zastąpiona dniem instalacji, bez pytania', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, people: [], ritualFrom: '2026-13-45' }))
    const a = await screens(true)
    expect(await a.folder.ritualDay()).toBeNull()
    await a.settle()
    expect(rdNow().ritualFrom).toBe(DAY)
    expect(a.folder.queue.pending).toEqual([])
  })

  it('folder bez rd.json (kreator jeszcze nieskończony): nic nie powstaje', async () => {
    const a = await screens(true)
    await a.settle()
    expect(existsSync(join(dataDir, paths.settings))).toBe(false)
  })
})
