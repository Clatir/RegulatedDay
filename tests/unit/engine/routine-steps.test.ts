/**
 * 1.22-A (D473, D474, T1100–T1105): the steps of a block's routine and the end of a block by its last step.
 * - D473: a block with a routine and no steps of its own (also of a template and of a series – never of a task) shows the
 *   routine's steps – the usual version, „na gorsze dni” picked with one click; the ticks are the day's; a change of the
 *   routine changes the steps of a block not begun (nothing ticked, no version picked) – the first tick keeps the list.
 * - D474: the tick of the last step (any block with steps) ends the block now, done; „Cofnij” takes the end back.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { activityOf } from '@shared/engine/activity'
import { createDay, dayPlan } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { newSeries, seriesBlockId } from '@shared/engine/series'
import { routinesDue } from '@shared/engine/routineCheck'
import { blockStepsEdits, ROUTINE_VERSION_NONE, routineSaveEdits, routineVersionEdits, STEP_GONE, tickEdits, type BlockStepsEdit } from '@shared/engine/steps'
import { ALREADY_OVER, NOT_BEGUN, STEPS_RULE, timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { recordEdit } from '@shared/data/merge'
import { engineView } from '@shared/engineView'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock } from '@shared/model/plan'
import { ROUTINE_STEPS, routineList, routineStepsEntries, routineStepsOf, shownSteps, STEPS_QUIET } from '@shared/model/routineSteps'
import type { Routine } from '@shared/model/routines'
import { seriesPlans, typeOfDays, type SeriesBlock } from '@shared/model/series'
import type { Step } from '@shared/model/steps'
import { lm, Scenario } from './dsl'

const DAY = '2026-11-18'
const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}
type Raw = Record<string, unknown>

/** The routine „Poranek”: the usual version of three steps (one without a name), the worse days' of one. */
const poranek = (normal = [
  { id: 'a', name: 'Prysznic', min: 10 },
  { id: 'b', name: 'Śniadanie', min: 20 },
  { id: 'c', name: '', min: 5 }
]): Routine => ({ id: 'poranek', name: 'Poranek', archived: false, normal, worse: [{ id: 'w', name: 'Leki', min: 5 }] })
const view = (steps: readonly Step[]) => steps.map((s) => [s.id, s.title, s.min ?? null, s.done])
const rutyna = (over: Partial<PlanBlock> = {}): PlanBlock => planBlock({ id: 'r', categoryId: 'rutyny', startMin: lm('07:00'), durationMin: 35, origin: 'template', routine: 'poranek', ...over })
/** The edit of the day's file a write makes: the paths of its fields. */
const paths = (before: Raw | null, after: Raw) => recordEdit('days/2026/2026-11-18.json', before, after)!.edits.map((e) => e.path.join('.'))

