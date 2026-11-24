/**
 * The forecast of a day from minute m (spec „Bloki”, „Sesje tradingowe”, D219): where every block not yet over will be.
 * Fixed blocks keep their planned start; flexible ones keep their order, follow the real end of the one before (never
 * earlier than planned, never before now) and jump behind a fixed block they would hit (a protected life block stays
 * before it); a block anchored to another starts at its end, without a buffer; a transition buffer sits between blocks
 * of different categories in the foreground. A block waiting for „Zacznij” stands at its planned start, and once that
 * has passed, at now at the earliest (until its window ends); a session counts with its typical length.
 *
 * A group of parallel blocks (D476, D492, T1162) takes its time once: a block beside another one not begun yet stands where
 * the forecast puts the group's first block, as long as itself; the first block is in the foreground (the others in the
 * background – until the timer of the group, 1.23-B, picks the foreground by „Zacznij”), and what comes after the group in
 * the foreground waits for its longest block in the foreground. A group whose first block has no place in the forecast (in
 * the background and not begun, gone, its window passed) – its blocks are counted each by itself, at the group's start.
 *
 * Two modes: 'window' – waiting blocks in their planned window at full length (the boundary's proposal, the maximum, the
 * variants' marker); 'typical' – from now with the typical length (energy, budget, hard end, pool).
 *
 * A buffer of decompression (D386, D403, T2450, T2455) not begun stands right after its block's real end (before what else starts
 * then; the session or the class mode – from its end, D583), as long as `bufferMinutes` of that block's length with „Przedłuż”, cut to
 * the room before the next fixed block in the foreground and its bedtime (every 5 min, at least 5 – else it has no place); no
 * transition buffer after it. Its moment passed (another block began in the foreground after its block, or its whole time went by
 * without it) – it has no place. A block anchored to it follows it, or – without its place – its block.
 */
import { OPEN, endShiftOf, isRunning, pausedPlaceOf, ranMinutes, type BlockFact, type DayFacts } from './facts'
import { plannedSpan, type BlockInfo } from './blocks'
import { afterSpans, bufferMinutes, bufferRoom } from './bufferLength'

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

/** The planned window of a waiting block: start, and the last minute it may start (exclusive end) – its planned end. */
function waitWindow(b: BlockInfo): { start: number; end: number } | null {
  if (b.start == null) return null
  return { start: b.start, end: b.start + b.durationMin }
}

/**
 * The planned end of a begun block at minute `m` (T2481): a fixed one – its window's end (begun late: from its start) with its changes of the
 * end, never before `m`; another – what is left of its length (planned, „Przedłuż”, a shortening) from `m`: paused time does not count.
 * `lengthMin` – its length instead of the planned one (a session's typical length). One rule for the forecast and the plan's buffers.
 */
