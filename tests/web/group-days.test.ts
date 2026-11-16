/**
 * Zmiany grupowe bloków kilku dni (Z5, D528, D529 – „Tydzień”, „3 dni”; bez DOM): `changeDaysGroup` – jedna edycja wszystkich dni, każdy dzień
 * według własnego wpisu (zapisany liczy się i wraca jednym „Cofnij”, pytanie / odmowa – dopisek linii), „Przenieś na dzień” z kilku dni (cel –
 * właściciel, T952; cel nie do policzenia – bez rozsunięcia), „Usuń” z załącznikami po swoim dniu (T923) i zakończonym dziś blokiem otwieranym
 * tylko przy odmowie dzisiejszego wpisu, „Cofnij” pamiętające, co zrobiło (linia zostaje – jeden komunikat), energia dnia zmienionego.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, EditOutcome, EventIn, GroupLogResult, RawRecord, RdApi, TimerIn, TimerResult } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { attachmentFrom, attachmentRel, type Attachment } from '@shared/model/attachment'
import type { Pool } from '@shared/model/categories'
import type { Answer, AnyEvent } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { blockKey, type GroupAction } from '@renderer/features/plan/groupMenu'
import { blockLineText, runBlockGroup } from '@renderer/features/plan/groupRun'
import { changeDaysGroup, notReopenedText } from '@renderer/features/today/groupActions'
import { undoUnreadableText } from '@renderer/features/week/weekActions'
import { BROKEN_FILE_TEXT, useData } from '@renderer/store/data'
import { clearGroupLine, undoGroupLine, UNDO_FAILED_TEXT, useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock is 05:00 of „today” – before its blocks. The default day has sessions 08:00–11:00
// and 14:00–17:00: the blocks stand between them.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const D2 = '2099-01-06'
const D3 = '2099-01-07'
const AT = placeLogical(TODAY, 5 * 60)
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: readonly PlanBlock[]): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const dayRe = /(\d{4}-\d{2}-\d{2})\.json$/
const dateOf = (rel: string) => dayRe.exec(rel)?.[1] ?? rel
const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks
const idsOf = (raw: RawRecord | null | undefined, date: string) => blocksOf(raw, date).map((b) => b.id).sort()
const startsOf = (raw: RawRecord | null | undefined, date: string) => Object.fromEntries(blocksOf(raw, date).map((b) => [b.id, b.startMin]))
const catsOf = (raw: RawRecord | null | undefined, date: string) => Object.fromEntries(blocksOf(raw, date).map((b) => [b.id, b.categoryId]))
const ZERO: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const CATEGORY: GroupAction = { kind: 'category', categoryId: 'analiza', variantId: null }

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  clearGroupLine('week')
})

type Status = EditOutcome['status']

/**
 * The folder as the window sees it: an edit's entry applies unless `status` gives it another answer (by its file – a day's date or an
 * attachment's rel – and the number of the edit); a date in `unreadable` is not read now; one in `unknown` cannot be counted.
 */
function stub(start: Record<string, RawRecord | null>, o: { events?: Record<string, AnyEvent[]>; status?: (file: string, call: number) => Status; groupLog?: GroupLogResult; timer?: (click: TimerIn) => TimerResult } = {}) {
  const files: Record<string, RawRecord | null> = { ...start }
  const sent: EditEntry[][] = []
  const clicks: TimerIn[] = []
  const logged: EventIn[] = []
  const unreadable = new Set<string>()
  const unknown = new Set<string>()
  // What fails now: the edit (the IPC throws before the queue), the write of events.
  const fail = { edit: false, log: false }
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => !unreadable.has(d)).map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: o.events?.[date] ?? [], complete: true, unknown: unknown.has(date), away: false }) as DayData,
    edit: async (entries) => {
      if (fail.edit) throw new Error('kolejka zamknięta')
      sent.push(entries)
      const call = sent.length
      return entries.map((e) => {
        const at = dateOf(e.rel)
        const status = o.status?.(at, call) ?? 'applied'
        if (status === 'applied') files[at] = e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[at] ?? {}))
        return { status }
      })
    },
    logEvents: async (events) => {
      if (fail.log) throw new Error('log zamknięty')
      logged.push(...events)
    },
    planPushed: async () => undefined,
    groupLog: vi.fn(async () => o.groupLog ?? { ok: true, why: null, confirm: null, written: [], taken: [], skipped: [] }),
    timer: async (click) => {
      clicks.push(click)
      return o.timer?.(click) ?? { ok: true, why: null, confirm: null }
    },
    dataView: async () => ({ today: TODAY }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: TODAY } as DataView })
  return { files, sent, clicks, logged, unreadable, unknown, fail, rd }
}
const rels = (s: { sent: EditEntry[][] }) => s.sent.map((c) => c.map((e) => dateOf(e.rel)))
const toasts = () => useUi.getState().toasts.map((t) => t.text)
const line = () => useGroupLine.getState().lines.week?.text

