/**
 * Przeciąganie grupy (D531, ciąg Z – czysta logika `engine/groupDrag.ts`): zaznaczone bloki jadą o tę samą różnicę dni i minut (różnica =
 * miejsce upuszczenia chwyconego − jego start), każdy według reguły swojego przeciągnięcia (D305); zaczęte, sesje, wykłady, zjazdy,
 * zakotwiczone do bloku, który zostaje, bez godziny, te, które trafiłyby na dzień miniony, poza dobę logiczną albo poza widok – zostają z
 * powodem; zakotwiczony do przenoszonego idzie za kotwicą (D424); zajęte miejsca rozsuwają kolejne elastyczne w każdym dniu (D367); wszystkie
 * dni to jedna zmiana – docelowe najpierw (T952); Ctrl – kopia (D513, oryginały zostają). Zapisany start = pokazany start.
 */
import { describe, expect, it } from 'vitest'
import { blockJson, type Raw } from '@shared/data/dayEdits'
import { computeDay } from '@shared/engine/day'
import { idxOfLogical } from '@shared/engine/grid'
import { dayPlan } from '@shared/engine/createDay'
import { draggedDays, dragPreview, judgeDrag, type DragKey } from '@shared/engine/groupDrag'
import type { GroupDay } from '@shared/engine/groupEdit'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const MON = '2026-10-26'
const TUE = '2026-10-27'
const WED = '2026-10-28'
const BEFORE = '2026-10-25'
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const fileOf = (date: string, plan: readonly PlanBlock[]): Raw => ({ schema: 1, date, blocks: plan.map((b) => blockJson(b)) })
const startsOf = (raw: Raw, date: string) => Object.fromEntries(dayFileFrom(raw, date).blocks.map((b) => [b.id, b.startMin]))
const scenario = (plan: PlanBlock[], date: string, settings: Record<string, unknown> = {}) => new Scenario({ date, plan, wake: '06:30', settings: { transitionBufferMin: 0, ...settings } }).observe('06:30', null)
/** The day counted at `now`, every block of it yours (in its file). */
function dayOf(s: Scenario, now: string): GroupDay {
  const ctx = s.contextAt(s.at(now), { snapshot: { ...s.snapshot, blocks: [] } })
  const withPlan = { ...ctx, plan: s.opts.plan }
  return { ctx: withPlan, state: computeDay(withPlan) }
}
const keys = (date: string, ...ids: string[]): DragKey[] => ids.map((id) => ({ date, id }))
const whyOf = (j: { stayed: Array<{ id: string; why: string }> }) => Object.fromEntries(j.stayed.map((s) => [s.id, s.why]))

describe('D531 – przykład specyfikacji: bloki poniedziałku 9:00 i 10:00 przeciągnięte na środę 10:00', () => {
  it('środa 10:00 i 11:00, kolejne bloki środy rozsunięte; oba dni jedną zmianą – środa najpierw (T952)', () => {
    const mon = [flex('x', '09:00', 60), flex('y', '10:00', 60), flex('m', '13:00', 30)]
    const wed = [flex('w1', '10:30', 60), flex('w2', '11:30', 30), flex('w3', '15:00', 30)]
    const days = new Map([
      [MON, dayOf(scenario(mon, MON), '08:00')],
      [WED, dayOf(scenario(wed, WED), '08:00')]
    ])
    const raws = new Map<string, Raw | null>([
      [MON, fileOf(MON, mon)],
      [WED, fileOf(WED, wed)]
    ])
    // The grabbed block „x” (09:00) dropped on Wednesday 10:00: two days and an hour later.
    const j = judgeDrag(days, keys(MON, 'x', 'y'), { days: 2, minutes: 60 }, BEFORE)
    expect(j.take.map((m) => [m.id, m.to, m.startMin])).toEqual([
      ['x', WED, lm('10:00')],
      ['y', WED, lm('11:00')]
    ])
    expect(j.stayed).toEqual([])
    const d = draggedDays({ days, raws }, j, BEFORE)
    expect(d.moved).toEqual(['x', 'y'])
    const after = new Map(d.days.map((x) => [x.date, x]))
    expect(startsOf(after.get(WED)!.after, WED)).toEqual({ w1: lm('12:00'), w2: lm('13:00'), w3: lm('15:00'), x: lm('10:00'), y: lm('11:00') })
    expect(dayFileFrom(after.get(MON)!.after, MON).blocks.map((b) => b.id)).toEqual(['m'])
    expect(dayFileFrom(after.get(MON)!.after, MON).movedTo).toEqual({ x: WED, y: WED })
    // The target that takes the blocks is the owner; Monday lets them go after it, then Wednesday's pushed starts.
    expect(d.stages.map((s) => [s.date, s.owner])).toEqual([
      [WED, true],
      [MON, false],
      [WED, false]
    ])
    expect(d.links).toEqual([[MON, WED]])
  })
})

