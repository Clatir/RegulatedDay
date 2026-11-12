/**
 * Kalendarz (D295): the month as a grid – every day in its type's colour with its marks („zjazd”, free, a holiday, an
 * early close of the market, the week of the session shift, its own wake); several dates are selected by dragging or
 * with Ctrl and get a type or a wake at once; a click on a day opens its plan. Marking a Saturday as a „zjazd” asks
 * once whether the weekly analysis goes to Friday 20:00–21:00 instead of the second shift (spec „Typy dni i szablony”).
 * „Wczytaj PDF zjazdów” (D357) reads a schedule into a preview you correct; only „Zapisz” writes the days (the same
 * question for a Saturday), its toast has „Cofnij”.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RawRecord, ZjazdSaveResult, ZjazdUndoDay } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayRaw } from '@shared/data/dayEdits'
import { seriesOnDay } from '@shared/engine/series'
import { SERIES_MARK } from '@shared/seriesText'
import { zjazdTypeRaw } from '@shared/import/zjazdDay'
import { paths } from '@shared/data/paths'
import { sessionShiftMin, sessionWindow } from '@shared/engine/createDay'
import { logicalClock, plDate } from '@shared/format'
import type { ZjazdDay } from '@shared/import/zjazdy'
import { eventsOn } from '@shared/model/allDay'
import { dayFileFrom } from '@shared/model/plan'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn, type DayTypeId } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { addDays, weekday } from '@shared/time/zone'
import { Dialog } from '../../components/Dialog'
import { TimeField } from '../../components/fields'
import { dayFilesNow, editNotice, editOf, isSaved, trySaveWith, useData } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { useMachine } from '../../store/machine'
import { openDay, toast, undoToast } from '../../store/ui'
import { setWakeOnDays } from '../today/dayActions'
import { analysisAsks, answerOf, type AnalysisAsk } from './analysisAsk'
import { DAY_TYPE_COLORS, holidayMarks } from './dayTypes'
import { gridDates, MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from './MonthGrid'
import { questionsText, savedText, skippedLines, undoList, undoneText, unchangedText } from './zjazdyDraft'
import { noteFriday, runInTurn, type PendingImport } from './zjazdyRun'
import { closeZjazdy, keepZjazdy, openZjazdy, useZjazdy } from './zjazdyStore'
import { ZjazdyPreviewPanel } from './ZjazdyPreview'

export function CalendarPage() {
  const { rd, templates, lectures, seriesPlans, stamp, allDay } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const brightness = useMachine((s) => s.prefs.brightness)
  const [month, setMonth] = useState(monthOf(today))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<Record<string, RawRecord | null>>({})
  const [ask, setAsk] = useState<AnalysisAsk[]>([])
  const importing = useZjazdy((s) => s.preview != null)
  /** The save of an import whose toast with „Cofnij” waits for the answers about the weekly analysis (they go back with it). */
  const pending = useRef<PendingImport | null>(null)
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
  const [busy, run] = useBusy()
  /** The days' files changed by `next`, each in its turn from the file as it is then (T517); one save at a time. */
  const saveDays = (dates: readonly string[], next: (raw: RawRecord, date: string) => RawRecord, onBefore?: (date: string, before: RawRecord | null) => void) =>
    run(() =>
      trySaveWith(async () => {
        const now = await dayFilesNow(dates, (d) => files[d] ?? null)
        for (const d of dates) onBefore?.(d, now[d] ?? null)
        return dates.map((d) => editOf(paths.day(d), now[d] ?? null, next(dayRaw(now[d], d), d)))
      })
    ).then((out) => out ?? null)

  const info = (d: string) => {
    const s = settingsOn(rd.settings, d)
    const own = fileOf(d)
    const type: DayTypeId = own?.dayType ?? s.weekTypes[weekday(d) - 1]!
    const marks: string[] = []
    if (own?.dayType) marks.push(DAY_TYPE_NAMES[type].replace('Zjazd ', 'zjazd ').toLowerCase())
    const holidays = holidayMarks(d)
    marks.push(...holidays.marks)
    if (s.sessions.some((x) => {
      const w = sessionWindow(x, d)
      return w != null && sessionShiftMin(x, w.start) !== 0
    }))
      marks.push('sesje −1 h')
    if (own?.wakeMin != null) marks.push(`pobudka ${logicalClock(own.wakeMin)}`)
    // A day with an occurrence of a series (D404) – the grid shows no blocks, only the mark.
    if (seriesOnDay(seriesPlans, d, type, own, marketDay)) marks.push(SERIES_MARK)
    return { type, own: own?.dayType != null, marks, title: holidays.names.join(', ') || undefined }
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
    // A type that is no „zjazd” takes a day's import away in the same edit (its classes, the commute it moved).
    if (!isSaved(await saveDays(list, (r, d) => zjazdTypeRaw(r, d, t)))) return
    setSel(new Set())
    // A Saturday marked as a „zjazd”: the weekly analysis to Friday – asked once, here or in Friday's morning plan.
    if (t === 'zjazd-stacjonarny' || t === 'zjazd-zdalny') setAsk(await analysisAsks(list, { changes: rd.settings, templates, lectures, series: seriesPlans, dayType: t, fallback: fileOf }))
  }

  const setWakeOf = async (v: number | null) => {
    // The blocks you placed move with the wake, once (D334); one „Cofnij” for all the days.
    if (await run(() => setWakeOnDays([...sel].filter((d) => d >= today), today, (d) => files[d] ?? null, v))) setSel(new Set())
  }

  const answerAnalysis = async (a: AnalysisAsk, yes: boolean) => {
    const seen: { before: RawRecord | null } = { before: null }
    const out = await saveDays([a.friday], (r) => answerOf(r, a, yes), (_d, before) => (seen.before = before))
    if (!isSaved(out)) return
    // An answer after an import – „Tak” and „Nie” (its `asked`) alike: Friday goes back with it (its file as it stands
    // now, read in the turn of the saves, is what „Cofnij” checks it against).
    if (pending.current) await noteFriday(pending.current, a.friday, seen.before)
    const rest = ask.filter((x) => x !== a)
    setAsk(rest)
    if (!rest.length) savedToast()
  }

  /** „Wczytaj PDF zjazdów”: a file picked in the dialog of Windows, read into the preview; nothing is saved (D357). */
  const readPdf = () =>
    run(async () => {
      try {
        const r = await window.rd.zjazdyRead()
        if (!r) return
        if (!r.ok) toast(r.error, 'error', 12_000)
        else openZjazdy(r.preview)
      } catch (e) {
        toast(`Nie wczytano pliku: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
      }
    })

  /** What is to be said after a save or a „Cofnij”: the days left as they are with their reasons, questions, the outcomes. */
  const reportResult = (out: ZjazdSaveResult, skippedLabel: string) => {
    const q = questionsText(out)
    const skipped = skippedLines(out)
    if (q || skipped.length) toast([q, skipped.length ? `${skippedLabel}: ${skipped.join('; ')}` : null].filter(Boolean).join(' '), 'info', 12_000)
    const notice = editNotice(out.outcomes)
    if (notice) toast(notice.text, notice.kind, 8000)
  }

  /** „Zapisano N dni zjazdów · Cofnij” – after the answers about the weekly analysis, which the „Cofnij” takes back too. */
  const savedToast = () => {
    const p = pending.current
    pending.current = null
    const text = p && savedText(p.out)
    if (!p || !text) return
    undoToast(text, () => void undoImport(undoList(p.out.undo, p.fridays), p.fridays.map((f) => f.date), p.lost))
  }

  /** The days of the import as the preview was corrected, saved in the turn of the window's saves (T517). */
  const saveImport = (days: ZjazdDay[]) =>
    run(async () => {
      let out: ZjazdSaveResult
      try {
        out = await runInTurn(() => window.rd.zjazdySave(days))
      } catch (e) {
        toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
        return
      }
      // The days that could not be read now stay in the preview to be saved again; none left – it closes.
      keepZjazdy(out.skipped.filter((x) => x.reason === 'unreadable').map((x) => x.date))
      const unchanged = unchangedText(out)
      if (unchanged) toast(unchanged, 'info', 6000)
      reportResult(out, 'Pominięte')
      // A Saturday imported as a „zjazd”: the same question about the weekly analysis as when it is marked here; the toast
      // with „Cofnij” comes once it is answered, so that the answer goes back with the import.
      pending.current = { out, fridays: [], lost: [] }
      const asks = out.undo.length ? await analysisAsks(out.undo.map((u) => u.date), { changes: rd.settings, templates, lectures, series: seriesPlans }).catch(() => []) : []
      setAsk(asks)
      if (!asks.length) savedToast()
    })

  /** „Cofnij” of the toast: the days back as before the import (and the answers) – a day changed since stays as it is, with the reason. */
  const undoImport = async (undo: ZjazdUndoDay[], fridays: string[], lost: string[]) => {
    try {
      const out = await runInTurn(() => window.rd.zjazdyUndo(undo))
      toast(undoneText(out, fridays, lost), 'info', lost.length ? 10_000 : 6000)
      reportResult(out, 'Bez zmian')
    } catch (e) {
      toast(`Nie cofnięto: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    }
  }

  const [y, m] = month.split('-')
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="calendar">
      {importing && <ZjazdyPreviewPanel busy={busy} onSave={(days) => void saveImport(days)} onCancel={closeZjazdy} />}
      {!importing && (
        <>
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
            <button type="button" className="btn" disabled={busy} onClick={() => void readPdf()} data-testid="calendar-zjazdy">
              Wczytaj PDF zjazdów
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
                events: eventsOn(allDay, d),
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
              <button key={t} type="button" className="btn" disabled={!sel.size || busy} onClick={() => void setType(t)} data-testid={`calendar-type-${t}`}>
                {DAY_TYPE_NAMES[t]}
              </button>
            ))}
            <button type="button" className="btn" disabled={!sel.size || busy} onClick={() => void setType(null)} data-testid="calendar-type-default">
              Typ z tygodnia
            </button>
            <span className="inline-flex items-center gap-1.5">
              <TimeField value={wake} range={RANGES.wakeMin} onCommit={setWake} shellClassName="w-[76px]" aria-label="Pobudka zaznaczonych dni" placeholder="pobudka" />
              <button type="button" className="btn" disabled={!sel.size || wake == null || busy} onClick={() => void setWakeOf(wake)}>
                Ustaw pobudkę
              </button>
              <button type="button" className="btn" disabled={!sel.size || busy} onClick={() => void setWakeOf(null)}>
                Pobudka z typu
              </button>
            </span>
          </div>
        </>
      )}
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
