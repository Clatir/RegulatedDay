/**
 * The cause of a pool going below the reserve on a tile (N20, T2560–T2570): the ring in the pool's colour (`ReserveRing`) and the hint
 * under the pointer „Tu głowa schodzi poniżej rezerwy (28 → 19)” – one for the axis of „Dziś” and the columns of „3 dni” and „Tydzień”.
 * The hint is `ReserveCauseHint`: a small window over the page (a portal) that stays while the pointer or the focus is on the tile or in the
 * window, with a slot for an action – `children` (N3: „Wstaw regenerację tutaj” stands there). What counts and where is `@shared/engine/reserveCause`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ReserveCause } from '@shared/engine/reserveCause'
import { POOL_COLOR, POOL_NAME } from './energyDraw'

/**
 * The ring of a tile that is a cause (T2560): inside its edge, in the colour of the first pool that goes below the reserve there. A layer of its own
 * over the tile (never the tile's own `outline` nor `box-shadow`: the focus ring, the selection and the shadow of a drag stay as they are).
 */
export function ReserveRing({ cause }: { cause: ReserveCause | undefined }) {
  if (!cause) return null
  return <span aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-[3px]" style={{ boxShadow: `inset 0 0 0 2px ${POOL_COLOR[cause.drops[0]!.pool]}` }} data-testid="reserve-ring" />
}

/** The words of the hint (T2565): „Tu głowa schodzi poniżej rezerwy (28 → 19)”; two pools – the second after „·” („bodźce schodzą poniżej rezerwy (35 → 29)”). */
export function reserveCauseText(cause: ReserveCause): string {
  const parts = cause.drops.map((d) => `${POOL_NAME[d.pool]} ${d.pool === 'emotions' || d.pool === 'senses' ? 'schodzą' : 'schodzi'} poniżej rezerwy (${d.from} → ${d.to})`)
  return `Tu ${parts.join(' · ')}`
}

/** Where the hint stands: the rectangle of the tile it is about. */
export interface HintAnchor {
  left: number
  right: number
  top: number
  bottom: number
}

/** How long the hint waits after the pointer leaves the tile, so that the pointer can reach the window (an action in it). */
const HINT_GRACE_MS = 150
/** The widest the window gets (`max-w-[18rem]`), the height of one line of it before it is measured, the room kept from the window's edge. */
const HINT_MAX_PX = 288
const HINT_LINE_PX = 28
const HINT_EDGE_PX = 4

/** The left edge of the window: the tile's, kept inside the viewport (T2570) – never right of `viewport − width − 4`, never left of 4. */
export const hintLeft = (anchorLeft: number, width: number, viewport: number): number => Math.max(HINT_EDGE_PX, Math.min(anchorLeft, viewport - width - HINT_EDGE_PX))
/** Whether the window stands above the tile (T2570): when it fits there – the tile's top is farther from the window's top than the window is high, with its gap – else below. */
export const hintAbove = (anchorTop: number, height: number): boolean => anchorTop > height + HINT_EDGE_PX

/** Whether the element is the hint's window or in it (the focus on its action is the hint's – the tile's blur does not close it). */
const inHint = (el: EventTarget | null): boolean => el instanceof Element && el.closest('[data-reserve-hint]') != null
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** What the window has to take the focus (an action of the slot); nothing – Tab goes on as it did. */
const focusablesOf = (box: Element | null): HTMLElement[] => (box ? [...box.querySelectorAll<HTMLElement>(FOCUSABLE)] : [])

/**
 * What a tile says about its hint: the key of the tile whose hint is open and where; `show` / `hide` from the tile's pointer and focus, `hold` from
 * the window. `current(key)` – whether that tile is still a cause: the one that lost it (a recount, an edit) closes its hint, never to come back by
 * itself. `leave` – the focus goes back to the tile and the hint closes, not to open again until the tile is left (`rest`) – the way out of the
 * window by the keyboard (T2569).
 */
