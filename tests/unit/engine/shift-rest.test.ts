/**
 * „Przesuń resztę dnia o…” (N17, D584, T2465–T2475): from the earliest selected block of a day (any kind – a begun or a fixed one only says where
 * the rest starts) the flexible blocks the push apart moves (D367 – `pushable`) shift by ±N minutes, those after fixed blocks too. Later: every one
 * N later, one that would hit a fixed block jumps behind it – written where the forecast then shows it (D367). Earlier: every one N earlier, never
 * before now, 04:00 nor a block that stays before it (as „Przesuń resztę wcześniej”, D373). Fixed, protected, waiting, begun, session, lecture and
 * background blocks stay; anchored ones and the buffers of decompression (N7) follow their anchor and are never written; a group of parallel
 * blocks goes whole. A shift that pushes work past the maximum or the approved boundary, the plan past the bedtime or blocks past the day's end is
 * said (D72: a warning, the change is written).
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { blockJson, dayRaw, type Raw } from '@shared/data/dayEdits'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { computeDay, type DayContext } from '@shared/engine/day'
import { idxOfLogical } from '@shared/engine/grid'
import { axisStartOf, fieldsUndoOf, restOf, ruleVerdicts, undoFields, type GroupDay } from '@shared/engine/groupEdit'
import { restOverText, restOversText, shiftedRestDay } from '@shared/engine/shiftRest'
import { earlierRest } from '@shared/engine/gaps'
import { horizonDay } from '@shared/engine/week'
import { dayFileFrom, PLAN_MAX, type DayFile, type PlanBlock } from '@shared/model/plan'
import type { SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday (zwykły: maximum 19:00, bedtime 22:00)
const BEFORE = '2026-10-27' // „today” for DATE as a day to come
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fixed = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => flex(id, at, min, { fixed: true, ...o })
const fileOf = (date: string, plan: readonly PlanBlock[], extra: Raw = {}): Raw => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)), ...extra })

/** The day with `plan` (all of it the day's file) counted at `now`. No transition buffer unless given: the hours of the examples are exact. */
function scenario(plan: PlanBlock[], o: { date?: string; settings?: Record<string, unknown> } = {}) {
  return new Scenario({ date: o.date ?? DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0, ...o.settings } }).observe('06:30', null)
}
function dayOf(s: Scenario, now: string): GroupDay {
  const ctx = s.contextAt(s.at(now), { snapshot: { ...s.snapshot, blocks: [] } })
  return { ctx, state: computeDay(ctx) }
}
const startsOf = (raw: Raw, date = DATE) => Object.fromEntries(dayFileFrom(raw, date).blocks.map((b) => [b.id, b.startMin]))
const shownOf = (d: GroupDay, plan: readonly PlanBlock[]) => {
  const st = computeDay({ ...d.ctx, plan })
  return new Map(st.forecast.map((p) => [p.block.id, p]))
}

