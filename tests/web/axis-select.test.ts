// @vitest-environment jsdom
/**
 * Selecting many blocks of an axis (D527, D528 – „Dziś” and „Szablony”): the pieces the screens wire – `Timeline` (the ring of every selected tile,
 * Ctrl and Shift on a click, the right button and Shift+F10), `useAxisGroup` (the model, Ctrl+A on the axis only, Esc, the line over the axis, Del for
 * two or more) – in a harness that does what `TodayPage` does, and the real `TemplatesPage` with its blocks. Ctrl with a movement (4 px and more) is
 * still the copy of D513, never a selection.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { groupCount } from '@shared/groupText'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { installDeleteKey, useDeleteSelected, useDeleteResolver } from '@renderer/lib/deleteKey'
import { installEscape, setWindowEscape, useEscapeLayer } from '@renderer/lib/escape'
import { menuCtxOf, type GroupAction, type MenuCtx, type MenuState } from '@renderer/features/plan/groupMenu'
import { BlockGroupMenu } from '@renderer/features/plan/BlockGroupMenu'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { useAxisGroup } from '@renderer/features/plan/useAxisGroup'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const records = new Map<string, RawRecord>()
// The change of a pick: caught (the screens call `runBlockGroup` of `groupRun.ts`).
const { runs } = vi.hoisted(() => ({ runs: [] as Array<{ view: string; ids: readonly string[]; action: unknown }> }))
vi.mock('@renderer/features/plan/groupRun', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/plan/groupRun')>()),
  runBlockGroup: vi.fn(async (view: string, ids: readonly string[], action: unknown) => void runs.push({ view, ids: [...ids], action }))
}))
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after) records.set(rel, after)
    return [{ status: 'applied' }]
  })
}))

let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
let offDel: () => void
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  offEsc = installEscape()
  offDel = installDeleteKey()
  runs.length = 0
  for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
  useUi.setState({ toasts: [] })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  records.clear()
  offEsc()
  offDel()
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
})
afterAll(() => undefined)

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const act2 = (fn: () => void) => act(async () => void fn())
const click = (id: string, init: MouseEventInit = {}) => act2(() => void q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init })))
/** Types `text` into the cost field and leaves it (the commit of the field). */
const typeLeave = (id: string, text: string) =>
  act(async () => {
    const input = q(id) as HTMLInputElement
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
const marked = () => [...document.body.querySelectorAll('[data-marked="true"]')].map((e) => e.getAttribute('data-tile-id'))
const pointer = (target: Element, type: string, y: number, ctrlKey: boolean, buttons = 1) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: y, button: 0, buttons, ctrlKey })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}

