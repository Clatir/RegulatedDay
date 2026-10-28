/**
 * The icon by the clock (A4-10, the review of 0.18.0): an icon file that cannot be written now (an antivirus holds it)
 * never throws out of a change of the view nor out of the refresh after a change of screens – the old image stays and
 * the tooltip still changes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const images: string[] = []
const tips: string[] = []

vi.mock('electron', () => ({
  Tray: class {
    constructor(image: string) {
      images.push(image)
    }
    isDestroyed = () => false
    setImage = (image: string) => void images.push(image)
    setToolTip = (tip: string) => void tips.push(tip)
    on = () => undefined
    destroy = () => undefined
  },
  Menu: { buildFromTemplate: () => ({}) }
}))

const { AppTray } = await import('../../src/main/tray')

let root = ''
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  images.length = 0
  tips.length = 0
})

/** A tray whose icon folder becomes a file after the start: every new icon file fails to be written. */
function brokenTray() {
  root = mkdtempSync(join(tmpdir(), 'rd-tray-'))
  const iconDir = join(root, 'icons')
  const logs: string[] = []
  const tray = new AppTray({ title: 'Regulated Day', iconDir, click: () => undefined, menu: () => [], log: (_l, msg) => void logs.push(msg) })
  expect(tray.ensure()).toBe(true)
  rmSync(iconDir, { recursive: true, force: true })
  writeFileSync(iconDir, 'not a folder')
  return { tray, logs, iconDir }
}

describe('ikona zasobnika przy pliku ikony, którego nie da się zapisać', () => {
  it('zmiana widoku: stary obraz zostaje, podpowiedź się zmienia, następny widok próbuje ponownie', () => {
    const { tray, logs, iconDir } = brokenTray()
    expect(() => tray.set({ color: '#C24A4A', dot: true, drop: false }, 'Praca do 12:00')).not.toThrow()
    expect(images).toHaveLength(1)
    expect(tips.at(-1)).toContain('Praca do 12:00')
    expect(logs.some((m) => m.includes('ikona zasobnika nie zmieniona'))).toBe(true)
    // The file can be written again: the next view sets the new image (the state was kept as before).
    rmSync(iconDir, { force: true })
    mkdirSync(iconDir)
    tray.set({ color: '#C24A4A', dot: true, drop: false }, 'Praca do 12:00')
    expect(images).toHaveLength(2)
  })

  it('odświeżenie po zmianie ekranów albo stanu pobierania nie rzuca wyjątku', () => {
    const { tray, logs } = brokenTray()
    // A state never drawn in this run: its file must be written now.
    tray.set({ color: '#4A7AC2', dot: false, drop: true }, 'Woda')
    expect(() => tray.refresh()).not.toThrow()
    expect(logs.some((m) => m.includes('ikona zasobnika nie odświeżona'))).toBe(true)
  })
})
