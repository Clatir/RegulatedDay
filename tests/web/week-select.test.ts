// @vitest-environment jsdom
/**
 * Selecting many blocks in the columns of „Tydzień” and „3 dni” (D527, D528): Ctrl+click selects a block without opening its day (a plain click
 * still opens it), Shift+click the range in the order of time through the days (the day, then the start), Shift+arrows, Ctrl+A for the whole view,
 * Esc; the ring of every selected block, the line over the columns, the menu of the right button „Zmień N bloków” (its picks go to `runBlockGroup`
 * with the keys `date|id`), Del for two or more; the drag of a block (a move, a copy with Ctrl) is as it was.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, weekDates, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { groupCount } from '@shared/groupText'
import { rdFrom } from '@shared/model/rd'
import { weekStart } from '@shared/time/day'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { installDeleteKey } from '@renderer/lib/deleteKey'
import { installEscape } from '@renderer/lib/escape'
import { parseBlockKey, type GroupAction } from '@renderer/features/plan/groupMenu'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { useData } from '@renderer/store/data'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { useUi } from '@renderer/store/ui'

// The change of a pick: caught (the screens call `runBlockGroup` of `groupRun.ts`).
const { runs } = vi.hoisted(() => ({ runs: [] as Array<{ view: string; ids: readonly string[]; action: unknown }> }))
vi.mock('@renderer/features/plan/groupRun', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/plan/groupRun')>()),
  runBlockGroup: vi.fn(async (view: string, ids: readonly string[], action: unknown) => void runs.push({ view, ids: [...ids], action }))
}))
vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const WEEK = weekStart(TODAY)
const MON = WEEK
const [TUE, WED] = [weekDates(WEEK)[1]!, weekDates(WEEK)[2]!]
const COST = { costs: { head: 2, emotions: 0, senses: 0, body: 0 }, base: { head: 2, emotions: 0, senses: 0, body: 0 }, own: false, edit: true }
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin: startMin + 60, state: 'planned', outsidePlan: false, background: false, movable: true, cost: COST, ...o })
const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({
  date,
  when: date < TODAY ? 'past' : date === TODAY ? 'today' : 'future',
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
/** Monday: m1 (9:00), m2 (11:00); Tuesday: t1 (8:00), t2 (10:00); Wednesday: w1 (9:00) – five blocks of an hour, 2 points of head an hour. */
const blocksOf = (date: string): HorizonBlock[] => (date === MON ? [block('m1', 540), block('m2', 660)] : date === TUE ? [block('t1', 480), block('t2', 600)] : date === WED ? [block('w1', 540)] : [])

let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
let offDel: () => void

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
beforeEach(() => {
  localStorage.clear()
  offEsc = installEscape()
  offDel = installDeleteKey()
  runs.length = 0
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [] })
  vi.mocked(useWeekView).mockImplementation((date) => {
    const w = weekStart(date)
    return { view: weekViewOf(w, TODAY, weekDates(w).map((d) => day(d, blocksOf(d)))), failed: false }
  })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map((d) => day(d, blocksOf(d)))), failed: false }))
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEsc()
  offDel()
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mount(mode: 'week' | '3days' = 'week'): Promise<void> {
  localStorage.setItem('rd.weekMode', mode)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement('div', null, createElement(WeekPage), createElement(DeleteDialog))))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const cell = (date: string, id: string) => q(`week-block-${date}-${id}`)!
const act2 = (fn: () => void) => act(async () => void fn())
const click = (el: Element, init: MouseEventInit = {}) => act2(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init })))
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
const marked = () => [...document.body.querySelectorAll('[data-marked="true"]')].map((e) => `${e.getAttribute('data-tile-date')}|${e.getAttribute('data-tile-id')}`)
const K = (date: string, id: string) => `${date}|${id}`

