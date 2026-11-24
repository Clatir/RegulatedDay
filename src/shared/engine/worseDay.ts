/**
 * „Gorszy dzień” (D570, D587, N4) – pure rules of its proposal, its acceptance and its „Cofnij”; the window writes them
 * (`features/today/worseDayActions.ts`) in one turn of its writes (T517): one edit of the day's file and – only when the approved boundary
 * moves – one approval of it (as the bar moves it after a regeneration from its message), right after the file.
 *
 * The proposal: the setting „Proponuj „Gorszy dzień” po check-inie” on (off by default, D570), the day's first check-in worse (≤ 65) in at
 * least two pools (`worsePools`), no mark in force and no „×” for the day. The acceptance (one click, nothing blocked – D72): each block of a
 * routine of the plan not begun, not parked nor cancelled, without `routine.done` and not past by its planned end, whose routine has the
 * version „na gorsze dni” and whose day does not keep that version already – the day's version of it „na gorsze dni” (as the version's
 * switch, D473, D481); the proposal of the boundary earlier by the setting from now on (the engine, `DayContext.worseDays`), the approved
 * boundary – when approved – moved by the same rule (`worseBoundary`: never before the click rounded up to 5 min); the mark in the day's file
 * with what it changed – also the approval in force then (`approvalBefore`) and the id of the one it wrote (`approvalId`). „Cofnij”: each
 * routine still „na gorsze dni” and untouched since (the same exclusions) back to its list before; the mark's period ends (`undoneAt` – the
 * minutes of the period stay as judged); the boundary moves back only while the acceptance's own approval is in force by the order of the log
 * (`undoApprovalCase`) – to the one before it; any approval made after the acceptance stays and is named (`stays`); the proposal does not come
 * again that day (`asked`).
 */
import { dayRaw, isRaw, setAsked, setRoutineSteps, type Raw } from '../data/dayEdits'
import { logicalClock, plural } from '../format'
import { POOLS, type LoggedPools, type Pool } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import type { DayFile, PlanBlock } from '../model/plan'
import { ROUTINE_STEPS } from '../model/routineSteps'
import type { Routine } from '../model/routines'
import { WORSE_DAY_KEY, worseBoundary, worseDayActive, worseDayMarkFrom, worseFloorOf, type WorseDayMark } from '../model/worseDay'
import { logicalMinuteOf } from '../time/day'
import { plannedSpan } from './blocks'
import type { DayState } from './day'
import { CHECKIN_STATES, checkinStates } from './energy'
import type { DayFacts } from './facts'
import { atOf, gridOf, idxCeilOf, idxOf } from './grid'
import { dayBlockNow, routineStepsNow, routineVersionEdits } from './steps'

/** The key of „×” (not today) in the day's `asked`, as the morning plan's other questions; „Cofnij” writes it too. */
export const WORSE_DAY_ASKED = 'worseDay'

/** The proposal comes after a check-in worse in at least this many pools (N4). */
export const WORSE_POOLS_MIN = 2

/** A pool is worse at this state of the check-in or below (T2531): one „tak”, or „trochę” to both of its questions. */
export const WORSE_POOL_MAX = CHECKIN_STATES[2]

/**
 * The pools a check-in says are worse (N4, T2531): those its answers set at `WORSE_POOL_MAX` (65) or below, as the check-in counts them
 * (`checkinStates`) – one „trochę” (85) is not; a pool it did not ask (the body of an older version's) is none.
 */
export function worsePools(answers: LoggedPools<readonly [number, number]>): Pool[] {
  const states = checkinStates(answers)
  return POOLS.filter((p) => answers[p] != null && states[p] <= WORSE_POOL_MAX)
}

/** The answers of the day's first check-in (the one energy counts from), by its instant and the order of the log; null – none. */
export function dayCheckin(events: readonly AnyEvent[]): LoggedPools<readonly [number, number]> | null {
  let first: Extract<AnyEvent, { k: 'energy.checkin' }> | null = null
  for (const e of events) {
    if (!isKnown(e) || e.k !== 'energy.checkin') continue
    if (!first || e.at < first.at || (e.at === first.at && compareEvents(e, first) < 0)) first = e
  }
  return first ? first.answers : null
}

