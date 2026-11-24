/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” in the window (D540–D550): the chosen days read in the turn of the save without
 * counting them (`plannedDay` – the plan, the snapshot, the facts of the log and the file with your queued edits; a few at a time), the
 * engine's `applyTemplate` / `revokeTemplate` on each file, ONE edit of all the days, and the line of „Szablony” with one „Cofnij” for the
 * days that were saved (`undoDayEdits` – a day changed since stays); a day that waits for an answer or was refused is said in the line
 * (T1904). Before the save `askedDays` says which days ask „Uzupełnij luki czy nadpisz plan?”, at the hours the window's choice gives
 * (`ApplyChoice`, D546). With blocks gone by added as done (D547) the edit goes with their facts in ONE step of the main process
 * (`applyTemplateDays`): a day stands whole or is as before (its change not saved – „zastosuj jeszcze raz”, T1956); the line counts what it
 * took, the blocks it did not take „bez zaliczenia” with why, a closed day „punkty przeliczono” (D550). Its „Cofnij” asks the main process first which blocks stay (changed since – `judgeTemplateUndo`), then takes the
 * files and the facts back in one step (`undoTemplateDays`). Without a DOM.
 */
import type { EditEntry, EditOutcome, RawRecord, TemplateApplyResult, TemplateDoneAsk, TemplateUndoAsk, TemplateUndoJudged, TemplateUndoResult } from '@shared/api'
import { dayBlocks, dayRaw, isRaw, putRawBlock, setCancelled, setSessionAnswer, type Raw } from '@shared/data/dayEdits'
import { editStands, inverseEdit, setAt } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { sessionBlockId } from '@shared/engine/createDay'
import { begunIds, stayingIds } from '@shared/engine/facts'
import { applyTemplate, asksMode, cancelledIn, foregroundRuns, judgeApply, noneLeft, revokeTemplate, type ApplyDay, type ApplyMode, type ApplyTiming, type DayRun, type DoneSkipWhy, type LeftCount } from '@shared/engine/templateApply'
import { countLabel, plDate, plural } from '@shared/format'
import { keptText } from '@shared/groupText'
import type { Template } from '@shared/model/plan'
import { logicalDayOf, logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { BROKEN_FILE_TEXT, editOf, outcomeFate, readDayFiles, trySaveWith, type EditSender, type SendState } from '../../store/data'
import { plannedDay } from '../../store/day'
import type { DayEdit } from '../../store/dayUndo'
import { showGroupLine, UndoNotDone } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { undoDayEdits } from '../calendar/dayGroup'

/** At most this many days at once (a year and a day – every day is read in the turn of the save). */
export const APPLY_DAYS_MAX = 366
/** Days read at once (each one is a read of its logs in the main process). */
const READ_AT_ONCE = 8

/** What the window of today and the days gone by chose (D546); the day and the minute of now are taken at the save (`timingAt`). */
export type ApplyChoice = Pick<ApplyTiming, 'hours' | 'past'>
/** The choice of each opening of the window, and of days after today (where it changes nothing). */
export const DEFAULT_CHOICE: ApplyChoice = { hours: 'plan', past: 'done' }

/** The choice as the engine takes it at `at`: today and its minute now. */
export function timingAt(choice: ApplyChoice, at: number): ApplyTiming {
  const today = logicalDayOf(at)
  return { ...choice, today, nowMin: Math.floor(logicalMinuteOf(today, at)) }
}

/** The window of today and the days gone by asks (D546): today or a day before it is among the chosen. */
export const asksTiming = (dates: readonly string[], today: string): boolean => dates.some((d) => d <= today)

/** Its title: „Zastosuj „Trening” do dziś”, „… do 12.11.2026”, „… do 3 dni”. */
export function timingTitle(name: string, dates: readonly string[], today: string): string {
  const to = dates.length === 1 ? (dates[0] === today ? 'dziś' : plDate(dates[0]!)) : `${dates.length} dni`
  return `Zastosuj „${name}” do ${to}`
}

/** `fn` over `items`, at most `n` at a time, the results in their order. */
async function inPortions<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))))
  return out
}

/**
 * The runs in the foreground of today and yesterday as the main process judges them in its step (`dayRuns` – the day as the bar shows it,
 * with the ends the app's close made, T1951); of an older day – its facts are all there is (nothing is laid over them).
 */
