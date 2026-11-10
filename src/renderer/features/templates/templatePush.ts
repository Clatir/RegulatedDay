/**
 * Rozsuwanie on the axis of a template (D367, D372): a block of the version dragged by its body (D305) or an edge (D365),
 * or a new one from the grid (D366), on a taken place pushes the flexible blocks of the template after it apart – counted
 * on the day the version makes (the same `pushApart` and forecast as „Dziś”), once for the preview and for the save. What
 * the day shows is written in the template's hours: while the sessions start earlier the day's wake moves the morning
 * (`wakeShiftedStart`), and its inverse (`unshiftedStart`) gives each block its start in the template. Without a DOM.
 */
import { firstFixedStart, unshiftedStart } from '@shared/engine/createDay'
import type { DayContext, DayState } from '@shared/engine/day'
import { pushedPlan } from '@shared/engine/pushApart'
import type { DaySnapshot } from '@shared/model/events'
import type { PlanBlock, TemplateVersion } from '@shared/model/plan'
import type { BlockSpan, DragEdge } from '../plan/Timeline'
import { addChange, dragChange, type DayChange } from '../today/dayPush'

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

/** The day's change in the template's hours: the changed block's start and the pushed starts unshifted by the day's wake. */
function inTemplate(day: TemplateDay, c: DayChange, id: string | null): TemplateChange {
  const delta = day.snapshot.wakeMin - day.snapshot.templateWakeMin
  const after = pushedPlan(day.ctx.plan.some((b) => b.id === c.block.id) ? day.ctx.plan.map((b) => (b.id === c.block.id ? c.block : b)) : [...day.ctx.plan, c.block], c.pushed)
  const firstFixed = firstFixedStart(after)
  const hours = (b: PlanBlock, startMin: number) => unshiftedStart(b, startMin, delta, firstFixed)
  const src = sources(day)
  const patch: Partial<PlanBlock> = { ...c.patch }
  if (patch.startMin != null) patch.startMin = hours(c.block, patch.startMin)
  const patches: TemplateChange['patches'] = []
  const preview = new Map<string, BlockSpan>()
  if (id != null) patches.push({ id, patch })
  for (const p of c.pushed) {
    const of = src.get(p.id)
    const b = day.ctx.plan.find((x) => x.id === p.id)
    if (!of || !b) continue
    patches.push({ id: of, patch: { startMin: hours(b, p.startMin) } })
    preview.set(of, { startMin: p.startMin, endMin: p.endMin })
  }
  return { put: id == null ? (patch as PlanBlock) : null, patches, preview, pushed: preview.size }
}

/**
 * The block `id` of the version (on the axis by that id) dragged to `span` – by its body (`edge` null) or an edge, grabbed
 * at `shown` – with the blocks it pushes apart. Null: not a block of the version on this day.
 */
export function templateDrag(day: TemplateDay, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan): TemplateChange | null {
  const dayId = [...sources(day)].find(([, of]) => of === id)?.[0]
  const c = dayId ? dragChange(day, dayId, span, edge, shown, true) : null
  return c ? inTemplate(day, c, id) : null
}

/** A new block of the version from the grid (D366) at the hour clicked, with the blocks it pushes apart. */
export function templateAdd(day: TemplateDay, block: PlanBlock): TemplateChange {
  return inTemplate(day, addChange(day, { ...block, origin: 'template', sourceId: block.id }, true), null)
}

/** The version's blocks with the change laid on (each patch over the block as the version holds it then). */
export function withTemplateChange(v: TemplateVersion, c: TemplateChange): PlanBlock[] {
  const patches = new Map(c.patches.map((p) => [p.id, p.patch]))
  const blocks = v.blocks.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b))
  return c.put ? [...blocks.filter((b) => b.id !== c.put!.id), { ...c.put, origin: 'template', sourceId: null }] : blocks
}
