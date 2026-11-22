/**
 * A sprawa of the panel „Sprawy” beside „Tydzień” / „3 dni” dropped on a column of a day (UX19, D565 P27 – changes D384). The gesture is the
 * pointer's (`usePointerDrag`, as the panel beside the axis of „Dziś”, D305): the target is the column under the pointer and the hour at its height on
 * the 5-min grid – the columns tell their own scale in `data-week-col` (the day), `data-lo`, `data-hi` and `data-ppm` (`DayColumn`), so nothing is
 * needed of the grid but the elements. The drop reads the day it falls on (`countedDay`) and puts the sprawa – or the selection of the panel the
 * drag carries – on it as the axis of „Dziś” does (`planOnAxis`, `planGroupDrop`: the same pushing apart, the same „Cofnij”); a day gone by is
 * history – refused in words, nothing is written. „Zaplanuj” of a row is today's nearest free place.
 */
import type { CaseItem } from '@shared/engine/cases'
import { logicalMinuteOf } from '@shared/time/day'
import { MIN_BLOCK_MIN } from '@shared/model/plan'
import { DAY_UNREADABLE } from '../../store/cases'
import { useData } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { caseTitle } from '../cases/casesLogic'
import { nextFreeStart } from '../cases/casesUi'
import { planGroupDrop } from '../cases/groupActions'
import { planOnAxis } from '../cases/planOnAxis'
import { usePointerDrag, type GrabEvent, type PointerDragState } from '../cases/usePointerDrag'
import { scrollParent } from '../../lib/axisScroll'
import { gridMinute } from '../plan/gridCreate'

/** Where a sprawa dropped now would stand: the day of the column under the pointer and the minute of the axis at its height. */
export interface WeekDrop {
  date: string
  minute: number
}

/** What a drop on a day gone by says (the words of the drag of a block there). */
export const PAST_CASE_DROP_TEXT = 'Dni minionych nie zmieniasz przeciąganiem.'

/** The column of a day under a point of the window and the minute at that height (5-min grid, at least 5 min before the axis's bottom); null – over no column. */
export function weekDropAt(x: number, y: number): WeekDrop | null {
  // The headings of the days and the strip of all-day events stay over the columns while the axis scrolls: a point in them is no drop (the column
  // under them has an hour nobody sees there).
  const head = document.querySelector<HTMLElement>('[data-testid="week-head"]')?.getBoundingClientRect()
  if (head && x >= head.left && x <= head.right && y >= head.top && y <= head.bottom) return null
  for (const el of document.querySelectorAll<HTMLElement>('[data-week-col]')) {
    const r = el.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    // Only what the box that scrolls the axis shows: a column scrolled out under the top bar or the banners is no target.
    const box = scrollParent(el)?.getBoundingClientRect()
    if (box && (x < box.left || x > box.right || y < box.top || y > box.bottom)) return null
    const lo = Number(el.dataset.lo)
    const hi = Number(el.dataset.hi)
    const ppm = Number(el.dataset.ppm)
    const date = el.dataset.weekCol
    if (!date || !Number.isFinite(lo) || !Number.isFinite(hi) || !(ppm > 0)) return null
    return { date, minute: Math.min(Math.max(gridMinute(y - r.top, lo, ppm), lo), hi - MIN_BLOCK_MIN) }
  }
  return null
}

/** The place a drag is over, on the screen: the column's rectangle and the top and height of the band of the block (null – the column is not there). */
export function bandOf(target: WeekDrop, lengthMin: number): { left: number; width: number; top: number; height: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-week-col="${target.date}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const lo = Number(el.dataset.lo)
  const ppm = Number(el.dataset.ppm)
  return { left: r.left, width: r.right - r.left, top: r.top + (target.minute - lo) * ppm, height: Math.max(14, lengthMin * ppm) }
}

/** The pointer's drag of a sprawa onto the columns (`onDrop` hears the sprawa grabbed, where it was dropped, Ctrl held). */
export function useWeekCaseDrag(onDrop: (id: string, target: WeekDrop, copy: boolean) => void): { drag: PointerDragState<WeekDrop> | null; grab: (id: string, e: GrabEvent) => void; started: { current: boolean } } {
  return usePointerDrag<WeekDrop>(weekDropAt, onDrop)
}

/** The day of a column as the engine has it now (its file and its logs read), for the write of a drop; null – it cannot be counted now (said). */
async function modelOf(date: string): Promise<DayModel | null> {
  let model: DayModel | null = null
  try {
    // A date missing from the answer – the day's file cannot be read now (`dayFiles`): nothing is written.
    const files = await window.rd.dayFiles([date])
    if (date in files) model = await countedDay(date, files[date] ?? null)
  } catch {
    model = null
  }
  if (!model) toast(DAY_UNREADABLE, 'error', 6000)
  return model
}

/**
 * The drop of the sprawa `id` on `target`: the selection of the panel it is one of (`carried`, two and more) goes one after another from the hour
 * (the line „Zaplanowano 3 · … · Cofnij” of „Tydzień”), a single sprawa as on the axis of „Dziś” (the toast „Cofnij”); `copy` – Ctrl (D513). A day
 * before `today` refuses in words.
 */
export async function dropOnDay(o: { today: string; id: string; target: WeekDrop; copy: boolean; carried: readonly CaseItem[] | null }): Promise<void> {
  if (o.target.date < o.today) return void toast(PAST_CASE_DROP_TEXT, 'info', 5000)
  const { rd, requests } = useData.getState()
  const r = requests.find((x) => x.id === o.id)
  if (!r && !o.carried) return
  const model = await modelOf(o.target.date)
  if (!model) return
  if (o.carried) await planGroupDrop(model, o.today, o.carried, o.target.minute, o.copy, 'week')
  else if (r) await planOnAxis(model, o.today, r, caseTitle(r, rd), o.target.minute, undefined, o.copy)
}

/** „Zaplanuj” of a row: today's nearest free place from now (not before the wake) for the sprawa's estimate. */
export async function planToday(x: CaseItem, today: string): Promise<void> {
  const model = await modelOf(today)
  if (!model) return
  const start = nextFreeStart(model.state, { isToday: true, nowMin: logicalMinuteOf(today, Date.now()), wakeMin: model.ctx.wakeMin }, x.estimateMin)
  await planOnAxis(model, today, x.record, caseTitle(x.record, useData.getState().rd), start)
}
