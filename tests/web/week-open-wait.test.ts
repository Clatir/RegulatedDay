// @vitest-environment jsdom
/**
 * N9 (T2555): in the columns of „Tydzień” and „3 dni” a click on a block's name waits 300 ms for a second click before its day opens (a double
 * click renames). The wait is the grid's ONE: it ends – and the day never opens after it – at any press or click on any tile (a Ctrl / Shift click or
 * a drag of another block too), at F2 and Esc, when the week or the view changes and when the grid goes away; the tile whose opening waits has
 * `data-open-wait`. A click on the name left alone still opens the day after the wait.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { WEEK_PPM } from '@renderer/features/week/weekLayout'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

vi.mock('@renderer/features/week/weekMove', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekMove')>()), moveWeekBlock: vi.fn(), copyDayBlock: vi.fn() }))

const TODAY = '2026-11-18'
const NEXT_WEEK = '2026-11-25'
const named = (name: string) => ({ categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null, name })
const block = (id: string, startMin: number, name: string): HorizonBlock => ({ id, named: named(name), categoryId: 'inne', startMin, endMin: startMin + 60, state: 'planned', outsidePlan: false, background: false, movable: true })
const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({
  date,
  when: date === TODAY ? 'today' : 'future',
  read: 'full',
  dayType: null,
  templateId: null,
  frozen: false,
  blocks,
  wakeMin: null,
  bedtimeMin: null,
  boundary: null,
  extensionMin: 0,
  regen: null,
  studyMin: 0,
  sessions: { clean: 0, extended: 0, outsidePlan: 0 },
  energy: null,
  budget: null
})
const week = (date: string): HorizonDay[] => [day(date, [block('a', 540, 'Analiza'), block('b', 720, 'Beta')])]
const grid = (list: HorizonDay[], mode: 'week' | '3days' = 'week') => createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: WEEK_PPM, mode, openCard: null, onCardOpened: () => undefined })

let root: Root | null = null
let host: HTMLElement | null = null
let offs: Array<() => void> = []
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers()
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [] })
  Element.prototype.scrollIntoView = () => undefined
  for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
})
afterEach(() => {
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const off of offs) off()
  offs = []
  useData.setState({ view: null })
  useUi.setState({ page: 'week', day: null, pick: null })
  vi.useRealTimers()
})

const mount = (list: HorizonDay[] = week(TODAY)) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(grid(list)))
}
const q = (id: string) => host?.querySelector<HTMLElement>(`[data-testid="${id}"]`) ?? null
const tile = (id: string, date = TODAY) => q(`week-block-${date}-${id}`)!
const nameOf = (id: string) => tile(id).querySelector<HTMLElement>('[data-tile-name]')!
const click = (el: Element, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init })))
const pointer = (el: Element, type: string, y: number, buttons = 1) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0, buttons })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void el.dispatchEvent(e))
}
const key = (k: string) => act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** How many times a day was opened from now on (a pick of a block set). */
const opened = () => {
  let n = 0
  offs.push(useUi.subscribe((st, prev) => void (st.pick && st.pick !== prev.pick && n++)))
  return () => n
}

describe('czekanie na drugi klik w nazwę – jedno na siatkę (T2555)', () => {
  it('klik w nazwę, po nim samotny klik w nazwie: dzień otwiera się raz po 300 ms; kafelek, którego otwarcie czeka, ma `data-open-wait`', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    expect(tile('a').getAttribute('data-open-wait')).toBe('true')
    expect(tile('b').getAttribute('data-open-wait')).toBeNull()
    advance(299)
    expect(count()).toBe(0)
    advance(1)
    expect(count()).toBe(1)
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'a' })
    expect(tile('a').getAttribute('data-open-wait')).toBeNull()
  })

  it('klik w nazwę A, w czasie oczekiwania Ctrl+klik B: B zaznaczony, dzień A nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    click(tile('b'), { ctrlKey: true })
    expect(tile('b').getAttribute('data-marked')).toBe('true')
    expect(tile('a').getAttribute('data-open-wait')).toBeNull()
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, potem Shift+klik B – to samo', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    click(tile('b'), { shiftKey: true })
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, potem wciśnięcie i przeciągnięcie B: dzień A nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    pointer(tile('b'), 'pointerdown', 300)
    pointer(tile('b'), 'pointermove', 340)
    pointer(tile('b'), 'pointerup', 340, 0)
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, potem F2 albo Esc: dzień nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    key('F2')
    advance(1000)
    expect(count()).toBe(0)
    click(nameOf('a'))
    key('Escape')
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę, potem zmiana tygodnia (albo widoku) w trakcie: dzień nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    act(() => root!.render(grid(week(NEXT_WEEK))))
    advance(1000)
    expect(count()).toBe(0)
    click(q(`week-block-${NEXT_WEEK}-a`)!.querySelector('[data-tile-name]')!)
    act(() => root!.render(grid(week(NEXT_WEEK), '3days')))
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę, potem zniknięcie siatki: dzień nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    act(() => root!.unmount())
    root = null
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, w czasie oczekiwania A znika z danych (Cofnij, zmiana z zewnątrz): dzień nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    expect(tile('a').getAttribute('data-open-wait')).toBe('true')
    act(() => root!.render(grid([day(TODAY, [block('b', 720, 'Beta')])])))
    expect(q(`week-block-${TODAY}-a`)).toBeNull()
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, potem wciśnięcie na pustym miejscu kolumny albo poza siatką: dzień nie otwiera się potem', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    pointer(q(`week-col-${TODAY}`)!, 'pointerdown', 900)
    advance(1000)
    expect(count()).toBe(0)
    click(nameOf('a'))
    const outside = document.createElement('div')
    document.body.append(outside)
    offs.push(() => outside.remove())
    pointer(outside, 'pointerdown', 10)
    advance(1000)
    expect(count()).toBe(0)
  })

  it('pełny pojedynczy klik (wciśnięcie, puszczenie, klik) w nazwę: wciśnięcie pierwszego kliku nie kasuje jego oczekiwania – dzień otwiera się po 300 ms', () => {
    mount()
    const count = opened()
    pointer(nameOf('a'), 'pointerdown', 300)
    pointer(nameOf('a'), 'pointerup', 300, 0)
    click(nameOf('a'))
    expect(tile('a').getAttribute('data-open-wait')).toBe('true')
    advance(300)
    expect(count()).toBe(1)
  })

  it('pełny dwuklik w nazwę (dwa wciśnięcia, dwa kliki, dblclick): pole nazwy się otwiera, dzień się nie otwiera', () => {
    mount()
    const count = opened()
    pointer(nameOf('a'), 'pointerdown', 300)
    pointer(nameOf('a'), 'pointerup', 300, 0)
    click(nameOf('a'))
    pointer(nameOf('a'), 'pointerdown', 300)
    pointer(nameOf('a'), 'pointerup', 300, 0)
    click(nameOf('a'), { detail: 2 })
    act(() => void nameOf('a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })))
    expect(q('tile-name')).not.toBeNull()
    advance(1000)
    expect(count()).toBe(0)
  })

  it('klik w nazwę A, w czasie oczekiwania zwykły klik w nazwę B: otwiera się dzień B, nie A (jedno oczekiwanie)', () => {
    mount()
    const count = opened()
    click(nameOf('a'))
    click(nameOf('b'))
    expect(tile('a').getAttribute('data-open-wait')).toBeNull()
    expect(tile('b').getAttribute('data-open-wait')).toBe('true')
    advance(1000)
    expect(count()).toBe(1)
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'b' })
  })
})
