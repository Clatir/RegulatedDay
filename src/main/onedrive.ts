/**
 * OneDrive in this session (spec „Pomocnik”: the helper reads the OneDrive process of the current session; „Kilka
 * komputerów”: without a running OneDrive a computer does not take others for asleep for lack of changes). A data folder
 * outside OneDrive counts as running. The helper is asked every minute; until it answers – and while it does not run –
 * the last answer stands (at the start: running, as before E4a).
 */
export const ONEDRIVE_EVERY_MS = 60_000

export interface OneDriveDeps {
  /** Ask the helper (rejects when it does not run). */
  ask: () => Promise<boolean>
  /** The data folder is inside one of this user's OneDrive folders. */
  inOneDrive: () => boolean
  log: (level: 'info' | 'warn', msg: string) => void
}

export class OneDriveWatch {
  private last = true
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly d: OneDriveDeps) {}

  get running(): boolean {
    return !this.d.inOneDrive() || this.last
  }

  start(): void {
    if (this.timer) return
    void this.check()
    this.timer = setInterval(() => void this.check(), ONEDRIVE_EVERY_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async check(): Promise<void> {
    if (!this.d.inOneDrive()) return
    try {
      const now = await this.d.ask()
      if (now !== this.last) this.d.log(now ? 'info' : 'warn', now ? 'OneDrive znów działa' : 'OneDrive nie działa w tej sesji – inne komputery nie są uznawane za uśpione z braku zmian')
      this.last = now
    } catch {
      /* the helper does not run: the last answer stands */
    }
  }
}
