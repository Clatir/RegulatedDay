// @vitest-environment jsdom
/**
 * Żetony kalendarzy w widokach okna (SNT2 część B, D419, D425): odznaczony kalendarz chowa swoje bloki i wydarzenia całodniowe
 * w „Tygodniu”, „3 dniach”, „Agendzie” i w miesiącu „Kalendarza” (oś „Dziś” – `day-axis.test.ts` niżej: te same elementy,
 * całość w E2E), nad widokiem są żetony, „ukryte: N” liczy bloki i wydarzenia widoku; krzywa energii, nagłówek dnia i kropka
 * obciążenia zostają jak policzył silnik. Przy jednym kalendarzu żetonów nie ma i nic nie jest ukryte.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { monthDayOf, type MonthView } from '@shared/engine/calendarViews'
import { computeDay } from '@shared/engine/day'
import { pushedText } from '@shared/engine/pushApart'
import { addDays } from '@shared/time/zone'
import { computeEnergy } from '@shared/engine/energy'
import { daysViewOf, weekDates, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { filterBlocks } from '@shared/model/calendars'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { weekStart } from '@shared/time/day'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { hiddenBlocksAmong, useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { axisWithRevealed } from '@renderer/features/calendars/visibleViews'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { weekPushLineText } from '@renderer/features/week/weekText'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { useData } from '@renderer/store/data'
import { useDaysView, useMonthView, useWeekView } from '@renderer/store/horizon'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block as block2, Scenario } from '../unit/engine/dsl'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const LECTURE_DAY = '2026-11-20'
// „Nauka” belongs to the calendar „Praca”, every other category to „Moje”.
const RD_TWO = rdFrom({
  schema: 1,
  calendars: [
    { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] },
    { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }
  ],
  categories: { nauka: { calendar: 'praca' } }
})
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, endMin: number, categoryId: string, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named: { ...named, categoryId }, categoryId, startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
const day = (date: string, blocks: HorizonBlock[], o: Partial<HorizonDay> = {}): HorizonDay => ({
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
  budget: null,
  ...o
})
/** Today: „a” of „Moje” (10:00); the 20th: a lecture „l” of „Praca” (09:00) and „x” of „Moje” (14:00). */
const blocksOf = (date: string): HorizonBlock[] =>
  date === TODAY ? [block('a', 600, 690, 'inne')] : date === LECTURE_DAY ? [block('l', 540, 600, 'nauka', { fixed: true }), block('x', 840, 900, 'inne')] : []
