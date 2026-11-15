/**
 * D513 – kopia Ctrl + przeciągnięciem w oknie bez DOM: „Tydzień” i „3 dni” (`copyDayBlock` – w tym samym dniu i na inny dzień; tą samą drogą „Dziś”),
 * „Dziś” (`copyBlockTo`), „Szablony” (`copyTemplateBlock`), lista „Sprawy” na oś (`planCase(…, { copy })`). Oryginał zostaje
 * nietknięty; kopia to nowy blok (nowe id) w miejscu upuszczenia, rozsuwa kolejne elastyczne jak nowy blok (D367) w tym samym wpisie;
 * kopia bloku zadania niesie nową sprawę o tej samej treści (idzie za plikiem dnia – T923); kopia bierze kopie plików załączników;
 * jedno „Cofnij” (dymek) zdejmuje wszystko: kopię, przesunięcia, nowe sprawy i kopie załączników.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AttachPrepared, AttachResult, DataView, DayData, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import { classify, paths } from '@shared/data/paths'
import { attachmentRel, type AttachmentOwner } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { copyBlockTo, copyPreview, copyTemplateBlock, copiedText } from '@renderer/features/plan/blockCopy'
import { shownSpan } from '@renderer/features/plan/Timeline'
import { COPY_SPAN_ID, pushedSpans } from '@renderer/features/today/dayPush'
import { templateCopy } from '@renderer/features/templates/templatePush'
import { copyDayBlock as copyWeekBlock } from '@renderer/features/week/weekMove'
import { planCase, undoCase } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import { countDay } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, lm } from '../unit/engine/dsl'

// Far ahead of the real clock; the window's clock (`AT`) is 05:00 of „today” – before its blocks.
const TODAY = '2098-12-31'
const D1 = '2099-01-05'
const D2 = '2099-01-06'
const PAST = '2020-01-01'
const AT = placeLogical(TODAY, 5 * 60)
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: PlanBlock[], extra: RawRecord = {}): RawRecord => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

/**
 * The folder as the window sees it: days and records change as the edits sent apply (a removal – no file); the attachments'
 * copies the main process would make are counted (`copies`) and written by `attachCommit` as records.
 */
function stub(days: Record<string, RawRecord | null>, records: RawRecord[] = [], o: { attachments?: RawRecord[]; templates?: RawRecord[] } = {}) {
  const files: Record<string, RawRecord | null> = { ...days }
  const recs = new Map<string, RawRecord>(records.map((r) => [paths.record('request', String(r.id)), r]))
  for (const a of o.attachments ?? []) recs.set(attachmentRel(String(a.id)), a)
  for (const t of o.templates ?? []) recs.set(paths.record('template', String(t.id)), t)
  const sent: EditEntry[][] = []
  const told: unknown[][] = []
  const copies: Array<{ owner: AttachmentOwner; ids: string[] }> = []
  const prepared = new Map<string, RawRecord>()
  const kind = (dir: string) => [...recs].filter(([rel]) => rel.startsWith(`${dir}/`)).map(([, r]) => r)
  const view = (): DataView => ({ status: 'open', today: TODAY, rd: rdFrom(undefined), templates: kind('templates'), lectures: [], requests: kind('requests'), routines: [], series: [], seriesDays: {}, allDay: [], attachments: kind('attachments'), computers: [] }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
    caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, files[d] ?? null])), gone: Object.fromEntries(dates.map((d) => [d, []])), begun: Object.fromEntries(dates.map((d) => [d, []])) }),
    edit: async (entries) => {
      sent.push(entries)
      return entries.map((e) => {
        const c = classify(e.rel)!
        const was = c.kind === 'day' ? (files[c.date!] ?? null) : (recs.get(e.rel) ?? null)
        const next = e.remove ? null : e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (was ?? {}))
        if (c.kind === 'day') files[c.date!] = next
        else if (next) recs.set(e.rel, next)
        else recs.delete(e.rel)
        return { status: 'applied' as const }
      })
    },
    dataView: async () => view(),
    planPushed: async (...a) => void told.push(a),
    attachCopy: async (owner, ids): Promise<AttachPrepared> => {
      copies.push({ owner, ids })
      const made = ids.map((from, i) => {
        const id = `kopia-${copies.length}-${i}`
        prepared.set(id, { ...recs.get(attachmentRel(from))!, id, owner })
        return id
      })
      return { ids: made, failed: [] }
    },
    attachCommit: async (ids): Promise<AttachResult> => {
      for (const id of ids) recs.set(attachmentRel(id), prepared.get(id)!)
      return { added: ids, failed: [] }
    }
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  const v = view()
  useData.setState({ view: v, rd: rdFrom(undefined), requests: kind('requests').map((r) => requestFrom(r)!), templates: kind('templates').map((t) => templateFrom(t)!), attachments: [] })
  return { files, recs, sent, told, copies }
}

