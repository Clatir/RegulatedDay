import { describe, expect, it } from 'vitest'
import { BRIGHTNESS_STEPS } from '@shared/machine'
import { BLOCK_COLORS, contrast, contrastPairs, iconColor, PALETTE, PRIORITY_COLORS, SEASON_COLORS, themeVars, toneColor, TONES, HIDDEN_ICON } from '@shared/theme'

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

  it('nagłówek dzisiejszej kolumny „Tydzień” (miękkie tło lampki): tekst, przygaszony tekst i każdy akcent mają sprawdzony kontrast (E10)', () => {
    for (const step of BRIGHTNESS_STEPS) {
      const bg = themeVars(step)['--color-lamp-soft']!
      const texts = new Set(contrastPairs(step).filter((p) => p.bg === bg).map((p) => p.text))
      for (const t of [PALETTE.text, PALETTE.muted, PALETTE.lamp, PALETTE.rose, PALETTE.sea]) expect(texts.has(t), `${t} na ${bg} przy ${step}`).toBe(true)
    }
  })

  it('okładki kaset (D322) to kolory bloków – napis na nich ma sprawdzony kontrast', () => {
    for (const c of Object.values(SEASON_COLORS)) expect(BLOCK_COLORS).toContain(c)
  })
})

describe('paski priorytetu (D450)', () => {
  it('cztery różne kolory z palety motywu; pasek (grafika) odcina się od karty i tła okna co najmniej 3:1 przy każdej jasności', () => {
    expect(new Set(Object.values(PRIORITY_COLORS)).size).toBe(4)
    for (const step of BRIGHTNESS_STEPS) {
      const v = themeVars(step)
      for (const [p, color] of Object.entries(PRIORITY_COLORS))
        for (const bg of [v['--color-panel']!, v['--color-bg']!, v['--color-raised']!]) expect(contrast(color, bg), `${p} na ${bg} przy ${step}`).toBeGreaterThanOrEqual(3)
    }
  })
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
