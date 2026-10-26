/**
 * The data folder in the main window: its records as the main process sees them (the files with this computer's queued
 * edits over them), read by the model's own parsers, and the edits – every change goes as the fields it changed with the
 * values they had (spec „Edycje … trafiają najpierw do lokalnej trwałej kolejki”), so two computers changing different
 * fields never meet. Read again whenever the main process says something changed.
 */
import { create } from 'zustand'
import type { DataView, EditEntry, EditOutcome, EventIn, RawRecord } from '@shared/api'
import { diffRecords } from '@shared/data/merge'
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

function apply(view: DataView): void {
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

/** Reads the view again (one read at a time; a change during a read reads once more after it). */
export function reloadData(): Promise<void> {
  if (reading) {
    again = true
    return reading
  }
  reading = (async () => {
    do {
      again = false
      try {
        apply(await window.rd.dataView())
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
  window.rd.onData(() => void reloadData())
  await reloadData()
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
  if (!after) return before ? { rel, remove: true, edits: [] } : null
  if (!before) return { rel, create: true, edits: Object.entries(after).map(([k, v]) => ({ path: [k], base: undefined, value: v })) }
  const edits = diffRecords(before, after).map((c) => ({ path: c.path, base: c.before, value: c.after }))
  return edits.length ? { rel, edits } : null
}

/**
 * Saves edits; what met a change on another computer stays a question (the banner shows it), what waits for the folder
 * is saved later – nothing pretends a success (spec „nic nie udaje sukcesu”).
 */
export async function saveEdits(entries: ReadonlyArray<EditEntry | null>): Promise<EditOutcome[]> {
  const list = entries.filter((e): e is EditEntry => !!e)
  if (!list.length) return []
  try {
    const out = await window.rd.edit(list)
    await reloadData()
    if (out.some((o) => o.status === 'conflict' || o.status === 'removedElsewhere')) toast('Ta zmiana spotkała się ze zmianą z innego komputera – odpowiedz na pytanie u góry okna.', 'info', 8000)
    else if (out.some((o) => o.status === 'broken')) toast('Plik jest uszkodzony i nie jest nadpisywany – przywróć go z historii.', 'error', 8000)
    return out
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return []
  }
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
