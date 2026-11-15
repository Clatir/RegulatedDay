// @vitest-environment jsdom
/**
 * ✎ beside the lists of a block's panel (D514): „Edytuj podkategorię” / „Edytuj wariant” / „Edytuj rutynę” open the window of „+ Nowa…” filled with
 * what is chosen; „Zapisz” writes what changed from today on (whatever „Od kiedy” of the settings says), the window says how many blocks it
 * changes, Esc and „Anuluj” change nothing; no ✎ in a panel that cannot change, nor for a subcategory and a variant on a day gone by.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { routineFrom } from '@shared/model/routines'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { saveCalendars } from '@renderer/features/settings/calendarEdits'
import { saveSettingsFrom, useSettingsFrom } from '@renderer/features/settings/settingsStore'
import { installEscape } from '@renderer/lib/escape'
import { saveRd, updateRecord, useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), saveRecord: vi.fn(async () => [{ status: 'applied' }]), saveRd: vi.fn(async () => [{ status: 'applied' }]), updateRecord: vi.fn(async () => [{ status: 'applied' }]) }))
vi.mock('@renderer/features/settings/settingsStore', async (orig) => ({ ...(await orig<typeof import('@renderer/features/settings/settingsStore')>()), saveSettingsFrom: vi.fn(async () => true) }))
vi.mock('@renderer/features/settings/calendarEdits', async (orig) => ({ ...(await orig<typeof import('@renderer/features/settings/calendarEdits')>()), saveCalendars: vi.fn(async () => ({ out: [{ status: 'applied' }], entry: null })) }))

const TODAY = '2026-11-18'
const rd = rdFrom({})
const routine = routineFrom({ schema: 1, id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false })!
const names = { rd, settings: DEFAULT_SETTINGS, routines: [routine], requests: [] }
/** The days' files `window.rd.dayFiles` answers (the others – no file). */
let files: Record<string, Record<string, unknown>> = {}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})
beforeEach(() => {
  files = {}
  ;(window as unknown as { rd: unknown }).rd = {
    pathForFile: (f: File) => `C:/${f.name}`,
    dayFiles: vi.fn(async (dates: string[]) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null]))),
    logEvents: vi.fn(async () => undefined)
  }
  useData.setState({ view: { today: TODAY } as never, rd, routines: [routine], templates: [], seriesPlans: [] })
  useSettingsFrom.setState({ mode: 'tomorrow', date: null })
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  vi.mocked(saveSettingsFrom).mockClear()
  vi.mocked(saveRd).mockClear()
  vi.mocked(updateRecord).mockClear()
  vi.mocked(saveCalendars).mockClear()
})

