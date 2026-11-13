// @vitest-environment jsdom
/**
 * The drags of a sprawa – the matrix's (`useMatrixDrag`, HKU3, D450) and the panel's (`useCaseDrag`, D384) – end without a write when
 * the pointer is lost: Esc once the drag has started, the window losing focus, a move with no button held (the release was
 * outside the window), `pointercancel`, a release over no target. The ghost and the dimming go (`drag` is null). A drop over a target
 * still writes once; a short move is a click; Esc before the drag has started is not taken from the window.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MatrixField } from '@shared/engine/casePriority'
import { useCaseDrag, type CaseDragState } from '@renderer/features/cases/useCaseDrag'
import { useMatrixDrag, type MatrixDragState } from '@renderer/features/cases/useMatrixDrag'
import type { GrabEvent } from '@renderer/features/cases/usePointerDrag'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

type Grab = (id: string, e: GrabEvent) => void
let root: Root | null = null
let host: HTMLElement | null = null
let field: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  field?.remove()
  root = host = field = null
  delete (document as { elementFromPoint?: unknown }).elementFromPoint
})

/** The matrix's hook mounted; the field `p1` is under every point of the window (`over`), or nothing (`null`). */
function mountMatrix(over: 'p1' | null) {
  field = document.createElement('section')
  field.dataset.matrixField = 'p1'
  document.body.append(field)
  ;(document as { elementFromPoint: unknown }).elementFromPoint = () => (over ? field : null)
  const out: { drag: MatrixDragState | null; grab: Grab } = { drag: null, grab: () => undefined }
  const drops: Array<[string, MatrixField]> = []
  const Probe = () => {
    const h = useMatrixDrag((id, f) => drops.push([id, f]))
    out.drag = h.drag
    out.grab = h.grab
    return null
  }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Probe)))
  return { out, drops }
}

const target = () => document.createElement('li')
const press = (out: { grab: Grab }) => act(() => out.grab('c1', { button: 0, clientX: 10, clientY: 10, target: target() }))
const ptr = (type: string, x: number, y: number, buttons = 1) => act(() => void window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, buttons, bubbles: true })))
const key = (k: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true })
  act(() => void window.dispatchEvent(e))
  return e
}

describe('przeciąganie sprawy w macierzy – koniec gestu', () => {
  it('puszczenie nad polem zapisuje raz; krótki ruch to klik – bez zapisu', () => {
    const { out, drops } = mountMatrix('p1')
    press(out)
    ptr('pointermove', 12, 11)
    expect(out.drag).toBeNull()
    ptr('pointerup', 12, 11, 0)
    expect(drops).toEqual([])
    press(out)
    ptr('pointermove', 60, 40)
    expect(out.drag).toMatchObject({ id: 'c1', target: 'p1' })
    ptr('pointerup', 60, 40, 0)
    expect(drops).toEqual([['c1', 'p1']])
    expect(out.drag).toBeNull()
  })

  it('Esc w trakcie przeciągania anuluje: duch znika, puszczenie później nic nie zapisuje; sam Esc nie dociera do reszty okna', () => {
    const { out, drops } = mountMatrix('p1')
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    press(out)
    ptr('pointermove', 60, 40)
    expect(out.drag).not.toBeNull()
    const e = key('Escape')
    expect(out.drag).toBeNull()
    expect(e.defaultPrevented).toBe(true)
    expect(seen).not.toHaveBeenCalled()
    ptr('pointermove', 70, 50)
    ptr('pointerup', 70, 50, 0)
    expect(drops).toEqual([])
    expect(out.drag).toBeNull()
    window.removeEventListener('keydown', seen)
  })

  it('Esc przed progiem ruchu to Esc okna – nie jest zabierany', () => {
    const { out } = mountMatrix('p1')
    press(out)
    expect(key('Escape').defaultPrevented).toBe(false)
  })

  it('utrata fokusu okna (blur) w trakcie przeciągania anuluje bez zapisu', () => {
    const { out, drops } = mountMatrix('p1')
    press(out)
    ptr('pointermove', 60, 40)
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(out.drag).toBeNull()
    ptr('pointerup', 60, 40, 0)
    expect(drops).toEqual([])
  })

  it('blur po samym wciśnięciu (przed progiem) nie anuluje – dalszy ruch wciąż przeciąga', () => {
    const { out, drops } = mountMatrix('p1')
    press(out)
    act(() => void window.dispatchEvent(new Event('blur')))
    ptr('pointermove', 60, 40)
    expect(out.drag).toMatchObject({ id: 'c1', target: 'p1' })
    ptr('pointerup', 60, 40, 0)
    expect(drops).toEqual([['c1', 'p1']])
  })

  it('Esc w trakcie przeciągania nie dociera do innego nasłuchu okna w fazie przechwytywania (stopImmediatePropagation)', () => {
    const { out } = mountMatrix('p1')
    press(out)
    ptr('pointermove', 60, 40)
    const other = vi.fn()
    window.addEventListener('keydown', other, true)
    key('Escape')
    window.removeEventListener('keydown', other, true)
    expect(other).not.toHaveBeenCalled()
  })

  it('ruch bez wciśniętego przycisku (puszczone poza oknem) kończy gest bez zapisu', () => {
    const { out, drops } = mountMatrix('p1')
    press(out)
    ptr('pointermove', 60, 40)
    expect(out.drag).not.toBeNull()
    ptr('pointermove', 62, 41, 0)
    expect(out.drag).toBeNull()
    ptr('pointerup', 62, 41, 0)
    expect(drops).toEqual([])
  })

  it('pointercancel i puszczenie nad niczym – bez zapisu, duch znika', () => {
    const { out, drops } = mountMatrix('p1')
    press(out)
    ptr('pointermove', 60, 40)
    ptr('pointercancel', 60, 40, 0)
    expect(out.drag).toBeNull()
    expect(drops).toEqual([])
    act(() => root!.unmount())
    root = null
    const none = mountMatrix(null)
    press(none.out)
    ptr('pointermove', 60, 40)
    expect(none.out.drag).toMatchObject({ id: 'c1', target: null })
    ptr('pointerup', 60, 40, 0)
    expect(none.drops).toEqual([])
    expect(none.out.drag).toBeNull()
  })
})

describe('przeciąganie sprawy z panelu na oś – ten sam koniec gestu', () => {
  it('Esc i blur anulują (brak osi na ekranie – cel pusty, ale gest i duch są tak samo kończone)', () => {
    const out: { drag: CaseDragState | null; grab: Grab } = { drag: null, grab: () => undefined }
    const Probe = () => {
      const h = useCaseDrag(() => undefined)
      out.drag = h.drag
      out.grab = h.grab
      return null
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(createElement(Probe)))
    press(out)
    ptr('pointermove', 60, 40)
    expect(out.drag).toMatchObject({ id: 'c1', target: null })
    key('Escape')
    expect(out.drag).toBeNull()
    press(out)
    ptr('pointermove', 60, 40)
    act(() => void window.dispatchEvent(new Event('blur')))
    expect(out.drag).toBeNull()
  })
})
