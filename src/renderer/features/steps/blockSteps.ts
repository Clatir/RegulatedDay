/**
 * A change of the list „Kroki” of a block of a day, as the panel of „Dziś” makes it (SNT5, D440, D401, D404). A new block
 * before „Dodaj”: its draft (nothing is saved). A block of a series asks the scope as every change of it does – „Tylko to”
 * is this day's block, „To i następne” and „Cała seria” the series with the whole list (the ticks stay the day's, T786);
 * any other block – the day's own (a block of a task: its task too, T792). A tick is never asked (`tickBlockStep`).
 * The scope is asked once for the open panel (T798): the first change of the list picks it (`scope.current`), the next changes
 * of that block keep it until the screen resets it (the panel closed, another block selected). It is kept at once when the
 * question is answered (D443) – before the save, so a quick second change never asks again; a refusal of the scope by the
 * series (it ended, it is gone) takes it back – the next change asks again – a refusal of the change itself, a failed send
 * or a question keeps it; „Anuluj” keeps nothing. „Cofnij” only for a removal (D443): the series API says it when its text is not empty.
 */
import type { RawRecord, SeriesScope } from '@shared/api'
import type { PlanBlock } from '@shared/model/plan'
import { seriesOfBlock, type Series } from '@shared/model/series'
import { applyStepOp, type StepOp } from '@shared/model/steps'
import type { SaveAnswer } from '../../store/data'
import { changeBlockSteps, changeSeriesSteps } from '../../store/steps'
import { blockName, type Names } from '../plan/blockView'
import { askScope } from '../series/scopeAsk'
import { occurrenceRuleText } from '../series/seriesForm'
import { stepsAnswer } from './stepsUi'

export async function saveBlockSteps(
  o: { date: string; today: string; raw: RawRecord | null | undefined; series: readonly Series[]; names: Names; patchDraft: (steps: PlanBlock['steps']) => void; scope: { current: SeriesScope | null } },
  b: PlanBlock,
  op: StepOp,
  isDraft: boolean
): Promise<SaveAnswer> {
  if (isDraft) {
    const next = applyStepOp(b.steps, op)
    if ('error' in next) return false
    o.patchDraft(next.steps)
    return true
  }
  const of = seriesOfBlock(o.series, b, o.date)
  const scope = of ? (o.scope.current ?? (await askScope('change', blockName(b, o.names), occurrenceRuleText(of, o.date, o.today)))) : 'only'
  if (!scope) return false
  if (of) o.scope.current = scope
  if (scope === 'only') return stepsAnswer(op, await changeBlockSteps(o.date, b, op, o.raw))
  const { answer, refused } = await changeSeriesSteps({ date: o.date, blockId: b.id }, scope, op, op.op === 'remove' ? 'Krok usunięty' : '')
  // The series refused the scope picked (it ended, it is gone – `ended`, `notFound`): the scope goes, the next change asks
  // again; a refusal of the change itself (`invalid`), a send that failed or a question keeps it (D443).
  if (refused && o.scope.current === scope) o.scope.current = null
  return answer
}
