// @vitest-environment jsdom
/**
 * Energia na żywo w „Tygodniu” i „3 dniach” (N19, T2582): blok trzymany nad kolumną mówi pod swoim pasmem, jak zmieni się najniższa energia DNIA, NA KTÓRY
 * by stanął – w obrębie dnia i na inny dzień – zanim go puścisz; Esc i puszczenie zdejmują podpis, niczego nie zapisano; dzień bez check-inu (każdy dzień
 * tych testów jest przyszły) z dopiskiem „przyjęte” (D593).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import type { PlanBlock } from '@shared/model/plan'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { WEEK_PPM } from '@renderer/features/week/weekLayout'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block } from '../unit/engine/dsl'

// Far ahead of the real clock: every day of the test is a day to come, with no check-in of its own (the assumed one – D593).
const TODAY = '2098-12-31'
const MON = '2099-01-05'
const TUE = '2099-01-06'
const DATES = [MON, TUE]
const COL_TOP = 100
const colLeft = (i: number) => 60 + i * 100
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), categoryId: 'analiza', ...o })
const fileOf = (date: string, plan: readonly PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })

const data = useData.getState()
const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
let root: Root | null = null
let host: HTMLElement | null = null
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const
beforeEach(() => {
  for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
})
afterEach(() => {
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
  if (scrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollIntoView)
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'rd')
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

/** The folder as the window sees it: the day files, and the edits sent (none is expected – nothing is written before the drop). */
function stub(files: Record<string, RawRecord | null>) {
  const sent: EditEntry[][] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates: readonly string[]) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
    edit: async (entries) => {
      sent.push(entries)
      return entries.map(() => ({ status: 'applied' as const }))
    },
    planPushed: async () => undefined,
    dataView: async () => ({ today: TODAY }) as DataView
  }
  Object.defineProperty(window, 'rd', { value: rd, configurable: true, writable: true })
  useData.setState({ view: { status: 'open', today: TODAY, allDay: [], computers: [], attachments: [] } as unknown as DataView })
  return { sent }
}

const named = { categoryId: 'analiza', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const hb = (id: string, startMin: number, endMin: number): HorizonBlock => ({ id, named, categoryId: 'analiza', startMin, endMin, state: 'planned', outsidePlan: false, background: false, movable: true })
const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({ date, when: 'future', read: 'full', dayType: null, templateId: null, frozen: false, blocks, wakeMin: null, bedtimeMin: null, boundary: null, extensionMin: 0, regen: null, studyMin: 0, sessions: { clean: 0, extended: 0, outsidePlan: 0 }, energy: null, budget: null })
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
function pointer(target: EventTarget, type: string, x: number, y: number, o: { buttons?: number; ctrlKey?: boolean } = {}): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: o.buttons ?? 1, ctrlKey: o.ctrlKey === true })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))

/** The columns on the screen with the block `grab` of Monday at its place (the day's blocks are those of its file). */
async function mountWeek(grab: { id: string; startMin: number }, list: HorizonDay[]) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-testid') ?? ''
    if (id === 'week-body') return rect(60, COL_TOP, 200, 2000)
    const col = DATES.findIndex((d) => id === `week-col-${d}`)
    if (col >= 0) return rect(colLeft(col), COL_TOP, 96, 2000)
    if (id === `week-block-${MON}-${grab.id}`) return rect(colLeft(0), COL_TOP + (grab.startMin - 360) * WEEK_PPM, 96, 60 * WEEK_PPM)
    return rect(0, 0, 0, 0)
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined })))
}
function hold(grab: { id: string; startMin: number }, col: number, startMin: number) {
  pointer(q(`week-block-${MON}-${grab.id}`)!, 'pointerdown', colLeft(0) + 20, COL_TOP + (grab.startMin - 360) * WEEK_PPM + 8)
  pointer(window, 'pointermove', colLeft(col) + 20, COL_TOP + (startMin - 360) * WEEK_PPM + 8)
}
/** The caption comes once the day is read and counted and the trial has rested (each try lets React draw first). */
const said = () =>
  vi.waitFor(
    async () => {
      await act(async () => undefined)
      expect(q('week-energy-trial')).not.toBeNull()
    },
    { timeout: 5000 }
  )

describe('N19 – podpis pod pasmem bloku trzymanego nad kolumną', () => {
  // Monday: an hour of „Analiza” at 12:00 and another at 18:00; Tuesday: nothing or a long block. A cost a hour takes the pool down while it runs.
  const mon = [flex('x', '12:00', 60), flex('y', '18:00', 60)]
  const grab = { id: 'x', startMin: 720 }

  it('w obrębie dnia: podpis pod pasmem miejsca, przed puszczeniem; Esc go zdejmuje, nic nie zapisane', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    hold(grab, 0, 1020)
    await act(async () => undefined)
    await said()
    const c = q('week-energy-trial')!
    expect(c.textContent).toMatch(/najniższa energia \d+ → \d+ \([GEBC]\) · przyjęte/)
    expect(c.getAttribute('data-date')).toBe(MON)
    expect(q(`week-col-${MON}`)!.contains(c)).toBe(true)
    expect(s.sent).toEqual([])
    escape()
    expect(q('week-energy-trial')).toBeNull()
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (1020 - 360) * WEEK_PPM + 8, { buttons: 0 })
    expect(s.sent).toEqual([])
  })

  it('na inny dzień: podpis stoi w kolumnie dnia docelowego i liczy ten dzień z blokiem; Esc – nic nie zapisane', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, [flex('t', '14:00', 120)]) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [hb('t', 840, 960)])])
    hold(grab, 1, 780)
    await said()
    const c = q('week-energy-trial')!
    expect(c.getAttribute('data-date')).toBe(TUE)
    expect(q(`week-col-${TUE}`)!.contains(c)).toBe(true)
    expect(s.sent).toEqual([])
    escape()
    expect(q('week-energy-trial')).toBeNull()
    expect(s.sent).toEqual([])
  })
})
