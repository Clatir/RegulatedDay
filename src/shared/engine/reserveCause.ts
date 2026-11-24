/**
 * The block at whose time a pool first goes below the reserve (N20, T2560–T2573): the cause the tile of „Dziś”, „3 dni” and „Tydzień”
 * marks with a ring in the pool's colour and a hint „Tu głowa schodzi poniżej rezerwy (28 → 19)”. One counting for every axis, from the
 * same curve and the same numbers as the strip (`valuesAt` – a number on the screen, `shadeOf`: below the reserve is `< reserve`), never a
 * second one: the window counts it once for the day it shows (`reserveCauses` – in a `useMemo` / `dayAxis`, not in the loop of the tiles); the minute-by-minute
 * numbers are remembered by the track object (`levelsMemo`), which "Dziś" gets anew at each recount of the day.
 */
import { POOLS, type Pool } from '../model/categories'
import { energySpan, poolCurves, valuesAt, type PoolValues } from './energyCurve'
import type { EnergyTrack } from './energyTrack'

/** What a day's blocks say to the cause: where a block stands and whether it is a background one (the first plan wins a minute – T2562). */
export interface CauseBlock {
  id: string
  startMin: number
  endMin: number
  background?: boolean
  /** A run still to come (the forecast's), not one of the log's (T2571). */
  forecast?: boolean
}

/** One pool's first descent below the reserve inside a block: the pool, its number at the block's start and its lowest number in the block. */
export interface ReserveDrop {
  pool: Pool
  from: number
  to: number
  /**
   * Where the block that causes it ran or will run, when that is not where its tile stands – the run does not overlap the tile at all (a block under a fixed
   * session waits and runs after it – `forecast`; a block begun by a swap ran at another hour – the log's; T2571, T2573); absent – the run is on the tile.
   */
  runs?: { startMin: number; endMin: number; forecast: boolean }
}

/** The cause a block has: the pools that first go below the reserve in its time, earliest first (a tie – głowa, emocje, bodźce, ciało); the first one gives the ring its colour. */
export interface ReserveCause {
  drops: ReserveDrop[]
}

/** A track's pools minute by minute, as the numbers on the screen (the strip's own – `valuesAt`), from the first minute of the span. */
interface Levels {
  from: number
  by: Record<Pool, number[]>
}

const levelsMemo = new WeakMap<object, Levels | null>()

function levelsOf(track: Pick<EnergyTrack, 'samples'>): Levels | null {
  const known = levelsMemo.get(track)
  if (known !== undefined) return known
  const span = energySpan(track)
  let out: Levels | null = null
  if (span) {
    const curves = poolCurves(track)
    const by: Record<Pool, number[]> = { head: [], emotions: [], senses: [], body: [] }
    for (let at = span[0]; at < span[1]; at++) {
      const v: PoolValues | null = valuesAt(curves, at)
      if (!v) continue
      for (const p of POOLS) by[p].push(v[p])
    }
    out = { from: span[0], by }
  }
  levelsMemo.set(track, out)
  return out
}

/**
 * The first descent of each pool: the first minute of the day where the pool goes from the reserve or above it to below it (the number on
 * the screen, as the strip shades it). A pool that stands below the reserve from the day's first minute has no descent until it rises to
 * the reserve and falls again (T2561); one that never goes below has none. Ordered by the minute, a tie by the pools' order.
 */
