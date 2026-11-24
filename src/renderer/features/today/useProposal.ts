/**
 * A line of a proposal by the warning of energy at the reserve (N22, N3): what it shows of its memory (`ProposalMemory`) for the
 * day's key – never searched in the render nor before the paint of a discrete event (T2632, T2635: up to ~40 ms on a gap of 12
 * blocks): the search runs after the paint, then the line has the new proposal. While a new key is counted the line keeps the
 * proposal it showed last, its button waiting (T2633, T2639); a search that throws is none for its key (T2641) – the line always
 * comes out of waiting; a proposal done or back (any line's button, a failed save, a „Cofnij”) – looked at again (T2643).
 */
import { useEffect, useMemo, useState } from 'react'
import { cheapestSwapKeyOf } from './dayActions'
import type { ProposalDay, ProposalMemory, ProposalSeen } from './proposalMemory'

export function useProposal<T>(model: ProposalDay, key: string | null, memory: ProposalMemory<T>): ProposalSeen<T> {
  // The key whose proposal this line showed last: only that one is held while a new key is counted (T2639).
  const [shownKey, setShownKey] = useState<string | null>(null)
  const [counted, setCounted] = useState(0)
  const seen = useMemo(() => memory.peek(model, key, shownKey), [memory, model, key, shownKey, counted])
  useEffect(() => {
    if (!seen.due) return
    const timer = setTimeout(() => {
      memory.cached(model, key)
      setCounted((n) => n + 1)
    }, 0)
    return () => clearTimeout(timer)
  }, [memory, model, key, seen.due])
  useEffect(() => {
    if (seen.fresh && seen.value && key !== shownKey) setShownKey(key)
  }, [seen, key, shownKey])
  useEffect(() => memory.onDone(() => setCounted((n) => n + 1)), [memory])
  return seen
}

/** The day's key by the day counted (the object of the model): the side panel and the axis' hints of one count share it (T2964). */
const keys = new WeakMap<object, string | null>()

/**
 * The day's key of the proposals by the warning (T2636, T2875, T2964): counted once per day counted – for every place that shows them (the
 * panel's two lines, the hints of the axis; the cheapest swap and the regeneration have the same key); null – a day gone by or no warning:
 * nothing to count.
 */
export function useReserveKey(model: ProposalDay, past: boolean): string | null {
  return useMemo(() => {
    if (past) return null
    if (!keys.has(model)) keys.set(model, cheapestSwapKeyOf(model))
    return keys.get(model) ?? null
  }, [model, past])
}
