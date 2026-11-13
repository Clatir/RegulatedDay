/**
 * What „Tydzień” writes (D366, D371): the blocks added to the days of the week from the small window of a new block.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { putBlock } from '@shared/data/dayEdits'
import { editStands, inverseEdit } from '@shared/data/merge'
import { plDateWithWeekday } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { isSaved, trySaveWith, withOwner } from '../../store/data'
import { countedDay } from '../../store/day'
import { toast, undoToast } from '../../store/ui'
import { dropWeekPushDays, useWeekPush, type WeekPush, type WeekPushedDay } from '../../store/weekPush'
import { dayFileEdit, withPushed, type PushedStart } from '../today/dayActions'
import { addChange, pushedStarts } from '../today/dayPush'
import { weekPushLineText } from './weekText'

/** The toast for days whose files cannot be read now: named, with what was done about the rest. */
export function unreadableText(dates: readonly string[]): string {
  return dates.length === 1
    ? `Nie dodano bloku w dniu ${plDateWithWeekday(dates[0]!)} – plik tego dnia jest teraz nieczytelny. Spróbuj za chwilę.`
    : `Nie dodano bloków w dniach: ${dates.map(plDateWithWeekday).join(', ')} – ich pliki są teraz nieczytelne. Spróbuj za chwilę.`
}

/** The toast for days whose edit was sent but whose outcome is not known (the answer did not come back). */
export function unknownText(dates: readonly string[]): string {
  return `Nie wiadomo, czy blok trafił do ${dates.length === 1 ? 'dnia' : 'dni'}: ${dates.map(plDateWithWeekday).join(', ')}. Sprawdź tydzień – nic nie zostanie dodane ponownie.`
}

/**
 * What became of each day asked for (D371): `saved` – written or waiting for the folder; `pending` – the edit was sent and
 * is in the plan, waiting for your answer to a question (a change from another computer met it), or its outcome is not known
 * (the answer did not come back: `unknown`) – never to be added again, it would make a second block; `failed` – nothing was
 * written (a file that could not be read, a file that is broken, the edit refused before it was sent): the window keeps
 * them, to add again. The dates in the order asked.
 */
export interface WeekAdds {
  saved: string[]
  pending: string[]
  failed: string[]
  unknown: boolean
}

/**
 * The outcomes of the edits sent (`out`, in the order of `sent`; null – the call failed) put by day. `made` – the edits
 * were made and handed over (a failure before that wrote nothing: every day stays to add again).
 */
export function weekAdds(dates: readonly string[], sent: readonly string[], out: readonly EditOutcome[] | null, made: boolean): WeekAdds {
  const saved = new Set<string>()
  const pending = new Set<string>()
  let unknown = false
  if (out == null) {
    // The call failed: before the edits left, nothing was written; after, it may have been.
    if (made) {
      sent.forEach((d) => pending.add(d))
      unknown = sent.length > 0
    }
  } else {
    sent.forEach((d, i) => {
      const status = out[i]?.status
      if (status === 'applied' || status === 'waiting') saved.add(d)
      else if (status === 'conflict' || status === 'removedElsewhere' || status === 'changedElsewhere') pending.add(d)
    })
  }
  return { saved: dates.filter((d) => saved.has(d)), pending: dates.filter((d) => pending.has(d)), failed: dates.filter((d) => !saved.has(d) && !pending.has(d)), unknown }
}

/** The outcome of `addWeekBlocks`: what became of each day, and the line to keep (null: nothing was pushed apart). */
export interface WeekAdded extends WeekAdds {
  push: WeekPush | null
}

/**
 * The starts of the blocks a block put in `date` pushes apart (D367, as „Dodaj” in „Dziś” counts them): the day as the
 * engine has it now – its logs from `dayData`, its plan from `base`, the very file the edit is made on (two reads of one day
 * may differ; the counted starts always belong to the file they are written over). The energy is not counted (`pushApart`
 * does not use it). A day that cannot be counted now (its logs not read whole, the bridge fails) pushes nothing – the block is
 * added as before the pushing, never refused (D72).
 */
async function pushedFor(date: string, base: RawRecord | null, block: PlanBlock): Promise<PushedStart[]> {
  const model = await countedDay(date, base)
  return model ? pushedStarts(model.ctx.plan, addChange(model, block, true)) : []
}


