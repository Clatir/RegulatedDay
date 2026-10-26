/**
 * The forecast of a day from minute m (spec „Bloki”, „Sesje tradingowe”, D219): where every block not yet over will be.
 * Fixed blocks keep their planned start; flexible ones keep their order, follow the real end of the one before (never
 * earlier than planned, never before now) and jump behind a fixed block they would hit (a protected life block stays
 * before it); a block anchored to another starts at its end, without a buffer; a transition buffer sits between blocks
 * of different categories in the foreground. A block waiting for „Zacznij” stands at its planned start, and once that
 * has passed, at now at the earliest (until its window ends); a session counts with its typical length.
 *
 * Two modes: 'window' – waiting blocks in their planned window at full length (the boundary's proposal, the maximum, the
 * variants' marker); 'typical' – from now with the typical length (energy, budget, hard end, pool).
 */
import { OPEN, isRunning, ranMinutes, type DayFacts } from './facts'
import type { BlockInfo } from './blocks'

export type ForecastMode = 'window' | 'typical'

export interface Placed {
  block: BlockInfo
  from: number
  to: number
  bg: boolean
  /** When it is due without the floor of now (for the 15-minute rule of the first end of work). */
  due: number
  /** Running at m (its forecast continues it). */
  running: boolean
}

export interface ForecastInput {
  blocks: readonly BlockInfo[]
  /** The facts known at the start of m. */
  view: DayFacts
  m: number
  mode: ForecastMode
  transitionBufferMin: number
  /** Typical length of each session of the layer (median of the last 4 weeks, ≥ 5 sessions), else null = its window. */
  typicalMin: (b: BlockInfo) => number | null
}

export interface Forecast {
  placed: Placed[]
  /** Blocks that will not happen: their window passed unstarted, their anchor left. */
  dropped: Set<string>
}

/** The planned window of a waiting block: start, and the last minute it may start (exclusive end). */
function waitWindow(b: BlockInfo): { start: number; end: number } | null {
  if (b.start == null) return null
  return { start: b.start, end: b.waitUntil ?? b.start + b.durationMin }
}

