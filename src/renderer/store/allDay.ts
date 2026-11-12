/**
 * All-day events from the window (D405): a save writes only the fields you changed (over the record as it is in its
 * turn – unknown fields and another computer's change of another field stay), a removal goes without asking and answers
 * the record as it was, for its „Cofnij” (`restoreAllDay` brings back that very record). The line „Usunięto „…” · Cofnij”
 * stands `UNDO_LINE_MS` (`allDayRemovedText`); a change of fields has no „Cofnij”.
 */
import type { RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { allDayFrom, allDayJson, allDayProblem, type AllDayEvent } from '@shared/model/allDay'
import { editOf, isSaved, rawRecord, trySaveWith } from './data'
import { toast } from './ui'

/** The file of an event. */
export const allDayRel = (id: string): string => paths.record('allDay', id)

/**
 * An event saved: new (`base` null – created), or the fields that differ from `base` (the event as the card opened it)
 * written over the record as it is when the save's turn comes. False – nothing written: refused (the toast says why: an
 * empty title, dates the wrong way round), the event removed meanwhile, or the save did not go through.
 */
export async function saveAllDay(e: AllDayEvent, base: AllDayEvent | null = null): Promise<boolean> {
  const event = { ...e, title: e.title.trim() }
  const problem = allDayProblem(event)
  if (problem) {
    toast(problem, 'error', 6000)
    return false
  }
  const rel = allDayRel(event.id)
  let gone = false
  let there = false
  const out = await trySaveWith(() => {
    const before = rawRecord(rel)
    if (!base) {
      // A new id is made at that moment: a record of it already there is never written over.
      there = before != null
      return there ? [] : [editOf(rel, null, allDayJson(event))]
    }
    if (!before) {
      gone = true
      return []
    }
    // Only what you changed on the card: a field changed elsewhere meanwhile, which you left, stays theirs.
    const changed = Object.fromEntries(Object.entries(event).filter(([k, v]) => base[k as keyof AllDayEvent] !== v))
    return [editOf(rel, before, allDayJson({ ...(allDayFrom(before) ?? base), ...changed }, before))]
  })
  if (gone) {
    toast('Tego wydarzenia już nie ma – usunięto je w międzyczasie.', 'info', 6000)
    return false
  }
  return !there && isSaved(out)
}

/**
 * An event removed (no question, D405): the record as it was when the removal's turn came – for „Cofnij” – or null when
 * nothing was removed (gone already, or the removal did not go through; the toast says why).
 */
export async function removeAllDay(id: string): Promise<RawRecord | null> {
  const rel = allDayRel(id)
  let before: RawRecord | null = null
  const out = await trySaveWith(() => {
    before = rawRecord(rel)
    return before ? [editOf(rel, before, null)] : []
  })
  return before != null && isSaved(out) ? before : null
}

/**
 * „Cofnij” of a removal: the very record removed (`removeAllDay`'s answer) written again – only while there is none of
 * its id (a second „Cofnij”, or one made again elsewhere, writes nothing over). True once saved.
 */
export async function restoreAllDay(raw: RawRecord): Promise<boolean> {
  if (typeof raw.id !== 'string' || !raw.id) return false
  const rel = allDayRel(raw.id)
  let there = false
  const out = await trySaveWith(() => {
    there = rawRecord(rel) != null
    return there ? [] : [editOf(rel, null, raw)]
  })
  return !there && isSaved(out)
}