describe('„Przenieś na dzień” z kilku dni (T952)', () => {
  it('bloki dwóch dni na trzeci: jedna edycja – cel właścicielem, źródła i rozsunięcie z nim; „Cofnij” – wszystkie dni jak przed', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('y', '12:00', 60)]), [D3]: fileOf(D3, [flex('a', '11:30', 30)]) })
    const r = await changeDaysGroup(
      [
        { date: D1, ids: ['x'] },
        { date: D2, ids: ['y'] }
      ],
      { k: 'moveTo', date: D3 },
      { at: AT }
    )
    expect(r).toMatchObject({ status: 'saved', changed: 2, pushed: 1 })
    expect(rels(s)).toEqual([[D3, D1, D2, D3]])
    expect(s.sent[0]!.map((e) => e.after)).toEqual([undefined, [0], [0], [0]])
    expect(startsOf(s.files[D3], D3)).toEqual({ a: lm('13:00'), x: lm('11:00'), y: lm('12:00') })
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(idsOf(s.files[D1], D1)).toEqual(['x'])
    expect(idsOf(s.files[D2], D2)).toEqual(['y'])
    expect(startsOf(s.files[D3], D3)).toEqual({ a: lm('11:30') })
  })

  it('dzień docelowy, którego nie da się teraz policzyć – bloki przenosi bez rozsunięcia (jak „Przenieś na…” jednego), nie odmowa', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '11:30', 30)]) })
    s.unknown.add(D2)
    const r = await changeDaysGroup([{ date: D1, ids: ['x'] }], { k: 'moveTo', date: D2 }, { at: AT })
    expect(r).toMatchObject({ status: 'saved', changed: 1, pushed: 0 })
    expect(startsOf(s.files[D2], D2)).toEqual({ a: lm('11:30'), x: lm('11:00') })
    expect(idsOf(s.files[D1], D1)).toEqual([])
  })

  it('zaznaczone bloki dnia docelowego oceniane na nim: obecny – już tam, brakujący – „nie ma”', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '13:00', 30)]) })
    const r = await changeDaysGroup(
      [
        { date: D1, ids: ['x'] },
        { date: D2, ids: ['a', 'gone'] }
      ],
      { k: 'moveTo', date: D2 },
      { at: AT }
    )
    expect(r).toMatchObject({ status: 'saved', changed: 1, same: 1, skipped: [{ id: 'gone', why: 'nie ma' }] })
    expect(idsOf(s.files[D2], D2)).toEqual(['a', 'x'])
  })

  it('„Cofnij”, gdy jednego z dni nie da się teraz odczytać – linia zostaje z jednym komunikatem; kolejne „Cofnij” cofa', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) })
    await runBlockGroup('week', [blockKey(D1, 'x')], { kind: 'moveTo', date: D2 }, undefined, AT)
    expect(line()).toBe('Przeniesiono 1 blok')
    s.unreadable.add(D1)
    await undoGroupLine('week')
    expect(line()).toBe('Przeniesiono 1 blok')
    expect(toasts()).toEqual([undoUnreadableText([D1])])
    expect(idsOf(s.files[D2], D2)).toEqual(['x'])
    s.unreadable.clear()
    await undoGroupLine('week')
    expect(line()).toBeUndefined()
    expect(idsOf(s.files[D1], D1)).toEqual(['x'])
    expect(idsOf(s.files[D2], D2)).toEqual([])
  })
})

