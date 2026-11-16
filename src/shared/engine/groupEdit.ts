/**
 * Zmiany grupowe bloków (D527–D531, ciąg Z): one action of the menu „Zmień N bloków” for the blocks selected on one day (or in one
 * template's version) – a subcategory with its variant, a variant, the cost (four pools, or „Jak podkategoria”), a routine, „Przesuń o”
 * ±N min, „Przenieś na dzień”, „Odwołaj”, „Zaparkuj”, „Usuń”. Pure: which blocks the action takes – by the rules each block has alone
 * (its panel, its tile D501, its drag D305, the timer's „Odwołaj” / „Zaparkuj”); nothing is blocked (D72, D529): the others are left out
 * and said why (`SkipWhy`) – the day's file after it (one change of the file, the push apart D367 in the same change), the lowest energy
 * before and after (D529), and what „Cofnij” needs: only the fields the change set (`FieldsUndo`), the blocks it took out
 * (`RemovalUndo`), the events it wrote (`groupLogUndo`). The window writes it (`renderer/features/today/groupActions.ts`; a template –
 * `renderer/features/templates/templateGroup.ts`).
 */
import { blockNow, dayBlocks, dayRaw, isRaw, patchedBlock, putRawBlock, setCancelled, takeBlock, type Raw } from '../data/dayEdits'
import { deepEqual } from '../data/merge'
import type { Costs } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import { dayFileFrom, PLAN_MAX, PLAN_MIN, type PlanBlock } from '../model/plan'
import { settingsOn } from '../model/settings'
import { logicalMinuteOf } from '../time/day'
import { movableBlock, plannedSpan, type BlockInfo } from './blocks'
import { begunBasis, costChangesOf, windowPassed, type CostChange } from './costChange'
import { computeDay, type DayContext, type DayState } from './day'
import { freedByEdit, type Freed } from './gaps'
import { foldFacts } from './facts'
import { atOf, idxOfLogical } from './grid'
import { computeEnergy, shownOf, type EnergyOptions } from './energy'
import { lowestEnergy } from './energyOrder'
import { groupOf, groupRootOf, placePatch, plannedStart, type BlockPatch } from './parallel'
import { leavesByCancel, moveBetweenDays, moveGroup, moveRoots, stayRuleOf, type StayRule } from './planEdit'
import { ownMinuteIdx, pushApart, withBlock, type PushedBlock, type PushHold } from './pushApart'
import { simEvents } from './sim'
import { ALREADY_OVER, timerAction, type ActionResult, type TimerDraft } from './timer'

/** What the menu of a group does (D528); `routine.minutes` – the routine's length (0: the length stays, as the panel's pick, D480). */
export type GroupAction =
  | { k: 'category'; categoryId: string; variantId: string | null }
  | { k: 'variant'; variantId: string | null }
  | { k: 'cost'; costs: Costs | null }
  | { k: 'routine'; routine: string | null; minutes: number }
  | { k: 'shift'; minutes: number }
  | { k: 'moveTo'; date: string }
  | { k: 'cancel' }
  | { k: 'park' }
  | { k: 'remove' }

/** The actions that set fields of the blocks (the panel's and the tile's). */
export type FieldAction = Extract<GroupAction, { k: 'category' | 'variant' | 'cost' | 'routine' }>
export const isFieldAction = (a: GroupAction): a is FieldAction => a.k === 'category' || a.k === 'variant' || a.k === 'cost' || a.k === 'routine'

/**
 * Why a block is left out (D529) – the short words of the line („pominięto 2: zaczęty, sesja”): begun (`zaczęty`; the cost of one
 * ended – `skończony`), parked or cancelled in the log (`zdjęty`), a session of the layer, a lecture, a class of a „zjazd”, anchored to
 * a block that does not move with it (`zakotwiczony`), anchored to a moved one but of a kind that keeps its day (`zostaje`, D426),
 * without an hour of its own, of a day gone by or with its time passed (`miniony`), shifted out of the logical day (`poza dniem`), not
 * today („Odwołaj”, „Zaparkuj” are the timer's), not of a category of the kind „rutyna”, not of the variant's subcategory, not in the
 * plan any more (`nie ma`); the timer refused „Odwołaj” / „Zaparkuj” of it (`odmowa`).
 */
export type SkipWhy =
  | 'zaczęty'
  | 'skończony'
  | 'zdjęty'
  | 'sesja'
  | 'wykład'
  | 'zjazd'
  | 'zakotwiczony'
  | 'zostaje'
  | 'bez godziny'
  | 'miniony'
  | 'poza dniem'
  | 'nie dziś'
  | 'odmowa'
  | 'nie rutyna'
  | 'inna podkategoria'
  | 'nie ma'

export interface GroupSkip {
  id: string
  why: SkipWhy
}

/**
 * The blocks of an action, in the plan's order: `take` – changed by it; `along` – selected ones it moves with another one (anchored to a
 * moved block, D424: they follow their anchor; nothing of their own is written); `same` – they have the value already; `skipped`.
 */
export interface GroupJudged {
  take: string[]
  along: string[]
  same: string[]
  skipped: GroupSkip[]
}

/** A day as counted (its plan, its facts, the forecast) – what the action is judged and laid on. */
export interface GroupDay {
  ctx: DayContext
  state: DayState
}

const kindWhy = (b: Pick<BlockInfo, 'origin'>): SkipWhy | null => (b.origin === 'session' ? 'sesja' : b.origin === 'lecture' ? 'wykład' : b.origin === 'zjazd' ? 'zjazd' : null)

/**
 * A day looked up by the blocks' ids – made once for a whole action (never per block): its plan, its blocks as the engine has them, the
 * forecast's places, and the changes of the begun blocks' costs (counted only when asked for).
 */
interface Lookup {
  day: GroupDay
  plan: ReadonlyMap<string, PlanBlock>
  infos: Map<string, BlockInfo>
  placed: ReadonlyMap<string, DayState['forecast'][number]>
  changes: () => ReadonlyMap<string, readonly CostChange[]>
}

