// @vitest-environment jsdom
/**
 * Selecting the bars of the blocks in the cells of the month (N18, D597): Ctrl+click on a bar selects the block and the press goes no further (the day
 * is not selected), Shift+click the range by the date and the hour among the bars the month shows, Ctrl+A with a block selected takes every bar (else the
 * days of the month, as before), Esc clears; blocks and days exclude each other; the right button on a bar of a selected block opens „Zmień N bloków”,
 * on any other bar and on a cell the menu of the day; the line „Zaznaczone: N bloków · …” in the calendar's actions; Del for one block (asked by its name) and for two or more (one question).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { monthDayOf, type MonthView } from '@shared/engine/calendarViews'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { groupCount } from '@shared/groupText'
import { rdFrom } from '@shared/model/rd'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { installDeleteKey } from '@renderer/lib/deleteKey'
import { installEscape } from '@renderer/lib/escape'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { monthDates } from '@shared/engine/calendarViews'
import { useData } from '@renderer/store/data'
import { closeZjazdy, openZjazdy } from '@renderer/features/calendar/zjazdyStore'
import { useMonthView } from '@renderer/store/horizon'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

const { runs } = vi.hoisted(() => ({ runs: [] as Array<{ view: string; ids: readonly string[]; action: unknown }> }))
vi.mock('@renderer/features/plan/groupRun', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/plan/groupRun')>()),
  runBlockGroup: vi.fn(async (view: string, ids: readonly string[], action: unknown) => void runs.push({ view, ids: [...ids], action }))
}))
vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const [D20, D21, D24] = ['2026-11-20', '2026-11-21', '2026-11-24']
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin: startMin + 60, state: 'planned', outsidePlan: false, background: false, movable: true, ...o })
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
/** The 20th: m1 (9:00), m2 (11:00); the 21st: n1 (8:00); the 24th: four blocks – only the first three have a bar, the fourth is in „+1 blok”. */
const blocksOf = (date: string): HorizonBlock[] =>
  date === D20 ? [block('m1', 540), block('m2', 660)] : date === D21 ? [block('n1', 480)] : date === D24 ? [block('f1', 480), block('f2', 540), block('f3', 600), block('f4', 660)] : []
const monthView: MonthView = { month: '2026-11', today: TODAY, days: monthDates('2026-11').map((d) => monthDayOf(day(d, blocksOf(d)))) }

let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
let offDel: () => void

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  runs.length = 0
  vi.mocked(useMonthView).mockReturnValue({ view: monthView, failed: false })
  ;(window as unknown as { rd: unknown }).rd = { dayFiles: async (dates: string[]) => Object.fromEntries(dates.map((d) => [d, null])), edit: async () => [], dataView: async () => undefined }
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'calendar', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  offEsc = installEscape()
  offDel = installDeleteKey()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEsc()
  offDel()
  closeZjazdy()
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mount(): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement('div', null, createElement(CalendarPage), createElement(DeleteDialog))))
  await act(async () => undefined)
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const bar = (date: string, id: string) => document.body.querySelector<HTMLElement>(`[data-testid="month-bar-${date}"][data-block-id="${id}"]`)!
const cell = (date: string) => q(`day-${date}`)!
const marked = () => [...document.body.querySelectorAll('[data-testid^="month-bar-"][data-marked="true"]')].map((e) => `${e.getAttribute('data-testid')!.slice('month-bar-'.length)}|${e.getAttribute('data-block-id')}`)
const days = () => [...document.body.querySelectorAll('[data-testid^="day-"][aria-pressed="true"]')].map((e) => e.getAttribute('data-testid')!.slice(4))
const K = (date: string, id: string) => `${date}|${id}`
const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })))
/** A click as the pointer makes it: press and release on the same element. */
const press = async (el: Element, init: MouseEventInit = {}) => {
  await mouse(el, 'mousedown', { button: 0, ...init })
  await mouse(el, 'mouseup', { button: 0, ...init })
}
const rightClick = (el: Element) => mouse(el, 'contextmenu', { button: 2, clientX: 200, clientY: 200 })
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
const pick = (id: string) => act(async () => void q(id)!.click())

