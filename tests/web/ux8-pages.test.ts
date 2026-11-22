// @vitest-environment jsdom
/**
 * UX8 (D2, D6, D563 P8, P9): „Tydzień”, „3 dni” and „Agenda” remember their period for the session (the week, the middle day, the first day) and
 * open it again when you return from „Dziś”; PgUp / PgDn / Home move the period like the arrows (nothing in a field); „Agenda” has arrows,
 * „Dziś” by one rule (always there, off where you already are) and an action on an empty day; Ctrl+N opens the small window of a new block on
 * today (or the first day from today shown) at the nearest free hour. The counting hooks are the main process's – a fixed answer here.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, weekDates, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { weekStart } from '@shared/time/day'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { useData } from '@renderer/store/data'
import { useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { handleEscape } from '@renderer/lib/escape'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, endMin: number): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false })
const day = (date: string, blocks: HorizonBlock[] = [], wakeMin: number | null = 7 * 60): HorizonDay => ({
  date,
  when: date < TODAY ? 'past' : date === TODAY ? 'today' : 'future',
  read: 'full',
  dayType: null,
  templateId: null,
  frozen: false,
  blocks,
  wakeMin,
  bedtimeMin: null,
  boundary: null,
  extensionMin: 0,
  regen: null,
  studyMin: 0,
  sessions: { clean: 0, extended: 0, outsidePlan: 0 },
  energy: null,
  budget: null
})
/** Today has a block 10:00–11:30; every other day is empty. */
const blocksOf = (date: string): HorizonBlock[] => (date === TODAY ? [block('a', 600, 690)] : [])

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (id: string) => act(async () => q(id)!.click())
const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  act(async () => void target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init })))

beforeEach(() => {
  localStorage.clear()
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  useCalendarFilter.setState({ hidden: [], revealed: null })
  vi.mocked(useWeekView).mockImplementation((date) => {
    const week = weekStart(date)
    return { view: weekViewOf(week, TODAY, weekDates(week).map((d) => day(d, blocksOf(d)))), failed: false }
  })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map((d) => day(d, blocksOf(d)))), failed: false }))
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useData.setState({ view: null, allDay: [] })
})

async function mount(): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(WeekPage)))
}
const remount = async () => {
  act(() => root?.unmount())
  host?.remove()
  await mount()
}

describe('pamięć okresu (D2)', () => {
  it('„Tydzień”: następny tydzień przeżywa wyjście i powrót; „Ten tydzień” wraca do bieżącego', async () => {
    await mount()
    await click('week-next')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
    await remount()
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
    expect(q('week-today')!.hasAttribute('disabled')).toBe(false)
    await click('week-today')
    await remount()
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-16')
  })
  it('środek „3 dni” wrócony na dziś znowu jest „dzisiejszy”, nie zapamiętaną datą (po północy nie zostaje na wczoraj)', async () => {
    await mount()
    await click('week-mode-3days')
    await click('three-next')
    expect(useUi.getState().memory.anchor).toBe('2026-11-19')
    await click('three-prev')
    expect(useUi.getState().memory.anchor).toBeNull()
    await click('three-prev')
    await press('PageDown')
    expect(useUi.getState().memory.anchor).toBeNull()
  })
  it('„3 dni”: środek i „Agenda”: początek też są pamiętane', async () => {
    await mount()
    await click('week-mode-3days')
    await click('three-next')
    await click('three-next')
    await remount()
    expect(q('three-title')!.getAttribute('data-middle')).toBe('2026-11-20')
    await click('week-mode-agenda')
    await click('agenda-next')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe('2026-11-25')
    await remount()
    expect(q('agenda-title')!.getAttribute('data-from')).toBe('2026-11-25')
  })
})

describe('klawisze okresu (D6, P8)', () => {
  it('„Tydzień”: PgDn / PgUp o tydzień, Home – ten tydzień', async () => {
    await mount()
    await press('PageDown')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
    await press('PageDown')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-30')
    await press('PageUp')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
    await press('Home')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-16')
  })
  it('„3 dni”: o dzień; „Agenda”: o siedem dni, nie przed dziś', async () => {
    await mount()
    await click('week-mode-3days')
    await press('PageDown')
    expect(q('three-title')!.getAttribute('data-middle')).toBe('2026-11-19')
    await press('Home')
    expect(q('three-title')!.getAttribute('data-middle')).toBe(TODAY)
    await click('week-mode-agenda')
    await press('PageUp')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe(TODAY)
    await press('PageDown')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe('2026-11-25')
    await press('Home')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe(TODAY)
  })
  it('w polu klawisze nic nie zmieniają', async () => {
    await mount()
    const input = document.createElement('input')
    host!.append(input)
    await press('PageDown', {}, input)
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-16')
  })
})

