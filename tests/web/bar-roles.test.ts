// @vitest-environment jsdom
/**
 * The roles of the bar's three surfaces (UX10, D564 P12–P15, C1, C2, C7, C8): the desktop bar's „↗” above its „×” opens the
 * main window with one click; the icon's panel has a header „Regulated Day” with „×” and a footer „↗ Otwórz okno główne ·
 * ▣ Pasek pulpitu: pokaż / schowaj · ⏻ Zakończ aplikację”; „+ Skrzynka” of the desktop bar opens the window „Do skrzynki”
 * (the main process – `quickOpen`), in the window's bar and the panel it unfolds the field; the second click of a double
 * click on a button never acts again (also on another button that came in its place), the steps ±5 min count each click;
 * the panel opened again shows nothing unfolded from before it hid.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { DEFAULT_MACHINE_PREFS } from '@shared/machine'
import { useMachine } from '@renderer/store/machine'
import { useWidget } from '@renderer/store/widget'
import { Bar, type BarMode } from '@renderer/widget/Bar'
import { BAR_DOUBLE_MS } from '@renderer/widget/barDouble'
import { PanelApp } from '@renderer/widget/PanelApp'
import { ALL_BUTTONS, OPEN_MAIN_TEXT, QUIT_APP_TEXT, noFolderView, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/** A day with the bar's own buttons (Dalej, Pauza, Przedłuż …) and one line „Skończył się o…” (its ±5 min in the line). */
const dayView = (): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-21',
  block: null,
  buttons: { ...ALL_BUTTONS },
  requests: { people: [{ id: 'mama', name: 'Mama' }], running: null, interrupted: null },
  lines: [{ id: 'ended:2026-11-21:b1', text: 'Blok skończył się?', dot: false, at: Date.UTC(2026, 10, 21, 9, 0), actions: [{ id: 'endedAt', label: 'Skończył się o…' }] }]
})

const hadObserver = 'ResizeObserver' in globalThis
let root: Root | null = null
let host: HTMLElement | null = null
let target: ((o: { target: { line: string | null; day: string | null } | null; reopened: boolean }) => void) | null = null
/** The main process says an opening of the panel: `reopened` – it was hidden (a new opening), else asked again while open. */
const opened = (reopened = true, t: { line: string | null; day: string | null } | null = null) => act(async () => target!({ target: t, reopened }))
let rd: {
  showMain: ReturnType<typeof vi.fn<RdApi['showMain']>>
  widgetAction: ReturnType<typeof vi.fn<RdApi['widgetAction']>>
  barAction: ReturnType<typeof vi.fn<RdApi['barAction']>>
  panelClose: ReturnType<typeof vi.fn<RdApi['panelClose']>>
  barClose: ReturnType<typeof vi.fn<RdApi['barClose']>>
  barLayout: ReturnType<typeof vi.fn<RdApi['barLayout']>>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T09:30:00Z'))
  target = null
  rd = {
    showMain: vi.fn<RdApi['showMain']>(),
    widgetAction: vi.fn<RdApi['widgetAction']>(() => Promise.resolve()),
    barAction: vi.fn<RdApi['barAction']>(() => Promise.resolve()),
    panelClose: vi.fn<RdApi['panelClose']>(),
    barClose: vi.fn<RdApi['barClose']>(),
    barLayout: vi.fn<RdApi['barLayout']>()
  }
  const api: Partial<RdApi> = {
    ...rd,
    quickToday: () => Promise.resolve({ today: '2026-11-21', nowMin: null }),
    onPanelTarget: (cb) => ((target = cb), () => undefined),
    panelTouch: () => undefined,
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
  act(() => useWidget.setState({ view: null }))
  useMachine.setState({ prefs: DEFAULT_MACHINE_PREFS })
  vi.useRealTimers()
  delete (window as unknown as { rd?: unknown }).rd
  if (!hadObserver) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

async function render(el: ReturnType<typeof createElement>): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  return host
}
const bar = (view: WidgetView, mode: BarMode) => render(createElement(Bar, { view, mode }))
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const html = (view: WidgetView, mode: BarMode) => renderToStaticMarkup(createElement(Bar, { view, mode }))
/** One click of a pair – Chromium's `detail` counts the clicks of one spot (1, then 2 within the double click's time). */
const click = (el: Element, detail = 1, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail, ...init })))
/** A release of the mouse button only (the desktop bar, T1500). */
const release = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, screenX: 200, screenY: 40, ...init })))
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)
const acts = () => rd.widgetAction.mock.calls.map(([a, arg]) => (arg == null ? a : `${a}|${arg}`))
/** „Prośba ▸” waits in „⋯” (D564 P17): „⋯”, then „Prośba ▸”. */
const openRequest = () => {
  click(q('bar-group-more')!)
  click(q('bar-group-request')!)
}

