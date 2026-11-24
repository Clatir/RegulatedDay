/**
 * The name of a block changed in place (N9, D430, T2552): F2 on the one selected block or a double click on its name on the tile – „Dziś”,
 * „Szablony”, „Tydzień”, „3 dni” – puts a field over the tile's name row. Enter and a click beside save it (the same fields the panel's „Nazwa”
 * writes – `name` of the block, nothing else), Esc throws it away, empty – the block is named as before (`null`, the placeholder says how). A
 * block of a series changes only this day (D430: a name changed in one day changes that day alone – no question of the scope). The field is the
 * tile's own: its keys stay in it (Esc closes only it), the mouse never reaches the tile or the axis under it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BLOCK_NAME_MAX } from '@shared/model/plan'
import { cx } from '../../components/ui'
import { isEditable } from '../../lib/deleteKey'
import { modalOpen } from '../../lib/escape'
import { NO_GRID } from './gridDrag'

/** What a tile says of its block for the field: the name of its own (empty – none) and the name it would have without one (the placeholder). */
export interface RenameInfo {
  text: string
  hint: string
}

/**
 * What the axis or the column gets of the screen (`useTileRename`): the id of the tile being renamed, whether (and as what) a block may be
 * renamed (`info` null – no field: a block begun outside the plan, one a template does not own), where to start and how to end (`text` null –
 * Esc, thrown away).
 */
export interface TimelineRename {
  active: string | null
  info: (id: string) => RenameInfo | null
  start: (id: string) => void
  finish: (id: string, text: string | null) => void
}

/**
 * What a block may be renamed as (the one rule of every screen): the block of the day or the version (`null` – none such), drawn by the axis (`drawn` – a block
 * of an unchecked calendar, a session of the sample day has no tile to put a field on); `hint` is asked only then (the name it would have without its own).
 */
export function renameInfo(b: { name?: string | null } | null | undefined, drawn: boolean, hint: () => string): RenameInfo | null {
  return b && drawn ? { text: b.name ?? '', hint: hint() } : null
}

/** The name `text` typed over `current`: what to save (`name` null – no own name), or null when the block stays as it is. */
export function renamedTo(text: string, current: string): { name: string | null } | null {
  const name = text.trim().slice(0, BLOCK_NAME_MAX)
  return name === current ? null : { name: name || null }
}

/**
 * F2 of a screen and the state of the field. `target` – the one block F2 names (the screen's selection of exactly one; none or several –
 * nothing: a name is the one block's); `info` – what a block may be renamed as (`null`: not at all); `save` – the screen's save of
 * `name` (`null` – the own name taken away); `scope` – another value (the day, the version, the week) closes the field without saving.
 */
export function useTileRename(o: { target: () => string | null; info: (id: string) => RenameInfo | null; save: (id: string, name: string | null) => unknown; scope: string }): TimelineRename {
  const [active, setActive] = useState<string | null>(null)
  const latest = useRef(o)
  latest.current = o
  useEffect(() => setActive(null), [o.scope])
  // The block that goes away (removed, its tile hidden) takes its field with it.
  const stale = active != null && o.info(active) == null
  useEffect(() => {
    if (stale) setActive(null)
  }, [stale])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F2' || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || modalOpen() || isEditable(e.target)) return
      const id = latest.current.target()
      if (id == null || latest.current.info(id) == null) return
      e.preventDefault()
      setActive(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return {
    active: stale ? null : active,
    info: o.info,
    start: (id) => {
      if (latest.current.info(id)) setActive(id)
    },
    finish: (id, text) => {
      setActive((a) => (a === id ? null : a))
      if (text == null) return
      const current = latest.current.info(id)
      const change = current ? renamedTo(text, current.text) : null
      if (change) void latest.current.save(id, change.name)
    }
  }
}

/** A click on a name waits this long for its second click before it does what a click does (a column of „Tydzień” opens the day) – a double click renames instead. */
export const DOUBLE_CLICK_MS = 300

/** What on a tile is its own control (the cost's label, a button, the handles of its edges): a click there is that control's, never the name's. */
const OWN_CONTROL = 'button, a, input, textarea, select, [role="button"], [data-cost-of], [data-edge]'

/**
 * The one wait of a grid for a second click (`DOUBLE_CLICK_MS`) before the day of the block clicked opens: `waiting` – the key of the tile whose opening waits,
 * `begin` starts it (a new one replaces the old), `cancel` ends it – any press anywhere (a window listener, only while waiting: the press of the first click comes
 * before `begin`, so it never ends its own wait), a click on a tile, F2, Esc, another week or view, the tile or the grid going away (the presses, the keys and the
 * unmount are the hook's own). The day never opens after a `cancel`.
 */
export interface OpenWait {
  waiting: string | null
  begin: (key: string, open: () => void) => void
  cancel: () => void
}
export function useOpenWait(): OpenWait {
  const [waiting, setWaiting] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setWaiting(null)
  }, [])
  const begin = useCallback((key: string, open: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    setWaiting(key)
    timer.current = setTimeout(() => {
      timer.current = null
      setWaiting(null)
      open()
    }, DOUBLE_CLICK_MS)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const pending = waiting != null
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F2') cancel()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', cancel, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', cancel, true)
    }
  }, [pending, cancel])
  return useMemo(() => ({ waiting, begin, cancel }), [waiting, begin, cancel])
}

