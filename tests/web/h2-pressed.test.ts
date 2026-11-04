/**
 * E6c.4 (1.0.4): the chosen felt-cost button of the ritual must be seen – a pressed `.btn` looks like the pressed
 * `.chip` (the lamp), not the `bg-raised` the button already has.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRIGHTNESS_STEPS } from '@shared/machine'
import { contrast, contrastPairs } from '@shared/theme'

const css = readFileSync('src/renderer/styles/index.css', 'utf8')
const ritual = readFileSync('src/renderer/features/ritual/RitualPanel.tsx', 'utf8')

function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`)
  if (at < 0) return ''
  return css.slice(at, css.indexOf('}', at))
}

describe('wybrany przycisk (E6c.4)', () => {
  it('.btn[aria-pressed] ma lampkę jak .chip[aria-pressed], a nie tło, które .btn już ma', () => {
    const btn = rule(".btn[aria-pressed='true']")
    const chip = rule(".chip[aria-pressed='true']")
    expect(btn).not.toBe('')
    for (const part of ['color: var(--color-lamp)', 'rgb(242 182 109 / 0.6)', 'background: var(--color-lamp-soft)']) {
      expect(chip).toContain(part)
      expect(btn).toContain(part)
    }
  })

  it('wybrany koszt w rytuale nie dostaje bg-raised (to tło ma każdy .btn)', () => {
    const act = ritual.slice(ritual.indexOf('function Act('))
    expect(act).not.toContain('bg-raised')
    expect(act).toContain('aria-pressed={pressed}')
  })

  it('lampka na miękkim tle lampki ma kontrast przy każdej jasności', () => {
    for (const step of BRIGHTNESS_STEPS) {
      const pair = contrastPairs(step).find((p) => p.name === 'lampka na miękkim tle lampka')
      expect(pair).toBeDefined()
      expect(contrast(pair!.text, pair!.bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
