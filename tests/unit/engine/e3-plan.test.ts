/**
 * The rules of the plan E3 adds to the engine (spec „Model dnia”, „Bloki”, „Zakres 1.0”): the day's type from its
 * weekday, the session layer's answers given after the day was made, the morning following the day's wake, the exchange
 * and „Dodaj bez wymiany”, a change of type during the day, getting up later, the morning plan's questions and warnings,
 * moving and copying.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, defaultDayType, firstFixedStart, morningBound } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { exchangeCost, isFullExchange, proposeExchange } from '@shared/engine/exchange'
import { detectLateWake, lateWakeSeenId } from '@shared/engine/lateWake'
import { fromYesterday, holidayQuestions, morningWarnings, sessionQuestions, shiftNotice, type MorningInputs } from '@shared/engine/morning'
import { copiedDay, copiedTemplate, draggedBlock, moveBetweenDays, movedBlock, newBlockStart, leavesByCancel, newUserBlock, wakeChange, wakeShifted } from '@shared/engine/planEdit'
import { applyTypeChange, planTypeChange } from '@shared/engine/typeChange'
import { defaultTemplates, firstComputerRecords, settingsPatch } from '@shared/model/defaults'
import { DEFAULT_GENERAL, rdFrom } from '@shared/model/rd'
import { dayFileFrom, emptyDayFile, planBlockFrom, templateFor, templateFrom, type DayFile } from '@shared/model/plan'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom, settingsOn } from '@shared/model/settings'
import { block, hhmm, lm, Scenario } from './dsl'

const noHolidays = () => ({ closed: false, earlyClose: null, names: [] })

describe('typ dnia z przypisania tygodnia', () => {
  it('dzień bez wpisu w kalendarzu ma typ swojego dnia tygodnia; zmiana przypisania zmienia typ', () => {
    expect(defaultDayType('2026-10-21')).toBe('zwykly')
    expect(defaultDayType('2026-10-24')).toBe('weekend')
    const changes = [{ id: 'a', from: '2026-01-01', at: null, patch: { weekTypes: ['zwykly', 'zwykly', 'regeneracyjny', 'zwykly', 'zwykly', 'weekend', 'weekend'] } }]
    const snap = createDay({ date: '2026-10-21', changes, templates: [], lectures: [], series: [], dayFile: null, holidays: noHolidays, at: null })
    expect(snap.dayType).toBe('regeneracyjny')
    // A day marked in the calendar keeps its own type.
    const marked = createDay({ date: '2026-10-21', changes, templates: [], lectures: [], series: [], dayFile: { ...emptyDayFile('2026-10-21'), dayType: 'zjazd-zdalny' }, holidays: noHolidays, at: null })
    expect(marked.dayType).toBe('zjazd-zdalny')
  })
})

describe('odpowiedzi warstwy sesji po utworzeniu dnia', () => {
  const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2026-01-01', blocks: [{ id: 'j', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30 }] }] })!
  const snap = createDay({ date: '2026-10-21', changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })

  it('„nie” zabiera sesję i blok do niej zakotwiczony', () => {
    const file: DayFile = { ...emptyDayFile('2026-10-21'), sessions: { ny: 'no' } }
    const plan = dayPlan(snap, file)
    expect(plan.some((b) => b.sourceId === 'ny')).toBe(false)
    expect(plan.some((b) => b.categoryId === 'journaling')).toBe(false)
    expect(plan.some((b) => b.sourceId === 'londyn')).toBe(true)
  })

  it('sesja dodana odpowiedzią „tak” schodzi z planu przez odwołanie (jest w planie, w żadnej migawce), blok własny przez wyjęcie z pliku', () => {
    const weekend = createDay({ date: '2026-10-24', changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    const file: DayFile = { ...emptyDayFile('2026-10-24'), sessions: { ny: 'yes' }, blocks: [block({ id: 'mine', cat: 'inne', at: '10:00', min: 30, origin: 'user' })] }
    const ny = dayPlan(weekend, file).find((b) => b.sourceId === 'ny')!
    expect(weekend.blocks.some((b) => b.id === ny.id)).toBe(false)
    expect(leavesByCancel(ny.id, weekend, file)).toBe(true)
    expect(leavesByCancel('mine', weekend, file)).toBe(false)
    // A block of the snapshot changed for the day (its copy is in the file too) is cancelled as well.
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    const tpl = snap.blocks.find((b) => b.origin === 'session')!
    expect(leavesByCancel(tpl.id, snap, { ...emptyDayFile('2026-10-21'), blocks: [tpl] })).toBe(true)
    // Cancelled it is gone from the plan, and „Cofnij” brings it back.
    expect(dayPlan(weekend, { ...file, cancelled: [ny.id] }).some((b) => b.id === ny.id)).toBe(false)
    expect(dayPlan(weekend, { ...file, cancelled: [] }).some((b) => b.id === ny.id)).toBe(true)
  })

  it('„tak” dodaje sesję, której dzień nie miał (dzień bez sesji)', () => {
    const weekend = createDay({ date: '2026-10-24', changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    expect(weekend.blocks.some((b) => b.origin === 'session')).toBe(false)
    const plan = dayPlan(weekend, { ...emptyDayFile('2026-10-24'), sessions: { ny: 'yes' } })
    const ny = plan.find((b) => b.sourceId === 'ny')!
    // 24.10.2026: NY 08:00 EDT = 14:00 in Poland (CEST).
    expect(ny.startMin).toBe(lm('14:00'))
    expect(ny.fixed).toBe(true)
  })
})

describe('poranek idzie za pobudką dnia', () => {
  const tpl = templateFrom({
    id: 't',
    dayType: 'zwykly',
    versions: [
      {
        from: '2026-01-01',
        blocks: [
          { id: 'r', categoryId: 'rutyny', startMin: lm('06:00'), durationMin: 45 },
          { id: 'a', categoryId: 'analiza', startMin: lm('07:00'), durationMin: 60 },
          { id: 'p', categoryId: 'posilek', startMin: lm('13:00'), durationMin: 30 }
        ]
      }
    ]
  })!

  it('pobudka dnia o 07:30 przesuwa rutynę i bloki przed pierwszym stałym o 1 h 30; stały i późniejsze zostają', () => {
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    const plan = dayPlan(snap, { ...emptyDayFile('2026-10-21'), wakeMin: lm('07:30') })
    const at = (src: string) => plan.find((b) => b.sourceId === src)?.startMin
    expect(at('r')).toBe(lm('07:30'))
    expect(at('a')).toBe(lm('08:30'))
    // The first fixed block is the London session at 08:00: the meal after it stays.
    expect(at('p')).toBe(lm('13:00'))
    expect(plan.find((b) => b.sourceId === 'londyn')?.startMin).toBe(lm('08:00'))
  })

  it('w tygodniu przesunięcia sesji poranek idzie o godzinę wcześniej, a pobudka ustawiona ręcznie wygrywa', () => {
    const snap = createDay({ date: '2026-10-27', changes: [], templates: [tpl], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    expect(snap.wakeMin).toBe(lm('05:00'))
    expect(dayPlan(snap, null).find((b) => b.sourceId === 'r')?.startMin).toBe(lm('05:00'))
    expect(dayPlan(snap, { ...emptyDayFile('2026-10-27'), wakeMin: lm('06:00') }).find((b) => b.sourceId === 'r')?.startMin).toBe(lm('06:00'))
  })
})

describe('sesje niezaczęte do końca czekania', () => {
  const plan = [
    block({ id: 'lo', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
    block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' })
  ]

  it('nie robią dnia bez pracy: pierwszym końcem pracy jest planowany koniec ostatniej z nich, granica się nie zmienia', () => {
    const s = new Scenario({ date: '2026-10-21', plan })
    const waiting = s.state('15:00')
    expect(waiting.firstEnd).toBeNull()
    expect(hhmm(waiting, waiting.boundary.proposal)).toBe('17:15')
    const st = s.state('18:00')
    expect(st.noWorkDay).toBe(false)
    expect(hhmm(st, st.firstEnd)).toBe('17:00')
    expect(hhmm(st, st.workEnd)).toBe('17:00')
    expect(hhmm(st, st.boundary.proposal)).toBe('17:15')
    // Time without a block after it is regeneration: the minimum fits before the bedtime.
    expect(st.hardEnd.unreachable).toBe(false)
    expect(st.warnings).not.toContain('minimum regeneracji nie mieści się przed porą snu')
  })

  it('D467: wieczorny blok pracy jest pracą dnia – koniec niezaczętych sesji nie jest wtedy końcem pracy', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [...plan, block({ id: 'late', cat: 'inne', at: '21:15', min: 30 })] })
    const st = s.state('18:00')
    expect(st.firstEnd).toBeNull()
    // 21:45 + 15 min is past the maximum of the ordinary day.
    expect(hhmm(st, st.boundary.proposal)).toBe('19:00')
  })
})

describe('wymiana (zasada 2)', () => {
  const plan = [block({ id: 'an', cat: 'analiza', at: '08:00', min: 120 }), block({ id: 'na', cat: 'inne', at: '10:30', min: 120 })]
  const scenario = () => new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } }).approve('12:45', '07:30')

  it('przed zatwierdzeniem granicy edycja planu nie wywołuje wymiany', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } })
    const ctx = s.contextAt(s.at('07:00'))
    const extra = newUserBlock('inne', lm('11:00'), 60, undefined)
    expect(proposeExchange(ctx, computeDay(ctx), extra).needed).toBe(false)
  })

  it('blok za granicę: lista bloków, które mogą ustąpić, najpóźniejsze pierwsze; pełna wymiana zdejmuje koszt', () => {
    const s = scenario()
    const ctx = s.contextAt(s.at('07:45'))
    const state = computeDay(ctx)
    const extra = newUserBlock('inne', lm('11:00'), 60, undefined)
    const p = proposeExchange(ctx, state, extra)
    expect(p.needed).toBe(true)
    // Flexible blocks keep their order: the duties 10:30–12:30, then the new block 12:30–13:30 – 45 min beyond 12:45.
    expect(p.beyondMin).toBe(45)
    expect(p.overrun).toBe(false)
    expect(p.candidates.map((c) => c.block.id)).toEqual(['na', 'an'])
    expect(p.preselected).toEqual(['na'])
    expect(isFullExchange(extra, p.candidates.filter((c) => p.preselected.includes(c.block.id)))).toBe(true)
    expect(exchangeCost(ctx, state, extra, ['na']).beyondMin).toBe(0)
  })

  it('poza maksimum: przekroczenie (drugie potwierdzenie); sam budżet: tylko ostrzeżenie', () => {
    const s = scenario()
    const ctx = s.contextAt(s.at('07:45'))
    const state = computeDay(ctx)
    expect(proposeExchange(ctx, state, newUserBlock('inne', lm('18:00'), 120, undefined)).overrun).toBe(true)
    const small = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0, dayTypes: { zwykly: { budgetMin: 4 * 60 } } } }).approve('12:45', '07:30')
    const c2 = small.contextAt(small.at('07:45'))
    const p = proposeExchange(c2, computeDay(c2), newUserBlock('inne', lm('06:00'), 30, undefined))
    expect(p.needed).toBe(true)
    expect(p.beyondMin).toBe(0)
    expect(p.overBudgetMin).toBe(30)
  })

  it('blok pracy po wieczornej sesji też kosztuje swoje minuty po granicy (otwiera pracę ponownie)', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [...plan, block({ id: 'dz', cat: 'sesja', at: '20:00', min: 60, fixed: true })], settings: { transitionBufferMin: 0 } }).approve('12:45', '07:30')
    const ctx = s.contextAt(s.at('07:45'))
    const p = proposeExchange(ctx, computeDay(ctx), newUserBlock('inne', lm('21:30'), 30, undefined))
    expect(p.needed).toBe(true)
    expect(p.beyondMin).toBe(30)
    expect(p.overrun).toBe(true)
  })

  it('prośba nie dostaje propozycji wymiany', () => {
    const s = scenario()
    const ctx = s.contextAt(s.at('07:45'))
    expect(proposeExchange(ctx, computeDay(ctx), newUserBlock('prosby', lm('11:00'), 60, undefined)).needed).toBe(false)
  })

  it('„Dodaj bez wymiany”: minuty po granicy tego bloku są potwierdzone z góry, bez potwierdzenia nie', () => {
    const extra = block({ id: 'x', cat: 'inne', at: '12:30', min: 60, origin: 'user' })
    const s = new Scenario({ date: '2026-10-21', plan: [...plan.slice(0, 1), extra], settings: { transitionBufferMin: 0 } }).approve('12:45', '07:30')
    s.raw({ k: 'block.addConfirm', block: 'x', at: s.at('09:00') }, '09:00').ran('x', '12:30', '13:30')
    const st = s.state('14:00')
    const k = st.grid.start
    const idx = (t: string) => Math.round((s.at(t) - k) / 60_000)
    expect(st.minutes.get(idx('13:00'))).toMatchObject({ cls: 'after', upfront: true })
    const plain = new Scenario({ date: '2026-10-21', plan: [...plan.slice(0, 1), extra], settings: { transitionBufferMin: 0 } }).approve('12:45', '07:30').ran('x', '12:30', '13:30')
    expect(plain.state('14:00').minutes.get(idx('13:00'))).toMatchObject({ cls: 'after', upfront: false })
  })
})

describe('zmiana typu w trakcie dnia', () => {
  const plan = [
    block({ id: 'an', cat: 'analiza', at: '08:00', min: 120 }),
    block({ id: 'na', cat: 'inne', at: '10:30', min: 120 }),
    block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
    block({ id: 'dz', cat: 'sesja', at: '20:00', min: 60, fixed: true })
  ]

  it('na dzień regeneracyjny: parkowanie elastycznych, stałe pojedynczo, maksimum i granica z nowego typu, minimum według regeneracji możliwej do zebrania, koniec pracy', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } }).approve('17:15', '07:30').ran('an', '08:00', '10:00')
    const ctx = s.contextAt(s.at('11:00'))
    const state = computeDay(ctx)
    const inp = { ctx, state, energyNow: null, to: 'regeneracyjny' as const, settings: s.settings }
    const p = planTypeChange(inp)
    expect(p.from).toBe('zwykly')
    expect(p.laterMax).toBe(false)
    expect(p.park.map((b) => b.id)).toEqual(['na'])
    expect(p.fixed.map((b) => b.id).sort()).toEqual(['dz', 'ny'])
    expect(p.minRegen.before).toBe(90)
    expect(p.minRegen.after).toBe(150)
    // The evening session is work of its category (D467): only with it cancelled too no work stays, and the switch confirms the end.
    const r = applyTypeChange(inp, p, { park: ['na'], cancel: ['ny', 'dz'], returnRequests: [], add: [] })
    expect(r.events.map((e) => e.k)).toEqual(['block.park', 'block.cancel', 'block.cancel', 'day.snapshot', 'boundary.approve', 'work.end'])
    expect(r.boundary).not.toBeNull()
    for (const e of r.events) s.raw({ ...e, at: s.at('11:00') }, '11:00')
    const after = s.state('11:05')
    expect(hhmm(after, after.boundary.max)).toBe('14:00')
    expect(hhmm(after, after.boundary.approved)).toBe('14:00')
    expect(after.regen.requiredMin).toBe(150)
    expect(hhmm(after, after.workEnd)).toBe('10:00')
  })

  it('na dzień regeneracyjny: zapauzowana analiza (także z dawnym oznaczeniem, D467) kończy się jak każdy zapauzowany blok pracy', () => {
    const wa = planBlockFrom({ id: 'wa', categoryId: 'analiza', startMin: lm('08:00'), durationMin: 120, tag: 'weeklyAnalysis', waitUntilMin: lm('15:00'), origin: 'template' })!
    const s = new Scenario({ date: '2026-10-21', plan: [wa] }).observe('07:00', null)
    s.start('wa', '08:00').pause('wa', '09:00')
    const ctx = s.contextAt(s.at('09:30'))
    const inp = { ctx, state: computeDay(ctx), energyNow: null, to: 'regeneracyjny' as const, settings: s.settings }
    const r = applyTypeChange(inp, planTypeChange(inp), { park: [], cancel: [], returnRequests: [], add: [] })
    expect(r.events.filter((e) => e.k === 'block.end').map((e) => e.block)).toEqual(['wa'])
  })

  it('pora snu po zmianie nigdy przed chwilą zmiany', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [], settings: { dayTypes: { regeneracyjny: { bedtimeMin: 20 * 60 } } } })
    s.raw({ k: 'day.snapshot', at: s.at('21:00'), dayType: 'regeneracyjny', settings: s.settings, reason: 'type', max: null, minRegen: null }, '21:00')
    expect(hhmm(s.state('21:30'), s.state('21:30').bedtime.base)).toBe('21:00')
  })

  it('zmiana, która nie skraca wieczoru, nie przesuwa pory snu, także gdy ta już minęła', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [] })
    s.raw({ k: 'day.snapshot', at: s.at('23:30'), dayType: 'zwykly', settings: s.settings, reason: 'today', max: null, minRegen: null }, '23:30')
    expect(hhmm(s.state('23:45'), s.state('23:45').bedtime.base)).toBe('22:00')
  })

  it('sesja dodana później tego dnia kończy się o skróconej sesji swojego rynku', () => {
    // 27.11.2026: NYSE closes at 13:00 New York time; a session 09:30–16:00 NY on a day without sessions, added by „tak”.
    const changes = [{ id: 'a', from: '2026-01-01', at: null, patch: { sessions: [{ id: 'rth', name: 'RTH', zone: 'America/New_York', startMin: 570, endMin: 960, markets: ['NYSE'] }] } }]
    const file: DayFile = { ...emptyDayFile('2026-11-27'), dayType: 'regeneracyjny' }
    const snap = createDay({ date: '2026-11-27', changes, templates: [], lectures: [], series: [], dayFile: file, holidays: marketDay, at: null })
    expect(snap.blocks.some((b) => b.origin === 'session')).toBe(false)
    const rth = dayPlan(snap, { ...file, sessions: { rth: 'yes' } }).find((b) => b.sourceId === 'rth')!
    expect(rth.durationMin).toBe(210)
  })

  it('na typ z późniejszym maksimum: brakujące sesje nowego typu do dodania, zaznaczone bez kosztu (bez drugiej zmiany, D467)', () => {
    const s = new Scenario({ date: '2026-10-21', dayType: 'regeneracyjny', plan: [block({ id: 'sp', cat: 'regeneracja', at: '09:30', min: 30 })] })
    const ctx = s.contextAt(s.at('09:00'))
    const state = computeDay(ctx)
    const p = planTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: s.settings })
    expect(p.laterMax).toBe(true)
    // London 08:00–11:00 runs by the plan already (from now), NY 14:00.
    expect(p.add.map((a) => [a.session, a.checked])).toEqual([
      ['londyn', true],
      ['ny', true]
    ])
    const r = applyTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: s.settings }, p, { park: [], cancel: [], returnRequests: [], add: p.add.map((a) => a.block.id) })
    expect(r.sessionsYes.sort()).toEqual(['londyn', 'ny'])
    expect(r.blocks).toEqual([])
    expect(r.events.find((e) => e.k === 'day.snapshot')).toMatchObject({ dayType: 'zwykly', minRegen: null })
  })
})

describe('późne wstanie (D488: pierwszy blok dnia przesunięty na później)', () => {
  const plan = [
    block({ id: 'ru', cat: 'rutyny', at: '06:00', min: 45 }),
    block({ id: 'po', cat: 'posilek', at: '06:45', min: 30 }),
    block({ id: 'an', cat: 'analiza', at: '07:30', min: 120 }),
    block({ id: 'na', cat: 'inne', at: '10:00', min: 240 })
  ]
  /** The day's plan with the routine moved to `at` (after „Cofnij” of its automatic start). */
  const moved = (at: string, p = plan) => p.map((b) => (b.id === 'ru' ? { ...b, startMin: lm(at) } : b))
  const lwAt = (s: Scenario, time: string, extra: Parameters<Scenario['contextAt']>[1] = {}, file: DayFile | null = null) => {
    const ctx = s.contextAt(s.at(time), extra)
    return detectLateWake(ctx, computeDay(ctx), file)
  }

  it('rutyna przesunięta o 105 min: „Tak” przesuwa resztę poranka o to samo i skraca pracę do granicy', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } })
    const lw = lwAt(s, '07:00', { plan: moved('07:45') })!
    expect(lw).not.toBeNull()
    expect([lw.first.id, lw.plannedMin, lw.movedMin, lw.delayMin]).toEqual(['ru', lm('06:00'), lm('07:45'), 105])
    // The meal planned 06:45 goes 105 min later; the routine itself stays where you put it.
    expect(lw.shifts.map((x) => [x.block.id, x.toStartMin])).toEqual([['po', lm('08:30')]])
    expect(lw.shortens.map((x) => x.block.id)).toEqual(['na'])
    expect(lw.shortens[0]!.toMin).toBeLessThan(240)
  })

  it('blok już przesunięty dalej przez rozsuwanie zostaje, gdy opóźnienie stawia go wcześniej', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } })
    const pushed = moved('07:45').map((b) => (b.id === 'po' ? { ...b, startMin: lm('09:00') } : b))
    expect(lwAt(s, '07:00', { plan: pushed })!.shifts).toEqual([])
  })

  it('nie pyta: przesunięcie poniżej 20 min, rutyna na swoim miejscu (także zaczęta sama), w zjazd stacjonarny, po odpowiedzi; pierwsze użycie nic nie znaczy', () => {
    const s = new Scenario({ date: '2026-10-21', plan })
    expect(lwAt(s, '07:00', { plan: moved('06:19') })).toBeNull()
    expect(lwAt(s, '07:00', { plan: moved('06:20') })?.delayMin).toBe(20)
    // The first use long after the routine's end (the trigger of D199): no proposal any more.
    const late = new Scenario({ date: '2026-10-21', plan }).presence('08:30')
    expect(lwAt(late, '08:31')).toBeNull()
    // The morning plan approved: moving the routine still asks.
    const approved = new Scenario({ date: '2026-10-21', plan }).approve('14:15', '06:30')
    expect(lwAt(approved, '07:00', { plan: moved('07:45') })).not.toBeNull()
    const zjazd = new Scenario({ date: '2026-10-21', dayType: 'zjazd-stacjonarny', plan })
    expect(lwAt(zjazd, '07:00', { plan: moved('07:45') })).toBeNull()
    expect(lwAt(s, '07:00', { plan: moved('07:45') }, { ...emptyDayFile('2026-10-21'), asked: { lateWake: 'no' } })).toBeNull()
  })

  it('raz pokazane czeka na odpowiedź: pierwsze „zobaczono” w logu niesie godzinę bloku i pobudkę, kolejne przesunięcie go nie zmienia (D337)', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } })
    const first = lwAt(s, '07:00', { plan: moved('07:45') })!
    expect(lateWakeSeenId('2026-10-21', first)).toBe(`lateWakeMoved:2026-10-21:${lm('07:45')}:${lm('06:00')}`)
    // Moved back to its hour before the card was seen: nothing to ask.
    expect(lwAt(s, '07:05', { plan })).toBeNull()
    // The window reported it seen (the log keeps it): the proposal goes on from the hour it was shown with.
    s.raw({ k: 'question.seen', at: s.at('07:00'), question: lateWakeSeenId('2026-10-21', first), how: 'main' }, '07:00')
    const kept = lwAt(s, '07:05', { plan })!
    expect([kept.movedMin, kept.delayMin]).toEqual([lm('07:45'), first.delayMin])
    // An answer still closes it.
    expect(lwAt(s, '07:05', { plan }, { ...emptyDayFile('2026-10-21'), asked: { lateWake: 'no' } })).toBeNull()
  })

  it('pierwsze „zobaczono” wygrywa; inna pobudka – liczenie z planu; wartości spoza dnia i cudze id są ignorowane (D337)', () => {
    const rutyna = [block({ id: 'ru', cat: 'rutyny', at: '07:00', min: 30 }), block({ id: 'an', cat: 'analiza', at: '10:00', min: 60 })]
    const mk = (seen: string[]) => {
      const s = new Scenario({ date: '2026-10-21', plan: rutyna, settings: { transitionBufferMin: 0 } })
      for (const q of seen) s.raw({ k: 'question.seen', at: s.at('09:01'), question: q, how: 'main' }, '09:01')
      return s
    }
    const movedPlan = moved('09:00', rutyna)
    const hourOf = (s: Scenario, extra: Parameters<Scenario['contextAt']>[1] = { plan: movedPlan }) => lwAt(s, '09:02', extra)?.movedMin ?? null
    const wake = lm('06:00')
    // The first of two is the one kept (a later one with another hour does not move it).
    expect(hourOf(mk([`lateWakeMoved:2026-10-21:${lm('08:15')}:${wake}`, `lateWakeMoved:2026-10-21:${lm('08:00')}:${wake}`]))).toBe(lm('08:15'))
    // Kept for another wake: counted from the plan (09:00).
    expect(hourOf(mk([`lateWakeMoved:2026-10-21:${lm('08:15')}:${lm('05:00')}`]))).toBe(lm('09:00'))
    // Another day's id, outside the day (before 04:00 of the day), not a number: ignored.
    for (const bad of [`lateWake:2026-10-21:${lm('08:15')}:${wake}`, 'lateWakeMoved:2026-10-22:450:360', `lateWakeMoved:2026-10-21:100:${wake}`, `lateWakeMoved:2026-10-21:x:${wake}`, 'lateWake:2026-10-21:450', `wait:2026-10-21:450:${wake}`]) expect(hourOf(mk([bad]))).toBe(lm('09:00'))
    // The day's wake set to 09:30: the morning moves by the plan itself – the routine at 09:00 is no later than planned.
    const lateDay = { ...emptyDayFile('2026-10-21'), wakeMin: lm('09:30') }
    expect(lwAt(mk([`lateWakeMoved:2026-10-21:${lm('09:00')}:${wake}`]), '09:02', { plan: movedPlan, wakeMin: lm('09:30') }, lateDay)).toBeNull()
  })

  it('w czasie sesji trwającej teraz propozycja czeka do jej końca (nie sesja w nowej godzinie bloku, T1148)', () => {
    const withSession = [...plan, block({ id: 'lo', cat: 'sesja', at: '09:00', min: 180, fixed: true, origin: 'session', source: 'londyn' })]
    const s = new Scenario({ date: '2026-10-21', plan: withSession })
    expect(lwAt(s, '07:00', { plan: moved('08:30', withSession) })?.waitUntilMin).toBeNull()
    expect(lwAt(s, '09:30', { plan: moved('08:30', withSession) })?.waitUntilMin).toBe(lm('12:00'))
  })

  it('tylko rano: przeniesienie rutyny po południu na wieczór o nic nie pyta (T1148)', () => {
    const s = new Scenario({ date: '2026-10-21', plan })
    expect(lwAt(s, '15:00', { plan: moved('20:00') })).toBeNull()
    expect(lwAt(s, '07:00', { plan: moved('12:00') })).toBeNull()
    expect(lwAt(s, '07:00', { plan: moved('11:59') })?.delayMin).toBe(lm('11:59') - lm('06:00'))
  })

  it('godzina planowana jak w planie dnia: pobudka dnia i Twój blok stały przeniesiony na ten dzień (T1148)', () => {
    const withFixed = [block({ id: 'st', cat: 'inne', at: '06:30', min: 30, fixed: true }), block({ id: 'ru', cat: 'rutyny', at: '07:00', min: 30 })]
    const s = new Scenario({ date: '2026-10-21', plan: withFixed })
    const file: DayFile = { ...emptyDayFile('2026-10-21'), wakeMin: lm('07:00'), blocks: [{ ...withFixed[0]!, startMin: lm('11:00'), origin: 'user' }] }
    const dayPlanned = dayPlan(s.snapshot, file)
    expect(dayPlanned.find((b) => b.id === 'ru')!.startMin).toBe(lm('08:00'))
    expect(lwAt(s, '07:30', { plan: dayPlanned, wakeMin: lm('07:00') }, file)).toBeNull()
  })
})

