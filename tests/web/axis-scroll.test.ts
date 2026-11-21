/**
 * Where the axes stand when their page opens (D563, P6): today – „teraz” a third of the way down the visible part; another day –
 * from an hour before the wake; nothing known – the page stays.
 */
import { describe, expect, it } from 'vitest'
import { scrollTopFor, type AxisScrollInput } from '@renderer/lib/axisScroll'

const base: AxisScrollInput = { axisTop: 200, nowY: null, wakeY: null, hourPx: 66, reserved: 0, viewH: 600 }

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
})
