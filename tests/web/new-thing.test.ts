// @vitest-environment jsdom
/**
 * „+ Nowa…” in the lists of a block's panel (D463): „Kategoria”, „Wariant” and „Rutyna” end with it; it opens a window in the middle of
 * the screen with the fields of the thing; „Zapisz” makes the thing through the same save as its screen and the block takes it (the
 * routine with its steps and length, D460); „Anuluj” and Esc leave the block as it was; a list of a panel that cannot change (read
 * only) has no such item.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { routineFrom, ROUTINE_SCHEMA } from '@shared/model/routines'
import { DEFAULT_SETTINGS, type RulesSettings } from '@shared/model/settings'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { HAND_ON_MS } from '@renderer/features/plan/NewThingDialogs'
import { saveSettingsFrom } from '@renderer/features/settings/settingsStore'
import { installEscape } from '@renderer/lib/escape'
import { saveRd, saveRecord, useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), saveRecord: vi.fn(async () => [{ status: 'applied' }]), saveRd: vi.fn(async () => []) }))
vi.mock('@renderer/features/settings/settingsStore', async (orig) => ({ ...(await orig<typeof import('@renderer/features/settings/settingsStore')>()), saveSettingsFrom: vi.fn(async () => true) }))

const rd = rdFrom({})
const names = { rd, settings: DEFAULT_SETTINGS, routines: [], requests: [] }

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})
beforeEach(() => {
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}` }
  useData.setState({ view: { today: '2026-11-18' } as never })
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  vi.mocked(saveRecord).mockClear()
  vi.mocked(saveSettingsFrom).mockClear()
  vi.mocked(saveRd).mockClear()
})

type Extra = { readOnly?: boolean; day?: string; place?: { scope: 'day'; date: string; templateId: null } }
async function mount(block: PlanBlock, o: Extra = {}) {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange, onClose: () => undefined, ...o })))
  return onChange
}
/** The panel rendered again – with the data the screen has now (`settings`) and the screen's code of this render (`onChange`). */
async function again(block: PlanBlock, settings: RulesSettings) {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  await act(async () => root!.render(createElement(BlockEditor, { block, plan: [], names: { ...names, settings }, computers: [], onChange, onClose: () => undefined })))
  return onChange
}
const withCategory = (id: string, rules: Record<string, unknown>): RulesSettings => ({ ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, [id]: { ...DEFAULT_SETTINGS.categories.inne!, ...rules } } }) as RulesSettings
const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`)
const choose = (id: string, value: string) =>
  act(() => {
    const el = q<HTMLSelectElement>(id)!
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
const type = (id: string, v: string) =>
  act(() => {
    const el = q<HTMLInputElement>(id)!
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })
const save = () => act(async () => void q('new-thing-save')!.click())
const labels = (id: string) => [...q<HTMLSelectElement>(id)!.options].map((o) => o.textContent)

const regen = planBlock({ id: 'b1', categoryId: 'regeneracja', startMin: 9 * 60, durationMin: 30, origin: 'user' })
const routineBlock = planBlock({ id: 'b2', categoryId: 'rutyny', startMin: 8 * 60, durationMin: 20, origin: 'user' })

describe('lista kończy się pozycją „+ Nowa…”', () => {
  it('Kategoria, Wariant i Rutyna mają ją na końcu; panel tylko do odczytu – nie', async () => {
    await mount(regen)
    expect(labels('block-category').at(-1)).toBe('+ Nowa…')
    expect(labels('block-variant').at(-1)).toBe('+ Nowa…')
    act(() => root!.unmount())
    host!.remove()
    await mount(routineBlock)
    expect(labels('block-routine').at(-1)).toBe('+ Nowa…')
    act(() => root!.unmount())
    host!.remove()
    await mount(regen, { readOnly: true })
    expect(labels('block-category')).not.toContain('+ Nowa…')
    expect(labels('block-variant')).not.toContain('+ Nowa…')
  })
})

describe('„+ Nowa…” → rutyna', () => {
  it('okno na środku z nazwą i krokami; „Zapisz” tworzy rutynę i blok ją przyjmuje (kroki, długość)', async () => {
    const onChange = await mount(routineBlock)
    choose('block-routine', '__new__')
    expect(q('new-routine')).not.toBeNull()
    // In the middle of the screen: the overlay centres its box.
    expect(q('new-routine')!.parentElement!.className).toContain('items-center')
    expect(onChange).not.toHaveBeenCalled()
    type('new-routine-name', 'Wieczór')
    // The first step of the usual version: a name and a time.
    const first = q('steps-normal')!.querySelector<HTMLInputElement>('input[aria-label="Krok 1"]')!
    act(() => {
      first.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(first, 'Woda')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const time = q('steps-normal')!.querySelector<HTMLInputElement>('input[aria-label="Czas kroku 1"]')!
    act(() => {
      time.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(time, '10')
      time.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await save()
    expect(saveRecord).toHaveBeenCalledTimes(1)
    const [rel, before, after] = vi.mocked(saveRecord).mock.calls[0] as unknown as [string, null, Record<string, unknown>]
    expect(rel).toMatch(/^routines\//)
    expect(before).toBeNull()
    expect(after).toMatchObject({ schema: ROUTINE_SCHEMA, name: 'Wieczór', archived: false, worse: [] })
    const made = routineFrom(after)!
    expect(made.normal.map((s) => [s.name, s.min])).toEqual([['Woda', 10]])
    expect(q('new-routine')).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toMatchObject({ routine: made.id, durationMin: 10 })
    expect(onChange.mock.calls[0]![0].steps).toHaveLength(1)
  })

  it('Esc i „Anuluj” zostawiają blok – nic nie zapisano; bez nazwy „Zapisz” jest nieaktywne', async () => {
    const onChange = await mount(routineBlock)
    choose('block-routine', '__new__')
    expect(q<HTMLButtonElement>('new-thing-save')!.disabled).toBe(true)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('new-routine')).toBeNull()
    choose('block-routine', '__new__')
    act(() => void q('new-thing-cancel')!.click())
    expect(q('new-routine')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(saveRecord).not.toHaveBeenCalled()
    // The list still shows what it showed: no item chosen by the click.
    expect(q<HTMLSelectElement>('block-routine')!.value).toBe('-')
  })
})

describe('„+ Nowa…” → wariant i kategoria', () => {
  it('wariant: nazwa i koszty; zapis od dziś z listą całą i wariantem na jej końcu, blok go przyjmuje', async () => {
    const onChange = await mount(regen)
    choose('block-variant', '__new__')
    expect(q('new-variant')).not.toBeNull()
    type('new-variant-name', 'Kąpiel')
    await save()
    expect(saveSettingsFrom).toHaveBeenCalledTimes(1)
    const [patch, from] = vi.mocked(saveSettingsFrom).mock.calls[0]!
    const variants = (patch as { categories: { regeneracja: { variants: Array<{ id: string; name: string; costs: unknown }> } } }).categories.regeneracja.variants
    expect(variants.slice(0, -1).map((v) => v.name)).toEqual(DEFAULT_SETTINGS.categories.regeneracja!.variants.map((v) => v.name))
    const added = variants.at(-1)!
    expect(added.name).toBe('Kąpiel')
    expect(added.costs).toEqual(DEFAULT_SETTINGS.categories.regeneracja!.costs)
    expect(from.from).toBe('2026-11-18')
    expect(from.at).not.toBeNull()
    // Handed on once the panel's data have it – to the screen's code of that render.
    expect(onChange).not.toHaveBeenCalled()
    const regenNow = DEFAULT_SETTINGS.categories.regeneracja!
    const now = await again(regen, { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, regeneracja: { ...regenNow, variants: [...regenNow.variants, added as never] } } })
    expect(now).toHaveBeenCalledWith({ variantId: added.id })
    expect(onChange).not.toHaveBeenCalled()
    expect(q('new-variant')).toBeNull()
  })

  it('kategoria: nazwa, klasa, koszty, miejsce i własności; blok dostaje nową kategorię bez wariantu', async () => {
    const onChange = await mount(regen)
    choose('block-category', '__new__')
    expect(q('new-category')).not.toBeNull()
    expect(q('new-category-class')).not.toBeNull()
    expect(q('new-category-place')).not.toBeNull()
    expect(q('new-cost-head')).not.toBeNull()
    type('new-category-name', 'Ogród')
    choose('new-category-class', 'life')
    await save()
    expect(saveSettingsFrom).toHaveBeenCalledTimes(1)
    const [patch] = vi.mocked(saveSettingsFrom).mock.calls[0]!
    const [id, rules] = Object.entries((patch as { categories: Record<string, Record<string, unknown>> }).categories)[0]!
    expect(rules).toMatchObject({ cls: 'life', kind: 'other', place: 'computer', costs: { head: 1, emotions: 1, senses: 1 }, background: false })
    // The name and colour after the rules (as „Kategorie”).
    expect(saveRd).toHaveBeenCalledTimes(1)
    // Przegląd 2: not the code of the render of the click (its data have no rules of the new category – no exchange in „Dziś”),
    // but the screen's once its data have the category; the window waits till then.
    expect(onChange).not.toHaveBeenCalled()
    expect(q('new-category')).not.toBeNull()
    await again(regen, DEFAULT_SETTINGS)
    expect(onChange).not.toHaveBeenCalled()
    const now = await again(regen, withCategory(id, rules))
    expect(onChange).not.toHaveBeenCalled()
    expect(now).toHaveBeenCalledTimes(1)
    expect(now).toHaveBeenCalledWith({ categoryId: id, variantId: null })
    expect(q('new-category')).toBeNull()
  })

  it('dane, które nie pokazują nowej kategorii, nie trzymają okna bez końca: po chwili blok i tak ją dostaje', async () => {
    const onChange = await mount(regen)
    choose('block-category', '__new__')
    type('new-category-name', 'Ogród')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await save()
      expect(onChange).not.toHaveBeenCalled()
      await act(async () => void vi.advanceTimersByTime(HAND_ON_MS))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(q('new-category')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dzień miniony: bez „+ Nowa…” w Wariancie i Kategorii (zapisują się od dziś); Rutyna – tak; dziś i dzień przyszły – tak', async () => {
    await mount(regen, { day: '2026-11-17' })
    expect(labels('block-category')).not.toContain('+ Nowa…')
    expect(labels('block-variant')).not.toContain('+ Nowa…')
    act(() => root!.unmount())
    host!.remove()
    await mount(routineBlock, { day: '2026-11-17' })
    expect(labels('block-routine').at(-1)).toBe('+ Nowa…')
    act(() => root!.unmount())
    host!.remove()
    // The day of the attachments' place when the screen does not say it.
    await mount(regen, { place: { scope: 'day', date: '2026-11-10', templateId: null } })
    expect(labels('block-category')).not.toContain('+ Nowa…')
    for (const day of ['2026-11-18', '2026-11-20']) {
      act(() => root!.unmount())
      host!.remove()
      await mount(regen, { day })
      expect(labels('block-category').at(-1)).toBe('+ Nowa…')
      expect(labels('block-variant').at(-1)).toBe('+ Nowa…')
    }
  })

  it('anulowanie okna kategorii nie zmienia bloku', async () => {
    const onChange = await mount(regen)
    choose('block-category', '__new__')
    act(() => void q('new-thing-cancel')!.click())
    expect(q('new-category')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(saveSettingsFrom).not.toHaveBeenCalled()
  })
})
