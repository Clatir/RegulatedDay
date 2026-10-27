/**
 * The calibration (spec „Kalibracja”, D99, D119, T53): the period from the first closed ritual (14 qualifying days, at
 * most 28 calendar days), the prompt of the review, the samples of time and the evidence of costs of a day, and the
 * proposals – the median multiplier of time with new lengths rounded to 5 min, the costs that would have foreseen the
 * signals.
 */
import { describe, expect, it } from 'vitest'
import { calibrationPeriod, costEvidence, costProposals, inCalibration, reviewPrompt, timeProposals, timeSamples, type CalibrationDay, type CostEvidence } from '@shared/engine/calibration'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { planBlock, type Template } from '@shared/model/plan'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { modulesOfDay } from '@shared/engine/sideB'
import { dayEnd } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }

const days = (from: string, n: number, o: Partial<CalibrationDay> = {}): CalibrationDay[] => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), closed: 'ritual', dayType: 'zwykly', ...o }))

describe('okres kalibracji', () => {
  it('od pierwszego zamkniętego rytuału, 14 dni kwalifikujących się; przed nim – brak okresu', () => {
    expect(calibrationPeriod([...days('2026-11-01', 3, { closed: 'asWritten' })], '2026-11-04')).toBeNull()
    const p = calibrationPeriod([...days('2026-11-01', 2, { closed: 'asWritten' }), ...days('2026-11-03', 20)], '2026-11-25')
    expect(p).toMatchObject({ from: '2026-11-03', done: true, to: '2026-11-16' })
    expect(p!.days).toHaveLength(14)
  })

  it('bez zjazdów stacjonarnych, dni regeneracyjnych, wolnych i dni zamkniętych inaczej niż rytuałem; najwyżej 28 dni', () => {
    const list = [...days('2026-11-02', 28)].map((d, i) => (i % 2 ? { ...d, dayType: i % 4 === 1 ? 'regeneracyjny' : 'wolne' } : i % 3 === 0 ? { ...d, closed: 'asWritten' as const } : d))
    const open = calibrationPeriod(list, '2026-11-20')
    // The first closed ritual (3.11, a regeneration day) starts it, though the day does not qualify.
    expect(open).toMatchObject({ from: '2026-11-03', done: false })
    expect(inCalibration(open)).toBe(true)
    // 28 calendar days passed without 14 qualifying days: over after the 28th (30.11).
    expect(calibrationPeriod(list, '2026-11-30')?.done).toBe(false)
    const over = calibrationPeriod(list, '2026-12-01')
    expect(over).toMatchObject({ done: true, to: '2026-11-30' })
    expect(over!.days.length).toBeLessThan(14)
    expect(inCalibration(over)).toBe(false)
  })

  it('przegląd: dzień po końcu okresu w planie porannym, po trzecim „Nie teraz” w ustawieniach, po przeglądzie – nigdzie', () => {
    const p = calibrationPeriod(days('2026-11-02', 14), '2026-11-16')!
    expect(p.to).toBe('2026-11-15')
    expect(reviewPrompt(p, '2026-11-15', { deferrals: 0, reviewed: false })).toBe('none')
    expect(reviewPrompt(p, '2026-11-16', { deferrals: 2, reviewed: false })).toBe('morning')
    expect(reviewPrompt(p, '2026-11-20', { deferrals: 3, reviewed: false })).toBe('settings')
    expect(reviewPrompt(p, '2026-11-20', { deferrals: 1, reviewed: true })).toBe('none')
    expect(reviewPrompt(calibrationPeriod(days('2026-11-02', 5), '2026-11-08'), '2026-11-08', { deferrals: 0, reviewed: false })).toBe('none')
  })
})

describe('próbki czasu', () => {
  const at = dayEnd(DATE)
  const state = (s: Scenario) => s.stateAt(at, { asWritten: true })

  it('skończony elastyczny blok ze startem i końcem z kliknięcia (albo poprawionym); bez stałych, automatycznych i dopisanych z planu', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '10:00', min: 60, fixed: true }), block({ id: 'b', cat: 'analiza', at: '12:00', min: 30 }), block({ id: 'c', cat: 'analiza', at: '14:00', min: 30 })], settings: { transitionBufferMin: 0 } })
    s.ran('a', '08:00', '09:20').ran('f', '10:00', '11:00')
    s.start('b', '12:00').write([{ k: 'block.end', block: 'b', at: s.at('12:40'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('12:50'))
    // „Odbył się o planowanej porze” in the ritual: its times are the plan's – no sample, until both are corrected.
    s.write([{ k: 'block.start', block: 'c', at: s.at('14:00'), bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 30, tag: null, fixed: false }, confirmUntil: null, how: 'plan' }, { k: 'block.end', block: 'c', at: s.at('14:30'), done: true, rule: null }], s.at('22:00'))
    expect(timeSamples({ ...s.contextAt(at), now: at, asWritten: true }, state(s))).toEqual([{ category: 'analiza', plannedMin: 60, realMin: 80 }])
    s.write([{ k: 'block.fix', block: 'c', at: s.at('22:05'), start: s.at('14:05'), end: null }], s.at('22:05'))
    expect(timeSamples({ ...s.contextAt(at), now: at, asWritten: true }, state(s)).map((x) => x.realMin)).toEqual([80])
    s.write([{ k: 'block.fix', block: 'c', at: s.at('22:06'), start: null, end: s.at('14:50') }], s.at('22:06'))
    expect(timeSamples({ ...s.contextAt(at), now: at, asWritten: true }, state(s)).map((x) => x.realMin)).toEqual([80, 45])
  })
})