async function runsOf(date: string, facts: Parameters<typeof foregroundRuns>[0], at: number): Promise<DayRun[]> {
  const today = logicalDayOf(at)
  if (date !== today && date !== addDays(today, -1)) return foregroundRuns(facts, date)
  try {
    return (await window.rd.dayRuns(date)) ?? foregroundRuns(facts, date)
  } catch {
    return foregroundRuns(facts, date)
  }
}

/** The days as the apply reads them, and the dates it cannot read now (its file, or its logs not read whole). */
export async function readApplyDays(dates: readonly string[], at: number): Promise<{ days: ApplyDay[]; unreadable: string[] }> {
  const read = await inPortions(dates, READ_AT_ONCE, async (d) => {
    const p = await plannedDay(d, at)
    return typeof p === 'string' ? p : { ...p, runs: await runsOf(d, p.facts, at) }
  })
  const days: ApplyDay[] = []
  const unreadable: string[] = []
  dates.forEach((date, i) => {
    const p = read[i]!
    if (typeof p === 'string') return void unreadable.push(date)
    const begun = begunIds(p.facts)
    const off = new Set([...stayingIds(p.facts)].filter((id) => !begun.has(id)))
    // The buffers of decompression (T2458) are no collision: the day lays them again after the template.
    days.push({ date, plan: p.ctx.basePlan ?? p.ctx.plan, snapshot: p.ctx.snapshot, raw: p.file as ApplyDay['raw'], begun, off, runs: p.runs })
  })
  return { days, unreadable }
}

/** Which days ask „Uzupełnij luki czy nadpisz plan?” (D541) – no blocks of the template yet and one of them collides at the hours chosen. */
export async function askedDays(t: Template, dates: readonly string[], choice: ApplyChoice = DEFAULT_CHOICE, at = Date.now()): Promise<string[]> {
  const { days } = await readApplyDays(dates, at)
  const timing = timingAt(choice, at)
  return days.filter((d) => asksMode(judgeApply(t, d, timing))).map((d) => d.date)
}


/** What a change of days did, for the line. */
export interface DaysDone {
  edits: DayEdit[]
  days: number
  blocks: number
  cancelled: number
  skipped: number
  begun: number
  /** Days the template has nothing for (its version without blocks). */
  empty: number
  unreadable: string[]
  /** Days read (not `unreadable`). */
  read: number
  waiting: number
  refused: number
  /** The edit was sent, but what became of it is not known (the window failed after): nothing to retry, nothing to take back. */
  unknown?: boolean
  /** Template blocks left out before the plan was asked, by why (D547–D549). */
  left: LeftCount
  /** The blocks gone by to be written as done, of the days saved (D547). */
  doneDays: Array<{ date: string; ids: string[] }>
  /** Of them, the blocks the main process wrote as done. */
  asDone: number
  /** The others of them – in the plan, not done („bez zaliczenia”), each with why. */
  unscored: DoneSkipWhy[]
  /** The events it wrote, by day – what „Cofnij” takes back with the files; `pending` – the day's entry waits for the folder (D552). */
  facts: Array<{ date: string; written: string[]; pending?: string }>
  /** Days closed (the ritual) or frozen that got blocks as done: their points counted again (D550). */
  closedDays: string[]
  /** Days whose change the queue did not take (taken out whole, T1959) with why – „zastosuj jeszcze raz”. */
  notSaved?: Array<{ date: string; why: string }>
  /** Days whose change waits for the folder (D552): their facts are written once it is laid. */
  deferred?: string[]
  /** Days whose points are counted again at a later check (the grade could not be written now, T1952). */
  regradeLater?: string[]
  /** Days whose points could not be counted again, and no later check will (T1961). */
  regradeFailed?: string[]
}

const none = (): DaysDone => ({ edits: [], days: 0, blocks: 0, cancelled: 0, skipped: 0, begun: 0, empty: 0, unreadable: [], read: 0, waiting: 0, refused: 0, left: noneLeft(), doneDays: [], asDone: 0, unscored: [], facts: [], closedDays: [], notSaved: [], deferred: [], regradeLater: [], regradeFailed: [] })

export interface DayChange {
  raw: RawRecord
  blocks: number
  cancelled?: number
  skipped?: number
  begun?: number
  empty?: boolean
  left?: LeftCount
  /** The blocks brought in as done (D547). */
  done?: string[]
}