describe('plan poranny', () => {
  const inputs = (date: string, files: Record<string, DayFile> = {}): MorningInputs => ({
    date,
    changes: [],
    templates: defaultTemplates(),
    lectures: [], series: [],
    holidays: marketDay,
    files: (d) => files[d] ?? null
  })

  it('bloki z wczoraj', () => {
    const b = movedBlock(block({ id: 'x', cat: 'analiza', at: '09:00', min: 60, origin: 'user' }), [], '2026-10-20', true)
    expect(fromYesterday([b], '2026-10-21').map((x) => x.id)).toEqual(['x'])
    expect(b.moves).toBe(1)
  })

  it('pytania warstwy sesji „pytaj” bez odpowiedzi', () => {
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], series: [], dayFile: { ...emptyDayFile('2026-10-21'), dayType: 'zjazd-zdalny' }, holidays: marketDay, at: null })
    expect(sessionQuestions(snap, null, '2026-10-21').map((s) => s.id)).toEqual(['londyn', 'ny'])
    expect(sessionQuestions(snap, { ...emptyDayFile('2026-10-21'), sessions: { ny: 'yes' } }, '2026-10-21').map((s) => s.id)).toEqual(['londyn'])
  })

  it('tydzień przed świętem w USA: raz pyta o sesje; dzień skróconej sesji – bez pytania (D467: bez drugiej zmiany)', () => {
    const q = holidayQuestions(inputs('2026-11-20'))
    expect(q.map((x) => x.text)).toEqual(['26.11 święto w USA — sesja Londyn i sesja NY?'])
    const asked = holidayQuestions(inputs('2026-11-20', { '2026-11-26': { ...emptyDayFile('2026-11-26'), asked: { holiday: 'done' } } }))
    expect(asked).toEqual([])
  })

  it('D467: wieczorny blok szablonu z dawnym oznaczeniem drugiej zmiany nie dostaje pytania przed świętem', () => {
    const raw = { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [{ from: '2020-01-01', blocks: [{ id: 'druga-zmiana', categoryId: 'sesja', startMin: lm('20:00'), durationMin: 60, fixed: true, tag: 'secondShift', origin: 'template' }] }] }
    const q = holidayQuestions({ ...inputs('2026-11-20'), templates: [templateFrom(raw)!] })
    expect(q.map((x) => x.text)).toEqual(['26.11 święto w USA — sesja Londyn i sesja NY?'])
  })

  it('tydzień przesunięcia sesji zapowiedziany tydzień wcześniej', () => {
    const n = shiftNotice(inputs('2026-10-19'))!
    expect(n.from).toBe('2026-10-25')
    expect(n.starts).toEqual([
      { name: 'Londyn', at: '07:00' },
      { name: 'NY', at: '13:00' }
    ])
    expect(shiftNotice(inputs('2026-10-26'))).toBeNull()
  })

  it('ostrzeżenia: praca po maksimum, minimum regeneracji, budżet (bez ostrzeżenia o drugiej zmianie, D467)', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 13 * 60 }), block({ id: 'dz', cat: 'sesja', at: '21:30', min: 60, fixed: true })] })
    const w = morningWarnings(s.state('07:00'))
    expect([...w].sort()).toEqual(['budget', 'max', 'minimum'])
  })
})