describe('dowody kosztów', () => {
  const at = dayEnd(DATE)
  function day(): Scenario {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    return s.checkin('08:00', MID).ran('a', '09:00', '10:00').ran('b', '10:00', '11:00')
  }
  const evidence = (s: Scenario, energyOn = true) => costEvidence({ ...s.contextAt(at), now: at, asWritten: true }, s.stateAt(at, { asWritten: true }), energyOn)

  it('sygnał rozkłada się na kategorie z czasu przed nim (od poprzedniej kotwicy, najwyżej 3 h) według minut', () => {
    const s = day().signal('glasses', '11:00')
    const e = evidence(s)!
    expect(e.minutes).toEqual({ analiza: 60, inne: 60 })
    expect(e.residual.analiza).toEqual({ head: 0, emotions: 0, senses: -5 })
    expect(e.residual.inne).toEqual({ head: 0, emotions: 0, senses: -5 })
    // A later anchor counts only the time since the one before (11:00–11:30: no block).
    s.relative('head', -10, '11:30')
    expect(evidence(s)!.residual.analiza!.head).toBe(0)
  })

  it('bez check-inu albo z modułem energii wyłączonym choćby na chwilę – brak dowodów', () => {
    const none = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 })], settings: { transitionBufferMin: 0 } }).ran('a', '09:00', '10:00')
    expect(evidence(none)).toBeNull()
    expect(evidence(day(), false)).toBeNull()
    // The module switched off for a while: off „all day” for the evidence (as the measure sees it).
    const off = day().module(false, '12:00').module(true, '12:10')
    expect(modulesOfDay(off.events, { energy: true, projects: true, requests: true }).energy).toBe(false)
  })
})

describe('propozycje przeglądu', () => {
  const template: Template = {
    id: 't',
    name: 'Zwykły',
    dayType: 'zwykly',
    weekdays: [1, 2, 3, 4, 5],
    archived: false,
    versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [planBlock({ id: 'x', categoryId: 'analiza', startMin: 480, durationMin: 60 }), planBlock({ id: 'y', categoryId: 'analiza', startMin: 600, durationMin: 25 }), planBlock({ id: 'z', categoryId: 'analiza', startMin: 700, durationMin: 60, fixed: true })] }]
  }

  it('czas: mediana realny ÷ plan z co najmniej 5 bloków, nowe długości w szablonach do 5 min (bez bloków stałych)', () => {
    const s = (realMin: number) => ({ category: 'analiza', plannedMin: 60, realMin })
    const [p] = timeProposals([s(80), s(85), s(84), s(90), s(60)], [template], '2026-11-20')
    expect(p).toMatchObject({ category: 'analiza', samples: 5, multiplier: 1.4 })
    expect(p!.blocks).toEqual([
      { template: 't', block: 'x', fromMin: 60, toMin: 85 },
      { template: 't', block: 'y', fromMin: 25, toMin: 35 }
    ])
    expect(timeProposals([s(80), s(85), s(84), s(90)], [template], '2026-11-20')).toEqual([])
  })

  it('koszty: z co najmniej 5 dni z kategorią – zmiana kosztu na godzinę, która przewidziałaby sygnały, w zakresie −5…5', () => {
    const day = (residualSenses: number, key = 'analiza'): CostEvidence => ({ minutes: { [key]: 120 }, residual: { [key]: { head: 0, emotions: 0, senses: residualSenses } } })
    // 10 h of analysis (3 / 1 / 1), −30 units of senses the model did not foresee: +1 an hour.
    const [p] = costProposals([day(-6), day(-6), day(-6), day(-6), day(-6)], DEFAULT_SETTINGS)
    expect(p).toEqual({ category: 'analiza', variant: null, days: 5, hours: 10, from: { head: 3, emotions: 1, senses: 1 }, to: { head: 3, emotions: 1, senses: 2 } })
    expect(costProposals([day(-6), day(-6), day(-6), day(-6)], DEFAULT_SETTINGS)).toEqual([])
    // Nothing to change: no proposal; never beyond 5.
    expect(costProposals([day(0), day(0), day(0), day(0), day(0)], DEFAULT_SETTINGS)).toEqual([])
    expect(costProposals([day(-600), day(-600), day(-600), day(-600), day(-600)], DEFAULT_SETTINGS)[0]!.to.senses).toBe(5)
    // A variant with its own costs: its costs change, not the category's (drzemka −3 / −1 / −2).
    const [v] = costProposals([0, 1, 2, 3, 4].map(() => day(-6, 'regeneracja:drzemka')), DEFAULT_SETTINGS)
    expect(v).toMatchObject({ category: 'regeneracja', variant: 'drzemka', from: { head: -3, emotions: -1, senses: -2 }, to: { senses: -1 } })
  })
})

