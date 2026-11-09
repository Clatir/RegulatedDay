/**
 * The words of „Tydzień” (D356, D360): the title of the week, a column's boundary and regeneration, the progress „x z y”
 * of the month's goals with its counters, and the goals the morning's step takes over from the month before.
 */
import { describe, expect, it } from 'vitest'
import type { GoalsProgress } from '@shared/engine/goals'
import { unknownDay, type HorizonDay } from '@shared/engine/week'
import { suggestedGoals } from '@renderer/features/today/GoalsStep'
import { blockStateText, boundaryLine, dayHeading, goalRows, monthLabel, monthName, progressNotes, regenLine, weekTitle } from '@renderer/features/week/weekText'

const day = (o: Partial<HorizonDay>): HorizonDay => ({ ...unknownDay('2026-11-04', 'past'), read: 'full', presence: true, dayType: 'zwykly', ...o })
const regen = (towardMin: number, requiredMin: number, reached = towardMin >= requiredMin) => ({ towardMin, requiredMin, reached, counts: true, forecastMin: towardMin })

describe('tytuł tygodnia i nagłówki kolumn', () => {
  it('„3–9.11.2026”; na przełomie miesięcy i lat z obiema datami', () => {
    expect(weekTitle('2026-11-02')).toBe('2–8.11.2026')
    expect(weekTitle('2026-11-09')).toBe('9–15.11.2026')
    expect(weekTitle('2026-10-26')).toBe('26.10–1.11.2026')
    expect(weekTitle('2026-12-28')).toBe('28.12.2026–3.01.2027')
  })

  it('dzień i data kolumny; nazwa miesiąca', () => {
    expect(dayHeading('2026-11-03', 1)).toBe('wt 3.11')
    expect(dayHeading('2026-11-15', 6)).toBe('nd 15.11')
    expect(monthLabel('2026-11')).toBe('listopad 2026')
    expect(monthName('2026-02')).toBe('luty')
  })
})

describe('granica dnia w kolumnie', () => {
  it('dotrzymana ✓, nie dotrzymana ✗ z przedłużeniem, wolne, brak danych', () => {
    expect(boundaryLine(day({ boundary: 'kept' }))).toMatchObject({ text: '✓ granica', tone: 'ok' })
    expect(boundaryLine(day({ boundary: 'broken', extensionMin: 25 }))).toMatchObject({ text: '✗ granica +25 min', tone: 'bad' })
    expect(boundaryLine(day({ boundary: 'broken', extensionMin: 0 }))?.text).toBe('✗ granica')
    expect(boundaryLine(day({ boundary: 'free' }))).toMatchObject({ text: 'wolne', tone: 'muted' })
    expect(boundaryLine(day({ boundary: 'noData' }))).toMatchObject({ text: 'granica: brak danych', tone: 'muted' })
  })

  it('dziś – „w toku”, z dopiskiem przedłużenia, gdy jest; dzień przyszły – nic', () => {
    expect(boundaryLine(day({ when: 'today', boundary: 'open' }))?.text).toBe('granica w toku')
    expect(boundaryLine(day({ when: 'today', boundary: 'open', extensionMin: 15 }))?.text).toBe('granica w toku (+15 min)')
    expect(boundaryLine(day({ when: 'future', boundary: null }))).toBeNull()
  })

  it('dzień, którego nie da się odczytać, mówi to wprost (bez granicy i regeneracji w liczbach)', () => {
    const d = unknownDay('2026-11-04', 'past')
    expect(boundaryLine(d)?.text).toBe('nie da się teraz odczytać')
    expect(regenLine(d)).toBeNull()
  })
})

