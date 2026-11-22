/**
 * The panel „Sprawy” beside the columns of „Tydzień” and „3 dni” (UX19, D565 P27 – changes D384): the panel of „Dziś” (`CasesPanel`: the lists „Dziś” and
 * „Skrzynka”, its own selection, Ctrl+A in it, the menu of the right button) with its row dragged onto the column of a day – the band of the place shows
 * over the column while it is held (`week-case-drop`, refused over a day gone by), letting go puts the sprawa – or the selection of two and more that
 * the row is one of – there (`weekCaseDrop`). „Zaplanuj” of a row is today's nearest free place.
 */
import { useRef } from 'react'
import { estimateOf, type CaseItem } from '@shared/engine/cases'
import { groupBlockMinutes } from '@shared/engine/casesGroup'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { CasesPanel } from '../cases/CasesPanel'
import { carriedBy } from '../cases/groupActions'
import { bandOf, dropOnDay, planToday, useWeekCaseDrag } from './weekCaseDrop'

export function WeekCasesPanel({ today }: { today: string }) {
  const requests = useData((s) => s.requests)
  // The selection of the panel (it tells at every change): what a drag of one of its rows carries (`carriedBy`, the rule of the panel of „Dziś”).
  const selected = useRef<readonly CaseItem[]>([])
  const { drag, grab, started } = useWeekCaseDrag((id, target, copy) => void dropOnDay({ today, id, target, copy, carried: carriedBy(selected.current, id) }))
  const dragged = drag ? requests.find((x) => x.id === drag.id) : undefined
  const group = drag ? carriedBy(selected.current, drag.id) : null
  const length = group ? groupBlockMinutes(group.map((x) => x.record)) : dragged ? estimateOf(dragged) : 0
  const target = drag?.target ?? null
  const band = target ? bandOf(target, length) : null
  const denied = target != null && target.date < today
  return (
    <aside className="sticky top-2 flex max-h-[calc(100vh-2rem)] w-[280px] shrink-0 flex-col overflow-y-auto rounded-lg border border-line bg-panel p-3" data-testid="week-cases">
      <CasesPanel
        view="week"
        drag={drag}
        grab={grab}
        started={started}
        onPlan={(x) => void planToday(x, today)}
        onSelected={(s) => void (selected.current = s)}
        hint="Przeciągnij sprawę na kolumnę dnia (Ctrl – kopia) albo kliknij „Zaplanuj”."
        planTitle="Postaw dziś w najbliższym wolnym miejscu"
      />
      {band && target && (
        // The place the sprawa would take, drawn over the column (the pointer is the page's – the columns are not touched by the drag).
        <div
          className={cx('num pointer-events-none fixed z-40 overflow-hidden rounded-[3px] border border-dashed px-1 text-[11px] leading-[14px] text-fg', denied ? 'border-rose bg-rose/10' : 'border-lamp bg-lamp/20')}
          style={{ left: band.left, width: band.width, top: band.top, height: band.height }}
          data-testid="week-case-drop"
          data-date={target.date}
          data-start={target.minute}
          data-denied={denied ? 'true' : undefined}
        />
      )}
    </aside>
  )
}
