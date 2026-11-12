/**
 * Szybki zapis (OPS2, D385, D402): the window „Do skrzynki” exists hidden and never comes up by itself – not at the
 * start, not with the bar's refreshes; its field saves a task of your own into „Skrzynka” on Enter and hides, Esc hides
 * it without saving (shown here from the test, as the shortcut would). „+” of the main window's bar unfolds the same
 * field in the bar; „+” of the desktop bar (it takes no keys) opens the icon's panel with it (T756).
 * The shortcut itself – Ctrl+Alt+N pressed for real, the window over the others with the focus, not on top after – only
 * in CI on Windows (`quick-windows.spec.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, viewPage, withMainLog } from './app'

const QUICK_TITLE = 'Regulated Day – do skrzynki'

/** The window „Do skrzynki” as the main process has it. */
const quickWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)
    return w ? { visible: w.isVisible(), onTop: w.isAlwaysOnTop(), focusable: w.isFocusable() } : null
  }, QUICK_TITLE)

/** The tasks the data folder holds now (the files of requests/ with `kind: 'task'`). */
async function tasks(app: ElectronApplication): Promise<Array<Record<string, unknown>>> {
  const dir = await app.evaluate(() => process.env.RD_DATA_DIR ?? '')
  const files = (() => {
    try {
      return readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))
    } catch {
      return []
    }
  })()
  return files.map((n) => JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as Record<string, unknown>).filter((r) => r.kind === 'task')
}

async function quickPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const p of app.windows()) if ((await p.evaluate(() => document.documentElement.dataset.view).catch(() => null)) === 'quick') return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Okno „Do skrzynki” nie pojawiło się.')
}

/** As the shortcut shows it (the test cannot press a global shortcut on every system): shown, on top, with the focus. */
const showAsShortcut = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)!
    w.setAlwaysOnTop(true, 'floating')
    w.show()
    w.focus()
    w.webContents.send('rd:onQuickShown')
  }, QUICK_TITLE)

test('„Do skrzynki”: nie wychodzi sam; Enter zapisuje zadanie w Skrzynce i chowa okno, Esc chowa bez zapisu', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      // The day is counted and the bar refreshed a few times: the window is still hidden and not on top.
      await expect(page.getByTestId('bar-main')).toBeVisible({ timeout: 30_000 })
      await expect.poll(() => quickWindow(app)).toEqual({ visible: false, onTop: false, focusable: true })
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-quick')).toBeVisible()
      expect(await quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      // The shortcut's state for the settings: Ctrl+Alt+N (another program may hold it on a developer's computer).
      expect(await page.evaluate(() => window.rd.quickShortcut())).toMatchObject({ key: 'Ctrl+Alt+N', state: expect.stringMatching(/^(on|taken)$/) })

      await showAsShortcut(app)
      const q = await quickPage(app)
      await q.getByTestId('quick-title').fill('Zamówić karmę dla kota')
      await q.getByTestId('quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ kind: 'task', title: 'Zamówić karmę dla kota', list: 'inbox', estimateMin: 30, categoryId: 'inne' })])
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: false, onTop: false })

      // Esc: hidden, nothing saved.
      await showAsShortcut(app)
      await q.getByTestId('quick-title').fill('nie zapisuj')
      await q.getByTestId('quick-title').press('Escape')
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      expect((await tasks(app)).map((t) => t.title)).toEqual(['Zamówić karmę dla kota'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„+” w pasku okna głównego rozwija pole – Enter zapisuje do Skrzynki; „+” paska pulpitu otwiera panel z polem (T756)', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      const bar = page.getByTestId('bar-main')
      await expect(bar).toBeVisible({ timeout: 30_000 })
      await bar.getByTestId('bar-quick').click()
      await bar.getByTestId('bar-quick-title').fill('Sprawdzić błąd w kodzie')
      await bar.getByTestId('bar-quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ title: 'Sprawdzić błąd w kodzie', list: 'inbox' })])
      await expect(bar.getByTestId('bar-quick-field')).toHaveCount(0)

      const desktop = await viewPage(app, 'bar')
      await desktop.getByTestId('bar-quick').click()
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('bar-quick-title')).toBeFocused()
      await panel.getByTestId('bar-quick-title').fill('Zadzwonić do ubezpieczyciela')
      await panel.getByTestId('bar-quick-title').press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => t.title).sort()).toEqual(['Sprawdzić błąd w kodzie', 'Zadzwonić do ubezpieczyciela'])
      // The okienko „Do skrzynki” never came up for it.
      expect(await quickWindow(app)).toMatchObject({ visible: false, onTop: false })
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
