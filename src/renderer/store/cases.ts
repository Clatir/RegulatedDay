/**
 * „Sprawy” in the main window (OPS2: D383, D384, D385, D402) – what the page „Sprawy”, the panel by the axis of „Dziś”
 * and the morning plan use: the lists as they read today (`useCases`), and every change as edits of the queue made in
 * its turn from the records and the days' files as they are then (T517) by the pure functions of `engine/cases.ts` – a
 * sprawa put on the axis and its block go as one edit (the day's file and the record), each change with what its
 * „Cofnij” needs. A refusal is said by a toast (as the other saves); the answer says whether it was saved.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CaseDays, EditOutcome, QuickShortcut, RawRecord } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { isRaw, putBlock, setCancelled } from '@shared/data/dayEdits'
import { nextTaskRaw } from '@shared/engine/caseRepeat'
import { copiedCase } from '@shared/engine/copy'
import { sameContentAs } from '@shared/data/merge'
import { classify, paths } from '@shared/data/paths'
import {
  caseDayToRead,
  caseItems,
  casePlan,
  listedRaw,
  morningPlan,
  patchedRaw,
  scheduledDays,
  taskAnswerRaw,
  todayMinutes,
  type CaseItem,
  type CasePatch,
  type GoneOf
} from '@shared/engine/cases'
import { dayWord, parseQuickWords } from '@shared/quickDates'
import { quickCategories } from '@shared/quickCategories'
import { LIST_MAX } from '@shared/quickList'
import { NOT_PLACED, notPlacedBefore, quickNowMin, quickSavedText } from '@shared/quickSaid'
import { newId } from '@shared/model/ids'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom, type CaseList, type NewTask, type RequestRecord } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { useNow } from '../lib/clock'
import { editOf, isSaved, rawRecord, saveAnswer, trySaveWith, useData, type SaveAnswer, type SendState } from './data'
import { toast, undoToast } from './ui'

const relOf = (id: string): string => paths.record('request', id)

/** Why nothing is written when a day's file cannot be read now (never taken for a day without a file). */
export const DAY_UNREADABLE = 'Pliku dnia nie da się teraz odczytać – nic nie zapisano, spróbuj za chwilę.'

/**
 * The days' files as this computer sees them now; a file not readable now – the one the window saw (`seen`), else
 * none of them (null: say `DAY_UNREADABLE`).
 */
export async function daysNow(dates: readonly string[], seen?: (date: string) => RawRecord | null | undefined): Promise<Record<string, RawRecord | null> | null> {
  const files = await window.rd.dayFiles([...new Set(dates)])
  const out: Record<string, RawRecord | null> = {}
  for (const d of dates) {
    if (d in files) out[d] = files[d] ?? null
    else {
      const known = seen?.(d)
      if (known === undefined) return null
      out[d] = known
    }
  }
  return out
}

/** The lists of „Sprawy” today. */
export interface CasesView {
  /** The logical day the lists are read on (04:00–04:00). */
  today: string
  items: CaseItem[]
  /** The sum of the estimates of „Dziś” (D402: „Dziś · 3 h 30 min” – `todayHeader`). */
  todayMinutes: number
  /** The days' files of the blocks were read (before: „zaplanowane” as the records say, without the hour). */
  ready: boolean
}

/** How often the days of „zaplanowane” are read again without a change of the data (another computer's log). */
const CASE_DAYS_REREAD_MS = 30_000

/**
 * One read of the days of „zaplanowane” for every view that asks for the same days at the same moment of the data (the
 * page, the panel by „Dziś”, the morning plan and the ritual share it – T760).
 */
let caseDaysRead: { key: string; read: Promise<CaseDays> } | null = null
function readCaseDays(key: string, dates: readonly string[]): Promise<CaseDays> {
  if (caseDaysRead?.key === key) return caseDaysRead.read
  const read = window.rd.caseDays([...dates])
  caseDaysRead = { key, read }
  read.catch(() => {
    if (caseDaysRead?.read === read) caseDaysRead = null
  })
  return read
}

