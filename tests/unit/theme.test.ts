import { describe, expect, it } from 'vitest'
import { BRIGHTNESS_STEPS } from '@shared/machine'
import { contrast, contrastPairs, iconColor, toneColor, TONES, HIDDEN_ICON } from '@shared/theme'

describe('kontrast (Wygląd i nazwy: co najmniej 4,5:1 przy każdej jasności)', () => {
  for (const step of BRIGHTNESS_STEPS) {
    it(`jasność ${Math.round(step * 100)} %`, () => {
      const bad = contrastPairs(step)
        .map((p) => ({ ...p, ratio: contrast(p.text, p.bg) }))
        .filter((p) => p.ratio < 4.5)
        .map((p) => `${p.name}: ${p.ratio.toFixed(2)}`)
      expect(bad).toEqual([])
    })
  }
})

describe('kolor paska i ikony', () => {
  it('kroki 15 · 5 · 0 min zmieniają kolor, a cisza tylko go przyciemnia', () => {
    for (const tone of Object.keys(TONES) as Array<keyof typeof TONES>) {
      const steps = (['none', 'warm', 'five', 'zero'] as const).map((w) => toneColor(tone, w))
      expect(new Set(steps).size).toBe(4)
      expect(iconColor(tone, 'five', true, false)).not.toBe(toneColor(tone, 'five'))
    }
  })

  it('ukryty widget: ikona szara bez kroków', () => {
    expect(iconColor('praca', 'zero', false, true)).toBe(HIDDEN_ICON)
    expect(iconColor('wolne', 'none', true, true)).toBe(HIDDEN_ICON)
  })
})
