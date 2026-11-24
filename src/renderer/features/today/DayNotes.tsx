/**
 * What the side panel of „Dziś” says of the day, put into the panel of a block that replaces it (D3, D8, D563 P10): the day's warnings
 * (no advice on a day gone by) and – today – the routines begun and not ticked off, each with the way to its card (the card stands in the
 * side panel; the panel of a block has no „Zakończ rutynę” nor „✓ Wszystkie”, so the block's own routine is said too).
 */
import { routinesDue } from '@shared/engine/routineCheck'
import { useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import type { Names } from '../plan/blockView'
import { CheapestSwapLine } from './CheapestSwap'
import { RegenHereLine } from './RegenHere'
import { dayWarningTexts, DayWarnings } from './DayWarnings'
import { RoutinesWaiting } from './RoutineCard'
import { useReserveKey } from './useProposal'

/** `openId` – the block whose panel this is (shown in spite of an unchecked calendar, D427). */
export function BlockDayNotes({ model, names, today, onShow, openId = null }: { model: DayModel; names: Names; today: string; onShow: () => void; openId?: string | null }) {
  const routines = useData((s) => s.routines)
  const past = model.date < today
  // The day's key once for both proposals by the warning (T2636).
  const dayKey = useReserveKey(model, past)
  return (
    <>
      <DayWarnings
        warnings={dayWarningTexts(model, past)}
        swap={<CheapestSwapLine model={model} names={names} past={past} openId={openId} dayKey={dayKey} />}
        regen={<RegenHereLine model={model} names={names} past={past} openId={openId} dayKey={dayKey} />}
      />
      {model.date === today && <RoutinesWaiting due={routinesDue(model.ctx, model.state, routines, model.dayFile)} model={model} names={names} onShow={onShow} />}
    </>
  )
}
