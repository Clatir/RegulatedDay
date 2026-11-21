// @vitest-environment jsdom
/**
 * The axis of „Dziś” put at its hour when the page opens (D563, P6; `useAxisOpening`): „teraz” a third of the way down, never past a card that asks
 * you something – also one that comes late; put for the day chosen, not again when only today turns over; followed while the content over it changes,
 * until the ritual's scroll or your first action ends it. Positions are given to the stubbed `getBoundingClientRect` by `data-top`.
 */
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAxisOpening, type PlacedDay } from '@renderer/features/today/axisOpening'

type Observer = { cb: () => void; disconnected: boolean }
const observers: Observer[] = []
class FakeObserver {
  rec: Observer
  constructor(cb: () => void) {
    this.rec = { cb, disconnected: false }
    observers.push(this.rec)
  }
  observe(): void {}
  disconnect(): void {
    this.rec.disconnected = true
  }
}

let writes: number[] = []
let root: Root | null = null
let host: HTMLElement | null = null
let stopRitual: (() => void) | null = null

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  writes = []
  observers.length = 0
  vi.stubGlobal('ResizeObserver', FakeObserver)
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', { get: () => 0, set: (v: number) => void writes.push(v), configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 600, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = Number((this as HTMLElement).dataset?.top ?? 0)
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
  })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  stopRitual = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
})

function Harness({ chosen, placed, card }: { chosen: string | null; placed: PlacedDay; card: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  stopRitual = useAxisOpening(ref, chosen, placed)
  return createElement(
    'div',
    { ref, 'data-testid': 'box' },
    createElement(
      'div',
      null,
      card ? createElement('section', { 'data-prompt-card': 'true', 'data-top': 120 }) : null,
      createElement('div', { 'data-testid': 'timeline-axis', 'data-top': 200 }),
      createElement('div', { 'data-testid': 'marker-teraz', 'data-top': 1500 })
    )
  )
}

async function render(chosen: string | null, placed: PlacedDay, card = false): Promise<void> {
  if (!host) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(createElement(Harness, { chosen, placed, card })))
}
const fresh = (): PlacedDay => ({ current: undefined })

describe('oś „Dziś” po otwarciu (D563, P6)', () => {
  it('„teraz” na 1/3 widocznej wysokości', async () => {
    await render(null, fresh())
    expect(writes).toEqual([1300])
  })

  it('nie wychodzi ponad górę karty-prośby', async () => {
    await render(null, fresh(), true)
    expect(writes).toEqual([120])
  })

  it('karta-prośba, która przyjdzie później (zmiana rozmiaru treści), przycina przewinięcie, póki nic nie zrobiłeś', async () => {
    const placed = fresh()
    await render(null, placed)
    expect(writes).toEqual([1300])
    await render(null, placed, true)
    // The same mounted view: the card is in the DOM now and the content changed its size.
    await act(async () => observers.at(-1)!.cb())
    expect(writes.at(-1)).toBe(120)
  })

  it('tylko zmiana doby logicznej (ten sam wybrany dzień) nie przewija od nowa; inny wybrany dzień – tak', async () => {
    const placed = fresh()
    await render(null, placed)
    expect(writes).toEqual([1300])
    // DayView is mounted anew with the turn of the day (and „Liczę dzień…” between): the same chosen day, the same `placed`.
    act(() => root!.unmount())
    host!.remove()
    host = null
    await render(null, placed)
    expect(writes).toEqual([1300])
    await render('2026-11-19', placed)
    expect(writes).toEqual([1300, 1300])
  })

  it('koniec śledzenia (przewinięcie rytuału): zmiana rozmiaru nie cofa jego przewinięcia', async () => {
    await render(null, fresh())
    const n = writes.length
    stopRitual!()
    expect(observers.at(-1)!.disconnected).toBe(true)
    await act(async () => observers.at(-1)!.cb())
    expect(writes).toHaveLength(n)
  })

  it('klik poza przewijanym pudłem (panel bloku, nagłówek, menu) kończy śledzenie', async () => {
    await render(null, fresh())
    const n = writes.length
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(observers.at(-1)!.disconnected).toBe(true)
    await act(async () => observers.at(-1)!.cb())
    expect(writes).toHaveLength(n)
  })
})
