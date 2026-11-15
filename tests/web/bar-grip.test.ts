/**
 * The desktop bar's handle without the screen (T1500): a press Windows never handed the page is read from the moves – a
 * move with the left button held after one without it over the handle – and a move without the button ends the drag.
 */
import { describe, expect, it } from 'vitest'
import { pressFromMove, releasedUnheard, type GripState } from '../../src/renderer/widget/barGrip'

const hovered: GripState = { prevButtons: 0, prevOnHandle: true, pressHeard: false }

describe('uchwyt paska pulpitu – wciśnięcie, które nie doszło do strony (E4b.12)', () => {
  it('ruch z lewym przyciskiem po ruchu bez niego nad uchwytem, bez usłyszanego wciśnięcia – to chwycenie', () => {
    expect(pressFromMove(1, hovered)).toBe(true)
    // Another button held with the left one is still the left one's press.
    expect(pressFromMove(1 | 4, hovered)).toBe(true)
  })

  it('wciśnięcie usłyszane – chwyta samo wciśnięcie, ruch już nie', () => {
    expect(pressFromMove(1, { ...hovered, pressHeard: true })).toBe(false)
  })

  it('wciśnięcie poza uchwytem (przycisk paska) i przeciągnięte nad uchwyt – nie chwyta', () => {
    expect(pressFromMove(1, { ...hovered, prevOnHandle: false })).toBe(false)
    // Moves with the button held over a button of the bar before the handle.
    expect(pressFromMove(1, { ...hovered, prevButtons: 1 })).toBe(false)
    // No move heard since the cursor came in (the button pressed outside the window).
    expect(pressFromMove(1, { ...hovered, prevButtons: null, prevOnHandle: false })).toBe(false)
  })

  it('bez lewego przycisku nic nie chwyta (prawy, sam ruch)', () => {
    expect(pressFromMove(0, hovered)).toBe(false)
    expect(pressFromMove(2, hovered)).toBe(false)
  })

  it('ruch bez lewego przycisku w trakcie przeciągania – puszczony poza zasięgiem strony', () => {
    expect(releasedUnheard(0)).toBe(true)
    // The left let go while the right is still held.
    expect(releasedUnheard(2)).toBe(true)
    expect(releasedUnheard(1)).toBe(false)
  })
})
