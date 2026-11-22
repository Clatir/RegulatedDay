/**
 * „Przelicz koszty ×N” (D566, D567): v' = clamp(zaokrąglenie połówek od zera(v × N), −100, 100); pule i zakres niewybrane bez zmian; podkategorie
 * i warianty z ustawień w mocy od daty zmiany, rutyny wprost; własne koszty bloków w dniach od daty zmiany (dzień miniony i blok zaczęty –
 * bez zmian), szablony i serie – nowa wersja od tej daty (późniejsze też, gdy blok ma nadal stary koszt). „Cofnij” przywraca tylko to, co
 * nadal stoi jak po przeliczeniu.
 */
import { describe, expect, it } from 'vitest'
import { COST_SCALE_FACTORS, costScalePlan, costScaleUndo, parseScaleFactor, roundHalfAway, scaleCost, scaleCosts, scaleLabel, type ScaleInput, type ScaleOptions } from '@shared/engine/costScale'
import type { Costs } from '@shared/model/categories'
import { planBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import type { Series } from '@shared/model/series'
import { settingsOn, type RulesSettings } from '@shared/model/settings'

const c = (head: number, emotions: number, senses: number, body: number): Costs => ({ head, emotions, senses, body })
const TODAY = '2026-11-22'
const FROM = '2026-11-23'
const ALL: ScaleOptions = { n: 2, pools: ['head', 'emotions', 'senses', 'body'], scope: ['categories', 'variants', 'routines', 'blocks', 'templates'] }

/** Settings with only „analiza” 60·1·1·0 (a variant 2·0·0·0 and one „jak podkategoria”) and „inne” 1·1·1·0 – the rest with no cost. */
function settings(): RulesSettings {
  const s = settingsOn([], FROM)
  const zero = Object.fromEntries(Object.entries(s.categories).map(([id, r]) => [id, { ...r, costs: c(0, 0, 0, 0), variants: r.variants.map((v) => ({ id: v.id, name: v.name })) }]))
  return {
    ...s,
    categories: { ...zero, analiza: { ...s.categories.analiza!, costs: c(60, 1, 1, 0), variants: [{ id: 'gleboka', name: 'Głęboka', costs: c(2, 0, 0, 0) }, { id: 'lekka', name: 'Lekka' }] }, inne: { ...s.categories.inne!, costs: c(1, 1, 1, 0), variants: [] } }
  }
}

const routine = (id: string, costs: Costs | null): Routine => ({ id, name: `Rutyna ${id}`, normal: [], worse: [], archived: false, costs })
const tplBlock = (id: string, costs: Costs | null) => planBlock({ id, categoryId: 'inne', durationMin: 30, startMin: 600, origin: 'template', costs })
const dayBlock = (id: string, costs: Costs | null) => planBlock({ id, categoryId: 'inne', durationMin: 30, startMin: 600, costs })
const template = (versions: Template['versions']): Template => ({ id: 't1', name: 'Zwykły', dayType: 'zwykly', weekdays: [1], versions, archived: false })
const series = (id: string, versions: Series['versions']): Series => ({ id, root: id, start: '2026-11-01', until: null, count: null, versions, archived: false })
const sBlock = (costs: Costs | null) => ({ categoryId: 'inne', variantId: null, startMin: 600, durationMin: 30, fixed: false, background: null, costs, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: [] })

function input(over: Partial<ScaleInput> = {}): ScaleInput {
  const s = over.settings ?? settings()
  return { settings: s, names: { rd: rdFrom(undefined), settings: s, routines: [], requests: [] }, routines: [], templates: [], series: [], days: [], from: FROM, today: TODAY, ...over }
}

describe('reguła liczby (D567 p.3)', () => {
  it('×2: 2 → 4, 3 → 6 (bez przycięcia – zakres ±100, D568), 60 → 100 przycięte, −60 → −100 przycięte, 50 → 100 dokładnie, 0 → 0', () => {
    expect(scaleCost(2, 2)).toEqual({ value: 4, clipped: false })
    expect(scaleCost(3, 2)).toEqual({ value: 6, clipped: false })
    expect(scaleCost(60, 2)).toEqual({ value: 100, clipped: true })
    expect(scaleCost(-60, 2)).toEqual({ value: -100, clipped: true })
    expect(scaleCost(50, 2)).toEqual({ value: 100, clipped: false })
    expect(scaleCost(-50, 2)).toEqual({ value: -100, clipped: false })
    expect(scaleCost(0, 2)).toEqual({ value: 0, clipped: false })
  })

  it('połówki od zera: 1,5 → 2, −1,5 → −2, 2,5 → 3; ×0,5: 3 → 2, 1 → 1, −1 → −1', () => {
    expect([roundHalfAway(1.5), roundHalfAway(-1.5), roundHalfAway(2.5), roundHalfAway(-0.4)]).toEqual([2, -2, 3, 0])
    expect(Object.is(roundHalfAway(-0.4), 0)).toBe(true)
    expect([scaleCost(3, 0.5).value, scaleCost(1, 0.5).value, scaleCost(-1, 0.5).value, scaleCost(-3, 0.5).value]).toEqual([2, 1, -1, -2])
    expect([scaleCost(1, 1.5).value, scaleCost(5, 0.5).value, scaleCost(99, 0.5).value, scaleCost(-99, 0.5).value]).toEqual([2, 3, 50, -50])
  })

  it('pule niewybrane zostają; przycięte pule są wskazane', () => {
    expect(scaleCosts(c(60, 2, 1, -60), 2, ['head', 'body'])).toEqual({ costs: c(100, 2, 1, -100), clipped: ['head', 'body'] })
    expect(scaleCosts(c(3, 2, 1, -3), 2, ['head', 'body'])).toEqual({ costs: c(6, 2, 1, -6), clipped: [] })
  })

  it('mnożnik 0,5–3 co 0,25, zapis polski z przecinkiem', () => {
    expect(COST_SCALE_FACTORS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3])
    expect([scaleLabel(1.5), scaleLabel(2), scaleLabel(0.75)]).toEqual(['×1,5', '×2', '×0,75'])
  })

  it('własny mnożnik (T2431): liczba dodatnia, przecinek albo kropka („1,3” = 1.3)', () => {
    expect(['1,3', '1.3', ' 1,3 ', '×1,3', 'x 1,3', '0,05', ',5', '5', '6', '1,234', '10'].map(parseScaleFactor)).toEqual([1.3, 1.3, 1.3, 1.3, 1.3, 0.05, 0.5, 5, 6, 1.234, 10])
    expect(['', ' ', '0', '0,00', '-1', '−1', 'abc', '1,3x', '1,,3', '1.3.1', '1,3,1', '1e1', 'Infinity', '1,', `1${'0'.repeat(400)}`].map(parseScaleFactor)).toEqual(Array(15).fill(null))
    expect([scaleLabel(1.3), scaleLabel(0.05), scaleLabel(0.0000001), scaleLabel(1e21), scaleLabel(1.234)]).toEqual(['×1,3', '×0,05', '×0,0000001', '×1000000000000000000000', '×1,234'])
  })

  it('własny mnożnik liczony jak dokładnie (T2431): każdy koszt −100…100 × każdy mnożnik 0,0001–5 (do czterech miejsc) – jak w liczbach całkowitych', () => {
    const D = 10_000
    // v · k / D rounded half away from zero, in integers only.
    const exact = (v: number, k: number) => {
      const q = Math.trunc((2 * Math.abs(v) * k + D) / (2 * D))
      return Math.max(-100, Math.min(100, v < 0 ? -q : q))
    }
    let wrong = 0
    for (let k = 1; k <= 5 * D; k++) {
      const n = parseScaleFactor(`${Math.trunc(k / D)},${String(k % D).padStart(4, '0')}`)!
      for (let v = -100; v <= 100; v++) if (scaleCost(v, n).value !== exact(v, k)) wrong++
    }
    expect(wrong).toBe(0)
    expect([scaleCost(3, 1.3).value, scaleCost(2, 1.3).value, scaleCost(-3, 1.3).value, scaleCost(5, 0.7).value, scaleCost(4, 0.125).value, scaleCost(-4, 0.125).value]).toEqual([4, 3, -4, 4, 1, -1])
    expect([scaleCost(2, 6), scaleCost(17, 6), scaleCost(-17, 6)]).toEqual([{ value: 12, clipped: false }, { value: 100, clipped: true }, { value: -100, clipped: true }])
  })
  it('iloczyn dokładny, nie zmiennoprzecinkowy (T2440): połówki tuż pod szumem liczby, wiele miejsc i zapis z wykładnikiem', () => {
    // The floating products are 14.499…, 28.499…, 14.499…, 31.499…, 56.499… – the exact ones are halves.
    expect([scaleCost(100, 0.145), scaleCost(100, 0.285), scaleCost(50, 0.29), scaleCost(90, 0.35), scaleCost(100, 0.565), scaleCost(-100, 0.145)].map((r) => r.value)).toEqual([15, 29, 15, 32, 57, -15])
    // A factor of many decimals: what was typed counts, not a tolerance – just under the half stays under it.
    expect([scaleCost(100, parseScaleFactor('0,1449999999999')!).value, scaleCost(100, parseScaleFactor('0,1450000000001')!).value]).toEqual([14, 15])
    // `String(n)` with an exponent: a tiny factor and a huge one.
    expect([scaleCost(100, 1e-7), scaleCost(5, 5e-7), scaleCost(3, 1e21), scaleCost(-3, 1e21), scaleCost(0, 1e21)]).toEqual([
      { value: 0, clipped: false },
      { value: 0, clipped: false },
      { value: 100, clipped: true },
      { value: -100, clipped: true },
      { value: 0, clipped: false }
    ])
  })
})