/** The days' files and the blocks gone in their logs as `scheduledOf` reads them; unknown where not read. */
function readersOf(days: CaseDays | null): { fileOf: (date: string) => ReturnType<typeof dayFileFrom> | null | undefined; goneOf: GoneOf } {
  return {
    fileOf: (d) => (days == null || !(d in days.files) ? undefined : days.files[d] ? dayFileFrom(days.files[d], d) : null),
    goneOf: (d) => (days?.gone[d] ? new Set(days.gone[d]) : undefined)
  }
}

/**
 * The sprawy as the lists show them now: each with its list (the 04:00 of „Dziś” counted from the date), whether it is
 * „zaplanowane” – its block still in its day (not parked nor cancelled before it began), with the hour – its estimate, its
 * day of „Zrobione”. The days read are those of the sprawy not done with a block (`scheduledDays`, T766), once for every
 * view showing them, again with the data and every 30 s; the lists every minute (04:00 passes without a write).
 */
export function useCases(): CasesView {
  const requests = useData((s) => s.requests)
  const stamp = useData((s) => s.stamp)
  const now = useNow(CASE_DAYS_REREAD_MS)
  const today = logicalDayOf(now)
  const dates = useMemo(() => scheduledDays(requests), [requests])
  const key = `${stamp}|${Math.floor(now / CASE_DAYS_REREAD_MS)}|${dates.join(',')}`
  const [days, setDays] = useState<{ dates: string; read: CaseDays } | null>(null)
  useEffect(() => {
    let alive = true
    if (!dates.length) {
      setDays({ dates: '', read: { files: {}, gone: {}, begun: {} } })
      return
    }
    readCaseDays(key, dates).then(
      (read) => alive && setDays({ dates: dates.join(','), read }),
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [key])
  return useMemo(() => {
    const { fileOf, goneOf } = readersOf(days?.read ?? null)
    const items = caseItems(requests, today, fileOf, goneOf)
    return { today, items, todayMinutes: todayMinutes(items), ready: days != null && days.dates === dates.join(',') }
  }, [requests, today, days, dates])
}

/** A file of the undo of a change: before and after it (null: none). */
export interface CaseUndoFile {
  rel: string
  before: RawRecord | null
  after: RawRecord | null
  /**
   * The file this one goes with (T923: the next task of a task that repeats goes with its tick): its entry is laid only
   * after that file's – a question about it keeps this one waiting, „ich” takes it out with it; absent – on its own.
   */
  owner?: string
}

/** What a change of „Sprawy” did: saved (written or waiting for the folder), its edits' outcomes, its „Cofnij”. */
export interface CaseResult {
  saved: boolean
  /** Why nothing was written (a refusal of the fields) – said by a toast too; null: none. */
  error: string | null
  outcomes: EditOutcome[] | null
  /** The new sprawa's id (a new one), else null. */
  id: string | null
  /** „Cofnij” of this change (`undoCase`); empty when nothing was saved. */
  undo: CaseUndoFile[]
  /** D465: the id of the next task this change made (a task that repeats ticked off); null or absent – none. */
  next?: string | null
  /**
   * Whether the edits were handed to the queue (`SendState.afterSend`): no outcomes after it – the result is not known (the
   * folder may have it – `saveAnswer` says „asked”, never a refusal); absent – a result made without a send.
   */
  sent?: SendState
}

/**
 * What a change became for a field or a button (one reading for every screen of „Sprawy” and the steps): saved – true; a
 * refusal of ours (`error`) or nothing sent – false (the field gets its text back); sent and its answer not known (a failure
 * after the queue took it) or a question – `'asked'`: never given back, a second Enter would make it twice.
 */
export function caseAnswer(r: Pick<CaseResult, 'saved' | 'error' | 'outcomes' | 'sent'>): SaveAnswer {
  return r.saved ? true : r.error ? false : saveAnswer(r.outcomes, r.sent)
}

/**
 * Edits of several files in one turn: `make` puts each file's version before and after (a file put twice keeps its
 * first before) or says why nothing is written; saved together – one edit of the queue. `owner` – the file put before
 * this one that it goes with (`CaseUndoFile.owner`, T923); not written by this change – this one goes on its own.
 */
export async function change(make: (put: (rel: string, before: RawRecord | null, after: RawRecord | null, owner?: string) => void) => Promise<string | null> | string | null): Promise<CaseResult> {
  let error: string | null = null
  let undo: CaseUndoFile[] = []
  const sent: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = new Map<string, CaseUndoFile>()
    error = await make((rel, before, after, owner) => {
      const had = files.get(rel)
      const by = owner ?? had?.owner
      files.set(rel, { rel, before: had ? had.before : before, after, ...(by ? { owner: by } : {}) })
    })
    if (error) return []
    undo = [...files.values()].filter((f) => (f.before == null ? f.after != null : f.after == null || !sameContentAs(f.before, f.after)))
    const place = new Map(undo.map((f, i) => [f.rel, i]))
    return undo.map((f, i) => {
      const e = editOf(f.rel, f.before, f.after)
      const o = f.owner != null ? place.get(f.owner) : undefined
      // Places in this list; `sentEntries` follows them to the list sent (an owner with nothing to write – on its own).
      return e && o != null && o < i ? { ...e, after: [o] } : e
    })
  }, sent)
  if (error) toast(error, 'error', 6000)
  const saved = !error && isSaved(out)
  return { saved, error, outcomes: out, id: null, undo: saved ? undo : [], sent }
}

