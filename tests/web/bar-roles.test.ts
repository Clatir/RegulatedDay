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
let target: ((t: { line: string | null; day: string | null } | null) => void) | null = null
let rd: {
  showMain: ReturnType<typeof vi.fn<RdApi['showMain']>>
  widgetAction: ReturnType<typeof vi.fn<RdApi['widgetAction']>>
  barAction: ReturnType<typeof vi.fn<RdApi['barAction']>>
  panelClose: ReturnType<typeof vi.fn<RdApi['panelClose']>>
  barClose: ReturnType<typeof vi.fn<RdApi['barClose']>>
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
    barClose: vi.fn<RdApi['barClose']>()
  }
  const api: Partial<RdApi> = {
    ...rd,
    quickToday: () => Promise.resolve('2026-11-21'),
    onPanelTarget: (cb) => ((target = cb), () => undefined),
    panelTouch: () => undefined,
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

  it('„Prośba ▸” dwuklikiem zostaje rozwinięta (nie zwija się drugim kliknięciem)', async () => {
    await bar(dayView(), 'panel')
    click(q('bar-group-request')!, 1)
    click(q('bar-group-request')!, 2)
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

  it('pasek schowany „×” albo wyłączony w ustawieniach – „Pasek pulpitu: pokaż”', async () => {
    act(() => useWidget.setState({ view: { ...dayView(), barClosed: true } }))
    await render(createElement(PanelApp))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: pokaż')
    click(q('panel-bar-toggle')!)
    expect(rd.barAction.mock.calls).toEqual([['showBar']])
    act(() => useWidget.setState({ view: dayView() }))
    act(() => useMachine.setState({ prefs: { ...DEFAULT_MACHINE_PREFS, desktopBar: false } }))
    expect(q('panel-bar-toggle')!.textContent).toBe('▣ Pasek pulpitu: pokaż')
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

describe('panel otwarty ponownie – nic rozwiniętego sprzed schowania (C8)', () => {
  it('„Prośba ▸”, „⋯”, pole „+ Skrzynka” i ±5 min „Skończył się o…” zwijają się przy otwarciu', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    await act(async () => target!(null))
    for (const [open, shown] of [
      ['bar-group-request', 'bar-request-group'],
      ['bar-group-more', 'bar-unfold-more'],
      ['bar-quick', 'bar-quick-field']
    ] as const) {
      click(q(open)!)
      expect(q(shown), open).not.toBeNull()
      // Hidden and opened again (the main process says the target of each opening).
      await act(async () => target!(null))
      expect(q(shown), open).toBeNull()
    }
    click(q('bar-act-ended-endedAt')!)
    expect(q('bar-line-ended:2026-11-21:b1')!.getAttribute('data-busy')).toBe('on')
    await act(async () => target!({ line: null, day: null }))
    expect(q('bar-line-ended:2026-11-21:b1')!.getAttribute('data-busy')).toBeNull()
    // Folded: a click on a free spot opens the main window again (D558).
    act(() => {
      q('panel')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      q('panel')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    })
    click(q('panel')!, 0)
    expect(rd.showMain).toHaveBeenCalledTimes(1)
  })

  it('pasek, który nie jest w panelu, nie zwija się bez otwarcia (zmiana widoku nic nie zwija)', async () => {
    act(() => useWidget.setState({ view: dayView() }))
    await render(createElement(PanelApp))
    click(q('bar-group-request')!)
    act(() => useWidget.setState({ view: { ...dayView(), tooltip: 'nowy widok' } }))
    expect(q('bar-request-group')).not.toBeNull()
  })
})
