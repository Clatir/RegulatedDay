/**
 * The line after a change of a selection – „Zmieniono 4 bloki · najniższa energia 52 → 44 · Cofnij” (D529, D530, D531, T1541: a line
 * of the window, never of the desktop bar). One for each view (a line of „Tydzień” does not replace the one of „Sprawy”), kept in the
 * window like `weekPush`: it outlives a change of the page and stands to the end of `UNDO_LINE_MS` from the change; the store ends it
 * itself. The next group change of the view replaces it. „Cofnij” runs the undo once (a second click while it runs does nothing), the
 * line is gone after it, and what the undo says (what it left because it changed since, D313) goes to the window's messages.
 */
import { create } from 'zustand'
import { UNDO_LINE_MS } from '@shared/widget'
import { toast } from './ui'

/**
 * The views that have a line: the bar of „Dziś”'s page, the page of a template, the columns of „Tydzień” and „3 dni”, „Sprawy”, „Kalendarz”,
 * and the settings („Przelicz koszty ×N”, D567 – in „Kategorie”).
 */
export type GroupView = 'today' | 'template' | 'week' | 'cases' | 'calendar' | 'settings'

/** Takes the change back; what it returns (if anything) is said in the window's corner – e.g. „2 bloki zmienione od tego czasu – zostały”. */
export type GroupUndo = () => string | void | Promise<string | void>

export interface GroupLineState {
  /** Which line it is (a newer one is another). */
  seq: number
  view: GroupView
  text: string
  undo: GroupUndo
  /** The instant the change was made (ms, the window's clock): „Ctrl+Z” takes the newest change first. It stays when `until` moves on after a failed undo. */
  at: number
  /** The instant it ends (ms, the window's clock). */
  until: number
  /** The undo is running – „Cofnij” does nothing meanwhile. */
  undoing: boolean
}

export const useGroupLine = create<{ lines: Partial<Record<GroupView, GroupLineState>> }>(() => ({ lines: {} }))

let seq = 0
const endings = new Map<GroupView, ReturnType<typeof setTimeout>>()

/** The text said when an undo fails (it threw): the line stays, „Cofnij” may be tried again. */
export const UNDO_FAILED_TEXT = 'Nie udało się cofnąć zmiany'

/**
 * What an undo throws when it did not take the change back (or not all of it) and has said why itself (a toast of the save, a file that cannot be
 * read now): the line stays for another try, without a second message.
 */
export class UndoNotDone extends Error {}

/**
 * The end of the line `which` of `view` at `until` (the window's clock): the timer counts what is left from now, not a whole
 * `UNDO_LINE_MS` (a line made at `now` in the past ends at its own end). A line whose undo is running is not taken away under it –
 * `undoGroupLine` ends it when the undo does.
 */
function arm(view: GroupView, which: number, until: number): void {
  const old = endings.get(view)
  if (old) clearTimeout(old)
  endings.set(
    view,
    setTimeout(
      () => {
        const line = useGroupLine.getState().lines[view]
        if (line?.seq === which && !line.undoing) clearGroupLine(view, which)
      },
      Math.max(0, until - Date.now())
    )
  )
}

/** The line of a group change in `view` from `now`; it replaces the line the view had and ends by itself `UNDO_LINE_MS` after `now`. Returns its `seq`. */
export function showGroupLine(view: GroupView, line: { text: string; undo: GroupUndo }, now = Date.now()): number {
  const which = ++seq
  const until = now + UNDO_LINE_MS
  arm(view, which, until)
  useGroupLine.setState((s) => ({ lines: { ...s.lines, [view]: { seq: which, view, text: line.text, undo: line.undo, at: now, until, undoing: false } } }))
  return which
}

/**
 * The words of the line of `view` changed – only while it is the line of `undo` (a newer change replaced it – nothing): an undo done in part says
 * what is left to take back (the line stays to its term, T2720).
 */
export function retextGroupLine(view: GroupView, undo: GroupUndo, text: string): void {
  useGroupLine.setState((s) => (s.lines[view]?.undo === undo ? { lines: { ...s.lines, [view]: { ...s.lines[view]!, text } } } : s))
}

/** How long the line still stands (ms; 0 and less – it is over, or none). */
export const groupLineLeft = (line: GroupLineState | undefined, now = Date.now()): number => (line ? line.until - now : 0)

/** The line `which` of `view` gone (a newer line stays); without `which` – whatever line the view has. */
export function clearGroupLine(view: GroupView, which?: number): void {
  const line = useGroupLine.getState().lines[view]
  if (!line || (which !== undefined && line.seq !== which)) return
  const timer = endings.get(view)
  if (timer) clearTimeout(timer)
  endings.delete(view)
  useGroupLine.setState((s) => {
    const { [view]: _gone, ...rest } = s.lines
    return { lines: rest }
  })
}

/**
 * „Cofnij” of the line of `view`: runs its undo once (while it runs, another call does nothing); afterwards the line is gone – unless a
 * newer group change replaced it meanwhile – and the undo's message, if any, is shown. The line stands while the undo runs, whatever the
 * time. An undo that throws leaves the line and says so (one that threw `UndoNotDone` has said why itself): to the end of its own term, or – when that has passed meanwhile – for a new
 * `UNDO_LINE_MS` from the failure, so there is something to try again.
 */
export async function undoGroupLine(view: GroupView): Promise<void> {
  const line = useGroupLine.getState().lines[view]
  if (!line || line.undoing) return
  const set = (undoing: boolean) =>
    useGroupLine.setState((s) => (s.lines[view]?.seq === line.seq ? { lines: { ...s.lines, [view]: { ...s.lines[view]!, undoing } } } : s))
  set(true)
  let message: string | void
  try {
    message = await line.undo()
  } catch (e) {
    const now = Date.now()
    const still = useGroupLine.getState().lines[view]
    if (still?.seq === line.seq) {
      const until = still.until > now ? still.until : now + UNDO_LINE_MS
      useGroupLine.setState((s) => ({ lines: { ...s.lines, [view]: { ...s.lines[view]!, undoing: false, until } } }))
      arm(view, line.seq, until)
    }
    if (!(e instanceof UndoNotDone)) toast(UNDO_FAILED_TEXT, 'error')
    return
  }
  clearGroupLine(view, line.seq)
  if (message) toast(message)
}
