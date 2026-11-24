/**
 * A change of many subcategories and variants of „Kategorie” at once (D608, D609) in the window: ONE edit of rd.json made in the window's
 * turn from the record as it is then (T517) – the change of `model/categoryGroup.ts` (`treeGroupStep`), its dated part one change of the
 * settings from the date of the bar „od jutra / od dziś / od daty” (`withSettingsChange`; „od dziś” – today's snapshot after it, as
 * `saveSettingsChange`), the rest of rd.json at once. The line of the settings („Zmieniono 6 podkategorii · Cofnij”, `GroupLine`) takes back
 * only what still stands as the change left it – the dated part by a new change from the same date and instant – and says what stayed.
 */
import type { EditEntry, RawRecord } from '@shared/api'
import { treeGroupStep, treeGroupUndo, treeItemOf, treeKeptText, treeLineText, treeNothingText, type TreeAction, type TreeChange } from '@shared/model/categoryGroup'
import type { DayTypeId } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { editOf, logEvents, rawRecord, saveAnswer, trySaveWith, useData, type SendState } from '../../store/data'
import { retextGroupLine, showGroupLine, UndoNotDone } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { SETTINGS_UNREADABLE_TEXT } from './calendarEdits'
import { changeFrom, TODAY_UNREAD_TEXT, todayTypeNow, withSettingsChange } from './settingsStore'

/** The date (and instant, „od dziś”) the dated part applies from – the bar's (`changeFrom`). */
export interface TreeFrom {
  from: string
  at: number | null
}

/** What a change came to: the changes saved (the line's), the parts left out, its „Cofnij” (null – nothing saved). */
export interface TreeDone {
  changes: TreeChange[]
  skipped: string[]
  undo: (() => Promise<string | void>) | null
}

/** Today for a subcategory whose addition is still to come: the later of the view's day and the logical day of the clock (as „Wycofaj”). */
function todayNow(): string {
  const clock = logicalDayOf(Date.now())
  const view = useData.getState().view?.today
  return view && view > clock ? view : clock
}

/** Whether the change may write the dated settings (a cost, a place, a variant's archive) – only then „od dziś” needs today's type. */
const datedAction = (a: TreeAction, keys: readonly string[]): boolean => a.kind === 'costs' || a.kind === 'costsEach' || a.kind === 'place' || (a.kind === 'remove' && keys.some((k) => treeItemOf(k)?.kind === 'variant'))

/** „Od dziś” with today unreadable: what of a change was saved and what not (T2714) – never a guessed type of the day (A7-09). */
export const TREE_TODAY_PART_TEXT = 'Nie da się teraz odczytać dzisiejszego dnia – zapisano tylko to, co działa od razu; koszty, miejsca i warianty od dziś nie zostały zapisane. Spróbuj za chwilę albo wybierz „od jutra”.'
/** The same for „Cofnij”: the dated part not taken back now – the line stays for another try. */
export const TREE_UNDO_TODAY_TEXT = 'Nie da się teraz odczytać dzisiejszego dnia – kosztów, miejsc i wariantów od dziś nie cofnięto. Kliknij „Cofnij” jeszcze raz za chwilę.'

/**
 * Today for a change „od dziś” with a dated part: its type for the snapshot after the save (`type`, null – not „od dziś” or nothing dated);
 * `blocked` – today cannot be read now: the dated part is not saved (the part of rd.json at once is, T2714).
 */
async function todayFor(f: TreeFrom, dated: boolean): Promise<{ type: DayTypeId | null; blocked: boolean }> {
  const today = useData.getState().view?.today
  if (!dated || f.at == null || !today || f.from !== today) return { type: null, blocked: false }
  const type = await todayTypeNow(today)
  return type ? { type, blocked: false } : { type: null, blocked: true }
}

/**
 * The `made` of a new dated change: now, and never before (or equal to) a change rd.json already has – a „Cofnij” made within the same
 * millisecond as its change would otherwise be ordered by the random id and might lie under it (`changeOrder`).
 */
function madeAfter(raw: RawRecord): number {
  const list = Array.isArray(raw.settings) ? (raw.settings as unknown[]) : []
  const last = Math.max(0, ...list.map((c) => (c && typeof c === 'object' && typeof (c as { made?: unknown }).made === 'number' ? (c as { made: number }).made : 0)))
  return Math.max(Date.now(), last + 1)
}

/**
 * One save of rd.json: `make` gives what to write from the record now – none yet (a new folder: the view's `rd` is null) is `{ schema: 1 }`, as
 * „Usuń” of a subcategory (T2707); the folder's view gone (rd.json cannot be read now) – `unreadable`, nothing sent. What it sent and the answer;
 * `failed` – nothing could be sent.
 */
