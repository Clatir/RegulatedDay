/**
 * The buttons „Zastosuj do…” and „Odwołaj w…” of a template (D540–D545): a menu „Dziś” · „Jutro” · „Wybierz dni…”; the window of days is a
 * month (`MonthGrid`: a click – that day, Ctrl+click – one more or one less, Shift+click – the range from the last one, a drag – a range)
 * with the fields „Od” and „Do” (DD.MM.RRRR, „3.01” too; eight digits become a date at once – `typedDmy`; the window is `DaysDialog`, also the one of „Skopiuj ten dzień do…”). „Zastosuj” on days without blocks of the
 * template whose blocks collide with the plan asks once: „Uzupełnij luki” or „Nadpisz plan” (D541); days with blocks of the template
 * fill the gaps without asking. With today or a day gone by among the days the window „Zastosuj „…” do dziś” comes first (D546): the
 * hours of today („Wg planu” / „W czasie rzeczywistym – od teraz”, only with today) and the blocks gone by („Dodaj jako zrealizowane” /
 * „Nie dodawaj minionych”), both at their first choice at each opening; the question of collisions is then asked at the hours chosen.
 */
import { useRef, useState, type ReactNode } from 'react'
import { plDate } from '@shared/format'
import type { Template } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { ContextMenu, menuPoint } from '../../components/ContextMenu'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { toast } from '../../store/ui'
import { DaysDialog } from '../calendar/DaysDialog'
import { APPLY_DAYS_MAX, applyToDays, askedDays, asksTiming, DEFAULT_CHOICE, revokeInDays, timingTitle, type ApplyChoice } from './applyDays'

type Kind = 'apply' | 'revoke'

const LABEL: Record<Kind, string> = { apply: 'Zastosuj do…', revoke: 'Odwołaj w…' }

/**
 * „Zastosuj” on the days chosen, with its questions (UX19, P28: one flow for the button of a template and for the menus of days – the Calendar's and the
 * columns' of „Tydzień”): the window of today's hours (D546) when today or a day gone by is among them, the question of collisions (D541), then the write.
 * `start` – true: done, or a window of the flow took over (or nothing to do); `onDone` runs only after the write itself went through (by the direct road, by
 * the window of hours, by the question of collisions – never when a window is opened or closed with „Anuluj”); `dialogs` – the windows, rendered once by the screen that uses it.
 */
export function useApplyFlow(): { start: (template: Template, dates: readonly string[], onDone?: () => void) => Promise<boolean | undefined>; busy: boolean; dialogs: ReactNode } {
  // The days of the window of today's hours and the day that was today when it opened (D546) – the engine takes it at the same click.
  const [timing, setTiming] = useState<{ template: Template; dates: string[]; today: string; done?: () => void } | null>(null)
  const [asking, setAsking] = useState<{ template: Template; dates: string[]; asked: string[]; choice: ApplyChoice; done?: () => void } | null>(null)
  const [busy, run] = useBusy()

  /** „Zastosuj” at the hours chosen: after the question when a day asks it (D541). True – done (or nothing to do), the window may close. */
  const apply = async (template: Template, list: string[], choice: ApplyChoice, done?: () => void) => {
    const asked = await askedDays(template, list, choice)
    if (asked.length) {
      setAsking({ template, dates: list, asked, choice, done })
      return true
    }
    const ok = await applyToDays(template, list, 'fill', choice)
    if (ok) done?.()
    return ok
  }

  /**
   * The chosen days: with today or a day gone by among them after the window of their hours (D546). Today is the logical day of the click (as the engine
   * takes it – `timingAt`), not the one the page was drawn with: after 04:00 they agree.
   */
  const start = (template: Template, dates: readonly string[], done?: () => void) =>
    run(async () => {
      const list = [...new Set(dates)].sort()
      if (!list.length) return false
      if (list.length > APPLY_DAYS_MAX) {
        toast(`Najwyżej ${APPLY_DAYS_MAX} dni naraz.`, 'error', 6000)
        return false
      }
      const now = logicalDayOf(Date.now())
      if (asksTiming(list, now)) {
        setTiming({ template, dates: list, today: now, done })
        return true
      }
      return apply(template, list, DEFAULT_CHOICE, done)
    })

  const dialogs = (
    <>
      {timing && (
        <TimingDialog
          name={timing.template.name}
          dates={timing.dates}
          today={timing.today}
          busy={busy}
          onClose={() => setTiming(null)}
          onPick={(choice) =>
            void run(async () => {
              if (await apply(timing.template, timing.dates, choice, timing.done)) setTiming(null)
            })
          }
        />
      )}
      {asking && (
        <ModeDialog
          name={asking.template.name}
          asked={asking.asked}
          total={asking.dates.length}
          busy={busy}
          onClose={() => setAsking(null)}
          onPick={(mode) =>
            void run(async () => {
              if (await applyToDays(asking.template, asking.dates, mode, asking.choice)) {
                asking.done?.()
                setAsking(null)
              }
            })
          }
        />
      )}
    </>
  )
  return { start, busy, dialogs }
}

