/**
 * „Sprawy” – priorities and the matrix of Eisenhower (HKU3: D450): the field of the record (an old file reads without it, a
 * wrong value as none), its write, the order of the lists (due dates, P1–P4, the rest – each group as before), the matrix's
 * layout and filter, what a drop between its fields changes, and the morning plan's line of the sprawy „Ważne i pilne”
 * without a place in the plan.
 */
import { describe, expect, it } from 'vitest'
import { caseCompare, caseGroupOf, caseItems, listedRaw, morningCases, patchedRaw, type CaseItem } from '@shared/engine/cases'
import { dropPatch, MATRIX_FILTERS, MATRIX_ROWS, matrixCounts, matrixOf, priorityLine, priorityWithoutPlace } from '@shared/engine/casePriority'
import { newRequest, newTask, NO_PRIORITY_NAME, PRIORITIES, PRIORITY_NAMES, priorityFrom, requestFrom, type NewTask, type RequestRecord } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'

const WED = '2026-11-11'
const THU = '2026-11-12'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const rec = (raw: Record<string, unknown>): RequestRecord => requestFrom(raw)!
/** A task created `age` minutes ago (a bigger one is older – `caseOrder` puts the newest first). */
const task = (id: string, p: Partial<NewTask> = {}, age = 0): Record<string, unknown> => newTask(id, at(WED) - age * 60_000, WED, { title: `zadanie ${id}`, ...p })!
const items = (raws: Array<Record<string, unknown>>, today = WED): CaseItem[] => caseItems(raws.map(rec), today, () => null)
const ids = (xs: readonly CaseItem[]) => xs.map((x) => x.record.id)

describe('pole priorytetu (D450)', () => {
  it('stary plik bez pola czyta się jako brak priorytetu; zła wartość – też; lista jak dotąd', () => {
    const old = { schema: 1, id: 'q', person: 'mama', estimateMin: 20, note: 'zakupy', createdAt: 1, state: 'queued', day: null, block: null }
    expect(rec(old).priority).toBeNull()
    for (const bad of ['p5', 'P1', 1, true, {}, []]) expect(rec({ ...task('a'), priority: bad }).priority).toBeNull()
    expect(items([old])[0]!.list).toBe('inbox')
  })

  it('cztery ćwiartki czyta się tak, jak zapisano; nowe zadanie i prośba niosą pole (domyślnie null)', () => {
    for (const p of PRIORITIES) expect(rec({ ...task('a'), priority: p }).priority).toBe(p)
    expect(rec(task('a', { priority: 'p2' })).priority).toBe('p2')
    expect(rec(task('a')).priority).toBeNull()
    expect(rec(task('a', { priority: 'zły' as never })).priority).toBeNull()
    expect(rec(newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '', priority: 'p3' })).priority).toBe('p3')
    expect(rec(newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '' })).priority).toBeNull()
    expect(priorityFrom('p4')).toBe('p4')
    expect(priorityFrom(undefined)).toBeNull()
  })

  it('nazwy i krótkie formy w jednym miejscu', () => {
    expect(PRIORITIES.map((p) => PRIORITY_NAMES[p].name)).toEqual(['Ważne i pilne', 'Ważne', 'Pilne', 'Ani to, ani to'])
    expect(PRIORITIES.map((p) => PRIORITY_NAMES[p].short)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(NO_PRIORITY_NAME).toBe('Bez priorytetu')
  })

  it('zapis: ustawia, zmienia i czyści (null); zła wartość – odmowa; nieznane pola i reszta zostają', () => {
    const raw = { ...task('a'), future: { a: 1 } }
    const set = patchedRaw(raw, { priority: 'p1' }, at(WED))
    expect(set).toMatchObject({ raw: { priority: 'p1', title: 'zadanie a', future: { a: 1 } } })
    const changed = patchedRaw((set as { raw: Record<string, unknown> }).raw, { priority: 'p4' }, at(WED))
    expect(changed).toMatchObject({ raw: { priority: 'p4' } })
    expect(patchedRaw({ ...raw, priority: 'p2' }, { priority: null }, at(WED))).toMatchObject({ raw: { priority: null } })
    expect(patchedRaw({ ...raw, priority: 'p2' }, { title: 'inny' }, at(WED))).toMatchObject({ raw: { priority: 'p2', title: 'inny' } })
    expect(patchedRaw(raw, { priority: 'p9' as never }, at(WED))).toEqual({ error: 'Priorytet: nie ma takiej ćwiartki.' })
  })

  it('prośba też ma priorytet', () => {
    const r = newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '' })
    expect(patchedRaw(r, { priority: 'p3' }, at(WED))).toMatchObject({ raw: { priority: 'p3', kind: 'request' } })
  })
})

