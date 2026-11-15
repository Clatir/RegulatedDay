/**
 * „Odwołaj” / „Zaparkuj” grupy bloków (D528) w procesie głównym, na prawdziwych plikach: `groupLog` ocenia każdy blok jak kliknięcie
 * timera dla niego samego, na dniu, jaki widzi pasek (D345), zapisuje zdarzenia od razu i oddaje ich identyfikatory; `undoGroupLog` pisze
 * `undo` dokładnie dla nich (D529) – blok zaczęty od tego czasu zostaje. Tylko dziś; „Cofnij” cudzych identyfikatorów – odmowa.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import type { AnyEvent } from '@shared/model/events'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-25' // a Sunday: no sessions in the default day
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-group-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  const b = (id: string, h: number) => ({ id, categoryId: 'inne', startMin: h * 60, durationMin: 60, fixed: false, origin: 'user' })
  writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [b('a', 10), b('b', 12), b('c', 14)] }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(start = placeLogical(DAY, 9 * 60)) {
  const clock = { now: start }
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state-pca'),
    computer: 'pca',
    computerName: 'PCA',
    appVersion: '1.28.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock, at: (min: number) => (clock.now = placeLogical(DAY, min)) }
}

const events = async (f: DataFolder): Promise<AnyEvent[]> => (await f.readDay(DAY)).events
const kinds = async (f: DataFolder, k: string) => (await events(f)).filter((e) => e.k === k) as unknown as Array<{ id: string; block: string; target: string }>

describe('D528 – „Zaparkuj” / „Odwołaj” grupy w logu dnia', () => {
  it('zaparkuj trzy bloki, jeden już biegnie: dwa `block.park`, zaczęty pominięty; „Cofnij” – undo obu', async () => {
    const { folder, at } = await make()
    at(10 * 60)
    await folder.timerClick({ a: 'start', block: 'a' })
    at(10 * 60 + 10)
    const r = await folder.groupLog(DAY, 'park', ['a', 'b', 'c'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([r.taken, r.skipped]).toEqual([['b', 'c'], [{ id: 'a', why: 'zaczęty' }]])
    const parks = await kinds(folder, 'block.park')
    expect(parks.map((e) => e.block)).toEqual(['b', 'c'])
    expect(r.written).toEqual(parks.map((e) => e.id))
    at(10 * 60 + 20)
    const u = await folder.undoGroupLog(DAY, r.written)
    expect(u.ok && [u.restored, u.kept]).toEqual([['b', 'c'], []])
    expect((await kinds(folder, 'undo')).map((e) => e.target)).toEqual(r.written)
    // Undone already: a second „Cofnij” writes nothing more.
    const again = await folder.undoGroupLog(DAY, r.written)
    expect(again.ok && again.restored).toEqual([])
    expect(await kinds(folder, 'undo')).toHaveLength(2)
  })

  it('blok zaczęty po odwołaniu (z innego miejsca) zostaje, jaki jest; reszta wraca', async () => {
    const { folder, at } = await make()
    const r = await folder.groupLog(DAY, 'cancel', ['b', 'c'])
    expect(r.ok && r.taken).toEqual(['b', 'c'])
    if (!r.ok) return
    // „c” cancelled – then begun anyway (a fact of the log: the start is written).
    at(9 * 60 + 5)
    await folder.timerClick({ a: 'start', block: 'c' })
    const u = await folder.undoGroupLog(DAY, r.written)
    expect(u.ok && u.kept).toEqual(['c'])
    const cancels = await kinds(folder, 'block.cancel')
    expect((await kinds(folder, 'undo')).map((e) => e.target)).toEqual([cancels.find((e) => e.block === 'b')!.id])
  })

  it('tylko dziś: dzień przyszły – odmowa, nic nie zapisane; „Cofnij” nie swoich zdarzeń – odmowa', async () => {
    const { folder } = await make()
    const next = addDays(DAY, 1)
    const r = await folder.groupLog(next, 'park', ['a'])
    expect(r.ok).toBe(false)
    await folder.timerClick({ a: 'start', block: 'a' })
    const start = (await kinds(folder, 'block.start'))[0]!
    const u = await folder.undoGroupLog(DAY, [start.id])
    expect(u.ok).toBe(false)
    expect(await kinds(folder, 'undo')).toEqual([])
  })
})
