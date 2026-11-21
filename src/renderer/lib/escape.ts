/**
 * One order of Esc (spec „Edycja pól”): Esc first cancels the edit of a field (the field stops it there), the next Esc
 * closes the innermost open thing – a menu, a dialog, the variants – and only then the window's own (the icon's panel
 * closes). Every layer registers here; one listener of the window calls the newest.
 */
import { useEffect, useRef } from 'react'

type Layer = { id: number; close: () => void; base: boolean; applies?: (e?: KeyboardEvent) => boolean }
const layers: Layer[] = []
let nextId = 1
let windowEscape: (() => void) | null = null

/**
 * `base`: a layer under every ordinary one, whenever it was registered (the selection of many, D527: a panel opened by the very click
 * that selected is registered in the same commit, maybe before it, and still must close first); among base layers the newest first.
 * `applies`: whether this Esc is this layer's (the key's event – with several selections on one page the one the focus is in); a layer that
 * does not apply lets the Esc through to the next one. Without an event (a call of `handleEscape()` by hand) every layer applies.
 */
export function onEscapeLayer(close: () => void, base = false, applies?: (e?: KeyboardEvent) => boolean): () => void {
  const layer = { id: nextId++, close, base, applies }
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

/** Handles Esc of the window (`e`: its event, for the layers that ask whose Esc it is); true = something closed. */
export function handleEscape(e?: KeyboardEvent): boolean {
  const mine = (l: Layer) => !l.applies || l.applies(e)
  let i = layers.findLastIndex((l) => !l.base && mine(l))
  if (i < 0) i = layers.findLastIndex((l) => l.base && mine(l))
  const top = i >= 0 ? layers.splice(i, 1)[0] : undefined
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

/** The window's one listener of Esc; the answer takes it away again (the tests). */
export function installEscape(): () => void {
  const listener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (handleEscape(e)) e.preventDefault()
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
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

/**
 * Ctrl+N of a page (spec „Tworzenie”): one way for every page, waiting while a dialog is open (A6-21). A held key (`repeat`) is not
 * another press: only the first makes a record (A5) – the repeats are taken (no browser's „new window”) and do nothing.
 */
export function useNewShortcut(create: () => void): void {
  const ref = useRef(create)
  ref.current = create
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.code !== 'KeyN' || modalOpen()) return
      e.preventDefault()
      if (e.repeat) return
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

/** A layer while `open`: Esc closes it (`base` – under the ordinary ones, `applies` – whose Esc it is; see `onEscapeLayer`). */
export function useEscapeLayer(open: boolean, close: () => void, base = false, applies?: (e?: KeyboardEvent) => boolean): void {
  const ref = useRef(close)
  ref.current = close
  const appliesRef = useRef(applies)
  appliesRef.current = applies
  useEffect(() => {
    if (!open) return
    return onEscapeLayer(
      () => ref.current(),
      base,
      (e) => appliesRef.current?.(e) ?? true
    )
  }, [open, base])
}
