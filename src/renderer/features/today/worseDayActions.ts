/**
 * „Gorszy dzień” from the morning plan (D570, D587, N4): its acceptance, its „Cofnij” and its „×”, each counted in one turn of the window's
 * writes (T517) on the day's file as it is then and the day counted on it (`countedDay`) by the pure rules of `engine/worseDay.ts`: one edit
 * of the day's file (the routines' versions, the mark), then – in the same turn, only when the approved boundary moves and the file is
 * written (`applied`; one waiting for the folder or a question could still be refused – T2546) – one approval of it in the log (as the bar
 * moves it after a regeneration), and for the acceptance its id into the mark (T2533). An approval not written is said, never pretended.
 * Nothing is blocked (D72); a refusal is said, nothing written.
 */
import type { EditOutcome, RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { setAsked } from '@shared/data/dayEdits'
import { withApprovalId, WORSE_DAY_ASKED, worseDayAccept, worseDayText, worseDayUndo, worseUndoText, type ApprovalNote, type WorseAccept, type WorseApproval, type WorseUndo } from '@shared/engine/worseDay'
import { dayFilesNow, editOf, isSaved, outcomeFate, trySaveWith, useData, type EditSender } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { toast, undoToast } from '../../store/ui'
import { saveDay } from './dayActions'

/** Why nothing was written: the day cannot be counted now (its logs are not read whole, or the bridge fails). */
export const WORSE_DAY_UNREAD = 'Dnia nie da się teraz policzyć – nic nie zapisano, spróbuj za chwilę.'

/**
 * One change of „Gorszy dzień” in one turn of the window's writes: the day's file in its turn (`seen` for one not readable now), the day
 * counted on it, the pure rule's answer – its file written as one edit, then (written) its approval of the boundary, if any, in the same turn,
 * and `withId` – the file again with the approval's id (the acceptance's mark; checked – refused for good, its „Cofnij” leaves the boundary:
 * `unlinked`); a refusal said. The answer when the file is saved (`raw` – the file as the turn left it, with the id; `note` – its approval not
 * written or not linked, and why), else null.
 */
async function change<T extends { raw: RawRecord; approve: WorseApproval | null }>(
  date: string,
  seen: RawRecord | null,
  make: (raw: RawRecord | null, day: DayModel) => T | { error: string },
  withId?: (raw: RawRecord, id: string) => RawRecord
): Promise<(T & { note: ApprovalNote }) | null> {
  const rel = paths.day(date)
  const sent: { made: T | null; after: RawRecord | null; refused: string | null; note: ApprovalNote } = { made: null, after: null, refused: null, note: null }
  // The approval goes right after the file in the same call of the turn: no other write of the window between them.
  const via: EditSender = async (list) => {
    const out: EditOutcome[] = await window.rd.edit(list)
    const made = sent.made
    const a = made?.approve
    if (!made || !a || !isSaved(out)) return out
    // Written for sure only when applied: a file that waits could be refused later, and its approval would stay without it.
    if (!out.every((o) => o.status === 'applied')) return ((sent.note = 'waiting'), out)
    let ids: string[] | void
    try {
      ids = await window.rd.logEvents([{ k: 'boundary.approve', day: date, boundary: a.boundary, auto: a.auto, plan: a.plan }])
    } catch {
      sent.note = 'failed'
      return out
    }
    if (!withId) return out
    // The approval is written; its id into the mark – without it „Cofnij” takes it as an approval made after the acceptance (it stays).
    const id = Array.isArray(ids) ? ids[0] : undefined
    const linked = id ? withId(made.raw, id) : null
    const idEdit = linked ? editOf(rel, made.raw, linked) : null
    // Refused for good (or the call failed) – `unlinked`; written or waiting for the folder – the file with the id; a question – no note.
    let fate: ReturnType<typeof outcomeFate> | 'error' = 'error'
    if (idEdit)
      try {
        const r = await window.rd.edit([idEdit])
        fate = r.some((o) => outcomeFate(o) === 'refused') ? 'refused' : r.some((o) => outcomeFate(o) === 'asked') ? 'asked' : 'saved'
      } catch {
        fate = 'error'
      }
    if (fate === 'saved') sent.after = linked
    else if (fate === 'refused' || fate === 'error') sent.note = 'unlinked'
    return out
  }
  const out = await trySaveWith(
    async () => {
      const before = (await dayFilesNow([date], () => seen))[date] ?? null
      const day = await countedDay(date, before)
      if (!day) return ((sent.refused = WORSE_DAY_UNREAD), [])
      const r = make(before, day)
      if ('error' in r) return ((sent.refused = r.error), [])
      sent.made = r
      return [editOf(rel, before, r.raw)]
    },
    undefined,
    via
  )
  if (sent.refused) toast(sent.refused, 'info')
  return sent.made && isSaved(out) ? { ...sent.made, raw: sent.after ?? sent.made.raw, note: sent.note } : null
}

/**
 * „Gorszy dzień” accepted (the button of the morning plan's header, or „Przyjmij” of its proposal): saved – the line „Gorszy dzień: … · Cofnij”
 * (its „Cofnij” = `undoWorseDay`). `seen` – the day's file as the window knows it. True – saved.
 */
export async function acceptWorseDay(date: string, seen: RawRecord | null): Promise<boolean> {
  const plan = await change<WorseAccept>(
    date,
    seen,
    (raw, day) => worseDayAccept({ date, raw, plan: day.ctx.plan, state: day.state, routines: useData.getState().routines, earlierMin: day.state.settings.worseDay.earlierMin, at: Date.now() }),
    withApprovalId
  )
  if (!plan) return false
  // „Cofnij” goes on the file as this turn left it – with the approval's id (`plan.raw`; a file not readable then stands in as this).
  undoToast(worseDayText(date, plan, plan.note), () => void undoWorseDay(date, plan.raw))
  return true
}

/**
 * „Cofnij” of „Gorszy dzień” (its line, or the mark's button): only what still stands as the acceptance left it – the rest stays, and the
 * words say what; the boundary moves back only while the acceptance's own approval is in force (T2533). True – saved.
 */
export async function undoWorseDay(date: string, seen: RawRecord | null): Promise<boolean> {
  const at = Date.now()
  const back = await change<WorseUndo>(date, seen, (raw, day) => worseDayUndo({ date, raw, state: day.state, events: day.ctx.events, plan: day.ctx.plan, at }))
  if (!back) return false
  toast(worseUndoText(date, back, back.note), 'info', 6000)
  return true
}

/** „×” of the proposal: not today – the day's `asked` (on every computer, to the day's end), as the plan's other questions. */
export async function dismissWorseDay(date: string, seen: RawRecord | null): Promise<boolean> {
  return isSaved(await saveDay(date, seen, (r) => setAsked(r, WORSE_DAY_ASKED, 'no')))
}
