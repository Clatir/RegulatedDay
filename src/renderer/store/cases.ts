/**
 * „Sprawy” in the main window (OPS2: D383, D384, D385, D402) – what the page „Sprawy”, the panel by the axis of „Dziś”
 * and the morning plan use: the lists as they read today (`useCases`), and every change as edits of the queue made in
 * its turn from the records and the days' files as they are then (T517) by the pure functions of `engine/cases.ts` – a
 * sprawa put on the axis and its block go as one edit (the day's file and the record), each change with what its
 * „Cofnij” needs. A refusal is said by a toast (as the other saves); the answer says whether it was saved.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CaseDays, EditOutcome, QuickShortcut, RawRecord } from '@shared/api'
import { isRaw, putBlock } from '@shared/data/dayEdits'
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
import { newId } from '@shared/model/ids'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom, type CaseList, type NewTask } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { useNow } from '../lib/clock'
import { editOf, isSaved, rawRecord, trySaveWith, useData } from './data'
import { toast } from './ui'

const relOf = (id: string): string => paths.record('request', id)

/** Why nothing is written when a day's file cannot be read now (never taken for a day without a file). */
export const DAY_UNREADABLE = 'Pliku dnia nie da się teraz odczytać – nic nie zapisano, spróbuj za chwilę.'

/**
 * The days' files as this computer sees them now; a file not readable now – the one the window saw (`seen`), else
 * none of them (null: say `DAY_UNREADABLE`).
 */
