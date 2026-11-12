/**
 * The screen „Sprawy” without a DOM (OPS2, D383, D384, D402; tests in `tests/web/cases-screens.test.ts`): the five lists
 * as the page shows them (the header of „Dziś” with its sum, „Zrobione” of the last 7 days and „Pokaż starsze”), the line
 * that says where a sprawa stands („zaplanowane …”, „wróciło z Dziś …”, „porzucone”), and the texts that name a sprawa (a task by its title, a request by its person).
 */
import { caseCompare, caseName, todayHeader, todayMinutes, type CaseItem } from '@shared/engine/cases'
import { countLabel, logicalClock, plDate } from '@shared/format'
import { personName, type RdFile } from '@shared/model/rd'
import { CASE_LISTS, CASE_LIST_NAMES, type CaseList, type RequestRecord } from '@shared/model/requests'

/** One list of the page: its title (with the sum of „Dziś”), its items in order, how many older ones „Zrobione” keeps back. */
export interface CaseSection {
  list: CaseList
  title: string
  items: CaseItem[]
  /** „Zrobione” only: done earlier than the last 7 days and not shown (`showOlder` false). */
  older: number
}

/** The lists in their order (D383); the items of each in the order of `caseCompare` (due dates first – D409), `keep` filtering what the filters hide. */
export function sectionsOf(items: readonly CaseItem[], o: { showOlder: boolean; keep?: (x: CaseItem) => boolean }): CaseSection[] {
  const kept = o.keep ? items.filter(o.keep) : [...items]
  return CASE_LISTS.map((list) => {
    const own = kept.filter((x) => x.list === list).sort(caseCompare)
    // The header of „Dziś” says the sum of its estimates – of all of them, not only of those a filter leaves (D402).
    const title = list === 'today' ? todayHeader(todayMinutes(items.filter((x) => x.list === 'today'))) : CASE_LIST_NAMES[list]
    if (list !== 'done' || o.showOlder) return { list, title, items: own, older: 0 }
    const recent = own.filter((x) => x.recent)
    return { list, title, items: recent, older: own.length - recent.length }
  })
}

/** What names a sprawa on the page and in the lines: a task by its title, a request by its person and note. */
export const caseTitle = (r: RequestRecord, rd: Pick<RdFile, 'people'>): string => caseName(r, (id) => personName(rd, id))

/**
 * Where a sprawa stands, in words (D383, D384, D402): the block it was put into („zaplanowane 12.11.2026 10:00” – the hour
 * as long as the day's file is read), the „Dziś” it came back from at 04:00, what was done or let go. Empty – nothing to say.
 */
export function statusParts(x: CaseItem): string[] {
  const out: string[] = []
  if (x.scheduled) out.push(`zaplanowane ${plDate(x.scheduled.day)}${x.scheduled.startMin != null ? ` ${logicalClock(x.scheduled.startMin)}` : ''}`)
  if (x.rolledFrom) out.push(`wróciło z „Dziś” ${plDate(x.rolledFrom)}`)
  if (x.list === 'done') {
    if (x.record.state === 'dropped') out.push('porzucone')
    if (x.doneDay) out.push(`zrobione ${plDate(x.doneDay)}`)
  }
  return out
}


/** The ritual's Sunday line (D402): how many sprawy wait in „Kiedyś / Może”. */
export const somedayText = (n: number): string => `Na liście „Kiedyś / Może”: ${countLabel(n, 'sprawa', 'sprawy', 'spraw')} – przejrzyj ją raz w tygodniu.`

/** What the ritual says of the sprawy of „Dziś” that stay not done: they return at 04:00 (the day still going), or have returned. */
export const backText = (open: boolean): string => (open ? 'Niezrobione z „Dziś” wrócą o 04:00 do „W tym tygodniu”:' : 'Niezrobione z „Dziś” wróciły do „W tym tygodniu”:')

/**
 * The page's filters (`kind:task`, `kind:request`, `person:<id>` / `person:?`) as a test of a sprawa: the kinds chosen, and the
 * persons chosen – a person is a request's, so a filter by one leaves the tasks out. No filter – everything.
 */
export function filterOf(filters: readonly string[]): (x: CaseItem) => boolean {
  const kinds = filters.filter((f) => f.startsWith('kind:')).map((f) => f.slice(5))
  const persons = filters.filter((f) => f.startsWith('person:')).map((f) => f.slice(7))
  return (x) => (!kinds.length || kinds.includes(x.record.kind)) && (!persons.length || (x.record.kind === 'request' && persons.includes(x.record.person ?? '?')))
}

/**
 * The morning plan's step (D384, D408): the tasks of „Dziś” are chosen at once, the requests are not. What you change is kept as a
 * list of ids toggled against that default (a task unchecked, a request checked), so a task that comes later is chosen too.
 */
export const isMorningChosen = (kind: 'task' | 'request', id: string, toggled: readonly string[]): boolean => (kind === 'task') !== toggled.includes(id)

/** The ids chosen among what the step offers (`morningCases`), given what you toggled. */
export function morningChosen(offered: { requests: readonly CaseItem[]; tasks: readonly CaseItem[] }, toggled: readonly string[]): { requests: string[]; tasks: string[] } {
  const ids = (list: readonly CaseItem[], kind: 'task' | 'request') => list.map((x) => x.record.id).filter((id) => isMorningChosen(kind, id, toggled))
  return { requests: ids(offered.requests, 'request'), tasks: ids(offered.tasks, 'task') }
}
