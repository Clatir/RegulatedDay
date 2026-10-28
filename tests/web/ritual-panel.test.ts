/**
 * The ritual's card (D318): what a ✓ changes in words, and which rows still wait for a choice (the close says how many
 * stay as written).
 */
import { describe, expect, it } from 'vitest'
import type { RitualRow } from '@shared/engine/ritual'
import { closedText, effectText, untouched } from '@renderer/features/ritual/RitualPanel'

describe('karta rytuału', () => {
  it('skutek ✓ słowami: każda nagroda i pula, którą zmienia; „bez zmian”; wieczorem „(prognoza)”', () => {
    expect(effectText({ changes: [{ kind: 'boundary', before: 'noData', after: 'kept' }], forecast: false })).toBe('skutek: granica dotrzymana zamiast bez danych')
    expect(effectText({ changes: [{ kind: 'projects', deltaMin: 70, limitMin: 240 }, { kind: 'pool', deltaMin: -30 }], forecast: true })).toBe('skutek: projekty +1 h 10 min z limitu 4 h, pula −30 min (prognoza)')
    expect(effectText({ changes: [], forecast: false })).toBe('skutek: bez zmian')
    expect(effectText(undefined)).toBeNull()
  })

  it('wiersze bez wyboru: niepotwierdzony koniec pracy, granica, pominięty blok, prośba bez osoby, wiersz bez odpowiedzi', () => {
    const base = { id: 'x', afterClose: false }
    const rows: RitualRow[] = [
      { ...base, kind: 'workEnd', end: 600, confirmed: false, explain: null },
      { ...base, kind: 'workEnd', end: 600, confirmed: true, explain: null },
      { ...base, kind: 'boundary', proposal: 700, approved: null },
      { ...base, kind: 'skipped', block: 'b', fixed: true, from: 0, to: 60, used: null },
      { ...base, kind: 'person', request: 'r', from: 100, to: 120 },
      { ...base, kind: 'rest', from: 800, to: 900, marked: [], answered: false },
      { ...base, kind: 'rest', from: 800, to: 900, marked: [], answered: true }
    ]
    expect(rows.map(untouched)).toEqual([true, false, true, true, true, true, false])
  })

  it('godzina zamknięcia dnia z minuty dnia (19:00 to 900 minut od 04:00), także po 00:00 z „+1”', () => {
    expect(closedText('2026-10-28', 900)).toBe('dzień zamknięty o 19:00')
    expect(closedText('2026-10-28', 1230)).toBe('dzień zamknięty o 00:30 +1')
  })
})
