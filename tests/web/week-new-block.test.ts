/**
 * The new block of „Tydzień” over several days (D371): the column under the pointer, the days of a drag, how the heading and
 * the warning of the days gone by word them, the category the window starts with.
 */
import { describe, expect, it } from 'vitest'
import { lastNewBlockCategory, rememberNewBlockCategory, startCategory } from '@renderer/features/plan/lastCategory'
import { columnAt, dayIndexes } from '@renderer/features/week/weekLayout'
import { daysLabel, pastWarning } from '@renderer/features/week/weekText'

// A grid 1024 px wide from x = 100: the axis of hours 48 px, seven columns with 4 px between them – each 136 px.
const GRID = { gridLeft: 100, gridWidth: 1024, axisPx: 48, gap: 4, count: 7 }

describe('kolumna pod wskaźnikiem (D371)', () => {
  it('liczy kolumny od osi godzin, z odstępami', () => {
    expect(columnAt(100 + 48 + 1, GRID)).toBe(0)
    expect(columnAt(100 + 48 + 135, GRID)).toBe(0)
    expect(columnAt(100 + 48 + 140 + 1, GRID)).toBe(1)
    expect(columnAt(100 + 48 + 3 * 140 + 70, GRID)).toBe(3)
    expect(columnAt(100 + 48 + 6 * 140 + 135, GRID)).toBe(6)
  })
  it('poza siatką – pierwsza lub ostatnia kolumna', () => {
    expect(columnAt(10, GRID)).toBe(0)
    expect(columnAt(120, GRID)).toBe(0)
    expect(columnAt(5000, GRID)).toBe(6)
  })
})

describe('dni przeciągnięcia (D371)', () => {
  it('od kolumny startu do kolumny pod wskaźnikiem, w obie strony', () => {
    expect(dayIndexes(1, 3)).toEqual([1, 2, 3])
    expect(dayIndexes(3, 1)).toEqual([1, 2, 3])
    expect(dayIndexes(4, 4)).toEqual([4])
  })
})

describe('nagłówek okienka i ostrzeżenie o dniach minionych (D371)', () => {
  // 2026-11-09 is a Monday.
  const mon = '2026-11-09'
  const tue = '2026-11-10'
  const wed = '2026-11-11'
  const thu = '2026-11-12'
  it('jeden dzień – pełna nazwa, kilka po kolei – od–do, inaczej lista', () => {
    expect(daysLabel([tue])).toBe('wtorek')
    expect(daysLabel([tue, wed, thu])).toBe('wt–cz')
    expect(daysLabel([tue, wed])).toBe('wt–śr')
    expect(daysLabel([tue, thu])).toBe('wt, cz')
  })
  it('bez dnia minionego – bez ostrzeżenia; dziś nie jest minione', () => {
    expect(pastWarning([wed], wed)).toBeNull()
    expect(pastWarning([wed, thu], wed)).toBeNull()
  })
  it('jeden dzień minął – „Ten dzień już minął.”', () => {
    expect(pastWarning([mon], wed)).toBe('Ten dzień już minął.')
  })
  it('w zakresie – nazwa dnia, liczba i rodzaj zgodne', () => {
    expect(pastWarning([tue, wed, thu], wed)).toBe('Wtorek już minął.')
    expect(pastWarning([tue, wed, thu], thu)).toBe('Wtorek i środa już minęły.')
    expect(pastWarning([mon, tue, wed, thu], '2026-11-13')).toBe('Poniedziałek, wtorek, środa i czwartek już minęły.')
    expect(pastWarning([wed, thu], '2026-11-12')).toBe('Środa już minęła.')
  })
})

describe('kategoria na starcie okienka (D371)', () => {
  const available = ['inne', 'nauka', 'trening']
  it('ostatnio dodana, jeśli nadal można ją wybrać', () => {
    expect(startCategory('trening', available)).toBe('trening')
  })
  it('za pierwszym razem albo po zarchiwizowaniu – „Inne”', () => {
    expect(startCategory(null, available)).toBe('inne')
    expect(startCategory('zniknela', available)).toBe('inne')
  })
  it('bez „Inne” – pierwsza z listy', () => {
    expect(startCategory(null, ['nauka', 'trening'])).toBe('nauka')
  })
  it('pamięć okna: brak magazynu to brak pamięci, nie błąd', () => {
    // No `localStorage` in this environment: reading gives nothing, writing is silent.
    expect(lastNewBlockCategory()).toBeNull()
    expect(() => rememberNewBlockCategory('trening')).not.toThrow()
  })
})
