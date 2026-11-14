/**
 * 1.22-A on the axis of „Dziś”: the counter of a block of a routine without steps of its own counts the routine's steps (D473),
 * and a block done stays dimmed with ✓ before its name – one left unfinished without it (D477, T1106); the field of the day's
 * file that keeps a routine's list is named in words in a question of the queue.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { dayFileFrom, planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { dayAxis, finishedBlock } from '@renderer/features/plan/dayItems'
import { fieldText } from '@renderer/lib/recordText'
import { stepsAskScope } from '@renderer/features/steps/blockSteps'
import { newSeries } from '@shared/engine/series'
import type { SeriesBlock } from '@shared/model/series'
import type { DayModel } from '@renderer/store/day'
import { lm, Scenario } from '../unit/engine/dsl'
import { timerAction, type TimerAction } from '@shared/engine/timer'

const DATE = '2026-11-18'
const poranek: Routine = { id: 'poranek', name: 'Poranek', archived: false, worse: [], normal: [
  { id: 'a', name: 'Prysznic', min: 10 },
  { id: 'b', name: 'Śniadanie', min: 20 }
] }

function axis(s: Scenario, now: string, dayFile: unknown = null, routines: Routine[] = [poranek], today: string | null = DATE) {
  const ctx = s.contextAt(s.at(now))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state), dayFile: dayFile ? dayFileFrom(dayFile, DATE) : null } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines, requests: [] }
  return new Map(dayAxis(model, names, s.at(now), today).items.map((i) => [i.id, i]))
}

const at = (id: string, time: string, min: number, over: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin: lm(time), durationMin: min, origin: 'user', ...over })

describe('oś „Dziś”: kroki rutyny i ukończone bloki', () => {
  it('D473: licznik bloku rutyny bez własnych kroków liczy kroki rutyny z odhaczeniami dnia', () => {
    const s = new Scenario({ date: DATE, plan: [at('r', '07:00', 30, { categoryId: 'rutyny', routine: 'poranek' })] })
    expect(axis(s, '06:00').get('r')?.steps).toBe('✓ 0/2')
    expect(axis(s, '06:00', { stepsDone: { r: { a: true } } }).get('r')?.steps).toBe('✓ 1/2')
    // The routine not known (gone) – no counter, as before.
    expect(axis(s, '06:00', null, []).get('r')?.steps).toBeUndefined()
    // The axis of „Szablony” and the wizard (`today` null): their own lists only, as their panels (T1103).
    expect(axis(s, '06:00', null, [poranek], null).get('r')?.steps).toBeUndefined()
  })

  it('D477: skończony – przygaszony z ✓; niedokończony (zaparkowany po starcie) i niezaczęty miniony – bez ✓', () => {
    const s = new Scenario({ date: DATE, plan: [at('a', '08:00', 30), at('b', '09:00', 30), at('c', '10:00', 30)] }).observe('07:00', null)
    s.start('a', '08:00').end('a', '08:30')
    s.start('b', '09:00').write([{ k: 'block.pause', block: 'b', at: s.at('09:10') }], s.at('09:10'))
    s.write([{ k: 'block.end', block: 'b', at: s.at('09:15'), done: false, rule: 'park' }], s.at('09:15'))
    const m = axis(s, '11:00')
    expect(m.get('a')).toMatchObject({ dim: true, finished: true })
    expect(m.get('b')?.dim).toBe(true)
    expect(m.get('b')?.finished).toBeUndefined()
    // Never begun (the forecast puts it on): no ✓.
    expect(m.get('c')?.finished).toBeUndefined()
    // The title stays the name (the mark is drawn apart – never struck through).
    expect(m.get('a')?.title).not.toContain('✓')
  })

  it('pytanie kolejki i historia nazywają pole `routineSteps` po ludzku („kroki rutyny”), nie kluczem', () => {
    const n = { rd: rdFrom({}), blockName: (id: string) => (id === 'r' ? 'Poranek' : null) }
    expect(fieldText('days/2026/2026-11-18.json', ['routineSteps', 'r'], n)).toBe('Poranek: kroki rutyny')
    expect(fieldText('days/2026/2026-11-18.json', ['routineSteps'], n)).toBe('kroki rutyn')
  })

  it('T1102: zmiana listy rutyny w bloku serii nie pyta o zakres serii (lista własna bloku – „Tylko to”)', () => {
    const sb: SeriesBlock = { categoryId: 'rutyny', variantId: null, startMin: lm('21:00'), durationMin: 20, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: 'poranek', steps: [] }
    const series = newSeries('wiecz', sb, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
    const b = at('x', '21:00', 20, { origin: 'series', sourceId: series.root, routine: 'poranek' })
    const o = { date: DATE, series: [series], scope: { current: null } }
    expect(stepsAskScope(o, b, false)).toBe(true)
    expect(stepsAskScope(o, b, false, true)).toBe(false)
  })

  it('`finishedBlock` czyta tylko `finished` silnika (D484, T1121): koniec bez niego albo nieskończony – bez ✓', () => {
    expect([finishedBlock({ endedAt: 10, finished: true }), finishedBlock({ endedAt: 10, finished: false }), finishedBlock({ endedAt: null, finished: true }), finishedBlock(undefined)]).toEqual([true, false, false, false])
  })

  it('D484 (przegląd 2, uwaga 1): „Dalej” i „Koniec pracy” na bloku stałym i sesji – ✓ na osi', () => {
    const fixed = (id: string, time: string, cat = 'inne') => at(id, time, 60, { fixed: true, categoryId: cat })
    const s = new Scenario({ date: DATE, plan: [fixed('w', '08:00'), fixed('s', '10:00', 'sesja'), at('n', '12:00', 30)] }).observe('07:00', null)
    const click = (time: string, act: TimerAction) => {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (!r.ok) throw new Error(r.why)
      s.write(r.events, t)
    }
    click('08:00', { a: 'start', block: 'w' })
    click('08:30', { a: 'next', confirm: true })
    click('10:00', { a: 'start', block: 's' })
    click('10:30', { a: 'workEnd' })
    const m = axis(s, '13:00')
    expect([m.get('w')?.finished, m.get('s')?.finished]).toEqual([true, true])
  })

  it('D483: dojazd zaczęty sam i skończony sam o planowanym końcu (`awayPlan`) – ✓ na osi', () => {
    const s = new Scenario({ date: DATE, plan: [at('d', '08:00', 30, { categoryId: 'dojazd', variantId: 'dojazd' })] }).observe('07:00', null)
    s.start('d', '08:00').write([{ k: 'block.end', block: 'd', at: s.at('08:30'), done: null, rule: 'awayPlan' }], s.at('08:30'))
    expect(axis(s, '11:00').get('d')).toMatchObject({ dim: true, finished: true })
  })

  it('przegląd 4: blok skończony po bezczynności nie ma ✓ na osi', () => {
    const s = new Scenario({ date: DATE, plan: [at('a', '08:00', 30)] }).observe('07:00', null)
    s.start('a', '08:00').write([{ k: 'block.end', block: 'a', at: s.at('08:20'), done: null, rule: 'idle' }], s.at('08:20'))
    const m = axis(s, '11:00')
    expect(m.get('a')?.dim).toBe(true)
    expect(m.get('a')?.finished).toBeUndefined()
  })
})
