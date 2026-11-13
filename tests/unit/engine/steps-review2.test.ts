/**
 * Steps (SNT5) – the cases of the second xhigh review: a step removed or changed takes every item of its id out of the file
 * (a duplicate never comes back as it); items without a number `order` get theirs at a write (a stable order after
 * removals); a new version of a series or a template keeps the raw items of the version it copies; the refusal of a
 * mirrored op names the full list (the task's or the block's); a block moved keeps the ticks its source day has, whatever
 * the block given says; the ticks of a block set to none take its key out.
 */
import { describe, expect, it } from 'vitest'
import { putBlock, setStepDone, setStepsDone, stepsDoneIn } from '@shared/data/dayEdits'
import { moveBetweenDays } from '@shared/engine/planEdit'
import { changedFrom, newSeries } from '@shared/engine/series'
import { blockStepsEdits, taskStepsEdits, templateStepsChanged } from '@shared/engine/steps'
import { templateJson } from '@shared/model/defaults'
import { planBlock, templateFrom } from '@shared/model/plan'
import { newTask } from '@shared/model/requests'
import { seriesFrom, seriesJson, type SeriesBlock } from '@shared/model/series'
import { addStepOp, applyStepOp, STEPS_FULL, STEPS_FULL_TASK, STEPS_MAX, stepsFrom, stepsJson } from '@shared/model/steps'
import { lm } from './dsl'

const DAY = '2026-11-18'
const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, title: `krok ${i}`, order: i }))
const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}

describe('pozycje o tym samym id (przegląd 2, T787)', () => {
  const raw = [{ id: 'a', title: 'pierwszy', order: 0 }, { id: 'a', title: 'duplikat', order: 1 }, { id: 'b', title: 'drugi', order: 2 }]
  it('usunięcie kroku zdejmuje każdą pozycję jego id – duplikat nie wraca jako ten krok', () => {
    const json = stepsJson(ok(applyStepOp(stepsFrom(raw), { op: 'remove', id: 'a' })).steps, raw)!
    expect(json).toEqual([raw[2]])
    expect(stepsFrom(json).map((s) => s.id)).toEqual(['b'])
  })
  it('zmiana kroku – jedna pozycja jego id; niezmieniony – plik jak był', () => {
    const steps = stepsFrom(raw)
    expect(stepsJson(ok(applyStepOp(steps, { op: 'rename', id: 'a', title: 'Pierwszy' })).steps, raw)).toEqual([{ id: 'a', title: 'Pierwszy', order: 0 }, raw[2]])
    expect(stepsJson(ok(applyStepOp(steps, { op: 'rename', id: 'b', title: 'Drugi' })).steps, raw)).toEqual([raw[0], raw[1], { id: 'b', title: 'Drugi', order: 2 }])
  })
})

describe('pozycje bez liczbowego `order` (przegląd 2, T787)', () => {
  it('zapis daje im ich miejsce – po usunięciu kolejność się nie przestawia', () => {
    const raw = [{ id: 'a', title: 'A', order: 1 }, { id: 'b', title: 'B' }, { id: 'c', title: 'C', order: 0.5 }]
    expect(stepsFrom(raw).map((s) => s.id)).toEqual(['c', 'a', 'b'])
    const json = stepsJson(ok(applyStepOp(stepsFrom(raw), { op: 'remove', id: 'a' })).steps, raw)!
    expect(stepsFrom(json).map((s) => s.id)).toEqual(['c', 'b'])
    expect(json).toEqual([{ id: 'b', title: 'B', order: 1 }, raw[2]])
  })
})

