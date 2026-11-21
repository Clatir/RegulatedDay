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
import { isPlain, type SettingsChange } from '@shared/model/settings'
import { isPlannedChange, withdrawnRd, withoutPlannedCategory, type WithdrawRefusal, type WithdrawRefused } from '@shared/model/settingsWithdraw'
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
/** A later change wrote the same list whole and holds the value (T2347). */
export const laterText = (from: string): string => `Późniejsza zmiana od ${plDate(from)} zawiera tę wartość – wycofaj najpierw ją.`
/** The change adds a subcategory (T2348): it goes with the subcategory. */
export const newCategoryText = (name: string | null): string => (name ? `Ta zmiana dodaje podkategorię „${name}” – usuń podkategorię w „Kategoriach”.` : 'Ta zmiana dodaje podkategorię – usuń ją w „Kategoriach”.')

/** What the toast of a refusal says. */
function refusalText(r: WithdrawRefused): string {
  switch (r.refused) {
    case 'gone':
      return WITHDRAW_GONE_TEXT
    case 'inForce':
      return inForceText(r.change.from)
    case 'sessions':
      return WITHDRAW_SESSIONS_TEXT
    case 'later':
      return laterText(r.later.from)
    case 'newCategory':
      return newCategoryText(r.name)
  }
}

/** Today for the rule: the later of the view's day and the logical day of the clock (the view reads a new day a moment after 04:00). */
function todayNow(): string {
  const clock = logicalDayOf(Date.now())
  const view = useData.getState().view?.today
  return view && view > clock ? view : clock
}

/** „Wycofaj” of the planned change `id`; the toast says how it went („Cofnij” after a withdrawal). */
export async function withdrawPlanned(id: string): Promise<WithdrawOutcome> {
  let problem: WithdrawRefused | 'unreadable' | null = null
  let change: SettingsChange | null = null
  let entry: EditEntry | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => {
    problem = null
    change = null
    entry = null
    const now = rawRecord('rd.json')
    if (!now) {
      problem = 'unreadable'
      return []
    }
    const made = withdrawnRd(now, id, todayNow())
    if ('refused' in made) {
      problem = made
      return []
    }
    change = made.change
    entry = editOf('rd.json', now, made.raw)
    return [entry]
  }, state)
  const p = problem as WithdrawRefused | 'unreadable' | null
  const c = change as SettingsChange | null
  const sent = entry as EditEntry | null
  if (p === 'unreadable') {
    toast(WITHDRAW_UNREADABLE_TEXT, 'error', 8000)
    return p
  }
  if (p) {
    toast(refusalText(p), 'info', p.refused === 'gone' ? 6000 : 8000)
    return p.refused
  }
  if (!c || !sent) return 'failed'
  // A question (the banner asks, `send` said so), not known after the send, or refused (`send` said why): no „Wycofano”.
  const answer = saveAnswer(out, state)
  if (answer !== true) return answer === 'asked' ? 'asked' : 'failed'
  undoToast(withdrawnText(c.from), () => void undoWithdraw(sent, c))
  return 'withdrawn'
}

/** How a „Cofnij” of a withdrawal went (the toast said the problems): back, its date came, rd.json changed or unreadable, the save. */
export type UndoWithdrawOutcome = 'back' | 'inForce' | 'changed' | 'unreadable' | 'asked' | 'failed'

/** The words of a „Cofnij”: of what (a withdrawal, a removal of a subcategory) and what to do when the date came. */
interface UndoWords {
  of: string
  again: string
}
const WITHDRAW_WORDS: UndoWords = { of: 'wycofania', again: 'Ustaw ją jeszcze raz od jutra.' }
const REMOVAL_WORDS: UndoWords = { of: 'usunięcia', again: 'Dodaj podkategorię jeszcze raz.' }

/**
 * „Cofnij” of a withdrawal (or of the removal of a subcategory whose addition was planned – `words`): the edit sent turned over
 * (`inverseEdit`) only while rd.json stands as it left it and `change` still waits for its date; already back (a second „Cofnij”) – nothing.
 */
export async function undoWithdraw(entry: EditEntry, change: SettingsChange, words: UndoWords = WITHDRAW_WORDS): Promise<UndoWithdrawOutcome> {
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
  if (p === 'unreadable') toast(`Nie da się teraz cofnąć ${words.of} – ustawień nie można odczytać. Spróbuj za chwilę.`, 'error', 10_000, { label: 'Cofnij', run: () => void undoWithdraw(entry, change, words) })
  else if (p === 'inForce') toast(`Nie cofnięto – data zmiany (${plDate(change.from)}) już nadeszła. ${words.again}`, 'info', 8000)
  else if (p === 'changed') toast(`Ustawienia zmieniły się od ${words.of} – zostają tak, jak są teraz.`, 'info', 6000)
  if (p === 'again') return 'back'
  if (p) return p
  const answer = saveAnswer(out, state)
  return answer === true ? 'back' : answer === 'asked' ? 'asked' : 'failed'
}

/** What „Usuń” of a subcategory did: removed whole (its addition was planned), archived (as always), a question or not known, not saved. */
export type SubcategoryRemoval = 'removed' | 'archived' | 'asked' | 'failed'

export const removedCategoryText = (name: string | null, from: string): string => `Usunięto podkategorię${name ? ` „${name}”` : ''} – dodana od ${plDate(from)} jeszcze nie obowiązywała.`

/**
 * „Usuń” of a subcategory in „Kategorie” (T2353), decided in the turn of the save from rd.json as it is then: one whose addition still waits
 * for its date goes whole in one save (`withoutPlannedCategory` – nothing was counted with it), with „Cofnij”; any other is archived, as
 * „Usuń” always was (its name stays in the history; rd.json made when there is none – as `saveRd`).
 */
export async function removeSubcategory(id: string): Promise<SubcategoryRemoval> {
  let added: SettingsChange | null = null
  let entry: EditEntry | null = null
  let name: string | null = null
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => {
    added = null
    entry = null
    const now = rawRecord('rd.json')
    const whole = now ? withoutPlannedCategory(now, id, todayNow()) : null
    if (now && whole) {
      added = whole.added
      const meta = isPlain(now.categories) ? now.categories[id] : null
      name = isPlain(meta) && typeof meta.name === 'string' && meta.name.trim() ? meta.name : null
      entry = editOf('rd.json', now, whole.raw)
      return [entry]
    }
    const base: Record<string, unknown> = now ? { ...now } : { schema: 1 }
    const cats = isPlain(base.categories) ? base.categories : {}
    const own = isPlain(cats[id]) ? cats[id] : {}
    return [editOf('rd.json', now, { ...base, categories: { ...cats, [id]: { ...own, archived: true } } })]
  }, state)
  const answer = saveAnswer(out, state)
  if (answer !== true) return answer === 'asked' ? 'asked' : 'failed'
  const a = added as SettingsChange | null
  const e = entry as EditEntry | null
  if (!a || !e) return 'archived'
  undoToast(removedCategoryText(name, a.from), () => void undoWithdraw(e, a, REMOVAL_WORDS))
  return 'removed'
}