const plusDay = (date: string, n: number): string => addDays(date, n)
const event = (id: string, title: string, date: string, calendarId: string | null): AllDayEvent => ({ ...allDayDraft(id, date), title, calendarId })

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (id: string) => act(async () => q(id)!.click())
const chip = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="calendar-chip"][data-calendar="${id}"]`)!
const hiddenText = () => q('calendar-hidden-count')?.textContent ?? null
const hide = (...ids: string[]) => act(() => useCalendarFilter.setState({ hidden: ids }))

function setEvents(events: AllDayEvent[]): void {
  useData.setState({ view: { today: TODAY, allDay: events, computers: [] } as unknown as DataView, allDay: events })
}

beforeEach(() => {
  localStorage.clear()
  useCalendarFilter.setState({ hidden: [], revealed: null })
  useData.setState({ rd: RD_TWO })
  setEvents([])
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
  useCalendarFilter.setState({ hidden: [], revealed: null })
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mountWeek(mode: 'week' | '3days' | 'agenda'): Promise<void> {
  localStorage.setItem('rd.weekMode', mode)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(WeekPage)))
  if (q('week')!.getAttribute('data-mode') !== mode) await click(`week-mode-${mode}`)
}

describe('„Tydzień” (D419)', () => {
  it('żetony nad siatką; wszystko pokazane, bez „ukryte”', async () => {
    await mountWeek('week')
    expect(q('calendar-chips')).not.toBeNull()
    expect([...host!.querySelectorAll('[data-testid="calendar-chip"]')].map((c) => c.getAttribute('data-calendar'))).toEqual(['moje', 'praca', 'dom'])
    expect(q(`week-block-${LECTURE_DAY}-l`)).not.toBeNull()
    expect(hiddenText()).toBeNull()
  })

  it('odznaczony kalendarz chowa swój blok i wydarzenie całodniowe; „ukryte: 2”; krzywa i nagłówek dnia zostają; klik w żeton przywraca', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca'), event('e2', 'Obiad', LECTURE_DAY, null)])
    await mountWeek('week')
    expect(q('allday-bar-e1')).not.toBeNull()
    await act(async () => chip('praca').click())
    expect(chip('praca').getAttribute('aria-pressed')).toBe('false')
    expect(q(`week-block-${LECTURE_DAY}-l`)).toBeNull()
    expect(q(`week-block-${LECTURE_DAY}-x`)).not.toBeNull()
    expect(q(`week-block-${TODAY}-a`)).not.toBeNull()
    expect(q('allday-bar-e1')).toBeNull()
    expect(q('allday-bar-e2')).not.toBeNull()
    expect(hiddenText()).toBe('ukryte: 2')
    // The day's own numbers (heading: its regeneration) are the engine's, whole.
    expect(q(`week-regen-${LECTURE_DAY}`)).not.toBeNull()
    expect(useCalendarFilter.getState().hidden).toEqual(['praca'])
    await act(async () => chip('praca').click())
    expect(q(`week-block-${LECTURE_DAY}-l`)).not.toBeNull()
    expect(q('allday-bar-e1')).not.toBeNull()
    expect(hiddenText()).toBeNull()
  })

  it('ukryty blok nie zasłania kliknięcia w puste miejsce kolumny (kolumna zostaje bez bloku „l”)', async () => {
    await mountWeek('week')
    hide('praca')
    await act(async () => undefined)
    const col = q(`week-col-${LECTURE_DAY}`)!
    expect(col.querySelectorAll('[data-testid^="week-block-"]')).toHaveLength(1)
    expect(col.getAttribute('aria-label')).toContain('1')
  })

  it('„ukryte: N” liczy cały tydzień, także dni poza widokiem „dziś”; wydarzenie z innego tygodnia nie liczy się', async () => {
    setEvents([event('e1', 'Zjazd', '2026-11-23', 'praca')])
    await mountWeek('week')
    hide('praca')
    await act(async () => undefined)
    expect(hiddenText()).toBe('ukryte: 1')
  })

  it('jeden kalendarz („Moje”): bez żetonów i bez ukrywania, choć zapamiętano ukrycie', async () => {
    useData.setState({ rd: rdFrom({ schema: 1 }) })
    hide('praca')
    await mountWeek('week')
    expect(q('calendar-chips')).toBeNull()
    expect(q(`week-block-${LECTURE_DAY}-l`)).not.toBeNull()
  })
})

describe('„3 dni” (D419)', () => {
  it('chowa blok ukrytego kalendarza i liczy go w „ukryte”', async () => {
    await mountWeek('3days')
    expect(q(`week-block-${TODAY}-a`)).not.toBeNull()
    hide('moje')
    await act(async () => undefined)
    expect(q(`week-block-${TODAY}-a`)).toBeNull()
    expect(hiddenText()).toBe('ukryte: 1')
    expect(q('week-grid')!.getAttribute('data-mode')).toBe('3days')
  })

  it('strzałka: do czasu odczytu widać poprzednie dni – wydarzenia liczą się z tych samych dni co bloki, nie z nowych dat', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    await mountWeek('3days')
    hide('praca')
    await act(async () => undefined)
    // 17.–19.11 are drawn: the event of the 20th is not among them.
    expect(hiddenText()).toBeNull()
    vi.mocked(useDaysView).mockImplementation((dates) => (dates.includes(LECTURE_DAY) ? { view: null, failed: false } : { view: daysViewOf(dates, TODAY, dates.map((d) => day(d, blocksOf(d)))), failed: false }))
    await click('three-next')
    expect(q('three-title')!.getAttribute('data-middle')).toBe(plusDay(TODAY, 1))
    // The next days are not read yet: the grid still shows 17.–19.11, and so does the count.
    expect(q(`week-col-${TODAY}`)).not.toBeNull()
    expect(q(`week-col-${LECTURE_DAY}`)).toBeNull()
    expect(hiddenText()).toBeNull()
  })

  it('kalendarz bez bloków i wydarzeń w widoku – „ukryte” bez zmian (nic)', async () => {
    await mountWeek('3days')
    hide('dom')
    await act(async () => undefined)
    expect(hiddenText()).toBeNull()
    expect(q(`week-block-${TODAY}-a`)).not.toBeNull()
  })
})

describe('„Agenda” (D419)', () => {
  it('chowa bloki i wydarzenia ukrytego kalendarza; dzień z samymi ukrytymi mówi, że nic', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    await mountWeek('agenda')
    expect(q(`agenda-block-${LECTURE_DAY}-l`)).not.toBeNull()
    expect(q('agenda-allday-e1')).not.toBeNull()
    hide('praca')
    await act(async () => undefined)
    expect(q(`agenda-block-${LECTURE_DAY}-l`)).toBeNull()
    expect(q('agenda-allday-e1')).toBeNull()
    expect(q(`agenda-block-${LECTURE_DAY}-x`)).not.toBeNull()
    expect(hiddenText()).toBe('ukryte: 2')
    hide('praca', 'moje')
    await act(async () => undefined)
    expect(q(`agenda-block-${TODAY}-a`)).toBeNull()
    // A day with nothing left says what was hidden, not „nic” (D419); one with nothing at all still says „nic”.
    expect(q(`agenda-empty-${TODAY}`)).toBeNull()
    expect(q(`agenda-hidden-${TODAY}`)!.textContent).toBe('ukryte: 1')
    expect(q(`agenda-empty-${plusDay(TODAY, 1)}`)).not.toBeNull()
    expect(hiddenText()).toBe('ukryte: 4')
  })

  it('blok zdjęty z dnia (odwołany) nie liczy się do „ukryte”', async () => {
    vi.mocked(useDaysView).mockImplementation((dates) => ({
      view: daysViewOf(dates, TODAY, dates.map((d) => day(d, d === TODAY ? [block('c', 600, 660, 'nauka', { state: 'cancelled' })] : []))),
      failed: false
    }))
    await mountWeek('agenda')
    hide('praca')
    await act(async () => undefined)
    expect(hiddenText()).toBeNull()
  })
})

describe('miesiąc w „Kalendarzu” (D419)', () => {
  const D = TODAY
  const monthView = (): MonthView => ({
    month: '2026-11',
    today: TODAY,
    days: [
      // Two fixed blocks (one of each calendar) and a flexible one of „Praca”: two bars and „+1”; with „Praca” hidden one bar, no „+N”.
      monthDayOf(day(D, [block('f1', 540, 600, 'inne', { fixed: true }), block('f2', 600, 660, 'nauka', { fixed: true }), block('g', 700, 760, 'nauka')], { budget: { workMin: 500, limitMin: 400 } as never }))
    ]
  })
  beforeEach(() => {
    vi.mocked(useMonthView).mockReturnValue({ view: monthView(), failed: false })
    ;(window as unknown as { rd: unknown }).rd = { dayFiles: async () => ({}) }
    useUi.setState({ page: 'calendar' })
  })
  async function mount(): Promise<void> {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(CalendarPage)))
  }

  it('wszystko pokazane: dwa paski i „+1”; żetony nad siatką', async () => {
    await mount()
    expect(q('calendar-chips')).not.toBeNull()
    expect(host!.querySelectorAll(`[data-testid="month-bar-${D}"]`)).toHaveLength(2)
    expect(q(`month-more-${D}`)!.textContent).toBe('+1')
    expect(hiddenText()).toBeNull()
  })

  it('„Praca” ukryta: znika jej pasek i jej część „+N”, wydarzenia też; kropka obciążenia bez zmian; „ukryte: 3”', async () => {
    setEvents([event('e1', 'Zjazd', D, 'praca')])
    await mount()
    const level = q(`month-load-${D}`)!.getAttribute('data-level')
    expect(level).toBe('high')
    hide('praca')
    await act(async () => undefined)
    expect([...host!.querySelectorAll(`[data-testid="month-bar-${D}"]`)].map((b) => b.textContent)).toEqual(['Inne obowiązki'])
    expect(q(`month-more-${D}`)).toBeNull()
    expect(q(`month-load-${D}`)!.getAttribute('data-level')).toBe(level)
    expect(q(`month-load-${D}`)!.title).toBe('Praca 8 h 20 min z 6 h 40 min')
    expect(hiddenText()).toBe('ukryte: 3')
  })

  it('jeden kalendarz: bez żetonów, wszystko widać', async () => {
    useData.setState({ rd: rdFrom({ schema: 1 }) })
    hide('praca')
    await mount()
    expect(q('calendar-chips')).toBeNull()
    expect(host!.querySelectorAll(`[data-testid="month-bar-${D}"]`)).toHaveLength(2)
  })
})

describe('Ctrl K i karta wydarzenia z ukrytego kalendarza (D427)', () => {
  it('wynik Ctrl K z ukrytego kalendarza: karta się otwiera, pasek wydarzenia jest widoczny z podpisem, nie liczy się do „ukryte”; po zamknięciu karty znika', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca'), event('e2', 'Wyjazd', LECTURE_DAY, 'praca')])
    useCalendarFilter.setState({ hidden: ['praca'] })
    useUi.setState({ page: 'week', pick: { kind: 'allDay', id: 'e1' } })
    await mountWeek('week')
    expect(q('allday-card')).not.toBeNull()
    expect(q('allday-bar-e1')!.getAttribute('data-hidden-calendar')).toBe('z ukrytego kalendarza Praca')
    expect(q('allday-hidden-calendar')!.textContent).toBe('z ukrytego kalendarza Praca')
    expect(q('allday-bar-e2')).toBeNull()
    // The chips are as they were; hidden are the lecture of the 20th and e2 – not e1, which is drawn.
    expect(chip('praca').getAttribute('aria-pressed')).toBe('false')
    expect(hiddenText()).toBe('ukryte: 2')
    await click('allday-cancel')
    expect(q('allday-card')).toBeNull()
    expect(q('allday-bar-e1')).toBeNull()
    expect(hiddenText()).toBe('ukryte: 3')
  })

  it('otwarta karta wydarzenia zamyka się, gdy odznaczysz jego kalendarz (jego paska już nie ma)', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    await mountWeek('week')
    await click('allday-bar-e1')
    expect(q('allday-card')).not.toBeNull()
    await act(async () => chip('praca').click())
    expect(q('allday-card')).toBeNull()
    expect(q('allday-bar-e1')).toBeNull()
  })

  it('odkrycie bez opóźnienia: karta z Ctrl K i pole filtra ustawione razem (jedno zdarzenie), pasek jest od razu', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    useCalendarFilter.setState({ hidden: ['praca'] })
    useUi.setState({ page: 'week', pick: { kind: 'allDay', id: 'e1' } })
    await mountWeek('week')
    expect(useCalendarFilter.getState().revealed).toBe('e1')
    // After the card closes the filter is told at once.
    await click('allday-cancel')
    expect(useCalendarFilter.getState().revealed).toBeNull()
  })

  it('klik w pasek odkryty z Ctrl K: karta otwiera się dalej jako odkryta – pasek zostaje, nie liczy się do „ukryte”', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    useCalendarFilter.setState({ hidden: ['praca'] })
    useUi.setState({ page: 'week', pick: { kind: 'allDay', id: 'e1' } })
    await mountWeek('week')
    await click('allday-cancel')
    // Closed: the bar is gone; Ctrl K again opens it, then the bar itself is clicked.
    await act(async () => useUi.setState({ pick: { kind: 'allDay', id: 'e1' } }))
    expect(q('allday-card')).not.toBeNull()
    await click('allday-bar-e1')
    expect(q('allday-card')).not.toBeNull()
    expect(q('allday-bar-e1')).not.toBeNull()
    expect(useCalendarFilter.getState().revealed).toBe('e1')
  })

  it('zamykanie po odznaczeniu liczy się według BIEŻĄCEGO kalendarza wydarzenia, nie tego z chwili otwarcia karty', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'dom')])
    useCalendarFilter.setState({ hidden: ['praca'] })
    await mountWeek('week')
    await click('allday-bar-e1')
    expect(q('allday-card')).not.toBeNull()
    // Another computer moves the event to „Praca” (unchecked) while the card is open.
    await act(async () => setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')]))
    expect(q('allday-card')).toBeNull()
  })

  it('karta wydarzenia widocznego kalendarza zostaje, gdy odznaczysz inny', async () => {
    setEvents([event('e1', 'Zjazd', LECTURE_DAY, 'praca')])
    await mountWeek('week')
    await click('allday-bar-e1')
    await act(async () => chip('dom').click())
    expect(q('allday-card')).not.toBeNull()
  })
})

describe('oś „Dziś”: blok ukrytego kalendarza, który zostaje (D427, D428)', () => {
  const item = (id: string, categoryId: string, startMin = 600, marks: string[] = []) => ({ id, categoryId, startMin, endMin: startMin + 60, marks })
  // „r” runs now – a running block of an unchecked calendar is hidden like any other (D428: the bar of the desktop shows it).
  const items = [item('a', 'inne'), item('n', 'nauka', 700), item('r', 'nauka', 800, ['biegnie']), item('o', 'nauka', 900)]
  const shown = items.filter((i) => i.categoryId !== 'nauka')

  it('wraca tylko blok z otwartym panelem, z nazwą kalendarza; „ukryte” liczy resztę, także trwający', () => {
    const out = axisWithRevealed(items, shown, 'n', RD_TWO)
    expect(out.items.map((i) => [i.id, (i as { hiddenIn?: string }).hiddenIn])).toEqual([
      ['a', undefined],
      ['n', 'Praca']
    ])
    expect(out.hiddenCount).toBe(2)
  })

  it('bez otwartego bloku znikają wszystkie, także trwający; nic ukryte – te same pozycje', () => {
    const out = axisWithRevealed(items, shown, null, RD_TWO)
    expect(out.items.map((i) => i.id)).toEqual(['a'])
    expect(out.hiddenCount).toBe(3)
    expect(axisWithRevealed(shown, shown, 'n', RD_TWO).items).toBe(shown)
  })
})

describe('oś w „Dziś”: godziny z wszystkich bloków (D427)', () => {
  it('zakres osi liczy się z `extent`, choć ukryty blok nie jest rysowany; podpis „z ukrytego kalendarza” na pozycji z `hiddenIn`', async () => {
    const mk = (id: string, startMin: number, o: Partial<TimelineItem> = {}): TimelineItem => ({ id, startMin, endMin: startMin + 60, title: `Blok ${id}`, marks: [], color: '#888888', categoryId: 'inne', background: false, ...o })
    const visible = mk('a', 600)
    const late = mk('z', 23 * 60)
    const mount = async (props: Record<string, unknown>) => {
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(Timeline, { markers: [], selected: null, onSelect: () => undefined, from: 8 * 60, to: 18 * 60, ...props } as never)))
    }
    await mount({ items: [visible] })
    const hiOf = () => Number(q('timeline-axis')!.getAttribute('data-hi'))
    const alone = hiOf()
    act(() => root?.unmount())
    host?.remove()
    await mount({ items: [visible], extent: [visible, late] })
    expect(hiOf()).toBeGreaterThan(alone)
    expect(hiOf()).toBeGreaterThanOrEqual(24 * 60)
    expect(q('block-z')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    await mount({ items: [mk('a', 600, { hiddenIn: 'Praca' })] })
    expect(q('block-a')!.getAttribute('data-hidden-calendar')).toBe('Praca')
    expect(q('hidden-calendar')!.textContent).toBe('z ukrytego kalendarza Praca')
  })
})

describe('rozsuwanie: linia mówi, ile ukrytych (D419, T1003)', () => {
  it('„Przesunięto N bloków (w tym M ukrytych)”; bez ukrytych – jak dotąd', () => {
    expect(pushedText(3)).toBe('Przesunięto 3 bloki')
    expect(pushedText(3, 0)).toBe('Przesunięto 3 bloki')
    expect(pushedText(3, 1)).toBe('Przesunięto 3 bloki (w tym 1 ukryty)')
    expect(pushedText(5, 2)).toBe('Przesunięto 5 bloków (w tym 2 ukryte)')
    expect(pushedText(8, 5)).toBe('Przesunięto 8 bloków (w tym 5 ukrytych)')
  })

  it('linia „Tygodnia” sumuje ukryte z dni; ukryte w bloku przeniesionym i „Dodaj” też', () => {
    const d = (date: string, moved: number, hidden?: number) => ({ date, entry: { rel: `days/${date}.json`, edits: [] }, made: null, moved, ...(hidden != null ? { hidden } : {}) })
    expect(weekPushLineText({ days: [d('2026-11-24', 2, 1), d('2026-11-25', 1, 1)] })).toBe('Przesunięto 3 bloki (w tym 2 ukryte) w 2 dniach')
    expect(weekPushLineText({ days: [d('2026-11-24', 2)] })).toBe('Przesunięto 2 bloki w 1 dniu')
    expect(weekPushLineText({ days: [d('2026-11-25', 2, 1)], move: { blockId: 'b', name: 'Analiza', from: '2026-11-24', to: '2026-11-25' } })).toContain('przesunięto 2 bloki (w tym 1 ukryty)')
  })

  it('`hiddenBlocksAmong` liczy bloki odznaczonych kalendarzy według stanu okna', () => {
    expect(hiddenBlocksAmong([{ categoryId: 'inne' }, { categoryId: 'nauka' }, { categoryId: 'nauka' }])).toBe(0)
    useCalendarFilter.setState({ hidden: ['praca'] })
    expect(hiddenBlocksAmong([{ categoryId: 'inne' }, { categoryId: 'nauka' }, { categoryId: 'nauka' }])).toBe(2)
    // The block drawn in spite of its calendar (its panel is open – D427) is not hidden.
    expect(hiddenBlocksAmong([{ id: 'a', categoryId: 'inne' }, { id: 'n', categoryId: 'nauka' }, { id: 'm', categoryId: 'nauka' }], 'n')).toBe(1)
  })
})

describe('oś „Dziś” (D419)', () => {
  it('pozycje osi niosą kategorię, więc filtr kalendarzy je rozpoznaje; krzywa energii jest osobno i zostaje', () => {
    const date = '2026-10-21'
    const s = new Scenario({ date, plan: [block2({ id: 'a', cat: 'inne', at: '10:00', min: 60, origin: 'user' }), block2({ id: 'n', cat: 'nauka', at: '11:00', min: 60, origin: 'user' })] })
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const axis = dayAxis(model, { rd: RD_TWO, settings: s.settings, routines: [], requests: [] }, null)
    expect(axis.items.map((i) => [i.id, i.categoryId])).toEqual([
      ['a', 'inne'],
      ['n', 'nauka']
    ])
    const seen = filterBlocks(axis.items, ['praca'], RD_TWO)
    expect(seen.shown.map((i) => i.id)).toEqual(['a'])
    expect(seen.hiddenCount).toBe(1)
    // The filter takes the items only: the axis' curve and markers are what the engine counted.
    expect(seen.shown).not.toBe(axis.items)
    expect(axis).toHaveProperty('energy')
    expect(axis.markers.length).toBeGreaterThan(0)
  })
})

describe('miesiąc: dzień z silnika niesie kategorie swoich bloków', () => {
  it('`categories` = kategoria każdego bloku z `blockCount` (bez zdjętych z dnia)', () => {
    const m = monthDayOf(day(TODAY, [block('a', 600, 660, 'inne'), block('b', 700, 760, 'nauka'), block('c', 800, 860, 'nauka', { state: 'cancelled' })]))
    expect(m.blockCount).toBe(2)
    expect(m.categories).toEqual(['inne', 'nauka'])
  })
})
