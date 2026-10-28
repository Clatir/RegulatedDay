import { describe, expect, it } from 'vitest'
import { displayAt, type DisplayInfo } from '@shared/bounds'
import { BAR_SPOTS } from '@shared/machine'
import { barRect, barWidth, draggedBounds, panelRect, placementAfterDrag, spotOffset, spotPlacement, usableIconRect } from '@shared/placement'
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

  it('zapamiętany monitor po nazwie i granicach; odłączony – lewy dolny róg ekranu głównego (D303)', () => {
    const placement = { display: { label: 'LG', bounds: second.bounds }, spot: null, offset: { x: 20, y: 30 } }
    expect(barRect(placement, [primary, second], primary, 1, 64)).toMatchObject({ bounds: { x: 1940, y: 30, width: 480, height: 64 }, spot: null })
    // Its monitor gone: the corner, not the same offset there.
    expect(barRect(placement, [primary], primary, 1, 64)).toMatchObject({ display: { id: 1 }, bounds: { x: 8, y: 1032 - 8 - 64 }, spot: 'bottom-left' })
    // Stands at the top: unfolds downwards.
    const top = barRect(placement, [primary, second], primary, 1, 64, 300)
    expect(top.growsUp).toBe(false)
    expect(top.bounds.y).toBe(30)
  })
})

describe('miejsce paska: makieta i przeciąganie (D303, D304)', () => {
  const folded = { width: 480, height: 64 }

  it('miejsca 8 DIP od krawędzi; środki krawędzi na środku szerokości', () => {
    expect(spotOffset('bottom-right', primary.workArea, folded)).toEqual({ x: 1920 - 488, y: 1032 - 72 })
    expect(spotOffset('top-left', primary.workArea, folded)).toEqual({ x: 8, y: 8 })
    expect(spotOffset('top-center', primary.workArea, folded)).toEqual({ x: 720, y: 8 })
    expect(spotOffset('bottom-center', primary.workArea, folded)).toEqual({ x: 720, y: 1032 - 72 })
    expect(spotOffset('top-right', second.workArea, folded)).toEqual({ x: 1280 - 488, y: 8 })
  })

  it('wybrane miejsce liczy się z wysokością i skalą paska teraz: przy pytaniu i w skali 150% zostaje 8 DIP od krawędzi', () => {
    const p = spotPlacement(second, 'bottom-right', folded)
    expect(p.spot).toBe('bottom-right')
    for (const s of BAR_SPOTS) expect(barRect(spotPlacement(primary, s, folded), [primary], primary, 1, 64).spot).toBe(s)
    // The bar grew with a question (92 px): still 8 DIP above the taskbar, not pressed to it.
    expect(barRect(p, [primary, second], primary, 1, 92).bounds).toEqual({ x: 3200 - 488, y: 672 - 8 - 92, width: 480, height: 92 })
    // At 150 %: 720 wide, still 8 DIP from the right.
    expect(barRect(p, [primary, second], primary, 1.5, 96).bounds).toMatchObject({ x: 3200 - 8 - 720, width: 720 })
  })

  it('przeciąganie: prostokąt idzie za kursorem także między monitorami (bez skoku), w obrębie obszarów roboczych', () => {
    const start = { x: 8, y: 960, width: 480, height: 64 }
    expect(draggedBounds(start, { x: 20, y: 980 }, { x: 520, y: 680 }, [primary, second])).toEqual({ x: 508, y: 660, width: 480, height: 64 })
    // Past the bottom of the work areas: stops above the taskbar.
    expect(draggedBounds(start, { x: 20, y: 980 }, { x: 20, y: 1075 }, [primary, second]).y).toBe(1032 - 64)
    // From the second monitor back across the edge: follows the cursor, half on each.
    const onSecond = { x: 1950, y: 200, width: 480, height: 64 }
    expect(draggedBounds(onSecond, { x: 1956, y: 210 }, { x: 1910, y: 210 }, [primary, second]).x).toBe(1904)
    expect(draggedBounds(onSecond, { x: 1956, y: 210 }, { x: 1900, y: 210 }, [primary, second]).x).toBe(1894)
    // Past the right edge of all: stops there.
    expect(draggedBounds(start, { x: 20, y: 980 }, { x: 3190, y: 600 }, [primary, second]).x).toBe(3200 - 480)
  })

  it('upuszczony pasek: własne miejsce na monitorze pod środkiem, w jego obszarze roboczym; po ponownym starcie stoi tam samo', () => {
    const p = placementAfterDrag({ x: 2100, y: 200, width: 480, height: 64 }, [primary, second], 64, false)
    expect(p).toEqual({ display: { label: 'LG', bounds: second.bounds }, spot: null, offset: { x: 180, y: 200 } })
    expect(barRect(p, [primary, second], primary, 1, 64).bounds).toEqual({ x: 2100, y: 200, width: 480, height: 64 })
    // Let go half on each monitor (middle on the first): put into the first.
    expect(placementAfterDrag({ x: 1600, y: 200, width: 480, height: 64 }, [primary, second], 64, false)).toMatchObject({ display: { label: 'Dell U2720Q' }, offset: { x: 1920 - 480, y: 200 } })
  })

  it('rozwinięty w górę: zapamiętana jest dolna, złożona część okna', () => {
    const p = placementAfterDrag({ x: 600, y: 500, width: 480, height: 300 }, [primary], 64, true)
    expect(p.offset).toEqual({ x: 600, y: 500 + 300 - 64 })
    const r = barRect(p, [primary], primary, 1, 64, 300)
    expect(r.bounds).toEqual({ x: 600, y: 500, width: 480, height: 300 })
  })

  it('monitor nad głównym (ujemne y, inna skala): przeciąganie, przejście przez krawędź i powrót na to samo miejsce (A4-13)', () => {
    const above: DisplayInfo = { id: 4, label: 'VG27B', bounds: { x: 0, y: -1440, width: 2560, height: 1440 }, workArea: { x: 0, y: -1440, width: 2560, height: 1400 }, scaleFactor: 1.25 }
    const all = [primary, above]
    // A drag up from the main monitor onto the upper one: the bar follows the cursor into negative y.
    const start = { x: 8, y: 960, width: 480, height: 64 }
    expect(draggedBounds(start, { x: 20, y: 980 }, { x: 420, y: -600 }, all)).toEqual({ x: 408, y: -620, width: 480, height: 64 })
    // Let go on the upper one: its own place there, back on the same rectangle after a start.
    const p = placementAfterDrag({ x: 408, y: -620, width: 480, height: 64 }, all, 64, false)
    expect(p.display.label).toBe('VG27B')
    expect(barRect(p, all, primary, 1, 64).bounds).toEqual({ x: 408, y: -620, width: 480, height: 64 })
  })

  it('ekran pod punktem po x i y – monitor nad głównym ma te same x (A4-11)', () => {
    const above: DisplayInfo = { id: 4, label: 'VG27B', bounds: { x: 0, y: -1440, width: 2560, height: 1440 }, workArea: { x: 0, y: -1440, width: 2560, height: 1400 }, scaleFactor: 1.25 }
    expect(displayAt([primary, above], (d) => d.bounds, { x: 100, y: -300 })?.label).toBe('VG27B')
    expect(displayAt([primary, above], (d) => d.bounds, { x: 100, y: 300 })?.label).toBe('Dell U2720Q')
    expect(displayAt([primary, above], (d) => d.bounds, { x: 5000, y: 300 })).toBeNull()
  })

  it('środek poza monitorami: najbliższy monitor, w jego obszarze roboczym', () => {
    const p = placementAfterDrag({ x: 1900, y: 900, width: 480, height: 64 }, [primary, second], 64, false)
    // The middle (2140, 932) is below the second monitor (720 high) – it is the nearest.
    expect(p.display.label).toBe('LG')
    expect(p.offset).toEqual({ x: 0, y: 672 - 64 })
  })
})