const TODAY = '2026-11-18'
const COST = { costs: { head: 3, emotions: 1, senses: 1, body: 0 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true }
const tile = (id: string, at: number, o: Partial<TimelineItem> = {}): TimelineItem => ({ id, startMin: at, endMin: at + 30, title: id.toUpperCase(), marks: [], color: '#79AFAB', categoryId: 'inne', background: false, movable: true, cost: COST, ...o })
/** A–E, half an hour each, from 9:00 – the order of the example of the specification. */
const TILES = ['a', 'b', 'c', 'd', 'e'].map((id, i) => tile(id, 9 * 60 + i * 30))

function Panel({ id, onClose }: { id: string; onClose: () => void }) {
  useEscapeLayer(true, onClose)
  return createElement('div', { 'data-testid': 'panel' }, id)
}

/** What `TodayPage` does with the hook: a plain click selects the one and opens its panel (a layer of Esc), Ctrl and Shift only select. */
function Harness({ items = TILES, onCopy, stateOf }: { items?: TimelineItem[]; onCopy?: (id: string, startMin: number) => void; stateOf?: (id: string) => MenuState }) {
  const [open, setOpen] = useState<string | null>(null)
  const rd = rdFrom({})
  const names = { rd, settings: settingsOn(rd.settings, TODAY), routines: [], requests: [] }
  const group = useAxisGroup({
    view: 'today',
    where: { date: TODAY },
    tiles: items,
    present: items.map((i) => i.id),
    scope: TODAY,
    today: TODAY,
    moveFrom: TODAY,
    energy: true,
    ctx: menuCtxOf(names),
    plan: items.map((i) => planBlock({ id: i.id, categoryId: 'inne', startMin: i.startMin, durationMin: i.endMin - i.startMin, origin: 'user' })),
    stateOf
  })
  useDeleteResolver('block', (id) => (group.removeTarget && group.sel.isSelected(id) ? group.removeTarget : null))
  useDeleteSelected(group.removeTarget)
  return createElement(
    'div',
    null,
    group.line,
    createElement(Timeline, {
      items,
      markers: [],
      selected: open,
      marked: group.marked,
      onContext: group.onContext,
      onSelect: (id: string, mods: { ctrl: boolean; shift: boolean }) => {
        if (!group.onSelect(id, mods)) return
        group.selectOnly(id)
        setOpen(id)
      },
      onMove: () => undefined,
      onCopy,
      from: 8 * 60,
      to: 13 * 60
    }),
    // The panel closed: the selection of one goes with it (what `TodayPage.setSelected(null)` does); a group of two or more stays.
    open ? createElement(Panel, { id: open, onClose: () => (setOpen(null), group.release()) }) : null,
    // A new block started (a draft): the panel closes and a selection of one goes (`setSelected(null)` of `TodayPage`).
    createElement('button', { 'data-testid': 'new-draft', onClick: () => (setOpen(null), group.release()) }),
    createElement('input', { 'data-testid': 'field' }),
    group.overlay,
    createElement(DeleteDialog)
  )
}

async function mount(el = createElement(Harness)) {
  useData.setState({ rd: rdFrom({}), view: { today: TODAY, computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
}

describe('oś „Dziś”: klik, Ctrl, Shift (D527)', () => {
  it('przykład ze specyfikacji: Ctrl+klik A i C, Shift+klik E → A, C, D, E; obwódka wszystkich; napis nad osią', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-c', { ctrlKey: true })
    expect(marked()).toEqual(['a', 'c'])
    expect(q('panel')).toBeNull()
    await click('block-e', { shiftKey: true })
    expect(marked()).toEqual(['a', 'c', 'd', 'e'])
    // Four blocks of half an hour: 2 h, 3·1·1·0 an hour each – the use of the pools, minus the points.
    expect(q('axis-selection')!.textContent).toBe('Zaznaczone: 4 · 2 h · energia −6 G · −2 E · −2 B · 0 C')
    expect(q('block-a')!.className).toContain('ring-lamp')
    expect(q('block-b')!.className).not.toContain('ring-lamp')
  })

  it('klik B – tylko B zaznaczony i jego panel otwarty; napisu nie ma przy jednym', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-c', { ctrlKey: true })
    await click('block-b')
    expect(marked()).toEqual(['b'])
    expect(q('panel')!.textContent).toBe('b')
    expect(q('axis-selection')).toBeNull()
  })

  it('Ctrl+klik na zaznaczonym zdejmuje go, bez otwierania panelu; Shift+klik bez kotwicy zaznacza jeden', async () => {
    await mount()
    await click('block-b', { shiftKey: true })
    expect(marked()).toEqual(['b'])
    await click('block-d', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    expect(marked()).toEqual(['d'])
    expect(q('panel')).toBeNull()
  })

  it('Ctrl z ruchem (4 px i więcej) to dalej kopia (D513) – zaznaczenie bez zmian, panel zamknięty; Ctrl bez ruchu zaznacza', async () => {
    const onCopy = vi.fn()
    await mount(createElement(Harness, { onCopy }))
    const a = q('block-a')!
    pointer(a, 'pointerdown', 100, true)
    pointer(a, 'pointermove', 155, true)
    pointer(a, 'pointerup', 155, true, 0)
    act(() => void a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ctrlKey: true, clientX: 50, clientY: 155 })))
    // 55 px down: 50 minutes from 9:00.
    expect(onCopy).toHaveBeenCalledWith('a', 540 + 50)
    expect(marked()).toEqual([])
    // Without a move: a click – the block joins the selection.
    pointer(a, 'pointerdown', 100, true)
    pointer(a, 'pointerup', 100, true, 0)
    await click('block-a', { ctrlKey: true, clientX: 50, clientY: 100 })
    expect(marked()).toEqual(['a'])
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('kafelek, którego nie da się przeciągać: Ctrl z ruchem (4 px i więcej) nie jest kliknięciem zaznaczającym; bez ruchu jest', async () => {
    const fixed = [tile('a', 9 * 60, { movable: false }), tile('b', 10 * 60, { movable: false })]
    await mount(createElement(Harness, { items: fixed }))
    const a = q('block-a')!
    pointer(a, 'pointerdown', 100, true)
    pointer(a, 'pointerup', 130, true, 0)
    await click('block-a', { ctrlKey: true, clientX: 50, clientY: 130 })
    expect(marked()).toEqual([])
    pointer(a, 'pointerdown', 100, true)
    pointer(a, 'pointerup', 102, true, 0)
    await click('block-a', { ctrlKey: true, clientX: 50, clientY: 102 })
    expect(marked()).toEqual(['a'])
    // A click of the keyboard (no pointer) is always a click.
    await click('block-b', { ctrlKey: true, detail: 0 })
    expect(marked()).toEqual(['a', 'b'])
  })

  it('Shift+strzałki rozszerzają zakres od kotwicy (góra / dół osi)', async () => {
    await mount()
    await click('block-b')
    q('block-b')!.focus()
    key(q('block-b')!, 'ArrowDown', { shiftKey: true })
    key(q('block-b')!, 'ArrowDown', { shiftKey: true })
    expect(marked()).toEqual(['b', 'c', 'd'])
    key(q('block-b')!, 'ArrowUp', { shiftKey: true })
    expect(marked()).toEqual(['b', 'c'])
  })
})

describe('Ctrl+A, Esc', () => {
  it('Ctrl+A na osi albo bez fokusu zaznacza wszystkie bloki; w polu – nic', async () => {
    await mount()
    key(q('field')!, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([])
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(q('axis-selection')!.textContent).toContain('Zaznaczone: 5')
  })

  it('Ctrl+A z fokusem poza osią (panel obok) – nie zaznacza bloków osi', async () => {
    await mount()
    const outside = document.createElement('button')
    document.body.append(outside)
    key(outside, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([])
    outside.remove()
  })

  it('Esc: panel otwarty klikiem zamyka się pierwszy (nowsza warstwa, nie ta „pod wszystkim” zaznaczenia); zaznaczenie jednego odchodzi z nim (D462)', async () => {
    await mount()
    await click('block-b')
    expect(q('panel')).not.toBeNull()
    key(document.body, 'Escape')
    expect(q('panel')).toBeNull()
    expect(marked()).toEqual([])
  })
})

describe('zaznaczenie jednego idzie za otwartym blokiem (D462), grupa zostaje (T1611)', () => {
  it('klik X → Esc zamyka panel i zdejmuje zaznaczenie jednego; drugi Esc trafia do okna (jak dawniej), nie do warstwy zaznaczenia', async () => {
    const toWindow = vi.fn()
    setWindowEscape(toWindow)
    try {
      await mount()
      await click('block-b')
      expect(marked()).toEqual(['b'])
      key(document.body, 'Escape')
      expect(q('panel')).toBeNull()
      expect(marked()).toEqual([])
      expect(toWindow).not.toHaveBeenCalled()
      key(document.body, 'Escape')
      expect(toWindow).toHaveBeenCalledTimes(1)
    } finally {
      setWindowEscape(null)
    }
  })

  it('klik X → nowy szkic (panel się zamyka): X bez obwódki; „Zamknij” panelu tak samo', async () => {
    await mount()
    await click('block-b')
    expect(q('block-b')!.className).toContain('ring-lamp')
    await click('new-draft')
    expect(marked()).toEqual([])
    expect(q('block-b')!.className).not.toContain('ring-lamp')
  })

  it('grupa dwóch i więcej (Ctrl, Shift) zostaje po zamknięciu panelu i po szkicu; Esc najpierw zamyka panel, potem czyści grupę', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-c', { ctrlKey: true })
    await click('block-b')
    expect(marked()).toEqual(['b'])
    await click('block-a', { ctrlKey: true })
    await click('block-c', { ctrlKey: true })
    expect(marked()).toEqual(['a', 'b', 'c'])
    key(document.body, 'Escape')
    expect(q('panel')).toBeNull()
    expect(marked()).toEqual(['a', 'b', 'c'])
    await click('new-draft')
    expect(marked()).toEqual(['a', 'b', 'c'])
    key(document.body, 'Escape')
    expect(marked()).toEqual([])
  })

  it('selectOnly nie zostawia ringu na bloku, który zniknął z osi (usunięty gdzie indziej)', async () => {
    await mount()
    await click('block-b')
    await act(async () => root!.render(createElement(Harness, { items: TILES.filter((t) => t.id !== 'b') })))
    expect(marked()).toEqual([])
  })
})

describe('menu prawego przycisku „Zmień N bloków” (D528)', () => {
  const rightClick = (id: string) => act2(() => void q(id)!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 200, clientY: 200 })))
  const pick = (id: string) => act2(() => void q(id)!.click())

  it('na zaznaczonym – całe zaznaczenie; na spoza zaznaczenia – tylko ten blok; na pustej osi nic', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-c', { ctrlKey: true })
    await rightClick('block-c')
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
    expect(marked()).toEqual(['a', 'c'])
    key(document.body, 'Escape')
    await rightClick('block-e')
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 1 blok')
    expect(marked()).toEqual(['e'])
    key(document.body, 'Escape')
    const empty = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => void q('timeline-axis')!.dispatchEvent(empty))
    expect(q('block-menu')).toBeNull()
  })

  it('Shift+F10 na kafelku z fokusem otwiera menu zaznaczenia', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    q('block-b')!.focus()
    key(q('block-b')!, 'F10', { shiftKey: true })
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
  })

  it('pozycje: ✓ / „—” dla podkategorii, wyłączony wariant z powodem, Przesuń o… (później o 15 → `shift` 15), Usuń → `remove`', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-category')
    // The group that holds „inne” (the category of every block of the harness): ✓ at it – all of them are; another subcategory has none.
    const groups = [...document.querySelectorAll<HTMLElement>('[data-testid^="block-menu-group-"]')]
    let found = false
    for (const g of groups) {
      await act2(() => void g.click())
      if (q('block-menu-category-inne')) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
    expect(q('block-menu-category-inne')!.getAttribute('aria-checked')).toBe('true')
    expect(q('block-menu-category-inne')!.textContent).toContain('✓')
    const other = [...document.querySelectorAll<HTMLElement>('[data-testid^="block-menu-category-"]')].find((e) => e.getAttribute('data-testid') !== 'block-menu-category-inne')
    expect(other?.getAttribute('aria-checked') ?? null).toBeNull()
    key(document.body, 'Escape')
    key(document.body, 'Escape')
    key(document.body, 'Escape')
    expect(q('block-menu')).toBeNull()
    // „Wariant” – the category „inne” has none: disabled with the reason.
    await rightClick('block-b')
    expect(q('block-menu-variant')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('block-menu-variant')!.title).toContain('nie ma wariantów')
    await pick('block-menu-shift')
    await pick('block-menu-later')
    await pick('block-menu-later-15')
    expect(runs).toEqual([{ view: 'today', ids: ['a', 'b'], action: { kind: 'shift', minutes: 15 } }])
    expect(q('block-menu')).toBeNull()
    await rightClick('block-b')
    await pick('block-menu-remove')
    expect(runs.at(-1)).toEqual({ view: 'today', ids: ['a', 'b'], action: { kind: 'remove' } })
  })

  it('„Koszt…” otwiera okno czterech liczb i „Jak podkategoria” (cost: null); „Zastosuj” niesie liczby', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-cost')
    expect(q('group-cost')).not.toBeNull()
    expect((q('group-cost-head-value') as HTMLInputElement).value).toBe('3')
    await pick('group-cost-head-plus')
    await pick('group-cost-apply')
    expect(runs.at(-1)).toEqual({ view: 'today', ids: ['a', 'b'], action: { kind: 'cost', costs: { head: 4, emotions: 1, senses: 1, body: 0 } } })
    await rightClick('block-b')
    await pick('block-menu-cost')
    await pick('group-cost-reset')
    expect(runs.at(-1)!.action).toEqual({ kind: 'cost', costs: null })
  })

  it('„Koszt…”: wpisane 55 i „Zastosuj” niesie 55 (D568); 101 – odmowa, wartość wraca; [+] przy 100 wyłączony', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-cost')
    await typeLeave('group-cost-head-value', '101')
    expect(q('group-cost-head-value-error')!.getAttribute('role')).toBe('alert')
    expect((q('group-cost-head-value') as HTMLInputElement).value).toBe('3')
    await typeLeave('group-cost-head-value', '55')
    expect(q('group-cost-head-value-error')).toBeNull()
    expect((q('group-cost-head-value') as HTMLInputElement).value).toBe('55')
    await typeLeave('group-cost-body-value', '-100')
    expect(q('group-cost-body-minus')!.hasAttribute('disabled')).toBe(true)
    // The press of the button (the mouse): pointerdown, then the click.
    await act2(() => void q('group-cost-apply')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 })))
    await pick('group-cost-apply')
    expect(runs.at(-1)).toEqual({ view: 'today', ids: ['a', 'b'], action: { kind: 'cost', costs: { head: 55, emotions: 1, senses: 1, body: -100 } } })
  })

  it('„Koszt…”: wcześniejsza odmowa pola nie blokuje „Zastosuj” z klawiatury (Tab, Enter – bez pointerdown), gdy wpis poprawiony', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-cost')
    await typeLeave('group-cost-head-value', '101')
    expect(q('group-cost-head-value-error')).not.toBeNull()
    await typeLeave('group-cost-head-value', '55')
    await pick('group-cost-apply')
    expect(runs.at(-1)).toEqual({ view: 'today', ids: ['a', 'b'], action: { kind: 'cost', costs: { head: 55, emotions: 1, senses: 1, body: 0 } } })
  })

  it('„Koszt…”: wpisanie, potem [+] liczy się od wpisanej', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-cost')
    await typeLeave('group-cost-senses-value', '99')
    await pick('group-cost-senses-plus')
    expect((q('group-cost-senses-value') as HTMLInputElement).value).toBe('100')
    expect(q('group-cost-senses-plus')!.hasAttribute('disabled')).toBe(true)
  })

  it('„Zastosuj” naciśnięte na polu, które odrzuca wpis (pointerdown → blur → odmowa → click): nic nie stosuje, okno zostaje z powodem (T2440)', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    await click('block-b', { ctrlKey: true })
    await rightClick('block-b')
    await pick('block-menu-cost')
    const before = runs.length
    const input = q('group-cost-head-value') as HTMLInputElement
    await act2(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '101')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // The press: pointerdown first, then the blur of the field (its refusal), then the click.
    await act2(() => void q('group-cost-apply')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 })))
    await act2(() => input.blur())
    await pick('group-cost-apply')
    expect(runs).toHaveLength(before)
    expect(q('group-cost')).not.toBeNull()
    expect(q('group-cost-head-value-error')!.getAttribute('role')).toBe('alert')
    expect((q('group-cost-head-value') as HTMLInputElement).value).toBe('3')
    // Corrected and pressed again: it applies.
    await typeLeave('group-cost-head-value', '55')
    await act2(() => void q('group-cost-apply')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 })))
    await pick('group-cost-apply')
    expect(runs.at(-1)).toEqual({ view: 'today', ids: ['a', 'b'], action: { kind: 'cost', costs: { head: 55, emotions: 1, senses: 1, body: 0 } } })
  })

})

