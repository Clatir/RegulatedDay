/**
 * Windows with the real helper (spec „Widget”, D229): the desktop bar lies under a normal window that overlaps it and
 * right above the desktop; the real cursor (SendInput) over every button of the bar – each one records that it was
 * entered – opens no new window and changes no order of windows; the control – an active window with one title
 * attribute – must open a tooltip window, or the check proves nothing. The windows lying over the bar (CI's console)
 * are minimized first, and every point must be the bar's own – or the cursor never reaches it. The bar dragged by its
 * handle with the real mouse follows it and stays where it is let go (E4b.12).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, settledBarBounds, viewPage, withMainLog } from './app'
import { click, drag, foreground, hover, topWindows, uncover, windowsAt, type TopWindow } from './win32'

test.skip(process.platform !== 'win32' || process.env.RD_E2E_REAL_HELPER !== '1', 'Windows with the real helper only')

async function barInfo(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Regulated Day – pasek')!
    const buf = w.getNativeWindowHandle()
    return { hwnd: buf.readBigUInt64LE(0).toString(), bounds: w.getBounds(), visible: w.isVisible(), pid: process.pid, scale: screen.getDisplayMatching(w.getBounds()).scaleFactor, zoom: w.webContents.getZoomFactor() }
  })
}

const pidWindows = (pid: number) =>
  topWindows()
    .filter((w) => w.pid === pid && w.visible)
    .map((w) => `${w.cls}`)
    .sort()

/** Index of a window in the z-order (0 = the top). */
const zIndex = (list: TopWindow[], hwnd: string) => list.findIndex((w) => w.hwnd === hwnd)

/**
 * The visible windows that moved to the other side of the bar (above ↔ below) between two lists; windows in only one
 * list (the test's own PowerShell consoles come and go) do not count – an absolute index changes with them.
 */
function movedAcross(before: TopWindow[], after: TopWindow[], hwnd: string): string[] {
  const side = (list: TopWindow[]) => {
    const at = zIndex(list, hwnd)
    return new Map(list.flatMap((w, i) => (w.visible && w.hwnd !== hwnd ? [[w.hwnd, i < at] as const] : [])))
  }
  const a = side(before)
  const b = side(after)
  return [...a].filter(([h, above]) => b.has(h) && b.get(h) !== above).map(([h]) => `${h} ${after.find((w) => w.hwnd === h)?.cls ?? ''}`)
}

test('pasek pulpitu pod oknem, które na niego nachodzi, i tuż nad pulpitem', async () => {
  const { app, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      const bar = await barInfo(app)
      // A normal window over the bar (like TradingView maximized): it must lie above the bar.
      const cover = await app.evaluate(({ BrowserWindow }, b) => {
        const w = new BrowserWindow({ x: b.x - 20, y: b.y - 20, width: b.width + 40, height: b.height + 40, show: true, title: 'RD-CI-okno' })
        void w.loadURL('data:text/html,<body style="background:%23333">okno</body>')
        w.focus()
        return w.getNativeWindowHandle().readBigUInt64LE(0).toString()
      }, bar.bounds)
      await new Promise((r) => setTimeout(r, 3000))
      const list = topWindows()
      const desktop = list.findIndex((w) => w.cls === 'Progman' || w.cls === 'WorkerW')
      expect(zIndex(list, cover)).toBeLessThan(zIndex(list, bar.hwnd))
      expect(zIndex(list, bar.hwnd)).toBeLessThan(desktop)
      expect((await barInfo(app)).visible).toBe(true)
    })
  } finally {
    await app.close()
  }
})

