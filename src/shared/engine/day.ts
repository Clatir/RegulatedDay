/**
 * The engine of a day (spec „Model dnia”): budget, boundary, end of work, extension and overrun, regeneration, the
 * required minimum, bedtime, the hard end of projects and the pool – one function every view, the widget, the
 * notifications and the game read (spec principle 10). Pure and deterministic: the same plan and log give the same day
 * on every computer.
 *
 * How it counts: on the minute grid of the logical day (T412). The past is what the log says happened; from now on the
 * forecast of the plan stands in. Every minute is judged by the values in force when it began (T413) – what was known
 * before it, and the forecast from that minute – so later shifts of the bedtime or the hard end never change it. The
 * leader writes its classification of the minutes of work as segments; a written segment is the truth for its minutes
 * unless the log now holds a timer event its state of knowledge did not include, or a newer rules version counts them.
 */
import { compareEvents, isKnown, type AnyEvent, type DaySnapshot, type MinuteClass } from '../model/events'
import type { PlanBlock } from '../model/plan'
import type { DayTypeParams, RulesSettings } from '../model/settings'
import { placeLogical } from '../time/day'
import { addDays, weekday } from '../time/zone'
import { activityOf, type Activity } from './activity'
import { blockInfos, isBoundaryWork, plannedSpan, type BlockInfo } from './blocks'
import { EXPLAIN_END_RULES, explainMinutes, explainsOf, type Explain } from './explain'
import { OPEN, foldFacts, isPassive, isRunning, ranMinutes, viewAt, type DayFacts, type Segment } from './facts'
import { forecast, type Forecast, type Placed } from './forecast'
import { atOf, gridOf, idxOf, idxOfLogical, type Grid } from './grid'

/** How far past the day's end a block that runs through 04:00 may still be followed (it belongs to the day it began). */
const SPILL_MIN = 12 * 60

// Flags of a minute.
const F_END = 1 // work that sets the boundary and the end of work
const F_EXT = 2 // work whose minutes are classified (extension, overrun)
const F_SSOUT = 4 // the second shift outside its planned time (an extension, never an overrun)
const F_BUDGET = 8 // counts to the work budget
const F_SECOND = 16 // the second shift in its planned time
const F_PROJECT = 32
const F_LIFE = 64
const F_REGEN = 128 // a regeneration block in the foreground with no work beside it
const F_REQUEST = 256
const F_DISC = 512 // „Odcinam się”
const F_BLOCK = 1024 // not „time without a block”
const F_UPFRONT = 2048 // confirmed in advance (D253)
const F_FORECAST = 4096
const F_EXPLAIN = 8192 // time to explain (answered or not): the energy does not change in it
const F_TENT_REST = 16384 // time to explain after a work block without an answer: rest for the hard end and the pool (D262)
const F_FREE_REST = 32768 // a break of 10–30 min inside the time to explain after a project: rest (D281)
/** The flags that tell whether the day went as its forecast said. */
const SAME_MASK = 0xffff & ~F_FORECAST

/** What a minute of regeneration is (DayState.rest): a regeneration block, „Odcinam się”, time without a block; 0 none. */
export const REST_BLOCK = 1
export const REST_DISCONNECT = 2
export const REST_FREE = 3

/** The settings, the day type and its values in force at minute k: the day's snapshot, then each „od dziś” one before k. */
export function settingsAtMinute(snapshot: DaySnapshot, facts: DayFacts, k: number): { settings: RulesSettings; params: DayTypeParams; dayType: string } {
  let settings = snapshot.settings
  let dayType: string = snapshot.dayType
  for (const s of facts.snapshots) if (s.at < k || (k === 0 && s.at <= 0)) ((settings = s.settings), (dayType = s.dayType))
  const params = settings.dayTypes[dayType as keyof RulesSettings['dayTypes']] ?? snapshot.settings.dayTypes[snapshot.dayType]
  return { settings, params, dayType }
}

export interface DayContext {
  date: string
  snapshot: DaySnapshot
  /** The plan: the snapshot with your edits (dayPlan). */
  plan: readonly PlanBlock[]
  /** Today's wake time and tomorrow's (for the bedtime), logical minutes. */
  wakeMin: number
  nextWakeMin: number
  events: readonly AnyEvent[]
  now: number
  /** Typical length of a session of the layer (by the session's id), null = its whole window (fewer than 5 sessions). */
  typicalSessionMin?: Readonly<Record<string, number | null>>
  /**
   * The day as written (spec „Przy zamrożeniu niepotwierdzone dane przyjmowane są tak, jak zapisano”, the ritual's „Jak
   * zapisano”): time to explain after a work block without an answer is rest also toward the minimum (D265).
   */
  asWritten?: boolean
}

export interface MinuteInfo {
  cls: MinuteClass
  upfront: boolean
  /** Taken from a segment the leader wrote. */
  recorded: boolean
}

export interface WorkEnd {
  /** The end of work (index). */
  at: number
  confirmed: boolean
}

export interface HardEnd {
  /** The hard end (index); with `unreachable` it is now. */
  at: number
  /** No instant from now leaves enough regeneration before bedtime (the plan warns, the pool's second part is 0). */
  unreachable: boolean
}

export interface DayState {
  grid: Grid
  /** Index of now. */
  now: number
  blocks: BlockInfo[]
  facts: DayFacts
  settings: RulesSettings
  params: DayTypeParams
  /** The day's type in force now (after a change of type, the new one). */
  dayType: string
  wake: number
  firstWorkStart: number | null
  boundary: { proposal: number | null; approved: number | null; approvedAt: number | null; auto: boolean; max: number }
  ends: WorkEnd[]
  firstEnd: number | null
  /** The end of work now in force (null while work is open); in a day without work: the wake time. */
  workEnd: number | null
  noWorkDay: boolean
  /** Class of every minute of work after its start (index → info). */
  minutes: Map<number, MinuteInfo>
  budgetUsedMin: number
  /** The work budget of the day and what the forecast adds to the minutes used (spec „Budżet pracy”). */
  budget: { limitMin: number; forecastMin: number }
  extensionMin: number
  overrunMin: number
  projectsMin: number
  /** Work blocks counted as a project (D195: begun after the end of work, or marked „po pracy”), by id. */
  asProject: string[]
  /**
   * Regeneration so far (`totalMin`, `towardMinMin` – without time to explain that has no answer, unless `asWritten`),
   * the minimum and what is missing; `explainMin` – minutes of time to explain without an answer so far; `forecastMin` –
   * toward the minimum up to the bedtime with the plan's forecast (the ritual's effects in the evening).
   */
  regen: { totalMin: number; towardMinMin: number; requiredMin: number; justifiedRequestMin: number; missingMin: number; explainMin: number; forecastMin: number }
  /** Justified minutes of each request (spec „usprawiedliwione prośby”), by its id. */
  justifiedBy: Record<string, number>
  /** Times to explain (E6): after work and project blocks that ended by themselves. */
  explains: Explain[]
  bedtime: { base: number; shiftMin: number; overLimitMin: number; effective: number; forecast: number }
  hardEnd: HardEnd & { passed: number | null; message: boolean }
  pool: { min: number; byLimit: number; byTime: number; empty: boolean }
  forecast: Placed[]
  /** The forecast end of work (index), null in a day without work. */
  forecastWorkEnd: number | null
  /**
   * The last minute of work before the second shift (index): the past and the forecast – also while an end of work is in
   * force with work still to come (a last block paused by a request), as the variants compare it with the boundary.
   */
  lastWorkForecast: number | null
  /** The regeneration of every minute as known now – the past and the forecast (REST_*; 0: none). */
  rest: Uint8Array
  warnings: string[]
}