describe('„Usuń” z kilku dni', () => {
  const attachment = (id: string, date: string, blockId: string): RawRecord => ({ schema: 1, id, kind: 'link', name: '', link: { url: 'https://www.example.com/a', title: null, iconDataUrl: null }, file: null, owner: { scope: 'day', date, blockId }, addedAt: 1, removedAt: null })
  const withAttachments = (raws: RawRecord[]) => {
    const list = raws.map((r) => attachmentFrom(r)).filter((a): a is Attachment => a != null)
    useData.setState({ view: { today: TODAY, attachments: raws } as unknown as DataView, attachments: list })
  }

  it('dziś trwający i blok przyszłego dnia z załącznikiem: timer kończy dzisiejszy, jedna edycja – każdy załącznik po swoim dniu (T923); „Cofnij” – oba dni, załącznik i otwarty blok', async () => {
    const today = [flex('run', '05:00', 60), flex('b', '12:00', 30)]
    const events = new Scenario({ date: TODAY, plan: today }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, today), [D1]: fileOf(D1, [flex('c', '11:00', 30)]) }, { events: { [TODAY]: events } })
    withAttachments([attachment('att1', D1, 'c')])
    const r = await changeDaysGroup(
      [
        { date: TODAY, ids: ['run'] },
        { date: D1, ids: ['c'] }
      ],
      { k: 'remove' },
      { at: AT + 10 * 60_000 }
    )
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(s.clicks).toEqual([{ a: 'removeBegun', block: 'run', day: TODAY }])
    expect(rels(s)).toEqual([[TODAY, D1, attachmentRel('att1')]])
    expect(s.sent[0]!.map((e) => e.after)).toEqual([undefined, undefined, [1]])
    expect(idsOf(s.files[TODAY], TODAY)).toEqual(['b'])
    expect(idsOf(s.files[D1], D1)).toEqual([])
    expect((s.files[attachmentRel('att1')] as { removedAt?: unknown } | undefined)?.removedAt).toBe(AT + 10 * 60_000)
    s.files[attachmentRel('att1')] = { ...attachment('att1', D1, 'c'), removedAt: AT + 10 * 60_000 }
    withAttachments([s.files[attachmentRel('att1')]!])
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(idsOf(s.files[TODAY], TODAY)).toEqual(['b', 'run'])
    expect(idsOf(s.files[D1], D1)).toEqual(['c'])
    expect((s.files[attachmentRel('att1')] as { removedAt?: unknown }).removedAt).toBeNull()
    expect(s.clicks.at(-1)).toEqual({ a: 'undoRemove', block: 'run', day: TODAY })
  })

  it('plik innego dnia uszkodzony, dzisiejszy zapisany: zakończony dziś blok zostaje zakończony; linia liczy dzień zapisany, „1 dzień niezapisany”', async () => {
    const today = [flex('run', '05:00', 60)]
    const events = new Scenario({ date: TODAY, plan: today }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, today), [D1]: fileOf(D1, [flex('c', '11:00', 30)]) }, { events: { [TODAY]: events }, status: (f) => (f === D1 ? 'broken' : 'applied') })
    await runBlockGroup('week', [blockKey(TODAY, 'run'), blockKey(D1, 'c')], { kind: 'remove' }, undefined, AT + 10 * 60_000)
    expect(s.clicks).toEqual([{ a: 'removeBegun', block: 'run', day: TODAY }])
    expect(line()).toBe('Usunięto 1 blok · 1 dzień niezapisany')
    expect(toasts()).toEqual([BROKEN_FILE_TEXT])
    await undoGroupLine('week')
    expect(idsOf(s.files[TODAY], TODAY)).toEqual(['run'])
    expect(s.clicks.at(-1)).toEqual({ a: 'undoRemove', block: 'run', day: TODAY })
  })

  it('dzisiejszy plik uszkodzony, inny dzień zapisany: zakończony dziś blok wraca (`undoRemove`); usunięty blok innego dnia ma „Cofnij”', async () => {
    const today = [flex('run', '05:00', 60)]
    const events = new Scenario({ date: TODAY, plan: today }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, today), [D1]: fileOf(D1, [flex('c', '11:00', 30)]) }, { events: { [TODAY]: events }, status: (f) => (f === TODAY ? 'broken' : 'applied') })
    const r = await changeDaysGroup(
      [
        { date: TODAY, ids: ['run'] },
        { date: D1, ids: ['c'] }
      ],
      { k: 'remove' },
      { at: AT + 10 * 60_000 }
    )
    expect(s.clicks).toEqual([
      { a: 'removeBegun', block: 'run', day: TODAY },
      { a: 'undoRemove', block: 'run', day: TODAY }
    ])
    expect(r).toMatchObject({ status: 'saved', changed: 1, refusedDays: 1 })
    expect(await r.undo!()).toEqual({ saved: true, restored: 1, kept: 0 })
    expect(idsOf(s.files[D1], D1)).toEqual(['c'])
    // The removal of today was never written: its „Cofnij” opens nothing.
    expect(s.clicks).toHaveLength(2)
  })
})

