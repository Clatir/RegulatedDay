/**
 * Zmiany grupowe bloków (D527–D531, ciąg Z, część A – czysta logika `engine/groupEdit.ts`): które bloki działanie bierze – każdy według
 * reguły, jaką ma sam (panel, kafelek D501, przeciąganie D305, „Odwołaj” / „Zaparkuj” timera), a reszta jest pominięta z powodem (D529,
 * D72); plik dnia po zmianie jedną zmianą z rozsunięciem (D367); „Przenieś na dzień” z zachowaniem godzin; „Cofnij” tylko zmienionych pól,
 * blok zmieniony od tego czasu zostaje (D313); energia przed i po; zdarzenia „Odwołaj” / „Zaparkuj” i ich „Cofnij”.
 */
import { describe, expect, it } from 'vitest'
import { blockJson, type Raw } from '@shared/data/dayEdits'
import { computeDay } from '@shared/engine/day'
import { idxOfLogical } from '@shared/engine/grid'
import {
  axisStartOf,
  fieldDay,
  fieldsUndoOf,
  groupFreed,
  groupEnergy,
  groupLogDrafts,
  groupLogUndo,
  judgeGroup,
  movedDays,
  removedDay,
  shiftedDay,
  undoFields,
  undoRemoval,
  type GroupAction,
  type GroupDay
} from '@shared/engine/groupEdit'
import { stayRuleOf } from '@shared/engine/planEdit'
import { pushApart } from '@shared/engine/pushApart'
import { simEvents } from '@shared/engine/sim'
import type { Pool } from '@shared/model/categories'
import type { Answer, AnyEvent } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday
const NEXT = '2026-10-29'
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fixed = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => flex(id, at, min, { fixed: true, ...o })
const fileOf = (date: string, plan: readonly PlanBlock[], extra: Raw = {}): Raw => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })

/**
 * The day with `plan` counted at `now`; `own` – the blocks of the day's file (yours), the rest of the plan is the snapshot's (a template's);
 * `events` – what the log has. No transition buffer: the hours of the examples are exact.
 */
function scenario(plan: PlanBlock[], o: { date?: string; own?: readonly string[]; settings?: Record<string, unknown> } = {}) {
  const date = o.date ?? DATE
  return new Scenario({ date, plan, wake: '06:30', settings: { transitionBufferMin: 0, ...o.settings } }).observe('06:30', null)
}
function dayOf(s: Scenario, now: string, own?: readonly string[]): GroupDay {
  const mine = new Set(own ?? [])
  const ctx = s.contextAt(s.at(now), own ? { snapshot: { ...s.snapshot, blocks: s.opts.plan.filter((b) => !mine.has(b.id)) } } : {})
  return { ctx, state: computeDay(ctx) }
}
const skipsOf = (j: { skipped: Array<{ id: string; why: string }> }) => Object.fromEntries(j.skipped.map((x) => [x.id, x.why]))
const startsOf = (raw: Raw, date = DATE) => Object.fromEntries(dayFileFrom(raw, date).blocks.map((b) => [b.id, b.startMin]))

describe('D529 – pomijanie: każdy blok według reguły, jaką ma sam (nic nie blokuje)', () => {
  it('przykład specyfikacji: 4 bloki, w tym zaczęty, podkategoria „Analiza” – 3 zmienione, pominięty 1: zaczęty', () => {
    const plan = [flex('a', '09:00', 30), flex('b', '10:00', 30), flex('c', '11:00', 30), flex('d', '12:00', 30)]
    const s = scenario(plan).start('a', '09:00')
    const j = judgeGroup(dayOf(s, '09:10'), ['a', 'b', 'c', 'd'], { k: 'category', categoryId: 'analiza', variantId: null }, DATE)
    expect(j.take).toEqual(['b', 'c', 'd'])
    expect(skipsOf(j)).toEqual({ a: 'zaczęty' })
  })

  it('„Przesuń o”: zaczęty, zaparkowany, sesja, wykład, zajęcia zjazdu, zakotwiczony, czas minął, poza dniem, nie ma – pominięte z powodem', () => {
    const plan = [
      flex('run', '07:00', 60),
      flex('park', '13:00', 30),
      { ...fixed('ses', '14:00', 60), origin: 'session' as const, categoryId: 'sesja-ny' },
      { ...fixed('lec', '15:30', 60), origin: 'lecture' as const },
      { ...fixed('zj', '17:00', 60), origin: 'zjazd' as const },
      flex('anch', '12:00', 30, { startMin: null, anchor: 'park' }),
      fixed('gone', '07:00', 30),
      flex('late', '23:50', 30),
      flex('ok', '10:00', 30)
    ]
    const s = scenario(plan).start('run', '07:00').raw({ k: 'block.park', block: 'park', at: scenario(plan).at('08:00'), rule: 'user' }, '08:00')
    const j = judgeGroup(dayOf(s, '08:00'), ['run', 'park', 'ses', 'lec', 'zj', 'anch', 'gone', 'late', 'ok', 'nic'], { k: 'shift', minutes: 300 }, DATE)
    expect(j.take).toEqual(['ok'])
    expect(skipsOf(j)).toEqual({ run: 'zaczęty', park: 'zdjęty', ses: 'sesja', lec: 'wykład', zj: 'zjazd', anch: 'zakotwiczony', gone: 'miniony', late: 'poza dniem', nic: 'nie ma' })
  })

  it('dzień miniony: przesunięcie, przeniesienie i koszt – „miniony”; odwołanie dnia przyszłego – „nie dziś”', () => {
    const plan = [flex('a', '10:00', 30)]
    const s = scenario(plan)
    const d = dayOf(s, '08:00')
    for (const a of [{ k: 'shift', minutes: 15 }, { k: 'moveTo', date: '2026-11-02' }, { k: 'cost', costs: null }, { k: 'park' }] as GroupAction[]) {
      expect(skipsOf(judgeGroup(d, ['a'], a, NEXT)), a.k).toEqual({ a: 'miniony' })
    }
    expect(skipsOf(judgeGroup(d, ['a'], { k: 'cancel' }, '2026-10-27'))).toEqual({ a: 'nie dziś' })
  })

  it('rutyna tylko w podkategorii rodzaju „rutyna”, wariant tylko swojej podkategorii; ta sama wartość – bez zmiany', () => {
    const plan = [flex('r', '09:00', 30, { categoryId: 'rutyny' }), flex('i', '10:00', 30), flex('v', '11:00', 30, { categoryId: 'regeneracja', variantId: 'drzemka' })]
    const d = dayOf(scenario(plan), '08:00')
    const routine = judgeGroup(d, ['r', 'i'], { k: 'routine', routine: 'poranek', minutes: 20 }, DATE)
    expect(routine.take).toEqual(['r'])
    expect(skipsOf(routine)).toEqual({ i: 'nie rutyna' })
    const variant = judgeGroup(d, ['i', 'v'], { k: 'variant', variantId: 'drzemka' }, DATE)
    expect(skipsOf(variant)).toEqual({ i: 'inna podkategoria' })
    expect(variant.same).toEqual(['v'])
  })

  it('koszt jak na kafelku (D501): zaczęty i trwający – bierze; skończony – „skończony”; zaparkowany – „zdjęty”', () => {
    const plan = [flex('run', '07:00', 120), flex('done', '06:30', 20), flex('park', '12:00', 30), flex('ok', '13:00', 30)]
    const s = scenario(plan).start('done', '06:40').end('done', '06:50').start('run', '07:00').raw({ k: 'block.park', block: 'park', at: scenario(plan).at('07:30'), rule: 'user' }, '07:30')
    const j = judgeGroup(dayOf(s, '07:40'), ['run', 'done', 'park', 'ok'], { k: 'cost', costs: { head: 3, emotions: 1, senses: 1, body: 0 } }, DATE)
    expect(j.take).toEqual(['run', 'ok'])
    expect(skipsOf(j)).toEqual({ done: 'skończony', park: 'zdjęty' })
  })

  it('usuń bierze każdy blok planu, także zaczęty (D336); odwołanie i parkowanie dziś – bez zaczętych i zdjętych', () => {
    const plan = [flex('run', '07:00', 60), flex('a', '10:00', 30), flex('b', '11:00', 30)]
    const s = scenario(plan).start('run', '07:00').raw({ k: 'block.cancel', block: 'b', at: scenario(plan).at('07:10'), rule: 'user' }, '07:10')
    const d = dayOf(s, '07:20')
    expect(judgeGroup(d, ['run', 'a', 'b'], { k: 'remove' }, DATE).take).toEqual(['run', 'a', 'b'])
    const park = judgeGroup(d, ['run', 'a', 'b'], { k: 'park' }, DATE)
    expect(park.take).toEqual(['a'])
    expect(skipsOf(park)).toEqual({ run: 'zaczęty', b: 'zdjęty' })
  })
})

