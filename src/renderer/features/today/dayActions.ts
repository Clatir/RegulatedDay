/**
 * Edits of a day's plan from the main window, as edits of its file (spec „Przyszłe dni przechowują tylko Twoje zmiany”):
 * a block put in (a new one or a change of one), taken out (yours) or cancelled (the template's, a session, a lecture) –
 * with „Cofnij” for 10 s – moved to another day, the day copied to other days. Actions of the day (approval, exception,
 * parking) are events of its log. Every edit is made in its turn from the file as it is then (A6-01); the window's
 * version (`seen`) only stands in for a file that cannot be read now.
 */
import type { EditEntry, EditOutcome, RawRecord, TimerIn, TimerResult } from '@shared/api'
import { blockJson, blockNow, dayRaw, patchedBlock, putBlock, setAsked, setCancelled, setDayField, takeBlock } from '@shared/data/dayEdits'
import { editStands, inverseEdit } from '@shared/data/merge'
import { pushedStarts, takenNotice, type DayChange, type ParallelChange } from './dayPush'
import { pushedText } from '@shared/engine/pushApart'
import { hiddenBlocksAmong } from '../calendars/calendarFilter'
import { paths } from '@shared/data/paths'
import { marketDay } from '@shared/calendar/holidays'
import { deadlineSkippedRaw } from '@shared/engine/caseDates'
import { namingOf, snapshotOf } from '@shared/engine/context'
import { begunIds, foldFacts } from '@shared/engine/facts'
import type { Freed } from '@shared/engine/gaps'
import { gridOf } from '@shared/engine/grid'
import type { AnyEvent } from '@shared/model/events'
import { createDay } from '@shared/engine/createDay'
import { copiedDay, moveBetweenDays, stayRuleOf, wakeChange } from '@shared/engine/planEdit'
import type { DayContext, DayState } from '@shared/engine/day'
import type { EnergyState } from '@shared/engine/energy'
import { cheapestSwap, energyOrderVariant, lowestEnergy, reserveWarned, type CheapestSwap } from '@shared/engine/energyOrder'
import type { Variant } from '@shared/engine/variants'
import { blockName, nameById, type Names } from '@shared/blockName'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import { countLabel, logicalClock, plDate, plural } from '@shared/format'
import { keptText } from '@shared/groupText'
import type { DaySnapshot } from '@shared/model/events'
import { attachmentUndoOf, ownAttachmentIds, removalEdits, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import { dayFilesNow, editOf, isSaved, trySaveWith, useData, withOwner, type SendState } from '../../store/data'
import { countedDay, dayUsable, type DayModel } from '../../store/day'
import { skipCheckin, toast, undoToast, useUi } from '../../store/ui'
import { checkinSkipId } from '@shared/engine/reminders'
import { MOVE_GONE_TEXT, movedDay, stayedOf, type Stayed, type WeekPush, type WeekPushedDay } from '../../store/weekPush'
import { GONE_DAYS, proposalMemory, type ProposalDay } from './proposalMemory'

/** The edit of a day's file `before` (null: none yet, it is made) by `next` – null when it changes nothing. */
export function dayFileEdit(date: string, before: RawRecord | null, next: (raw: RawRecord) => RawRecord): EditEntry | null {
  return editOf(paths.day(date), before, next(dayRaw(before, date)))
}

/** The day's file changed by `next` from its version in its turn; null when nothing could be sent (the toast said why). */
export function saveDay(date: string, seen: RawRecord | null, next: (raw: RawRecord) => RawRecord, state?: SendState): Promise<EditOutcome[] | null> {
  return trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    return [dayFileEdit(date, before, next)]
  }, state)
}

/**
 * A new block saved by itself (D461) says so for 10 s with „Cofnij”: the blocks taken out of their days' files again (each day in its
 * own edit, as the file is then – a change made meanwhile to another block stays). Nothing for a save that pushed blocks apart: the
 * bar's or the week's line „Cofnij” takes the whole edit back.
 */
export function newBlocksToast(added: ReadonlyArray<{ date: string; id: string }>): void {
  const n = added.length
  if (!n) return
  undoToast(n === 1 ? 'Dodano blok' : `Dodano ${n} ${plural(n, 'blok', 'bloki', 'bloków')}`, () => void Promise.all(added.map((a) => saveDay(a.date, null, (raw) => takeBlock(raw, a.id)))))
}

// The block as the day's file holds it, and its fields changed over it – pure, in `dayEdits` (the group's changes use them too, D528).
export { blockNow, patchedBlock }

/**
 * Fields of a block changed (the panel of a block): over the block as the file holds it in its turn, so a change made a
 * moment before stays (A6-01).
 */
export function patchDayBlock(date: string, seen: RawRecord | null, b: PlanBlock, patch: Partial<PlanBlock>, state?: SendState): Promise<EditOutcome[] | null> {
  return saveDay(date, seen, (raw) => patchedBlock(raw, date, b, patch), state)
}

/**
 * A change of a block saved (D305, D365, D492): its fields over the block as the file holds it in its turn (a new block – whole),
 * after the other blocks of its group the change writes (`others` – it left the group as its first block, T1166), each over
 * the block as the file holds it then.
 */
export function putChange(raw: RawRecord, date: string, plan: readonly PlanBlock[], c: { was: PlanBlock | null; block: PlanBlock; patch: Partial<PlanBlock>; others: ReadonlyArray<{ id: string; patch: Partial<PlanBlock> }> }): RawRecord {
  let r = raw
  for (const o of c.others) {
    const b = plan.find((x) => x.id === o.id)
    if (b) r = patchedBlock(r, date, b, o.patch)
  }
  return c.was ? patchedBlock(r, date, c.was, c.patch) : putBlock(r, c.block)
}

/**
 * After a saved change that took a buffer of decompression (D386, D582): a block of work – the toast „Na miejscu dekompresji po <blok>”
 * (the names of the window now); another block, or none taken – nothing.
 */
export function tellTaken(day: { ctx: DayContext; state: DayState }, c: Pick<DayChange, 'block' | 'takes'>): void {
  const { rd, routines, requests } = useData.getState()
  const names: Names = { rd, settings: day.ctx.snapshot.settings, routines, requests }
  const notice = takenNotice(day, c, (b) => blockName(b, names))
  if (notice) toast(notice, 'info')
}

