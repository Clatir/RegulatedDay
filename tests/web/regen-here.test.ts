// @vitest-environment jsdom
/**
 * „Wstaw regenerację tutaj” (N3, D599, T2647–T2649) in the window: by the warning of energy at the reserve the side panel and the
 * block's panel say „Leżenie, drzemka 15 min przed Analiza · głowa 12 → 14” with „Wstaw regenerację tutaj”; the button writes the
 * block and the blocks it pushes apart as one edit of the day's file (the bar gets the marker's trigger only – one „Cofnij”) and
 * says „Wstawiono regenerację: … · przesunięto 2 bloki” with „Cofnij”, which takes the block away and puts the pushed blocks back;
 * the proposal is counted after the paint, remembered by the day's key and done at the click (the line does not flash back).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { lowestEnergy } from '@shared/engine/energyOrder'
import { regenHere } from '@shared/engine/regenHere'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { BlockDayNotes } from '@renderer/features/today/DayNotes'
import { SidePanel } from '@renderer/features/today/TodayPage'
import { PLAN_CHANGED_TEXT, cheapestSwapCached, resetEnergyOrderCache, resetSwapCache, swapDayBlocks } from '@renderer/features/today/dayActions'
import { regenDoneText, regenHereCached, regenHereKeyOf, regenLineText, regenMemory, resetRegenCache } from '@renderer/features/today/regenActions'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { NO_MEMORY, useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// A pass-through spy: how many times the window looks for the proposal.
vi.mock('@shared/engine/energyOrder', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energyOrder')>()
  return { ...m, lowestEnergy: vi.fn(m.lowestEnergy) }
})
vi.mock('@shared/engine/regenHere', async (orig) => {
  const m = await orig<typeof import('@shared/engine/regenHere')>()
  return { ...m, regenHere: vi.fn(m.regenHere) }
})

const DATE = '2026-10-28'
const FULL: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }

/** The engine's example (`regen-here.test.ts`): the head reaches the reserve at 16:40, in „Analiza” 14:00–17:00. */
const PLAN: PlanBlock[] = [
  block({ id: 'a', cat: 'analiza', at: '07:30', min: 240, origin: 'user' }),
  block({ id: 'b', cat: 'analiza', at: '11:30', min: 120, origin: 'user' }),
  block({ id: 'p', cat: 'posilek', at: '13:30', min: 30, origin: 'user' }),
  block({ id: 'e', cat: 'analiza', at: '14:00', min: 180, origin: 'user' }),
  block({ id: 'c', cat: 'inne', at: '17:00', min: 60, origin: 'user' }),
  block({ id: 'w', cat: 'zajecia-zdalne', at: '21:00', min: 60, fixed: true, origin: 'user' })
]
const FILE: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
const settings = new Scenario({ date: DATE, plan: [] }).settings
const NAMES = { rd: rdFrom({}), settings, routines: [], requests: [] }
const LINE = 'Leżenie, drzemka 15 min przed Analiza · głowa 12 → 14'
const DONE = 'Wstawiono regenerację: Leżenie, drzemka 15 min · przesunięto 2 bloki'

/** The day counted at `at` from the file `file` (by default the plan above; `analizaMin` – the length of „Analiza” 14:00). */
function model(o: { at?: string; file?: RawRecord; analizaMin?: number; events?: (s: Scenario) => void } = {}): DayModel {
  const file = o.file ?? FILE
  const plan = dayFileFrom(file, DATE).blocks.map((b) => (b.id === 'e' && o.analizaMin ? { ...b, durationMin: o.analizaMin } : b))
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, reserve: 20 } }).observe('06:30', null)
  s.checkin('07:00', FULL)
  o.events?.(s)
  const ctx = s.contextAt(s.at(o.at ?? '07:30'))
  const state = computeDay(ctx)
  return { date: DATE, ctx, state, energy: computeEnergy(ctx, state), dayFile: dayFileFrom(file, DATE), data: { dayFile: file } } as unknown as DayModel
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
  resetRegenCache()
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

/** In an act, until the line's search put off past the paint has counted the day's key – a condition, no fixed delay. */
const settle = (m: DayModel) => act(() => vi.waitFor(() => expect(regenMemory.peek(m, regenHereKeyOf(m)).due).toBe(false)))

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
const texts = () => useUi.getState().toasts.map((t) => t.text)
const toastOf = (text: string) => useUi.getState().toasts.find((t) => t.text === text)!

