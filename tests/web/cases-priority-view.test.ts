/**
 * „Sprawy” – priorities on the screens without a DOM (HKU3: D450): the choice in the row, the order of the page's lists and of
 * the panel beside the axis, the stripe on the tile of a task's block, the matrix's drop written as one edit, the morning plan's
 * line (the module of requests), the remembered view („Listy” / „Macierz”), Ctrl K's hint and the history's words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { caseItems } from '@shared/engine/cases'
import { dropPatch, matrixOf } from '@shared/engine/casePriority'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { newRequest, newTask, requestFrom, type NewTask } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { PAGE_LABEL, pageKeys } from '@renderer/app/pages'
import { PRIORITY_CHOICES, morningPriorityLine, sectionsOf } from '@renderer/features/cases/casesLogic'
import { readCasesView, rememberCasesView } from '@renderer/features/cases/casesView'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { searchRecords } from '@renderer/features/search/records'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { changeCase } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { Scenario } from '../unit/engine/dsl'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  vi.unstubAllGlobals()
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

const WED = '2026-11-11'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const task = (id: string, p: Partial<NewTask> = {}, age = 0) => newTask(id, at(WED) - age * 60_000, WED, { title: `zadanie ${id}`, ...p })!
const items = (raws: Array<Record<string, unknown>>, today = WED) => caseItems(raws.map((r) => requestFrom(r)!), today, () => undefined)

describe('wybór priorytetu w wierszu (D450)', () => {
  it('„Bez priorytetu” (domyślny) i cztery ćwiartki pełnymi nazwami', () => {
    expect(PRIORITY_CHOICES).toEqual([
      { value: 'none', label: 'Bez priorytetu' },
      { value: 'p1', label: 'Ważne i pilne' },
      { value: 'p2', label: 'Ważne' },
      { value: 'p3', label: 'Pilne' },
      { value: 'p4', label: 'Ani to, ani to' }
    ])
  })
})

describe('kolejność na stronie i w panelu przy osi (D450)', () => {
  it('lista „Skrzynka”: termin, potem P1–P4, potem bez priorytetu', () => {
    const list = items([task('none', {}, 1), task('p4', { priority: 'p4' }, 2), task('p1', { priority: 'p1' }, 9), task('due', { dueDate: '2026-11-30' }, 20), task('p2', { priority: 'p2' }, 5)])
    expect(sectionsOf(list, { showOlder: false })[0]!.items.map((x) => x.record.id)).toEqual(['due', 'p1', 'p2', 'p4', 'none'])
  })

  it('„Dziś” porządkuje tak samo, a nagłówek i suma bez zmian', () => {
    const list = items([task('a', { list: 'today' }, 1), task('b', { list: 'today', priority: 'p3' }, 8)])
    const today = sectionsOf(list, { showOlder: false }).find((s) => s.list === 'today')!
    expect(today.items.map((x) => x.record.id)).toEqual(['b', 'a'])
    expect(today.title).toBe('Dziś · 1 h')
  })
})

describe('pasek priorytetu na kafelku bloku zadania na osi „Dziś” (D450)', () => {
  const DATE = '2026-11-12'
  const axis = (priority: string | null, o: { done?: boolean; today?: string | null } = {}) => {
    const s = new Scenario({ date: DATE, plan: [planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, task: 't1', origin: 'user' }), planBlock({ id: 'b2', categoryId: 'inne', startMin: 720, durationMin: 30, origin: 'user' })] })
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const raw = { ...task('t1', { priority: priority as never }), ...(o.done ? { state: 'done', list: 'done', doneAt: at(DATE) } : {}) }
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [requestFrom(raw)!] }
    return new Map(dayAxis(model, names, null, o.today === undefined ? DATE : o.today).items.map((i) => [i.id, i]))
  }

  it('blok zadania z priorytetem niesie go (kolor bloku dalej z kategorii); blok bez zadania i zadanie bez priorytetu – nie', () => {
    const items = axis('p1')
    expect(items.get('b1')!.priority).toBe('p1')
    expect(items.get('b1')!.color).toBe(axis(null).get('b1')!.color)
    expect(items.get('b2')!.priority).toBeUndefined()
    expect(axis(null).get('b1')!.priority).toBeUndefined()
  })

  it('zadanie zrobione – bez paska; w szablonach (bez dnia okna) też jest, bo priorytet nie zależy od dnia', () => {
    expect(axis('p2', { done: true }).get('b1')!.priority).toBeUndefined()
    expect(axis('p3', { today: null }).get('b1')!.priority).toBe('p3')
  })
})

describe('upuszczenie w macierzy to jedna edycja rekordu (D450)', () => {
  /** The window over a folder of records; the edits are only collected. */
  function stub(records: RawRecord[]) {
    const sent: EditEntry[][] = []
    const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
    const rd: Partial<RdApi> = { edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))), dataView: async () => view() }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: view(), requests: records.map((r) => requestFrom(r)!) })
    return sent
  }
  const field = (e: EditEntry, name: string) => e.edits.find((x) => x.path.join('.') === name)?.value

  it('z „Ważne” do „Ważne i pilne” – jeden zapis priorytetu; z „Bez priorytetu” do pola i z pola do „Bez priorytetu” – tak samo; to samo pole – nic', async () => {
    const sent = stub([task('a', { priority: 'p2' }), task('b')])
    const list = items([task('a', { priority: 'p2' }), task('b')])
    const drop = async (id: string, f: Parameters<typeof dropPatch>[1]) => {
      const patch = dropPatch(list.find((x) => x.record.id === id), f)
      return patch ? changeCase(id, patch) : null
    }
    expect(await drop('a', 'p1')).toMatchObject({ saved: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    expect(sent[0]![0]).toMatchObject({ rel: paths.record('request', 'a') })
    expect(field(sent[0]![0]!, 'priority')).toBe('p1')
    expect(await drop('b', 'p4')).toMatchObject({ saved: true })
    expect(field(sent[1]![0]!, 'priority')).toBe('p4')
    expect(await drop('a', 'none')).toMatchObject({ saved: true })
    expect(field(sent[2]![0]!, 'priority')).toBeNull()
    // The same field (a is on „Ważne” in the list the drop reads): nothing is written.
    expect(await drop('a', 'p2')).toBeNull()
    expect(await drop('b', 'none')).toBeNull()
    expect(sent).toHaveLength(3)
  })

  it('po zapisie sprawa stoi w polu, na które ją upuszczono', () => {
    const before = matrixOf(items([task('a', { priority: 'p2' })]))
    expect(before.cells.p2.map((x) => x.record.id)).toEqual(['a'])
    const after = matrixOf(items([task('a', { priority: 'p1' })]))
    expect([after.cells.p1.length, after.cells.p2.length]).toEqual([1, 0])
  })
})