function lookupOf(day: GroupDay): Lookup {
  let changes: ReadonlyMap<string, readonly CostChange[]> | null = null
  return {
    day,
    plan: new Map(day.ctx.plan.map((b) => [b.id, b])),
    infos: new Map(day.state.blocks.map((b) => [b.id, b])),
    placed: new Map(day.state.forecast.map((p) => [p.block.id, p])),
    changes: () => (changes ??= costChangesOf(day.ctx, day.state.facts))
  }
}

/**
 * Where a block starts on its day's axis (a logical minute) – what „Przesuń o” moves it from, as its drag moves it from where its tile
 * stands: today where the forecast shows it (a flexible block whose hour passed – from now, one after a block that runs over – after it;
 * the minute with its own number on the clock; past the day's end – its minute there), another day (and a template) at its plan; beside
 * another block – where its group starts.
 */
function axisStart(l: Lookup, id: string, today: string): number | null {
  const p = l.day.ctx.date === today ? l.placed.get(id) : undefined
  if (!p) return plannedStartOf(l.plan, id)
  const g = l.day.state.grid
  // A block the forecast shows past the day's last start (03:59): from its own minute there, never 03:59 (a shift later – out of the day).
  const k = Math.ceil(p.from) > idxOfLogical(g, PLAN_MAX) ? Math.ceil(p.from) : ownMinuteIdx(g, p.from)
  return logicalMinuteOf(g.date, atOf(g, k))
}

/** `axisStart` for one block (a lookup of its own – for many blocks use `shiftedDay`, which makes one). */
export const axisStartOf = (day: GroupDay, id: string, today: string): number | null => axisStart(lookupOf(day), id, today)

/** Where the axis shows a block's end (its index): today a block of the forecast where it puts it, else its plan. */
function endIdxOf(l: Lookup, info: BlockInfo, today: boolean): number | null {
  const placed = today ? l.placed.get(info.id) : undefined
  return placed?.to ?? plannedSpan(info, l.infos)?.end ?? null
}

/**
 * Why a block may not be moved to another place – the rule of its drag (D305, D417 – `movableBlock`): its day gone by, begun, taken
 * off (parked, cancelled), a session, a lecture, a class of a „zjazd”, anchored, without an hour of its own, its time passed.
 */
function placeWhy(l: Lookup, id: string, today: string): SkipWhy | null {
  const { day } = l
  const date = day.ctx.date
  if (date < today) return 'miniony'
  const info = l.infos.get(id)
  if (!info) return 'nie ma'
  const f = day.state.facts.blocks.get(id)
  if (f?.startedAt != null) return 'zaczęty'
  if (f?.parkedAt != null || f?.cancelledAt != null) return 'zdjęty'
  const kind = kindWhy(info)
  if (kind) return kind
  if (info.anchor != null) return 'zakotwiczony'
  if (info.start == null || !info.inPlan) return 'bez godziny'
  const isToday = date === today
  const end = endIdxOf(l, info, isToday)
  return end != null && movableBlock(info, f, end, isToday ? day.state.now : null) ? null : 'miniony'
}

/** A begun block's own cost now (D501: its start's, changed since by `block.cost`) – what its tile shows as its own. */
function begunOwn(l: Lookup, info: BlockInfo): Costs | null {
  const f = l.day.state.facts.blocks.get(info.id)
  return begunBasis(info, f?.planned, l.changes().get(info.id), l.day.state.now).own
}

/**
 * A begun block's own cost now and whether it still runs (its cost may change, D501) – for the „Cofnij” of a group's cost: undefined –
 * not begun, or not in the day.
 */
export function begunCostNow(day: GroupDay, id: string): { own: Costs | null; running: boolean } | undefined {
  const l = lookupOf(day)
  const f = day.state.facts.blocks.get(id)
  const info = l.infos.get(id)
  if (f?.startedAt == null || !info) return undefined
  return { own: begunOwn(l, info), running: f.endedAt == null }
}

/**
 * Why a field action leaves a block out – as its panel and its tile: the cost by the tile's rule (`costEditable`: a day gone by, a block
 * ended, taken off, or – today – whose time passed; a begun one is changed from now on, D501); the other fields leave out a begun block
 * (spec's example: „pominięto 1: zaczęty”), a routine one of a category not of the kind „rutyna” (the panel has no „Rutyna” there), a
 * variant one of another subcategory.
 */
function fieldWhy(l: Lookup, b: PlanBlock, a: FieldAction, today: string): SkipWhy | null {
  const { day } = l
  const date = day.ctx.date
  const f = day.state.facts.blocks.get(b.id)
  if (a.k === 'cost') {
    if (date < today) return 'miniony'
    if (f?.startedAt != null) return f.endedAt != null ? 'skończony' : null
    if (f?.parkedAt != null || f?.cancelledAt != null) return 'zdjęty'
    const info = l.infos.get(b.id)
    return date === today && info && windowPassed(info, l.infos, day.state.now) ? 'miniony' : null
  }
  if (f?.startedAt != null) return 'zaczęty'
  const rules = day.state.settings.categories[b.categoryId]
  if (a.k === 'routine' && rules?.kind !== 'routine') return 'nie rutyna'
  if (a.k === 'variant' && a.variantId != null && !rules?.variants.some((v) => v.id === a.variantId)) return 'inna podkategoria'
  return null
}

/** The block has the value already (nothing to write). */
function fieldSame(l: Lookup, b: PlanBlock, a: FieldAction): boolean {
  switch (a.k) {
    case 'category':
      return b.categoryId === a.categoryId && b.variantId === a.variantId
    case 'variant':
      return b.variantId === a.variantId
    case 'routine':
      return b.routine === a.routine
    case 'cost': {
      const info = l.infos.get(b.id)
      const own = l.day.state.facts.blocks.get(b.id)?.startedAt != null && info ? begunOwn(l, info) : b.costs
      return deepEqual(own, a.costs)
    }
  }
}

