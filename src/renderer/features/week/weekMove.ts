/**
 * A block dragged in the columns of „Tydzień” and „3 dni” (D417, D422): to another day – the move of „Przenieś na…” (its id
 * stays, one move more, the day it came from; a block of the template or of a series leaves its day by `movedTo`, its steps'
 * ticks go with it, its own attachments see it by its id; the blocks anchored to it go with it – T911) at the hour it was
 * dropped at – or to another hour of its own day (the drag of „Dziś”, D305). On the taken place the flexible blocks after it
 * are pushed apart (D367, as „Dodaj” of „Tydzień” counts them – D400). One „Cofnij” for both days (`WeekPush.move`).
 */
import { dayRaw } from '@shared/data/dayEdits'
import { editStands, inverseEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { movableBlock, plannedSpan } from '@shared/engine/blocks'
import { mayMoveBetween } from '@shared/engine/calendarViews'
import { anchoredTo, movedBlock, moveSource, moveTarget } from '@shared/engine/planEdit'
import { pushApart, withBlock } from '@shared/engine/pushApart'
import { plDateWithWeekday } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { logicalDayOf } from '@shared/time/day'
import type { DayModel } from '../../store/day'
import { editOf, isSaved, saveAnswer, trySaveWith, type SendState } from '../../store/data'
import type { WeekPush, WeekPushedDay } from '../../store/weekPush'
import { blockNow, withPushed, type PushedStart } from '../today/dayActions'
import { dragChange, onUnsettled, pushedStarts } from '../today/dayPush'
import { countedDay } from './weekActions'

/** Where a block was dropped: its day (`from`), the day of the column it was dropped on (`to`) and its new start there. */
export interface WeekMove {
  blockId: string
  /** What the window calls it (`blockName`) – the line „Przeniesiono: <name> na <dzień>” (D422). */
  name: string
  from: string
  to: string
  /** Logical minutes of the target day (the 5-min grid of the drag). */
  startMin: number
}

/**
 * What the move came to: `saved` – written (or waiting for the folder); `pending` – sent and met a change from another
 * computer (a question), or its outcome is not known – the block stands where the folder's answer leaves it (T912);
 * `failed` – nothing stays written (the toast said why); `refused` – a day gone by among the days (D417: never changed by
 * dragging) – nothing was asked of the folder.
 */
export type WeekMoveStatus = 'saved' | 'pending' | 'failed' | 'refused'

export interface WeekMoved {
  status: WeekMoveStatus
  /**
   * For the line with „Cofnij” (`showWeekPush`): the days written – a move to another day (`move`, D422), or a drag within
   * the day that pushed blocks apart; null – nothing to take back (a drag within the day that pushed nothing has no line,
   * as in „Dziś”).
   */
  push: WeekPush | null
  /** The blocks the move pushed apart on the target day. */
  pushed: number
}

/** The texts of a move refused in its turn (the toast says „Nie zapisano: …”). */
export const MOVE_GONE_TEXT = 'tego bloku nie ma już w planie dnia'
export const MOVE_BEGUN_TEXT = 'blok już się zaczął albo nie da się go przeciągnąć'
export const MOVE_FOLLOWER_TEXT = 'blok zakotwiczony do niego już się zaczął albo nie może zmienić dnia'
export const moveUnreadableText = (date: string): string => `plik dnia ${plDateWithWeekday(date)} jest teraz nieczytelny – spróbuj za chwilę`
export const moveUncountedText = (date: string): string => `log dnia ${plDateWithWeekday(date)} jest teraz nieczytelny – spróbuj za chwilę`

/**
 * Whether the block may still be dragged as the source day has it now (D305, D417 – `movableBlock`): in its plan, not begun
 * nor taken off, of its own hour (`anchored`: a follower – its anchor's), not passed – today where the forecast shows it,
 * another day at its planned time.
 */
function stillMovable(day: DayModel, id: string, today: string, anchored = false): boolean {
  const info = day.state.blocks.find((b) => b.id === id)
  if (!info) return false
  const nowIdx = day.date === today ? day.state.now : null
  const placed = nowIdx != null ? day.state.forecast.find((p) => p.block.id === id) : undefined
  const end = placed?.to ?? plannedSpan(info, new Map(day.state.blocks.map((b) => [b.id, b])))?.end
  return end != null && movableBlock(info, day.state.facts.blocks.get(id), end, nowIdx, anchored)
}

/** The block of the plan, and what is anchored to it, checked as the source day has them now; throws why not. */
function movingOf(source: DayModel, id: string, today: string): { was: PlanBlock; followers: PlanBlock[] } {
  const was = source.ctx.plan.find((b) => b.id === id)
  if (!was) throw new Error(MOVE_GONE_TEXT)
  if (!stillMovable(source, id, today)) throw new Error(MOVE_BEGUN_TEXT)
  const followers = anchoredTo(source.ctx.plan, id)
  if (followers.some((f) => !stillMovable(source, f.id, today, true))) throw new Error(MOVE_FOLLOWER_TEXT)
  return { was, followers }
}

/**
 * The block dropped (D417). `at` – the window's clock (ms): today is counted from it at the drop (never a „today” read
 * before 04:00). A day gone by among the days – refused, nothing read. To another day: `moveToDay`; within its day: the drag
 * of „Dziś” with its pushing (`moveWithinDay`).
 */
export async function moveWeekBlock(m: WeekMove, at = Date.now()): Promise<WeekMoved> {
  const today = logicalDayOf(at)
  if (!mayMoveBetween(m.from, m.to, today)) return { status: 'refused', push: null, pushed: 0 }
  return m.from === m.to ? moveWithinDay(m, today, at) : moveToDay(m, today, at)
}

/** As `saveAnswer`: written – saved; a question or not known – pending; nothing – failed. */
const statusOf = (a: ReturnType<typeof saveAnswer>): WeekMoveStatus => (a === true ? 'saved' : a === 'asked' ? 'pending' : 'failed')

/**
 * Within its day: its new start and the blocks it pushes (D305, D367) – one edit in its turn, made from the file as it is
 * then. Pushed – the window's line „Przesunięto N bloków w 1 dniu · Cofnij” (as „Dodaj” of „Tydzień”) and, today, the bar's
 * marker of variants; nothing pushed – no line (as „Dziś”).
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
    const { was } = movingOf(source, m.blockId, today)
    const span = { startMin: m.startMin, endMin: m.startMin + was.durationMin }
    const c = dragChange(source, m.blockId, span, null, span, true)!
    const starts = pushedStarts(source.ctx.plan, c)
    // Its start over the block as the file holds it then (as `draggedBlock` of „Dziś” is saved), then the pushed ones.
    const after = withPushed(dayRaw(file, m.from), m.from, (r) => r, [{ block: was, startMin: c.block.startMin! }, ...starts])
    const entry = editOf(paths.day(m.from), file, after)
    if (entry) day = { date: m.from, entry, made: entry.create ? after : null, moved: starts.length }
    return [entry]
  }, state)
  const status = statusOf(saveAnswer(out, state))
  const d = day as WeekPushedDay | null
  if (status !== 'saved' || !d || d.moved === 0) return { status, push: null, pushed: 0 }
  await tellBar(d, today)
  return { status, push: { days: [d] }, pushed: d.moved }
}

/**
 * To another day (T912): the target first – both days read and counted side by side in the turn of the window's edits, the
 * block (with its followers and the blocks it pushes apart there) written into the target; only once that is written does
 * the source let it go, over its file as it is then. The source's edit refused for good (a broken file, a file not readable
 * now): the target is taken back – the block never stays on neither day; a question about it (another computer's change met
 * it) or an answer not known: the target stays (at worst the block stands on both days until you answer – never lost).
 */
async function moveToDay(m: WeekMove, today: string, at: number): Promise<WeekMoved> {
  let target: WeekPushedDay | null = null
  let ids: string[] = []
  const first: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([m.from, m.to])
    for (const d of [m.from, m.to]) if (!(d in files)) throw new Error(moveUnreadableText(d))
    const fromFile = files[m.from] ?? null
    const toFile = files[m.to] ?? null
    const [source, there] = await Promise.all([countedDay(m.from, fromFile, at), countedDay(m.to, toFile, at)])
    if (!source) throw new Error(moveUncountedText(m.from))
    const { was, followers } = movingOf(source, m.blockId, today)
    // As the source's file holds them (a change made a moment before stays), as „Przenieś na…” moves them.
    const raw = dayRaw(fromFile, m.from)
    const b = blockNow(raw, m.from, was)
    const along = followers.map((f) => blockNow(raw, m.from, f))
    ids = [b.id, ...along.map((f) => f.id)]
    const starts = there ? pushedOn(there, movedBlock(b, source.ctx.plan, m.from, true, m.startMin), along) : []
    const after = withPushed(moveTarget(fromFile, toFile, b, source.ctx.plan, m.from, m.to, true, { startMin: m.startMin, followers: along }), m.to, (r) => r, starts)
    const entry = editOf(paths.day(m.to), toFile, after)
    if (entry) target = { date: m.to, entry, made: entry.create ? after : null, moved: starts.length }
    return [entry]
  }, first)
  const t = target as WeekPushedDay | null
  const wrote = statusOf(saveAnswer(out, first))
  if (wrote !== 'saved' || !t) return { status: wrote, push: null, pushed: 0 }
  // The source, from its file as it is now (the target's write came between).
  let source: WeekPushedDay | null = null
  const second: SendState = { afterSend: false }
  const left = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([m.from])
    if (!(m.from in files)) throw new Error(moveUnreadableText(m.from))
    const before = files[m.from] ?? null
    const after = moveSource(before, ids, m.from, m.to)
    const entry = editOf(paths.day(m.from), before, after)
    if (entry) source = { date: m.from, entry, made: entry.create ? after : null, moved: 0 }
    return [entry]
  }, second)
  const s = source as WeekPushedDay | null
  const freed = saveAnswer(left, second)
  if (freed === true) {
    await tellBar(t, today)
    const days = s ? [s, t] : [t]
    return { status: 'saved', push: { days, move: { blockId: m.blockId, name: m.name, from: m.from, to: m.to } }, pushed: t.moved }
  }
  if (freed === 'asked') return { status: 'pending', push: null, pushed: t.moved }
  // The source will not let it go: the target as it was – while it stands as the move left it.
  const back = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([m.to])
    const now = m.to in files ? (files[m.to] ?? null) : null
    return [m.to in files && editStands(t.entry, now, t.made) ? inverseEdit(t.entry, now, t.made) : null]
  })
  if (isSaved(back) && back!.length > 0) return { status: 'failed', push: null, pushed: 0 }
  // Not taken back (its file not readable now, changed since): the block stays on the target; its „Cofnij” in the line.
  return { status: 'pending', push: { days: [t], move: { blockId: m.blockId, name: m.name, from: m.from, to: m.to } }, pushed: t.moved }
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