describe('przenoszenie i kopiowanie', () => {
  it('przeniesiony blok zachowuje identyfikator, zakotwiczony dostaje godzinę z planu, licznik rośnie tylko przy Twoim przeniesieniu', () => {
    const plan = [block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true }), block({ id: 'j', cat: 'journaling', after: 'ny', min: 30 })]
    const m = movedBlock(plan[1]!, plan, '2026-10-21', true)
    expect(m).toMatchObject({ id: 'j', startMin: lm('17:00'), anchor: null, movedFrom: '2026-10-21', moves: 1 })
    expect(movedBlock(plan[1]!, plan, '2026-10-21', false).moves).toBe(0)
  })

  it('Ctrl N: nowy blok w najbliższym wolnym miejscu, nie na trwającym bloku (A6-24)', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [block({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:30', min: 60 })] }).observe('07:00', null)
    s.start('a', '10:00')
    const st = s.state('10:05')
    // From 10:15: after „a” (11:00) only 30 min before „b” – the hour fits after it, at 12:30.
    expect(newBlockStart(st, lm('10:15'))).toBe(lm('12:30'))
    expect(newBlockStart(st, lm('10:15'), 30)).toBe(lm('11:00'))
    expect(newBlockStart(st, lm('14:00'))).toBe(lm('14:00'))
  })

  it('blok przeciągnięty na osi (D305): nowy start w dniu logicznym, reszta bez zmian', () => {
    const x = block({ id: 'x', cat: 'analiza', at: '09:00', min: 60, origin: 'template' })
    expect(draggedBlock(x, lm('10:15'))).toEqual({ ...x, startMin: lm('10:15') })
    expect(draggedBlock(x, 200).startMin).toBe(240)
    expect(draggedBlock(x, 1700).startMin).toBe(1678)
  })

  it('blok przeniesiony z powrotem na dzień, z którego wyszedł, jest tam znowu (i nie ma go na drugim)', () => {
    const x = block({ id: 'x', cat: 'analiza', at: '09:00', min: 60, origin: 'user' })
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: noHolidays, at: null })
    const there = moveBetweenDays({ schema: 1, date: '2026-10-21', blocks: [x] }, null, x, [x], '2026-10-21', '2026-10-22')
    const back = moveBetweenDays(there.target, there.source, { ...x, movedFrom: '2026-10-21', moves: 1 }, [x], '2026-10-22', '2026-10-21')
    const mon = dayPlan(snap, dayFileFrom(back.target, '2026-10-21'))
    const tue = dayPlan({ ...snap }, dayFileFrom(back.source, '2026-10-22'))
    expect(mon.find((b) => b.id === 'x')).toMatchObject({ moves: 2, movedFrom: '2026-10-22' })
    expect(tue.some((b) => b.id === 'x')).toBe(false)
  })

  it('kopia dnia: Twoje bloki i szablonu z nowymi identyfikatorami, bez sesji i wykładów; kotwice idą za nimi', () => {
    const plan = [
      block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
      { ...block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), byVariant: true },
      block({ id: 'b', cat: 'journaling', after: 'a', min: 30, origin: 'user' }),
      block({ id: 'w', cat: 'wyklad', at: '18:00', min: 90, fixed: true, origin: 'lecture' })
    ]
    const c = copiedDay(plan)
    expect(c).toHaveLength(2)
    // A variant changed „a” on its day, not the copy (the game's note for accuracy).
    expect(c.every((x) => !x.byVariant)).toBe(true)
    const a = c.find((x) => x.categoryId === 'analiza')!
    expect(a.id).not.toBe('a')
    expect(c.find((x) => x.categoryId === 'journaling')!.anchor).toBe(a.id)
    expect(c.every((x) => x.origin === 'user')).toBe(true)
  })

  it('kopia szablonu: nowe identyfikatory szablonu i bloków, kotwice do sesji zostają', () => {
    const t = templateFrom({ id: 't', name: 'A', dayType: 'zwykly', versions: [{ from: '2026-01-01', blocks: [{ id: 'x', categoryId: 'analiza', startMin: 480, durationMin: 60 }, { id: 'y', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30 }, { id: 'z', categoryId: 'nauka', anchor: 'x', durationMin: 30 }] }] })!
    const c = copiedTemplate(t, 't2', 'Kopia A')
    const [x, y, z] = c.versions[0]!.blocks
    // In the archive until you give it its days: never the type's template at once.
    expect(c).toMatchObject({ id: 't2', name: 'Kopia A', archived: true })
    expect(templateFor([t, c], 'zwykly', 3, '2026-10-21')?.template.id).toBe('t')
    expect(x!.id).not.toBe('x')
    expect(y!.anchor).toBe('session:ny')
    expect(z!.anchor).toBe(x!.id)
  })
})

