/**
 * Rozsuwanie on the axis of a template (D367, D372): a block of the version dragged by its body (D305) or an edge (D365),
 * or a new one from the grid (D366), on a taken place pushes the flexible blocks of the template after it apart – counted
 * on the day the version makes (the same `pushApart` and forecast as „Dziś”), once for the preview and for the save. The
 * axis keeps the day's wake of the weeks the sessions start earlier (D372): the morning before the first fixed block shows
 * `delta` minutes from its hours in the template (`wakeShiftedStart`). What it shows is written in the template's hours
 * (`unshiftedStart`); a place it cannot show a morning block at (the last `-delta` minutes before the first fixed block,
 * past the last start at the day's end) is the nearest one it can – for the block put there and for every pushed one
 * (`pushApart`'s `hold`), counted with the first fixed block of the changed plan – so what the preview shows is what the
 * day shows after the save, the blocks a moved fixed block shifts or unshifts included. Without a DOM.
 */
import { firstFixedStart, shiftedStart, unshiftedStart } from '@shared/engine/createDay'
import type { DayContext, DayState } from '@shared/engine/day'
import { idxOfLogical, logicalSpan } from '@shared/engine/grid'
import { copiedBlock } from '@shared/engine/planEdit'
import { groupPush, patchedPlan, shiftPatches } from '@shared/engine/groupEdit'
import { axisMoves, pushApart, withBlock, type PushHold } from '@shared/engine/pushApart'
import type { DaySnapshot } from '@shared/model/events'
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN, type PlanBlock, type TemplateVersion } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from '../plan/Timeline'
import { addChange, dragChange, onUnsettled } from '../today/dayPush'

/** The day a version makes (its snapshot has the template's wake and the day's). */
export interface TemplateDay {
  ctx: DayContext
  state: DayState
  snapshot: DaySnapshot
}

/** A change of the version: its blocks' fields by their ids in the version (`put` – a new block), and where the blocks stand on the axis. */
export interface TemplateChange {
  put: PlanBlock | null
  patches: Array<{ id: string; patch: Partial<PlanBlock> }>
  /** The block changed: where the axis shows it after the change, and its length. */
  span: BlockSpan
  durationMin: number
  /** The blocks of the version whose place on the axis the change moves (by their ids – the changed one too), there: the preview. */
  preview: Map<string, BlockSpan>
  /** How many blocks the change pushed apart (the line „Przesunięto N bloków”). */
  pushed: number
}

/** The id in the version of each block the template put into the day. */
const sources = (day: TemplateDay): Map<string, string> => new Map(day.ctx.plan.filter((b) => b.origin === 'template' && b.sourceId).map((b) => [b.id, b.sourceId!]))

type Placeable = Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>

/**
 * The template's hours and the day's for a plan after a change (D372): the first fixed block of `plan` bounds the morning the day's wake
 * moves by `delta`; `reach` – where the day shows a block put at a start (the nearest place it can).
 */
function frameOf(day: TemplateDay, plan: readonly PlanBlock[]) {
  const delta = day.snapshot.wakeMin - day.snapshot.templateWakeMin
  const firstFixed = firstFixedStart(plan)
  const toTemplate = (b: Placeable, startMin: number) => unshiftedStart(b, startMin, delta, firstFixed)
  const onDay = (b: Placeable, startMin: number) => shiftedStart(b, startMin, delta, firstFixed)
  const reach = (b: Placeable, startMin: number) => onDay(b, toTemplate(b, startMin))
  return { toTemplate, onDay, reach }
}

/** The day's plan with every block of the template where the day's wake shows it by `onDay` (the changed plan's first fixed block). */
function reshown(day: TemplateDay, onDay: (b: Placeable, startMin: number) => number): PlanBlock[] {
  const ofSnapshot = new Map(day.snapshot.blocks.map((x) => [x.id, x]))
  return day.ctx.plan.map((b) => {
    const s = ofSnapshot.get(b.id)
    return b.origin === 'template' && s?.startMin != null && !b.anchor ? { ...b, startMin: onDay(s, s.startMin) } : b
  })
}

