/**
 * The timer in the data folder (E4a): a click is written once (the same click again does nothing – no two entries), the
 * leader writes the automatic actions at its check (a fixed block by its plan) with derived ids, an answer closes a
 * question, a question is seen once per id, and „Cofnij” of an automatic action undoes it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-timer-'))
  dataDir = join(root, 'data')
  mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
  // A Wednesday without a template: the day's own blocks only.
  writeFileSync(
    join(dataDir, paths.day(DAY)),
    JSON.stringify({
      schema: 1,
      date: DAY,
      blocks: [
        { id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, origin: 'user' },
        { id: 'w', categoryId: 'zajecia-zdalne', startMin: 10 * 60 + 30, durationMin: 30, fixed: true, origin: 'user' }
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
    appVersion: '0.3.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, clock, at: (min: number) => (clock.now = placeLogical(DAY, min)) }
}

const kinds = async (f: DataFolder) => (await f.readDay(DAY)).events.filter((e) => e.dom === 'timer').map((e) => `${e.k}${(e as { block?: string }).block ? `:${(e as { block?: string }).block}` : ''}`)

describe('timer w folderze danych', () => {
  it('kliknięcie zapisuje się raz; to samo kliknięcie jeszcze raz nic nie robi', async () => {
    const { folder } = await make()
    const [r1, r2] = await Promise.all([folder.timerClick({ a: 'start', block: 'a' }), folder.timerClick({ a: 'start', block: 'a' })])
    expect(r1.ok).toBe(true)
    expect(r2).toMatchObject({ ok: false, why: 'ten blok już biegnie' })
    expect((await kinds(folder)).filter((k) => k === 'block.start:a')).toHaveLength(1)
  })

  it('prowadzący zaczyna blok stały według planu i pauzuje biegnący; „Cofnij” to cofa', async () => {
    const { folder, at } = await make()
    await folder.timerClick({ a: 'start', block: 'a' })
    // Settled: a check, then 60 s without changes.
    await folder.check()
    at(10 * 60 + 2)
    await folder.check()
    at(10 * 60 + 31)
    const r = await folder.check()
    expect(r.leader.iLead).toBe(true)
    expect(r.autos).toBeGreaterThanOrEqual(2)
    const k = await kinds(folder)
    expect(k).toContain('block.pause:a')
    expect(k).toContain('block.start:w')
    // Written once: the next check adds nothing for them.
    at(10 * 60 + 32)
    await folder.check()
    expect((await kinds(folder)).filter((x) => x === 'block.start:w')).toHaveLength(1)
    const t = await folder.timer(DAY)
    expect(t.fg?.info.id).toBe('w')
    // „Cofnij” of the automatic start.
    const read = await folder.readDay(DAY)
    const start = read.events.find((e) => e.k === 'block.start' && (e as { block?: string }).block === 'w')!
    expect((await folder.timerClick({ a: 'undo', target: start.id })).ok).toBe(true)
    expect((await folder.timer(DAY)).fg?.info.id).not.toBe('w')
  })

  it('blok zapauzowany wczoraj nie trzyma kliknięć na wczorajszym dniu (biegnie tylko blok niezapauzowany)', async () => {
    const yesterday = '2026-10-20'
    const { folder, clock } = await make()
    clock.now = placeLogical(yesterday, 20 * 60)
    expect((await folder.timerClick({ a: 'startNew', block: 'y1', categoryId: 'inne', durationMin: 60, day: yesterday })).ok).toBe(true)
    expect((await folder.timerClick({ a: 'pause', day: yesterday })).ok).toBe(true)
    clock.now = placeLogical(DAY, 10 * 60)
    expect((await folder.timerClick({ a: 'start', block: 'a' })).ok).toBe(true)
    expect(await kinds(folder)).toContain('block.start:a')
  })

  it('blok biegnący przez 04:00: reguły wejścia czytają przerwy zapisane już w logu nowego dnia', async () => {
    const yesterday = '2026-10-20'
    // The app runs since yesterday evening (the clock never goes back: a computer is settled only forward).
    const { folder, clock } = await make(placeLogical(yesterday, 26 * 60))
    clock.now = placeLogical(yesterday, 27 * 60)
    expect((await folder.timerClick({ a: 'startNew', block: 'n', categoryId: 'inne', durationMin: 60, day: yesterday })).ok).toBe(true)
    expect((await folder.timer(yesterday)).fg?.info.id).toBe('n')
    // Input stops at 03:50; the tracker splits the gap at 04:00 into the new day's log.
    const four = placeLogical(DAY, 4 * 60)
    folder.append({ day: yesterday, dom: 'meta', k: 'gap.open', gap: 'g1', kind: 'input', from: four - 10 * 60_000, lastOutside: null })
    folder.append({ day: yesterday, dom: 'meta', k: 'gap.close', gap: 'g1', to: four })
    folder.append({ day: DAY, dom: 'meta', k: 'gap.open', gap: 'g2', kind: 'input', from: four, lastOutside: null })
    clock.now = four + 20 * 60_000
    await folder.check()
    clock.now += 61_000
    await folder.check()
    clock.now += 15_000
    const r = await folder.check()
    expect(r.problems).toEqual([])
    expect(r.leader.iLead).toBe(true)
    // Away from 03:50 for over 30 min, past the planned end (04:00): it ends when you left (without today's log it ran on).
    const y = (await folder.readDay(yesterday)).events.find((e) => e.k === 'block.end')
    expect(y).toMatchObject({ autoRule: 'absence', at: four - 10 * 60_000 })
  })

  it('prośba przez 04:00: prowadzący liczy wczorajszy dzień do jej końca, „Koniec” trafia do jej dnia, blok – do dzisiejszego', async () => {
    const yesterday = '2026-10-20'
    const { folder, clock } = await make(placeLogical(yesterday, 26 * 60))
    clock.now = placeLogical(yesterday, 27 * 60 + 30)
    expect((await folder.timerClick({ a: 'requestNow', request: 'r1', person: 'mama', day: yesterday })).ok).toBe(true)
    // After 04:00: a block of today starts on today; „Koniec” of the request goes to yesterday.
    clock.now = placeLogical(DAY, 10 * 60)
    expect((await folder.timerClick({ a: 'start', block: 'a' })).ok).toBe(true)
    expect(await kinds(folder)).toContain('block.start:a')
    expect((await folder.timerClick({ a: 'requestEnd', request: 'r1' })).ok).toBe(true)
    expect((await folder.readDay(yesterday)).events.filter((e) => e.k === 'request.end')).toHaveLength(1)
  })

  it('prośba bez „Koniec” z wczoraj: prowadzący kończy ją po 04:00 limitem przy pierwszym użyciu', async () => {
    const yesterday = '2026-10-20'
    const { folder, clock } = await make(placeLogical(yesterday, 26 * 60))
    clock.now = placeLogical(yesterday, 27 * 60 + 30)
    expect((await folder.timerClick({ a: 'requestNow', request: 'r1', person: null, day: yesterday })).ok).toBe(true)
    // Away from 03:31 to 05:00 (the gap split at 04:00 into the new day's log), back at 05:00.
    const four = placeLogical(DAY, 4 * 60)
    folder.append({ day: yesterday, dom: 'meta', k: 'gap.open', gap: 'g1', kind: 'input', from: four - 29 * 60_000, lastOutside: null })
    folder.append({ day: yesterday, dom: 'meta', k: 'gap.close', gap: 'g1', to: four })
    folder.append({ day: DAY, dom: 'meta', k: 'gap.open', gap: 'g2', kind: 'input', from: four, lastOutside: null })
    folder.append({ day: DAY, dom: 'meta', k: 'gap.close', gap: 'g2', to: four + 60 * 60_000 })
    clock.now = four + 61 * 60_000
    await folder.check()
    clock.now += 61_000
    await folder.check()
    clock.now += 15_000
    const r = await folder.check()
    expect(r.problems).toEqual([])
    expect((await folder.readDay(yesterday)).events.find((e) => e.k === 'request.end')).toMatchObject({ autoRule: 'limit', at: placeLogical(yesterday, 27 * 60 + 30) + 60 * 60_000 })
  })

  it('pytanie „Dalej?” zobaczone zapisuje się raz; odpowiedź „Dalej” kończy blok', async () => {
    const { folder, at } = await make()
    await folder.timerClick({ a: 'start', block: 'a' })
    at(11 * 60 + 5)
    const q = (await folder.questions(DAY)).find((x) => x.kind === 'next')
    expect(q).toBeDefined()
    expect(await folder.markSeen([q!.id], 'main')).toBe(1)
    expect(await folder.markSeen([q!.id], 'main')).toBe(0)
    const r = await folder.answer(q!.id, 'next')
    expect(r.ok).toBe(true)
    expect((await folder.timer(DAY)).fg).toBeNull()
  })
})