/** What `putTask` leaves of one line: its title as saved, and why its hour is not on the axis (D601) – none when it is, or none was asked for. */
interface TaskPut {
  title: string
  notPlaced?: string
}

/**
 * One new task put into the edit `put` belongs to (the one way `createTask` and `createTasks` go): the words at the title's end
 * (`parseQuickWords`) set the due date, the date of doing, the estimate and the subcategory and leave the title – a value given in `p`
 * wins over its word; the title left empty – `error`. „@jutro 15:00” (D601): the task is put on that day's axis in the same edit
 * (`casePlan`, as „Zaplanuj” of one sprawa, nothing pushed apart); `days` – the days' files as the lines before this one left them (a day
 * is read once for a list – the blocks of one day are one edit of its file): a day gone by or a file of the day that cannot be read
 * now – saved without a block, `notPlaced` says why (the hour of today already gone – D603; a date of doing given in `p`).
 */
async function putTask(put: PutFile, id: string, p: NewTask, at: number, days: Record<string, RawRecord | null>): Promise<{ error: string } | TaskPut> {
  const today = logicalDayOf(at)
  const rd = useData.getState().rd
  const q = parseQuickWords(p.title, today, quickCategories(rd, today), quickNowMin(today, at))
  // A date of doing given in `p` wins over its word; none (null, undefined) – the word's.
  const task = { ...p, title: q.title, dueDate: p.dueDate !== undefined ? p.dueDate : q.dueDate, doDate: p.doDate ?? q.doDate, estimateMin: p.estimateMin !== undefined ? p.estimateMin : q.estimateMin, categoryId: p.categoryId !== undefined ? p.categoryId : q.categoryId }
  const raw = newTask(id, at, today, task)
  if (!raw) return { error: 'Zadanie potrzebuje tytułu.' }
  const title = String(raw.title)
  if (q.startMin == null || !q.doDate) {
    put(relOf(id), null, raw)
    return { title }
  }
  // The hour belongs to the date of its word – another date given in `p` takes the place away with it, and the toast says so (D601); the same
  // date (or none) – the block stands as always.
  const date = q.doDate
  const gone = p.doDate != null && p.doDate !== date ? NOT_PLACED.dayGivenApart : notPlacedBefore(date, q.startMin, at)
  const r0 = requestFrom(raw)
  // The day of the axis cannot be read now (a failing call too) – nothing is read that the new sprawa has no part in: it has no old block.
  const read = !gone && r0 && !(date in days) ? await readPlanDays([r0], date).catch(() => null) : null
  const files = date in days ? days : (read?.days ?? null)
  const planned = !gone && r0 && files ? casePlan({ record: raw, date, startMin: q.startMin, files, rules: settingsOn(rd.settings, date).categories, at, begun: read?.begunOf ?? (() => undefined) }) : null
  if (planned && !('refused' in planned)) {
    put(paths.day(date), files![date] ?? null, planned.days[date]!)
    days[date] = planned.days[date]!
    put(relOf(id), null, planned.record, paths.day(date))
    return { title }
  }
  put(relOf(id), null, raw)
  return { title, notPlaced: gone ?? (!r0 || files ? NOT_PLACED.refused : NOT_PLACED.dayUnreadable) }
}

