/**
 * Group changes of „Sprawy” from the screens (D527–D531, ciąg Z): the menu of the right button „Zmień 3 sprawy” (`casesMenu`, pure – the
 * screen hands it the callbacks), what each change says in the line of the window (`showCasesLine`: „Przeniesiono 3 sprawy · pominięto 1:
 * prośba · Cofnij”, the undo `undoGroup`, what it left as it is said by `keptText`), and the drop of a group from the panel beside the axis
 * of „Dziś”. Without a DOM (tests in `tests/web/cases-select.test.ts`). The writes themselves – `store/casesGroup.ts`.
 */
import type { CaseItem } from '@shared/engine/cases'
import { parseDuration } from '@shared/format'
import { groupCount, groupLineText, keptText } from '@shared/groupText'
import { triState } from '@shared/selection'
import { CASE_LIST_NAMES, ESTIMATE_RANGE, OPEN_LISTS, DEFAULT_TASK_CATEGORY, type CaseList } from '@shared/model/requests'
import type { MenuEntry } from '../../components/ContextMenu'
import type { DeleteTarget } from '../../lib/deleteKey'
import { removeCases, undoGroup, type GroupResult } from '../../store/casesGroup'
import { showGroupLine, type GroupView } from '../../store/groupLine'
import type { DayModel } from '../../store/day'
import { planGroupOnAxis, type EnergyChange, type GroupAxisResult } from './groupPlan'

/** The verbs of the line of a change of sprawy (the three of the shared set, the rest for what „Zrobione” and „Przywróć” do). */
export const CASE_VERB = { moved: 'Przeniesiono', changed: 'Zmieniono', done: 'Zrobiono', restored: 'Przywrócono', planned: 'Zaplanowano', copied: 'Skopiowano', removed: 'Usunięto' } as const

/** The text of the line after a group change: how many it took and, once each, why the others were left out. */
export const casesLineText = (verb: string, r: Pick<GroupResult, 'changed' | 'skipped'>, energy?: EnergyChange | null): string => groupLineText({ verb, n: r.changed, kind: 'case', skipped: r.skipped.map((s) => s.reason), energy })

/** The „Cofnij” of a line of a group change of sprawy (also „Rozłóż w luki”, D624): `undoGroup` of the change's files, its message what it left as it is. */
export const casesUndo =
  (undo: GroupResult['undo']) =>
  async (): Promise<string | undefined> => {
    const back = await undoGroup(undo)
    return back.kept > 0 ? keptText(back.kept, 'case') : undefined
  }

/**
 * The line of `view` for a change that was saved (a refusal said itself with a toast, no line): its text and its „Cofnij” – `undoGroup` of the
 * change's files (`casesUndo`); what it left as it is, because it changed since, is the message of the undo (D313).
 */
export function showCasesLine(view: GroupView, verb: string, r: Pick<GroupResult, 'saved' | 'changed' | 'skipped' | 'undo'>, energy?: EnergyChange | null): void {
  if (!r.saved) return
  showGroupLine(view, { text: casesLineText(verb, r, energy), undo: casesUndo(r.undo) })
}

/** What the menu does: each callback is a change of the selected sprawy (the screen runs it and shows its line). */
export interface CasesMenuOn {
  list: (list: CaseList) => void
  category: (categoryId: string) => void
  /** The estimate typed (minutes). */
  estimate: (minutes: number) => void
  done: () => void
  restore: () => void
  plan: () => void
  remove: () => void
}

/** The subcategories to choose from, by category of the tree (`groupedCategoryOptions`). */
export type CategoryGroups = ReadonlyArray<{ group: string; label: string; options: ReadonlyArray<{ value: string; label: string }> }>

/** The title of the menu for the selection: „Zmień 3 sprawy”. */
export const casesMenuTitle = (n: number): string => `Zmień ${groupCount(n, 'case')}`

/** The question of Del for a selection of two or more: „Usunąć 3 sprawy?” (Enter removes) – the target the screens give Del. */
export const removeCasesTarget = (n: number, run: () => unknown): DeleteTarget => ({ title: `Usunąć ${groupCount(n, 'case')}?`, yes: 'Usuń', run })

/** The estimate the whole selection has, as the text of the field (null – they differ). */
const sharedEstimate = (items: readonly CaseItem[]): string | undefined => {
  const first = items[0]?.estimateMin
  return first != null && items.every((x) => x.estimateMin === first) ? String(first) : undefined
}

