/**
 * „Sprawy” (OPS2: D383, D384, D385, D402) – the pure rules: the lists (the files of requests from before „Sprawy”, the
 * 04:00 of „Dziś”), „zaplanowane” while the block is in its day, the edits of a record (unknown fields and `state` for
 * older versions), a task put on the axis, the morning's step, „Zadanie zrobione?” and the ritual's lines.
 */
import { describe, expect, it } from 'vitest'
import {
  caseItems,
  casePlan,
  type CasePlan,
  casesRitual,
  doneRecently,
  listedRaw,
  listOf,
  morningCases,
  morningPlan,
  patchedRaw,
  rolledFrom,
  scheduledOf,
  scheduledRaw,
  taskAnswerRaw,
  taskQuestions,
  todayHeader,
  todayMinutes,
  unscheduledRaw
} from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom, type RequestRecord } from '@shared/model/requests'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { activityOf } from '@shared/engine/activity'
import { engineView } from '@shared/engineView'
import { blockName } from '@shared/blockName'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { block, Scenario } from './dsl'

/** A planning that is no refusal (the cases here never are). */
const planOk = (i: Parameters<typeof casePlan>[0]): CasePlan | null => casePlan(i) as CasePlan | null

const TODAY = '2026-11-12'
const TOMORROW = '2026-11-13'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const rec = (raw: Record<string, unknown>): RequestRecord => requestFrom(raw)!
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
/** A request as 1.12 wrote it (no kind, no list). */
const old = (state: string, p: Record<string, unknown> = {}) => ({ schema: 1, id: `r-${state}`, person: 'mama', estimateMin: 20, note: 'zakupy', createdAt: 1, state, day: null, block: null, ...p })

describe('model sprawy (D383, D384)', () => {
  it('plik prośby sprzed „Spraw” czyta się jako prośba bez utraty pól', () => {
    const r = rec(old('queued'))
    expect(r).toMatchObject({ id: 'r-queued', kind: 'request', person: 'mama', estimateMin: 20, note: 'zakupy', state: 'queued', list: null, title: '' })
  })

  it('nowe zadanie: tytuł wymagany, szacunek 30 min, kategoria „Inne”, w Skrzynce', () => {
    expect(newTask('t1', at(TODAY), TODAY, { title: '   ' })).toBeNull()
    const raw = newTask('t1', at(TODAY), TODAY, { title: '  Wymienić   filtr ' })!
    expect(rec(raw)).toMatchObject({ kind: 'task', title: 'Wymienić filtr', estimateMin: 30, categoryId: 'inne', list: 'inbox', state: 'queued', person: null })
    expect(rec(newTask('t2', at(TODAY), TODAY, { title: 'x', list: 'today' })!)).toMatchObject({ list: 'today', listDay: TODAY })
  })
})

describe('listy (D383, D402)', () => {
  it('migracja: w kolejce → Skrzynka, w planie → Dziś (dzisiejszy blok) albo W tym tygodniu, zrobione i porzucone → Zrobione', () => {
    expect(listOf(rec(old('queued')), TODAY)).toBe('inbox')
    expect(listOf(rec(old('planned', { day: TODAY, block: 'b1' })), TODAY)).toBe('today')
    expect(listOf(rec(old('planned', { day: '2026-11-10', block: 'b1' })), TODAY)).toBe('week')
    expect(listOf(rec(old('planned', { day: TOMORROW, block: 'b1' })), TODAY)).toBe('week')
    expect(listOf(rec(old('done')), TODAY)).toBe('done')
    expect(listOf(rec(old('dropped')), TODAY)).toBe('done')
  })

  it('niezrobione z „Dziś” o 04:00 są w „W tym tygodniu” – liczone z daty, bez zapisu', () => {
    const r = rec(newTask('t', at(TODAY), TODAY, { title: 'x', list: 'today' })!)
    expect(listOf(r, TODAY)).toBe('today')
    expect(rolledFrom(r, TODAY)).toBeNull()
    expect(listOf(r, TOMORROW)).toBe('week')
    expect(rolledFrom(r, TOMORROW)).toBe(TODAY)
    // Done – never back.
    const done = rec(listedRaw(newTask('t', at(TODAY), TODAY, { title: 'x', list: 'today' })!, 'done', at(TODAY, 15)))
    expect([listOf(done, TOMORROW), rolledFrom(done, TOMORROW)]).toEqual(['done', null])
  })

  it('suma szacunków „Dziś” i zrobione z ostatnich 7 dni', () => {
    const list = [
      newTask('a', at(TODAY), TODAY, { title: 'a', list: 'today', estimateMin: 120 })!,
      newTask('b', at(TODAY), TODAY, { title: 'b', list: 'today' })!,
      { ...newRequest('c', at(TODAY), { person: null, estimateMin: 60, note: '' }), list: 'today', listDay: TODAY },
      newTask('d', at(TODAY), TODAY, { title: 'd', list: 'week', estimateMin: 45 })!
    ].map(rec)
    const items = caseItems(list, TODAY, () => null)
    expect(todayMinutes(items)).toBe(210)
    expect(todayHeader(todayMinutes(items))).toBe('Dziś · 3 h 30 min')
    expect(todayHeader(0)).toBe('Dziś')
    const doneOn = (d: string) => rec(listedRaw(newTask('x', at(d), d, { title: 'x' })!, 'done', at(d, 13)))
    expect(doneRecently(doneOn('2026-11-06'), TODAY)).toBe(true)
    expect(doneRecently(doneOn('2026-11-05'), TODAY)).toBe(false)
    // Done before „Sprawy”: the day of its block.
    expect(doneRecently(rec(old('done', { day: '2026-10-01' })), TODAY)).toBe(false)
  })
})

