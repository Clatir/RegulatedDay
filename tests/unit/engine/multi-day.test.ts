/**
 * SNT1 część A (D417, D418) – logika widoków wielodniowych bez ekranów: które bloki da się przeciągnąć między kolumnami
 * (reguła „Dziś”, D305 – `movableBlock`), tylko dziś i dni przyszłe; przeniesienie z nową godziną (`moveBetweenDays`);
 * krzywa energii każdej kolumny tym samym silnikiem co „Dziś” (miniony z logu, dziś na żywo, przyszły z planu od
 * przyjętego check-inu – T903); „3 dni”, „Agenda”, komórka miesiąca (bloki stałe i całodniowe, „+N”, obciążenie – T904–T906).
 */
import { describe, expect, it } from 'vitest'
import { blockInfos, movableBlock } from '@shared/engine/blocks'
import { agendaOf, LOAD_HIGH_PCT, LOAD_MID_PCT, loadLevel, mayMoveBetween, monthCell, monthBlockOf, monthDates, monthDayOf, type MonthDay } from '@shared/engine/calendarViews'
import { dayPlan } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { ASSUMED_CHECKIN, ENERGY_SAMPLE_MIN, energyTrack } from '@shared/engine/energyTrack'
import { foldFacts } from '@shared/engine/facts'
import { gridOf, idxOfLogical } from '@shared/engine/grid'
import { moveBetweenDays, moveGroup, moveRoots, stayerStart, stayHowOf, stayRuleOf } from '@shared/engine/planEdit'
import { applyVariant, planWith, variantCauses, variantsFor } from '@shared/engine/variants'
import { agendaDates, daysViewOf, horizonDay, threeDays, unknownDay, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { dayFileFrom, layerKept, planBlockFrom, type PlanBlock } from '@shared/model/plan'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { dayEnd, placeLogical } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const TODAY = '2026-11-04'
const PAST = '2026-11-03'
const FUT = '2026-11-05'
/** The window's clock: today at noon (a day to come is counted before it begins). */
const NOW = placeLogical(TODAY, 12 * 60)

const futureDay = (plan = [block({ id: 'a', cat: 'inne', at: '09:00', min: 180, origin: 'user' })]) => new Scenario({ date: FUT, plan, settings: { transitionBufferMin: 0 } })
const byId = (d: HorizonDay) => Object.fromEntries(d.blocks.map((b) => [b.id, b]))

describe('D417 – które bloki przeciągasz między kolumnami (reguła „Dziś”, D305)', () => {
  it('dzień przyszły: blok z własną godziną tak (także wieczorna sesja szablonu, D467); sesja warstwy, wykład, zajęcia zjazdu i zakotwiczony – nie', () => {
    const s = futureDay([
      block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' }),
      block({ id: 'tpl', cat: 'analiza', at: '12:00', min: 60 }),
      block({ id: 'meet', cat: 'inne', at: '13:00', min: 60, fixed: true, origin: 'user' }),
      block({ id: 'lon', cat: 'sesja', at: '08:00', min: 60, fixed: true, origin: 'session', source: 'londyn' }),
      block({ id: 'w', cat: 'wyklad', at: '18:00', min: 90, fixed: true, origin: 'lecture' }),
      block({ id: 'z', cat: 'dojazd', at: '15:00', min: 60, fixed: true, origin: 'zjazd' }),
      planBlockFrom({ id: 'ds', categoryId: 'sesja', startMin: lm('20:00'), durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' })!,
      block({ id: 'after', cat: 'inne', after: 'a', min: 30, origin: 'user' })
    ])
    const by = byId(horizonDay(s.contextAt(NOW), 'future'))
    expect(Object.entries(by).map(([id, b]) => [id, b.movable === true])).toEqual(
      expect.arrayContaining([
        ['a', true],
        ['tpl', true],
        ['meet', true],
        ['lon', false],
        ['w', false],
        ['z', false],
        ['ds', true],
        ['after', false]
      ])
    )
    // Fixed and sessions are told apart (the month shows the fixed ones without the sessions – T905).
    expect([by.meet!.fixed, by.meet!.session, by.lon!.fixed, by.lon!.session, by.ds!.session, by.a!.fixed]).toEqual([true, undefined, true, true, true, undefined])
  })

  it('dziś: zaczęty i miniony (koniec przed teraz) – nie; ten, który dopiero będzie – tak', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'r', cat: 'inne', at: '09:00', min: 60, origin: 'user' }), block({ id: 'gone', cat: 'inne', at: '10:00', min: 30, origin: 'user' }), block({ id: 'next', cat: 'inne', at: '15:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '12:00').start('r', '09:00')
    const by = byId(horizonDay(s.contextAt(NOW), 'today'))
    expect([by.r!.movable, by.next!.movable]).toEqual([undefined, true])
    // Not begun, its place in the forecast before now? The forecast puts a due block at now – it stays movable; one that
    // ended before now on the axis is not.
    const ctx = s.contextAt(NOW)
    const state = computeDay(ctx)
    const info = state.blocks.find((b) => b.id === 'next')!
    expect(movableBlock(info, undefined, state.now, state.now)).toBe(false)
    expect(movableBlock(info, undefined, state.now + 1, state.now)).toBe(true)
    expect(movableBlock(info, { startedAt: 0, parkedAt: null, cancelledAt: null }, state.now + 60, state.now)).toBe(false)
    expect(movableBlock(info, { startedAt: null, parkedAt: 5, cancelledAt: null }, state.now + 60, null)).toBe(false)
  })

  it('dzień miniony: żaden blok (dni minione bez zmian)', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })] })
    s.presence('07:30').using('07:30', '21:00')
    expect(horizonDay(s.contextAt(dayEnd(PAST) + 3_600_000), 'past').blocks.every((b) => b.movable == null)).toBe(true)
  })

  it('tylko dziś i dni przyszłe – źródło i cel', () => {
    expect(mayMoveBetween(TODAY, FUT, TODAY)).toBe(true)
    expect(mayMoveBetween(FUT, TODAY, TODAY)).toBe(true)
    expect(mayMoveBetween(FUT, FUT, TODAY)).toBe(true)
    expect(mayMoveBetween(PAST, FUT, TODAY)).toBe(false)
    expect(mayMoveBetween(TODAY, PAST, TODAY)).toBe(false)
    // Without a known today nothing is moved.
    expect(mayMoveBetween(FUT, FUT, '')).toBe(false)
  })
})

