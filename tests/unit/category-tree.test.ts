/**
 * Drzewo kategorii (D510): kategoria (grupa: sama nazwa) → podkategoria (dzisiejsza kategoria, te same id) → wariant. Grupy w rd.json
 * (`categoryGroups` + `categories.<id>.group`), działają od razu jak kalendarze. Stare dane czytają się jako domyślne drzewo z D510
 * bez żadnego zapisu (ten sam wynik na każdym komputerze); starsza wersja, która pisze rd.json pole po polu, grup nie gubi. Warianty
 * każdej podkategorii: dodanie, zmiana (koszt i miejsce albo null – „jak podkategoria”), archiwizacja.
 */
import { describe, expect, it } from 'vitest'
import { deepEqual, editStands, inverseEdit, recordEdit, setAt, valueAt } from '@shared/data/merge'
import type { EditEntry } from '@shared/api'
import { DEFAULT_CATEGORIES, costsOf, placeOf } from '@shared/model/categories'
import {
  DEFAULT_GROUPS,
  DEFAULT_GROUP_OF,
  OTHER_GROUP,
  addGroupRaw,
  addVariant,
  archiveVariant,
  categoriesOfGroupRaw,
  categoryGroupsFrom,
  categoryTree,
  changeVariant,
  groupOfCategory,
  newGroup,
  pickTree,
  removeGroupRaw,
  setCategoryGroupRaw,
  treeEdit,
  updateGroupRaw,
  variantsPatch
} from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS, settingsOn, type SettingsChange } from '@shared/model/settings'

type Raw = Record<string, unknown>
const RULES = DEFAULT_SETTINGS.categories
const IDS = Object.keys(RULES)
const groupOf = (raw: Raw, id: string) => groupOfCategory(rdFrom(raw), id)
const names = (raw: Raw) => rdFrom(raw).categoryGroups.map((g) => g.name)

/** The queue laying an edit on the file: a field whose base differs from the file is a conflict (as `editQueue`). */
function lay(file: Raw, e: EditEntry | null): { file: Raw; conflicts: string[] } {
  let value: unknown = file
  const conflicts: string[] = []
  for (const f of e?.edits ?? []) {
    const now = valueAt(value, f.path)
    if (deepEqual(now, f.value)) continue
    if (deepEqual(now, f.base)) value = setAt(value, f.path, f.value)
    else conflicts.push(f.path.join('.'))
  }
  return { file: value as Raw, conflicts }
}
const write = (file: Raw, fn: (raw: Raw) => Raw) => lay(file, recordEdit('rd.json', file, fn({ ...file })))

describe('migracja: stare dane bez grup (D510)', () => {
  it('domyślne grupy w kolejności D510, „Inne” na końcu; stałe id – ten sam wynik na każdym komputerze', () => {
    const rd = rdFrom(undefined)
    expect(rd.categoryGroups.map((g) => [g.id, g.name])).toEqual([
      ['g-praca', 'Praca'],
      ['g-nauka', 'Nauka'],
      ['g-dom', 'Dom i opieka'],
      ['g-wolne', 'Wolne'],
      ['g-inne', 'Inne']
    ])
    expect(rd.categoryGroups.every((g) => !g.archived)).toBe(true)
    // Two computers reading the same old file see the same tree.
    expect(rdFrom({ schema: 1 }).categoryGroups).toEqual(rdFrom(JSON.parse(JSON.stringify({ schema: 1 }))).categoryGroups)
  })

  it('każda kategoria startowa trafia do grupy z D510; „Nauka — słuchanie” zostaje wariantem Nauki', () => {
    const old: Raw = { schema: 1, categories: { sesja: { name: 'Sesja tradingowa', color: null, archived: false } } }
    const expected: Record<string, string[]> = {
      'g-praca': ['sesja', 'analiza', 'journaling', 'inne'],
      'g-nauka': ['nauka', 'wyklad', 'ogladanie', 'zajecia-zdalne', 'dojazd'],
      'g-dom': ['posilek', 'rutyny', 'prosby', 'sprawy'],
      'g-wolne': ['regeneracja', 'projekty']
    }
    for (const [group, ids] of Object.entries(expected)) for (const id of ids) expect([id, groupOf(old, id)]).toEqual([id, group])
    // Every starting category has its group.
    for (const c of DEFAULT_CATEGORIES) expect(DEFAULT_GROUP_OF[c.id]).toBeDefined()
    expect(RULES.nauka!.variants.map((v) => v.id)).toContain('sluchanie')
    expect(pickTree(rdFrom(old), RULES).flatMap((g) => g.categories)).not.toContain('sluchanie')
  })

  it('kategoria własna użytkownika – „Inne”; odczyt niczego nie dopisuje, ponowny zapis tej samej grupy nie zmienia pliku', () => {
    const old: Raw = { schema: 1, categories: { abc123: { name: 'Ogród', color: null, archived: false } } }
    expect(groupOf(old, 'abc123')).toBe(OTHER_GROUP)
    expect(rdFrom(old).categories.abc123).not.toHaveProperty('group')
    // Putting a category where it already is writes nothing (no migration write).
    expect(setCategoryGroupRaw(old, 'nauka', 'g-nauka')).toBe(old)
    expect(setCategoryGroupRaw(old, 'abc123', OTHER_GROUP)).toBe(old)
    expect(updateGroupRaw(old, 'g-praca', { name: 'Praca' })).toBe(old)
    expect(recordEdit('rd.json', old, setCategoryGroupRaw(old, 'nauka', 'g-nauka'))).toBeNull()
  })
})