describe('kolejność list: termin, potem P1–P4, bez priorytetu (D450)', () => {
  it('grupy: termin 0, P1–P4 jako 1–4, reszta 9; zrobione zawsze w reszcie', () => {
    const g = (raw: Record<string, unknown>) => caseGroupOf(items([raw])[0]!)
    expect(g(task('a', { dueDate: THU, priority: 'p1' }))).toBe(0)
    expect(PRIORITIES.map((p) => g(task('a', { priority: p })))).toEqual([1, 2, 3, 4])
    expect(g(task('a'))).toBe(9)
    expect(g({ ...task('a', { priority: 'p1' }), state: 'done', list: 'done', doneAt: at(WED) })).toBe(9)
  })

  it('po terminie i z terminem najpierw, potem P1, P2, P3, P4, potem bez priorytetu – w grupie od najnowszej', () => {
    const list = items([
      task('none-old', {}, 50),
      task('p3', { priority: 'p3' }, 10),
      task('p1-old', { priority: 'p1' }, 40),
      task('p1-new', { priority: 'p1' }, 5),
      task('none-new', {}, 1),
      task('p4', { priority: 'p4' }, 20),
      task('p2', { priority: 'p2' }, 30),
      task('due-p4', { priority: 'p4', dueDate: '2026-11-20' }, 60),
      task('due-over', { dueDate: '2026-11-09' }, 70)
    ])
    expect(ids([...list].sort(caseCompare))).toEqual(['due-over', 'due-p4', 'p1-new', 'p1-old', 'p2', 'p3', 'p4', 'none-new', 'none-old'])
  })

  it('„Zrobione” bez zmian – po czasie wykonania, priorytet nie liczy się', () => {
    const done = (id: string, doneAt: number, priority: string | null) => ({ ...task(id, { priority: priority as never }), state: 'done', list: 'done', doneAt })
    const list = items([done('old', at(WED, 9), 'p1'), done('new', at(WED, 11), null)])
    expect([...list].sort(caseCompare).map((x) => x.record.id)).toEqual(['new', 'old'])
  })

  it('krok planu porannego (zadania z „Dziś”, prośby) porządkuje tak samo', () => {
    const today = (id: string, p: Partial<NewTask>, age: number) => task(id, { list: 'today', ...p }, age)
    const req = (id: string, priority: 'p1' | null, age: number) => ({ ...newRequest(id, at(WED) - age * 60_000, { person: 'mama', estimateMin: 10, note: '', priority }) })
    const offered = morningCases(items([today('t-none', {}, 1), today('t-p2', { priority: 'p2' }, 9), today('t-p1', { priority: 'p1' }, 20), req('r-none', null, 2), req('r-p1', 'p1', 30)]))
    expect(ids(offered.tasks)).toEqual(['t-p1', 't-p2', 't-none'])
    expect(ids(offered.requests)).toEqual(['r-p1', 'r-none'])
  })

  it('przeniesienie na inną listę nie zmienia priorytetu', () => {
    expect(rec(listedRaw(task('a', { priority: 'p2' }), 'week', at(WED))).priority).toBe('p2')
  })
})