describe('D417 – przeniesienie na inny dzień z godziną upuszczenia', () => {
  it('blok szablonu: na celu Twój, z nową godziną, licznikiem i dniem, z którego przyszedł; źródło – movedTo', () => {
    const t = block({ id: 't1', cat: 'analiza', at: '09:00', min: 60 })
    const { source, target } = moveBetweenDays(null, null, t, [t], FUT, '2026-11-06', true, { startMin: lm('14:30') })
    expect(source.movedTo).toEqual({ t1: '2026-11-06' })
    const moved = dayFileFrom(target, '2026-11-06').blocks.find((b) => b.id === 't1')
    expect(moved).toMatchObject({ startMin: lm('14:30'), origin: 'user', moves: 1, movedFrom: FUT })
    // Without the start: its planned time, as „Przenieś na…”.
    expect(dayFileFrom(moveBetweenDays(null, null, t, [t], FUT, '2026-11-06').target, '2026-11-06').blocks[0]!.startMin).toBe(lm('09:00'))
  })

  it('blok z pliku źródła idzie cały – pola nieznane tej wersji zostają (T901)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const fromRaw = { schema: 1, date: FUT, blocks: [{ ...x, note: 'n', newer: { kept: true } }] }
    const { target } = moveBetweenDays(fromRaw, null, { ...x, note: 'n' }, [x], FUT, '2026-11-06', true, { startMin: lm('10:00') })
    expect((target.blocks as Array<Record<string, unknown>>)[0]).toMatchObject({ id: 'x', note: 'n', newer: { kept: true }, startMin: lm('10:00'), moves: 1, movedFrom: FUT })
  })

  it('wystąpienie serii zostaje wystąpieniem („Tylko to”, movedTo); odhaczone kroki idą z blokiem', () => {
    const occ = { ...block({ id: 'o1', cat: 'inne', at: '09:00', min: 60, origin: 'series', source: 'ser' }), steps: [{ id: 's1', title: 'a', order: 0, done: false }] }
    const fromRaw = { schema: 1, date: FUT, stepsDone: { o1: { s1: true } } }
    const { source, target } = moveBetweenDays(fromRaw, null, occ, [occ], FUT, '2026-11-06', true, { startMin: lm('16:00') })
    expect(source.movedTo).toEqual({ o1: '2026-11-06' })
    expect((source.stepsDone as Record<string, unknown>).o1).toBeUndefined()
    const file = dayFileFrom(target, '2026-11-06')
    expect(file.blocks[0]).toMatchObject({ id: 'o1', origin: 'series', sourceId: 'ser', startMin: lm('16:00') })
    expect(file.stepsDone).toEqual({ o1: ['s1'] })
  })

  it('bloki zakotwiczone do przenoszonego (wprost i dalej) idą z nim i zostają zakotwiczone – każda droga przeniesienia (D424, T951)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const z = block({ id: 'z', cat: 'inne', after: 'y', min: 15 })
    const other = block({ id: 'o', cat: 'inne', at: '13:00', min: 30, origin: 'user' })
    const plan = [x, y, z, other]
    expect(moveGroup(plan, 'x')).toEqual({ followers: [y, z], stayers: [] })
    expect(moveGroup(plan, 'o')).toEqual({ followers: [], stayers: [] })
    const fromRaw = { schema: 1, date: FUT, blocks: [x, y, other].map((b) => ({ ...b })) }
    // Nothing but the block given: `moveBetweenDays` itself takes what is anchored to it („Przenieś na…”, a variant too).
    const { source, target } = moveBetweenDays(fromRaw, null, x, plan, FUT, '2026-11-06', true, { startMin: lm('15:00') })
    // Gone from the source together (one of yours out of its blocks, the template's – by `movedTo`); the other stays.
    expect(source.movedTo).toEqual({ x: '2026-11-06', y: '2026-11-06', z: '2026-11-06' })
    expect(dayFileFrom(source, FUT).blocks.map((b) => b.id)).toEqual(['o'])
    const there = dayFileFrom(target, '2026-11-06').blocks
    expect(there.map((b) => [b.id, b.startMin, b.anchor, b.movedFrom, b.moves, b.origin])).toEqual([
      ['x', lm('15:00'), null, FUT, 1, 'user'],
      ['y', null, 'x', FUT, 1, 'user'],
      ['z', null, 'y', FUT, 1, 'user']
    ])
    // On the target day they follow it, as on its own day.
    const snap = { ...new Scenario({ date: '2026-11-06', plan: [] }).snapshot }
    expect(dayPlan(snap, dayFileFrom(target, '2026-11-06')).map((b) => b.id)).toEqual(['x', 'y', 'z'])
  })

  it('wariant „na jutro” bierze zakotwiczone niezaczęte; zaczęty zostaje dziś (D424)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '13:00', min: 60, origin: 'user' })
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const v = { id: 't', label: '', effect: { workEndMin: null, extensionMin: 0, regenMin: 0, withinBoundary: true }, changes: [{ k: 'tomorrow' as const, block: 'x' }] }
    const s = new Scenario({ date: TODAY, plan: [x, y] })
    const raw = { schema: 1, date: TODAY, blocks: [x, y].map((b) => ({ ...b })) }
    // The facts of the day as the caller counted it (T966 – no second fold of the log).
    const facts = () => computeDay(s.contextAt(NOW)).facts
    const along = applyVariant(s.contextAt(NOW), raw, null, v, FUT, facts())
    // The whole group is marked as moved by a variant (T963 – no note for accuracy for any of them).
    expect(dayFileFrom(along.tomorrow!, FUT).blocks.map((b) => [b.id, b.anchor, b.byVariant])).toEqual([
      ['x', null, true],
      ['y', 'x', true]
    ])
    s.presence('07:30').start('y', '11:00')
    const kept = applyVariant(s.contextAt(NOW), raw, null, v, FUT, facts())
    expect(dayFileFrom(kept.tomorrow!, FUT).blocks.map((b) => b.id)).toEqual(['x'])
    expect(dayFileFrom(kept.today, TODAY).blocks.map((b) => [b.id, b.anchor, b.startMin])).toEqual([['y', null, lm('14:00')]])
  })

  it('wariant z blokiem i jego zakotwiczonym jako dwiema zmianami: zakotwiczony to nie osobny ruch (T962)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '13:00', min: 60, origin: 'user' })
    const y = { ...block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' }), steps: [{ id: 's1', title: 'a', order: 0, done: false }] }
    const s = new Scenario({ date: TODAY, plan: [x, y] })
    const raw = { schema: 1, date: TODAY, blocks: [x, y].map((b) => ({ ...b })), stepsDone: { y: { s1: true } } }
    // The candidates of a variant: the roots only – a block anchored to another one moved goes as its follower.
    expect(moveRoots([x, y], ['y', 'x'])).toEqual(['x'])
    for (const order of [['x', 'y'], ['y', 'x']]) {
      const v = { id: 't', label: '', effect: { workEndMin: null, extensionMin: 0, regenMin: 0, withinBoundary: true }, changes: order.map((block) => ({ k: 'tomorrow' as const, block })) }
      const r = applyVariant(s.contextAt(NOW), raw, null, v, FUT, computeDay(s.contextAt(NOW)).facts)
      const file = dayFileFrom(r.tomorrow!, FUT)
      expect(file.blocks.map((b) => [b.id, b.anchor, b.byVariant])).toEqual([
        ['x', null, true],
        ['y', 'x', true]
      ])
      expect(file.stepsDone).toEqual({ y: ['s1'] })
    }
  })

  it('ocena wariantu = zapis: z planu schodzi blok i cała grupa (także pośrednio zakotwiczone), zostający – bez kotwicy (T962)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '13:00', min: 60, origin: 'user' })
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const z = block({ id: 'z', cat: 'inne', after: 'y', min: 15, origin: 'user' })
    const s = new Scenario({ date: TODAY, plan: [x, y, z] })
    expect(planWith(s.contextAt(NOW), [{ k: 'tomorrow', block: 'x' }], stayRuleOf(computeDay(s.contextAt(NOW)).facts, DEFAULT_SETTINGS)).map((b) => b.id)).toEqual([])
    s.presence('07:30').start('y', '11:00')
    const ctx = s.contextAt(NOW)
    expect(planWith(ctx, [{ k: 'tomorrow', block: 'x' }], stayRuleOf(computeDay(ctx).facts, DEFAULT_SETTINGS)).map((b) => [b.id, b.anchor, b.startMin])).toEqual([
      ['y', null, lm('14:00')],
      ['z', 'y', null]
    ])
  })

  it('etykieta wariantu liczy bloki, które faktycznie jadą (z zakotwiczonymi); pierwsza nazwa – korzeń (T985)', () => {
    const DATE = '2026-10-28'
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'b', cat: 'analiza', at: '10:00', min: 120 }), block({ id: 'c', cat: 'inne', after: 'b', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('12:15', '07:30')
    s.start('a', '08:00').end('a', '10:45').request('r1', '08:30', '09:15', 'urgent')
    s.events.filter((e) => (e as { k?: string }).k?.startsWith('request.')).forEach((e) => ((e as { t: number }).t = s.at('10:45')))
    const st = s.state('10:46')
    const cause = variantCauses(st, null).at(-1)!
    const v = variantsFor(s.contextAt(s.at('10:46')), st, cause, (b) => ({ analiza: 'Analiza', inne: 'Inne' })[b.categoryId] ?? b.categoryId)
    const away = v.find((x) => x.id === 'tomorrow')!
    expect(away.changes).toEqual([{ k: 'tomorrow', block: 'b' }])
    expect(away.label).toMatch(/^Przesuń Analiza i 1 inne na jutro/)
  })

  it('zostający w ocenie wariantu stoi tam, gdzie postawi go zapis – w dobie logicznej, bez godziny: 09:00 (T984)', () => {
    const x = { ...block({ id: 'x', cat: 'inne', at: '13:00', min: 60, origin: 'user' }), startMin: null }
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const ctx = { ...new Scenario({ date: TODAY, plan: [x, y] }).contextAt(NOW), plan: [x, y] }
    const left = planWith(ctx, [{ k: 'tomorrow', block: 'x' }], { ids: new Set(['y']), categories: {} })
    expect(left.map((b) => [b.id, b.anchor, b.startMin])).toEqual([['y', null, 9 * 60]])
    expect(left[0]!.startMin).toBe(stayerStart(y, [x, y]))
  })

  it('zostają też sesja własna (kategoria rodzaju sesja), „nie przenosić na jutro” i chronione (D426, T980); analiza z dawnym oznaczeniem jedzie (D467)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const after = (id: string, cat: string, o: Partial<PlanBlock> = {}) => ({ ...block({ id, cat, after: 'x', min: 15, origin: 'user' }), ...o })
    const plan = [x, after('go', 'inne'), after('own', 'sesja'), planBlockFrom({ id: 'wa', categoryId: 'analiza', anchor: 'x', durationMin: 15, origin: 'user', tag: 'weeklyAnalysis', waitUntilMin: lm('15:00') })!, after('meal', 'posilek'), after('rut', 'rutyny'), after('reg', 'regeneracja')]
    const g = moveGroup(plan, 'x', stayRuleOf(null, DEFAULT_SETTINGS))
    expect(g.followers.map((b) => b.id)).toEqual(['go', 'wa'])
    expect(g.stayers.map((b) => b.id)).toEqual(['own', 'meal', 'rut', 'reg'])
    // The same rule for the series (one predicate of the layers' blocks).
    expect(layerKept(after('s', 'sesja', { origin: 'session' }))).toBe(true)
    expect(layerKept(after('own2', 'sesja'))).toBe(false)
  })

  it('zostają też zaparkowany, odwołany i nieprzenośny (sesja, wykład, zjazd) – jadą tylko niezaczęte, aktywne, przenośne (T961); blok z dawnym oznaczeniem drugiej zmiany jedzie (D467)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const after = (id: string, o: Partial<PlanBlock> = {}) => ({ ...block({ id, cat: 'inne', after: 'x', min: 15, origin: 'user' }), ...o })
    const plan = [x, after('go'), after('park'), after('off'), after('ses', { origin: 'session', categoryId: 'sesja' }), after('lec', { origin: 'lecture' }), after('zj', { origin: 'zjazd' }), planBlockFrom({ id: 'ds', categoryId: 'inne', anchor: 'x', durationMin: 15, origin: 'user', tag: 'secondShift' })!]
    const s = new Scenario({ date: TODAY, plan })
    s.presence('07:30').raw({ k: 'block.park', block: 'park', at: s.at('08:00') }, '08:00').raw({ k: 'block.cancel', block: 'off', at: s.at('08:01') }, '08:01')
    const facts = computeDay(s.contextAt(NOW)).facts
    expect([facts.blocks.get('park')?.parkedAt != null, facts.blocks.get('off')?.cancelledAt != null]).toEqual([true, true])
    const g = moveGroup(plan, 'x', stayRuleOf(facts, DEFAULT_SETTINGS))
    expect(g.followers.map((b) => b.id)).toEqual(['go', 'ds'])
    expect(g.stayers.map((b) => b.id)).toEqual(['park', 'off', 'ses', 'lec', 'zj'])
    expect(g.stayers.map((b) => stayHowOf(facts.blocks.get(b.id)))).toEqual(['parked', 'cancelled', 'kept', 'kept', 'kept'])
  })

  it('zaczęty zakotwiczony zostaje w swoim dniu z własną godziną (bez kotwicy), a to, co za nim – z nim (D424)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const z = block({ id: 'z', cat: 'inne', after: 'y', min: 15, origin: 'user' })
    const w = block({ id: 'w', cat: 'inne', after: 'x', min: 20, origin: 'user' })
    const plan = [x, y, z, w]
    expect(moveGroup(plan, 'x', { ids: new Set(['y']), categories: {} })).toEqual({ followers: [w], stayers: [y] })
    const fromRaw = { schema: 1, date: FUT, blocks: plan.map((b) => ({ ...b })) }
    const two = moveBetweenDays(fromRaw, null, x, plan, FUT, '2026-11-06', true, { startMin: lm('15:00'), stay: { ids: new Set(['y']), categories: {} } })
    expect(two.stayers.map((b) => b.id)).toEqual(['y'])
    // y keeps its place: 10:00, after x as planned; z stays anchored to y.
    expect(dayFileFrom(two.source, FUT).blocks.map((b) => [b.id, b.startMin, b.anchor])).toEqual([
      ['y', lm('10:00'), null],
      ['z', null, 'y']
    ])
    expect(two.source.movedTo).toEqual({ x: '2026-11-06', w: '2026-11-06' })
    expect(dayFileFrom(two.target, '2026-11-06').blocks.map((b) => [b.id, b.anchor])).toEqual([
      ['x', null],
      ['w', 'x']
    ])
  })
})

