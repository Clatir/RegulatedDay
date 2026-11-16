/**
 * The menu of the right button and of Shift+F10 (D528): „Zmień 4 bloki” – a window of the application in HTML (never the system's menu,
 * never the Electron `Menu`), over the page in a portal. Opened at a point (`menuPoint`: the pointer, or the element for a key) and cut
 * to the window. Entries: items (a ✓ when every selected one has the value, „—” when only some, a reason in the tooltip when disabled,
 * a submenu), separators, and a field with its own text and Enter („własna liczba minut”). Keys: ↑ ↓ (skip the disabled, wrap), Home /
 * End, Enter / Space pick, → opens a submenu, ← closes it, Tab closes; Esc is a layer of the Esc order (`escape.ts` – a submenu first,
 * then the menu), a press outside closes. The focus goes back to the element the menu was opened from. While it is open the pages'
 * own shortcuts wait (`onModal`, like a dialog).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { isEditable } from '../lib/deleteKey'
import { handleEscape, onModal, useEscapeLayer } from '../lib/escape'
import { useOutsidePointer } from '../lib/outside'
import { cx } from './ui'

/** A pick of the menu. `check`: every selected one has the value ('all' – ✓) or only some do ('some' – „—”). */
export interface MenuItem {
  kind?: 'item'
  label: string
  check?: 'all' | 'some'
  /** The reason it does not apply to any of the selected ones – the item is disabled and says it in its tooltip. */
  disabled?: string
  submenu?: readonly MenuEntry[]
  onPick?: () => void
  /** The menu stays open after the pick (the item changes something the menu shows). */
  keepOpen?: boolean
  testId?: string
}

export interface MenuSeparator {
  kind: 'separator'
}

/** An item with a field of its own: Enter hands the text to `onSubmit`; it answers a reason (the menu stays, the reason is shown) or nothing (done, the menu closes). */
export interface MenuField {
  kind: 'field'
  label: string
  placeholder?: string
  initial?: string
  disabled?: string
  onSubmit: (text: string) => string | void
  testId?: string
}

export type MenuEntry = MenuItem | MenuSeparator | MenuField

const MARGIN = 8
/** The key that opens the menu from the keyboard: Shift+F10 or the menu key. */
export const isMenuKey = (ev: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey?: boolean }): boolean =>
  ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey)

/** Where a menu opens: at the pointer of a mouse event, for a key (no pointer – a click event of 0, 0) at the element's lower left. */
export function menuPoint(ev: { clientX?: number; clientY?: number } | null | undefined, from: Element | null): { x: number; y: number } {
  if (ev && ev.clientX !== undefined && ev.clientY !== undefined && (ev.clientX !== 0 || ev.clientY !== 0)) return { x: ev.clientX, y: ev.clientY }
  const r = from?.getBoundingClientRect()
  return r ? { x: r.left + 8, y: r.bottom } : { x: MARGIN, y: MARGIN }
}

/**
 * The right button and the menu key on an element (D528) as the two handlers every screen puts on it (`{...menuBind(open)}`): `open` gets where the menu
 * stands – the pointer, or the element's lower left for a key. A field inside the element keeps its own menu; the key counts on the element itself only
 * (not on what is in it).
 */
export function menuBind(open: (at: { x: number; y: number }) => void): {
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
} {
  return {
    onContextMenu: (e) => {
      if (isEditable(e.target)) return
      e.preventDefault()
      open(menuPoint(e.nativeEvent, e.currentTarget))
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget || !isMenuKey(e)) return
      e.preventDefault()
      open(menuPoint(null, e.currentTarget))
    }
  }
}

/** A menu of `size` opened at `at`, kept inside the window. */
export function menuPlace(at: { x: number; y: number }, size: { w: number; h: number }, view: { width: number; height: number }): { left: number; top: number } {
  return {
    left: Math.max(MARGIN, Math.min(at.x, view.width - size.w - MARGIN)),
    top: Math.max(MARGIN, Math.min(at.y, view.height - size.h - MARGIN))
  }
}

/** A submenu of `size` beside the item `parent`: to its right, to its left when there is no room, level with it – kept inside the window. */
export function submenuPlace(parent: { left: number; right: number; top: number }, size: { w: number; h: number }, view: { width: number; height: number }): { left: number; top: number } {
  const right = parent.right - 2
  const left = right + size.w + MARGIN <= view.width ? right : Math.max(MARGIN, parent.left - size.w + 2)
  return { left, top: Math.max(MARGIN, Math.min(parent.top - 4, view.height - size.h - MARGIN)) }
}

/** The next enabled index from `from` (−1: none yet) by `step`, wrapping; −1 when nothing is enabled. */
export function moveIndex(enabled: readonly boolean[], from: number, step: 1 | -1): number {
  const n = enabled.length
  const start = from < 0 ? (step === 1 ? -1 : n) : from
  for (let k = 1; k <= n; k++) {
    const i = (((start + step * k) % n) + n) % n
    if (enabled[i]) return i
  }
  return -1
}

