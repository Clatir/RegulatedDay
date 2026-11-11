/**
 * D368, D373 (FBL2b, domykanie luk): after an early end, a removal or a shortening, a gap of at least 10 min before the
 * next flexible block is one question („Luka 20 min · Przesuń resztę wcześniej · Zostaw”) until that block or another one
 * starts after it; „Przesuń” writes new starts of the flexible blocks up to the nearest fixed one – never before now, the
 * fixed, protected and begun ones in place. The forecast with the starts written shows them there.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { closeGap, freedByEdit, GAP_MIN, gapNow, gapText, instantOrder, logGapTriggers, type Gap, type GapTrigger } from '@shared/engine/gaps'
import { idxOfLogical } from '@shared/engine/grid'
import type { PushedBlock } from '@shared/engine/pushApart'
import type { PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

const flex = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, origin: 'user' })
const fixed = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, fixed: true, origin: 'user' })

const day = (plan: PlanBlock[]) => new Scenario({ date: DATE, plan }).observe('07:00', null)

const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const moves = (out: readonly PushedBlock[]) => out.map((p) => `${p.id} ${clock(p.fromMin)}→${clock(p.startMin)}`)

/** The engine at `now` with the plan `plan` (default: the scenario's) and the gap it asks about. */
function at(s: Scenario, now: string, o: { plan?: PlanBlock[]; extra?: GapTrigger[] } = {}) {
  const ctx = s.contextAt(s.at(now), o.plan ? { plan: o.plan } : {})
  const state = computeDay(ctx)
  return { ctx, state, gap: gapNow(ctx, state, o.extra ?? []) }
}

/** The day counted again with the starts of „Przesuń” written: where the forecast shows each block (logical minutes). */
function closed(s: Scenario, now: string, plan: readonly PlanBlock[], out: readonly PushedBlock[]) {
  const written = plan.map((b) => ({ ...b, startMin: out.find((p) => p.id === b.id)?.startMin ?? b.startMin }))
  const st = computeDay(s.contextAt(s.at(now), { plan: written }))
  const shown = (id: string) => st.forecast.find((p) => p.block.id === id)!
  for (const p of out) expect(idxOfLogical(st.grid, p.startMin), p.id).toBe(shown(p.id).from)
  const fg = st.forecast.filter((p) => !p.bg).sort((a, b) => a.from - b.from)
  for (let k = 1; k < fg.length; k++) expect(fg[k]!.from, `${fg[k]!.block.id} po ${fg[k - 1]!.block.id}`).toBeGreaterThanOrEqual(fg[k - 1]!.to)
  return { plan: written, state: st }
}

/** An answer to a gap's question in the log (the bar's „Zostaw” or „Przesuń”). */
const answer = (s: Scenario, id: string, now: string, computer?: string) => s.raw({ k: 'question.answer', at: s.at(now), question: id, answer: 'leave', value: null }, now, computer)

describe('D368 – luka po wcześniejszym końcu', () => {
  const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]

  it('„Skończyłem” 20 min przed planem: jedno pytanie „Luka 20 min” przed kolejnym blokiem; „Przesuń” zapisuje nowe godziny kolejnych', () => {
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    const { ctx, state, gap } = at(s, '10:40')
    expect(logGapTriggers(state)).toHaveLength(1)
    expect(gap).toEqual({ id: `gap:${DATE}:b:${lm('10:40')}`, block: 'b', minutes: 20, startMin: lm('11:00'), fromMin: lm('10:40') })
    expect(gapText(gap!.minutes)).toBe('Luka 20 min')
    const out = closeGap(ctx, state, gap!)
    expect(moves(out)).toEqual(['b 11:00→10:40', 'c 12:00→11:40'])
    const w = closed(s, '10:40', plan, out)
    // Closed: no gap left – no question.
    expect(gapNow(s.contextAt(s.at('10:40'), { plan: w.plan }), w.state)).toBeNull()
  })

  it('luka 5 min – bez pytania (także gdy blok skończył się 10 min wcześniej, a za nim był zaplanowany odstęp 5 min)', () => {
    expect(at(day(plan).start('a', '10:00').end('a', '10:55'), '10:55').gap).toBeNull()
    const near = [flex('a', '10:00', 60), flex('b', '10:55', 60)]
    expect(at(day(near).start('a', '10:00').end('a', '10:50'), '10:50').gap).toBeNull()
  })

  it('luka liczona od teraz: nigdy przed bieżącą chwilą – blok idzie na teraz, nie na koniec poprzedniego', () => {
    const s = day(plan).start('a', '10:00').end('a', '10:30')
    const { ctx, state, gap } = at(s, '10:45')
    expect(gap).toMatchObject({ block: 'b', minutes: 15, fromMin: lm('10:45') })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['b 11:00→10:45', 'c 12:00→11:45'])
    // Under 10 min left – the question is over by itself.
    expect(at(s, '10:51').gap).toBeNull()
  })

  it('luka nie dłuższa niż to, co zwolniło zdarzenie: odstęp zaplanowany za blokiem zostaje', () => {
    const withBreak = [flex('a', '10:00', 60), flex('b', '11:30', 60)]
    const s = day(withBreak).start('a', '10:00').end('a', '10:40')
    const { ctx, state, gap } = at(s, '10:40')
    // 50 min stand empty, the early end freed 20 of them: the planned 30 min break stays.
    expect(gap).toMatchObject({ block: 'b', minutes: 20 })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['b 11:30→11:10'])
  })

  it('„Dalej” 20 min przed planem: następny zaczyna się od razu, luka przed tym po nim', () => {
    const s = day(plan).start('a', '10:00')
    const t = s.at('10:40')
    // One click: the end of „a” and the start of „b” with the same instant and computer.
    s.write(
      [
        { k: 'block.end', block: 'a', at: t, done: true, rule: null },
        { k: 'block.start', block: 'b', at: t, bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false }, confirmUntil: null, how: 'click' }
      ],
      t
    )
    const { ctx, state, gap } = at(s, '10:40')
    expect(gap).toMatchObject({ block: 'c', minutes: 20 })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['c 12:00→11:40'])
  })

  it('skrócenie trwającego bloku (krawędź, `block.shorten`) o 20 min: luka przed kolejnym', () => {
    const s = day(plan).start('a', '10:00').raw({ k: 'block.shorten', block: 'a', at: day(plan).at('10:10'), minutes: 20 }, '10:10')
    const { gap } = at(s, '10:10')
    expect(gap).toMatchObject({ block: 'b', minutes: 20, fromMin: lm('10:40') })
  })

  it('„Usuń” zaczętego bloku (koniec `removed`) zwalnia resztę jego czasu', () => {
    const s = day(plan).start('a', '10:00').raw({ k: 'block.end', block: 'a', at: day(plan).at('10:20'), done: false, rule: 'removed' }, '10:20')
    expect(at(s, '10:20', { plan: plan.filter((b) => b.id !== 'a') }).gap).toMatchObject({ block: 'b', minutes: 40 })
  })
})

