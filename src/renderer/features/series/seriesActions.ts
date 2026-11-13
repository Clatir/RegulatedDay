/**
 * The window's calls of the series API (D381, T709): each goes in the turn of the window's saves (T517), the view is read
 * again after it, and its result is said – a refusal with its reason, a question that waits for your answer, a success with
 * „Cofnij” for 10 s (`seriesUndo`: only the files that still stand as the change left them).
 */
import type { SeriesCreate, SeriesResult, SeriesScope, SeriesTarget } from '@shared/api'
import type { SeriesPatch } from '@shared/engine/series'
import { editNotice, inTurn, reloadData, type SaveAnswer } from '../../store/data'
import { toast, undoToast } from '../../store/ui'

/** What the window says of a result and what the save became (the note editor puts its text back only on `false`). */
export function resultAnswer(r: SeriesResult, done: string | null, undo: (r: SeriesResult) => void): SaveAnswer {
  if (r.error != null) {
    toast(r.error, 'error', 8000)
    return false
  }
  const notice = editNotice(r.outcomes)
  if (!r.ok) {
    // A change that met another computer's stays a question (the banner shows it); a broken file says so.
    if (notice) toast(notice.text, notice.kind, 8000)
    return notice?.kind === 'error' ? false : 'asked'
  }
  if (done && r.undo.length) undoToast(done, () => undo(r))
  return true
}

/** One call of the API in its turn; a failure of the bridge is said and answers `false`. */
async function call(fn: () => Promise<SeriesResult>, done: string | null): Promise<{ answer: SaveAnswer; result: SeriesResult | null }> {
  try {
    const result = await inTurn(async () => {
      const r = await fn()
      await reloadData()
      return r
    })
    return { answer: resultAnswer(result, done, (r) => void undoSeries(r)), result }
  } catch (e) {
    toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    return { answer: false, result: null }
  }
}

/** „Cofnij” of a change of a series: the files back as before it, where they still stand as it left them. */
export async function undoSeries(r: SeriesResult): Promise<void> {
  try {
    const back = await inTurn(async () => {
      const x = await window.rd.seriesUndo(r.undo)
      await reloadData()
      return x
    })
    if (back.error != null) toast(`Nie cofnięto: ${back.error}`, 'error', 8000)
    else if (!back.ok) {
      const notice = editNotice(back.outcomes)
      if (notice) toast(notice.text, notice.kind, 8000)
    }
  } catch (e) {
    toast(`Nie cofnięto: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
  }
}

/** „Powtarzaj”: the block becomes the series' first occurrence; the new series' id comes back for the panel to follow it. */
export async function createSeries(input: SeriesCreate, text: string): Promise<{ answer: SaveAnswer; seriesId: string | null }> {
  const { answer, result } = await call(() => window.rd.seriesCreate(input), text)
  return { answer, seriesId: result?.seriesId ?? null }
}

/** A change by its scope („Tylko to” goes through the day's own edit – this is „To i następne” and „Cała seria”, and the list's). */
export async function changeSeries(target: SeriesTarget, scope: SeriesScope, patch: SeriesPatch, text: string): Promise<SaveAnswer> {
  return (await changeSeriesWith(target, scope, patch, text)).answer
}

/** As `changeSeries`, with the series' answer (`result` null – the bridge failed: no answer at all). */
export function changeSeriesWith(target: SeriesTarget, scope: SeriesScope, patch: SeriesPatch, text: string): Promise<{ answer: SaveAnswer; result: SeriesResult | null }> {
  return call(() => window.rd.seriesChange(target, scope, patch), text)
}

/** A removal by its scope. */
export async function removeSeries(target: SeriesTarget, scope: SeriesScope, text: string): Promise<SaveAnswer> {
  return (await call(() => window.rd.seriesRemove(target, scope), text)).answer
}

/** „Zakończ serię” of the list: the last day of its occurrences. */
export async function endSeries(seriesId: string, last: string, text: string): Promise<SaveAnswer> {
  return (await call(() => window.rd.seriesEnd(seriesId, last), text)).answer
}

/** The morning plan's answer about an occurrence on a special day: „zostaw” (`keep`) or „odwołaj”. */
export async function answerSeries(date: string, blockId: string, keep: boolean, text: string | null): Promise<SaveAnswer> {
  return (await call(() => window.rd.seriesAnswer(date, blockId, keep), text)).answer
}