describe('linia planu porannego i moduł próśb (D450, T763)', () => {
  const p1 = (id: string) => task(id, { priority: 'p1', list: 'today' })
  const req = { ...newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '', priority: 'p1' }), list: 'today', listDay: WED }

  it('moduł próśb włączony liczy prośby, wyłączony – tylko zadania, jak strona', () => {
    const list = items([p1('a'), req])
    expect(morningPriorityLine(list, true, [], WED)).toBe('2 sprawy ważne i pilne bez miejsca w planie')
    expect(morningPriorityLine(list, false, [], WED)).toBe('1 sprawa ważna i pilna bez miejsca w planie')
  })

  it('blok zadania dziś zdejmuje linię – także gdy to blok jednej z kilku; bez P1 – brak linii', () => {
    expect(morningPriorityLine(items([p1('a')]), true, [{ task: 'a', requests: [] }], WED)).toBeNull()
    expect(morningPriorityLine(items([p1('a'), p1('b')]), true, [{ task: 'a', requests: [] }], WED)).toBeNull()
    expect(morningPriorityLine(items([task('x', { list: 'today' })]), true, [], WED)).toBeNull()
  })
})

describe('widok „Listy” / „Macierz” pamiętany przez okno (D450)', () => {
  const storage = (initial: Record<string, string> = {}) => {
    const map = new Map(Object.entries(initial))
    return { map, api: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } }
  }

  it('bez zapisu – „Listy”; zapisana „Macierz” wraca po ponownym otwarciu strony; „Listy” z powrotem', () => {
    const s = storage()
    vi.stubGlobal('localStorage', s.api)
    expect(readCasesView()).toBe('lists')
    rememberCasesView('matrix')
    expect(s.map.get('rd.casesView')).toBe('matrix')
    expect(readCasesView()).toBe('matrix')
    rememberCasesView('lists')
    expect(readCasesView()).toBe('lists')
  })

  it('obca wartość w pamięci – „Listy”; pamięć, która rzuca – bez błędu', () => {
    vi.stubGlobal('localStorage', storage({ 'rd.casesView': 'coś' }).api)
    expect(readCasesView()).toBe('lists')
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    }
    vi.stubGlobal('localStorage', broken)
    expect(readCasesView()).toBe('lists')
    expect(() => rememberCasesView('matrix')).not.toThrow()
  })

  it('brak pamięci w ogóle (storage niedostępne) – „Listy”', () => {
    expect(readCasesView()).toBe('lists')
    expect(() => rememberCasesView('matrix')).not.toThrow()
  })
})

describe('Ctrl K i historia: priorytet po ludzku (D450)', () => {
  const recs = (requests: ReturnType<typeof requestFrom>[]) =>
    searchRecords({ today: WED, rd: rdFrom(undefined), templates: [], requests: requests as never, routines: [], series: [], blocks: [], pageLabel: PAGE_LABEL, pageKeys }).filter((r) => r.kind === 'request')

  it('podpowiedź sprawy dostaje „· ważne i pilne”; bez priorytetu i zrobiona – bez', () => {
    const list = recs([
      requestFrom(task('t1', { priority: 'p1', title: 'Czynsz' })),
      requestFrom(task('t2', { priority: 'p4', title: 'Drobiazg' })),
      requestFrom(task('t3', { title: 'Bez' })),
      requestFrom({ ...task('t4', { priority: 'p2', title: 'Zrobione' }), state: 'done', list: 'done', doneAt: at(WED) })
    ])
    const hint = (id: string) => list.find((r) => r.id === id)!.hint
    expect(hint('t1')).toBe('zadanie · Skrzynka · ważne i pilne')
    expect(hint('t2')).toBe('zadanie · Skrzynka · ani to, ani to')
    expect(hint('t3')).toBe('zadanie · Skrzynka')
    expect(hint('t4')).toBe('zadanie · Zrobione')
  })

  it('termin i priorytet razem: termin pierwszy', () => {
    const list = recs([requestFrom(task('t1', { priority: 'p3', dueDate: '2026-11-13' }))])
    expect(list[0]!.hint).toBe('zadanie · Skrzynka · termin pt 13.11 · pilne')
  })

  it('nazwa pola i wartość w historii zmian', () => {
    const n = { rd: rdFrom(undefined) }
    expect(fieldText(paths.record('request', 'a'), ['priority'], n)).toBe('priorytet')
    expect(valueText('priority', 'p1', n)).toBe('Ważne i pilne')
    expect(valueText('priority', 'p4', n)).toBe('Ani to, ani to')
    expect(valueText('priority', null, n)).toBe('—')
  })
})