describe('D373 – jak długo pytanie czeka i co przesuwa', () => {
  it('start kolejnego bloku kończy pytanie – stara luka nie pyta potem o blok za zaplanowaną przerwą', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('d', '13:00', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    expect(at(s, '10:41').gap?.block).toBe('b')
    s.start('b', '11:00').end('b', '12:00')
    // 12:00–13:00 is a break planned before „d”: the early end of „a” asked about „b”, which started.
    expect(at(s, '12:01').gap).toBeNull()
  })

  it('blok zaczęty w luce ją wypełnia: pytanie znika bez odpowiedzi, nic się nie zmienia', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:30').start('x', '10:35', { cat: 'regeneracja', min: 15 })
    expect(at(s, '10:36').gap).toBeNull()
  })

  it('„Zostaw” – pytanie znika dla tej luki (odpowiedź z drugiego komputera też); nowa luka pyta od nowa', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    const id = at(s, '10:40').gap!.id
    answer(s, id, '10:41', 'pcb')
    expect(at(s, '10:42').gap).toBeNull()
    // „b” runs and ends 20 min early: a new gap before „c” (35 min empty, 20 freed), a new question.
    s.start('b', '10:45').end('b', '11:25')
    expect(at(s, '11:25').gap).toMatchObject({ block: 'c', minutes: 20 })
  })

  it('„Zostaw” z komputera, którego zegar jest 3 min z tyłu: pytanie znika i tu (kolejność zegarem logicznym, nie godziną zdarzenia)', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    const id = at(s, '10:40').gap!.id
    // PC B saw the end of „a” (its logical clock moved past it) and answered at 10:41 by the clock – its wall clock says 10:38.
    const wall = s.at('10:38')
    s.write([{ k: 'question.answer', at: wall, question: id, answer: 'leave', value: null, l: s.at('10:41') }], wall, 'pcb')
    expect(at(s, '10:42').gap).toBeNull()
  })

  it('przesuwa tylko elastyczne do najbliższego stałego: stały i bloki za nim zostają', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 30), fixed('zajecia', '12:00', 60), flex('d', '13:30', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:30')
    const { ctx, state, gap } = at(s, '10:30')
    expect(gap).toMatchObject({ block: 'b', minutes: 30 })
    const out = closeGap(ctx, state, gap!)
    expect(moves(out)).toEqual(['b 11:00→10:30'])
    const w = closed(s, '10:30', plan, out)
    expect(w.plan.find((b) => b.id === 'zajecia')!.startMin).toBe(lm('12:00'))
    // „d” has 30 min free after the classes: it stays there all the same.
    expect(w.plan.find((b) => b.id === 'd')!.startMin).toBe(lm('13:30'))
  })

  it('chroniony blok zostaje, reszta go omija (bez zmiany kolejności); chroniony zaraz po luce – bez pytania', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 30), flex('obiad', '11:30', 30, 'posilek'), flex('c', '12:05', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:30')
    const { ctx, state, gap } = at(s, '10:30')
    const out = closeGap(ctx, state, gap!)
    // „b” closes the gap; the meal stays at 11:30, „c” stays behind it (5 min of transition) – nothing in front of it.
    expect(moves(out)).toEqual(['b 11:00→10:30'])
    closed(s, '10:30', plan, out)
    const meal = [flex('a', '10:00', 60), flex('obiad', '11:00', 30, 'posilek'), flex('c', '11:35', 60)]
    expect(at(day(meal).start('a', '10:00').end('a', '10:30'), '10:30').gap).toBeNull()
  })

  it('luka przed blokiem stałym – bez pytania (stały zostaje)', () => {
    const plan = [flex('a', '10:00', 60), fixed('sesja', '11:00', 60), flex('c', '12:00', 60)]
    expect(at(day(plan).start('a', '10:00').end('a', '10:30'), '10:30').gap).toBeNull()
  })

  it('kilka luk naraz: jedno pytanie o najbliższą; po odpowiedzi – o następną, jeśli dalej ≥ 10 min', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('y', '14:00', 60), flex('z', '15:00', 60)]
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    // „y” removed in the main window at 10:40 (its place 14:00, 60 min freed).
    const without = plan.filter((b) => b.id !== 'y')
    const grid = computeDay(s.contextAt(s.at('10:40'))).grid
    const removal: GapTrigger = { place: idxOfLogical(grid, lm('14:00')), freedMin: 60, order: instantOrder(s.at('10:40') + 30_000) }
    const first = at(s, '10:41', { plan: without, extra: [removal] }).gap!
    expect(first).toMatchObject({ block: 'b', minutes: 19 })
    answer(s, first.id, '10:42')
    expect(at(s, '10:43', { plan: without, extra: [removal] }).gap).toMatchObject({ block: 'z', minutes: 60, fromMin: lm('14:00') })
  })
})