describe('nowa wersja serii i szablonu zachowuje surowe pozycje (przegląd 2, T787, T790)', () => {
  const steps = [...list(2), { id: 'x', title: '', order: 9, later: 1 }, { id: 'k0', title: 'duplikat', order: 10 }]
  it('seria: wersja od dnia zmiany (`changedFrom`) – lista z wersji, którą kopiuje', () => {
    const block: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null, steps: stepsFrom(steps) }
    const raw0 = seriesJson(newSeries('s1', block, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null }))
    const versions = raw0.versions as Record<string, Record<string, unknown>>
    const raw = { ...raw0, versions: { '2026-11-01': { ...versions['2026-11-01']!, block: { ...(versions['2026-11-01']!.block as Record<string, unknown>), steps, later: 'pole' } } } }
    const changed = changedFrom(seriesFrom(raw)!, DAY, { stepsOp: { op: 'add', id: 'A', title: 'A', after: null } })
    const json = seriesJson(changed, raw)
    const written = (json.versions as Record<string, { block: { steps: unknown[]; later?: unknown } }>)[DAY]!.block
    expect(written.steps).toEqual([...steps, { id: 'A', title: 'A', order: 2 }])
    expect(written.later).toBe('pole')
  })
  it('szablon: wersja od daty (`withTemplateVersion`) – lista z wersji, którą kopiuje', () => {
    const raw = { id: 'zw', name: 'Zwykły', dayType: 'zwykly', versions: { '2026-01-01': { blocks: [{ id: 'w', categoryId: 'inne', startMin: 540, durationMin: 60, steps }] } } }
    const t = ok(templateStepsChanged(templateFrom(raw)!, DAY, 'w', { op: 'add', id: 'A', title: 'A', after: null })).template
    const json = templateJson(t, raw)
    const block = (json.versions as Record<string, { blocks: Array<{ steps: unknown[] }> }>)[DAY]!.blocks[0]!
    expect(block.steps).toEqual([...steps, { id: 'A', title: 'A', order: 2 }])
  })
})

describe('odmowa lustrzanej operacji mówi, czyja lista jest pełna (przegląd 2, T792)', () => {
  const at = Date.parse('2026-11-18T08:00:00Z')
  it('pełna lista zadania – „w zadaniu”; pełna lista bloku – „w bloku”', () => {
    const task = (n: number) => ({ ...newTask('t1', at, DAY, { title: 'Wdrożenie' })!, day: DAY, block: 'tb', state: 'planned', steps: list(n) })
    const block = (n: number) => planBlock({ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 60, task: 't1', steps: stepsFrom(list(n)) })
    expect(blockStepsEdits({ date: DAY, day: putBlock({ schema: 1, date: DAY }, block(5)), block: block(5), op: addStepOp('nowy'), task: task(STEPS_MAX) })).toEqual({ error: STEPS_FULL_TASK })
    expect(taskStepsEdits({ record: task(5), op: addStepOp('nowy'), date: DAY, day: putBlock({ schema: 1, date: DAY }, block(STEPS_MAX)), today: DAY })).toEqual({ error: STEPS_FULL })
    // The task's own list full (the page „Sprawy”, no block): „w zadaniu” too.
    expect(taskStepsEdits({ record: { ...task(STEPS_MAX), day: null, block: null }, op: addStepOp('nowy'), date: null, day: null, today: DAY })).toEqual({ error: STEPS_FULL_TASK })
    expect(STEPS_FULL_TASK).not.toBe(STEPS_FULL)
  })
})

describe('przeniesienie: odhaczenia z dnia źródłowego (przegląd 2, T786)', () => {
  it('blok podany bez odhaczeń (jak z pliku) – dzień docelowy i tak dostaje odhaczenia źródła', () => {
    const b = planBlock({ id: 'b', categoryId: 'inne', startMin: lm('10:00'), durationMin: 60, steps: stepsFrom(list(3)) })
    const from = setStepDone(putBlock({ schema: 1, date: DAY }, b), 'b', 'k1', true)
    const { source, target } = moveBetweenDays(from, null, b, [b], DAY, '2026-11-19')
    expect(stepsDoneIn(target, 'b')).toEqual(['k1'])
    expect(stepsDoneIn(source, 'b')).toEqual([])
  })

  it('odhaczenia ustawione na żadne zdejmują klucz bloku (nie zostaje pusta mapa)', () => {
    const raw = setStepDone({ schema: 1, date: DAY }, 'b', 'k1', true)
    expect(setStepsDone(raw, 'b', []).stepsDone).toEqual({})
    expect('b' in (setStepsDone(raw, 'b', []).stepsDone as Record<string, unknown>)).toBe(false)
  })
})
