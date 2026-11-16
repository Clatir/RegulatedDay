// @vitest-environment jsdom
/**
 * Przeciąganie grupy (D531) – gest i zapis: na osi („Dziś”, „Szablony”) przeciągnięcie zaznaczonego bloku grupy pokazuje w trakcie każdy
 * zaznaczony na nowym miejscu z przerywaną obwódką, Esc odwołuje, Ctrl – kopie grupy; w „Tygodniu” widać miejsce każdego zaznaczonego, puszczenie
 * przenosi wszystkie o tę samą różnicę dni i minut jedną zmianą (docelowy najpierw, T952), linia „Przeniesiono 2 bloki · … · Cofnij” nad kolumnami,
 * jedno „Cofnij” przywraca oba dni; blok zaczęty zostaje i jest policzony; Ctrl – kopia (oryginały zostają), „Cofnij” zdejmuje kopie.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import type { DragPreview } from '@shared/engine/groupDrag'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import type { AnyEvent } from '@shared/model/events'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { dragDayGroup, dragTemplateGroup, templateDragPreview } from '@renderer/features/plan/groupDrag'
import { axisSources } from '@renderer/features/templates/sessionChoices'
import { sampleDay, templateDayOf, versionFrom } from '@renderer/features/templates/templateDay'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { WEEK_PPM } from '@renderer/features/week/weekLayout'
import { installEscape } from '@renderer/lib/escape'
import { inTurn, useData } from '@renderer/store/data'
import { undoGroupLine, useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// Far ahead of the real clock (the write counts „today” from it): every day of the test is a day to come. The default day has sessions
// 08:00–11:00 and 14:00–17:00 – the blocks stand between them.
const TODAY = '2098-12-31'
const MON = '2099-01-05'
const TUE = '2099-01-06'
const WED = '2099-01-07'
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: readonly PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const startsOf = (raw: RawRecord | null | undefined, date: string) => Object.fromEntries(dayFileFrom(raw ?? {}, date).blocks.map((b) => [b.id, b.startMin]))

const data = useData.getState()
// jsdom has no `scrollIntoView`: a test that needs it sets it, `afterEach` puts back what was there (nothing).
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
  useGroupLine.setState({ lines: {} })
})

/** The folder as the window sees it: the day files change as the edits apply (every edit sent kept, in its order). */
function stub(start: Record<string, RawRecord | null>, o: { events?: Record<string, AnyEvent[]>; broken?: (call: number, date: string) => boolean } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const dayFiles = vi.fn(async (dates: readonly string[]) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])))
  const rd: Partial<RdApi> = {
    dayFiles,
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: o.events?.[date] ?? [], complete: true, unknown: false, away: false }) as DayData,
    edit: async (entries) => {
      sent.push(entries)
      const call = sent.length
      return entries.map((e) => {
        const date = dateOf(e.rel)
        // A broken file (`broken`) is not written: its entry answers so.
        if (o.broken?.(call, date)) return { status: 'broken' as const }
        if (e.rel.startsWith('days/')) files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status: 'applied' as const }
      })
    },
    planPushed: async () => undefined,
    dataView: async () => ({ today: TODAY }) as DataView
  }
  Object.defineProperty(window, 'rd', { value: rd, configurable: true, writable: true })
  useData.setState({ view: { today: TODAY, allDay: [], computers: [], attachments: [] } as unknown as DataView })
  return { files, sent, rd, dayFiles }
}
const lineOf = (view: 'today' | 'week' | 'template') => useGroupLine.getState().lines[view]?.text

