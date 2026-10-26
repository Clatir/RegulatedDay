// adapted from FI src/renderer/store/ui.ts @ de81f2b
/**
 * The main window's route and its messages (toasts). A deletion's message has „Cofnij” for 10 s (spec „Usuwanie”).
 */
import { create } from 'zustand'
import { commitActiveField } from '../lib/commit'

export type Page = 'today' | 'calendar' | 'requests' | 'templates' | 'routines' | 'room' | 'history' | 'settings' | 'trial'

export const PAGES: Page[] = ['today', 'calendar', 'requests', 'templates', 'routines', 'room', 'history', 'settings', 'trial']

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
  /** How long it stays (ms). */
  ms: number
}

interface UiState {
  page: Page
  toasts: Toast[]
}

export const useUi = create<UiState>(() => ({ page: 'today', toasts: [] }))

/** Every change of view first commits the active field (spec „Zatwierdzanie przed przejściem”). */
export function navigate(page: Page): void {
  commitActiveField()
  useUi.setState({ page })
}

let nextToast = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function closeToast(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 5000, action?: Toast['action']): number {
  const id = nextToast++
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, ms, action }] }))
  timers.set(
    id,
    setTimeout(() => closeToast(id), ms)
  )
  return id
}

/** How long a deletion can be undone (spec „Usuwanie”). */
export const UNDO_MS = 10_000

/** A deletion done: its message with „Cofnij” for 10 s. */
export function undoToast(text: string, undo: () => void): number {
  return toast(text, 'info', UNDO_MS, { label: 'Cofnij', run: undo })
}
