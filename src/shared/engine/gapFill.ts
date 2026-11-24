/**
 * „Rozłóż w luki” (D624, N5): the sprawy not planned yet put into the free gaps of a day, one by one in the order given (the list's), each
 * into the first gap – from the earliest – that holds its whole estimate (first-fit; the gap shrinks behind it). A sprawa that fits nowhere
 * is left out and counted; the next ones still try. Starts on the grid of 5 min, never before now (nor the day's wake), never past the
 * day's maximum (nor the bedtime). A gap is a free place of the day's foreground forecast – the one „następne wolne miejsce” finds
 * (`freeStart`: blocks in the background take none, cancelled and parked ones are not in the forecast) – and a sprawa stands in it only
 * where the forecast then shows it, with nothing else moved: no pushing apart (D367 does not act here), so the transition buffer between
 * categories and the rules of the forecast (a flexible block after a later one, a fixed block it would hit) decide; with the buffers of
 * decompression on, each plan tried has its buffers laid again (`replanned`) – a sprawa's own buffer takes its place in the gap too. Pure.
 */
import { PLAN_MIN, type DayFile, type PlanBlock } from '../model/plan'
import type { SettingsChange } from '../model/settings'
import { logicalMinuteOf } from '../time/day'
import { blockInfos } from './blocks'
import { replanned } from './context'
import { routineCostsIn, settingsAtMinute, shownWholeForecaster, type DayContext, type DayState } from './day'
import type { Placed } from './forecast'
import { atOf, idxOfLogical } from './grid'
import { ownMinuteIdx } from './pushApart'

/** A free span [from, to) – indices of the day's grid in `fillDayGaps`, any minutes in `fillGaps`. */
export interface Gap {
  from: number
  to: number
}

/** What is put into the gaps: an id and how long it is. */
export interface GapItem {
  id: string
  lengthMin: number
}

/** The grid of the starts (D624: as a block dragged on the axis). */
export const GAP_STEP_MIN = 5

/** `x` rounded up to the grid. */
const onStep = (x: number, step: number): number => Math.ceil(x / step) * step

/**
 * A try of `item` at `start` in `gap`, answered by the day: `true` – it stands there (taken: the next tries see it), `{ until }` – it stands
 * there and takes the gap to `until` (its buffer of decompression after it), `'aside'` – it stands there and takes nothing of the gap (a
 * block in the background), a later start – it would be shown there instead (a buffer): tried again from it, on the grid; `false` – this
 * gap does not take it.
 */
export type GapTry = (item: GapItem, start: number, gap: Gap) => boolean | number | 'aside' | { until: number }

export interface GapFill {
  /** In the order of the items. */
  placed: Array<{ id: string; start: number }>
  /** The items that fit in no gap, in their order. */
  skipped: string[]
}

/**
 * First-fit (D624): each item, in order, into the first gap whose start on the grid (`step`) and the item's length end no later than the
 * gap does; the gap then starts at the item's end. `tries` – the day's answer for each such start (none: every one stands).
 */
export function fillGaps(gaps: readonly Gap[], items: readonly GapItem[], o: { step?: number; tries?: GapTry } = {}): GapFill {
  const step = o.step ?? GAP_STEP_MIN
  const free = gaps
    .filter((g) => g.to > g.from)
    .map((g) => ({ ...g }))
    .sort((a, b) => a.from - b.from)
  const placed: GapFill['placed'] = []
  const skipped: string[] = []
  for (const item of items) {
    let start: number | null = null
    for (const g of free) {
      let at = onStep(g.from, step)
      let until: number | null = null
      while (at + item.lengthMin <= g.to) {
        const answer = o.tries ? o.tries(item, at, g) : true
        if (answer === true || answer === 'aside' || typeof answer === 'object') {
          start = at
          until = answer === 'aside' ? null : typeof answer === 'object' ? Math.max(answer.until, at + item.lengthMin) : at + item.lengthMin
          break
        }
        // A start the day cannot take, or one no later than this one (it would try forever): the next gap.
        if (answer === false || answer <= at) break
        at = onStep(answer, step)
      }
      if (start != null) {
        if (until != null) g.from = until
        break
      }
    }
    if (start == null) skipped.push(item.id)
    else placed.push({ id: item.id, start })
  }
  return { placed, skipped }
}

