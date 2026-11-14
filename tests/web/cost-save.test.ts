/**
 * D501: the cost changed in the window of a tile (`saveTileCosts`, no DOM) – one path for „Dziś”, „3 dni” and „Tydzień”. The day as it is
 * when the save runs decides: a block not begun – its own cost in the day's file (a block of the template that was never in the file is put
 * in with it), null – the category's again, the rest of the block as it was; a begun block – `energy.cost` in the log (rule A), also when
 * it began after the window opened; an ended block, a day gone by, a block gone from the plan or a day that cannot be read – refused, nothing
 * written. A block of a series asks its scope as the panel does (`askScope`); „To i następne” changes the series, and a begun occurrence
 * costs so from now on too. The day is read, not counted (`computeDay` never runs for it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, EventIn, RawRecord, RdApi, SeriesResult } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { marketDay } from '@shared/calendar/holidays'
import { computeDay } from '@shared/engine/day'
import { createDay } from '@shared/engine/createDay'
import { newSeries } from '@shared/engine/series'
import type { AnyEvent } from '@shared/model/events'
import { dayFileFrom, templateFrom, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { COST_DAY_GONE_TEXT, COST_ENDED_TEXT, saveTileCosts, type CostTarget } from '@renderer/features/plan/costSave'
import { askScope } from '@renderer/features/series/scopeAsk'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})
vi.mock('@renderer/features/series/scopeAsk', () => ({ askScope: vi.fn() }))

// Far ahead of the real clock; the window's clock is 05:00 of „today”.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const AT = placeLogical(TODAY, 5 * 60)
const own: PlanBlock['costs'] = { head: 4, emotions: 0, senses: -2 }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const names = () => ({ rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] })
const target = (date: string, blockId: string, ofSeries = false): CostTarget => ({ date, blockId, names: names(), ofSeries })

let n = 0
/** An event of today's log at the wall time `time`. */
const ev = (k: string, time: string, o: Record<string, unknown>): AnyEvent => {
  const t = placeLogical(TODAY, lm(time))
  return { id: `pca-${n}`, c: 'pca', n: n++, t, l: t, v: 13, day: TODAY, dom: 'timer', k, at: t, ...o } as unknown as AnyEvent
}
const started = (id: string, time: string) => ev('block.start', time, { block: id, bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click' })
const ended = (id: string, time: string) => ev('block.end', time, { block: id, done: true, rule: null })

const data = useData.getState()
beforeEach(() => vi.mocked(askScope).mockReset())
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

function stub(start: Record<string, RawRecord | null>, o: { unreadable?: string[]; events?: Record<string, AnyEvent[]>; series?: SeriesResult } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const logged: EventIn[] = []
  const changed: unknown[][] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => !o.unreadable?.includes(d)).map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: o.events?.[date] ?? [], complete: true, unknown: false, away: false }) as DayData,
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const date = dateOf(e.rel)
        files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status: 'applied' as const }
      })
    },
    logEvents: async (events) => void logged.push(...events),
    seriesChange: async (...args: unknown[]) => {
      changed.push(args)
      return o.series ?? { ok: true, error: null, code: null, seriesId: 's1', outcomes: [], undo: [] }
    },
    dataView: async () => ({ today: TODAY }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return { files, sent, logged, changed }
}
const blockOf = (file: RawRecord | null | undefined, date: string, id: string) => dayFileFrom(file ?? { schema: 1, date }, date).blocks.find((b) => b.id === id)

describe('saveTileCosts – blok niezaczęty: własny koszt w planie (D501)', () => {
  it('własny koszt bloku z pliku dnia: zapisany, reszta bloku bez zmian; dzień nie jest liczony', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { note: 'notatka' })]) })
    vi.mocked(computeDay).mockClear()
    expect(await saveTileCosts(target(D1, 'x'), own, AT)).toBe(true)
    expect(blockOf(s.files[D1], D1, 'x')).toMatchObject({ costs: own, note: 'notatka', durationMin: 60, startMin: lm('11:00') })
    expect(computeDay).not.toHaveBeenCalled()
    expect(s.logged).toEqual([])
  })

  it('null – koszt kategorii wraca (blok nie ma własnego)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60, { costs: own })]) })
    expect(await saveTileCosts(target(D1, 'x'), null, AT)).toBe(true)
    expect(blockOf(s.files[D1], D1, 'x')!.costs).toBeNull()
  })

  it('blok szablonu bez pliku dnia: plik powstaje z blokiem z własnym kosztem', async () => {
    const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2020-01-01', blocks: [{ id: 'an', categoryId: 'analiza', startMin: lm('11:00'), durationMin: 60 }] }] })!
    const id = createDay({ date: D1, changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).blocks.find((b) => b.origin === 'template')!.id
    const s = stub({ [D1]: null })
    useData.setState({ templates: [tpl] })
    expect(await saveTileCosts(target(D1, id), own, AT)).toBe(true)
    expect(blockOf(s.files[D1], D1, id)).toMatchObject({ costs: own, categoryId: 'analiza', durationMin: 60, startMin: lm('11:00') })
  })

  it('bloku nie ma w planie dnia, dnia nie da się odczytać albo dzień minął – nic nie zapisano', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) })
    expect(await saveTileCosts(target(D1, 'gone'), own, AT)).toBe(false)
    expect(s.sent).toEqual([])
    const u = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) }, { unreadable: [D1] })
    expect(await saveTileCosts(target(D1, 'x'), own, AT)).toBe(false)
    expect(u.sent).toEqual([])
    const past = '2098-12-30'
    const p = stub({ [past]: fileOf(past, [flex('x', '11:00', 60)]) })
    expect(await saveTileCosts(target(past, 'x'), own, AT)).toBe(false)
    expect(p.sent).toEqual([])
    expect(useUi.getState().toasts.at(-1)?.text).toContain(COST_DAY_GONE_TEXT)
  })
})

