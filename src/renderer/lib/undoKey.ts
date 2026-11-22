/**
 * Ctrl+Z in the main window (UX19, D565 P29) = „Cofnij” of the last change that is still offered: the newest of the „Cofnij” buttons on the
 * screen – the message of the corner (`Toasts`) and the lines of the pages (`GroupLine`, `WeekPushLine`, `AllDayLines`, the line of a template,
 * the card of the boundary). Each of those buttons carries `data-undo` with the instant it was made (ms; empty – no instant known, they come after
 * the dated ones); the key presses the newest button itself, so what the button does (its busy state, the line going away) is exactly what a click does.
 * The key is the page's only while the focus is not in a text field (its own undo) and no dialog or menu is open; no button – the key is left alone.
 */
import { useEffect } from 'react'
import { isEditable } from './deleteKey'
import { modalOpen } from './escape'

/** Marks a „Cofnij” button as the one Ctrl+Z may press (`data-undo`: the instant its change was made, ms; none – empty). */
export const undoMark = (at?: number): { 'data-undo': string } => ({ 'data-undo': at == null ? '' : String(Math.round(at)) })

const born = new Map<number, number>()

/** The instant a message of the corner was first drawn (the messages carry none): the newer one is the one Ctrl+Z takes first. */
export function bornOf(id: number, now = Date.now()): number {
  const known = born.get(id)
  if (known != null) return known
  // Only a few messages stand at once; the ids of the ones gone are forgotten as new ones come.
  if (born.size > 64) for (const k of [...born.keys()].slice(0, 32)) born.delete(k)
  born.set(id, now)
  return now
}

/** The „Cofnij” button Ctrl+Z would press now: the newest by `data-undo`, an enabled one; of equal ones the later in the document; null – none shown. */
export function latestUndoButton(root: ParentNode = document): HTMLButtonElement | null {
  let best: HTMLButtonElement | null = null
  let at = -1
  for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-undo]')) {
    if (b.disabled) continue
    const t = Number(b.dataset.undo || 0)
    if (t >= at) {
      best = b
      at = t
    }
  }
  return best
}

/** The key's handler: true – it pressed a „Cofnij” (the event is taken). */
export function undoKey(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.code !== 'KeyZ' || e.defaultPrevented) return false
  if (modalOpen() || isEditable(e.target)) return false
  const button = latestUndoButton()
  if (!button) return false
  e.preventDefault()
  // A held key is one press (the first); the repeats are taken so that they do not take the next change back too.
  if (!e.repeat) button.click()
  return true
}

/** The window's one listener of Ctrl+Z (`App`). */
export function useUndoKey(): void {
  useEffect(() => {
    window.addEventListener('keydown', undoKey)
    return () => window.removeEventListener('keydown', undoKey)
  }, [])
}
