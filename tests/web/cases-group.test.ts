/**
 * Group changes of „Sprawy” (D527–D531, ciąg Z, `store/casesGroup.ts`) without a DOM: several sprawy changed in one edit of the queue
 * (to a list, the category, the estimate, „Zrobione”, removed), the sprawy the action does not concern left out with their reason
 * (D72), „Zaplanuj…” one after another in one change of the day's file, the drop of a group (with Ctrl – copies), and the one „Cofnij”
 * (D529) that takes back only what stands as the change left it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { caseItems, patchedRaw } from '@shared/engine/cases'
import { SKIP } from '@shared/engine/casesGroup'
import { computeDay } from '@shared/engine/day'
import { dayFileFrom } from '@shared/model/plan'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { groupFreeStart, planGroupOnAxis, planningOfGroup, plannableOf } from '@renderer/features/cases/groupPlan'
import { DAY_UNREADABLE } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import { categoryCases, doneCases, estimateCases, moveCases, planCases, removeCases, restoreCases, undoGroup } from '@renderer/store/casesGroup'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const TODAY = logicalDayOf(Date.now())
const rel = (id: string) => paths.record('request', id)
const task = (id: string, p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask(id, Date.now(), TODAY, { title: `zadanie ${id}`, estimateMin: 30, ...p })!

/** The window over a folder of records and days' files; `set` lays what the edits leave, as the folder would. */
function stub(records: RawRecord[], days: Record<string, RawRecord | null> = {}) {
  const sent: EditEntry[][] = []
  const state = { records: [...records], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in state.days)
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  const set = (r: string, v: RawRecord | null) => {
    if (r.startsWith('days/')) state.days[r.slice(10, 20)] = v
    else state.records = [...state.records.filter((x) => rel(String(x.id)) !== r), ...(v ? [v] : [])]
    useData.setState({ view: view(), requests: state.records.map((x) => requestFrom(x)!) })
  }
  /** The folder as the change left it. */
  const lay = (undo: ReadonlyArray<{ rel: string; after: RawRecord | null }>) => undo.forEach((u) => set(u.rel, u.after))
  const record = (id: string) => state.records.find((x) => x.id === id)
  const day = (d: string) => state.days[d] ?? null
  return { sent, set, lay, record, day }
}

const field = (e: EditEntry, name: string) => e.edits.find((x) => x.path.join('.') === name)?.value
const startsOf = (file: RawRecord | null, date = TODAY) => dayFileFrom(file, date).blocks.map((b) => b.startMin)

