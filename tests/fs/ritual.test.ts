/**
 * The closing ritual in the data folder (E6): its rows as this computer sees the day, an answer written once to the
 * day's log, the day closed (yesterday's too, in the morning), the days the morning shows – none before the version with
 * the ritual's screens (T482).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