describe('paski bloków w miesiącu: Ctrl+klik, Shift+klik (D597)', () => {
  it('Ctrl+klik w pasek zaznacza blok, nie dzień (zdarzenie nie dochodzi do komórki); napis w pasku działań', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    expect(marked()).toEqual([K(D20, 'm1')])
    expect(days()).toEqual([])
    expect(useUi.getState().day).toBeNull()
    expect(bar(D20, 'm1').className).toContain('ring-lamp')
    expect(q('calendar-block-selection')!.textContent).toBe('Zaznaczone: 1 blok')
    await press(bar(D21, 'n1'), { ctrlKey: true })
    expect(marked()).toEqual([K(D20, 'm1'), K(D21, 'n1')])
    // Two blocks of an hour; the month counts no energy.
    expect(q('calendar-block-selection')!.textContent).toBe('Zaznaczone: 2 bloki · 2 h')
    // Ctrl+click again takes the block off.
    await press(bar(D20, 'm1'), { ctrlKey: true })
    expect(marked()).toEqual([K(D21, 'n1')])
  })

  it('zwykły klik w pasek otwiera dzień jak dotąd i nie rusza zaznaczenia bloków', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D21, 'n1'))
    expect(useUi.getState().day).toBe(D21)
    expect(marked()).toEqual([K(D20, 'm1')])
  })

  it('Shift+klik: zakres po dacie i godzinie wśród pasków widocznych – blok z „+1 blok” do niego nie wchodzi', async () => {
    // A bar after the 24th: the range from the 20th to it holds the fourth block of the 24th (11:00) in its bounds – it has no bar, so it is not in it.
    const D25 = '2026-11-25'
    vi.mocked(useMonthView).mockReturnValue({ view: { ...monthView, days: monthView.days.map((d) => (d.date === D25 ? monthDayOf(day(D25, [block('g1', 540)])) : d)) }, failed: false })
    await mount()
    expect(q(`month-more-${D24}`)!.textContent).toBe('+1 blok')
    await press(bar(D20, 'm2'), { ctrlKey: true })
    await press(bar(D25, 'g1'), { shiftKey: true })
    expect(marked()).toEqual([K(D20, 'm2'), K(D21, 'n1'), K(D24, 'f1'), K(D24, 'f2'), K(D24, 'f3'), K(D25, 'g1')])
    // Another end from the same anchor replaces the range.
    await press(bar(D21, 'n1'), { shiftKey: true })
    expect(marked()).toEqual([K(D20, 'm2'), K(D21, 'n1')])
    expect(days()).toEqual([])
  })
})

describe('blok i dzień się wykluczają; Ctrl+A, Esc (D597)', () => {
  it('zaznaczenie bloku czyści dni, zaznaczenie dnia czyści bloki', async () => {
    await mount()
    await press(cell(D21), { ctrlKey: true })
    expect(days()).toEqual([D21])
    await press(bar(D20, 'm1'), { ctrlKey: true })
    expect(marked()).toEqual([K(D20, 'm1')])
    expect(days()).toEqual([])
    await press(cell(D24), { ctrlKey: true })
    expect(days()).toEqual([D24])
    expect(marked()).toEqual([])
    expect(q('calendar-block-selection')).toBeNull()
  })

  it('Ctrl+A bez bloków – dni miesiąca jak dotąd; z zaznaczonym blokiem – wszystkie paski bloków miesiąca (nie dni)', async () => {
    await mount()
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(days()).toHaveLength(30)
    expect(marked()).toEqual([])
    key(document.body, 'Escape')
    expect(days()).toEqual([])
    await press(bar(D21, 'n1'), { ctrlKey: true })
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([K(D20, 'm1'), K(D20, 'm2'), K(D21, 'n1'), K(D24, 'f1'), K(D24, 'f2'), K(D24, 'f3')])
    expect(days()).toEqual([])
    expect(q('calendar-block-selection')!.textContent).toBe('Zaznaczone: 6 bloków · 6 h')
  })

  it('Ctrl+A bierze paski dni miesiąca, nie paski sąsiednich miesięcy na siatce (choćby ich dzień miał blok)', async () => {
    // The grid of November 2026 reaches 1.12 – a day outside the month, here with a block of its own.
    const outside = '2026-12-01'
    vi.mocked(useMonthView).mockReturnValue({ view: { ...monthView, days: [...monthView.days, monthDayOf(day(outside, [block('x1', 540)]))] }, failed: false })
    await mount()
    expect(bar(outside, 'x1')).not.toBeNull()
    await press(bar(D21, 'n1'), { ctrlKey: true })
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([K(D20, 'm1'), K(D20, 'm2'), K(D21, 'n1'), K(D24, 'f1'), K(D24, 'f2'), K(D24, 'f3')])
    expect(q('calendar-block-selection')!.textContent).toBe('Zaznaczone: 6 bloków · 6 h')
  })

  it('Ctrl+A i Esc z przycisku paska działań (poza siatką) nie ruszają pasków – to klawisze tego przycisku', async () => {
    await mount()
    await press(bar(D21, 'n1'), { ctrlKey: true })
    const outside = q('calendar-type-default')!
    key(outside, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([K(D21, 'n1')])
    key(outside, 'Escape')
    expect(marked()).toEqual([K(D21, 'n1')])
    // From the grid the same keys are the selection's.
    key(cell(D21), 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toHaveLength(6)
    key(cell(D21), 'Escape')
    expect(marked()).toEqual([])
  })

  it('Esc czyści najpierw bloki', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D20, 'm2'), { ctrlKey: true })
    key(document.body, 'Escape')
    expect(marked()).toEqual([])
    expect(q('calendar-block-selection')).toBeNull()
  })

  it('zmiana miesiąca zaczyna bez zaznaczonych bloków', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await act(async () => q('month-next')!.click())
    await act(async () => q('month-prev')!.click())
    expect(marked()).toEqual([])
  })
})