describe('saveTileCosts – blok zaczęty: od teraz do końca bloku (reguła A)', () => {
  it('blok biegnie: energy.cost w logu dnia, plan bez zmian', async () => {
    const s = stub({ [TODAY]: fileOf(TODAY, [flex('x', '04:30', 60)]) }, { events: { [TODAY]: [started('x', '04:30')] } })
    expect(await saveTileCosts(target(TODAY, 'x'), own, AT)).toBe(true)
    expect(s.logged).toEqual([{ k: 'energy.cost', day: TODAY, block: 'x', costs: own }])
    expect(s.sent).toEqual([])
  })

  it('blok zaczął się, zanim zapis przyszedł na swoją kolej (okienko otwarte jeszcze przed startem): też zdarzenie, nie plan', async () => {
    // The view knew it as a block still to come; the log the save reads has its start.
    const s = stub({ [TODAY]: fileOf(TODAY, [flex('x', '04:59', 60)]) }, { events: { [TODAY]: [started('x', '04:59')] } })
    expect(await saveTileCosts(target(TODAY, 'x'), null, AT)).toBe(true)
    expect(s.logged).toEqual([{ k: 'energy.cost', day: TODAY, block: 'x', costs: null }])
    expect(blockOf(s.files[TODAY], TODAY, 'x')!.costs).toBeNull()
    expect(s.sent).toEqual([])
  })

  it('blok zaczęty poza planem – też zdarzenie', async () => {
    const s = stub({ [TODAY]: fileOf(TODAY, []) }, { events: { [TODAY]: [started('loose', '04:30')] } })
    expect(await saveTileCosts(target(TODAY, 'loose'), own, AT)).toBe(true)
    expect(s.logged).toEqual([{ k: 'energy.cost', day: TODAY, block: 'loose', costs: own }])
  })

  it('blok skończony – nic nie zapisano, dymek mówi dlaczego', async () => {
    const s = stub({ [TODAY]: fileOf(TODAY, [flex('x', '04:20', 60)]) }, { events: { [TODAY]: [started('x', '04:20'), ended('x', '04:50')] } })
    expect(await saveTileCosts(target(TODAY, 'x'), own, AT)).toBe(false)
    expect(s.logged).toEqual([])
    expect(s.sent).toEqual([])
    expect(useUi.getState().toasts.at(-1)?.text).toContain(COST_ENDED_TEXT)
  })
})

describe('saveTileCosts – blok serii pyta o zakres jak panel (D501)', () => {
  const seriesBlock = { categoryId: 'inne', variantId: null, startMin: 11 * 60, durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null, steps: [] }
  const ofSeries = (id: string, time: string) => flex(id, time, 60, { origin: 'series', sourceId: 's1' })
  const withSeries = () => useData.setState({ series: [newSeries('s1', seriesBlock, '2098-12-01', { kind: 'daily' }, 'ask', { until: null, count: null })] })

  it('„Tylko to” – własny koszt tego dnia; pytanie zamknięte – nic', async () => {
    const s = stub({ [D1]: fileOf(D1, [ofSeries('o', '11:00')]) })
    withSeries()
    vi.mocked(askScope).mockResolvedValueOnce('only')
    expect(await saveTileCosts(target(D1, 'o', true), own, AT)).toBe(true)
    expect(askScope).toHaveBeenCalledWith('change', expect.any(String), 'codziennie')
    expect(blockOf(s.files[D1], D1, 'o')!.costs).toEqual(own)
    vi.mocked(askScope).mockResolvedValueOnce(null)
    expect(await saveTileCosts(target(D1, 'o', true), null, AT)).toBe(false)
    expect(blockOf(s.files[D1], D1, 'o')!.costs).toEqual(own)
    expect(s.changed).toEqual([])
  })

  it('„To i następne” – zmiana serii (koszt bloku serii), bez osobnej zmiany dnia', async () => {
    const s = stub({ [D1]: fileOf(D1, [ofSeries('o', '11:00')]) })
    withSeries()
    vi.mocked(askScope).mockResolvedValueOnce('following')
    expect(await saveTileCosts(target(D1, 'o', true), own, AT)).toBe(true)
    expect(s.changed).toEqual([[{ date: D1, blockId: 'o' }, 'following', { block: { costs: own } }]])
    expect(s.sent).toEqual([])
    expect(s.logged).toEqual([])
  })

  it('zaczęte wystąpienie i „Cała seria”: seria zmieniona, a to wystąpienie kosztuje tak od teraz (zdarzenie)', async () => {
    const s = stub({ [TODAY]: fileOf(TODAY, [ofSeries('o', '04:30')]) }, { events: { [TODAY]: [started('o', '04:30')] } })
    withSeries()
    vi.mocked(askScope).mockResolvedValueOnce('all')
    expect(await saveTileCosts(target(TODAY, 'o', true), own, AT)).toBe(true)
    expect(s.changed).toHaveLength(1)
    expect(s.logged).toEqual([{ k: 'energy.cost', day: TODAY, block: 'o', costs: own }])
  })

  it('blok spoza serii o nic nie pyta', async () => {
    stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) })
    withSeries()
    expect(await saveTileCosts(target(D1, 'x', true), own, AT)).toBe(true)
    expect(askScope).not.toHaveBeenCalled()
  })
})
