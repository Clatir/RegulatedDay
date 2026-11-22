// @vitest-environment jsdom
/**
 * UX19 (D565 P28): „Zastosuj szablon ▸” in the menu of the days of the Calendar (the selection) and in the menu of a day's heading in „Tydzień” –
 * the submenu lists the templates that are not archived, a pick goes through the flow of „Zastosuj do…” (the window of today's hours for today
 * or a day gone, the question of collisions, the write of `applyToDays`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, weekDates, weekViewOf, type HorizonDay } from '@shared/engine/week'
import type { Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { weekStart } from '@shared/time/day'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { dayMenu, type DayMenuActions } from '@renderer/features/calendar/dayMenu'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { applyTemplateEntry } from '@renderer/features/templates/applyMenu'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useDaysView, useMonthView, useWeekView } from '@renderer/store/horizon'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))
const applied = vi.hoisted(() => ({ calls: [] as Array<{ id: string; dates: string[]; mode: string }> }))
vi.mock('@renderer/features/templates/applyDays', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/templates/applyDays')>()),
  askedDays: vi.fn(async () => []),
  applyToDays: vi.fn(async (t: { id: string }, dates: string[], mode: string) => {
    applied.calls.push({ id: t.id, dates: [...dates], mode })
    return true
  })
}))

const TODAY = '2026-11-18'
const tpl = (id: string, name: string, dayType: Template['dayType'], archived = false): Template => ({ id, name, dayType, weekdays: [], versions: [], archived })
const TEMPLATES = [tpl('t-zwykly', 'Dzień pracy', 'zwykly'), tpl('t-wolny', 'Wolny sobotni', 'wolne'), tpl('t-stary', 'Stary', 'zwykly', true)]

describe('applyTemplateEntry (czyste)', () => {
  it('lista: tylko niezarchiwizowane, z nazwą i typem dnia; wybór oddaje szablon', () => {
    const pick = vi.fn()
    const entry = applyTemplateEntry(TEMPLATES, false, pick, 'm')
    expect(entry).toMatchObject({ label: 'Zastosuj szablon', testId: 'm' })
    const sub = (entry as unknown as { submenu: Array<{ label: string; testId: string; onPick: () => void }> }).submenu
    expect(sub.map((s) => s.testId)).toEqual(['m-t-zwykly', 'm-t-wolny'])
    expect(sub[0]!.label).toContain('Dzień pracy')
    sub[1]!.onPick()
    expect(pick).toHaveBeenCalledWith(TEMPLATES[1])
  })

  it('zajęty zapis i brak szablonów wyłączają pozycję z powodem', () => {
    expect(applyTemplateEntry(TEMPLATES, true, vi.fn(), 'm')).toMatchObject({ disabled: 'Zapisuję…' })
    expect(applyTemplateEntry([TEMPLATES[2]!], false, vi.fn(), 'm')).toMatchObject({ disabled: expect.stringContaining('Nie ma szablonów') })
  })

  it('menu dni Kalendarza ma „Zastosuj szablon” po pobudce, z dniami zaznaczenia', () => {
    const act: DayMenuActions = { setType: vi.fn(), setWake: vi.fn(), applyTemplate: vi.fn() }
    const entries = dayMenu(['2026-12-07', '2026-12-08'], new Map(), TODAY, false, act, TEMPLATES)
    const item = entries.find((e) => 'label' in e && e.label === 'Zastosuj szablon') as unknown as { submenu: Array<{ onPick: () => void }> } | undefined
    expect(item).toBeDefined()
    item!.submenu[0]!.onPick()
    expect(act.applyTemplate).toHaveBeenCalledWith(TEMPLATES[0], ['2026-12-07', '2026-12-08'])
  })
})

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })))
const pick = (id: string) => act(async () => void q(id)!.click())
const rightClick = (el: Element) => mouse(el, 'contextmenu', { button: 2, clientX: 200, clientY: 200 })

const day = (date: string): HorizonDay => ({
  date,
  when: date < TODAY ? 'past' : date === TODAY ? 'today' : 'future',
  read: 'full',
  dayType: null,
  templateId: null,
  frozen: false,
  blocks: [],
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

beforeEach(() => {
  // The flow takes „today” from the clock (the logical day of the click): the clock stands on the day the page is drawn with.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
  applied.calls.length = 0
  localStorage.clear()
  vi.mocked(useMonthView).mockReturnValue({ view: null, failed: false })
  vi.mocked(useWeekView).mockImplementation((date) => {
    const week = weekStart(date)
    return { view: weekViewOf(week, TODAY, weekDates(week).map(day)), failed: false }
  })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map(day)), failed: false }))
  ;(window as unknown as { rd: unknown }).rd = { dayFiles: async (dates: string[]) => Object.fromEntries(dates.map((d) => [d, null])), edit: async () => [], dataView: async () => undefined }
  useData.setState({ rd: rdFrom({ schema: 1 }), templates: TEMPLATES, view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'calendar', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  offEsc = installEscape()
})
afterEach(() => {
  vi.useRealTimers()
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  offEsc()
  document.body.innerHTML = ''
  useData.setState({ view: null, allDay: [], templates: [], rd: rdFrom(undefined) })
})
async function mount(node: ReturnType<typeof createElement>): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
  await act(async () => undefined)
}

describe('Kalendarz: menu zaznaczonych dni', () => {
  const cell = (d: string) => q(`day-${d}`)!
  const ctrlClick = async (d: string) => {
    await mouse(cell(d), 'mousedown', { button: 0, ctrlKey: true })
    await mouse(cell(d), 'mouseup', { button: 0, ctrlKey: true })
  }

  it('dni od jutra: „Zastosuj szablon ▸ <szablon>” zapisuje bez pytań na wszystkich zaznaczonych', async () => {
    await mount(createElement(CalendarPage))
    await act(async () => q('month-next')!.click())
    await ctrlClick('2026-12-07')
    await ctrlClick('2026-12-09')
    await rightClick(cell('2026-12-09'))
    await pick('calendar-menu-apply')
    await pick('calendar-menu-apply-t-wolny')
    await act(async () => undefined)
    expect(applied.calls).toEqual([{ id: 't-wolny', dates: ['2026-12-07', '2026-12-09'], mode: 'fill' }])
    expect(q('calendar-menu')).toBeNull()
    // As after „Typ dnia”: the days are done with, the selection goes.
    expect(document.querySelectorAll('[data-testid^="day-"][aria-pressed="true"]')).toHaveLength(0)
  })

  it('dzień, który już trwa, wśród zaznaczonych: najpierw okno godzin (D546), zapis dopiero po „Zastosuj”', async () => {
    await mount(createElement(CalendarPage))
    await ctrlClick(TODAY)
    await rightClick(cell(TODAY))
    await pick('calendar-menu-apply')
    await pick('calendar-menu-apply-t-zwykly')
    await act(async () => undefined)
    expect(q('template-apply-confirm')).not.toBeNull()
    expect(applied.calls).toEqual([])
    await pick('template-apply-confirm-ok')
    expect(applied.calls).toHaveLength(1)
    expect(applied.calls[0]!.id).toBe('t-zwykly')
  })
})

describe('„Tydzień”: menu nagłówka dnia', () => {
  it('prawy przycisk na nagłówku dnia: „Zastosuj szablon ▸” na ten dzień', async () => {
    useUi.setState({ page: 'week' })
    await mount(createElement(WeekPage))
    await rightClick(q('week-day-2026-11-20')!)
    expect(q('week-day-menu')).not.toBeNull()
    await pick('week-day-menu-apply')
    await pick('week-day-menu-apply-t-zwykly')
    await act(async () => undefined)
    expect(applied.calls).toEqual([{ id: 't-zwykly', dates: ['2026-11-20'], mode: 'fill' }])
  })

  it('zwykły klik w nagłówek dalej otwiera dzień', async () => {
    useUi.setState({ page: 'week' })
    await mount(createElement(WeekPage))
    await act(async () => q('week-day-2026-11-20')!.click())
    expect(useUi.getState().page).toBe('today')
    expect(useUi.getState().day).toBe('2026-11-20')
  })
})
