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
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('app-name')).toHaveText('Regulated Day')
      // The bar at the top of the window: the engine's view once the folder is open (E4b).
      await expect(page.getByTestId('bar-main')).toBeVisible()
      // „Bez bloku”, or the hour in the night's quiet (the test runs at any hour).
      await expect(page.getByTestId('bar-block')).toHaveText(/Bez bloku|^\d{2}:\d{2}$/)
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

test('koniec sesji Windows odwołany: zapis zamknięcia, potem znacznik życia znowu bije, okno chowa się do zasobnika', async () => {
  const { app, userData } = await launch({ env: { RD_TEST_SESSION_RESUME_MS: '1500' } })
  try {
    await withMainLog(userData, async () => {
      await expect.poll(() => readFile(join(userData, 'life.json'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('lastAt')
      // Only asked (WM_QUERYENDSESSION); another app cancels the logoff, so no „session-end” follows.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Regulated Day Test')!.emit('query-session-end', { preventDefault: () => undefined, reasons: [] }))
      const closing = JSON.parse(await readFile(join(userData, 'closing.json'), 'utf8')) as { at: number; why: string }
      expect(closing.why).toBe('system')
      await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8'), { timeout: 15_000 }).toContain('koniec sesji Windows odwołany')
      // The record is stale: a crash from here on is told as one.
      const life = JSON.parse(await readFile(join(userData, 'life.json'), 'utf8')) as { lastAt: number }
      expect(life.lastAt).toBeGreaterThan(closing.at)
      // The app is not quitting: its window's close hides it to the tray, as always.
      const shown = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Regulated Day Test')!
        w.close()
        return new Promise<{ destroyed: boolean; visible: boolean }>((r) => setTimeout(() => r({ destroyed: w.isDestroyed(), visible: !w.isDestroyed() && w.isVisible() }), 500))
      })
      expect(shown).toEqual({ destroyed: false, visible: false })
    })
  } finally {
    await app.close()
  }
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

test('pasek pulpitu wyłączony tuż po włączeniu: spóźnione potwierdzenie pomocnika go nie pokazuje', async () => {
  test.skip(process.env.RD_E2E_REAL_HELPER === '1', 'the stand-in helper only (it confirms 50 ms after a watch, even one taken back)')
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      const barVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – pasek' && w.isVisible()))
      await expect.poll(barVisible, { timeout: 30_000 }).toBe(true)
      await page.evaluate(() => window.rd.setPrefs({ desktopBar: false }))
      await expect.poll(barVisible).toBe(false)
      // On and at once off: the watch's confirmation comes after the bar was switched off.
      await page.evaluate(async () => {
        void window.rd.setPrefs({ desktopBar: true })
        await window.rd.setPrefs({ desktopBar: false })
      })
      await new Promise((r) => setTimeout(r, 1000))
      expect(await barVisible()).toBe(false)
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
  const { app, page, userData } = await launch({ data: true })
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

test('panel przy kursorze (ikona pod strzałką ukrytych ikon): rośnie w miejscu, nie skacze za kursorem', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      // No usable icon rectangle (the icon among the hidden ones), the cursor at a known point.
      const at = await app.evaluate(({ Tray, screen }) => {
        Tray.prototype.getBounds = () => ({ x: 0, y: 0, width: 0, height: 0 })
        const wa = screen.getPrimaryDisplay().workArea
        const p = { x: wa.x + Math.round(wa.width * 0.7), y: wa.y + Math.round(wa.height * 0.8) }
        screen.getCursorScreenPoint = () => p
        return p
      })
      await page.evaluate(() => window.rd.trialAction('openPanel'))
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('panel')).toBeVisible()
      const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Regulated Day – panel')!.getBounds())
      await expect.poll(async () => { const b = await bounds(); return [b.x + b.width, b.y + b.height] }).toEqual([at.x, at.y])
      // The cursor goes on (into the panel, to „Przedłuż”); then the content grows.
      await app.evaluate(({ screen }, p) => {
        screen.getCursorScreenPoint = () => ({ x: p.x - 150, y: p.y - 60 })
      }, at)
      const before = await bounds()
      await panel.evaluate(() => {
        const more = document.createElement('div')
        more.style.height = '80px'
        document.querySelector('[data-testid="panel"]')!.appendChild(more)
      })
      await expect.poll(async () => (await bounds()).height, { timeout: 10_000 }).toBeGreaterThan(before.height)
      const after = await bounds()
      expect([after.x + after.width, after.y + after.height]).toEqual([at.x, at.y])
    })
  } finally {
    await app.close()
  }
})

test('konwencje: długość „1h30”, ułamek odrzucony z komunikatem, Esc cofa edycję, usunięcie z „Cofnij”', async () => {
  const { app, page, userData } = await launch({ data: true })
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
    const { app, page, userData } = await launch({ data: true, env: { RD_WORK_AREA: area } })
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

test('folder danych (RD_DATA_DIR): obecność, lokalny dziennik i log dnia; przy zamknięciu obecność „zamknięty”', async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const dataDir = await mkdtemp(join(tmpdir(), 'rd-e2e-data-'))
  const { app, userData } = await launch({ env: { RD_DATA_DIR: dataDir } })
  let computer = ''
  try {
    await withMainLog(userData, async () => {
      await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('folder danych otwarty')
      computer = (JSON.parse(await readFile(join(userData, 'computer-id'), 'utf8')) as { id: string }).id
      const presence = JSON.parse(await readFile(join(dataDir, '.presence', `${computer}.json`), 'utf8')) as { computer: string; state: string }
      expect(presence.computer).toBe(computer)
      // The observation's start goes to the log of the logical day on the folder (after the local journal).
      const { readdir } = await import('node:fs/promises')
      await expect.poll(async () => (await readdir(join(dataDir, 'log'), { recursive: true }).catch(() => [] as string[])).some((n) => String(n).endsWith(`${computer}.jsonl`)), { timeout: 30_000 }).toBe(true)
    })
  } finally {
    await app.close()
  }
  const presence = JSON.parse(await readFile(join(dataDir, '.presence', `${computer}.json`), 'utf8')) as { state: string }
  expect(presence.state).toBe('closed')
})
