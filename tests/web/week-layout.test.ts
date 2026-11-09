/**
 * The layout of „Tydzień” (D356): the axis of hours in pixels, a block's place on it, blocks that overlap side by side,
 * the month whose goals the top of the page shows.
 */
import { describe, expect, it } from 'vitest'
import { axisHeight, axisRange, axisY, blockSpan, goalsMonthOfWeek, hourMarks, laneLayout, WEEK_MIN_BLOCK_PX, WEEK_PPM } from '@renderer/features/week/weekLayout'

describe('oś godzin tygodnia', () => {
  it('obejmuje pełne godziny wokół zakresu tygodnia', () => {
    expect(axisRange(6 * 60 - 30, 22 * 60 + 30)).toEqual({ lo: 5 * 60, hi: 23 * 60 })
    expect(axisRange(360, 1320)).toEqual({ lo: 360, hi: 1320 })
    // Night after midnight (logical minutes over 1440) stays on the same axis.
    expect(axisRange(420, 1500 + 10)).toEqual({ lo: 420, hi: 1560 })
  })

  it('minuty na piksele: 0,8 px na minutę od góry osi; godziny co 60 minut włącznie z końcem', () => {
    expect(axisY(300, 300)).toBe(0)
    expect(axisY(360, 300)).toBeCloseTo(60 * WEEK_PPM)
    expect(axisHeight(300, 1380)).toBe(Math.round(1080 * WEEK_PPM))
    expect(hourMarks(300, 480)).toEqual([300, 360, 420, 480])
  })

  it('blok: góra i wysokość z minut; krótki nie schodzi poniżej linii tekstu', () => {
    const b = blockSpan({ startMin: 480, endMin: 540 }, 360)
    expect(b.top).toBeCloseTo(120 * WEEK_PPM)
    expect(b.height).toBeCloseTo(60 * WEEK_PPM - 1)
    expect(blockSpan({ startMin: 480, endMin: 485 }, 360).height).toBe(WEEK_MIN_BLOCK_PX)
  })
})

describe('bloki obok siebie w jednej kolumnie dnia', () => {
  const at = (startMin: number, endMin: number, id: string) => ({ id, startMin, endMin })
  const byId = (l: ReturnType<typeof laneLayout<ReturnType<typeof at>>>) => Object.fromEntries(l.map((x) => [x.item.id, [x.lane, x.lanes]]))

  it('bloki jeden po drugim zajmują całą szerokość', () => {
    expect(byId(laneLayout([at(480, 540, 'a'), at(540, 600, 'b'), at(700, 760, 'c')]))).toEqual({ a: [0, 1], b: [0, 1], c: [0, 1] })
  })

  it('nakładające się dzielą szerokość, reszta dnia ma pełną', () => {
    expect(byId(laneLayout([at(480, 600, 'tlo'), at(500, 560, 'x'), at(700, 760, 'c')]))).toEqual({ tlo: [0, 2], x: [1, 2], c: [0, 1] })
  })

  it('łańcuch nakładań ma wspólną liczbę pasów; pas zwolniony jest używany ponownie', () => {
    const l = laneLayout([at(480, 540, 'a'), at(500, 620, 'b'), at(545, 580, 'c')])
    expect(byId(l)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] })
  })

  it('wejście w dowolnej kolejności, bez zmiany tablicy wejściowej', () => {
    const input = [at(500, 560, 'x'), at(480, 600, 'tlo')]
    expect(byId(laneLayout(input))).toEqual({ tlo: [0, 2], x: [1, 2] })
    expect(input.map((i) => i.id)).toEqual(['x', 'tlo'])
  })
})

describe('miesiąc celów na górze „Tydzień”', () => {
  it('tydzień z dzisiejszym dniem – bieżący miesiąc, także gdy dziś jest w ostatnich dniach miesiąca', () => {
    // Week 26.10–1.11.2026 holds Sunday 1.11 (the Thursday is in October).
    expect(goalsMonthOfWeek('2026-10-26', '2026-11-01')).toBe('2026-11')
    expect(goalsMonthOfWeek('2026-10-26', '2026-10-26')).toBe('2026-10')
    expect(goalsMonthOfWeek('2026-11-02', '2026-11-09')).toBe('2026-11')
  })

  it('inny tydzień – miesiąc jego czwartku (na przełomie ten, do którego należą cztery dni)', () => {
    // 26.10–1.11: Thursday 29.10 – October, whatever today is.
    expect(goalsMonthOfWeek('2026-10-26', '2026-11-20')).toBe('2026-10')
    // 30.11.2026 is a Monday; the week to 6.12 has Thursday 3.12 – December.
    expect(goalsMonthOfWeek('2026-11-30', '2026-11-09')).toBe('2026-12')
    // 28.12.2026–3.01.2027: Thursday 31.12 – December; the next week's Thursday 7.01 – January.
    expect(goalsMonthOfWeek('2026-12-28', '2026-11-09')).toBe('2026-12')
    expect(goalsMonthOfWeek('2027-01-04', '2026-11-09')).toBe('2027-01')
  })
})