/** The patch a field action sets on a block (a routine – with its length, as the panel picks it: D480 – its steps never copied). */
export function fieldPatch(a: FieldAction): Partial<PlanBlock> {
  switch (a.k) {
    case 'category':
      return { categoryId: a.categoryId, variantId: a.variantId }
    case 'variant':
      return { variantId: a.variantId }
    case 'cost':
      return { costs: a.costs }
    case 'routine':
      return { routine: a.routine, ...(a.routine && a.minutes > 0 ? { durationMin: a.minutes } : {}) }
  }
}

/** A block's planned start (a logical minute, `parallel.ts` `plannedStart`): beside another – its group's, anchored – its anchor's end. */
function plannedStartOf(plan: ReadonlyMap<string, PlanBlock>, id: string): number | null {
  const b = plan.get(id)
  return b ? plannedStart(b, plan) : null
}

/** The selected block whose anchor chain reaches a block in `moving` (it follows its anchor, D424). */
function followsMoving(plan: ReadonlyMap<string, PlanBlock>, id: string, moving: ReadonlySet<string>): boolean {
  let a = plan.get(id)?.anchor ?? null
  for (let depth = 0; a != null && depth < 40; depth++) {
    if (moving.has(a)) return true
    a = plan.get(a)?.anchor ?? null
  }
  return false
}

/**
 * The time a removal of the blocks `take` frees today (D368, `freedByEdit` of each): a block anchored to another removed one is in that
 * one's freed time already (`freedByEdit` counts the blocks that leave with it) – never twice; when that one frees nothing (begun, in the
 * background, its time passed, taken off), the anchored block's own freed time counts.
 */
export function groupFreed(day: GroupDay, take: readonly string[]): Freed[] {
  const plan = new Map(day.ctx.plan.map((b) => [b.id, b]))
  const taken = new Set(take)
  const own = new Map(take.map((id) => {
    const b = plan.get(id)
    return [id, b ? freedByEdit(day.state, b, null) : null] as const
  }))
  /** An anchor up the chain is removed too and frees its time – with this block in it: the chain only through blocks not begun (a begun one
   * stays where it ran, `freedByEdit` – what is anchored to it is not in the time of the blocks before it). */
  const covered = (id: string): boolean => {
    let a = plan.get(id)?.anchor ?? null
    for (let depth = 0; a != null && depth < 40; depth++) {
      if (day.state.facts.blocks.get(a)?.startedAt != null) return false
      if (taken.has(a) && own.get(a) != null) return true
      a = plan.get(a)?.anchor ?? null
    }
    return false
  }
  return take.flatMap((id) => {
    const f = own.get(id)
    return f && !covered(id) ? [f] : []
  })
}

/**
 * Which of the selected blocks (`ids`) the action takes (D528, D529): each by the rule it has alone. `today` – the logical day now (a
 * template: '' – no day of its own); `stay` – what keeps an anchored block on its day at „Przenieś na dzień” (default: the day's facts and
 * settings – D424, D426).
 */
export function judgeGroup(day: GroupDay, ids: readonly string[], a: GroupAction, today: string, o: { stay?: StayRule } = {}): GroupJudged {
  const { ctx, state } = day
  const date = ctx.date
  const out: GroupJudged = { take: [], along: [], same: [], skipped: [] }
  const wanted = new Set(ids)
  const l = lookupOf(day)
  const plan = l.plan
  for (const id of wanted) if (!plan.has(id)) out.skipped.push({ id, why: 'nie ma' })
  const picked = ctx.plan.filter((b) => wanted.has(b.id))
  const skip = (b: PlanBlock, why: SkipWhy) => out.skipped.push({ id: b.id, why })
  if (isFieldAction(a)) {
    for (const b of picked) {
      const why = fieldWhy(l, b, a, today)
      if (why) skip(b, why)
      else if (fieldSame(l, b, a)) out.same.push(b.id)
      else out.take.push(b.id)
    }
    return out
  }
  if (a.k === 'remove') {
    out.take.push(...picked.map((b) => b.id))
    return out
  }
  if (a.k === 'cancel' || a.k === 'park') {
    for (const b of picked) {
      const why = dayActionWhy(day, b.id, today)
      if (why) skip(b, why)
      else out.take.push(b.id)
    }
    return out
  }
  if (a.k === 'moveTo' && a.date === date) {
    out.same.push(...picked.map((b) => b.id))
    return out
  }
  // „Przesuń o”, „Przenieś na dzień”: the rule of a drag (D305); a day gone by is never the target (D417).
  const anchored: PlanBlock[] = []
  for (const b of picked) {
    const why = a.k === 'moveTo' && a.date < today ? 'miniony' : placeWhy(l, b.id, today)
    if (why === 'zakotwiczony') anchored.push(b)
    else if (why) skip(b, why)
    else if (a.k === 'shift') {
      const start = axisStart(l, b.id, today)
      const to = start == null ? null : start + a.minutes
      if (to == null || to < PLAN_MIN || to > PLAN_MAX - 1) skip(b, 'poza dniem')
      else out.take.push(b.id)
    } else out.take.push(b.id)
  }
  const moving = new Set(out.take)
  if (a.k === 'shift') {
    for (const b of anchored) {
      if (followsMoving(plan, b.id, moving)) out.along.push(b.id)
      else skip(b, 'zakotwiczony')
    }
  } else {
    const stay = o.stay ?? stayRuleOf(state.facts, ctx.snapshot.settings)
    const groups = moveRoots(ctx.plan, out.take, stay).map((id) => moveGroup(ctx.plan, id, stay))
    const followers = new Set(groups.flatMap((g) => g.followers.map((f) => f.id)))
    const stayers = new Set(groups.flatMap((g) => g.stayers.map((s) => s.id)))
    for (const b of anchored) {
      if (followers.has(b.id)) out.along.push(b.id)
      else skip(b, stayers.has(b.id) ? 'zostaje' : 'zakotwiczony')
    }
  }
  const order = new Map(ctx.plan.map((b, i) => [b.id, i]))
  out.along.sort((x, y) => order.get(x)! - order.get(y)!)
  return out
}

