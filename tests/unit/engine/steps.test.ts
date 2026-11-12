/**
 * Steps of blocks and tasks (SNT5, D440, T786–T792) – every example of D440 a test: a list „Kroki” of four steps, Enter
 * adds the next one, a drag changes the order, a tick ticks it off; „✓ 3/4” on the tile and in the panel; the bar's step
 * „☐ Napisać testy · krok 1/4”, after the tick the next one, after the last „Wszystkie kroki ✓”; the steps of a template's
 * block and of a series start unticked every day (a tick never writes the template, the series nor detaches the
 * occurrence); a task's block gets the task's steps and a tick in the block ticks the task; steps count nothing (energy,
 * the day's rules) and a block ending with steps not ticked asks nothing (D72).
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { activityOf } from '@shared/engine/activity'
import { casePlan, morningPlan, type CasePlan } from '@shared/engine/cases'
import { dayContextOf, snapshotOf, type PlanInputs } from '@shared/engine/context'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { copiedDay, moveBetweenDays } from '@shared/engine/planEdit'
import { changedFrom, newSeries, sameOccurrence, seriesBlockId, todayOccurrenceEdit } from '@shared/engine/series'
import { blockStepsEdits, dayBlockNow, seriesStepsPatch, STEP_GONE, taskStepsEdits, taskTickEdits, templateStepsChanged, tickEdits } from '@shared/engine/steps'
import { timerNow } from '@shared/engine/timer'
import { blockJson, putBlock, setStepDone, stepsDoneIn } from '@shared/data/dayEdits'
import { diffRecords, merge3, recordEdit } from '@shared/data/merge'
import { engineView } from '@shared/engineView'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { templateJson } from '@shared/model/defaults'
import { RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock, type Template } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { seriesFrom, seriesJson, seriesPlans, typeOfDays, type SeriesBlock } from '@shared/model/series'
import {
  addStepOp,
  applyStepOp,
  firstOpen,
  moveStepOp,
  STEP_NO_TITLE,
  STEPS_FULL,
  STEPS_MAX,
  stepsCounter,
  stepsFrom,
  stepsJson,
  textWithSteps,
  type Step
} from '@shared/model/steps'
import { barStepText, ALL_STEPS_TEXT } from '@shared/widget'
import { placeLogical } from '@shared/time/day'
import { lm, Scenario } from './dsl'

const DAY = '2026-11-18'
const four = (): Step[] => ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}

describe('lista kroków (model)', () => {
  it('Enter dodaje kolejny krok na końcu; po wskazanym – lista numerowana od nowa; pusty tytuł i ponad limit – odmowa', () => {
    let steps: Step[] = []
    for (const t of ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie']) steps = ok(applyStepOp(steps, addStepOp(t))).steps
    expect(steps.map((s) => [s.title, s.order, s.done])).toEqual([
      ['Napisać testy', 0, false],
      ['Przygotować logikę', 1, false],
      ['Sprawdzić na Windowsie', 2, false]
    ])
    // Enter in the middle: after the first one.
    steps = ok(applyStepOp(steps, addStepOp('  Zrobić\n commit ', steps[0]!.id))).steps
    expect(steps.map((s) => s.title)).toEqual(['Napisać testy', 'Zrobić commit', 'Przygotować logikę', 'Sprawdzić na Windowsie'])
    expect(steps.map((s) => s.order)).toEqual([0, 1, 2, 3])
    expect(applyStepOp(steps, addStepOp('   '))).toEqual({ error: STEP_NO_TITLE })
    let full: Step[] = []
    for (let i = 0; i < STEPS_MAX; i++) full = ok(applyStepOp(full, addStepOp(`k${i}`))).steps
    expect(applyStepOp(full, addStepOp('jeszcze jeden'))).toEqual({ error: STEPS_FULL })
  })

  it('przeciąganie zmienia kolejność: tylko `order` przestawionych, lista w pliku w swojej kolejności (T787)', () => {
    const steps = four()
    const moved = ok(applyStepOp(steps, moveStepOp(steps, 's4', 0))).steps
    expect(moved.map((s) => s.id)).toEqual(['s4', 's1', 's2', 's3'])
    const before = stepsJson(steps)!
    const after = stepsJson(moved, before)!
    // The file's order stays – each step's own `order` is the change, no whole list to meet another computer's tick.
    expect(after.map((x) => (x as { id: string }).id)).toEqual(['s1', 's2', 's3', 's4'])
    expect(diffRecords({ steps: before }, { steps: after }).map((c) => c.path.join('.'))).toEqual(['steps.#s1.order', 'steps.#s2.order', 'steps.#s3.order', 'steps.#s4.order'])
    expect(stepsFrom(after).map((s) => s.id)).toEqual(['s4', 's1', 's2', 's3'])
    // A move to the end, a rename and a removal.
    expect(ok(applyStepOp(steps, moveStepOp(steps, 's1', 3))).steps.map((s) => s.id)).toEqual(['s2', 's3', 's4', 's1'])
    expect(ok(applyStepOp(steps, { op: 'rename', id: 's2', title: 'Logika' })).steps[1]!.title).toBe('Logika')
    expect(ok(applyStepOp(steps, { op: 'remove', id: 's3' })).steps.map((s) => s.id)).toEqual(['s1', 's2', 's4'])
    // A step gone elsewhere: the list as it is.
    expect(ok(applyStepOp(steps, { op: 'rename', id: 'x', title: 'y' })).steps).toEqual(steps)
  })

  it('odczyt tolerancyjny: bez id lub tytułu – pominięty, id raz, każdy odczytany (limit tylko przy dodawaniu), `done` z pliku nigdy; zapis bez `done`, pozycje nieodczytane zostają', () => {
    const raw = [{ id: 'b', title: 'drugi', order: 1, extra: 'nowsze pole', done: true }, { id: 'a', title: 'pierwszy', order: 0 }, { id: 'a', title: 'duplikat' }, { title: 'bez id' }, { id: 'c', title: '  ' }, 'x']
    expect(stepsFrom(raw)).toEqual([
      { id: 'a', title: 'pierwszy', order: 0, done: false },
      { id: 'b', title: 'drugi', order: 1, done: false }
    ])
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `k${i}`, title: `krok ${i}`, order: i }))
    expect(stepsFrom(many)).toHaveLength(40)
    // „a” removed, „b” renamed (its other fields stay); what this version does not read stays as the file has it.
    const written = stepsJson([{ id: 'b', title: 'drugi!', order: 1, done: true }], raw)!
    expect(written).toEqual([{ id: 'b', title: 'drugi!', order: 1, extra: 'nowsze pole', done: true }, raw[2], raw[3], raw[4], raw[5]])
    expect(stepsJson([], undefined)).toBeUndefined()
    expect(stepsJson([{ id: 'n', title: 'nowy', order: 0, done: true }], undefined)).toEqual([{ id: 'n', title: 'nowy', order: 0 }])
  })

  it('licznik „✓ 3/4” na kafelku i w panelu; bez kroków – nic', () => {
    const steps = four().map((s, i) => ({ ...s, done: i < 3 }))
    expect(stepsCounter(steps)).toBe('✓ 3/4')
    expect(stepsCounter([])).toBeNull()
    expect(stepsCounter(undefined)).toBeNull()
  })

  it('pasek: „☐ Napisać testy · krok 1/4”, po odhaczeniu kolejny „krok 2/4”, po ostatnim „Wszystkie kroki ✓”', () => {
    const steps = four()
    const line = (s: Step[]) => {
      const o = firstOpen(s)
      return barStepText({ block: 'b', step: o ? { id: o.step.id, title: o.step.title, n: o.n } : null, total: s.length })
    }
    expect(line(steps)).toBe('Napisać testy · krok 1/4')
    expect(line(steps.map((s) => (s.id === 's1' ? { ...s, done: true } : s)))).toBe('Przygotować logikę · krok 2/4')
    expect(line(steps.map((s) => ({ ...s, done: true })))).toBe(ALL_STEPS_TEXT)
    expect(ALL_STEPS_TEXT).toBe('Wszystkie kroki ✓')
  })

  it('wyszukiwarka: tytuły kroków jako tekst bloku albo zadania', () => {
    expect(textWithSteps('notatka', four().slice(0, 2))).toBe('notatka\nNapisać testy · Przygotować logikę')
    expect(textWithSteps('', four().slice(0, 1))).toBe('Napisać testy')
    expect(textWithSteps('sama notatka', [])).toBe('sama notatka')
  })
})

const tpl = (steps: Step[]): Template => ({
  id: 'zwykly',
  name: 'Zwykły',
  dayType: 'zwykly',
  weekdays: [],
  versions: [{ from: '2026-01-01', blocks: [planBlock({ id: 'wdr', categoryId: 'inne', startMin: lm('09:00'), durationMin: 90, origin: 'template', steps })], budgetMin: null, maxMin: null }],
  archived: false
})
const inputsOf = (templates: Template[], series: PlanInputs['series'] = []): PlanInputs => ({ changes: [], templates, lectures: [], series })

describe('kroki w dniu', () => {
  it('blok szablonu: każdego dnia kroki odznaczone; odhaczenie zapisuje plik dnia (`stepsDone`), nie blok ani szablon (T786)', () => {
    const t = tpl(four())
    const id = templateBlockId(DAY, 'zwykly', 'wdr')
    const ctx = (raw: Record<string, unknown> | null, date = DAY) => dayContextOf(inputsOf([t]), { date, events: [], dayFile: raw ? dayFileFrom(raw, date) : null, nextFile: null }, marketDay, placeLogical(date, lm('08:00')))
    const block = ctx(null).plan.find((b) => b.id === id)!
    expect(block.steps.map((s) => [s.title, s.done])).toEqual(four().map((s) => [s.title, false]))
    const out = ok(tickEdits({ date: DAY, day: null, block, stepId: 's1', done: true, task: null }))
    // Only the tick: no block in the day's file.
    expect(out.day).toEqual({ schema: 1, date: DAY, stepsDone: { [id]: { s1: true } } })
    expect(ctx(out.day).plan.find((b) => b.id === id)!.steps.map((s) => s.done)).toEqual([true, false, false, false])
    // The next day of the same template: nothing ticked.
    const next = '2026-11-19'
    expect(ctx(null, next).plan.find((b) => b.id === templateBlockId(next, 'zwykly', 'wdr'))!.steps.every((s) => !s.done)).toBe(true)
    // A tick taken back: the field gone.
    const back = ok(tickEdits({ date: DAY, day: out.day, block, stepId: 's1', done: false, task: null }))
    expect(stepsDoneIn(back.day, id)).toEqual([])
    // A step removed on another computer: nothing ticked.
    expect(tickEdits({ date: DAY, day: null, block, stepId: 'nie-ma', done: true, task: null })).toEqual({ error: STEP_GONE })
  })

  it('zmiana listy w dniu: blok szablonu zapisany w pliku dnia (jak każda jego zmiana tego dnia), odhaczenia zostają; usunięty krok traci odhaczenie', () => {
    const t = tpl(four())
    const id = templateBlockId(DAY, 'zwykly', 'wdr')
    const plan = (raw: Record<string, unknown> | null) => dayContextOf(inputsOf([t]), { date: DAY, events: [], dayFile: raw ? dayFileFrom(raw, DAY) : null, nextFile: null }, marketDay, placeLogical(DAY, lm('08:00'))).plan
    const block = plan(null).find((b) => b.id === id)!
    let raw = ok(tickEdits({ date: DAY, day: null, block, stepId: 's2', done: true, task: null })).day
    raw = ok(blockStepsEdits({ date: DAY, day: raw, block: plan(raw).find((b) => b.id === id)!, op: addStepOp('Napisać changelog', 's4'), task: null })).day
    expect(plan(raw).find((b) => b.id === id)!.steps.map((s) => [s.title, s.done])).toEqual([...four().map((s) => [s.title, s.id === 's2']), ['Napisać changelog', false]])
    // The block in the file: the list without ticks.
    const fileBlock = (raw.blocks as Array<Record<string, unknown>>).find((b) => b.id === id)!
    expect((fileBlock.steps as Array<Record<string, unknown>>).some((s) => 'done' in s)).toBe(false)
    raw = ok(blockStepsEdits({ date: DAY, day: raw, block: plan(raw).find((b) => b.id === id)!, op: { op: 'remove', id: 's2' }, task: null })).day
    expect(stepsDoneIn(raw, id)).toEqual([])
    // The template is never written by a day.
    expect(t.versions[0]!.blocks[0]!.steps).toEqual(four())
  })

  it('kopia dnia: kroki kopiują się odznaczone (nowe id bloków); przeniesienie na inny dzień zabiera odhaczenia', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: lm('10:00'), durationMin: 60, steps: four().map((s) => ({ ...s, done: s.id === 's1' })) })
    const [copy] = copiedDay([b])
    expect(copy!.id).not.toBe('a')
    expect(copy!.steps.map((s) => [s.title, s.done])).toEqual(four().map((s) => [s.title, false]))
    const { target } = moveBetweenDays(setStepDone({ schema: 1, date: DAY }, 'a', 's1', true), null, b, [b], DAY, '2026-11-19')
    expect(dayFileFrom(target, '2026-11-19').stepsDone).toEqual({ a: ['s1'] })
  })

  it('plik dnia: blok z krokami zapisany bez `done`; zmiana innego pola nie rusza listy (pola nieznane zostają)', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: lm('10:00'), durationMin: 60, steps: four().map((s) => ({ ...s, done: true })) })
    const json = blockJson(b)
    expect((json.steps as unknown[]).length).toBe(4)
    expect((json.steps as Array<Record<string, unknown>>).every((s) => !('done' in s))).toBe(true)
    // A block without steps: no field at all (an empty list would be a change to meet another computer's).
    expect('steps' in blockJson(planBlock({ id: 'x', categoryId: 'inne', startMin: 600, durationMin: 30 }))).toBe(false)
    const raw = { schema: 1, date: DAY, blocks: [{ ...json, steps: [...(json.steps as Array<Record<string, unknown>>).map((s) => ({ ...s, later: 1 }))] }] }
    const read = dayFileFrom(raw, DAY).blocks[0]!
    const after = putBlock(raw, { ...read, note: 'nowa' })
    const e = recordEdit('days/2026/x.json', raw, after)!
    expect(e.edits.map((x) => x.path.join('.'))).toEqual(['blocks.#a.note'])
  })

  it('kroki niczego nie liczą: dzień i energia z odhaczonymi, nieodhaczonymi i bez kroków – te same; koniec bloku o nic nie pyta (D72)', () => {
    const with4 = planBlock({ id: 'a', categoryId: 'inne', startMin: lm('09:00'), durationMin: 90, origin: 'user', steps: four() })
    const ticked = { ...with4, steps: with4.steps.map((s) => ({ ...s, done: true })) }
    const without = { ...with4, steps: [] }
    const run = (b: PlanBlock) => {
      const s = new Scenario({ date: DAY, plan: [b] }).observe('08:00', null).start('a', '09:00').end('a', '10:30')
      const t = s.at('11:00')
      const ctx = s.contextAt(t)
      const st = computeDay(ctx)
      const v = engineView({ ctx, state: st, energy: null, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, name: () => 'Inne', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
      return { day: [st.boundary, st.workEnd, st.budget, st.regen, st.hardEnd, st.pool, st.bedtime], energy: computeEnergy(ctx, st, { moduleOn: true, calibration: false }).now, lines: v.lines.map((l) => l.id), dot: v.dot }
    }
    const base = run(without)
    expect(run(with4)).toEqual(base)
    expect(run(ticked)).toEqual(base)
    // No new rule of the day (D440): the version of the rules stays.
    expect(RULES_VERSION).toBe(8)
  })

  it('migawka starszej wersji bez kroków: blok szablonu i wystąpienie serii biorą listę ze źródła, odznaczoną (T791)', () => {
    const t = tpl(four())
    const block: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: four().slice(0, 2) }
    const s = newSeries('ang', block, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
    const series = seriesPlans([s], typeOfDays([], () => null), marketDay)
    const made = createDay({ date: DAY, changes: [], templates: [t], lectures: [], series, dayFile: null, holidays: marketDay, at: null })
    // As a version without steps wrote it: the blocks without the field.
    const old = { ...made, blocks: made.blocks.map(({ steps: _s, ...b }) => b) }
    const events = [{ id: 'c1', c: 'pcb', n: 0, t: 1, l: 1, v: 8, day: DAY, dom: 'timer', k: 'day.create', snapshot: JSON.parse(JSON.stringify(old)) }] as unknown as AnyEvent[]
    const { snapshot, fromLog } = snapshotOf(inputsOf([t], series), { date: DAY, events, dayFile: null, nextFile: null }, marketDay, null)
    expect(fromLog).toBe(true)
    const byOrigin = (o: string) => snapshot.blocks.find((b) => b.origin === o)!.steps.map((x) => [x.title, x.done])
    expect(byOrigin('template')).toEqual(four().map((x) => [x.title, false]))
    expect(byOrigin('series')).toEqual(four().slice(0, 2).map((x) => [x.title, false]))
    // A snapshot with the field (an empty list too) is as written.
    const written = { ...made, blocks: made.blocks.map((b) => ({ ...b, steps: [] })) }
    const ev2 = [{ ...events[0]!, snapshot: JSON.parse(JSON.stringify(written)) }] as unknown as AnyEvent[]
    expect(snapshotOf(inputsOf([t], series), { date: DAY, events: ev2, dayFile: null, nextFile: null }, marketDay, null).snapshot.blocks.every((b) => b.steps.length === 0)).toBe(true)
    // A plan from a snapshot without the field at all (no source either): an empty list.
    const bare = { ...made, blocks: [{ ...(({ steps: _s, ...b }) => b)(made.blocks[0]!), origin: 'user' as const }] }
    expect(dayPlan(bare as never, null)[0]!.steps).toEqual([])
  })
})

describe('kroki serii (D401, D404)', () => {
  const block: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: four() }
  const s = newSeries('ang', block, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
  const id = seriesBlockId(DAY, 'ang')
  const day = (raw: Record<string, unknown> | null, list = [s]) => {
    const ctx = dayContextOf(inputsOf([], seriesPlans(list, typeOfDays([], () => null), marketDay)), { date: DAY, events: [], dayFile: raw ? dayFileFrom(raw, DAY) : null, nextFile: null }, marketDay, placeLogical(DAY, lm('10:00')))
    return { ctx, state: computeDay(ctx) }
  }

  it('wystąpienie startuje odznaczone; odhaczenie go nie odłącza od serii – zmiana „Cała seria” dociera, odhaczenia zostają', () => {
    const occ = day(null).ctx.plan.find((b) => b.id === id)!
    expect(occ.steps.every((x) => !x.done)).toBe(true)
    const raw = ok(tickEdits({ date: DAY, day: null, block: occ, stepId: 's1', done: true, task: null })).day
    expect(raw.blocks).toBeUndefined()
    // The whole series later at 18:00: today's occurrence follows (not changed on its day), its tick stays.
    const changed = changedFrom(s, DAY, { block: { startMin: lm('18:00') } })
    const was = { ...occ, steps: occ.steps.map((x) => ({ ...x, done: false })) }
    const next = day(null, [changed]).ctx.plan.find((b) => b.id === id)!
    const after = todayOccurrenceEdit(raw, day(raw), id, was, next)!
    const plan = day(after, [changed]).ctx.plan.find((b) => b.id === id)!
    expect(plan.startMin).toBe(lm('18:00'))
    expect(plan.steps.map((x) => x.done)).toEqual([true, false, false, false])
    // A file block with only its ticks different is the same occurrence; a list of its own (`Tylko to`) is not.
    expect(sameOccurrence({ ...occ, steps: occ.steps.map((x) => ({ ...x, done: true })) } as never, was)).toBe(true)
    const own = ok(applyStepOp(occ.steps, addStepOp('tylko dziś'))).steps
    expect(sameOccurrence({ ...occ, steps: own }, was)).toBe(false)
  })

  it('zmiana listy „To i następne” / „Cała seria”: łatka serii z całą listą bez odhaczeń; zapis serii bez `done`, nieznane pola zostają', () => {
    const occ = day(null).ctx.plan.find((b) => b.id === id)!
    const patch = ok(seriesStepsPatch({ ...occ, steps: occ.steps.map((x) => ({ ...x, done: true })) }, { op: 'remove', id: 's4' }))
    expect(patch.block.steps.map((x) => [x.id, x.done])).toEqual([
      ['s1', false],
      ['s2', false],
      ['s3', false]
    ])
    const changed = changedFrom(s, DAY, patch)
    const json = seriesJson(changed, seriesJson(s))
    const back = seriesFrom(json)!
    expect(back.versions.at(-1)!.block.steps.map((x) => x.title)).toEqual(['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie'])
    const written = (json.versions as Record<string, { block: { steps: Array<Record<string, unknown>> } }>)[DAY]!.block.steps
    expect(written.every((x) => !('done' in x))).toBe(true)
  })
})

describe('kroki zadania (D440, T792)', () => {
  const at = placeLogical(DAY, lm('09:00'))
  const task = () => {
    let raw = newTask('t1', at, DAY, { title: 'Wdrożenie nowej funkcji', list: 'today' })!
    for (const x of four()) raw = { ...raw, steps: [...((raw.steps as unknown[]) ?? []), { id: x.id, title: x.title, order: x.order }] }
    return { ...raw, stepsDone: { s1: true } }
  }

  it('blok z zadania dostaje jego kroki (te same id, odhaczone jak w zadaniu); plan poranny – tak samo', () => {
    const p = casePlan({ record: task(), date: DAY, startMin: lm('10:00'), files: { [DAY]: null }, rules, at, begun: () => false }) as CasePlan
    expect(p.block.steps.map((x) => [x.id, x.done])).toEqual([
      ['s1', true],
      ['s2', false],
      ['s3', false],
      ['s4', false]
    ])
    const raw = p.days[DAY]!
    expect(stepsDoneIn(raw, p.block.id)).toEqual(['s1'])
    const m = morningPlan({ date: DAY, dayFile: null, requests: [], tasks: [task()], startMin: lm('10:00'), rules, at })
    expect(stepsDoneIn(m.days[DAY], m.blocks[0]!.id)).toEqual(['s1'])
    expect(m.blocks[0]!.steps).toHaveLength(4)
  })

  it('odhaczenie w bloku odhacza je w zadaniu; zadanie zaplanowane gdzie indziej – tylko dzień', () => {
    const p = casePlan({ record: task(), date: DAY, startMin: lm('10:00'), files: { [DAY]: null }, rules, at, begun: () => false }) as CasePlan
    const block = dayBlockNow(p.days[DAY]!, DAY, p.block)
    const out = ok(tickEdits({ date: DAY, day: p.days[DAY]!, block, stepId: 's2', done: true, task: p.record }))
    expect(requestFrom(out.task)!.steps.map((x) => x.done)).toEqual([true, true, false, false])
    expect(stepsDoneIn(out.day, block.id).sort()).toEqual(['s1', 's2'])
    const elsewhere = { ...p.record, block: 'inny' }
    expect(ok(tickEdits({ date: DAY, day: p.days[DAY]!, block, stepId: 's3', done: true, task: elsewhere })).task).toBeNull()
  })

  it('zmiana listy w bloku – ta sama w zadaniu; zmiana w zadaniu – ta sama w bloku dziś i później, nigdy w dniu minionym (T769)', () => {
    const p = casePlan({ record: task(), date: DAY, startMin: lm('10:00'), files: { [DAY]: null }, rules, at, begun: () => false }) as CasePlan
    const block = dayBlockNow(p.days[DAY]!, DAY, p.block)
    const op = addStepOp('Napisać changelog')
    const out = ok(blockStepsEdits({ date: DAY, day: p.days[DAY]!, block, op, task: p.record }))
    expect(requestFrom(out.task)!.steps.map((x) => [x.id, x.title])).toEqual(out.block.steps.map((x) => [x.id, x.title]))
    const op2 = moveStepOp(out.block.steps, 's4', 0)
    const t = ok(taskStepsEdits({ record: out.task!, op: op2, date: DAY, day: out.day, today: DAY }))
    expect(requestFrom(t.record)!.steps[0]!.id).toBe('s4')
    expect(dayFileFrom(t.day!, DAY).blocks[0]!.steps[0]!.id).toBe('s4')
    // The block on a day gone by: the task alone.
    expect(ok(taskStepsEdits({ record: out.task!, op: op2, date: DAY, day: out.day, today: '2026-11-19' })).day).toBeNull()
    const tick = ok(taskTickEdits({ record: t.record, stepId: 's3', done: true, date: DAY, day: t.day, today: DAY }))
    expect(stepsDoneIn(tick.day, block.id).sort()).toEqual(['s1', 's3'])
    expect(requestFrom(tick.record)!.steps.find((x) => x.id === 's3')!.done).toBe(true)
  })
})

describe('kroki bloku szablonu', () => {
  it('zmiana listy w wersji od daty (nowa wersja jako kopia obowiązującej); zapis bez `done`', () => {
    const t = tpl(four())
    const out = ok(templateStepsChanged(t, '2026-11-19', 'wdr', { op: 'remove', id: 's2' })).template
    expect(out.versions.map((v) => v.from)).toEqual(['2026-01-01', '2026-11-19'])
    expect(out.versions[1]!.blocks[0]!.steps.map((x) => x.id)).toEqual(['s1', 's3', 's4'])
    expect(out.versions[0]!.blocks[0]!.steps).toHaveLength(4)
    const json = templateJson(out, templateJson(t))
    expect(templateFrom(json)!.versions[1]!.blocks[0]!.steps.map((x) => x.id)).toEqual(['s1', 's3', 's4'])
    expect(templateStepsChanged(t, '2026-11-19', 'brak', { op: 'remove', id: 's1' })).toEqual({ error: 'Tego bloku już nie ma w szablonie.' })
  })
})

describe('dwa komputery – scalanie', () => {
  it('odhaczenia na A i na B (kopia konfliktowa bez bazy): oba zostają, odhaczony na jednym wygrywa (T788)', () => {
    const a = setStepDone(setStepDone({ schema: 1, date: DAY }, 'b1', 's1', true), 'b1', 's3', true)
    const b = setStepDone({ schema: 1, date: DAY }, 'b1', 's2', true)
    // Without a base, as `joinCopy` merges: what only one side has is an addition.
    const asked: unknown[] = []
    const { merged } = merge3<Record<string, unknown>>(undefined, a, b, (c) => (c.mine === undefined ? 'theirs' : c.theirs === undefined ? 'mine' : (asked.push(c), 'mine')))
    expect(asked).toEqual([])
    expect(dayFileFrom(merged, DAY).stepsDone.b1!.sort()).toEqual(['s1', 's2', 's3'])
  })

  it('engineView: linia kroku tylko przy bloku na pierwszym planie, w „Odcinam się” ukryta', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: lm('09:00'), durationMin: 90, origin: 'user', steps: four().map((x) => ({ ...x, done: x.id === 's1' })) })
    const s = new Scenario({ date: DAY, plan: [b] }).observe('08:00', null)
    const v = (time: string) => {
      const t = s.at(time)
      const ctx = s.contextAt(t)
      const st = computeDay(ctx)
      return engineView({ ctx, state: st, energy: null, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, name: () => 'Inne', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, timer: timerNow(st) })
    }
    expect(v('08:30').steps).toBeNull()
    s.start('a', '09:00')
    expect(v('09:10').steps).toEqual({ block: 'a', step: { id: 's2', title: 'Przygotować logikę', n: 2 }, total: 4 })
    s.disconnect('09:20', null)
    expect(v('09:25').steps).toBeNull()
  })
})