/**
 * The block `block` (in the day's hours, as the day shows it) put into the day by `how` – its start where the day can show
 * it with its length after the change: moved by its body or new – the first place at or after the one asked for; by its
 * top edge – the latest at or before it, the end (`endMin`) staying and the block at least 5 min long; by its bottom edge –
 * its own start, unless the day's end holds it earlier – the blocks it pushes apart, each in the template's hours (`id` –
 * its id in the version; null: a new block), and every block whose place on the axis the change moves (the preview).
 */
function inTemplate(day: TemplateDay, block: PlanBlock, patch: Partial<PlanBlock>, id: string | null, how: DragEdge | 'move' | 'new', atMin?: number, endMin?: number, stay: string | null = null): TemplateChange {
  // Where the day shows a block put at a start (the nearest place it can – see above), by the changed plan's first fixed block.
  const { toTemplate, onDay, reach } = frameOf(day, withBlock(day.ctx.plan, block))
  const hold: PushHold = reach
  const length = (startMin: number) => Math.min(Math.max(endMin! - startMin, MIN_BLOCK_MIN), MAX_BLOCK_MIN)
  let put = block
  if (block.startMin != null && how === 'top' && endMin != null) {
    // The latest start at or before the one asked for (on the grid of 5 min) the day shows with the end kept, 5 min at least.
    let k = Math.min(block.startMin, endMin - MIN_BLOCK_MIN)
    for (let n = 0; n < (24 * 60) / DRAG_STEP_MIN && reach({ ...block, durationMin: length(k) }, k) !== k; n++) k -= DRAG_STEP_MIN
    put = { ...block, startMin: k, durationMin: length(k) }
  } else if (block.startMin != null) put = { ...block, startMin: reach(block, block.startMin) }
  // The day after the change: every block of the template where the day's wake shows it with the changed plan's first fixed block.
  const after = withBlock(reshown(day, onDay), put)
  // D513: the block a copy was made of (`stay`, its id in the day) stands as a fixed one – a copy never changes it.
  const pushPlan = stay ? after.map((b) => (b.id === stay ? { ...b, fixed: true } : b)) : after
  const pushed = pushApart(day.ctx, day.state, pushPlan, put.id, { atMin, hold, onUnsettled }).filter((p) => p.id !== stay)
  const src = sources(day)
  const own: Partial<PlanBlock> = { ...patch, ...(patch.startMin != null || put.startMin !== block.startMin ? { startMin: toTemplate(put, put.startMin!) } : {}), ...(patch.durationMin != null ? { durationMin: put.durationMin } : {}) }
  const patches: TemplateChange['patches'] = id != null ? [{ id, patch: own }] : []
  for (const p of pushed) {
    const of = src.get(p.id)
    const b = day.ctx.plan.find((x) => x.id === p.id)
    if (of && b) patches.push({ id: of, patch: { startMin: toTemplate(b, p.startMin) } })
  }
  // Every block whose place on the axis (its plan) moves – the block put, the pushed, those anchored to them, those the
  // changed first fixed block shifts or unshifts – by its id in the version.
  const final = after.map((b) => {
    const p = pushed.find((x) => x.id === b.id)
    return p ? { ...b, startMin: p.startMin } : b
  })
  const preview = new Map<string, BlockSpan>()
  for (const [dayId, s] of axisMoves(day.ctx, day.state, final, 'plan')) {
    const of = dayId === put.id ? (id ?? put.id) : src.get(dayId)
    if (of) preview.set(of, s)
  }
  const span = preview.get(id ?? put.id) ?? planSpan(day, put)
  preview.set(id ?? put.id, span)
  return { put: id == null ? ({ ...put, ...own } as PlanBlock) : null, patches, span, durationMin: put.durationMin, preview, pushed: pushed.filter((p) => src.has(p.id)).length }
}

/** Where the axis shows a block of the day at its plan (its start, its length). */
function planSpan(day: TemplateDay, b: PlanBlock): BlockSpan {
  const g = day.state.grid
  const k = idxOfLogical(g, b.startMin!)
  return logicalSpan(g, k, k + b.durationMin)
}

/**
 * The block `id` of the version (on the axis by that id) dragged to `span` – by its body (`edge` null) or an edge, grabbed
 * at `shown` – with the blocks it pushes apart. Null: not a block of the version on this day.
 */
