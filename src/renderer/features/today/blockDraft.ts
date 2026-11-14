/**
 * The new block of „Dziś” not saved yet (D461, D466): the dashed tile it is drawn as on the axis. Pure (the lifecycle itself –
 * `TodayPage`, its first save and what follows it – `draftSave`).
 */
import type { PlanBlock } from '@shared/model/plan'
import { blockColor, blockKind, blockName, type Names } from '../plan/blockView'
import type { DraftTile } from '../plan/Timeline'

/** The draft as a tile of the axis: where its start and length put it; none for a block without an hour of its own (after another). */
export function draftTile(b: PlanBlock | null, names: Names): DraftTile | null {
  if (!b || b.startMin == null) return null
  const kind = blockKind(b, names)
  return { startMin: b.startMin, endMin: b.startMin + b.durationMin, title: blockName(b, names), color: blockColor(b.categoryId, names), ...(kind ? { kind } : {}) }
}
