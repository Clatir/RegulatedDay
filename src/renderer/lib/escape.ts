/**
 * One order of Esc (spec „Edycja pól”): Esc first cancels the edit of a field (the field stops it there), the next Esc
 * closes the innermost open thing – a menu, a dialog, the variants – and only then the window's own (the icon's panel
 * closes). Every layer registers here; one listener of the window calls the newest.
 */
import { useEffect, useRef } from 'react'

type Layer = { id: number; close: () => void }
const layers: Layer[] = []
let nextId = 1
let windowEscape: (() => void) | null = null

export function onEscapeLayer(close: () => void): () => void {
  const layer = { id: nextId++, close }
  layers.push(layer)
  return () => {
    const i = layers.findIndex((l) => l.id === layer.id)
    if (i >= 0) layers.splice(i, 1)
  }
}

/** The window's own Esc (after every layer): the panel closes, nothing in the main window. */
export function setWindowEscape(fn: (() => void) | null): void {
  windowEscape = fn
}

/** Handles Esc of the window; true = something closed. */
export function handleEscape(): boolean {
  const top = layers.pop()
  if (top) {
    top.close()
    return true
  }
  if (windowEscape) {
    windowEscape()
    return true
  }
  return false
}

export function installEscape(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (handleEscape()) e.preventDefault()
  })
}

/**
 * Open dialogs (aria-modal), the newest last: the pages' own shortcuts (Ctrl+N, Ctrl+1 …) wait while one is open, and
 * only the newest keeps Tab inside it (A6-21).
 */
const modals: number[] = []
let nextModal = 1

export function onModal(): { id: number; off: () => void } {
  const id = nextModal++
  modals.push(id)
  return {
    id,
    off: () => {
      const i = modals.indexOf(id)
      if (i >= 0) modals.splice(i, 1)
    }
  }
}

export const modalOpen = (): boolean => modals.length > 0
export const topModal = (): number | null => modals.at(-1) ?? null

/** Ctrl+N of a page (spec „Tworzenie”): one way for every page, waiting while a dialog is open (A6-21). */
export function useNewShortcut(create: () => void): void {
  const ref = useRef(create)
  ref.current = create
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.code !== 'KeyN' || modalOpen()) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Tab inside a dialog (A6-21): from its last element to its first, Shift+Tab from its first (or the box) to its last;
 * null – the browser's own step. `index` −1: the focus is on the box itself or outside.
 */
export function tabTarget(count: number, index: number, shift: boolean): number | null {
  if (count === 0) return -1
  if (shift && index <= 0) return count - 1
  if (!shift && (index === count - 1 || index < 0)) return 0
  return null
}

/** A layer while `open`: Esc closes it. */
export function useEscapeLayer(open: boolean, close: () => void): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!open) return
    return onEscapeLayer(() => ref.current())
  }, [open])
}
