/**
 * „Sprawy” – the due date and the date of doing (HKU2: D409, D451): the fields of the record (an old file reads without
 * them), the lists by the date of doing (counted from the logical day, nothing written at 04:00; a move by hand on the
 * date or after it wins, one before it does not), the badges of the due date, the order of the lists, the morning plan's
 * card of due dates with its threshold and its „Pomiń”, and the words of the quick capture („!jutro”, „@pt”, „!20.11”).
 */
import { describe, expect, it } from 'vitest'
import { caseCompare, caseItems, casesRitual, listedRaw, listOf, patchedRaw, rolledFrom, scheduledRaw, type CaseItem } from '@shared/engine/cases'
import { DEADLINE_SKIP, deadlineAskKey, deadlineCases, deadlineSkippedRaw, doText, dueBadge } from '@shared/engine/caseDates'
import { parseQuickDates } from '@shared/quickDates'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { fieldByKey } from '@shared/model/fields'
import { DEFAULT_GENERAL, generalFrom } from '@shared/model/rd'
import { newRequest, newTask, requestFrom, type NewTask, type RequestRecord } from '@shared/model/requests'
import { logicalDayOf, placeLogical } from '@shared/time/day'

// The week of 9–15.11.2026 (Monday to Sunday); 11.11 is a Wednesday.
const TUE = '2026-11-10'
const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'
const SAT = '2026-11-14'
const SUN = '2026-11-15'
const MON = '2026-11-16'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const rec = (raw: Record<string, unknown>): RequestRecord => requestFrom(raw)!
const task = (p: Partial<NewTask> = {}, id = 't', on = WED) => newTask(id, at(on), on, { title: 'x', ...p })!
const item = (raw: Record<string, unknown>, today: string): CaseItem => caseItems([rec(raw)], today, () => null)[0]!

describe('pola terminu i daty wykonania (D409)', () => {
  it('stary plik bez pól czyta się bez zmian: bez terminu, bez daty wykonania, lista jak dotąd', () => {
    const old = { schema: 1, id: 'q', person: 'mama', estimateMin: 20, note: 'zakupy', createdAt: 1, state: 'queued', day: null, block: null }
    expect(rec(old)).toMatchObject({ dueDate: null, doDate: null, listSetDay: null })
    expect(listOf(rec(old), WED)).toBe('inbox')
    const l2 = { ...task(), list: 'week' }
    delete (l2 as Record<string, unknown>).dueDate
    delete (l2 as Record<string, unknown>).doDate
    expect(listOf(rec(l2), WED)).toBe('week')
  })

  it('zła data czyta się jako brak; nieznane pola zostają w pliku przy zmianie', () => {
    expect(rec({ ...task(), dueDate: '2026-02-30', doDate: 20261111, listSetDay: 'wczoraj' })).toMatchObject({ dueDate: null, doDate: null, listSetDay: null })
    const raw = { ...task(), future: { a: 1 } }
    expect(patchedRaw(raw, { dueDate: FRI }, at(WED))).toMatchObject({ raw: { dueDate: FRI, future: { a: 1 } } })
  })

  it('nowe zadanie i prośba niosą oba pola (zadanie własne i prośba); bez nich – null', () => {
    expect(rec(task({ dueDate: FRI, doDate: THU }))).toMatchObject({ dueDate: FRI, doDate: THU })
    expect(rec(task())).toMatchObject({ dueDate: null, doDate: null })
    expect(rec(task({ dueDate: 'piątek' as string }))).toMatchObject({ dueDate: null })
    expect(rec(newRequest('r', at(WED), { person: 'mama', estimateMin: null, note: '', dueDate: FRI, doDate: null }))).toMatchObject({ kind: 'request', dueDate: FRI, doDate: null })
    expect(rec(newRequest('r', at(WED), { person: 'mama', estimateMin: null, note: '' }))).toMatchObject({ dueDate: null, doDate: null })
  })

  it('zmiana pól: data ustawiona, null czyści, zła – odmowa z powodem', () => {
    const raw = task({ dueDate: FRI, doDate: THU })
    expect(patchedRaw(raw, { dueDate: null }, at(WED))).toMatchObject({ raw: { dueDate: null, doDate: THU } })
    expect(patchedRaw(raw, { doDate: null }, at(WED))).toMatchObject({ raw: { dueDate: FRI, doDate: null } })
    expect(patchedRaw(raw, { dueDate: '2026-13-01' }, at(WED))).toEqual({ error: 'Termin: nie ma takiego dnia.' })
    expect(patchedRaw(raw, { doDate: 'jutro' }, at(WED))).toEqual({ error: 'Wykonać: nie ma takiego dnia.' })
    // A request has both fields too.
    const req = newRequest('r', at(WED), { person: 'mama', estimateMin: null, note: '' })
    expect(patchedRaw(req, { dueDate: SAT, doDate: FRI }, at(WED))).toMatchObject({ raw: { kind: 'request', dueDate: SAT, doDate: FRI } })
  })
})