/**
 * The free gaps of the foreground of `forecast` between the indices `from` and `to`, in order – the places `freeStart` looks through (a
 * block in the background takes none).
 */
export function dayGaps(forecast: readonly Placed[], from: number, to: number): Gap[] {
  const fg = forecast.filter((p) => !p.bg).sort((a, b) => a.from - b.from)
  const out: Gap[] = []
  let at = from
  for (const p of fg) {
    if (at >= to) break
    if (p.to <= at) continue
    if (p.from > at) out.push({ from: at, to: Math.min(p.from, to) })
    at = Math.max(at, p.to)
  }
  if (at < to) out.push({ from: at, to })
  return out
}

/**
 * Where the gaps of the day are looked for (indices, D624): from now – the minute now rounded up to the grid – and not before the day's
 * wake; to the day's maximum as it is in force (`boundary.max`: with a session, a lecture or an exception that moved it), not past the
 * bedtime of the forecast nor the day's end.
 */
export function gapBounds(ctx: Pick<DayContext, 'wakeMin'>, state: Pick<DayState, 'now' | 'grid' | 'boundary' | 'bedtime'>): Gap {
  const g = state.grid
  return {
    from: onStep(Math.max(state.now, idxOfLogical(g, ctx.wakeMin)), GAP_STEP_MIN),
    to: Math.min(state.boundary.max, state.bedtime.forecast, g.length)
  }
}

/** A sprawa to put into the day: its id and the block it makes at a start (a logical minute) – `caseBlock`. */
export interface GapCase {
  id: string
  block: (startMin: number) => PlanBlock
}

export interface DayGapFill {
  /**
   * The sprawy that stand, with their starts (logical minutes), in their order, each with the very block tried there – the one to write (its
   * id orders it among blocks of an equal start in the forecast: another id could stand elsewhere).
   */
  placed: Array<{ id: string; startMin: number; block: PlanBlock }>
  /** The sprawy that fit in no gap of the day. */
  skipped: string[]
}

/**
 * The forecast's chain orders `id` among other blocks by their ids – another block has the same key and rank (`Forecast.chainOrder`: the
 * one rule of the forecast; a block begun, parked or cancelled is no part of it).
 */
function tiedById(order: ReadonlyMap<string, { key: number; rank: number }>, id: string): boolean {
  const mine = order.get(id)
  if (!mine) return false
  for (const [other, o] of order) if (other !== id && o.key === mine.key && o.rank === mine.rank) return true
  return false
}

/** Every block of `before` is where it was in `after`, and `after` has only the blocks `added` more (the sprawa's and its buffer). */
function unmoved(before: readonly Placed[], after: readonly Placed[], added: ReadonlySet<string>): boolean {
  if (after.length !== before.length + after.filter((p) => added.has(p.block.id)).length) return false
  const was = new Map(before.map((p) => [p.block.id, p]))
  return after.every((p) => {
    if (added.has(p.block.id)) return true
    const q = was.get(p.block.id)
    return q != null && q.from === p.from && q.to === p.to && q.bg === p.bg
  })
}

/** What the day's plan is laid with (the buffers of decompression – `replanned`): the settings' changes and the day's file (its cancelled ones). */
export interface GapLaying {
  changes: readonly SettingsChange[]
  file: DayFile | null
}

