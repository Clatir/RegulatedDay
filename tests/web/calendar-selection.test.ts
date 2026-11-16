// @vitest-environment jsdom
/**
 * Zaznaczanie dni w „Kalendarzu” (D527–D529, Z3): klik, Ctrl, Shift i przeciągnięcie przez `useSelection`, Shift+strzałki (dzień, tydzień),
 * Ctrl+A (dni miesiąca), Esc; liczba „Zaznaczone dni: 7” w pasku działań (T1586); menu prawego przycisku „Zmień 7 dni” (typ dnia z ✓ / „—”, pobudka); linia
 * „Zmieniono 7 dni · Cofnij” z jednym „Cofnij” (tylko zmienione pola, dzień zmieniony od tego czasu zostaje). Pliki dni w pamięci.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { installEscape } from '@renderer/lib/escape'
import { clearGroupLine, useGroupLine } from '@renderer/store/groupLine'
import { useData } from '@renderer/store/data'
import { useMonthView } from '@renderer/store/horizon'
import { useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const dateOf = (n: number): string => `2026-12-${String(n).padStart(2, '0')}`
const D7 = dateOf(7)
const D13 = dateOf(13)

/** The day files of the data folder, in memory: what `window.rd.dayFiles` reads and `window.rd.edit` writes. */
let files: Map<string, RawRecord>
const edits: EditEntry[][] = []
/** A save that waits for this promise (the menu while it runs). */
let slow: Promise<void> | null = null

function applyEdit(e: EditEntry): void {
  const date = /(\d{4}-\d\d-\d\d)\.json$/.exec(e.rel)![1]!
  if (e.remove) return void files.delete(date)
  const rec: RawRecord = e.create ? { schema: 1, date } : { ...files.get(date)! }
  for (const x of e.edits) {
    if (x.value === undefined) delete rec[x.path[0]!]
    else rec[x.path[0]!] = x.value
  }
  files.set(date, rec)
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void

beforeEach(() => {
  files = new Map()
  edits.length = 0
  slow = null
  vi.mocked(useMonthView).mockReturnValue({ view: null, failed: false })
  ;(window as unknown as { rd: unknown }).rd = {
    // The main process reads no more than 62 days at once (`CASE_DAYS_MAX`): the rest is missing from the answer.
    dayFiles: async (dates: string[]) => Object.fromEntries(dates.slice(0, 62).map((d) => [d, files.get(d) ?? null])),
    edit: async (list: EditEntry[]) => {
      edits.push(list)
      if (slow) await slow
      list.forEach(applyEdit)
      return list.map(() => ({ status: 'applied' }))
    },
    dataView: async () => undefined
  }
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'calendar', day: null, pick: null, toasts: [] })
  offEsc = installEscape()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEsc()
  clearGroupLine('calendar')
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mount(dayTypes: Record<string, string> = {}): Promise<void> {
  for (const [d, t] of Object.entries(dayTypes)) files.set(d, { schema: 1, date: d, dayType: t })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CalendarPage)))
  // December: the month of the example (the 7th is a Monday, the 13th a Sunday).
  await act(async () => q('month-next')!.click())
  await act(async () => undefined)
}
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const cell = (d: string) => q(`day-${d}`)!
/** The count the bar of actions says: „Zaznaczone dni: N (…)”. */
const count = () => Number(/^Zaznaczone dni: (\d+)/.exec(q('calendar-selection')?.textContent ?? '')?.[1])
const lineText = () => q('group-line-calendar')?.querySelector('[role="status"]')?.textContent ?? null
const selectedDays = () => [...document.querySelectorAll('[data-testid^="day-"][aria-pressed="true"]')].map((e) => e.getAttribute('data-testid')!.slice(4))

const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })))
/** A click as the pointer makes it: press and release on the same cell. */
const press = async (d: string, init: MouseEventInit = {}) => {
  await mouse(cell(d), 'mousedown', { button: 0, ...init })
  await mouse(cell(d), 'mouseup', { button: 0, ...init })
}
const rightClick = (d: string) => mouse(cell(d), 'contextmenu', { button: 2, clientX: 200, clientY: 200 })
const key = (k: string, init: KeyboardEventInit = {}) => act(async () => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })))
const pick = (id: string) => act(async () => void q(id)!.click())
const typeOf = (d: string): unknown => files.get(d)?.dayType