describe('dane z grupami', () => {
  const file: Raw = {
    schema: 1,
    categoryGroups: [
      { id: 'trd', name: 'Trading', order: 5 },
      { id: 'g-praca', name: 'Robota' },
      { id: 'g-dom', archived: true },
      { id: 'g-inne', order: 0, archived: true, name: 'Reszta' },
      { id: 'zla' },
      'nie wpis'
    ],
    categories: { analiza: { name: 'Analiza', group: 'trd' }, posilek: { name: 'Posiłek' }, sesja: { name: 'Sesja', group: 'nieznana' } }
  }

  it('grupy z pliku po `order`, „Inne” zawsze ostatnia i nie do archiwizacji; zmieniona nazwa domyślnej; wpis bez nazwy odpada', () => {
    const groups = rdFrom(file).categoryGroups
    expect(groups.map((g) => g.id)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'g-wolne', 'trd', 'g-inne'])
    expect(groups.find((g) => g.id === 'g-praca')!.name).toBe('Robota')
    expect(groups.find((g) => g.id === 'g-dom')!.archived).toBe(true)
    expect(groups.at(-1)).toMatchObject({ id: 'g-inne', name: 'Reszta', archived: false })
  })

  it('podkategoria w nazwanej grupie; grupa nieznana albo zarchiwizowana – „Inne”', () => {
    expect(groupOf(file, 'analiza')).toBe('trd')
    expect(groupOf(file, 'sesja')).toBe(OTHER_GROUP)
    // Its group archived: in „Inne” (in the archive view – still in its group).
    expect(groupOf(file, 'posilek')).toBe(OTHER_GROUP)
    expect(groupOfCategory(rdFrom(file), 'posilek', { archived: true })).toBe('g-dom')
  })
})