describe('„Przesuń o” ±N min (D528) – jedna zmiana pliku dnia z rozsunięciem (D367)', () => {
  it('przykład specyfikacji: 10:00 i 11:00 o +15 – 10:15 i 11:15; kolejny elastyczny rozsunięty', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60), flex('d', '15:00', 30)]
    const s = scenario(plan)
    const d = dayOf(s, '08:00', ['a', 'b', 'c', 'd'])
    const j = judgeGroup(d, ['a', 'b'], { k: 'shift', minutes: 15 }, DATE)
    expect(j.take).toEqual(['a', 'b'])
    const c = shiftedDay(d, fileOf(DATE, plan), j.take, 15, DATE)
    expect(startsOf(c.raw)).toEqual({ a: lm('10:15'), b: lm('11:15'), c: lm('12:15'), d: lm('15:00') })
    expect(c.pushed.map((p) => p.id)).toEqual(['c'])
    // The day counted with the file after it shows them so.
    const shown = computeDay({ ...d.ctx, plan: c.plan }).forecast
    expect(Object.fromEntries(shown.map((p) => [p.block.id, p.from]))).toMatchObject({ a: d.state.forecast.find((p) => p.block.id === 'a')!.from + 15 })
  })

  it('z buforem przejścia: każdy jedzie od miejsca na osi, rozsunięty zapisany tam, gdzie pokaże go prognoza', () => {
    // „Analiza” after „Inne”: 5 min of transition – the axis shows b at 11:05 and c at 12:05; +15 – b 11:20, c behind it at 12:20.
    const plan = [flex('a', '10:00', 60), flex('b', '11:00', 60, { categoryId: 'analiza' }), flex('c', '12:05', 30, { categoryId: 'analiza' })]
    const d = dayOf(scenario(plan, { settings: { transitionBufferMin: 5 } }), '08:00', ['a', 'b', 'c'])
    const c = shiftedDay(d, fileOf(DATE, plan), ['a', 'b'], 15, DATE)
    expect(startsOf(c.raw)).toEqual({ a: lm('10:15'), b: lm('11:20'), c: lm('12:20') })
    expect(c.pushed.map((p) => p.id)).toEqual(['c'])
    const shown = computeDay({ ...d.ctx, plan: c.plan }).forecast.find((p) => p.block.id === 'c')!
    expect(shown.from).toBe(d.state.forecast.find((p) => p.block.id === 'c')!.from + 15)
  })

  it('wcześniej o 30 min, minuta po minucie (bez zaokrąglania): 10:07 → 9:37', () => {
    const plan = [flex('a', '10:07', 20), flex('b', '13:00', 20)]
    const d = dayOf(scenario(plan), '08:00', ['a', 'b'])
    const c = shiftedDay(d, fileOf(DATE, plan), ['a'], -30, DATE)
    expect(startsOf(c.raw)).toEqual({ a: lm('09:37'), b: lm('13:00') })
    expect(c.pushed).toEqual([])
  })

  it('dziś od miejsca na osi (jak przeciągnięcie): elastyczny, którego godzina minęła (oś – od teraz 08:00), +15 – 08:15; dzień przyszły – od planu', () => {
    const plan = [flex('a', '07:00', 30), flex('b', '13:00', 20)]
    const d = dayOf(scenario(plan), '08:00', ['a', 'b'])
    expect(startsOf(shiftedDay(d, fileOf(DATE, plan), ['a'], 15, DATE).raw).a).toBe(lm('08:15'))
    expect(startsOf(shiftedDay(d, fileOf(DATE, plan), ['a'], 15, '2026-10-27').raw).a).toBe(lm('07:15'))
  })

  it('zakotwiczony do przesuwanego idzie za nim (D424) – policzony jako zmieniony, w pliku bez własnej godziny', () => {
    const plan = [flex('a', '10:00', 60), flex('y', '10:00', 30, { startMin: null, anchor: 'a' })]
    const d = dayOf(scenario(plan), '08:00', ['a', 'y'])
    const j = judgeGroup(d, ['a', 'y'], { k: 'shift', minutes: 15 }, DATE)
    expect([j.take, j.along, j.skipped]).toEqual([['a'], ['y'], []])
    const c = shiftedDay(d, fileOf(DATE, plan), j.take, 15, DATE)
    expect(dayFileFrom(c.raw, DATE).blocks.map((b) => [b.id, b.startMin, b.anchor])).toEqual([
      ['a', lm('10:15'), null],
      ['y', null, 'a']
    ])
  })

  it('cała grupa bloków równoległych jedzie z pierwszym (D492); jeden z grupy sam – wychodzi z niej', () => {
    const plan = [flex('r', '10:00', 60), flex('s', '10:00', 30, { alongside: 'r' }), flex('t', '13:00', 30)]
    const d = dayOf(scenario(plan), '08:00', ['r', 's', 't'])
    const whole = shiftedDay(d, fileOf(DATE, plan), ['r', 's'], 30, DATE)
    expect(dayFileFrom(whole.raw, DATE).blocks.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['r', lm('10:30'), null],
      ['s', lm('10:30'), 'r'],
      ['t', lm('13:00'), null]
    ])
    const alone = shiftedDay(d, fileOf(DATE, plan), ['s'], 120, DATE)
    expect(dayFileFrom(alone.raw, DATE).blocks.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['r', lm('10:00'), null],
      ['s', lm('12:00'), null],
      ['t', lm('13:00'), null]
    ])
  })

  it('dwa z trzech bloków grupy równoległej: jadą razem i zostają grupą; niezaznaczony zostaje (sam albo z resztą)', () => {
    const plan = [flex('r', '10:00', 60), flex('s', '10:00', 30, { alongside: 'r' }), flex('t', '10:00', 45, { alongside: 'r' }), flex('z', '15:00', 30)]
    const d = dayOf(scenario(plan), '08:00', ['r', 's', 't', 'z'])
    const rows = (raw: Raw) => dayFileFrom(raw, DATE).blocks.map((b) => [b.id, b.startMin, b.alongside])
    // Two blocks beside the first one: a group of their own, the first block stays where it was.
    expect(rows(shiftedDay(d, fileOf(DATE, plan), ['s', 't'], 120, DATE).raw)).toEqual([
      ['r', lm('10:00'), null],
      ['s', lm('12:00'), null],
      ['t', lm('12:00'), 's'],
      ['z', lm('15:00'), null]
    ])
    // The first block with one beside it: they go together; the one left is a block of its own at the group's hour.
    expect(rows(shiftedDay(d, fileOf(DATE, plan), ['r', 't'], 120, DATE).raw)).toEqual([
      ['r', lm('12:00'), null],
      ['s', lm('10:00'), null],
      ['t', lm('12:00'), 'r'],
      ['z', lm('15:00'), null]
    ])
  })

  it('doba 25-godzinna: blok na osi w drugiej 02:30 przesuwa się od 03:00 (druga 02:xx nie ma własnej godziny), nie od pierwszej 02:30', () => {
    const LONG = '2026-10-24' // 02:00–02:59 twice
    const plan = [flex('a', '01:00', 150), flex('b', '02:00', 30)]
    const s = scenario(plan, { date: LONG })
    const d = dayOf(s, '23:00', ['a', 'b'])
    // The forecast places „b” after „a”, at the second 02:30.
    expect(d.state.forecast.find((p) => p.block.id === 'b')!.from).toBe(idxOfLogical(d.state.grid, lm('02:00')) + 90)
    expect(axisStartOf(d, 'b', LONG)).toBe(lm('03:00'))
    expect(startsOf(shiftedDay(d, fileOf(LONG, plan), ['b'], 15, LONG).raw, LONG).b).toBe(lm('03:15'))
  })

  it('zawsze (dni z buforem, dwie kategorie, różne zaznaczenia i przesunięcia): przesunięte o tyle samo, rozsunięty tam, gdzie pokaże go prognoza', () => {
    // A fixed sequence of plans (a linear congruential generator from each seed): the rule holds for every one of them.
    const rnd = (seed: number) => {
      let x = seed
      return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
    }
    let pushed = 0
    for (let seed = 1; seed <= 150; seed++) {
      const r = rnd(seed)
      const plan: PlanBlock[] = []
      let t = lm('09:00')
      for (let i = 0, n = 4 + Math.floor(r() * 4); i < n; i++) {
        t += Math.floor(r() * 40) - 10
        const min = 15 + Math.floor(r() * 60)
        plan.push({ ...flex(`b${i}`, '09:00', min, { categoryId: r() < 0.5 ? 'inne' : 'analiza' }), startMin: t })
        t += min
      }
      const d = dayOf(scenario(plan, { settings: { transitionBufferMin: 5 } }), '08:00', plan.map((b) => b.id))
      const take = plan.filter(() => r() < 0.5).map((b) => b.id)
      const minutes = Math.floor(r() * 120) - 60 || 5
      const c = shiftedDay(d, fileOf(DATE, plan), take, minutes, '2026-10-27')
      const starts = startsOf(c.raw)
      for (const id of take) expect(starts[id], `${seed}: ${id}`).toBe(plan.find((b) => b.id === id)!.startMin! + minutes)
      const shown = computeDay({ ...d.ctx, plan: c.plan })
      for (const p of c.pushed) expect(shown.forecast.find((x) => x.block.id === p.id)!.from, `${seed}: ${p.id}`).toBe(idxOfLogical(shown.grid, p.startMin))
      pushed += c.pushed.length
    }
    // The sequence pushes blocks apart often (the rule is checked, not skipped).
    expect(pushed).toBeGreaterThan(50)
  })
})

