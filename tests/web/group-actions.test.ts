/**
 * Zmiany grupowe bloków – warstwa zapisu (D528, D529, ciąg Z część A, bez DOM): `changeDayGroup` w „Dziś” – jedna zmiana pliku dnia (jedno
 * `edit`) z rozsunięciem (D367; dziś pasek dostaje sam wyzwalacz znacznika, T1541), blok serii „Tylko to” (bez pytania, policzony), energia
 * przed i po, „Przenieś na dzień” – oba dni jedną zmianą, docelowy najpierw (T952), „Usuń” z „Cofnij”, „Odwołaj” / „Zaparkuj” przez proces
 * główny (`groupLog`) z „Cofnij”, koszt zaczętego bloku – zdarzenie `block.cost` od teraz (D501); `changeTemplateGroup` w „Szablonach”.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, EventIn, GroupLogResult, GroupLogUndone, RawRecord, RdApi, TimerIn } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { newSeries } from '@shared/engine/series'
import type { Pool } from '@shared/model/categories'
import { templateJson } from '@shared/model/defaults'
import type { Answer, AnyEvent } from '@shared/model/events'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { changeDayGroup } from '@renderer/features/today/groupActions'
import { changeTemplateGroup } from '@renderer/features/templates/templateGroup'
import { sampleDay, templateDayOf, versionFrom } from '@renderer/features/templates/templateDay'
import { ATTACHMENTS_UNREAD_TEXT } from '@shared/model/attachment'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock is 05:00 of „today” – before its blocks. The default day has sessions 08:00–11:00
// and 14:00–17:00: the blocks stand between them.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const D2 = '2099-01-06'
const AT = placeLogical(TODAY, 5 * 60)
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: readonly PlanBlock[], extra: RawRecord = {}): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks
const startsOf = (raw: RawRecord | null | undefined, date: string) => Object.fromEntries(blocksOf(raw, date).map((b) => [b.id, b.startMin]))
type Answers = Record<Pool, [Answer, Answer]>
const ZERO: Answers = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

/** The folder as the window sees it: the day files change as the edits apply; the main process's group actions answer as given. */
function stub(start: Record<string, RawRecord | null>, o: { events?: Record<string, AnyEvent[]>; groupLog?: GroupLogResult; undoGroupLog?: GroupLogUndone } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const logged: EventIn[] = []
  const told: Array<[string, number, boolean | undefined]> = []
  const clicks: TimerIn[] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
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
    planPushed: async (day, count, _entry, _made, line) => void told.push([day, count, line]),
    groupLog: vi.fn(async () => o.groupLog ?? { ok: true, why: null, confirm: null, written: [], taken: [], skipped: [] }),
    undoGroupLog: vi.fn(async () => o.undoGroupLog ?? { ok: true, why: null, confirm: null, restored: [], kept: [] }),
    timer: async (click) => {
      clicks.push(click)
      return { ok: true, why: null, confirm: null }
    },
    dataView: async () => ({ today: TODAY }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return { files, sent, logged, told, clicks, rd }
}
const rels = (s: { sent: EditEntry[][] }) => s.sent.map((c) => c.map((e) => dateOf(e.rel)))

describe('changeDayGroup – pola i przesunięcie: jedna zmiana pliku dnia', () => {
  it('podkategoria na 4 blokach, w tym zaczęty: jedno `edit` z jednym wpisem dnia, 3 zmienione, pominięty zaczęty; „Cofnij” – tylko podkategoria', async () => {
    const plan = [flex('a', '05:00', 30), flex('b', '11:00', 30, { note: 'n' }), flex('c', '12:00', 30), flex('d', '13:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('a', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const r = await changeDayGroup(TODAY, ['a', 'b', 'c', 'd'], { k: 'category', categoryId: 'analiza', variantId: null }, { at: AT + 60_000 })
    expect(r).toMatchObject({ status: 'saved', changed: 3, skipped: [{ id: 'a', why: 'zaczęty' }], seriesOnly: 0, pushed: 0 })
    expect(rels(s)).toEqual([[TODAY]])
    expect(blocksOf(s.files[TODAY], TODAY).map((b) => [b.id, b.categoryId])).toEqual([
      ['a', 'inne'],
      ['b', 'analiza'],
      ['c', 'analiza'],
      ['d', 'analiza']
    ])
    // The note of „b” changed meanwhile: it stays; the subcategory goes back everywhere.
    s.files[TODAY] = { ...s.files[TODAY]!, blocks: (s.files[TODAY]!.blocks as RawRecord[]).map((x) => (x.id === 'b' ? { ...x, note: 'nowa' } : x)) }
    expect(await r.undo!()).toEqual({ saved: true, restored: 3, kept: 0 })
    expect(blocksOf(s.files[TODAY], TODAY).map((b) => [b.id, b.categoryId, b.note])).toEqual([
      ['a', 'inne', ''],
      ['b', 'inne', 'nowa'],
      ['c', 'inne', ''],
      ['d', 'inne', '']
    ])
  })

  it('„Przesuń o +15” dziś: 11:00 i 12:00 – 11:15 i 12:15, kolejny rozsunięty w tym samym wpisie; pasek – tylko wyzwalacz znacznika (T1541)', async () => {
    const plan = [flex('a', '11:00', 60), flex('b', '12:00', 60), flex('c', '13:00', 30)]
    const s = stub({ [TODAY]: fileOf(TODAY, plan) })
    const r = await changeDayGroup(TODAY, ['a', 'b'], { k: 'shift', minutes: 15 }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 2, pushed: 1 })
    expect(s.sent).toHaveLength(1)
    expect(startsOf(s.files[TODAY], TODAY)).toEqual({ a: lm('11:15'), b: lm('12:15'), c: lm('13:15') })
    expect(s.told).toEqual([[TODAY, 1, false]])
    // „Cofnij”: every block back, the pushed one too.
    expect(await r.undo!()).toEqual({ saved: true, restored: 3, kept: 0 })
    expect(startsOf(s.files[TODAY], TODAY)).toEqual({ a: lm('11:00'), b: lm('12:00'), c: lm('13:00') })
  })

  it('blok serii zmienia się jak „Tylko to”: plik dnia, bez pytania i bez zmiany serii – policzony do dopisku', async () => {
    const seriesBlock = { categoryId: 'inne', variantId: null, startMin: 11 * 60, durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null, steps: [] }
    useData.setState({ series: [newSeries('s1', seriesBlock, '2098-12-01', { kind: 'daily' }, 'ask', { until: null, count: null })] })
    const plan = [flex('o', '11:00', 60, { origin: 'series', sourceId: 's1' }), flex('x', '12:30', 30)]
    const s = stub({ [D1]: fileOf(D1, plan) })
    s.rd.seriesChange = vi.fn()
    const r = await changeDayGroup(D1, ['o', 'x'], { k: 'cost', costs: { head: 4, emotions: 1, senses: 1, body: 0 } }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 2, seriesOnly: 1 })
    expect(rels(s)).toEqual([[D1]])
    expect(s.rd.seriesChange).not.toHaveBeenCalled()
    expect(blocksOf(s.files[D1], D1).find((b) => b.id === 'o')!.costs).toEqual({ head: 4, emotions: 1, senses: 1, body: 0 })
  })

  it('koszt zaczętego bloku: zdarzenie `block.cost` od teraz (D501), niezaczęty – w pliku; „Cofnij” – własny koszt sprzed zmiany', async () => {
    const plan = [flex('run', '05:00', 120), flex('x', '12:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const costs = { head: 2, emotions: 2, senses: 2, body: 0 }
    const r = await changeDayGroup(TODAY, ['run', 'x'], { k: 'cost', costs }, { at: AT + 30 * 60_000 })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(s.logged).toEqual([{ k: 'block.cost', day: TODAY, block: 'run', costs }])
    expect(blocksOf(s.files[TODAY], TODAY).find((b) => b.id === 'x')!.costs).toEqual(costs)
    // „Cofnij” reads the day: the log as the main process would have it with the event written.
    const logged = [...events, ...new Scenario({ date: TODAY, plan }).raw({ k: 'block.cost', block: 'run', at: AT + 30 * 60_000, costs }, '05:30').events.map((e) => ({ ...e, id: 'pca-cost', n: 99 }))]
    s.rd.dayData = async (date) => ({ date, dayFile: s.files[date] ?? null, nextFile: null, prevFile: null, events: logged, complete: true, unknown: false, away: false }) as DayData
    s.logged.length = 0
    expect(await r.undo!(AT + 40 * 60_000)).toMatchObject({ saved: true, restored: 2, kept: 0 })
    expect(s.logged).toEqual([{ k: 'block.cost', day: TODAY, block: 'run', costs: null }])
    expect(blocksOf(s.files[TODAY], TODAY).find((b) => b.id === 'x')!.costs).toBeNull()
  })

  it('koszt zaczętego bloku zmieniony od tego czasu – „Cofnij” go zostawia, policzony', async () => {
    const plan = [flex('run', '05:00', 120)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const costs = { head: 2, emotions: 2, senses: 2, body: 0 }
    const r = await changeDayGroup(TODAY, ['run'], { k: 'cost', costs }, { at: AT + 30 * 60_000 })
    const other = { head: 5, emotions: 0, senses: 0, body: 0 }
    const later = new Scenario({ date: TODAY, plan }).raw({ k: 'block.cost', block: 'run', at: AT + 30 * 60_000, costs }, '05:30').raw({ k: 'block.cost', block: 'run', at: AT + 35 * 60_000, costs: other }, '05:35').events
    s.rd.dayData = async (date) => ({ date, dayFile: s.files[date] ?? null, nextFile: null, prevFile: null, events: [...events, ...later.map((e, i) => ({ ...e, id: `pcb-${i}`, c: 'pcb' }))], complete: true, unknown: false, away: false }) as DayData
    s.logged.length = 0
    expect(await r.undo!(AT + 40 * 60_000)).toEqual({ saved: true, restored: 0, kept: 1 })
    expect(s.logged).toEqual([])
  })

  it('energia przed i po (dzień z check-inem): koszt zero na drogich blokach podnosi najniższą energię', async () => {
    const plan = [flex('e1', '11:00', 60, { categoryId: 'analiza' }), flex('e2', '12:00', 60, { categoryId: 'analiza' }), flex('e3', '13:00', 60, { categoryId: 'analiza' })]
    const events = new Scenario({ date: TODAY, plan }).observe('04:30', null).checkin('04:45', ZERO).events
    stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const r = await changeDayGroup(TODAY, ['e1', 'e2', 'e3'], { k: 'cost', costs: { head: 0, emotions: 0, senses: 0, body: 0 } }, { at: AT })
    expect(r.energy).toBeDefined()
    expect(r.energy!.after).toBeGreaterThan(r.energy!.before)
    // A day with no check-in: no energy in the line.
    stub({ [TODAY]: fileOf(TODAY, plan) })
    expect((await changeDayGroup(TODAY, ['e1'], { k: 'cost', costs: { head: 0, emotions: 0, senses: 0, body: 0 } }, { at: AT })).energy).toBeUndefined()
  })
})

describe('changeDayGroup – „Przenieś na dzień”: oba dni jedną zmianą, docelowy najpierw (T952)', () => {
  it('bloki 11:00 i 12:00 na inny dzień – te same godziny, kolejne docelowego rozsunięte; „Cofnij” – oba dni jak przed', async () => {
    const from = [flex('x', '11:00', 60), flex('y', '12:00', 60)]
    const to = [flex('a', '11:30', 30), flex('b', '13:00', 30)]
    const s = stub({ [D1]: fileOf(D1, from), [D2]: fileOf(D2, to) })
    const r = await changeDayGroup(D1, ['x', 'y'], { k: 'moveTo', date: D2 }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 2, pushed: 2 })
    expect(rels(s)).toEqual([[D2, D1, D2]])
    expect(s.sent[0]!.map((e) => e.after)).toEqual([undefined, [0], [0]])
    expect(startsOf(s.files[D2], D2)).toEqual({ a: lm('13:00'), b: lm('13:30'), x: lm('11:00'), y: lm('12:00') })
    expect(dayFileFrom(s.files[D1]!, D1).movedTo).toEqual({ x: D2, y: D2 })
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(startsOf(s.files[D1], D1)).toEqual({ x: lm('11:00'), y: lm('12:00') })
    expect(startsOf(s.files[D2], D2)).toEqual({ a: lm('11:30'), b: lm('13:00') })
  })

  it('dzień miniony jako cel – nic nie zapisano, wszystkie „miniony”', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]) })
    const r = await changeDayGroup(D1, ['x'], { k: 'moveTo', date: '2098-12-01' }, { at: AT })
    expect(r).toMatchObject({ status: 'refused', changed: 0, skipped: [{ id: 'x', why: 'miniony' }], undo: null })
    expect(s.sent).toEqual([])
  })
})

