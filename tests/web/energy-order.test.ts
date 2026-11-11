/**
 * „Ułóż pod energię” (D369, D374) in the window without a DOM: the morning plan's „Ułóż” writes the variant's new starts as
 * one edit of today's file and tells the main process of it (the bar's „Przestawiono: … · Cofnij”), „Zostaw” hides the card to
 * the day's end (D377), the search runs again only when the day changes, not the clock (T616); the bar's panel says the
 * changes of order under the variant.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { PlanBlock } from '@shared/model/plan'
import { noFolderView, type WidgetView } from '@shared/widget'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { rdFrom } from '@shared/model/rd'
import { dayFileFrom } from '@shared/model/plan'
import { energyOrderVariant } from '@shared/engine/energyOrder'
import { ENERGY_ORDER_ASKED, PLAN_ALREADY_TEXT, arrangeDayBlocks, energyOrderCached, energyOrderFor, energyOrderKey, leaveEnergyOrder, resetEnergyOrderCache, variantStarts, withPushed } from '@renderer/features/today/dayActions'
import { useUi } from '@renderer/store/ui'
import { useData } from '@renderer/store/data'
import { Bar } from '@renderer/widget/Bar'
import { block, lm, Scenario } from '../unit/engine/dsl'

// A pass-through spy: how many times the window searches for the variant.
vi.mock('@shared/engine/energyOrder', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energyOrder')>()
  return { ...m, energyOrderVariant: vi.fn(m.energyOrderVariant) }
})

const DATE = '2026-10-28'
const flex = (id: string, cat: string, at: string, min: number): PlanBlock => block({ id, cat, at, min, origin: 'user' })
const PLAN = [flex('c', 'inne', '08:00', 60), flex('r', 'regeneracja', '09:00', 60), flex('e', 'analiza', '10:00', 60)]
const LABEL = 'Ułóż pod energię – najniższa energia dnia 69 → 75'
const CHANGES = [
  { k: 'start' as const, block: 'e', startMin: lm('08:00') },
  { k: 'start' as const, block: 'c', startMin: lm('10:00') }
]

describe('„Ułóż” w planie porannym: jedna edycja pliku dnia i „Przestawiono” w pasku', () => {
  const file: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
  })

  function stub(dayFile: RawRecord | null) {
    const sent: EditEntry[][] = []
    const told: Array<[string, string, EditEntry, RawRecord | null]> = []
    const rd: Partial<RdApi> = {
      dayFiles: async () => ({ [DATE]: dayFile }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => ({ today: DATE }) as DataView,
      planArranged: async (day, label, entry, made) => void told.push([day, label, entry, made])
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: DATE } as DataView })
    return { sent, told }
  }

  it('nowe starty wariantu jako bloki planu (blok, którego już nie ma w planie, pominięty)', () => {
    expect(variantStarts(PLAN, { changes: [...CHANGES, { k: 'start', block: 'x', startMin: 700 }] })).toEqual([
      { block: PLAN[2], startMin: lm('08:00') },
      { block: PLAN[0], startMin: lm('10:00') }
    ])
    expect(variantStarts(PLAN, { changes: [{ k: 'shorten', block: 'c', toMin: 30 }] })).toEqual([])
  })

  it('starty w jednej edycji, na blokach z pliku; ta sama edycja idzie do paska z etykietą', async () => {
    // A note written on „c” meanwhile in the file stays.
    const now: RawRecord = { ...file, blocks: (file.blocks as Array<Record<string, unknown>>).map((b) => (b.id === 'c' ? { ...b, note: 'nowa' } : b)) }
    const { sent, told } = stub(now)
    const out = await arrangeDayBlocks(DATE, file, variantStarts(PLAN, { changes: CHANGES }), LABEL)
    expect(out).toEqual({ out: [{ status: 'applied' }], already: false })
    expect(sent).toHaveLength(1)
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(DATE))
    expect(entry.edits.map((e) => [e.path.join('.'), e.base, e.value])).toEqual([
      ['blocks.#c.startMin', lm('08:00'), lm('10:00')],
      ['blocks.#e.startMin', lm('10:00'), lm('08:00')]
    ])
    expect(told).toEqual([[DATE, LABEL, entry, null]])
  })

  it('T622: plik już tak ułożony (drugi komputer) – nic nie zapisane, dymek „Plan już jest tak ułożony.”, karta wie, że ma zniknąć (D379)', async () => {
    const same: RawRecord = withPushed(file, DATE, (r) => r, variantStarts(PLAN, { changes: CHANGES }))
    const { sent, told } = stub(same)
    const toasts = useUi.getState().toasts.length
    expect(await arrangeDayBlocks(DATE, file, variantStarts(PLAN, { changes: CHANGES }), LABEL)).toMatchObject({ already: true })
    expect(sent).toEqual([])
    expect(told).toEqual([])
    expect(useUi.getState().toasts.slice(toasts).map((t) => t.text)).toEqual([PLAN_ALREADY_TEXT])
    expect(PLAN_ALREADY_TEXT).toBe('Plan już jest tak ułożony.')
  })

  it('zapis odrzucony (konflikt z innym komputerem): pasek nie dostaje „Cofnij”', async () => {
    const { told } = stub(file)
    ;(window.rd as Partial<RdApi>).edit = async (entries) => entries.map(() => ({ status: 'conflict' as const }))
    await arrangeDayBlocks(DATE, file, variantStarts(PLAN, { changes: CHANGES }), LABEL)
    expect(told).toEqual([])
  })
})

describe('karta „Ułóż pod energię” w planie porannym: „Zostaw” chowa ją do końca dnia (D377)', () => {
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
    // The window's memory of the variant: one test's day never answers for another's.
    resetEnergyOrderCache()
  })

  /** The day of the engine's test (the nap after „Inne”, a long class – the lowest energy 50) with the day's file `asked`. */
  const NAMES = { rd: rdFrom({}), settings: new Scenario({ date: DATE, plan: [] }).settings, routines: [], requests: [] }
  function model(asked: Record<string, string> = {}, at = '07:30', classMin = 370, nextWake = '06:00') {
    const plan = [
      flex('c', 'inne', '08:00', 60),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60, origin: 'user' }),
      flex('e', 'analiza', '10:00', 60),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: classMin, fixed: true, origin: 'user' })
    ]
    const s = new Scenario({ date: DATE, plan, wake: '06:30', nextWake, settings: { transitionBufferMin: 0 } }).observe('06:30', null)
    s.checkin('07:00', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const ctx = s.contextAt(s.at(at))
    const state = computeDay(ctx)
    return { ctx, state, energy: computeEnergy(ctx, state), dayFile: dayFileFrom({ schema: 1, date: DATE, asked }, DATE), names: NAMES }
  }

  it('T616: dwa liczenia dnia bez zmiany planu (sam zegar, co 30 s) nie szukają wariantu od nowa; zmiana planu – szuka', () => {
    const search = vi.mocked(energyOrderVariant)
    search.mockClear()
    const first = energyOrderCached(model({}, '07:30'), NAMES)
    expect(energyOrderCached(model({}, '07:31'), NAMES)).toBe(first)
    expect(search).toHaveBeenCalledTimes(1)
    // A longer class (another plan): counted again.
    expect(energyOrderCached(model({}, '07:31', 400), NAMES)?.label).not.toBe(first?.label)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('T616: nowe obiekty nazw przy tych samych danych (okno robi je co liczenie) – z pamięci', () => {
    const search = vi.mocked(energyOrderVariant)
    search.mockClear()
    const first = energyOrderCached(model({}, '07:30'), NAMES)
    // `settings` is new each count of the day; rd, routines and requests are the store's own.
    expect(energyOrderCached(model({}, '07:31'), { ...NAMES, settings: { ...NAMES.settings } })).toBe(first)
    expect(search).toHaveBeenCalledTimes(1)
    // Another list of routines (the data changed): counted again.
    energyOrderCached(model({}, '07:31'), { ...NAMES, routines: [] })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('T616: klucz zmienia się z pobudką następnego dnia (pora snu) i co 5 min zegara, nie co 30 s', () => {
    expect(energyOrderKey(model({}, '07:30'))).toBe(energyOrderKey(model({}, '07:34')))
    expect(energyOrderKey(model({}, '07:30'))).not.toBe(energyOrderKey(model({}, '07:35')))
    expect(energyOrderKey(model({}, '07:30'))).not.toBe(energyOrderKey(model({}, '07:30', 370, '07:00')))
  })

  it('karta ma wariant dnia; po „Zostaw” (odpowiedź w pliku dnia) – nie', () => {
    const m = model()
    expect(energyOrderFor(m, m.names)?.label).toBe('Ułóż pod energię – najniższa energia dnia 50 → 56')
    const left = model({ [ENERGY_ORDER_ASKED]: 'leave' })
    expect(energyOrderFor(left, left.names)).toBeNull()
  })

  it('„Zostaw” zapisuje odpowiedź w pliku dnia jedną edycją, bez zmiany planu', async () => {
    const file: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
    const sent: EditEntry[][] = []
    const rd: Partial<RdApi> = {
      dayFiles: async () => ({ [DATE]: file }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => ({ today: DATE }) as DataView
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: DATE } as DataView })
    expect(await leaveEnergyOrder(DATE, file)).toEqual([{ status: 'applied' }])
    expect(sent.map((e) => e.map((x) => x.edits.map((y) => [y.path.join('.'), y.value])))).toEqual([[[['asked', { [ENERGY_ORDER_ASKED]: 'leave' }]]]])
  })
})

describe('panel wariantów w pasku: lista zmian kolejności pod „Ułóż pod energię”', () => {
  it('pod etykietą wariantu stoją jego zmiany, każda w swojej linii', () => {
    const view: WidgetView = {
      ...noFolderView(),
      day: DATE,
      lines: [],
      variants: { marker: false, open: [{ id: 'energyOrder', label: LABEL, details: ['Analiza 10:00 → 08:00', 'Inne obowiązki 08:00 → 10:00'] }, { id: 'keep', label: 'Zostaw plan' }] }
    }
    const out = renderToStaticMarkup(createElement(Bar, { view, mode: 'panel' }))
    expect(out).toContain('data-testid="bar-variant-energyOrder"')
    expect(out).toContain('data-testid="bar-variant-energyOrder-details"')
    expect(out).toContain('<span>Analiza 10:00 → 08:00</span><span>Inne obowiązki 08:00 → 10:00</span>')
    expect(out).toContain('data-testid="bar-variant-keep"')
    expect(out).not.toContain('bar-variant-keep-details')
  })

  it('T615: przyciski wariantów zostają dziećmi panelu (pełna szerokość jak dotąd), lista zmian obok, nie w opakowaniu', () => {
    const view: WidgetView = {
      ...noFolderView(),
      day: DATE,
      lines: [],
      variants: { marker: false, open: [{ id: 'energyOrder', label: LABEL, details: ['Analiza 10:00 → 08:00'] }, { id: 'keep', label: 'Zostaw plan' }] }
    }
    const out = renderToStaticMarkup(createElement(Bar, { view, mode: 'panel' }))
    const panel = /data-testid="bar-variants-panel">(.*?)<\/div><\/div>/.exec(out)?.[1] ?? ''
    // The panel holds: the button, its details, the next button – no wrapper that shrinks a button to its text.
    expect(panel.startsWith('<button')).toBe(true)
    expect(panel).toMatch(/^<button[^>]*bar-variant-energyOrder"[^>]*>[^<]*<\/button><div[^>]*bar-variant-energyOrder-details"><span>[^<]*<\/span><\/div><button[^>]*bar-variant-keep"/)
    expect(panel).not.toContain('items-start')
  })
})
