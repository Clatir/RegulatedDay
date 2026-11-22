// @vitest-environment jsdom
/**
 * UX19 (D565 P27, changes D384): the panel „Sprawy” beside „Tydzień” and „3 dni” – folded by default (remembered by this computer), the
 * sprawa of its rows dragged onto the column of a day (the hour under the pointer, on the 5-min grid; a selection of two or more carries the whole
 * group; Ctrl – a copy), „Zaplanuj” puts it in today's nearest free place; a day gone by refuses in words and writes nothing.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { daysViewOf, weekDates, weekViewOf, type HorizonDay } from '@shared/engine/week'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf, weekStart } from '@shared/time/day'
import { weekDropAt } from '@renderer/features/week/weekCaseDrop'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { casesOpen } from '@renderer/features/week/weekViews'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useGroupLine } from '@renderer/store/groupLine'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { closeToast, NO_MEMORY, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

// Wednesday 18.11.2026, 11:00 in Warsaw: 16.11 and 17.11 of the week are gone, 19.11 and the rest to come.
const NOW = new Date('2026-11-18T10:00:00Z')
const TODAY = '2026-11-18'
const PAST = '2026-11-17'
const FUTURE = '2026-11-20'

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

const rel = (id: string) => paths.record('request', id)
const task = (id: string, age: number, p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask(id, NOW.getTime() - age * 1000, logicalDayOf(NOW.getTime()), { title: `zadanie ${id}`, estimateMin: 30, ...p })!

/** The window over a folder of records; the days of the week are known and empty; the edits are laid as the folder would. */
function stub(records: RawRecord[]) {
  const sent: EditEntry[][] = []
  const state = { records: [...records] }
  const days = Object.fromEntries(weekDates('2026-11-16').map((d) => [d, null as RawRecord | null]))
  const view = (): DataView => ({ status: 'open', today: TODAY, rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {}, computers: [], allDay: [] }) as unknown as DataView
  const apply = (e: EditEntry) => {
    if (!e.rel.startsWith('requests/')) return
    const id = e.rel.slice('requests/'.length, -'.json'.length)
    const was = state.records.find((r) => r.id === id)
    state.records = state.records.filter((r) => r.id !== id)
    if (e.remove) return
    const next: RawRecord = { ...(e.create ? { id } : (was ?? { id })) }
    for (const ed of e.edits) next[ed.path[0]!] = ed.value
    state.records.push(next)
  }
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in days)
      return { files: Object.fromEntries(known.map((d) => [d, days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    dayData: async (date) => ({ date, dayFile: days[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }),
    edit: async (entries) => (sent.push(entries), entries.forEach(apply), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    planPushed: async () => undefined
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom({}), templates: [], allDay: [], requests: state.records.map((r) => requestFrom(r)!) })
  return { sent }
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
const data = useData.getState()
let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const chip = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-chip"][data-case="${id}"]`)!
const click = (el: Element, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })))
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
const ptr = (type: string, x: number, y: number, init: MouseEventInit = { buttons: 1 }) => act(async () => void window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init })))
const col = (date: string) => document.querySelector<HTMLElement>(`[data-week-col="${date}"]`)!

/** Each column is 100 px wide from x = 100 × its index + 50, from y = 20 to the bottom of its axis; the pixels a minute are the column's own. */
function layColumns(): void {
  document.querySelectorAll<HTMLElement>('[data-week-col]').forEach((el, i) => {
    const ppm = Number(el.dataset.ppm)
    const height = (Number(el.dataset.hi) - Number(el.dataset.lo)) * ppm
    el.getBoundingClientRect = () => ({ left: 100 * i + 50, right: 100 * i + 150, top: 20, bottom: 20 + height, width: 100, height, x: 100 * i + 50, y: 20, toJSON: () => undefined }) as DOMRect
  })
}
const colX = (date: string) => 100 * [...document.querySelectorAll('[data-week-col]')].indexOf(col(date)) + 100
const yAt = (date: string, minute: number) => 20 + (minute - Number(col(date).dataset.lo)) * Number(col(date).dataset.ppm)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  vi.mocked(useWeekView).mockImplementation((date) => {
    const week = weekStart(date)
    return { view: weekViewOf(week, TODAY, weekDates(week).map(day)), failed: false }
  })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map(day)), failed: false }))
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  offEsc = installEscape()
})
afterEach(() => {
  vi.useRealTimers()
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  offEsc()
  document.body.innerHTML = ''
  for (const t of useUi.getState().toasts) closeToast(t.id)
  useGroupLine.setState({ lines: {} })
  useData.setState(data, true)
})
async function mount(): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(WeekPage)))
  await settle()
}
const openPanel = async () => {
  await click(q('week-cases-toggle')!)
  await settle()
  layColumns()
}

