/**
 * Zmiany grupowe bloków (D527–D531, ciąg Z): the write of the menu „Zmień N bloków” – for the blocks of one day („Dziś”, `changeDayGroup`) or
 * of several days („Tydzień”, „3 dni” – `changeDaysGroup`, Z5). One action for the blocks selected, judged and laid by `engine/groupEdit.ts`
 * on the days as they are in the turn of the write (A6-01 – read and counted then, never what the window drew): one edit of the days' files
 * (each day its own entry), the blocks pushed apart in it (D367; today the bar's marker of variants only – the window's line has the „Cofnij”,
 * T1541); „Przenieś na dzień” – every day in one edit, the target first (T952). „Odwołaj” / „Zaparkuj” – today's events, judged and written by
 * the main process (`groupLog`, with their ids for „Cofnij”); a block of another day is left out. A block of a series changes as „Tylko to”
 * (D529: the day's own edit, no question – counted for the line's „bloki serii – tylko te dni”). One rule for a save of several parts: only
 * what was written counts – in the line and in the one „Cofnij”; a day that met a question (`waitingDays`) or was refused (`refusedDays`) is
 * said beside (the save's toast says why). What it answers – how many changed, which were left out and why, the lowest energy of the day changed
 * (today's, when today changed) before and after, „Cofnij” for every day written – the line says (`groupRun.ts`, `groupText`).
 */
import type { EditEntry, EditOutcome, GroupLogResult, RawRecord } from '@shared/api'
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
  pushedInto,
  removedDay,
  shiftedDay,
  undoFields,
  undoRemoval,
  type BegunCost,
  type EnergyChange,
  type FieldAction,
  type FieldsUndo,
  type GroupAction,
  type GroupSkip,
  type RemovalUndo
} from '@shared/engine/groupEdit'
import { stayRuleOf } from '@shared/engine/planEdit'
import { shiftedRestDay, type RestOver } from '@shared/engine/shiftRest'
import type { AnyEvent } from '@shared/model/events'
import { simEvents } from '@shared/engine/sim'
import { attachmentUndoOf, ownAttachmentIds, removalEdits, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import type { Costs } from '@shared/model/categories'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { seriesOfBlock } from '@shared/model/series'
import { plural } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { logicalDayOf } from '@shared/time/day'
import { editOf, logEvents, outcomeFate, reloadData, trySaveWith, useData, withOwner, type OutcomeFate, type SendState } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { movedDay, stayedOf, type Stayed, type WeekPush } from '../../store/weekPush'
import { undoUnreadableText, undoWeekPush } from '../week/weekActions'
import { moveUncountedText, moveUnreadableText, statusOf, type WeekMoveStatus } from '../week/weekMove'
import { onUnsettled } from './dayPush'

/**
 * What a group's „Cofnij” came to: `restored` – the blocks back as they were, `kept` – those changed since, left as they are (D313);
 * `waitingDays` – the days whose taking back met a question (your answer decides them – not counted, never sent again).
 */
export interface GroupUndone {
  saved: boolean
  restored: number
  kept: number
  waitingDays?: number
}

/**
 * What a group's action came to (D529): `changed` – the blocks it changed on the days written (those that went with a moved one too); `skipped`
 * – those it left out, why; `same` – those that had the value already; `seriesOnly` – blocks of a series among the changed (as „Tylko to”);
 * `pushed` – the blocks pushed apart (D367); `energy` – the lowest energy before and after (the day changed – today's, when today changed; a
 * day with its forecast, when it changes); `stayed` – „Przenieś na dzień”: the blocks anchored to a moved one that stay on their day (D424);
 * `waitingDays` / `refusedDays` – the days whose entry met a question / was refused (not counted, not in „Cofnij”); `undo` – null when nothing
 * changed (`at` – the window's clock at the click, tests; left out – now). A „Cofnij” not done whole (`saved` false) may be run again: it does
 * only what is left.
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
  waitingDays?: number
  refusedDays?: number
  /** „Przesuń resztę dnia o” (N17): what it pushed past on each day written (D72 – a warning, the change is written). */
  over?: RestOver[]
  undo: ((at?: number) => Promise<GroupUndone>) | null
}

/** A group's action that changed nothing (refused, not saved, or every block already so / left out): what it says, no „Cofnij”. */
export const groupNone = (status: WeekMoveStatus, skipped: readonly GroupSkip[] = [], same = 0): GroupDone => ({ status, changed: 0, skipped: [...skipped], same, seriesOnly: 0, pushed: 0, undo: null })
const none = groupNone

/** The blocks of one day an action is for. */
export interface DayIds {
  date: string
  ids: readonly string[]
}

/** The energy as the day's axis counts it (`useDay`): the module now and the calibration. */
export function energyOptions(): EnergyOptions {
  const s = useData.getState()
  return { moduleOn: s.rd.general.modules.energy, calibration: s.view?.calibration === true }
}

/** The blocks of a series among `ids` – changed as „Tylko to” (D529). */
function seriesIdsOf(plan: readonly PlanBlock[], ids: readonly string[], date: string): string[] {
  const list = useData.getState().series
  const byId = new Map(plan.map((b) => [b.id, b]))
  return ids.filter((id) => {
    const b = byId.get(id)
    return b != null && seriesOfBlock(list, b, date) != null
  })
}

