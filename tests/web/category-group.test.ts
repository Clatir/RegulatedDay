// @vitest-environment jsdom
/**
 * Zaznaczanie w „Kategoriach” (D608, D609, N13) w oknie: zapis zmiany grupowej (`changeTreeGroup` – jedna edycja rd.json, część z datą od
 * paska Ustawień, „od dziś” z migawką dnia, linia „Zmieniono 6 podkategorii · Cofnij”, „Cofnij” z tym, co zostało) i ekran (klik, Ctrl+klik,
 * Shift+klik w kolejności drzewa, Ctrl+A, Esc, klik obok, pole wiersza nie zaznacza, menu „Zmień N” z ✓ / „—”, okno „Koszt…”). Atrapa kolejki
 * jak w `category-tree-screen.test.ts`: edycja kładzie się na rd.json pole po polu.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditEntry } from '@shared/api'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { categoryKey, variantKey } from '@shared/model/categoryGroup'
import { groupOfCategory, HOME_GROUP } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { SETTINGS_UNREADABLE_TEXT } from '@renderer/features/settings/calendarEdits'
import { CategoriesSection } from '@renderer/features/settings/CategoriesSection'
import { changeTreeGroup, TREE_TODAY_PART_TEXT, TREE_UNDO_TODAY_TEXT } from '@renderer/features/settings/categoryGroupEdits'
import { ALL_ARCHIVED, treeMenu, VARIANTS_STAY } from '@renderer/features/settings/categoryMenu'
import { resetSettingsFrom, useSettingsFrom } from '@renderer/features/settings/settingsStore'
import { FromBar } from '@renderer/features/settings/SharedSettings'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { undoGroupLine, useGroupLine } from '@renderer/store/groupLine'
import { closeToast, useUi } from '@renderer/store/ui'

// `missing` – no rd.json yet (a new folder: the view's `rd` is null); `dropView` – the folder's view gone in the turn of the save (rd.json cannot be read).
// `fail` – the save could not be sent (an error before the queue: `trySaveWith` null, nothing written); `todayType` – what „od dziś” reads of today (null – unreadable).
const fake = vi.hoisted(() => ({ file: { schema: 1 } as Record<string, unknown>, sent: 0, missing: false, dropView: false, fail: false, conflict: false, todayType: 'zwykly' as string | null, events: [] as unknown[] }))
vi.mock('@renderer/store/data', async (orig) => {
  const real = await orig<typeof import('@renderer/store/data')>()
  const { deepEqual, setAt, valueAt } = await import('@shared/data/merge')
  const { rdFrom: read } = await import('@shared/model/rd')
  const trySaveWith = async (make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>) => {
    if (fake.dropView) real.useData.setState({ view: null })
    if (fake.fail) return null
    const list = (await make()).filter((e): e is EditEntry => !!e)
    if (!list.length) return []
    // A change met one from another computer: a question, nothing laid.
    if (fake.conflict) return list.map(() => ({ id: 'x', status: 'conflict' as const, fields: [] }))
    fake.sent++
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
    rawRecord: (rel: string) => (rel === 'rd.json' && !fake.missing ? fake.file : null),
    trySaveWith,
    trySaveRd,
    saveRd: async (fn: (raw: Record<string, unknown>) => Record<string, unknown>) => (await trySaveRd(fn)) ?? [],
    logEvents: async (events: unknown[]) => (fake.events.push(...events), true)
  }
})
// „Od dziś” reads today's type from the day (`dayData` of the main process) – here a working day.
vi.mock('@renderer/features/settings/settingsStore', async (orig) => ({ ...(await orig<typeof import('@renderer/features/settings/settingsStore')>()), todayTypeNow: async () => fake.todayType }))

const TODAY = '2026-11-24'
const TOMORROW = '2026-11-25'
/** Six subcategories of „Praca”, „Nauka” and „Wolne” with no body cost (D523) – the example of N13. */
const SIX = ['analiza', 'journaling', 'sesja', 'nauka', 'ogladanie', 'projekty']
const was = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)!.costs
const rdNow = () => useData.getState().rd
const settingsFrom = (d: string) => settingsOn(rdNow().settings, d)
const lastToast = () => useUi.getState().toasts.at(-1)
const line = () => useGroupLine.getState().lines.settings

