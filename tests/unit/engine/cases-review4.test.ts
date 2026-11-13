/**
 * „Sprawy” – HKU2 po przeglądzie (D454): data wykonania na dzień przyszły oddaje decyzję dacie także dla sprawy stojącej dziś
 * na „Dziś”; data, która minęła w chwili wpisania, nie zmienia listy; karta „Terminy” pomija sprawy z kroku próśb i zadań,
 * a krok porządkuje je jak listy (termin najpierw); słowa daty tylko ze słowem dnia albo z kropkami.
 */
import { describe, expect, it } from 'vitest'
import { caseItems, casesRitual, listedRaw, listOf, morningCases, patchedRaw, rolledFrom, scheduledRaw, unscheduledRaw } from '@shared/engine/cases'
import { deadlineCases, doText } from '@shared/engine/caseDates'
import { parseQuickDates } from '@shared/quickDates'
import { newRequest, newTask, requestFrom, type NewTask, type RequestRecord } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'

// The week of 9–15.11.2026 (Monday to Sunday).
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const task = (p: Partial<NewTask> = {}, id = 't', on = MON) => newTask(id, at(on), on, { title: `zadanie ${id}`, ...p })!
const rec = (raw: Record<string, unknown>): RequestRecord => requestFrom(raw)!
const patched = (raw: Record<string, unknown>, patch: Parameters<typeof patchedRaw>[1], when: string) => {
  const r = patchedRaw(raw, patch, at(when))
  if (!('raw' in r)) throw new Error(r.error)
  return r.raw
}

describe('data wykonania na dzień przyszły a sprawa z „Dziś” (D454)', () => {
  it('w poniedziałek zadanie z „Dziś” z datą czwartek: pn i wt „W tym tygodniu”, cz „Dziś”, bez „wróciło z Dziś”', () => {
    const onToday = listedRaw(task(), 'today', at(MON))
    expect(listOf(rec(onToday), MON)).toBe('today')
    const set = patched(onToday, { doDate: THU }, MON)
    expect(listOf(rec(set), MON)).toBe('week')
    expect(listOf(rec(set), TUE)).toBe('week')
    expect(rolledFrom(rec(set), TUE)).toBeNull()
    expect(listOf(rec(set), THU)).toBe('today')
    expect(rolledFrom(rec(set), THU)).toBeNull()
    expect(listOf(rec(set), FRI)).toBe('week')
    expect(rolledFrom(rec(set), FRI)).toBe(THU)
    expect(casesRitual(MON, MON, [rec(set)], []).back).toEqual([])
  })

  it('zmiana daty z jednej przyszłej na drugą: znów decyduje data', () => {
    const onToday = listedRaw(task(), 'today', at(MON))
    const set = patched(onToday, { doDate: WED }, MON)
    const moved = patched(listedRaw(set, 'today', at(MON)), { doDate: THU }, MON)
    expect(listOf(rec(moved), MON)).toBe('week')
    expect(listOf(rec(moved), THU)).toBe('today')
  })

  it('data równa dziś – „Dziś” (bez zmian reguły); data jutrzejsza ze „Skrzynki” – „W tym tygodniu”', () => {
    expect(listOf(rec(patched(task(), { doDate: WED }, WED)), WED)).toBe('today')
    expect(listOf(rec(patched(task(), { doDate: THU }, WED)), WED)).toBe('week')
  })
})

