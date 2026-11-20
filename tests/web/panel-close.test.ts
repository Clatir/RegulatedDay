// @vitest-environment jsdom
/**
 * The icon's panel: „×” in the upper right corner hides it (the app stays in the tray), „×” with Shift ends the app, and
 * a click on a free spot opens the main window – never a click of a button, a press on a button slid off it, nor a click
 * beside „Skończył się o…” with its ±5 min open (D558).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { useWidget } from '@renderer/store/widget'
import { PanelApp } from '@renderer/widget/PanelApp'
import { noFolderView, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const hadObserver = 'ResizeObserver' in globalThis
let root: Root | null = null
let host: HTMLElement | null = null
let rd: { panelClose: ReturnType<typeof vi.fn<RdApi['panelClose']>>; showMain: ReturnType<typeof vi.fn<RdApi['showMain']>> }

beforeEach(() => {
  rd = { panelClose: vi.fn<RdApi['panelClose']>(), showMain: vi.fn<RdApi['showMain']>() }
  const api: Partial<RdApi> = { ...rd, widgetAction: () => Promise.resolve(null as never), quickToday: () => Promise.resolve('2026-11-12'), onPanelTarget: () => () => undefined, panelTouch: () => undefined, barLayout: () => undefined }
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
  root = null
  host = null
  act(() => useWidget.setState({ view: null }))
  delete (window as unknown as { rd?: unknown }).rd
  if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

async function mount(): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(PanelApp)))
  return host.querySelector('[data-testid="panel"]')!
}

const fire = (el: Element, type: string, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }))
/** A press and a release on `down` / `up`; the click goes to `at` – Chromium's common parent of the two. */
const press = (down: Element, up: Element = down, at: Element = down, init: MouseEventInit = {}) =>
  act(() => {
    fire(down, 'pointerdown')
    fire(up, 'pointerup')
    fire(at, 'click', init)
  })
const click = (el: Element, init: MouseEventInit = {}) => press(el, el, el, init)

/** A day with one line „Skończył się o…” (its ±5 min unfold in the line itself). */
const lineView = (): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-12',
  block: null,
  lines: [{ id: 'ended:2026-11-12:b1', text: 'Blok skończył się?', dot: false, at: Date.UTC(2026, 10, 12, 9, 0), actions: [{ id: 'endedAt', label: 'Skończył się o…' }] }]
})

/** A cost waiting for „Potwierdź” (10 s left), not in place of a button on view – the row under the buttons. */
const PENDING = { button: 'line:x', text: 'Start kosztuje 5', left: 10_000 }

describe('panel ikony: „×” i kliknięcie w wolne pole (D558)', () => {
  it('„×” zamyka sam panel, nie otwiera okna', async () => {
    const panel = await mount()
    click(panel.querySelector('[data-testid="panel-close"]')!)
    expect(rd.panelClose).toHaveBeenCalledWith('x')
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('„×” z Shift kończy aplikację', async () => {
    const panel = await mount()
    click(panel.querySelector('[data-testid="panel-close"]')!, { shiftKey: true })
    expect(rd.panelClose).toHaveBeenCalledWith('quit')
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('kliknięcie w wolne pole i w tekst paska otwiera okno główne', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    click(panel)
    click(panel.querySelector('[data-testid="bar-block"]')!)
    expect(rd.showMain).toHaveBeenCalledTimes(2)
  })

  it('wciśnięty przycisk, zsunięty i puszczony obok – okno się nie otwiera', async () => {
    const panel = await mount()
    const x = panel.querySelector('[data-testid="panel-close"]')!
    press(x, panel, panel)
    expect(rd.showMain).not.toHaveBeenCalled()
    expect(rd.panelClose).not.toHaveBeenCalled()
  })

  it('wciśnięte obok przycisku, puszczone na nim – okno się nie otwiera', async () => {
    const panel = await mount()
    press(panel, panel.querySelector('[data-testid="panel-close"]')!, panel)
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('rozwinięte „+” – kliknięcie w wolne pole nie otwiera okna', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    await act(async () => panel.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    expect(panel.querySelector('[data-testid="bar-quick-title"]')).not.toBeNull()
    click(panel)
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('koszt czeka na „Potwierdź” – pasek ma data-busy, kliknięcie obok nie otwiera okna', async () => {
    act(() => useWidget.setState({ view: { ...lineView(), pending: PENDING } }))
    const panel = await mount()
    expect(panel.querySelector('[data-testid="bar-panel"]')!.getAttribute('data-busy')).toBe('on')
    click(panel)
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('„Skończył się o…” z rozwiniętym ±5 min – kliknięcie obok nie otwiera okna', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    const line = panel.querySelector('[data-testid="bar-line-ended:2026-11-12:b1"]')!
    await act(async () => line.querySelector<HTMLButtonElement>('[data-testid="bar-act-ended-endedAt"]')!.click())
    expect(line.getAttribute('data-busy')).toBe('on')
    click(line.querySelector('.num')!)
    click(panel)
    expect(rd.showMain).not.toHaveBeenCalled()
  })
})

describe('panel ikony: dwuklik zawsze otwiera okno główne (D559)', () => {
  /** Two presses (the first on `first`) and the double click on `el` – Chromium's `detail` counts the presses. */
  const dbl = (el: Element, first: Element = el) =>
    act(() => {
      fire(first, 'mousedown', { detail: 1 })
      fire(el, 'mousedown', { detail: 2 })
      fire(el, 'dblclick', { detail: 2 })
    })

  it('dwuklik w wolne pole, w tekst paska i w tekst linii otwiera okno', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    dbl(panel)
    dbl(panel.querySelector('[data-testid="bar-block"]')!)
    dbl(panel.querySelector('[data-testid="bar-line-ended:2026-11-12:b1"] span')!)
    expect(rd.showMain).toHaveBeenCalledTimes(3)
  })

  it('dwuklik otwiera okno także z rozwiniętym „+” i z kosztem czekającym na „Potwierdź”', async () => {
    act(() => useWidget.setState({ view: { ...lineView(), pending: PENDING } }))
    const panel = await mount()
    await act(async () => panel.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    dbl(panel)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('pierwsze kliknięcie na przycisku, drugie na tekście (przycisk zniknął) – okno się nie otwiera', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    dbl(panel.querySelector('[data-testid="bar-block"]')!, panel.querySelector('[data-testid="bar-act-ended-endedAt"]')!)
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('dwuklik w przycisk i w pole nie otwiera okna', async () => {
    act(() => useWidget.setState({ view: lineView() }))
    const panel = await mount()
    dbl(panel.querySelector('[data-testid="panel-close"]')!)
    await act(async () => panel.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    dbl(panel.querySelector('[data-testid="bar-quick-title"]')!)
    expect(rd.showMain).not.toHaveBeenCalled()
  })
})
