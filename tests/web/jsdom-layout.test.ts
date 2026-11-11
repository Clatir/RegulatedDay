// @vitest-environment jsdom
/**
 * The setup file gives a jsdom Range the layout ProseMirror measures (`tests/web/jsdomLayout.ts`): without it the
 * editor's scroll to the selection throws after a test and fails the run.
 */
import { describe, expect, it } from 'vitest'

describe('układ zakresu w jsdom (edytor notatki)', () => {
  it('zakres tekstu ma puste prostokąty jak element', () => {
    const p = document.createElement('p')
    p.textContent = 'abc'
    document.body.append(p)
    const range = document.createRange()
    range.setStart(p.firstChild!, 0)
    range.setEnd(p.firstChild!, 2)
    expect(range.getClientRects()).toHaveLength(0)
    expect(range.getBoundingClientRect()).toMatchObject({ top: 0, left: 0, width: 0, height: 0 })
    p.remove()
  })
})
