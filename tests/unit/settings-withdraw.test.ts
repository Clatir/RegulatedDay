/**
 * „Wycofaj” zaplanowanej zmiany ustawień (UX14, E2): zmiana z datą po dzisiejszej znika z rd.json „settings”, więc od jej daty
 * obowiązuje to, co przed nią (i każda późniejsza zmiana jak była); zmiana, której data nadeszła, „od dziś” i zmiana warstwy sesji
 * (przeniesienie do szablonów, D511) – nie. Zapis to jedno pole listy (`settings.#id`) z bazą = zmiana, jak każda zmiana pola.
 */
import { describe, expect, it } from 'vitest'
import { deepEqual, editStands, inverseEdit, recordEdit, setAt, valueAt } from '@shared/data/merge'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import { settingsOn, type SettingsChange } from '@shared/model/settings'
import { isPlannedChange, withdrawnRd } from '@shared/model/settingsWithdraw'

const TODAY = '2026-11-21'
const ch = (id: string, from: string, patch: Record<string, unknown>, extra: Partial<SettingsChange> = {}): SettingsChange => ({ id, from, at: null, made: 1, patch, ...extra })
const changesOf = (raw: Record<string, unknown>) => raw.settings as SettingsChange[]

describe('isPlannedChange', () => {
  it('tylko zmiana od dnia po dzisiejszym i bez chwili „od dziś”', () => {
    expect(isPlannedChange(ch('a', '2026-11-22', {}), TODAY)).toBe(true)
    expect(isPlannedChange(ch('a', TODAY, {}), TODAY)).toBe(false)
    expect(isPlannedChange(ch('a', '2026-11-20', {}), TODAY)).toBe(false)
    expect(isPlannedChange(ch('a', '2026-11-22', {}, { at: 5 }), TODAY)).toBe(false)
  })
})

describe('withdrawnRd', () => {
  const before = { reserve: 12 }
  const raw = {
    schema: 1,
    przyszle: { x: 1 },
    settings: [ch('a', '2026-11-01', before), ch('z', '2026-11-25', { reserve: 20, awayChain: true }), ch('b', '2026-11-30', { awayChain: false })]
  }

  it('zmiana znika z listy; od jej daty obowiązuje to, co przed nią, a późniejsza zmiana zostaje', () => {
    const out = withdrawnRd(raw, 'z', TODAY)
    if (!('raw' in out)) throw new Error('odmowa')
    expect(changesOf(out.raw).map((c) => c.id)).toEqual(['a', 'b'])
    expect(out.raw.przyszle).toEqual({ x: 1 })
    expect(out.change.id).toBe('z')
    // From its date: what was in force the day before it.
    expect(settingsOn(changesOf(out.raw), '2026-11-25')).toEqual(settingsOn(changesOf(raw), '2026-11-24'))
    expect(settingsOn(changesOf(out.raw), '2026-11-25').reserve).toBe(12)
    // A later change still applies from its own date.
    expect(settingsOn(changesOf(out.raw), '2026-11-30').awayChain).toBe(false)
    // The days before it never change.
    expect(settingsOn(changesOf(out.raw), TODAY)).toEqual(settingsOn(changesOf(raw), TODAY))
  })

  it('rekord nie jest zmieniany w miejscu', () => {
    const copy = structuredClone(raw)
    withdrawnRd(raw, 'z', TODAY)
    expect(raw).toEqual(copy)
  })

  it('zmiana, której data nadeszła (dziś albo wcześniej), i „od dziś” – odmowa „obowiązuje”', () => {
    expect(withdrawnRd(raw, 'a', TODAY)).toMatchObject({ refused: 'inForce' })
    expect(withdrawnRd(raw, 'z', '2026-11-25')).toMatchObject({ refused: 'inForce' })
    const today = { settings: [ch('t', '2026-11-22', { reserve: 3 }, { at: 1_000 })] }
    expect(withdrawnRd(today, 't', TODAY)).toMatchObject({ refused: 'inForce' })
  })

  it('zmiany, której już nie ma (wycofana na innym komputerze), albo nieczytelnej – odmowa „nie ma”', () => {
    expect(withdrawnRd(raw, 'nieznana', TODAY)).toEqual({ refused: 'gone' })
    expect(withdrawnRd({ settings: [{ id: 'q', from: 'jutro', patch: {} }] }, 'q', TODAY)).toEqual({ refused: 'gone' })
    expect(withdrawnRd({ schema: 1 }, 'z', TODAY)).toEqual({ refused: 'gone' })
  })

  it('zmiana warstwy sesji (przeniesienie do szablonów i zmiana, którą ono opróżniło) – odmowa „sesje”', () => {
    const moved = {
      settings: [
        ch(SESSIONS_CHANGE_ID, '2026-11-10', { sessions: [] }),
        ch(`${SESSIONS_CHANGE_ID}-2026-11-28`, '2026-11-28', { sessions: [] }),
        ch('s', '2026-11-28', { dayTypes: { zwykly: { sessions: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no'] } } })
      ]
    }
    expect(withdrawnRd(moved, `${SESSIONS_CHANGE_ID}-2026-11-28`, TODAY)).toMatchObject({ refused: 'sessions' })
    expect(withdrawnRd(moved, 's', TODAY)).toMatchObject({ refused: 'sessions' })
  })

  it('zapis: jedno pole `settings.#id` z bazą = zmiana; „Cofnij” (odwrotna edycja) kładzie ją z powrotem', () => {
    const out = withdrawnRd(raw, 'z', TODAY)
    if (!('raw' in out)) throw new Error('odmowa')
    const entry = recordEdit('rd.json', raw, out.raw)!
    expect(entry.edits).toEqual([{ path: ['settings', '#z'], base: raw.settings[1], value: undefined }])
    // As the queue lays it: the field still as you saw it – removed.
    let file: unknown = raw
    for (const f of entry.edits) if (deepEqual(valueAt(file, f.path), f.base)) file = setAt(file, f.path, f.value)
    expect(changesOf(file as Record<string, unknown>).map((c) => c.id)).toEqual(['a', 'b'])
    expect(editStands(entry, file as Record<string, unknown>, null)).toBe(true)
    const back = inverseEdit(entry, file as Record<string, unknown>, null)!
    for (const f of back.edits) if (deepEqual(valueAt(file, f.path), f.base)) file = setAt(file, f.path, f.value)
    expect(settingsOn(changesOf(file as Record<string, unknown>), '2026-11-25')).toEqual(settingsOn(changesOf(raw), '2026-11-25'))
  })
})