/** Why a block is no block of today's actions „Odwołaj” / „Zaparkuj” (the timer's): another day, begun, taken off. */
function dayActionWhy(day: GroupDay, id: string, today: string): SkipWhy | null {
  const date = day.ctx.date
  const f = day.state.facts.blocks.get(id)
  return date < today ? 'miniony' : date > today ? 'nie dziś' : f?.startedAt != null ? 'zaczęty' : f?.parkedAt != null || f?.cancelledAt != null ? 'zdjęty' : null
}

/** The rules of the menu's entries (D528): the fields of the panel, the tile's cost, the routine, a new place (a shift, a move), the day's actions. */
export type MenuRule = 'fields' | 'cost' | 'routine' | 'place' | 'day'

/** How many of the selected blocks a rule takes, and the reason of each one it leaves out. */
export interface RuleVerdict {
  take: number
  skipped: SkipWhy[]
}

/**
 * Whether a rule of the menu takes any of the selected blocks (D528, T1720: an entry none takes is off, with the reasons) – one pass over the
 * blocks with one lookup of the day, whatever the value picked later (a block that has it already is taken: the rule does not stop it). A new
 * place counts a block anchored to one that moves (it goes with it); a template has no actions of a day (`dayActions` false).
 */
export function ruleVerdicts(day: GroupDay, ids: readonly string[], today: string, o: { dayActions?: boolean } = {}): Partial<Record<MenuRule, RuleVerdict>> {
  const l = lookupOf(day)
  const wanted = new Set(ids)
  const picked = day.ctx.plan.filter((b) => wanted.has(b.id))
  const gone = [...wanted].filter((id) => !l.plan.has(id)).map((): SkipWhy => 'nie ma')
  const verdict = (why: (b: PlanBlock) => SkipWhy | null): RuleVerdict => {
    const skipped = [...gone]
    let take = 0
    for (const b of picked) {
      const w = why(b)
      if (w) skipped.push(w)
      else take++
    }
    return { take, skipped }
  }
  // A new place: the rule of a drag; an anchored block counts when what it follows moves.
  const placeWhys = new Map(picked.map((b) => [b.id, placeWhy(l, b.id, today)]))
  const moving = new Set(picked.filter((b) => placeWhys.get(b.id) == null).map((b) => b.id))
  const out: Partial<Record<MenuRule, RuleVerdict>> = {
    fields: verdict((b) => fieldWhy(l, b, { k: 'category', categoryId: b.categoryId, variantId: b.variantId }, today)),
    cost: verdict((b) => fieldWhy(l, b, { k: 'cost', costs: null }, today)),
    routine: verdict((b) => fieldWhy(l, b, { k: 'routine', routine: null, minutes: 0 }, today)),
    place: verdict((b) => {
      const w = placeWhys.get(b.id) ?? null
      return w === 'zakotwiczony' && followsMoving(l.plan, b.id, moving) ? null : w
    })
  }
  if (o.dayActions !== false) out.day = verdict((b) => dayActionWhy(day, b.id, today))
  return out
}

/** The plan with the patches laid (each over the block as the plan has it then). */
export function patchedPlan(plan: readonly PlanBlock[], patches: readonly BlockPatch[]): PlanBlock[] {
  const by = new Map<string, Partial<PlanBlock>>()
  for (const p of patches) by.set(p.id, { ...by.get(p.id), ...p.patch })
  return plan.map((b) => (by.has(b.id) ? { ...b, ...by.get(b.id)! } : b))
}

/** The day's file with the patches laid, each over the block as the file holds it then (a change made a moment before stays, A6-01). */
export function patchedDay(raw: Raw | null, date: string, plan: readonly PlanBlock[], patches: readonly BlockPatch[]): Raw {
  const byId = new Map(plan.map((b) => [b.id, b]))
  let r = dayRaw(raw, date)
  for (const p of patches) {
    const b = byId.get(p.id)
    if (b) r = patchedBlock(r, date, b, p.patch)
  }
  return r
}

/** The patches of a field action for the blocks it takes. */
export const fieldPatches = (take: readonly string[], a: FieldAction): BlockPatch[] => take.map((id) => ({ id, patch: fieldPatch(a) }))

/**
 * „Przesuń o” ±N min (D528): every block taken starts `minutes` later (earlier) than where its tile stands (`startOf`, by default its
 * plan), minute by minute, no rounding. The blocks taken of one group of parallel blocks (D492) move together and stay a group: the whole
 * group – its first block only (the others stand beside it); a part of it – the first of the part is the first block of a new group, the
 * rest of the part beside it, and the blocks not taken stay together where they were (`leaveGroup`, T1166: the next of them is their first
 * block). The patches come in the order the day's file takes them: those that move first, then the ones that stay (`putBlock` gives
 * the blocks beside a block its start – the ones that stay are written after it).
 */
export function shiftPatches(plan: readonly PlanBlock[], take: readonly string[], minutes: number, startOf?: (id: string) => number | null): BlockPatch[] {
  const taken = new Set(take)
  const planned = new Map(plan.map((b) => [b.id, b]))
  const from = startOf ?? ((id: string) => plannedStartOf(planned, id))
  const moves: BlockPatch[] = []
  const stays: BlockPatch[] = []
  const done = new Set<string>()
  for (const id of take) {
    if (done.has(id)) continue
    const group = groupOf(plan, id)
    for (const g of group) done.add(g)
    const start = from(group[0]!)
    if (start == null) continue
    if (group.length === 1) {
      // A block of no group (one that names a block gone from the plan loses the name, `placePatch`).
      moves.push({ id, patch: placePatch(plan, id, { startMin: start + minutes }).patch })
      continue
    }
    const part = group.filter((g) => taken.has(g))
    const rest = group.filter((g) => !taken.has(g))
    if (!rest.length) {
      // The whole group: its first block only – the day's file gives the others its start (`putBlock`).
      moves.push({ id: group[0]!, patch: { startMin: start + minutes } })
      continue
    }
    const [first, ...beside] = part
    moves.push({ id: first!, patch: { startMin: start + minutes, alongside: null, anchor: null } })
    for (const b of beside) moves.push({ id: b, patch: { startMin: start + minutes, alongside: first! } })
    // The first block of the group moved: the next block that stays is the first of the others (at the group's planned start).
    if (part.includes(group[0]!)) {
      const at = plannedStartOf(planned, group[0]!)
      const [head, ...others] = rest
      const place = at != null ? { startMin: at, anchor: null } : {}
      stays.push({ id: head!, patch: { alongside: null, ...place } }, ...others.map((x) => ({ id: x, patch: { alongside: head!, ...place } })))
    }
  }
  return [...moves, ...stays]
}

