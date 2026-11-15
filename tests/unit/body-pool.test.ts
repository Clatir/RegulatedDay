/**
 * The fourth pool, the body (D520–D525): costs written before it (≤ 1.26 – three pools) read with the body (T1520, T1521), the cost
 * told as four numbers (D524), the log's events of an older version still valid (T1528), a snapshot of an older leader with the body
 * in its blocks' costs (T1527), and the rules version an older version gives way to (T1524).
 */
import { describe, expect, it } from 'vitest'
import { costsText, poolCostsFrom, sameCosts, withBody } from '@shared/model/blockCosts'
import { DEFAULT_CATEGORIES, POOLS, startingBody } from '@shared/model/categories'
import { daySnapshotOf, parseEvent, RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { sameOccurrence } from '@shared/engine/series'
import { planBlockFrom, sessionBlockFieldsFrom } from '@shared/model/plan'
import { routineFrom } from '@shared/model/routines'
import { DEFAULT_SETTINGS, settingsFrom, settingsLackBody, settingsOn, type RulesSettings } from '@shared/model/settings'

const three = (head: number, emotions: number, senses: number) => ({ head, emotions, senses })

describe('ciało – koszty startowe (D523)', () => {
  it('każda kategoria i wariant startowy ma ciało z D523', () => {
    const body = Object.fromEntries(DEFAULT_CATEGORIES.flatMap((c) => [[c.id, c.costs.body], ...c.variants.filter((v) => v.costs).map((v) => [`${c.id}:${v.id}`, v.costs!.body])]))
    expect(body).toEqual({
      sesja: 0,
      analiza: 0,
      nauka: 0,
      'nauka:sluchanie': 0,
      wyklad: 0,
      ogladanie: 0,
      'zajecia-zdalne': 0,
      inne: 1,
      posilek: 0,
      rutyny: 1,
      prosby: 1,
      dojazd: 1,
      'dojazd:dojazd': 1,
      'dojazd:zajecia': 1,
      regeneracja: -1,
      'regeneracja:cisza': -1,
      'regeneracja:spacer': 1,
      'regeneracja:prysznic': -2,
      'regeneracja:drzemka': -3,
      'regeneracja:przerwa-od-ekranu': 0,
      'regeneracja:gra': 0,
      projekty: 0,
      journaling: 0,
      sprawy: 1
    })
    expect(POOLS).toEqual(['head', 'emotions', 'senses', 'body'])
  })

  it('startingBody: podkategoria i wariant startowy – ich ciało; wariant i podkategoria Twoje – 0 (D523, T1536)', () => {
    expect(startingBody('regeneracja', 'drzemka')).toBe(-3)
    expect(startingBody('regeneracja', null)).toBe(-1)
    expect(startingBody('regeneracja', 'moj-wariant')).toBe(0)
    expect(startingBody('sprawy', 'przy-komputerze')).toBe(1)
    expect(startingBody('moja-podkategoria', null)).toBe(0)
    expect(startingBody('constructor', null)).toBe(0)
    expect(startingBody(undefined)).toBe(0)
  })
})

describe('ciało – odczyt ustawień bez ciała (T1521)', () => {
  it('wbudowana podkategoria i jej wariant bez ciała w pliku – ciało startowe; dodane przez Ciebie – 0', () => {
    const s = settingsFrom({
      ...DEFAULT_SETTINGS,
      categories: {
        ...DEFAULT_SETTINGS.categories,
        inne: { ...DEFAULT_SETTINGS.categories.inne, costs: three(2, 2, 2) },
        regeneracja: {
          ...DEFAULT_SETTINGS.categories.regeneracja,
          costs: three(-1, -2, -3),
          variants: [
            { id: 'drzemka', name: 'Leżenie, drzemka', costs: three(-3, -1, -2) },
            { id: 'moje', name: 'Mój sposób', costs: three(-2, -2, -2) }
          ]
        },
        moja: { cls: 'life', kind: 'other', place: 'away', costs: three(1, 1, 1), variants: [] }
      }
    })
    expect(s.categories.inne!.costs).toEqual({ head: 2, emotions: 2, senses: 2, body: 1 })
    expect(s.categories.regeneracja!.costs.body).toBe(-1)
    expect(s.categories.regeneracja!.variants.find((v) => v.id === 'drzemka')!.costs).toEqual({ head: -3, emotions: -1, senses: -2, body: -3 })
    // A variant of yours: 0 – never its subcategory's −1.
    expect(s.categories.regeneracja!.variants.find((v) => v.id === 'moje')!.costs).toEqual({ head: -2, emotions: -2, senses: -2, body: 0 })
    expect(s.categories.moja!.costs).toEqual({ head: 1, emotions: 1, senses: 1, body: 0 })
  })

  it('lista wariantów zapisana przez starszą wersję (bez ciała) zachowuje ciało ustawione wcześniej', () => {
    const variants = (body: number | undefined) => [{ id: 'moje', name: 'Mój', costs: body === undefined ? three(-2, -2, -2) : { ...three(-2, -2, -2), body } }]
    const at = (patches: Array<Record<string, unknown>>) =>
      settingsOn(
        patches.map((patch, i) => ({ id: `c${i}`, from: '2026-11-15', at: null, made: i, patch })),
        '2026-11-15'
      )
    const s = at([{ categories: { regeneracja: { variants: variants(2) } } }, { categories: { regeneracja: { variants: variants(undefined) } } }])
    expect(s.categories.regeneracja!.variants[0]!.costs).toEqual({ head: -2, emotions: -2, senses: -2, body: 2 })
    // The leaf of a pool an older version writes (`costs.head`) keeps the body.
    const t = at([{ categories: { analiza: { costs: { body: 3 } } } }, { categories: { analiza: { costs: { head: 4 } } } }])
    expect(t.categories.analiza!.costs).toEqual({ head: 4, emotions: 1, senses: 1, body: 3 })
  })
})

describe('ciało – odczyt kosztu własnego, rutyny i sesji bez ciała (T1520)', () => {
  it('blok z pliku: ciało startowe jego podkategorii i wariantu; podkategoria Twoja – 0', () => {
    const costs = (categoryId: string, variantId: string | null) => planBlockFrom({ id: 'a', categoryId, variantId, startMin: 600, durationMin: 60, costs: three(1, 1, 1) })!.costs
    expect(costs('regeneracja', 'drzemka')).toEqual({ head: 1, emotions: 1, senses: 1, body: -3 })
    expect(costs('inne', null)).toEqual({ head: 1, emotions: 1, senses: 1, body: 1 })
    expect(costs('moja', null)).toEqual({ head: 1, emotions: 1, senses: 1, body: 0 })
    // A variant of yours of a starting subcategory: 0, not the subcategory's −1 (T1536).
    expect(costs('regeneracja', 'moj-wariant')).toEqual({ head: 1, emotions: 1, senses: 1, body: 0 })
    expect(planBlockFrom({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, costs: { ...three(1, 1, 1), body: -2 } })!.costs!.body).toBe(-2)
    // A body that is there and no cost: no cost at all (never a part of one).
    expect(planBlockFrom({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, costs: { ...three(1, 1, 1), body: 9 } })!.costs).toBeNull()
    expect(sessionBlockFieldsFrom({ categoryId: 'sesja', costs: three(2, 2, 2) })!.costs).toEqual({ head: 2, emotions: 2, senses: 2, body: 0 })
  })

  it('rutyna bez ciała – ciało startowe „Rutyny i opieka nad zwierzętami” (1)', () => {
    expect(routineFrom({ id: 'r', name: 'Poranna', costs: three(2, 0, 1) })!.costs).toEqual({ head: 2, emotions: 0, senses: 1, body: 1 })
    expect(routineFrom({ id: 'r', name: 'Poranna', costs: { ...three(2, 0, 1), body: 0 } })!.costs!.body).toBe(0)
  })

  it('poolCostsFrom i withBody: brak ciała – podane; zła wartość ciała – brak kosztu', () => {
    expect(poolCostsFrom(three(1, 2, 3))).toEqual({ head: 1, emotions: 2, senses: 3, body: 0 })
    expect(poolCostsFrom(three(1, 2, 3), -1)).toEqual({ head: 1, emotions: 2, senses: 3, body: -1 })
    expect(poolCostsFrom({ ...three(1, 2, 3), body: 'x' })).toBeNull()
    expect(withBody(three(1, 2, 3), 2)).toEqual({ head: 1, emotions: 2, senses: 3, body: 2 })
    expect(withBody({ ...three(1, 2, 3), body: -1 }, 2)).toEqual({ head: 1, emotions: 2, senses: 3, body: -1 })
    expect(withBody(null, 2)).toBeNull()
  })
})

describe('ciało – tekst kosztu czterema liczbami (D524)', () => {
  it('„G · E · B · C”, także gdy ciało ma 0; ciasny bez spacji', () => {
    expect(costsText({ head: 3, emotions: 1, senses: 1, body: 0 })).toBe('3 · 1 · 1 · 0')
    expect(costsText({ head: -3, emotions: -1, senses: -2, body: -3 })).toBe('−3 · −1 · −2 · −3')
    expect(costsText({ head: 3, emotions: 1, senses: 1, body: 0 }, true)).toBe('3·1·1·0')
  })

  it('sameCosts porównuje też ciało', () => {
    expect(sameCosts({ head: 1, emotions: 1, senses: 1, body: 0 }, { head: 1, emotions: 1, senses: 1, body: 1 })).toBe(false)
    expect(sameCosts({ head: 1, emotions: 1, senses: 1, body: 1 }, { head: 1, emotions: 1, senses: 1, body: 1 })).toBe(true)
  })
})

describe('ciało – zdarzenia starszej wersji i reguły (T1524, T1527, T1528)', () => {
  const line = (k: string, fields: Record<string, unknown>, v = 15) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 1, l: 1, v, day: '2026-11-15', dom: k.startsWith('energy.') ? 'energy' : 'timer', k, at: 1, ...fields })

  it('check-in, kotwica i koszt bez ciała są ważne; ciało, które jest, musi być poprawne', () => {
    expect(parseEvent(line('energy.checkin', { answers: { head: [0, 1], emotions: [0, 0], senses: [2, 2] } }))).toMatchObject({ ok: true })
    expect(parseEvent(line('energy.checkin', { answers: { head: [0, 1], emotions: [0, 0], senses: [2, 2], body: [1, 2] } }, 16))).toMatchObject({ ok: true })
    expect(parseEvent(line('energy.checkin', { answers: { head: [0, 1], emotions: [0, 0], senses: [2, 2], body: [3, 0] } }, 16))).toEqual({ ok: false, why: 'pole answers' })
    expect(parseEvent(line('energy.signal', { signal: 'rocking', before: { head: 50, emotions: 50, senses: 50 } }))).toMatchObject({ ok: true })
    expect(parseEvent(line('energy.signal', { signal: 'rocking', before: { head: 50, emotions: 50, senses: 50, body: 120 } }))).toEqual({ ok: false, why: 'pole before' })
    expect(parseEvent(line('block.cost', { block: 'a', costs: three(1, 1, 1) }))).toMatchObject({ ok: true })
    expect(parseEvent(line('block.cost', { block: 'a', costs: { ...three(1, 1, 1), body: 6 } }))).toEqual({ ok: false, why: 'pole costs' })
    expect(parseEvent(line('routine.cost', { routine: 'r', costs: three(1, 1, 1), was: null }))).toMatchObject({ ok: true })
    // The body is a pool of a relative assessment and of a descent.
    expect(parseEvent(line('energy.relative', { pool: 'body', delta: -10, before: null }, 16))).toMatchObject({ ok: true })
    expect(parseEvent(line('energy.reserve', { pool: 'body', silent: false }, 16))).toMatchObject({ ok: true })
  })

  it('migawka dnia starszej wersji: koszt własny bloków bez ciała dostaje ciało startowe ich podkategorii', () => {
    const snapshot = { dayType: 'zwykly', settings: {}, templateId: null, templateFrom: null, budgetMin: 0, maxMin: 0, wakeMin: 420, templateWakeMin: 420, changes: [], holidays: [] }
    const blocks = [
      { id: 'a', categoryId: 'regeneracja', variantId: 'drzemka', costs: three(-1, -1, -1) },
      { id: 'b', categoryId: 'inne', variantId: null, costs: { ...three(1, 1, 1), body: -2 } },
      { id: 'c', categoryId: 'inne', variantId: null, costs: null }
    ]
    const e = JSON.parse(line('day.create', { snapshot: { ...snapshot, blocks } })) as AnyEvent
    const s = daySnapshotOf([e])!
    expect(s.blocks.map((b) => b.costs)).toEqual([{ ...three(-1, -1, -1), body: -3 }, { ...three(1, 1, 1), body: -2 }, null])
  })

  it('RULES_VERSION 16: starsza wersja ustępuje prowadzenia (zejścia ciała, nagroda za rezerwę)', () => {
    expect(RULES_VERSION).toBe(16)
  })
})