describe('plan zmian – ustawienia i rutyny (D566, D567 p.1)', () => {
  it('podkategoria i wariant z własnym kosztem; wariant „jak podkategoria” i podkategoria bez zmiany pominięte', () => {
    const p = costScalePlan(input(), ALL)
    expect(p.items.map((i) => i.key)).toEqual(['category:analiza', 'variant:analiza:gleboka', 'category:inne'])
    const a = p.items[0]!
    expect([a.before, a.after, a.clipped, a.pools]).toEqual([c(60, 1, 1, 0), c(100, 2, 2, 0), ['head'], ['head', 'emotions', 'senses']])
    expect(p.write.settingsPatch).toEqual({
      categories: { analiza: { costs: c(100, 2, 2, 0), variants: [{ id: 'gleboka', name: 'Głęboka', costs: c(4, 0, 0, 0) }, { id: 'lekka', name: 'Lekka' }] }, inne: { costs: c(2, 2, 2, 0) } }
    })
  })

  it('×1 – nic się nie zmienia (pusty plan, bez wpisu ustawień)', () => {
    const p = costScalePlan(input({ routines: [routine('r1', c(2, 1, 0, 0))] }), { ...ALL, n: 1 })
    expect(p.items).toEqual([])
    expect(p.write.settingsPatch).toBeNull()
  })

  it('zakres niewybrany bez zmian: tylko rutyny – ustawienia nietknięte, rutyna bez kosztu pominięta', () => {
    const p = costScalePlan(input({ routines: [routine('r1', c(2, 1, 0, 0)), routine('r2', null)] }), { ...ALL, scope: ['routines'] })
    expect(p.items.map((i) => i.key)).toEqual(['routine:r1'])
    expect(p.write.settingsPatch).toBeNull()
    expect(p.write.routines).toEqual([{ id: 'r1', costs: c(4, 2, 0, 0) }])
  })

  it('pula niewybrana bez zmian: tylko G', () => {
    const p = costScalePlan(input(), { ...ALL, pools: ['head'], scope: ['categories'] })
    expect(p.items.map((i) => [i.key, i.after])).toEqual([
      ['category:analiza', c(100, 1, 1, 0)],
      ['category:inne', c(2, 1, 1, 0)]
    ])
  })
})

