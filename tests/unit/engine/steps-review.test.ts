/**
 * Steps (SNT5) – the cases of the xhigh review: the raw items of a list a version does not read (over the limit after a
 * merge of two computers, without a title or an id, with fields it does not know) stay in the file at every write; the
 * limit counts only when adding; a move before a step the list does not have leaves it where it is; a block moved to a day
 * and back keeps only the ticks it has now; a task and its block never drift apart in silence (a refused mirrored op
 * refuses the change); the series' list changed by an op on the version in force (`changedFrom` with `stepsOp`); the leaf
 * maps of `recordEdit` belong to the kinds of records that have them.
 */
import { describe, expect, it } from 'vitest'
import { recordEdit } from '@shared/data/merge'
import { putBlock, setStepDone, stepsDoneIn } from '@shared/data/dayEdits'
import { moveBetweenDays } from '@shared/engine/planEdit'
import { changedFrom, newSeries } from '@shared/engine/series'
import { blockStepsEdits, taskStepsEdits, tickEdits } from '@shared/engine/steps'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type Template } from '@shared/model/plan'
import { newTask } from '@shared/model/requests'
import { seriesFrom, seriesJson, type SeriesBlock } from '@shared/model/series'
import { addStepOp, applyStepOp, STEPS_FULL, STEPS_MAX, stepsFrom, stepsJson, withDone, type Step } from '@shared/model/steps'
import { lm } from './dsl'

const DAY = '2026-11-18'
const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, title: `krok ${i}`, order: i }))
const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}

describe('surowe pozycje listy zostają (przegląd, T787, T789)', () => {
  it('31 kroków po scaleniu dwóch komputerów: wszystkie odczytane, zapis zachowuje każdą; limit tylko przy dodawaniu', () => {
    const raw = list(STEPS_MAX + 1)
    expect(stepsFrom(raw)).toHaveLength(STEPS_MAX + 1)
    const steps = stepsFrom(raw)
    const renamed = ok(applyStepOp(steps, { op: 'rename', id: 'k3', title: 'trzeci' })).steps
    const json = stepsJson(renamed, raw)!
    expect(json).toHaveLength(STEPS_MAX + 1)
    expect(json[3]).toEqual({ id: 'k3', title: 'trzeci', order: 3 })
    // Unchanged items are the file's own objects.
    expect(json[30]).toBe(raw[30])
    expect(applyStepOp(steps, addStepOp('jeszcze'))).toEqual({ error: STEPS_FULL })
  })

  it('pozycje nieodczytane (bez tytułu, bez id, nie obiekt) i nieznane pola – bez zmian przy każdym zapisie', () => {
    const raw: unknown[] = [{ id: 'a', title: 'pierwszy', order: 0, later: { x: 1 } }, { id: 'b', title: '', order: 1 }, { title: 'bez id', order: 2 }, 'tekst', { id: 'c', title: 'trzeci', order: 3 }]
    const steps = stepsFrom(raw)
    expect(steps.map((s) => s.id)).toEqual(['a', 'c'])
    const json = stepsJson(ok(applyStepOp(steps, { op: 'rename', id: 'c', title: 'Trzeci' })).steps, raw)!
    expect(json).toEqual([raw[0], raw[1], raw[2], raw[3], { id: 'c', title: 'Trzeci', order: 3 }])
    // A removal takes out only the step removed.
    expect(stepsJson(ok(applyStepOp(steps, { op: 'remove', id: 'a' })).steps, raw)).toEqual([raw[1], raw[2], raw[3], raw[4]])
  })

  it('zapis szablonu i serii nie gubi kroków ponad limit ani nieznanych pól', () => {
    const steps = [...list(STEPS_MAX + 1), { id: 'x', title: '', order: 99, later: 1 }]
    const t: Template = templateFrom({ id: 'zw', name: 'Zwykły', dayType: 'zwykly', versions: { '2026-01-01': { blocks: [{ id: 'w', categoryId: 'inne', startMin: 540, durationMin: 60, steps }] } } })!
    const json = templateJson(t, { id: 'zw', name: 'Zwykły', dayType: 'zwykly', versions: { '2026-01-01': { blocks: [{ id: 'w', categoryId: 'inne', startMin: 540, durationMin: 60, steps }] } } })
    const written = ((json.versions as Record<string, { blocks: Array<{ steps: unknown[] }> }>)['2026-01-01']!.blocks[0]!).steps
    expect(written).toEqual(steps)
    const block: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null, steps: stepsFrom(steps) }
    const s = newSeries('s1', block, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
    const raw = seriesJson(s)
    const rawWith = { ...raw, versions: { '2026-11-01': { ...(raw.versions as Record<string, Record<string, unknown>>)['2026-11-01']!, block: { ...((raw.versions as Record<string, Record<string, Record<string, unknown>>>)['2026-11-01']!.block), steps } } } }
    const again = seriesJson(seriesFrom(rawWith)!, rawWith)
    expect((again.versions as Record<string, { block: { steps: unknown[] } }>)['2026-11-01']!.block.steps).toEqual(steps)
  })
})