describe('Del na zaznaczeniu ≥ 2 – jedno pytanie (D528)', () => {
  it('„Usunąć 3 bloki?”, Enter usuwa przez `remove` całej grupy; jeden zaznaczony – nie jest celem grupowym', async () => {
    await mount()
    await click('block-a', { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')).toBeNull()
    await click('block-b', { ctrlKey: true })
    await click('block-d', { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain(`Usunąć ${groupCount(3, 'block')}?`)
    await click('delete-ask-yes')
    expect(runs).toEqual([{ view: 'today', ids: ['a', 'b', 'd'], action: { kind: 'remove' } }])
  })
})

describe('„Szablony”: ta sama oś na prawdziwej stronie', () => {
  const REL = 'templates/t1.json'
  const template = (): Template => ({
    id: 't1',
    name: 'Zwykły',
    dayType: 'zjazd-zdalny',
    weekdays: [],
    versions: [
      {
        from: '2026-01-01',
        blocks: ['a', 'b', 'c', 'd', 'e'].map((id, i) => planBlock({ id, categoryId: 'analiza', startMin: 10 * 60 + i * 60, durationMin: 60, origin: 'template' })),
        budgetMin: null,
        maxMin: null
      }
    ],
    archived: false
  })
  async function open() {
    const t = template()
    records.set(REL, templateJson(t))
    useData.setState({ templates: [t], routines: [], rd: rdFrom({}), view: { today: TODAY, computers: [] } as unknown as DataView })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement('div', null, createElement(TemplatesPage), createElement(DeleteDialog))))
    await click('template-item')
  }

  it('Ctrl+klik, Shift+klik, napis nad osią, menu bez odwołania, parkowania i przeniesienia na dzień; Del grupowy; zmiana wersji czyści', async () => {
    await open()
    await click('block-b', { ctrlKey: true })
    await click('block-d', { ctrlKey: true })
    expect(marked()).toEqual(['b', 'd'])
    expect(q('template-editor')!.querySelector('[data-testid="block-editor"]')).toBeNull()
    await click('block-e', { shiftKey: true })
    expect(marked()).toEqual(['b', 'd', 'e'])
    expect(q('axis-selection')!.textContent).toMatch(/^Zaznaczone: 3 · 3 h · energia/)
    await act2(() => void q('block-e')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 })))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 3 bloki')
    expect(q('block-menu-cancel')).toBeNull()
    expect(q('block-menu-park')).toBeNull()
    expect(q('block-menu-moveto')).toBeNull()
    expect(q('block-menu-remove')).not.toBeNull()
    key(document.body, 'Escape')
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain('Usunąć 3 bloki?')
    await click('delete-ask-yes')
    expect(runs).toEqual([{ view: 'template', ids: ['b', 'd', 'e'], action: { kind: 'remove' } }])
    // A plain click: only that block, its panel opens (D462); the record is not touched by any of it.
    await click('block-c')
    expect(marked()).toEqual(['c'])
    expect(q('block-editor')).not.toBeNull()
    expect(templateFrom(records.get(REL))!.versions[0]!.blocks).toHaveLength(5)
  })
})