/**
 * The proposal „Gorszy dzień? · Przyjmij · ×” (D570, D587): the pools worse by the day's first check-in when it stands – the setting on, two
 * pools or more, the day without a mark in force and without „×” (also written by „Cofnij”); null – no proposal.
 */
export function worseDayProposal(i: { on: boolean; events: readonly AnyEvent[]; file: Pick<DayFile, 'asked' | 'worseDay'> | null }): Pool[] | null {
  if (!i.on || worseDayActive(i.file?.worseDay) || i.file?.asked[WORSE_DAY_ASKED] != null) return null
  const answers = dayCheckin(i.events)
  const worse = answers ? worsePools(answers) : []
  return worse.length >= WORSE_POOLS_MIN ? worse : null
}

/** What the acceptance is counted on: the day's file in its turn, and the day counted on it now. */
export interface WorseAcceptInput {
  date: string
  /** The day's file as the edit is made on it (null – none yet). */
  raw: Raw | null
  plan: readonly PlanBlock[]
  state: Pick<DayState, 'now' | 'blocks' | 'facts' | 'boundary' | 'grid'>
  routines: readonly Routine[]
  /** The setting „O ile wcześniej kończyć pracę w gorszy dzień” in force now. */
  earlierMin: number
  /** Now (ms UTC). */
  at: number
}

/** The approval of the boundary moved (`boundary.approve` the window writes right after the file, in the same turn). */
export interface WorseApproval {
  boundary: number
  auto: boolean
  plan: string[]
}

export interface WorseAccept {
  /** The day's file after it: the routines' versions and the mark. */
  raw: Raw
  /** The blocks whose routine went „na gorsze dni”, in the order of the plan. */
  routines: string[]
  /** The boundary it moves (indices; the approved one when approved, else the proposal – equal: it stays); null – none (no work). */
  boundary: { from: number; to: number } | null
  /** The approved boundary moved – its new approval; null – none approved, or it stays. */
  approve: WorseApproval | null
}

/** Why there is nothing to accept: the day has the mark in force already (another computer, a moment ago). */
export const WORSE_DAY_ALREADY = 'Gorszy dzień jest już przyjęty.'
/** Why there is nothing to take back: no mark in force (taken back on another computer). */
export const WORSE_DAY_NONE = 'Gorszy dzień nie jest już przyjęty.'

/** The raw entry of a block's routine list in the day's file (`routineSteps.<block>`); undefined – none. */
const entryOf = (raw: Raw, id: string): unknown => (isRaw(raw[ROUTINE_STEPS]) ? (raw[ROUTINE_STEPS] as Raw)[id] : undefined)

/** The plan the approval in force named (T321 – the marks „po pracy” are judged by it); none – the plan as it is. */
function approvedPlan(state: Pick<DayState, 'facts'>, plan: readonly PlanBlock[]): string[] {
  const last = state.facts.approvals.at(-1)
  return last && last.undoneAt == null && last.plan ? last.plan : plan.map((b) => b.id)
}

/** A routine block that stays as it is (T2536): begun, parked or cancelled, or its routine saved (`routine.done` – the card closed). */
const routineStays = (facts: Pick<DayFacts, 'blocks' | 'routines'>, id: string): boolean => {
  const f = facts.blocks.get(id)
  return facts.routines.has(id) || f?.startedAt != null || f?.parkedAt != null || f?.cancelledAt != null
}

/** The boundary's floor of an acceptance at `at` (index): the click rounded up to a whole minute and to 5 min (T2545). */
const floorOf = (date: string, at: number): number => worseFloorOf(Math.max(0, idxCeilOf(gridOf(date), at)))