describe('D531 – co zostaje (D305) i dlaczego', () => {
  it('zaczęty zostaje i jest policzony („już trwa”), reszta jedzie', () => {
    const mon = [flex('x', '09:00', 60), flex('y', '10:30', 30)]
    const s = scenario(mon, MON).start('x', '09:00')
    const days = new Map([[MON, dayOf(s, '09:20')], [TUE, dayOf(scenario([], TUE), '08:00')]])
    const j = judgeDrag(days, keys(MON, 'x', 'y'), { days: 1, minutes: 0 }, MON)
    expect(j.take.map((m) => m.id)).toEqual(['y'])
    expect(whyOf(j)).toEqual({ x: 'już trwa' })
  })

  it('cel – dzień miniony: wszystkie zostają („dzień minął”); poza widokiem – „poza widokiem”', () => {
    const tue = [flex('x', '11:00', 60), flex('y', '12:00', 60)]
    const days = new Map([[TUE, dayOf(scenario(tue, TUE), '08:00')]])
    expect(whyOf(judgeDrag(days, keys(TUE, 'x', 'y'), { days: -1, minutes: 0 }, TUE))).toEqual({ x: 'dzień minął', y: 'dzień minął' })
    const j = judgeDrag(days, keys(TUE, 'x', 'y'), { days: 1, minutes: 0 }, MON, { inView: (d) => d <= TUE })
    expect(j.take).toEqual([])
    expect(whyOf(j)).toEqual({ x: 'poza widokiem', y: 'poza widokiem' })
  })

  it('poza dobę logiczną – „poza dniem” (inne jadą); sesja, wykład, zaparkowany – z powodem', () => {
    const tue = [
      flex('late', '23:00', 30),
      flex('ok', '11:00', 30),
      { ...flex('ses', '14:00', 60, { fixed: true }), origin: 'session' as const },
      { ...flex('lec', '16:00', 60, { fixed: true }), origin: 'lecture' as const },
      flex('park', '18:00', 30)
    ]
    const s = scenario(tue, TUE).raw({ k: 'block.park', block: 'park', at: scenario(tue, TUE).at('08:00'), rule: 'user' }, '08:00')
    const days = new Map([[TUE, dayOf(s, '08:10')]])
    const j = judgeDrag(days, keys(TUE, 'late', 'ok', 'ses', 'lec', 'park'), { days: 0, minutes: 6 * 60 }, MON)
    expect(j.take.map((m) => [m.id, m.startMin])).toEqual([['ok', lm('17:00')]])
    expect(whyOf(j)).toEqual({ late: 'poza dniem', ses: 'sesja', lec: 'wykład', park: 'zaparkowany' })
  })

  it('zakotwiczony idzie za kotwicą (D424): policzony jako przeniesiony, w pliku nadal zakotwiczony; do bloku, który zostaje – „zakotwiczony”', () => {
    const mon = [flex('x', '10:00', 60), flex('z', '10:00', 30, { startMin: null, anchor: 'x' }), flex('run', '08:30', 30), flex('q', '09:00', 30, { startMin: null, anchor: 'run' })]
    const s = scenario(mon, MON).start('run', '08:30')
    const days = new Map([[MON, dayOf(s, '08:40')], [TUE, dayOf(scenario([], TUE), '08:00')]])
    const raws = new Map<string, Raw | null>([[MON, fileOf(MON, mon)], [TUE, null]])
    const j = judgeDrag(days, keys(MON, 'x', 'z', 'q'), { days: 1, minutes: 30 }, MON)
    expect(j.take.map((m) => m.id)).toEqual(['x'])
    expect(j.along).toEqual([{ date: MON, id: 'z' }])
    expect(whyOf(j)).toEqual({ q: 'zakotwiczony' })
    const d = draggedDays({ days, raws }, j, MON)
    expect(d.moved).toEqual(['x', 'z'])
    const tue = dayFileFrom(d.days.find((x) => x.date === TUE)!.after, TUE).blocks
    expect(tue.map((b) => [b.id, b.startMin, b.anchor])).toEqual([
      ['x', lm('10:30'), null],
      ['z', null, 'x']
    ])
    // Within its day the anchored one follows by its anchor alone: nothing of its own is written.
    const w = judgeDrag(days, keys(MON, 'x', 'z'), { days: 0, minutes: 30 }, MON)
    expect(w.along).toEqual([{ date: MON, id: 'z' }])
    const within = draggedDays({ days, raws }, w, MON)
    expect(startsOf(within.days[0]!.after, MON)).toMatchObject({ x: lm('10:30'), z: null })
  })
})

