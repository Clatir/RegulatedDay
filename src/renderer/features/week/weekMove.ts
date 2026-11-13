/**
 * A block dragged in the columns of „Tydzień” and „3 dni” (D417, D422, D424): to another day – the move of „Przenieś na…”
 * (its id stays, one move more, the day it came from; a block of the template or of a series leaves its day by `movedTo`,
 * its steps' ticks go with it, its own attachments see it by its id; the blocks anchored to it that have not begun go with
 * it, one begun stays on its day with its own hour – `moveBetweenDays`) at the hour it was dropped at – or to another hour of
 * its own day (the drag of „Dziś”, D305). On the taken place the flexible blocks after it are pushed apart (D367, as „Dodaj”
 * of „Tydzień” counts them – D400). One edit of the queue (T952) and one „Cofnij” for both days (`WeekPush.move`).
 */
import type { EditEntry, EditOutcome } from '@shared/api'
import { nameById, type Names } from '@shared/blockName'
import { dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { movableBlock, plannedSpan } from '@shared/engine/blocks'
import { mayMoveBetween } from '@shared/engine/calendarViews'
import { namingOf } from '@shared/engine/context'
import { stayingIds } from '@shared/engine/facts'
import { moveBetweenDays, movedBlock, stayHowOf, type StayHow } from '@shared/engine/planEdit'
import { pushApart, withBlock } from '@shared/engine/pushApart'
import { plDateWithWeekday } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import { countedDay, type DayModel } from '../../store/day'
import { editOf, isSaved, trySaveWith, withOwner, type SendState } from '../../store/data'
import type { WeekPush, WeekPushedDay } from '../../store/weekPush'
import { blockNow, withPushed, type PushedStart } from '../today/dayActions'
import { dragChange, onUnsettled, pushedStarts } from '../today/dayPush'

/** Where a block was dropped: its day (`from`), the day of the column it was dropped on (`to`) and its new start there. */
export interface WeekMove {
  blockId: string
  /** What the window calls it (`blockName`) – the line „Przeniesiono: <name> na <dzień>” (D422). */
  name: string
  from: string
  to: string
  /** Logical minutes of the target day (the 5-min grid of the drag). */
  startMin: number
  /** The names of the source day (D424: a block anchored to it that stays is named in the line); none – „blok”. */
  names?: Names
}

/**
 * What the move came to: `saved` – written (or waiting for the folder); `pending` – a part met a change from another
 * computer (a question – the queue lays the rest only as it allows, T952), or its outcome is not known; `failed` – nothing
 * written (the toast said why); `refused` – a day gone by among the days (D417: never changed by dragging) – nothing asked.
 */
export type WeekMoveStatus = 'saved' | 'pending' | 'failed' | 'refused'

export interface WeekMoved {
  status: WeekMoveStatus
  /**
   * For the line with „Cofnij” (`showWeekPush`) – only when saved: a move to another day (`move`, D422, D424), or a drag
   * within the day that pushed blocks apart; null – nothing to take back (a drag within the day that pushed nothing has no
   * line, as in „Dziś”).
   */
  push: WeekPush | null
  /** The blocks the move pushed apart on the target day. */
  pushed: number
}

/** The texts of a move refused in its turn (the toast says „Nie zapisano: …”). */
export const MOVE_GONE_TEXT = 'tego bloku nie ma już w planie dnia'
export const MOVE_BEGUN_TEXT = 'blok już się zaczął albo nie da się go przeciągnąć'
export const moveUnreadableText = (date: string): string => `plik dnia ${plDateWithWeekday(date)} jest teraz nieczytelny – spróbuj za chwilę`
export const moveUncountedText = (date: string): string => `log dnia ${plDateWithWeekday(date)} jest teraz nieczytelny – spróbuj za chwilę`

/**
 * The block as the source day has it now, still to be dragged (D305, D417 – `movableBlock`): in its plan, not begun nor
 * taken off, of its own hour, not passed – today where the forecast shows it, another day at its planned time. Throws why
 * not. What is anchored to it is not judged here (D424: the begun ones stay, the rest go; within the day they follow it).
 */
function movingOf(day: DayModel, id: string, today: string): PlanBlock {
  const was = day.ctx.plan.find((b) => b.id === id)
  const info = day.state.blocks.find((b) => b.id === id)
  if (!was || !info) throw new Error(MOVE_GONE_TEXT)
  const nowIdx = day.date === today ? day.state.now : null
  const placed = nowIdx != null ? day.state.forecast.find((p) => p.block.id === id) : undefined
  const end = placed?.to ?? plannedSpan(info, new Map(day.state.blocks.map((b) => [b.id, b])))?.end
  if (end == null || !movableBlock(info, day.state.facts.blocks.get(id), end, nowIdx)) throw new Error(MOVE_BEGUN_TEXT)
  return was
}

/**
 * The block dropped (D417). `at` – the window's clock (ms): today is counted from it at the drop (never a „today” read
 * before 04:00, T916). A day gone by among the days – refused, nothing read. To another day: `moveToDay`; within its day:
 * the drag of „Dziś” with its pushing (`moveWithinDay`).
 */
export async function moveWeekBlock(m: WeekMove, at = Date.now()): Promise<WeekMoved> {
  const today = logicalDayOf(at)
  if (!mayMoveBetween(m.from, m.to, today)) return { status: 'refused', push: null, pushed: 0 }
  return m.from === m.to ? moveWithinDay(m, today, at) : moveToDay(m, today, at)
}

/**
 * What the write came to (T952, T919): every entry written or waiting for the folder – saved; nothing sent, or a broken file
 * with nothing written (a broken file is never written over, and what goes with it waits with it) – failed; else pending.
 */
export function statusOf(out: readonly EditOutcome[] | null, state: SendState): WeekMoveStatus {
  if (out == null) return state.afterSend ? 'pending' : 'failed'
  if (isSaved(out)) return 'saved'
  return out.some((o) => o.status === 'broken') && !out.some((o) => o.status === 'applied') ? 'failed' : 'pending'
}

/**
 * The target's whole change from its two entries (T952): the block with its followers, and the pushed starts over them – for
 * „Cofnij” and the bar. A field in both: its base from the first, its value from the second.
 */
function wholeOf(bring: EditEntry | null, push: EditEntry | null): EditEntry | null {
  if (!bring || !push) return bring ?? push
  const edits = bring.edits.map((e) => {
    const later = push.edits.find((p) => p.path.join('\u0001') === e.path.join('\u0001'))
    return later ? { ...e, value: later.value } : e
  })
  for (const p of push.edits) if (!edits.some((e) => e.path.join('\u0001') === p.path.join('\u0001'))) edits.push(p)
  return { ...bring, edits }
}

/**
 * Within its day: its new start and the blocks it pushes (D305, D367) – one edit in its turn, made from the file as it is
 * then; what is anchored to it follows it, as in „Dziś” (D424). Pushed – the window's line „Przesunięto N bloków w 1 dniu ·
 * Cofnij” (as „Dodaj” of „Tydzień”) and, today, the bar's marker of variants; nothing pushed – no line (as „Dziś”, T917).
 */
async function moveWithinDay(m: WeekMove, today: string, at: number): Promise<WeekMoved> {
  let day: WeekPushedDay | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([m.from])
    if (!(m.from in files)) throw new Error(moveUnreadableText(m.from))
    const file = files[m.from] ?? null
    const source = await countedDay(m.from, file, at)
    if (!source) throw new Error(moveUncountedText(m.from))
    const was = movingOf(source, m.blockId, today)
    const span = { startMin: m.startMin, endMin: m.startMin + was.durationMin }
    const c = dragChange(source, m.blockId, span, null, span, true)!
    const starts = pushedStarts(source.ctx.plan, c)
    // Its start over the block as the file holds it then (as `draggedBlock` of „Dziś” is saved), then the pushed ones.
    const after = withPushed(dayRaw(file, m.from), m.from, (r) => r, [{ block: was, startMin: c.block.startMin! }, ...starts])
    const entry = editOf(paths.day(m.from), file, after)
    if (entry) day = { date: m.from, entry, made: entry.create ? after : null, moved: starts.length }
    return [entry]
  }, state)
  const status = statusOf(out, state)
  const d = day as WeekPushedDay | null
  if (status !== 'saved' || !d || d.moved === 0) return { status, push: null, pushed: 0 }
  await tellBar(d, today)
  return { status, push: { days: [d] }, pushed: d.moved }
}

