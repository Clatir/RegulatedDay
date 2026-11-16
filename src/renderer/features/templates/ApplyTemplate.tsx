/**
 * The buttons „Zastosuj do…” and „Odwołaj w…” of a template (D540–D545): a menu „Dziś” · „Jutro” · „Wybierz dni…”; the window of days is a
 * month (`MonthGrid`: a click – that day, Ctrl+click – one more or one less, Shift+click – the range from the last one, a drag – a range)
 * with the fields „Od” and „Do” (DD-MM-RRRR; eight digits become a date at once – `typedDmy`). „Zastosuj” on days without blocks of the
 * template whose blocks collide with the plan asks once: „Uzupełnij luki” or „Nadpisz plan” (D541); days with blocks of the template
 * fill the gaps without asking.
 */
import { useRef, useState } from 'react'
import { daysFromTo, dmy, parseDmy, typedDmy } from '@shared/dateInput'
import { countLabel, plDate } from '@shared/format'
import type { Template } from '@shared/model/plan'
import { addDays } from '@shared/time/zone'
import { ContextMenu, menuPoint } from '../../components/ContextMenu'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { toast } from '../../store/ui'
import { MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from '../calendar/MonthGrid'
import { APPLY_DAYS_MAX, applyToDays, askedDays, revokeInDays } from './applyDays'

type Kind = 'apply' | 'revoke'

const LABEL: Record<Kind, string> = { apply: 'Zastosuj do…', revoke: 'Odwołaj w…' }

export function TemplateDaysButton({ template, today, kind }: { template: Template; today: string; kind: Kind }) {
  const button = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [asking, setAsking] = useState<{ dates: string[]; asked: string[] } | null>(null)
  const [busy, run] = useBusy()
  const tomorrow = addDays(today, 1)

  /** The chosen days: „Odwołaj” at once, „Zastosuj” after the question when a day asks it. True – done (or nothing to do), the window may close. */
  const go = (dates: readonly string[]) =>
    run(async () => {
      const list = [...new Set(dates)].sort()
      if (!list.length) return false
      if (list.length > APPLY_DAYS_MAX) {
        toast(`Najwyżej ${APPLY_DAYS_MAX} dni naraz.`, 'error', 6000)
        return false
      }
      if (kind === 'revoke') return revokeInDays(template, list)
      const asked = await askedDays(template, list)
      if (asked.length) {
        setAsking({ dates: list, asked })
        return true
      }
      return applyToDays(template, list, 'fill')
    })

  const items = [
    { label: `Dziś (${plDate(today)})`, onPick: () => void go([today]), testId: `template-${kind}-today` },
    { label: `Jutro (${plDate(tomorrow)})`, onPick: () => void go([tomorrow]), testId: `template-${kind}-tomorrow` },
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
          testId={`template-${kind}-days`}
        />
      )}
      {asking && (
        <ModeDialog
          name={template.name}
          asked={asking.asked}
          total={asking.dates.length}
          busy={busy}
          onClose={() => setAsking(null)}
          onPick={(mode) =>
            void run(async () => {
              if (await applyToDays(template, asking.dates, mode)) setAsking(null)
            })
          }
        />
      )}
    </>
  )
}

/** „Uzupełnić luki czy nadpisać plan?” – asked once for all the days that collide (D541). */
function ModeDialog({ name, asked, total, busy, onClose, onPick }: { name: string; asked: readonly string[]; total: number; busy: boolean; onClose: () => void; onPick: (mode: 'fill' | 'overwrite') => void }) {
  const shown = asked.slice(0, 6).map(plDate).join(', ') + (asked.length > 6 ? ` i ${asked.length - 6} więcej` : '')
  const others = total - asked.length
  return (
    <Dialog
      title={`Bloki „${name}” kolidują z planem`}
      onClose={onClose}
      data-testid="template-apply-mode"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
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

/** A field of a date DD-MM-RRRR: eight digits become the date as soon as they are typed. */
function DmyField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  const bad = value.trim() !== '' && parseDmy(value) == null
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <input
        className={`input num w-[120px] ${bad ? 'border-rose' : ''}`}
        value={value}
        placeholder="DD-MM-RRRR"
        inputMode="numeric"
        maxLength={10}
        aria-label={label}
        aria-invalid={bad}
        onChange={(e) => onChange(typedDmy(e.target.value))}
        data-testid={testId}
      />
    </label>
  )
}

/** The days of a window: the fields, the month, „Wybrane: N dni”. */
function DaysDialog({ title, verb, today, busy, onClose, onPick, testId }: { title: string; verb: string; today: string; busy: boolean; onClose: () => void; onPick: (dates: string[]) => void; testId: string }) {
  const [month, setMonth] = useState(monthOf(today))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  /** The fields typed: both dates – the range, only „Od” – that day; the month shows the first one. */
  const typed = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    const a = parseDmy(f)
    const b = parseDmy(t)
    if (!a || (t.trim() && !b)) return
    const days = daysFromTo(a, b ?? a)
    if (days.length > APPLY_DAYS_MAX) return
    setSel(new Set(days))
    setMonth(monthOf(days[0]!))
  }
  /** The grid picked: the fields show the first and the last day. */
  const picked = (next: Set<string>) => {
    setSel(next)
    const list = [...next].sort()
    setFrom(list.length ? dmy(list[0]!) : '')
    setTo(list.length > 1 ? dmy(list[list.length - 1]!) : '')
  }
  const list = [...sel].sort()
  const past = list.filter((d) => d < today).length
  const [y, m] = month.split('-')
  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      data-testid={testId}
      actions={
        <>
          <span className="mr-auto text-[12px] text-muted" data-testid={`${testId}-count`}>
            {list.length ? `Wybrane: ${countLabel(list.length, 'dzień', 'dni', 'dni')}${past ? ` (minione: ${past})` : ''}` : 'Kliknij dzień; Ctrl+klik dodaje, Shift+klik – zakres.'}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={!list.length || busy} onClick={() => onPick(list)} data-testid={`${testId}-ok`}>
            {verb}
            {list.length ? ` (${list.length})` : ''}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <DmyField label="Od" value={from} onChange={(v) => typed(v, to)} testId={`${testId}-from`} />
        <DmyField label="Do" value={to} onChange={(v) => typed(from, v)} testId={`${testId}-to`} />
        <span className="flex-1" />
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
      <MonthGrid month={month} today={today} selected={sel} onSelect={picked} cell={() => ({ tone: null, marks: null })} data-testid={`${testId}-month`} />
    </Dialog>
  )
}
