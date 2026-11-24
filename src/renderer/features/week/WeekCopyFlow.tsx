/**
 * „Skopiuj tydzień do…” (N16, D630–D634): the button in the heading of „Tydzień” (the week shown) and the entry „Skopiuj do tygodni…” of the
 * menu of the selection (the blocks selected) share one flow (`useWeekCopyFlow`): the weeks – „Następny tydzień”, „2 następne tygodnie”,
 * „4 następne tygodnie” or „Wybierz tygodnie…” (the window of days in whole weeks, the week copied from never a target) –, then the question of
 * collisions once for every day that asks it (D541), then one save with the line „Skopiowano … · Cofnij” over the columns.
 */
import { useRef, useState, type ReactNode } from 'react'
import { countLabel } from '@shared/format'
import { weekStart } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { ContextMenu, menuPoint, type MenuEntry } from '../../components/ContextMenu'
import { useBusy } from '../../lib/busy'
import { toast } from '../../store/ui'
import { DaysDialog } from '../calendar/DaysDialog'
import { nextWeeks, weekDays } from '../calendar/dayQuick'
import { monthOf } from '../calendar/MonthGrid'
import { COPY_WEEK_STEPS, copyStepLabel } from '../plan/groupMenu'
import { APPLY_DAYS_MAX } from '../templates/applyDays'
import { ModeDialog, type ModeWords } from '../templates/ApplyTemplate'
import { ALL_PAST_TEXT, askedCopyDays, copyToWeeks, NOTHING_TO_COPY_TEXT, sourceWeekOf, type CopyAsk, type WeekCopyFrom } from './weekCopy'
import { weekTitle } from './weekText'

const COPY_WORDS: ModeWords = {
  fill: '„Uzupełnij luki” – dodaje tylko skopiowane bloki, które mieszczą się w wolnym czasie.',
  overwrite: '„Nadpisz plan” – odwołuje kolidujące bloki i dodaje skopiowane (sesje, wykłady, zjazdy i bloki, które już trwały, zostają).',
  others: (n) => `Pozostałe dni (${n}) – nic nie koliduje, tam kopiuję bez pytania.`
}

/** The most weeks at once (every day is read in the turn of the save – as „Zastosuj do…”, `APPLY_DAYS_MAX`). */
const WEEKS_MAX = Math.floor(APPLY_DAYS_MAX / 7)

/**
 * The flow of the copy: `start(from, weeks)` – true: done, or the question took over (or nothing to do, said in the corner); `dialogs` – the
 * question, rendered once by the screen that uses it.
 */