describe('changeDayGroup – dzień bez pliku: zmiana, która nie ma czego zapisać w pliku, go nie tworzy', () => {
  const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2020-01-01', blocks: [{ id: 'an', categoryId: 'analiza', startMin: lm('05:00'), durationMin: 120 }] }] })!
  const templateBlock = () => createDay({ date: TODAY, changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null }).blocks.find((b) => b.origin === 'template')!

  it('koszt samego zaczętego bloku szablonu: tylko zdarzenie `block.cost`, żadnego pliku dnia', async () => {
    useData.setState({ templates: [tpl] })
    const b = templateBlock()
    const events = new Scenario({ date: TODAY, plan: [b] }).start(b.id, '05:00').events
    const s = stub({ [TODAY]: null }, { events: { [TODAY]: events } })
    const costs = { head: 2, emotions: 2, senses: 2, body: 0 }
    const r = await changeDayGroup(TODAY, [b.id], { k: 'cost', costs }, { at: AT + 20 * 60_000 })
    expect(r).toMatchObject({ status: 'saved', changed: 1 })
    expect(s.sent).toEqual([])
    expect(s.files[TODAY]).toBeNull()
    expect(s.logged).toEqual([{ k: 'block.cost', day: TODAY, block: b.id, costs }])
  })

  it('usuń bloku, którego już nie ma: nic nie zmieniono, żadnego pliku dnia', async () => {
    const s = stub({ [D1]: null })
    const r = await changeDayGroup(D1, ['gone'], { k: 'remove' }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 0, skipped: [{ id: 'gone', why: 'nie ma' }], undo: null })
    expect(s.sent).toEqual([])
  })
})

