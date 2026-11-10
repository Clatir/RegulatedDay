/**
 * D367 (FBL2a, rozsuwanie): a block put on a taken place – inserted, dragged, lengthened by its edge – writes new planned
 * starts of the flexible blocks after it; fixed, protected and begun blocks stay, a flexible block that would hit a fixed
 * one jumps behind it as in the forecast; what lands past the approved boundary checks the marker of variants (the push
 * is its trigger). What the window shows while dragging is what the day then shows: the forecast of the changed plan.
 */
import { describe, expect, it } from 'vitest'
import { shiftedStart, unshiftedStart, wakeShiftedStart } from '@shared/engine/createDay'
import { computeDay, shownForecast } from '@shared/engine/day'
import { atOf, idxOfLogical } from '@shared/engine/grid'
import { planWith, pushApart, pushedPlan, pushedText, type PushedBlock } from '@shared/engine/pushApart'
import { markerCause, variantCauses } from '@shared/engine/variants'
import { PLAN_MAX, type PlanBlock } from '@shared/model/plan'
import { logicalMinuteOf } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

const flex = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, origin: 'user' })
const fixed = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, fixed: true, origin: 'user' })

function day(plan: PlanBlock[]) {
  return new Scenario({ date: DATE, plan }).observe('07:00', null)
}

/** The push of block `id` standing as `changed` holds it, counted at `now`; `atMin` – its place on the axis (the bottom edge). */
function push(s: Scenario, now: string, changed: PlanBlock[], id: string, atMin?: number) {
  const t = s.at(now)
  const ctx = s.contextAt(t)
  return pushApart(ctx, computeDay(ctx), changed, id, atMin)
}


const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const moves = (out: readonly PushedBlock[]) => out.map((p) => `${p.id} ${clock(p.fromMin)}→${clock(p.startMin)}${p.shown.startMin !== p.startMin ? ` (na osi ${clock(p.shown.startMin)})` : ''}–${clock(p.shown.endMin)}`)

/**
 * The day counted again with the push written: every pushed block stands where the push said (the preview is what the
 * day then shows) – at the minute written (by its index: a 25-hour day's clock shows an hour twice), unless past the
 * day's last minute – the changed block where it was put, and no flexible block of the foreground overlaps another.
 */
function written(s: Scenario, now: string, changed: PlanBlock[], out: readonly PushedBlock[]) {
  const plan = pushedPlan(changed, out)
  const t = s.at(now)
  const st = computeDay(s.contextAt(t, { plan }))
  const lmOf = (idx: number) => logicalMinuteOf(st.grid.date, atOf(st.grid, idx))
  const placed = (id: string) => st.forecast.find((x) => x.block.id === id)!
  const at = (id: string) => ({ startMin: lmOf(placed(id).from), endMin: lmOf(placed(id).to) })
  for (const p of out) {
    expect(at(p.id), p.id).toEqual(p.shown)
    if (p.startMin < PLAN_MAX) expect(idxOfLogical(st.grid, p.startMin), p.id).toBe(placed(p.id).from)
  }
  const fg = [...st.forecast].filter((p) => !p.bg).sort((a, b) => a.from - b.from)
  for (let k = 1; k < fg.length; k++) expect(fg[k]!.from, `${fg[k]!.block.id} po ${fg[k - 1]!.block.id}`).toBeGreaterThanOrEqual(fg[k - 1]!.to)
  return { plan, state: st, at }
}

