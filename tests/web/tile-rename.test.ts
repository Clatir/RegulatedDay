// @vitest-environment jsdom
/**
 * N9 (D430, D431, T2552): the name of a block changed in place – F2 on the one selected block or a double click on the name on its tile
 * (the axes of „Dziś” and „Szablony”, the columns of „Tydzień” and „3 dni”): a field on the tile, Enter and a click beside save it, Esc
 * throws it away, empty – named as before (`null`). The field is the tile's own: the keys of the window (Delete, Esc, the arrows) are not
 * taken from it, a double click on anything but the name does nothing, a block that cannot be renamed has no field.
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HorizonBlock } from '@shared/engine/week'
import { BLOCK_NAME_MAX } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { BlockBox } from '@renderer/features/week/DayGrid'
import { isEditable } from '@renderer/lib/deleteKey'
import { installEscape, onModal } from '@renderer/lib/escape'
import { useUi } from '@renderer/store/ui'

let root: Root | null = null
let host: HTMLElement | null = null
let removers: Array<() => void> = []
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  for (const off of removers) off()
  removers = []
  useUi.setState({ pick: null })
  vi.useRealTimers()
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const render = (el: ReactNode) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(el))
}
const click = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init })))
/** A double click as the browser sends it: two clicks (details 1 and 2), then `dblclick`. */
const dblclick = (el: Element, init: MouseEventInit = {}) => {
  click(el, init)
  click(el, { ...init, detail: 2 })
  act(() => void el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, ...init })))
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void el.dispatchEvent(e))
  return e
}
/** Types into a React input (the value setter of the prototype, then `input`). */
const type = (el: HTMLInputElement, text: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({ id: 'a', startMin: 600, endMin: 660, title: 'Analiza', marks: [], color: '#79AFAB', categoryId: 'inne', background: false, movable: true, ...over })
const mountAxis = (rename: Record<string, unknown>, items: TimelineItem[] = [item()], extra: Record<string, unknown> = {}) =>
  render(createElement(Timeline, { items, markers: [], selected: null, onSelect: vi.fn(), onMove: vi.fn(), from: 360, to: 1320, rename, ...extra } as never))
const infoOf = (text = 'Analiza', hint = 'Inne obowiązki') => (id: string) => (id === 'a' ? { text, hint } : null)

describe('nazwa w miejscu – oś (Timeline)', () => {
  it('dwuklik w nazwę kafelka: pole z nazwą własną, zaznaczoną, podpowiedź – jak blok nazywałby się bez niej', () => {
    const start = vi.fn()
    mountAxis({ active: null, info: infoOf(), start, finish: vi.fn() })
    dblclick(q('block-a')!.querySelector('[data-tile-name]')!)
    expect(start).toHaveBeenCalledWith('a')
  })

  it('pole stoi na kafelku, ma fokus, nazwę własną i podpowiedź; Enter oddaje wpisany tekst', () => {
    const finish = vi.fn()
    mountAxis({ active: 'a', info: infoOf('Analiza', 'Inne obowiązki'), start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    expect(field).not.toBeNull()
    expect(field.tagName).toBe('INPUT')
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('Analiza')
    expect(field.placeholder).toBe('Inne obowiązki')
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Analiza'.length)
    type(field, 'Nowa nazwa')
    key(field, 'Enter')
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith('a', 'Nowa nazwa')
  })

  it('klik obok (utrata fokusu) zapisuje, jeden raz', () => {
    const finish = vi.fn()
    mountAxis({ active: 'a', info: infoOf(), start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    type(field, 'Inna')
    act(() => field.blur())
    expect(finish.mock.calls).toEqual([['a', 'Inna']])
  })

  it('Esc anuluje (null) i nie idzie dalej – nie zamyka panelu ani nie czyści zaznaczenia', () => {
    const finish = vi.fn()
    const reached = vi.fn()
    removers.push(installEscape())
    window.addEventListener('keydown', reached)
    removers.push(() => window.removeEventListener('keydown', reached))
    mountAxis({ active: 'a', info: infoOf(), start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    type(field, 'Coś innego')
    const e = key(field, 'Escape')
    expect(finish.mock.calls).toEqual([['a', null]])
    expect(e.defaultPrevented).toBe(true)
    expect(reached.mock.calls.filter(([k]) => (k as KeyboardEvent).key === 'Escape')).toEqual([])
    // A blur that follows the Esc (the field leaves) saves nothing more.
    act(() => field.blur())
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('puste pole oddaje pusty tekst (hak zamieni go na null – nazwa jak podkategoria)', () => {
    const finish = vi.fn()
    mountAxis({ active: 'a', info: infoOf(), start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    type(field, '')
    key(field, 'Enter')
    expect(finish.mock.calls).toEqual([['a', '']])
  })

  it('klawisze okna nie dotyczą pola: to pole tekstowe (Delete, Ctrl+A, Shift+strzałki, PgUp, Ctrl+Z są jego), Enter w trakcie składania znaku (IME) nie zapisuje', () => {
    const finish = vi.fn()
    mountAxis({ active: 'a', info: infoOf(), start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    // Every key of the window (Del, Ctrl+A, Shift+arrows, PgUp, Ctrl+Z) leaves a field to itself.
    expect(isEditable(field)).toBe(true)
    key(field, 'Enter', { isComposing: true })
    expect(finish).not.toHaveBeenCalled()
  })

  it('dwuklik w godziny (nie w nazwę) i bez zamiaru nazwy (info null) nic nie zaczyna', () => {
    const start = vi.fn()
    mountAxis({ active: null, info: () => null, start, finish: vi.fn() })
    dblclick(q('block-a')!.querySelector('[data-tile-name]')!)
    expect(start).not.toHaveBeenCalled()
    const start2 = vi.fn()
    document.body.innerHTML = ''
    act(() => root!.unmount())
    mountAxis({ active: null, info: infoOf(), start: start2, finish: vi.fn() })
    // On the tile but far from the name (jsdom has no layout: the name's box is empty, so a point away from it is „beside”).
    dblclick(q('block-a')!, { clientX: 400, clientY: 300 })
    expect(start2).not.toHaveBeenCalled()
  })

  it('dwuklik w nazwę nie otwiera panelu drugi raz: klik z `detail` 2 nie woła `onSelect`', () => {
    const onSelect = vi.fn()
    mountAxis({ active: null, info: infoOf(), start: vi.fn(), finish: vi.fn() }, [item()], { onSelect })
    dblclick(q('block-a')!.querySelector('[data-tile-name]')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('dwuklik w nazwę nie zaczyna przeciągania: kafelek nie rusza się i nie woła `onMove`', () => {
    const onMove = vi.fn()
    const start = vi.fn()
    mountAxis({ active: null, info: infoOf(), start, finish: vi.fn() }, [item()], { onMove })
    const tile = q('block-a')!
    for (const type of ['pointerdown', 'pointerup']) {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: 100, button: 0, buttons: type === 'pointerdown' ? 1 : 0 })
      Object.defineProperty(e, 'pointerId', { value: 1 })
      Object.defineProperty(tile, 'setPointerCapture', { value: () => undefined, configurable: true })
      act(() => void tile.dispatchEvent(e))
    }
    dblclick(tile.querySelector('[data-tile-name]')!)
    expect(start).toHaveBeenCalledTimes(1)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('pole nie łapie zdarzeń myszy kafelka i osi: klik w pole nie zaznacza bloku ani nie tworzy nowego', () => {
    const onSelect = vi.fn()
    const onCreate = vi.fn()
    mountAxis({ active: 'a', info: infoOf(), start: vi.fn(), finish: vi.fn() }, [item()], { onSelect, onCreate })
    click(q('tile-name')!)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('blok bez zamiaru nazwy (info null) nie dostaje pola, nawet gdy jest „aktywny”', () => {
    mountAxis({ active: 'a', info: () => null, start: vi.fn(), finish: vi.fn() })
    expect(q('tile-name')).toBeNull()
  })
})

describe('nazwa w miejscu – nic z tego, co kafelek ma własnego (napis kosztu, okienko kosztu)', () => {
  const costed = (): TimelineItem => item({ cost: { costs: { head: 3, emotions: 1, senses: 1, body: 0 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true } })
  // `onCosts` makes the label a button with a window of its own (D501).
  const mountCost = (start: () => void) => mountAxis({ active: null, info: infoOf(), start, finish: vi.fn() }, [costed()], { onCosts: vi.fn() })

  const rect = (l: number, t: number, r: number, b: number) => () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t }) as DOMRect
  /** The name fills the whole row of the tile (as in „Tydzień”): a point of the row is in its box, the cost's label lies over its end. */
  const layOut = () => {
    q('block-a')!.querySelector<HTMLElement>('[data-tile-name]')!.getBoundingClientRect = rect(0, 0, 200, 14)
    q('block-a-cost')!.getBoundingClientRect = rect(150, 0, 200, 14)
  }

  it('dwuklik w napis kosztu nie zaczyna nazwy, choć leży nad wierszem nazwy', () => {
    const start = vi.fn()
    mountCost(start)
    layOut()
    dblclick(q('block-a-cost')!, { clientX: 170, clientY: 7 })
    expect(start).not.toHaveBeenCalled()
  })

  it('dwuklik w okienko kosztu (portal – zdarzenie idzie drzewem Reacta do kafelka) nie zaczyna nazwy', () => {
    const start = vi.fn()
    mountCost(start)
    click(q('block-a-cost')!)
    layOut()
    const pop = q('cost-pop')!
    expect(pop).not.toBeNull()
    const at = { bubbles: true, cancelable: true, detail: 2, clientX: 170, clientY: 7 }
    act(() => void pop.dispatchEvent(new MouseEvent('dblclick', at)))
    act(() => void q('cost-pop-head-plus')!.dispatchEvent(new MouseEvent('dblclick', at)))
    expect(start).not.toHaveBeenCalled()
  })

  it('cel to sam kafelek: punkt na uchwycie krawędzi, który nachodzi na wiersz nazwy, nie jest nazwą', () => {
    const start = vi.fn()
    mountAxis({ active: null, info: infoOf(), start, finish: vi.fn() }, [item()], { onResize: vi.fn() })
    const tile = q('block-a')!
    tile.querySelector<HTMLElement>('[data-tile-name]')!.getBoundingClientRect = rect(0, 0, 200, 14)
    q('block-a-edge-top')!.getBoundingClientRect = rect(0, 0, 200, 6)
    dblclick(tile, { clientX: 50, clientY: 3 })
    expect(start).not.toHaveBeenCalled()
    dblclick(tile, { clientX: 50, clientY: 10 })
    expect(start).toHaveBeenCalledWith('a')
  })

  it('cel to sam kafelek (przechwycony wskaźnik): punkt nad napisem kosztu, który leży nad wierszem nazwy, nie jest nazwą; punkt w nazwie – jest', () => {
    const start = vi.fn()
    mountCost(start)
    const tile = q('block-a')!
    layOut()
    dblclick(tile, { clientX: 170, clientY: 7 })
    expect(start).not.toHaveBeenCalled()
    dblclick(tile, { clientX: 50, clientY: 7 })
    expect(start).toHaveBeenCalledWith('a')
  })
})

describe('nazwa w miejscu – F2 i zapis (useTileRename)', () => {
  type Hook = typeof import('@renderer/features/plan/tileRename')
  const harness = async (o: { target?: string | null; info?: (id: string) => { text: string; hint: string } | null; scope?: string } = {}) => {
    const m: Hook = await import('@renderer/features/plan/tileRename')
    const save = vi.fn()
    const info = o.info ?? infoOf()
    function Page({ scope, target }: { scope: string; target: string | null }) {
      const rename = m.useTileRename({ target: () => target, info, save, scope })
      return createElement('div', null, createElement(Timeline, { items: [item()], markers: [], selected: null, onSelect: vi.fn(), onMove: vi.fn(), from: 360, to: 1320, rename } as never), createElement('button', { 'data-testid': 'elsewhere' }, 'x'))
    }
    const state = { scope: o.scope ?? 'd1', target: o.target === undefined ? 'a' : o.target }
    const mount = () => render(createElement(Page, { ...state }))
    mount()
    return {
      save,
      remount: (patch: Partial<typeof state>) => {
        Object.assign(state, patch)
        act(() => root!.render(createElement(Page, { ...state })))
      }
    }
  }

  it('F2 przy jednym zaznaczonym bloku otwiera pole na jego kafelku; Enter zapisuje nazwę', async () => {
    const { save } = await harness()
    expect(q('tile-name')).toBeNull()
    const e = key(document.body, 'F2')
    expect(e.defaultPrevented).toBe(true)
    const field = q('tile-name') as HTMLInputElement
    expect(field.value).toBe('Analiza')
    type(field, 'Plan dnia')
    key(field, 'Enter')
    expect(save).toHaveBeenCalledWith('a', 'Plan dnia')
    expect(q('tile-name')).toBeNull()
  })

  it('Esc nic nie zapisuje; pole znika', async () => {
    const { save } = await harness()
    key(document.body, 'F2')
    type(q('tile-name') as HTMLInputElement, 'Coś')
    key(q('tile-name')!, 'Escape')
    expect(save).not.toHaveBeenCalled()
    expect(q('tile-name')).toBeNull()
  })

  it('puste pole = null (nazwa jak podkategoria); ta sama nazwa albo puste przy braku nazwy – bez zapisu', async () => {
    const { save } = await harness()
    key(document.body, 'F2')
    type(q('tile-name') as HTMLInputElement, '   ')
    key(q('tile-name')!, 'Enter')
    expect(save.mock.calls).toEqual([['a', null]])
    key(document.body, 'F2')
    key(q('tile-name')!, 'Enter')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('bez nazwy własnej puste pole nic nie zmienia', async () => {
    const { save } = await harness({ info: infoOf('', 'Inne obowiązki') })
    key(document.body, 'F2')
    expect((q('tile-name') as HTMLInputElement).value).toBe('')
    key(q('tile-name')!, 'Enter')
    expect(save).not.toHaveBeenCalled()
  })

  it('F2 przy kilku zaznaczonych (target null) albo bez zaznaczenia – nic', async () => {
    await harness({ target: null })
    const e = key(document.body, 'F2')
    expect(q('tile-name')).toBeNull()
    expect(e.defaultPrevented).toBe(false)
  })

  it('F2 w polu, z modyfikatorem, przy otwartym oknie, dla bloku bez zamiaru nazwy – nic', async () => {
    await harness({ info: () => null })
    key(document.body, 'F2')
    expect(q('tile-name')).toBeNull()
    document.body.innerHTML = ''
    act(() => root!.unmount())
    await harness()
    const input = document.createElement('input')
    document.body.append(input)
    key(input, 'F2')
    expect(q('tile-name')).toBeNull()
    key(document.body, 'F2', { ctrlKey: true })
    key(document.body, 'F2', { shiftKey: true })
    key(document.body, 'F2', { altKey: true })
    expect(q('tile-name')).toBeNull()
    const modal = onModal()
    key(document.body, 'F2')
    expect(q('tile-name')).toBeNull()
    modal.off()
    key(document.body, 'F2')
    expect(q('tile-name')).not.toBeNull()
  })

  it('zmiana zakresu (dzień, wersja szablonu) zamyka pole bez zapisu', async () => {
    const h = await harness()
    key(document.body, 'F2')
    type(q('tile-name') as HTMLInputElement, 'Coś')
    h.remount({ scope: 'd2' })
    expect(q('tile-name')).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
  })

  it('zniknięcie bloku (info aktywnego → null) zamyka pole bez zapisu; F2 na bloku bez zamiaru nazwy nie przejmuje klawisza', async () => {
    let gone = false
    const h = await harness({ info: (id) => (gone || id !== 'a' ? null : { text: 'Analiza', hint: 'Inne obowiązki' }) })
    key(document.body, 'F2')
    type(q('tile-name') as HTMLInputElement, 'Coś')
    gone = true
    h.remount({})
    expect(q('tile-name')).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
    // It is closed for good: the block coming back does not bring the field back.
    gone = false
    h.remount({})
    expect(q('tile-name')).toBeNull()
    gone = true
    h.remount({})
    // The block is not there: F2 is nobody's – the key stays the page's (no `preventDefault`).
    expect(key(document.body, 'F2').defaultPrevented).toBe(false)
    expect(q('tile-name')).toBeNull()
  })

  it('`renameInfo`: pole tylko dla bloku, który oś rysuje; podpowiedź liczona dopiero wtedy', async () => {
    const { renameInfo } = (await import('@renderer/features/plan/tileRename')) as Hook
    const hint = vi.fn(() => 'Inne obowiązki')
    expect(renameInfo({ name: 'Raport' }, true, hint)).toEqual({ text: 'Raport', hint: 'Inne obowiązki' })
    expect(renameInfo({ name: null }, true, hint)).toEqual({ text: '', hint: 'Inne obowiązki' })
    hint.mockClear()
    expect(renameInfo({ name: 'Raport' }, false, hint)).toBeNull()
    expect(renameInfo(undefined, true, hint)).toBeNull()
    expect(hint).not.toHaveBeenCalled()
  })

  it('nazwa jest przycinana do BLOCK_NAME_MAX', async () => {
    const { save } = await harness()
    key(document.body, 'F2')
    type(q('tile-name') as HTMLInputElement, 'x'.repeat(BLOCK_NAME_MAX + 20))
    key(q('tile-name')!, 'Enter')
    expect(save).toHaveBeenCalledWith('a', 'x'.repeat(BLOCK_NAME_MAX))
  })

  it('`renamedTo`: co zmienia nazwę, a co nie', async () => {
    const { renamedTo } = (await import('@renderer/features/plan/tileRename')) as Hook
    expect(renamedTo('  Analiza  ', '')).toEqual({ name: 'Analiza' })
    expect(renamedTo('', 'Stara')).toEqual({ name: null })
    expect(renamedTo('  ', 'Stara')).toEqual({ name: null })
    expect(renamedTo('Stara', 'Stara')).toBeNull()
    expect(renamedTo(' Stara ', 'Stara')).toBeNull()
    expect(renamedTo('', '')).toBeNull()
  })
})

describe('nazwa w miejscu – „Tydzień” i „3 dni” (BlockBox)', () => {
  const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
  const block = (): HorizonBlock => ({ id: 'w', named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user', sourceId: null, name: 'Analiza' }, categoryId: 'inne', startMin: 9 * 60, endMin: 10 * 60, state: 'planned', outsidePlan: false, background: false })
  type Rename = { info: { text: string; hint: string } | null; active: boolean; start: () => void; finish: (text: string | null) => void }
  const boxProps = (rename?: Rename, extra: Record<string, unknown> = {}) => ({ block: block(), lo: 8 * 60, lane: 0, lanes: 1, names, brightness: 1, date: '2026-11-18', attach: 0, rename, ...extra })
  const mount = (rename?: Rename, extra: Record<string, unknown> = {}) => render(createElement(BlockBox, boxProps(rename, extra) as never))
  const live: Rename = { info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: false, start: vi.fn(), finish: vi.fn() }
  /** How many times the day was opened (a pick of the block set) from now on. */
  const opened = () => {
    let n = 0
    removers.push(useUi.subscribe((st, prev) => void (st.pick && st.pick !== prev.pick && n++)))
    return () => n
  }
  const pointerdown = (el: Element) => {
    const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 })
    Object.defineProperty(e, 'pointerId', { value: 1 })
    act(() => void el.dispatchEvent(e))
  }
  const mountRaw = (el: ReactNode) => render(el)
  const tile = () => q('week-block-2026-11-18-w')!
  const name = () => tile().querySelector<HTMLElement>('[data-tile-name]')!

  it('klik w nazwę otwiera dzień po chwili – dopiero gdy drugi klik nie przyszedł', () => {
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: false, start: vi.fn(), finish: vi.fn() })
    click(name())
    expect(useUi.getState().pick).toBeNull()
    expect(tile().getAttribute('data-open-wait')).toBe('true')
    act(() => void vi.advanceTimersByTime(400))
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'w' })
    expect(tile().getAttribute('data-open-wait')).toBeNull()
  })

  it('dwuklik w nazwę zaczyna nazwę w miejscu i nie otwiera dnia', () => {
    const start = vi.fn()
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: false, start, finish: vi.fn() })
    dblclick(name())
    // No wait is pending any more: nothing will open the day later.
    expect(tile().getAttribute('data-open-wait')).toBeNull()
    act(() => void vi.advanceTimersByTime(1000))
    expect(start).toHaveBeenCalledTimes(1)
    expect(useUi.getState().pick).toBeNull()
  })

  it('klik poza nazwą (godziny, pusta część kafelka) otwiera dzień od razu, bez czekania', () => {
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: false, start: vi.fn(), finish: vi.fn() })
    click(tile(), { clientX: 400, clientY: 300 })
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'w' })
  })

  it('blok, którego nazwy nie da się zmienić (info null) – klik otwiera dzień od razu, dwuklik nic nie zaczyna', () => {
    const start = vi.fn()
    mount({ info: null, active: false, start, finish: vi.fn() })
    click(name())
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'w' })
    dblclick(name())
    expect(start).not.toHaveBeenCalled()
  })

  it('przycisk kafelka nie przemontowuje się, gdy pole się otwiera i zamyka (ten sam węzeł DOM)', () => {
    const info = { text: 'Analiza', hint: 'Inne obowiązki' }
    const props = (active: boolean) => ({ block: block(), lo: 8 * 60, lane: 0, lanes: 1, names, brightness: 1, date: '2026-11-18', attach: 0, rename: { info, active, start: vi.fn(), finish: vi.fn() } })
    mountRaw(createElement(BlockBox, props(false) as never))
    const before = tile()
    expect(q('tile-name')).toBeNull()
    act(() => root!.render(createElement(BlockBox, props(true) as never)))
    expect(q('tile-name')).not.toBeNull()
    expect(tile()).toBe(before)
    act(() => root!.render(createElement(BlockBox, props(false) as never)))
    expect(q('tile-name')).toBeNull()
    expect(tile()).toBe(before)
  })

  it('pole na kafelku: ma fokus i nazwę; Enter oddaje tekst, Esc – null', () => {
    const finish = vi.fn()
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: true, start: vi.fn(), finish })
    const field = q('tile-name') as HTMLInputElement
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('Analiza')
    type(field, 'Przegląd')
    key(field, 'Enter')
    expect(finish.mock.calls).toEqual([['Przegląd']])
    document.body.innerHTML = ''
    act(() => root!.unmount())
    const finish2 = vi.fn()
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: true, start: vi.fn(), finish: finish2 })
    key(q('tile-name')!, 'Escape')
    expect(finish2.mock.calls).toEqual([[null]])
  })

  it('klik w nazwę, w czasie oczekiwania Ctrl+klik tego kafelka: zaznaczenie, a dzień nie otwiera się potem', () => {
    const onPick = vi.fn()
    const count = opened()
    mount(live, { onPick })
    click(name())
    click(tile(), { ctrlKey: true })
    expect(onPick).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(1000))
    expect(count()).toBe(0)
    expect(tile().getAttribute('data-open-wait')).toBeNull()
  })

  it('klik w nazwę, potem wciśnięcie zaczynające przeciąganie kafelka: dzień nie otwiera się potem', () => {
    const grab = { down: vi.fn(), consumed: () => false, dragging: false }
    const count = opened()
    mount(live, { grab })
    click(name())
    pointerdown(tile())
    expect(grab.down).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(1000))
    expect(count()).toBe(0)
  })

  it('klik w nazwę, potem F2 (pole się otwiera): dzień nie otwiera się potem', () => {
    const count = opened()
    mount(live)
    click(name())
    expect(tile().getAttribute('data-open-wait')).toBe('true')
    act(() => root!.render(createElement(BlockBox, boxProps({ ...live, active: true }) as never)))
    expect(q('tile-name')).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1000))
    expect(count()).toBe(0)
  })

  it('klik w nazwę, potem klik w wiersz godzin: dzień otwiera się raz, od razu – czekający czas niczego nie dubluje', () => {
    const count = opened()
    mount(live)
    click(name())
    click(q('week-hours-2026-11-18-w')!)
    expect(count()).toBe(1)
    act(() => void vi.advanceTimersByTime(1000))
    expect(count()).toBe(1)
  })

  it('niedokończony klik w nazwę nie otwiera dnia po odmontowaniu kafelka (czas czeka w zegarze, który sprząta)', () => {
    mount({ info: { text: 'Analiza', hint: 'Inne obowiązki' }, active: false, start: vi.fn(), finish: vi.fn() })
    click(name())
    act(() => root!.unmount())
    root = null
    act(() => void vi.advanceTimersByTime(1000))
    expect(useUi.getState().pick).toBeNull()
  })
})
