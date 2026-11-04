/**
 * D338 (1.0.4): a block of the session layer is „Sesja <nazwa>” („Sesja NY”) in the bar's lines, in the CSV and wherever
 * `blockName` names it; the second shift and a category block added by hand stay „Sesja tradingowa”.
 */
import { describe, expect, it } from 'vitest'
import { blockName } from '@shared/blockName'
import { csvOf } from '@shared/engine/csv'
import { activityOf } from '@shared/engine/activity'
import { engineView } from '@shared/engineView'
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