interface Ctx {
  g: Grid
  cap: number
  facts: DayFacts
  blocks: BlockInfo[]
  byId: Map<string, BlockInfo>
  snapshot: DaySnapshot
  settingsAt: (k: number) => { settings: RulesSettings; params: DayTypeParams; dayType: string }
  wake: number
  nextWake: number
  secondShiftStart: number
  /** Planned windows of the second shift's blocks. */
  secondWindows: Map<string, { start: number; end: number }>
  typical: (b: BlockInfo) => number | null
  noWorkPlanned: boolean
  events: readonly AnyEvent[]
  asWritten: boolean
}

/** The planned end of a started block: fixed sessions end at their window, others after their length and pauses. */
function plannedEndOf(c: Ctx, b: BlockInfo, startedAt: number, plannedMin: number, pausedMin: number, extendedMin: number): number {
  const span = plannedSpan(b, c.byId)
  if (b.rules.kind === 'session' && b.fixed && span) return Math.max(span.end, startedAt) + extendedMin
  return startedAt + plannedMin + pausedMin + extendedMin
}

/** Windows confirmed in advance of a block, from its start/resume confirmations and its „Przedłuż” (each from its click). */
function confirmWindows(c: Ctx, b: BlockInfo, facts: DayFacts): Array<{ at: number; from: number; to: number }> {
  const f = facts.blocks.get(b.id)
  if (!f || f.startedAt == null) return []
  const out = f.confirms.map((x) => ({ at: x.at, from: x.from, to: x.to === OPEN ? c.cap : x.to }))
  // „Dodaj bez wymiany”: from its start, up to its planned length (spec „Wymiana”).
  if (f.addConfirmedAt != null) out.push({ at: f.addConfirmedAt, from: f.startedAt, to: f.startedAt + (f.planned?.durationMin ?? b.durationMin) })
  let extended = 0
  for (const x of f.extends) {
    const paused = Math.max(0, x.at - f.startedAt - ranMinutes(f, x.at))
    const end = plannedEndOf(c, b, f.startedAt, f.planned?.durationMin ?? b.durationMin, paused, extended)
    out.push({ at: x.at, from: Math.max(end, x.at), to: end + x.minutes })
    extended += x.minutes
  }
  // A „Potwierdź” of a fixed block confirms it to its planned end with the extensions.
  for (const w of out) {
    if (w.to === c.cap) w.to = plannedEndOf(c, b, f.startedAt, f.planned?.durationMin ?? b.durationMin, 0, extended)
  }
  return out
}

/** The flags one block lays on a minute. */
function blockFlags(c: Ctx, b: BlockInfo, minute: number, asProject: boolean): number {
  if (b.isWork) {
    if (b.secondShift) {
      const w = c.secondWindows.get(b.id)
      const inside = w != null && minute >= w.start && minute < w.end
      return F_BLOCK | F_BUDGET | (inside ? F_SECOND : F_SSOUT | F_EXT)
    }
    if (asProject) return F_BLOCK | F_PROJECT
    if (b.rules.keepsRegen) return F_BUDGET
    if (b.afterWorkMark) return F_BLOCK | F_EXT
    return F_BLOCK | F_BUDGET | F_END | (b.lectureOrCommute ? 0 : F_EXT)
  }
  if (b.isProject) return F_BLOCK | F_PROJECT
  if (b.isRegen) return F_BLOCK | F_REGEN
  return F_BLOCK | F_LIFE
}

interface Span {
  block: BlockInfo
  from: number
  to: number
  bg: boolean
}

/**
 * The flags of minutes [from, to) from spans of blocks (the actual runs or the forecast). A session in the background
 * counts only while nothing runs in the foreground (D191, D202: rest begun during a session is rest; another block
 * begun during it counts once, as that block); other work in the background breaks a regeneration block.
 */
function paint(c: Ctx, flags: Uint16Array, from: number, to: number, spans: readonly Span[], projects: ReadonlySet<string>, extra = 0): void {
  const fg = new Uint8Array(Math.max(0, to - from))
  for (const s of spans) {
    if (s.bg) continue
    const a = Math.max(from, s.from)
    const z = Math.min(to, s.to)
    for (let k = a; k < z; k++) {
      flags[k]! |= blockFlags(c, s.block, k, projects.has(s.block.id)) | extra
      fg[k - from] = 1
    }
  }
  for (const s of spans) {
    if (!s.bg) continue
    const a = Math.max(from, s.from)
    const z = Math.min(to, s.to)
    const session = s.block.rules.kind === 'session'
    for (let k = a; k < z; k++) {
      if (session && fg[k - from]) continue
      const f = blockFlags(c, s.block, k, projects.has(s.block.id))
      // Background work (not „nie przerywa regeneracji”, not a session) takes a regeneration block's time away.
      if (f & F_END && !session) flags[k]! &= ~F_REGEN
      flags[k]! |= f | extra
    }
  }
}

/** The runs of the facts as spans (cut at `until`). */
function actualSpans(c: Ctx, facts: DayFacts, until: number): Span[] {
  const out: Span[] = []
  for (const b of c.blocks) {
    const f = facts.blocks.get(b.id)
    if (!f) continue
    for (const r of f.runs) {
      const to = Math.min(r.to === OPEN ? until : r.to, until, c.cap)
      if (to > r.from) out.push({ block: b, from: Math.max(0, r.from), to, bg: r.bg })
    }
  }
  return out
}

/** Requests and „Odcinam się” of the facts, cut at `until`. */
function paintRequests(c: Ctx, flags: Uint16Array, facts: DayFacts, until: number): void {
  for (const r of facts.requests) {
    const to = Math.min(r.to === OPEN ? until : r.to, until, c.cap)
    for (let k = Math.max(0, r.from); k < to; k++) flags[k]! |= F_REQUEST | F_BLOCK
  }
  for (const d of facts.disconnect) {
    const to = Math.min(d.to === OPEN ? until : d.to, until, c.cap)
    for (let k = Math.max(0, d.from); k < to; k++) flags[k]! |= F_DISC
  }
}

/**
 * A time to explain on the minutes (`plain`: the day without it). Without an answer it is neither work, nor a project,
 * nor rest – after a work block rest for the hard end and the pool (D262). Answered, it counts as the block would have
 * run („praca”, „projekt”, up to „… do”) or as time without a block („odpoczynek”); the energy never changes in it.
 * Breaks of 10–30 min inside it after a project are rest (D281).
 */
function paintExplain(c: Ctx, arr: Uint16Array, plain: Uint16Array, x: Explain, now: number, answered: boolean): void {
  const to = Math.min(x.to, now, c.cap)
  const info = c.byId.get(x.block)
  const a = answered ? x.answer : null
  for (let k = Math.max(0, x.from); k < to; k++) {
    let v = plain[k]!
    if (x.rests.some((r) => k >= r.from && k < r.to)) v |= F_FREE_REST
    else if (!a) v |= F_EXPLAIN | F_BLOCK | (x.kind === 'work' ? F_TENT_REST : 0)
    else if (a.cls === 'rest' || (a.until != null && k >= a.until)) v |= F_EXPLAIN
    else if (a.cls === 'project') v |= F_EXPLAIN | F_BLOCK | F_PROJECT
    // „praca” after the second shift counts as the second shift (outside its time: an extension, never the end of work).
    else if (info?.secondShift) v |= F_EXPLAIN | blockFlags(c, info, k, false)
    else v |= F_EXPLAIN | F_BLOCK | F_BUDGET | F_END | (info?.lectureOrCommute ? 0 : F_EXT)
    arr[k] = v
  }
}

