/**
 * U1 (D460): a step's time – every example of the spec („## 8. Podzadania”, „Czas kroku”) a test: the time read and written in
 * the list (`min`, 1–240, optional), a version before it keeping the field, the op of the panel, the sum „kroki: X min z Y” with
 * its warning; a routine's steps as a block's list (D480: never copied – `routineList`, D473).
 */
import { describe, expect, it } from 'vitest'
import { changedFrom, newSeries, sameOccurrence } from '@shared/engine/series'
import { blockJson, putBlock } from '@shared/data/dayEdits'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { routineList } from '@shared/model/routineSteps'
import { seriesBlockOf } from '@shared/model/series'
import { applyStepOp, sameStepList, STEP_MIN_BAD, STEPS_MAX, stepOpFrom, stepsFrom, stepsJson, stepsTime, type Step } from '@shared/model/steps'

const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}
const DAY = '2026-11-18'

/** The spec's routine „Poranek”: Prysznic 10, Śniadanie 20, Leki 5. */
const poranek: Routine = { id: 'r1', name: 'Poranek', archived: false, worse: [{ id: 'w1', name: 'Leki', min: 5 }], normal: [
  { id: 'a', name: 'Prysznic', min: 10 },
  { id: 'b', name: 'Śniadanie', min: 20 },
  { id: 'c', name: 'Leki', min: 5 }
] }
const wieczor: Routine = { id: 'r2', name: 'Wieczór', archived: false, worse: [], normal: [
  { id: 'd', name: 'Kolacja', min: 30 },
  { id: 'e', name: '', min: 15 }
] }
const view = (steps: readonly Step[]) => steps.map((s) => [s.title, s.min ?? null, s.done])

describe('czas kroku w pliku (D460)', () => {
  it('odczyt: `min` 1–240 w pełnych minutach; inny – bez czasu (pole zostaje w pliku)', () => {
    const steps = stepsFrom([
      { id: 'a', title: 'Prysznic', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie', order: 1, min: 0 },
      { id: 'c', title: 'Leki', order: 2, min: 1.5 },
      { id: 'd', title: 'Spacer', order: 3, min: 241 },
      { id: 'e', title: 'Kawa', order: 4 }
    ])
    expect(steps.map((s) => s.min ?? null)).toEqual([10, null, null, null, null])
    // No time: the field is absent (a step written without one reads as before).
    expect('min' in steps[4]!).toBe(false)
  })

  it('zapis: czas w pozycji kroku; zmiana samego czasu to zmiana kroku, wyczyszczenie zdejmuje pole; reszta pozycji jak w pliku', () => {
    const file = [
      { id: 'a', title: 'Prysznic', order: 0, later: 'x' },
      { id: 'b', title: 'Śniadanie', order: 1 }
    ]
    const read = stepsFrom(file)
    // Unchanged – the file's list as it is.
    expect(stepsJson(read, file)).toEqual(file)
    const timed = ok(applyStepOp(read, { op: 'min', id: 'a', min: 10 })).steps
    const json = stepsJson(timed, file)!
    expect(json).toEqual([{ id: 'a', title: 'Prysznic', order: 0, later: 'x', min: 10 }, file[1]])
    // The second item untouched: the very object of the file.
    expect(json[1]).toBe(file[1])
    const cleared = ok(applyStepOp(stepsFrom(json), { op: 'min', id: 'a', min: null })).steps
    expect(stepsJson(cleared, json)).toEqual([{ id: 'a', title: 'Prysznic', order: 0, later: 'x' }, file[1]])
    // A new list: the time only where there is one.
    expect(stepsJson(timed)).toEqual([
      { id: 'a', title: 'Prysznic', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie', order: 1 }
    ])
  })

  it('wersja sprzed czasu kroku zmienia tytuł albo kolejność – `min` zostaje w pozycji (pola nieznane zostają); czas nieczytelny tej wersji też', () => {
    const file = [
      { id: 'a', title: 'Prysznic', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie', order: 1, min: 'dużo' }
    ]
    const read = stepsFrom(file)
    const renamed = ok(applyStepOp(read, { op: 'rename', id: 'a', title: 'Kąpiel' })).steps
    const b = ok(applyStepOp(renamed, { op: 'rename', id: 'b', title: 'Śniadanie i kawa' })).steps
    expect(stepsJson(b, file)).toEqual([
      { id: 'a', title: 'Kąpiel', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie i kawa', order: 1, min: 'dużo' }
    ])
  })

  it('operacja panelu: czas ustawiony, wyczyszczony; poza zakresem – odmowa z komunikatem; krok, którego nie ma – lista bez zmian', () => {
    const steps = stepsFrom([{ id: 'a', title: 'Prysznic', order: 0 }])
    expect(ok(applyStepOp(steps, { op: 'min', id: 'a', min: 15 })).steps[0]!.min).toBe(15)
    expect(applyStepOp(steps, { op: 'min', id: 'a', min: 0 })).toEqual({ error: STEP_MIN_BAD })
    expect(applyStepOp(steps, { op: 'min', id: 'a', min: 241 })).toEqual({ error: STEP_MIN_BAD })
    expect(applyStepOp(steps, { op: 'min', id: 'a', min: 2.5 })).toEqual({ error: STEP_MIN_BAD })
    expect(ok(applyStepOp(steps, { op: 'min', id: 'nie ma', min: 15 })).steps).toEqual(steps)
    expect(stepOpFrom({ op: 'min', id: 'a', min: 15 })).toEqual({ op: 'min', id: 'a', min: 15 })
    expect(stepOpFrom({ op: 'min', id: 'a', min: null })).toEqual({ op: 'min', id: 'a', min: null })
    expect(stepOpFrom({ op: 'min', id: 'a', min: '15' })).toBeNull()
  })

  it('wystąpienie serii ze zmienionym w dniu czasem kroku jest zmienione („Tylko to”), ta sama lista z czasem – nie', () => {
    const a = stepsFrom([{ id: 'a', title: 'Prysznic', order: 0, min: 10 }])
    const b = stepsFrom([{ id: 'a', title: 'Prysznic', order: 0, min: 15 }])
    expect(sameStepList(a, a)).toBe(true)
    expect(sameStepList(a, b)).toBe(false)
    expect(sameStepList(a, stepsFrom([{ id: 'a', title: 'Prysznic', order: 0 }]))).toBe(false)
  })

  it('czas kroku w dniu, szablonie, serii i zadaniu: zapis i odczyt przez ich pliki', () => {
    const steps = ok(applyStepOp(stepsFrom([{ id: 'a', title: 'Prysznic', order: 0 }]), { op: 'min', id: 'a', min: 10 })).steps
    const day = putBlock({ schema: 1, date: DAY }, planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, steps }))
    expect(dayFileFrom(day, DAY).blocks[0]!.steps[0]!.min).toBe(10)
    expect(blockJson(planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, steps })).steps).toEqual([{ id: 'a', title: 'Prysznic', order: 0, min: 10 }])
    const s = newSeries('s1', seriesBlockOf(planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, steps })), DAY, { kind: 'daily' }, 'held', { until: null, count: null })
    const changed = changedFrom(s, DAY, { stepsOp: { op: 'min', id: 'a', min: 20 } })
    expect(changed.versions[0]!.block.steps[0]!.min).toBe(20)
    expect(sameOccurrence(planBlock({ id: 'x', categoryId: 'inne', startMin: 600, durationMin: 60, steps }), planBlock({ id: 'x', categoryId: 'inne', startMin: 600, durationMin: 60, steps: changed.versions[0]!.block.steps }))).toBe(false)
    expect(requestFrom({ id: 't1', kind: 'task', title: 'Zadanie', steps: [{ id: 'a', title: 'Prysznic', order: 0, min: 10 }] })!.steps[0]!.min).toBe(10)
  })
})