const blocksOf = (raw: RawRecord | null | undefined, date: string) => dayFileFrom(raw ?? {}, date).blocks
const startOf = (raw: RawRecord | null | undefined, date: string, id: string) => blocksOf(raw, date).find((b) => b.id === id)?.startMin
const toast = () => useUi.getState().toasts.at(-1)!
const undo = async (s: { sent: EditEntry[][] }) => {
  const n = s.sent.length
  ;(toast() as unknown as { action: { run: () => void } }).action.run()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 50 && s.sent.length === n; i++) await new Promise((r) => setTimeout(r, 5))
  await new Promise((r) => setTimeout(r, 20))
}
const mv = (blockId: string, from: string, to: string, start: string, name = 'Blok') => ({ blockId, name, from, to, startMin: lm(start) })

describe('D513 – „Tydzień” i „3 dni”: kopia Ctrl + przeciągnięciem', () => {
  it('na inny dzień: oryginał zostaje (plik dnia źródłowego nietknięty), kopia z nowym id o godzinie upuszczenia; jedna edycja – tylko dzień docelowy', async () => {
    const x = flex('x', '11:00', 60, { note: '**ważne**', moves: 2, movedFrom: PAST, steps: [{ id: 's1', title: 'krok', order: 0, done: false }] })
    const s = stub({ [D1]: fileOf(D1, [x], { stepsDone: { x: { s1: true } } }), [D2]: fileOf(D2, []) })
    const before = JSON.stringify(s.files[D1])
    expect(await copyWeekBlock(mv('x', D1, D2, '12:00', 'Raport'), AT)).toBe('saved')
    expect(JSON.stringify(s.files[D1])).toBe(before)
    expect(s.sent.map((c) => c.map((e) => e.rel))).toEqual([[paths.day(D2)]])
    const [copy] = blocksOf(s.files[D2], D2)
    expect(copy!.id).not.toBe('x')
    expect(copy).toMatchObject({ startMin: lm('12:00'), durationMin: 60, note: '**ważne**', moves: 0, movedFrom: null, origin: 'user' })
    // No history: the original's ticks stay its own.
    expect(dayFileFrom(s.files[D2]!, D2).stepsDone).toEqual({})
    expect(toast().text).toBe('Skopiowano: Raport na wt 6.01')
  })

  it('na zajętym miejscu rozsuwa kolejne elastyczne dnia docelowego w tym samym wpisie; jedno „Cofnij” zdejmuje kopię i przywraca godziny', async () => {
    // The evening: the default day's sessions (08:00–11:00, 14:00–17:00) are over.
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, [flex('a', '18:00', 60), flex('b', '19:00', 60)]) })
    expect(await copyWeekBlock(mv('x', D1, D2, '18:00', 'Raport'), AT)).toBe('saved')
    expect(s.sent).toHaveLength(1)
    expect(startOf(s.files[D2], D2, 'a')).toBe(lm('19:00'))
    expect(startOf(s.files[D2], D2, 'b')).toBe(lm('20:00'))
    expect(toast().text).toBe('Skopiowano: Raport na wt 6.01 · przesunięto 2 bloki')
    // A day not today: no word to the bar.
    expect(s.told).toEqual([])
    await undo(s)
    expect(blocksOf(s.files[D2], D2).map((b) => [b.id, b.startMin])).toEqual([
      ['a', lm('18:00')],
      ['b', lm('19:00')]
    ])
    expect(startOf(s.files[D1], D1, 'x')).toBe(lm('11:00'))
  })

  it('w tym samym dniu: oryginał na swoim miejscu, kopia obok; blok serii – pojedynczy blok poza serią', async () => {
    const occ = flex('occ', '11:00', 30, { origin: 'series', sourceId: 'root1' })
    const s = stub({ [D1]: fileOf(D1, [flex('x', '09:00', 30), occ]) })
    expect(await copyWeekBlock(mv('occ', D1, D1, '18:00', 'Fizjo'), AT)).toBe('saved')
    const blocks = blocksOf(s.files[D1], D1)
    expect(blocks.find((b) => b.id === 'occ')).toMatchObject({ startMin: lm('11:00'), origin: 'series' })
    expect(blocks.filter((b) => b.id !== 'occ' && b.id !== 'x')).toMatchObject([{ startMin: lm('18:00'), origin: 'user', sourceId: null }])
    expect(toast().text).toBe('Skopiowano: Fizjo')
  })

  it('dzień miniony – odmowa, nic nie zapisane; blok, którego już nie ma – nic nie zapisane', async () => {
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [PAST]: fileOf(PAST, []) })
    expect(await copyWeekBlock(mv('x', D1, PAST, '12:00'), AT)).toBe('refused')
    expect(await copyWeekBlock(mv('nie-ma', D1, D2, '12:00'), AT)).toBe('failed')
    expect(s.sent).toEqual([])
  })

  it('kopia bloku zadania: nowa sprawa o tej samej treści, zaplanowana w kopii, idzie za plikiem dnia (T923); „Cofnij” usuwa ją z kopią', async () => {
    const task = { ...newTask('t1', 1, TODAY, { title: 'Napisać raport', note: 'szczegóły' })!, steps: [{ id: 's1', title: 'krok', order: 0 }], stepsDone: { s1: true }, day: D1, block: 'x', state: 'planned' }
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 30, { task: 't1', steps: [{ id: 's1', title: 'krok', order: 0, done: false }] })]), [D2]: null }, [task])
    expect(await copyWeekBlock(mv('x', D1, D2, '12:00', 'Napisać raport'), AT)).toBe('saved')
    const [copy] = blocksOf(s.files[D2], D2)
    expect(copy!.task).not.toBe('t1')
    const rel = paths.record('request', copy!.task!)
    expect(s.sent[0]!.map((e) => [e.rel, e.after ?? null])).toEqual([
      [paths.day(D2), null],
      [rel, [0]]
    ])
    // Its own state: not done, planned in the copy only (`state` – the mirror of „zaplanowane” for an older version).
    expect(requestFrom(s.recs.get(rel))).toMatchObject({ title: 'Napisać raport', note: 'szczegóły', day: D2, block: copy!.id, state: 'planned', doneAt: null })
    expect(s.recs.get(rel)!.stepsDone).toBeUndefined()
    // The original task is not touched.
    expect(s.recs.get(paths.record('request', 't1'))).toEqual(task)
    await undo(s)
    expect(s.recs.has(rel)).toBe(false)
    expect(blocksOf(s.files[D2], D2)).toEqual([])
  })

  it('kopia bierze kopie załączników bloku (własny, nowy właściciel – blok kopii); „Cofnij” wyrzuca je do kosza, oryginały nietknięte', async () => {
    const att = { schema: 1, id: 'att1', kind: 'file', name: 'plan.pdf', file: { fileName: 'plan.pdf', size: 3 }, owner: { scope: 'day', date: D1, blockId: 'x' }, addedAt: 1, removedAt: null }
    const s = stub({ [D1]: fileOf(D1, [flex('x', '11:00', 60)]), [D2]: fileOf(D2, []) }, [], { attachments: [att] })
    useData.setState({ attachments: [{ id: 'att1', kind: 'file', name: 'plan.pdf', file: { fileName: 'plan.pdf', size: 3, ext: 'pdf' }, link: null, owner: { scope: 'day', date: D1, blockId: 'x' }, addedAt: 1, removedAt: null }] })
    expect(await copyWeekBlock(mv('x', D1, D2, '12:00'), AT)).toBe('saved')
    const [copy] = blocksOf(s.files[D2], D2)
    // The copies of the files go on after the save.
    await vi.waitFor(() => expect(s.copies).toEqual([{ owner: { scope: 'day', date: D2, blockId: copy!.id }, ids: ['att1'] }]))
    await vi.waitFor(() => expect(s.recs.get(attachmentRel('kopia-1-0'))).toMatchObject({ owner: { scope: 'day', date: D2, blockId: copy!.id }, removedAt: null }))
    await undo(s)
    await vi.waitFor(() => expect(s.recs.get(attachmentRel('kopia-1-0'))!.removedAt).toEqual(expect.any(Number)))
    expect(s.recs.get(attachmentRel('att1'))!.removedAt).toBeNull()
  })
})