describe('Pola w kilku dniach: każdy dzień według własnego wpisu', () => {
  it('jeden dzień spotkał pytanie: linia liczy zapisany, „1 dzień czeka na odpowiedź”; „Cofnij” – tylko dzień zapisany', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '11:00', 30)]), [D2]: fileOf(D2, [flex('b', '11:00', 30)]) }, { status: (f, call) => (f === D1 && call === 1 ? 'conflict' : 'applied') })
    await runBlockGroup('week', [blockKey(D1, 'a'), blockKey(D2, 'b')], CATEGORY, undefined, AT)
    expect(line()).toBe('Zmieniono 1 blok · 1 dzień czeka na odpowiedź')
    expect(toasts()).toEqual(['Ta zmiana spotkała się ze zmianą z innego komputera – odpowiedz na pytanie u góry okna.'])
    expect(catsOf(s.files[D2], D2)).toEqual({ b: 'analiza' })
    await undoGroupLine('week')
    expect(rels(s).at(-1)).toEqual([D2])
    expect(catsOf(s.files[D2], D2)).toEqual({ b: 'inne' })
    expect(line()).toBeUndefined()
  })

  it('„Cofnij” z jednym dniem odrzuconym: linia zostaje z jednym komunikatem; kolejne cofa tylko ten dzień i liczy przywrócone', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '11:00', 30)]), [D2]: fileOf(D2, [flex('b', '11:00', 30)]) }, { status: (f, call) => (f === D2 && call === 2 ? 'broken' : 'applied') })
    const r = await changeDaysGroup(
      [
        { date: D1, ids: ['a'] },
        { date: D2, ids: ['b'] }
      ],
      { k: 'category', categoryId: 'analiza', variantId: null },
      { at: AT }
    )
    expect(r).toMatchObject({ status: 'saved', changed: 2 })
    expect(await r.undo!()).toEqual({ saved: false, restored: 1, kept: 0 })
    expect(catsOf(s.files[D1], D1)).toEqual({ a: 'inne' })
    expect(await r.undo!()).toEqual({ saved: true, restored: 2, kept: 0 })
    expect(rels(s).at(-1)).toEqual([D2])
    expect(catsOf(s.files[D2], D2)).toEqual({ b: 'inne' })
  })

  it('ta sama sytuacja z linii: po odrzuceniu jeden komunikat (pliku), bez „Nie udało się cofnąć zmiany”; linia zostaje do ponownego „Cofnij”', async () => {
    stub({ [D1]: fileOf(D1, [flex('a', '11:00', 30)]), [D2]: fileOf(D2, [flex('b', '11:00', 30)]) }, { status: (f, call) => (f === D2 && call === 2 ? 'broken' : 'applied') })
    await runBlockGroup('week', [blockKey(D1, 'a'), blockKey(D2, 'b')], CATEGORY, undefined, AT)
    await undoGroupLine('week')
    expect(line()).toBe('Zmieniono 2 bloki')
    expect(toasts()).toEqual([BROKEN_FILE_TEXT])
    expect(toasts()).not.toContain(UNDO_FAILED_TEXT)
    await undoGroupLine('week')
    expect(line()).toBeUndefined()
  })

  it('energia linii – dnia zmienionego: dziś zapisany – dzisiejsza; dzisiejszy wpis odrzucony – żadna (nie dzień, którego nie zapisano)', async () => {
    const plan = [flex('e1', '11:00', 60, { categoryId: 'analiza' }), flex('e2', '12:00', 60, { categoryId: 'analiza' })]
    const events = { [TODAY]: new Scenario({ date: TODAY, plan }).observe('04:30', null).checkin('04:45', ZERO).events }
    const files = () => ({ [TODAY]: fileOf(TODAY, plan), [D1]: fileOf(D1, [flex('c', '11:00', 30, { categoryId: 'analiza' })]) })
    const days = [
      { date: TODAY, ids: ['e1', 'e2'] },
      { date: D1, ids: ['c'] }
    ]
    const zero = { k: 'cost', costs: { head: 0, emotions: 0, senses: 0, body: 0 } } as const
    stub(files(), { events })
    const saved = await changeDaysGroup(days, zero, { at: AT })
    expect(saved.changed).toBe(3)
    expect(saved.energy!.after).toBeGreaterThan(saved.energy!.before)
    stub(files(), { events, status: (f) => (f === TODAY ? 'broken' : 'applied') })
    const refused = await changeDaysGroup(days, zero, { at: AT })
    expect(refused).toMatchObject({ changed: 1, refusedDays: 1 })
    expect(refused.energy).toBeUndefined()
  })
})

