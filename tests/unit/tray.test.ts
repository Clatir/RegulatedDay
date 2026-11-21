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
const handlers = new Map<string, () => void>()

vi.mock('electron', () => ({
  Tray: class {
    constructor(image: string) {
      images.push(image)
    }
    isDestroyed = () => false
    setImage = (image: string) => void images.push(image)
    setToolTip = (tip: string) => void tips.push(tip)
    on = (event: string, fn: () => void) => void handlers.set(event, fn)
    destroy = () => undefined
  },
  Menu: { buildFromTemplate: () => ({}) }
}))

const { AppTray, trayMenuItems } = await import('../../src/main/tray')

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
  const tray = new AppTray({ title: 'Regulated Day', iconDir, click: () => undefined, doubleClick: () => undefined, menu: () => [], log: (_l, msg) => void logs.push(msg) })
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

describe('dwuklik ikony (D559)', () => {
  it('pojedynczy klik idzie do panelu, dwuklik – do okna głównego', () => {
    root = mkdtempSync(join(tmpdir(), 'rd-tray-'))
    const calls: string[] = []
    const tray = new AppTray({ title: 'Regulated Day', iconDir: join(root, 'icons'), click: () => void calls.push('click'), doubleClick: () => void calls.push('double'), menu: () => [], log: () => undefined })
    expect(tray.ensure()).toBe(true)
    handlers.get('click')!()
    handlers.get('double-click')!()
    expect(calls).toEqual(['click', 'double'])
  })
})

describe('menu ikony – jedna nazwa okna głównego i wyjścia (C7, D564 P13, P20)', () => {
  const acts = () => {
    const calls: string[] = []
    return { calls, a: { showMain: () => void calls.push('main'), showBar: () => void calls.push('bar'), install: () => void calls.push('install'), quit: () => void calls.push('quit') } }
  }
  const labels = (items: ReturnType<typeof trayMenuItems>) => items.map((i) => (i.type === 'separator' ? '—' : i.label))

  it('„Otwórz okno główne” na górze, „Zakończ aplikację” na dole; każda pozycja robi swoje', () => {
    const { calls, a } = acts()
    const items = trayMenuItems({ barClosed: false, desktopBar: true, ready: null }, a)
    expect(labels(items)).toEqual(['Otwórz okno główne', '—', 'Zakończ aplikację'])
    for (const i of items) (i.click as (() => void) | undefined)?.()
    expect(calls).toEqual(['main', 'quit'])
  })

  it('pasek schowany „×” – „Pokaż pasek pulpitu”; gotowa aktualizacja – „Zainstaluj teraz (…)”', () => {
    const { calls, a } = acts()
    const items = trayMenuItems({ barClosed: true, desktopBar: true, ready: '1.34.0' }, a)
    expect(labels(items)).toEqual(['Otwórz okno główne', 'Pokaż pasek pulpitu', 'Zainstaluj teraz (1.34.0)', '—', 'Zakończ aplikację'])
    for (const i of items) (i.click as (() => void) | undefined)?.()
    expect(calls).toEqual(['main', 'bar', 'install', 'quit'])
    // Switched off in the settings: no „Pokaż pasek pulpitu” (as before – UX11 changes it).
    expect(labels(trayMenuItems({ barClosed: true, desktopBar: false, ready: null }, a))).toEqual(['Otwórz okno główne', '—', 'Zakończ aplikację'])
  })
})

