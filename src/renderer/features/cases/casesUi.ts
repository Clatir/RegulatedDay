/**
 * Small rules of the screens of „Sprawy” that more than one place needs, without a DOM (tests in `tests/web/cases-screens.test.ts`):
 * the place a new block is looked for from („następne wolne miejsce” – Ctrl+N of „Dziś”, „Zaplanuj” of the panel and of the
 * page), the one line a sprawa is offered by in the morning plan, and a title field that saves once.
 */
import type { DayState } from '@shared/engine/day'
import { newBlockStart } from '@shared/engine/planEdit'
import type { RdFile } from '@shared/model/rd'
import type { CaseItem } from '@shared/engine/cases'
import type { oneAtATime } from '../../lib/busy'
import { caseTitle } from './casesLogic'

/** Where the day stands for the search: is it today, the logical minute now (only today's), and the day's wake. */
export interface StartWhere {
  isToday: boolean
  nowMin: number
  wakeMin: number
}

/**
 * The minute a free place is looked for from (spec „Tworzenie”, A6-24): today the next quarter after now (not before the wake),
 * another day an hour after the wake.
 */
export const startSearchFrom = (w: StartWhere): number => (w.isToday ? Math.ceil(Math.max(w.nowMin, w.wakeMin) / 15) * 15 : w.wakeMin + 60)

/** The nearest free place of the day for a block of `lengthMin` – never over a block planned or running there. */
export const nextFreeStart = (state: DayState, w: StartWhere, lengthMin = 60): number => newBlockStart(state, startSearchFrom(w), lengthMin)

/** The one text a sprawa is offered by in the morning plan's step: a task by its title, a request by its person and note (once). */
export const queueRowText = (x: CaseItem, rd: Pick<RdFile, 'people'>): string => caseTitle(x.record, rd)

/**
 * A title field that saves once (a second Enter, or Enter and „Dodaj”, while the save runs does nothing): the field is cleared
 * at once, and given back when the save did not happen; `done` runs after a save. `run` is the screen's `useBusy` runner.
 */
export async function submitTitle(run: ReturnType<typeof oneAtATime>, title: string, o: { set: (title: string) => void; save: (title: string) => Promise<boolean>; done: () => void }): Promise<void> {
  await run(async () => {
    if (!title.trim()) return
    o.set('')
    if (await o.save(title)) o.done()
    else o.set(title)
  })
}