describe('adres regulatedday:// (tylko w ścisłym formacie)', () => {
  it('panel z linią i dniem', () => {
    expect(parseAppUrl('regulatedday://panel', 'regulatedday')).toEqual({ line: null, day: null })
    expect(parseAppUrl('regulatedday://panel/', 'regulatedday')).toEqual({ line: null, day: null })
    expect(parseAppUrl('regulatedday://panel?line=next-2026-10-25-b1&day=2026-10-25', 'regulatedday')).toEqual({ line: 'next-2026-10-25-b1', day: '2026-10-25' })
    expect(appUrl('regulatedday', { line: 'x1', day: '2026-10-25' })).toBe('regulatedday://panel?line=x1&day=2026-10-25')
  })

  it('linie paska z dwukropkiem (powiadomienia „5 min przed”, pytania) przechodzą w obie strony (A4-03)', () => {
    for (const line of ['wait:k3j2h1g0f9e8d7c6', 'next:2026-10-28:k3j2h1g0f9e8d7c6:1', 'reserve:2026-10-28:head:1020']) {
      expect(urlFromArgv(['app.exe', appUrl('regulatedday', { line, day: '2026-10-28' })], 'regulatedday')).toEqual({ line, day: '2026-10-28' })
    }
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

describe('ustawienia Windows z przycisku (A4-09)', () => {
  it('lista priorytetowa: Asystent koncentracji przed kompilacją 22621, Powiadomienia od niej', async () => {
    const { systemSettingsUrl } = await import('@shared/systemSettings')
    expect(systemSettingsUrl('notifications', '10.0.19045')).toBe('ms-settings:quiethours')
    expect(systemSettingsUrl('notifications', '10.0.22000')).toBe('ms-settings:quiethours')
    expect(systemSettingsUrl('notifications', '10.0.22631')).toBe('ms-settings:notifications')
    expect(systemSettingsUrl('taskbar', '10.0.19045')).toBe('ms-settings:taskbar')
  })
})