/** The day's file with the buffer of decompression a block of work took (D386, D582) cancelled for the day – nothing taken: as it is. */
export const withTaken = (raw: RawRecord, taken: PlanBlock | null | undefined): RawRecord => (taken ? setCancelled(raw, taken.id, true) : raw)

/** A block the change pushes apart (D367): the block as the window knows it, and its new planned start. */
export interface PushedStart {
  block: PlanBlock
  startMin: number
}

/**
 * The day's file with a change (`change`, made over the file as it is in its turn – a block put in, or one block's
 * fields) and the starts of the blocks it pushes apart (D367), each over that block as the file holds it then.
 */
export function withPushed(raw: RawRecord, date: string, change: (raw: RawRecord) => RawRecord, pushed: readonly PushedStart[]): RawRecord {
  let after = change(raw)
  for (const p of pushed) after = putBlock(after, { ...blockNow(after, date, p.block), startMin: p.startMin })
  return after
}

/** The fields of a block that make its place in the plan (a block a change counts on, `countedPlanStands`). */
const PLACE_FIELDS = ['startMin', 'durationMin', 'anchor', 'fixed', 'alongside', 'categoryId'] as const

/** A place on the plan's axis (logical minutes). */
type Span = { startMin: number; endMin: number }

/** What a change of the plan was counted on and what it moves or puts (`countedPlanStands`). */
export interface CountedOn {
  /** The day's file the window saw (its own starts – never those the buffers of decompression lay over the plan, T2877). */
  seen: RawRecord | null
  /**
   * The day the window counted the change on: its plan of the file (`basePlan ?? plan` – without the buffers) and its snapshot's blocks
   * (a block of a template or a series not in the file). Left out – the blocks of the seen file stand for the plan.
   */
  ctx?: Pick<DayContext, 'plan' | 'basePlan' | 'snapshot'>
  /** The blocks it moves, each from its place to its new start. */
  starts: readonly PushedStart[]
  /** The blocks it counts on that it does not move (the block a regeneration stands before): unchanged. */
  kept?: readonly PlanBlock[]
  /** What it puts in (the regeneration's place). */
  spans?: readonly Span[]
}

/**
 * The plan a change was counted on still stands in the day's file in its turn (T2870, T2877, T2878, T2920–T2924):
 * - every block it moves stands where the window's plan had it (the file's own start, without the buffers), or at its new start already
 *   (another computer, an earlier click: nothing left to write there); every block it counts on (`kept`) has its place unchanged;
 * - every block of the window's plan on a place it moves or puts (each place on its own – the old and the new one of each block, T2923)
 *   is still there: not taken out of the file, cancelled nor moved to another day (T2924);
 * - no block the window's plan did not have (T2920: a block of a template written to the file by another „Ułóż” is not new; one restored
 *   since – an undone cancel, T2921 – is) stands on such a place in the foreground – the same proposal clicked on another computer, a block
 *   put in the gap meanwhile (T2878); a block anchored to another stands where its anchor ends (T2923).
 * False: the change was counted on a plan that is no more – nothing may be written over it.
 */
export function countedPlanStands(raw: RawRecord, date: string, c: CountedOn): boolean {
  const now = dayFileFrom(raw, date)
  const seen = dayFileFrom(dayRaw(c.seen, date), date)
  const plan = c.ctx ? (c.ctx.basePlan ?? c.ctx.plan) : seen.blocks
  const fileNow = new Map(now.blocks.map((b) => [b.id, b]))
  const fileSeen = new Map(seen.blocks.map((b) => [b.id, b]))
  const known = new Map(plan.map((b) => [b.id, b]))
  const snapshot = new Map((c.ctx?.snapshot.blocks ?? []).map((b) => [b.id, b]))
  const left = new Set([...now.cancelled, ...Object.keys(now.movedTo)])
  // The block as the window's plan had it (its own start), else as it was given.
  const wasOf = (b: PlanBlock): PlanBlock => fileSeen.get(b.id) ?? known.get(b.id) ?? b
  // The block as the file holds it now; one of the snapshot not in the file – as the plan had it; one gone (taken out of the file, cancelled,
  // moved to another day) – null.
  const nowOf = (b: PlanBlock): PlanBlock | null => (left.has(b.id) ? null : (fileNow.get(b.id) ?? (fileSeen.has(b.id) ? null : wasOf(b))))
  const kept = c.kept ?? []
  const moved = c.starts.every((p) => {
    const x = nowOf(p.block)
    return x != null && (x.startMin === wasOf(p.block).startMin || x.startMin === p.startMin)
  })
  const placed = kept.every((b) => {
    const x = nowOf(b)
    const was = wasOf(b)
    return x != null && PLACE_FIELDS.every((k) => (x[k] ?? null) === (was[k] ?? null))
  })
  if (!moved || !placed) return false
  // Each place the change moves from, moves to or puts (never one span from the first to the last – T2923).
  const places: Span[] = [
    ...(c.spans ?? []),
    ...c.starts.flatMap((p) => {
      const from = wasOf(p.block).startMin
      const to = { startMin: p.startMin, endMin: p.startMin + p.block.durationMin }
      return from == null ? [to] : [{ startMin: from, endMin: from + p.block.durationMin }, to]
    })
  ]
  if (!places.length) return true
  // Where a block stands on the plan's axis: its own start, else the end of the block it is anchored to (a few steps at most).
  const lookup = (id: string): PlanBlock | undefined => fileNow.get(id) ?? known.get(id) ?? snapshot.get(id)
  const placeOf = (b: PlanBlock, depth = 0): Span | null => {
    if (b.startMin != null) return { startMin: b.startMin, endMin: b.startMin + b.durationMin }
    const anchor = b.anchor != null && depth < 8 ? lookup(b.anchor) : undefined
    const at = anchor ? placeOf(anchor, depth + 1) : null
    return at ? { startMin: at.endMin, endMin: at.endMin + b.durationMin } : null
  }
  const across = (b: PlanBlock) => {
    const at = b.background === true ? null : placeOf(b)
    return at != null && places.some((s) => at.startMin < s.endMin && at.endMin > s.startMin)
  }
  const mine = new Set([...c.starts.map((p) => p.block.id), ...kept.map((b) => b.id)])
  // A block of the window's plan on such a place, gone since (T2924).
  if (plan.some((b) => !mine.has(b.id) && across(b) && nowOf(b) == null)) return false
  // A block the plan did not have – new in the file, or one of the snapshot whose cancel was undone since (T2920, T2921).
  const restored = seen.cancelled.filter((id) => !left.has(id) && !known.has(id)).flatMap((id) => {
    const b = fileNow.get(id) ?? snapshot.get(id)
    return b ? [b] : []
  })
  const fresh = [...now.blocks.filter((b) => !known.has(b.id) && !left.has(b.id)), ...restored]
  return !fresh.some((b) => !mine.has(b.id) && across(b))
}