describe('„Przesuń resztę dnia o…” – później: ten blok i wszystkie elastyczne po nim, stały przeskakiwany (D367)', () => {
  // Today at 09:10: „run” runs since 09:00; a, b (75 min), c, d flexible; F fixed 12:30–13:30.
  const plan = () => [flex('run', '09:00', 30), flex('a', '10:00', 60), flex('b', '11:00', 75), fixed('F', '12:30', 60), flex('c', '13:30', 30), flex('d', '15:00', 30)]
  const today = () => dayOf(scenario(plan()).start('run', '09:00'), '09:10')

  it('„Gotowe, gdy”: +30 min z zaczętego bloku – 4 elastyczne przesunięte, b przeskakuje stały, stały i zaczęty na miejscu; „Cofnij” przywraca plik dnia', () => {
    const d = today()
    // A running block's place on today's axis is now: the rest starts there.
    expect(restOf(d, ['run'], DATE)).toMatchObject({ atMin: lm('09:10'), take: ['a', 'b', 'c', 'd'] })
    const file = fileOf(DATE, plan())
    const c = shiftedRestDay(d, file, ['run'], 30, DATE)
    // b at 11:30 would end 12:45 – on F: it jumps behind it (13:30), c follows b, d has room at 15:30.
    expect(startsOf(c.raw)).toEqual({ run: lm('09:00'), a: lm('10:30'), b: lm('13:30'), F: lm('12:30'), c: lm('14:45'), d: lm('15:30') })
    expect(c.moved).toEqual(['a', 'b', 'c', 'd'])
    expect(c.over).toBeNull()
    // Written where the day then shows them (D367).
    const shown = shownOf(d, c.plan)
    for (const id of c.moved) expect(shown.get(id)!.from, id).toBe(idxOfLogical(d.state.grid, startsOf(c.raw)[id]!))
    // „Cofnij”: the day's file as before.
    const back = undoFields(c.raw, DATE, fieldsUndoOf(file, c.raw, DATE, d.ctx.plan))
    expect(back.kept).toEqual([])
    expect(back.raw).toEqual(dayRaw(file, DATE))
  })

  it('z kilku zaznaczonych – od najwcześniejszego na osi; ze stałego – tylko bloki po nim', () => {
    const d = today()
    expect(restOf(d, ['c', 'a'], DATE).take).toEqual(['a', 'b', 'c', 'd'])
    const fromFixed = shiftedRestDay(d, fileOf(DATE, plan()), ['F'], 15, DATE)
    expect(startsOf(fromFixed.raw)).toMatchObject({ a: lm('10:00'), b: lm('11:00'), F: lm('12:30'), c: lm('13:45'), d: lm('15:15') })
    expect(fromFixed.moved).toEqual(['c', 'd'])
  })

  it('chronione, w tle, sesje i zaczęte zostają; zakotwiczony idzie za kotwicą bez własnej godziny; grupa równoległa cała', () => {
    const p = [
      flex('a', '10:00', 60),
      flex('y', '10:00', 15, { startMin: null, anchor: 'a' }),
      flex('meal', '12:00', 30, { categoryId: 'posilek' }),
      flex('bg', '13:00', 30, { background: true }),
      { ...fixed('ses', '14:00', 60), origin: 'session' as const, categoryId: 'sesja-ny' },
      flex('r', '16:00', 60),
      flex('s', '16:00', 30, { alongside: 'r' })
    ]
    const d = dayOf(scenario(p), '08:00')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['a'], 30, DATE)
    expect(c.moved).toEqual(['a', 'r', 's'])
    expect(dayFileFrom(c.raw, DATE).blocks.map((b) => [b.id, b.startMin, b.anchor, b.alongside])).toEqual([
      ['a', lm('10:30'), null, null],
      ['y', null, 'a', null],
      ['meal', lm('12:00'), null, null],
      ['bg', lm('13:00'), null, null],
      ['ses', lm('14:00'), null, null],
      ['r', lm('16:30'), null, null],
      ['s', lm('16:30'), null, 'r']
    ])
    // The anchored one stands after its anchor's new end.
    expect(shownOf(d, c.plan).get('y')!.from).toBe(idxOfLogical(d.state.grid, lm('11:30')))
  })

  it('nic do przesunięcia – pusto (sam stały na końcu, dzień miniony)', () => {
    const p = [flex('a', '10:00', 60), fixed('F', '12:00', 60)]
    const d = dayOf(scenario(p), '08:00')
    expect(restOf(d, ['F'], DATE).take).toEqual([])
    const c = shiftedRestDay(d, fileOf(DATE, p), ['F'], 30, DATE)
    expect([c.moved, c.pushed]).toEqual([[], []])
    expect(startsOf(c.raw)).toEqual({ a: lm('10:00'), F: lm('12:00') })
    expect(restOf(d, ['a'], '2026-10-29')).toEqual({ atMin: null, atIdx: null, take: [] })
    expect(shiftedRestDay(d, fileOf(DATE, p), ['a'], 30, '2026-10-29').moved).toEqual([])
  })

  it('zawsze (ustalone ziarno; dwie kategorie z buforem przejścia, stały w środku): każdy przesunięty co najmniej o N, zapisany tam, gdzie go widać, w tej samej kolejności', () => {
    const rnd = (seed: number) => {
      let x = seed
      return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
    }
    let jumps = 0
    for (let seed = 1; seed <= 120; seed++) {
      const r = rnd(seed)
      const p: PlanBlock[] = []
      let t = lm('08:00')
      for (let i = 0; i < 7; i++) {
        t += Math.floor(r() * 40)
        const min = 15 + Math.floor(r() * 60)
        p.push({ ...flex(`b${i}`, '08:00', min, { categoryId: r() < 0.5 ? 'inne' : 'analiza', fixed: i === 3 }), startMin: t })
        t += min
      }
      const d = dayOf(scenario(p, { settings: { transitionBufferMin: 5 } }), '08:00')
      const from = `b${Math.floor(r() * 3)}`
      const minutes = (r() < 0.5 ? 1 : -1) * (5 + Math.floor(r() * 90))
      const c = shiftedRestDay(d, fileOf(DATE, p), [from], minutes, BEFORE)
      const before = new Map(d.state.forecast.map((x) => [x.block.id, x]))
      const shown = shownOf(d, c.plan)
      const starts = startsOf(c.raw)
      const take = restOf(d, [from], BEFORE).take
      for (const id of take) {
        const was = before.get(id)!.from
        // Later: from where the axis shows it (a day to come – its plan); earlier: never later than the forecast showed it.
        const axis = idxOfLogical(d.state.grid, axisStartOf(d, id, BEFORE)!)
        const now = shown.get(id)!.from
        if (minutes > 0) expect(now, `${seed} ${id}`).toBeGreaterThanOrEqual(axis + minutes)
        else expect(now, `${seed} ${id}`).toBeLessThanOrEqual(was)
        if (minutes > 0 && now > axis + minutes) jumps++
        if (c.moved.includes(id)) expect(now, `${seed} ${id} zapisany = pokazany`).toBe(idxOfLogical(d.state.grid, starts[id]!))
      }
      // The rest keeps its order; the blocks that are not of it keep their hours.
      const order = take.map((id) => shown.get(id)!.from)
      expect([...order].sort((x, y) => x - y), `${seed}`).toEqual(order)
      for (const b of p) if (!take.includes(b.id)) expect(starts[b.id], `${seed} ${b.id}`).toBe(b.startMin)
    }
    // The sequence makes blocks jump the fixed one or follow it (the rule is checked, not skipped).
    expect(jumps).toBeGreaterThan(20)
  })
})

