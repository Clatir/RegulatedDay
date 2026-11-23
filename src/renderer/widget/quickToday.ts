/**
 * The logical day and minute the preview of the quick capture's words counts from (D454, T869, D604): the main process's, the clock
 * `hub.quickAdd` saves with – not the window's own `Date.now()` – and the subcategories its „#…” may name (D600, the tree of
 * „Kategorie” as the main process has it: the window „Do skrzynki” and the bar load no settings). Asked again when the field
 * opens (with the list), at every change of the text (a word typed after 04:00 counts from the new day) and while the text stays – every 30 s
 * (04:00 passing under a field left alone, D455), and when the window is shown (`reload`); until the answer comes (or
 * without one) – no preview.
 */
import { useCallback, useEffect, useState } from 'react'
import type { QuickClock } from '@shared/api'
import type { QuickCategory } from '@shared/quickDates'

/** How often a field with a text typed asks again – the preview is at most this far from the day the save counts. */
export const QUICK_TODAY_REREAD_MS = 30_000

const NO_CATEGORIES: readonly QuickCategory[] = []

export function useQuickToday(text: string): { today: string | null; nowMin: number | null; categories: readonly QuickCategory[]; reload: () => void } {
  const [clock, setClock] = useState<QuickClock | null>(null)
  const [categories, setCategories] = useState<readonly QuickCategory[]>(NO_CATEGORIES)
  const loadDay = useCallback(() => {
    void window.rd
      .quickToday()
      .then(setClock)
      .catch(() => setClock(null))
  }, [])
  // The list comes with the first look (the field opens, the window is shown) and the 30 s – not only once a „#” is typed: the preview
  // must agree with the save from the first letter. One that cannot be had (a reply failing, a window without the call) – no subcategory
  // named, the word stays in the title as the save leaves it.
  const loadCategories = useCallback(() => {
    void Promise.resolve()
      .then(() => window.rd.quickCategories())
      .then((list) => setCategories(list ?? NO_CATEGORIES))
      .catch(() => setCategories(NO_CATEGORIES))
  }, [])
  const reload = useCallback(() => {
    loadDay()
    loadCategories()
  }, [loadDay, loadCategories])
  useEffect(loadCategories, [loadCategories])
  useEffect(loadDay, [loadDay, text])
  const typed = text !== ''
  useEffect(() => {
    if (!typed) return
    const timer = setInterval(reload, QUICK_TODAY_REREAD_MS)
    return () => clearInterval(timer)
  }, [reload, typed])
  return { today: clock?.today ?? null, nowMin: clock?.nowMin ?? null, categories, reload }
}
