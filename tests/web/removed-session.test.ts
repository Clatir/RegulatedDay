/**
 * 1.0.9 (plan 4.11): a block begun and then taken out of the plan („Usuń”, D336) is on the axis of the day by the same
 * name as in the CSV (spec „W interfejsie tylko prawdziwe nazwy”): a session „Sesja NY” (D338), a routine's block its
 * routine, a block with a variant its variant; a block begun outside the plan likewise. The log stays as 1.0.8 writes it.
 */
import { describe, expect, it } from 'vitest'
import { csvOf } from '@shared/engine/csv'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import type { PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const PLAN: PlanBlock[] = [
  block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }),
  { ...block({ id: 'r', cat: 'rutyny', at: '17:00', min: 30 }), routine: 'wieczor' },
  block({ id: 'v', cat: 'regeneracja', variant: 'spacer', at: '18:00', min: 30 })
]

/** „Zacznij” and „Usuń” of each block of the plan, two blocks begun outside it; then the day without the plan. */
function removedAll() {
  const s = new Scenario({ date: DATE, plan: PLAN }).observe('07:00', null)
  const go = (time: string, act: TimerAction) => {
    const t = s.at(time)
    const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
    if (!r.ok) throw new Error(`${time}: ${r.why}`)
    s.write(r.events, t)
  }
  go('15:30', { a: 'start', block: 'ny', confirm: true })
  go('15:45', { a: 'removeBegun', block: 'ny' })
  go('17:00', { a: 'start', block: 'r', confirm: true })
  go('17:10', { a: 'removeBegun', block: 'r' })
  go('18:00', { a: 'start', block: 'v', confirm: true })
  go('18:10', { a: 'removeBegun', block: 'v' })
  go('19:00', { a: 'startNew', block: 'praca', categoryId: 'inne', durationMin: 30, confirm: true })
  go('19:20', { a: 'finish', block: 'praca' })
  go('20:00', { a: 'startNew', block: 'brk', categoryId: 'regeneracja', variantId: 'przerwa-od-ekranu', durationMin: 15, confirm: true })
  go('20:10', { a: 'finish', block: 'brk' })
  // The window took the plan's blocks out (the snapshot's are cancelled: they stay in the snapshot).
  const ctx = s.contextAt(s.at('21:00'), { plan: [] })
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [{ id: 'wieczor', name: 'Wieczorna rutyna', normal: [], worse: [], archived: false }], requests: [] }
  return { model, names, now: s.at('21:00') }
}

describe('nazwa bloku zdjętego z planu po starcie na osi (D336, D338)', () => {
  it('oś: „Sesja NY”, nazwa rutyny, wariant – poza planem; zaczęte poza planem jak w CSV', () => {
    const r = removedAll()
    const items = dayAxis(r.model, r.names, r.now).items
    expect(items.map((i) => [i.id, i.title, i.marks.join(', ')])).toEqual([
      ['ny', 'Sesja NY', 'poza planem'],
      ['r', 'Wieczorna rutyna', 'poza planem'],
      ['v', 'Samotny spacer', 'poza planem'],
      ['praca', 'Inne obowiązki', 'poza planem'],
      ['brk', 'Przerwa od ekranu', 'poza planem']
    ])
    // The same names as the CSV's.
    const csv = csvOf([{ ctx: r.model.ctx, names: r.names }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1).map((row) => row.split(';')[1])
    expect(items.map((i) => i.title)).toEqual(csv)
  })

  it('oś: blok zmieniony na ten dzień (w snapshocie „spacer”, dziś „przerwa od ekranu”) – nazwa z chwili startu', () => {
    const today = [{ ...PLAN[2]!, variantId: 'przerwa-od-ekranu' }]
    const s = new Scenario({ date: DATE, plan: today }).observe('07:00', null)
    const extra = { snapshot: { ...s.snapshot, blocks: PLAN } }
    for (const [time, act] of [
      ['18:00', { a: 'start', block: 'v', confirm: true }],
      ['18:10', { a: 'removeBegun', block: 'v' }]
    ] as Array<[string, TimerAction]>) {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t, extra), s.stateAt(t, extra), act, t)
      if (!r.ok) throw new Error(`${time}: ${r.why}`)
      s.write(r.events, t)
    }
    const ctx = s.contextAt(s.at('19:00'), { ...extra, plan: [] })
    const state = computeDay(ctx)
    const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    expect(dayAxis(model, names, s.at('19:00')).items.map((i) => [i.id, i.title])).toEqual([['v', 'Przerwa od ekranu']])
  })
})
