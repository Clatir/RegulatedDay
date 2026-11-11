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
import { compareEvents, eventAt, isKnown, type AnyEvent, type CloseHow, type EventBase, type LogEvent, type MinuteClass } from '../model/events'
import { settingsFrom, type DayTypeId, type RulesSettings } from '../model/settings'
import type { PlanBlock } from '../model/plan'
import type { RoutineVersion } from '../model/routines'
import { atOf, idxOf, type Grid } from './grid'

/** An open run or interval: still going. */
export const OPEN = Number.POSITIVE_INFINITY

/**
 * When an event happened among the others (G1): its own instant moved onto the logical clock – `at + (l − t)` – then the
 * log's order (`compareEvents`). An event written later with an earlier instant (an automatic start at the planned
 * instant, a resume at the return or at a request's end) keeps its instant; a computer whose clock runs behind but has
 * seen a later event is moved forward by as much as its logical clock ran ahead of its own clock.
 */
export interface EventOrder extends Pick<EventBase, 'l' | 'c' | 'n'> {
  instant: number
  /** The event's own instant (`eventAt`, ms): with `c` it tells the events of one click (written together) apart. */
  at: number
}

export const orderOf = (e: AnyEvent): EventOrder => {
  const at = eventAt(e)
  return { instant: at + e.l - e.t, at, l: e.l, c: e.c, n: e.n }
}

/** Written with the same click as the event of `o` (`startEvents` ends the block in the foreground and starts the next). */
export const sameClick = (e: AnyEvent, o: EventOrder): boolean => e.c === o.c && eventAt(e) === o.at

/** Which of two events came first (`EventOrder`). */
export const compareOrder = (a: EventOrder, b: EventOrder): number => a.instant - b.instant || compareEvents(a, b)

export interface Run {
  from: number
  to: number
  bg: boolean
  /**
   * When the event that began it happened (`EventOrder`, `workSince`): its start, resume, restart or switch of the
   * foreground; both halves of a run a request cuts keep it, a corrected start (`block.fix`) sets it on the whole run.
   */
  begun: EventOrder
}

export interface WorkEndFact {
  at: number
  end: number
  /** When the `work.end` event happened (`EventOrder`). */
  order: EventOrder
}

/** Minutes after the boundary confirmed in advance (spec D253): [from, to) known from `at`. */
export interface Confirm {
  at: number
  from: number
  to: number
  /** When the event that confirmed them happened (`EventOrder`): a shortening (D365) ends only those confirmed before it. */
  order: EventOrder
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
  /**
   * Every change of its planned end, in the log's order: „Przedłuż” (minutes > 0) and an end dragged earlier on the axis
   * (`block.shorten`, minutes < 0, D365). Where the planned end is counted, take it from here (`endShiftOf`), not from
   * `extends`; where their order matters (a shortening cuts what was confirmed before it – `confirmWindows`), sort them
   * by `order` (`compareOrder`) – a click of another computer may stand later in the log than it happened.
   */
  endChanges: Array<{ at: number; minutes: number; order: EventOrder }>
  parkedAt: number | null
  /** Why it was parked or cancelled (the rule: 'exchange', 'type', 'lateWake', 'workEnd' …). */
  goneRule: string | null
  cancelledAt: number | null
  done: boolean | null
  endRule: string | null
  /** The id of the event that ended it („Cofnij” of an automatic end points at it). */
  endId: string | null
  /** When that event happened among the others (`EventOrder`): what began after it is told by this, not by minutes. */
  endOrder: EventOrder | null
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
  /** When its start happened among the others (`EventOrder`): what began after a removed block is told by this. */
  begun: EventOrder
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
  disconnect: Array<{ from: number; to: number; begun: EventOrder }>
  /**
   * `plan`: the blocks of the plan when it was approved (null: an approval that does not say); `undoneAt` – the minute of
   * the first „Cofnij” written after it (by the order of the log, so an approval, its „Cofnij” and a new approval in one
   * minute keep the new one).
   */
  approvals: Array<{ at: number; boundary: number; auto: boolean; plan: string[] | null; undoneAt: number | null }>
  undos: number[]
  exceptions: Array<{ at: number; minutes: number }>
  /** „Koniec pracy” and what writes it: the click (index, and its place in the log) and the end it confirms (index). */
  workEnds: WorkEndFact[]
  /** Snapshots after the day's creation: „od dziś” and changes of type (with the maximum and minimum a change fixed, index / min). */
  snapshots: Array<{ at: number; dayType: DayTypeId; settings: RulesSettings; reason: string; max: number | null; minRegen: number | null }>
  segments: Segment[]
  /** `quiet`: nothing was missing of the minimum at the pass, as the leader wrote it (null: older log – counted again). */
  hardEndPass: { at: number; quiet: boolean | null } | null
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
  /**
   * Answers to questions that are not actions of the timer („Przerwa” of „Koniec pracy?”, absence …): id → answer; `order`
   * – when it was written (`EventOrder`: before or after an event of another computer, whatever their clocks say).
   */
  answers: Map<string, { at: number; answer: string; value: number | null; order: EventOrder }>
  /** The day closed (the ritual, the morning's choice): the last close written, `at` an index. */
  closed: { at: number; how: CloseHow } | null
  /** Stretches marked in the ritual as no rest, and when (indices): they count from the marking on (T413). */
  notRest: Array<{ from: number; to: number; at: number }>
  /** The day's freeze: of two, the one by newer rules, then the one counting more events (spec „Ocena dnia”). */
  frozen: FrozenFact | null
  /** Routines ticked off by their block (D328): the last record of each; `at` ms, `id` – the event (its „Cofnij”). */
  routines: Map<string, { id: string; at: number; routine: string; version: RoutineVersion; steps: string[] }>
}

