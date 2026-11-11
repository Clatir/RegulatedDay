/**
 * „Ułóż pod energię” (D369, D374, FBL2c): a variant of today's plan that only changes the order of flexible blocks – each
 * within its own gap between fixed blocks – when the new order clearly raises the lowest energy of the day (the lowest of
 * the three pools from now to the bedtime's forecast, the energy's forecast): „Ułóż pod energię – najniższa energia dnia
 * 35 → 52”, with the changes of order. Fixed blocks and those waiting for „Zacznij” split the day into gaps; protected,
 * begun, anchored and background blocks, those without an hour of their own and those another block is anchored to stay
 * where the forecast shows them (a moved block may pass them inside its gap, never push them). Pure and deterministic.
 *
 * The search (T608, T609): in each gap every order of its blocks (up to `ORDER_EXACT_MAX` – 720 orders; a larger gap up
 * to `ORDER_MAX_BLOCKS` by swaps of two, best swap first) is laid out as the forecast lays it (`shownForecaster`) and
 * judged by an estimate of the energy over the gap (the costs of the blocks, the free time, the switches; the rest of the
 * day shifted by the change at the gap's end). The best gap alone, and every gap with a gain together, are then judged by
 * counting the day and its energy again (`ORDER_COUNTS` counts at most, D340): the variant is the count with the higher
 * lowest energy that raises it by `ENERGY_ORDER_GAIN` at least (as shown, whole) and neither adds an extension nor takes
 * the end of work past the boundary.
 */
import { logicalClock } from '../format'
import { POOLS, costsOf, type Costs, type Pool } from '../model/categories'
import { PLAN_MAX } from '../model/plan'
import { logicalMinuteOf } from '../time/day'
import type { BlockInfo } from './blocks'
import { settingsAtMinute, shownForecaster, type DayContext, type DayState } from './day'
import { computeEnergy, regenVariant, shownOf, toUnits, type EnergyState } from './energy'
import type { Placed } from './forecast'
import { atOf, idxOfLogical } from './grid'
import { pushable } from './pushApart'
import { judgeDay, planWith, type Variant, type VariantChange } from './variants'

/** The least rise of the lowest energy of the day (whole points, as shown) that is „clear” (T608): the reserve's hysteresis. */
export const ENERGY_ORDER_GAIN = 5
/** A gap of up to this many blocks is searched in every order (6! = 720 layouts of the forecast). */
export const ORDER_EXACT_MAX = 6
/** A gap of more blocks is left as it is; up to it, larger than `ORDER_EXACT_MAX`, it is searched by swaps of two. */
export const ORDER_MAX_BLOCKS = 12
/** The days (and their energy) counted again at most: the best gap alone, every gap with a gain together. */
export const ORDER_COUNTS = 2

/** The units of energy (1/2000 of a point, as `computeEnergy` keeps them). */
const UNIT = toUnits(1)
const FULL = 100 * UNIT
/** The cost of a switch into work (head) and of the contact of a request (emotions), as in `energy.ts`. */
const SWITCH = 2 * UNIT
const CONTACT = 2 * UNIT
/** A stretch without a block this long between blocks is regeneration (as in `day.ts`). */
const FREE_REST_MIN = 30

type PoolUnits = Record<Pool, number>
const pools = <T>(f: (p: Pool) => T): Record<Pool, T> => ({ head: f('head'), emotions: f('emotions'), senses: f('senses') })
const clamp = (v: number) => Math.max(0, Math.min(FULL, v))
const byFrom = (a: Placed, b: Placed) => a.from - b.from || (a.block.id < b.block.id ? -1 : 1)

/** A gap between fixed blocks: its foreground blocks in the forecast's order and which of them may move. */
interface Gap {
  index: number
  /** The end of the fixed block before it and the start of the one after it (indexes; ±∞ at the day's ends). */
  lower: number
  upper: number
  items: Placed[]
  /** The places in `items` of the blocks that may move, in order. */
  slots: number[]
  /** The planned free time before each slot (0 – it follows the block before it). */
  breaks: number[]
  /** The block before the first slot in the foreground (its category makes a switch). */
  before: Placed | null
}