/**
 * A change of the plan that pushes blocks apart (D367, rozsuwanie): the change and the pushed blocks' new starts as one
 * edit of the day's file, in its turn. Saved – the bar keeps „Przesunięto N bloków · Cofnij” (the main process, as after
 * a variant, D313): its „Cofnij” takes this one edit back, the day's file as it was before it. Nothing pushed – the change
 * alone, as before. `line` false – the window says it with its own „Cofnij” (N3 „Wstaw regenerację tutaj”, as „Dodaj” of the week,
 * D400): the bar gets the marker's trigger only, no second „Cofnij”. `stands` – the plan the change was counted on still stands in
 * the file in its turn (`countedPlanStands`); it does not – nothing is written, `sent.changed`.
 */
export async function pushDayBlocks(
  date: string,
  seen: RawRecord | null,
  change: (raw: RawRecord) => RawRecord,
  pushed: readonly PushedStart[],
  sent: { entry: EditEntry | null; made: RawRecord | null; changed?: boolean } = { entry: null, made: null },
  line = true,
  stands?: (raw: RawRecord) => boolean
): Promise<EditOutcome[] | null> {
  const out = await trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    sent.changed = stands != null && !stands(dayRaw(before, date))
    if (sent.changed) return []
    const after = withPushed(dayRaw(before, date), date, change, pushed)
    sent.entry = editOf(paths.day(date), before, after)
    sent.made = sent.entry?.create ? after : null
    return [sent.entry]
  })
  if (isSaved(out) && sent.entry && pushed.length) {
    try {
      await (line ? window.rd.planPushed(date, pushed.length, sent.entry, sent.made) : window.rd.planPushed(date, pushed.length, sent.entry, sent.made, false))
    } catch {
      // The plan is saved; only the bar's „Cofnij” of it is missing (the main process is closing).
    }
  }
  return out
}

/**
 * A block dropped onto another one saved (D492): the change and the blocks it pushes apart as one edit of the day (`pushDayBlocks`),
 * then said – `text` („Równolegle z …”, or the note of a full group): nothing pushed – with „Cofnij” for 10 s (the edit taken back
 * while the file stands as it left it); pushed – the bar's line „Przesunięto N bloków · Cofnij” takes it back, the window only
 * says it (as a new block, `newBlocksToast`).
 */
export async function saveParallel(date: string, seen: RawRecord | null, plan: readonly PlanBlock[], c: ParallelChange, openId: string | null): Promise<EditOutcome[] | null> {
  const sent: { entry: EditEntry | null; made: RawRecord | null } = { entry: null, made: null }
  const pushed = pushedStarts(plan, c)
  // D428: blocks of an unchecked calendar pushed too – the window says so (the bar's line never does), as after a drag.
  const hidden = hiddenBlocksAmong(pushed.map((p) => p.block), openId)
  const text = hidden ? `${c.text} · ${pushedText(pushed.length, hidden)}` : c.text
  const out = await pushDayBlocks(date, seen, (r) => putChange(r, date, plan, c), pushed, sent)
  if (!isSaved(out) || !sent.entry) return out
  if (pushed.length) toast(text, 'info')
  else undoEditToast(date, sent.entry, sent.made, text)
  return out
}

/**
 * A saved edit of a day said for 10 s with „Cofnij” (D492): the edit taken back in its turn while the file stands as it left it
 * (`editStands`, `inverseEdit` – a field changed since is a question); changed since – it stays, and the toast says so.
 */
export function undoEditToast(date: string, entry: EditEntry, made: RawRecord | null, text: string, onUndone?: () => void): void {
  undoToast(text, () => {
    let stood = true
    void trySaveWith(async () => {
      const now = (await dayFilesNow([date], () => null))[date] ?? null
      stood = editStands(entry, now, made)
      return [stood ? inverseEdit(entry, now, made) : null]
    }).then((o) => {
      if (isSaved(o) && !stood) toast(PLAN_CHANGED_TEXT, 'info', 6000)
      // `onUndone` – the edit taken back (the cheapest swap's proposal comes back at once, T2643).
      else if (isSaved(o)) onUndone?.()
    })
  })
}

/** The words of a „Cofnij” that came too late (the day's plan changed since the edit). */
export const PLAN_CHANGED_TEXT = 'Plan zmienił się od tej zmiany – zostaje tak, jak jest teraz.'

/** The key of the morning plan's answer „Zostaw” to „Ułóż pod energię” in the day's `asked` (D377). */
export const ENERGY_ORDER_ASKED = 'energyOrder'

/**
 * The morning plan's „Ułóż pod energię” (D369, D374, D377): the variant of today's plan, or null – none, or left („Zostaw”)
 * for the day (its answer in the day's file, as the plan's other questions: on every computer, to the day's end).
 */
export function energyOrderFor(m: EnergyOrderDay, names: Names): Variant | null {
  if (m.dayFile?.asked[ENERGY_ORDER_ASKED] != null) return null
  const naming = namingOf(m.ctx, m.state.facts)
  return energyOrderVariant(m.ctx, m.state, m.energy, (b) => nameById(b.id, naming, names))
}

/** What the morning plan counts „Ułóż pod energię” on: the day as counted (`DayModel`). */
type EnergyOrderDay = { ctx: DayContext; state: DayState; energy: EnergyState; dayFile: DayFile | null }

