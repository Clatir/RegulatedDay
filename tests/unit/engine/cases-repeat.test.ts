/**
 * U6 (D465): a task of „Sprawy” that repeats – the rules of the series (codziennie, dni robocze, co N tygodni w wybrane dni,
 * dzień miesiąca, n-ty dzień tygodnia; koniec: nigdy, po N razach, do daty). Every example of the spec („## 9.” –
 * „Powtarzanie zadań”) a test: the next task the moment one is ticked off – „Wykonać” moved, without it „Termin”, both – the
 * gap kept, no date – counted from the day it was ticked; the steps copied unticked; the end; one next task only (its id
 * derived from the task's – the same on every computer; a task not done never multiplies).
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { nextRuleDate, nextTaskId, nextTaskRaw, repeatText } from '@shared/engine/caseRepeat'
import { listedRaw, listOf, patchedRaw, taskAnswerRaw } from '@shared/engine/cases'
import { isId } from '@shared/model/ids'
import { newTask, requestFrom } from '@shared/model/requests'
import type { SeriesRule } from '@shared/model/series'
import { placeLogical } from '@shared/time/day'

const at = (date: string, hour = 12) => placeLogical(date, hour * 60)
const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}
/** A task made as the page makes it, with its repeat set by the field „Powtarzaj” (on `made`). */
function task(made: string, o: { title?: string; doDate?: string | null; dueDate?: string | null; rule: SeriesRule; until?: string | null; count?: number | null; steps?: unknown[] }) {
  let raw = newTask('t1', at(made, 9), made, { title: o.title ?? 'Podlać kwiaty', doDate: o.doDate ?? null, dueDate: o.dueDate ?? null, estimateMin: 15, categoryId: 'dom', note: 'parapet', priority: 'p2' })!
  if (o.steps) raw = { ...raw, steps: o.steps, stepsDone: { a: true } }
  return ok(patchedRaw(raw, { repeat: { rule: o.rule, until: o.until ?? null, count: o.count ?? null } }, at(made, 9))).raw
}
/** Ticked off on `day`: the task after and the next one (null – none). */
function tick(raw: Record<string, unknown>, day: string) {
  const after = listedRaw(raw, 'done', at(day))
  return { after, next: nextTaskRaw(raw, after, at(day), marketDay) }
}
const dates = (n: { raw: Record<string, unknown> } | null) => (n ? { doDate: n.raw.doDate, dueDate: n.raw.dueDate } : null)
const weekly = (days: number[], every = 1): SeriesRule => ({ kind: 'weekly', every, days, anchor: '' })

