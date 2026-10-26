/**
 * A change of the day's type during the day (spec „Zmiana typu w trakcie dnia”). Blocks that passed stay; nothing changes
 * without your acceptance: the app proposes parking the future flexible work blocks, asks about the fixed blocks one by
 * one (keep or cancel) and proposes returning the accepted requests to the queue. A switch to a type with a later maximum
 * shows the energy now, the type planned in the morning, the change of the minimum of regeneration and the blocks of the
 * new type missing for the rest of the day (sessions, the second shift and blocks anchored to them, blocks parked by an
 * earlier switch), each with its cost, checked only without one.
 *
 * In the main window the switch is one dialog: the second snapshot, the parks and cancels, the new boundary and the
 * added blocks all take effect at its confirmation (T-decision: the instant of the choice is the instant of the change,
 * so no minute of work falls between them to be classified again).
 */
import { derivedId } from '../model/ids'
import type { PoolValues } from '../model/categories'
import { RULES_VERSION, type AnyEvent } from '../model/events'
import { templateFor, type PlanBlock, type Template } from '../model/plan'
import type { DayTypeId, RulesSettings } from '../model/settings'
import { weekday } from '../time/zone'
import { isBoundaryWork } from './blocks'
import { sessionBlock, SESSION_ANCHOR } from './createDay'
import { computeDay, settingsAtMinute, type DayContext, type DayState } from './day'
import { exchangeCost } from './exchange'
import { atOf, idxOfLogical } from './grid'

export interface TypeChangeInput {
  ctx: DayContext
  state: DayState
  /** The pools now (shown with a switch to a later maximum), null when energy is unknown or off. */
  energyNow: PoolValues | null
  to: DayTypeId
  /** The settings in force at the switch (with this day's changes „od dziś”). */
  settings: RulesSettings
  templates: readonly Template[]
  /** „Dodaj bloki typu …” later in the day: the missing blocks of the type, whatever its maximum. */
  withAdd?: boolean
}

export interface AddCandidate {
  block: PlanBlock
  /** Minutes beyond the boundary it would bring where it would land (sessions of the layer move the maximum: 0). */
  costMin: number
  checked: boolean
  /** A session of the layer (added by its answer „tak” for the day). */
  session: string | null
}

export interface TypeChangePlan {
  from: DayTypeId
  to: DayTypeId
  /** The type the day was planned with in the morning (its snapshot). */
  morningType: DayTypeId
  laterMax: boolean
  oldMaxMin: number
  newMaxMin: number
  /** Future flexible work blocks (proposed to park). */
  park: PlanBlock[]
  /** Future fixed blocks (each: keep or cancel). */
  fixed: PlanBlock[]
  /** Future blocks of requests from the queue (proposed to return them). */
  requests: PlanBlock[]
  /** A switch to a later maximum: the blocks of the new type missing in the plan. */
  add: AddCandidate[]
  minRegen: { before: number; after: number }
  energy: PoolValues | null
}

export interface TypeChangeChoice {
  park: readonly string[]
  cancel: readonly string[]
  returnRequests: readonly string[]
  add: readonly string[]
}

export interface TypeChangeResult {
  /** Events of the day's log, in order (drafts: kind, day and fields). */
  events: Array<Record<string, unknown>>
  /** Blocks to put into the day's file. */
  blocks: PlanBlock[]
  /** Sessions of the layer answered „tak” for the day. */
  sessionsYes: string[]
  /** Blocks whose requests go back to the queue (the block leaves the plan with them). */
  requestBlocks: PlanBlock[]
  /** The new boundary when the approved one changes (index), for „Cofnij”. */
  boundary: { before: number; after: number } | null
}

const future = (s: DayState) => s.forecast.filter((p) => !p.running && p.from >= s.now && p.block.inPlan)

function notBegun(s: DayState, id: string): boolean {
  const f = s.facts.blocks.get(id)
  return !f || (f.startedAt == null && f.parkedAt == null && f.cancelledAt == null)
}

/** A snapshot event as the engine would read it (for counting what the switch makes of the day). */
function simSnapshot(ctx: DayContext, at: number, to: DayTypeId, settings: RulesSettings, max: number | null, minRegen: number | null): AnyEvent {
  return { id: 'sim-type', c: '~sim', n: 0, t: at, l: at, v: RULES_VERSION, day: ctx.date, dom: 'timer', k: 'day.snapshot', at, dayType: to, settings, reason: 'type', max, minRegen } as AnyEvent
}

