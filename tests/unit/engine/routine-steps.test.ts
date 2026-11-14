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
import { blockStepsEdits, ROUTINE_VERSION_NONE, routineSaveEdits, routineVersionEdits, STEP_GONE, taskTickEdits, tickEdits, type BlockStepsEdit } from '@shared/engine/steps'
import { moveBetweenDays } from '@shared/engine/planEdit'
import { moveRoutineSteps, putBlock } from '@shared/data/dayEdits'
import { newTask } from '@shared/model/requests'
import type { TimerIn, TimerResult } from '@shared/api'
import { ALREADY_OVER, NOT_BEGUN, STEPS_RULE, timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { inverseEdit, recordEdit, setAt } from '@shared/data/merge'
import { engineView } from '@shared/engineView'
import { dayFileFrom, planBlock, templateFrom, type PlanBlock } from '@shared/model/plan'
import { ROUTINE_STEPS, routineList, routineStepsEntries, routineStepsOf, shownSteps } from '@shared/model/routineSteps'
import { listWhole, quietRefusal, routineSaved, undoAfterSteps } from '@shared/engine/stepsFlow'
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
    expect(paths(null, out.day)).toEqual(['schema', 'date', 'stepsDone.r.b', `${ROUTINE_STEPS}.r`])
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

  it('ciche odmowy mają kod (przegląd 15): niezaczęty, skończony, rutyna już zapisana, bez rutyny – `quietRefusal` po kodzie, nie po słowach', () => {
    const s = day()
    const r1 = click(s, '07:30', { a: 'stepsFinish', block: 'a' })
    const r2 = click(s, '07:31', { a: 'routineDone', block: 'a', version: 'normal', steps: ['x'] })
    expect([r1.ok ? null : r1.code, r2.ok ? null : r2.code]).toEqual(['notBegun', 'noRoutine'])
    expect(quietRefusal({ ok: false, why: 'cokolwiek', confirm: null, code: 'routineSaved' })).toBe(true)
    expect(quietRefusal({ ok: false, why: NOT_BEGUN, confirm: null })).toBe(false)
    expect(ALREADY_OVER).toBe('ten blok już się skończył')
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

  it('zapis rutyny z karty albo paska: zapisane kroki dochodzą do odhaczeń dnia (po wybranej wersji); blok nie jest zapisany', () => {
    const b = rutyna({ origin: 'user' })
    const first = ok(tickEdits({ date: DAY, day: null, block: b, stepId: 'a', done: true, task: null, routines: [poranek()] })).day
    // „Zapisz zaznaczone” with „b” only (a pick made before „a” was ticked elsewhere): „b” comes, „a” stays (T1112 – only added).
    const some = ok(routineSaveEdits({ date: DAY, day: first, block: b, version: 'normal', done: ['b'], task: null, routines: [poranek()] }))
    expect(dayFileFrom(some.day, DAY).stepsDone.r?.sort()).toEqual(['a', 'b'])
    expect(some.finished).toBeUndefined()
    expect(paths(first, some.day).some((p) => p.startsWith('blocks'))).toBe(false)
    // „gorsze dni” of the bar: the version and every step of it – the list whole.
    const worse = ok(routineSaveEdits({ date: DAY, day: some.day, block: b, version: 'worse', done: ['w'], task: null, routines: [poranek()] }))
    expect(worse.finished).toBe(true)
    const file = dayFileFrom(worse.day, DAY)
    expect([file.routineSteps?.r?.version, file.stepsDone.r?.sort()]).toEqual(['worse', ['a', 'b', 'w']])
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

describe('przegląd 1.22-A (uwagi 1–12)', () => {
  const b = () => rutyna({ origin: 'user' })
  const kept = (day: Raw | null = null) => ok(tickEdits({ date: DAY, day, block: b(), stepId: 'a', done: true, task: null, routines: [poranek()] })).day

  it('1: przeniesienie bloku na inny dzień zabiera listę rutyny dnia razem z odhaczeniami; dzień źródłowy jej nie ma', () => {
    const from = putBlock(kept(), b())
    const { source, target } = moveBetweenDays(from, null, b(), [b()], DAY, '2026-11-19')
    const to = dayFileFrom(target, '2026-11-19')
    expect([to.stepsDone.r, to.routineSteps?.r?.steps.map((s) => s.id)]).toEqual([['a'], ['a', 'b', 'c']])
    expect(ROUTINE_STEPS in source).toBe(false)
    // A routine changed meanwhile: the target shows the list the block kept, with its tick.
    expect(view(shownSteps(to.blocks[0]!, [poranek([{ id: 'z', name: 'Inny', min: 1 }])], to)).map((x) => [x[0], x[3]])).toEqual([['a', true], ['b', false], ['c', false]])
  })

  it('5: odhaczenia zawsze z pliku dnia – blok szablonu spoza pliku z nieaktualnym „done” okna nie daje fałszywego końca listy', () => {
    const steps: Step[] = [{ id: 's1', title: 'A', order: 0, done: true }, { id: 's2', title: 'B', order: 1, done: true }]
    const tpl = planBlock({ id: 'x', categoryId: 'inne', startMin: lm('09:00'), durationMin: 30, origin: 'template', steps })
    // The window thinks both ticked; the file has none: a tick of s1 does not make the list whole.
    const out = ok(tickEdits({ date: DAY, day: { schema: 1, date: DAY }, block: tpl, stepId: 's1', done: true, task: null }))
    expect([out.finished, out.steps.map((s) => s.done)]).toEqual([undefined, [true, false]])
    const save = ok(routineSaveEdits({ date: DAY, day: { schema: 1, date: DAY }, block: tpl, version: 'normal', done: ['s1'], task: null, routines: [] }))
    expect(save.finished).toBeUndefined()
  })

  it('6: „Kroki ▸” dostaje odhaczenia obu wersji (przełączenie wersji ich nie gubi)', () => {
    const s = new Scenario({ date: DAY, plan: [b()] }).observe('06:30', null)
    const t = s.at('07:05')
    const worse = ok(routineVersionEdits({ date: DAY, day: kept(), block: b(), version: 'worse', routines: [poranek()] })).day
    const both = ok(tickEdits({ date: DAY, day: worse, block: b(), stepId: 'w', done: true, task: null, routines: [poranek()] })).day
    expect(routinesDue(s.contextAt(t), s.stateAt(t), [poranek()], dayFileFrom(both, DAY))[0]!.ticked.sort()).toEqual(['a', 'w'])
  })

  it('7: lista „na gorsze dni” zatrzymana w dniu po tym, jak rutyna straciła tę wersję – wszędzie „na gorsze dni”, z powrotem do zwykłej', () => {
    const s = new Scenario({ date: DAY, plan: [b()] }).observe('06:30', null)
    const t = s.at('07:05')
    const worse = ok(routineVersionEdits({ date: DAY, day: null, block: b(), version: 'worse', routines: [poranek()] })).day
    const lost = { ...poranek(), worse: [] }
    const due = routinesDue(s.contextAt(t), s.stateAt(t), [lost], dayFileFrom(worse, DAY))[0]!
    expect([due.version, due.worse.map((x) => x.id), due.steps.map((x) => x.id)]).toEqual(['worse', ['w'], ['w']])
    // „✓ Wszystkie” of the bar on that list: the kept list, no switch; „zwykła” goes back.
    const all = ok(routineSaveEdits({ date: DAY, day: worse, block: b(), version: 'worse', done: ['w'], task: null, routines: [lost] }))
    expect([all.finished, dayFileFrom(all.day, DAY).routineSteps?.r?.version]).toEqual([true, 'worse'])
    expect(dayFileFrom(ok(routineVersionEdits({ date: DAY, day: worse, block: b(), version: 'normal', routines: [lost] })).day, DAY).routineSteps?.r?.version).toBe('normal')
  })

  it('10: pierwszy zapis listy rutyny to wpis bloku (ENTRY_MAPS, T1123) – dwa komputery na dwóch blokach nie spotykają się w pytaniu', () => {
    const after = { schema: 1, date: DAY, [ROUTINE_STEPS]: (kept() as Record<string, unknown>)[ROUTINE_STEPS] }
    const e = recordEdit('days/2026/2026-11-18.json', { schema: 1, date: DAY }, after)!
    expect(e.edits.map((x) => x.path.join('.'))).toEqual([`${ROUTINE_STEPS}.r`])
  })

  describe('wspólna sekwencja końca listy (uwagi 3, 8, 11, 12 – `stepsFlow`)', () => {
    const timer = (refuse: Record<string, Partial<TimerResult>> = {}) => {
      const calls: TimerIn[] = []
      const fn = async (c: TimerIn): Promise<TimerResult> => {
        calls.push(c)
        return refuse[c.a] ? { ok: false, why: 'odmowa', confirm: null, ...refuse[c.a] } : { ok: true, why: null, confirm: null }
      }
      return { calls, fn }
    }

    it('11: zapis rutyny z ponad 40 krokami – `routine.done` z najwyżej 40 id (walidacja zdarzenia)', async () => {
      const t = timer()
      await listWhole(t.fn, DAY, 'r', { version: 'normal', steps: Array.from({ length: 45 }, (_, i) => `k${i}`) })
      expect(t.calls.map((c) => [c.a, c.steps?.length ?? null])).toEqual([['routineDone', 40], ['stepsFinish', null]])
    })

    it('3: odhaczenia nie zapisały się (konflikt) – bloku nie kończy', async () => {
      const t = timer()
      const r = await routineSaved(t.fn, DAY, 'r', { version: 'normal', steps: ['a'] }, async () => ({ ok: false, finished: true }))
      expect([r.saved, r.ended, t.calls.map((c) => c.a)]).toEqual([true, false, ['routineDone']])
    })

    it('8: „Cofnij” – odmowa cofnięcia końca zostawia zapis rutyny i odhaczenia (D482)', async () => {
      const t = timer({ undoStepsFinish: { why: 'tego już nie cofniesz' } })
      let ticks = 0
      const why = await undoAfterSteps(t.fn, { day: DAY, block: 'r', end: true, routine: true, ticks: async () => void ticks++ })
      expect([why, t.calls.map((c) => c.a), ticks]).toEqual(['tego już nie cofniesz', ['undoStepsFinish'], 0])
      const ok2 = timer()
      expect(await undoAfterSteps(ok2.fn, { day: DAY, block: 'r', end: true, routine: true, ticks: async () => void ticks++ })).toBeNull()
      expect([ok2.calls.map((c) => c.a), ticks]).toEqual([['undoStepsFinish', 'routineUndo'], 1])
    })

    it('ciche odmowy (już zapisana, niezaczęty) nie są mówione; inne – tak', async () => {
      const t = timer({ routineDone: { code: 'routineSaved' }, stepsFinish: { code: 'notBegun' } })
      expect(await listWhole(t.fn, DAY, 'r', { version: 'normal', steps: ['a'] })).toEqual({ saved: false, ended: false, said: [] })
      const loud = timer({ stepsFinish: { why: 'coś innego' } })
      expect((await listWhole(loud.fn, DAY, 'r', null)).said).toEqual(['coś innego'])
    })
  })

  it('12: „Sprawy” – odhaczenie ostatniego kroku zadania mówi, że lista jego bloku dziś jest cała (blok się kończy)', () => {
    const steps = [{ id: 's1', title: 'A', order: 0 }, { id: 's2', title: 'B', order: 1 }]
    const record = { ...newTask('t1', Date.parse('2026-11-18T08:00:00Z'), DAY, { title: 'Raport' })!, day: DAY, block: 'tb', state: 'planned', steps, stepsDone: { s1: true } }
    const day = { schema: 1, date: DAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', task: 't1', steps }], stepsDone: { tb: { s1: true } } }
    const out = ok(taskTickEdits({ record, stepId: 's2', done: true, date: DAY, day, today: DAY }))
    expect(out.block).toMatchObject({ id: 'tb', finished: true })
    // Not the last one, or taken back – no end.
    expect(ok(taskTickEdits({ record, stepId: 's1', done: false, date: DAY, day, today: DAY })).block?.finished).toBe(false)
  })
})

describe('przegląd 1.22-A, runda 2', () => {
  const b = () => rutyna({ origin: 'user' })
  const kept = (day: Raw | null = null) => ok(tickEdits({ date: DAY, day, block: b(), stepId: 'a', done: true, task: null, routines: [poranek()] })).day

  describe('1+7: jawność końca zapisuje silnik (D484, T1121)', () => {
    const fixedDay = () =>
      new Scenario({ date: DAY, plan: [planBlock({ id: 'w', categoryId: 'inne', startMin: lm('08:00'), durationMin: 60, fixed: true }), planBlock({ id: 'n', categoryId: 'inne', startMin: lm('12:00'), durationMin: 30 })] }).observe('07:00', null)
    const click = (s: Scenario, time: string, act: TimerAction) => {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (!r.ok) throw new Error(r.why)
      s.write(r.events, t)
      return r.events
    }

    it('„Dalej” i „Koniec pracy” na bloku stałym – `fin` w zdarzeniu i `finished` w faktach; „Dalej” jako niezrobiony – bez', () => {
      const s = fixedDay()
      click(s, '08:00', { a: 'start', block: 'w' })
      expect(click(s, '08:30', { a: 'next', confirm: true })[0]).toMatchObject({ k: 'block.end', block: 'w', done: null, rule: null, fin: true })
      expect(s.state('08:31').facts.blocks.get('w')).toMatchObject({ finished: true })
      const t = fixedDay()
      click(t, '08:00', { a: 'start', block: 'w' })
      expect(click(t, '08:20', { a: 'workEnd' }).find((e) => e.k === 'block.end')).toMatchObject({ block: 'w', fin: true })
      const u = new Scenario({ date: DAY, plan: [planBlock({ id: 'x', categoryId: 'inne', startMin: lm('08:00'), durationMin: 60 })] }).observe('07:00', null)
      click(u, '08:00', { a: 'start', block: 'x' })
      click(u, '08:10', { a: 'next', done: false })
      expect(u.state('08:11').facts.blocks.get('x')).toMatchObject({ done: false, finished: false })
    })

    it('stare zdarzenia (bez `fin`): koniec bez reguły i bez `done` (klik w bloku stałym) – jawny; koniec z nieobecności, bezczynności, zamknięcia – nie', () => {
      const ends: Array<[Record<string, unknown>, boolean]> = [
        [{ done: null, rule: null }, true],
        [{ done: true, rule: null }, true],
        [{ done: null, rule: 'plan' }, true],
        [{ done: null, rule: 'awayPlan' }, true],
        [{ done: null, rule: 'idle' }, false],
        [{ done: null, rule: 'shutdown' }, false],
        [{ done: null, rule: 'absence' }, false],
        [{ done: false, rule: 'park' }, false],
        // A newer end says it itself.
        [{ done: null, rule: 'firstUse', fin: true }, true],
        [{ done: true, rule: null, fin: false }, false]
      ]
      for (const [end, finished] of ends) {
        const s = new Scenario({ date: DAY, plan: [planBlock({ id: 'x', categoryId: 'inne', startMin: lm('08:00'), durationMin: 60 })] }).observe('07:00', null)
        s.start('x', '08:00').write([{ k: 'block.end', block: 'x', at: s.at('08:20'), ...end }], s.at('08:20'))
        expect([end, s.state('08:30').facts.blocks.get('x')!.finished]).toEqual([end, finished])
      }
    })
  })

  it('3, 11: wpis listy rutyny w edycji – cały wpis bloku (ścieżka 2); cofnięcie pierwszego zapisu nie zostawia pustego wpisu', () => {
    const first = kept()
    const e = recordEdit('days/2026/2026-11-18.json', { schema: 1, date: DAY }, first)!
    expect(e.edits.filter((x) => x.path[0] === ROUTINE_STEPS).map((x) => x.path.join('.'))).toEqual([`${ROUTINE_STEPS}.r`])
    // A change of the version: one edit of the entry (the version and its list together).
    const worse = ok(routineVersionEdits({ date: DAY, day: first, block: b(), version: 'worse', routines: [poranek()] })).day
    expect(recordEdit('days/2026/2026-11-18.json', first, worse)!.edits.map((x) => x.path.join('.'))).toEqual([`${ROUTINE_STEPS}.r`])
    // Taken back: the entry goes whole – no `{}` of it is left.
    let back: unknown = first
    for (const x of inverseEdit(e, first, first)?.edits ?? []) if (x.path[0] === ROUTINE_STEPS) back = setAt(back, x.path, x.value)
    expect(((back as Raw)[ROUTINE_STEPS] as Raw | undefined)?.r).toBeUndefined()
    // An empty entry is no list to move along.
    const target = moveRoutineSteps({ [ROUTINE_STEPS]: { r: {} } }, { schema: 1, date: DAY }, 'r')
    expect(ROUTINE_STEPS in target).toBe(false)
  })

  it('4, 14: zapis rutyny już zapisanej albo bez rutyny – cicho; wynik bez pola `ticks`', async () => {
    const timer = (code: TimerResult['code']) => async (): Promise<TimerResult> => ({ ok: false, why: 'odmowa', confirm: null, code })
    const r1 = await routineSaved(timer('routineSaved'), DAY, 'r', { version: 'normal', steps: ['a'] }, async () => ({ ok: true, finished: true }))
    const r2 = await routineSaved(timer('noRoutine'), DAY, 'r', { version: 'normal', steps: ['a'] }, async () => ({ ok: true, finished: true }))
    expect([r1.said, r2.said, r1.saved]).toEqual([[], [], false])
    expect('ticks' in r1).toBe(false)
    const loud = await routineSaved(async () => ({ ok: false, why: 'zaznacz co najmniej jeden krok', confirm: null }), DAY, 'r', { version: 'normal', steps: ['a'] }, async () => ({ ok: true, finished: true }))
    expect(loud.said).toEqual(['zaznacz co najmniej jeden krok'])
  })

  it('5: zapis to różnica od otwarcia – krok odznaczony jawnie schodzi, odhaczony gdzie indziej zostaje; blok kończy się tylko przy całej liście', () => {
    // At the opening: „a” ticked. Meanwhile „c” ticked elsewhere. The save: „a” taken off, „b” ticked.
    const day = ok(tickEdits({ date: DAY, day: kept(), block: b(), stepId: 'c', done: true, task: null, routines: [poranek()] })).day
    const out = ok(routineSaveEdits({ date: DAY, day, block: b(), version: 'normal', done: ['b'], undone: ['a'], task: null, routines: [poranek()] }))
    expect(dayFileFrom(out.day, DAY).stepsDone.r?.sort()).toEqual(['b', 'c'])
    expect([out.finished, out.steps.filter((s) => s.done).length, out.steps.length]).toEqual([undefined, 2, 3])
  })
})
