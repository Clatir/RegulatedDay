/**
 * N7 – „Bufory dekompresji” (D386, D403, D569, D580–D583, T2450–T2458): after a block long and costly enough the plan has a
 * block „Dekompresja” (regeneration) – the flexible blocks after it pushed apart, fixed ones in place, its length from the
 * block's length and cost; it follows the block's real end, „Przedłuż” counts it again, it begins by itself after the block,
 * runs its length (the computer's use does not end it) and counts as regeneration for the energy only. Off – nothing changes.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { activityOf } from '@shared/engine/activity'
import { autoActions, type AutoEvent } from '@shared/engine/auto'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { dayPlan } from '@shared/engine/createDay'
import { computeDay, type DayContext, type DayState } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { timerAction, timerNow } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { bufferRuns } from '@shared/engine/decompress'
import { fieldByKey, TOGGLE_FIELDS } from '@shared/model/fields'
import { DEFAULT_SETTINGS, settingsFrom, type SettingsChange } from '@shared/model/settings'
import { block, hhmm, lm, Scenario, type BlockSpec } from './dsl'

/** A Saturday (a weekend day: no sessions, wake 08:00, bedtime 24:00). */
const SAT = '2026-10-31'
const SUN = '2026-11-01'
const MIN = 60_000
const ON = { decompress: { on: true } }

/** A block of the day's file (yours), with its own costs a pool at a time. */
const own = (s: BlockSpec & { costs?: Partial<Record<'head' | 'emotions' | 'senses' | 'body', number>> }): PlanBlock => {
  const b = block({ ...s, origin: 'user' })
  return s.costs ? { ...b, costs: { head: 0, emotions: 0, senses: 0, body: 0, ...s.costs } } : b
}
/** A meeting of 90 min with the emotions' cost 4 an hour (D386's example). */
const meeting = (o: Partial<BlockSpec> & { costs?: Partial<Record<'head' | 'emotions' | 'senses' | 'body', number>> } = {}) =>
  own({ id: 'meet', cat: 'inne', at: '10:00', min: 90, costs: { emotions: 4 }, ...o })

interface Day {
  s: Scenario
  ctxAt: (time: string, date?: string) => DayContext
  stateAt: (time: string) => DayState
  leader: (time: string) => AutoEvent[]
  file: DayFile
}

/** A day of `plan` (the day's file) with `settings` laid over the defaults from `from` (at `at` – „od dziś”). */
function dayOf(plan: PlanBlock[], settings: Record<string, unknown> = ON, o: { from?: string; at?: string; cancelled?: string[]; date?: string; off?: string } = {}): Day {
  const date = o.date ?? SAT
  const s = new Scenario({ date, dayType: 'weekend', plan })
  const changes: SettingsChange[] = [{ id: 'c1', from: o.from ?? date, at: o.at ? s.at(o.at) : null, made: 1, patch: settings }]
  // Switched off „od dziś” at `off`.
  if (o.off) changes.push({ id: 'c2', from: date, at: s.at(o.off), made: 2, patch: { decompress: { on: false } } })
  const inputs: PlanInputs = { changes, templates: [], lectures: [], series: [], routines: [] }
  const fileOf = (d: string): DayFile => ({ ...dayFileFrom({}, d), dayType: 'weekend', blocks: plan, cancelled: d === date ? (o.cancelled ?? []) : [] })
  const file = fileOf(date)
  const ctxAt = (time: string, d = date) => {
    const t = placeLogical(d, lm(time))
    return dayContextOf(inputs, { date: d, events: d === date ? s.events.filter((e) => e.t <= t) : [], dayFile: fileOf(d), nextFile: null }, marketDay, t)
  }
  const stateAt = (time: string) => computeDay(ctxAt(time))
  const leader = (time: string) => {
    const t = s.at(time)
    const ctx = ctxAt(time)
    const state = computeDay(ctx)
    const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
    s.write(out, t)
    return out.filter((e) => e.autoRule !== 'boundary')
  }
  return { s, ctxAt, stateAt, leader, file }
}