/**
 * The blocks a group put at new places pushes apart (D367): counted from the first of them in the foreground (by its new start) as the
 * block put, the others as the blocks the change put too (`pushApart` `placed`: they keep the hours it gave them, a block that would take
 * the place of one of them goes behind it); what is written is what the day shows after the save. The plan `after` has them all at
 * their new places. Nothing of the foreground among them – nothing pushed.
 */
export function groupPush(day: GroupDay, after: readonly PlanBlock[], moved: ReadonlySet<string>, o: { onUnsettled?: () => void; hold?: PushHold } = {}): PushedBlock[] {
  const cats = day.ctx.snapshot.settings.categories
  const map = new Map(after.map((b) => [b.id, b]))
  const lead = after
    .filter((b) => moved.has(b.id) && b.startMin != null && b.anchor == null && groupRootOf(map, b.id) == null && !(b.background ?? cats[b.categoryId]?.startsInBackground ?? false))
    .sort((x, y) => x.startMin! - y.startMin!)[0]
  return lead ? pushApart(day.ctx, day.state, after, lead.id, { ...o, placed: moved }) : []
}

/** The plan and the day's file with the pushed starts (D367), each over the block as the file holds it then. */
function withPushedStarts(raw: Raw, date: string, plan: readonly PlanBlock[], pushed: readonly PushedBlock[]): { raw: Raw; plan: PlanBlock[] } {
  const starts = new Map(pushed.map((p) => [p.id, p.startMin]))
  let r = raw
  const byId = new Map(plan.map((b) => [b.id, b]))
  for (const p of pushed) {
    const b = byId.get(p.id)
    if (b) r = patchedBlock(r, date, b, { startMin: p.startMin })
  }
  return { raw: r, plan: plan.map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b)) }
}

/** A change of the day's file and the plan after it; `pushed` – the blocks it pushed apart (D367). */
export interface DayChanged {
  raw: Raw
  plan: PlanBlock[]
  pushed: PushedBlock[]
}

/**
 * „Przesuń o” on the day's file: the blocks taken at their new starts (from where the axis shows them – `axisStart`, `today` the logical
 * day now) and the blocks they push apart (a day to come, D367 – a day gone by is history).
 */
export function shiftedDay(day: GroupDay, raw: Raw | null, take: readonly string[], minutes: number, today: string, onUnsettled?: () => void): DayChanged {
  const date = day.ctx.date
  const l = lookupOf(day)
  const patches = shiftPatches(day.ctx.plan, take, minutes, (id) => axisStart(l, id, today))
  const after = patchedPlan(day.ctx.plan, patches)
  const pushed = date >= today ? groupPush(day, after, new Set(take), { onUnsettled }) : []
  const done = withPushedStarts(patchedDay(raw, date, day.ctx.plan, patches), date, after, pushed)
  return { ...done, pushed }
}

/** A begun block whose cost the action changes from now on (D501: `block.cost` in its log), with its own cost before (for „Cofnij”). */
export interface BegunCost {
  id: string
  was: Costs | null
}

/**
 * A field action on the day's file. A begun block (only the cost takes one, `judgeGroup`) is no edit of the file: its cost is an event of
 * the day's log from now on (`begun`, with its own cost before – what „Cofnij” writes back while it still has this one).
 */
export function fieldDay(day: GroupDay, raw: Raw | null, take: readonly string[], a: FieldAction): DayChanged & { begun: BegunCost[] } {
  const begun = take.filter((id) => day.state.facts.blocks.get(id)?.startedAt != null)
  const patches = fieldPatches(
    take.filter((id) => !begun.includes(id)),
    a
  )
  const l = lookupOf(day)
  return {
    raw: patchedDay(raw, day.ctx.date, day.ctx.plan, patches),
    plan: patchedPlan(day.ctx.plan, patches),
    pushed: [],
    begun: begun.flatMap((id) => {
      const info = l.infos.get(id)
      return info ? [{ id, was: begunOwn(l, info) }] : []
    })
  }
}

/** A block's raw entry in a day's file (none – undefined). */
const rawEntry = (raw: Raw, id: string): Raw | undefined => dayBlocks(raw).find((x): x is Raw => isRaw(x) && x.id === id)

/** A block taken out of the day: the raw block of the file to put back (yours), or null – the snapshot's, cancelled for the day. */
export interface RemovalUndo {
  id: string
  raw: Raw | null
}

/** The plan without the blocks `gone` and the ones anchored to them (as `dayPlan` leaves them out – a chain of anchors too). */
function planWithout(plan: readonly PlanBlock[], gone: ReadonlySet<string>): PlanBlock[] {
  let out = plan.filter((b) => !gone.has(b.id))
  for (let changed = true; changed; ) {
    const ids = new Set(out.map((b) => b.id))
    const next = out.filter((b) => !b.anchor || ids.has(b.anchor))
    changed = next.length !== out.length
    out = next
  }
  return out
}

/**
 * „Usuń” on the day's file (spec „Usuwanie”, as `removeDayBlock` of each): one of yours taken out of the file, one of the snapshot (a
 * template's, a series', a session, a lecture) cancelled for the day – with what „Cofnij” puts back.
 */
