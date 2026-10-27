/**
 * The facts of a day folded from its log (spec „Stan timera, realne czasy i energia są wyliczane z logu”): which blocks
 * ran when and where, requests, „Odcinam się”, the approved boundary, exceptions, confirmed ends of work, snapshots,
 * the leader's segments of minutes. Events are folded in their full order (logical clock, computer, number); an event
 * points at a block and the states it works in – an end works on a running or paused block, a pause on a running one, a
 * resume on a paused one. A click that no longer fits does nothing and is listed (spec: „Pauza z PC B nie zadziałała”).
 *
 * `viewAt(facts, m)` is what was known at the start of minute m: only what happened before it (T413) – the engine judges
 * every minute by the values in force when it began.
 */
import type { Costs } from '../model/categories'
import { compareEvents, eventAt, isKnown, type AnyEvent, type LogEvent, type MinuteClass } from '../model/events'
import { settingsFrom, type DayTypeId, type RulesSettings } from '../model/settings'
import type { PlanBlock } from '../model/plan'
import { idxOf, type Grid } from './grid'

/** An open run or interval: still going. */
export const OPEN = Number.POSITIVE_INFINITY

export interface Run {
  from: number
  to: number
  bg: boolean
}

/** Minutes after the boundary confirmed in advance (spec D253): [from, to) known from `at`. */
export interface Confirm {
  at: number
  from: number
  to: number
}

export interface BlockFact {
  id: string
  startedAt: number | null
  endedAt: number | null
  runs: Run[]
  planned: { categoryId: string; variantId: string | null; durationMin: number; tag: PlanBlock['tag']; fixed: boolean; costs?: Costs | null; bgCostPct?: number | null } | null
  confirms: Confirm[]
  /** Confirmed „Przedłuż”, in order. */
  extends: Array<{ at: number; minutes: number }>
  parkedAt: number | null
  /** Why it was parked or cancelled (the rule: 'exchange', 'type', 'lateWake', 'workEnd' …). */
  goneRule: string | null
  cancelledAt: number | null
  done: boolean | null
  endRule: string | null
  /** The id of the event that ended it („Cofnij” of an automatic end points at it). */
  endId: string | null
  /** „Dodaj bez wymiany” (index): its minutes after the boundary are confirmed in advance, up to its planned length. */
  addConfirmedAt: number | null
}

/** An action the app did itself (spec „Działania automatyczne”): on the list „zrobione automatycznie” with „Cofnij”. */
export interface AutoAction {
  id: string
  k: string
  /** The rule that did it ('fixedStart', 'plan', 'twoQuestions', 'idle', 'lastInput', 'workEnd' …). */
  rule: string
  block: string | null
  /** The request it ended (a request's automatic end). */
  request: string | null
  /** Index. */
  at: number
  /** The computer that wrote it. */
  c: string
}

export interface RequestFact {
  id: string
  from: number
  to: number
  mode: string
  /** The hard end in force at its start, as written (an instant), or null. */
  hardEndAt: number | null
  person: string | null
  estimateMin: number | null
  /** The block it interrupted at its start (paused, or a fixed one sent to the background) – resumed at its end. */
  interrupts: string | null
  /** Written in after the fact: the flexible blocks whose runs lose its minutes. */
  splits: string[]
  /** The id of the event that ended it („Cofnij” of an automatic end points at it). */
  endId: string | null
  /** The clocks its start and its end were written at (ms) – a request written in later is checked then. */
  startT: number
  endT: number | null
}

export interface Segment {
  from: number
  to: number
  cls: MinuteClass
  upfront: boolean
  know: Record<string, number>
  v: number
  c: string
  l: number
}

export interface DayFacts {
  grid: Grid
  blocks: Map<string, BlockFact>
  requests: RequestFact[]
  disconnect: Array<{ from: number; to: number }>
  approvals: Array<{ at: number; boundary: number; auto: boolean }>
  undos: number[]
  exceptions: Array<{ at: number; minutes: number }>
  workEnds: Array<{ at: number; end: number }>
  /** Snapshots after the day's creation: „od dziś” and changes of type (with the maximum and minimum a change fixed, index / min). */
  snapshots: Array<{ at: number; dayType: DayTypeId; settings: RulesSettings; reason: string; max: number | null; minRegen: number | null }>
  segments: Segment[]
  hardEndPass: { at: number } | null
  /** The last event number seen of each computer (the state of knowledge of a segment). */
  know: Record<string, number>
  /** Clicks that did not fit (stale views) and conflicts, for the bar. */
  problems: Array<{ event: string; why: string }>
  /** What the app did itself and nobody undid, in order. */
  autos: AutoAction[]
  /** Events undone by „Cofnij” (their ids): the facts are folded without them. */
  undone: Set<string>
  /** Questions seen (question id → the first instant it was seen, ms, and on which computer and how). */
  seen: Map<string, { at: number; c: string; how: string }>
  /** Answers to questions that are not actions of the timer („Przerwa” of „Koniec pracy?”, absence …): id → answer. */
  answers: Map<string, { at: number; answer: string; value: number | null }>
}