/** A day as the change made it: its edit (none – nothing to write) and what it did. */
export interface DayRow {
  edit: DayEdit | null
  r: DayChange
}

/**
 * What the change did, counted only of the days that stand (T1908): a day saved, or one with nothing to write (its skipped and begun
 * blocks still count); a day whose edit became a question or was refused – only its count („czeka na odpowiedź”, „niezapisany”).
 * `out` – the outcomes of the edits, in the order of the rows with an edit.
 */
export function tallyDays(rows: readonly DayRow[], out: readonly EditOutcome[], unreadable: readonly string[]): DaysDone {
  const d = { ...none(), unreadable: [...unreadable], read: rows.length }
  let i = 0
  for (const { edit, r } of rows) {
    if (r.empty) d.empty++
    if (edit) {
      const o = out[i++]
      // Taken out of the queue whole by the step (T1956): the day is as it was.
      if (o?.status === 'withdrawn') {
        d.notSaved!.push({ date: edit.date, why: o.why ?? 'changed' })
        continue
      }
      const fate = outcomeFate(o)
      if (fate === 'asked') {
        d.waiting++
        continue
      }
      if (fate === 'refused') {
        d.refused++
        continue
      }
      d.edits.push(edit)
      d.days++
      d.blocks += r.blocks
      d.cancelled += r.cancelled ?? 0
      if (r.done?.length) d.doneDays.push({ date: edit.date, ids: [...r.done] })
    }
    d.skipped += r.skipped ?? 0
    d.begun += r.begun ?? 0
    for (const k of Object.keys(d.left) as Array<keyof LeftCount>) d.left[k] += r.left?.[k] ?? 0
  }
  return d
}

/** The blocks gone by of the rows to be done, each day with the place of its entry among those sent (`changeDays`). */
export function doneAsks(rows: readonly DayRow[]): TemplateDoneAsk[] {
  const out: TemplateDoneAsk[] = []
  let entry = 0
  for (const { edit, r } of rows) {
    if (!edit) continue
    if (r.done?.length) out.push({ day: edit.date, ids: [...r.done], entry })
    entry++
  }
  return out
}

/**
 * What the main process did with the facts (`applyTemplateDays`): of the days saved – the blocks done, the others „bez zaliczenia”, the
 * closed days (counted again, or later); the facts that stand (of any day – also those a failed step could not take back) – for „Cofnij”.
 */
export function scoreFacts(d: DaysDone, r: Pick<TemplateApplyResult, 'facts'>): DaysDone {
  for (const f of r.facts) {
    if (d.edits.some((e) => e.date === f.day)) {
      d.asDone += f.taken.length
      d.unscored.push(...f.skipped.map((s) => s.why))
      if (f.closed && f.taken.length && !f.regradeFailed) d.closedDays.push(f.day)
      if (f.regradeFailed && f.taken.length) (f.regradeLater ? d.regradeLater! : d.regradeFailed!).push(f.day)
      if (f.pending) d.deferred!.push(f.day)
    }
    if (f.written.length || f.pending) d.facts.push({ date: f.day, written: [...f.written], ...(f.pending ? { pending: f.pending } : {}) })
  }
  return d
}

/** One edit of every day `change` rewrites (`via` – what sends it: `edit`, or a step that writes more with it). Null – nothing was sent (the toast said why). */
async function changeDays(dates: readonly string[], change: (day: ApplyDay) => DayChange, at: number, via?: (rows: readonly DayRow[]) => EditSender): Promise<DaysDone | null> {
  let rows: DayRow[] = []
  let unreadable: string[] = []
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(
    async () => {
      const read = await readApplyDays(dates, at)
      unreadable = read.unreadable
      rows = read.days.map((day) => {
        const r = change(day)
        const entry = r.blocks || r.cancelled ? editOf(paths.day(day.date), (day.raw ?? null) as RawRecord | null, r.raw) : null
        return { edit: entry ? { date: day.date, entry, made: entry.create ? r.raw : null } : null, r }
      })
      return rows.flatMap((x) => (x.edit ? [x.edit.entry] : []))
    },
    state,
    via ? (list) => via(rows)(list) : undefined
  )
  if (out) return tallyDays(rows, out, unreadable)
  return state.afterSend ? { ...none(), unknown: true } : null
}