/** Every time to explain, with the answers given before `answeredBefore` (index). */
function paintExplains(c: Ctx, arr: Uint16Array, plain: Uint16Array, list: readonly Explain[], now: number, answeredBefore: number): void {
  for (const x of list) paintExplain(c, arr, plain, x, now, x.answer != null && x.answer.at < answeredBefore)
}

/** Minutes confirmed in advance, while a work block runs in them. */
function paintUpfront(c: Ctx, flags: Uint16Array, facts: DayFacts, spans: readonly Span[], from: number, to: number): void {
  for (const b of c.blocks) {
    if (!b.isWork) continue
    const wins = confirmWindows(c, b, facts)
    const f = facts.blocks.get(b.id)
    // Added with „Dodaj bez wymiany” and not started yet: the forecast of it is confirmed in advance, up to its length.
    const notStarted = f?.addConfirmedAt != null && f.startedAt == null ? f.addConfirmedAt : null
    if (!wins.length && notStarted == null) continue
    for (const s of spans) {
      if (s.block !== b) continue
      const own = notStarted != null ? [{ at: notStarted, from: s.from, to: s.from + b.durationMin }] : []
      for (const w of [...wins, ...own]) {
        const a = Math.max(from, s.from, w.from, w.at)
        const z = Math.min(to, s.to, w.to)
        for (let k = a; k < z; k++) flags[k]! |= F_UPFRONT
      }
    }
  }
}

/**
 * Blocks waiting for „Zacznij” (a session, the weekly analysis) not started by the end of their wait (spec „Pierwszy
 * koniec pracy”): they do not make the day one without work and do not change the boundary – the planned end of the
 * last of them before the second shift (index), or null when none has expired (or one still may start).
 */
function expiredWaitEnd(c: Ctx, view: DayFacts, m: number): number | null {
  let last: number | null = null
  for (const b of c.blocks) {
    if (!b.waits || b.secondShift || !b.inPlan || !isBoundaryWork(b)) continue
    const span = plannedSpan(b, c.byId)
    if (!span || span.start >= c.secondShiftStart) continue
    const f = view.blocks.get(b.id)
    if (f?.startedAt != null || f?.cancelledAt != null || f?.parkedAt != null) continue
    const until = b.waitUntil ?? span.end
    if (until > m) return null
    last = Math.max(last ?? 0, span.end)
  }
  return last
}

/** Maximal stretches of minutes with `flag` set, within [0, until). */
function stretches(flags: Uint16Array, flag: number, until: number): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  let start = -1
  for (let k = 0; k <= until; k++) {
    const on = k < until && (flags[k]! & flag) !== 0
    if (on && start < 0) start = k
    if (!on && start >= 0) {
      out.push({ from: start, to: k })
      start = -1
    }
  }
  return out
}

/**
 * Valid ends of work as known at m (spec „Koniec pracy”, „Pierwszy koniec pracy”): a stretch of work ends with a
 * confirmation („Koniec pracy”, „Odcinam się”), or when after it no work block runs and none is left in the plan
 * before the second shift that can still start – a flexible or anchored one that did not start within 15 min of when
 * it was due no longer counts, a waiting one counts until its window ends. An end after which a fixed work block is
 * left is only a break. The end is the stretch's end, also when it becomes known later (regeneration is added back).
 */
function workEnds(c: Ctx, view: DayFacts, flags: Uint16Array, m: number, fcWindow: Forecast, projects: ReadonlySet<string>): WorkEnd[] {
  const runningWork = c.blocks.some((b) => {
    const f = view.blocks.get(b.id)
    return isBoundaryWork(b) && !projects.has(b.id) && !!f && isRunning(f)
  })
  const list = stretches(flags, F_END, m)
  if (runningWork && list.length && list.at(-1)!.to === m) list.pop()
  // „Koniec pracy” after work that never filled a minute (a block started and ended within one – a mistaken „Zacznij”):
  // an empty stretch at the end you confirmed, judged like any other (a fixed work block left makes it a break, T507).
  if (!list.length && !runningWork && view.workEnds.length && c.blocks.some((b) => isBoundaryWork(b) && !projects.has(b.id) && view.blocks.get(b.id)?.startedAt != null)) {
    const e = Math.min(...view.workEnds.map((w) => w.end))
    list.push({ from: e, to: e })
  }
  const out: WorkEnd[] = []
  const dueOf = new Map(fcWindow.placed.map((p) => [p.block.id, p.due]))
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    const e = s.to
    const next = list[i + 1]?.from ?? OPEN
    // Blocks of work left in the plan before the second shift as of e.
    let resolve = e
    let fixedLeft = false
    for (const b of c.blocks) {
      if (!isBoundaryWork(b) || !b.inPlan) continue
      const span = plannedSpan(b, c.byId)
      if (span && span.start >= c.secondShiftStart) continue
      const f = view.blocks.get(b.id)
      if (f?.endedAt != null && f.endedAt <= e) continue
      if (f?.startedAt != null && f.startedAt < e && f.endedAt != null) continue
      if (f?.startedAt != null && f.startedAt < s.from) {
        // Started before this stretch and not ended (paused): it is left, due from e.
        if (f.endedAt == null && !isRunning(f)) resolve = Math.max(resolve, e + 15 <= m ? e + 15 : OPEN)
        continue
      }
      if (f?.startedAt != null && f.startedAt < e) continue // it ran in this stretch
      const gone = f?.parkedAt ?? f?.cancelledAt ?? null
      if (b.fixed && !b.waits) {
        if (!span || span.end <= e) continue
        if (f?.startedAt != null) {
          resolve = Math.max(resolve, OPEN)
          fixedLeft = true
        } else if (gone != null) resolve = Math.max(resolve, gone)
        else if (span.end <= m) resolve = Math.max(resolve, span.end)
        else {
          resolve = OPEN
          fixedLeft = true
        }
        continue
      }
      if (b.waits) {
        if (!span) continue
        const until = b.waitUntil ?? span.end
        if (until <= e) continue
        if (f?.startedAt != null) resolve = OPEN
        else if (gone != null) resolve = Math.max(resolve, Math.min(gone, until))
        else resolve = Math.max(resolve, until <= m ? until : OPEN)
        if (b.fixed && resolve === OPEN) fixedLeft = true
        continue
      }
      const due = Math.max(dueOf.get(b.id) ?? span?.start ?? e, e)
      const expiry = due + 15
      if (f?.startedAt != null) resolve = f.startedAt >= expiry ? Math.max(resolve, expiry) : OPEN
      else if (gone != null) resolve = Math.max(resolve, Math.min(gone, expiry))
      else resolve = Math.max(resolve, expiry <= m ? expiry : OPEN)
    }
    // „Koniec pracy” (or „Odcinam się”) clicked in this stretch ends it; clicked after it, before work came back, confirms it.
    const confirmed = view.workEnds.some((w) => w.end >= s.from && w.end < next) || view.disconnect.some((d) => d.from >= s.from && d.from < next)
    if (confirmed && !fixedLeft) out.push({ at: e, confirmed: true })
    else if (resolve <= Math.min(m, next)) out.push({ at: e, confirmed: false })
  }
  return out
}