export function templateDrag(day: TemplateDay, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan): TemplateChange | null {
  const dayId = [...sources(day)].find(([, of]) => of === id)?.[0]
  const c = dayId ? dragChange(day, dayId, span, edge, shown, false) : null
  return c ? inTemplate(day, c.block, c.patch, id, edge ?? 'move', edge === 'end' ? shown.startMin : undefined, edge === 'top' ? span.endMin : undefined) : null
}

/** A new block of the version from the grid (D366) at the hour clicked, with the blocks it pushes apart. */
export function templateAdd(day: TemplateDay, block: PlanBlock): TemplateChange {
  const c = addChange(day, { ...block, origin: 'template', sourceId: block.id }, false)
  return inTemplate(day, c.block, c.patch, null, 'new')
}

/**
 * A block of the version copied by Ctrl + drag (D513) to the hour of the drop (as the axis shows it): a new block of the template
 * (`copiedBlock` – its own id `id`, none of the original's history), with the blocks it pushes apart, as a new one from the grid –
 * the original held where it is (as a fixed block: a copy never changes it).
 */
export function templateCopy(day: TemplateDay, block: PlanBlock, startMin: number, id: string): TemplateChange {
  const copy = copiedBlock(block, startMin, { id, origin: 'template' })
  const c = addChange(day, { ...copy, origin: 'template', sourceId: copy.id }, false)
  const stay = [...sources(day)].find(([, of]) => of === block.id)?.[0] ?? null
  return inTemplate(day, c.block, c.patch, null, 'new', undefined, undefined, stay)
}

/** A change of the version's blocks by their ids in it (a group's shift): the fields of each, and how many blocks it pushed apart. */
export interface TemplatePatches {
  patches: Array<{ id: string; patch: Partial<PlanBlock> }>
  pushed: number
}

/**
 * „Przesuń o” ±N min of blocks of the version (D528) – `ids` the blocks of the day it makes (`judgeGroup` took them): each at its start
 * plus `minutes` on that day, at the nearest place the day can show it (as its drag, D372), with the blocks they push apart (D367 – the
 * others held where the change put them), all in the template's hours by their ids in the version.
 */
export function templateShift(day: TemplateDay, ids: readonly string[], minutes: number): TemplatePatches {
  const shifted = shiftPatches(day.ctx.plan, ids, minutes)
  const { toTemplate, onDay, reach } = frameOf(day, patchedPlan(day.ctx.plan, shifted))
  // Each block put where the day can show it; every other block of the template where the day's wake shows it then.
  const put = shifted.map((p) => {
    const b = { ...day.ctx.plan.find((x) => x.id === p.id)!, ...p.patch }
    return p.patch.startMin != null && b.startMin != null ? { id: p.id, patch: { ...p.patch, startMin: reach(b, b.startMin) } } : p
  })
  const after = patchedPlan(reshown(day, onDay), put)
  const pushed = groupPush(day, after, new Set(ids), { hold: reach, onUnsettled })
  // A session of the version never moves by a shift (`judgeGroup`: „sesja”): the template's blocks only.
  const src = sources(day)
  const patches: TemplatePatches['patches'] = []
  for (const p of put) {
    const of = src.get(p.id)
    const b = after.find((x) => x.id === p.id)
    if (of && b) patches.push({ id: of, patch: { ...p.patch, ...(p.patch.startMin != null ? { startMin: toTemplate(b, p.patch.startMin) } : {}) } })
  }
  for (const p of pushed) {
    const of = src.get(p.id)
    const b = day.ctx.plan.find((x) => x.id === p.id)
    if (of && b) patches.push({ id: of, patch: { startMin: toTemplate(b, p.startMin) } })
  }
  return { patches, pushed: pushed.filter((p) => src.has(p.id)).length }
}

/** The version's blocks with the change laid on (each patch over the block as the version holds it then). */
export function withTemplateChange(v: TemplateVersion, c: TemplateChange): PlanBlock[] {
  const patches = new Map(c.patches.map((p) => [p.id, p.patch]))
  const blocks = v.blocks.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b))
  return c.put ? [...blocks.filter((b) => b.id !== c.put!.id), { ...c.put, origin: 'template', sourceId: null }] : blocks
}
