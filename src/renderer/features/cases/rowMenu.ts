/**
 * The menus of one sprawa (UX17, D565 P25, F8) – pure lists of entries for `ContextMenu`:
 * - `caseRowMenu`: the „…” of a row of „Sprawy” – what no longer stands in the row's one line (the list, the priority, „Zrobione”, „Terminy”, „Kroki”,
 *   „Powtarzaj”, „Usuń”); a done sprawa has the list and „Usuń” only (as its expanded row);
 * - `priorityMenu`: „Priorytet ▸” – the five choices, a ✓ at the one the sprawa has; the right button on a card of the matrix has it (and „Otwórz w Listach”).
 * Nothing here writes: the screen hands the actions in.
 */
import type { CaseItem } from '@shared/engine/cases'
import { CASE_LIST_NAMES, CASE_LISTS, type CaseList } from '@shared/model/requests'
import type { MenuEntry } from '../../components/ContextMenu'
import { PRIORITY_CHOICES, type PriorityChoice } from './casesLogic'

export interface RowMenuActs {
  list: (l: CaseList) => void
  priority: (p: PriorityChoice) => void
  done: () => void
  dates: () => void
  steps: () => void
  repeat: () => void
  remove: () => void
}

/** „Priorytet ▸” items: every choice of `PRIORITY_CHOICES`, the sprawa's own with ✓. */
export function priorityEntries(current: PriorityChoice, pick: (p: PriorityChoice) => void): MenuEntry[] {
  return PRIORITY_CHOICES.map((c) => ({ label: c.label, check: c.value === current ? ('all' as const) : undefined, onPick: () => pick(c.value), testId: `case-menu-priority-${c.value}` }))
}

/** The entries of the „…” of a row. */
export function caseRowMenu(x: CaseItem, a: RowMenuActs): MenuEntry[] {
  const isTask = x.record.kind === 'task'
  const done = x.list === 'done'
  const entries: MenuEntry[] = []
  if (!done) entries.push({ label: 'Zrobione', onPick: a.done, testId: 'case-menu-done' })
  entries.push({
    label: 'Przenieś na listę',
    testId: 'case-menu-list',
    submenu: CASE_LISTS.map((l) => ({ label: CASE_LIST_NAMES[l], check: l === x.list ? ('all' as const) : undefined, onPick: () => a.list(l), testId: `case-menu-list-${l}` }))
  })
  if (!done) {
    entries.push({ label: 'Priorytet', testId: 'case-menu-priority', submenu: priorityEntries(x.record.priority ?? 'none', a.priority) })
    entries.push({ label: 'Terminy…', onPick: a.dates, testId: 'case-menu-dates' })
  }
  if (isTask) entries.push({ label: 'Kroki…', onPick: a.steps, testId: 'case-menu-steps' })
  if (isTask && !done) entries.push({ label: 'Powtarzaj…', onPick: a.repeat, testId: 'case-menu-repeat' })
  entries.push({ kind: 'separator' }, { label: 'Usuń', onPick: a.remove, testId: 'case-menu-remove' })
  return entries
}
