// @vitest-environment jsdom
/**
 * Drzewo kategorii w Ustawieniach (D510, 1.25-A2): kategoria → podkategoria → wariant. Dodanie kategorii i podkategorii, przeniesienie
 * podkategorii, usunięcie kategorii (okno „Przenieś do …” / „Usuń też podkategorie”, potem „Cofnij”), warianty (nazwa, koszt albo „jak
 * podkategoria”, miejsce, usunięcie, „+ Wariant”) i brak sekcji „Sposoby regeneracji”. Atrapa kolejki jak w `category-tree-save.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry } from '@shared/api'
import { costsOf } from '@shared/model/categories'
import { OTHER_GROUP, groupOfCategory } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { CategoriesSection } from '@renderer/features/settings/CategoriesSection'
import { resetSettingsFrom } from '@renderer/features/settings/settingsStore'
import { useData } from '@renderer/store/data'
import { closeToast, openPick, useUi } from '@renderer/store/ui'

// `hold` – a save in progress: the queue answers only once it is released.
const fake = vi.hoisted(() => ({ file: { schema: 1 } as Record<string, unknown>, hold: null as Promise<void> | null }))
vi.mock('@renderer/store/data', async (orig) => {
  const real = await orig<typeof import('@renderer/store/data')>()
  const { deepEqual, setAt, valueAt } = await import('@shared/data/merge')
  const { rdFrom: read } = await import('@shared/model/rd')
  const trySaveWith = async (make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>) => {
    const list = (await make()).filter((e): e is EditEntry => !!e)
    if (!list.length) return []
    if (fake.hold) await fake.hold
    const statuses = list.map((e) => {
      let ok = true
      let value: unknown = fake.file
      for (const f of e.edits) {
        const now = valueAt(value, f.path)
        if (deepEqual(now, f.value)) continue
        if (deepEqual(now, f.base)) value = setAt(value, f.path, f.value)
        else ok = false
      }
      fake.file = value as Record<string, unknown>
      return ok ? ('applied' as const) : ('conflict' as const)
    })
    real.useData.setState({ rd: read(fake.file) })
    return statuses.map((status) => ({ id: 'x', status, fields: [] }))
  }
  const trySaveRd = (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => trySaveWith(() => [real.editOf('rd.json', fake.file, fn({ ...fake.file }))])
  return {
    ...real,
    rawRecord: (rel: string) => (rel === 'rd.json' ? fake.file : null),
    trySaveWith,
    trySaveRd,
    saveRd: async (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => (await trySaveRd(fn)) ?? []
  }
})

const TODAY = '2026-11-14'
const TOMORROW = '2026-11-15'
let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
const rdNow = () => useData.getState().rd
beforeEach(() => {
  fake.file = { schema: 1 }
  fake.hold = null
  resetSettingsFrom()
  useData.setState({ rd: rdFrom(fake.file), view: { today: TODAY } as never })
  for (const t of useUi.getState().toasts) closeToast(t.id)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
})

async function show() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CategoriesSection)))
}
const all = (id: string, within: ParentNode = document) => [...within.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const q = <T extends HTMLElement = HTMLElement>(id: string, within: ParentNode = document) => (all(id, within)[0] as T | undefined) ?? null
const group = (id: string) => document.querySelector<HTMLElement>(`[data-testid="group-row"][data-group="${CSS.escape(id)}"]`)!
const category = (id: string) => document.querySelector<HTMLElement>(`[data-testid="category-row"][data-category="${id}"]`)!
const click = (el: Element | null) => act(async () => (el as HTMLElement).click())
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
/** A `TextField`: typed, then left (the commit). */
const commitText = (input: HTMLInputElement, value: string) =>
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
const settingsFrom = (d: string) => settingsOn(rdNow().settings, d)
const lastToast = () => useUi.getState().toasts.at(-1)!