export function firstDescents(track: Pick<EnergyTrack, 'samples' | 'reserve'> | null | undefined): Array<{ pool: Pool; at: number }> {
  const levels = track ? levelsOf(track) : null
  if (!track || !levels) return []
  const out: Array<{ pool: Pool; at: number }> = []
  for (const p of POOLS) {
    const v = levels.by[p]
    for (let k = 1; k < v.length; k++) {
      if (v[k]! < track.reserve && v[k - 1]! >= track.reserve) {
        out.push({ pool: p, at: levels.from + k })
        break
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || POOLS.indexOf(a.pool) - POOLS.indexOf(b.pool))
}

/**
 * The runs of a block that touch joined into one (T2572): the engine cuts a begun block's run at `now` (the log up to it, the forecast from it) and a block of the
 * forecast may come in parts – the owner, its start and its numbers must not depend on where `now` stands. A run is of the forecast only if every part of it is.
 */
function joined(runs: readonly CauseBlock[]): CauseBlock[] {
  const byId = new Map<string, CauseBlock[]>()
  for (const r of runs) byId.set(r.id, [...(byId.get(r.id) ?? []), r])
  const out: CauseBlock[] = []
  for (const list of byId.values()) {
    const sorted = [...list].sort((a, b) => a.startMin - b.startMin)
    let cur = { ...sorted[0]! }
    for (const r of sorted.slice(1)) {
      if (r.startMin <= cur.endMin && !!r.background === !!cur.background) {
        cur.endMin = Math.max(cur.endMin, r.endMin)
        cur.forecast = cur.forecast === true && r.forecast === true
      } else {
        out.push(cur)
        cur = { ...r }
      }
    }
    out.push(cur)
  }
  return out
}

/** The block that owns a minute: the first plan before a background one, the later started of two, the smaller id of two that began together (T2562, T2567 – the same tile on every axis). */
function ownerAt(blocks: readonly CauseBlock[], covers: (b: CauseBlock) => boolean): CauseBlock | undefined {
  let owner: CauseBlock | undefined
  for (const b of blocks) {
    if (!covers(b)) continue
    const better = !owner || (!b.background && owner.background === true) || (!b.background === !owner.background && (b.startMin > owner.startMin || (b.startMin === owner.startMin && b.id < owner.id)))
    if (better) owner = b
  }
  return owner
}

/**
 * The cause of each block of a day (N20): the block that owns a pool's first descent gets the pool with its numbers. `levels[k]` is the state at the
 * beginning of the minute k, already with the cost of the minute k − 1 (`energia.md`) – so the owner of a descent at `at` is the block that stands in
 * the minute `at − 1` (T2566): A from 13:00 to 14:00 that takes the head under the reserve exactly at 14:00 is the cause, not the B that begins then; the
 * descent after A and a gap is A's too. A minute `at − 1` no block stands in: the block that begins exactly at `at` (its switch or contact – a
 * one-off cost counted at its minute, so it is in `levels[at]`), else none (a descent in a gap – T2563). Where a block of the first plan and a block that
 * begins at `at` meet, the first one has it (a one-off cost of the next one is never told apart); where a background block stands in the minute before and
 * a block of the first plan begins at `at`, the beginning one has it. Among blocks standing in the minute: the first plan before a
 * background one, the later started (what the pool met last), the smaller id of two begun together (T2562, T2567). The numbers (T2564, T2568): the
 * level at the block's start – the first minute of the curve if it began before it – and the lowest from the start up to the block's end (the state
 * after its last minute); a block that began below the reserve – the highest level it stood at before the descent (never „15 → 10” as „schodzi”).
 * T2572: the touching runs of a block are one (its start, its numbers and the tie do not follow `now`); the numbers are of the whole of them. T2571: the blocks that run are those the curve was counted from (`track.runs`: the log's runs, the forecast's from now – a block under a fixed session waits
 * and runs after it, so the tile drawn at its planned hours is the cause of a descent that happens later); a track without them (a test, an older one) –
 * the hours of `blocks`. The tile is always one of `blocks` (a block of an unchecked calendar has the cause, no tile shows it); the numbers are of the run.
 * `blocks` – the tiles: only those that count on the day's curve (not parked, cancelled nor missed). A day without the curve, or without a descent – an empty
 * map. Counted for a track once a day's view (the levels are remembered by the track object – in „Dziś” the track is a new one at each recount, every
 * 30 s), never in the loop of the tiles.
 */
export function reserveCauses(track: Pick<EnergyTrack, 'samples' | 'reserve' | 'runs'> | null | undefined, blocks: readonly CauseBlock[]): Map<string, ReserveCause> {
  const out = new Map<string, ReserveCause>()
  const levels = track ? levelsOf(track) : null
  if (!track || !levels) return out
  const last = levels.from + levels.by.head.length
  const runs: readonly CauseBlock[] = track.runs ? joined(track.runs) : blocks
  const tiles = new Map(blocks.map((b) => [b.id, b]))
  for (const { pool, at } of firstDescents(track)) {
    const flowing = ownerAt(runs, (b) => b.startMin <= at - 1 && at - 1 < b.endMin)
    // A block of the first plan that begins exactly at `at`: its switch or contact is in the state of that minute – a background block (a layer of sessions,
    // a lecture) that stands in the minute before takes only the share of its cost, so the descent is the beginning one's.
    const beginning = ownerAt(runs, (b) => b.startMin === at && b.background !== true)
    const owner = flowing && flowing.background !== true ? flowing : (beginning ?? flowing ?? ownerAt(runs, (b) => b.startMin === at))
    const tile = owner && tiles.get(owner.id)
    if (!owner || !tile) continue
    const v = levels.by[pool]
    const iat = at - levels.from
    // From the block's start; a block that begins at `at` (a one-off cost) – the level just before it.
    const a = Math.min(Math.max(owner.startMin, levels.from) - levels.from, iat - 1)
    const z = Math.min(owner.endMin, last - 1) - levels.from
    const from = v[a]! >= track.reserve ? v[a]! : Math.max(...v.slice(a, iat))
    // T2573: told only where the run stands away from the tile – a few minutes of buffer, a session shorter than typical, the end of the day cut off do not count.
    const elsewhere = !(owner.startMin < tile.endMin && tile.startMin < owner.endMin)
    const drop: ReserveDrop = { pool, from, to: Math.min(...v.slice(a, Math.max(z, iat) + 1)), ...(elsewhere ? { runs: { startMin: owner.startMin, endMin: owner.endMin, forecast: owner.forecast === true } } : {}) }
    const cause = out.get(owner.id)
    if (cause) cause.drops.push(drop)
    else out.set(owner.id, { drops: [drop] })
  }
  return out
}
