/**
 * Rules of the day engine fixed after the E8 review (docs/przeglad-E8.md): the mark „po pracy” of two evening blocks
 * and its approval, „Dalej” never starting a block waiting for „Zacznij”, fixed blocks around „Odcinam się”, a
 * regeneration away from the computer at the bedtime, the late wake from the first use, the template's maximum after a
 * change „od dziś”, a third of the minimum by its own minute, a fixed block begun late, the rest of the reserve's reward.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, autoActions, questionsOf } from '@shared/engine/auto'
import { computeDay } from '@shared/engine/day'
import { viewAt } from '@shared/engine/facts'
import { forecast } from '@shared/engine/forecast'
import { detectLateWake } from '@shared/engine/lateWake'
import { timerNow } from '@shared/engine/timer'
import { applyTypeChange, planTypeChange } from '@shared/engine/typeChange'
import { variantCauses, variantsFor } from '@shared/engine/variants'
import { block, hhmm, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function leader(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
  s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
}

const idx = (s: Scenario, time: string) => Math.round((s.at(time) - s.state('04:00').grid.start) / 60_000)
const marks = (st: ReturnType<Scenario['state']>) => st.blocks.filter((b) => b.afterWorkMark).map((b) => b.id).sort()

describe('oznaczenie „po pracy” (A1-05)', () => {
  const base = [
    block({ id: 'i', cat: 'inne', at: '09:00', min: 420 }),
    block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 }),
    block({ id: 'o', cat: 'ogladanie', at: '18:00', min: 60 }),
    block({ id: 'ds', cat: 'inne', at: '20:00', min: 60, tag: 'secondShift' })
  ]

  it('dwa wieczorne bloki „po końcu pracy jak projekt” mają oznaczenie oba; granica liczy się bez nich', () => {
    const st = new Scenario({ date: DATE, plan: base }).state('08:00')
    expect(marks(st)).toEqual(['n', 'o'])
    expect(hhmm(st, st.boundary.proposal)).toBe('16:15')
  })

  it('blok dodany po zatwierdzeniu granicy nie zabiera oznaczenia blokom z zatwierdzonego planu', () => {
    const later = block({ id: 'x', cat: 'inne', at: '18:30', min: 60 })
    // Before an approval the plan as it is now decides.
    expect(marks(new Scenario({ date: DATE, plan: [...base, later] }).state('08:00'))).toEqual([])
    const s = new Scenario({ date: DATE, plan: [...base, later] })
    s.raw({ k: 'boundary.approve', at: s.at('08:00'), boundary: s.at('16:15'), auto: false, plan: base.map((b) => b.id) }, '08:00')
    expect(marks(s.state('09:00'))).toEqual(['n', 'o'])
  })
})

describe('„Dalej” i bloki czekające na „Zacznij” (A1-06)', () => {
  it('sobotnia analiza tygodniowa nie jest następnym blokiem „Dalej” – zaczyna ją tylko jej linia', () => {
    const plan = [block({ id: 'ru', cat: 'rutyny', at: '08:00', min: 30 }), block({ id: 'wa', cat: 'analiza', at: '09:00', min: 60, tag: 'weeklyAnalysis' })]
    const s = new Scenario({ date: '2026-10-31', dayType: 'weekend', plan }).observe('07:00', null)
    s.start('ru', '08:00')
    expect(timerNow(s.state('08:20')).next?.id ?? null).toBeNull()
  })
})

describe('bloki stałe i „Odcinam się” (A1-07)', () => {
  const plan = () => [block({ id: 'z', cat: 'zajecia-zdalne', at: '14:00', min: 90, fixed: true })]

  it('po „Wracam” blok stały, który jeszcze trwa, biegnie od tej chwili, nie od planowanego startu', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).using('07:00', '16:00')
    s.disconnect('13:30', '14:30')
    const out = leader(s, '14:31')
    expect(out).toEqual([expect.objectContaining({ k: 'block.start', block: 'z', at: s.at('14:30') })])
  })

  it('biegnący blok stały w czasie „Odcinam się” jest „do potwierdzenia”: te minuty nie są pracą, tylko regeneracją', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).using('07:00', '16:00')
    s.start('z', '14:00').disconnect('14:30', '15:00')
    const st = s.state('15:10')
    expect(st.budgetUsedMin).toBe(40)
    expect(st.rest[idx(s, '14:40')]).not.toBe(0)
  })
})

describe('regeneracja „poza komputerem” o porze snu (A1-08)', () => {
  it('bez użycia komputera do pory snu kończy się po swojej długości', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'sp', cat: 'regeneracja', variant: 'spacer', at: '21:00', min: 30 })] }).observe('07:00', '20:59')
    s.start('sp', '21:00')
    const out = leader(s, '22:01')
    expect(out).toEqual([expect.objectContaining({ k: 'block.end', block: 'sp', autoRule: 'bedtime', at: s.at('21:30') })])
  })
})

describe('późne wstanie od pierwszego użycia komputera (A1-10)', () => {
  const plan = [block({ id: 'ru', cat: 'rutyny', at: '06:00', min: 45 }), block({ id: 'an', cat: 'analiza', at: '07:30', min: 120 })]

  it('nocne kodowanie po 04:00 nie jest pierwszym użyciem – propozycja od użycia rano', () => {
    const s = new Scenario({ date: '2026-10-21', plan }).using('04:00', '04:40').presence('04:05')
    s.raw({ k: 'observe.to', at: s.at('04:40'), why: 'quit' }, '04:40')
    s.using('08:30', '09:00')
    const ctx = s.contextAt(s.at('08:45'))
    const lw = detectLateWake(ctx, computeDay(ctx), null)
    expect(lw?.firstUse).toBe(s.at('08:30'))
  })

  it('dzień bez zapisów obserwacji liczy od pierwszej obecności (zapas)', () => {
    const s = new Scenario({ date: '2026-10-21', plan }).presence('08:30')
    const ctx = s.contextAt(s.at('08:31'))
    expect(detectLateWake(ctx, computeDay(ctx), null)?.firstUse).toBe(s.at('08:30'))
  })
})

describe('maksimum z szablonu po zmianie „od dziś” (A1-11)', () => {
  it('nadpisanie maksimum z szablonu zostaje po migawce „od dziś”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })] })
    ;(s.snapshot as { maxMin: number }).maxMin = lm('18:00')
    expect(hhmm(s.state('09:00'), s.state('09:00').boundary.max)).toBe('18:00')
    s.raw({ k: 'day.snapshot', at: s.at('10:00'), dayType: 'zwykly', settings: s.settings, reason: 'today', max: null, minRegen: null }, '10:00')
    const st = s.state('10:30')
    expect(hhmm(st, st.boundary.max)).toBe('18:00')
  })
})

describe('jedna trzecia minimum według migawki swojej minuty (A1-14)', () => {
  it('regeneracja sprzed przełączenia na dzień regeneracyjny liczy się do limitu dnia zwykłego', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'r', cat: 'regeneracja', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 240 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('16:00', '07:30').start('a', '08:00').end('a', '09:00').start('r', '09:00').end('r', '10:00').start('b', '10:00')
    expect(s.state('10:29').regen.towardMinMin).toBe(30)
    s.raw({ k: 'day.snapshot', at: s.at('10:30'), dayType: 'regeneracyjny', settings: s.settings, reason: 'type', max: null, minRegen: null }, '10:30')
    expect(s.state('10:31').regen.towardMinMin).toBe(30)
  })
})

describe('warianty a „nie przenosić na jutro” (A1-17)', () => {
  it('blok takiej kategorii wariant skraca, ale nie przenosi na jutro', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'b', cat: 'analiza', at: '10:00', min: 120 })]
    const s = new Scenario({ date: DATE, plan, settings: { categories: { analiza: { noMoveTomorrow: true } } } }).observe('07:00', null)
    s.approve('12:15', '07:30').start('a', '08:00').end('a', '10:45')
    const st = s.state('10:46')
    const cause = variantCauses(st, null)[0]!
    const v = variantsFor(s.contextAt(s.at('10:46')), st, cause, (b) => b.categoryId)
    expect(v.map((x) => x.id)).toEqual(['shorten', 'keep'])
  })
})

describe('blok stały zaczęty później (A1-18)', () => {
  it('prognoza kończy go o planowanym końcu okna, tam gdzie kończy go timer', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'z', cat: 'zajecia-zdalne', at: '14:00', min: 90, fixed: true })] }).using('07:00', '16:00')
    s.start('z', '14:20')
    const st = s.state('15:00')
    const p = st.forecast.find((x) => x.block.id === 'z')!
    expect(hhmm(st, p.to)).toBe('15:30')
  })
})

describe('odpoczynek do nagrody za rezerwę (A2-02)', () => {
  function day() {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    s.write([{ id: 'auto-a', k: 'block.end', block: 'a', at: s.at('09:00'), done: null, rule: 'twoQuestions', autoRule: 'twoQuestions' }], s.at('10:00'))
    s.gap('10:30', '11:15')
    return s
  }

  it('czas do wyjaśnienia z odpowiedzią „odpoczynek” jest odpoczynkiem nagrody, energia w nim stoi', () => {
    const s = day()
    const id = s.state('10:40').explains[0]!.id
    s.write([{ k: 'question.answer', at: s.at('10:45'), question: id, answer: 'rest', value: null }], s.at('10:45'))
    const st = s.state('12:00')
    expect(st.rest[idx(s, '09:30')]).toBe(0)
    expect(st.rewardRest[idx(s, '09:30')]).not.toBe(0)
  })

  it('odcinek oznaczony w rytuale „nie był odpoczynkiem” nie jest odpoczynkiem nagrody', () => {
    const s = day()
    s.raw({ k: 'rest.not', at: s.at('21:00'), from: s.at('11:20'), to: s.at('11:50') }, '21:00')
    const st = s.state('21:30')
    expect(st.rewardRest[idx(s, '11:30')]).toBe(0)
  })
})

describe('„Odliczyć nieobecność” po granicy (A1-13)', () => {
  it('blok pracy, który dałby niepotwierdzone minuty po granicy, czeka zapauzowany', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 })] }).using('07:00', '16:20')
    s.approve('17:15', '07:30').start('a', '16:00')
    s.gap('16:20', '17:30')
    s.using('17:30', '18:00')
    leader(s, '17:31')
    const t = s.at('17:32')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const q = questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t }).find((x) => x.kind === 'absence')!
    const out = answerEvents(state, q, 'subtract', t)!
    expect(out.map((e) => e.k)).toEqual(['undo', 'block.pause', 'question.answer'])
  })
})

describe('uwagi z przeglądu kodu 0.16.0', () => {
  it('oznaczenie „po pracy” nie zależy od kolejności bloków w planie', () => {
    const n = block({ id: 'n', cat: 'nauka', at: '10:00', min: 60 })
    const o = block({ id: 'o', cat: 'ogladanie', at: '20:00', min: 60 })
    expect(marks(new Scenario({ date: DATE, plan: [n, o] }).state('08:00'))).toEqual(['o'])
    expect(marks(new Scenario({ date: DATE, plan: [o, n] }).state('08:00'))).toEqual(['o'])
  })

  it('po „Cofnij” zatwierdzenia granicy oznaczenia liczą się z planu, jaki jest', () => {
    const base = [block({ id: 'i', cat: 'inne', at: '09:00', min: 420 }), block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 })]
    const s = new Scenario({ date: DATE, plan: [...base, block({ id: 'x', cat: 'inne', at: '17:30', min: 60 })] })
    s.raw({ k: 'boundary.approve', at: s.at('08:00'), boundary: s.at('16:15'), auto: false, plan: base.map((b) => b.id) }, '08:00')
    expect(marks(s.state('08:10'))).toEqual(['n'])
    s.raw({ k: 'boundary.undo', at: s.at('08:30') }, '08:30')
    expect(marks(s.state('09:00'))).toEqual([])
  })

  it('„Odcinam się” po końcu pracy i praca po „Wracam” nie zabierają końca potwierdzonego wcześniej', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 240 }), block({ id: 'b', cat: 'inne', at: '16:20', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '08:00').end('a', '12:00').workEnd('12:00').disconnect('16:00', '16:20').start('b', '16:20').end('b', '16:50')
    const st = s.state('17:30')
    expect(hhmm(st, st.firstEnd)).toBe('12:00')
  })

  it('prośba dopisana po fakcie (cięcie bloku) nie robi końca pracy, gdy blok wrócił po niej', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })] }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00')
    s.raw({ k: 'request.start', request: 'r1', at: s.at('09:30'), mode: 'now', person: null, estimateMin: null, hardEndAt: null, splits: ['a'] }, '10:20')
    s.raw({ k: 'request.end', request: 'r1', at: s.at('10:00') }, '10:20')
    expect(s.state('10:30').ends).toEqual([])
  })

  it('zmiana na dzień regeneracyjny kończy zapauzowany blok pracy, jak „Koniec pracy”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })], settings: { transitionBufferMin: 0 } }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '10:00')
    const ctx = s.contextAt(s.at('10:30'))
    const state = computeDay(ctx)
    const inp = { ctx, state, energyNow: null, to: 'regeneracyjny' as const, settings: s.settings, templates: [] }
    const r = applyTypeChange(inp, planTypeChange(inp), { park: [], cancel: [], returnRequests: [], add: [] })
    expect(r.events.filter((e) => e.k === 'work.end' || e.k === 'block.end').map((e) => [e.k, e.k === 'work.end' ? e.end : e.block])).toEqual([
      ['work.end', s.at('10:00')],
      ['block.end', 'a']
    ])
  })

  it('nagrywany wykład biegnie w „Odcinam się” i zaczyna się o planowanej godzinie', () => {
    const lecture = { ...block({ id: 'w', cat: 'wyklad', at: '10:00', min: 90, fixed: true }), recorder: 'pca' }
    const s = new Scenario({ date: DATE, plan: [lecture] }).using('07:00', '12:00')
    s.disconnect('09:30', '10:30')
    expect(leader(s, '10:31')).toEqual([expect.objectContaining({ k: 'block.start', block: 'w', at: s.at('10:00') })])
    const s2 = new Scenario({ date: DATE, plan: [lecture] }).using('07:00', '12:00')
    s2.start('w', '10:00').disconnect('10:30', '11:00')
    expect(s2.state('11:10').budgetUsedMin).toBe(70)
  })

  it('blok stały zaczęty później: „Przedłuż” potwierdza minuty od końca jego okna', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'z', cat: 'zajecia-zdalne', at: '14:00', min: 90, fixed: true })] }).using('07:00', '17:00')
    s.approve('15:00', '07:30').start('z', '14:20').extend('z', 30, '15:25')
    const st = s.state('15:45')
    expect(st.minutes.get(idx(s, '15:40'))?.upfront).toBe(true)
  })

  it('sesja zaczęta później kończy się w prognozie okna o końcu swojego okna', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 90, fixed: true, origin: 'session', source: 'ny' })] }).using('07:00', '18:00')
    s.start('ny', '15:45')
    const st = s.state('16:00')
    const fc = forecast({ blocks: st.blocks, view: viewAt(st.facts, st.now), m: st.now, mode: 'window', transitionBufferMin: 0, typicalMin: () => null })
    expect(hhmm(st, fc.placed.find((p) => p.block.id === 'ny')!.to)).toBe('17:00')
  })

  it('jedna trzecia minimum po przełączeniu – z minimum ustalonego przy przełączeniu', () => {
    const plan = [
      block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', at: '09:00', min: 60 }),
      block({ id: 'b', cat: 'inne', at: '10:00', min: 30 }),
      block({ id: 'r2', cat: 'regeneracja', at: '10:30', min: 60 }),
      block({ id: 'c', cat: 'inne', at: '11:30', min: 150 })
    ]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('16:00', '07:30').ran('a', '08:00', '09:00').ran('r', '09:00', '10:00').ran('b', '10:00', '10:30').ran('r2', '10:30', '11:30').start('c', '11:30')
    s.raw({ k: 'day.snapshot', at: s.at('10:15'), dayType: 'regeneracyjny', settings: s.settings, reason: 'type', max: null, minRegen: 120 }, '10:15')
    expect(s.state('11:40').regen.towardMinMin).toBe(40)
  })

  it('maksimum ustawione w szablonie zostaje po zmianie „od dziś”, także równe domyślnemu typu', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })] })
    ;(s.snapshot as { maxFromTemplate?: boolean }).maxFromTemplate = true
    const changed = { ...s.settings, dayTypes: { ...s.settings.dayTypes, zwykly: { ...s.settings.dayTypes.zwykly, maxMin: lm('18:00') } } }
    s.raw({ k: 'day.snapshot', at: s.at('10:00'), dayType: 'zwykly', settings: changed, reason: 'today', max: null, minRegen: null }, '10:00')
    const st = s.state('10:30')
    expect(hhmm(st, st.boundary.max)).toBe('19:00')
  })
})