describe('następne zadanie po odhaczeniu (D465)', () => {
  it('przykład: „Podlać kwiaty” co tydzień w poniedziałek i czwartek, Wykonać pn 16.11, odhaczone w pn – następne z Wykonać czw 19.11, kroki odznaczone', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-16', rule: weekly([1, 4]), steps: [{ id: 'a', title: 'Konewka', order: 0 }, { id: 'b', title: 'Nawóz', order: 1, min: 5 }] })
    const { next } = tick(raw, '2026-11-16')
    expect(next).not.toBeNull()
    expect(next!.id).toBe(nextTaskId('t1'))
    expect(isId(next!.id)).toBe(true)
    const r = requestFrom(next!.raw)!
    expect(r).toMatchObject({ kind: 'task', title: 'Podlać kwiaty', estimateMin: 15, categoryId: 'dom', note: 'parapet', priority: 'p2', state: 'queued', list: 'inbox', doneAt: null, day: null, block: null, doDate: '2026-11-19', dueDate: null })
    expect(r.steps.map((s) => [s.title, s.done, s.min ?? null])).toEqual([
      ['Konewka', false, null],
      ['Nawóz', false, 5]
    ])
    expect(next!.raw.stepsDone).toBeUndefined()
    // The second occurrence, its rule with it.
    expect(r.repeat).toMatchObject({ rule: { kind: 'weekly', every: 1, days: [1, 4] }, n: 2 })
    // Its list by its date (as a new task with a date): this week – „W tym tygodniu”, on the day – „Dziś”.
    expect(listOf(r, '2026-11-17')).toBe('week')
    expect(listOf(r, '2026-11-19')).toBe('today')
  })

  it('przykład: „Czynsz” 10. dnia miesiąca, sam Termin 10.11, zapłacony 12.11 – następny Termin 10.12 (bez „Wykonać”)', () => {
    const raw = task('2026-11-01', { title: 'Czynsz', dueDate: '2026-11-10', rule: { kind: 'monthDay', day: 10 } })
    expect(dates(tick(raw, '2026-11-12').next)).toEqual({ doDate: null, dueDate: '2026-12-10' })
  })

  it('przykład: Wykonać 8.12 i Termin 10.12 (8. dnia miesiąca) – następne Wykonać 8.01, Termin 10.01: odstęp zostaje', () => {
    const raw = task('2026-12-01', { title: 'Czynsz', doDate: '2026-12-08', dueDate: '2026-12-10', rule: { kind: 'monthDay', day: 8 } })
    expect(dates(tick(raw, '2026-12-08').next)).toEqual({ doDate: '2027-01-08', dueDate: '2027-01-10' })
  })

  it('przykład: bez żadnej daty „Kupić filtr” codziennie, odhaczone 18.11 – następne z Wykonać 19.11', () => {
    const raw = task('2026-11-14', { title: 'Kupić filtr', rule: { kind: 'daily' } })
    expect(dates(tick(raw, '2026-11-18').next)).toEqual({ doDate: '2026-11-19', dueDate: null })
  })

  it('odhaczone wcześniej – od daty; po dacie – od dnia odhaczenia (niezrobione wystąpienia się nie mnożą)', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-20', rule: { kind: 'daily' } })
    expect(dates(tick(raw, '2026-11-18').next)).toEqual({ doDate: '2026-11-21', dueDate: null })
    const late = task('2026-11-14', { doDate: '2026-11-16', rule: { kind: 'daily' } })
    expect(dates(tick(late, '2026-11-20').next)).toEqual({ doDate: '2026-11-21', dueDate: null })
  })

  it('dni robocze bez świąt: piątek 20.11 – poniedziałek 23.11; wtorek 10.11 – czwartek 12.11 (11.11 – święto)', () => {
    const fri = task('2026-11-14', { doDate: '2026-11-20', rule: { kind: 'workdays' } })
    expect(dates(tick(fri, '2026-11-20').next)).toEqual({ doDate: '2026-11-23', dueDate: null })
    const tue = task('2026-11-01', { doDate: '2026-11-10', rule: { kind: 'workdays' } })
    expect(dates(tick(tue, '2026-11-10').next)).toEqual({ doDate: '2026-11-12', dueDate: null })
  })

  it('co 2 tygodnie w czwartek – tygodnie liczone od daty ustawienia; ostatni piątek miesiąca', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-19', rule: weekly([4], 2) })
    expect(requestFrom(raw)!.repeat!.rule).toMatchObject({ kind: 'weekly', anchor: '2026-11-19' })
    expect(dates(tick(raw, '2026-11-19').next)).toEqual({ doDate: '2026-12-03', dueDate: null })
    const last = task('2026-11-14', { doDate: '2026-11-27', rule: { kind: 'monthWeekday', nth: -1, weekday: 5 } })
    expect(dates(tick(last, '2026-11-27').next)).toEqual({ doDate: '2026-12-25', dueDate: null })
  })

  it('koniec „po 3 razach”: trzecie odhaczenie nie daje następnego; „do 30.11” – następne po dacie nie powstaje', () => {
    let raw = task('2026-11-14', { doDate: '2026-11-16', rule: { kind: 'daily' }, count: 3 })
    const seen: unknown[] = []
    for (const day of ['2026-11-16', '2026-11-17', '2026-11-18']) {
      const { next } = tick(raw, day)
      seen.push(next ? requestFrom(next.raw)!.repeat!.n : null)
      if (next) raw = next.raw
    }
    expect(seen).toEqual([2, 3, null])
    const until = task('2026-11-14', { doDate: '2026-11-29', rule: { kind: 'daily' }, until: '2026-11-30' })
    const first = tick(until, '2026-11-29').next!
    expect(first.raw.doDate).toBe('2026-11-30')
    expect(tick(first.raw, '2026-11-30').next).toBeNull()
  })

  it('tylko przejście do „Zrobione” zadania, które się powtarza: drugie odhaczenie, prośba, zadanie bez reguły, „Wraca na listę” – nic', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-16', rule: { kind: 'daily' } })
    const { after } = tick(raw, '2026-11-16')
    expect(nextTaskRaw(after, listedRaw(after, 'done', at('2026-11-17')), at('2026-11-17'), marketDay)).toBeNull()
    const plain = newTask('t2', at('2026-11-14'), '2026-11-14', { title: 'Raz' })!
    expect(nextTaskRaw(plain, listedRaw(plain, 'done', at('2026-11-16')), at('2026-11-16'), marketDay)).toBeNull()
    expect(nextTaskRaw(raw, taskAnswerRaw(raw, 'back', at('2026-11-16')), at('2026-11-16'), marketDay)).toBeNull()
    // „Tak” of „Zadanie zrobione?” is a tick too.
    expect(nextTaskRaw(raw, taskAnswerRaw(raw, 'done', at('2026-11-16')), at('2026-11-16'), marketDay)!.id).toBe(nextTaskId('t1'))
    expect(patchedRaw({ id: 'q1', kind: 'request', person: 'mama', note: 'x', state: 'queued' }, { repeat: { rule: { kind: 'daily' }, until: null, count: null } }, at('2026-11-14'))).toEqual({ error: 'Powtarza się tylko zadanie.' })
  })

  it('dwa komputery: następne zadanie to ten sam plik (id z id zadania, treść z zadania i dnia) – odhaczone na obu daje jedno', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-16', rule: weekly([1, 4]) })
    const a = nextTaskRaw(raw, listedRaw(raw, 'done', at('2026-11-16', 9)), at('2026-11-16', 9), marketDay)!
    const b = nextTaskRaw(raw, listedRaw(raw, 'done', at('2026-11-16', 18)), at('2026-11-16', 18), marketDay)!
    expect(b.id).toBe(a.id)
    expect(b.raw).toEqual(a.raw)
    // The next one's next: another id, the chain goes on.
    const c = nextTaskRaw(a.raw, listedRaw(a.raw, 'done', at('2026-11-19')), at('2026-11-19'), marketDay)!
    expect(c.id).toBe(nextTaskId(a.id))
    expect(c.id).not.toBe(a.id)
  })

  it('pole „Powtarzaj”: zmiana reguły zostawia numer wystąpienia, tygodniowa z tym samym „co ile” – swoje tygodnie; „Nie powtarzaj” – null; zła reguła – odmowa', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-19', rule: weekly([4], 2) })
    const second = tick(raw, '2026-11-19').next!.raw
    const changed = ok(patchedRaw(second, { repeat: { rule: weekly([2, 4], 2), until: null, count: 5 } }, at('2026-11-20'))).raw
    expect(requestFrom(changed)!.repeat).toEqual({ rule: { kind: 'weekly', every: 2, days: [2, 4], anchor: '2026-11-19' }, until: null, count: 5, n: 2 })
    const off = ok(patchedRaw(changed, { repeat: null }, at('2026-11-20'))).raw
    expect(requestFrom(off)!.repeat).toBeNull()
    expect(patchedRaw(raw, { repeat: { rule: weekly([]), until: null, count: null } }, at('2026-11-20'))).toEqual({ error: 'Powtarzaj: reguła jest niepełna.' })
    expect(patchedRaw(raw, { repeat: { rule: { kind: 'daily' }, until: null, count: 0 } }, at('2026-11-20'))).toEqual({ error: 'Powtarzaj: liczba razy od 1 do 999.' })
  })

  it('starsza wersja (bez pola) czyta zadanie jak dotąd i zachowuje `repeat` przy swojej zmianie; plik bez pola – bez powtarzania', () => {
    const raw = task('2026-11-14', { doDate: '2026-11-16', rule: { kind: 'daily' } })
    // An older version writes its change over the file as it is (`{ ...raw, … }`): the field stays.
    const older = { ...raw, title: 'Podlać kwiaty i balkon' }
    expect(requestFrom(older)!.repeat).toMatchObject({ rule: { kind: 'daily' }, n: 1 })
    expect(requestFrom(newTask('t3', at('2026-11-14'), '2026-11-14', { title: 'Raz' }))!.repeat).toBeNull()
    expect(requestFrom({ ...raw, repeat: { rule: { kind: 'nieznana' } } })!.repeat).toBeNull()
  })

  it('reguła słowami przy zadaniu: „codziennie”, „co tydzień w poniedziałek i czwartek, 10 razy (2 z 10)”, „…, do 30.11”', () => {
    expect(repeatText({ rule: { kind: 'daily' }, until: null, count: null, n: 1 }, '2026-11-14')).toBe('codziennie')
    expect(repeatText({ rule: weekly([1, 4]), until: null, count: 10, n: 2 }, '2026-11-14')).toBe('co tydzień w poniedziałek i czwartek, 10 razy (2 z 10)')
    expect(repeatText({ rule: { kind: 'monthDay', day: 10 }, until: '2026-11-30', count: null, n: 1 }, '2026-11-14')).toBe('10. dnia każdego miesiąca, do 30.11')
  })

  it('najbliższy dzień reguły po dacie', () => {
    expect(nextRuleDate({ kind: 'daily' }, '2026-11-18', marketDay)).toBe('2026-11-19')
    expect(nextRuleDate({ kind: 'monthDay', day: 31 }, '2026-11-18', marketDay)).toBe('2026-11-30')
    expect(nextRuleDate({ kind: 'weekly', every: 1, days: [7], anchor: '2026-11-16' }, '2026-11-18', marketDay)).toBe('2026-11-22')
  })
})
