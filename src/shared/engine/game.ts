/**
 * The game (spec „Grywalizacja”): five rewards for what really protects against overload – the boundary kept, the
 * regeneration used, the reaction to the reserve, accurate estimates and an exchange instead of adding – and never a
 * penalty. A day's grade at its freeze carries what the day earned by these rules, its status and its notes (`dayGame`);
 * the streak, the notes and the protection day are counted from the grades in the order of dates (`gameSummary`). The
 * grade earns the same also with the game switched off: the „Strona B tygodnia” measures from it, the game only gives no
 * notes. Pure: the same day gives the same grade on every computer.
 */
import { placeOf, type CategoryRules, type Pool } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type GameEvent, type LogEvent } from '../model/events'
import { questionId } from '../model/ids'
import { addDays, weekday } from '../time/zone'
import type { DayContext, DayState } from './day'
import type { Descent, EnergyState } from './energy'
import { OPEN, ranMinutes, type BlockFact } from './facts'
import { idxOf } from './grid'
import { fewerSpans } from './modes'
import { dayOutcome } from './outcome'
import { reserveReaction, type Sighting } from './reserve'

export type Reward = 'boundary' | 'regen' | 'reserve' | 'accuracy' | 'exchange'
export const REWARDS: readonly Reward[] = ['boundary', 'regen', 'reserve', 'accuracy', 'exchange']

/** The rules of the game (spec „Nagrody”, „Statusy dni i passa”): only a calibration review or new rules change them. */
export interface GameRules {
  /** Their number: every grade keeps it, a review that changes them gives the next one (spec „wersja reguł”). */
  version: number
  points: Record<Reward, number>
  /** „Trafne szacowanie”: a block from `minMin`, its real time within `pct` % of its length but never less than `floorMin`; at most `perDay` blocks. */
  accuracy: { minMin: number; pct: number; floorMin: number; perDay: number }
  /** „Wymiana zamiast dokładania”: both sides at least this long. */
  exchangeMinMin: number
  /** A week (from Monday): days without data that hold the streak, and days of protection. */
  noDataPerWeek: number
  protectionPerWeek: number
}

export const GAME_RULES: GameRules = {
  version: 1,
  points: { boundary: 3, regen: 3, reserve: 2, accuracy: 1, exchange: 1 },
  accuracy: { minMin: 20, pct: 15, floorMin: 5, perDay: 3 },
  exchangeMinMin: 15,
  noDataPerWeek: 2,
  protectionPerWeek: 1
}

/** „poza grą”, „niedotrzymany”, „bez danych”, „dotrzymany” (checked in this order, D125). */
export type DayStatus = 'out' | 'broken' | 'noData' | 'kept'

/**
 * Why a day is outside the game: before the first day with the game (the days before its release and the day of its
 * installation), the day of the first computer's wizard, a free day, the game off before the first work block (or all
 * day), the day the game was switched on again.
 */
export type OutWhy = 'beforeGame' | 'wizard' | 'free' | 'gameOff' | 'gameOn'

export interface GameGrade {
  /** The game's rules it was counted by. */
  v: number
  status: DayStatus
  out: OutWhy | null
  /** What the day earned by the rules – also outside the game (the „Strona B tygodnia” measures it). */
  earned: { boundary: boolean; regen: boolean; reserve: boolean; accuracy: string[]; exchange: string | null }
  /** Notes by reward; none outside the game. */
  notes: Record<Reward, number>
}

/** What a day's place in the game needs besides its log. */
export interface GameDayInput {
  /** The first day in the game (days before it are outside); null: no game yet (before the version with its screens). */
  from: string | null
  /** The day of the first computer's wizard (outside the game). */
  wizardDay: string | null
  /** The game module during the day before its first change that day (its changes are `module.set` events). */
  gameOn: boolean
  /** The energy module likewise (`energy.module` events): the reward for the reserve. */
  energyOn: boolean
  /** The modules of projects and requests likewise (the grade keeps the day's modules for the „Strona B”); default on. */
  projectsOn?: boolean
  requestsOn?: boolean
}

/** An event written within this of its own instant was written live – a click, not a time given later (the ritual, an edit). */
const LIVE_MS = 60_000