/**
 * A new task (D384: title required; 30 min, „Inne” by default; „Skrzynka” unless said). The words at the title's end („!jutro”,
 * „@pt” – D409; „1h30” – the estimate, „#anal” – the subcategory, D600, D602 – `parseQuickWords`; the field shows its `preview`
 * before Enter) set the due date, the date of doing, the estimate and the subcategory and leave the title – a value given in `p` wins over
 * its word. „@jutro 15:00” (D601): the task is put on that day's axis in the same edit (`putTask`; one „Cofnij” takes both); a day gone by or
 * a file of the day that cannot be read now – saved without a block, a toast says why (`notPlaced` of the result).
 */
export async function createTask(p: NewTask): Promise<CaseResult & { notPlaced?: string }> {
  const id = newId()
  const at = Date.now()
  const out: { put?: TaskPut } = {}
  const r = await change(async (add) => {
    const o = await putTask(add, id, p, at, {})
    if ('error' in o) return o.error
    out.put = o
    return null
  })
  const note = out.put
  if (r.saved && note?.notPlaced) toast(quickSavedText(note.title, { notPlaced: note.notPlaced }), 'info', 6000)
  return { ...r, id: r.saved ? id : null, ...(r.saved && note?.notPlaced ? { notPlaced: note.notPlaced } : {}) }
}

/** What a pasted list made (N11, D605, D606): the ids of its sprawy in the order of the lines, how many of them could not be put on the axis. */
export interface TasksResult extends CaseResult {
  ids: string[]
  /** The sprawy that asked for an hour on the axis and were saved without a block. */
  notPlaced: number
}

/**
 * A pasted list (N11, D605, D606): each line as `createTask` takes a title, at most `LIST_MAX` (the lines left without a title – only words –
 * are left out), all of it one edit: the records and the days' files of their blocks (each day once – the blocks of one day are one edit of its
 * file). One `change`, so one „Cofnij” (`undoGroup(result.undo)`: a sprawa changed since stays, a day's file changed since stays with its sprawy);
 * nothing saved (no title in any line, a refusal) – `saved` false, a toast says why.
 */
export async function createTasks(lines: readonly string[]): Promise<TasksResult> {
  const titles = lines.filter((l) => l.trim() !== '').slice(0, LIST_MAX)
  // The ids are made before the turn – a turn that runs again (a change in between) makes the same sprawy.
  const ids = titles.map(() => newId())
  const at = Date.now()
  let made: Array<{ id: string; notPlaced: boolean }> = []
  const r = await change(async (add) => {
    made = []
    const days: Record<string, RawRecord | null> = {}
    for (const [i, title] of titles.entries()) {
      const o = await putTask(add, ids[i]!, { title }, at, days)
      if (!('error' in o)) made.push({ id: ids[i]!, notPlaced: !!o.notPlaced })
    }
    return made.length ? null : 'Zadanie potrzebuje tytułu.'
  })
  return { ...r, ids: r.saved ? made.map((m) => m.id) : [], notPlaced: r.saved ? made.filter((m) => m.notPlaced).length : 0 }
}