async function saveRdWith(
  make: (now: RawRecord) => { raw: RawRecord; patch: Record<string, unknown> | null },
  f: TreeFrom
): Promise<{ entry: EditEntry | null; answer: ReturnType<typeof saveAnswer>; patch: boolean; unreadable: boolean; failed: boolean }> {
  let entry: EditEntry | null = null
  let patch = false
  let unreadable = false
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => {
    entry = null
    patch = false
    unreadable = !useData.getState().view
    if (unreadable) return []
    const now = rawRecord('rd.json')
    const base: RawRecord = now ? { ...now } : { schema: 1 }
    const m = make(base)
    patch = m.patch != null
    // Nothing to write – nothing sent (a folder without rd.json gets none made for nothing).
    if (m.raw === base && !m.patch) return []
    entry = editOf('rd.json', now, m.patch ? withSettingsChange(m.raw, m.patch, f.from, f.at, madeAfter(base)) : m.raw)
    return [entry]
  }, state)
  // Nothing sent (an error before the queue took it – the save's message said why, T2713): not „nothing to change”.
  return { entry, answer: saveAnswer(out, state), patch, unreadable, failed: out == null && !state.afterSend }
}

/**
 * „Zmień N” (D609): `a` on the elements `keys` (`treeItemOf`), the dated part from `f` (default – the bar's date). Something saved – the line of
 * the settings with „Cofnij”; nothing to change – a message (with what was left out); rd.json unreadable – a message. Null – nothing saved.
 */
export async function changeTreeGroup(keys: readonly string[], a: TreeAction, f?: TreeFrom): Promise<TreeDone | null> {
  const today = useData.getState().view?.today
  if (!today || !keys.length) return null
  const when = f ?? changeFrom(today)
  const day = await todayFor(when, datedAction(a, keys))
  let changes: TreeChange[] = []
  let skipped: string[] = []
  let held = 0
  const r = await saveRdWith((now) => {
    const step = treeGroupStep(now, keys, a, when, todayNow())
    // Today unreadable „od dziś”: only the part of rd.json at once goes (T2714).
    changes = day.blocked ? step.changes.filter((c) => !c.dated) : step.changes
    held = step.changes.length - changes.length
    skipped = step.skipped
    return { raw: step.raw, patch: day.blocked ? null : step.patch }
  }, when)
  if (r.failed) return null
  if (r.unreadable) {
    toast(SETTINGS_UNREADABLE_TEXT, 'error', 6000)
    return null
  }
  if (!r.entry || !changes.length) {
    if (held) toast(TODAY_UNREAD_TEXT, 'error', 8000)
    else toast(treeNothingText(skipped, a.kind), 'info')
    return null
  }
  // The part held back is said whatever became of the rest (T2718).
  if (held) toast(TREE_TODAY_PART_TEXT, 'error', 10_000)
  // A question (the banner asks) or a refusal – the save said why; no line.
  if (r.answer !== true) return { changes, skipped, undo: null }
  // The snapshot of today only after a dated part was written.
  if (day.type && r.patch) await logEvents([{ k: 'day.snapshot', day: today, at: when.at!, dayType: day.type, reason: 'today' }])
  const undo = undoOf(when, a.kind, changes)
  showGroupLine('settings', { text: treeLineText(a.kind, changes, skipped), undo })
  return { changes, skipped, undo }
}

/**
 * The line's „Cofnij” (D567 p.4): each change back while it still stands as it was left – rd.json's fields by fields, the dated ones by a new
 * change from the same date and instant („od dziś” – a new snapshot of today). What stayed is said (`treeKeptText`). Nothing sent, rd.json
 * unreadable now, the save refused or today unreadable for the dated part („od dziś”) – the line stays for another try with only what is left
 * (`UndoNotDone`); a question – the banner asks, the line goes.
 */
function undoOf(f: TreeFrom, kind: TreeAction['kind'], changes: readonly TreeChange[]): () => Promise<string | void> {
  let pending = [...changes]
  let keptAll: TreeChange[] = []
  let restoredAll = 0
  const undo = async (): Promise<string | void> => {
    const day = await todayFor(f, pending.some((c) => c.dated))
    const now = day.blocked ? pending.filter((c) => !c.dated) : pending
    const waiting = day.blocked ? pending.filter((c) => c.dated) : []
    if (!now.length) {
      toast(TREE_UNDO_TODAY_TEXT, 'error', 10_000)
      throw new UndoNotDone()
    }
    let restored: TreeChange[] = []
    let kept: TreeChange[] = []
    const r = await saveRdWith((raw) => {
      const u = treeGroupUndo(raw, now, f, todayNow())
      restored = u.restored
      kept = u.kept
      return { raw: u.raw, patch: u.patch }
    }, f)
    if (r.failed) throw new UndoNotDone()
    if (r.unreadable) {
      toast(SETTINGS_UNREADABLE_TEXT, 'error', 6000)
      throw new UndoNotDone()
    }
    if (r.entry && r.answer === false) throw new UndoNotDone()
    keptAll = [...keptAll, ...kept]
    restoredAll += restored.length
    pending = waiting
    if (r.entry && r.answer === true && day.type && r.patch) await logEvents([{ k: 'day.snapshot', day: f.from, at: f.at!, dayType: day.type, reason: 'today' }])
    if (waiting.length) {
      // The line says what is left to take back (T2720): „Usunięto 1 wariant · resztę cofnięto”.
      retextGroupLine('settings', undo, [treeLineText(kind, waiting, []), ...(restored.length ? ['resztę cofnięto'] : [])].join(' · '))
      toast(TREE_UNDO_TODAY_TEXT, 'error', 10_000)
      throw new UndoNotDone()
    }
    return keptAll.length ? treeKeptText(keptAll, restoredAll) : undefined
  }
  return undo
}
