/**
 * Windows with the real helper (D385, D402, D229): the window „Do skrzynki” is hidden and not „topmost” while the app
 * starts and the bar settles; Ctrl+Alt+N pressed for real (keybd_event) brings it over the other windows with the
 * focus; Enter saves a task into „Skrzynka” and it goes – no longer „topmost”; Esc the same without saving. The desktop
 * bar stays under the windows the whole time. Only in CI on Windows (the local tools work outside the desktop).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, withMainLog } from './app'
import { foreground, keys, topMost, topWindows } from './win32'

test.skip(process.platform !== 'win32' || process.env.RD_E2E_REAL_HELPER !== '1', 'Windows with the real helper only')

const QUICK_TITLE = 'Regulated Day – do skrzynki'
const CTRL_ALT_N = ['11', '12', '4E']

async function quick(app: ElectronApplication): Promise<{ hwnd: string; visible: boolean; pid: number }> {
  return app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)!
    return { hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString(), visible: w.isVisible(), pid: process.pid }
  }, QUICK_TITLE)
}

async function quickPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const p of app.windows()) if ((await p.evaluate(() => document.documentElement.dataset.view).catch(() => null)) === 'quick') return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Okno „Do skrzynki” nie pojawiło się.')
}

async function titles(app: ElectronApplication): Promise<string[]> {
  const dir = await app.evaluate(() => process.env.RD_DATA_DIR ?? '')
  try {
    return readdirSync(join(dir, 'requests'))
      .map((n) => JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as Record<string, unknown>)
      .filter((r) => r.kind === 'task')
      .map((r) => String(r.title))
  } catch {
    return []
  }
}

test('Ctrl+Alt+N: „Do skrzynki” na wierzchu z fokusem tylko na skrót; Enter zapisuje do Skrzynki, Esc chowa – potem nie na wierzchu', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('bar-main')).toBeVisible({ timeout: 30_000 })
      expect(await page.evaluate(() => window.rd.quickShortcut())).toEqual({ key: 'Ctrl+Alt+N', state: 'on' })
      const w = await quick(app)
      // While the app starts and the bar is laid: never shown, never „topmost” – looked at several times.
      for (let i = 0; i < 5; i++) {
        expect((await quick(app)).visible).toBe(false)
        expect(topMost(w.hwnd)).toBe(false)
        expect(topWindows().some((x) => x.hwnd === w.hwnd && x.visible)).toBe(false)
        await page.waitForTimeout(400)
      }

      keys(CTRL_ALT_N)
      await expect.poll(async () => (await quick(app)).visible, { timeout: 10_000 }).toBe(true)
      expect(topMost(w.hwnd)).toBe(true)
      await expect.poll(() => foreground()).toBe(w.hwnd)
      const q = await quickPage(app)
      await expect(q.getByTestId('quick-title')).toBeFocused()
      await q.keyboard.type('Wymienić filtr w ekspresie')
      await q.keyboard.press('Enter')
      await expect.poll(() => titles(app)).toEqual(['Wymienić filtr w ekspresie'])
      await expect.poll(async () => (await quick(app)).visible).toBe(false)
      expect(topMost(w.hwnd)).toBe(false)

      keys(CTRL_ALT_N)
      await expect.poll(async () => (await quick(app)).visible, { timeout: 10_000 }).toBe(true)
      await q.keyboard.type('nie zapisuj')
      await q.keyboard.press('Escape')
      await expect.poll(async () => (await quick(app)).visible).toBe(false)
      expect(topMost(w.hwnd)).toBe(false)
      expect(await titles(app)).toEqual(['Wymienić filtr w ekspresie'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