describe('„↗” paska pulpitu (P12, C2)', () => {
  it('stoi w pasie 24 px nad „×” – tylko na pasku pulpitu, z dniem i bez folderu', () => {
    for (const view of [dayView(), noFolderView()]) {
      const desktop = html(view, 'desktop')
      expect(desktop).toContain('data-testid="bar-corner"')
      expect(desktop.indexOf('data-testid="bar-open-main"')).toBeGreaterThan(desktop.indexOf('data-testid="bar-corner"'))
      expect(desktop.indexOf('data-testid="bar-open-main"')).toBeLessThan(desktop.indexOf('data-testid="bar-close"'))
      expect(desktop).toContain(`aria-label="${OPEN_MAIN_TEXT}"`)
      for (const mode of ['main', 'panel'] as const) expect(html(view, mode)).not.toContain('data-testid="bar-open-main"')
    }
  })

  it('jedno puszczenie otwiera okno główne – bez wciśnięcia i click (T1500); nie jest kliknięciem paska ani połową dwukliku', async () => {
    await bar(dayView(), 'desktop')
    const up = q('bar-open-main')!
    release(up, { button: 2 })
    expect(rd.showMain).not.toHaveBeenCalled()
    release(up)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
    expect(rd.widgetAction).not.toHaveBeenCalled()
    // The free spot right after it: a click of the bar, but no double click (its first half was on a control).
    later(100)
    release(q('bar-desktop')!.querySelector(':scope > div')!)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
    expect(acts()).toEqual(['barClick'])
  })
})

describe('„+ Skrzynka” (P15, C1)', () => {
  it('przycisk mówi „+ Skrzynka” w oknie, w panelu i na pasku pulpitu – z dniem i bez', () => {
    for (const view of [dayView(), noFolderView()])
      for (const mode of ['main', 'panel', 'desktop'] as const) expect(html(view, mode)).toMatch(/data-testid="bar-quick"[^>]*>\+ Skrzynka</)
  })

  it('na pasku pulpitu puszczenie prosi proces główny o okienko „Do skrzynki” – pole nie rozwija się w pasku', async () => {
    await bar(dayView(), 'desktop')
    release(q('bar-quick')!)
    expect(acts()).toEqual(['quickOpen'])
    expect(q('bar-quick-field')).toBeNull()
  })
})

