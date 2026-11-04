/**
 * Edits of a day's plan from the main window, as edits of its file (spec „Przyszłe dni przechowują tylko Twoje zmiany”):
 * a block put in (a new one or a change of one), taken out (yours) or cancelled (the template's, a session, a lecture) –
 * with „Cofnij” for 10 s – moved to another day, the day copied to other days. Actions of the day (approval, exception,
 * parking) are events of its log. Every edit is made in its turn from the file as it is then (A6-01); the window's
 * version (`seen`) only stands in for a file that cannot be read now.
 */
import type { EditOutcome, RawRecord, TimerResult } from '@shared/api'
import { blockJson, dayRaw, putBlock, setCancelled, setDayField, takeBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { marketDay } from '@shared/calendar/holidays'
import { snapshotOf } from '@shared/engine/context'
import { foldFacts, type DayFacts } from '@shared/engine/facts'
import { gridOf } from '@shared/engine/grid'
import type { AnyEvent } from '@shared/model/events'
import { createDay } from '@shared/engine/createDay'
import { copiedDay, moveBetweenDays, wakeChange } from '@shared/engine/planEdit'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { countLabel, logicalClock, plDate } from '@shared/format'
import type { DaySnapshot } from '@shared/model/events'
import { dayFilesNow, editOf, isSaved, trySaveWith, useData } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

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

/** A click of the timer whose failure (the IPC throws) is an answer, not an unhandled rejection. */
async function clickTimer(block: string, date: string, a: 'removeBegun' | 'undoRemove'): Promise<{ ok: boolean; why: string | null; code: TimerResult['code'] }> {
  try {
    const r = await window.rd.timer({ a, block, day: date })
    return { ok: r.ok, why: r.why ?? null, code: r.code }
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e), code: undefined }
  }
}

/** The edit of the plan did not go and will not: nothing was sent, or the file is broken (a conflict stays as a question and may still pass). */
const refusedEdit = (out: readonly EditOutcome[] | null): boolean => out == null || out.some((o) => o.status === 'broken')

/**
 * A block leaves the day: one of yours is taken out of the file, one of the snapshot is cancelled for the day. „Cofnij”
 * for 10 s brings it back (spec „Usuwanie”) – the opposite of this one change on the file as it is then, so another
 * change made meanwhile stays (A6-07). Nothing says „usunięty” when it was not saved (A6-08).
 *
 * A block that has begun (`begunAs`, D336) is „usunięty”, its run staying in the day outside the plan; one that runs or
 * waits paused (`'open'`) ends now first. The half that can refuse comes first, both ways. Removing: the end first (refused:
 * nothing is removed; a block that is over meanwhile, or whose start was taken back, is only taken out of the plan); the
 * end is taken back only when the plan's edit is refused for good – a conflict stays a question that may pass later, and the
 * block then stays closed. „Cofnij”: the plan first (it may be refused), then the end; if the end cannot be taken back, the
 * plan goes as it was after the removal. Every failure is said.
 */
export async function removeDayBlock(date: string, seen: RawRecord | null, b: PlanBlock, inSnapshot: boolean, name: string, begunAs: 'no' | 'over' | 'open' = 'no'): Promise<boolean> {
  let begun = begunAs
  let gone = b
  // The file as this removal left it: what „Cofnij” stands on while the file cannot be read (never „no file”).
  let left: RawRecord | null = null
  let ends = begun === 'open'
  // The clicks below can find the block otherwise than the view showed it (an end by the leader, a start taken back).
  if (ends) {
    const r = await clickTimer(b.id, date, 'removeBegun')
    if (!r.ok && r.code === 'alreadyOver') ends = false
    else if (!r.ok && r.code === 'notBegun') {
      ends = false
      begun = 'no'
    } else if (!r.ok) {
      toast(`Nie usunięto: ${r.why ?? 'blok nie skończył się'}`, 'error', 6000)
      return false
    }
  }
  const out = await trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    const raw = dayRaw(before, date)
    if (!inSnapshot) gone = blockNow(raw, date, b)
    left = inSnapshot ? setCancelled(raw, b.id, true) : takeBlock(raw, b.id)
    return [editOf(paths.day(date), before, left)]
  })
  if (!isSaved(out)) {
    if (ends && refusedEdit(out)) {
      const r = await clickTimer(b.id, date, 'undoRemove')
      if (!r.ok) toast(`Blok „${name}” nie otworzył się z powrotem: ${r.why ?? 'spróbuj „Pracuję”'} – został poza planem.`, 'error', 8000)
    }
    return false
  }
  const restore = async () => {
    const back = await saveDay(date, left, (raw) => (inSnapshot ? setCancelled(raw, b.id, false) : putBlock(raw, gone)))
    if (!isSaved(back)) return
    if (!ends) return
    const r = await clickTimer(b.id, date, 'undoRemove')
    if (r.ok) return
    toast(`Nie cofnięto: ${r.why ?? 'blok się nie otworzył'}`, 'error', 6000)
    // The plan goes as the removal left it – the block stays where its run is, outside it.
    await saveDay(date, left, (raw) => (inSnapshot ? setCancelled(raw, b.id, true) : takeBlock(raw, b.id)))
  }
  // A block that has begun is „usunięty” (its run stays), whatever it came from (D336).
  undoToast(`${inSnapshot && begun === 'no' ? 'Odwołany' : 'Usunięty'}: ${name}`, () => void restore())
  return true
}

