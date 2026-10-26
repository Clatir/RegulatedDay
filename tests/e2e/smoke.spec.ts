import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launch, viewPage, withMainLog } from './app'

const PAGES = ['today', 'calendar', 'requests', 'templates', 'routines', 'room', 'history', 'trial', 'settings']

async function noHorizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="main-window"], main, nav, header')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.dataset.testid ?? el.tagName)
  )
}

test('start: okno główne z menu bocznym, nazwą i paskiem; tożsamość testowa', async () => {
  const { app, page, userData, errors } = await launch()
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('app-name')).toHaveText('Regulated Day')
      await expect(page.getByTestId('bar-main')).toBeVisible()
      for (const p of PAGES) await expect(page.getByTestId(`nav-${p}`)).toBeVisible()
      await page.getByTestId('nav-settings').click()
      await expect(page.getByTestId('identity')).toHaveText('testowa (Regulated Day Test)')
      await expect(page.getByTestId('user-data')).toHaveText(userData)
      await expect(page.getByTestId('helper-state')).toHaveText('działa')
      // The test identity has no Run entry (only with RD_TEST_SYSTEM in CI).
      await expect(page.getByTestId('autostart')).toBeDisabled()
      const name = await app.evaluate(({ app }) => app.getName())
      expect(name).toBe('Regulated Day Test')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('zamknięcie: koniec pracy bez nieobsłużonych wyjątków, także gdy pomocnik kończy się po oknach', async () => {
  const { app, page, userData } = await launch()
  await expect(page.getByTestId('bar-main')).toBeVisible()
  await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('pomocnik działa')
  // app.close() returns when the process has ended: the log is complete. The helper's end and its last events (the
  // foreground, the bar) come after the windows are gone – none may reach a destroyed window.
  await app.close()
  const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8')
  expect(log).toContain('koniec pracy')
  expect(log.split('\n').filter((l) => /nieobsłużon/.test(l)), log).toEqual([])
})

test('pasek pulpitu: okno narzędziowe bez aktywacji, nigdy na wierzchu, pokazane po potwierdzeniu pomocnika', async () => {
  const { app, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-desktop')).toBeVisible()
      const props = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.getTitle() === 'Regulated Day – pasek')
          .map((w) => ({ visible: w.isVisible(), focusable: w.isFocusable(), onTop: w.isAlwaysOnTop(), resizable: w.isResizable(), maximizable: w.isMaximizable(), minimizable: w.isMinimizable() }))
      )
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – pasek' && w.isVisible()))).toBe(true)
      expect(props[0]).toMatchObject({ focusable: false, onTop: false, resizable: false })
      // Linux reports maximizable/minimizable always true; Windows keeps what the window was made with.
      if (process.platform === 'win32') expect(props[0]).toMatchObject({ maximizable: false, minimizable: false })
      // No tooltip anywhere in the bar (each would be a window on top).
      expect(await bar.locator('[title]').count()).toBe(0)
    })
  } finally {
    await app.close()
  }
})

test('pasek pulpitu bez potwierdzenia pomocnika zostaje ukryty z komunikatem', async () => {
  test.skip(process.env.RD_E2E_REAL_HELPER === '1', 'the stand-in of the helper refuses the bar; the real one confirms it')
  const { app, page, userData } = await launch({ env: { RD_FAKE_HELPER_BAR: 'fail' } })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('bar-note')).toContainText('Paska pulpitu nie udało się położyć pod oknami')
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – pasek' && w.isVisible()))).toBe(false)
    })
  } finally {
    await app.close()
  }
})

test('próba: kolor, kroki i kropka zmieniają pasek we wszystkich oknach; panel ikony otwiera się i zamyka Esc', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-trial').click()
      await page.getByTestId('trial-tone').getByRole('radio', { name: 'wolne' }).click()
      await page.getByTestId('trial-warn').getByRole('radio', { name: '5 min', exact: true }).click()
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-desktop')).toHaveAttribute('data-tone', 'wolne')
      await expect(bar.getByTestId('bar-desktop')).toHaveAttribute('data-warn', 'five')
      await expect(page.getByTestId('bar-main')).toHaveAttribute('data-tone', 'wolne')
      await page.getByTestId('trial-quiet').click()
      await expect(bar.getByTestId('bar-desktop')).toHaveAttribute('data-quiet', 'on')
      await page.evaluate(() => window.rd.trialAction('openPanel'))
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('panel')).toBeVisible()
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))).toBe(true)
      await panel.keyboard.press('Escape')
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))).toBe(false)
    })
  } finally {
    await app.close()
  }
})

test('konwencje: długość „1h30”, ułamek odrzucony z komunikatem, Esc cofa edycję, usunięcie z „Cofnij”', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-trial').click()
      const d = page.getByTestId('demo-duration')
      await d.fill('1h30')
      await d.press('Enter')
      await expect(d).toHaveValue('1 h 30 min')
      await d.fill('1,5')
      await d.press('Tab')
      await expect(d).toHaveValue('1 h 30 min')
      await expect(page.getByRole('status').filter({ hasText: 'pełnych minutach' })).toBeVisible()
      await d.fill('45')
      await d.press('Escape')
      await expect(d).toHaveValue('1 h 30 min')
      const i = page.getByTestId('demo-integer')
      await i.fill('2,5')
      await i.press('Enter')
      await expect(i).toHaveValue('3')
      await page.getByTestId('demo-delete-b').click()
      await expect(page.getByTestId('demo-list')).not.toContainText('Spacer')
      await page.getByTestId('toast-action').click()
      await expect(page.getByTestId('demo-list')).toContainText('Spacer')
      await page.getByTestId('filter-wolne').click()
      await expect(page.getByTestId('count-trial-demo')).toHaveText('1 z 3')
      await page.getByTestId('filters-clear').click()
      await expect(page.getByTestId('count-trial-demo')).toHaveText('3 z 3')
    })
  } finally {
    await app.close()
  }
})

for (const [label, area, zoom] of [
  ['najmniejsze okno 1024×700 przy skali 150 %', '1024x700', 1.5],
  ['obszar roboczy 1280×672 (laptop 14" przy 150 %)', '1280x672', 1]
] as const) {
  test(`układ: ${label} – bez przewijania w poziomie na żadnym ekranie`, async () => {
    const { app, page, userData } = await launch({ env: { RD_WORK_AREA: area } })
    try {
      await withMainLog(userData, async () => {
        if (zoom !== 1) await page.evaluate((z) => window.rd.setPrefs({ zoom: z }), zoom)
        const [w, h] = area.split('x').map(Number) as [number, number]
        const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Regulated Day Test')!.getBounds())
        expect(b.width).toBeLessThanOrEqual(w)
        expect(b.height).toBeLessThanOrEqual(h)
        for (const p of PAGES) {
          await page.getByTestId(`nav-${p}`).click()
          expect(await noHorizontalOverflow(page), p).toEqual([])
        }
      })
    } finally {
      await app.close()
    }
  })
}
