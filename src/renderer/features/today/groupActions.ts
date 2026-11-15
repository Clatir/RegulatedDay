/**
 * Zmiany grupowe bloków jednego dnia (D527–D531, ciąg Z): the write of the menu „Zmień N bloków” in „Dziś”. One action for the blocks
 * selected, judged and laid by `engine/groupEdit.ts` on the day as it is in the turn of the write (A6-01 – read and counted then, never
 * what the window drew): one change of the day's file, the blocks pushed apart in it (D367; today the bar's marker of variants only –
 * the window's line has the „Cofnij”, T1541); „Przenieś na dzień” – both days in one edit, the target first (T952). „Odwołaj” /
 * „Zaparkuj” – today's events, judged and written by the main process (`groupLog`, with their ids for „Cofnij”). A block of a series
 * changes as „Tylko to” (D529: the day's own edit, no question – counted for the line's „bloki serii – tylko te dni”). What it answers –
 * how many changed, which were left out and why, the lowest energy before and after, „Cofnij” – the line says (`groupText`, Z1).
 */
import type { EditEntry, GroupLogResult, RawRecord } from '@shared/api'
import { dayRaw, setCancelled, takeBlock } from '@shared/data/dayEdits'
import { deepEqual } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { mayMoveBetween } from '@shared/engine/calendarViews'
import { dayPlan } from '@shared/engine/createDay'
import type { EnergyOptions } from '@shared/engine/energy'
import { freedByEdit, type Freed } from '@shared/engine/gaps'
import {
  begunCostNow,
  fieldDay,
  fieldPatch,
  fieldsUndoOf,
  groupFreed,
  groupEnergy,
  lowestShown,
  judgeGroup,
  movedDays,
  removedDay,
  shiftedDay,
  undoFields,
  undoRemoval,
  type BegunCost,
  type EnergyChange,
  type FieldAction,
  type FieldsUndo,
  type GroupAction,
  type GroupJudged,
  type GroupSkip,
  type RemovalUndo
} from '@shared/engine/groupEdit'
import { stayRuleOf } from '@shared/engine/planEdit'
import { simEvents } from '@shared/engine/sim'
import { attachmentUndoOf, ownAttachmentIds, removalEdits, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import type { Costs } from '@shared/model/categories'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { seriesOfBlock } from '@shared/model/series'
import { logicalDayOf } from '@shared/time/day'
import { editOf, isSaved, logEvents, reloadData, trySaveWith, useData, withOwner, type SendState } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { movedDay, stayedOf, type Stayed, type WeekPush, type WeekPushedDay } from '../../store/weekPush'
import { undoWeekPush } from '../week/weekActions'
import { moveUncountedText, moveUnreadableText, statusOf, type WeekMoveStatus } from '../week/weekMove'
import { onUnsettled } from './dayPush'

/** What a group's „Cofnij” came to: `restored` – the blocks back as they were, `kept` – those changed since, left as they are (D313). */
export interface GroupUndone {
  saved: boolean
  restored: number
  kept: number
}

/**
 * What a group's action came to (D529): `changed` – the blocks it changed (those that went with a moved one too); `skipped` – those it
 * left out, why; `same` – those that had the value already; `seriesOnly` – blocks of a series among the changed (as „Tylko to”);
 * `pushed` – the blocks pushed apart (D367); `energy` – the lowest energy before and after (a day with its forecast, when it changes);
 * `stayed` – „Przenieś na dzień”: the blocks anchored to a moved one that stay on their day (D424); `undo` – null when nothing changed
 * (`at` – the window's clock at the click, tests; left out – now).
 */
export interface GroupDone {
  status: WeekMoveStatus
  changed: number
  skipped: GroupSkip[]
  same: number
  seriesOnly: number
  pushed: number
  energy?: EnergyChange
  stayed?: Stayed[]
  undo: ((at?: number) => Promise<GroupUndone>) | null
}

/** A group's action that changed nothing (refused, not saved, or every block already so / left out): what it says, no „Cofnij”. */
export const groupNone = (status: WeekMoveStatus, skipped: readonly GroupSkip[] = [], same = 0): GroupDone => ({ status, changed: 0, skipped: [...skipped], same, seriesOnly: 0, pushed: 0, undo: null })
const none = groupNone

/** The energy as the day's axis counts it (`useDay`): the module now and the calibration. */
export function energyOptions(): EnergyOptions {
  const s = useData.getState()
  return { moduleOn: s.rd.general.modules.energy, calibration: s.view?.calibration === true }
}

/** The blocks of a series among `ids` – changed as „Tylko to” (D529). */
function seriesOnlyOf(plan: readonly PlanBlock[], ids: readonly string[], date: string): number {
  const list = useData.getState().series
  const byId = new Map(plan.map((b) => [b.id, b]))
  return ids.filter((id) => {
    const b = byId.get(id)
    return b != null && seriesOfBlock(list, b, date) != null
  }).length
}

/** The day's file and the day counted on it (its logs read whole), in the turn of the write – else why not (the toast says it). */
async function countedNow(date: string, at: number): Promise<{ file: RawRecord | null; day: DayModel }> {
  const files = await window.rd.dayFiles([date])
  if (!(date in files)) throw new Error(moveUnreadableText(date))
  const file = files[date] ?? null
  const day = await countedDay(date, file, at)
  if (!day) throw new Error(moveUncountedText(date))
  return { file, day }
}

/**
 * The edit of a day's file from `before` to `after` – none when it changes nothing; a day without a file and nothing to put in it gets none
 * either (never a file of its bare skeleton).
 */
function dayEntry(date: string, before: RawRecord | null, after: RawRecord): EditEntry | null {
  return before == null && deepEqual(after, dayRaw(null, date)) ? null : editOf(paths.day(date), before, after)
}

/** Today's push told to the bar for the marker of variants only (T1541: the line with its „Cofnij” is the window's). */
async function tellBar(date: string, today: string, moved: number, entry: EditEntry | null, made: RawRecord | null): Promise<void> {
  if (date !== today || moved === 0 || !entry) return
  try {
    await window.rd.planPushed(date, moved, entry, made, false)
  } catch {
    // The plan is saved; only the bar's marker is missing (the main process is closing).
  }
}

/** Time freed today (D368: blocks not begun removed or shortened) – one write of `plan.freed` events; its failure loses only the bar's question. */
async function tellFreedAll(date: string, freed: readonly Freed[]): Promise<void> {
  if (!freed.length) return
  try {
    await window.rd.logEvents(freed.map((f) => ({ k: 'plan.freed', day: date, block: f.block, how: f.how, place: f.place, minutes: f.minutes })))
  } catch {
    // The plan is saved; only the bar's question about the gap is missing.
  }
}

/**
 * One action of the menu on the blocks `ids` of day `date` (D528). `at` – the window's clock (tests): „today” is counted from it at the
 * write (the menu may stay open across 04:00).
 */
export function changeDayGroup(date: string, ids: readonly string[], a: GroupAction, o: { at?: number } = {}): Promise<GroupDone> {
  const at = o.at ?? Date.now()
  switch (a.k) {
    case 'cancel':
    case 'park':
      return logGroup(date, ids, a.k, at)
    case 'moveTo':
      return moveGroup(date, ids, a.date, at)
    case 'remove':
      return removeGroup(date, ids, at)
    default:
      return editGroup(date, ids, a, at)
  }
}

/** What an edit of fields or a shift made in its turn (for what is said after it and its „Cofnij”). */
interface EditMade {
  judged: GroupJudged
  entry: EditEntry | null
  after: RawRecord
  undo: FieldsUndo[]
  begun: BegunCost[]
  pushed: number
  energy: EnergyChange | null
  freed: Freed[]
  seriesOnly: number
}

/**
 * The fields of the blocks (a subcategory and variant, a variant, the cost, a routine) or „Przesuń o” ±N min – one change of the day's
 * file, the push apart in it (a day to come, D367). A begun block's cost is the day's `block.cost` from now on (D501), after the file.
 */
async function editGroup(date: string, ids: readonly string[], a: FieldAction | Extract<GroupAction, { k: 'shift' }>, at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  const costs = a.k === 'cost' ? a.costs : null
  const state: SendState = { afterSend: false }
  let made: EditMade | null = null
  const out = await trySaveWith(async () => {
    const { file, day } = await countedNow(date, at)
    const judged = judgeGroup(day, ids, a, today)
    const c = a.k === 'shift' ? { ...shiftedDay(day, file, judged.take, a.minutes, today, onUnsettled), begun: [] as BegunCost[] } : fieldDay(day, file, judged.take, a)
    const entry = dayEntry(date, file, c.raw)
    const events = c.begun.length ? simEvents(day.ctx, c.begun.map((b) => ({ k: 'block.cost', block: b.id, at, costs })), at) : []
    // D368: a block shortened today (a routine's length) frees its end – the bar may ask about the gap.
    const byId = new Map(day.ctx.plan.map((b) => [b.id, b]))
    const freed = date === today && a.k === 'routine' ? judged.take.flatMap((id) => {
      const b = byId.get(id)
      const f = b ? freedByEdit(day.state, b, { ...b, ...fieldPatch(a) }) : null
      return f ? [f] : []
    }) : []
    made = {
      judged,
      entry,
      after: c.raw,
      undo: fieldsUndoOf(file, c.raw, date, day.ctx.plan),
      begun: c.begun,
      pushed: c.pushed.length,
      energy: groupEnergy(day, { plan: c.plan, events }, energyOptions()),
      freed,
      seriesOnly: seriesOnlyOf(day.ctx.plan, [...judged.take, ...judged.along], date)
    }
    return [entry]
  }, state)
  const status = statusOf(out, state)
  const m = made as EditMade | null
  if (status !== 'saved' || !m) return none(status, m?.judged.skipped ?? [], m?.judged.same.length ?? 0)
  // D501: a begun block's cost from this minute on – the main process stamps the instant.
  const logged = m.begun.length ? await logEvents(m.begun.map((b) => ({ k: 'block.cost', day: date, block: b.id, costs }))) : true
  const begun = logged ? m.begun : []
  void tellFreedAll(date, m.freed)
  await tellBar(date, today, m.pushed, m.entry, m.entry?.create ? m.after : null)
  // Nothing written (the file already so, the events refused): nothing changed – no „Cofnij” (as a change of one block that changes nothing).
  const changed = m.entry || begun.length ? m.judged.take.length - (m.begun.length - begun.length) + m.judged.along.length : 0
  const done: GroupDone = { status, changed, skipped: m.judged.skipped, same: m.judged.same.length, seriesOnly: m.seriesOnly, pushed: m.pushed, undo: null }
  if (m.energy) done.energy = m.energy
  if (changed > 0) done.undo = (when) => undoEdit(date, m.undo, begun, costs, when ?? Date.now())
  return done
}

/**
 * „Cofnij” of fields or a shift (D529): each block whose fields still stand as the change left them gets them back (one edit of the day's
 * file); one changed since stays (D313). A begun block's cost goes back (`block.cost` with its own cost before) while it still runs with
 * the one the change set.
 */
async function undoEdit(date: string, items: readonly FieldsUndo[], begun: readonly BegunCost[], costs: Costs | null, at: number): Promise<GroupUndone> {
  const r: GroupUndone = { saved: true, restored: 0, kept: 0 }
  if (items.length) {
    let back: { restored: string[]; kept: string[] } = { restored: [], kept: [] }
    const out = await trySaveWith(async () => {
      const files = await window.rd.dayFiles([date])
      if (!(date in files)) throw new Error(moveUnreadableText(date))
      const now = files[date] ?? null
      // The day's file gone since (removed on another computer): nothing stands as the change left it.
      if (!now) {
        back = { restored: [], kept: items.map((u) => u.id) }
        return []
      }
      const u = undoFields(now, date, items)
      back = u
      return [editOf(paths.day(date), now, u.raw)]
    })
    r.saved = isSaved(out)
    if (!r.saved) return r
    r.restored += back.restored.length
    r.kept += back.kept.length
  }
  if (begun.length) {
    const files = await window.rd.dayFiles([date]).catch(() => ({}) as Record<string, RawRecord | null>)
    const day = date in files ? await countedDay(date, files[date] ?? null, at) : null
    const events = begun.flatMap((b) => {
      const now = day ? begunCostNow(day, b.id) : undefined
      return now?.running && deepEqual(now.own, costs) ? [{ k: 'block.cost', day: date, block: b.id, costs: b.was }] : []
    })
    if (events.length && !(await logEvents(events))) return { ...r, saved: false }
    r.restored += events.length
    r.kept += begun.length - events.length
  }
  return r
}

/** A click of the timer whose failure (the IPC throws) is an answer. */
async function timerClick(block: string, date: string, a: 'removeBegun' | 'undoRemove'): Promise<{ ok: boolean; why: string | null; code?: string }> {
  try {
    const r = await window.rd.timer({ a, block, day: date })
    return { ok: r.ok, why: r.why ?? null, ...(r.code ? { code: r.code } : {}) }
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) }
  }
}

