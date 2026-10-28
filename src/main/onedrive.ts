/**
 * OneDrive in this session (spec „Pomocnik”: the helper reads the OneDrive process of the current session; „Kilka
 * komputerów”: „Gdy komputer od 5 min nie widzi działającego procesu OneDrive (sprawdzane co 5 min, a w stanie
 * nieustalonym co 10 s), pokazuje «OneDrive nie działa na tym komputerze»” – and does not take others for asleep for lack
 * of changes). A data folder outside OneDrive counts as running. Until the helper answers – and while it does not run –
 * the last answer stands (at the start: running, as before E4a); a short restart of OneDrive (an update of its client)
 * changes nothing (A3-14): „not running” needs a second answer „not running” 5 min after the first.
 */
export const ONEDRIVE_EVERY_MS = 5 * 60_000
export const ONEDRIVE_UNSETTLED_MS = 10_000
/** Not running only when it has not run for this long (two answers this far apart). */
export const ONEDRIVE_DOWN_MS = 5 * 60_000

export interface OneDriveDeps {
  /** Ask the helper (rejects when it does not run). */
  ask: () => Promise<boolean>
  /** The data folder is inside one of this user's OneDrive folders. */
  inOneDrive: () => boolean
  log: (level: 'info' | 'warn', msg: string) => void
  /** The computer is unsettled (a start, a wake): asked every 10 s then. */
  unsettled?: () => boolean
  now?: () => number
}

export class OneDriveWatch {
  /** The first and the latest answer „not running” since it last said „running” (null: running). */
  private downSince: number | null = null
  private lastDown: number | null = null
  private lastAsk = Number.NEGATIVE_INFINITY
  private timer: ReturnType<typeof setInterval> | null = null
  private asking = false
  /** What the log last said (running at the start). */
  private reported = true

  constructor(private readonly d: OneDriveDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  /** OneDrive taken for not running: no process for 5 min (the rules of leading, the bar's line). */
  get running(): boolean {
    return !this.d.inOneDrive() || this.downSince == null || this.lastDown == null || this.lastDown - this.downSince < ONEDRIVE_DOWN_MS
  }

  /** The process runs by the last answer (the unsettled state counts from the moment it runs – spec „Kilka komputerów”). */
  get processRunning(): boolean {
    return !this.d.inOneDrive() || this.downSince == null
  }

  /** Every 10 s it looks whether an answer is due: every 10 s while unsettled (a wake, a folder just open), else 5 min. */
  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), ONEDRIVE_UNSETTLED_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.asking) return
    let unsettled = false
    try {
      unsettled = this.d.unsettled?.() ?? false
    } catch {
      /* no folder now: the usual pace */
    }
    if (!unsettled && this.now - this.lastAsk < ONEDRIVE_EVERY_MS) return
    this.asking = true
    try {
      await this.check()
    } catch {
      /* a log that cannot be written: the next tick asks again */
    } finally {
      this.asking = false
    }
  }

  async check(): Promise<void> {
    if (!this.d.inOneDrive()) return
    this.lastAsk = this.now
    try {
      const up = await this.d.ask()
      if (up) this.downSince = this.lastDown = null
      else {
        this.downSince ??= this.now
        this.lastDown = this.now
      }
    } catch {
      /* the helper does not run: the last answer stands */
    }
    const now = this.running
    if (now !== this.reported) this.d.log(now ? 'info' : 'warn', now ? 'OneDrive znów działa' : 'OneDrive nie działa w tej sesji od 5 min – inne komputery nie są uznawane za uśpione z braku zmian')
    this.reported = now
  }
}