describe('drzewo w Ustawieniach', () => {
  it('kategorie w kolejności, „Inne” ostatnia, podkategorie w swoich kategoriach; „Inne” bez „Usuń”', async () => {
    await show()
    expect(all('group-row').map((g) => g.dataset.group)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'g-wolne', 'g-inne'])
    expect(all('category-row', group('g-praca')).map((r) => r.dataset.category).sort()).toEqual(['analiza', 'inne', 'journaling', 'sesja'])
    expect(all('category-row', group('g-wolne')).map((r) => r.dataset.category).sort()).toEqual(['projekty', 'regeneracja'])
    expect(q('group-remove', group('g-inne'))).toBeNull()
    expect(q('group-remove', group('g-wolne'))).not.toBeNull()
  })

  it('„+ Kategoria”: nowa kategoria stoi przed „Inne”, wpis w rd.json; nazwę można zmienić', async () => {
    await show()
    typeInto(q<HTMLInputElement>('group-new')!, 'Trading')
    await click(q('group-add'))
    const added = rdNow().categoryGroups.find((g) => g.name === 'Trading')!
    expect(added).toBeDefined()
    expect(all('group-row').map((g) => g.dataset.group)).toEqual(['g-praca', 'g-nauka', 'g-dom', 'g-wolne', added.id, 'g-inne'])
    expect(q<HTMLInputElement>('group-new')!.value).toBe('')
    commitText(q<HTMLInputElement>('group-name', group(added.id))!, 'Trading 2')
    await act(async () => undefined)
    expect(rdNow().categoryGroups.find((g) => g.id === added.id)!.name).toBe('Trading 2')
  })

  it('„+ Podkategoria” w kategorii: nowa podkategoria jest w tej kategorii (pole grupy w rd.json), z regułami od jutra', async () => {
    await show()
    const box = group('g-dom')
    typeInto(q<HTMLInputElement>('subcategory-new', box)!, 'Ogród')
    await click(q('subcategory-add', box))
    const id = Object.keys(rdNow().categories).find((k) => rdNow().categories[k]!.name === 'Ogród')!
    expect(groupOfCategory(rdNow(), id)).toBe('g-dom')
    expect(settingsFrom(TOMORROW).categories[id]).toBeDefined()
    expect(all('category-row', group('g-dom')).map((r) => r.dataset.category)).toContain(id)
    expect(q<HTMLInputElement>('subcategory-new', box)!.value).toBe('')
  })

  it('przeniesienie podkategorii: wybór kategorii w „więcej”; w „Inne” – bez pola w pliku, gdy tam już była', async () => {
    await show()
    await click(q('category-more', category('analiza')))
    const select = q<HTMLSelectElement>('category-group', category('analiza'))!
    expect(select.value).toBe('g-praca')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Praca', 'Nauka', 'Dom i opieka', 'Wolne', 'Inne'])
    choose(select, 'g-wolne')
    await act(async () => undefined)
    expect(groupOfCategory(rdNow(), 'analiza')).toBe('g-wolne')
    expect(all('category-row', group('g-wolne')).map((r) => r.dataset.category)).toContain('analiza')
  })

  it('podkategoria zarchiwizowanej kategorii stoi w „Inne” i jej lista „Kategoria” mówi „Inne”; z archiwum – swoją kategorię (T1393)', async () => {
    fake.file = { schema: 1, categoryGroups: [{ id: 'g-wolne', archived: true }] }
    useData.setState({ rd: rdFrom(fake.file) })
    await show()
    await click(q('category-more', category('projekty')))
    expect(category('projekty').closest('[data-testid="group-row"]')!.getAttribute('data-group')).toBe(OTHER_GROUP)
    const select = () => q<HTMLSelectElement>('category-group', category('projekty'))!
    expect(select().value).toBe(OTHER_GROUP)
    expect(select().selectedOptions[0]!.textContent).toBe('Inne')
    await click(q('categories-archive-toggle'))
    expect(category('projekty').closest('[data-testid="group-row"]')!.getAttribute('data-group')).toBe('g-wolne')
    expect(select().value).toBe('g-wolne')
    expect(select().selectedOptions[0]!.textContent).toBe('Wolne')
  })
})

