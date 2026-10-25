// adapted from FI src/main/tray.ts @ de81f2b
/**
 * The icon by the clock (spec „Widget”, D289): its colour is the bar's, a dot when something stands without your
 * click, a drop when the water icon waits, and the tooltip with the block, the time to its end and the next fixed block.
 * The main process draws it as an .ico with the sizes 16–32 px for each state (a tray icon from a PNG uses only its base
 * size). Left click: the icon's panel; right click: the menu. Set again after Explorer restarts and after the screens
 * change.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Menu, Tray, type MenuItemConstructorOptions } from 'electron'
import { TRAY_SIZES, renderTrayIcon, trayIconKey, type TrayIconState } from '@shared/trayIcon'
import { encodeIco, encodePng } from './icon/ico'

export interface TrayDeps {
  title: string
  iconDir: string
  click: () => void
  menu: () => MenuItemConstructorOptions[]
  log: (level: 'info' | 'warn', msg: string, e?: unknown) => void
}

export class AppTray {
  private tray: Tray | null = null
  private state: TrayIconState = { color: '#8C7F87', dot: false, drop: false }
  private tooltip = ''
  private drawn = new Set<string>()

  constructor(private readonly d: TrayDeps) {
    mkdirSync(d.iconDir, { recursive: true })
    // The icons of earlier runs: drawn again when needed.
    for (const name of readdirSync(d.iconDir)) if (/^tray-.*\.(ico|png)$/.test(name)) rmSync(join(d.iconDir, name), { force: true })
  }

  get active(): boolean {
    return !!this.tray && !this.tray.isDestroyed()
  }

  /** The .ico of a state, drawn once per run. */
  private iconFile(s: TrayIconState): string {
    const key = trayIconKey(s)
    // Windows: an .ico with every size; elsewhere (CI on Linux) Electron reads no .ico – a PNG of the largest size.
    const ico = process.platform === 'win32'
    const file = join(this.d.iconDir, `tray-${key}.${ico ? 'ico' : 'png'}`)
    if (!this.drawn.has(key) || !existsSync(file)) {
      const last = TRAY_SIZES[TRAY_SIZES.length - 1]!
      writeFileSync(file, ico ? encodeIco(TRAY_SIZES.map((size) => ({ size, png: encodePng(renderTrayIcon(size, s), size, size) }))) : encodePng(renderTrayIcon(last, s), last, last))
      this.drawn.add(key)
    }
    return file
  }

  ensure(): boolean {
    if (this.active) return true
    try {
      this.tray = new Tray(this.iconFile(this.state))
      this.tray.setToolTip(this.tooltip || this.d.title)
      this.tray.on('click', () => this.d.click())
      this.tray.on('right-click', () => this.popMenu())
      return true
    } catch (e) {
      this.d.log('warn', 'zasobnik niedostępny', e)
      this.tray = null
      return false
    }
  }

  /** The icon's rectangle on the screen (Shell_NotifyIconGetRect); empty when Windows hides it under the arrow. */
  bounds(): Electron.Rectangle | null {
    return this.active ? this.tray!.getBounds() : null
  }

  set(state: TrayIconState, tooltip: string): void {
    const changed = trayIconKey(state) !== trayIconKey(this.state)
    this.state = state
    if (!this.active) return
    if (changed) this.tray!.setImage(this.iconFile(state))
    // Windows cuts a tooltip at 127 characters.
    const tip = `${this.d.title}\n${tooltip}`.slice(0, 127)
    if (tip !== this.tooltip) {
      this.tooltip = tip
      this.tray!.setToolTip(tip)
    }
  }

  /** Explorer restarted or the screens changed: the icon is set again. */
  refresh(): void {
    if (!this.active) return
    this.tray!.setImage(this.iconFile(this.state))
    if (this.tooltip) this.tray!.setToolTip(this.tooltip)
  }

  private popMenu(): void {
    if (!this.active) return
    this.tray!.popUpContextMenu(Menu.buildFromTemplate(this.d.menu()))
  }

  destroy(): void {
    if (this.active) this.tray!.destroy()
    this.tray = null
  }
}