test('„Zawsze na wierzchu”: pasek znika, gdy okno na pierwszym planie przechodzi na pełny ekran w miejscu (film w przeglądarce, E4b.9), i wraca po nim', async () => {
  const { app, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      const barPage = await viewPage(app, 'bar')
      await barPage.evaluate(() => window.rd.setPrefs({ onTop: 'bar' }))
      // The main window is in front after the start: the bar „na wierzchu” steps aside (D302) until the film's window is.
      const bar = await barInfo(app)
      const k = bar.scale
      // A normal window (the browser with the film), made the foreground by a real click away from the bar.
      const film = await app.evaluate(({ BrowserWindow }) => {
        const w = new BrowserWindow({ x: 60, y: 60, width: 640, height: 400, show: true, title: 'RD-CI-film' })
        void w.loadURL('data:text/html,<title>RD-CI-film</title><body style="background:%23000;color:%23fff">film</body>')
        ;(globalThis as unknown as { rdFilm: typeof w }).rdFilm = w
        return { ...w.getBounds(), hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString() }
      })
      uncover(film.hwnd)
      const middle: [number, number] = [(film.x + film.width / 2) * k, (film.y + film.height / 2) * k]
      await expect.poll(() => windowsAt([middle])[0], { timeout: 10_000 }).toBe(film.hwnd)
      click(...middle)
      await expect.poll(() => foreground(), { timeout: 10_000 }).toBe(film.hwnd)
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(true)
      // Its full screen in place: no change of the foreground window, the bar hides within the helper's check.
      await app.evaluate(() => (globalThis as unknown as { rdFilm: Electron.BrowserWindow }).rdFilm.setFullScreen(true))
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(false)
      expect(foreground()).toBe(film.hwnd)
      await app.evaluate(() => (globalThis as unknown as { rdFilm: Electron.BrowserWindow }).rdFilm.setFullScreen(false))
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(true)
    })
  } finally {
    await app.close()
  }
})

test('„Zawsze na wierzchu”: pasek pulpitu chowa się, gdy okno główne (z tym samym paskiem u góry) jest na pierwszym planie (D302)', async () => {
  const { app, page, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await page.evaluate(() => window.rd.setPrefs({ onTop: 'bar' }))
      const k = (await barInfo(app)).scale
      // Another window, small, over the main window's top left part.
      const other = await app.evaluate(({ BrowserWindow }) => {
        const w = new BrowserWindow({ x: 60, y: 60, width: 300, height: 200, show: true, title: 'RD-CI-inne' })
        void w.loadURL('data:text/html,<title>RD-CI-inne</title><body style="background:%23333">inne</body>')
        ;(globalThis as unknown as { rdOther: typeof w }).rdOther = w
        return { ...w.getBounds(), hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString() }
      })
      const main = await (await app.browserWindow(page)).evaluate((w) => ({ ...w.getBounds(), hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString() }))
      // A real click in a window makes it the foreground (focus() from a test may be refused by Windows).
      const activate = async (w: { x: number; y: number; width: number; height: number; hwnd: string }, at: [number, number]) => {
        uncover(w.hwnd)
        await expect.poll(() => windowsAt([at])[0], { timeout: 10_000 }).toBe(w.hwnd)
        click(...at)
        await expect.poll(() => foreground(), { timeout: 10_000 }).toBe(w.hwnd)
      }
      await activate(other, [(other.x + other.width / 2) * k, (other.y + other.height / 2) * k])
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(true)
      // The main window's empty right bottom part (no button there); the other window is minimized as covering it.
      await activate(main, [(main.x + main.width - 30) * k, (main.y + main.height - 30) * k])
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(false)
      await app.evaluate(() => (globalThis as unknown as { rdOther: Electron.BrowserWindow }).rdOther.restore())
      await activate(other, [(other.x + other.width / 2) * k, (other.y + other.height / 2) * k])
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(true)
    })
  } finally {
    await app.close()
  }
})