/** „Dziś” as the window counts it (a plan with two blocks of yours at 10:00 and 11:00, as in `cases-screens`). */
function dayOf(date: string, plan = [block({ id: 'a', cat: 'inne', at: '10:00', min: 60, origin: 'user' }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60, origin: 'user' })]) {
  const s = new Scenario({ date, plan }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { date, ctx, state: computeDay(ctx), data: { dayFile: null } } as unknown as DayModel
}

describe('zmiany grupowe spraw – lista, kategoria, szacunek, zrobione, usuń', () => {
  it('3 sprawy ze Skrzynki → „Dziś” w jednej edycji; „Cofnij” – znów w Skrzynce', async () => {
    const { sent, lay, record } = stub([task('a'), task('b'), task('c')])
    const r = await moveCases(['a', 'b', 'c'], 'today')
    expect(r).toMatchObject({ saved: true, changed: 3, skipped: [] })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual(['a', 'b', 'c'].map(rel))
    expect(field(sent[0]![0]!, 'list')).toBe('today')
    lay(r.undo)
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 3, kept: 0 })
    expect(sent).toHaveLength(2)
    for (const e of sent[1]!) expect(field(e, 'list')).toBe('inbox')
    expect(record('a')).toBeTruthy()
  })

  it('sprawa zmieniona po zmianie grupowej zostaje przy „Cofnij” i jest policzona; inne pola zmienionej nie blokują cofnięcia', async () => {
    const { sent, lay, set } = stub([task('a'), task('b'), task('c')])
    const r = await moveCases(['a', 'b', 'c'], 'today')
    lay(r.undo)
    // „a” moved to another list since, „b” had only its note changed, „c” is as the change left it.
    set(rel('a'), { ...r.undo.find((u) => u.rel === rel('a'))!.after!, list: 'week', listDay: null })
    set(rel('b'), { ...r.undo.find((u) => u.rel === rel('b'))!.after!, note: 'dopisane później' })
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 2, kept: 1 })
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([rel('b'), rel('c')])
    expect(field(sent[1]!.find((e) => e.rel === rel('b'))!, 'list')).toBe('inbox')
    // Only the fields of the change went back: the note written since is not in the edit.
    expect(sent[1]!.find((e) => e.rel === rel('b'))!.edits.map((x) => x.path.join('.'))).not.toContain('note')
  })

  it('sprawa już na tej liście – pominięta z powodem; same pominięte – nic nie wysłane', async () => {
    const { sent } = stub([task('a'), task('b', { list: 'today' })])
    const r = await moveCases(['a', 'b', 'gone'], 'today')
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 'b', reason: SKIP.sameList }, { id: 'gone', reason: SKIP.gone }] })
    expect(sent[0]!.map((e) => e.rel)).toEqual([rel('a')])
    const none = await moveCases(['b'], 'today')
    expect(none).toMatchObject({ saved: true, changed: 0, undo: [] })
    expect(sent).toHaveLength(1)
  })

  it('kategoria tylko zadań – prośba pominięta z powodem „prośba”; ta sama kategoria – „bez zmiany”', async () => {
    const q = newRequest('r1', Date.now(), { person: null, estimateMin: 15, note: 'x' })
    const { sent } = stub([task('a'), task('b', { categoryId: 'nauka' }), q])
    const r = await categoryCases(['a', 'b', 'r1'], 'nauka')
    expect(r).toMatchObject({ changed: 1, skipped: [{ id: 'b', reason: SKIP.same }, { id: 'r1', reason: SKIP.request }] })
    expect(field(sent[0]![0]!, 'categoryId')).toBe('nauka')
    expect(sent[0]).toHaveLength(1)
  })

  it('szacunek: wszystkim (też prośbom), poza zakresem – odmowa z powodem, nic nie wysłane', async () => {
    const q = newRequest('r1', Date.now(), { person: null, estimateMin: null, note: 'x' })
    const { sent } = stub([task('a'), task('b', { estimateMin: 45 }), q])
    const r = await estimateCases(['a', 'b', 'r1'], 45)
    expect(r).toMatchObject({ changed: 2, skipped: [{ id: 'b', reason: SKIP.same }] })
    expect(sent[0]!.map((e) => field(e, 'estimateMin'))).toEqual([45, 45])
    expect(await estimateCases(['a'], 0)).toMatchObject({ saved: false, error: 'Szacunek: od 1 min do 8 h.', changed: 0 })
    expect(await estimateCases(['a'], 9999)).toMatchObject({ saved: false })
    expect(sent).toHaveLength(1)
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Szacunek: od 1 min do 8 h.')
  })

  it('„Zrobione” i „Przywróć”: jak dla jednej; zadanie powtarzane dostaje następne w tej samej edycji, „Cofnij” zdejmuje oba', async () => {
    const repeated = patchedRaw(task('rep', { doDate: TODAY, list: 'today' }), { repeat: { rule: { kind: 'daily' }, until: null, count: null } }, Date.now())
    if ('error' in repeated) throw new Error(repeated.error)
    const { sent, lay, record } = stub([task('a'), repeated.raw, task('c', { list: 'done' })])
    const r = await doneCases(['a', 'rep', 'c'])
    expect(r).toMatchObject({ saved: true, changed: 2, skipped: [{ id: 'c', reason: SKIP.done }] })
    expect(r.nextIds).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([rel('a'), rel('rep'), rel(r.nextIds[0]!)].sort())
    expect(sent[0]!.find((e) => e.rel === rel('a'))!.edits.map((x) => [x.path.join('.'), x.value])).toContainEqual(['list', 'done'])
    lay(r.undo)
    expect(record('a')).toMatchObject({ list: 'done' })
    const back = await undoGroup(r.undo)
    // Two sprawy back; the next task is not a sprawa of its own in the count – it goes with its tick.
    expect(back).toMatchObject({ saved: true, restored: 2, kept: 0 })
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([rel('a'), rel('rep'), rel(r.nextIds[0]!)].sort())
    expect(sent[1]!.find((e) => e.rel === rel(r.nextIds[0]!))).toMatchObject({ remove: true })

    // „Przywróć”: the done ones back on a list (default „Skrzynka”), one not done is left out.
    const s2 = stub([task('x', { list: 'done' }), task('y')])
    const p = await restoreCases(['x', 'y'])
    expect(p).toMatchObject({ changed: 1, skipped: [{ id: 'y', reason: SKIP.notDone }] })
    expect(field(s2.sent[0]![0]!, 'list')).toBe('inbox')
  })

  it('usunięcie: jedna edycja, jedno „Cofnij” przywraca wszystkie pliki; już istniejący inny plik zostaje', async () => {
    const { sent, lay, set, record } = stub([task('a'), task('b'), task('c')])
    const r = await removeCases(['a', 'b', 'c', 'gone'])
    expect(r).toMatchObject({ saved: true, changed: 3, skipped: [{ id: 'gone', reason: SKIP.gone }] })
    expect(sent[0]!.every((e) => e.remove)).toBe(true)
    lay(r.undo)
    expect(record('a')).toBeUndefined()
    // „b” was written again by another computer since (not the same content): left as it is.
    set(rel('b'), task('b', { title: 'inne' }))
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 2, kept: 1 })
    expect(sent[1]!.map((e) => e.rel).sort()).toEqual([rel('a'), rel('c')])
    expect(sent[1]!.every((e) => e.create)).toBe(true)
  })

  it('błąd kroku jednej sprawy (zadanie bez tytułu) – pominięta z powodem, reszta zapisana; szacunek spoza zakresu – odmowa całości, nic pominiętego', async () => {
    const { sent } = stub([task('a'), { ...task('b'), title: '' }, task('c')])
    const r = await categoryCases(['a', 'b', 'c'], 'nauka')
    expect(r).toMatchObject({ saved: true, changed: 2, skipped: [{ id: 'b', reason: SKIP.refused }] })
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([rel('a'), rel('c')])
    const refused = await estimateCases(['a', 'b'], 0)
    expect(refused).toMatchObject({ saved: false, changed: 0, skipped: [] })
    expect(sent).toHaveLength(1)
  })

  it('„Cofnij” zadania powtarzanego: następne zostaje, gdy właściciel (odhaczone zadanie) zmieniony od tego czasu', async () => {
    const repeated = patchedRaw(task('rep', { doDate: TODAY, list: 'today' }), { repeat: { rule: { kind: 'daily' }, until: null, count: null } }, Date.now())
    if ('error' in repeated) throw new Error(repeated.error)
    const { sent, lay, set } = stub([task('a'), repeated.raw])
    const r = await doneCases(['a', 'rep'])
    expect(r.nextIds).toHaveLength(1)
    lay(r.undo)
    // The ticked task moved to another list since: it stays – and the next one stays with it (never an open task and its next side by side).
    set(rel('rep'), { ...r.undo.find((u) => u.rel === rel('rep'))!.after!, list: 'week' })
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 1, kept: 1 })
    expect(sent[1]!.map((e) => e.rel)).toEqual([rel('a')])
  })

})