/** A new request (a person, an estimate, a note – as before; „Skrzynka”). */
export async function createRequest(p: { person: string | null; estimateMin: number | null; note: string }): Promise<CaseResult> {
  const id = newId()
  const r = await change((put) => {
    put(relOf(id), null, newRequest(id, Date.now(), p))
    return null
  })
  return { ...r, id: r.saved ? id : null }
}

/** What the tick of a task that repeats says (D465): „Następne: „Podlać kwiaty” – wykonać jutro” (its „Cofnij” takes both back). */
export function nextTaskText(raw: RawRecord, today: string): string {
  const r = requestFrom(raw)
  const date = r?.doDate ?? r?.dueDate
  return `Następne: „${r?.title || 'zadanie'}”${date ? ` – ${r?.doDate ? 'wykonać' : 'termin'} ${dayWord(date, today)}` : ''}`
}

/** What `changeOne` can leave out or refuse: a step of a record, as a function of the file in its turn (the file is a copy it may change). */
export type RecordStep = { raw: RawRecord } | { error: string } | { skip: string }

/** The `put` of `change` – one file of the edit with its version before and after. */
export type PutFile = Parameters<Parameters<typeof change>[0]>[0]

/**
 * One record `id` changed by `step` inside an edit made in its turn – the one way a change of one sprawa and of a group goes (T1564):
 * the record as it is now (`gone` – none), `step` on a copy of it (`error` – refused with why, `skip` – nothing to write), the file
 * put, and – a task that repeats taken to „Zrobione” (D465) – its next task put too (`owner` = the tick, T923), unless the window has
 * that one already (made on another computer, or before a tick taken back by hand): never written twice. `next` – the next one made.
 */
export function changeOne(put: PutFile, id: string, at: number, step: (raw: RawRecord, at: number) => RecordStep): { gone: true } | { error: string } | { skip: string } | { next: RawRecord | null } {
  const rel = relOf(id)
  const before = rawRecord(rel)
  if (!before) return { gone: true }
  const s = step({ ...before }, at)
  if ('error' in s || 'skip' in s) return s
  put(rel, before, s.raw)
  const n = nextTaskRaw(before, s.raw, at, marketDay)
  if (n && !rawRecord(relOf(n.id))) {
    put(relOf(n.id), null, n.raw, rel)
    return { next: n.raw }
  }
  return { next: null }
}

/**
 * One record changed by `fn` from what it is in its turn (or refused with why); gone – „Tej sprawy już nie ma.” (`changeOne`). A task that
 * repeats taken to „Zrobione” by it (D465) gets its next task in the same edit – unless the window has that one already: the next one is
 * never written twice; „Cofnij” then for both. The next one goes with the tick (T923, `owner`): a tick that meets a change elsewhere keeps
 * it waiting, „ich” takes it out – never an open task and its next one side by side; its „Cofnij” removes the next one only after the task is back.
 */
async function changeRecord(id: string, fn: (raw: RawRecord, at: number) => { raw: RawRecord } | { error: string }): Promise<CaseResult> {
  // The next task this change made (written in the callback – its last run counts).
  const made: { raw: RawRecord | null } = { raw: null }
  const r = await change((put) => {
    made.raw = null
    const o = changeOne(put, id, Date.now(), fn)
    if ('gone' in o) return 'Tej sprawy już nie ma.'
    if ('error' in o) return o.error
    if ('next' in o) made.raw = o.next
    return null
  })
  const next = r.saved ? made.raw : null
  if (next) undoToast(nextTaskText(next, logicalDayOf(Date.now())), () => void undoCase(r.undo))
  return { ...r, next: next ? String(next.id) : null }
}

/** Its fields (title, estimate, category, note, person, kind) – refused with why (a task without a title). */
export function changeCase(id: string, patch: CasePatch): Promise<CaseResult> {
  return changeRecord(id, (raw, at) => patchedRaw(raw, patch, at))
}