/** A gap's best order: the new starts (index) of its blocks and the estimated lowest energy (units). */
interface GapPick {
  gap: Gap
  starts: Map<string, number>
  placed: Map<string, Placed>
  score: number
  base: number
}

/** The lowest energy of the day from now (units): the lowest of the pools in the energy's forecast; null – unknown. */
export function lowestEnergy(e: EnergyState | null): number | null {
  if (!e?.known || !e.enabled || !e.forecast) return null
  return Math.min(...POOLS.map((p) => toUnits(e.forecast!.min[p])))
}

/**
 * The variant „Ułóż pod energię” for today's plan (null: the energy is unknown or off, no gap has two blocks that may
 * move, or no order raises the lowest energy clearly). `names` – the blocks' names for the list of changes.
 */
export function energyOrderVariant(ctx: DayContext, state: DayState, energy: EnergyState | null, names: (b: BlockInfo) => string): Variant | null {
  const low0 = lowestEnergy(energy)
  if (low0 == null || !energy) return null
  const g = state.grid
  const now = state.now
  const until = Math.min(g.length, Math.max(now, state.bedtime.forecast))
  const forecastOf = shownForecaster(ctx, state)
  const identity = forecastOf(state.blocks)
  const idById = new Map(identity.map((p) => [p.block.id, p]))
  const buffer = settingsAtMinute(ctx.snapshot, state.facts, now + 1).settings.transitionBufferMin
  const buf = (prev: string | null, cat: string) => (prev != null && prev !== cat ? buffer : 0)
  const lm = (idx: number) => logicalMinuteOf(g.date, atOf(g, idx))
  // A start the plan can hold: a minute with a number of its own on the clock, not past 03:59.
  const holds = (idx: number) => lm(idx) <= PLAN_MAX && idxOfLogical(g, lm(idx)) === idx

  const gaps = gapsOf(state, identity, buf)
  if (!gaps.length) return null

  // The energy as known: the series in units (from now on the forecast), the rest of the day by pools.
  const series = pools((p) => energy.series[p])
  const at = (p: Pool, k: number) => toUnits(series[p][Math.min(k, g.length)]!)
  const minOver = (p: Pool, from: number, to: number) => {
    let v = Number.POSITIVE_INFINITY
    for (let k = Math.max(from, now); k <= Math.min(to, until); k++) v = Math.min(v, at(p, k))
    return v
  }
  const settings = state.settings
  const costs = (b: BlockInfo): Costs => b.costs ?? costsOf(settings.categories[b.categoryId] ?? b.rules, b.variantId)
  const free = regenVariant(settings, 'gra')
  const workEnd = state.lastWorkForecast
  const charge = (b: BlockInfo, prevCat: string | null): PoolUnits => ({
    head: prevCat != null && prevCat !== b.categoryId && b.rules.kind !== 'request' && (b.rules.cls === 'work' || b.rules.kind === 'project') ? SWITCH : 0,
    emotions: b.rules.kind === 'request' ? CONTACT : 0,
    senses: 0
  })

  /**
   * The estimate of a gap laid out as `placed` (T609): from its first slot to its end (the next fixed block, at most the
   * bedtime's forecast) – the blocks' costs, free time as regeneration when ≥ 30 min or after the end of work, the switch
   * into work of another category and the contact of a request at a block's start, kept within 0–100. The lowest state
   * on the way and the state at the end.
   */
  const simulate = (gap: Gap, placed: ReadonlyMap<string, Placed>, r0: number, r1: number, start: PoolUnits): { low: PoolUnits; end: PoolUnits } => {
    const list = gap.items.map((it) => placed.get(it.block.id) ?? it).filter((p) => p.from >= r0 && p.from < r1).sort(byFrom)
    const cur = { ...start }
    const low = { ...start }
    const step = (c: Costs, minutes: number) => {
      for (const p of POOLS) {
        cur[p] = clamp(cur[p] - c[p] * 100 * minutes)
        low[p] = Math.min(low[p], cur[p])
      }
    }
    const idle = (from: number, to: number) => {
      if (to > from && (to - from >= FREE_REST_MIN || (workEnd != null && from >= workEnd))) step(free, to - from)
    }
    let t = r0
    let cat = gap.before?.block.categoryId ?? null
    for (const p of list) {
      const a = Math.max(p.from, t)
      const b = Math.min(p.to, r1)
      idle(t, a)
      const ch = charge(p.block, cat)
      for (const q of POOLS) {
        cur[q] = clamp(cur[q] - ch[q])
        low[q] = Math.min(low[q], cur[q])
      }
      if (b > a) step(costs(p.block), b - a)
      t = Math.max(t, b)
      cat = p.block.categoryId
    }
    idle(t, r1)
    return { low, end: cur }
  }

  /** The new starts of the gap's blocks in `order` (slot k gets the block of slot order[k]); empty – the order is as it is. */
  const startsFor = (gap: Gap, order: readonly number[]): Map<string, number> => {
    const out = new Map<string, number>()
    const k0 = order.findIndex((c, k) => c !== k)
    if (k0 < 0) return out
    const pos0 = gap.slots[k0]!
    let prevEnd: number | null = pos0 > 0 ? gap.items[pos0 - 1]!.to : null
    let prevCat: string | null = pos0 > 0 ? gap.items[pos0 - 1]!.block.categoryId : null
    let k = k0
    for (let pos = pos0; pos < gap.items.length; pos++) {
      const it = gap.items[pos]!
      if (gap.slots[k] !== pos) {
        prevEnd = Math.max(prevEnd ?? it.to, it.to)
        prevCat = it.block.categoryId
        continue
      }
      const b = gap.items[gap.slots[order[k]!]!]!.block
      const start = prevEnd == null ? it.from : prevEnd + Math.max(buf(prevCat, b.categoryId), gap.breaks[k]!)
      out.set(b.id, start)
      prevEnd = start + b.durationMin
      prevCat = b.categoryId
      k++
    }
    return out
  }

  /**
   * The day's forecast with the new starts, when it lays them out as asked: each moved block at its start, within its gap,
   * at a minute the plan can hold; every other block as before. Null – the order does not fit (it would push a block that
   * stays, go behind the fixed block, or past 03:59).
   */
  const layout = (starts: ReadonlyMap<string, number>, gapsOfStarts: readonly Gap[]): Map<string, Placed> | null => {
    for (const s of starts.values()) if (!holds(s)) return null
    const placed = forecastOf(state.blocks.map((b) => (starts.has(b.id) ? { ...b, start: starts.get(b.id)! } : b)))
    const map = new Map(placed.map((p) => [p.block.id, p]))
    for (const p of identity) {
      if (starts.has(p.block.id)) continue
      const q = map.get(p.block.id)
      if (!q || q.from !== p.from || q.to !== p.to || q.bg !== p.bg) return null
    }
    if (map.size !== idById.size) return null
    for (const gap of gapsOfStarts)
      for (const s of gap.slots) {
        const id = gap.items[s]!.block.id
        const q = map.get(id)
        if (!q || q.bg || q.from < gap.lower || q.to > gap.upper || (starts.has(id) && q.from !== starts.get(id))) return null
      }
    return map
  }

  /** The best order of a gap by the estimate (null: none better than the gap as it is). */
  const pickGap = (gap: Gap): GapPick | null => {
    const r0 = gap.items[gap.slots[0]!]!.from
    const r1 = Math.min(gap.upper, until)
    if (r1 <= r0) return null
    const first = gap.items[gap.slots[0]!]!.block
    const ch0 = charge(first, gap.before?.block.categoryId ?? null)
    // The state at the gap's first slot before that block's own switch (the series has it in that minute).
    const start = pools((p) => clamp(at(p, r0) + ch0[p]))
    const lowBefore = pools((p) => (r0 > now ? minOver(p, now, r0 - 1) : Number.POSITIVE_INFINITY))
    const lowWithin = pools((p) => minOver(p, r0, r1 - 1))
    const lowAfter = pools((p) => (r1 <= until ? minOver(p, r1, until) : Number.POSITIVE_INFINITY))
    const base = simulate(gap, idById, r0, r1, start)
    const scoreOf = (placed: ReadonlyMap<string, Placed>) => {
      const s = simulate(gap, placed, r0, r1, start)
      return Math.min(...POOLS.map((p) => clamp(Math.min(lowBefore[p], lowWithin[p] + s.low[p] - base.low[p], lowAfter[p] + s.end[p] - base.end[p]))))
    }
    const baseScore = scoreOf(idById)
    const n = gap.slots.length
    const moved = (starts: ReadonlyMap<string, number>) => [...starts].filter(([id, s]) => idById.get(id)!.from !== s).length
    // The best so far (a holder: the closure below sets it) and how many blocks it moves.
    const top: { pick: GapPick | null; moved: number } = { pick: null, moved: 0 }
    const consider = (order: readonly number[]): number | null => {
      const starts = startsFor(gap, order)
      if (!starts.size) return baseScore
      const placed = layout(starts, [gap])
      if (!placed) return null
      const score = scoreOf(placed)
      const m = moved(starts)
      if (score > (top.pick?.score ?? baseScore) || (top.pick && score === top.pick.score && m < top.moved)) {
        top.pick = { gap, starts, placed, score, base: baseScore }
        top.moved = m
      }
      return score
    }
    if (n <= ORDER_EXACT_MAX) {
      // Every order, in lexicographic order from the gap as it is (the first of equal ones with fewer moves stays).
      const order = Array.from({ length: n }, (_, i) => i)
      while (nextPermutation(order)) consider(order)
    } else {
      // Swaps of two from the gap as it is: the best swap each round (the first of equal ones), while one helps.
      let cur = Array.from({ length: n }, (_, i) => i)
      let curScore = baseScore
      for (let round = 0; round < n; round++) {
        let next: { order: number[]; score: number } | null = null
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const o = [...cur]
            ;[o[i], o[j]] = [o[j]!, o[i]!]
            const s = consider(o)
            if (s != null && s > (next?.score ?? curScore)) next = { order: o, score: s }
          }
        if (!next) break
        cur = next.order
        curScore = next.score
      }
    }
    return top.pick
  }

  const picks = gaps.map(pickGap).filter((x): x is GapPick => x != null)
  if (!picks.length) return null
  // The best gap alone first, then every gap with a gain together (the earlier gap first among equal ones).
  const ranked = [...picks].sort((a, b) => b.score - b.base - (a.score - a.base) || a.gap.index - b.gap.index)
  const tries: GapPick[][] = [[ranked[0]!]]
  if (picks.length > 1) tries.push(picks)

  const before = judgeDay(ctx, state, []).effect
  const planned = new Map(ctx.plan.map((b) => [b.id, b.startMin]))
  const opts = { moduleOn: energy.enabled, calibration: !energy.variants }
  let found: { changes: VariantChange[]; low: number; effect: Variant['effect']; shown: Map<string, Placed> } | null = null
  for (const t of tries.slice(0, ORDER_COUNTS)) {
    const starts = new Map(t.flatMap((x) => [...x.starts]))
    const placed = t.length === 1 ? t[0]!.placed : layout(starts, t.map((x) => x.gap))
    if (!placed) continue
    const changes: VariantChange[] = [...starts]
      .filter(([id, s]) => planned.get(id) !== lm(s))
      .sort((a, b) => a[1] - b[1])
      .map(([block, s]) => ({ k: 'start', block, startMin: lm(s) }))
    if (!changes.length) continue
    const judged = judgeDay(ctx, state, changes)
    // The day counted again keeps every block that stays where it was (as the layout said).
    const counted = new Map(judged.after.forecast.map((p) => [p.block.id, p]))
    if (identity.some((p) => !starts.has(p.block.id) && (counted.get(p.block.id)?.from !== p.from || counted.get(p.block.id)?.to !== p.to))) continue
    const low = lowestEnergy(computeEnergy({ ...ctx, plan: planWith(ctx, changes) }, judged.after, opts))
    if (low == null || shownOf(low) - shownOf(low0) < ENERGY_ORDER_GAIN) continue
    // Never an extension the plan did not have, nor the end of work past the boundary it kept.
    if (judged.effect.extensionMin > before.extensionMin || (before.withinBoundary && !judged.effect.withinBoundary)) continue
    if (!found || low > found.low) found = { changes, low, effect: judged.effect, shown: counted }
  }
  if (!found) return null
  // The changes of order as the day counted with them shows its blocks: each one that moves, by its new place.
  const { shown: after } = found
  const details = identity
    .filter((p) => !p.bg && after.has(p.block.id) && after.get(p.block.id)!.from !== p.from)
    .sort((a, b) => after.get(a.block.id)!.from - after.get(b.block.id)!.from)
    .map((p) => `${names(p.block)} ${logicalClock(lm(p.from))} → ${logicalClock(lm(after.get(p.block.id)!.from))}`)
  const shown = { before: shownOf(low0), after: shownOf(found.low) }
  return {
    id: 'energyOrder',
    label: `Ułóż pod energię – najniższa energia dnia ${shown.before} → ${shown.after}`,
    changes: found.changes,
    effect: found.effect,
    details,
    energy: shown
  }
}

