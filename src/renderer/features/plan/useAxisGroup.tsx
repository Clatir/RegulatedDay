/**
 * The selection of many blocks of an axis (D527, D528) – „Dziś” and a version of a template: the hook that `useSelection`'s keys (Ctrl+A, Shift+arrows,
 * Esc – only while the focus is on the axis, not in the panel beside it) and the pieces the screen draws – the ring of every selected tile (`marked`),
 * the line „Zaznaczone: 4 · 3 h 20 min · energia …” over the axis (`line`), the menu of the right button (`overlay`) and the target of Del for two or more.
 * A plain click is the screen's (it selects the one block and opens its panel, D462 – `selectOnly`); Ctrl and Shift only select (`onSelect` answers false).
 * A selection of one that a plain click made goes with the panel, as the open block always did: the screen's closing of the panel is `release` (a group of
 * two or more, made with Ctrl or Shift, stays).
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlanBlock } from '@shared/model/plan'
import { useSelection, type SelectionApi } from '../../lib/useSelection'
import type { DeleteTarget } from '../../lib/deleteKey'
import type { GroupView } from '../../store/groupLine'
import { BlockGroupMenu } from './BlockGroupMenu'
import { blockSummary, byStart, onAxis, removeBlocksTarget, type GroupWhere, type MenuBlock, type MenuCtx, type MenuJudge, type MenuState } from './groupMenu'
import { runBlockGroup } from './groupRun'
import type { TimelineItem } from './Timeline'

/** What the hook needs of a tile of the axis. */
export type AxisTile = Pick<TimelineItem, 'id' | 'startMin' | 'endMin' | 'cost' | 'movable' | 'dim'>

export interface AxisGroupOptions {
  view: Extract<GroupView, 'today' | 'template'>
  /** The tiles that can be selected – every one the axis draws (the revealed block of a hidden calendar too), in any order: they are the order, the line and the menu. */
  tiles: readonly AxisTile[]
  /** The blocks of the day or of the version (their category, variant and routine go into the menu). */
  plan: readonly PlanBlock[]
  /** Every id the screen still has (a selected one that is not here drops out – removed on another computer). */
  present: readonly string[]
  /** Another value drops the selection (the day, the version of a template). */
  scope: string
  today: string
  /** The day of the blocks (the window „Przenieś na dzień…” starts from the next one). */
  moveFrom?: string
  /** The module of the energy is on (the line says it). */
  energy: boolean
  ctx: MenuCtx
  /** Where a block is in its day (default: still to come). */
  stateOf?: (id: string, tile: AxisTile) => MenuState
  /** Where the blocks are (the day, the template's version) – the change of the menu goes there. */
  where: GroupWhere
  /** The engine's judgement of the menu's entries on the view's model (T1720); none – `stateOf`. */
  judge?: MenuJudge
}

export interface AxisGroup {
  sel: SelectionApi
  /** The text over the axis for two or more selected; null otherwise. */
  summary: string | null
  /** The line over the axis (`summary` in its element, `axis-selection`); null – nothing to say. */
  line: ReactNode
  /** For the Timeline's `marked`. */
  marked: (id: string) => boolean
  /** A click: with Ctrl or Shift it only selects (false); a plain click – true: the screen opens the block (and `selectOnly`s it). */
  onSelect: (id: string, mods: { ctrl: boolean; shift: boolean }) => boolean
  /** The block now the only one selected (the screen opened it). */
  selectOnly: (id: string) => void
  /** The panel closed, a new block started, the block removed: a selection of one goes (it was the open block's), a group stays. */
  release: () => void
  onContext: (id: string, at: { x: number; y: number }) => void
  /** What Del removes when two or more are selected: „Usunąć 4 bloki?”; null – the screen's own. */
  removeTarget: DeleteTarget | null
  /** The menu and its windows – rendered once by the screen. */
  overlay: ReactNode
}

export function useAxisGroup(o: AxisGroupOptions): AxisGroup {
  const order = useMemo(() => byStart(o.tiles).map((t) => t.id), [o.tiles])
  const sel = useSelection({ order, present: o.present, scope: o.scope, when: onAxis })
  const tiles = useMemo(() => new Map(o.tiles.map((t) => [t.id, t])), [o.tiles])
  const chosen = useMemo(() => sel.selected.flatMap((id) => (tiles.has(id) ? [tiles.get(id)!] : [])), [sel.selected, tiles])
  const summary = useMemo(() => blockSummary(chosen, o.energy), [chosen, o.energy])
  const [menu, setMenu] = useState<{ ids: readonly string[]; at: { x: number; y: number } } | null>(null)
  const removeTarget = sel.count >= 2 ? removeBlocksTarget(sel.count, () => runBlockGroup(o.view, [...sel.selected], { kind: 'remove' }, o.where)) : null
  // Stable while the screen's inputs are (the menu counts its entries again only when they change).
  const ctx: MenuCtx = useMemo(() => (o.judge ? { ...o.ctx, judge: o.judge } : o.ctx), [o.ctx, o.judge])
  const count = useRef(0)
  count.current = sel.count
  /** The selected blocks as the menu knows them: what the plan says (category, variant, routine), what the tile says (cost, hour), where they are in the day. */
  const { plan, stateOf } = o
  const blocksOf = useCallback(
    (ids: readonly string[]): MenuBlock[] =>
      ids.flatMap((id) => {
        const b = plan.find((x) => x.id === id)
        const t = tiles.get(id)
        if (!b || !t) return []
        return [{ id, categoryId: b.categoryId, variantId: b.variantId ?? null, routine: b.routine ?? null, costs: t.cost?.costs ?? null, state: stateOf?.(id, t) ?? 'open', movable: t.movable === true }]
      }),
    [plan, tiles, stateOf]
  )
  return {
    sel,
    summary,
    line:
      summary == null ? null : (
        <div className="text-[12px] text-muted" data-testid="axis-selection">
          {summary}
        </div>
      ),
    marked: sel.isSelected,
    onSelect: (id, mods) => {
      if (!mods.ctrl && !mods.shift) return true
      sel.onItemClick(id, { ctrlKey: mods.ctrl, shiftKey: mods.shift })
      return false
    },
    selectOnly: (id) => void sel.onItemClick(id, { ctrlKey: false, shiftKey: false }),
    release: () => {
      if (count.current === 1) sel.clear()
    },
    onContext: (id, at) => setMenu({ ids: [...sel.onItemContext(id)], at }),
    removeTarget,
    overlay: <BlockGroupMenu view={o.view} menu={menu} onClose={() => setMenu(null)} blocksOf={blocksOf} ctx={ctx} today={o.today} moveFrom={o.moveFrom} where={o.where} />
  }
}
