/**
 * Zmiany grupowe bloków podłączone do ekranów (D528, D529, Z4-B, Z5): menu „Zmień N bloków” → działanie (`runBlockGroup`)
 * → linia widoku („Zmieniono 3 bloki · pominięto 1: zaczęty”, T1541) → „Cofnij” – dla „Dziś”, „Szablonów” i „Tygodnia” (kilka dni jedną
 * zmianą, jedno „Cofnij”); pozycje menu wyłączone z powodem według silnika (`judgeBlocks`, T1720). Bez DOM.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { templateJson } from '@shared/model/defaults'
import type { AnyEvent } from '@shared/model/events'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import type { MenuEntry } from '@renderer/components/ContextMenu'
import { blockKey, blockMenu, menuCtxOf, type GroupAction, type MenuBlock } from '@renderer/features/plan/groupMenu'
import { blockLineText, judgeBlocks, nothingText, runBlockGroup } from '@renderer/features/plan/groupRun'
import { useData } from '@renderer/store/data'
import { countDay } from '@renderer/store/day'
import { clearGroupLine, undoGroupLine, useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock is 05:00 of „today”. Sundays: no sessions in the default day.
const TODAY = '2099-01-04' // a Sunday
const SUN2 = '2099-01-11'
const SUN3 = '2099-01-18'
const AT = placeLogical(TODAY, 5 * 60)
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: readonly PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  for (const v of ['today', 'template', 'week', 'calendar'] as const) clearGroupLine(v)
})

/** The folder of day files: the edits apply; the logs as given. */
function stub(start: Record<string, RawRecord | null>, events: Record<string, AnyEvent[]> = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: events[date] ?? [], complete: true, unknown: false, away: false }) as DayData,
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const date = dateOf(e.rel)
        files[date] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
        return { status: 'applied' as const }
      })
    },
    logEvents: async () => undefined,
    planPushed: async () => undefined,
    dataView: async () => ({ today: TODAY }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return { files, sent }
}

/** The entry of the menu by its path of test ids (submenus on the way). */
function entry(entries: readonly MenuEntry[], ...path: string[]): MenuEntry {
  let list: readonly MenuEntry[] = entries
  let found: MenuEntry | undefined
  for (const id of path) {
    found = list.find((e) => 'testId' in e && e.testId === id)
    if (!found) throw new Error(`no entry ${id}`)
    list = 'submenu' in found ? (found.submenu ?? []) : []
  }
  return found!
}
const picked = (e: MenuEntry) => {
  if (!('onPick' in e) || !e.onPick) throw new Error('not a pick')
  e.onPick()
}

const names = () => {
  const rd = rdFrom({})
  return { rd, settings: settingsOn(rd.settings, TODAY), routines: [], requests: [] }
}
const menuBlocks = (plan: readonly PlanBlock[], ids: readonly string[]): MenuBlock[] => plan.filter((b) => ids.includes(b.id)).map((b) => ({ id: b.id, categoryId: b.categoryId, variantId: b.variantId, routine: b.routine, costs: null, state: 'open', movable: true }))
const line = (view: 'today' | 'template' | 'week' | 'calendar') => useGroupLine.getState().lines[view]?.text