/** Keeps an event of the menu from the opener's tree (the portal's events travel up it). */
const swallow = (e: { stopPropagation: () => void }): void => e.stopPropagation()
const usable = (e: MenuEntry): boolean => e.kind !== 'separator' && !e.disabled
const MENU = '[data-context-menu]'

export function ContextMenu({ title, at, items, onClose, testId = 'context-menu' }: { title: string; at: { x: number; y: number }; items: readonly MenuEntry[]; onClose: () => void; testId?: string }) {
  // Where the focus was when the menu opened (read in the first render, before the menu takes the focus).
  const [origin] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const closing = useRef(onClose)
  closing.current = onClose
  useEscapeLayer(true, onClose)
  useOutsidePointer(true, MENU, onClose)
  useEffect(() => {
    const modal = onModal()
    const away = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(MENU)) return
      closing.current()
    }
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => {
      modal.off()
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
      // Back to where it was – unless something opened by the pick (a dialog) has the focus already.
      const now = document.activeElement
      if (origin?.isConnected && (!now || now === document.body)) origin.focus()
    }
  }, [origin])
  return createPortal(<MenuList label={title} title={title} entries={items} anchor={{ at }} closeAll={onClose} focusFirst testId={testId} />, document.body)
}

type Anchor = { at: { x: number; y: number } } | { rect: { left: number; right: number; top: number } }

interface Open {
  index: number
  rect: { left: number; right: number; top: number }
  focusFirst: boolean
}

