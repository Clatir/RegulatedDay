/**
 * D338 (1.0.4): a block of the session layer is „Sesja <nazwa>” („Sesja NY”) in the bar's lines, in the CSV and wherever
 * `blockName` names it; a category block of the template or added by hand stays „Sesja tradingowa”.
 */
import { describe, expect, it } from 'vitest'
import { blockName, nameById } from '@shared/blockName'
import { csvOf } from '@shared/engine/csv'
import { activityOf } from '@shared/engine/activity'
import { autoActions } from '@shared/engine/auto'
import { sessionBlock } from '@shared/engine/createDay'
import { namingOf } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import type { DayFacts } from '@shared/engine/facts'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import type { PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'

function scenario() {
  return new Scenario({
    date: DATE,
    plan: [
      block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }),
      block({ id: 'zm', cat: 'sesja', at: '20:00', min: 60, fixed: true }),
      block({ id: 'rec', cat: 'sesja', at: '17:00', min: 30, fixed: true, origin: 'user' })
    ]
  })
}

const names = (s: Scenario) => ({ rd: rdFrom({}), settings: s.settings, routines: [], requests: [] })

describe('nazwy sesji (D338)', () => {
  it('blockName: blok warstwy sesji to „Sesja <nazwa>”, wieczorna sesja szablonu i ręczny blok kategorii – nazwa kategorii', () => {
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
 * 1.0.9 (plan 4.11): a block begun and then taken out of the plan („Usuń”, D336) keeps its name everywhere (D338, spec
 * „W interfejsie tylko prawdziwe nazwy”). A block of the snapshot – a session too – is only cancelled for the day, so its
 * entry stays in the snapshot: its variant, routine, „Sesja NY”. The log stays as 1.0.8 writes it (a start of 1.0.8 is
 * named the same – also with two computers of different versions).
 */
describe('nazwa bloku zdjętego z planu po starcie (D336, D338)', () => {
  const ROUTINES = [{ id: 'wieczor', name: 'Wieczorna rutyna', normal: [], worse: [], archived: false }]
  const PLAN: PlanBlock[] = [
    block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, origin: 'session', source: 'ny' }),
    { ...block({ id: 'r', cat: 'rutyny', at: '17:00', min: 30 }), routine: 'wieczor' },
    block({ id: 'v', cat: 'regeneracja', variant: 'spacer', at: '18:00', min: 30 })
  ]
  const n = (s: Scenario) => ({ ...names(s), routines: ROUTINES })

  /** The timer's clicks on a day whose snapshot has `snapshotBlocks`; `after` – the day with all of the plan taken out. */
  function day(plan: PlanBlock[], snapshotBlocks: PlanBlock[] = plan) {
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const extra = { snapshot: { ...s.snapshot, blocks: snapshotBlocks } }
    const go = (time: string, act: TimerAction) => {
      const t = s.at(time)
      const r = timerAction(s.contextAt(t, extra), s.stateAt(t, extra), act, t)
      if (!r.ok) throw new Error(`${time}: ${r.why}`)
      s.write(r.events, t)
    }
    return { s, go, after: (time: string) => s.contextAt(s.at(time), { ...extra, plan: [] }) }
  }

  /** Each block of the plan begun and removed, and two blocks begun outside it („Pracuję”, a break with its variant). */
  function removedAll() {
    const d = day(PLAN)
    d.go('15:30', { a: 'start', block: 'ny', confirm: true })
    d.go('15:45', { a: 'removeBegun', block: 'ny' })
    d.go('17:00', { a: 'start', block: 'r', confirm: true })
    d.go('17:10', { a: 'removeBegun', block: 'r' })
    d.go('18:00', { a: 'start', block: 'v', confirm: true })
    d.go('18:10', { a: 'removeBegun', block: 'v' })
    d.go('19:00', { a: 'startNew', block: 'praca', categoryId: 'inne', durationMin: 30, confirm: true })
    d.go('19:20', { a: 'finish', block: 'praca' })
    d.go('20:00', { a: 'startNew', block: 'brk', categoryId: 'regeneracja', variantId: 'przerwa-od-ekranu', durationMin: 15, confirm: true })
    d.go('20:10', { a: 'finish', block: 'brk' })
    return { ...d, ctx: d.after('21:00') }
  }
  const csvNames = (s: Scenario, ctx: ReturnType<Scenario['contextAt']>) =>
    csvOf([{ ctx, names: n(s) }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1).map((row) => row.split(';')[1])

  it('log jak w 1.0.8: start nie ma nowych pól', () => {
    const { s } = removedAll()
    for (const e of s.events.filter((x) => x.k === 'block.start') as unknown as Array<{ planned: Record<string, unknown> }>) expect(Object.keys(e.planned)).not.toContain('origin')
  })

  it('CSV: usunięta zaczęta sesja „Sesja NY”, rutyna – nazwa rutyny, blok z wariantem – wariant; zaczęte poza planem bez zmian', () => {
    const { s, ctx } = removedAll()
    expect(csvNames(s, ctx)).toEqual(['Sesja NY', 'Wieczorna rutyna', 'Samotny spacer', 'Inne obowiązki', 'Przerwa od ekranu'])
  })

  it('rytuał (nameById): te same nazwy; blok bez startu, nieznany albo bez kategorii w starcie – „blok”', () => {
    const { s, ctx } = removedAll()
    const facts = computeDay(ctx).facts
    expect(['ny', 'r', 'v', 'praca', 'brk', 'nie-ma'].map((id) => nameById(id, namingOf(ctx, facts), n(s)))).toEqual(['Sesja NY', 'Wieczorna rutyna', 'Samotny spacer', 'Inne obowiązki', 'Przerwa od ekranu', 'blok'])
    const broken = { blocks: new Map([['q', { planned: { variantId: null } }]]) } as unknown as Pick<DayFacts, 'blocks'>
    expect(nameById('q', namingOf(ctx, broken), n(s))).toBe('blok')
  })

  it('sesja dodana odpowiedzią „tak” (poza migawką dnia), zaczęta i usunięta: „Sesja NY”', () => {
    const def = new Scenario({ date: DATE, plan: [] }).settings.sessions.find((x) => x.id === 'ny')!
    const added = sessionBlock(def, DATE, [])!
    const d = day([added], [])
    d.go('15:30', { a: 'start', block: added.id, confirm: true })
    d.go('15:45', { a: 'removeBegun', block: added.id })
    expect(csvNames(d.s, d.after('16:00'))).toEqual(['Sesja NY'])
  })

  it('blok zmieniony na ten dzień (kopia w pliku dnia), zaczęty i usunięty: kategoria i wariant z chwili startu', () => {
    // The snapshot's „spacer” is „przerwa od ekranu” today; the routine's block became „Inne obowiązki”; the session as it was.
    const today: PlanBlock[] = [PLAN[0]!, { ...PLAN[1]!, categoryId: 'inne', routine: null }, { ...PLAN[2]!, variantId: 'przerwa-od-ekranu' }]
    const d = day(today, PLAN)
    d.go('15:30', { a: 'start', block: 'ny', confirm: true })
    d.go('15:45', { a: 'removeBegun', block: 'ny' })
    d.go('17:00', { a: 'start', block: 'r', confirm: true })
    d.go('17:10', { a: 'removeBegun', block: 'r' })
    d.go('18:00', { a: 'start', block: 'v', confirm: true })
    d.go('18:10', { a: 'removeBegun', block: 'v' })
    const ctx = d.after('19:00')
    const rows = csvOf([{ ctx, names: n(d.s) }])['bloki.csv'].slice(1).trim().split('\r\n').slice(1).map((row) => row.split(';').slice(1, 3))
    // The name agrees with the category column (the block as its start wrote it).
    expect(rows).toEqual([
      ['Sesja NY', 'Sesja tradingowa'],
      ['Inne obowiązki', 'Inne obowiązki'],
      ['Przerwa od ekranu', 'Regeneracja']
    ])
    const facts = computeDay(ctx).facts
    expect(['ny', 'r', 'v'].map((id) => nameById(id, namingOf(ctx, facts), n(d.s)))).toEqual(['Sesja NY', 'Inne obowiązki', 'Przerwa od ekranu'])
  })

  it('pasek („zrobione automatycznie”): sesja skończona według planu i potem usunięta z planu to dalej „Sesja NY”', () => {
    const d = day(PLAN)
    d.go('15:30', { a: 'start', block: 'ny', confirm: true })
    // The leader ends it by its plan; then „Usuń” takes the block that is over out of the plan only (cancelled).
    for (const time of ['16:30', '16:31', '16:45']) {
      const t = d.s.at(time)
      const ctx = d.s.contextAt(t)
      const state = d.s.stateAt(t)
      d.s.write(autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }), t)
    }
    const t = d.s.at('16:50')
    const ctx = d.s.contextAt(t, { plan: PLAN.filter((b) => b.id !== 'ny') })
    const state = computeDay(ctx)
    expect(state.facts.blocks.get('ny')).toMatchObject({ endRule: expect.any(String) })
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => blockName(b, n(d.s)), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    const texts = [...v.autos.groups.flatMap((g) => g.items), ...v.autos.items].map((i) => i.text)
    expect(texts.some((x) => x.startsWith('Sesja NY skończony'))).toBe(true)
  })
})