describe('zapis przeciągnięcia grupy („Tydzień”): jedna zmiana wszystkich dni, jedno „Cofnij”', () => {
  it('bloki poniedziałku 11:00 i 11:30 na środę o godzinę później: 12:00 i 12:30, kolejny środy rozsunięty; „Cofnij” – oba dni jak przed', async () => {
    const mon = [flex('x', '11:00', 30), flex('y', '11:30', 30)]
    const wed = [flex('w', '12:15', 30)]
    const s = stub({ [MON]: fileOf(MON, mon), [WED]: fileOf(WED, wed) })
    const r = await dragDayGroup({ view: 'week', keys: [{ date: MON, id: 'x' }, { date: MON, id: 'y' }], delta: { days: 2, minutes: 60 }, copy: false })
    expect(r).toMatchObject({ status: 'saved', moved: 2, stayed: [], pushed: 1 })
    // ONE edit: Wednesday brings the blocks (the owner), Monday lets them go after it, then Wednesday's pushed start.
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]!.map((e) => [dateOf(e.rel), e.after])).toEqual([
      [WED, undefined],
      [MON, [0]],
      [WED, [0]]
    ])
    expect(startsOf(s.files[WED], WED)).toEqual({ w: lm('13:00'), x: lm('12:00'), y: lm('12:30') })
    expect(dayFileFrom(s.files[MON]!, MON).movedTo).toEqual({ x: WED, y: WED })
    expect(lineOf('week')).toBe('Przeniesiono 2 bloki')
    await act(() => undoGroupLine('week'))
    expect(startsOf(s.files[MON], MON)).toEqual({ x: lm('11:00'), y: lm('11:30') })
    expect(startsOf(s.files[WED], WED)).toEqual({ w: lm('12:15') })
    expect(lineOf('week')).toBeUndefined()
  })

  it('dzień zmieniony od tego czasu – „Cofnij” zostawia oba dni (blok nigdy na żadnym albo na obu), mówi, ile zostało', async () => {
    const s = stub({ [MON]: fileOf(MON, [flex('x', '11:00', 30), flex('y', '11:30', 30)]), [TUE]: fileOf(TUE, []) })
    await dragDayGroup({ view: 'week', keys: [{ date: MON, id: 'x' }, { date: MON, id: 'y' }], delta: { days: 1, minutes: 0 }, copy: false })
    // Tuesday changed since (another computer moved „x” there): neither day goes back – the block never on neither day nor on both.
    const tue = s.files[TUE]!
    s.files[TUE] = { ...tue, blocks: (tue.blocks as RawRecord[]).map((b) => (b.id === 'x' ? { ...b, startMin: lm('12:45') } : b)) }
    await act(() => undoGroupLine('week'))
    expect(dayFileFrom(s.files[MON]!, MON).movedTo).toEqual({ x: TUE, y: TUE })
    expect(startsOf(s.files[TUE], TUE)).toEqual({ x: lm('12:45'), y: lm('11:30') })
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('2 bloki zmienione od tego czasu – zostały')
  })

  it('blok zaczęty zostaje i jest policzony w linii: „Przeniesiono 1 blok · 1 został – już trwa”', async () => {
    const mon = [flex('run', '05:00', 60), flex('y', '11:30', 30)]
    // „Today” of the write is the day of the blocks: the window's clock at 05:20 of it, „run” begun at 05:00.
    const at = placeLogical(MON, 5 * 60 + 20)
    const events = new Scenario({ date: MON, plan: mon }).start('run', '05:00').events
    const s = stub({ [MON]: fileOf(MON, mon), [TUE]: null }, { events: { [MON]: events } })
    const r = await dragDayGroup({ view: 'week', keys: [{ date: MON, id: 'run' }, { date: MON, id: 'y' }], delta: { days: 1, minutes: 0 }, copy: false, at })
    expect(r).toMatchObject({ status: 'saved', moved: 1, stayed: [{ date: MON, id: 'run', why: 'już trwa' }] })
    expect(lineOf('week')).toBe('Przeniesiono 1 blok · 1 został – już trwa')
    expect(startsOf(s.files[TUE], TUE)).toEqual({ y: lm('11:30') })
  })

  it('Ctrl – kopia grupy: oryginały zostają, kopie o tę samą różnicę z rozsunięciem (kopia na samym starcie „n” – „n” za nią, T1750); „Cofnij” zdejmuje kopie', async () => {
    const tue = [flex('x', '11:00', 30), flex('y', '11:30', 30), flex('n', '12:30', 30)]
    const s = stub({ [TUE]: fileOf(TUE, tue) })
    const r = await dragDayGroup({ view: 'week', keys: [{ date: TUE, id: 'x' }, { date: TUE, id: 'y' }], delta: { days: 0, minutes: 60 }, copy: true })
    expect(r).toMatchObject({ status: 'saved', moved: 2, pushed: 1 })
    const after = dayFileFrom(s.files[TUE]!, TUE).blocks
    expect(after.filter((b) => b.id === 'x' || b.id === 'y').map((b) => b.startMin)).toEqual([lm('11:00'), lm('11:30')])
    const copies = after.filter((b) => !['x', 'y', 'n'].includes(b.id))
    expect(copies.map((b) => b.startMin).sort()).toEqual([lm('12:00'), lm('12:30')])
    expect(startsOf(s.files[TUE], TUE).n).toBe(lm('13:00'))
    expect(lineOf('week')).toBe('Skopiowano 2 bloki')
    await act(() => undoGroupLine('week'))
    expect(startsOf(s.files[TUE], TUE)).toEqual({ x: lm('11:00'), y: lm('11:30'), n: lm('12:30') })
  })

  it('„Cofnij” dwóch dni, z których jeden się nie zapisał: drugie „Cofnij” ponawia tylko ten dzień – cofnięty nie jest liczony jako zmieniony (T1772)', async () => {
    // The first undo (the second edit) meets a broken file of Wednesday: Tuesday goes back, Wednesday waits.
    const s = stub({ [TUE]: fileOf(TUE, [flex('a', '11:00', 30)]), [WED]: fileOf(WED, [flex('b', '11:00', 30)]) }, { broken: (call, date) => call === 2 && date === WED })
    await dragDayGroup({ view: 'week', keys: [{ date: TUE, id: 'a' }, { date: WED, id: 'b' }], delta: { days: 0, minutes: 30 }, copy: false })
    await act(() => undoGroupLine('week'))
    expect(startsOf(s.files[TUE], TUE)).toEqual({ a: lm('11:00') })
    expect(startsOf(s.files[WED], WED)).toEqual({ b: lm('11:30') })
    // The line stays for another try; the second „Cofnij” sends Wednesday alone and says nothing of blocks changed since.
    expect(lineOf('week')).toBe('Przeniesiono 2 bloki')
    useUi.setState({ toasts: [] })
    await act(() => undoGroupLine('week'))
    expect(s.sent.at(-1)!.map((e) => dateOf(e.rel))).toEqual([WED])
    expect(startsOf(s.files[WED], WED)).toEqual({ b: lm('11:00') })
    expect(lineOf('week')).toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text).filter((t) => t.includes('od tego czasu'))).toEqual([])
  })

  it('„dziś” liczone w turze zapisu: przeciągnięcie czekające w kolejce przez 04:00 ocenia dzień już nowy (T1773)', async () => {
    // Monday's blocks dragged a day back, to Sunday. Asked at 03:59 of Sunday's night (Sunday is today then) – the turn comes at 04:01 of Monday.
    const SUN = '2099-01-04'
    const s = stub({ [MON]: fileOf(MON, [flex('x', '11:00', 30), flex('y', '11:30', 30)]) })
    let now = placeLogical(SUN, 27 * 60 + 59)
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    // An edit before it holds the queue (its turn has begun) – the drag waits behind it.
    let open: (() => void) | null = null
    const gate = inTurn(() => new Promise<void>((r) => (open = r)))
    await vi.waitFor(() => expect(open).not.toBeNull())
    const done = dragDayGroup({ view: 'week', keys: [{ date: MON, id: 'x' }, { date: MON, id: 'y' }], delta: { days: -1, minutes: 0 }, copy: false })
    now = placeLogical(MON, 4 * 60 + 1)
    open!()
    await gate
    const r = await done
    // Sunday has gone by in the turn of the write: both stay, nothing written.
    expect(r).toMatchObject({ moved: 0, stayed: [{ id: 'x', why: 'dzień minął' }, { id: 'y', why: 'dzień minął' }] })
    expect(s.sent).toEqual([])
  })

  it('w obrębie dnia „Cofnij” jest „Przesuń o”: wracają pola przeciągnięcia, blok zmieniony od tego czasu zostaje (T1763)', async () => {
    const tue = [flex('a', '11:00', 30), flex('b', '11:30', 30), flex('c', '12:00', 30)]
    const s = stub({ [TUE]: fileOf(TUE, tue) })
    await dragDayGroup({ view: 'week', keys: [{ date: TUE, id: 'a' }, { date: TUE, id: 'b' }], delta: { days: 0, minutes: 30 }, copy: false })
    expect(startsOf(s.files[TUE], TUE)).toEqual({ a: lm('11:30'), b: lm('12:00'), c: lm('12:30') })
    // „c” (pushed apart by the drag) moved by hand since: it stays, „a” and „b” go back.
    const file = s.files[TUE]!
    s.files[TUE] = { ...file, blocks: (file.blocks as RawRecord[]).map((b) => (b.id === 'c' ? { ...b, startMin: lm('13:00') } : b)) }
    await act(() => undoGroupLine('week'))
    expect(startsOf(s.files[TUE], TUE)).toEqual({ a: lm('11:00'), b: lm('11:30'), c: lm('13:00') })
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('1 blok zmieniony od tego czasu – został')
  })

  it('cel poza widokiem – zostają, nic nie zapisano; komunikat zamiast linii', async () => {
    const s = stub({ [MON]: fileOf(MON, [flex('x', '11:00', 30), flex('y', '11:30', 30)]) })
    const r = await dragDayGroup({ view: 'week', keys: [{ date: MON, id: 'x' }, { date: MON, id: 'y' }], delta: { days: 1, minutes: 0 }, copy: false, inView: (d) => d === MON })
    expect(r).toMatchObject({ moved: 0, undo: null })
    expect(s.sent.flat()).toEqual([])
    expect(lineOf('week')).toBeUndefined()
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Przeniesiono 0 bloków · 2 zostały – poza widokiem')
  })
})

