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
  const api: Partial<RdApi> = { ...rd, widgetAction: () => Promise.resolve(null as never), onPanelTarget: () => () => undefined, panelTouch: () => undefined, barLayout: () => undefined }
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

const click = (el: Element, init: MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...init }))
  })

/** A day with one line „Skończył się o…” (its ±5 min unfold in the line itself). */
const lineView = (): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-12',
  block: null,
  lines: [{ id: 'ended:2026-11-12:b1', text: 'Blok skończył się?', dot: false, at: Date.UTC(2026, 10, 12, 9, 0), actions: [{ id: 'endedAt', label: 'Skończył się o…' }] }]
})

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
    act(() => {
      panel.querySelector('[data-testid="panel-close"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      // Chromium gives the click to the common parent of the press and the release.
      panel.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    })
    expect(rd.showMain).not.toHaveBeenCalled()
    expect(rd.panelClose).not.toHaveBeenCalled()
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
