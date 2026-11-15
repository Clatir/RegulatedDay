/** D501, D512: the cost a block has – own, else its routine's, else its variant's, else its category's – and how the three numbers are told. */
import { describe, expect, it } from 'vitest'
import { baseCosts, blockCosts, costNumber, costStep, costsText, poolCostsFrom, sameCosts } from '@shared/model/blockCosts'
import { planBlock, planBlockFrom } from '@shared/model/plan'
import { blockJson, putBlock } from '@shared/data/dayEdits'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

const cats = DEFAULT_SETTINGS.categories
const analiza = cats.analiza!

describe('blockCosts (D501)', () => {
  it('a block without costs of its own has its category’s', () => {
    const r = blockCosts({ costs: null, categoryId: 'analiza', variantId: null, routineCosts: null }, cats, analiza)
    expect(r).toEqual({ costs: { head: 3, emotions: 1, senses: 1 }, base: { head: 3, emotions: 1, senses: 1 }, own: false })
  })

  it('the variant’s costs go before the category’s', () => {
    const r = blockCosts({ costs: null, categoryId: 'regeneracja', variantId: 'drzemka', routineCosts: null }, cats, cats.regeneracja!)
    expect(r.costs).toEqual({ head: -3, emotions: -1, senses: -2 })
    expect(r.own).toBe(false)
  })

  it('its own costs win, the base stays what the category says', () => {
    const r = blockCosts({ costs: { head: 5, emotions: 0, senses: -1 }, categoryId: 'analiza', variantId: null, routineCosts: null }, cats, analiza)
    expect(r.costs).toEqual({ head: 5, emotions: 0, senses: -1 })
    expect(r.base).toEqual({ head: 3, emotions: 1, senses: 1 })
    expect(r.own).toBe(true)
  })

  it('a category the settings do not know is read from the rules the block was counted with', () => {
    expect(blockCosts({ costs: null, categoryId: 'gone', variantId: null, routineCosts: null }, cats, analiza).costs).toEqual(analiza.costs)
  })
})

describe('koszt rutyny w kolejności kosztu bloku (D512)', () => {
  const R = { head: 4, emotions: -2, senses: 0 }

  it('blok z rutyną z kosztem: koszt rutyny przed kategorią, „Jak kategoria” wraca do niego', () => {
    expect(blockCosts({ costs: null, categoryId: 'analiza', variantId: null, routineCosts: R }, cats, analiza)).toEqual({ costs: R, base: R, baseFrom: 'routine', own: false })
  })

  it('koszt rutyny przed kosztem wariantu', () => {
    expect(blockCosts({ costs: null, categoryId: 'regeneracja', variantId: 'drzemka', routineCosts: R }, cats, cats.regeneracja!).costs).toEqual(R)
  })

  it('własny koszt bloku przed kosztem rutyny', () => {
    const own = { head: 0, emotions: 0, senses: 5 }
    expect(blockCosts({ costs: own, categoryId: 'analiza', variantId: null, routineCosts: R }, cats, analiza)).toEqual({ costs: own, base: R, baseFrom: 'routine', own: true })
  })

  it('rutyna bez kosztu – wariant, potem kategoria (jak przed D512)', () => {
    expect(baseCosts(cats, 'regeneracja', 'drzemka', cats.regeneracja!, null)).toEqual({ head: -3, emotions: -1, senses: -2 })
    expect(baseCosts(cats, 'analiza', null, analiza, null)).toEqual(analiza.costs)
    expect(baseCosts(cats, 'analiza', null, analiza, R)).toEqual(R)
  })

  it('koszt z pliku: trzy całe liczby −5…5, inaczej brak', () => {
    expect(poolCostsFrom({ head: -5, emotions: 5, senses: 0 })).toEqual({ head: -5, emotions: 5, senses: 0 })
    expect(poolCostsFrom({ head: 6, emotions: 0, senses: 0 })).toBeNull()
    expect(poolCostsFrom({ head: 1, emotions: 0 })).toBeNull()
    expect(poolCostsFrom(null)).toBeNull()
    expect(poolCostsFrom([1, 1, 1])).toBeNull()
  })
})

describe('the three numbers told', () => {
  it('„3 · 1 · 1”, a regeneration with a true minus, tight in the week', () => {
    expect(costsText({ head: 3, emotions: 1, senses: 1 })).toBe('3 · 1 · 1')
    expect(costsText({ head: -1, emotions: -2, senses: -3 })).toBe('−1 · −2 · −3')
    expect(costsText({ head: 3, emotions: 1, senses: 1 }, true)).toBe('3·1·1')
    expect(costNumber(-1)).toBe('−1')
    expect(costNumber(0)).toBe('0')
  })

  it('a step stays within −5…5: a plus at 5 or a minus at −5 changes nothing', () => {
    const c = { head: 5, emotions: -5, senses: 0 }
    expect(costStep(c, 'head', 1)).toEqual(c)
    expect(costStep(c, 'emotions', -1)).toEqual(c)
    expect(costStep(c, 'senses', 1)).toEqual({ head: 5, emotions: -5, senses: 1 })
    expect(sameCosts(costStep(c, 'head', 1), c)).toBe(true)
  })
})

describe('the own costs of a block go through the file', () => {
  const block = planBlock({ id: 'b1', categoryId: 'analiza', durationMin: 60, startMin: 600 })

  it('are written and read back, null goes back to the category', () => {
    const own = { head: 4, emotions: 0, senses: -2 }
    const withOwn = putBlock({ schema: 1, date: '2026-11-16', blocks: [] }, { ...block, costs: own })
    const read = planBlockFrom((withOwn.blocks as unknown[])[0])!
    expect(read.costs).toEqual(own)
    const cleared = putBlock(withOwn, { ...read, costs: null })
    expect(planBlockFrom((cleared.blocks as unknown[])[0])!.costs).toBeNull()
  })

  it('a value outside −5…5 is not an own cost when read', () => {
    expect(planBlockFrom({ ...blockJson(block), costs: { head: 6, emotions: 0, senses: 0 } })!.costs).toBeNull()
  })
})
