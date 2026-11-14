import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launch, launchSecondCopy, settledBarBounds, viewPage, withMainLog } from './app'

const PAGES = ['today', 'calendar', 'week', 'stats', 'requests', 'templates', 'routines', 'room', 'history', 'settings']

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
      // One list in this order, without a gap: the settings right under the history (D306), „Tydzień” right after the calendar (D361); no „Próba” (D286, D327).
      // „Szukaj” (D469) is no screen: it stands apart at the bottom of the menu, after the list.
      const items = page.getByTestId('side-menu').locator('[data-testid^="nav-"]:not([data-testid="nav-search"])')
      await expect(page.getByTestId('side-menu').getByTestId('nav-search')).toHaveAttribute('title', 'Szukaj (Ctrl K)')
      const searchTop = (await page.getByTestId('nav-search').boundingBox())!.y
      expect(searchTop).toBeGreaterThan((await page.getByTestId(`nav-${PAGES.at(-1)}`).boundingBox())!.y)
      expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual(PAGES.map((p) => `nav-${p}`))
      const gaps = await items.evaluateAll((els) => els.slice(1).map((el, i) => el.getBoundingClientRect().top - els[i]!.getBoundingClientRect().bottom))
      for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(1)
      // The shortcuts by the physical keys, the same as next to the names: Ctrl+9 – the history, Ctrl+, – the settings.
      await expect(page.getByTestId('nav-history')).toHaveAttribute('title', 'Historia (Ctrl 9)')
      await expect(page.getByTestId('nav-settings')).toHaveAttribute('title', 'Ustawienia (Ctrl ,)')
      await expect(page.getByTestId('nav-trial')).toHaveCount(0)
      await page.keyboard.press('Control+Digit9')
      await expect(page.getByTestId('page-history')).toBeVisible()
      await page.keyboard.press('Control+Comma')
      await expect(page.getByTestId('page-settings')).toBeVisible()
      await page.getByTestId('nav-settings').click()
      // „Wersja aplikacji” (D344): the number of „Wersja” in the updates, then what the installation is.
      const version = await app.evaluate(({ app }) => app.getVersion())
      await expect(page.getByTestId('current-version')).toHaveText(version)
      await expect(page.getByTestId('identity')).toHaveText(`${version} · testowa (Regulated Day Test)`)
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

test('zamknięcie: aplikacja zamknięta bez nieobsłużonych wyjątków, także gdy pomocnik kończy się po oknach', async () => {
  const { app, page, userData } = await launch()
  await expect(page.getByTestId('bar-main')).toBeVisible()
  await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('pomocnik działa')
  // app.close() returns when the process has ended: the log is complete. The helper's end and its last events (the
  // foreground, the bar) come after the windows are gone – none may reach a destroyed window.
  await app.close()
  const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8')
  expect(log).toContain('aplikacja zamknięta')
  expect(log.split('\n').filter((l) => /nieobsłużon/.test(l)), log).toEqual([])
})

/**
 * A real WM_CLOSE (PostMessage) to the window of `pid` with this title – what an installer's or your taskkill sends to
 * one window. Answers the windows of the process seen and whether one was posted to.
 */
function postClose(pid: number, title: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rd-e2e-close-'))
  const script = join(dir, 'close.ps1')
  writeFileSync(
    script,
    `$src = @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class RdClose {
  delegate bool E(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(E f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static string Post(uint want, string title) {
    var sb = new StringBuilder();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != want) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256); sb.Append("[" + t + "] ");
      if (t.ToString() == title) { PostMessage(h, 0x10, IntPtr.Zero, IntPtr.Zero); sb.Append("<- WM_CLOSE "); }
      return true; }, IntPtr.Zero);
    return sb.ToString();
  }
}
'@
Add-Type -TypeDefinition $src
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[RdClose]::Post([uint32]$args[0], [string]$args[1])
`,
    'utf8'
  )
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, String(pid), title], { encoding: 'utf8', timeout: 60_000 })
  rmSync(dir, { recursive: true, force: true })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
}

// A WM_CLOSE from outside (an installer's or your taskkill) to a hidden window – or the bar – is that window's close event,
// which it prevents and ends the app (T396, E4a.13). A quit begun inside that event was cancelled: the windows closed,
// the app went on without them until the installer killed it (CI) – seen only with a real WM_CLOSE (Windows); elsewhere
// the same event from code.
for (const title of ['Regulated Day – panel', 'Regulated Day – dźwięk', 'Regulated Day – pasek', 'Regulated Day – do skrzynki']) {
  test(`zamknięcie z zewnątrz okna „${title}”: aplikacja kończy pracę do końca – „aplikacja zamknięta”`, async () => {
    const { app, page, userData } = await launch()
    await expect(page.getByTestId('bar-main')).toBeVisible()
    const closed = app.waitForEvent('close', { timeout: 30_000 })
    if (process.platform === 'win32') {
      // The main process itself: Playwright starts it through a shell on Windows (app.process() is cmd.exe).
      const pid = await app.evaluate(() => process.pid)
      const seen = postClose(pid, title)
      expect(seen, seen).toContain('<- WM_CLOSE')
    } else {
      await app.evaluate(({ BrowserWindow }, t) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === t)?.close(), title).catch(() => undefined)
    }
    await closed
    const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8')
    expect(log).toContain('zamknięcie z zewnątrz (instalator albo taskkill)')
    expect(log).toContain('aplikacja zamknięta')
  })
}

