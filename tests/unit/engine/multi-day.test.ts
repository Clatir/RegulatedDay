/**
 * SNT1 część A (D417, D418) – logika widoków wielodniowych bez ekranów: które bloki da się przeciągnąć między kolumnami
 * (reguła „Dziś”, D305 – `movableBlock`), tylko dziś i dni przyszłe; przeniesienie z nową godziną (`moveBetweenDays`);
 * krzywa energii każdej kolumny tym samym silnikiem co „Dziś” (miniony z logu, dziś na żywo, przyszły z planu od
 * przyjętego check-inu – T903); „3 dni”, „Agenda”, komórka miesiąca (bloki stałe i całodniowe, „+N”, obciążenie – T904–T906).
 */
import { describe, expect, it } from 'vitest'
import { blockInfos, movableBlock } from '@shared/engine/blocks'
import { agendaOf, LOAD_HIGH_PCT, LOAD_MID_PCT, loadLevel, mayMoveBetween, monthCell, monthDates, monthDayOf, monthFixed, type MonthDay } from '@shared/engine/calendarViews'
import { dayPlan } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { ASSUMED_CHECKIN, ENERGY_SAMPLE_MIN, energyTrack } from '@shared/engine/energyTrack'
import { foldFacts } from '@shared/engine/facts'
import { gridOf, idxOfLogical } from '@shared/engine/grid'
import { anchoredTo, moveBetweenDays } from '@shared/engine/planEdit'
import { agendaDates, daysViewOf, horizonDay, threeDays, unknownDay, weekViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { dayFileFrom } from '@shared/model/plan'
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
  it('dzień przyszły: blok z własną godziną tak; sesja, wykład, zajęcia zjazdu, druga zmiana i zakotwiczony – nie', () => {
    const s = futureDay([
      block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' }),
      block({ id: 'tpl', cat: 'analiza', at: '12:00', min: 60 }),
      block({ id: 'meet', cat: 'inne', at: '13:00', min: 60, fixed: true, origin: 'user' }),
      block({ id: 'lon', cat: 'sesja', at: '08:00', min: 60, fixed: true, origin: 'session', source: 'londyn' }),
      block({ id: 'w', cat: 'wyklad', at: '18:00', min: 90, fixed: true, origin: 'lecture' }),
      block({ id: 'z', cat: 'dojazd', at: '15:00', min: 60, fixed: true, origin: 'zjazd' }),
      block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' }),
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
        ['ds', false],
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

  it('bloki zakotwiczone do przenoszonego (wprost i dalej) idą z nim i zostają zakotwiczone (T911)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '09:00', min: 60, origin: 'user' })
    const y = block({ id: 'y', cat: 'inne', after: 'x', min: 30, origin: 'user' })
    const z = block({ id: 'z', cat: 'inne', after: 'y', min: 15 })
    const other = block({ id: 'o', cat: 'inne', at: '13:00', min: 30, origin: 'user' })
    const plan = [x, y, z, other]
    expect(anchoredTo(plan, 'x').map((b) => b.id)).toEqual(['y', 'z'])
    expect(anchoredTo(plan, 'o')).toEqual([])
    const fromRaw = { schema: 1, date: FUT, blocks: [x, y, other].map((b) => ({ ...b })) }
    const { source, target } = moveBetweenDays(fromRaw, null, x, plan, FUT, '2026-11-06', true, { startMin: lm('15:00'), followers: [y, z] })
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
    expect(horizonDay(s.contextAt(NOW), 'today', null, false).energy).toBeNull()
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
    expect(horizonDay(futureDay().contextAt(NOW), 'future', null, false).energy).toBeNull()
  })

  it('przyjęty check-in tylko dla energii: dzień przyszły liczy się jak bez niego (blok, budżet, pora snu)', () => {
    const ctx = futureDay().contextAt(NOW)
    const d = horizonDay(ctx, 'future')
    const state = computeDay(ctx)
    // The same day with the module off (no check-in assumed at all): all but the curve the same.
    expect({ ...d, energy: null }).toEqual(horizonDay(ctx, 'future', null, false))
    expect(d.budget).toEqual({ workMin: state.budgetUsedMin + state.budget.forecastMin, limitMin: state.budget.limitMin })
    expect(d.budget).toEqual({ workMin: 180, limitMin: DEFAULT_SETTINGS.dayTypes.zwykly.budgetMin })
    expect(ctx.events).toEqual([])
  })

  it('bez krzywej, gdy nikt jej nie rysuje (miesiąc, cele – T914): reszta dnia ta sama', () => {
    const ctx = futureDay().contextAt(NOW)
    const none = horizonDay(ctx, 'future', null, null)
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

  it('bloki stałe (spotkania, wykłady, zajęcia zjazdu) – bez sesji, drugiej zmiany i bloków zdjętych z dnia (T905)', () => {
    const blocks = [
      hb('lon', '08:00', 180, { fixed: true, session: true }),
      hb('meet', '10:00', 60, { fixed: true }),
      hb('flex', '11:00', 60),
      hb('w', '18:00', 90, { fixed: true }),
      hb('off', '19:00', 30, { fixed: true, state: 'cancelled' }),
      hb('park', '19:30', 30, { fixed: true, state: 'parked' })
    ]
    expect(blocks.filter(monthFixed).map((b) => b.id)).toEqual(['meet', 'w'])
    const m = monthDayOf(day({ blocks }))
    expect(m).toMatchObject({ date: FUT, when: 'future', read: 'full', dayType: 'zwykly', load: 'mid', workMin: 400, limitMin: 480 })
    expect(m.fixed.map((b) => b.id)).toEqual(['meet', 'w'])
    // Not read: no load, no blocks.
    expect(monthDayOf(unknownDay(FUT, 'future'))).toMatchObject({ read: 'unknown', fixed: [], load: null, workMin: null, limitMin: null })
  })

  it('do 3 pasków: najpierw całodniowe, potem stałe po godzinie; reszta jako „+N”', () => {
    const m: MonthDay = monthDayOf(day({ blocks: [hb('meet', '10:00', 60, { fixed: true }), hb('w', '18:00', 90, { fixed: true }), hb('z', '08:00', 480, { fixed: true })] }))
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
    expect(m.blockCount).toBe(5)
    const c = monthCell(m, [ev('e1', 'Urodziny', FUT), ev('e2', 'Urlop', FUT)])
    // The events in their order (the same days: by title – „Urlop” before „Urodziny”).
    expect(c.items.map((i) => (i.kind === 'allDay' ? i.event.id : i.block.id))).toEqual(['e2', 'e1', 'meet'])
    // 2 events + 5 blocks on the day, 3 bars: the event-free rest – „w”, the session and the two flexible ones.
    expect(c.more).toBe(4)
    // Only flexible blocks: no bar, every one „+N”.
    expect(monthCell(monthDayOf(day({ blocks: [hb('f1', '11:00', 60), hb('f2', '13:00', 60)] })), [])).toMatchObject({ items: [], more: 2 })
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
