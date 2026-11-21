/**
 * „Wycofaj” of a planned change of the shared settings (UX14, E2; the rule – `shared/model/settingsWithdraw.ts`): one save of rd.json made
 * in its turn from the record as it is then (T517) – the change taken out of „settings”, so from its date what was in force before it
 * applies again. Judged on the later of the view's day and the clock's logical day: a change whose date came meanwhile (04:00 before the
 * view read the new day) is in force and stays. Its toast has „Cofnij” – the edit turned over (`inverseEdit`) only while rd.json still
 * stands as the withdrawal left it and the date has not come.
 */
import type { EditEntry } from '@shared/api'
import { deepEqual, editStands, inverseEdit, valueAt } from '@shared/data/merge'
import { plDate } from '@shared/format'
import type { SettingsChange } from '@shared/model/settings'
import { isPlannedChange, withdrawnRd, type WithdrawRefusal } from '@shared/model/settingsWithdraw'
import { logicalDayOf } from '@shared/time/day'
import { editOf, rawRecord, saveAnswer, trySaveWith, useData, type SendState } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

/** How a „Wycofaj” went: done; refused before anything was sent (said by a toast); a question or not known after the send; not saved. */
export type WithdrawOutcome = 'withdrawn' | WithdrawRefusal | 'unreadable' | 'asked' | 'failed'

export const WITHDRAW_UNREADABLE_TEXT = 'Ustawień nie da się teraz odczytać – zmiana nie została wycofana. Spróbuj za chwilę.'
export const WITHDRAW_GONE_TEXT = 'Tej zmiany już nie ma – wycofano ją wcześniej, może na innym komputerze.'
export const WITHDRAW_SESSIONS_TEXT = 'Tej zmiany nie da się wycofać tutaj – sesje są w szablonach, zmień je w „Szablonach”.'
export const withdrawnText = (from: string): string => `Wycofano zaplanowaną zmianę od ${plDate(from)}.`
export const inForceText = (from: string): string => `Tej zmiany nie da się już wycofać – obowiązuje od ${plDate(from)}. Zmień ustawienie od jutra.`

/** Today for the rule: the later of the view's day and the logical day of the clock (the view reads a new day a moment after 04:00). */
function todayNow(): string {
  const clock = logicalDayOf(Date.now())
  const view = useData.getState().view?.today
  return view && view > clock ? view : clock
}

/** „Wycofaj” of the planned change `id`; the toast says how it went („Cofnij” after a withdrawal). */
export async function withdrawPlanned(id: string): Promise<WithdrawOutcome> {
  let problem: WithdrawRefusal | 'unreadable' | null = null
  let change: SettingsChange | null = null
  let entry: EditEntry | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => {
    problem = null
    entry = null
    const now = rawRecord('rd.json')
    if (!now) {
      problem = 'unreadable'
      return []
    }
    const made = withdrawnRd(now, id, todayNow())
    change = made.change ?? null
    if ('refused' in made) {
      problem = made.refused
      return []
    }
    entry = editOf('rd.json', now, made.raw)
    return [entry]
  }, state)
  const c = change as SettingsChange | null
  const sent = entry as EditEntry | null
  if (problem === 'unreadable') toast(WITHDRAW_UNREADABLE_TEXT, 'error', 8000)
  else if (problem === 'gone') toast(WITHDRAW_GONE_TEXT, 'info', 6000)
  else if (problem === 'inForce' && c) toast(inForceText(c.from), 'info', 8000)
  else if (problem === 'sessions') toast(WITHDRAW_SESSIONS_TEXT, 'info', 8000)
  if (problem) return problem
  if (!c || !sent) return 'failed'
  // A question (the banner asks, `send` said so), not known after the send, or refused (`send` said why): no „Wycofano”.
  const answer = saveAnswer(out, state)
  if (answer !== true) return answer === 'asked' ? 'asked' : 'failed'
  undoToast(withdrawnText(c.from), () => void undoWithdraw(sent, c))
  return 'withdrawn'
}

/** How a „Cofnij” of a withdrawal went (the toast said the problems): back, its date came, rd.json changed or unreadable, the save. */
export type UndoWithdrawOutcome = 'back' | 'inForce' | 'changed' | 'unreadable' | 'asked' | 'failed'

/**
 * „Cofnij” of a withdrawal: the change put back (`inverseEdit` of the edit sent) only while rd.json stands as the withdrawal left it and
 * the change still waits for its date; already back (a second „Cofnij”) – nothing.
 */
export async function undoWithdraw(entry: EditEntry, change: SettingsChange): Promise<UndoWithdrawOutcome> {
  let problem: 'inForce' | 'changed' | 'unreadable' | 'again' | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => {
    problem = null
    const now = rawRecord('rd.json')
    if (!now) problem = 'unreadable'
    else if (!isPlannedChange(change, todayNow())) problem = 'inForce'
    else if (!editStands(entry, now, null)) problem = entry.edits.every((f) => deepEqual(valueAt(now, f.path), f.base)) ? 'again' : 'changed'
    return problem || !now ? [] : [inverseEdit(entry, now, null)]
  }, state)
  const p = problem as typeof problem
  if (p === 'unreadable') toast('Nie da się teraz cofnąć wycofania – ustawień nie można odczytać. Spróbuj za chwilę.', 'error', 10_000, { label: 'Cofnij', run: () => void undoWithdraw(entry, change) })
  else if (p === 'inForce') toast(`Nie cofnięto – data zmiany (${plDate(change.from)}) już nadeszła. Ustaw ją jeszcze raz od jutra.`, 'info', 8000)
  else if (p === 'changed') toast('Ustawienia zmieniły się od wycofania – zostają tak, jak są teraz.', 'info', 6000)
  if (p === 'again') return 'back'
  if (p) return p
  const answer = saveAnswer(out, state)
  return answer === true ? 'back' : answer === 'asked' ? 'asked' : 'failed'
}