describe('lista wyboru: podkategorie pogrupowane (panel bloku)', () => {
  it('kolejność grup, w grupie klasa i nazwa; zarchiwizowane podkategorie i puste grupy pominięte; bieżąca zarchiwizowana zostaje', () => {
    const raw: Raw = {
      schema: 1,
      categoryGroups: [{ id: 'puste', name: 'Pusta', order: 6 }],
      categories: { projekty: { name: 'Projekty', archived: true }, regeneracja: { name: 'Regeneracja', archived: true } }
    }
    const tree = pickTree(rdFrom(raw), RULES)
    expect(tree.map((g) => g.group.id)).toEqual(['g-praca', 'g-nauka', 'g-dom'])
    expect(tree[0]!.categories).toEqual(['analiza', 'inne', 'journaling', 'sesja'])
    expect(tree[2]!.categories).toEqual(['posilek', 'prosby', 'rutyny', 'sprawy'])
    // The block's own category stays on the list though archived.
    expect(pickTree(rdFrom(raw), RULES, 'projekty').find((g) => g.group.id === 'g-wolne')!.categories).toEqual(['projekty'])
  })

  it('zarchiwizowana grupa znika z listy, jej podkategorie są w „Inne”', () => {
    const raw: Raw = { schema: 1, categoryGroups: [{ id: 'g-wolne', archived: true }] }
    const tree = pickTree(rdFrom(raw), RULES)
    expect(tree.map((g) => g.group.id)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'g-inne'])
    expect(tree.at(-1)!.categories).toEqual(['projekty', 'regeneracja'])
  })

  it('drzewo Ustawień: także puste grupy; z archiwum – zarchiwizowane grupy z ich podkategoriami', () => {
    const raw: Raw = { schema: 1, categoryGroups: [{ id: 'g-wolne', archived: true }, { id: 'nowa', name: 'Nowa', order: 9 }], categories: { regeneracja: { name: 'Regeneracja', archived: true } } }
    const live = categoryTree(rdFrom(raw), RULES)
    expect(live.map((g) => g.group.id)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'nowa', 'g-inne'])
    expect(live.find((g) => g.group.id === 'nowa')!.categories).toEqual([])
    expect(live.at(-1)!.categories).toEqual(['projekty'])
    const all = categoryTree(rdFrom(raw), RULES, { archived: true })
    expect(all.find((g) => g.group.id === 'g-wolne')!.categories).toEqual(['projekty', 'regeneracja'])
  })
})

describe('zmiany drzewa (rd.json, od razu)', () => {
  it('nowa grupa: przed „Inne”, nazwa przycięta, pusta – nic; dodanie i przeniesienie podkategorii', () => {
    expect(newGroup(rdFrom({}).categoryGroups, '   ')).toBeNull()
    const g = newGroup(rdFrom({}).categoryGroups, '  Trading  ')!
    expect(g).toMatchObject({ name: 'Trading', order: 5, archived: false })
    let raw = addGroupRaw({ schema: 1 }, g)
    raw = setCategoryGroupRaw(raw, 'analiza', g.id)
    expect(names(raw)).toEqual(['Praca', 'Nauka', 'Dom i opieka', 'Wolne', 'Trading', 'Inne'])
    expect(groupOf(raw, 'analiza')).toBe(g.id)
    expect(raw.categoryGroups).toEqual([{ id: g.id, name: 'Trading', order: 5 }])
  })

  it('pierwsza zmiana grupy domyślnej zapisuje tylko zmienione pole; „Inne” można przemianować, nie zarchiwizować', () => {
    const raw = updateGroupRaw({ schema: 1 }, 'g-nauka', { name: 'Studia' })
    expect(raw.categoryGroups).toEqual([{ id: 'g-nauka', name: 'Studia' }])
    expect(updateGroupRaw({ schema: 1 }, OTHER_GROUP, { archived: true })).toEqual({ schema: 1 })
    expect(names(updateGroupRaw({ schema: 1 }, OTHER_GROUP, { name: 'Pozostałe' })).at(-1)).toBe('Pozostałe')
    expect(removeGroupRaw({ schema: 1 }, OTHER_GROUP, { archive: true }, IDS)).toEqual({ schema: 1 })
  })

  it('usunięcie grupy – „Przenieś do Inne”: podkategorie (także zarchiwizowane) do „Inne”, grupa w archiwum; „Cofnij” przywraca', () => {
    const file: Raw = { schema: 1, categories: { wyklad: { name: 'Wykład', archived: true } } }
    expect(categoriesOfGroupRaw(file, 'g-nauka', IDS).sort()).toEqual(['dojazd', 'nauka', 'ogladanie', 'wyklad', 'zajecia-zdalne'])
    const entry = recordEdit('rd.json', file, removeGroupRaw({ ...file }, 'g-nauka', { to: OTHER_GROUP }, IDS))!
    const { file: after } = lay(file, entry)
    expect(rdFrom(after).categoryGroups.find((g) => g.id === 'g-nauka')!.archived).toBe(true)
    for (const id of ['nauka', 'wyklad', 'ogladanie', 'zajecia-zdalne', 'dojazd']) expect(groupOf(after, id)).toBe(OTHER_GROUP)
    // Restoring the group later leaves them where they were moved (an explicit field).
    expect(groupOf(updateGroupRaw(after, 'g-nauka', { archived: false }), 'nauka')).toBe(OTHER_GROUP)
    // „Cofnij”: the edit turned over, while the file stands as the removal left it.
    expect(editStands(entry, after, null)).toBe(true)
    const { file: back } = lay(after, inverseEdit(entry, after, null))
    expect(rdFrom(back).categoryGroups).toEqual(rdFrom(file).categoryGroups)
    // The default group's first entry goes whole – no item without its id is left in the list (T1316).
    expect(back.categoryGroups).toEqual([])
    for (const id of ['nauka', 'wyklad', 'dojazd']) expect(groupOf(back, id)).toBe('g-nauka')
  })

  it('usunięcie grupy – „Przenieś do X” i „Usuń też podkategorie” (archiwizacja), z „Cofnij”', () => {
    const g = newGroup(rdFrom({}).categoryGroups, 'Ruch')!
    const file = addGroupRaw({ schema: 1 }, g)
    const moved = removeGroupRaw({ ...file }, 'g-wolne', { to: g.id }, IDS)
    expect(groupOf(moved, 'regeneracja')).toBe(g.id)
    expect(groupOf(moved, 'projekty')).toBe(g.id)
    // A move to the group itself is a move to „Inne”.
    expect(groupOf(removeGroupRaw({ ...file }, 'g-wolne', { to: 'g-wolne' }, IDS), 'projekty')).toBe(OTHER_GROUP)
    const entry = recordEdit('rd.json', file, removeGroupRaw({ ...file }, 'g-dom', { archive: true }, IDS))!
    const { file: gone } = lay(file, entry)
    const rd = rdFrom(gone)
    for (const id of ['posilek', 'rutyny', 'prosby', 'sprawy']) expect(rd.categories[id]!.archived).toBe(true)
    expect(rd.categories.analiza!.archived).toBe(false)
    expect(pickTree(rd, RULES).map((x) => x.group.id)).not.toContain('g-dom')
    const { file: back } = lay(gone, inverseEdit(entry, gone, null))
    expect(rdFrom(back).categories.posilek!.archived).toBe(false)
    expect(rdFrom(back).categoryGroups.find((x) => x.id === 'g-dom')!.archived).toBe(false)
  })
})