test('kursor nad każdym przyciskiem paska nie otwiera okna i nie zmienia kolejności; próba kontrolna z title daje okno', async () => {
  test.setTimeout(180_000)
  // A data folder and a block running: the bar's own buttons stand (without a folder it has one line, D327).
  const { app, page: main, userData } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      await expect.poll(() => main.evaluate(async () => (await window.rd.widget()).day), { timeout: 30_000 }).not.toBeNull()
      await main.evaluate(() => window.rd.timer({ a: 'startNew', block: 'e2e-hover', categoryId: 'inne', durationMin: 60 }))
      const page = await viewPage(app, 'bar')
      await expect(page.getByTestId('bar-next')).toBeVisible({ timeout: 30_000 })
      await settledBarBounds(app)
      const bar = await barInfo(app)
      const covers = uncover(bar.hwnd)
      await new Promise((r) => setTimeout(r, 1000))
      const before = pidWindows(bar.pid)
      const orderBefore = topWindows()
      // The visible buttons (folded ones have no box), each recording that the real cursor entered it.
      const rects = await page.evaluate(() => {
        const w = window as unknown as { rdEntered: Set<number> }
        w.rdEntered = new Set()
        const shown = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0)
        shown.forEach((b, i) => b.addEventListener('pointerenter', () => w.rdEntered.add(i)))
        return shown.map((b) => b.getBoundingClientRect()).map((r) => [r.x + r.width / 2, r.y + r.height / 2])
      })
      // At least Dalej, Przedłuż and Koniec pracy (the night's quiet keeps only these and what runs).
      expect(rects.length).toBeGreaterThan(2)
      const k = bar.scale
      const points = rects.map(([x, y]) => [(bar.bounds.x + x! * bar.zoom) * k, (bar.bounds.y + y! * bar.zoom) * k] as [number, number])
      const atPoints = windowsAt(points)
      expect(atPoints.filter((h) => h !== bar.hwnd), `punkty paska zasłonięte (${covers.join(', ') || 'nic nie zminimalizowano'}): ${JSON.stringify(topWindows().filter((w) => atPoints.includes(w.hwnd) && w.hwnd !== bar.hwnd).map((w) => w.cls))}`).toEqual([])
      hover(points, 1200)
      expect(await page.evaluate(() => (window as unknown as { rdEntered: Set<number> }).rdEntered.size), 'kursor nie doszedł do każdego przycisku').toBe(rects.length)
      expect(pidWindows(bar.pid)).toEqual(before)
      const orderAfter = topWindows()
      expect(movedAcross(orderBefore, orderAfter, bar.hwnd)).toEqual([])
      expect(zIndex(orderAfter, bar.hwnd)).toBeLessThan(orderAfter.findIndex((w) => w.cls === 'Progman' || w.cls === 'WorkerW'))
      // The control: one title attribute must open a tooltip window, or counting the windows proves nothing. Chromium
      // shows a page's tooltip only in the active window, so the control is activated by a real click beside its button
      // (the bar is never active – no tooltip shows there, and no other popup may).
      const probe = await app.evaluate(({ BrowserWindow }) => {
        const w = new BrowserWindow({ x: 300, y: 300, width: 300, height: 120, show: false, frame: false, title: 'RD-CI-kontrola' })
        void w.loadURL('data:text/html,<body style="margin:0"><button title="podpowiedź kontrolna" style="width:150px;height:120px" onpointerenter="window.entered=true">x</button></body>')
        w.show()
        ;(globalThis as unknown as { rdControl: typeof w }).rdControl = w
        return { ...w.getBounds(), hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString() }
      })
      const control = <T,>(js: string) => app.evaluate((_e, code) => (globalThis as unknown as { rdControl: Electron.BrowserWindow }).rdControl.webContents.executeJavaScript(code), js) as Promise<T>
      await expect.poll(() => control<boolean>('document.readyState === "complete"'), { timeout: 10_000 }).toBe(true)
      const probeCovers = uncover(probe.hwnd)
      await new Promise((r) => setTimeout(r, 1000))
      const probePoints: Array<[number, number]> = [
        [(probe.x + 225) * k, (probe.y + 60) * k],
        [(probe.x + 75) * k, (probe.y + 60) * k]
      ]
      expect(windowsAt(probePoints), `okno kontrolne zasłonięte (${probeCovers.join(', ') || 'nic nie zminimalizowano'})`).toEqual([probe.hwnd, probe.hwnd])
      click(...probePoints[0]!)
      const probeBefore = pidWindows(bar.pid)
      hover(
        [
          [(probe.x + 75) * k, (probe.y + 60) * k],
          [(probe.x + 80) * k, (probe.y + 62) * k]
        ],
        2500
      )
      expect(await control<boolean>('window.entered === true'), 'kursor nie doszedł do przycisku kontrolnego').toBe(true)
      expect(pidWindows(bar.pid).length, `kontrola: ${JSON.stringify(pidWindows(bar.pid))}`).toBeGreaterThan(probeBefore.length)
    })
  } finally {
    await app.close()
  }
})

/**
 * The bar dragged by its handle with the real mouse (E4b.12): it follows the cursor and stays where it is let go. With
 * „Zawsze na wierzchu” the main window steps aside first (D302 – the bar hides while it is in front): another window is
 * made the foreground by a real click, as on a desktop with TradingView in front.
 */
