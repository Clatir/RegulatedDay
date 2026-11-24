// @vitest-environment jsdom
/**
 * „Koszt ▸” of the bar's „⋯” (D585, N12): the cost per hour of the block in front, begun and not ended, from now on – only while the view
 * has one (`WidgetView.cost`); „Koszt od teraz: <nazwa>”, four pools each [−] number [+] (±1, with Shift ±10 – the key's state comes with
 * the click, also on the desktop bar that takes no keys), „Jak podkategoria (…)” / „Jak wariant (…)” and „Gotowe”. Every click is an intent
 * sent to the main process at once (`cost` – `<block>|<pool>|<±n>`, `<block>|<pool>|=<n>`, `<block>|reset`); the desktop bar has no field
 * (it never takes the focus, D229), the window's bar and the icon's panel have one between [−] and [+] (a number out of −100…100 refused
 * under it). The numbers are the view's.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { installEscape } from '@renderer/lib/escape'
import { Bar, type BarMode } from '@renderer/widget/Bar'
import { ALL_BUTTONS, noFolderView, type BarCost, type WidgetView } from '@shared/widget'

let uninstallEscape: () => void = () => undefined
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  uninstallEscape = installEscape()
})
afterAll(() => uninstallEscape())

const base = { head: 1, emotions: 1, senses: 1, body: 1 }
const cost = (over: Partial<BarCost> = {}): BarCost => ({ block: 'a', name: 'Pisanie', costs: base, base, own: false, ...over })
const work = (over: Partial<WidgetView> = {}): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-23',
  block: { name: 'Pisanie', className: 'praca', endsAt: Date.UTC(2026, 10, 23, 11, 0) },
  buttons: { ...ALL_BUTTONS },
  requests: { people: [], running: null, interrupted: null },
  lines: [],
  cost: cost(),
  ...over
})

let root: Root | null = null
let host: HTMLElement | null = null
let widgetAction: ReturnType<typeof vi.fn<RdApi['widgetAction']>>
const hadObserver = 'ResizeObserver' in globalThis

beforeEach(() => {
  // The desktop bar counts a double click from the releases' instants (C8): the clicks of a test stand apart unless `quick`.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-23T10:30:00Z'))
  widgetAction = vi.fn<RdApi['widgetAction']>(() => Promise.resolve())
  const api: Partial<RdApi> = { widgetAction, showMain: vi.fn(), barAction: vi.fn(() => Promise.resolve()), barClose: vi.fn(), barLayout: vi.fn(), panelTouch: () => undefined, barDrag: () => undefined, onBarDragOver: () => () => undefined, quickToday: () => Promise.resolve({ today: '2026-11-23', nowMin: null }) }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = api
  if (!hadObserver)
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  vi.useRealTimers()
  delete (window as unknown as { rd?: unknown }).rd
  if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
async function render(view: WidgetView, mode: BarMode): Promise<void> {
  if (!host) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(createElement(Bar, { view, mode })))
}
/**
 * A click as each mode hears it: the release of the mouse button on the desktop bar, a click elsewhere; `shift` – Shift held; `quick` – at
 * once after the click before (else 0.6 s later: never the second click of a double click).
 */
function press(el: Element, mode: BarMode, o: { shift?: boolean; quick?: boolean } = {}): void {
  if (!o.quick) vi.setSystemTime(Date.now() + 600)
  act(() => void el.dispatchEvent(new MouseEvent(mode === 'desktop' ? 'pointerup' : 'click', { bubbles: true, cancelable: true, button: 0, detail: o.quick ? 2 : 1, shiftKey: o.shift ?? false })))
}
async function openCost(view: WidgetView, mode: BarMode): Promise<void> {
  await render(view, mode)
  press(q('bar-group-more')!, mode)
  press(q('bar-group-cost')!, mode)
}
const typeLeave = (id: string, text: string) =>
  act(() => {
    const input = q(id) as HTMLInputElement
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })

