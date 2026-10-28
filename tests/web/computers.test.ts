/**
 * „Komputery” in the settings (A3-13, A8-07): what a row says of a computer – how fresh its data are here, asleep,
 * closed, forgotten – and rd.json with a computer forgotten or taken back.
 */
import { describe, expect, it } from 'vitest'
import type { ComputerRow } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import { computerStatus, freshnessText, withForgotten } from '@renderer/features/settings/ComputersSection'

const now = Date.parse('2026-10-28T14:40:00+01:00')
const row = (o: Partial<ComputerRow>): ComputerRow => ({ id: 'pcb', name: 'PC B', self: false, seenAt: now - 40_000, state: 'used', forgotten: false, lastPresence: now - 40_000, ...o })

describe('wiersz komputera', () => {
  it('„dane sprzed 40 s”, minuty, uśpiony od godziny, zamknięty, zapomniany, ten komputer', () => {
    expect(computerStatus(row({}), now)).toBe('dane sprzed 40 s')
    expect(computerStatus(row({ seenAt: now - 5 * 60_000 }), now)).toBe('dane sprzed 5 min')
    expect(computerStatus(row({ seenAt: Date.parse('2026-10-28T14:20:00+01:00') }), now)).toBe('uśpiony – brak zmian od 14:20')
    expect(computerStatus(row({ state: 'closed' }), now)).toBe('zamknięty')
    expect(computerStatus(row({ forgotten: true }), now)).toBe('zapomniany – nic na niego nie czeka')
    expect(computerStatus(row({ self: true }), now)).toBe('ten komputer')
  })

  it('„Zapomnij” zapisuje w rd.json jego „ostatnią obecność”; „Przywróć” ją usuwa; inne zostają', () => {
    const raw = { schema: 1, forgotten: { old: { lastPresence: 5, at: 6 } } }
    const forgot = withForgotten(raw, 'pcb', { lastPresence: 7, at: 8 })
    expect(rdFrom(forgot).forgotten).toEqual({ old: { lastPresence: 5, at: 6 }, pcb: { lastPresence: 7, at: 8 } })
    expect(rdFrom(withForgotten(forgot, 'pcb', null)).forgotten).toEqual({ old: { lastPresence: 5, at: 6 } })
  })
})

describe('znacznik „dane z … sprzed …” w widoku dnia (A8-07)', () => {
  it('tylko inne komputery na chodzie – nie ten, nie zapomniane, nie zamknięte, nie uśpione', () => {
    const rows = [row({ self: true, id: 'pca', name: 'PC A' }), row({}), row({ id: 'lap', name: 'Laptop', seenAt: now - 3 * 60_000 }), row({ id: 'old', forgotten: true }), row({ id: 'off', state: 'closed' }), row({ id: 'zzz', seenAt: now - 11 * 60_000 })]
    expect(freshnessText(rows, now)).toBe('dane z PC B sprzed 40 s · dane z Laptop sprzed 3 min')
    expect(freshnessText([row({ self: true })], now)).toBeNull()
  })
})
