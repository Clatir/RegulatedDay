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
import { regenHereKeyOf, regenMemory, resetRegenCache } from '@renderer/features/today/regenActions'
import { GONE_DAYS, PLAN_ALREADY_TEXT, PLAN_CHANGED_TEXT, cheapestSwapCached, cheapestSwapKeyOf, cheapestSwapPeek, energyOrderCached, energyOrderKey, resetEnergyOrderCache, resetSwapCache, swapBack, swapGone, swapLineText, swappedText } from '@renderer/features/today/dayActions'
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
  resetRegenCache()
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

/** In an act, until the line's search put off past the paint (T2635) has counted the day's key – a condition, no fixed delay. */
const settle = (m: DayModel) =>
  act(() =>
    vi.waitFor(() => {
      expect(cheapestSwapPeek(m, cheapestSwapKeyOf(m)).due).toBe(false)
      // The panel's other line by the warning (N3) counts after the paint too: both counted, no state update after the test.
      expect(regenMemory.peek(m, regenHereKeyOf(m)).due).toBe(false)
    })
  )

/** `node` rendered; with `m` – also until its line's search has counted `m` (`settle`). */
async function render(node: Parameters<Root['render']>[0], m?: DayModel): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
  if (m) await settle(m)
}
const sideProps = (m: DayModel, past = false) => ({ model: m, names: NAMES, routines: false, past, onSelect: () => undefined, onMove: () => undefined })
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const side = (m: DayModel, past = false) => render(createElement(SidePanel, sideProps(m, past)), past ? undefined : m)
const notes = (m: DayModel, openId: string | null = null) => render(createElement(BlockDayNotes, { model: m, names: NAMES, today: DATE, onShow: () => undefined, openId }), m)

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
    await notes(model())
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

    // Once more (the clock's next step – the line is back) – but „Analiza” moved by hand meanwhile: nothing taken back, the
    // toast says the plan changed.
    useUi.setState({ toasts: [] })
    state.file = FILE
    act(() => root!.unmount())
    await side(model({ at: '07:35' }))
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
    await notes(model(), 'e')
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toEqual([SWAPPED]))
  })

  it('T2633: nowy klucz dnia – linia trzyma ostatnią zamianę tego dnia z „Zamień” wyłączonym, aż policzy; inny dzień – bez starej', async () => {
    stub()
    await side(model())
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(false)
    // Five minutes on (another step of the clock – another key): before the search, the day's last swap, „Zamień” waiting.
    const later = model({ at: '07:35' })
    await act(async () => root!.render(createElement(SidePanel, sideProps(later))))
    expect(q('cheapest-swap-text')!.textContent).toBe(LINE)
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(true)
    await settle(later)
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(false)
    // Another day: nothing of this one's.
    const other = model({ date: '2026-10-29' })
    expect(cheapestSwapPeek(other, cheapestSwapKeyOf(other))).toEqual({ swap: null, fresh: false, due: true })
  })

  it('T2634, T2643: „Plan już jest tak ułożony” chowa tę zamianę w każdym panelu (panel bloku po panelu bocznym) i przy innym kluczu', async () => {
    stub(fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') }))
    const m = model()
    await side(m)
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(q('cheapest-swap')).toBeNull())
    act(() => root!.unmount())
    await notes(m)
    expect(q('day-warnings')).not.toBeNull()
    expect(q('cheapest-swap')).toBeNull()
    // Another key (the clock's next step) counts the same swap again: it is done – still no line (T2643).
    act(() => root!.unmount())
    await side(model({ at: '07:35' }))
    expect(q('cheapest-swap')).toBeNull()
  })

  it('T2635: szukanie odłożone za rysunek (timer) – po samym renderze z efektami jeszcze nie biegło', async () => {
    vi.useFakeTimers()
    try {
      stub()
      const search = vi.mocked(cheapestSwap)
      search.mockClear()
      await render(createElement(SidePanel, sideProps(model())))
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

  it('T2638: po zapisanej zamianie linia znika (bez tej samej propozycji z czynnym „Zamień”) i nic jej nie trzyma do policzenia nowego planu', async () => {
    const { sent } = stub()
    const m = model()
    await side(m)
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await vi.waitFor(() => expect(q('cheapest-swap')).toBeNull())
    // The plan as saved, counted at once (another key): while it is counted the swap just made is not held.
    const swapped = { ...m, ctx: { ...m.ctx, plan: m.ctx.plan.map((b) => ({ ...b, startMin: ({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') } as Record<string, number>)[b.id] ?? b.startMin })) } } as DayModel
    expect(cheapestSwapPeek(swapped, cheapestSwapKeyOf(swapped), cheapestSwapKeyOf(m)).swap).toBeNull()
    await act(async () => root!.render(createElement(SidePanel, sideProps(swapped))))
    expect(q('cheapest-swap')).toBeNull()
  })

  it('T2639: przed policzeniem nowego klucza trzymana tylko zamiana, którą ta linia pokazała, i tylko gdy oba bloki są w planie', async () => {
    stub()
    const m = model()
    await side(m)
    const shown = cheapestSwapKeyOf(m)
    // „Analiza” gone from the plan (another key): the held swap would name a block that is not there – none.
    const without = { ...m, ctx: { ...m.ctx, plan: m.ctx.plan.filter((b) => b.id !== 'e') } } as DayModel
    expect(cheapestSwapPeek(without, cheapestSwapKeyOf(without), shown)).toEqual({ swap: null, fresh: false, due: true })
    await act(async () => root!.render(createElement(SidePanel, sideProps(without))))
    expect(q('cheapest-swap')).toBeNull()
    // Both blocks there – held only for the line that showed it.
    const later = model({ at: '07:35' })
    expect(cheapestSwapPeek(later, cheapestSwapKeyOf(later), shown).swap).toMatchObject({ a: 'r', b: 'e' })
    expect(cheapestSwapPeek(later, cheapestSwapKeyOf(later), null).swap).toBeNull()
  })

  it(`T2640: zrobione zamiany po dniu (najwyżej ${GONE_DAYS} dni) – drugi dzień nie przywraca linii pierwszego`, () => {
    const m = model()
    const key = cheapestSwapKeyOf(m)!
    const swap = cheapestSwapCached(m)!
    const other = { a: 'x', b: 'y', changes: [] }
    swapGone(DATE, swap)
    swapGone('2026-10-29', other)
    expect(cheapestSwapPeek(m, key)).toEqual({ swap: null, fresh: true, due: false })
    // Fourteen other days later the first one is forgotten: its line is back.
    for (let i = 1; i <= GONE_DAYS; i++) swapGone(`2026-11-${String(i).padStart(2, '0')}`, other)
    expect(cheapestSwapPeek(m, key).swap).toMatchObject({ a: 'r', b: 'e' })
  })

  it('T2641: szukanie, które rzuca wyjątek – ostrzeżenie w konsoli, dla klucza „brak”, linia nie czeka w nieskończoność', async () => {
    stub()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const search = vi.mocked(cheapestSwap)
    search.mockClear()
    search.mockImplementationOnce(() => {
      throw new Error('zepsute')
    })
    try {
      const m = model()
      await side(m)
      expect(search).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(cheapestSwapPeek(m, cheapestSwapKeyOf(m))).toEqual({ swap: null, fresh: true, due: false })
      expect(q('cheapest-swap')).toBeNull()
      expect(q('day-warnings')).not.toBeNull()
    } finally {
      warn.mockRestore()
    }
  })

  // A slow save left held by a failing test would hold the window's queue of saves for the next ones (T517): released after each.
  const gates: Array<() => void> = []
  afterEach(() => gates.splice(0).forEach((release) => release()))

  /** The folder's `edit` held until `release` (a slow save): the edits sent so far in `sent`. */
  function slowSave() {
    const { sent, state } = stub()
    const gate: { release: () => void } = { release: () => undefined }
    const held = new Promise<void>((done) => (gate.release = done))
    gates.push(() => gate.release())
    ;(window.rd as Partial<RdApi>).edit = async (entries) => {
      sent.push(entries)
      await held
      return entries.map(() => ({ status: 'applied' as const }))
    }
    return { sent, state, gate }
  }

  it('T2643: nowy plik dnia przychodzi przed końcem zapisu – ta sama zamiana (nowy klucz) się nie pokazuje', async () => {
    const { sent, gate } = slowSave()
    const m = model()
    await side(m)
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    // Done before the save ends: the line went at the click.
    expect(q('cheapest-swap')).toBeNull()
    // The day's file changed meanwhile (a note on the class): another key, the same swap counted again – not shown.
    const noted = { ...m, ctx: { ...m.ctx, plan: m.ctx.plan.map((b) => (b.id === 'w' ? { ...b, note: 'nowa' } : b)) } } as DayModel
    expect(cheapestSwapKeyOf(noted)).not.toBe(cheapestSwapKeyOf(m))
    await act(async () => root!.render(createElement(SidePanel, sideProps(noted))))
    await settle(noted)
    expect(cheapestSwapCached(noted)).toMatchObject({ a: 'r', b: 'e' })
    expect(q('cheapest-swap')).toBeNull()
    await act(async () => gate.release())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
    expect(q('cheapest-swap')).toBeNull()
  })

  it('T2643: krok zegara (nowy klucz) w czasie wolnego zapisu – ta sama zamiana bez czynnego „Zamień”, w ogóle bez linii', async () => {
    const { sent, gate } = slowSave()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    const later = model({ at: '07:35' })
    await act(async () => root!.render(createElement(SidePanel, sideProps(later))))
    expect(q('cheapest-swap')).toBeNull()
    await settle(later)
    expect(q('cheapest-swap')).toBeNull()
    await act(async () => gate.release())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
  })

  it('T2643: udane „Cofnij” przywraca propozycję od razu (ten sam klucz dnia), bez czekania na zmianę klucza', async () => {
    const { sent, state } = stub()
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(SWAPPED))
    expect(q('cheapest-swap')).toBeNull()
    state.file = fileWith({ r: lm('11:00'), c: lm('10:00'), e: lm('08:00') })
    await act(async () => useUi.getState().toasts.find((t) => t.text === SWAPPED)!.action!.run())
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    // The plan as before the swap – the day counted as before (the same key): the line is back.
    await vi.waitFor(() => expect(q('cheapest-swap-text')?.textContent).toBe(LINE))
    expect((q('cheapest-swap-apply') as HTMLButtonElement).disabled).toBe(false)
  })

  it('T2643: zapis odrzucony (konflikt) – zamiana nie jest zrobiona, linia wraca', async () => {
    const { sent } = stub()
    ;(window.rd as Partial<RdApi>).edit = async (entries) => {
      sent.push(entries)
      return entries.map(() => ({ status: 'conflict' as const }))
    }
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await vi.waitFor(() => expect(q('cheapest-swap-text')?.textContent).toBe(LINE))
  })

  it('T2870: blok przestawiany przez zamianę przesunięty w międzyczasie (inny komputer) – nic nie zapisane, „Plan zmienił się…”, linia wraca', async () => {
    // „Inne” moved to 09:30 elsewhere: the starts counted from 09:00 would write over it.
    const { sent } = stub(fileWith({ c: lm('09:30') }))
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(PLAN_CHANGED_TEXT))
    expect(sent).toEqual([])
    await vi.waitFor(() => expect(q('cheapest-swap-text')?.textContent).toBe(LINE))
  })

  it('T2878: dwie zrobione zamiany tego dnia – druga nie odsłania pierwszej; cofnięcie jednej zdejmuje tylko jej znak', () => {
    const m = model()
    const key = cheapestSwapKeyOf(m)!
    const swap = cheapestSwapCached(m)!
    const other = { a: 'c', b: 'e', changes: [] }
    swapGone(DATE, swap)
    swapGone(DATE, other)
    expect(cheapestSwapPeek(m, key).swap).toBeNull()
    swapBack(DATE, other)
    expect(cheapestSwapPeek(m, key).swap).toBeNull()
    swapBack(DATE, swap)
    expect(cheapestSwapPeek(m, key).swap).toMatchObject({ a: 'r', b: 'e' })
  })

  it('T2878: w przerwie stanął w międzyczasie nowy blok (inny komputer) – „Zamień” nic nie zapisuje, „Plan zmienił się…”', async () => {
    const added = { ...FILE, blocks: [...(FILE.blocks as unknown[]), blockJson(block({ id: 'nowy', cat: 'inne', at: '09:30', min: 30, origin: 'user' }))] }
    const { sent } = stub(added)
    await side(model())
    await act(async () => void q('cheapest-swap-apply')!.click())
    await vi.waitFor(() => expect(useUi.getState().toasts.map((t) => t.text)).toContain(PLAN_CHANGED_TEXT))
    expect(sent).toEqual([])
  })
})