describe('„Dziś”: menu → zmiana → linia → „Cofnij”', () => {
  it('przykład spec.: podkategoria „Analiza” 4 bloków, w tym zaczętego – „Zmieniono 3 bloki · pominięto 1: zaczęty”; „Cofnij” – wraca tylko podkategoria', async () => {
    const plan = [flex('a', '05:00', 30), flex('b', '11:00', 30, { note: 'n' }), flex('c', '12:00', 30), flex('d', '13:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('a', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { [TODAY]: events })
    const done = await runBlockGroup('today', ['a', 'b', 'c', 'd'], { kind: 'category', categoryId: 'analiza', variantId: null }, { date: TODAY }, AT + 60_000)
    expect(done?.changed).toBe(3)
    expect(line('today')).toBe('Zmieniono 3 bloki · pominięto 1: zaczęty')
    // The note of „b” changed meanwhile: it stays, the subcategory goes back.
    s.files[TODAY] = { ...s.files[TODAY]!, blocks: (s.files[TODAY]!.blocks as RawRecord[]).map((x) => (x.id === 'b' ? { ...x, note: 'nowa' } : x)) }
    await undoGroupLine('today')
    expect(line('today')).toBeUndefined()
    expect(blocksOf(s.files[TODAY], TODAY).map((b) => [b.id, b.categoryId, b.note])).toEqual([
      ['a', 'inne', ''],
      ['b', 'inne', 'nowa'],
      ['c', 'inne', ''],
      ['d', 'inne', '']
    ])
  })

  it('przykład spec.: „Przesuń o… → Później o… → 15 min” z menu na blokach 10:00 i 11:00 – 10:15 i 11:15; „Cofnij” – 10:00 i 11:00', async () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '15:00', 30)]
    const s = stub({ [SUN2]: fileOf(SUN2, plan) })
    let run: unknown
    const entries = blockMenu(menuBlocks(plan, ['a', 'b']), menuCtxOf(names()), { action: (a: GroupAction) => void (run = runBlockGroup('today', ['a', 'b'], a, { date: SUN2 })), cost: () => undefined, moveTo: () => undefined })
    picked(entry(entries, 'block-menu-shift', 'block-menu-later', 'block-menu-later-15'))
    await run
    const starts = () => Object.fromEntries(blocksOf(s.files[SUN2], SUN2).map((b) => [b.id, b.startMin]))
    expect(starts()).toEqual({ a: lm('10:15'), b: lm('11:15'), c: lm('15:00') })
    expect(line('today')).toBe('Zmieniono 2 bloki')
    await undoGroupLine('today')
    expect(starts()).toEqual({ a: lm('10:00'), b: lm('11:00'), c: lm('15:00') })
  })

  it('„Gotowe, gdy” (N17): menu „Przesuń resztę dnia o… → Później o… → 30 min” na pierwszym bloku – 4 elastyczne przesunięte, stały na miejscu; „Cofnij” przywraca plik dnia', async () => {
    const plan = [flex('a', '09:00', 60), flex('b', '10:00', 75), flex('F', '11:30', 60, { fixed: true }), flex('c', '12:30', 30), flex('d', '14:00', 30)]
    const file = fileOf(SUN2, plan)
    const s = stub({ [SUN2]: file })
    let run: unknown
    const entries = blockMenu(menuBlocks(plan, ['a']), menuCtxOf(names()), { action: (a: GroupAction) => void (run = runBlockGroup('today', ['a'], a, { date: SUN2 }, AT)), cost: () => undefined, moveTo: () => undefined })
    picked(entry(entries, 'block-menu-rest', 'block-menu-rest-later', 'block-menu-rest-later-30'))
    await run
    const starts = () => Object.fromEntries(blocksOf(s.files[SUN2], SUN2).map((b) => [b.id, b.startMin]))
    // b would end 11:45 – on F: it jumps behind it; c follows b; d has room at 14:30.
    expect(starts()).toEqual({ a: lm('09:30'), b: lm('12:30'), F: lm('11:30'), c: lm('13:45'), d: lm('14:30') })
    expect(line('today')).toBe('Przesunięto 4 bloki')
    await undoGroupLine('today')
    expect(s.files[SUN2]).toEqual(file)
  })

  it('„Przesuń resztę dnia o” bez czego przesunąć (N17, r3) – żadnego wpisu dnia, bez linii, w rogu „Bez zmian – nie ma czego przesunąć”', async () => {
    const plan = [flex('a', '10:00', 30), flex('F', '12:00', 60, { fixed: true })]
    const s = stub({ [SUN2]: fileOf(SUN2, plan) })
    const done = await runBlockGroup('today', ['F'], { kind: 'shiftRest', minutes: 15 }, { date: SUN2 }, AT)
    expect(done?.changed).toBe(0)
    expect(s.sent.flat()).toEqual([])
    expect(line('today')).toBeUndefined()
    expect(useUi.getState().toasts.at(-1)?.text).toBe('Bez zmian – nie ma czego przesunąć')
  })

  it('zmiana, która nic nie zmienia – bez linii, w rogu „Bez zmian” z powodami', async () => {
    const plan = [flex('a', '05:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('a', '05:00').events
    stub({ [TODAY]: fileOf(TODAY, plan) }, { [TODAY]: events })
    await runBlockGroup('today', ['a'], { kind: 'shift', minutes: 15 }, { date: TODAY }, AT + 60_000)
    expect(line('today')).toBeUndefined()
    expect(useUi.getState().toasts.at(-1)?.text).toBe('Bez zmian · pominięto 1: zaczęty')
  })

  it('menu według silnika (T1720): same zaczęte – „Przesuń o…”, „Przenieś na dzień…”, „Podkategoria” wyłączone z powodem; inny dzień – „Odwołaj” wyłączone', () => {
    const plan = [flex('a', '05:00', 60), flex('b', '05:00', 60, { background: true })]
    const s = new Scenario({ date: TODAY, plan }).start('a', '05:00').start('b', '05:00', { bg: true })
    const model = countDay(TODAY, { date: TODAY, dayFile: fileOf(TODAY, plan), nextFile: null, prevFile: null, events: s.events, complete: true, unknown: false, away: false }, { changes: rdFrom({}).settings, templates: [], lectures: [], series: [], routines: [] }, AT + 10 * 60_000, false)
    const ctx = { ...menuCtxOf(names()), judge: (ids: readonly string[]) => judgeBlocks(model, ids, TODAY) }
    const entries = blockMenu(menuBlocks(plan, ['a', 'b']), ctx, { action: () => undefined, cost: () => undefined, moveTo: () => undefined })
    const off = (id: string) => ('disabled' in entry(entries, id) ? (entry(entries, id) as { disabled?: string }).disabled : undefined)
    expect(off('block-menu-shift')).toBe('Żaden blok nie jest niezaczęty')
    expect(off('block-menu-moveto')).toBe('Żaden blok nie jest niezaczęty')
    expect(off('block-menu-category')).toBe('Żaden blok nie jest niezaczęty')
    // The cost of a begun block is changed from now on (D501) – on.
    expect(off('block-menu-cost')).toBeUndefined()
    // Another day: cancel and park are today's.
    const tomorrow = countDay(SUN2, { date: SUN2, dayFile: fileOf(SUN2, plan), nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom({}).settings, templates: [], lectures: [], series: [], routines: [] }, AT, false)
    const other = blockMenu(menuBlocks(plan, ['a']), { ...menuCtxOf(names()), judge: (ids) => judgeBlocks(tomorrow, ids, TODAY) }, { action: () => undefined, cost: () => undefined, moveTo: () => undefined })
    expect((entry(other, 'block-menu-cancel') as { disabled?: string }).disabled).toBe('Odwołać i zaparkować można tylko dzisiejsze bloki')
    expect((entry(other, 'block-menu-shift') as { disabled?: string }).disabled).toBeUndefined()
  })
})

describe('„Szablony”: menu → zmiana → linia → „Cofnij”', () => {
  it('podkategoria dwóch bloków wersji – linia szablonu; „Cofnij” przywraca', async () => {
    const tb = (id: string, at: string): PlanBlock => planBlock({ id, categoryId: 'inne', startMin: lm(at), durationMin: 60, origin: 'template' })
    const t: Template = { id: 'zw', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [{ from: '2000-01-01', blocks: [tb('a', '18:00'), tb('b', '19:00')], budgetMin: null, maxMin: null }], archived: false }
    let raw: RawRecord = templateJson(t)
    const view = () => ({ today: '2026-11-14', status: 'open', rd: null, templates: [raw], lectures: [], requests: [], routines: [], series: [], seriesDays: {}, attachments: [] }) as unknown as DataView
    const rd: Partial<RdApi> = {
      edit: async (entries) => {
        for (const e of entries) raw = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, raw)
        return entries.map(() => ({ status: 'applied' as const }))
      },
      dataView: async () => view()
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: view(), templates: [t], rd: rdFrom(undefined) })
    const version = () => templateFrom(raw)!.versions.find((v) => v.from === '2026-11-16')?.blocks ?? []
    await runBlockGroup('template', ['a', 'b'], { kind: 'category', categoryId: 'analiza', variantId: null }, { templateId: 'zw', from: '2026-11-16' })
    expect(line('template')).toBe('Zmieniono 2 bloki')
    expect(version().map((b) => b.categoryId)).toEqual(['analiza', 'analiza'])
    await undoGroupLine('template')
    expect(version().map((b) => b.categoryId)).toEqual(['inne', 'inne'])
  })
})

