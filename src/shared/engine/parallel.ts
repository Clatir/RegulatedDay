/**
 * Parallel blocks (D476, D492, D495; T1160–T1169): a block dragged onto another one stands beside it – a group of blocks in
 * the same time. A group is its first block (the one the others were dropped on) and the blocks whose `alongside` names it;
 * each starts with the first one and keeps its own length, and the group takes its time once (`forecast.ts`). Any block may be
 * in a group (D495). At most `parallelMax` blocks at once (Ustawienia, D476): one more stands right after the group (D492).
 * Pure – the window counts the drop with these, the day's file keeps the group in the blocks' fields (`dayEdits.ts`).
 */
import type { PlanBlock } from '../model/plan'

type Linked = Pick<PlanBlock, 'id' | 'alongside'>

/**
 * The first block of the group of block `id` (T1161): the one its `alongside` names, followed on to a block beside none (a
 * file written by another computer may chain them). The block named is not in the plan (moved to another day, taken out of
 * the file): the first block of the plan beside it stands for it – the group stays together (T1166, D497). Null – it is beside
 * no block of the plan: none named, it stands for the block that left, or the chain comes back to itself.
 */
export function groupRootOf(plan: ReadonlyMap<string, Linked>, id: string): string | null {
  const seen = new Set([id])
  let next = plan.get(id)?.alongside ?? null
  while (next != null) {
    if (seen.has(next)) return null
    const x = plan.get(next)
    if (!x) {
      const gone = next
      let first: string | null = null
      for (const b of plan.values()) {
        if (b.alongside === gone) {
          first = b.id
          break
        }
      }
      return first == null || first === id ? null : first
    }
    if (x.alongside == null) return next
    seen.add(next)
    next = x.alongside
  }
  return null
}

type Placing = Pick<PlanBlock, 'id' | 'alongside' | 'anchor'>

/**
 * Whether the planned start of block `from` depends on block `id` (T1164): followed through the first block of its group and
 * its anchor („po bloku”). Dropping `id` beside such a block would make the two wait for each other (no planned start at all).
 */
export function placedAfter(plan: ReadonlyMap<string, Placing>, from: string, id: string): boolean {
  let cur: string | null = from
  for (let depth = 0; cur != null && depth < 40; depth++) {
    if (cur === id) return true
    const b: Placing | undefined = plan.get(cur)
    if (!b) return false
    cur = groupRootOf(plan, cur) ?? b.anchor
  }
  return false
}

const mapOf = (plan: readonly Linked[]): Map<string, Linked> => new Map(plan.map((b) => [b.id, b]))

/**
 * The planned start of a block, a logical minute (`planEdit.plannedStartMin` with groups): beside another block – that block's,
 * anchored – its anchor's planned end; null when unknown. Here, not in `planEdit`, so that `blocks.ts` may import this module.
 */
function plannedStart(b: PlanBlock, plan: ReadonlyMap<string, PlanBlock>, depth = 0): number | null {
  if (depth > 20) return null
  const root = groupRootOf(plan, b.id)
  if (root != null) return plannedStart(plan.get(root)!, plan, depth + 1)
  if (b.startMin != null) return b.startMin
  const a = b.anchor ? plan.get(b.anchor) : undefined
  const s = a ? plannedStart(a, plan, depth + 1) : null
  return s == null || !a ? null : s + a.durationMin
}

/** The blocks of the group of block `id` in the plan's order – its first block, then the others; a block of no group: itself alone. */
export function groupOf(plan: readonly Linked[], id: string): string[] {
  const map = mapOf(plan)
  if (!map.has(id)) return []
  const root = groupRootOf(map, id) ?? id
  return [root, ...plan.filter((b) => b.id !== root && groupRootOf(map, b.id) === root).map((b) => b.id)]
}

/** Whether block `id` is in a group of two blocks or more. */
export const inGroup = (plan: readonly Linked[], id: string): boolean => groupOf(plan, id).length > 1

/** A block of the plan with the fields a change writes (the others as they are). */
export interface BlockPatch {
  id: string
  patch: Partial<PlanBlock>
}

/**
 * What block `id` leaving its group changes in the other blocks of it (D492, T1166): it was the group's first block – the
 * next block of the group in the plan's order is the first one now (at the group's start), the others stand beside it; it was
 * beside one – nothing in the others. Not in a group – nothing.
 */