describe('Linia po zmianie, której nie da się cofnąć', () => {
  it('zaparkowano bez identyfikatorów zdarzeń do „Cofnij” – tekst zmiany w rogu, nie „Bez zmian”', async () => {
    stub({ [TODAY]: fileOf(TODAY, [flex('a', '11:00', 30)]) }, { groupLog: { ok: true, why: null, confirm: null, written: [], taken: ['a'], skipped: [] } })
    const r = await runBlockGroup('week', [blockKey(TODAY, 'a')], { kind: 'park' }, undefined, AT)
    expect(r).toMatchObject({ changed: 1, undo: null })
    expect(line()).toBeUndefined()
    expect(toasts()).toEqual([blockLineText({ kind: 'park' }, r!)])
    expect(toasts()[0]).toBe('Zaparkowano 1 blok')
  })
})

describe('Zapis częściowy: do linii i do „Cofnij” wchodzą tylko części zapisane', () => {
  const COST = { head: 2, emotions: 2, senses: 2, body: 0 }

  it('przeniesienie z dwóch dni, plik jednego źródła uszkodzony: linia liczy źródło zapisane; „Cofnij” cofa źródło zapisane i cel', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('y', '12:00', 60)]), [D3]: fileOf(D3, []) }, { status: (f, call) => (f === D2 && call === 1 ? 'broken' : 'applied') })
    const r = await changeDaysGroup(
      [
        { date: D1, ids: ['x'] },
        { date: D2, ids: ['y'] }
      ],
      { k: 'moveTo', date: D3 },
      { at: AT }
    )
    expect(r).toMatchObject({ status: 'saved', changed: 1, refusedDays: 1 })
    expect(idsOf(s.files[D3], D3)).toEqual(['x', 'y'])
    expect(await r.undo!()).toEqual({ saved: true, restored: 1, kept: 0 })
    expect(idsOf(s.files[D1], D1)).toEqual(['x'])
    expect(idsOf(s.files[D2], D2)).toEqual(['y'])
    expect(idsOf(s.files[D3], D3)).toEqual([])
  })

  it('przeniesienie: cel zapisany, żadne źródło – linia z dopiskiem dni niezapisanych i „Cofnij” celu (zdejmuje z niego bloki)', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('y', '12:00', 60)]), [D3]: fileOf(D3, []) }, { status: (f, call) => (call === 1 && f !== D3 ? 'broken' : 'applied') })
    await runBlockGroup('week', [blockKey(D1, 'x'), blockKey(D2, 'y')], { kind: 'moveTo', date: D3 }, undefined, AT)
    expect(idsOf(s.files[D3], D3)).toEqual(['x', 'y'])
    expect(line()).toBe('Przeniesiono 0 bloków · 2 dni niezapisane')
    await undoGroupLine('week')
    expect(line()).toBeUndefined()
    expect(idsOf(s.files[D3], D3)).toEqual([])
    expect(idsOf(s.files[D1], D1)).toEqual(['x'])
    expect(idsOf(s.files[D2], D2)).toEqual(['y'])
  })

  it('przeniesienie z dziś i innego dnia, dzisiejsza połowa odrzucona: bez energii dnia dzisiejszego (niezapisanego)', async () => {
    const plan = [flex('e1', '11:00', 60, { categoryId: 'analiza' }), flex('e2', '12:00', 60, { categoryId: 'analiza' })]
    const events = { [TODAY]: new Scenario({ date: TODAY, plan }).observe('04:30', null).checkin('04:45', ZERO).events }
    const files = () => ({ [TODAY]: fileOf(TODAY, plan), [D1]: fileOf(D1, [flex('x', '11:00', 30)]), [D2]: fileOf(D2, []) })
    const days = [
      { date: TODAY, ids: ['e1', 'e2'] },
      { date: D1, ids: ['x'] }
    ]
    stub(files(), { events })
    expect((await changeDaysGroup(days, { k: 'moveTo', date: D2 }, { at: AT })).energy).toBeDefined()
    stub(files(), { events, status: (f, call) => (f === TODAY && call === 1 ? 'broken' : 'applied') })
    const r = await changeDaysGroup(days, { k: 'moveTo', date: D2 }, { at: AT })
    expect(r).toMatchObject({ changed: 1, refusedDays: 1 })
    expect(r.energy).toBeUndefined()
  })

  it('koszt zaczętego bloku – zdarzenie dnia, nie plik: zapisane, choć plik tego dnia uszkodzony; linia go liczy', async () => {
    const plan = [flex('run', '05:00', 120), flex('x', '12:00', 30)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events }, status: () => 'broken' })
    const r = await changeDaysGroup([{ date: TODAY, ids: ['run', 'x'] }], { k: 'cost', costs: COST }, { at: AT + 30 * 60_000 })
    expect(s.logged).toEqual([{ k: 'block.cost', day: TODAY, block: 'run', costs: COST }])
    expect(r).toMatchObject({ status: 'saved', changed: 1, refusedDays: 1 })
    expect(r.undo).not.toBeNull()
  })

  it('sam koszt zaczętego bloku, zapis zdarzenia padł: jeden komunikat „Nie zapisano”, bez „Bez zmian”', async () => {
    const plan = [flex('run', '05:00', 120)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    s.fail.log = true
    await runBlockGroup('week', [blockKey(TODAY, 'run')], { kind: 'cost', costs: COST }, undefined, AT + 30 * 60_000)
    expect(toasts()).toEqual(['Nie zapisano: log zamknięty'])
    expect(line()).toBeUndefined()
  })

  it('„Cofnij” kosztu zaczętego bloku, gdy dnia nie da się teraz odczytać – nic nie liczone, zostaje do kolejnego „Cofnij”', async () => {
    const plan = [flex('run', '05:00', 120)]
    const events = new Scenario({ date: TODAY, plan }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, plan) }, { events: { [TODAY]: events } })
    const r = await changeDaysGroup([{ date: TODAY, ids: ['run'] }], { k: 'cost', costs: COST }, { at: AT + 30 * 60_000 })
    const later = [...events, ...new Scenario({ date: TODAY, plan }).raw({ k: 'block.cost', block: 'run', at: AT + 30 * 60_000, costs: COST }, '05:30').events.map((e) => ({ ...e, id: 'pca-cost', n: 99 }))]
    s.rd.dayData = async (date) => ({ date, dayFile: s.files[date] ?? null, nextFile: null, prevFile: null, events: later, complete: true, unknown: false, away: false }) as DayData
    s.logged.length = 0
    s.unreadable.add(TODAY)
    expect(await r.undo!(AT + 40 * 60_000)).toEqual({ saved: false, restored: 0, kept: 0 })
    expect(s.logged).toEqual([])
    expect(toasts()).toEqual([undoUnreadableText([TODAY])])
    s.unreadable.clear()
    expect(await r.undo!(AT + 40 * 60_000)).toEqual({ saved: true, restored: 1, kept: 0 })
    expect(s.logged).toEqual([{ k: 'block.cost', day: TODAY, block: 'run', costs: null }])
  })

  it('„Cofnij” pól, jeden dzień spotkał pytanie: cofnięty, czeka na odpowiedź – linia znika z „1 dzień czeka na odpowiedź”, dzień nie wysyłany drugi raz', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('a', '11:00', 30)]), [D2]: fileOf(D2, [flex('b', '11:00', 30)]) }, { status: (f, call) => (f === D1 && call === 2 ? 'conflict' : 'applied') })
    await runBlockGroup('week', [blockKey(D1, 'a'), blockKey(D2, 'b')], CATEGORY, undefined, AT)
    await undoGroupLine('week')
    expect(line()).toBeUndefined()
    expect(toasts()).toEqual(['Ta zmiana spotkała się ze zmianą z innego komputera – odpowiedz na pytanie u góry okna.', '1 dzień czeka na odpowiedź'])
    expect(catsOf(s.files[D2], D2)).toEqual({ b: 'inne' })
    expect(s.sent).toHaveLength(2)
  })

  it('„Cofnij” usunięcia, dzisiejszy wpis spotkał pytanie: zakończony blok otwiera się według wpisu cofnięcia; dzień czeka na odpowiedź', async () => {
    const today = [flex('run', '05:00', 60)]
    const events = new Scenario({ date: TODAY, plan: today }).start('run', '05:00').events
    const s = stub({ [TODAY]: fileOf(TODAY, today), [D1]: fileOf(D1, [flex('c', '11:00', 30)]) }, { events: { [TODAY]: events }, status: (f, call) => (f === TODAY && call === 2 ? 'conflict' : 'applied') })
    const r = await changeDaysGroup(
      [
        { date: TODAY, ids: ['run'] },
        { date: D1, ids: ['c'] }
      ],
      { k: 'remove' },
      { at: AT + 10 * 60_000 }
    )
    expect(r.changed).toBe(2)
    expect(await r.undo!()).toEqual({ saved: true, restored: 1, kept: 0, waitingDays: 1 })
    expect(idsOf(s.files[D1], D1)).toEqual(['c'])
    expect(s.clicks.at(-1)).toEqual({ a: 'undoRemove', block: 'run', day: TODAY })
  })

  it('dzisiejszy plik uszkodzony, zakończony blok nie otworzył się z powrotem – komunikat jak przy usunięciu jednego', async () => {
    const today = [flex('run', '05:00', 60)]
    const events = new Scenario({ date: TODAY, plan: today }).start('run', '05:00').events
    stub({ [TODAY]: fileOf(TODAY, today) }, { events: { [TODAY]: events }, status: () => 'broken', timer: (c) => (c.a === 'undoRemove' ? { ok: false, why: 'dzień zamknięty', confirm: null } : { ok: true, why: null, confirm: null }) })
    await changeDaysGroup([{ date: TODAY, ids: ['run'] }], { k: 'remove' }, { at: AT + 10 * 60_000 })
    expect(toasts()).toEqual([BROKEN_FILE_TEXT, notReopenedText(1, 'dzień zamknięty')])
    expect(notReopenedText(1, 'dzień zamknięty')).toBe('Blok nie otworzył się z powrotem: dzień zamknięty – został poza planem.')
    expect(notReopenedText(2, null)).toBe('2 bloki nie otworzyły się z powrotem: spróbuj „Pracuję” – zostały poza planem.')
  })

  it('„Cofnij” usunięcia: dzień z samymi załącznikami do przywrócenia, wysyłka padła – nie zrobiony, kolejne „Cofnij” go robi', async () => {
    const attachment = (removedAt: number | null): RawRecord => ({ schema: 1, id: 'att1', kind: 'link', name: '', link: { url: 'https://www.example.com/a', title: null, iconDataUrl: null }, file: null, owner: { scope: 'day', date: D1, blockId: 'c' }, addedAt: 1, removedAt })
    const s = stub({ [D1]: fileOf(D1, [flex('c', '11:00', 30)]) })
    useData.setState({ view: { today: TODAY, attachments: [attachment(null)] } as unknown as DataView, attachments: [attachmentFrom(attachment(null))!] })
    const r = await changeDaysGroup([{ date: D1, ids: ['c'] }], { k: 'remove' }, { at: AT })
    expect(r.changed).toBe(1)
    // The block is back on another computer meanwhile: the day's file has nothing to undo, its attachment still has.
    s.files[D1] = fileOf(D1, [flex('c', '11:00', 30)])
    s.files[attachmentRel('att1')] = attachment(AT)
    useData.setState({ view: { today: TODAY, attachments: [attachment(AT)] } as unknown as DataView })
    s.fail.edit = true
    expect((await r.undo!()).saved).toBe(false)
    s.fail.edit = false
    expect(await r.undo!()).toEqual({ saved: true, restored: 0, kept: 1 })
    expect((s.files[attachmentRel('att1')] as { removedAt?: unknown }).removedAt).toBeNull()
  })
})