describe('„Dziś”: okablowanie strony (TodayPage mierzy E2E; tu – warunki w kodzie)', () => {
  it('oś dostaje zaznaczenie, menu i napis; panel otwarty blok zaznacza jako jedyny; Del grupowy ma pierwszeństwo; scope = dzień', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    expect(page).toContain("view: 'today',")
    expect(page).toContain('scope: date,')
    expect(page).toContain('marked={group.marked}')
    expect(page).toContain('onContext={group.onContext}')
    expect(page).toContain('if (!group.onSelect(id, mods)) return')
    expect(page).toContain('if (id != null) group.selectOnly(id)\n    else group.release()')
    // One list: what the axis draws (the checked calendars' blocks and the revealed one) – the order, the line and the menu.
    expect(page).toContain('tiles: axisItems.items,')
    expect(page).toContain('const deleteTarget = group.removeTarget ?? singleTarget')
    expect(page).toContain('{group.overlay}')
    expect(page).toContain('{group.line}')
    // The Esc of the panel is a layer of its own, the selection's is a base layer – the panel opened by the click closes first (T1543).
    const hook = readFileSync('src/renderer/lib/useSelection.ts', 'utf8')
    expect(hook).toContain('useEscapeLayer(enabled && count > 0, clear, true')
  })
})

