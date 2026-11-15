/**
 * The model of selecting many (D527, spec „Zaznaczanie wielu i zmiany grupowe”): which elements of a screen are selected and how a
 * click, Ctrl+click, Shift+click and Shift+arrows change it. Pure – no React, no DOM; the screen gives the `order` (the axis by
 * start, a list of „Sprawy” in its own order, the days of the calendar) and a hook keeps the state (`lib/useSelection`).
 *
 * `ids` is always in the order of the screen without repeats (an id outside the order – another list of „Sprawy” – stays after
 * the ones in it). `anchor` is the element last clicked (Shift+click and Shift+arrows reach from it), `cursor` the far end of the
 * range, `base` what was selected before the range: a Shift range replaces the previous range, never the `base`.
 */

export interface Selection {
  ids: string[]
  anchor: string | null
  cursor: string | null
  base: string[]
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null, cursor: null, base: [] }

/** The keys held at a click. */
export interface ClickKeys {
  ctrl: boolean
  shift: boolean
}

/** `ids` in the order of `order` (those outside it keep their relative order, after the rest), without repeats. */
function ordered(ids: Iterable<string>, order: readonly string[]): string[] {
  const set = new Set(ids)
  const inOrder = order.filter((id) => set.has(id))
  const seen = new Set(inOrder)
  return [...inOrder, ...[...set].filter((id) => !seen.has(id))]
}

/** The elements from `a` to `b` inclusive, either way round, in the order; empty when one of them is not in it. */
export function inRange(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  return i < 0 || j < 0 ? [] : order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** What was selected before the range plus the range from the anchor to `end`. */
function withRange(state: Selection, end: string, order: readonly string[]): Selection {
  const range = inRange(order, state.anchor!, end)
  return { ids: ordered([...state.base, ...range], order), anchor: state.anchor, cursor: end, base: state.base }
}

const single = (id: string): Selection => ({ ids: [id], anchor: id, cursor: id, base: [id] })

/**
 * A click on `id` (D527): plain – only it, and it is the anchor; Ctrl – it is added or taken off, and it is the anchor; Shift
 * (also with Ctrl) – the range from the anchor to it joins what was selected before the range; a further Shift+click from the same
 * anchor replaces the range. Shift with no anchor (or one the order does not know) acts as a plain click.
 */
export function clickSelect(state: Selection, id: string, keys: ClickKeys, order: readonly string[]): Selection {
  if (keys.shift) {
    if (state.anchor == null || !order.includes(state.anchor) || !order.includes(id)) return single(id)
    return withRange(state, id, order)
  }
  if (keys.ctrl) {
    const ids = state.ids.includes(id) ? state.ids.filter((x) => x !== id) : ordered([...state.ids, id], order)
    return { ids, anchor: id, cursor: id, base: ids }
  }
  return single(id)
}

/**
 * Shift+arrow (`step` −1 up / left, +1 down / right; a grid of days – a whole row, ±7): the far end of the range moves by `step` from the
 * anchor, cut to the ends of the order; already at an end (or the step is 0) – the same state.
 */
export function extendSelect(state: Selection, step: number, order: readonly string[]): Selection {
  if (state.anchor == null || !order.includes(state.anchor)) return state
  const from = state.cursor != null && order.includes(state.cursor) ? state.cursor : state.anchor
  const at = order.indexOf(from)
  const to = Math.max(0, Math.min(order.length - 1, at + step))
  return to === at ? state : withRange(state, order[to]!, order)
}

/** Ctrl+A: everything in the order; the anchor stays when `previous` had one that is in it. */
export function selectAll(order: readonly string[], previous: Selection = EMPTY_SELECTION): Selection {
  const keep = (id: string | null): string | null => (id != null && order.includes(id) ? id : null)
  return { ids: [...order], anchor: keep(previous.anchor), cursor: keep(previous.cursor), base: [...order] }
}

/** Esc, a change of the day or the screen: nothing selected. */
export function clearSelect(): Selection {
  return { ids: [], anchor: null, cursor: null, base: [] }
}

/** Only the elements still `present` stay; an anchor that is gone is null. The same object when nothing changed. */
export function pruneSelect(state: Selection, present: Iterable<string>): Selection {
  const here = present instanceof Set ? (present as Set<string>) : new Set(present)
  const ids = state.ids.filter((id) => here.has(id))
  const base = state.base.filter((id) => here.has(id))
  const anchor = state.anchor != null && here.has(state.anchor) ? state.anchor : null
  const cursor = state.cursor != null && here.has(state.cursor) ? state.cursor : null
  if (ids.length === state.ids.length && base.length === state.base.length && anchor === state.anchor && cursor === state.cursor) return state
  return ids.length ? { ids, anchor, cursor, base } : EMPTY_SELECTION
}

/** The right button on `id` (D528): on a selected element the selection stays whole, on another one it is only that element. */
export function contextSelect(state: Selection, id: string): Selection {
  return state.ids.includes(id) ? state : single(id)
}

/** What the selected ones have in common for a ✓ or a „—” of the menu (D528): all of them · some · none. */
export function triState(values: readonly boolean[]): 'all' | 'some' | 'none' {
  const yes = values.filter(Boolean).length
  return yes === 0 ? 'none' : yes === values.length ? 'all' : 'some'
}
