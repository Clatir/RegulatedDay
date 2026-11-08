/**
 * Windows with the real helper (spec „Widget”, D229): the desktop bar lies under a normal window that overlaps it and
 * right above the desktop; the real cursor (SendInput) over every button of the bar – each one records that it was
 * entered – opens no new window and changes no order of windows; the control – an active window with one title
 * attribute – must open a tooltip window, or the check proves nothing. The windows lying over the bar (CI's console)
 * are minimized first, and every point must be the bar's own – or the cursor never reaches it. The bar dragged by its
 * handle with the real mouse follows it and stays where it is let go (E4b.12). A hidden „WorkerW” at the top of the order
 * is no desktop – the bar stays under the windows (G4) – and after „failed” the helper tries again by itself (D341).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, settledBarBounds, viewPage, withMainLog } from './app'
import { background, click, drag, foreground, hover, placeUnder, topWindows, uncover, windowsAt, type TopWindow } from './win32'

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
 * Index of the highest desktop window counting for the bar, by the helper's rule (WindowOrder.IsDesktopWindow, Counts):
 * Progman, a WorkerW with the icons, or a WorkerW that shows – visible, not cloaked, with an area – and overlaps the bar.
 * A hidden WorkerW is none (G4), nor an old file dialog holding SHELLDLL_DefView.
 */
function desktopIndex(list: TopWindow[], barHwnd: string): number {
  const bar = list.find((w) => w.hwnd === barHwnd)
  const [l, t, r, b] = bar?.rect ?? [0, 0, 0, 0]
  const overlaps = (x: TopWindow['rect']) => x[0] < r && l < x[2] && x[1] < b && t < x[3]
  const shows = (w: TopWindow) => w.visible && !w.cloaked && w.rect[2] > w.rect[0] && w.rect[3] > w.rect[1]
  return list.findIndex((w) => w.hwnd !== barHwnd && (w.cls === 'Progman' || (w.cls === 'WorkerW' && (w.defView || (shows(w) && overlaps(w.rect))))))
}

const logOf = (userData: string, name: 'main' | 'helper') => {
  try {
    return readFileSync(join(userData, 'logs', `${name}.log`), 'utf8')
  } catch {
    return ''
  }
}

/** A window over the bar's bounds and 20 DIP around them, shown with activation or without. */
async function windowOverBar(app: ElectronApplication, title: string, active: boolean): Promise<string> {
  const b = (await barInfo(app)).bounds
  return app.evaluate(
    ({ BrowserWindow }, a) => {
      const w = new BrowserWindow({ x: a.b.x - 20, y: a.b.y - 20, width: a.b.width + 40, height: a.b.height + 40, show: false, title: a.title })
      void w.loadURL(`data:text/html,<body style="background:%23333">${a.title}</body>`)
      if (a.active) {
        w.show()
        w.focus()
      } else w.showInactive()
      return w.getNativeWindowHandle().readBigUInt64LE(0).toString()
    },
    { b, title, active }
  )
}

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
      expect(zIndex(list, cover)).toBeLessThan(zIndex(list, bar.hwnd))
      expect(zIndex(list, bar.hwnd)).toBeLessThan(desktopIndex(list, bar.hwnd))
      expect((await barInfo(app)).visible).toBe(true)
    })
  } finally {
    await app.close()
  }
})

/**
 * G4 (D229): Explorer keeps hidden WorkerW windows, also at the very top of the order; taken for the desktop, one laid
 * the bar over every window (over Edge on full screen in the VM). Here a hidden „WorkerW” stays at the top, a normal
 * window lies over the bar, and a second one is put right under it – the helper lays the bar again, and it stays under
 * both, right above the desktop.
 */