describe('D367 – rozsuwanie: kolejne bloki elastyczne dostają nowe godziny', () => {
  it('scenariusz ze specyfikacji: o 11:30 wstawiony 45-minutowy blok o 12:00 przesuwa trzy elastyczne, zajęcia o 14:00 stoją, ostatni przeskakuje je', () => {
    const plan = [flex('a', '12:00', 30), flex('b', '12:30', 30), flex('c', '13:00', 45), fixed('zajecia', '14:00', 60)]
    const s = day(plan)
    const x = flex('x', '12:00', 45)
    const changed = planWith(plan, x)
    const out = push(s, '11:30', changed, 'x')
    // a and b go behind the new block; c (45 min) no longer fits before the fixed block at 14:00 – it jumps behind it.
    expect(moves(out)).toEqual(['a 12:00→12:45–13:15', 'b 12:30→13:15–13:45', 'c 13:00→15:00–15:45'])
    expect(pushedText(out.length)).toBe('Przesunięto 3 bloki')
    const w = written(s, '11:30', changed, out)
    expect(w.at('x')).toEqual({ startMin: lm('12:00'), endMin: lm('12:45') })
    expect(w.at('zajecia')).toEqual({ startMin: lm('14:00'), endMin: lm('15:00') })
    expect(w.plan.find((b) => b.id === 'zajecia')!.startMin).toBe(lm('14:00'))
  })

  it('przeciągnięcie na zajęte miejsce: kolejne przesuwają się bez nakładania, w kolejności dnia', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60), flex('d', '15:00', 30)]
    const s = day(plan)
    const changed = planWith(plan, { ...plan[0]!, startMin: lm('10:30') })
    const out = push(s, '08:00', changed, 'a')
    // d (15:00) is not reached: it keeps its plan.
    expect(moves(out)).toEqual(['b 11:00→11:30–12:30', 'c 12:00→12:30–13:30'])
    written(s, '08:00', changed, out)
  })

  it('upuszczony dokładnie na początek innego: tamten idzie za nim (bez względu na identyfikatory)', () => {
    const plan = [flex('z', '09:00', 60), flex('a', '11:00', 60), flex('b', '12:00', 60)]
    const s = day(plan)
    const changed = planWith(plan, { ...plan[0]!, startMin: lm('11:00') })
    const out = push(s, '08:00', changed, 'z')
    expect(moves(out)).toEqual(['a 11:00→12:00–13:00', 'b 12:00→13:00–14:00'])
    const w = written(s, '08:00', changed, out)
    expect(w.at('z')).toEqual({ startMin: lm('11:00'), endMin: lm('12:00') })
  })

  it('stały blok zostaje, elastyczny, który trafiłby na niego, przeskakuje go z buforem przejścia jak w prognozie', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 45), fixed('f', '12:00', 60, 'posilek')]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '10:30', 60))
    const out = push(s, '08:00', changed, 'x')
    // a (before x) stays and x stands after it (11:00–12:00); b would hit f at 12:00 – behind it, 5 min of transition (another category).
    expect(moves(out)).toEqual(['b 11:00→13:05–13:50'])
    expect(out.map((p) => p.id)).not.toContain('f')
    const w = written(s, '08:00', changed, out)
    expect(w.at('x')).toEqual({ startMin: lm('11:00'), endMin: lm('12:00') })
    expect(w.at('f')).toEqual({ startMin: lm('12:00'), endMin: lm('13:00') })
  })

  it('chroniony blok życia zostaje w planie; blok za nim idzie za tym, gdzie stoi', () => {
    const plan = [flex('a', '11:00', 30), flex('obiad', '12:00', 30, 'posilek'), flex('c', '12:30', 60)]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '11:30', 60))
    const out = push(s, '08:00', changed, 'x')
    expect(out.map((p) => p.id)).not.toContain('obiad')
    // The protected meal follows the new block (12:30 + 5 min of transition), c follows the meal (13:05 + 5).
    expect(moves(out)).toEqual(['c 12:30→13:10–14:10'])
    const w = written(s, '08:00', changed, out)
    expect(w.plan.find((b) => b.id === 'obiad')!.startMin).toBe(lm('12:00'))
  })

  it('zaczęty blok (zapauzowany) zostaje, choć stoi za wstawionym', () => {
    const plan = [flex('p', '11:00', 60), flex('c', '12:00', 60)]
    const s = day(plan).start('p', '08:00').pause('p', '08:10')
    const changed = planWith(plan, flex('x', '11:00', 30))
    const out = push(s, '08:30', changed, 'x')
    expect(out.map((p) => p.id)).not.toContain('p')
  })

  it('blok zakotwiczony do przesuniętego idzie za nim sam (bez zapisu), blok w tle i czekający na „Zacznij” zostają', () => {
    const plan = [flex('a', '10:00', 60), block({ id: 'po', cat: 'inne', after: 'a', min: 15, origin: 'user' }), block({ id: 'tlo', cat: 'inne', at: '10:30', min: 60, bg: true, origin: 'user' })]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '10:00', 30))
    const out = push(s, '08:00', changed, 'x')
    expect(moves(out)).toEqual(['a 10:00→10:30–11:30'])
    const w = written(s, '08:00', changed, out)
    expect(w.at('po')).toEqual({ startMin: lm('11:30'), endMin: lm('11:45') })
  })

  it('blok zaplanowany przed wstawionym, a pokazany za nim (przeskoczył stały), dostaje godzinę, w której stoi – inaczej prognoza postawiłaby wstawiony za nim', () => {
    const plan = [flex('b', '09:00', 60), fixed('f', '09:30', 60, 'posilek')]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '09:10', 15))
    const out = push(s, '08:00', changed, 'x')
    expect(moves(out)).toEqual(['b 09:00→10:35–11:35'])
    const w = written(s, '08:00', changed, out)
    expect(w.at('x')).toEqual({ startMin: lm('09:10'), endMin: lm('09:25') })
  })

  it('kolejność dnia zostaje: blok nieprzesunięty, którego godzina w planie wypadłaby przed przesuniętym, też dostaje swoją', () => {
    // a (planned 10:30, after b in the forecast) already jumps the fixed block: the push does not move it, but its planned
    // start would come before b's new one (and the forecast keeps the planned order).
    const plan = [flex('b', '10:00', 60), flex('a', '10:30', 60), fixed('f', '11:30', 60)]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '10:00', 30))
    const out = push(s, '08:00', changed, 'x')
    expect(moves(out)).toEqual(['b 10:00→10:30–11:30', 'a 10:30→12:30–13:30'])
    written(s, '08:00', changed, out)
  })

  it('wstawienie w wolne miejsce nie przesuwa niczego', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '12:00', 60)]
    const s = day(plan)
    expect(push(s, '08:00', planWith(plan, flex('x', '11:00', 60)), 'x')).toEqual([])
    expect(push(s, '08:00', planWith(plan, flex('x', '11:00', 30)), 'x')).toEqual([])
    // A block in the background over a taken place takes none of the foreground's.
    expect(push(s, '08:00', planWith(plan, block({ id: 'x', cat: 'inne', at: '10:00', min: 60, bg: true, origin: 'user' })), 'x')).toEqual([])
  })

  it('blok wydłużony dolną krawędzią przesuwa kolejne; wcześniejsze, za którym czeka, zostaje przed nim (miejsce na osi, nie w planie)', () => {
    // o pushes p (planned 09:45, shown 10:00), p pushes x (planned 10:00, shown 10:45); q at 11:30.
    const plan = [flex('o', '09:00', 60), flex('p', '09:45', 45), flex('x', '10:00', 45), flex('q', '11:30', 60)]
    const s = day(plan)
    // The bottom edge of x to 12:00: its length from where it is shown (10:45), its planned start unchanged.
    const changed = planWith(plan, { ...plan[2]!, durationMin: 75 })
    const out = push(s, '08:00', changed, 'x', lm('10:45'))
    expect(moves(out)).toEqual(['q 11:30→12:00–13:00'])
    const w = written(s, '08:00', changed, out)
    expect(w.at('p')).toEqual({ startMin: lm('10:00'), endMin: lm('10:45') })
    expect(w.at('x')).toEqual({ startMin: lm('10:45'), endMin: lm('12:00') })
  })

  it('nadmiar za zatwierdzoną granicą: rozsuwanie jest wyzwalaczem znacznika wariantów (jego warunek – koniec pracy po granicy)', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60)]
    const s = day(plan).approve('12:15', '08:00')
    const changed = planWith(plan, flex('x', '10:00', 60))
    const out = push(s, '09:00', changed, 'x')
    expect(moves(out)).toEqual(['a 10:00→11:00–12:00', 'b 11:00→12:00–13:00'])
    const t = s.at('09:00')
    const st = computeDay(s.contextAt(t, { plan: pushedPlan(changed, out) }))
    const trigger = { id: `push:${t}`, at: t }
    // Without the push no trigger in the log: no cause; with it – the end of work after the boundary, and the marker.
    expect(variantCauses(st, null)).toEqual([])
    const causes = variantCauses(st, null, [trigger])
    expect(causes).toEqual([{ kind: 'time', id: `variants:${DATE}:push:${t}`, at: t, minutes: 45 }])
    expect(markerCause(causes, { shown: new Set(), done: new Set(), quiet: false, lastQuiet: null, now: t + 60_000 })).toEqual(causes[0])
    // Within the boundary the same trigger brings nothing.
    const fits = computeDay(s.contextAt(t, { plan }))
    expect(variantCauses(fits, null, [trigger])).toEqual([])
  })

  it('prognoza z `shownForecast` dla bloków stanu to prognoza stanu (to samo miejsce, co pokazuje oś)', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '10:30', 60), fixed('f', '12:00', 30, 'posilek'), flex('c', '11:45', 60)]
    const s = day(plan).start('a', '10:05')
    const t = s.at('10:20')
    const ctx = s.contextAt(t)
    const st = computeDay(ctx)
    const pos = (list: typeof st.forecast) => list.map((p) => [p.block.id, p.from, p.to])
    expect(pos(shownForecast(ctx, st, st.blocks))).toEqual(pos(st.forecast))
  })

  it('tekst paska: „Przesunięto 1 blok”, „2 bloki”, „5 bloków”', () => {
    expect([1, 2, 5].map(pushedText)).toEqual(['Przesunięto 1 blok', 'Przesunięto 2 bloki', 'Przesunięto 5 bloków'])
  })
})