describe('zapis przeciągnięcia grupy w „Szablonach” (tylko w obrębie wersji)', () => {
  const FROM = '2026-11-16'
  const tb = (id: string, at: string, min: number): PlanBlock => planBlock({ id, categoryId: 'inne', startMin: lm(at), durationMin: min, origin: 'template' })
  function page(blocks: PlanBlock[]) {
    const t: Template = { id: 'zw', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [{ from: '2000-01-01', blocks, budgetMin: null, maxMin: null }], archived: false }
    let raw: RawRecord = templateJson(t)
    const view = () => ({ today: '2026-11-14', status: 'open', rd: null, templates: [raw], lectures: [], requests: [], routines: [], series: [], seriesDays: {}, attachments: [], attachmentsUnread: false }) as unknown as DataView
    const rd: Partial<RdApi> = {
      edit: async (entries) => {
        for (const e of entries) raw = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, raw)
        return entries.map(() => ({ status: 'applied' as const }))
      },
      dataView: async () => view()
    }
    Object.defineProperty(window, 'rd', { value: rd, configurable: true, writable: true })
    useData.setState({ view: view(), templates: [t], rd: rdFrom(undefined) })
    // The version the page edits from FROM (the one in force then – „Cofnij” of a copy may take the version made for it out again).
    const day = () => templateDayOf(t, versionFrom(t, FROM), sampleDay(t, FROM), { changes: rdFrom(undefined).settings, lectures: [], routines: [] })
    return { version: () => versionFrom(templateFrom(raw)!, FROM).blocks, target: { templateId: 'zw', from: FROM }, day, toVersion: () => axisSources(day().ctx.plan, blocks) }
  }
  const starts = (blocks: readonly PlanBlock[]) => Object.fromEntries(blocks.map((b) => [b.id, b.startMin]))

  it('przesunięcie grupy o +30 min: linia „Przeniesiono 2 bloki”, kolejny rozsunięty; „Cofnij” – jak przed', async () => {
    const p = page([tb('a', '11:00', 30), tb('b', '11:30', 30), tb('c', '12:15', 30)])
    await dragTemplateGroup(p.target, ['a', 'b'], 30, false)
    expect(starts(p.version())).toEqual({ a: lm('11:30'), b: lm('12:00'), c: lm('12:30') })
    expect(lineOf('template')).toBe('Przeniesiono 2 bloki')
    await act(() => undoGroupLine('template'))
    expect(starts(p.version())).toEqual({ a: lm('11:00'), b: lm('11:30'), c: lm('12:15') })
  })

  it('Ctrl – kopie części grupy równoległej bez jej pierwszego bloku zostają grupą: obok kopii pierwszej z części (T1770)', async () => {
    const p = page([tb('r', '11:00', 60), planBlock({ id: 'm1', categoryId: 'inne', startMin: lm('11:00'), alongside: 'r', durationMin: 30, origin: 'template' }), planBlock({ id: 'm2', categoryId: 'inne', startMin: lm('11:00'), alongside: 'r', durationMin: 30, origin: 'template' })])
    await dragTemplateGroup(p.target, ['m1', 'm2'], 120, true)
    const copies = p.version().filter((b) => !['r', 'm1', 'm2'].includes(b.id))
    expect(copies).toHaveLength(2)
    const [first, second] = copies
    expect([first!.alongside, second!.alongside]).toEqual([null, first!.id])
  })

  it('Ctrl – zaznaczony zakotwiczony nie jest kopiowany i jest policzony: „Skopiowano 1 blok · 1 został – zakotwiczony” (T1756)', async () => {
    const p = page([tb('a', '11:00', 30), planBlock({ id: 'z', categoryId: 'inne', startMin: null, anchor: 'a', durationMin: 30, origin: 'template' })])
    await dragTemplateGroup(p.target, ['a', 'z'], 60, true)
    expect(p.version().map((b) => b.id).filter((id) => id !== 'a' && id !== 'z')).toHaveLength(1)
    expect(lineOf('template')).toBe('Skopiowano 1 blok · 1 został – zakotwiczony')
  })

  it('podgląd: zakotwiczony zaznaczony jedzie za kotwicą – wśród przeciąganych, nie rozsuniętych (T1768)', () => {
    const p = page([tb('a', '11:00', 30), planBlock({ id: 'z', categoryId: 'inne', startMin: null, anchor: 'a', durationMin: 30, origin: 'template' }), tb('c', '12:15', 30)])
    const preview = templateDragPreview(p.day(), p.toVersion(), ['a', 'z'], 30, false)!
    expect([...preview.moved.keys()].sort()).toEqual(['a', 'z'])
    expect(Object.fromEntries([...preview.moved].map(([id, x]) => [id, x.startMin]))).toEqual({ a: lm('11:30'), z: lm('12:00') })
    expect([...preview.pushed.keys()]).toEqual(['c'])
  })

  it('Ctrl – kopie grupy w wersji: oryginały zostają, „Skopiowano 2 bloki”; „Cofnij” je zdejmuje', async () => {
    const p = page([tb('a', '11:00', 30), tb('b', '11:30', 30)])
    await dragTemplateGroup(p.target, ['a', 'b'], 60, true)
    const v = p.version()
    expect(v.filter((b) => b.id === 'a' || b.id === 'b').map((b) => b.startMin)).toEqual([lm('11:00'), lm('11:30')])
    expect(v.filter((b) => b.id !== 'a' && b.id !== 'b').map((b) => b.startMin).sort()).toEqual([lm('12:00'), lm('12:30')])
    expect(lineOf('template')).toBe('Skopiowano 2 bloki')
    await act(() => undoGroupLine('template'))
    expect(starts(p.version())).toEqual({ a: lm('11:00'), b: lm('11:30') })
  })
})

