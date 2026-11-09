/**
 * The month's goals (D356): a number for study (hours of „Nauka” and „Oglądanie wykładu”), regeneration (days with the
 * minimum reached) and trading discipline (sessions from the plan without an extension) – „x z y” without a judgement –
 * kept in rd.json field by field (an older version keeps the field as it is), checked as they come from a window; the
 * morning's step „Cele na <miesiąc>” on the first day of a month while the goals are not set and the step not skipped.
 */
import { describe, expect, it } from 'vitest'
import { diffRecords, merge3, setAt } from '@shared/data/merge'
import { goalsDates, goalsProgress, goalsStepShown } from '@shared/engine/goals'
import { unknownDay, type HorizonDay } from '@shared/engine/week'
import { daysInMonth, goalRange, goalsEdits, goalsFrom, goalsPatchFrom, hasGoals, isMonth, monthGoalsFrom, NO_GOALS, previousMonth, type MonthGoals } from '@shared/model/goals'
import { rdFrom } from '@shared/model/rd'

const G = (o: Partial<MonthGoals> = {}): MonthGoals => ({ ...NO_GOALS, ...o })

describe('cele w rd.json – odczyt', () => {
  it('liczby całkowite w zakresach; poza zakresem, ułamek albo tekst – brak celu (nigdy zero)', () => {
    expect(monthGoalsFrom({ study: 40, regen: 20, trading: 30 }, '2026-11')).toEqual({ study: 40, regen: 20, trading: 30, skipped: false })
    expect(monthGoalsFrom({ study: 0, regen: 31, trading: 2.5, skipped: 'tak' }, '2026-11')).toEqual({ study: null, regen: null, trading: null, skipped: false })
    expect(monthGoalsFrom({ study: '40', regen: -1, trading: 201 }, '2026-11')).toEqual(NO_GOALS)
    expect(monthGoalsFrom({ skipped: true }, '2026-11')).toEqual({ ...NO_GOALS, skipped: true })
    // February of a common year has 28 days: 29 is no goal, 28 is.
    expect(monthGoalsFrom({ regen: 29 }, '2027-02').regen).toBeNull()
    expect(monthGoalsFrom({ regen: 28 }, '2027-02').regen).toBe(28)
    expect(monthGoalsFrom('x', '2026-11')).toEqual(NO_GOALS)
  })

  it('miesiące: tylko prawdziwe klucze „RRRR-MM”, liczba dni, poprzedni miesiąc, zakresy', () => {
    expect(goalsFrom({ '2026-11': { study: 10 }, '2026-13': { study: 10 }, listopad: { study: 10 }, '2026-12': 5 })).toEqual({ '2026-11': G({ study: 10 }), '2026-12': NO_GOALS })
    expect(goalsFrom(null)).toEqual({})
    expect([isMonth('2026-11'), isMonth('2026-00'), isMonth('2026-1'), isMonth(202611)]).toEqual([true, false, false, false])
    expect([daysInMonth('2026-11'), daysInMonth('2026-12'), daysInMonth('2027-02'), daysInMonth('2028-02')]).toEqual([30, 31, 28, 29])
    expect([previousMonth('2026-11'), previousMonth('2027-01')]).toEqual(['2026-10', '2026-12'])
    expect([goalRange('study', '2026-11'), goalRange('regen', '2026-11'), goalRange('trading', '2026-11')]).toEqual([
      [1, 300],
      [1, 30],
      [1, 200]
    ])
    expect([hasGoals(NO_GOALS), hasGoals(G({ skipped: true })), hasGoals(G({ trading: 5 })), hasGoals(undefined)]).toEqual([false, false, true, false])
  })

  it('rd.json z celami – rdFrom je czyta; pozostałe pola bez zmian, także gdy pole celów jest zepsute', () => {
    const base = { schema: 1, ritualFrom: '2026-10-01', people: [{ id: 'p1', name: 'Mama' }], general: { waterEveryMin: 60 } }
    expect(rdFrom({ ...base, goals: { '2026-11': { study: 40 } } }).goals).toEqual({ '2026-11': G({ study: 40 }) })
    for (const goals of [{ '2026-11': { study: 40, regen: 'x' } }, 'zepsute', [1, 2], { '2026-11': null }]) {
      const { goals: _g, ...rest } = rdFrom({ ...base, goals })
      const { goals: _n, ...plain } = rdFrom(base)
      expect(rest).toEqual(plain)
    }
  })
})

