/**
 * Edits of a day's plan from the main window, as edits of its file (spec „Przyszłe dni przechowują tylko Twoje zmiany”):
 * a block put in (a new one or a change of one), taken out (yours) or cancelled (the template's, a session, a lecture) –
 * with „Cofnij” for 10 s – moved to another day, the day copied to other days. Actions of the day (approval, exception,
 * parking) are events of its log.
 */
import type { RawRecord } from '@shared/api'
import { blockJson, dayRaw, putBlock, setCancelled, setMovedTo, takeBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { copiedDay, movedBlock } from '@shared/engine/planEdit'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { plDate } from '@shared/format'
import { editOf, saveEdits, saveRecord, useData } from '../../store/data'
import { undoToast } from '../../store/ui'

/** The day's raw file as the window saw it, and a function that saves its next version. */
export async function saveDay(date: string, before: RawRecord | null, next: (raw: RawRecord) => RawRecord): Promise<void> {
  await saveRecord(paths.day(date), before, next(dayRaw(before, date)))
}

/** A block put into the day (new, or changed: a block of the snapshot keeps its id, the change is the day's own). */
export function putDayBlock(date: string, before: RawRecord | null, b: PlanBlock): Promise<void> {
  return saveDay(date, before, (raw) => putBlock(raw, b))
}

/**
 * A block leaves the day: one of yours is taken out of the file, one of the snapshot is cancelled for the day. „Cofnij”
 * for 10 s brings it back (spec „Usuwanie”).
 */
export async function removeDayBlock(date: string, before: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string): Promise<void> {
  const after = inSnapshot ? setCancelled(dayRaw(before, date), b.id, true) : takeBlock(dayRaw(before, date), b.id)
  const rel = paths.day(date)
  await saveRecord(rel, before, after)
  undoToast(`${inSnapshot ? 'Odwołany' : 'Usunięty'}: ${name}`, () => void saveEdits([editOf(rel, after, before ?? { schema: 1, date })]))
}

/**
 * A block moved to another day (spec „Przeniesienie”): it leaves this day (its id stays, the move is noted), comes to
 * the target with the day it came from and one move more when you moved it.
 */
export async function moveDayBlock(fromDate: string, fromRaw: RawRecord | null, plan: readonly PlanBlock[], b: PlanBlock, toDate: string, toRaw: RawRecord | null, byYou = true): Promise<void> {
  const moved = movedBlock(b, plan, fromDate, byYou)
  const own = dayFileFrom(fromRaw ?? {}, fromDate).blocks.some((x) => x.id === b.id)
  let source = setMovedTo(dayRaw(fromRaw, fromDate), b.id, toDate)
  if (own) source = takeBlock(source, b.id)
  await saveEdits([editOf(paths.day(fromDate), fromRaw, source), editOf(paths.day(toDate), toRaw, putBlock(dayRaw(toRaw, toDate), moved))])
}

/**
 * A day copied to other days (spec „Skopiuj ten dzień do…”): each target takes the copy's type, wake and blocks (new
 * ids), its own template blocks cancelled and its own blocks replaced; sessions and lectures stay the target's.
 */
export async function copyDayTo(source: { date: string; plan: readonly PlanBlock[]; dayType: string | null; wakeMin: number | null }, targets: readonly string[], rawOf: (date: string) => RawRecord | null): Promise<void> {
  const { rd, templates, lectures } = useData.getState()
  const versions = targets.map((date) => {
    const before = rawOf(date)
    const raw: RawRecord = { ...dayRaw(before, date), blocks: copiedDay(source.plan).map((b) => blockJson(b)) }
    if (source.dayType) raw.dayType = source.dayType
    if (source.wakeMin != null) raw.wakeMin = source.wakeMin
    else delete raw.wakeMin
    const snap = createDay({ date, changes: rd.settings, templates, lectures, dayFile: dayFileFrom(raw, date), holidays: marketDay, at: null })
    let after = raw
    for (const b of snap.blocks) if (b.origin === 'template') after = setCancelled(after, b.id, true)
    return { date, before, after }
  })
  await saveEdits(versions.map((v) => editOf(paths.day(v.date), v.before, v.after)))
  undoToast(`Plan skopiowany do: ${targets.map(plDate).join(', ')}`, () => void saveEdits(versions.map((v) => editOf(paths.day(v.date), v.after, v.before ?? { schema: 1, date: v.date }))))
}