export function useWeekCopyFlow(): { start: (from: WeekCopyFrom, weeks: readonly string[]) => Promise<boolean | undefined>; busy: boolean; dialogs: ReactNode } {
  const [asking, setAsking] = useState<{ from: WeekCopyFrom; weeks: string[]; asked: string[]; days: number } | null>(null)
  const [busy, run] = useBusy()
  const start = (from: WeekCopyFrom, weeks: readonly string[]) =>
    run(async () => {
      const list = [...new Set(weeks.map(weekStart))].filter((w) => w !== sourceWeekOf(from)).sort()
      if (!list.length || !from.dates.length) return false
      if (list.length > WEEKS_MAX) {
        toast(`Najwyżej ${countLabel(WEEKS_MAX, 'tydzień', 'tygodnie', 'tygodni')} naraz.`, 'error', 6000)
        return false
      }
      let ask: CopyAsk
      try {
        ask = await askedCopyDays(from, list)
      } catch (e) {
        toast(`Nie skopiowano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
        return false
      }
      // Nothing to copy, or every target day gone by: said in the corner – nothing to retry, the window may close.
      if (!ask.copyable || !ask.days) {
        toast(ask.copyable ? ALL_PAST_TEXT : NOTHING_TO_COPY_TEXT, 'info', 8000)
        return true
      }
      if (ask.asked.length) {
        setAsking({ from, weeks: list, asked: ask.asked, days: ask.days })
        return true
      }
      return copyToWeeks(from, list, 'fill')
    })
  const dialogs = asking && (
    <ModeDialog
      title="Skopiowane bloki kolidują z planem"
      asked={asking.asked}
      total={asking.days}
      busy={busy}
      words={COPY_WORDS}
      prefix="week-copy"
      onClose={() => setAsking(null)}
      onPick={(mode) =>
        void run(async () => {
          if (await copyToWeeks(asking.from, asking.weeks, mode)) setAsking(null)
        })
      }
    />
  )
  return { start, busy, dialogs }
}

/** The choices of weeks after the week `week` (its Monday): the next one, the next 2, the next 4 and the window; `testId` – their prefix. */
export function weekChoices(week: string, pick: (weeks: string[]) => void, openWindow: () => void, testId: string): MenuEntry[] {
  return [
    ...COPY_WEEK_STEPS.map((n): MenuEntry => ({ label: n === 1 ? `${copyStepLabel(n)} (${weekTitle(addDays(week, 7))})` : copyStepLabel(n), onPick: () => pick(nextWeeks(week, n)), testId: `${testId}-${n}` })),
    { label: 'Wybierz tygodnie…', onPick: openWindow, testId: `${testId}-pick` }
  ]
}

/**
 * „Wybierz tygodnie…”: the window of days in whole weeks (D634) – the week copied from marked „ten tydzień” and never a target, the quick picks
 * of the next 1, 2 and 4 weeks; „Skopiuj” gives the Mondays of the weeks chosen. `sources` – the days copied (a selection of „3 dni” across two
 * weeks): one in a later week is marked „źródło”; that week stays a target (D630: one week after the first – T2954).
 */
export function WeeksDialog({ week, sources = [], today, busy, onClose, onPick, title }: { week: string; sources?: readonly string[]; today: string; busy: boolean; onClose: () => void; onPick: (weeks: string[]) => void; title: string }) {
  const source = weekDays(week)
  const later = new Set(sources.filter((d) => !source.includes(d)))
  return (
    <DaysDialog
      title={title}
      verb="Skopiuj"
      today={today}
      busy={busy}
      onClose={onClose}
      onPick={(dates) => onPick([...new Set(dates.map(weekStart))])}
      unit="week"
      skip={source}
      month={monthOf(addDays(week, 7))}
      cell={(d) => ({ tone: null, marks: source.includes(d) ? <span>ten tydzień</span> : later.has(d) ? <span>źródło</span> : null })}
      quick={COPY_WEEK_STEPS.map((n) => ({ label: copyStepLabel(n), days: nextWeeks(week, n).flatMap(weekDays), testId: `week-copy-weeks-next-${n}` }))}
      note="Bloki każdego dnia trafiają na ten sam dzień tygodnia; sesje, wykłady, zajęcia zjazdu, serie i bufory przychodzą z dni docelowych, dni minione zostają bez zmian."
      max={APPLY_DAYS_MAX}
      testId="week-copy-weeks"
    />
  )
}

/** „Skopiuj tydzień do…” in the heading of „Tydzień”: the week shown (`week` – its Monday), every block that may be copied. */
export function WeekCopyButton({ week, today }: { week: string; today: string }) {
  const button = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const flow = useWeekCopyFlow()
  const from: WeekCopyFrom = { dates: weekDays(week) }
  const go = (weeks: string[]) => flow.start(from, weeks)
  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn"
        disabled={flow.busy}
        aria-haspopup="menu"
        title="Skopiuj bloki tego tygodnia na te same dni innych tygodni"
        onClick={(e) => setMenu(menuPoint(e.detail === 0 ? null : e, button.current))}
        data-testid="week-copy"
      >
        Skopiuj tydzień do…
      </button>
      {menu && <ContextMenu title={`Skopiuj tydzień ${weekTitle(week)}`} at={menu} items={weekChoices(week, (w) => void go(w), () => setPicking(true), 'week-copy-next')} onClose={() => setMenu(null)} testId="week-copy-menu" />}
      {picking && (
        <WeeksDialog
          week={week}
          today={today}
          busy={flow.busy}
          title={`Skopiuj tydzień ${weekTitle(week)} do…`}
          onClose={() => setPicking(false)}
          onPick={async (weeks) => {
            if (await go(weeks)) setPicking(false)
          }}
        />
      )}
      {flow.dialogs}
    </>
  )
}