const zeroNotes = (): Record<Reward, number> => ({ boundary: 0, regen: 0, reserve: 0, accuracy: 0, exchange: 0 })

export const notesSum = (n: Readonly<Record<Reward, number>>): number => REWARDS.reduce((s, r) => s + (n[r] ?? 0), 0)

/** The id under which the bar writes that the reserve's message of a descent was seen (the message comes with E5's bar). */
export const reserveMessageId = (date: string, pool: Pool, at: number): string => `reserve:${date}:${pool}:${at}`

/**
 * When the reserve's message of a descent was first seen, and whether it was the silent icon of „mniej pytań” before
 * that (D157: „mniej pytań” on at some moment from the descent to the first sighting – also a descent from before it was
 * switched on; „Jest lepiej” changes nothing).
 */
export function sightingOf(state: DayState, events: readonly AnyEvent[]): (d: Descent) => Sighting {
  const fewer = fewerSpans(events, state.grid)
  return (d) => {
    const s = state.facts.seen.get(reserveMessageId(state.grid.date, d.pool, d.at))
    const seenAt = s ? idxOf(state.grid, s.at) : null
    const until = seenAt ?? OPEN
    return { seenAt, iconOnly: fewer.some((x) => x.from <= until && x.to > d.at) }
  }
}

/**
 * Ends that are no real end even when you gave them: when you left (the answer „Zakończyć” to an absence, D275, T386;
 * an answer that only names the absence – „Posiłek”, „Regeneracja”, „Byłem na prośbie”, A1-09).
 */
const LEFT_RULES: ReadonlySet<string> = new Set(['absenceAnswer', 'absence'])

const live = (e: LogEvent & { at: number }) => Math.abs(e.t - e.at) <= LIVE_MS

/** What the log says of a started and ended block: how its start and end were given (the accuracy, the calibration). */
export interface BlockEvidence {
  f: BlockFact
  start: Extract<LogEvent, { k: 'block.start' }>
  end: Extract<LogEvent, { k: 'block.end' }>
  rules: CategoryRules
  away: boolean
  /** Started by a click when it happened (not from the plan, not given later). */
  clickStart: boolean
  /** Its start is yours: a click, or a time you gave later – not an automatic start nor „it happened as planned”. */
  givenStart: boolean
  /** Its real end is known: a click or your answer then, away from the computer your answer after the return. */
  realEnd: boolean
  /** Its end is yours: a click or your answer (also a time given later, e.g. „skończył się o …”), never one when you left. */
  givenEnd: boolean
  /** Finished: marked done (away: kept by your answer after the return). */
  done: boolean
  /** Its times corrected („korekta”). */
  corrected: { start: boolean; end: boolean }
  /** An absence counted out while it went on, without your „odlicz” (D269, D272). */
  absenceUnanswered: boolean
}

/**
 * The evidence of every started and ended block of the day. An automatic end is a real end only away from the computer
 * at the first use after it, kept by your answer after the return („Trwał do teraz”); an end when you left (also by
 * your answer that only names the absence, D275) never is.
 */
