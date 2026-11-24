/**
 * The menu „Zmień 4 bloki” of the right button (D528) and the two windows it opens: the cost of the blocks („Koszt…” – the four numbers of the tile's
 * window, with „Jak podkategoria”) and the day to move them to („Przenieś na dzień…”). The entries are `blockMenu` (pure); every pick goes to
 * `runBlockGroup`. One component for the axes of „Dziś” and „Szablony” and the columns of „Tydzień” and „3 dni”: the screen says which blocks the
 * ids are (`blocksOf`) and what to choose from (`ctx`). The columns give `copyWeeks` (N16): „Skopiuj do tygodni…” – the next weeks at once, or the
 * window of weeks (`WeeksDialog`), through the flow of „Skopiuj tydzień do…” (`useWeekCopyFlow`).
 */
import { useMemo, useRef, useState } from 'react'
import { groupCount } from '@shared/groupText'
import { addDays } from '@shared/time/zone'
import { COST_MAX, COST_MIN, costSet, costStep } from '@shared/model/blockCosts'
import { POOLS, type Costs, type Pool } from '@shared/model/categories'
import { ContextMenu } from '../../components/ContextMenu'
import { Dialog } from '../../components/Dialog'
import { DateField } from '../../components/fields'
import type { GroupView } from '../../store/groupLine'
import { CostInput, WideCostWarning } from './CostInput'
import { POOL_COLOR, POOL_NAME } from './energyDraw'
import { blockMenu, blockMenuTitle, parseBlockKey, type GroupWhere, type MenuBlock, type MenuCtx } from './groupMenu'
import { runBlockGroup } from './groupRun'
import { nextWeeks } from '../calendar/dayQuick'
import { copyFromKeys, sourceWeekOf } from '../week/weekCopy'
import { useWeekCopyFlow, WeeksDialog } from '../week/WeekCopyFlow'
import { SaveAsWindow, type SaveAsOpen } from './SaveAsDialogs'

type Window = { kind: 'cost' | 'move' | 'weeks'; ids: string[] } | { kind: 'save'; open: SaveAsOpen }

/** Why the blocks of a selection cannot be saved as a template or a routine (N15): they are of several days. */
export const SAVE_AS_DAYS_WHY = 'Szablon i rutynę zapiszesz z bloków jednego dnia'

/**
 * The day and the blocks of a selection for „Zapisz jako…” (N15): the day of „Dziś” (`where.date`) and the ids, or the keys of the columns by their
 * one day; blocks of several days (or no day known) – the reason.
 */
export function saveAsSource(view: GroupView, ids: readonly string[], where?: GroupWhere): { date: string; ids: string[] } | { why: string } {
  if (view === 'today' && where && 'date' in where) return { date: where.date, ids: [...ids] }
  const keys = ids.map(parseBlockKey)
  const dates = new Set(keys.map((k) => k.date))
  return dates.size === 1 ? { date: keys[0]!.date, ids: keys.map((k) => k.id) } : { why: SAVE_AS_DAYS_WHY }
}

export function BlockGroupMenu({
  view,
  menu,
  onClose,
  blocksOf,
  ctx,
  today,
  moveFrom,
  where,
  saveAs,
  copyWeeks
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
  /** „Zapisz jako szablon…” and „Zapisz jako rutynę…” in the menu (N15: „Dziś”, „Tydzień”, „3 dni”). */
  saveAs?: boolean
  /** „Skopiuj do tygodni…” (N16): the ids are keys of the columns (`blockKey`); left out – no such entry. */
  copyWeeks?: boolean
}) {
  const [window, setWindow] = useState<Window | null>(null)
  const copy = useWeekCopyFlow()
  // The flow by a ref: the entries are counted once per menu opened (T1720) – a new function of the flow at a render must not count them again.
  const copyFlow = useRef(copy)
  copyFlow.current = copy
  const blocks = window && window.kind !== 'save' ? blocksOf(window.ids) : []
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
            moveTo: () => setWindow({ kind: 'move', ids: [...menu.ids] }),
            ...(saveAs ? { saveAs: saveAsEntry(saveAsSource(view, menu.ids, where), (open) => setWindow({ kind: 'save', open })) } : {}),
            ...(copyWeeks
              ? {
                  copyWeeks: (n: number | 'pick') => {
                    const from = copyFromKeys(menu.ids)
                    if (n === 'pick') setWindow({ kind: 'weeks', ids: [...menu.ids] })
                    else void copyFlow.current.start(from, nextWeeks(sourceWeekOf(from), n))
                  }
                }
              : {})
          })
        : [],
    // `where` by its value (`whereKey`): a screen may make the object anew at a render.
    [menu, view, whereKey, ctx, blocksOf, saveAs, copyWeeks]
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
      {window?.kind === 'save' && <SaveAsWindow open={window.open} view={view} onClose={() => setWindow(null)} />}
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
      {window?.kind === 'weeks' && (
        <WeeksDialog
          week={sourceWeekOf(copyFromKeys(window.ids))}
          sources={copyFromKeys(window.ids).dates}
          today={today}
          busy={copy.busy}
          title={`Skopiuj ${groupCount(window.ids.length, 'block')} do…`}
          onClose={() => setWindow(null)}
          onPick={async (weeks) => {
            if (await copy.start(copyFromKeys(window.ids), weeks)) setWindow(null)
          }}
        />
      )}
      {copy.dialogs}
    </>
  )
}