const buffersOf = (ctx: DayContext) => ctx.plan.filter((b) => b.origin === ('decompress' as PlanBlock['origin']))
const startOf = (ctx: DayContext, id: string) => ctx.plan.find((b) => b.id === id)?.startMin ?? null
/** Where the forecast puts a block now: „HH:MM–HH:MM”, null – not placed. */
function placed(state: DayState, id: string): string | null {
  const p = state.forecast.find((x) => x.block.id === id)
  return p ? `${hhmm(state, p.from)}–${hhmm(state, p.to)}` : null
}
const bufferId = (state: DayState) => state.blocks.find((b) => b.origin === ('decompress' as PlanBlock['origin']))?.id ?? '-'

describe('the plan (D386, D403)', () => {
  it('90 min of a meeting at a psychic cost 4 has a buffer of 15 min; the flexible after it pushed apart, a fixed one stays', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 }), own({ id: 'f', cat: 'inne', at: '12:15', min: 30, fixed: true })])
    const ctx = d.ctxAt('08:00')
    const [buf, ...more] = buffersOf(ctx)
    expect(more).toEqual([])
    expect(buf).toMatchObject({ categoryId: 'regeneracja', name: 'Dekompresja', anchor: 'meet', durationMin: 15, fixed: false, sourceId: 'meet' })
    expect(startOf(ctx, 'x')).toBe(lm('11:45'))
    expect(startOf(ctx, 'f')).toBe(lm('12:15'))
    const state = computeDay(ctx)
    expect(placed(state, buf!.id)).toBe('11:30–11:45')
    expect(placed(state, 'x')).toBe('11:45–12:15')
  })

  it('a block of 30 min or a cost of 2 – no buffer; the plan is the day’s plan', () => {
    for (const b of [meeting({ min: 30 }), meeting({ costs: { emotions: 2, head: 2, senses: 2 } }), meeting({ costs: { body: 9 } })]) {
      const d = dayOf([b, own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
      const ctx = d.ctxAt('08:00')
      expect(buffersOf(ctx)).toEqual([])
      expect(startOf(ctx, 'x')).toBe(lm('11:30'))
    }
  })

  it('the length: 5–20 min every 5 min from the length and the cost', () => {
    const len = (min: number, cost: number) => buffersOf(dayOf([meeting({ min, costs: { head: cost } })]).ctxAt('08:00'))[0]?.durationMin ?? 0
    expect(len(45, 3)).toBe(5)
    expect(len(60, 3)).toBe(10)
    expect(len(90, 4)).toBe(15)
    expect(len(120, 4)).toBe(20)
    expect(len(180, 30)).toBe(20)
  })

  it('a fixed block behind gives the room there is (every 5 min, at least 5); after the bedtime – none', () => {
    const ten = dayOf([meeting(), own({ id: 'f', cat: 'inne', at: '11:40', min: 30, fixed: true })]).ctxAt('08:00')
    expect(buffersOf(ten).map((b) => b.durationMin)).toEqual([10])
    expect(buffersOf(dayOf([meeting(), own({ id: 'f', cat: 'inne', at: '11:33', min: 30, fixed: true })]).ctxAt('08:00'))).toEqual([])
    // The bedtime of a weekend day: 24:00.
    expect(buffersOf(dayOf([meeting({ at: '22:20' })]).ctxAt('08:00')).map((b) => b.durationMin)).toEqual([10])
    expect(buffersOf(dayOf([meeting({ at: '22:30' })]).ctxAt('08:00'))).toEqual([])
  })

  it('costly blocks one after another – a buffer after each, without joining them', () => {
    const d = dayOf([meeting(), own({ id: 'b', cat: 'inne', at: '11:30', min: 60, costs: { head: 4 } })])
    const ctx = d.ctxAt('08:00')
    expect(buffersOf(ctx).map((b) => [b.sourceId, b.durationMin])).toEqual([
      ['meet', 15],
      ['b', 10]
    ])
    expect(startOf(ctx, 'b')).toBe(lm('11:45'))
  })

  it('a block anchored to the costly one stands after its buffer (D583)', () => {
    const d = dayOf([meeting(), own({ id: 'j', cat: 'inne', after: 'meet', min: 20 })])
    const state = d.stateAt('08:00')
    expect(placed(state, bufferId(state))).toBe('11:30–11:45')
    expect(placed(state, 'j')).toBe('11:45–12:05')
  })

  it('a buffer cancelled in the day’s file is gone, and the blocks after it are where you put them', () => {
    const first = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })]).ctxAt('08:00')
    const id = buffersOf(first)[0]!.id
    const ctx = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })], ON, { cancelled: [id] }).ctxAt('08:00')
    expect(buffersOf(ctx)).toEqual([])
    expect(startOf(ctx, 'x')).toBe(lm('11:30'))
  })
})

