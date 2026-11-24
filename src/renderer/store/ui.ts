// adapted from FI src/renderer/store/ui.ts @ de81f2b
/**
 * The main window's route and its messages (toasts). A deletion's message has „Cofnij” for 10 s (spec „Usuwanie”).
 */
import { create } from 'zustand'
import { classify, historyKey } from '@shared/data/paths'
import type { ShortNight } from '@shared/engine/shortNight'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import type { SearchKind, SearchRecord } from '@shared/search'
import { commitActiveField } from '../lib/commit'

export type Page = 'today' | 'calendar' | 'week' | 'stats' | 'requests' | 'templates' | 'routines' | 'room' | 'history' | 'settings'

/** The menu's order (D362; one place: a new screen is one word here, its label and its view in `App.tsx`). */
export const PAGES: Page[] = ['today', 'calendar', 'week', 'stats', 'requests', 'templates', 'routines', 'room', 'history', 'settings']

/** The screen a day of „Dziś” was opened from (D2, D563): the button „← Tydzień” / „← Kalendarz” there goes back to it. */
export type DayOrigin = 'week' | 'calendar'

/**
 * What the screens of periods remember for the time of the session (D2, UX8): the week of „Tydzień”, the middle day of „3 dni”, the first day of
 * „Agenda”, the month of the calendar. `null` – the current one (it goes on with the days: „Ten tydzień” sets it back).
 */
export interface ViewMemory {
  week: string | null
  anchor: string | null
  agenda: string | null
  month: string | null
}

export const NO_MEMORY: ViewMemory = { week: null, anchor: null, agenda: null, month: null }

/** What Enter in the search (Ctrl K) selects on the screen it opens (T653): taken once by that screen; kind command: do it there. */
export type SearchPick = { kind: Exclude<SearchKind, 'screen'> } & Pick<SearchRecord, 'id' | 'date' | 'parent'>

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
  /** How long it stays (ms); 0 – until it is closed (an error, UX18). */
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
  /** The day whose first check-in „Pomiń” skipped here (B5, D563): until the day changes – it does not come back with a change of screen. */
  checkinSkipped: string | null
  /**
   * The check-in's answers not saved yet, with their day (B5, D563): they survive another screen; another day starts clean, a save clears them.
   * Null at a question you have not answered (D571: the form shows its answer beforehand there – „tak” after a short night).
   */
  checkinAnswers: { date: string; answers: ReadonlyArray<Answer | null> } | null
  /**
   * The check-in of the day saved here, as it was saved (T2526): the form stays so – a fold of the card or another screen and back
   * too – until the day has its check-in (`checkinAt`), and a second „Zapisz” writes nothing.
   */
  checkinSaved: { date: string; answers: readonly Answer[]; hint: ShortNight | null } | null
  /** The day whose morning list of days not closed „Pomiń” hid here (B5, D563): until the day changes. */
  unclosedSkipped: string | null
  /** The new block not saved yet, with its day (D461: saved at its first committed field or when you leave it; Esc throws it away while untouched – `touched`: a field or a step changed, T1080) – it also survives going to another screen when the exchange for it is not answered (spec „Szkice”, A6-17). */
  blockDraft: { date: string; block: PlanBlock; intended: boolean; touched: boolean } | null
  /** What the search selected for the screen it opened (null: nothing waits). */
  pick: SearchPick | null
  /** The screen of periods the day of „Dziś” was opened from (null: from the menu, the bar or the search outside them); it stays through the days of „Dziś”. */
  from: DayOrigin | null
  /** The periods of „Tydzień”, „3 dni”, „Agenda” and the calendar as you left them (the session's). */
  memory: ViewMemory
}

export const useUi = create<UiState>(() => ({ page: 'today', toasts: [], day: null, focus: null, movedLater: null, sideBClosed: null, goalsClosed: null, checkinSkipped: null, checkinAnswers: null, checkinSaved: null, unclosedSkipped: null, blockDraft: null, pick: null, from: null, memory: NO_MEMORY }))

export function closeSideB(date: string): void {
  useUi.setState({ sideBClosed: date })
}

export function closeGoals(month: string): void {
  useUi.setState({ goalsClosed: month })
}

/** „Pomiń” of the first check-in of `date` (B5, D563). */
export function skipCheckin(date: string): void {
  useUi.setState({ checkinSkipped: date })
}

