/**
 * „Przenieś na…” (a block to another day: its id stays, one move more – spec „Przeniesienie”) and „Skopiuj ten dzień
 * do…” (the plan of this day to the days you mark in the month – spec „Szablony dnia …, kopiowanie dnia”).
 */
import { useState } from 'react'
import { plDate } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { addDays } from '@shared/time/zone'
import { Dialog } from '../../components/Dialog'
import { DateField } from '../../components/fields'
import type { DayModel } from '../../store/day'
import { isSaved } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from '../calendar/MonthGrid'
import { copyDayTo, moveDayBlock } from './dayActions'

export function MoveDialog({ model, block, today, onClose }: { model: DayModel; block: PlanBlock; today: string; onClose: () => void }) {
  const [to, setTo] = useState(addDays(model.date, 1))
  const [busy, run] = useBusy()
  // The window stays open when the move was not saved (the toast says why).
  const move = () =>
    run(async () => {
      if (to === model.date) return onClose()
      if (isSaved(await moveDayBlock(model.date, model.data.dayFile, model.ctx.plan, block, to, null))) onClose()
    })
  return (
    <Dialog
      title="Przenieś blok na inny dzień"
      onClose={onClose}
      data-testid="move-dialog"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void move()} data-testid="move-apply">
            Przenieś na {plDate(to)}
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted">Blok zachowa swoją godzinę i dostanie licznik przeniesień +1 (przeniesiony {block.moves + 1}×).</p>
      <div className="flex flex-wrap items-center gap-2">
        <DateField today={today} value={to} onCommit={setTo} className="w-[130px]" aria-label="Dzień" data-testid="move-date" />
        {[1, 2, 7].map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={to === addDays(model.date, n)} onClick={() => setTo(addDays(model.date, n))}>
            {n === 1 ? 'jutro' : n === 2 ? 'pojutrze' : 'za tydzień'}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/**
 * The days a copy goes to (D330): every marked day but the copied one, in order; `began` – today and the days gone (their
 * plan already ran: begun blocks become „poza planem”, the boundary and the budget change), `ahead` – the days after today.
 */
export function copyTargets(sel: ReadonlySet<string>, source: string, today: string): { targets: string[]; began: string[]; ahead: string[] } {
  const targets = [...sel].filter((d) => d !== source).sort()
  return { targets, began: targets.filter((d) => d <= today), ahead: targets.filter((d) => d > today) }
}

export function CopyDayDialog({ model, today, onClose }: { model: DayModel; today: string; onClose: () => void }) {
  const [month, setMonth] = useState(monthOf(addDays(model.date, 1)))
  const [sel, setSel] = useState<Set<string>>(new Set())
  // A day that already ran among the targets: the warning waits for „Kopiuj mimo to” or „Tylko dni po dziś” (D330).
  const [warn, setWarn] = useState(false)
  const [busy, run] = useBusy()
  const { targets, began, ahead } = copyTargets(sel, model.date, today)
  // One copy at a time (a double click made each target twice the blocks – A6-04); open until it is saved.
  const copy = (dates: readonly string[]) =>
    run(async () => {
      if (!dates.length) return
      if (await copyDayTo({ date: model.date, plan: model.ctx.plan, dayType: model.dayFile?.dayType ?? null, wakeMin: model.dayFile?.wakeMin ?? null }, [...dates], () => null)) onClose()
    })
  const select = (next: Set<string>) => {
    setSel(next)
    setWarn(false)
  }
  const [y, m] = month.split('-')
  return (
    <Dialog
      title={`Skopiuj ${plDate(model.date)} do…`}
      onClose={onClose}
      wide
      data-testid="copy-dialog"
      actions={
        warn && began.length ? (
          <>
            <span className="mr-auto text-[12px] text-rose" data-testid="copy-warning">
              Kopia zastąpi plan dnia, który już trwał ({began.map(plDate).join(', ')}) – zaczęte bloki będą „poza planem”, zmienią się granica i budżet.
            </span>
            <button type="button" className="btn" disabled={busy} onClick={() => void copy(targets)} data-testid="copy-anyway">
              Kopiuj mimo to
            </button>
            <button type="button" className="btn btn-accent" disabled={!ahead.length || busy} onClick={() => void copy(ahead)} data-testid="copy-ahead">
              Tylko dni po dziś{ahead.length ? ` (${ahead.length})` : ''}
            </button>
          </>
        ) : (
          <>
            <span className="mr-auto text-[12px] text-muted">Plan zaznaczonych dni zostanie zastąpiony kopią (sesje i wykłady zostają z ich własnych planów).</span>
            <button type="button" className="btn" onClick={onClose}>
              Anuluj
            </button>
            <button type="button" className="btn btn-accent" disabled={!targets.length || busy} onClick={() => (began.length ? setWarn(true) : void copy(targets))} data-testid="copy-apply">
              Skopiuj ({targets.length})
            </button>
          </>
        )
      }
    >
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc">
          ‹
        </button>
        <span className="w-[150px] text-center">
          {MONTH_NAMES[Number(m) - 1]} {y}
        </span>
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc">
          ›
        </button>
      </div>
      <MonthGrid month={month} today={today} selected={sel} onSelect={select} cell={(d) => ({ tone: null, marks: d === model.date ? <span>ten dzień</span> : null })} data-testid="copy-month" />
    </Dialog>
  )
}
