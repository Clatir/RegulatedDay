/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619) – the writes of the two windows: the blocks of a day (the selection of „Zmień N bloków”, or the
 * whole plan from the menu of the day) as a new version of a template from a date, or as a new routine. The day is read and counted in the turn of
 * the write (A6-01 – never what the window drew) and judged by `engine/saveAs.ts`; one edit of the template – „Zastąp” takes the blocks it drops out
 * of the template with their attachments, as „Usuń z szablonu” (D415, `withAttachments`). Said in the line of the view (`showGroupLine` – the line
 * Ctrl+Z presses too): „Zapisano 3 bloki w szablonie „Roboczy” od 25.11 · Cofnij”, „Zapisano rutynę „Poranek” · 4 kroki · Cofnij”. „Cofnij” of a
 * template puts its version from the date back as it was (none – gone), when that version still stands as the save left it; of a routine – the
 * routine out, when it still stands as made. Changed since – it stays, and says so (D313).
 */
import type { EditOutcome, RawRecord } from '@shared/api'
import { deepEqual, sameContentAs } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { blocksToSave, sameVersionBody, savedTemplate, templateBlocksOf, wakeFrameOf, type SaveAsMode, type SaveAsPick, type SaveAsWhy } from '@shared/engine/saveAs'
import { countLabel, plDayMonth } from '@shared/format'
import { groupCount, skippedText } from '@shared/groupText'
import { ATTACHMENTS_UNREAD_TEXT, restoreEdits, type AttachmentUndo } from '@shared/model/attachment'
import { templateJson } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import { isSessionEntry, templateFrom, templateVersionOn } from '@shared/model/plan'
import { ROUTINE_SCHEMA, type RoutineStep } from '@shared/model/routines'
import { seriesOfBlock } from '@shared/model/series'
import { addDays } from '@shared/time/zone'
import { editOf, isSaved, outcomeFate, rawRecord, trySaveWith, useData, withOwner, type SendState } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { showGroupLine, UndoNotDone, type GroupView } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { withAttachments } from '../templates/templateActions'
import { moveUncountedText, moveUnreadableText } from '../week/weekMove'
import { cleanSteps } from './thingForms'

/** The block is taken off the day's plan (parked or cancelled before it began): it does not go (D615). */
export const offIn =
  (day: Pick<DayModel, 'state'>) =>
  (id: string): boolean => {
    const f = day.state.facts.blocks.get(id)
    return f != null && f.startedAt == null && (f.parkedAt != null || f.cancelledAt != null)
  }

/** The blocks of `day` that go, with the words of those that do not – one rule for the window and the write. */
export function pickOf(day: Pick<DayModel, 'date' | 'state' | 'ctx'>, ids: readonly string[] | null): SaveAsPick {
  const series = useData.getState().series
  return blocksToSave(day.ctx.plan, ids, { off: offIn(day), ofSeries: (b) => seriesOfBlock(series, b, day.date) != null })
}

/** „Pominięto 2 bloki (seria, sesja)” – what the window says of the blocks left out; null – none. */
export function skippedNote(skipped: readonly SaveAsWhy[]): string | null {
  if (!skipped.length) return null
  return `Pominięto ${groupCount(skipped.length, 'block')} (${[...new Set(skipped)].join(', ')})`
}

/** The first day a save may start from: tomorrow (today is made already) – also for a window opened before 04:00 and saved after it. */
export const firstFrom = (): string => {
  const today = useData.getState().view?.today
  return today ? addDays(today, 1) : ''
}

/** The title of the task of „Sprawy” that names a block (a template has no task: its title becomes the block's name). */
const taskTitle = (id: string): string | null => useData.getState().requests.find((r) => r.id === id)?.title ?? null

/** The text of the line after a save to a template. */
export function templateLineText(d: { added: number; name: string; from: string; skipped: readonly SaveAsWhy[]; inTemplate: number }): string {
  const parts = [`Zapisano ${groupCount(d.added, 'block')} w szablonie „${d.name}” od ${plDayMonth(d.from)}`]
  const skipped = skippedText(d.skipped)
  if (skipped) parts.push(skipped)
  if (d.inTemplate > 0) parts.push(`${d.inTemplate} już w szablonie`)
  return parts.join(' · ')
}

export interface TemplateSaveArgs {
  date: string
  /** The selected blocks; null – the whole plan of the day. */
  ids: readonly string[] | null
  templateId: string
  from: string
  mode: SaveAsMode
  /** The line the save is said in. */
  view: GroupView
  /** The window's clock (tests); left out – now. */
  at?: number
}