describe('switched off (D569) and from the date of the settings’ bar', () => {
  it('off by default: the plan and the day are exactly as without the feature, whatever the thresholds', () => {
    const plan = [meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 }), own({ id: 'j', cat: 'inne', after: 'meet', min: 20 }), own({ id: 'f', cat: 'inne', at: '12:15', min: 30, fixed: true })]
    for (const settings of [{}, { decompress: { on: false, minLengthMin: 15, minCost: 1 } }]) {
      const d = dayOf(plan, settings)
      d.s.start('meet', '10:00').extend('meet', 30, '11:20')
      const ctx = d.ctxAt('11:25')
      expect(ctx.plan).toEqual(dayPlan(ctx.snapshot, d.file))
      expect(ctx.basePlan).toBeUndefined()
      const state = computeDay(ctx)
      const plain = computeDay({ ...ctx, plan: dayPlan(ctx.snapshot, d.file) })
      expect(state.forecast).toEqual(plain.forecast)
      expect(state.regen).toEqual(plain.regen)
    }
  })

  it('a change from tomorrow: today none, tomorrow a buffer', () => {
    const d = dayOf([meeting()], ON, { from: SUN })
    expect(buffersOf(d.ctxAt('08:00'))).toEqual([])
    expect(buffersOf(d.ctxAt('08:00', SUN)).map((b) => b.durationMin)).toEqual([15])
  })

  it('„od dziś” at 12:00: none after a block that ended before, one after a later block; switched off later – the past one stays', () => {
    const plan = [meeting(), own({ id: 'late', cat: 'inne', at: '14:00', min: 90, costs: { senses: 4 } })]
    const d = dayOf(plan, ON, { at: '12:00' })
    expect(buffersOf(d.ctxAt('12:30')).map((b) => b.sourceId)).toEqual(['late'])
    const off = dayOf(plan, ON, { off: '12:00' })
    expect(buffersOf(off.ctxAt('12:30')).map((b) => b.sourceId)).toEqual(['meet'])
  })
})

describe('the real end and „Przedłuż” (D403)', () => {
  it('„Przedłuż” moves the buffer and makes it longer', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.start('meet', '10:00').extend('meet', 30, '11:20')
    const state = d.stateAt('11:25')
    expect(placed(state, bufferId(state))).toBe('12:00–12:20')
    expect(placed(state, 'x')).toBe('12:20–12:50')
  })

  it('a block of 40 min made 60 by „Przedłuż” gets a buffer (D580: its length with „Przedłuż”)', () => {
    const d = dayOf([meeting({ min: 40 })])
    expect(buffersOf(d.ctxAt('10:05'))).toEqual([])
    d.s.start('meet', '10:00').extend('meet', 20, '10:30')
    const state = d.stateAt('10:35')
    expect(placed(state, bufferId(state))).toBe('11:00–11:10')
  })

  it('an earlier end: the buffer from the real end', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.start('meet', '10:00').end('meet', '11:00')
    const state = d.stateAt('11:00')
    expect(placed(state, bufferId(state))).toBe('11:00–11:15')
  })
})