function simPark(ctx: DayContext, at: number, ids: readonly string[], kind: 'block.park' | 'block.cancel', n0: number): AnyEvent[] {
  return ids.map((block, i) => ({ id: `sim-${kind}-${i}`, c: '~sim', n: n0 + i, t: at, l: at, v: RULES_VERSION, day: ctx.date, dom: 'timer', k: kind, block, at, rule: 'type' }) as AnyEvent)
}

/** The blocks of the new type missing for the rest of the day (a switch to a later maximum). */
function missingBlocks(inp: TypeChangeInput): Array<{ block: PlanBlock; session: string | null; ask: boolean }> {
  const { ctx, state, to, settings } = inp
  const date = ctx.date
  const out: Array<{ block: PlanBlock; session: string | null; ask: boolean }> = []
  const inPlan = (id: string) => ctx.plan.some((b) => b.id === id) && notBegun(state, id)
  const nowMin = state.now
  // Sessions of the layer of the new type on this weekday (asked ones unchecked).
  const layer = settings.dayTypes[to].sessions[weekday(date) - 1] ?? 'no'
  if (layer !== 'no') {
    for (const def of settings.sessions) {
      const b = sessionBlock(def, date, ctx.snapshot.holidays)
      if (!b || inPlan(b.id)) continue
      if (idxOfLogical(state.grid, b.startMin! + b.durationMin) <= nowMin) continue
      out.push({ block: b, session: def.id, ask: layer === 'ask' })
    }
  }
  // The second shift of the new type's template and the blocks anchored to it.
  const tpl = templateFor(inp.templates, to, weekday(date), date)
  if (tpl) {
    const blocks = tpl.version.blocks
    const ids = new Map(blocks.map((b) => [b.id, derivedId(date, 'tpl', tpl.template.id, b.id)]))
    const second = new Set(blocks.filter((b) => b.tag === 'secondShift').map((b) => b.id))
    for (let changed = true; changed; ) {
      changed = false
      for (const b of blocks) {
        if (!b.anchor || !second.has(b.anchor) || second.has(b.id)) continue
        second.add(b.id)
        changed = true
      }
    }
    for (const b of blocks) {
      if (!second.has(b.id)) continue
      const id = ids.get(b.id)!
      if (inPlan(id)) continue
      const anchor = b.anchor ? (b.anchor.startsWith(SESSION_ANCHOR) ? null : (ids.get(b.anchor) ?? null)) : null
      if (b.startMin != null && idxOfLogical(state.grid, b.startMin + b.durationMin) <= nowMin) continue
      out.push({ block: { ...b, id, anchor, startMin: anchor ? null : b.startMin, origin: 'template', sourceId: b.id, tag: b.tag ?? (anchor ? 'secondShift' : null) }, session: null, ask: false })
    }
  }
  // Blocks parked today by an earlier switch: back as copies (the parked one stays parked in the log).
  for (const [id, f] of state.facts.blocks) {
    if (f.parkedAt == null || f.goneRule !== 'type') continue
    const b = ctx.plan.find((x) => x.id === id)
    if (!b || b.startMin == null || idxOfLogical(state.grid, b.startMin + b.durationMin) <= nowMin) continue
    out.push({ block: { ...b, id: derivedId(date, 'back', id) }, session: null, ask: false })
  }
  return out
}