describe('D417 – krzywa energii kolumny tym samym silnikiem co „Dziś”', () => {
  const sampleAt = (d: HorizonDay, min: number) => d.energy!.samples.find((x) => x.at === min)!

  it('dziś po check-inie: te same próbki co oś „Dziś” (przeszłość z logu, od teraz prognoza)', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 120, origin: 'user' }), block({ id: 'b', cat: 'analiza', at: '14:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '12:00').checkin('07:40', { head: [1, 1], emotions: [1, 0], senses: [0, 0] }).ran('a', '09:00', '11:00')
    const ctx = s.contextAt(NOW)
    const d = horizonDay(ctx, 'today')
    const state = computeDay(ctx)
    const e = computeEnergy(ctx, state)
    expect(d.energy).toEqual(energyTrack(TODAY, state.grid, e))
    expect(d.energy!.assumed).toBeUndefined()
    // Every 10 minutes from the check-in's sample on: 07:40 – 65 / 85 / 100.
    expect(sampleAt(d, lm('07:40'))).toEqual({ at: lm('07:40'), head: 65, emotions: 85, senses: 100 })
    expect(d.energy!.samples[1]!.at - d.energy!.samples[0]!.at).toBe(ENERGY_SAMPLE_MIN)
    // The forecast after now: the analysis at 14:00 costs.
    expect(sampleAt(d, lm('15:00')).head).toBeLessThan(sampleAt(d, lm('14:00')).head)
  })

  it('dziś bez check-inu – brak krzywej (energia „nieznana”, jak w „Dziś”); moduł wyłączony – brak', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'a', cat: 'inne', at: '13:00', min: 60, origin: 'user' })] })
    s.presence('07:30').using('07:30', '12:00')
    expect(horizonDay(s.contextAt(NOW), 'today').energy).toBeNull()
    s.checkin('07:40', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    expect(horizonDay(s.contextAt(NOW), 'today').energy).not.toBeNull()
    expect(horizonDay(s.contextAt(NOW), 'today', null, { moduleOn: false }).energy).toBeNull()
  })

  it('dzień miniony: z logu jak historia; bez check-inu – brak krzywej', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '21:00').ran('a', '09:00', '10:00')
    const at = dayEnd(PAST) + 3_600_000
    expect(horizonDay(s.contextAt(at), 'past').energy).toBeNull()
    s.checkin('07:40', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const d = horizonDay(s.contextAt(at), 'past')
    const counted = { ...s.contextAt(at), now: Math.max(at, dayEnd(PAST)), asWritten: true }
    const state = computeDay(counted)
    expect(d.energy).toEqual(energyTrack(PAST, state.grid, computeEnergy(counted, state)))
    expect(d.energy!.assumed).toBeUndefined()
  })

  it('dzień miniony z modułem tamtego dnia (T950): nie z dzisiejszego ustawienia; zamrożony – z oceny', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '21:00').checkin('07:40', { head: [0, 0], emotions: [0, 0], senses: [0, 0] }).ran('a', '09:00', '10:00')
    const ctx = s.contextAt(dayEnd(PAST) + 3_600_000)
    // The module off today: the day gone by had it on (its check-in) – its curve stays.
    expect(horizonDay(ctx, 'past', null, { moduleOn: false }).energy).not.toBeNull()
    // Frozen with the module off that day (its grade): none; with it on: the curve.
    const know = Object.fromEntries([...new Set(s.events.map((e) => e.c))].map((c) => [c, Math.max(...s.events.filter((e) => e.c === c).map((e) => e.n))]))
    expect(horizonDay(ctx, 'past', { know, grade: { modules: { energy: false, projects: true, requests: true } } }, { moduleOn: true }).energy).toBeNull()
    expect(horizonDay(ctx, 'past', { know, grade: { modules: { energy: true, projects: true, requests: true } } }, { moduleOn: false }).energy).not.toBeNull()
  })

  it('dzień przyszły: z planu od przyjętego check-inu (100 / 100 / 100 od 04:00, T903) – plan obniża krzywą, przeniesienie ją zmienia', () => {
    expect(ASSUMED_CHECKIN).toEqual({ head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const light = horizonDay(futureDay([block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })]).contextAt(NOW), 'future')
    expect(light.energy).toMatchObject({ assumed: true, reserve: DEFAULT_SETTINGS.reserve })
    expect(light.energy!.samples[0]).toEqual({ at: 240, head: 100, emotions: 100, senses: 100 })
    const heavy = horizonDay(futureDay([block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' }), block({ id: 'x', cat: 'analiza', at: '10:00', min: 180, origin: 'user' })]).contextAt(NOW), 'future')
    expect(sampleAt(heavy, lm('13:00')).head).toBeLessThan(sampleAt(light, lm('13:00')).head)
    // The analysis moved to the afternoon: before it the curve stays up, after it comes down.
    const later = horizonDay(futureDay([block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' }), block({ id: 'x', cat: 'analiza', at: '16:00', min: 180, origin: 'user' })]).contextAt(NOW), 'future')
    expect(sampleAt(later, lm('13:00')).head).toBeGreaterThan(sampleAt(heavy, lm('13:00')).head)
    expect(sampleAt(later, lm('19:00')).head).toBeLessThan(sampleAt(later, lm('15:00')).head)
    // The module off: none.
    expect(horizonDay(futureDay().contextAt(NOW), 'future', null, { moduleOn: false }).energy).toBeNull()
  })

  it('przyjęty check-in tylko dla energii: dzień przyszły liczy się jak bez niego (blok, budżet, pora snu)', () => {
    const ctx = futureDay().contextAt(NOW)
    const d = horizonDay(ctx, 'future')
    const state = computeDay(ctx)
    // The same day with the module off (no check-in assumed at all): all but the curve the same.
    expect({ ...d, energy: null }).toEqual(horizonDay(ctx, 'future', null, { moduleOn: false }))
    expect(d.budget).toEqual({ workMin: state.budgetUsedMin + state.budget.forecastMin, limitMin: state.budget.limitMin })
    expect(d.budget).toEqual({ workMin: 180, limitMin: DEFAULT_SETTINGS.dayTypes.zwykly.budgetMin })
    expect(ctx.events).toEqual([])
  })

  it('bez krzywej, gdy nikt jej nie rysuje (miesiąc, cele – T914): reszta dnia ta sama', () => {
    const ctx = futureDay().contextAt(NOW)
    const none = horizonDay(ctx, 'future', null, { curve: false })
    expect(none.energy).toBeNull()
    expect({ ...horizonDay(ctx, 'future'), energy: null }).toEqual(none)
  })
})

describe('D418 – praca wobec budżetu dnia', () => {
  it('dzień miniony bez Twojej obecności – bez miary pracy (jak regeneracja, T904); z obecnością – jak zapisano', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })]
    const at = dayEnd(PAST) + 3_600_000
    // Events of another computer only (an observation): counted in full, nobody used the day.
    const nobody = new Scenario({ date: PAST, plan }).observe('10:00', '10:05', 'pcb')
    const d = horizonDay(nobody.contextAt(at), 'past')
    expect([d.regen, d.budget]).toEqual([null, null])
    const used = new Scenario({ date: PAST, plan, settings: { transitionBufferMin: 0 } })
    used.presence('07:30').using('07:30', '21:00').ran('a', '09:00', '10:00')
    expect(horizonDay(used.contextAt(at), 'past').budget).toMatchObject({ workMin: 60 })
  })
})

