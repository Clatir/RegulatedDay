/**
 * The matrix of Eisenhower on the page „Sprawy” (HKU3, D450): the sprawy not done in four fields – „Ważne i pilne” and „Ważne”
 * above, „Pilne” and „Ani to, ani to” below (the classic layout: „ważne” down the page, „pilne” across it) – and under them the
 * field „Bez priorytetu”. A card is dragged from field to field: one `changeCase` writes the new priority. In a field the sprawy
 * stand in the order of the lists (due dates first), each with its due date's badge and the name of its list. A filter picks
 * the list (default: all). Nothing here blocks (D72).
 */
import { useState } from 'react'
import { dueBadge } from '@shared/engine/caseDates'
import { dropPatch, MATRIX_COLUMNS, MATRIX_FILTERS, MATRIX_ROWS, MATRIX_SIDES, matrixCounts, matrixOf, type MatrixFilter, type MatrixField } from '@shared/engine/casePriority'
import type { CaseItem } from '@shared/engine/cases'
import { durationLabel } from '@shared/format'
import { CASE_LIST_NAMES, NO_PRIORITY_NAME, PRIORITY_NAMES, type Priority } from '@shared/model/requests'
import { cx } from '../../components/ui'
import { changeCase } from '../../store/cases'
import { useData } from '../../store/data'
import { caseTitle } from './casesLogic'
import { DueMark } from './DueMark'
import { PriorityMark } from './PriorityMark'
import { useMatrixDrag, type MatrixDragState } from './useMatrixDrag'
import { ownControl } from './usePointerDrag'

const FILTER_LABELS: Record<MatrixFilter, string> = { inbox: CASE_LIST_NAMES.inbox, today: CASE_LIST_NAMES.today, week: CASE_LIST_NAMES.week, someday: CASE_LIST_NAMES.someday, all: 'wszystkie' }

export function CasesMatrix({ items, today }: { items: readonly CaseItem[]; today: string }) {
  const rd = useData((s) => s.rd)
  const [filter, setFilter] = useState<MatrixFilter>('all')
  const matrix = matrixOf(items, filter)
  const counts = matrixCounts(items)
  const { drag, grab } = useMatrixDrag((id, field) => {
    // One write: the new quarter (D450); a drop where the sprawa is already – nothing.
    const patch = dropPatch(items.find((x) => x.record.id === id), field)
    if (patch) void changeCase(id, patch)
  })
  const dragged = drag ? items.find((x) => x.record.id === drag.id) : undefined

  const card = (x: CaseItem) => {
    const title = caseTitle(x.record, rd)
    const badge = dueBadge(x.record, today)
    return (
      <li
        key={x.record.id}
        className={cx('flex cursor-grab touch-none select-none flex-col gap-0.5 rounded border border-line bg-bg px-2 py-1.5', drag?.id === x.record.id && 'opacity-50')}
        onPointerDown={(e) => {
          // Not a text selection of the card's words while it is dragged.
          if (e.button === 0 && !ownControl(e.target)) e.preventDefault()
          grab(x.record.id, e)
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
        className={cx('relative flex min-w-0 flex-col gap-1.5 rounded border py-2 pr-2 pl-3.5', f === 'none' ? 'min-h-[64px]' : 'min-h-[132px]', drag?.over === f ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel')}
        data-matrix-field={f}
        data-testid={`matrix-${f}`}
        data-over={drag?.over === f ? 'true' : undefined}
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
    <div className="flex flex-col gap-3" data-testid="cases-matrix">
      <div className="flex flex-wrap items-center gap-1.5" data-testid="matrix-filters">
        {MATRIX_FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`matrix-filter-${f}`}>
            {FILTER_LABELS[f]}
            <span className="num ml-1.5 text-[11px]">{counts[f]}</span>
          </button>
        ))}
        <span className="text-[12px] text-muted">Przeciągnij sprawę do innego pola – zmienisz jej priorytet.</span>
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