/** The minutes of the clock one count of „Ułóż pod energię” holds for at most (T616). */
export const ENERGY_ORDER_HOLD_MIN = 5

/**
 * What „Ułóż pod energię” depends on in the day counted at a minute (T616): the plan and the snapshot, the routines' costs (D512,
 * T2627), the wake of the day and of the next one and the bedtime's forecast (where the lowest energy is looked for), the log, the energy module and
 * the calibration, the lowest energy from now, the answer „Zostaw”, where the forecast places the blocks (a running one by
 * its end – its start is now) and the clock in steps of `ENERGY_ORDER_HOLD_MIN` (the lowest from now moves with the time).
 * The window's count every 30 s changes it at most every 5 min, a block due now (placed at now) – each minute.
 */
export function energyOrderKey(m: EnergyOrderDay): string {
  const places = m.state.forecast.map((p) => `${p.block.id}:${p.running ? '' : p.from}:${p.to}:${p.bg ? 1 : 0}`).join(',')
  const last = m.ctx.events.at(-1) as { id?: unknown } | undefined
  return [
    JSON.stringify(m.ctx.plan),
    JSON.stringify(m.ctx.snapshot),
    // The costs of the routines (D512): a cost changed in „Rutyny” changes the blocks' costs, not the plan nor the log.
    JSON.stringify(m.ctx.routineCosts ?? null),
    m.ctx.wakeMin,
    m.ctx.nextWakeMin,
    m.state.bedtime.forecast,
    Math.floor(m.state.now / ENERGY_ORDER_HOLD_MIN),
    m.ctx.events.length,
    String(last?.id ?? ''),
    m.energy.enabled,
    m.energy.variants,
    lowestEnergy(m.energy) ?? '',
    m.dayFile?.asked[ENERGY_ORDER_ASKED] ?? '',
    places
  ].join('|')
}

/** The last variant counted for the morning plan, by its key and the names it was named with. */
let lastOrder: { key: string; names: Names; value: Variant | null } | null = null

/** The same names: the settings are in the key; the window makes `Names` anew at each count, its lists stay. */
const sameNames = (a: Names, b: Names) => a.rd === b.rd && a.routines === b.routines && a.requests === b.requests

/**
 * `energyOrderFor` counted again only when its key changes (T616): the search (orders of each gap, the day counted again)
 * runs in the window's thread – not for a count of the day that only moved the clock within its step.
 */
export function energyOrderCached(m: EnergyOrderDay, names: Names): Variant | null {
  const key = energyOrderKey(m)
  if (lastOrder && lastOrder.key === key && sameNames(lastOrder.names, names)) return lastOrder.value
  const value = energyOrderFor(m, names)
  lastOrder = { key, names, value }
  return value
}

/** The memory of `energyOrderCached` emptied (tests: one file's day never answers for another's). */
export function resetEnergyOrderCache(): void {
  lastOrder = null
}

/** The window's note when „Ułóż” finds the plan as it would make it (D379). */
export const PLAN_ALREADY_TEXT = 'Plan już jest tak ułożony.'

/** „Zostaw” of the morning plan's „Ułóż pod energię” (D377): the card does not come back that day. */
export function leaveEnergyOrder(date: string, seen: RawRecord | null): Promise<EditOutcome[] | null> {
  return saveDay(date, seen, (r) => setAsked(r, ENERGY_ORDER_ASKED, 'leave'))
}

/**
 * „Pomiń” of a sprawa on the morning plan's card of due dates (D409, T855): its answer in the day's `asked` – the card
 * leaves it out to the day's end, on every computer (`deadlineCases`). „Na Dziś” is `moveCase(id, 'today')`.
 */
export function skipDeadline(date: string, seen: RawRecord | null, id: string): Promise<EditOutcome[] | null> {
  return saveDay(date, seen, (r) => deadlineSkippedRaw(r, date, id))
}

/** The new starts of „Ułóż pod energię” (D369) as blocks of the plan the window knows (one gone from it meanwhile – left out). */
export function variantStarts(plan: readonly PlanBlock[], v: Pick<Variant, 'changes'>): PushedStart[] {
  return v.changes.flatMap((c) => {
    const block = c.k === 'start' ? plan.find((b) => b.id === c.block) : undefined
    return block && c.k === 'start' ? [{ block, startMin: c.startMin }] : []
  })
}

/**
 * „Ułóż pod energię” from the morning plan (D369, D374): the new starts as one edit of today's file, in its turn, each over
 * the block as the file holds it then. Saved – the bar keeps „Przestawiono: <label> · Cofnij” (the main process, as after
 * a variant picked in the bar, D313): its „Cofnij” takes this one edit back.
 */
export async function arrangeDayBlocks(date: string, seen: RawRecord | null, starts: readonly PushedStart[], label: string, ctx?: CountedOn['ctx']): Promise<{ out: EditOutcome[] | null; already: boolean }> {
  const { out, sent } = await saveStarts(date, seen, starts, ctx)
  if (sent.already) return { out, already: true }
  if (isSaved(out) && sent.entry) {
    try {
      await window.rd.planArranged(date, label, sent.entry, sent.after)
    } catch {
      // The plan is saved; only the bar's „Cofnij” of it is missing (the main process is closing).
    }
  }
  return { out, already: false }
}

/**
 * New starts of blocks as one edit of the day's file, in its turn, each over the block as the file holds it then („Ułóż”, „Zamień”).
 * `sent.already` – the file in its turn already so (another computer, an earlier click): nothing written, the note said (D379, T622);
 * `sent.changed` – the plan the starts were counted on is no more in the file (a block moved meanwhile – an earlier click, another
 * computer, `countedPlanStands`, T2870): nothing written, the window says `PLAN_CHANGED_TEXT`; `sent.entry` – the edit sent,
 * `sent.after` – the file it made when it had none.
 */
