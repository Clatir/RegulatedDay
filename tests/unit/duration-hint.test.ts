/**
 * „Długość z historii” (N6, D569, D625): the median of the blocks finished, rounded to 5 min, the thresholds of the settings (at least 5
 * blocks; at least 20 % and at least 10 min – both), the samples of a sprawa and the words of the hint.
 */
import { describe, expect, it } from 'vitest'
import { blockSamples, caseSamples, durationHint, hintRulesOf, hintText, hintTitle, median, roundToFive } from '@shared/durationHint'
import { durationHistoryOf } from '@shared/engine/durationHistory'
import { DEFAULT_GENERAL, generalFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

const RULES = hintRulesOf(DEFAULT_GENERAL)!

describe('mediana i zaokrąglenie', () => {
  it('nieparzysta liczba – środkowa, parzysta – średnia dwóch środkowych; kolejność nie ma znaczenia', () => {
    expect(median([50, 40, 45])).toBe(45)
    expect(median([30, 40, 50, 60])).toBe(45)
    expect(median([61, 44])).toBe(52.5)
    expect(median([])).toBeNull()
  })

  it('do 5 min (połówka w górę), nigdy poniżej 5', () => {
    expect(roundToFive(42)).toBe(40)
    expect(roundToFive(42.5)).toBe(45)
    expect(roundToFive(47)).toBe(45)
    expect(roundToFive(48)).toBe(50)
    expect(roundToFive(1)).toBe(5)
  })
})

describe('progi (D569, D625)', () => {
  it('domyślnie: włączone, 5 bloków, 20 %, 10 min', () => {
    expect(RULES).toEqual({ blocks: 5, pct: 20, min: 10 })
    expect(hintRulesOf(generalFrom({ durationHints: false }))).toBeNull()
  })

  it('„Gotowe, gdy”: 5 bloków po 45 min przy planie 30 – podpowiedź 45; 4 bloki – bez', () => {
    expect(durationHint([45, 45, 45, 45, 45], 30, RULES)).toEqual({ minutes: 45, count: 5 })
    expect(durationHint([45, 45, 45, 45], 30, RULES)).toBeNull()
  })

  it('po „Przyjmij” (wartość = mediana) podpowiedzi nie ma', () => {
    expect(durationHint([45, 45, 45, 45, 45], 45, RULES)).toBeNull()
  })

  it('oba progi naraz: ≥ 20 % i ≥ 10 min', () => {
    // 10 min of 60 = 17 % – under the share.
    expect(durationHint([70, 70, 70, 70, 70], 60, RULES)).toBeNull()
    // 15 min of 60 = 25 %: both.
    expect(durationHint([75, 75, 75, 75, 75], 60, RULES)).toEqual({ minutes: 75, count: 5 })
    // 5 min of 15 = 33 %, but under 10 min.
    expect(durationHint([20, 20, 20, 20, 20], 15, RULES)).toBeNull()
    // Exactly at both thresholds: 10 min of 50 = 20 %.
    expect(durationHint([60, 60, 60, 60, 60], 50, RULES)).toEqual({ minutes: 60, count: 5 })
    // Shorter than planned counts too.
    expect(durationHint([30, 30, 30, 30, 30], 60, RULES)).toEqual({ minutes: 30, count: 5 })
  })

  it('progi z ustawień: inna liczba bloków i inne różnice', () => {
    const rules = hintRulesOf(generalFrom({ durationHintBlocks: 3, durationHintPct: 50, durationHintMin: 5 }))!
    expect(durationHint([45, 45, 45], 30, rules)).toEqual({ minutes: 45, count: 3 })
    expect(durationHint([40, 40, 40], 30, rules)).toBeNull()
  })

  it('bez wartości, bez próbek, wyłączone – bez podpowiedzi', () => {
    expect(durationHint(undefined, 30, RULES)).toBeNull()
    expect(durationHint([45, 45, 45, 45, 45], null, RULES)).toBeNull()
    expect(durationHint([45, 45, 45, 45, 45], 30, null)).toBeNull()
  })

  it('mediana parzystej liczby zaokrąglona przed porównaniem', () => {
    // 42 and 44 … → 43.5 → 45.
    expect(durationHint([40, 42, 44, 46, 48, 50], 30, RULES)).toEqual({ minutes: 45, count: 6 })
  })
})

describe('próbki sprawy i bloku', () => {
  const h = durationHistoryOf('2026-08-26', '2026-11-23', [[{ category: 'analiza', minutes: 45 }, { category: 'inne', minutes: 20 }], [{ category: 'prosby', minutes: 10, oneRequest: true }, { category: 'prosby', minutes: 40 }]], { read: 2, unreadable: 0, missing: 0 })
  const rules = DEFAULT_SETTINGS.categories

  it('blok – jego podkategoria', () => {
    expect(blockSamples(h, 'analiza')).toEqual([45])
    expect(blockSamples(h, 'prosby')).toEqual([10, 40])
    expect(blockSamples(null, 'analiza')).toBeUndefined()
  })

  it('zadanie – jego podkategoria, bez niej (albo usunięta) – „Inne”; prośba – bloki jednej prośby', () => {
    expect(caseSamples(h, { kind: 'task', categoryId: 'analiza' }, rules)).toEqual([45])
    expect(caseSamples(h, { kind: 'task', categoryId: null }, rules)).toEqual([20])
    expect(caseSamples(h, { kind: 'task', categoryId: 'nie-ma' }, rules)).toEqual([20])
    expect(caseSamples(h, { kind: 'request', categoryId: null }, rules)).toEqual([10])
    // Without the subcategory of requests – none.
    const { prosby: _, ...without } = rules
    expect(caseSamples(h, { kind: 'request', categoryId: null }, without)).toBeUndefined()
  })
})

describe('słowa', () => {
  it('„zwykle trwa 45 min”, „1 h 15 min”; tytuł z liczbą bloków i oknem', () => {
    expect(hintText({ minutes: 45, count: 7 })).toBe('zwykle trwa 45 min')
    expect(hintText({ minutes: 75, count: 7 })).toBe('zwykle trwa 1 h 15 min')
    expect(hintTitle({ minutes: 45, count: 7 })).toBe('mediana z 7 bloków w 90 dniach')
  })
})
