/**
 * Steps (SNT5) – the cases of the third review: a list nobody changed stays exactly as the file has it (items without a
 * number `order` too – they get one only when the list changes); a step changed or removed takes out only the items of its
 * id this version reads (one without a title stays); the version a new version of a series or a template is copied from –
 * one rule (`sourceVersionKey`).
 */
import { describe, expect, it } from 'vitest'
import { sourceVersionKey } from '@shared/model/plan'
import { applyStepOp, stepsFrom, stepsJson } from '@shared/model/steps'

const ok = <T,>(x: T | { error: string }): T => {
  if (x && typeof x === 'object' && 'error' in x) throw new Error(x.error)
  return x as T
}

describe('lista niezmieniona zostaje jak w pliku (przegląd 3, T787)', () => {
  it('pozycje bez liczbowego `order` – bez zapisu, gdy lista się nie zmienia; po zmianie dostają swoje miejsce', () => {
    const raw = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', later: 1 }]
    expect(stepsJson(stepsFrom(raw), raw)).toEqual(raw)
    const changed = stepsJson(ok(applyStepOp(stepsFrom(raw), { op: 'rename', id: 'b', title: 'Bb' })).steps, raw)
    expect(changed).toEqual([{ id: 'a', title: 'A', order: 0 }, { id: 'b', title: 'Bb', order: 1, later: 1 }])
  })
})

describe('pozycje tego samego id, których ta wersja nie czyta (przegląd 3, T787)', () => {
  it('usunięcie i zmiana kroku: znikają pozycje jego id czytelne (z tytułem), bez tytułu – zostają', () => {
    const raw = [{ id: 'a', title: 'A', order: 0 }, { id: 'a', title: '', later: 'x' }, { id: 'a', title: 'duplikat', order: 5 }, { id: 'b', title: 'B', order: 1 }]
    const removed = stepsJson(ok(applyStepOp(stepsFrom(raw), { op: 'remove', id: 'a' })).steps, raw)
    expect(removed).toEqual([raw[1], raw[3]])
    const renamed = stepsJson(ok(applyStepOp(stepsFrom(raw), { op: 'rename', id: 'a', title: 'Aa' })).steps, raw)
    expect(renamed).toEqual([{ id: 'a', title: 'Aa', order: 0 }, raw[1], raw[3]])
  })
})

describe('wersja, z której powstaje nowa (przegląd 3)', () => {
  it('`sourceVersionKey`: ta sama data, inaczej ostatnia przed nią; przed pierwszą – żadna', () => {
    const keys = ['2026-01-01', '2026-06-01', '2026-03-01']
    expect(sourceVersionKey(keys, '2026-06-01')).toBe('2026-06-01')
    expect(sourceVersionKey(keys, '2026-05-31')).toBe('2026-03-01')
    expect(sourceVersionKey(keys, '2027-01-01')).toBe('2026-06-01')
    expect(sourceVersionKey(keys, '2025-12-31')).toBeUndefined()
  })
})
