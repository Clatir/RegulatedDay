/**
 * Energy live in „Tydzień” and „3 dni” (N19, T2582): while a block is held over a column, the lowest energy of THE DAY IT WOULD STAND ON before the
 * drop and with it – „najniższa energia 52 → 44 (G)” under the band of its place. The target day is counted in the window (`useDay`, the energy
 * module as it is set – the columns have only the track of the energy, no engine state to try a plan on); the plan after the drop is built as
 * the drop writes it: within a day `dragChange` / `copyPreview`, onto another day the block as `movedBlock` puts it there (`addChange`, what it
 * pushes apart) – one rule with „Dziś” (`changeTrial`). Said of the target day only: the day the block leaves is not counted. A drop onto
 * a block (D492) and a group's drag say nothing here.
 */
import type { TrialChange } from '@shared/engine/trialEnergy'
import { copiedBlock, movedBlock } from '@shared/engine/planEdit'
import { useData } from '../../store/data'
import { useDay, type DayModel } from '../../store/day'
import { copyPreview } from '../plan/blockCopy'
import { TrialCaption, trialText } from '../plan/TrialCaption'
import { changeTrial, useTrialLowest, type Trial } from '../plan/trialEnergy'
import { addChange, COPY_SPAN_ID, dragChange } from '../today/dayPush'

/** What is held: the block, its day, the day and start it would take, Ctrl (a copy). */
export interface WeekTrialDrop {
  id: string
  from: string
  to: string
  startMin: number
  copy: boolean
}

/**
 * The change the drop writes on the target day, as a trial: `source` – the block's own day, `target` – the day it lands on (the same model within
 * a day); `pushes` – the day is today or to come. Null – nothing to try (the block is not in the plan of its day).
 */
export function weekTrialChange(source: DayModel, target: DayModel, d: WeekTrialDrop, pushes: boolean): TrialChange | null {
  const b = source.ctx.plan.find((x) => x.id === d.id)
  if (!b) return null
  if (d.from === d.to) {
    const c = d.copy ? copyPreview(target, b, d.startMin, pushes) : dragChange(target, d.id, { startMin: d.startMin, endMin: d.startMin }, null, { startMin: d.startMin, endMin: d.startMin }, pushes)
    return c ? changeTrial(target, c) : null
  }
  const placed = d.copy ? copiedBlock(b, d.startMin, { id: COPY_SPAN_ID }) : movedBlock(b, source.ctx.plan, d.from, true, d.startMin)
  return changeTrial(target, addChange(target, placed, pushes))
}

const keyOf = (d: WeekTrialDrop): string => `w|${d.from}|${d.to}|${d.id}|${d.startMin}|${d.copy}`

function Said({ drop, source, target, top }: { drop: WeekTrialDrop; source: DayModel | null; target: DayModel | null; top: number }) {
  const trial: Trial | null = source && target ? { key: keyOf(drop), change: () => weekTrialChange(source, target, drop, true) } : null
  const shown = useTrialLowest(target, trial)
  if (!trialText(shown)) return null
  return (
    <div className="pointer-events-none absolute right-0 left-0 z-30 rounded-sm border border-line bg-bg/90 px-1 text-[10.5px] leading-[13px]" style={{ top }} data-testid="week-energy-trial" data-date={drop.to}>
      <TrialCaption shown={shown} />
    </div>
  )
}

/** Within a day: its model is the block's source too. */
function WithinDay(p: { drop: WeekTrialDrop; top: number }) {
  const day = useDay(p.drop.to)
  return <Said drop={p.drop} source={day} target={day} top={p.top} />
}

/** Onto another day: the block's own day is read for the block itself. */
function AcrossDays(p: { drop: WeekTrialDrop; top: number }) {
  const source = useDay(p.drop.from)
  const target = useDay(p.drop.to)
  return <Said drop={p.drop} source={source} target={target} top={p.top} />
}

/** The caption under the band of a block held over a column (`top` – its bottom edge in the column); none over a day gone by (the drop there is refused). */
export function WeekTrial({ drop, top }: { drop: WeekTrialDrop; top: number }) {
  const today = useData((s) => s.view?.today ?? '')
  if (!today || drop.to < today) return null
  return drop.from === drop.to ? <WithinDay drop={drop} top={top} /> : <AcrossDays drop={drop} top={top} />
}