let root: Root | null = null
let host: HTMLElement | null = null
let offEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  fake.file = { schema: 1 }
  fake.sent = 0
  fake.missing = false
  fake.dropView = false
  fake.fail = false
  fake.todayType = 'zwykly'
  fake.conflict = false
  fake.events = []
  resetSettingsFrom()
  useData.setState({ rd: rdFrom(fake.file), view: { today: TODAY } as never })
  useGroupLine.setState({ lines: {} })
  for (const t of useUi.getState().toasts) closeToast(t.id)
  offEscape = installEscape()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  offEscape?.()
})

describe('changeTreeGroup – zapis (jedna edycja rd.json)', () => {
  it('sześć podkategorii dostaje ciało 2 od jutra jednym zapisem; dziś bez zmiany; linia i „Cofnij” przywraca', async () => {
    const done = await changeTreeGroup(SIX.map(categoryKey), { kind: 'costs', costs: { body: 2 } })
    expect(done?.changes).toHaveLength(6)
    expect(fake.sent).toBe(1)
    for (const id of SIX) {
      expect(settingsFrom(TOMORROW).categories[id]!.costs).toEqual({ ...was(id), body: 2 })
      expect(settingsFrom(TODAY).categories[id]!.costs).toEqual(was(id))
    }
    expect(line()?.text).toBe('Zmieniono 6 podkategorii')
    // „Od jutra” – no snapshot of today.
    expect(fake.events).toEqual([])
    await act(() => undoGroupLine('settings'))
    for (const id of SIX) expect(settingsFrom(TOMORROW).categories[id]!.costs).toEqual(was(id))
    expect(line()).toBeUndefined()
  })

  it('„Cofnij” zostawia zmienioną w międzyczasie i mówi to', async () => {
    await changeTreeGroup(SIX.map(categoryKey), { kind: 'costs', costs: { body: 2 } })
    // Another computer changed one of them since (a later change from the same date).
    const list = fake.file.settings as unknown[]
    fake.file = { ...fake.file, settings: [...list, { id: 'other', from: TOMORROW, at: null, made: Date.now() + 1, patch: { categories: { analiza: { costs: { head: 5, emotions: 5, senses: 5, body: 5 } } } } }] }
    useData.setState({ rd: rdFrom(fake.file) })
    await act(() => undoGroupLine('settings'))
    expect(settingsFrom(TOMORROW).categories.analiza!.costs.body).toBe(5)
    expect(settingsFrom(TOMORROW).categories.journaling!.costs).toEqual(was('journaling'))
    expect(lastToast()?.text).toBe('Cofnięto · 1 została, bo się zmieniła')
  })

  it('„Cofnij” w tej samej milisekundzie co zmiana leży nad nią (`made` dalej niż każda zmiana w rd.json)', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-24T12:00:00Z'))
    try {
      await changeTreeGroup(SIX.map(categoryKey), { kind: 'costs', costs: { body: 2 } })
      await act(() => undoGroupLine('settings'))
      const made = (fake.file.settings as Array<{ made: number }>).map((c) => c.made)
      expect(made).toHaveLength(2)
      expect(made[1]!).toBeGreaterThan(made[0]!)
      for (const id of SIX) expect(settingsFrom(TOMORROW).categories[id]!.costs).toEqual(was(id))
    } finally {
      now.mockRestore()
    }
  })

  it('„od dziś”: od tej chwili, z migawką dnia po zapisie (jak każda zmiana ustawień)', async () => {
    useSettingsFrom.setState({ mode: 'today' })
    await changeTreeGroup([categoryKey('analiza')], { kind: 'place', place: 'away' })
    expect(settingsOn(rdNow().settings, TODAY, Date.now() + 1000).categories.analiza!.place).toBe('away')
    expect(fake.events).toMatchObject([{ k: 'day.snapshot', day: TODAY, dayType: 'zwykly', reason: 'today' }])
  })

  it('przenieś: od razu, bez wpisu ustawień; warianty pominięte – linia to mówi', async () => {
    await changeTreeGroup([categoryKey('analiza'), variantKey('nauka', 'sluchanie')], { kind: 'move', group: HOME_GROUP })
    expect(groupOfCategory(rdNow(), 'analiza')).toBe(HOME_GROUP)
    expect(fake.file.settings).toBeUndefined()
    expect(line()?.text).toBe('Przeniesiono 1 podkategorię · pominięto 1: warianty zostają przy swojej podkategorii')
    await act(() => undoGroupLine('settings'))
    expect(groupOfCategory(rdNow(), 'analiza')).toBe('g-praca')
  })

  it('nic się nie zmienia – komunikat, bez zapisu i linii; rd.json nieczytelny – komunikat', async () => {
    expect(await changeTreeGroup([categoryKey('analiza')], { kind: 'costs', costs: { head: 3 } })).toBeNull()
    expect(lastToast()?.text).toBe('Nic się nie zmienia – zaznaczone już tak mają.')
    expect(fake.sent).toBe(0)
    expect(line()).toBeUndefined()
    fake.dropView = true
    expect(await changeTreeGroup([categoryKey('analiza')], { kind: 'remove' })).toBeNull()
    expect(lastToast()?.text).toBe(SETTINGS_UNREADABLE_TEXT)
    expect(fake.sent).toBe(0)
  })

  it('brak rd.json (nowy folder) – zmiana zaczyna od `{ schema: 1 }`, nie odmowa (jak „Usuń” podkategorii, T2707)', async () => {
    fake.missing = true
    fake.file = {}
    const done = await changeTreeGroup([categoryKey('analiza')], { kind: 'costs', costs: { body: 2 } })
    expect(done?.changes).toHaveLength(1)
    expect(fake.file.schema).toBe(1)
    expect(settingsFrom(TOMORROW).categories.analiza!.costs.body).toBe(2)
    expect(useUi.getState().toasts.some((t) => t.text === SETTINGS_UNREADABLE_TEXT)).toBe(false)
  })
})