export interface FrozenFact {
  id: string
  /** The computer that froze it, its rules version and logical clock. */
  c: string
  v: number
  l: number
  /** Index. */
  at: number
  how: 'ready' | 'timeout'
  /** The last event of every computer the grade counts (later ones are „poza oceną”). */
  know: Record<string, number>
  missing: string[]
  grade: Record<string, unknown>
}

/** How many events a freeze counted. */
export const countedOf = (x: { know: Readonly<Record<string, number>> }): number => Object.values(x.know).reduce((s, n) => s + Math.max(0, n + 1), 0)

/**
 * Of two freezes of a day `a` wins (spec „Ocena dnia”): by newer rules, at the same rules the one counting more events;
 * a tie goes to the lower computer id – the log and the files of grades choose the same one on every computer.
 */
export function betterFreeze(a: { v: number; c: string; know: Readonly<Record<string, number>> }, b: { v: number; c: string; know: Readonly<Record<string, number>> }): boolean {
  if (a.v !== b.v) return a.v > b.v
  const d = countedOf(a) - countedOf(b)
  return d !== 0 ? d > 0 : a.c < b.c
}

const newBlock = (id: string): BlockFact => ({
  id,
  startedAt: null,
  endedAt: null,
  runs: [],
  planned: null,
  confirms: [],
  extends: [],
  endChanges: [],
  parkedAt: null,
  goneRule: null,
  cancelledAt: null,
  done: null,
  endRule: null,
  endId: null,
  endOrder: null,
  addConfirmedAt: null
})

