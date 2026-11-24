/**
 * „Gorszy dzień” in the morning plan (D570, D587, N4): the button in the card's header – always, while the card stands (today), whatever
 * the step; accepted, in its place the mark „Gorszy dzień” with „Cofnij” (taken back – the button again). The proposal „Gorszy dzień? ·
 * Przyjmij · ×” in the plan's step – only with the setting on (off by default, D570) and after the day's check-in worse in at least two
 * pools. Writes – `worseDayActions.ts`; one at a time with the card's other writes („Zatwierdź”, „Cofnij zatwierdzenie”): the card's
 * `busy` (T2546; own only where none is given).
 */
import { worseDayProposal } from '@shared/engine/worseDay'
import type { Pool } from '@shared/model/categories'
import { worseDayActive } from '@shared/model/worseDay'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { acceptWorseDay, dismissWorseDay, undoWorseDay } from './worseDayActions'

const POOL_WORDS: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce', body: 'ciało' }

/** The busy state of the card's writes (`useBusy`): one for every button of the card that writes. */
type Busy = ReturnType<typeof useBusy>

/** The header's part: „Gorszy dzień” (accept) – or, accepted, the mark „Gorszy dzień” with „Cofnij”. */
export function WorseDayHead({ model, busy: shared }: { model: DayModel; busy?: Busy }) {
  const own = useBusy()
  const [busy, run] = shared ?? own
  const seen = model.data.dayFile
  if (worseDayActive(model.dayFile?.worseDay))
    return (
      <span className="flex items-center gap-1.5" data-testid="worse-day-mark">
        <span className="text-[12.5px] font-medium text-lamp">Gorszy dzień</span>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => undoWorseDay(model.date, seen))} data-testid="worse-day-undo">
          Cofnij
        </button>
      </span>
    )
  return (
    <button type="button" className="btn" disabled={busy} title="Rutyny dnia w wersji na gorsze dni i wcześniejsza granica pracy – jedno „Cofnij”." onClick={() => void run(() => acceptWorseDay(model.date, seen))} data-testid="worse-day">
      Gorszy dzień
    </button>
  )
}

/** The proposal after the check-in (only with the setting, D570): „Gorszy dzień? Check-in: gorzej – głowa, bodźce · Przyjmij · ×”. */
export function WorseDayProposal({ model, busy: shared }: { model: DayModel; busy?: Busy }) {
  const own = useBusy()
  const [busy, run] = shared ?? own
  const pools = worseDayProposal({ on: model.state.settings.worseDay.propose, events: model.ctx.events, file: model.dayFile })
  if (!pools) return null
  const seen = model.data.dayFile
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line px-3 py-2" data-testid="worse-day-proposal">
      <span className="flex-1" data-testid="worse-day-proposal-text">
        Gorszy dzień? Check-in: gorzej – {pools.map((p) => POOL_WORDS[p]).join(', ')}. Rutyny na gorsze dni i wcześniejsza granica.
      </span>
      <button type="button" className="btn" disabled={busy} onClick={() => void run(() => acceptWorseDay(model.date, seen))} data-testid="worse-day-accept">
        Przyjmij
      </button>
      <button type="button" className="btn" disabled={busy} aria-label="Nie dziś" title="Nie dziś" onClick={() => void run(() => dismissWorseDay(model.date, seen))} data-testid="worse-day-dismiss">
        ×
      </button>
    </div>
  )
}