export function TemplateDaysButton({ template, today, kind }: { template: Template; today: string; kind: Kind }) {
  const button = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const flow = useApplyFlow()
  const [revoking, run] = useBusy()
  const busy = revoking || flow.busy
  const tomorrow = addDays(today, 1)

  /** The chosen days: „Odwołaj” at once, „Zastosuj” – through the flow. True – done (or nothing to do), the window may close. */
  const go = (dates: readonly string[]): Promise<boolean | undefined> => {
    if (kind === 'apply') return flow.start(template, dates)
    return run(async () => {
      const list = [...new Set(dates)].sort()
      if (!list.length) return false
      if (list.length > APPLY_DAYS_MAX) {
        toast(`Najwyżej ${APPLY_DAYS_MAX} dni naraz.`, 'error', 6000)
        return false
      }
      // A day that cannot be read is said by the save (`plannedDay` never throws); the save says its own failures.
      return revokeInDays(template, list)
    })
  }

  /** „Dziś” and „Jutro” of the click's logical day (the menu's words are of the page). */
  const items = [
    { label: `Dziś (${plDate(today)})`, onPick: () => void go([logicalDayOf(Date.now())]), testId: `template-${kind}-today` },
    { label: `Jutro (${plDate(tomorrow)})`, onPick: () => void go([addDays(logicalDayOf(Date.now()), 1)]), testId: `template-${kind}-tomorrow` },
    { label: 'Wybierz dni…', onPick: () => setPicking(true), testId: `template-${kind}-pick` }
  ]
  const verb = kind === 'apply' ? 'Zastosuj' : 'Odwołaj'

  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn"
        disabled={busy}
        aria-haspopup="menu"
        title={kind === 'apply' ? 'Skopiuj bloki tego szablonu do planu wybranych dni' : 'Zdejmij bloki tego szablonu z planu wybranych dni'}
        onClick={(e) => setMenu(menuPoint(e.detail === 0 ? null : e, button.current))}
        data-testid={`template-${kind}`}
      >
        {LABEL[kind]}
      </button>
      {menu && <ContextMenu title={`${verb} szablon „${template.name}”`} at={menu} items={items} onClose={() => setMenu(null)} testId={`template-${kind}-menu`} />}
      {picking && (
        <DaysDialog
          title={kind === 'apply' ? `Zastosuj „${template.name}” do…` : `Odwołaj „${template.name}” w…`}
          verb={verb}
          today={today}
          busy={busy}
          onClose={() => setPicking(false)}
          onPick={async (dates) => {
            if (await go(dates)) setPicking(false)
          }}
          max={APPLY_DAYS_MAX}
          testId={`template-${kind}-days`}
        />
      )}
      {flow.dialogs}
    </>
  )
}

