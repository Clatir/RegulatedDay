/**
 * „Sprawy” – terminy i daty wykonania na ekranach (HKU2, część B: D409, D451, D452) bez DOM: przyciski dat pola „Termin” /
 * „Wykonać” („Koniec tygodnia” w środę i w niedzielę), znaczek terminu i dopisek „wykonać …” w linii statusu, znaczek na
 * kafelku bloku zadania na osi „Dziś” (dni minione bez znaczka), karta „Terminy” planu porannego (moduł próśb, próg, „Pomiń”)
 * i podgląd szybkiego zapisu.
 */
import { describe, expect, it } from 'vitest'
import { dueBadge } from '@shared/engine/caseDates'
import { caseItems } from '@shared/engine/cases'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { newRequest, newTask, requestFrom, type NewTask } from '@shared/model/requests'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { parseQuickDates } from '@shared/quickDates'
import { placeLogical } from '@shared/time/day'
import { DATE_PRESETS, dueTone, morningDeadlines, presetDate, sectionsOf, statusParts } from '@renderer/features/cases/casesLogic'
import { dayAxis } from '@renderer/features/plan/dayItems'
import type { DayModel } from '@renderer/store/day'
import { Scenario } from '../unit/engine/dsl'

// The week of 9–15.11.2026 (Monday to Sunday); 11.11 is a Wednesday.
const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'
const SUN = '2026-11-15'
const MON = '2026-11-16'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const task = (id: string, p: Partial<NewTask> = {}, on = WED) => newTask(id, at(on), on, { title: `zadanie ${id}`, ...p })!
const rec = (id: string, p: Partial<NewTask> = {}) => requestFrom(task(id, p))!
const items = (raws: Array<Record<string, unknown>>, today = WED) => caseItems(raws.map((r) => requestFrom(r)!), today, () => undefined)

describe('przyciski dat pól „Termin” i „Wykonać” (D409, D451)', () => {
  it('„Dziś”, „Jutro”, „Koniec tygodnia” – etykiety w tej kolejności', () => {
    expect(DATE_PRESETS.map((p) => p.label)).toEqual(['Dziś', 'Jutro', 'Koniec tygodnia'])
  })

  it('w środę: dziś, jutro, niedziela tego tygodnia', () => {
    expect(DATE_PRESETS.map((p) => presetDate(p.id, WED))).toEqual([WED, THU, SUN])
  })

  it('w niedzielę „Koniec tygodnia” to ta niedziela, w poniedziałek – niedziela za sześć dni', () => {
    expect(presetDate('week', SUN)).toBe(SUN)
    expect(presetDate('week', MON)).toBe('2026-11-22')
    expect(presetDate('tomorrow', SUN)).toBe(MON)
  })
})

describe('znaczek terminu na liście (D409)', () => {
  it('po terminie jest czerwony, pozostałe stonowane; bez terminu i zrobione – bez znaczka', () => {
    expect(dueTone(dueBadge(rec('a', { dueDate: '2026-11-10' }), WED)!)).toBe('over')
    for (const due of [WED, THU, '2026-11-14', '2026-11-30']) expect(dueTone(dueBadge(rec('a', { dueDate: due }), WED)!)).toBe('soon')
    expect(dueBadge(rec('a'), WED)).toBeNull()
  })
})

describe('linia statusu z dopiskiem „wykonać …” (D451, D452)', () => {
  it('data wykonania poza tym tygodniem – dopisek przy zaplanowaniu i powrocie z „Dziś”; w tym tygodniu i dziś – bez dopisku', () => {
    const far = items([task('a', { doDate: '2026-11-25' })], MON)[0]!
    expect(statusParts(far, MON)).toEqual(['wykonać śr 25.11'])
    expect(statusParts(far)).toEqual([])
    const near = items([task('b', { doDate: FRI })], WED)[0]!
    expect(statusParts(near, WED)).toEqual([])
    const rolled = items([task('c', { list: 'today' }, WED)], FRI)[0]!
    expect(statusParts(rolled, FRI)).toEqual(['wróciło z „Dziś” 11.11.2026'])
  })

  it('zrobiona sprawa nie ma dopisku', () => {
    const done = items([{ ...task('d', { doDate: '2026-11-25' }), list: 'done', state: 'done', doneAt: at(WED) }], MON)[0]!
    expect(statusParts(done, MON).some((p) => p.startsWith('wykonać'))).toBe(false)
  })
})

describe('kolejność na stronie – sprawy z terminem pierwsze (D409, T854)', () => {
  it('lista „Skrzynka”: po terminie i najbliższy termin przed resztą', () => {
    const list = items([task('plain'), task('late', { dueDate: FRI }), task('over', { dueDate: '2026-11-09' })])
    expect(sectionsOf(list, { showOlder: false })[0]!.items.map((x) => x.record.id)).toEqual(['over', 'late', 'plain'])
  })
})