describe('the timer (D403, D581)', () => {
  it('after „Skończyłem” it begins by itself at the end, quietly, and ends after its length – the use of the computer does not end it', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.observe('08:00', null).start('meet', '10:00').end('meet', '11:30')
    const id = bufferId(d.stateAt('11:30'))
    const begun = d.leader('11:31')
    expect(begun).toMatchObject([{ k: 'block.start', block: id, at: d.s.at('11:30'), autoRule: 'decompress', planned: { durationMin: 15, decompress: true, categoryId: 'regeneracja' } }])
    // The bar: „Dekompresja · 15 min” – no sound, no question „Dalej?”.
    const t = d.s.at('11:32')
    const ctx = d.ctxAt('11:32')
    const state = computeDay(ctx)
    expect(timerNow(state).fg?.info.id).toBe(id)
    const view = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Dekompresja', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(view.block?.name).toBe('Dekompresja')
    expect(view.soundOk).toBe(false)
    for (const time of ['11:33', '11:40', '11:44']) expect(d.leader(time)).toEqual([])
    expect(d.leader('11:45')).toMatchObject([{ k: 'block.end', block: id, at: d.s.at('11:45'), autoRule: 'decompress', fin: true }])
  })

  it('„Dalej” on the costly block starts the buffer; „Dalej” on the buffer ends it earlier', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.start('meet', '10:00')
    const click = (time: string) => {
      const t = d.s.at(time)
      const ctx = d.ctxAt(time)
      const state = computeDay(ctx)
      const r = timerAction(ctx, state, { a: 'next' }, t, activityOf(ctx.events, state.grid.start, t, 'pca'))
      if (r.ok) d.s.write(r.events, t)
      return computeDay(d.ctxAt(time))
    }
    const id = bufferId(d.stateAt('11:00'))
    expect(timerNow(click('11:30')).fg?.info.id).toBe(id)
    expect(timerNow(click('11:35')).fg?.info.id).toBe('x')
    expect(d.leader('11:46')).toEqual([])
  })

  it('another block begun after the end – the buffer does not begin', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.start('meet', '10:00').end('meet', '11:30').start('x', '11:30')
    expect(d.leader('11:31')).toEqual([])
    expect(placed(d.stateAt('11:31'), bufferId(d.stateAt('11:31')))).toBeNull()
  })

  it('a class (a lecture, the class mode): the buffer only after its end', () => {
    const lecture = own({ id: 'lec', cat: 'zajecia-zdalne', at: '10:00', min: 90, fixed: true, costs: { emotions: 4 } })
    const d = dayOf([lecture])
    d.s.start('lec', '10:00')
    expect(d.leader('11:00').filter((e) => e.autoRule === 'decompress')).toEqual([])
    const state = d.stateAt('11:00')
    expect(placed(state, bufferId(state))).toBe('11:30–11:45')
  })

  it('a block ending in a session: the buffer at the session’s end', () => {
    const ses = own({ id: 'ses', cat: 'sesja', at: '11:00', min: 60, fixed: true, bg: true })
    const d = dayOf([meeting(), ses])
    d.s.observe('08:00', null).start('meet', '10:00').start('ses', '11:00', { bg: true }).end('meet', '11:30')
    expect(d.leader('11:31').filter((e) => e.autoRule === 'decompress')).toEqual([])
    expect(placed(d.stateAt('11:31'), bufferId(d.stateAt('11:31')))).toBe('12:00–12:15')
    d.s.end('ses', '12:00')
    expect(d.leader('12:01').filter((e) => e.autoRule === 'decompress')).toMatchObject([{ k: 'block.start', at: d.s.at('12:00') }])
  })
})

describe('the energy and the minimum (D386)', () => {
  it('the buffer raises the energy like a regeneration, but its minutes count to no minimum nor reward', () => {
    const plan = [meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 120 })]
    const on = dayOf(plan)
    const off = dayOf(plan, {})
    for (const d of [on, off]) d.s.checkin('08:30', { head: [1, 1], emotions: [1, 1], senses: [1, 1], body: [1, 1] })
    const ctxOn = on.ctxAt('09:00')
    const ctxOff = off.ctxAt('09:00')
    const stOn = computeDay(ctxOn)
    const stOff = computeDay(ctxOff)
    const k = stOn.grid.length && Math.round((on.s.at('11:45') - stOn.grid.start) / MIN)
    const eOn = computeEnergy(ctxOn, stOn)
    const eOff = computeEnergy(ctxOff, stOff)
    expect(eOn.series.emotions[k]!).toBeGreaterThan(eOff.series.emotions[k]!)
    expect(stOn.regen.requiredMin).toBe(stOff.regen.requiredMin)
    for (let m = k - 15; m < k; m++) {
      expect(stOn.rest[m]).toBe(0)
      expect(stOn.rewardRest[m]).toBe(0)
    }
  })
})

