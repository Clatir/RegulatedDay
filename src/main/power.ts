/**
 * The block of sleep in the main process (T290, T301): the helper holds the system and execution requests, the app only
 * the screen (powerSaveBlocker „prevent-display-sleep”); the state goes to the helper at every check (every 15 s, and at
 * its start) with a confirmation – without one within 2 s the app holds the system itself („prevent-app-suspension”), and
 * the helper releases everything after 30 s without a state (a hung app never keeps the computer awake). Without the
 * helper the app holds it all.
 */
import type { PowerNeed } from '@shared/engine/power'

/** The helper's confirmation is waited for this long (T301). */
export const CONFIRM_MS = 2_000

export interface Blocker {
  start(type: 'prevent-display-sleep' | 'prevent-app-suspension'): number
  stop(id: number): void
}

export interface PowerDeps {
  /** A request to the helper and its answer (rejects when it does not run or answer in time). */
  request: ((cmd: string, args: Record<string, unknown>, timeoutMs: number) => Promise<Record<string, unknown>>) | null
  blocker: Blocker
  log: (level: 'info' | 'warn', msg: string) => void
}

export class PowerKeeper {
  private need: PowerNeed = { system: false, display: false, reason: null }
  private display: number | null = null
  private system: number | null = null
  private lastText = ''

  constructor(private readonly d: PowerDeps) {}

  /** What this computer must hold now (after every check and at the helper's start). */
  want(need: PowerNeed): void {
    this.need = need
    this.hold('display', need.display)
    const text = `${need.system ? 'system' : ''}${need.display ? '+ekran' : ''}`
    if (text !== this.lastText) {
      this.d.log('info', text ? `blokada usypiania: ${text} (${need.reason ?? ''})` : 'blokada usypiania zwolniona')
      this.lastText = text
    }
    const req = this.d.request
    if (!req) {
      this.hold('system', need.system)
      return
    }
    req('power', { display: false, system: need.system, execution: need.system, reason: need.reason ?? 'Regulated Day' }, CONFIRM_MS).then(
      (r) => {
        // Confirmed by the helper: the app's own hold of the system goes (the screen stays the app's).
        const held = r.system === true && r.execution === true
        this.hold('system', this.need.system && !held)
      },
      () => this.hold('system', this.need.system)
    )
  }

  /** The app's own blocker of a kind on or off. */
  private hold(kind: 'display' | 'system', on: boolean): void {
    const id = kind === 'display' ? this.display : this.system
    if (on && id == null) {
      const started = this.d.blocker.start(kind === 'display' ? 'prevent-display-sleep' : 'prevent-app-suspension')
      if (kind === 'display') this.display = started
      else this.system = started
    } else if (!on && id != null) {
      this.d.blocker.stop(id)
      if (kind === 'display') this.display = null
      else this.system = null
    }
  }

  /** The quit: everything released. */
  stop(): void {
    this.hold('display', false)
    this.hold('system', false)
  }

  /** What the app holds itself now (tests). */
  get held(): { display: boolean; system: boolean } {
    return { display: this.display != null, system: this.system != null }
  }
}
