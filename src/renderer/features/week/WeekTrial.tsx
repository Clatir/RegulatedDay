/**
 * Energy live in „Tydzień” and „3 dni” (N19, T2582): while a block is held over a column, the lowest energy of THE DAY IT WOULD STAND ON before the
 * drop and with it – „najniższa energia 52 → 44 (G)” under the band of its place. The columns have only the track of the energy, no engine state
 * to try a plan on, so the days are read and counted in the window – but only when the pointer rests (`TRIAL_DELAY_MS` over the same pair of days;
 * one that passes over the columns counts nothing), once for a day and the data (`WeekDays`, one for the whole grid – the days of a drag are
 * counted once, the tiles' windows of cost take them from it too). The plan after the drop is the one the drop writes (`weekTrialChange`): within a
 * day `dragChange` / `copyPreview`, onto another day `movedDayPlan` – the block with the blocks anchored to it that go with it and what they push
 * apart, by the functions of the write (`weekMove.ts`); a copy – the block as a new one (`addChange`). Said of the target day only: the day the
 * block leaves is not counted. A drop onto a block (D492), a group's drag and a drop that writes nothing say nothing here.
 */
import { useEffect, useState } from 'react'
import { copiedBlock } from '@shared/engine/planEdit'
import type { TrialChange } from '@shared/engine/trialEnergy'
import { useNow } from '../../lib/clock'
import { useData } from '../../store/data'
import { readDay, type DayModel } from '../../store/day'
import { copyPreview } from '../plan/blockCopy'
import { TrialCaption, trialText } from '../plan/TrialCaption'
import { changeTrial, TRIAL_DELAY_MS, useTrialLowest, type Trial } from '../plan/trialEnergy'
import { addChange, COPY_SPAN_ID, dragChange } from '../today/dayPush'
import { movedDayPlan } from './weekMove'

/** What is held: the block, its day, the day and start it would take, Ctrl (a copy). */
export interface WeekTrialDrop {
  id: string
  from: string
  to: string
  startMin: number
  copy: boolean
}

/** How long a day counted for a trial stands (ms) – the window's own clock of a day (`useDay`'s tick). */
export const DAY_FRESH_MS = 30_000

/**
 * The days of the columns counted for the energy on trial – each once for the data it was read at (the window's `stamp`) and the half minute; a read
 * that failed is kept too (asked again at once it would be asked in every render). One per grid, so that a drag over the columns and the windows of
 * the tiles' costs share them.
 */
export class WeekDays {
  private readonly memo = new Map<string, { key: string; day: Promise<DayModel | null>; model?: DayModel | null }>()

  constructor(private readonly read: (date: string) => Promise<DayModel | null> = readDay) {}

  private keyNow = (): string => `${useData.getState().stamp}|${Math.floor(Date.now() / DAY_FRESH_MS)}`

  /** The day `date` counted (read now when this data has not counted it yet). */
  of(date: string): Promise<DayModel | null> {
    const key = this.keyNow()
    const known = this.memo.get(date)
    if (known?.key === key) return known.day
    const entry: { key: string; day: Promise<DayModel | null>; model?: DayModel | null } = { key, day: this.read(date) }
    entry.day = entry.day.then((d) => (entry.model = d))
    this.memo.set(date, entry)
    return entry.day
  }

  /** The day `date` when it is counted already for this data – at once, no wait (null: not yet, or it cannot be read). */
  peek(date: string): DayModel | null {
    const known = this.memo.get(date)
    return known?.key === this.keyNow() ? (known.model ?? null) : null
  }
}

/**
 * The change the drop writes on the target day, as a trial: `source` – the block's own day, `target` – the day it lands on (the same model within
 * a day); `today` – the window's today. Null – nothing to try (the block cannot be dragged now).
 */
export function weekTrialChange(source: DayModel, target: DayModel, d: WeekTrialDrop, today: string): TrialChange | null {
  const pushes = d.to >= today
  const b = source.ctx.plan.find((x) => x.id === d.id)
  if (!b) return null
  if (d.from === d.to) {
    const c = d.copy ? copyPreview(target, b, d.startMin, pushes) : dragChange(target, d.id, { startMin: d.startMin, endMin: d.startMin }, null, { startMin: d.startMin, endMin: d.startMin }, pushes)
    return c ? changeTrial(target, c) : null
  }
  if (d.copy) return changeTrial(target, addChange(target, copiedBlock(b, d.startMin, { id: COPY_SPAN_ID }), pushes))
  const plan = movedDayPlan(source, target, { blockId: d.id, from: d.from, to: d.to, startMin: d.startMin }, today)
  return plan ? { plan } : null
}

const keyOf = (d: WeekTrialDrop): string => `w|${d.from}|${d.to}|${d.id}|${d.startMin}|${d.copy}`

/**
 * The caption under the band of a block held over a column (`top` – its bottom edge in the column), for as long as a band stands in it. `want` – what is held
 * as the trial sees it, null – nothing to say now (a drop that writes nothing, a group…): the component stays (its days and its count are kept – a block that goes
 * back to its own place and away again is not counted from the start). None over a day gone by (the drop there is refused; the clock may pass 04:00 meanwhile).
 */
export function WeekTrial({ want, top, days }: { want: WeekTrialDrop | null; top: number; days: WeekDays }) {
  const today = useData((s) => s.view?.today ?? '')
  const stamp = useData((s) => s.stamp)
  // The days are counted again as the window counts them (`useDay`'s half minute).
  const tick = useNow(DAY_FRESH_MS)
  // `fresh`: the days came from a read made for this rest of the pointer (not from the grid's memory) – the first count then needs no delay of its own.
  const [loaded, setLoaded] = useState<{ from: string; to: string; source: DayModel; target: DayModel; fresh: boolean } | null>(null)
  const from = want?.from
  const to = want?.to
  // The days are read and counted when the pointer has rested over this pair of days – not on the way across the columns; the ones the grid has counted already are
  // taken from its memory (the count of the change waits for the rest of the pointer as for any other).
  useEffect(() => {
    if (from == null || to == null || !today || to < today) return
    const target = days.peek(to)
    const source = from === to ? target : days.peek(from)
    if (target && source) {
      setLoaded((was) => (was?.from === from && was.to === to && was.source === source && was.target === target ? was : { from, to, source, target, fresh: false }))
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      void Promise.all([days.of(to), from === to ? null : days.of(from)]).then(([t, src]) => {
        if (alive && t && (src || from === to)) setLoaded({ from, to, source: src ?? t, target: t, fresh: true })
      })
    }, TRIAL_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [from, to, today, stamp, tick, days])
  const ready = want && today && want.to >= today && loaded && loaded.from === want.from && loaded.to === want.to ? loaded : null
  const trial: Trial | null = ready && want ? { key: keyOf(want), change: () => weekTrialChange(ready.source, ready.target, want, today) } : null
  const shown = useTrialLowest(ready?.target ?? null, trial, { onArrival: ready?.fresh })
  if (!trialText(shown)) return null
  return (
    <div className="pointer-events-none absolute right-0 left-0 z-30 rounded-sm border border-line bg-bg/90 px-1 text-[10.5px] leading-[13px]" style={{ top }} data-testid="week-energy-trial" data-date={want?.to}>
      <TrialCaption shown={shown} />
    </div>
  )
}