describe('kroki rutyny w bloku (D473)', () => {
  it('blok z rutyną bez własnych kroków pokazuje kroki wersji zwykłej: ich id, nazwa (bez nazwy – „krok N”) i czas', () => {
    const steps = shownSteps(rutyna(), [poranek()], null)
    expect(view(steps)).toEqual([
      ['a', 'Prysznic', 10, false],
      ['b', 'Śniadanie', 20, false],
      ['c', 'krok 3', 5, false]
    ])
    // Its own list wins; a block of a task never takes the routine's (its list is the task's, T792); no routine – none.
    const own: Step[] = [{ id: 'x', title: 'Własny', order: 0, done: false }]
    expect(shownSteps(rutyna({ steps: own }), [poranek()], null)).toBe(own)
    expect(shownSteps(rutyna({ task: 't1' }), [poranek()], null)).toEqual([])
    expect(shownSteps(rutyna({ routine: 'inna' }), [poranek()], null)).toEqual([])
    expect(shownSteps(rutyna(), [poranek([])], null)).toEqual([])
  })

  it('blok szablonu i wystąpienie serii z rutyną (reklamacja 1.20.0): dzień pokazuje kroki rutyny, odhaczenia z pliku dnia', () => {
    const tpl = templateFrom({ id: 'tz', name: 'Zwykły', dayType: 'zwykly', weekdays: [], versions: { '2026-01-01': { blocks: [{ id: 'rano', categoryId: 'rutyny', startMin: lm('07:00'), durationMin: 35, routine: 'poranek' }] } } })!
    const sb: SeriesBlock = { categoryId: 'rutyny', variantId: null, startMin: lm('21:00'), durationMin: 20, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: 'poranek', steps: [] }
    const series = seriesPlans([newSeries('wiecz', sb, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })], typeOfDays([], () => null), marketDay)
    const snapshot = createDay({ date: DAY, changes: [], templates: [tpl], lectures: [], series, dayFile: null, holidays: marketDay, at: null })
    const id = dayPlan(snapshot, null).find((b) => b.origin === 'template')!.id
    const file = dayFileFrom({ stepsDone: { [id]: { b: true } } }, DAY)
    const plan = dayPlan(snapshot, file)
    const fromTemplate = plan.find((b) => b.origin === 'template')!
    const fromSeries = plan.find((b) => b.origin === 'series')!
    expect(fromTemplate.steps).toEqual([])
    expect(view(shownSteps(fromTemplate, [poranek()], file)).map((x) => x[3])).toEqual([false, true, false])
    expect(fromSeries.id).toBe(seriesBlockId(DAY, 'wiecz'))
    expect(view(shownSteps(fromSeries, [poranek()], file)).map((x) => x[1])).toEqual(['Prysznic', 'Śniadanie', 'krok 3'])
  })

  it('zmiana rutyny zmienia kroki bloku niezaczętego; pierwsze odhaczenie zapisuje listę w dniu – potem rutyna jej nie rusza (T1100)', () => {
    const b = rutyna()
    // Not ticked yet: the routine as it is now.
    const changed = poranek([{ id: 'a', name: 'Zimny prysznic', min: 5 }, { id: 'd', name: 'Kawa', min: 10 }])
    expect(view(shownSteps(b, [changed], null)).map((x) => x[1])).toEqual(['Zimny prysznic', 'Kawa'])
    // The first tick: the day's tick and the list kept – the block itself is never written (T786).
    const out = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 'b', done: true, task: null, routines: [poranek()] }))
    expect(paths(null, out.day)).toEqual(['schema', 'date', 'stepsDone.r.b', ROUTINE_STEPS])
    expect(paths(null, out.day).some((p) => p.startsWith('blocks'))).toBe(false)
    expect((out.day[ROUTINE_STEPS] as Raw).r).toEqual({ routine: 'poranek', version: 'normal', steps: [
      { id: 'a', title: 'Prysznic', order: 0, min: 10 },
      { id: 'b', title: 'Śniadanie', order: 1, min: 20 },
      { id: 'c', title: 'krok 3', order: 2, min: 5 }
    ] })
    const file = dayFileFrom(out.day, DAY)
    // The routine changed afterwards: the day keeps its list (with its tick).
    expect(view(shownSteps(b, [changed], file))).toEqual([
      ['a', 'Prysznic', 10, false],
      ['b', 'Śniadanie', 20, true],
      ['c', 'krok 3', 5, false]
    ])
    // The next tick does not write the list again; the routine gone – the kept list stays.
    const next = ok(tickEdits({ date: DAY, day: out.day, block: b, stepId: 'a', done: true, task: null, routines: [changed] }))
    expect(paths(out.day, next.day)).toEqual(['stepsDone.r.a'])
    expect(view(shownSteps(b, [], file)).map((x) => x[0])).toEqual(['a', 'b', 'c'])
    // A step the list does not have – refused.
    expect(tickEdits({ date: DAY, day: out.day, block: b, stepId: 'd', done: true, task: null, routines: [changed] })).toEqual({ error: STEP_GONE })
  })

  it('bez rutyn (starsze wywołanie) – odhaczenie kroku rutyny nie istnieje; inna rutyna bloku – zapamiętana lista nie obowiązuje', () => {
    expect(tickEdits({ date: DAY, day: null, block: rutyna(), stepId: 'a', done: true, task: null })).toEqual({ error: STEP_GONE })
    const kept = ok(tickEdits({ date: DAY, day: null, block: rutyna(), stepId: 'a', done: true, task: null, routines: [poranek()] })).day
    const other: Routine = { id: 'wieczor', name: 'Wieczór', archived: false, worse: [], normal: [{ id: 'k', name: 'Kolacja', min: 30 }] }
    expect(view(shownSteps(rutyna({ routine: 'wieczor' }), [poranek(), other], dayFileFrom(kept, DAY))).map((x) => x[1])).toEqual(['Kolacja'])
  })

  it('wersja na gorsze dni jednym kliknięciem (T1101): dzień trzyma listę tej wersji, odhaczenia zostają (powrót je pokazuje)', () => {
    const b = rutyna()
    const ticked = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 'a', done: true, task: null, routines: [poranek()] })).day
    const worse = ok(routineVersionEdits({ date: DAY, day: ticked, block: b, version: 'worse', routines: [poranek()] }))
    expect(paths(ticked, worse.day).some((p) => p.startsWith('blocks') || p.startsWith('stepsDone'))).toBe(false)
    const file = dayFileFrom(worse.day, DAY)
    expect(routineStepsOf(b, [poranek()], file.routineSteps)?.version).toBe('worse')
    expect(view(shownSteps(b, [poranek()], file))).toEqual([['w', 'Leki', 5, false]])
    const back = ok(routineVersionEdits({ date: DAY, day: worse.day, block: b, version: 'normal', routines: [poranek()] }))
    expect(view(shownSteps(b, [poranek()], dayFileFrom(back.day, DAY))).map((x) => x[3])).toEqual([true, false, false])
    // The same version again – nothing to write; a routine without the worse version, or a block with its own list – refused.
    expect(ok(routineVersionEdits({ date: DAY, day: back.day, block: b, version: 'normal', routines: [poranek()] })).day).toEqual(back.day)
    const noWorse = { ...poranek(), worse: [] }
    expect(routineVersionEdits({ date: DAY, day: null, block: b, version: 'worse', routines: [noWorse] })).toEqual({ error: ROUTINE_VERSION_NONE })
    expect(routineVersionEdits({ date: DAY, day: null, block: rutyna({ steps: [{ id: 'x', title: 'X', order: 0, done: false }] }), version: 'worse', routines: [poranek()] })).toEqual({ error: ROUTINE_VERSION_NONE })
  })

  it('zmiana listy rutyny w panelu (T1102): lista rutyny ze zmianą staje się własną listą bloku dnia, wpis rutyny znika', () => {
    const b = rutyna()
    const kept = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 'a', done: true, task: null, routines: [poranek()] })).day
    const out = ok(blockStepsEdits({ date: DAY, day: kept, block: b, op: { op: 'rename', id: 'b', title: 'Owsianka' }, task: null, routines: [poranek()] }))
    const file = dayFileFrom(out.day, DAY)
    expect(file.routineSteps).toEqual({})
    expect(ROUTINE_STEPS in out.day).toBe(false)
    const own = file.blocks.find((x) => x.id === 'r')!
    expect(own.steps.map((s) => [s.id, s.title, s.min ?? null])).toEqual([
      ['a', 'Prysznic', 10],
      ['b', 'Owsianka', 20],
      ['c', 'krok 3', 5]
    ])
    // The tick stays with its step (the same ids).
    expect(file.stepsDone.r).toEqual(['a'])
  })

  it('plik dnia: wpis czytany tolerancyjnie (bez rutyny albo kroków – pominięty, nieznana wersja – zwykła)', () => {
    expect(routineStepsEntries({ r: { routine: 'p', version: 'x', steps: [{ id: 'a', title: 'A', order: 0 }] }, s: { routine: '', steps: [{ id: 'a', title: 'A' }] }, t: { routine: 'p', steps: [] }, u: 3 })).toEqual({
      r: { routine: 'p', version: 'normal', steps: [{ id: 'a', title: 'A', order: 0, done: false }] }
    })
    expect(routineList(poranek(), 'worse').map((s) => s.id)).toEqual(['w'])
    // A routine without the worse version: the usual one.
    expect(routineList({ ...poranek(), worse: [] }, 'worse').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('ostatni krok kończy blok (D474)', () => {
  const four = (): Step[] => ['A', 'B'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))

  it('odhaczenie ostatniego nieodhaczonego kroku – `finished`; odznaczenie, krok już odhaczony, nie ostatni – nie', () => {
    const b = planBlock({ id: 'x', categoryId: 'inne', startMin: lm('09:00'), durationMin: 60, steps: four() })
    const first = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 's1', done: true, task: null }))
    expect(first.finished).toBeUndefined()
    const last = ok(tickEdits({ date: DAY, day: first.day, block: { ...b, steps: first.steps }, stepId: 's2', done: true, task: null }))
    expect(last.finished).toBe(true)
    expect(last.steps.every((s) => s.done)).toBe(true)
    // Ticked again (a second click before the view knew): nothing more.
    expect(ok(tickEdits({ date: DAY, day: last.day, block: { ...b, steps: last.steps }, stepId: 's2', done: true, task: null })).finished).toBeUndefined()
    expect(ok(tickEdits({ date: DAY, day: last.day, block: { ...b, steps: last.steps }, stepId: 's2', done: false, task: null })).finished).toBeUndefined()
    // A routine's list: the same rule (D474 – „rutyna, zadanie, każdy blok z krokami”).
    const r = rutyna({ origin: 'user' })
    let day: Raw | null = null
    const marks: Array<boolean | undefined> = []
    for (const id of ['a', 'b', 'c']) {
      const out: BlockStepsEdit = ok(tickEdits({ date: DAY, day, block: r, stepId: id, done: true, task: null, routines: [poranek()] }))
      marks.push(out.finished)
      day = out.day
    }
    expect(marks).toEqual([undefined, undefined, true])
  })

  const day = () => new Scenario({ date: DAY, plan: [planBlock({ id: 'a', categoryId: 'inne', startMin: lm('08:00'), durationMin: 120 }), planBlock({ id: 'b', categoryId: 'inne', startMin: lm('11:00'), durationMin: 60 })] }).observe('07:00', null)
  const click = (s: Scenario, time: string, act: TimerAction) => {
    const t = s.at(time)
    const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
    if (r.ok) s.write(r.events, t)
    return r
  }

  it('`stepsFinish`: biegnący blok kończy się teraz jako skończony (reguła `steps`); „Cofnij” – biegnie dalej', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:40', { a: 'stepsFinish', block: 'a' })
    expect(r).toMatchObject({ ok: true, events: [{ k: 'block.end', block: 'a', done: true, rule: STEPS_RULE, at: s.at('08:40') }] })
    expect(s.state('08:41').facts.blocks.get('a')).toMatchObject({ done: true, endRule: STEPS_RULE })
    expect(timerNow(s.state('08:41')).fg).toBeNull()
    // Over – nothing more; „Cofnij” opens it again, once.
    expect(click(s, '08:42', { a: 'stepsFinish', block: 'a' })).toMatchObject({ ok: false, code: 'alreadyOver' })
    expect(click(s, '08:45', { a: 'undoStepsFinish', block: 'a' }).ok).toBe(true)
    expect(timerNow(s.state('08:46')).fg?.info.id).toBe('a')
    expect(click(s, '08:47', { a: 'undoStepsFinish', block: 'a' })).toMatchObject({ ok: false })
  })

  it('odmowy, o których okno i pasek milczą, to te same słowa co odmowy timera (niezaczęty, skończony)', () => {
    expect([STEPS_QUIET.has(NOT_BEGUN), STEPS_QUIET.has(ALREADY_OVER)]).toEqual([true, true])
  })

  it('blok niezaczęty – nic (aplikacja nie zgaduje, kiedy biegł); zapauzowany – kończy się; „Cofnij” po starcie innego – odmowa', () => {
    const s = day()
    expect(click(s, '07:30', { a: 'stepsFinish', block: 'a' })).toMatchObject({ ok: false, code: 'notBegun' })
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:30', { a: 'pause' })
    expect(click(s, '08:35', { a: 'stepsFinish', block: 'a' })).toMatchObject({ ok: true, events: [{ k: 'block.end', block: 'a', done: true, rule: STEPS_RULE }] })
    const t = day()
    click(t, '08:00', { a: 'start', block: 'a' })
    expect(click(t, '08:30', { a: 'stepsFinish', block: 'a' }).ok).toBe(true)
    click(t, '08:35', { a: 'start', block: 'b' })
    expect(click(t, '08:36', { a: 'undoStepsFinish', block: 'a' })).toMatchObject({ ok: false, why: 'tego już nie cofniesz – po zakończeniu zaczął się inny blok, prośba albo „Odcinam się”' })
    // Another end of a block is not this one's to take back.
    const u = day()
    click(u, '08:00', { a: 'start', block: 'a' })
    click(u, '08:30', { a: 'finish', block: 'a' })
    expect(click(u, '08:31', { a: 'undoStepsFinish', block: 'a' })).toMatchObject({ ok: false })
  })
})