export function removedDay(day: GroupDay, raw: Raw | null, take: readonly string[]): DayChanged & { undo: RemovalUndo[] } {
  const date = day.ctx.date
  let r = dayRaw(raw, date)
  const file = dayFileFrom(r, date)
  const undo: RemovalUndo[] = []
  for (const id of take) {
    if (leavesByCancel(id, day.ctx.snapshot, file)) {
      r = setCancelled(r, id, true)
      undo.push({ id, raw: null })
    } else {
      const was = rawEntry(r, id)
      r = takeBlock(r, id)
      if (was) undo.push({ id, raw: was })
    }
  }
  return { raw: r, plan: planWithout(day.ctx.plan, new Set(take)), pushed: [], undo }
}

/** „Cofnij” of a removal: each block back while it is still gone (one of yours not in the file, one of the snapshot still cancelled). */
export function undoRemoval(raw: Raw | null, date: string, items: readonly RemovalUndo[]): { raw: Raw; restored: string[]; kept: string[] } {
  let r = dayRaw(raw, date)
  const file = dayFileFrom(r, date)
  const cancelled = new Set(file.cancelled)
  const own = new Set(file.blocks.map((b) => b.id))
  const restored: string[] = []
  const kept: string[] = []
  for (const u of items) {
    if (u.raw == null ? cancelled.has(u.id) : !own.has(u.id)) {
      r = u.raw == null ? setCancelled(r, u.id, false) : putRawBlock(r, u.raw)
      restored.push(u.id)
    } else kept.push(u.id)
  }
  return { raw: r, restored, kept }
}

/** What a group move to another day writes (D528): both files, the blocks that went, those that stayed (D424) and the pushed ones. */
export interface GroupMove {
  source: Raw
  /** The target with the blocks brought (the owner of the edit, T952). */
  bring: Raw
  /** The target with the pushed starts too (D367). */
  target: Raw
  /** The blocks that went: the ones taken and their followers. */
  moved: string[]
  stayers: PlanBlock[]
  pushed: PushedBlock[]
}

/**
 * „Przenieś na dzień” (D528): each block taken moved as „Przenieś na…” moves one (`moveBetweenDays`: its id stays, one move more, the day
 * it came from; the blocks anchored to it that may go – with it, D424, D426), each at its own hour; a block beside the first block of its
 * group stays beside it when that one goes too. The target's flexible blocks on the places taken are pushed apart (D367, `to` – the target
 * as counted; none – no push, as „Przenieś na…” on a day that cannot be counted).
 */
export function movedDays(o: { from: GroupDay; to: GroupDay | null; fromRaw: Raw | null; toRaw: Raw | null; take: readonly string[]; toDate: string; stay: StayRule; onUnsettled?: () => void }): GroupMove {
  const fromDate = o.from.ctx.date
  const plan = o.from.ctx.plan
  const map = new Map(plan.map((b) => [b.id, b]))
  const roots = moveRoots(plan, o.take, o.stay)
  const going = new Set(roots)
  let source: Raw | null = o.fromRaw
  let bring: Raw | null = o.toRaw
  const moved: string[] = []
  const stayers: PlanBlock[] = []
  for (const id of roots) {
    const b = blockNow(dayRaw(source, fromDate), fromDate, map.get(id)!)
    const root = groupRootOf(map, id)
    const two = moveBetweenDays(source, bring, b, plan, fromDate, o.toDate, true, { stay: o.stay, alongside: root != null && going.has(root) ? root : null })
    source = two.source
    bring = two.target
    moved.push(id, ...two.followers.map((f) => f.id))
    stayers.push(...two.stayers)
  }
  const src = dayRaw(source, fromDate)
  const brought = dayRaw(bring, o.toDate)
  if (!o.to) return { source: src, bring: brought, target: brought, moved, stayers, pushed: [] }
  const p = pushedInto(o.to, brought, o.toDate, moved, o.onUnsettled)
  return { source: src, bring: brought, target: p.target, moved, stayers, pushed: p.pushed }
}

/**
 * The target of a move with the blocks `moved` brought into its file (`brought` – one move or several, from several days): its flexible blocks
 * on the places taken pushed apart (D367, `groupPush` – the moved ones hold their hours), each over the block as the file holds it then.
 */
export function pushedInto(to: GroupDay, brought: Raw, toDate: string, moved: readonly string[], onUnsettled?: () => void): { target: Raw; pushed: PushedBlock[] } {
  const ids = new Set(moved)
  const there = dayFileFrom(brought, toDate).blocks.filter((b) => ids.has(b.id))
  const after = there.reduce((p, b) => withBlock(p, b), [...to.ctx.plan])
  const pushed = groupPush(to, after, ids, { onUnsettled })
  return { target: withPushedStarts(brought, toDate, after, pushed).raw, pushed }
}

/**
 * The fields a group's change sets on a block – the only ones its „Cofnij” puts back (D529); `added` – a block of the snapshot (a
 * template's, a series') the change wrote into the day's file, which had no entry of it: the entry as the change wrote it (its „Cofnij”
 * takes the entry out again while it stands so – the block is the snapshot's again, as before).
 */
export interface FieldsUndo {
  id: string
  before: Partial<PlanBlock>
  after: Partial<PlanBlock>
  added?: Raw
}

/** The fields a group's action may change (with a push and a group of parallel blocks left: the start, the anchor, `alongside`). */
const UNDO_KEYS = ['categoryId', 'variantId', 'costs', 'routine', 'durationMin', 'startMin', 'anchor', 'alongside'] as const satisfies ReadonlyArray<keyof PlanBlock>

/** What changed between a block before and after (null – nothing of `UNDO_KEYS`). */
export function changedFields(was: PlanBlock, now: PlanBlock): FieldsUndo | null {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const k of UNDO_KEYS) {
    if (deepEqual(was[k], now[k])) continue
    before[k] = was[k]
    after[k] = now[k]
  }
  return Object.keys(before).length ? { id: now.id, before: before as Partial<PlanBlock>, after: after as Partial<PlanBlock> } : null
}

