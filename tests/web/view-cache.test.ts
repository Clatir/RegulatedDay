/**
 * The memory of „Tydzień” and the goals (D356): per data folder, the latest 12 entries, and a read that comes late never
 * overwrites a newer one.
 */
import { describe, expect, it } from 'vitest'
import { cacheKey, ViewCache, VIEW_CACHE_MAX } from '@renderer/store/viewCache'

describe('pamięć odczytów tygodni i miesięcy', () => {
  it('klucz zawiera folder danych: ten sam tydzień w innym folderze to inny wpis', () => {
    const c = new ViewCache<string>()
    c.keep(cacheKey('C:/a', '2026-11-09'), c.begin(), 'z folderu a')
    expect(c.get(cacheKey('C:/a', '2026-11-09'))).toBe('z folderu a')
    expect(c.get(cacheKey('D:/b', '2026-11-09'))).toBeNull()
    expect(c.get(cacheKey(null, '2026-11-09'))).toBeNull()
  })

  it('trzyma najwyżej ostatnie wpisy: najstarszy odpada, świeżo zapisany zostaje', () => {
    const c = new ViewCache<number>()
    for (let i = 0; i < VIEW_CACHE_MAX + 3; i++) c.keep(`k${i}`, c.begin(), i)
    expect(c.size).toBe(VIEW_CACHE_MAX)
    expect(c.get('k0')).toBeNull()
    expect(c.get('k2')).toBeNull()
    expect(c.get('k3')).toBe(3)
    expect(c.get(`k${VIEW_CACHE_MAX + 2}`)).toBe(VIEW_CACHE_MAX + 2)
    // Writing an old key again makes it the newest, so it outlives the next ones.
    c.keep('k3', c.begin(), 33)
    c.keep('nowy', c.begin(), 0)
    expect(c.get('k3')).toBe(33)
    expect(c.get('k4')).toBeNull()
  })

  it('odczyt, który się spóźnił, nie nadpisuje nowszego', () => {
    const c = new ViewCache<string>()
    const slow = c.begin()
    const fast = c.begin()
    expect(c.keep('t', fast, 'nowszy')).toBe(true)
    expect(c.keep('t', slow, 'starszy, spóźniony')).toBe(false)
    expect(c.get('t')).toBe('nowszy')
    // The older one first, the newer one after it: the newer wins.
    const a = c.begin()
    const b = c.begin()
    c.keep('u', a, 'a')
    c.keep('u', b, 'b')
    expect(c.get('u')).toBe('b')
  })
})