describe('plan zmian – bloki dni (D567 p.2)', () => {
  it('dzień od daty zmiany tak; dzień miniony i sprzed daty nie; blok zaczęty (keep) i bez własnego kosztu nie', () => {
    const p = costScalePlan(
      input({
        days: [
          { date: '2026-11-20', blocks: [dayBlock('past', c(2, 0, 0, 0))] },
          { date: TODAY, blocks: [dayBlock('today', c(2, 0, 0, 0))] },
          { date: '2026-11-25', blocks: [dayBlock('fut', c(2, 1, 0, 0)), dayBlock('own', null), dayBlock('run', c(1, 1, 1, 1))], keep: new Set(['run']) }
        ]
      }),
      { ...ALL, scope: ['blocks'] }
    )
    expect(p.items.map((i) => i.key)).toEqual(['day:2026-11-25:fut'])
    expect(p.write.days).toEqual([{ date: '2026-11-25', block: expect.objectContaining({ id: 'fut' }), costs: c(4, 2, 0, 0) }])
  })

  it('„od dziś”: dzisiejszy niezaczęty blok z własnym kosztem też; zaczęty zostaje', () => {
    const p = costScalePlan(input({ from: TODAY, days: [{ date: TODAY, blocks: [dayBlock('a', c(1, 0, 0, 0)), dayBlock('begun', c(1, 0, 0, 0))], keep: new Set(['begun']) }] }), { ...ALL, scope: ['blocks'] })
    expect(p.items.map((i) => i.key)).toEqual([`day:${TODAY}:a`])
  })
})