describe('usunięcie kategorii', () => {
  it('z podkategoriami pyta: domyślnie „Przenieś do Inne”; po potwierdzeniu podkategorie są w „Inne”, „Cofnij” przywraca', async () => {
    await show()
    await click(q('group-remove', group('g-wolne')))
    const dialog = q('group-remove-dialog')!
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('2 podkategorie')
    const to = q<HTMLSelectElement>('group-move-to')!
    expect(to.value).toBe(OTHER_GROUP)
    // The choice lists the other categories, not the one removed.
    expect([...to.options].map((o) => o.value)).toEqual(['g-praca', 'g-nauka', 'g-dom', OTHER_GROUP])
    await click(q('group-remove-confirm'))
    expect(q('group-remove-dialog')).toBeNull()
    expect(all('group-row').map((g) => g.dataset.group)).not.toContain('g-wolne')
    expect(groupOfCategory(rdNow(), 'projekty')).toBe(OTHER_GROUP)
    expect(groupOfCategory(rdNow(), 'regeneracja')).toBe(OTHER_GROUP)
    expect(all('category-row', group('g-inne')).map((r) => r.dataset.category)).toEqual(expect.arrayContaining(['projekty', 'regeneracja']))
    const toast = lastToast()
    expect(toast.text).toContain('Wolne')
    expect(toast.action?.label).toBe('Cofnij')
    await act(async () => void toast.action!.run())
    expect(groupOfCategory(rdNow(), 'projekty')).toBe('g-wolne')
    expect(all('group-row').map((g) => g.dataset.group)).toContain('g-wolne')
  })

  it('przeniesienie do wybranej kategorii', async () => {
    await show()
    await click(q('group-remove', group('g-wolne')))
    choose(q<HTMLSelectElement>('group-move-to')!, 'g-nauka')
    await click(q('group-remove-confirm'))
    expect(groupOfCategory(rdNow(), 'projekty')).toBe('g-nauka')
  })

  it('„Usuń też podkategorie”: podkategorie w archiwum (znikają z listy, wracają z „Cofnij”)', async () => {
    await show()
    await click(q('group-remove', group('g-wolne')))
    await click([...q('group-remove-dialog')!.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Usuń też podkategorie')!)
    expect(q('group-move-to')).toBeNull()
    await click(q('group-remove-confirm'))
    expect(rdNow().categories.projekty?.archived).toBe(true)
    expect(rdNow().categories.regeneracja?.archived).toBe(true)
    expect(all('category-row').map((r) => r.dataset.category)).not.toContain('projekty')
    await act(async () => void lastToast().action!.run())
    expect(rdNow().categories.projekty?.archived).not.toBe(true)
    expect(all('category-row').map((r) => r.dataset.category)).toContain('projekty')
  })

  it('anulowanie okna nic nie zmienia; „Cofnij” po zmianie pliku zostawia go (komunikat)', async () => {
    await show()
    await click(q('group-remove', group('g-wolne')))
    await click(q('group-remove-cancel'))
    expect(q('group-remove-dialog')).toBeNull()
    expect(rdNow().categoryGroups.find((g) => g.id === 'g-wolne')!.archived).toBe(false)
    await click(q('group-remove', group('g-wolne')))
    await click(q('group-remove-confirm'))
    const undo = lastToast().action!.run
    // Another computer moved a subcategory since: the undo overwrites nothing.
    fake.file = { ...fake.file, categories: { ...(fake.file.categories as object), projekty: { ...(fake.file.categories as { projekty: object }).projekty, group: 'g-praca' } } }
    act(() => useData.setState({ rd: rdFrom(fake.file) }))
    await act(async () => void undo())
    expect(groupOfCategory(rdNow(), 'projekty')).toBe('g-praca')
    expect(useUi.getState().toasts.at(-1)!.text).toContain('zmieniły się')
  })

  it('liczba podkategorii z tego samego zbioru, który usunięcie przenosi: pyta o podkategorię spoza widoku, komunikat liczy w chwili zapisu (T1392)', async () => {
    // „Ogród” is in „Trading” (rd.json) but has no rules on the screen's date: the removal moves it, so it asks.
    fake.file = { schema: 1, categoryGroups: [{ id: 'trd', name: 'Trading', order: 5 }], categories: { c1: { name: 'Ogród', group: 'trd' } } }
    useData.setState({ rd: rdFrom(fake.file) })
    await show()
    expect(all('category-row', group('trd'))).toEqual([])
    await click(q('group-remove', group('trd')))
    expect(q('group-remove-dialog')!.textContent).toContain('1 podkategorię')
    await click(q('group-remove-confirm'))
    expect(groupOfCategory(rdNow(), 'c1')).toBe(OTHER_GROUP)
    expect(lastToast().text).toContain('przeniesiono 1 podkategorię')
    // Another computer put one more in „Wolne” after the window asked: the toast says what the removal took then.
    fake.file = { schema: 1 }
    act(() => useData.setState({ rd: rdFrom(fake.file) }))
    await click(q('group-remove', group('g-wolne')))
    expect(q('group-remove-dialog')!.textContent).toContain('2 podkategorie')
    fake.file = { schema: 1, categories: { analiza: { name: 'Analiza', group: 'g-wolne' } } }
    await click(q('group-remove-confirm'))
    expect(groupOfCategory(rdNow(), 'analiza')).toBe(OTHER_GROUP)
    expect(lastToast().text).toContain('przeniesiono 3 podkategorie')
  })

  it('potwierdzenie w czasie innego zapisu: okno zostaje z komunikatem, usunięcie nie przepada; po zapisie idzie (T1392)', async () => {
    await show()
    await click(q('group-remove', group('g-wolne')))
    // A new category is being saved meanwhile (the section saves one thing at a time).
    let release = () => {}
    fake.hold = new Promise<void>((r) => (release = r))
    typeInto(q<HTMLInputElement>('group-new')!, 'Trading')
    await click(q('group-add'))
    await click(q('group-remove-confirm'))
    expect(q('group-remove-dialog')).not.toBeNull()
    expect(lastToast().text).toContain('Trwa zapis')
    expect(groupOfCategory(rdNow(), 'projekty')).toBe('g-wolne')
    fake.hold = null
    await act(async () => release())
    await click(q('group-remove-confirm'))
    expect(q('group-remove-dialog')).toBeNull()
    expect(groupOfCategory(rdNow(), 'projekty')).toBe(OTHER_GROUP)
    expect(rdNow().categoryGroups.some((g) => g.name === 'Trading')).toBe(true)
  })

  it('kategoria bez podkategorii znika bez pytania (z „Cofnij”)', async () => {
    await show()
    typeInto(q<HTMLInputElement>('group-new')!, 'Pusta')
    await click(q('group-add'))
    const id = rdNow().categoryGroups.find((g) => g.name === 'Pusta')!.id
    await click(q('group-remove', group(id)))
    expect(q('group-remove-dialog')).toBeNull()
    expect(all('group-row').map((g) => g.dataset.group)).not.toContain(id)
    await act(async () => void lastToast().action!.run())
    expect(all('group-row').map((g) => g.dataset.group)).toContain(id)
  })

  it('archiwum: „Pokaż archiwum” pokazuje usuniętą kategorię z „Przywróć”', async () => {
    await show()
    typeInto(q<HTMLInputElement>('group-new')!, 'Pusta')
    await click(q('group-add'))
    const id = rdNow().categoryGroups.find((g) => g.name === 'Pusta')!.id
    await click(q('group-remove', group(id)))
    await click(q('categories-archive-toggle'))
    expect(q('group-restore', group(id))).not.toBeNull()
    // An archived category takes no new subcategory (T1393); a live one does.
    expect(q('subcategory-new', group(id))).toBeNull()
    expect(q('subcategory-new', group('g-dom'))).not.toBeNull()
    await click(q('group-restore', group(id)))
    expect(rdNow().categoryGroups.find((g) => g.id === id)!.archived).toBe(false)
  })
})

describe('warianty podkategorii', () => {
  const open = async (id: string) => click(q('category-more', category(id)))
  const variant = (cat: string, id: string) => category(cat).querySelector<HTMLElement>(`[data-testid="variant-row"][data-variant="${id}"]`)!

  it('pod podkategorią lista wariantów („Regeneracja”: sposoby regeneracji) – nazwa, koszt, miejsce', async () => {
    await show()
    await open('regeneracja')
    const rows = all('variant-row', category('regeneracja'))
    expect(rows.map((r) => r.dataset.variant)).toEqual(settingsFrom(TOMORROW).categories.regeneracja!.variants.map((v) => v.id))
    expect(rows.length).toBeGreaterThan(0)
    expect(q('variant-name', rows[0]!)).not.toBeNull()
  })

  it('„+ Wariant”: nowy jest „jak podkategoria” (bez kosztu i miejsca), od jutra', async () => {
    await show()
    await open('analiza')
    typeInto(q<HTMLInputElement>('variant-new', category('analiza'))!, 'Przegląd')
    await click(q('variant-add', category('analiza')))
    const list = settingsFrom(TOMORROW).categories.analiza!.variants
    const added = list.find((v) => v.name === 'Przegląd')!
    expect(added.costs).toBeUndefined()
    expect(costsOf(settingsFrom(TOMORROW).categories.analiza!, added.id)).toEqual(settingsFrom(TOMORROW).categories.analiza!.costs)
    expect(settingsFrom(TODAY).categories.analiza!.variants.some((v) => v.id === added.id)).toBe(false)
    expect(q('variant-row', category('analiza'))).not.toBeNull()
  })

  it('koszt: „jak podkategoria” wyłączony daje własne liczby, włączony – wraca do podkategorii (null)', async () => {
    await show()
    await open('nauka')
    const row = () => variant('nauka', 'sluchanie')
    const costs = () => settingsFrom(TOMORROW).categories.nauka!.variants.find((v) => v.id === 'sluchanie')!.costs
    const before = costs()
    expect(before).toBeDefined()
    // Own numbers shown (the variant has them): turning „jak podkategoria” on gives them up.
    expect(q('variant-costs-same', row())!.getAttribute('aria-checked')).toBe('false')
    await click(q('variant-costs-same', row()))
    expect(costs()).toBeUndefined()
    expect(costsOf(settingsFrom(TOMORROW).categories.nauka!, 'sluchanie')).toEqual(settingsFrom(TOMORROW).categories.nauka!.costs)
    expect(q('variant-costs-same', row())!.getAttribute('aria-checked')).toBe('true')
    // Off again: its own numbers, the subcategory's at that moment.
    await click(q('variant-costs-same', row()))
    expect(costs()).toEqual(settingsFrom(TOMORROW).categories.nauka!.costs)
  })

  it('miejsce „jak podkategoria” i własne', async () => {
    await show()
    await open('nauka')
    const place = () => settingsFrom(TOMORROW).categories.nauka!.variants.find((v) => v.id === 'sluchanie')!.place
    expect(place()).toBe('passive')
    const select = () => q<HTMLSelectElement>('variant-place', variant('nauka', 'sluchanie'))!
    expect(select().value).toBe('passive')
    choose(select(), '-')
    await act(async () => undefined)
    expect(place()).toBeUndefined()
    choose(select(), 'away')
    await act(async () => undefined)
    expect(place()).toBe('away')
  })

  it('nazwa wariantu; usunięcie = archiwum, „Pokaż archiwum” pokazuje go z „Przywróć”', async () => {
    await show()
    await open('nauka')
    commitText(q<HTMLInputElement>('variant-name', variant('nauka', 'sluchanie'))!, 'Słuchanie 2')
    await act(async () => undefined)
    expect(settingsFrom(TOMORROW).categories.nauka!.variants.find((v) => v.id === 'sluchanie')!.name).toBe('Słuchanie 2')
    await click(q('variant-remove', variant('nauka', 'sluchanie')))
    expect(settingsFrom(TOMORROW).categories.nauka!.variants.find((v) => v.id === 'sluchanie')!.archived).toBe(true)
    expect(category('nauka').querySelector('[data-variant="sluchanie"]')).toBeNull()
    await click(q('categories-archive-toggle'))
    expect(q('variant-restore', variant('nauka', 'sluchanie'))).not.toBeNull()
    await click(q('variant-restore', variant('nauka', 'sluchanie')))
    expect(settingsFrom(TOMORROW).categories.nauka!.variants.find((v) => v.id === 'sluchanie')!.archived).toBeUndefined()
  })
})

describe('Ctrl K prowadzi do drzewa', () => {
  const scroll = vi.fn()
  beforeEach(() => {
    scroll.mockClear()
    Element.prototype.scrollIntoView = scroll
    useUi.setState({ pick: null })
  })

  it('wariant: otwiera jego podkategorię i przewija do wariantu; podkategoria – jej wiersz; kategoria – jej pole', async () => {
    openPick({ page: 'settings' }, { kind: 'category', id: 'sluchanie', parent: 'nauka' })
    await show()
    expect(q('variant-row', category('nauka'))).not.toBeNull()
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(useUi.getState().pick).toBeNull()
    act(() => openPick({ page: 'settings' }, { kind: 'category', id: 'analiza' }))
    await act(async () => undefined)
    expect(q('category-group', category('analiza'))).not.toBeNull()
    act(() => openPick({ page: 'settings' }, { kind: 'category', id: 'group:g-wolne' }))
    await act(async () => undefined)
    expect(scroll).toHaveBeenCalledTimes(3)
  })

  it('id z cudzysłowem albo ukośnikiem: przewija do kategorii, ekran nie pada (T1393)', async () => {
    fake.file = { schema: 1, categoryGroups: [{ id: 'g"x\\y', name: 'Dziwna', order: 9 }] }
    useData.setState({ rd: rdFrom(fake.file) })
    openPick({ page: 'settings' }, { kind: 'category', id: 'group:g"x\\y' })
    await show()
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(group('g"x\\y'))
  })

  it('wariant w archiwum odkrywa archiwum; element, którego nie ma, kończy się komunikatem', async () => {
    fake.file = { schema: 1, settings: [{ id: 'a', from: '2026-11-15', at: null, made: 1, patch: { categories: { nauka: { variants: [{ id: 'sluchanie', name: 'Nauka — słuchanie', archived: true }] } } } }] }
    useData.setState({ rd: rdFrom(fake.file) })
    openPick({ page: 'settings' }, { kind: 'category', id: 'sluchanie', parent: 'nauka' })
    await show()
    expect(category('nauka').querySelector('[data-variant="sluchanie"]')).not.toBeNull()
    act(() => openPick({ page: 'settings' }, { kind: 'category', id: 'nie-ma', parent: 'nauka' }))
    await act(async () => undefined)
    expect(lastToast().text).toContain('nie ma już')
  })
})

describe('bez sekcji „Sposoby regeneracji”', () => {
  it('Ustawienia nie mają jej, Ctrl K nie prowadzi do niej', () => {
    const settings = readFileSync('src/renderer/features/settings/SettingsPage.tsx', 'utf8')
    expect(settings).not.toContain('RegenWaysSection')
    expect(readFileSync('src/renderer/features/settings/SharedSettings.tsx', 'utf8')).not.toContain('settings-regen-ways')
    expect(readFileSync('src/renderer/features/search/records.ts', 'utf8')).not.toContain('settings-regen-ways')
  })
})
