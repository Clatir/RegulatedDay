/**
 * A new block taken from the grid of time (D366): the minute under the pointer on the 5-min grid, the range of a drag over
 * an empty place (either way, never under 5 min), the place of the small window beside a column of „Tydzień”.
 */
import { describe, expect, it } from 'vitest'
import { DRAG_FROM_PX, gridMinute, gridRange, minuteAtPx } from '@renderer/features/plan/gridCreate'
import { WEEK_PPM, popoverPlace } from '@renderer/features/week/weekLayout'

const LO = 6 * 60

describe('minuta z pozycji (D366)', () => {
  it('pozycja od góry kolumny to minuta osi, na siatce 5 min', () => {
    expect(minuteAtPx(0, LO, 1.1)).toBe(LO)
    expect(gridMinute(0, LO, 1.1)).toBe(LO)
    // 4 h under the top at 1.1 px a minute: exactly 10:00.
    expect(gridMinute(240 * 1.1, LO, 1.1)).toBe(10 * 60)
    // 1.9 px at 0.8 px a minute is 2.4 min: rounded to the nearest 5.
    expect(gridMinute(240 * WEEK_PPM + 1.9, LO, WEEK_PPM)).toBe(10 * 60)
    expect(gridMinute(240 * WEEK_PPM + 2.5, LO, WEEK_PPM)).toBe(10 * 60 + 5)
    expect(gridMinute(240 * WEEK_PPM - 1, LO, WEEK_PPM)).toBe(10 * 60)
  })
  it('próg przeciągnięcia to 4 px', () => {
    expect(DRAG_FROM_PX).toBe(4)
  })
})

describe('zakres z przeciągnięcia po pustym miejscu (D366)', () => {
  const at = (h: number, m = 0) => (h * 60 + m - LO) * WEEK_PPM
  it('od 10:00 do 11:30 to blok 90 min', () => {
    expect(gridRange(at(10), at(11, 30), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 600, endMin: 690 })
  })
  it('przeciągnięcie w górę daje ten sam zakres', () => {
    expect(gridRange(at(11, 30), at(10), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 600, endMin: 690 })
  })
  it('oba końce na siatce 5 min', () => {
    const r = gridRange(at(10, 2), at(10, 58), LO, 24 * 60, WEEK_PPM)
    expect(r.startMin % 5).toBe(0)
    expect(r.endMin % 5).toBe(0)
    expect(r).toEqual({ startMin: 600, endMin: 660 })
  })
  it('najkrótszy blok to 5 min – start zostaje', () => {
    expect(gridRange(at(10), at(10), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 600, endMin: 605 })
    expect(gridRange(at(10, 1), at(10, 3), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 600, endMin: 605 })
    expect(gridRange(at(10, 6), at(10, 8), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 605, endMin: 610 })
  })
  it('poza osią – zakres zostaje na osi', () => {
    expect(gridRange(-40, at(7), LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: LO, endMin: 7 * 60 })
    expect(gridRange(at(23), at(23) + 900, LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 23 * 60, endMin: 24 * 60 })
  })
  it('przy dolnym brzegu osi blok ma co najmniej 5 min', () => {
    expect(gridRange(at(24), at(24) + 50, LO, 24 * 60, WEEK_PPM)).toEqual({ startMin: 24 * 60, endMin: 24 * 60 + 5 })
  })
})

describe('miejsce okienka nowego bloku w „Tygodniu” (D366)', () => {
  // The window is 264 px wide; the grid 1000 px; a column 120 px wide.
  it('po prawej od kolumny, gdy się mieści', () => {
    expect(popoverPlace({ gridWidth: 1000, colLeft: 100, colRight: 220, top: 50, width: 264 })).toEqual({ left: 224, top: 50 })
  })
  it('po lewej od kolumny, gdy z prawej brakuje miejsca', () => {
    expect(popoverPlace({ gridWidth: 1000, colLeft: 800, colRight: 920, top: 50, width: 264 })).toEqual({ left: 532, top: 50 })
  })
  it('nigdy poza siatką ani nad nią', () => {
    expect(popoverPlace({ gridWidth: 300, colLeft: 100, colRight: 220, top: -20, width: 264 })).toEqual({ left: 0, top: 0 })
  })
})
