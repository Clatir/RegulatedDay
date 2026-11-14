/**
 * „Cofnij” of the morning's close of a day (D468): the close returns the ids of the events it wrote, and „Cofnij” writes
 * an `undo` for exactly those – the day is back among the days not closed. Refused on a frozen day, a close undone or
 * gone, and a day closed by another close too; the undo of a close written by another computer folds the same.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import type { AnyEvent } from '@shared/model/events'
import { addDays } from '@shared/time/zone'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
const NEXT = addDays(DAY, 1)
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-close-undo-'))
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

async function make(computer = 'pca', start = placeLogical(DAY, 10 * 60), fs: DataFs = nodeFs) {
  const clock = { now: start }
  const folder = await DataFolder.open({
    fs,
    dataDir,
    stateDir: join(root, `state-${computer}`),
    computer,
    computerName: computer.toUpperCase(),
    appVersion: '0.6.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock, at: (date: string, min: number) => (clock.now = placeLogical(date, min)) }
}

const events = async (f: DataFolder, day = DAY): Promise<AnyEvent[]> => (await f.readDay(day)).events
const undos = async (f: DataFolder) => (await events(f)).filter((e) => e.k === 'undo').map((e) => (e as unknown as { target: string }).target)
const open = async (f: DataFolder) => (await f.unclosedDays(DAY)).map((d) => d.date)

/** A day worked 10:00–11:00 (block „a”), the morning after it. */
async function worked(fs: DataFs = nodeFs) {
  const m = await make('pca', placeLogical(DAY, 10 * 60), fs)
  await m.folder.timerClick({ a: 'start', block: 'a' })
  m.at(DAY, 11 * 60)
  await m.folder.timerClick({ a: 'next' })
  m.at(NEXT, 8 * 60)
  return m
}

