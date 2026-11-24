/**
 * Rozsuwanie in „Dziś” (D367): what a block dragged by its body or an edge, or a new one added, changes in the plan and
 * which blocks it pushes apart – one count for the preview while dragging and for the edit of the drop (`pushApart`).
 * Only a day still to come (today and later): a day gone is history. Without a DOM (tests in `tests/web`).
 */
import type { DayContext, DayState } from '@shared/engine/day'
import { plannedSpan } from '@shared/engine/blocks'
import { bufferUnder, decompressWarning, isBuffer } from '@shared/engine/decompress'
import { replanned } from '@shared/engine/context'
import { setsDecompress, type SettingsChange } from '@shared/model/settings'
import { atOf } from '@shared/engine/grid'
import { draggedBlock } from '@shared/engine/planEdit'
import { plannedEndOf } from '@shared/engine/timer'
import { logicalMinuteOf } from '@shared/time/day'
import { groupEndMin, PARALLEL_SAME_TEXT, parallelDrop, parallelFullText, parallelJoinText, placePatch, type BlockPatch } from '@shared/engine/parallel'
import { axisMoves, pushApart, withBlock, type PushedBlock } from '@shared/engine/pushApart'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import type { BlockSpan, DragEdge, ParallelHint } from '../plan/Timeline'
import { edgePatch } from '../plan/edgeEdit'
import type { PushedStart } from './dayActions'

export interface DayChange {
  /** The block as it was in the plan (null: a new one). */
  was: PlanBlock | null
  /** The block after the change. */
  block: PlanBlock
  /** The fields the change sets (a new block: all of it). */
  patch: Partial<PlanBlock>
  /** The other blocks of its group the change writes (D492, T1166: it left the group as its first block). */
  others: BlockPatch[]
  pushed: PushedBlock[]
  /**
   * The buffer of decompression a block of work laid on its place takes away (D386, D582): the warning in the drag's hint, the save
   * cancels it in the same edit (one „Cofnij”); none – none taken.
   */
  takes?: PlanBlock | null
}

/** The plan after a change: its block, and the others of its group it writes (`others`). */
export function changedPlan(plan: readonly PlanBlock[], c: Pick<DayChange, 'block' | 'others'>): PlanBlock[] {
  const others = new Map(c.others.map((o) => [o.id, o.patch]))
  return withBlock(
    plan.map((b) => (others.has(b.id) ? { ...b, ...others.get(b.id)! } : b)),
    c.block
  )
}

/**
 * The plan as the day has it after the change is written: its block, the others of its group, and the blocks it pushes apart at their new
 * starts (`withPushed`) – one plan for the preview of the axis (`pushedSpans`, `parallelHint`) and the energy on trial (N19, `plan/trialEnergy.ts`).
 */
export function planAfter(plan: readonly PlanBlock[], c: Pick<DayChange, 'block' | 'others' | 'pushed'> & { takes?: DayChange['takes'] }): PlanBlock[] {
  const starts = new Map(c.pushed.map((p) => [p.id, p.startMin]))
  // Without the buffer of decompression the change takes (D582) – as the save leaves the day.
  return without(changedPlan(plan, c), c.takes ?? null).map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
}

/**
 * The block `id` of the plan dragged to `span` – by its body (`edge` null: its start, D305) or an edge (D365, as the field
 * „Długość” saves it), grabbed at `shown` – and what it pushes apart on a day to come (`pushes`). The bottom edge pushes
 * from where the block stands on the axis, the rest from its new start. Null: no block of the plan.
 */
export function dragChange(day: { ctx: DayContext; state: DayState }, id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan, pushes: boolean): DayChange | null {
  const plan = day.ctx.plan
  const was = plan.find((b) => b.id === id)
  if (!was) return null
  // D492 (T1166): a block of a group dragged to another place, or its start moved by its top edge, leaves the group.
  const placed = placePatch(plan, id, edge ? edgePatch(was, span, edge, shown) : { startMin: draggedBlock(was, span.startMin).startMin })
  const patch = placed.patch
  const block = { ...was, ...patch }
  const c = { was, block, patch, others: placed.others }
  // The block's place after the change: a drag by its body gives only its start (`onMove`) – its whole length from there.
  const takes = pushes ? bufferTakenBy(day, block, edge ? span : { startMin: block.startMin ?? span.startMin, endMin: (block.startMin ?? span.startMin) + block.durationMin }, { was: id }) : null
  return { ...c, takes, pushed: pushes ? pushApart(day.ctx, day.state, without(changedPlan(plan, c), takes), id, { atMin: edge === 'end' ? shown.startMin : undefined, onUnsettled }) : [] }
}

/** The plan without the buffer a change takes (D582). */
const without = (plan: readonly PlanBlock[], taken: PlanBlock | null): PlanBlock[] => (taken ? plan.filter((b) => b.id !== taken.id) : [...plan])

