// @vitest-environment jsdom
/**
 * The desktop bar's „×” (D559): only on the desktop bar (with a day and without one), in its own 24 px on the right; a
 * click hides the bar (`x`), with Shift ends the app (`quit`) – never a click of the bar (`barClick`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { Bar, type BarMode } from '@renderer/widget/Bar'
import { noFolderView, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-20', lines: [], block: null, requests: { people: [], running: null, interrupted: null } })
const html = (view: WidgetView, mode: BarMode) => renderToStaticMarkup(createElement(Bar, { view, mode }))

const hadObserver = 'ResizeObserver' in globalThis
let root: Root | null = null
let host: HTMLElement | null = null
let rd: { barClose: ReturnType<typeof vi.fn<RdApi['barClose']>>; widgetAction: ReturnType<typeof vi.fn<RdApi['widgetAction']>> }

beforeEach(() => {
  rd = { barClose: vi.fn<RdApi['barClose']>(), widgetAction: vi.fn<RdApi['widgetAction']>(() => Promise.resolve(null as never)) }
  const api: Partial<RdApi> = { ...rd, quickToday: () => Promise.resolve('2026-11-20'), barLayout: () => undefined, barDrag: () => undefined, onBarDragOver: () => () => undefined }
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
  delete (window as unknown as { rd?: unknown }).rd
  if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

describe('„×” paska pulpitu (D559)', () => {
  it('stoi tylko na pasku pulpitu – z dniem i bez folderu; treść ma po prawej 32 px (pas „×”)', () => {
    for (const view of [dayView(), noFolderView()]) {
      const desktop = html(view, 'desktop')
      expect(desktop).toContain('data-testid="bar-close"')
      expect(desktop).toContain('pr-8')
      for (const mode of ['main', 'panel'] as const) expect(html(view, mode)).not.toContain('data-testid="bar-close"')
    }
  })

  it('puszczenie przycisku chowa pasek, z Shift kończy aplikację – bez wciśnięcia i bez click (T1500), żadne nie jest kliknięciem paska', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'desktop' })))
    const x = host.querySelector('[data-testid="bar-close"]')!
    const fire = (type: string, init: MouseEventInit = {}) => x.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }))
    // The window without activation: only the release reaches the page – no press, no click.
    act(() => void fire('pointerup'))
    act(() => void fire('pointerup', { shiftKey: true }))
    // A click alone (no release heard) and the right button do nothing.
    act(() => void fire('click'))
    act(() => void fire('pointerup', { button: 2 }))
    expect(rd.barClose.mock.calls).toEqual([['x'], ['quit']])
    expect(rd.widgetAction).not.toHaveBeenCalled()
  })
})
