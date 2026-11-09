/**
 * 1.0.9 (plan 4.11): a session begun and then taken out of the plan („Usuń”, D336) is „Sesja NY” (D338) on the axis of
 * the day and in the ritual, as its start wrote where it came from; a block outside the session layer keeps its category's
 * name, and a start written before 1.0.9 (without those fields) – the category's name, as before.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { ritualBlockName } from '@renderer/features/ritual/RitualPanel'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const PLAN = [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }), block({ id: 'x', cat: 'inne', at: '17:00', min: 60 })]

/** „Zacznij” of both blocks and „Usuń” of each after a while (the timer's events); `old` – starts as 1.0.8 wrote them. */
function removed(old = false) {
  const s = new Scenario({ date: DATE, plan: PLAN }).observe('07:00', null)
  const go = (time: string, act: TimerAction) => {
    const t = s.at(time)
    const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
  }
  if (old) s.start('ny', '15:30')
  else go('15:30', { a: 'start', block: 'ny', confirm: true })
  go('15:45', { a: 'removeBegun', block: 'ny' })
  if (old) s.start('x', '17:00')
  else go('17:00', { a: 'start', block: 'x', confirm: true })
  go('17:15', { a: 'removeBegun', block: 'x' })
  // The window took both out of the plan.
  const ctx = s.contextAt(s.at('18:00'), { plan: [] })
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return { model, names, now: s.at('18:00') }
}

const axisTitles = (r: ReturnType<typeof removed>) => dayAxis(r.model, r.names, r.now).items.map((i) => [i.id, i.title, i.marks.join(', ')])
const ritualNames = (r: ReturnType<typeof removed>) => ['ny', 'x', 'nie-ma'].map((id) => ritualBlockName(id, r.model.ctx.plan, r.model.state.facts, r.names))

describe('usunięty zaczęty blok sesji na osi i w rytuale (D336, D338)', () => {
  it('oś dnia: „Sesja NY” poza planem; blok spoza warstwy sesji – nazwa kategorii', () => {
    expect(axisTitles(removed())).toEqual([
      ['ny', 'Sesja NY', 'poza planem'],
      ['x', 'Inne obowiązki', 'poza planem']
    ])
  })

  it('rytuał: „Sesja NY”; blok spoza warstwy sesji – nazwa kategorii; blok bez startu – „blok”', () => {
    expect(ritualNames(removed())).toEqual(['Sesja NY', 'Inne obowiązki', 'blok'])
  })

  it('stary log (start bez pól pochodzenia): oś i rytuał – nazwa kategorii jak dotąd', () => {
    const r = removed(true)
    expect(axisTitles(r)).toEqual([
      ['ny', 'Sesja tradingowa', 'poza planem'],
      ['x', 'Inne obowiązki', 'poza planem']
    ])
    expect(ritualNames(r)).toEqual(['Sesja tradingowa', 'Inne obowiązki', 'blok'])
  })
})
