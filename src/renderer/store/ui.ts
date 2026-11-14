// adapted from FI src/renderer/store/ui.ts @ de81f2b
/**
 * The main window's route and its messages (toasts). A deletion's message has „Cofnij” for 10 s (spec „Usuwanie”).
 */
import { create } from 'zustand'
import type { PlanBlock } from '@shared/model/plan'
import type { SearchKind, SearchRecord } from '@shared/search'
import { commitActiveField } from '../lib/commit'

export type Page = 'today' | 'calendar' | 'week' | 'stats' | 'requests' | 'templates' | 'routines' | 'room' | 'history' | 'settings'

/** The menu's order (D362; one place: a new screen is one word here, its label and its view in `App.tsx`). */
export const PAGES: Page[] = ['today', 'calendar', 'week', 'stats', 'requests', 'templates', 'routines', 'room', 'history', 'settings']

/** What Enter in the search (Ctrl K) selects on the screen it opens (T653): taken once by that screen; kind command: do it there. */
export type SearchPick = { kind: Exclude<SearchKind, 'screen'> } & Pick<SearchRecord, 'id' | 'date' | 'parent'>

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
  /** The day whose „Strona B” step „Dalej” or „Pomiń” closed here – at once, whatever its file does (A6-15). */
  sideBClosed: string | null
  /** The month whose morning step „Cele” „Pomiń” closed here – at once, whatever the save does (D72, as „Strona B”, A6-15). */
  goalsClosed: string | null
  /** The new block not saved yet, with its day (D461: saved at its first committed field or when you leave it; Esc throws it away) – it also survives going to another screen when the exchange for it is not answered (spec „Szkice”, A6-17). */
  blockDraft: { date: string; block: PlanBlock; intended: boolean } | null
  /** What the search selected for the screen it opened (null: nothing waits). */
  pick: SearchPick | null
}

export const useUi = create<UiState>(() => ({ page: 'today', toasts: [], day: null, focus: null, movedLater: null, sideBClosed: null, goalsClosed: null, blockDraft: null, pick: null }))

export function closeSideB(date: string): void {
  useUi.setState({ sideBClosed: date })
}

export function closeGoals(month: string): void {
  useUi.setState({ goalsClosed: month })
}

/**
 * The day's new block (null: none) – clearing touches only that day's draft. `intended` (D461): made on purpose – a range dragged over
 * the axis, „Więcej” of „Tydzień”: it is saved when left even untouched; one from a bare click of the axis, „+ Blok” or Ctrl+N is
 * thrown away then (a changed field saves it at once, so a draft that is left is untouched, but for the steps).
 */
export function setBlockDraft(date: string, block: PlanBlock | null, intended = false): void {
  if (block) useUi.setState({ blockDraft: { date, block, intended } })
  else if (useUi.getState().blockDraft?.date === date) useUi.setState({ blockDraft: null })
}

/**
 * What leaving the screen or the day does to a new block not saved yet (D461): the plan screen hands in its save (the block is
 * written as it stands, like when you click elsewhere), the change of view calls it first – the view changes at once, the save
 * goes on with what the screen knew. Null: no plan screen is open.
 */
let leaveDraft: (() => void) | null = null

export function onLeaveBlockDraft(fn: (() => void) | null): void {
  leaveDraft = fn
}

/** A field of the day's new block changed (the latest draft, never one read at the render before) – a draft touched is intended. */
export function patchBlockDraft(date: string, patch: Partial<PlanBlock>): void {
  const d = useUi.getState().blockDraft
  if (d?.date === date) useUi.setState({ blockDraft: { date, block: { ...d.block, ...patch }, intended: true } })
}

export function setMovedLater(key: string): void {
  useUi.setState({ movedLater: key })
}

/** Every change of view first commits the active field (spec „Zatwierdzanie przed przejściem”). */
export function navigate(page: Page): void {
  commitActiveField()
  leaveDraft?.()
  useUi.setState({ page, pick: null })
}

/** Today's ritual brought into view (the bar's „Rytuał”, D318). */
export function openRitual(): void {
  commitActiveField()
  leaveDraft?.()
  useUi.setState({ page: 'today', day: null, focus: 'ritual', pick: null })
}

/** The plan of a day (a click in the calendar opens it, D295); null: today. Commits the active field first. */
export function openDay(day: string | null): void {
  commitActiveField()
  leaveDraft?.()
  useUi.setState({ page: 'today', day, pick: null })
}

/** The search's Enter (T653): the screen (and the day of „Dziś”) with what to select there; a hand-made move drops it. */
export function openPick(target: { page: Page; day?: string | null }, pick: SearchPick): void {
  commitActiveField()
  leaveDraft?.()
  useUi.setState({ page: target.page, ...(target.day !== undefined ? { day: target.day } : {}), pick })
}

/** The waiting pick if accept takes it – and it is gone then, so it is used once. */
export function takePick(accept: (p: SearchPick) => boolean): SearchPick | null {
  const p = useUi.getState().pick
  if (!p || !accept(p)) return null
  useUi.setState({ pick: null })
  return p
}

/**
 * The waiting pick the screen takes (`accept`), when what it points at is there (`found`). One that points at nothing – a record
 * gone meanwhile – is dropped with `missing` said, never left waiting to fire after a later sync (T653).
 */
export function takeFoundPick(accept: (p: SearchPick) => boolean, found: (p: SearchPick) => boolean, missing: string): SearchPick | null {
  const p = takePick(accept)
  if (!p) return null
  if (found(p)) return p
  toast(missing)
  return null
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
