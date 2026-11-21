/**
 * „Wycofaj” zaplanowanej zmiany ustawień (UX14, E2): zmiana z datą po dzisiejszej znika z rd.json „settings”, więc od jej daty
 * obowiązuje to, co przed nią (i każda późniejsza zmiana jak była); zmiana, której data nadeszła, „od dziś” i zmiana warstwy sesji
 * (przeniesienie do szablonów, D511) – nie. Zapis to jedno pole listy (`settings.#id`) z bazą = zmiana, jak każda zmiana pola.
 */
import { describe, expect, it } from 'vitest'
import { deepEqual, editStands, inverseEdit, recordEdit, setAt, valueAt } from '@shared/data/merge'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import { settingsOn, type SettingsChange } from '@shared/model/settings'
import { isPlannedChange, plannedAddition, withdrawRefusal, withdrawnRd, withoutPlannedCategory } from '@shared/model/settingsWithdraw'

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

  it('późniejsza zmiana tej samej listy (typy dni tygodnia, warianty) trzyma wartość, którą zmiana zmieniła – odmowa „później”, z tą zmianą', () => {
    const week = (mon: string, sat: string) => [mon, 'zwykly', 'zwykly', 'zwykly', 'zwykly', sat, 'weekend']
    // `a`: Saturday → „wolne”.
    const a = ch('a', '2026-11-25', { weekTypes: week('zwykly', 'wolne'), reserve: 3 })
    // `b` keeps the Saturday of `a` (and changes Monday): withdrawing `a` would leave its Saturday from the date of `b`.
    const b = ch('b', '2026-11-30', { weekTypes: week('wolne', 'wolne') })
    expect(withdrawnRd({ settings: [a, b] }, 'a', TODAY)).toMatchObject({ refused: 'later', later: { id: 'b' } })
    // Whoever made it and when (`made` of another computer is no order of making): the same.
    expect(withdrawnRd({ settings: [a, { ...b, made: 0 }] }, 'a', TODAY)).toMatchObject({ refused: 'later', later: { id: 'b' } })
    // The later one goes first; then `a` can go.
    const first = withdrawnRd({ settings: [a, b] }, 'b', TODAY)
    if (!('raw' in first)) throw new Error('odmowa')
    expect('raw' in withdrawnRd(first.raw, 'a', TODAY)).toBe(true)
    // `b` brings Saturday back and changes Monday: it holds nothing of `a` – `a` can go, `b` stays as it was.
    const back = ch('b2', '2026-11-30', { weekTypes: week('wolne', 'weekend') })
    const out = withdrawnRd({ settings: [a, back] }, 'a', TODAY)
    if (!('raw' in out)) throw new Error('odmowa')
    expect(settingsOn(changesOf(out.raw), '2026-11-30').weekTypes).toEqual(week('wolne', 'weekend'))
    // The first later change that holds it is named, past one that does not.
    expect(withdrawnRd({ settings: [a, back, { ...b, id: 'b3', from: '2026-12-05' }] }, 'a', TODAY)).toMatchObject({ refused: 'later', later: { id: 'b3' } })
    // A later change of another field, or a single value: no refusal.
    expect('raw' in withdrawnRd({ settings: [a, ch('c', '2026-11-30', { reserve: 5 })] }, 'a', TODAY)).toBe(true)
  })

  it('warianty podkategorii: pole po polu – późniejsza lista, która trzyma dodany wariant albo zmienione pole wariantu, to odmowa', () => {
    const costs = { head: 2, emotions: 0, senses: 0, body: 0 }
    const v1 = ch('v1', '2026-11-25', { categories: { analiza: { variants: [{ id: 'x', name: 'X' }] } } })
    const v2 = ch('v2', '2026-11-27', { categories: { analiza: { variants: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }] } } })
    expect(withdrawnRd({ settings: [v1, v2] }, 'v1', TODAY)).toMatchObject({ refused: 'later', later: { id: 'v2' } })
    // `x` renamed later: it is still there – the variant `v1` added stays from that date, so `v1` waits for it.
    const renamed = ch('v2', '2026-11-27', { categories: { analiza: { variants: [{ id: 'x', name: 'X2' }, { id: 'y', name: 'Y' }] } } })
    expect(withdrawnRd({ settings: [v1, renamed] }, 'v1', TODAY)).toMatchObject({ refused: 'later', later: { id: 'v2' } })
    // A field of a variant that was there: a later list with that field as `c` made it, another field changed – holds it.
    const base = ch('b0', '2026-11-01', { categories: { analiza: { variants: [{ id: 'x', name: 'X', place: 'computer' }] } } })
    const cost = ch('c1', '2026-11-25', { categories: { analiza: { variants: [{ id: 'x', name: 'X', place: 'computer', costs }] } } })
    const keeps = ch('c2', '2026-11-27', { categories: { analiza: { variants: [{ id: 'x', name: 'X nowa', place: 'computer', costs }] } } })
    expect(withdrawnRd({ settings: [base, cost, keeps] }, 'c1', TODAY)).toMatchObject({ refused: 'later', later: { id: 'c2' } })
    // The same later list with the cost given back to „jak podkategoria”: nothing of `c1` in it – `c1` goes.
    const gives = ch('c2', '2026-11-27', { categories: { analiza: { variants: [{ id: 'x', name: 'X nowa', place: 'computer', costs: null }] } } })
    expect('raw' in withdrawnRd({ settings: [base, cost, gives] }, 'c1', TODAY)).toBe(true)
    // Another subcategory's list: no refusal.
    expect('raw' in withdrawnRd({ settings: [v1, ch('v3', '2026-11-27', { categories: { inna: { variants: [] } } })] }, 'v1', TODAY)).toBe(true)
  })

  it('lista późniejszej zmiany czytana bez wycofywanej (jak po wycofaniu): pole, którego nie pisze, nie bierze jej wartości', () => {
    const week = (sat: string) => ['zwykly', 'zwykly', 'zwykly', 'zwykly', 'zwykly', sat, 'weekend']
    const a = ch('a', '2026-11-25', { weekTypes: week('wolne') })
    // Saturday unreadable in `b`: read with `a` it would be `a`'s „wolne”, without it – what was before (`weekend`).
    const b = ch('b', '2026-11-30', { weekTypes: ['wolne', 'zwykly', 'zwykly', 'zwykly', 'zwykly', 'nieznany', 'weekend'] })
    expect('raw' in withdrawnRd({ settings: [a, b] }, 'a', TODAY)).toBe(true)
  })

  it('lista, której ta wersja nie zna, porównywana tak, jak jest zapisana', () => {
    const a = ch('a', '2026-11-25', { przyszle: { lista: ['p', 'q'] } })
    const holds = ch('b', '2026-11-30', { przyszle: { lista: ['p', 'q', 'r'] } })
    expect(withdrawnRd({ settings: [ch('z0', '2026-11-01', { przyszle: { lista: ['p'] } }), a, holds] }, 'a', TODAY)).toMatchObject({ refused: 'later', later: { id: 'b' } })
    const not = ch('b', '2026-11-30', { przyszle: { lista: ['p', 's'] } })
    expect('raw' in withdrawnRd({ settings: [ch('z0', '2026-11-01', { przyszle: { lista: ['p'] } }), a, not] }, 'a', TODAY)).toBe(true)
  })

  it('zmiana, która dodaje podkategorię (nie ma jej w ustawieniach tuż przed nią) – odmowa „podkategoria”, z nazwą; wiersz to wie', () => {
    const add = ch('n', '2026-11-25', { categories: { nowa: { cls: 'work', kind: 'other', place: 'computer', costs: { head: 1, emotions: 1, senses: 1, body: 0 } } } })
    const raw = { categories: { nowa: { name: 'Nowa', color: null, archived: false } }, settings: [add] }
    expect(withdrawRefusal(add, [add], TODAY)).toBe('newCategory')
    expect(withdrawnRd(raw, 'n', TODAY)).toMatchObject({ refused: 'newCategory', category: 'nowa', name: 'Nowa' })
    expect(withdrawnRd({ settings: [add] }, 'n', TODAY)).toMatchObject({ refused: 'newCategory', category: 'nowa', name: null })
    // A later change of that subcategory's cost (it is there before it), and one of a default subcategory: no refusal.
    const cost = ch('k', '2026-11-28', { categories: { nowa: { costs: { head: 2, emotions: 1, senses: 1, body: 0 } } } }, { made: 2 })
    expect('raw' in withdrawnRd({ ...raw, settings: [add, cost] }, 'k', TODAY)).toBe(true)
    expect('raw' in withdrawnRd({ settings: [ch('d', '2026-11-25', { categories: { analiza: { costs: { head: 2, emotions: 1, senses: 1, body: 0 } } } })] }, 'd', TODAY)).toBe(true)
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

describe('podkategoria, której dodanie jeszcze czeka na datę (T2353)', () => {
  const costs = { head: 1, emotions: 1, senses: 1, body: 0 }
  const add = ch('n', '2026-11-25', { categories: { nowa: { cls: 'work', kind: 'other', place: 'computer', costs } } })
  const later = ch('m', '2026-11-28', { reserve: 5, categories: { nowa: { costs: { ...costs, head: 2 } }, analiza: { costs } } }, { made: 2 })
  const only = ch('k', '2026-11-29', { categories: { nowa: { place: 'away' } } }, { made: 3 })
  const raw = { schema: 1, categories: { nowa: { name: 'Nowa', color: null, archived: false, group: 'g-praca' }, analiza: { name: 'Analiza', color: null, archived: false } }, settings: [ch('a', '2026-11-01', { reserve: 12 }), add, later, only] }

  it('plannedAddition: pierwsza zmiana, która ją pisze, czeka na datę, a ustawienia tuż przed nią jej nie mają', () => {
    expect(plannedAddition('nowa', changesOf(raw), TODAY)?.id).toBe('n')
    // Its date came: it is in force – no planned addition.
    expect(plannedAddition('nowa', changesOf(raw), '2026-11-25')).toBeNull()
    // A default subcategory, one that is not there at all.
    expect(plannedAddition('analiza', changesOf(raw), TODAY)).toBeNull()
    expect(plannedAddition('brak', changesOf(raw), TODAY)).toBeNull()
  })

  it('withoutPlannedCategory: zmiana dodająca i zmiana tylko jej – całe; z innej zmiany tylko jej część; wpis w „categories” znika', () => {
    const out = withoutPlannedCategory(raw, 'nowa', TODAY)!
    expect(out.added.id).toBe('n')
    const list = changesOf(out.raw)
    expect(list.map((c) => c.id)).toEqual(['a', 'm'])
    expect(list[1]!.patch).toEqual({ reserve: 5, categories: { analiza: { costs } } })
    expect(out.raw.categories).toEqual({ analiza: raw.categories.analiza })
    // From every date: as if it never was.
    for (const d of ['2026-11-25', '2026-11-28', '2026-11-30']) expect(settingsOn(list, d).categories.nowa).toBeUndefined()
    expect(settingsOn(list, '2026-11-28').reserve).toBe(5)
    // One edit of rd.json; its inverse puts everything back.
    const entry = recordEdit('rd.json', raw, out.raw)!
    let file: unknown = out.raw
    for (const f of inverseEdit(entry, out.raw, null)!.edits) if (deepEqual(valueAt(file, f.path), f.base)) file = setAt(file, f.path, f.value)
    expect(settingsOn(changesOf(file as Record<string, unknown>), '2026-11-29')).toEqual(settingsOn(changesOf(raw), '2026-11-29'))
    expect((file as Record<string, unknown>).categories).toEqual(raw.categories)
  })

  it('dodanie w mocy (data nadeszła) albo podkategoria z ustawień: null – „Usuń” to archiwum jak dotąd', () => {
    expect(withoutPlannedCategory(raw, 'nowa', '2026-11-25')).toBeNull()
    expect(withoutPlannedCategory(raw, 'analiza', TODAY)).toBeNull()
  })
})
