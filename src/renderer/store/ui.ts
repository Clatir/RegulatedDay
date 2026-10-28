// adapted from FI src/renderer/store/ui.ts @ de81f2b
/**
 * The main window's route and its messages (toasts). A deletion's message has „Cofnij” for 10 s (spec „Usuwanie”).
 */
import { create } from 'zustand'
import type { PlanBlock } from '@shared/model/plan'
import { commitActiveField } from '../lib/commit'

export type Page = 'today' | 'calendar' | 'requests' | 'templates' | 'routines' | 'room' | 'history' | 'settings'

export const PAGES: Page[] = ['today', 'calendar', 'requests', 'templates', 'routines', 'room', 'history', 'settings']

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
  /** A second way out (the second shift's „Przesuń na teraz” beside „Potwierdź”). */
  action2?: { label: string; run: () => void }
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
  /** The day whose „Strona B” step „Dalej” or „Pomiń” closed here – at once, whatever its file does (A6-15). */
  sideBClosed: string | null
  /** The new block not added yet, with its day: a form not saved survives going to another screen (spec „Szkice”, A6-17). */
  blockDraft: { date: string; block: PlanBlock } | null
}

export const useUi = create<UiState>(() => ({ page: 'today', toasts: [], day: null, focus: null, movedLater: null, sideBClosed: null, blockDraft: null }))

export function closeSideB(date: string): void {
  useUi.setState({ sideBClosed: date })
}

/** The day's new block (null: none) – clearing touches only that day's draft. */
export function setBlockDraft(date: string, block: PlanBlock | null): void {
  if (block) useUi.setState({ blockDraft: { date, block } })
  else if (useUi.getState().blockDraft?.date === date) useUi.setState({ blockDraft: null })
}

/** A field of the day's new block changed (the latest draft, never one read at the render before). */
export function patchBlockDraft(date: string, patch: Partial<PlanBlock>): void {
  const d = useUi.getState().blockDraft
  if (d?.date === date) useUi.setState({ blockDraft: { date, block: { ...d.block, ...patch } } })
}

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

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 5000, action?: Toast['action'], action2?: Toast['action2']): number {
  const id = nextToast++
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, ms, action, ...(action2 ? { action2 } : {}) }] }))
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
