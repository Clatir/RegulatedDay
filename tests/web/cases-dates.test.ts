/**
 * „Sprawy” with dates in the main window without a DOM (HKU2: D409, D451): the lists of the page ordered by the due date
 * first, a new task's words of dates („!pt”, „@jutro”) written as its fields, and Ctrl K's hint with the due date.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { caseItems } from '@shared/engine/cases'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { sectionsOf } from '@renderer/features/cases/casesLogic'
import { searchRecords } from '@renderer/features/search/records'
import { PAGE_LABEL, pageKeys } from '@renderer/app/pages'
import { createTask } from '@renderer/store/cases'
import { skipDeadline } from '@renderer/features/today/dayActions'
import { deadlineAskKey, DEADLINE_SKIP } from '@shared/engine/caseDates'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const WED = '2026-11-11'
const at = (h: number) => Date.parse(`${WED}T${String(h).padStart(2, '0')}:00:00+01:00`)

/** The window over an empty folder; the edits sent are collected. */
function stub() {
  const sent: EditEntry[][] = []
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async () => ({}),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: [] })
  return sent
}
const field = (e: EditEntry, name: string) => e.edits.find((x) => x.path.join('.') === name)?.value

describe('lista „Spraw” z terminami (D409)', () => {
  it('na każdej liście najpierw po terminie i z terminem rosnąco, potem reszta (najnowsze na górze); „Zrobione” bez zmian', () => {
    const raws: RawRecord[] = [
      { ...newTask('a', at(9), WED, { title: 'a' })!, createdAt: 4 },
      { ...newTask('b', at(9), WED, { title: 'b', dueDate: '2026-11-13' })!, createdAt: 1 },
      { ...newTask('c', at(9), WED, { title: 'c', dueDate: '2026-11-10' })!, createdAt: 2 },
      { ...newTask('d', at(9), WED, { title: 'd' })!, createdAt: 3 },
      { ...newTask('w', at(9), WED, { title: 'w', list: 'week', dueDate: '2026-11-20' })!, createdAt: 5 },
      { ...newTask('v', at(9), WED, { title: 'v', list: 'week' })!, createdAt: 6 }
    ]
    const items = caseItems(raws.map((r) => requestFrom(r)!), WED, () => null)
    const sections = sectionsOf(items, { showOlder: false })
    const ids = (list: string) => sections.find((s) => s.list === list)!.items.map((x) => x.record.id)
    expect(ids('inbox')).toEqual(['c', 'b', 'a', 'd'])
    expect(ids('week')).toEqual(['w', 'v'])
  })
})

describe('nowe zadanie w oknie: słowa daty w tytule (D409)', () => {
  it('„!jutro @dziś” – termin i data wykonania, słowa znikają z tytułu', async () => {
    const sent = stub()
    const today = logicalDayOf(Date.now())
    const r = await createTask({ title: 'Raport !jutro @dziś' })
    expect(r.saved).toBe(true)
    const e = sent[0]![0]!
    expect(field(e, 'title')).toBe('Raport')
    expect(field(e, 'dueDate')).toBe(addDays(today, 1))
    expect(field(e, 'doDate')).toBe(today)
  })

  it('pola podane wprost mają pierwszeństwo przed słowem; same słowa – odmowa jak bez tytułu', async () => {
    const sent = stub()
    await createTask({ title: 'Raport !jutro', dueDate: '2026-12-01' })
    expect(field(sent[0]![0]!, 'title')).toBe('Raport')
    expect(field(sent[0]![0]!, 'dueDate')).toBe('2026-12-01')
    expect(await createTask({ title: '!jutro' })).toMatchObject({ saved: false, error: 'Zadanie potrzebuje tytułu.' })
  })
})

describe('Ctrl K: termin w podpowiedzi sprawy (D409)', () => {
  it('„· termin pt 13.11” przy niezrobionej z terminem; bez terminu i zrobiona – bez', () => {
    const requests = [
      requestFrom(newTask('t1', at(9), WED, { title: 'Czynsz', dueDate: '2026-11-13' }))!,
      requestFrom(newTask('t2', at(9), WED, { title: 'Bez terminu' }))!,
      requestFrom({ ...newTask('t3', at(9), WED, { title: 'Zrobione', dueDate: '2026-11-13' })!, state: 'done', list: 'done', doneAt: at(10) })!
    ]
    const recs = searchRecords({ today: WED, rd: rdFrom(undefined), templates: [], requests, routines: [], series: [], blocks: [], pageLabel: PAGE_LABEL, pageKeys }).filter((r) => r.kind === 'request')
    const hint = (id: string) => recs.find((r) => r.id === id)!.hint
    expect(hint('t1')).toBe('zadanie · Skrzynka · termin pt 13.11')
    expect(hint('t2')).toBe('zadanie · Skrzynka')
    expect(hint('t3')).toBe('zadanie · Zrobione')
  })
})

describe('plan poranny: „Pomiń” terminu (D409, T855)', () => {
  it('odpowiedź w pliku dnia jedną edycją – do końca dnia, na każdym komputerze; plan bez zmian', async () => {
    const file: RawRecord = { schema: 1, date: WED, blocks: [], asked: { energyOrder: 'leave' } }
    const sent: EditEntry[][] = []
    const rd: Partial<RdApi> = {
      dayFiles: async () => ({ [WED]: file }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => ({ today: WED }) as DataView
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: WED } as DataView })
    expect(await skipDeadline(WED, file, 't1')).toEqual([{ status: 'applied' }])
    // One field of `asked` (two computers skipping two sprawy meet without a question).
    expect(sent.map((e) => e.map((x) => x.edits.map((y) => [y.path.join('.'), y.value])))).toEqual([[[[`asked.${deadlineAskKey('t1')}`, DEADLINE_SKIP]]]])
  })
})