/** Events that never change the timer's facts (they do not make segments stale either); energy never does either. */
const PASSIVE = new Set(['minutes', 'hardend.pass', 'presence.first', 'gap.open', 'gap.close', 'observe.from', 'observe.alive', 'observe.to', 'module.set', 'question.seen', 'fewer.start', 'fewer.end', 'water.drink', 'notice.shown', 'block.exchange', 'cost.felt', 'routine.done'])

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
    answers: new Map(),
    closed: null,
    notRest: [],
    frozen: null,
    routines: new Map()
  }
  const fixes: Array<{ block: string; start: number | null; end: number | null; id: string; order: EventOrder }> = []
  const marks = new Map<string, boolean>()
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
        b.runs.push({ from: at, to: OPEN, bg: e.bg === true, begun: orderOf(e) })
        if (e.confirmUntil != null) b.confirms.push({ at, from: at, to: idx(e.confirmUntil), order: orderOf(e) })
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
        b.runs.push({ from: at, to: OPEN, bg: b.runs.at(-1)?.bg ?? false, begun: orderOf(e) })
        if (e.confirmUntil != null) b.confirms.push({ at, from: at, to: idx(e.confirmUntil), order: orderOf(e) })
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
        b.endOrder = orderOf(e)
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
        b.runs.push({ from: at, to: OPEN, bg: b.runs.at(-1)?.bg ?? false, begun: orderOf(e) })
        b.endedAt = null
        b.done = null
        b.endRule = null
        b.endId = null
        b.endOrder = null
        break
      }
      case 'block.fg': {
        const b = block(e.block)
        const run = openRun(b)
        if (!run || run.bg === (e.bg === true)) break
        const at = Math.max(run.from, idx(e.at))
        run.to = at
        b.runs.push({ from: at, to: OPEN, bg: e.bg === true, begun: orderOf(e) })
        break
      }
      case 'block.extend': {
        const b = block(e.block)
        b.extends.push({ at: idx(e.at), minutes: e.minutes })
        b.endChanges.push({ at: idx(e.at), minutes: e.minutes, order: orderOf(e) })
        break
      }
      case 'block.shorten':
        block(e.block).endChanges.push({ at: idx(e.at), minutes: -e.minutes, order: orderOf(e) })
        break
      case 'block.confirm': {
        const b = block(e.block)
        b.confirms.push({ at: idx(e.at), from: idx(e.at), to: OPEN, order: orderOf(e) })
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
        f.approvals.push({ at: idx(e.at), boundary: idx(e.boundary), auto: e.auto === true, plan: Array.isArray(e.plan) ? e.plan : null, undoneAt: null })
        break
      case 'boundary.undo':
        f.undos.push(idx(e.at))
        for (const a of f.approvals) a.undoneAt ??= idx(e.at)
        break
      case 'boundary.exception':
        f.exceptions.push({ at: idx(e.at), minutes: e.minutes })
        break
      case 'work.end':
        f.workEnds.push({ at: idx(e.at), end: idx(e.end), order: orderOf(e) })
        break
      case 'request.start': {
        if (requests.has(e.request)) {
          stale(e, 'prośba już się zaczęła')
          break
        }
        const r: RequestFact = { id: e.request, from: idx(e.at), to: OPEN, mode: e.mode, hardEndAt: e.hardEndAt ?? null, person: e.person ?? null, estimateMin: e.estimateMin ?? null, interrupts: e.interrupts ?? null, splits: Array.isArray(e.splits) ? e.splits.filter((x): x is string => typeof x === 'string') : [], endId: null, startT: e.t, endT: null, begun: orderOf(e) }
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
        if (!f.disconnect.some((d) => d.to === OPEN)) f.disconnect.push({ from: idx(e.at), to: OPEN, begun: orderOf(e) })
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
        if (!f.hardEndPass) f.hardEndPass = { at: idx(e.at), quiet: typeof e.quiet === 'boolean' ? e.quiet : null }
        break
      case 'question.seen':
        if (!f.seen.has(e.question)) f.seen.set(e.question, { at: e.at, c: e.c, how: e.how })
        break
      case 'question.answer':
        if (!f.answers.has(e.question)) f.answers.set(e.question, { at: e.at, answer: e.answer, value: e.value ?? null, order: orderOf(e) })
        break
      case 'ritual.close':
        f.closed = { at: idx(e.at), how: e.how }
        break
      case 'block.fix':
        fixes.push({ block: e.block, start: e.start ?? null, end: e.end ?? null, id: e.id, order: orderOf(e) })
        break
      case 'block.mark':
        marks.set(e.block, e.done)
        break
      case 'request.person': {
        const r = requests.get(e.request)
        if (r) r.person = e.person
        else stale(e, 'nie ma takiej prośby')
        break
      }
      case 'rest.not':
        if (e.to > e.from) f.notRest.push({ from: idx(e.from), to: idx(e.to), at: idx(e.at) })
        break
      case 'routine.done':
        f.routines.set(e.block, { id: e.id, at: e.at, routine: e.routine, version: e.version, steps: [...e.steps] })
        break
      case 'day.freeze': {
        const know: Record<string, number> = {}
        for (const [c, n] of Object.entries(e.know)) if (typeof n === 'number' && Number.isInteger(n)) know[c] = n
        const x: FrozenFact = { id: e.id, c: e.c, v: e.v, l: e.l, at: idx(e.at), how: e.how, know, missing: e.missing.filter((m): m is string => typeof m === 'string'), grade: e.grade }
        const was = f.frozen
        if (!was || betterFreeze(x, was)) f.frozen = x
        break
      }
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
  // Corrections of real times (spec „korekta”), after everything else and in their order: a start never at or after the
  // end of the block's first run, an end never at or before the start of its last run – one that does not fit is a
  // problem and changes nothing.
  for (const x of fixes) {
    const b = f.blocks.get(x.block)
    if (!b || b.startedAt == null || !b.runs.length) continue
    if (x.start != null) {
      const first = b.runs[0]!
      const s = idx(x.start)
      if (s < first.to) {
        first.from = s
        // The corrected instant, moved by the correction's own clock (`at + l − t`) – on the whole run, both halves of
        // one a request written in after the fact cut too.
        const was = first.begun
        const begun = { ...x.order, instant: x.order.instant - x.order.at + x.start, at: x.start }
        for (const r of b.runs) if (r.begun === was) r.begun = begun
        b.startedAt = s
      } else f.problems.push({ event: x.id, why: 'start po końcu bloku' })
    }
    if (x.end != null && b.endedAt != null) {
      const last = b.runs.at(-1)!
      const e = idx(x.end)
      if (e > last.from) {
        last.to = e
        b.endedAt = e
      } else f.problems.push({ event: x.id, why: 'koniec przed startem bloku' })
    }
  }
  for (const [id, done] of marks) {
    const b = f.blocks.get(id)
    if (b?.endedAt != null) b.done = done
  }
  f.snapshots.sort((a, b) => a.at - b.at)
  return f
}

/**
 * How far a block's planned end moved (minutes): its „Przedłuż” less its shortenings (D365) – those clicked before
 * `before` (index) when given. A plain sum, nothing cut to zero on the way: the order of the changes does not matter.
 */
export function endShiftOf(f: Pick<BlockFact, 'endChanges'>, before = Number.POSITIVE_INFINITY): number {
  let s = 0
  for (const x of f.endChanges) if (x.at < before) s += x.minutes
  return s
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
    endId: ended ? b.endId : null,
    endOrder: ended ? b.endOrder : null,
    confirms: b.confirms.filter((c) => c.at < m),
    extends: b.extends.filter((x) => x.at < m),
    endChanges: b.endChanges.filter((x) => x.at < m),
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
    approvals: f.approvals.filter((a) => a.at < m).map((a) => (a.undoneAt != null && a.undoneAt >= m ? { ...a, undoneAt: null } : a)),
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

/** The end of the block's last run (index) – where its work stopped, also while it is paused; null: none or running. */
export function lastRunEnd(b: BlockFact): number | null {
  if (!b.runs.length || b.runs.some((r) => r.to === OPEN)) return null
  return Math.max(...b.runs.map((r) => r.to))
}

/**
 * Work begun since a „Koniec pracy” `w` (its click: the index `w.at`, when it happened `w.order`; the end it confirmed
 * `w.end`): a run of a work block (`isWork`) begun by `until` (a minute index, inclusive – a stretch of work takes in an
 * empty run in its end minute, T507) whose event happened after the click (`compareOrder` – the instants on the logical
 * clock, so neither an event written later with an earlier instant nor a few seconds between two computers' clocks turn
 * it round), not by the minute both round to (T412): a block begun and ended by the click in one minute, or begun in the
 * background a few seconds before it, is no work since it; one begun after it in that minute is. A run that only
 * continues the block's run going on through the click (moved between the foreground and the background) began with that
 * run. The engine asks about the click's stretch (`until` – its end), the bar and „Odwołaj” about the whole day.
 */
export function workSince(f: DayFacts, w: WorkEndFact, isWork: (id: string) => boolean, until = OPEN): boolean {
  for (const [id, b] of f.blocks) {
    if (!isWork(id)) continue
    for (let i = 0; i < b.runs.length; i++) {
      const r = b.runs[i]!
      if (r.from > until) continue
      const first = b.runs[begunIndex(b.runs, i)]!
      if (compareOrder(first.begun, w.order) > 0) return true
    }
  }
  return false
}

/** The run a block's run `i` began with: back through the runs it continues by a switch of the foreground (runs are in order). */
function begunIndex(runs: readonly Run[], i: number): number {
  while (i > 0 && runs[i - 1]!.to === runs[i]!.from && runs[i - 1]!.bg !== runs[i]!.bg) i--
  return i
}

/**
 * How far the real start of a block's running stretch is off its minute (ms, only for the view – E4a.1; the day counts in
 * minutes, T412): the instant of the event that began its open run – back through switches of the foreground, one
 * stretch – minus that run's minute: a start at 10:46:32 counted from 10:47 is −28 s. 0 without an open run, or when the
 * run's minute is not its event's (a resume held at the end of its pause, the second half of a run a request written in
 * later cut).
 */
export function runShift(grid: Grid, b: BlockFact): number {
  const last = b.runs.length - 1
  if (last < 0 || b.runs[last]!.to !== OPEN) return 0
  const first = b.runs[begunIndex(b.runs, last)]!
  return idxOf(grid, first.begun.at) === first.from ? first.begun.at - atOf(grid, first.from) : 0
}

/** A request that runs now (not one written in after the fact). */
export const isRunningRequest = (r: Pick<RequestFact, 'to' | 'mode'>): boolean => r.to === OPEN && r.mode !== 'after'

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
