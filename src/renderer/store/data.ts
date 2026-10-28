/**
 * The data folder in the main window: its records as the main process sees them (the files with this computer's queued
 * edits over them), read by the model's own parsers, and the edits – every change goes as the fields it changed with the
 * values they had (spec „Edycje … trafiają najpierw do lokalnej trwałej kolejki”), so two computers changing different
 * fields never meet. Read again whenever the main process says something changed.
 */
import { create } from 'zustand'
import type { DataView, EditEntry, EditOutcome, EventIn, RawRecord } from '@shared/api'
import { recordEdit } from '@shared/data/merge'
import { newId } from '@shared/model/ids'
import { lectureFrom, templateFrom, type LectureSeries, type Template } from '@shared/model/plan'
import { rdFrom, type RdFile } from '@shared/model/rd'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { routineFrom, type Routine } from '@shared/model/routines'
import { toast } from './ui'

interface DataState {
  view: DataView | null
  rd: RdFile
  templates: Template[]
  lectures: LectureSeries[]
  requests: RequestRecord[]
  routines: Routine[]
  /** Grows with every read (the day views read their day again). */
  stamp: number
}

const empty = rdFrom(undefined)

export const useData = create<DataState>(() => ({ view: null, rd: empty, templates: [], lectures: [], requests: [], routines: [], stamp: 0 }))

const isDefined = <T>(v: T | null): v is T => v != null

let lastJson = ''

/** `news`: the main process said something changed (a day's log too) – the days read again even if the view is the same. */
function apply(view: DataView, news: boolean): void {
  // The same view again (a periodic read): nothing re-renders.
  const json = JSON.stringify(view)
  if (json === lastJson && !news) return
  lastJson = json
  useData.setState((s) => ({
    view,
    rd: rdFrom(view.rd ?? undefined),
    templates: view.templates.map(templateFrom).filter(isDefined),
    lectures: view.lectures.map(lectureFrom).filter(isDefined),
    requests: view.requests.map(requestFrom).filter(isDefined),
    routines: view.routines.map(routineFrom).filter(isDefined),
    stamp: s.stamp + 1
  }))
}

let reading: Promise<void> | null = null
let again = false
let pendingNews = false

/** Reads the view again (one read at a time; a change during a read reads once more after it). */
export function reloadData(news = true): Promise<void> {
  pendingNews ||= news
  if (reading) {
    again = true
    return reading
  }
  reading = (async () => {
    do {
      again = false
      const n = pendingNews
      pendingNews = false
      try {
        apply(await window.rd.dataView(), n)
      } catch {
        /* the main process is starting: the next change reads again */
      }
    } while (again)
  })().finally(() => {
    reading = null
  })
  return reading
}

export async function loadData(): Promise<void> {
  window.rd.onData(() => void reloadData(true))
  await reloadData(true)
  // The main process tells every change; a read now and then besides (often while the folder opens) never leaves the
  // window on a view it missed the news of at the start.
  const again = () => {
    const status = useData.getState().view?.status
    setTimeout(() => void reloadData(false).finally(again), status === 'open' || status === 'none' ? 30_000 : 2_000)
  }
  again()
}

/** A record of the raw view by its file (rd.json, a template …): what an edit is made against. */
export function rawRecord(rel: string): RawRecord | null {
  const v = useData.getState().view
  if (!v) return null
  if (rel === 'rd.json') return v.rd
  const [dir] = rel.split('/')
  const list = dir === 'templates' ? v.templates : dir === 'schedule' ? v.lectures : dir === 'requests' ? v.requests : dir === 'routines' ? v.routines : null
  const id = rel.slice(rel.indexOf('/') + 1).replace(/\.json$/, '')
  return list?.find((r) => r.id === id) ?? null
}

/** The edit that turns `before` into `after`: the fields that differ, each with its value before (its base). */
export function editOf(rel: string, before: RawRecord | null, after: RawRecord | null): EditEntry | null {
  return recordEdit(rel, before, after)
}

let turn: Promise<unknown> = Promise.resolve()

/**
 * The window's edits go one at a time, each made when its turn comes from the records as they are then (the view is read
 * again after every edit): two quick changes of one block never meet as if the second came from another computer, and
 * the second never brings back what the first changed (A6-01).
 */
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = turn.then(fn)
  turn = run.catch(() => undefined)
  return run
}