describe('„Przesuń resztę dnia o…” – wcześniej: nie przed teraz, 04:00 ani przed blokiem, który zostaje (jak D373)', () => {
  const plan = () => [flex('run', '09:00', 30), flex('a', '10:00', 60), flex('b', '11:00', 75), fixed('F', '12:30', 60), flex('c', '13:30', 30), flex('d', '15:00', 30)]
  const today = () => dayOf(scenario(plan()).start('run', '09:00'), '09:10')

  it('−45 od b: b nie przed a, c nie przed stałym (nie przeskakuje go wstecz), d o 45 min wcześniej', () => {
    const c = shiftedRestDay(today(), fileOf(DATE, plan()), ['b'], -45, DATE)
    expect(startsOf(c.raw)).toEqual({ run: lm('09:00'), a: lm('10:00'), b: lm('11:00'), F: lm('12:30'), c: lm('13:30'), d: lm('14:15') })
    expect(c.moved).toEqual(['d'])
    expect(c.over).toBeNull()
  })

  it('−120 od a o 09:10: a za trwającym blokiem (nie przed teraz), b za a, c za stałym, d za c', () => {
    const d = today()
    const c = shiftedRestDay(d, fileOf(DATE, plan()), ['a'], -120, DATE)
    expect(startsOf(c.raw)).toEqual({ run: lm('09:00'), a: lm('09:30'), b: lm('10:30'), F: lm('12:30'), c: lm('13:30'), d: lm('14:00') })
    expect(c.moved).toEqual(['a', 'b', 'd'])
    const shown = shownOf(d, c.plan)
    for (const id of c.moved) expect(shown.get(id)!.from, id).toBe(idxOfLogical(d.state.grid, startsOf(c.raw)[id]!))
  })

  it('−90 od b: b nie przed a (blokiem przed nim) – zostaje; c za stałym; d tuż za c', () => {
    const c = shiftedRestDay(today(), fileOf(DATE, plan()), ['b'], -90, DATE)
    expect(startsOf(c.raw)).toEqual({ run: lm('09:00'), a: lm('10:00'), b: lm('11:00'), F: lm('12:30'), c: lm('13:30'), d: lm('14:00') })
    expect(c.moved).toEqual(['d'])
  })

  it('dzień przyszły: nie przed 04:00', () => {
    const p = [flex('a', '05:00', 30), flex('b', '06:00', 30)]
    const s = scenario(p)
    // Counted the day before: no „now” in it.
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')), { snapshot: { ...s.snapshot, blocks: [] } })
    const c = shiftedRestDay({ ctx, state: computeDay(ctx) }, fileOf(DATE, p), ['a'], -180, BEFORE)
    expect(startsOf(c.raw)).toEqual({ a: lm('04:00'), b: lm('04:30') })
  })
})

describe('doba: 25 godzin i ostatni start 03:59 (`PLAN_MAX`)', () => {
  it('doba 25-godzinna: blok w drugiej 02:30 przesuwa się od 03:00', () => {
    const LONG = '2026-10-24'
    const p = [flex('a', '01:00', 150), flex('b', '02:00', 30)]
    const d = dayOf(scenario(p, { date: LONG }), '23:00')
    const c = shiftedRestDay(d, fileOf(LONG, p), ['b'], 15, LONG)
    expect(startsOf(c.raw, LONG).b).toBe(lm('03:15'))
  })

  it('za końcem doby: najpóźniejsze starty bez nakładania, ostrzeżenie „1 blok za końcem doby (04:00)”', () => {
    const p = [flex('y', '23:00', 60), flex('z', '00:30', 60)]
    const d = dayOf(scenario(p), '08:00')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['y'], 240, BEFORE, () => undefined)
    expect(startsOf(c.raw)).toEqual({ y: lm('03:00'), z: PLAN_MAX })
    expect(c.over).toEqual({ kind: 'dayEnd', n: 1 })
    expect(restOverText(c.over!)).toBe('1 blok za końcem doby (04:00)')
  })
})

