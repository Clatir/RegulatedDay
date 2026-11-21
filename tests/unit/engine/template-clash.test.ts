/**
 * UX5 / A7 (D563 P3, D72): two templates on one type and weekday – `templateFor` lets the smaller id win, quietly; `templateClashes` says
 * which one wins (for the warning of the editor), `templateUnused` which loses on all its days (the mark of the list), `freeWeekday` the
 * day a new template of a type starts on. Nothing blocks.
 */
import { describe, expect, it } from 'vitest'
import { freeWeekday, idAfter, templateClashes, templateFor, templateUnused, type Template } from '@shared/model/plan'

const t = (id: string, weekdays: number[], o: Partial<Template> = {}): Template => ({
  id,
  name: `Szablon ${id}`,
  dayType: 'zwykly',
  weekdays,
  versions: [{ from: '2026-01-01', blocks: [], budgetMin: null, maxMin: null }],
  archived: false,
  ...o
})
const ids = (list: Array<{ weekday: number | null; other: Template }>) => list.map((c) => [c.weekday, c.other.id])

describe('templateClashes', () => {
  it('dwa szablony na poniedziałek: większe id przegrywa i wie, kto wygrywa; mniejsze wie, kogo wyprzedza', () => {
    const all = [t('b', [1, 3]), t('a', [1])]
    expect(templateFor(all, 'zwykly', 1, '2026-12-07')?.template.id).toBe('a')
    expect(ids(templateClashes(all, all[0]!).loses)).toEqual([[1, 'a']])
    expect(templateClashes(all, all[0]!).wins).toEqual([])
    expect(ids(templateClashes(all, all[1]!).wins)).toEqual([[1, 'b']])
    expect(templateClashes(all, all[1]!).loses).toEqual([])
  })

  it('dwa domyślne dla typu (bez dni) zderzają się jak dzień tygodnia – weekday null', () => {
    const all = [t('a', []), t('b', [])]
    expect(ids(templateClashes(all, all[1]!).loses)).toEqual([[null, 'a']])
  })

  it('domyślny i szablon dnia tygodnia się nie zderzają (własny dzień ma pierwszeństwo z założenia); inny typ, archiwum – też nie', () => {
    const all = [t('a', []), t('b', [1]), t('c', [1], { dayType: 'weekend' }), t('d', [1], { archived: true })]
    for (const x of all) expect(templateClashes(all, x)).toEqual({ loses: [], wins: [] })
  })
})

describe('templateUnused', () => {
  it('nieużywany tylko wtedy, gdy przegrywa na wszystkich swoich dniach', () => {
    const all = [t('a', [1, 2]), t('b', [1, 2]), t('c', [2, 3])]
    expect(templateUnused(all, all[0]!)).toBe(false)
    expect(templateUnused(all, all[1]!)).toBe(true)
    // c wins on Wednesday – used, though it loses on Tuesday.
    expect(templateUnused(all, all[2]!)).toBe(false)
  })

  it('drugi domyślny jest nieużywany; szablon bez rywala i zarchiwizowany – nie', () => {
    const all = [t('a', []), t('b', []), t('c', [4]), t('d', [1], { archived: true }), t('e', [1], { archived: true })]
    expect(templateUnused(all, all[1]!)).toBe(true)
    expect(templateUnused(all, all[0]!)).toBe(false)
    expect(templateUnused(all, all[2]!)).toBe(false)
    expect(templateUnused(all, all[4]!)).toBe(false)
  })
})

describe('freeWeekday – dzień, od którego zaczyna nowy szablon typu', () => {
  it('pierwszy dzień bez własnego szablonu tego typu (domyślny go nie zajmuje); wszystkie zajęte – null', () => {
    expect(freeWeekday([t('a', []), t('b', [1, 2])], 'zwykly')).toBe(3)
    expect(freeWeekday([t('a', [1]), t('b', [2], { archived: true })], 'zwykly')).toBe(2)
    expect(freeWeekday([t('a', [1], { dayType: 'weekend' })], 'zwykly')).toBe(1)
    expect(freeWeekday([t('a', [1, 2, 3, 4, 5, 6, 7])], 'zwykly')).toBeNull()
  })
})

describe('idAfter – id nowego szablonu nigdy mniejsze od istniejących (wygrywa mniejsze, więc nowy nie przejmuje dni po cichu)', () => {
  it('większe od wszystkich zostaje; inne dostaje przyrostek za największym', () => {
    expect(idAfter(['abc', 'b00'], 'c12')).toBe('c12')
    const id = idAfter(['abc', 'zzz'], 'c12345678')
    expect(id > 'zzz' && id > 'abc').toBe(true)
    expect(idAfter([], 'x')).toBe('x')
  })

  it('id nie rośnie: ta sama długość tuż nad największym, także po wielu nowych szablonach z mniejszym losowym id', () => {
    expect(idAfter(['k3abc', 'b0000'], 'a1234')).toBe('l1234')
    expect(idAfter(['zz9xy'], 'a1234')).toBe('zza34')
    const ids: string[] = ['zzzzzzzzzzzzzz00']
    for (let n = 0; n < 60; n++) {
      const id = idAfter(ids, '0000000000000000')
      expect(id.length).toBe(16)
      expect(ids.every((x) => id > x)).toBe(true)
      ids.push(id)
    }
    expect(idAfter(['zzz'], 'abc')).toBe('zzzabc')
  })
})
