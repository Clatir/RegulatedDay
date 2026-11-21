/**
 * The keys of the screens of periods (D6, D563 P8): PgUp – the period before, PgDn – the next one, Home – today (the day, the week, the
 * month the screen shows by). The arrows stay as they are (they do not scroll the axis, the selection's Shift+arrows are the page's).
 * Never in a field (Home and the page keys are its caret's), never with a modifier, never while a dialog is open (A6-21).
 */
import { useEffect, useRef } from 'react'
import { isEditable } from './deleteKey'
import { modalOpen } from './escape'

export type PeriodKey = 'prev' | 'next' | 'today'

const KEYS: Record<string, PeriodKey> = { PageUp: 'prev', PageDown: 'next', Home: 'today' }

/** What the key means for a screen of periods; null – nothing (another key, a modifier, a field, a dialog open, the key already taken). */
export function periodKeyOf(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented' | 'target'>): PeriodKey | null {
  // By the key, not the physical place: the numeric pad without NumLock sends PageUp, PageDown and Home too.
  const key = KEYS[e.key]
  if (!key || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || modalOpen() || isEditable(e.target)) return null
  return key
}

/** The screen's periods: `go` is read at each key (the latest the screen has). `enabled` false – the keys wait. */
export function usePeriodKeys(go: Record<PeriodKey, () => void>, enabled = true): void {
  const ref = useRef(go)
  ref.current = go
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const key = periodKeyOf(e)
      if (!key) return
      e.preventDefault()
      ref.current[key]()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