describe('D367 – zapisany start = pokazany start (przesunięcie i przeniesienie grupy)', () => {
  /** Every block of the push written where the day then shows it; any other flexible block shown later than before is one of them. */
  function holds(d: GroupDay, plan: readonly PlanBlock[], c: { plan: PlanBlock[]; pushed: Array<{ id: string; startMin: number }> }, moved: ReadonlySet<string>, label: string) {
    const shown = computeDay({ ...d.ctx, plan: c.plan })
    const pushed = new Map(c.pushed.map((p) => [p.id, p.startMin]))
    for (const p of c.pushed) expect(shown.forecast.find((x) => x.block.id === p.id)!.from, `${label}: ${p.id}`).toBe(idxOfLogical(shown.grid, p.startMin))
    for (const b of plan) {
      if (moved.has(b.id)) continue
      const was = d.state.forecast.find((x) => x.block.id === b.id)
      const now = shown.forecast.find((x) => x.block.id === b.id)
      if (was && now && now.from > was.from) expect(pushed.has(b.id), `${label}: ${b.id} pokazany później, niezapisany`).toBe(true)
    }
  }

  it('postawiony blok grupy dokładnie na starcie nietkniętego bloku – zajęte miejsce: ten idzie za nim (T1750); „Przenieś na dzień” i „Przesuń o”', () => {
    // „y” lands at 12:00 of the target, where „t” starts: „t” is written behind it, „y” is shown where it is written.
    const from = [flex('x', '11:00', 60), flex('y', '12:00', 60)]
    const to = [flex('t', '12:00', 30)]
    const src = dayOf(scenario(from), '08:00', ['x', 'y'])
    const there = dayOf(scenario(to, { date: NEXT }), '08:00', ['t'])
    const m = movedDays({ from: src, to: there, fromRaw: fileOf(DATE, from), toRaw: fileOf(NEXT, to), take: ['x', 'y'], toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
    expect(startsOf(m.target, NEXT)).toEqual({ t: lm('13:00'), x: lm('11:00'), y: lm('12:00') })
    const shown = computeDay({ ...there.ctx, plan: dayFileFrom(m.target, NEXT).blocks })
    expect(shown.forecast.find((p) => p.block.id === 'y')!.from).toBe(idxOfLogical(shown.grid, lm('12:00')))
    // Within the day: „b” shifted onto the start of „p”, „a” (the first) before it.
    const plan = [flex('a', '10:00', 30), flex('b', '11:00', 30), flex('p', '11:30', 30)]
    const d = dayOf(scenario(plan), '08:00', ['a', 'b', 'p'])
    expect(startsOf(shiftedDay(d, fileOf(DATE, plan), ['a', 'b'], 30, '2026-10-27').raw)).toEqual({ a: lm('10:30'), b: lm('11:30'), p: lm('12:00') })
    // A block that really starts before the placed one stays before it (T1710).
    const before = [flex('a', '10:00', 30), flex('b', '11:00', 30), flex('p', '11:25', 30)]
    const e = dayOf(scenario(before), '08:00', ['a', 'b', 'p'])
    expect(startsOf(shiftedDay(e, fileOf(DATE, before), ['a', 'b'], 30, '2026-10-27').raw)).toEqual({ a: lm('10:30'), b: lm('11:30'), p: lm('11:25') })
  })

  it('blok nietknięty przez zmianę zostaje przed postawionym – ten stoi później tylko o bufor przejścia', () => {
    // „p” (Inne) between the two shifted blocks, „q” (Analiza) right after it: 5 min of transition – q stands at 12:05, p stays at 11:00.
    const plan = [flex('a', '10:00', 30), flex('p', '11:00', 60), flex('q', '12:30', 30, { categoryId: 'analiza' })]
    const d = dayOf(scenario(plan, { settings: { transitionBufferMin: 5 } }), '08:00', ['a', 'p', 'q'])
    const c = shiftedDay(d, fileOf(DATE, plan), ['a', 'q'], -30, '2026-10-27')
    expect(startsOf(c.raw)).toEqual({ a: lm('09:30'), p: lm('11:00'), q: lm('12:00') })
    expect(c.pushed).toEqual([])
  })

  it('trzymanie postawionych bloków, które nie zdążyło w limicie rund – `onUnsettled`, raz na działanie', () => {
    // Three short blocks of the target stand between the two moved ones: each goes behind „y” in its own count.
    const from = [flex('x', '11:00', 60), flex('y', '12:00', 60)]
    const to = [flex('a1', '11:30', 10), flex('a2', '11:40', 10), flex('a3', '11:50', 10)]
    const src = dayOf(scenario(from), '08:00', ['x', 'y'])
    const there = dayOf(scenario(to, { date: NEXT }), '08:00', to.map((t) => t.id))
    const m = movedDays({ from: src, to: null, fromRaw: fileOf(DATE, from), toRaw: fileOf(NEXT, to), take: ['x', 'y'], toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
    const plan = [...to, ...dayFileFrom(m.bring, NEXT).blocks.filter((b) => b.id === 'x' || b.id === 'y')]
    let unsettled = 0
    pushApart(there.ctx, there.state, plan, 'x', { placed: new Set(['x', 'y']), maxRounds: 2, onUnsettled: () => unsettled++ })
    expect(unsettled).toBe(1)
    // With the rounds it needs: settled, every one of them behind „y”.
    const out = pushApart(there.ctx, there.state, plan, 'x', { placed: new Set(['x', 'y']), onUnsettled: () => unsettled++ })
    expect(unsettled).toBe(1)
    expect(Object.fromEntries(out.map((p) => [p.id, p.startMin]))).toEqual({ a1: lm('13:00'), a2: lm('13:10'), a3: lm('13:20') })
  })

  it('dziś blok pokazany za końcem doby (po 03:59): „wcześniej” liczy od jego minuty na osi, „później” – poza dniem', () => {
    // A long block runs into the night: „b” after it is shown at 04:30 of the next morning.
    const plan = [flex('a', '22:00', 390), flex('b', '23:00', 30)]
    const d = dayOf(scenario(plan), '21:00', ['a', 'b'])
    expect(axisStartOf(d, 'b', DATE)).toBe(lm('04:30') + 1440)
    expect(skipsOf(judgeGroup(d, ['b'], { k: 'shift', minutes: 15 }, DATE))).toEqual({ b: 'poza dniem' })
    expect(startsOf(shiftedDay(d, fileOf(DATE, plan), ['b'], -60, DATE).raw).b).toBe(lm('03:30'))
  })

  it('plany z przeglądu: blok, który przesuwa się dopiero za przesuniętymi, jest zapisany tam, gdzie go widać', () => {
    const mm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    for (let gap = 0; gap <= 20; gap += 2)
      for (let sh = 5; sh <= 60; sh += 5) {
        const plan = [flex('a', '10:00', 60), flex('bb', '11:00', 60, { categoryId: 'analiza' }), flex('c', '12:00', 30), flex('d', mm(12 * 60 + 30 + gap), 30, { categoryId: 'analiza' }), flex('e', mm(13 * 60 + 5 + gap), 30)]
        const d = dayOf(scenario(plan, { settings: { transitionBufferMin: 5 } }), '08:00', plan.map((b) => b.id))
        const c = shiftedDay(d, fileOf(DATE, plan), ['a', 'bb'], sh, '2026-10-27')
        holds(d, plan, c, new Set(['a', 'bb']), `gap ${gap} sh ${sh}`)
        const starts = startsOf(c.raw)
        for (const id of ['c', 'd', 'e']) {
          const p = computeDay({ ...d.ctx, plan: c.plan }).forecast.find((x) => x.block.id === id)!
          expect(p.from, `gap ${gap} sh ${sh}: ${id}`).toBe(idxOfLogical(d.state.grid, starts[id]!))
        }
      }
  })

  it('przeniesienie dwóch bloków na dzień z blokami (ustalone ziarno): przeniesione zachowują godziny, rozsunięte zapisane tam, gdzie je widać', () => {
    const rnd = (seed: number) => {
      let x = seed
      return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
    }
    let pushed = 0
    for (let seed = 1; seed <= 80; seed++) {
      const r = rnd(seed)
      const cat = () => (r() < 0.5 ? 'inne' : 'analiza')
      const from = [flex('x', '09:00', 30 + Math.floor(r() * 60), { categoryId: cat() }), flex('y', '09:00', 30 + Math.floor(r() * 60), { categoryId: cat() })]
      from[0]!.startMin = lm('10:00') + Math.floor(r() * 60)
      from[1]!.startMin = from[0]!.startMin + from[0]!.durationMin + Math.floor(r() * 30)
      const to: PlanBlock[] = []
      let t = lm('09:30')
      for (let i = 0; i < 5; i++) {
        const min = 15 + Math.floor(r() * 45)
        to.push({ ...flex(`t${i}`, '09:00', min, { categoryId: cat() }), startMin: t })
        t += min + Math.floor(r() * 20) - 5
      }
      const src = dayOf(scenario(from, { settings: { transitionBufferMin: 5 } }), '08:00', ['x', 'y'])
      const there = dayOf(scenario(to, { date: NEXT, settings: { transitionBufferMin: 5 } }), '08:00', to.map((b) => b.id))
      const m = movedDays({ from: src, to: there, fromRaw: fileOf(DATE, from), toRaw: fileOf(NEXT, to), take: ['x', 'y'], toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
      const starts = startsOf(m.target, NEXT)
      expect([starts.x, starts.y], `${seed}`).toEqual([from[0]!.startMin, from[1]!.startMin])
      const plan = dayFileFrom(m.target, NEXT).blocks
      holds(there, to, { plan, pushed: m.pushed }, new Set(['x', 'y']), `${seed}`)
      pushed += m.pushed.length
    }
    expect(pushed).toBeGreaterThan(50)
  })
})

describe('„Przenieś na dzień” (D528): każdy blok zachowuje godzinę, dzień docelowy rozsuwa kolejne (D367)', () => {
  it('dwa bloki poniedziałku 9:00 i 10:00 na wtorek – 9:00 i 10:00, blok wtorku na zajętym miejscu rozsunięty; źródło – oba odeszły', () => {
    const from = [flex('x', '09:00', 60), flex('y', '10:00', 60)]
    const to = [flex('a', '10:30', 30), flex('b', '13:00', 30)]
    const src = dayOf(scenario(from), '08:00', ['x', 'y'])
    const there = dayOf(scenario(to, { date: NEXT }), '08:00', ['a', 'b'])
    const j = judgeGroup(src, ['x', 'y'], { k: 'moveTo', date: NEXT }, DATE)
    const m = movedDays({ from: src, to: there, fromRaw: fileOf(DATE, from), toRaw: fileOf(NEXT, to), take: j.take, toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
    expect(m.moved).toEqual(['x', 'y'])
    expect(dayFileFrom(m.source, DATE).blocks).toEqual([])
    expect(dayFileFrom(m.source, DATE).movedTo).toEqual({ x: NEXT, y: NEXT })
    expect(startsOf(m.target, NEXT)).toEqual({ a: lm('11:00'), b: lm('13:00'), x: lm('09:00'), y: lm('10:00') })
    expect(dayFileFrom(m.target, NEXT).blocks.find((b) => b.id === 'x')).toMatchObject({ moves: 1, movedFrom: DATE })
    expect(m.pushed.map((p) => p.id)).toEqual(['a'])
    // The owner of the edit (T952) brings the blocks without the push; the push goes over it.
    expect(startsOf(m.bring, NEXT).a).toBe(lm('10:30'))
  })

  it('blok docelowego między przeniesionymi nie zajmuje ich miejsc: idzie za nimi, oni zachowują godziny', () => {
    const from = [flex('x', '11:00', 60), flex('y', '12:00', 60)]
    const to = [flex('a', '11:30', 30), flex('b', '13:00', 30)]
    const src = dayOf(scenario(from), '08:00', ['x', 'y'])
    const there = dayOf(scenario(to, { date: NEXT }), '08:00', ['a', 'b'])
    const m = movedDays({ from: src, to: there, fromRaw: fileOf(DATE, from), toRaw: fileOf(NEXT, to), take: ['x', 'y'], toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
    expect(startsOf(m.target, NEXT)).toEqual({ a: lm('13:00'), b: lm('13:30'), x: lm('11:00'), y: lm('12:00') })
  })

  it('zakotwiczony zaznaczony idzie za swoją kotwicą; zaczęty zakotwiczony zostaje (D424)', () => {
    const plan = [flex('x', '11:00', 60), flex('y', '11:00', 30, { startMin: null, anchor: 'x' }), flex('z', '11:00', 30, { startMin: null, anchor: 'x' })]
    const s = scenario(plan).start('z', '07:00')
    const src = dayOf(s, '07:30', ['x', 'y', 'z'])
    const j = judgeGroup(src, ['x', 'y', 'z'], { k: 'moveTo', date: NEXT }, DATE)
    expect([j.take, j.along, skipsOf(j)]).toEqual([['x'], ['y'], { z: 'zaczęty' }])
    const m = movedDays({ from: src, to: null, fromRaw: fileOf(DATE, plan), toRaw: null, take: j.take, toDate: NEXT, stay: stayRuleOf(src.state.facts, src.ctx.snapshot.settings) })
    expect(m.moved).toEqual(['x', 'y'])
    expect(m.stayers.map((b) => b.id)).toEqual(['z'])
  })

  it('na dzień miniony – nic (D417): wszystkie „miniony”; na ten sam dzień – bez zmiany', () => {
    const d = dayOf(scenario([flex('x', '11:00', 60)]), '08:00')
    expect(skipsOf(judgeGroup(d, ['x'], { k: 'moveTo', date: '2026-10-27' }, DATE))).toEqual({ x: 'miniony' })
    expect(judgeGroup(d, ['x'], { k: 'moveTo', date: DATE }, DATE).same).toEqual(['x'])
  })
})

describe('„Cofnij” (D529, D313): tylko zmienione pola, blok zmieniony od tego czasu zostaje', () => {
  const plan = [flex('a', '10:00', 30, { note: 'stara' }), flex('b', '11:00', 30)]
  const day = () => dayOf(scenario(plan), '08:00', ['a', 'b'])

  it('podkategoria wraca, inne pola zostają (także zmienione po zmianie grupowej)', () => {
    const before = fileOf(DATE, plan)
    const c = fieldDay(day(), before, ['a', 'b'], { k: 'category', categoryId: 'analiza', variantId: null })
    const items = fieldsUndoOf(before, c.raw, DATE, plan)
    expect(items.map((u) => [u.id, u.before, u.after])).toEqual([
      ['a', { categoryId: 'inne' }, { categoryId: 'analiza' }],
      ['b', { categoryId: 'inne' }, { categoryId: 'analiza' }]
    ])
    // Meanwhile the note of „a” changed – it stays; its subcategory goes back.
    const later = { ...c.raw, blocks: (c.raw.blocks as Raw[]).map((x) => (x.id === 'a' ? { ...x, note: 'nowa' } : x)) }
    const u = undoFields(later, DATE, items)
    expect([u.restored, u.kept]).toEqual([['a', 'b'], []])
    expect(dayFileFrom(u.raw, DATE).blocks.map((x) => [x.id, x.categoryId, x.note])).toEqual([
      ['a', 'inne', 'nowa'],
      ['b', 'inne', '']
    ])
  })

  it('blok, którego zmienione pole zmieniło się od tego czasu, zostaje, jaki jest – policzony', () => {
    const before = fileOf(DATE, plan)
    const c = shiftedDay(day(), before, ['a', 'b'], 15, DATE)
    const items = fieldsUndoOf(before, c.raw, DATE, plan)
    const later = { ...c.raw, blocks: (c.raw.blocks as Raw[]).map((x) => (x.id === 'b' ? { ...x, startMin: lm('16:00') } : x)) }
    const u = undoFields(later, DATE, items)
    expect([u.restored, u.kept]).toEqual([['a'], ['b']])
    expect(startsOf(u.raw)).toEqual({ a: lm('10:00'), b: lm('16:00') })
  })

  it('blok szablonu bez wpisu w pliku: zmiana wpisuje go, „Cofnij” zdejmuje wpis – blok znów jest szablonu', () => {
    const d = dayOf(scenario(plan), '08:00', [])
    const c = fieldDay(d, null, ['a'], { k: 'cost', costs: { head: 4, emotions: 1, senses: 1, body: 0 } })
    const items = fieldsUndoOf(null, c.raw, DATE, d.ctx.plan)
    expect(items.map((x) => [x.id, x.before, x.after])).toEqual([['a', { costs: null }, { costs: { head: 4, emotions: 1, senses: 1, body: 0 } }]])
    const u = undoFields(c.raw, DATE, items)
    expect(u.restored).toEqual(['a'])
    expect(dayFileFrom(u.raw, DATE).blocks).toEqual([])
    // Changed since in another field (its note): the entry stays, with the fields back.
    const later = { ...c.raw, blocks: (c.raw.blocks as Raw[]).map((x) => ({ ...x, note: 'nowa' })) }
    expect(dayFileFrom(undoFields(later, DATE, items).raw, DATE).blocks.map((x) => [x.id, x.costs, x.note])).toEqual([['a', null, 'nowa']])
  })

  it('zwolniony czas: łańcuch a→b→c z zaczętym b – c nie jest w czasie a (jak `freedByEdit`), liczy się sam', () => {
    const plan = [flex('a', '10:00', 60), flex('b', '10:00', 30, { startMin: null, anchor: 'a' }), flex('c', '10:00', 40, { startMin: null, anchor: 'b' })]
    const d = dayOf(scenario(plan).start('b', '07:00'), '07:10', ['a', 'b', 'c'])
    expect(groupFreed(d, ['a', 'b', 'c']).map((f) => f.block).sort()).toEqual(['a', 'c'])
  })

  it('zwolniony czas usunięcia dziś (D368): zakotwiczony liczy się w czasie kotwicy; kotwica zaczęta (nic nie zwalnia) – zakotwiczony sam', () => {
    const plan = [flex('r', '08:00', 60), flex('c', '08:00', 45, { startMin: null, anchor: 'r' }), flex('z', '12:00', 30)]
    const free = dayOf(scenario(plan), '07:30', ['r', 'c', 'z'])
    expect(groupFreed(free, ['r', 'c']).map((f) => [f.block, f.minutes])).toEqual([['r', 105]])
    const begun = dayOf(scenario(plan).start('r', '08:00'), '08:20', ['r', 'c', 'z'])
    expect(groupFreed(begun, ['r', 'c']).map((f) => [f.block, f.minutes])).toEqual([['c', 45]])
  })

  it('usunięte wracają: Twój – do pliku, szablonu – odwołanie zdjęte; ponownie dodany w międzyczasie zostaje', () => {
    const d = dayOf(scenario(plan), '08:00', ['a'])
    const before = fileOf(DATE, [plan[0]!])
    const c = removedDay(d, before, ['a', 'b'])
    const file = dayFileFrom(c.raw, DATE)
    expect([file.blocks, file.cancelled]).toEqual([[], ['b']])
    expect(c.plan).toEqual([])
    const back = undoRemoval(c.raw, DATE, c.undo)
    expect(back.restored).toEqual(['a', 'b'])
    expect(dayFileFrom(back.raw, DATE).blocks.map((x) => [x.id, x.note])).toEqual([['a', 'stara']])
    expect(dayFileFrom(back.raw, DATE).cancelled).toEqual([])
    // „a” put back meanwhile (another computer): it stays, counted.
    expect(undoRemoval(back.raw, DATE, c.undo).kept).toEqual(['a', 'b'])
  })
})

describe('Odwołaj, Zaparkuj (D528) – zdarzenia logu jak dla jednego bloku, partią; „Cofnij” – undo tych zdarzeń', () => {
  it('dziś: niezaczęte dostają `block.park`; zaczęty pominięty; „Cofnij” cofa oba, blok zaczęty od tego czasu zostaje', () => {
    const plan = [flex('run', '07:00', 60), flex('a', '10:00', 30), flex('b', '11:00', 30)]
    const s = scenario(plan).start('run', '07:00')
    const d = dayOf(s, '07:30')
    const at = s.at('07:30')
    const g = groupLogDrafts(d.ctx, d.state, 'park', ['run', 'a', 'b'], at)
    expect(g.taken).toEqual(['a', 'b'])
    expect(g.skipped).toEqual([{ id: 'run', why: 'zaczęty' }])
    expect(g.drafts).toEqual([
      { k: 'block.park', block: 'a', at, rule: 'user' },
      { k: 'block.park', block: 'b', at, rule: 'user' }
    ])
    const written = simEvents(d.ctx, g.drafts, at, { c: 'pca', n: 50 }) as AnyEvent[]
    for (const e of written) s.raw(e as unknown as Record<string, unknown>, '07:30')
    const ids = s.events.filter((e) => e.k === 'block.park').map((e) => e.id)
    // „b” began meanwhile: it stays as it is.
    s.start('b', '07:40')
    const u = groupLogUndo(computeDay(s.contextAt(s.at('07:45'))), s.events, ids, s.at('07:45'))
    expect(typeof u === 'string' ? u : u.kept).toEqual(['b'])
    expect(typeof u === 'string' ? u : u.drafts.map((x) => x.target)).toEqual([ids[0]])
  })

  it('„Cofnij” odmawia na identyfikatorach, które nie są zdarzeniami grupy tego dnia', () => {
    const s = scenario([flex('a', '10:00', 30)]).start('a', '07:00')
    expect(groupLogUndo(computeDay(s.contextAt(s.at('07:30'))), s.events, [s.events.at(-1)!.id], s.at('07:30'))).toBe('to nie są zmiany tej grupy')
    expect(groupLogUndo(computeDay(s.contextAt(s.at('07:30'))), s.events, ['nie-ma'], s.at('07:30'))).toBe('tych zmian nie ma już w logu dnia')
  })

  it('D216: odwołanie ostatniego stałego bloku pracy po „Koniec pracy” parkuje elastyczną pracę i kończy zapauzowaną – „Cofnij” cofa wszystko, także koniec zaczętego', () => {
    const plan = [flex('p', '08:00', 60), fixed('f', '14:00', 60), flex('q', '16:00', 30)]
    // „p” paused, then „Koniec pracy” – only a break, the fixed block of work at 14:00 is still left.
    const s = scenario(plan).start('p', '08:00').pause('p', '08:30').workEnd('09:00')
    const d = dayOf(s, '09:30')
    const at = s.at('09:30')
    const g = groupLogDrafts(d.ctx, d.state, 'cancel', ['f'], at)
    expect(g.drafts.map((x) => [x.k, x.block, x.rule])).toEqual([
      ['block.cancel', 'f', 'user'],
      ['block.end', 'p', 'workEnd'],
      ['block.park', 'q', 'workEnd']
    ])
    for (const e of simEvents(d.ctx, g.drafts, at, { c: 'pca', n: 50 }) as AnyEvent[]) s.raw(e as unknown as Record<string, unknown>, '09:30')
    const ids = s.events.slice(-3).map((e) => e.id)
    const u = groupLogUndo(computeDay(s.contextAt(s.at('09:40'))), s.events, ids, s.at('09:40'))
    // All three go back; the line counts the group's own block only (the park and the end D216 wrote go back uncounted).
    expect(typeof u === 'string' ? u : [u.drafts.map((x) => x.target), u.restored, u.kept]).toEqual([ids, ['f'], []])
    // A park of the end of work written at another instant is no part of the group.
    const t = scenario(plan).raw({ k: 'block.cancel', block: 'f', at, rule: 'user' }, '09:30').raw({ k: 'block.park', block: 'q', at: at + 60_000, rule: 'workEnd', autoRule: 'workEnd' }, '09:31')
    expect(groupLogUndo(computeDay(t.contextAt(t.at('09:40'))), t.events, t.events.map((e) => e.id), t.at('09:40'))).toBe('to nie są zmiany tej grupy')
  })

  it('kolejność zaznaczenia nie zmienia wyniku: bloki w kolejności planu, każdy oceniony z tym, co zapisały wcześniejsze (D216 nie parkuje odwołanego)', () => {
    const plan = [fixed('f', '14:00', 60), flex('q', '16:00', 30)]
    // Work begun outside the plan, then „Koniec pracy” – only a break: the fixed block of work at 14:00 is still left.
    const s = scenario(plan).start('p0', '08:00').workEnd('09:00')
    const d = dayOf(s, '09:30')
    const at = s.at('09:30')
    const one = groupLogDrafts(d.ctx, d.state, 'cancel', ['q', 'f'], at)
    const two = groupLogDrafts(d.ctx, d.state, 'cancel', ['f', 'q'], at)
    expect(one).toEqual(two)
    // „f” first (the plan's order): its cancel parks the flexible work left (D216) – „q” is taken off then, never cancelled and parked both.
    expect(one.drafts.map((x) => [x.k, x.block, x.rule])).toEqual([
      ['block.cancel', 'f', 'user'],
      ['block.park', 'q', 'workEnd']
    ])
    expect([one.taken, one.skipped]).toEqual([['f'], [{ id: 'q', why: 'zdjęty' }]])
  })

  it('ten sam blok dwa razy w zaznaczeniu – jedno zdarzenie', () => {
    const d = dayOf(scenario([flex('a', '10:00', 30)]), '08:00')
    const g = groupLogDrafts(d.ctx, d.state, 'park', ['a', 'a'], scenario([]).at('08:00'))
    expect([g.taken, g.drafts.length]).toEqual([['a'], 1])
  })

  it('kolejność planu w pliku (migawka, potem plik) nie zmienia wyniku D216: bloki według godzin', () => {
    const f = fixed('f', '14:00', 60)
    const q = flex('q', '16:00', 30)
    const judge = (plan: PlanBlock[]) => {
      const s = scenario(plan).start('p0', '08:00').workEnd('09:00')
      const d = dayOf(s, '09:30')
      return groupLogDrafts(d.ctx, d.state, 'cancel', ['q', 'f'], s.at('09:30'))
    }
    expect(judge([q, f])).toEqual(judge([f, q]))
    expect(judge([q, f]).taken).toEqual(['f'])
  })

  it('„Cofnij” odwołania bloku zaparkowanego od tego czasu innym zdarzeniem: cofnięte, ale blok nie wraca do planu – kept', () => {
    const s = scenario([flex('a', '10:00', 30), flex('b', '11:00', 30)])
    s.raw({ k: 'block.cancel', block: 'a', at: s.at('07:00'), rule: 'user' }, '07:00').raw({ k: 'block.cancel', block: 'b', at: s.at('07:00'), rule: 'user' }, '07:00')
    const ids = s.events.slice(-2).map((e) => e.id)
    // „a” parked meanwhile (the bar): its cancel goes back, the park keeps it off the plan.
    s.raw({ k: 'block.park', block: 'a', at: s.at('07:05'), rule: 'user' }, '07:05')
    const u = groupLogUndo(computeDay(s.contextAt(s.at('07:10'))), s.events, ids, s.at('07:10'))
    expect(typeof u === 'string' ? u : [u.drafts.length, u.restored, u.kept]).toEqual([2, ['b'], ['a']])
  })

  it('drugie „Cofnij” niczego nie cofa: restored puste', () => {
    const s = scenario([flex('a', '10:00', 30)]).raw({ k: 'block.park', block: 'a', at: scenario([]).at('07:00'), rule: 'user' }, '07:00')
    const id = s.events.at(-1)!.id
    s.raw({ k: 'undo', at: s.at('07:10'), target: id, reason: 'user' }, '07:10')
    const u = groupLogUndo(computeDay(s.contextAt(s.at('07:20'))), s.events, [id], s.at('07:20'))
    expect(typeof u === 'string' ? u : [u.drafts, u.restored, u.kept]).toEqual([[], [], []])
  })
})

describe('Skutek energii (D529): najniższa energia przed i po – ten sam silnik co „Ułóż pod energię”', () => {
  type Answers = Record<Pool, [Answer, Answer]>
  const ZERO: Answers = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
  const plan = [flex('e1', '08:00', 120, { categoryId: 'analiza' }), flex('e2', '10:00', 120, { categoryId: 'analiza' }), flex('e3', '12:00', 120, { categoryId: 'analiza' })]

  it('usunięcie drogich bloków podnosi najniższą energię dnia; bez check-inu – bez energii', () => {
    const s = scenario(plan).checkin('07:00', ZERO)
    const d = dayOf(s, '07:30', ['e1', 'e2', 'e3'])
    const c = removedDay(d, fileOf(DATE, plan), ['e2', 'e3'])
    const e = groupEnergy(d, { plan: c.plan }, {})
    expect(e).not.toBeNull()
    expect(e!.after).toBeGreaterThan(e!.before)
    const none = dayOf(scenario(plan), '07:30', ['e1', 'e2', 'e3'])
    expect(groupEnergy(none, { plan: c.plan }, {})).toBeNull()
  })

  it('zmiana, która energii nie zmienia (nazwa na bloku bez kosztu) – bez linii energii', () => {
    const s = scenario(plan).checkin('07:00', ZERO)
    const d = dayOf(s, '07:30', ['e1', 'e2', 'e3'])
    expect(groupEnergy(d, { plan: d.ctx.plan }, {})).toBeNull()
  })
})
