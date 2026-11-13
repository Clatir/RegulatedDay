// @vitest-environment jsdom
/**
 * „+” of the quick capture in the bar (D402: always, T763): also while the bar has no day (no data folder, a day not
 * counted now) – and a field unfolded with a title typed stays as it is when the day goes from the view (a file read for
 * a moment unknown never takes your text).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** The logical day the main process answers (D454: the preview counts from it, not from the window's clock) – a Monday far from today. */
const MAIN_DAY = '2030-05-06'
/** What the main process answers now – a test moves it past 04:00 while the field is open. */
let mainDay = MAIN_DAY
beforeEach(() => {
  mainDay = MAIN_DAY
  ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve(mainDay) }
})

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

describe('podgląd słów daty liczy dzień z procesu głównego (D454)', () => {
  it('„!pt” przy dniu głównego procesu (pn 06.05.2030) to pt 10.05, nie piątek według zegara okna', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(field()!, 'Zapłacić !pt')
      field()!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[data-testid="bar-quick-preview"]')?.textContent).toBe('Termin: pt 10.05')
  })

  const typeInto = (text: string) =>
    act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(field()!, text)
      field()!.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const preview = () => host!.querySelector('[data-testid="bar-quick-preview"]')?.textContent
  async function openField() {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
  }

  it('dzień jest pytany przy każdej zmianie tekstu: po 04:00 przy otwartym polu następny znak liczy od nowego dnia', async () => {
    await openField()
    await typeInto('x !śr')
    expect(preview()).toBe('Termin: śr 08.05')
    mainDay = '2030-05-09'
    await typeInto('xx !śr')
    expect(preview()).toBe('Termin: śr 15.05')
  })

  it('i bez pisania: wpisany tekst, pole otwarte – dzień odświeża się co 30 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      await openField()
      await typeInto('x !śr')
      expect(preview()).toBe('Termin: śr 08.05')
      mainDay = '2030-05-09'
      await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)))
      expect(preview()).toBe('Termin: śr 15.05')
    } finally {
      vi.useRealTimers()
    }
  })
})
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

describe('panel otwarty „+” paska pulpitu (T771, T772)', () => {
  let target: ((t: { line: string | null; day: string | null; quick?: boolean } | null) => void) | null = null
  const hadObserver = 'ResizeObserver' in globalThis
  beforeEach(() => {
    const rd: Partial<RdApi> = { quickToday: () => Promise.resolve(MAIN_DAY), onPanelTarget: (cb) => ((target = cb), () => undefined), panelTouch: () => undefined, panelClose: () => undefined, barLayout: () => undefined }
    ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
    if (!hadObserver)
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        disconnect() {}
      }
  })
  afterEach(() => {
    // The panel unmounted while `window.rd` is still there (its cleanups call it), then the stubs go.
    act(() => root?.unmount())
    root = null
    act(() => useWidget.setState({ view: null }))
    delete (window as unknown as { rd?: unknown }).rd
    if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
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
    act(() => useWidget.setState({ view: dayView() }))
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
    }
  })

  it('„Odcinam się”: rozwinięte „⋯” zwija się (panel nie zostaje „rozwinięty”) i nie wraca po „Wracam”; pole szybkiego zapisu zostaje', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(PanelApp)))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-group-more"]')!.click())
    expect(host.querySelector('[data-testid="bar-unfold-more"]')).not.toBeNull()
    await act(async () => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    await act(async () => useWidget.setState({ view: dayView() }))
    expect(host.querySelector('[data-testid="bar-unfold-more"]')).toBeNull()
    // The quick field survives „Odcinam się” (its text) – and is the only unfold that does.
    await act(async () => target!({ line: null, day: null, quick: true }))
    await act(async () => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    expect(field()).not.toBeNull()
  })

  it('„+” przed pierwszym widokiem paska: pole otwiera się, gdy widok przyjdzie (otwarcie nie przepada)', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(PanelApp)))
    await act(async () => target!({ line: null, day: null, quick: true }))
    expect(field()).toBeNull()
    await act(async () => useWidget.setState({ view: dayView() }))
    expect(field()).not.toBeNull()
    expect(document.activeElement).toBe(field())
  })
})