/** A day read and counted for a group's write: its file and the day counted on it. */
interface Counted {
  file: RawRecord | null
  day: DayModel
}

/**
 * The days' files and the days counted on them (their logs read whole), side by side, in the turn of the write – else why not (the toast says
 * it). `optional` – a day that may not be counted now (the target of a move: then without the push apart, as „Przenieś na…” of one block).
 */
async function countedAll(dates: readonly string[], at: number, optional: readonly string[] = []): Promise<{ files: Record<string, RawRecord | null>; days: Map<string, Counted> }> {
  const all = [...new Set([...dates, ...optional])]
  const files = await window.rd.dayFiles(all)
  for (const d of all) if (!(d in files)) throw new Error(moveUnreadableText(d))
  const counted = await Promise.all(all.map((d) => countedDay(d, files[d] ?? null, at)))
  const days = new Map<string, Counted>()
  all.forEach((d, i) => {
    const day = counted[i]
    if (day) days.set(d, { file: files[d] ?? null, day })
    else if (!optional.includes(d) || dates.includes(d)) throw new Error(moveUncountedText(d))
  })
  return { files, days }
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

/** The days in their order, each once with its blocks each once (a day without blocks – none). */
function merged(days: readonly DayIds[]): DayIds[] {
  const by = new Map<string, Set<string>>()
  for (const d of days) for (const id of d.ids) by.set(d.date, (by.get(d.date) ?? new Set()).add(id))
  return [...by.keys()].sort().map((date) => ({ date, ids: [...by.get(date)!] }))
}

/** What became of the entry at `place` among those sent (`outcomeFate`; not answered – refused before the send, not known after it: a question). */
function fateAt(out: readonly EditOutcome[] | null, state: SendState, place: number): OutcomeFate {
  return out == null ? (state.afterSend ? 'asked' : 'refused') : outcomeFate(out[place])
}

/** The worst of several entries' fates (a day with two entries, a day's attachments that go on their own); none – nothing to write: done. */
const worstFate = (fates: readonly OutcomeFate[]): OutcomeFate => (fates.includes('refused') ? 'refused' : fates.includes('asked') ? 'asked' : 'saved')

/** The days not written by their fates – said beside the line (`waitingDays`, `refusedDays`). */
function unwritten(fates: readonly OutcomeFate[]): Pick<GroupDone, 'waitingDays' | 'refusedDays'> {
  const waiting = fates.filter((f) => f === 'asked').length
  const refused = fates.filter((f) => f === 'refused').length
  return { ...(waiting ? { waitingDays: waiting } : {}), ...(refused ? { refusedDays: refused } : {}) }
}

/**
 * One action of the menu on the blocks `ids` of day `date` (D528). `at` – the window's clock (tests): „today” is counted from it at the
 * write (the menu may stay open across 04:00).
 */
export function changeDayGroup(date: string, ids: readonly string[], a: GroupAction, o: { at?: number } = {}): Promise<GroupDone> {
  return changeDaysGroup([{ date, ids }], a, o)
}

/**
 * One action of the menu on the blocks of several days (Z5: „Tydzień”, „3 dni” – D528): every day in one edit of the queue, one „Cofnij” for all
 * of them written; the energy of the line – of the day changed (today's, when today changed). „Odwołaj” and „Zaparkuj” take today's blocks only.
 * One rule for what a part of the days met (a question, a refusal): only what was written counts – in the line and in „Cofnij”.
 */
export function changeDaysGroup(days: readonly DayIds[], a: GroupAction, o: { at?: number } = {}): Promise<GroupDone> {
  const at = o.at ?? Date.now()
  const list = merged(days)
  switch (a.k) {
    case 'cancel':
    case 'park':
      return logDays(list, a.k, at)
    case 'moveTo':
      return moveDays(list, a.date, at)
    case 'remove':
      return removeDays(list, at)
    default:
      return editDays(list, a, at)
  }
}

/** The day whose energy the line says (D529): today, when today changed; else the only day changed; none – no line of energy. */
function litDay<T extends { date: string }>(changed: readonly T[], today: string): T | undefined {
  return changed.find((p) => p.date === today) ?? (changed.length === 1 ? changed[0] : undefined)
}

const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((n, x) => n + f(x), 0)

/** What a day's edit of fields or a shift made in its turn (for what is said after it and its „Cofnij”). */
interface EditPart {
  date: string
  take: number
  along: number
  skipped: GroupSkip[]
  same: number
  entry: EditEntry | null
  after: RawRecord
  undo: FieldsUndo[]
  begun: BegunCost[]
  pushed: number
  /** How many blocks today's bar hears were pushed (the marker of variants, D367): the push apart's, or every block the rest of the day moved. */
  told: number
  /** What the rest of the day pushed past (N17). */
  over: RestOver | null
  /** What the energy is counted from once the day is known to have changed. */
  day: DayModel
  plan: PlanBlock[]
  events: AnyEvent[]
  freed: Freed[]
  /** The blocks of a series among those changed (as „Tylko to”). */
  series: string[]
}

/**
 * The fields of the blocks (a subcategory and variant, a variant, the cost, a routine), „Przesuń o” ±N min or „Przesuń resztę dnia o” ±N min (N17:
 * each day from its earliest selected block – `shiftedRestDay`, counted by the blocks it moved) – each day's file changed once, the push apart in it
 * (a day to come, D367). A begun block's cost is the day's `block.cost` from now on (D501) – an event of its log, not of its file: written after the
 * files whatever became of them. What a day changed counts by what of it was written: its file (the blocks, those that went with them), the events
 * of its begun blocks.
 */
async function editDays(days: readonly DayIds[], a: FieldAction | Extract<GroupAction, { k: 'shift' | 'shiftRest' }>, at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  const costs = a.k === 'cost' ? a.costs : null
  const state: SendState = { afterSend: false }
  let parts: EditPart[] | null = null
  const out = await trySaveWith(async () => {
    const read = await countedAll(
      days.map((d) => d.date),
      at
    )
    parts = days.map(({ date, ids }): EditPart => {
      const { file, day } = read.days.get(date)!
      const judged = judgeGroup(day, ids, a, today)
      // The rest of the day: the selected blocks say where it starts, what it moved is what changed (every one written, none pushed besides);
      // the buffers of decompression laid again with your settings' changes (D583, T2493).
      const rest = a.k === 'shiftRest' ? shiftedRestDay(day, file, ids, a.minutes, today, onUnsettled, useData.getState().rd.settings) : null
      const c =
        a.k === 'shiftRest'
          ? { ...rest!, begun: [] as BegunCost[] }
          : a.k === 'shift'
            ? { ...shiftedDay(day, file, judged.take, a.minutes, today, onUnsettled), begun: [] as BegunCost[] }
            : fieldDay(day, file, judged.take, a)
      // D368: a block shortened today (a routine's length) frees its end – the bar may ask about the gap.
      const byId = new Map(day.ctx.plan.map((b) => [b.id, b]))
      const freed =
        date === today && a.k === 'routine'
          ? judged.take.flatMap((id) => {
              const b = byId.get(id)
              const f = b ? freedByEdit(day.state, b, { ...b, ...fieldPatch(a) }) : null
              return f ? [f] : []
            })
          : []
      return {
        date,
        take: rest ? rest.moved.length : judged.take.length,
        along: rest ? 0 : judged.along.length,
        skipped: judged.skipped,
        same: judged.same.length,
        // The rest of the day that moved nothing writes nothing (no block of a template brought into the file, no group left, T2492).
        entry: rest && !rest.moved.length ? null : dayEntry(date, file, c.raw),
        after: c.raw,
        undo: fieldsUndoOf(file, c.raw, date, day.ctx.plan),
        begun: c.begun,
        pushed: rest ? 0 : c.pushed.length,
        told: rest ? rest.moved.length : c.pushed.length,
        over: rest?.over ?? null,
        day,
        plan: c.plan,
        events: c.begun.length ? simEvents(day.ctx, c.begun.map((b) => ({ k: 'block.cost', block: b.id, at, costs })), at) : [],
        freed,
        series: seriesIdsOf(day.ctx.plan, rest ? rest.moved : [...judged.take, ...judged.along], date)
      }
    })
    return parts.map((p) => p.entry)
  }, state)
  const made = parts as EditPart[] | null
  if (!made) return none(statusOf(out, state))
  // Each day's entry decides for its file (its place among those sent – a day with nothing to write sent none).
  let k = 0
  const fates = made.map((p): OutcomeFate => (p.entry ? fateAt(out, state, k++) : 'saved'))
  // D501: a begun block's cost from this minute on – the main process stamps the instant (its own write, whatever became of the files).
  const begunAll = made.flatMap((p) => p.begun.map((b) => ({ date: p.date, b })))
  const logged = begunAll.length ? await logEvents(begunAll.map(({ date, b }) => ({ k: 'block.cost', day: date, block: b.id, costs }))) : true
  const wrote = made.map((p, i) => {
    const file = fates[i] === 'saved' && p.entry != null
    const begun = logged ? p.begun : []
    const begunIds = new Set(begun.map((b) => b.id))
    return { p, file, begun, changed: (file ? p.take - p.begun.length + p.along : 0) + begun.length, series: file ? p.series.length : p.series.filter((id) => begunIds.has(id)).length }
  })
  const written = wrote.filter((w) => w.changed > 0)
  const asked = unwritten(fates)
  const skipped = made.flatMap((p) => p.skipped)
  const same = sum(made, (p) => p.same)
  // Nothing written: the events refused – „Nie zapisano” said already (nothing more); else why not (`statusOf` – a question, a refusal).
  if (!written.length) return { ...none(logged ? statusOf(out, state) : 'failed', skipped, same), ...asked }
  for (const w of written) {
    if (!w.file) continue
    void tellFreedAll(w.p.date, w.p.freed)
    await tellBar(w.p.date, today, w.p.told, w.p.entry, w.p.entry?.create ? w.p.after : null)
  }
  const done: GroupDone = { status: 'saved', changed: sum(written, (w) => w.changed), skipped, same, seriesOnly: sum(written, (w) => w.series), pushed: sum(written, (w) => (w.file ? w.p.pushed : 0)), ...asked, undo: null }
  const over = written.flatMap((w) => (w.file && w.p.over ? [w.p.over] : []))
  if (over.length) done.over = over
  const lit = litDay(
    written.map((w) => ({ date: w.p.date, w })),
    today
  )?.w
  const energy = lit ? groupEnergy(lit.p.day, { plan: lit.file ? lit.p.plan : lit.p.day.ctx.plan, events: lit.begun.length ? lit.p.events : [] }, energyOptions()) : null
  if (energy) done.energy = energy
  done.undo = undoEditDays(
    written.map((w) => ({ date: w.p.date, undo: w.file ? w.p.undo : [], begun: w.begun })),
    costs
  )
  return done
}

/**
 * „Cofnij” of fields or a shift (D529): on every day, each block whose fields still stand as the change left them gets them back (one edit of
 * the days' files); one changed since stays (D313). A begun block's cost goes back (`block.cost` with its own cost before) while it still runs
 * with the one the change set. It remembers what it did: a day not taken back now (its entry refused, its file or log not readable) is left for
 * the next „Cofnij”, which does only it – the line stays (`saved` false); a day whose entry met a question is taken back as far as the window
 * goes – your answer decides it, never sent again (`waitingDays`, not counted).
 */
function undoEditDays(days: ReadonlyArray<{ date: string; undo: readonly FieldsUndo[]; begun: readonly BegunCost[] }>, costs: Costs | null): (at?: number) => Promise<GroupUndone> {
  const left = new Map(days.filter((d) => d.undo.length).map((d) => [d.date, d]))
  const begunLeft = new Map(days.filter((d) => d.begun.length).map((d) => [d.date, d.begun]))
  const total = { restored: 0, kept: 0 }
  return async (at = Date.now()) => {
    let waiting = 0
    const unreadable = new Set<string>()
    if (left.size) {
      const todo = [...left.values()]
      const counts = new Map<string, { restored: number; kept: number }>()
      const state: SendState = { afterSend: false }
      const sent: string[] = []
      const notRead: string[] = []
      const out = await trySaveWith(async () => {
        const files = await window.rd.dayFiles(todo.map((d) => d.date))
        const entries: EditEntry[] = []
        for (const d of todo) {
          // A day that cannot be read now: left for the next „Cofnij”.
          if (!(d.date in files)) {
            notRead.push(d.date)
            continue
          }
          const now = files[d.date] ?? null
          // The day's file gone since (removed on another computer): nothing stands as the change left it.
          if (!now) {
            counts.set(d.date, { restored: 0, kept: d.undo.length })
            continue
          }
          const u = undoFields(now, d.date, d.undo)
          counts.set(d.date, { restored: u.restored.length, kept: u.kept.length })
          const e = editOf(paths.day(d.date), now, u.raw)
          if (e) {
            entries.push(e)
            sent.push(d.date)
          }
        }
        return entries
      }, state)
      for (const d of todo) {
        const c = counts.get(d.date)
        if (!c) continue
        // A day with nothing to write is done (whatever became of the others' send).
        const i = sent.indexOf(d.date)
        const fate = i < 0 ? 'saved' : fateAt(out, state, i)
        if (fate === 'refused') continue
        left.delete(d.date)
        if (fate === 'asked') {
          waiting++
          continue
        }
        total.restored += c.restored
        total.kept += c.kept
      }
      if (out != null) for (const d of notRead) unreadable.add(d)
    }
    if (begunLeft.size) {
      const events: Array<{ k: string; day: string; block: string; costs: Costs | null }> = []
      const took: string[] = []
      let kept = 0
      for (const [date, begun] of begunLeft) {
        const files = await window.rd.dayFiles([date]).catch(() => null)
        const day = files && date in files ? await countedDay(date, files[date] ?? null, at) : null
        // A day whose file or log cannot be read now: its begun blocks are left for the next „Cofnij”.
        if (!day) {
          unreadable.add(date)
          continue
        }
        took.push(date)
        for (const b of begun) {
          const now = begunCostNow(day, b.id)
          if (now?.running && deepEqual(now.own, costs)) events.push({ k: 'block.cost', day: date, block: b.id, costs: b.was })
          else kept++
        }
      }
      if (!events.length || (await logEvents(events))) {
        for (const d of took) begunLeft.delete(d)
        total.restored += events.length
        total.kept += kept
      }
    }
    if (unreadable.size) toast(undoUnreadableText([...unreadable].sort()), 'error', 6000)
    return { saved: !left.size && !begunLeft.size, ...total, ...(waiting ? { waitingDays: waiting } : {}) }
  }
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

/** Said when blocks ended for a removal do not open again (as „Usuń” of one, `removeDayBlock`): their run ended, they are out of the plan. */
export function notReopenedText(n: number, why: string | null): string {
  const what = n === 1 ? 'Blok nie otworzył' : `${groupCount(n)} nie ${plural(n, 'otworzył', 'otworzyły', 'otworzyło')}`
  return `${what} się z powrotem: ${why ?? 'spróbuj „Pracuję”'} – ${plural(n, 'został', 'zostały', 'zostało')} poza planem.`
}

/** What a day's removal made in its turn. */
interface RemovePart {
  date: string
  take: number
  skipped: GroupSkip[]
  entry: EditEntry | null
  after: RawRecord
  undo: RemovalUndo[]
  removed: EditEntry[]
  attachments: AttachmentUndo | null
  day: DayModel
  plan: PlanBlock[]
  freed: Freed[]
  seriesOnly: number
}

/**
 * Entries of several owners in one edit (T923): each owner (a day's file) with the entries that go with it laid once it is (`after` – its place);
 * an owner with nothing to write – its entries go on their own. `owners` – the place of each group's owner among the entries (-1 – none),
 * `places` – the places of all of each group's entries.
 */
function ownedEntries(groups: ReadonlyArray<{ owner: EditEntry | null; deps: readonly EditEntry[] }>): { entries: EditEntry[]; owners: number[]; places: number[][] } {
  const entries: EditEntry[] = []
  const owners: number[] = []
  const places: number[][] = []
  for (const g of groups) {
    const first = entries.length
    if (!g.owner) {
      owners.push(-1)
      entries.push(...g.deps)
    } else {
      const at = entries.push(g.owner) - 1
      owners.push(at)
      entries.push(...g.deps.map((e) => ({ ...e, after: [at] })))
    }
    places.push(Array.from({ length: entries.length - first }, (_, i) => first + i))
  }
  return { entries, owners, places }
}

/** What became of a group of `ownedEntries`: its owner's entry decides (T931); without one – all its entries; nothing to write – done. */
function groupFate(out: readonly EditOutcome[] | null, state: SendState, owner: number, places: readonly number[]): OutcomeFate {
  return owner >= 0 ? fateAt(out, state, owner) : worstFate(places.map((p) => fateAt(out, state, p)))
}

/**
 * „Usuń” of the group (spec „Usuwanie”, D336 – as „Usuń” of each): today a block running or paused ends first (`removeBegun` – one refused is
 * left out as begun); then one edit of the days' files – yours taken out, the snapshot's cancelled for the day – each with its blocks' own
 * attachments (D410, T923: laid once its day's file is). Today's entry refused for good – the ends are taken back (the other days decide nothing
 * of them); one that does not open again is said, as „Usuń” of one.
 */
async function removeDays(days: readonly DayIds[], at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  const todays = days.find((d) => d.date === today)
  let open: string[] = []
  if (todays) {
    try {
      const day = (await countedAll([today], at)).days.get(today)!.day
      open = judgeGroup(day, todays.ids, { k: 'remove' }, today).take.filter((id) => {
        const f = day.state.facts.blocks.get(id)
        return f?.startedAt != null && f.endedAt == null
      })
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
      return none('failed')
    }
  }
  const ended: string[] = []
  const refused: GroupSkip[] = []
  for (const id of open) {
    const r = await timerClick(id, today, 'removeBegun')
    if (r.ok) ended.push(id)
    else if (r.code !== 'alreadyOver' && r.code !== 'notBegun') refused.push({ id, why: 'zaczęty' })
  }
  const left = new Set(refused.map((s) => s.id))
  const state: SendState = { afterSend: false }
  let parts: RemovePart[] | null = null
  let owners: number[] = []
  const out = await trySaveWith(async () => {
    const read = await countedAll(
      days.map((d) => d.date),
      at
    )
    const { view, attachments: list } = useData.getState()
    parts = days.map(({ date, ids }): RemovePart => {
      const { file, day } = read.days.get(date)!
      const judged = judgeGroup(day, date === today ? ids.filter((id) => !left.has(id)) : ids, { k: 'remove' }, today)
      const c = removedDay(day, file, judged.take)
      const removed = removalEdits(view?.attachments ?? [], judged.take.flatMap((id) => ownAttachmentIds(list, id)), at)
      return {
        date,
        take: judged.take.length,
        skipped: judged.skipped,
        entry: dayEntry(date, file, c.raw),
        after: c.raw,
        undo: c.undo,
        removed,
        attachments: attachmentUndoOf(removed, at),
        day,
        plan: c.plan,
        // D368: blocks not begun removed today free their places, each block's freed time once (`groupFreed`).
        freed: date === today ? groupFreed(day, judged.take) : [],
        seriesOnly: seriesIdsOf(day.ctx.plan, judged.take, date).length
      }
    })
    const sent = ownedEntries(parts.map((p) => ({ owner: p.entry, deps: p.removed })))
    owners = sent.owners
    return sent.entries
  }, state)
  const made = parts as RemovePart[] | null
  // Each day's own entry says what became of it (T931): an attachment that met a question is not it.
  const fates = made?.map((p, i): OutcomeFate => (p.entry ? fateAt(out, state, owners[i]!) : 'saved')) ?? []
  const todayAt = made ? made.findIndex((p) => p.date === today) : -1
  const todayFate: OutcomeFate = todayAt >= 0 && made![todayAt]!.entry ? fates[todayAt]! : out == null && !state.afterSend ? 'refused' : 'saved'
  // Today's entry refused for good (not sent, broken): the blocks ended for it run again; a question may still pass – they stay closed.
  if (ended.length && todayFate === 'refused') {
    const stuck: Array<string | null> = []
    for (const id of ended) {
      const r = await timerClick(id, today, 'undoRemove')
      if (!r.ok) stuck.push(r.why)
    }
    if (stuck.length) toast(notReopenedText(stuck.length, stuck[0] ?? null), 'error', 8000)
  }
  if (!made) return none(statusOf(out, state), refused)
  const changedParts = made.filter((p, i) => fates[i] === 'saved' && p.entry)
  const asked = unwritten(fates)
  if (!changedParts.length) return { ...none(statusOf(out, state), [...refused, ...made.flatMap((p) => p.skipped)]), ...asked }
  for (const p of changedParts) void tellFreedAll(p.date, p.freed)
  const done: GroupDone = { status: 'saved', changed: sum(changedParts, (p) => p.take), skipped: [...refused, ...made.flatMap((p) => p.skipped)], same: 0, seriesOnly: sum(changedParts, (p) => p.seriesOnly), pushed: 0, ...asked, undo: null }
  const lit = litDay(changedParts, today)
  const energy = lit ? groupEnergy(lit.day, { plan: lit.plan }, energyOptions()) : null
  if (energy) done.energy = energy
  const todayWritten = changedParts.some((p) => p.date === today)
  done.undo = undoRemoveDays(
    changedParts.map((p) => ({ date: p.date, after: p.after, undo: p.undo, attachments: p.attachments })),
    today,
    todayWritten ? ended : []
  )
  return done
}

/**
 * „Cofnij” of a removal (D529): on every day, each block back while it is still gone (one of yours – not in the file again, one of the snapshot
 * – still cancelled), their attachments with them (one edit); then today's begun ones the entry of today brings back open again (D336) – also
 * when it met a question (it may pass); one that cannot, stays out of the plan (the plan goes as the removal left it for it, as „Cofnij” of one).
 * A day not taken back now (its entries refused, its file not readable) is left for the next „Cofnij”; one whose entry met a question is taken
 * back as far as the window goes – your answer decides it, never sent again (`waitingDays`, not counted).
 */
function undoRemoveDays(days: ReadonlyArray<{ date: string; after: RawRecord; undo: readonly RemovalUndo[]; attachments: AttachmentUndo | null }>, today: string, ended: readonly string[]): () => Promise<GroupUndone> {
  const left = new Map(days.map((d) => [d.date, d]))
  const total = { restored: 0, kept: 0 }
  return async () => {
    const todo = [...left.values()]
    const back = new Map<string, { raw: RawRecord; restored: string[]; kept: string[] }>()
    const state: SendState = { afterSend: false }
    let owners: number[] = []
    let places: number[][] = []
    let read: string[] = []
    const out = await trySaveWith(async () => {
      const files = await window.rd.dayFiles(todo.map((d) => d.date))
      read = todo.filter((d) => d.date in files).map((d) => d.date)
      const sent = ownedEntries(
        todo
          .filter((d) => d.date in files)
          .map((d) => {
            const now = files[d.date] ?? null
            const u = undoRemoval(now, d.date, d.undo)
            back.set(d.date, u)
            return { owner: dayEntry(d.date, now, u.raw), deps: d.attachments ? restoreEdits(useData.getState().view?.attachments ?? [], d.attachments) : [] }
          })
      )
      owners = sent.owners
      places = sent.places
      return sent.entries
    }, state)
    const unreadable = out == null ? [] : todo.map((d) => d.date).filter((d) => !read.includes(d))
    if (unreadable.length) toast(undoUnreadableText(unreadable), 'error', 6000)
    let waiting = 0
    let reopened: string[] = []
    let todayCounted = false
    read.forEach((date, i) => {
      const u = back.get(date)!
      const fate = groupFate(out, state, owners[i]!, places[i]!)
      if (fate === 'refused') return
      left.delete(date)
      // Today's ended blocks by what its entry brings back (written or waiting for your answer).
      if (date === today) {
        reopened = u.restored
        todayCounted = fate === 'saved'
      }
      if (fate === 'asked') {
        waiting++
        return
      }
      total.restored += u.restored.length
      total.kept += u.kept.length
    })
    const again = new Set(reopened)
    const closed: string[] = []
    for (const id of ended) {
      if (!again.has(id)) continue
      const r = await timerClick(id, today, 'undoRemove')
      if (r.ok) continue
      toast(`Nie cofnięto: ${r.why ?? 'blok się nie otworzył'}`, 'error', 6000)
      closed.push(id)
    }
    // A block that did not open again goes out of the plan as the removal left it – it stays where its run is, outside it.
    const items = days.find((d) => d.date === today)?.undo ?? []
    if (closed.length) {
      const gone = new Set(closed)
      await trySaveWith(async () => {
        const files = await window.rd.dayFiles([today])
        const now = today in files ? (files[today] ?? null) : (back.get(today)?.raw ?? null)
        let raw = dayRaw(now, today)
        for (const u of items) if (gone.has(u.id)) raw = u.raw == null ? setCancelled(raw, u.id, true) : takeBlock(raw, u.id)
        return [dayEntry(today, now, raw)]
      })
      if (todayCounted) {
        total.restored -= closed.length
        total.kept += closed.length
      }
    }
    return { saved: !left.size, ...total, ...(waiting ? { waitingDays: waiting } : {}) }
  }
}

/** What a source day of a move made in its turn. */
interface MoveSource {
  date: string
  take: number
  along: number
  first: string
  stayed: Stayed[]
  seriesOnly: number
  entry: EditEntry | null
  raw: RawRecord
  day: DayModel
}

/** What a move made in its turn. */
interface MoveMade {
  skipped: GroupSkip[]
  same: number
  sources: MoveSource[]
  /** The target: its file before, with the blocks brought, with the push (none – counted not, `there` null). */
  to: { file: RawRecord | null; bring: RawRecord; pushedRaw: RawRecord; pushed: number; day: DayModel | null } | null
  /** The places of the entries sent: the target's that brings the blocks (the owner), each source's, the target's push. */
  at: { bring?: number; source: Map<string, number>; push?: number }
}

/**
 * „Przenieś na dzień” (D528) of the blocks of one day or several: every block taken keeps its hour; the target's flexible blocks on the places
 * taken are pushed apart once, all the moved ones holding their hours (D367) – a target that cannot be counted now takes them without the push
 * (as „Przenieś na…” of one block). Every day read and counted in the turn of the write; ONE edit (T952): the target's half that brings the blocks
 * is the owner, the sources' halves and the pushed starts go with it. What counts – in the line and in „Cofnij” (`undoWeekPush`, every day back
 * or none) – are the days written: the target's half (nothing without it), the sources whose half was written, the push when it was. A day gone
 * by is never a source nor the target (D417): its blocks are left out; the target's own blocks are judged on it.
 */
async function moveDays(days: readonly DayIds[], to: string, at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  if (to < today) return none('refused', days.flatMap((d) => d.ids.map((id) => ({ id, why: 'miniony' as const }))))
  const past = days.filter((d) => d.date !== to && !mayMoveBetween(d.date, to, today))
  const sources = days.filter((d) => d.date !== to && mayMoveBetween(d.date, to, today))
  const pastSkipped = past.flatMap((d) => d.ids.map((id) => ({ id, why: 'miniony' as const })))
  const onTarget = days.find((d) => d.date === to)?.ids ?? []
  const state: SendState = { afterSend: false }
  let made: MoveMade | null = null
  const out = await trySaveWith(async () => {
    const read = await countedAll(
      sources.map((d) => d.date),
      at,
      [to]
    )
    const there = read.days.get(to) ?? null
    const toFile = read.files[to] ?? null
    // The target's own blocks: there already (judged on it – gone from it, „nie ma”); not counted now – as there.
    const own = there ? judgeGroup(there.day, onTarget, { k: 'moveTo', date: to }, today) : null
    let bring: RawRecord | null = toFile
    const m: MoveMade = { skipped: [...pastSkipped, ...(own?.skipped ?? [])], same: own ? own.same.length : onTarget.length, sources: [], to: null, at: { source: new Map() } }
    const moved: string[] = []
    for (const { date, ids } of sources) {
      const { file, day } = read.days.get(date)!
      const stay = stayRuleOf(day.state.facts, day.ctx.snapshot.settings)
      const judged = judgeGroup(day, ids, { k: 'moveTo', date: to }, today, { stay })
      m.skipped.push(...judged.skipped)
      m.same += judged.same.length
      if (!judged.take.length) continue
      const mv = movedDays({ from: day, to: null, fromRaw: file, toRaw: bring, take: judged.take, toDate: to, stay })
      bring = mv.bring
      moved.push(...mv.moved)
      m.sources.push({
        date,
        take: judged.take.length,
        along: judged.along.length,
        first: judged.take[0]!,
        stayed: stayedOf(mv.stayers, { ctx: day.ctx, facts: day.state.facts }),
        seriesOnly: seriesIdsOf(day.ctx.plan, [...judged.take, ...judged.along], date).length,
        entry: editOf(paths.day(date), file, mv.source),
        raw: mv.source,
        day
      })
    }
    made = m
    if (!moved.length || bring == null) return []
    const p = there ? pushedInto(there.day, bring, to, moved, onUnsettled) : { target: bring, pushed: [] }
    m.to = { file: toFile, bring, pushedRaw: p.target, pushed: p.pushed.length, day: there?.day ?? null }
    const bringEntry = editOf(paths.day(to), toFile, bring)
    const push = editOf(paths.day(to), bring, p.target)
    const deps: EditEntry[] = []
    const place = (e: EditEntry) => (bringEntry ? 1 : 0) + deps.push(e) - 1
    if (bringEntry) m.at.bring = 0
    for (const s of m.sources) if (s.entry) m.at.source.set(s.date, place(s.entry))
    if (push) m.at.push = place(push)
    return withOwner(bringEntry, deps)
  }, state)
  const m = made as MoveMade | null
  if (!m) return none(statusOf(out, state), pastSkipped)
  const target = m.to
  if (!target) return none('saved', m.skipped, m.same)
  const fate = (place: number | undefined): OutcomeFate => (place == null ? 'saved' : fateAt(out, state, place))
  const ownerFate = fate(m.at.bring)
  const pushFate = fate(m.at.push)
  const sourceFates = m.sources.map((s) => fate(m.at.source.get(s.date)))
  const asked = unwritten([worstFate([ownerFate, pushFate]), ...sourceFates])
  // The target's half decides the move (T952: nothing of it goes before it).
  if (ownerFate !== 'saved') return { ...none(statusOf(out, state), m.skipped, m.same), ...asked }
  const saved = m.sources.filter((_, i) => sourceFates[i] === 'saved')
  const pushed = pushFate === 'saved' ? target.pushed : 0
  const targetRaw = pushFate === 'saved' ? target.pushedRaw : target.bring
  const targetEntry = editOf(paths.day(to), target.file, targetRaw)
  const changed = sum(saved, (s) => s.take + s.along)
  // The target written, no source: its blocks stand on both days – the line (no block moved, the days not written) with the target's „Cofnij”
  // that takes them off it again.
  if (changed === 0) {
    const days = movedDay(to, targetEntry, targetRaw, pushed)
    if (!days.length) return { ...none(statusOf(out, state), m.skipped, m.same), ...asked }
    const back: WeekPush = { days }
    return {
      ...none('saved', m.skipped, m.same),
      ...asked,
      undo: async () => {
        const r = await undoWeekPush(back)
        return { saved: r.saved && !r.unreadable.length, restored: 0, kept: 0 }
      }
    }
  }
  await tellBar(to, today, pushed, targetEntry, targetEntry?.create ? targetRaw : null)
  const stayed = saved.flatMap((s) => s.stayed)
  const done: GroupDone = { status: 'saved', changed, skipped: m.skipped, same: m.same, seriesOnly: sum(saved, (s) => s.seriesOnly), pushed, ...asked, undo: null }
  if (stayed.length) done.stayed = stayed
  // The energy of the day changed: today, when a source written or the target is today; else the only source written (a day to come – with a forecast).
  const litDate = litDay([...saved, { date: to }], today)?.date ?? (saved.length === 1 ? saved[0]!.date : undefined)
  const lit = litDate === to ? (target.day ? { day: target.day, raw: targetRaw } : null) : saved.find((s) => s.date === litDate) ?? null
  if (lit && litDate) {
    const energy = groupEnergy(lit.day, { plan: dayPlan(lit.day.ctx.snapshot, dayFileFrom(lit.raw, litDate)) }, energyOptions())
    if (energy) done.energy = energy
  }
  // What „Cofnij” takes back: each day's whole change as written (T968) – the sources written and the target.
  const undoDays = [...saved.flatMap((s) => movedDay(s.date, s.entry, s.raw)), ...movedDay(to, targetEntry, targetRaw, pushed)]
  if (undoDays.length) {
    const push: WeekPush = { days: undoDays, move: { blockId: saved[0]!.first, name: '', from: saved[0]!.date, to } }
    done.undo = async () => {
      const r = await undoWeekPush(push)
      // A day that cannot be read now (`undoWeekPush` said so): nothing was taken back – the line stays for another try.
      if (r.unreadable.length) return { saved: false, restored: 0, kept: 0 }
      const all = r.undone.length === push.days.length
      return { saved: r.saved, restored: r.saved && all ? changed : 0, kept: r.changed.length ? changed : 0 }
    }
  }
  return done
}

/**
 * „Odwołaj” / „Zaparkuj” (D528) – today's actions of the timer: judged and written by the main process on the day as the bar shows it,
 * each as the click of its block alone (`groupLog`) – the window does not judge them a second time; the blocks of other days are left out
 * (`miniony`, `nie dziś` – the menu has it off for them). The lowest energy before – from the day as the window counts it before the write,
 * after – counted again with the events written.
 */
async function logDays(days: readonly DayIds[], kind: 'cancel' | 'park', at: number): Promise<GroupDone> {
  const today = logicalDayOf(at)
  const others = days.filter((d) => d.date !== today).flatMap((d) => d.ids.map((id): GroupSkip => ({ id, why: d.date < today ? 'miniony' : 'nie dziś' })))
  const ids = days.find((d) => d.date === today)?.ids ?? []
  if (!ids.length) return none('refused', others)
  const opts = energyOptions()
  let before: DayModel | null = null
  try {
    before = (await countedAll([today], at)).days.get(today)!.day
  } catch {
    // Only the energy of the line is missing: the main process judges the day itself.
  }
  let r: GroupLogResult
  try {
    r = await window.rd.groupLog(today, kind, [...ids])
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return none('failed', others)
  }
  if (!r.ok) {
    toast(`Nie zapisano: ${r.why ?? 'dzień nie przyjął zmiany'}`, 'error', 8000)
    return none('failed', others)
  }
  await reloadData()
  const done: GroupDone = { status: 'saved', changed: r.taken.length, skipped: [...r.skipped, ...others], same: 0, seriesOnly: before ? seriesIdsOf(before.ctx.plan, r.taken, today).length : 0, pushed: 0, undo: null }
  if (before && r.taken.length) {
    const was = lowestShown(before.ctx, before.state, opts)
    const after =
      was == null
        ? null
        : await countedAll([today], at)
            .then((x) => {
              const d = x.days.get(today)!.day
              return lowestShown(d.ctx, d.state, opts)
            })
            .catch(() => null)
    if (was != null && after != null && after !== was) done.energy = { before: was, after }
  }
  // The blocks taken have their events among those written (`groupLog` writes them at once): „Cofnij” undoes them.
  const written = r.written
  if (written.length) done.undo = () => undoLog(today, written)
  return done
}

/**
 * „Cofnij” of „Odwołaj” / „Zaparkuj” (D529): its events undone by the main process – `restored` counts the blocks back in the plan (a second
 * „Cofnij” – none), `kept` the blocks begun since or taken off by another event (D313).
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
