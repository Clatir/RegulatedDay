/**
 * The words of the line after a group change (D529–D531): Polish plurals, the left-out and the stayed with their reasons once each,
 * the energy, the series' note, the message of a „Cofnij” that left what changed since.
 */
import { describe, expect, it } from 'vitest'
import { energyChangeText, groupCount, groupLineText, keptText, skippedText, stayedText, VERB } from '@shared/groupText'

describe('liczebniki: 1 blok, 2–4 bloki, 5 bloków (sprawy, dni)', () => {
  it('bloki', () => {
    expect([1, 2, 4, 5, 12, 14, 22, 25].map((n) => groupCount(n))).toEqual(['1 blok', '2 bloki', '4 bloki', '5 bloków', '12 bloków', '14 bloków', '22 bloki', '25 bloków'])
  })
  it('sprawy i dni', () => {
    expect([1, 3, 5].map((n) => groupCount(n, 'case'))).toEqual(['1 sprawa', '3 sprawy', '5 spraw'])
    expect([1, 2, 7].map((n) => groupCount(n, 'day'))).toEqual(['1 dzień', '2 dni', '7 dni'])
  })
})

describe('linia po zmianie grupowej (bez „Cofnij” – to przycisk osobno)', () => {
  it('„Zmieniono 4 bloki”', () => {
    expect(groupLineText({ n: 4 })).toBe('Zmieniono 4 bloki')
    expect(groupLineText({ n: 1 })).toBe('Zmieniono 1 blok')
    expect(groupLineText({ n: 7, kind: 'day' })).toBe('Zmieniono 7 dni')
    expect(groupLineText({ verb: VERB.planned, n: 3, kind: 'case' })).toBe('Zaplanowano 3 sprawy')
  })

  it('pominięte: liczba i powody w kolejności, bez powtórzeń (przykład ze specyfikacji)', () => {
    expect(groupLineText({ n: 3, skipped: ['zaczęty'] })).toBe('Zmieniono 3 bloki · pominięto 1: zaczęty')
    expect(groupLineText({ n: 3, skipped: ['zaczęty', 'sesja'] })).toBe('Zmieniono 3 bloki · pominięto 2: zaczęty, sesja')
    expect(groupLineText({ n: 2, skipped: ['sesja', 'zaczęty', 'sesja'] })).toBe('Zmieniono 2 bloki · pominięto 3: sesja, zaczęty')
    expect(skippedText([])).toBeNull()
  })

  it('zostały na miejscu (D531): „Przeniesiono 3 · 1 został – już trwa”', () => {
    expect(groupLineText({ verb: VERB.moved, n: 3, stayed: ['już trwa'] })).toBe('Przeniesiono 3 bloki · 1 został – już trwa')
    expect(stayedText(['już trwa', 'zaparkowany'])).toBe('2 zostały – już trwa, zaparkowany')
    expect(stayedText(['a', 'a', 'a', 'a', 'a'])).toBe('5 zostało – a')
    expect(stayedText([])).toBeNull()
  })

  it('energia: „najniższa energia 52 → 44”, tylko gdy się zmieniła', () => {
    expect(groupLineText({ n: 4, energy: { from: 52, to: 44 } })).toBe('Zmieniono 4 bloki · najniższa energia 52 → 44')
    expect(groupLineText({ n: 4, energy: { from: 52.2, to: 51.8 } })).toBe('Zmieniono 4 bloki')
    expect(groupLineText({ n: 4, energy: null })).toBe('Zmieniono 4 bloki')
    expect(energyChangeText(52.4, 43.6)).toBe('najniższa energia 52 → 44')
  })

  it('blok serii: dopisek; wszystkie części w kolejności: pominięte, zostały, energia, seria', () => {
    expect(groupLineText({ n: 3, series: true })).toBe('Zmieniono 3 bloki · bloki serii – tylko te dni')
    expect(groupLineText({ n: 3, skipped: ['zaczęty'], stayed: ['już trwa'], energy: { from: 52, to: 44 }, series: true })).toBe(
      'Zmieniono 3 bloki · pominięto 1: zaczęty · 1 został – już trwa · najniższa energia 52 → 44 · bloki serii – tylko te dni'
    )
  })
})

describe('komunikat „Cofnij”, które zostawiło zmienione od tego czasu (D529, D313)', () => {
  it('bloki', () => {
    expect(keptText(2)).toBe('2 bloki zmienione od tego czasu – zostały')
    expect(keptText(1)).toBe('1 blok zmieniony od tego czasu – został')
    expect(keptText(5)).toBe('5 bloków zmienionych od tego czasu – zostało')
  })
  it('sprawy (rodzaj żeński) i dni', () => {
    expect(keptText(1, 'case')).toBe('1 sprawa zmieniona od tego czasu – została')
    expect(keptText(3, 'case')).toBe('3 sprawy zmienione od tego czasu – zostały')
    expect(keptText(2, 'day')).toBe('2 dni zmienione od tego czasu – zostały')
  })
})

describe('zostały na miejscu – rodzaj jak rzeczownik (poprawka po przeglądzie)', () => {
  it('sprawy: „została”, dni i bloki: „został”', () => {
    expect(stayedText(['już trwa'], 'case')).toBe('1 została – już trwa')
    expect(stayedText(['a', 'b'], 'case')).toBe('2 zostały – a, b')
    expect(stayedText(['a'], 'day')).toBe('1 został – a')
    expect(stayedText(['a'])).toBe('1 został – a')
    expect(groupLineText({ verb: VERB.moved, n: 3, kind: 'case', stayed: ['już trwa'] })).toBe('Przeniesiono 3 sprawy · 1 została – już trwa')
  })
})
