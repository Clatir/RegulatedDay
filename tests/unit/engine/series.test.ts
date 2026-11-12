/**
 * Series (OPS1, D381, D382, D401): the rules (every 2 weeks on Thursday, the last Friday, the 31st in February, workdays
 * without Polish holidays), the ends (never, a date, N occurrences – counted with the cancelled and moved ones, not the
 * skipped), the special days (a free day skips, a „zjazd” asks in the morning), the occurrences in the day's snapshot as a
 * template's blocks are, „Tylko to” (a move of one occurrence), „To i następne” (a split), „Cała seria” (from today: days
 * gone by and today's begun occurrence never change, an occurrence changed on its day stays), the room an occurrence
 * makes among the template's blocks (D367: flexible ones pushed, fixed ones stay), the 25- and 23-hour days, a snapshot
 * of an older version without series, the record's file and the words of a rule.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayFileFrom, planBlock, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { createDay, dayPlan } from '@shared/engine/createDay'
import { dayContextOf, snapshotOf, type PlanInputs } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import { moveBetweenDays } from '@shared/engine/planEdit'
import {
  changedFrom,
  endedOn,
  newSeries,
  seriesAnswerRaw,
  seriesBlockId,
  seriesOnDay,
  seriesPushRuns,
  seriesQuestions,
  SERIES_OFF,
  todayOccurrenceEdit,
  withEnd,
  type SeriesEditError
} from '@shared/engine/series'
import { putBlock, setCancelled } from '@shared/data/dayEdits'
import {
  countedBefore,
  currentSeries,
  seriesFrom,
  seriesJson,
  seriesLast,
  seriesOfBlock,
  seriesPlans,
  typeOfDays,
  type Series,
  type SeriesBlock,
  type SeriesRule
} from '@shared/model/series'
import type { DayTypeId } from '@shared/model/settings'
import { seriesRuleText, seriesText } from '@shared/seriesText'
import { addDays, weekday } from '@shared/time/zone'
import { dayLengthMin, placeLogical } from '@shared/time/day'
import { RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { lm, Scenario } from './dsl'

const physio: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: lm('17:00'), durationMin: 60, fixed: true, background: null, costs: null, bgCostPct: null, note: '', name: 'Fizjoterapeuta', routine: null }
const flexible: SeriesBlock = { ...physio, fixed: false, name: 'Angielski', startMin: lm('17:00'), durationMin: 45 }

const make = (id: string, rule: SeriesRule, start: string, o: { block?: SeriesBlock; until?: string | null; count?: number | null; special?: Series['versions'][number]['special'] } = {}): Series =>
  newSeries(id, o.block ?? physio, start, rule, o.special ?? 'ask', { until: o.until ?? null, count: o.count ?? null })

/** The series as days are made from them, with the own types of days (`types`). */
const plansOf = (list: readonly Series[], types: Record<string, DayTypeId> = {}) => seriesPlans(list, typeOfDays([], (d) => types[d] ?? null), marketDay)
const inputs = (list: readonly Series[], types: Record<string, DayTypeId> = {}, templates: Template[] = []): PlanInputs => ({ changes: [], templates, lectures: [], series: plansOf(list, types) })
const fileOf = (date: string, dayType: DayTypeId | null): DayFile | null => (dayType ? { ...dayFileFrom({}, date), dayType } : null)

/** The day's snapshot (made now, nothing in the log). */
const snap = (date: string, list: readonly Series[], types: Record<string, DayTypeId> = {}, templates: Template[] = [], dayFile: DayFile | null = fileOf(date, types[date] ?? null)) =>
  createDay({ date, ...inputs(list, types, templates), dayFile, holidays: marketDay, at: null })

/** The days from `from` to `to` that have an occurrence (of any series) in their plan. */
function occurrenceDays(list: readonly Series[], from: string, to: string, types: Record<string, DayTypeId> = {}, files: Record<string, DayFile> = {}): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const file = files[d] ?? fileOf(d, types[d] ?? null)
    if (dayPlan(snap(d, list, types, [], file), file).some((b) => b.origin === 'series')) out.push(d)
  }
  return out
}

const occOn = (date: string, list: readonly Series[], types: Record<string, DayTypeId> = {}): PlanBlock | undefined => snap(date, list, types).blocks.find((b) => b.origin === 'series')

