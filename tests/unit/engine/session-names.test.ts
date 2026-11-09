/**
 * D338 (1.0.4): a block of the session layer is „Sesja <nazwa>” („Sesja NY”) in the bar's lines, in the CSV and wherever
 * `blockName` names it; the second shift and a category block added by hand stay „Sesja tradingowa”.
 */
import { describe, expect, it } from 'vitest'
import { blockName } from '@shared/blockName'
import { csvOf } from '@shared/engine/csv'
import { activityOf } from '@shared/engine/activity'
import { autoActions } from '@shared/engine/auto'
import { computeDay } from '@shared/engine/day'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import { parseEvent } from '@shared/model/events'
import { rdFrom } from '@shared/model/rd'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'

function scenario() {
  return new Scenario({
    date: DATE,
    plan: [
      block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }),
      block({ id: 'zm', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' }),
      block({ id: 'rec', cat: 'sesja', at: '17:00', min: 30, fixed: true, origin: 'user' })
    ]
  })
}

const names = (s: Scenario) => ({ rd: rdFrom({}), settings: s.settings, routines: [], requests: [] })

describe('nazwy sesji (D338)', () => {
  it('blockName: blok warstwy sesji to „Sesja <nazwa>”, druga zmiana i ręczny blok kategorii – nazwa kategorii', () => {
    const s = scenario()
    const n = names(s)
    const [ny, zm, rec] = s.contextAt(s.at('12:00')).plan
    expect(blockName(ny!, n)).toBe('Sesja NY')
    expect(blockName(zm!, n)).toBe('Sesja tradingowa')
    expect(blockName(rec!, n)).toBe('Sesja tradingowa')
    // A session no longer in the settings: the category's name, never an id.
    expect(blockName({ ...ny!, sourceId: 'zniknela' }, n)).toBe('Sesja tradingowa')
  })

  it('CSV: wiersz bloku sesji ma „Sesja NY”, kategoria zostaje „Sesja tradingowa”', () => {
    const s = scenario()
    const rows = csvOf([{ ctx: s.contextAt(s.at('12:00')), names: names(s) }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1)
    expect(rows.map((r) => r.split(';').slice(1, 3))).toEqual([
      ['Sesja NY', 'Sesja tradingowa'],
      ['Sesja tradingowa', 'Sesja tradingowa'],
      ['Sesja tradingowa', 'Sesja tradingowa']
    ])
  })

  it('pasek: linia „Zacznij” bloku sesji niesie „Sesja NY”', () => {
    const s = scenario()
    const t = s.at('15:35')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => blockName(b, names(s)), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(v.lines.find((l) => l.id === 'wait:ny')).toMatchObject({ text: 'Sesja NY 15:30' })
  })
})

/**
 * 1.0.9 (plan 4.11): a session begun and then taken out of the plan („Usuń”, D336) stays „Sesja NY” (D338) – its start
 * writes where the block came from, and a block only the log knows is named by that. A start written before 1.0.9 has
 * no such fields: the block is named by its category, as before.
 */
describe('usunięty zaczęty blok sesji (D336, D338)', () => {
  const PLAN = [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }), block({ id: 'x', cat: 'inne', at: '17:00', min: 60 })]

  /** „Zacznij” of both blocks and „Usuń” of each after a while (the timer's events); `old` – starts as 1.0.8 wrote them. */
  function removed(old = false) {
    const s = new Scenario({ date: DATE, plan: PLAN }).observe('07:00', null)
    const go = (time: string, act: TimerAction) => {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (!r.ok) throw new Error(r.why)
      s.write(r.events, t)
    }
    if (old) s.start('ny', '15:30')
    else go('15:30', { a: 'start', block: 'ny', confirm: true })
    go('15:45', { a: 'removeBegun', block: 'ny' })
    if (old) s.start('x', '17:00')
    else go('17:00', { a: 'start', block: 'x', confirm: true })
    go('17:15', { a: 'removeBegun', block: 'x' })
    // The window took both out of the plan.
    return { s, ctx: s.contextAt(s.at('18:00'), { plan: [] }) }
  }
  const csvNames = (r: ReturnType<typeof removed>) =>
    csvOf([{ ctx: r.ctx, names: names(r.s) }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1).map((row) => row.split(';').slice(1, 3))

  it('start bloku zapisuje, skąd blok pochodzi (warstwa sesji i jej sesja)', () => {
    const { s } = removed()
    const starts = s.events.filter((e) => e.k === 'block.start') as Array<{ block: string; planned: Record<string, unknown> }>
    expect(starts.find((e) => e.block === 'ny')!.planned).toMatchObject({ categoryId: 'sesja', origin: 'session', sourceId: 'ny' })
    expect(starts.find((e) => e.block === 'x')!.planned).toMatchObject({ categoryId: 'inne', origin: 'template', sourceId: null })
  })

  it('CSV: usunięta zaczęta sesja to dalej „Sesja NY” (poza planem); blok spoza warstwy sesji – bez zmian', () => {
    const r = removed()
    expect(csvNames(r)).toEqual([
      ['Sesja NY', 'Sesja tradingowa'],
      ['Inne obowiązki', 'Inne obowiązki']
    ])
    // Out of the plan: where its start says it came from names it only – for the engine it is a block outside the plan.
    const state = r.s.stateAt(r.s.at('18:00'), { plan: [] })
    expect(state.blocks.find((b) => b.id === 'ny')).toMatchObject({ inPlan: false, origin: 'user', sourceId: null, named: { origin: 'session', sourceId: 'ny' } })
  })

  it('silnik bez zmian: biegnąca sesja zdjęta z planu bez „Usuń” liczy się tak samo ze startem z polami pochodzenia i bez nich', () => {
    // Two logs that differ only by the fields of the start; the session's typical length (150 min) would lengthen its
    // forecast if the engine took it for a session of the layer.
    const counted = (withOrigin: boolean) => {
      const s = new Scenario({ date: DATE, plan: PLAN }).observe('07:00', null)
      const planned = { categoryId: 'sesja', variantId: null, durationMin: 60, tag: null, fixed: true, costs: null, bgCostPct: null, ...(withOrigin ? { origin: 'session', sourceId: 'ny' } : {}) }
      s.raw({ k: 'block.start', block: 'ny', at: s.at('15:30'), bg: false, planned, confirmUntil: null, how: 'click' }, '15:30')
      const st = s.stateAt(s.at('15:45'), { plan: PLAN.filter((b) => b.id !== 'ny'), typicalSessionMin: { ny: 150 } })
      // Its name aside (`named`), the block as the engine has it.
      return {
        ny: { ...st.blocks.find((b) => b.id === 'ny')!, named: undefined },
        forecast: st.forecast.map((p) => [p.block.id, p.from, p.to]),
        budget: st.budget,
        boundary: st.boundary,
        bedtime: st.bedtime,
        hardEnd: st.hardEnd,
        pool: st.pool,
        regen: st.regen
      }
    }
    const before = counted(false)
    expect(before.ny).toMatchObject({ inPlan: false, origin: 'user', sourceId: null })
    expect(counted(true)).toEqual(before)
  })

  it('pasek („zrobione automatycznie”): sesja skończona według planu i potem usunięta z planu to dalej „Sesja NY”', () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).observe('07:00', null)
    let t = s.at('15:30')
    const r = timerAction(s.contextAt(t), s.stateAt(t), { a: 'start', block: 'ny', confirm: true }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    // The leader ends it by its plan; then „Usuń” takes the block that is over out of the plan only.
    for (const time of ['16:30', '16:31', '16:45']) {
      t = s.at(time)
      const ctx = s.contextAt(t)
      const state = s.stateAt(t)
      s.write(autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }), t)
    }
    t = s.at('16:50')
    const ctx = s.contextAt(t, { plan: PLAN.filter((b) => b.id !== 'ny') })
    const state = computeDay(ctx)
    expect(state.facts.blocks.get('ny')).toMatchObject({ endRule: expect.any(String) })
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => blockName(b, names(s)), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    const texts = [...v.autos.groups.flatMap((g) => g.items), ...v.autos.items].map((i) => i.text)
    expect(texts.some((x) => x.startsWith('Sesja NY skończony'))).toBe(true)
  })

  it('stary log (start bez pól pochodzenia): nazwa kategorii jak dotąd, bez błędu', () => {
    const r = removed(true)
    expect(csvNames(r)).toEqual([
      ['Sesja tradingowa', 'Sesja tradingowa'],
      ['Inne obowiązki', 'Inne obowiązki']
    ])
    const ny = r.s.stateAt(r.s.at('18:00'), { plan: [] }).blocks.find((b) => b.id === 'ny')!
    expect(ny).toMatchObject({ inPlan: false, origin: 'user', sourceId: null })
    expect(ny.named).toBeUndefined()
  })

  it('pochodzenie z logu sprawdzone: nieznana wartość to blok bez pochodzenia', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    s.raw({ k: 'block.start', block: 'ny', at: s.at('15:30'), bg: false, planned: { categoryId: 'sesja', variantId: null, durationMin: 60, tag: null, fixed: true, origin: 'kosmos', sourceId: 7 }, confirmUntil: null, how: 'click' }, '15:30')
    const f = s.state('16:00').facts.blocks.get('ny')!
    expect(f.planned).toMatchObject({ categoryId: 'sesja' })
    expect(f.planned!.origin).toBeUndefined()
    expect(f.planned!.sourceId).toBeNull()
    const ny = s.state('16:00').blocks.find((b) => b.id === 'ny')!
    expect(ny).toMatchObject({ origin: 'user', sourceId: null })
    expect(ny.named).toBeUndefined()
  })

  it('zgodność: odczyt logu (ten sam w 1.0.8) przyjmuje start z nowymi polami i zostawia je w zdarzeniu', () => {
    const line = JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: 1, l: 1, v: 1, day: DATE, dom: 'timer', k: 'block.start', block: 'ny', at: 1, bg: false, planned: { categoryId: 'sesja', variantId: null, durationMin: 60, tag: null, fixed: true, origin: 'session', sourceId: 'ny', nextField: 1 }, confirmUntil: null, how: 'click', later: true })
    const r = parseEvent(line)
    expect(r.ok).toBe(true)
    expect(r.ok && r.event).toMatchObject({ k: 'block.start', planned: { origin: 'session', sourceId: 'ny', nextField: 1 }, later: true })
  })
})