describe('listy z datą wykonania (D451)', () => {
  it('w dniu daty sprawa stoi na „Dziś”; niezrobiona następnego dnia – na „W tym tygodniu” jak każda z „Dziś”', () => {
    const r = rec(task({ doDate: FRI }))
    expect(listOf(r, FRI)).toBe('today')
    expect(rolledFrom(r, FRI)).toBeNull()
    expect(listOf(r, SAT)).toBe('week')
    expect(rolledFrom(r, SAT)).toBe(FRI)
    expect(listOf(r, MON)).toBe('week')
    expect(item(task({ doDate: FRI }), SAT)).toMatchObject({ list: 'week', rolledFrom: FRI })
    // Done – never back.
    expect(listOf(rec(listedRaw(task({ doDate: FRI }), 'done', at(THU))), FRI)).toBe('done')
  })

  it('doba logiczna: o 02:00 po dniu daty to jeszcze ten dzień – „Dziś”; o 04:00 – „W tym tygodniu” (bez zapisu)', () => {
    const r = rec(task({ doDate: FRI }))
    const listAt = (ms: number) => caseItems([r], logicalDayOf(ms), () => null)[0]!.list
    expect(listAt(placeLogical(FRI, 26 * 60))).toBe('today')
    expect(listAt(placeLogical(SAT, 4 * 60))).toBe('week')
  })

  it('przed datą w bieżącym tygodniu – na „W tym tygodniu” ze „Skrzynki” i „Kiedyś / Może”; bez dopisku', () => {
    expect(listOf(rec(task({ doDate: FRI })), WED)).toBe('week')
    expect(listOf(rec(task({ doDate: SUN, list: 'someday' })), WED)).toBe('week')
    expect(listOf(rec(task({ doDate: FRI, list: 'week' })), WED)).toBe('week')
    expect(doText(rec(task({ doDate: FRI })), WED)).toBeNull()
  })

  it('dalsza data – na swojej liście z dopiskiem „wykonać <dzień>”; w jej tygodniu – „W tym tygodniu”, w jej dniu – „Dziś”', () => {
    const r = rec(task({ doDate: '2026-11-18' }))
    expect(listOf(r, WED)).toBe('inbox')
    expect(doText(r, WED)).toBe('wykonać śr 18.11')
    expect(listOf(rec(task({ doDate: '2026-11-18', list: 'someday' })), SUN)).toBe('someday')
    expect(listOf(r, MON)).toBe('week')
    expect(doText(r, MON)).toBeNull()
    expect(listOf(r, '2026-11-18')).toBe('today')
    expect(doText(r, '2026-11-18')).toBeNull()
    // Another year: with its year.
    expect(doText(rec(task({ doDate: '2027-01-05' })), WED)).toBe('wykonać wt 05.01.2027')
    // No date, or done – nothing.
    expect(doText(rec(task()), WED)).toBeNull()
    expect(doText(rec(listedRaw(task({ doDate: '2026-11-18' }), 'done', at(WED))), WED)).toBeNull()
  })

  it('ręczne przeniesienie w dniu daty wygrywa z datą – sprawa zostaje, gdzie ją przeniosłeś', () => {
    const moved = listedRaw(task({ doDate: FRI }), 'inbox', at(FRI))
    expect(rec(moved)).toMatchObject({ listSetDay: FRI, doDate: FRI })
    expect(listOf(rec(moved), FRI)).toBe('inbox')
    expect(listOf(rec(moved), SAT)).toBe('inbox')
    // At 02:00 after the date's day – still that day (04:00, D383): the move wins.
    expect(listOf(rec(listedRaw(task({ doDate: FRI }), 'someday', placeLogical(FRI, 26 * 60))), FRI)).toBe('someday')
  })

  it('ręczne przeniesienie po dniu daty wygrywa', () => {
    const moved = listedRaw(task({ doDate: FRI }), 'someday', at(SUN))
    expect(listOf(rec(moved), SUN)).toBe('someday')
    expect(rolledFrom(rec(moved), SUN)).toBeNull()
  })

  it('przeniesienie przed datą nie wygrywa: trzyma do dnia daty, w dniu daty i tak „Dziś”', () => {
    const moved = rec(listedRaw(task({ doDate: FRI }), 'someday', at(WED)))
    expect(listOf(moved, WED)).toBe('someday')
    expect(listOf(moved, THU)).toBe('someday')
    expect(doText(moved, THU)).toBe('wykonać jutro')
    expect(listOf(moved, FRI)).toBe('today')
    expect(listOf(moved, SAT)).toBe('week')
  })

  it('ręczne przeniesienie na „Dziś” daty nie zmienia (D409): przed datą „Dziś” tego dnia, w dniu daty znów „Dziś”', () => {
    const moved = rec(listedRaw(task({ doDate: FRI }), 'today', at(WED)))
    expect(moved.doDate).toBe(FRI)
    expect(listOf(moved, WED)).toBe('today')
    expect(listOf(moved, THU)).toBe('week')
    expect(rolledFrom(moved, THU)).toBe(WED)
    expect(listOf(moved, FRI)).toBe('today')
    expect(listOf(moved, SAT)).toBe('week')
    expect(rolledFrom(moved, SAT)).toBe(FRI)
  })

  it('data wykonania ustawiona po ręcznym przeniesieniu znów rządzi listą', () => {
    const moved = listedRaw(task(), 'week', at(FRI))
    expect(rec(moved).listSetDay).toBe(FRI)
    const dated = (patchedRaw(moved, { doDate: FRI }, at(FRI)) as { raw: Record<string, unknown> }).raw
    expect(rec(dated)).toMatchObject({ doDate: FRI, listSetDay: null })
    expect(listOf(rec(dated), FRI)).toBe('today')
    // The same date again: the move stays the move.
    expect(rec((patchedRaw(listedRaw(dated, 'week', at(FRI)), { doDate: FRI }, at(FRI)) as { raw: Record<string, unknown> }).raw).listSetDay).toBe(FRI)
  })

  it('zrobiona z datą wykonania, zaplanowana dziś na osi – na „Dziś” (zmiana listy liczy się jak przeniesienie)', () => {
    const done = listedRaw(task({ doDate: TUE }), 'done', at(TUE))
    const planned = scheduledRaw(done, WED, 'b1', at(WED))
    expect(rec(planned)).toMatchObject({ list: 'today', listSetDay: WED })
    expect(listOf(rec(planned), WED)).toBe('today')
  })

  it('rytuał dnia daty wymienia sprawę, która wróci o 04:00; dzień wcześniej – nie', () => {
    const r = rec({ ...task({ doDate: FRI }), id: 'a' })
    expect(casesRitual(FRI, FRI, [r], []).back.map((x) => x.id)).toEqual(['a'])
    expect(casesRitual(THU, THU, [r], []).back).toEqual([])
    // Moved by hand on its day: it stays where it went – not „back”.
    expect(casesRitual(FRI, FRI, [rec({ ...listedRaw(task({ doDate: FRI }), 'inbox', at(FRI)), id: 'b' })], []).back).toEqual([])
  })
})