/** The blocks that have begun – a changed wake leaves them where they ran. */
export const begunIds = (facts: Pick<DayFacts, 'blocks'>): Set<string> => new Set([...facts.blocks].filter(([, f]) => f.startedAt != null).map(([id]) => id))

/** What a change of wake counts a day from: its snapshot as the engine has it, and the blocks that stay where they ran. */
export interface WakeDay {
  snapshot: DaySnapshot
  keep: ReadonlySet<string>
}

/**
 * The day as the engine has it now, for a change of wake today: its snapshot (the log's, else computed now) and its begun
 * blocks from the facts folded from its log – no whole day counted (budget, energy), as the change needs neither.
 */
export async function wakeDayOf(date: string): Promise<WakeDay> {
  const { rd, templates, lectures } = useData.getState()
  const data = await window.rd.dayData(date)
  // A day that cannot be read whole now says nothing sure about its blocks that have begun: nothing is written.
  if (!data.complete || data.unknown) throw new Error('log albo plik tego dnia jest teraz nieczytelny – spróbuj za chwilę')
  const events = data.events as AnyEvent[]
  const dayFile = data.dayFile ? dayFileFrom(data.dayFile, date) : null
  const { snapshot } = snapshotOf({ changes: rd.settings, templates, lectures }, { date, events, dayFile, nextFile: null }, marketDay, Date.now())
  return { snapshot, keep: begunIds(foldFacts(gridOf(date), events)) }
}

/**
 * A change of wake of days from the calendar (D334): today as the engine has it (`wakeDayOf`), the rest from the files. Whole
 * inside the caller's busy state; a day that cannot be read now, or a bridge that fails, is said and nothing is written.
 */
export async function setWakeOnDays(dates: readonly string[], today: string, seen: (date: string) => RawRecord | null, wakeMin: number | null): Promise<boolean> {
  try {
    const days = dates.includes(today) ? { [today]: await wakeDayOf(today) } : {}
    return await setDayWake(dates, seen, wakeMin, days)
  } catch (e) {
    toast(`Nie zapisano pobudki: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000)
    return false
  }
}

type WakeWas = Map<string, { wake: number | null; next: number | null; after: RawRecord; moved: Array<{ id: string; from: number; to: number }> }>

/**
 * The wake of days set (`wakeMin`: the value to store, null – the day follows its type's wake again) and the blocks you
 * placed moved with it, once, in the same write (D334, replaces T450 for those blocks): the blocks of the snapshot follow
 * the wake on their own (`dayPlan`), the day's own flexible blocks before the first fixed one move by `wakeChange`.
 * `days` gives a day's engine snapshot and its begun blocks (which stay); a day without it is counted from the files as
 * a day to come. Every day from its file as it is then (A6-01). When blocks moved „Cofnij” for 10 s gives each day its
 * wake and those blocks back – only what is still as this change left it, so a later change stays (A6-07).
 */
export async function setDayWake(dates: readonly string[], seen: (date: string) => RawRecord | null, wakeMin: number | null, days: Readonly<Record<string, WakeDay>> = {}): Promise<boolean> {
  const { rd, templates, lectures } = useData.getState()
  const was: WakeWas = new Map()
  const out = await trySaveWith(async () => {
    const now = await dayFilesNow(dates, seen)
    return dates.map((date) => {
      const before = now[date] ?? null
      const raw = dayRaw(before, date)
      const file = dayFileFrom(raw, date)
      const day = days[date]
      const snapshot = day?.snapshot ?? createDay({ date, changes: rd.settings, templates, lectures, dayFile: file, holidays: marketDay, at: null })
      const moved = wakeChange(snapshot, file, wakeMin, day?.keep)
      let after = setDayField(raw, 'wakeMin', wakeMin)
      for (const b of moved) after = putBlock(after, b)
      const from = new Map(file.blocks.map((b) => [b.id, b.startMin!]))
      was.set(date, { wake: file.wakeMin, next: wakeMin, after, moved: moved.map((b) => ({ id: b.id, from: from.get(b.id)!, to: b.startMin! })) })
      return editOf(paths.day(date), before, after)
    })
  })
  if (!isSaved(out)) return false
  const count = [...was.values()].reduce((n, w) => n + w.moved.length, 0)
  if (count) undoToast(`Pobudka ${wakeMin != null ? logicalClock(wakeMin) : 'z typu dnia'}: przesunięto ${countLabel(count, 'blok', 'bloki', 'bloków')}`, () => void undoWake(was))
  return true
}

/**
 * A change of wake taken back, over the file as it is now: the wake only when it is still the one this change set, and each
 * moved block only when it is still where this change put it – anything changed since stays.
 */
function undoWake(was: WakeWas): Promise<EditOutcome[] | null> {
  const dates = [...was.keys()]
  return trySaveWith(async () => {
    const now = await dayFilesNow(dates, (d) => was.get(d)?.after ?? null)
    return dates.map((date) => {
      const before = now[date] ?? null
      const w = was.get(date)!
      const raw = dayRaw(before, date)
      const file = dayFileFrom(raw, date)
      let after = file.wakeMin === w.next ? setDayField(raw, 'wakeMin', w.wake) : raw
      for (const m of w.moved) {
        const b = file.blocks.find((x) => x.id === m.id)
        if (b && b.startMin === m.to) after = putBlock(after, { ...b, startMin: m.from })
      }
      return editOf(paths.day(date), before, after)
    })
  })
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
