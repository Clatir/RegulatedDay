/**
 * The identity of this run (T381, T384, D283), pure: decided in `start.ts` before anything reads a path or touches
 * notifications. Imported by `start.ts` and the tests only – never by `index.ts`, so the bundle of `start` stays one file
 * that requires nothing but electron and Node (scripts/check-code.mjs checks it).
 */
import type { Identity, IdentityKind } from '../shared/identity'

/** The names and ids of the three identities; none of them ever changes (spec „Instalacja, aktualizacje i log”). */
export const IDENTITIES: Record<IdentityKind, Pick<Identity, 'name' | 'appUserModelId' | 'toastActivatorClsid'> & { protocol: string }> = {
  production: {
    name: 'Regulated Day',
    appUserModelId: 'app.regulatedday.desktop',
    toastActivatorClsid: '{4B8CA2B5-A105-4984-9D23-EB55FA837527}',
    protocol: 'regulatedday'
  },
  development: {
    name: 'Regulated Day Dev',
    appUserModelId: 'app.regulatedday.dev',
    toastActivatorClsid: '{26AD32DD-6F71-4BB6-82B4-07F0B5BC96A3}',
    protocol: 'regulatedday-dev'
  },
  test: {
    name: 'Regulated Day Test',
    appUserModelId: 'app.regulatedday.test',
    toastActivatorClsid: '{485F4570-C3B5-48A3-9534-D7D662F9DE49}',
    protocol: 'regulatedday-test'
  }
}

/** The installer's marker in the installation (customInstall writes it, the uninstaller removes it). */
export const INSTALLED_MARKER = 'rd-installed'

export interface IdentityInput {
  isPackaged: boolean
  /** The installer's marker exists next to the app (resources/rd-installed). */
  markerExists: boolean
  /** RD_USER_DATA: a folder of app data given by a test. */
  userDataEnv: string | undefined
  /** RD_TEST_SYSTEM=1 (CI only): the test identity gets the Run entry, its address and notifications. */
  testSystemEnv: string | undefined
}

export function resolveIdentity(i: IdentityInput): Identity {
  const installed = i.isPackaged && i.markerExists
  const override = i.userDataEnv && i.userDataEnv.trim() ? i.userDataEnv : null
  const kind: IdentityKind = installed ? 'production' : override ? 'test' : 'development'
  const ids = IDENTITIES[kind]
  const system = kind === 'production' || (kind === 'test' && i.testSystemEnv === '1')
  return {
    kind,
    name: ids.name,
    appUserModelId: ids.appUserModelId,
    toastActivatorClsid: ids.toastActivatorClsid,
    protocol: system ? ids.protocol : null,
    systemIntegration: system,
    updates: kind === 'production',
    installed,
    userDataOverride: override
  }
}

/** What the gate needs from the file system (injected – the tests give a fake one). */
export interface GateFs {
  /** Names of the folders in `dir`; null = none or unreadable. */
  list(dir: string): string[] | null
  /** The text of a file; null = none or unreadable. */
  read(path: string): string | null
  /** The file is held open by another process so that it cannot be opened for writing (EBUSY / EPERM). */
  heldOpen(path: string): boolean
  /** A process with this id exists. */
  processAlive(pid: number): boolean
  now(): number
}

/** A task in state „FI” without the installer's process id yet counts as a live installer this long (spec, Timer). */
export const FI_FRESH_MS = 60_000

/**
 * A run of the packaged app without the marker, before it takes the development identity (T384): an installation of the
 * production app in progress – between the uninstall of the old version and customInstall there is no marker – ends it
 * at once, writing nothing. In progress = some task in the production update folder has a live installer (state „FI”
 * with the installer's process alive and its file held, or fresh without a process id yet) or a guard holding its
 * guard.lock.
 */
export function installationInProgress(updateDir: string, fs: GateFs): boolean {
  const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, '')}\\${b}`
  for (const name of fs.list(updateDir) ?? []) {
    const dir = join(updateDir, name)
    if (fs.heldOpen(join(dir, 'guard.lock'))) return true
    const text = fs.read(join(dir, 'task.json'))
    if (!text) continue
    let task: { state?: unknown; installerPid?: unknown; updatedAt?: unknown; installer?: unknown }
    try {
      task = JSON.parse(text) as typeof task
    } catch {
      continue
    }
    if (task.state !== 'fi') continue
    const pid = typeof task.installerPid === 'number' ? task.installerPid : null
    if (pid == null) {
      if (typeof task.updatedAt === 'number' && fs.now() - task.updatedAt < FI_FRESH_MS) return true
      continue
    }
    const installer = typeof task.installer === 'string' ? task.installer : 'Regulated-Day-Setup.exe'
    if (fs.processAlive(pid) && fs.heldOpen(join(dir, installer))) return true
  }
  return false
}