describe('dowody kosztów – szczegóły', () => {
  const at = dayEnd(DATE)
  const evidence = (s: Scenario) => costEvidence({ ...s.contextAt(at), now: at, asWritten: true }, s.stateAt(at, { asWritten: true }), true)
  const base = () => new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 })], settings: { transitionBufferMin: 0 } })

  it('dwie kotwice w tej samej minucie dzielą jedno okno – liczą się obie', () => {
    const s = base().checkin('08:00', MID).ran('a', '09:00', '10:00').signal('glasses', '10:00').signal('earplugs', '10:00')
    expect(evidence(s)!.residual.analiza).toEqual({ head: 0, emotions: 0, senses: -20 })
  })

  it('kolejny check-in zaczyna okno od nowa: czas przed nim nie dostaje skutku następnego sygnału', () => {
    const s = base().checkin('08:00', MID).ran('a', '09:00', '10:00').checkin('12:00', MID).ran('b', '13:00', '14:00').signal('rocking', '14:00')
    const e = evidence(s)!
    expect(e.residual.analiza).toBeUndefined()
    expect(e.residual.inne).toEqual({ head: -5, emotions: -5, senses: -5 })
  })

  it('skutek sygnału według ustawień z jego minuty (zmiana „od dziś” później go nie zmienia)', () => {
    const s = base().checkin('08:00', MID).ran('a', '09:00', '10:00').signal('glasses', '10:00')
    const changed = { ...s.settings, signalEffects: { ...s.settings.signalEffects, glassesSenses: 20 } }
    s.raw({ k: 'day.snapshot', at: s.at('15:00'), dayType: 'zwykly', settings: changed, reason: 'today' }, '15:00')
    expect(evidence(s)!.residual.analiza!.senses).toBe(-10)
  })

  it('wspólna minuta należy do bloku zaczętego później; blok z własnymi kosztami i wariant z własnymi kosztami osobno', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:30', min: 30 }), { ...block({ id: 'o', cat: 'inne', at: '11:00', min: 30 }), costs: { head: 1, emotions: 1, senses: 1 } }], settings: { transitionBufferMin: 0 } })
    s.checkin('08:00', MID).start('a', '09:00').start('r', '09:30').end('r', '10:00').end('a', '10:00')
    s.ran('o', '11:00', '11:30')
    expect(evidence(s)!.minutes).toEqual({ analiza: 30, 'regeneracja:drzemka': 30 })
  })
})

describe('próbki czasu – koniec podany przez Ciebie', () => {
  const at = dayEnd(DATE)
  it('koniec automatyczny poprawiony Twoją odpowiedzią („skończył się o …”) daje próbkę; „odbył się o planowanej porze” – nie', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'c', cat: 'analiza', at: '14:00', min: 30 })], settings: { transitionBufferMin: 0 } })
    s.start('a', '08:00').write([{ id: 'auto-end', k: 'block.end', block: 'a', at: s.at('09:40'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('09:40'))
    s.write([{ k: 'undo', at: s.at('21:00'), target: 'auto-end', reason: 'ritual' }, { k: 'block.end', block: 'a', at: s.at('09:10'), done: true, rule: null }], s.at('21:00'))
    s.write([{ k: 'block.start', block: 'c', at: s.at('14:00'), bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 30, tag: null, fixed: false }, confirmUntil: null, how: 'plan' }, { k: 'block.end', block: 'c', at: s.at('14:30'), done: true, rule: null }], s.at('21:05'))
    expect(timeSamples({ ...s.contextAt(at), now: at, asWritten: true }, s.stateAt(at, { asWritten: true }))).toEqual([{ category: 'analiza', plannedMin: 60, realMin: 70 }])
  })
})
