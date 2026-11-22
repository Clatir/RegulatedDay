/**
 * Kalendarz (D295): the month as a grid – every day in its type's colour with its marks („zjazd”, free, a holiday, an
 * early close of the market, the week of the session shift, its own wake); several dates are selected by dragging, with Ctrl or Shift
 * (`useSelection`, D527: Shift+arrows, Ctrl+A for the month, Esc) and get a type or a wake at once – from the bar or from the menu of the
 * right button (D528); a change of two days or more says „Zmieniono N dni · Cofnij” (D529); a click on a day opens its plan.
 * Every day also shows up to three bars of its all-day events, fixed blocks and flexible blocks, „+N” for all the rest it holds
 * and the dot of its load (D418, D422, D429 – `useMonthView`, `monthCellView`).
 * „Wczytaj PDF zjazdów” (D357) reads a schedule into a preview you correct; only „Zapisz” writes the days, its toast has
 * „Cofnij”.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { groupCount, groupLineText } from '@shared/groupText'
import type { RawRecord, ZjazdSaveResult, ZjazdUndoDay } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayRaw } from '@shared/data/dayEdits'
import { seriesOnDay } from '@shared/engine/series'
import { SERIES_MARK } from '@shared/seriesText'
import { zjazdTypeRaw } from '@shared/import/zjazdDay'
import { paths } from '@shared/data/paths'
import { sessionShiftMin, sessionWindow } from '@shared/engine/createDay'
import { knownSessionDefs } from '@shared/model/templateSessions'
import { logicalClock, plDate } from '@shared/format'
import type { ZjazdDay } from '@shared/import/zjazdy'
import { eventsOn } from '@shared/model/allDay'
import { dayFileFrom, type Template } from '@shared/model/plan'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn, type DayTypeId } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { addDays, weekday } from '@shared/time/zone'
import type { MonthDay } from '@shared/engine/calendarViews'
import { calendarSieve } from '@shared/model/calendars'
import { useCalendarFilter } from '../calendars/calendarFilter'
import { CalendarChips } from '../calendars/CalendarChips'
import { useVisibleAllDayIn } from '../calendars/visibleViews'
import { ContextMenu } from '../../components/ContextMenu'
import { TimeField } from '../../components/fields'
import { GroupLine } from '../../components/GroupLine'
import { dayFilesNow, editNotice, editOf, isSaved, readDayFiles, trySaveWith, useData } from '../../store/data'
import { useBusy } from '../../lib/busy'
import { useSelection } from '../../lib/useSelection'
import { showGroupLine } from '../../store/groupLine'
import { movedDay, type WeekPushedDay } from '../../store/weekPush'
import { useMonthView } from '../../store/horizon'
import { useMachine } from '../../store/machine'
import { openDay, setBlockDraft, setMemory, toast, undoToast, useUi } from '../../store/ui'
import { useNewShortcut } from '../../lib/escape'
import { usePeriodKeys } from '../../lib/periodKeys'
import { NewBlockPopover } from '../week/NewBlockPopover'
import { NEW_BLOCK_WIDTH, popoverPlace } from '../week/weekLayout'
import { dayWakeMin, freeHourStart, newBlockDay, NO_NEW_DAY_TEXT, type BusySpan } from '../week/weekNew'
import { DEFAULT_NEW_BLOCK_MIN } from '../plan/gridCreate'
import { logicalMinuteOf } from '@shared/time/day'
import { setWakeOnDays } from '../today/dayActions'
import { DAY_TYPE_COLORS, holidayMarks } from './dayTypes'
import { emptyMonthDay, monthCellView, visibleMonthDay } from './monthCellView'
import { gridDates, MONTH_NAMES, MonthGrid, monthOf, shiftMonth } from './MonthGrid'
import { questionsText, savedText, skippedLines, undoneText, unchangedText } from './zjazdyDraft'
import { undoDayEdits } from './dayGroup'
import { useApplyFlow } from '../templates/ApplyTemplate'
import { dayMenu, type MenuDay } from './dayMenu'
import { runInTurn } from './zjazdyRun'
import { closeZjazdy, keepZjazdy, openZjazdy, useZjazdy } from './zjazdyStore'
import { ZjazdyPreviewPanel } from './ZjazdyPreview'

/** The dates of `grid` – the days from its first to its last – widened over `reach` (the first and the last selected day) when it lies outside. */
function daysBetween(grid: readonly string[], reach: { lo: string; hi: string } | null): readonly string[] {
  const lo = reach && reach.lo < grid[0]! ? reach.lo : grid[0]!
  const hi = reach && reach.hi > grid.at(-1)! ? reach.hi : grid.at(-1)!
  if (lo === grid[0] && hi === grid.at(-1)) return grid
  const out: string[] = []
  for (let d = lo; d <= hi; d = addDays(d, 1)) out.push(d)
  return out
}