const newBlock = (id: string): BlockFact => ({
  id,
  startedAt: null,
  endedAt: null,
  runs: [],
  planned: null,
  confirms: [],
  extends: [],
  parkedAt: null,
  goneRule: null,
  cancelledAt: null,
  done: null,
  endRule: null,
  endId: null,
  addConfirmedAt: null
})

/** Events that never change the timer's facts (they do not make segments stale either); energy never does either. */
const PASSIVE = new Set(['minutes', 'hardend.pass', 'presence.first', 'gap.open', 'gap.close', 'observe.from', 'observe.alive', 'observe.to', 'module.set', 'question.seen', 'fewer.start', 'fewer.end', 'water.drink', 'notice.shown'])

export const isPassive = (e: AnyEvent): boolean => PASSIVE.has(e.k) || e.dom === 'energy'

/** Fold the day's events (any order given; folded in their full order). */
export function foldFacts(grid: Grid, events: readonly AnyEvent[]): DayFacts {
  const f: DayFacts = {
    grid,
    blocks: new Map(),
    requests: [],
    disconnect: [],
    approvals: [],
    undos: [],
    exceptions: [],
    workEnds: [],
    snapshots: [],
    segments: [],
    hardEndPass: null,
    know: {},
    problems: [],
    autos: [],
    undone: new Set(),
    seen: new Map(),
    answers: new Map()
  }
  const idx = (at: number) => idxOf(grid, at)
  // „Cofnij” (spec: the undo writes an event „korekta”): the events it points at are folded as if never written. The
  // latest undo first: an undo undone by a later one (its „Cofnij”) points at nothing.
  const undos = events.filter((e): e is Extract<LogEvent, { k: 'undo' }> => isKnown(e) && e.k === 'undo').sort((a, b) => compareEvents(b, a))
  for (const u of undos) if (!f.undone.has(u.id)) f.undone.add(u.target)
  const block = (id: string) => {
    let b = f.blocks.get(id)
    if (!b) f.blocks.set(id, (b = newBlock(id)))
    return b
  }
  const openRun = (b: BlockFact) => b.runs.find((r) => r.to === OPEN) ?? null
  const stale = (e: LogEvent, why: string) => f.problems.push({ event: e.id, why })
  const requests = new Map<string, RequestFact>()

  for (const e of [...events].sort(compareEvents)) {
    f.know[e.c] = Math.max(f.know[e.c] ?? -1, e.n)
    if (!isKnown(e) || f.undone.has(e.id)) continue
    const auto: unknown = e.autoRule
    const problemsBefore = f.problems.length
    switch (e.k) {
      case 'block.start': {
        const b = block(e.block)
        if (b.startedAt != null) {
          stale(e, 'blok już się zaczął')
          break
        }
        const at = idx(e.at)
        b.startedAt = at
        b.planned = { ...e.planned, variantId: e.planned.variantId ?? null, tag: e.planned.tag ?? null, fixed: e.planned.fixed === true }
        b.runs.push({ from: at, to: OPEN, bg: e.bg === true })
        if (e.confirmUntil != null) b.confirms.push({ at, from: at, to: idx(e.confirmUntil) })
        break
      }
      case 'block.pause': {
        const b = block(e.block)
        const run = openRun(b)
        if (!run || b.endedAt != null) {
          stale(e, 'blok nie biegnie')
          break
        }
        run.to = Math.max(run.from, idx(e.at))
        break
      }
      case 'block.resume': {
        const b = block(e.block)
        if (b.startedAt == null || b.endedAt != null || openRun(b)) {
          stale(e, 'blok nie jest zapauzowany')
          break
        }
        const at = Math.max(idx(e.at), b.runs.at(-1)?.to ?? 0)
        b.runs.push({ from: at, to: OPEN, bg: b.runs.at(-1)?.bg ?? false })
        if (e.confirmUntil != null) b.confirms.push({ at, from: at, to: idx(e.confirmUntil) })
        break
      }
      case 'block.end': {
        const b = block(e.block)
        if (b.startedAt == null || b.endedAt != null) {
          stale(e, b.endedAt != null ? 'blok już się skończył' : 'blok się nie zaczął')
          break
        }
        const at = Math.max(idx(e.at), b.startedAt)
        const run = openRun(b)
        if (run) run.to = Math.max(run.from, at)
        b.endedAt = run ? run.to : (b.runs.at(-1)?.to ?? at)
        b.done = e.done ?? null
        b.endRule = e.rule ?? null
        b.endId = e.id
        break
      }
      case 'block.restart': {
        // „Zacznij jeszcze raz” (D207): the ended block runs again from now – a new stretch of the same block.
        const b = block(e.block)
        if (b.startedAt == null || b.endedAt == null) {
          stale(e, 'blok nie jest zakończony')
          break
        }
        const at = Math.max(idx(e.at), b.endedAt)
        b.runs.push({ from: at, to: OPEN, bg: b.runs.at(-1)?.bg ?? false })
        b.endedAt = null
        b.done = null
        b.endRule = null
        b.endId = null
        break
      }
      case 'block.fg': {
        const b = block(e.block)
        const run = openRun(b)
        if (!run || run.bg === (e.bg === true)) break
        const at = Math.max(run.from, idx(e.at))
        run.to = at
        b.runs.push({ from: at, to: OPEN, bg: e.bg === true })
        break
      }
      case 'block.extend':
        block(e.block).extends.push({ at: idx(e.at), minutes: e.minutes })
        break
      case 'block.confirm': {
        const b = block(e.block)
        b.confirms.push({ at: idx(e.at), from: idx(e.at), to: OPEN })
        break
      }
      case 'block.park': {
        const b = block(e.block)
        if (b.parkedAt == null && b.startedAt == null) {
          b.parkedAt = idx(e.at)
          b.goneRule = e.rule ?? null
        }
        break
      }
      case 'block.cancel': {
        const b = block(e.block)
        if (b.cancelledAt == null && b.startedAt == null) {
          b.cancelledAt = idx(e.at)
          b.goneRule = e.rule ?? null
        }
        break
      }
      case 'block.addConfirm': {
        const b = block(e.block)
        if (b.addConfirmedAt == null) b.addConfirmedAt = idx(e.at)
        break
      }
      case 'boundary.approve':
        f.approvals.push({ at: idx(e.at), boundary: idx(e.boundary), auto: e.auto === true })
        break
      case 'boundary.undo':
        f.undos.push(idx(e.at))
        break
      case 'boundary.exception':
        f.exceptions.push({ at: idx(e.at), minutes: e.minutes })
        break
      case 'work.end':
        f.workEnds.push({ at: idx(e.at), end: idx(e.end) })
        break
      case 'request.start': {
        if (requests.has(e.request)) {
          stale(e, 'prośba już się zaczęła')
          break
        }
        const r: RequestFact = { id: e.request, from: idx(e.at), to: OPEN, mode: e.mode, hardEndAt: e.hardEndAt ?? null, person: e.person ?? null, estimateMin: e.estimateMin ?? null, interrupts: e.interrupts ?? null, splits: Array.isArray(e.splits) ? e.splits.filter((x): x is string => typeof x === 'string') : [], endId: null, startT: e.t, endT: null }
        requests.set(e.request, r)
        f.requests.push(r)
        break
      }
      case 'request.end': {
        const r = requests.get(e.request)
        if (!r || r.to !== OPEN) {
          stale(e, 'prośba nie trwa')
          break
        }
        r.to = Math.max(r.from, idx(e.at))
        r.endId = e.id
        r.endT = e.t
        break
      }
      case 'disconnect.start':
        if (!f.disconnect.some((d) => d.to === OPEN)) f.disconnect.push({ from: idx(e.at), to: OPEN })
        break
      case 'disconnect.end': {
        const d = f.disconnect.find((x) => x.to === OPEN)
        if (d) d.to = Math.max(d.from, idx(e.at))
        break
      }
      case 'day.snapshot':
        f.snapshots.push({
          at: idx(e.at),
          dayType: e.dayType,
          settings: settingsFrom(e.settings),
          reason: e.reason,
          max: e.max != null ? idx(e.max) : null,
          minRegen: e.minRegen ?? null
        })
        break
      case 'minutes':
        if (e.to > e.from) f.segments.push({ from: idx(e.from), to: idx(e.to), cls: e.cls, upfront: e.upfront === true, know: e.know, v: e.v, c: e.c, l: e.l })
        break
      case 'hardend.pass':
        if (!f.hardEndPass) f.hardEndPass = { at: idx(e.at) }
        break
      case 'question.seen':
        if (!f.seen.has(e.question)) f.seen.set(e.question, { at: e.at, c: e.c, how: e.how })
        break
      case 'question.answer':
        if (!f.answers.has(e.question)) f.answers.set(e.question, { at: e.at, answer: e.answer, value: e.value ?? null })
        break
      default:
        break
    }
    // An automatic action that changed something is listed (one that no longer fitted is only a problem); the leader's
    // own corrections of its automatic ends (a later log showed input) are not actions to undo.
    if (typeof auto === 'string' && auto && e.k !== 'undo' && f.problems.length === problemsBefore) {
      const blockId = (e as { block?: unknown }).block
      const requestId = (e as { request?: unknown }).request
      f.autos.push({ id: e.id, k: e.k, rule: auto, block: typeof blockId === 'string' ? blockId : null, request: typeof requestId === 'string' ? requestId : null, at: idx(eventAt(e)), c: e.c })
    }
  }
  // A request written in after the fact splits the flexible blocks it names (spec „nachodzi na blok elastyczny, dzieli
  // go na dwie części”): whenever it was written, their runs in the foreground lose its minutes.
  for (const r of f.requests) {
    if (r.to === OPEN) continue
    for (const id of r.splits) {
      const b = f.blocks.get(id)
      if (b) b.runs = b.runs.flatMap((x) => (x.bg || x.to <= r.from || x.from >= r.to ? [x] : [{ ...x, to: r.from }, { ...x, from: r.to }].filter((y) => y.to > y.from)))
    }
  }
  f.snapshots.sort((a, b) => a.at - b.at)
  return f
}