test('druga kopia na tej samej tożsamości: przekazuje start działającej (okno wraca) i kończy się bez „koniec pracy” i „aplikacja zamknięta” (F2)', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('bar-main')).toBeVisible()
      // The running copy's window goes to the tray: the second start hands its argv over, and that shows it again.
      const win = await app.browserWindow(page)
      await win.evaluate((w) => w.hide())
      await expect.poll(() => win.evaluate((w) => w.isVisible())).toBe(false)
      expect(await launchSecondCopy(userData)).toBe(0)
      await expect.poll(() => win.evaluate((w) => w.isVisible()), { timeout: 15_000 }).toBe(true)
      const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8')
      expect(log).toContain('druga kopia – przekazano do działającej')
      expect(log).not.toMatch(/koniec pracy|aplikacja zamknięta/)
    })
  } finally {
    await app.close()
  }
  const log = await readFile(join(userData, 'logs', 'main.log'), 'utf8')
  expect(log.split('\n').filter((l) => /druga kopia/.test(l)).length).toBe(1)
  expect(log.split('\n').filter((l) => /aplikacja zamknięta/.test(l)).length).toBe(1)
  expect(log).not.toMatch(/koniec pracy/)
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

test('pasek pulpitu przeciągnięty za uchwyt idzie za kursorem i zostaje tam, gdzie go puszczono (D303)', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      const barBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Regulated Day – pasek')!.getBounds())
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – pasek' && w.isVisible())), { timeout: 30_000 }).toBe(true)
      const bar = await viewPage(app, 'bar')
      const handle = bar.getByTestId('bar-drag')
      await expect(handle).toHaveAttribute('aria-label', 'przeciągnij pasek')
      // Its place once its view is drawn (a line coming at the start changes its height and so its place).
      const start = await settledBarBounds(app)
      // The cursor where the test puts it (the synthetic mouse moves no real cursor).
      const wa = await app.evaluate(({ screen }, b) => {
        const g = globalThis as unknown as { rdCursor: { x: number; y: number } }
        g.rdCursor = { x: b.x + 6, y: b.y + 10 }
        screen.getCursorScreenPoint = () => g.rdCursor
        return screen.getPrimaryDisplay().workArea
      }, start)
      const box = (await handle.boundingBox())!
      await bar.mouse.move(box.x + box.width / 2, box.y + 10)
      // A click on the handle (the cursor where it was): nothing moves, nothing is saved.
      await bar.mouse.down()
      await bar.mouse.up()
      expect((await page.evaluate(() => window.rd.prefs())).barPlacement).toBeNull()
      expect(await barBounds()).toEqual(start)
      await bar.mouse.down()
      await app.evaluate((_e, b) => ((globalThis as unknown as { rdCursor: { x: number; y: number } }).rdCursor = { x: b.x + 6 + 200, y: b.y + 10 - 150 }), start)
      await bar.mouse.move(box.x + box.width / 2 + 5, box.y + 5)
      await expect.poll(barBounds).toMatchObject({ x: start.x + 200, y: start.y - 150 })
      await bar.mouse.up()
      // Remembered on this computer: the folded bar's place in the work area.
      await expect.poll(async () => (await page.evaluate(() => window.rd.prefs())).barPlacement?.offset).toEqual({ x: start.x + 200 - wa.x, y: start.y - 150 - wa.y })
      expect(await barBounds()).toMatchObject({ x: start.x + 200, y: start.y - 150 })
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

test('pasek we wszystkich oknach z widoku silnika; panel ikony otwiera się i zamyka Esc', async () => {
  const { app, page, userData } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      const bar = await viewPage(app, 'bar')
      // The engine's view (a day, its block line) in the window, on the desktop and in the panel – never the bar without
      // a folder; „Bez bloku” or the night's hour.
      for (const b of [page.getByTestId('bar-main'), bar.getByTestId('bar-desktop')]) await expect(b).not.toHaveAttribute('data-day', 'none', { timeout: 30_000 })
      await expect(page.getByTestId('bar-block')).toHaveText(/Bez bloku|^\d{2}:\d{2}$/)
      await expect(bar.getByTestId('bar-block')).toHaveText(/Bez bloku|^\d{2}:\d{2}$/)
      await expect.poll(async () => (await bar.getByTestId('bar-desktop').getAttribute('data-tone')) === (await page.getByTestId('bar-main').getAttribute('data-tone'))).toBe(true)
      await page.evaluate(() => window.rd.barAction('openPanel'))
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('panel')).toBeVisible()
      await expect(panel.getByTestId('bar-block')).toHaveText(/Bez bloku|^\d{2}:\d{2}$/)
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))).toBe(true)
      await panel.keyboard.press('Escape')
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))).toBe(false)
    })
  } finally {
    await app.close()
  }
})

