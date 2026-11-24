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
import { setAt } from '@shared/data/merge'
import { dayPlan } from '@shared/engine/createDay'
import { dayFileFrom } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import type { PlanBlock } from '@shared/model/plan'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { moveWeekBlock } from '@renderer/features/week/weekMove'
import * as trialModule from '@shared/engine/trialEnergy'
import { DAY_FRESH_MS, weekTrialChange } from '@renderer/features/week/WeekTrial'
import { TRIAL_DELAY_MS } from '@renderer/features/plan/trialEnergy'
import { readDay } from '@renderer/store/day'
import { WEEK_PPM } from '@renderer/features/week/weekLayout'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

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
  // The clock of the test: the timers and the date (the grid's days are kept by the half minute of the date) – nothing waits in real time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-24T10:00:10Z'))
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
  vi.useRealTimers()
})

/**
 * The folder as the window sees it: the day files (the edits sent apply to them, in their order – `hold`: an edit that never answers, the write
 * under way), the edits sent (none before the drop) and the days read (`reads` – each `dayData` is one count of a day).
 */
function stub(files: Record<string, RawRecord | null>, o: { hold?: boolean } = {}) {
  const sent: EditEntry[][] = []
  const reads: string[] = []
  const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
  const rd: Partial<RdApi> = {
    dayFiles: async (dates: readonly string[]) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => {
      reads.push(date)
      return { date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false } as DayData
    },
    edit: async (entries) => {
      sent.push(entries)
      if (o.hold) return new Promise(() => undefined)
      return entries.map((e) => {
        const date = dateOf(e.rel)
        if (e.rel.startsWith('days/')) files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status: 'applied' as const }
      })
    },
    planPushed: async () => undefined,
    dataView: async () => ({ today: TODAY }) as DataView
  }
  Object.defineProperty(window, 'rd', { value: rd, configurable: true, writable: true })
  useData.setState({ view: { status: 'open', today: TODAY, allDay: [], computers: [], attachments: [] } as unknown as DataView })
  return { sent, reads, files }
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
/** The clock goes on by `ms`: the timers due run, the promises they wait for settle (each step lets React draw). */
const rest = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
/** The caption comes once the pointer has rested: the days read and counted (one rest of the hook is all it waits for). */
const said = async () => {
  await rest(TRIAL_DELAY_MS)
  expect(q('week-energy-trial')).not.toBeNull()
}