describe('„Koszt ▸” w „⋯” paska (D585)', () => {
  it('tylko przy koszcie w widoku (zaczęty blok pierwszego planu); obok „Prośba ▸” i „Sygnały ▸”', async () => {
    await render(work({ cost: null }), 'panel')
    press(q('bar-group-more')!, 'panel')
    expect(q('bar-more-actions')).not.toBeNull()
    expect(q('bar-group-cost')).toBeNull()
    await render(work(), 'panel')
    expect(q('bar-more-actions')!.querySelector('[data-testid="bar-group-cost"]')!.textContent).toBe('Koszt ▸')
  })

  it('rozwinięcie: nagłówek z nazwą bloku, cztery pule G · E · B · C, „Jak podkategoria (…)” i „Gotowe” zwija; „⋯” wciśnięte', async () => {
    await openCost(work({ cost: cost({ costs: { head: 3, emotions: -2, senses: 0, body: 1 }, own: true }) }), 'desktop')
    expect(q('bar-cost-title')!.textContent).toBe('Koszt od teraz: Pisanie')
    expect(['head', 'emotions', 'senses', 'body'].map((p) => q(`bar-cost-${p}-value`)!.textContent)).toEqual(['3', '−2', '0', '1'])
    expect(q('bar-cost-reset')!.textContent).toBe('Jak podkategoria (1·1·1·1)')
    expect(q('bar-cost-reset')!.getAttribute('aria-pressed')).toBe('false')
    expect(q('bar-group-more')!.getAttribute('aria-pressed')).toBe('true')
    press(q('bar-cost-reset')!, 'desktop')
    expect(widgetAction).toHaveBeenLastCalledWith('cost', 'a|reset')
    press(q('bar-cost-done')!, 'desktop')
    expect(q('bar-cost')).toBeNull()
  })

  it('„Jak wariant (…)” / „Jak rutyna (…)” – ta sama etykieta co okienko kafelka (`resetLabel`)', async () => {
    await openCost(work({ cost: cost({ base: { head: -3, emotions: -1, senses: -2, body: -3 }, baseFrom: 'variant' }) }), 'panel')
    expect(q('bar-cost-reset')!.textContent).toBe('Jak wariant (−3·−1·−2·−3)')
    await render(work({ cost: cost({ baseFrom: 'routine' }) }), 'panel')
    expect(q('bar-cost-reset')!.textContent).toBe('Jak rutyna (1·1·1·1)')
  })

  it('[−] [+] ±1, z Shift ±10 – na pasku pulpitu też (Shift z kliknięcia, bez fokusu); szybkie kliknięcia liczą się każde', async () => {
    for (const mode of ['desktop', 'panel', 'main'] as const) {
      await openCost(work(), mode)
      widgetAction.mockClear()
      press(q('bar-cost-head-plus')!, mode)
      // The second at once – a double click on the step: both count (as the steps of ±5 min).
      press(q('bar-cost-head-plus')!, mode, { quick: true })
      press(q('bar-cost-senses-minus')!, mode, { shift: true })
      press(q('bar-cost-body-plus')!, mode, { shift: true })
      expect(widgetAction.mock.calls, mode).toEqual([
        ['cost', 'a|head|+1'],
        ['cost', 'a|head|+1'],
        ['cost', 'a|senses|-10'],
        ['cost', 'a|body|+10']
      ])
      act(() => root?.unmount())
      host?.remove()
      root = host = null
    }
  })

  it('na brzegu zakresu: 100 nie rośnie, −100 nie maleje (przycisk nieaktywny, nic nie wysyła)', async () => {
    await openCost(work({ cost: cost({ costs: { head: 100, emotions: -100, senses: 0, body: 0 }, own: true }) }), 'desktop')
    expect((q('bar-cost-head-plus') as HTMLButtonElement).disabled).toBe(true)
    expect((q('bar-cost-emotions-minus') as HTMLButtonElement).disabled).toBe(true)
    widgetAction.mockClear()
    press(q('bar-cost-head-plus')!, 'desktop')
    press(q('bar-cost-emotions-minus')!, 'desktop')
    expect(widgetAction).not.toHaveBeenCalled()
    press(q('bar-cost-head-minus')!, 'desktop')
    expect(widgetAction).toHaveBeenCalledWith('cost', 'a|head|-1')
  })

  it('pasek pulpitu bez pola (nie bierze fokusu, D229); okno i panel – pole: wpisana liczba = ustaw, poza zakresem – powód pod polem', async () => {
    await openCost(work(), 'desktop')
    expect(q('bar-cost')!.querySelector('input')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    root = host = null
    await openCost(work(), 'panel')
    expect(q('bar-cost')!.querySelectorAll('input')).toHaveLength(4)
    expect((q('bar-cost-head-value') as HTMLInputElement).value).toBe('1')
    widgetAction.mockClear()
    typeLeave('bar-cost-head-value', '42')
    expect(widgetAction).toHaveBeenCalledWith('cost', 'a|head|=42')
    typeLeave('bar-cost-emotions-value', '-7')
    expect(widgetAction).toHaveBeenLastCalledWith('cost', 'a|emotions|=-7')
    widgetAction.mockClear()
    typeLeave('bar-cost-senses-value', '500')
    expect(widgetAction).not.toHaveBeenCalled()
    expect(q('bar-cost-senses-value-error')).not.toBeNull()
  })

  it('ostrzeżenie o starszym komputerze pod liczbami (D568) – z widoku, także na pasku pulpitu; bez niego – nic', async () => {
    const warning = 'Koszt spoza −5…5: Komputer PC B ma starszą wersję aplikacji – czyta go jak brak kosztu.'
    for (const mode of ['desktop', 'panel'] as const) {
      await openCost(work({ cost: cost({ costs: { ...base, head: 7 }, own: true, warning }) }), mode)
      expect(q('bar-cost-old')!.textContent, mode).toBe(warning)
      await render(work({ cost: cost({ costs: { ...base, head: 5 }, own: true }) }), mode)
      expect(q('bar-cost-old'), mode).toBeNull()
      act(() => root?.unmount())
      host?.remove()
      root = host = null
    }
  })

  it('nowa wartość z widoku po zapisie; blok zniknął z pierwszego planu albo inny blok – rozwinięcie się zwija', async () => {
    await openCost(work(), 'panel')
    await render(work({ cost: cost({ costs: { ...base, head: 2 }, own: true }) }), 'panel')
    expect((q('bar-cost-head-value') as HTMLInputElement).value).toBe('2')
    expect(q('bar-cost-reset')!.getAttribute('aria-pressed')).toBe('false')
    await render(work({ cost: cost({ block: 'b', name: 'Raport' }) }), 'panel')
    expect(q('bar-cost')).toBeNull()
    press(q('bar-group-more')!, 'panel')
    press(q('bar-group-cost')!, 'panel')
    expect(q('bar-cost-title')!.textContent).toBe('Koszt od teraz: Raport')
    await render(work({ cost: null }), 'panel')
    expect(q('bar-cost')).toBeNull()
  })
})