type Extra = { readOnly?: boolean; day?: string }
async function mount(block: PlanBlock, o: Extra = {}) {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange, onClose: () => undefined, ...o })))
  return onChange
}
const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`)
const type = (id: string, v: string) =>
  act(() => {
    const el = q<HTMLInputElement>(id)!
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })
const click = (id: string) => act(async () => void q(id)!.click())
const save = () => click('new-thing-save')
const flush = () => act(async () => undefined)
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
const fileBlock = (id: string, p: Partial<PlanBlock> = {}) => ({ ...planBlock({ id, categoryId: 'projekty', startMin: 600, durationMin: 30, origin: 'user', ...p }) })

const projekty = planBlock({ id: 'b1', categoryId: 'projekty', startMin: 9 * 60, durationMin: 30, origin: 'user' })
const spacer = planBlock({ id: 'b2', categoryId: 'regeneracja', variantId: 'spacer', startMin: 9 * 60, durationMin: 30, origin: 'user' })
const withRoutine = planBlock({ id: 'b3', categoryId: 'rutyny', routine: 'r1', startMin: 8 * 60, durationMin: 20, origin: 'user' })
const noRoutine = planBlock({ id: 'b4', categoryId: 'rutyny', startMin: 8 * 60, durationMin: 20, origin: 'user' })

describe('✎ przy listach', () => {
  it('Podkategoria zawsze, Wariant gdy wybrany, Rutyna gdy wybrana – z opisami dla czytnika', async () => {
    await mount(projekty)
    expect(q('edit-category')!.getAttribute('aria-label')).toBe('Edytuj podkategorię')
    expect(q('edit-variant')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await mount(spacer)
    expect(q('edit-category')).not.toBeNull()
    expect(q('edit-variant')!.getAttribute('aria-label')).toBe('Edytuj wariant')
    act(() => root!.unmount())
    host!.remove()
    await mount(withRoutine)
    expect(q('edit-routine')!.getAttribute('aria-label')).toBe('Edytuj rutynę')
    act(() => root!.unmount())
    host!.remove()
    await mount(noRoutine)
    expect(q('block-routine')).not.toBeNull()
    expect(q('edit-routine')).toBeNull()
  })

  it('panel tylko do odczytu – żadnego; dzień miniony – bez podkategorii i wariantu, rutyna zostaje; dziś i przyszły – są', async () => {
    await mount(spacer, { readOnly: true })
    for (const id of ['edit-category', 'edit-variant']) expect(q(id)).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await mount(withRoutine, { readOnly: true })
    expect(q('edit-routine')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await mount(spacer, { day: '2026-11-17' })
    expect(q('edit-category')).toBeNull()
    expect(q('edit-variant')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await mount(withRoutine, { day: '2026-11-17' })
    expect(q('edit-routine')).not.toBeNull()
    for (const day of [TODAY, '2026-11-20']) {
      act(() => root!.unmount())
      host!.remove()
      await mount(spacer, { day })
      expect(q('edit-category')).not.toBeNull()
      expect(q('edit-variant')).not.toBeNull()
    }
  })
})

describe('okno podkategorii', () => {
  it('na środku, z nazwą „Podkategoria <nazwa>” i polami wybranej podkategorii; Esc i „Anuluj” nic nie zmieniają', async () => {
    const onChange = await mount(projekty)
    await click('edit-category')
    const win = q('edit-category-window')!
    expect(win.textContent).toContain('Podkategoria Projekty')
    expect(win.parentElement!.className).toContain('items-center')
    expect(q<HTMLInputElement>('new-category-name')!.value).toBe('Projekty')
    expect(q<HTMLSelectElement>('new-category-group')!.value).toBe('g-wolne')
    expect(q<HTMLSelectElement>('new-category-class')!.value).toBe('free')
    expect(q<HTMLSelectElement>('new-category-place')!.value).toBe('computer')
    expect(q<HTMLInputElement>('new-cost-head')!.value).toBe('3')
    expect(q<HTMLInputElement>('new-cost-emotions')!.value).toBe('0')
    expect(q('edit-scope')!.textContent).toBe('Nic nie zmieniono.')
    await type('new-cost-head', '4')
    escape()
    expect(q('edit-category-window')).toBeNull()
    await click('edit-category')
    await type('new-category-name', 'Coś innego')
    await click('new-thing-cancel')
    expect(q('edit-category-window')).toBeNull()
    expect(saveSettingsFrom).not.toHaveBeenCalled()
    expect(saveRd).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('koszt: zapis od dziś mimo „od jutra” w Ustawieniach, tylko zmieniona pula; okno liczy bloki (bez tych z własnym kosztem)', async () => {
    files[TODAY] = { schema: 1, date: TODAY, blocks: [fileBlock('a'), fileBlock('c', { costs: { head: 2, emotions: 2, senses: 2 } }), fileBlock('d', { categoryId: 'analiza' })] }
    files['2026-11-21'] = { schema: 1, date: '2026-11-21', blocks: [fileBlock('e')] }
    files['2026-11-17'] = { schema: 1, date: '2026-11-17', blocks: [fileBlock('past')] }
    useData.setState({
      templates: [{ id: 't1', name: 'T', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2026-01-01', blocks: [planBlock({ id: 'n1', categoryId: 'projekty', startMin: 600, durationMin: 30 })], budgetMin: null, maxMin: null }] }]
    })
    expect(useSettingsFrom.getState().mode).toBe('tomorrow')
    const onChange = await mount(projekty)
    await click('edit-category')
    await flush()
    await type('new-cost-head', '4')
    await flush()
    // Today's „a”, the 21st „e”, the template's „n1”: the block with a cost of its own and the one of another subcategory are not changed.
    expect(q('edit-scope')!.textContent).toBe('Zmieni 3 bloki od dziś')
    expect(q('edit-scope-detail')!.textContent).toContain('w dniach: 2 · w szablonach: 1 · w seriach: 0')
    expect(window.rd.dayFiles).toHaveBeenCalledTimes(1)
    await save()
    expect(saveSettingsFrom).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveSettingsFrom).mock.calls[0]).toEqual([{ categories: { projekty: { costs: { head: 4 } } } }, { from: TODAY, at: expect.any(Number) }])
    expect(saveRd).not.toHaveBeenCalled()
    expect(q('edit-category-window')).toBeNull()
    // The panel's block stays as it was: the edit changes the thing, not the choice.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nazwa, kolor, kategoria i kalendarz: od razu (rd.json), bez ustawień z datą; okno mówi, że działa też wstecz; Enter w nazwie zapisuje', async () => {
    files[TODAY] = { schema: 1, date: TODAY, blocks: [fileBlock('a'), fileBlock('c', { costs: { head: 2, emotions: 2, senses: 2 } })] }
    await mount(projekty)
    await click('edit-category')
    await flush()
    await type('new-category-name', 'Moje projekty')
    await act(async () => {
      const el = q<HTMLSelectElement>('new-category-group')!
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, 'g-dom')
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    // Not a change of cost: every block of the subcategory counts.
    expect(q('edit-scope')!.textContent).toBe('Zmieni 2 bloki od dziś')
    expect(q('edit-category-window')!.textContent).toContain('także w dniach minionych')
    await act(async () => {
      q<HTMLInputElement>('new-category-name')!.focus()
      q<HTMLInputElement>('new-category-name')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(saveSettingsFrom).not.toHaveBeenCalled()
    expect(saveRd).toHaveBeenCalledTimes(1)
    const fn = vi.mocked(saveRd).mock.calls[0]![0] as (raw: Record<string, unknown>) => { categories: Record<string, { name: string }> }
    expect(fn({ schema: 1 }).categories.projekty!.name).toBe('Moje projekty')
    expect(saveCalendars).toHaveBeenCalledTimes(1)
    expect(q('edit-category-window')).toBeNull()
  })

  it('bez zmian „Zapisz” tylko zamyka okno – nic nie zapisuje', async () => {
    await mount(projekty)
    await click('edit-category')
    await save()
    expect(q('edit-category-window')).toBeNull()
    expect(saveSettingsFrom).not.toHaveBeenCalled()
    expect(saveRd).not.toHaveBeenCalled()
    expect(saveCalendars).not.toHaveBeenCalled()
  })

  it('zapis odmówiony – okno zostaje, nic dalej nie idzie', async () => {
    vi.mocked(saveSettingsFrom).mockResolvedValueOnce(false)
    await mount(projekty)
    await click('edit-category')
    await type('new-cost-head', '5')
    await type('new-category-name', 'Inna nazwa')
    await save()
    expect(q('edit-category-window')).not.toBeNull()
    expect(saveRd).not.toHaveBeenCalled()
  })
})

describe('okno wariantu', () => {
  it('„Wariant <nazwa>”: nazwa, koszt albo „jak podkategoria”, miejsce; zapis od dziś listą całą z wariantem zmienionym', async () => {
    files['2026-11-19'] = { schema: 1, date: '2026-11-19', blocks: [fileBlock('a', { categoryId: 'regeneracja', variantId: 'spacer' }), fileBlock('b', { categoryId: 'regeneracja', variantId: 'spacer', costs: { head: 1, emotions: 1, senses: 1 } }), fileBlock('c', { categoryId: 'regeneracja', variantId: 'cisza' })] }
    await mount(spacer)
    await click('edit-variant')
    await flush()
    expect(q('edit-variant-window')!.textContent).toContain('Wariant Samotny spacer')
    expect(q<HTMLInputElement>('new-variant-name')!.value).toBe('Samotny spacer')
    expect(q<HTMLSelectElement>('new-variant-place')!.value).toBe('-')
    // „Koszt jak podkategoria” off (it has a cost of its own): the three numbers are there.
    expect(q<HTMLInputElement>('new-cost-emotions')!.value).toBe('-3')
    await click('new-variant-same')
    await flush()
    // A change of cost: „b” has a cost of its own – only „a”.
    expect(q('edit-scope')!.textContent).toBe('Zmieni 1 blok od dziś')
    await type('new-variant-name', 'Długi spacer')
    await flush()
    expect(q('edit-scope')!.textContent).toBe('Zmieni 2 bloki od dziś')
    await save()
    expect(saveSettingsFrom).toHaveBeenCalledTimes(1)
    const [make, when] = vi.mocked(saveSettingsFrom).mock.calls[0]!
    expect(when).toEqual({ from: TODAY, at: expect.any(Number) })
    const list = (make as (raw: Record<string, unknown>) => { categories: { regeneracja: { variants: Array<{ id: string; name: string; costs?: unknown }> } } })({ schema: 1 }).categories.regeneracja.variants
    expect(list.map((v) => v.id)).toEqual(DEFAULT_SETTINGS.categories.regeneracja!.variants.map((v) => v.id))
    const spacerNow = list.find((v) => v.id === 'spacer')!
    expect(spacerNow.name).toBe('Długi spacer')
    expect(spacerNow.costs).toBeNull()
    expect(q('edit-variant-window')).toBeNull()
  })

  it('Esc zostawia wszystko', async () => {
    await mount(spacer)
    await click('edit-variant')
    await type('new-variant-name', 'Inny')
    escape()
    expect(q('edit-variant-window')).toBeNull()
    expect(saveSettingsFrom).not.toHaveBeenCalled()
  })
})

describe('okno rutyny', () => {
  it('„Rutyna <nazwa>” z krokami; zapis przez rekord rutyny (bez daty), liczba bloków z rutyną; dzień miniony – też ma ✎', async () => {
    files['2026-11-20'] = { schema: 1, date: '2026-11-20', blocks: [fileBlock('a', { categoryId: 'rutyny', routine: 'r1' }), fileBlock('b', { categoryId: 'rutyny' })] }
    await mount(withRoutine, { day: '2026-11-17' })
    await click('edit-routine')
    await flush()
    expect(q('edit-routine-window')!.textContent).toContain('Rutyna Poranna')
    expect(q<HTMLInputElement>('new-routine-name')!.value).toBe('Poranna')
    expect(q('steps-normal')!.querySelector<HTMLInputElement>('input[aria-label="Krok 1"]')!.value).toBe('Woda')
    await type('new-routine-name', 'Wieczorna')
    await flush()
    expect(q('edit-scope')!.textContent).toBe('Zmieni 1 blok od dziś')
    await save()
    expect(updateRecord).toHaveBeenCalledTimes(1)
    const [rel, fn] = vi.mocked(updateRecord).mock.calls[0]!
    expect(rel).toBe('routines/r1.json')
    const raw = { schema: 1, id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false, cost: 'kept' }
    expect(fn(raw)).toEqual({ ...raw, name: 'Wieczorna' })
    expect(saveSettingsFrom).not.toHaveBeenCalled()
    expect(q('edit-routine-window')).toBeNull()
  })
})