describe('granica (D72 – ostrzeżenie, zapis)', () => {
  it('praca po maksimum: „praca kończy się po maksimum (19:00)”', () => {
    const p = [flex('a', '17:30', 60)]
    const c = shiftedRestDay(dayOf(scenario(p), '08:00'), fileOf(DATE, p), ['a'], 60, BEFORE)
    expect(startsOf(c.raw).a).toBe(lm('18:30'))
    expect(c.over).toEqual({ kind: 'max', atMin: lm('19:00') })
    expect(restOverText(c.over!)).toBe('praca kończy się po maksimum (19:00)')
  })

  it('zatwierdzona granica dziś: „koniec pracy 17:30 – po granicy 17:00”', () => {
    const p = [flex('a', '15:30', 60)]
    const d = dayOf(scenario(p).approve('17:00', '08:00'), '09:00')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['a'], 60, DATE)
    expect(c.over).toMatchObject({ kind: 'boundary', atMin: lm('17:00') })
    expect(restOverText(c.over!)).toMatch(/^koniec pracy 17:\d\d – po granicy 17:00$/)
  })

  it('pora snu: „plan do 22:15 – po porze snu 22:00”; wcześniej – bez ostrzeżeń; kilka dni – jedno zdanie', () => {
    const p = [flex('p', '21:00', 45, { categoryId: 'projekty' })]
    const d = dayOf(scenario(p), '08:00')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['p'], 30, BEFORE)
    expect(c.over).toEqual({ kind: 'bedtime', atMin: lm('22:00'), endMin: lm('22:15') })
    expect(restOverText(c.over!)).toBe('plan do 22:15 – po porze snu 22:00')
    expect(shiftedRestDay(d, fileOf(DATE, p), ['p'], -30, BEFORE).over).toBeNull()
    expect(restOversText([c.over!])).toBe('plan do 22:15 – po porze snu 22:00')
    expect(restOversText([c.over!, { kind: 'max', atMin: lm('19:00') }])).toBe('za granicą w 2 dniach')
  })
})

describe('bufory dekompresji (N7): idą za źródłem, nigdy nie są zapisywane ani zabierane', () => {
  const SAT = '2026-10-31' // weekend: no sessions
  function bufferDay(plan: PlanBlock[], at = placeLogical('2026-10-30', lm('12:00'))) {
    const s = new Scenario({ date: SAT, dayType: 'weekend', plan })
    const changes: SettingsChange[] = [{ id: 'c1', from: SAT, at: null, made: 1, patch: { decompress: { on: true }, transitionBufferMin: 0 } }]
    const inputs: PlanInputs = { changes, templates: [], lectures: [], series: [], routines: [] }
    const file = (blocks: readonly PlanBlock[]): DayFile => ({ ...dayFileFrom({}, SAT), dayType: 'weekend', blocks: [...blocks] })
    const ctxOf = (blocks: readonly PlanBlock[]): DayContext => dayContextOf(inputs, { date: SAT, events: [], dayFile: file(blocks), nextFile: null }, marketDay, at)
    const ctx = ctxOf(plan)
    return { day: { ctx, state: computeDay(ctx) } as GroupDay, ctxOf, changes }
  }
  const meeting = (o: Partial<PlanBlock> = {}): PlanBlock => ({ ...flex('meet', '10:00', 90), costs: { head: 0, emotions: 4, senses: 0, body: 0 }, ...o })
  const isBuffer = (b: PlanBlock) => b.origin === ('decompress' as PlanBlock['origin'])

  it('+30 od spotkania: bufor za nowym końcem, w pliku go nie ma; kolejny za buforem', () => {
    const plan = [meeting(), flex('n', '13:00', 30)]
    const { day, ctxOf } = bufferDay(plan)
    const buffer = day.ctx.plan.find(isBuffer)!
    expect(buffer).toBeDefined()
    const c = shiftedRestDay(day, fileOf(SAT, plan), ['meet'], 30, '2026-10-30')
    expect(dayFileFrom(c.raw, SAT).blocks.some(isBuffer)).toBe(false)
    expect(startsOf(c.raw, SAT).meet).toBe(lm('10:30'))
    const after = ctxOf(dayFileFrom(c.raw, SAT).blocks)
    const st = computeDay(after)
    const at = (id: string) => st.forecast.find((p) => p.block.id === id)!
    const buf = after.plan.find(isBuffer)!
    expect(at(buf.id).from).toBe(idxOfLogical(st.grid, lm('12:00')))
    expect(at('n').from).toBeGreaterThanOrEqual(at(buf.id).to)
  })

  it('7. wcześniej z buforem przyciętym do pory snu: po zapisie bufor rośnie – kolejny zapisany tam, gdzie go pokaże dzień (D583)', () => {
    // 110 min at 4 – a buffer of 20 min, at 23:50 only 10 before the bedtime (24:00); 30 min earlier it has its 20 and n goes behind it.
    const plan = [meeting({ startMin: lm('22:00'), durationMin: 110 }), flex('n', '00:00', 30)]
    const { day, ctxOf, changes } = bufferDay(plan)
    const c = shiftedRestDay(day, fileOf(SAT, plan), ['meet'], -30, '2026-10-30', undefined, changes)
    const blocks = dayFileFrom(c.raw, SAT).blocks
    const after = ctxOf(blocks)
    const st = computeDay(after)
    const n = startsOf(c.raw, SAT).n!
    expect(st.forecast.find((p) => p.block.id === 'n')!.from).toBe(idxOfLogical(st.grid, n))
    expect(after.plan.find((b) => b.id === 'n')!.startMin).toBe(n)
    expect(n).toBe(lm('23:40'))
    expect(c.moved).toEqual(['meet', 'n'])
  })

  it('r3-2. wcześniej o 09:50: blok zakotwiczony za buforem spotkania trzyma się końca bufora – kolejny za nim (11:50)', () => {
    // meet 10:00–11:30 (90 min at 4 – a buffer of 15), A anchored to meet stands after the buffer (11:45–12:00), M 12:00. −40 at 09:50: meet from now.
    const plan = [meeting(), flex('A', '10:00', 15, { startMin: null, anchor: 'meet' }), flex('M', '12:00', 30)]
    const { day, changes } = bufferDay(plan, placeLogical(SAT, lm('09:50')))
    const c = shiftedRestDay(day, fileOf(SAT, plan), ['meet'], -40, SAT, undefined, changes)
    expect(startsOf(c.raw, SAT)).toMatchObject({ meet: lm('09:50'), M: lm('11:50') })
  })

  it('−60 za stałym źródłem z buforem: blok zostaje za buforem (nie zabiera go)', () => {
    const plan = [meeting({ fixed: true }), flex('n', '13:30', 30)]
    const { day } = bufferDay(plan)
    const buffer = day.ctx.plan.find(isBuffer)!
    const bufferAt = day.state.forecast.find((p) => p.block.id === buffer.id)!
    const c = shiftedRestDay(day, fileOf(SAT, plan), ['n'], -120, '2026-10-30')
    const st = computeDay({ ...day.ctx, plan: c.plan })
    expect(st.forecast.find((p) => p.block.id === 'n')!.from).toBe(bufferAt.to)
    expect(c.plan.some((b) => b.id === buffer.id)).toBe(true)
  })
})

