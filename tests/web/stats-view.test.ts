/**
 * „Statystyki” w oknie (D358): skale wykresów, miejsca słupków, teksty tabel i not – bez oceny i porównań – oraz sam
 * wykres narysowany do SVG (liczba słupków, osie, podpisy).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BarChart, BoundaryChart } from '@renderer/features/stats/Charts'
import { accuracyBars, lastWeeks, missingNote, MAX_WEEKS, weekAxisLabel, axisOf, barPlaces, daysNote, ENERGY_AXIS, statsNote, energyText, feltBars, hourLabel, meanBars, minutesText, niceStep, percentText, personBars, ratioText, stackPlaces, tooLittle, weekdayShort, weekLabel } from '@renderer/features/stats/statsView'

describe('skale wykresów', () => {
  it('krok osi to 1, 2 albo 5 razy potęga dziesięciu; oś od 0 do okrągłego maksimum nad największą wartością', () => {
    expect([niceStep(0.7), niceStep(1.3), niceStep(3), niceStep(7), niceStep(0)]).toEqual([1, 2, 5, 10, 1])
    expect(axisOf([3, 7, 12])).toEqual({ max: 15, ticks: [0, 5, 10, 15] })
    expect(axisOf([95, 40])).toEqual({ max: 100, ticks: [0, 50, 100] })
    expect(axisOf([3, null])).toEqual({ max: 3, ticks: [0, 1, 2, 3] })
    expect(axisOf([])).toEqual({ max: 1, ticks: [0, 1] })
    expect(axisOf([0, 0])).toEqual({ max: 1, ticks: [0, 1] })
    expect(ENERGY_AXIS).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] })
  })

  it('słupki: równe przedziały, wysokość do osi, brak wartości bez słupka, zero jako kreska, ponad osią ucięte', () => {
    const p = barPlaces([50, null, 0, 150], 100, 400, 100, 0.2)
    expect(p[0]).toEqual({ x: 10, y: 50, w: 80, h: 50 })
    expect(p[1]).toBeNull()
    expect(p[2]).toEqual({ x: 210, y: 99, w: 80, h: 1 })
    expect(p[3]).toEqual({ x: 310, y: 0, w: 80, h: 100 })
    // A value too small to see keeps a hairline.
    expect(barPlaces([0.1], 100, 100, 100)[0]!.h).toBe(1)
  })

  it('noty „brak pomiaru” z liczbą mnogą', () => {
    expect(missingNote(1, 'energii')).toBe('Brak pomiaru: 1 dzień z wyłączonym modułem energii – nie jest liczony jako zero.')
    expect(missingNote(2, 'próśb')).toBe('Brak pomiaru: 2 dni z wyłączonym modułem próśb – nie są liczone jako zero.')
    expect(missingNote(5, 'próśb')).toContain('5 dni')
  })

  it('słupek ułożony: kolejne części od dołu', () => {
    expect(stackPlaces([2, 1, 0, 1], 4, 100)).toEqual([
      { y: 50, h: 50 },
      { y: 25, h: 25 },
      { y: 25, h: 0 },
      { y: 0, h: 25 }
    ])
  })
})

describe('teksty statystyk', () => {
  it('pory dnia co dwie godziny od 04:00, dni tygodnia, tydzień z datami', () => {
    expect([hourLabel(0), hourLabel(2), hourLabel(9), hourLabel(11)]).toEqual(['04–06', '08–10', '22–00', '02–04'])
    expect([weekdayShort(1), weekdayShort(7)]).toEqual(['pon.', 'niedz.'])
    expect(weekLabel('2026-10-26')).toBe('26.10–01.11')
  })

  it('liczby: energia z przecinkiem, odsetek, minuty; trafność opisuje czas, nie Ciebie', () => {
    expect([energyText(null), energyText(65), energyText(67.5)]).toEqual(['–', '65', '67,5'])
    expect([percentText(0), percentText(0.75), percentText(1)]).toEqual(['0%', '75%', '100%'])
    expect([minutesText(0), minutesText(45), minutesText(125)]).toEqual(['0 min', '45 min', '2 h 05 min'])
    expect([ratioText(1), ratioText(1.03), ratioText(1.29), ratioText(0.8)]).toEqual(['jak w planie', 'jak w planie', 'o 29% dłużej', 'o 20% krócej'])
  })

  it('nota o dniach: zamrożone, zakres dat, nieczytelne tylko gdy są', () => {
    expect(daysNote({ days: 12, first: '2026-10-12', last: '2026-10-25', unreadable: 0 })).toBe('dni zamrożone: 12 · 12.10.2026–25.10.2026')
    expect(daysNote({ days: 12, first: '2026-10-12', last: '2026-10-25', unreadable: 2 })).toBe('dni zamrożone: 12 · 12.10.2026–25.10.2026 · nieczytelne: 2')
    expect(daysNote({ days: 0, first: null, last: null, unreadable: 0 })).toBe('dni zamrożone: 0')
  })

  it('nota nad wykresami (D472): dni, co się liczy i kiedy aplikacja zamraża dzień – okno korekty 24 h, najpóźniej 72 h', () => {
    expect(statsNote({ days: 12, first: '2026-10-12', last: '2026-10-25', unreadable: 0 })).toBe(
      'dni zamrożone: 12 · 12.10.2026–25.10.2026. Liczą się tylko dni zamrożone – potwierdzone dane, bez dnia dzisiejszego. Aplikacja zamraża dzień po oknie korekty: 24 h od otwarcia następnego dnia, najpóźniej 72 h po końcu dnia.'
    )
    expect(statsNote({ days: 0, first: null, last: null, unreadable: 1 })).toContain('dni zamrożone: 0 · nieczytelne: 1. Liczą się tylko dni zamrożone')
    expect(statsNote({ days: 0, first: null, last: null, unreadable: 1 })).toContain('po oknie korekty: 24 h')
  })

  it('„za mało danych” poniżej progu, z liczbą dni; od progu – nic', () => {
    expect(tooLittle({ enough: false, days: 0, unreadable: 0 }, 3)).toMatch(/^Za mało danych: w tym okresie nie ma jeszcze zamrożonego dnia/)
    expect(tooLittle({ enough: false, days: 2, unreadable: 0 }, 3)).toMatch(/^Za mało danych: 2 dni zamrożone w tym okresie/)
    expect(tooLittle({ enough: true, days: 3, unreadable: 0 }, 3)).toBeNull()
  })

  it('„za mało danych” bez żadnego czytelnego dnia, choć są zamrożone: mówi o odczycie, nie o braku dni', () => {
    const t = tooLittle({ enough: false, days: 0, unreadable: 4 }, 3)!
    expect(t).toMatch(/^Za mało danych: nie da się teraz odczytać 4 zamrożonych dni \(np\. OneDrive jeszcze je pobiera\)/)
    expect(t).not.toContain('nie ma jeszcze zamrożonego dnia')
    expect(tooLittle({ enough: false, days: 0, unreadable: 1 }, 3)).toContain('odczytać 1 zamrożonego dnia')
  })

  it('wykres granic: najwyżej 12 ostatnich tygodni z liczbą pominiętych; etykiety krótkie, gdy tygodni jest dużo', () => {
    const weeks = Array.from({ length: 30 }, (_, i) => i)
    expect(lastWeeks(weeks)).toEqual({ shown: weeks.slice(18), hidden: 18 })
    expect(lastWeeks([1, 2, 3])).toEqual({ shown: [1, 2, 3], hidden: 0 })
    expect(MAX_WEEKS).toBe(12)
    expect(weekAxisLabel('2026-10-26', 4)).toBe('26.10–01.11')
    expect(weekAxisLabel('2026-10-26', 12)).toBe('26.10')
    // Twelve slots of the plot are wider than the longest label (about 29 units at 10.5 px).
    const html = renderToStaticMarkup(createElement(BoundaryChart, { weeks: Array.from({ length: 12 }, (_, i) => ({ week: `2026-${String(i + 1).padStart(2, '0')}-05`, kept: 1, broken: 0, noData: 0, free: 0 })), testId: 'b' }))
    const labels = [...html.matchAll(/text-anchor="middle"[^>]*>(\d\d\.\d\d[^<]*)</g)].map((m) => m[1]!)
    expect(labels).toHaveLength(12)
    expect(labels.every((l) => l.length === 5)).toBe(true)
  })

  it('słupki z danych: nazwy z ustawień, w rankingu „ciężej” tylko kategorie z dość odpowiedzi', () => {
    const name = (id: string) => id.toUpperCase()
    expect(meanBars([{ key: 2, checkins: 2, mean: 67.5 }, { key: 3, checkins: 0, mean: null }], hourLabel)).toEqual([
      { label: '08–10', value: 67.5, text: '67,5' },
      { label: '10–12', value: null, text: '–' }
    ])
    const felt = [
      { category: 'a', answers: 4, heavier: 3, share: 0.75, reliable: true },
      { category: 'b', answers: 1, heavier: 1, share: 1, reliable: false }
    ]
    expect(feltBars(felt, name)).toEqual([{ label: 'A', value: 0.75, text: '75%' }])
    expect(accuracyBars([{ category: 'a', blocks: 2, medianRatio: 1.1, accurate: 1, share: 0.5 }], name)).toEqual([{ label: 'A', value: 0.5, text: '50%' }])
    expect(personBars([{ person: 'x', count: 1, minutes: 20 }], name)).toEqual([{ label: 'X', value: 20, text: '20 min' }])
  })
})

describe('wykresy w SVG', () => {
  it('słupki z osią, wartościami i podpisami; pusty przedział bez słupka', () => {
    const bars = meanBars([{ key: 2, checkins: 2, mean: 70 }, { key: 3, checkins: 0, mean: null }], hourLabel)
    const html = renderToStaticMarkup(createElement(BarChart, { bars, axis: ENERGY_AXIS, format: String, label: 'Energia', testId: 'c' }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Energia"')
    expect(html.match(/data-testid="c-bar"/g)).toHaveLength(1)
    // The axis: five ticks with their values; the labels under the bars.
    for (const t of ['0', '25', '50', '75', '100']) expect(html).toContain(`>${t}</text>`)
    expect(html).toContain('>08–10</text>')
    expect(html).toContain('>70</text>')
  })

  it('granice na tydzień: części ułożone w słupek, legenda ze słowami (nie sam kolor)', () => {
    const html = renderToStaticMarkup(createElement(BoundaryChart, { weeks: [{ week: '2026-10-26', kept: 3, broken: 1, noData: 0, free: 2 }], testId: 'b' }))
    expect(html.match(/data-testid="b-bar"/g)).toHaveLength(3)
    for (const word of ['dotrzymane', 'niedotrzymane', 'bez danych', 'wolne']) expect(html).toContain(word)
    expect(html).toContain('26.10–01.11')
  })
})