/**
 * What became of a save (the windows close on all but `refused`): `saved` – written or waiting for the folder (the line with „Cofnij”); `unchanged` –
 * nothing to write (the template has those blocks already, none of the day's go) – said in the corner; `asked` – it met a change on another computer
 * (your answer to the question decides it), or it was sent and its result is not known: never sent again from the window – a second „Zapisz” would
 * write it twice; `refused` – nothing written (the day, the template or the list of attachments unreadable, the folder refused it) – said why, the
 * window stays.
 */
export type SaveFate = 'saved' | 'unchanged' | 'asked' | 'refused'

/** The fate of a save of one record by its first entry (`out` null – not sent, or sent with the result unknown: `state.afterSend`). */
function fateOf(out: readonly EditOutcome[] | null, state: SendState): Exclude<SaveFate, 'unchanged'> {
  if (out == null) return state.afterSend ? 'asked' : 'refused'
  return outcomeFate(out[0])
}

/** What a save to a template came to: `saved` – the template's version written (`fate` 'saved'). */
export interface TemplateSaveDone {
  saved: boolean
  fate: SaveFate
  added: number
  skipped: SaveAsWhy[]
  inTemplate: number
}

/**
 * The blocks of the day `date` into the template's version from `from` (D615–D617) – one edit; then the line with „Cofnij”. Nothing to save, the
 * template as it is already, the day or the template unreadable, the list of attachments unreadable while „Zastąp” would take a block's attachments
 * – said in the corner, nothing written.
 */
export async function saveAsTemplate(args: TemplateSaveArgs): Promise<TemplateSaveDone> {
  // Never before tomorrow: a window opened before 04:00 would else write a version from today, which is made already.
  const first = firstFrom()
  const a = first && args.from < first ? { ...args, from: first } : args
  const rel = paths.record('template', a.templateId)
  const made = { before: null as RawRecord | null, after: null as RawRecord | null, attachments: null as AttachmentUndo | null, name: '', added: 0, skipped: [] as SaveAsWhy[], inTemplate: 0, unread: false, same: false }
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles([a.date])
    if (!(a.date in files)) throw new Error(moveUnreadableText(a.date))
    const day = await countedDay(a.date, files[a.date] ?? null, a.at ?? Date.now())
    if (!day) throw new Error(moveUncountedText(a.date))
    const before = rawRecord(rel)
    const t = before ? templateFrom(before) : null
    if (!before || !t) throw new Error('tego szablonu nie ma już')
    const pick = pickOf(day, a.ids)
    const version = templateVersionOn(t, a.from)
    const allIds = new Set(t.versions.flatMap((v) => v.blocks.map((b) => b.id)))
    const tpl = templateBlocksOf(pick.take, day.ctx.plan, { date: a.date, templateId: a.templateId, version, mode: a.mode, newId: () => newId(10), taskTitle, wake: wakeFrameOf(day.snapshot, day.dayFile, a.date, useData.getState().templates), allIds })
    Object.assign(made, { name: t.name, skipped: [...pick.skipped, ...tpl.left], inTemplate: tpl.inTemplate, added: tpl.blocks.length })
    if (!tpl.blocks.length) return []
    const next = savedTemplate(t, a.from, tpl.blocks, a.mode)
    const after = templateJson(next, before)
    const edit = editOf(rel, before, after)
    // The version the days from `from` take is what they took before (the same blocks, perhaps in another order): nothing to write – no new version.
    const nowIn = templateVersionOn(next, a.from)
    if (!edit || (version && nowIn && sameVersionBody(version, nowIn))) {
      made.same = true
      return []
    }
    // „Zastąp” that takes a block out of the version may take its attachments with it (D415 – which, the list says): not while the list cannot be
    // read (unknown is never „none”, T848), as „Usuń z szablonu”.
    const drops = a.mode === 'replace' && (version?.blocks ?? []).some((b) => !isSessionEntry(b) && !tpl.blocks.some((x) => x.id === b.id))
    if (drops && useData.getState().view?.attachmentsUnread) {
      made.unread = true
      return []
    }
    const w = await withAttachments(edit, a.templateId, t, next)
    Object.assign(made, { before, after, attachments: w.undo })
    return w.entries
  }, state)
  const done: TemplateSaveDone = { saved: false, fate: 'refused', added: made.added, skipped: made.skipped, inTemplate: made.inTemplate }
  if (made.unread) {
    toast(ATTACHMENTS_UNREAD_TEXT, 'error', 8000)
    return done
  }
  if (out && !out.length) {
    if (made.same) toast(`Szablon „${made.name}” ma już te bloki od ${plDayMonth(a.from)} – bez zmian`, 'info')
    else if (made.name) toast([made.inTemplate ? `Bez zmian – ${made.inTemplate} już w szablonie` : 'Bez zmian – nie ma bloków do zapisania', ...(made.skipped.length ? [skippedText(made.skipped)!] : [])].join(' · '), 'info')
    return { ...done, fate: made.name !== '' ? 'unchanged' : 'refused' }
  }
  // The template's change is the first entry (an attachment's record that met a question is not it, T931).
  const fate = fateOf(out, state)
  if (fate !== 'saved' || !made.before || !made.after) return { ...done, fate }
  const { before, after, attachments } = made
  showGroupLine(a.view, { text: templateLineText({ ...made, from: a.from }), undo: () => undoTemplateSave(rel, a.from, before, after, attachments) })
  return { ...done, saved: true, fate }
}