export function blockEvidence(ctx: DayContext, state: DayState): BlockEvidence[] {
  const { facts, grid } = state
  const starts = new Map<string, Extract<LogEvent, { k: 'block.start' }>>()
  const ends = new Map<string, Extract<LogEvent, { k: 'block.end' }>>()
  const fixes = new Map<string, { start: boolean; end: boolean }>()
  for (const e of ctx.events) {
    if (!isKnown(e) || facts.undone.has(e.id)) continue
    if (e.k === 'block.start') {
      const was = starts.get(e.block)
      if (!was || compareEvents(e, was) < 0) starts.set(e.block, e)
    } else if (e.k === 'block.end') ends.set(e.id, e)
    else if (e.k === 'block.fix') {
      const x = fixes.get(e.block) ?? { start: false, end: false }
      fixes.set(e.block, { start: x.start || e.start != null, end: x.end || e.end != null })
    }
  }
  const out: BlockEvidence[] = []
  for (const f of facts.blocks.values()) {
    const p = f.planned
    const start = starts.get(f.id)
    const end = f.endId ? ends.get(f.endId) : undefined
    const rules = p ? state.settings.categories[p.categoryId] : undefined
    if (f.startedAt == null || f.endedAt == null || !p || !start || !end || !rules) continue
    const away = placeOf(rules, p.variantId) === 'away'
    let done = f.done === true
    let realEnd: boolean
    let givenEnd: boolean
    if (end.autoRule) {
      const kept = facts.answers.get(questionId(grid.date, 'return', f.id, idxOf(grid, end.at)))?.answer === 'keep'
      realEnd = givenEnd = away && end.autoRule === 'firstUse' && kept
      if (realEnd) done = true
    } else {
      // The end that came with „it happened as planned” is the plan's too.
      givenEnd = !(end.rule != null && LEFT_RULES.has(end.rule)) && start.how !== 'plan'
      realEnd = givenEnd && (live(end) || away)
    }
    const absenceUnanswered = facts.autos.some((a) => a.block === f.id && a.rule === 'absence' && a.k === 'block.pause' && facts.answers.get(questionId(grid.date, 'absence', f.id, a.at))?.answer !== 'keep')
    const givenStart = !start.autoRule && start.how !== 'auto' && start.how !== 'plan'
    out.push({ f, start, end, rules, away, clickStart: givenStart && start.how === 'click' && live(start), givenStart, realEnd, givenEnd, done, corrected: fixes.get(f.id) ?? { start: false, end: false }, absenceUnanswered })
  }
  return out
}

/**
 * „Trafne szacowanie” (spec, D65, D200, D269, D272, D275, T312, T386): the blocks whose real time came within the
 * tolerance of their length at the start – a finished flexible block of work or of life and care, at least 20 min long
 * at its start, started by a click and ended by a click (or, away from the computer, by your answer after the return),
 * both on one computer (not away), not changed by a variant, not ended by itself (also when you left, after an answer
 * that only names the absence), without a correction of its times, and without an absence counted out unless you said
 * „odlicz”. The real time is without pauses.
 */
export function accurateBlocks(ctx: DayContext, state: DayState, rules: GameRules = GAME_RULES): string[] {
  const plan = new Map(ctx.plan.map((b) => [b.id, b]))
  const out: string[] = []
  for (const x of blockEvidence(ctx, state)) {
    const p = x.f.planned!
    if (p.fixed || p.durationMin < rules.accuracy.minMin || (x.rules.cls !== 'work' && x.rules.cls !== 'life')) continue
    if (plan.get(x.f.id)?.byVariant || x.corrected.start || x.corrected.end) continue
    if (!x.clickStart || !x.realEnd || !x.done || (!x.away && x.start.c !== x.end.c) || x.absenceUnanswered) continue
    const real = ranMinutes(x.f, x.f.endedAt!)
    const tolerance = Math.max(rules.accuracy.floorMin, (p.durationMin * rules.accuracy.pct) / 100)
    if (Math.abs(real - p.durationMin) <= tolerance) out.push(x.f.id)
  }
  return out
}

/**
 * „Wymiana zamiast dokładania” (spec): the first full exchange of the day – a block added after the boundary was
 * approved, the blocks that gave way together at least as long as it, each side at least 15 min, every yielding block
 * in the plan when the boundary was first approved (the approval names them; one written before E7 names none – then
 * any), and no exchange that undoes an earlier one (a block it added gives way, or a block that gave way comes back).
 * The block added, or null.
 */
export function exchangeOf(ctx: DayContext, state: DayState, rules: GameRules = GAME_RULES): string | null {
  const undone = state.facts.undone
  const known = ctx.events.filter((e): e is LogEvent => isKnown(e) && !undone.has(e.id))
  const approvals = known.filter((e): e is Extract<LogEvent, { k: 'boundary.approve' }> => e.k === 'boundary.approve')
  if (!approvals.length) return null
  const first = approvals.reduce((a, b) => (b.at < a.at || (b.at === a.at && compareEvents(b, a) < 0) ? b : a))
  const approvedAt = first.at
  const planned = first.plan ? new Set(first.plan) : null
  const plannedBefore = (id: string) => planned == null || planned.has(id)
  const added = new Set<string>()
  const gave = new Set<string>()
  const exchanges = known.filter((e): e is GameEvent => e.k === 'block.exchange').sort(compareEvents)
  for (const x of exchanges) {
    const undoes = gave.has(x.block) || x.yielding.some((y) => added.has(y.block))
    const full = x.yielding.reduce((s, y) => s + y.minutes, 0) >= x.minutes
    const sides = x.minutes >= rules.exchangeMinMin && x.yielding.every((y) => y.minutes >= rules.exchangeMinMin && plannedBefore(y.block))
    added.add(x.block)
    for (const y of x.yielding) gave.add(y.block)
    if (x.at >= approvedAt && !undoes && full && sides) return x.block
  }
  return null
}