describe('przegląd r1 (N17)', () => {
  /** A day to come counted the day before: no „now” in it. */
  function future(p: PlanBlock[], o: { settings?: Record<string, unknown> } = {}): GroupDay {
    const s = scenario(p, o)
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')), { snapshot: { ...s.snapshot, blocks: [] } })
    return { ctx, state: computeDay(ctx) }
  }

  it('1. wcześniej: zakotwiczony do przesuwanego idzie z nim – nie jest podłogą dla kolejnych', () => {
    const p = [flex('s', '10:00', 60), flex('y', '10:00', 15, { startMin: null, anchor: 's' }), flex('f', '11:15', 45), flex('g', '12:00', 30)]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['s'], -30, BEFORE)
    expect(startsOf(c.raw)).toEqual({ s: lm('09:30'), y: null, f: lm('10:45'), g: lm('11:30') })
    expect(c.moved).toEqual(['s', 'f', 'g'])
  })

  it('2. wcześniej: blok trwający zaczęty przed swoją godziną planu nie podnosi podłogi do niej', () => {
    // „run” planned at 13:00, begun at 09:00 (runs to 10:00): „a” at 11:00 goes to 10:00, not behind 13:00.
    const p = [flex('run', '13:00', 60), flex('a', '11:00', 30)]
    const d = dayOf(scenario(p).start('run', '09:00'), '09:10')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['a'], -60, DATE)
    expect(startsOf(c.raw).a).toBe(lm('10:00'))
    expect(c.moved).toEqual(['a'])
  })

  it('3. grupa równoległa: zaparkowany blok obok zostaje (bez nowej godziny, poza liczbą)', () => {
    const p = [flex('r', '12:00', 60), flex('s', '12:00', 30, { alongside: 'r' }), flex('t', '14:00', 30)]
    const sc = scenario(p)
    const d = dayOf(sc.raw({ k: 'block.park', block: 's', at: sc.at('08:30'), rule: 'user' }, '08:30'), '09:00')
    expect(restOf(d, ['r'], DATE).take).toEqual(['r', 't'])
    const c = shiftedRestDay(d, fileOf(DATE, p), ['r'], 30, DATE)
    expect(c.moved).toEqual(['r', 't'])
    expect(startsOf(c.raw)).toMatchObject({ r: lm('12:30'), t: lm('14:30') })
  })

  it('4. dzień przyszły: reszta według planu – blok zaplanowany przed zaznaczonym (pokazany za stałym, za nim) zostaje', () => {
    // Z (09:30) and S (10:50) both hit F (09:45–10:55): the forecast shows Z at 10:55 and S after it – Z is planned before S, not of its rest.
    const p = [flex('z', '09:30', 60), fixed('F', '09:45', 70), flex('s', '10:50', 30)]
    const d = future(p)
    expect(restOf(d, ['s'], BEFORE).take).toEqual(['s'])
    const c = shiftedRestDay(d, fileOf(DATE, p), ['s'], 30, BEFORE)
    expect(c.moved).toEqual(['s'])
    expect(startsOf(c.raw).z).toBe(lm('09:30'))
  })

  it('5. za końcem doby: starty wstecz od 03:59 po minucie, kolejność zostaje; ostrzeżenie', () => {
    const p = [flex('y', '03:00', 30), flex('z', '03:20', 30), flex('w', '03:45', 10)]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['y'], 60, BEFORE)
    expect(startsOf(c.raw)).toEqual({ y: PLAN_MAX - 2, z: PLAN_MAX - 1, w: PLAN_MAX })
    expect(c.over).toEqual({ kind: 'dayEnd', n: 3 })
  })

  it('6. blok zaczęty poza planem wyznacza początek reszty (pozycja menu nie jest wyłączona)', () => {
    const p = [flex('a', '10:00', 30), flex('b', '11:00', 30)]
    const d = dayOf(scenario(p).start('x', '09:00', { min: 30 }), '09:10')
    expect(restOf(d, ['x'], DATE).take).toEqual(['a', 'b'])
    expect(ruleVerdicts(d, ['x'], DATE).rest).toEqual({ take: 2, skipped: [] })
    const c = shiftedRestDay(d, fileOf(DATE, p), ['x'], 15, DATE)
    expect(c.moved).toEqual(['a', 'b'])
  })
})

