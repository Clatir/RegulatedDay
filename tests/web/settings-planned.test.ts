/**
 * Zaplanowane zmiany ustawień „co → od kiedy” (UX14, E2): każda zmiana z datą po dzisiejszej pokazuje pola i wartości, które
 * zmienia; zmiana „od dziś”, z przeszłości i z dzisiejszą datą nie jest zaplanowana.
 */
import { describe, expect, it } from 'vitest'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import type { SettingsChange } from '@shared/model/settings'
import { plannedChanges } from '@renderer/features/settings/plannedChanges'

const ch = (id: string, from: string, patch: Record<string, unknown>, extra: Partial<SettingsChange> = {}): SettingsChange => ({ id, from, at: null, made: 1, patch, ...extra })
const names = { categories: { analiza: 'Analiza' } as Record<string, string> }

describe('plannedChanges', () => {
  it('tylko zmiany z datą po dzisiejszej, od najbliższej', () => {
    const list = plannedChanges(
      [ch('a', '2026-11-20', { reserve: 20 }), ch('b', '2026-11-21', { reserve: 21 }), ch('d', '2026-11-30', { reserve: 25 }), ch('c', '2026-11-25', { reserve: 22 }), ch('e', '2026-11-22', { reserve: 23 }, { at: 5 })],
      '2026-11-21',
      names
    )
    expect(list.map((c) => c.id)).toEqual(['c', 'd'])
  })

  it('pole z wartością po ludzku: liczba, czas, czas trwania, przełącznik', () => {
    const [c] = plannedChanges([ch('a', '2026-11-25', { reserve: 20, dayTypes: { zwykly: { budgetMin: 420, maxMin: 19 * 60 } }, awayChain: true, reminders: { morningAfterWakeMin: 0 } })], '2026-11-21', names)
    expect(c!.from).toBe('2026-11-25')
    const by = Object.fromEntries(c!.items.map((i) => [i.label, i.value]))
    expect(by['Rezerwa energii']).toBe('20')
    expect(by['Zwykły: budżet pracy']).toBe('7 h')
    expect(by['Zwykły: maksimum granicy']).toBe('19:00')
    expect(by['Bloki poza komputerem jednym ciągiem']).toBe('włączone')
    expect(by['Plan poranny po pobudce']).toBe('0 min')
  })

  it('typy dni tygodnia i podkategorie – krótki opis, nigdy surowy identyfikator', () => {
    const [c] = plannedChanges([ch('a', '2026-11-25', { weekTypes: ['zwykly', 'zwykly', 'zwykly', 'zwykly', 'zwykly', 'wolne', 'wolne'], categories: { analiza: { cost: 2 }, nieznana: { cost: 1 } } })], '2026-11-21', names)
    const labels = c!.items.map((i) => i.label)
    expect(labels).toContain('Typy dni tygodnia')
    expect(labels).toContain('Podkategoria „Analiza”')
    expect(labels).toContain('Podkategoria usunięta')
    expect(labels.join(' ')).not.toContain('nieznana')
  })

  it('zmiana, której pola nie znamy, i tak jest na liście (ogólny opis)', () => {
    const [c] = plannedChanges([ch('a', '2026-11-25', { przyszlePole: 3 })], '2026-11-21', names)
    expect(c!.items).toEqual([{ label: 'Inne ustawienie', value: '' }])
  })

  it('„Wycofaj” ma każda zmiana poza zmianą warstwy sesji (przeniesienie do szablonów, D511)', () => {
    const list = plannedChanges(
      [ch('a', '2026-11-25', { reserve: 20 }), ch(`${SESSIONS_CHANGE_ID}-2026-11-28`, '2026-11-28', { sessions: [] }), ch('s', '2026-11-29', { dayTypes: { zwykly: { sessions: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no'] } } })],
      '2026-11-21',
      names
    )
    expect(list.map((c) => [c.id, c.withdrawable])).toEqual([
      ['a', true],
      [`${SESSIONS_CHANGE_ID}-2026-11-28`, false],
      ['s', false]
    ])
  })

  it('brak zaplanowanych: pusta lista', () => {
    expect(plannedChanges([ch('a', '2026-11-20', { reserve: 20 })], '2026-11-21', names)).toEqual([])
  })
})