/** What a removal made in its turn. */
interface RemoveMade {
  judged: GroupJudged
  entry: EditEntry | null
  after: RawRecord
  undo: RemovalUndo[]
  attachments: AttachmentUndo | null
  energy: EnergyChange | null
  freed: Freed[]
  seriesOnly: number
}

/**
 * „Usuń” of the group (spec „Usuwanie”, D336 – as „Usuń” of each): today a block running or paused ends first (`removeBegun` – one
 * refused is left out as begun); then one change of the day's file – yours taken out, the snapshot's cancelled for the day – with their
 * own attachments (D410, T923: laid once the day's file is). The plan's edit refused for good – the ends are taken back.
 */
async function removeGroup(date: string, ids: readonly string[], at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  let open: string[] = []
  try {
    const { day } = await countedNow(date, at)
    if (date === today) open = judgeGroup(day, ids, { k: 'remove' }, today).take.filter((id) => {
      const f = day.state.facts.blocks.get(id)
      return f?.startedAt != null && f.endedAt == null
    })
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return none('failed')
  }
  const ended: string[] = []
  const refused: GroupSkip[] = []
  for (const id of open) {
    const r = await timerClick(id, date, 'removeBegun')
    if (r.ok) ended.push(id)
    else if (r.code !== 'alreadyOver' && r.code !== 'notBegun') refused.push({ id, why: 'zaczęty' })
  }
  const left = new Set(refused.map((s) => s.id))
  const state: SendState = { afterSend: false }
  let made: RemoveMade | null = null
  const out = await trySaveWith(async () => {
    const { file, day } = await countedNow(date, at)
    const judged = judgeGroup(day, ids.filter((id) => !left.has(id)), { k: 'remove' }, today)
    const c = removedDay(day, file, judged.take)
    const { view, attachments: list } = useData.getState()
    const removed = removalEdits(view?.attachments ?? [], judged.take.flatMap((id) => ownAttachmentIds(list, id)), at)
    const entry = dayEntry(date, file, c.raw)
    // D368: blocks not begun removed today free their places, each block's freed time once (`groupFreed`).
    const freed = date === today ? groupFreed(day, judged.take) : []
    made = { judged, entry, after: c.raw, undo: c.undo, attachments: attachmentUndoOf(removed, at), energy: groupEnergy(day, { plan: c.plan }, energyOptions()), freed, seriesOnly: seriesOnlyOf(day.ctx.plan, judged.take, date) }
    return withOwner(entry, removed)
  }, state)
  const m = made as RemoveMade | null
  // The day's own entry says what became of it (T931): an attachment that met a question is not it.
  const plan = m?.entry && out ? out.slice(0, 1) : out
  const status = statusOf(plan, state)
  if (status !== 'saved' || !m) {
    // Refused for good (nothing sent, a broken file): the blocks ended for it run again; a question may still pass – they stay closed.
    if (ended.length && (plan == null ? !state.afterSend : plan.some((o) => o.status === 'broken'))) for (const id of ended) await timerClick(id, date, 'undoRemove')
    return none(status, [...refused, ...(m?.judged.skipped ?? [])])
  }
  void tellFreedAll(date, m.freed)
  // Nothing written (the blocks gone already): nothing changed, no „Cofnij”.
  const changed = m.entry ? m.judged.take.length : 0
  const done: GroupDone = { status, changed, skipped: [...refused, ...m.judged.skipped], same: 0, seriesOnly: changed ? m.seriesOnly : 0, pushed: 0, undo: null }
  if (m.energy) done.energy = m.energy
  if (changed) done.undo = () => undoRemove(date, m.after, m.undo, m.attachments, ended)
  return done
}

