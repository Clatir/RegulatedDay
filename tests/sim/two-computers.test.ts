/**
 * Two computers with delayed sync (plan E1 „test dwóch komputerów z opóźnioną synchronizacją”): PC A and a laptop share
 * the data folder through the simulated OneDrive (delays, out of order, cut log tails, conflict copies, the own log
 * swapped, renames seen as removal and creation, listing errors, the other computer's clock in the times of
 * modification, the laptop's clock 3 min ahead) and the laptop's sync paused for 90 min. In the end both see the same log,
 * nothing written is lost, the day exists once, both count the same day, and outside the paused sync never two
 * computers do the leader's tasks at once. Also: a computer switched off while its sync is paused, a laptop asleep in a
 * bag with the app running, a crash, and using only the app's window.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import type { DayState } from '@shared/engine/day'
import { eventLine, readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import type { AnyEvent } from '@shared/model/events'
import { planBlock, type Template } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { readFileSync } from 'node:fs'
import { OneDriveSim, faultyFs, rng, type Side } from './onedrive'

const DATE = '2026-10-21'
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return placeLogical(DATE, h * 60 + m)
}

const template: Template = {
  id: 'zwykly',
  name: 'Zwykły',
  dayType: 'zwykly',
  weekdays: [],
  archived: false,
  versions: [
    {
      from: '2026-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'a1', categoryId: 'analiza', startMin: 7 * 60 + 30, durationMin: 30, origin: 'template' }),
        planBlock({ id: 'obiad', categoryId: 'posilek', startMin: 11 * 60 + 30, durationMin: 45, origin: 'template' }),
        planBlock({ id: 'spacer', categoryId: 'regeneracja', variantId: 'spacer', startMin: 12 * 60 + 15, durationMin: 30, origin: 'template' }),
        planBlock({ id: 'a2', categoryId: 'analiza', startMin: 13 * 60 + 30, durationMin: 30, origin: 'template' }),
        planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' }),
        planBlock({ id: 'ds', categoryId: 'sesja', startMin: 20 * 60, durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' })
      ]
    }
  ]
}

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

interface Pc {
  side: Side
  stateDir: string
  folder: DataFolder | null
  written: AnyEvent[]
  random: () => number
}

/** The world: true time, two computers, the sync between them. */
function world(seed: number) {
  const root = mkdtempSync(join(tmpdir(), 'rd-sim-'))
  roots.push(root)
  const random = rng(seed)
  let now = at('06:55')
  const mk = (name: string, host: string, skew: number): Pc => ({
    side: { name, host, dir: join(root, name, 'OneDrive', 'RegulatedDay'), skew },
    stateDir: join(root, name, 'appdata', 'folders', 'x'),
    folder: null,
    written: [],
    random: rng(seed + name.length * 7919)
  })
  const a = mk('pca', 'DESKTOP-A', 0)
  const b = mk('pcb', 'LAPTOP-B', 3 * 60_000)
  for (const pc of [a, b]) mkdirSync(pc.side.dir, { recursive: true })
  // The folder as the first computer set it up: rd.json and a template.
  writeFileSync(join(a.side.dir, paths.settings), JSON.stringify({ schema: 1, settings: [{ id: 's1', from: '2026-01-01', at: null, patch: { transitionBufferMin: 0 } }] }))
  mkdirSync(join(a.side.dir, 'templates'), { recursive: true })
  writeFileSync(join(a.side.dir, paths.record('template', 'zwykly')), JSON.stringify(template))
  const sync = new OneDriveSim(a.side, b.side, { delay: [2_000, 90_000], cutTail: 0.2, swapOwnLog: 0.004, renameGap: 0.2 }, random)

  const open = async (pc: Pc, previousRun: { lastAt: number; clean: boolean } | null = null) => {
    const fs = faultyFs(pc.random, 0.03)
    pc.folder = await DataFolder.open({
      fs,
      dataDir: pc.side.dir,
      stateDir: pc.stateDir,
      computer: pc.side.name,
      computerName: pc.side.host,
      appVersion: '0.2.0',
      clock: { wall: () => now + pc.side.skew, mono: () => now },
      holidays: (m, d) => marketDay(m, d),
      oneDriveRunning: () => true,
      previousRun
    })
    return fs
  }
  const click = (pc: Pc, draft: Parameters<DataFolder['append']>[0]) => {
    const e = pc.folder!.append(draft)
    pc.written.push(e)
    return e
  }
  return {
    a,
    b,
    sync,
    open,
    click,
    get now() {
      return now
    },
    set now(v: number) {
      now = v
    }
  }
}

