/**
 * D467: no marks of a block any more – no second shift, no weekly analysis, no „czeka do”. A block with an old mark in a
 * file is an ordinary block of its category: it waits for „Zacznij” only when its category does (a fixed session), and
 * counts for work, the boundary and extensions as every block of that category. The old fields stay in the file unread
 * (an older version on the other computer still sees them).
 */
import { describe, expect, it } from 'vitest'
import { putBlock } from '@shared/data/dayEdits'
import { RULES_VERSION } from '@shared/model/events'
import { templateFrom, planBlockFrom, type PlanBlock } from '@shared/model/plan'
import { defaultTemplates, templateJson } from '@shared/model/defaults'
import { Scenario, block, hhmm, lm } from './dsl'

const DATE = '2026-10-21'

/** A block as an older version wrote it: with its mark (and the weekly analysis's „czeka do”). */
const old = (raw: Record<string, unknown>): PlanBlock => {
  const b = planBlockFrom({ origin: 'template', ...raw })
  if (!b) throw new Error('unreadable block')
  return b
}
const evening = () => old({ id: 'ds', categoryId: 'sesja', startMin: lm('20:00'), durationMin: 60, fixed: true, tag: 'secondShift' })

describe('D467 – plik ze starym oznaczeniem', () => {
  it('blok z „tag” i „waitUntilMin” czyta się bez błędu, a model tych pól nie ma', () => {
    const b = old({ id: 'wa', categoryId: 'analiza', startMin: lm('09:00'), durationMin: 60, tag: 'weeklyAnalysis', waitUntilMin: lm('15:00') })
    expect(b).toMatchObject({ id: 'wa', categoryId: 'analiza', startMin: lm('09:00'), durationMin: 60, fixed: false })
    expect('tag' in b).toBe(false)
    expect('waitUntilMin' in b).toBe(false)
  })

  it('zmiana bloku i zapis szablonu zostawiają stare pola w pliku, tak jak je zapisała starsza wersja', () => {
    const raw = { schema: 1, date: DATE, blocks: [{ id: 'ds', categoryId: 'sesja', startMin: lm('20:00'), durationMin: 60, fixed: true, origin: 'user', tag: 'secondShift' }] }
    const b = planBlockFrom(raw.blocks[0])!
    const next = putBlock(raw, { ...b, durationMin: 90 })
    expect((next.blocks as Array<Record<string, unknown>>)[0]).toMatchObject({ durationMin: 90, tag: 'secondShift' })
    const before = { schema: 1, id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: { '2020-01-01': { blocks: [{ id: 'wa', categoryId: 'analiza', startMin: lm('09:00'), durationMin: 60, origin: 'template', tag: 'weeklyAnalysis', waitUntilMin: lm('15:00') }] } } }
    const t = templateFrom(before)!
    const written = templateJson(t, before) as { versions: Record<string, { blocks: Array<Record<string, unknown>> }> }
    expect(written.versions['2020-01-01']!.blocks[0]).toMatchObject({ tag: 'weeklyAnalysis', waitUntilMin: lm('15:00') })
  })

  it('domyślne szablony nie mają już drugiej zmiany ani oznaczeń', () => {
    const [ordinary, saturday] = defaultTemplates()
    expect(ordinary!.versions[0]!.blocks).toEqual([])
    expect(saturday!.versions[0]!.blocks.map((b) => [b.categoryId, b.startMin, b.durationMin, b.fixed])).toEqual([['analiza', lm('09:00'), 60, false]])
    for (const t of [ordinary!, saturday!]) for (const b of t.versions[0]!.blocks) expect('tag' in b).toBe(false)
  })
})

describe('D467 – blok z dawnym oznaczeniem to zwykły blok swojej kategorii', () => {
  it('czeka na „Zacznij” tylko, gdy wymaga tego kategoria (stała sesja), nie przez oznaczenie', () => {
    const plan = [
      evening(),
      old({ id: 'wa', categoryId: 'analiza', startMin: lm('09:00'), durationMin: 60, tag: 'weeklyAnalysis', waitUntilMin: lm('15:00') }),
      old({ id: 'fx', categoryId: 'inne', startMin: lm('21:00'), durationMin: 30, tag: 'secondShift' })
    ]
    const st = new Scenario({ date: DATE, plan }).state('07:00')
    const waits = Object.fromEntries(st.blocks.map((b) => [b.id, b.waits]))
    expect(waits).toEqual({ ds: true, wa: false, fx: false })
  })

  it('wieczorna sesja 20:00–21:00 liczy się do granicy: propozycja z jej końca, nie więcej niż maksimum', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 }), evening()], settings: { transitionBufferMin: 0 } })
    const st = s.state('07:00')
    // 21:00 + 15 min is past the maximum of the ordinary day (19:00): the proposal stops at it.
    expect(hhmm(st, st.boundary.proposal)).toBe('19:00')
  })

  it('po zatwierdzonej granicy wieczorna sesja jest pracą: przedłużenie, po maksimum przekroczenie, koniec pracy po niej', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 }), evening()], settings: { transitionBufferMin: 0 } })
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').workEnd('10:00').ran('ds', '20:00', '21:00')
    const st = s.state('21:30')
    expect(st.budgetUsedMin).toBe(180)
    expect(st.extensionMin).toBe(60)
    // All its minutes are past the maximum (19:00).
    expect(st.overrunMin).toBe(60)
    expect(hhmm(st, st.workEnd)).toBe('21:00')
  })

  it('oznaczenie „po pracy” (D209) liczy się od każdej innej pracy – także od wieczornego bloku z dawnym oznaczeniem', () => {
    const plan = [block({ id: 'i', cat: 'inne', at: '09:00', min: 420 }), block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 })]
    const marked = new Scenario({ date: DATE, plan }).state('08:00')
    expect(marked.blocks.filter((b) => b.afterWorkMark).map((b) => b.id)).toEqual(['n'])
    const st = new Scenario({ date: DATE, plan: [...plan, old({ id: 'ds', categoryId: 'inne', startMin: lm('20:00'), durationMin: 60, tag: 'secondShift' })] }).state('08:00')
    expect(st.blocks.filter((b) => b.afterWorkMark)).toEqual([])
    expect(hhmm(st, st.boundary.proposal)).toBe('19:00')
  })

  it('wieczorny blok pracy po „Koniec pracy” otwiera pracę ponownie, jak każdy blok tej kategorii', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), old({ id: 'e', categoryId: 'inne', startMin: lm('18:00'), durationMin: 30, tag: 'secondShift' })], settings: { transitionBufferMin: 0 } })
    s.approve('09:15', '07:00').ran('a', '08:00', '09:00').workEnd('09:00').ran('e', '18:00', '18:30', { confirmUntil: '18:30' })
    const st = s.state('19:00')
    expect(st.extensionMin).toBe(30)
    expect(st.overrunMin).toBe(0)
    expect(hhmm(st, st.workEnd)).toBe('18:30')
  })

  it('wersja reguł rośnie: starsza wersja nie zamraża dni według drugiej zmiany (prowadzi nowsza)', () => {
    expect(RULES_VERSION).toBe(9)
  })
})