describe('zmiany rekordu (T750)', () => {
  it('przeniesienie na listę: „Dziś” z dniem, „Zrobione” z chwilą, nieznane pola zostają, `state` w kroku dla starszej wersji', () => {
    const raw = { ...newTask('t', at(TODAY), TODAY, { title: 'x' })!, future: { a: 1 } }
    const today = listedRaw(raw, 'today', at(TODAY))
    expect(today).toMatchObject({ list: 'today', listDay: TODAY, state: 'queued', future: { a: 1 } })
    const done = listedRaw(today, 'done', at(TODAY, 15))
    expect(done).toMatchObject({ list: 'done', doneAt: at(TODAY, 15), state: 'done', future: { a: 1 } })
    // Out of „Zrobione”: again, without its block.
    const planned = scheduledRaw(raw, TODAY, 'b1', at(TODAY))
    expect(listedRaw(listedRaw(planned, 'done', at(TODAY)), 'week', at(TODAY))).toMatchObject({ list: 'week', day: null, block: null, state: 'queued', doneAt: null })
    // The same list again: no edit.
    expect(listedRaw(today, 'today', at(TODAY, 18))).toBe(today)
  })

  it('plik sprzed „Spraw” dostaje listę, jaką czyta dziś; porzucona zostaje porzucona', () => {
    expect(listedRaw(old('queued'), 'someday', at(TODAY))).toMatchObject({ kind: 'request', list: 'someday', state: 'queued', person: 'mama', note: 'zakupy' })
    expect(unscheduledRaw(old('planned', { day: TODAY, block: 'b1' }), at(TODAY))).toMatchObject({ list: 'today', listDay: TODAY, day: null, block: null, state: 'queued' })
    expect(listedRaw(old('dropped'), 'done', at(TODAY))).toMatchObject({ list: 'done', state: 'dropped', doneAt: null })
  })

  it('zmiany starszej wersji: „Zrobiona” i „Do kolejki” na rekordzie nowej wersji działają dalej', () => {
    const raw = listedRaw(newTask('t', at(TODAY), TODAY, { title: 'x' })!, 'week', at(TODAY))
    // „Zrobiona” of 1.12: the field state only.
    expect(listOf(rec({ ...raw, state: 'done' }), TODAY)).toBe('done')
    // „Do kolejki” of 1.12 on a done one: state, day, block.
    const done = listedRaw(raw, 'done', at(TODAY))
    expect(listOf(rec({ ...done, state: 'queued', day: null, block: null }), TODAY)).toBe('inbox')
  })

  it('pola: zadanie bez tytułu – odmowa; szacunek w zakresie', () => {
    const raw = newTask('t', at(TODAY), TODAY, { title: 'x' })!
    expect(patchedRaw(raw, { title: ' ' }, at(TODAY))).toEqual({ error: 'Zadanie potrzebuje tytułu.' })
    expect(patchedRaw(raw, { estimateMin: 0 }, at(TODAY))).toMatchObject({ error: expect.stringContaining('Szacunek') })
    expect(patchedRaw(raw, { estimateMin: 45, note: 'n', categoryId: 'nauka' }, at(TODAY))).toMatchObject({ raw: { estimateMin: 45, note: 'n', categoryId: 'nauka', title: 'x' } })
    expect(patchedRaw(old('queued'), { kind: 'task' }, at(TODAY))).toEqual({ error: 'Zadanie potrzebuje tytułu.' })
  })
})