/**
 * „Cofnij” of a save to a template: the record as it stands as the save left it – back as it was; changed since elsewhere in the template (its name,
 * another version) – only its version from `from`, back as it was before (or out – it was made by the save), while that version stands as written;
 * the version changed since – it stays, and says so. The attachments the save took come back with it (T923).
 */
export async function undoTemplateSave(rel: string, from: string, before: RawRecord, after: RawRecord, attachments: AttachmentUndo | null): Promise<string | void> {
  let said: string | null = null
  const out = await trySaveWith(() => {
    const raw = rawRecord(rel)
    if (!raw) {
      said = 'Tego szablonu nie ma już – nie ma czego cofać.'
      return []
    }
    let back: RawRecord
    if (sameContentAs(raw, after)) back = before
    else {
      const t = templateFrom(raw)
      const written = templateFrom(after)?.versions.find((v) => v.from === from)
      const now = t?.versions.find((v) => v.from === from)
      if (!t || !written || !now || !deepEqual(now, written)) {
        said = `Wersja szablonu od ${plDayMonth(from)} zmieniła się od tego czasu – została, jaka jest.`
        return []
      }
      const old = templateFrom(before)?.versions.find((v) => v.from === from)
      back = templateJson({ ...t, versions: old ? t.versions.map((v) => (v.from === from ? old : v)) : t.versions.filter((v) => v.from !== from) }, raw)
    }
    const restore = attachments ? restoreEdits(useData.getState().view?.attachments ?? [], attachments) : []
    return withOwner(editOf(rel, raw, back), restore)
  })
  if (said) return said
  if (!out || (out.length > 0 && !isSaved(out.slice(0, 1)))) throw new UndoNotDone()
}

/**
 * A new routine of the steps the window shows (D618): saved as „Rutyny” and „+ Nowa…” save one (no cost of its own – „jak podkategoria”); the
 * blocks stay as they are. The line „Zapisano rutynę „Poranek” · 4 kroki · Cofnij” – „Cofnij” takes the routine out while it stands as made.
 * Answers what became of it (`SaveFate`: the window stays only when it was refused).
 */
export async function saveAsRoutine(o: { name: string; normal: readonly RoutineStep[]; worse: readonly RoutineStep[]; view: GroupView }): Promise<Exclude<SaveFate, 'unchanged'>> {
  const name = o.name.trim().slice(0, 80)
  const normal = cleanSteps(o.normal)
  if (!name || !normal.length) return 'refused'
  const id = newId()
  const rel = paths.record('routine', id)
  const record: RawRecord = { schema: ROUTINE_SCHEMA, id, name, normal, worse: cleanSteps(o.worse), archived: false }
  const state: SendState = { afterSend: false }
  const out = await trySaveWith(() => [editOf(rel, null, record)], state)
  const fate = out && !out.length ? 'refused' : fateOf(out, state)
  if (fate !== 'saved') return fate
  showGroupLine(o.view, { text: `Zapisano rutynę „${name}” · ${countLabel(normal.length, 'krok', 'kroki', 'kroków')}`, undo: () => undoRoutineSave(rel, record) })
  return 'saved'
}

/** „Cofnij” of a new routine: out while it stands as made; changed since (a step, its name) – it stays, and says so. */
export async function undoRoutineSave(rel: string, record: RawRecord): Promise<string | void> {
  let said: string | null = null
  const out = await trySaveWith(() => {
    const raw = rawRecord(rel)
    if (!raw) {
      said = 'Tej rutyny nie ma już – nie ma czego cofać.'
      return []
    }
    if (!sameContentAs(raw, record)) {
      said = 'Rutyna zmieniła się od tego czasu – została, jaka jest.'
      return []
    }
    return [editOf(rel, raw, null)]
  })
  if (said) return said
  if (!out || !isSaved(out)) throw new UndoNotDone()
}