/** To another list (D383): „Dziś” – of today; „Zrobione” – done now; out of „Zrobione” – again, without its block. */
export function moveCase(id: string, list: CaseList): Promise<CaseResult> {
  return changeRecord(id, (raw, at) => ({ raw: listedRaw(raw, list, at) }))
}

/** „Zadanie zrobione?” answered in the window (the ritual, the lists): „Tak” – Zrobione, „Wraca na listę” – no block. */
export function answerTask(id: string, answer: 'done' | 'back'): Promise<CaseResult> {
  return changeRecord(id, (raw, at) => ({ raw: taskAnswerRaw(raw, answer, at) }))
}

/** Removed (its „Cofnij” – `undoCase` brings the file back as it was). */
export function removeCase(id: string): Promise<CaseResult> {
  return change((put) => {
    const rel = relOf(id)
    const before = rawRecord(rel)
    if (!before) return 'Tej sprawy już nie ma.'
    put(rel, before, null)
    return null
  })
}

/**
 * The pushed starts written into the day's file after the change (D367, T764, T770): only for a block the day's plan
 * after the change still has (`planOf` – the day's snapshot with this file, counted once) and whose start it changes; a
 * block gone from the day (the sprawa's old one, one removed on another computer, one the day no longer makes) is never
 * written back. The file after and how many starts changed.
 */
export function pushedInto(after: RawRecord, date: string, push: CasePush, made?: ReadonlySet<string>): { next: RawRecord; moved: number } {
  // D582: the buffers the new blocks of the sprawy written take – out of the day first, so the plan after the change has none of them.
  const freed = (push.taken ?? []).filter((t) => !made || made.has(t.caseId)).reduce((r, t) => setCancelled(r, t.id, true), after)
  const plan = new Map(push.planOf(dayFileFrom(freed, date)).map((b) => [b.id, b]))
  let next = freed
  let moved = 0
  for (const x of push.blocks) {
    const inDay = plan.get(x.block.id)
    if (!inDay || inDay.startMin === x.startMin) continue
    next = putBlock(next, { ...(dayFileFrom(next, date).blocks.find((b) => b.id === x.block.id) ?? inDay), startMin: x.startMin })
    moved++
  }
  return { next, moved }
}

/** What a drop pushes apart (D367): the blocks with their new starts, and the plan of the day with a file (its snapshot's). */
export interface CasePush {
  blocks: readonly CasePushed[]
  planOf: (file: DayFile) => readonly PlanBlock[]
  /** The buffers of decompression the new blocks are laid on (D582), each with its sprawa: cancelled for the day in the same edit – only those of the sprawy written (T2484). */
  taken?: ReadonlyArray<{ id: string; caseId: string }>
}

/** A block the drop pushes apart (D367, `dayPush.ts`): the block as the window knows it and its new start. */
export interface CasePushed {
  block: PlanBlock
  startMin: number
}

/**
 * The files of the days a planning of `rs` on `date` reads, with the logs' `begunOf` (T769): the day of the axis (the window's
 * `seen` when it cannot be read now) and each sprawa's day of before, followed through `movedTo` to where its block stands
 * (`caseDayToRead`). Null – a day it needs cannot be read now: nothing is written (`DAY_UNREADABLE`, never a second block in silence).
 * One read for `planCase` and for a group (`planCases`).
 */
