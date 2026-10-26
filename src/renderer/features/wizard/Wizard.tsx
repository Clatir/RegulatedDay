/**
 * The wizard (spec „Kreator pierwszego komputera”, „Kreator kolejnego komputera”; D294): one topic per screen, a bar of
 * progress, the values filled with the defaults („Dalej” is enough), and a day of the plan counted beside it as you
 * answer (the same functions as the engine). The first computer chooses an empty folder („to pierwszy komputer”) and
 * sets up the shared data, written only at „Zakończ”; a computer that finds this app's data in the folder joins it and
 * sets only its own settings – it never writes anything shared.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DAY_TYPE_FIELDS } from '@shared/model/fields'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { POOLS, type Pool } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { MODULES, MODULE_NAMES, rdFrom } from '@shared/model/rd'
import { DAY_TYPES, DAY_TYPE_NAMES, NY_ZONE, RANGES, type DayTypeId, type SessionChoice } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { Choice, ClockField, DateField, DurationField, TextField, TimeField } from '../../components/fields'
import { blockFill } from '@shared/theme'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { BRIGHTNESS_STEPS } from '@shared/machine'
import { Field, Section, Segmented, Toggle, cx } from '../../components/ui'
import { navigate, toast } from '../../store/ui'
import { reloadData, useData } from '../../store/data'
import { countDay } from '../../store/day'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { MonthGrid, MONTH_NAMES, monthOf, shiftMonth } from '../calendar/MonthGrid'
import { dayAxis } from '../plan/dayItems'
import { Timeline } from '../plan/Timeline'
import { SettingNumber } from '../settings/SettingNumber'
import { draftChanges, draftTemplates, finishRecords, newLecture, patchSettings, patchWizard, useWizard, type Corner } from './wizardStore'

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']
const SHORT_DAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']

type StepId = 'folder' | 'week' | 'hours' | 'work' | 'regen' | 'sessions' | 'secondShift' | 'lectures' | 'calendar' | 'people' | 'regenWays' | 'costs' | 'modules' | 'computer' | 'summary'

const TITLES: Record<StepId, string> = {
  folder: 'Folder danych',
  week: 'Tydzień',
  hours: 'Pobudka i sen',
  work: 'Praca i granica',
  regen: 'Regeneracja i projekty',
  sessions: 'Sesje',
  secondShift: 'Druga zmiana',
  lectures: 'Plan wykładów',
  calendar: 'Zjazdy',
  people: 'Osoby',
  regenWays: 'Sposoby regeneracji',
  costs: 'Koszty kategorii',
  modules: 'Moduły',
  computer: 'Ten komputer',
  summary: 'Podsumowanie'
}

const FIRST: StepId[] = ['folder', 'week', 'hours', 'work', 'regen', 'sessions', 'secondShift', 'lectures', 'calendar', 'people', 'regenWays', 'costs', 'modules', 'computer', 'summary']
const NEXT: StepId[] = ['folder', 'computer', 'summary']
const WITH_PREVIEW = new Set<StepId>(['week', 'hours', 'work', 'regen', 'sessions', 'secondShift', 'lectures', 'calendar', 'costs'])

export function Wizard() {
  const w = useWizard()
  const view = useData((s) => s.view)
  const joining = !!w.probe?.hasData
  const steps = joining ? NEXT : FIRST
  const step = steps[Math.min(w.step, steps.length - 1)]!
  const today = view?.today ?? new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (w.folder) return
    void window.rd.folderDefault().then((folder) => {
      patchWizard({ folder })
      void window.rd.folderProbe(folder).then((probe) => patchWizard({ probe }))
    })
  }, [w.folder])

  const canGoOn = step !== 'folder' || (!!w.probe && !w.probe.unreadable && (w.probe.hasData || w.firstConfirmed))
  const go = (d: number) => patchWizard({ step: Math.max(0, Math.min(steps.length - 1, w.step + d)), error: null })

  const finish = async () => {
    if (!w.probe || !view) return
    patchWizard({ busy: true, error: null })
    const r = await window.rd.wizardFinish({
      folder: w.probe.path,
      first: !joining,
      records: joining ? [] : finishRecords(w, Date.now(), view.computer),
      prefs: { desktopBar: w.machine.desktopBar, stationaryClasses: w.machine.stationaryClasses },
      autostart: w.machine.autostart,
      pin: w.machine.pin
    })
    if (!r.ok) {
      patchWizard({ busy: false, error: r.error })
      return
    }
    if (w.machine.desktopBar) await window.rd.trialAction('corner', w.machine.corner).catch(() => undefined)
    await reloadData()
    patchWizard({ busy: false, open: false })
    navigate('today')
    toast(joining ? 'Ten komputer dołączył do danych.' : 'Gotowe – dane zapisane w folderze.', 'success', 5000)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="wizard">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <span className="text-[13px] font-medium">{joining ? 'Kreator kolejnego komputera' : 'Kreator pierwszego komputera'}</span>
        <span className="text-[12px] text-muted" data-testid="wizard-step">
          {w.step + 1} z {steps.length} · {TITLES[step]}
        </span>
        <span className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => patchWizard({ open: false })} data-testid="wizard-later">
          Później
        </button>
      </div>
      <div className="h-[3px] shrink-0 bg-line">
        <div className="h-full bg-lamp transition-all" style={{ width: `${((w.step + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-5">
            <h1 className="text-[18px] font-medium">{TITLES[step]}</h1>
            <StepView step={step} today={today} />
            {w.error && (
              <p className="rounded border border-rose/60 bg-rose-soft px-3 py-2 text-[12.5px]" data-testid="wizard-error">
                {w.error}
              </p>
            )}
            <div className="flex items-center gap-2 pt-2">
              {w.step > 0 && (
                <button type="button" className="btn" onClick={() => go(-1)} data-testid="wizard-back">
                  Wstecz
                </button>
              )}
              <span className="flex-1" />
              {step === 'summary' ? (
                <button type="button" className="btn btn-accent" disabled={w.busy} onClick={() => void finish()} data-testid="wizard-finish">
                  {w.busy ? 'Zapisuję…' : 'Zakończ'}
                </button>
              ) : (
                <button type="button" className="btn btn-accent" disabled={!canGoOn} onClick={() => go(1)} data-testid="wizard-next">
                  Dalej
                </button>
              )}
            </div>
          </div>
        </div>
        {WITH_PREVIEW.has(step) && !joining && <Preview today={today} />}
      </div>
    </div>
  )
}

function StepView({ step, today }: { step: StepId; today: string }) {
  switch (step) {
    case 'folder':
      return <StepFolder />
    case 'week':
      return <StepWeek />
    case 'hours':
      return <DayTypeTable keys={['wakeMin', 'bedtimeMin']} intro="Pobudka i pora snu każdego typu dnia. Pora snu wypada najpóźniej tyle przed jutrzejszą pobudką, ile wynosi docelowy sen." extra={<TargetSleep />} />
    case 'work':
      return <DayTypeTable keys={['budgetMin', 'maxMin']} intro="Budżet pracy to suma czasu bloków pracy dnia. Maksimum granicy to najpóźniejsza godzina, do której sięga granica bez wyjątku." />
    case 'regen':
      return <DayTypeTable keys={['minRegenMin', 'projectLimitMin']} intro="Minimum regeneracji chroni odpoczynek przed porą snu; limit projektów to najwięcej projektów dziennie." />
    case 'sessions':
      return <StepSessions />
    case 'secondShift':
      return <StepSecondShift />
    case 'lectures':
      return <StepLectures today={today} />
    case 'calendar':
      return <StepCalendar today={today} />
    case 'people':
      return <StepPeople />
    case 'regenWays':
      return <StepRegenWays />
    case 'costs':
      return <StepCosts />
    case 'modules':
      return <StepModules />
    case 'computer':
      return <StepComputer />
    case 'summary':
      return <StepSummary />
  }
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-muted">{children}</p>
}

function StepFolder() {
  const w = useWizard()
  const p = w.probe
  const choose = async () => {
    const dir = await window.rd.folderPick(w.folder || null)
    if (!dir) return
    patchWizard({ folder: dir, probe: null, firstConfirmed: false })
    patchWizard({ probe: await window.rd.folderProbe(dir) })
  }
  const recheck = async () => patchWizard({ probe: await window.rd.folderProbe(w.folder) })
  return (
    <div className="flex flex-col gap-3">
      <Lead>Dane Regulated Day leżą w jednym folderze, najlepiej w OneDrive – wtedy każdy Twój komputer widzi ten sam plan. Na tym komputerze aplikacja niczego nie zapisze w folderze, dopóki nie klikniesz „Zakończ”.</Lead>
      <Field label="Folder">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all text-[12.5px]" data-testid="wizard-folder">
            {w.folder || '…'}
          </span>
          <button type="button" className="btn" onClick={() => void choose()} data-testid="wizard-folder-pick">
            Zmień…
          </button>
        </div>
      </Field>
      {p && (
        <div className="flex flex-col gap-2 rounded border border-line bg-panel px-3 py-2.5 text-[12.5px]" data-testid="wizard-probe">
          {p.unreadable ? (
            <>
              <span>Nie mogę teraz odczytać tego folderu ({p.unreadable}). Gdy OneDrive jeszcze pobiera pliki, poczekaj chwilę.</span>
              <button type="button" className="btn self-start" onClick={() => void recheck()}>
                Sprawdź ponownie
              </button>
            </>
          ) : p.hasData ? (
            <span data-testid="wizard-join">W tym folderze są już dane Regulated Day. Ten komputer do nich dołączy – ustawisz tylko jego własne ustawienia, niczego wspólnego nie zmieni.</span>
          ) : (
            <>
              <span>{p.empty ? (p.exists ? 'Folder jest pusty.' : 'Folder jeszcze nie istnieje – powstanie przy „Zakończ”.') : `W folderze są inne pliki (${p.entries}) i nie ma danych Regulated Day.`}</span>
              <Toggle checked={w.firstConfirmed} onChange={(v) => patchWizard({ firstConfirmed: v })} label={p.empty ? 'To pierwszy komputer – zacznij tu nowe dane' : 'Mimo to zacznij tu nowe dane (to pierwszy komputer)'} data-testid="wizard-first" />
            </>
          )}
          {!p.inOneDrive && !p.unreadable && <span className="text-muted">Ten folder nie leży w OneDrive – inny komputer go nie zobaczy, chyba że synchronizujesz go inaczej.</span>}
        </div>
      )}
    </div>
  )
}

function StepWeek() {
  const s = useWizard((x) => x.settings)
  return (
    <div className="flex flex-col gap-3">
      <Lead>Jaki typ ma zwykle każdy dzień tygodnia. Pojedyncze dni (zjazdy, wolne) zaznaczysz w kalendarzu.</Lead>
      <div className="grid grid-cols-[140px_1fr] items-center gap-2">
        {WEEKDAY_NAMES.map((name, i) => (
          <div key={name} className="contents">
            <span className="text-muted">{name}</span>
            <Choice
              value={s.weekTypes[i]!}
              options={DAY_TYPES.map((t) => ({ value: t, label: DAY_TYPE_NAMES[t] }))}
              onChange={(t) => patchSettings({ weekTypes: s.weekTypes.map((x, j) => (j === i ? t : x)) })}
              aria-label={`Typ: ${name}`}
              data-testid={`wizard-weektype-${i}`}
              className="max-w-[240px]"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function TargetSleep() {
  const s = useWizard((x) => x.settings)
  return (
    <Field label="Docelowy sen">
      <SettingNumber field={{ kind: 'duration', range: RANGES.targetSleepMin, label: 'Docelowy sen' }} value={s.targetSleepMin} onCommit={(v) => patchSettings({ targetSleepMin: v })} data-testid="wizard-target-sleep" />
    </Field>
  )
}

function DayTypeTable({ keys, intro, extra }: { keys: Array<(typeof DAY_TYPE_FIELDS)[number]['key']>; intro: string; extra?: ReactNode }) {
  const s = useWizard((x) => x.settings)
  const fields = DAY_TYPE_FIELDS.filter((f) => keys.includes(f.key))
  return (
    <div className="flex flex-col gap-3">
      <Lead>{intro}</Lead>
      <div className="grid items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: `170px repeat(${fields.length}, minmax(0, 1fr))` }}>
        <span />
        {fields.map((f) => (
          <span key={f.key} className="text-[12px] text-muted">
            {f.label}
          </span>
        ))}
        {DAY_TYPES.map((t) => (
          <div key={t} className="contents">
            <span>{DAY_TYPE_NAMES[t]}</span>
            {fields.map((f) => (
              <SettingNumber
                key={f.key}
                field={{ kind: f.kind, range: RANGES[f.key as keyof typeof RANGES] as readonly [number, number], label: `${DAY_TYPE_NAMES[t]}: ${f.label}` }}
                value={s.dayTypes[t][f.key as 'budgetMin']}
                onCommit={(v) => patchSettings({ dayTypes: { [t]: { [f.key]: v } } })}
                data-testid={`wizard-${t}-${f.key}`}
              />
            ))}
          </div>
        ))}
      </div>
      {extra}
    </div>
  )
}

const SESSION_CHOICES: Array<{ value: SessionChoice; label: string }> = [
  { value: 'yes', label: 'tak' },
  { value: 'no', label: 'nie' },
  { value: 'ask', label: 'pytaj' }
]

function StepSessions() {
  const s = useWizard((x) => x.settings)
  return (
    <div className="flex flex-col gap-4">
      <Lead>Sesje mają własną strefę (jak killzones ICT w czasie Nowego Jorku), więc w Polsce przesuwają się same, także w tygodniach, gdy USA i Europa zmieniają czas w inne niedziele.</Lead>
      <div className="flex flex-col gap-2">
        {s.sessions.map((x, i) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2">
            <TextField value={x.name} onCommit={(name) => patchSettings({ sessions: s.sessions.map((y, j) => (j === i ? { ...y, name } : y)) })} required max={40} className="w-[120px]" aria-label="Nazwa sesji" />
            <ClockField value={x.startMin} onCommit={(v) => patchSettings({ sessions: s.sessions.map((y, j) => (j === i ? { ...y, startMin: v } : y)) })} className="w-[80px]" aria-label={`${x.name}: początek`} />
            <span className="text-muted">–</span>
            <ClockField value={x.endMin % 1440} onCommit={(v) => patchSettings({ sessions: s.sessions.map((y, j) => (j === i ? { ...y, endMin: v > y.startMin ? v : v + 1440 } : y)) })} className="w-[80px]" aria-label={`${x.name}: koniec`} />
            <Choice value={x.zone} options={ZONES} onChange={(zone) => patchSettings({ sessions: s.sessions.map((y, j) => (j === i ? { ...y, zone } : y)) })} className="w-[190px]" aria-label={`${x.name}: strefa`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">Warstwa sesji: czy dzień danego typu ma sesje (pytaj – pytanie w planie porannym, bez odpowiedzi sesja zostaje).</span>
        <div className="grid items-center gap-1" style={{ gridTemplateColumns: '150px repeat(7, minmax(0, 1fr))' }}>
          <span />
          {SHORT_DAYS.map((d) => (
            <span key={d} className="text-center text-[11px] text-muted">
              {d}
            </span>
          ))}
          {DAY_TYPES.map((t) => (
            <div key={t} className="contents">
              <span className="text-[12.5px]">{DAY_TYPE_NAMES[t]}</span>
              {s.dayTypes[t].sessions.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={cx('h-[24px] rounded border text-[11px]', c === 'yes' ? 'border-lamp/60 bg-lamp-soft text-lamp' : c === 'ask' ? 'border-sea/60 bg-sea-soft text-sea' : 'border-line text-muted')}
                  onClick={() => patchSettings({ dayTypes: { [t]: { sessions: s.dayTypes[t].sessions.map((x, j) => (j === i ? SESSION_CHOICES[(SESSION_CHOICES.findIndex((y) => y.value === x) + 1) % 3]!.value : x)) } } })}
                  data-testid={`wizard-layer-${t}-${i}`}
                >
                  {SESSION_CHOICES.find((y) => y.value === c)!.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const ZONES = [
  { value: NY_ZONE, label: 'Nowy Jork' },
  { value: 'Europe/London', label: 'Londyn' },
  { value: 'Europe/Warsaw', label: 'Warszawa' },
  { value: 'Asia/Tokyo', label: 'Tokio' },
  { value: 'Australia/Sydney', label: 'Sydney' }
]

function StepSecondShift() {
  const ss = useWizard((x) => x.secondShift)
  return (
    <div className="flex flex-col gap-3">
      <Lead>Druga zmiana to wieczorny blok pracy w dni zwykłe (domyślnie trading 20:00–21:00). Liczy się do budżetu, ale nie przesuwa granicy i nie jest przedłużeniem; zaczyna się dopiero po „Zacznij”.</Lead>
      <Toggle checked={ss.on} onChange={(on) => patchWizard({ secondShift: { ...ss, on } })} label={ss.on ? 'Druga zmiana w dni zwykłe' : 'Bez drugiej zmiany'} data-testid="wizard-second-shift" />
      {ss.on && (
        <div className="flex items-center gap-2">
          <TimeField value={ss.startMin} onCommit={(startMin) => patchWizard({ secondShift: { ...ss, startMin } })} className="w-[90px]" aria-label="Początek drugiej zmiany" data-testid="wizard-second-start" />
          <span className="text-muted">przez</span>
          <DurationField value={ss.durationMin} onCommit={(durationMin) => patchWizard({ secondShift: { ...ss, durationMin } })} className="w-[110px]" aria-label="Długość drugiej zmiany" />
        </div>
      )}
    </div>
  )
}

function StepLectures({ today }: { today: string }) {
  const lectures = useWizard((x) => x.lectures)
  const set = (i: number, p: Partial<(typeof lectures)[number]>) => patchWizard({ lectures: lectures.map((l, j) => (j === i ? { ...l, ...p } : l)) })
  return (
    <div className="flex flex-col gap-3">
      <Lead>Wykłady i zajęcia, które powtarzają się co tydzień w semestrze. Możesz to zostawić na później – plan wykładów jest też w ustawieniach.</Lead>
      {lectures.map((l, i) => (
        <div key={l.id} className="flex flex-col gap-2 rounded border border-line bg-panel p-3" data-testid="wizard-lecture">
          <div className="flex flex-wrap items-center gap-2">
            <TextField value={l.name} onCommit={(name) => set(i, { name })} placeholder="nazwa, np. Ekonometria" className="w-[220px]" aria-label="Nazwa wykładu" />
            <Choice
              value={l.categoryId}
              options={[
                { value: 'wyklad', label: 'Wykład online (nagrywanie)' },
                { value: 'zajecia-zdalne', label: 'Zajęcia zdalne' }
              ]}
              onChange={(categoryId) => set(i, { categoryId })}
              className="w-[220px]"
              aria-label="Rodzaj"
            />
            <button type="button" className="text-[12px] text-muted hover:text-rose" onClick={() => patchWizard({ lectures: lectures.filter((_, j) => j !== i) })}>
              Usuń
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Choice value={String(l.weekday)} options={WEEKDAY_NAMES.map((n, j) => ({ value: String(j + 1), label: n }))} onChange={(v) => set(i, { weekday: Number(v) })} className="w-[140px]" aria-label="Dzień tygodnia" />
            <TimeField value={l.startMin} onCommit={(startMin) => set(i, { startMin })} className="w-[80px]" aria-label="Godzina" />
            <DurationField value={l.durationMin} onCommit={(durationMin) => set(i, { durationMin })} className="w-[100px]" aria-label="Długość" />
            <span className="text-muted">od</span>
            <DateField today={today} value={l.from} onCommit={(from) => set(i, { from })} className="w-[110px]" aria-label="Od" />
            <span className="text-muted">do</span>
            <DateField today={today} value={l.to} onCommit={(to) => set(i, { to })} className="w-[110px]" aria-label="Do" />
          </div>
        </div>
      ))}
      <button type="button" className="btn self-start" onClick={() => patchWizard({ lectures: [...lectures, newLecture(today)] })} data-testid="wizard-add-lecture">
        + Dodaj wykład
      </button>
    </div>
  )
}

function StepCalendar({ today }: { today: string }) {
  const days = useWizard((x) => x.days)
  const settings = useWizard((x) => x.settings)
  const brightness = useMachine((x) => x.prefs.brightness)
  const [month, setMonth] = useState(monthOf(today))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const mark = (t: DayTypeId | null) => {
    const next = { ...days }
    for (const d of sel) {
      if (t) next[d] = t
      else delete next[d]
    }
    patchWizard({ days: next })
    setSel(new Set())
  }
  const [y, m] = month.split('-')
  return (
    <div className="flex flex-col gap-3">
      <Lead>Zaznacz dni zjazdów (kilka naraz: przeciągnij albo klikaj z Ctrl) i nadaj im typ. Wolne (wyjazd, urlop) też możesz zaznaczyć już teraz.</Lead>
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
      <MonthGrid
        month={month}
        today={today}
        selected={sel}
        onSelect={setSel}
        cell={(d) => {
          const t = days[d] ?? settings.weekTypes[weekday(d) - 1]!
          return { tone: days[d] ? blockFill(DAY_TYPE_COLORS[t], brightness) : null, marks: days[d] ? <span>{DAY_TYPE_NAMES[t]}</span> : null }
        }}
        data-testid="wizard-month"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Zaznaczone: {sel.size}</span>
        {(['zjazd-stacjonarny', 'zjazd-zdalny', 'wolne'] as DayTypeId[]).map((t) => (
          <button key={t} type="button" className="btn" disabled={!sel.size} onClick={() => mark(t)} data-testid={`wizard-mark-${t}`}>
            {DAY_TYPE_NAMES[t]}
          </button>
        ))}
        <button type="button" className="btn" disabled={!sel.size} onClick={() => mark(null)}>
          Bez oznaczenia
        </button>
      </div>
    </div>
  )
}

function StepPeople() {
  const people = useWizard((x) => x.people)
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    patchWizard({ people: [...people, { id: newId(), name: n.slice(0, 60), archived: false }] })
    setName('')
  }
  return (
    <div className="flex flex-col gap-3">
      <Lead>Osoby, które przychodzą z prośbami. Wybierasz je potem jednym kliknięciem; listę uzupełnisz w każdej chwili.</Lead>
      <ul className="flex flex-col gap-1.5">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <TextField value={p.name} onCommit={(n) => patchWizard({ people: people.map((x) => (x.id === p.id ? { ...x, name: n } : x)) })} required max={60} className="w-[240px]" aria-label="Osoba" />
            <button type="button" className="text-[12px] text-muted hover:text-rose" onClick={() => patchWizard({ people: people.filter((x) => x.id !== p.id) })}>
              Usuń
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input className="input w-[240px]" value={name} maxLength={60} placeholder="+ dodaj osobę" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="wizard-person" />
        <button type="button" className="btn" onClick={add} disabled={!name.trim()} data-testid="wizard-person-add">
          Dodaj
        </button>
      </div>
    </div>
  )
}

function StepRegenWays() {
  const s = useWizard((x) => x.settings)
  const regen = s.categories.regeneracja!
  const [name, setName] = useState('')
  const setVariants = (variants: typeof regen.variants) => patchSettings({ categories: { regeneracja: { variants } } })
  return (
    <div className="flex flex-col gap-3">
      <Lead>Sposoby regeneracji, z których wybierasz przy propozycji odpoczynku. Każdy ma własny koszt (ujemny – oddaje energię).</Lead>
      <ul className="flex flex-col gap-1.5">
        {regen.variants
          .filter((v) => !v.archived)
          .map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <TextField value={v.name} onCommit={(n) => setVariants(regen.variants.map((x) => (x.id === v.id ? { ...x, name: n } : x)))} required max={80} className="w-[300px]" aria-label="Sposób regeneracji" />
              <button type="button" className="text-[12px] text-muted hover:text-rose" onClick={() => setVariants(regen.variants.map((x) => (x.id === v.id ? { ...x, archived: true } : x)))}>
                Usuń
              </button>
            </li>
          ))}
      </ul>
      <div className="flex items-center gap-2">
        <input className="input w-[300px]" value={name} maxLength={80} placeholder="+ dodaj sposób" onChange={(e) => setName(e.currentTarget.value)} data-testid="wizard-regen-way" />
        <button
          type="button"
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            setVariants([...regen.variants, { id: newId(10), name: name.trim(), costs: { head: -1, emotions: -1, senses: -1 } }])
            setName('')
          }}
        >
          Dodaj
        </button>
      </div>
    </div>
  )
}

const POOL_NAMES: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' }

function StepCosts() {
  const s = useWizard((x) => x.settings)
  const machine = useWizard((x) => x.machine)
  const rd = useMemo(() => rdFrom(undefined), [])
  const cats = Object.entries(s.categories)
  const remote = s.categories['zajecia-zdalne']!
  const listening = s.categories.nauka!.variants.find((v) => v.id === 'sluchanie')
  const meal = s.categories.posilek!
  return (
    <div className="flex flex-col gap-4">
      <Lead>Koszt na godzinę dla każdej puli, od −5 do 5 (koszt 3 zjada 9 jednostek na godzinę; ujemny oddaje). To wartości startowe – przegląd kalibracji je poprawi.</Lead>
      <div className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
        <Field label="Zajęcia zdalne to kontakt z ludźmi?" labelWidth={300}>
          <Segmented value={remote.contact ? 'yes' : 'no'} options={[{ value: 'yes', label: 'tak' }, { value: 'no', label: 'nie' }]} onChange={(v) => patchSettings({ categories: { 'zajecia-zdalne': { contact: v === 'yes' } } })} data-testid="wizard-remote-contact" />
        </Field>
        <Field label="Słuchanie nauki" labelWidth={300}>
          <Segmented
            value={listening?.place === 'away' ? 'away' : 'passive'}
            options={[{ value: 'passive', label: 'przy komputerze (pasywnie)' }, { value: 'away', label: 'z dala od niego' }]}
            onChange={(v) => patchSettings({ categories: { nauka: { variants: s.categories.nauka!.variants.map((x) => (x.id === 'sluchanie' ? { ...x, place: v } : x)) } } })}
            data-testid="wizard-listening"
          />
        </Field>
        <Field label="Posiłki" labelWidth={300}>
          <Segmented value={meal.place === 'passive' ? 'passive' : 'away'} options={[{ value: 'passive', label: 'przy komputerze (pasywnie)' }, { value: 'away', label: 'z dala od niego' }]} onChange={(v) => patchSettings({ categories: { posilek: { place: v } } })} data-testid="wizard-meals" />
        </Field>
        <Field label="Na zajęciach stacjonarnych używasz tego komputera?" labelWidth={300}>
          <Segmented value={machine.stationaryClasses ? 'yes' : 'no'} options={[{ value: 'no', label: 'nie' }, { value: 'yes', label: 'tak' }]} onChange={(v) => patchWizard({ machine: { ...machine, stationaryClasses: v === 'yes' } })} data-testid="wizard-stationary" />
        </Field>
      </div>
      <div className="grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) repeat(3, 64px)' }}>
        <span />
        {POOLS.map((p) => (
          <span key={p} className="text-center text-[12px] text-muted">
            {POOL_NAMES[p]}
          </span>
        ))}
        {cats.map(([id, c]) => (
          <div key={id} className="contents">
            <span className="truncate text-[12.5px]">{rd.categories[id]?.name ?? id}</span>
            {POOLS.map((p) => (
              <SettingNumber key={p} field={{ kind: 'integer', range: RANGES.cost, label: `${rd.categories[id]?.name}: ${POOL_NAMES[p]}` }} value={c.costs[p]} onCommit={(v) => patchSettings({ categories: { [id]: { costs: { [p]: v } } } })} className="w-[60px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepModules() {
  const g = useWizard((x) => x.general)
  return (
    <div className="flex flex-col gap-3">
      <Lead>Plan, timer, granica, czas wolny i rytuał działają zawsze. Moduły włączasz i wyłączasz sam – zmiana działa od razu; na start wszystkie są włączone.</Lead>
      {MODULES.map((m) => (
        <Toggle key={m} checked={g.modules[m]} onChange={(v) => patchWizard({ general: { ...g, modules: { ...g.modules, [m]: v } } })} label={MODULE_NAMES[m]} data-testid={`wizard-module-${m}`} />
      ))}
    </div>
  )
}

const CORNERS: Array<{ value: Corner; label: string }> = [
  { value: 'bottom-left', label: 'lewy dolny' },
  { value: 'bottom-right', label: 'prawy dolny' },
  { value: 'top-left', label: 'lewy górny' },
  { value: 'top-right', label: 'prawy górny' }
]

function StepComputer() {
  const w = useWizard()
  const brightness = useMachine((x) => x.prefs.brightness)
  const m = w.machine
  const set = (p: Partial<typeof m>) => patchWizard({ machine: { ...m, ...p } })
  return (
    <div className="flex flex-col gap-3">
      <Lead>Ustawienia tylko tego komputera.</Lead>
      <Section title="Pasek i ikona">
        <Field label="Pasek pulpitu" hint="Leży pod oknami innych aplikacji – nigdy nad nimi.">
          <Toggle checked={m.desktopBar} onChange={(desktopBar) => set({ desktopBar })} label={m.desktopBar ? 'włączony' : 'wyłączony'} data-testid="wizard-desktop-bar" />
        </Field>
        {m.desktopBar && (
          <Field label="Miejsce paska">
            <Segmented value={m.corner} options={CORNERS} onChange={(corner) => set({ corner })} aria-label="Miejsce paska" />
          </Field>
        )}
        <Field label="Ikona przy zegarze" hint="Windows chowa nowe ikony pod strzałką. W ustawieniach paska zadań włącz ikonę Regulated Day, żeby była zawsze widoczna.">
          <button type="button" className="btn" onClick={() => void window.rd.openSystemSettings('taskbar')}>
            Otwórz ustawienia paska zadań
          </button>
        </Field>
        <Field label="Powiadomienia priorytetowe" hint="Żeby kilka ważnych powiadomień (np. twardy koniec) przechodziło przez „Nie przeszkadzać”, dodaj Regulated Day do listy priorytetowej. Aplikacja tego nie zmienia sama.">
          <button type="button" className="btn" onClick={() => void window.rd.openSystemSettings('notifications')}>
            Otwórz ustawienia powiadomień
          </button>
        </Field>
      </Section>
      <Section title="Start i folder">
        <Field label="Uruchamiaj z Windows">
          <Toggle checked={m.autostart} onChange={(autostart) => set({ autostart })} label={m.autostart ? 'włączone' : 'wyłączone'} data-testid="wizard-autostart" />
        </Field>
        {w.probe?.inOneDrive && (
          <Field label="Zawsze przechowuj na tym urządzeniu" hint="OneDrive trzyma wtedy cały folder na dysku (bez kopii zapasowych), więc dane są dostępne także bez sieci.">
            <Toggle checked={m.pin} onChange={(pin) => set({ pin })} label={m.pin ? 'tak' : 'nie'} data-testid="wizard-pin" />
          </Field>
        )}
        {w.probe?.hasData && (
          <Field label="Na zajęciach stacjonarnych używasz tego komputera?">
            <Segmented value={m.stationaryClasses ? 'yes' : 'no'} options={[{ value: 'no', label: 'nie' }, { value: 'yes', label: 'tak' }]} onChange={(v) => set({ stationaryClasses: v === 'yes' })} data-testid="wizard-stationary-join" />
          </Field>
        )}
        <Field label="Jasność" hint="Przyciemnia tło, grafikę i akcenty; tekst zostaje tak samo czytelny. Działa od razu.">
          <Segmented value={brightness} options={BRIGHTNESS_STEPS.map((b) => ({ value: b, label: `${Math.round(b * 100)} %` }))} onChange={(b) => void setMachinePrefs({ brightness: b })} aria-label="Jasność" />
        </Field>
      </Section>
    </div>
  )
}

function StepSummary() {
  const w = useWizard()
  const s = w.settings
  const joining = !!w.probe?.hasData
  if (joining)
    return <Lead>Ten komputer dołączy do danych w folderze {w.probe?.path}. Zapiszą się tylko jego własne ustawienia.</Lead>
  const special = Object.keys(w.days).length
  return (
    <div className="flex flex-col gap-2 leading-relaxed" data-testid="wizard-summary">
      <Lead>Po „Zakończ” aplikacja zapisze dane w folderze {w.probe?.path}. Wszystko zmienisz potem w ustawieniach (zmiany działają domyślnie od jutra).</Lead>
      <ul className="list-disc pl-5 text-[12.5px]">
        <li>
          Dzień zwykły: pobudka {logicalClock(s.dayTypes.zwykly.wakeMin)}, pora snu {logicalClock(s.dayTypes.zwykly.bedtimeMin)}, budżet {durationLabel(s.dayTypes.zwykly.budgetMin)}, maksimum {logicalClock(s.dayTypes.zwykly.maxMin)}.
        </li>
        <li>{w.secondShift.on ? `Druga zmiana ${logicalClock(w.secondShift.startMin)} przez ${durationLabel(w.secondShift.durationMin)}.` : 'Bez drugiej zmiany.'}</li>
        <li>Wykłady: {w.lectures.length}, dni zaznaczone w kalendarzu: {special}, osoby: {w.people.length}.</li>
        <li>Moduły: {MODULES.filter((m) => w.general.modules[m]).map((m) => MODULE_NAMES[m].toLowerCase()).join(', ') || 'żaden'}.</li>
      </ul>
      <p className="text-[12px] text-muted">Dzień, w którym przechodzisz kreator, jest poza grą – gra liczy od jutra.</p>
    </div>
  )
}

/** The day counted from the wizard's answers (the same functions as the engine), from the next ordinary day. */
function Preview({ today }: { today: string }) {
  const w = useWizard()
  const firstOrdinary = useMemo(() => {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i)
      if ((w.days[d] ?? w.settings.weekTypes[weekday(d) - 1]) === 'zwykly') return d
    }
    return addDays(today, 1)
  }, [today, w.days, w.settings.weekTypes])
  const [date, setDate] = useState<string | null>(null)
  const shown = date ?? firstOrdinary
  const model = useMemo(() => {
    const dayFile = w.days[shown] ? { schema: 1, date: shown, dayType: w.days[shown] } : null
    return countDay(
      shown,
      { date: shown, dayFile, nextFile: null, prevFile: null, events: [], complete: true, unknown: false },
      { changes: draftChanges(w), templates: draftTemplates(w), lectures: w.lectures },
      placeLogical(shown, 4 * 60),
      false
    )
  }, [shown, w])
  const names = useMemo(() => ({ rd: { ...rdFrom(undefined), people: w.people }, settings: w.settings, routines: [], requests: [] }), [w.people, w.settings])
  const axis = dayAxis(model, names, null)
  const type = model.snapshot.dayType
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-panel" data-testid="wizard-preview">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" className="btn h-[24px] px-2" onClick={() => setDate(addDays(shown, -1))} aria-label="Poprzedni dzień">
          ‹
        </button>
        <span className="flex-1 text-center text-[12.5px]">
          {WEEKDAY_NAMES[weekday(shown) - 1]} {plDate(shown)} · {DAY_TYPE_NAMES[type].toLowerCase()}
        </span>
        <button type="button" className="btn h-[24px] px-2" onClick={() => setDate(addDays(shown, 1))} aria-label="Następny dzień">
          ›
        </button>
      </div>
      <div className="px-3 py-1.5 text-[11.5px] text-muted">Podgląd: {model.state.boundary.proposal != null ? `granica ${logicalClock(axis.markers.find((m) => m.label.startsWith('propozycja'))?.at ?? 0)}, ` : ''}pora snu {logicalClock(axis.markers.find((m) => m.label.startsWith('pora snu'))?.at ?? 0)}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Timeline items={axis.items} markers={axis.markers} selected={null} onSelect={() => undefined} from={axis.from} to={axis.to} data-testid="wizard-timeline" />
      </div>
    </aside>
  )
}
