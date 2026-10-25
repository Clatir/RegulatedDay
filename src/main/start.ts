/**
 * The first module of the main process (T381, T384): the identity of this run – name, folder of app data,
 * AppUserModelId, toast activator – is fixed here, before anything reads a path or touches notifications (Electron
 * writes the activator's key and the Start menu shortcut at the first notification, and takes the id already in a
 * shortcut). Only then the rest of the app is loaded, synchronously. Imports nothing but electron and Node modules (and
 * the pure identityRules, bundled into this file); scripts/check-code.mjs checks the built file.
 */
import { app } from 'electron'
import { closeSync, existsSync, openSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { INSTALLED_MARKER, installationInProgress, resolveIdentity, IDENTITIES } from './identityRules'

// Node reads files on 4 threads by default; a file OneDrive keeps online-only blocks one until it arrives (FI 1.4.1). The
// pool is sized at its first use – before anything here touches a file asynchronously.
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '32'

const markerExists = app.isPackaged && existsSync(join(process.resourcesPath, INSTALLED_MARKER))

const identity = resolveIdentity({
  isPackaged: app.isPackaged,
  markerExists,
  userDataEnv: process.env.RD_USER_DATA,
  testSystemEnv: process.env.RD_TEST_SYSTEM
})

function heldOpen(path: string): boolean {
  try {
    const fd = openSync(path, 'r+')
    closeSync(fd)
    return false
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
  }
}

/**
 * A packaged run without the marker (win-unpacked – or the new exe while the installer is between the old version's
 * uninstall and customInstall): an installation of the production app in progress ends it at once, writing nothing.
 */
function installingProduction(): boolean {
  if (!app.isPackaged || markerExists || process.platform !== 'win32') return false
  const productionUpdates = join(app.getPath('appData'), IDENTITIES.production.name, 'update')
  return installationInProgress(productionUpdates, {
    list: (dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch {
        return null
      }
    },
    read: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    heldOpen: (path) => existsSync(path) && heldOpen(path),
    processAlive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'EPERM'
      }
    },
    now: () => Date.now()
  })
}

if (installingProduction()) {
  app.exit(0)
} else {
  app.setName(identity.name)
  app.setPath('userData', identity.userDataOverride ?? join(app.getPath('appData'), identity.name))
  app.setPath('sessionData', app.getPath('userData'))
  app.setPath('crashDumps', join(app.getPath('userData'), 'crashes'))
  if (process.platform === 'win32') {
    app.setAppUserModelId(identity.appUserModelId)
    app.setToastActivatorCLSID(identity.toastActivatorClsid)
  }
  ;(globalThis as { __rdIdentity?: unknown }).__rdIdentity = identity
  // The rest of the app, synchronously (a computed path: the bundler leaves it to Node instead of inlining it here).
  require(join(__dirname, 'index.js'))
}