describe('„Agenda”: strzałki, „Dziś”, pusty dzień (D6)', () => {
  const agenda = async () => {
    localStorage.setItem('rd.weekMode', 'agenda')
    await mount()
  }
  it('strzałki i „Dziś” – ta sama reguła co gdzie indziej: przycisk jest, wyłączony na bieżącym okresie; „wstecz” nie przed dziś', async () => {
    await agenda()
    expect(q('agenda-today')!.hasAttribute('disabled')).toBe(true)
    expect(q('agenda-prev')!.hasAttribute('disabled')).toBe(true)
    await click('agenda-next')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe('2026-11-25')
    expect(vi.mocked(useDaysView)).toHaveBeenLastCalledWith(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'], { energy: false })
    expect(q('agenda-today')!.hasAttribute('disabled')).toBe(false)
    await click('agenda-today')
    expect(q('agenda-title')!.getAttribute('data-from')).toBe(TODAY)
  })
  it('pusty dzień ma akcję „+ Blok”: otwiera ten dzień z nowym blokiem', async () => {
    await agenda()
    expect(q('agenda-empty-2026-11-19')!.textContent).toBe('nic')
    await click('agenda-add-2026-11-19')
    const s = useUi.getState()
    expect(s.page).toBe('today')
    expect(s.day).toBe('2026-11-19')
    expect(s.pick).toMatchObject({ kind: 'command', id: 'newBlock', date: '2026-11-19' })
    expect(s.from).toBe('week')
  })
})

describe('Ctrl+N w „Tygodniu” i „3 dniach” (D6, P9)', () => {
  const ctrlN = (init: KeyboardEventInit = {}) => press('KeyN', { ctrlKey: true, ...init })
  it('„Tydzień” z dziś: okienko dziś o najbliższej wolnej godzinie (po bloku 10:00–11:30)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T09:07:00+01:00'))
    try {
      await mount()
      await ctrlN()
      const w = q('week-new')!
      expect(w.getAttribute('data-date')).toBe(TODAY)
      expect(w.getAttribute('data-dates')).toBe(TODAY)
      // 09:07 → 09:15 would run into the block at 10:00 (an hour does not fit): after it.
      expect(w.getAttribute('data-start')).toBe(String(11 * 60 + 30))
    } finally {
      vi.useRealTimers()
    }
  })
  it('następny tydzień: pierwszy widoczny dzień, godzina po pobudce; miniony tydzień – nic (dymek)', async () => {
    await mount()
    await click('week-next')
    await ctrlN()
    expect(q('week-new')!.getAttribute('data-date')).toBe('2026-11-23')
    expect(q('week-new')!.getAttribute('data-start')).toBe(String(8 * 60))
    await press('Escape')
    await click('week-prev')
    await click('week-prev')
    await ctrlN()
    expect(q('week-new')).toBeNull()
    expect(useUi.getState().toasts.at(-1)?.text).toContain('od dziś')
  })
  it('bloki ukrytych kalendarzy też zajmują miejsce (okienko nie staje na bloku, który jest)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T09:07:00+01:00'))
    try {
      await mount()
      useData.setState({ rd: rdFrom({ schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }, { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }], categories: { inne: { calendar: 'praca' } } }) })
      await act(async () => useCalendarFilter.setState({ hidden: ['praca'] }))
      expect(q(`week-block-${TODAY}-a`)).toBeNull()
      await ctrlN()
      expect(q('week-new')!.getAttribute('data-start')).toBe(String(11 * 60 + 30))
    } finally {
      vi.useRealTimers()
    }
  })
  it('dzień bez policzonej pobudki: pobudka z typu dnia w ustawieniach (zwykły – 6:00), nie 8:00', async () => {
    vi.mocked(useWeekView).mockImplementation((date) => {
      const week = weekStart(date)
      return { view: weekViewOf(week, TODAY, weekDates(week).map((d) => day(d, blocksOf(d), null))), failed: false }
    })
    await mount()
    await click('week-next')
    await ctrlN()
    expect(q('week-new')!.getAttribute('data-date')).toBe('2026-11-23')
    expect(q('week-new')!.getAttribute('data-start')).toBe(String(7 * 60))
  })
  it('przy otwartym okienku PgUp / PgDn / Home nie zmieniają okresu', async () => {
    await mount()
    await click('week-next')
    await ctrlN()
    expect(q('week-new')).not.toBeNull()
    await press('PageDown')
    await press('Home')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
    await act(async () => void handleEscape())
    await press('PageDown')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-30')
  })
  it('„3 dni”: dziś; przytrzymany klawisz robi jedno okienko; pod oknem dialogowym nic', async () => {
    await mount()
    await click('week-mode-3days')
    await ctrlN()
    expect(q('week-new')!.getAttribute('data-date')).toBe(TODAY)
    expect(host!.querySelectorAll('[data-testid="week-new"]')).toHaveLength(1)
  })
})