/** The acceptance of „Gorszy dzień” counted on the day's file in its turn (one edit of it), or why not. */
export function worseDayAccept(i: WorseAcceptInput): WorseAccept | { error: string } {
  let day = dayRaw(i.raw, i.date)
  const was = worseDayMarkFrom(day[WORSE_DAY_KEY])
  if (worseDayActive(was)) return { error: WORSE_DAY_ALREADY }
  const g = gridOf(i.date)
  const floor = floorOf(i.date, i.at)
  const byId = new Map(i.state.blocks.map((b) => [b.id, b]))
  const before: Record<string, unknown> = {}
  for (const p of i.plan) {
    if (!p.routine || routineStays(i.state.facts, p.id)) continue
    const b = byId.get(p.id)
    const span = b ? plannedSpan(b, byId) : null
    // Past by its planned end without a start: the morning gone by stays as it was.
    if (!span || span.end <= i.state.now) continue
    const shown = routineStepsNow(day, i.date, dayBlockNow(day, i.date, p), i.routines)
    // Its own list (no version), a routine without „na gorsze dni”, or the day keeps that version already: nothing to switch.
    if (!shown?.routine || !shown.routine.worse.length || shown.version === 'worse') continue
    const out = routineVersionEdits({ date: i.date, day, block: p, version: 'worse', routines: i.routines })
    if ('error' in out) continue
    before[p.id] = entryOf(day, p.id) ?? null
    day = out.day
  }
  const { approved, proposal, auto } = i.state.boundary
  const shown = approved ?? proposal
  const to = shown == null ? null : worseBoundary(shown, i.earlierMin, floor)
  const approve = approved != null && to != null && to !== approved ? { boundary: atOf(g, to), auto, plan: approvedPlan(i.state, i.plan) } : null
  // A worse day taken back earlier this day: its period stays (T2543) – the engine counts its minutes as they were.
  const past = was ? [...was.past, { at: was.at, earlierMin: was.earlierMin, undoneAt: was.undoneAt! }] : []
  // The approval in force now (T2533) – „Cofnij” puts it back while the one this acceptance writes stands; its id comes after the write.
  const inForce = approvalInForce(i.state)
  const mark: Raw = { at: i.at, earlierMin: i.earlierMin, routines: before, ...(past.length ? { past } : {}), approvalBefore: inForce ? { to: inForce.to, auto: inForce.auto, id: inForce.id } : null, approvalId: null }
  return { raw: { ...day, [WORSE_DAY_KEY]: mark }, routines: Object.keys(before), boundary: shown == null ? null : { from: shown, to: to! }, approve }
}

/** The day's file with the id of the approval the acceptance wrote put into its mark (T2533; the window writes it right after the approval). */
export function withApprovalId(raw: Raw, id: string): Raw {
  const mark = raw[WORSE_DAY_KEY]
  return isRaw(mark) ? { ...raw, [WORSE_DAY_KEY]: { ...mark, approvalId: id } } : raw
}

/** An approval of the boundary in force: its event's id (null – approved by itself and not written yet), boundary and instant (ms), kind. */
export interface ApprovalInForce {
  id: string | null
  to: number
  auto: boolean
  /** The plan it named (T321); null – it names none, or not written. */
  plan: string[] | null
}

/** An approval taken back by now, as the engine reads it: its „Cofnij zatwierdzenie” in force already. */
const undoneNow = (a: DayFacts['approvals'][number], now: number): boolean => a.undoneAt != null && a.undoneAt <= now

/**
 * The approval in force as the engine has it now (T2533, one source – `state.boundary`): its boundary and kind from the engine; its event – the
 * last written one with its instant not after now, as the engine picks it; none written – approved by itself, not written yet (`id` null);
 * null – none (the boundary open).
 */
export function approvalInForce(state: Pick<DayState, 'facts' | 'boundary' | 'grid' | 'now'>): ApprovalInForce | null {
  const { approved, auto } = state.boundary
  if (approved == null) return null
  let found: DayFacts['approvals'][number] | null = null
  for (const a of state.facts.approvals) if (a.at <= state.now) found = a
  const written = found && !undoneNow(found, state.now) ? found : null
  return { id: written?.id ?? null, to: atOf(state.grid, approved), auto, plan: written?.plan ?? null }
}

/**
 * What „Cofnij” finds (T2533, T2548): `ours` – the last approval not taken back, by the order of the log (whatever its instant – a clock behind),
 * is the one the acceptance wrote – the only case it moves the boundary; `missing` – the acceptance wrote one, its event is not in the day's log
 * yet (the log of the computer that wrote it has not come): the boundary is left, the words say why; `same` – the engine's approval in force is
 * the one before the acceptance (by id; approved by itself and not written – the same boundary): nothing to say; `later` – any other approval in
 * force (`to` – its boundary, ms): it stays and is named; `none` – the boundary open.
 */
