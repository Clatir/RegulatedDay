/**
 * The morning plan's line about today's all-day events (D405, HKU1 part C): „Dziś: Konferencja (2/3)”, several in the order
 * of `compareAllDay` joined with „ · ”, a one-day event without a day count, none – no line.
 */
import { describe, expect, it } from 'vitest'
import { morningAllDayLine } from '@renderer/features/today/morningAllDay'
import type { AllDayEvent } from '@shared/model/allDay'

const ev = (id: string, title: string, startDate: string, endDate = startDate): AllDayEvent => ({ id, title, startDate, endDate, calendarId: null, color: 'amber', note: '', free: false })

describe('linia wydarzeń w planie porannym', () => {
  it('brak wydarzeń dziś – brak linii', () => {
    expect(morningAllDayLine([], '2026-11-19')).toBeNull()
    expect(morningAllDayLine([ev('a', 'Wczoraj', '2026-11-18'), ev('b', 'Jutro', '2026-11-20', '2026-11-21')], '2026-11-19')).toBeNull()
  })

  it('wielodniowe: dzień „(2/3)”', () => {
    expect(morningAllDayLine([ev('a', 'Konferencja', '2026-11-18', '2026-11-20')], '2026-11-19')).toBe('Dziś: Konferencja (2/3)')
  })

  it('jednodniowe bez dopisku', () => {
    expect(morningAllDayLine([ev('a', 'Urlop', '2026-11-19')], '2026-11-19')).toBe('Dziś: Urlop')
  })

  it('kilka: wszystkie, w kolejności compareAllDay (wcześniejszy start, dłuższe, tytuł)', () => {
    const events = [ev('c', 'Zebranie', '2026-11-19'), ev('b', 'Urlop', '2026-11-19', '2026-11-19'), ev('a', 'Konferencja', '2026-11-18', '2026-11-20')]
    expect(morningAllDayLine(events, '2026-11-19')).toBe('Dziś: Konferencja (2/3) · Urlop · Zebranie')
  })

  it('tytuł nie jest skracany (jak w pasie), notatka nie wchodzi do linii', () => {
    const title = 'Bardzo długa nazwa wydarzenia, której nikt nie skraca'
    expect(morningAllDayLine([{ ...ev('a', title, '2026-11-19'), note: 'tajne' }], '2026-11-19')).toBe(`Dziś: ${title}`)
  })
})
