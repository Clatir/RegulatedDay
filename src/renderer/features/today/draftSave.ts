/**
 * The first save of the new block of „Dziś” and every change after it (D461, T1072). The draft's first committed field saves
 * it (`start`); a change made once that save has started – a field, a step – waits for it and then goes as a change of the block
 * (`after`): its own write in the window's turn of saves (T517, over the block as the file holds it then), its own answer. The
 * first save failed (refused, the exchange asks): the changes stay in the draft (they were put there at once), said as asked,
 * and the next change starts the save again. Draft or block is decided by the save started here – never by whether the plan
 * shows the block yet (it comes a moment after the save). One for the window: the draft outlives the screen (A6-17), so does its save.
 */
import type { PlanBlock } from '@shared/model/plan'
import type { SaveAnswer } from '../../store/data'

export class FirstSave {
  private cur: { block: PlanBlock; run: Promise<boolean> } | null = null

  /** The first save of the block `id`, started – running, or done and written; null: none (not started, or it failed – a draft still). */
  of(id: string): { block: PlanBlock; run: Promise<boolean> } | null {
    return this.cur?.block.id === id ? this.cur : null
  }

  /** The draft `block` saved by `save` (true – written). A failure forgets it: the block is a draft again. */
  start(block: PlanBlock, save: () => Promise<boolean>): Promise<boolean> {
    const me = { block, run: save() }
    this.cur = me
    const forget = () => {
      if (this.cur === me) this.cur = null
    }
    me.run.then((ok) => ok || forget(), forget)
    return me.run
  }

  /**
   * A change of the block `id` once its first save has started: `write` (the change of the block as the first save wrote it) after
   * that save, with its own answer; the first save failed – nothing written, „asked” (the draft keeps it). Null: no save started.
   */
  after(id: string, write: (saved: PlanBlock) => Promise<SaveAnswer> | SaveAnswer): Promise<SaveAnswer> | null {
    const f = this.of(id)
    return f ? f.run.then((ok) => (ok ? write(f.block) : 'asked')) : null
  }
}

/** The window's one (the draft lives in `store/ui` – it stays when the screen changes, and so does the save it started). */
export const firstSave = new FirstSave()
