/**
 * „Wstaw regenerację tutaj” (N3, D599, T2647–T2649): by the warning of energy at the reserve (`DayWarnings`, after the cheapest
 * swap), one line – the way of regeneration, its 15 min before the block in whose time the pool first reaches the reserve, and the
 * lowest state of the pool before and with it – with „Wstaw regenerację tutaj”: the block and the blocks it pushes apart as one
 * edit of the day's file (`insertRegen`), then „Wstawiono regenerację: … · Cofnij” in the window – never a line of its own in the
 * bar (D229). Today and days to come (a day gone by – nothing); counted after the paint and only when the day changes
 * (`useProposal`, as the cheapest swap); done at the click until its save fails or its „Cofnij”. Only a proposal: nothing is
 * blocked (D72).
 */
import { useMemo } from 'react'
import { namingOf } from '@shared/engine/context'
import { regenWayName } from '@shared/engine/regenHere'
import { REGEN_CATEGORY } from '@shared/model/categories'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { nameById, type Names } from '../plan/blockView'
import { insertRegen, regenHereKeyOf, regenLineText, regenMemory } from './regenActions'
import { useProposal } from './useProposal'

/**
 * `openId` – the block whose panel is open (its calendar may be unchecked – D427: it is not hidden in the toast); `dayKey` – the day's key
 * counted by the panel once for both its lines (`useReserveKey`, T2636); left out – counted here.
 */
export function RegenHereLine({ model, names, past, openId = null, dayKey }: { model: DayModel; names: Names; past: boolean; openId?: string | null; dayKey?: string | null }) {
  // The key once per day counted; null – a day gone by or no warning: nothing to count.
  const key = useMemo(() => (dayKey !== undefined ? dayKey : past ? null : regenHereKeyOf(model)), [dayKey, model, past])
  const seen = useProposal(model, key, regenMemory)
  const [busy, run] = useBusy()
  const r = seen.value
  if (!r || key == null) return null
  const before = nameById(r.beforeId, namingOf(model.ctx, model.state.facts), names)
  const way = regenWayName(model.state.settings, r.variantId)
  const apply = () => run(() => insertRegen(model.date, model.data.dayFile, model.ctx.plan, r, { way, rules: model.ctx.snapshot.settings.categories[REGEN_CATEGORY], openId }))
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid="regen-here">
      <span className="min-w-0 flex-1" data-testid="regen-here-text">
        {regenLineText(way, before, r)}
      </span>
      {/* While a new key is counted the line keeps what it showed – the button waits for the count (T2633). */}
      <button type="button" className="btn" disabled={busy || !seen.fresh} onClick={() => void apply()} data-testid="regen-here-apply">
        Wstaw regenerację tutaj
      </button>
    </li>
  )
}