describe('changeDayGroup – „Usuń”, „Odwołaj”, „Zaparkuj”', () => {
  it('usuń: Twoje bloki wychodzą z pliku jedną zmianą; „Cofnij” je przywraca', async () => {
    const plan = [flex('a', '11:00', 30, { note: 'n' }), flex('b', '12:00', 30), flex('c', '13:00', 30)]
    const s = stub({ [D1]: fileOf(D1, plan) })
    const r = await changeDayGroup(D1, ['a', 'b'], { k: 'remove' }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(s.sent).toHaveLength(1)
    expect(blocksOf(s.files[D1], D1).map((b) => b.id)).toEqual(['c'])
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(blocksOf(s.files[D1], D1).map((b) => [b.id, b.note]).sort()).toEqual([
      ['a', 'n'],
      ['b', ''],
      ['c', '']
    ])
  })

  it('usuń dziś blok i zakotwiczony do niego: jedno zdarzenie zwolnionego czasu (D368) z obu – nie dwa', async () => {
    const plan = [flex('a', '11:00', 60), flex('b', '11:00', 30, { startMin: null, anchor: 'a' }), flex('c', '13:00', 30)]
    const s = stub({ [TODAY]: fileOf(TODAY, plan) })
    const r = await changeDayGroup(TODAY, ['a', 'b'], { k: 'remove' }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    await vi.waitFor(() => expect(s.logged).toHaveLength(1))
    expect(s.logged[0]).toMatchObject({ k: 'plan.freed', day: TODAY, block: 'a', minutes: 90 })
  })

  it('usuń trwający blok dziś: najpierw kończy go timer (D336), potem plik; „Cofnij” – plik, potem blok otwarty', async () => {
    const plan = [flex('run', '05:00', 60), flex('b', '12:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const r = await changeDayGroup(TODAY, ['run', 'b'], { k: 'remove' }, { at: AT + 10 * 60_000 })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(s.clicks).toEqual([{ a: 'removeBegun', block: 'run', day: TODAY }])
    expect(blocksOf(s.files[TODAY], TODAY)).toEqual([])
    await r.undo!()
    expect(s.clicks.at(-1)).toEqual({ a: 'undoRemove', block: 'run', day: TODAY })
    expect(blocksOf(s.files[TODAY], TODAY).map((b) => b.id).sort()).toEqual(['b', 'run'])
  })

  it('zaparkuj: proces główny dostaje całą grupę naraz; „Cofnij” – jego identyfikatory zdarzeń', async () => {
    const plan = [flex('a', '11:00', 30), flex('b', '12:00', 30)]
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { groupLog: { ok: true, why: null, confirm: null, written: ['pca-1', 'pca-2'], taken: ['a', 'b'], skipped: [] }, undoGroupLog: { ok: true, why: null, confirm: null, restored: ['a'], kept: ['b'] } })
    const r = await changeDayGroup(TODAY, ['a', 'b'], { k: 'park' }, { at: AT })
    expect(s.rd.groupLog).toHaveBeenCalledWith(TODAY, 'park', ['a', 'b'])
    expect(r).toMatchObject({ status: 'saved', changed: 2, skipped: [] })
    expect(s.sent).toEqual([])
    expect(await r.undo!()).toEqual({ saved: true, restored: 1, kept: 1 })
    expect(s.rd.undoGroupLog).toHaveBeenCalledWith(TODAY, ['pca-1', 'pca-2'])
    // A second „Cofnij”: the events are undone already – nothing restored (the main process says which blocks it undid).
    vi.mocked(s.rd.undoGroupLog!).mockResolvedValueOnce({ ok: true, why: null, confirm: null, restored: [], kept: [] })
    expect(await r.undo!()).toEqual({ saved: true, restored: 0, kept: 0 })
  })

  it('odwołaj w dniu przyszłym – nic (działanie dnia dzisiejszego): „nie dziś”', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '11:00', 30)]) })
    const r = await changeDayGroup(D1, ['a'], { k: 'cancel' }, { at: AT })
    expect(r).toMatchObject({ status: 'refused', skipped: [{ id: 'a', why: 'nie dziś' }] })
    expect(s.rd.groupLog).not.toHaveBeenCalled()
  })
})