/** The day's block id of a template block, from the day this computer sees. */
async function blockId(pc: Pc, source: string): Promise<string> {
  // A listing may fail now and then: the click waits for the next read.
  let st: DayState | null = null
  for (let i = 0; !st && i < 20; i++) st = await pc.folder!.dayState(DATE).catch(() => null)
  if (!st) throw new Error('no day')
  const b = st.blocks.find((x) => x.sourceId === source)
  if (!b) throw new Error(`no block ${source}`)
  return b.id
}

const summary = (st: DayState) => ({
  minutes: [...st.minutes.entries()].sort((x, y) => x[0] - y[0]).map(([k, m]) => `${k}:${m.cls}${m.upfront ? '+' : ''}`).join(' '),
  ext: st.extensionMin,
  budget: st.budgetUsedMin,
  boundary: st.boundary.approved,
  hardEnd: st.hardEnd.at,
  pool: st.pool.min,
  regen: st.regen.towardMinMin
})

const content = (events: readonly AnyEvent[]) => new Map(events.map((e) => [e.id, eventLine(e)]))

describe('dwa komputery z opóźnioną synchronizacją', () => {
  it('po synchronizacji oba widzą ten sam log i liczą ten sam dzień; nic nie ginie; dzień powstaje raz; jeden prowadzący', { timeout: 240_000 }, async () => {
    const w = world(20261021)
    const { a, b, sync } = w
    await w.open(a)
    let bFs: Awaited<ReturnType<typeof w.open>> | null = null
    const doubleLead: number[] = []
    let unpausedAt = 0
    const script: Array<[string, () => Promise<void> | void]> = [
      ['07:30', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(a, 'a1'), at: a.folder!.clock.now(), bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 30, tag: null, fixed: false }, confirmUntil: null, how: 'click' })],
      ['08:00', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(a, 'a1'), at: a.folder!.clock.now(), done: true, rule: null })],
      ['08:00', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(a, 'londyn'), at: a.folder!.clock.now(), bg: false, planned: { categoryId: 'sesja', variantId: null, durationMin: 180, tag: null, fixed: true }, confirmUntil: null, how: 'start' })],
      ['09:00', async () => void (bFs = await w.open(b))],
      // The day's file edited on both computers within a minute (through their queues of edits): whichever way OneDrive
      // brings the versions together – a conflict copy joined field by field, or an edit laid onto the other's – both stay.
      ['09:30', () => a.folder!.queue.add({ id: 'ea', rel: paths.day(DATE), at: w.now, schema: 1, create: true, edits: [{ path: ['wakeMin'], base: undefined, value: 330 }] })],
      ['09:30', () => b.folder!.queue.add({ id: 'eb', rel: paths.day(DATE), at: w.now, schema: 1, create: true, edits: [{ path: ['sessions', 'londyn'], base: undefined, value: 'yes' }] })],
      ['11:00', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(a, 'londyn'), at: a.folder!.clock.now(), done: true, rule: null })],
      ['11:30', async () => void w.click(b, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(b, 'obiad'), at: b.folder!.clock.now(), bg: false, planned: { categoryId: 'posilek', variantId: null, durationMin: 45, tag: null, fixed: false }, confirmUntil: null, how: 'click' })],
      ['12:00', () => void sync.paused.add('pcb')],
      ['12:15', async () => {
        w.click(b, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(b, 'obiad'), at: b.folder!.clock.now(), done: true, rule: null })
        w.click(b, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(b, 'spacer'), at: b.folder!.clock.now(), bg: false, planned: { categoryId: 'regeneracja', variantId: 'spacer', durationMin: 30, tag: null, fixed: false }, confirmUntil: null, how: 'click' })
      }],
      ['12:45', async () => void w.click(b, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(b, 'spacer'), at: b.folder!.clock.now(), done: true, rule: null })],
      ['13:30', () => {
        sync.paused.delete('pcb')
        unpausedAt = w.now
      }],
      ['13:31', async () => void w.click(b, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(b, 'a2'), at: b.folder!.clock.now(), bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 30, tag: null, fixed: false }, confirmUntil: null, how: 'click' })],
      ['14:00', async () => {
        w.click(b, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(b, 'a2'), at: b.folder!.clock.now(), done: true, rule: null })
      }],
      ['14:02', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.start', block: await blockId(a, 'ny'), at: a.folder!.clock.now(), bg: false, planned: { categoryId: 'sesja', variantId: null, durationMin: 180, tag: null, fixed: true }, confirmUntil: null, how: 'start' })],
      ['15:00', () => {
        sync.injectLogConflict(a.side, paths.log(DATE, 'pca'))
      }],
      ['17:00', async () => void w.click(a, { day: DATE, dom: 'timer', k: 'block.end', block: await blockId(a, 'ny'), at: a.folder!.clock.now(), done: true, rule: null })]
    ]
    const used = (pc: Pc, t: number) => (pc === a ? t < at('11:20') || t >= at('13:50') : t >= at('11:20') && t < at('14:00'))
    for (w.now = at('07:00'); w.now <= at('17:40'); w.now += 30_000) {
      for (const [hhmm, step] of script) if (at(hhmm) <= w.now && at(hhmm) > w.now - 30_000) await step()
      for (const pc of [a, b]) {
        if (!pc.folder) continue
        if (used(pc, w.now)) pc.folder.noteInput(w.now + pc.side.skew, true)
        else pc.folder.noteIdle()
      }
      sync.tick(w.now)
      // Every computer checks every minute (15 s in the app; a minute keeps the run short).
      if (w.now % 60_000 === 0) {
        const results = []
        for (const pc of [a, b]) if (pc.folder) results.push(await pc.folder.check())
        // Right after the pause ends the two learn of each other within the sync's delay: not counted.
        const converging = unpausedAt && w.now - unpausedAt < 5 * 60_000
        if (!sync.paused.size && !converging && results.length === 2 && results.every((r) => r.leader.iLead && r.settled)) doubleLead.push(w.now)
      }
    }
    // Quiet until everything has arrived.
    for (let i = 0; i < 120 && !(sync.idle && i > 10); i++) {
      w.now += 30_000
      sync.tick(w.now)
      if (w.now % 60_000 === 0) for (const pc of [a, b]) await pc.folder!.check()
    }
    for (const pc of [a, b]) await pc.folder!.check()
    sync.tick(w.now + 200_000)
    w.now += 200_000

    const ra = await a.folder!.readDay(DATE)
    const rb = await b.folder!.readDay(DATE)
    // The same log on both.
    const ca = content(ra.events)
    const cb = content(rb.events)
    expect([...ca.keys()].sort()).toEqual([...cb.keys()].sort())
    for (const [id, line] of ca) expect(cb.get(id)).toBe(line)
    // Nothing written is lost, and the owner's log on OneDrive holds all of its events.
    for (const pc of [a, b]) {
      const own = readLogText(readFileSync(join(pc.side.dir, paths.log(DATE, pc.side.name)), 'utf8')).events.map((e) => e.id)
      for (const e of pc.written) {
        expect(ca.has(e.id)).toBe(true)
        expect(own).toContain(e.id)
      }
    }
    // The day exists once.
    expect(ra.events.filter((e) => e.k === 'day.create')).toHaveLength(1)
    // Both count the same day.
    const sa = await a.folder!.dayState(DATE, undefined, w.now)
    const sb = await b.folder!.dayState(DATE, undefined, w.now)
    expect(summary(sb)).toEqual(summary(sa))
    expect(sa.budgetUsedMin).toBeGreaterThan(0)
    // The day's file edited on both sides was joined (no copy left, both fields there).
    const day = await a.folder!.records.read(paths.day(DATE))
    expect(day.status).toBe('ok')
    expect((day as { value: Record<string, unknown> }).value).toMatchObject({ wakeMin: 330, sessions: { londyn: 'yes' } })
    // Outside the paused sync never two leaders at work.
    expect(doubleLead).toEqual([])
    // The faults did happen.
    expect(sync.stats.cut).toBeGreaterThan(0)
    expect(sync.stats.gaps).toBeGreaterThan(0)
    expect(sync.stats.conflicts).toBeGreaterThan(0)
    expect(bFs!.failures).toBeGreaterThan(0)
  })
  it('wyłączony przy wstrzymanej synchronizacji, laptop uśpiony w torbie z działającą aplikacją, awaria, samo okno aplikacji', { timeout: 240_000 }, async () => {
    const w = world(4242)
    const { a, b, sync } = w
    await w.open(a)
    let bOn = false
    const checks: Record<string, { a?: boolean; b?: boolean }> = {}
    const step = async (until: string, o: { aUsed?: (t: number) => boolean; aOutside?: boolean; bUsed?: (t: number) => boolean; bAwake?: boolean } = {}) => {
      for (; w.now <= at(until); w.now += 30_000) {
        if (o.aUsed?.(w.now)) a.folder!.noteInput(w.now, o.aOutside !== false)
        else a.folder!.noteIdle()
        if (bOn && o.bAwake !== false) {
          if (o.bUsed?.(w.now)) b.folder!.noteInput(w.now + b.side.skew, true)
          else b.folder!.noteIdle()
        }
        sync.tick(w.now)
        if (w.now % 60_000 === 0) {
          const ra = await a.folder!.check()
          const rb = bOn && o.bAwake !== false ? await b.folder!.check() : null
          checks[new Date(w.now + 2 * 3_600_000).toISOString().slice(11, 16)] = { a: ra.leader.iLead && ra.settled, b: rb ? rb.leader.iLead && rb.settled : undefined }
        }
      }
    }
    w.now = at('07:00')
    // Only the app's window is used 07:30–08:00: presence goes on, use (outside the app) does not.
    await step('07:29', { aUsed: () => true })
    await w.open(b)
    bOn = true
    await step('08:00', { aUsed: () => true, aOutside: false })
    expect(a.folder!.presence.own.lastPresence! - a.folder!.presence.own.lastUse!).toBeGreaterThanOrEqual(29 * 60_000)
    // The laptop's sync stops, it writes an event and is switched off – nothing of it reaches PC A.
    sync.paused.add('pcb')
    const offline = w.click(b, { day: DATE, dom: 'timer', k: 'disconnect.start', at: b.folder!.clock.now() })
    await step('08:10')
    await b.folder!.close()
    bOn = false
    expect((await a.folder!.readDay(DATE)).events.some((e) => e.id === offline.id)).toBe(false)
    await step('09:29')
    // Switched on again with its sync: the event written while off arrives.
    sync.paused.delete('pcb')
    await w.open(b, { lastAt: at('08:10') + b.side.skew, clean: true })
    bOn = true
    await step('09:45', { bUsed: () => true })
    expect((await a.folder!.readDay(DATE)).events.some((e) => e.id === offline.id)).toBe(true)
    // The laptop leads, then sleeps in a bag with the app running: no checks, no sync, its presence goes silent.
    expect(checks['09:45']?.b).toBe(true)
    sync.paused.add('pcb')
    await step('11:40', { aUsed: (t) => t >= at('10:00'), bAwake: false })
    // PC A takes the lead 10 min after the laptop went silent and keeps it.
    expect(checks['10:15']?.a).toBe(true)
    expect(checks['11:30']?.a).toBe(true)
    // The laptop wakes: „nieustalony”, and it gives the lead to PC A instead of taking it back.
    sync.paused.delete('pcb')
    b.folder!.unsettle('wake')
    await step('11:50', { aUsed: () => true })
    expect(Object.entries(checks).filter(([t]) => t >= '11:41').every(([, c]) => !c.b)).toBe(true)
    // PC A crashes at 11:50 and starts again: the observation's end comes from its last life marker.
    const crashAt = w.now
    await w.open(a, { lastAt: crashAt, clean: false })
    await step('12:20', { aUsed: () => true })
    const events = (await a.folder!.readDay(DATE)).events
    expect(events.some((e) => e.k === 'observe.to' && (e as { why?: string }).why === 'crash' && (e as { at: number }).at === crashAt)).toBe(true)
    expect(events.filter((e) => e.k === 'day.create')).toHaveLength(1)
  })
})
