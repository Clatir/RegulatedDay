/**
 * What „Tydzień” writes (D366, D371): the blocks added to the days of the week from the small window of a new block.
 */
import { putBlock, dayRaw } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { EditEntry } from '@shared/api'
import type { PlanBlock } from '@shared/model/plan'
import { editOf, trySaveWith } from '../../store/data'
import { toast } from '../../store/ui'
import { dayHeading } from '../calendar/zjazdyDraft'

/** The toast for days whose files cannot be read now: named, with what was done about the rest. */
export function unreadableText(dates: readonly string[]): string {
  return dates.length === 1
    ? `Nie dodano bloku w dniu ${dayHeading(dates[0]!)} – plik tego dnia jest teraz nieczytelny. Spróbuj za chwilę.`
    : `Nie dodano bloków w dniach: ${dates.map(dayHeading).join(', ')} – ich pliki są teraz nieczytelne. Spróbuj za chwilę.`
}

/**
 * Each block put into the plan of its day – the day's own file as it is when this turn comes (made when the day has none
 * yet, as „Dodaj” in „Dziś” does for another day), all the days in one go: one read of the files, one write, in the queue
 * of the window's edits. A day whose file cannot be read now is not written over (its edit would go on a file never seen) –
 * the toast names it; the others are saved. Returns the dates saved (written or waiting for the folder) and those that
 * were not (unreadable, refused, met a change from another computer – the notice said so), in the order given.
 */
export async function addWeekBlocks(entries: ReadonlyArray<{ date: string; block: PlanBlock }>): Promise<{ saved: string[]; failed: string[] }> {
  const unreadable: string[] = []
  // The dates of the edits sent, in their order: what the main process answers goes by it.
  const sent: string[] = []
  const out = await trySaveWith(async () => {
    const files = await window.rd.dayFiles(entries.map((e) => e.date))
    const edits: EditEntry[] = []
    for (const e of entries) {
      if (!(e.date in files)) {
        unreadable.push(e.date)
        continue
      }
      const before = files[e.date] ?? null
      const edit = editOf(paths.day(e.date), before, putBlock(dayRaw(before, e.date), e.block))
      if (edit) {
        edits.push(edit)
        sent.push(e.date)
      }
    }
    return edits
  })
  if (unreadable.length) toast(unreadableText(unreadable), 'error', 6000)
  const saved = new Set<string>()
  if (out) sent.forEach((d, i) => (out[i]?.status === 'applied' || out[i]?.status === 'waiting') && saved.add(d))
  const dates = entries.map((e) => e.date)
  return { saved: dates.filter((d) => saved.has(d)), failed: dates.filter((d) => !saved.has(d)) }
}