describe('„Tydzień”: Ctrl+klik, Shift+klik, Ctrl+A, Esc (D527)', () => {
  it('Ctrl+klik zaznacza blok bez otwierania dnia; zwykły klik otwiera dzień z blokiem, jak dotąd', async () => {
    await mount()
    await click(cell(MON, 'm1'), { ctrlKey: true })
    expect(marked()).toEqual([K(MON, 'm1')])
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().day).toBeNull()
    expect(cell(MON, 'm1').className).toContain('ring-lamp')
    await click(cell(TUE, 't1'))
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 't1', date: TUE })
    expect(useUi.getState().day).toBe(TUE)
    // The plain click did not touch the selection of the columns.
    expect(marked()).toEqual([K(MON, 'm1')])
  })

  it('Shift+klik: zakres w kolejności czasu przez dni (dzień, potem start); napis nad kolumnami', async () => {
    await mount()
    await click(cell(MON, 'm2'), { ctrlKey: true })
    await click(cell(WED, 'w1'), { shiftKey: true })
    expect(marked()).toEqual([K(MON, 'm2'), K(TUE, 't1'), K(TUE, 't2'), K(WED, 'w1')])
    // Four blocks of an hour, 2 head an hour: 4 h, 8 points.
    expect(q('week-selection')!.textContent).toBe('Zaznaczone: 4 · 4 h · energia −8 G · 0 E · 0 B · 0 C')
    // Another end from the same anchor replaces the range.
    await click(cell(TUE, 't1'), { shiftKey: true })
    expect(marked()).toEqual([K(MON, 'm2'), K(TUE, 't1')])
  })

  it('Shift+strzałki idą po blokach w kolejności czasu przez dni', async () => {
    await mount()
    await click(cell(MON, 'm2'), { ctrlKey: true })
    cell(MON, 'm2').focus()
    key(cell(MON, 'm2'), 'ArrowDown', { shiftKey: true })
    key(cell(MON, 'm2'), 'ArrowDown', { shiftKey: true })
    expect(marked()).toEqual([K(MON, 'm2'), K(TUE, 't1'), K(TUE, 't2')])
    key(cell(MON, 'm2'), 'ArrowUp', { shiftKey: true })
    expect(marked()).toEqual([K(MON, 'm2'), K(TUE, 't1')])
  })

  it('Ctrl+A zaznacza cały widok, Esc czyści', async () => {
    await mount()
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toHaveLength(5)
    expect(q('week-selection')!.textContent).toContain('Zaznaczone: 5')
    key(document.body, 'Escape')
    expect(marked()).toEqual([])
    expect(q('week-selection')).toBeNull()
  })

  it('„3 dni”: to samo – Ctrl+klik, Shift+klik przez dni; zmiana trybu zaczyna bez zaznaczenia', async () => {
    useData.setState({ view: { today: MON, allDay: [], computers: [] } as unknown as DataView })
    await mount('3days')
    const shown = [...document.body.querySelectorAll('[data-tile-date]')].map((e) => `${e.getAttribute('data-tile-date')}|${e.getAttribute('data-tile-id')}`)
    expect(shown.length).toBeGreaterThan(1)
    const [first, ...rest] = shown
    const at = (k: string) => cell(parseBlockKey(k).date, parseBlockKey(k).id)
    await click(at(first!), { ctrlKey: true })
    await click(at(rest.at(-1)!), { shiftKey: true })
    expect(marked()).toEqual(shown)
    await act2(() => void q('week-mode-week')!.click())
    expect(marked()).toEqual([])
  })
})

describe('menu prawego przycisku i Del na blokach kolumn (D528)', () => {
  const rightClick = (el: Element) => act2(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 })))
  const pick = (id: string) => act2(() => void q(id)!.click())

  it('prawy przycisk na zaznaczonym – „Zmień N bloków” dla całego zaznaczenia, na spoza – tylko ten blok', async () => {
    await mount()
    await click(cell(MON, 'm1'), { ctrlKey: true })
    await click(cell(WED, 'w1'), { ctrlKey: true })
    await rightClick(cell(WED, 'w1'))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
    key(document.body, 'Escape')
    await rightClick(cell(TUE, 't2'))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 1 blok')
    expect(marked()).toEqual([K(TUE, 't2')])
  })

  it('Shift+F10; pozycje dnia są (Odwołaj, Zaparkuj, Przenieś na dzień…) – odwołać i zaparkować można dzisiejsze; pick trafia do `runBlockGroup` z kluczami date|id', async () => {
    await mount()
    await click(cell(MON, 'm1'), { ctrlKey: true })
    await click(cell(MON, 'm2'), { ctrlKey: true })
    cell(MON, 'm2').focus()
    key(cell(MON, 'm2'), 'F10', { shiftKey: true })
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
    expect(q('block-menu-moveto')).not.toBeNull()
    // Only blocks of another day: „Odwołaj” and „Zaparkuj” are today's (the timer's) – off, with the reason.
    for (const id of ['block-menu-cancel', 'block-menu-park']) expect(q(id)!.getAttribute('aria-disabled')).toBe('true')
    expect(q('block-menu-park')!.getAttribute('title')).toBe('Odwołać i zaparkować można tylko dzisiejsze bloki')
    key(document.body, 'Escape')
    await click(cell(WED, 'w1'), { ctrlKey: true })
    cell(WED, 'w1').focus()
    key(cell(WED, 'w1'), 'F10', { shiftKey: true })
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 3 bloki')
    await pick('block-menu-park')
    expect(runs).toEqual([{ view: 'week', ids: [K(MON, 'm1'), K(MON, 'm2'), K(WED, 'w1')], action: { kind: 'park' } }])
  })

  it('Del przy jednym zaznaczonym bloku (UX17, F8): pytanie z nazwą bloku, `remove` tego jednego; Esc anuluje bez zapisu', async () => {
    await mount()
    await click(cell(MON, 'm1'), { ctrlKey: true })
    expect(marked()).toEqual([K(MON, 'm1')])
    key(document.body, 'Delete')
    expect(q('delete-ask')).not.toBeNull()
    expect(q('delete-ask')!.textContent).toMatch(/Usunąć „[^”]+”\?/)
    key(document.body, 'Escape')
    await act2(() => undefined)
    expect(runs).toEqual([])
    key(document.body, 'Delete')
    await click(q('delete-ask-yes')!)
    expect(runs).toEqual([{ view: 'week', ids: [K(MON, 'm1')], action: { kind: 'remove' } }])
  })

  it('Del przy zaznaczeniu ≥ 2: jedno pytanie „Usunąć N bloków?”, `remove` dla wszystkich', async () => {
    await mount()
    await click(cell(MON, 'm1'), { ctrlKey: true })
    await click(cell(TUE, 't1'), { ctrlKey: true })
    await click(cell(WED, 'w1'), { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain(`Usunąć ${groupCount(3, 'block')}?`)
    await click(q('delete-ask-yes')!)
    expect(runs).toEqual([{ view: 'week', ids: [K(MON, 'm1'), K(TUE, 't1'), K(WED, 'w1')], action: { kind: 'remove' } }])
  })
})