/** The menu's „Zapisz jako…” for a source: its windows, or both off with the reason. */
function saveAsEntry(src: ReturnType<typeof saveAsSource>, open: (o: SaveAsOpen) => void): { pick: (kind: SaveAsOpen['kind']) => void; why?: string } {
  if ('why' in src) return { pick: () => undefined, why: src.why }
  return { pick: (kind) => open({ kind, date: src.date, ids: src.ids }) }
}

/** The cost the window starts from: the first selected block's (all of them having it – the same one); none known: zeros. */
export function commonCosts(blocks: readonly MenuBlock[]): Costs {
  return blocks.find((b) => b.costs)?.costs ?? { head: 0, emotions: 0, senses: 0, body: 0 }
}

/** „Koszt na godzinę” of the selected blocks: the four numbers (typed or stepped, −100 … 100 – D568), „Jak podkategoria” (their own cost given up), „Zastosuj”. */
export function GroupCostDialog({ n, initial, onClose, onApply }: { n: number; initial: Costs; onClose: () => void; onApply: (costs: Costs | null) => void }) {
  const [costs, setCosts] = useState<Costs>(initial)
  const step = (pool: Pool, by: 1 | -1) => setCosts((c) => costStep(c, pool, by))
  // A field that stands refused (its reason under it – 101, 1,5; also one refused by the blur of the press on „Zastosuj”): „Zastosuj” applies
  // nothing and the window stays (T2440). The field's own state is the one source (`aria-invalid`): Esc or a taken text clears it.
  const box = useRef<HTMLDivElement>(null)
  const apply = () => {
    if (box.current?.querySelector('[aria-invalid="true"]')) return
    onApply(costs)
  }
  return (
    <Dialog
      title={`Koszt na godzinę – ${groupCount(n, 'block')}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onApply(null)} data-testid="group-cost-reset">
            Jak podkategoria
          </button>
          <button type="button" className="btn btn-accent" onClick={apply} data-testid="group-cost-apply">
            Zastosuj
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
      data-testid="group-cost"
    >
      <div ref={box} className="num flex flex-col gap-1.5 text-[12px]">
        {POOLS.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-[58px] shrink-0" style={{ color: POOL_COLOR[p] }}>
              {POOL_NAME[p]}
            </span>
            <button type="button" className="btn px-2 py-0" disabled={costs[p] <= COST_MIN} onClick={() => step(p, -1)} aria-label={`${POOL_NAME[p]}: mniej`} data-testid={`group-cost-${p}-minus`}>
              −
            </button>
            <CostInput
              pool={p}
              value={costs[p]}
              onCommit={(v) => setCosts((c) => costSet(c, p, v))}
              testId={`group-cost-${p}-value`}
              wheel="step"
            />
            <button type="button" className="btn px-2 py-0" disabled={costs[p] >= COST_MAX} onClick={() => step(p, 1)} aria-label={`${POOL_NAME[p]}: więcej`} data-testid={`group-cost-${p}-plus`}>
              +
            </button>
          </div>
        ))}
        <WideCostWarning costs={[costs]} testId="group-cost-old" />
      </div>
    </Dialog>
  )
}

/** „Przenieś na dzień…”: the day (a day gone by is refused – D417), „Przenieś” moves them all, each keeping its hour. */
export function GroupMoveDialog({ n, today, initial, onClose, onMove }: { n: number; today: string; initial: string; onClose: () => void; onMove: (date: string) => void }) {
  const [date, setDate] = useState(initial)
  const moveBox = useRef<HTMLDivElement>(null)
  const past = date < today
  return (
    <Dialog
      title={`Przenieś ${groupCount(n, 'block')} na dzień`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-accent" disabled={past} title={past ? 'Dni minionych nie zmieniasz' : undefined} onClick={() => !moveBox.current?.querySelector('[aria-invalid="true"]') && onMove(date)} data-autofocus data-testid="group-move-apply">
            Przenieś
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
      data-testid="group-move"
    >
      {/* A date the field stands refusing (31.02, also refused by the blur of the press on „Przenieś”): „Przenieś” moves nothing (T2440). */}
      <div ref={moveBox}>
        <DateField today={today} value={date} onCommit={setDate} shellClassName="w-[140px]" aria-label="Dzień" data-testid="group-move-date" />
      </div>
      <p className="mt-2 text-[12px] text-muted">Każdy blok zachowuje swoją godzinę; zajęte miejsca rozsuwają kolejne bloki elastyczne.</p>
    </Dialog>
  )
}
