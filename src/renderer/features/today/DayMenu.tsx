/**
 * The „⋯” of the day's bar (A3): a menu of the application (`ContextMenu`) under the button – Esc and a press elsewhere close it, the
 * keys work (the first entry has the focus, ↑ ↓, Enter), the focus goes back to „⋯”. Moving the mouse away does not close it.
 */
import { useState } from 'react'
import { ContextMenu, type MenuEntry } from '../../components/ContextMenu'

const OPENER = '[data-day-menu-opener]'
/** The menu's least width (`ContextMenu` min-w): it opens with its right edge under the button's. */
const MENU_WIDTH = 220

export function DayMenu({ items }: { items: readonly MenuEntry[] }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <div className="relative">
      <button
        type="button"
        className="btn h-[26px] px-2"
        aria-label="Więcej"
        aria-haspopup="menu"
        aria-expanded={at != null}
        data-day-menu-opener=""
        data-testid="day-menu"
        onClick={(e) => {
          if (at) return setAt(null)
          const r = e.currentTarget.getBoundingClientRect()
          // The focus on the button first: the menu gives it back there (a click does not always focus a button).
          e.currentTarget.focus()
          setAt({ x: r.right - MENU_WIDTH, y: r.bottom + 4 })
        }}
      >
        ⋯
      </button>
      {at && <ContextMenu title="" label="Więcej" at={at} items={items} onClose={() => setAt(null)} keep={OPENER} testId="day-menu-list" />}
    </div>
  )
}