describe('the settings and the memory (D569, T2454, T2457)', () => {
  it('off by default, thresholds 45 min and 3 an hour; the fields in „Plan dnia” with the ranges of the schema', () => {
    expect(DEFAULT_SETTINGS.decompress).toEqual({ on: false, minLengthMin: 45, minCost: 3 })
    expect(TOGGLE_FIELDS.find((f) => f.key === 'decompress.on')).toMatchObject({ path: ['decompress', 'on'], group: 'plan', label: 'Bufory dekompresji' })
    expect(fieldByKey('decompress.minLengthMin')).toMatchObject({ scope: 'dated', group: 'plan', range: [15, 240] })
    expect(fieldByKey('decompress.minCost')).toMatchObject({ scope: 'dated', group: 'plan', range: [1, 100] })
    // A value out of the range falls back (a file of another version).
    expect(settingsFrom({ decompress: { on: 'yes', minLengthMin: 5, minCost: 300 } }).decompress).toEqual(DEFAULT_SETTINGS.decompress)
  })

  it('thresholds from the settings: 30 min at 2 an hour gives a buffer then', () => {
    const d = dayOf([meeting({ min: 30, costs: { head: 2 } })], { decompress: { on: true, minLengthMin: 30, minCost: 2 } })
    expect(buffersOf(d.ctxAt('08:00')).map((b) => b.durationMin)).toEqual([5])
  })

  it('a day counted again with the same plan places its buffers from the memory (the month counts every day)', () => {
    const d = dayOf([meeting({ at: '09:10' }), own({ id: 'x', cat: 'inne', at: '10:40', min: 30 })])
    const before = bufferRuns.count
    const first = d.ctxAt('08:00')
    const again = d.ctxAt('08:01')
    expect(bufferRuns.count).toBe(before + 1)
    expect(again.plan).toEqual(first.plan)
  })
})

describe('a buffer you changed (D582)', () => {
  it('written to the day’s file: yours – not counted again (its length stays); switched off for its block – it goes as every buffer', () => {
    const id = buffersOf(dayOf([meeting()]).ctxAt('08:00'))[0]!.id
    const mine = { ...block({ id, cat: 'regeneracja', after: 'meet', min: 25, origin: 'user' }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', name: 'Dekompresja' }
    expect(buffersOf(dayOf([meeting(), mine]).ctxAt('08:00')).map((b) => [b.id, b.durationMin, b.decompress])).toEqual([[id, 25, undefined]])
    expect(buffersOf(dayOf([meeting(), mine], ON, { off: '09:00' }).ctxAt('09:30'))).toEqual([])
  })
})

describe('review r1 (N7)', () => {
  it('5: a block anchored to the costly one, its buffer without a place now – „Dalej” starts it (the anchor stays the block)', () => {
    const d = dayOf([meeting(), own({ id: 'j', cat: 'inne', after: 'meet', min: 20 }), own({ id: 'f', cat: 'inne', at: '12:00', min: 30, fixed: true })])
    // „Przedłuż” +28: the meeting to 11:58 – 2 min to the fixed block, no room for the buffer.
    d.s.start('meet', '10:00').extend('meet', 28, '11:20').end('meet', '11:58')
    const state = d.stateAt('11:58')
    expect(placed(state, bufferId(state))).toBeNull()
    expect(timerNow(state).next?.id).toBe('j')
  })

  it('6: a class begun right after the block – the buffer waits for its end, it is not lost', () => {
    const d = dayOf([meeting(), own({ id: 'cls', cat: 'zajecia-zdalne', at: '11:30', min: 60, fixed: true })])
    d.s.observe('08:00', null).start('meet', '10:00').end('meet', '11:30').start('cls', '11:30')
    const state = d.stateAt('11:35')
    expect(placed(state, bufferId(state))).toBe('12:30–12:45')
  })

  it('7: „Koniec pracy” on the costly block does not park its buffer', () => {
    const d = dayOf([meeting()])
    d.s.start('meet', '10:00')
    const t = d.s.at('11:00')
    const ctx = d.ctxAt('11:00')
    const state = computeDay(ctx)
    const id = bufferId(state)
    const r = timerAction(ctx, state, { a: 'workEnd' }, t, activityOf(ctx.events, state.grid.start, t, 'pca'))
    expect(r.ok).toBe(true)
    expect(r.ok ? r.events.filter((e) => e.k === 'block.park' && e.block === id) : ['refused']).toEqual([])
  })

  it('9: today, a buffer whose moment passed (another block begun after the block) – no buffer and the blocks it pushed back at their hours', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 }), own({ id: 'y', cat: 'inne', at: '13:00', min: 30 })])
    expect(startOf(d.ctxAt('08:00'), 'x')).toBe(lm('11:45'))
    d.s.start('meet', '10:00').end('meet', '11:30').start('y', '11:30')
    const ctx = d.ctxAt('11:35')
    expect(buffersOf(ctx)).toEqual([])
    expect(startOf(ctx, 'x')).toBe(lm('11:30'))
  })

  it('12: a buffer set „po: Y” in its panel begins after Y – the anchor is its block', () => {
    const id = buffersOf(dayOf([meeting({ at: '14:00' })]).ctxAt('08:00'))[0]!.id
    const mine = { ...block({ id, cat: 'regeneracja', after: 'y', min: 15, origin: 'user' }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', name: 'Dekompresja' }
    const d = dayOf([meeting({ at: '14:00' }), own({ id: 'y', cat: 'inne', at: '11:00', min: 60 }), mine])
    d.s.observe('08:00', null).start('y', '11:00').end('y', '12:00')
    expect(d.leader('12:01')).toMatchObject([{ k: 'block.start', block: id, at: d.s.at('12:00'), autoRule: 'decompress' }])
  })
})