test('pasek pulpitu zostaje pod zwykłym oknem, gdy na szczycie leży ukryte okno klasy WorkerW (G4)', async () => {
  const { app, userData } = await launch()
  let stopWorker = () => {}
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      const bar = await barInfo(app)
      const probe = await windowOverBar(app, 'RD-CI-pod-paskiem', false)
      const cover = await windowOverBar(app, 'RD-CI-okno', true)
      await expect.poll(() => {
        const l = topWindows()
        return zIndex(l, cover) >= 0 && zIndex(l, cover) < zIndex(l, bar.hwnd)
      }, { timeout: 10_000 }).toBe(true)
      const worker = await background('[RdWin]::HiddenWorkerW(120)')
      stopWorker = worker.stop
      // The case holds only with the hidden WorkerW over the normal window.
      await expect.poll(() => {
        const l = topWindows()
        const i = zIndex(l, worker.first)
        return i >= 0 && l[i]!.cls === 'WorkerW' && !l[i]!.visible && i < zIndex(l, cover)
      }, { timeout: 10_000 }).toBe(true)
      // A window right under the bar: the helper must lay it again – now, with the WorkerW at the top.
      const from = logOf(userData, 'main').length
      placeUnder(probe, bar.hwnd)
      await expect.poll(() => /pasek pulpitu: placing[\s\S]*pasek pulpitu: (confirmed|failed)/.test(logOf(userData, 'main').slice(from)), { timeout: 20_000 }).toBe(true)
      const list = topWindows()
      const names = `kolejność: ${JSON.stringify(list.slice(0, 12).map((w) => `${w.hwnd} ${w.cls}${w.visible ? '' : ' (ukryte)'}`))}; pasek ${bar.hwnd}`
      expect(zIndex(list, worker.first), names).toBeLessThan(zIndex(list, cover))
      expect(zIndex(list, cover), names).toBeLessThan(zIndex(list, bar.hwnd))
      expect(zIndex(list, probe), names).toBeLessThan(zIndex(list, bar.hwnd))
      expect(zIndex(list, bar.hwnd), names).toBeLessThan(desktopIndex(list, bar.hwnd))
      expect((await barInfo(app)).visible).toBe(true)
    })
  } finally {
    stopWorker()
    await app.close()
  }
})

/**
 * D341: after „nie udało się położyć pod oknami” the helper tries again by itself every 5 min – here every 3 s
 * (RD_TEST_BAR_RETRY_MS). Another program keeps its window right under the bar until the bar hides; then that window
 * stays there and nothing else happens – only the retry by itself lays the bar under it again and shows it.
 */
test('pasek pulpitu po „nie udało się położyć pod oknami” sam ponawia co 5 min i wraca pod okna (D341)', async () => {
  const { app, userData } = await launch({ env: { RD_TEST_BAR_RETRY_MS: '3000' } })
  let stopFight = () => {}
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      const bar = await barInfo(app)
      const probe = await windowOverBar(app, 'RD-CI-pod-paskiem', false)
      const fight = await background(`[RdWin]::KeepUnder(${probe}, ${bar.hwnd}, 120)`)
      stopFight = fight.stop
      await expect.poll(() => logOf(userData, 'main'), { timeout: 30_000 }).toContain('pasek pulpitu: failed')
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 10_000 }).toBe(false)
      fight.stop()
      // Only a retry after the fight counts: one during it would prove nothing.
      const from = logOf(userData, 'helper').length
      // What holds it, in the helper's log: the top windows, without their titles (logs go into reports, D279).
      expect(logOf(userData, 'helper')).toMatch(/pasek: \d+ górnych okien \(pasek #\d+, najwyższe okno pulpitu #\d+ /)
      expect(logOf(userData, 'helper')).not.toContain('RD-CI-pod-paskiem')
      placeUnder(probe, bar.hwnd)
      await expect.poll(() => logOf(userData, 'helper').slice(from), { timeout: 30_000 }).toContain('pasek: ponowna próba (co 5 min)')
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 15_000 }).toBe(true)
      // Shown, it may stand over the window for a moment, until the next check of the second lays it again.
      await expect.poll(() => {
        const l = topWindows()
        return zIndex(l, probe) < zIndex(l, bar.hwnd) && zIndex(l, bar.hwnd) < desktopIndex(l, bar.hwnd)
      }, { timeout: 10_000 }).toBe(true)
    })
  } finally {
    stopFight()
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
      expect(zIndex(orderAfter, bar.hwnd)).toBeLessThan(desktopIndex(orderAfter, bar.hwnd))
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