/** The check-in's answers of `date` as they stand (null: nothing to keep – a save, or the draft of another day is replaced at the first answer). */
export function setCheckinAnswers(date: string, answers: ReadonlyArray<Answer | null> | null): void {
  if (answers) useUi.setState({ checkinAnswers: { date, answers } })
  else if (useUi.getState().checkinAnswers?.date === date) useUi.setState({ checkinAnswers: null })
}

/** The check-in of `date` saved, as saved (null: the day has its check-in now – the form is gone, or comes clean if it ever comes back). */
export function setCheckinSaved(date: string, saved: { answers: readonly Answer[]; hint: ShortNight | null } | null): void {
  if (saved) useUi.setState({ checkinSaved: { date, ...saved } })
  else if (useUi.getState().checkinSaved?.date === date) useUi.setState({ checkinSaved: null })
}

/** „Pomiń” of the morning list of days not closed, on `date` – the logical day it is today (B5, D563). */
export function skipUnclosed(date: string): void {
  useUi.setState({ unclosedSkipped: date })
}

/**
 * The day's new block (null: none) – clearing touches only that day's draft. `intended` (D461, T1045): made on purpose – a range
 * dragged over the axis, „+ Blok”, Ctrl+N, „Więcej” of „Tydzień”: it is saved when left even untouched; one from a bare click of the
 * axis is thrown away then (a changed field saves it at once, so a draft that is left is untouched, but for the steps).
 */
export function setBlockDraft(date: string, block: PlanBlock | null, intended = false): void {
  if (block) useUi.setState({ blockDraft: { date, block, intended, touched: false } })
  else if (useUi.getState().blockDraft?.date === date) useUi.setState({ blockDraft: null })
}

/**
 * The day's draft of block `id` saved (the plan has its block): that draft goes – only it, as the store holds it now. The day's
 * effect that calls this may run late, with the draft of the render before: a new one made meanwhile (Ctrl+N right after) stays.
 */
export function dropSavedDraft(date: string, id: string): void {
  const d = useUi.getState().blockDraft
  if (d?.date === date && d.block.id === id) useUi.setState({ blockDraft: null })
}

/**
 * What leaving the screen or the day does to a new block not saved yet (D461): the screen with a new block (the plan of „Dziś”, the small
 * window of „Tydzień”) hands in its save (the block is written as it stands, like when you click elsewhere), the change of view
 * calls them all first – the view changes at once, the save goes on with what the screen knew. The answer takes the hand-in away.
 */
const leaveDrafts = new Set<() => void>()

export function onLeaveBlockDraft(fn: () => void): () => void {
  leaveDrafts.add(fn)
  return () => void leaveDrafts.delete(fn)
}

function leaveBlockDrafts(): void {
  for (const fn of [...leaveDrafts]) fn()
}

/**
 * A field of the day's new block changed (the latest draft, never one read at the render before) – a draft touched is intended, and
 * touched (Esc no longer throws it away, T1080) unless the change is empty (leaving saves the draft as it stands).
 */
export function patchBlockDraft(date: string, patch: Partial<PlanBlock>): void {
  const d = useUi.getState().blockDraft
  if (d?.date === date) useUi.setState({ blockDraft: { date, block: { ...d.block, ...patch }, intended: true, touched: d.touched || Object.keys(patch).length > 0 } })
}

export function setMovedLater(key: string): void {
  useUi.setState({ movedLater: key })
}

/** Remembers a period of a screen (`null` – the current one again). */
export function setMemory(patch: Partial<ViewMemory>): void {
  useUi.setState((s) => ({ memory: { ...s.memory, ...patch } }))
}

/**
 * Where a day of „Dziś” opened now comes from (D2): the screen of periods it is opened on; from „Dziś” itself it stays what it was (the arrows
 * and „Dziś” of its heading); from any other place – nowhere. Other screens have no origin. `here` false – the call is not from the screen
 * (the search, Ctrl K): no way back is offered for a jump from another screen.
 */
function originOf(target: Page, here: boolean): DayOrigin | null {
  if (target !== 'today') return null
  const { page, from } = useUi.getState()
  // On „Dziś” itself the way back stays whoever asks (the search too); `here` false only keeps a jump from another screen from offering one.
  if (page === 'today') return from
  return here && (page === 'week' || page === 'calendar') ? page : null
}

/** Every change of view first commits the active field (spec „Zatwierdzanie przed przejściem”). */
export function navigate(page: Page): void {
  commitActiveField()
  leaveBlockDrafts()
  useUi.setState({ page, pick: null, from: null })
}