describe('macierz: pola, filtr, „Bez priorytetu” (D450)', () => {
  const list = () =>
    items([
      task('p1-inbox', { priority: 'p1' }, 5),
      task('p1-today', { priority: 'p1', list: 'today' }, 1),
      task('p2-week', { priority: 'p2', list: 'week' }, 3),
      task('p3-someday', { priority: 'p3', list: 'someday', dueDate: '2026-11-20' }, 4),
      task('p3-inbox', { priority: 'p3' }, 2),
      task('p4-inbox', { priority: 'p4' }, 6),
      task('none-inbox', {}, 7),
      task('none-week', { list: 'week' }, 8),
      { ...task('done-p1', { priority: 'p1' }), state: 'done', list: 'done', doneAt: at(WED) }
    ])

  it('układ klasyczny: „ważne” w górę, „pilne” w lewo – P1 | P2 nad P3 | P4', () => {
    expect(MATRIX_ROWS).toEqual([
      ['p1', 'p2'],
      ['p3', 'p4']
    ])
  })

  it('wszystkie: każda sprawa niezrobiona w swoim polu, w kolejności list (termin pierwszy); bez priorytetu pod macierzą; zrobione poza nią', () => {
    const m = matrixOf(list())
    expect(ids(m.cells.p1)).toEqual(['p1-today', 'p1-inbox'])
    expect(ids(m.cells.p2)).toEqual(['p2-week'])
    expect(ids(m.cells.p3)).toEqual(['p3-someday', 'p3-inbox'])
    expect(ids(m.cells.p4)).toEqual(['p4-inbox'])
    expect(ids(m.none)).toEqual(['none-inbox', 'none-week'])
    expect(matrixOf(list(), 'all')).toEqual(m)
  })

  it('filtr listy zostawia w polach tylko sprawy tej listy (także w „Bez priorytetu”)', () => {
    expect(MATRIX_FILTERS).toEqual(['inbox', 'today', 'week', 'someday', 'all'])
    const m = matrixOf(list(), 'inbox')
    expect(ids(m.cells.p1)).toEqual(['p1-inbox'])
    expect(m.cells.p2).toEqual([])
    expect(ids(m.cells.p3)).toEqual(['p3-inbox'])
    expect(ids(m.none)).toEqual(['none-inbox'])
    expect(ids(matrixOf(list(), 'today').cells.p1)).toEqual(['p1-today'])
    expect(ids(matrixOf(list(), 'week').none)).toEqual(['none-week'])
    expect(ids(matrixOf(list(), 'someday').cells.p3)).toEqual(['p3-someday'])
  })

  it('liczby przy filtrach: niezrobione tej listy, „wszystkie” bez zrobionych', () => {
    expect(matrixCounts(list())).toEqual({ inbox: 4, today: 1, week: 2, someday: 1, all: 8 })
  })

  it('upuszczenie na pole: jedna zmiana priorytetu; to samo pole albo zrobiona – nic; „Bez priorytetu” czyści', () => {
    const x = items([task('a', { priority: 'p2' })])[0]!
    expect(dropPatch(x, 'p1')).toEqual({ priority: 'p1' })
    expect(dropPatch(x, 'none')).toEqual({ priority: null })
    expect(dropPatch(x, 'p2')).toBeNull()
    const none = items([task('b')])[0]!
    expect(dropPatch(none, 'none')).toBeNull()
    expect(dropPatch(none, 'p4')).toEqual({ priority: 'p4' })
    const done = items([{ ...task('c'), state: 'done', list: 'done', doneAt: at(WED) }])[0]!
    expect(dropPatch(done, 'p1')).toBeNull()
    expect(dropPatch(undefined, 'p1')).toBeNull()
    expect(dropPatch(none, 'p3')).toEqual({ priority: 'p3' })
  })

  it('zapis po upuszczeniu to `patchedRaw` z jednym polem – reszta rekordu bez zmian', () => {
    const x = items([task('a', { priority: 'p2', dueDate: THU })])[0]!
    const patch = dropPatch(x, 'p1')!
    const r = patchedRaw(x.record as unknown as Record<string, unknown>, patch, at(WED))
    expect(r).toMatchObject({ raw: { priority: 'p1', dueDate: THU, title: 'zadanie a' } })
  })
})

