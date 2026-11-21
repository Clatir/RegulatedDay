/**
 * The panel of „Sprawy” beside the axis of „Dziś” (D384): the list „Dziś” (with the sum of its estimates, D402) and
 * „Skrzynka”. A row is dragged onto the axis – the block it makes stands where it is dropped – or put in the nearest free place
 * with „Zaplanuj”. A sprawa that is „zaplanowane” already says where; planned again, its old block (if it has not begun)
 * goes. The week has no such panel (D384).
 */
import { useEffect, useMemo, useRef } from 'react'
import { durationLabel } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { useData } from '../../store/data'
import { navigate } from '../../store/ui'
import { useCases } from '../../store/cases'
import { dueBadge } from '@shared/engine/caseDates'
import type { CaseItem } from '@shared/engine/cases'
import { cx } from '../../components/ui'
import { DEL_RING, deleteMark, useDeleteResolver } from '../../lib/deleteKey'
import { caseTitle, sectionsOf, statusParts } from './casesLogic'
import { DueMark } from './DueMark'
import { PriorityMark } from './PriorityMark'
import type { CaseDragState } from './useCaseDrag'
import { carriedBy } from './groupActions'
import { useCasesGroup } from './useCasesGroup'
import { ownControl } from './usePointerDrag'

/**
 * `onSelected` hears the selection of the panel whenever it changes (in the order shown): the page of the axis, which holds the drag, asks it at the
 * drop and for the ghost what a drag of a sprawa carries (`carriedBy` – the one rule).
 */
export function CasesPanel({ drag, grab, started, onPlan, onSelected }: { drag: CaseDragState | null; grab: (id: string, e: React.PointerEvent) => void; started?: { current: boolean }; onPlan: (item: CaseItem) => void; onSelected?: (selected: readonly CaseItem[]) => void }) {
  const rd = useData((s) => s.rd)
  const { items, today } = useCases()
  // Requests belong to their module (spec „Moduły”): switched off, the panel holds the tasks' alone, as the page does.
  const requestsOn = rd.general.modules.requests
  const sections = useMemo(() => sectionsOf(items.filter((x) => requestsOn || x.record.kind === 'task'), { showOlder: false }).filter((s) => s.list === 'today' || s.list === 'inbox'), [items, requestsOn])
  const dragged = drag ? items.find((x) => x.record.id === drag.id) : undefined
  // D527: the selection of the panel (its two lists; Shift and Ctrl+A go within one) – the keys are the panel's only with the focus in it.
  const panel = useRef<HTMLElement>(null)
  const lists = useMemo(() => sections.map((s) => s.items.map((x) => x.record.id)), [sections])
  const group = useCasesGroup({ view: 'today', items, lists, enabled: true, when: () => panel.current?.contains(document.activeElement) === true, dragStarted: () => {
      // The click that follows a gesture that started answers once (as on the card of the matrix).
      const was = started?.current === true
      if (started) started.current = false
      return was
    }, today })
  // D530: a selected sprawa dragged carries the whole selection (the page of the axis hears which – `onSelected`).
  const heard = useRef(onSelected)
  heard.current = onSelected
  useEffect(() => heard.current?.(group.selected), [group.selected])
  const carried = drag ? carriedBy(group.selected, drag.id) : null
  // Del with the focus on a row of a selection of two and more: „Usunąć 3 sprawy?”. A row of one sprawa selected is not marked for Del – the
  // block selected on the axis keeps its Del (the panel has no removal of one).
  const removeGroupOf = group.removeTarget
  useDeleteResolver('case', (id) => (removeGroupOf && group.sel.isSelected(id) ? removeGroupOf : null))
  const row = (x: CaseItem) => {
    const title = caseTitle(x.record, rd)
    const parts = statusParts(x, today).filter((p) => p.startsWith('zaplanowane') || p.startsWith('wykonać'))
    const badge = dueBadge(x.record, today)
    return (
      <li
        key={x.record.id}
        {...(removeGroupOf && group.sel.isSelected(x.record.id) ? deleteMark('case', x.record.id) : { tabIndex: -1 })}
        {...group.rowProps(x)}
        className={cx('relative flex cursor-grab touch-none select-none flex-col gap-0.5 rounded border px-2 py-1.5', DEL_RING, group.sel.isSelected(x.record.id) ? 'border-lamp bg-lamp-soft' : 'border-line bg-bg', (drag?.id === x.record.id || carried?.some((c) => c.record.id === x.record.id)) && 'opacity-50')}
        onPointerDown={(e) => {
          // Not a text selection of the row's words while it is dragged.
          if (e.button === 0 && !ownControl(e.target)) e.preventDefault()
          grab(x.record.id, e)
        }}
        data-testid="case-chip"
        data-case={x.record.id}
      >
        {x.record.priority && <PriorityMark priority={x.record.priority} />}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px]" title={title}>
            {title}
          </span>
          {badge && <DueMark badge={badge} />}
          <span className="num shrink-0 text-[11.5px] text-muted">{durationLabel(x.estimateMin)}</span>
          <button type="button" className="shrink-0 text-[11.5px] text-lamp hover:underline" onClick={() => onPlan(x)} data-testid="case-plan" title="Postaw w najbliższym wolnym miejscu osi">
            Zaplanuj
          </button>
        </div>
        {parts.length > 0 && <span className="text-[11px] text-muted">{parts.join(' · ')}</span>}
      </li>
    )
  }
  return (
    <section ref={panel} className="flex flex-col gap-2" data-testid="cases-panel">
      <h3 className="text-[13px] font-medium">Sprawy</h3>
      {group.summary && (
        <p className="text-[11.5px] text-muted" data-testid="cases-panel-selection">
          {group.summary}
        </p>
      )}
      {sections.map((s) => (
        <div key={s.list} className="flex flex-col gap-1" data-testid={`cases-panel-${s.list}`}>
          <h4 className="text-[12px] text-muted">{s.title}</h4>
          {s.items.length ? <ul className="flex flex-col gap-1">{s.items.map(row)}</ul> : <p className="text-[11.5px] text-muted">Pusto.</p>}
        </div>
      ))}
      <p className="text-[11.5px] text-muted">Przeciągnij sprawę na oś albo kliknij „Zaplanuj”.</p>
      <button type="button" className="self-start text-[12px] text-lamp hover:underline" onClick={() => navigate('requests')} data-testid="cases-open">
        Wszystkie sprawy…
      </button>
      {drag && dragged && (
        // D513: Ctrl held – the drop puts a copy of the sprawa on the axis (the original stays on its list): „+” before its title.
        <div className="pointer-events-none fixed z-50 max-w-[220px] truncate rounded border border-lamp bg-panel px-2 py-1 text-[12px] shadow-lg" style={{ left: drag.x + 12, top: drag.y + 8 }} data-testid="case-drag" data-copy={drag.copy ? 'true' : undefined}>
          {drag.copy ? '+ ' : ''}
          {carried ? groupCount(carried.length, 'case') : caseTitle(dragged.record, rd)}
        </div>
      )}
      {group.overlay}
    </section>
  )
}