describe('weekDropAt (czyste)', () => {
  it('kolumna pod punktem i godzina na siatce 5 min; poza kolumnami – nic', () => {
    document.body.innerHTML = ''
    const a = document.createElement('div')
    a.dataset.weekCol = '2026-11-18'
    a.dataset.lo = '300'
    a.dataset.hi = '1500'
    a.dataset.ppm = '1'
    a.getBoundingClientRect = () => ({ left: 0, right: 100, top: 10, bottom: 1210 }) as DOMRect
    document.body.append(a)
    // 10 + 123 px from the top of the column = 5:00 + 123 min = 07:03, on the grid 07:05 (425).
    expect(weekDropAt(50, 133)).toEqual({ date: '2026-11-18', minute: 425 })
    // The sticky headings and the strip of all-day events stand over the columns: a point in them is no drop (the column under them has an hour nobody sees).
    const head = document.createElement('div')
    head.setAttribute('data-testid', 'week-head')
    head.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 150 }) as DOMRect
    document.body.append(head)
    expect(weekDropAt(50, 133)).toBeNull()
    expect(weekDropAt(50, 151)).toEqual({ date: '2026-11-18', minute: 440 })
    head.remove()
    // The box that scrolls the axis cuts the column: what is scrolled out of it (under the top bar, the banners) is no drop either.
    const box = document.createElement('div')
    box.style.overflowY = 'auto'
    box.getBoundingClientRect = () => ({ left: 0, right: 100, top: 100, bottom: 600 }) as DOMRect
    document.body.append(box)
    box.append(a)
    expect(weekDropAt(50, 50)).toBeNull()
    expect(weekDropAt(50, 650)).toBeNull()
    expect(weekDropAt(50, 150)).toEqual({ date: '2026-11-18', minute: 440 })
    document.body.append(a)
    box.remove()
    // Not over a column.
    expect(weekDropAt(150, 133)).toBeNull()
    expect(weekDropAt(50, 5)).toBeNull()
    // Never past the bottom of the axis (the block must start where it can be drawn).
    expect(weekDropAt(50, 1209)!.minute).toBeLessThanOrEqual(1495)
  })
})

describe('panel „Sprawy” przy „Tygodniu”: zwinięty domyślnie', () => {
  it('zwinięty; przycisk go otwiera i zamyka, stan zostaje w pamięci tego komputera', async () => {
    stub([task('a', 1)])
    await mount()
    expect(q('week-cases-toggle')!.getAttribute('aria-expanded')).toBe('false')
    expect(q('cases-panel')).toBeNull()
    await click(q('week-cases-toggle')!)
    expect(q('week-cases-toggle')!.getAttribute('aria-expanded')).toBe('true')
    expect(q('cases-panel')).not.toBeNull()
    expect(casesOpen()).toBe(true)
    // The panel's hint speaks of the columns, not of the axis.
    expect(q('cases-panel')!.textContent).toContain('kolumnę dnia')
    // Opened again (another visit): open.
    act(() => root!.unmount())
    host!.remove()
    await mount()
    expect(q('cases-panel')).not.toBeNull()
    await click(q('week-cases-toggle')!)
    expect(q('cases-panel')).toBeNull()
    expect(casesOpen()).toBe(false)
  })

  it('„3 dni” też ma panel; „Agenda” (lista bez kolumn) – nie ma przycisku', async () => {
    stub([task('a', 1)])
    await mount()
    await click(q('week-mode-3days')!)
    expect(q('week-cases-toggle')).not.toBeNull()
    await click(q('week-mode-agenda')!)
    expect(q('week-cases-toggle')).toBeNull()
    expect(q('cases-panel')).toBeNull()
  })
})