describe('gest na osi (Timeline): podgląd całej grupy, Esc, Ctrl – kopia', () => {
  const item = (id: string, startMin: number, endMin: number): TimelineItem => ({ id, startMin, endMin, title: id.toUpperCase(), marks: [], color: '#79AFAB', categoryId: 'inne', background: false, movable: true })
  const items = [item('a', 600, 630), item('b', 660, 690), item('c', 700, 730)]
  /** A pointer event of the left button (jsdom has no PointerEvent: a mouse event with the pointer's id). */
  function pointer(target: EventTarget, type: string, y: number, ctrlKey = false, buttons = 1): void {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: y, button: 0, buttons, ctrlKey })
    Object.defineProperty(e, 'pointerId', { value: 1 })
    act(() => void target.dispatchEvent(e))
  }
  async function mount(o: { preview: (id: string, minutes: number, copy: boolean) => DragPreview | null; drop: (id: string, minutes: number, copy: boolean) => void; onMove?: () => void; onSelect?: () => void }) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const groupDrag = { has: (id: string) => id === 'a' || id === 'b', preview: o.preview, drop: o.drop }
    await act(async () => root!.render(createElement(Timeline, { items, markers: [], selected: null, onSelect: o.onSelect ?? (() => undefined), onMove: o.onMove ?? (() => undefined), onCopy: () => undefined, groupDrag, from: 360, to: 1320 })))
    return (id: string) => host!.querySelector<HTMLElement>(`[data-testid="block-${id}"]`)!
  }
  // Every selected block 30 min later, „c” pushed on: the preview the screen counts (`dragPreview`).
  const preview = (_id: string, minutes: number, copy: boolean): DragPreview =>
    copy
      ? { moved: new Map(), pushed: new Map([['c', { startMin: 730, endMin: 760 }]]), copies: new Map([['a', { startMin: 600 + minutes, endMin: 630 + minutes }], ['b', { startMin: 660 + minutes, endMin: 690 + minutes }]]) }
      : { moved: new Map([['a', { startMin: 600 + minutes, endMin: 630 + minutes }], ['b', { startMin: 660 + minutes, endMin: 690 + minutes }]]), pushed: new Map([['c', { startMin: 720, endMin: 750 }]]), copies: new Map() }

  it('w trakcie każdy zaznaczony stoi na nowym miejscu z przerywaną obwódką, rozsunięty też; puszczenie – jedna zmiana grupy o różnicę', async () => {
    const drop = vi.fn()
    const onMove = vi.fn()
    const tile = await mount({ preview, drop, onMove })
    pointer(tile('a'), 'pointerdown', 100)
    // 33 px down: 30 minutes (1.1 px a minute).
    pointer(tile('a'), 'pointermove', 133)
    expect(tile('b').getAttribute('data-group-moved')).toBe('true')
    expect(tile('b').getAttribute('data-pushed')).toBe('true')
    expect(tile('c').getAttribute('data-pushed')).toBe('true')
    expect(tile('c').getAttribute('data-group-moved')).toBeNull()
    pointer(tile('a'), 'pointerup', 133, false, 0)
    expect(drop).toHaveBeenCalledWith('a', 30, false)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('Esc w trakcie – nic się nie zmienia, zaznaczenie zostaje (Esc jest tylko przeciągnięcia)', async () => {
    const drop = vi.fn()
    const below = vi.fn()
    window.addEventListener('keydown', below)
    const tile = await mount({ preview, drop })
    pointer(tile('a'), 'pointerdown', 100)
    pointer(tile('a'), 'pointermove', 133)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(tile('b').getAttribute('data-pushed')).toBeNull()
    expect(below).not.toHaveBeenCalled()
    pointer(tile('a'), 'pointerup', 133, false, 0)
    expect(drop).not.toHaveBeenCalled()
    window.removeEventListener('keydown', below)
  })

  /** A click of the pointer at (50, `y`) – a mouse's (`detail` 1), as after a press and a release. */
  const click = (target: EventTarget, y: number) => act(() => void target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 50, clientY: y, detail: 1 })))
  const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))

  it('Esc przy wciśniętym bloku grupy jeszcze przed progiem 4 px – gest odwołany, zaznaczenie nietknięte, klik po nim nic nie zaznacza (T1764)', async () => {
    const drop = vi.fn()
    const onSelect = vi.fn()
    const below = vi.fn()
    window.addEventListener('keydown', below)
    const tile = await mount({ preview, drop, onSelect })
    pointer(tile('a'), 'pointerdown', 100)
    escape()
    expect(below).not.toHaveBeenCalled()
    // The drag is over: a move past the 4 px shows nothing, the release drops nothing, its click selects nothing.
    pointer(tile('a'), 'pointermove', 133)
    expect(tile('b').getAttribute('data-pushed')).toBeNull()
    pointer(tile('a'), 'pointerup', 100, false, 0)
    click(tile('a'), 100)
    expect(drop).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    window.removeEventListener('keydown', below)
    // The next press ends the mute: a click is a click again.
    pointer(tile('c'), 'pointerdown', 100)
    pointer(tile('c'), 'pointerup', 100, false, 0)
    click(tile('c'), 100)
    expect(onSelect).toHaveBeenCalledWith('c', { ctrl: false, shift: false })
  })

  it('Esc w trakcie, wskaźnik z powrotem przy miejscu naciśnięcia – klik po puszczeniu nie zastępuje zaznaczenia (T1764)', async () => {
    const onSelect = vi.fn()
    const tile = await mount({ preview, drop: vi.fn(), onSelect })
    pointer(tile('a'), 'pointerdown', 100)
    pointer(tile('a'), 'pointermove', 133)
    escape()
    pointer(tile('a'), 'pointermove', 101)
    pointer(tile('a'), 'pointerup', 101, false, 0)
    click(tile('a'), 101)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('puszczenie w tej samej klatce co ostatni ruch – trzymanie z podglądu miejsca upuszczenia, nie z ostatniego rysunku (T1776)', async () => {
    // At +30 the grabbed „a” goes, at +60 it stays.
    const at = (_id: string, minutes: number): DragPreview => ({ moved: new Map(minutes === 60 ? [] : [['a', { startMin: 600 + minutes, endMin: 630 + minutes }]]), pushed: new Map(), copies: new Map() })
    const drop = vi.fn()
    const tile = await mount({ preview: at, drop })
    pointer(tile('a'), 'pointerdown', 100)
    pointer(tile('a'), 'pointermove', 133)
    // The last move and the release in one turn: no render between them.
    const move = new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 50, clientY: 166, button: 0, buttons: 1 })
    const up = new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 50, clientY: 166, button: 0, buttons: 0 })
    for (const e of [move, up]) Object.defineProperty(e, 'pointerId', { value: 1 })
    act(() => {
      tile('a').dispatchEvent(move)
      tile('a').dispatchEvent(up)
    })
    expect(drop).toHaveBeenCalledWith('a', 60, false)
    expect(tile('a').className).not.toContain('shadow-lg')
  })

  it('wyciszenie po Esc: klik z klawiatury nigdy; gaśnie po puszczeniu, także gdy klik nie przyszedł (T1777)', async () => {
    const onSelect = vi.fn()
    const tile = await mount({ preview, drop: vi.fn(), onSelect })
    pointer(tile('a'), 'pointerdown', 100)
    pointer(tile('a'), 'pointermove', 133)
    escape()
    // A click of the keyboard (Enter on a tile) while the mouse is still held: a click.
    act(() => void tile('b').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })))
    expect(onSelect).toHaveBeenCalledWith('b', { ctrl: false, shift: false })
    onSelect.mockClear()
    // Let go outside the window (no click): the mute ends after the release – the next click of the mouse is one.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      act(() => void window.dispatchEvent(Object.defineProperty(new MouseEvent('pointerup', { bubbles: true, buttons: 0 }), 'pointerId', { value: 1 })))
      act(() => void vi.runOnlyPendingTimers())
    } finally {
      vi.useRealTimers()
    }
    click(tile('a'), 100)
    expect(onSelect).toHaveBeenCalledWith('a', { ctrl: false, shift: false })
  })

  it('chwycony blok, którego reguła zostawia (np. poza dniem) – po upuszczeniu od razu na swoim miejscu, bez 2 s w miejscu upuszczenia (T1767)', async () => {
    // The grabbed „a” stays where it is; „b” goes.
    const stays = (_id: string, minutes: number): DragPreview => ({ moved: new Map([['b', { startMin: 660 + minutes, endMin: 690 + minutes }]]), pushed: new Map(), copies: new Map() })
    const drop = vi.fn()
    const tile = await mount({ preview: stays, drop })
    pointer(tile('a'), 'pointerdown', 100)
    pointer(tile('a'), 'pointermove', 133)
    expect(tile('a').className).toContain('shadow-lg')
    pointer(tile('a'), 'pointerup', 133, false, 0)
    expect(drop).toHaveBeenCalledWith('a', 30, false)
    expect(tile('a').className).not.toContain('shadow-lg')
  })

  it('Ctrl – oryginały zostają na miejscach, kafelek kopii każdego zaznaczonego; puszczenie z Ctrl – kopia grupy', async () => {
    const drop = vi.fn()
    const tile = await mount({ preview, drop })
    pointer(tile('a'), 'pointerdown', 100, true)
    pointer(tile('a'), 'pointermove', 166, true)
    const ghosts = [...host!.querySelectorAll<HTMLElement>('[data-testid="copy-ghost"]')].map((g) => [g.getAttribute('data-of'), g.getAttribute('data-start')])
    expect(ghosts).toEqual([
      ['a', '660'],
      ['b', '720']
    ])
    expect(tile('a').getAttribute('data-pushed')).toBeNull()
    expect(tile('b').getAttribute('data-pushed')).toBeNull()
    pointer(tile('a'), 'pointerup', 166, true, 0)
    expect(drop).toHaveBeenCalledWith('a', 60, true)
  })

  it('blok spoza grupy przeciąga się jak dotąd (jeden)', async () => {
    const drop = vi.fn()
    const onMove = vi.fn()
    const tile = await mount({ preview, drop, onMove })
    pointer(tile('c'), 'pointerdown', 100)
    pointer(tile('c'), 'pointermove', 133)
    pointer(tile('c'), 'pointerup', 133, false, 0)
    expect(onMove).toHaveBeenCalledWith('c', 730)
    expect(drop).not.toHaveBeenCalled()
  })
})