/**
 * What a saved change says of the buffer of decompression it took (D386, D582): a block of work – „Na miejscu dekompresji po <blok>”
 * (`nameOf` names the buffer's block); another block, or none taken – nothing.
 */
export function takenNotice(day: { ctx: DayContext; state: DayState }, c: Pick<DayChange, 'block' | 'takes'>, nameOf: (b: PlanBlock) => string): string | null {
  if (!c.takes || !warnsOnBuffer(day, c.block)) return null
  // The block it stands after (its anchor – one set „po: …” in its panel follows that block), else the one it was made for.
  const after = c.takes.anchor ?? c.takes.sourceId
  const source = day.ctx.plan.find((b) => b.id === after)
  return decompressWarning(source ? nameOf(source) : 'bloku')
}

/** A block of work (D386, D582): laid on a buffer of decompression, it is warned of („Na miejscu dekompresji po …”). */
export const warnsOnBuffer = (day: { state: DayState }, block: Pick<PlanBlock, 'categoryId'>): boolean => day.state.settings.categories[block.categoryId]?.cls === 'work'

/**
 * The buffer of decompression not begun that a block placed at `span` (logical minutes) lays on (D386, D582: any block takes its place, a
 * block of work with a warning – `warnsOnBuffer`) – where the day's axis shows the buffers (today the forecast, another day its plan);
 * null – none.
 */
export function bufferTakenBy(day: { ctx: DayContext; state: DayState }, block: PlanBlock, span: BlockSpan, o: { was?: string; axis?: 'plan' } = {}): PlanBlock | null {
  // A block in the background runs beside the buffer (T2478): it takes nothing.
  if (isBuffer(block) || (block.background ?? day.state.settings.categories[block.categoryId]?.startsInBackground ?? false)) return null
  const st = day.state
  const lm = (idx: number) => logicalMinuteOf(st.grid.date, atOf(st.grid, idx))
  const byId = new Map(st.blocks.map((b) => [b.id, b]))
  // One axis for the buffers and the block before the change (T2483): today's forecast where the drag is shown, else the plan.
  const today = o.axis !== 'plan' && day.ctx.now >= st.grid.start && day.ctx.now < st.grid.start + st.grid.length * 60_000
  const spanOf = (id: string) => {
    const info = byId.get(id)
    const p = today ? st.forecast.find((x) => x.block.id === id) : undefined
    const at = p ? { start: p.from, end: p.to } : !today && info ? plannedSpan(info, byId) : null
    return at ? { id, startMin: lm(at.start), endMin: lm(at.end) } : null
  }
  const axis: Array<{ id: string; startMin: number; endMin: number }> = []
  for (const b of day.ctx.plan) {
    if (!isBuffer(b) || st.facts.blocks.get(b.id)?.startedAt != null) continue
    const at = spanOf(b.id)
    if (at) axis.push(at)
  }
  // Only a change that newly lays the block on one (D582, T2487): the buffers it lay on already before keep it there – the others are asked.
  const before = o.was != null ? spanOf(o.was) : null
  const fresh = before ? axis.filter((x) => !(before.startMin < x.endMin && before.endMin > x.startMin)) : axis
  return fresh.length ? bufferUnder(fresh, day.ctx.plan, block.id, span) : null
}

/** Where the day's axis shows block `id` (today the forecast, another day its plan; logical minutes) – null: not on it. */
export function axisSpanOf(day: { ctx: DayContext; state: DayState }, id: string): BlockSpan | null {
  const st = day.state
  const lm = (idx: number) => logicalMinuteOf(st.grid.date, atOf(st.grid, idx))
  const today = day.ctx.now >= st.grid.start && day.ctx.now < st.grid.start + st.grid.length * 60_000
  const p = today ? st.forecast.find((x) => x.block.id === id) : undefined
  const info = st.blocks.find((b) => b.id === id)
  const at = p ? { start: p.from, end: p.to } : !today && info ? plannedSpan(info, new Map(st.blocks.map((b) => [b.id, b]))) : null
  return at ? { startMin: lm(at.start), endMin: lm(at.end) } : null
}

/** The buffer a change made in the block's panel newly lays it on (D582, T2483): on the plan's axis, a block of its own hour; none – null. */
export function panelTakes(day: { ctx: DayContext; state: DayState }, was: PlanBlock, after: PlanBlock): PlanBlock | null {
  if (after.startMin == null || after.anchor != null) return null
  return bufferTakenBy(day, after, { startMin: after.startMin, endMin: after.startMin + after.durationMin }, { was: was.id, axis: 'plan' })
}

/**
 * The buffer a drag of `was` – by its body or an edge (`edge`), grabbed at `shown` – to `span` would take, without counting the push (the
 * hint asks it at every place; D582): a copy (`copy`) is a new block – asked under `COPY_SPAN_ID`, never its original's place or buffer.
 */