describe('dwa komputery i starsza wersja', () => {
  it('dwie nowe grupy dodane naraz na dwóch komputerach – obie zostają, bez pytania (lista pozycja po pozycji)', () => {
    const base: Raw = { schema: 1 }
    // Both made from the same list: the same place – the tie stands by the id, the same on every computer.
    const a = { ...newGroup(rdFrom(base).categoryGroups, 'Trading')!, id: 'a-trd' }
    const b = { ...newGroup(rdFrom(base).categoryGroups, 'Ruch')!, id: 'b-ruch' }
    const ea = recordEdit('rd.json', base, setCategoryGroupRaw(addGroupRaw({ ...base }, a), 'analiza', a.id))
    const eb = recordEdit('rd.json', base, setCategoryGroupRaw(addGroupRaw({ ...base }, b), 'projekty', b.id))
    const first = lay(base, ea)
    const second = lay(first.file, eb)
    expect([...first.conflicts, ...second.conflicts]).toEqual([])
    expect(names(second.file)).toEqual(['Praca', 'Nauka', 'Dom i opieka', 'Wolne', 'Trading', 'Ruch', 'Inne'])
    expect(groupOf(second.file, 'analiza')).toBe(a.id)
    expect(groupOf(second.file, 'projekty')).toBe(b.id)
  })

  it('pierwsze zmiany różnych pól grupy domyślnej na dwóch komputerach – obie zostają', () => {
    const base: Raw = { schema: 1 }
    const first = lay(base, recordEdit('rd.json', base, updateGroupRaw({ ...base }, 'g-praca', { name: 'Robota' })))
    const second = lay(first.file, recordEdit('rd.json', base, updateGroupRaw({ ...base }, 'g-praca', { archived: true })))
    expect(second.conflicts).toEqual([])
    expect(rdFrom(second.file).categoryGroups.find((g) => g.id === 'g-praca')).toMatchObject({ name: 'Robota', archived: true })
  })

  it('„Cofnij” usunięcia grupy domyślnej po zmianie jej nazwy na drugim komputerze: nazwa zostaje, wpis nie znika bez pytania (T1390)', () => {
    const base: Raw = { schema: 1 }
    // A removes „Praca”: its first entry `{ id, archived }` (the id first), the subcategories moved to „Inne”.
    const removal = recordEdit('rd.json', base, removeGroupRaw({ ...base }, 'g-praca', { to: OTHER_GROUP }, IDS))!
    const removed = lay(base, removal).file
    // B renames it meanwhile: a field the removal did not write.
    const renamed = write(removed, (raw) => updateGroupRaw(raw, 'g-praca', { name: 'Job' }))
    expect(renamed.conflicts).toEqual([])
    // A's „Cofnij”: every field it set still holds, so the edit is turned over.
    expect(editStands(removal, renamed.file, null)).toBe(true)
    const back = lay(renamed.file, inverseEdit(removal, renamed.file, null))
    // B's name stays (the entry is never taken whole with it): a question about the entry, not a quiet loss.
    expect(back.file.categoryGroups).toEqual([{ id: 'g-praca', name: 'Job' }])
    expect(back.conflicts).toEqual(['categoryGroups.#g-praca'])
    expect(rdFrom(back.file).categoryGroups.find((g) => g.id === 'g-praca')).toMatchObject({ name: 'Job', archived: false })
    for (const id of ['sesja', 'analiza']) expect(groupOf(back.file, id)).toBe('g-praca')
    // Nothing else in the entry: it goes whole, as before.
    expect(lay(removed, inverseEdit(removal, removed, null))).toEqual({ file: { schema: 1, categories: expect.any(Object), categoryGroups: [] }, conflicts: [] })
  })

  it('`setAt` nie zdejmuje samego `id` z wpisu listy, w którym jest coś jeszcze – wpis zostaje (T1390)', () => {
    const file = { categoryGroups: [{ id: 'g-praca', name: 'Job' }, { id: 'g-dom' }] }
    expect(setAt(file, ['categoryGroups', '#g-praca', 'id'], undefined)).toEqual(file)
    expect(setAt(file, ['categoryGroups', '#g-dom', 'id'], undefined)).toEqual({ categoryGroups: [{ id: 'g-praca', name: 'Job' }] })
  })

  it('zapis starszej wersji (pole po polu: nazwa, kolor, archiwum, kalendarz, zmiana ustawień) nie gubi grup', () => {
    const g = newGroup(rdFrom({}).categoryGroups, 'Trading')!
    const file = setCategoryGroupRaw(addGroupRaw({ schema: 1, categories: { analiza: { name: 'Analiza', color: null, archived: false } } }, g), 'analiza', g.id)
    // What 1.24's window does: `setMeta` spreads the entry it read, `setCategoryCalendarRaw` changes one field, a change of the
    // dated settings is a new item of `settings`; the queue lays the fields that differ.
    const cats = (raw: Raw) => raw.categories as Record<string, Raw>
    let now = write(file, (raw) => ({ ...raw, categories: { ...cats(raw), analiza: { ...cats(raw).analiza, name: 'Analiza rynku', color: '#79AFAB' } } })).file
    now = write(now, (raw) => ({ ...raw, categories: { ...cats(raw), analiza: { ...cats(raw).analiza, calendar: 'kal1' } } })).file
    now = write(now, (raw) => ({ ...raw, settings: [{ id: 's1', from: '2026-11-15', at: null, made: 1, patch: { reserve: 10 } }] })).file
    expect(groupOf(now, 'analiza')).toBe(g.id)
    expect(now.categoryGroups).toEqual(file.categoryGroups)
    expect(rdFrom(now).categories.analiza).toMatchObject({ name: 'Analiza rynku', group: g.id, calendar: 'kal1' })
  })
})