describe('changeTemplateGroup – „Szablony”: jedna zmiana wersji', () => {
  const FROM = '2026-11-16' // a Monday: the day has the sessions of the layer (not blocks of the version)
  const tb = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => planBlock({ id, categoryId: 'inne', startMin: lm(at), durationMin: min, origin: 'template', ...o })

  /** The template in the window's view (its raw record, read again after every edit – as the window's view). */
  function page(blocks: PlanBlock[], o: { attachmentsUnread?: boolean } = {}) {
    const t: Template = { id: 'zw', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [{ from: '2000-01-01', blocks, budgetMin: null, maxMin: null }], archived: false }
    let raw: RawRecord = templateJson(t)
    const view = () => ({ today: '2026-11-14', status: 'open', rd: null, templates: [raw], lectures: [], requests: [], routines: [], series: [], seriesDays: {}, attachments: [], attachmentsUnread: o.attachmentsUnread === true }) as unknown as DataView
    const sent: EditEntry[][] = []
    const rd: Partial<RdApi> = {
      edit: async (entries) => {
        sent.push(entries)
        for (const e of entries) raw = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, raw)
        return entries.map(() => ({ status: 'applied' as const }))
      },
      dataView: async () => view()
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: view(), templates: [t], rd: rdFrom(undefined) })
    const version = () => templateFrom(raw)!.versions.find((v) => v.from === FROM)?.blocks ?? []
    const day = () => templateDayOf(t, versionFrom(t, FROM), sampleDay(t, FROM), { changes: rdFrom(undefined).settings, lectures: [], routines: [] })
    return { sent, version, day, target: { templateId: 'zw', from: FROM } }
  }
  const starts = (blocks: readonly PlanBlock[]) => Object.fromEntries(blocks.map((b) => [b.id, b.startMin]))

  it('podkategoria dwóch bloków: jedna zmiana wersji od daty strony; „Cofnij” – podkategoria wraca', async () => {
    const p = page([tb('a', '18:00', 60), tb('b', '19:00', 60), tb('c', '20:00', 60)])
    const r = await changeTemplateGroup(p.target, ['a', 'b'], { k: 'category', categoryId: 'analiza', variantId: null })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(p.sent).toHaveLength(1)
    expect(p.version().map((b) => [b.id, b.categoryId])).toEqual([
      ['a', 'analiza'],
      ['b', 'analiza'],
      ['c', 'inne']
    ])
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(p.version().map((b) => b.categoryId)).toEqual(['inne', 'inne', 'inne'])
  })

  it('„Przesuń o +30” dwóch bloków: w godzinach szablonu, kolejny rozsunięty w tej samej zmianie', async () => {
    const p = page([tb('a', '18:00', 60), tb('b', '19:00', 60), tb('c', '20:00', 60)])
    const r = await changeTemplateGroup(p.target, ['a', 'b'], { k: 'shift', minutes: 30 })
    expect(r).toMatchObject({ status: 'saved', changed: 2, pushed: 1 })
    expect(p.sent).toHaveLength(1)
    expect(starts(p.version())).toEqual({ a: lm('18:30'), b: lm('19:30'), c: lm('20:30') })
  })

  it('dwa szybkie „Przesuń o +15”: drugie liczone z szablonu po pierwszym (A6-01) – razem +30', async () => {
    const p = page([tb('a', '18:00', 60), tb('b', '20:00', 60)])
    const [one, two] = await Promise.all([changeTemplateGroup(p.target, ['a'], { k: 'shift', minutes: 15 }), changeTemplateGroup(p.target, ['a'], { k: 'shift', minutes: 15 })])
    expect([one.status, two.status]).toEqual(['saved', 'saved'])
    expect(starts(p.version())).toEqual({ a: lm('18:30'), b: lm('20:00') })
  })

  it('usuń – bloki wychodzą z wersji, „Cofnij” je przywraca; działania dnia – odmowa', async () => {
    const p = page([tb('a', '18:00', 60), tb('b', '19:00', 60), tb('c', '20:00', 60)])
    const r = await changeTemplateGroup(p.target, ['a', 'c'], { k: 'remove' })
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(p.version().map((b) => b.id)).toEqual(['b'])
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    // The queue lays an item brought back by its id (the list's order in the file is the queue's – as the „Cofnij” of one removal).
    expect(p.version().map((b) => b.id).sort()).toEqual(['a', 'b', 'c'])
    expect((await changeTemplateGroup(p.target, ['a'], { k: 'park' })).status).toBe('refused')
  })

  it('usuń, gdy listy załączników nie da się odczytać – odmowa jak „Usuń z szablonu” (D415), nic nie zapisane', async () => {
    const p = page([tb('a', '18:00', 60), tb('b', '19:00', 60)], { attachmentsUnread: true })
    const r = await changeTemplateGroup(p.target, ['a'], { k: 'remove' })
    expect(r).toMatchObject({ status: 'failed', changed: 0, undo: null })
    expect(p.sent).toEqual([])
    expect(useUi.getState().toasts.at(-1)?.text).toBe(ATTACHMENTS_UNREAD_TEXT)
  })

  it('zmiana, która nie zapisuje niczego (sesja warstwy – nie blok wersji): zmieniono 0, bez „Cofnij”', async () => {
    const p = page([tb('a', '18:00', 60)])
    const session = p.day().ctx.plan.find((b) => b.origin === 'session')!
    const r = await changeTemplateGroup(p.target, [session.id], { k: 'category', categoryId: 'analiza', variantId: null })
    expect(r).toMatchObject({ status: 'saved', changed: 0, undo: null })
    expect(p.sent).toEqual([])
  })
})