describe('review r2 (N7)', () => {
  it('1: the costly block parked before its start – no buffer, the blocks it pushed at their hours', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    d.s.raw({ k: 'block.park', block: 'meet', at: d.s.at('09:00') }, '09:00')
    const ctx = d.ctxAt('09:05')
    expect(buffersOf(ctx)).toEqual([])
    expect(startOf(ctx, 'x')).toBe(lm('11:30'))
  })

  it('2: a buffer waiting for a session – its moment from the session’s end: its time gone by after it, it has no place', () => {
    const ses = own({ id: 'ses', cat: 'sesja', at: '11:00', min: 60, fixed: true, bg: true })
    const d = dayOf([meeting(), ses, own({ id: 'x', cat: 'inne', at: '13:00', min: 30 })])
    d.s.observe('08:00', null).start('meet', '10:00').start('ses', '11:00', { bg: true }).end('meet', '11:30').end('ses', '12:00')
    expect(buffersOf(d.ctxAt('12:10')).length).toBe(1)
    expect(buffersOf(d.ctxAt('12:20'))).toEqual([])
  })

  it('7: a block anchored to the costly one, its buffer without a place now – never over a block of its own hour', () => {
    // The plan as the day counted it (the buffer 11:30–11:45, x pushed to 11:45); „Przedłuż” +28 leaves the buffer 2 min before the fixed block.
    const buf = { ...block({ id: 'buf', cat: 'regeneracja', after: 'meet', min: 15 }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', decompress: { cost: 4, untilMin: lm('23:59') } }
    const plan = [meeting(), buf, own({ id: 'j', cat: 'inne', after: 'meet', min: 20 }), own({ id: 'x', cat: 'inne', at: '11:45', min: 30 }), own({ id: 'f', cat: 'inne', at: '12:00', min: 30, fixed: true })]
    const s = new Scenario({ date: SAT, dayType: 'weekend', plan }).start('meet', '10:00').extend('meet', 28, '11:20')
    const state = s.state('11:25')
    expect(placed(state, 'buf')).toBeNull()
    const span = (id: string) => state.forecast.find((p) => p.block.id === id)!
    const [j, x] = [span('j'), span('x')]
    expect(j.from >= x.to || x.from >= j.to).toBe(true)
  })

  it('8: a buffer of S set „po: Y” – Y gets no second buffer', () => {
    const id = buffersOf(dayOf([meeting({ at: '14:00' })]).ctxAt('08:00'))[0]!.id
    const mine = { ...block({ id, cat: 'regeneracja', after: 'y', min: 15, origin: 'user' }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', name: 'Dekompresja' }
    const y = own({ id: 'y', cat: 'inne', at: '11:00', min: 90, costs: { head: 4 } })
    expect(buffersOf(dayOf([meeting({ at: '14:00' }), y, mine]).ctxAt('08:00')).map((b) => [b.id, b.anchor])).toEqual([[id, 'y']])
  })

  it('9: a buffer you changed (12 min) – as long as you set it: not cut every 5 min, its start writes its length', () => {
    const id = buffersOf(dayOf([meeting()]).ctxAt('08:00'))[0]!.id
    const mine = { ...block({ id, cat: 'regeneracja', after: 'meet', min: 12, origin: 'user' }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', name: 'Dekompresja' }
    const d = dayOf([meeting(), mine])
    expect(placed(d.stateAt('08:00'), id)).toBe('11:30–11:42')
    d.s.observe('08:00', null).start('meet', '10:00').end('meet', '11:30')
    expect(d.leader('11:31')).toMatchObject([{ k: 'block.start', block: id, planned: { durationMin: 12 } }])
  })
})

describe('review r3 (N7)', () => {
  it('1: a buffer without a place on the plan’s axis moves nothing (the block after it at its hour)', () => {
    const plan = [meeting(), own({ id: 'f', cat: 'inne', at: '11:32', min: 2, fixed: true }), own({ id: 'j', cat: 'inne', after: 'meet', min: 20 }), own({ id: 'x', cat: 'inne', at: '11:40', min: 30 }), own({ id: 'z', cat: 'inne', at: '12:00', min: 30 })]
    const ctx = dayOf(plan).ctxAt('08:00')
    expect(buffersOf(ctx)).toEqual([])
    expect(['x', 'z'].map((id) => startOf(ctx, id))).toEqual([lm('11:40'), lm('12:00')])
  })

  it('3: today, a fixed costly block whose window passed without a start – no buffer, nothing moved', () => {
    const d = dayOf([meeting({ fixed: true }), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    expect(startOf(d.ctxAt('08:00'), 'x')).toBe(lm('11:45'))
    d.s.observe('08:00', null)
    const ctx = d.ctxAt('12:00')
    expect(buffersOf(ctx)).toEqual([])
    expect(startOf(ctx, 'x')).toBe(lm('11:30'))
  })

  it('3: today, the buffer itself parked – it stays in the plan as a parked block (T2488), nothing moved by it', () => {
    const d = dayOf([meeting(), own({ id: 'x', cat: 'inne', at: '11:30', min: 30 })])
    const id = buffersOf(d.ctxAt('08:00'))[0]!.id
    d.s.raw({ k: 'block.park', block: id, at: d.s.at('09:00') }, '09:00')
    const ctx = d.ctxAt('09:05')
    expect(buffersOf(ctx).map((b) => [b.id, b.durationMin])).toEqual([[id, 15]])
    expect(startOf(ctx, 'x')).toBe(lm('11:30'))
    expect(placed(computeDay(ctx), id)).toBeNull()
  })

  it('4: today, the costly block paused for 30 min – it ends 30 min later: no room before the fixed block, no buffer', () => {
    const d = dayOf([meeting(), own({ id: 'f', cat: 'inne', at: '12:02', min: 30, fixed: true })])
    d.s.start('meet', '10:00').pause('meet', '10:30').resume('meet', '11:00')
    expect(buffersOf(d.ctxAt('11:10'))).toEqual([])
  })

  it('5: a block saved beside a buffer (an older file) is still in the forecast, beside it', () => {
    const buf = { ...block({ id: 'buf', cat: 'regeneracja', after: 'meet', min: 15 }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', decompress: { cost: 4, untilMin: lm('23:59') } }
    const g = { ...own({ id: 'g', cat: 'inne', at: '11:30', min: 15 }), alongside: 'buf' }
    const state = new Scenario({ date: SAT, dayType: 'weekend', plan: [meeting(), buf, g] }).state('08:00')
    expect(placed(state, 'buf')).toBe('11:30–11:45')
    expect(placed(state, 'g')).toBe('11:30–11:45')
  })
})

describe('review r4 (N7)', () => {
  it('1: a buffer that has no place now – a block beside it (an older file) is still in the forecast', () => {
    const buf = { ...block({ id: 'buf', cat: 'regeneracja', after: 'meet', min: 15 }), origin: 'decompress' as PlanBlock['origin'], sourceId: 'meet', decompress: { cost: 4, untilMin: lm('23:59') } }
    const g = { ...own({ id: 'g', cat: 'inne', at: '11:30', min: 15 }), alongside: 'buf' }
    const f = own({ id: 'f', cat: 'inne', at: '12:00', min: 30, fixed: true })
    const s = new Scenario({ date: SAT, dayType: 'weekend', plan: [meeting(), buf, g, f] }).start('meet', '10:00').extend('meet', 28, '11:20')
    const state = s.state('11:25')
    expect(placed(state, 'buf')).toBeNull()
    expect(placed(state, 'g')).not.toBeNull()
  })
})