async function saveStarts(date: string, seen: RawRecord | null, starts: readonly PushedStart[], ctx?: CountedOn['ctx']): Promise<{ out: EditOutcome[] | null; sent: { already: boolean; changed: boolean; entry: EditEntry | null; after: RawRecord | null } }> {
  const sent: { made: boolean; already: boolean; changed: boolean; entry: EditEntry | null; after: RawRecord | null } = { made: false, already: false, changed: false, entry: null, after: null }
  const out = await trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    sent.changed = !countedPlanStands(dayRaw(before, date), date, { seen, ctx, starts })
    if (sent.changed) return []
    const after = withPushed(dayRaw(before, date), date, (r) => r, starts)
    sent.made = true
    sent.entry = editOf(paths.day(date), before, after)
    sent.after = sent.entry?.create ? after : null
    return [sent.entry]
  })
  if (sent.changed) toast(PLAN_CHANGED_TEXT, 'info', 6000)
  else if (sent.made && !sent.entry) {
    sent.already = true
    toast(PLAN_ALREADY_TEXT, 'info')
  }
  return { out, sent }
}

/** The words of „Najtańsza zamiana” (N22, T2624): the line by the warning of energy and the toast after „Zamień”. */
export const swapLineText = (a: string, b: string, s: Pick<CheapestSwap, 'before' | 'after'>): string => `Najtańsza zamiana: ${a} ↔ ${b} – najniższa energia dnia ${s.before} → ${s.after}`
export const swappedText = (a: string, b: string): string => `Zamieniono: ${a} ↔ ${b}`

/**
 * „Zamień” of the cheapest swap (N22, D598, T2625): its new starts as one edit of the day's file, the way of „Ułóż” (`saveStarts`) –
 * but no line in the bar (D229: the bar stays as it is): the window says „Zamieniono: A ↔ B” for 10 s with „Cofnij” (the edit taken
 * back while the file stands as it left it, `undoEditToast`; a block changed since – it stays, and the toast says so) – with the
 * blocks of an unchecked calendar it moves said (`swapToastText`, D428, T2630, T2637); `openId` – the block whose panel is open (shown
 * in spite of its calendar, D427). The swap is done (`swapGone`, T2643) before the save starts – no line shows it while the save
 * runs, nor after (a new file or a new key on the way) – and not done again when the save fails, or when its „Cofnij” takes it back
 * (the proposal comes back at once).
 */
export async function swapDayBlocks(date: string, seen: RawRecord | null, starts: readonly PushedStart[], swap: Pick<CheapestSwap, 'a' | 'b' | 'changes'>, text: string, openId: string | null = null, ctx?: CountedOn['ctx']): Promise<{ out: EditOutcome[] | null; already: boolean; saved: boolean }> {
  swapGone(date, swap)
  const { out, sent } = await saveStarts(date, seen, starts, ctx)
  if (sent.already) return { out, already: true, saved: false }
  const saved = isSaved(out) && sent.entry != null
  if (saved) undoEditToast(date, sent.entry!, sent.after, swapToastText(text, starts, [swap.a, swap.b], openId), () => swapBack(date, swap))
  else swapBack(date, swap)
  return { out, already: false, saved }
}

/**
 * The toast of „Zamień” with what an unchecked calendar hides among the blocks it moves (D428, T2637), as the window's other lines
 * say it: one of the pair hidden – at the pair, „Zamieniono: A ↔ B (1 ukryty)”; hidden among the other blocks it moves (those after
 * `a` laid out anew, T2631) – „· Przesunięto 2 bloki (w tym 1 ukryty)”, counting only those other blocks. Nothing hidden – the words.
 */
export function swapToastText(text: string, starts: readonly PushedStart[], pair: readonly [string, string], openId: string | null = null): string {
  const inPair = starts.filter((p) => pair.includes(p.block.id)).map((p) => p.block)
  const others = starts.filter((p) => !pair.includes(p.block.id)).map((p) => p.block)
  const pairHidden = hiddenBlocksAmong(inPair, openId)
  const othersHidden = hiddenBlocksAmong(others, openId)
  const atPair = pairHidden ? ` (${countLabel(pairHidden, 'ukryty', 'ukryte', 'ukrytych')})` : ''
  return `${text}${atPair}${othersHidden ? ` · ${pushedText(others.length, othersHidden)}` : ''}`
}

/** What the cheapest swap is counted on: the day as counted (`DayModel`). */
type SwapDay = ProposalDay

/** The days the swaps done are kept for (T2640). */
export { GONE_DAYS }

/** A swap by what it does (T2643): its two blocks and the new starts it writes. */
export const swapSignature = (s: Pick<CheapestSwap, 'a' | 'b' | 'changes'>): string =>
  `${s.a}|${s.b}|${s.changes.map((c) => (c.k === 'start' ? `${c.block}@${c.startMin}` : c.k)).join(',')}`

/**
 * The memory of the cheapest swap (N22, `proposalMemory`): the last swap counted (T2624) by the day's key – as „Ułóż pod energię”
 * (T616) – and its date (T2633); the swaps done by date and their own words (`swapSignature`, T2628, T2634, T2638, T2640, T2643) –
 * „Zamień” saving it, saved, or finding the plan already so; no line of that day shows that swap, whatever key it is counted for. Held
 * while a new key is counted only with both its blocks in the plan (T2639).
 */
export const swapMemory = proposalMemory<CheapestSwap>({
  what: 'Najtańsza zamiana',
  search: (m) => cheapestSwap(m.ctx, m.state, m.energy),
  signature: swapSignature,
  holds: (m, s) => m.ctx.plan.some((b) => b.id === s.a) && m.ctx.plan.some((b) => b.id === s.b)
})

/**
 * What the cheapest swap of a day depends on (T2624, T2636): its date and what „Ułóż pod energię” depends on (`energyOrderKey`);
 * null – no warning of energy at the reserve, nothing to count (the side panel renders at every count of the day). Once per day
 * counted – the window passes it on to `cheapestSwapPeek` and `cheapestSwapCached`.
 */
export const cheapestSwapKeyOf = (m: SwapDay): string | null => (reserveWarned(m.energy) ? `${m.date}|${energyOrderKey(m)}` : null)

/**
 * The cheapest swap of a day (N22) counted again only when the day changes (`cheapestSwapKeyOf`, T616): the search runs in the
 * window's thread – not for a count of the day that only moved the clock within its step. Null – none (the engine says why). A
 * search that throws (T2641) is said in the console and remembered as none for its key – the line never waits on it again.
 */
