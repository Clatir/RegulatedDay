/**
 * The form of a series (D381, D382, D401): the draft a new series starts as, the rule and the end it makes, what a change
 * of the form sends (only what differs), which fields of a block's panel ask the scope, the words under the panel of an
 * occurrence, and the mark by its name.
 */
import { describe, expect, it } from 'vitest'
import { newSeries } from '@shared/engine/series'
import { planBlock, planBlockFrom } from '@shared/model/plan'
import { DEFAULT_SPECIAL, type SeriesBlock, type SeriesRule } from '@shared/model/series'
import { SERIES_MARK } from '@shared/seriesText'
import { blockMayRepeat } from '@renderer/features/series/BlockSeries'
import {
  createInput,
  draftOf,
  draftPatch,
  draftProblem,
  endOf,
  isEmptyPatch,
  newDraft,
  occurrenceRuleText,
  ruleOf,
  seriesBlockOf,
  seriesBlockPatch,
  touchesSeries,
  type SeriesDraft
} from '@renderer/features/series/seriesForm'

const own = planBlock({ id: 'own', categoryId: 'inne', startMin: 17 * 60, durationMin: 60, origin: 'user' })
const block: SeriesBlock = { categoryId: own.categoryId, variantId: null, startMin: 17 * 60, durationMin: 60, fixed: false, background: null, costs: own.costs, bgCostPct: null, note: '', name: null, routine: null, steps: [] }
const series = (rule: SeriesRule, end: { until: string | null; count: number | null } = { until: null, count: null }, start = '2026-11-12') => newSeries('s1', block, start, rule, 'ask', end)
const blockOf = (o: Partial<Parameters<typeof planBlock>[0]>) => planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', ...o })

describe('nowy szkic z dnia bloku', () => {
  it('nie powtarza; dzień tygodnia, dzień miesiąca i który z kolei – z daty bloku', () => {
    // 2026-11-12 is a Thursday, the 12th – the 2nd Thursday of the month.
    expect(newDraft('2026-11-12')).toMatchObject({ kind: 'none', every: 1, days: [4], day: 12, nth: 2, weekday: 4, end: 'never', special: DEFAULT_SPECIAL })
  })

  it('piąty taki dzień tygodnia to „ostatni”', () => {
    // 2026-11-30 is the 5th Monday of November.
    expect(newDraft('2026-11-30')).toMatchObject({ nth: -1, weekday: 1, day: 30 })
  })

  it('nowa seria pyta w dni szczególne (D382)', () => {
    expect(newDraft('2026-11-12').special).toBe('ask')
  })
})

describe('reguła i koniec z szkicu', () => {
  const base = newDraft('2026-11-12')
  it('każdy rodzaj reguły', () => {
    expect(ruleOf({ ...base, kind: 'none' })).toBeNull()
    expect(ruleOf({ ...base, kind: 'daily' })).toEqual({ kind: 'daily' })
    expect(ruleOf({ ...base, kind: 'workdays' })).toEqual({ kind: 'workdays' })
    expect(ruleOf({ ...base, kind: 'weekly', every: 2, days: [4, 1] })).toEqual({ kind: 'weekly', every: 2, days: [1, 4], anchor: '' })
    expect(ruleOf({ ...base, kind: 'monthDay', day: 31 })).toEqual({ kind: 'monthDay', day: 31 })
    expect(ruleOf({ ...base, kind: 'monthWeekday', nth: -1, weekday: 5 })).toEqual({ kind: 'monthWeekday', nth: -1, weekday: 5 })
  })

  it('tygodniowa bez dnia jest niepełna i mówi dlaczego', () => {
    const d: SeriesDraft = { ...base, kind: 'weekly', days: [] }
    expect(ruleOf(d)).toBeNull()
    expect(draftProblem(d)).toBe('Wybierz przynajmniej jeden dzień tygodnia.')
    expect(draftProblem({ ...d, days: [1] })).toBeNull()
    expect(draftProblem({ ...base, kind: 'none' })).toBeNull()
  })

  it('koniec: nigdy, po N razach albo w dniu – jedno z dwojga', () => {
    expect(endOf({ ...base, end: 'never' })).toEqual({ until: null, count: null })
    expect(endOf({ ...base, end: 'count', count: 10 })).toEqual({ until: null, count: 10 })
    expect(endOf({ ...base, end: 'until', until: '2026-12-31' })).toEqual({ until: '2026-12-31', count: null })
  })

  it('„Powtarzaj”: wejście API z regułą, końcem i dniami szczególnymi; „Nie powtarzaj” – nic', () => {
    expect(createInput('2026-11-12', 'w1', base)).toBeNull()
    expect(createInput('2026-11-12', 'w1', { ...base, kind: 'weekly', end: 'count', count: 5, special: 'held' })).toEqual({
      date: '2026-11-12',
      blockId: 'w1',
      rule: { kind: 'weekly', every: 1, days: [4], anchor: '' },
      special: 'held',
      until: null,
      count: 5
    })
  })
})