describe('dwuklik w przycisk paska działa raz (C8)', () => {
  it('panel i okno: drugie kliknięcie dwukliku w „Dalej” – jedno „Dalej”', async () => {
    for (const mode of ['panel', 'main'] as const) {
      await bar(dayView(), mode)
      click(q('bar-next')!, 1)
      click(q('bar-next')!, 2)
      expect(acts(), mode).toEqual(['next'])
      act(() => root?.unmount())
      host?.remove()
      rd.widgetAction.mockClear()
    }
  })

  it('drugie kliknięcie trafia w inny przycisk, który stanął na miejscu pierwszego – nic', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-next')!, 1)
    click(q('bar-pause')!, 2)
    expect(acts()).toEqual(['next'])
  })

  it('„⋯” i „Prośba ▸” w nim dwuklikiem zostają rozwinięte (nie zwijają się drugim kliknięciem)', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-group-more')!, 1)
    click(q('bar-group-more')!, 2)
    expect(q('bar-unfold-more')).not.toBeNull()
    click(q('bar-group-request')!, 1)
    // The second click lands where „Prośba ▸” stood – on the unfolded group now: nothing.
    click(q('bar-request-group')!, 2)
    expect(q('bar-request-group')).not.toBeNull()
  })

  it('kliknięcia z klawiatury (detail 0) i dwa osobne kliknięcia działają każde', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-pause')!, 0)
    click(q('bar-pause')!, 0)
    click(q('bar-next')!, 1)
    click(q('bar-next')!, 1)
    expect(acts()).toEqual(['pause', 'pause', 'next', 'next'])
  })

  it('kroki ±5 min liczą każde kliknięcie, także szybkie', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-act-ended-endedAt')!, 1)
    const line = q('bar-line-ended:2026-11-21:b1')!
    const plus = [...line.querySelectorAll('button')].find((b) => b.textContent === '+5')!
    click(plus, 1)
    click(plus, 2)
    expect(line.querySelector('.num')!.textContent).toBe('10:10')
  })

  it('dwuklik w „Skończył się o…”: drugie kliknięcie trafia w −5, które stanęło na jego miejscu – nic (krok liczy tylko kliknięcia w siebie)', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-act-ended-endedAt')!, 1)
    const line = q('bar-line-ended:2026-11-21:b1')!
    const minus = [...line.querySelectorAll('button')].find((b) => b.textContent === '−5')!
    click(minus, 2)
    expect(line.querySelector('.num')!.textContent).toBe('10:00')
    click(minus, 3)
    expect(line.querySelector('.num')!.textContent).toBe('09:55')
  })

  it('pasek pulpitu: puszczenie na −5 tuż po „Skończył się o…” w tym samym miejscu – nic; dwa szybkie na +5 – dwa kroki', async () => {
    await bar(dayView(), 'desktop')
    release(q('bar-act-ended-endedAt')!)
    const line = q('bar-line-ended:2026-11-21:b1')!
    const step = (t: string) => [...line.querySelectorAll('button')].find((b) => b.textContent === t)!
    later(150)
    release(step('−5'))
    expect(line.querySelector('.num')!.textContent).toBe('10:00')
    later(BAR_DOUBLE_MS + 1)
    release(step('+5'))
    later(150)
    release(step('+5'))
    expect(line.querySelector('.num')!.textContent).toBe('10:10')
  })

  it('pasek pulpitu: dwa puszczenia w przycisk w czasie dwukliku i w jednym miejscu – jedno działanie; później albo dalej – dwa', async () => {
    await bar(dayView(), 'desktop')
    release(q('bar-next')!)
    later(200)
    release(q('bar-next')!, { screenX: 202, screenY: 38 })
    expect(acts()).toEqual(['next'])
    // Another button in the place of the first (the layout changed after „Dalej”): nothing either.
    later(BAR_DOUBLE_MS + 1)
    release(q('bar-next')!)
    later(150)
    release(q('bar-pause')!)
    expect(acts()).toEqual(['next', 'next'])
    later(BAR_DOUBLE_MS + 1)
    release(q('bar-pause')!)
    later(100)
    release(q('bar-pause')!, { screenX: 260 })
    expect(acts()).toEqual(['next', 'next', 'pause', 'pause'])
  })
})

