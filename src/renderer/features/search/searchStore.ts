/** Whether the search palette (Ctrl K) is open – the window's own state, nothing in the data folder. */
import { create } from 'zustand'
import { commitActiveField } from '../../lib/commit'
import { modalOpen } from '../../lib/escape'
import { useData } from '../../store/data'
import { useWizard, wizardShown } from '../wizard/wizardStore'

export const useSearch = create<{ open: boolean }>(() => ({ open: false }))

/** Ctrl K: first commits the field being edited; with a dialog open or the wizard over the window nothing happens (as for Ctrl 1…9). */
export function openSearch(): boolean {
  const w = useWizard.getState()
  if (modalOpen() || wizardShown(w.open, w.asked, useData.getState().view?.status ?? null)) return false
  commitActiveField()
  useSearch.setState({ open: true })
  return true
}

export const closeSearch = (): void => useSearch.setState({ open: false })
