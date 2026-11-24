// @vitest-environment jsdom
/**
 * The row of the bar's buttons (UX12, D564 P17–P20, C4–C7, B7): a block of work has „Dalej: <nazwa>”, Pauza, Przedłuż, Koniec
 * pracy, „+ Skrzynka” and „⋯” – Odcinam się, „Prośba ▸” and „Sygnały ▸” wait in „⋯” (in the night's quiet, without „⋯”, „Prośba ▸”
 * stands in the row); under „Dalej?” the row never repeats its answers; a cost waiting for its second click has „Anuluj”; the
 * handle ⠿ is always seen, dimmed; the desktop bar's „×” draws its hint (Shift+×) in the bar; a running request says
 * „Prośba: <osoba>”; the main process's line „<akcja> · Cofnij” answers with `line`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RdApi } from '@shared/api'
import { Bar, CLOSE_HINT_TEXT, type BarMode } from '@renderer/widget/Bar'
import { ALL_BUTTONS, noFolderView, type BarLine, type WidgetView } from '@shared/widget'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/** A block of work in front (Dalej begins „Nauka”), the energy on (signals), no line. */
const work = (over: Partial<WidgetView> = {}): WidgetView => ({
  ...noFolderView(),
  day: '2026-11-21',
  block: { name: 'Pisanie', className: 'praca', endsAt: Date.UTC(2026, 10, 21, 11, 0) },
  buttons: { ...ALL_BUTTONS, nextName: 'Nauka' },
  signals: true,
  requests: { people: [{ id: 'mama', name: 'Mama' }], running: null, interrupted: null },
  lines: [],
  ...over
})

let root: Root | null = null
let host: HTMLElement | null = null
let widgetAction: ReturnType<typeof vi.fn<RdApi['widgetAction']>>
const hadObserver = 'ResizeObserver' in globalThis

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T10:30:00Z'))
  widgetAction = vi.fn<RdApi['widgetAction']>(() => Promise.resolve())
  const api: Partial<RdApi> = { widgetAction, showMain: vi.fn(), barAction: vi.fn(() => Promise.resolve()), barClose: vi.fn(), barLayout: vi.fn(), panelTouch: () => undefined, barDrag: () => undefined, onBarDragOver: () => () => undefined, quickToday: () => Promise.resolve({ today: '2026-11-21', nowMin: null }) }
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

