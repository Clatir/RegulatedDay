/**
 * The import's actions that go through the main process (the save, „Cofnij”) in the turn of the window's saves (T517),
 * with the view read again after them – as after every save of the window (`reloadData` never fails: a read that does
 * not come is read again by the next change or the periodic read). And the answers about the weekly analysis after an
 * import („Tak” or „Nie”, written on Friday): Friday's file before and after the answer goes back with its „Cofnij”.
 */
import type { RawRecord, ZjazdSaveResult, ZjazdUndoDay } from '@shared/api'
import { inTurn, reloadData } from '../../store/data'

/** `call` in its turn, then the view read again; a failure of `call` is thrown (nothing read again). */
export async function runInTurn<T>(call: () => Promise<T>, o: { turn?: typeof inTurn; reload?: () => Promise<void> } = {}): Promise<T> {
  const turn = o.turn ?? inTurn
  const reload = o.reload ?? reloadData
  return turn(async () => {
    const out = await call()
    await reload()
    return out
  })
}

/** A save of the import whose toast with „Cofnij” waits for the answers about the weekly analysis (they go back with it). */
export interface PendingImport {
  out: ZjazdSaveResult
  /** Fridays answered: their file before and after the answer. */
  fridays: ZjazdUndoDay[]
  /** Fridays answered whose file could not be read after the answer: their answer cannot go back. */
  lost: string[]
}

/**
 * Friday's answer written (`before`: its file before the answer): its file after it, read in the turn of the window's
 * saves, goes into the „Cofnij” of the import; a file that cannot be read now (or is not there) – the Friday is noted as
 * one whose answer does not go back.
 */
export async function noteFriday(p: PendingImport, friday: string, before: RawRecord | null, o: { turn?: typeof inTurn; read?: (dates: string[]) => Promise<Record<string, RawRecord | null>> } = {}): Promise<void> {
  const turn = o.turn ?? inTurn
  const read = o.read ?? ((dates: string[]) => window.rd.dayFiles(dates))
  const after = (await turn(() => read([friday])))[friday]
  if (after) p.fridays.push({ date: friday, before, after })
  else p.lost.push(friday)
}
