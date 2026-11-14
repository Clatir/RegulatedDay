/**
 * The new block of „Dziś” not saved yet (D461, D466): what a change made while its first save runs leaves to do, and the
 * dashed tile it is drawn as on the axis. Pure (the lifecycle itself – `TodayPage`).
 */
import type { PlanBlock } from '@shared/model/plan'
import { blockColor, blockKind, blockName, type Names } from '../plan/blockView'
import type { DraftTile } from '../plan/Timeline'

/**
 * The fields of `patch` that `saved` does not hold yet: what is still to be written when the first save (made with what the block
 * had then) is done – a change committed while it ran; one the save already carried (Enter in the name after its blur) is not repeated.
 */
export function draftRest(saved: PlanBlock, patch: Partial<PlanBlock>): Partial<PlanBlock> | null {
  const rest = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify((saved as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)))
  return Object.keys(rest).length ? (rest as Partial<PlanBlock>) : null
}

/** The draft as a tile of the axis: where its start and length put it; none for a block without an hour of its own (after another). */
export function draftTile(b: PlanBlock | null, names: Names): DraftTile | null {
  if (!b || b.startMin == null) return null
  const kind = blockKind(b, names)
  return { startMin: b.startMin, endMin: b.startMin + b.durationMin, title: blockName(b, names), color: blockColor(b.categoryId, names), ...(kind ? { kind } : {}) }
}