describe('szkic istniejącej serii i zmiana z formularza', () => {
  const s = series({ kind: 'weekly', every: 2, days: [4], anchor: '2026-11-12' }, { until: '2027-04-30', count: null })

  it('formularz pokazuje regułę, koniec i dni szczególne serii', () => {
    expect(draftOf(s, '2026-11-12')).toMatchObject({ kind: 'weekly', every: 2, days: [4], end: 'until', until: '2027-04-30', special: 'ask' })
    expect(draftOf(series({ kind: 'daily' }, { until: null, count: 3 }), '2026-11-12')).toMatchObject({ kind: 'daily', end: 'count', count: 3 })
    expect(draftOf(series({ kind: 'monthWeekday', nth: -1, weekday: 5 }), '2026-11-12')).toMatchObject({ kind: 'monthWeekday', nth: -1, weekday: 5, end: 'never' })
  })

  it('nic nie zmieniono – zmiana pusta', () => {
    const d = draftOf(s, '2026-11-12')
    expect(isEmptyPatch(draftPatch(d, d))).toBe(true)
  })

  it('wysyła tylko to, co się różni: regułę, dni szczególne, koniec', () => {
    const base = draftOf(s, '2026-11-12')
    expect(draftPatch(base, { ...base, every: 3 })).toEqual({ rule: { kind: 'weekly', every: 3, days: [4], anchor: '' } })
    expect(draftPatch(base, { ...base, special: 'held' })).toEqual({ special: 'held' })
    expect(draftPatch(base, { ...base, end: 'never' })).toEqual({ until: null, count: null })
    expect(draftPatch(base, { ...base, end: 'count', count: 10 })).toEqual({ until: null, count: 10 })
    expect(draftPatch(base, { ...base, until: '2027-06-30' })).toEqual({ until: '2027-06-30' })
  })

  it('seria z datą i licznikiem: zmiana licznika wysyła tylko licznik – data (np. koniec ustawiony przez aplikację) zostaje (T719)', () => {
    const both = series({ kind: 'daily' }, { until: '2027-01-31', count: 10 })
    const base = draftOf(both, '2026-11-12')
    expect(base.end).toBe('count')
    expect(isEmptyPatch(draftPatch(base, { ...base }))).toBe(true)
    expect(draftPatch(base, { ...base, count: 5 })).toEqual({ count: 5 })
    // Another kind of end: the one shown, the other cleared.
    expect(draftPatch(base, { ...base, end: 'until', until: '2027-02-28' })).toEqual({ until: '2027-02-28', count: null })
    expect(draftPatch(base, { ...base, end: 'never' })).toEqual({ until: null, count: null })
  })

  it('reguła niepełna nie jest zmianą', () => {
    const base = draftOf(s, '2026-11-12')
    expect(draftPatch(base, { ...base, days: [] })).toEqual({})
  })
})

describe('pola panelu bloku', () => {
  it('pytają o zakres tylko pola, które seria przechowuje', () => {
    expect(touchesSeries({ durationMin: 30 })).toBe(true)
    expect(touchesSeries({ startMin: 600 })).toBe(true)
    expect(touchesSeries({ categoryId: 'inne', variantId: null })).toBe(true)
    expect(touchesSeries({ note: 'x' })).toBe(true)
    expect(touchesSeries({ anchor: null })).toBe(false)
    expect(touchesSeries({ moves: 1, movedFrom: null })).toBe(false)
  })

  it('do serii idzie tylko to, co seria przechowuje', () => {
    expect(seriesBlockPatch({ durationMin: 30, anchor: null, moves: 1 })).toEqual({ durationMin: 30 })
    expect(seriesBlockPatch({ categoryId: 'nauka', variantId: null })).toEqual({ categoryId: 'nauka', variantId: null })
  })

  it('pole „Powtarzaj” mają bloki własne i szablonu (także z dawnym oznaczeniem drugiej zmiany, D467), nie sesja, wykład, zajęcia zjazdu ani prośby', () => {
    expect(blockMayRepeat(blockOf({ origin: 'user' }))).toBe(true)
    expect(blockMayRepeat(blockOf({ origin: 'template' }))).toBe(true)
    expect(blockMayRepeat(blockOf({ origin: 'series', sourceId: 's1' }))).toBe(true)
    for (const origin of ['session', 'lecture', 'zjazd'] as const) expect(blockMayRepeat(blockOf({ origin }))).toBe(false)
    expect(blockMayRepeat(planBlockFrom({ id: 'ds', categoryId: 'sesja', startMin: 1200, durationMin: 60, fixed: true, origin: 'template', tag: 'secondShift' })!)).toBe(true)
    expect(blockMayRepeat(blockOf({ requests: ['r1'] }))).toBe(false)
  })
})

describe('słowa pod panelem wystąpienia', () => {
  it('reguła z końcem, rok tylko gdy inny niż bieżący', () => {
    const s = series({ kind: 'weekly', every: 2, days: [4], anchor: '2026-11-12' }, { until: '2026-12-30', count: null })
    expect(occurrenceRuleText(s, '2026-11-19', '2026-11-12')).toBe('co 2 tygodnie w czwartek, do 30.12')
    expect(occurrenceRuleText(series({ kind: 'monthWeekday', nth: -1, weekday: 5 }), '2026-11-27', '2026-11-12')).toBe('w ostatni piątek miesiąca')
    expect(occurrenceRuleText(series({ kind: 'daily' }, { until: null, count: 10 }), '2026-11-12', '2026-11-12')).toBe('codziennie, 10 razy')
  })

  it('lista i historia pokazują blok serii z wersji z dziś, przed początkiem – z pierwszej', () => {
    const s = series({ kind: 'daily' }, undefined, '2026-12-01')
    expect(seriesBlockOf(s, '2026-11-12')).toMatchObject({ origin: 'series', sourceId: 's1', durationMin: 60 })
    expect(seriesBlockOf(s, '2026-12-05')).toMatchObject({ startMin: 17 * 60 })
  })

  it('znak przy nazwie to ↻', () => {
    expect(SERIES_MARK).toBe('↻')
  })
})