/**
 * Whether a double click `e` on the tile `el` is one on its name (`[data-tile-name]`). The target decides when it is a part of the tile: the name, yes;
 * any other part – the hours, a control of its own such as the cost's label – no; a target outside the tile (the cost's window is a portal, its events
 * still come up the React tree) – no. Only when the target is the tile itself (a block that has the pointer captured gets its clicks so) the point
 * decides: inside the box the name fills.
 */
export function onTileName(e: { target: EventTarget | null; clientX: number; clientY: number }, el: Element): boolean {
  const name = el.querySelector('[data-tile-name]')
  if (!name) return false
  const t = e.target instanceof Element ? e.target : null
  if (t && t !== el) {
    if (!el.contains(t)) return false
    const own = t.closest(OWN_CONTROL)
    if (own && own !== el && el.contains(own)) return false
    return name.contains(t)
  }
  const inside = (r: DOMRect) => r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  // A control of the tile's own over the place (the cost's label lies over the name's row) keeps the point.
  if ([...el.querySelectorAll(OWN_CONTROL)].some((c) => inside(c.getBoundingClientRect()))) return false
  // A name that takes no room (not laid out) is no place to point at.
  return inside(name.getBoundingClientRect())
}

/**
 * The field over the name row of a tile (`style`: where). The cursor is in it with the name selected; Enter ends it with the text, Esc with
 * `null`, leaving it (a click beside, Tab) with the text – whichever comes first, once.
 */
export function TileNameField({ text, hint, compact = false, style, onDone }: { text: string; hint: string; compact?: boolean; style?: CSSProperties; onDone: (text: string | null) => void }) {
  const [draft, setDraft] = useState(text)
  const ended = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
    input.current?.select()
  }, [])
  const end = (v: string | null) => {
    if (ended.current) return
    ended.current = true
    onDone(v)
  }
  return (
    <input
      ref={input}
      value={draft}
      placeholder={hint}
      maxLength={BLOCK_NAME_MAX}
      spellCheck={false}
      aria-label="Nazwa bloku"
      title="Enter – zapisz · Esc – anuluj · puste – nazwa jak podkategoria"
      className={cx('absolute z-40 min-w-0 rounded-[3px] border border-lamp bg-panel leading-tight text-fg outline-none placeholder:text-muted', compact ? 'px-1 text-[11px]' : 'px-1.5 text-[12px]')}
      style={style}
      data-testid="tile-name"
      {...NO_GRID}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => end(draft)}
      onKeyDown={(e) => {
        // A character being composed (IME): its Enter and Esc are the composition's.
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          end(draft)
        } else if (e.key === 'Escape') {
          // Only the field closes: not the panel, not the selection (the window's Esc never hears it).
          e.preventDefault()
          e.stopPropagation()
          end(null)
        }
      }}
      // The tile and the axis under it never see the mouse of the field (a press would grab the block, a click select it or make a new one).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    />
  )
}
