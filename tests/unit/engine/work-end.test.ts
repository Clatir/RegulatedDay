/**
 * The end of work after the E8 review (spec „Pierwszy koniec pracy”, „Granica i koniec pracy”, „Odcinam się”): a paused
 * last work block counts for 15 min and only then ends the work, „Koniec pracy” clicked with a paused block confirms its
 * real end and ends it, „Odcinam się” followed by work after „Wracam” before the boundary is only a break.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { questionsOf } from '@shared/engine/auto'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

function workEndAsked(s: Scenario, time: string): boolean {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t }).some((q) => q.kind === 'workEnd')
}

const ends = (s: Scenario, time: string) => {
  const st = s.state(time)
  return st.ends.map((e) => `${hhmm(st, e.at)}${e.confirmed ? '+' : '?'}`)
}

describe('pauza ostatniego bloku pracy (A1-01)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })]

  it('przez 15 min od pauzy nie ma końca pracy ani „Koniec pracy?”, potem koniec w chwili pauzy', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30')
    expect(ends(s, '09:31')).toEqual([])
    expect(workEndAsked(s, '09:31')).toBe(false)
    expect(ends(s, '09:44')).toEqual([])
    expect(ends(s, '09:46')).toEqual(['09:30?'])
    expect(workEndAsked(s, '09:46')).toBe(true)
  })

  it('wznowienie w ciągu 15 min: pauza nie jest końcem pracy, regeneracja liczy się od prawdziwego końca', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30').resume('a', '09:40').end('a', '10:10')
    const st = s.state('11:00')
    expect(ends(s, '11:00')).toEqual(['10:10?'])
    expect(hhmm(st, st.firstEnd)).toBe('10:10')
    expect(st.regen.totalMin).toBe(50)
  })

  it('blok przerwany prośbą czeka na jej koniec – długa prośba nie robi końca pracy (T503)', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30')
    s.raw({ k: 'request.start', request: 'r1', at: s.at('09:30'), mode: 'now', person: null, estimateMin: null, hardEndAt: null, interrupts: 'a' }, '09:30')
    expect(ends(s, '10:00')).toEqual([])
    s.raw({ k: 'request.end', request: 'r1', at: s.at('10:05') }, '10:05').resume('a', '10:05')
    expect(ends(s, '10:20')).toEqual([])
  })
})

describe('„Koniec pracy” przy zapauzowanym bloku (A1-02)', () => {
  it('potwierdza koniec ostatniego przebiegu i kończy zapauzowany blok (z „Cofnij”)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })] }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').end('a', '10:00').start('b', '11:00').pause('b', '11:30')
    const r = click(s, '11:35', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end b'])
    expect(r.ok && r.events[0]!.end).toBe(s.at('11:30'))
    const st = s.state('12:30')
    // b began within 15 min of its time, so 10:00 was no end; the click confirms b's real end.
    expect(ends(s, '12:30')).toEqual(['11:30+'])
    expect(timerNow(st).paused).toEqual([])
    expect(timerNow(st).workEndConfirmed).toBe(true)
    expect(workEndAsked(s, '12:30')).toBe(false)
    expect(st.facts.autos.find((a) => a.k === 'block.end')?.rule).toBe('workEnd')
  })
})

describe('„Odcinam się” i praca po „Wracam” przed granicą (A1-03)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '10:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })]

  it('journaling zaczęty po „Wracam” przed granicą jest pracą, a „Odcinam się” tylko przerwą', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:50').disconnect('09:50', '10:20').start('j', '10:21')
    const st = s.state('10:40')
    expect(st.asProject).not.toContain('j')
    expect(ends(s, '10:40')).toEqual([])
  })

  it('bez pracy po „Wracam” „Odcinam się” dalej potwierdza koniec; blok „po pracy” z planu zostaje projektem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '12:00', min: 60 })] }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:50').disconnect('09:50', '10:20')
    expect(ends(s, '10:40')).toEqual(['09:50+'])
    s.start('j', '12:00')
    expect(s.state('12:30').asProject).toContain('j')
    expect(ends(s, '12:30')).toEqual(['09:50+'])
  })
})