describe('panel ikony – nagłówek i stopka (P13 wariant A, C1, C7)', () => {
  it('nagłówek „Regulated Day” z „×”, stopka z trzema przyciskami', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    expect(q('panel-head')!.textContent).toContain('Regulated Day')
    expect(q('panel-head')!.contains(q('panel-close'))).toBe(true)
    expect(q('panel-open-main')!.textContent).toBe(`↗ ${OPEN_MAIN_TEXT}`)
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: schowaj')
    expect(q('panel-quit')!.textContent).toBe(`⏻ ${QUIT_APP_TEXT}`)
    for (const id of ['panel-open-main', 'panel-bar-toggle', 'panel-quit']) expect(q('panel-foot')!.contains(q(id))).toBe(true)
  })

  it('stopka: okno główne, schowanie paska, wyjście – żadne nie jest kliknięciem w wolne pole', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    click(q('panel-bar-toggle')!)
    click(q('panel-quit')!)
    expect(rd.barAction.mock.calls).toEqual([['hideBar']])
    expect(rd.panelClose.mock.calls).toEqual([['quit']])
    expect(rd.showMain).not.toHaveBeenCalled()
    click(q('panel-open-main')!)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('według zamiaru, nie widoczności: włączony i bez „×” – „schowaj”, także przy pasku chwilowo ukrytym (pomocnik, „Odcinam się”)', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), barNote: 'Pasek pulpitu ukryty: pomocnik nie działa' } }))
    await render(createElement(PanelApp))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: schowaj')
    act(() => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    const button = q('panel-bar-toggle') as HTMLButtonElement
    expect([button.textContent, button.disabled]).toEqual(['▣ Pasek pulpitu: schowaj', false])
    click(button)
    expect(rd.barAction.mock.calls).toEqual([['hideBar']])
  })

  it('schowany „×” albo wyłączony w ustawieniach – „pokaż” (także przy „Odcinam się”)', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), barClosed: true } }))
    await render(createElement(PanelApp))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: pokaż')
    click(q('panel-bar-toggle')!)
    expect(rd.barAction.mock.calls).toEqual([['showBar']])
    act(() => useWidget.setState({ view: { ...dayView(), barClosed: true, hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: pokaż')
    act(() => useWidget.setState({ view: dayView() }))
    act(() => useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: false } }))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: pokaż')
    act(() => useMachine.setState({ prefs: DEFAULT_MACHINE_PREFS }))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: schowaj')
  })

  it('tytuł nagłówka, odstępy i „·” stopki to nie wolne pole – chybienie obok przycisku nie otwiera okna głównego', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    const at = (el: Element) =>
      act(() => {
        el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
      })
    for (const el of [q('panel-head')!.querySelector('span')!, q('panel-head')!, q('panel-foot')!, q('panel-foot')!.querySelector('span[aria-hidden]')!]) {
      at(el)
      click(el, 0)
    }
    expect(rd.showMain).not.toHaveBeenCalled()
    // The bar's own free text still opens it (D558).
    at(q('bar-block')!)
    click(q('bar-block')!, 0)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('drugie kliknięcie dwukliku na przycisku, który zniknął po pierwszym, trafia w wolne pole – okno główne się nie otwiera', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    const button = q('bar-act-ended-endedAt')!
    const free = q('bar-block')!
    act(() => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }))
      // The button went away after its first click: the second press, release and click are on free text.
      free.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      free.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }))
      free.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    })
    click(free, 2)
    expect(rd.showMain).not.toHaveBeenCalled()
    // A double click that began on free text too still opens it (D559).
    act(() => void free.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 })))
    act(() => void free.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 })))
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('dwuklik w „Pasek pulpitu: schowaj” – jedno schowanie (drugie kliknięcie nie pokazuje go znowu)', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    click(q('panel-bar-toggle')!, 1)
    click(q('panel-bar-toggle')!, 2)
    expect(rd.barAction.mock.calls).toEqual([['hideBar']])
  })

  it('stopka i nagłówek także przy widgecie ukrytym („Odcinam się”)', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00' } }))
    await render(createElement(PanelApp))
    for (const id of ['panel-head', 'panel-close', 'panel-open-main', 'panel-bar-toggle', 'panel-quit']) expect(q(id), id).not.toBeNull()
  })
})