describe('„Cofnij” zamknięcia dnia rano (D468)', () => {
  it('„Wolne” → „Cofnij”: undo samego `ritual.close`, dzień znów niezamknięty; drugie „Cofnij” – odmowa', async () => {
    const { folder } = await worked()
    expect(await open(folder)).toEqual([DAY])
    const closed = await folder.closeDay(DAY, 'free')
    expect(closed.ok).toBe(true)
    const written = closed.ok ? closed.written : []
    const close = (await events(folder)).find((e) => e.k === 'ritual.close')!
    expect(written).toEqual([close.id])
    expect(await open(folder)).toEqual([])
    const undone = await folder.undoClose(DAY, written)
    expect(undone.ok).toBe(true)
    expect(await undos(folder)).toEqual([close.id])
    expect(await open(folder)).toEqual([DAY])
    expect((await folder.dayState(DAY)).facts.closed).toBeNull()
    // The toast's second click (or a stale one) finds it undone; the day can be closed again.
    expect(await folder.undoClose(DAY, written)).toMatchObject({ ok: false, why: 'to zamknięcie jest już cofnięte' })
    expect((await folder.closeDay(DAY, 'unknown')).ok).toBe(true)
    expect(await open(folder)).toEqual([])
  })

  it('„Jak zapisano” → „Cofnij”: cofa też `work.end` i koniec zapauzowanego bloku pracy – nic więcej', async () => {
    const m = await make()
    await m.folder.timerClick({ a: 'start', block: 'a' })
    m.at(DAY, 10 * 60 + 30)
    await m.folder.timerClick({ a: 'pause' })
    m.at(NEXT, 8 * 60)
    const before = (await events(m.folder)).map((e) => e.id)
    const closed = await m.folder.closeDay(DAY, 'asWritten')
    expect(closed.ok).toBe(true)
    const written = closed.ok ? closed.written : []
    const mine = (await events(m.folder)).filter((e) => !before.includes(e.id))
    expect(mine.map((e) => e.k)).toEqual(['work.end', 'block.end', 'ritual.close'])
    expect(written).toEqual(mine.map((e) => e.id))
    expect((await m.folder.dayState(DAY)).facts.blocks.get('a')!.endedAt).not.toBeNull()
    expect((await m.folder.undoClose(DAY, written)).ok).toBe(true)
    expect(await undos(m.folder)).toEqual(written)
    const facts = (await m.folder.dayState(DAY)).facts
    expect(facts.closed).toBeNull()
    expect(facts.workEnds).toEqual([])
    // The paused block is paused again, as before the close.
    expect(facts.blocks.get('a')).toMatchObject({ endedAt: null })
    expect(await open(m.folder)).toEqual([DAY])
  })

  it('dzień zamrożony – odmowa, nic nie zapisane', async () => {
    const { folder, clock } = await worked()
    const closed = await folder.closeDay(DAY, 'free')
    const written = closed.ok ? closed.written : []
    const n = Math.max(...(await events(folder)).map((e) => e.n))
    folder.append({ day: DAY, dom: 'game', k: 'day.freeze', at: clock.now, how: 'ready', know: { pca: n }, missing: [], grade: { boundary: 'noData' } })
    await folder.log.flush()
    expect(await folder.undoClose(DAY, written)).toMatchObject({ ok: false, why: 'ten dzień jest już zamrożony – zamknięcia nie da się cofnąć' })
    expect(await undos(folder)).toEqual([])
  })

  it('zamknięcia nie ma w logu, nie jest zamknięciem albo ma obce zdarzenia – odmowa', async () => {
    const { folder } = await worked()
    const closed = await folder.closeDay(DAY, 'free')
    const written = closed.ok ? closed.written : []
    const start = (await events(folder)).find((e) => e.k === 'block.start')!
    const gone = 'nie ma już tego zamknięcia w logu dnia'
    expect(await folder.undoClose(DAY, [])).toMatchObject({ ok: false, why: gone })
    expect(await folder.undoClose(DAY, ['pca-9999'])).toMatchObject({ ok: false, why: gone })
    expect(await folder.undoClose(DAY, [start.id])).toMatchObject({ ok: false, why: gone })
    // Another event of the day with the close: never undone with it.
    expect(await folder.undoClose(DAY, [...written, start.id])).toMatchObject({ ok: false, why: 'to nie są zdarzenia tego zamknięcia' })
    expect(await undos(folder)).toEqual([])
  })

  it('dzień zamknięty też innym zamknięciem (np. na drugim komputerze) – odmowa', async () => {
    const { folder, clock } = await worked()
    const closed = await folder.closeDay(DAY, 'free')
    const written = closed.ok ? closed.written : []
    // A second close (written by another computer before it saw this one) keeps the day closed.
    folder.append({ day: DAY, dom: 'timer', k: 'ritual.close', at: clock.now + 1000, how: 'unknown' })
    await folder.log.flush()
    expect(await folder.undoClose(DAY, written)).toMatchObject({ ok: false, why: 'ten dzień zamknięto też innym zamknięciem – tego nie da się już cofnąć' })
    expect(await undos(folder)).toEqual([])
  })

  it('log dnia nieczytelny – ta sama odmowa co przy zamknięciu, nic nie zapisane', async () => {
    let broken = false
    const fs: DataFs = { ...nodeFs, list: (abs) => (broken && abs.replace(/\\/g, '/').includes(`log/2026/${DAY}`) ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : nodeFs.list(abs)) }
    const { folder } = await worked(fs)
    const closed = await folder.closeDay(DAY, 'free')
    const written = closed.ok ? closed.written : []
    broken = true
    const why = 'nie wszystkie logi dnia są teraz czytelne – spróbuj za chwilę'
    expect(await folder.undoClose(DAY, written)).toMatchObject({ ok: false, why })
    expect(await folder.closeDay(DAY, 'unknown')).toMatchObject({ ok: false, why })
    broken = false
    expect(await undos(folder)).toEqual([])
  })

  it('dwa komputery: „Cofnij” na B zamknięcia zapisanego przez A – undo w logu B, A widzi dzień znów niezamknięty', async () => {
    const a = await worked()
    const closed = await a.folder.closeDay(DAY, 'unknown')
    const written = closed.ok ? closed.written : []
    expect(written).toHaveLength(1)
    const b = await make('pcb', placeLogical(NEXT, 8 * 60))
    expect(await open(b.folder)).toEqual([])
    expect((await b.folder.undoClose(DAY, written)).ok).toBe(true)
    const undo = (await events(a.folder)).find((e) => e.k === 'undo')!
    expect(undo).toMatchObject({ c: 'pcb', target: written[0] })
    expect(await open(a.folder)).toEqual([DAY])
    expect(await open(b.folder)).toEqual([DAY])
  })
})