async function bar(view: WidgetView, mode: BarMode = 'panel'): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Bar, { view, mode })))
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 })))
const rowIds = () => [...q('bar-buttons')!.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'))
const acts = () => widgetAction.mock.calls.map(([a, arg]) => (arg == null ? a : `${a}|${arg}`))

describe('wiersz bloku pracy (D564 P17, C4)', () => {
  it('Dalej: <nazwa>, Pauza, Przedłuż, Koniec pracy, „+ Skrzynka”, „⋯” – rzadsze akcje w „⋯”', async () => {
    for (const mode of ['main', 'panel', 'desktop'] as const) {
      await bar(work(), mode)
      expect(rowIds(), mode).toEqual(['bar-next', 'bar-pause', 'bar-extend', 'bar-end-work', 'bar-quick', 'bar-group-more'])
      expect(q('bar-next')!.textContent).toBe('Dalej: Nauka')
      act(() => root?.unmount())
      host?.remove()
    }
    await bar(work())
    click(q('bar-group-more')!)
    expect([...q('bar-more-actions')!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Odcinam się', 'Prośba ▸', 'Sygnały ▸'])
    // „Prośba ▸” unfolds in place of „⋯”, which stays pressed – its click folds it.
    click(q('bar-group-request')!)
    expect(q('bar-request-group')).not.toBeNull()
    expect(q('bar-unfold-more')).toBeNull()
    expect(q('bar-group-more')!.getAttribute('aria-pressed')).toBe('true')
    click(q('bar-group-more')!)
    expect(q('bar-request-group')).toBeNull()
    click(q('bar-group-more')!)
    click(q('bar-cut-off')!)
    expect(acts()).toEqual(['cutOff'])
  })

  it('„Dalej” bez następnego bloku to samo „Dalej”; nazwa skraca się, przycisk zajmuje resztę wiersza (jeden wiersz przy 100 %)', async () => {
    await bar(work({ buttons: { ...ALL_BUTTONS, nextName: null } }))
    expect(q('bar-next')!.textContent).toBe('Dalej')
    act(() => root?.unmount())
    host?.remove()
    await bar(work({ buttons: { ...ALL_BUTTONS, nextName: 'Bardzo długa nazwa bloku, który zacznie się po tym' } }), 'desktop')
    const next = q('bar-next')!
    expect(next.className).toContain('min-w-[4.5rem]')
    expect(next.className).not.toContain('shrink-0')
    expect(next.querySelector('span')!.className).toContain('truncate')
    expect(q('bar-pause')!.className).toContain('shrink-0')
  })

  it('w ciszy nocnej (bez „⋯”) „Prośba ▸” stoi w wierszu (D346)', async () => {
    await bar(work({ night: true, buttons: { ...ALL_BUTTONS, pause: false, cutOff: false, nextName: null } }))
    expect(rowIds()).toEqual(['bar-next', 'bar-extend', 'bar-end-work', 'bar-group-request', 'bar-quick'])
  })

  it('uchwyt ⠿ stale widoczny, przygaszony (P17)', async () => {
    await bar(work(), 'desktop')
    const grip = q('bar-drag')!
    expect(grip.className).toContain('opacity-40')
    expect(grip.className).not.toContain('opacity-0')
  })
})

describe('„Dalej?” bez dubli w wierszu (C5)', () => {
  const question = (withWorkEnd: boolean): BarLine => ({
    id: 'next:2026-11-21:a:0',
    text: 'Dalej?',
    dot: true,
    actions: [{ id: 'next', label: 'Dalej: Nauka' }, { id: 'extend', label: 'Przedłuż' }, ...(withWorkEnd ? [{ id: 'workEnd', label: 'Koniec pracy' }] : [])]
  })

  it('odpowiedzi pytania nie stoją drugi raz w wierszu; „Koniec pracy” zostaje, gdy pytanie go nie ma', async () => {
    await bar(work({ question: question(true) }))
    expect(rowIds()).toEqual(['bar-pause', 'bar-quick', 'bar-group-more'])
    expect(q('bar-q-next')!.textContent).toBe('Dalej: Nauka')
    act(() => root?.unmount())
    host?.remove()
    await bar(work({ question: question(false) }))
    expect(rowIds()).toEqual(['bar-pause', 'bar-end-work', 'bar-quick', 'bar-group-more'])
  })

  it('długa nazwa w „Dalej: <nazwa>” pytania się tnie – „Przedłuż” i „Koniec pracy” zostają w pasku (pytanie może się zwęzić)', async () => {
    const long: BarLine = { ...question(true), actions: [{ id: 'next', label: 'Dalej: Przegląd tygodnia i planowanie kolejnych dni' }, { id: 'extend', label: 'Przedłuż' }, { id: 'workEnd', label: 'Koniec pracy' }] }
    await bar(work({ question: long }), 'desktop')
    const box = q('bar-question')!
    expect(box.className).toContain('min-w-0')
    expect(box.className).not.toContain('shrink-0')
    const next = q('bar-q-next')!
    expect(next.className).toContain('min-w-[4.5rem]')
    expect(next.querySelector('span')!.className).toContain('truncate')
    expect(q('bar-q-workEnd')!.className).toContain('shrink-0')
  })

  it('koszt „Przedłuż” z pytania stoi w wierszu w miejscu przycisku, z ±15 i „Anuluj”', async () => {
    await bar(work({ question: question(true), pending: { button: 'extend', text: 'Przedłuż +15 · −15 min puli', left: 9_000, steps: true } }))
    expect(q('bar-extend-confirm')!.textContent).toBe('Przedłuż +15 · −15 min puli · Potwierdź')
    expect(q('bar-pending')).toBeNull()
    click(q('bar-extend-cancel')!)
    expect(acts()).toEqual(['cancelPending'])
  })
})

describe('koszt z „Potwierdź · Anuluj” (C6)', () => {
  it('w miejscu przycisku „Start” i w wierszu pod przyciskami – „Anuluj” wysyła cancelPending', async () => {
    await bar(work({ block: null, buttons: { ...ALL_BUTTONS, next: false, pause: false, extend: false, start: 'Start: Nauka' }, pending: { button: 'start', text: 'Start: przedłużenie · −31 min puli', left: 9_000 } }))
    expect(q('bar-start-confirm')).not.toBeNull()
    click(q('bar-start-cancel')!)
    act(() => root?.unmount())
    host?.remove()
    await bar(work({ pending: { button: 'line:anchor:x|start', text: 'Zacznij: przedłużenie · −10 min puli', left: 9_000 } }))
    expect([...q('bar-pending')!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Potwierdź', 'Anuluj'])
    click(q('bar-cancel')!)
    expect(acts()).toEqual(['cancelPending', 'cancelPending'])
  })
})

describe('podpowiedź Shift+× w pasku (C6)', () => {
  it('kursor nad „×” rysuje podpowiedź w samym pasku (bez okna i bez zmiany wysokości); zjechanie ją chowa', async () => {
    await bar(work(), 'desktop')
    expect(q('bar-close-hint')).toBeNull()
    act(() => void q('bar-close')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    const hint = q('bar-close-hint')!
    expect(hint.textContent).toBe(CLOSE_HINT_TEXT)
    expect(hint.className).toContain('absolute')
    expect(hint.className).toContain('pointer-events-none')
    act(() => void q('bar-close')!.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })))
    expect(q('bar-close-hint')).toBeNull()
  })

  it('podpowiedź znika po puszczeniu „×”, przerwaniu wskaźnika i utracie fokusu okna (nie zostaje po schowaniu paska)', async () => {
    await bar(work(), 'desktop')
    const over = () => act(() => void q('bar-close')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    for (const end of [
      () => q('bar-close')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })),
      () => q('bar-close')!.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })),
      () => window.dispatchEvent(new Event('blur')),
      // The bar hidden (its „×”, a rule): it has no focus to lose – the page's visibility says it.
      () => document.dispatchEvent(new Event('visibilitychange'))
    ]) {
      over()
      expect(q('bar-close-hint')).not.toBeNull()
      act(() => void end())
      expect(q('bar-close-hint')).toBeNull()
    }
  })
})

