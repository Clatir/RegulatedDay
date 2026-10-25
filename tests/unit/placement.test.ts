import { describe, expect, it } from 'vitest'
import type { DisplayInfo } from '@shared/bounds'
import { barRect, barWidth, cornerOffset, panelRect, usableIconRect } from '@shared/placement'
import { appUrl, parseAppUrl, urlFromArgv } from '@shared/protocol'

const primary: DisplayInfo = { id: 1, label: 'Dell U2720Q', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 }, scaleFactor: 1 }
const second: DisplayInfo = { id: 2, label: 'LG', bounds: { x: 1920, y: 0, width: 1280, height: 720 }, workArea: { x: 1920, y: 0, width: 1280, height: 672 }, scaleFactor: 1.5 }
const topBar: DisplayInfo = { id: 3, label: 'Top', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 48, width: 1920, height: 1032 }, scaleFactor: 1 }
const size = { width: 480, height: 300 }

describe('panel ikony (Widget)', () => {
  it('przy ikonie na pasku zadań, w obszarze roboczym', () => {
    const r = panelRect({ x: 1700, y: 1040, width: 24, height: 40 }, { x: 0, y: 0 }, [primary], size)
    expect(r).toEqual({ x: 1920 - 480, y: 1032 - 300 - 8, width: 480, height: 300 })
    const mid = panelRect({ x: 900, y: 1040, width: 24, height: 40 }, { x: 0, y: 0 }, [primary], size)
    expect(mid.x).toBe(912 - 240)
  })

  it('pusty prostokąt albo prostokąt poza paskiem zadań (ukryte ikony): przy kursorze', () => {
    expect(usableIconRect({ x: 0, y: 0, width: 0, height: 0 }, [primary])).toBeNull()
    expect(usableIconRect({ x: 500, y: 500, width: 24, height: 24 }, [primary])).toBeNull()
    const r = panelRect({ x: 0, y: 0, width: 0, height: 0 }, { x: 1800, y: 1060 }, [primary], size)
    expect(r).toEqual({ x: 1800 - 480, y: 1032 - 300, width: 480, height: 300 })
    // A cursor in a corner: still the whole panel inside the work area.
    const corner = panelRect(null, { x: 10, y: 10 }, [primary], size)
    expect(corner).toEqual({ x: 0, y: 0, width: 480, height: 300 })
  })

  it('pasek zadań u góry: panel pod nim', () => {
    const r = panelRect({ x: 1700, y: 10, width: 24, height: 30 }, { x: 0, y: 0 }, [topBar], size)
    expect(r.y).toBe(48 + 8)
  })
})

describe('pasek pulpitu (Widget)', () => {
  it('szerokość: mniejsza z 480 DIP × skala i obszaru roboczego minus 16 DIP', () => {
    expect(barWidth(primary.workArea, 1)).toBe(480)
    expect(barWidth(primary.workArea, 1.5)).toBe(720)
    expect(barWidth({ x: 0, y: 0, width: 700, height: 500 }, 1.5)).toBe(684)
  })

  it('domyślnie lewy dolny róg obszaru roboczego ekranu głównego, rozwija się w górę', () => {
    const r = barRect(null, [primary, second], primary, 1, 64, 200)
    expect(r.bounds).toEqual({ x: 8, y: 1032 - 8 - 200, width: 480, height: 200 })
    expect(r.growsUp).toBe(true)
  })

  it('zapamiętany monitor po nazwie i granicach; odłączony – ekran główny', () => {
    const placement = { display: { label: 'LG', bounds: second.bounds }, offset: { x: 20, y: 30 } }
    expect(barRect(placement, [primary, second], primary, 1, 64).bounds).toEqual({ x: 1940, y: 30, width: 480, height: 64 })
    expect(barRect(placement, [primary], primary, 1, 64).display.id).toBe(1)
    // Stands at the top: unfolds downwards.
    const top = barRect(placement, [primary, second], primary, 1, 64, 300)
    expect(top.growsUp).toBe(false)
    expect(top.bounds.y).toBe(30)
  })

  it('narożniki', () => {
    expect(cornerOffset('bottom-right', primary.workArea, { width: 480, height: 64 })).toEqual({ x: 1920 - 488, y: 1032 - 72 })
    expect(cornerOffset('top-left', primary.workArea, { width: 480, height: 64 })).toEqual({ x: 8, y: 8 })
  })
})

describe('adres regulatedday:// (tylko w ścisłym formacie)', () => {
  it('panel z linią i dniem', () => {
    expect(parseAppUrl('regulatedday://panel', 'regulatedday')).toEqual({ line: null, day: null })
    expect(parseAppUrl('regulatedday://panel/', 'regulatedday')).toEqual({ line: null, day: null })
    expect(parseAppUrl('regulatedday://panel?line=next-2026-10-25-b1&day=2026-10-25', 'regulatedday')).toEqual({ line: 'next-2026-10-25-b1', day: '2026-10-25' })
    expect(appUrl('regulatedday', { line: 'x1', day: '2026-10-25' })).toBe('regulatedday://panel?line=x1&day=2026-10-25')
  })

  it('wszystko inne jest odrzucane', () => {
    for (const bad of [
      'regulatedday://panel?line=X',
      'regulatedday://panel?line=a&line=b',
      'regulatedday://panel?cmd=quit',
      'regulatedday://settings',
      'regulatedday://panel?line=a&day=25.10.2026',
      'regulatedday://panel?line=a=b',
      'regulatedday://panelx',
      'http://panel',
      `regulatedday://panel?line=${'a'.repeat(300)}`
    ])
      expect(parseAppUrl(bad, 'regulatedday'), bad).toBeNull()
  })

  it('z linii poleceń tylko jeden adres', () => {
    expect(urlFromArgv(['Regulated Day.exe', 'regulatedday://panel?line=a'], 'regulatedday')).toEqual({ line: 'a', day: null })
    expect(urlFromArgv(['x', 'regulatedday://panel', 'regulatedday://panel'], 'regulatedday')).toBeNull()
    expect(urlFromArgv(['x', '--hidden'], 'regulatedday')).toBeNull()
  })
})
