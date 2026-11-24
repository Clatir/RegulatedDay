// @vitest-environment jsdom
/**
 * „Rozłóż w luki” of the morning plan (D624, N5) from the window: the sprawy of „Dziś” without a block, in the list's order, into today's
 * free gaps – counted in the turn of the write on the day's file just read and written in one edit (the day's file once and the records,
 * each block the one tried, nothing pushed); the line of „Dziś” „Zaplanowano 2 sprawy w lukach · 1 się nie zmieściła · Cofnij”, its „Cofnij”
 * takes the blocks away and the sprawy are on „Dziś” again without a block; a sprawa planned meanwhile is left out and its block stays;
 * nothing planned – a toast, no line; the button stands in the morning plan only while there is such a sprawa.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { caseItems } from '@shared/engine/cases'
import { SKIP } from '@shared/engine/casesGroup'
import { idxOfLogical } from '@shared/engine/grid'
import { REQUEST_CATEGORY } from '@shared/model/categories'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { DEFAULT_SESSIONS } from '@shared/model/settings'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { GapFillButton } from '@renderer/features/cases/GapFillButton'
import { lowestEnergyChange } from '@renderer/features/cases/groupPlan'
import { gapCases, gapLineText, NO_GAP_TEXT, nothingPlannedText, notFitText, planInGaps, spreadInGaps } from '@renderer/features/cases/gapFill'
import { DAY_UNREADABLE } from '@renderer/store/cases'
import { undoGroup } from '@renderer/store/casesGroup'
import { useData } from '@renderer/store/data'
import { countDay, type DayModel } from '@renderer/store/day'
import { clearGroupLine, undoGroupLine, useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

const data = useData.getState()
const TODAY = logicalDayOf(Date.now())
const AT = placeLogical(TODAY, lm('08:00'))
let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  // „Now” is 08:00 of today for the window and for the turn of the write.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  clearGroupLine('today')
  delete (window as unknown as { rd?: unknown }).rd
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  vi.useRealTimers()
})

const rel = (id: string) => paths.record('request', id)
/** A task of „Dziś”; `n` – its place in the list (a newer one stands higher: the first has the latest instant). */
const task = (id: string, estimateMin: number, n = 0, p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask(id, AT - n * 1000, TODAY, { title: `zadanie ${id}`, estimateMin, list: 'today', ...p })!

/** Today's file: an ordinary day without its sessions (nothing else stands between the blocks), `blocks` yours. */
const fileOf = (blocks: ReadonlyArray<PlanBlock | Record<string, unknown>>): RawRecord => ({ schema: 1, date: TODAY, dayType: 'zwykly', sessions: Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no'])), blocks: blocks.map((b) => ({ ...b })) })
const dataOf = (dayFile: RawRecord | null, events: unknown[] = []) => ({ date: TODAY, dayFile, nextFile: null, prevFile: null, events, complete: true, unknown: false, away: false })

/**
 * The folder behind the window: `dayData` and `caseDays` read what the edits left (`lay`), as the folder would; `gone` – the blocks gone in
 * today's log, `events` – today's log.
 */
function stub(records: RawRecord[], file: RawRecord | null, o: { gone?: string[]; events?: unknown[]; unread?: string[] } = {}) {
  const sent: EditEntry[][] = []
  /** The days each `caseDays` asked for; `unread` – days the folder cannot read now. */
  const asked: string[][] = []
  const state = { records: [...records], days: { [TODAY]: file } as Record<string, RawRecord | null> }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    dayData: async (date) => dataOf(state.days[date] ?? null, o.events),
    caseDays: async (dates) => {
      asked.push([...dates])
      const known = dates.filter((d) => d in state.days && !o.unread?.includes(d))
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, d === TODAY ? (o.gone ?? []) : []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  const set = (r: string, v: RawRecord | null) => {
    if (r.startsWith('days/')) state.days[r.slice(10, 20)] = v
    else state.records = [...state.records.filter((x) => rel(String(x.id)) !== r), ...(v ? [v] : [])]
    useData.setState({ view: view(), requests: state.records.map((x) => requestFrom(x)!) })
  }
  const lay = (undo: ReadonlyArray<{ rel: string; after: RawRecord | null }>) => undo.forEach((u) => set(u.rel, u.after))
  const record = (id: string) => state.records.find((x) => x.id === id)
  const raw = () => state.days[TODAY] ?? null
  const day = () => dayFileFrom(raw(), TODAY)
  return { sent, set, lay, record, day, raw, asked }
}

/** The plan's inputs of the window now. */
const inputsNow = () => {
  const { rd, templates, lectures, seriesPlans, routines } = useData.getState()
  return { changes: rd.settings, templates, lectures, series: seriesPlans, routines }
}
/** „Dziś” as the window counts it now (08:00) from its file. */
const modelOf = (file: RawRecord | null): DayModel => {
  return countDay(TODAY, dataOf(file), inputsNow(), Date.now(), false)
}
/** Where the day shows each block (its forecast), by id. */
const shownOf = (file: RawRecord | null) => new Map(modelOf(file).state.forecast.map((p) => [p.block.id, [p.from, p.to]]))

const own = (id: string, at: string, min: number, more: Partial<Parameters<typeof block>[0]> = {}) => block({ id, cat: 'inne', at, min, origin: 'user', ...more })
/** Today at 08:00 with two gaps before the maximum (19:00): 10:00–10:30 and 12:00–12:45. */
const twoGaps = () => fileOf([own('a', '08:00', 120), own('b', '10:30', 90), own('c', '12:45', 375)])

const itemsOf = (records: RawRecord[], file: RawRecord | null) => caseItems(records.map((r) => requestFrom(r)!), TODAY, (d) => (d === TODAY ? dayFileFrom(file, TODAY) : null))

describe('„Rozłóż w luki” – które sprawy i w jakiej kolejności', () => {
  it('sprawy „Dziś” bez bloku, niezrobione, w kolejności listy (termin, priorytet, potem najnowsze); prośba tylko z modułem próśb', () => {
    const file = { schema: 1, date: TODAY, blocks: [{ id: 'blk', categoryId: 'inne', startMin: lm('09:00'), durationMin: 30, origin: 'user', task: 'planned' }] }
    const request = { ...newRequest('r', AT - 3000, { person: null, estimateMin: 15, note: 'oddzwonić' }), list: 'today', listDay: TODAY }
    const records = [
      task('old', 30, 5),
      task('new', 30, 1),
      task('p1', 30, 9, { priority: 'p1' }),
      task('due', 30, 9, { dueDate: TODAY }),
      { ...task('planned', 30, 0), day: TODAY, block: 'blk', state: 'planned' },
      task('done', 30, 0, { list: 'done' }),
      task('inbox', 30, 0, { list: 'inbox' }),
      request
    ]
    const items = itemsOf(records, file)
    expect(gapCases(items, true).map((x) => x.record.id)).toEqual(['due', 'p1', 'new', 'r', 'old'])
    expect(gapCases(items, false).map((x) => x.record.id)).toEqual(['due', 'p1', 'new', 'old'])
  })

  it('linia: „1 się nie zmieściła” / „2 … zmieściły” / „5 … zmieściło”, bez drugiej części, gdy zmieściły się wszystkie; najniższa energia jak w innych zmianach grupowych; nic nie zaplanowano – dymek', () => {
    expect([1, 2, 5, 22].map(notFitText)).toEqual(['1 się nie zmieściła', '2 się nie zmieściły', '5 się nie zmieściło', '22 się nie zmieściły'])
    expect(gapLineText({ changed: 3, skipped: [] }, 1)).toBe('Zaplanowano 3 sprawy w lukach · 1 się nie zmieściła')
    expect(gapLineText({ changed: 2, skipped: [] }, 0)).toBe('Zaplanowano 2 sprawy w lukach')
    expect(gapLineText({ changed: 3, skipped: [] }, 1, { from: 52, to: 44 })).toBe('Zaplanowano 3 sprawy w lukach · 1 się nie zmieściła · najniższa energia 52 → 44')
    expect(gapLineText({ changed: 1, skipped: [{ id: 'x', reason: 'zrobiona' }] }, 0, { from: 52, to: 52 })).toBe('Zaplanowano 1 sprawa w lukach · pominięto 1: zrobiona')
    expect(nothingPlannedText({ skipped: [] }, 2)).toBe(NO_GAP_TEXT)
    expect(nothingPlannedText({ skipped: [{ id: 'x', reason: SKIP.planned }] }, 1)).toBe('Nic nie zaplanowano w lukach · 1 się nie zmieściła · pominięto 1: już zaplanowana')
  })
})

describe('„Rozłóż w luki” – zapis i „Cofnij”', () => {
  it('trzy sprawy w dwóch lukach: dwie stoją (10:00, 12:00) jedną edycją, bloki dnia na miejscach; linia „Zaplanowano 2 sprawy w lukach · 1 się nie zmieściła”', async () => {
    const file = twoGaps()
    const model = modelOf(file)
    const records = [task('t1', 30, 0), task('t2', 45, 1), task('t3', 30, 2)]
    const { sent, lay, record, day, raw } = stub(records, file)
    const r = await spreadInGaps(model, gapCases(itemsOf(records, file), true))
    expect(r).toMatchObject({ saved: true, changed: 2, notFit: ['t3'], moved: 0, skipped: [] })
    expect(r.blocks.map((x) => [x.id, x.block.startMin, x.block.durationMin])).toEqual([
      ['t1', lm('10:00'), 30],
      ['t2', lm('12:00'), 45]
    ])
    // One edit: the day's file once and the two records planned; the third is not written.
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), rel('t1'), rel('t2')].sort())
    expect(useGroupLine.getState().lines.today?.text).toBe('Zaplanowano 2 sprawy w lukach · 1 się nie zmieściła')
    lay(r.undo)
    // Nothing pushed apart: the blocks of the day where they were, the new ones in the gaps.
    expect(day().blocks.map((b) => [b.id, b.startMin]).sort()).toEqual([['a', lm('08:00')], ['b', lm('10:30')], ['c', lm('12:45')], ...r.blocks.map((x) => [x.block.id, x.block.startMin])].sort())
    expect(record('t1')).toMatchObject({ day: TODAY, block: r.blocks[0]!.block.id, state: 'planned' })
    expect(record('t3')).toMatchObject({ day: null, block: null, list: 'today' })
    // „Cofnij”: the blocks go, the sprawy are on „Dziś” again without a block.
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 2, kept: 0, daysKept: 0 })
    lay(back.undo)
    expect(day().blocks.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    for (const id of ['t1', 't2']) expect(record(id)).toMatchObject({ day: null, block: null, list: 'today', state: 'queued' })
    expect(gapCases(itemsOf([record('t1')!, record('t2')!, record('t3')!], raw()), true).map((x) => x.record.id)).toEqual(['t1', 't2', 't3'])
  })

  it('„Cofnij” z linii „Dziś” zdejmuje bloki i przywraca sprawy – jedna edycja; linia znika', async () => {
    const file = twoGaps()
    const records = [task('t1', 30, 0), task('t2', 45, 1)]
    const { sent, lay } = stub(records, file)
    const r = await spreadInGaps(modelOf(file), gapCases(itemsOf(records, file), true))
    expect(useGroupLine.getState().lines.today?.text).toBe('Zaplanowano 2 sprawy w lukach')
    lay(r.undo)
    await undoGroupLine('today')
    expect(useGroupLine.getState().lines.today).toBeUndefined()
    expect(sent).toHaveLength(2)
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), rel('t1'), rel('t2')].sort())
    for (const id of ['t1', 't2']) expect(sent[1]!.find((e) => e.rel === rel(id))!.edits.find((e) => e.path.join('.') === 'block')!.value).toBeNull()
  })

  it('prośba idzie blokiem próśb (jak „Zaplanuj” jednej), za buforem przejścia po innej kategorii', async () => {
    const file = twoGaps()
    const request = { ...newRequest('r', AT, { person: null, estimateMin: 15, note: 'oddzwonić' }), list: 'today', listDay: TODAY }
    const { sent } = stub([request], file)
    const r = await planInGaps(modelOf(file), gapCases(itemsOf([request], file), true))
    expect(r).toMatchObject({ saved: true, changed: 1, notFit: [] })
    expect(r.blocks[0]!.block).toMatchObject({ categoryId: REQUEST_CATEGORY, requests: ['r'], startMin: lm('10:05'), durationMin: 15 })
    expect(sent).toHaveLength(1)
  })

  it('żadna się nie mieści – dymek „Żadna sprawa nie mieści się w lukach dnia”, nic nie zapisane, bez linii', async () => {
    const file = fileOf([own('a', '08:00', 660)])
    const records = [task('t1', 30, 0)]
    const { sent } = stub(records, file)
    expect(await spreadInGaps(modelOf(file), gapCases(itemsOf(records, file), true))).toMatchObject({ saved: true, changed: 0, notFit: ['t1'] })
    expect(sent).toEqual([])
    expect(useGroupLine.getState().lines.today).toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([NO_GAP_TEXT])
  })

  it('wynik nie zależy od losowego id bloku: 24 razy ten sam – remis z blokiem pokazanym później (za stałym) pominięty, bez remisu – 10:00 i dzień po zapisie nic nie przesuwa', async () => {
    // „i” planned at 10:00 jumps behind the fixed „fx” (10:30–11:00) to 11:00; at 10:00 the forecast would order the sprawa and „i” by ids.
    for (const [at, result] of [['10:00', 'skipped'], ['10:05', 'placed']] as const) {
      for (let k = 0; k < 24; k++) {
        const file = fileOf([own('a', '08:00', 120), own('i', at, 60), own('fx', '10:30', 30, { fixed: true }), own('c', '12:00', 420)])
        const records = [task(`t${k}`, 30, 0)]
        const { lay, raw } = stub(records, file)
        const before = shownOf(file)
        const r = await planInGaps(modelOf(file), gapCases(itemsOf(records, file), true))
        lay(r.undo)
        const after = shownOf(raw())
        for (const [id, span] of before) expect([id, after.get(id)]).toEqual([id, span])
        if (result === 'skipped') expect(r).toMatchObject({ saved: true, changed: 0, notFit: [`t${k}`] })
        else {
          expect(r).toMatchObject({ saved: true, changed: 1, notFit: [] })
          const g = modelOf(file).state.grid
          expect(after.get(r.blocks[0]!.block.id)).toEqual([idxOfLogical(g, lm('10:00')), idxOfLogical(g, lm('10:30'))])
        }
      }
    }
  })

  it('linia: najniższa energia „przed” z pliku dnia przeczytanego w turze zapisu (nie z tego, który pokazuje okno)', async () => {
    const s = new Scenario({ date: TODAY, plan: [] }).observe('06:30', null).checkin('07:00', { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
    const shown = twoGaps()
    const model = countDay(TODAY, dataOf(shown, s.events), inputsNow(), Date.now(), true)
    // Another computer added two hours of work after the maximum meanwhile: the file the turn reads.
    const fresh = fileOf([...dayFileFrom(shown, TODAY).blocks, own('x', '19:00', 180, { cat: 'analiza' })])
    const lowestOf = (file: RawRecord) => lowestEnergyChange(model, file)!.to
    expect(lowestOf(fresh)).not.toBe(lowestOf(shown))
    const records = [task('t1', 30, 0)]
    const { set } = stub(records, shown, { events: s.events })
    set(paths.day(TODAY), fresh)
    const r = await planInGaps(model, gapCases(itemsOf(records, shown), true))
    expect(r.changed).toBe(1)
    expect(r.energy?.from).toBe(lowestOf(fresh))
  })

  it('miejsce liczone w turze zapisu na świeżym pliku dnia: blok dopisany po wyświetleniu (w luce 10:00) – sprawa idzie do następnej luki, bez nakładania', async () => {
    const file = twoGaps()
    const model = modelOf(file)
    const records = [task('t1', 30, 0)]
    const items = gapCases(itemsOf(records, file), true)
    // Another computer put a block into the first gap meanwhile: the window still shows the day without it.
    const { set, lay, raw } = stub(records, file)
    set(paths.day(TODAY), fileOf([own('a', '08:00', 120), own('x', '10:00', 30), own('b', '10:30', 90), own('c', '12:45', 375)]))
    const r = await planInGaps(model, items)
    expect(r.blocks.map((x) => [x.id, x.block.startMin])).toEqual([['t1', lm('12:00')]])
    const before = shownOf(raw())
    lay(r.undo)
    const after = shownOf(raw())
    for (const [id, span] of before) expect([id, after.get(id)]).toEqual([id, span])
  })

  it('sprawa zaplanowana w międzyczasie – pominięta „już zaplanowana”, jej blok zostaje na miejscu; nic innego – dymek zamiast linii; z inną – linia', async () => {
    const file = twoGaps()
    const model = modelOf(file)
    const records = [task('t1', 30, 0), task('t2', 45, 1)]
    const items = gapCases(itemsOf(records, file), true)
    const { set, sent, lay, record, day } = stub(records, file)
    // „t1” planned on another computer at 15:00 since the window counted its list.
    const planned = fileOf([...dayFileFrom(file, TODAY).blocks, { id: 'own-t1', categoryId: 'inne', startMin: lm('15:00'), durationMin: 30, origin: 'user', task: 't1' }])
    set(paths.day(TODAY), planned)
    set(rel('t1'), { ...record('t1')!, day: TODAY, block: 'own-t1', state: 'planned' })
    const only = await spreadInGaps(model, items.filter((x) => x.record.id === 't1'))
    expect(only).toMatchObject({ saved: true, changed: 0, skipped: [{ id: 't1', reason: SKIP.planned }] })
    expect(sent).toEqual([])
    expect(useGroupLine.getState().lines.today).toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Nic nie zaplanowano w lukach · pominięto 1: już zaplanowana'])
    // With another one: that one stands, „t1” keeps its block at 15:00.
    const r = await spreadInGaps(model, items)
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 't1', reason: SKIP.planned }] })
    expect(useGroupLine.getState().lines.today?.text).toBe('Zaplanowano 1 sprawa w lukach · pominięto 1: już zaplanowana')
    lay(r.undo)
    expect(day().blocks.find((b) => b.id === 'own-t1')?.startMin).toBe(lm('15:00'))
    expect(record('t1')).toMatchObject({ block: 'own-t1' })
    expect(sent[0]!.some((e) => e.rel === rel('t1'))).toBe(false)
  })
})