const daysWord = (n: number) => countLabel(n, 'dzień', 'dni', 'dni')
const blocksWord = (n: number) => countLabel(n, 'blok', 'bloki', 'bloków')

/** Why the queue did not take a day's change (T1959), in the words of the line. */
const NOT_SAVED_WORD: Record<string, string> = { changed: 'zmieniony na innym komputerze', removed: 'usunięty na innym komputerze', behind: 'czeka na odpowiedź na wcześniejsze pytanie' }

/** The tail of the line: days not read, waiting for an answer, refused, not saved (with why), waiting for the folder. */
function tail(d: Pick<DaysDone, 'unreadable' | 'waiting' | 'refused'> & Partial<Pick<DaysDone, 'notSaved' | 'deferred'>>): string {
  const parts: string[] = []
  if (d.waiting) parts.push(`${daysWord(d.waiting)} ${plural(d.waiting, 'czeka', 'czekają', 'czeka')} na odpowiedź`)
  if (d.refused) parts.push(`${daysWord(d.refused)} ${plural(d.refused, 'niezapisany', 'niezapisane', 'niezapisanych')}`)
  if (d.unreadable.length) parts.push(`nie odczytano: ${d.unreadable.map(plDate).join(', ')}`)
  for (const why of new Set((d.notSaved ?? []).map((x) => x.why))) {
    const dates = d.notSaved!.filter((x) => x.why === why).map((x) => plDate(x.date)).join(', ')
    parts.push(why === 'broken' ? `${dates}: nie zapisano – ${BROKEN_FILE_TEXT}` : `${dates}: nie zapisano (${NOT_SAVED_WORD[why] ?? why}) – zastosuj jeszcze raz`)
  }
  if (d.deferred?.length) parts.push(`${daysWord(d.deferred.length)} ${plural(d.deferred.length, 'czeka', 'czekają', 'czeka')} na folder – zaliczenia dopiszą się po zapisie`)
  return parts.map((p) => ` · ${p}`).join('')
}

/** Why template blocks were left out, in the words of the line (D541, D547–D549). */
const LEFT_WORD: Record<keyof LeftCount, string> = { past: 'minione', ran: 'w tym czasie coś trwało', outOfDay: 'poza dobą' }
/** Why a block asked to be done was not (D547): in the plan, „bez zaliczenia”. */
const UNSCORED_WORD: Record<DoneSkipWhy, string> = { ran: 'w tym czasie coś trwało', begun: 'już się zaczął', notPast: 'jeszcze trwa', notInPlan: 'nie ma go w planie' }

/** „N bez zaliczenia (why, why)” – the reasons once each, in the order they came. */
function unscoredText(list: readonly DoneSkipWhy[]): string {
  return `${list.length} bez zaliczenia (${[...new Set(list)].map((w) => UNSCORED_WORD[w]).join(', ')})`
}

/** „1 dzień był zamknięty – punkty przeliczono” (D550). */
const closedText = (n: number): string => `${daysWord(n)} ${plural(n, 'był zamknięty', 'były zamknięte', 'było zamkniętych')} – punkty przeliczono`

/**
 * The line after „Zastosuj”: „„Trening” – 5 dni: dodano 12 bloków (w tym 2 zrealizowane) · odwołano 2 · pominięto 3 (kolizja) ·
 * pominięto 1 (minione) · 1 bez zaliczenia (w tym czasie coś trwało) · 1 dzień był zamknięty – punkty przeliczono”.
 */
export function appliedText(
  name: string,
  d: Pick<DaysDone, 'days' | 'blocks' | 'cancelled' | 'skipped' | 'unreadable' | 'waiting' | 'refused' | 'left' | 'asDone'> & Partial<Pick<DaysDone, 'unscored' | 'closedDays' | 'notSaved' | 'deferred'>>
): string {
  const done = d.asDone ? ` (w tym ${d.asDone} ${plural(d.asDone, 'zrealizowany', 'zrealizowane', 'zrealizowanych')})` : ''
  const parts = [`dodano ${blocksWord(d.blocks)}${done}`]
  if (d.cancelled) parts.push(`odwołano ${d.cancelled}`)
  if (d.skipped) parts.push(`pominięto ${d.skipped} (kolizja)`)
  for (const k of Object.keys(LEFT_WORD) as Array<keyof LeftCount>) if (d.left[k]) parts.push(`pominięto ${d.left[k]} (${LEFT_WORD[k]})`)
  if (d.unscored?.length) parts.push(unscoredText(d.unscored))
  if (d.closedDays?.length) parts.push(closedText(d.closedDays.length))
  return `„${name}” – ${daysWord(d.days)}: ${parts.join(' · ')}${tail(d)}`
}