/**
 * The game module in the day (spec „Moduły”, D160, D170, D176): off all day – outside; switched on again that day –
 * outside; switched off and not on again – the day counts when a work block had begun by then, or when the day was then
 * one without work (none in its plan as created, none parked or cancelled since) and the wake had passed; off and on
 * again the same day – the day counts.
 */
function moduleOut(ctx: DayContext, state: DayState, gameOn: boolean): OutWhy | null {
  const toggles = ctx.events
    .filter((e): e is Extract<LogEvent, { k: 'module.set' }> => isKnown(e) && e.k === 'module.set' && e.module === 'game')
    .sort(compareEvents)
  const atStart = toggles.length ? toggles[0]!.was : gameOn
  if (!atStart) return toggles.some((t) => t.on) ? 'gameOn' : 'gameOff'
  const last = toggles.at(-1)
  if (!last || last.on) return null
  const off = idxOf(state.grid, last.at)
  if (state.firstWorkStart != null && state.firstWorkStart <= off) return null
  // The plan is not kept as it was at that moment: the day's plan as created, less what was parked or cancelled before.
  const workPlanned = ctx.snapshot.blocks.some((p) => {
    const r = ctx.snapshot.settings.categories[p.categoryId]
    if (r?.cls !== 'work' || r.keepsRegen || p.tag === 'secondShift') return false
    const f = state.facts.blocks.get(p.id)
    return !(f && f.startedAt == null && ((f.parkedAt != null && f.parkedAt < off) || (f.cancelledAt != null && f.cancelledAt < off)))
  })
  return !workPlanned && off >= state.wake ? null : 'gameOff'
}

export interface DayGameInput {
  /** The day's context with the events the grade counts. */
  ctx: DayContext
  state: DayState
  energy: EnergyState
  /** A free day (of the type „wolne”, closed „Wolne”, or without presence and not answered). */
  free: boolean
  game: GameDayInput
  /** The day is over (its grade or the ritual): what is still open is decided. */
  over: boolean
  rules?: GameRules
}

/**
 * A day in the game (spec „Nagrody”, „Statusy dni i passa”): what it earned – on a stationary „zjazd” only the boundary
 * and the regeneration – its status (outside the game, broken by extension minutes, without data, kept) and its notes.
 */
export function dayGame(x: DayGameInput): GameGrade {
  const rules = x.rules ?? GAME_RULES
  const { state, game } = x
  const o = dayOutcome(state)
  const stationary = state.dayType === 'zjazd-stacjonarny'
  const reaction = stationary ? null : reserveReaction({ events: x.ctx.events, day: state, energy: x.energy, seen: sightingOf(state, x.ctx.events), over: x.over })
  const accuracy = stationary ? [] : accurateBlocks(x.ctx, state, rules)
  const earned: GameGrade['earned'] = {
    boundary: o.boundary === 'kept',
    regen: o.regen.reached,
    reserve: reaction?.verdict === 'reward',
    accuracy,
    exchange: stationary ? null : exchangeOf(x.ctx, state, rules)
  }
  const date = state.grid.date
  const out: OutWhy | null =
    game.from == null || date < game.from ? 'beforeGame' : date === game.wizardDay ? 'wizard' : x.free ? 'free' : moduleOut(x.ctx, state, game.gameOn)
  const status: DayStatus = out ? 'out' : o.boundary === 'broken' ? 'broken' : o.boundary === 'noData' ? 'noData' : 'kept'
  const notes = zeroNotes()
  if (!out) {
    const p = rules.points
    notes.boundary = earned.boundary ? p.boundary : 0
    notes.regen = earned.regen ? p.regen : 0
    notes.reserve = earned.reserve ? p.reserve : 0
    notes.accuracy = Math.min(rules.accuracy.perDay, accuracy.length) * p.accuracy
    notes.exchange = earned.exchange ? p.exchange : 0
  }
  return { v: rules.version, status, out, earned, notes }
}

