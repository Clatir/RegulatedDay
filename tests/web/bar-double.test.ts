// @vitest-environment jsdom
/**
 * A double click on a free spot of the desktop bar opens the main window (D560, T1976): counted from two releases (the
 * window without activation often never hears the press, T1500) – within 500 ms, at most 4 px apart, both beside every
 * control; only on the desktop bar.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { Bar, type BarMode } from '@renderer/widget/Bar'
import { BAR_DOUBLE_MS, freeSpot, secondRelease } from '@renderer/widget/barDouble'
import { noFolderView, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-20', lines: [], block: null, requests: { people: [], running: null, interrupted: null } })

const hadObserver = 'ResizeObserver' in globalThis
let root: Root | null = null
let host: HTMLElement | null = null
let rd: { showMain: ReturnType<typeof vi.fn<RdApi['showMain']>> }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
  rd = { showMain: vi.fn<RdApi['showMain']>() }
  const api: Partial<RdApi> = {
    ...rd,
    widgetAction: () => Promise.resolve(null as never),
    barClose: () => undefined,
    panelTouch: () => undefined,
    quickToday: () => Promise.resolve({ today: '2026-11-20', nowMin: null }),
    barLayout: () => undefined,
    barDrag: () => undefined,
    onBarDragOver: () => () => undefined
  }
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
  vi.useRealTimers()
  delete (window as unknown as { rd?: unknown }).rd
  if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

async function render(view: WidgetView, mode: BarMode): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Bar, { view, mode })))
  return host
}

/** A release of the mouse button only – no press, no click (the window without activation, T1500). */
const release = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, screenX: 100, screenY: 50, ...init })))
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

describe('dwuklik w wolne miejsce paska pulpitu (D560)', () => {
  it('dwa puszczenia w wolnym miejscu – okno główne, raz; trzecie zaczyna od nowa', async () => {
    for (const view of [dayView(), noFolderView()]) {
      const el = await render(view, 'desktop')
      const free = el.querySelector('[data-testid="bar-desktop"] > div')!
      expect(freeSpot(free)).toBe(true)
      release(free)
      expect(rd.showMain).not.toHaveBeenCalled()
      later(200)
      release(free, { screenX: 103, screenY: 47 })
      expect(rd.showMain).toHaveBeenCalledTimes(1)
      later(100)
      release(free)
      expect(rd.showMain).toHaveBeenCalledTimes(1)
      act(() => root?.unmount())
      host?.remove()
      rd.showMain.mockClear()
    }
  })

  it('za wolno, za daleko, prawy przycisk albo przycisk paska między nimi – nic', async () => {
    const el = await render(dayView(), 'desktop')
    const free = el.querySelector('[data-testid="bar-desktop"] > div')!
    const button = el.querySelector('[data-testid="bar-close"]')!
    release(free)
    later(BAR_DOUBLE_MS + 1)
    release(free)
    later(100)
    release(free, { screenX: 110 })
    later(100)
    release(free, { button: 2 })
    later(100)
    release(free)
    later(100)
    release(button)
    later(100)
    release(free)
    later(100)
    release(button)
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('wciśnięcie na przycisku zsunięte obok i puszczenia na uchwycie – nie są połową dwukliku', async () => {
    const el = await render(dayView(), 'desktop')
    const free = el.querySelector('[data-testid="bar-desktop"] > div')!
    const button = el.querySelector('[data-testid="bar-close"]')!
    const handle = el.querySelector('[data-testid="bar-drag"]')!
    // Pressed on „×”, slid off, let go on a free spot – then one click there: no double click.
    act(() => void button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    release(free)
    later(100)
    release(free)
    // Two releases on the handle (the end of a drag – the handle keeps its release).
    later(600)
    release(handle)
    later(100)
    release(handle)
    expect(rd.showMain).not.toHaveBeenCalled()
    // The press heard on a free spot: the double click still counts.
    later(600)
    act(() => void free.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    release(free)
    later(100)
    release(free)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('wciśnięcie przerwane (pointercancel) na przycisku nie zabiera pierwszego puszczenia następnego dwukliku', async () => {
    const el = await render(dayView(), 'desktop')
    const free = el.querySelector('[data-testid="bar-desktop"] > div')!
    const button = el.querySelector('[data-testid="bar-close"]')!
    act(() => void button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    act(() => void button.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })))
    later(600)
    release(free)
    later(100)
    release(free)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('wciśnięcie na przycisku bez usłyszanego puszczenia: ruch bez przycisku je zeruje, dwuklik działa', async () => {
    const el = await render(dayView(), 'desktop')
    const free = el.querySelector('[data-testid="bar-desktop"] > div')!
    const button = el.querySelector('[data-testid="bar-close"]')!
    act(() => void button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    act(() => void free.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })))
    later(600)
    release(free)
    later(100)
    release(free)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('tylko pasek pulpitu – w panelu i oknie głównym puszczenia nic nie liczą', async () => {
    for (const mode of ['main', 'panel'] as const) {
      const el = await render(dayView(), mode)
      const free = el.querySelector(`[data-testid="bar-${mode}"] > div`)!
      release(free)
      later(100)
      release(free)
      act(() => root?.unmount())
      host?.remove()
    }
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('drugie puszczenie: w czasie i w odległości od pierwszego', () => {
    expect(secondRelease(null, { at: 0, x: 0, y: 0 })).toBe(false)
    expect(secondRelease({ at: 0, x: 0, y: 0 }, { at: 500, x: 4, y: -4 })).toBe(true)
    expect(secondRelease({ at: 0, x: 0, y: 0 }, { at: 501, x: 0, y: 0 })).toBe(false)
    expect(secondRelease({ at: 0, x: 0, y: 0 }, { at: 100, x: 5, y: 0 })).toBe(false)
    expect(secondRelease({ at: 100, x: 0, y: 0 }, { at: 50, x: 0, y: 0 })).toBe(false)
  })
})
