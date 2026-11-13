/**
 * U1 (D460): a step's time and the steps of a routine copied into a block – every example of the spec („## 8. Podzadania”,
 * „Czas kroku” and „Kroki z rutyny”) a test: the time read and written in the list (`min`, 1–240, optional), a version before
 * it keeping the field, the op of the panel, the sum „kroki: X min z Y” with its warning, the copy of the routine's usual
 * version (replaced while it is the untouched copy of the routine chosen before, else at the end; at most `STEPS_MAX`).
 */
import { describe, expect, it } from 'vitest'
import { changedFrom, newSeries, sameOccurrence } from '@shared/engine/series'
import { blockJson, putBlock } from '@shared/data/dayEdits'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { requestFrom } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { seriesBlockOf } from '@shared/model/series'
import { applyStepOp, routineStepsCopy, sameStepList, STEP_MIN_BAD, STEPS_MAX, stepOpFrom, stepsFrom, stepsJson, stepsTime, type Step } from '@shared/model/steps'

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

describe('kroki z rutyny (D460)', () => {
  it('przykład ze specyfikacji: rutyna „Poranek” w pustym bloku – trzy kroki z nazwą i czasem, nowe id', () => {
    const { steps, cut } = routineStepsCopy([], null, poranek)
    expect(view(steps)).toEqual([
      ['Prysznic', 10, false],
      ['Śniadanie', 20, false],
      ['Leki', 5, false]
    ])
    expect(cut).toBe(0)
    expect(steps.map((s) => s.order)).toEqual([0, 1, 2])
    expect(new Set(steps.map((s) => s.id)).size).toBe(3)
    expect(steps.some((s) => ['a', 'b', 'c'].includes(s.id))).toBe(false)
  })

  it('zmiana rutyny przy nietkniętej kopii poprzedniej – kopia wymieniona; krok bez nazwy – „krok N”', () => {
    const first = routineStepsCopy([], null, poranek).steps
    expect(view(routineStepsCopy(first, poranek, wieczor).steps)).toEqual([
      ['Kolacja', 30, false],
      ['krok 2', 15, false]
    ])
  })

  it('kroki dopisane albo zmienione po kopii (albo własne) – kroki rutyny na końcu, nic nie znika; odhaczony krok kopii też ją „dotyka”', () => {
    const first = routineStepsCopy([], null, poranek).steps
    const own = ok(applyStepOp(first, { op: 'add', id: 'x', title: 'Podlać kwiaty' })).steps
    expect(view(routineStepsCopy(own, poranek, wieczor).steps)).toEqual([
      ['Prysznic', 10, false],
      ['Śniadanie', 20, false],
      ['Leki', 5, false],
      ['Podlać kwiaty', null, false],
      ['Kolacja', 30, false],
      ['krok 2', 15, false]
    ])
    const retimed = ok(applyStepOp(first, { op: 'min', id: first[0]!.id, min: 12 })).steps
    expect(routineStepsCopy(retimed, poranek, wieczor).steps).toHaveLength(5)
    const ticked = first.map((s, k) => (k === 0 ? { ...s, done: true } : s))
    expect(routineStepsCopy(ticked, poranek, wieczor).steps).toHaveLength(5)
    // No routine before, steps of your own: appended.
    const mine = stepsFrom([{ id: 'm', title: 'Mój krok', order: 7 }])
    const appended = routineStepsCopy(mine, null, wieczor).steps
    expect(view(appended)).toEqual([
      ['Mój krok', null, false],
      ['Kolacja', 30, false],
      ['krok 2', 15, false]
    ])
    expect(appended.map((s) => s.order)).toEqual([7, 8, 9])
  })

  it('rutyna z 40 krokami mieści się cała; ponad `STEPS_MAX` w bloku – kroki, które się nie mieszczą, pominięte (`cut`)', () => {
    expect(STEPS_MAX).toBe(40)
    const big = routineFrom({ id: 'r3', name: 'Długa', normal: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, name: `k${i}`, min: 1 })) })!
    expect(routineStepsCopy([], null, big)).toMatchObject({ cut: 0 })
    expect(routineStepsCopy([], null, big).steps).toHaveLength(40)
    const mine = stepsFrom(Array.from({ length: 35 }, (_, i) => ({ id: `m${i}`, title: `m${i}`, order: i })))
    const r = routineStepsCopy(mine, null, big)
    expect(r.steps).toHaveLength(40)
    expect(r.cut).toBe(35)
  })
})