/** One option of a group of the window of today's hours: a radio with its words and, below them, what it does. */
function Option({ name, checked, onPick, label, hint, testId }: { name: string; checked: boolean; onPick: () => void; label: string; hint?: string; testId: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px]">
      <input type="radio" name={name} className="mt-[3px]" checked={checked} onChange={onPick} data-testid={testId} />
      <span>
        {label}
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * „Zastosuj „…” do dziś” (D546): with today or a day gone by among the chosen days, before the question of collisions – the hours of today
 * (only with today) and the blocks gone by; each opening starts at „Wg planu” and „Dodaj jako zrealizowane”.
 */
function TimingDialog({ name, dates, today, busy, onClose, onPick }: { name: string; dates: readonly string[]; today: string; busy: boolean; onClose: () => void; onPick: (choice: ApplyChoice) => void }) {
  const [hours, setHours] = useState<ApplyChoice['hours']>(DEFAULT_CHOICE.hours)
  const [past, setPast] = useState<ApplyChoice['past']>(DEFAULT_CHOICE.past)
  const withToday = dates.includes(today)
  return (
    <Dialog
      title={timingTitle(name, dates, today)}
      // While it saves, neither Esc nor the backdrop closes it – the save says what became of it.
      onClose={() => !busy && onClose()}
      data-testid="template-apply-confirm"
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose} data-testid="template-apply-confirm-cancel">
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => onPick({ hours, past })} data-testid="template-apply-confirm-ok">
            Zastosuj
          </button>
        </>
      }
    >
      {withToday && (
        <fieldset className="flex flex-col gap-1.5" data-testid="template-apply-confirm-hours">
          <legend className="mb-1 text-[12.5px] text-muted">Godziny dziś</legend>
          <Option name="template-apply-hours" checked={hours === 'plan'} onPick={() => setHours('plan')} label="Wg planu – godziny szablonu" testId="template-apply-confirm-hours-plan" />
          <Option
            name="template-apply-hours"
            checked={hours === 'now'}
            onPick={() => setHours('now')}
            label="W czasie rzeczywistym – od teraz"
            hint="Pierwszy blok elastyczny zaczyna się teraz, pozostałe zachowują odstępy; sesje, wykłady, zajęcia i bloki stałe zostają."
            testId="template-apply-confirm-hours-now"
          />
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-1.5" data-testid="template-apply-confirm-past">
        <legend className="mb-1 text-[12.5px] text-muted">Minione bloki</legend>
        <Option
          name="template-apply-past"
          checked={past === 'done'}
          onPick={() => setPast('done')}
          label="Dodaj jako zrealizowane"
          hint="Liczą się jak zrobione; pomijam te, w których czasie coś trwało."
          testId="template-apply-confirm-past-done"
        />
        <Option name="template-apply-past" checked={past === 'skip'} onPick={() => setPast('skip')} label="Nie dodawaj minionych" testId="template-apply-confirm-past-skip" />
      </fieldset>
    </Dialog>
  )
}

/** „Uzupełnić luki czy nadpisać plan?” – asked once for all the days that collide (D541). */
function ModeDialog({ name, asked, total, busy, onClose, onPick }: { name: string; asked: readonly string[]; total: number; busy: boolean; onClose: () => void; onPick: (mode: 'fill' | 'overwrite') => void }) {
  const shown = asked.slice(0, 6).map(plDate).join(', ') + (asked.length > 6 ? ` i ${asked.length - 6} więcej` : '')
  const others = total - asked.length
  return (
    <Dialog
      title={`Bloki „${name}” kolidują z planem`}
      onClose={() => !busy && onClose()}
      data-testid="template-apply-mode"
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose} data-testid="template-apply-mode-cancel">
            Anuluj
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => onPick('overwrite')} data-testid="template-apply-overwrite">
            Nadpisz plan
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => onPick('fill')} data-testid="template-apply-fill">
            Uzupełnij luki
          </button>
        </>
      }
    >
      <p className="text-[13px]">
        {asked.length === 1 ? 'Dzień' : 'Dni'} {shown} {asked.length === 1 ? 'ma' : 'mają'} już w tych godzinach inne bloki.
      </p>
      <ul className="mt-2 list-disc pl-5 text-[12.5px] text-muted">
        <li>„Uzupełnij luki” – dodaje tylko bloki szablonu, które mieszczą się w wolnym czasie.</li>
        <li>„Nadpisz plan” – odwołuje kolidujące bloki i dodaje cały szablon (sesje, wykłady, zjazdy i bloki, które już trwały, zostają).</li>
      </ul>
      {others > 0 && <p className="mt-2 text-[12.5px] text-muted">Pozostałe wybrane dni ({others}) mają już bloki tego szablonu albo nic nie koliduje – tam bez pytania uzupełniam luki.</p>}
    </Dialog>
  )
}