describe('przeciągnięcie sprawy na kolumnę dnia', () => {
  it('podgląd miejsca w kolumnie w trakcie, puszczenie stawia blok o tej godzinie w tym dniu i daje „Cofnij”', async () => {
    const s = stub([task('a', 1)])
    await mount()
    await openPanel()
    const start = Number(col(FUTURE).dataset.lo) + 300
    await act(async () => void chip('a').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 })))
    await ptr('pointermove', colX(FUTURE), yAt(FUTURE, start))
    const band = q('week-case-drop')!
    expect(band).not.toBeNull()
    expect(band.dataset.date).toBe(FUTURE)
    expect(band.dataset.start).toBe(String(start))
    expect(band.dataset.denied).toBeUndefined()
    await ptr('pointerup', colX(FUTURE), yAt(FUTURE, start), { buttons: 0 })
    await settle()
    await settle()
    expect(q('week-case-drop')).toBeNull()
    const day = s.sent[0]!.find((e) => e.rel === paths.day(FUTURE))!
    const blocks = day.edits.find((e) => e.path.join('.') === 'blocks')!.value as Array<{ startMin: number; task: string }>
    expect(blocks.map((b) => [b.task, b.startMin])).toEqual([['a', start]])
    expect(s.sent[0]!.some((e) => e.rel === rel('a'))).toBe(true)
    expect(useUi.getState().toasts.map((t) => t.action?.label)).toEqual(['Cofnij'])
  })

  it('dzień miniony: podgląd odmowy, puszczenie nic nie zapisuje i mówi słowami', async () => {
    const s = stub([task('a', 1)])
    await mount()
    await openPanel()
    const at = Number(col(PAST).dataset.lo) + 300
    await act(async () => void chip('a').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 })))
    await ptr('pointermove', colX(PAST), yAt(PAST, at))
    expect(q('week-case-drop')!.dataset.denied).toBe('true')
    await ptr('pointerup', colX(PAST), yAt(PAST, at), { buttons: 0 })
    await settle()
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Dni minionych nie zmieniasz przeciąganiem.'])
  })

  it('puszczenie poza kolumnami nic nie zapisuje', async () => {
    const s = stub([task('a', 1)])
    await mount()
    await openPanel()
    await act(async () => void chip('a').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 })))
    await ptr('pointermove', 5, 400)
    expect(q('week-case-drop')).toBeNull()
    await ptr('pointerup', 5, 400, { buttons: 0 })
    await settle()
    expect(s.sent).toEqual([])
  })

  it('zaznaczone dwie sprawy: przeciągnięcie jednej niesie obie, jedna po drugiej od godziny puszczenia; linia „Zaplanowano 2 · Cofnij” stoi nad kolumnami', async () => {
    const s = stub([task('a', 1), task('b', 2)])
    await mount()
    await openPanel()
    await click(chip('a'))
    await click(chip('b'), { ctrlKey: true })
    const start = Number(col(FUTURE).dataset.lo) + 300
    await act(async () => void chip('a').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 })))
    await ptr('pointermove', colX(FUTURE), yAt(FUTURE, start))
    await ptr('pointerup', colX(FUTURE), yAt(FUTURE, start), { buttons: 0 })
    await settle()
    await settle()
    const day = s.sent[0]!.find((e) => e.rel === paths.day(FUTURE))!
    const blocks = day.edits.find((e) => e.path.join('.') === 'blocks')!.value as Array<{ startMin: number; task: string }>
    expect(blocks.map((b) => [b.task, b.startMin]).sort()).toEqual([['a', start], ['b', start + 30]].sort())
    expect(q('group-line-week')!.textContent).toContain('Zaplanowano 2')
  })

  it('Ctrl przy puszczeniu: kopia – oryginał zostaje na liście, powstaje nowa sprawa', async () => {
    const s = stub([task('a', 1)])
    await mount()
    await openPanel()
    const start = Number(col(FUTURE).dataset.lo) + 300
    await act(async () => void chip('a').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 })))
    await ptr('pointermove', colX(FUTURE), yAt(FUTURE, start), { buttons: 1, ctrlKey: true })
    expect(q('case-drag')!.getAttribute('data-copy')).toBe('true')
    await ptr('pointerup', colX(FUTURE), yAt(FUTURE, start), { buttons: 0, ctrlKey: true })
    await settle()
    await settle()
    const rels = s.sent[0]!.map((e) => e.rel)
    expect(rels).toContain(paths.day(FUTURE))
    // The new sprawa (a copy) is created; the original file is not among the edits.
    expect(rels.filter((r) => r.startsWith('requests/') && r !== rel('a'))).toHaveLength(1)
    expect(rels).not.toContain(rel('a'))
  })
})

describe('„Zaplanuj” w panelu przy „Tygodniu”', () => {
  it('stawia sprawę dziś w najbliższym wolnym miejscu (od następnego kwadransa)', async () => {
    const s = stub([task('a', 1)])
    await mount()
    await openPanel()
    await click(q('case-plan')!)
    await settle()
    await settle()
    const day = s.sent[0]!.find((e) => e.rel === paths.day(TODAY))!
    const blocks = day.edits.find((e) => e.path.join('.') === 'blocks')!.value as Array<{ startMin: number; task: string }>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.task).toBe('a')
    // 11:00 now (a full quarter) → from 11:00, never before the wake: a block planned today starts on a quarter.
    expect(blocks[0]!.startMin % 15).toBe(0)
    expect(blocks[0]!.startMin).toBeGreaterThanOrEqual(11 * 60)
  })
})
