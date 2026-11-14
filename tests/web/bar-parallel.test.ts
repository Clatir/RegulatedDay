/**
 * The bar with parallel blocks (D494): the block in front with its time and „+K w tle” for the blocks of its group behind;
 * a background block of no group is not counted. The list itself unfolds on a click (state – not in a static render).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { engineView } from '@shared/engineView'
import { Bar } from '@renderer/widget/Bar'
import { noFolderView, type WidgetView } from '@shared/widget'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'

function dayView(over: Partial<WidgetView> = {}): WidgetView {
  return { ...noFolderView(), day: DATE, lines: [], requests: { people: [], running: null, interrupted: null }, ...over }
}
const html = (view: WidgetView) => renderToStaticMarkup(createElement(Bar, { view, mode: 'panel' }))
const front = { name: 'Analiza', className: 'praca', endsAt: Date.parse('2026-10-28T09:00:00Z') }

describe('pasek przy blokach równoległych (D494)', () => {
  it('„+K w tle” liczy tylko bloki grupy w tle', () => {
    const at = Date.parse('2026-10-28T10:00:00Z')
    const out = html(
      dayView({
        block: front,
        background: [
          { id: 'b', name: 'Nauka', endsAt: at, group: true },
          { id: 'c', name: 'Muzyka', endsAt: at, group: true },
          { id: 's', name: 'Sesja NY', endsAt: at }
        ]
      })
    )
    expect(out).toContain('data-testid="bar-parallel"')
    expect(out).toContain('+2 w tle')
  })

  it('bez bloków grupy w tle – bez dopisku', () => {
    const out = html(dayView({ block: front, background: [{ id: 's', name: 'Sesja NY', endsAt: Date.parse('2026-10-28T10:00:00Z') }] }))
    expect(out).not.toContain('data-testid="bar-parallel"')
  })

  it('widok silnika oznacza bloki grupy w tle (`group`), blok w tle spoza grupy – nie', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'b', cat: 'nauka', at: '08:00', min: 60 }), block({ id: 'x', cat: 'inne', at: '08:00', min: 60, bg: true })] }).observe('07:00', null)
    const t0 = s.at('08:00')
    const planned = (cat: string) => ({ categoryId: cat, variantId: null, durationMin: 60, fixed: false, costs: null, bgCostPct: null })
    s.write(
      [
        { k: 'block.start', block: 'a', at: t0, bg: false, planned: planned('analiza'), confirmUntil: null, how: 'click', group: 'a' },
        { k: 'block.start', block: 'b', at: t0, bg: true, planned: planned('nauka'), confirmUntil: null, how: 'click', group: 'a' },
        { k: 'block.start', block: 'x', at: t0, bg: true, planned: planned('inne'), confirmUntil: null, how: 'click' }
      ],
      t0
    )
    const t = s.at('08:10')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const care = { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Blok', care, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(v.background.map((b) => [b.id, b.group ?? false]).sort()).toEqual([
      ['b', true],
      ['x', false]
    ])
  })
})