describe('przykład ze specyfikacji: Ctrl+klik 7.12, Shift+klik 13.12, prawy przycisk → „Wolne”', () => {
  it('7 dni zaznaczonych (w pasku „Zaznaczone dni: 7”), menu „Zmień 7 dni”, wszystkie „Wolne”, linia „Zmieniono 7 dni”, jedno „Cofnij” przywraca typ każdego', async () => {
    await mount()
    // A plain click opens the day (T1585) – the selection starts with Ctrl+click.
    await press(D7, { ctrlKey: true })
    expect(selectedDays()).toEqual([D7])
    expect(count()).toBe(1)
    expect(useUi.getState().day).toBeNull()
    await press(D13, { shiftKey: true })
    expect(selectedDays()).toEqual([7, 8, 9, 10, 11, 12, 13].map(dateOf))
    expect(count()).toBe(7)
    await rightClick(D13)
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 7 dni')
    await pick('calendar-menu-type')
    await pick('calendar-menu-type-wolne')
    expect([7, 8, 9, 10, 11, 12, 13].map((n) => typeOf(dateOf(n)))).toEqual(Array(7).fill('wolne'))
    expect(edits).toHaveLength(1)
    expect(lineText()).toBe('Zmieniono 7 dni')
    expect(q('calendar-menu')).toBeNull()
    // One „Cofnij” for all the days.
    await pick('group-line-calendar-undo')
    expect([7, 8, 9, 10, 11, 12, 13].map((n) => typeOf(dateOf(n)))).toEqual(Array(7).fill(undefined))
    expect(q('group-line-calendar')).toBeNull()
    expect(edits).toHaveLength(2)
    expect(useUi.getState().toasts).toEqual([])
  })

  it('„Cofnij” zdejmuje tylko to, co zmieniono: dzień zmieniony od tego czasu zostaje z komunikatem', async () => {
    await mount({ [dateOf(8)]: 'regeneracyjny' })
    await press(D7, { ctrlKey: true })
    await press(D13, { shiftKey: true })
    await rightClick(D13)
    await pick('calendar-menu-type')
    await pick('calendar-menu-type-wolne')
    expect(typeOf(dateOf(8))).toBe('wolne')
    // Another computer set the 10th to something else meanwhile.
    files.set(dateOf(10), { ...files.get(dateOf(10))!, dayType: 'zjazd-zdalny' })
    await pick('group-line-calendar-undo')
    expect(typeOf(dateOf(10))).toBe('zjazd-zdalny')
    expect(typeOf(dateOf(8))).toBe('regeneracyjny')
    expect([7, 9, 11, 12, 13].map((n) => typeOf(dateOf(n)))).toEqual(Array(5).fill(undefined))
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['1 dzień zmieniony od tego czasu – został'])
    expect(q('group-line-calendar')).toBeNull()
  })

  it('pasek działań dalej działa i też mówi linią grupy; jeden dzień – bez linii (jak dotąd)', async () => {
    await mount()
    await press(dateOf(9), { ctrlKey: true })
    await press(dateOf(10), { ctrlKey: true })
    await pick('calendar-type-wolne')
    expect([typeOf(dateOf(9)), typeOf(dateOf(10))]).toEqual(['wolne', 'wolne'])
    expect(lineText()).toBe('Zmieniono 2 dni')
    // The selection is cleared after the change (as before).
    expect(selectedDays()).toEqual([])
    clearGroupLine('calendar')
    await press(dateOf(14), { ctrlKey: true })
    await pick('calendar-type-wolne')
    expect(typeOf(dateOf(14))).toBe('wolne')
    expect(q('group-line-calendar')).toBeNull()
  })

  it('dni miniony i dzisiejszy są pominięte i policzone w linii („pominięto 2: …”)', async () => {
    await mount()
    // The calendar shows December; the past days and today are on the November grid.
    await act(async () => q('month-prev')!.click())
    await press('2026-11-17', { ctrlKey: true })
    await press(TODAY, { ctrlKey: true })
    await press('2026-11-20', { ctrlKey: true })
    await press('2026-11-21', { ctrlKey: true })
    await pick('calendar-type-wolne')
    expect(typeOf('2026-11-20')).toBe('wolne')
    expect(typeOf(TODAY)).toBeUndefined()
    expect(lineText()).toBe('Zmieniono 2 dni · pominięto 2: miniony, dzisiejszy')
    // The days left out are said once – by the line, not by a toast as well.
    expect(useUi.getState().toasts).toEqual([])
  })

  it('bez linii grupy (jeden dzień zmieniony) pominięte dni mówi toast, raz', async () => {
    await mount()
    await act(async () => q('month-prev')!.click())
    await press('2026-11-17', { ctrlKey: true })
    await press('2026-11-20', { ctrlKey: true })
    await pick('calendar-type-wolne')
    expect(q('group-line-calendar')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Dni minione mają typ z planu z rana – zmieniają się tylko dni od jutra.'])
  })
})