describe('przegląd r2 (N17)', () => {
  function future(p: PlanBlock[], o: { settings?: Record<string, unknown> } = {}): GroupDay {
    const s = scenario(p, o)
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')), { snapshot: { ...s.snapshot, blocks: [] } })
    return { ctx, state: computeDay(ctx) }
  }
  const shownStart = (d: GroupDay, plan: readonly PlanBlock[], id: string) => shownOf(d, plan).get(id)!.from

  it('1. wcześniej: kotwica nie rusza o pełne N (teraz) – zakotwiczony trzyma się jej nowego końca, kolejny za nim (bez nakładania)', () => {
    const p = [flex('s', '10:00', 60), flex('y', '10:00', 15, { startMin: null, anchor: 's' }), flex('f', '11:15', 45)]
    const d = dayOf(scenario(p), '09:50')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['s'], -30, DATE)
    expect(startsOf(c.raw)).toEqual({ s: lm('09:50'), y: null, f: lm('11:05') })
    expect(shownStart(d, c.plan, 'y')).toBe(idxOfLogical(d.state.grid, lm('10:50')))
  })

  it('2. początek reszty z bloku planu już skończonego: miejsce, w którym biegł (nie godzina planu)', () => {
    const p = [flex('e', '13:00', 30), flex('a', '11:00', 30)]
    const d = dayOf(scenario(p).start('e', '08:00').end('e', '08:30'), '09:00')
    expect(restOf(d, ['e'], DATE)).toMatchObject({ atMin: lm('08:00'), take: ['a'] })
  })

  it('3. dzień przyszły: blok reszty, który prognoza już pokazywała dalej niż plan + N, zapisany tam, gdzie go widać', () => {
    // b (09:40) overlaps the fixed F (09:45–10:55): shown at 10:55; +15 – still on F, written behind it.
    const p = [flex('a', '08:00', 30), fixed('F', '09:45', 70), flex('b', '09:40', 30)]
    const d = future(p)
    const c = shiftedRestDay(d, fileOf(DATE, p), ['a'], 15, BEFORE)
    expect(startsOf(c.raw)).toEqual({ a: lm('08:15'), F: lm('09:45'), b: lm('10:55') })
    expect(shownStart(d, c.plan, 'b')).toBe(idxOfLogical(d.state.grid, lm('10:55')))
    expect(c.moved).toEqual(['a', 'b'])
  })

  it('4. wcześniej w dniu przyszłym: nigdy start późniejszy niż plan (blok nakładający się w planie zostaje)', () => {
    // b planned at 11:00 under a (10:00–11:15): shown at 11:15; a −5 – b is shown at 11:10, but its plan stays 11:00.
    const p = [flex('a', '10:00', 75), flex('b', '11:00', 30)]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['a'], -5, BEFORE)
    expect(startsOf(c.raw)).toEqual({ a: lm('09:55'), b: lm('11:00') })
    expect(c.moved).toEqual(['a'])
  })

  it('5. wcześniej: zaparkowany blok obok pierwszego zostaje na starej godzinie, poza grupą (jak „Przesuń o”)', () => {
    const p = [flex('r', '12:00', 60), flex('s', '12:00', 30, { alongside: 'r' }), flex('t', '14:00', 30)]
    const sc = scenario(p)
    const d = dayOf(sc.raw({ k: 'block.park', block: 's', at: sc.at('08:30'), rule: 'user' }, '08:30'), '09:00')
    const c = shiftedRestDay(d, fileOf(DATE, p), ['r'], -30, DATE)
    expect(dayFileFrom(c.raw, DATE).blocks.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['r', lm('11:30'), null],
      ['s', lm('12:00'), null],
      ['t', lm('13:30'), null]
    ])
    expect(c.moved).toEqual(['r', 't'])
  })

  it('6. wcześniej przez całą resztę: limit rund mówi `onUnsettled` (jak rozsuwanie)', () => {
    const p = [flex('a', '10:00', 30), flex('b', '11:00', 30), flex('c', '12:00', 30)]
    const d = future(p)
    let unsettled = 0
    earlierRest(d.ctx, d.state, ['a', 'b', 'c'], 30, { maxRounds: 1, onUnsettled: () => unsettled++ })
    expect(unsettled).toBe(1)
    earlierRest(d.ctx, d.state, ['a', 'b', 'c'], 30, { onUnsettled: () => unsettled++ })
    expect(unsettled).toBe(1)
  })

  it('7. nic nie przesunięte (już na 03:59) – plik bez zmian, także blok szablonu nie trafia do pliku', () => {
    const p = [flex('z', '03:59', 30)]
    const s = scenario(p)
    // The block of the snapshot (a template's): not in the day's file.
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')))
    const c = shiftedRestDay({ ctx, state: computeDay(ctx) }, null, ['z'], 15, BEFORE)
    expect(c.moved).toEqual([])
    expect(c.raw).toEqual(dayRaw(null, DATE))
  })

  it('8. dzień miniony, zaznaczony tylko blok spoza planu – „miniony”', () => {
    const d = dayOf(scenario([flex('a', '10:00', 30)]).start('x', '09:00', { min: 30 }), '09:10')
    expect(ruleVerdicts(d, ['x'], '2026-10-29').rest).toEqual({ take: 0, skipped: ['miniony'] })
  })

  it('9. kolumny: `HorizonBlock.pushable` – reguła rozsuwania (chroniony, stały, w tle – nie)', () => {
    const p = [flex('a', '10:00', 30), flex('m', '12:00', 30, { categoryId: 'posilek' }), fixed('F', '13:00', 30), flex('bg', '14:00', 30, { background: true })]
    const h = horizonDay(future(p).ctx, 'future')
    expect(Object.fromEntries(h.blocks.map((b) => [b.id, b.pushable === true]))).toEqual({ a: true, m: false, F: false, bg: false })
  })

  it('10. za końcem doby: cofanie od 03:59 nie stawia bloku przed stałym, który zostaje przy końcu doby', () => {
    const p = [fixed('F', '03:57', 2), flex('y', '03:00', 30), flex('z', '03:30', 20), flex('w', '03:50', 5)]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['y'], 60, BEFORE)
    const st = startsOf(c.raw)
    for (const id of ['y', 'z', 'w']) expect(st[id], id).toBeGreaterThan(lm('03:57'))
    expect(st.y! <= st.z! && st.z! <= st.w!).toBe(true)
    expect(st.F).toBe(lm('03:57'))
  })
})

