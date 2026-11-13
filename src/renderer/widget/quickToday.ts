/**
 * The logical day the preview of the quick capture's words of dates counts from (D454): the main process's, the clock
 * `hub.quickAdd` saves with – not the window's own `Date.now()`. Asked again when the field opens, at every change of the
 * text (a word typed after 04:00 counts from the new day) and while the text stays – every 30 s (04:00 passing under a
 * field left alone, D455), and when the window is shown (`reload`); until the answer comes (or without one) – no preview.
 */
import { useCallback, useEffect, useState } from 'react'

/** How often a field with a text typed asks again – the preview is at most this far from the day the save counts. */
export const QUICK_TODAY_REREAD_MS = 30_000

export function useQuickToday(text: string): { today: string | null; reload: () => void } {
  const [today, setToday] = useState<string | null>(null)
  const reload = useCallback(() => {
    void window.rd
      .quickToday()
      .then(setToday)
      .catch(() => setToday(null))
  }, [])
  useEffect(reload, [reload, text])
  const typed = text !== ''
  useEffect(() => {
    if (!typed) return
    const timer = setInterval(reload, QUICK_TODAY_REREAD_MS)
    return () => clearInterval(timer)
  }, [reload, typed])
  return { today, reload }
}
