/**
 * The exchange (spec principle 2, „Wymiana”): the work blocks that could give way to the new one, and the cost of
 * adding it without an exchange; „Wymień” and „Dodaj bez wymiany” are equal. The cost is only the minutes by which the
 * end of work goes beyond the boundary (an ordinary extension, confirmed by this „Dodaj” in advance); beyond the maximum
 * it is an overrun – the second confirmation is the second click in this window. A block that only goes over the budget
 * costs nothing but the warning. Without any block that could give way the window shows only the cost and „Dodaj”.
 */
import { useMemo, useState } from 'react'
import { putBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { exchangeCost, isFullExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { durationLabel, logicalClock } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { Dialog } from '../../components/Dialog'
import { editOf, logEvents, saveEdits } from '../../store/data'
import type { DayModel } from '../../store/day'
import { blockName, type Names } from '../plan/blockView'

export function ExchangeDialog({ model, names, block, proposal, onClose }: { model: DayModel; names: Names; block: PlanBlock; proposal: ExchangeProposal; onClose: (added: string | null) => void }) {
  const [chosen, setChosen] = useState<string[]>(proposal.preselected)
  const [armed, setArmed] = useState<'exchange' | 'add' | null>(null)
  const cost = useMemo(() => (chosen.length ? exchangeCost(model.ctx, model.state, block, chosen) : proposal), [chosen, model, block, proposal])
  const without = proposal
  const yielding = proposal.candidates.filter((c) => chosen.includes(c.block.id))
  const full = isFullExchange(block, yielding)
  const raw = model.data.dayFile
  const date = model.date

  const costText = (c: { beyondMin: number; overBudgetMin: number; overrun: boolean }) =>
    c.beyondMin > 0 ? `${c.overrun ? 'przekroczenie' : 'przedłużenie'} · ${durationLabel(c.beyondMin)} po granicy` : c.overBudgetMin > 0 ? `budżet pracy +${durationLabel(c.overBudgetMin)} (tylko ostrzeżenie)` : 'bez kosztu'

  /** Adds the block (with the yielding parked, one move more each); the minutes beyond the boundary confirmed in advance. */
  const commit = async (exchange: boolean) => {
    const c = exchange ? cost : without
    if (c.overrun && armed !== (exchange ? 'exchange' : 'add')) {
      setArmed(exchange ? 'exchange' : 'add')
      return
    }
    let next = putBlock(raw ?? { schema: 1, date }, block)
    if (exchange) for (const y of yielding) next = putBlock(next, { ...y.block, moves: y.block.moves + 1 })
    await saveEdits([editOf(paths.day(date), raw, next)])
    const events: Array<{ k: string; day: string; [k: string]: unknown }> = []
    if (exchange) for (const y of yielding) events.push({ k: 'block.park', day: date, block: y.block.id, rule: 'exchange' })
    if (c.beyondMin > 0) events.push({ k: 'block.addConfirm', day: date, block: block.id })
    if (events.length) await logEvents(events)
    onClose(block.id)
  }

  return (
    <Dialog title={`Nowy blok: ${blockName(block, names)}`} onClose={() => onClose(null)} data-testid="exchange">
      <p className="text-[12.5px]">
        {without.beyondMin > 0
          ? `Ten blok przesuwa prognozowany koniec pracy o ${durationLabel(without.beyondMin)} za granicę.`
          : `Ten blok mieści się przed granicą, ale przekracza budżet pracy o ${durationLabel(without.overBudgetMin)}.`}
        {without.overrun ? ' Koniec pracy wychodzi poza maksimum – to przekroczenie.' : ''}
      </p>
      {proposal.candidates.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="exchange-candidates">
          <span className="text-[12px] text-muted">Mogą ustąpić miejsca (zaparkowane, licznik przeniesień +1):</span>
          {proposal.candidates.map((c) => (
            <label key={c.block.id} className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={chosen.includes(c.block.id)}
                onChange={(e) => {
                  setArmed(null)
                  setChosen(e.currentTarget.checked ? [...chosen, c.block.id] : chosen.filter((x) => x !== c.block.id))
                }}
              />
              <span className="flex-1">{blockName(c.block, names)}</span>
              <span className="num text-muted">
                {c.block.startMin != null ? logicalClock(c.block.startMin) : ''} · {durationLabel(c.minutes)}
              </span>
            </label>
          ))}
          {chosen.length > 0 && <span className="text-[12px] text-muted">{full ? 'Pełna wymiana' : 'Niepełna wymiana'}: {costText(cost)}.</span>}
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        {proposal.candidates.length > 0 && (
          <button type="button" className="btn btn-accent justify-between" disabled={!chosen.length} onClick={() => void commit(true)} data-testid="exchange-swap">
            <span>{armed === 'exchange' ? 'Potwierdź przekroczenie' : 'Wymień'}</span>
            <span className="text-[12px]">{costText(cost)}</span>
          </button>
        )}
        <button type="button" className="btn justify-between" onClick={() => void commit(false)} data-testid="exchange-add">
          <span>{armed === 'add' ? 'Potwierdź przekroczenie' : proposal.candidates.length ? 'Dodaj bez wymiany' : 'Dodaj'}</span>
          <span className="text-[12px]">{costText(without)}</span>
        </button>
        {armed && <span className="text-[12px] text-rose">Drugie kliknięcie potwierdza przekroczenie – to mocniejsze ostrzeżenie, nie blokada.</span>}
      </div>
    </Dialog>
  )
}