describe('menu „Zmień N” (czyste)', () => {
  const ctx = () => ({ s: settingsFrom(TOMORROW), src: rdNow(), groups: rdNow().categoryGroups })
  const on = { cost: () => undefined, place: () => undefined, move: () => undefined, remove: () => undefined }
  const entry = (items: ReturnType<typeof treeMenu>, testId: string) => items.find((x) => 'testId' in x && x.testId === testId) as { check?: string; disabled?: string; submenu?: Array<{ testId?: string; check?: string }> }

  it('miejsce ✓ / „—”; przeniesienie – ✓ grupy podkategorii; same warianty – przeniesienie wyłączone z powodem', () => {
    const menu = treeMenu([categoryKey('analiza'), categoryKey('journaling'), categoryKey('posilek')], ctx(), on)
    const place = entry(menu, 'tree-menu-place').submenu!
    expect(place.find((x) => x.testId === 'tree-menu-place-computer')!.check).toBe('some')
    expect(place.find((x) => x.testId === 'tree-menu-place-passive')!.check).toBeUndefined()
    const move = entry(menu, 'tree-menu-move').submenu!
    expect(move.find((x) => x.testId === 'tree-menu-move-g-praca')!.check).toBe('some')
    expect(entry(treeMenu([categoryKey('analiza'), categoryKey('journaling')], ctx(), on), 'tree-menu-move').submenu!.find((x) => x.testId === 'tree-menu-move-g-praca')!.check).toBe('all')
    expect(entry(treeMenu([variantKey('nauka', 'sluchanie')], ctx(), on), 'tree-menu-move').disabled).toBe(VARIANTS_STAY)
  })

  it('✓ „Przenieś do” – kategoria z rd.json, także w archiwum (jak lista „Kategoria” wiersza, T1423): „Inne” nie ma ✓ (T2706)', () => {
    fake.file = { schema: 1, categoryGroups: [{ id: 'trd', name: 'Trading', order: 5, archived: true }], categories: { analiza: { name: 'Analiza', group: 'trd' } } }
    useData.setState({ rd: rdFrom(fake.file) })
    const live = rdNow().categoryGroups.filter((g) => !g.archived)
    const move = entry(treeMenu([categoryKey('analiza')], { ...ctx(), groups: live }, on), 'tree-menu-move').submenu!
    expect(move.find((x) => x.testId === 'tree-menu-move-g-inne')!.check).toBeUndefined()
    expect(move.some((x) => x.check)).toBe(false)
  })

  it('„Usuń” wyłączone, gdy wszystkie są w archiwum', () => {
    fake.file = { schema: 1, categories: { analiza: { name: 'Analiza', archived: true } } }
    useData.setState({ rd: rdFrom(fake.file) })
    expect(entry(treeMenu([categoryKey('analiza')], ctx(), on), 'tree-menu-remove').disabled).toBe(ALL_ARCHIVED)
    expect(entry(treeMenu([categoryKey('analiza'), categoryKey('journaling')], ctx(), on), 'tree-menu-remove').disabled).toBeUndefined()
  })
})