describe('regeneracja wobec minimum w kolumnie', () => {
  it('minione dni i dziś: „95 z 90 min” z ✓ po osiągnięciu minimum', () => {
    expect(regenLine(day({ regen: regen(95, 90) }))).toMatchObject({ text: 'regeneracja ✓ 95 z 90 min', tone: 'ok' })
    expect(regenLine(day({ regen: regen(40, 90) }))).toMatchObject({ text: 'regeneracja 40 z 90 min', tone: 'plain' })
    expect(regenLine(day({ when: 'today', regen: regen(12.4, 90) }))?.text).toBe('regeneracja 12 z 90 min')
  })

  it('dzień przyszły – samo minimum, bez prognozy', () => {
    expect(regenLine(day({ when: 'future', regen: { ...regen(0, 90), forecastMin: 140 } }))).toMatchObject({ text: 'minimum 1 h 30 min', tone: 'muted' })
  })

  it('dzień miniony bez obecności – „brak danych”', () => {
    expect(regenLine(day({ presence: false, regen: null }))).toMatchObject({ text: 'regeneracja: brak danych', tone: 'muted' })
  })

  it('stan bloku w podpowiedzi, z oznaczeniem „poza planem”', () => {
    expect(blockStateText('missed', false)).toBe('nie zaczęty')
    expect(blockStateText('ran', true)).toBe('zrobiony · poza planem')
  })
})

describe('postęp celów miesiąca „x z y” (D356, D360)', () => {
  const P = (o: Partial<GoalsProgress> = {}): GoalsProgress => ({
    month: '2026-11',
    days: 9,
    monthDays: 30,
    preliminary: 1,
    unknown: [],
    partial: [],
    study: { min: 0, goalMin: null },
    regen: { days: 0, goal: null },
    trading: { clean: 0, goal: null, extended: 0, outsidePlan: 0 },
    ...o
  })

  it('studia w godzinach z dziesiątą tam, gdzie jest; „0 z 40 h” zaraz po ustawieniu celu', () => {
    expect(goalRows(P({ study: { min: 0, goalMin: 2400 } }))[0]!.text).toBe('0 z 40 h')
    expect(goalRows(P({ study: { min: 750, goalMin: 2400 } }))[0]!.text).toBe('12,5 z 40 h')
    expect(goalRows(P({ study: { min: 120, goalMin: 2400 } }))[0]!.text).toBe('2 z 40 h')
  })

  it('regeneracja w dniach, dyscyplina w sesjach; liczniki obok, bez odejmowania', () => {
    const rows = goalRows(P({ regen: { days: 5, goal: 20 }, trading: { clean: 3, goal: 10, extended: 2, outsidePlan: 1 } }))
    expect(rows[1]!.text).toBe('5 z 20 dni')
    expect(rows[2]!.text).toBe('3 z 10 sesji')
    expect(rows[2]!.counters).toEqual(['przedłużone: 2', 'poza planem: 1'])
    expect(goalRows(P({ regen: { days: 0, goal: 1 } }))[1]!.text).toBe('0 z 1 dnia')
  })

  it('obszar bez celu nie ma liczby', () => {
    expect(goalRows(P()).map((r) => r.text)).toEqual([null, null, null])
  })

  it('dopiski: „wstępne” dopóki jest niezamrożony dzień, dane niepełne – ile dni', () => {
    expect(progressNotes(P()).map((n) => n.text)).toEqual(['wstępne'])
    expect(progressNotes(P({ preliminary: 0 }))).toEqual([])
    expect(progressNotes(P({ preliminary: 0, unknown: ['2026-11-03'], partial: ['2026-11-04', '2026-11-05'] })).map((n) => n.text)).toEqual(['niepełne dane: 3'])
  })
})

describe('krok „Cele na <miesiąc>”: liczby z poprzedniego miesiąca', () => {
  it('przejęte, a ponad zakres nowego miesiąca – obcięte do niego', () => {
    expect(suggestedGoals('2026-11', { study: 40, regen: 22, trading: 12 })).toEqual({ study: 40, regen: 22, trading: 12 })
    // The month before had 31 days: 31 days of regeneration cannot be asked for in a month of 30 (nor 28).
    expect(suggestedGoals('2026-11', { study: 40, regen: 31, trading: null })).toEqual({ study: 40, regen: 30, trading: null })
    expect(suggestedGoals('2027-02', { study: null, regen: 30, trading: null }).regen).toBe(28)
  })

  it('bez poprzedniego miesiąca – puste pola', () => {
    expect(suggestedGoals('2026-11', null)).toEqual({ study: null, regen: null, trading: null })
  })
})