describe('karta „Terminy” planu porannego (D409, D452)', () => {
  const list = () => items([task('over', { dueDate: '2026-11-09' }), task('soon', { dueDate: THU }), task('far', { dueDate: '2026-11-20' }), task('none'), task('onToday', { dueDate: THU, list: 'today' }), newRequest('r', at(WED), { person: 'mama', estimateMin: 10, note: '', dueDate: WED })])
  const ids = (xs: Array<{ record: { id: string } }>) => xs.map((x) => x.record.id)

  it('po terminie i z terminem w progu, bez „Dziś” i bez dalekich', () => {
    expect(ids(morningDeadlines(list(), true, [], WED, 2, {}))).toEqual(['over', 'r', 'soon'])
  })

  it('moduł próśb wyłączony – bez próśb, jak strona', () => {
    expect(ids(morningDeadlines(list(), false, [], WED, 2, {}))).toEqual(['over', 'soon'])
  })

  it('„Pomiń” (asked) chowa sprawę; sprawa z blokiem dziś też nie jest na karcie; pusta – pusta lista (brak karty)', () => {
    expect(ids(morningDeadlines(list(), true, [], WED, 2, { 'deadline:over': 'skip' }))).toEqual(['r', 'soon'])
    expect(ids(morningDeadlines(list(), true, [{ task: 'soon', requests: [] }], WED, 2, {}))).toEqual(['over', 'r'])
    expect(morningDeadlines(items([task('a'), task('b', { dueDate: '2026-11-30' })]), true, [], WED, 2, {})).toEqual([])
  })

  it('próg: 1 dzień – dziś i jutro, 7 dni – tydzień naprzód', () => {
    const l = items([task('d0', { dueDate: WED }), task('d1', { dueDate: THU }), task('d2', { dueDate: FRI }), task('d7', { dueDate: '2026-11-18' }), task('d8', { dueDate: '2026-11-19' })])
    expect(ids(morningDeadlines(l, true, [], WED, 1, {}))).toEqual(['d0', 'd1'])
    expect(ids(morningDeadlines(l, true, [], WED, 7, {}))).toEqual(['d0', 'd1', 'd2', 'd7'])
  })
})

describe('znaczek na kafelku bloku zadania na osi „Dziś” (D409)', () => {
  const DATE = '2026-11-12'
  /** The axis of DATE for a plan with the task's block, the sprawa as the names have it; `today` – the day the window lives on. */
  const axis = (due: string | null, today: string | null, o: { done?: boolean } = {}) => {
    const s = new Scenario({ date: DATE, plan: [planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, task: 't1', origin: 'user' }), planBlock({ id: 'b2', categoryId: 'inne', startMin: 720, durationMin: 30, origin: 'user' })] })
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const raw = { ...task('t1', { dueDate: due }, DATE), ...(o.done ? { state: 'done', list: 'done', doneAt: at(DATE) } : {}) }
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [requestFrom(raw)!] }
    return new Map(dayAxis(model, names, null, today).items.map((i) => [i.id, i.badge]))
  }

  it('termin jutro – znaczek „Termin jutro”, po terminie – „Po terminie” w tonie „over”; blok bez zadania – bez znaczka', () => {
    expect(axis(FRI, DATE).get('b1')).toEqual({ text: 'Termin jutro', tone: 'soon' })
    expect(axis('2026-11-10', DATE).get('b1')).toEqual({ text: 'Po terminie', tone: 'over' })
    expect(axis(FRI, DATE).get('b2')).toBeUndefined()
  })

  it('dzień miniony (dzień osi przed dniem okna) – bez znaczka; zadanie zrobione i bez terminu – też; bez dnia okna (szablony) – też', () => {
    expect(axis(FRI, '2026-11-13').get('b1')).toBeUndefined()
    expect(axis(FRI, DATE, { done: true }).get('b1')).toBeUndefined()
    expect(axis(null, DATE).get('b1')).toBeUndefined()
    expect(axis(FRI, null).get('b1')).toBeUndefined()
  })

  it('dzień przyszły: znaczek liczony od dzisiejszego dnia, nie od dnia osi', () => {
    expect(axis('2026-11-14', '2026-11-11').get('b1')).toEqual({ text: 'Termin za 3 dni', tone: 'soon' })
  })
})

describe('podgląd szybkiego zapisu pod polem (D409, T856)', () => {
  it('„!jutro” i „@pt” – podgląd z dwoma polami; bez słów – brak podglądu', () => {
    expect(parseQuickDates('Raport !jutro @pt', WED)).toMatchObject({ title: 'Raport', preview: 'Termin: jutro · Wykonać: pt 13.11' })
    expect(parseQuickDates('Raport', WED).preview).toBeNull()
  })
})