export function planTypeChange(inp: TypeChangeInput): TypeChangePlan {
  const { ctx, state, to, settings } = inp
  const now = settingsAtMinute(ctx.snapshot, state.facts, state.now + 1)
  const from = now.dayType as DayTypeId
  const oldMaxMin = now.params.maxMin
  const newMaxMin = settings.dayTypes[to].maxMin
  const laterMax = newMaxMin > oldMaxMin
  const fut = future(state).filter((p) => notBegun(state, p.block.id))
  const planOf = (id: string) => ctx.plan.find((b) => b.id === id)
  const park = fut.filter((p) => isBoundaryWork(p.block) && !p.block.fixed && !p.block.waits).map((p) => planOf(p.block.id)).filter((b): b is PlanBlock => !!b)
  const fixed = fut.filter((p) => p.block.fixed || (p.block.waits && p.block.start != null)).map((p) => planOf(p.block.id)).filter((b): b is PlanBlock => !!b)
  const requests = fut.map((p) => planOf(p.block.id)).filter((b): b is PlanBlock => !!b && b.requests.length > 0)
  const before = lastTypeMin(state) ?? now.params.minRegenMin
  const after = to === 'regeneracyjny' ? regenMinimum(inp, before, park.map((b) => b.id)) : settings.dayTypes[to].minRegenMin
  let add: AddCandidate[] = []
  if (laterMax || inp.withAdd) {
    const at = atOf(state.grid, state.now)
    const simCtx: DayContext = { ...ctx, events: [...ctx.events, simSnapshot(ctx, at, to, settings, atOf(state.grid, idxOfLogical(state.grid, newMaxMin)), null)] }
    const simState = computeDay(simCtx)
    add = missingBlocks(inp).map((m) => {
      const costMin = m.session ? 0 : exchangeCost(simCtx, simState, m.block).beyondMin
      return { block: m.block, costMin, checked: !m.ask && costMin === 0, session: m.session }
    })
  }
  return { from, to, morningType: ctx.snapshot.dayType, laterMax, oldMaxMin, newMaxMin, park, fixed, requests, add, minRegen: { before, after }, energy: inp.energyNow }
}

/** The minimum a change of type fixed today (the last one), null when none did. */
function lastTypeMin(state: DayState): number | null {
  return [...state.facts.snapshots].reverse().find((s) => s.reason === 'type')?.minRegen ?? null
}

/**
 * The minimum of regeneration from a switch to a regeneration day (spec): the larger of the minimum in force before and
 * the smaller of the regeneration day's minimum and the regeneration that can still be collected – collected so far plus
 * what the plan makes regeneration until the bedtime, counted once, at the switch.
 */
function regenMinimum(inp: TypeChangeInput, before: number, parked: readonly string[]): number {
  const { ctx, state, settings } = inp
  const at = atOf(state.grid, state.now)
  const sim = computeDay({ ...ctx, events: [...ctx.events, simSnapshot(ctx, at, 'regeneracyjny', settings, null, null), ...simPark(ctx, at, parked, 'block.park', 1)] })
  let toCome = 0
  for (let k = sim.now; k < Math.min(sim.rest.length, sim.bedtime.forecast); k++) if (sim.rest[k]) toCome++
  const collectible = sim.regen.towardMinMin + toCome
  return Math.max(before, Math.min(settings.dayTypes.regeneracyjny.minRegenMin, collectible))
}

