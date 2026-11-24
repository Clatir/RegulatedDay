/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626): by the warning of energy at the reserve (`DayWarnings`), one line – two flexible
 * blocks of one gap between fixed blocks that change places, and the lowest energy of the day before and with it – with „Zamień”:
 * one edit of the day's file (`swapDayBlocks`, the way of „Ułóż”), then „Zamieniono: A ↔ B · Cofnij” in the window – never a line
 * in the bar (D229). Today and days to come (a day gone by – nothing); counted again only when the day changes
 * (`cheapestSwapCached`). Only a proposal: nothing is blocked (D72).
 */
import { useMemo } from 'react'
import { namingOf } from '@shared/engine/context'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { cheapestSwapCached, swapDayBlocks, swapLineText, swappedText, variantStarts } from './dayActions'

export function CheapestSwapLine({ model, names, past }: { model: DayModel; names: Names; past: boolean }) {
  const swap = useMemo(() => (past ? null : cheapestSwapCached(model)), [model, past])
  const [busy, run] = useBusy()
  if (!swap) return null
  const naming = namingOf(model.ctx, model.state.facts)
  const a = nameById(swap.a, naming, names)
  const b = nameById(swap.b, naming, names)
  const apply = () => run(() => swapDayBlocks(model.date, model.data.dayFile, variantStarts(model.ctx.plan, swap), swappedText(a, b)))
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid="cheapest-swap">
      <span className="min-w-0 flex-1" data-testid="cheapest-swap-text">
        {swapLineText(a, b, swap)}
      </span>
      <button type="button" className="btn" disabled={busy} onClick={() => void apply()} data-testid="cheapest-swap-apply">
        Zamień
      </button>
    </li>
  )
}
