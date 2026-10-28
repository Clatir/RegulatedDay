/**
 * The game's words in the window (D322): the line of „Dziś”, the statuses of days, the cassettes' labels, the next item
 * of the room, the celebrations.
 */
import { describe, expect, it } from 'vitest'
import { celebrationText, gameLine, nextText, stepText, wayName, weekLabel, weekNumber } from '@renderer/features/game/gameText'

describe('gra w oknie (D322)', () => {
  it('linia „Dziś”: passa, nuty z odmianą, dzisiejsze „w toku” tylko gdy są', () => {
    expect(gameLine({ streak: 5, notes: { final: 142, pending: 6 }, notesToday: 6 })).toBe('Passa 5 · 142 nuty · dziś +6 w toku')
    expect(gameLine({ streak: 0, notes: { final: 1, pending: 0 }, notesToday: 0 })).toBe('Passa 0 · 1 nuta')
    expect(gameLine({ streak: 12, notes: { final: 25, pending: 0 }, notesToday: 0 })).toBe('Passa 12 · 25 nut')
  })

  it('statusy dni słowami, dzień otwarty na poprawki „w toku”', () => {
    expect(stepText({ move: 'up', frozen: true })).toBe('dotrzymany')
    expect(stepText({ move: 'broken', frozen: true })).toBe('niedotrzymany')
    expect(stepText({ move: 'protected', frozen: true })).toBe('dzień ochronny')
    expect(stepText({ move: 'held', frozen: false })).toBe('bez danych · w toku')
    expect(stepText({ move: 'skip', frozen: true })).toBe('poza grą')
  })

  it('kaseta: tydzień ISO z datami, ulubiona regeneracja po nazwie', () => {
    expect(weekNumber('2026-10-26')).toBe(44)
    expect(weekNumber('2026-12-28')).toBe(53)
    expect(weekNumber('2027-01-04')).toBe(1)
    expect(weekLabel('2026-10-26')).toBe('tydz. 44 · 26.10–1.11')
    const variants = [{ id: 'spacer', name: 'Spacer' }]
    expect(wayName('spacer', variants)).toBe('Spacer')
    expect(wayName('odcinam', variants)).toBe('Odcinam się')
    expect(wayName('regeneracja', variants)).toBe('Regeneracja')
    expect(wayName('x', variants)).toBe('sposób usunięty')
    expect(wayName(null, variants)).toBeNull()
  })

  it('następny element pokoju z brakującymi nutami; pełny pokój – nic', () => {
    expect(nextText({ unlocked: [], next: { item: { id: 'plyta-2', name: 'Druga płyta', notes: 180 }, missing: 23 } })).toBe('Następny: Druga płyta – jeszcze 23 nuty')
    expect(nextText({ unlocked: [], next: null })).toBeNull()
  })

  it('świętowanie: passa i nowy element pokoju, spokojnym zdaniem', () => {
    expect(celebrationText({ key: 'streak:2026-10-27:7', kind: 'streak', date: '2026-10-27', streak: 7, item: null })).toEqual({ title: 'Passa 7 dni', line: '7 dotrzymanych dni z rzędu – do 27.10.2026.' })
    expect(celebrationText({ key: 'room:plyta-1', kind: 'room', date: '2026-10-27', streak: null, item: { id: 'plyta-1', name: 'Pierwsza płyta', notes: 30 } }).title).toBe('Nowe w pokoju: Pierwsza płyta')
  })
})