/** The data folder as the window talks to it: the day's file now, the edits sent, the bar's calls. */
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
/** The file `file` with the edit laid on, as the queue lays it. */
const applied = (file: RawRecord, e: EditEntry): RawRecord => e.edits.reduce<unknown>((r, x) => setAt(r, x.path, x.value), file) as RawRecord
/** The edits by path: [path, base, value]. */
const fields = (e: EditEntry) => e.edits.map((x) => [x.path.join('.'), x.base, x.value])

/** The id of the block the edit put in (not one of the plan's). */
const newId = (e: EditEntry) => e.edits.map((x) => x.path[1]!.slice(1)).find((id) => !PLAN.some((b) => b.id === id))!

describe('„Wstaw regenerację tutaj” w oknie (N3)', () => {
  it('słowa linii i dymka', () => {
    expect(regenLineText('Leżenie, drzemka', 'Analiza', { pool: 'head', durationMin: 15, before: 12, after: 14 })).toBe(LINE)
    expect(regenDoneText('Leżenie, drzemka', { durationMin: 15 })).toBe('Wstawiono regenerację: Leżenie, drzemka 15 min')
  })

  it('panel boczny: przy ostrzeżeniu energii linia z przyciskiem – nazwy bloku i sposobu, nigdy id', async () => {
    stub()
    await side(model())
    const warnings = q('day-warnings')!
    expect(warnings.textContent).toContain('Prognoza energii na poziomie rezerwy')
    expect(warnings.querySelectorAll('[data-testid="regen-here"]')).toHaveLength(1)
    expect(q('regen-here-text')!.textContent).toBe(LINE)
    expect(q('regen-here-apply')!.textContent).toBe('Wstaw regenerację tutaj')
  })

  it('panel bloku ma tę samą linię; dzień miniony i dzień bez ostrzeżenia – bez niej', async () => {
    stub()
    await notes(model())
    expect(q('regen-here-text')!.textContent).toBe(LINE)
    act(() => root!.unmount())
    await side(model(), true)
    expect(q('day-warnings')).not.toBeNull()
    expect(q('regen-here')).toBeNull()
    act(() => root!.unmount())
    // „Analiza” 14:00 for 2 h only: no warning of energy (the plan's own warnings stay).
    await side(model({ analizaMin: 120 }))
    expect(q('day-warnings')!.textContent).not.toContain('Prognoza energii')
    expect(q('regen-here')).toBeNull()
  })

  it('klik zapisuje blok regeneracji i przesunięte bloki jedną edycją; pasek dostaje sam wyzwalacz znacznika; dymek z „Cofnij”', async () => {
    const { sent, bar } = stub()
    await side(model())
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toHaveLength(1)
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(DATE))
    const id = newId(entry)
    expect(fields(entry)).toEqual(expect.arrayContaining([
      ['blocks.#e.startMin', lm('14:00'), lm('14:15')],
      ['blocks.#c.startMin', lm('17:00'), lm('17:15')]
    ]))
    const put = dayFileFrom(applied(FILE, entry), DATE).blocks.find((b) => b.id === id)!
    expect(put).toMatchObject({ categoryId: 'regeneracja', variantId: 'drzemka', startMin: lm('14:00'), durationMin: 15, fixed: false, origin: 'user' })
    // One „Cofnij” – the window's: the bar only checks the marker (D367 trigger), no line of its own.
    await vi.waitFor(() => expect(bar).toHaveBeenCalledTimes(1))
    expect(bar).toHaveBeenCalledWith(DATE, 2, entry, null, false)
    await vi.waitFor(() => expect(texts()).toContain(DONE))
    expect(toastOf(DONE).action?.label).toBe('Cofnij')
  })

  it('„Cofnij” zdejmuje blok i przywraca przesunięte, linia wraca od razu; zmienione w międzyczasie – zostaje z uwagą', async () => {
    const { sent, state } = stub()
    await side(model())
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(texts()).toContain(DONE))
    expect(q('regen-here')).toBeNull()
    const entry = sent[0]![0]!
    const id = newId(entry)
    state.file = applied(FILE, entry)
    await act(async () => toastOf(DONE).action!.run())
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    const back = applied(state.file, sent[1]![0]!)
    const plan = dayFileFrom(back, DATE).blocks
    expect(plan.some((b) => b.id === id)).toBe(false)
    expect(plan.find((b) => b.id === 'e')!.startMin).toBe(lm('14:00'))
    expect(plan.find((b) => b.id === 'c')!.startMin).toBe(lm('17:00'))
    // The plan as before – the same key: the line is back at once, its button on.
    await vi.waitFor(() => expect(q('regen-here-text')?.textContent).toBe(LINE))
    expect((q('regen-here-apply') as HTMLButtonElement).disabled).toBe(false)

    // Once more – but „Inne” moved by hand meanwhile: nothing taken back, the toast says the plan changed.
    useUi.setState({ toasts: [] })
    state.file = FILE
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(texts()).toContain(DONE))
    const again = sent.at(-1)![0]!
    state.file = { ...applied(FILE, again) }
    state.file = setAt(state.file, ['blocks', '#c', 'startMin'], lm('18:00')) as RawRecord
    const before = sent.length
    await act(async () => toastOf(DONE).action!.run())
    await vi.waitFor(() => expect(texts()).toContain(PLAN_CHANGED_TEXT))
    expect(sent.slice(before).flat().filter((e) => e.edits.length > 0)).toEqual([])
  })

  it('D428: przesunięty blok z odznaczonego kalendarza – „(w tym 1 ukryty)”', async () => {
    useData.setState({ rd: rdFrom({ schema: 1, calendars: [{ id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] }], categories: { inne: { calendar: 'praca' } } }) })
    useCalendarFilter.setState({ hidden: ['praca'] })
    stub()
    await side(model())
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(texts()).toEqual([`${DONE} (w tym 1 ukryty)`]))
  })

  it('szukanie nie biegnie w renderze – linia przychodzi po narysowaniu; dwa liczenia dnia bez zmiany planu (sam zegar) nie szukają od nowa', async () => {
    stub()
    const search = vi.mocked(regenHere)
    search.mockClear()
    expect(renderToStaticMarkup(createElement(SidePanel, sideProps(model())))).not.toContain('regen-here')
    expect(search).not.toHaveBeenCalled()
    await side(model())
    expect(search).toHaveBeenCalledTimes(1)
    expect(q('regen-here-text')!.textContent).toBe(LINE)
    // 07:20 and 07:24 – one step of the clock, nothing due yet: one key, one search.
    search.mockClear()
    expect(regenHereCached(model({ at: '07:20' }))).toMatchObject({ beforeId: 'e' })
    expect(regenHereCached(model({ at: '07:24' }))).toMatchObject({ beforeId: 'e' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  // A slow save left held by a failing test would hold the window's queue of saves for the next ones (T517): released after each.
  const gates: Array<() => void> = []
  afterEach(() => gates.splice(0).forEach((release) => release()))

  it('linia nie miga: znika przy kliknięciu, nowy klucz w czasie wolnego zapisu i plan po zapisie nie pokazują tej samej propozycji', async () => {
    const { sent, state } = stub()
    const gate: { release: () => void } = { release: () => undefined }
    const held = new Promise<void>((done) => (gate.release = done))
    gates.push(() => gate.release())
    ;(window.rd as Partial<RdApi>).edit = async (entries) => {
      sent.push(entries)
      await held
      return entries.map(() => ({ status: 'applied' as const }))
    }
    await side(model())
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(q('regen-here')).toBeNull()
    // The clock's next step while the save runs: the same proposal counted again – not shown.
    const later = model({ at: '07:35' })
    await act(async () => root!.render(createElement(SidePanel, sideProps(later))))
    await settle(later)
    expect(regenHereCached(later)).toMatchObject({ beforeId: 'e' })
    expect(q('regen-here')).toBeNull()
    await act(async () => gate.release())
    await vi.waitFor(() => expect(texts()).toContain(DONE))
    // The plan as saved (the regeneration in it): no line proposing it again before „Analiza”.
    state.file = applied(FILE, sent[0]![0]!)
    const after = model({ file: state.file })
    await act(async () => root!.render(createElement(SidePanel, sideProps(after))))
    await settle(after)
    // At 07:30 the engine would put another quarter before „Analiza” at its new place (14:15): the same proposal by its words – done (T2647).
    expect(regenHereCached(after)).toMatchObject({ pool: 'head', beforeId: 'e', variantId: 'drzemka', startMin: lm('14:15') })
    expect(q('regen-here')).toBeNull()
  })

  it('zapis odrzucony (konflikt) – propozycja nie jest zrobiona, linia wraca', async () => {
    const { sent } = stub()
    ;(window.rd as Partial<RdApi>).edit = async (entries) => {
      sent.push(entries)
      return entries.map(() => ({ status: 'conflict' as const }))
    }
    await side(model())
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await vi.waitFor(() => expect(q('regen-here-text')?.textContent).toBe(LINE))
  })

  /** The folder applies each edit to the day's file (the next turn reads the file as the last edit left it). */
  function liveStub() {
    const s = stub()
    ;(window.rd as Partial<RdApi>).edit = async (entries) => {
      s.sent.push(entries)
      for (const e of entries) s.state.file = applied(s.state.file ?? FILE, e)
      return entries.map(() => ({ status: 'applied' as const }))
    }
    return s
  }

  it('T2870: plik zmieniony na innym komputerze (przesuwany blok w innym miejscu) – nic nie zapisane, „Plan zmienił się…”, linia wraca', async () => {
    const { sent, state } = stub()
    await side(model())
    // „Inne” moved to 18:00 elsewhere: the starts counted from 17:00 would write over it.
    state.file = setAt(FILE, ['blocks', '#c', 'startMin'], lm('18:00')) as RawRecord
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(texts()).toContain(PLAN_CHANGED_TEXT))
    expect(sent.flat().filter((e) => e.edits.length > 0)).toEqual([])
    await vi.waitFor(() => expect(q('regen-here-text')?.textContent).toBe(LINE))
  })

  it('T2870: blok, przed którym staje regeneracja, zmieniony w międzyczasie – nic nie zapisane', async () => {
    const { sent, state } = stub()
    await side(model())
    // „Analiza” made fixed elsewhere – the proposal pushed it, it would not move now.
    state.file = setAt(FILE, ['blocks', '#e', 'fixed'], true) as RawRecord
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(texts()).toContain(PLAN_CHANGED_TEXT))
    expect(sent.flat().filter((e) => e.edits.length > 0)).toEqual([])
  })

  it('T2870: „Zamień” i zaraz „Wstaw regenerację tutaj” (obie policzone na planie sprzed zamiany) – zapisuje się tylko zamiana', async () => {
    const { sent, state } = liveStub()
    const m = model()
    await side(m)
    const plan = m.ctx.plan
    const at = (id: string) => plan.find((b) => b.id === id)!
    // A swap of „Analiza” and „Inne” counted on the same plan (the line of the swap, a click before): saved first, in its turn.
    const starts = [{ block: at('c'), startMin: lm('14:00') }, { block: at('e'), startMin: lm('15:00') }]
    await act(async () => {
      void swapDayBlocks(DATE, FILE, starts, { a: 'e', b: 'c', changes: [] }, 'Zamieniono: Analiza ↔ Inne')
      q('regen-here-apply')!.click()
    })
    await vi.waitFor(() => expect(texts()).toContain(PLAN_CHANGED_TEXT))
    expect(sent.flat().filter((e) => e.edits.length > 0)).toHaveLength(1)
    // The file as the swap left it: „Analiza” at 15:00, no block of regeneration in it.
    const blocks = dayFileFrom(state.file!, DATE).blocks
    expect(blocks.find((b) => b.id === 'e')!.startMin).toBe(lm('15:00'))
    expect(blocks.some((b) => !PLAN.some((x) => x.id === b.id))).toBe(false)
  })


  it('T2872: blok zapisuje się z id, z którym propozycja była liczona', async () => {
    const { sent } = stub()
    const m = model()
    await side(m)
    const r = regenHereCached(m)!
    await act(async () => void q('regen-here-apply')!.click())
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(newId(sent[0]![0]!)).toBe(r.id)
  })

  it('T2873: propozycja trzymana do policzenia nowego klucza – tylko póki jej start jest przed nami', () => {
    const m = model()
    const r = regenHereCached(m)!
    const shown = regenHereKeyOf(m)
    // Another key of the same day, the clock before the start: held; at the start: none.
    const before = model({ at: '07:35' })
    expect(regenMemory.peek(before, regenHereKeyOf(before), shown).value).toEqual(r)
    // 14:02, „Analiza” due since 14:00 (the morning ran): still the warning, the regeneration's start (14:00) is past.
    const at = model({ at: '14:02', events: (s) => s.ran('a', '07:30', '11:30').ran('b', '11:30', '13:30').ran('p', '13:30', '14:00') })
    expect(regenHereKeyOf(at)).not.toBeNull()
    expect(regenMemory.peek(at, regenHereKeyOf(at), shown).value).toBeNull()
  })

  it('T2875: klucz dnia liczony raz na policzony dzień dla obu linii panelu', () => {
    const m = model()
    cheapestSwapCached(m)
    regenHereCached(m)
    const key = vi.mocked(lowestEnergy)
    key.mockClear()
    const html = renderToStaticMarkup(createElement(SidePanel, sideProps(m)))
    expect(html).toContain('regen-here-text')
    expect(key).toHaveBeenCalledTimes(1)
  })
})