describe('data wykonania poza bieżącym tygodniem i sprawa zaplanowana dziś (D455)', () => {
  const NEXT_MONTH = '2026-12-14'
  const NEXT_MON = '2026-11-16'

  it('dalsza data zdejmuje sprawę z „Dziś” do „Skrzynki” z dopiskiem „wykonać …”, a w swoim tygodniu i dniu przywraca', () => {
    const onToday = listedRaw(task(), 'today', at(MON))
    const set = rec(patched(onToday, { doDate: NEXT_MONTH }, MON))
    expect(listOf(set, MON)).toBe('inbox')
    expect(listOf(set, THU)).toBe('inbox')
    expect(doText(set, MON)).toBe('wykonać pn 14.12')
    expect(rolledFrom(set, TUE)).toBeNull()
    expect(listOf(set, NEXT_MONTH)).toBe('today')
    expect(casesRitual(MON, MON, [set], []).back).toEqual([])
  })

  it('poniedziałek następnego tygodnia to już „Skrzynka”; niedziela bieżącego – „W tym tygodniu”', () => {
    const onToday = listedRaw(task(), 'today', at(WED))
    expect(listOf(rec(patched(onToday, { doDate: NEXT_MON }, WED)), WED)).toBe('inbox')
    expect(listOf(rec(patched(onToday, { doDate: '2026-11-15' }, WED)), WED)).toBe('week')
  })

  it('sprawa zaplanowana dziś w bloku zostaje na „Dziś” (blok ją trzyma), także przy dalszej dacie', () => {
    const planned = scheduledRaw(listedRaw(task(), 'today', at(MON)), MON, 'b1', at(MON))
    for (const date of [THU, NEXT_MONTH]) {
      const set = patched(planned, { doDate: date }, MON)
      expect(set).toMatchObject({ list: 'today', listDay: MON, day: MON, block: 'b1', doDate: date })
      expect(listOf(rec(set), MON)).toBe('today')
    }
  })

  it('po zdjęciu bloku („Wraca na listę”) sprawa idzie tam, gdzie data ją kieruje: dalsza data – „Skrzynka”, w tygodniu – „W tym tygodniu”', () => {
    const planned = scheduledRaw(listedRaw(task(), 'today', at(MON)), MON, 'b1', at(MON))
    const far = rec(unscheduledRaw(patched(planned, { doDate: NEXT_MONTH }, MON), at(MON)))
    expect(far).toMatchObject({ list: 'inbox', listDay: null, day: null, block: null, state: 'queued' })
    expect(listOf(far, TUE)).toBe('inbox')
    expect(listOf(far, NEXT_MONTH)).toBe('today')
    const near = rec(unscheduledRaw(patched(planned, { doDate: THU }, MON), at(MON)))
    expect(near).toMatchObject({ list: 'week', listDay: null, day: null, block: null })
    expect(listOf(near, THU)).toBe('today')
  })

  it('zdjęcie bloku nie rusza sprawy bez daty ani przeniesionej ręcznie na „Dziś” po ustawieniu daty', () => {
    const plain = scheduledRaw(listedRaw(task(), 'today', at(MON)), MON, 'b1', at(MON))
    expect(unscheduledRaw(plain, at(MON))).toMatchObject({ list: 'today', listDay: MON })
    const byHand = scheduledRaw(listedRaw(task({ doDate: NEXT_MONTH }), 'today', at(MON)), MON, 'b1', at(MON))
    expect(unscheduledRaw(byHand, at(MON))).toMatchObject({ list: 'today', listDay: MON })
  })
})

describe('data wykonania, która już minęła w chwili wpisania (D454)', () => {
  it('sprawa w „Skrzynce” zostaje w „Skrzynce”, bez „wróciło z Dziś”; rytuał jej nie liczy', () => {
    const set = patched(task(), { doDate: TUE }, THU)
    expect(rec(set).doDate).toBe(TUE)
    expect(listOf(rec(set), THU)).toBe('inbox')
    expect(rolledFrom(rec(set), THU)).toBeNull()
    expect(casesRitual(TUE, THU, [rec(set)], []).back).toEqual([])
    expect(caseItems([rec(set)], THU, () => null)[0]).toMatchObject({ list: 'inbox', rolledFrom: null })
  })

  it('„Kiedyś / Może” i „W tym tygodniu” zostają, gdzie były', () => {
    expect(listOf(rec(patched(listedRaw(task(), 'someday', at(MON)), { doDate: TUE }, THU)), THU)).toBe('someday')
    const week = rec(patched(listedRaw(task(), 'week', at(MON)), { doDate: TUE }, THU))
    expect(listOf(week, THU)).toBe('week')
    expect(rolledFrom(week, THU)).toBeNull()
  })

  it('sprawa, którą na „Dziś” trzymała dotychczasowa data (dziś), zostaje na „Dziś” po dacie z przeszłości', () => {
    const byDate = patched(task(), { doDate: THU }, THU)
    expect(listOf(rec(byDate), THU)).toBe('today')
    const set = patched(byDate, { doDate: TUE }, THU)
    expect(listOf(rec(set), THU)).toBe('today')
    expect(rolledFrom(rec(set), THU)).toBeNull()
    expect(listOf(rec(set), FRI)).toBe('week')
  })

  it('sprawa stojąca dziś na „Dziś” zostaje', () => {
    const set = patched(listedRaw(task(), 'today', at(THU)), { doDate: WED }, THU)
    expect(listOf(rec(set), THU)).toBe('today')
    expect(rolledFrom(rec(set), THU)).toBeNull()
  })

  it('doba logiczna: o 02:00 po północy wczorajsza (jeszcze dzisiejsza) data to „Dziś”', () => {
    const night = patchedRaw(task(), { doDate: THU }, placeLogical(THU, 26 * 60)) as { raw: Record<string, unknown> }
    expect(listOf(rec(night.raw), THU)).toBe('today')
  })
})

