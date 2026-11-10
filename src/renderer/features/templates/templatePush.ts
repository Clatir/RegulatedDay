/**
 * Rozsuwanie on the axis of a template (D367, D372): a block of the version dragged by its body (D305) or an edge (D365),
 * or a new one from the grid (D366), on a taken place pushes the flexible blocks of the template after it apart – counted
 * on the day the version makes (the same `pushApart` and forecast as „Dziś”), once for the preview and for the save. What
 * the day shows is written in the template's hours: while the sessions start earlier the day's wake moves the morning
 * (`wakeShiftedStart`), and its inverse (`unshiftedStart`) gives each block its start in the template; a place the day
 * cannot show a morning block at (just before the first fixed block) is the first one after it it can – for the block
 * put there and for every pushed one (`pushApart`'s `hold`), so what is written is what the day then shows. Without a DOM.
 */
import { firstFixedStart, shiftedStart, unshiftedStart } from '@shared/engine/createDay'
import type { DayContext, DayState } from '@shared/engine/day'
import { planWith, pushApart, type PushHold } from '@shared/engine/pushApart'
import type { DaySnapshot } from '@shared/model/events'
import { MAX_BLOCK_MIN, type PlanBlock, type TemplateVersion } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from '../plan/Timeline'
import { addChange, dragChange } from '../today/dayPush'

/** The day a version makes (its snapshot has the template's wake and the day's). */
export interface TemplateDay {
  ctx: DayContext
  state: DayState
  snapshot: DaySnapshot
}

/** A change of the version: its blocks' fields by their ids in the version (`put` – a new block), and where the pushed ones stand on the axis. */
export interface TemplateChange {
  put: PlanBlock | null
  patches: Array<{ id: string; patch: Partial<PlanBlock> }>
  /** The pushed blocks of the version by their ids, at their new places on the axis (the preview). */
  preview: Map<string, BlockSpan>
  /** How many blocks the change pushed apart (the line „Przesunięto N bloków”). */
  pushed: number
}

/** The id in the version of each block the template put into the day. */
const sources = (day: TemplateDay): Map<string, string> => new Map(day.ctx.plan.filter((b) => b.origin === 'template' && b.sourceId).map((b) => [b.id, b.sourceId!]))

/**
 * The block `block` (in the day's hours, as the day shows it) put into the day: its start where the day can show it, the
 * blocks it pushes apart, each in the template's hours (`id` – its id in the version; null: a new block).
 */
function inTemplate(day: TemplateDay, block: PlanBlock, patch: Partial<PlanBlock>, id: string | null, atMin?: number, endMin?: number): TemplateChange {
  const delta = day.snapshot.wakeMin - day.snapshot.templateWakeMin
  const firstFixed = firstFixedStart(planWith(day.ctx.plan, block))
  const toTemplate = (b: Pick<PlanBlock, 'fixed' | 'anchor'>, startMin: number) => unshiftedStart(b, startMin, delta, firstFixed)
  const hold: PushHold = (b, startMin) => shiftedStart(b, toTemplate(b, startMin), delta, firstFixed)
  // The block put where the day can show it: the end of a block dragged by its top edge stays.
  let put = block
  if (block.startMin != null && patch.startMin != null) {
    const startMin = shiftedStart(block, toTemplate(block, block.startMin), delta, firstFixed)
    put = { ...block, startMin, ...(endMin != null ? { durationMin: Math.min(Math.max(endMin - startMin, 1), MAX_BLOCK_MIN) } : {}) }
  }
  const pushed = pushApart(day.ctx, day.state, planWith(day.ctx.plan, put), put.id, atMin, hold)
  const own: Partial<PlanBlock> = { ...patch, ...(patch.startMin != null ? { startMin: toTemplate(put, put.startMin!) } : {}), ...(patch.durationMin != null ? { durationMin: put.durationMin } : {}) }
  const src = sources(day)
  const patches: TemplateChange['patches'] = id != null ? [{ id, patch: own }] : []
  const preview = new Map<string, BlockSpan>()
  for (const p of pushed) {
    const of = src.get(p.id)
    const b = day.ctx.plan.find((x) => x.id === p.id)
    if (!of || !b) continue
    patches.push({ id: of, patch: { startMin: toTemplate(b, p.startMin) } })
    preview.set(of, p.shown)
  }
  return { put: id == null ? ({ ...put, ...own } as PlanBlock) : null, patches, preview, pushed: preview.size }
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