/**
 * „Rozłóż w luki” on the day of `ctx` / `state` (D624): `cases` in their order into the gaps of the day's forecast (`gapBounds`,
 * `dayGaps`), first-fit (`fillGaps`). A sprawa stands at a start only where the forecast with it (and with the ones put before it) shows
 * it at that start and shows every other block where it was – a later start the forecast gives it (the transition buffer) is tried
 * next, a block it would move leaves this gap to the next one; a start equal to the planned start of another flexible block is not tried
 * (the forecast would order the two by their ids – the result must not depend on a random one), the next point of the grid is. `laying`
 * given: each plan tried is the day's plan without its buffers, the sprawy put and the one tried, with the buffers laid again (`replanned`)
 * – a sprawa whose buffer would move a block does not stand there, and its buffer takes the gap with it. Nothing is pushed apart; the
 * caller writes the blocks returned, as they are.
 */
export function fillDayGaps(ctx: DayContext, state: DayState, cases: readonly GapCase[], laying?: GapLaying): DayGapFill {
  if (!cases.length) return { placed: [], skipped: [] }
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  const typeAt = (k: number) => settingsAtMinute(ctx.snapshot, state.facts, k).dayType
  const infosOf = (plan: readonly PlanBlock[]) => blockInfos(g, plan, state.facts, ctx.snapshot.settings, routineCostsIn(ctx), typeAt)
  const forecastOf = shownWholeForecaster(ctx, state)
  const base = ctx.basePlan ?? ctx.plan
  const put: PlanBlock[] = []
  const planWith = (more: readonly PlanBlock[]): readonly PlanBlock[] => (laying ? replanned(ctx, [...base, ...put, ...more], laying.changes, laying.file) : [...ctx.plan, ...put, ...more])
  let plan = planWith([])
  let shown = forecastOf(infosOf(plan)).placed
  const bounds = gapBounds(ctx, state)
  const byId = new Map(cases.map((c) => [c.id, c]))
  const taken = new Map<string, PlanBlock>()
  const items = cases.map((c) => ({ id: c.id, lengthMin: c.block(PLAN_MIN).durationMin }))
  const fill = fillGaps(dayGaps(shown, bounds.from, bounds.to), items, {
    tries: (item, start) => {
      // A start the plan can hold (a 25-hour day: the second 02:xx has no minute of its own).
      const own = ownMinuteIdx(g, start)
      if (own !== start) return own > start ? own : false
      const b = byId.get(item.id)!.block(lm(start))
      const withIt = planWith([b])
      const infos = infosOf(withIt)
      const whole = forecastOf(infos)
      // A start where the forecast's chain orders the sprawa and another block by their ids (a flexible block planned there, shown later –
      // behind a fixed one): a random id would decide – never tried; the next point of the grid is (T2900).
      if (tiedById(whole.chainOrder(), b.id)) return start + 1
      const after = whole.placed
      const p = after.find((x) => x.block.id === b.id)
      // The blocks the try adds: the sprawa's and its buffer of decompression (laid by `replanned`).
      const was = new Set(plan.map((x) => x.id))
      const added = new Set(withIt.filter((x) => !was.has(x.id)).map((x) => x.id))
      // A block in the background (its category starts there) the forecast does not place: it takes no foreground – it stands at its start,
      // and the gap stays whole for the next ones.
      const aside = !p
      if (aside) {
        if (!infos.find((x) => x.id === b.id)?.bg || !unmoved(shown, after, added)) return false
      } else {
        if (p.from > start) return p.from
        if (p.from < start || !unmoved(shown, after, added)) return false
      }
      put.push(b)
      plan = withIt
      shown = after
      taken.set(item.id, b)
      if (aside) return 'aside'
      const until = Math.max(...after.filter((x) => added.has(x.block.id) && !x.bg).map((x) => x.to))
      return until > start + item.lengthMin ? { until } : true
    }
  })
  return { placed: fill.placed.map((x) => ({ id: x.id, startMin: lm(x.start), block: taken.get(x.id)! })), skipped: fill.skipped }
}