describe('cele w rd.json – zgodność ze starszą wersją i z drugim komputerem', () => {
  const file = { schema: 1, people: [{ id: 'p1', name: 'Mama', archived: false }], goals: { '2026-11': { study: 40, regen: 20, trading: null, skipped: false } } }

  it('zmiana innego pola przez starszą wersję (pole po polu) zostawia cele w pliku', () => {
    // 1.0.9 edits rd.json as the fields it changed (diffRecords of the raw file): `goals` is never one of them.
    const before = structuredClone(file) as Record<string, unknown>
    const after = { ...before, people: [{ id: 'p1', name: 'Mama', archived: true }] }
    const edits = diffRecords(before, after)
    expect(edits.map((e) => e.path)).toEqual([['people', '#p1', 'archived']])
    let v: unknown = structuredClone(file)
    for (const e of edits) v = setAt(v, e.path, e.after)
    expect((v as typeof file).goals).toEqual(file.goals)
  })

  it('dwa komputery: cele dwóch miesięcy (albo dwa cele jednego) łączą się bez pytania', () => {
    const base = structuredClone(file)
    const mine = setAt(structuredClone(file), ['goals', '2026-12', 'study'], 30)
    const theirs = setAt(structuredClone(file), ['goals', '2026-11', 'trading'], 25)
    const { merged, conflicts } = merge3(base, mine, theirs)
    expect(conflicts).toEqual([])
    expect(goalsFrom((merged as typeof file).goals)).toEqual({ '2026-11': G({ study: 40, regen: 20, trading: 25 }), '2026-12': G({ study: 30 }) })
  })
})

describe('cele z okna – sprawdzenie i pola do zapisu', () => {
  it('liczba całkowita w zakresie albo null; „pominięto” – tak / nie; reszta odrzucona z powodem', () => {
    expect(goalsPatchFrom('2026-11', { study: 40, regen: null, skipped: true })).toEqual({ ok: true, month: '2026-11', patch: { study: 40, regen: null, skipped: true } })
    expect(goalsPatchFrom('2026-11', { regen: 31 })).toEqual({ ok: false, why: 'cel musi być liczbą całkowitą od 1 do 30' })
    expect(goalsPatchFrom('2026-11', { study: 1.5 })).toMatchObject({ ok: false })
    expect(goalsPatchFrom('2026-11', { trading: '5' })).toMatchObject({ ok: false })
    expect(goalsPatchFrom('2026-11', { sen: 5 })).toEqual({ ok: false, why: 'nieznany cel sen' })
    expect(goalsPatchFrom('2026-11', { skipped: 1 })).toMatchObject({ ok: false })
    expect(goalsPatchFrom('2026-13', {})).toEqual({ ok: false, why: 'miesiąc celów' })
    expect(goalsPatchFrom('2026-11', null)).toEqual({ ok: false, why: 'cele miesiąca' })
  })

  it('każda liczba osobnym polem z wartością, jaką ma teraz, za bazę; to, co już jest – bez zmiany', () => {
    const raw = { schema: 1, goals: { '2026-11': { study: 40, regen: 20 } } }
    expect(goalsEdits(raw, '2026-11', { study: 40, regen: null, trading: 15 })).toEqual([
      { path: ['goals', '2026-11', 'regen'], base: 20, value: null },
      { path: ['goals', '2026-11', 'trading'], base: undefined, value: 15 }
    ])
    expect(goalsEdits({ schema: 1 }, '2026-12', { skipped: true })).toEqual([{ path: ['goals', '2026-12', 'skipped'], base: undefined, value: true }])
    expect(goalsEdits(raw, '2026-11', { study: 40 })).toEqual([])
  })
})