describe('kreator pierwszego komputera', () => {
  it('zapisuje różnicę ustawień, szablony (dzień zwykły bez bloków, sobota z analizą), dni z kalendarza; dzień liczy się z nich', () => {
    const settings = settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { dayTypes: { zwykly: { budgetMin: 480 } }, reserve: 12 }))
    expect(settingsPatch(DEFAULT_SETTINGS, settings)).toEqual({ dayTypes: { zwykly: { budgetMin: 480 } }, reserve: 12 })
    const records = firstComputerRecords(
      { settings, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [{ id: 'p1', name: 'Mama', archived: false }], templates: defaultTemplates(), lectures: [], days: { '2026-10-31': 'zjazd-stacjonarny' } },
      1_800_000_000_000,
      'pca'
    )
    expect(records.map((r) => r.rel)).toEqual(['rd.json', 'templates/zwykly.json', 'templates/sobota.json', 'days/2026/2026-10-31.json'])
    const rd = rdFrom(records[0]!.value)
    expect(rd.people.map((p) => p.name)).toEqual(['Mama'])
    const templates = records.filter((r) => r.rel.startsWith('templates/')).map((r) => templateFrom(r.value)!)
    expect(settingsOn(rd.settings, '2026-10-21').dayTypes.zwykly.budgetMin).toBe(480)
    const wed = createDay({ date: '2026-10-21', changes: rd.settings, templates, lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    expect(wed.budgetMin).toBe(480)
    expect(wed.blocks.filter((b) => b.origin === 'template')).toEqual([])
    const sat = createDay({ date: '2026-10-24', changes: rd.settings, templates, lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    expect(sat.blocks.filter((b) => b.origin === 'template').map((b) => [b.categoryId, b.startMin, b.durationMin, b.fixed])).toEqual([['analiza', lm('09:00'), 60, false]])
    const zjazd = createDay({ date: '2026-10-31', changes: rd.settings, templates, lectures: [], series: [], dayFile: dayFileFrom(records[3]!.value, '2026-10-31'), holidays: marketDay, at: null })
    expect(zjazd.dayType).toBe('zjazd-stacjonarny')
  })
})

describe('pobudka przesuwa też bloki ręczne – jedna reguła i migawka dnia (D334)', () => {
  const NO_SESSIONS = { londyn: 'no', ny: 'no' } as const
  const tpl = templateFrom({
    id: 't',
    dayType: 'zwykly',
    versions: [{ from: '2026-01-01', blocks: [{ id: 'f', categoryId: 'inne', startMin: lm('09:00'), durationMin: 30, fixed: true }, { id: 'b', categoryId: 'inne', startMin: lm('10:00'), durationMin: 30 }] }]
  })!
  const create = (lectures: Parameters<typeof createDay>[0]['lectures'] = []) => createDay({ date: '2026-10-21', changes: [], templates: [tpl], lectures, series: [], dayFile: null, holidays: marketDay, at: null })

  it('poranek jest ograniczony pierwszym blokiem stałym jak w 1.0.3 – także odwołanym; blok szablonu i własny idą tak samo', () => {
    const snap = create()
    const f = snap.blocks.find((b) => b.sourceId === 'f')!
    const base = { ...emptyDayFile('2026-10-21'), cancelled: [f.id], sessions: NO_SESSIONS, blocks: [block({ id: 'mine', cat: 'inne', at: '10:00', min: 30, origin: 'user' }), block({ id: 'early', cat: 'inne', at: '08:00', min: 30, origin: 'user' })] }
    // The wake 06:00 → 07:00: the cancelled fixed block at 09:00 still bounds the morning (existing days do not change with
    // the update): the block of the template at 10:00 stays, and so does yours at 10:00; the one at 08:00 goes with the wake.
    const plan = dayPlan(snap, { ...base, wakeMin: lm('07:00') })
    expect(plan.find((b) => b.sourceId === 'b')?.startMin).toBe(lm('10:00'))
    expect(morningBound(snap, base)).toBe(lm('09:00'))
    expect(wakeChange(snap, base, lm('07:00')).map((b) => [b.id, b.startMin])).toEqual([['early', lm('09:00')]])
    // Not cancelled the bound is the same.
    const kept = { ...base, cancelled: [] }
    expect(morningBound(snap, kept)).toBe(lm('09:00'))
    expect(dayPlan(snap, { ...kept, wakeMin: lm('07:00') }).find((b) => b.sourceId === 'b')?.startMin).toBe(lm('10:00'))
    expect(wakeChange(snap, kept, lm('07:00')).map((b) => b.id)).toEqual(['early'])
    // The answers of the session layer count as before: a session added by „tak” at 08:00 bounds both the same way.
    const weekdaySnap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], series: [], dayFile: null, holidays: marketDay, at: null })
    const ses = { ...emptyDayFile('2026-10-21'), sessions: { londyn: 'yes', ny: 'no' } as const, blocks: [block({ id: 'x', cat: 'inne', at: '07:30', min: 30, origin: 'user' }), block({ id: 'y', cat: 'inne', at: '08:30', min: 30, origin: 'user' })] }
    expect(morningBound(weekdaySnap, ses)).toBe(lm('08:00'))
    expect(wakeChange(weekdaySnap, ses, lm('07:00')).map((b) => b.id)).toEqual(['x'])
  })

  it('pierwszy blok stały i różnica pobudek z migawki dnia, nie z dnia liczonego od nowa: wykład dodany po utworzeniu dnia', () => {
    const lecture = { id: 'w', name: 'Wykład', categoryId: 'ogladanie', variantId: null, weekday: 3, startMin: lm('07:30'), durationMin: 60, from: '2026-01-01', to: '2026-12-31', exceptions: [], recorder: null, background: null, archived: false }
    const logged = create()
    const nowSnap = create([lecture])
    expect(nowSnap.blocks.some((b) => b.origin === 'lecture')).toBe(true)
    const file = { ...emptyDayFile('2026-10-21'), sessions: NO_SESSIONS, blocks: [block({ id: 'mine', cat: 'inne', at: '07:45', min: 30, origin: 'user' })] }
    // The day as made (without the lecture): the block before the first fixed one of the shown plan moves.
    expect(wakeChange(logged, file, lm('07:00')).map((b) => b.id)).toEqual(['mine'])
    // The day counted again now has the lecture at 07:30 – it is not the plan the window shows.
    expect(wakeChange(nowSnap, file, lm('07:00'))).toEqual([])
  })
})