describe('„3 dni” i „Agenda” – daty i wspólna oś', () => {
  it('3 dni: wczoraj · dziś · jutro; strzałka przesuwa o dzień', () => {
    expect(threeDays(TODAY)).toEqual([PAST, TODAY, FUT])
    expect(threeDays(FUT)).toEqual([TODAY, FUT, '2026-11-06'])
    // Across a week's border (Sunday, Monday).
    expect(threeDays('2026-11-09')).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
  })

  it('agenda: 7 dni od dziś', () => {
    expect(agendaDates(TODAY)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'])
  })

  it('dni w kolejności podanej; brakujący – nieznany; oś jak w tygodniu', () => {
    const d = (date: string, o: Partial<HorizonDay> = {}): HorizonDay => ({ ...unknownDay(date, 'future'), read: 'full', wakeMin: 5 * 60, bedtimeMin: 23 * 60, ...o })
    const v = daysViewOf(threeDays(TODAY), TODAY, [d(FUT), d(PAST, { when: 'past' })])
    expect(v.days.map((x) => [x.date, x.read, x.when])).toEqual([
      [PAST, 'full', 'past'],
      [TODAY, 'unknown', 'today'],
      [FUT, 'full', 'future']
    ])
    expect([v.from, v.to]).toEqual([4 * 60 + 30, 23 * 60 + 30])
    // The week is the same view of its seven dates.
    const w = weekViewOf('2026-11-02', TODAY, [d(FUT)])
    expect(w).toMatchObject({ week: '2026-11-02', today: TODAY, from: 4 * 60 + 30, to: 23 * 60 + 30 })
    expect(w.days).toHaveLength(7)
  })
})

const hb = (id: string, start: string, min: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({
  id,
  named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '' },
  categoryId: 'inne',
  startMin: lm(start),
  endMin: lm(start) + min,
  state: 'planned',
  outsidePlan: false,
  background: false,
  ...o
})
const ev = (id: string, title: string, from: string, to = from): AllDayEvent => ({ ...allDayDraft(id, from, to), title })

describe('D418 – obciążenie dnia: minuty pracy wobec budżetu (T904)', () => {
  it('trzy poziomy: < 80 %, 80–100 %, > 100 %', () => {
    expect([LOAD_MID_PCT, LOAD_HIGH_PCT]).toEqual([80, 100])
    expect(loadLevel(0, 480)).toBe('low')
    expect(loadLevel(383, 480)).toBe('low')
    expect(loadLevel(384, 480)).toBe('mid')
    expect(loadLevel(480, 480)).toBe('mid')
    expect(loadLevel(481, 480)).toBe('high')
    // A day without a budget: nothing – low, any work – high.
    expect([loadLevel(0, 0), loadLevel(10, 0)]).toEqual(['low', 'high'])
  })
})

describe('D418 – komórka dnia w miesiącu', () => {
  const day = (o: Partial<HorizonDay> = {}): HorizonDay => ({ ...unknownDay(FUT, 'future'), read: 'full', dayType: 'zwykly', budget: { workMin: 400, limitMin: 480 }, ...o })

  it('bloki stałe (spotkania, wykłady, zajęcia zjazdu) – bez sesji i bloków zdjętych z dnia (T905)', () => {
    const blocks = [
      hb('lon', '08:00', 180, { fixed: true, session: true }),
      hb('meet', '10:00', 60, { fixed: true }),
      hb('flex', '11:00', 60),
      hb('w', '18:00', 90, { fixed: true }),
      hb('off', '19:00', 30, { fixed: true, state: 'cancelled' }),
      hb('park', '19:30', 30, { fixed: true, state: 'parked' })
    ]
    const m = monthDayOf(day({ blocks }))
    expect(m).toMatchObject({ date: FUT, when: 'future', read: 'full', dayType: 'zwykly', load: 'mid', workMin: 400, limitMin: 480 })
    // Every block of the day by the hour (D429) – but the ones taken off it; the bars take only the fixed ones first.
    // (the order is the horizon's: `horizonDay` sorts by the hour; the month keeps it)
    expect(m.blocks.map((b) => [b.id, b.fixed, b.session])).toEqual([['lon', true, true], ['meet', true, false], ['flex', false, false], ['w', true, false]])
    // Not read: no load, no blocks.
    expect(monthDayOf(unknownDay(FUT, 'future'))).toMatchObject({ read: 'unknown', blocks: [], load: null, workMin: null, limitMin: null })
  })

  it('do 3 pasków: najpierw całodniowe, potem stałe po godzinie; reszta jako „+N”', () => {
    const m: MonthDay = monthDayOf(day({ blocks: [hb('z', '08:00', 480, { fixed: true }), hb('meet', '10:00', 60, { fixed: true }), hb('w', '18:00', 90, { fixed: true })] }))
    const events = [ev('e2', 'Urlop', '2026-11-01', '2026-11-10'), ev('e1', 'Urodziny', FUT), ev('other', 'Inny dzień', '2026-11-06')]
    const c = monthCell(m, events)
    expect(c.items.map((i) => (i.kind === 'allDay' ? `allDay:${i.event.id}` : `block:${i.block.id}`))).toEqual(['allDay:e2', 'allDay:e1', 'block:z'])
    expect(c.more).toBe(2)
    expect(c.load).toBe('mid')
    // Fewer than 3: all, no „+N”.
    expect(monthCell(monthDayOf(day({ blocks: [hb('meet', '10:00', 60, { fixed: true })] })), [])).toMatchObject({ items: [{ kind: 'block' }], more: 0 })
  })

  it('„+N” liczy wszystko, czego nie widać: całodniowe i bloki bez paska – też elastyczne i sesje (D422); bez zdjętych z dnia', () => {
    const blocks = [
      hb('lon', '08:00', 180, { fixed: true, session: true }),
      hb('meet', '10:00', 60, { fixed: true }),
      hb('f1', '11:00', 60),
      hb('f2', '13:00', 60),
      hb('w', '18:00', 90, { fixed: true }),
      hb('park', '19:30', 30, { state: 'parked' }),
      hb('off', '20:00', 30, { fixed: true, state: 'cancelled' })
    ]
    const m = monthDayOf(day({ blocks }))
    expect(m.blocks).toHaveLength(5)
    const c = monthCell(m, [ev('e1', 'Urodziny', FUT), ev('e2', 'Urlop', FUT)])
    // The events in their order (the same days: by title – „Urlop” before „Urodziny”).
    expect(c.items.map((i) => (i.kind === 'allDay' ? i.event.id : i.block.id))).toEqual(['e2', 'e1', 'meet'])
    // 2 events + 5 blocks on the day, 3 bars: the rest – „w”, the session and the two flexible ones.
    expect(c.more).toBe(4)
    // Two flexible blocks: both get a bar (D429), no „+N”.
    expect(monthCell(monthDayOf(day({ blocks: [hb('f1', '11:00', 60), hb('f2', '13:00', 60)] })), [])).toMatchObject({ items: [{ kind: 'block' }, { kind: 'block' }], more: 0 })
    // Only sessions: no bar, every one „+N”.
    expect(monthCell(monthDayOf(day({ blocks: [hb('lon', '08:00', 60, { fixed: true, session: true }), hb('ny', '15:30', 60, { fixed: true, session: true })] })), [])).toMatchObject({ items: [], more: 2 })
  })

  it('D429: paski – całodniowe, potem stałe po godzinie, potem elastyczne po godzinie; limit 3, reszta „+N”', () => {
    // By the hour, as the horizon gives them.
    const blocks = [
      hb('lon', '08:00', 180, { fixed: true, session: true }),
      hb('f1', '09:00', 60),
      hb('park', '10:00', 30, { state: 'parked' }),
      hb('f2', '14:00', 60),
      hb('meet', '16:00', 60, { fixed: true })
    ]
    const m = monthDayOf(day({ blocks }))
    const bars = (c: ReturnType<typeof monthCell>): string[] => c.items.map((i) => (i.kind === 'allDay' ? `allDay:${i.event.id}` : `block:${i.block.id}`))
    // No events: the fixed one first, then the flexible ones by the hour (never the session, never the parked one).
    const none = monthCell(m, [])
    expect(bars(none)).toEqual(['block:meet', 'block:f1', 'block:f2'])
    expect(none.more).toBe(1)
    // An event takes the first bar: the fixed block, one flexible – and „+N” is the other flexible one and the session.
    const one = monthCell(m, [ev('e1', 'Urodziny', FUT)])
    expect(bars(one)).toEqual(['allDay:e1', 'block:meet', 'block:f1'])
    expect(one.more).toBe(2)
    // Flexible blocks only: bars by the hour, at most 3, the rest „+N”.
    const flex = monthCell(monthDayOf(day({ blocks: [hb('a', '09:00', 30), hb('b', '10:00', 30), hb('c', '15:00', 30), hb('d', '16:00', 30)] })), [])
    expect(bars(flex)).toEqual(['block:a', 'block:b', 'block:c'])
    expect(flex.more).toBe(1)
  })

  it('T1014: pasek tylko dla bloków, które w dniu są albo będą – elastyczne `missed` i w tle go nie mają i są w „+N”; poza planem ma', () => {
    const blocks = [
      hb('g', '07:00', 30, { fixed: true, state: 'missed' }),
      hb('a', '08:00', 30, { state: 'missed' }),
      hb('b', '09:00', 30, { background: true }),
      hb('c', '10:00', 30, { state: 'ran' }),
      hb('d', '11:00', 30, { state: 'running', outsidePlan: true }),
      hb('e', '12:00', 30, { state: 'paused' }),
      hb('f', '13:00', 30)
    ]
    const c = monthCell(monthDayOf(day({ blocks })), [])
    // The fixed one keeps its bar whatever its state (as in 1.18.0); the flexible ones by the hour without the missed and the one in the background.
    expect(c.items.map((i) => (i.kind === 'block' ? i.block.id : '?'))).toEqual(['g', 'c', 'd'])
    expect(c.more).toBe(4)
    // Only such blocks: no bar, every one „+N”.
    expect(monthCell(monthDayOf(day({ blocks: [hb('a', '08:00', 30, { state: 'missed' }), hb('b', '09:00', 30, { background: true })] })), [])).toMatchObject({ items: [], more: 2 })
  })

  it('T1015: blok miesiąca niesie stan i tylko pola, które czyta nazwa (bez `note`)', () => {
    const named = { categoryId: 'inne', variantId: 'v', routine: 'r', requests: ['q'], note: 'prywatna notatka', origin: 'user' as const, sourceId: null, name: 'Własna', task: 't' }
    const m = monthDayOf(day({ blocks: [hb('a', '09:00', 30, { named, state: 'ran', outsidePlan: true, background: true })] }))
    expect(m.blocks[0]).toEqual({
      id: 'a',
      named: { categoryId: 'inne', variantId: 'v', routine: 'r', requests: ['q'], origin: 'user', sourceId: null, name: 'Własna', task: 't' },
      categoryId: 'inne',
      startMin: 540,
      endMin: 570,
      fixed: false,
      session: false,
      state: 'ran',
      outsidePlan: true,
      background: true
    })
    expect(monthBlockOf(hb('b', '10:00', 30, { fixed: true, session: true }))).toMatchObject({ id: 'b', fixed: true, session: true, state: 'planned' })
  })

  it('daty miesiąca od pierwszego do ostatniego dnia', () => {
    expect(monthDates('2026-11')).toHaveLength(30)
    expect(monthDates('2028-02').at(-1)).toBe('2028-02-29')
    expect(monthDates('2026-12')[0]).toBe('2026-12-01')
  })
})

describe('D418 – „Agenda”', () => {
  it('po dniach: całodniowe na górze, potem bloki po godzinie (godzina, nazwa, długość, kategoria); dzień bez bloków – pusta lista', () => {
    const days = [
      { ...unknownDay(TODAY, 'today'), read: 'full' as const, blocks: [hb('a', '09:00', 60), hb('p', '10:00', 30, { state: 'parked' }), hb('b', '13:00', 45, { categoryId: 'analiza', state: 'missed' })] },
      { ...unknownDay(FUT, 'future'), read: 'full' as const }
    ]
    const a = agendaOf(days, [ev('e1', 'Urodziny', FUT)])
    expect(a.map((d) => [d.date, d.allDay.map((e) => e.title), d.blocks.map((b) => [b.id, b.startMin, b.durationMin, b.categoryId, b.state])])).toEqual([
      [
        TODAY,
        [],
        [
          ['a', lm('09:00'), 60, 'inne', 'planned'],
          ['b', lm('13:00'), 45, 'analiza', 'missed']
        ]
      ],
      [FUT, ['Urodziny'], []]
    ])
  })
})

describe('blockInfos – strażnik reguły (ta sama dla osi „Dziś” i kolumn)', () => {
  it('movableBlock = niezaczęty, niezdjęty, z własną godziną, nieminiony', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' }), block({ id: 'b', cat: 'inne', after: 'a', min: 60, origin: 'user' })]
    const g = gridOf(FUT)
    const infos = blockInfos(g, dayPlan({ ...new Scenario({ date: FUT, plan }).snapshot }, null), foldFacts(g, []), DEFAULT_SETTINGS)
    const [a, b] = [infos.find((x) => x.id === 'a')!, infos.find((x) => x.id === 'b')!]
    expect([movableBlock(a, undefined, idxOfLogical(g, lm('10:00')), null), movableBlock(b, undefined, idxOfLogical(g, lm('11:00')), null)]).toEqual([true, false])
  })
})