describe('klawiatura i przeciągnięcie', () => {
  it('Shift+strzałki: o dzień, o tydzień; Ctrl+A – dni miesiąca (bez sąsiednich); Esc czyści', async () => {
    await mount()
    await press(D7, { ctrlKey: true })
    await key('ArrowRight', { shiftKey: true })
    await key('ArrowRight', { shiftKey: true })
    expect(selectedDays()).toEqual([7, 8, 9].map(dateOf))
    expect(count()).toBe(3)
    await key('ArrowDown', { shiftKey: true })
    expect(selectedDays()).toHaveLength(10)
    expect(selectedDays()[9]).toBe(dateOf(16))
    await key('ArrowUp', { shiftKey: true })
    await key('ArrowUp', { shiftKey: true })
    expect(selectedDays().at(0)).toBe(dateOf(2))
    await key('a', { ctrlKey: true, code: 'KeyA' })
    expect(selectedDays()).toHaveLength(31)
    expect(selectedDays().every((d) => d.startsWith('2026-12'))).toBe(true)
    expect(count()).toBe(31)
    await key('Escape')
    expect(selectedDays()).toEqual([])
    expect(count()).toBe(0)
    expect(q('calendar-selection')!.textContent).not.toContain('Zaznaczone dni: 31')
  })

  it('przeciągnięcie po dniach zaznacza zakres, zwykły klik w komórkę otwiera dzień jak dotąd', async () => {
    await mount()
    await mouse(cell(dateOf(9)), 'mousedown', { button: 0 })
    await act(async () => void cell(dateOf(11)).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    await mouse(cell(dateOf(11)), 'mouseup', { button: 0 })
    expect(selectedDays()).toEqual([9, 10, 11].map(dateOf))
    expect(useUi.getState().day).toBeNull()
    await press(dateOf(15))
    expect(useUi.getState().day).toBe(dateOf(15))
  })

  it('zaznaczenie przeżywa zmianę miesiąca (jak dotąd)', async () => {
    await mount()
    await press(D7, { ctrlKey: true })
    await act(async () => q('month-next')!.click())
    await press('2027-01-10', { ctrlKey: true })
    await act(async () => q('month-prev')!.click())
    expect(selectedDays()).toEqual([D7])
    expect(count()).toBe(2)
  })
})

describe('menu prawego przycisku (D528)', () => {
  it('na dniu spoza zaznaczenia zaznacza tylko jego i otwiera „Zmień 1 dzień”; na zaznaczonym – całe zaznaczenie', async () => {
    await mount()
    await press(dateOf(9), { ctrlKey: true })
    await press(dateOf(10), { ctrlKey: true })
    await rightClick(dateOf(20))
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 1 dzień')
    expect(selectedDays()).toEqual([dateOf(20)])
    await key('Escape')
    expect(q('calendar-menu')).toBeNull()
    // Esc closed the menu first; the selection stands (the second Esc is the selection's).
    expect(selectedDays()).toEqual([dateOf(20)])
    await press(dateOf(21), { ctrlKey: true })
    await rightClick(dateOf(21))
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 2 dni')
  })

  it('✓ przy typie, który mają wszystkie zaznaczone, „—” przy części; „Typ z tygodnia” – dni bez własnego typu', async () => {
    await mount({ [dateOf(7)]: 'wolne', [dateOf(8)]: 'wolne' })
    await press(dateOf(7), { ctrlKey: true })
    await press(dateOf(8), { ctrlKey: true })
    await rightClick(dateOf(8))
    await pick('calendar-menu-type')
    expect(q('calendar-menu-type-wolne')!.textContent).toContain('✓')
    expect(q('calendar-menu-type-wolne')!.getAttribute('aria-checked')).toBe('true')
    expect(q('calendar-menu-type-zwykly')!.textContent).not.toMatch(/[✓—]/)
    expect(q('calendar-menu-type-default')!.textContent).not.toMatch(/[✓—]/)
    await key('Escape')
    await key('Escape')
    // The 7th and the 8th with the 9th (a Wednesday, the week's own type „zwykły”): „Wolne” for some, „Zwykły” for the one.
    await press(dateOf(9), { ctrlKey: true })
    await rightClick(dateOf(9))
    await pick('calendar-menu-type')
    expect(q('calendar-menu-type-wolne')!.textContent).toContain('—')
    expect(q('calendar-menu-type-wolne')!.getAttribute('aria-checked')).toBe('mixed')
    expect(q('calendar-menu-type-zwykly')!.textContent).toContain('—')
    expect(q('calendar-menu-type-default')!.textContent).toContain('—')
  })

  it('same dni miniony: „Typ dnia” i „Pobudka” wyłączone z powodem w podpowiedzi', async () => {
    await mount()
    await act(async () => q('month-prev')!.click())
    await press('2026-11-10', { ctrlKey: true })
    await press('2026-11-11', { ctrlKey: true })
    await rightClick('2026-11-11')
    expect(q('calendar-menu-type')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('calendar-menu-type')!.title).toContain('od jutra')
    expect(q('calendar-menu-wake')!.closest('[title]')!.getAttribute('title')).toContain('od dziś')
    expect(q('calendar-menu-wake-default')!.getAttribute('aria-disabled')).toBe('true')
    await pick('calendar-menu-type')
    expect(q('calendar-menu-type-wolne')).toBeNull()
    expect(edits).toEqual([])
  })

  it('Shift+F10 na dniu z fokusem otwiera menu tego dnia', async () => {
    await mount()
    await press(D7, { ctrlKey: true })
    await press(dateOf(8), { ctrlKey: true })
    act(() => cell(dateOf(8)).focus())
    await act(async () => void cell(dateOf(8)).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })))
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 2 dni')
  })

  it('pobudka z menu: pole z Enter ustawia pobudkę dniom, linia „Zmieniono N dni”, „Cofnij” przywraca; zła godzina zostawia menu z powodem', async () => {
    await mount()
    await press(D7, { ctrlKey: true })
    await press(dateOf(9), { shiftKey: true })
    await rightClick(dateOf(9))
    const field = q('calendar-menu-wake') as HTMLInputElement
    const type = (text: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
    await type('23:00')
    await act(async () => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(q('calendar-menu')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')!.textContent).toBeTruthy()
    await type('7:30')
    await act(async () => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    await act(async () => undefined)
    expect([7, 8, 9].map((n) => files.get(dateOf(n))?.wakeMin)).toEqual([450, 450, 450])
    expect(q('calendar-menu')).toBeNull()
    expect(lineText()).toBe('Zmieniono 3 dni')
    await pick('group-line-calendar-undo')
    expect([7, 8, 9].map((n) => files.get(dateOf(n))?.wakeMin)).toEqual([undefined, undefined, undefined])
    expect(q('group-line-calendar')).toBeNull()
  })
})

describe('linia i store', () => {
  it('linia „calendar” żyje w store okna (przeżywa zmianę strony), nie w pasku', async () => {
    await mount()
    await press(dateOf(9), { ctrlKey: true })
    await press(dateOf(10), { ctrlKey: true })
    await pick('calendar-type-wolne')
    expect(useGroupLine.getState().lines.calendar?.text).toBe('Zmieniono 2 dni')
    act(() => root!.render(createElement('div')))
    expect(q('group-line-calendar')).toBeNull()
    await act(async () => root!.render(createElement(CalendarPage)))
    expect(q('group-line-calendar')).not.toBeNull()
  })
})

describe('poprawki po przeglądzie Z3', () => {
  it('zwykły klik tylko otwiera dzień – zaznaczenie zostaje bez zmian', async () => {
    await mount()
    await press(dateOf(9), { ctrlKey: true })
    await press(dateOf(10), { ctrlKey: true })
    await press(dateOf(20))
    expect(useUi.getState().day).toBe(dateOf(20))
    expect(selectedDays()).toEqual([dateOf(9), dateOf(10)])
  })

  it('Shift+klik po zmianie miesiąca: zakres przez miesiące (kolejność po dacie), Shift+strzałka dalej od kotwicy', async () => {
    await mount()
    await press(D7, { ctrlKey: true })
    await act(async () => q('month-next')!.click())
    await press('2027-01-10', { shiftKey: true })
    // The 7th of December to the 10th of January.
    expect(count()).toBe(35)
    expect(selectedDays().at(0)).toBe('2026-12-28')
    await act(async () => q('month-prev')!.click())
    expect(selectedDays().at(0)).toBe(D7)
    await act(async () => q('month-next')!.click())
    await key('ArrowRight', { shiftKey: true })
    expect(count()).toBe(36)
    expect(selectedDays().at(-1)).toBe('2027-01-11')
  })

  it('przeciągnięcie: powrót na dzień startowy zwija zakres do niego, puszczenie tam nie otwiera dnia; bez zakresu klik otwiera', async () => {
    await mount()
    await mouse(cell(dateOf(9)), 'mousedown', { button: 0 })
    const enter = (d: string) => act(async () => void cell(d).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    await enter(dateOf(11))
    expect(selectedDays()).toEqual([9, 10, 11].map(dateOf))
    await enter(dateOf(9))
    expect(selectedDays()).toEqual([dateOf(9)])
    await mouse(cell(dateOf(9)), 'mouseup', { button: 0 })
    expect(useUi.getState().day).toBeNull()
    expect(selectedDays()).toEqual([dateOf(9)])
    await press(dateOf(15))
    expect(useUi.getState().day).toBe(dateOf(15))
  })

  it('✓ i „—” z plików zaznaczonych dni także spoza siatki (inny miesiąc), nie tylko z siatki', async () => {
    await mount({ [dateOf(9)]: 'wolne', '2027-03-10': 'wolne', '2027-03-11': 'wolne' })
    for (let i = 0; i < 3; i++) await act(async () => q('month-next')!.click())
    await press('2027-03-10', { ctrlKey: true })
    await press('2027-03-11', { ctrlKey: true })
    for (let i = 0; i < 3; i++) await act(async () => q('month-prev')!.click())
    await press(dateOf(9), { ctrlKey: true })
    await rightClick(dateOf(9))
    await act(async () => undefined)
    expect(q('calendar-menu')!.getAttribute('aria-label')).toBe('Zmień 3 dni')
    await pick('calendar-menu-type')
    // The 10th and the 11th of March are „wolne” in their files (their weekday's own type is not) – all three are.
    expect(q('calendar-menu-type-wolne')!.getAttribute('aria-checked')).toBe('true')
    expect(q('calendar-menu-type-zwykly')!.textContent).not.toMatch(/[✓—]/)
  })

  it('więcej niż 62 dni: pliki czytane porcjami – żaden dzień nie ginie, dniom poza pierwszą porcją zostają pola; „Cofnij” też porcjami', async () => {
    // Every day of the range has a file with a wake of its own (a day not read would be written as a new one, without it).
    const range: string[] = []
    for (let d = D7; d <= '2027-03-10'; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) range.push(d)
    expect(range.length).toBeGreaterThan(62)
    for (const d of range) files.set(d, { schema: 1, date: d, wakeMin: 480 })
    await mount()
    await press(D7, { ctrlKey: true })
    for (let i = 0; i < 3; i++) await act(async () => q('month-next')!.click())
    await press('2027-03-10', { shiftKey: true })
    expect(count()).toBe(range.length)
    await rightClick('2027-03-10')
    await act(async () => undefined)
    await pick('calendar-menu-type')
    await pick('calendar-menu-type-wolne')
    expect(range.filter((d) => files.get(d)?.dayType === 'wolne')).toHaveLength(range.length)
    expect(range.filter((d) => files.get(d)?.wakeMin === 480)).toHaveLength(range.length)
    expect(lineText()).toBe(`Zmieniono ${range.length} dni`)
    await pick('group-line-calendar-undo')
    expect(range.filter((d) => files.get(d)?.dayType === undefined)).toHaveLength(range.length)
    expect(range.filter((d) => files.get(d)?.wakeMin === 480)).toHaveLength(range.length)
    expect(q('group-line-calendar')).toBeNull()
  })

  it('w trakcie zapisu pozycje menu są wyłączone z powodem „Zapisuję…” (wybór nie ginie po cichu)', async () => {
    await mount()
    await press(dateOf(9), { ctrlKey: true })
    await press(dateOf(10), { ctrlKey: true })
    let finish: () => void = () => {}
    slow = new Promise<void>((resolve) => void (finish = resolve))
    await act(async () => void q('calendar-type-wolne')!.click())
    await rightClick(dateOf(10))
    await act(async () => undefined)
    expect(q('calendar-menu-type')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('calendar-menu-type')!.title).toBe('Zapisuję…')
    expect(q('calendar-menu-wake-default')!.title).toBe('Zapisuję…')
    await act(async () => finish())
    expect(typeOf(dateOf(9))).toBe('wolne')
  })
})
