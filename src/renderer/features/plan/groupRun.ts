/**
 * The group changes of blocks joined to the screens (D528, D529, Z4-B, Z5): `runBlockGroup` – the one place every pick of the menu „Zmień N
 * bloków” and Del of a selection go – runs the change of „Dziś” (`changeDayGroup`), of a template's version (`changeTemplateGroup`) or of the
 * columns of „Tydzień” and „3 dni”, of „Agenda” and of the month's bars (`changeDaysGroup` – the keys `blockKey(date, id)` by their days, one edit, one „Cofnij”), and says it in the
 * line of the view (`GroupLine`, T1541): „Zmieniono 3 bloki · pominięto 1: zaczęty · Cofnij”; its „Cofnij” takes the change back and says what it
 * left as it is because it changed since (`keptText`, D313). A change that changes nothing says so in the corner, with no line. `judgeBlocks` –
 * the engine's verdicts of the menu's rules on the view's model (`MenuCtx.judge`).
 */
import { ruleVerdicts, type GroupAction as EngineAction, type GroupDay, type MenuRule, type RuleVerdict } from '@shared/engine/groupEdit'
import type { StayHow } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { plural } from '@shared/format'
import { groupCount, groupLineText, keptText, skippedText, VERB } from '@shared/groupText'
import { showGroupLine, UndoNotDone, type GroupView } from '../../store/groupLine'
import { toast } from '../../store/ui'
import { changeTemplateGroup } from '../templates/templateGroup'
import { changeDayGroup, changeDaysGroup, type GroupDone } from '../today/groupActions'
import { parseBlockKey, type GroupAction, type GroupWhere } from './groupMenu'

/** The menu's action as the engine's (`groupEdit.ts`): the same changes, the engine's names. */
export function engineAction(a: GroupAction): EngineAction {
  switch (a.kind) {
    case 'category':
      return { k: 'category', categoryId: a.categoryId, variantId: a.variantId }
    case 'variant':
      return { k: 'variant', variantId: a.variantId }
    case 'cost':
      return { k: 'cost', costs: a.costs }
    case 'routine':
      return { k: 'routine', routine: a.routine, minutes: a.minutes ?? 0 }
    case 'shift':
      return { k: 'shift', minutes: a.minutes }
    case 'moveTo':
      return { k: 'moveTo', date: a.date }
    default:
      return { k: a.kind }
  }
}

/**
 * How the rules of the menu take the blocks `ids` of a day (as the view has it counted) – for `MenuCtx.judge` (T1720): one pass of the engine
 * (`ruleVerdicts`), the menu opened once. `today` – the logical day now ('' – a template's version: no actions of a day).
 */
export const judgeBlocks = (day: GroupDay, ids: readonly string[], today: string): Partial<Record<MenuRule, RuleVerdict>> => ruleVerdicts(day, ids, today, { dayActions: today !== '' })

/** Why a block anchored to a moved one stayed on its day (D424, T965) – the words of the line of a move of one block (`weekText`). */
const STAY_WORD: Record<StayHow, string> = { running: 'już trwa', done: 'już zrobiony', parked: 'zaparkowany', cancelled: 'odwołany', kept: 'w swoim dniu' }

/** The verb of the line: „Przeniesiono” a move, „Usunięto” a removal, „Odwołano”, „Zaparkowano”, else „Zmieniono”. */
const verbOf = (a: GroupAction): string => (a.kind === 'moveTo' ? VERB.moved : a.kind === 'remove' ? VERB.removed : a.kind === 'cancel' ? 'Odwołano' : a.kind === 'park' ? 'Zaparkowano' : VERB.changed)

/** „1 dzień czeka na odpowiedź”, „2 dni niezapisane” – the days a change did not write (the save's toast says why). */
export function unwrittenDaysText(d: Pick<GroupDone, 'waitingDays' | 'refusedDays'>): string[] {
  const out: string[] = []
  if (d.waitingDays) out.push(`${groupCount(d.waitingDays, 'day')} ${plural(d.waitingDays, 'czeka', 'czekają', 'czeka')} na odpowiedź`)
  if (d.refusedDays) out.push(`${groupCount(d.refusedDays, 'day')} ${plural(d.refusedDays, 'niezapisany', 'niezapisane', 'niezapisanych')}`)
  return out
}

