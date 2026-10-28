/**
 * Updates in the app (spec „Instalacja, aktualizacje i log”): the updater's checks and downloads, the staging of a
 * download for its installation, the moments it installs – the full exit, „Zainstaluj teraz”, the start of Windows (the
 * app started by the autostart hands the installation to the guard) – the banners after a failed or unfinished
 * installation, and what the settings say. At night (E4a) and in tests (RD_TEST_NIGHT_INSTALL_MS) the hidden path.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GITHUB_API, MANIFEST_ASSET, RELEASES_PAGE, SETUP_ASSET } from '@shared/update'
import { UPDATES_OFF, type UpdateView } from '@shared/updateView'
import type { UpdateAction } from '@shared/api'
import { readTask, type TaskStart, type TaskTrigger } from '@shared/task'
import { Updater } from './updater'
import { heldOpen, readSharedSync } from './files'
import { guardModeAsync, stageInstallAsync, startInstall } from './install'
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
  /** The installation did not start after beforeInstall: the app goes on (its life marker beats again). */
  installFailed: () => void
  /** guard.lock held open by an owner (tests stand in for it). */
  lockHeld?: (path: string) => boolean
  /** A session or a class runs now or starts within 30 min (no installation at the exit or the logon, A5-03). */
  sessionOrClass?: () => boolean
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
    // The guard's entry switched off in Task Manager: no installation at the start of Windows (read in the background).
    const guard = join(this.d.helperDir, 'rd-guard.exe')
    if (existsSync(guard))
      void guardModeAsync(guard, ['--run-entry', 'query']).then((r) => {
        this.guardDisabled = r.ok === true && r.approved === false
      })
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

  /** A download ready: copied with the programs into update\<X> now (in the background), so installing later only starts. */
  private stage(): void {
    const ready = this.updater?.readyRelease
    if (!ready) return
    stageInstallAsync({ updateDir: this.updateDir, version: ready.version, downloadDir: ready.dir, helperDir: this.d.helperDir }).catch((e: unknown) =>
      this.d.log('warn', 'przygotowanie instalacji nie udało się', e)
    )
  }

  /** Installs the ready download now (`trigger`), then quits; false = nothing to install. */
  install(trigger: TaskTrigger, start: TaskStart, url: string | null = null, ready = this.updater?.readyRelease): boolean {
    if (!ready || this.installing) return false
    const owner = this.d.helperRunning()
    // Without the helper only the exit and „Zainstaluj teraz” install (the FI path); never the night or the logon.
    if (!owner && (trigger === 'night' || trigger === 'logon')) return false
    if (trigger === 'logon' && this.guardDisabled) return false
    // „nieudane” for X holds its automatic installation on this computer; only a click („Zainstaluj teraz”, „Spróbuj
    // ponownie”) or a newer release resumes it.
    const t = readTask(readSharedSync(join(this.updateDir, ready.version, 'task.json')))
    if (trigger !== 'now' && t.kind === 'task' && t.task.state === 'failed') return false
    // An owner works on X right now (a guard of the logon that took the task after this app read it): its task is never
    // written over – it installs and starts the app itself.
    if ((this.d.lockHeld ?? heldOpen)(join(this.updateDir, ready.version, 'guard.lock'))) {
      this.d.log('info', `instalacja ${ready.version}: właściciel już działa – nie zaczynam drugiej`)
      return false
    }
    this.installing = true
    this.updater!.markInstalling()
    this.d.beforeInstall()
    let ok = false
    try {
      ok = startInstall({
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
    } catch (e) {
      this.d.log('error', `przygotowanie instalacji ${ready.version} nie udało się`, e)
    }
    if (!ok) {
      // The app lives on as before: the download ready, the checks back, the life marker beating again.
      this.installing = false
      this.updater!.cancelInstalling()
      this.d.installFailed()
      this.d.log('error', `instalacja ${ready.version} nie wystartowała`)
      return false
    }
    if (trigger !== 'exit') this.d.quit()
    return true
  }

  /**
   * „Spróbuj ponownie” after an installation of the running version left its files unfinished (the FI path): no newer
   * release is there to download – its own download, still in update\<X>, is installed once more.
   */
  private repairRunning(): boolean {
    const version = this.d.version
    const t = readTask(readSharedSync(join(this.updateDir, version, 'task.json')))
    if (t.kind !== 'task' || t.task.state !== 'failed') return false
    const dir = join(this.updateDir, version, 'download')
    if (!existsSync(join(dir, SETUP_ASSET)) || !existsSync(join(dir, MANIFEST_ASSET))) return false
    this.d.log('info', `naprawa instalacji ${version}: jej instalator jeszcze raz`)
    return this.install('now', 'visible', null, { version, notes: '', dir })
  }

  /** The full exit: a ready download installs (the app is quitting anyway) – never in a session or a class (spec, A5-03). */
  onQuit(sessionEnding: boolean): void {
    if (sessionEnding || this.installing) return
    if (this.d.sessionOrClass?.()) {
      this.d.log('info', 'wyjście w czasie sesji albo zajęć (albo 30 min przed nimi) – instalacja przy kolejnym wyjściu albo w nocy')
      return
    }
    this.install('exit', 'none')
  }

  /** The app started by the autostart: a ready download is installed by the guard at the start of Windows. */
  atAutostart(): boolean {
    const ready = this.updater?.readyRelease
    if (!ready) return false
    // Put off by the guard (a session or a class): it waits for the exit or the night, never a loop of starts.
    const t = readTask(readSharedSync(join(this.updateDir, ready.version, 'task.json')))
    if (t.kind === 'task' && t.task.state === 'postponed') return false
    // A session or a class now or soon by the plan as it stands: nothing is handed over (A5-02).
    if (this.d.sessionOrClass?.()) return false
    return this.install('logon', 'hidden')
  }

  /**
   * The ready version an automatic installation could install now (the night's): none without the helper or while
   * „nieudane” holds it on this computer – never a claim „instaluję X” all night that it cannot keep (A5-05).
   */
  automaticReady(): string | null {
    const ready = this.updater?.readyRelease
    if (!ready || this.installing || !this.d.helperRunning()) return null
    const t = readTask(readSharedSync(join(this.updateDir, ready.version, 'task.json')))
    return t.kind === 'task' && t.task.state === 'failed' ? null : ready.version
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
      if (!this.install('now', 'visible') && !(a === 'retry' && this.repairRunning())) {
        // Nothing downloaded yet (a retry after a failure): check, download, then install.
        await this.updater.check(true)
        await this.updater.download()
        this.install('now', 'visible')
      }
    }
    return this.view()
  }
}
