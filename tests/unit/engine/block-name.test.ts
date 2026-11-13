/**
 * The name of a block (D430, uzupełnia D357) without the screens: what a tile says beside its hours (`blockKind` – the name
 * the block would have without its own), a template's block and a series' occurrence bringing their names to the day, a
 * change of the name on one day staying on that day, the columns of „Tydzień” (also a day gone by nobody used) and the bar
 * of the desktop naming the block by it. D431: a task's block (D384) in the columns, „Agenda” and the month is named by the
 * task's title as in „Dziś”; a block taken out of the plan after it began (D336) keeps its own name.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { blockKind, blockName, nameById, type NamingDay } from '@shared/blockName'
import { putBlock } from '@shared/data/dayEdits'
import { activityOf } from '@shared/engine/activity'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { newSeries, seriesBlockId } from '@shared/engine/series'
import { timerAction } from '@shared/engine/timer'
import { agendaOf, monthBlockOf } from '@shared/engine/calendarViews'
import { horizonDay } from '@shared/engine/week'
import { engineView } from '@shared/engineView'
import { dayFileFrom, planBlock, type DayFile, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom, type RequestRecord } from '@shared/model/requests'
import { seriesPlans, typeOfDays, type SeriesBlock } from '@shared/model/series'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { block, lm, Scenario } from './dsl'

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const named = (o: Partial<Parameters<typeof blockName>[0]> = {}) => ({ categoryId: 'analiza', variantId: null, routine: null, requests: [], note: '', ...o })

describe('co kafelek mówi przy godzinach (`blockKind`)', () => {
  it('blok z nazwą: nazwa, jaką miałby bez niej – kategoria, wariant; bez nazwy albo te same słowa – nic', () => {
    expect(blockKind(named({ name: 'Analiza rynku' }), names)).toBe('Analiza')
    expect(blockKind(named({ categoryId: 'nauka', variantId: 'sluchanie', name: 'Podcast' }), names)).toBe('Nauka — słuchanie')
    expect(blockKind(named(), names)).toBeNull()
    expect(blockKind(named({ name: null }), names)).toBeNull()
    expect(blockKind(named({ name: 'Analiza' }), names)).toBeNull()
  })
})

const template = (blocks: Template['versions'][number]['blocks']): Template => ({ id: 'zw', name: 'Zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2020-01-01', budgetMin: null, maxMin: null, blocks }] })
const tpl = template([planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 45, name: 'Analiza rynku', origin: 'template' })])
const angielski: SeriesBlock = { categoryId: 'nauka', variantId: null, startMin: lm('17:00'), durationMin: 45, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: [] }
const series = newSeries('ang', angielski, '2026-11-16', { kind: 'daily' }, 'held', { until: null, count: null })
const planOf = (date: string, file: DayFile | null = null) =>
  dayPlan(createDay({ date, changes: [], templates: [tpl], lectures: [], series: seriesPlans([series], typeOfDays([], () => null), marketDay), dayFile: file, holidays: marketDay, at: null }), file)

describe('nazwa z szablonu i serii trafia do dnia; zmiana w jednym dniu – tylko ten dzień', () => {
  const a = '2026-11-18'
  const b = '2026-11-19'
  const tplId = (d: string) => templateBlockId(d, 'zw', 'an')
  const occId = (d: string) => seriesBlockId(d, 'ang')

  it('dzień z szablonu i wystąpienie serii mają ich nazwy', () => {
    const plan = planOf(a)
    expect(plan.find((x) => x.id === tplId(a))!.name).toBe('Analiza rynku')
    expect(plan.find((x) => x.id === occId(a))!.name).toBe('Angielski')
  })

  it('nowa nazwa bloku szablonu i wystąpienia w pliku dnia – tylko ten dzień; inny dzień i szablon bez zmian', () => {
    const tplBlock = planOf(a).find((x) => x.id === tplId(a))!
    const occ = planOf(a).find((x) => x.id === occId(a))!
    const raw = putBlock(putBlock({ schema: 1, date: a }, { ...tplBlock, name: 'Analiza tygodnia' }), { ...occ, name: 'Angielski – egzamin' })
    const file = dayFileFrom(raw, a)
    const own = planOf(a, file)
    expect(own.find((x) => x.id === tplId(a))!.name).toBe('Analiza tygodnia')
    expect(own.find((x) => x.id === occId(a))!.name).toBe('Angielski – egzamin')
    const other = planOf(b)
    expect(other.find((x) => x.id === tplId(b))!.name).toBe('Analiza rynku')
    expect(other.find((x) => x.id === occId(b))!.name).toBe('Angielski')
    expect(tpl.versions[0]!.blocks[0]!.name).toBe('Analiza rynku')
  })

  it('nazwa wyczyszczona w jednym dniu: ten dzień nazywa blok jak dotąd (kategoria), szablon zostaje', () => {
    const tplBlock = planOf(a).find((x) => x.id === tplId(a))!
    const file = dayFileFrom(putBlock({ schema: 1, date: a }, { ...tplBlock, name: null }), a)
    const cleared = planOf(a, file).find((x) => x.id === tplId(a))!
    expect(cleared.name).toBeNull()
    expect(blockName(cleared, names)).toBe('Analiza')
    expect(planOf(b).find((x) => x.id === tplId(b))!.name).toBe('Analiza rynku')
  })
})

describe('kolumny „Tygodnia” niosą nazwę bloku', () => {
  const plan = [{ ...block({ id: 'n', cat: 'analiza', at: '09:00', min: 45, origin: 'user' }), name: 'Analiza rynku' }, block({ id: 'p', cat: 'analiza', at: '10:00', min: 45, origin: 'user' })]

  it('dzień przyszły i dzień miniony bez nikogo (bez zdarzeń) – nazwa w tym, co nazywa blok', () => {
    for (const when of ['future', 'past'] as const) {
      const s = new Scenario({ date: '2026-11-18', plan })
      const d = horizonDay(s.contextAt(s.at('08:00')), when)
      const by = Object.fromEntries(d.blocks.map((x) => [x.id, x]))
      expect([when, blockName(by.n!.named, names)]).toEqual([when, 'Analiza rynku'])
      expect([when, blockName(by.p!.named, names)]).toEqual([when, 'Analiza'])
    }
  })
})

describe('pasek pulpitu: sama nazwa', () => {
  it('blok z nazwą trwa – pasek pokazuje nazwę; „Start:” następnego też po nazwie', () => {
    const date = '2026-10-28'
    const s = new Scenario({ date, plan: [{ ...block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), name: 'Analiza rynku' }, block({ id: 'b', cat: 'analiza', at: '10:00', min: 60 })] }).observe('07:00', null)
    const view = (time: string) => {
      const t = s.at(time)
      const ctx = s.contextAt(t)
      const state = s.stateAt(t)
      return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => blockName(b, { ...names, settings: s.settings }), care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    }
    expect(view('07:50').buttons.start).toBe('Start: Analiza rynku')
    const t = s.at('08:00')
    const r = timerAction(s.contextAt(t), s.stateAt(t), { a: 'start', block: 'a' }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(view('08:30').block!.name).toBe('Analiza rynku')
  })
})

describe('blok zadania w kolumnach, „Agendzie” i miesiącu – tytuł zadania jak w „Dziś” (D384, D431)', () => {
  it('dzień przyszły i miniony bez zdarzeń: kolumna, wiersz „Agendy” i pasek miesiąca nazywają blok tytułem zadania', () => {
    const task = requestFrom(newTask('t1', 1, '2026-11-13', { title: 'Wdrożenie' }))! as RequestRecord
    const withTask = { ...names, requests: [task] }
    const plan = [{ ...block({ id: 'z', cat: 'inne', at: '09:00', min: 45, fixed: true, origin: 'user' }), task: 't1' }]
    for (const when of ['future', 'past'] as const) {
      const s = new Scenario({ date: '2026-11-18', plan })
      const d = horizonDay(s.contextAt(s.at('08:00')), when)
      const z = d.blocks.find((x) => x.id === 'z')!
      expect([when, blockName(z.named, withTask)]).toEqual([when, 'Wdrożenie'])
      expect([when, blockName(agendaOf([d], [])[0]!.blocks[0]!.named, withTask)]).toEqual([when, 'Wdrożenie'])
      expect([when, blockName({ ...monthBlockOf(z).named, note: '' }, withTask)]).toEqual([when, 'Wdrożenie'])
    }
  })
})

describe('blok wyjęty z planu po starcie zachowuje własną nazwę (D336, D431)', () => {
  const snapBlock = planBlock({ id: 'b', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, name: 'Analiza rynku', origin: 'template' })
  const day = (planned: { categoryId: string; variantId: string | null }): NamingDay => ({ plan: [], snapshotBlock: (id) => (id === 'b' ? snapBlock : null), planned: (id) => (id === 'b' ? planned : null) })

  it('ta sama kategoria co przy starcie – nazwa z migawki (oś „Dziś”, pasek pulpitu: `nameById` / `namedById`)', () => {
    expect(nameById('b', day({ categoryId: 'analiza', variantId: null }), names)).toBe('Analiza rynku')
  })

  it('inna kategoria przy starcie (inny blok o tym id) – jak dotąd, kategoria ze startu', () => {
    expect(nameById('b', day({ categoryId: 'inne', variantId: null }), names)).toBe('Inne obowiązki')
  })
})
