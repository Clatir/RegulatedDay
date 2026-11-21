// @vitest-environment jsdom
/**
 * UX8 (D2, D6, D563 P8, P9) w „Kalendarzu”: miesiąc pamiętany do końca sesji (powrót z „Dziś” staje na nim), PgUp / PgDn / Home zmieniają miesiąc,
 * „Dziś” – jedna reguła (jest zawsze, wyłączony w bieżącym miesiącu), Ctrl+N otwiera okienko nowego bloku dziś (albo w pierwszym dniu siatki od dziś).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { useData } from '@renderer/store/data'
import { useMonthView } from '@renderer/store/horizon'
import { useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { handleEscape } from '@renderer/lib/escape'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (id: string) => act(async () => void q(id)!.click())
const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  act(async () => void target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init })))

beforeEach(() => {
  vi.mocked(useMonthView).mockReturnValue({ view: null, failed: false })
  ;(window as unknown as { rd: unknown }).rd = { dayFiles: async (dates: string[]) => Object.fromEntries(dates.map((d) => [d, null])), edit: async () => [], dataView: async () => undefined, daysView: async (dates: string[]) => ({ today: TODAY, days: dates.map((date) => ({ date, blocks: [] })), from: 0, to: 0 }) }
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'calendar', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  useCalendarFilter.setState({ hidden: [], revealed: null })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mount(): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CalendarPage)))
  await act(async () => undefined)
}
const remount = async () => {
  act(() => root?.unmount())
  host?.remove()
  await mount()
}
const title = () => q('month-title')!.textContent

describe('miesiąc w „Kalendarzu” (D2, D6)', () => {
  it('następny miesiąc przeżywa wyjście i powrót; „Dziś” wraca do bieżącego i jest wyłączony, gdy już tam jesteś', async () => {
    await mount()
    expect(q('month-today')!.hasAttribute('disabled')).toBe(true)
    await click('month-next')
    expect(title()).toBe('grudzień 2026')
    expect(q('month-today')!.hasAttribute('disabled')).toBe(false)
    await remount()
    expect(title()).toBe('grudzień 2026')
    await click('month-today')
    expect(title()).toBe('listopad 2026')
    await remount()
    expect(title()).toBe('listopad 2026')
  })
  it('PgDn / PgUp o miesiąc, Home – bieżący; w polu nic', async () => {
    await mount()
    await press('PageDown')
    expect(title()).toBe('grudzień 2026')
    await press('PageDown')
    expect(title()).toBe('styczeń 2027')
    await press('PageUp')
    expect(title()).toBe('grudzień 2026')
    const input = document.createElement('input')
    document.body.append(input)
    await press('Home', {}, input)
    expect(title()).toBe('grudzień 2026')
    input.remove()
    await press('Home')
    expect(title()).toBe('listopad 2026')
  })
})

describe('Ctrl+N w „Kalendarzu” (D6, P9)', () => {
  it('bieżący miesiąc: okienko dziś, godzina z najbliższego wolnego miejsca', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T09:07:00'))
    try {
      await mount()
      await press('KeyN', { ctrlKey: true })
      expect(q('week-new')!.getAttribute('data-date')).toBe(TODAY)
      expect(q('week-new')!.getAttribute('data-start')).toBe(String(9 * 60 + 15))
    } finally {
      vi.useRealTimers()
    }
  })
  it('następny miesiąc: pierwszy dzień tego miesiąca (dni sąsiednich miesięcy z siatki nie mają tu bloków do ominięcia), godzina po pobudce; jedno okienko', async () => {
    await mount()
    await click('month-next')
    await press('KeyN', { ctrlKey: true })
    // The grid of December starts on Monday 30.11 – its days of November are not asked.
    expect(q('week-new')!.getAttribute('data-date')).toBe('2026-12-01')
    expect(q('week-new')!.getAttribute('data-start')).toBe(String(7 * 60))
    await press('KeyN', { ctrlKey: true })
    expect(document.querySelectorAll('[data-testid="week-new"]')).toHaveLength(1)
  })
  it('bloki dnia – także ukrytego kalendarza – zajmują miejsce: godzina po nich', async () => {
    const blk = (id: string, startMin: number, endMin: number) => ({ id, named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user', sourceId: null }, categoryId: 'inne', startMin, endMin, fixed: false, session: false, state: 'planned', background: false, outsidePlan: false })
    vi.mocked(useMonthView).mockReturnValue({ view: { month: '2026-12', days: [{ date: '2026-12-01', when: 'future', read: 'full', dayType: null, blocks: [blk('a', 7 * 60, 8 * 60), blk('p', 8 * 60, 9 * 60)], load: null, workMin: null, limitMin: null }] } as never, failed: false })
    await mount()
    await click('month-next')
    useData.setState({ rd: rdFrom({ schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }, { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }], categories: { inne: { calendar: 'praca' } } }) })
    await act(async () => useCalendarFilter.setState({ hidden: ['praca'] }))
    const daysView = vi.fn(async () => ({ today: TODAY, days: [], from: 0, to: 0 }))
    ;(window as unknown as { rd: Record<string, unknown> }).rd.daysView = daysView
    await press('KeyN', { ctrlKey: true })
    // The day is in the month's view: its blocks are taken from there, nothing is read.
    expect(daysView).not.toHaveBeenCalled()
    expect(q('week-new')!.getAttribute('data-date')).toBe('2026-12-01')
    expect(q('week-new')!.getAttribute('data-start')).toBe(String(9 * 60))
  })
  it('dziś w siatce następnego miesiąca: Ctrl+N bierze dziś (nie 1. dzień miesiąca), jego bloki czyta z dni (nie ma ich w widoku miesiąca)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-30T05:00:00'))
    const blk = { id: 'a', named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user', sourceId: null }, categoryId: 'inne', startMin: 6 * 60, endMin: 7 * 60, state: 'planned', background: false, outsidePlan: false }
    ;(window as unknown as { rd: Record<string, unknown> }).rd.daysView = async (dates: string[]) => ({ today: '2026-11-30', days: [{ date: dates[0], blocks: [blk] }], from: 0, to: 0 })
    useData.setState({ view: { today: '2026-11-30', allDay: [], computers: [] } as unknown as DataView })
    try {
      await mount()
      await click('month-next')
      await press('KeyN', { ctrlKey: true })
      await act(async () => undefined)
      expect(q('week-new')!.getAttribute('data-date')).toBe('2026-11-30')
      expect(q('week-new')!.getAttribute('data-start')).toBe(String(7 * 60))
    } finally {
      vi.useRealTimers()
    }
  })
  describe('dzień spoza widoku miesiąca – bloki czytane z dni (daysView)', () => {
    const inGrid = async (daysView: (dates: string[]) => Promise<unknown>) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-30T05:00:00'))
      ;(window as unknown as { rd: Record<string, unknown> }).rd.daysView = daysView
      useData.setState({ view: { today: '2026-11-30', allDay: [], computers: [] } as unknown as DataView })
      await mount()
      await click('month-next')
    }
    it('w trakcie odczytu klawisze okresu czekają, a odpowiedź spóźniona po zmianie miesiąca nie otwiera okienka nigdzie', async () => {
      let answer: (v: unknown) => void = () => undefined
      await inGrid(() => new Promise((resolve) => void (answer = resolve)))
      try {
        await press('KeyN', { ctrlKey: true })
        await press('PageDown')
        expect(title()).toBe('grudzień 2026')
        // The button still works: the month moves on, the answer is for a day no longer on the screen.
        await click('month-next')
        expect(title()).toBe('styczeń 2027')
        await act(async () => answer({ today: '2026-11-30', days: [{ date: '2026-11-30', blocks: [] }], from: 0, to: 0 }))
        expect(q('week-new')).toBeNull()
        // The reading is over: the keys and Ctrl+N work again.
        await press('PageUp')
        expect(title()).toBe('grudzień 2026')
      } finally {
        vi.useRealTimers()
      }
    })
    it('odczyt, który rzuca od razu (wyjątek synchroniczny), nie blokuje Ctrl+N na zawsze: okienko otwiera się bez bloków', async () => {
      await inGrid(() => {
        throw new Error('nie ma folderu')
      })
      try {
        await press('KeyN', { ctrlKey: true })
        await act(async () => undefined)
        expect(q('week-new')!.getAttribute('data-date')).toBe('2026-11-30')
        // 05:00 is before the wake (06:00 of an ordinary Monday): from the wake.
        expect(q('week-new')!.getAttribute('data-start')).toBe(String(6 * 60))
      } finally {
        vi.useRealTimers()
      }
    })
  })
  it('przy otwartym okienku PgUp / PgDn / Home nie zmieniają miesiąca', async () => {
    await mount()
    await press('KeyN', { ctrlKey: true })
    expect(q('week-new')).not.toBeNull()
    await press('PageDown')
    expect(title()).toBe('listopad 2026')
    await act(async () => void handleEscape())
    await press('PageDown')
    expect(title()).toBe('grudzień 2026')
  })
  it('miesiąc, którego żaden dzień nie jest od dziś: nic, dymek', async () => {
    await mount()
    await press('PageUp')
    await press('PageUp')
    await press('KeyN', { ctrlKey: true })
    expect(q('week-new')).toBeNull()
    expect(useUi.getState().toasts.at(-1)?.text).toContain('od dziś')
  })
})
