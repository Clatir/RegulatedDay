// adapted from FI tests/e2e/app.ts @ de81f2b
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { logicalDayOf } from '../../src/shared/time/day'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  /** Uncaught renderer errors and console.error messages. */
  errors: string[]
}

export const FAKE_HELPER = resolve('tests/fakes/fake-helper.mjs')

/**
 * The logical day now (04:00–04:00 Polish time) by the app's own rule. CI runs on any day: a test that needs a type of
 * day sets it for this date (T528) – a Saturday, Sunday or holiday would otherwise give the weekend's plan.
 */
export function logicalToday(): string {
  return logicalDayOf(Date.now())
}

/**
 * Launch the built app (out/) or a packaged executable (RD_E2E_EXECUTABLE, Windows CI) with an isolated folder of app
 * data – RD_USER_DATA makes a run without the installation marker the test identity („Regulated Day Test”). The helper
 * is the stand-in unless RD_E2E_REAL_HELPER=1 (Windows CI with the real one).
 */
export async function launch(opts: { userData?: string; env?: Record<string, string>; args?: string[]; hidden?: boolean; data?: boolean } = {}): Promise<Launched> {
  const base = mkdtempSync(join(tmpdir(), 'rd-e2e-'))
  const userData = opts.userData ?? join(base, 'userData')
  // `data`: an (empty) data folder from RD_DATA_DIR – the screens instead of the wizard of a computer without one.
  const dataDir = opts.data ? mkdtempSync(join(tmpdir(), 'rd-e2e-data-')) : null
  const app = await startElectron(appEnv(userData, dataDir, opts.env ?? {}), opts.args ?? [])
  const page = await mainPage(app)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  await page.waitForLoadState('domcontentloaded')
  if (!opts.hidden)
    await withMainLog(userData, () =>
      expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible() && w.getTitle() === 'Regulated Day Test')), { timeout: 30_000 }).toBe(true)
    )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return { app, page, userData, errors }
}

/** The environment of a run: the folder of app data, the stand-in helper, an optional data folder (RD_DATA_DIR). */
function appEnv(userData: string, dataDir: string | null, extra: Record<string, string>): Record<string, string> {
  const env = {
    ...process.env,
    RD_USER_DATA: userData,
    ...(process.env.RD_E2E_REAL_HELPER === '1' ? {} : { RD_HELPER_PATH: FAKE_HELPER }),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ...(dataDir ? { RD_DATA_DIR: dataDir } : {}),
    ...extra
  } as Record<string, string>
  delete env.ELECTRON_RENDERER_URL
  return env
}

const noSandbox = (): string[] => (process.platform === 'win32' ? [] : ['--no-sandbox'])

/** The program of a run and its arguments: the packed app (RD_E2E_EXECUTABLE) or Electron with this folder (`out/`). */
function appCommand(args: string[]): { executable: string | null; args: string[] } {
  const executable = process.env.RD_E2E_EXECUTABLE || null
  return { executable, args: [...(executable ? [] : [resolve('.')]), ...noSandbox(), ...args] }
}

function startElectron(env: Record<string, string>, args: string[]): Promise<ElectronApplication> {
  const c = appCommand(args)
  return electron.launch({ ...(c.executable ? { executablePath: c.executable } : {}), args: c.args, env })
}

/**
 * A second copy of the app on the same folder of app data (the same identity), started as a plain process: it hands its
 * start to the running copy and ends – it has no window of its own. Resolves with its exit code. (Playwright's launch
 * would wait for a first window, which this copy never shows.) Its limit stays well inside the test's: a copy that
 * hangs is killed here, never left running.
 */
export async function launchSecondCopy(userData: string): Promise<number | null> {
  const c = appCommand([])
  const program = c.executable ?? (createRequire(resolve('package.json'))('electron') as string)
  const child = spawn(program, c.args, { env: appEnv(userData, null, {}), stdio: 'ignore' })
  return new Promise<number | null>((done, fail) => {
    const timer = setTimeout(() => {
      child.kill()
      fail(new Error('Druga kopia nie zakończyła się.'))
    }, 30_000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      done(code)
    })
    child.once('error', (e) => {
      clearTimeout(timer)
      fail(e)
    })
  })
}

/**
 * The desktop bar's bounds once they hold still: its window takes the height of its content after the view is drawn
 * (without a data folder one line – D327), so bounds read right after it shows may still change.
 */
export async function settledBarBounds(app: ElectronApplication): Promise<{ x: number; y: number; width: number; height: number }> {
  const read = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Regulated Day – pasek')!.getBounds())
  let last = await read()
  await expect
    .poll(
      async () => {
        const b = await read()
        const same = JSON.stringify(b) === JSON.stringify(last)
        last = b
        return same
      },
      { intervals: [700], timeout: 15_000 }
    )
    .toBe(true)
  return last
}

/** The main window's page (the bar and the panel have pages of their own). */
export async function mainPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const p of app.windows()) {
      const view = await p.evaluate(() => document.documentElement.dataset.view ?? (window as unknown as { rd?: { view: string } }).rd?.view).catch(() => null)
      if (view === 'main') return p
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Okno główne nie pojawiło się.')
}

/** The page of the desktop bar or the panel. */
export async function viewPage(app: ElectronApplication, view: 'bar' | 'panel'): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const p of app.windows()) {
      const v = await p.evaluate(() => document.documentElement.dataset.view).catch(() => null)
      if (v === view) return p
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Okno ${view} nie pojawiło się.`)
}

/** On failure the end of the app's main.log is added to the error. */
export async function withMainLog<T>(userData: string, run: () => Promise<T>, lines = 40): Promise<T> {
  try {
    return await run()
  } catch (e) {
    const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => '(brak main.log)')
    if (e instanceof Error) e.message += `\n--- main.log (koniec) ---\n${log.split(/\r?\n/).slice(-lines).join('\n')}`
    throw e
  }
}
