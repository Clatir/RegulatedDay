/**
 * Updates in the app (spec „Instalacja, aktualizacje i log”): the updater's checks and downloads, the staging of a
 * download for its installation, the moments it installs – the full exit, „Zainstaluj teraz”, the start of Windows (the
 * app started by the autostart hands the installation to the guard) – the banners after a failed or unfinished
 * installation, and what the settings say. At night (E4a) and in tests (RD_TEST_NIGHT_INSTALL_MS) the hidden path.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GITHUB_API, RELEASES_PAGE } from '@shared/update'
import { UPDATES_OFF, type UpdateView } from '@shared/updateView'
import type { UpdateAction } from '@shared/api'
import { readTask, type TaskStart, type TaskTrigger } from '@shared/task'
import { Updater } from './updater'
import { readSharedSync } from './files'
import { guardMode, stageInstall, startInstall } from './install'
import type { FetchLike } from './download'

export interface ControllerDeps {
  enabled: boolean
  version: string
  userData: string
  helperDir: string
  fetch: FetchLike
  helperRunning: () => boolean
  autostartOn: () => boolean
  nightInstall: () => boolean
  /** Before the installer or the install helper starts: the record of closing, the writes waited for. */
  beforeInstall: () => void
  quit: () => void
  openExternal: (url: string) => void
  broadcast: (view: UpdateView) => void
  log: (level: 'info' | 'warn' | 'error', msg: string, detail?: unknown) => void
}

export class UpdateController {
  readonly updater: Updater | null
  private guardDisabled = false
  private installing = false

  constructor(private readonly d: ControllerDeps) {
    const apiBase = process.env.RD_UPDATE_URL || GITHUB_API
    this.updater = d.enabled
      ? new Updater({
          currentVersion: d.version,
          updateDir: this.updateDir,
          fetch: d.fetch,
          apiBase,
          allowInsecure: !!process.env.RD_UPDATE_URL,
          log: d.log,
          onState: (v) => {
            if (v.phase === 'ready') this.stage()
            d.broadcast(this.decorate(v))
          },
          note: () => this.note(),
          nightInstall: d.nightInstall
        })
      : null
  }

  get updateDir(): string {
    return join(this.d.userData, 'update')
  }

  private note(): string | null {
    if (!this.d.helperRunning()) return 'Pomocnik nie działa: aktualizacja zainstaluje się przy wyjściu albo po „Zainstaluj teraz” ścieżką awaryjną, bez instalacji w nocy i przy starcie Windows.'
    if (this.guardDisabled) return 'Strażnik aktualizacji jest wyłączony w Menedżerze zadań: aktualizacje instalują się tylko przy wyjściu i w nocy.'
    return null
  }

  private decorate(v: UpdateView): UpdateView {
    return v
  }

  view(): UpdateView {
    if (!this.updater) return UPDATES_OFF(this.d.version, 'Ta wersja (deweloperska albo testowa) nie aktualizuje się sama.')
    return this.updater.view()
  }

  init(banner: UpdateView['banner'], whatsNew: UpdateView['whatsNew']): void {
    if (!this.updater) return
    this.updater.banner = banner
    this.updater.whatsNew = whatsNew
    this.updater.init()
    // The guard's entry switched off in Task Manager: no installation at the start of Windows.
    const guard = join(this.d.helperDir, 'rd-guard.exe')
    if (existsSync(guard)) {
      const r = guardMode(guard, ['--run-entry', 'query'])
      this.guardDisabled = r.ok === true && r.approved === false
    }
    const delay = Number(process.env.RD_UPDATE_CHECK_DELAY_MS) || 30_000
    this.updater.startAuto(delay)
    // The night of a test (E4a schedules the real one): installs as soon as a download is ready.
    const night = Number(process.env.RD_TEST_NIGHT_INSTALL_MS)
    if (night > 0) {
      const t = setInterval(() => {
        if (this.install('night', 'hidden')) clearInterval(t)
      }, night)
      t.unref?.()
    }
  }

  /** A download ready: copied with the programs into update\<X> now, so installing later only starts. */
  private stage(): void {
    const ready = this.updater?.readyRelease
    if (!ready) return
    try {
      stageInstall({ updateDir: this.updateDir, version: ready.version, downloadDir: ready.dir, helperDir: this.d.helperDir })
    } catch (e) {
      this.d.log('warn', 'przygotowanie instalacji nie udało się', e)
    }
  }

  /** Installs the ready download now (`trigger`), then quits; false = nothing to install. */
  install(trigger: TaskTrigger, start: TaskStart, url: string | null = null): boolean {
    const ready = this.updater?.readyRelease
    if (!ready || this.installing) return false
    const owner = this.d.helperRunning()
    // Without the helper only the exit and „Zainstaluj teraz” install (the FI path); never the night or the logon.
    if (!owner && (trigger === 'night' || trigger === 'logon')) return false
    if (trigger === 'logon' && this.guardDisabled) return false
    // „nieudane” for X holds its automatic installation on this computer; only a click („Zainstaluj teraz”, „Spróbuj
    // ponownie”) or a newer release resumes it.
    const t = readTask(readSharedSync(join(this.updateDir, ready.version, 'task.json')))
    if (trigger !== 'now' && t.kind === 'task' && t.task.state === 'failed') return false
    this.installing = true
    this.updater!.markInstalling()
    this.d.beforeInstall()
    const ok = startInstall({
      version: ready.version,
      downloadDir: ready.dir,
      updateDir: this.updateDir,
      helperDir: this.d.helperDir,
      trigger,
      start,
      url,
      autostart: this.d.autostartOn(),
      appPid: process.pid,
      owner,
      userDataDir: this.d.userData,
      log: (l, m) => this.d.log(l, m)
    })
    if (!ok) {
      this.installing = false
      this.d.log('error', `instalacja ${ready.version} nie wystartowała`)
      return false
    }
    if (trigger !== 'exit') this.d.quit()
    return true
  }

  /** The full exit: a ready download installs (the app is quitting anyway). */
  onQuit(sessionEnding: boolean): void {
    if (sessionEnding || this.installing) return
    this.install('exit', 'none')
  }

  /** The app started by the autostart: a ready download is installed by the guard at the start of Windows. */
  atAutostart(): boolean {
    const ready = this.updater?.readyRelease
    if (!ready) return false
    // Put off by the guard (a session or a class): it waits for the exit or the night, never a loop of starts.
    const t = readTask(readSharedSync(join(this.updateDir, ready.version, 'task.json')))
    if (t.kind === 'task' && t.task.state === 'postponed') return false
    return this.install('logon', 'hidden')
  }

  async action(a: UpdateAction): Promise<UpdateView> {
    if (!this.updater) return this.view()
    if (a === 'check') return this.updater.check(true)
    if (a === 'download') {
      this.d.openExternal(`${RELEASES_PAGE}/latest`)
      return this.view()
    }
    if (a === 'dismissNotes') {
      this.updater.whatsNew = null
      return this.view()
    }
    if (a === 'installNow' || a === 'retry') {
      this.updater.banner = null
      if (!this.install('now', 'visible')) {
        // Nothing downloaded yet (a retry after a failure): check, download, then install.
        await this.updater.check(true)
        await this.updater.download()
        this.install('now', 'visible')
      }
    }
    return this.view()
  }
}