describe('plan poranny: linia spraw „Ważne i pilne” bez miejsca w planie (D450)', () => {
  const p1 = (id: string, p: Partial<NewTask> = {}) => task(id, { priority: 'p1', list: 'today', ...p })
  const line = (raws: Array<Record<string, unknown>>, blocks: Array<{ task?: string | null; requests?: string[] }> = [], today = WED) =>
    priorityLine(priorityWithoutPlace(items(raws, today), blocks.map((b) => ({ task: b.task ?? null, requests: b.requests ?? [] })), today).length)

  it('bez spraw P1 – nic; 1, 3 i 5 spraw – odmiana', () => {
    expect(line([])).toBeNull()
    expect(line([task('a', { priority: 'p2', list: 'today' })])).toBeNull()
    expect(line([p1('a')])).toBe('1 sprawa ważna i pilna bez miejsca w planie')
    expect(line([p1('a'), p1('b'), p1('c')])).toBe('3 sprawy ważne i pilne bez miejsca w planie')
    expect(line([1, 2, 3, 4, 5].map((n) => p1(`p${n}`)))).toBe('5 spraw ważnych i pilnych bez miejsca w planie')
  })

  it('odmiana: 2–4, 12–14, 22 i 25', () => {
    expect(priorityLine(2)).toBe('2 sprawy ważne i pilne bez miejsca w planie')
    expect(priorityLine(4)).toBe('4 sprawy ważne i pilne bez miejsca w planie')
    expect(priorityLine(12)).toBe('12 spraw ważnych i pilnych bez miejsca w planie')
    expect(priorityLine(22)).toBe('22 sprawy ważne i pilne bez miejsca w planie')
    expect(priorityLine(25)).toBe('25 spraw ważnych i pilnych bez miejsca w planie')
    expect(priorityLine(0)).toBeNull()
  })

  it('„Dziś” i „W tym tygodniu” liczą się; „Skrzynka”, „Kiedyś / Może” i zrobione – nie', () => {
    expect(line([p1('a', { list: 'week' })])).toBe('1 sprawa ważna i pilna bez miejsca w planie')
    expect(line([p1('a', { list: 'someday' }), p1('b', { list: 'inbox' }), { ...p1('c'), state: 'done', list: 'done', doneAt: at(WED) }])).toBeNull()
  })

  it('sprawa z blokiem dziś (blok zadania, blok próśb albo „zaplanowane” dziś) nie ma linii', () => {
    expect(line([p1('a')], [{ task: 'a' }])).toBeNull()
    const req = { ...newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '', priority: 'p1' }), list: 'today', listDay: WED }
    expect(line([req], [{ requests: ['r'] }])).toBeNull()
    expect(line([req])).toBe('1 sprawa ważna i pilna bez miejsca w planie')
    // „Zaplanowane” today (a block of the record in today's file) – a place too; on another day – not.
    const planned = (day: string) => ({ ...items([p1('s')])[0]!, scheduled: { day, block: 'b1', startMin: 600, known: true } })
    expect(priorityWithoutPlace([planned(WED)], [], WED)).toEqual([])
    expect(ids(priorityWithoutPlace([planned(THU)], [], WED))).toEqual(['s'])
  })

  it('D450 dosłownie: linia tylko, gdy żadna z nich nie ma dziś bloku – z dwóch jedna z blokiem: brak linii', () => {
    expect(line([p1('a'), p1('b')], [{ task: 'a' }])).toBeNull()
    expect(line([p1('a'), p1('b')], [{ task: 'b' }])).toBeNull()
    // Without any block the line counts them all (N is the number of such sprawy).
    expect(line([p1('a'), p1('b'), p1('c', { list: 'week' })])).toBe('3 sprawy ważne i pilne bez miejsca w planie')
    // A block of another sprawa (not on the lists counted) is no place for them.
    expect(line([p1('a'), p1('b')], [{ task: 'x' }])).toBe('2 sprawy ważne i pilne bez miejsca w planie')
    expect(line([p1('a'), p1('b', { list: 'someday' })], [{ task: 'b' }])).toBe('1 sprawa ważna i pilna bez miejsca w planie')
  })

  it('„Kiedyś / Może” z datą wykonania w przyszłości zostaje poza linią', () => {
    expect(line([p1('a', { list: 'someday', doDate: '2026-12-01' })])).toBeNull()
  })
})
