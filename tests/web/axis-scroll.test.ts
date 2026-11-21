/**
 * Where the axes stand when their page opens (D563, P6): today – „teraz” a third of the way down the visible part; another day –
 * from an hour before the wake; nothing known – the page stays.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { followAxis, scrollTopFor, type AxisScrollInput } from '@renderer/lib/axisScroll'

const base: AxisScrollInput = { axisTop: 200, nowY: null, wakeY: null, hourPx: 66, reserved: 0, viewH: 600, maxTop: null }

describe('przewinięcie osi przy otwarciu (D563, P6)', () => {
  it('dziś: „teraz” stoi na 1/3 wysokości widocznej części', () => {
    // 23:18 on an axis from 04:00: the line is far down – the page goes there, the line at 200 px of 600.
    expect(scrollTopFor({ ...base, nowY: 1500 })).toBe(1300)
  })

  it('dziś rano: „teraz” blisko góry – strona zostaje u góry, nigdy ujemne przewinięcie', () => {
    expect(scrollTopFor({ ...base, nowY: 260 })).toBe(60)
    expect(scrollTopFor({ ...base, nowY: 230 })).toBe(30)
    expect(scrollTopFor({ ...base, nowY: 100 })).toBe(0)
  })

  it('przyklejony nagłówek nie zasłania: 1/3 liczone z części pod nim', () => {
    // 600 − 100 covered = 500 visible; the line a third of it below the heading: 1500 − 100 − 166.67 → 1233.
    expect(scrollTopFor({ ...base, nowY: 1500, reserved: 100 })).toBe(1233)
  })

  it('inny dzień: od godziny przed pobudką', () => {
    // Wake at 450 px, an hour = 66 px: the axis starts at 384 px (under the heading's 100 px: 284).
    expect(scrollTopFor({ ...base, wakeY: 450 })).toBe(384)
    expect(scrollTopFor({ ...base, wakeY: 450, reserved: 100 })).toBe(284)
  })

  it('inny dzień: oś zaczyna się o tej godzinie albo później – strona od góry, karty nad osią zostają', () => {
    expect(scrollTopFor({ ...base, wakeY: 266 })).toBe(0)
    expect(scrollTopFor({ ...base, wakeY: 230 })).toBe(0)
  })

  it('„teraz” ma pierwszeństwo przed pobudką', () => {
    expect(scrollTopFor({ ...base, nowY: 1500, wakeY: 450 })).toBe(1300)
  })

  it('nic nie wiadomo (brak „teraz” i pobudki): null – strona zostaje', () => {
    expect(scrollTopFor(base)).toBeNull()
  })

  it('karta-prośba nad osią: przewinięcie nie wychodzi ponad jej górę (jej górę widać)', () => {
    // „teraz” would take the page to 1300; a card whose top is at 120 stops it there.
    expect(scrollTopFor({ ...base, nowY: 1500, maxTop: 120 })).toBe(120)
    // The hour before the wake too.
    expect(scrollTopFor({ ...base, wakeY: 450, maxTop: 90 })).toBe(90)
    // A card above the target of a page that stays at the top: nothing changes.
    expect(scrollTopFor({ ...base, nowY: 100, maxTop: 120 })).toBe(0)
    // A card lower than the target: the target stands.
    expect(scrollTopFor({ ...base, nowY: 1500, maxTop: 5000 })).toBe(1300)
  })
})

describe('ponowny pomiar osi, gdy treść nad nią urośnie (followAxis)', () => {
  type Callback = () => void
  const observers: Array<{ cb: Callback; disconnected: boolean }> = []
  class FakeObserver {
    rec: { cb: Callback; disconnected: boolean }
    constructor(cb: Callback) {
      this.rec = { cb, disconnected: false }
      observers.push(this.rec)
    }
    observe(): void {}
    disconnect(): void {
      this.rec.disconnected = true
    }
  }
  afterEach(() => {
    observers.length = 0
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('zmiana wysokości treści liczy oś od nowa; pierwszy ruch użytkownika kończy', () => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const box = document.createElement('div')
    const content = document.createElement('div')
    box.append(content)
    document.body.append(box)
    const apply = vi.fn()
    const stop = followAxis(box, content, apply)
    observers[0]!.cb()
    expect(apply).toHaveBeenCalledTimes(1)
    box.dispatchEvent(new Event('wheel'))
    expect(observers[0]!.disconnected).toBe(true)
    observers[0]!.cb()
    expect(apply).toHaveBeenCalledTimes(1)
    stop()
    box.remove()
  })

  it.each(['pointerdown', 'touchstart'])('%s w pudle też kończy', (type) => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const box = document.createElement('div')
    const content = document.createElement('div')
    followAxis(box, content, vi.fn())
    box.dispatchEvent(new Event(type))
    expect(observers[0]!.disconnected).toBe(true)
  })

  it('klawisz w oknie kończy; krótkie okno po otwarciu też', () => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const box = document.createElement('div')
    const content = document.createElement('div')
    followAxis(box, content, vi.fn())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }))
    expect(observers[0]!.disconnected).toBe(true)
    followAxis(box, content, vi.fn(), 500)
    vi.advanceTimersByTime(600)
    expect(observers[1]!.disconnected).toBe(true)
  })

  it('bez ResizeObserver: nic nie robi i nie pada', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const box = document.createElement('div')
    expect(() => followAxis(box, box, vi.fn())()).not.toThrow()
  })
})