describe('znaczki terminu (D409)', () => {
  const badge = (dueDate: string | null) => dueBadge(rec(task({ dueDate })), WED)
  it('po terminie, dziś, jutro, za 2–7 dni, dalej data; zrobiona i bez terminu – nic', () => {
    expect(badge(TUE)).toEqual({ kind: 'over', days: -1, text: 'Po terminie' })
    expect(badge(WED)).toEqual({ kind: 'today', days: 0, text: 'Termin dziś' })
    expect(badge(THU)).toEqual({ kind: 'tomorrow', days: 1, text: 'Termin jutro' })
    expect(badge(FRI)).toEqual({ kind: 'days', days: 2, text: 'Termin za 2 dni' })
    expect(badge(SAT)).toEqual({ kind: 'days', days: 3, text: 'Termin za 3 dni' })
    expect(badge(MON)).toEqual({ kind: 'days', days: 5, text: 'Termin za 5 dni' })
    expect(badge('2026-11-18')).toEqual({ kind: 'days', days: 7, text: 'Termin za 7 dni' })
    expect(badge('2026-11-19')).toEqual({ kind: 'date', date: '2026-11-19', text: 'Termin cz 19.11' })
    expect(badge('2027-01-05')).toEqual({ kind: 'date', date: '2027-01-05', text: 'Termin wt 05.01.2027' })
    expect(badge(null)).toBeNull()
    expect(dueBadge(rec(listedRaw(task({ dueDate: TUE }), 'done', at(WED))), WED)).toBeNull()
  })
})