/**
 * „Cofnij” of a removal (D529): each block back while it is still gone (one of yours – not in the file again, one of the snapshot – still
 * cancelled), their attachments with them (one edit); then the begun ones open again (D336) – one that cannot, stays out of the plan
 * (the plan goes as the removal left it for it, as „Cofnij” of one).
 */
async function undoRemove(date: string, made: RawRecord, items: readonly RemovalUndo[], attachments: AttachmentUndo | null, ended: readonly string[]): Promise<GroupUndone> {
  let back: { raw: RawRecord; restored: string[]; kept: string[] } = { raw: made, restored: [], kept: [] }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([date])
    if (!(date in files)) throw new Error(moveUnreadableText(date))
    const now = files[date] ?? null
    back = undoRemoval(now, date, items)
    const day = dayEntry(date, now, back.raw)
    const restore = attachments ? restoreEdits(useData.getState().view?.attachments ?? [], attachments) : []
    return withOwner(day, restore)
  })
  // The day's own entry says what became of it (T931).
  if (!isSaved(out?.slice(0, 1) ?? null)) return { saved: false, restored: 0, kept: 0 }
  const again = new Set(back.restored)
  const closed: string[] = []
  for (const id of ended) {
    if (!again.has(id)) continue
    const r = await timerClick(id, date, 'undoRemove')
    if (r.ok) continue
    toast(`Nie cofnięto: ${r.why ?? 'blok się nie otworzył'}`, 'error', 6000)
    closed.push(id)
  }
  // A block that did not open again goes out of the plan as the removal left it – it stays where its run is, outside it.
  if (closed.length) {
    const gone = new Set(closed)
    await trySaveWith(async () => {
      const files = await window.rd.dayFiles([date])
      const now = date in files ? (files[date] ?? null) : back.raw
      let raw = dayRaw(now, date)
      for (const u of items) if (gone.has(u.id)) raw = u.raw == null ? setCancelled(raw, u.id, true) : takeBlock(raw, u.id)
      return [dayEntry(date, now, raw)]
    })
  }
  return { saved: true, restored: back.restored.length - closed.length, kept: back.kept.length + closed.length }
}

