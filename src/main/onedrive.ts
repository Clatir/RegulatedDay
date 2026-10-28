/**
 * OneDrive in this session (spec „Pomocnik”: the helper reads the OneDrive process of the current session; „Kilka
 * komputerów”: „Gdy komputer od 5 min nie widzi działającego procesu OneDrive (sprawdzane co 5 min, a w stanie
 * nieustalonym co 10 s), pokazuje «OneDrive nie działa na tym komputerze»” – and does not take others for asleep for lack
 * of changes). A data folder outside OneDrive counts as running. Until the helper answers – and while it does not run –
 * the last answer stands (at the start: running, as before E4a); a short restart of OneDrive (an update of its client)
 * changes nothing (A3-14).
 */
export const ONEDRIVE_EVERY_MS = 5 * 60_000
export const ONEDRIVE_UNSETTLED_MS = 10_000
/** Not running only after this long without its process. */
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
  /** When the helper first said „not running” since it last said „running” (null: running). */
  private downSince: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false
  /** What the log last said (running at the start). */
  private reported = true

  constructor(private readonly d: OneDriveDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  get running(): boolean {
    return !this.d.inOneDrive() || this.downSince == null || this.now - this.downSince < ONEDRIVE_DOWN_MS
  }

  start(): void {
    if (this.started) return
    this.started = true
    void this.loop()
  }

  stop(): void {
    this.started = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async loop(): Promise<void> {
    await this.check()
    if (!this.started) return
    this.timer = setTimeout(() => void this.loop(), this.d.unsettled?.() ? ONEDRIVE_UNSETTLED_MS : ONEDRIVE_EVERY_MS)
    this.timer.unref?.()
  }

  async check(): Promise<void> {
    if (!this.d.inOneDrive()) return
    try {
      const up = await this.d.ask()
      if (up) this.downSince = null
      else this.downSince ??= this.now
    } catch {
      /* the helper does not run: the last answer stands */
    }
    // The state changes with time too (5 min after the first „not running”): the log says what changed since it last spoke.
    const now = this.running
    if (now !== this.reported) this.d.log(now ? 'info' : 'warn', now ? 'OneDrive znów działa' : 'OneDrive nie działa w tej sesji od 5 min – inne komputery nie są uznawane za uśpione z braku zmian')
    this.reported = now
  }
}
