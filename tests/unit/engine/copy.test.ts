/**
 * Kopia Ctrl + przeciągnięciem (D513) – jedno miejsce „zrób kopię elementu” (`engine/copy.ts`): kopia bloku to nowy, osobny
 * blok Twój (nowe id, bez historii: bez licznika przeniesień, dnia, z którego przyszedł, znaku wariantu, odhaczeń), z notatką,
 * krokami i nazwą; kopia bloku serii – pojedynczy blok poza serią; blok szablonu zostaje blokiem szablonu; kopia sprawy albo
 * prośby to nowa sprawa (prośba) o tej samej treści z własnym stanem (nie zrobiona, niezaplanowana, bez odhaczeń); kopia bloku
 * zadania niesie kopię zadania zaplanowaną w nowym bloku; kopia wydarzenia całodniowego – te same dni długości od nowej daty.
 */
import { describe, expect, it } from 'vitest'
import { blockCopy, copiedAllDay, copiedCase } from '@shared/engine/copy'
import { copiedBlock } from '@shared/engine/planEdit'
import { allDayDraft } from '@shared/model/allDay'
import { planBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'

const D = '2099-03-02'
const AT = placeLogical(D, 9 * 60)
const steps = [
  { id: 's1', title: 'Pierwszy', order: 0, done: true },
  { id: 's2', title: 'Drugi', order: 1, done: false, min: 10 }
]

describe('copiedBlock – kopia bloku (D513)', () => {
  it('nowe id, Twój, bez kotwicy i grupy, start z upuszczenia; notatka, nazwa, koszt i kroki (nieodhaczone) zostają; bez historii', () => {
    const b = planBlock({ id: 'a', categoryId: 'analiza', variantId: 'v1', startMin: 600, durationMin: 45, note: '**ważne**', name: 'Raport', costs: { head: 3, emotions: 1, senses: 1, body: 2 }, anchor: 'x', alongside: 'y', moves: 3, movedFrom: '2099-03-01', byVariant: true, steps, fixed: true, background: true })
    const c = copiedBlock(b, 13 * 60)
    expect(c.id).not.toBe('a')
    expect(c).toMatchObject({ categoryId: 'analiza', variantId: 'v1', startMin: 13 * 60, durationMin: 45, note: '**ważne**', name: 'Raport', costs: { head: 3, emotions: 1, senses: 1, body: 2 }, fixed: true, background: true })
    expect(c).toMatchObject({ origin: 'user', sourceId: null, anchor: null, alongside: null, moves: 0, movedFrom: null, byVariant: false, task: null, requests: [] })
    expect(c.steps).toEqual([
      { id: 's1', title: 'Pierwszy', order: 0, done: false },
      { id: 's2', title: 'Drugi', order: 1, done: false, min: 10 }
    ])
    // The original is not touched.
    expect(b.steps[0]!.done).toBe(true)
    expect(b.id).toBe('a')
  })

  it('blok serii – pojedynczy blok poza serią; blok szablonu – blokiem szablonu z podanym id', () => {
    const occ = planBlock({ id: 'occ', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'series', sourceId: 'root1' })
    expect(copiedBlock(occ, 700)).toMatchObject({ origin: 'user', sourceId: null, startMin: 700 })
    const tpl = planBlock({ id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'template' })
    expect(copiedBlock(tpl, 650, { id: 'nowy', origin: 'template' })).toMatchObject({ id: 'nowy', origin: 'template', sourceId: null, startMin: 650 })
  })

  it('start poza dobą logiczną – w dobie (jak przeciągnięcie)', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 30 })
    expect(copiedBlock(b, 100).startMin).toBe(240)
  })
})