/**
 * The entries of „Zmień N spraw” (D528) for the selected `items`: „Przenieś na listę” (✓ the list all of them are on, „—” when some are; a list
 * all are on is disabled), „Kategoria” (only tasks – requests have none; ✓ / „—” among the tasks; disabled with the reason when there are none),
 * „Szacunek” (a field: „30”, „1:30”), „Zrobione” and „Przywróć” (the one that makes sense, both when the selection is mixed), „Zaplanuj…”
 * (not for done ones), „Usuń”. Nothing blocks (D72): the ones a change does not concern are left out by the change and counted in the line.
 */
export function casesMenu(items: readonly CaseItem[], groups: CategoryGroups, on: CasesMenuOn): MenuEntry[] {
  const tasks = items.filter((x) => x.record.kind === 'task')
  const shared = sharedEstimate(items)
  const open = items.filter((x) => x.list !== 'done')
  const done = items.length - open.length
  const lists: MenuEntry[] = OPEN_LISTS.map((l) => {
    const check = triState(items.map((x) => x.list === l))
    return { label: CASE_LIST_NAMES[l], ...(check !== 'none' ? { check } : {}), ...(check === 'all' ? { disabled: 'Wszystkie są już na tej liście' } : {}), onPick: () => on.list(l), testId: `cases-menu-list-${l}` }
  })
  const categories: MenuEntry[] = groups.map((g) => ({
    label: g.label,
    testId: `cases-menu-group-${g.group}`,
    submenu: g.options.map((o): MenuEntry => {
      const check = triState(tasks.map((x) => (x.record.categoryId ?? DEFAULT_TASK_CATEGORY) === o.value))
      return { label: o.label, ...(check !== 'none' ? { check } : {}), onPick: () => on.category(o.value), testId: `cases-menu-category-${o.value}` }
    })
  }))
  const entries: MenuEntry[] = [
    { label: 'Przenieś na listę', submenu: lists, testId: 'cases-menu-list' },
    tasks.length
      ? { label: 'Kategoria', submenu: categories, testId: 'cases-menu-category' }
      : { label: 'Kategoria', disabled: 'Prośba nie ma kategorii – to zmiana tylko dla zadań', testId: 'cases-menu-category' },
    {
      kind: 'field',
      label: 'Szacunek',
      placeholder: 'np. 30, 1:30',
      ...(shared ? { initial: shared } : {}),
      onSubmit: (text) => {
        const p = parseDuration(text, ESTIMATE_RANGE[1])
        if (!p.ok) return p.message
        if (p.value < ESTIMATE_RANGE[0]) return `Najkrócej ${ESTIMATE_RANGE[0]} min.`
        on.estimate(p.value)
      },
      testId: 'cases-menu-estimate'
    },
    { kind: 'separator' }
  ]
  if (open.length) entries.push({ label: 'Zrobione', onPick: on.done, testId: 'cases-menu-done' })
  if (done) entries.push({ label: 'Przywróć', onPick: on.restore, testId: 'cases-menu-restore' })
  entries.push(open.length ? { label: 'Zaplanuj…', onPick: on.plan, testId: 'cases-menu-plan' } : { label: 'Zaplanuj…', disabled: 'Zrobione sprawy nie idą na oś', testId: 'cases-menu-plan' })
  entries.push({ kind: 'separator' }, { label: 'Usuń', onPick: on.remove, testId: 'cases-menu-remove' })
  return entries
}

/** The group removed (D528, Del): its line „Usunięto 3 sprawy · Cofnij”. */
export async function removeGroup(view: GroupView, ids: readonly string[]): Promise<GroupResult> {
  const r = await removeCases(ids)
  showCasesLine(view, CASE_VERB.removed, r)
  return r
}

/**
 * The sprawy a drag of the panel that grabbed `id` carries (D530): the selection when it holds two or more and `id` is one of them – in the order
 * the panel shows them; null – only that sprawa, as before. The one rule for the drop, the ghost and the dimming of the rows.
 */
export const carriedBy = (selected: readonly CaseItem[], id: string): CaseItem[] | null => (selected.length >= 2 && selected.some((x) => x.record.id === id) ? [...selected] : null)

/**
 * The sprawy of the panel dropped on the axis of `model`'s day at `startMin` (D530; `copy` – Ctrl, copies): one after another from the minute,
 * the first there – a change of the day's file with its line „Zaplanowano 3 · najniższa energia 52 → 44 · Cofnij” in the line of „Dziś” (T1541:
 * no line of the bar; UX19: the panel beside „Tydzień” has it in `view` 'week'). Returns what the change did.
 */
export async function planGroupDrop(model: DayModel, today: string, items: readonly CaseItem[], startMin: number, copy = false, view: GroupView = 'today'): Promise<GroupAxisResult> {
  const r = await planGroupOnAxis(model, today, items, startMin, copy)
  showCasesLine(view, copy ? CASE_VERB.copied : CASE_VERB.planned, r, r.energy)
  return r
}