/** What a move made in its turn. */
interface MoveMade {
  judged: GroupJudged
  days: WeekPushedDay[]
  stayed: Stayed[]
  moved: number
  pushed: number
  target: { entry: EditEntry | null; after: RawRecord }
  energy: EnergyChange | null
  seriesOnly: number
}

/**
 * „Przenieś na dzień” (D528): every block taken keeps its hour; the target's flexible blocks on the places taken are pushed apart (D367).
 * Both days read and counted in the turn of the write; ONE edit (T952): the target's half that brings the blocks is the owner, the
 * source's half and the pushed starts go with it. „Cofnij” – both days back or none, as the move of one block (`undoWeekPush`).
 */
async function moveGroup(date: string, ids: readonly string[], to: string, at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  // D417: a day gone by is never a source nor a target of a move.
  if (date !== to && !mayMoveBetween(date, to, today)) return none('refused', ids.map((id) => ({ id, why: 'miniony' })))
  const state: SendState = { afterSend: false }
  let made: MoveMade | null = null
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([date, to])
    for (const d of [date, to]) if (!(d in files)) throw new Error(moveUnreadableText(d))
    const fromFile = files[date] ?? null
    const toFile = files[to] ?? null
    const [source, there] = await Promise.all([countedDay(date, fromFile, at), date === to ? Promise.resolve(null) : countedDay(to, toFile, at)])
    if (!source) throw new Error(moveUncountedText(date))
    const stay = stayRuleOf(source.state.facts, source.ctx.snapshot.settings)
    const judged = judgeGroup(source, ids, { k: 'moveTo', date: to }, today, { stay })
    if (!judged.take.length) {
      made = { judged, days: [], stayed: [], moved: 0, pushed: 0, target: { entry: null, after: toFile ?? {} }, energy: null, seriesOnly: 0 }
      return []
    }
    const m = movedDays({ from: source, to: there, fromRaw: fromFile, toRaw: toFile, take: judged.take, toDate: to, stay, onUnsettled })
    const bring = editOf(paths.day(to), toFile, m.bring)
    const push = editOf(paths.day(to), m.bring, m.target)
    const leave = editOf(paths.day(date), fromFile, m.source)
    // What „Cofnij” takes back: each day's whole change (T968).
    const whole = editOf(paths.day(to), toFile, m.target)
    const days = [...movedDay(date, leave, m.source), ...movedDay(to, whole, m.target, m.pushed.length)]
    // The energy of today when the move touches it, else of the day the blocks leave (a day to come – known only with a forecast).
    const energyDay = to === today && there ? { day: there, raw: m.target, date: to } : { day: source, raw: m.source, date }
    const energy = groupEnergy(energyDay.day, { plan: dayPlan(energyDay.day.ctx.snapshot, dayFileFrom(energyDay.raw, energyDay.date)) }, energyOptions())
    made = {
      judged,
      days,
      stayed: stayedOf(m.stayers, { ctx: source.ctx, facts: source.state.facts }),
      moved: m.moved.length,
      pushed: m.pushed.length,
      target: { entry: whole, after: m.target },
      energy,
      seriesOnly: seriesOnlyOf(source.ctx.plan, [...judged.take, ...judged.along], date)
    }
    return withOwner(bring, [leave, push].filter((e): e is EditEntry => e != null))
  }, state)
  const status = statusOf(out, state)
  const m = made as MoveMade | null
  if (status !== 'saved' || !m) return none(status, m?.judged.skipped ?? [], m?.judged.same.length ?? 0)
  await tellBar(to, today, m.pushed, m.target.entry, m.target.entry?.create ? m.target.after : null)
  const changed = m.judged.take.length + m.judged.along.length
  const done: GroupDone = { status, changed, skipped: m.judged.skipped, same: m.judged.same.length, seriesOnly: m.seriesOnly, pushed: m.pushed, undo: null }
  if (m.energy) done.energy = m.energy
  if (m.stayed.length) done.stayed = m.stayed
  if (m.days.length && changed > 0) {
    const push: WeekPush = { days: m.days, move: { blockId: m.judged.take[0]!, name: '', from: date, to } }
    done.undo = async () => {
      const r = await undoWeekPush(push)
      const all = r.undone.length === push.days.length
      return { saved: r.saved, restored: r.saved && all ? changed : 0, kept: r.changed.length ? changed : 0 }
    }
  }
  return done
}