export function useReserveHint(current: (key: string) => boolean) {
  const [open, setOpen] = useState<{ key: string; anchor: HintAnchor } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tile = useRef<HTMLElement | null>(null)
  const quiet = useRef<string | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const still = useRef(current)
  still.current = current
  useEffect(() => {
    if (open && !still.current(open.key)) {
      clear()
      setOpen(null)
    }
  })
  // A scroll anywhere (the axis, the window – the capture phase sees them all) moves the tile away from the hint: it closes.
  const isOpen = open != null
  useEffect(() => {
    if (!isOpen) return
    const close = () => setOpen(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [isOpen])
  const show = useCallback((key: string, el: HTMLElement) => {
    clear()
    if (quiet.current === key) return
    tile.current = el
    const r = el.getBoundingClientRect()
    setOpen({ key, anchor: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })
  }, [])
  const hide = useCallback((now = false) => {
    clear()
    if (now) setOpen(null)
    // The focus on the window's action keeps it open however the pointer went.
    else timer.current = setTimeout(() => !inHint(document.activeElement) && setOpen(null), HINT_GRACE_MS)
  }, [])
  const hold = useCallback(() => clear(), [])
  /** The tile is left (the pointer, the focus): its hint may open again. */
  const rest = useCallback(() => {
    quiet.current = null
  }, [])
  const leave = useCallback(() => {
    const el = tile.current
    if (open) quiet.current = open.key
    clear()
    setOpen(null)
    el?.focus()
  }, [open])
  return { open, show, hide, hold, rest, leave, tile: () => tile.current }
}

export type ReserveHint = ReturnType<typeof useReserveHint>

/**
 * The pointer, focus and key handlers of a tile that is a cause (none for another): the hint opens under the pointer and with the focus – not
 * while a block is held (`held`: any block of the grid or the axis) – and closes after them, except when the focus goes on into the window. Tab
 * on the tile, with its hint open and something in the window to take the focus, goes into the window (T2569; the portal stands outside the
 * order of Tab). `next` – the tile's other key handler, called after.
 */
export function reserveTileProps(hint: ReserveHint, key: string, cause: ReserveCause | undefined, held: () => boolean, next?: (e: KeyboardEvent<HTMLElement>) => void) {
  if (!cause) return next ? { onKeyDown: next } : {}
  const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!held()) hint.show(key, e.currentTarget)
  }
  return {
    onMouseEnter: show,
    onMouseLeave: () => {
      hint.rest()
      hint.hide()
    },
    onFocus: show,
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (inHint(e.relatedTarget)) return
      hint.rest()
      hint.hide()
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.target === e.currentTarget && hint.open?.key === key) {
        const first = focusablesOf(document.querySelector('[data-reserve-hint]'))[0]
        if (first) {
          e.preventDefault()
          first.focus()
          return
        }
      }
      next?.(e)
    }
  }
}

/**
 * The hint of a tile that is a cause: over the page at the tile's top (above it when it fits there, else below), the words of
 * `reserveCauseText` and `children` under them (a slot for an action: N3). The pointer or the focus in the window keeps it open; the way out by the
 * keyboard (T2569): Shift+Tab from its first element – back to the tile (the hint stays), Esc and Tab from its last – back to the tile and the hint
 * closes (`leave`), the next Tab goes on from the tile as always.
 */
export function ReserveCauseHint({ id, cause, anchor, hint, children }: { id: string; cause: ReserveCause; anchor: HintAnchor; hint: ReserveHint; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(HINT_MAX_PX)
  const [height, setHeight] = useState(HINT_LINE_PX)
  // The window's own size (jsdom has none: the widest it gets, one line high).
  useLayoutEffect(() => {
    setWidth(box.current?.offsetWidth || HINT_MAX_PX)
    setHeight(box.current?.offsetHeight || HINT_LINE_PX)
  })
  const style: CSSProperties = { left: hintLeft(anchor.left, width, window.innerWidth), ...(hintAbove(anchor.top, height) ? { bottom: window.innerHeight - anchor.top + 2 } : { top: anchor.bottom + 2 }) }
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className="fixed z-50 max-w-[18rem] rounded-sm border border-line bg-bg/95 px-2 py-1 text-[11px] leading-snug text-fg shadow-lg"
      style={style}
      onMouseEnter={hint.hold}
      onMouseLeave={() => hint.hide()}
      onFocusCapture={hint.hold}
      onBlur={(e) => {
        if (!inHint(e.relatedTarget)) hint.hide()
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return
        const items = focusablesOf(e.currentTarget)
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          hint.leave()
        } else if (e.key === 'Tab' && items.length > 0) {
          const first = e.shiftKey && e.target === items[0]
          const last = !e.shiftKey && e.target === items[items.length - 1]
          if (!first && !last) return
          e.preventDefault()
          if (last) hint.leave()
          else hint.tile()?.focus()
        }
      }}
      // Nothing the window gets is the tile's (a drag, a selection) – its events travel up the tile's tree through the portal.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      data-reserve-hint=""
      data-testid={`reserve-cause-${id}`}
      data-pool={cause.drops[0]!.pool}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: POOL_COLOR[cause.drops[0]!.pool] }} aria-hidden />
        <span data-testid="reserve-cause-text">{reserveCauseText(cause)}</span>
      </div>
      {children}
    </div>,
    document.body
  )
}