export function cheapestSwapCached(m: SwapDay, key: string | null = cheapestSwapKeyOf(m)): CheapestSwap | null {
  return swapMemory.cached(m, key)
}

/** What the line of the cheapest swap shows without the search (T2632, T2633): `fresh` – counted for this key, `due` – to count. */
export interface SwapSeen {
  swap: CheapestSwap | null
  fresh: boolean
  due: boolean
}

/**
 * The cheapest swap as far as it is known without the search (T2632): counted for the day's key – that one; not yet – the swap
 * this line showed last (`shownKey`, T2639), while it is still the last counted, of the same day and both its blocks still in the
 * plan – not fresh (T2633: the line stays while the new key is counted, „Zamień” waits); anything else – none. A swap done that day
 * (`swapGone`, by its words – T2643) – none, fresh or held. `key` null – nothing (no warning).
 */
export function cheapestSwapPeek(m: SwapDay, key: string | null, shownKey: string | null = null): SwapSeen {
  const { value, fresh, due } = swapMemory.peek(m, key, shownKey)
  return { swap: value, fresh, due }
}

/**
 * The swap is done on its day (T2628, T2634, T2638, T2643): „Zamień” saving it (marked before the save), saved, or the plan already
 * so – no line of the day shows it, in any panel, for any key (another day's stays as it was – T2640).
 */
export function swapGone(date: string, swap: Pick<CheapestSwap, 'a' | 'b' | 'changes'>): void {
  swapMemory.done(date, swapSignature(swap))
}

/** The swap is not done after all (T2643): its save failed, or its „Cofnij” took it back – shown again (while it is the one marked). */
export function swapBack(date: string, swap: Pick<CheapestSwap, 'a' | 'b' | 'changes'>): void {
  swapMemory.back(date, swapSignature(swap))
}

/** The memory of `cheapestSwapCached` and of `swapGone` emptied (tests: one file's day never answers for another's). */
export function resetSwapCache(): void {
  swapMemory.reset()
}

/**
 * Time freed in today's plan, saved (D368: a block not begun removed or shortened – `freedByEdit`): the event `plan.freed`
 * in the day's log (D375 – the bars of every computer ask „Luka N min · Przesuń resztę wcześniej · Zostaw”, also after a
 * restart). Its failure loses only the question – the plan is saved, so no toast.
 */
export async function tellFreed(date: string, freed: Freed | null): Promise<void> {
  if (!freed) return
  try {
    await window.rd.logEvents([{ k: 'plan.freed', day: date, block: freed.block, how: freed.how, place: freed.place, minutes: freed.minutes }])
  } catch {
    // The plan is saved; only the bar's question about the gap is missing.
  }
}

/** The words of „Pomiń” of the check-in: written, not written (the window skips it all the same), „Cofnij” not written. */
export const CHECKIN_SKIPPED_TEXT = 'Pominięto pytania o objawy.'
export const CHECKIN_SKIP_UNSAVED_TEXT = 'Nie zapisano pominięcia – przypomnienie może jeszcze wrócić.'
export const CHECKIN_UNSKIP_UNSAVED_TEXT = 'Nie cofnięto pominięcia w zapisie dnia – spróbuj za chwilę.'

/**
 * „Pomiń” of the morning's check-in (UX13). Nothing waits on the log (D72): the window skips it at once (`skipCheckin`, D563 B5),
 * then the day's log gets its mark in the background (`checkinSkipId`, the timer's `mark`) – the card does not ask again after a
 * restart nor on another computer (`checkinOpen`), the morning plan's reminder counts the check-in as done. Written: a toast with
 * „Cofnij” (`unmark` and the window's skip taken off – the log has no other way back). Given before (`answered` – another
 * computer's „Pomiń”): nothing to say. Refused – the day's logs not all readable now (`timerClick`'s answer), or the IPC throws
 * (no data folder open, a write of the log failed): only a toast in our words (never the IPC's „Error invoking remote method”);
 * the card stays skipped here, the reminder may come back. True – in the log.
 */
export async function skipCheckinDay(date: string): Promise<boolean> {
  skipCheckin(date)
  const r = await timerClick({ a: 'mark', question: checkinSkipId(date), answer: 'skip', day: date })
  if (r.ok) {
    undoToast(CHECKIN_SKIPPED_TEXT, () => void unskipCheckinDay(date))
    return true
  }
  if (r.code === 'answered') return true
  toast(CHECKIN_SKIP_UNSAVED_TEXT, 'error')
  return false
}

/** „Cofnij” of „Pomiń”: the window asks the check-in again, and the log's mark is taken back (`unmark`). */
async function unskipCheckinDay(date: string): Promise<void> {
  if (useUi.getState().checkinSkipped === date) useUi.setState({ checkinSkipped: null })
  const r = await timerClick({ a: 'unmark', question: checkinSkipId(date), day: date })
  if (!r.ok) toast(CHECKIN_UNSKIP_UNSAVED_TEXT, 'error')
}

/** A click of the timer whose failure (the IPC throws) is an answer, not an unhandled rejection. */
async function timerClick(req: TimerIn): Promise<TimerResult> {
  try {
    return await window.rd.timer(req)
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e), confirm: null }
  }
}

async function clickTimer(block: string, date: string, a: 'removeBegun' | 'undoRemove'): Promise<{ ok: boolean; why: string | null; code: TimerResult['code'] }> {
  const r = await timerClick({ a, block, day: date })
  return { ok: r.ok, why: r.why ?? null, code: r.code }
}

/**
 * The bottom edge of a running block dropped on the axis (D365): the click `resize` to the instant `to` (ms) – first without
 * `confirm` (up to the boundary it is written at once; past it nothing is written and the answer carries the cost), then
 * with it („Potwierdź”). The IPC throwing is an answer, not an unhandled rejection.
 */