/**
 * To another day – ONE edit of the queue in the turn of the window's edits (T952): both days read and counted side by side,
 * checked and written with no break between. Its owner is the target's half that brings the block (and the blocks going with
 * it); the source's half that lets it go and the blocks the target pushes apart go with it (`after`): laid only once the
 * owner is – a question about the owner writes nothing of it (T960) and keeps them waiting, „theirs” takes them out with
 * it. So the block never stands on neither day, nor on both after your answer about the target: the source lets it go only
 * after the target has it; a question about the source's half leaves it on both days only until you answer (its `movedTo` is
 * laid with what did not meet the change, so even „theirs” leaves the plan with it on the target alone).
 */
async function moveToDay(m: WeekMove, today: string, at: number): Promise<WeekMoved> {
  const days: WeekPushedDay[] = []
  let stayed: Array<{ name: string; how: StayHow }> = []
  let pushed = 0
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([m.from, m.to])
    for (const d of [m.from, m.to]) if (!(d in files)) throw new Error(moveUnreadableText(d))
    const fromFile = files[m.from] ?? null
    const toFile = files[m.to] ?? null
    const [source, there] = await Promise.all([countedDay(m.from, fromFile, at), countedDay(m.to, toFile, at)])
    if (!source) throw new Error(moveUncountedText(m.from))
    const was = movingOf(source, m.blockId, today)
    // As the source's file holds it (a change made a moment before stays), as „Przenieś na…” moves it.
    const b = blockNow(dayRaw(fromFile, m.from), m.from, was)
    const facts = source.state.facts
    const two = moveBetweenDays(fromFile, toFile, b, source.ctx.plan, m.from, m.to, true, { startMin: m.startMin, stay: stayingIds(facts) })
    const naming = namingOf(source.ctx, facts)
    stayed = two.stayers.map((s) => ({ name: m.names ? nameById(s.id, naming, m.names) : 'blok', how: stayHowOf(s, facts.blocks.get(s.id)) }))
    const starts = there ? pushedOn(there, movedBlock(b, source.ctx.plan, m.from, true, m.startMin), two.followers) : []
    const toAll = withPushed(two.target, m.to, (r) => r, starts)
    // The target in two entries: the block with its followers (the owner), then the pushed starts over it.
    const bring = editOf(paths.day(m.to), toFile, two.target)
    const push = editOf(paths.day(m.to), two.target, toAll)
    const leave = editOf(paths.day(m.from), fromFile, two.source)
    // What „Cofnij” takes back: each day's whole change (the target's – its two entries as one).
    const whole = wholeOf(bring, push)
    if (leave) days.push({ date: m.from, entry: leave, made: leave.create ? two.source : null, moved: 0 })
    if (whole) days.push({ date: m.to, entry: whole, made: whole.create ? toAll : null, moved: starts.length })
    pushed = starts.length
    return withOwner(bring, [leave, push].filter((e): e is EditEntry => e != null))
  }, state)
  const status = statusOf(out, state)
  if (status !== 'saved') return { status, push: null, pushed: 0 }
  const target = days.find((d) => d.date === m.to)
  if (target) await tellBar(target, today)
  return { status, push: days.length ? { days, move: { blockId: m.blockId, name: m.name, from: m.from, to: m.to, ...(stayed.length ? { stayed } : {}) } } : null, pushed }
}

/**
 * The starts the block (and its followers, still anchored to it) pushes apart on the target day (D367): the day's plan with
 * them in it, counted as „Dodaj” counts a new block (`addChange`).
 */
function pushedOn(day: DayModel, block: PlanBlock, followers: readonly PlanBlock[]): PushedStart[] {
  const plan = followers.reduce((p, f) => withBlock(p, f), withBlock(day.ctx.plan, block))
  const pushed = pushApart(day.ctx, day.state, plan, block.id, { onUnsettled })
  return pushedStarts(day.ctx.plan, { was: null, block, patch: block, pushed })
}

/** Today's pushing told to the bar for the marker of variants only (D400: no line of its own – the one „Cofnij” is the window's). */
async function tellBar(d: WeekPushedDay, today: string): Promise<void> {
  if (d.date !== today || d.moved === 0) return
  try {
    await window.rd.planPushed(d.date, d.moved, d.entry, d.made, false)
  } catch {
    // The plan is saved; only the bar's marker is missing (the main process is closing).
  }
}