function MenuList({
  label,
  title,
  entries,
  anchor,
  closeAll,
  onBack,
  focusFirst,
  testId
}: {
  label: string
  title?: string
  entries: readonly MenuEntry[]
  anchor: Anchor
  closeAll: () => void
  /** A submenu: closes just it (← and Esc). */
  onBack?: () => void
  focusFirst: boolean
  testId?: string
}) {
  const enabled = entries.map(usable)
  const root = useRef<HTMLDivElement>(null)
  const nodes = useRef<Array<HTMLElement | null>>([])
  const [active, setActive] = useState(() => (focusFirst ? moveIndex(enabled, -1, 1) : -1))
  const [sub, setSub] = useState<Open | null>(null)
  const [error, setError] = useState<{ index: number; text: string } | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number }>(() => ('at' in anchor ? { left: anchor.at.x, top: anchor.at.y } : { left: anchor.rect.right, top: anchor.rect.top }))
  useEscapeLayer(onBack != null, () => onBack?.())

  // Cut to the window once the size is known (before the first paint).
  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect()
    if (!r) return
    const size = { w: r.width, h: r.height }
    const view = { width: window.innerWidth, height: window.innerHeight }
    const next = 'at' in anchor ? menuPlace(anchor.at, size, view) : submenuPlace(anchor.rect, size, view)
    if (next.left !== place.left || next.top !== place.top) setPlace(next)
  })
  useEffect(() => {
    nodes.current[active]?.focus({ preventScroll: true })
  }, [active])

  const openSub = (index: number, focus: boolean) => {
    const e = entries[index]
    const el = nodes.current[index]
    if (!e || e.kind === 'separator' || e.kind === 'field' || !e.submenu || e.disabled || !el) return
    const r = el.getBoundingClientRect()
    setActive(index)
    setSub({ index, rect: { left: r.left, right: r.right, top: r.top }, focusFirst: focus })
  }
  const pick = (index: number) => {
    const e = entries[index]
    if (!e || e.kind === 'separator' || e.kind === 'field' || e.disabled) return
    if (e.submenu) return openSub(index, true)
    e.onPick?.()
    if (!e.keepOpen) closeAll()
  }
  const submit = (index: number, text: string) => {
    const e = entries[index]
    if (!e || e.kind !== 'field') return
    const reason = e.onSubmit(text)
    if (typeof reason === 'string') setError({ index, text: reason })
    else closeAll()
  }

  const onKeyDown = (ev: ReactKeyboardEvent) => {
    // No key of the menu is the opener's (React events of a portal travel up the opener's tree – Enter, Shift+F10, Esc …): none goes on.
    // Esc is the Esc order's, answered here, since the window's listener cannot hear it once it is stopped.
    ev.stopPropagation()
    if (ev.key === 'Escape') {
      if (handleEscape(ev.nativeEvent)) ev.preventDefault()
      return
    }
    // Keys of a submenu bubble through the React tree: only the list the key came from answers.
    if (!(ev.target instanceof Element) || ev.target.closest(MENU) !== root.current) return
    const inField = ev.target instanceof HTMLInputElement
    const to = (i: number) => {
      ev.preventDefault()
      if (i >= 0) {
        setSub(null)
        setActive(i)
      }
    }
    switch (ev.key) {
      case 'ArrowDown':
        return to(moveIndex(enabled, active, 1))
      case 'ArrowUp':
        return to(moveIndex(enabled, active, -1))
      case 'Home':
        if (inField) return
        return to(moveIndex(enabled, -1, 1))
      case 'End':
        if (inField) return
        return to(moveIndex(enabled, enabled.length, -1))
      case 'ArrowRight':
        if (inField || active < 0) return
        ev.preventDefault()
        return openSub(active, true)
      case 'ArrowLeft':
        if (inField || !onBack) return
        ev.preventDefault()
        return onBack()
      case 'Enter':
      case ' ':
        if (inField) return
        ev.preventDefault()
        return active >= 0 ? pick(active) : undefined
      case 'Tab':
        ev.preventDefault()
        return closeAll()
    }
  }

  return (
    <>
      <div
        ref={root}
        role="menu"
        aria-label={label}
        data-context-menu=""
        data-testid={testId}
        className="fixed z-50 flex min-w-[200px] flex-col overflow-y-auto rounded border border-line-strong bg-panel py-1 text-[12.5px] shadow-lg"
        style={{ left: place.left, top: place.top, maxHeight: window.innerHeight - 2 * MARGIN }}
        onKeyDown={onKeyDown}
        // Nothing that happens here is of the element the menu opened from (a drag, a selection, a new window on the grid, a double click).
        onKeyUp={swallow}
        onPointerDown={swallow}
        onPointerUp={swallow}
        onMouseDown={swallow}
        onMouseUp={swallow}
        onClick={swallow}
        onDoubleClick={swallow}
        onAuxClick={swallow}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {title && (
          <div aria-hidden="true" className="px-3 pb-1 pt-0.5 text-[11.5px] text-muted">
            {title}
          </div>
        )}
        {entries.map((e, i) => {
          if (e.kind === 'separator') return <div key={i} role="separator" className="my-1 border-t border-line" />
          if (e.kind === 'field') {
            return (
              <div key={i} role="none" title={e.disabled} className={cx('flex flex-col', e.disabled && 'text-muted')}>
                <div className="flex items-center gap-2 px-2 py-1">
                  <span className="w-4 shrink-0" aria-hidden="true" />
                  <span aria-hidden="true">{e.label}</span>
                  <input
                    ref={(el) => void (nodes.current[i] = el)}
                    type="text"
                    className="input min-w-0 flex-1 px-1.5 py-0.5"
                    aria-label={e.label}
                    placeholder={e.placeholder}
                    defaultValue={e.initial}
                    disabled={!!e.disabled}
                    data-testid={e.testId}
                    onFocus={() => setActive(i)}
                    onChange={() => setError(null)}
                    onKeyDown={(ev) => {
                      if (ev.key !== 'Enter') return
                      ev.preventDefault()
                      ev.stopPropagation()
                      submit(i, ev.currentTarget.value)
                    }}
                  />
                </div>
                {error?.index === i && (
                  <div role="alert" className="pb-1 pl-8 pr-2 text-[11.5px] text-rose">
                    {error.text}
                  </div>
                )}
              </div>
            )
          }
          const open = sub?.index === i
          return (
            <div key={i} className="contents">
              <div
                ref={(el) => void (nodes.current[i] = el)}
                role={e.check ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={e.check ? (e.check === 'all' ? true : 'mixed') : undefined}
                aria-disabled={e.disabled ? true : undefined}
                aria-haspopup={e.submenu ? 'menu' : undefined}
                aria-expanded={e.submenu ? open : undefined}
                tabIndex={-1}
                title={e.disabled}
                data-testid={e.testId}
                className={cx('flex cursor-default items-center gap-2 px-2 py-1 outline-none', e.disabled ? 'text-muted' : 'focus:bg-raised', open && 'bg-raised')}
                onClick={() => pick(i)}
                onPointerEnter={() => {
                  if (e.disabled) return setSub(null)
                  // The focus of a field being typed in stays where it is.
                  if (!(document.activeElement instanceof HTMLInputElement && root.current?.contains(document.activeElement))) setActive(i)
                  if (e.submenu) openSub(i, false)
                  else setSub(null)
                }}
              >
                <span className="w-4 shrink-0 text-center" aria-hidden="true">
                  {e.check === 'all' ? '✓' : e.check === 'some' ? '—' : ''}
                </span>
                <span className="flex-1">{e.label}</span>
                {e.submenu && <span aria-hidden="true">›</span>}
              </div>
              {open && sub && e.submenu && (
                <MenuList
                  label={e.label}
                  entries={e.submenu}
                  anchor={{ rect: sub.rect }}
                  closeAll={closeAll}
                  focusFirst={sub.focusFirst}
                  onBack={() => {
                    setSub(null)
                    nodes.current[i]?.focus({ preventScroll: true })
                  }}
                  testId={e.testId ? `${e.testId}-menu` : undefined}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