describe('kolejność list (D409, pod D450)', () => {
  it('najpierw po terminie i z terminem rosnąco, potem reszta w dotychczasowej kolejności (najnowsze na górze)', () => {
    const items = [
      { ...task({}, 'a'), createdAt: 5 },
      { ...task({ dueDate: FRI }, 'b'), createdAt: 1 },
      { ...task({ dueDate: THU }, 'c'), createdAt: 2 },
      { ...task({ dueDate: TUE }, 'd'), createdAt: 3 },
      { ...task({}, 'e'), createdAt: 4 },
      { ...task({ dueDate: FRI }, 'f'), createdAt: 6 }
    ].map((raw) => item(raw, WED))
    expect([...items].sort(caseCompare).map((x) => x.record.id)).toEqual(['d', 'c', 'f', 'b', 'a', 'e'])
  })

  it('„Zrobione” bez zmian: najpóźniej zrobione na górze, termin nie liczy się', () => {
    const done = [listedRaw(task({ dueDate: TUE }, 'x'), 'done', at(WED, 9)), listedRaw(task({}, 'y'), 'done', at(WED, 15))].map((raw) => item(raw, WED))
    expect([...done].sort(caseCompare).map((x) => x.record.id)).toEqual(['y', 'x'])
  })
})

describe('plan poranny: terminy (D409)', () => {
  const ids = (xs: readonly CaseItem[]) => xs.map((x) => x.record.id)
  const raws = [
    task({ dueDate: TUE }, 'over'),
    task({ dueDate: WED }, 'today'),
    task({ dueDate: THU }, 'd1'),
    task({ dueDate: FRI }, 'd2'),
    task({ dueDate: SAT }, 'd3'),
    task({ dueDate: '2026-11-18' }, 'd7'),
    task({ dueDate: '2026-11-19' }, 'd8'),
    task({}, 'none')
  ]
  const items = raws.map((raw) => item(raw, WED))

  it('próg 1 – dziś i jutro; 2 (domyślnie) – do pojutrza; 7 – tydzień; po terminie zawsze', () => {
    expect(ids(deadlineCases(items, [], WED, 1))).toEqual(['over', 'today', 'd1'])
    expect(ids(deadlineCases(items, [], WED, DEFAULT_GENERAL.deadlineDays))).toEqual(['over', 'today', 'd1', 'd2'])
    expect(ids(deadlineCases(items, [], WED, 7))).toEqual(['over', 'today', 'd1', 'd2', 'd3', 'd7'])
  })

  it('bez spraw z blokiem dziś (zadanie i prośba w bloku próśb), zrobionych, z listy „Dziś” i pominiętych dziś', () => {
    const more = [
      ...items,
      item({ ...newRequest('req', at(WED), { person: 'mama', estimateMin: null, note: '', dueDate: WED }) }, WED),
      item(listedRaw(task({ dueDate: WED }, 'done'), 'done', at(WED)), WED),
      item(listedRaw(task({ dueDate: WED }, 'onToday'), 'today', at(WED)), WED)
    ]
    const blocks = [planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, task: 'd1' }), planBlock({ id: 'b2', categoryId: 'prosby', startMin: 700, durationMin: 15, requests: ['req'] })]
    const day = dayFileFrom(deadlineSkippedRaw(null, WED, 'today'), WED)
    expect(day.asked[deadlineAskKey('today')]).toBe(DEADLINE_SKIP)
    expect(ids(deadlineCases(more, blocks, WED, 2, day.asked))).toEqual(['over', 'd2'])
    // „Pomiń” is of that day: the next day it is back.
    expect(ids(deadlineCases(items, [], THU, 2)).includes('today')).toBe(true)
  })
})

describe('ustawienie progu (D409, D451)', () => {
  it('domyślnie 2, zakres 1–7; zła wartość – domyślna', () => {
    expect(generalFrom({}).deadlineDays).toBe(2)
    expect(generalFrom({ deadlineDays: 7 }).deadlineDays).toBe(7)
    expect(generalFrom({ deadlineDays: 1 }).deadlineDays).toBe(1)
    for (const bad of [0, 8, 1.5, '3', null]) expect(generalFrom({ deadlineDays: bad }).deadlineDays).toBe(2)
    expect(fieldByKey('deadlineDays')).toMatchObject({ scope: 'general', path: ['deadlineDays'], range: [1, 7], kind: 'integer', group: 'cases' })
  })
})