describe('copiedCase – kopia sprawy albo prośby (D513)', () => {
  it('zadanie: nowe id, ta sama treść, własny stan – nie zrobione, niezaplanowane, bez odhaczeń; pola nieznane zostają', () => {
    const raw = { ...newTask('t1', 1, D, { title: 'Napisać raport', estimateMin: 45, categoryId: 'analiza', note: 'notatka', dueDate: '2099-03-09', priority: 'p1' })!, steps: [{ id: 's1', title: 'krok', order: 0 }], stepsDone: { s1: true }, day: D, block: 'b1', state: 'done', list: 'done', doneAt: 5, future: 'zostaje' }
    const c = copiedCase(raw, 'kopia', AT)!
    const r = requestFrom(c)!
    expect(r).toMatchObject({ id: 'kopia', kind: 'task', title: 'Napisać raport', estimateMin: 45, categoryId: 'analiza', note: 'notatka', dueDate: '2099-03-09', priority: 'p1', createdAt: AT })
    expect(r).toMatchObject({ state: 'queued', day: null, block: null, doneAt: null, list: 'inbox' })
    expect(r.steps.map((s) => [s.id, s.done])).toEqual([['s1', false]])
    expect(c.stepsDone).toBeUndefined()
    expect(c.future).toBe('zostaje')
    // The original is not touched.
    expect(raw.stepsDone).toEqual({ s1: true })
  })

  it('kopia zadania, które się powtarza, to zadanie jednorazowe – bez „Powtarzaj” (nie zaczyna drugiego ciągu)', () => {
    const raw = { ...newTask('t1', 1, D, { title: 'Podlać kwiaty', doDate: D })!, repeat: { rule: { kind: 'daily' }, until: null, count: 5, n: 3 } }
    expect(requestFrom(raw)!.repeat).not.toBeNull()
    const c = copiedCase(raw, 'k', AT)!
    expect(c.repeat).toBeUndefined()
    expect(requestFrom(c)!.repeat).toBeNull()
    expect(raw.repeat.n).toBe(3)
  })

  it('niezrobione zostaje na swojej liście', () => {
    const raw = newTask('t1', 1, D, { title: 'X', list: 'today' })!
    expect(requestFrom(copiedCase(raw, 'k', AT))!).toMatchObject({ list: 'today', listDay: D, state: 'queued' })
  })

  it('prośba: nowa prośba o tej samej treści (osoba, szacunek, notatka)', () => {
    const raw = newRequest('r1', 1, { person: 'Ala', estimateMin: 20, note: 'zakupy' })
    expect(requestFrom(copiedCase(raw, 'k', AT))!).toMatchObject({ id: 'k', kind: 'request', person: 'Ala', estimateMin: 20, note: 'zakupy', state: 'queued' })
  })

  it('plik, który nie jest sprawą – null', () => {
    expect(copiedCase({ nic: 1 }, 'k', AT)).toBeNull()
  })
})

describe('blockCopy – blok zadania i próśb (D513)', () => {
  const ids = (...list: string[]) => {
    const left = [...list]
    return () => left.shift()!
  }

  it('blok zadania: kopia zadania zaplanowana w nowym bloku, blok wskazuje kopię; oryginał bez zmian', () => {
    const task = { ...newTask('t1', 1, D, { title: 'Raport' })!, steps: [{ id: 's1', title: 'krok', order: 0 }], stepsDone: { s1: true }, day: D, block: 'b1', state: 'planned' }
    const b = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, task: 't1', steps: [{ id: 's1', title: 'krok', order: 0, done: true }] })
    const c = blockCopy(b, 700, { date: D, at: AT, caseOf: (id) => (id === 't1' ? task : null), id: ids('nb', 'nt') })
    expect(c.block).toMatchObject({ id: 'nb', task: 'nt', startMin: 700, origin: 'user' })
    expect(c.block.steps).toEqual([{ id: 's1', title: 'krok', order: 0, done: false }])
    expect(c.cases.map((x) => x.id)).toEqual(['nt'])
    expect(requestFrom(c.cases[0]!.raw)).toMatchObject({ id: 'nt', title: 'Raport', day: D, block: 'nb', doneAt: null })
    expect(c.cases[0]!.raw.stepsDone).toBeUndefined()
    expect(task.block).toBe('b1')
  })

  it('blok próśb: każda prośba skopiowana jako nowa; zadania, którego już nie ma, kopia nie ma – zwykły blok kategorii', () => {
    const r1 = newRequest('r1', 1, { person: 'Ala', estimateMin: 10, note: '' })
    const b = planBlock({ id: 'b1', categoryId: 'prosby', startMin: 600, durationMin: 20, requests: ['r1', 'gone'], task: 'gone-task' })
    const c = blockCopy(b, 700, { date: D, at: AT, caseOf: (id) => (id === 'r1' ? r1 : null), id: ids('nb', 'x1', 'x2', 'x3') })
    expect(c.block.task).toBeNull()
    expect(c.block.requests).toHaveLength(1)
    expect(c.cases).toHaveLength(1)
    expect(requestFrom(c.cases[0]!.raw)).toMatchObject({ kind: 'request', person: 'Ala', day: D, block: 'nb' })
    expect(c.block.requests[0]).toBe(c.cases[0]!.id)
  })
})

describe('copiedAllDay – kopia wydarzenia całodniowego (D513)', () => {
  it('nowe id, te same pola, tyle samo dni od nowej daty', () => {
    const e = { ...allDayDraft('e1', '2099-03-02', '2099-03-04'), title: 'Wyjazd', note: 'n', color: 'teal' as const, free: true, calendarId: 'k1' }
    expect(copiedAllDay(e, 'e2', '2099-03-10')).toEqual({ ...e, id: 'e2', startDate: '2099-03-10', endDate: '2099-03-12' })
  })
})
