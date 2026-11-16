/**
 * The menu „Zmień 4 bloki” of the right button (D528) and the two windows it opens: the cost of the blocks („Koszt…” – the four numbers of the tile's
 * window, with „Jak podkategoria”) and the day to move them to („Przenieś na dzień…”). The entries are `blockMenu` (pure); every pick goes to
 * `runBlockGroup`. One component for the axes of „Dziś” and „Szablony” and the columns of „Tydzień” and „3 dni”: the screen says which blocks the
 * ids are (`blocksOf`) and what to choose from (`ctx`).
 */
import { useMemo, useState } from 'react'
import { groupCount } from '@shared/groupText'
import { addDays } from '@shared/time/zone'
import { COST_MAX, COST_MIN, costNumber, costStep } from '@shared/model/blockCosts'
import { POOLS, type Costs, type Pool } from '@shared/model/categories'
import { ContextMenu } from '../../components/ContextMenu'
import { Dialog } from '../../components/Dialog'
import { DateField } from '../../components/fields'
import type { GroupView } from '../../store/groupLine'
import { POOL_COLOR, POOL_NAME } from './energyDraw'
import { blockMenu, blockMenuTitle, type GroupWhere, type MenuBlock, type MenuCtx } from './groupMenu'
import { runBlockGroup } from './groupRun'

type Window = { kind: 'cost' | 'move'; ids: string[] }

export function BlockGroupMenu({
  view,
  menu,
  onClose,
  blocksOf,
  ctx,
  today,
  moveFrom,
  where
}: {
  view: GroupView
  menu: { ids: readonly string[]; at: { x: number; y: number } } | null
  onClose: () => void
  /** The blocks the ids are, in the order of the selection. */
  blocksOf: (ids: readonly string[]) => MenuBlock[]
  ctx: MenuCtx
  today: string
  /** The day of the blocks (the one the window of „Przenieś na dzień…” starts from the day after) – none in „Tydzień”. */
  moveFrom?: string
  /** Where the blocks are (the day of „Dziś”, the version of a template) – none in „Tydzień” (the keys say it). */
  where?: GroupWhere
}) {
  const [window, setWindow] = useState<Window | null>(null)
  const blocks = window ? blocksOf(window.ids) : []
  // The entries counted for the menu opened (the engine's verdicts of the selection – one pass, T1720) and again only when what they come from
  // changes: the day or the template's version (`where`), the view, the view's data (`ctx` – its `judge` holds the model) and the blocks
  // (`blocksOf`); the screens keep those stable between their renders.
  const whereKey = where == null ? '' : 'date' in where ? where.date : `${where.templateId}|${where.from}`
  const items = useMemo(
    () =>
      menu
        ? blockMenu(blocksOf(menu.ids), ctx, {
            action: (a) => void runBlockGroup(view, menu.ids, a, where),
            cost: () => setWindow({ kind: 'cost', ids: [...menu.ids] }),
            moveTo: () => setWindow({ kind: 'move', ids: [...menu.ids] })
          })
        : [],
    // `where` by its value (`whereKey`): a screen may make the object anew at a render.
    [menu, view, whereKey, ctx, blocksOf]
  )
  return (
    <>
      {menu && (
        <ContextMenu
          title={blockMenuTitle(menu.ids.length)}
          at={menu.at}
          onClose={onClose}
          testId="block-menu"
          items={items}
        />
      )}
      {window?.kind === 'cost' && (
        <GroupCostDialog
          n={window.ids.length}
          initial={commonCosts(blocks)}
          onClose={() => setWindow(null)}
          onApply={(costs) => {
            setWindow(null)
            void runBlockGroup(view, window.ids, { kind: 'cost', costs }, where)
          }}
        />
      )}
      {window?.kind === 'move' && (
        <GroupMoveDialog
          n={window.ids.length}
          today={today}
          initial={addDays(moveFrom && moveFrom >= today ? moveFrom : today, 1)}
          onClose={() => setWindow(null)}
          onMove={(date) => {
            setWindow(null)
            void runBlockGroup(view, window.ids, { kind: 'moveTo', date }, where)
          }}
        />
      )}
    </>
  )
}

/** The cost the window starts from: the first selected block's (all of them having it – the same one); none known: zeros. */
export function commonCosts(blocks: readonly MenuBlock[]): Costs {
  return blocks.find((b) => b.costs)?.costs ?? { head: 0, emotions: 0, senses: 0, body: 0 }
}

/** „Koszt na godzinę” of the selected blocks: the four numbers, −5 … 5, „Jak podkategoria” (their own cost given up), „Zastosuj”. */
export function GroupCostDialog({ n, initial, onClose, onApply }: { n: number; initial: Costs; onClose: () => void; onApply: (costs: Costs | null) => void }) {
  const [costs, setCosts] = useState<Costs>(initial)
  const step = (pool: Pool, by: 1 | -1) => setCosts((c) => costStep(c, pool, by))
  return (
    <Dialog
      title={`Koszt na godzinę – ${groupCount(n, 'block')}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onApply(null)} data-testid="group-cost-reset">
            Jak podkategoria
          </button>
          <button type="button" className="btn btn-accent" onClick={() => onApply(costs)} data-testid="group-cost-apply">
            Zastosuj
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
      data-testid="group-cost"
    >
      <div className="num flex flex-col gap-1.5 text-[12px]">
        {POOLS.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-[58px] shrink-0" style={{ color: POOL_COLOR[p] }}>
              {POOL_NAME[p]}
            </span>
            <button type="button" className="btn px-2 py-0" disabled={costs[p] <= COST_MIN} onClick={() => step(p, -1)} aria-label={`${POOL_NAME[p]}: mniej`} data-testid={`group-cost-${p}-minus`}>
              −
            </button>
            <span className="w-6 text-center text-fg" data-testid={`group-cost-${p}-value`}>
              {costNumber(costs[p])}
            </span>
            <button type="button" className="btn px-2 py-0" disabled={costs[p] >= COST_MAX} onClick={() => step(p, 1)} aria-label={`${POOL_NAME[p]}: więcej`} data-testid={`group-cost-${p}-plus`}>
              +
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

/** „Przenieś na dzień…”: the day (a day gone by is refused – D417), „Przenieś” moves them all, each keeping its hour. */
export function GroupMoveDialog({ n, today, initial, onClose, onMove }: { n: number; today: string; initial: string; onClose: () => void; onMove: (date: string) => void }) {
  const [date, setDate] = useState(initial)
  const past = date < today
  return (
    <Dialog
      title={`Przenieś ${groupCount(n, 'block')} na dzień`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-accent" disabled={past} title={past ? 'Dni minionych nie zmieniasz' : undefined} onClick={() => onMove(date)} data-autofocus data-testid="group-move-apply">
            Przenieś
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
      data-testid="group-move"
    >
      <DateField today={today} value={date} onCommit={setDate} shellClassName="w-[140px]" aria-label="Dzień" data-testid="group-move-date" />
      <p className="mt-2 text-[12px] text-muted">Każdy blok zachowuje swoją godzinę; zajęte miejsca rozsuwają kolejne bloki elastyczne.</p>
    </Dialog>
  )
}