describe('menu „Zmień N bloków”: werdykty silnika raz na otwarcie, znowu przy zmianie danych (T1720)', () => {
  const menu = { ids: ['a', 'b'], at: { x: 10, y: 10 } }
  const ctx = menuCtxOf({ rd: rdFrom({ schema: 1 }), settings: settingsOn(rdFrom({ schema: 1 }).settings, '2026-11-16'), routines: [] })
  const blocksOf = (ids: readonly string[]) => ids.map((id) => ({ id, categoryId: 'inne', variantId: null, routine: null, costs: null, state: 'open' as const, movable: true }))
  const verdicts = (take: number) => ({ day: { take, skipped: take ? [] : (['nie dziś', 'nie dziś'] as const).slice() } })
  let host: HTMLDivElement
  let root: Root
  const show = (o: { ctx: MenuCtx; date: string }) => act(async () => root.render(createElement(BlockGroupMenu, { view: 'today', menu, onClose: () => undefined, blocksOf, ctx: o.ctx, today: '2026-11-16', where: { date: o.date } })))
  const cancel = () => document.querySelector('[data-testid="block-menu-cancel"]')!
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('kolejne rysowanie ekranu z tymi samymi danymi (to samo `ctx` i `blocksOf`, nowy obiekt `where` o tej samej wartości) nie liczy ich znowu', async () => {
    const judge = vi.fn(() => verdicts(2))
    const same = { ...ctx, judge }
    await show({ ctx: same, date: '2026-11-16' })
    await show({ ctx: same, date: '2026-11-16' })
    expect(cancel().getAttribute('aria-disabled')).toBeNull()
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it('przy otwartym menu zmienia się dzień albo jego dane – pozycje liczone od nowa', async () => {
    const today = vi.fn(() => verdicts(2))
    await show({ ctx: { ...ctx, judge: today }, date: '2026-11-16' })
    expect(cancel().getAttribute('aria-disabled')).toBeNull()
    // The day's data changed (a new model – a new `judge` of the screen): counted again.
    const changed = vi.fn(() => verdicts(0))
    await show({ ctx: { ...ctx, judge: changed }, date: '2026-11-16' })
    expect(changed).toHaveBeenCalledTimes(1)
    expect(cancel().getAttribute('title')).toBe('Odwołać i zaparkować można tylko dzisiejsze bloki')
    // Another day with the same `ctx`: counted again too.
    await show({ ctx: { ...ctx, judge: changed }, date: '2026-11-17' })
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