describe('D531 – kilka dni naraz, jedna zmiana', () => {
  it('bloki poniedziałku i wtorku o dzień dalej: wtorek bierze z poniedziałku i oddaje do środy; najpierw wszystko, co przynosi', () => {
    const mon = [flex('a', '10:00', 60)]
    const tue = [flex('b', '10:00', 60), flex('t', '11:30', 30)]
    const wed = [flex('w', '10:30', 30)]
    const days = new Map([
      [MON, dayOf(scenario(mon, MON), '08:00')],
      [TUE, dayOf(scenario(tue, TUE), '08:00')],
      [WED, dayOf(scenario(wed, WED), '08:00')]
    ])
    const raws = new Map<string, Raw | null>([[MON, fileOf(MON, mon)], [TUE, fileOf(TUE, tue)], [WED, fileOf(WED, wed)]])
    const j = judgeDrag(days, [...keys(MON, 'a'), ...keys(TUE, 'b')], { days: 1, minutes: 0 }, BEFORE)
    const d = draggedDays({ days, raws }, j, BEFORE)
    const after = new Map(d.days.map((x) => [x.date, startsOf(x.after, x.date)]))
    expect(after.get(MON)).toEqual({})
    expect(after.get(TUE)).toEqual({ a: lm('10:00'), t: lm('11:30') })
    expect(after.get(WED)).toEqual({ b: lm('10:00'), w: lm('11:00') })
    // The owners (the halves that bring) first – no block ever on neither day.
    expect(d.stages.slice(0, 2).map((s) => [s.date, s.owner])).toEqual([
      [TUE, true],
      [WED, true]
    ])
    expect(d.stages.slice(2).every((s) => !s.owner)).toBe(true)
    expect(d.links).toEqual([[MON, TUE, WED]])
  })
})

