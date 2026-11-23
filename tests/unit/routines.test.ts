/**
 * D512: a routine's own cost per hour in its file (`routines/<id>.json`, field `costs`) – three pools of −100…100, or none (null, no field:
 * „jak podkategoria”). Additive: a file without the field reads as before, a value that is not a cost reads as none, and the fields a
 * version does not know stay in the file when it changes the routine (the editor writes over the raw record).
 */
import { describe, expect, it } from 'vitest'
import { NO_ROUTINE_COSTS, routineCostOf, routineCostsOf, routineFrom, type Routine } from '@shared/model/routines'

const raw = { id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false }

describe('koszt rutyny w pliku (D512)', () => {
  it('plik bez kosztu (starsza wersja) – rutyna „jak podkategoria”', () => {
    expect(routineFrom(raw)!.costs).toBeNull()
    expect(routineFrom({ ...raw, costs: null })!.costs).toBeNull()
  })

  it('koszt −100…100 w każdej puli jest kosztem rutyny; plik bez ciała (starsza wersja) – ciało jak „Rutyny i opieka nad zwierzętami” (T1520)', () => {
    expect(routineFrom({ ...raw, costs: { head: 100, emotions: -100, senses: 0, body: -2 } })!.costs).toEqual({ head: 100, emotions: -100, senses: 0, body: -2 })
    expect(routineFrom({ ...raw, costs: { head: 100, emotions: -100, senses: 0 } })!.costs).toEqual({ head: 100, emotions: -100, senses: 0, body: 1 })
  })

  it('wartość spoza zakresu, niecałkowita, brak puli albo nie obiekt – brak kosztu, rutyna czyta się dalej', () => {
    for (const costs of [{ head: 101, emotions: 0, senses: 0 }, { head: 1, emotions: 0, senses: 0, body: 101 }, { head: -101, emotions: 0, senses: 0 }, { head: 1.5, emotions: 0, senses: 0 }, { head: 1, emotions: 0 }, '1,1,1', [1, 1, 1], 3]) {
      const r = routineFrom({ ...raw, costs })
      expect(r).not.toBeNull()
      expect(r!.costs).toBeNull()
      expect(r!.normal).toHaveLength(1)
    }
  })

  it('nieznane pole w pliku rutyny nie psuje odczytu (zapis addytywny)', () => {
    expect(routineFrom({ ...raw, costs: { head: 1, emotions: 2, senses: 3 }, future: { x: 1 } })).toMatchObject({ id: 'r1', costs: { head: 1, emotions: 2, senses: 3 } })
  })
})

describe('koszty rutyn dla silnika (D512)', () => {
  const r = (id: string, costs: Routine['costs']): Routine => ({ ...routineFrom({ ...raw, id })!, costs })

  it('tylko rutyny z własnym kosztem, po identyfikatorze (także w archiwum)', () => {
    const map = routineCostsOf([r('a', { head: 1, emotions: 0, senses: 0, body: 0 }), r('b', null), { ...r('c', { head: -1, emotions: -1, senses: -1, body: -1 }), archived: true }])
    expect(map).toEqual({ a: { head: 1, emotions: 0, senses: 0, body: 0 }, c: { head: -1, emotions: -1, senses: -1, body: -1 } })
    expect(routineCostOf(map, 'a')).toEqual({ head: 1, emotions: 0, senses: 0, body: 0 })
    expect(routineCostOf(map, 'b')).toBeNull()
    expect(routineCostOf(map, null)).toBeNull()
    expect(routineCostOf(undefined, 'a')).toBeNull()
    expect(routineCostOf(NO_ROUTINE_COSTS, 'a')).toBeNull()
  })

  it('identyfikator będący nazwą pola obiektu (constructor, __proto__) nie jest kosztem', () => {
    const map = routineCostsOf([r('a', { head: 1, emotions: 0, senses: 0, body: 0 })])
    expect(routineCostOf(map, 'constructor')).toBeNull()
    expect(routineCostOf(map, '__proto__')).toBeNull()
    expect(routineCostOf(map, 'toString')).toBeNull()
  })
})
