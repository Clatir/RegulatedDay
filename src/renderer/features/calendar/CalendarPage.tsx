/**
 * Kalendarz (D295): the month as a grid – every day in its type's colour with its marks („zjazd”, free, a holiday, an
 * early close of the market, the week of the session shift, its own wake); several dates are selected by dragging or
 * with Ctrl and get a type or a wake at once; a click on a day opens its plan. Marking a Saturday as a „zjazd” asks
 * once whether the weekly analysis goes to Friday 20:00–21:00 instead of the second shift (spec „Typy dni i szablony”).
 */
import { useEffect, useMemo, useState } from 'react'
import type { RawRecord } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayRaw, putBlock, setAsked, setCancelled, setDayField } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { sessionShiftMin, sessionWindow } from '@shared/engine/createDay'
import { weeklyAnalysisMove } from '@shared/engine/morning'
import { logicalClock, plDate } from '@shared/format'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn, type DayTypeId } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { addDays, weekday } from '@shared/time/zone'
import { Dialog } from '../../components/Dialog'
import { TimeField } from '../../components/fields'
import { editOf, isSaved, saveEdits, trySaveEdits, useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { openDay, toast } from '../../store/ui'
import { DAY_TYPE_COLORS } from './dayTypes'
import { gridDates, MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from './MonthGrid'

export function CalendarPage() {
  const { rd, templates, lectures, stamp } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const brightness = useMachine((s) => s.prefs.brightness)
  const [month, setMonth] = useState(monthOf(today))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<Record<string, RawRecord | null>>({})
  const [ask, setAsk] = useState<Array<{ friday: string; analysis: PlanBlock; secondShift: string | null }>>([])
  const [wake, setWake] = useState<number | null>(null)
  const dates = useMemo(() => gridDates(month), [month])
  useEffect(() => {
    let alive = true
    // The Fridays before the grid's Saturdays too (the weekly analysis), and the day after its end.
    void window.rd.dayFiles([addDays(dates[0]!, -1), ...dates, addDays(dates.at(-1)!, 1)]).then((f) => alive && setFiles(f))
    return () => {
      alive = false
    }
  }, [dates, stamp])
  const fileOf = (d: string) => (files[d] ? dayFileFrom(files[d], d) : null)

  const info = (d: string) => {
    const s = settingsOn(rd.settings, d)
    const own = fileOf(d)
    const type: DayTypeId = own?.dayType ?? s.weekTypes[weekday(d) - 1]!
    const marks: string[] = []
    if (own?.dayType) marks.push(DAY_TYPE_NAMES[type].replace('Zjazd ', 'zjazd ').toLowerCase())
    // A holiday is a day with a holiday's name (a market closed on a weekend is not one).
    const pl = marketDay('PL', d)
    if (pl.closed && pl.names.length) marks.push('święto')
    const us = [marketDay('NYSE', d), marketDay('CME_FX', d)]
    if (us.some((h) => h.closed && h.names.length)) marks.push('święto USA')
    else if (us.some((h) => h.earlyClose)) marks.push('skrócona sesja')
    if (s.sessions.some((x) => {
      const w = sessionWindow(x, d)
      return w != null && sessionShiftMin(x, w.start) !== 0
    }))
      marks.push('sesje −1 h')
    if (own?.wakeMin != null) marks.push(`pobudka ${logicalClock(own.wakeMin)}`)
    return { type, own: own?.dayType != null, marks, title: [...pl.names, ...us.flatMap((h) => h.names)].join(', ') || undefined }
  }

  /**
   * The selected days to come take a type (null: their weekday's own again). Today's type changes in „Dziś” (a change
   * during the day with its proposals) and a day gone keeps the type of its plan – a type in their files would change
   * nothing the engine counts (A7-03).
   */
  const setType = async (t: DayTypeId | null) => {
    const all = [...sel].sort()
    const list = all.filter((d) => d > today)
    if (list.length < all.length)
      toast(
        all.includes(today) ? 'Typ dzisiejszego dnia zmienisz w „Dziś” (przycisk typu u góry) – z propozycjami zmiany w trakcie dnia. Dni minione mają typ z planu z rana.' : 'Dni minione mają typ z planu z rana – zmieniają się tylko dni od jutra.',
        'info',
        10_000,
        all.includes(today) ? { label: 'Otwórz Dziś', run: () => openDay(null) } : undefined
      )
    if (!list.length) return
    if (!isSaved(await trySaveEdits(list.map((d) => editOf(paths.day(d), files[d] ?? null, setDayField(dayRaw(files[d], d), 'dayType', t)))))) return
    setSel(new Set())
    // A Saturday marked as a „zjazd”: the weekly analysis to Friday – asked once, here or in Friday's morning plan.
    if (t === 'zjazd-stacjonarny' || t === 'zjazd-zdalny') {
      const next: typeof ask = []
      for (const d of list.filter((x) => weekday(x) === 6)) {
        const friday = addDays(d, -1)
        const raw = (await window.rd.dayFiles([friday]))[friday] ?? null
        const m = weeklyAnalysisMove(
          { date: friday, changes: rd.settings, templates, lectures, holidays: marketDay, files: (x) => (x === d ? { ...dayFileFrom({}, d), dayType: t } : x === friday ? (raw ? dayFileFrom(raw, friday) : null) : fileOf(x)) },
          friday
        )
        if (m) next.push({ friday, ...m })
      }
      setAsk(next)
    }
  }

  const setWakeOf = async (v: number | null) => {
    await saveEdits([...sel].map((d) => editOf(paths.day(d), files[d] ?? null, setDayField(dayRaw(files[d], d), 'wakeMin', v))))
    setSel(new Set())
  }

  const answerAnalysis = async (a: (typeof ask)[number], yes: boolean) => {
    const raw = (await window.rd.dayFiles([a.friday]))[a.friday] ?? null
    let next = setAsked(dayRaw(raw, a.friday), 'weeklyAnalysisMove', yes ? 'yes' : 'no')
    if (yes) {
      next = putBlock(next, a.analysis)
      if (a.secondShift) next = setCancelled(next, a.secondShift, true)
    }
    await saveEdits([editOf(paths.day(a.friday), raw, next)])
    setAsk(ask.filter((x) => x !== a))
  }

  const [y, m] = month.split('-')
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="calendar">
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc" data-testid="month-prev">
          ‹
        </button>
        <span className="w-[170px] text-center text-[14px] font-medium" data-testid="month-title">
          {MONTH_NAMES[Number(m) - 1]} {y}
        </span>
        <button type="button" className="btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc" data-testid="month-next">
          ›
        </button>
        <button type="button" className="btn" onClick={() => setMonth(monthOf(today))}>
          Dziś
        </button>
        <span className="ml-auto flex flex-wrap gap-2 text-[11.5px] text-muted">
          {DAY_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: blockFill(DAY_TYPE_COLORS[t], brightness), border: `1px solid ${DAY_TYPE_COLORS[t]}` }} />
              {DAY_TYPE_NAMES[t]}
            </span>
          ))}
        </span>
      </div>
      <MonthGrid
        month={month}
        today={today}
        selected={sel}
        onSelect={setSel}
        onOpen={(d) => openDay(d)}
        cell={(d) => {
          const i = info(d)
          return {
            tone: blockFill(DAY_TYPE_COLORS[i.type], brightness),
            title: i.title,
            marks: i.marks.map((x) => (
              <span key={x} className="rounded-sm bg-bg/60 px-1">
                {x}
              </span>
            ))
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel px-3 py-2" data-testid="calendar-actions">
        <span className="text-[12px] text-muted">Zaznaczone dni: {sel.size} (przeciągnij albo klikaj z Ctrl; zwykłe kliknięcie otwiera plan dnia)</span>
        <span className="flex-1" />
        {DAY_TYPES.map((t) => (
          <button key={t} type="button" className="btn" disabled={!sel.size} onClick={() => void setType(t)} data-testid={`calendar-type-${t}`}>
            {DAY_TYPE_NAMES[t]}
          </button>
        ))}
        <button type="button" className="btn" disabled={!sel.size} onClick={() => void setType(null)} data-testid="calendar-type-default">
          Typ z tygodnia
        </button>
        <span className="inline-flex items-center gap-1.5">
          <TimeField value={wake} range={RANGES.wakeMin} onCommit={setWake} className="w-[76px]" aria-label="Pobudka zaznaczonych dni" placeholder="pobudka" />
          <button type="button" className="btn" disabled={!sel.size || wake == null} onClick={() => void setWakeOf(wake)}>
            Ustaw pobudkę
          </button>
          <button type="button" className="btn" disabled={!sel.size} onClick={() => void setWakeOf(null)}>
            Pobudka z typu
          </button>
        </span>
      </div>
      {ask[0] && (
        <Dialog title="Analiza tygodniowa" onClose={() => void answerAnalysis(ask[0]!, false)} data-testid="ask-analysis">
          <p className="text-[12.5px]">
            Sobota {plDate(addDays(ask[0].friday, 1))} to zjazd. Przenieść analizę tygodniową na piątek {plDate(ask[0].friday)} 20:00–21:00, w miejsce drugiej zmiany? Aplikacja pyta o to raz.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => void answerAnalysis(ask[0]!, false)}>
              Nie
            </button>
            <button type="button" className="btn btn-accent" onClick={() => void answerAnalysis(ask[0]!, true)} data-testid="ask-analysis-yes">
              Tak, przenieś
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
