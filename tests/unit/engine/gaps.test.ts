/**
 * D368, D373 (FBL2b, domykanie luk): after an early end, a removal or a shortening, a gap of at least 10 min before the
 * next flexible block is one question („Luka 20 min · Przesuń resztę wcześniej · Zostaw”) until that block or another one
 * starts after it; „Przesuń” writes new starts of the flexible blocks up to the nearest fixed one – never before now, the
 * fixed, protected and begun ones in place. The forecast with the starts written shows them there.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { closeGap, freedByEdit, GAP_MIN, gapId, gapNow, gapText, logGapTriggers, type Freed, type Gap } from '@shared/engine/gaps'
import { idxOfLogical } from '@shared/engine/grid'
import type { PushedBlock } from '@shared/engine/pushApart'
import { isKnown, parseEvent, RULES_VERSION } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

const flex = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, origin: 'user' })
const fixed = (id: string, at: string, min: number, cat = 'inne') => block({ id, cat, at, min, fixed: true, origin: 'user' })

const day = (plan: PlanBlock[]) => new Scenario({ date: DATE, plan }).observe('07:00', null)

const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const moves = (out: readonly PushedBlock[]) => out.map((p) => `${p.id} ${clock(p.fromMin)}→${clock(p.startMin)}`)

/** The engine at `now` with the plan `plan` (default: the scenario's) and the gap it asks about. */
function at(s: Scenario, now: string, o: { plan?: PlanBlock[] } = {}) {
  const ctx = s.contextAt(s.at(now), o.plan ? { plan: o.plan } : {})
  const state = computeDay(ctx)
  return { ctx, state, gap: gapNow(ctx, state) }
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

/** The window's `plan.freed` (D375) – what `freedByEdit` gave – written at the instant `t` (ms). */
const freedEvent = (s: Scenario, f: Freed, t: number, computer?: string) => s.write([{ k: 'plan.freed', at: t, ...f }], t, computer)

/** An answer to a gap's question in the log (the bar's „Zostaw” or „Przesuń”). */
const answer = (s: Scenario, id: string, now: string, computer?: string) => s.raw({ k: 'question.answer', at: s.at(now), question: id, answer: 'leave', value: null }, now, computer)

describe('D368 – luka po wcześniejszym końcu', () => {
  const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]

  it('„Skończyłem” 20 min przed planem: jedno pytanie „Luka 20 min” przed kolejnym blokiem; „Przesuń” zapisuje nowe godziny kolejnych', () => {
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    const { ctx, state, gap } = at(s, '10:40')
    const triggers = logGapTriggers(state)
    expect(triggers).toHaveLength(1)
    // The id of the question is the id of the event of the end (its trigger).
    expect(gap).toEqual({ id: gapId(DATE, triggers[0]!.key), keys: [triggers[0]!.key], block: 'b', minutes: 20, tryMin: 20, startMin: lm('11:00'), fromMin: lm('10:40') })
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

  it('ręczny „Start” kolejnego bloku po „Skończyłem” działa jak „Dalej” (D375): luka przed blokiem po nim', () => {
    const s = day(plan).start('a', '10:00').end('a', '10:40').start('b', '10:41')
    const { ctx, state, gap } = at(s, '10:41')
    // „b” runs to 11:41, „c” stands at 12:00: 19 min empty (the early end freed 20).
    expect(gap).toMatchObject({ block: 'c', minutes: 19, fromMin: lm('11:41') })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['c 12:00→11:41'])
    // „b” begun at its planned hour (the gap waited through): the question is over.
    expect(at(day(plan).start('a', '10:00').end('a', '10:40').start('b', '11:00'), '11:00').gap).toBeNull()
  })

  it('pauza i wznowienie bloku zaczętego „Dalej” nie zapełnia luki za nim – pytanie zostaje', () => {
    const s = day(plan).start('a', '10:00')
    const t = s.at('10:40')
    s.write(
      [
        { k: 'block.end', block: 'a', at: t, done: true, rule: null },
        { k: 'block.start', block: 'b', at: t, bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false }, confirmUntil: null, how: 'click' }
      ],
      t
    )
    s.pause('b', '10:50').resume('b', '10:55')
    // „b” ends at 11:45 now (5 min of pause): 15 min empty before „c”.
    expect(at(s, '10:55').gap).toMatchObject({ block: 'c', minutes: 15 })
  })

  it('skrócony trwający blok po pauzie i wznowieniu – pytanie zostaje (biegł przy wyzwalaczu)', () => {
    const s = day(plan).start('a', '10:00').raw({ k: 'block.shorten', block: 'a', at: day(plan).at('10:10'), minutes: 20 }, '10:10')
    s.pause('a', '10:15').resume('a', '10:20')
    // „a” ends at 10:45 (5 min of pause): 15 min empty before „b”.
    expect(at(s, '10:20').gap).toMatchObject({ block: 'b', minutes: 15 })
  })

  it('skrócenie trwającego bloku (krawędź, `block.shorten`) o 20 min: luka przed kolejnym', () => {
    const s = day(plan).start('a', '10:00').raw({ k: 'block.shorten', block: 'a', at: day(plan).at('10:10'), minutes: 20 }, '10:10')
    const { gap } = at(s, '10:10')
    expect(gap).toMatchObject({ block: 'b', minutes: 20, fromMin: lm('10:40') })
  })

  it('zaparkowanie zaczętego, zapauzowanego bloku (D375, koniec `park`): luka po nim przed kolejnym – najwyżej to, czego nie zrobiono', () => {
    const s = day(plan).start('a', '10:00').pause('a', '10:20').raw({ k: 'block.end', block: 'a', at: day(plan).at('10:30'), done: false, rule: 'park' }, '10:30')
    const { ctx, state, gap } = at(s, '10:30')
    // 40 min of „a” were not done, 30 min stand empty before „b” – from now.
    expect(gap).toMatchObject({ block: 'b', minutes: 30, fromMin: lm('10:30') })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['b 11:00→10:30', 'c 12:00→11:30'])
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
    freedEvent(s, { block: 'y', how: 'remove', place: s.at('14:00'), minutes: 60 }, s.at('10:40') + 30_000)
    const first = at(s, '10:41', { plan: without }).gap!
    expect(first).toMatchObject({ block: 'b', minutes: 19 })
    answer(s, first.id, '10:42')
    expect(at(s, '10:43', { plan: without }).gap).toMatchObject({ block: 'z', minutes: 60, fromMin: lm('14:00') })
  })
})

