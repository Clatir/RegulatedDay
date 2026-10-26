// adapted from FI tests/e2e/app.ts @ de81f2b
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  /** Uncaught renderer errors and console.error messages. */
  errors: string[]
}

export const FAKE_HELPER = resolve('tests/fakes/fake-helper.mjs')

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
  const env = {
    ...process.env,
    RD_USER_DATA: userData,
    ...(process.env.RD_E2E_REAL_HELPER === '1' ? {} : { RD_HELPER_PATH: FAKE_HELPER }),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ...(dataDir ? { RD_DATA_DIR: dataDir } : {}),
    ...opts.env
  } as Record<string, string>
  delete env.ELECTRON_RENDERER_URL
  const executable = process.env.RD_E2E_EXECUTABLE
  const app = executable
    ? await electron.launch({ executablePath: executable, env, args: [...(process.platform === 'win32' ? [] : ['--no-sandbox']), ...(opts.args ?? [])] })
    : await electron.launch({ args: [resolve('.'), ...(process.platform === 'win32' ? [] : ['--no-sandbox']), ...(opts.args ?? [])], env })
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
