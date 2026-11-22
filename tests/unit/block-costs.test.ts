/** D501, D512: the cost a block has – own, else its routine's, else its variant's, else its category's – and how the four numbers are told (D524). */
import { describe, expect, it } from 'vitest'
import { baseCosts, blockCosts, COST_MAX, OLD_COST_MAX, pastOldRange, WIDE_COST_FROM, wideCostWarning, COST_MIN, costNumber, costSet, costStep, costsText, poolCostsFrom, sameCosts } from '@shared/model/blockCosts'
import { planBlock, planBlockFrom } from '@shared/model/plan'
import { blockJson, putBlock } from '@shared/data/dayEdits'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

const cats = DEFAULT_SETTINGS.categories
const analiza = cats.analiza!

describe('blockCosts (D501)', () => {
  it('a block without costs of its own has its category’s', () => {
    const r = blockCosts({ costs: null, categoryId: 'analiza', variantId: null, routineCosts: null }, cats, analiza)
    expect(r).toEqual({ costs: { head: 3, emotions: 1, senses: 1, body: 0 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false })
  })

  it('the variant’s costs go before the category’s', () => {
    const r = blockCosts({ costs: null, categoryId: 'regeneracja', variantId: 'drzemka', routineCosts: null }, cats, cats.regeneracja!)
    expect(r.costs).toEqual({ head: -3, emotions: -1, senses: -2, body: -3 })
    expect(r.own).toBe(false)
  })

  it('its own costs win, the base stays what the category says', () => {
    const r = blockCosts({ costs: { head: 5, emotions: 0, senses: -1, body: 2 }, categoryId: 'analiza', variantId: null, routineCosts: null }, cats, analiza)
    expect(r.costs).toEqual({ head: 5, emotions: 0, senses: -1, body: 2 })
    expect(r.base).toEqual({ head: 3, emotions: 1, senses: 1, body: 0 })
    expect(r.own).toBe(true)
  })

  it('a category the settings do not know is read from the rules the block was counted with', () => {
    expect(blockCosts({ costs: null, categoryId: 'gone', variantId: null, routineCosts: null }, cats, analiza).costs).toEqual(analiza.costs)
  })
})

describe('koszt rutyny w kolejności kosztu bloku (D512)', () => {
  const R = { head: 4, emotions: -2, senses: 0, body: 1 }

  it('blok z rutyną z kosztem: koszt rutyny przed kategorią, „Jak kategoria” wraca do niego', () => {
    expect(blockCosts({ costs: null, categoryId: 'analiza', variantId: null, routineCosts: R }, cats, analiza)).toEqual({ costs: R, base: R, baseFrom: 'routine', own: false })
  })

  it('koszt rutyny przed kosztem wariantu', () => {
    expect(blockCosts({ costs: null, categoryId: 'regeneracja', variantId: 'drzemka', routineCosts: R }, cats, cats.regeneracja!).costs).toEqual(R)
  })

  it('własny koszt bloku przed kosztem rutyny', () => {
    const own = { head: 0, emotions: 0, senses: 5, body: -1 }
    expect(blockCosts({ costs: own, categoryId: 'analiza', variantId: null, routineCosts: R }, cats, analiza)).toEqual({ costs: own, base: R, baseFrom: 'routine', own: true })
  })

  it('rutyna bez kosztu – wariant, potem kategoria (jak przed D512)', () => {
    expect(baseCosts(cats, 'regeneracja', 'drzemka', cats.regeneracja!, null)).toEqual({ head: -3, emotions: -1, senses: -2, body: -3 })
    expect(baseCosts(cats, 'analiza', null, analiza, null)).toEqual(analiza.costs)
    expect(baseCosts(cats, 'analiza', null, analiza, R)).toEqual(R)
  })

  it('koszt z pliku: cztery całe liczby −100…100 (bez ciała – zapis starszej wersji, T1520), inaczej brak (D568)', () => {
    expect(poolCostsFrom({ head: -100, emotions: 100, senses: 0, body: -100 })).toEqual({ head: -100, emotions: 100, senses: 0, body: -100 })
    expect(poolCostsFrom({ head: -100, emotions: 100, senses: 0 })).toEqual({ head: -100, emotions: 100, senses: 0, body: 0 })
    expect(poolCostsFrom({ head: 101, emotions: 0, senses: 0 })).toBeNull()
    expect(poolCostsFrom({ head: 1, emotions: 0, senses: 0, body: -101 })).toBeNull()
    expect(poolCostsFrom({ head: 1.5, emotions: 0, senses: 0 })).toBeNull()
    expect(poolCostsFrom({ head: 1, emotions: 0 })).toBeNull()
    expect(poolCostsFrom(null)).toBeNull()
    expect(poolCostsFrom([1, 1, 1])).toBeNull()
  })
})

describe('the four numbers told (D524)', () => {
  it('„3 · 1 · 1 · 0”, a regeneration with a true minus, tight in the week', () => {
    expect(costsText({ head: 3, emotions: 1, senses: 1, body: 0 })).toBe('3 · 1 · 1 · 0')
    expect(costsText({ head: -1, emotions: -2, senses: -3, body: -1 })).toBe('−1 · −2 · −3 · −1')
    expect(costsText({ head: 3, emotions: 1, senses: 1, body: 0 }, true)).toBe('3·1·1·0')
    expect(costNumber(-1)).toBe('−1')
    expect(costNumber(0)).toBe('0')
  })

  it('a step stays within −100…100: a plus at 100 or a minus at −100 changes nothing (D568)', () => {
    const c = { head: 100, emotions: -100, senses: 0, body: 100 }
    expect(costStep(c, 'head', 1)).toEqual(c)
    expect(costStep(c, 'emotions', -1)).toEqual(c)
    expect(costStep(c, 'body', 1)).toEqual(c)
    expect(costStep(c, 'senses', 1)).toEqual({ head: 100, emotions: -100, senses: 1, body: 100 })
    expect(costStep(c, 'body', -1)).toEqual({ head: 100, emotions: -100, senses: 0, body: 99 })
    expect(sameCosts(costStep(c, 'head', 1), c)).toBe(true)
    // Past the old ±5 a step goes on.
    expect(costStep({ head: 5, emotions: -5, senses: 0, body: 0 }, 'head', 1).head).toBe(6)
    expect(costStep({ head: 5, emotions: -5, senses: 0, body: 0 }, 'emotions', -1).emotions).toBe(-6)
    expect(costStep({ head: 99, emotions: -99, senses: 0, body: 0 }, 'head', 1).head).toBe(100)
    expect(costStep({ head: 99, emotions: -99, senses: 0, body: 0 }, 'emotions', -1).emotions).toBe(-100)
  })

  it('zakres kosztu na godzinę to −100…100 (D568)', () => {
    expect([COST_MIN, COST_MAX]).toEqual([-100, 100])
  })

  it('costSet (D568): ustawia pulę, zaokrągla, przycina do −100…100; nie-skończona wartość nic nie zmienia', () => {
    const c = { head: 3, emotions: 1, senses: 1, body: 0 }
    expect(costSet(c, 'head', 40)).toEqual({ head: 40, emotions: 1, senses: 1, body: 0 })
    expect(costSet(c, 'senses', -20)).toEqual({ head: 3, emotions: 1, senses: -20, body: 0 })
    expect(costSet(c, 'head', 4.4).head).toBe(4)
    expect(costSet(c, 'head', 4.6).head).toBe(5)
    expect(costSet(c, 'head', 150).head).toBe(100)
    expect(costSet(c, 'body', -150).body).toBe(-100)
    expect(costSet(c, 'head', 100).head).toBe(100)
    expect(costSet(c, 'head', -100).head).toBe(-100)
    expect(costSet(c, 'head', Number.NaN)).toEqual(c)
    expect(costSet(c, 'head', Infinity)).toEqual(c)
    expect(costSet(c, 'head', -Infinity)).toEqual(c)
    expect(c).toEqual({ head: 3, emotions: 1, senses: 1, body: 0 })
  })
})

describe('the own costs of a block go through the file', () => {
  const block = planBlock({ id: 'b1', categoryId: 'analiza', durationMin: 60, startMin: 600 })

  it('are written and read back, null goes back to the category', () => {
    const own = { head: 4, emotions: 0, senses: -2, body: 3 }
    const withOwn = putBlock({ schema: 1, date: '2026-11-16', blocks: [] }, { ...block, costs: own })
    const read = planBlockFrom((withOwn.blocks as unknown[])[0])!
    expect(read.costs).toEqual(own)
    const cleared = putBlock(withOwn, { ...read, costs: null })
    expect(planBlockFrom((cleared.blocks as unknown[])[0])!.costs).toBeNull()
  })

  it('a value outside −100…100 is not an own cost when read; −100 and 100 are (D568)', () => {
    expect(planBlockFrom({ ...blockJson(block), costs: { head: 101, emotions: 0, senses: 0 } })!.costs).toBeNull()
    expect(planBlockFrom({ ...blockJson(block), costs: { head: -101, emotions: 0, senses: 0, body: 0 } })!.costs).toBeNull()
    expect(planBlockFrom({ ...blockJson(block), costs: { head: -100, emotions: 100, senses: 0, body: 0 } })!.costs).toEqual({ head: -100, emotions: 100, senses: 0, body: 0 })
  })
})

describe('ostrzeżenie o koszcie spoza ±5 przy starszym komputerze (D568, T2440)', () => {
  const c = (head: number, emotions = 0, senses = 0, body = 0) => ({ head, emotions, senses, body })

  it('starsza wersja czyta koszt spoza ±5 jak brak: pastOldRange, OLD_COST_MAX, WIDE_COST_FROM', () => {
    expect([OLD_COST_MAX, WIDE_COST_FROM]).toEqual([5, '1.37.0'])
    expect(pastOldRange(c(5, -5, 5, -5))).toBe(false)
    expect(pastOldRange(c(6))).toBe(true)
    expect(pastOldRange(c(0, 0, 0, -6))).toBe(true)
  })

  it('brak starszych komputerów albo koszty w ±5 – brak ostrzeżenia', () => {
    expect(wideCostWarning([], [c(40)])).toBeNull()
    expect(wideCostWarning(['Laptop'], [c(5, -5, 0, 0)])).toBeNull()
    expect(wideCostWarning(['Laptop'], [])).toBeNull()
  })

  it('koszt 6 albo −6 (też tylko jeden z kilku) ze starszym komputerem – tekst z jego nazwą', () => {
    const t = wideCostWarning(['Laptop'], [c(6)])
    expect(t).toContain('Komputer Laptop ma starszą wersję aplikacji')
    expect(t).toContain('−5…5')
    expect(wideCostWarning(['Laptop'], [c(1), c(0, 0, 0, -6)])).toBe(t)
    expect(wideCostWarning(['Laptop'], [c(-40)])).toBe(t)
  })

  it('dwa starsze komputery – „Komputery A, B mają”', () => {
    expect(wideCostWarning(['A', 'B'], [c(40)])).toContain('Komputery A, B mają starszą wersję')
    // The ending agrees with the count: one computer – „na tym komputerze”, more – „na tych komputerach”.
    expect(wideCostWarning(['A'], [c(40)])).toMatch(/Zaktualizuj aplikację na tym komputerze\.$/)
    expect(wideCostWarning(['A', 'B'], [c(40)])).toMatch(/Zaktualizuj aplikację na tych komputerach\.$/)
  })
})