describe('pasek schowany „×” – linia „Pasek pulpitu schowany · Pokaż pasek” w panelu (D564 P16, C3)', () => {
  it('w panelu – z dniem i bez folderu; „Pokaż pasek” jednym kliknięciem pokazuje pasek (dwuklik – raz)', async () => {
    for (const view of [{ ...dayView(), barClosed: true }, { ...noFolderView(), barClosed: true }]) {
      act(() => useWidget.setState({ view }))
      await render(createElement(PanelApp))
      expect(q('bar-closed')!.textContent).toBe('Pasek pulpitu schowanyPokaż pasek')
      click(q('bar-closed-show')!, 1)
      click(q('bar-closed-show')!, 2)
      expect(rd.barAction.mock.calls).toEqual([['showBar']])
      // A button of the line, not a free spot of the panel.
      expect(rd.showMain).not.toHaveBeenCalled()
      act(() => root?.unmount())
      host?.remove()
      rd.barAction.mockClear()
    }
  })

  it('tylko w panelu: okno główne i pasek pulpitu jej nie mają; bez „×” jej nie ma', () => {
    const closed = { ...dayView(), barClosed: true }
    expect(html(closed, 'panel')).toContain('data-testid="bar-closed"')
    expect(html(closed, 'main')).not.toContain('data-testid="bar-closed"')
    expect(html(closed, 'desktop')).not.toContain('data-testid="bar-closed"')
    expect(html(dayView(), 'panel')).not.toContain('data-testid="bar-closed"')
  })

  it('także przy widgecie ukrytym („Odcinam się”) – w panelu, pod linią stanu, z „Pokaż po „Wracam”” (pasek wróci dopiero po nim); okno główne i tu jej nie ma', async () => {
    const view = { ...dayView(), barClosed: true, hidden: true, stateLine: 'Odcinam się od 10:00' }
    expect(html(view, 'main')).not.toContain('data-testid="bar-closed"')
    act(() => useWidget.setState({ view }))
    await render(createElement(PanelApp))
    expect(q('bar-state')!.textContent).toBe('Odcinam się od 10:00')
    expect(q('bar-closed')!.textContent).toBe('Pasek pulpitu schowanyPokaż po „Wracam”')
    click(q('bar-closed-show')!)
    expect(rd.barAction.mock.calls).toEqual([['showBar']])
    expect(rd.showMain).not.toHaveBeenCalled()
  })

  it('komunikat „ukryty” (pomocnik, nieudane położenie) zostaje jak był – z „Pokaż pasek”, który kładzie pasek ponownie', async () => {
    const view = { ...dayView(), barNote: 'Pasek pulpitu ukryty: pomocnik nie działa' }
    expect(html(view, 'panel')).not.toContain('data-testid="bar-closed"')
    await bar(view, 'panel')
    expect(q('bar-note')!.textContent).toBe('Pasek pulpitu ukryty: pomocnik nie działaPokaż pasek')
    click(q('bar-note')!.querySelector('button')!)
    expect(rd.barAction.mock.calls).toEqual([['placeBar']])
  })
})

