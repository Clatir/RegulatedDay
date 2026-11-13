/**
 * A block dragged in the columns of „Tydzień” and „3 dni” (D417): to another day – the move of „Przenieś na…” (its id stays,
 * one move more, the day it came from; a block of the template or of a series leaves its day by `movedTo`, its steps' ticks
 * go with it, its own attachments see it by its id) at the hour it was dropped at – or to another hour of its own day (the
 * drag of „Dziś”, D305). On the taken place the flexible blocks after it are pushed apart (D367, as „Dodaj” of „Tydzień”
 * counts them – D400). Both days in one write of the window's queue, and one „Cofnij” for both (`WeekPush.move`).
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { movableBlock, plannedSpan } from '@shared/engine/blocks'
import { mayMoveBetween } from '@shared/engine/calendarViews'
import { moveBetweenDays, movedBlock } from '@shared/engine/planEdit'
import { plDateWithWeekday } from '@shared/format'
import type { DayModel } from '../../store/day'
import { editOf, isSaved, trySaveWith, type SendState } from '../../store/data'
import type { WeekPush, WeekPushedDay } from '../../store/weekPush'
import { blockNow, withPushed, type PushedStart } from '../today/dayActions'
import { addChange, dragChange, pushedStarts } from '../today/dayPush'
import { countedDay } from './weekActions'

/** Where a block was dropped: its day (`from`), the day of the column it was dropped on (`to`) and its new start there. */
export interface WeekMove {
  blockId: string
  from: string
  to: string
  /** Logical minutes of the target day (the 5-min grid of the drag). */
  startMin: number
}

/**
 * What the move came to: `saved` – written (or waiting for the folder); `pending` – sent and met a change from another
 * computer (a question), or its outcome is not known; `failed` – nothing was written (the toast said why); `refused` – a day
 * gone by among the days (D417: never changed by dragging) – nothing was asked of the folder.
 */
export type WeekMoveStatus = 'saved' | 'pending' | 'failed' | 'refused'

export interface WeekMoved {
  status: WeekMoveStatus
  /** For the line with „Cofnij” (`showWeekPush`): the days written, as one move; null – nothing saved. */
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
 * Whether the block may still be dragged as the source day has it now (D305, D417 – `movableBlock`): in its plan, not begun
 * nor taken off, of its own hour, not passed – today where the forecast shows it, another day at its planned time.
 */
function stillMovable(day: DayModel, id: string, today: string): boolean {
  const info = day.state.blocks.find((b) => b.id === id)
  if (!info) return false
  const nowIdx = day.date === today ? day.state.now : null
  const placed = nowIdx != null ? day.state.forecast.find((p) => p.block.id === id) : undefined
  const end = placed?.to ?? plannedSpan(info, new Map(day.state.blocks.map((b) => [b.id, b])))?.end
  return end != null && movableBlock(info, day.state.facts.blocks.get(id), end, nowIdx)
}

/**
 * The block dropped (D417): made in the turn of the window's edits from both days' files as they are then. The source day is
 * counted first – a block that began meanwhile (another computer), or a day whose log cannot be read whole now, is not moved
 * (a begun block never leaves its day by a drag). The target day pushes its flexible blocks after the block apart
 * (`pushApart`); a target that cannot be counted now takes the block alone (never refused – D72). Today's pushing is told to
 * the bar for the marker of variants only (no line of its own – the one „Cofnij” is the window's).
 */
export async function moveWeekBlock(m: WeekMove, today: string): Promise<WeekMoved> {
  if (!mayMoveBetween(m.from, m.to, today)) return { status: 'refused', push: null, pushed: 0 }
  const dates = m.from === m.to ? [m.from] : [m.from, m.to]
  const written: WeekPushedDay[] = []
  let pushed = 0
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(dates)
    for (const d of dates) if (!(d in files)) throw new Error(moveUnreadableText(d))
    const fromFile = files[m.from] ?? null
    const source = await countedDay(m.from, fromFile)
    if (!source) throw new Error(moveUncountedText(m.from))
    const was = source.ctx.plan.find((b) => b.id === m.blockId)
    if (!was) throw new Error(MOVE_GONE_TEXT)
    if (!stillMovable(source, m.blockId, today)) throw new Error(MOVE_BEGUN_TEXT)
    const edits: Array<{ date: string; before: RawRecord | null; after: RawRecord; moved: number }> = []
    if (m.from === m.to) {
      // Within its day: the drag of „Dziś” (D305, D367) – its new start and the blocks it pushes, one edit.
      const c = dragChange(source, m.blockId, { startMin: m.startMin, endMin: m.startMin + was.durationMin }, null, { startMin: m.startMin, endMin: m.startMin + was.durationMin }, true)!
      const starts = pushedStarts(source.ctx.plan, c)
      // Its start over the block as the file holds it then (as `draggedBlock` of „Dziś” is saved), then the pushed ones.
      const after = withPushed(dayRaw(fromFile, m.from), m.from, (r) => r, [{ block: was, startMin: c.block.startMin! }, ...starts])
      edits.push({ date: m.from, before: fromFile, after, moved: starts.length })
    } else {
      const toFile = files[m.to] ?? null
      // The block as the source's file holds it (a change made a moment before stays), as „Przenieś na…” moves it.
      const b = blockNow(dayRaw(fromFile, m.from), m.from, was)
      const target = await countedDay(m.to, toFile)
      const starts: PushedStart[] = target ? pushedStarts(target.ctx.plan, addChange(target, movedBlock(b, source.ctx.plan, m.from, true, m.startMin), true)) : []
      const two = moveBetweenDays(fromFile, toFile, b, source.ctx.plan, m.from, m.to, true, m.startMin)
      edits.push({ date: m.from, before: fromFile, after: two.source, moved: 0 })
      edits.push({ date: m.to, before: toFile, after: withPushed(two.target, m.to, (r) => r, starts), moved: starts.length })
    }
    const entries: EditEntry[] = []
    for (const e of edits) {
      const entry = editOf(paths.day(e.date), e.before, e.after)
      if (!entry) continue
      entries.push(entry)
      written.push({ date: e.date, entry, made: entry.create ? e.after : null, moved: e.moved })
      pushed += e.moved
    }
    return entries
  }, state)
  const status: WeekMoveStatus = movedStatus(out, state)
  if (status !== 'saved') return { status, push: null, pushed: 0 }
  const mine = written.find((d) => d.date === today && d.moved > 0)
  if (mine) {
    try {
      await window.rd.planPushed(mine.date, mine.moved, mine.entry, mine.made, false)
    } catch {
      // The plan is saved; only the bar's marker is missing (the main process is closing).
    }
  }
  return { status, push: written.length ? { days: written, move: { blockId: m.blockId, from: m.from, to: m.to } } : null, pushed }
}

/** What the write came to: every edit went – saved; none sent – failed; sent and not all through, or not known – pending. */
function movedStatus(out: readonly EditOutcome[] | null, state: SendState): WeekMoveStatus {
  if (out == null) return state.afterSend ? 'pending' : 'failed'
  return isSaved(out) ? 'saved' : out.some((o) => o.status === 'broken') ? 'failed' : 'pending'
}
