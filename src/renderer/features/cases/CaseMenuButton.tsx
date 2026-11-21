/**
 * The „…” at the end of a row of „Sprawy” (UX17, D565 P25): a menu of the application (`ContextMenu`) under the button, as the „⋯” of the day's bar (`DayMenu`)
 * – the first entry has the focus, ↑ ↓ Enter work, Esc and a press elsewhere close it, the focus goes back to „…”. Every row has its own opener mark, so
 * a press on another row's „…” is an „outside” press for this menu (it closes it and opens its own).
 */
import { useId, useState } from 'react'
import { ContextMenu, menuPoint, type MenuEntry } from '../../components/ContextMenu'

export function CaseMenuButton({ items }: { items: readonly MenuEntry[] }) {
  const mark = useId()
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn h-[24px] px-2 text-[12px]"
        aria-label="Więcej o sprawie"
        title="Więcej"
        aria-haspopup="menu"
        aria-expanded={at != null}
        data-case-menu-opener={mark}
        data-testid="case-menu"
        onClick={(e) => {
          if (at) return setAt(null)
          // The focus on the button first: the menu gives it back there (a click does not always focus a button).
          e.currentTarget.focus()
          setAt(menuPoint(null, e.currentTarget))
        }}
      >
        …
      </button>
      {at && <ContextMenu title="" label="Sprawa" at={at} items={items} onClose={() => setAt(null)} keep={`[data-case-menu-opener="${mark}"]`} testId="case-menu-list-popup" />}
    </>
  )
}
