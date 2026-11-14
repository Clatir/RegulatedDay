/**
 * The import's actions that go through the main process (the save, „Cofnij”) in the turn of the window's saves (T517),
 * with the view read again after them – as after every save of the window (`reloadData` never fails: a read that does
 * not come is read again by the next change or the periodic read).
 */
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