/** The fields every block of the lists changed (`before` – as the plan had it where the list has it not). */
export function fieldsUndoIn(before: readonly PlanBlock[], after: readonly PlanBlock[], plan: readonly PlanBlock[] = []): FieldsUndo[] {
  const was = new Map([...plan, ...before].map((b) => [b.id, b]))
  return after.flatMap((b) => {
    const w = was.get(b.id)
    const c = w ? changedFields(w, b) : null
    return c ? [c] : []
  })
}

/**
 * The fields every block of the day's file changed from `beforeRaw` to `afterRaw` (a block of the snapshot – as the plan has it, with the
 * entry the change added, `added`).
 */
export function fieldsUndoOf(beforeRaw: Raw | null, afterRaw: Raw, date: string, plan: readonly PlanBlock[]): FieldsUndo[] {
  const was = dayRaw(beforeRaw, date)
  return fieldsUndoIn(dayFileFrom(was, date).blocks, dayFileFrom(afterRaw, date).blocks, plan).map((u) => {
    const added = rawEntry(was, u.id) ? undefined : rawEntry(afterRaw, u.id)
    return added ? { ...u, added } : u
  })
}

/** The block still has every field as the change left it (D529, D313: one changed since stays as it is). */
const stands = (b: PlanBlock, u: FieldsUndo): boolean => Object.entries(u.after).every(([k, v]) => deepEqual(b[k as keyof PlanBlock], v))

/**
 * „Cofnij” of the fields on a list of blocks (a template's version): each block whose fields stand as the change left them gets them back;
 * one changed since (or gone) stays as it is (`kept`). Judged on the list as it is before any of them goes back.
 */
export function undoFieldsIn(blocks: readonly PlanBlock[], items: readonly FieldsUndo[]): { blocks: PlanBlock[]; restored: string[]; kept: string[] } {
  const now = new Map(blocks.map((b) => [b.id, b]))
  const back = new Map<string, Partial<PlanBlock>>()
  const kept: string[] = []
  for (const u of items) {
    const b = now.get(u.id)
    if (b && stands(b, u)) back.set(u.id, u.before)
    else kept.push(u.id)
  }
  return { blocks: blocks.map((b) => (back.has(b.id) ? { ...b, ...back.get(b.id)! } : b)), restored: [...back.keys()], kept }
}

/**
 * „Cofnij” of the fields on the day's file (`undoFieldsIn` over its blocks, each written over the block as the file holds it then). A block
 * of the snapshot whose entry the change added goes out of the file again while the entry stands as the change wrote it (`added`); one
 * changed since in another field too keeps its entry, with the fields back.
 */
export function undoFields(raw: Raw | null, date: string, items: readonly FieldsUndo[]): { raw: Raw; restored: string[]; kept: string[] } {
  const was = dayRaw(raw, date)
  let r = was
  const file = dayFileFrom(r, date).blocks
  const { restored, kept } = undoFieldsIn(file, items)
  const back = new Set(restored)
  for (const u of items) {
    if (!back.has(u.id)) continue
    if (u.added && deepEqual(rawEntry(was, u.id), u.added)) r = takeBlock(r, u.id)
    else r = patchedBlock(r, date, file.find((x) => x.id === u.id)!, u.before)
  }
  return { raw: r, restored, kept }
}

/** The lowest energy of the day from now, as shown (D369: the lowest of the pools to the bedtime); null – unknown (no check-in, off). */
export function lowestShown(ctx: DayContext, state: DayState, opts: EnergyOptions): number | null {
  const low = lowestEnergy(computeEnergy(ctx, state, opts))
  return low == null ? null : shownOf(low)
}

/** The lowest energy before and after a change (D529: „najniższa energia 52 → 44”). */
export interface EnergyChange {
  before: number
  after: number
}

/**
 * The lowest energy of the day before the change and with it – the same engine as „Ułóż pod energię” (`lowestEnergy`): the day counted
 * again with the plan after it (`plan`) and the events it writes (`events` – „Odwołaj”, „Zaparkuj”). Null – the day has no forecast of
 * energy (no check-in, the module off), or the change does not change it (the line says nothing then).
 */
export function groupEnergy(day: GroupDay, change: { plan?: readonly PlanBlock[]; events?: readonly AnyEvent[] }, opts: EnergyOptions): EnergyChange | null {
  const before = lowestShown(day.ctx, day.state, opts)
  if (before == null) return null
  const ctx: DayContext = { ...day.ctx, ...(change.plan ? { plan: change.plan } : {}), ...(change.events?.length ? { events: [...day.ctx.events, ...change.events] } : {}) }
  const after = lowestShown(ctx, computeDay(ctx), opts)
  return after == null || after === before ? null : { before, after }
}

/**
 * Why the timer refused „Odwołaj” / „Zaparkuj” of a block alone (a block begun, taken off or not in the plan is left out before it is
 * asked): over (`skończony`), any other refusal (`odmowa`).
 */
const refusalWhy = (r: Extract<ActionResult, { ok: false }>): SkipWhy => (r.code === 'alreadyOver' || r.why === ALREADY_OVER ? 'skończony' : 'odmowa')

/**
 * „Odwołaj” / „Zaparkuj” of a group (D528) – today's actions of the timer, as each block's alone (`timerAction` 'cancel' / 'park': a
 * block not begun – `block.cancel` / `block.park`; the last fixed block of work left cancelled after „Koniec pracy” parks the flexible
 * work too and ends the paused work, D216). The blocks by their hours (where the forecast shows them; the plan's order – a tie), each once
 * (the order of the selection, of the plan's file or a repeat changes nothing); each one judged on the day with what the ones before it wrote – their events folded into the day's facts, which is all the
 * timer's „Odwołaj” and „Zaparkuj” read (a block an earlier one parked is taken off already, a fixed block of work cancelled before is no
 * more left). A block begun, taken off or not in the plan is left out (D529), a refusal – with its reason (`refusalWhy`).
 */