describe('reguły serii (D381, D401)', () => {
  it('„co 2 tygodnie w czwartek 17:00” – wystąpienia w dobre czwartki, o 17:00, stałe jak blok', () => {
    const s = make('fizjo', { kind: 'weekly', every: 2, days: [4], anchor: '' }, '2026-11-12')
    expect(occurrenceDays([s], '2026-11-12', '2026-12-31')).toEqual(['2026-11-12', '2026-11-26', '2026-12-10', '2026-12-24'])
    const o = occOn('2026-11-26', [s])!
    expect([o.startMin, o.durationMin, o.fixed, o.origin, o.sourceId, o.name]).toEqual([lm('17:00'), 60, true, 'series', 'fizjo', 'Fizjoterapeuta'])
    expect(o.id).toBe(seriesBlockId('2026-11-26', 'fizjo'))
    expect(snap('2026-11-26', [s]).series).toEqual(['fizjo'])
  })

  it('„ostatni piątek” – w ostatni piątek każdego miesiąca; „trzecia środa” – w trzecią środę', () => {
    const last = make('fin', { kind: 'monthWeekday', nth: -1, weekday: 5 }, '2026-11-01')
    expect(occurrenceDays([last], '2026-11-01', '2027-03-31')).toEqual(['2026-11-27', '2026-12-25', '2027-01-29', '2027-02-26', '2027-03-26'])
    const third = make('sr', { kind: 'monthWeekday', nth: 3, weekday: 3 }, '2026-11-01')
    expect(occurrenceDays([third], '2026-11-01', '2027-01-31')).toEqual(['2026-11-18', '2026-12-16', '2027-01-20'])
  })

  it('„31. dnia miesiąca” – w miesiącu bez 31. dnia ostatni dzień (luty 28, w roku przestępnym 29)', () => {
    const s = make('m31', { kind: 'monthDay', day: 31 }, '2026-11-01')
    expect(occurrenceDays([s], '2026-11-01', '2027-03-31')).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
    expect(occurrenceDays([make('m', { kind: 'monthDay', day: 30 }, '2028-02-01')], '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-30'])
  })

  it('„w dni robocze” – poniedziałek–piątek bez świąt ustawowych z kalendarza świąt (11.11, Wigilia i Boże Narodzenie)', () => {
    const s = make('praca', { kind: 'workdays' }, '2026-11-09')
    expect(occurrenceDays([s], '2026-11-09', '2026-11-15')).toEqual(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'])
    expect(occurrenceDays([s], '2026-12-23', '2026-12-28')).toEqual(['2026-12-23', '2026-12-28'])
  })

  it('codziennie i co tydzień w kilka dni; zmiana dni tygodnia zostawia tygodnie serii (kotwica)', () => {
    expect(occurrenceDays([make('d', { kind: 'daily' }, '2026-11-12')], '2026-11-10', '2026-11-14')).toEqual(['2026-11-12', '2026-11-13', '2026-11-14'])
    const s = make('wt', { kind: 'weekly', every: 2, days: [2, 4], anchor: '' }, '2026-11-10')
    expect(occurrenceDays([s], '2026-11-09', '2026-11-29')).toEqual(['2026-11-10', '2026-11-12', '2026-11-24', '2026-11-26'])
    const moved = changedFrom(s, '2026-11-16', { rule: { kind: 'weekly', every: 2, days: [5], anchor: '2026-11-16' } })
    expect(occurrenceDays([moved], '2026-11-09', '2026-12-06')).toEqual(['2026-11-10', '2026-11-12', '2026-11-27'])
  })
})

describe('koniec serii (D381, D401)', () => {
  it('„po 10 razach” kończy serię na 10. wystąpieniu; „w dniu X” – na tym dniu', () => {
    const s = make('ang', { kind: 'daily' }, '2026-11-16', { count: 10 })
    expect(seriesLast(s, typeOfDays([], () => null), marketDay)).toBe('2026-11-25')
    expect(occurrenceDays([s], '2026-11-15', '2026-11-30')).toHaveLength(10)
    expect(occurrenceDays([s], '2026-11-25', '2026-11-27')).toEqual(['2026-11-25'])
    const until = make('u', { kind: 'daily' }, '2026-11-16', { until: '2026-11-18' })
    expect(occurrenceDays([until], '2026-11-15', '2026-11-20')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
  })

  it('„po N” liczy odwołane i przeniesione „Tylko to”, nie liczy pominiętych w dzień szczególny', () => {
    const s = make('tyg', { kind: 'weekly', every: 1, days: [1], anchor: '' }, '2026-11-16', { count: 3 })
    const [a, b] = ['2026-11-16', '2026-11-23']
    // The first cancelled, the second moved to Tuesday: both stood in the plan – the series ends on its third Monday.
    const files: Record<string, DayFile> = {
      [a]: dayFileFrom(setCancelled({ schema: 1, date: a }, seriesBlockId(a, 'tyg'), true), a),
      [b]: dayFileFrom({ schema: 1, date: b, movedTo: { [seriesBlockId(b, 'tyg')]: '2026-11-24' } }, b)
    }
    expect(seriesLast(s, typeOfDays([], () => null), marketDay)).toBe('2026-11-30')
    expect(occurrenceDays([s], a, '2026-12-14', {}, files)).toEqual(['2026-11-30'])
    // A Monday of „Wolne” skips it (no question, nothing counted): the series goes one Monday further.
    const types: Record<string, DayTypeId> = { '2026-11-23': 'wolne' }
    expect(seriesLast(s, typeOfDays([], (d) => types[d] ?? null), marketDay)).toBe('2026-12-07')
    expect(occurrenceDays([s], a, '2026-12-14', types)).toEqual([a, '2026-11-30', '2026-12-07'])
  })
})

describe('dni szczególne (D382)', () => {
  const s = make('fizjo', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12')
  const thu = '2026-11-19'

  it('domyślnie „pytaj”: dzień „Wolne” bez wystąpienia, zjazd i regeneracyjny – wystąpienie i pytanie w planie porannym', () => {
    expect(occOn(thu, [s], { [thu]: 'wolne' })).toBeUndefined()
    for (const type of ['zjazd-stacjonarny', 'zjazd-zdalny', 'regeneracyjny'] as const) {
      const file = fileOf(thu, type)
      const plan = dayPlan(snap(thu, [s], { [thu]: type }), file)
      expect(plan.some((b) => b.origin === 'series')).toBe(true)
      expect(seriesQuestions([s], plan, file, type, thu)).toEqual([{ blockId: seriesBlockId(thu, 'fizjo'), root: 'fizjo' }])
    }
    // An ordinary day asks nothing.
    expect(seriesQuestions([s], dayPlan(snap(thu, [s]), null), null, 'zwykly', thu)).toEqual([])
  })

  it('„odwołaj” odwołuje wystąpienie na ten dzień, „zostaw” je zostawia; po odpowiedzi plan już nie pyta', () => {
    const id = seriesBlockId(thu, 'fizjo')
    const base = { schema: 1, date: thu, dayType: 'zjazd-stacjonarny' }
    for (const keep of [true, false]) {
      const file = dayFileFrom(seriesAnswerRaw(base, thu, id, keep), thu)
      const plan = dayPlan(snap(thu, [s], { [thu]: 'zjazd-stacjonarny' }, [], file), file)
      expect(plan.some((b) => b.id === id)).toBe(keep)
      expect(seriesQuestions([s], plan, file, 'zjazd-stacjonarny', thu)).toEqual([])
    }
  })

  it('po „To i następne” pyta pole wersji dnia', () => {
    const changed = changedFrom(s, '2026-11-26', { special: 'held' })
    const ask = (d: string) => {
      const file = fileOf(d, 'zjazd-zdalny')
      return seriesQuestions([changed], dayPlan(snap(d, [changed], { [d]: 'zjazd-zdalny' }), file), file, 'zjazd-zdalny', d).length
    }
    expect([ask('2026-11-19'), ask('2026-11-26')]).toEqual([1, 0])
  })

  it('„pomiń” pomija we wszystkich czterech, „odbywa się” – zawsze, bez pytania', () => {
    const skip = make('a', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12', { special: 'skip' })
    const held = make('b', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12', { special: 'held' })
    for (const type of ['wolne', 'zjazd-stacjonarny', 'zjazd-zdalny', 'regeneracyjny'] as const) {
      expect(occOn(thu, [skip], { [thu]: type })).toBeUndefined()
      const plan = dayPlan(snap(thu, [held], { [thu]: type }), fileOf(thu, type))
      expect(plan.some((b) => b.origin === 'series')).toBe(true)
      expect(seriesQuestions([held], plan, fileOf(thu, type), type, thu)).toEqual([])
    }
  })
})

describe('zmiany serii: Tylko to · To i następne · Cała seria (D381)', () => {
  const s = make('fizjo', { kind: 'weekly', every: 2, days: [4], anchor: '' }, '2026-11-12')

  it('„Tylko to” przenosi jedno wystąpienie na inny dzień – reszta czwartków bez zmian', () => {
    const thu = '2026-11-26'
    const occ = occOn(thu, [s])!
    const plan = dayPlan(snap(thu, [s]), null)
    const { source, target } = moveBetweenDays(null, null, occ, plan, thu, '2026-11-27')
    const src = dayFileFrom(source, thu)
    const tgt = dayFileFrom(target, '2026-11-27')
    expect(dayPlan(snap(thu, [s], {}, [], src), src).some((b) => b.origin === 'series')).toBe(false)
    const moved = dayPlan(snap('2026-11-27', [s], {}, [], tgt), tgt).find((b) => b.id === occ.id)!
    expect([moved.startMin, moved.origin, moved.movedFrom]).toEqual([lm('17:00'), 'series', thu])
    // The block moved still belongs to its series.
    expect(seriesOfBlock([s], moved, '2026-11-27')?.id).toBe('fizjo')
    expect(occurrenceDays([s], '2026-11-12', '2026-12-24', {}, { [thu]: src })).toEqual(['2026-11-12', '2026-12-10', '2026-12-24'])
  })

  it('„To i następne” od dnia: jedna seria z wersją od tego dnia (te same id wystąpień, jeden licznik); późniejsze wersje dostają zmianę', () => {
    const counted = make('ang', { kind: 'weekly', every: 1, days: [1], anchor: '' }, '2026-11-16', { block: flexible, count: 5 })
    const after = changedFrom(counted, '2026-11-30', { block: { startMin: lm('18:00') } })
    expect([after.id, after.count, after.until, after.versions.map((v) => v.from)]).toEqual(['ang', 5, null, ['2026-11-16', '2026-11-30']])
    expect(occOn('2026-11-23', [after])!.startMin).toBe(lm('17:00'))
    const later = occOn('2026-11-30', [after])!
    expect([later.startMin, later.id, later.sourceId]).toEqual([lm('18:00'), seriesBlockId('2026-11-30', 'ang'), 'ang'])
    // One count: five Mondays in all.
    expect(occurrenceDays([after], '2026-11-16', '2027-01-31')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14'])
    // A change from an earlier day („Cała seria” from today) reaches the later version too – its own start stays.
    const all = changedFrom(after, '2026-11-23', { block: { durationMin: 30 } })
    expect(all.versions.map((v) => [v.from, v.block.startMin, v.block.durationMin])).toEqual([
      ['2026-11-16', lm('17:00'), 45],
      ['2026-11-23', lm('17:00'), 30],
      ['2026-11-30', lm('18:00'), 30]
    ])
  })

  it('lista serii: jedna na korzeń – usunięta – żadna', () => {
    expect(currentSeries([s, make('b', { kind: 'daily' }, '2026-11-12')], '2026-11-26').map((x) => x.id)).toEqual(['b', 'fizjo'])
    expect(currentSeries([{ ...s, archived: true }], '2026-11-26')).toEqual([])
  })

  it('„Cała seria” od dziś: dni minione bez zmian (także liczone na żywo), dni przyszłe z nową godziną', () => {
    const today = '2026-11-26'
    const changed = changedFrom(s, today, { block: { startMin: lm('18:30') } })
    expect(changed.versions.map((v) => v.from)).toEqual(['2026-11-12', today])
    expect(occOn('2026-11-12', [changed])!.startMin).toBe(lm('17:00'))
    expect(occOn(today, [changed])!.startMin).toBe(lm('18:30'))
    expect(occOn('2026-12-10', [changed])!.startMin).toBe(lm('18:30'))
  })

  it('wystąpienie zmienione pojedynczo zostaje po zmianie całej serii', () => {
    const d = '2026-12-10'
    const occ = occOn(d, [s])!
    const file = dayFileFrom(putBlock({ schema: 1, date: d }, { ...occ, startMin: lm('16:00') }), d)
    const changed = changedFrom(s, '2026-11-26', { block: { startMin: lm('18:30') } })
    expect(dayPlan(snap(d, [changed], {}, [], file), file).find((b) => b.id === occ.id)!.startMin).toBe(lm('16:00'))
    expect(occOn('2026-12-24', [changed])!.startMin).toBe(lm('18:30'))
  })

  it('dzisiejsze wystąpienie: niezaczęte – zapis w pliku dnia; zaczęte albo zmienione dziś pojedynczo – bez zmian', () => {
    const today = '2026-11-26'
    const id = seriesBlockId(today, 'fizjo')
    const changed = changedFrom(s, today, { block: { startMin: lm('18:30') } })
    const day = (events: AnyEvent[], raw: Record<string, unknown> | null) => {
      const ctx = dayContextOf(inputs([s]), { date: today, events, dayFile: raw ? dayFileFrom(raw, today) : null, nextFile: null }, marketDay, placeLogical(today, lm('17:10')))
      return { ctx, state: computeDay(ctx) }
    }
    const was = occOn(today, [s])!
    const next = occOn(today, [changed])!
    const written = todayOccurrenceEdit(null, day([], null), id, was, next)!
    expect(dayFileFrom(written, today).blocks.find((b) => b.id === id)!.startMin).toBe(lm('18:30'))
    // Begun at 17:05: today's stays as it is.
    const sc = new Scenario({ date: today, plan: [was] }).start(id, '17:05')
    expect(todayOccurrenceEdit(null, day(sc.events, null), id, was, next)).toBeNull()
    // Changed on its day („Tylko to”, 16:00): stays.
    const own = putBlock({ schema: 1, date: today }, { ...was, startMin: lm('16:00') })
    expect(todayOccurrenceEdit(own, day([], own), id, was, next)).toBeNull()
    // Cancelled today: stays cancelled; a removal of the series cancels one not begun.
    const cancelled = setCancelled({ schema: 1, date: today }, id, true)
    expect(todayOccurrenceEdit(cancelled, day([], cancelled), id, was, next)).toBeNull()
    expect(dayFileFrom(todayOccurrenceEdit(null, day([], null), id, was, null, true)!, today).cancelled).toEqual([id])
  })

  it('zmiana serii odwołuje dzisiejsze wystąpienie ze znacznikiem; zmiana z powrotem je przywraca, Twoje odwołanie zostaje (T719)', () => {
    const today = '2026-11-26'
    const id = seriesBlockId(today, 'fizjo')
    const day = (raw: Record<string, unknown> | null, list: Series[]) => {
      const ctx = dayContextOf(inputs(list), { date: today, events: [], dayFile: raw ? dayFileFrom(raw, today) : null, nextFile: null }, marketDay, placeLogical(today, lm('10:00')))
      return { ctx, state: computeDay(ctx) }
    }
    const was = occOn(today, [s])!
    const off = changedFrom(s, today, { rule: { kind: 'weekly', every: 2, days: [5], anchor: today } })
    const gone = todayOccurrenceEdit(null, day(null, [s]), id, was, null)!
    expect([dayFileFrom(gone, today).cancelled, (gone[SERIES_OFF] as Record<string, unknown>)[id]]).toEqual([[id], true])
    // Back to Thursdays: the occurrence is in today's plan again.
    const back = todayOccurrenceEdit(gone, day(gone, [off]), id, null, was)!
    expect(dayFileFrom(back, today).cancelled).toEqual([])
    expect(dayPlan(snap(today, [s], {}, [], dayFileFrom(back, today)), dayFileFrom(back, today)).some((b) => b.id === id)).toBe(true)
    // Cancelled by you (no mark): stays cancelled.
    const mine = setCancelled({ schema: 1, date: today }, id, true)
    expect(todayOccurrenceEdit(mine, day(mine, [off]), id, null, was)).toBeNull()
    // Its block in the file written by an earlier change (11:00), then cancelled by a change: back at the new 12:00.
    const copy = { ...putBlock({ schema: 1, date: today }, { ...was, startMin: lm('11:00') }), cancelled: { [id]: true }, [SERIES_OFF]: { [id]: true } }
    const again = todayOccurrenceEdit(copy, day(copy, [off]), id, null, { ...was, startMin: lm('12:00') })!
    expect([dayFileFrom(again, today).cancelled, dayFileFrom(again, today).blocks.find((b) => b.id === id)!.startMin]).toEqual([[], lm('12:00')])
  })

  it('nowa reguła od dnia obowiązuje też w późniejszych wersjach z tą samą kotwicą tygodni (co 2 tygodnie bez przesunięcia)', () => {
    const weekly = make('w', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12')
    const twoVersions = changedFrom(weekly, '2026-12-03', { block: { startMin: lm('18:00') } })
    const every2 = changedFrom(twoVersions, '2026-11-12', { rule: { kind: 'weekly', every: 2, days: [4], anchor: '' } })
    expect(occurrenceDays([every2], '2026-11-12', '2026-12-31')).toEqual(['2026-11-12', '2026-11-26', '2026-12-10', '2026-12-24'])
    expect(every2.versions.map((v) => [v.from, v.block.startMin])).toEqual([
      ['2026-11-12', lm('17:00')],
      ['2026-12-03', lm('18:00')]
    ])
  })

  it('koniec i zmiana końca nie ruszają dni minionych', () => {
    const today = '2026-11-26'
    const typeOf = typeOfDays([], () => null)
    const daily = make('d', { kind: 'daily' }, '2026-11-16', { count: 20 })
    // A count the days before today already reached: the series ends yesterday with what they reached.
    expect(countedBefore(daily, today, typeOf, marketDay)).toBe(10)
    const fewer = withEnd(daily, { count: 3 }, today, '2026-12-05', typeOf, marketDay)
    expect([fewer.count, fewer.until]).toEqual([10, '2026-11-25'])
    expect(occurrenceDays([fewer], '2026-11-16', '2026-11-30')).toHaveLength(10)
    // An end before yesterday is yesterday.
    expect(endedOn(daily, '2026-11-01', today, false).until).toBe('2026-11-25')
    // A series that ended before yesterday is not taken further.
    const ended = make('e', { kind: 'daily' }, '2026-11-01', { until: '2026-11-10' })
    expect(() => withEnd(ended, { until: null }, today, '2026-11-10', typeOf, marketDay)).toThrow(/już się zakończyła/)
    try {
      withEnd(ended, { until: null }, today, '2026-11-10', typeOf, marketDay)
    } catch (e) {
      expect((e as SeriesEditError).code).toBe('ended')
    }
  })
})

describe('wystąpienie na zajętym miejscu rozsuwa bloki szablonu (D401, D367)', () => {
  const tpl = (blocks: PlanBlock[]): Template => ({ id: 'zw', name: 'Zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2020-01-01', budgetMin: null, maxMin: null, blocks }] })
  const t = (id: string, at: string, min: number, fixed = false, categoryId = 'inne') => planBlock({ id, categoryId, startMin: lm(at), durationMin: min, fixed, origin: 'template' })

  it('elastyczne bloki szablonu po wystąpieniu idą za nim, stały i chroniony zostają; bez kolizji nic się nie rusza', () => {
    const date = '2026-11-19'
    const s = make('ang', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12', { block: { ...flexible, startMin: lm('17:30'), durationMin: 60 } })
    const template = tpl([t('a', '17:30', 60), t('b', '18:30', 30), t('meal', '19:00', 30, false, 'posilek'), t('f', '20:30', 60, true)])
    const out = snap(date, [s], {}, [template])
    const at = (src: string) => out.blocks.find((b) => b.sourceId === src)!.startMin!
    expect(at('ang')).toBe(lm('17:30'))
    expect(at('a')).toBeGreaterThanOrEqual(lm('18:30'))
    expect(at('b')).toBeGreaterThanOrEqual(at('a') + 60)
    expect(at('meal')).toBe(lm('19:00'))
    expect(at('f')).toBe(lm('20:30'))
    // Another hour: nothing of the template moves.
    const free = snap(date, [make('x', { kind: 'daily' }, '2026-11-12', { block: { ...flexible, startMin: lm('09:00'), durationMin: 30 } })], {}, [template])
    expect(['a', 'b', 'meal', 'f'].map((src) => free.blocks.find((b) => b.sourceId === src)!.startMin)).toEqual([lm('17:30'), lm('18:30'), lm('19:00'), lm('20:30')])
  })

  it('doba 25 h (24.10.2026) i 23 h (27.03.2027): wystąpienie w nocy i rozsunięcie na minutę z własnym numerem', () => {
    expect([dayLengthMin('2026-10-24'), dayLengthMin('2027-03-27')]).toEqual([1500, 1380])
    for (const date of ['2026-10-24', '2027-03-27']) {
      const s = make('noc', { kind: 'daily' }, '2026-10-01', { block: { ...flexible, startMin: lm('01:30+1'), durationMin: 60 } })
      // Both are Saturdays: the template's type for the day.
      const out = snap(date, [s], { [date]: 'zwykly' }, [tpl([t('late', '01:30+1', 30)])])
      const occ = out.blocks.find((b) => b.origin === 'series')!
      expect([occ.startMin, occ.id]).toEqual([lm('01:30+1'), seriesBlockId(date, 'noc')])
      const late = out.blocks.find((b) => b.sourceId === 'late')!.startMin!
      expect(late).toBeGreaterThanOrEqual(lm('02:30+1'))
      // On the 23-hour day 02:00–02:59 has no number of its own: the push lands at 03:00 or later.
      if (date === '2027-03-27') expect(late).toBeGreaterThanOrEqual(lm('03:00+1'))
    }
    // The days after both keep their rule (calendar days).
    const daily = make('d', { kind: 'daily' }, '2026-10-24')
    expect(occurrenceDays([daily], '2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})

describe('rozsuwanie: odwołane w pliku dnia i pamięć (T718)', () => {
  const tpl = (blocks: PlanBlock[]): Template => ({ id: 'zw', name: 'Zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2020-01-01', budgetMin: null, maxMin: null, blocks }] })
  const t = (id: string, at: string, min: number) => planBlock({ id, categoryId: 'inne', startMin: lm(at), durationMin: min, origin: 'template' })
  const date = '2026-11-19'
  const s = make('ang', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12', { block: { ...flexible, startMin: lm('17:00'), durationMin: 60 } })
  const template = tpl([t('a', '17:00', 60), t('b', '18:00', 30)])

  it('blok szablonu odwołany w pliku dnia (z niego powstała seria) nie zajmuje miejsca – kolejne bez rozsunięcia', () => {
    const aId = snap(date, [], {}, [template]).blocks.find((b) => b.sourceId === 'a')!.id
    const file = dayFileFrom(setCancelled({ schema: 1, date }, aId, true), date)
    const out = snap(date, [s], {}, [template], file)
    expect(out.blocks.find((b) => b.sourceId === 'b')!.startMin).toBe(lm('18:00'))
    // Without the cancel the block of the template is pushed (and so is the next one).
    expect(snap(date, [s], {}, [template]).blocks.find((b) => b.sourceId === 'b')!.startMin).toBeGreaterThan(lm('18:00'))
  })

  it('ten sam dzień liczony drugi raz bierze rozsunięcie z pamięci (bez ponownego liczenia dnia)', () => {
    const first = snap('2026-11-26', [s], {}, [template])
    const runs = seriesPushRuns.count
    const again = snap('2026-11-26', [s], {}, [template])
    expect(seriesPushRuns.count).toBe(runs)
    expect(again.blocks).toEqual(first.blocks)
    snap('2026-12-03', [s], {}, [template])
    expect(seriesPushRuns.count).toBe(runs + 1)
  })
})

describe('znak w siatce miesiąca (D404)', () => {
  it('wystąpienie w pliku dnia, które ten plik odwołuje albo przenosi – bez znaku', () => {
    const d = '2026-11-19'
    const s = make('fizjo', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12')
    const id = seriesBlockId(d, 'fizjo')
    const own = putBlock({ schema: 1, date: d, dayType: 'wolne' }, planBlock({ id, categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'series', sourceId: 'fizjo' }))
    expect(seriesOnDay(plansOf([s]), d, 'wolne', dayFileFrom(own, d), marketDay)).toBe(true)
    expect(seriesOnDay(plansOf([s]), d, 'wolne', dayFileFrom(setCancelled(own, id, true), d), marketDay)).toBe(false)
  })
})

describe('wersja reguł (T716)', () => {
  it('wystąpienia w `day.create` prowadzącego: starsza wersja ustępuje prowadzenia', () => {
    expect(RULES_VERSION).toBe(8)
  })
})

describe('migawka i plik serii', () => {
  it('migawka starszej wersji bez serii dostaje wystąpienia dnia (dzień w logu), nowsza – zostaje jak w logu', () => {
    const date = '2026-11-19'
    const s = make('fizjo', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12')
    const old = { ...snap(date, []) }
    delete old.series
    const ev = (snapshot: object): AnyEvent => ({ id: 'e1', c: 'pca', n: 0, t: 0, l: 0, v: 1, day: date, dom: 'timer', k: 'day.create', snapshot }) as unknown as AnyEvent
    const src = (snapshot: object) => ({ date, events: [ev(snapshot)], dayFile: null, nextFile: null })
    const fromOld = snapshotOf(inputs([s]), src(old), marketDay, null)
    expect(fromOld.fromLog).toBe(true)
    expect(fromOld.snapshot.blocks.some((b) => b.id === seriesBlockId(date, 'fizjo'))).toBe(true)
    // A snapshot of a version with series made before the series: as the log has it (today's file brings it, not this).
    const fromNew = snapshotOf(inputs([s]), src(snap(date, [])), marketDay, null)
    expect(fromNew.snapshot.blocks.some((b) => b.origin === 'series')).toBe(false)
  })

  it('plik serii: odczyt i zapis z polami nieznanymi; zły rekord – null; wersje mapą po dacie', () => {
    const s = changedFrom(make('fizjo', { kind: 'weekly', every: 2, days: [4], anchor: '' }, '2026-11-12', { count: 10 }), '2026-11-26', { block: { startMin: lm('18:00') } })
    const raw = seriesJson(s, { id: 'fizjo', color: 'teal', versions: { '2026-11-12': { block: { categoryId: 'inne', extra: 1 }, rule: { kind: 'weekly', future: true } } } })
    expect(raw.color).toBe('teal')
    expect(((raw.versions as Record<string, Record<string, Record<string, unknown>>>)['2026-11-12']!.block!).extra).toBe(1)
    expect(seriesFrom(raw)).toEqual(s)
    expect(seriesFrom({ id: 'x', versions: { '2026-11-12': { block: physio, rule: { kind: 'fortnightly' } } } })).toBeNull()
    expect(seriesFrom({ id: 'x', versions: {} })).toBeNull()
    expect(seriesFrom({ id: 'x', versions: { bad: { block: physio, rule: { kind: 'daily' } } } })).toBeNull()
    // Read back: the weekly rule keeps its weeks, the special days field defaults to „pytaj”.
    const back = seriesFrom({ id: 'y', start: '2026-11-12', versions: { '2026-11-12': { block: physio, rule: { kind: 'weekly', every: 2, days: [4] } } } })!
    expect([back.versions[0]!.rule, back.versions[0]!.special, back.root]).toEqual([{ kind: 'weekly', every: 2, days: [4], anchor: '2026-11-12' }, 'ask', 'y'])
  })

  it('stara wersja czyta wystąpienie w pliku dnia jako blok własny (origin nieznany → „user”), ta – jako wystąpienie', () => {
    const d = '2026-11-19'
    const file = dayFileFrom({ schema: 1, date: d, blocks: { x: { id: 'x', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'series', sourceId: 'r' } } }, d)
    expect(file.blocks[0]!.origin).toBe('series')
    expect(dayFileFrom({ schema: 1, date: d, blocks: { x: { id: 'x', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'kalendarz' } } }, d).blocks[0]!.origin).toBe('user')
  })
})

describe('opis reguły słowami (D401)', () => {
  const today = '2026-11-12'
  it.each<[SeriesRule, { until: string | null; count: number | null }, string]>([
    [{ kind: 'weekly', every: 2, days: [4], anchor: today }, { until: '2027-04-30', count: null }, 'co 2 tygodnie w czwartek, do 30.04.2027'],
    [{ kind: 'weekly', every: 2, days: [4], anchor: today }, { until: '2026-12-30', count: null }, 'co 2 tygodnie w czwartek, do 30.12'],
    [{ kind: 'monthWeekday', nth: -1, weekday: 5 }, { until: null, count: null }, 'w ostatni piątek miesiąca'],
    [{ kind: 'monthWeekday', nth: 3, weekday: 3 }, { until: null, count: null }, 'w trzecią środę miesiąca'],
    [{ kind: 'daily' }, { until: null, count: 10 }, 'codziennie, 10 razy'],
    [{ kind: 'workdays' }, { until: null, count: 1 }, 'w dni robocze, 1 raz'],
    [{ kind: 'weekly', every: 1, days: [4, 2], anchor: today }, { until: null, count: null }, 'co tydzień we wtorek i czwartek'],
    [{ kind: 'weekly', every: 5, days: [1, 3, 5], anchor: today }, { until: null, count: null }, 'co 5 tygodni w poniedziałek, środę i piątek'],
    [{ kind: 'monthDay', day: 10 }, { until: null, count: null }, '10. dnia każdego miesiąca'],
    [{ kind: 'monthDay', day: 31 }, { until: null, count: null }, '31. dnia każdego miesiąca (w krótszym – ostatniego)']
  ])('%j %j → %s', (rule, end, text) => {
    expect(seriesRuleText(rule, end, today)).toBe(text)
  })

  it('seria – reguła w mocy dziś', () => {
    const s = make('fizjo', { kind: 'weekly', every: 2, days: [4], anchor: '' }, '2026-11-12', { until: '2027-04-30' })
    expect(seriesText(s, '2026-11-12')).toBe('co 2 tygodnie w czwartek, do 30.04.2027')
    expect(weekday('2026-11-12')).toBe(4)
  })
})

describe('znak serii w siatce miesiąca (D404)', () => {
  const s = make('fizjo', { kind: 'weekly', every: 1, days: [4], anchor: '' }, '2026-11-12')
  const plans = plansOf([s])
  const id = seriesBlockId('2026-11-19', 'fizjo')
  it('dzień z wystąpieniem ma znak, dzień bez wystąpienia – nie', () => {
    expect(seriesOnDay(plans, '2026-11-19', 'zwykly', null, marketDay)).toBe(true)
    expect(seriesOnDay(plans, '2026-11-18', 'zwykly', null, marketDay)).toBe(false)
  })
  it('odwołane i przeniesione wystąpienie – bez znaku; dzień, do którego przeniesione – ze znakiem', () => {
    const cancelled = dayFileFrom(setCancelled({}, id, true), '2026-11-19')
    expect(seriesOnDay(plans, '2026-11-19', 'zwykly', cancelled, marketDay)).toBe(false)
    const moved = { ...dayFileFrom({}, '2026-11-19'), movedTo: { [id]: '2026-11-20' } }
    expect(seriesOnDay(plans, '2026-11-19', 'zwykly', moved, marketDay)).toBe(false)
    const target = dayFileFrom(putBlock({}, planBlock({ id, categoryId: 'inne', durationMin: 60, startMin: lm('17:00'), origin: 'series', sourceId: 'fizjo' })), '2026-11-20')
    expect(seriesOnDay(plans, '2026-11-20', 'zwykly', target, marketDay)).toBe(true)
  })
  it('„Wolne” pomija wystąpienie – bez znaku', () => {
    expect(seriesOnDay(plans, '2026-11-19', 'wolne', null, marketDay)).toBe(false)
  })
})
