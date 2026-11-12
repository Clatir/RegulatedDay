// @vitest-environment jsdom
/**
 * „+” of the quick capture in the bar (D402: always, T763): also while the bar has no day (no data folder, a day not
 * counted now) – and a field unfolded with a title typed stays as it is when the day goes from the view (a file read for
 * a moment unknown never takes your text).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { RdApi } from '@shared/api'
import { installEscape } from '@renderer/lib/escape'
import { useWidget } from '@renderer/store/widget'
import { Bar } from '@renderer/widget/Bar'
import { PanelApp } from '@renderer/widget/PanelApp'
import { noFolderView, type WidgetView } from '@shared/widget'

let uninstallEscape: () => void = () => undefined
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  uninstallEscape = installEscape()
})
afterAll(() => uninstallEscape())

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-12', lines: [], block: null })

describe('„+” bez dnia w pasku', () => {
  it('pasek bez dnia ma „+” w oknie, w panelu i na pasku pulpitu', () => {
    for (const mode of ['main', 'panel', 'desktop'] as const) expect(renderToStaticMarkup(createElement(Bar, { view: noFolderView(), mode }))).toContain('data-testid="bar-quick"')
  })

  it('pole z wpisanym tytułem zostaje, gdy dzień znika z widoku (i wraca)', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'Zamówić karmę')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => root!.render(createElement(Bar, { view: noFolderView('failed'), mode: 'main' })))
    expect(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')?.value).toBe('Zamówić karmę')
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    expect(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')?.value).toBe('Zamówić karmę')
  })
})

const field = () => host!.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')
async function openWith(text: string) {
  await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(field()!, text)
    field()!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('pole szybkiego zapisu: tekst tylko przez zmianę układu (T767)', () => {
  async function mount() {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
  }

  it('Esc zamyka i czyści; „+” jeszcze raz – pole puste', async () => {
    await mount()
    await openWith('nie zapisuj')
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(field()).toBeNull()
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    expect(field()?.value).toBe('')
  })

  it('zamknięte drugim „+” – czyści', async () => {
    await mount()
    await openWith('x')
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    expect(field()).toBeNull()
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    expect(field()?.value).toBe('')
  })

  it('zmiana układu nie zabiera fokusu (bez ponownego autoFocus); otwarcie – fokus w polu', async () => {
    await mount()
    await openWith('x')
    expect(document.activeElement).toBe(field())
    const other = document.createElement('button')
    document.body.append(other)
    try {
      other.focus()
      await act(async () => root!.render(createElement(Bar, { view: noFolderView('failed'), mode: 'main' })))
      expect(field()?.value).toBe('x')
      expect(document.activeElement).toBe(other)
    } finally {
      other.remove()
    }
  })
})

describe('panel otwarty „+” paska pulpitu (T771)', () => {
  let target: ((t: { line: string | null; day: string | null; quick?: boolean } | null) => void) | null = null
  beforeEach(() => {
    const rd: Partial<RdApi> = { onPanelTarget: (cb) => ((target = cb), () => undefined), panelTouch: () => undefined, panelClose: () => undefined, barLayout: () => undefined }
    ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  })
  afterEach(() => {
    delete (window as unknown as { rd?: unknown }).rd
  })

  it('każde nowe otwarcie daje fokus polu – także gdy już jest otwarte; flaga nie zostaje na później', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const other = document.createElement('button')
    document.body.append(other)
    try {
      await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'panel', quickAt: { n: 1 } })))
      expect(document.activeElement).toBe(field())
      other.focus()
      await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'panel', quickAt: { n: 2 } })))
      expect(document.activeElement).toBe(field())
      other.focus()
      // A change of layout afterwards: the focus stays where it is.
      const same = { n: 3 }
      await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'panel', quickAt: same })))
      other.focus()
      await act(async () => root!.render(createElement(Bar, { view: noFolderView('failed'), mode: 'panel', quickAt: same })))
      expect(document.activeElement).toBe(other)
    } finally {
      other.remove()
    }
  })

  it('panel: „Odcinam się” w trakcie – ten sam pasek (tekst zostaje), otwarcie nie wraca ani nie zabiera fokusu', async () => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe() {}
      disconnect() {}
    }
    useWidget.setState({ view: dayView() })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const other = document.createElement('button')
    document.body.append(other)
    try {
      await act(async () => root!.render(createElement(PanelApp)))
      await act(async () => target!({ line: null, day: null, quick: true }))
      expect(document.activeElement).toBe(field())
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        set.call(field()!, 'abc')
        field()!.dispatchEvent(new Event('input', { bubbles: true }))
      })
      other.focus()
      await act(async () => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
      expect(field()?.value).toBe('abc')
      expect(document.activeElement).toBe(other)
      await act(async () => useWidget.setState({ view: dayView() }))
      expect(field()?.value).toBe('abc')
      expect(document.activeElement).toBe(other)
    } finally {
      other.remove()
      useWidget.setState({ view: null })
    }
  })
})
