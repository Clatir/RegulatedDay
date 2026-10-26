/**
 * The exchange (spec principle 2 „Wymiana zamiast dokładania”, „Wymiana”): a work block added after the boundary was
 * approved that moves the forecast end of work beyond the boundary, or goes over the work budget, gets a proposal – the
 * work blocks that could give way to it, and the cost of adding it without an exchange; „Wymień” and „Dodaj bez
 * wymiany” are equal. A block that fits before the boundary and in the budget, a request and a block written in after
 * the fact get none. The cost of adding without an exchange (or of a partial one) is only the minutes by which the end
 * of work goes beyond the boundary – an ordinary extension; beyond the maximum it is an overrun with a second
 * confirmation in the same window.
 */
import type { PlanBlock } from '../model/plan'
import { isBoundaryWork, type BlockInfo } from './blocks'
import { computeDay, type DayContext, type DayState } from './day'

export interface ExchangeCandidate {
  block: PlanBlock
  /** Its planned length. */
  minutes: number
  /** Where the forecast puts it (index). */
  from: number
}

export interface ExchangeCost {
  /** Minutes the end of work goes beyond the boundary because of the block (an extension, each one counted once). */
  beyondMin: number
  /** Minutes the work budget goes over because of it (only a warning). */
  overBudgetMin: number
  /** The end of work goes beyond the maximum: an overrun, the second confirmation in the window. */
  overrun: boolean
}

export interface ExchangeProposal extends ExchangeCost {
  /** The window of the exchange is shown (otherwise the block is just added). */
  needed: boolean
  candidates: ExchangeCandidate[]
  /** The fewest latest blocks that together last at least as long as the new one (a full exchange), when there are. */
  preselected: string[]
}

/** The block counts for the boundary (work, not „nie przerywa regeneracji”, not the second shift). */
function boundaryWork(state: DayState, block: PlanBlock): boolean {
  const rules = state.settings.categories[block.categoryId]
  if (!rules || rules.cls !== 'work' || rules.keepsRegen || block.tag === 'secondShift') return false
  return rules.kind !== 'request'
}

const budgetTotal = (s: DayState) => s.budgetUsedMin + s.budget.forecastMin

/**
 * The forecast's minutes of work after the boundary (each counted once) – what would be extension: work that sets the
 * boundary, not the plan of lectures nor a „zjazd”, also after the second shift (work there reopens it) – and whether
 * any is past the maximum.
 */
function forecastExtension(s: DayState, boundary: number): { minutes: number; pastMax: boolean } {
  const marks = new Uint8Array(s.grid.length + 24 * 60)
  let pastMax = false
  for (const p of s.forecast) {
    const b = p.block
    if (!isBoundaryWork(b) || b.lectureOrCommute) continue
    for (let k = Math.max(p.from, boundary, 0); k < Math.min(p.to, marks.length); k++) {
      marks[k] = 1
      if (k >= s.boundary.max) pastMax = true
    }
  }
  let minutes = 0
  for (const m of marks) minutes += m
  return { minutes, pastMax }
}

/** What adding `block` (with `yielding` parked) costs against the day as it is (`before`). */
export function exchangeCost(ctx: DayContext, before: DayState, block: PlanBlock, yielding: readonly string[] = []): ExchangeCost {
  const gone = new Set(yielding)
  const after = computeDay({ ...ctx, plan: [...ctx.plan.filter((b) => !gone.has(b.id)), block] })
  const boundary = before.boundary.approved ?? before.boundary.proposal
  const limit = before.budget.limitMin
  const over = (s: DayState) => Math.max(0, budgetTotal(s) - limit)
  const ext = boundary == null ? null : { before: forecastExtension(before, boundary), after: forecastExtension(after, boundary) }
  return {
    beyondMin: ext ? Math.max(0, ext.after.minutes - ext.before.minutes) : 0,
    overBudgetMin: Math.max(0, over(after) - over(before)),
    overrun: ext ? ext.after.pastMax && ext.after.minutes > ext.before.minutes : false
  }
}

/** The work blocks that could give way: flexible, not begun, still to come, latest first. */
export function exchangeCandidates(ctx: DayContext, state: DayState): ExchangeCandidate[] {
  const out: ExchangeCandidate[] = []
  for (const p of state.forecast) {
    const b: BlockInfo = p.block
    if (!b.inPlan || !isBoundaryWork(b) || b.fixed || b.waits || p.running || p.from < state.now) continue
    const f = state.facts.blocks.get(b.id)
    if (f && (f.startedAt != null || f.parkedAt != null || f.cancelledAt != null)) continue
    const plan = ctx.plan.find((x) => x.id === b.id)
    if (plan) out.push({ block: plan, minutes: plan.durationMin, from: p.from })
  }
  return out.sort((a, b) => b.from - a.from || (a.block.id < b.block.id ? -1 : 1))
}

/** The proposal for a new block of the day (spec „Wymiana”). */
export function proposeExchange(ctx: DayContext, state: DayState, block: PlanBlock): ExchangeProposal {
  const none: ExchangeProposal = { needed: false, beyondMin: 0, overBudgetMin: 0, overrun: false, candidates: [], preselected: [] }
  // Before the approval the plan is still being made: its edits never call for an exchange (spec).
  if (state.boundary.approved == null || !boundaryWork(state, block)) return none
  const cost = exchangeCost(ctx, state, block)
  if (cost.beyondMin <= 0 && cost.overBudgetMin <= 0) return { ...none, ...cost }
  const candidates = exchangeCandidates(ctx, state)
  const preselected: string[] = []
  let sum = 0
  for (const c of candidates) {
    if (sum >= block.durationMin) break
    preselected.push(c.block.id)
    sum += c.minutes
  }
  return { needed: true, ...cost, candidates, preselected: sum >= block.durationMin ? preselected : [] }
}

/** The yielding blocks last together at least as long as the new one (spec „Wymiana jest pełna”). */
export function isFullExchange(block: PlanBlock, yielding: readonly ExchangeCandidate[]): boolean {
  return yielding.reduce((s, c) => s + c.minutes, 0) >= block.durationMin
}
