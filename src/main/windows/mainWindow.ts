// adapted from FI src/main/index.ts @ de81f2b (createWindow)
/**
 * The main window: at least 1024×700 (or the whole work area when it is smaller – the content then scrolls vertically),
 * its place kept for this computer and brought back to a visible screen. Closing it hides the app to the tray; the
 * icon and the desktop bar keep working. Its renderer is not throttled in the background: it works hidden in the tray
 * too (spec „Baza kodu i technika”). A close from outside while it is hidden (an installer's taskkill) quits the app.
 */
import { BrowserWindow } from 'electron'
import { minimumSize, windowBounds } from '@shared/bounds'
import type { WindowPlace } from '@shared/config'
import { PALETTE } from '@shared/theme'
import { displays, primaryDisplay } from '../displays'

export interface MainWindowDeps {
  preload: string
  title: string
  saved: WindowPlace | null
  load: (win: BrowserWindow) => Promise<void>
  savePlace: (place: WindowPlace) => void
  /** Quitting for real: closing the window closes it. */
  quitting: () => boolean
  /** A close from outside while hidden: quit the app. */
  externalClose: () => void
  log: (msg: string) => void
}

export function createMainWindow(d: MainWindowDeps): BrowserWindow {
  const primary = primaryDisplay()
  const all = displays()
  const bounds = windowBounds(d.saved, all.map((x) => x.workArea), primary.workArea)
  const min = minimumSize(primary.workArea)
  const win = new BrowserWindow({
    ...bounds,
    minWidth: min.width,
    minHeight: min.height,
    show: false,
    backgroundColor: PALETTE.bg,
    title: d.title,
    autoHideMenuBar: true,
    webPreferences: {
      preload: d.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: ['--rd-view=main']
    }
  })
  // A work area smaller than the minimum (RD_WORK_AREA in tests): the window takes it whole.
  if (bounds.width > primary.workArea.width || bounds.height > primary.workArea.height || process.env.RD_WORK_AREA) {
    win.setBounds({ ...primary.workArea })
  }
  if (d.saved?.maximized && !process.env.RD_WORK_AREA) win.maximize()
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // The window keeps its own title (the identity's name), not the page's.
  win.on('page-title-updated', (e) => e.preventDefault())
  const devUrl = process.env.ELECTRON_RENDERER_URL
  win.webContents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  const place = () => {
    const b = win.getNormalBounds()
    d.savePlace({ ...b, maximized: win.isMaximized() })
  }
  win.on('close', (e) => {
    if (d.quitting()) {
      place()
      return
    }
    e.preventDefault()
    if (!win.isVisible()) {
      // Nobody can click the close of a hidden window: an installer or taskkill asks the app to end.
      d.log('okno ukryte dostało polecenie zamknięcia z zewnątrz – kończę pracę')
      d.externalClose()
      return
    }
    place()
    win.hide()
    d.log('okno ukryte w zasobniku')
  })
  void d.load(win)
  return win
}
