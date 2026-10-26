/**
 * The night installation in the app (spec „Instalacja, aktualizacje i log”, D162): at every check of the data folder
 * and at the lock of the screen (a laptop with modern standby sleeps right after it) the rule of `nightDecision` is
 * judged with the presences of the other computers; the first computer writes „instaluję wersję X” and waits its random
 * 0–30 min, then installs; the next ones wait for 24 h of X on another computer. The hidden path installs (the app quits,
 * the install helper takes over).
 */
import { nightDecision, MAX_WAIT_MS, WAITING, type NightState, type PeerVersions } from '@shared/nightInstall'

export interface NightDeps {
  now: () => number
  me: () => string
  /** The version downloaded and ready (null: none). */
  ready: () => string | null
  peers: () => PeerVersions[]
  unknownTimerEvents: () => Promise<boolean>
  state: () => Promise<NightState>
  claim: (version: string | null) => void
  /** Installs the ready download now on the hidden path; false: it did not start. */
  install: () => boolean
  random?: () => number
  log: (level: 'info' | 'warn', msg: string) => void
}

export class NightInstaller {
  private waitFrom: number | null = null
  private waitFor: string | null = null
  private waitMs = 0
  private lastWhy = ''
  private busy = false

  constructor(private readonly d: NightDeps) {}

  async check(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const ready = this.d.ready()
      // A newer download than the one waited for: the wait starts again.
      if (this.waitFor && this.waitFor !== ready) this.reset()
      const decision = nightDecision({
        me: this.d.me(),
        ready,
        peers: this.d.peers(),
        unknownTimerEvents: await this.d.unknownTimerEvents(),
        waitFrom: this.waitFrom,
        waitMs: this.waitMs,
        state: await this.d.state()
      })
      if (decision.why !== this.lastWhy) {
        this.d.log('info', `instalacja w nocy: ${decision.why}`)
        this.lastWhy = decision.why
      }
      if (decision.act === 'claim') {
        this.waitFrom = this.d.now()
        this.waitFor = decision.version
        this.waitMs = Math.floor((this.d.random ?? Math.random)() * MAX_WAIT_MS)
        this.d.claim(decision.version)
      } else if (decision.act === 'yield') this.reset()
      else if (decision.act === 'none' && this.waitFor && decision.why !== WAITING) {
        // The night ended, the battery, a block, the setting off…: „instaluję” is taken back – it never holds the others.
        this.reset()
      } else if (decision.act === 'install') {
        this.d.claim(decision.version)
        if (!this.d.install()) {
          this.d.log('warn', `instalacja w nocy ${decision.version} nie wystartowała`)
          this.reset()
        }
      }
    } catch (e) {
      this.d.log('warn', `instalacja w nocy: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.busy = false
    }
  }

  private reset(): void {
    if (this.waitFor) this.d.claim(null)
    this.waitFrom = null
    this.waitFor = null
    this.waitMs = 0
  }
}
