/**
 * „Rozłóż w luki” (D624, N5): the sprawy put one by one, in the order given, into the first free gap of the day that holds the whole
 * estimate – first-fit, a sprawa that fits nowhere is counted and the next ones still try; starts on the grid of 5 min, not before now
 * (nor the wake), not past the maximum (nor the bedtime); a gap is a place of the day's foreground forecast as `freeStart` finds it, and a
 * sprawa stands in it only where the forecast shows it there and moves nothing else (no pushing apart, D367 does not act – the transition
 * buffer between categories counts).
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import { dayGaps, fillDayGaps, fillGaps, gapBounds, GAP_STEP_MIN, type GapCase } from '@shared/engine/gapFill'
import { idxOfLogical } from '@shared/engine/grid'
import { newUserBlock } from '@shared/engine/planEdit'
import { newId } from '@shared/model/ids'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import type { SettingsChange } from '@shared/model/settings'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-11-18'

/** The day at `now` with `plan` (buffer of transition 0 unless the settings say otherwise). */
function day(plan: PlanBlock[], now = '08:00', o: { settings?: Record<string, unknown>; events?: (s: Scenario) => Scenario } = {}) {
  const s = new Scenario({ date: DATE, plan, settings: o.settings ?? { transitionBufferMin: 0 } }).observe('07:00', null)
  o.events?.(s)
  const ctx = s.contextAt(s.at(now))
  return { ctx, state: computeDay(ctx) }
}

/** A task of `min` minutes in the category `cat` (as `caseBlock` makes it: a flexible block of yours). */
const task = (id: string, min: number, cat = 'inne'): GapCase => ({ id, block: (startMin) => newUserBlock(cat, startMin, min, undefined, { task: id }) })

const own = (id: string, at: string, min: number, cat = 'inne', more: Partial<Parameters<typeof block>[0]> = {}) => block({ id, cat, at, min, origin: 'user', ...more })

/** Two gaps: 10:00–10:30 (30 min) and 12:00–12:45 (45 min); the rest of the day to the maximum (19:00) is taken. */
const twoGaps = () => [own('a', '08:00', 120), own('b', '10:30', 90), own('c', '12:45', 375)]

const starts = (r: { placed: Array<{ id: string; startMin: number }> }) => r.placed.map((x) => [x.id, x.startMin])

/** The sprawa „t” of 30 min whose block has the id `blockId`. */
const withId = (blockId: string): GapCase => ({ id: 't', block: (startMin) => newUserBlock('inne', startMin, 30, undefined, { id: blockId, task: 't' }) })

describe('fillGaps – first-fit w lukach (czysta)', () => {
  it('przykład „Gotowe, gdy”: luki 30 i 45 min, sprawy 30, 45, 30 – dwie stoją, trzecia policzona', () => {
    const r = fillGaps(
      [
        { from: 0, to: 30 },
        { from: 100, to: 145 }
      ],
      [
        { id: 'x', lengthMin: 30 },
        { id: 'y', lengthMin: 45 },
        { id: 'z', lengthMin: 30 }
      ]
    )
    expect(r).toEqual({ placed: [{ id: 'x', start: 0 }, { id: 'y', start: 100 }], skipped: ['z'] })
  })

  it('większa pominięta, mniejsza za nią dalej szuka; luka kurczy się po postawieniu; start na siatce 5 min', () => {
    const r = fillGaps(
      [
        { from: 3, to: 40 },
        { from: 102, to: 130 }
      ],
      [
        { id: 'a', lengthMin: 20 },
        { id: 'big', lengthMin: 60 },
        { id: 'b', lengthMin: 12 },
        { id: 'c', lengthMin: 25 }
      ]
    )
    // a: 5–25 (3 → 5); big: nowhere; b: 25–37 in what is left of the first; c: the second, 105–130.
    expect(r).toEqual({ placed: [{ id: 'a', start: 5 }, { id: 'b', start: 25 }, { id: 'c', start: 105 }], skipped: ['big'] })
    expect(GAP_STEP_MIN).toBe(5)
  })

  it('bez spraw – nic; bez luk – każda policzona', () => {
    expect(fillGaps([{ from: 0, to: 60 }], [])).toEqual({ placed: [], skipped: [] })
    expect(fillGaps([], [{ id: 'a', lengthMin: 5 }])).toEqual({ placed: [], skipped: ['a'] })
  })

  it('próba odpowiada dniem: późniejszy start (bufor) – próba od niego na siatce; „nie” – następna luka', () => {
    const tried: Array<[string, number]> = []
    const r = fillGaps(
      [
        { from: 0, to: 30 },
        { from: 50, to: 90 }
      ],
      [{ id: 'a', lengthMin: 20 }],
      {
        tries: (item, start) => {
          tried.push([item.id, start])
          if (start === 0) return 3
          return start >= 50
        }
      }
    )
    expect(tried).toEqual([['a', 0], ['a', 5], ['a', 50]])
    expect(r.placed).toEqual([{ id: 'a', start: 50 }])
  })
})