export function leaveGroup(plan: readonly PlanBlock[], id: string): BlockPatch[] {
  const map = new Map(plan.map((x) => [x.id, x]))
  const b = map.get(id)
  if (!b || groupRootOf(map, id) != null) return []
  const rest = plan.filter((x) => x.id !== id && groupRootOf(map, x.id) === id)
  if (!rest.length) return []
  const start = plannedStart(b, map)
  const [first, ...others] = rest
  const at = start != null ? { startMin: start, anchor: null } : {}
  return [{ id: first!.id, patch: { alongside: null, ...at } }, ...others.map((x) => ({ id: x.id, patch: { alongside: first!.id, ...at } }))]
}

/**
 * A change of a block's place by hand (D492, T1166: a drag to another place, the start or „po bloku” in its panel): a block of a
 * group leaves it – its own `alongside` goes and the others stay together (`leaveGroup`). A change that does not touch its place,
 * or a block of no group – the patch as it is.
 */
export function placePatch(plan: readonly PlanBlock[], id: string, patch: Partial<PlanBlock>): { patch: Partial<PlanBlock>; others: BlockPatch[] } {
  if (!('startMin' in patch) && !('anchor' in patch)) return { patch, others: [] }
  // Beside a block that is no group now (it left the day, it is cancelled): the field goes too – it would bring it back there.
  const named = plan.find((b) => b.id === id)?.alongside != null
  if (!named && !inGroup(plan, id)) return { patch, others: [] }
  return { patch: { ...patch, alongside: null }, others: leaveGroup(plan, id) }
}

/** What a block dropped on another one does (D492): nothing (the same group), joins its group, or stands after it (the group is full). */
export type ParallelDrop =
  | { kind: 'same' }
  | { kind: 'join'; root: string; patch: Partial<PlanBlock>; others: BlockPatch[] }
  | { kind: 'full'; root: string; patch: Partial<PlanBlock>; others: BlockPatch[] }

/**
 * Block `id` dragged and dropped onto block `target` (D492, T1164, T1165): it leaves its own group (`leaveGroup`) and stands
 * beside the target's group – at the start of its first block, with its own length – while the group has fewer than `max`
 * blocks; a full group – it stands right after it (`endMin`: the logical minute the group ends where the axis shows it) as a
 * block of its own. A target of its own group – nothing changes. Null: either block is not in the plan, or the group's start
 * is not known (a chain of anchors that leads nowhere).
 */
export function parallelDrop(plan: readonly PlanBlock[], id: string, target: string, max: number, endMin: (root: string) => number): ParallelDrop | null {
  const map = new Map(plan.map((x) => [x.id, x]))
  if (!map.has(id) || !map.has(target)) return null
  const root = groupRootOf(map, target) ?? target
  if (root === (groupRootOf(map, id) ?? id)) return { kind: 'same' }
  // The group's start waits for the dragged block itself (anchored after it): no drop there.
  if (placedAfter(map, root, id)) return null
  const others = leaveGroup(plan, id)
  if (groupOf(plan, root).length + 1 > max) return { kind: 'full', root, patch: { startMin: endMin(root), anchor: null, alongside: null }, others }
  const start = plannedStart(map.get(root)!, map)
  if (start == null) return null
  return { kind: 'join', root, patch: { startMin: start, anchor: null, alongside: root }, others }
}

/** Where the group of block `root` ends on an axis (`endOf` – each block's end there, by id; null – not on it): its longest block. */
export function groupEndMin(plan: readonly Linked[], root: string, endOf: (id: string) => number | null): number {
  return Math.max(...groupOf(plan, root).map((x) => endOf(x) ?? Number.NEGATIVE_INFINITY))
}

/** What a drop onto a block of its own group says (it changes nothing). */
export const PARALLEL_SAME_TEXT = 'Już razem – bez zmian'

/** What a drop beside a group says (D492): „Równolegle z <the name of its first block>”. */
export const parallelJoinText = (name: string): string => `Równolegle z ${name}`

/** The note of a full group (D492): „Najwyżej 3 bloki naraz – zmienisz w Ustawieniach”. */
export const parallelFullText = (max: number): string => `Najwyżej ${max} ${max === 1 ? 'blok' : max >= 2 && max <= 4 ? 'bloki' : 'bloków'} naraz – zmienisz w Ustawieniach`
