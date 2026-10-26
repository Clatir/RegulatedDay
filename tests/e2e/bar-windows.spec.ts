/**
 * Windows with the real helper (spec „Widget”, D229): the desktop bar lies under a normal window that overlaps it and
 * right above the desktop; the real cursor (SendInput) over every button of the bar – each one records that it was
 * entered – opens no new window and changes no order of windows; the control – an active window with one title
 * attribute – must open a tooltip window, or the check proves nothing. The windows lying over the bar (CI's console)
 * are minimized first, and every point must be the bar's own – or the cursor never reaches it.
 */
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, viewPage, withMainLog } from './app'
import { click, hover, topWindows, uncover, windowsAt, type TopWindow } from './win32'

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

test('kursor nad każdym przyciskiem paska nie otwiera okna i nie zmienia kolejności; próba kontrolna z title daje okno', async () => {
  test.setTimeout(180_000)
  const { app, userData } = await launch()
  try {
    await withMainLog(userData, async () => {
      await expect.poll(async () => (await barInfo(app)).visible, { timeout: 30_000 }).toBe(true)
      const page = await viewPage(app, 'bar')
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
      expect(rects.length).toBeGreaterThan(5)
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