describe('N19 – podpis pod pasmem bloku trzymanego nad kolumną', () => {
  // Monday: an hour of „Analiza” at 12:00 and another at 18:00; Tuesday: nothing or a long block. A cost a hour takes the pool down while it runs.
  const mon = [flex('x', '12:00', 60), flex('y', '18:00', 60)]
  const grab = { id: 'x', startMin: 720 }

  it('w obrębie dnia: podpis pod pasmem miejsca, przed puszczeniem; Esc go zdejmuje, nic nie zapisane', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    hold(grab, 0, 1020)
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

  it('N19 (4): puszczenie, które nic nie zapisze (blok na własnym miejscu) – bez podpisu i bez liczenia dni', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    // The block pulled away and put back at its own start with no pause: the drop stays (dropStays).
    hold(grab, 0, 1020)
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8)
    await rest(250)
    expect(q('week-drop')).not.toBeNull()
    expect(q('week-energy-trial')).toBeNull()
    expect(s.reads).toEqual([])
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8, { buttons: 0 })
  })

  it('N19 (3): przejazd przez kolumny bez zatrzymania nie liczy żadnego dnia; zatrzymanie – jedno policzenie, kolejne miejsce tego samego dnia – z pamięci', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    pointer(q(`week-block-${MON}-x`)!, 'pointerdown', colLeft(0) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8)
    // Five moves over the columns, one after another with no pause: nothing is counted on the way.
    for (const [col, at] of [[1, 780], [0, 1020], [1, 800], [0, 1000], [1, 840]] as const) pointer(window, 'pointermove', colLeft(col) + 20, COL_TOP + (at - 360) * WEEK_PPM + 8)
    await act(async () => undefined)
    expect(s.reads).toEqual([])
    expect(q('week-energy-trial')).toBeNull()
    // Rested over Monday (the day of the block): one count – the block's day and the target are the same.
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (1020 - 360) * WEEK_PPM + 8)
    await said()
    expect(s.reads).toEqual([MON])
    // Another place of the same day and back: the day counted is kept (no second count).
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (1000 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (1020 - 360) * WEEK_PPM + 8)
    await said()
    expect(s.reads).toEqual([MON])
    escape()
  })

  it('N19 (1): na inny dzień z blokiem zakotwiczonym – próba to dzień po upuszczeniu: ten sam plan, który zapisuje upuszczenie (blok z followerem, rozsunięty trzeci)', async () => {
    const x = flex('x', '12:00', 60)
    const y = flex('y', '12:00', 30, { startMin: null, anchor: 'x' })
    const t = flex('t', '13:00', 60)
    const files: Record<string, RawRecord | null> = { [MON]: fileOf(MON, [x, y]), [TUE]: fileOf(TUE, [t]) }
    stub(files)
    const today = logicalDayOf(Date.now())
    const [source, there] = [await readDay(MON), await readDay(TUE)]
    const drop = { id: 'x', from: MON, to: TUE, startMin: lm('13:00'), copy: false }
    const trial = weekTrialChange(source!, there!, drop, today)!
    // (The day's own sessions stand in its plan too – the three blocks of the test are compared.)
    const mine = (plan: ReadonlyArray<{ id: string; startMin: number | null; anchor: string | null }>) => plan.filter((b) => ['t', 'x', 'y'].includes(b.id))
    const shapeOf = (plan: ReadonlyArray<{ id: string; startMin: number | null; anchor: string | null }>) => mine(plan).map((b) => ({ id: b.id, startMin: b.startMin, anchor: b.anchor })).sort((a, b) => a.id.localeCompare(b.id))
    // The block and the one anchored to it both stand on Tuesday; the third is pushed after them.
    expect(mine(trial.plan!).map((b) => b.id).sort()).toEqual(['t', 'x', 'y'])
    const written = await moveWeekBlock({ blockId: 'x', name: 'x', from: MON, to: TUE, startMin: drop.startMin })
    expect(written.status).toBe('saved')
    const after = await readDay(TUE)
    expect(shapeOf(trial.plan!)).toEqual(shapeOf(dayPlan(after!.ctx.snapshot, dayFileFrom(files[TUE]!, TUE))))
    expect(shapeOf(trial.plan!)).toEqual(shapeOf(after!.ctx.plan))
  })

  it('N19 (3): od spoczynku nad kolumną do podpisu – jedno opóźnienie haka i liczenie; dni już policzone przez siatkę – zwykłe opóźnienie haka, nie liczenie przy wejściu', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, [flex('t', '14:00', 120)]) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [hb('t', 840, 960)])])
    hold(grab, 0, 1020)
    // Not yet one delay: nothing; then the days are read and counted and the first caption stands at once (no second delay on top of the first).
    await rest(TRIAL_DELAY_MS - 1)
    expect(q('week-energy-trial')).toBeNull()
    await rest(1)
    expect(q('week-energy-trial')).not.toBeNull()
    expect(s.reads).toEqual([MON])
    // Another column and its day (the block's own day is counted already, the target is read now), then back over the first one: both its days are
    // counted by the grid – no read, but the count of the change waits for the rest of the pointer as ever.
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + (780 - 360) * WEEK_PPM + 8)
    await said()
    expect(s.reads).toEqual([MON, TUE])
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (1000 - 360) * WEEK_PPM + 8)
    await rest(0)
    expect(q('week-energy-trial')).toBeNull()
    await rest(TRIAL_DELAY_MS)
    expect(q('week-energy-trial')).not.toBeNull()
    expect(q(`week-col-${MON}`)!.contains(q('week-energy-trial'))).toBe(true)
    expect(s.reads).toEqual([MON, TUE])
    escape()
  })

  it('N19 (6): dni liczone dla próby odświeżają się co pół minuty (jak `useDay`), dopóki blok jest trzymany', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    hold(grab, 0, 1020)
    await said()
    expect(s.reads).toEqual([MON])
    // The tick draws the window again (its effect asks for the days anew), then the rest of the pointer passes.
    await rest(DAY_FRESH_MS)
    await rest(TRIAL_DELAY_MS)
    expect(s.reads).toEqual([MON, MON])
    expect(q('week-energy-trial')).not.toBeNull()
    escape()
  })

  it('N19 (2): przejazd przez kolumny z dniami w pamięci siatki nic nie liczy (ani dni, ani próby); spoczynek – jedno liczenie', async () => {
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, [flex('t', '14:00', 120)]) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [hb('t', 840, 960)])])
    hold(grab, 0, 1020)
    await said()
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + (780 - 360) * WEEK_PPM + 8)
    await said()
    expect(s.reads).toEqual([MON, TUE])
    const counted = vi.spyOn(trialModule, 'trialLowest')
    try {
      // Seven entries into the columns, one after another with no pause: the days are in the grid's memory – nothing is read, nothing counted.
      for (const [col, at] of [[0, 1000], [1, 800], [0, 1010], [1, 820], [0, 1020], [1, 840], [0, 1030]] as const) pointer(window, 'pointermove', colLeft(col) + 20, COL_TOP + (at - 360) * WEEK_PPM + 8)
      await act(async () => undefined)
      expect(counted).not.toHaveBeenCalled()
      expect(s.reads).toEqual([MON, TUE])
      await rest(TRIAL_DELAY_MS)
      expect(counted).toHaveBeenCalledTimes(1)
      expect(q('week-energy-trial')).not.toBeNull()
    } finally {
      counted.mockRestore()
    }
    escape()
  })

  it('N19 (4): zegar okna przechodzi 04:00 w trakcie trzymania – dzień, nad którym stoi blok, jest już miniony: podpis znika', async () => {
    stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    hold(grab, 0, 1020)
    await said()
    // The window's today is the next day now: Monday is history, a drop there is refused.
    act(() => useData.setState({ view: { ...useData.getState().view!, today: TUE } }))
    expect(q('week-energy-trial')).toBeNull()
    await rest(TRIAL_DELAY_MS * 3)
    expect(q('week-energy-trial')).toBeNull()
    escape()
  })

  describe('okno kosztu kafelka w kolumnie: miejsce na linię energii tylko przy włączonym module', () => {
    const withCost = (): HorizonBlock => ({ ...hb('x', 720, 780), cost: { costs: { head: 3, emotions: 1, senses: 1, body: 0 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true } })
    const energy = (on: boolean) => {
      const { rd } = useData.getState()
      useData.setState({ rd: { ...rd, general: { ...rd.general, modules: { ...rd.general.modules, energy: on } } } })
    }
    const open = async () => {
      stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
      await mountWeek(grab, [day(MON, [withCost()]), day(TUE, [])])
      act(() => void q(`week-block-${MON}-x-cost`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
      expect(document.body.querySelector('[data-testid="cost-pop"]')).not.toBeNull()
    }

    it('moduł włączony: okno ma miejsce na linię', async () => {
      energy(true)
      await open()
      expect(document.body.querySelector('[data-testid="cost-pop-energy-slot"]')).not.toBeNull()
    })

    it('moduł wyłączony: okno bez linii i bez miejsca na nią', async () => {
      energy(false)
      await open()
      expect(document.body.querySelector('[data-testid="cost-pop-energy-slot"]')).toBeNull()
    })

    it('moduł wyłączony: trzymany blok nie czyta ani nie liczy dni, bez podpisu', async () => {
      energy(false)
      const s = stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) })
      await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
      hold(grab, 0, 1020)
      await rest(TRIAL_DELAY_MS * 3)
      expect(q('week-drop')).not.toBeNull()
      expect(q('week-energy-trial')).toBeNull()
      expect(s.reads).toEqual([])
      escape()
    })
  })

  // Last: its write never answers – the queue of the window stays held.
  it('N19 (2): po puszczeniu, gdy zapis jeszcze trwa, podpis znika (dzień ma już zmianę – liczony drugi raz dałby podwójną); pasmo stoi do końca zapisu', async () => {
    stub({ [MON]: fileOf(MON, mon), [TUE]: fileOf(TUE, []) }, { hold: true })
    await mountWeek(grab, [day(MON, [hb('x', 720, 780), hb('y', 1080, 1140)]), day(TUE, [])])
    hold(grab, 0, 1020)
    await said()
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (1020 - 360) * WEEK_PPM + 8, { buttons: 0 })
    await act(async () => undefined)
    expect(q('week-energy-trial')).toBeNull()
    // The band waits for the write (it never answers here) – and no caption comes back with the day counted again.
    expect(q('week-drop')).not.toBeNull()
    await rest(250)
    expect(q('week-energy-trial')).toBeNull()
  })
})
