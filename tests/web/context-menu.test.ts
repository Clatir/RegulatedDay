// @vitest-environment jsdom
/**
 * The menu of the right button (D528): a window in HTML in a portal, cut to the window, ✓ and „—”, a disabled item with its reason, keys
 * (arrows that skip the disabled and wrap, Enter, Space, →, ←), Esc through the layers of the Esc order, a press outside, the focus back
 * to where the menu was opened, a submenu, a field with its own Enter; the pure helpers of its place and of the key that opens it.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu, isMenuKey, menuPlace, menuPoint, moveIndex, submenuPlace, type MenuEntry } from '@renderer/components/ContextMenu'
import { installEscape, modalOpen } from '@renderer/lib/escape'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement
let root: Root
let offEsc: () => void

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

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
/** Types into an uncontrolled field the way a hand does (the value setter React does not track, then `input`). */
const type = (field: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
const focused = () => document.activeElement as HTMLElement
const menu = () => q('context-menu')

/** An opener button and the menu it opens with `items`. */
function Host({ items, at = { x: 100, y: 120 } }: { items: readonly MenuEntry[]; at?: { x: number; y: number } }) {
  const [open, setOpen] = useState(false)
  return createElement(
    'div',
    null,
    createElement('button', { 'data-testid': 'opener', onClick: () => setOpen(true) }, 'otwórz'),
    createElement('button', { 'data-testid': 'elsewhere' }, 'gdzie indziej'),
    open ? createElement(ContextMenu, { title: 'Zmień 4 bloki', at, items, onClose: () => setOpen(false) }) : null
  )
}
function openMenu(items: readonly MenuEntry[], at?: { x: number; y: number }) {
  act(() => root.render(createElement(Host, { items, at })))
  const opener = q('opener')!
  act(() => opener.focus())
  act(() => void opener.click())
}
const labels = () => [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map((e) => e.querySelector('span.flex-1')?.textContent)

describe('wygląd i miejsce', () => {
  it('okno w HTML w portalu (poza drzewem strony), z tytułem i rolami; otwarte w punkcie', () => {
    openMenu([{ label: 'Rutyna' }, { kind: 'separator' }, { label: 'Usuń' }], { x: 100, y: 120 })
    const m = menu()!
    expect(m.getAttribute('role')).toBe('menu')
    expect(m.getAttribute('aria-label')).toBe('Zmień 4 bloki')
    expect(m.textContent).toContain('Zmień 4 bloki')
    expect(host.contains(m)).toBe(false)
    expect(m.parentElement).toBe(document.body)
    expect(m.style.left).toBe('100px')
    expect(m.style.top).toBe('120px')
    expect(m.querySelectorAll('[role="separator"]')).toHaveLength(1)
    expect(labels()).toEqual(['Rutyna', 'Usuń'])
  })

  it('przycięcie do okna – czyste: prawy i dolny brzeg, margines; za duże menu przy marginesie', () => {
    const view = { width: 1000, height: 700 }
    expect(menuPlace({ x: 100, y: 100 }, { w: 200, h: 300 }, view)).toEqual({ left: 100, top: 100 })
    expect(menuPlace({ x: 950, y: 650 }, { w: 200, h: 300 }, view)).toEqual({ left: 792, top: 392 })
    expect(menuPlace({ x: -20, y: -5 }, { w: 200, h: 300 }, view)).toEqual({ left: 8, top: 8 })
    expect(menuPlace({ x: 10, y: 10 }, { w: 200, h: 900 }, view)).toEqual({ left: 10, top: 8 })
  })

  it('podmenu: po prawej od pozycji, po lewej gdy brak miejsca, w poziomie z pozycją i w oknie', () => {
    const view = { width: 1000, height: 700 }
    expect(submenuPlace({ left: 100, right: 300, top: 200 }, { w: 180, h: 100 }, view)).toEqual({ left: 298, top: 196 })
    expect(submenuPlace({ left: 700, right: 900, top: 200 }, { w: 180, h: 100 }, view)).toEqual({ left: 522, top: 196 })
    expect(submenuPlace({ left: 100, right: 300, top: 650 }, { w: 180, h: 100 }, view)).toEqual({ left: 298, top: 592 })
  })

  it('menuPoint: punkt wskaźnika, a bez niego (klawisz) – lewy dolny róg elementu', () => {
    expect(menuPoint({ clientX: 40, clientY: 50 }, null)).toEqual({ x: 40, y: 50 })
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 30, bottom: 90, right: 130, top: 60, width: 100, height: 30, x: 30, y: 60, toJSON: () => ({}) })
    expect(menuPoint({ clientX: 0, clientY: 0 }, el)).toEqual({ x: 38, y: 90 })
    expect(menuPoint(null, el)).toEqual({ x: 38, y: 90 })
  })

  it('isMenuKey: Shift+F10 i klawisz menu; F10 bez Shift, Ctrl+Shift+F10 – nie', () => {
    const k = (key: string, o: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => isMenuKey({ key, shiftKey: false, ctrlKey: false, altKey: false, ...o })
    expect(k('F10', { shiftKey: true })).toBe(true)
    expect(k('ContextMenu')).toBe(true)
    expect(k('F10')).toBe(false)
    expect(k('F10', { shiftKey: true, ctrlKey: true })).toBe(false)
    expect(k('a', { shiftKey: true })).toBe(false)
  })
})

describe('✓ i „—”, pozycja wyłączona', () => {
  it('✓ dla wartości wszystkich, „—” dla części, role menuitemcheckbox z aria-checked', () => {
    openMenu([{ label: 'Analiza', check: 'all' }, { label: 'Praca', check: 'some' }, { label: 'Inne' }])
    const [all, some, plain] = [...document.querySelectorAll('[role^="menuitem"]')] as HTMLElement[]
    expect(all!.getAttribute('role')).toBe('menuitemcheckbox')
    expect(all!.getAttribute('aria-checked')).toBe('true')
    expect(all!.textContent).toContain('✓')
    expect(some!.getAttribute('aria-checked')).toBe('mixed')
    expect(some!.textContent).toContain('—')
    expect(plain!.getAttribute('role')).toBe('menuitem')
    expect(plain!.hasAttribute('aria-checked')).toBe(false)
    expect(plain!.textContent).not.toMatch(/[✓—]/)
  })

  it('wyłączona: powód w podpowiedzi, aria-disabled, klik nic nie robi i menu zostaje', () => {
    const onPick = vi.fn()
    openMenu([{ label: 'Przenieś na dzień…', disabled: 'Żaden blok nie jest niezaczęty', onPick, testId: 'off' }])
    const off = q('off')!
    expect(off.title).toBe('Żaden blok nie jest niezaczęty')
    expect(off.getAttribute('aria-disabled')).toBe('true')
    act(() => void off.click())
    expect(onPick).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })
})

describe('klawiatura', () => {
  const ITEMS = (pick: (s: string) => void): MenuEntry[] => [
    { label: 'Pierwsza', onPick: () => pick('1'), testId: 'i1' },
    { label: 'Druga', disabled: 'nie dotyczy', onPick: () => pick('2'), testId: 'i2' },
    { label: 'Trzecia', onPick: () => pick('3'), testId: 'i3' }
  ]

  it('fokus na pierwszej dostępnej; strzałki pomijają wyłączone i zawijają w obie strony', () => {
    openMenu(ITEMS(() => {}))
    expect(focused()).toBe(q('i1'))
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('i3'))
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('i1'))
    key(focused(), 'ArrowUp')
    expect(focused()).toBe(q('i3'))
    key(focused(), 'Home')
    expect(focused()).toBe(q('i1'))
    key(focused(), 'End')
    expect(focused()).toBe(q('i3'))
  })

  it('Enter i spacja wybierają; menu zamyka się, a fokus wraca do elementu, z którego je otwarto', () => {
    const pick = vi.fn()
    openMenu(ITEMS(pick))
    key(focused(), 'ArrowDown')
    key(focused(), 'Enter')
    expect(pick).toHaveBeenCalledExactlyOnceWith('3')
    expect(menu()).toBeNull()
    expect(focused()).toBe(q('opener'))
    act(() => void q('opener')!.click())
    key(focused(), ' ')
    expect(pick).toHaveBeenLastCalledWith('1')
    expect(menu()).toBeNull()
  })

  it('klik wybiera i zamyka; keepOpen zostawia menu otwarte', () => {
    const pick = vi.fn()
    openMenu([{ label: 'Zostań', keepOpen: true, onPick: () => pick('a'), testId: 'keep' }, { label: 'Zamknij', onPick: () => pick('b'), testId: 'shut' }])
    act(() => void q('keep')!.click())
    expect(pick).toHaveBeenCalledWith('a')
    expect(menu()).not.toBeNull()
    act(() => void q('shut')!.click())
    expect(pick).toHaveBeenLastCalledWith('b')
    expect(menu()).toBeNull()
  })

  it('Tab zamyka; skróty strony czekają, póki menu jest otwarte', () => {
    openMenu(ITEMS(() => {}))
    expect(modalOpen()).toBe(true)
    key(focused(), 'Tab')
    expect(menu()).toBeNull()
    expect(modalOpen()).toBe(false)
  })
})