export function computeDay(ctx: DayContext): DayState {
  const g = gridOf(ctx.date)
  const cap = g.length + SPILL_MIN
  const events = [...ctx.events].sort(compareEvents)
  const facts = foldFacts(g, events)
  const now = Math.max(0, Math.min(cap, idxOf(g, ctx.now)))
  const snapshot = ctx.snapshot
  const settingsAt = (k: number) => settingsAtMinute(snapshot, facts, k)
  const blocks = blockInfos(g, ctx.plan, facts, snapshot.settings)
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const secondWindows = new Map<string, { start: number; end: number }>()
  for (const b of blocks) {
    if (!b.secondShift) continue
    const s = plannedSpan(b, byId)
    if (s) secondWindows.set(b.id, s)
  }
  const secondStarts = blocks.filter((b) => b.secondShift && b.start != null).map((b) => b.start!)
  const c: Ctx = {
    g,
    cap,
    facts,
    blocks,
    byId,
    snapshot,
    settingsAt,
    wake: idxOfLogical(g, ctx.wakeMin),
    nextWake: idxOf(g, placeLogical(addDays(ctx.date, 1), ctx.nextWakeMin)),
    secondShiftStart: secondStarts.length ? Math.min(...secondStarts) : OPEN,
    secondWindows,
    typical: (b) => (b.origin === 'session' && b.sourceId ? (ctx.typicalSessionMin?.[b.sourceId] ?? null) : null),
    noWorkPlanned: !snapshot.blocks.some((p) => {
      const r = snapshot.settings.categories[p.categoryId]
      return r?.cls === 'work' && !r.keepsRegen && p.tag !== 'secondShift'
    }),
    events,
    asWritten: ctx.asWritten === true
  }

  // The actual flags of the past, with the blocks counted as projects (D195) decided at their start.
  const projects = new Set<string>()
  for (const b of blocks) if (b.isWork && !b.secondShift && b.afterWorkMark) projects.add(b.id)
  let actual = new Uint16Array(cap)
  const paintActual = () => {
    actual = new Uint16Array(cap)
    const spans = actualSpans(c, facts, now)
    paint(c, actual, 0, now, spans, projects)
    paintRequests(c, actual, facts, now)
    paintUpfront(c, actual, facts, spans, 0, now)
  }
  paintActual()
  // A block of a category „po końcu pracy jak projekt” begun after the first end of work counts as a project.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const b of blocks) {
      if (!b.isWork || !b.rules.afterWorkAsProject || b.secondShift || projects.has(b.id)) continue
      const f = facts.blocks.get(b.id)
      if (f?.startedAt == null || f.startedAt >= now) continue
      const at = f.startedAt
      const view = viewAt(facts, at)
      const fc = forecast({ blocks, view, m: at, mode: 'window', transitionBufferMin: settingsAt(at).settings.transitionBufferMin, typicalMin: c.typical })
      const before = new Uint16Array(actual)
      for (let k = at; k < cap; k++) before[k] = 0
      if (workEnds(c, view, before, at, fc, projects).length) {
        projects.add(b.id)
        changed = true
      }
    }
    if (!changed) break
    paintActual()
  }

  const firstWorkStart = (() => {
    for (let k = 0; k < now; k++) if (actual[k]! & F_END) return k
    return null
  })()

  // Boundary and maximum at m (spec „Granica i koniec pracy”).
  const maxAt = (m: number, view: DayFacts, fc: Forecast): number => {
    const { settings, params, dayType } = settingsAt(m)
    // A change of type fixes the maximum from its instant (the new type's, moved by the blocks it kept – spec „Zmiana typu
    // w trakcie dnia”); exceptions made after it move that one.
    const fixed = [...view.snapshots].reverse().find((s) => s.reason === 'type' && s.max != null)
    const base = fixed ? fixed.max! : idxOfLogical(g, m > 0 && view.snapshots.length ? params.maxMin : snapshot.maxMin)
    const extra = Math.min(settings.exceptionMaxMin, view.exceptions.filter((x) => !fixed || x.at >= fixed.at).reduce((s, x) => s + x.minutes, 0))
    let max = base + extra
    const buffer = settings.boundaryBufferMin
    // A fixed block of the plan of lectures or a „zjazd” ending after the maximum moves it to its end plus the buffer.
    for (const b of blocks) {
      if (!b.lectureOrCommute || !b.fixed || b.rules.keepsRegen) continue
      const span = plannedSpan(b, byId)
      if (span && span.end > max) max = Math.max(max, span.end + buffer)
    }
    // A session of the layer on a day that by default has none moves it to the session's end (with blocks anchored to it).
    const layer = (settings.dayTypes[dayType as keyof RulesSettings['dayTypes']] ?? snapshot.settings.dayTypes[snapshot.dayType]).sessions[weekday(ctx.date) - 1]
    if (layer === 'no') {
      for (const p of fc.placed) {
        if (p.block.origin !== 'session') continue
        let end = p.block.start != null ? p.block.start + p.block.durationMin : p.to
        for (const q of fc.placed) if (q.block.anchor === p.block.id) end = Math.max(end, q.to)
        max = Math.max(max, end + buffer)
      }
    }
    return max
  }
  /** The end of the last work block before the second shift, by the window forecast and the past (index). */
  const lastWorkEnd = (m: number, flags: Uint16Array, fc: Forecast): number | null => {
    let last: number | null = null
    for (let k = 0; k < Math.min(m, c.secondShiftStart); k++) if (flags[k]! & F_END) last = k + 1
    for (const p of fc.placed) {
      if (!isBoundaryWork(p.block) || p.to <= m || projects.has(p.block.id)) continue
      if (p.from >= c.secondShiftStart) continue
      last = Math.max(last ?? 0, p.to)
    }
    return last
  }
  const proposalAt = (m: number, view: DayFacts, flags: Uint16Array, fcW: Forecast): number | null => {
    // Waiting blocks that expired unstarted keep their place in the proposal (they do not change the boundary).
    const worked = lastWorkEnd(m, flags, fcW)
    const waited = expiredWaitEnd(c, view, m)
    const end = worked == null ? waited : waited == null ? worked : Math.max(worked, waited)
    if (end == null) return null
    return Math.min(maxAt(m, view, fcW), end + settingsAt(m).settings.boundaryBufferMin)
  }
  // The approval: the last one written (not undone after it), else on its own at the start of the first work block.
  let implicit: { at: number; boundary: number } | null = null
  if (firstWorkStart != null && !facts.approvals.some((a) => a.at <= firstWorkStart)) {
    const view = viewAt(facts, firstWorkStart)
    const fcW = forecast({ blocks, view, m: firstWorkStart, mode: 'window', transitionBufferMin: settingsAt(firstWorkStart).settings.transitionBufferMin, typicalMin: c.typical })
    const p = proposalAt(firstWorkStart, view, actual, fcW)
    if (p != null) implicit = { at: firstWorkStart, boundary: p }
  }
  const approvedAtSlow = (m: number): { boundary: number; at: number; auto: boolean } | null => {
    let found: { boundary: number; at: number; auto: boolean } | null = null
    for (const a of facts.approvals) if (a.at < m || (a.at === 0 && m === 0)) found = { boundary: a.boundary, at: a.at, auto: a.auto }
    const undone = found ? facts.undos.some((u) => u >= found!.at && u < m) : false
    if (found && !undone) return found
    if (!found && implicit && implicit.at <= m && !facts.undos.some((u) => u < m)) return { boundary: implicit.boundary, at: implicit.at, auto: true }
    return null
  }
  // The approval in force at every minute, once (it is read per minute of regeneration).
  const approvals: Array<{ boundary: number; at: number; auto: boolean } | null> = new Array(cap + 2)
  for (let k = 0; k < cap + 2; k++) approvals[k] = approvedAtSlow(k)
  const approvedAt = (m: number) => approvals[Math.max(0, Math.min(cap + 1, m))] ?? null

  // The classification of minutes, done in order: every minute by the values in force when it began.
  const minutes = new Map<number, MinuteInfo>()
  const segmentFor = recordedSegments(c, facts)
  let ext = 0
  let overrun = 0
  let shift = 0
  let overLimit = 0
  const shiftLimit = (m: number) => {
    const { settings } = settingsAt(m)
    const base = baseBedtime(m)
    const latest = idxOfLogical(g, 27 * 60 + 59)
    return Math.max(0, Math.min(settings.bedtimeShiftMaxMin, latest - base))
  }
  const bedtimeOf = (settings: RulesSettings, params: DayTypeParams) => Math.min(idxOfLogical(g, params.bedtimeMin), c.nextWake - settings.targetSleepMin)
  const baseBedtime = (m: number): number => {
    // The day's snapshot, then each later one in force at m: a change that shortens tonight (a type, settings „od dziś”)
    // never puts the bedtime before its own instant (nor later than it was); one that does not shorten it changes
    // nothing of that rule – a bedtime already passed stays where it was.
    let base = bedtimeOf(snapshot.settings, snapshot.settings.dayTypes[snapshot.dayType])
    for (const s of facts.snapshots) {
      if (!(s.at < m || (m === 0 && s.at <= 0))) break
      const next = bedtimeOf(s.settings, s.settings.dayTypes[s.dayType] ?? snapshot.settings.dayTypes[snapshot.dayType])
      base = next < base ? Math.max(next, Math.min(base, s.at)) : next
    }
    return base
  }

  // Time to explain (E6): known once the projects are; its end at the effective bedtime with the moves the leader wrote.
  const silentEnds = [...facts.blocks.values()].some((f) => f.endRule != null && EXPLAIN_END_RULES.includes(f.endRule))
  const activity: Activity | null = silentEnds ? activityOf(events, g.start, ctx.now) : null
  const recordedShift = (k: number): number => {
    let s = 0
    for (let x = 0; x < Math.min(k, now); x++) {
      const seg = segmentFor(x)
      if (seg?.cls === 'empty' && seg.upfront) s++
    }
    return Math.min(s, shiftLimit(k))
  }
  const explains = activity ? explainsOf({ grid: g, facts, blocks, projects, events, activity, now, bedtime: (k) => baseBedtime(k) + recordedShift(k) }) : []
  // `actual` holds every answer; `known` is the day as it was known at the minute the loop below judges – an answer
  // counts from the minute after it (T413), so it never makes the hard end pass back in time (D262).
  const plain = actual.slice()
  paintExplains(c, actual, plain, explains, now, Number.POSITIVE_INFINITY)
  const known = plain.slice()
  paintExplains(c, known, plain, explains, now, -1)
  const pendingAnswers = explains.filter((x) => x.answer).sort((a, b) => a.answer!.at - b.answer!.at)
  const hadInput = (k: number): boolean => !activity || !activity.idle.some((i) => i.from <= atOf(g, k) && i.to >= atOf(g, k + 1))

  // State of the day at the start of minute m (what the leader would have shown then).
  const evaluate = (m: number, bedtimeShift: number, simulateShifts: boolean, inclusive = false, flags: Uint16Array = actual) =>
    evaluateAt(
      c,
      m,
      now,
      flags,
      projects,
      {
        approvedAt: (k) => approvedAt(inclusive && k === m ? k + 1 : k),
        proposalAt,
        maxAt,
        baseBedtime,
        shiftLimit,
        bedtimeShift,
        extBefore: ext,
        simulateShifts
      },
      inclusive
    )

  let passed: number | null = facts.hardEndPass?.at ?? null
  let message = false
  /** The hard end reached in time to explain after a project without input: it passes at the next input in it. */
  let atInput = false
  const hardEndCheckFrom = Math.max(0, Math.min(c.wake, firstWorkStart ?? c.wake))
  let nextHardCheck = hardEndCheckFrom
  // Minutes from which the view changes: the minute after each event that is not only presence (T413).
  const eventMinutes = [...new Set(events.filter((e) => !isPassive(e)).map((e) => idxOf(g, eventInstant(e)) + 1))].sort((a, b) => a - b)
  const nextEventFrom = (k: number): number => {
    for (const e of eventMinutes) if (e > k) return e
    return OPEN
  }
  const requestStarts = new Map<number, typeof facts.requests>()
  for (const r of facts.requests) if (r.hardEndAt == null) requestStarts.set(r.from, [...(requestStarts.get(r.from) ?? []), r])
  for (let k = 0; k < now; k++) {
    // Answers to times to explain given before this minute are known from it on.
    while (pendingAnswers.length && pendingAnswers[0]!.answer!.at < k) paintExplain(c, known, plain, pendingAnswers.shift()!, now, true)
    const f = actual[k]!
    const fk = known[k]!
    const classifiable = (f & (F_EXT | F_SSOUT)) !== 0
    let ev: ReturnType<typeof evaluate> | null = null
    // A request without the hard end written at its start gets the one in force then (T82: requests are classified once).
    const starting = requestStarts.get(k)
    if (starting) {
      const at = evaluate(k, shift, true, false, known)
      const he = passed != null ? passed : at.hardEnd.at
      for (const r of starting) r.hardEndAt = g.start + he * 60_000
    }
    if (classifiable) {
      const seg = segmentFor(k)
      let info: MinuteInfo
      if (seg) info = { cls: seg.cls, upfront: seg.upfront, recorded: true }
      else {
        const appr = approvedAt(k)
        if (!appr || k < appr.boundary) info = { cls: 'in', upfront: (f & F_UPFRONT) !== 0, recorded: false }
        else {
          ev = evaluate(k, shift, false, false, known)
          const empty = ev.pool.min <= 0
          const pastMax = k >= ev.max && !(f & F_SSOUT)
          info = { cls: empty ? 'empty' : pastMax ? 'max' : 'after', upfront: (f & F_UPFRONT) !== 0, recorded: false }
        }
      }
      minutes.set(k, info)
      if (info.cls !== 'in') ext++
      if (info.cls === 'max' || info.cls === 'empty') overrun++
      if (info.cls === 'empty' && info.upfront) {
        if (shift < shiftLimit(k)) shift++
        else overLimit++
      }
    }
    // The hard end passes when the clock reaches it and no rest and no request goes on or begins in that minute; time to
    // explain after a work block moves it like rest (D255, D262). In time to explain after a project it passes at the
    // first input from the minute it would have passed (D250): a gap in input only puts it off.
    const explainProject = (fk & F_EXPLAIN) !== 0 && (fk & (F_TENT_REST | F_END | F_PROJECT)) === 0
    // Passed as the leader wrote it: its message as the day was known in that minute.
    if (facts.hardEndPass?.at === k) message = (fk & F_PROJECT) !== 0 || explainProject
    if (passed == null && atInput) {
      if (explainProject && !(fk & F_REQUEST)) {
        if (hadInput(k)) {
          passed = k
          message = true
        }
        nextHardCheck = k + 1
      } else atInput = false
    }
    if (passed == null && !atInput && k >= nextHardCheck) {
      ev = evaluate(k, shift, true, false, known)
      if (!ev.hardEnd.unreachable && k >= ev.hardEnd.at) {
        const rest = (fk & (F_REGEN | F_DISC | F_TENT_REST)) !== 0 || (fk & F_BLOCK) === 0
        if (!rest && !(fk & F_REQUEST)) {
          if (explainProject && !hadInput(k)) atInput = true
          else {
            passed = k
            message = (fk & F_PROJECT) !== 0 || explainProject
          }
        }
        nextHardCheck = k + 1
      } else {
        // Until the hard end (while it is unreachable: ever) nothing can make it pass unless an event comes or the day
        // departs from the forecast made now – the next minute worth a look (T414).
        let j = ev.hardEnd.unreachable ? now : Math.min(ev.hardEnd.at, now)
        j = Math.min(j, nextEventFrom(k))
        if (pendingAnswers.length) j = Math.min(j, pendingAnswers[0]!.answer!.at + 1)
        // Time to explain is never in the forecast, yet before the hard end judged now it cannot make it come sooner (it
        // only adds to what was collected, or nothing): its minutes are compared without it – a planned block that did not
        // start in it still departs from the forecast.
        for (let x = k; x < j; x++) {
          const kx = known[x]!
          if (((kx & (F_EXPLAIN | F_FREE_REST) ? plain[x]! : kx) ^ ev.flags[x]!) & SAME_MASK) {
            j = x
            break
          }
        }
        nextHardCheck = Math.max(k + 1, j)
      }
    }
  }

  const fin = evaluate(now, shift, true, true)
  let explainMin = 0
  for (const x of explains) if (!x.answer) explainMin += explainMinutes(x, now)
  let budget = 0
  let projectsMin = 0
  for (let k = 0; k < now; k++) {
    if (actual[k]! & (F_BUDGET | F_SECOND)) budget++
    if (actual[k]! & F_PROJECT) projectsMin++
  }
  const { settings, params, dayType } = settingsAt(now)
  const effective = baseBedtime(now) + shift
  const hardPassed = passed != null
  const warnings: string[] = []
  if (fin.hardEnd.unreachable) warnings.push('minimum regeneracji nie mieści się przed porą snu')
  if (fin.forecastWorkEnd != null && fin.forecastWorkEnd > fin.max) warnings.push('praca kończy się po maksimum')
  if (!fin.hardEnd.unreachable && fin.forecastWorkEnd != null && fin.hardEnd.at < fin.forecastWorkEnd) warnings.push('twardy koniec przed końcem pracy')
  if (budget + fin.forecastBudgetMin > fin.budgetMin) warnings.push('budżet pracy przekroczony')
  return {
    grid: g,
    now,
    blocks,
    facts,
    settings,
    params,
    dayType,
    wake: c.wake,
    firstWorkStart,
    boundary: { proposal: fin.proposal, approved: fin.approved?.boundary ?? null, approvedAt: fin.approved?.at ?? null, auto: fin.approved?.auto ?? false, max: fin.max },
    ends: fin.ends,
    firstEnd: fin.ends[0]?.at ?? (fin.noWork ? c.wake : null),
    workEnd: fin.workEnd,
    noWorkDay: fin.noWork,
    minutes,
    budgetUsedMin: budget,
    budget: { limitMin: fin.budgetMin, forecastMin: fin.forecastBudgetMin },
    extensionMin: ext,
    overrunMin: overrun,
    projectsMin,
    asProject: [...projects],
    regen: { totalMin: fin.regenTotal, towardMinMin: fin.towardMin, requiredMin: fin.required, justifiedRequestMin: fin.justified, missingMin: Math.max(0, fin.required - fin.towardMin), explainMin, forecastMin: fin.towardForecast },
    justifiedBy: fin.justifiedBy,
    explains,
    bedtime: { base: baseBedtime(now), shiftMin: shift, overLimitMin: overLimit, effective, forecast: fin.bedtimeForecast },
    hardEnd: { at: hardPassed ? passed! : fin.hardEnd.at, unreachable: !hardPassed && fin.hardEnd.unreachable, passed, message },
    pool: hardPassed ? { min: 0, byLimit: fin.pool.byLimit, byTime: 0, empty: true } : { ...fin.pool, empty: fin.pool.min <= 0 },
    forecast: fin.forecast,
    forecastWorkEnd: fin.forecastWorkEnd,
    lastWorkForecast: fin.lastWorkForecast,
    rest: fin.rest,
    warnings
  }
}