test('bez folderu danych: pasek pulpitu i panel z jedną linią „Brak folderu danych · Otwórz okno” (D327)', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-desktop')).toHaveAttribute('data-day', 'none')
      await expect(bar.getByTestId('bar-line-nofolder')).toContainText('Brak folderu danych')
      await expect(bar.getByTestId('bar-countdown')).toHaveCount(0)
      // In the window itself no way to the window.
      await expect(page.getByTestId('bar-main')).toContainText('Brak folderu danych')
      await expect(page.getByTestId('bar-act-nofolder-open')).toHaveCount(0)
      await page.evaluate(() => window.rd.barAction('openPanel'))
      const panel = await viewPage(app, 'panel')
      await expect(panel.getByTestId('bar-act-nofolder-open')).toHaveText('Otwórz okno')
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
      await page.evaluate(() => window.rd.barAction('openPanel'))
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

test('konwencje: długość „1h30”, ułamek odrzucony z komunikatem, Esc cofa edycję, usunięcie z „Cofnij”, filtry (Sprawy)', async () => {
  const { app, page, userData } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await page.getByTestId('nav-requests').click()
      for (let i = 0; i < 3; i++) await page.getByTestId('request-new').click()
      await expect(page.getByTestId('case-row')).toHaveCount(3)
      const d = page.getByTestId('request-estimate').first()
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
      const note = page.getByTestId('request-note').first()
      await note.fill('spacer z psem')
      await note.press('Enter')
      await expect(note).toHaveValue('spacer z psem')
      await page.getByTestId('request-remove').first().click()
      await expect(page.getByTestId('case-row')).toHaveCount(2)
      await page.getByTestId('toast-action').click()
      await expect(page.getByTestId('case-row')).toHaveCount(3)
      await expect(page.getByTestId('request-note').first()).toHaveValue('spacer z psem')
      // „Zrobione” moves it to the list of done (Sprawy, D383); a task added with Ctrl+N and a filter by kind: one of four, then all again.
      await page.getByTestId('case-row').first().getByTestId('case-done').click()
      await expect(page.getByTestId('cases-done-list').getByTestId('case-row')).toHaveCount(1)
      await page.keyboard.press('Control+KeyN')
      await page.getByTestId('case-add-title').fill('Zadanie z Ctrl N')
      await page.getByTestId('case-add-title').press('Enter')
      await page.getByTestId('filter-kind:task').click()
      await expect(page.getByTestId('count-cases')).toHaveText('1 z 4')
      await page.getByTestId('filters-clear').click()
      await expect(page.getByTestId('count-cases')).toHaveText('4 z 4')
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

test('proces pomocniczy (zadania w tle, T190) startuje ze zbudowanej aplikacji i odpowiada', async () => {
  const { app, userData } = await launch({ env: { RD_E2E_WORKER: '1' } })
  try {
    await withMainLog(userData, async () => {
      await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('proces pomocniczy: ok')
    })
  } finally {
    await app.close()
  }
})

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

test('start z Windows w zasobniku: zapamiętane zmaksymalizowane okno się nie pokazuje (A4-02)', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const userData = join(await mkdtemp(join(tmpdir(), 'rd-e2e-')), 'userData')
  await mkdir(userData, { recursive: true })
  await writeFile(join(userData, 'config.json'), JSON.stringify({ format: 1, window: { x: 100, y: 100, width: 1200, height: 800, maximized: true } }))
  const { app } = await launch({ userData, args: ['--hidden'], hidden: true })
  try {
    await withMainLog(userData, async () => {
      await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8').catch(() => ''), { timeout: 30_000 }).toContain('start w zasobniku')
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible() && w.getTitle() === 'Regulated Day Test'))).toBe(false)
    })
  } finally {
    await app.close()
  }
})

test('Alt+F4 w otwartym panelu ikony zamyka tylko panel – aplikacja działa dalej (A4-05)', async () => {
  const { app, page, userData } = await launch({ data: true })
  const panelVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))
  try {
    await withMainLog(userData, async () => {
      await page.evaluate(() => window.rd.barAction('openPanel'))
      await expect.poll(panelVisible).toBe(true)
      // Alt+F4 is WM_CLOSE to the window with the focus – the panel.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Regulated Day – panel')?.close())
      await expect.poll(panelVisible).toBe(false)
      // The quit would be written at once, in the same close.
      expect(await readFile(join(userData, 'logs', 'main.log'), 'utf8')).not.toContain('zamykanie: wyjście z aplikacji')
      expect(await page.evaluate(() => document.title.length > 0)).toBe(true)
    })
  } finally {
    await app.close()
  }
})