describe('„Zaplanuj…” grupy i upuszczenie na oś (D530)', () => {
  it('3 sprawy (30, 15, 30 min) od 14:00 – bloki 14:00, 14:30, 14:45 w jednej zmianie pliku dnia; jedno „Cofnij” zdejmuje wszystkie', async () => {
    const { sent, lay, record, day, set } = stub([task('a', { estimateMin: 30 }), task('b', { estimateMin: 15 }), task('c', { estimateMin: 30 })], { [TODAY]: null })
    const r = await planCases(['a', 'b', 'c'], TODAY, lm('14:00'))
    expect(r).toMatchObject({ saved: true, changed: 3, skipped: [] })
    expect(r.blocks.map((x) => [x.id, x.block.startMin, x.block.durationMin])).toEqual([['a', lm('14:00'), 30], ['b', lm('14:30'), 15], ['c', lm('14:45'), 30]])
    expect(r.blocks.every((x) => x.block.categoryId === 'inne')).toBe(true)
    // One edit: the day's file once (all three blocks) and the three records.
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), rel('a'), rel('b'), rel('c')].sort())
    lay(r.undo)
    expect(startsOf(day(TODAY))).toEqual([lm('14:00'), lm('14:30'), lm('14:45')])
    expect(record('b')).toMatchObject({ day: TODAY, block: r.blocks[1]!.block.id, state: 'planned' })
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 3, kept: 0, daysKept: 0 })
    expect(sent).toHaveLength(2)
    const dayEdit = sent[1]!.find((e) => e.rel === paths.day(TODAY))!
    expect(dayEdit).toBeTruthy()
    lay(back.undo)
    expect(dayFileFrom(day(TODAY), TODAY).blocks).toEqual([])
    for (const id of ['a', 'b', 'c']) expect(record(id)).toMatchObject({ block: null, state: 'queued' })
    // Nothing of „Cofnij” is changed twice: the second one finds all as they were.
    set(rel('a'), record('a')!)
  })

  it('„Cofnij” planowania, gdy plik dnia zmieniony od tego czasu: dzień zostaje, sprawy z nim (rekordy nie wracają do „niezaplanowanych” bez bloku) i są policzone', async () => {
    const { sent, lay, set, record, day } = stub([task('a'), task('b')], { [TODAY]: null })
    const r = await planCases(['a', 'b'], TODAY, lm('10:00'))
    lay(r.undo)
    // Another block was added to the day since (here or on another computer): the day's file is not as the change left it.
    const file = day(TODAY)!
    set(paths.day(TODAY), { ...file, blocks: [...(file.blocks as unknown[]), { id: 'other', categoryId: 'inne', startMin: lm('13:00'), durationMin: 30, origin: 'user' }] })
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 0, kept: 2, daysKept: 1 })
    expect(sent).toHaveLength(1)
    for (const id of ['a', 'b']) expect(record(id)).toMatchObject({ day: TODAY, state: 'planned' })

    // The same for the copies of a drop with Ctrl: they stay with the day – no block of the group left with its sprawa taken away.
    const s2 = stub([task('c')], { [TODAY]: null })
    const c = await planCases(['c'], TODAY, lm('10:00'), { copy: true })
    s2.lay(c.undo)
    s2.set(paths.day(TODAY), { ...(s2.day(TODAY) as RawRecord), blocks: [] })
    expect(await undoGroup(c.undo)).toMatchObject({ saved: true, restored: 0, kept: 1, daysKept: 1 })
    expect(s2.sent).toHaveLength(1)
  })

  it('upuszczona grupa: pierwsza w minucie upuszczenia, z Ctrl – kopie, oryginały zostają na liście', async () => {
    const { sent, lay, record, day } = stub([task('a'), task('b', { estimateMin: 15 }), task('c')], { [TODAY]: null })
    const r = await planCases(['a', 'b', 'c'], TODAY, lm('10:00'), { copy: true })
    expect(r).toMatchObject({ saved: true, changed: 3, skipped: [] })
    expect(r.blocks.map((x) => x.block.startMin)).toEqual([lm('10:00'), lm('10:30'), lm('10:45')])
    // The originals are not written; three new records and the day.
    expect(sent[0]!.filter((e) => e.create).length).toBe(4)
    expect(sent[0]!.some((e) => [rel('a'), rel('b'), rel('c')].includes(e.rel))).toBe(false)
    for (const id of ['a', 'b', 'c']) expect(record(id)).toMatchObject({ list: 'inbox', day: null, block: null })
    const copies = sent[0]!.filter((e) => e.rel !== paths.day(TODAY)).map((e) => e.rel)
    expect(new Set(copies).size).toBe(3)
    lay(r.undo)
    expect(startsOf(day(TODAY))).toEqual([lm('10:00'), lm('10:30'), lm('10:45')])
    // „Cofnij”: the copies go and the blocks with them.
    const back = await undoGroup(r.undo)
    expect(back).toMatchObject({ saved: true, restored: 3 })
    // The three copies and the day's file (it was made by the change) are taken away.
    expect(sent[1]!.filter((e) => e.remove).length).toBe(4)
  })

  it('zaplanowana jest planowana od nowa jak „Zaplanuj” jednej (stary blok niezaczęty wychodzi z dnia), zrobiona i nieistniejąca pomijane; kopia nic nie pomija', async () => {
    const planned = { ...task('p'), day: TODAY, block: 'blk', state: 'planned' }
    const lost = { ...task('l'), day: TODAY, block: 'gone', state: 'planned' }
    const file = { schema: 1, date: TODAY, blocks: [{ id: 'blk', categoryId: 'inne', startMin: lm('09:00'), durationMin: 30, origin: 'user', task: 'p' }] }
    const { sent, lay, day } = stub([task('a'), planned, lost, task('d', { list: 'done' })], { [TODAY]: file })
    const r = await planCases(['a', 'p', 'l', 'd', 'nope'], TODAY, lm('14:00'))
    expect(r.changed).toBe(3)
    expect(r.skipped).toEqual([
      { id: 'd', reason: SKIP.done },
      { id: 'nope', reason: SKIP.gone }
    ])
    expect(r.blocks.map((x) => [x.id, x.block.startMin])).toEqual([['a', lm('14:00')], ['p', lm('14:30')], ['l', lm('15:00')]])
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), rel('a'), rel('l'), rel('p')].sort())
    lay(r.undo)
    // The old block of „p” (not begun) is out of the day – the sprawa has one block.
    expect(startsOf(day(TODAY))).toEqual([lm('14:00'), lm('14:30'), lm('15:00')])

    // Ctrl: copies of all of them (a planned one and a done one too) – the originals are never written.
    const copy = await planCases(['p', 'd'], TODAY, lm('16:00'), { copy: true })
    expect(copy).toMatchObject({ changed: 2, skipped: [] })
    expect(sent[1]!.some((e) => [rel('p'), rel('d')].includes(e.rel))).toBe(false)
  })

  it('pominięta sprawa nie odrzuca grupy przez swój dzień: zrobiona z blokiem w dniu nieczytelnym teraz jest pominięta, reszta zaplanowana', async () => {
    const done = { ...task('d', { list: 'done' }), day: '2020-01-01', block: 'x' }
    const { sent } = stub([task('a'), done], { [TODAY]: null })
    const r = await planCases(['d', 'a'], TODAY, lm('10:00'))
    expect(r).toMatchObject({ saved: true, changed: 1, skipped: [{ id: 'd', reason: SKIP.done }] })
    expect(sent).toHaveLength(1)
    // The day of a sprawa that is planned again and cannot be read does refuse the write – nothing, and nothing said as left out.
    const lost = { ...task('l'), day: '2020-01-01', block: 'x', state: 'planned' }
    const s2 = stub([task('a'), lost, task('d', { list: 'done' })], { [TODAY]: null })
    expect(await planCases(['d', 'a', 'l'], TODAY, lm('10:00'))).toMatchObject({ saved: false, error: DAY_UNREADABLE, changed: 0, skipped: [], blocks: [] })
    expect(s2.sent).toEqual([])
  })

  it('plik dnia nieczytelny teraz – nic nie zapisane; okno zna jego wersję – zapis', async () => {
    const { sent } = stub([task('a'), task('b')])
    expect(await planCases(['a', 'b'], TODAY, lm('10:00'))).toMatchObject({ saved: false, changed: 0, blocks: [] })
    expect(sent).toEqual([])
    const known = { schema: 1, date: TODAY, blocks: [] }
    expect((await planCases(['a', 'b'], TODAY, lm('10:00'), { seen: () => known })).changed).toBe(2)
  })

  it('okno: grupa upuszczona na 10:00 rozsuwa kolejne bloki dnia za wszystkimi nowymi (D367), zapis i rozsunięcie w jednej edycji', async () => {
    const model = dayOf(TODAY)
    const items = ['a', 'b', 'c'].map((id, i) => task(`t${id}`, { estimateMin: [30, 15, 30][i]! }))
    const { sent, lay, day } = stub(items, { [TODAY]: { schema: 1, date: TODAY, blocks: model.ctx.plan.map((b) => ({ ...b })) } })
    const list = caseItems(items.map((x) => requestFrom(x)!), TODAY, () => undefined)
    const plan = planningOfGroup(model, TODAY, list.map((x) => x.record), lm('10:00'))
    expect(plan.blocks.map((b) => b.startMin)).toEqual([lm('10:00'), lm('10:30'), lm('10:45')])
    expect(plan.pushed.map((p) => [p.block.id, p.startMin])).toEqual([['a', lm('11:15')], ['b', lm('12:15')]])
    const r = await planGroupOnAxis(model, TODAY, list, lm('10:00'))
    expect(r).toMatchObject({ saved: true, changed: 3, moved: 2 })
    expect(sent).toHaveLength(1)
    lay(r.undo)
    expect(dayFileFrom(day(TODAY), TODAY).blocks.map((b) => [b.id, b.startMin]).sort()).toEqual(
      [['a', lm('11:15')], ['b', lm('12:15')], ...r.blocks.map((x) => [x.block.id, x.block.startMin])].sort()
    )
    // „Cofnij” of the whole change: the day as before (the pushed blocks too), the records unplanned.
    const back = await undoGroup(r.undo)
    expect(back.saved).toBe(true)
    lay(back.undo)
    expect(dayFileFrom(day(TODAY), TODAY).blocks.map((b) => [b.id, b.startMin])).toEqual([['a', lm('10:00')], ['b', lm('11:00')]])
  })

  it('okno: zaplanowana liczona bez swojego starego bloku (jak planningOf), zrobiona nie rozsuwa dnia, dzień miniony nic nie rozsuwa', () => {
    const own = { ...block({ id: 'a', cat: 'inne', at: '10:00', min: 60, origin: 'user' }), task: 'p' }
    const model = dayOf(TODAY, [own, block({ id: 'b', cat: 'inne', at: '11:00', min: 60, origin: 'user' })])
    const planned = { ...task('p', { estimateMin: 60 }), day: TODAY, block: 'a', state: 'planned' }
    const rs = [planned, task('n')].map((x) => requestFrom(x)!)
    // „p” again at 10:00: its own block 'a' is out of the day, so 60 + 30 min before „b”, which goes to 11:30; 'a' is not pushed.
    const plan = planningOfGroup(model, TODAY, rs, lm('10:00'))
    expect(plan.blocks.map((x) => [x.startMin, x.durationMin])).toEqual([[lm('10:00'), 60], [lm('11:00'), 30]])
    expect(plan.pushed.map((x) => [x.block.id, x.startMin])).toEqual([['b', lm('11:30')]])
    // A done one is not planned: the list the window gives the write has none of it.
    const items = caseItems([...rs, requestFrom(task('d', { list: 'done' }))!], TODAY, () => undefined)
    expect(plannableOf(items).map((x) => x.record.id)).toEqual(['p', 'n'])
    expect(plannableOf(items, true)).toHaveLength(3)
    expect(planningOfGroup(dayOf('2026-11-10'), TODAY, rs, lm('10:00')).pushed).toEqual([])
  })

  it('podpowiedź startu: początek najbliższego wolnego miejsca dla całej grupy (dziś od teraz, inny dzień – godzina po pobudce)', () => {
    const model = dayOf(TODAY, [block({ id: 'a', cat: 'inne', at: '10:00', min: 60, origin: 'user' })])
    const items = caseItems([task('a', { estimateMin: 30 }), task('b', { estimateMin: 90 })].map((x) => requestFrom(x)!), TODAY, () => undefined)
    // Today from 09:00: the group takes 2 h – the gap 09:00–10:00 is too short, the place is after the block at 10:00.
    expect(groupFreeStart(model, { isToday: true, nowMin: lm('09:00'), wakeMin: model.ctx.wakeMin }, items)).toBe(lm('11:00'))
    // A gap that holds it: from 11:00 on.
    expect(groupFreeStart(model, { isToday: true, nowMin: lm('11:00'), wakeMin: model.ctx.wakeMin }, items)).toBe(lm('11:00'))
    expect(groupFreeStart(model, { isToday: false, nowMin: 0, wakeMin: model.ctx.wakeMin }, items)).toBe(model.ctx.wakeMin + 60)
  })
})