describe('pobudka przesuwa też bloki ręczne – raz, w chwili zmiany (D334)', () => {
  const plan = [
    block({ id: 'rano', cat: 'inne', at: '06:30', min: 30, origin: 'user' }),
    block({ id: 'zmieniony', cat: 'inne', at: '07:00', min: 30, origin: 'template' }),
    block({ id: 'stały', cat: 'inne', at: '09:00', min: 60, fixed: true, origin: 'user' }),
    block({ id: 'po', cat: 'inne', at: '10:30', min: 30, origin: 'user' }),
    block({ id: 'kotwica', cat: 'inne', after: 'rano', min: 15, origin: 'user' }),
    block({ id: 'wlasny-stały', cat: 'inne', at: '07:30', min: 30, fixed: true, origin: 'user' })
  ]
  // The first fixed block is at 07:30 here: only what starts before it moves.
  const moved = (from: string, to: string, p = plan, keep?: ReadonlySet<string>) => wakeShifted(p, p, firstFixedStart(p), lm(from), lm(to), keep).map((b) => [b.id, b.startMin!])

  it('bloki ręczne przed pierwszym stałym idą o różnicę pobudek; stały, późniejsze i zakotwiczone zostają', () => {
    expect(moved('06:00', '07:00')).toEqual([
      ['rano', lm('07:30')],
      ['zmieniony', lm('08:00')]
    ])
    // Without the fixed block of 07:30 the first one is that of 09:00: both flexible blocks of the morning move.
    const p = plan.filter((b) => b.id !== 'wlasny-stały')
    expect(moved('06:00', '07:30', p)).toEqual([
      ['rano', lm('08:00')],
      ['zmieniony', lm('08:30')]
    ])
  })

  it('bez stałego bloku w planie idą wszystkie elastyczne; bez różnicy nic; zaczęty zostaje; początek dnia i koniec trzymają granice', () => {
    const flexible = plan.filter((b) => !b.fixed)
    expect(moved('06:00', '06:00', flexible)).toEqual([])
    expect(moved('06:00', '07:00', flexible).map(([id]) => id)).toEqual(['rano', 'zmieniony', 'po'])
    expect(moved('06:00', '07:00', flexible, new Set(['rano'])).map(([id]) => id)).toEqual(['zmieniony', 'po'])
    expect(wakeShifted(flexible, flexible, firstFixedStart(flexible), lm('10:00'), lm('04:00')).find((b) => b.id === 'rano')?.startMin).toBe(240)
  })

  it('tylko własne bloki dnia: blok z migawki idzie z liczeniem dnia (dayPlan), nie z tą funkcją', () => {
    const own = plan.filter((b) => b.id === 'rano')
    expect(wakeShifted(own, plan, firstFixedStart(plan), lm('06:00'), lm('07:00')).map((b) => b.id)).toEqual(['rano'])
  })
})
