/**
 * „Najtańsza zamiana” (N22, D598, T2624–T2626): by the warning of energy at the reserve (`DayWarnings`), one line – two flexible
 * blocks of one gap between fixed blocks that change places, and the lowest energy of the day before and with it – with „Zamień”:
 * one edit of the day's file (`swapDayBlocks`, the way of „Ułóż”), then „Zamieniono: A ↔ B · Cofnij” in the window – never a line
 * in the bar (D229). Today and days to come (a day gone by – nothing); counted again only when the day changes
 * (`cheapestSwapCached`, after the paint – T2632, T2635); while a new key is counted the line keeps the swap it showed with
 * „Zamień” waiting (T2633, T2639). A swap „Zamień” is saving, saved or found already so is done (`swapGone`, by what it does –
 * T2643): no line of the day shows it, in any panel, until its save fails or its „Cofnij” takes it back. Only a proposal:
 * nothing is blocked (D72).
 */
import { useEffect, useMemo, useState } from 'react'
import { namingOf } from '@shared/engine/context'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { cheapestSwapCached, cheapestSwapKeyOf, cheapestSwapPeek, onSwapsDone, swapDayBlocks, swapLineText, swappedText, variantStarts } from './dayActions'

/** `openId` – the block whose panel is open (its calendar may be unchecked – D427: it is not hidden in the toast). */
export function CheapestSwapLine({ model, names, past, openId = null }: { model: DayModel; names: Names; past: boolean; openId?: string | null }) {
  // The key once per day counted (T2636); null – a day gone by or no warning: nothing to count.
  const key = useMemo(() => (past ? null : cheapestSwapKeyOf(model)), [model, past])
  // The key whose swap this line showed last: only that one is held while a new key is counted (T2639).
  const [shownKey, setShownKey] = useState<string | null>(null)
  // What is known without the search; the search itself runs after the paint, never in the render nor before the paint of a
  // discrete event (T2632, T2635: up to ~40 ms on a gap of 12 blocks) – then the line has the new swap. A search that throws
  // is none for its key (`cheapestSwapCached`, T2641): the line always comes out of waiting.
  const [counted, setCounted] = useState(0)
  const seen = useMemo(() => cheapestSwapPeek(model, key, shownKey), [model, key, shownKey, counted])
  useEffect(() => {
    if (!seen.due) return
    const timer = setTimeout(() => {
      cheapestSwapCached(model, key)
      setCounted((n) => n + 1)
    }, 0)
    return () => clearTimeout(timer)
  }, [model, key, seen.due])
  useEffect(() => {
    if (seen.fresh && seen.swap && key !== shownKey) setShownKey(key)
  }, [seen, key, shownKey])
  // A swap done or back (any line's „Zamień”, a failed save, a „Cofnij”) – what this line shows is looked at again (T2643).
  useEffect(() => onSwapsDone(() => setCounted((n) => n + 1)), [])
  const [busy, run] = useBusy()
  const swap = seen.swap
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
