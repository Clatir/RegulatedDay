/**
 * „To wolne (urlop, wyjazd)” of an all-day event (D405): which of its days the bar offers „Wolne” for (from today, not
 * „Wolne” already, not closed – `freeDaysToAsk`), and „Tak” – the type „Wolne” for those days by the same rules as a change
 * of type anywhere else, as one write with one „Cofnij”. A day to come takes the type in its file as in „Kalendarz”
 * (`zjazdTypeRaw`); today before the day is made – as in „Dziś” before the day is made (`TypeChangeDialog`: the file's
 * type, the weekday's own one as none). Today once made is the change during the day (`planTypeChange` with its
 * proposals and its events in the log, without a „Cofnij”): it is not in this write – the answer names it (`duringDay`),
 * the window opens its own change of type for it.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { dayRaw, setDayField } from '@shared/data/dayEdits'
import { editStands, inverseEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { defaultDayType } from '@shared/engine/createDay'
import { plDateWithWeekday } from '@shared/format'
import { zjazdTypeRaw } from '@shared/import/zjazdDay'
import { freeCandidateDays, freeDaysToAsk, type AllDayEvent, type FreeDayInfo } from '@shared/model/allDay'
import { dayFileFrom } from '@shared/model/plan'
import { settingsOn } from '@shared/model/settings'
import { editOf, isSaved, saveAnswer, trySaveWith, useData, type SendState } from '../../store/data'
import { dropAllDayLine, narrowFreeLine, useAllDayLines } from '../../store/allDayLine'
import { countDay, dayTypeNow, dayUsable } from '../../store/day'
import { toast } from '../../store/ui'

/** A day for the proposal: its type now, closed, and – today – made already (its type changes during the day). */
export interface FreeDay extends FreeDayInfo {
  duringDay: boolean
}

/** Today as „Dziś” counts it now (null: it cannot be read now). */
async function todayDay(today: string): Promise<FreeDay | null> {
  try {
    const data = await window.rd.dayData(today)
    if (!dayUsable(data)) return null
    const { rd, templates, lectures, seriesPlans, view } = useData.getState()
    const m = countDay(today, data, { changes: rd.settings, templates, lectures, series: seriesPlans }, Date.now(), rd.general.modules.energy, view?.calibration === true)
    return { type: dayTypeNow(m), closed: m.state.facts.closed != null, duringDay: m.fromLog }
  } catch {
    return null
  }
}

/** A day to come: the type of its file, or its weekday's by the settings of its date. */
function comingDay(raw: RawRecord | null, date: string): FreeDay {
  const own = raw ? dayFileFrom(raw, date).dayType : null
  return { type: own ?? defaultDayType(date, settingsOn(useData.getState().rd.settings, date)), closed: false, duringDay: false }
}

/** The most days one `dayFiles` answers (the main process reads no more at once): a longer list goes in these portions. */
export const DAY_FILES_MAX = 62

/** The files of `dates` as `window.rd.dayFiles` gives them, read in portions of `DAY_FILES_MAX`; a day missing from the answer cannot be read now. */
async function readDayFiles(dates: readonly string[]): Promise<Record<string, RawRecord | null>> {
  const out: Record<string, RawRecord | null> = {}
  for (let i = 0; i < dates.length; i += DAY_FILES_MAX) Object.assign(out, await window.rd.dayFiles(dates.slice(i, i + DAY_FILES_MAX)))
  return out
}

/**
 * The days from today among `dates` as they are now; a day that cannot be read now is not there – today too: it is read by
 * the same road „Tak” reads it (`dayFiles`), so what is asked about is what „Tak” can write.
 */
export async function freeDayInfos(dates: readonly string[], today: string): Promise<Record<string, FreeDay>> {
  const out: Record<string, FreeDay> = {}
  const coming = [...new Set(dates)].filter((d) => d > today)
  const withToday = dates.includes(today)
  let files: Record<string, RawRecord | null> = {}
  try {
    const want = withToday ? [today, ...coming] : coming
    files = want.length ? await readDayFiles(want) : {}
  } catch {
    /* the days not known now: none of them is offered */
    return out
  }
  for (const d of coming) if (d in files) out[d] = comingDay(files[d] ?? null, d)
  if (withToday && today in files) {
    const t = await todayDay(today)
    if (t) out[today] = t
  }
  return out
}

/** The days to offer „Wolne” for after `e` was saved (none when it is not „To wolne”). */
export async function askFreeDays(e: AllDayEvent, today: string): Promise<string[]> {
  const dates = freeCandidateDays(e, today)
  if (!dates.length) return []
  const info = await freeDayInfos(dates, today)
  return freeDaysToAsk(e, today, (d) => info[d] ?? null)
}

/** What „Tak” wrote: each day's one edit of its file and the file it created – for the one „Cofnij”. */
export interface FreeDaysChange {
  days: Array<{ date: string; entry: EditEntry; made: RawRecord | null }>
}

export interface FreeDaysResult {
  /** Every edit sent went through (written, or waiting for the folder). */
  saved: boolean
  /** The save met a change from another computer (or its result is not known): it became a question at the top of the window – „Tak” again would only repeat it. */
  asked: boolean
  /** The days written (null: none). */
  change: FreeDaysChange | null
  /** Today, made already: its change of type is the one during the day – not done here. */
  duringDay: string | null
  /** The days left alone because their file cannot be read now (the toast said so). */
  unreadable: string[]
}

