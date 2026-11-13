// @vitest-environment jsdom
/**
 * The page „Tydzień” with its views (SNT1, D417, D418, T936): the switch „Tydzień · 3 dni · Agenda”, remembered by this computer;
 * „3 dni” – yesterday, today and tomorrow in three columns, the arrows move by a day; „Agenda” – seven days from today as a
 * list (all-day events on top, blocks with hour, name, length, category; a day with nothing says „nic”; a click opens the day).
 * The hooks that count the views are the main process's – here they give a fixed answer.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, threeDays, agendaDates, weekDates, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { allDayDraft } from '@shared/model/allDay'
import { weekStart } from '@shared/time/day'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, endMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
const day = (date: string, blocks: HorizonBlock[] = []): HorizonDay => ({
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
/** Every day has no blocks, but 18.11 (10:00–11:30, „Inne obowiązki”) and 20.11 (a lecture at 09:00). */
const blocksOf = (date: string): HorizonBlock[] => (date === TODAY ? [block('a', 600, 690)] : date === '2026-11-20' ? [block('l', 540, 600, { fixed: true, categoryId: 'nauka', named: { ...named, categoryId: 'nauka' } })] : [])

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const all = (sel: string) => host!.querySelectorAll(sel)
const click = async (id: string) => act(async () => q(id)!.click())

beforeEach(() => {
  localStorage.clear()
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [] })
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

describe('przełącznik widoków „Tydzień · 3 dni · Agenda” (T936)', () => {
  it('strona otwiera się Tygodniem: siedem kolumn, tytuł tygodnia', async () => {
    await mount()
    expect(q('week')!.getAttribute('data-mode')).toBe('week')
    expect([...all('[data-testid="week-modes"] button')].map((b) => b.textContent)).toEqual(['Tydzień', '3 dni', 'Agenda'])
    expect(q('week-mode-week')!.getAttribute('aria-pressed')).toBe('true')
    expect(all('[data-testid^="week-col-"]')).toHaveLength(7)
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-16')
    expect(q('goals-panel')).not.toBeNull()
  })

  it('„3 dni”: wczoraj, dziś i jutro w większej skali; strzałki o dzień; „Dziś” wraca', async () => {
    await mount()
    await click('week-mode-3days')
    expect(q('week')!.getAttribute('data-mode')).toBe('3days')
    expect(q('week-mode-3days')!.getAttribute('aria-pressed')).toBe('true')
    expect([...all('[data-testid^="week-col-"]')].map((c) => c.getAttribute('data-testid'))).toEqual(threeDays(TODAY).map((d) => `week-col-${d}`))
    expect(q('week-grid')!.getAttribute('data-mode')).toBe('3days')
    expect(q('three-title')!.textContent).toBe('wt 17.11 – cz 19.11.2026')
    // The scale is larger than „Tydzień”'s: the same 90 minutes are taller (0.8 px a minute there, 1.2 here).
    expect(Number.parseFloat(q(`week-block-${TODAY}-a`)!.style.height)).toBeCloseTo(90 * 1.2 - 1, 5)
    expect(q('week-title')).toBeNull()
    expect(q('goals-panel')).toBeNull()
    expect(q('three-today')!.hasAttribute('disabled')).toBe(true)
    await click('three-next')
    expect(q('three-title')!.getAttribute('data-middle')).toBe('2026-11-19')
    expect([...all('[data-testid^="week-col-"]')].map((c) => c.getAttribute('data-testid'))).toEqual(threeDays('2026-11-19').map((d) => `week-col-${d}`))
    expect(vi.mocked(useDaysView)).toHaveBeenLastCalledWith(threeDays('2026-11-19'))
    await click('three-prev')
    await click('three-prev')
    expect(q('three-title')!.getAttribute('data-middle')).toBe('2026-11-17')
    expect(q('three-today')!.hasAttribute('disabled')).toBe(false)
    await click('three-today')
    expect(q('three-title')!.getAttribute('data-middle')).toBe(TODAY)
  })

  it('wybór widoku jest zapamiętany na tym komputerze', async () => {
    await mount()
    await click('week-mode-3days')
    expect(localStorage.getItem('rd.weekMode')).toBe('3days')
    act(() => root?.unmount())
    host?.remove()
    await mount()
    expect(q('week')!.getAttribute('data-mode')).toBe('3days')
    await click('week-mode-agenda')
    act(() => root?.unmount())
    host?.remove()
    await mount()
    expect(q('week')!.getAttribute('data-mode')).toBe('agenda')
    await click('week-mode-week')
    expect(q('week-title')).not.toBeNull()
  })

  it('wydarzenie całodniowe znalezione w Ctrl K przełącza na Tydzień (karta paska tygodnia)', async () => {
    useData.setState({ allDay: [{ ...allDayDraft('e1', '2026-11-25'), title: 'Konferencja' }] })
    localStorage.setItem('rd.weekMode', 'agenda')
    await mount()
    expect(q('week')!.getAttribute('data-mode')).toBe('agenda')
    await act(async () => useUi.setState({ pick: { kind: 'allDay', id: 'e1' } as never }))
    expect(q('week')!.getAttribute('data-mode')).toBe('week')
    expect(q('week-title')!.getAttribute('data-week')).toBe('2026-11-23')
  })
})

