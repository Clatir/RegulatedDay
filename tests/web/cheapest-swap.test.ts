// @vitest-environment jsdom
/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626) in the window: by the warning of energy at the reserve the side panel and the
 * block's panel say „Najtańsza zamiana: A ↔ B – najniższa energia dnia 13 → 24” with „Zamień”; „Zamień” writes the new starts
 * as one edit of the day's file (no line in the bar, D229) and says „Zamieniono: A ↔ B” with „Cofnij”, which puts both
 * blocks back while the file stands as the swap left it; the search runs again only when the day changes.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { cheapestSwap } from '@shared/engine/energyOrder'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { BlockDayNotes } from '@renderer/features/today/DayNotes'
import { SidePanel } from '@renderer/features/today/TodayPage'
import { PLAN_CHANGED_TEXT, cheapestSwapCached, resetSwapCache, swapLineText, swappedText } from '@renderer/features/today/dayActions'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { NO_MEMORY, useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// A pass-through spy: how many times the window searches for the swap.
vi.mock('@shared/engine/energyOrder', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energyOrder')>()
  return { ...m, cheapestSwap: vi.fn(m.cheapestSwap) }
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

/** The day counted at `at` (the class `classMin` long), as the window has it. */
function model(o: { at?: string; classMin?: number } = {}): DayModel {
  const plan = PLAN.map((b) => (b.id === 'w' ? { ...b, durationMin: o.classMin ?? 600 } : b))
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20 } }).observe('06:30', null)
  s.checkin('07:00', FULL)
  const ctx = s.contextAt(s.at(o.at ?? '07:30'))
  const state = computeDay(ctx)
  return { date: DATE, ctx, state, energy: computeEnergy(ctx, state), dayFile: dayFileFrom(FILE, DATE), data: { dayFile: FILE } } as unknown as DayModel
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
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
  useData.setState(data, true)
})

async function render(node: Parameters<Root['render']>[0]): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const side = (m: DayModel, past = false) => render(createElement(SidePanel, { model: m, names: NAMES, routines: false, past, onSelect: () => undefined, onMove: () => undefined }))

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

  it('„Cofnij” przywraca oba bloki (i blok między nimi); blok zmieniony w międzyczasie – zostaje, dymek to mówi', async () => {
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
})
