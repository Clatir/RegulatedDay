/**
 * „Wstaw regenerację tutaj” (N3, D599, T2647–T2649, T2960–T2965): one proposal of the day, two places – the line by the warning of energy at
 * the reserve (`DayWarnings`, after the cheapest swap: `RegenHereLine`) and the hint of the tile at the cause (N20, `ReserveCauseHint`'s
 * slot: `RegenHereHint` – only on the tile of the block the regeneration stands before, for its pool). Each shows the way of regeneration,
 * its 15 min before that block, and the lowest state of the pool before and with it, with „Wstaw regenerację tutaj”: the block and the
 * blocks it pushes apart as one edit of the day's file (`insertRegen`), then „Wstawiono regenerację: … · Cofnij” in the window – never a
 * line of its own in the bar (D229). Both read one memory (`regenMemory`): counted once, after the paint, only when the day changes; done
 * at the click in either place – gone from both – until its save fails or its „Cofnij”. Today and days to come (a day gone by – nothing).
 * Only a proposal: nothing is blocked (D72).
 */
import { useMemo } from 'react'
import { namingOf } from '@shared/engine/context'
import { regenWayName, type RegenHere } from '@shared/engine/regenHere'
import type { ReserveCause } from '@shared/engine/reserveCause'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { useDay, type DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { insertRegen, regenHereKeyOf, regenLineText, regenMemory } from './regenActions'
import { useProposal } from './useProposal'

/** What a place of the proposal shows and does: the proposal, its words, whether its button waits, its action. */
interface RegenShown {
  r: RegenHere
  text: string
  waits: boolean
  apply: () => void
}

/**
 * The proposal of the day as a place of the window shows it (T2960: one source for the line and the hint). `dayKey` – the day's key counted
 * once by the panel (`useReserveKey`, T2636, T2875); left out – counted here. `openId` – the block whose panel is open (D427).
 */
function useRegenHere(model: DayModel, names: Names, past: boolean, dayKey: string | null | undefined, openId: string | null): RegenShown | null {
  // The key once per day counted; null – a day gone by or no warning: nothing to count.
  const key = useMemo(() => (dayKey !== undefined ? dayKey : past ? null : regenHereKeyOf(model)), [dayKey, model, past])
  const seen = useProposal(model, key, regenMemory)
  const [busy, run] = useBusy()
  const r = seen.value
  if (!r || key == null) return null
  const before = nameById(r.beforeId, namingOf(model.ctx, model.state.facts), names)
  const way = regenWayName(model.state.settings, r.variantId)
  // While a new key is counted the place keeps what it showed – the button waits for the count (T2633).
  return { r, text: regenLineText(way, before, r), waits: busy || !seen.fresh, apply: () => void run(() => insertRegen(model, r, { way, openId })) }
}

/**
 * The line by the warning. `openId` – the block whose panel is open (its calendar may be unchecked – D427: it is not hidden in the toast);
 * `dayKey` – the day's key counted by the panel once for both its lines (`useReserveKey`, T2636); left out – counted here.
 */
export function RegenHereLine({ model, names, past, openId = null, dayKey }: { model: DayModel; names: Names; past: boolean; openId?: string | null; dayKey?: string | null }) {
  const shown = useRegenHere(model, names, past, dayKey, openId)
  if (!shown) return null
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid="regen-here">
      <span className="min-w-0 flex-1" data-testid="regen-here-text">
        {shown.text}
      </span>
      <button type="button" className="btn" disabled={shown.waits} onClick={shown.apply} data-testid="regen-here-apply">
        Wstaw regenerację tutaj
      </button>
    </li>
  )
}

/**
 * The proposal in the hint of the tile at the cause (N20's slot `reserveAction`, T2961): only on the tile of the block it stands before
 * (`beforeId`) and for a pool the tile's cause names (its descent there – T2962); any other tile – nothing. The same words, button and
 * action as the line.
 */
export function RegenHereHint({ model, names, past, dayKey, id, cause }: { model: DayModel; names: Names; past: boolean; dayKey?: string | null; id: string; cause: ReserveCause }) {
  const shown = useRegenHere(model, names, past, dayKey, null)
  if (!shown || shown.r.beforeId !== id || !cause.drops.some((d) => d.pool === shown.r.pool)) return null
  return (
    <div className="mt-1 flex flex-col items-start gap-1 border-t border-line pt-1" data-testid="regen-here-hint">
      <span data-testid="regen-here-hint-text">{shown.text}</span>
      <button type="button" className="btn" disabled={shown.waits} onClick={shown.apply} data-testid="regen-here-hint-apply">
        Wstaw regenerację tutaj
      </button>
    </div>
  )
}

/**
 * The proposal in the hint of a tile of „Tydzień” and „3 dni” (DayGrid's `reserveAction`, T2963): only in the column of today – the day the
 * window counts as `DayModel` (`useDay`, read and counted when the hint opens; the column itself has only its curve). A day to come has no
 * warning of its own to count a proposal on (its curve is the assumed one, T903) and a day gone by none – nothing.
 */
export function RegenHereDayHint({ date, id, cause }: { date: string; id: string; cause: ReserveCause }) {
  const today = useData((s) => s.view?.today ?? '')
  return date === today ? <TodayRegenHint date={date} id={id} cause={cause} /> : null
}

/** Today's proposal in a column's hint: the day counted as „Dziś” counts it, with the names of the window (`blockName`). */
function TodayRegenHint({ date, id, cause }: { date: string; id: string; cause: ReserveCause }) {
  const model = useDay(date)
  const rd = useData((s) => s.rd)
  const routines = useData((s) => s.routines)
  const requests = useData((s) => s.requests)
  const names: Names | null = useMemo(() => (model ? { rd, settings: model.state.settings, routines, requests } : null), [model, rd, routines, requests])
  return model && names ? <RegenHereHint model={model} names={names} past={false} id={id} cause={cause} /> : null
}