/** Settings as a version before the body (≤ 1.26) writes them: no `body` in any category's or variant's cost. */
function withoutBodies(settings: RulesSettings): Record<string, unknown> {
  const strip = (c: unknown) => {
    if (!c || typeof c !== 'object') return c
    const { body: _body, ...rest } = c as Record<string, unknown>
    return rest
  }
  const categories = Object.fromEntries(Object.entries(settings.categories).map(([id, c]) => [id, { ...c, costs: strip(c.costs), variants: c.variants.map((v) => (v.costs ? { ...v, costs: strip(v.costs) } : v)) }]))
  return { ...settings, categories }
}

describe('ciało – migawka ustawień starszej wersji (T1532)', () => {
  const mine = settingsOn([{ id: 'u', from: '2026-01-01', at: null, made: 1, patch: { categories: { analiza: { costs: { body: 2 } }, regeneracja: { variants: [{ id: 'drzemka', name: 'Leżenie, drzemka', costs: { head: -3, emotions: -1, senses: -2, body: -1 } }, { id: 'moje', name: 'Moje', costs: { head: 0, emotions: 0, senses: 0, body: 4 } }] } } } }], '2026-11-15')
  const legacy = withoutBodies(mine)

  it('settingsLackBody rozpoznaje ustawienia bez ciała', () => {
    expect(settingsLackBody(legacy)).toBe(true)
    expect(settingsLackBody(mine)).toBe(false)
    expect(settingsLackBody({})).toBe(false)
  })

  it('migawka dnia z 1.26: ciało kategorii i wariantów z Twoich ustawień tej daty, nie startowe', () => {
    const snapshot = { dayType: 'zwykly', settings: legacy, templateId: null, templateFrom: null, budgetMin: 0, maxMin: 0, wakeMin: 420, templateWakeMin: 420, blocks: [], changes: [], holidays: [] }
    const e = JSON.parse(JSON.stringify({ id: 'x', c: 'pcb', n: 1, t: 5, l: 5, v: 15, day: '2026-11-15', dom: 'timer', k: 'day.create', snapshot })) as AnyEvent
    let asked: number | null = null
    const s = daySnapshotOf([e], (at) => ((asked = at), mine))!
    expect(asked).toBe(5)
    expect(s.settings.categories.analiza!.costs.body).toBe(2)
    expect(s.settings.categories.regeneracja!.variants.map((v) => [v.id, v.costs?.body])).toEqual([
      ['drzemka', -1],
      ['moje', 4]
    ])
    // Without your settings (a caller that does not know them): the starting body, a variant of yours – 0 (T1521).
    const alone = daySnapshotOf([e])!
    expect(alone.settings.categories.analiza!.costs.body).toBe(0)
    expect(alone.settings.categories.regeneracja!.variants.map((v) => v.costs?.body)).toEqual([-3, 0])
    // A snapshot with the body: your settings are never asked.
    const fresh = JSON.parse(JSON.stringify({ ...(e as object), snapshot: { ...snapshot, settings: mine } })) as AnyEvent
    expect(daySnapshotOf([fresh], () => DEFAULT_SETTINGS)!.settings.categories.analiza!.costs.body).toBe(2)
  })

  it('bloki migawki bez ciała – reguła pliku bloku (zakres sprawdzony, T1520)', () => {
    const snapshot = { dayType: 'zwykly', settings: {}, templateId: null, templateFrom: null, budgetMin: 0, maxMin: 0, wakeMin: 420, templateWakeMin: 420, changes: [], holidays: [] }
    const blocks = [
      { id: 'a', categoryId: 'regeneracja', variantId: 'moje', costs: three(1, 1, 1) },
      { id: 'b', categoryId: 'inne', variantId: null, costs: three(9, 1, 1) }
    ]
    const e = JSON.parse(JSON.stringify({ id: 'x', c: 'pcb', n: 1, t: 5, l: 5, v: 15, day: '2026-11-15', dom: 'timer', k: 'day.create', snapshot: { ...snapshot, blocks } })) as AnyEvent
    expect(daySnapshotOf([e])!.blocks.map((b) => b.costs)).toEqual([{ ...three(1, 1, 1), body: 0 }, null])
  })
})

describe('ciało – wystąpienie serii w pliku dnia starszej wersji (T1533)', () => {
  it('blok pliku dnia z kosztem bez ciała jest tym samym wystąpieniem co seria z ciałem startowym', () => {
    const raw = { id: 'occ', categoryId: 'inne', variantId: null, startMin: 600, durationMin: 60, fixed: false, background: null, costs: three(2, 1, 1), bgCostPct: null, note: '', name: null, routine: null, steps: [] }
    const occ = planBlockFrom(raw)!
    expect(occ.costs).toEqual({ ...three(2, 1, 1), body: 1 })
    expect(sameOccurrence(raw, occ)).toBe(true)
    expect(sameOccurrence({ ...raw, costs: { ...three(2, 1, 1), body: 3 } }, occ)).toBe(false)
  })
})