describe('„Tydzień”: kilka dni jedną zmianą, jedno „Cofnij”', () => {
  it('przykład spec.: 5 bloków w 3 dniach – nowy wariant; jedna edycja trzech plików; „Cofnij” przywraca 3 dni', async () => {
    const reg = (id: string, at: string) => flex(id, at, 30, { categoryId: 'regeneracja' })
    const days = { [TODAY]: [reg('a1', '10:00'), reg('a2', '12:00')], [SUN2]: [reg('b1', '10:00'), reg('b2', '12:00')], [SUN3]: [reg('c1', '10:00')] }
    const s = stub(Object.fromEntries(Object.entries(days).map(([d, p]) => [d, fileOf(d, p)])))
    const keys = Object.entries(days).flatMap(([d, p]) => p.map((b) => blockKey(d, b.id)))
    await runBlockGroup('week', keys, { kind: 'variant', variantId: 'drzemka' }, undefined, AT)
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]!.map((e) => dateOf(e.rel)).sort()).toEqual([TODAY, SUN2, SUN3])
    expect(line('week')).toBe('Zmieniono 5 bloków')
    for (const d of [TODAY, SUN2, SUN3]) expect(blocksOf(s.files[d], d).every((b) => b.variantId === 'drzemka')).toBe(true)
    // One block changed meanwhile: it stays; the four others go back.
    s.files[SUN3] = { ...s.files[SUN3]!, blocks: (s.files[SUN3]!.blocks as RawRecord[]).map((x) => ({ ...x, variantId: 'spacer' })) }
    await undoGroupLine('week')
    expect(useUi.getState().toasts.at(-1)?.text).toBe('1 blok zmieniony od tego czasu – został')
    expect(blocksOf(s.files[TODAY], TODAY).map((b) => b.variantId)).toEqual([null, null])
    expect(blocksOf(s.files[SUN2], SUN2).map((b) => b.variantId)).toEqual([null, null])
    expect(blocksOf(s.files[SUN3], SUN3).map((b) => b.variantId)).toEqual(['spacer'])
  })

  it('N18, D597: paski miesiąca – te same klucze `date|id`, jedna edycja, linia widoku „calendar” (nie „week”), jedno „Cofnij”', async () => {
    const reg = (id: string, at: string) => flex(id, at, 30, { categoryId: 'regeneracja' })
    const days = { [TODAY]: [reg('a1', '10:00')], [SUN2]: [reg('b1', '10:00')], [SUN3]: [reg('c1', '10:00')] }
    const s = stub(Object.fromEntries(Object.entries(days).map(([d, p]) => [d, fileOf(d, p)])))
    const keys = Object.entries(days).flatMap(([d, p]) => p.map((b) => blockKey(d, b.id)))
    await runBlockGroup('calendar', keys, { kind: 'category', categoryId: 'analiza', variantId: null }, undefined, AT)
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]!.map((e) => dateOf(e.rel)).sort()).toEqual([TODAY, SUN2, SUN3])
    expect(line('calendar')).toBe('Zmieniono 3 bloki')
    expect(line('week')).toBeUndefined()
    await undoGroupLine('calendar')
    for (const d of [TODAY, SUN2, SUN3]) expect(blocksOf(s.files[d], d).map((b) => b.categoryId)).toEqual(['regeneracja'])
    expect(line('calendar')).toBeUndefined()
  })

  it('„Zaparkuj” w „Tygodniu”: dzisiejsze idą do procesu głównego, bloki innych dni – pominięte „nie dziś”', async () => {
    stub({ [TODAY]: fileOf(TODAY, [flex('a', '10:00', 30)]), [SUN2]: fileOf(SUN2, [flex('b', '10:00', 30)]) })
    const groupLog = vi.fn(async () => ({ ok: true, why: null, confirm: null, written: ['pca-1'], taken: ['a'], skipped: [] }))
    ;(window.rd as Partial<RdApi>).groupLog = groupLog
    const done = await runBlockGroup('week', [blockKey(TODAY, 'a'), blockKey(SUN2, 'b')], { kind: 'park' }, undefined, AT)
    expect(groupLog).toHaveBeenCalledWith(TODAY, 'park', ['a'])
    expect(done?.skipped).toEqual([{ id: 'b', why: 'nie dziś' }])
    expect(line('week')).toBe('Zaparkowano 1 blok · pominięto 1: nie dziś')
  })

  it('„Przesuń resztę dnia o” +15 w dwóch dniach (N17): każdy dzień od swojego zaznaczonego, jedna edycja, linia „Przesunięto 3 bloki”, jedno „Cofnij”', async () => {
    const days = { [SUN2]: [flex('a', '09:00', 60), flex('b', '11:00', 30)], [SUN3]: [flex('x', '09:00', 30), flex('y', '10:00', 30)] }
    const s = stub(Object.fromEntries(Object.entries(days).map(([d, p]) => [d, fileOf(d, p)])))
    await runBlockGroup('week', [blockKey(SUN2, 'a'), blockKey(SUN3, 'y')], { kind: 'shiftRest', minutes: 15 }, undefined, AT)
    expect(s.sent).toHaveLength(1)
    const starts = (d: string) => Object.fromEntries(blocksOf(s.files[d], d).map((b) => [b.id, b.startMin]))
    expect([starts(SUN2), starts(SUN3)]).toEqual([
      { a: lm('09:15'), b: lm('11:15') },
      { x: lm('09:00'), y: lm('10:15') }
    ])
    expect(line('week')).toBe('Przesunięto 3 bloki')
    await undoGroupLine('week')
    expect([starts(SUN2), starts(SUN3)]).toEqual([
      { a: lm('09:00'), b: lm('11:00') },
      { x: lm('09:00'), y: lm('10:00') }
    ])
  })

  it('tekst linii „Przesuń resztę dnia o” (N17): liczba, ostrzeżenie granicy (D72), energia; nic – „Bez zmian – nie ma czego przesunąć”', () => {
    expect(blockLineText({ kind: 'shiftRest', minutes: 30 }, { changed: 4, skipped: [], pushed: 0, seriesOnly: 0, over: [{ kind: 'max', atMin: lm('19:00') }], energy: { before: 52, after: 44 } })).toBe(
      'Przesunięto 4 bloki · praca kończy się po maksimum (19:00) · najniższa energia 52 → 44'
    )
    expect(blockLineText({ kind: 'shiftRest', minutes: -15 }, { changed: 1, skipped: [], pushed: 0, seriesOnly: 1, refusedDays: 1 })).toBe('Przesunięto 1 blok · bloki serii – tylko te dni · 1 dzień niezapisany')
    expect(nothingText({ skipped: [], same: 0 }, { kind: 'shiftRest', minutes: 15 })).toBe('Bez zmian – nie ma czego przesunąć')
  })

  it('tekst linii: przeniesienie z blokiem, który został, rozsuniętymi, energią i dopiskiem serii', () => {
    expect(
      blockLineText({ kind: 'moveTo', date: SUN2 }, { changed: 2, skipped: [{ id: 'x', why: 'sesja' }], stayed: [{ name: 'Analiza', how: 'running' }], pushed: 2, energy: { before: 52, after: 44 }, seriesOnly: 1 })
    ).toBe('Przeniesiono 2 bloki · pominięto 1: sesja · 1 został – już trwa · najniższa energia 52 → 44 · bloki serii – tylko te dni · przesunięto 2 bloki')
  })
})