describe('pasek: linia kroku bloku rutyny (D473)', () => {
  it('blok rutyny na pierwszym planie – „☐ <krok rutyny> · krok n/N” z odhaczeniami dnia', () => {
    const b = rutyna({ origin: 'user', startMin: lm('09:00') })
    const s = new Scenario({ date: DAY, plan: [b] }).observe('08:00', null).start('r', '09:00')
    const t = s.at('09:10')
    const ctx = s.contextAt(t)
    const st = computeDay(ctx)
    const at = (dayFile: ReturnType<typeof dayFileFrom> | null, routines: Routine[] = [poranek()]) =>
      engineView({ ctx, state: st, energy: null, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, name: () => 'Poranek', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, timer: timerNow(st), routines, dayFile }).steps
    expect(at(null)).toEqual({ block: 'r', step: { id: 'a', title: 'Prysznic', n: 1 }, total: 3 })
    expect(at(dayFileFrom({ stepsDone: { r: { a: true } } }, DAY))).toEqual({ block: 'r', step: { id: 'b', title: 'Śniadanie', n: 2 }, total: 3 })
    // Without the routines (a version before) – no line, as before.
    expect(at(null, [])).toBeNull()
  })
})

describe('jedno odhaczenie: panel, karta i pasek (D479, T1108)', () => {
  /** The routine 07:00–07:35, begun by the plan (D139) – its card is due from 07:00. */
  const morning = () => new Scenario({ date: DAY, plan: [rutyna({ origin: 'user' })] }).observe('06:30', null)
  const dueAt = (s: Scenario, time: string, file: Raw | null, routines: Routine[] = [poranek()]) => {
    const t = s.at(time)
    return routinesDue(s.contextAt(t), s.stateAt(t), routines, file ? dayFileFrom(file, DAY) : null)
  }

  it('karta pokazuje listę dnia: wersję wybraną dla bloku i odhaczenia z panelu', () => {
    const s = morning()
    expect(dueAt(s, '07:05', null)[0]).toMatchObject({ version: 'normal', steps: [{ id: 'a', done: false }, { id: 'b', done: false }, { id: 'c', done: false }] })
    // A tick of the panel – the card's box too; the version picked in the panel (or the card) – the card's list.
    const ticked = ok(tickEdits({ date: DAY, day: null, block: rutyna({ origin: 'user' }), stepId: 'b', done: true, task: null, routines: [poranek()] })).day
    expect(dueAt(s, '07:05', ticked)[0]!.steps.map((x) => [x.id, x.done])).toEqual([['a', false], ['b', true], ['c', false]])
    const worse = ok(routineVersionEdits({ date: DAY, day: ticked, block: rutyna({ origin: 'user' }), version: 'worse', routines: [poranek()] })).day
    const w = dueAt(s, '07:05', worse)[0]!
    expect([w.version, w.steps.map((x) => x.id), w.worse.map((x) => x.id), w.normal.map((x) => x.id)]).toEqual(['worse', ['w'], ['w'], ['a', 'b', 'c']])
    // A block with steps of its own (D460: a copy) – its own list, no version to pick; of a task without steps – no card.
    const own: Step[] = [{ id: 'x', title: 'Własny', order: 0, done: true }]
    const ownDay = new Scenario({ date: DAY, plan: [rutyna({ origin: 'user', steps: own })] }).observe('06:30', null)
    expect(dueAt(ownDay, '07:05', null)[0]).toMatchObject({ version: 'normal', worse: [], steps: [{ id: 'x', done: true }], normal: [{ id: 'x', name: 'Własny' }] })
    expect(dueAt(new Scenario({ date: DAY, plan: [rutyna({ origin: 'user', task: 't1' })] }).observe('06:30', null), '07:05', null)).toEqual([])
  })

  it('zapis rutyny z karty albo paska: odhaczenia dnia stają się zapisanymi (po wybranej wersji); blok nie jest zapisany', () => {
    const b = rutyna({ origin: 'user' })
    const first = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 'a', done: true, task: null, routines: [poranek()] })).day
    // „Zapisz zaznaczone” with „b” only: „a” goes, „b” comes.
    const some = ok(routineSaveEdits({ date: DAY, day: first, block: b, version: 'normal', done: ['b'], task: null, routines: [poranek()] }))
    expect(dayFileFrom(some.day, DAY).stepsDone.r).toEqual(['b'])
    expect(some.finished).toBeUndefined()
    expect(paths(first, some.day).some((p) => p.startsWith('blocks'))).toBe(false)
    // „gorsze dni” of the bar: the version and every step of it – the list whole.
    const worse = ok(routineSaveEdits({ date: DAY, day: some.day, block: b, version: 'worse', done: ['w'], task: null, routines: [poranek()] }))
    expect(worse.finished).toBe(true)
    const file = dayFileFrom(worse.day, DAY)
    expect([file.routineSteps?.r?.version, file.stepsDone.r?.sort()]).toEqual(['worse', ['b', 'w']])
    // A list of the block's own: its own ticks, no version.
    const own = rutyna({ origin: 'user', steps: [{ id: 'x', title: 'X', order: 0, done: false }, { id: 'y', title: 'Y', order: 1, done: false }] })
    const all = ok(routineSaveEdits({ date: DAY, day: null, block: own, version: 'normal', done: ['x', 'y'], task: null, routines: [poranek()] }))
    expect([all.finished, dayFileFrom(all.day, DAY).routineSteps]).toEqual([true, {}])
  })

  it('pasek: „Kroki ▸” zaczyna od wersji i odhaczeń dnia (BarRoutine)', () => {
    const s = morning()
    const t = s.at('07:05')
    const ctx = s.contextAt(t)
    const st = computeDay(ctx)
    const view = (file: Raw) => engineView({ ctx, state: st, energy: null, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, name: () => 'Poranek', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, timer: timerNow(st), routines: [poranek()], dayFile: dayFileFrom(file, DAY) }).routines
    const worse = ok(routineVersionEdits({ date: DAY, day: null, block: rutyna({ origin: 'user' }), version: 'worse', routines: [poranek()] })).day
    expect(view(worse)).toEqual([expect.objectContaining({ block: 'r', version: 'worse', done: [], worse: [{ id: 'w', name: 'Leki', min: 5 }], normal: [{ id: 'a', name: 'Prysznic', min: 10 }, { id: 'b', name: 'Śniadanie', min: 20 }, { id: 'c', name: 'krok 3', min: 5 }] })])
    const ticked = ok(tickEdits({ date: DAY, day: worse, block: rutyna({ origin: 'user' }), stepId: 'w', done: true, task: null, routines: [poranek()] })).day
    expect(view(ticked)[0]!.done).toEqual(['w'])
  })
})