export const clickResize = (block: string, date: string, to: number, confirm: boolean): Promise<TimerResult> => timerClick({ a: 'resize', block, day: date, to, ...(confirm ? { confirm: true } : {}) })

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
  // The block's own attachments go with it in the same edit (D410, T805), laid only once the day's file is (T923): a
  // question about the day keeps them until your answer, „theirs” – live. Its „Cofnij” brings them back.
  let attachments: AttachmentUndo | null = null
  const made = { day: false }
  const out = await trySaveWith(async () => {
    const before = (await dayFilesNow([date], () => seen))[date] ?? null
    const raw = dayRaw(before, date)
    if (!inSnapshot) gone = blockNow(raw, date, b)
    left = inSnapshot ? setCancelled(raw, b.id, true) : takeBlock(raw, b.id)
    const { view, attachments: list } = useData.getState()
    const at = Date.now()
    const removed = removalEdits(view?.attachments ?? [], ownAttachmentIds(list, b.id), at)
    attachments = attachmentUndoOf(removed, at)
    const day = editOf(paths.day(date), before, left)
    made.day = !!day
    return withOwner(day, removed)
  })
  // The day's own entry says what became of the removal (T931): a record of an attachment that met a question is not it.
  const plan = made.day && out ? out.slice(0, 1) : out
  if (!isSaved(plan)) {
    if (ends && refusedEdit(plan)) {
      const r = await clickTimer(b.id, date, 'undoRemove')
      if (!r.ok) toast(`Blok „${name}” nie otworzył się z powrotem: ${r.why ?? 'spróbuj „Pracuję”'} – został poza planem.`, 'error', 8000)
    }
    return false
  }
  const restore = async () => {
    // One edit: the day back and, with it, its attachments (T931).
    const was = { day: false }
    const back = await trySaveWith(async () => {
      const before = (await dayFilesNow([date], () => left))[date] ?? null
      const day = dayFileEdit(date, before, (raw) => (inSnapshot ? setCancelled(raw, b.id, false) : putBlock(raw, gone)))
      was.day = !!day
      return withOwner(day, attachments ? restoreEdits(useData.getState().view?.attachments ?? [], attachments) : [])
    })
    if (!isSaved(was.day && back ? back.slice(0, 1) : back)) return
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
  const { rd, templates, lectures, seriesPlans, routines } = useData.getState()
  const data = await window.rd.dayData(date)
  // A day that cannot be read whole now says nothing sure about its blocks that have begun: nothing is written – except
  // the day as last read with the data folder away (its change waits for the folder, E8b.1).
  if (!dayUsable(data)) throw new Error('log albo plik tego dnia jest teraz nieczytelny – spróbuj za chwilę')
  const events = data.events as AnyEvent[]
  const dayFile = data.dayFile ? dayFileFrom(data.dayFile, date) : null
  const { snapshot } = snapshotOf({ changes: rd.settings, templates, lectures, series: seriesPlans, routines }, { date, events, dayFile, nextFile: null }, marketDay, Date.now())
  return { snapshot, keep: begunIds(foldFacts(gridOf(date), events)) }
}

/**
 * A change of wake of days from the calendar (D334): today as the engine has it (`wakeDayOf`), the rest from the files. Whole
 * inside the caller's busy state; a day that cannot be read now, or a bridge that fails, is said and nothing is written.
 */