describe('przeniesienie przed krok spoza listy (przegląd, T790)', () => {
  it('`move` z `before`, którego lista nie ma – krok zostaje na miejscu (blok i zadanie)', () => {
    const steps = stepsFrom(list(4))
    expect(ok(applyStepOp(steps, { op: 'move', id: 'k1', before: 'nie-ma' })).steps).toEqual(steps)
    // The end (`before` null) still moves to the end.
    expect(ok(applyStepOp(steps, { op: 'move', id: 'k1', before: null })).steps.map((s) => s.id)).toEqual(['k0', 'k2', 'k3', 'k1'])
  })
})

describe('przeniesienie bloku na inny dzień i z powrotem (przegląd, T786)', () => {
  it('A→B→A: dzień docelowy ma tylko bieżące odhaczenia, źródłowy je traci', () => {
    const steps = stepsFrom(list(3))
    const b = planBlock({ id: 'b', categoryId: 'inne', startMin: lm('10:00'), durationMin: 60, steps: withDone(steps, new Set(['k0'])) })
    const A = '2026-11-18'
    const B = '2026-11-19'
    let dayA: Record<string, unknown> = setStepDone(putBlock({ schema: 1, date: A }, b), 'b', 'k0', true)
    const first = moveBetweenDays(dayA, null, b, [b], A, B)
    expect(stepsDoneIn(first.source, 'b')).toEqual([])
    expect(stepsDoneIn(first.target, 'b')).toEqual(['k0'])
    // On B the tick is taken back; the block goes back to A, whose file still had the old ticks of the block.
    dayA = setStepDone(first.source, 'b', 'k2', true)
    const onB = { ...b, steps: withDone(steps, new Set()) }
    const back = moveBetweenDays(setStepDone(first.target, 'b', 'k0', false), dayA, onB, [onB], B, A)
    expect(stepsDoneIn(back.target, 'b')).toEqual([])
    expect(dayFileFrom(back.target, A).stepsDone).toEqual({})
  })
})

describe('zadanie i blok nie rozjeżdżają się po cichu (przegląd, T792)', () => {
  const at = Date.parse('2026-11-18T08:00:00Z')
  it('lustrzana operacja odrzucona (pełna lista po drugiej stronie) – odmowa całej zmiany', () => {
    const task = { ...newTask('t1', at, DAY, { title: 'Wdrożenie' })!, day: DAY, block: 'tb', state: 'planned', steps: list(5) }
    const block = planBlock({ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 60, task: 't1', steps: stepsFrom(list(STEPS_MAX)) })
    const day = putBlock({ schema: 1, date: DAY }, block)
    expect(taskStepsEdits({ record: task, op: addStepOp('nowy'), date: DAY, day, today: DAY })).toEqual({ error: STEPS_FULL })
    const fullTask = { ...task, steps: list(STEPS_MAX) }
    const small = planBlock({ ...block, steps: stepsFrom(list(5)) })
    expect(blockStepsEdits({ date: DAY, day: putBlock({ schema: 1, date: DAY }, small), block: small, op: addStepOp('nowy'), task: fullTask })).toEqual({ error: STEPS_FULL })
    // A tick of a step the other side does not have is no refusal: the side that has it.
    expect(ok(tickEdits({ date: DAY, day, block, stepId: 'k20', done: true, task })).task).toBeNull()
  })
})

describe('mapy liści per rodzaj rekordu (przegląd, T788)', () => {
  it('`stepsDone` liść po liściu w pliku dnia i w sprawie; w innym rekordzie pole o tej nazwie – jak każde', () => {
    const after = { stepsDone: { b: { s: true } } }
    expect(recordEdit('days/2026/2026-11-18.json', {}, after)!.edits.map((e) => e.path.join('.'))).toEqual(['stepsDone.b.s'])
    expect(recordEdit('requests/t1.json', {}, { stepsDone: { s: true } })!.edits.map((e) => e.path.join('.'))).toEqual(['stepsDone.s'])
    expect(recordEdit('templates/zw.json', {}, after)!.edits.map((e) => e.path.join('.'))).toEqual(['stepsDone'])
  })
})

describe('zmiana listy serii operacją na wersji (przegląd, T790)', () => {
  it('`stepsOp` w łatce: wersja od dnia i późniejsze dostają tę samą operację na swojej liście', () => {
    const block: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null, steps: stepsFrom(list(2)) }
    let s = newSeries('s1', block, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
    s = changedFrom(s, '2026-11-25', { block: { startMin: lm('18:00') } })
    const a = changedFrom(s, '2026-11-18', { stepsOp: { op: 'add', id: 'A', title: 'A', after: null } })
    const b = changedFrom(a, '2026-11-18', { stepsOp: { op: 'add', id: 'B', title: 'B', after: null } })
    expect(b.versions.map((v) => [v.from, v.block.startMin, v.block.steps.map((x: Step) => x.id)])).toEqual([
      ['2026-11-01', lm('17:00'), ['k0', 'k1']],
      ['2026-11-18', lm('17:00'), ['k0', 'k1', 'A', 'B']],
      ['2026-11-25', lm('18:00'), ['k0', 'k1', 'A', 'B']]
    ])
  })
})