describe('D513 – „Dziś”: kopia na osi dnia', () => {
  it('kopia na zajęte miejsce dziś: kopia i przesunięcia jednym wpisem, pasek słyszy tylko o przesunięciu (bez własnej linii)', async () => {
    const plan = [flex('a', '18:00', 60), flex('b', '19:00', 60)]
    const s = stub({ [TODAY]: fileOf(TODAY, plan) })
    const day = countDay(TODAY, { date: TODAY, dayFile: s.files[TODAY]!, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [], lectures: [], series: [] }, AT, false)
    // „a” copied onto 19:00: „b” goes on; „a” itself stays (a copy never changes it).
    const r = await copyBlockTo({ to: TODAY, today: TODAY, startMin: lm('19:00'), name: 'Inne', at: AT, read: async () => ({ block: plan[0]!, place: { scope: 'day', date: TODAY, templateId: null }, day, file: s.files[TODAY]! }) })
    expect(r).toMatchObject({ saved: true, pushed: 1 })
    expect(s.sent).toHaveLength(1)
    expect(startOf(s.files[TODAY], TODAY, 'a')).toBe(lm('18:00'))
    expect(startOf(s.files[TODAY], TODAY, 'b')).toBe(lm('20:00'))
    expect(startOf(s.files[TODAY], TODAY, r.block!.id)).toBe(lm('19:00'))
    expect(s.told.map((t) => [t[0], t[1], t[4]])).toEqual([[TODAY, 1, false]])
    expect(toast().text).toBe(copiedText('Inne', { pushed: 1 }))
  })
})