/** Today's ritual brought into view (the bar's „Rytuał”, D318). */
export function openRitual(): void {
  commitActiveField()
  leaveBlockDrafts()
  useUi.setState({ page: 'today', day: null, focus: 'ritual', pick: null, from: null })
}

/** The plan of a day (a click in the calendar opens it, D295); null: today. Commits the active field first. */
export function openDay(day: string | null, here = true): void {
  commitActiveField()
  leaveBlockDrafts()
  useUi.setState({ page: 'today', day, pick: null, from: originOf('today', here) })
}

/** The search's Enter (T653): the screen (and the day of „Dziś”) with what to select there; a hand-made move drops it. */
export function openPick(target: { page: Page; day?: string | null }, pick: SearchPick, here = true): void {
  commitActiveField()
  leaveBlockDrafts()
  useUi.setState({ page: target.page, ...(target.day !== undefined ? { day: target.day } : {}), pick, from: originOf(target.page, here) })
}

/** The key of a record in „Historia” (`kind/id`, as the list there has it) for the file `rel`; null – not a record with a history (a folder, a log). */
export function historyKeyOfRel(rel: string): string | null {
  const c = classify(rel)
  if (!c || c.conflict || c.kind === 'log' || c.kind === 'presence' || c.kind === 'grades') return null
  const k = historyKey(c)
  return `${k.kind}/${k.id}`
}

/** „Historia” of one record (the file `rel`): the screen with that record chosen – used once, as a pick of the search (UX3, A9). */
export function openHistoryOf(rel: string): void {
  const id = historyKeyOfRel(rel)
  if (id) openPick({ page: 'history' }, { kind: 'history', id })
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

/** The most messages standing at once. */
const TOASTS_MAX = 4
/** An error without an action stays until „×” closes it (UX18); `ms` 0. */
const pinned = (t: Pick<Toast, 'kind' | 'ms' | 'action'>): boolean => t.kind === 'error' && t.ms === 0 && !t.action
/** What the limit may take away: an ordinary message without an action – never an error that stays (only „×” closes it) nor a „Cofnij” (it has its 10 s). */
const droppable = (t: Toast): boolean => !t.action && !pinned(t)

/**
 * A message. An identical one standing (the same text and kind, F7) is not shown twice: it stays and its time starts again. One with
 * an action („Cofnij”) is never merged – two operations with the same words each keep their own `run`. An error without an action
 * (UX18, D565 P26) has no time: it stays until „×” closes it, whatever `ms` says (the argument only keeps the callers as they are); an
 * error with an action keeps its time (the window of the „Cofnij”), and so does the refusal of a field (`refusalToast` – its words
 * stand under the field too). The limit `TOASTS_MAX` is for ordinary messages without an action: past it the oldest of them goes; an error that
 * stays and a message with an action are never dropped (the stack is longer then, for a while).
 */
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 5000, action?: Toast['action'], timed = false): number {
  const same = action ? undefined : useUi.getState().toasts.find((t) => t.text === text && t.kind === kind && !t.action)
  const stays = kind === 'error' && !action && !timed
  // An error that stays is never made to go by the same words as a refusal.
  const keeps = stays || (same != null && pinned(same))
  const id = same?.id ?? nextToast++
  const time = keeps ? 0 : ms
  clearTimeout(timers.get(id))
  timers.delete(id)
  if (same) useUi.setState((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ms: time } : t)) }))
  else {
    const all = [...useUi.getState().toasts]
    for (let out = all.findIndex(droppable); all.length >= TOASTS_MAX && out >= 0; out = all.findIndex(droppable)) {
      const [gone] = all.splice(out, 1)
      clearTimeout(timers.get(gone!.id))
      timers.delete(gone!.id)
    }
    useUi.setState({ toasts: [...all, { id, text, kind, ms: time, action }] })
  }
  if (!keeps)
    timers.set(
      id,
      setTimeout(() => closeToast(id), ms)
    )
  return id
}

/** The refusal of a field (D347): an error that goes by itself – the same words stand under the field until it is put right. */
export const refusalToast = (text: string, ms: number): number => toast(text, 'error', ms, undefined, true)

/** How long a deletion can be undone (spec „Usuwanie”). */
export const UNDO_MS = 10_000

/** A deletion done: its message with „Cofnij” for 10 s. */
export function undoToast(text: string, undo: () => void): number {
  return toast(text, 'info', UNDO_MS, { label: 'Cofnij', run: undo })
}