export async function setWakeOnDays(dates: readonly string[], today: string, seen: (date: string) => RawRecord | null, wakeMin: number | null, group?: WakeGroup): Promise<boolean> {
  try {
    const days = dates.includes(today) ? { [today]: await wakeDayOf(today) } : {}
    return await setDayWake(dates, seen, wakeMin, days, group)
  } catch (e) {
    toast(`Nie zapisano pobudki: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000)
    return false
  }
}

/**
 * What a change of wake of two or more days says to the calendar's line (D529): how many days it changed and its „Cofnij” – every day back to
 * its wake (and its blocks to their places) only while it stands as this change left it; the answer is the words about the days changed since
 * (they stay as they are), or none. Given, the line replaces the toast of the moved blocks; a change of one day keeps the toast.
 */
export type WakeGroup = (line: { changed: number; undo: () => Promise<string | void> }) => void

type WakeWas = Map<string, { wake: number | null; next: number | null; after: RawRecord; moved: Array<{ id: string; from: number; to: number }> }>

/**
 * The wake of days set (`wakeMin`: the value to store, null – the day follows its type's wake again) and the blocks you
 * placed moved with it, once, in the same write (D334, replaces T450 for those blocks): the blocks of the snapshot follow
 * the wake on their own (`dayPlan`), the day's own flexible blocks before the first fixed one move by `wakeChange`.
 * `days` gives a day's engine snapshot and its begun blocks (which stay); a day without it is counted from the files as
 * a day to come. Every day from its file as it is then (A6-01). When blocks moved „Cofnij” for 10 s gives each day its
 * wake and those blocks back – only what is still as this change left it, so a later change stays (A6-07).
 */
export async function setDayWake(dates: readonly string[], seen: (date: string) => RawRecord | null, wakeMin: number | null, days: Readonly<Record<string, WakeDay>> = {}, group?: WakeGroup): Promise<boolean> {
  const { rd, templates, lectures, seriesPlans } = useData.getState()
  const was: WakeWas = new Map()
  // The days this change really changed (a day already at this wake is no change).
  const changed = new Set<string>()
  const out = await trySaveWith(async () => {
    const now = await dayFilesNow(dates, seen)
    changed.clear()
    return dates.map((date) => {
      const before = now[date] ?? null
      const raw = dayRaw(before, date)
      const file = dayFileFrom(raw, date)
      const day = days[date]
      const snapshot = day?.snapshot ?? createDay({ date, changes: rd.settings, templates, lectures, series: seriesPlans, dayFile: file, holidays: marketDay, at: null })
      const moved = wakeChange(snapshot, file, wakeMin, day?.keep)
      let after = setDayField(raw, 'wakeMin', wakeMin)
      for (const b of moved) after = putBlock(after, b)
      const from = new Map(file.blocks.map((b) => [b.id, b.startMin!]))
      was.set(date, { wake: file.wakeMin, next: wakeMin, after, moved: moved.map((b) => ({ id: b.id, from: from.get(b.id)!, to: b.startMin! })) })
      const edit = editOf(paths.day(date), before, after)
      if (edit) changed.add(date)
      return edit
    })
  })
  if (!isSaved(out)) return false
  if (group && changed.size >= 2) {
    const mine: WakeWas = new Map([...was].filter(([d]) => changed.has(d)))
    group({ changed: changed.size, undo: () => undoWakeGroup(mine) })
    return true
  }
  const count = [...was.values()].reduce((n, w) => n + w.moved.length, 0)
  if (count) undoToast(`Pobudka ${wakeMin != null ? logicalClock(wakeMin) : 'z typu dnia'}: przesunięto ${countLabel(count, 'blok', 'bloki', 'bloków')}`, () => void undoWake(was))
  return true
}

/**
 * A change of wake taken back, over the file as it is now: the wake only when it is still the one this change set, and each
 * moved block only when it is still where this change put it – anything changed since stays.
 */
function undoWake(was: WakeWas, kept?: { n: number }): Promise<EditOutcome[] | null> {
  const dates = [...was.keys()]
  return trySaveWith(async () => {
    const now = await dayFilesNow(dates, (d) => was.get(d)?.after ?? null)
    if (kept) kept.n = 0
    return dates.map((date) => {
      const before = now[date] ?? null
      const w = was.get(date)!
      const raw = dayRaw(before, date)
      const file = dayFileFrom(raw, date)
      // The group's „Cofnij” (D529, T1582): a day stands whole or stays whole – its wake changed since, or a moved block of it, and nothing of it is touched.
      if (kept && !(file.wakeMin === w.next && w.moved.every((m) => file.blocks.find((x) => x.id === m.id)?.startMin === m.to))) {
        kept.n++
        return null
      }
      let after = file.wakeMin === w.next ? setDayField(raw, 'wakeMin', w.wake) : raw
      for (const m of w.moved) {
        const b = file.blocks.find((x) => x.id === m.id)
        if (b && b.startMin === m.to) after = putBlock(after, { ...b, startMin: m.from })
      }
      return editOf(paths.day(date), before, after)
    })
  })
}

/** „Cofnij” of the calendar's line after a change of wake of days (D529): a day changed since (its wake or a block it moved) stays whole, its count is the words said (`keptText`). A save that did not go through throws (the line stays). */
async function undoWakeGroup(was: WakeWas): Promise<string | void> {
  const kept = { n: 0 }
  const out = await undoWake(was, kept)
  if (!isSaved(out)) throw new Error('not saved')
  return kept.n ? keptText(kept.n, 'day') : undefined
}

/** What „Przenieś na…” came to: the write's outcome, and the move for its „Cofnij” (`tellMoved`; null – nothing saved). */
export interface DayMoved {
  out: EditOutcome[] | null
  push: WeekPush | null
}

/**
 * A block moved to another day (spec „Przeniesienie”): it leaves this day (its id stays, the move is noted), comes to
 * the target with the day it came from and one move more when you moved it – with the blocks anchored to it that go (D424,
 * D426, T951, T961, T980; one begun, parked, cancelled or of a kind that keeps its day stays with its own hour). The day is
 * counted in the turn of the write (T964): a block that began after the window was drawn stays, and a block no longer in its
 * plan (moved or removed elsewhere) is not moved – „Nie zapisano: …” (T983); a day that cannot be counted now – as the window
 * saw it (`opts.seen`: its plan, facts and names; else `plan`). The target is the owner of the edit, the source goes with it
 * (T952): the block never leaves its day before the target has it. `opts.name`, `opts.names` – the words of „Przeniesiono: …”
 * (`tellMoved`).
 */
export async function moveDayBlock(fromDate: string, fromRaw: RawRecord | null, plan: readonly PlanBlock[], b: PlanBlock, toDate: string, toRaw: RawRecord | null, byYou = true, opts: { name?: string; names?: Names; seen?: Pick<DayModel, 'ctx' | 'state'> } = {}): Promise<DayMoved> {
  const days: WeekPushedDay[] = []
  let stayed: Stayed[] = []
  const out = await trySaveWith(async () => {
    const now = await dayFilesNow([fromDate, toDate], (d) => (d === fromDate ? fromRaw : toRaw))
    const from = now[fromDate] ?? null
    const to = now[toDate] ?? null
    const counted = await countedDay(fromDate, from)
    const day = counted ?? opts.seen ?? null
    const dayPlan = day?.ctx.plan ?? plan
    const was = dayPlan.find((x) => x.id === b.id)
    if (counted && !was) throw new Error(MOVE_GONE_TEXT)
    const block = blockNow(dayRaw(from, fromDate), fromDate, was ?? b)
    const settings = day?.ctx.snapshot.settings ?? opts.names?.settings
    const two = moveBetweenDays(from, to, block, dayPlan, fromDate, toDate, byYou, { stay: settings ? stayRuleOf(day?.state.facts, settings) : undefined })
    stayed = stayedOf(two.stayers, day ? { ctx: day.ctx, facts: day.state.facts } : null, opts.names)
    const bring = editOf(paths.day(toDate), to, two.target)
    const leave = editOf(paths.day(fromDate), from, two.source)
    days.push(...movedDay(fromDate, leave, two.source), ...movedDay(toDate, bring, two.target))
    return withOwner(bring, leave ? [leave] : [])
  })
  const move = { blockId: b.id, name: opts.name ?? 'blok', from: fromDate, to: toDate, ...(stayed.length ? { stayed } : {}) }
  return { out, push: isSaved(out) && days.length ? { days, move } : null }
}

/** The fields a copy of a day sets in its target (spec „Skopiuj ten dzień do…”). */
const COPIED = ['blocks', 'cancelled', 'dayType', 'wakeMin'] as const

/**
 * A day copied to other days (spec „Skopiuj ten dzień do…”): each target takes the copy's type, wake and blocks (new
 * ids), its own template blocks cancelled and its own blocks replaced; sessions and lectures stay the target's.
 * „Cofnij” gives each target back those fields as they were before the copy.
 */
export async function copyDayTo(source: { date: string; plan: readonly PlanBlock[]; dayType: string | null; wakeMin: number | null }, targets: readonly string[], rawOf: (date: string) => RawRecord | null): Promise<boolean> {
  const { rd, templates, lectures, seriesPlans } = useData.getState()
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
      const snap = createDay({ date, changes: rd.settings, templates, lectures, series: seriesPlans, dayFile: dayFileFrom(raw, date), holidays: marketDay, at: null })
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