describe('D368 – usunięcie i skrócenie w oknie (`freedByEdit`)', () => {
  it('usunięty blok niezaczęty: luka przed następnym; zaplanowany wcześniej wolny czas zostaje', () => {
    const plan = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '13:00', 60)]
    const s = day(plan)
    const before = at(s, '09:00').state
    const freed = freedByEdit(before, plan[1]!, null)
    expect(freed).toEqual({ block: 'x', how: 'remove', place: s.at('12:00'), minutes: 60 })
    const without = plan.filter((b) => b.id !== 'x')
    // Without the event (an older version's window): no question.
    expect(at(s, '09:00', { plan: without }).gap).toBeNull()
    freedEvent(s, freed!, s.at('09:00'))
    const { ctx, state, gap } = at(s, '09:00', { plan: without })
    // 2 h stand empty before „c” (11:00–13:00), the removal freed 1 h: „c” goes to 12:00.
    expect(gap).toMatchObject({ block: 'c', minutes: 60 })
    expect(gapText(gap!.minutes)).toBe('Luka 1 h')
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['c 13:00→12:00'])
  })

  it('skrócenie „Długością” albo dolną krawędzią: zwolniony koniec; górna krawędź, przeniesienie i mniej niż 10 min – nic', () => {
    const plan = [flex('a', '10:00', 80), flex('b', '11:20', 60)]
    const st = at(day(plan), '09:00').state
    const a = plan[0]!
    expect(freedByEdit(st, a, { ...a, durationMin: 30 })).toEqual({ block: 'a', how: 'shorten', place: day(plan).at('10:30'), minutes: 50, end: day(plan).at('10:30') })
    expect(freedByEdit(st, a, { ...a, startMin: lm('10:30'), durationMin: 50 })).toBeNull()
    expect(freedByEdit(st, a, { ...a, startMin: lm('09:00') })).toBeNull()
    expect(freedByEdit(st, a, { ...a, durationMin: 75 })).toBeNull()
    const s = day(plan)
    freedEvent(s, freedByEdit(st, a, { ...a, durationMin: 30 })!, s.at('09:00'))
    expect(at(s, '09:00', { plan: [{ ...a, durationMin: 30 }, plan[1]!] }).gap).toMatchObject({ block: 'b', minutes: 50, fromMin: lm('10:30') })
  })

  it('`plan.freed` z drugiego komputera (D375): to samo pytanie tutaj; „Zostaw” z dowolnego zamyka je wszędzie', () => {
    const plan = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '13:00', 60)]
    const s = day(plan)
    freedEvent(s, freedByEdit(at(s, '09:00').state, plan[1]!, null)!, s.at('09:00'), 'pcb')
    const without = plan.filter((b) => b.id !== 'x')
    const { gap } = at(s, '09:01', { plan: without })
    expect(gap).toMatchObject({ id: gapId(DATE, logGapTriggers(at(s, '09:01', { plan: without }).state)[0]!.key), block: 'c', minutes: 60 })
    answer(s, gap!.id, '09:02')
    expect(at(s, '09:03', { plan: without }).gap).toBeNull()
  })

  it('`plan.freed`: znane zdarzenie z blokiem, chwilą miejsca i minutami 1–1440; inne – uszkodzone; starsze logi bez niego bez zmian', () => {
    const line = (o: Record<string, unknown>) => JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: 0, l: 0, v: RULES_VERSION, day: DATE, dom: 'timer', k: 'plan.freed', at: 0, block: 'x', how: 'remove', place: 0, minutes: 60, ...o })
    const ok = parseEvent(line({}))
    expect(ok.ok && isKnown(ok.event)).toBe(true)
    expect(parseEvent(line({ minutes: 0 })).ok).toBe(false)
    expect(parseEvent(line({ minutes: 12.5 })).ok).toBe(false)
    expect(parseEvent(line({ place: null })).ok).toBe(false)
    expect(parseEvent(line({ block: '' })).ok).toBe(false)
    expect(parseEvent(line({ how: 'move' })).ok).toBe(false)
    // A day without it: no trigger of the window.
    expect(computeDay(day([flex('a', '10:00', 60)]).contextAt(day([]).at('09:00'))).facts.freed).toEqual([])
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
  const g: Pick<Gap, 'block' | 'tryMin'> = { block: 'nie-ma', tryMin: 20 }
  const { ctx, state } = at(day([flex('a', '10:00', 60)]), '09:00')
  expect(closeGap(ctx, state, g)).toEqual([])
})