export type UndoApprovalCase = { kind: 'ours' | 'missing' | 'same' | 'none' } | { kind: 'later'; to: number }

export function undoApprovalCase(state: Pick<DayState, 'facts' | 'boundary' | 'grid' | 'now'>, mark: Pick<WorseDayMark, 'approvalBefore' | 'approvalId'>, events: readonly AnyEvent[]): UndoApprovalCase {
  const live = state.facts.approvals.filter((a) => !undoneNow(a, state.now))
  if (mark.approvalId && live.at(-1)?.id === mark.approvalId) return { kind: 'ours' }
  if (mark.approvalId && !events.some((e) => e.id === mark.approvalId)) return { kind: 'missing' }
  const now = approvalInForce(state)
  if (!now) return { kind: 'none' }
  const b = mark.approvalBefore
  if (b && (b.id != null ? now.id === b.id : now.id == null && now.to === b.to)) return { kind: 'same' }
  return { kind: 'later', to: now.to }
}

export interface WorseUndoInput {
  date: string
  raw: Raw | null
  /** The day counted on the file now – with its mark in force (its approval in force, the facts of its blocks). */
  state: Pick<DayState, 'boundary' | 'facts' | 'grid' | 'now'>
  /** The day's events as counted (the acceptance's approval looked for by its id). */
  events: readonly AnyEvent[]
  plan: readonly PlanBlock[]
  /** Now (ms UTC): the end of the mark's period. */
  at: number
}

export interface WorseUndo {
  /** The day's file after it: the routines back, the mark's period ended, the proposal not asked again. */
  raw: Raw
  restored: string[]
  /** Routines changed or begun, parked, cancelled or saved since the acceptance – they stay. */
  kept: string[]
  /** The approval in force before the acceptance back (only while the acceptance's own stands); null – nothing to move back. */
  approve: WorseApproval | null
  /** The approved boundary that stays (index) – another approval than the one before the acceptance, named by the words; null – nothing to say. */
  stays: number | null
  /** The acceptance's approval is not in the day's log yet (another computer's log has not come): the boundary left, the words say why. */
  logMissing: boolean
}

/**
 * What „Cofnij” does to the approved boundary (T2533): only while the acceptance's own approval is the last one not taken back – the one in
 * force before it back (with its kind and the plan the acceptance's named; none before – nothing); any other – the boundary stays (named).
 */
function approvalBack(i: WorseUndoInput, mark: WorseDayMark, c: UndoApprovalCase): Pick<WorseUndo, 'approve' | 'stays' | 'logMissing'> {
  if (c.kind === 'ours') {
    const own = i.state.facts.approvals.find((a) => a.id === mark.approvalId)
    const b = mark.approvalBefore
    return { approve: b ? { boundary: b.to, auto: b.auto, plan: own?.plan ?? approvedPlan(i.state, i.plan) } : null, stays: null, logMissing: false }
  }
  return { approve: null, stays: c.kind === 'later' ? idxOf(gridOf(i.date), c.to) : null, logMissing: c.kind === 'missing' }
}

/** „Cofnij” of „Gorszy dzień” counted on the day's file in its turn: only what still stands as the acceptance left it. */
export function worseDayUndo(i: WorseUndoInput): WorseUndo | { error: string } {
  const base = dayRaw(i.raw, i.date)
  const markRaw = base[WORSE_DAY_KEY]
  const mark = worseDayMarkFrom(markRaw)
  if (!mark || !worseDayActive(mark) || !isRaw(markRaw)) return { error: WORSE_DAY_NONE }
  // Never a refusal for the boundary (D72): what cannot be judged now is left and said.
  const c = undoApprovalCase(i.state, mark, i.events)
  let day: Raw = base
  const befores = isRaw(markRaw.routines) ? markRaw.routines : {}
  const restored: string[] = []
  const kept: string[] = []
  for (const id of Object.keys(befores)) {
    const now = entryOf(day, id)
    if (routineStays(i.state.facts, id) || !isRaw(now) || now.version !== 'worse') {
      kept.push(id)
      continue
    }
    const was = befores[id]
    day = isRaw(was) ? { ...day, [ROUTINE_STEPS]: { ...(day[ROUTINE_STEPS] as Raw), [id]: was } } : setRoutineSteps(day, id, null)
    restored.push(id)
  }
  // The mark stays, its period ended (T2543); what it switched is no longer its to take back.
  day = { ...day, [WORSE_DAY_KEY]: { at: mark.at, earlierMin: mark.earlierMin, undoneAt: i.at, ...(mark.past.length ? { past: mark.past } : {}) } }
  // Not proposed again today: you took it back (T2539).
  day = setAsked(day, WORSE_DAY_ASKED, 'no')
  return { raw: day, restored, kept, ...approvalBack(i, mark, c) }
}