export function runEnd(b: BlockInfo, f: BlockFact, m: number, byId: Map<string, BlockInfo>, lengthMin?: number): number {
  const extended = endShiftOf(f)
  if (lengthMin == null) {
    const span = b.fixed ? plannedSpan(b, byId) : null
    if (span) return Math.max(m, Math.max(span.end, f.startedAt!) + extended)
  }
  return m + Math.max(0, (lengthMin ?? f.planned?.durationMin ?? b.durationMin) + extended - ranMinutes(f, m))
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
  // A fixed block ends at its window's end with its extensions, also begun late – where the timer ends it (spec „Timer”); a session in
  // 'typical' mode with a typical length counts by it instead. Paused time does not count: what is left of its length runs from now.
  const runningEnd = (b: BlockInfo): number => runEnd(b, fact(b.id)!, m, byId, (mode === 'typical' && b.rules.kind === 'session' ? inp.typicalMin(b) : null) ?? undefined)

  // Parallel groups (T1162): the blocks not begun beside a block of the plan, by that block's id.
  const beside = new Map<string, BlockInfo[]>()
  for (const b of inp.blocks) {
    if (b.alongside == null || status(b) !== 'open') continue
    const root = byId.get(b.alongside)
    if (!root || !b.inPlan) continue
    beside.set(root.id, [...(beside.get(root.id) ?? []), b])
  }
  /** Where the group's first block has a place: running, a fixed or waiting one not begun, one of the foreground chain. */
  const rootPlaced = (r: BlockInfo): boolean => {
    const s = status(r)
    return s === 'running' || s === 'paused' || (s === 'open' && ((r.fixed || r.waits) && r.start != null ? true : !r.bg))
  }
  // The first block gone (cancelled or parked before its start, over already): the group stays together (D497) – its first block
  // not begun stands for it, the others beside that one.
  for (const [rootId, list] of [...beside]) {
    const s = status(byId.get(rootId)!)
    if ((s !== 'gone' && s !== 'ended') || list.length < 2) continue
    beside.delete(rootId)
    beside.set(list[0]!.id, list.slice(1))
  }
  const grouped = new Set<string>()
  for (const [rootId, list] of beside) if (rootPlaced(byId.get(rootId)!)) for (const b of list) grouped.add(b.id)
  /**
   * The blocks beside a placed first block: at its place, as long as each; the first block in the foreground keeps it, else
   * the first of them in the foreground takes it – the others are in the background. Returns those of the foreground by
   * their own kind (not „w tle”): each takes the foreground over once the one before it ends (D493), so they hold it all.
   */
  const putBeside = (root: Placed): Placed[] => {
    let front = !root.bg
    const out: Placed[] = []
    for (const b of beside.get(root.block.id) ?? []) {
      if (!grouped.has(b.id)) continue
      // A fixed or waiting block of the group keeps its own window (T1261): a fixed one at its start (from now at the
      // earliest), gone once the window passed; a session from its start or now, gone after its window (D192).
      let from = root.from
      let to = root.from + b.durationMin
      if ((b.fixed || b.waits) && b.start != null) {
        const end = b.start + b.durationMin
        if (m >= end) {
          dropped.add(b.id)
          continue
        }
        from = b.waits && mode === 'window' ? b.start : Math.max(b.start, m)
        const typical = b.waits && mode === 'typical' && b.rules.kind === 'session' ? inp.typicalMin(b) : null
        to = b.fixed ? end : from + (typical ?? b.durationMin)
      }
      const bg = front || b.bg
      if (!bg) front = true
      const p: Placed = { block: b, from, to, bg, due: root.due, running: false }
      put(p)
      if (!b.bg) out.push(p)
    }
    return out
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
  const besideRunning: Placed[] = []
  for (const p of [...placed]) if (p.running) besideRunning.push(...putBeside(p))
  /** A group whose first block is dropped: its blocks are counted each by itself (T1162) – the fixed ones here, the others in the chain. */
  const release = (rootId: string, fixed: BlockInfo[]) => {
    for (const x of beside.get(rootId) ?? []) if (grouped.delete(x.id) && (x.fixed || x.waits)) fixed.push(x)
  }
  const fixedQueue = [...inp.blocks]
  for (let i = 0; i < fixedQueue.length; i++) {
    const b = fixedQueue[i]!
    // A block released by its group's first block comes again at the end of the queue: placed once.
    if (placedById.has(b.id) || grouped.has(b.id) || status(b) !== 'open' || !(b.fixed || b.waits) || b.start == null) continue
    let from = b.start
    let to = b.start + b.durationMin
    if (b.waits) {
      const w = waitWindow(b)!
      if (m >= w.end) {
        dropped.add(b.id)
        release(b.id, fixedQueue)
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
        release(b.id, fixedQueue)
        continue
      }
      from = Math.max(from, m)
    }
    const p: Placed = { block: b, from, to, bg: b.bg, due: b.start, running: false }
    put(p)
    if (!b.bg) fixedFg.push(p)
    // The group of a fixed block takes the foreground with it: a flexible block jumps behind the longest of them.
    fixedFg.push(...putBeside(p))
  }
  fixedFg.sort((a, b) => a.from - b.from)

  // 3. The foreground chain: flexible blocks (paused ones and not started) and anchored ones, in planned order.
  // Anchors in a cycle (a block anchored to itself, A→B→A) have no planned place: they sort last (never recurse forever).
  // A paused block swapped with a start (D478) stands at that block's place: in the order and never earlier.
  const placeOf = (b: BlockInfo): number | null => {
    const f = fact(b.id)
    return f && paused.includes(b) ? pausedPlaceOf(f) : null
  }
  const plannedKey = (b: BlockInfo, depth = 0): number => {
    const place = placeOf(b)
    if (place != null) return place
    if (b.start != null) return b.start
    const a = b.anchor ? ((b.after != null ? byId.get(b.after) : undefined) ?? byId.get(b.anchor)) : undefined
    return a && depth < 50 ? plannedKey(a, depth + 1) + a.durationMin : Number.POSITIVE_INFINITY
  }
  // A parallel group paused whole (1.23-B: a start outside it, „Odcinam się”, a fixed start – T1211): its blocks come back
  // together, as before its start – the first of them in the chain (its planned order), the others beside it.
  const pausedOf = new Map<string, BlockInfo[]>()
  for (const b of paused) {
    const g = fact(b.id)?.group
    if (g == null || b.bg) continue
    pausedOf.set(g, [...(pausedOf.get(g) ?? []), b])
  }
  const pausedLead = new Map<string, BlockInfo[]>()
  const pausedMates = new Set<string>()
  for (const list of pausedOf.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => plannedKey(a) - plannedKey(b) || (a.id < b.id ? -1 : 1))
    pausedLead.set(sorted[0]!.id, sorted.slice(1))
    for (const x of sorted.slice(1)) pausedMates.add(x.id)
  }
  // A buffer of decompression goes first of what is planned at its block's end (T2455), a block anchored to another last.
  const rank = (x: BlockInfo) => (x.decompress?.source != null && x.anchor != null ? -1 : x.anchor ? 1 : 0)
  const chain = inp.blocks
    .filter((b) => !grouped.has(b.id) && !pausedMates.has(b.id) && ((status(b) === 'open' && !b.bg && (b.anchor != null || (!b.fixed && !b.waits))) || paused.includes(b)))
    .sort((a, b) => plannedKey(a) - plannedKey(b) || rank(a) - rank(b) || (a.id < b.id ? -1 : 1))

  // The cursor: where the foreground is free from – the running foreground block's end, else now; the cursor without the
  // floor of now follows the real end of the last foreground block.
  const runningFg = placed.filter((p) => p.running && !p.bg)
  // The group of a running block: its blocks in the foreground hold the foreground as the running one does.
  // A parallel group begun (1.23-B, T1207): its blocks behind hold the foreground to the end of the longest, as before its start.
  const groupBehind = placed.filter((p) => p.running && p.bg && !p.block.bg && fact(p.block.id)?.group != null)
  const heldFg = [...runningFg, ...besideRunning, ...groupBehind]
  let cursor = heldFg.length ? Math.max(...heldFg.map((p) => p.to)) : m
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

  /**
   * The end of the session or the class mode `t` falls in (D583: a buffer begins after it): a block of a session or with the class mode
   * running or placed through `t` – its end, again from there; `t` itself without one.
   */
  const afterModes = (t: number): number => {
    const spans: Array<{ from: number; to: number }> = []
    for (const x of inp.blocks) {
      if (x.rules.kind !== 'session' && !x.rules.classMode) continue
      const xf = fact(x.id)
      for (const r of xf?.runs ?? []) spans.push({ from: r.from, to: r.to === OPEN ? (placedById.get(x.id)?.to ?? m) : r.to })
      const ahead = xf?.startedAt == null ? placedById.get(x.id) : undefined
      if (ahead) spans.push(ahead)
    }
    return afterSpans(t, spans)
  }
  /** A buffer's block (a buffer without a place – the block it stands for, D583): what a block anchored to it follows. */
  const anchorOf = (b: BlockInfo): string | null => (b.after != null && byId.has(b.after) && !dropped.has(b.after) ? b.after : b.anchor)
  /** The start of the first fixed block in the foreground not over at `t`: the room of a buffer ends there. */
  const fixedFrom = (t: number): number => {
    let at = Number.POSITIVE_INFINITY
    for (const fx of fixedFg) if (fx.to > t) at = Math.min(at, fx.from)
    return at
  }

  const pending = [...chain]
  for (let guard = 0; pending.length && guard < 10_000; guard++) {
    const b = pending.shift()!
    const f = fact(b.id)
    const left = f?.startedAt != null ? Math.max(0, (f.planned?.durationMin ?? b.durationMin) + endShiftOf(f) - ranMinutes(f, m)) : b.durationMin
    let from: number
    let due: number
    const place = placeOf(b)
    if (b.decompress?.source != null && b.anchor != null && place == null && f?.startedAt == null) {
      // A buffer of decompression not begun (T2455). Without a place: the blocks beside it counted each by itself (T2486).
      const drop = () => {
        dropped.add(b.id)
        for (const x of beside.get(b.id) ?? []) if (grouped.delete(x.id) && !x.bg && !x.fixed && !x.waits) pending.push(x)
      }
      const src = b.anchor
      if (dropped.has(src)) {
        drop()
        continue
      }
      const sf = fact(src)
      const sp = placedById.get(src)
      const srcEnd = sf?.endedAt ?? sp?.to ?? null
      if (srcEnd == null) {
        if (pending.some((x) => x.id === src)) pending.push(b)
        else drop()
        continue
      }
      const info = byId.get(src)
      // Its length again from its block's length with „Przedłuż” (D403, D580); before any change of that end – as the plan counted it.
      const length = b.decompress.cost != null && info && sf && sf.endChanges.length ? bufferMinutes((sf.planned?.durationMin ?? info.durationMin) + endShiftOf(sf), b.decompress.cost) : b.durationMin
      const moment = afterModes(srcEnd)
      // Its moment passed: a block begun in the foreground after its block ended, or its whole time gone by without it.
      const ended = sf?.endedAt
      // A session or a class it waits for (D583) takes no moment of it.
      const modeOf = (id: string) => {
        const r = byId.get(id)?.rules
        return r?.kind === 'session' || r?.classMode === true
      }
      const passed = ended != null && (moment + length <= m || [...view.blocks].some(([id, x]) => id !== b.id && id !== src && !modeOf(id) && x.runs.some((r) => !r.bg && r.from >= ended)))
      if (passed) {
        drop()
        continue
      }
      const start = Math.max(moment, m, cursor)
      const room = Math.min(b.decompress.until ?? Number.POSITIVE_INFINITY, fixedFrom(start)) - start
      // A buffer you changed (D582, T2477: no cost of the plan's) is as long as you set it – never cut.
      const len = b.decompress.cost == null ? length : bufferRoom(length, room)
      if (!len) {
        drop()
        continue
      }
      const bp: Placed = { block: b, from: start, to: start + len, bg: false, due: srcEnd, running: false }
      put(bp)
      // Blocks saved beside it (an older file, T2482 – no drop makes one now) run with it.
      const groupTo = Math.max(bp.to, ...putBeside(bp).map((x) => x.to))
      cursor = Math.max(cursor, groupTo)
      cursorDue = Math.max(cursorDue, srcEnd + (groupTo - start))
      // The buffer is the break: no transition buffer after it.
      prevCat = null
      continue
    }
    if (b.anchor && place == null) {
      const anchor = anchorOf(b)!
      const af = fact(anchor)
      const ap = placedById.get(anchor)
      if (dropped.has(anchor)) {
        dropped.add(b.id)
        // Its group has no place now: its blocks are counted each by itself, at the group's start (T1162).
        for (const x of beside.get(b.id) ?? []) if (grouped.delete(x.id) && !x.bg && !x.fixed && !x.waits) pending.push(x)
        continue
      }
      let anchorEnd: number | null = af?.endedAt ?? ap?.to ?? null
      if (anchorEnd == null) {
        // The anchor is still to be placed (later in the chain): wait for it.
        if (pending.some((x) => x.id === anchor)) {
          pending.push(b)
          continue
        }
        dropped.add(b.id)
        for (const x of beside.get(b.id) ?? []) if (grouped.delete(x.id) && !x.bg && !x.fixed && !x.waits) pending.push(x)
        continue
      }
      // The anchor ended in the background or in the foreground: no buffer either way. Back to the block of a buffer without a place
      // (D583, T2461): sorted after the buffer, it never goes over what the chain put there meanwhile.
      due = anchorEnd
      from = Math.max(anchorEnd, m, b.after != null && anchor !== b.after ? cursor : Number.NEGATIVE_INFINITY)
    } else {
      const planned = place ?? b.start ?? m
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
    // The group takes its time once (T1162): what comes after it in the foreground waits for the longest of it there.
    const group = [p, ...putBeside(p)]
    // The paused blocks of its parallel group come back with it (T1211): beside it, each for what is left of it, behind.
    for (const x of pausedLead.get(b.id) ?? []) {
      const fx = fact(x.id)!
      const rest = Math.max(0, (fx.planned?.durationMin ?? x.durationMin) + endShiftOf(fx) - ranMinutes(fx, m))
      const q: Placed = { block: x, from, to: from + rest, bg: true, due, running: false }
      put(q)
      group.push(q)
    }
    const groupTo = Math.max(...group.map((x) => x.to))
    if (!b.anchor || place != null || from >= cursor) {
      cursor = Math.max(cursor, groupTo)
      cursorDue = Math.max(cursorDue, due + (groupTo - from))
      prevCat = b.categoryId
    }
  }
  placed.sort((a, b) => a.from - b.from || (a.block.id < b.block.id ? -1 : 1))
  return { placed, dropped }
}
