/**
 * The body as a full pool (D520–D522): its check-in (two questions, a check-in without them – 100, T1522), its costs, „Więcej bujania”
 * never takes from it, the relative assessment works for it, an anchor of an older version without it (T1523), its descent with the
 * reserve's colour and message proposing the way cheapest in it, a start and a change of cost written before it (T1520), the costlier
 * block in front by the four pools (T1526), the curve, the statistics and the CSV (T1525), the calibration's evidence.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { costEvidence } from '@shared/engine/calibration'
import { csvOf, CSV_HEADERS } from '@shared/engine/csv'
import { energyTrack } from '@shared/engine/energyTrack'
import { suggestRegen } from '@shared/engine/reserve'
import { dayStats } from '@shared/engine/stats'
import { lastEventsOf } from '@shared/engine/freeze'
import { engineView, POOL_TEXT } from '@shared/engineView'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import type { AnyEvent } from '@shared/model/events'
import { settingsOn, type RulesSettings, type SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { dayEnd } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const none = (): { head: [0, 0]; emotions: [0, 0]; senses: [0, 0] } => ({ head: [0, 0], emotions: [0, 0], senses: [0, 0] })

const sc = (plan = [block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })], settings: Record<string, unknown> = {}) =>
  new Scenario({ date: DATE, plan, settings: { transitionBufferMin: 0, ...settings } })

describe('ciało – check-in (D521)', () => {
  it('dwa pytania o ciało ustawiają pulę jak w innych: suma 0–4 → 100 / 85 / 65 / 45 / 25', () => {
    for (const [answers, body] of [
      [[0, 0], 100],
      [[1, 0], 85],
      [[1, 1], 65],
      [[2, 1], 45],
      [[2, 2], 25]
    ] as const) {
      const s = sc().checkin('08:00', { ...none(), body: [answers[0], answers[1]] })
      expect(s.energy('08:00').now!.body).toBe(body)
    }
  })

  it('check-in bez odpowiedzi o ciało (starsza wersja) – ciało 100, reszta jak w odpowiedziach', () => {
    const s = sc().checkin('08:00', { head: [1, 1], emotions: [0, 0], senses: [2, 2] })
    expect(s.energy('08:00').now).toEqual({ head: 65, emotions: 100, senses: 25, body: 100 })
  })
})

describe('ciało – koszty, sygnały i kotwice', () => {
  it('blok kosztuje ciało jak inne pule: „Inne obowiązki” (1 / godz.) przez 2 h → −6', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).ran('a', '09:00', '11:00')
    expect(s.energy('11:00').now!.body).toBe(59)
  })

  it('„Więcej bujania” zabiera −5 głowie, emocjom i bodźcom, nigdy ciału (D522)', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).signal('rocking', '08:30')
    expect(s.energy('08:30').now).toEqual({ head: 95, emotions: 95, senses: 95, body: 65 })
  })

  it('ocena względna działa dla ciała: gorzej −10, lepiej +10', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).relative('body', -10, '08:30')
    expect(s.energy('08:30').now!.body).toBe(55)
    s.relative('body', 10, '08:40')
    expect(s.energy('08:40').now!.body).toBe(65)
    expect(s.energy('08:40').now!.head).toBe(100)
  })

  it('kotwica starszej wersji bez ciała w `before`: ciało idzie dalej z własnego stanu (T1523)', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).ran('a', '09:00', '10:00')
    s.signal('glasses', '10:00', { head: 50, emotions: 50, senses: 50 })
    expect(s.energy('10:00').now).toEqual({ head: 50, emotions: 50, senses: 40, body: 62 })
  })
})

describe('ciało – rezerwa (D520)', () => {
  // A block of your own cost 0 / 0 / 0 / 5: the body −15 an hour, the other pools stay.
  const heavy = () => [planBlock({ id: 'a', categoryId: 'inne', startMin: 540, durationMin: 120, costs: { head: 0, emotions: 0, senses: 0, body: 5 } })]

  it('zejście ciała do rezerwy: kolor paska, zejście z komunikatem, propozycja – sposób o najniższym koszcie ciała (leżenie, drzemka)', () => {
    const s = sc(heavy()).checkin('08:00', { ...none(), body: [2, 2] }).start('a', '09:00')
    const e = s.energy('09:40')
    expect(e.now!.body).toBe(15)
    expect(e.atReserve).toEqual({ head: false, emotions: false, senses: false, body: true })
    expect(e.descents.map((d) => [d.pool, d.message])).toEqual([['body', true]])
    expect(suggestRegen(s.settings, 'body')).toBe('drzemka')
    const t = s.at('09:40')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const view = engineView({ ctx, state, energy: e, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Inne obowiązki', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(view.lines.find((l) => l.id.startsWith(`reserve:${DATE}:body:`))?.text).toBe('Ciało na rezerwie – może 15 min regeneracji (Leżenie, drzemka)?')
    expect(POOL_TEXT.body).toBe('Ciało')
  })

  it('prognoza ostrzega o rezerwie ciała', () => {
    const s = sc(heavy()).checkin('08:00', { ...none(), body: [2, 2] })
    const e = s.energy('08:30')
    expect(e.forecast!.reserveAt.body).not.toBeNull()
    expect(e.warnings).toContain('prognoza energii na poziomie rezerwy')
  })
})

describe('ciało – zdarzenia zapisane przed ciałem (T1520)', () => {
  it('start bloku z kosztem własnym bez ciała: ciało startowe jego podkategorii i wariantu (drzemka −3)', () => {
    const s = sc([block({ id: 'n', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 })]).checkin('08:00', { ...none(), body: [2, 2] })
    s.raw({ k: 'block.start', block: 'n', at: s.at('09:00'), bg: false, planned: { categoryId: 'regeneracja', variantId: 'drzemka', durationMin: 60, fixed: false, costs: { head: 0, emotions: 0, senses: 0 } }, confirmUntil: null, how: 'click', v: 15 }, '09:00')
    s.raw({ k: 'block.end', block: 'n', at: s.at('10:00'), done: true, rule: null }, '10:00')
    // 25 + 3·3 = 34; the other pools as their own cost 0.
    expect(s.energy('10:00').now).toEqual({ head: 100, emotions: 100, senses: 100, body: 34 })
  })

  it('zmiana kosztu zaczętego bloku bez ciała (`block.cost` starszej wersji): ciało startowe podkategorii bloku', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).start('a', '09:00')
    s.raw({ k: 'block.cost', block: 'a', at: s.at('09:00'), costs: { head: 0, emotions: 0, senses: 0 }, v: 15 }, '09:00')
    // „Inne obowiązki”: the body 1 an hour – −3 in 60 min.
    expect(s.energy('10:00').now).toEqual({ head: 100, emotions: 100, senses: 100, body: 62 })
  })
})

describe('ciało – koszt rutyny zapisany przed ciałem (T1520)', () => {
  it('start z kosztem rutyny bez ciała i `routine.cost` starszej wersji: ciało startowych „Rutyn” (1)', () => {
    const s = sc([{ ...block({ id: 'm', cat: 'rutyny', at: '09:00', min: 120 }), routine: 'poranna' }]).checkin('08:00', { ...none(), body: [1, 1] })
    const zero = { head: 0, emotions: 0, senses: 0 }
    s.raw({ k: 'block.start', block: 'm', at: s.at('09:00'), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 120, fixed: false, costs: null, routine: 'poranna', routineCosts: zero }, confirmUntil: null, how: 'click', v: 15 }, '09:00')
    expect(s.state('09:30').facts.blocks.get('m')!.planned!.routineCosts).toEqual({ ...zero, body: 1 })
    s.raw({ k: 'routine.cost', routine: 'poranna', at: s.at('10:00'), costs: zero, was: zero, v: 15 }, '10:00')
    s.raw({ k: 'block.end', block: 'm', at: s.at('11:00'), done: true, rule: null }, '11:00')
    // 2 h at the body's 1 an hour (from the start, then from the change): −6; the other pools as the routine's 0.
    expect(s.energy('11:00').now).toEqual({ head: 100, emotions: 100, senses: 100, body: 59 })
  })
})

describe('ciało – pierwszy plan (T1526)', () => {
  it('z dwóch elastycznych na pierwszym planie liczy się droższy według sumy czterech pul', () => {
    const plan = [planBlock({ id: 'x', categoryId: 'inne', startMin: 540, durationMin: 60, costs: { head: 1, emotions: 1, senses: 1, body: 0 } }), planBlock({ id: 'y', categoryId: 'inne', startMin: 540, durationMin: 60, costs: { head: 0, emotions: 0, senses: 0, body: 4 } })]
    const s = sc(plan).checkin('08:00', { ...none(), body: [0, 0] }).start('x', '09:00').start('y', '09:00')
    // y (sum 4) in front, x pauses: the body −12 an hour, the head stays.
    expect(s.energy('10:00').now).toEqual({ head: 100, emotions: 100, senses: 100, body: 88 })
  })
})

describe('ciało – krzywa, statystyki, CSV, kalibracja', () => {
  it('krzywa przy osi ma próbki ciała', () => {
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).ran('a', '09:00', '11:00')
    const st = s.state('11:00')
    const track = energyTrack(DATE, st.grid, s.energy('11:00'))!
    expect(track.samples.find((x) => x.body === 59)).toBeDefined()
    expect(track.samples[0]).toHaveProperty('body')
  })

  it('statystyki: energia check-inu to średnia zadanych pul – cztery; check-in bez ciała – trzy (T1522)', () => {
    const end = dayEnd(DATE)
    const stats = (s: Scenario) => dayStats({ ...s.contextAt(end), now: end }, lastEventsOf(s.events), { energy: true, projects: true, requests: true })
    expect(stats(sc().presence('07:30').checkin('08:00', { head: [0, 0], emotions: [0, 0], senses: [2, 2], body: [2, 2] })).checkins).toEqual([{ minute: 480, energy: 62.5 }])
    expect(stats(sc().presence('07:30').checkin('08:00', { head: [0, 0], emotions: [0, 0], senses: [2, 2] })).checkins).toEqual([{ minute: 480, energy: 75 }])
  })

  it('CSV: kolumna „Ciało” na końcu checkiny.csv, odpowiedzi o ciało jako czwarte; check-in bez ciała – pusta komórka (T1525)', () => {
    expect(CSV_HEADERS['checkiny.csv']).toEqual(['Data', 'Godzina', 'Głowa', 'Emocje', 'Bodźce', 'Odpowiedzi', 'Ciało'])
    const s = sc().checkin('07:30', { head: [1, 0], emotions: [0, 0], senses: [2, 1], body: [1, 1] }).checkin('12:00', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const rows = csvOf([{ ctx: s.contextAt(s.at('20:00')), names }])['checkiny.csv'].slice(1).trim().split('\r\n').slice(1)
    expect(rows).toEqual(['28.10.2026;07:30;85;100;45;trochę/nie, nie/nie, tak/trochę, trochę/trochę;65', '28.10.2026;12:00;100;100;100;nie/nie, nie/nie, nie/nie;'])
  })

  it('kalibracja: ocena względna ciała to dowód kosztu ciała kategorii przed nią', () => {
    const at = dayEnd(DATE)
    const s = sc().checkin('08:00', { ...none(), body: [1, 1] }).ran('a', '09:00', '11:00').relative('body', -10, '11:00')
    const e = costEvidence({ ...s.contextAt(at), now: at, asWritten: true }, s.stateAt(at, { asWritten: true }), true)!
    expect(e.residual.inne).toEqual({ head: 0, emotions: 0, senses: 0, body: -10 })
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

describe('ciało – dzień zrobiony przez starszą wersję (T1532)', () => {
  // Your settings (1.27): „Analiza” costs the body 2 an hour; the computer of 1.26 makes the day and writes them without it.
  const DAY = '2026-11-18'
  const changes: SettingsChange[] = [{ id: 'u', from: '2026-01-01', at: null, made: 1, patch: { categories: { analiza: { costs: { body: 2 } } } } }]
  const mine = settingsOn(changes, DAY)
  const at = (hm: number) => placeLogical(DAY, hm)
  const base = (n: number, t: number, e: Record<string, unknown>) => ({ id: `pcb-${n}`, c: 'pcb', n, t, l: t, v: 15, day: DAY, ...e }) as unknown as AnyEvent
  const params = mine.dayTypes.zwykly
  const snapshot = { dayType: 'zwykly', settings: withoutBodies(mine), templateId: null, templateFrom: null, budgetMin: params.budgetMin, maxMin: params.maxMin, wakeMin: params.wakeMin, templateWakeMin: params.wakeMin, blocks: [planBlock({ id: 'a', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60 })], changes: [], holidays: [] }
  const events = [
    base(0, at(4 * 60), { dom: 'timer', k: 'day.create', snapshot }),
    base(1, at(8 * 60), { dom: 'energy', k: 'energy.checkin', at: at(8 * 60), answers: { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [1, 1] } }),
    base(2, at(9 * 60), { dom: 'timer', k: 'block.start', block: 'a', at: at(9 * 60), bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 60, fixed: false, costs: null }, confirmUntil: null, how: 'click' }),
    base(3, at(10 * 60), { dom: 'timer', k: 'block.end', block: 'a', at: at(10 * 60), done: true, rule: null })
  ]
  const ctxAt = (evs: AnyEvent[], t: number, ch = changes) => dayContextOf({ changes: ch, templates: [], lectures: [], series: [], routines: [] }, { date: DAY, events: evs, dayFile: null, nextFile: null }, marketDay, t)

  it('migawka z logu bierze ciało z Twoich ustawień tej daty: „Analiza” 1 h → ciało −6', () => {
    const ctx = ctxAt(events, at(10 * 60 + 30))
    expect(ctx.snapshot.settings.categories.analiza!.costs).toEqual({ head: 3, emotions: 1, senses: 1, body: 2 })
    expect(computeEnergy(ctx, computeDay(ctx)).now!.body).toBe(59)
  })

  it('zmiana ustawień „od dziś” zapisana przez starszą wersję (`day.snapshot`): ciało z Twoich ustawień w jej chwili', () => {
    // 1.26 changes the reserve „od dziś” at 08:30; 1.27 had set the body of „Analiza” to 4 from 08:15 today.
    const today: SettingsChange = { id: 'v', from: DAY, at: at(8 * 60 + 15), made: 2, patch: { categories: { analiza: { costs: { body: 4 } } } } }
    const legacyToday = { ...withoutBodies(settingsOn([...changes, today], DAY, at(8 * 60 + 30))), reserve: 10 }
    const evs = [...events, base(4, at(8 * 60 + 30), { dom: 'timer', k: 'day.snapshot', at: at(8 * 60 + 30), dayType: 'zwykly', settings: legacyToday, reason: 'today' })]
    const ctx = ctxAt(evs, at(10 * 60 + 30), [...changes, today])
    const day = computeDay(ctx)
    expect(day.facts.snapshots.map((x) => [x.settings.reserve, x.settings.categories.analiza!.costs.body])).toEqual([[10, 4]])
    expect(computeEnergy(ctx, day).now!.body).toBe(65 - 12)
    // A context without your changes (built by hand): the body of the day's snapshot.
    const { changes: _c, ...bare } = ctx
    expect(computeDay(bare).facts.snapshots[0]!.settings.categories.analiza!.costs.body).toBe(2)
  })
})

describe('ciało – zmiana kosztu na kafelku zapisana przez starszą wersję (T1534)', () => {
  const legacyCost = (s: Scenario, block: string, at: string, costs: Record<string, number>) => s.raw({ k: 'block.cost', block, at: s.at(at), costs, v: 15 }, at)

  it('ciało z kosztu, który blok miał przed zmianą: własne ciało startu zostaje', () => {
    const own = [planBlock({ id: 'a', categoryId: 'inne', startMin: 540, durationMin: 60, costs: { head: 1, emotions: 1, senses: 1, body: 4 } })]
    const s = sc(own).checkin('08:00', { ...none(), body: [1, 1] }).start('a', '09:00')
    legacyCost(s, 'a', '09:00', { head: 0, emotions: 0, senses: 0 })
    s.end('a', '10:00')
    expect(s.energy('10:00').now).toEqual({ head: 100, emotions: 100, senses: 100, body: 65 - 12 })
  })

  it('bez własnego kosztu – ciało podkategorii z ustawień dnia; po zmianie z ciałem – to ciało', () => {
    const s = sc(undefined, { categories: { inne: { costs: { body: 3 } } } }).checkin('08:00', { ...none(), body: [1, 1] }).start('a', '09:00')
    legacyCost(s, 'a', '09:00', { head: 0, emotions: 0, senses: 0 })
    expect(s.energy('09:30').now!.body).toBe(65 - 4.5)
    s.raw({ k: 'block.cost', block: 'a', at: s.at('09:30'), costs: { head: 0, emotions: 0, senses: 0, body: -2 } }, '09:30')
    legacyCost(s, 'a', '10:00', { head: 1, emotions: 0, senses: 0 })
    s.end('a', '10:30')
    // 09:00–09:30 body 3, 09:30–10:00 −2, 10:00–10:30 −2 (kept from the change before).
    expect(s.energy('10:30').now!.body).toBe(65 - 4.5 + 3 + 3)
  })
})