/**
 * The segments the leader writes now (spec „Klasyfikację minut zapisuje komputer prowadzący”): minutes of work in
 * [from, to) not yet written, joined while their class and confirmation stay the same, each with the state of knowledge
 * the computation had (the last event of each computer). Instants, ready for 'minutes' events.
 */
export function newSegments(state: DayState, from: number, to: number): Array<{ from: number; to: number; cls: MinuteClass; upfront: boolean; know: Record<string, number> }> {
  const out: Array<{ from: number; to: number; cls: MinuteClass; upfront: boolean; know: Record<string, number> }> = []
  const at = (idx: number) => state.grid.start + idx * 60_000
  let open: { from: number; to: number; cls: MinuteClass; upfront: boolean } | null = null
  const close = () => {
    if (open) out.push({ from: at(open.from), to: at(open.to), cls: open.cls, upfront: open.upfront, know: { ...state.facts.know } })
    open = null
  }
  for (let k = Math.max(0, idxOf(state.grid, from)); k < Math.min(state.now, idxOf(state.grid, to)); k++) {
    const info = state.minutes.get(k)
    if (!info || info.recorded) {
      close()
      continue
    }
    if (open && open.to === k && open.cls === info.cls && open.upfront === info.upfront) open.to = k + 1
    else {
      close()
      open = { from: k, to: k + 1, cls: info.cls, upfront: info.upfront }
    }
  }
  close()
  return out
}

