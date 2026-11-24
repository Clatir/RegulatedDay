/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626): by the warning of energy at the reserve (`DayWarnings`), one line – two flexible
 * blocks of one gap between fixed blocks that change places, and the lowest energy of the day before and with it – with „Zamień”:
 * one edit of the day's file (`swapDayBlocks`, the way of „Ułóż”), then „Zamieniono: A ↔ B · Cofnij” in the window – never a line
 * in the bar (D229). Today and days to come (a day gone by – nothing); counted again only when the day changes
 * (`cheapestSwapCached`, after the paint – T2632, T2635); while a new key is counted the line keeps the day's last swap with
 * „Zamień” waiting (T2633). „Zamień” on a plan already so – the note „Plan już jest tak ułożony.” and the line goes, in every
 * panel, until the day changes (its key, as the morning plan's card – T622, T2628, T2634). Only a proposal: nothing is blocked (D72).
 */
import { useEffect, useMemo, useState } from 'react'
import { namingOf } from '@shared/engine/context'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { cheapestSwapCached, cheapestSwapKeyOf, cheapestSwapPeek, swapDayBlocks, swapGone, swapLineText, swappedText, variantStarts } from './dayActions'

/** `openId` – the block whose panel is open (its calendar may be unchecked – D427: it is not hidden in the toast). */
export function CheapestSwapLine({ model, names, past, openId = null }: { model: DayModel; names: Names; past: boolean; openId?: string | null }) {
  // The key once per day counted (T2636); null – a day gone by or no warning: nothing to count.
  const key = useMemo(() => (past ? null : cheapestSwapKeyOf(model)), [model, past])
  // What is known without the search; the search itself runs after the paint, never in the render nor before the paint of a
  // discrete event (T2632, T2635: up to ~40 ms on a gap of 12 blocks) – then the line has the new swap.
  const [counted, setCounted] = useState(0)
  const seen = useMemo(() => cheapestSwapPeek(model, key), [model, key, counted])
  useEffect(() => {
    if (!seen.due) return
    const timer = setTimeout(() => {
      cheapestSwapCached(model, key)
      setCounted((n) => n + 1)
    }, 0)
    return () => clearTimeout(timer)
  }, [model, key, seen.due])
  const [busy, run] = useBusy()
  const swap = seen.swap
  if (!swap || key == null) return null
  const naming = namingOf(model.ctx, model.state.facts)
  const a = nameById(swap.a, naming, names)
  const b = nameById(swap.b, naming, names)
  const apply = () =>
    run(async () => {
      if ((await swapDayBlocks(model.date, model.data.dayFile, variantStarts(model.ctx.plan, swap), [swap.a, swap.b], swappedText(a, b), openId)).already) {
        swapGone(key)
        setCounted((n) => n + 1)
      }
    })
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid="cheapest-swap">
      <span className="min-w-0 flex-1" data-testid="cheapest-swap-text">
        {swapLineText(a, b, swap)}
      </span>
      {/* T2633: the day's last swap while the new key is counted – „Zamień” waits for the count. */}
      <button type="button" className="btn" disabled={busy || !seen.fresh} onClick={() => void apply()} data-testid="cheapest-swap-apply">
        Zamień
      </button>
    </li>
  )
}