describe('D367, D372 – szablon: godziny osi zapisane w godzinach szablonu', () => {
  const b = (o: Partial<PlanBlock> = {}) => ({ ...flex('m', '06:00', 30), ...o })
  it('`unshiftedStart` odwraca przesunięcie poranka przez pobudkę dnia (`wakeShiftedStart`)', () => {
    // A day whose wake is an hour earlier than the template's shows a morning block at 05:00 that the template has at 06:00.
    expect(unshiftedStart(b(), lm('05:00'), -60, lm('07:00'))).toBe(lm('06:00'))
    expect(wakeShiftedStart(b({ startMin: lm('06:00') }), -60, lm('07:00'))).toBe(lm('05:00'))
    // No shift, a fixed or anchored block, a place the day shows unmoved (from the first fixed block on): the same hour.
    expect(unshiftedStart(b(), lm('05:00'), 0, lm('07:00'))).toBe(lm('05:00'))
    expect(unshiftedStart(b({ fixed: true }), lm('05:00'), -60, lm('07:00'))).toBe(lm('05:00'))
    expect(unshiftedStart(b({ anchor: 'x' }), lm('05:00'), -60, lm('07:00'))).toBe(lm('05:00'))
    expect(unshiftedStart(b(), lm('08:00'), -60, lm('07:00'))).toBe(lm('08:00'))

    // An earlier wake shows no morning block in the hour before the first fixed one: the first place after it (07:00).
    expect(unshiftedStart(b(), lm('06:30'), -60, lm('07:00'))).toBe(lm('07:00'))
    expect(shiftedStart(b(), unshiftedStart(b(), lm('06:30'), -60, lm('07:00')), -60, lm('07:00'))).toBe(lm('07:00'))
    // A later wake shows a place just after the first fixed block from two starts: the one after it, as it was put.
    expect(unshiftedStart(b(), lm('07:30'), 60, lm('07:00'))).toBe(lm('07:30'))
    expect(shiftedStart(b(), lm('07:30'), 60, lm('07:00'))).toBe(lm('07:30'))
    expect(unshiftedStart(b(), lm('06:30'), 60, lm('07:00'))).toBe(lm('05:30'))
    expect(shiftedStart(b(), lm('05:30'), 60, lm('07:00'))).toBe(lm('06:30'))
  })
})