export async function readPlanDays(rs: readonly RequestRecord[], date: string, seen?: (date: string) => RawRecord | null | undefined): Promise<{ days: Record<string, RawRecord | null>; begunOf: (date: string, block: string) => boolean | undefined } | null> {
  const read = await window.rd.caseDays([...new Set([date, ...rs.flatMap((r) => (r.day && r.day !== date ? [r.day] : []))])])
  const days: Record<string, RawRecord | null> = { ...read.files }
  const begunIn: Record<string, string[]> = { ...read.begun }
  if (!(date in days)) {
    const known = seen?.(date)
    if (known === undefined) return null
    days[date] = known
  }
  for (const r of rs) {
    for (let more = caseDayToRead(r, days); more && !(more in days); more = caseDayToRead(r, days)) {
      const next = await window.rd.caseDays([more])
      // The day its old block stands on cannot be read now: it could stay beside the new one – nothing written (T769).
      if (!(more in next.files)) return null
      days[more] = next.files[more] ?? null
      const begunHere = next.begun[more]
      if (begunHere) begunIn[more] = begunHere
    }
  }
  return { days, begunOf: (d, b) => (begunIn[d] ? begunIn[d].includes(b) : undefined) }
}

/**
 * A sprawa put on the axis of `date` at `startMin` (D384): a task – a flexible block of its category as long as its
 * estimate, the cost from the category; a request – a block of requests; the sprawa „zaplanowane” in it – one edit of
 * the day's file and the record. Its block of before leaves its day when that day is today or later and its log says it
 * has not begun (`oldBlockTakeable`, T769); the day it stands on (followed through `movedTo`) not readable now, or its log
 * not read in full – nothing is written (`DAY_UNREADABLE`: never a second block in silence). `pushed` – the blocks the
 * drop pushes apart (D367), in the same edit of the day, written while the day's plan after the change has them
 * (`push.planOf`, T770); `seen` – the day's file as the window knows it, for one not readable now. Its „Cofnij” –
 * `undoCase(result.undo)`; `moved` – the starts that changed.
 */
export async function planCase(id: string, date: string, startMin: number, o: { push?: CasePush; seen?: (date: string) => RawRecord | null | undefined; durationMin?: number; copy?: boolean } = {}): Promise<CaseResult & { block: PlanBlock | null; moved: number }> {
  let block: PlanBlock | null = null
  let moved = 0
  // D513: dropped with Ctrl held – a new sprawa of the same content is planned (`copiedCase`), the original stays as it is.
  const copyId = o.copy ? newId() : null
  const r = await change(async (put) => {
    const original = rawRecord(relOf(id))
    if (!original) return 'Tej sprawy już nie ma.'
    const rel = relOf(copyId ?? id)
    const before = copyId ? copiedCase(original, copyId, Date.now()) : original
    if (!before) return 'Tej sprawy już nie ma.'
    const r0 = requestFrom(before)
    if (!r0) return 'Tej sprawy już nie ma.'
    const read = await readPlanDays([r0], date, o.seen)
    if (!read) return DAY_UNREADABLE
    const { days, begunOf } = read
    // Now – in the turn of the write (a turn waiting over 04:00 counts with the day it runs in).
    const p = casePlan({ record: before, date, startMin, ...(o.durationMin != null ? { durationMin: o.durationMin } : {}), files: days, rules: settingsOn(useData.getState().rd.settings, date).categories, at: Date.now(), begun: begunOf })
    if (!p) return 'Tej sprawy już nie ma.'
    // Its old block today or later, its log not known: whether it began is not known – no write (T774).
    if ('refused' in p) return DAY_UNREADABLE
    moved = 0
    for (const [d, after] of Object.entries(p.days)) {
      let next = after
      if (d === date && o.push) {
        const pushed = pushedInto(after, d, o.push)
        next = pushed.next
        moved = pushed.moved
      }
      put(paths.day(d), days[d] ?? null, next)
    }
    // A copy is a new file that goes with the day holding its block (T923); the sprawa planned again – its own file.
    if (copyId) put(rel, null, p.record, paths.day(date))
    else put(rel, before, p.record)
    block = p.block
    return null
  })
  return { ...r, block: r.saved ? block : null, moved: r.saved ? moved : 0, ...(copyId ? { id: r.saved ? copyId : null } : {}) }
}

