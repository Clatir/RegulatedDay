/**
 * The help windows of the main window (UX15, D565 P23): the list of shortcuts (F1, „Skróty” at the bottom of the menu) and „Jak to
 * działa” (the concepts – Ctrl K, the „?” beside a concept). Only the window's own state, nothing in the data folder. They open on
 * your click or key, never by themselves (D229); a dialog already open or the wizard over the window – nothing happens (as for
 * Ctrl K), except that F1 closes the list it opened.
 */
import { create } from 'zustand'
import { commitActiveField } from '../lib/commit'
import { modalOpen } from '../lib/escape'
import { useWizard, wizardShown } from '../features/wizard/wizardStore'
import { useData } from './data'

export type HelpKind = 'shortcuts' | 'concepts'

export const useHelp = create<{ open: HelpKind | null; term: string | null }>(() => ({ open: null, term: null }))

const blocked = (): boolean => {
  const w = useWizard.getState()
  return modalOpen() || wizardShown(w.open, w.asked, useData.getState().view?.status ?? null)
}

/** Shows a help window with no guards – for the palette, which is the only dialog open when it hands over (it closes in the same step). */
export function showHelp(open: HelpKind, term: string | null = null): void {
  useHelp.setState({ open, term })
}

/** F1 and „Skróty”: the list of shortcuts; F1 again (the list open) closes it. A dialog of the page open or the wizard – false. */
export function toggleShortcuts(): boolean {
  if (useHelp.getState().open === 'shortcuts') {
    closeHelp()
    return true
  }
  if (blocked()) return false
  commitActiveField()
  showHelp('shortcuts')
  return true
}

/** „?” beside a concept and the palette's „Jak to działa”: the concepts, at `term` when given. */
export function openConcepts(term: string | null = null): boolean {
  if (useHelp.getState().open === 'concepts' || blocked()) return false
  commitActiveField()
  showHelp('concepts', term)
  return true
}

export const closeHelp = (): void => useHelp.setState({ open: null, term: null })
