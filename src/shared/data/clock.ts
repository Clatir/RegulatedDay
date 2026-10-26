/**
 * The two clocks of every event (spec „Każde zdarzenie ma dwa czasy”): the computer's clock corrected by the monotonic
 * clock while the app runs (used for lengths – a jump of the wall clock does not stretch a block), and the logical clock
 * – the larger of that and the last event seen plus 1 ms, restored at the start from the local journal – used only for
 * order. Events of another computer more than 24 h ahead of this computer's clock do not move the logical clock: the
 * clock warning is raised and automatic actions wait.
 */

export const AHEAD_LIMIT_MS = 24 * 60 * 60 * 1000

export interface ClockSources {
  /** The wall clock (Date.now). */
  wall: () => number
  /** A monotonic clock in ms (performance.now). */
  mono: () => number
}

export class EventClock {
  private wallBase: number
  private monoBase: number
  private lastL: number
  private nextN: number
  /** An event of another computer far ahead was seen (the bar shows the clock warning). */
  aheadSeen = false

  constructor(
    private readonly src: ClockSources,
    restored: { lastN: number; lastL: number } = { lastN: -1, lastL: 0 }
  ) {
    this.wallBase = src.wall()
    this.monoBase = src.mono()
    this.lastL = restored.lastL
    this.nextN = restored.lastN + 1
  }

  /** The computer's clock, corrected by the monotonic one. */
  now(): number {
    return this.wallBase + (this.src.mono() - this.monoBase)
  }

  /** After a sleep or a change of the wall clock (the scheduler tells): take the wall clock again. */
  rebase(): void {
    this.wallBase = this.src.wall()
    this.monoBase = this.src.mono()
  }

  /** The stamps of a new event of this computer. */
  stamp(): { t: number; l: number; n: number } {
    const t = this.now()
    this.lastL = Math.max(t, this.lastL + 1)
    return { t, l: this.lastL, n: this.nextN++ }
  }

  /** An event seen from another computer (or this one's own, read back) moves the logical clock – unless far ahead. */
  observe(l: number): boolean {
    if (l > this.now() + AHEAD_LIMIT_MS) {
      this.aheadSeen = true
      return false
    }
    if (l > this.lastL) this.lastL = l
    return true
  }

  get last(): { n: number; l: number } {
    return { n: this.nextN - 1, l: this.lastL }
  }
}