/** A day of the month as the week counts it. */
const day = (date: string, o: Partial<HorizonDay> = {}): HorizonDay => ({ ...unknownDay(date, 'past'), read: 'full', dayType: 'zwykly', frozen: true, ...o })
const regen = (reached: boolean) => ({ towardMin: reached ? 100 : 40, requiredMin: 90, reached, counts: true, forecastMin: reached ? 100 : 40 })

describe('postęp celów – „x z y”', () => {
  const days = [
    day('2026-11-01', { studyMin: 90, regen: regen(true), sessions: { clean: 0, extended: 0, outsidePlan: 0 } }),
    day('2026-11-02', { studyMin: 45, regen: regen(false), sessions: { clean: 2, extended: 1, outsidePlan: 0 } }),
    day('2026-11-03', { frozen: false, studyMin: 30, regen: regen(true), sessions: { clean: 1, extended: 0, outsidePlan: 1 } }),
    day('2026-11-04', { when: 'today', frozen: false, studyMin: 20, regen: regen(false), sessions: { clean: 1, extended: 0, outsidePlan: 0 } }),
    { ...unknownDay('2026-11-05', 'future') },
    day('2026-10-31', { studyMin: 600, regen: regen(true), sessions: { clean: 5, extended: 0, outsidePlan: 0 } })
  ]

  it('studia – minuty nauki i oglądania wykładu z dni miesiąca do dziś; regeneracja – dni z minimum; trading – sesje bez przedłużenia, obok przedłużone i poza planem', () => {
    const p = goalsProgress('2026-11', G({ study: 40, regen: 20, trading: 30 }), days)
    expect(p).toEqual({
      month: '2026-11',
      days: 4,
      monthDays: 30,
      // 03.11 not frozen yet, and today.
      preliminary: 2,
      unknown: [],
      partial: [],
      study: { min: 185, goalMin: 2400 },
      regen: { days: 2, goal: 20 },
      trading: { clean: 4, goal: 30, extended: 1, outsidePlan: 1 }
    })
  })

  it('bez celu: liczy się i tak (null zamiast celu); dzień nieczytelny – pominięty i nazwany', () => {
    const p = goalsProgress('2026-11', NO_GOALS, [...days.slice(0, 2), unknownDay('2026-11-03', 'past'), day('2026-11-04', { when: 'today', frozen: false, read: 'partial', studyMin: 10 })])
    expect(p).toMatchObject({ days: 4, unknown: ['2026-11-03'], partial: ['2026-11-04'], study: { min: 145, goalMin: null }, regen: { days: 1, goal: null }, trading: { clean: 2, goal: null } })
  })

  it('dni do policzenia: od pierwszego do dziś; miesiąc miniony – cały; przyszły – żaden', () => {
    expect(goalsDates('2026-11', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(goalsDates('2026-10', '2026-11-03')).toHaveLength(31)
    expect(goalsDates('2026-12', '2026-11-03')).toEqual([])
  })
})

describe('krok poranny „Cele na <miesiąc>”', () => {
  it('przy każdym planie porannym w miesiącu, dopóki cele nie są ustawione i krok nie został pominięty (D360)', () => {
    expect(goalsStepShown(undefined)).toBe(true)
    expect(goalsStepShown(NO_GOALS)).toBe(true)
    // Set already (also only one of them, also in advance on „Tydzień”), or skipped on any computer: not shown.
    expect(goalsStepShown(G({ regen: 20 }))).toBe(false)
    expect(goalsStepShown(G({ study: 40 }))).toBe(false)
    expect(goalsStepShown(G({ skipped: true }))).toBe(false)
  })
})
