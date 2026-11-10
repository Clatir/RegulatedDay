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
import { pushApart, withBlock, type PushHold } from '@shared/engine/pushApart'
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

/**
 * The block `block` (in the day's hours, as the day shows it) put into the day – its start where the day can show it (the
 * end of a block dragged by its top edge, `endMin`, stays, never less than 5 min from the start) – the blocks it pushes
 * apart, and those the first fixed block of the changed plan moves on the axis, each in the template's hours (`id` – its id
 * in the version; null: a new block).
 */
function inTemplate(day: TemplateDay, block: PlanBlock, patch: Partial<PlanBlock>, id: string | null, atMin?: number, endMin?: number): TemplateChange {
  const g = day.state.grid
  const delta = day.snapshot.wakeMin - day.snapshot.templateWakeMin
  const firstFixed = firstFixedStart(withBlock(day.ctx.plan, block))
  const toTemplate = (b: Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>, startMin: number) => unshiftedStart(b, startMin, delta, firstFixed)
  const onDay = (b: Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>, startMin: number) => shiftedStart(b, startMin, delta, firstFixed)
  /** Where the day shows a block put at `startMin` (the nearest place it can – see above). */
  const reach = (b: Pick<PlanBlock, 'fixed' | 'anchor' | 'durationMin'>, startMin: number) => onDay(b, toTemplate(b, startMin))
  const hold: PushHold = reach
  /** The latest place at or before `startMin` the day can show the block at (on the grid of 5 min). */
  const atOrBefore = (b: PlanBlock, startMin: number) => {
    for (let k = startMin; k > startMin - 24 * 60; k -= DRAG_STEP_MIN) if (reach(b, k) === k) return k
    return startMin
  }
  let put = block
  if (block.startMin != null && patch.startMin != null) {
    let startMin = reach(block, block.startMin)
    // The top edge: the end stays – a start moved on so far that the block would be shorter than 5 min goes back instead.
    if (endMin != null && endMin - startMin < MIN_BLOCK_MIN) startMin = atOrBefore(block, Math.min(block.startMin, endMin - MIN_BLOCK_MIN))
    put = { ...block, startMin, ...(endMin != null ? { durationMin: Math.min(Math.max(endMin - startMin, MIN_BLOCK_MIN), MAX_BLOCK_MIN) } : {}) }
  }
  // The day after the change: every block of the template where the day's wake shows it with the changed plan's first fixed block.
  const ofSnapshot = new Map(day.snapshot.blocks.map((b) => [b.id, b]))
  const after = withBlock(
    day.ctx.plan.map((b) => {
      const s = ofSnapshot.get(b.id)
      return b.origin === 'template' && s?.startMin != null && !b.anchor ? { ...b, startMin: onDay(s, s.startMin) } : b
    }),
    put
  )
  const pushed = pushApart(day.ctx, day.state, after, put.id, { atMin, hold, onUnsettled })
  const span = (startMin: number, durationMin: number): BlockSpan => {
    const k = idxOfLogical(g, startMin)
    return logicalSpan(g, k, k + durationMin)
  }
  const own: Partial<PlanBlock> = { ...patch, ...(patch.startMin != null ? { startMin: toTemplate(put, put.startMin!) } : {}), ...(patch.durationMin != null ? { durationMin: put.durationMin } : {}) }
  const src = sources(day)
  const patches: TemplateChange['patches'] = id != null ? [{ id, patch: own }] : []
  const preview = new Map<string, BlockSpan>()
  const putSpan = span(put.startMin!, put.durationMin)
  preview.set(id ?? put.id, putSpan)
  const moved = new Set<string>()
  for (const p of pushed) {
    const of = src.get(p.id)
    const b = day.ctx.plan.find((x) => x.id === p.id)
    if (!of || !b) continue
    patches.push({ id: of, patch: { startMin: toTemplate(b, p.startMin) } })
    preview.set(of, p.planned)
    moved.add(p.id)
  }
  // Blocks not pushed that the changed first fixed block shifts or unshifts: shown where they will stand (nothing to write).
  for (const b of after) {
    const of = src.get(b.id)
    const was = day.ctx.plan.find((x) => x.id === b.id)
    if (!of || moved.has(b.id) || b.id === put.id || !was || b.startMin == null || b.startMin === was.startMin) continue
    preview.set(of, span(b.startMin, b.durationMin))
  }
  return { put: id == null ? ({ ...put, ...own } as PlanBlock) : null, patches, span: putSpan, durationMin: put.durationMin, preview, pushed: moved.size }
}

/**
 * The block `id` of the version (on the axis by that id) dragged to `span` – by its body (`edge` null) or an edge, grabbed
 * at `shown` – with the blocks it pushes apart. Null: not a block of the version on this day.
 */
export function templateDrag(day: TemplateDay, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan): TemplateChange | null {
  const dayId = [...sources(day)].find(([, of]) => of === id)?.[0]
  const c = dayId ? dragChange(day, dayId, span, edge, shown, false) : null
  return c ? inTemplate(day, c.block, c.patch, id, edge === 'end' ? shown.startMin : undefined, edge === 'top' ? span.endMin : undefined) : null
}

/** A new block of the version from the grid (D366) at the hour clicked, with the blocks it pushes apart. */
export function templateAdd(day: TemplateDay, block: PlanBlock): TemplateChange {
  const c = addChange(day, { ...block, origin: 'template', sourceId: block.id }, false)
  return inTemplate(day, c.block, c.patch, null)
}

/** The version's blocks with the change laid on (each patch over the block as the version holds it then). */
export function withTemplateChange(v: TemplateVersion, c: TemplateChange): PlanBlock[] {
  const patches = new Map(c.patches.map((p) => [p.id, p.patch]))
  const blocks = v.blocks.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b))
  return c.put ? [...blocks.filter((b) => b.id !== c.put!.id), { ...c.put, origin: 'template', sourceId: null }] : blocks
}