describe('„Rozłóż w luki” – sprawy, które zmieniły się w międzyczasie', () => {
  it('blok sprawy zdjęty w logu dnia (zaparkowany przed startem) – sprawa nie jest zaplanowana i trafia w lukę, stary blok wychodzi z dnia', async () => {
    const file = fileOf([...dayFileFrom(twoGaps(), TODAY).blocks, { id: 'old-t1', categoryId: 'inne', startMin: lm('19:30'), durationMin: 30, origin: 'user', task: 't1' }])
    const records = [{ ...task('t1', 30, 0), day: TODAY, block: 'old-t1', state: 'planned' }]
    const items = gapCases(caseItems(records.map((r) => requestFrom(r)!), TODAY, (d) => (d === TODAY ? dayFileFrom(file, TODAY) : null), (d) => (d === TODAY ? new Set(['old-t1']) : undefined)), true)
    expect(items.map((x) => x.record.id)).toEqual(['t1'])
    const { lay, day } = stub(records, file, { gone: ['old-t1'] })
    const r = await planInGaps(modelOf(file), items)
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [] })
    expect(r.blocks[0]!.block.startMin).toBe(lm('10:00'))
    lay(r.undo)
    expect(day().blocks.map((b) => b.id)).not.toContain('old-t1')
  })

  it('dzień sprawy nieczytelny teraz – ta sprawa pominięta jako zaplanowana, inne zaplanowane (nie odmowa całości)', async () => {
    const file = twoGaps()
    const other = '2099-01-01'
    const records = [{ ...task('t1', 30, 0), day: other, block: 'far', state: 'planned' }, task('t2', 30, 1)]
    // The window listed both without a block (as it read them before); the day of „t1” cannot be read now (not in the folder's answer).
    const items = gapCases(itemsOf(records, file), true)
    expect(items.map((x) => x.record.id)).toEqual(['t1', 't2'])
    stub(records, file)
    const r = await planInGaps(modelOf(file), items)
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 't1', reason: SKIP.planned }] })
    expect(r.blocks.map((x) => [x.id, x.block.startMin])).toEqual([['t2', lm('10:00')]])
  })

  it('dzień osi (dziś) nieczytelny teraz – nic nie zapisane („Nie mogę teraz odczytać…”), bez linii', async () => {
    const file = twoGaps()
    const records = [task('t1', 30, 0)]
    const items = gapCases(itemsOf(records, file), true)
    const { sent } = stub(records, file, { unread: [TODAY] })
    const r = await spreadInGaps(modelOf(file), items)
    expect(r).toMatchObject({ saved: false, error: DAY_UNREADABLE, changed: 0, notFit: [] })
    expect(sent).toEqual([])
    expect(useGroupLine.getState().lines.today).toBeUndefined()
  })

  it('nieczytelny dzień kilku spraw czytany raz (nie ponownie dla każdej)', async () => {
    const file = twoGaps()
    const other = '2099-01-01'
    const records = [{ ...task('t1', 30, 0), day: other, block: 'f1', state: 'planned' }, { ...task('t2', 30, 1), day: other, block: 'f2', state: 'planned' }, task('t3', 30, 2)]
    const items = gapCases(itemsOf(records, file), true)
    const { asked } = stub(records, file)
    const r = await planInGaps(modelOf(file), items)
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 't1', reason: SKIP.planned }, { id: 't2', reason: SKIP.planned }] })
    // The first read (today and the day of both), then the day not read once more – not once for each sprawa.
    expect(asked.filter((d) => d.length === 1 && d[0] === other)).toHaveLength(1)
  })

  it('sprawa zdjęta z „Dziś” w międzyczasie – pominięta „nie na Dziś”', async () => {
    const file = twoGaps()
    const records = [task('t1', 30, 0), task('t2', 30, 1)]
    const items = gapCases(itemsOf(records, file), true)
    const { set, record } = stub(records, file)
    set(rel('t1'), { ...record('t1')!, list: 'week', listDay: null, listSetDay: TODAY })
    const r = await planInGaps(modelOf(file), items)
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 't1', reason: SKIP.notToday }] })
    expect(r.blocks.map((x) => x.id)).toEqual(['t2'])
  })
})

describe('„Rozłóż w luki” – przycisk planu porannego', () => {
  async function render(node: Parameters<Root['render']>[0]): Promise<void> {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(node))
  }
  const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  it('bez niezaplanowanej sprawy „Dziś” – brak przycisku; z nią – „Rozłóż w luki”, klik zapisuje i pokazuje linię', async () => {
    const file = twoGaps()
    const model = modelOf(file)
    const records = [task('t1', 30, 0), task('t2', 45, 1), task('t3', 30, 2)]
    const { sent } = stub(records, file)
    await render(createElement(GapFillButton, { model, items: [] }))
    expect(q('queue-gaps')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    root = host = null
    await render(createElement(GapFillButton, { model, items: gapCases(itemsOf(records, file), true) }))
    expect(q('queue-gaps')?.textContent).toBe('Rozłóż w luki')
    await act(async () => q('queue-gaps')!.click())
    expect(sent).toHaveLength(1)
    expect(useGroupLine.getState().lines.today?.text).toBe('Zaplanowano 2 sprawy w lukach · 1 się nie zmieściła')
  })
})