/** A block as known at the start of minute m: runs cut at m, what began at m or later not yet there. */
export function blockAt(b: BlockFact, m: number): BlockFact {
  const addConfirmedAt = b.addConfirmedAt != null && b.addConfirmedAt < m ? b.addConfirmedAt : null
  if (b.startedAt == null || b.startedAt >= m) {
    const parkedAt = b.parkedAt != null && b.parkedAt < m ? b.parkedAt : null
    const cancelledAt = b.cancelledAt != null && b.cancelledAt < m ? b.cancelledAt : null
    return { ...newBlock(b.id), parkedAt, cancelledAt, goneRule: parkedAt != null || cancelledAt != null ? b.goneRule : null, addConfirmedAt }
  }
  const runs = b.runs.filter((r) => r.from < m).map((r) => (r.to >= m ? { ...r, to: OPEN } : r))
  const ended = b.endedAt != null && b.endedAt < m
  return {
    ...b,
    runs,
    endedAt: ended ? b.endedAt : null,
    done: ended ? b.done : null,
    endRule: ended ? b.endRule : null,
    confirms: b.confirms.filter((c) => c.at < m),
    extends: b.extends.filter((x) => x.at < m),
    addConfirmedAt
  }
}

/** The facts known at the start of minute m (T413). */
export function viewAt(f: DayFacts, m: number): DayFacts {
  const blocks = new Map<string, BlockFact>()
  for (const [id, b] of f.blocks) blocks.set(id, blockAt(b, m))
  return {
    ...f,
    blocks,
    requests: f.requests.filter((r) => r.from < m).map((r) => (r.to >= m ? { ...r, to: OPEN, endId: null, endT: null } : r)),
    disconnect: f.disconnect.filter((d) => d.from < m).map((d) => (d.to >= m ? { ...d, to: OPEN } : d)),
    approvals: f.approvals.filter((a) => a.at < m),
    undos: f.undos.filter((u) => u < m),
    exceptions: f.exceptions.filter((x) => x.at < m),
    workEnds: f.workEnds.filter((w) => w.at < m),
    snapshots: f.snapshots.filter((s) => s.at < m),
    hardEndPass: f.hardEndPass && f.hardEndPass.at < m ? f.hardEndPass : null
  }
}

/** Is the block running (not paused, not ended) at the start of m, in a view at m. */
export function isRunning(b: BlockFact): boolean {
  return b.endedAt == null && b.runs.some((r) => r.to === OPEN)
}

/** Minutes the block has run so far in a view at m (runs cut at m). */
export function ranMinutes(b: BlockFact, m: number): number {
  return b.runs.reduce((s, r) => s + Math.max(0, Math.min(r.to, m) - r.from), 0)
}

/**
 * The automatic resume of the block a request interrupted, written with its end (rule 'requestResume', the same
 * minute): an end undone („Cofnij”, an answer, a later log) takes it along – the request runs again, the block waits.
 */
export function resumedWith(f: DayFacts, r: RequestFact): AutoAction[] {
  if (!r.interrupts || r.to === OPEN) return []
  return f.autos.filter((x) => x.rule === 'requestResume' && x.block === r.interrupts && x.at === r.to)
}
