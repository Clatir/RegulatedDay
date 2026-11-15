/**
 * The line over a selection (D527, D524): the count, the time together, the cost in the points of the four pools G · E · B · C
 * (use with a minus, regeneration with a plus, none „0”), the variants without energy and of the days.
 */
import { describe, expect, it } from 'vitest'
import { NBSP } from '@shared/format'
import { daysSummary, groupSummary, poolPoints, pointsText, type SummaryItem } from '@shared/groupSummary'
import type { Costs } from '@shared/model/categories'

const c = (head: number, emotions: number, senses: number, body: number): Costs => ({ head, emotions, senses, body })

describe('„Zaznaczone: 4 · 3 h 20 min · energia −18 G · −6 E · −4 B · −2 C”', () => {
  it('liczba, łączny czas i koszt w czterech pulach w kolejności G E B C (zużycie z minusem)', () => {
    // 60 min · 5 G, 60 min · 5 G, 40 min · 3 G, 40 min · 3 G  →  (300 + 300 + 120 + 120) / 60 = 14
    const items: SummaryItem[] = [
      { minutes: 60, costs: c(5, 2, 1, 1) },
      { minutes: 60, costs: c(5, 2, 1, 1) },
      { minutes: 40, costs: c(3, 1, 3, 0) },
      { minutes: 40, costs: c(3, 1, 3, 0) }
    ]
    expect(groupSummary(items)).toBe('Zaznaczone: 4 · 3 h 20 min · energia −14 G · −5 E · −6 B · −2 C')
  })

  it('format ze specyfikacji, litera po liczbie, cztery pule zawsze', () => {
    // 200 min together; elements of 0 min add nothing, one without a cost adds no energy.
    const items: SummaryItem[] = [
      { minutes: 100, costs: c(5, 2, 1, 1) },
      { minutes: 100, costs: c(5, 2, 1, 0) },
      { minutes: 0, costs: c(5, 5, 5, 5) },
      { minutes: 0, costs: null }
    ]
    expect(groupSummary(items)).toBe('Zaznaczone: 4 · 3 h 20 min · energia −17 G · −7 E · −3 B · −2 C')
  })

  it('regeneracja z plusem, zero jako „0” (bez minusa), cztery pule nawet gdy zero', () => {
    const items: SummaryItem[] = [
      { minutes: 60, costs: c(-3, 0, 2, 0) },
      { minutes: 60, costs: c(-1, 0, -2, 0) }
    ]
    expect(groupSummary(items)).toBe('Zaznaczone: 2 · 2 h · energia +4 G · 0 E · 0 B · 0 C')
  })

  it('zaokrągla sumę do całości, połówki od zera (−2,5 to „+3”, 2,5 to „−3”)', () => {
    expect(poolPoints([{ minutes: 30, costs: c(5, -5, 0, 0) }])).toEqual({ head: 3, emotions: -3, senses: 0, body: 0 })
    expect(poolPoints([{ minutes: 20, costs: c(1, -1, 0, 0) }])).toEqual({ head: 0, emotions: 0, senses: 0, body: 0 })
    expect(Object.is(poolPoints([{ minutes: 20, costs: c(-1, 0, 0, 0) }]).head, 0)).toBe(true)
    // Rounded once, from the sum – not per element: 2 × 0,5 = 1, not 2 × 1.
    expect(poolPoints([{ minutes: 30, costs: c(1, 0, 0, 0) }, { minutes: 30, costs: c(1, 0, 0, 0) }]).head).toBe(1)
  })

  it('element bez kosztu (sprawa bez kategorii) dokłada czas, nie energię', () => {
    const items: SummaryItem[] = [
      { minutes: 45, costs: null },
      { minutes: 60, costs: c(2, 0, 0, 0) }
    ]
    expect(groupSummary(items)).toBe('Zaznaczone: 2 · 1 h 45 min · energia −2 G · 0 E · 0 B · 0 C')
  })

  it('moduł energii wyłączony – bez części „energia”', () => {
    const items: SummaryItem[] = [
      { minutes: 30, costs: c(1, 1, 1, 1) },
      { minutes: 15, costs: c(1, 1, 1, 1) }
    ]
    expect(groupSummary(items, { energy: false })).toBe('Zaznaczone: 2 · 45 min')
  })

  it('mniej niż dwa elementy – nic', () => {
    expect(groupSummary([])).toBeNull()
    expect(groupSummary([{ minutes: 30, costs: c(1, 1, 1, 1) }])).toBeNull()
  })

  it('pointsText: zużycie „−”, regeneracja „+”, zero „0”; duże liczby z twardą spacją', () => {
    expect(pointsText(18)).toBe('−18')
    expect(pointsText(-4)).toBe('+4')
    expect(pointsText(0)).toBe('0')
    expect(pointsText(1234)).toBe(`−1${NBSP}234`)
  })
})

describe('„Zaznaczone dni: 7”', () => {
  it('od dwóch dni; mniej – nic', () => {
    expect(daysSummary(7)).toBe('Zaznaczone dni: 7')
    expect(daysSummary(2)).toBe('Zaznaczone dni: 2')
    expect(daysSummary(1)).toBeNull()
    expect(daysSummary(0)).toBeNull()
  })
})
