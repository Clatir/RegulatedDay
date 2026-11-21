/**
 * What the side panel of „Dziś” says of the day, put into the panel of a block that replaces it (D3, D8, D563 P10): the day's warnings
 * (no advice on a day gone by) and – today – the routines begun and not ticked off, each with the way to its card (the card stands in the
 * side panel; the panel of a block has no „Zakończ rutynę” nor „✓ Wszystkie”, so the block's own routine is said too).
 */
import { routinesDue } from '@shared/engine/routineCheck'
import { useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import type { Names } from '../plan/blockView'
import { dayWarningTexts, DayWarnings } from './DayWarnings'
import { RoutinesWaiting } from './RoutineCard'

export function BlockDayNotes({ model, names, today, onShow }: { model: DayModel; names: Names; today: string; onShow: () => void }) {
  const routines = useData((s) => s.routines)
  return (
    <>
      <DayWarnings warnings={dayWarningTexts(model, model.date < today)} />
      {model.date === today && <RoutinesWaiting due={routinesDue(model.ctx, model.state, routines, model.dayFile)} model={model} names={names} onShow={onShow} />}
    </>
  )
}