export function groupLogDrafts(ctx: DayContext, state: DayState, kind: 'cancel' | 'park', ids: readonly string[], at: number): { drafts: TimerDraft[]; taken: string[]; skipped: GroupSkip[] } {
  const wanted = new Set(ids)
  const infos = new Map(state.blocks.map((b) => [b.id, b]))
  const shown = new Map(state.forecast.map((x) => [x.block.id, x.from]))
  const rank = new Map(ctx.plan.map((b, i) => [b.id, i]))
  const hour = (id: string) => shown.get(id) ?? (infos.has(id) ? plannedSpan(infos.get(id)!, infos)?.start : undefined) ?? Number.POSITIVE_INFINITY
  const inPlan = ctx.plan
    .filter((b) => wanted.has(b.id))
    .map((b) => b.id)
    .sort((x, y) => hour(x) - hour(y) || rank.get(x)! - rank.get(y)!)
  const known = new Set(inPlan)
  const drafts: TimerDraft[] = []
  const taken: string[] = []
  const skipped: GroupSkip[] = [...wanted].filter((id) => !known.has(id)).map((id) => ({ id, why: 'nie ma' as const }))
  const bodiesAt = (t: number) => (ctx.changes ? settingsOn(ctx.changes, ctx.date, t) : ctx.snapshot.settings)
  let cx = ctx
  let st = state
  for (const id of inPlan) {
    const f = st.facts.blocks.get(id)
    const why: SkipWhy | null = !infos.get(id)?.inPlan ? 'nie ma' : f?.startedAt != null ? 'zaczęty' : f?.parkedAt != null || f?.cancelledAt != null ? 'zdjęty' : null
    if (why) {
      skipped.push({ id, why })
      continue
    }
    const r = timerAction(cx, st, { a: kind, block: id }, at)
    if (!r.ok) {
      skipped.push({ id, why: refusalWhy(r) })
      continue
    }
    // Its events added once to the day the next one is judged on (ids of their own, after every event of the day).
    const more = simEvents(cx, r.events, at, { c: '~group', n: drafts.length }).map((e, i) => ({ ...e, id: `group-${drafts.length + i}` }) as AnyEvent)
    drafts.push(...r.events)
    taken.push(id)
    cx = { ...cx, events: [...cx.events, ...more] }
    st = { ...state, facts: foldFacts(state.grid, [...cx.events].sort(compareEvents), bodiesAt) }
  }
  return { drafts, taken, skipped }
}

/** Why the „Cofnij” of a group's „Odwołaj” / „Zaparkuj” is refused (the day's log said otherwise). */
export const GROUP_UNDO_TEXT = {
  frozen: 'ten dzień jest już zamrożony',
  gone: 'tych zmian nie ma już w logu dnia',
  foreign: 'to nie są zmiany tej grupy'
} as const

type LoggedBlock = AnyEvent & { block: string; rule?: unknown; at?: unknown }

/**
 * „Cofnij” of a group's „Odwołaj” / „Zaparkuj” (D529): an `undo` of each event it wrote (`ids` – what the write answered), judged on the
 * day as it is now – one already undone is left. The group's own events are `block.cancel` / `block.park` of yours (`rule` 'user'); with
 * them only what the cancel of the last fixed block of work wrote at the same instant on the same computer (D216 – `workEndParking`: the
 * flexible work parked, the paused work ended, rule 'workEnd'), as the „Cofnij” of a close takes its ends (`closeUndoEvents`). A block parked
 * or cancelled that began since stays as it is (`kept`, D313); the end of paused work goes back whatever came after it. `restored` – the
 * group's own blocks back in the plan after it, `kept` – the others of them (begun since, or taken off by another event); what went with
 * them goes back, uncounted. Refused on a frozen day, when the events are not in the log (`gone`) or not the group's (`foreign`).
 */
export function groupLogUndo(state: DayState, events: readonly AnyEvent[], ids: readonly string[], at: number): { drafts: TimerDraft[]; kept: string[]; restored: string[] } | string {
  if (state.facts.frozen) return GROUP_UNDO_TEXT.frozen
  const byId = new Map<string, AnyEvent>()
  for (const e of events) if (isKnown(e)) byId.set(e.id, e)
  const found = [...new Set(ids)].map((id) => byId.get(id))
  if (!found.length || found.some((e) => !e)) return GROUP_UNDO_TEXT.gone
  const list = found as LoggedBlock[]
  const own = (e: LoggedBlock) => (e.k === 'block.cancel' || e.k === 'block.park') && e.rule === 'user'
  const mine = list.filter(own)
  const withIt = (e: LoggedBlock) => (e.k === 'block.park' || e.k === 'block.end') && e.rule === 'workEnd' && mine.some((u) => u.c === e.c && u.at === e.at)
  if (!mine.length || !list.every((e) => own(e) || withIt(e))) return GROUP_UNDO_TEXT.foreign
  const drafts: TimerDraft[] = []
  const kept = new Set<string>()
  const undone: string[] = []
  for (const e of list) {
    if (state.facts.undone.has(e.id)) continue
    if (e.k !== 'block.end' && state.facts.blocks.get(e.block)?.startedAt != null) {
      if (own(e)) kept.add(e.block)
      continue
    }
    drafts.push({ k: 'undo', at, target: e.id, reason: 'user' })
    // What the cancel wrote besides (D216) goes back with it – the line counts the blocks of the group.
    if (own(e)) undone.push(e.block)
  }
  // Back in the plan with these undone – one taken off by another event too (parked, cancelled since) stays so: kept.
  const sim = simEvents({ date: state.grid.date, events }, drafts, at, { c: '~undo', n: 0 }).map((e, i) => ({ ...e, id: `group-undo-${i}` }) as AnyEvent)
  const facts = foldFacts(state.grid, [...events, ...sim].sort(compareEvents))
  const restored = new Set<string>()
  for (const b of undone) {
    const f = facts.blocks.get(b)
    if (f?.parkedAt != null || f?.cancelledAt != null) kept.add(b)
    else restored.add(b)
  }
  return { drafts, kept: [...kept], restored: [...restored] }
}
