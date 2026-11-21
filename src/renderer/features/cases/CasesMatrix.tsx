/**
 * The matrix of Eisenhower on the page „Sprawy” (HKU3, D450): the sprawy not done in four fields – „Ważne i pilne” and „Ważne”
 * above, „Pilne” and „Ani to, ani to” below (the classic layout: „ważne” down the page, „pilne” across it) – and under them the
 * field „Bez priorytetu”. A card is dragged from field to field: one `changeCase` writes the new priority. In a field the sprawy
 * stand in the order of the lists (due dates first), each with its due date's badge and the name of its list. A filter picks
 * the list (default: all; remembered by the window – `casesView.ts`, D457). Nothing here blocks (D72).
 * UX17 (F8, D565 P25): a card is not a drag alone – a click (or Enter / Space on it) opens the sprawa's row in the lists (`onOpen`), the cards take the focus
 * (one Tab stop, `matrixMove`: ↑ ↓ ← → between the cards and fields), the right button and Shift+F10 open „Priorytet ▸” (the five choices) and „Otwórz w Listach”.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { dueBadge } from '@shared/engine/caseDates'
import { dropPatch, MATRIX_COLUMNS, MATRIX_FILTERS, MATRIX_ROWS, MATRIX_SIDES, matrixCounts, matrixMove, matrixOf, type MatrixFilter, type MatrixField, type MatrixKey } from '@shared/engine/casePriority'
import type { CaseItem } from '@shared/engine/cases'
import { durationLabel } from '@shared/format'
import { CASE_LIST_NAMES, NO_PRIORITY_NAME, PRIORITY_NAMES, priorityFrom, type Priority } from '@shared/model/requests'
import { ContextMenu, menuBind } from '../../components/ContextMenu'
import { cx } from '../../components/ui'
import { changeCase } from '../../store/cases'
import { useData } from '../../store/data'
import { caseTitle } from './casesLogic'
import { priorityEntries } from './rowMenu'
import { DueMark } from './DueMark'
import { PriorityMark } from './PriorityMark'
import { readMatrixFilter, rememberMatrixFilter } from './casesView'
import { useMatrixDrag, type MatrixDragState } from './useMatrixDrag'
import { ownControl } from './usePointerDrag'

const FILTER_LABELS: Record<MatrixFilter, string> = { inbox: CASE_LIST_NAMES.inbox, today: CASE_LIST_NAMES.today, week: CASE_LIST_NAMES.week, someday: CASE_LIST_NAMES.someday, all: 'wszystkie' }

const ARROWS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const FIELD_ORDER: readonly MatrixField[] = ['p1', 'p2', 'p3', 'p4', 'none']

export function CasesMatrix({ items, today, onOpen }: { items: readonly CaseItem[]; today: string; onOpen: (id: string) => void }) {
  const rd = useData((s) => s.rd)
  // D457: the filter is remembered by the window, as the view is.
  const [filter, setFilterNow] = useState<MatrixFilter>(readMatrixFilter)
  const setFilter = (f: MatrixFilter) => (rememberMatrixFilter(f), setFilterNow(f))
  const matrix = useMemo(() => matrixOf(items, filter), [items, filter])
  const counts = matrixCounts(items)
  const { drag, grab, started } = useMatrixDrag((id, field) => {
    // One write: the new quarter (D450); a drop where the sprawa is already – nothing.
    const patch = dropPatch(items.find((x) => x.record.id === id), field)
    if (patch) void changeCase(id, patch)
  })
  const dragged = drag ? items.find((x) => x.record.id === drag.id) : undefined

  // The cards by field as they stand (for the arrows), the one Tab stop (the card last focused, else the first), the menu.
  const root = useRef<HTMLDivElement>(null)
  const ids = useMemo(() => Object.fromEntries(FIELD_ORDER.map((f) => [f, (f === 'none' ? matrix.none : matrix.cells[f]).map((x) => x.record.id)])) as Record<MatrixField, string[]>, [matrix])
  const [last, setLast] = useState<string | null>(null)
  const first = FIELD_ORDER.flatMap((f) => ids[f])[0] ?? null
  const stop = last && FIELD_ORDER.some((f) => ids[f].includes(last)) ? last : first
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const menuItem = menu ? items.find((x) => x.record.id === menu.id) : undefined
  // Its sprawa gone (removed on another computer): the menu goes with it and does not come back with a „Cofnij”.
  useEffect(() => {
    if (menu && !menuItem) setMenu(null)
  }, [menu, menuItem])
  const hintId = useId()
  const menuHandlers = (id: string) => menuBind((at) => setMenu({ id, at }))
  const focusCard = (id: string) => {
    setLast(id)
    root.current?.querySelector<HTMLElement>(`[data-testid="matrix-card"][data-case="${id}"]`)?.focus()
  }

  const card = (x: CaseItem) => {
    const title = caseTitle(x.record, rd)
    const badge = dueBadge(x.record, today)
    return (
      <li
        key={x.record.id}
        className={cx('flex cursor-grab touch-none select-none flex-col gap-0.5 rounded border border-line bg-bg px-2 py-1.5 outline-none focus:ring-1 focus:ring-lamp', drag?.id === x.record.id && 'opacity-50')}
        tabIndex={stop === x.record.id ? 0 : -1}
        aria-label={[title, CASE_LIST_NAMES[x.list], badge?.text, durationLabel(x.estimateMin)].filter(Boolean).join(', ')}
        aria-describedby={hintId}
        title="Kliknij – otwiera sprawę w Listach. Prawy przycisk – priorytet."
        onFocus={() => setLast(x.record.id)}
        onPointerDown={(e) => {
          // Not a text selection of the card's words while it is dragged.
          if (e.button === 0 && !ownControl(e.target)) e.preventDefault()
          grab(x.record.id, e)
        }}
        onClick={(e) => {
          // A gesture that started is a drag (what it wrote, it wrote on the drop – even brought back to the card), not a click; the click that follows it answers once.
          if (started.current) {
            started.current = false
            return
          }
          onOpen(x.record.id)
        }}
        onContextMenu={menuHandlers(x.record.id).onContextMenu}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          menuHandlers(x.record.id).onKeyDown(e)
          if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(x.record.id)
          } else if (ARROWS.includes(e.key)) {
            const next = matrixMove(ids, x.record.id, e.key as MatrixKey)
            if (next) focusCard(next)
            // The arrows are the matrix's (not the page's scroll) even at the edge.
            e.preventDefault()
          }
        }}
        data-testid="matrix-card"
        data-case={x.record.id}
      >
        <span className="truncate text-[12.5px]" title={title}>
          {title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
          <span data-testid="matrix-list">{CASE_LIST_NAMES[x.list]}</span>
          {badge && <DueMark badge={badge} />}
          <span className="num">{durationLabel(x.estimateMin)}</span>
        </span>
      </li>
    )
  }

  const field = (f: MatrixField, list: CaseItem[]) => {
    const name = f === 'none' ? NO_PRIORITY_NAME : PRIORITY_NAMES[f].name
    return (
      <section
        key={f}
        className={cx('relative flex min-w-0 flex-col gap-1.5 rounded border py-2 pr-2 pl-3.5', f === 'none' ? 'min-h-[64px]' : 'min-h-[132px]', drag?.target === f ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel')}
        data-matrix-field={f}
        data-testid={`matrix-${f}`}
        data-over={drag?.target === f ? 'true' : undefined}
        aria-label={name}
      >
        {f !== 'none' && <PriorityMark priority={f} testId={`matrix-${f}-stripe`} />}
        <h4 className="flex items-baseline gap-2 text-[12.5px] font-medium">
          <span>{name}</span>
          <span className="num text-[11.5px] font-normal text-muted" data-testid={`matrix-${f}-count`}>
            {list.length}
          </span>
        </h4>
        {list.length ? <ul className="flex flex-col gap-1">{list.map(card)}</ul> : <p className="text-[11.5px] text-muted">Pusto.</p>}
      </section>
    )
  }

  return (
    <div ref={root} className="flex flex-col gap-3" data-testid="cases-matrix">
      <span id={hintId} className="sr-only">
        Enter lub klik otwiera sprawę w Listach, strzałki przechodzą między kartami, prawy przycisk – priorytet.
      </span>
      <div className="flex flex-wrap items-center gap-1.5" data-testid="matrix-filters">
        {MATRIX_FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`matrix-filter-${f}`}>
            {FILTER_LABELS[f]}
            <span className="num ml-1.5 text-[11px]">{counts[f]}</span>
          </button>
        ))}
        <span className="text-[12px] text-muted">Przeciągnij sprawę do innego pola – zmienisz jej priorytet. Klik otwiera ją w Listach.</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'auto minmax(0,1fr) minmax(0,1fr)' }}>
        <span />
        {MATRIX_COLUMNS.map((c) => (
          <span key={c} className="text-center text-[11.5px] text-muted">
            {c}
          </span>
        ))}
        {MATRIX_ROWS.map((row, i) => (
          <MatrixRow key={i} side={MATRIX_SIDES[i]!}>
            {row.map((p: Priority) => field(p, matrix.cells[p]))}
          </MatrixRow>
        ))}
      </div>
      {field('none', matrix.none)}
      {menu && menuItem && (
        <ContextMenu
          title=""
          label="Sprawa w macierzy"
          at={menu.at}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Priorytet',
              testId: 'matrix-menu-priority',
              submenu: priorityEntries(menuItem.record.priority ?? 'none', (v) => {
                // One write, as a drop: the same patch (null – the sprawa is there already).
                const patch = dropPatch(menuItem, v === 'none' ? 'none' : (priorityFrom(v) ?? 'none'))
                if (patch) void changeCase(menuItem.record.id, patch)
              })
            },
            { label: 'Otwórz w Listach', onPick: () => onOpen(menuItem.record.id), testId: 'matrix-menu-open' }
          ]}
          testId="matrix-menu"
        />
      )}
      {drag && dragged && <DragGhost drag={drag} title={caseTitle(dragged.record, rd)} />}
    </div>
  )
}

/** One row of the grid: the label of its side („Ważne” / „Nieważne”) written down the page, then its two fields. */
function MatrixRow({ side, children }: { side: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center justify-center text-[11.5px] text-muted [writing-mode:vertical-rl] rotate-180">{side}</span>
      {children}
    </>
  )
}

function DragGhost({ drag, title }: { drag: MatrixDragState; title: string }) {
  return (
    <div className="pointer-events-none fixed z-50 max-w-[220px] truncate rounded border border-lamp bg-panel px-2 py-1 text-[12px] shadow-lg" style={{ left: drag.x + 12, top: drag.y + 8 }} data-testid="matrix-drag">
      {title}
    </div>
  )
}