/**
 * The text of the line after a group change of blocks (D529): the count, the reasons of those left out (once each), those that stayed on their day
 * (D424), the lowest energy before and after, the note of a series, the blocks pushed apart (D367 – „przesunięto 2 bloki”, as the line of a move)
 * and the days not written (a question, a refusal).
 */
export function blockLineText(a: GroupAction, d: Pick<GroupDone, 'changed' | 'skipped' | 'stayed' | 'pushed' | 'energy' | 'seriesOnly' | 'waitingDays' | 'refusedDays'>): string {
  const text = groupLineText({
    verb: verbOf(a),
    n: d.changed,
    skipped: d.skipped.map((s) => s.why),
    stayed: (d.stayed ?? []).map((s) => STAY_WORD[s.how]),
    // „został w swoim dniu” – where they stayed (every one that stays only because it does not move to another day).
    stayedPlace: (d.stayed ?? []).length > 0 && d.stayed!.every((s) => s.how === 'kept'),
    energy: d.energy ? { from: d.energy.before, to: d.energy.after } : null,
    series: d.seriesOnly > 0
  })
  return [text, ...(d.pushed > 0 ? [pushedText(d.pushed).replace(/^P/, 'p')] : []), ...unwrittenDaysText(d)].join(' · ')
}

/** What a change that changed nothing says (no line): „Bez zmian · pominięto 2: zaczęty, sesja”, or that the blocks are so already. */
export function nothingText(d: Pick<GroupDone, 'skipped' | 'same' | 'waitingDays' | 'refusedDays'>): string {
  const skipped = skippedText(d.skipped.map((s) => s.why))
  const base = skipped ? `Bez zmian · ${skipped}` : d.same > 0 ? 'Bez zmian – zaznaczone bloki już tak mają' : 'Bez zmian'
  return [base, ...unwrittenDaysText(d)].join(' · ')
}

/**
 * What a group change came to, said: changed – the line of `view` with its „Cofnij” (the undo's message – what changed since and stayed; an undo
 * not done whole leaves the line for another try, its save said why); changed without a way back – the same words in the corner; nothing changed –
 * the corner says why (refused, every block left out or so already); not saved – the save said it already (a question, a refusal).
 */
export function sayGroupDone(view: GroupView, a: GroupAction, d: GroupDone): void {
  const undo = d.undo
  // A change with a way back: what it changed, or the days it wrote only in part (a move whose target took the blocks, no source let them go).
  if (undo && (d.changed > 0 || d.waitingDays || d.refusedDays)) {
    showGroupLine(view, {
      text: blockLineText(a, d),
      undo: async () => {
        const r = await undo()
        if (!r.saved) throw new UndoNotDone()
        // What stayed (changed since), the days whose taking back waits for your answer.
        const said = [...(r.kept > 0 ? [keptText(r.kept, 'block')] : []), ...unwrittenDaysText({ waitingDays: r.waitingDays })]
        return said.length ? said.join(' · ') : undefined
      }
    })
    return
  }
  if (d.changed > 0) toast(blockLineText(a, d), 'info')
  else if (d.status === 'saved' || d.status === 'refused') toast(nothingText(d), 'info')
}

/**
 * One group change of blocks from a screen: `ids` of the day of „Dziś” (`where.date`), of a template's version (`where.templateId`, `where.from`),
 * or the keys of the columns of „Tydzień” / „3 dni” (by their days in `changeDaysGroup`); then said (`sayGroupDone`). Resolves with what it came to
 * (null – no place known).
 */
export async function runBlockGroup(view: GroupView, ids: readonly string[], a: GroupAction, where?: GroupWhere, at?: number): Promise<GroupDone | null> {
  const action = engineAction(a)
  const o = at != null ? { at } : {}
  let done: GroupDone | null = null
  // „Tydzień”, „3 dni” and „Agenda” say their changes in the line of „week”, the bars of the month in the one of „calendar” (N18) – the keys are the same.
  if (view === 'week' || view === 'calendar')
    done = await changeDaysGroup(
      ids.map((k) => {
        const { date, id } = parseBlockKey(k)
        return { date, ids: [id] }
      }),
      action,
      o
    )
  else if (view === 'today' && where && 'date' in where) done = await changeDayGroup(where.date, ids, action, o)
  else if (view === 'template' && where && 'templateId' in where) done = await changeTemplateGroup(where, ids, action)
  if (done) sayGroupDone(view, a, done)
  return done
}