describe('warianty dowolnej podkategorii (ustawienia z datą)', () => {
  const on = (patch: Record<string, unknown>, before: SettingsChange[] = []) => settingsOn([...before, { id: 'v', from: '2026-11-15', at: null, made: 2, patch }], '2026-11-15')

  it('dodanie wariantu do „Analizy” (nie tylko regeneracji): własny koszt i miejsce albo jak podkategoria', () => {
    const list = addVariant(RULES.analiza!.variants, { id: 'v1', name: '  Przegląd tygodnia ', costs: { head: 2, emotions: 0, senses: 0 } })!
    const list2 = addVariant(list, { id: 'v2', name: 'Szybka', place: 'passive' })!
    const s = on(variantsPatch('analiza', list2))
    expect(s.categories.analiza!.variants.map((v) => v.name)).toEqual(['Przegląd tygodnia', 'Szybka'])
    expect(costsOf(s.categories.analiza!, 'v1')).toEqual({ head: 2, emotions: 0, senses: 0 })
    expect(costsOf(s.categories.analiza!, 'v2')).toEqual(RULES.analiza!.costs)
    expect(placeOf(s.categories.analiza!, 'v2')).toBe('passive')
    // No name, an id taken: nothing.
    expect(addVariant(list, { id: 'v3', name: ' ' })).toBeNull()
    expect(addVariant(list, { id: 'v1', name: 'X' })).toBeNull()
  })

  it('koszt null – „jak podkategoria” (wariant z kosztem traci go), miejsce null – jak podkategoria; zmiana nazwy', () => {
    const nauka = RULES.nauka!
    expect(costsOf(nauka, 'sluchanie')).toEqual({ head: 2, emotions: 0, senses: 0 })
    const list = changeVariant(nauka.variants, 'sluchanie', { costs: null, place: null, name: 'Słuchanie' })!
    expect(list).toEqual([{ id: 'sluchanie', name: 'Słuchanie', place: null, costs: null }])
    const s = on(variantsPatch('nauka', list))
    expect(costsOf(s.categories.nauka!, 'sluchanie')).toEqual(nauka.costs)
    expect(placeOf(s.categories.nauka!, 'sluchanie')).toBe(nauka.place)
    // A later change of another field writes the list as read – the cost stays „jak podkategoria”.
    const later = settingsOn([{ id: 'v', from: '2026-11-15', at: null, made: 2, patch: variantsPatch('nauka', list) }, { id: 'w', from: '2026-11-16', at: null, made: 3, patch: { reserve: 10 } }], '2026-11-16')
    expect(costsOf(later.categories.nauka!, 'sluchanie')).toEqual(nauka.costs)
    // A category's cost changed later: the variant „jak podkategoria” follows it.
    const after = settingsOn([{ id: 'v', from: '2026-11-15', at: null, made: 2, patch: variantsPatch('nauka', list) }, { id: 'w', from: '2026-11-16', at: null, made: 3, patch: { categories: { nauka: { costs: { head: 4 } } } } }], '2026-11-16')
    expect(costsOf(after.categories.nauka!, 'sluchanie')).toEqual({ ...nauka.costs, head: 4 })
  })

  it('stara lista bez pola kosztu (zapis sprzed D510) – koszt sprzed zmiany zostaje, jak dotąd', () => {
    const s = on({ categories: { nauka: { variants: [{ id: 'sluchanie', name: 'Słuchanie' }] } } })
    expect(costsOf(s.categories.nauka!, 'sluchanie')).toEqual({ head: 2, emotions: 0, senses: 0 })
  })

  it('zmiana bez skutku, nieznany wariant, zły koszt – nic; archiwizacja i przywrócenie', () => {
    const regen = RULES.regeneracja!
    expect(changeVariant(regen.variants, 'nie-ma', { name: 'X' })).toBeNull()
    expect(changeVariant(regen.variants, 'gra', { name: 'Gra, film' })).toBeNull()
    expect(changeVariant(regen.variants, 'gra', { costs: { head: 9, emotions: 0, senses: 0 } })).toBeNull()
    expect(changeVariant(RULES.sprawy!.variants, 'przy-komputerze', { costs: null })).toBeNull()
    const archived = archiveVariant(regen.variants, 'gra')!
    expect(archived.find((v) => v.id === 'gra')).toMatchObject({ archived: true })
    expect(on(variantsPatch('regeneracja', archived)).categories.regeneracja!.variants.find((v) => v.id === 'gra')!.archived).toBe(true)
    expect(archiveVariant(regen.variants, 'gra', false)).toBeNull()
    const back = archiveVariant(on(variantsPatch('regeneracja', archived)).categories.regeneracja!.variants, 'gra', false)!
    expect(back.find((v) => v.id === 'gra')).not.toHaveProperty('archived')
  })

  it('domyślne grupy są stałe (te same id w każdej wersji)', () => {
    expect(DEFAULT_GROUPS.map((g) => g.id)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'g-wolne', 'g-inne'])
    expect(categoryGroupsFrom(undefined)).toEqual(categoryGroupsFrom([]))
  })
})