describe('menu prawego przycisku i Del na paskach (D597)', () => {
  it('prawy przycisk na pasku zaznaczonego bloku – „Zmień N bloków” dla całego zaznaczenia', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D24, 'f3'), { ctrlKey: true })
    await rightClick(bar(D24, 'f3'))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
    expect(q('calendar-menu')).toBeNull()
    // Nothing of the day is selected by it.
    expect(days()).toEqual([])
    expect(marked()).toEqual([K(D20, 'm1'), K(D24, 'f3')])
  })

  it('pick z menu idzie do `runBlockGroup` w widoku „calendar” z kluczami date|id w kolejności czasu', async () => {
    await mount()
    await press(bar(D24, 'f1'), { ctrlKey: true })
    await press(bar(D20, 'm2'), { ctrlKey: true })
    await press(bar(D21, 'n1'), { ctrlKey: true })
    await rightClick(bar(D21, 'n1'))
    await pick('block-menu-remove')
    expect(runs).toEqual([{ view: 'calendar', ids: [K(D20, 'm2'), K(D21, 'n1'), K(D24, 'f1')], action: { kind: 'remove' } }])
  })

  it('prawy przycisk na pasku niezaznaczonego bloku i na komórce – menu dnia jak dotąd (nic się nie zmienia dla kogoś, kto bloków nie zaznacza)', async () => {
    await mount()
    await rightClick(bar(D20, 'm1'))
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 1 dzień')
    expect(q('block-menu')).toBeNull()
    expect(days()).toEqual([D20])
    key(document.body, 'Escape')
    await rightClick(cell(D21))
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 1 dzień')
    expect(days()).toEqual([D21])
  })

  it('N18, T2614: „Koszt…” w menu pasków jest wyłączony z powodem (miesiąc nie liczy kosztów kafelków, T2608)', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D21, 'n1'), { ctrlKey: true })
    await rightClick(bar(D21, 'n1'))
    expect(q('block-menu-cost')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('block-menu-cost')!.getAttribute('title')).toBe('Koszt zmienisz w „Tygodniu”, „3 dniach” albo w „Dziś”')
    expect(q('block-menu-category')!.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('podgląd „Wczytaj PDF zjazdów” zdejmuje zaznaczenie bloków, a Del pod nim nie usuwa niewidocznych bloków', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D21, 'n1'), { ctrlKey: true })
    expect(marked()).toHaveLength(2)
    await act(async () => openZjazdy({ file: 'zjazdy.pdf', today: TODAY, days: [], warnings: [] }))
    key(document.body, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(runs).toEqual([])
    // Back on the grid nothing is selected.
    await act(async () => closeZjazdy())
    expect(marked()).toEqual([])
    expect(q('calendar-block-selection')).toBeNull()
  })

  it('Del przy jednym zaznaczonym pasku: pytanie z nazwą bloku, `remove` tego jednego w widoku „calendar”', async () => {
    await mount()
    await press(bar(D21, 'n1'), { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toMatch(/Usunąć „[^”]+”?/)
    await act(async () => q('delete-ask-yes')!.click())
    expect(runs).toEqual([{ view: 'calendar', ids: [K(D21, 'n1')], action: { kind: 'remove' } }])
  })

  it('Del przy zaznaczeniu ≥ 2: jedno pytanie „Usunąć N bloków?”, `remove` dla wszystkich', async () => {
    await mount()
    await press(bar(D20, 'm1'), { ctrlKey: true })
    await press(bar(D21, 'n1'), { ctrlKey: true })
    await press(bar(D24, 'f1'), { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain(`Usunąć ${groupCount(3, 'block')}?`)
    await act(async () => q('delete-ask-yes')!.click())
    expect(runs).toEqual([{ view: 'calendar', ids: [K(D20, 'm1'), K(D21, 'n1'), K(D24, 'f1')], action: { kind: 'remove' } }])
  })
})