async function dragByHandle(onTop: boolean): Promise<void> {
  const { app, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      const page = await viewPage(app, 'bar')
      if (onTop) {
        await page.evaluate(() => window.rd.setPrefs({ onTop: 'bar' }))
        const other = await app.evaluate(({ BrowserWindow }) => {
          const w = new BrowserWindow({ x: 60, y: 60, width: 400, height: 260, show: true, title: 'RD-CI-inne' })
          void w.loadURL('data:text/html,<title>RD-CI-inne</title><body style="background:%23333">inne</body>')
          return { ...w.getBounds(), hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString() }
        })
        const k0 = (await barInfo(app)).scale
        const middle: [number, number] = [(other.x + other.width / 2) * k0, (other.y + other.height / 2) * k0]
        uncover(other.hwnd)
        await expect.poll(() => windowsAt([middle])[0], { timeout: 10_000 }).toBe(other.hwnd)
        click(...middle)
        await expect.poll(() => foreground(), { timeout: 10_000 }).toBe(other.hwnd)
        await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(true)
      }
      const bar = await barInfo(app)
      const covers = uncover(bar.hwnd)
      await new Promise((r) => setTimeout(r, 1000))
      // What the handle hears of the pointer and what the main process gets – the cause when the bar stays put.
      await app.evaluate(({ ipcMain }) => {
        const g = globalThis as unknown as { rdDrag: string[] }
        g.rdDrag = []
        ipcMain.on('rd:barDrag', (_e, phase: string, why?: string) => g.rdDrag.push(why ? `${phase}(${why})` : phase))
      })
      const grip = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="bar-drag"]')!
        const w = window as unknown as { rdGrip: string[] }
        w.rdGrip = []
        let moves = 0
        for (const t of ['pointerdown', 'gotpointercapture', 'lostpointercapture', 'pointerup', 'pointercancel']) el.addEventListener(t, () => w.rdGrip.push(t))
        el.addEventListener('pointermove', () => void (moves++ % 4 === 0 && w.rdGrip.push('pointermove')))
        const r = el.getBoundingClientRect()
        return [r.x + r.width / 2, r.y + r.height / 2]
      })
      const k = bar.scale
      const from: [number, number] = [(bar.bounds.x + grip[0]! * bar.zoom) * k, (bar.bounds.y + grip[1]! * bar.zoom) * k]
      expect(windowsAt([from]), `uchwyt zasłonięty (${covers.join(', ') || 'nic nie zminimalizowano'})`).toEqual([bar.hwnd])
      // Up by 120 DIP – into the work area (the bar stands at its bottom at the start).
      drag(from, [from[0], from[1] - 120 * k])
      const heard = async () => `uchwyt: ${(await page.evaluate(() => (window as unknown as { rdGrip: string[] }).rdGrip)).join(' ')}; proces główny: ${(await app.evaluate(() => (globalThis as unknown as { rdDrag: string[] }).rdDrag)).join(' ')}`
      await expect.poll(async () => (await barInfo(app)).bounds.y, { timeout: 5_000, message: await heard() }).toBeLessThan(bar.bounds.y - 100)
      // Let go there, it stays: the place is saved (the mock-up's bar comes from it).
      const moved = (await barInfo(app)).bounds
      expect(Math.abs(moved.x - bar.bounds.x), await heard()).toBeLessThanOrEqual(4)
      await expect.poll(async () => (await page.evaluate(() => window.rd.barScreens())).bar.bounds.y, { timeout: 5_000 }).toBe(moved.y)
      // The trace in main.log (what a drag on your computer tells, E4b.12): grabbed, let go with the button's release.
      const log = () => readFileSync(join(userData, 'logs', 'main.log'), 'utf8')
      await expect.poll(log, { timeout: 5_000 }).toContain('pasek: chwycony za uchwyt')
      await expect.poll(log, { timeout: 5_000 }).toMatch(/pasek: puszczony \(up\) po \d+ ruchach/)
    })
  } finally {
    await app.close()
  }
}

test('pasek pulpitu przeciągnięty za uchwyt prawdziwą myszą idzie za kursorem i zostaje tam, gdzie go puszczono (E4b.12)', () => dragByHandle(false))

test('„Zawsze na wierzchu”: pasek przeciągnięty za uchwyt prawdziwą myszą, gdy na pierwszym planie jest inne okno (E4b.12)', () => dragByHandle(true))