describe('krok próśb i zadań planu porannego a karta „Terminy” (D454)', () => {
  const req = (id: string, p: { dueDate?: string | null } = {}) => rec(newRequest(id, at(MON), { person: 'mama', estimateMin: null, note: id, ...p }))
  const items = (raws: RequestRecord[], today = WED) => caseItems(raws, today, () => null)

  it('karta pomija prośbę z kroku próśb i zadanie z „Dziś”, zostawia zadanie spoza „Dziś” i prośbę z „Kiedyś / Może”', () => {
    const list = items([
      req('r1', { dueDate: WED }),
      rec(listedRaw(newRequest('r2', at(MON), { person: 'mama', estimateMin: null, note: 'r2', dueDate: WED }), 'someday', at(MON))),
      rec(task({ dueDate: THU }, 't1')),
      rec(listedRaw(task({ dueDate: THU }, 't2'), 'today', at(WED)))
    ])
    const offered = morningCases(list)
    expect(offered.requests.map((x) => x.record.id)).toEqual(['r1'])
    expect(offered.tasks.map((x) => x.record.id)).toEqual(['t2'])
    expect(
      deadlineCases(list, [], WED, 2, {}, new Set(offered.requests.map((x) => x.record.id)))
        .map((x) => x.record.id)
        .sort()
    ).toEqual(['r2', 't1'])
  })

  it('krok porządkuje jak listy: najpierw po terminie i z najbliższym terminem, potem reszta od najnowszej', () => {
    const list = items([
      req('new'),
      req('late', { dueDate: TUE }),
      rec(task({ dueDate: FRI }, 'far')),
      rec(listedRaw(task({ dueDate: THU }, 'soon'), 'today', at(WED))),
      rec(listedRaw(task({}, 'plain', THU), 'today', at(WED))),
      rec(listedRaw(task({ dueDate: TUE }, 'over'), 'today', at(WED)))
    ])
    const { requests, tasks } = morningCases(list)
    expect(requests.map((x) => x.record.id)).toEqual(['late', 'new'])
    expect(tasks.map((x) => x.record.id)).toEqual(['over', 'soon', 'plain'])
  })
})

describe('słowa daty szybkiego zapisu – tylko słowa dnia i daty z kropką (D454)', () => {
  it('słowa dnia i daty z kropkami działają', () => {
    expect(parseQuickDates('x !jutro @dziś', WED)).toMatchObject({ title: 'x', dueDate: THU, doDate: WED })
    expect(parseQuickDates('x !20.11', WED)).toMatchObject({ title: 'x', dueDate: '2026-11-20' })
    expect(parseQuickDates('x @5.12.2026', WED)).toMatchObject({ title: 'x', doDate: '2026-12-05' })
    expect(parseQuickDates('x !pt', WED)).toMatchObject({ dueDate: FRI })
  })

  it('data RRRR-MM-DD (prawdziwy dzień) to słowo daty; z ukośnikiem albo nieistniejąca – zostaje w tytule (D455)', () => {
    expect(parseQuickDates('x !2026-11-20', WED)).toMatchObject({ title: 'x', dueDate: '2026-11-20', preview: 'Termin: pt 20.11' })
    expect(parseQuickDates('x @2027-01-05', WED)).toMatchObject({ title: 'x', doDate: '2027-01-05' })
    for (const w of ['!20/11', '@1/2', '!2026-02-30', '!2026-13-01', '!2026-11-20.']) {
      expect(parseQuickDates(`Kup mleko ${w}`, WED)).toEqual({ title: `Kup mleko ${w}`, dueDate: null, doDate: null, preview: null })
    }
  })

  it('reszta zostaje w tytule: „@1/2”, „!3”, „!12-03”, „!31.02”, „!5.13”, „!20.11.”', () => {
    for (const w of ['@1/2', '!3', '!12-03', '!31.02', '!5.13', '!32.01', '!20.11.', '!1/2/2027']) {
      expect(parseQuickDates(`Kup mleko ${w}`, WED)).toEqual({ title: `Kup mleko ${w}`, dueDate: null, doDate: null, preview: null })
    }
  })
})