describe('plan zmian – szablony i serie (D567 p.2)', () => {
  it('szablon: nowa wersja od daty zmiany; wcześniejsza zostaje; późniejsza – blok z dawnym kosztem tak, zmieniony ręcznie nie, nowy tak', () => {
    const t = template([
      { from: '2026-11-01', blocks: [tplBlock('a', c(2, 1, 0, 0)), tplBlock('b', c(1, 1, 1, 0)), tplBlock('n', null)], budgetMin: null, maxMin: null },
      { from: '2026-12-01', blocks: [tplBlock('a', c(2, 1, 0, 0)), tplBlock('b', c(-1, 0, 0, 0)), tplBlock('x', c(1, 0, 0, 0))], budgetMin: null, maxMin: null }
    ])
    const p = costScalePlan(input({ templates: [t] }), { ...ALL, scope: ['templates'] })
    const out = p.write.templates[0]!
    expect(out.versions.map((v) => v.from)).toEqual(['2026-11-01', FROM, '2026-12-01'])
    expect(out.versions[0]).toEqual(t.versions[0])
    expect(out.versions[1]!.blocks.map((x) => x.costs)).toEqual([c(4, 2, 0, 0), c(2, 2, 2, 0), null])
    expect(out.versions[2]!.blocks.map((x) => x.costs)).toEqual([c(4, 2, 0, 0), c(-1, 0, 0, 0), c(2, 0, 0, 0)])
    expect(p.items.map((i) => i.key)).toEqual([`template:t1:${FROM}:a`, `template:t1:${FROM}:b`, 'template:t1:2026-12-01:a', 'template:t1:2026-12-01:x'])
  })

  it('szablon bez własnych kosztów – bez nowej wersji; zakres „szablony” niewybrany – szablon nietknięty', () => {
    const plain = template([{ from: '2026-11-01', blocks: [tplBlock('n', null)], budgetMin: null, maxMin: null }])
    expect(costScalePlan(input({ templates: [plain] }), ALL).write.templates).toEqual([])
    const own = template([{ from: '2026-11-01', blocks: [tplBlock('a', c(1, 0, 0, 0))], budgetMin: null, maxMin: null }])
    expect(costScalePlan(input({ templates: [own] }), { ...ALL, scope: ['categories', 'blocks'] }).write.templates).toEqual([])
  })

  it('seria (zakres „bloki”): nowa wersja od daty zmiany; seria zakończona przed datą – bez zmian', () => {
    const v = (costs: Costs): Series['versions'][number] => ({ from: '2026-11-01', block: sBlock(costs), rule: { kind: 'daily' }, special: 'ask' })
    const p = costScalePlan(input({ series: [{ series: series('s1', [v(c(1, 2, 0, 0))]), last: null }, { series: series('s2', [v(c(1, 2, 0, 0))]), last: '2026-11-20' }] }), { ...ALL, scope: ['blocks'] })
    expect(p.write.series.map((x) => x.id)).toEqual(['s1'])
    expect(p.write.series[0]!.versions.map((x) => [x.from, x.block.costs])).toEqual([
      ['2026-11-01', c(1, 2, 0, 0)],
      [FROM, c(2, 4, 0, 0)]
    ])
    expect(p.items.map((i) => [i.key, i.name])).toEqual([[`series:s1:${FROM}`, 'Angielski']])
  })
})

