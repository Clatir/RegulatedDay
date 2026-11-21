/**
 * „Przenieś na…” (a block to another day: its id stays, one move more – spec „Przeniesienie”) and „Skopiuj ten dzień
 * do…” (the plan of this day to the days you mark in the window of days `DaysDialog` – the same as „Zastosuj do…” of a template; spec „Szablony dnia …, kopiowanie dnia”).
 */
import { useState } from 'react'
import { blockName, type Names } from '@shared/blockName'
import { plDate } from '@shared/format'
import { shortDay } from '@shared/quickDates'
import type { PlanBlock } from '@shared/model/plan'
import { addDays } from '@shared/time/zone'
import { Dialog } from '../../components/Dialog'
import { DateField } from '../../components/fields'
import type { DayModel } from '../../store/day'
import { isSaved } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { DaysDialog } from '../calendar/DaysDialog'
import { monthOf } from '../calendar/MonthGrid'
import { APPLY_DAYS_MAX } from '../templates/applyDays'
import { tellMoved } from '../week/weekActions'
import { copyDayTo, moveDayBlock } from './dayActions'

/** The shortcuts of „Przenieś na…” (A6): counted from today (the logical day of the clock), never from the day shown; each says its weekday and date. */
const SHORTCUTS = [
  { n: 1, word: 'Jutro' },
  { n: 2, word: 'Pojutrze' },
  { n: 7, word: 'Za tydzień' }
] as const

/** A shortcut that points at the day shown or at a day gone by is disabled – the reason is its tooltip (D72: nothing is hidden or refused silently). */
export function moveShortcuts(viewed: string, today: string): Array<{ date: string; label: string; disabled?: string }> {
  return SHORTCUTS.map(({ n, word }) => {
    const date = addDays(today, n)
    const disabled = date === viewed ? 'To jest oglądany dzień.' : date < today ? 'Ten dzień już minął.' : undefined
    return { date, label: `${word} (${shortDay(date, today)})`, ...(disabled ? { disabled } : {}) }
  })
}

export function MoveDialog({ model, block, names, today, onClose }: { model: DayModel; block: PlanBlock; names: Names; today: string; onClose: () => void }) {
  const [to, setTo] = useState(addDays(model.date, 1))
  const [busy, run] = useBusy()
  // The window stays open when the move was not saved (the toast says why).
  const move = () =>
    run(async () => {
      if (to === model.date) return onClose()
      // The blocks anchored to it go with it, one that stays is said – the day counted in the turn of the write (D424, D426,
      // T964); the day as the window sees it stands in only for a day that cannot be counted then.
      const r = await moveDayBlock(model.date, model.data.dayFile, model.ctx.plan, block, to, null, true, { name: blockName(block, names), names, seen: model })
      if (!isSaved(r.out)) return
      if (r.push) tellMoved(r.push)
      onClose()
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
        <DateField today={today} value={to} onCommit={setTo} shellClassName="w-[130px]" aria-label="Dzień" data-testid="move-date" />
        {moveShortcuts(model.date, today).map((s, i) => (
          <button key={s.date} type="button" className="chip" aria-pressed={to === s.date} disabled={!!s.disabled} title={s.disabled} onClick={() => setTo(s.date)} data-testid={`move-shortcut-${i}`}>
            {s.label}
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
  // The window of days of the templates (`DaysDialog`, F6): the fields „Od” and „Do”, the month; the day copied from is marked and never a target.
  const [days, setDays] = useState<string[]>([])
  // A day that already ran among the targets: the warning waits for „Kopiuj mimo to” or „Tylko dni po dziś” (D330).
  const [warn, setWarn] = useState(false)
  const [busy, run] = useBusy()
  const { targets, began, ahead } = copyTargets(new Set(days), model.date, today)
  // One copy at a time (a double click made each target twice the blocks – A6-04); open until it is saved.
  const copy = (dates: readonly string[]) =>
    run(async () => {
      if (!dates.length) return
      if (await copyDayTo({ date: model.date, plan: model.ctx.plan, dayType: model.dayFile?.dayType ?? null, wakeMin: model.dayFile?.wakeMin ?? null }, [...dates], () => null)) onClose()
    })
  return (
    <DaysDialog
      title={`Skopiuj ${plDate(model.date)} do…`}
      verb="Skopiuj"
      today={today}
      busy={busy}
      onClose={onClose}
      month={monthOf(addDays(model.date, 1))}
      skip={model.date}
      cell={(d) => ({ tone: null, marks: d === model.date ? <span>ten dzień</span> : null })}
      note="Plan zaznaczonych dni zostanie zastąpiony kopią (sesje i wykłady zostają z ich własnych planów)."
      onChange={(list) => {
        setDays(list)
        setWarn(false)
      }}
      onPick={() => (began.length ? setWarn(true) : void copy(targets))}
      testId="copy-dialog"
      okTestId="copy-apply"
      footer={
        warn && began.length ? (
          <>
            <span className="mr-auto text-[12px] text-rose" data-testid="copy-warning">
              Kopia zastąpi plan dnia, który już trwał ({began.map(plDate).join(', ')}) – zaczęte bloki będą „poza planem”, zmienią się granica i budżet.
            </span>
            <button type="button" className="btn" onClick={() => setWarn(false)} data-testid="copy-back">
              Anuluj
            </button>
            <button type="button" className="btn" disabled={busy || !targets.length} onClick={() => void copy(targets)} data-testid="copy-anyway">
              Kopiuj mimo to
            </button>
            <button type="button" className="btn btn-accent" disabled={!ahead.length || busy} onClick={() => void copy(ahead)} data-testid="copy-ahead">
              Tylko dni po dziś{ahead.length ? ` (${ahead.length})` : ''}
            </button>
          </>
        ) : undefined
      }
      past={(d) => d <= today}
      pastLabel="już trwały"
      max={APPLY_DAYS_MAX}
    />
  )
}