/**
 * Each block put into the plan of its day – the day's own file as it is when this turn comes (made when the day has none
 * yet, as „Dodaj” in „Dziś” does for another day), all the days in one go: one read of the files, one write, in the queue
 * of the window's edits. A day whose file cannot be read now, or whose file the edit cannot be made on, is not written over
 * (its edit would go on a file never seen) – the toast names it; the others are saved.
 *
 * D400: a day from `today` on pushes the flexible blocks after the new one apart (`pushApart`, as in „Dziś”; a day gone is
 * history – only the block), each day in its own edit, all in the one write. What was written comes back as `push` (null:
 * nothing pushed) for the line „Przesunięto N bloków w K dniach · Cofnij”; today's pushing is told to the bar for the marker
 * of variants only (no line of its own – the one „Cofnij” is the window's).
 */
export async function addWeekBlocks(entries: ReadonlyArray<{ date: string; block: PlanBlock }>, today: string): Promise<WeekAdded> {
  const dates = entries.map((e) => e.date)
  const unreadable: string[] = []
  // The dates of the edits sent, in their order: what the main process answers goes by it.
  const sent: string[] = []
  const written = new Map<string, WeekPushedDay>()
  let made = false
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(dates)
    // The days to come counted at once (their reads go side by side – this turn holds the window's other edits back). Without
    // a known today nothing is told gone or to come: the blocks are added alone.
    const counted = await Promise.all(entries.map((e) => (today && e.date >= today && e.date in files ? pushedFor(e.date, files[e.date] ?? null, e.block) : [])))
    const edits: EditEntry[] = []
    for (const [i, e] of entries.entries()) {
      if (!(e.date in files)) {
        unreadable.push(e.date)
        continue
      }
      try {
        const starts = counted[i]!
        let after: RawRecord | null = null
        const edit = dayFileEdit(e.date, files[e.date] ?? null, (raw) => (after = withPushed(raw, e.date, (r) => putBlock(r, e.block), starts)))
        if (edit) {
          edits.push(edit)
          sent.push(e.date)
          written.set(e.date, { date: e.date, entry: edit, made: edit.create ? after : null, moved: starts.length })
        }
      } catch {
        // A file the edit cannot be made on (a broken one): this day is left as an unreadable one, the others go on.
        unreadable.push(e.date)
      }
    }
    made = true
    return edits
  })
  if (unreadable.length) toast(unreadableText(unreadable), 'error', 6000)
  const r = weekAdds(dates, sent, out, made)
  if (r.unknown) toast(unknownText(r.pending), 'error', 8000)
  const days = r.saved.flatMap((d) => written.get(d) ?? [])
  const mine = days.find((d) => d.date === today && d.moved > 0)
  if (!days.some((d) => d.moved > 0)) return { ...r, push: null }
  if (mine) {
    try {
      await window.rd.planPushed(mine.date, mine.moved, mine.entry, mine.made, false)
    } catch {
      // The plan is saved; only the bar's marker is missing (the main process is closing).
    }
  }
  return { ...r, push: { days } }
}

/** Whether a day still stands as „Dodaj” left it (`now`: its file as it is; null – none): `editStands`. */
export const weekPushStands = (d: WeekPushedDay, now: RawRecord | null): boolean => editStands(d.entry, now, d.made)

/**
 * Whether the line still has something to take back (`files`: the days as they are now, null – not read yet): a day that
 * stands, or one whose file cannot be read now (it is left out of `files`; „Cofnij” judges it when it is clicked).
 */
export function weekPushStanding(push: WeekPush, files: Readonly<Record<string, RawRecord | null>> | null): boolean {
  const stands = (d: WeekPushedDay) => !(d.date in files!) || weekPushStands(d, files![d.date] ?? null)
  // D417: a move goes back only with both its days as it left them (`undoWeekPush`) – one changed, nothing to take back.
  return files == null || (push.move ? push.days.every(stands) : push.days.some(stands))
}

/** The toast for days whose files cannot be read now when „Cofnij” asks: nothing was done there, they stay to take back. */
export function undoUnreadableText(dates: readonly string[]): string {
  return `Nie cofnięto zmian w ${dates.length === 1 ? 'dniu' : 'dniach'}: ${dates.map(plDateWithWeekday).join(', ')} – ${dates.length === 1 ? 'plik tego dnia jest' : 'ich pliki są'} teraz nieczytelne. Spróbuj za chwilę.`
}

