/**
 * The first save of the new block of „Dziś” and every change after it (D461, T1072). The draft's first committed field saves
 * it (`start`); a change made once that save has started – a field, a step – waits for it and then goes as a change of the block
 * (`after`): its own write in the window's turn of saves (T517, over the block as the file holds it then), its own answer. The
 * write is made over the block as the window holds it at that change – the draft before it, or the plan's block – never over the
 * first save's snapshot (T1079: a length changed twice after the save frees the gap from the second one, D368). The first save
 * failed (refused, the exchange asks): the changes stay in the draft (they were put there at once), said as asked, and the next
 * change starts the save again. Draft or block is decided by the save started here – never by whether the plan shows the block
 * yet (it comes a moment after the save). One for the window: the draft outlives the screen (A6-17), so does its save.
 */
import type { PlanBlock } from '@shared/model/plan'
import type { SaveAnswer } from '../../store/data'

export class FirstSave {
  private cur: { block: PlanBlock; run: Promise<boolean>; settled: boolean } | null = null

  /** The first save of the block `id`, started – running, or done and written; null: none (not started, or it failed – a draft still). */
  of(id: string): { block: PlanBlock; run: Promise<boolean> } | null {
    return this.cur?.block.id === id ? this.cur : null
  }

  /**
   * The first save still running (of whichever block): leaving the panel waits for it even when the plan shows its block already –
   * its end selects that block, so it must not come after the panel went on to another one (T1079). Null: none runs.
   */
  pending(): Promise<boolean> | null {
    return this.cur && !this.cur.settled ? this.cur.run : null
  }

  /** The draft `block` saved by `save` (true – written). A failure forgets it: the block is a draft again. */
  start(block: PlanBlock, save: () => Promise<boolean>): Promise<boolean> {
    const me = { block, run: save(), settled: false }
    this.cur = me
    const end = (ok: boolean) => {
      me.settled = true
      if (!ok && this.cur === me) this.cur = null
    }
    me.run.then(end, () => end(false))
    return me.run
  }

  /**
   * A change of the block `id` once its first save has started: `write` after that save (at once when it is done), with its own
   * answer; the first save failed – nothing written, „asked” (the draft keeps it). `write` makes the change over the block the window
   * holds at that change (no snapshot is handed to it). Null: no save started.
   */
  after(id: string, write: () => Promise<SaveAnswer> | SaveAnswer): Promise<SaveAnswer> | null {
    const f = this.of(id)
    return f ? f.run.then((ok) => (ok ? write() : 'asked')) : null
  }
}

/**
 * Esc in the panel of the new block (T1045, T1080): a draft untouched (no field, no step changed) whose save has not started is
 * thrown away; any other is left as „Zamknij” leaves it – saved as it stands, a save running waited for, then the panel closes. A
 * text being typed is the field's own first Esc (it goes back), before this one.
 */
export const escapeDraft = (started: boolean, touched: boolean): 'discard' | 'leave' => (!started && !touched ? 'discard' : 'leave')

/** The window's one (the draft lives in `store/ui` – it stays when the screen changes, and so does the save it started). */
export const firstSave = new FirstSave()
