/**
 * „Gorszy dzień” in the engine (D570, D587, N4): from the acceptance on (`DayContext.worseDays` – the periods of the mark of the day's file)
 * the proposal of the boundary is earlier by its minutes, never before the click rounded up to a whole minute and to 5 min; a minute before
 * the acceptance – and from its „Cofnij” on – keeps the proposal it had (the minutes of the period stay as they were judged); the boundary
 * approved by itself at the start of the first work block before the acceptance stays; „Wstałeś później?” counts with the same boundary.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { dayContextOf } from '@shared/engine/context'
import { idxOfLogical, gridOf } from '@shared/engine/grid'
import { detectLateWake } from '@shared/engine/lateWake'
import { marketDay } from '@shared/calendar/holidays'
import { RULES_VERSION } from '@shared/model/events'
import { dayFileFrom } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { block, hhmm, lm, Scenario } from './dsl'

const DATE = '2026-10-21'
const work = (at: string, min: number) => block({ id: 'a', cat: 'analiza', at, min })
const idx = (t: string) => idxOfLogical(gridOf(DATE), lm(t))
const period = (at: number, earlierMin: number, until: number | null = null) => ({ worseDays: [{ at, earlierMin, until }] })

describe('propozycja granicy w gorszy dzień (D587)', () => {
  it('bez znaku – koniec ostatniego bloku pracy + bufor (jak dotąd)', () => {
    const s = new Scenario({ date: DATE, plan: [work('08:00', 8 * 60)] })
    expect(hhmm(s.state('07:00'), s.state('07:00').boundary.proposal)).toBe('16:15')
    expect(s.state('07:00').boundary.worseMin).toBeUndefined()
  })

  it('przyjęty rano: propozycja wcześniej o ustawienie (60 min); stan mówi, o ile wcześniej', () => {
    const s = new Scenario({ date: DATE, plan: [work('08:00', 8 * 60)] })
    const state = s.state('07:00', period(s.at('07:00'), 60))
    expect(hhmm(state, state.boundary.proposal)).toBe('15:15')
    expect(state.boundary.worseMin).toBe(60)
  })

  it('nie wcześniej niż chwila przyjęcia, w górę do pełnej minuty i do 5 min (14:02 → 14:05, 14:05:20 → 14:10)', () => {
    const s = new Scenario({ date: DATE, plan: [work('15:00', 2 * 60)] })
    const at = s.at('14:02')
    const state = computeDay(s.contextAt(at, period(at, 240)))
    expect(hhmm(state, state.boundary.proposal)).toBe('14:05')
    expect(state.boundary.worseMin).toBe(idx('17:15') - idx('14:05'))
    const later = s.at('14:05') + 20_000
    const ceil = computeDay(s.contextAt(later, period(later, 240)))
    expect(hhmm(ceil, ceil.boundary.proposal)).toBe('14:10')
  })

  it('0 min – propozycja bez zmian', () => {
    const s = new Scenario({ date: DATE, plan: [work('08:00', 8 * 60)] })
    const state = s.state('07:00', period(s.at('07:00'), 0))
    expect(hhmm(state, state.boundary.proposal)).toBe('16:15')
    expect(state.boundary.worseMin).toBeUndefined()
  })

  it('minuta przed przyjęciem ma swoją propozycję: granica zatwierdzona sama przy starcie pracy przed przyjęciem zostaje, propozycja teraz – wcześniej', () => {
    const s = new Scenario({ date: DATE, plan: [work('08:00', 8 * 60)] }).start('a', '08:00')
    const state = s.state('10:30', period(s.at('10:00'), 60))
    expect(state.boundary.auto).toBe(true)
    expect(hhmm(state, state.boundary.approved)).toBe('16:15')
    expect(hhmm(state, state.boundary.proposal)).toBe('15:15')
  })

  it('przyjęty przed pierwszym blokiem pracy: granica zatwierdza się sama przy jego starcie już wcześniejsza', () => {
    const s = new Scenario({ date: DATE, plan: [work('08:00', 8 * 60)] }).start('a', '08:00')
    const state = s.state('09:00', period(s.at('07:30'), 60))
    expect(state.boundary.auto).toBe(true)
    expect(hhmm(state, state.boundary.approved)).toBe('15:15')
  })

  it('po „Cofnij” (koniec okresu) propozycja bez przesunięcia; minuty okresu zostają ocenione tak, jak były (praca po wcześniejszej propozycji – po granicy)', () => {
    // Work from 14:00; the worse day 14:30–15:30: its proposal was 14:30 (16:15 − 60 → the floor 14:30) – minutes 14:30–15:30 past it.
    const s = new Scenario({ date: DATE, plan: [work('14:00', 2 * 60)] }).start('a', '14:00')
    const during = s.state('15:00', period(s.at('14:30'), 120))
    expect(hhmm(during, during.boundary.proposal)).toBe('14:30')
    const after = s.state('15:45', period(s.at('14:30'), 120, s.at('15:30')))
    expect(hhmm(after, after.boundary.proposal)).toBe('16:15')
    expect(after.boundary.worseMin).toBeUndefined()
    // Approved by itself at 14:00 (before the period): it stays 16:15 – the minutes are „in” it all along.
    expect(hhmm(after, after.boundary.approved)).toBe('16:15')
    const unapproved = new Scenario({ date: DATE, plan: [work('14:00', 2 * 60)] }).raw({ k: 'boundary.approve', at: s.at('13:00'), boundary: s.at('16:15'), auto: false }, '13:00').raw({ k: 'boundary.undo', at: s.at('13:30') }, '13:30').start('a', '14:00')
    const kept = unapproved.state('15:45', period(s.at('14:30'), 120, s.at('15:30')))
    const plain = unapproved.state('15:45')
    // Without approval (opened by „Cofnij”) the minutes follow the proposal in force then: the period's minutes are past its boundary.
    expect(kept.extensionMin - plain.extensionMin).toBe(60)
  })

  it('znak z pliku dnia trafia do kontekstu dnia (`dayContextOf`) jako okresy; zły znak (poza zakresem) – dzień jak bez niego', () => {
    const inputs = { changes: rdFrom({}).settings, templates: [], lectures: [], series: [], routines: [] }
    const at = Date.parse('2026-10-21T05:00:00Z')
    const blocks = { a: { id: 'a', categoryId: 'analiza', startMin: 8 * 60, durationMin: 8 * 60, fixed: false } }
    const ctxOf = (worseDay: unknown) => dayContextOf(inputs, { date: DATE, events: [], dayFile: dayFileFrom({ schema: 1, date: DATE, dayType: 'zwykly', blocks, worseDay }, DATE), nextFile: null }, marketDay, at)
    expect(ctxOf({ at, earlierMin: 60, routines: {} }).worseDays).toEqual([{ at, earlierMin: 60, until: null }])
    expect(ctxOf({ at: at + 60_000, earlierMin: 30, undoneAt: at + 120_000, past: [{ at, earlierMin: 60, undoneAt: at + 30_000 }] }).worseDays).toEqual([
      { at, earlierMin: 60, until: at + 30_000 },
      { at: at + 60_000, earlierMin: 30, until: at + 120_000 }
    ])
    expect(ctxOf({ at, earlierMin: 300, routines: {} }).worseDays).toBeUndefined()
    expect(ctxOf(undefined).worseDays).toBeUndefined()
    const shifted = computeDay(ctxOf({ at, earlierMin: 60, routines: {} }))
    const plain = computeDay(ctxOf(undefined))
    expect(plain.boundary.proposal! - shifted.boundary.proposal!).toBe(60)
  })

  it('„Wstałeś później?” liczy pracę do granicy gorszego dnia (skraca o tyle więcej)', () => {
    const plan = [block({ id: 'ru', cat: 'rutyny', at: '06:00', min: 45 }), block({ id: 'po', cat: 'posilek', at: '06:45', min: 30 }), block({ id: 'an', cat: 'analiza', at: '07:30', min: 120 }), block({ id: 'na', cat: 'inne', at: '10:00', min: 240 })]
    const moved = plan.map((b) => (b.id === 'ru' ? { ...b, startMin: lm('07:45') } : b))
    const s = new Scenario({ date: DATE, plan, settings: { transitionBufferMin: 0 } })
    const lw = (extra = {}) => {
      const ctx = s.contextAt(s.at('07:00'), { plan: moved, ...extra })
      return detectLateWake(ctx, computeDay(ctx), null)!
    }
    const plainMin = lw().shortens[0]!.toMin
    expect(lw(period(s.at('06:50'), 60)).shortens[0]!.toMin).toBe(plainMin - 60)
    // Accepted at 04:00:10 – its period has the minute 0 the plan's own proposal is counted at: shifted once, not twice.
    expect(lw(period(s.at('04:00') + 10_000, 60)).shortens[0]!.toMin).toBe(plainMin - 60)
  })

  it('reguły 21: starsza wersja nie zna znaku i ustępuje prowadzenia', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(21)
  })
})