/** „Dalej” of `from` at `hhmm`: its end and the start of `to` in one click (the same instant and computer). */
function dalej(s: Scenario, from: string, to: string, hhmm: string, min = 60): Scenario {
  const t = s.at(hhmm)
  return s.write(
    [
      { k: 'block.end', block: from, at: t, done: true, rule: null },
      { k: 'block.start', block: to, at: t, bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: min, tag: null, fixed: false }, confirmUntil: null, how: 'click' }
    ],
    t
  )
}

describe('przegląd J4 – runda 1', () => {
  const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]

  it('(1) odwołanie 10:05:40 i „Zostaw” 10:05:45: pytanie znika – kolejność zdarzenia odwołania, nie jego minuta', () => {
    const s = day(plan)
    const t = s.at('10:05') + 40_000
    s.write([{ k: 'block.cancel', block: 'b', at: t, rule: 'user' }], t)
    const c1 = s.contextAt(t + 2_000)
    const g = gapNow(c1, computeDay(c1))
    expect(g).toMatchObject({ block: 'c' })
    s.write([{ k: 'question.answer', at: t + 5_000, question: g!.id, answer: 'leave', value: null }], t + 5_000)
    const c2 = s.contextAt(t + 6_000)
    expect(gapNow(c2, computeDay(c2))).toBeNull()
  })

  it('(2, 7) usuń → „Cofnij” → usuń znowu: po „Cofnij” bez pytania, potem nowe pytanie z własnym identyfikatorem', () => {
    const p = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '13:00', 60)]
    const s = day(p)
    const without = p.filter((b) => b.id !== 'x')
    const f = freedByEdit(at(s, '09:00').state, p[1]!, null)!
    freedEvent(s, f, s.at('09:00'))
    const first = at(s, '09:01', { plan: without }).gap!
    expect(first).toMatchObject({ block: 'c', minutes: 60 })
    answer(s, first.id, '09:02')
    // „Cofnij”: x stands where it stood – its freeing is over.
    expect(at(s, '09:05').gap).toBeNull()
    freedEvent(s, f, s.at('09:10'))
    const second = at(s, '09:11', { plan: without }).gap!
    expect(second).toMatchObject({ block: 'c', minutes: 60 })
    expect(second.id).not.toBe(first.id)
  })

  it('(4) „Zostaw”, potem wcześniejszy start bloku po luce: ten sam wyzwalacz nie pyta drugi raz (o blok za nim)', () => {
    const s = day(plan).start('a', '10:00').end('a', '10:40')
    answer(s, at(s, '10:40').gap!.id, '10:40')
    s.start('b', '10:41')
    expect(at(s, '10:42').gap).toBeNull()
  })

  it('(5) dzień spóźniony: „Dalej”, „Skończyłem” + „Start” i samo „Skończyłem” – luka przed blokiem za następnym', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:30', 60)]
    expect(at(dalej(day(p).start('a', '10:30'), 'a', 'b', '11:10'), '11:10').gap).toMatchObject({ block: 'c', minutes: 20 })
    expect(at(day(p).start('a', '10:30').end('a', '11:10').start('b', '11:11'), '11:11').gap).toMatchObject({ block: 'c', minutes: 19 })
    // „b” is due now (its hour passed): the time freed stands before „c” at once.
    expect(at(day(p).start('a', '10:30').end('a', '11:10'), '11:10').gap).toMatchObject({ block: 'c', minutes: 20 })
  })

  it('(6) łańcuch: „Skończyłem”, „Start” następnego i „Dalej” do kolejnego – jak sam „Dalej” (pytanie o lukę przed d)', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 30), flex('c', '11:30', 30), flex('d', '12:30', 60)]
    const pure = dalej(dalej(day(p).start('a', '10:00'), 'a', 'b', '10:30', 30), 'b', 'c', '11:00', 30)
    expect(at(pure, '11:00').gap).toMatchObject({ block: 'd', minutes: 30 })
    const hand = dalej(day(p).start('a', '10:00').end('a', '10:30').start('b', '10:31'), 'b', 'c', '11:01', 30)
    // A minute waited after „Skończyłem”: one minute less.
    expect(at(hand, '11:01').gap).toMatchObject({ block: 'd', minutes: 29 })
  })

  it('(5, 6) łańcuch „Dalej” z przedłużeniem: przedłużony blok zużywa zwolniony czas – bez pytania o blok dalej', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60), flex('d', '14:00', 60)]
    const s = dalej(day(p).start('a', '10:00'), 'a', 'b', '10:40')
    s.raw({ k: 'block.extend', block: 'b', at: s.at('11:30'), minutes: 20 }, '11:30')
    expect(at(dalej(s, 'b', 'c', '12:00'), '12:00').gap).toBeNull()
    // „Przedłuż” +10: 10 of the 20 min are left, before „d”.
    const ten = dalej(day(p).start('a', '10:00'), 'a', 'b', '10:40')
    ten.raw({ k: 'block.extend', block: 'b', at: ten.at('11:30'), minutes: 10 }, '11:30')
    expect(at(dalej(ten, 'b', 'c', '11:50'), '11:50').gap).toMatchObject({ block: 'd', minutes: 10 })
    // Without „Przedłuż”: the 20 min stand before „d” (the hour planned between „c” and „d” stays).
    expect(at(dalej(dalej(day(p).start('a', '10:00'), 'a', 'b', '10:40'), 'b', 'c', '11:40'), '11:40').gap).toMatchObject({ block: 'd', minutes: 20 })
  })

  it('(7) usunięcie, „Cofnij” i przeniesienie bloku – bez pytania; skrócenie wydłużone z powrotem – też', () => {
    const p = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '13:00', 60)]
    const s = day(p)
    freedEvent(s, freedByEdit(at(s, '09:00').state, p[1]!, null)!, s.at('09:00'))
    expect(at(s, '09:10', { plan: p.map((b) => (b.id === 'x' ? { ...b, startMin: lm('15:00') } : b)) }).gap).toBeNull()
    const q = [flex('a', '10:00', 80), flex('b', '11:20', 60)]
    const s2 = day(q)
    const short = { ...q[0]!, durationMin: 30 }
    freedEvent(s2, freedByEdit(at(s2, '09:00').state, q[0]!, short)!, s2.at('09:00'))
    expect(at(s2, '09:05', { plan: [short, q[1]!] }).gap).toMatchObject({ block: 'b', minutes: 50 })
    expect(at(s2, '09:10').gap).toBeNull()
  })

  it('(9) bufor przejścia między kategoriami zostaje: linia podaje tyle, ile „Przesuń” naprawdę zamknie', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60, 'nauka')]
    const s = dalej(day(p).start('a', '10:00'), 'a', 'b', '10:40')
    const { ctx, state, gap } = at(s, '10:40')
    // „b” ends at 11:40, „c” of another category waits 5 min after it.
    expect(gap).toMatchObject({ block: 'c', minutes: 15, fromMin: lm('11:45') })
    expect(moves(closeGap(ctx, state, gap!))).toEqual(['c 12:00→11:45'])
  })

  it('(10) dwa wyzwalacze przed jednym blokiem: identyfikator pytania nie zmienia się sam z czasem', () => {
    const p = [flex('a', '10:00', 60), flex('x', '11:00', 30), flex('b', '11:30', 60)]
    const s = day(p).start('a', '10:00')
    freedEvent(s, { block: 'x', how: 'remove', place: s.at('11:00'), minutes: 30 }, s.at('10:20'))
    s.end('a', '10:40')
    const without = p.filter((b) => b.id !== 'x')
    const early = at(s, '10:41', { plan: without }).gap!
    expect(early).toMatchObject({ block: 'b', minutes: 49 })
    const late = at(s, '11:12', { plan: without }).gap!
    expect(late.id).toBe(early.id)
    // 18 of the 50 min freed are left (32 min waited) – the plan had no break before „b”.
    expect(late.minutes).toBe(18)
  })

  it('(15) usunięcie bloku z zakotwiczonym za nim: zwolniony cały czas, który znika z planu', () => {
    const p = [flex('a', '10:00', 60), flex('x', '12:00', 60), block({ id: 'j', cat: 'inne', after: 'x', min: 15, origin: 'user' }), flex('c', '13:30', 60)]
    const s = day(p)
    expect(freedByEdit(at(s, '09:00').state, p[1]!, null)).toEqual({ block: 'x', how: 'remove', place: s.at('12:00'), minutes: 75 })
  })
})