/** Sends edits made by `make` (in its turn); null when nothing could be sent – the toast said why. */
async function send(make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>): Promise<EditOutcome[] | null> {
  try {
    const list = (await make()).filter((e): e is EditEntry => !!e)
    if (!list.length) return []
    const out = await window.rd.edit(list)
    await reloadData()
    if (out.some((o) => o.status === 'conflict' || o.status === 'removedElsewhere')) toast('Ta zmiana spotkała się ze zmianą z innego komputera – odpowiedz na pytanie u góry okna.', 'info', 8000)
    else if (out.some((o) => o.status === 'broken')) toast('Plik jest uszkodzony i nie jest nadpisywany – przywróć go z historii.', 'error', 8000)
    return out
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return null
  }
}

/**
 * Saves edits; what met a change on another computer stays a question (the banner shows it), what waits for the folder
 * is saved later – nothing pretends a success (spec „nic nie udaje sukcesu”).
 */
export async function saveEdits(entries: ReadonlyArray<EditEntry | null>): Promise<EditOutcome[]> {
  return (await trySaveEdits(entries)) ?? []
}

/** As `saveEdits`, but null when nothing could be sent (the toast said why): for a caller that must know it saved. */
export function trySaveEdits(entries: ReadonlyArray<EditEntry | null>): Promise<EditOutcome[] | null> {
  return inTurn(() => send(() => entries))
}

/**
 * Edits made in their turn by `make` – from the records (`rawRecord`) and the days' files (`dayFilesNow`) as they are
 * then – and saved; null when nothing could be sent.
 */
export function trySaveWith(make: () => Promise<ReadonlyArray<EditEntry | null>> | ReadonlyArray<EditEntry | null>): Promise<EditOutcome[] | null> {
  return inTurn(() => send(make))
}

/**
 * The days' files as this computer sees them now (the folder's with the edits still queued); a file that cannot be read
 * now is the one the window saw (`seen`) – its edit waits until it can be read, as the day says.
 */
export async function dayFilesNow(dates: readonly string[], seen: (date: string) => RawRecord | null): Promise<Record<string, RawRecord | null>> {
  const files = await window.rd.dayFiles([...dates])
  return Object.fromEntries(dates.map((d) => [d, d in files ? (files[d] ?? null) : seen(d)]))
}

/** Saved – written, or waiting for the folder – never a question, a broken file or an error. */
export const isSaved = (out: readonly EditOutcome[] | null): boolean => out != null && out.every((o) => o.status === 'applied' || o.status === 'waiting')

/** rd.json changed by `fn` (made when there is none yet – the defaults are never written unless you change something). */
export async function saveRd(fn: (raw: RawRecord) => RawRecord): Promise<EditOutcome[]> {
  return (await trySaveRd(fn)) ?? []
}

/** As `saveRd`, null when nothing could be sent. */
export function trySaveRd(fn: (raw: RawRecord) => RawRecord): Promise<EditOutcome[] | null> {
  return trySaveWith(() => {
    const before = rawRecord('rd.json')
    return [editOf('rd.json', before, fn(before ? { ...before } : { schema: 1 }))]
  })
}

/** A record changed by `fn` from what it is in its turn (a record gone by then is not made again); null: not sent. */
export function tryUpdateRecord(rel: string, fn: (raw: RawRecord) => RawRecord | null): Promise<EditOutcome[] | null> {
  return trySaveWith(() => {
    const before = rawRecord(rel)
    return before ? [editOf(rel, before, fn({ ...before }))] : []
  })
}

/** As `tryUpdateRecord`, [] when nothing could be sent. */
export async function updateRecord(rel: string, fn: (raw: RawRecord) => RawRecord | null): Promise<EditOutcome[]> {
  return (await tryUpdateRecord(rel, fn)) ?? []
}

/** A new person of the list (spec „Słowniki: … z „+ dodaj””); answers its id. */
export async function addPerson(name: string): Promise<string | null> {
  const n = name.trim().slice(0, 60)
  if (!n) return null
  const id = newId()
  await saveRd((raw) => ({ ...raw, people: [...(Array.isArray(raw.people) ? raw.people : []), { id, name: n, archived: false }] }))
  return id
}

/** One record changed from `before` to `after` (null: removed / new). */
export function saveRecord(rel: string, before: RawRecord | null, after: RawRecord | null): Promise<EditOutcome[]> {
  return saveEdits([editOf(rel, before, after)])
}

/** Actions written to a day's log (approval of the boundary, an exception, a check-in …). */
export async function logEvents(events: EventIn[]): Promise<boolean> {
  try {
    await window.rd.logEvents(events)
    await reloadData()
    return true
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return false
  }
}
