// adapted from FI src/renderer/store/ui.ts @ de81f2b
/**
 * The main window's route and its messages (toasts). A deletion's message has „Cofnij” for 10 s (spec „Usuwanie”).
 */
import { create } from 'zustand'
import { commitActiveField } from '../lib/commit'

export type Page = 'today' | 'calendar' | 'requests' | 'templates' | 'routines' | 'room' | 'history' | 'settings'

export const PAGES: Page[] = ['today', 'calendar', 'requests', 'templates', 'routines', 'room', 'history', 'settings']

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
  /** The day the plan screen shows (null: today). */
  day: string | null
  /** A part of the screen to bring into view once (the bar's „Rytuał”, D318). */
  focus: 'ritual' | null
  /** The move whose banner „Nie teraz” hid (D321): until the window starts again. */
  movedLater: string | null
}

export const useUi = create<UiState>(() => ({ page: 'today', toasts: [], day: null, focus: null, movedLater: null }))

export function setMovedLater(key: string): void {
  useUi.setState({ movedLater: key })
}

/** Every change of view first commits the active field (spec „Zatwierdzanie przed przejściem”). */
export function navigate(page: Page): void {
  commitActiveField()
  useUi.setState({ page })
}

/** Today's ritual brought into view (the bar's „Rytuał”, D318). */
export function openRitual(): void {
  commitActiveField()
  useUi.setState({ page: 'today', day: null, focus: 'ritual' })
}

/** The plan of a day (a click in the calendar opens it, D295); null: today. Commits the active field first. */
export function openDay(day: string | null): void {
  commitActiveField()
  useUi.setState({ page: 'today', day })
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