describe('D531 – Ctrl: kopia całej grupy (D513 dla każdego)', () => {
  it('oryginały zostają, kopie o tę samą różnicę, kolejne elastyczne rozsunięte (oryginał nigdy nie jest przesuwany)', () => {
    const tue = [flex('x', '10:00', 60), flex('y', '11:00', 60), flex('n', '12:00', 30)]
    const days = new Map([[TUE, dayOf(scenario(tue, TUE), '08:00')]])
    const raws = new Map<string, Raw | null>([[TUE, fileOf(TUE, tue)]])
    const j = judgeDrag(days, keys(TUE, 'x', 'y'), { days: 0, minutes: 120 }, MON, { copy: true })
    let n = 0
    const d = draggedDays({ days, raws }, j, MON, { copy: (b, startMin) => ({ ...b, id: `c${++n}`, startMin, origin: 'user' }) })
    expect(d.copies.map((c) => [c.of.id, c.block.id, c.block.startMin])).toEqual([
      ['x', 'c1', lm('12:00')],
      ['y', 'c2', lm('13:00')]
    ])
    expect(startsOf(d.days[0]!.after, TUE)).toEqual({ x: lm('10:00'), y: lm('11:00'), n: lm('14:00'), c1: lm('12:00'), c2: lm('13:00') })
  })

  it('kopie zaznaczonej grupy równoległej (D492) zostają grupą: obok kopii jej pierwszego bloku (T1766)', () => {
    const tue = [flex('r', '10:00', 60), flex('s', '10:00', 30, { alongside: 'r' }), flex('n', '15:00', 30)]
    const days = new Map([[TUE, dayOf(scenario(tue, TUE), '08:00')]])
    const raws = new Map<string, Raw | null>([[TUE, fileOf(TUE, tue)]])
    const j = judgeDrag(days, keys(TUE, 'r', 's'), { days: 0, minutes: 120 }, MON, { copy: true })
    expect(j.take.map((m) => m.id)).toEqual(['r', 's'])
    let n = 0
    const d = draggedDays({ days, raws }, j, MON, { copy: (b, startMin) => ({ ...b, id: `c${++n}`, startMin, origin: 'user', alongside: null }) })
    const copies = dayFileFrom(d.days[0]!.after, TUE).blocks.filter((b) => b.id.startsWith('c'))
    expect(copies.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['c1', lm('12:00'), null],
      ['c2', lm('12:00'), 'c1']
    ])
    // The originals stay one group as they were.
    expect(dayFileFrom(d.days[0]!.after, TUE).blocks.find((b) => b.id === 's')!.alongside).toBe('r')
  })

  it('kopie części grupy równoległej bez jej pierwszego bloku: pierwsza z części jest pierwszym blokiem nowej grupy kopii (T1770)', () => {
    const tue = [flex('r', '10:00', 60), flex('m1', '10:00', 30, { alongside: 'r' }), flex('m2', '10:00', 30, { alongside: 'r' })]
    const days = new Map([[TUE, dayOf(scenario(tue, TUE), '08:00')]])
    const raws = new Map<string, Raw | null>([[TUE, fileOf(TUE, tue)]])
    const j = judgeDrag(days, keys(TUE, 'm1', 'm2'), { days: 0, minutes: 120 }, MON, { copy: true })
    let n = 0
    const d = draggedDays({ days, raws }, j, MON, { copy: (b, startMin) => ({ ...b, id: `c${++n}`, startMin, origin: 'user', alongside: null }) })
    const copies = dayFileFrom(d.days[0]!.after, TUE).blocks.filter((b) => b.id.startsWith('c'))
    expect(copies.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['c1', lm('12:00'), null],
      ['c2', lm('12:00'), 'c1']
    ])
  })

  it('kopia nie bierze zakotwiczonych – zostają („zakotwiczony”)', () => {
    const tue = [flex('x', '10:00', 60), flex('z', '10:00', 30, { startMin: null, anchor: 'x' })]
    const days = new Map([[TUE, dayOf(scenario(tue, TUE), '08:00')]])
    const j = judgeDrag(days, keys(TUE, 'x', 'z'), { days: 0, minutes: 60 }, MON, { copy: true })
    expect(j.take.map((m) => m.id)).toEqual(['x'])
    expect(whyOf(j)).toEqual({ z: 'zakotwiczony' })
  })
})

describe('D531 – podgląd: każdy na swoim nowym miejscu, to samo, co zapis', () => {
  it('w obrębie dnia: przeciągane i rozsunięte tam, gdzie stanie po upuszczeniu', () => {
    const tue = [flex('a', '10:00', 30), flex('b', '11:00', 30), flex('c', '11:45', 30)]
    const day = dayOf(scenario(tue, TUE), '08:00')
    const p = dragPreview(day, ['a', 'b'], 30, MON, { axis: 'plan' })!
    expect(Object.fromEntries([...p.moved].map(([id, s]) => [id, s.startMin]))).toEqual({ a: lm('10:30'), b: lm('11:30') })
    expect(Object.fromEntries([...p.pushed].map(([id, s]) => [id, s.startMin]))).toEqual({ c: lm('12:00') })
    expect(p.copies.size).toBe(0)
    const c = dragPreview(day, ['a', 'b'], 120, MON, { axis: 'plan', copy: true })!
    expect(Object.fromEntries([...c.copies].map(([id, s]) => [id, s.startMin]))).toEqual({ a: lm('12:00'), b: lm('13:00') })
    expect(c.moved.size).toBe(0)
    // Nothing to move – no preview.
    expect(dragPreview(day, ['a'], 0, MON, { axis: 'plan' })).not.toBeNull()
    expect(dragPreview(day, ['nic'], 30, MON, { axis: 'plan' })).toBeNull()
  })
})