describe('panel otwarty ponownie – nic rozwiniętego sprzed schowania (C8)', () => {
  it('„Prośba ▸”, „⋯”, pole „+ Skrzynka” i ±5 min „Skończył się o…” zwijają się przy otwarciu', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    await opened()
    for (const [open, shown] of [
      [openRequest, 'bar-request-group'],
      [() => click(q('bar-group-more')!), 'bar-unfold-more'],
      [() => click(q('bar-quick')!), 'bar-quick-field']
    ] as const) {
      open()
      expect(q(shown), shown).not.toBeNull()
      // Hidden and opened again (the main process says the target of each opening).
      await opened()
      expect(q(shown), shown).toBeNull()
    }
    click(q('bar-act-ended-endedAt')!)
    expect(q('bar-line-ended:2026-11-21:b1')!.getAttribute('data-busy')).toBe('on')
    await opened(true, { line: null, day: null })
    expect(q('bar-line-ended:2026-11-21:b1')!.getAttribute('data-busy')).toBeNull()
    // Folded: a click on a free spot opens the main window again (D558).
    act(() => {
      q('panel')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      q('panel')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    })
    click(q('panel')!, 0)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('otwarty i poproszony jeszcze raz (kliknięcie powiadomienia) – nic się nie zwija, wpisany tekst zostaje; linia powiadomienia oznaczona', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    await opened()
    openRequest()
    await opened(false, { line: 'ended:2026-11-21:b1', day: '2026-11-21' })
    expect(q('bar-request-group')).not.toBeNull()
    expect(q('panel-target')!.textContent).toContain('Blok skończył się?')
    click(q('bar-quick')!)
    const field = host!.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Kupić mleko')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await opened(false)
    expect(host!.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')?.value).toBe('Kupić mleko')
  })

  const open = [{ id: 'keep', label: 'Zostaw plan' }]

  it('panel wariantów otwarty przez panel ikony – nowe otwarcie go zamyka; poproszony przy otwartym – zostaje', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), variants: { marker: true, open, by: 'panel' } } }))
    await render(createElement(PanelApp))
    await opened(false)
    expect(acts()).toEqual([])
    await opened()
    expect(acts()).toEqual(['variants|close'])
    // Closed already: a new opening asks nothing.
    act(() => useWidget.setState({ view: dayView() }))
    await opened()
    expect(acts()).toEqual(['variants|close'])
  })

  it('nowe otwarcie przy wariantach otwartych w oknie głównym – strona mówi panelowi, że jest rozwinięty (60 s go nie zamyka)', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), variants: { marker: true, open, by: 'main' } } }))
    await render(createElement(PanelApp))
    await opened()
    rd.barLayout.mockClear()
    // The main process takes every new opening for folded – the page says how it is now.
    await opened()
    expect(rd.barLayout.mock.calls.at(-1)?.[0]).toMatchObject({ unfolded: true })
    expect(acts()).toEqual([])
  })

  it('kliknięte w panelu, ale odmówione („Plan się mieści”), potem otwarte w oknie głównym – otwarcie panelu ikony ich nie zamyka', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), variants: { marker: true, open: null } } }))
    await render(createElement(PanelApp))
    await opened()
    click(q('bar-variants')!)
    // The main process refused (no panel): the view stays without one; later the main window opens them.
    act(() => useWidget.setState({ view: { ...dayView(), note: { text: 'Plan się mieści – nie ma czego przestawiać.', left: 6_000 }, variants: { marker: true, open: null } } }))
    act(() => useWidget.setState({ view: { ...dayView(), variants: { marker: true, open, by: 'main' } } }))
    await opened()
    await opened()
    expect(acts()).toEqual(['variants|open'])
  })

  it('„Odcinam się” chowa warianty otwarte przez panel (zostają w procesie głównym) – nowe otwarcie i tak je zamyka, nie wracają po „Wracam”', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), variants: { marker: true, open, by: 'panel' } } }))
    await render(createElement(PanelApp))
    await opened()
    expect(acts()).toEqual(['variants|close'])
    rd.widgetAction.mockClear()
    // Hidden by the rule: the view shows none, the main process still holds them (by the panel).
    act(() => useWidget.setState({ view: { ...dayView(), hidden: true, stateLine: 'Odcinam się od 10:00', variants: { marker: false, open: null, by: 'panel' } } }))
    await opened()
    expect(acts()).toEqual(['variants|close'])
  })

  it('pasek, który nie jest w panelu, nie zwija się bez otwarcia (zmiana widoku nic nie zwija)', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    openRequest()
    act(() => useWidget.setState({ view: { ...dayView(), tooltip: 'nowy widok' } }))
    expect(q('bar-request-group')).not.toBeNull()
  })
})