/**
 * The gaps between fixed blocks of the foreground (and those waiting for „Zacznij”) in the forecast, each with its blocks
 * that may move – flexible, of the plan, with an hour of their own, not protected, not begun, no block anchored to them,
 * placed within the gap from now on – when it has two of them at least and `ORDER_MAX_BLOCKS` at most.
 */
function gapsOf(state: DayState, identity: readonly Placed[], buf: (prev: string | null, cat: string) => number): Gap[] {
  const anchors = new Set(state.blocks.filter((b) => b.anchor != null).map((b) => b.anchor!))
  const fg = identity.filter((p) => !p.bg).sort(byFrom)
  const out: Gap[] = []
  let lower = Number.NEGATIVE_INFINITY
  let items: Placed[] = []
  let before: Placed | null = null
  const close = (upper: number) => {
    const slots = items.flatMap((p, i) =>
      !p.running && p.from >= state.now && p.from >= lower && p.to <= upper && pushable(p.block, state.facts) && !anchors.has(p.block.id) ? [i] : []
    )
    if (slots.length >= 2 && slots.length <= ORDER_MAX_BLOCKS) {
      const breaks = slots.map((pos) => {
        if (pos === 0) return 0
        const prev = items[pos - 1]!
        const it = items[pos]!
        const planned = it.block.start
        return planned != null && planned - prev.to >= buf(prev.block.categoryId, it.block.categoryId) ? planned - prev.to : 0
      })
      const first = slots[0]!
      out.push({ index: out.length, lower, upper, items, slots, breaks, before: first > 0 ? items[first - 1]! : before })
    }
  }
  let last: Placed | null = null
  for (const p of fg) {
    if (p.block.fixed || p.block.waits) {
      close(p.from)
      lower = Math.max(lower, p.to)
      items = []
    } else {
      if (!items.length) before = last
      items.push(p)
    }
    last = p
  }
  close(Number.POSITIVE_INFINITY)
  return out
}

/** The next order in lexicographic order, in place; false after the last one. */
function nextPermutation(a: number[]): boolean {
  let i = a.length - 2
  while (i >= 0 && a[i]! >= a[i + 1]!) i--
  if (i < 0) return false
  let j = a.length - 1
  while (a[j]! <= a[i]!) j--
  ;[a[i], a[j]] = [a[j]!, a[i]!]
  for (let l = i + 1, r = a.length - 1; l < r; l++, r--) [a[l], a[r]] = [a[r]!, a[l]!]
  return true
}