describe('co jest zmianą drzewa dla starszej wersji (T1313, T1391)', () => {
  const base: Raw = { schema: 1, categories: { analiza: { name: 'Analiza', color: null, archived: false } } }
  const edit = (fn: (raw: Raw) => Raw, from: Raw = base) => recordEdit('rd.json', from, fn({ ...from }))!

  it('kategoria drzewa, kategoria podkategorii (także nowej), wariant – tak', () => {
    const g = newGroup(rdFrom({}).categoryGroups, 'Trading')!
    expect(treeEdit(edit((raw) => addGroupRaw(raw, g)))).toBe(true)
    expect(treeEdit(edit((raw) => updateGroupRaw(raw, 'g-praca', { name: 'Robota' })))).toBe(true)
    expect(treeEdit(edit((raw) => setCategoryGroupRaw(raw, 'analiza', 'g-dom')))).toBe(true)
    // A new subcategory in a group – its entry by fields, also in a file without `categories`.
    expect(treeEdit(edit((raw) => ({ ...raw, categories: { ...(raw.categories as Raw), c1: { name: 'Ogród', group: 'g-dom' } } })))).toBe(true)
    expect(treeEdit(edit((raw) => ({ ...raw, categories: { c1: { name: 'Ogród', group: 'g-dom' } } }), { schema: 1 }))).toBe(true)
    // „Cofnij” of a removal: the same fields turned over.
    const removal = edit((raw) => removeGroupRaw(raw, 'g-wolne', { to: OTHER_GROUP }, IDS))
    expect(treeEdit(inverseEdit(removal, lay(base, removal).file, null)!)).toBe(true)
    // Variants: the first change of the settings (the whole list) and one more.
    const change = (id: string) => ({ id, from: '2026-11-15', at: null, made: 1, patch: variantsPatch('analiza', addVariant(RULES.analiza!.variants, { id: 'v', name: 'Przegląd' })!) })
    expect(treeEdit(edit((raw) => ({ ...raw, settings: [change('s1')] })))).toBe(true)
    const withOne = { ...base, settings: [{ id: 's0', from: '2026-11-01', at: null, made: 0, patch: { reserve: 10 } }] }
    expect(treeEdit(edit((raw) => ({ ...raw, settings: [...(raw.settings as unknown[]), change('s1')] }), withOne))).toBe(true)
  })

  it('nazwa, kolor, kalendarz i archiwum podkategorii, inne ustawienia, inne pliki – nie', () => {
    const cats = (raw: Raw) => raw.categories as Record<string, Raw>
    expect(treeEdit(edit((raw) => ({ ...raw, categories: { analiza: { ...cats(raw).analiza, name: 'Analiza 2', color: '#79AFAB', archived: true, calendar: 'k' } } })))).toBe(false)
    expect(treeEdit(edit((raw) => ({ ...raw, settings: [{ id: 's1', from: '2026-11-15', at: null, made: 1, patch: { categories: { analiza: { costs: { head: 2 } } } } }] })))).toBe(false)
    expect(treeEdit(edit((raw) => ({ ...raw, general: { waterEveryMin: 60 } })))).toBe(false)
    expect(treeEdit({ rel: 'days/2026/2026-11-14.json', edits: [{ path: ['categoryGroups'], base: undefined, value: [] }] })).toBe(false)
  })
})