describe('D367 – zapisane godziny to te, które prognoza pokaże po zapisie (przegląd J3)', () => {
  it('chroniony blok zostaje w łańcuchu prognozy: przesunięty, który go mija, staje za nim (a nie przed nim w planie, a za nim na osi)', () => {
    const plan = [flex('a', '11:00', 30), flex('obiad', '11:30', 30, 'posilek'), flex('c', '12:00', 60)]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '11:00', 45))
    const out = push(s, '08:00', changed, 'x')
    // The meal (protected, its plan 11:30) follows x at 11:50; a goes behind it, c behind a.
    expect(moves(out)).toEqual(['a 11:00→12:25–12:55', 'c 12:00→12:55–13:55'])
    const w = written(s, '08:00', changed, out)
    expect(w.at('obiad')).toEqual({ startMin: lm('11:50'), endMin: lm('12:20') })
  })

  it('bloki idące za wstawionym zachowują kolejność z osi (nie z identyfikatorów)', () => {
    // zz (planned 10:00) and aa (10:30) wait behind p and stand at 12:00 and 12:30; x put at 12:00 goes before both.
    const plan = [flex('p', '09:00', 180), flex('zz', '10:00', 30), flex('aa', '10:30', 30)]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '12:00', 60))
    const out = push(s, '08:00', changed, 'x')
    expect(moves(out)).toEqual(['zz 10:00→13:00–13:30', 'aa 10:30→13:30–14:00'])
    written(s, '08:00', changed, out)
  })

  it('za ostatnią minutą doby: zapis 03:59, na osi tam, gdzie postawi go prognoza – kolejność zostaje', () => {
    const plan = [flex('a', '02:00', 60), flex('b', '03:00', 60)]
    const s = day(plan)
    const changed = planWith(plan, flex('x', '02:00', 90))
    const out = push(s, '08:00', changed, 'x')
    expect(out.map((p) => [p.id, p.startMin, p.shown.startMin])).toEqual([
      ['a', lm('03:30'), lm('03:30')],
      ['b', PLAN_MAX, lm('04:30+1')]
    ])
    written(s, '08:00', changed, out)
  })

  it('doba 25-godzinna (24.10.2026, 02:00–02:59 dwa razy): blok, który trafiłby w drugą 02:xx, dostaje 03:00 – plan nie ma numeru tej minuty', () => {
    const date = '2026-10-24'
    const plan = [flex('a', '01:00', 60), flex('b', '02:00', 60)]
    const s = new Scenario({ date, plan }).observe('07:00', null)
    const changed = planWith(plan, flex('x', '01:00', 90))
    const out = push(s, '08:00', changed, 'x')
    // a: the first 02:30 to the second one; b after it would start at the second 02:30 – at 03:00.
    expect(out.map((p) => [p.id, p.startMin, p.shown.startMin, p.shown.endMin])).toEqual([
      ['a', lm('02:30'), lm('02:30'), lm('02:30')],
      ['b', lm('03:00'), lm('03:00'), lm('04:00+1')]
    ])
    written(s, '08:00', changed, out)
  })
})