/**
 * Whether the question „Wolne” may close after „Tak” answered `r`: not when nothing was written (the save failed, or every
 * day was unreadable – its toast has said why; „Tak” can be tried again). Some days written, today left to the dialog, a save
 * that became a question of its own (`asked` – the toast at the top of the window says so), or nothing left to do (a saved
 * answer with no day unreadable) – it closes.
 */
export const freeAnswerSettled = (r: FreeDaysResult): boolean => r.change != null || r.duringDay != null || r.asked || (r.saved && r.unreadable.length === 0)

const unreadableText = (dates: readonly string[]): string =>
  dates.length === 1 ? `Typ dnia ${plDateWithWeekday(dates[0]!)} się nie zmienił – plik tego dnia jest teraz nieczytelny.` : `Typ dni ${dates.map(plDateWithWeekday).join(', ')} się nie zmienił – ich pliki są teraz nieczytelne.`

/**
 * „Tak”: the type „Wolne” for `dates` (the days from today on; earlier ones are left), all in one write in its turn, each
 * day from its file as it is then. A day that cannot be read now is left with a word why; today once made is left for the
 * change during the day (`duringDay`).
 */
export async function setFreeDays(dates: readonly string[], today: string): Promise<FreeDaysResult> {
  const list = [...new Set(dates)].filter((d) => d >= today).sort()
  const sent: FreeDaysChange['days'] = []
  const unreadable: string[] = []
  let duringDay: string | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    // Every day's file is read in this turn, today's too (in portions of `DAY_FILES_MAX`): a day missing from the answer is one that cannot be read now – never no file.
    const files = list.length ? await readDayFiles(list) : {}
    for (const d of list) {
      if (!(d in files)) {
        unreadable.push(d)
        continue
      }
      const raw = files[d] ?? null
      let after: RawRecord
      if (d === today) {
        const t = await todayDay(today)
        if (!t) {
          unreadable.push(d)
          continue
        }
        // Today turned „Wolne” or closed since the question: nothing to ask about it any more.
        if (t.closed || t.type === 'wolne') continue
        if (t.duringDay) {
          duringDay = d
          continue
        }
        const weekdayType = defaultDayType(d, settingsOn(useData.getState().rd.settings, d))
        after = setDayField(dayRaw(raw, d), 'dayType', weekdayType === 'wolne' ? null : 'wolne')
      } else after = zjazdTypeRaw(dayRaw(raw, d), d, 'wolne')
      const entry = editOf(paths.day(d), raw, after)
      if (entry) sent.push({ date: d, entry, made: entry.create ? after : null })
    }
    return sent.map((x) => x.entry)
  }, state)
  if (unreadable.length) toast(unreadableText(unreadable), 'error', 8000)
  const days = out ? sent.filter((_, i) => out[i]?.status === 'applied' || out[i]?.status === 'waiting') : []
  return { saved: isSaved(out), asked: saveAnswer(out, state) === 'asked', change: days.length ? { days } : null, duringDay, unreadable }
}

export interface FreeDaysUndone {
  saved: boolean
  /** The days given their type back. */
  undone: string[]
  /** The days changed since (also elsewhere): they stay as they are now. */
  changed: string[]
  /** The days whose file cannot be read now (their „Cofnij” is still to be done). */
  unreadable: string[]
}

/**
 * The one „Cofnij” of „Tak”: every day that still stands as it left it gets its file back (a file it created goes) in one
 * write; a day changed since stays as it is now, with a word.
 */
export async function undoFreeDays(change: FreeDaysChange): Promise<FreeDaysUndone> {
  const r: FreeDaysUndone = { saved: false, undone: [], changed: [], unreadable: [] }
  const back: string[] = []
  const out = await trySaveWith(async () => {
    const files = await readDayFiles(change.days.map((d) => d.date))
    const edits: EditEntry[] = []
    for (const d of change.days) {
      if (!(d.date in files)) {
        r.unreadable.push(d.date)
        continue
      }
      const now = files[d.date] ?? null
      const edit = editStands(d.entry, now, d.made) ? inverseEdit(d.entry, now, d.made) : null
      if (edit) {
        edits.push(edit)
        back.push(d.date)
      } else r.changed.push(d.date)
    }
    return edits
  })
  out?.forEach((o, i) => {
    if (o.status === 'applied' || o.status === 'waiting') r.undone.push(back[i]!)
  })
  r.saved = isSaved(out)
  if (!r.saved) return r
  if (r.changed.length) toast('Część dni zmieniła się od ustawienia „Wolne” – zostaje tak, jak jest teraz.', 'info', 6000)
  if (r.unreadable.length) toast(`Nie cofnięto typu: ${r.unreadable.map(plDateWithWeekday).join(', ')} – plik jest teraz nieczytelny. Spróbuj za chwilę.`, 'error', 6000)
  return r
}

/**
 * „Cofnij” of the line „Wolne” (D406): the days that still stand as it left them are given back; the line ends once nothing is
 * left to take back – a day whose file cannot be read now stays on it (with the days only it names) until its „Cofnij” is
 * done or the 15 minutes are out. A save that failed leaves the line as it is; one written only in part (a day met a change
 * from another computer) takes from the line the days it did give back.
 */
export async function undoFreeLine(which: number): Promise<void> {
  const line = useAllDayLines.getState().lines.find((l) => l.seq === which)
  if (!line || line.kind !== 'free') return
  const r = await undoFreeDays(line.change)
  if (!r.saved) {
    if (r.undone.length) narrowFreeLine(which, line.change.days.map((d) => d.date).filter((d) => !r.undone.includes(d)))
    return
  }
  if (r.unreadable.length) narrowFreeLine(which, r.unreadable)
  else dropAllDayLine(which)
}