const STATUSES: readonly DayStatus[] = ['out', 'broken', 'noData', 'kept']

/**
 * A frozen day in the game from its stored grade: its status and notes as they were counted then – a grade of newer
 * rules is never counted again (spec „Starsza wersja aplikacji nie przelicza oceny zapisanej według nowszych reguł”),
 * its notes of rewards this version does not know count too. A grade without the game (frozen before it) is outside.
 */
export function storedGame(grade: Readonly<Record<string, unknown>>): { status: DayStatus; notes: number } {
  const g = grade.game
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { status: 'out', notes: 0 }
  const r = g as Record<string, unknown>
  const status = STATUSES.includes(r.status as DayStatus) ? (r.status as DayStatus) : 'out'
  const notes = r.notes && typeof r.notes === 'object' ? Object.values(r.notes as Record<string, unknown>) : []
  return { status, notes: status === 'out' ? 0 : notes.reduce<number>((s, x) => s + (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0), 0) }
}

/** A day for the streak and the notes: frozen (final), or still open to corrections („w toku”); `status` null – not over. */
export interface GameDay {
  date: string
  status: DayStatus | null
  notes: number
  frozen: boolean
  /** Minutes of regeneration by way (the cassette's cover), when known. */
  regenWays?: Record<string, number>
}

/** What a day did to the streak: one more, held (without data, protected), broken, skipped (outside the game). */
export type StreakMove = 'up' | 'held' | 'protected' | 'broken' | 'skip'

export interface StreakStep {
  date: string
  move: StreakMove
  /** The streak after the day. */
  streak: number
  /** The day is frozen (a step of a day open to corrections may still change). */
  frozen: boolean
}

export interface GameSummary {
  /** Kept days in a row now (spec „Passa”). */
  streak: number
  /** Notes of frozen days, and of the days still open to corrections (today's so far). */
  notes: { final: number; pending: number }
  /** The week of `today` (from Monday): days without data that held the streak so far (at most the limit), the protection day used. */
  week: { noData: number; protection: boolean }
  steps: StreakStep[]
}

/** The Monday of a date's week. */
export const weekOf = (date: string): string => addDays(date, 1 - weekday(date))

/**
 * The streak (spec „Statusy dni i passa”), counted in the order of dates and again at every change: a kept day adds one;
 * a day outside the game neither breaks nor adds and is not counted toward the limit of days without data; a day
 * without data holds it, at most twice a week (from Monday) – the next one counts as broken; the first broken day of the
 * week is replaced by the protection day (the streak holds without growing); an unused one does not carry over. Days
 * missing from the list are outside the game (a day without presence freezes as free).
 */
export function gameSummary(days: readonly GameDay[], today: string, rules: GameRules = GAME_RULES): GameSummary {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const steps: StreakStep[] = []
  let streak = 0
  let week = ''
  let noData = 0
  let protections = 0
  const notes = { final: 0, pending: 0 }
  for (const d of sorted) {
    if (d.frozen) notes.final += d.notes
    else notes.pending += d.notes
    if (d.status == null) continue
    const w = weekOf(d.date)
    if (w !== week) {
      week = w
      noData = 0
      protections = 0
    }
    let move: StreakMove
    let status = d.status
    if (status === 'noData' && ++noData > rules.noDataPerWeek) status = 'broken'
    if (status === 'out') move = 'skip'
    else if (status === 'noData') move = 'held'
    else if (status === 'kept') move = 'up'
    else if (protections < rules.protectionPerWeek) {
      protections++
      move = 'protected'
    } else move = 'broken'
    streak = move === 'up' ? streak + 1 : move === 'broken' ? 0 : streak
    steps.push({ date: d.date, move, streak, frozen: d.frozen })
  }
  const current = weekOf(today)
  const thisWeek = steps.filter((s) => weekOf(s.date) === current)
  const noDataNow = Math.min(rules.noDataPerWeek, sorted.filter((d) => weekOf(d.date) === current && d.status === 'noData').length)
  return { streak, notes, week: { noData: noDataNow, protection: thisWeek.some((s) => s.move === 'protected') }, steps }
}