describe('gest w „Tygodniu”: miejsca wszystkich zaznaczonych, zapis i „Cofnij” obu dni', () => {
  const COL_TOP = 100
  const DATES = [MON, TUE, WED]
  const colLeft = (i: number) => 60 + i * 100
  const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
  const hb = (id: string, startMin: number, endMin: number): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false, movable: true })
  const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({ date, when: 'future', read: 'full', dayType: null, templateId: null, frozen: false, blocks, wakeMin: null, bedtimeMin: null, boundary: null, extensionMin: 0, regen: null, studyMin: 0, sessions: { clean: 0, extended: 0, outsidePlan: 0 }, energy: null, budget: null })
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
  function pointer(target: EventTarget, type: string, x: number, y: number, o: { buttons?: number; ctrlKey?: boolean } = {}): void {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: o.buttons ?? 1, ctrlKey: o.ctrlKey === true })
    Object.defineProperty(e, 'pointerId', { value: 1 })
    act(() => void target.dispatchEvent(e))
  }
  const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  /** The columns of `list` on the screen (the grabbed block `grab` at its place), the blocks `keys` selected by Ctrl+click. */
  async function mountWeek(list: HorizonDay[], grab: { date: string; id: string; startMin: number }, keys: ReadonlyArray<[string, string]>) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const id = this.getAttribute('data-testid') ?? ''
      if (id === 'week-body') return rect(60, COL_TOP, 300, 2000)
      const col = DATES.findIndex((d) => id === `week-col-${d}`)
      if (col >= 0) return rect(colLeft(col), COL_TOP, 96, 2000)
      if (id === `week-block-${grab.date}-${grab.id}`) return rect(colLeft(DATES.indexOf(grab.date)), COL_TOP + (grab.startMin - 360) * WEEK_PPM, 96, 30 * WEEK_PPM)
      return rect(0, 0, 0, 0)
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined })))
    for (const [date, id] of keys) act(() => q(`week-block-${date}-${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
  }
  /** Waits for the places of the group (they come once the days are counted): each try lets React draw first. */
  const shownBand = () =>
    vi.waitFor(async () => {
      await act(async () => undefined)
      expect(q('week-group-drop')).not.toBeNull()
    })
  /** The grabbed block held so that its top is at `startMin` of column `col`. */
  function hold(grab: { date: string; id: string; startMin: number }, col: number, startMin: number) {
    pointer(q(`week-block-${grab.date}-${grab.id}`)!, 'pointerdown', colLeft(DATES.indexOf(grab.date)) + 20, COL_TOP + (grab.startMin - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(col) + 20, COL_TOP + (startMin - 360) * WEEK_PPM + 8)
  }

  it('miejsca z oceny upuszczenia (T1765): zakotwiczony zaznaczony ma pasmo za kotwicą; blok, który zostanie (poza widokiem), bez pasma i nieprzyciemniony', async () => {
    // Monday: „x” 11:00 and „z” anchored to it; Wednesday: „v” 11:00. Held a day later: „z” goes with „x”, „v” would go to Thursday – not shown.
    const mon = [flex('x', '11:00', 30), flex('z', '11:00', 30, { startMin: null, anchor: 'x' })]
    stub({ [MON]: fileOf(MON, mon), [WED]: fileOf(WED, [flex('v', '11:00', 30)]) })
    const grab = { date: MON, id: 'x', startMin: 660 }
    const list = [day(MON, [hb('x', 660, 690), { ...hb('z', 690, 720), movable: undefined }]), day(TUE, []), day(WED, [hb('v', 660, 690)])]
    await mountWeek(list, grab, [[MON, 'x'], [MON, 'z'], [WED, 'v']])
    hold(grab, 1, 660)
    await shownBand()
    const bands = [...host!.querySelectorAll<HTMLElement>('[data-testid="week-group-drop"]')].map((b) => [b.getAttribute('data-of'), b.getAttribute('data-start')])
    expect(bands).toEqual([[`${MON}|z`, '690']])
    expect(q(`week-col-${TUE}`)!.contains(q('week-group-drop'))).toBe(true)
    expect(q(`week-block-${WED}-v`)!.className).not.toContain('opacity-40')
    expect(q(`week-block-${MON}-x`)!.className).toContain('opacity-40')
    pointer(window, 'pointerup', colLeft(1) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8, { buttons: 0 })
  })

  it('Ctrl+klik dwóch bloków poniedziałku, przeciągnięcie jednego na środę o godzinę później: miejsce drugiego widać; puszczenie – oba dni, „Cofnij” – jak przed', async () => {
    const mon = [flex('x', '11:00', 30), flex('y', '11:30', 30)]
    const s = stub({ [MON]: fileOf(MON, mon), [WED]: fileOf(WED, [flex('w', '12:15', 30)]) })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const id = this.getAttribute('data-testid') ?? ''
      if (id === 'week-body') return rect(60, COL_TOP, 300, 2000)
      const col = DATES.findIndex((d) => id === `week-col-${d}`)
      if (col >= 0) return rect(colLeft(col), COL_TOP, 96, 2000)
      if (id === `week-block-${MON}-x`) return rect(colLeft(0), COL_TOP + (660 - 360) * WEEK_PPM, 96, 30 * WEEK_PPM)
      return rect(0, 0, 0, 0)
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true })
    const list = [day(MON, [hb('x', 660, 690), hb('y', 690, 720)]), day(TUE, []), day(WED, [hb('w', 735, 765)])]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined })))
    const x = () => q(`week-block-${MON}-x`)!
    act(() => x().dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    act(() => q(`week-block-${MON}-y`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    expect(x().getAttribute('data-marked')).toBe('true')
    // Grasped 8 px under its top; held where its top would be at 12:00 of Wednesday.
    pointer(x(), 'pointerdown', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8)
    expect(q('week-drop')!.getAttribute('data-start')).toBe('720')
    // The places of the others come with the judgement of the drop – once the days are counted.
    await shownBand()
    const band = q('week-group-drop')!
    expect([band.getAttribute('data-of'), band.getAttribute('data-start'), band.getAttribute('data-end')]).toEqual([`${MON}|y`, '750', '780'])
    expect(q(`week-col-${WED}`)!.contains(band)).toBe(true)
    // Esc – nothing changes, the bands go.
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('week-group-drop')).toBeNull()
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8, { buttons: 0 })
    expect(s.sent).toEqual([])
    expect(x().getAttribute('data-marked')).toBe('true')
    // Again, let go there: both blocks on Wednesday, an hour later; the block of Wednesday pushed on (the next press ends the mute of the click).
    pointer(x(), 'pointerdown', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + (720 - 360) * WEEK_PPM + 8, { buttons: 0 })
    await act(async () => void (await vi.waitFor(() => expect(lineOf('week')).toBe('Przeniesiono 2 bloki'))))
    expect(startsOf(s.files[WED], WED)).toEqual({ w: lm('13:00'), x: lm('12:00'), y: lm('12:30') })
    expect(s.sent).toHaveLength(1)
    await act(() => undoGroupLine('week'))
    expect(startsOf(s.files[MON], MON)).toEqual({ x: lm('11:00'), y: lm('11:30') })
    expect(startsOf(s.files[WED], WED)).toEqual({ w: lm('12:15') })
  })

  it('Esc przy wciśniętym bloku grupy przed progiem 4 px – gest odwołany, zaznaczenie zostaje, klik po puszczeniu nie otwiera dnia (T1771)', async () => {
    stub({ [MON]: fileOf(MON, [flex('x', '11:00', 30), flex('y', '11:30', 30)]) })
    const grab = { date: MON, id: 'x', startMin: 660 }
    await mountWeek([day(MON, [hb('x', 660, 690), hb('y', 690, 720)]), day(TUE, []), day(WED, [])], grab, [[MON, 'x'], [MON, 'y']])
    const below = vi.fn()
    window.addEventListener('keydown', below)
    useUi.setState({ page: 'week', day: null })
    pointer(q(`week-block-${MON}-x`)!, 'pointerdown', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    window.removeEventListener('keydown', below)
    expect(below).not.toHaveBeenCalled()
    expect(q(`week-block-${MON}-x`)!.getAttribute('data-marked')).toBe('true')
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8, { buttons: 0 })
    act(() => q(`week-block-${MON}-x`)!.click())
    expect(useUi.getState().page).toBe('week')
  })

  it('klik bez ruchu na bloku grupy nie liczy dni (liczenie dopiero przy przeciągnięciu, T1774)', async () => {
    const s = stub({ [MON]: fileOf(MON, [flex('x', '11:00', 30), flex('y', '11:30', 30)]) })
    const grab = { date: MON, id: 'x', startMin: 660 }
    await mountWeek([day(MON, [hb('x', 660, 690), hb('y', 690, 720)]), day(TUE, []), day(WED, [])], grab, [[MON, 'x'], [MON, 'y']])
    s.dayFiles.mockClear()
    pointer(q(`week-block-${MON}-x`)!, 'pointerdown', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8, { buttons: 0 })
    await act(async () => undefined)
    expect(s.dayFiles).not.toHaveBeenCalled()
    // Dragged past the 4 px: the days of the group are counted (once).
    pointer(q(`week-block-${MON}-x`)!, 'pointerdown', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + (700 - 360) * WEEK_PPM + 8)
    await shownBand()
    expect(s.dayFiles).toHaveBeenCalledTimes(1)
    // Ended with Esc: nothing is written after the test.
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    pointer(window, 'pointerup', colLeft(1) + 20, COL_TOP + (700 - 360) * WEEK_PPM + 8, { buttons: 0 })
    expect(s.sent).toEqual([])
  })

  it('pod wskaźnikiem dzień miniony – upuszczenie odrzucone (kursor zakazu), bez miejsc grupy, nic nie zapisano', async () => {
    const s = stub({ [TUE]: fileOf(TUE, [flex('x', '11:00', 30), flex('y', '11:30', 30)]) })
    // Tuesday is today of the columns: Monday has gone by.
    useData.setState({ view: { today: TUE, allDay: [], computers: [], attachments: [] } as unknown as DataView })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const id = this.getAttribute('data-testid') ?? ''
      if (id === 'week-body') return rect(60, COL_TOP, 300, 2000)
      const col = DATES.findIndex((d) => id === `week-col-${d}`)
      if (col >= 0) return rect(colLeft(col), COL_TOP, 96, 2000)
      if (id === `week-block-${TUE}-x`) return rect(colLeft(1), COL_TOP + (660 - 360) * WEEK_PPM, 96, 30 * WEEK_PPM)
      return rect(0, 0, 0, 0)
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true })
    const list = [{ ...day(MON, []), when: 'past' as const }, { ...day(TUE, [hb('x', 660, 690), hb('y', 690, 720)]), when: 'today' as const }, day(WED, [])]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined })))
    act(() => q(`week-block-${TUE}-x`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    act(() => q(`week-block-${TUE}-y`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })))
    pointer(q(`week-block-${TUE}-x`)!, 'pointerdown', colLeft(1) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8)
    expect(q('week-drop')!.getAttribute('data-denied')).toBe('true')
    expect(q('week-group-drop')).toBeNull()
    expect(q('week-grid')!.className).toContain('cursor-not-allowed')
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + (660 - 360) * WEEK_PPM + 8, { buttons: 0 })
    await act(async () => undefined)
    expect(s.sent).toEqual([])
    expect(lineOf('week')).toBeUndefined()
  })
})