describe('przegląd J4 – runda 2', () => {
  const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]

  it('(1) usuń → „Cofnij” → usuń znowu: liczy się tylko nowsze zdarzenie tego bloku (bez podwójnego zwolnienia)', () => {
    const p = [flex('a', '10:00', 60), flex('x', '12:00', 60), flex('c', '14:00', 60)]
    const s = day(p)
    const without = p.filter((b) => b.id !== 'x')
    const f = freedByEdit(at(s, '09:00').state, p[1]!, null)!
    freedEvent(s, f, s.at('09:00'))
    freedEvent(s, f, s.at('09:10'))
    const { gap, state } = at(s, '09:11', { plan: without })
    expect(logGapTriggers(state)).toHaveLength(1)
    // 2 h empty before „c” (12:00–14:00 – an hour planned before it stays): 60 min, not 120.
    expect(gap).toMatchObject({ block: 'c', minutes: 60, keys: [logGapTriggers(state)[0]!.key] })
    // Shortened, lengthened back and shortened again: the same.
    const q = [flex('a', '10:00', 80), flex('b', '12:00', 60)]
    const s2 = day(q)
    const short = freedByEdit(at(s2, '09:00').state, q[0]!, { ...q[0]!, durationMin: 30 })!
    freedEvent(s2, short, s2.at('09:00'))
    freedEvent(s2, short, s2.at('09:10'))
    expect(at(s2, '09:11', { plan: [{ ...q[0]!, durationMin: 30 }, q[1]!] }).gap).toMatchObject({ block: 'b', minutes: 50 })
  })

  it('(1) dwa skrócenia jednego bloku po sobie: oba zwolnienia się liczą (różne miejsca)', () => {
    const q = [flex('a', '10:00', 80), flex('b', '12:00', 60)]
    const s = day(q)
    freedEvent(s, freedByEdit(at(s, '09:00').state, q[0]!, { ...q[0]!, durationMin: 50 })!, s.at('09:00'))
    const fifty = [{ ...q[0]!, durationMin: 50 }, q[1]!]
    freedEvent(s, freedByEdit(at(s, '09:05', { plan: fifty }).state, fifty[0]!, { ...q[0]!, durationMin: 30 })!, s.at('09:05'))
    expect(at(s, '09:06', { plan: [{ ...q[0]!, durationMin: 30 }, q[1]!] }).gap).toMatchObject({ block: 'b', minutes: 50 })
  })

  it('(2) skrócony blok, który się spóźnia: wyzwalacz zostaje (koniec w planie, nie w prognozie)', () => {
    const q = [flex('a', '10:00', 80), flex('b', '11:20', 60)]
    const s = day(q)
    const short = { ...q[0]!, durationMin: 30 }
    freedEvent(s, freedByEdit(at(s, '09:00').state, q[0]!, short)!, s.at('09:00'))
    const late = at(s, '10:02', { plan: [short, q[1]!] })
    expect(logGapTriggers(late.state)).toHaveLength(1)
    // „a” due now (10:02–10:32): 48 min before „b”.
    expect(late.gap).toMatchObject({ block: 'b', minutes: 48 })
  })

  it('(4) usunięcie z zakotwiczonym, a między nimi prognoza wstawia stały blok: zwolnione = długości usuniętych bloków', () => {
    const p = [flex('a', '10:00', 60), flex('x', '12:00', 60), block({ id: 'j', cat: 'inne', after: 'x', min: 15, origin: 'user' }), fixed('s', '13:00', 60), flex('c', '15:00', 60)]
    const s = day(p)
    const f = freedByEdit(at(s, '09:00').state, p[1]!, null)!
    expect(f.minutes).toBe(75)
  })

  it('(5) identyfikator grupy stały przez całe życie pytania – także gdy zapas najwcześniejszego wyzwalacza się skończył', () => {
    const p = [flex('a', '10:00', 60), flex('x', '11:00', 30), flex('b', '11:30', 60)]
    const s = day(p).start('a', '10:00').end('a', '10:40')
    // „x” removed at 10:41 (its place 11:00, 30 min freed): two triggers before „b”, the end of „a” the earliest.
    freedEvent(s, { block: 'x', how: 'remove', place: s.at('11:00'), minutes: 30 }, s.at('10:41'))
    const without = p.filter((b) => b.id !== 'x')
    const early = at(s, '10:42', { plan: without }).gap!
    expect(early.keys).toHaveLength(2)
    // 11:05: the end of „a” has nothing left (25 min waited, 20 freed) – the question and its id stay.
    const late = at(s, '11:05', { plan: without }).gap!
    expect(late.id).toBe(early.id)
    expect(late.minutes).toBe(25)
  })

  it('(7) „Start” bloku dalszego niż następny należny (pominięty blok, którego godzina minęła): luka wypełniona (D376)', () => {
    const p = [flex('a', '10:00', 60), flex('b', '10:20', 20), flex('c', '10:30', 20), flex('d', '12:00', 60)]
    const s = day(p).start('a', '10:00').end('a', '10:40').start('c', '10:41')
    expect(at(s, '10:41').gap).toBeNull()
  })

  it('(8) odwołanie przez Ciebie, potem zaparkowanie przy wymianie: wyzwalacz z pierwszego zdarzenia (reguła, id i kolejność razem)', () => {
    const s = day(plan)
    s.raw({ k: 'block.cancel', block: 'b', at: s.at('10:05'), rule: 'user' }, '10:05')
    s.raw({ k: 'block.park', block: 'b', at: s.at('10:06'), rule: 'exchange' }, '10:06')
    const { state, gap } = at(s, '10:06')
    expect(logGapTriggers(state)).toHaveLength(1)
    expect(gap).toMatchObject({ block: 'c' })
  })

  it('(9) blok niosący lukę przeniesiony w tło po swojej długości: minuty w tle zużywają zapas raz, nie dwa razy', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 20), flex('c', '12:30', 60)]
    const s = dalej(day(p).start('a', '10:00'), 'a', 'b', '10:40', 20)
    // „b” (20 min) to the background at 11:00 and on there to 11:10: 10 min of the foreground with no block.
    s.raw({ k: 'block.fg', block: 'b', at: s.at('11:00'), bg: true }, '11:00')
    s.raw({ k: 'block.end', block: 'b', at: s.at('11:10'), done: true, rule: null }, '11:10')
    // 20 freed, 10 used up: 10 left before „c” (12:30 – 80 min empty after „b”).
    expect(at(s, '11:10').gap).toMatchObject({ block: 'c', minutes: 10 })
  })
})