describe('szybki zapis: słowa daty na końcu tytułu (D409)', () => {
  const p = (text: string) => parseQuickDates(text, WED)
  it('!jutro, !dziś, !dzis – termin; rozpoznane słowo znika z tytułu; podgląd pod polem', () => {
    expect(p('Zapłacić czynsz !jutro')).toEqual({ title: 'Zapłacić czynsz', dueDate: THU, doDate: null, preview: 'Termin: jutro' })
    expect(p('Zapłacić czynsz !dziś')).toMatchObject({ title: 'Zapłacić czynsz', dueDate: WED, preview: 'Termin: dziś' })
    expect(p('Zapłacić czynsz !dzis')).toMatchObject({ dueDate: WED })
    expect(p('Zapłacić czynsz !Jutro')).toMatchObject({ dueDate: THU })
  })

  it('dni tygodnia: najbliższy taki dzień od jutra (dziś środa – „!śr” to środa za tydzień)', () => {
    expect(p('X !pt')).toMatchObject({ title: 'X', dueDate: FRI, preview: 'Termin: pt 13.11' })
    expect(p('X !czw').dueDate).toBe(THU)
    expect(p('X !pon').dueDate).toBe(MON)
    expect(p('X !pn').dueDate).toBe(MON)
    expect(p('X !wt').dueDate).toBe('2026-11-17')
    expect(p('X !śr').dueDate).toBe('2026-11-18')
    expect(p('X !sr').dueDate).toBe('2026-11-18')
    expect(p('X !sob').dueDate).toBe(SAT)
    expect(p('X !nd').dueDate).toBe(SUN)
    expect(p('X !niedziela').dueDate).toBe(SUN)
    expect(p('X !piątek').dueDate).toBe(FRI)
  })

  it('data: bez roku – najbliższa przyszła albo dzisiejsza; z rokiem – ta', () => {
    expect(p('X !20.11')).toMatchObject({ title: 'X', dueDate: '2026-11-20', preview: 'Termin: pt 20.11' })
    expect(p('X !11.11').dueDate).toBe(WED)
    expect(p('X !10.11').dueDate).toBe('2027-11-10')
    expect(p('X !20.11.2027')).toMatchObject({ dueDate: '2027-11-20', preview: 'Termin: sb 20.11.2027' })
    expect(p('X !5.1').dueDate).toBe('2027-01-05')
  })

  it('„@…” – data wykonania; oba w jednym tytule w dowolnej kolejności', () => {
    expect(p('Raport @jutro')).toEqual({ title: 'Raport', dueDate: null, doDate: THU, preview: 'Wykonać: jutro' })
    expect(p('Raport !20.11 @jutro')).toEqual({ title: 'Raport', dueDate: '2026-11-20', doDate: THU, preview: 'Termin: pt 20.11 · Wykonać: jutro' })
    expect(p('Raport @jutro !20.11')).toEqual({ title: 'Raport', dueDate: '2026-11-20', doDate: THU, preview: 'Termin: pt 20.11 · Wykonać: jutro' })
  })

  it('nierozpoznane „!coś” zostaje w tytule; słowo w środku – też; drugie tego samego znaku – zostaje', () => {
    expect(p('Kup mleko !coś')).toEqual({ title: 'Kup mleko !coś', dueDate: null, doDate: null, preview: null })
    expect(p('Kup mleko !coś !jutro')).toMatchObject({ title: 'Kup mleko !coś', dueDate: THU })
    expect(p('Kup !jutro mleko')).toMatchObject({ title: 'Kup !jutro mleko', dueDate: null })
    expect(p('Kup mleko !31.02')).toMatchObject({ title: 'Kup mleko !31.02', dueDate: null })
    expect(p('X !pt !jutro')).toMatchObject({ title: 'X !pt', dueDate: THU })
    expect(p('Uwaga!')).toMatchObject({ title: 'Uwaga!', dueDate: null })
    expect(p('napisz do jan@poczta.pl')).toMatchObject({ title: 'napisz do jan@poczta.pl', doDate: null })
  })

  it('same słowa – pusty tytuł (zapis odmówi); spacje przycięte', () => {
    expect(p('!jutro')).toMatchObject({ title: '', dueDate: THU })
    expect(p('  Kup mleko   !jutro  ')).toMatchObject({ title: 'Kup mleko', dueDate: THU })
    expect(p('')).toEqual({ title: '', dueDate: null, doDate: null, preview: null })
  })
})