export function CalendarPage() {
  const { rd, seriesPlans, stamp, routines, requests, templates } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const brightness = useMachine((s) => s.prefs.brightness)
  // The month is the session's (D2, UX8: `useUi.memory` – coming back from a day of „Dziś” finds it); null – the current one.
  const thisMonth = monthOf(today)
  const month = useUi((s) => s.memory.month) ?? thisMonth
  const setMonth = (m: string) => setMemory({ month: m === thisMonth ? null : m })
  const [files, setFiles] = useState<Record<string, RawRecord | null>>({})
  const importing = useZjazdy((s) => s.preview != null)
  // The small window of a new block (Ctrl+N, below): while it is open the keys of the month wait.
  // The blocks of a day outside the month's view are being read for the window (Ctrl+N, below): the keys of the month wait for the answer too.
  const [asking, setAsking] = useState(false)
  const [fresh, setFresh] = useState<{ seq: number; date: string; startMin: number; place: { left: number; top: number } } | null>(null)
  // PgUp / PgDn / Home (D6, P8): the month before, the next, the current one.
  usePeriodKeys({ prev: () => setMonth(shiftMonth(month, -1)), next: () => setMonth(shiftMonth(month, 1)), today: () => setMonth(thisMonth) }, !importing && !fresh && !asking)
  const [wake, setWake] = useState<number | null>(null)
  const dates = useMemo(() => gridDates(month), [month])
  // The selection of days (D527): kept across months (a day of another month stays selected), Ctrl+A takes the days of the month shown.
  const monthDates = useMemo(() => dates.filter((d) => d.startsWith(month)), [dates, month])
  // The order of Shift+click and Shift+arrows: the days by date from the grid's first to its last – and over every selected day outside the
  // grid (another month), so a range reaches over months as it always did.
  const [reach, setReach] = useState<{ lo: string; hi: string } | null>(null)
  const order = useMemo(() => daysBetween(dates, reach), [dates, reach])
  const selection = useSelection({ order, all: monthDates, arrows: 'grid', prune: false, enabled: !importing })
  useEffect(() => {
    const ids = selection.selected
    const next = ids.length ? { lo: ids.reduce((a, b) => (b < a ? b : a)), hi: ids.reduce((a, b) => (b > a ? b : a)) } : null
    setReach((prev) => (prev?.lo === next?.lo && prev?.hi === next?.hi ? prev : next))
  }, [selection.selected])
  // The menu of the right button: its days, where, and the files of the days the grid has not read (a selected day of another month).
  const [menu, setMenu] = useState<{ dates: readonly string[]; at: { x: number; y: number }; read: Record<string, RawRecord | null> } | null>(null)
  const menuAsked = useRef(0)
  // The blocks (all of them, D429) and the load of each day of the month (D418), counted by the main process; the days of the neighbouring
  // months on the grid have their all-day events only.
  const { view: monthView } = useMonthView(month)
  // D419, D425: the cells leave out the blocks and all-day events of the unchecked calendars (the dot of the load stays as counted);
  // „ukryte: N” = the blocks of the month and the events of the grid they take out.
  const hiddenCalendars = useCalendarFilter((s) => s.hidden)
  const { shown: shownEvents, hiddenInRange: hiddenEvents } = useVisibleAllDayIn(dates[0]!, dates.at(-1)!)
  const { monthDays, hiddenBlocks } = useMemo(() => {
    const days = new Map<string, MonthDay>()
    let hiddenBlocks = 0
    // The hidden calendars and the calendar of each category are resolved once for the month, not for each day.
    const sieve = calendarSieve(hiddenCalendars, rd)
    for (const d of monthView?.days ?? []) {
      const v = visibleMonthDay(d, sieve)
      days.set(d.date, v.day)
      hiddenBlocks += v.hiddenCount
    }
    return { monthDays: days, hiddenBlocks }
  }, [monthView, hiddenCalendars, rd])
  useEffect(() => {
    let alive = true
    // The grid's days, with the day before it and the day after its end.
    void window.rd.dayFiles([addDays(dates[0]!, -1), ...dates, addDays(dates.at(-1)!, 1)]).then((f) => alive && setFiles(f))
    return () => {
      alive = false
    }
  }, [dates, stamp])
  const fileOf = (d: string) => (files[d] ? dayFileFrom(files[d], d) : null)
  const [saving, run] = useBusy()
  // UX19 (P28): „Zastosuj szablon ▸” of the menu – the flow of „Zastosuj do…” (its windows stand here, the menu is gone by then).
  const apply = useApplyFlow()
  const busy = saving || apply.busy
  // Ctrl+N (D6, P9): the small window of a new block today – or on the first day of the grid from today – at the nearest free hour, beside its cell.
  const root = useRef<HTMLDivElement>(null)
  const freshSeq = useRef(0)
  const askSeq = useRef(0)
  // What the screen shows now – an answer that comes late looks at it (the month moved by a button, an import opened).
  const shown = useRef({ month, importing })
  useLayoutEffect(() => {
    shown.current = { month, importing }
  })
  useNewShortcut(() => {
    if (importing || fresh || asking) return
    // Today when it is on the grid (also in a neighbouring month's cells); else the first day of the month shown from today (the other days of the grid have events only).
    const date = dates.includes(today) ? today : newBlockDay(monthDates, today)
    if (!date) return void toast(NO_NEW_DAY_TEXT)
    const open = (blocks: readonly BusySpan[]) => {
      const own = fileOf(date)
      const wakeMin = dayWakeMin(settingsOn(rd.settings, date), date, { wakeMin: own?.wakeMin ?? null, dayType: own?.dayType ?? null })
      const startMin = freeHourStart(blocks, { isToday: date === today, nowMin: logicalMinuteOf(date, Date.now()), wakeMin }, DEFAULT_NEW_BLOCK_MIN)
      const box = root.current?.getBoundingClientRect()
      const at = root.current?.querySelector(`[data-testid="day-${date}"]`)?.getBoundingClientRect()
      const place = box && at ? popoverPlace({ gridWidth: box.width, colLeft: at.left - box.left, colRight: at.right - box.left, top: at.top - box.top, width: NEW_BLOCK_WIDTH }) : { left: 0, top: 0 }
      setFresh({ seq: ++freshSeq.current, date, startMin, place })
    }
    // The blocks as counted for the month (before the calendar filter); a day of another month is not in that view – its blocks are read as the week's are.
    const known = monthView?.days.find((d) => d.date === date)?.blocks
    if (known) return open(known)
    const seq = ++askSeq.current
    const asked = month
    setAsking(true)
    // `Promise.resolve().then`: a call that throws at once is a failed read too (no blocks), never a wait that does not end.
    void Promise.resolve()
      .then(() => window.rd.daysView([date], { energy: false }))
      .then((v) => v.days[0]?.blocks ?? [])
      .catch((): BusySpan[] => [])
      .then((blocks) => {
        setAsking(false)
        // The month moved on (the button), an import opened, the page left: the day is not on the screen – no window for it.
        if (root.current && seq === askSeq.current && shown.current.month === asked && !shown.current.importing) open(blocks)
      })
  })
  const namesOf = (d: string) => ({ rd, settings: settingsOn(rd.settings, d), routines, requests })
  /** The menu opens once the files of its days are known: the ✓ and „—” are of the days as they are, whichever month they are in. */
  const openMenu = (ids: readonly string[], at: { x: number; y: number }) => {
    const asked = ++menuAsked.current
    const missing = ids.filter((d) => !(d in files))
    if (!missing.length) return setMenu({ dates: ids, at, read: {} })
    readDayFiles(missing)
      .catch(() => ({}) as Record<string, RawRecord | null>)
      .then((read) => asked === menuAsked.current && setMenu({ dates: ids, at, read }))
  }
  /**
   * The days' files changed by `next`, each in its turn from the file as it is then (T517); one save at a time. With the days that really
   * changed and what each edit was (for the „Cofnij” of a group).
   */
  const saveDays = (dates: readonly string[], next: (raw: RawRecord, date: string) => RawRecord) => {
    let done: WeekPushedDay[] = []
    return run(() =>
      trySaveWith(async () => {
        const now = await dayFilesNow(dates, (d) => files[d] ?? null)
        done = []
        return dates.map((d) => {
          const after = next(dayRaw(now[d], d), d)
          const edit = editOf(paths.day(d), now[d] ?? null, after)
          done.push(...movedDay(d, edit, after))
          return edit
        })
      })
    ).then((out) => ({ out: out ?? null, days: done }))
  }

  const info = (d: string) => {
    const s = settingsOn(rd.settings, d)
    const own = fileOf(d)
    const type: DayTypeId = own?.dayType ?? s.weekTypes[weekday(d) - 1]!
    const marks: string[] = []
    if (own?.dayType) marks.push(DAY_TYPE_NAMES[type].replace('Zjazd ', 'zjazd ').toLowerCase())
    const holidays = holidayMarks(d)
    marks.push(...holidays.marks)
    // Every session known that day – of the templates (D511) and of the layer.
    if (knownSessionDefs(s, templates, d).some((x) => {
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
  const setType = async (t: DayTypeId | null, from: readonly string[] = selection.selected) => {
    const all = [...from].sort()
    const list = all.filter((d) => d > today)
    // The days left out are said once: by the line of the group when it comes (D529), else by this toast.
    const said = () => {
      if (list.length < all.length)
        toast(
          all.includes(today) ? 'Typ dzisiejszego dnia zmienisz w „Dziś” (przycisk typu u góry) – z propozycjami zmiany w trakcie dnia. Dni minione mają typ z planu z rana.' : 'Dni minione mają typ z planu z rana – zmieniają się tylko dni od jutra.',
          'info',
          10_000,
          all.includes(today) ? { label: 'Otwórz Dziś', run: () => openDay(null) } : undefined
        )
    }
    if (!list.length) return said()
    // A type that is no „zjazd” takes a day's import away in the same edit (its classes, the commute it moved).
    const { out, days } = await saveDays(list, (r, d) => zjazdTypeRaw(r, d, t))
    // Two days or more changed: the line of the group with its „Cofnij” (D529) – the days left out counted with their reasons.
    if (isSaved(out) && days.length >= 2) showGroupLine('calendar', { text: groupLineText({ n: days.length, kind: 'day', skipped: all.filter((d) => d <= today).map((d) => (d === today ? 'dzisiejszy' : 'miniony')) }), undo: () => undoDayEdits(days) })
    else said()
    // One day: no line of a group, the toast with its „Cofnij” instead (D563 – the same `undoDayEdits`: the type back and the classes of a „zjazd” the change took away).
    if (isSaved(out) && days.length === 1) undoToast(`Typ dnia ${plDate(days[0]!.date)}: ${t ? DAY_TYPE_NAMES[t] : 'z tygodnia'}`, () => void undoOneDay(days))
    if (!isSaved(out)) return
    selection.clear()
  }

  /** „Cofnij” of the toast of one day's type: what stayed (changed since) is said as the line of a group says it; a write that failed says so. */
  const undoOneDay = async (days: readonly WeekPushedDay[]) => {
    try {
      const kept = await undoDayEdits(days)
      if (kept) toast(kept, 'info', 6000)
    } catch {
      toast('Nie cofnięto – zapis się nie udał.', 'error', 8000)
    }
  }

  const setWakeOf = async (v: number | null, from: readonly string[] = selection.selected) => {
    // The blocks you placed move with the wake, once (D334); one „Cofnij” for all the days – the line of the group (D529) for two days or more.
    const past = from.filter((d) => d < today)
    const group = ({ changed, undo }: { changed: number; undo: () => Promise<string | void> }) => showGroupLine('calendar', { text: groupLineText({ n: changed, kind: 'day', skipped: past.map(() => 'miniony') }), undo })
    if (await run(() => setWakeOnDays(from.filter((d) => d >= today), today, (d) => files[d] ?? null, v, group))) selection.clear()
  }

  // The actions of the menu are always the page's latest (the items live in a memo).
  const actions = useRef({ setType, setWakeOf, apply: apply.start })
  actions.current = { setType, setWakeOf, apply: apply.start }
  const menuActions = useMemo(() => ({ setType: (t: DayTypeId | null, ids: readonly string[]) => void actions.current.setType(t, ids), setWake: (v: number | null, ids: readonly string[]) => void actions.current.setWakeOf(v, ids), applyTemplate: (t: Template, ids: readonly string[]) => void actions.current.apply(t, ids) }), [])
  /** What each day of the menu is, from the grid's files and the ones read for the menu – once per change, not per item. */
  const menuDays = useMemo(() => {
    if (!menu) return null
    const src = { ...files, ...menu.read }
    return new Map<string, MenuDay>(
      menu.dates.map((d) => {
        const own = src[d] ? dayFileFrom(src[d], d) : null
        return [d, { type: own?.dayType ?? settingsOn(rd.settings, d).weekTypes[weekday(d) - 1]!, own: own?.dayType != null, wake: own?.wakeMin ?? null }]
      })
    )
  }, [menu, files, rd])
  const menuEntries = useMemo(() => (menu && menuDays ? dayMenu(menu.dates, menuDays, today, busy, menuActions, templates) : null), [menu, menuDays, today, busy, menuActions, templates])

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

  /** „Zapisano N dni zjazdów · Cofnij”. */
  const savedToast = (out: ZjazdSaveResult) => {
    const text = savedText(out)
    if (text) undoToast(text, () => void undoImport(out.undo))
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
      savedToast(out)
    })

  /** „Cofnij” of the toast: the days back as before the import – a day changed since stays as it is, with the reason. */
  const undoImport = async (undo: ZjazdUndoDay[]) => {
    try {
      const out = await runInTurn(() => window.rd.zjazdyUndo(undo))
      toast(undoneText(out), 'info', 6000)
      reportResult(out, 'Bez zmian')
    } catch (e) {
      toast(`Nie cofnięto: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    }
  }

  const [y, m] = month.split('-')
  return (
    <div ref={root} className="relative flex flex-col gap-3 p-4" data-testid="calendar" data-counted={monthView ? 'true' : undefined}>
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
            {/* One rule of „dziś” on every screen of periods (D6): always there, off where you already are. */}
            <button type="button" className="btn" disabled={month === thisMonth} onClick={() => setMonth(thisMonth)} data-testid="month-today">
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
          <CalendarChips hiddenCount={hiddenBlocks + hiddenEvents} />
          <GroupLine view="calendar" />
          <MonthGrid
            month={month}
            today={today}
            selection={selection}
            onContext={openMenu}
            onOpen={(d) => openDay(d)}
            cell={(d) => {
              const i = info(d)
              return {
                tone: blockFill(DAY_TYPE_COLORS[i.type], brightness),
                title: i.title,
                events: eventsOn(shownEvents, d),
                detail: monthCellView(monthDays.get(d) ?? emptyMonthDay(d), shownEvents, { rd, settings: settingsOn(rd.settings, d), routines, requests }, brightness),
                marks: i.marks.map((x) => (
                  <span key={x} className="rounded-sm bg-bg/60 px-1">
                    {x}
                  </span>
                ))
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel px-3 py-2" data-testid="calendar-actions">
            <span className="text-[12px] text-muted" data-testid="calendar-selection">Zaznaczone dni: {selection.count} (przeciągnij albo klikaj z Ctrl; zwykłe kliknięcie otwiera plan dnia)</span>
            <span className="flex-1" />
            {DAY_TYPES.map((t) => (
              <button key={t} type="button" className="btn" disabled={!selection.count || busy} onClick={() => void setType(t)} data-testid={`calendar-type-${t}`}>
                {DAY_TYPE_NAMES[t]}
              </button>
            ))}
            <button type="button" className="btn" disabled={!selection.count || busy} onClick={() => void setType(null)} data-testid="calendar-type-default">
              Typ z tygodnia
            </button>
            <span className="inline-flex items-center gap-1.5">
              <TimeField value={wake} range={RANGES.wakeMin} onCommit={setWake} shellClassName="w-[76px]" aria-label="Pobudka zaznaczonych dni" placeholder="pobudka" />
              <button type="button" className="btn" disabled={!selection.count || wake == null || busy} onClick={() => void setWakeOf(wake)}>
                Ustaw pobudkę
              </button>
              <button type="button" className="btn" disabled={!selection.count || busy} onClick={() => void setWakeOf(null)}>
                Pobudka z typu
              </button>
            </span>
          </div>
        </>
      )}
      {fresh && !importing && (
        <NewBlockPopover
          key={fresh.seq}
          dates={[fresh.date]}
          startMin={fresh.startMin}
          durationMin={DEFAULT_NEW_BLOCK_MIN}
          dragged={false}
          today={today}
          namesOf={namesOf}
          place={fresh.place}
          onClose={() => setFresh(null)}
          onDates={() => undefined}
          onMore={(block) => {
            // The full editing of the day, the block not saved yet (the draft of „Dziś”, D461).
            setBlockDraft(fresh.date, block, true)
            setFresh(null)
            openDay(fresh.date)
          }}
        />
      )}
      {menu && menuEntries && <ContextMenu title={`Zmień ${groupCount(menu.dates.length, 'day')}`} at={menu.at} items={menuEntries} onClose={() => setMenu(null)} testId="calendar-menu" />}
      {apply.dialogs}
    </div>
  )
}