describe('przegląd r3 (N17)', () => {
  function future(p: PlanBlock[]): GroupDay {
    const s = scenario(p)
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')), { snapshot: { ...s.snapshot, blocks: [] } })
    return { ctx, state: computeDay(ctx) }
  }

  it('1. stały o 03:59 i blok przesunięty za niego: start najwyżej 03:59 – blok zostaje w pliku; `onUnsettled`', () => {
    const p = [fixed('F', '03:59', 1), flex('y', '03:00', 30)]
    let unsettled = 0
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['y'], 60, BEFORE, () => unsettled++)
    const st = startsOf(c.raw)
    expect(Object.keys(st).sort()).toEqual(['F', 'y'])
    expect(st.y).toBeLessThanOrEqual(PLAN_MAX)
    expect(unsettled).toBeGreaterThan(0)
  })

  it('3. wcześniej przez resztę dnia: blok zaplanowany pod stałym (pokazany za nim) – nigdy później niż plan, nie liczony', () => {
    // b planned at 09:45 under F (09:30–11:00), shown behind G (11:00–11:15) at 11:15; c behind it. −15 from a: G stays before b – b keeps its plan.
    const p = [flex('a', '08:00', 30), fixed('F', '09:30', 90), fixed('G', '11:00', 15), flex('b', '09:45', 30), flex('c', '11:45', 30)]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['a'], -15, BEFORE)
    const st = startsOf(c.raw)
    expect(st.b).toBe(lm('09:45'))
    expect(c.moved).not.toContain('b')
    for (const b of p) expect(st[b.id]!, b.id).toBeLessThanOrEqual(b.startMin!)
  })

  it('4. na końcu doby brakuje minut: kolejność reszty zostaje tam, gdzie się da, remis – z `onUnsettled`', () => {
    // F fixed 03:57: three blocks to lay after it in two minutes (03:58, 03:59).
    const p = [fixed('F', '03:57', 2), flex('y', '03:00', 30), flex('z', '03:30', 20), flex('w', '03:50', 5)]
    let unsettled = 0
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['y'], 60, BEFORE, () => unsettled++)
    const st = startsOf(c.raw)
    expect([st.y, st.z, st.w]).toEqual([lm('03:58'), lm('03:59'), lm('03:59')])
    expect(unsettled).toBeGreaterThan(0)
    expect(c.over).toMatchObject({ kind: 'dayEnd' })
  })

  it('5. w środku dnia o pełne N: blok na starcie chronionego (zostaje) – nie cofany o minutę', () => {
    const p = [flex('a', '10:30', 30), flex('p', '11:00', 30, { categoryId: 'posilek' })]
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['a'], 30, BEFORE)
    expect(startsOf(c.raw)).toEqual({ a: lm('11:00'), p: lm('11:00') })
  })
})

