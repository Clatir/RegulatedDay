/**
 * „Rozłóż w luki” of the morning plan (D624, N5): the sprawy of „Dziś” not planned yet, in the order of the list, each into the first free
 * gap of today that holds its estimate (`fillDayGaps` – not before now, not past the maximum, nothing pushed apart); those that fit
 * nowhere are counted. Counted in the turn of the write on the day's file as just read (`planCases` with `fit`, `countedDay`) and written
 * in one edit – the day's file once and the records, each block the one tried; the line of „Dziś” „Zaplanowano 3 sprawy w lukach · 1 się
 * nie zmieściła · Cofnij” with the lowest energy before and after, as the other group changes; nothing planned – a toast, no line.
 * Without a DOM (tests in `tests/web/cases-gaps.test.ts`).
 */
import { paths } from '@shared/data/paths'
import { caseBlock, caseCompare, type CaseItem } from '@shared/engine/cases'
import { fillDayGaps } from '@shared/engine/gapFill'
import { plural } from '@shared/format'
import { energyChangeText, groupCount, skippedText } from '@shared/groupText'
import { planCases, type CaseFit, type GroupPlanResult, type GroupResult } from '../../store/casesGroup'
import { useData } from '../../store/data'
import { countedDay, type DayModel } from '../../store/day'
import { showGroupLine, type GroupView } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { CASE_VERB, casesUndo } from './groupActions'
import { lowestEnergyChange, type EnergyChange } from './groupPlan'

/**
 * The sprawy „Rozłóż w luki” takes (D624): the tasks and requests of „Dziś” that are not done and have no block (`scheduledOf` – one whose
 * day is not read is taken for planned), in the order the list shows them (`caseCompare`); a request only with its module on (as the panel).
 */
export const gapCases = (items: readonly CaseItem[], requestsOn: boolean): CaseItem[] => items.filter((x) => x.list === 'today' && !x.scheduled && (requestsOn || x.record.kind === 'task')).sort(caseCompare)

/** The toast when no sprawa fits in a gap of the day (nothing written). */
export const NO_GAP_TEXT = 'Żadna sprawa nie mieści się w lukach dnia'

/** The toast when the write planned nothing for another reason too (planned meanwhile, gone): „Nic nie zaplanowano w lukach · pominięto 1: już zaplanowana”. */
export function nothingPlannedText(r: Pick<GroupResult, 'skipped'>, notFit: number): string {
  const skipped = skippedText(r.skipped.map((s) => s.reason))
  if (!skipped) return NO_GAP_TEXT
  return ['Nic nie zaplanowano w lukach', ...(notFit > 0 ? [notFitText(notFit)] : []), skipped].join(' · ')
}

/** „1 się nie zmieściła”, „2 się nie zmieściły”, „5 się nie zmieściło”. */
export const notFitText = (n: number): string => `${n} się nie ${plural(n, 'zmieściła', 'zmieściły', 'zmieściło')}`

/**
 * The line after „Rozłóż w luki”: „Zaplanowano 3 sprawy w lukach · 1 się nie zmieściła · najniższa energia 52 → 44” – the second part only
 * when some fit nowhere; the ones the write left out (gone, done meanwhile) with their reasons, as every group change says them.
 */
export function gapLineText(r: Pick<GroupResult, 'changed' | 'skipped'>, notFit: number, energy?: EnergyChange | null): string {
  const parts = [`${CASE_VERB.planned} ${groupCount(r.changed, 'case')} w lukach`]
  if (notFit > 0) parts.push(notFitText(notFit))
  const skipped = skippedText(r.skipped.map((s) => s.reason))
  if (skipped) parts.push(skipped)
  if (energy && Math.round(energy.from) !== Math.round(energy.to)) parts.push(energyChangeText(energy.from, energy.to))
  return parts.join(' · ')
}

/** What „Rozłóż w luki” wrote: the group's result (`notFit` – the sprawy that fit in no gap), the lowest energy before and after. */
export interface GapPlanResult extends GroupPlanResult {
  energy: EnergyChange | null
}

/**
 * Where the sprawy stand on `date`, counted in the turn of the write (`CaseFit`): the day as the engine has it on the file just read and
 * its logs now (`countedDay`), each block made with the categories of the write (`caseBlock`) and tried there (`fillDayGaps`) – the very
 * block that stood is the one written. Null – the day cannot be counted now.
 */
export const gapFit =
  (date: string): CaseFit =>
  async (file, records, rules, at) => {
    const day = await countedDay(date, file, at)
    if (!day) return null
    // The buffers of decompression laid again on every plan tried, by the settings the day was counted with (T2916).
    const fill = fillDayGaps(
      day.ctx,
      day.state,
      records.map((r) => ({ id: r.id, block: (startMin: number) => caseBlock(r, startMin, rules) })),
      { changes: useData.getState().rd.settings, file: day.dayFile }
    )
    return { blocks: new Map(fill.placed.map((p) => [p.id, p.block])), notFit: fill.skipped }
  }

/**
 * `items` (in their order – `gapCases`) into the gaps of `model`'s day, in one edit (`planCases` with `gapFit`, nothing pushed); a sprawa
 * planned meanwhile (or on a day that cannot be read now) is left out („już zaplanowana”), its block stays where it is, one that left
 * „Dziś” – „nie na Dziś”. The day's file is read in the turn – one that cannot be read now refuses the write (no file of the window instead).
 */
export async function planInGaps(model: DayModel, items: readonly CaseItem[]): Promise<GapPlanResult> {
  const r = await planCases(
    items.map((x) => x.record.id),
    model.date,
    0,
    { fit: gapFit(model.date) }
  )
  // Before and after: the day's file as the turn read it and as the change left it (T2901).
  const day = r.undo.find((u) => u.rel === paths.day(model.date))
  return { ...r, energy: r.saved && r.changed > 0 && day ? lowestEnergyChange(model, day.after, Date.now(), day.before) : null }
}

/**
 * „Rozłóż w luki” (D624): `planInGaps`, then its line in `view` with one „Cofnij” for all (`undoGroup`) – or, when nothing was planned, a
 * toast („Żadna sprawa nie mieści się w lukach dnia”, `nothingPlannedText`) and no line. A refusal of the write says itself (a toast of
 * `change`).
 */
export async function spreadInGaps(model: DayModel, items: readonly CaseItem[], view: GroupView = 'today'): Promise<GapPlanResult> {
  const r = await planInGaps(model, items)
  if (!r.saved) return r
  if (r.changed === 0) toast(nothingPlannedText(r, r.notFit.length))
  else showGroupLine(view, { text: gapLineText(r, r.notFit.length, r.energy), undo: casesUndo(r.undo) })
  return r
}