describe('suma czasów kroków (D460)', () => {
  it('„kroki: 45 min z 1 h” – suma kroków z czasem; ponad długość bloku – o ile; bez czasów – nic', () => {
    const steps = stepsFrom([
      { id: 'a', title: 'Prysznic', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie', order: 1, min: 20 },
      { id: 'c', title: 'Kawa', order: 2 },
      { id: 'd', title: 'Leki', order: 3, min: 15 }
    ])
    expect(stepsTime(steps, 60)).toEqual({ minutes: 45, over: 0 })
    expect(stepsTime(steps, 30)).toEqual({ minutes: 45, over: 15 })
    // A task: no length – the sum only.
    expect(stepsTime(steps)).toEqual({ minutes: 45, over: 0 })
    expect(stepsTime(stepsFrom([{ id: 'c', title: 'Kawa', order: 0 }]), 60)).toBeNull()
    expect(stepsTime([], 60)).toBeNull()
  })
})

describe('kroki z rutyny (D480: bez kopii – lista rutyny, D473)', () => {
  it('rutyna „Poranek” – lista rutyny: trzy kroki z nazwą i czasem, id kroków rutyny; krok bez nazwy – „krok N”', () => {
    expect(view(routineList(poranek, 'normal'))).toEqual([
      ['Prysznic', 10, false],
      ['Śniadanie', 20, false],
      ['Leki', 5, false]
    ])
    expect(routineList(poranek, 'normal').map((s) => [s.id, s.order])).toEqual([['a', 0], ['b', 1], ['c', 2]])
    expect(view(routineList(wieczor, 'normal'))).toEqual([
      ['Kolacja', 30, false],
      ['krok 2', 15, false]
    ])
  })

  it('rutyna z 40 krokami (`STEPS_MAX`) to cała lista bloku', () => {
    expect(STEPS_MAX).toBe(40)
    const big = routineFrom({ id: 'r3', name: 'Długa', normal: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, name: `k${i}`, min: 1 })) })!
    expect(routineList(big, 'normal')).toHaveLength(40)
  })
})
