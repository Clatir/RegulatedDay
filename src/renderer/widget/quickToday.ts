/**
 * The logical day the preview of the quick capture's words of dates counts from (D454): the main process's, the clock
 * `hub.quickAdd` saves with – not the window's own `Date.now()`. Asked again when the field opens, when typing starts
 * (the field was empty) and when the window is shown (`reload`); until the answer comes (or without one) – no preview.
 */
import { useCallback, useEffect, useState } from 'react'

export function useQuickToday(empty: boolean): { today: string | null; reload: () => void } {
  const [today, setToday] = useState<string | null>(null)
  const reload = useCallback(() => {
    void window.rd
      .quickToday()
      .then(setToday)
      .catch(() => setToday(null))
  }, [])
  useEffect(reload, [reload, empty])
  return { today, reload }
}