/** Valid segments of the leader for a minute: newest rules first, then the widest knowledge; stale ones never. */
function recordedSegments(c: Ctx, facts: DayFacts): (k: number) => Segment | null {
  if (!facts.segments.length) return () => null
  // A segment is stale when the log holds a timer event of a computer, from before its end, it did not know.
  const late = c.events.filter((e) => isKnown(e) && !isPassive(e))
  const fresh = facts.segments.filter((s) => !late.some((e) => (e.n > (s.know[e.c] ?? -1)) && idxOf(c.g, eventInstant(e)) < s.to))
  const covers = (a: Segment, b: Segment) => Object.entries(b.know).every(([cid, n]) => (a.know[cid] ?? -1) >= n)
  return (k) => {
    let best: Segment | null = null
    for (const s of fresh) {
      if (k < s.from || k >= s.to) continue
      if (!best || s.v > best.v || (s.v === best.v && covers(s, best) && !covers(best, s)) || (s.v === best.v && covers(s, best) === covers(best, s) && s.l < best.l)) best = s
    }
    return best
  }
}

function eventInstant(e: AnyEvent): number {
  const r = e as unknown as Record<string, unknown>
  return typeof r.at === 'number' ? r.at : typeof r.from === 'number' ? r.from : e.t
}

interface EvalDeps {
  approvedAt: (m: number) => { boundary: number; at: number; auto: boolean } | null
  proposalAt: (m: number, view: DayFacts, flags: Uint16Array, fcW: Forecast) => number | null
  maxAt: (m: number, view: DayFacts, fc: Forecast) => number
  baseBedtime: (m: number) => number
  shiftLimit: (m: number) => number
  /** Minutes the bedtime has moved by minutes before m. */
  bedtimeShift: number
  extBefore: number
  /** Add the moves of minutes already confirmed for later (the bedtime's forecast, spec „Twardy koniec”). */
  simulateShifts: boolean
}

