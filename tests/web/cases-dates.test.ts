/**
 * „Sprawy” with dates in the main window without a DOM (HKU2: D409, D451): the lists of the page ordered by the due date
 * first, a new task's words of dates („!pt”, „@jutro”) written as its fields, and Ctrl K's hint with the due date.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { caseItems } from '@shared/engine/cases'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf, placeLogical } from '@shared/time/day'
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

describe('nowe zadanie w oknie: długość, podkategoria i godzina w tytule (N10, D600–D602)', () => {
  /** The window over an empty folder whose days are readable (`caseDays` gives each asked day as no file) – or not (`unreadable`). */
  function stubDays(unreadable = false) {
    const sent = stub()
    const rd = (globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd
    rd.caseDays = async (dates) => ({ files: unreadable ? {} : Object.fromEntries(dates.map((d) => [d, null])), gone: {}, begun: {} })
    return sent
  }

  it('„Raport 1h30 #anal” – szacunek 90 i podkategoria Analiza, bez bloku (tylko długość i kategoria)', async () => {
    const sent = stub()
    const r = await createTask({ title: 'Raport #anal 1h30' })
    expect(r.saved).toBe(true)
    expect(sent[0]).toHaveLength(1)
    const e = sent[0]![0]!
    expect(field(e, 'title')).toBe('Raport')
    expect(field(e, 'estimateMin')).toBe(90)
    expect(field(e, 'categoryId')).toBe('analiza')
    expect(field(e, 'day')).toBeNull()
  })

  it('„#xyz” bez dopasowania zostaje w tytule; wartości podane wprost wygrywają ze słowami', async () => {
    const sent = stub()
    await createTask({ title: 'Raport #xyz' })
    expect(field(sent[0]![0]!, 'title')).toBe('Raport #xyz')
    expect(field(sent[0]![0]!, 'categoryId')).toBe('inne')
    await createTask({ title: 'Raport #anal 1h', estimateMin: 15, categoryId: 'nauka' })
    expect(field(sent[1]![0]!, 'estimateMin')).toBe(15)
    expect(field(sent[1]![0]!, 'categoryId')).toBe('nauka')
  })

  it('„@jutro 15:00 1h #anal” – jedna edycja: plik dnia jutro z blokiem 15:00–16:00 Analizy, potem sprawa „zaplanowane”; jedno „Cofnij”', async () => {
    const sent = stubDays()
    const today = logicalDayOf(Date.now())
    const tomorrow = addDays(today, 1)
    const r = await createTask({ title: 'Raport @jutro 15:00 1h #anal' })
    expect(r.saved).toBe(true)
    expect(r).not.toHaveProperty('notPlaced')
    expect(sent).toHaveLength(1)
    const [dayEntry, record] = sent[0]!
    expect(dayEntry!.rel).toBe(`days/${tomorrow.slice(0, 4)}/${tomorrow}.json`)
    expect(record!.after).toEqual([0])
    expect(field(record!, 'doDate')).toBe(tomorrow)
    expect(field(record!, 'day')).toBe(tomorrow)
    expect(field(record!, 'estimateMin')).toBe(60)
    const blocks = field(dayEntry!, 'blocks') as Array<{ id: string; categoryId: string; startMin: number; durationMin: number; task: string }>
    expect(blocks).toEqual([expect.objectContaining({ id: field(record!, 'block'), categoryId: 'analiza', startMin: 900, durationMin: 60, task: r.id })])
    expect(r.undo.map((f) => f.rel)).toEqual([dayEntry!.rel, record!.rel])
  })

  it('plik dnia nieczytelny: sprawa zapisana z datą, bez bloku, dymek mówi dlaczego', async () => {
    const sent = stubDays(true)
    const r = await createTask({ title: 'Raport @jutro 15:00' })
    expect(r.saved).toBe(true)
    expect(r.notPlaced).toBe('pliku dnia nie da się teraz odczytać')
    expect(sent[0]).toHaveLength(1)
    expect(field(sent[0]![0]!, 'day')).toBeNull()
    expect(field(sent[0]![0]!, 'doDate')).toBe(addDays(logicalDayOf(Date.now()), 1))
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Zapisano: Raport – nie postawiono na osi: pliku dnia nie da się teraz odczytać')
  })

  it('odczyt dnia odrzucony (IPC rzuca): sprawa zapisana z datą, bez bloku, „pliku dnia…”; dymek z tytułem takim, jak zapisany', async () => {
    const sent = stub()
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd.caseDays = () => Promise.reject(new Error('ipc'))
    const r = await createTask({ title: 'Kup   mleko @jutro 15:00' })
    expect(r.saved).toBe(true)
    expect(r.notPlaced).toBe('pliku dnia nie da się teraz odczytać')
    expect(sent[0]).toHaveLength(1)
    expect(field(sent[0]![0]!, 'title')).toBe('Kup mleko')
    expect(field(sent[0]![0]!, 'day')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Zapisano: Kup mleko – nie postawiono na osi: pliku dnia nie da się teraz odczytać')
  })

  it('ta sama data wykonania podana wprost (albo brak / null) nie zabiera godziny: blok stoi jak zwykle; inna data – „dzień podany osobno”', async () => {
    const tomorrow = addDays(logicalDayOf(Date.now()), 1)
    for (const doDate of [tomorrow, null, undefined]) {
      const sent = stubDays()
      const r = await createTask({ title: 'Raport @jutro 15:00', ...(doDate === undefined ? {} : { doDate }) })
      expect(r).not.toHaveProperty('notPlaced')
      expect(sent[0]).toHaveLength(2)
      expect(field(sent[0]![1]!, 'doDate')).toBe(tomorrow)
      expect(field(sent[0]![1]!, 'day')).toBe(tomorrow)
    }
    const sent = stubDays()
    expect((await createTask({ title: 'Raport @jutro 15:00', doDate: addDays(tomorrow, 3) })).notPlaced).toBe('dzień podany osobno')
    expect(field(sent[0]![0]!, 'doDate')).toBe(addDays(tomorrow, 3))
  })

  it('@HH:MM dziś z godziną już minioną (D603): bez bloku, „ta godzina już minęła”; bieżąca minuta jeszcze stoi', async () => {
    const sent = stubDays()
    const today = logicalDayOf(Date.now())
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(placeLogical(today, 16 * 60))
      const late = await createTask({ title: 'Raport @15:00' })
      expect(late.notPlaced).toBe('ta godzina już minęła')
      expect(sent[0]).toHaveLength(1)
      expect(field(sent[0]![0]!, 'doDate')).toBe(today)
      expect(field(sent[0]![0]!, 'day')).toBeNull()
      expect(useUi.getState().toasts.map((t) => t.text)).toContain('Zapisano: Raport – nie postawiono na osi: ta godzina już minęła')
      const now = await createTask({ title: 'Raport @16:00' })
      expect(now).not.toHaveProperty('notPlaced')
      expect(sent[1]).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('data wykonania podana wprost zabiera słowu godzinę: bez bloku, dymek mówi „dzień podany osobno”', async () => {
    const sent = stubDays()
    const r = await createTask({ title: 'Raport @jutro 15:00', doDate: '2026-12-01' })
    expect(r.notPlaced).toBe('dzień podany osobno')
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Zapisano: Raport – nie postawiono na osi: dzień podany osobno')
    expect(sent[0]).toHaveLength(1)
    expect(field(sent[0]![0]!, 'doDate')).toBe('2026-12-01')
    expect(field(sent[0]![0]!, 'day')).toBeNull()
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