describe('trwająca prośba i linia „<akcja> · Cofnij” (P20, P18)', () => {
  it('„Prośba: Mama · 0:04 · Koniec” zamiast „Zrobione teraz”; „Pilne” bez zmian', async () => {
    const from = Date.now() - 4 * 60_000
    await bar(work({ block: null, requests: { people: [], running: { id: 'r1', day: '2026-11-21', mode: 'now', person: 'Mama', from, estimateMin: null }, interrupted: null } }))
    expect(q('bar-request')!.textContent).toBe('Prośba: Mama · 0:04Koniec')
    act(() => root?.unmount())
    host?.remove()
    await bar(work({ block: null, requests: { people: [], running: { id: 'r1', day: '2026-11-21', mode: 'urgent', person: 'Mama', from, estimateMin: 30 }, interrupted: null } }))
    expect(q('bar-request')!.textContent).toBe('Pilne · Mama · 0:04 z 30 minKoniec')
  })

  it('„Cofnij” linii po kliknięciu idzie do procesu głównego jako odpowiedź linii', async () => {
    await bar(work({ lines: [{ id: 'clickUndo:next:1', text: 'Skończono: Pisanie, zaczęto: Nauka', actions: [{ id: 'undo', label: 'Cofnij' }], dot: false }] }))
    expect(q('bar-line-clickUndo:next:1')!.textContent).toBe('Skończono: Pisanie, zaczęto: NaukaCofnij')
    click(q('bar-act-clickUndo-undo')!)
    expect(acts()).toEqual(['line|clickUndo:next:1|undo'])
  })
})