/** What „Cofnij” did: the days by their dates. */
export interface WeekUndone {
  /** Every edit of the write went through (nothing is claimed when one did not). */
  saved: boolean
  /** Taken back (their edits applied or waiting for the folder) – also when others of the write did not go through. */
  undone: string[]
  /** Changed since „Dodaj” – left as they are. */
  changed: string[]
  /** Their files cannot be read now – left, to take back later. */
  unreadable: string[]
}

/**
 * „Cofnij” of the line (D400): in one write, each day that still stands as „Dodaj” left it goes back to how it was (the
 * block put in is taken off, the pushed ones return – `inverseEdit`); a day changed since stays as it is, a day whose file
 * cannot be read now is not touched – each says so in its toast, only when the whole write went through (else the write's own
 * toast is all there is). A write of which only some edits went through (a question about a day) – those days are `undone`.
 */
export async function undoWeekPush(push: WeekPush): Promise<WeekUndone> {
  const r: WeekUndone = { saved: false, undone: [], changed: [], unreadable: [] }
  // The dates of the edits sent, in their order: what the main process answers goes by it.
  const sent: string[] = []
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(push.days.map((d) => d.date))
    const back: EditEntry[] = []
    // D417: a block moved between two days goes back to both or to none – one day alone would leave it on neither day
    // or on both. A day not readable now: nothing is done, the line stays; one changed since: both stay as they are.
    if (push.move) {
      r.unreadable = push.days.filter((d) => !(d.date in files)).map((d) => d.date)
      if (r.unreadable.length) return []
      if (!push.days.every((d) => weekPushStands(d, files[d.date] ?? null))) {
        r.changed = push.days.map((d) => d.date)
        return []
      }
    }
    for (const d of push.days) {
      if (!(d.date in files)) {
        r.unreadable.push(d.date)
        continue
      }
      const now = files[d.date] ?? null
      const edit = editStands(d.entry, now, d.made) ? inverseEdit(d.entry, now, d.made) : null
      if (edit) {
        back.push(edit)
        sent.push(d.date)
      } else r.changed.push(d.date)
    }
    // A move back (T953): the source's half that brings the block back is the owner, the target's that takes it off goes
    // with it – a question about the source keeps the block on the target, „theirs” leaves it there; never on neither day.
    if (push.move) {
      const i = sent.indexOf(push.move.from)
      if (i > 0) {
        back.unshift(...back.splice(i, 1))
        sent.unshift(...sent.splice(i, 1))
      }
      return i >= 0 ? withOwner(back[0]!, back.slice(1)) : back
    }
    return back
  })
  out?.forEach((o, i) => {
    if (o.status === 'applied' || o.status === 'waiting') r.undone.push(sent[i]!)
  })
  r.saved = isSaved(out)
  // A move goes back whole: a half waiting for your answer about the other is not undone yet (the line stays).
  if (push.move && !r.saved) r.undone = []
  if (!r.saved) return r
  if (r.changed.length) toast('Część planu zmieniła się od przesunięcia – zostaje tak, jak jest teraz.', 'info', 6000)
  if (r.unreadable.length) toast(undoUnreadableText(r.unreadable), 'error', 6000)
  return r
}

/**
 * A move of „Przenieś na…” said (D424, T964): the words of the line of „Tydzień” („Przeniesiono: <nazwa> na <dzień> · <nazwa>
 * został – …”) in a toast with its „Cofnij” – both days back, or none (`undoWeekPush`).
 */
export function tellMoved(push: WeekPush): void {
  undoToast(weekPushLineText(push), () => void undoWeekPush(push))
}

/**
 * „Cofnij” of the line kept in the window: the days taken back leave it (also when other days of the write did not go
 * through – a second click never speaks of them), the ones changed since too, when the write went through; what did not
 * go through, and a day that could not be read, stays – for another try.
 */
export async function undoWeekLine(): Promise<void> {
  const line = useWeekPush.getState().line
  if (!line) return
  const r = await undoWeekPush(line.push)
  dropWeekPushDays(line.seq, r.saved ? [...r.undone, ...r.changed] : r.undone)
}