/** A boundary (index) of the day as its clock says it. */
const clockOf = (date: string, idx: number): string => logicalClock(logicalMinuteOf(date, atOf(gridOf(date), idx)))

/**
 * What became of the approval that moves the approved boundary (T2546): `failed` – the log refused it; `waiting` – the day's file waits for
 * the folder (an approval without its mark could stay if the file were refused) – nothing is written for it; `unlinked` – written, but its id
 * did not get into the mark: „Cofnij” will leave the boundary (moved back by hand).
 */
export type ApprovalNote = 'failed' | 'waiting' | 'unlinked' | null

/**
 * The line after the acceptance (with „Cofnij”): „Gorszy dzień: 2 rutyny na gorsze dni, granica 16:00 → 15:00”; `note` – what became of the
 * approval that moves the approved boundary, when not simply written.
 */
export function worseDayText(date: string, a: Pick<WorseAccept, 'routines' | 'boundary'>, note: ApprovalNote = null): string {
  const parts: string[] = []
  const n = a.routines.length
  if (n) parts.push(`${n} ${plural(n, 'rutyna', 'rutyny', 'rutyn')} na gorsze dni`)
  if (a.boundary) {
    const from = clockOf(date, a.boundary.from)
    const moved = a.boundary.from === a.boundary.to ? `granica ${from} bez zmian` : `granica ${from} → ${clockOf(date, a.boundary.to)}`
    if (note === 'failed') parts.push(`granica ${from} bez zmian – nie zapisano zatwierdzenia`)
    else if (note === 'waiting') parts.push(`granica ${from} bez zmian – plan czeka na zapis, granicę zatwierdzisz ręcznie`)
    else if (note === 'unlinked') parts.push(`${moved} – granicę cofniesz ręcznie w karcie granicy`)
    else parts.push(moved)
  }
  return parts.length ? `Gorszy dzień: ${parts.join(', ')}` : 'Gorszy dzień: plan bez zmian'
}

/**
 * The words after „Cofnij”: what came back, and what stays – routines changed since, the boundary approved after the acceptance (named, neutral:
 * „granica 15:00 – zmienisz ją w karcie granicy”), its own approval not written (`note`); the acceptance's approval not in the log yet
 * (`logMissing`) – the boundary is yours to move back.
 */
export function worseUndoText(date: string, u: Pick<WorseUndo, 'kept' | 'stays'> & { logMissing?: boolean }, note: ApprovalNote = null): string {
  const stays: string[] = []
  const n = u.kept.length
  if (n) stays.push(`${n} ${plural(n, 'rutyna zmieniona', 'rutyny zmienione', 'rutyn zmienionych')} w międzyczasie`)
  if (u.stays != null) stays.push(`granica ${clockOf(date, u.stays)} – zmienisz ją w karcie granicy`)
  if (note === 'failed') stays.push('granica – nie zapisano zatwierdzenia')
  if (note === 'waiting') stays.push('granica – plan czeka na zapis, granicę zatwierdzisz ręcznie')
  const missing = u.logMissing ? '; granicę cofniesz ręcznie w karcie granicy – log komputera, który przyjął gorszy dzień, jeszcze nie doszedł' : ''
  return `Cofnięto gorszy dzień${stays.length ? ` – zostaje: ${stays.join(', ')}` : ''}${missing}.`
}