describe('fillDayGaps – luki dnia z prognozy', () => {
  it('„Gotowe, gdy”: trzy sprawy w dwóch lukach – dwie stoją (10:00, 12:00), trzecia policzona', () => {
    const { ctx, state } = day(twoGaps())
    const r = fillDayGaps(ctx, state, [task('t1', 30), task('t2', 45), task('t3', 30)])
    expect(starts(r)).toEqual([
      ['t1', lm('10:00')],
      ['t2', lm('12:00')]
    ])
    expect(r.skipped).toEqual(['t3'])
  })

  it('first-fit: większa się nie mieści i jest pominięta, mniejsza za nią staje w dalszej luce', () => {
    const { ctx, state } = day(twoGaps())
    const r = fillDayGaps(ctx, state, [task('t1', 30), task('big', 60), task('t3', 15)])
    expect(starts(r)).toEqual([
      ['t1', lm('10:00')],
      ['t3', lm('12:00')]
    ])
    expect(r.skipped).toEqual(['big'])
  })

  it('nie przed teraz: luka już zaczęta liczy się od teraz zaokrąglonego w górę do 5 min (10:02 → 10:05)', () => {
    const plan = [own('a', '08:00', 120), own('f', '10:45', 60, 'analiza', { fixed: true }), own('c', '11:45', 435)]
    const { ctx, state } = day(plan, '10:02', { events: (s) => s.start('a', '08:00').end('a', '10:00') })
    expect(gapBounds(ctx, state).from).toBe(idxOfLogical(state.grid, lm('10:05')))
    // 45 min do not fit 10:05–10:45 any more; 40 min end at the fixed block's start.
    const r = fillDayGaps(ctx, state, [task('t1', 45), task('t2', 40)])
    expect(starts(r)).toEqual([['t2', lm('10:05')]])
    expect(r.skipped).toEqual(['t1'])
  })

  it('nie przed pobudką: przed pobudką dnia luka zaczyna się od pobudki', () => {
    const { ctx, state } = day([own('a', '07:00', 720)], '05:00')
    expect(gapBounds(ctx, state).from).toBe(idxOfLogical(state.grid, ctx.wakeMin))
  })

  it('granica dnia: nie za maksimum (19:00) – 120 min mieszczą się do 19:00, 150 min nie', () => {
    const { ctx, state } = day([own('a', '08:00', 540)])
    expect(gapBounds(ctx, state).to).toBe(state.boundary.max)
    const r = fillDayGaps(ctx, state, [task('long', 150), task('fits', 120)])
    expect(starts(r)).toEqual([['fits', lm('17:00')]])
    expect(r.skipped).toEqual(['long'])
  })

  it('granica dnia: maksimum po porze snu – luki kończą się na porze snu (22:00)', () => {
    const { ctx, state } = day([own('a', '08:00', 780)], '08:00', { settings: { transitionBufferMin: 0, dayTypes: { zwykly: { maxMin: lm('23:30') } } } })
    expect(state.boundary.max).toBe(idxOfLogical(state.grid, lm('23:30')))
    expect(gapBounds(ctx, state).to).toBe(idxOfLogical(state.grid, lm('22:00')))
    const r = fillDayGaps(ctx, state, [task('long', 90), task('fits', 60)])
    expect(starts(r)).toEqual([['fits', lm('21:00')]])
  })

  it('siatka 5 min: luka od 10:03 – starty 10:05, 10:30 (po 22 min), trzecia nie mieści się do 11:00', () => {
    const { ctx, state } = day([own('a', '08:00', 123), own('b', '11:00', 480)])
    const r = fillDayGaps(ctx, state, [task('t1', 22), task('t2', 22), task('t3', 10)])
    expect(starts(r)).toEqual([
      ['t1', lm('10:05')],
      ['t2', lm('10:30')]
    ])
    expect(r.skipped).toEqual(['t3'])
  })

  it('bez rozsuwania: bufor przejścia między kategoriami się liczy – 30 min nie mieszczą się w luce 30 min, 20 min stają od 10:05', () => {
    const plan = [own('a', '08:00', 120, 'analiza'), own('b', '10:30', 510, 'analiza')]
    const { ctx, state } = day(plan, '08:00', { settings: {} })
    expect(fillDayGaps(ctx, state, [task('t30', 30)])).toEqual({ placed: [], skipped: ['t30'] })
    expect(starts(fillDayGaps(ctx, state, [task('t20', 20)]))).toEqual([['t20', lm('10:05')]])
  })

  it('bez rozsuwania: sprawa, po której blok elastyczny pokazałby się później, nie staje w tej luce', () => {
    // Same category as the block before (no buffer at its start), another than the block after: 30 min would move „b” by 5 min.
    const plan = [own('a', '08:00', 120), own('b', '10:30', 510, 'analiza')]
    const { ctx, state } = day(plan, '08:00', { settings: {} })
    expect(fillDayGaps(ctx, state, [task('t30', 30)]).skipped).toEqual(['t30'])
    expect(starts(fillDayGaps(ctx, state, [task('t25', 25)]))).toEqual([['t25', lm('10:00')]])
  })

  it('blok w tle nie zajmuje luki (jak „następne wolne miejsce”); bez spraw – nic', () => {
    const plan = [own('a', '08:00', 120), own('rec', '10:00', 30, 'inne', { bg: true }), own('c', '10:30', 510)]
    const { ctx, state } = day(plan)
    expect(dayGaps(state.forecast, gapBounds(ctx, state).from, gapBounds(ctx, state).to)).toEqual([{ from: idxOfLogical(state.grid, lm('10:00')), to: idxOfLogical(state.grid, lm('10:30')) }])
    expect(starts(fillDayGaps(ctx, state, [task('t', 30)]))).toEqual([['t', lm('10:00')]])
    expect(fillDayGaps(ctx, state, [])).toEqual({ placed: [], skipped: [] })
  })

  it('sprawa kategorii zaczynanej w tle (prognoza jej nie stawia) staje na początku pierwszej luki, która mieści jej szacunek, i nie zmniejsza jej – zwykła 30 min staje w tej samej luce 10:00–10:30', () => {
    const { ctx, state } = day(twoGaps())
    const r = fillDayGaps(ctx, state, [task('rec', 30, 'wyklad'), task('t', 30)])
    expect(starts(r)).toEqual([
      ['rec', lm('10:00')],
      ['t', lm('10:00')]
    ])
    expect(fillGaps([{ from: 0, to: 30 }], [{ id: 'bg', lengthMin: 30 }, { id: 'x', lengthMin: 30 }], { tries: (item) => (item.id === 'bg' ? 'aside' : true) }).placed).toEqual([
      { id: 'bg', start: 0 },
      { id: 'x', start: 0 }
    ])
  })

  it('wynik to ten sam blok, który próbowano (jego id idzie do zapisu); dzień z tym blokiem nic nie przesuwa', () => {
    const plan = twoGaps()
    const { ctx, state } = day(plan)
    const r = fillDayGaps(ctx, state, [withId('a0')])
    expect(r.placed.map((x) => [x.id, x.startMin, x.block.id, x.block.startMin])).toEqual([['t', lm('10:00'), 'a0', lm('10:00')]])
    const before = state.forecast.map((p) => [p.block.id, p.from, p.to])
    expect(day([...plan, r.placed[0]!.block]).state.forecast.filter((p) => p.block.id !== 'a0').map((p) => [p.block.id, p.from, p.to])).toEqual(before)
  })

  it('remis startu z blokiem elastycznym pokazanym później (przeskoczył za stały): start nie jest próbowany, tylko następny punkt siatki – wynik nie zależy od id (tu: pominięta)', () => {
    // „m” planned at 10:00 jumps behind the fixed „fx” (10:30–11:00) to 11:00: the gap 10:00–10:30 is free, but at 10:00 the forecast would
    // order the sprawa and „m” by their ids; from 10:05 „m” goes first and the sprawa after it – the gap does not hold it.
    const plan = [own('a', '08:00', 120), own('m', '10:00', 60), own('fx', '10:30', 30, 'inne', { fixed: true }), own('c', '12:00', 420)]
    const { ctx, state } = day(plan)
    for (const id of ['a0', 'zz', ...Array.from({ length: 24 }, () => newId())]) expect(fillDayGaps(ctx, state, [withId(id)])).toMatchObject({ placed: [], skipped: ['t'] })
    // Without the tie (the block of „m” at 10:05 – the forecast orders by the start): the sprawa stands at 10:00 before it.
    const apart = [own('a', '08:00', 120), own('m', '10:05', 60), own('fx', '10:30', 30, 'inne', { fixed: true }), own('c', '12:00', 420)]
    const d = day(apart)
    expect(starts(fillDayGaps(d.ctx, d.state, [withId('zz')]))).toEqual([['t', lm('10:00')]])
  })

  it('blok sprawy zaparkowany przed startem (10:00–10:30) – nie należy do łańcucha prognozy: sprawa wraca i staje o 10:00, luka mieści ją dokładnie', () => {
    const plan = [own('a', '08:00', 120), { ...own('old', '10:00', 30), task: 't' }, own('c', '10:30', 510)]
    const { ctx, state } = day(plan, '09:30', { events: (s) => s.start('a', '08:00').raw({ k: 'block.park', block: 'old', at: s.at('09:00'), rule: 'exchange' }, '09:00') })
    expect(starts(fillDayGaps(ctx, state, [withId('nowy')]))).toEqual([['t', lm('10:00')]])
  })
})