describe('„Agenda” (D418)', () => {
  const mountAgenda = async () => {
    localStorage.setItem('rd.weekMode', 'agenda')
    await mount()
  }
  it('siedem dni od dziś, po dniach; dzień bez niczego – jedna linia „nic”', async () => {
    await mountAgenda()
    // A list: no curves of energy counted (T954).
    expect(vi.mocked(useDaysView)).toHaveBeenLastCalledWith(agendaDates(TODAY), { energy: false })
    expect([...all('[data-testid^="agenda-day-"]')].map((d) => d.getAttribute('data-testid'))).toEqual(agendaDates(TODAY).map((d) => `agenda-day-${d}`))
    expect(q('agenda-heading-2026-11-18')!.textContent).toBe('Dziś · środa 18.11')
    expect(q('agenda-heading-2026-11-19')!.textContent).toBe('Jutro · czwartek 19.11')
    expect(q('agenda-empty-2026-11-19')!.textContent).toBe('nic')
    expect(q('agenda-empty-2026-11-18')).toBeNull()
    expect(all('[data-testid^="agenda-empty-"]')).toHaveLength(5)
  })
  it('blok: godzina, nazwa, długość i kategoria; kategoria powtórzona w nazwie nie jest powtarzana', async () => {
    await mountAgenda()
    const row = q('agenda-block-2026-11-20-l')!
    expect(row.textContent).toContain('09:00')
    expect(row.textContent).toContain('1 h')
    const today = q('agenda-block-2026-11-18-a')!
    expect(today.textContent).toContain('10:00')
    expect(today.textContent).toContain('Inne obowiązki')
    expect(today.textContent).toContain('1 h 30 min')
    expect(today.querySelector('[data-testid="agenda-category"]')!.textContent).toBe('')
  })
  it('wydarzenia całodniowe dnia – nad blokami', async () => {
    useData.setState({ allDay: [{ ...allDayDraft('e1', TODAY), title: 'Konferencja' }] })
    await mountAgenda()
    const section = q('agenda-day-2026-11-18')!
    const items = [...section.querySelectorAll('li')]
    expect(items[0]!.getAttribute('data-testid')).toBe('agenda-allday-e1')
    expect(items[1]!.querySelector('[data-testid="agenda-block-2026-11-18-a"]')).not.toBeNull()
  })
  it('klik w blok i w nagłówek otwiera ten dzień (jak klik w „Tygodniu”)', async () => {
    await mountAgenda()
    await click('agenda-block-2026-11-20-l')
    expect(useUi.getState().page).toBe('today')
    expect(useUi.getState().day).toBe('2026-11-20')
    useUi.setState({ page: 'week', day: null })
    await click('agenda-heading-2026-11-22')
    expect(useUi.getState().day).toBe('2026-11-22')
  })
  it('dzień, którego nie da się teraz odczytać, tak to mówi (zamiast „nic”)', async () => {
    vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map((d) => ({ ...day(d), read: d === '2026-11-19' ? ('unknown' as const) : ('full' as const) }))), failed: false }))
    await mountAgenda()
    expect(q('agenda-unknown-2026-11-19')!.textContent).toBe('nie da się teraz odczytać')
    expect(q('agenda-empty-2026-11-19')).toBeNull()
  })
})