async function daysNow(dates: readonly string[], seen?: (date: string) => RawRecord | null | undefined): Promise<Record<string, RawRecord | null> | null> {
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
 * day of „Zrobione”. The days read are those of sprawy not done from two weeks back (`scheduledDays`), once for every
 * view showing them, again with the data and every 30 s; the lists every minute (04:00 passes without a write).
 */
export function useCases(): CasesView {
  const requests = useData((s) => s.requests)
  const stamp = useData((s) => s.stamp)
  const now = useNow(CASE_DAYS_REREAD_MS)
  const today = logicalDayOf(now)
  const dates = useMemo(() => scheduledDays(requests, today), [requests, today])
  const key = `${stamp}|${Math.floor(now / CASE_DAYS_REREAD_MS)}|${dates.join(',')}`
  const [days, setDays] = useState<{ dates: string; read: CaseDays } | null>(null)
  useEffect(() => {
    let alive = true
    if (!dates.length) {
      setDays({ dates: '', read: { files: {}, gone: {} } })
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
}

/**
 * Edits of several files in one turn: `make` puts each file's version before and after (a file put twice keeps its
 * first before) or says why nothing is written; saved together – one edit of the queue.
 */
async function change(make: (put: (rel: string, before: RawRecord | null, after: RawRecord | null) => void) => Promise<string | null> | string | null): Promise<CaseResult> {
  let error: string | null = null
  let undo: CaseUndoFile[] = []
  const out = await trySaveWith(async () => {
    const files = new Map<string, { before: RawRecord | null; after: RawRecord | null }>()
    error = await make((rel, before, after) => {
      const had = files.get(rel)
      files.set(rel, { before: had ? had.before : before, after })
    })
    if (error) return []
    undo = [...files].map(([rel, f]) => ({ rel, before: f.before, after: f.after })).filter((f) => (f.before == null ? f.after != null : f.after == null || !sameContentAs(f.before, f.after)))
    return undo.map((f) => editOf(f.rel, f.before, f.after))
  })
  if (error) toast(error, 'error', 6000)
  const saved = !error && isSaved(out)
  return { saved, error, outcomes: out, id: null, undo: saved ? undo : [] }
}

/** A new task (D384: title required; 30 min, „Inne” by default; „Skrzynka” unless said). */
export async function createTask(p: NewTask): Promise<CaseResult> {
  const id = newId()
  const at = Date.now()
  const r = await change((put) => {
    const raw = newTask(id, at, logicalDayOf(at), p)
    if (!raw) return 'Zadanie potrzebuje tytułu.'
    put(relOf(id), null, raw)
    return null
  })
  return { ...r, id: r.saved ? id : null }
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

/** One record changed by `fn` from what it is in its turn (or refused with why); gone – „Tej sprawy już nie ma.”. */
function changeRecord(id: string, fn: (raw: RawRecord, at: number) => { raw: RawRecord } | { error: string }): Promise<CaseResult> {
  return change((put) => {
    const rel = relOf(id)
    const before = rawRecord(rel)
    if (!before) return 'Tej sprawy już nie ma.'
    const next = fn({ ...before }, Date.now())
    if ('error' in next) return next.error
    put(rel, before, next.raw)
    return null
  })
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

/** A block the drop pushes apart (D367, `dayPush.ts`): the block as the window knows it and its new start. */
export interface CasePushed {
  block: PlanBlock
  startMin: number
}

/**
 * A sprawa put on the axis of `date` at `startMin` (D384): a task – a flexible block of its category as long as its
 * estimate, the cost from the category; a request – a block of requests; the sprawa „zaplanowane” in it – one edit of
 * the day's file and the record. Its block of before is taken out of its day when it has not begun (`begun`; not said –
 * a block of today or a day gone by is taken for begun and stays). `pushed` – the blocks the drop pushes apart (D367), in
 * the same edit of the day; `seen` – the day's file as the window knows it, for one not readable now (else nothing is
 * written). Its „Cofnij” – `undoCase(result.undo)`.
 */
export async function planCase(id: string, date: string, startMin: number, o: { begun?: (date: string, block: string) => boolean; pushed?: readonly CasePushed[]; seen?: (date: string) => RawRecord | null | undefined } = {}): Promise<CaseResult & { block: PlanBlock | null }> {
  let block: PlanBlock | null = null
  const today = logicalDayOf(Date.now())
  const begun = o.begun ?? ((d: string) => d <= today)
  const r = await change(async (put) => {
    const rel = relOf(id)
    const before = rawRecord(rel)
    if (!before) return 'Tej sprawy już nie ma.'
    const r0 = requestFrom(before)
    if (!r0) return 'Tej sprawy już nie ma.'
    // The day of the drop and the day the sprawa is planned in – followed to where its block was moved (`movedTo`).
    const dates = [date, ...(r0.day && r0.day !== date ? [r0.day] : [])]
    let days = await daysNow(dates, o.seen)
    for (let more = caseDayToRead(r0, days ?? {}); days && more && !dates.includes(more); more = caseDayToRead(r0, days ?? {})) {
      dates.push(more)
      days = await daysNow(dates, o.seen)
    }
    if (!days) return DAY_UNREADABLE
    const p = casePlan({ record: before, date, startMin, files: days, rules: settingsOn(useData.getState().rd.settings, date).categories, at: Date.now(), begun })
    if (!p) return 'Tej sprawy już nie ma.'
    // The sprawa's old block is gone from its day: a push the window counted with it never writes it back (T761).
    const pushed = (o.pushed ?? []).filter((x) => !(p.taken && p.taken.day === date && x.block.id === p.taken.block) && x.block.task !== r0.id)
    for (const [d, after] of Object.entries(p.days)) {
      let next = after
      if (d === date) for (const x of pushed) next = putBlock(next, { ...(dayFileFrom(next, d).blocks.find((b) => b.id === x.block.id) ?? x.block), startMin: x.startMin })
      put(paths.day(d), days[d] ?? null, next)
    }
    put(rel, before, p.record)
    block = p.block
    return null
  })
  return { ...r, block: r.saved ? block : null }
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
    const { fileOf, goneOf } = readersOf(read)
    const out = morningPlan({ date, dayFile: day, requests, tasks, startMin, rules: settingsOn(useData.getState().rd.settings, date).categories, at: Date.now(), fileOf, goneOf })
    skipped.push(...out.skipped)
    made = out.blocks.length
    if (!made) return null
    put(paths.day(date), day, out.day)
    for (const x of out.records) put(relOf(x.id), rawRecord(relOf(x.id)), x.raw)
    return null
  })
  return { ...r, made: r.saved ? made : 0, skipped }
}

/** „Cofnij” of one change: each file back as it was before it – only while it stands as the change left it. */
export function undoCase(undo: readonly CaseUndoFile[]): Promise<CaseResult> {
  return change(async (put) => {
    const dates = undo.flatMap((u) => {
      const c = classify(u.rel)
      return c?.kind === 'day' && c.date ? [c.date] : []
    })
    const days = dates.length ? await daysNow(dates) : {}
    if (!days) return DAY_UNREADABLE
    for (const u of undo) {
      const c = classify(u.rel)
      if (!c || c.conflict || (c.kind !== 'day' && c.kind !== 'request')) continue
      const now = c.kind === 'day' ? (days[c.date!] ?? null) : rawRecord(u.rel)
      const stands = now == null ? u.after == null : u.after != null && isRaw(now) && sameContentAs(now, u.after)
      // Changed since (here or on another computer): never written over.
      if (stands) put(u.rel, now, u.before)
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
