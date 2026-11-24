/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626): by the warning of energy at the reserve (`DayWarnings`), one line – two flexible
 * blocks of one gap between fixed blocks that change places, and the lowest energy of the day before and with it – with „Zamień”:
 * one edit of the day's file (`swapDayBlocks`, the way of „Ułóż”), then „Zamieniono: A ↔ B · Cofnij” in the window – never a line
 * in the bar (D229). Today and days to come (a day gone by – nothing); counted again only when the day changes
 * (`cheapestSwapCached`, after the paint – T2632, T2635; `useProposal`); while a new key is counted the line keeps the swap it showed
 * with „Zamień” waiting (T2633, T2639). A swap „Zamień” is saving, saved or found already so is done (`swapGone`, by what it does –
 * T2643): no line of the day shows it, in any panel, until its save fails or its „Cofnij” takes it back. Only a proposal:
 * nothing is blocked (D72).
 */
import { useMemo } from 'react'
import { namingOf } from '@shared/engine/context'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { cheapestSwapKeyOf, swapDayBlocks, swapLineText, swapMemory, swappedText, variantStarts } from './dayActions'
import { useProposal } from './useProposal'

/**
 * `openId` – the block whose panel is open (its calendar may be unchecked – D427: it is not hidden in the toast); `dayKey` – the day's key
 * counted by the panel once for both its lines (`useReserveKey`, T2636); left out – counted here.
 */
export function CheapestSwapLine({ model, names, past, openId = null, dayKey }: { model: DayModel; names: Names; past: boolean; openId?: string | null; dayKey?: string | null }) {
  // The key once per day counted (T2636); null – a day gone by or no warning: nothing to count.
  const key = useMemo(() => (dayKey !== undefined ? dayKey : past ? null : cheapestSwapKeyOf(model)), [dayKey, model, past])
  // What is known without the search; the search itself runs after the paint (`useProposal`, T2632, T2635, T2641, T2643).
  const seen = useProposal(model, key, swapMemory)
  const [busy, run] = useBusy()
  const swap = seen.value
  if (!swap || key == null) return null
  const naming = namingOf(model.ctx, model.state.facts)
  const a = nameById(swap.a, naming, names)
  const b = nameById(swap.b, naming, names)
  // The swap is done before its save starts and back when it fails (`swapDayBlocks`): the line goes at the click.
  const apply = () => run(() => swapDayBlocks(model.date, model.data.dayFile, variantStarts(model.ctx.plan, swap), swap, swappedText(a, b), openId))
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid="cheapest-swap">
      <span className="min-w-0 flex-1" data-testid="cheapest-swap-text">
        {swapLineText(a, b, swap)}
      </span>
      {/* T2633: the swap this line showed, while the new key is counted – „Zamień” waits for the count. */}
      <button type="button" className="btn" disabled={busy || !seen.fresh} onClick={() => void apply()} data-testid="cheapest-swap-apply">
        Zamień
      </button>
    </li>
  )
}
