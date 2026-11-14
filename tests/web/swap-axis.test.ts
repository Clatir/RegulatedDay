/**
 * D478 on the axis of „Dziś”: the block a start swapped with stands, paused, where the clicked block stood – the rest of it
 * at its place in the forecast, without „biegnie”.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { horizonDay } from '@shared/engine/week'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import type { DayModel } from '@renderer/store/day'
import { block, lm, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'

function itemsOf(s: Scenario, now: string) {
  const ctx = s.contextAt(s.at(now))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, s.at(now)).items.map((i) => [i.id, i]))
}

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (!r.ok) throw new Error(r.why)
  s.write(r.events, t)
}

describe('oś „Dziś” po zamianie bloków (D478)', () => {
  it('blok spoza planu („Pracuję”) zamieniony startem bloku planu stoi na swoim miejscu z prognozy, bez „biegnie”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    click(s, '07:30', { a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 60 })
    click(s, '07:40', { a: 'start', block: 'a' })
    const x = itemsOf(s, '07:45').get('x')!
    expect(x.marks).toEqual(['poza planem'])
    expect(x.startMin).toBeGreaterThanOrEqual(lm('08:40'))
  })

  it('„Tydzień” rysuje zamieniony blok tam, gdzie „Dziś”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '10:00', min: 30 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:20', { a: 'start', block: 'c' })
    const col = horizonDay(s.contextAt(s.at('08:25')), 'today').blocks.find((b) => b.id === 'a')!
    expect([col.startMin, col.endMin, col.state]).toEqual([lm('10:00'), lm('10:40'), 'paused'])
    expect(itemsOf(s, '08:25').get('a')!.startMin).toBe(col.startMin)
  })

  it('zamieniony blok stoi na miejscu klikniętego, zapauzowany', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '10:00', min: 30 })] }).observe('07:00', null)
    for (const [time, id] of [
      ['08:00', 'a'],
      ['08:20', 'c']
    ] as const) {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t), s.stateAt(t), { a: 'start', block: id }, t)
      if (!r.ok) throw new Error(r.why)
      s.write(r.events, t)
    }
    const items = itemsOf(s, '08:25')
    const a = items.get('a')!
    expect([a.startMin, a.endMin]).toEqual([lm('10:00'), lm('10:40')])
    expect(a.marks).not.toContain('biegnie')
    expect(items.get('c')!.marks).toContain('biegnie')
    expect(items.get('c')!.startMin).toBe(lm('08:20'))
  })
})