export function applyTypeChange(inp: TypeChangeInput, plan: TypeChangePlan, choice: TypeChangeChoice): TypeChangeResult {
  const { ctx, state, to, settings } = inp
  const g = state.grid
  const at = atOf(g, state.now)
  const day = ctx.date
  const buffer = settings.boundaryBufferMin
  const events: Array<Record<string, unknown>> = []
  const parked = plan.park.filter((b) => choice.park.includes(b.id)).map((b) => b.id)
  const cancelled = plan.fixed.filter((b) => choice.cancel.includes(b.id)).map((b) => b.id)
  for (const block of parked) events.push({ k: 'block.park', day, block, at, rule: 'type' })
  for (const block of cancelled) events.push({ k: 'block.cancel', day, block, at, rule: 'type' })
  const added = plan.add.filter((a) => choice.add.includes(a.block.id))
  const blocks = added.filter((a) => !a.session).map((a) => a.block)
  const sessionsYes = added.filter((a) => a.session).map((a) => a.session!)
  const requestBlocks = plan.requests.filter((b) => choice.returnRequests.includes(b.id))

  // The maximum from now: the new type's; on a switch to an earlier (or the same) one the running work block and the
  // kept fixed work blocks move it to their end plus the buffer, never beyond the maximum before the switch.
  const oldMax = state.boundary.max
  let max = idxOfLogical(g, plan.newMaxMin)
  if (!plan.laterMax) {
    let ext = Number.NEGATIVE_INFINITY
    for (const p of state.forecast) {
      if (!isBoundaryWork(p.block)) continue
      const kept = p.running || (p.block.fixed && !cancelled.includes(p.block.id) && notBegun(state, p.block.id) && p.from >= state.now)
      if (kept) ext = Math.max(ext, p.to + buffer)
    }
    max = Math.max(max, Math.min(oldMax, ext))
  }
  const minRegen = to === 'regeneracyjny' ? plan.minRegen.after : null
  events.push({ k: 'day.snapshot', day, at, dayType: to, reason: 'type', max: atOf(g, max), minRegen })

  // The boundary: an approved one is kept within the new maximum (not before now); on a switch to a later maximum it is
  // counted again as the new type's proposal, no further than the boundary this type already had today, and approved
  // at once (without cost and without an exception). Not approved: it stays a proposal of the engine.
  let boundary: TypeChangeResult['boundary'] = null
  const approved = state.boundary.approved
  if (approved != null) {
    let next: number
    if (!plan.laterMax) next = Math.max(state.now, Math.min(approved, max))
    else {
      const simEvents: AnyEvent[] = [...ctx.events, ...simPark(ctx, at, parked, 'block.park', 1), ...simPark(ctx, at, cancelled, 'block.cancel', 100), simSnapshot(ctx, at, to, settings, atOf(g, max), minRegen)]
      const simPlan = [...ctx.plan.filter((b) => !requestBlocks.some((r) => r.id === b.id)), ...blocks]
      const sim = computeDay({ ...ctx, plan: simPlan, events: simEvents, now: at + 60_000 })
      next = Math.max(state.now, sim.boundary.proposal ?? approved)
      const cap = morningBoundary(state, to, ctx.snapshot.dayType)
      if (cap != null) next = Math.min(next, cap)
    }
    if (next !== approved) {
      events.push({ k: 'boundary.approve', day, at, boundary: atOf(g, next), auto: false })
      boundary = { before: approved, after: next }
    }
  }

  // A switch to a regeneration day confirms the end of work (spec: the real end of the last work block before the
  // second shift) when no work block runs and none stays.
  if (to === 'regeneracyjny') {
    const runningWork = state.forecast.some((p) => p.running && isBoundaryWork(p.block))
    const staying = state.forecast.some((p) => !p.running && isBoundaryWork(p.block) && p.from >= state.now && !parked.includes(p.block.id) && !cancelled.includes(p.block.id) && notBegun(state, p.block.id))
    let lastEnd: number | null = null
    for (const b of state.blocks) {
      if (!isBoundaryWork(b)) continue
      const f = state.facts.blocks.get(b.id)
      if (f?.endedAt != null) lastEnd = Math.max(lastEnd ?? 0, f.endedAt)
    }
    if (!runningWork && !staying && lastEnd != null) events.push({ k: 'work.end', day, at, end: atOf(g, lastEnd) })
  }
  return { events, blocks, sessionsYes, requestBlocks, boundary }
}

/**
 * „Dodaj bloki typu …” later in the day (spec): the chosen missing blocks of the day's type now; an approved boundary is
 * counted again as that type's proposal with them, without cost, no further than the boundary the type already had.
 */
export function addTypeBlocks(inp: TypeChangeInput, plan: TypeChangePlan, add: readonly string[]): TypeChangeResult {
  const { ctx, state } = inp
  const g = state.grid
  const at = atOf(g, state.now)
  const added = plan.add.filter((a) => add.includes(a.block.id))
  const blocks = added.filter((a) => !a.session).map((a) => a.block)
  const sessionsYes = added.filter((a) => a.session).map((a) => a.session!)
  const events: Array<Record<string, unknown>> = []
  let boundary: TypeChangeResult['boundary'] = null
  const approved = state.boundary.approved
  if (approved != null && added.length) {
    const sessions = added.filter((a) => a.session).map((a) => a.block)
    const sim = computeDay({ ...ctx, plan: [...ctx.plan, ...blocks, ...sessions], now: at + 60_000 })
    let next = Math.max(state.now, sim.boundary.proposal ?? approved)
    const cap = morningBoundary(state, inp.to, ctx.snapshot.dayType)
    if (cap != null) next = Math.min(next, cap)
    if (next !== approved) {
      events.push({ k: 'boundary.approve', day: ctx.date, at, boundary: atOf(g, next), auto: false })
      boundary = { before: approved, after: next }
    }
  }
  return { events, blocks, sessionsYes, requestBlocks: [], boundary }
}

/** The boundary approved before the first change of type, when the day was planned with `to` (the cap of a return to it). */
function morningBoundary(state: DayState, to: DayTypeId, morningType: DayTypeId): number | null {
  if (to !== morningType) return null
  const firstSwitch = state.facts.snapshots.find((s) => s.reason === 'type')?.at ?? Number.POSITIVE_INFINITY
  let found: number | null = null
  for (const a of state.facts.approvals) if (a.at < firstSwitch) found = a.boundary
  return found
}