describe('D513 – podgląd kopii w trakcie przeciągania', () => {
  it('kopia przed oryginałem: oryginał stoi (jak blok stały), inne elastyczne przeskakują go; miejsce kopii nigdy pod id oryginału (`COPY_SPAN_ID`)', () => {
    const plan = [flex('a', '18:00', 60), flex('b', '19:00', 60)]
    const day = countDay(D1, { date: D1, dayFile: fileOf(D1, plan), nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [], lectures: [], series: [] }, AT, false)
    // „b” copied to 18:00: „a” goes past „b”, which stays where it is.
    const c = copyPreview(day, plan[1]!, lm('18:00'), true)
    expect(c.pushed.map((p) => p.id)).toEqual(['a'])
    const shown = pushedSpans(day, c, 'plan')!
    expect(shown.has('b')).toBe(false)
    expect(shown.get('a')!.startMin).toBeGreaterThanOrEqual(lm('20:00'))
    expect(shown.has(COPY_SPAN_ID)).toBe(false)
  })

  it('oś: duch kopii stoi pod wskaźnikiem albo tam, gdzie podgląd stawia kopię – nigdy na miejscu przesuniętego oryginału', () => {
    const pushed = new Map([['b', { startMin: lm('20:00'), endMin: lm('21:00') }]])
    const held = { id: 'b', start: lm('18:00'), end: lm('19:00') }
    expect(shownSpan({ ...held, copy: true }, null, pushed)).toEqual({ startMin: lm('18:00'), endMin: lm('19:00') })
    expect(shownSpan({ ...held, copy: true }, null, new Map([...pushed, [COPY_SPAN_ID, { startMin: lm('18:05'), endMin: lm('19:05') }]]))).toEqual({ startMin: lm('18:05'), endMin: lm('19:05') })
    // A move: the block itself where the preview puts it (D372).
    expect(shownSpan({ ...held, copy: false }, null, pushed)).toEqual({ startMin: lm('20:00'), endMin: lm('21:00') })
  })

  it('„Szablony”: podgląd ma miejsce kopii pod `COPY_SPAN_ID`; oryginał stoi – nie ma go w podglądzie', () => {
    const t: Template = { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2000-01-01', blocks: [planBlock({ id: 'a', categoryId: 'inne', startMin: lm('18:00'), durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }] }
    const SUNDAY = '2026-11-15'
    const day = countDay(SUNDAY, { date: SUNDAY, dayFile: { schema: 1, date: SUNDAY, dayType: 'zwykly' }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [t], lectures: [], series: [] }, placeLogical(SUNDAY, 4 * 60), false)
    const preview = templateCopy(day, t.versions[0]!.blocks[0]!, lm('17:30'), COPY_SPAN_ID).preview
    expect(preview.get(COPY_SPAN_ID)).toEqual({ startMin: lm('17:30'), endMin: lm('18:30') })
    expect(preview.has('a')).toBe(false)
  })
})

describe('D513 – „Szablony”: kopia bloku szablonu', () => {
  it('nowy blok szablonu w wersji od daty zmian; jedno „Cofnij” przywraca szablon', async () => {
    const t: Template = { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2000-01-01', blocks: [planBlock({ id: 'a', categoryId: 'inne', startMin: lm('18:00'), durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }] }
    const raw = templateJson(t)
    const s = stub({}, [], { templates: [raw] })
    const SUNDAY = '2026-11-15'
    const day = countDay(SUNDAY, { date: SUNDAY, dayFile: { schema: 1, date: SUNDAY, dayType: 'zwykly' }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [t], lectures: [], series: [] }, placeLogical(SUNDAY, 4 * 60), false)
    const r = await copyTemplateBlock({ templateId: 'zwykly', from: '2000-01-01', day, block: t.versions[0]!.blocks[0]!, startMin: lm('20:00'), name: 'Inne' })
    expect(r.saved).toBe(true)
    const after = templateFrom(s.recs.get(paths.record('template', 'zwykly')))!
    expect(after.versions[0]!.blocks.map((b) => [b.id === 'a' ? 'a' : 'kopia', b.startMin, b.origin])).toEqual([
      ['a', lm('18:00'), 'template'],
      ['kopia', lm('20:00'), 'template']
    ])
    await undo(s)
    expect(templateFrom(s.recs.get(paths.record('template', 'zwykly')))!.versions[0]!.blocks.map((b) => b.id)).toEqual(['a'])
  })
})

describe('D513 – lista „Sprawy” na oś z Ctrl', () => {
  it('kopia sprawy: nowa sprawa zaplanowana na osi, oryginał zostaje na liście bez zmian; „Cofnij” usuwa kopię', async () => {
    const task = newTask('t1', 1, TODAY, { title: 'Zadzwonić', list: 'today' })!
    const s = stub({ [D1]: null }, [task])
    const r = await planCase('t1', D1, lm('10:00'), { copy: true })
    expect(r.saved).toBe(true)
    expect(r.id).not.toBe('t1')
    expect(s.recs.get(paths.record('request', 't1'))).toEqual(task)
    const copy = requestFrom(s.recs.get(paths.record('request', r.id!)))!
    expect(copy).toMatchObject({ title: 'Zadzwonić', day: D1, block: r.block!.id, list: 'today' })
    expect(blocksOf(s.files[D1], D1).map((b) => b.task)).toEqual([r.id])
    // The copy goes with the day that holds its block (T923).
    expect(s.sent[0]!.map((e) => [e.rel, e.after ?? null])).toEqual([
      [paths.day(D1), null],
      [paths.record('request', r.id!), [0]]
    ])
    expect((await undoCase(r.undo)).saved).toBe(true)
    expect(s.recs.has(paths.record('request', r.id!))).toBe(false)
    expect(s.recs.get(paths.record('request', 't1'))).toEqual(task)
    expect(blocksOf(s.files[D1], D1)).toEqual([])
  })
})
