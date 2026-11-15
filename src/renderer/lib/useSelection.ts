/**
 * The selection of many elements of a screen (D527): the state of `@shared/selection` kept for the screen, and its keys – Ctrl+A,
 * Shift+arrows, Esc. A screen gives the `order` of its elements (the axis by start, a list in its own order, the days of the
 * calendar) and the ids still `present` (what vanished drops out); `onItemClick` says whether the click also opens the element
 * (a plain click – yes, Ctrl or Shift – no). The screen draws the selection and clears it when its day, week, template or page
 * changes (`scope`).
 *
 * Keys of the window, heard only while `enabled`: Ctrl+A (the physical key; not in a field, a list or with a dialog open – the same
 * conditions as Del, `deleteKey.ts`), Shift+arrows of the axis the screen names. Esc is a layer of the Esc order (`escape.ts`,
 * `base`): the panel opened by the click, being a newer thing, closes first, the next Esc clears the selection.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearSelect, clickSelect, contextSelect, EMPTY_SELECTION, extendSelect, pruneSelect, selectAll as allOf, type Selection } from '@shared/selection'
import { isEditable } from './deleteKey'
import { modalOpen, useEscapeLayer } from './escape'

/** What of a click matters here (a `MouseEvent` or a React one). */
export interface ClickLike {
  ctrlKey: boolean
  shiftKey: boolean
}

export interface UseSelectionOptions {
  /** The elements of the screen in the order Shift+click and Shift+arrows go by. */
  order: readonly string[]
  /** The ids that still exist (default: `order`) – a selected one that is not here drops out (it was removed on another computer). */
  present?: readonly string[]
  /** Another value drops the selection (the day, week, template, page). */
  scope?: string | null
  /** Which Shift+arrows extend the selection: up / down (the axis, the lists), left / right (the calendar), none. Default: vertical. */
  arrows?: 'vertical' | 'horizontal' | false
  /** Whether the keys are heard at all (default yes) – a screen that is not shown does not take them. */
  enabled?: boolean
  /** An extra condition of the keys (e.g. the focus is in this list): several selections on one page do not all take Ctrl+A. */
  when?: (e: KeyboardEvent) => boolean
}

export interface SelectionApi {
  /** The selected ids, in the order of the screen. */
  selected: readonly string[]
  count: number
  isSelected: (id: string) => boolean
  /** A click on an element: changes the selection; true – the click also opens the element (a plain click). */
  onItemClick: (id: string, ev: ClickLike) => boolean
  /** The right button on an element (D528): returns the ids the menu is for (the whole selection, or only this element, selected now). */
  onItemContext: (id: string) => readonly string[]
  selectAll: () => void
  clear: () => void
  /** Shift+arrow by hand (−1 up / left, 1 down / right). */
  extend: (step: 1 | -1) => void
  /** The state itself (the anchor, for a screen that needs it – „Sprawy” selects all of the list with the anchor). */
  state: Selection
}

/** What keeps the arrows for itself: a field, a list, a slider, a group of radios, a menu, a tree, a grid … – Shift+arrow there is theirs. */
const KEEPS_ARROWS = '[role="slider"], [role="radio"], [role="radiogroup"], [role="tab"], [role="tablist"], [role="listbox"], [role="option"], [role="menu"], [role="menubar"], [role="tree"], [role="treeitem"], [role="grid"], [role="spinbutton"], [role="combobox"], [role="scrollbar"], [data-keeps-arrows]'
function keepsArrows(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.closest(KEEPS_ARROWS) != null
}

/** The state with the scope it was made in: another scope reads as an empty selection in the very render (no frame with the old one). */
interface Held {
  scope: string | null
  sel: Selection
}

export function useSelection(opts: UseSelectionOptions): SelectionApi {
  const { order, scope = null, arrows = 'vertical', enabled = true } = opts
  const present = opts.present ?? order
  const [held, setHeld] = useState<Held>({ scope, sel: EMPTY_SELECTION })
  const raw = held.scope === scope ? held.sel : EMPTY_SELECTION
  const presentKey = present.join('\u0000')
  // What vanished is off at once (in this very render), the state follows in an effect.
  const state = useMemo(() => pruneSelect(raw, present), [raw, presentKey])
  const ref = useRef(state)
  ref.current = state
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const orderRef = useRef(order)
  orderRef.current = order
  const whenRef = useRef(opts.when)
  whenRef.current = opts.when
  const set = useCallback((next: Selection) => {
    ref.current = next
    setHeld({ scope: scopeRef.current, sel: next })
  }, [])
  useEffect(() => {
    if (state !== raw || held.scope !== scope) setHeld({ scope, sel: state })
  }, [state, raw, held.scope, scope])

  const clear = useCallback(() => set(clearSelect()), [set])
  const count = state.ids.length
  // Only while this screen takes the keys, and only for an Esc that is its own (`when`): with several selections on one page the one the
  // focus is in is cleared, not the newest.
  useEscapeLayer(enabled && count > 0, clear, true, (e) => (e && whenRef.current ? whenRef.current(e) : true))

  const extend = useCallback((step: 1 | -1) => set(extendSelect(ref.current, step, orderRef.current)), [set])
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || modalOpen() || isEditable(e.target)) return
      if (whenRef.current && !whenRef.current(e)) return
      if (e.code === 'KeyA' && e.ctrlKey && !e.shiftKey) {
        if (e.repeat || orderRef.current.length === 0) return
        e.preventDefault()
        set(allOf(orderRef.current, ref.current))
        return
      }
      if (!e.shiftKey || e.ctrlKey || arrows === false || ref.current.anchor == null || keepsArrows(e.target)) return
      const step = arrows === 'vertical' ? (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0) : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (step === 0) return
      // The key is taken only when it changes something (at the end of the list it is still the page's).
      const next = extendSelect(ref.current, step, orderRef.current)
      if (next === ref.current) return
      e.preventDefault()
      set(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, arrows, set])

  const ids = useMemo(() => new Set(state.ids), [state])
  const isSelected = useCallback((id: string) => ids.has(id), [ids])
  const onItemClick = useCallback(
    (id: string, ev: ClickLike) => {
      const keys = { ctrl: ev.ctrlKey, shift: ev.shiftKey }
      set(clickSelect(ref.current, id, keys, orderRef.current))
      // A range made with Shift must not leave the page's text selected as well.
      if (keys.shift) window.getSelection()?.removeAllRanges()
      return !keys.ctrl && !keys.shift
    },
    [set]
  )
  const onItemContext = useCallback(
    (id: string) => {
      set(contextSelect(ref.current, id))
      return ref.current.ids
    },
    [set]
  )
  const selectEvery = useCallback(() => set(allOf(orderRef.current, ref.current)), [set])
  // One object while nothing changed; the functions never change.
  return useMemo(
    () => ({ selected: state.ids, count, isSelected, onItemClick, onItemContext, selectAll: selectEvery, clear, extend, state }),
    [state, count, isSelected, onItemClick, onItemContext, selectEvery, clear, extend]
  )
}