// The screen.
async function show() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CategoriesSection)))
}
const q = <T extends HTMLElement = HTMLElement>(id: string, within: ParentNode = document) => within.querySelector<T>(`[data-testid="${id}"]`)
const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="category-row"][data-category="${id}"]`)!
const selectedKeys = () => [...document.querySelectorAll<HTMLElement>('[data-tree-item][data-selected="true"]')].map((e) => e.dataset.treeItem)
const press = (el: Element, o: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...o }))
  })
const key = (el: Element, o: KeyboardEventInit) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }))
  })
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

describe('ekran: zaznaczanie (D608)', () => {
  it('klik zaznacza jeden, Ctrl+klik dokłada i zdejmuje, Shift+klik – zakres w kolejności drzewa; napis „Zaznaczone: N”', async () => {
    await show()
    await press(row('analiza'))
    expect(selectedKeys()).toEqual([categoryKey('analiza')])
    expect(q('tree-selection')).toBeNull()
    await press(row('sesja'), { ctrlKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza'), categoryKey('sesja')])
    expect(q('tree-selection')!.textContent).toContain('Zaznaczone: 2')
    expect(q('tree-selection-menu')!.textContent).toBe('Zmień 2 ▾')
    await press(row('sesja'), { ctrlKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza')])
    // Praca: Analiza, Inne obowiązki, Journaling, Sesja (class, then name); the anchor – the last clicked (a plain click on „Analiza”).
    await press(row('analiza'))
    await press(row('journaling'), { shiftKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza'), categoryKey('inne'), categoryKey('journaling')])
  })

  it('pole wiersza nie zmienia zaznaczenia; kategoria (grupa) się nie zaznacza; warianty otwartej podkategorii – razem z podkategoriami', async () => {
    await show()
    await press(row('analiza'))
    await press(row('journaling').querySelector('input')!, { ctrlKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza')])
    await press(document.querySelector('[data-testid="group-row"][data-group="g-praca"]')!, { ctrlKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza')])
    await press(q('category-more', row('nauka'))!)
    const variant = row('nauka').querySelector<HTMLElement>('[data-testid="variant-row"][data-variant="sluchanie"]')!
    await press(variant, { ctrlKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza'), variantKey('nauka', 'sluchanie')])
    // Shift+click goes through the variants shown with the subcategories: „Nauka (NotebookLM)” and its variant, then „Oglądanie wykładu”.
    await press(row('ogladanie'), { shiftKey: true })
    expect(selectedKeys()).toEqual([categoryKey('analiza'), variantKey('nauka', 'sluchanie'), categoryKey('ogladanie')])
    // Folded („mniej”), the variant stays selected out of sight: „Zaznaczone: 3”.
    await press(q('category-more', row('nauka'))!)
    expect(q('tree-selection')!.textContent).toContain('Zaznaczone: 3')
  })

  it('Ctrl+A – wszystkie widoczne; Esc – nic; klik obok – nic', async () => {
    await show()
    await press(row('analiza'))
    await key(row('analiza'), { code: 'KeyA', key: 'a', ctrlKey: true })
    expect(selectedKeys()).toHaveLength(Object.keys(settingsFrom(TOMORROW).categories).length)
    await key(row('analiza'), { key: 'Escape' })
    expect(selectedKeys()).toEqual([])
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(selectedKeys()).toEqual([])
  })
})

describe('ekran: menu i okno „Koszt…” (D609)', () => {
  it('Ctrl+klik 6 podkategorii, „Zmień 6” → „Koszt…” (✓ / „—”) → ciało 2 → „Zapisz”: od jutra, dziś bez zmiany; „Cofnij” przywraca', async () => {
    await show()
    await press(row(SIX[0]!))
    for (const id of SIX.slice(1)) await press(row(id), { ctrlKey: true })
    expect(selectedKeys()).toHaveLength(6)
    await press(q('tree-selection-menu')!)
    const menu = q('tree-menu')!
    expect(menu.textContent).toContain('Zmień 6 podkategorii')
    await press(q('tree-menu-cost')!)
    expect(q('tree-cost')).not.toBeNull()
    // Body 0 for all six – ✓ with the value; the head differs (3 and 2) – „—”, the field empty.
    expect(q('tree-cost-body-state')!.textContent).toBe('✓')
    expect(q<HTMLInputElement>('tree-cost-body-value')!.value).toBe('0')
    expect(q('tree-cost-head-state')!.textContent).toBe('—')
    expect(q<HTMLInputElement>('tree-cost-head-value')!.value).toBe('')
    expect(q<HTMLButtonElement>('tree-cost-apply')!.disabled).toBe(false)
    await press(q('tree-cost-body-plus')!)
    await press(q('tree-cost-body-plus')!)
    expect(q<HTMLInputElement>('tree-cost-body-value')!.value).toBe('2')
    await press(q('tree-cost-apply')!)
    await settle()
    expect(q('tree-cost')).toBeNull()
    for (const id of SIX) {
      expect(settingsFrom(TOMORROW).categories[id]!.costs).toEqual({ ...was(id), body: 2 })
      expect(settingsFrom(TODAY).categories[id]!.costs).toEqual(was(id))
    }
    expect(q('group-line-settings')!.textContent).toContain('Zmieniono 6 podkategorii')
    await press(q('group-line-settings-undo')!)
    await settle()
    for (const id of SIX) expect(settingsFrom(TOMORROW).categories[id]!.costs).toEqual(was(id))
  })

  it('prawy przycisk na wierszu spoza zaznaczenia – tylko on; „Przenieś do kategorii ▸” przenosi od razu', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await act(async () => {
      row('projekty').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    })
    expect(selectedKeys()).toEqual([categoryKey('projekty')])
    expect(q('tree-menu')!.textContent).toContain('Zmień 1 podkategorię')
    await press(q('tree-menu-move')!)
    await press(q('tree-menu-move-g-dom')!)
    await settle()
    expect(groupOfCategory(rdNow(), 'projekty')).toBe('g-dom')
  })
})

describe('ekran: pasek zaznaczenia (runda 1 i 2 przeglądu)', () => {
  /** The section under the bar „od jutra”, as the settings page shows it. */
  const showWithBar = async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement('div', null, createElement(FromBar), createElement(CategoriesSection))))
  }

  it('pasek zaznaczenia w sekcji nad drzewem (nie w pasku „od jutra”, T2710); linia – pod „Przelicz koszty ×N”, jak przed N13', async () => {
    await showWithBar()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    const bar = q('tree-selection')!
    expect(bar.closest('[data-testid="settings-from"]')).toBeNull()
    expect(bar.closest('[data-testid="settings-categories"]')).not.toBeNull()
    expect(bar.className).toContain('bg-panel')
    // Over the tree: before the first category.
    expect(bar.compareDocumentPosition(document.querySelector('[data-testid="group-row"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await changeTreeGroup([categoryKey('analiza'), categoryKey('sesja')], { kind: 'costs', costs: { body: 2 } })
    await settle()
    const line = q('group-line-settings')!
    expect(line.closest('[data-testid="settings-from"]')).toBeNull()
    expect(q('field-cost-scale')!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Esc z fokusem na „Zmień N ▾” czyści zaznaczenie (T2710)', async () => {
    await showWithBar()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    const button = q('tree-selection-menu')!
    button.focus()
    await key(button, { key: 'Escape' })
    expect(selectedKeys()).toEqual([])
  })

  it('„Zmień N ▾” otwiera menu i drugim kliknięciem je zamyka (przycisk nie jest „obok”, T2709)', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    const button = q('tree-selection-menu')!
    const tap = async () => {
      await act(async () => {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      })
      await press(button)
    }
    await tap()
    expect(q('tree-menu')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await tap()
    expect(q('tree-menu')).toBeNull()
    expect(selectedKeys()).toHaveLength(2)
  })

  it('menu wiersza: przycisk nie jest „rozwinięty”, a klik w niego otwiera menu paska (nie zamyka, T2716)', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await act(async () => {
      row('analiza').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    })
    const button = q('tree-selection-menu')!
    expect(q('tree-menu')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    await press(button)
    expect(q('tree-menu')).not.toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('wiersz wariantu ma własne tło – zaznaczona podkategoria nie przebija (T2715)', async () => {
    await show()
    await press(q('category-more', row('nauka'))!)
    expect(row('nauka').querySelector<HTMLElement>('[data-testid="variant-row"]')!.className).toContain('bg-panel')
  })
})

describe('okno „Koszt…” i zapis – runda 2 przeglądu', () => {
  it('wpisana liczba bez Enter i klik „Zapisz” – zapisuje (pole zatwierdzone najpierw, T2711); „Zapisz” zawsze aktywne', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await press(q('tree-selection-menu')!)
    await press(q('tree-menu-cost')!)
    const apply = q<HTMLButtonElement>('tree-cost-apply')!
    expect(apply.disabled).toBe(false)
    const input = q<HTMLInputElement>('tree-cost-body-value')!
    await act(async () => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '3')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await press(apply)
    await settle()
    expect(q('tree-cost')).toBeNull()
    expect(settingsFrom(TOMORROW).categories.analiza!.costs.body).toBe(3)
    expect(settingsFrom(TOMORROW).categories.sesja!.costs.body).toBe(3)
  })

  it('nic nieruszone – „Zapisz” zamyka okno bez zapisu', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await press(q('tree-selection-menu')!)
    await press(q('tree-menu-cost')!)
    await press(q('tree-cost-apply')!)
    await settle()
    expect(q('tree-cost')).toBeNull()
    expect(fake.sent).toBe(0)
  })

  it('zapis, który się nie wysłał – bez dymka „Nic się nie zmienia”; „Cofnij”, które się nie wysłało – linia zostaje (T2713)', async () => {
    fake.fail = true
    expect(await changeTreeGroup([categoryKey('analiza')], { kind: 'costs', costs: { body: 2 } })).toBeNull()
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Nic się nie zmienia'))).toBe(false)
    fake.fail = false
    await changeTreeGroup([categoryKey('analiza')], { kind: 'costs', costs: { body: 2 } })
    fake.fail = true
    await act(() => undoGroupLine('settings'))
    expect(line()).toBeDefined()
    fake.fail = false
    await act(() => undoGroupLine('settings'))
    expect(line()).toBeUndefined()
    expect(settingsFrom(TOMORROW).categories.analiza!.costs.body).toBe(0)
  })

  it('„od dziś” przy nieczytelnym dniu: część bez daty (podkategoria do archiwum) zapisana, część z datą (wariant) nie – dymek to mówi (T2714)', async () => {
    useSettingsFrom.setState({ mode: 'today' })
    fake.todayType = null
    const done = await changeTreeGroup([categoryKey('analiza'), variantKey('nauka', 'sluchanie')], { kind: 'remove' })
    expect(done?.changes.map((c) => c.key)).toEqual([categoryKey('analiza')])
    expect(rdNow().categories.analiza!.archived).toBe(true)
    expect(settingsOn(rdNow().settings, TODAY, Date.now() + 1000).categories.nauka!.variants[0]!.archived).toBeFalsy()
    expect(fake.events).toEqual([])
    expect(line()?.text).toBe('Usunięto 1 podkategorię')
    expect(useUi.getState().toasts.some((t) => t.text === TREE_TODAY_PART_TEXT)).toBe(true)
  })
})

describe('runda 3 przeglądu', () => {
  /** The section under the bar „od jutra”, as the settings page shows it. */
  const showWithBar = async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement('div', null, createElement(FromBar), createElement(CategoriesSection))))
  }
  const pointerDown = (el: Element) =>
    act(async () => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })

  it('klik w linię zmiany i jej „Cofnij” nie czyści zaznaczenia (linia nie jest „obok”, T2717)', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await changeTreeGroup([categoryKey('analiza'), categoryKey('sesja')], { kind: 'costs', costs: { body: 2 } })
    await settle()
    await pointerDown(q('group-line-settings-undo')!)
    expect(selectedKeys()).toHaveLength(2)
    await pointerDown(q('group-line-settings')!)
    expect(selectedKeys()).toHaveLength(2)
  })

  it('część zatrzymana („od dziś”, dzień nieczytelny) – dymek także, gdy zapis spotkał pytanie (T2718)', async () => {
    useSettingsFrom.setState({ mode: 'today' })
    fake.todayType = null
    fake.conflict = true
    const done = await changeTreeGroup([categoryKey('analiza'), variantKey('nauka', 'sluchanie')], { kind: 'remove' })
    expect(done?.undo).toBeNull()
    expect(useUi.getState().toasts.some((t) => t.text === TREE_TODAY_PART_TEXT)).toBe(true)
  })

  it('Esc z fokusem w pasku „od jutra” (po „od dziś”) i z fokusem na body czyści zaznaczenie (T2719)', async () => {
    await showWithBar()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    const today = document.querySelector<HTMLElement>('[data-testid="settings-from"] [role="radio"]:nth-child(2)')!
    expect(today.textContent).toBe('od dziś')
    await pointerDown(today)
    await press(today)
    today.focus()
    expect(selectedKeys()).toHaveLength(2)
    await key(today, { key: 'Escape' })
    expect(selectedKeys()).toEqual([])
    // The focus fell to the body (the row moved away under it).
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    ;(document.activeElement as HTMLElement | null)?.blur()
    await key(document.body, { key: 'Escape' })
    expect(selectedKeys()).toEqual([])
  })

  it('„Cofnij” przy nieczytelnym dniu „od dziś”: wraca część bez daty, linia zostaje i mówi, co zostało; drugie „Cofnij” po odczytaniu dnia cofa resztę (T2720)', async () => {
    useSettingsFrom.setState({ mode: 'today' })
    await changeTreeGroup([categoryKey('analiza'), variantKey('nauka', 'sluchanie')], { kind: 'remove' })
    expect(line()?.text).toBe('Usunięto 1 podkategorię i 1 wariant')
    const later = () => settingsOn(rdNow().settings, TODAY, Date.now() + 1000)
    expect(later().categories.nauka!.variants[0]!.archived).toBe(true)
    fake.events = []
    fake.todayType = null
    await act(() => undoGroupLine('settings'))
    expect(rdNow().categories.analiza!.archived).toBeFalsy()
    expect(later().categories.nauka!.variants[0]!.archived).toBe(true)
    expect(line()?.text).toBe('Usunięto 1 wariant · resztę cofnięto')
    expect(useUi.getState().toasts.some((t) => t.text === TREE_UNDO_TODAY_TEXT)).toBe(true)
    expect(fake.events).toEqual([])
    fake.todayType = 'zwykly'
    await act(() => undoGroupLine('settings'))
    expect(later().categories.nauka!.variants[0]!.archived).toBeFalsy()
    expect(line()).toBeUndefined()
    expect(fake.events).toMatchObject([{ k: 'day.snapshot', day: TODAY, reason: 'today' }])
  })

  it('okno „Koszt…”: pula ruszona i przywrócona do wspólnej wartości – nic; „Zapisz” zamyka bez zapisu i bez dymka (T2721)', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await press(q('tree-selection-menu')!)
    await press(q('tree-menu-cost')!)
    await press(q('tree-cost-body-plus')!)
    await press(q('tree-cost-body-minus')!)
    expect(q<HTMLInputElement>('tree-cost-body-value')!.value).toBe('0')
    await press(q('tree-cost-apply')!)
    await settle()
    expect(q('tree-cost')).toBeNull()
    expect(fake.sent).toBe(0)
    expect(useUi.getState().toasts.some((t) => t.text.startsWith('Nic się nie zmienia'))).toBe(false)
  })

  it('menu paska po menu wiersza otwiera się od nowa – bez otwartego podmenu wiersza (`seq`, T2716)', async () => {
    await show()
    await press(row('analiza'))
    await press(row('sesja'), { ctrlKey: true })
    await act(async () => {
      row('analiza').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    })
    await press(q('tree-menu-place')!)
    expect(q('tree-menu-place-away')).not.toBeNull()
    const button = q('tree-selection-menu')!
    await pointerDown(button)
    await press(button)
    expect(q('tree-menu')).not.toBeNull()
    expect(q('tree-menu-place-away')).toBeNull()
  })
})