export function dragTaken(day: { ctx: DayContext; state: DayState }, was: PlanBlock, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan, copy: boolean): PlanBlock | null {
  const start = edge === 'end' ? shown.startMin : span.startMin
  const at = edge ? span : { startMin: start, endMin: start + was.durationMin }
  return bufferTakenBy(day, { ...was, id: copy ? COPY_SPAN_ID : was.id, startMin: start }, at, copy ? {} : { was: was.id })
}

/**
 * Where a day's axis shows the end of each block (by id, logical minutes): today a begun one where it ran or runs to, one still
 * to come where the forecast puts it; another day – its plan. Null – not on the axis.
 */
export function axisEndOf(day: { ctx: DayContext; state: DayState }, isToday: boolean): (id: string) => number | null {
  const st = day.state
  const lm = (idx: number) => logicalMinuteOf(st.grid.date, atOf(st.grid, idx))
  const byId = new Map(st.blocks.map((b) => [b.id, b]))
  return (id) => {
    const info = byId.get(id)
    if (!info) return null
    if (isToday) {
      const f = st.facts.blocks.get(id)
      if (f?.startedAt != null) return lm(f.endedAt ?? Math.max(st.now, plannedEndOf(st, info, f)))
      const p = st.forecast.find((x) => x.block.id === id)
      if (p) return lm(p.to)
    }
    const s = plannedSpan(info, byId)
    return s ? lm(s.end) : null
  }
}

/** A drop onto another block counted (D492): the change of the plan, the group it joined (or is full), and its words. */
export interface ParallelChange extends DayChange {
  kind: 'join' | 'full'
  root: string
  text: string
}

/**
 * Block `id` dragged onto block `target` (D492, T1164, T1165): it stands beside the target's group – at its start, with its own
 * length – or, the group holding `max` blocks already, right after it (where the axis shows its end – `endOf`, by id); with the
 * blocks after it pushed apart (`pushes`, a day to come). `same`: a block of its own group – nothing changes. Null: not a drop
 * (either block is not in the plan, the group's start is not known).
 */
export function parallelChange(
  day: { ctx: DayContext; state: DayState },
  id: string,
  target: string,
  max: number,
  endOf: (id: string) => number | null,
  nameOf: (b: PlanBlock) => string,
  pushes: boolean
): ParallelChange | 'same' | null {
  const plan = day.ctx.plan
  const was = plan.find((b) => b.id === id)
  const end = (root: string) => groupEndMin(plan, root, endOf)
  const drop = was ? parallelDrop(plan, id, target, max, end) : null
  if (!was || !drop) return null
  if (drop.kind === 'same') return 'same'
  if (drop.kind === 'full' && !Number.isFinite(drop.patch.startMin ?? Number.NaN)) return null
  const block = { ...was, ...drop.patch }
  const c = { was, block, patch: drop.patch, others: drop.others }
  const rootBlock = plan.find((b) => b.id === drop.root)!
  const text = drop.kind === 'join' ? parallelJoinText(nameOf(rootBlock)) : parallelFullText(max)
  return { ...c, kind: drop.kind, root: drop.root, text, pushed: pushes ? pushApart(day.ctx, day.state, changedPlan(plan, c), id, { onUnsettled }) : [] }
}

/**
 * What the axis says and draws while a block is held over another one (D492): the words, where the dragged block will stand
 * (the day after the drop – today's axis its forecast, another day's its plan) and the blocks it pushes apart.
 */
export function parallelHint(day: { ctx: DayContext; state: DayState }, c: ParallelChange | 'same' | null, shown: BlockSpan | null, axis: 'forecast' | 'plan'): ParallelHint | null {
  if (c === 'same') return shown ? { text: PARALLEL_SAME_TEXT, span: shown, pushed: null, same: true } : null
  if (!c) return null
  const moves = new Map(axisMoves(day.ctx, day.state, planAfter(day.ctx.plan, c), axis))
  const start = c.block.startMin ?? shown?.startMin ?? 0
  const span = moves.get(c.block.id) ?? { startMin: start, endMin: start + c.block.durationMin }
  moves.delete(c.block.id)
  return { text: c.text, span, pushed: moves.size ? moves : null }
}

/**
 * D513: the key of a copy's own place in the preview while it is held (an id no block has, never written): the axis draws the
 * copy there (`Timeline` `shownSpan`); the block copied keeps its own key.
 */
export const COPY_SPAN_ID = '__copy__'

/**
 * D513: the copy `copy` of block `originalId` put into the day (`pushes` – a day to come) and what it pushes apart, as a new block
 * (D367) – the original held where it is, as a fixed block: a copy never changes it (it is neither pushed nor written), the
 * flexible blocks that would meet it go past it. An original of another day – not in this plan – changes nothing of the rule.
 */