interface Evaluation {
  max: number
  proposal: number | null
  approved: { boundary: number; at: number; auto: boolean } | null
  ends: WorkEnd[]
  workEnd: number | null
  noWork: boolean
  forecastWorkEnd: number | null
  lastWorkForecast: number | null
  regenTotal: number
  towardMin: number
  /** Toward the minimum up to the bedtime: the past and the forecast. */
  towardForecast: number
  required: number
  justified: number
  justifiedBy: Record<string, number>
  bedtimeForecast: number
  hardEnd: HardEnd
  pool: { min: number; byLimit: number; byTime: number }
  forecast: Placed[]
  budgetMin: number
  forecastBudgetMin: number
  /** The minutes as evaluated: the past before m, the forecast from m. */
  flags: Uint16Array
  /** Regeneration per minute (REST_*). */
  rest: Uint8Array
}

/**
 * The day at the start of minute m: the past before m with the forecast from m. `inclusive`: with the events of minute m
 * itself (the state shown now, right after a click).
 */
function evaluateAt(c: Ctx, m: number, now: number, actual: Uint16Array, projects: ReadonlySet<string>, d: EvalDeps, inclusive = false): Evaluation {
  const { g, cap } = c
  const { settings, params } = c.settingsAt(inclusive ? m + 1 : m)
  const view = viewAt(c.facts, inclusive ? m + 1 : m)
  const fcW = forecast({ blocks: c.blocks, view, m, mode: 'window', transitionBufferMin: settings.transitionBufferMin, typicalMin: c.typical })
  const fcT = forecast({ blocks: c.blocks, view, m, mode: 'typical', transitionBufferMin: settings.transitionBufferMin, typicalMin: c.typical })

  // The combined minutes: the past as it happened, the forecast from m.
  const flags = new Uint16Array(cap)
  flags.set(actual.subarray(0, Math.min(m, now)))
  const spans: Span[] = fcT.placed.map((p) => ({ block: p.block, from: Math.max(p.from, m), to: Math.min(p.to, cap), bg: p.bg }))
  // In the forecast a block of „po końcu pracy jak projekt” is work unless it has the mark „po pracy” (D209) – the marked
  // ones are already counted as projects; one begun after an end of work became a project at its start.
  const fcProjects = projects
  const workEndForecast = (() => {
    let last: number | null = null
    for (let k = 0; k < Math.min(m, c.secondShiftStart); k++) if (flags[k]! & F_END) last = k + 1
    for (const p of fcT.placed) if (isBoundaryWork(p.block) && !fcProjects.has(p.block.id) && p.from < c.secondShiftStart && p.to > m) last = Math.max(last ?? 0, p.to)
    return last
  })()
  paint(c, flags, m, cap, spans, fcProjects, F_FORECAST)
  // Requests of the past; a running one is ended now in the forecast (spec „Biegnąca prośba … kończona teraz”) – an urgent
  // one runs to its estimate (spec „pilne: … prognoza … znane od razu”), as the forecast places the blocks after it.
  paintRequests(c, flags, view, m)
  for (const r of view.requests) if (r.to === OPEN && r.mode === 'urgent' && r.estimateMin != null) for (let k = m; k < Math.min(r.from + r.estimateMin, cap); k++) flags[k]! |= F_REQUEST | F_BLOCK | F_FORECAST
  paintUpfront(c, flags, view, spans, m, cap)

  const ends = workEnds(c, view, flags, m, fcW, fcProjects)
  // No other work before the second shift (past nor forecast) and the waiting blocks expired unstarted: their planned
  // end is the first end of work until the ritual (spec „Pierwszy koniec pracy”).
  if (!ends.length) {
    let anyEnd = false
    for (let k = 0; k < Math.min(cap, c.secondShiftStart) && !anyEnd; k++) if (flags[k]! & F_END) anyEnd = true
    const waited = anyEnd ? null : expiredWaitEnd(c, view, m)
    if (waited != null) ends.push({ at: waited, confirmed: false })
  }
  // A block parked or cancelled before it began is no work of the plan any more (a change of type, „Koniec pracy”).
  const gone = (id: string) => {
    const f = view.blocks.get(id)
    return f != null && f.startedAt == null && (f.parkedAt != null || f.cancelledAt != null)
  }
  const anyWork = c.blocks.some((b) => isBoundaryWork(b) && ((b.inPlan && !gone(b.id)) || view.blocks.get(b.id)?.startedAt != null)) || (() => {
    for (let k = 0; k < m; k++) if (flags[k]! & F_END) return true
    return false
  })()
  const noWork = !anyWork
  const firstWork = (() => {
    for (let k = 0; k < cap; k++) if (flags[k]! & F_END) return k
    return null
  })()

  // After an end of work (and until work comes back) time without a block is regeneration; in a day without work from
  // the wake time; a day planned without work keeps the time before an added work block as regeneration.
  const after = new Uint8Array(cap)
  {
    const endSet = new Set(ends.map((e) => e.at))
    let state = noWork ? 1 : 0
    const projectedEnd = workEndForecast != null && workEndForecast >= m && !ends.some((e) => e.at >= workEndForecast) ? workEndForecast : null
    for (let k = 0; k < cap; k++) {
      if (k < c.wake) {
        after[k] = 0
        continue
      }
      if (c.noWorkPlanned && firstWork != null && k < firstWork) {
        after[k] = 1
        continue
      }
      if (endSet.has(k) || (projectedEnd != null && k === projectedEnd)) state = 1
      if (flags[k]! & F_END) state = 0
      after[k] = state
    }
  }

  // Regeneration per minute; gaps of 30 min between blocks before the end of work.
  const regen = new Uint8Array(cap)
  {
    let k = 0
    let seenBlock = false
    while (k < cap) {
      const f = flags[k]!
      if (f & F_BLOCK || f & F_DISC) {
        if (f & F_BLOCK) seenBlock = true
        if (!(f & F_REQUEST) && (f & F_DISC || f & F_REGEN)) regen[k] = f & F_DISC ? REST_DISCONNECT : REST_BLOCK
        k++
        continue
      }
      // A stretch of time without a block.
      let z = k
      while (z < cap && !(flags[z]! & (F_BLOCK | F_DISC))) z++
      const between = seenBlock && z < cap
      for (let j = k; j < z; j++) {
        if (j < c.wake) continue
        if (after[j] || (between && z - k >= 30) || flags[j]! & F_FREE_REST) regen[j] = REST_FREE
      }
      k = z
    }
  }

  // Justified requests (spec „Wymagane minimum”): begun at the hard end in force at their start or later, in time that
  // would be regeneration, or breaking a regeneration block or „Odcinam się”; split at the hard end.
  let justified = 0
  const justifiedBy: Record<string, number> = {}
  for (const r of view.requests) {
    const to = Math.min(r.to === OPEN ? m : r.to, m)
    const he = r.hardEndAt != null ? idxOf(g, r.hardEndAt) : null
    for (let k = r.from; k < to; k++) {
      const f = flags[k]!
      const broke = (f & F_DISC) !== 0 || (r.from > 0 && (flags[r.from - 1]! & F_REGEN) !== 0 && !(f & (F_END | F_PROJECT)))
      const wouldRest = after[k] === 1 && !(f & (F_END | F_PROJECT | F_LIFE | F_SECOND))
      if (broke || (he != null && k >= he && wouldRest)) {
        justified++
        justifiedBy[r.id] = (justifiedBy[r.id] ?? 0) + 1
      }
    }
  }
  // A switch to a regeneration day fixes the minimum it asks (counted once at the switch, spec „Zmiana typu”); a later
  // change of type asks its own type's.
  const fixedMin = [...view.snapshots].reverse().find((s) => s.reason === 'type')?.minRegen ?? null
  const required = Math.max(0, (fixedMin ?? params.minRegenMin) - justified)

  // The bedtime: base plus the moves of minutes before m; with `simulateShifts` also of minutes confirmed for later.
  const base = d.baseBedtime(m)
  let bedtime = base + d.bedtimeShift

  // The energy: never changed back in time by an answer to time to explain or a marking of the ritual (spec).
  const rest = new Uint8Array(regen)
  for (let k = 0; k < cap; k++) if (flags[k]! & F_EXPLAIN) rest[k] = 0
  // Time to explain after a work block without an answer: rest for the hard end and the pool (D262); toward the minimum
  // and the reward only as written (D265).
  const tentative = new Uint8Array(regen)
  for (let k = 0; k < cap; k++) if (flags[k]! & F_TENT_REST) tentative[k] = REST_FREE
  // A stretch you marked in the ritual as no rest is none – also in time to explain – from the marking on (T413).
  for (const n of c.facts.notRest) {
    if (n.at >= (inclusive ? m + 1 : m)) continue
    for (let k = Math.max(0, n.from); k < Math.min(cap, n.to); k++) regen[k] = tentative[k] = 0
  }
  const strict = c.asWritten ? tentative : regen

  // Toward the minimum: regeneration before the later of the first end of work and the boundary approved in that minute
  // counts at most a third of the minimum (D208, D218).
  const firstEnd = ends[0]?.at ?? (noWork ? c.wake : workEndForecast)
  const towardMinArr = (until: number, src: Uint8Array = tentative) => {
    const arr = new Uint8Array(cap)
    let pre = 0
    const third = Math.floor(params.minRegenMin / 3)
    for (let k = 0; k < Math.min(until, cap); k++) {
      if (!src[k]) continue
      const appr = k < m ? d.approvedAt(k) : d.approvedAt(m)
      const capPoint = Math.max(firstEnd ?? OPEN, appr?.boundary ?? Number.NEGATIVE_INFINITY)
      if (k < capPoint && !noWork) {
        if (pre < third) {
          pre++
          arr[k] = 1
        }
      } else arr[k] = 1
    }
    return arr
  }

  const appr = d.approvedAt(m)
  const max = d.maxAt(m, view, fcW)
  const proposal = d.proposalAt(m, view, flags, fcW)

  // The end of work in force at m: the last valid end, unless work came back after it.
  const lastEnd = ends.at(-1)?.at ?? null
  let workEndNow: number | null = null
  if (noWork) workEndNow = c.wake
  else if (lastEnd != null) {
    let back = false
    for (let k = lastEnd; k < m; k++) if (flags[k]! & F_END) back = true
    if (!back) workEndNow = lastEnd
  }

  /**
   * The hard end seen from minute `at` (spec „Twardy koniec projektów”): going back from the bedtime, the latest
   * instant after which enough regeneration is left for the missing part of the minimum; none from `at` on: unreachable.
   */
  const hardEndWith = (bt: number, toward: Uint8Array, at: number): HardEnd => {
    let collected = 0
    for (let k = 0; k < Math.min(at, bt); k++) collected += toward[k]!
    const missing = required - collected
    if (missing <= 0) return { at: bt, unreachable: false }
    let sum = 0
    for (let j = Math.min(bt, cap) - 1; j >= at; j--) {
      sum += toward[j]!
      if (sum >= missing) return { at: j, unreachable: false }
    }
    return { at, unreachable: true }
  }

  /**
   * The pool (spec „Pula projektów”): the smaller of the daily limit less the extension and the projects so far, and the
   * time from now (not before the end of work) to the hard end less what the plan holds in it besides projects.
   */
  const poolWith = (bt: number, toward: Uint8Array, at: number, extBefore: number, projectsBefore: number): { min: number; byLimit: number; byTime: number; hardEnd: HardEnd } => {
    const he = hardEndWith(bt, toward, at)
    const byLimit = params.projectLimitMin - extBefore - projectsBefore
    let byTime = 0
    if (!he.unreachable) {
      const fromIdx = Math.max(at, workEndNow ?? workEndForecast ?? at)
      for (let k = fromIdx; k < he.at; k++) if (!(flags[k]! & (F_LIFE | F_REGEN | F_SECOND | F_BUDGET | F_EXT | F_SSOUT | F_REQUEST | F_END))) byTime++
    }
    return { min: Math.min(byLimit, byTime), byLimit, byTime, hardEnd: he }
  }

  let projectsBefore = 0
  for (let k = 0; k < m; k++) if (flags[k]! & F_PROJECT) projectsBefore++

  // The bedtime's forecast: minutes of work confirmed in advance after the boundary, in turn, each moving it when the
  // pool at its start (with the moves before it) is empty.
  let bedtimeForecast = bedtime
  let toward = towardMinArr(bedtime)
  if (d.simulateShifts && appr) {
    let extF = d.extBefore
    let projF = projectsBefore
    let moved = d.bedtimeShift
    const limit = d.shiftLimit(m)
    for (let k = m; k < cap && k < bedtimeForecast + 1; k++) {
      const f = flags[k]!
      if (f & F_PROJECT) projF++
      if (!(f & (F_EXT | F_SSOUT)) || k < appr.boundary) continue
      if (f & F_UPFRONT && moved < limit) {
        const p = poolWith(bedtimeForecast, toward, k, extF, projF)
        if (p.min <= 0) {
          moved++
          bedtimeForecast = base + moved
          toward = towardMinArr(bedtimeForecast)
        }
      }
      extF++
    }
  }
  const pool = poolWith(bedtimeForecast, toward, m, d.extBefore, projectsBefore)

  // The regeneration of the day and toward its minimum: time to explain without an answer is not (yet) regeneration.
  const towardStrict = strict === tentative ? toward : towardMinArr(bedtimeForecast, strict)
  let regenTotal = 0
  let towardMin = 0
  let towardForecast = 0
  for (let k = 0; k < Math.min(cap, bedtimeForecast); k++) {
    towardForecast += towardStrict[k]!
    if (k >= m) continue
    if (strict[k]) regenTotal++
    towardMin += towardStrict[k]!
  }
  let budgetFc = 0
  for (let k = m; k < cap; k++) if (flags[k]! & (F_BUDGET | F_SECOND)) budgetFc++

  return {
    max,
    proposal,
    approved: appr,
    ends,
    workEnd: workEndNow,
    noWork,
    forecastWorkEnd: noWork ? null : (workEndNow ?? workEndForecast),
    lastWorkForecast: noWork ? null : workEndForecast,
    regenTotal,
    towardMin,
    towardForecast,
    required,
    justified,
    justifiedBy,
    bedtimeForecast,
    hardEnd: pool.hardEnd,
    pool: { min: pool.min, byLimit: pool.byLimit, byTime: pool.byTime },
    forecast: fcT.placed,
    budgetMin: c.snapshot.budgetMin,
    forecastBudgetMin: budgetFc,
    flags,
    rest
  }
}
