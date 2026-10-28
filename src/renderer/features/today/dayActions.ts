/**
 * Edits of a day's plan from the main window, as edits of its file (spec „Przyszłe dni przechowują tylko Twoje zmiany”):
 * a block put in (a new one or a change of one), taken out (yours) or cancelled (the template's, a session, a lecture) –
 * with „Cofnij” for 10 s – moved to another day, the day copied to other days. Actions of the day (approval, exception,
 * parking) are events of its log. Every edit is made in its turn from the file as it is then (A6-01); the window's
 * version (`seen`) only stands in for a file that cannot be read now.
 */
import type { EditOutcome, RawRecord } from '@shared/api'
import { blockJson, dayRaw, putBlock, setCancelled, takeBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { marketDay } from '@shared/calendar/holidays'
import { createDay } from '@shared/engine/createDay'
import { copiedDay, moveBetweenDays } from '@shared/engine/planEdit'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { plDate } from '@shared/format'
import { dayFilesNow, editOf, isSaved, trySaveWith, useData } from '../../store/data'
import { undoToast } from '../../store/ui'

/** The day's file changed by `next` from its version in its turn; null when nothing could be sent (the toast said why). */
export function saveDay(date: string, seen: RawRecord | null, next: (raw: RawRecord) => RawRecord): Promise<EditOutcome[] | null> {
  return trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    return [editOf(paths.day(date), before, next(dayRaw(before, date)))]
  })
}

/** A block as the day's file holds it now (a change of it made before), or as the window knows it. */
export function blockNow(raw: RawRecord, date: string, b: PlanBlock): PlanBlock {
  return dayFileFrom(raw, date).blocks.find((x) => x.id === b.id) ?? b
}

/** A block put into the day (new, or changed: a block of the snapshot keeps its id, the change is the day's own). */
export function putDayBlock(date: string, seen: RawRecord | null, b: PlanBlock): Promise<EditOutcome[] | null> {
  return saveDay(date, seen, (raw) => putBlock(raw, b))
}

/**
 * Fields of a block changed (the panel of a block): over the block as the file holds it in its turn, so a change made a
 * moment before stays (A6-01).
 */
export function patchDayBlock(date: string, seen: RawRecord | null, b: PlanBlock, patch: Partial<PlanBlock>): Promise<EditOutcome[] | null> {
  return saveDay(date, seen, (raw) => putBlock(raw, { ...blockNow(raw, date, b), ...patch }))
}

/**
 * A block leaves the day: one of yours is taken out of the file, one of the snapshot is cancelled for the day. „Cofnij”
 * for 10 s brings it back (spec „Usuwanie”) – the opposite of this one change on the file as it is then, so another
 * change made meanwhile stays (A6-07). Nothing says „usunięty” when it was not saved (A6-08).
 */
export async function removeDayBlock(date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string): Promise<boolean> {
  let gone = b
  // The file as this removal left it: what „Cofnij” stands on while the file cannot be read (never „no file”).
  let left: RawRecord | null = null
  const out = await trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    const raw = dayRaw(before, date)
    if (!inSnapshot) gone = blockNow(raw, date, b)
    left = inSnapshot ? setCancelled(raw, b.id, true) : takeBlock(raw, b.id)
    return [editOf(paths.day(date), before, left)]
  })
  if (!isSaved(out)) return false
  undoToast(`${inSnapshot ? 'Odwołany' : 'Usunięty'}: ${name}`, () => void saveDay(date, left, (raw) => (inSnapshot ? setCancelled(raw, b.id, false) : putBlock(raw, gone))))
  return true
}

/**
 * A block moved to another day (spec „Przeniesienie”): it leaves this day (its id stays, the move is noted), comes to
 * the target with the day it came from and one move more when you moved it.
 */
export function moveDayBlock(fromDate: string, fromRaw: RawRecord | null, plan: readonly PlanBlock[], b: PlanBlock, toDate: string, toRaw: RawRecord | null, byYou = true): Promise<EditOutcome[] | null> {
  return trySaveWith(async () => {
    const now = await dayFilesNow([fromDate, toDate], (d) => (d === fromDate ? fromRaw : toRaw))
    const from = now[fromDate] ?? null
    const to = now[toDate] ?? null
    const { source, target } = moveBetweenDays(from, to, blockNow(dayRaw(from, fromDate), fromDate, b), plan, fromDate, toDate, byYou)
    return [editOf(paths.day(fromDate), from, source), editOf(paths.day(toDate), to, target)]
  })
}

/** The fields a copy of a day sets in its target (spec „Skopiuj ten dzień do…”). */
const COPIED = ['blocks', 'cancelled', 'dayType', 'wakeMin'] as const

/**
 * A day copied to other days (spec „Skopiuj ten dzień do…”): each target takes the copy's type, wake and blocks (new
 * ids), its own template blocks cancelled and its own blocks replaced; sessions and lectures stay the target's.
 * „Cofnij” gives each target back those fields as they were before the copy.
 */
export async function copyDayTo(source: { date: string; plan: readonly PlanBlock[]; dayType: string | null; wakeMin: number | null }, targets: readonly string[], rawOf: (date: string) => RawRecord | null): Promise<boolean> {
  const { rd, templates, lectures } = useData.getState()
  const blocks = copiedDay(source.plan)
  const was = new Map<string, { before: RawRecord | null; after: RawRecord }>()
  const out = await trySaveWith(async () => {
    const now = await dayFilesNow(targets, rawOf)
    return targets.map((date) => {
      const before = now[date] ?? null
      const raw: RawRecord = { ...dayRaw(before, date), blocks: blocks.map((b) => blockJson(b)) }
      if (source.dayType) raw.dayType = source.dayType
      if (source.wakeMin != null) raw.wakeMin = source.wakeMin
      else delete raw.wakeMin
      const snap = createDay({ date, changes: rd.settings, templates, lectures, dayFile: dayFileFrom(raw, date), holidays: marketDay, at: null })
      let after = raw
      for (const b of snap.blocks) if (b.origin === 'template') after = setCancelled(after, b.id, true)
      was.set(date, { before, after })
      return editOf(paths.day(date), before, after)
    })
  })
  if (!isSaved(out)) return false
  undoToast(`Plan skopiowany do: ${targets.map(plDate).join(', ')}`, () => void undoCopy(was))
  return true
}

/** The copy taken back: each target's copied fields as they were before it, over the file as it is now. */
function undoCopy(was: ReadonlyMap<string, { before: RawRecord | null; after: RawRecord }>): Promise<EditOutcome[] | null> {
  const dates = [...was.keys()]
  return trySaveWith(async () => {
    const now = await dayFilesNow(dates, (d) => was.get(d)?.after ?? null)
    return dates.map((date) => {
      const before = now[date] ?? null
      const old = dayRaw(was.get(date)?.before, date)
      const after = dayRaw(before, date)
      for (const k of COPIED) {
        if (k in old) after[k] = old[k]
        else delete after[k]
      }
      return editOf(paths.day(date), before, after)
    })
  })
}