export function copyChange(day: { ctx: DayContext; state: DayState }, copy: PlanBlock, originalId: string, pushes: boolean): DayChange {
  const held = day.ctx.plan.map((b) => (b.id === originalId ? { ...b, fixed: true } : b))
  // D582: a copy laid on a buffer of decompression takes its place as any block.
  const takes = pushes && copy.startMin != null ? bufferTakenBy(day, copy, { startMin: copy.startMin, endMin: copy.startMin + copy.durationMin }) : null
  const pushed = pushes ? pushApart(day.ctx, day.state, without(withBlock(held, copy), takes), copy.id, { onUnsettled }).filter((p) => p.id !== originalId) : []
  return { was: null, block: copy, patch: copy, others: [], takes, pushed }
}

/** A new block added to a day to come (`pushes`) and what it pushes apart (D367: „Dodaj” in the panel of „Dziś”). */
export function addChange(day: { ctx: DayContext; state: DayState }, block: PlanBlock, pushes: boolean): DayChange {
  const takes = pushes && block.startMin != null ? bufferTakenBy(day, block, { startMin: block.startMin, endMin: block.startMin + block.durationMin }) : null
  return { was: null, block, patch: block, others: [], takes, pushed: pushes ? pushApart(day.ctx, day.state, without(withBlock(day.ctx.plan, block), takes), block.id, { onUnsettled }) : [] }
}

/**
 * Where the blocks a push moves stand (the preview on the axis, by id; the dragged one stays under the pointer): the
 * pushed ones and every other block whose place changes with them – one anchored to a pushed one, a protected one the
 * forecast lets through. Today's axis shows the forecast, another day's its plan (`dayAxis`) – the places the axis shows
 * after the save. Nothing pushed – no preview.
 */
export function pushedSpans(day: { ctx: DayContext; state: DayState }, c: DayChange | null, axis: 'forecast' | 'plan'): ReadonlyMap<string, BlockSpan> | null {
  if (!c?.pushed.length) return null
  const moves = axisMoves(day.ctx, day.state, planAfter(day.ctx.plan, c), axis)
  moves.delete(c.block.id)
  return moves.size ? moves : null
}

/**
 * The change with the blocks the buffers of decompression of the plan after it move (D583: „Przesunięto N” counts them, D367 writes them):
 * the plan of the file after the change (its pushes, without the buffer it takes) with the buffers laid again (`replanned`, your settings'
 * `changes`) – a block whose start differs from where the plan shows it now and from where the change puts it is pushed by a buffer.
 */
export function withBufferPushes(day: { ctx: DayContext; state: DayState }, c: DayChange, changes: readonly SettingsChange[], file: DayFile | null, pushes = true): PushedBlock[] {
  // A day gone by is history (D367): nothing pushed.
  if (!pushes || !setsDecompress(changes)) return c.pushed
  const base = day.ctx.basePlan ?? day.ctx.plan
  const starts = new Map(c.pushed.map((p) => [p.id, p.startMin]))
  const after = without(changedPlan(base, c), c.takes ?? null).map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
  // The buffer it takes is gone also from a day without a file yet.
  const gone = c.takes ? { ...(file ?? dayFileFrom({}, day.ctx.date)), cancelled: [...(file?.cancelled ?? []), c.takes.id] } : file
  const shown = new Map(day.ctx.plan.map((b) => [b.id, b.startMin]))
  const out = new Map(c.pushed.map((p) => [p.id, p]))
  for (const b of replanned(day.ctx, after, changes, gone)) {
    const was = after.find((x) => x.id === b.id)
    if (isBuffer(b) || b.id === c.block.id || !was || was.startMin == null || b.startMin == null || b.startMin === was.startMin || b.startMin === shown.get(b.id)) continue
    const span = { startMin: b.startMin, endMin: b.startMin + b.durationMin }
    out.set(b.id, { id: b.id, fromMin: shown.get(b.id) ?? was.startMin, startMin: b.startMin, shown: span, planned: span })
  }
  return [...out.values()]
}

/** The counting of a push did not settle (a bound for safety): said in the console of a development build only. */
export function onUnsettled(): void {
  if (import.meta.env?.DEV) console.warn('rozsuwanie: przeliczenie dnia nie ustaliło się w limicie rund – wynik z ostatniego przeliczenia')
}

/** The pushed blocks as the edit of the day writes them: each block of the plan with its new start. */
export function pushedStarts(plan: readonly PlanBlock[], c: Pick<DayChange, 'pushed'>): PushedStart[] {
  return c.pushed.flatMap((p) => {
    const block = plan.find((b) => b.id === p.id)
    return block ? [{ block, startMin: p.startMin }] : []
  })
}