describe('„Cofnij” (D567 p.4)', () => {
  it('przywraca tylko wartości nadal takie jak po przeliczeniu; zmienione w międzyczasie zostają', () => {
    const t = template([{ from: '2026-11-01', blocks: [tplBlock('a', c(2, 1, 0, 0))], budgetMin: null, maxMin: null }])
    const day = { date: '2026-11-25', blocks: [dayBlock('fut', c(2, 0, 0, 0))] }
    const p = costScalePlan(input({ routines: [routine('r1', c(2, 1, 0, 0)), routine('r2', c(1, 0, 0, 0))], templates: [t], days: [day] }), ALL)
    // After the save – and two values changed meanwhile (the routine r2, the subcategory „inne”).
    const s = settings()
    const analiza = { ...s.categories.analiza!, costs: c(100, 2, 2, 0), variants: [{ id: 'gleboka', name: 'Głęboka', costs: c(4, 0, 0, 0) }, { id: 'lekka', name: 'Lekka' }] }
    const now = {
      settings: { ...s, categories: { ...s.categories, analiza, inne: { ...s.categories.inne!, costs: c(0, 0, 0, 0) } } },
      routines: [routine('r1', c(4, 2, 0, 0)), routine('r2', c(-2, 0, 0, 0))],
      templates: p.write.templates,
      series: [],
      days: [{ date: '2026-11-25', blocks: p.write.days.map((d) => ({ ...d.block, costs: d.costs })) }]
    }
    const r = costScaleUndo(now, p.items)
    expect(r.kept.map((i) => i.key).sort()).toEqual(['category:inne', 'routine:r2'])
    expect(r.write.settingsPatch).toEqual({ categories: { analiza: { costs: c(60, 1, 1, 0), variants: [{ id: 'gleboka', name: 'Głęboka', costs: c(2, 0, 0, 0) }, { id: 'lekka', name: 'Lekka' }] } } })
    expect(r.write.routines).toEqual([{ id: 'r1', costs: c(2, 1, 0, 0) }])
    expect(r.write.templates[0]!.versions.find((v) => v.from === FROM)!.blocks[0]!.costs).toEqual(c(2, 1, 0, 0))
    expect(r.write.days).toEqual([{ date: '2026-11-25', block: expect.objectContaining({ id: 'fut' }), costs: c(2, 0, 0, 0) }])
  })

  it('blok zaczęty od tego czasu albo zniknięty – zostaje', () => {
    const p = costScalePlan(input({ from: TODAY, days: [{ date: TODAY, blocks: [dayBlock('a', c(1, 0, 0, 0))] }] }), { ...ALL, scope: ['blocks'] })
    const after = [dayBlock('a', c(2, 0, 0, 0))]
    const now = { settings: settings(), routines: [], templates: [], series: [] }
    expect(costScaleUndo({ ...now, days: [{ date: TODAY, blocks: after, keep: new Set(['a']) }] }, p.items).kept).toHaveLength(1)
    expect(costScaleUndo({ ...now, days: [{ date: TODAY, blocks: [] }] }, p.items).kept).toHaveLength(1)
    expect(costScaleUndo({ ...now, days: [{ date: TODAY, blocks: after }] }, p.items).write.days).toHaveLength(1)
  })
})

