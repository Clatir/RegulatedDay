// @vitest-environment jsdom
/**
 * UX5 / B2 (D529 + D563): a type changed for one day in „Kalendarz” says „Typ dnia …” with „Cofnij” (the line of a group comes
 * from two days) – the same `undoDayEdits`: the type back, and the classes of a „zjazd” the change took away with it. Files in memory.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord } from '@shared/api'
import { setAt } from '@shared/data/merge'
import { rdFrom } from '@shared/model/rd'
import { CalendarPage } from '@renderer/features/calendar/CalendarPage'
import { installEscape } from '@renderer/lib/escape'
import { clearGroupLine } from '@renderer/store/groupLine'
import { useData } from '@renderer/store/data'
import { useMonthView } from '@renderer/store/horizon'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const D14 = '2026-12-14'
const CLASS = { id: 'z1', title: 'Analiza · wykład', origin: 'zjazd', kind: 'fixed', startMin: 540, durationMin: 90 }

let files: Map<string, RawRecord>
function applyEdit(e: EditEntry): void {
  const date = /(\d{4}-\d\d-\d\d)\.json$/.exec(e.rel)![1]!
  if (e.remove) return void files.delete(date)
  let rec = (e.create ? { schema: 1, date } : { ...files.get(date)! }) as unknown
  for (const x of e.edits) rec = setAt(rec, x.path, x.value)
  files.set(date, rec as RawRecord)
}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void

beforeEach(() => {
  files = new Map()
  vi.mocked(useMonthView).mockReturnValue({ view: null, failed: false })
  ;(window as unknown as { rd: unknown }).rd = {
    dayFiles: async (dates: string[]) => Object.fromEntries(dates.map((d) => [d, files.get(d) ?? null])),
    edit: async (list: EditEntry[]) => {
      list.forEach(applyEdit)
      return list.map(() => ({ status: 'applied' }))
    },
    dataView: async () => undefined
  }
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'calendar', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
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

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
async function mount(): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CalendarPage)))
  await act(async () => q('month-next')!.click())
  await act(async () => undefined)
}
const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })))
const select = async (d: string) => {
  await mouse(q(`day-${d}`)!, 'mousedown', { button: 0, ctrlKey: true })
  await mouse(q(`day-${d}`)!, 'mouseup', { button: 0, ctrlKey: true })
}
const pick = (id: string) => act(async () => void q(id)!.click())
const toasts = () => useUi.getState().toasts
const typeOf = (d: string): unknown => files.get(d)?.dayType

describe('B2: jeden dzień zmieniony w Kalendarzu', () => {
  it('dymek „Typ dnia … · Cofnij” (bez linii grupy); „Cofnij” przywraca typ', async () => {
    files.set(D14, { schema: 1, date: D14, dayType: 'regeneracyjny' })
    await mount()
    await select(D14)
    await pick('calendar-type-wolne')
    expect(typeOf(D14)).toBe('wolne')
    expect(q('group-line-calendar')).toBeNull()
    expect(toasts().map((t) => [t.text, t.action?.label])).toEqual([['Typ dnia 14.12.2026: Wolne', 'Cofnij']])
    await act(async () => toasts()[0]!.action!.run())
    expect(typeOf(D14)).toBe('regeneracyjny')
  })

  it('typ z tygodnia: dymek mówi „z tygodnia”, „Cofnij” zdejmuje pole', async () => {
    files.set(D14, { schema: 1, date: D14, dayType: 'wolne' })
    await mount()
    await select(D14)
    await pick('calendar-type-default')
    expect(typeOf(D14)).toBeUndefined()
    expect(toasts().map((t) => t.text)).toEqual(['Typ dnia 14.12.2026: z tygodnia'])
    await act(async () => toasts()[0]!.action!.run())
    expect(typeOf(D14)).toBe('wolne')
  })

  it('zjazd → „Wolne”: „Cofnij” przywraca też zajęcia zjazdu, które zmiana typu zdjęła', async () => {
    files.set(D14, { schema: 1, date: D14, dayType: 'zjazd-stacjonarny', blocks: [CLASS] })
    await mount()
    await select(D14)
    await pick('calendar-type-wolne')
    expect(typeOf(D14)).toBe('wolne')
    expect(files.get(D14)!.blocks).toEqual([])
    await act(async () => toasts()[0]!.action!.run())
    expect(typeOf(D14)).toBe('zjazd-stacjonarny')
    expect(files.get(D14)!.blocks).toEqual([CLASS])
  })

  it('dzień zmieniony od tego czasu zostaje: „Cofnij” mówi o tym, nie przywraca', async () => {
    files.set(D14, { schema: 1, date: D14, dayType: 'regeneracyjny' })
    await mount()
    await select(D14)
    await pick('calendar-type-wolne')
    files.set(D14, { ...files.get(D14)!, dayType: 'zjazd-zdalny' })
    await act(async () => toasts()[0]!.action!.run())
    expect(typeOf(D14)).toBe('zjazd-zdalny')
    expect(toasts().map((t) => t.text)).toContain('1 dzień zmieniony od tego czasu – został')
  })
})
