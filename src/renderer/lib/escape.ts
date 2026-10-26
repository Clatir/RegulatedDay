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

/** A layer while `open`: Esc closes it. */
export function useEscapeLayer(open: boolean, close: () => void): void {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!open) return
    return onEscapeLayer(() => ref.current())
  }, [open])
}
