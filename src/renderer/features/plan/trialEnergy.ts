/**
 * Energy live in the window (N19, T2579): the lowest energy of the day before a change and with it (`trialLowest`) while a block or a group is
 * dragged, an edge is held or the window of a tile's cost is open – counted off the pointer's path, so the drag never stutters: a change is
 * counted only once it has stayed the newest for `TRIAL_DELAY_MS` (a newer one drops it before it is built – the newest wins), a change
 * counted once on a day is remembered by its key (back over the same place – at once), the lowest before the change once a day (the engine's
 * memo). Nothing is written: no trial (Esc, the drop, the window closed) – no result at once.
 */
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { trialLowest, type TrialChange, type TrialDay, type TrialLowest } from '@shared/engine/trialEnergy'
import type { DayChange } from '../today/dayPush'
import { planAfter } from '../today/dayPush'

/**
 * How long a change has to stay the newest before it is counted (ms). While the pointer moves on, nothing is counted; once it rests, the
 * caption follows within this plus one count of the day (a few ms on a typical day – `trial-energy.test.ts`): well within 100 ms (N19).
 */
export const TRIAL_DELAY_MS = 40
/** How many changes of one day are remembered (a whole day's drag on the 5-min grid by its body and both edges is fewer). */
export const TRIAL_MEMORY = 512

/** A change to try: its key – the same key is the same change on the same day – and how it is built (called only when it is counted). */
export interface Trial {
  key: string
  /** The change (null – nothing to try, e.g. a cost of a block that ended): built only for the newest change, never for a dropped one. */
  change: () => TrialChange | null
}

/** What the caption shows: the trial's lowest energy before and after; `fresh` false – the newest change is still being counted (this is the last one). */
export interface TrialShown extends TrialLowest {
  fresh: boolean
}

/** A dragged block's change (`dragChange`, `parallelChange`, `copyChange`) as a trial: the plan after it, the pushed blocks at their new starts. */
export const changeTrial = (day: Pick<TrialDay, 'ctx'>, c: Pick<DayChange, 'block' | 'others' | 'pushed'>): TrialChange => ({ plan: planAfter(day.ctx.plan, c) })

type Count = (day: TrialDay, change: TrialChange) => TrialLowest | null

/**
 * The trials of one view, newest first (the hook's state, without React – tests drive it with a fake clock): `ask` with the day and the newest
 * trial, `snapshot` – what to show (the same object until it changes), `subscribe` – told when it changes.
 */
export class TrialRunner {
  private day: TrialDay | null = null
  private readonly memo = new Map<string, TrialLowest | null>()
  private want: string | null = null
  private pending: Trial | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  /** The last change counted, on the day it was counted on (another count of the day – it stands, not fresh, until the change is counted again). */
  private last: { key: string; value: TrialLowest | null; day: TrialDay } | null = null
  private shown: TrialShown | null = null
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly delayMs = TRIAL_DELAY_MS,
    private readonly count: Count = trialLowest
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): TrialShown | null => this.shown

  /**
   * The newest trial on `day` (null – none: what was pending is dropped, nothing is shown). `onArrival` – a trial that meets its first day (the day was
   * null before: it has just been counted for this very rest of the pointer) is counted at once, without the delay of a newer change (`WeekTrial`).
   */
  ask(day: TrialDay | null, trial: Trial | null, onArrival = false): void {
    const arrived = onArrival && this.day == null && day != null
    if (day !== this.day) {
      // Another count of the day (the clock, the data): what was counted on the old one says nothing of it – counted again.
      this.day = day
      this.memo.clear()
    }
    if (!day || !trial) {
      this.cancel()
      this.want = null
      this.last = null
      return this.publish()
    }
    if (trial.key === this.want && (this.pending || (this.last?.key === trial.key && this.last.day === day))) {
      // The same change, already pending or shown: a newer closure of it (another render) is the one to build.
      if (this.pending) this.pending = trial
      return this.publish()
    }
    this.want = trial.key
    if (this.memo.has(trial.key)) {
      this.cancel()
      this.last = { key: trial.key, value: this.memo.get(trial.key) ?? null, day }
      return this.publish()
    }
    this.pending = trial
    if (this.timer != null) clearTimeout(this.timer)
    if (arrived) {
      this.timer = null
      this.run()
      return
    }
    this.timer = setTimeout(() => this.run(), this.delayMs)
    this.publish()
  }

  /** Nothing pending, nothing shown (the view goes away; the runner may be asked again). */
  stop(): void {
    this.cancel()
    this.want = null
    this.last = null
    this.publish()
  }

  private cancel(): void {
    if (this.timer != null) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }

  private run(): void {
    this.timer = null
    const trial = this.pending
    const day = this.day
    this.pending = null
    if (!trial || !day || trial.key !== this.want) return
    let value: TrialLowest | null = null
    try {
      const change = trial.change()
      value = change ? this.count(day, change) : null
    } catch (e) {
      // A trial never breaks a drag: no caption, said in a development build.
      if (import.meta.env?.DEV) console.warn('energia na żywo: próba nie policzyła się', e)
    }
    if (this.memo.size >= TRIAL_MEMORY) this.memo.delete(this.memo.keys().next().value!)
    this.memo.set(trial.key, value)
    this.last = { key: trial.key, value, day }
    this.publish()
  }

  /** The shown result: the newest change's, or – while it is counted – the last one's (`fresh` false); none without a trial. */
  private publish(): void {
    const v = this.want != null ? this.last?.value : null
    const fresh = this.last?.key === this.want && this.last.day === this.day
    const next = v ? { ...v, fresh } : null
    const same = next === this.shown || (next && this.shown && fresh === this.shown.fresh && sameLowest(next, this.shown))
    if (same) return
    this.shown = next
    for (const l of this.listeners) l()
  }
}

const sameLowest = (a: TrialLowest, b: TrialLowest): boolean => a.before === b.before && a.after === b.after && a.pool === b.pool && a.beforePool === b.beforePool && a.assumed === b.assumed

/**
 * The lowest energy of `day` before the change `trial` and with it (N19), for the caption: null – no trial (Esc, the drop, the window closed),
 * the day has no energy to say (a day gone by, the module off), or the first change is still being counted. `trial.key` decides what is the
 * same change: everything the change depends on must be in it (the block, the edge, the place – minutes on the grid –, Ctrl, the cost's values).
 */
export function useTrialLowest(day: TrialDay | null, trial: Trial | null, o: { onArrival?: boolean } = {}): TrialShown | null {
  const runner = useRef<TrialRunner | null>(null)
  runner.current ??= new TrialRunner()
  const r = runner.current
  const shown = useSyncExternalStore(r.subscribe, r.snapshot, r.snapshot)
  // Layout: a change counted before (back over the same place) is shown before the frame is painted.
  useLayoutEffect(() => r.ask(day, trial, o.onArrival), [r, day, trial?.key])
  useEffect(() => () => r.stop(), [r])
  return shown
}
