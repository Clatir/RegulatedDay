// @vitest-environment jsdom
/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626) in the window: by the warning of energy at the reserve the side panel and the
 * block's panel say „Najtańsza zamiana: A ↔ B – najniższa energia dnia 13 → 24” with „Zamień”; „Zamień” writes the new starts
 * as one edit of the day's file (no line in the bar, D229) and says „Zamieniono: A ↔ B” with „Cofnij”, which puts every moved
 * block back while the file stands as the swap left it (blocks of an unchecked calendar among them – said, D428); a plan already
 * so – the note, and the line goes until the day changes; the search runs again only when the day changes (also a routine's cost).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { cheapestSwap, energyOrderVariant, lowestEnergy } from '@shared/engine/energyOrder'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { BlockDayNotes } from '@renderer/features/today/DayNotes'
import { SidePanel } from '@renderer/features/today/TodayPage'
import { CheapestSwapLine } from '@renderer/features/today/CheapestSwap'
import { PLAN_ALREADY_TEXT, PLAN_CHANGED_TEXT, cheapestSwapCached, cheapestSwapKeyOf, cheapestSwapPeek, energyOrderCached, energyOrderKey, resetEnergyOrderCache, resetSwapCache, swapLineText, swappedText } from '@renderer/features/today/dayActions'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { NO_MEMORY, useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// A pass-through spy: how many times the window searches for the swap.
vi.mock('@shared/engine/energyOrder', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energyOrder')>()
  return { ...m, cheapestSwap: vi.fn(m.cheapestSwap), energyOrderVariant: vi.fn(m.energyOrderVariant), lowestEnergy: vi.fn(m.lowestEnergy) }
})

const DATE = '2026-10-28'
const FULL: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }

/** The engine's example (`cheapest-swap.test.ts`): a nap 08:00, „Inne” 09:00, „Analiza” 2 h before the class 12:00–22:00. */
const PLAN: PlanBlock[] = [
  block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '08:00', min: 60, origin: 'user' }),
  block({ id: 'c', cat: 'inne', at: '09:00', min: 60, origin: 'user' }),
  block({ id: 'e', cat: 'analiza', at: '10:00', min: 120, origin: 'user' }),
  block({ id: 'w', cat: 'zajecia-zdalne', at: '12:00', min: 600, fixed: true, origin: 'user' })
]
const FILE: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
const settings = new Scenario({ date: DATE, plan: [] }).settings
const NAMES = { rd: rdFrom({}), settings, routines: [], requests: [] }
const LINE = 'Najtańsza zamiana: Leżenie, drzemka ↔ Analiza – najniższa energia dnia 13 → 24'
const SWAPPED = 'Zamieniono: Leżenie, drzemka ↔ Analiza'

