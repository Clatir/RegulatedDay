/**
 * A list pasted into „Nowe zadanie” of „Sprawy” (N11, D605, D606) without a DOM (tests in `tests/web/cases-list.test.ts`): the lines saved as
 * sprawy in one edit (`createTasks`), the toast „Dodano 5 spraw · Cofnij” and its „Cofnij” – `undoGroup` of that one edit (a sprawa changed since
 * stays, a day's file changed since stays with its sprawy; the toast after it says what went and what stayed).
 */
import { quickListSavedText, quickUndoText } from '@shared/quickList'
import { createTasks, caseAnswer, type TasksResult } from '../../store/cases'
import { undoGroup } from '../../store/casesGroup'
import type { SaveAnswer } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

/** „Cofnij” of the toast: all the sprawy of the list and their blocks, but what changed since – said in a toast of its own. */
async function undoList(r: Pick<TasksResult, 'undo'>): Promise<void> {
  const back = await undoGroup(r.undo)
  if (back.saved) toast(quickUndoText(back.restored, back.kept), 'info', 6000)
}

/** The answer in the sense of `caseAnswer` (saved – true; a refusal said by its own toast – false; sent and not known – 'asked'). */
export async function addTaskList(lines: readonly string[]): Promise<SaveAnswer> {
  const r = await createTasks(lines)
  if (r.saved) undoToast(quickListSavedText(r.ids.length, { notPlaced: r.notPlaced }), () => void undoList(r))
  return caseAnswer(r)
}
