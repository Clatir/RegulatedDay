// adapted from FI src/main/tray.ts @ de81f2b (applyLoginItem)
/**
 * „Uruchamiaj z Windows” (spec „Instalacja, aktualizacje i log”): the settings show the real state, also switched off in
 * Task Manager, and the app never switches it back on by itself. Changed against FI (which wrote the entry at every start
 * and so enabled it again): the entry is written only when the setting changes (on or off, as the switch says) or when
 * the program's path changed (with the current state of enabling); at the start it is only read. The entry has a fixed
 * name, the same in every version. The guard's entry is the guard's own (it writes it without StartupApproved).
 */
import { app } from 'electron'
import type { AutostartState } from '@shared/api'

export const AUTOSTART_NAME = 'Regulated Day'
export const HIDDEN_ARG = '--hidden'

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export interface AutostartDeps {
  supported: boolean
  switchedOn: () => boolean
  log: (level: 'info' | 'warn', msg: string, e?: unknown) => void
}

export class Autostart {
  constructor(private readonly d: AutostartDeps) {}

  private entry(): { path: string; enabled: boolean } | null {
    const items = app.getLoginItemSettings({ path: process.execPath, args: [HIDDEN_ARG] }).launchItems ?? []
    const item = items.find((i) => i.name === AUTOSTART_NAME)
    return item ? { path: item.path, enabled: item.enabled } : null
  }

  read(): AutostartState {
    if (!this.d.supported || process.platform !== 'win32') return { supported: false, switchedOn: false, willStart: false, disabledInTaskManager: false }
    try {
      const e = this.entry()
      return {
        supported: true,
        switchedOn: this.d.switchedOn(),
        willStart: !!e && e.enabled && samePath(e.path, process.execPath),
        disabledInTaskManager: !!e && !e.enabled
      }
    } catch (err) {
      this.d.log('warn', 'autostart – odczyt nie udał się', err)
      return { supported: true, switchedOn: this.d.switchedOn(), willStart: false, disabledInTaskManager: false }
    }
  }

  /** The switch changed: the entry written as on or off, as you set it. */
  set(on: boolean): void {
    if (!this.d.supported || process.platform !== 'win32') return
    app.setLoginItemSettings({ openAtLogin: on, enabled: on, name: AUTOSTART_NAME, path: process.execPath, args: [HIDDEN_ARG] })
    this.d.log('info', `autostart ${on ? 'włączony' : 'wyłączony'}`)
  }

  /** At the start: the entry of another path (the program moved) is written again with its current state; nothing else. */
  checkPath(): void {
    if (!this.d.supported || process.platform !== 'win32') return
    try {
      const e = this.entry()
      if (!e || samePath(e.path, process.execPath)) return
      app.setLoginItemSettings({ openAtLogin: true, enabled: e.enabled, name: AUTOSTART_NAME, path: process.execPath, args: [HIDDEN_ARG] })
      this.d.log('info', `autostart: nowa ścieżka programu (${e.enabled ? 'włączony' : 'wyłączony w Menedżerze zadań'})`)
    } catch (err) {
      this.d.log('warn', 'autostart – sprawdzenie ścieżki nie udało się', err)
    }
  }
}