/**
 * „Odwołaj” / „Zaparkuj” (D528) – today's actions of the timer: judged and written by the main process on the day as the bar shows it,
 * each as the click of its block alone (`groupLog`) – the window does not judge them a second time. The lowest energy before – from the day
 * as the window counts it before the write, after – counted again with the events written. Another day – nothing (the menu has it off).
 */
async function logGroup(date: string, ids: readonly string[], kind: 'cancel' | 'park', at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  if (date !== today) return none('refused', ids.map((id) => ({ id, why: date < today ? 'miniony' : 'nie dziś' })))
  const opts = energyOptions()
  let before: DayModel | null = null
  try {
    before = (await countedNow(date, at)).day
  } catch {
    // Only the energy of the line is missing: the main process judges the day itself.
  }
  let r: GroupLogResult
  try {
    r = await window.rd.groupLog(date, kind, [...ids])
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return none('failed')
  }
  if (!r.ok) {
    toast(`Nie zapisano: ${r.why ?? 'dzień nie przyjął zmiany'}`, 'error', 8000)
    return none('failed')
  }
  await reloadData()
  const done: GroupDone = { status: 'saved', changed: r.taken.length, skipped: r.skipped, same: 0, seriesOnly: before ? seriesOnlyOf(before.ctx.plan, r.taken, date) : 0, pushed: 0, undo: null }
  if (before && r.taken.length) {
    const was = lowestShown(before.ctx, before.state, opts)
    const after = was == null ? null : await countedNow(date, at).then((x) => lowestShown(x.day.ctx, x.day.state, opts)).catch(() => null)
    if (was != null && after != null && after !== was) done.energy = { before: was, after }
  }
  const written = r.written
  if (written.length) done.undo = () => undoLog(date, written)
  return done
}

/**
 * „Cofnij” of „Odwołaj” / „Zaparkuj” (D529): its events undone by the main process – `restored` counts the blocks whose events it undid
 * now (a second „Cofnij” – none), `kept` the blocks begun since (D313).
 */
async function undoLog(date: string, written: readonly string[]): Promise<GroupUndone> {
  try {
    const r = await window.rd.undoGroupLog(date, [...written])
    if (!r.ok) {
      toast(`Nie cofnięto: ${r.why ?? 'dzień nie przyjął zmiany'}`, 'error', 6000)
      return { saved: false, restored: 0, kept: 0 }
    }
    await reloadData()
    return { saved: true, restored: r.restored.length, kept: r.kept.length }
  } catch (e) {
    toast(`Nie cofnięto: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000)
    return { saved: false, restored: 0, kept: 0 }
  }
}