/** The line after „Odwołaj”: „„Trening” odwołany – 3 dni: 9 bloków · 2 zostały – już trwają”. */
export function revokedText(name: string, d: Pick<DaysDone, 'days' | 'blocks' | 'begun' | 'unreadable' | 'waiting' | 'refused'>): string {
  const begun = d.begun ? ` · ${d.begun} ${plural(d.begun, 'został – już trwa', 'zostały – już trwają', 'zostało – już trwają')}` : ''
  return `„${name}” odwołany – ${daysWord(d.days)}: ${blocksWord(d.blocks)}${begun}${tail(d)}`
}

/** Why nothing changed („Zastosuj”), in the window's corner. */
export function nothingAppliedText(d: DaysDone): string {
  if (d.waiting || d.refused || d.notSaved?.length) return `Nic nie zapisano${tail(d)}`
  if (!d.read) return `Nie da się teraz odczytać ${d.unreadable.length === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.empty === d.read) return `Szablon nie ma bloków na ${d.read === 1 ? 'ten dzień' : 'te dni'}${tail(d)}`
  const why = [
    d.skipped ? `bloki szablonu kolidują z planem (${d.skipped})` : '',
    d.left.past ? `bloki szablonu już minęły (${d.left.past})` : '',
    d.left.ran ? `w tym czasie trwały inne bloki (${d.left.ran})` : '',
    d.left.outOfDay ? `od teraz nie mieszczą się w dobie (${d.left.outOfDay})` : ''
  ].filter(Boolean)
  if (why.length) return `Nic nie dodano – ${why.join(' · ')}${tail(d)}`
  return `${d.read === 1 ? 'Ten dzień ma' : 'Te dni mają'} już cały szablon${tail(d)}`
}

/** Why nothing changed („Odwołaj”). */
export function nothingRevokedText(d: DaysDone): string {
  if (d.waiting || d.refused) return `Nic nie zapisano${tail(d)}`
  if (!d.read) return `Nie da się teraz odczytać ${d.unreadable.length === 1 ? 'tego dnia' : 'tych dni'}${tail(d)}`
  if (d.begun) return `Nic nie odwołano – bloki szablonu już trwają (${d.begun})${tail(d)}`
  return `${d.read === 1 ? 'W tym dniu' : 'W tych dniach'} nie ma bloków tego szablonu${tail(d)}`
}

/**
 * Shows what became of a change: the line with „Cofnij”, or why nothing changed. True – the window may close: something was saved, a day
 * waits for its answer (never sent twice – the answer decides), nothing was to be done, or the result is unknown after the send. False –
 * nothing was written for good (refused, a change not saved and taken back whole, or not sent): the window stays for another try.
 */
export function tell(d: DaysDone | null, line: (d: DaysDone) => string, why: (d: DaysDone) => string, undo: (d: DaysDone) => Promise<string | void> = (x) => undoDayEdits(x.edits)): boolean {
  if (!d) return false
  if (d.unknown) return true
  if (!d.days) {
    const failed = d.refused > 0 || (d.notSaved?.length ?? 0) > 0
    toast(why(d), d.waiting || failed ? 'error' : 'info', 8000)
    return d.waiting > 0 || !failed
  }
  showGroupLine('template', { text: line(d), undo: () => undo(d) })
  // A day not saved: the days' window stays with its choice for another „Zastosuj”.
  return !d.notSaved?.length
}

/**
 * The inverse of a day's edit that leaves `keep` – blocks with an event since the facts (D313) – in the day as they are: the file after
 * the inverse, with the blocks of `now` (the file now) put back, not cancelled unless `now` cancels them (`cancelled` as a map or a list)
 * and with the answer of their session as `now` has it (a „nie” is not brought back). Null – nothing to change.
 */
export function keepBlocks(inverse: EditEntry, now: RawRecord | null, keep: readonly string[], date: string): EditEntry | null {
  const after = inverse.remove ? null : inverse.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, inverse.create ? {} : { ...(now ?? {}) })
  let raw = dayRaw(after as Raw | null, date)
  const was = dayRaw(now as Raw | null, date)
  const answers = (x: Raw): Raw => (isRaw(x.sessions) ? x.sessions : {})
  for (const id of keep) {
    const b = dayBlocks(was).find((x) => isRaw(x) && x.id === id)
    if (b) raw = putRawBlock(raw, b as Raw)
    if (cancelledIn(raw, id) && !cancelledIn(was, id)) raw = setCancelled(raw, id, false)
    const session = Object.keys({ ...answers(was), ...answers(raw) }).find((s) => sessionBlockId(date, s) === id)
    if (session && answers(raw)[session] !== answers(was)[session]) {
      const a = answers(was)[session]
      raw = setSessionAnswer(raw, session, a === 'yes' || a === 'no' ? a : null)
    }
  }
  return editOf(paths.day(date), now, raw as RawRecord)
}

/**
 * „Cofnij” of „Zastosuj” with facts (D547): the main process says first which blocks stay as they are (an event of the block since – D313;
 * a refusal of any day – nothing is taken back, the line stays); then, in the window's turn, each day that still stands as the change left
 * it gets the inverse of its edit (keeping those blocks) and its facts go back with it – one step of the main process (`undoTemplateDays`);
 * a day whose change still waits for the folder – its entry taken out of the queue (D552). A day changed since stays as it is, blocks and
 * facts. A day whose inverse did not go in (`notUndone`) stays in the line for another „Cofnij”; what was taken back leaves it.
 */
async function undoApplied(d: DaysDone): Promise<string | void> {
  if (!d.facts.length) return undoDayEdits(d.edits)
  const fail = (why: string): never => {
    toast(`Nie cofnięto: ${why}`, 'error', 6000)
    throw new UndoNotDone()
  }
  let judged: TemplateUndoJudged
  try {
    judged = await window.rd.judgeTemplateUndo(d.facts.map((f) => ({ day: f.date, written: f.written, ...(f.pending ? { pending: f.pending } : {}) })))
  } catch (e) {
    judged = { ok: false, why: e instanceof Error ? e.message : String(e) }
  }
  if (!judged.ok) return fail(judged.why)
  const keptBy = new Map(judged.kept.map((k) => [k.day, k.blocks]))
  const changed: string[] = []
  let unreadable = false
  let asks: TemplateUndoAsk[] = []
  let told: Array<{ day: string; blocks: string[] }> = []
  let result: TemplateUndoResult | null = null
  const out = await trySaveWith(
    async () => {
      const files = await readDayFiles(d.edits.map((e) => e.date))
      const back: EditEntry[] = []
      changed.length = 0
      asks = []
      told = []
      const ask = (day: string, entry: number | null) => {
        const f = d.facts.find((x) => x.date === day)
        if (!f) return
        asks.push({ day, written: f.written, entry, ...(f.pending ? { pending: f.pending } : {}) })
        told.push({ day, blocks: keptBy.get(day) ?? [] })
      }
      for (const e of d.edits) {
        if (!(e.date in files)) {
          unreadable = true
          return []
        }
        const now = files[e.date] ?? null
        const inverse = editStands(e.entry, now, e.made) ? inverseEdit(e.entry, now, e.made) : null
        if (!inverse) {
          // A day whose entry still waits for the folder is taken back by taking the entry out (D552) – whatever its file shows.
          if (d.facts.some((f) => f.date === e.date && f.pending)) ask(e.date, null)
          else changed.push(e.date)
          continue
        }
        const keep = keptBy.get(e.date) ?? []
        const entry = keep.length ? keepBlocks(inverse, now, keep, e.date) : inverse
        ask(e.date, entry ? back.length : null)
        if (entry) back.push(entry)
      }
      for (const f of d.facts) if (!d.edits.some((e) => e.date === f.date)) ask(f.date, null)
      // Only facts to take back (no file): the step goes without an edit of the files.
      if (!back.length && asks.length) result = await window.rd.undoTemplateDays([], asks, told)
      return back
    },
    undefined,
    async (list) => {
      result = await window.rd.undoTemplateDays(list, asks, told)
      return result.ok ? result.outcomes : []
    }
  )
  // A day that cannot be read now is not „changed since”: nothing is written and the line waits (as `undoDayEdits`).
  if (unreadable) throw new Error('not saved')
  if (!out) throw new UndoNotDone()
  const r = result as TemplateUndoResult | null
  if (r && !r.ok) return fail(r.why)
  if (r?.ok) regradeToasts(r.regradeLater, r.regradeFailed)
  // Blocks that stay as they are: changed since (judged before) and still in the plan after the inverse (a field met a change, T1956).
  const keptCount = judged.kept.reduce((n, k) => n + k.blocks.length, 0) + (r?.ok ? r.undone.reduce((n, u) => n + u.stayed.length, 0) : 0)
  const words = [keptCount ? keptText(keptCount, 'block') : '', changed.length ? keptText(changed.length, 'day') : '', r?.ok && r.closed.length ? closedText(r.closed.length) : ''].filter(Boolean)
  // What was taken back (or stays as it is since) leaves the line; a day whose inverse did not go in stays for another „Cofnij”.
  const again = new Set(r?.ok ? r.notUndone : [])
  d.edits = d.edits.filter((e) => again.has(e.date))
  d.facts = d.facts.filter((f) => again.has(f.date))
  if (again.size) {
    toast([`${[...again].map(plDate).join(', ')}: nie cofnięto (plik zajęty albo zmieniony na innym komputerze) – „Cofnij” spróbuje jeszcze raz`, ...words].join(' · '), 'error', 10000)
    throw new UndoNotDone()
  }
  return words.length ? words.join(' · ') : undefined
}

/** What the closed days' points became, when not „przeliczono” (T1961): counted at a later check, or not at all – said as it is. */
function regradeToasts(later: readonly string[], failed: readonly string[]): void {
  if (later.length) toast(`Punkty zamkniętego dnia przeliczą się przy następnym sprawdzeniu (${later.map(plDate).join(', ')})`, 'info', 10000)
  if (failed.length) toast(`Punktów zamkniętego dnia nie przeliczono (${failed.map(plDate).join(', ')}) – zastosuj szablon jeszcze raz`, 'error', 10000)
}

/**
 * „Zastosuj”: `mode` for the days that ask (`askedDays`); the others fill the gaps. `choice` – today and the days gone by (D546). With blocks
 * to be done the edit goes with their facts in one step (`applyTemplateDays`; a day waiting for the folder gets them once laid, D552); else
 * as any edit.
 */
export async function applyToDays(t: Template, dates: readonly string[], mode: ApplyMode, choice: ApplyChoice = DEFAULT_CHOICE, at = Date.now()): Promise<boolean> {
  const timing = timingAt(choice, at)
  let result: TemplateApplyResult | null = null
  const d = await changeDays(
    dates,
    (day) => {
      const j = judgeApply(t, day, timing)
      const r = applyTemplate(t, day, mode, j)
      return { raw: r.raw as RawRecord, blocks: r.added, cancelled: r.cancelled, skipped: r.skipped, left: r.left, done: r.done, empty: j.total === 0 }
    },
    at,
    (rows) => {
      const asks = doneAsks(rows)
      if (!asks.length) return (list) => window.rd.edit(list)
      return async (list) => {
        const r = await window.rd.applyTemplateDays(list, asks.map((a) => ({ ...a, template: t.id, choice: { ...choice } })))
        result = r
        return r.outcomes
      }
    }
  )
  const r = result as TemplateApplyResult | null
  if (d && !d.unknown && r) scoreFacts(d, r)
  if (d) regradeToasts(d.regradeLater ?? [], d.regradeFailed ?? [])
  return tell(d, (x) => appliedText(t.name, x), nothingAppliedText, undoApplied)
}

/** „Odwołaj ten szablon w…”: its blocks out of the chosen days (begun ones stay). */
export async function revokeInDays(t: Template, dates: readonly string[], at = Date.now()): Promise<boolean> {
  const d = await changeDays(
    dates,
    (day) => {
      const r = revokeTemplate(t, day)
      return { raw: r.raw as RawRecord, blocks: r.removed, begun: r.begun }
    },
    at
  )
  return tell(d, (x) => revokedText(t.name, x), nothingRevokedText)
}
