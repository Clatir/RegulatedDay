/**
 * What „Tydzień” writes (D366, D371): the blocks added to the days of the week from the small window of a new block.
 */
import type { EditEntry, EditOutcome } from '@shared/api'
import { putBlock } from '@shared/data/dayEdits'
import { plDateWithWeekday } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { trySaveWith } from '../../store/data'
import { toast } from '../../store/ui'
import { dayFileEdit } from '../today/dayActions'

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

/**
 * Each block put into the plan of its day – the day's own file as it is when this turn comes (made when the day has none
 * yet, as „Dodaj” in „Dziś” does for another day), all the days in one go: one read of the files, one write, in the queue
 * of the window's edits. A day whose file cannot be read now, or whose file the edit cannot be made on, is not written over
 * (its edit would go on a file never seen) – the toast names it; the others are saved.
 */
export async function addWeekBlocks(entries: ReadonlyArray<{ date: string; block: PlanBlock }>): Promise<WeekAdds> {
  const dates = entries.map((e) => e.date)
  const unreadable: string[] = []
  // The dates of the edits sent, in their order: what the main process answers goes by it.
  const sent: string[] = []
  let made = false
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(dates)
    const edits: EditEntry[] = []
    for (const e of entries) {
      if (!(e.date in files)) {
        unreadable.push(e.date)
        continue
      }
      try {
        const edit = dayFileEdit(e.date, files[e.date] ?? null, (raw) => putBlock(raw, e.block))
        if (edit) {
          edits.push(edit)
          sent.push(e.date)
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
  return r
}