describe('D368 – usunięcie i skrócenie w oknie (`freedByEdit`)', () => {
  it('usunięty blok niezaczęty: luka przed następnym; zaplanowany wcześniej wolny czas zostaje', () => {
    const plan = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '13:00', 60)]
    const s = day(plan)
    const before = at(s, '09:00').state
    const freed = freedByEdit(before, plan[1]!, null)
    expect(freed).toEqual({ placeMin: lm('12:00'), freedMin: 60 })
    const without = plan.filter((b) => b.id !== 'x')
    const trigger: GapTrigger = { place: idxOfLogical(before.grid, freed!.placeMin), freedMin: freed!.freedMin, order: instantOrder(s.at('09:00')) }
    const { ctx, state, gap } = at(s, '09:00', { plan: without, extra: [trigger] })
    // 2 h stand empty before „c” (11:00–13:00), the removal freed 1 h: „c” goes to 12:00.
    expect(gap).toMatchObject({ block: 'c', minutes: 60 })
    expect(gapText(gap!.minutes)).toBe('Luka 1 h')
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['c 13:00→12:00'])
  })

  it('skrócenie „Długością” albo dolną krawędzią: zwolniony koniec; górna krawędź, przeniesienie i mniej niż 10 min – nic', () => {
    const plan = [flex('a', '10:00', 80), flex('b', '11:20', 60)]
    const st = at(day(plan), '09:00').state
    const a = plan[0]!
    expect(freedByEdit(st, a, { ...a, durationMin: 30 })).toEqual({ placeMin: lm('10:30'), freedMin: 50 })
    expect(freedByEdit(st, a, { ...a, startMin: lm('10:30'), durationMin: 50 })).toBeNull()
    expect(freedByEdit(st, a, { ...a, startMin: lm('09:00') })).toBeNull()
    expect(freedByEdit(st, a, { ...a, durationMin: 75 })).toBeNull()
    const s = day(plan)
    const trigger: GapTrigger = { place: idxOfLogical(st.grid, lm('10:30')), freedMin: 50, order: instantOrder(s.at('09:00')) }
    expect(at(s, '09:00', { plan: [{ ...a, durationMin: 30 }, plan[1]!], extra: [trigger] }).gap).toMatchObject({ block: 'b', minutes: 50, fromMin: lm('10:30') })
  })

  it('blok zaczęty – nic (zdarzenie w logu mówi samo); bez pytania przed teraz', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60)]
    const s = day(plan).start('a', '10:00')
    expect(freedByEdit(at(s, '10:10').state, plan[0]!, null)).toBeNull()
    // A fixed block whose window passed is not in the forecast any more.
    const f = fixed('f', '10:00', 60)
    expect(freedByEdit(at(day([f, ...plan.slice(1)]), '12:00').state, f, null)).toBeNull()
  })
})

it('próg luki to 10 min (D368)', () => {
  expect(GAP_MIN).toBe(10)
  expect(gapText(80)).toBe('Luka 1 h 20 min')
  const g: Pick<Gap, 'block' | 'minutes'> = { block: 'nie-ma', minutes: 20 }
  const { ctx, state } = at(day([flex('a', '10:00', 60)]), '09:00')
  expect(closeGap(ctx, state, g)).toEqual([])
})
