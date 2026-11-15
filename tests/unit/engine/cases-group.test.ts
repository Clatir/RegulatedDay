/**
 * The pure rules of the group changes of „Sprawy” (D527–D531, `engine/casesGroup.ts`): each step is the action of one sprawa or leaves
 * the sprawa out with its reason (D72), „Cofnij” goes field by field and only while a field has the value the change gave it (D529,
 * D313), the line over a selection gets the estimate and the cost per hour of every sprawa.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { patchedRaw, listedRaw } from '@shared/engine/cases'
import { blockMinutes, caseSummaryItem, categoryStep, doneStep, estimateRefusal, estimateStep, groupBlockMinutes, movedStep, planSkip, restoredStep, revertedRaw, SKIP } from '@shared/engine/casesGroup'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'

const AT = Date.parse('2026-11-12T10:00:00')
const TODAY = logicalDayOf(AT)
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const task = (p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask('t', AT, TODAY, { title: 'x', estimateMin: 30, ...p })!

describe('kroki zmian grupowych', () => {
  it('lista: zmiana jak dla jednej, ta sama lista – pominięta; „Zrobione” i „Przywróć” pomijają, czego nie dotyczą', () => {
    expect(movedStep(task(), 'today', AT)).toEqual({ raw: listedRaw(task(), 'today', AT) })
    expect(movedStep(task({ list: 'today' }), 'today', AT)).toEqual({ skip: SKIP.sameList })
    expect(movedStep(task(), 'inbox', AT)).toEqual({ skip: SKIP.sameList })
    expect(movedStep({ nothing: 1 }, 'today', AT)).toEqual({ skip: SKIP.gone })
    expect(doneStep(task(), AT)).toMatchObject({ raw: { list: 'done', state: 'done', doneAt: AT } })
    expect(doneStep(task({ list: 'done' }), AT)).toEqual({ skip: SKIP.done })
    expect(restoredStep(task({ list: 'done' }), 'inbox', AT)).toMatchObject({ raw: { list: 'inbox', doneAt: null } })
    expect(restoredStep(task(), 'inbox', AT)).toEqual({ skip: SKIP.notDone })
  })

  it('kategoria – tylko zadanie, szacunek – każda sprawa; to samo – pominięte, poza zakresem – odmowa całości', () => {
    const q = newRequest('r', AT, { person: null, estimateMin: null, note: '' })
    expect(categoryStep(q, 'nauka', AT)).toEqual({ skip: SKIP.request })
    expect(categoryStep(task(), 'inne', AT)).toEqual({ skip: SKIP.same })
    expect(categoryStep(task(), 'nauka', AT)).toMatchObject({ raw: { categoryId: 'nauka' } })
    expect(estimateStep(task(), 30, AT)).toEqual({ skip: SKIP.same })
    expect(estimateStep(task(), 45, AT)).toMatchObject({ raw: { estimateMin: 45 } })
    expect(estimateStep(q, 45, AT)).toMatchObject({ raw: { estimateMin: 45 } })
    // The step of one sprawa never refuses the group (D72): a task without a title is left out, the rest goes on.
    expect(categoryStep({ ...task(), title: '' }, 'nauka', AT)).toEqual({ skip: SKIP.refused })
    expect(estimateStep({ ...task(), title: '' }, 45, AT)).toEqual({ skip: SKIP.refused })
  })

  it('szacunek wpisany dla całej grupy: odmowa z tekstem pola jednej sprawy (patchedRaw), albo nic', () => {
    expect([0, 1.5, 481].map(estimateRefusal)).toEqual(Array(3).fill('Szacunek: od 1 min do 8 h.'))
    expect([480, 1, null].map(estimateRefusal)).toEqual([null, null, null])
  })

  it('zaplanuj: zrobiona pominięta, zaplanowana planowana od nowa (jak „Zaplanuj” jednej), kopia nic nie pomija; długość grupy – bloki jedna za drugą (prośba co najmniej 5 min)', () => {
    expect([planSkip({ list: 'inbox' }, false), planSkip({ list: 'today' }, false), planSkip({ list: 'done' }, false)]).toEqual([null, null, SKIP.done])
    expect(planSkip({ list: 'done' }, true)).toBeNull()
    const q = requestFrom(newRequest('r', AT, { person: null, estimateMin: 2, note: '' }))!
    expect(blockMinutes(q)).toBe(5)
    expect(groupBlockMinutes([requestFrom(task({ estimateMin: 30 }))!, requestFrom(task({ estimateMin: 15 }))!, q])).toBe(50)
  })
})

describe('„Cofnij” pole po polu (D529, D313)', () => {
  const before = task({ note: 'n' })
  const after = listedRaw(before, 'today', AT)

  it('pola zmiany wracają, gdy mają nadal wartość po zmianie; inne pola zmienione od tego czasu zostają', () => {
    const now = { ...after, note: 'dopisane później' }
    const back = revertedRaw(now, before, after)
    expect(back).toMatchObject({ raw: { list: 'inbox', listDay: null, note: 'dopisane później' } })
    // The fields the change set but never had (listSetDay) are taken away again, not left as null.
    expect('listSetDay' in (before as object)).toBe(false)
    expect('listSetDay' in (back as { raw: object }).raw).toBe(false)
  })

  it('pole zmiany zmienione od tego czasu – sprawa zostaje cała; bez różnicy – nic do cofnięcia', () => {
    expect(revertedRaw({ ...after, list: 'week' }, before, after)).toBe('kept')
    expect(revertedRaw(after, before, before)).toBe('same')
    // „Cofnij” does nothing twice: the sprawa back as it was has none of the values of the change.
    expect(revertedRaw(before, before, after)).toBe('kept')
  })

  it('kategoria i szacunek wracają tylko przy tej samej wartości po zmianie', () => {
    const t = task()
    const p = patchedRaw(t, { estimateMin: 90, categoryId: 'nauka' }, AT)
    if ('error' in p) throw new Error(p.error)
    expect(revertedRaw(p.raw, t, p.raw)).toMatchObject({ raw: { estimateMin: 30, categoryId: 'inne' } })
    expect(revertedRaw({ ...p.raw, estimateMin: 60 }, t, p.raw)).toBe('kept')
  })
})

describe('liczby dla napisu nad zaznaczeniem (D527)', () => {
  it('zadanie – koszt jej kategorii razy szacunek, kategoria której nie ma – „Inne”; prośba – koszt kontaktu', () => {
    const t = requestFrom(task({ categoryId: 'nauka', estimateMin: 60 }))!
    expect(caseSummaryItem(t, rules)).toEqual({ minutes: 60, costs: rules.nauka!.costs })
    const gone = requestFrom(task({ categoryId: 'nie-ma-takiej' }))!
    expect(caseSummaryItem(gone, rules)).toEqual({ minutes: 30, costs: rules.inne!.costs })
    const q = requestFrom(newRequest('r', AT, { person: null, estimateMin: null, note: '' }))!
    // A request without an estimate counts 15 min (`estimateOf`).
    expect(caseSummaryItem(q, rules)).toEqual({ minutes: 15, costs: rules.prosby!.costs })
    expect(caseSummaryItem(q, {})).toEqual({ minutes: 15, costs: null })
  })
})