/** What the morning's step did: `made` – the blocks it put into the plan, `skipped` – the chosen sprawy it left out. */
export interface MorningResult extends CaseResult {
  made: number
  /** Chosen, but gone, done or planned meanwhile (their ids): nothing made for them – the window says so. */
  skipped: string[]
}

/**
 * The morning plan's step of requests (D384): the chosen requests as one block of requests, each chosen task of „Dziś”
 * its own block – from `startMin` (the plan's `freeStart` for `morningMinutes`), one after another; one edit of today's
 * file and the records. „Not planned” is the rule of the offer (`scheduledOf` with the days' files and logs – T761); a
 * sprawa planned or done meanwhile is left out and named in `skipped`, `made: 0` – nothing written (a second click adds
 * nothing; the window keeps its choice and says why).
 */
export async function planMorning(date: string, seen: RawRecord | null, chosen: { requests: readonly string[]; tasks: readonly string[] }, startMin: number): Promise<MorningResult> {
  let made = 0
  let skipped: string[] = []
  const r = await change(async (put) => {
    const raws = (ids: readonly string[]) => {
      const out: RawRecord[] = []
      for (const id of ids) {
        const raw = rawRecord(relOf(id))
        if (raw) out.push(raw)
        else skipped.push(id)
      }
      return out
    }
    skipped = []
    const requests = raws(chosen.requests)
    const tasks = raws(chosen.tasks)
    const dates = [...new Set([date, ...[...requests, ...tasks].flatMap((x) => (typeof x.day === 'string' ? [x.day] : []))])]
    const read = await window.rd.caseDays(dates)
    const day = date in read.files ? (read.files[date] ?? null) : seen
    const { goneOf } = readersOf(read)
    const out = morningPlan({ date, dayFile: day, requests, tasks, startMin, rules: settingsOn(useData.getState().rd.settings, date).categories, at: Date.now(), files: read.files, goneOf })
    skipped.push(...out.skipped)
    made = out.blocks.length
    if (!made) return null
    for (const [d, after] of Object.entries(out.days)) put(paths.day(d), d === date ? day : (read.files[d] ?? null), after)
    for (const x of out.records) put(relOf(x.id), rawRecord(relOf(x.id)), x.raw)
    return null
  })
  return { ...r, made: r.saved ? made : 0, skipped }
}

/** „Cofnij” of one change: each file back as it was before it – only while it stands as the change left it. */
export function undoCase(undo: readonly CaseUndoFile[]): Promise<CaseResult> {
  return undoFiles(undo, ['day', 'request'])
}

/** „Cofnij” of the files of one change of the kinds named (a day's file, a record of `kinds`) – each only while it stands as the change left it. */
export function undoFiles(undo: readonly CaseUndoFile[], kinds: readonly string[]): Promise<CaseResult> {
  return change(async (put) => {
    const dates = undo.flatMap((u) => {
      const c = classify(u.rel)
      return c?.kind === 'day' && c.date ? [c.date] : []
    })
    const days = dates.length ? await daysNow(dates) : {}
    if (!days) return DAY_UNREADABLE
    for (const u of undo) {
      const c = classify(u.rel)
      if (!c || c.conflict || !kinds.includes(c.kind)) continue
      const now = c.kind === 'day' ? (days[c.date!] ?? null) : rawRecord(u.rel)
      const stands = now == null ? u.after == null : u.after != null && isRaw(now) && sameContentAs(now, u.after)
      // Changed since (here or on another computer): never written over.
      if (stands) put(u.rel, now, u.before, u.owner)
    }
    return null
  })
}

/** The global shortcut of the quick capture on this computer (D402: the settings' „Skrót zajęty przez inny program”). */
export function useQuickShortcut(): QuickShortcut | null {
  const [s, setS] = useState<QuickShortcut | null>(null)
  useEffect(() => {
    let alive = true
    void window.rd.quickShortcut().then((x) => alive && setS(x), () => undefined)
    const off = window.rd.onQuickShortcut(setS)
    return () => {
      alive = false
      off()
    }
  }, [])
  return s
}
