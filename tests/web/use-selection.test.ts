// @vitest-environment jsdom
/**
 * The selection of a screen (D527): clicks (what opens), Ctrl+A (the physical key; not in a field, not with a dialog open), Shift+arrows
 * of the axis the screen names, what vanishes drops out, a new scope clears, Esc – a panel opened by the click closes first, the next
 * Esc clears the selection.
 */
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Dialog } from '@renderer/components/Dialog'
import { installEscape, useEscapeLayer } from '@renderer/lib/escape'
import { useSelection, type SelectionApi, type UseSelectionOptions } from '@renderer/lib/useSelection'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement
let root: Root
let offEsc: () => void
let api: SelectionApi
/** The selected count of every render of `Screen`, in order. */
const renders: number[] = []

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  offEsc = installEscape()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  offEsc()
})

const render = (el: ReactElement) => act(() => root.render(el))
const key = (target: Element | Window, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const ORDER = ['a', 'b', 'c', 'd', 'e']

/** The screen: items that select; a click that may open opens the panel (a child, like the block panel of „Dziś”). */
function Panel({ onClose }: { onClose: () => void }) {
  useEscapeLayer(true, onClose)
  return createElement('div', { 'data-testid': 'panel' }, 'panel')
}
function Screen(o: Partial<UseSelectionOptions> & { withPanel?: boolean }) {
  const { withPanel, ...rest } = o
  const [open, setOpen] = useState<string | null>(null)
  api = useSelection({ order: ORDER, ...rest })
  renders.push(api.count)
  return createElement(
    'div',
    null,
    ...ORDER.map((id) =>
      createElement('div', {
        key: id,
        'data-testid': `item-${id}`,
        'data-selected': api.isSelected(id) ? 'true' : undefined,
        onClick: (e: { ctrlKey: boolean; shiftKey: boolean }) => {
          if (api.onItemClick(id, e) && withPanel) setOpen(id)
        }
      })
    ),
    createElement('input', { 'data-testid': 'field' }),
    createElement('select', { 'data-testid': 'list' }),
    createElement('input', { type: 'range', 'data-testid': 'range' }),
    createElement('input', { type: 'checkbox', 'data-testid': 'check' }),
    createElement('div', { role: 'slider', tabIndex: 0, 'data-testid': 'slider' }),
    open ? createElement(Panel, { onClose: () => setOpen(null) }) : null
  )
}
const click = (id: string, init: MouseEventInit = {}) => act(() => void q(`item-${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })))
const selected = () => [...api.selected]

describe('kliknięcia', () => {
  it('zwykły klik zaznacza i otwiera; Ctrl i Shift zaznaczają bez otwierania', () => {
    render(createElement(Screen, { withPanel: true }))
    click('b', { ctrlKey: true })
    click('d', { ctrlKey: true })
    expect(selected()).toEqual(['b', 'd'])
    expect(q('panel')).toBeNull()
    click('e', { shiftKey: true })
    expect(selected()).toEqual(['b', 'd', 'e'])
    expect(q('panel')).toBeNull()
    click('a')
    expect(selected()).toEqual(['a'])
    expect(q('panel')).not.toBeNull()
    expect(q('item-a')!.dataset.selected).toBe('true')
    expect(q('item-b')!.dataset.selected).toBeUndefined()
  })

  it('prawy przycisk: na zaznaczonym zostaje całe zaznaczenie, na innym – tylko ten', () => {
    render(createElement(Screen, {}))
    click('a', { ctrlKey: true })
    click('c', { ctrlKey: true })
    let ids: readonly string[] = []
    act(() => void (ids = api.onItemContext('a')))
    expect(ids).toEqual(['a', 'c'])
    act(() => void (ids = api.onItemContext('d')))
    expect(ids).toEqual(['d'])
    expect(selected()).toEqual(['d'])
  })
})

describe('Ctrl+A', () => {
  it('poza polem zaznacza wszystko (fizyczny klawisz A, każdy układ)', () => {
    render(createElement(Screen, {}))
    const ev = key(document.body, 'ф', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual(ORDER)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('w polu tekstowym i na liście wyboru – nic (zostaje zaznaczenie tekstu)', () => {
    render(createElement(Screen, {}))
    const field = q('field')!
    const ev = key(field, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual([])
    expect(ev.defaultPrevented).toBe(false)
    key(q('list')!, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual([])
  })

  it('przy otwartym oknie, z Alt, Shift albo bez Ctrl – nic; wyłączone (enabled) – nic', () => {
    render(createElement(Screen, {}))
    key(document.body, 'a', { ctrlKey: true, altKey: true, code: 'KeyA' })
    key(document.body, 'a', { ctrlKey: true, shiftKey: true, code: 'KeyA' })
    key(document.body, 'a', { code: 'KeyA' })
    expect(selected()).toEqual([])
    render(createElement('div', null, createElement(Screen, {}), createElement(Dialog, { title: 'Okno', onClose: () => {}, children: 'x' })))
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual([])
    render(createElement(Screen, { enabled: false }))
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual([])
  })

  it('opcja when: ekran bierze Ctrl+A tylko, gdy jego warunek jest spełniony', () => {
    render(createElement(Screen, { when: (e: KeyboardEvent) => e.target === q('item-a') }))
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual([])
    key(q('item-a')!, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(selected()).toEqual(ORDER)
  })

  it('pusta kolejność – klawisz zostaje przeglądarce', () => {
    render(createElement(Screen, { order: [] }))
    const ev = key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('Shift+strzałki', () => {
  it('pionowe: w dół i w górę rozszerzają od kotwicy; poziome nie działają', () => {
    render(createElement(Screen, {}))
    click('b')
    const down = key(document.body, 'ArrowDown', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
    expect(down.defaultPrevented).toBe(true)
    key(document.body, 'ArrowDown', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c', 'd'])
    key(document.body, 'ArrowUp', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
    key(document.body, 'ArrowRight', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
  })

  it('poziome (Kalendarz): lewo / prawo; bez zaznaczenia i w polu – nic', () => {
    render(createElement(Screen, { arrows: 'horizontal' }))
    const none = key(document.body, 'ArrowRight', { shiftKey: true })
    expect(selected()).toEqual([])
    expect(none.defaultPrevented).toBe(false)
    click('c')
    key(document.body, 'ArrowRight', { shiftKey: true })
    key(document.body, 'ArrowLeft', { shiftKey: true })
    key(document.body, 'ArrowLeft', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
    key(q('field')!, 'ArrowRight', { shiftKey: true })
    expect(selected()).toEqual(['b', 'c'])
  })

  it('arrows: false – strzałki zostają ekranowi', () => {
    render(createElement(Screen, { arrows: false }))
    click('b')
    key(document.body, 'ArrowDown', { shiftKey: true })
    expect(selected()).toEqual(['b'])
  })
})

describe('co zniknęło i zmiana zakresu', () => {
  it('element, który zniknął (present), wypada z zaznaczenia od razu', () => {
    render(createElement(Screen, {}))
    click('a', { ctrlKey: true })
    click('c', { ctrlKey: true })
    render(createElement(Screen, { present: ['a', 'b', 'd', 'e'] }))
    expect(selected()).toEqual(['a'])
    // It does not come back when it is there again.
    render(createElement(Screen, {}))
    expect(selected()).toEqual(['a'])
  })

  it('zmiana scope (dzień, tydzień, szablon, ekran) czyści zaznaczenie', () => {
    render(createElement(Screen, { scope: '2026-11-16' }))
    click('a', { ctrlKey: true })
    render(createElement(Screen, { scope: '2026-11-16' }))
    expect(selected()).toEqual(['a'])
    render(createElement(Screen, { scope: '2026-11-17' }))
    expect(selected()).toEqual([])
  })
})

describe('Esc: najpierw panel, potem zaznaczenie', () => {
  it('klik otwiera panel i zaznacza; pierwszy Esc zamyka panel, B zostaje; drugi czyści; trzeci – nic', () => {
    render(createElement(Screen, { withPanel: true }))
    click('b')
    expect(q('panel')).not.toBeNull()
    expect(selected()).toEqual(['b'])
    key(document.body, 'Escape')
    expect(q('panel')).toBeNull()
    expect(selected()).toEqual(['b'])
    key(document.body, 'Escape')
    expect(selected()).toEqual([])
    const third = key(document.body, 'Escape')
    expect(third.defaultPrevented).toBe(false)
  })

  it('zaznaczenie bez panelu: Esc je czyści; okno otwarte nad nim zamyka się pierwsze', () => {
    function Over() {
      const [open, setOpen] = useState(false)
      api = useSelection({ order: ORDER })
      return createElement('div', null, createElement('button', { 'data-testid': 'open', onClick: () => setOpen(true) }), open ? createElement(Dialog, { title: 'Okno', onClose: () => setOpen(false), children: 'x' }) : null)
    }
    render(createElement(Over))
    act(() => api.selectAll())
    expect(selected()).toEqual(ORDER)
    act(() => void q('open')!.click())
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    key(document.body, 'Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(selected()).toEqual(ORDER)
    key(document.body, 'Escape')
    expect(selected()).toEqual([])
  })
})

describe('poprawki po przeglądzie Z1', () => {
  const near = (id: string) => (e: KeyboardEvent) => e.target instanceof Node && !!q(id)?.contains(e.target)
  let a: SelectionApi
  let b: SelectionApi
  function Two() {
    a = useSelection({ order: ORDER, when: near('zone-a') })
    b = useSelection({ order: ORDER, when: near('zone-b') })
    return createElement('div', null, createElement('div', { 'data-testid': 'zone-a', tabIndex: 0 }), createElement('div', { 'data-testid': 'zone-b', tabIndex: 0 }))
  }

  it('dwa zaznaczenia: Esc czyści to, w którego `when` jest fokus, nie najnowsze; poza obiema – nic', () => {
    render(createElement(Two))
    act(() => a.selectAll())
    act(() => b.selectAll())
    const outside = key(document.body, 'Escape')
    expect(outside.defaultPrevented).toBe(false)
    expect([a.count, b.count]).toEqual([5, 5])
    key(q('zone-a')!, 'Escape')
    expect([a.count, b.count]).toEqual([0, 5])
    key(q('zone-b')!, 'Escape')
    expect([a.count, b.count]).toEqual([0, 0])
  })

  it('wyłączone zaznaczenie (enabled: false) nie przejmuje Esc', () => {
    render(createElement(Screen, { enabled: false }))
    act(() => api.selectAll())
    expect(selected()).toEqual(ORDER)
    const ev = key(document.body, 'Escape')
    expect(selected()).toEqual(ORDER)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('zmiana scope: żaden render nie pokazuje starego zaznaczenia (nie ma klatki z nim)', () => {
    render(createElement(Screen, { scope: 'a' }))
    act(() => api.selectAll())
    renders.length = 0
    render(createElement(Screen, { scope: 'b' }))
    expect(renders.length).toBeGreaterThan(0)
    expect(renders.every((n) => n === 0)).toBe(true)
    expect(selected()).toEqual([])
    // And the same scope again does not clear what is selected afterwards.
    act(() => api.selectAll())
    render(createElement(Screen, { scope: 'b' }))
    expect(selected()).toEqual(ORDER)
  })

  it('Shift+strzałka: preventDefault tylko, gdy zaznaczenie się zmienia; nie na końcu listy', () => {
    render(createElement(Screen, {}))
    click('d')
    expect(key(document.body, 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(selected()).toEqual(['d', 'e'])
    const atEnd = key(document.body, 'ArrowDown', { shiftKey: true })
    expect(atEnd.defaultPrevented).toBe(false)
    expect(selected()).toEqual(['d', 'e'])
  })

  it('Shift+strzałka nie przejmuje klawisza polu zakresu, polu wyboru, suwakowi (role) ani liście', () => {
    render(createElement(Screen, {}))
    click('b')
    for (const id of ['range', 'check', 'slider', 'list']) {
      const ev = key(q(id)!, 'ArrowDown', { shiftKey: true })
      expect(ev.defaultPrevented, id).toBe(false)
      expect(selected(), id).toEqual(['b'])
    }
  })

  it('odwołania do API są stabilne: bez zmiany stanu ten sam obiekt, po zmianie te same funkcje', () => {
    render(createElement(Screen, {}))
    const first = api
    render(createElement(Screen, {}))
    expect(api).toBe(first)
    click('c')
    expect(api).not.toBe(first)
    for (const k of ['onItemClick', 'onItemContext', 'selectAll', 'clear', 'extend'] as const) expect(api[k], k).toBe(first[k])
    expect(api.isSelected('c')).toBe(true)
    expect(first.isSelected('c')).toBe(false)
  })
})
