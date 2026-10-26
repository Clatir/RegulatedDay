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
import { MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from '../calendar/MonthGrid'
import { copyDayTo, moveDayBlock } from './dayActions'

export function MoveDialog({ model, block, today, onClose }: { model: DayModel; block: PlanBlock; today: string; onClose: () => void }) {
  const [to, setTo] = useState(addDays(model.date, 1))
  const move = async () => {
    if (to === model.date) return onClose()
    const target = await window.rd.dayData(to)
    await moveDayBlock(model.date, model.data.dayFile, model.ctx.plan, block, to, target.dayFile)
    onClose()
  }
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
          <button type="button" className="btn btn-accent" onClick={() => void move()} data-testid="move-apply">
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

export function CopyDayDialog({ model, today, onClose }: { model: DayModel; today: string; onClose: () => void }) {
  const [month, setMonth] = useState(monthOf(addDays(model.date, 1)))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const copy = async () => {
    const targets = [...sel].filter((d) => d !== model.date).sort()
    if (!targets.length) return
    const raws = Object.fromEntries(await Promise.all(targets.map(async (d) => [d, (await window.rd.dayData(d)).dayFile] as const)))
    await copyDayTo({ date: model.date, plan: model.ctx.plan, dayType: model.dayFile?.dayType ?? null, wakeMin: model.dayFile?.wakeMin ?? null }, targets, (d) => raws[d] ?? null)
    onClose()
  }
  const [y, m] = month.split('-')
  return (
    <Dialog
      title={`Skopiuj ${plDate(model.date)} do…`}
      onClose={onClose}
      wide
      data-testid="copy-dialog"
      actions={
        <>
          <span className="mr-auto text-[12px] text-muted">Plan zaznaczonych dni zostanie zastąpiony kopią (sesje i wykłady zostają z ich własnych planów).</span>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={!sel.size} onClick={() => void copy()} data-testid="copy-apply">
            Skopiuj ({sel.size})
          </button>
        </>
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
      <MonthGrid month={month} today={today} selected={sel} onSelect={setSel} cell={(d) => ({ tone: null, marks: d === model.date ? <span>ten dzień</span> : null })} data-testid="copy-month" />
    </Dialog>
  )
}
