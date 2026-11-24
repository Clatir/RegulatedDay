// @vitest-environment jsdom
/**
 * „+ Skrzynka” of the quick capture in the bar (D402: always, T763; D564 P15): also while the bar has no day (no data folder,
 * a day not counted now) – and a field unfolded with a title typed stays as it is when the day goes from the view (a file
 * read for a moment unknown never takes your text).
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
import { QuickApp } from '@renderer/widget/QuickApp'
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
  ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve({ today: mainDay, nowMin: null }) }
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

describe('pole „+ Skrzynka” w panelu ikony przy „Odcinam się” (T771, T772)', () => {
  const hadObserver = 'ResizeObserver' in globalThis
  beforeEach(() => {
    const rd: Partial<RdApi> = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: null }), onPanelTarget: () => () => undefined, panelTouch: () => undefined, panelClose: () => undefined, barLayout: () => undefined }
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
  async function panel() {
    act(() => useWidget.setState({ view: dayView() }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(PanelApp)))
  }

  it('„Odcinam się” w trakcie – ten sam pasek (tekst zostaje), widok nie zabiera fokusu', async () => {
    await panel()
    const other = document.createElement('button')
    document.body.append(other)
    try {
      await openWith('abc')
      expect(document.activeElement).toBe(field())
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
    await panel()
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-group-more"]')!.click())
    expect(host!.querySelector('[data-testid="bar-unfold-more"]')).not.toBeNull()
    await act(async () => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    await act(async () => useWidget.setState({ view: dayView() }))
    expect(host!.querySelector('[data-testid="bar-unfold-more"]')).toBeNull()
    // The quick field survives „Odcinam się” (its text) – and is the only unfold that does.
    await openWith('x')
    await act(async () => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    expect(field()?.value).toBe('x')
  })
})

describe('podgląd „#…”: lista podkategorii od otwarcia pola, nie od wpisania „#” (N10, D600)', () => {
  const CATS = [
    { id: 'inne', name: 'Inne obowiązki' },
    { id: 'analiza', name: 'Analiza' }
  ]
  const typeText = (input: HTMLInputElement, text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

  it('pole paska: lista pytana przy otwarciu (przed pierwszym znakiem), podgląd z nazwą od razu po wpisaniu „#anal”', async () => {
    const quickCategories = vi.fn(() => Promise.resolve(CATS))
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: null }), quickCategories }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    expect(quickCategories).toHaveBeenCalledTimes(1)
    await typeText(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!, 'Raport @jutro 15:00 1h #anal')
    expect(host.querySelector('[data-testid="bar-quick-preview"]')?.textContent).toBe('Wykonać: jutro 15:00 · 1 h · Analiza')
    // A keystroke asks for the day only – the list is not asked again at every letter.
    expect(quickCategories).toHaveBeenCalledTimes(1)
  })

  it('okienko „Do skrzynki”: lista pytana przy pokazaniu okienka (onQuickShown), nie dopiero po „#”', async () => {
    const quickCategories = vi.fn(() => Promise.resolve(CATS))
    let shown: () => void = () => undefined
    ;(window as unknown as { rd: Partial<RdApi> }).rd = {
      quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: null }),
      quickCategories,
      quickClose: () => undefined,
      onQuickShown: (cb) => {
        shown = cb
        return () => undefined
      }
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(QuickApp)))
    expect(quickCategories).toHaveBeenCalledTimes(1)
    await act(async () => shown())
    expect(quickCategories).toHaveBeenCalledTimes(2)
    await typeText(host.querySelector<HTMLInputElement>('[data-testid="quick-title"]')!, 'Raport #zrod')
    expect(host.querySelector('[data-testid="quick-preview"]')).toBeNull()
    await typeText(host.querySelector<HTMLInputElement>('[data-testid="quick-title"]')!, 'Raport #anal')
    expect(host.querySelector('[data-testid="quick-preview"]')?.textContent).toBe('Analiza')
  })
})

describe('okienko „Do skrzynki”: zapis czeka na odpowiedź o zmianie z innego komputera (D601)', () => {
  it('„asked” – okienko mówi to pod polem (spokojnie, nie błąd), pole puste; następny znak zdejmuje komunikat', async () => {
    const quickAdd = vi.fn(() => Promise.resolve({ ok: true, error: null, id: 'x', title: 'Raport', asked: true as const }))
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: null }), quickCategories: () => Promise.resolve([]), quickClose: () => undefined, onQuickShown: () => () => undefined, quickAdd }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(QuickApp)))
    const input = host.querySelector<HTMLInputElement>('[data-testid="quick-title"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Raport @jutro 15:00')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => void input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(quickAdd).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-testid="quick-asked"]')?.textContent).toBe('Zapisano: Raport – czeka na odpowiedź o zmianie z innego komputera')
    expect(host.querySelector('[data-testid="quick-error"]')).toBeNull()
    expect(input.value).toBe('')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'x')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[data-testid="quick-asked"]')).toBeNull()
  })
})

describe('podgląd „@HH:MM” liczy dzień i minutę z zegara procesu głównego, nie z okna (T869, D604)', () => {
  const typeText = (input: HTMLInputElement, text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

  it('pole paska: w nocy głównego procesu (minuta 1530) „@15:00” to jutro; bez znanej minuty – dziś', async () => {
    for (const [nowMin, expected] of [[1530, 'Wykonać: jutro 15:00'], [null, 'Wykonać: dziś 15:00']] as const) {
      ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin }), quickCategories: () => Promise.resolve([]) }
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
      await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
      await typeText(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!, 'Raport @15:00')
      expect(host.querySelector('[data-testid="bar-quick-preview"]')?.textContent).toBe(expected)
      act(() => root?.unmount())
      host.remove()
      root = host = null
    }
  })

  it('okienko „Do skrzynki”: ta sama minuta głównego procesu', async () => {
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: 1530 }), quickCategories: () => Promise.resolve([]), quickClose: () => undefined, onQuickShown: () => () => undefined }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(QuickApp)))
    await typeText(host.querySelector<HTMLInputElement>('[data-testid="quick-title"]')!, 'Raport @15:00')
    expect(host.querySelector('[data-testid="quick-preview"]')?.textContent).toBe('Wykonać: jutro 15:00')
  })
})