describe('zaplanowane (D384, D402)', () => {
  const file = (blocks: unknown[], more: Record<string, unknown> = {}) => dayFileFrom({ schema: 1, date: TODAY, blocks, ...more }, TODAY)
  const b1 = { id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user' }

  it('blok w dniu – zaplanowane z godziną; usunięty albo odwołany – nie; przeniesiony – w nowym dniu', () => {
    const r = { day: TODAY, block: 'b1' }
    expect(scheduledOf(r, () => file([b1]))).toEqual({ day: TODAY, block: 'b1', startMin: 600, known: true })
    expect(scheduledOf(r, () => file([]))).toBeNull()
    expect(scheduledOf(r, () => null)).toBeNull()
    expect(scheduledOf(r, () => file([b1], { cancelled: { b1: true } }))).toBeNull()
    const moved = (d: string) => (d === TODAY ? file([b1], { movedTo: { b1: TOMORROW } }) : dayFileFrom({ schema: 1, date: TOMORROW, blocks: [{ ...b1, startMin: 540 }] }, TOMORROW))
    expect(scheduledOf(r, moved)).toEqual({ day: TOMORROW, block: 'b1', startMin: 540, known: true })
    expect(scheduledOf(r, () => undefined)).toEqual({ day: TODAY, block: 'b1', startMin: null, known: false })
  })

  it('przeciągnięcie zadania na 10:00 – blok elastyczny 30 min „Inne” z kosztem kategorii, zadanie zaplanowane', () => {
    const task = newTask('t1', at(TODAY), TODAY, { title: 'Zadzwonić' })!
    const p = planOk({ record: task, date: TODAY, startMin: 600, files: { [TODAY]: null }, rules, at: at(TODAY, 9), begun: () => false })!
    expect(p.block).toMatchObject({ categoryId: 'inne', startMin: 600, durationMin: 30, fixed: false, costs: null, task: 't1', origin: 'user' })
    expect(dayFileFrom(p.days[TODAY], TODAY).blocks.map((b) => b.id)).toEqual([p.block.id])
    expect(rec(p.record)).toMatchObject({ day: TODAY, block: p.block.id, state: 'planned', list: 'inbox' })
  })

  it('ponowne przeciągnięcie: stary niezaczęty blok wychodzi z dnia, zaczęty zostaje; prośba – blok próśb', () => {
    const task = newTask('t1', at(TODAY), TODAY, { title: 'x', categoryId: 'nauka', estimateMin: 45 })!
    const first = planOk({ record: task, date: TODAY, startMin: 600, files: { [TODAY]: null }, rules, at: at(TODAY, 9), begun: () => false })!
    const again = planOk({ record: first.record, date: TODAY, startMin: 720, files: first.days, rules, at: at(TODAY, 9), begun: () => false })!
    expect(dayFileFrom(again.days[TODAY], TODAY).blocks).toEqual([expect.objectContaining({ id: again.block.id, startMin: 720, categoryId: 'nauka', durationMin: 45 })])
    const kept = planOk({ record: first.record, date: TOMORROW, startMin: 600, files: { ...first.days, [TOMORROW]: null }, rules, at: at(TODAY, 9), begun: () => true })!
    expect(kept.days[TODAY]).toBeUndefined()
    // The list stays where it was (D384: „zostaje na liście”).
    expect(rec(kept.record)).toMatchObject({ day: TOMORROW, block: kept.block.id, list: 'inbox' })
    const req = planOk({ record: newRequest('r1', 1, { person: 'mama', estimateMin: null, note: '' }), date: TODAY, startMin: 600, files: { [TODAY]: null }, rules, at: at(TODAY), begun: () => false })!
    expect(req.block).toMatchObject({ categoryId: 'prosby', requests: ['r1'], durationMin: 15, task: null })
  })
})

describe('plan poranny (D384)', () => {
  it('krok próśb: prośby niezaplanowane i zadania z „Dziś”; wybrane – prośby jednym blokiem, każde zadanie swoim', () => {
    const list = [
      newRequest('r1', 1, { person: 'mama', estimateMin: 20, note: '' }),
      { ...newRequest('r2', 2, { person: null, estimateMin: null, note: '' }), list: 'someday' },
      newTask('t1', 3, TODAY, { title: 'dziś', list: 'today' })!,
      newTask('t2', 4, TODAY, { title: 'skrzynka' })!
    ]
    const picks = morningCases(caseItems(list.map(rec), TODAY, () => null))
    expect([picks.requests.map((x) => x.record.id), picks.tasks.map((x) => x.record.id)]).toEqual([['r1'], ['t1']])
    const out = morningPlan({ date: TODAY, dayFile: null, requests: [list[0]!], tasks: [list[2]!], startMin: 600, rules, at: at(TODAY, 8) })
    expect(out.blocks.map((b) => [b.categoryId, b.startMin, b.durationMin, b.requests, b.task])).toEqual([
      ['prosby', 600, 20, ['r1'], null],
      ['inne', 620, 30, [], 't1']
    ])
    expect(out.records.map((x) => [x.id, x.raw.block, x.raw.state])).toEqual([
      ['r1', out.blocks[0]!.id, 'planned'],
      ['t1', out.blocks[1]!.id, 'planned']
    ])
    // A second click: the records are planned already – nothing more.
    const again = morningPlan({ date: TODAY, dayFile: out.days[TODAY]!, requests: [out.records[0]!.raw], tasks: [out.records[1]!.raw], startMin: 700, rules, at: at(TODAY, 8) })
    expect(again.blocks).toEqual([])
  })
})

describe('„Zadanie zrobione?” i rytuał (D384, D383, D402)', () => {
  function click(s: Scenario, time: string, act: TimerAction) {
    const t = s.at(time)
    const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
    if (r.ok) s.write(r.events, t)
  }
  const DAY = '2026-10-28'
  const task = (p: Record<string, unknown> = {}) => rec({ ...newTask('t1', 1, DAY, { title: 'Zadzwonić' })!, day: DAY, block: 'tb', state: 'planned', ...p })
  const day = () => new Scenario({ date: DAY, plan: [planBlock({ ...block({ id: 'tb', cat: 'inne', at: '10:00', min: 30, origin: 'user' }), task: 't1' })] }).observe('09:00', null)

  it('po końcu bloku jedno pytanie z id `task:<dzień>:<blok>`; zrobione albo „Wraca na listę” – nie ma go', () => {
    const s = day()
    click(s, '10:00', { a: 'start', block: 'tb' })
    const q = (time: string, r = task()) => taskQuestions(s.contextAt(s.at(time)), s.stateAt(s.at(time)), [r])
    expect(q('10:20')).toEqual([])
    click(s, '10:30', { a: 'next' })
    expect(q('10:31')).toEqual([expect.objectContaining({ id: `task:${DAY}:tb`, task: 't1', block: 'tb', title: 'Zadzwonić' })])
    expect(q('10:31', rec(taskAnswerRaw({ ...task() }, 'done', s.at('10:31'))))).toEqual([])
    expect(q('10:31', rec(taskAnswerRaw({ ...task() }, 'back', s.at('10:31'))))).toEqual([])
    // Its block taken out of the plan: not planned any more, nothing to ask.
    expect(taskQuestions({ plan: [] }, s.stateAt(s.at('10:31')), [task()])).toEqual([])
    // Its block moved to this day from another (the record keeps that day): asked by the block.
    expect(q('10:31', task({ day: '2026-10-27' }))).toEqual([expect.objectContaining({ id: `task:${DAY}:tb` })])
  })

  it('pasek: cicha linia „Zadanie zrobione? · Tak · Wraca na listę” przez 3 h po końcu bloku, nazwa bloku = tytuł zadania', () => {
    const s = day()
    click(s, '10:00', { a: 'start', block: 'tb' })
    click(s, '10:30', { a: 'next' })
    const names = { rd: rdFrom(undefined), settings: s.settings, routines: [], requests: [task()] }
    const bar = (time: string) => {
      const t = s.at(time)
      const ctx = s.contextAt(t)
      const state = s.stateAt(t)
      return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => blockName(b, names), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, cases: [task()] })
    }
    const line = bar('10:31').lines.find((l) => l.id === `task:${DAY}:tb`)
    expect(line).toEqual({ id: `task:${DAY}:tb`, text: 'Zadanie zrobione? „Zadzwonić”', actions: [{ id: 'done', label: 'Tak' }, { id: 'back', label: 'Wraca na listę' }], dot: false })
    expect(bar('13:29').lines.some((l) => l.id.startsWith('task:'))).toBe(true)
    expect(bar('13:31').lines.some((l) => l.id.startsWith('task:'))).toBe(false)
    expect(blockName(s.opts.plan[0]!, names)).toBe('Zadzwonić')
  })

  it('rytuał: wracające z „Dziś”, pytania bez odpowiedzi, w niedzielę „Kiedyś / Może”', () => {
    // „a” on „Dziś” of the day; „t1” planned there, its question waiting (named once – as the question); „w” – another day's.
    const records = [rec(newTask('a', 1, DAY, { title: 'a', list: 'today' })!), task({ list: 'today', listDay: DAY }), rec(newTask('w', 1, '2026-10-27', { title: 'w', list: 'today' })!), rec(newTask('s', 2, DAY, { title: 's', list: 'someday' })!)]
    const questions = [{ id: `task:${DAY}:tb`, task: 't1', block: 'tb', title: 'Zadzwonić', endedAt: 0 }]
    expect(casesRitual(DAY, DAY, records, questions)).toMatchObject({ back: [expect.objectContaining({ id: 'a' })], questions: [expect.objectContaining({ task: 't1' })], someday: null })
    expect(casesRitual(DAY, DAY, records, questions).back).toHaveLength(1)
    const sunday = '2026-11-01'
    expect(casesRitual(sunday, sunday, records, []).someday).toBe(1)
  })
})
