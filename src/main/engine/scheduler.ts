/**
 * The deadlines of the main process (spec „Terminy”): every deadline is an absolute instant; the process sets an exact
 * timer for the nearest one and also checks everything every 15 s. A gap of more than 45 s between checks on either
 * clock is a sleep; the wall clock moving apart from the monotonic one without such a gap is a change of the clock. The
 * app listens to the events of sleep, wake, lock and unlock too (`hint`), but never relies on them. At 04:00 and after a
 * wake it announces the change of the logical day. The checks never run in a hidden window – only here.
 *
 * E1 builds the skeleton; E4a hangs the timer's deadlines on it (warnings, the end of a session, the proposals after
 * 90 min, water, reminders, backups, freezing).
 */
import { dayStart, logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'

export const CHECK_EVERY_MS = 15_000
export const SLEEP_GAP_MS = 45_000
/** A difference of the two clocks beyond this between two checks is a change of the wall clock. */
export const CLOCK_JUMP_MS = 2_000

export type CheckReason = 'tick' | 'deadline' | 'wake' | 'clock' | 'day' | 'hint'

export interface SchedulerDeps {
  wall: () => number
  mono: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** Every check, with why it ran. */
  onCheck: (reason: CheckReason, now: number) => void
  onWake?: (gapMs: number, now: number) => void
  onClockChange?: (deltaMs: number, now: number) => void
  onDayChange?: (from: string, to: string, now: number) => void
}

interface Deadline {
  at: number
  fn: (now: number) => void
}

export class Scheduler {
  private readonly deadlines = new Map<string, Deadline>()
  private timer: unknown = null
  private lastWall = 0
  private lastMono = 0
  private day = ''
  private running = false

  constructor(private readonly d: SchedulerDeps) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastWall = this.d.wall()
    this.lastMono = this.d.mono()
    this.day = logicalDayOf(this.lastWall)
    this.planDayChange()
    this.check('tick')
  }

  stop(): void {
    this.running = false
    if (this.timer != null) this.d.clearTimer(this.timer)
    this.timer = null
  }

  /** A deadline at an absolute instant (replacing one of the same id); it runs once. */
  at(id: string, at: number, fn: (now: number) => void): void {
    this.deadlines.set(id, { at, fn })
    if (this.running) this.arm()
  }

  cancel(id: string): void {
    this.deadlines.delete(id)
  }

  has(id: string): boolean {
    return this.deadlines.has(id)
  }

  /** An event of the system (resume, unlock …): check now – the check itself tells what happened. */
  hint(): void {
    if (this.running) this.check('hint')
  }

  private planDayChange(): void {
    this.deadlines.set('day-change', { at: dayStart(addDays(this.day, 1)), fn: () => undefined })
  }

  private check(reason: CheckReason): void {
    if (!this.running) return
    const wall = this.d.wall()
    const mono = this.d.mono()
    const dWall = wall - this.lastWall
    const dMono = mono - this.lastMono
    this.lastWall = wall
    this.lastMono = mono
    let why = reason
    if (dWall > SLEEP_GAP_MS || dMono > SLEEP_GAP_MS) {
      why = 'wake'
      this.d.onWake?.(Math.max(dWall, dMono), wall)
    } else if (Math.abs(dWall - dMono) > CLOCK_JUMP_MS) {
      why = 'clock'
      this.d.onClockChange?.(dWall - dMono, wall)
    }
    const today = logicalDayOf(wall)
    if (today !== this.day) {
      const from = this.day
      this.day = today
      this.planDayChange()
      if (why === 'tick' || why === 'deadline' || why === 'hint') why = 'day'
      this.d.onDayChange?.(from, today, wall)
    }
    // Deadlines due by the wall clock run once, in order of their instants.
    const due = [...this.deadlines.entries()].filter(([, x]) => x.at <= wall).sort((a, b) => a[1].at - b[1].at)
    for (const [id, x] of due) {
      if (id === 'day-change') continue
      this.deadlines.delete(id)
      try {
        x.fn(wall)
      } catch {
        /* a deadline's failure never stops the others (it logs itself) */
      }
    }
    this.d.onCheck(why, wall)
    this.arm()
  }

  /** The exact timer for the nearest deadline, never later than the next 15-second check. */
  private arm(): void {
    if (this.timer != null) this.d.clearTimer(this.timer)
    const wall = this.d.wall()
    let next = wall + CHECK_EVERY_MS
    let reason: CheckReason = 'tick'
    for (const x of this.deadlines.values()) {
      if (x.at < next) {
        next = Math.max(wall, x.at)
        reason = 'deadline'
      }
    }
    this.timer = this.d.setTimer(() => {
      this.timer = null
      this.check(reason)
    }, Math.max(0, next - wall))
  }
}