describe('D367 – zawsze: zapisany start = pokazany start (ustalone ziarno)', () => {
  const rnd = (seed: number) => {
    let x = seed
    return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
  }
  /** A day of 4–7 flexible blocks from 09:00 (overlaps and gaps), two categories. */
  const planOf = (r: () => number, prefix: string): PlanBlock[] => {
    const plan: PlanBlock[] = []
    let t = lm('09:00')
    for (let i = 0, n = 4 + Math.floor(r() * 4); i < n; i++) {
      t += Math.floor(r() * 40) - 10
      const min = 15 + Math.floor(r() * 60)
      plan.push({ ...flex(`${prefix}${i}`, '09:00', min, { categoryId: r() < 0.5 ? 'inne' : 'analiza' }), startMin: t })
      t += min
    }
    return plan
  }

  it('na inny dzień: przeniesione o tę samą różnicę, każdy rozsunięty zapisany tam, gdzie go widać; w obrębie dnia – tak samo', () => {
    let pushed = 0
    for (let seed = 1; seed <= 60; seed++) {
      const r = rnd(seed)
      const mon = planOf(r, 'm')
      const tue = planOf(r, 't')
      const settings = { transitionBufferMin: 5 }
      const days = new Map([
        [MON, dayOf(scenario(mon, MON, settings), '08:00')],
        [TUE, dayOf(scenario(tue, TUE, settings), '08:00')]
      ])
      const raws = new Map<string, Raw | null>([[MON, fileOf(MON, mon)], [TUE, fileOf(TUE, tue)]])
      const picked = mon.filter(() => r() < 0.5).map((b) => b.id)
      if (!picked.length) picked.push(mon[0]!.id)
      const minutes = Math.floor(r() * 120) - 60
      for (const delta of [{ days: 1, minutes }, { days: 0, minutes: minutes || 5 }]) {
        const j = judgeDrag(days, keys(MON, ...picked), delta, BEFORE)
        const d = draggedDays({ days, raws }, j, BEFORE)
        const to = delta.days ? TUE : MON
        const day = d.days.find((x) => x.date === to)!
        const starts = startsOf(day.after, to)
        for (const m of j.take) expect(starts[m.id], `${seed} ${delta.days}: ${m.id}`).toBe(mon.find((b) => b.id === m.id)!.startMin! + delta.minutes)
        const there = days.get(to)!
        const shown = computeDay({ ...there.ctx, plan: dayPlan(there.ctx.snapshot, dayFileFrom(day.after, to)) })
        for (const p of day.pushed) expect(shown.forecast.find((x) => x.block.id === p.id)!.from, `${seed} ${delta.days}: ${p.id}`).toBe(idxOfLogical(shown.grid, p.startMin))
        // Every flexible block of the target shown later than before is written (none left at a place the forecast does not show).
        const taken = new Set(j.take.map((m) => m.id))
        for (const b of delta.days ? tue : mon.filter((x) => !taken.has(x.id))) {
          const was = there.state.forecast.find((x) => x.block.id === b.id)
          const now = shown.forecast.find((x) => x.block.id === b.id)
          if (was && now && now.from > was.from) expect(day.pushed.some((p) => p.id === b.id), `${seed} ${delta.days}: ${b.id} pokazany później, niezapisany`).toBe(true)
        }
        pushed += day.pushed.length
      }
    }
    expect(pushed).toBeGreaterThan(40)
  })
})