export function forecast(inp: ForecastInput): Forecast {
  const { view, m, mode } = inp
  const byId = new Map(inp.blocks.map((b) => [b.id, b]))
  const placed: Placed[] = []
  const dropped = new Set<string>()
  const placedById = new Map<string, Placed>()
  const put = (p: Placed) => {
    placed.push(p)
    placedById.set(p.block.id, p)
  }

  const fact = (id: string) => view.blocks.get(id)
  const status = (b: BlockInfo): 'ended' | 'running' | 'paused' | 'open' | 'gone' => {
    const f = fact(b.id)
    // A block only the log knows (begun outside the plan) is not there before its start.
    if (!b.inPlan && (!f || f.startedAt == null)) return 'gone'
    if (!f || f.startedAt == null) return f && (f.parkedAt != null || f.cancelledAt != null) ? 'gone' : 'open'
    if (f.endedAt != null) return 'ended'
    return isRunning(f) ? 'running' : 'paused'
  }

  /** The planned end of a started block: its start, the planned length, the paused time and confirmed extensions. */
  const runningEnd = (b: BlockInfo): number => {
    const f = fact(b.id)!
    const planned = f.planned?.durationMin ?? b.durationMin
    const extended = f.extends.reduce((s, x) => s + x.minutes, 0)
    let length = planned + extended
    if (mode === 'typical' && b.rules.kind === 'session') {
      const t = inp.typicalMin(b)
      if (t != null) length = t + extended
    }
    // Paused time does not count to the block: what is left of its length runs from now; past its length it ends now.
    return m + Math.max(0, length - ranMinutes(f, m))
  }

  // 1. Started blocks: running ones go on from now to their planned end (past it: they end now); paused ones wait.
  const paused: BlockInfo[] = []
  for (const b of inp.blocks) {
    const s = status(b)
    if (s === 'gone') dropped.add(b.id)
    if (s === 'running') {
      const f = fact(b.id)!
      const bg = f.runs.find((r) => r.to === OPEN)?.bg ?? b.bg
      put({ block: b, from: m, to: runningEnd(b), bg, due: f.startedAt!, running: true })
    } else if (s === 'paused') paused.push(b)
  }

  // 2. Fixed blocks not started: at their times; waiting ones from their start, then from now, until their window ends.
  const fixedFg: Placed[] = []
  for (const b of inp.blocks) {
    if (status(b) !== 'open' || !(b.fixed || b.waits) || b.start == null) continue
    let from = b.start
    let to = b.start + b.durationMin
    if (b.waits) {
      const w = waitWindow(b)!
      if (m >= w.end) {
        dropped.add(b.id)
        continue
      }
      if (mode === 'typical') {
        from = Math.max(w.start, m)
        const t = b.rules.kind === 'session' ? inp.typicalMin(b) : null
        to = from + (t ?? b.durationMin)
      }
    } else {
      if (to <= m) {
        // A fixed block whose planned end has passed does not start any more: it counts as cancelled.
        dropped.add(b.id)
        continue
      }
      from = Math.max(from, m)
    }
    const p: Placed = { block: b, from, to, bg: b.bg, due: b.start, running: false }
    put(p)
    if (!b.bg) fixedFg.push(p)
  }
  fixedFg.sort((a, b) => a.from - b.from)

  // 3. The foreground chain: flexible blocks (paused ones and not started) and anchored ones, in planned order.
  // Anchors in a cycle (a block anchored to itself, A→B→A) have no planned place: they sort last (never recurse forever).
  const plannedKey = (b: BlockInfo, depth = 0): number => {
    if (b.start != null) return b.start
    const a = b.anchor ? byId.get(b.anchor) : undefined
    return a && depth < 50 ? plannedKey(a, depth + 1) + a.durationMin : Number.POSITIVE_INFINITY
  }
  const chain = inp.blocks
    .filter((b) => (status(b) === 'open' && !b.bg && (b.anchor != null || (!b.fixed && !b.waits))) || paused.includes(b))
    .sort((a, b) => plannedKey(a) - plannedKey(b) || (a.anchor ? 1 : 0) - (b.anchor ? 1 : 0) || (a.id < b.id ? -1 : 1))

  // The cursor: where the foreground is free from – the running foreground block's end, else now; the cursor without the
  // floor of now follows the real end of the last foreground block.
  const runningFg = placed.filter((p) => p.running && !p.bg)
  let cursor = runningFg.length ? Math.max(...runningFg.map((p) => p.to)) : m
  let cursorDue = cursor
  // An urgent request runs to its estimate (spec „Prośba”: the forecast knows it at once) – the foreground is free after it.
  for (const r of view.requests) if (r.to === OPEN && r.mode === 'urgent' && r.estimateMin != null) cursor = Math.max(cursor, r.from + r.estimateMin)
  if (!runningFg.length) {
    let lastEnd = Number.NEGATIVE_INFINITY
    for (const [, f] of view.blocks) if (f.endedAt != null && !(f.runs.at(-1)?.bg ?? false)) lastEnd = Math.max(lastEnd, f.endedAt)
    cursorDue = lastEnd
  }
  let prevCat: string | null = runningFg[0]?.block.categoryId ?? null
  const buffer = (cat: string) => (prevCat && prevCat !== cat ? inp.transitionBufferMin : 0)

  const pending = [...chain]
  for (let guard = 0; pending.length && guard < 10_000; guard++) {
    const b = pending.shift()!
    const f = fact(b.id)
    const left = f?.startedAt != null ? Math.max(0, (f.planned?.durationMin ?? b.durationMin) + f.extends.reduce((s, x) => s + x.minutes, 0) - ranMinutes(f, m)) : b.durationMin
    let from: number
    let due: number
    if (b.anchor) {
      const af = fact(b.anchor)
      const ap = placedById.get(b.anchor)
      if (dropped.has(b.anchor)) {
        dropped.add(b.id)
        continue
      }
      let anchorEnd: number | null = af?.endedAt ?? ap?.to ?? null
      if (anchorEnd == null) {
        // The anchor is still to be placed (later in the chain): wait for it.
        if (pending.some((x) => x.id === b.anchor)) {
          pending.push(b)
          continue
        }
        dropped.add(b.id)
        continue
      }
      // The anchor ended in the background or in the foreground: no buffer either way.
      due = anchorEnd
      from = Math.max(anchorEnd, m)
    } else {
      const planned = b.start ?? m
      due = Math.max(planned, cursorDue + buffer(b.categoryId))
      from = Math.max(planned, cursor + buffer(b.categoryId), m)
    }
    // Jump behind a fixed foreground block it would hit (a protected life block stays before it).
    if (!b.protectedLife) {
      for (const fx of fixedFg) {
        if (from < fx.to && from + left > fx.from) {
          const jump = fx.to + (fx.block.categoryId !== b.categoryId ? inp.transitionBufferMin : 0)
          from = Math.max(from, jump)
          due = Math.max(due, jump)
        }
      }
    }
    const p: Placed = { block: b, from, to: from + left, bg: false, due, running: false }
    put(p)
    if (!b.anchor || from >= cursor) {
      cursor = Math.max(cursor, p.to)
      cursorDue = Math.max(cursorDue, due + left)
      prevCat = b.categoryId
    }
  }
  placed.sort((a, b) => a.from - b.from || (a.block.id < b.block.id ? -1 : 1))
  return { placed, dropped }
}