describe('przegląd r4 (N17)', () => {
  function future(p: PlanBlock[]): GroupDay {
    const s = scenario(p)
    const ctx = s.contextAt(placeLogical(BEFORE, lm('12:00')), { snapshot: { ...s.snapshot, blocks: [] } })
    return { ctx, state: computeDay(ctx) }
  }

  it('1. dziś późno w nocy (03:50): ogon na 03:59 nigdy przed teraz – za mało minut: `onUnsettled`', () => {
    const p = Array.from({ length: 12 }, (_, k) => flex(`b${k}`, `03:${String(51 + Math.min(k, 8)).padStart(2, '0')}`, 5))
    const d = dayOf(scenario(p), '03:50')
    let unsettled = 0
    const c = shiftedRestDay(d, fileOf(DATE, p), ['b0'], 10, DATE, () => unsettled++)
    const st = startsOf(c.raw)
    for (const b of p) expect(st[b.id], b.id).toBeGreaterThanOrEqual(lm('03:50'))
    expect(unsettled).toBeGreaterThan(0)
  })

  it('2. ogon za blokiem zakotwiczonym do głowy przed ogonem: nigdy przed nim (jego klucz – start kotwicy + długość)', () => {
    // H 02:30–02:57 with A (5 min) anchored to it; T1–T3 after. +60: H 03:30–03:57, A at 03:57 – the tail laid after A's key, not at it.
    const p = [flex('H', '02:30', 27), flex('A', '02:30', 5, { startMin: null, anchor: 'H' }), flex('T1', '03:05', 30), flex('T2', '03:35', 10), flex('T3', '03:45', 10)]
    let unsettled = 0
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['H'], 60, BEFORE, () => unsettled++)
    const st = startsOf(c.raw)
    expect(st.H).toBe(lm('03:30'))
    for (const id of ['T1', 'T2', 'T3']) expect(st[id], id).toBeGreaterThan(lm('03:57'))
    expect(unsettled).toBeGreaterThan(0)
  })

  it('3. wcześniej: trwający blok zakotwiczony do przesuwanego – podłoga tam, gdzie biegnie; zapauzowany idzie za kotwicą (nie jest podłogą)', () => {
    // Running: y anchored to s runs since 09:50 (to 10:20); s 11:00 −90 – not before it.
    const p = [flex('s', '11:00', 60), flex('y', '11:00', 30, { startMin: null, anchor: 's' })]
    const run = dayOf(scenario(p).start('y', '09:50'), '10:00')
    const yRun = run.state.forecast.find((x) => x.block.id === 'y')!
    const c = shiftedRestDay(run, fileOf(DATE, p), ['s'], -90, DATE)
    expect(shownOf(run, c.plan).get('s')!.from).toBeGreaterThanOrEqual(yRun.to)
    // Paused: the day shows the rest of y after its anchor – it goes with s; f behind it, not behind y's old place (12:00).
    const q = [...p, flex('f', '12:30', 30)]
    const paused = dayOf(scenario(q).start('y', '09:00').pause('y', '09:10'), '10:00')
    const e = shiftedRestDay(paused, fileOf(DATE, q), ['s'], -90, DATE)
    const shown = shownOf(paused, e.plan)
    expect(shown.get('f')!.from).toBe(shown.get('y')!.to)
    expect(startsOf(e.raw).f).toBeLessThan(lm('12:00'))
  })

  it('4. później: ogon nigdy wcześniej niż przed zmianą (dwa bloki na 03:59 zostają, remis – `onUnsettled`)', () => {
    const p = [flex('x', '03:00', 30), flex('y', '03:59', 10), flex('z', '03:59', 10)]
    let unsettled = 0
    const c = shiftedRestDay(future(p), fileOf(DATE, p), ['x'], 15, BEFORE, () => unsettled++)
    const st = startsOf(c.raw)
    expect([st.y, st.z]).toEqual([PLAN_MAX, PLAN_MAX])
    expect(st.x).toBe(lm('03:15'))
    expect(unsettled).toBeGreaterThan(0)
  })
})

describe('T1720 – pozycja „Przesuń resztę dnia o…” według silnika (`ruleVerdicts`)', () => {
  it('ile bloków przesunie z zaznaczonych; nic – 0; dzień miniony – „miniony”', () => {
    const p = [flex('a', '10:00', 60), flex('b', '11:00', 60), fixed('F', '12:00', 60)]
    const d = dayOf(scenario(p), '08:00')
    expect(ruleVerdicts(d, ['a'], DATE).rest).toEqual({ take: 2, skipped: [] })
    expect(ruleVerdicts(d, ['F'], DATE).rest).toEqual({ take: 0, skipped: [] })
    expect(ruleVerdicts(d, ['a', 'b'], '2026-10-29').rest).toEqual({ take: 0, skipped: ['miniony', 'miniony'] })
  })
})