/** The day (`date`, by default DATE) counted at `at` (the class `classMin` long), as the window has it. */
function model(o: { at?: string; classMin?: number; date?: string } = {}): DayModel {
  const date = o.date ?? DATE
  const plan = PLAN.map((b) => (b.id === 'w' ? { ...b, durationMin: o.classMin ?? 600 } : b))
  const s = new Scenario({ date, plan, wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20 } }).observe('06:30', null)
  s.checkin('07:00', FULL)
  const ctx = s.contextAt(s.at(o.at ?? '07:30'))
  const state = computeDay(ctx)
  const file = { ...FILE, date }
  return { date, ctx, state, energy: computeEnergy(ctx, state), dayFile: dayFileFrom(file, date), data: { dayFile: file } } as unknown as DayModel
}

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
const data = useData.getState()
beforeEach(() => {
  useData.setState({ view: { today: DATE, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'today', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  resetSwapCache()
  resetEnergyOrderCache()
  useCalendarFilter.setState({ hidden: [], revealed: null })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
  useData.setState(data, true)
})

/** The search the line puts off past the paint (T2635): its timer run, in an act. */
const flushSearch = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

async function render(node: Parameters<Root['render']>[0], flush = true): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
  if (flush) await flushSearch()
}
const sideProps = (m: DayModel, past = false) => ({ model: m, names: NAMES, routines: false, past, onSelect: () => undefined, onMove: () => undefined })
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const side = (m: DayModel, past = false) => render(createElement(SidePanel, sideProps(m, past)))

/** The data folder as the window talks to it: the day's file now, the edits sent (each applied to it), the bar told nothing. */
function stub(file: RawRecord | null = FILE) {
  const sent: EditEntry[][] = []
  const state = { file }
  const bar = vi.fn(async () => undefined)
  const rd: Partial<RdApi> = {
    dayFiles: async () => ({ [DATE]: state.file }),
    edit: async (entries) => {
      sent.push(entries)
      return entries.map(() => ({ status: 'applied' as const }))
    },
    dataView: async () => ({ today: DATE }) as DataView,
    planArranged: bar,
    planPushed: bar
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  return { sent, state, bar }
}
/** The day's file with `starts` (logical minutes by id) laid on, as an edit would leave it. */
const fileWith = (starts: Record<string, number>): RawRecord => ({ ...FILE, blocks: (FILE.blocks as Array<Record<string, unknown>>).map((b) => (starts[b.id as string] != null ? { ...b, startMin: starts[b.id as string] } : b)) })

describe('„Najtańsza zamiana” w oknie (N22)', () => {
  it('słowa linii i dymka (T2624)', () => {
    expect(swapLineText('Leżenie, drzemka', 'Analiza', { before: 13, after: 24 })).toBe(LINE)
    expect(swappedText('Leżenie, drzemka', 'Analiza')).toBe(SWAPPED)
  })

  it('panel boczny: przy ostrzeżeniu energii jedna linia z „Zamień” – nazwy bloków, nigdy id', async () => {
    stub()
    await side(model())
    const warnings = q('day-warnings')!
    expect(warnings.textContent).toContain('Prognoza energii na poziomie rezerwy')
    expect(warnings.querySelectorAll('[data-testid="cheapest-swap"]')).toHaveLength(1)
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    expect(q('cheapest-swap-apply')!.textContent).toBe('Zamień')
  })

  it('panel bloku (BlockDayNotes) ma tę samą linię; dzień miniony i dzień bez ostrzeżenia – bez niej', async () => {
    stub()
    await render(createElement(BlockDayNotes, { model: model(), names: NAMES, today: DATE, onShow: () => undefined }))
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    act(() => root!.unmount())
    await side(model(), true)
    expect(q('day-warnings')).not.toBeNull()
    expect(q('cheapest-swap')).toBeNull()
    act(() => root!.unmount())
    // The class to 17:00: the lowest energy 43, no warning.
    await side(model({ classMin: 300 }))
    expect(q('day-warnings')).toBeNull()
    expect(q('cheapest-swap')).toBeNull()
  })

  it('„Zamień” zapisuje nowe starty jedną edycją pliku dnia, bez paska (D229), i mówi „Zamieniono” z „Cofnij”', async () => {
    const { sent, bar } = stub()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(DATE))
    expect(entry.edits.map((e) => [e.path.join('.'), e.base, e.value])).toEqual([
      ['blocks.#r.startMin', lm('08:00'), lm('11:00')],
      ['blocks.#c.startMin', lm('09:00'), lm('10:00')],
      ['blocks.#e.startMin', lm('10:00'), lm('08:00')]
    ])
    expect(bar).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
    expect(useUi.getState().toasts.find((t) => t.text === SWAPPED)!.action?.label).toBe('Cofnij')
  })

  it('„Cofnij” przywraca wszystkie przestawione bloki (oba i „Inne” za pierwszym); blok zmieniony w międzyczasie – zostaje, dymek to mówi', async () => {
    const { sent, state } = stub()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
    const swapped = fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') })
    state.file = swapped
    await act(async () => useUi.getState().toasts.find((t) => t.text === SWAPPED)!.action!.run())
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]![0]!.edits.map((e) => [e.path.join('.'), e.base, e.value])).toEqual([
      ['blocks.#r.startMin', lm('11:00'), lm('08:00')],
      ['blocks.#c.startMin', lm('10:00'), lm('09:00')],
      ['blocks.#e.startMin', lm('08:00'), lm('10:00')]
    ])

    // Once more – but „Analiza” moved by hand meanwhile: nothing taken back, the toast says the plan changed.
    useUi.setState({ toasts: [] })
    state.file = FILE
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
    state.file = fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:30') })
    const before = sent.length
    await act(async () => useUi.getState().toasts.find((t) => t.text === SWAPPED)!.action!.run())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(PLAN_CHANGED_TEXT))
    expect(sent.slice(before).flat().filter((e) => e.edits.length > 0)).toEqual([])
  })

  it('T2624: dwa liczenia dnia bez zmiany planu (sam zegar) nie szukają od nowa; inny plan – szuka', () => {
    const search = vi.mocked(cheapestSwap)
    search.mockClear()
    const first = cheapestSwapCached(model({ at: '07:30' }))
    expect(first).toMatchObject({ a: 'r', b: 'e', before: 13, after: 24 })
    expect(cheapestSwapCached(model({ at: '07:31' }))).toBe(first)
    expect(search).toHaveBeenCalledTimes(1)
    cheapestSwapCached(model({ classMin: 660 }))
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('T2632: szukanie nie biegnie w renderze – linia przychodzi po narysowaniu (efekt); policzona – od razu', async () => {
    stub()
    const search = vi.mocked(cheapestSwap)
    search.mockClear()
    // A render without effects (the server's): the line is not there yet, and nothing was searched.
    const props = { model: model(), names: NAMES, routines: false, past: false, onSelect: () => undefined, onMove: () => undefined }
    expect(renderToStaticMarkup(createElement(SidePanel, props))).not.toContain('cheapest-swap')
    expect(search).not.toHaveBeenCalled()
    await side(model())
    expect(search).toHaveBeenCalledTimes(1)
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    // Counted for this day: the next render has it at once.
    expect(renderToStaticMarkup(createElement(SidePanel, props))).toContain('cheapest-swap-text')
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('T2627: zmiana kosztu rutyny (D512) zmienia klucz – zamiana i „Ułóż pod energię” liczą od nowa', () => {
    const m = model()
    // The same day with a cost of a routine changed in „Rutyny”: neither the plan nor the log changes.
    const costed = { ...m, ctx: { ...m.ctx, routineCosts: { poranna: { head: 2, emotions: 0, senses: 0, body: 0 } } } } as DayModel
    expect(energyOrderKey(costed)).not.toBe(energyOrderKey(m))
    const swap = vi.mocked(cheapestSwap)
    const order = vi.mocked(energyOrderVariant)
    swap.mockClear()
    order.mockClear()
    cheapestSwapCached(m)
    cheapestSwapCached(costed)
    expect(swap).toHaveBeenCalledTimes(2)
    energyOrderCached(m, NAMES)
    energyOrderCached(costed, NAMES)
    expect(order).toHaveBeenCalledTimes(2)
  })

  it('T2628: „Zamień” na planie już tak ułożonym – nic nie zapisane, dymek „Plan już jest tak ułożony.” i linia znika', async () => {
    // Another computer swapped them already: the file in its turn holds the new starts.
    const { sent } = stub(fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') }))
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toEqual([PLAN_ALREADY_TEXT]))
    expect(sent).toEqual([])
    expect(q('cheapest-swap')).toBeNull()
    expect(q('day-warnings')).not.toBeNull()
  })

  /** „Analiza” (or the category `cat`) in the calendar „Praca”, unchecked. */
  const hide = (cat = 'analiza') => {
    useData.setState({ rd: rdFrom({ schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }, { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }], categories: { [cat]: { calendar: 'praca' } } }) })
    useCalendarFilter.setState({ hidden: ['praca'] })
  }

  it('T2630, T2637 (D428): jeden z pary z odznaczonego kalendarza – „(1 ukryty)” przy parze, bez „Przesunięto”', async () => {
    hide()
    stub()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    const text = `${SWAPPED} (1 ukryty)`
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toEqual([text]))
    expect(useUi.getState().toasts[0]!.action?.label).toBe('Cofnij')
  })

  it('T2637: ukryty inny przesunięty blok („Inne” za pierwszym) – „Przesunięto 1 blok (w tym 1 ukryty)”, liczone bez pary', async () => {
    hide('inne')
    stub()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toEqual([`${SWAPPED} · Przesunięto 1 blok (w tym 1 ukryty)`]))
  })

  it('T2630: blok z otwartym panelem (D427) nie liczy się jako ukryty', async () => {
    hide()
    stub()
    await render(createElement(BlockDayNotes, { model: model(), names: NAMES, today: DATE, onShow: () => undefined, openId: 'e' }))
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toEqual([SWAPPED]))
  })

  it('T2633: nowy klucz dnia – linia trzyma ostatnią zamianę tego dnia z „Zamień” wyłączonym, aż policzy; inny dzień – bez starej', async () => {
    stub()
    await side(model())
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(false)
    // Five minutes on (another step of the clock – another key): before the search, the day's last swap, „Zamień” waiting.
    await act(async () => root!.render(createElement(SidePanel, sideProps(model({ at: '07:35' })))))
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(true)
    await flushSearch()
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(false)
    // Another day: nothing of this one's.
    const other = model({ date: '2026-10-29' })
    expect(cheapestSwapPeek(other, cheapestSwapKeyOf(other))).toEqual({ swap: null, fresh: false, due: true })
  })

  it('T2634: „Plan już jest tak ułożony” chowa linię dnia także w innym panelu (panel bloku po panelu bocznym), do zmiany klucza', async () => {
    stub(fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') }))
    const m = model()
    await side(m)
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(q('cheapest-swap')).toBeNull())
    act(() => root!.unmount())
    await render(createElement(BlockDayNotes, { model: m, names: NAMES, today: DATE, onShow: () => undefined }))
    expect(q('day-warnings')).not.toBeNull()
    expect(q('cheapest-swap')).toBeNull()
    // Another key (the clock's next step): the line again.
    act(() => root!.unmount())
    await side(model({ at: '07:35' }))
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
  })

  it('T2635: szukanie odłożone za rysunek (timer) – po samym renderze z efektami jeszcze nie biegło', async () => {
    vi.useFakeTimers()
    try {
      stub()
      const search = vi.mocked(cheapestSwap)
      search.mockClear()
      await render(createElement(SidePanel, sideProps(model())), false)
      expect(search).not.toHaveBeenCalled()
      expect(q('cheapest-swap')).toBeNull()
      await act(async () => void vi.runAllTimers())
      expect(search).toHaveBeenCalledTimes(1)
      expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('T2636: klucz liczony raz na dzień policzony (render linii z pamięci – jedno liczenie klucza)', () => {
    const m = model()
    cheapestSwapCached(m)
    const key = vi.mocked(lowestEnergy)
    key.mockClear()
    // `energyOrderKey` asks the lowest energy once: so many keys, so many asks.
    expect(renderToStaticMarkup(createElement('ul', null, createElement(CheapestSwapLine, { model: m, names: NAMES, past: false })))).toContain('cheapest-swap-text')
    expect(key).toHaveBeenCalledTimes(1)
  })
})