describe('Esc i klik poza menu', () => {
  it('Esc zamyka menu, fokus wraca do przycisku, z którego je otwarto', () => {
    openMenu([{ label: 'A' }])
    expect(menu()).not.toBeNull()
    const ev = key(document.body, 'Escape')
    expect(menu()).toBeNull()
    expect(ev.defaultPrevented).toBe(true)
    expect(focused()).toBe(q('opener'))
  })

  it('klik poza menu zamyka; klik w menu – nie', () => {
    openMenu([{ label: 'A', testId: 'a', disabled: 'x' }])
    act(() => void q('a')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(menu()).not.toBeNull()
    act(() => void q('elsewhere')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(menu()).toBeNull()
  })

  it('prawy przycisk na menu nie otwiera systemowego', () => {
    openMenu([{ label: 'A', testId: 'a' }])
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => void q('a')!.dispatchEvent(ev))
    expect(ev.defaultPrevented).toBe(true)
  })
})

describe('podmenu', () => {
  const SUB = (pick: (s: string) => void): MenuEntry[] => [
    { label: 'Zwykła', onPick: () => pick('zwykła') },
    {
      label: 'Podkategoria',
      testId: 'sub',
      submenu: [
        { label: 'Analiza', check: 'all', onPick: () => pick('analiza'), testId: 's1' },
        { label: 'Nauka', disabled: 'nie dotyczy', testId: 's2' },
        { label: 'Praca', onPick: () => pick('praca'), testId: 's3' }
      ]
    }
  ]

  it('→ otwiera podmenu z fokusem na pierwszej; ↓ w podmenu; ← wraca do pozycji; Enter w podmenu wybiera i zamyka całe menu', () => {
    const pick = vi.fn()
    openMenu(SUB(pick))
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('sub'))
    expect(q('sub')!.getAttribute('aria-haspopup')).toBe('menu')
    expect(q('sub')!.getAttribute('aria-expanded')).toBe('false')
    key(focused(), 'ArrowRight')
    expect(q('sub-menu')).not.toBeNull()
    expect(q('sub')!.getAttribute('aria-expanded')).toBe('true')
    expect(focused()).toBe(q('s1'))
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('s3'))
    key(focused(), 'ArrowLeft')
    expect(q('sub-menu')).toBeNull()
    expect(focused()).toBe(q('sub'))
    key(focused(), 'ArrowRight')
    key(focused(), 'ArrowDown')
    key(focused(), 'Enter')
    expect(pick).toHaveBeenCalledExactlyOnceWith('praca')
    expect(menu()).toBeNull()
  })

  it('Enter na pozycji z podmenu je otwiera; Esc zamyka najpierw podmenu, potem menu', () => {
    openMenu(SUB(() => {}))
    key(focused(), 'ArrowDown')
    key(focused(), 'Enter')
    expect(q('sub-menu')).not.toBeNull()
    key(document.body, 'Escape')
    expect(q('sub-menu')).toBeNull()
    expect(menu()).not.toBeNull()
    expect(focused()).toBe(q('sub'))
    key(document.body, 'Escape')
    expect(menu()).toBeNull()
  })

  it('klawisze podmenu nie ruszają menu nadrzędnego; najechanie pozycji z podmenu je otwiera, inna pozycja zamyka', () => {
    openMenu(SUB(() => {}))
    key(focused(), 'ArrowDown')
    key(focused(), 'ArrowRight')
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('s3'))
    key(focused(), 'ArrowLeft')
    key(focused(), 'ArrowUp')
    expect(focused().textContent).toContain('Zwykła')
    const hover = (el: Element) => act(() => void el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    hover(q('sub')!)
    expect(q('sub-menu')).not.toBeNull()
    hover([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Zwykła'))!)
    expect(q('sub-menu')).toBeNull()
  })

  it('✓ działa także w podmenu', () => {
    openMenu(SUB(() => {}))
    key(focused(), 'ArrowDown')
    key(focused(), 'ArrowRight')
    expect(q('s1')!.textContent).toContain('✓')
    expect(q('s2')!.title).toBe('nie dotyczy')
  })
})

describe('pozycja z polem', () => {
  it('Enter w polu oddaje tekst i zamyka menu; strzałka w dół przechodzi dalej; spacja pisze, nie wybiera', () => {
    const submit = vi.fn()
    const pick = vi.fn()
    openMenu([
      { label: 'Przesuń o 5 min', onPick: pick, testId: 'five' },
      { kind: 'field', label: 'Własna liczba minut', testId: 'own', onSubmit: submit },
      { label: 'Dalej', onPick: pick, testId: 'next' }
    ])
    key(focused(), 'ArrowDown')
    const field = q('own') as HTMLInputElement
    expect(focused()).toBe(field)
    expect(field.getAttribute('aria-label')).toBe('Własna liczba minut')
    key(field, ' ')
    expect(pick).not.toHaveBeenCalled()
    type(field, '1:30')
    key(field, 'Enter')
    expect(submit).toHaveBeenCalledExactlyOnceWith('1:30')
    expect(pick).not.toHaveBeenCalled()
    expect(menu()).toBeNull()
  })

  it('pole odpowiada powodem: menu zostaje, powód pokazany, znika przy dalszym pisaniu', () => {
    openMenu([{ kind: 'field', label: 'Własna', testId: 'own', onSubmit: () => 'Nie rozumiem tej długości' }])
    const field = q('own') as HTMLInputElement
    act(() => field.focus())
    key(field, 'Enter')
    expect(menu()).not.toBeNull()
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('Nie rozumiem tej długości')
    type(field, '1')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('strzałki z pola idą po pozycjach; Esc w polu zamyka menu; pole wyłączone jest pomijane', () => {
    openMenu([
      { kind: 'field', label: 'Wyłączone', disabled: 'brak', testId: 'off', onSubmit: () => {} },
      { kind: 'field', label: 'Własna', testId: 'own', onSubmit: () => {} },
      { label: 'Koniec', testId: 'end' }
    ])
    expect(focused()).toBe(q('own'))
    expect((q('off') as HTMLInputElement).disabled).toBe(true)
    key(focused(), 'ArrowDown')
    expect(focused()).toBe(q('end'))
    key(focused(), 'ArrowUp')
    expect(focused()).toBe(q('own'))
    key(document.body, 'Escape')
    expect(menu()).toBeNull()
  })
})

describe('moveIndex', () => {
  it('następny dostępny, zawija; bez dostępnych −1', () => {
    expect(moveIndex([true, false, true], -1, 1)).toBe(0)
    expect(moveIndex([true, false, true], 0, 1)).toBe(2)
    expect(moveIndex([true, false, true], 2, 1)).toBe(0)
    expect(moveIndex([true, false, true], 0, -1)).toBe(2)
    expect(moveIndex([false, true, false], 3, -1)).toBe(1)
    expect(moveIndex([false, false], 0, 1)).toBe(-1)
    expect(moveIndex([], -1, 1)).toBe(-1)
  })
})

describe('zdarzenia menu nie bąbelkują do elementu otwarcia (portal – drzewo Reacta)', () => {
  const spy = { key: vi.fn(), dbl: vi.fn(), down: vi.fn(), up: vi.fn() }
  /** The opener's parent listens to what the menu's events would reach through the React tree. */
  function Parent({ items }: { items: readonly MenuEntry[] }) {
    const [open, setOpen] = useState(false)
    return createElement(
      'div',
      { onKeyDown: spy.key, onKeyUp: spy.up, onDoubleClick: spy.dbl, onMouseDown: spy.down },
      createElement('button', { 'data-testid': 'opener', onClick: () => setOpen(true) }, 'otwórz'),
      open ? createElement(ContextMenu, { title: 'Zmień 4 bloki', at: { x: 10, y: 10 }, items, onClose: () => setOpen(false) }) : null
    )
  }
  const SUBMENU: MenuEntry[] = [{ label: 'Pierwsza', testId: 'one' }, { label: 'Podmenu', testId: 'sub', submenu: [{ label: 'W środku', testId: 'in' }] }]
  const open = () => {
    vi.clearAllMocks()
    act(() => root.render(createElement(Parent, { items: SUBMENU })))
    act(() => q('opener')!.focus())
    act(() => void q('opener')!.click())
    spy.key.mockClear()
  }

  it('klawisze z menu (Enter, strzałki, Shift+F10) nie dochodzą do rodzica; także z podmenu', () => {
    open()
    key(focused(), 'ArrowDown')
    key(focused(), 'Enter')
    expect(q('sub-menu')).not.toBeNull()
    key(focused(), 'F10', { shiftKey: true })
    key(focused(), 'ContextMenu')
    key(focused(), 'a')
    expect(spy.key).not.toHaveBeenCalled()
    const up = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
    act(() => void focused().dispatchEvent(up))
    expect(spy.up).not.toHaveBeenCalled()
  })

  it('dwuklik i naciśnięcie myszy w menu nie dochodzą do rodzica', () => {
    open()
    act(() => void q('one')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })))
    act(() => void q('one')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
    expect(spy.dbl).not.toHaveBeenCalled()
    expect(spy.down).not.toHaveBeenCalled()
  })

  it('Esc z fokusu w menu zamyka je raz (podmenu, potem menu) i też nie dochodzi do rodzica', () => {
    open()
    key(focused(), 'ArrowDown')
    key(focused(), 'Enter')
    expect(q('sub-menu')).not.toBeNull()
    const first = key(focused(), 'Escape')
    expect(first.defaultPrevented).toBe(true)
    expect(q('sub-menu')).toBeNull()
    expect(menu()).not.toBeNull()
    key(focused(), 'Escape')
    expect(menu()).toBeNull()
    expect(spy.key).not.toHaveBeenCalled()
  })
})