describe('fillDayGaps – bufory dekompresji (N7)', () => {
  /** A Saturday (weekend: maximum 16:00) with the buffers of decompression on and no transition buffer; `plan` – the day's file. */
  function bufferDay(plan: PlanBlock[]) {
    const date = '2026-10-31'
    const s = new Scenario({ date, dayType: 'weekend', plan })
    const changes: SettingsChange[] = [{ id: 'c1', from: date, at: null, made: 1, patch: { decompress: { on: true }, transitionBufferMin: 0 } }]
    const inputs: PlanInputs = { changes, templates: [], lectures: [], series: [], routines: [] }
    const fileOf = (blocks: PlanBlock[]): DayFile => ({ ...dayFileFrom({}, date), dayType: 'weekend', blocks })
    const dayWith = (blocks: PlanBlock[]) => {
      const ctx = dayContextOf(inputs, { date, events: [], dayFile: fileOf(blocks), nextFile: null }, marketDay, s.at('08:00'))
      return { ctx, state: computeDay(ctx) }
    }
    return { ...dayWith(plan), laying: { changes, file: fileOf(plan) }, dayWith }
  }
  const heavy = (id: string, min: number): GapCase => ({ id, block: (startMin) => newUserBlock('analiza', startMin, min, undefined, { task: id }) })
  const shownOf = (d: { state: { forecast: ReadonlyArray<{ block: { id: string }; from: number; to: number }> } }, ids: string[]) => d.state.forecast.filter((p) => ids.includes(p.block.id)).map((p) => [p.block.id, p.from, p.to])

  it('ciężka sprawa 60 min w luce 60 min przed elastycznym X – jej bufor przesunąłby X: pominięta; lekka staje; po zapisie X stoi', () => {
    const plan = [own('a', '08:00', 120), own('x', '11:00', 300)]
    const d = bufferDay(plan)
    expect(fillDayGaps(d.ctx, d.state, [heavy('h', 60)], d.laying)).toMatchObject({ placed: [], skipped: ['h'] })
    const r = fillDayGaps(d.ctx, d.state, [task('l', 60)], d.laying)
    expect(starts(r)).toEqual([['l', lm('10:00')]])
    expect(shownOf(d.dayWith([...plan, r.placed[0]!.block]), ['a', 'x'])).toEqual(shownOf(d, ['a', 'x']))
  })

  it('bufor sprawy zabiera lukę razem z nią: ciężka 45 min o 10:00, lekka 30 min dopiero za jej buforem; po zapisie nic się nie rusza', () => {
    const plan = [own('a', '08:00', 120), own('x', '11:30', 270)]
    const d = bufferDay(plan)
    const r = fillDayGaps(d.ctx, d.state, [heavy('h', 45), task('l', 30)], d.laying)
    expect(r.placed.map((x) => x.id)).toEqual(['h', 'l'])
    expect(r.placed[0]!.startMin).toBe(lm('10:00'))
    const after = d.dayWith([...plan, ...r.placed.map((x) => x.block)])
    const buffer = after.ctx.plan.find((b) => b.origin === ('decompress' as PlanBlock['origin']) && b.sourceId === r.placed[0]!.block.id)!
    expect(buffer.durationMin).toBeGreaterThan(0)
    // The light one right after the buffer (not at 10:45, where the buffer stands), as the day written lays it.
    expect(r.placed[1]!.startMin).toBe(lm('10:45') + buffer.durationMin)
    expect(after.ctx.plan.find((b) => b.id === r.placed[1]!.block.id)?.startMin).toBe(r.placed[1]!.startMin)
    expect(shownOf(after, ['a', 'x'])).toEqual(shownOf(d, ['a', 'x']))
  })
})
