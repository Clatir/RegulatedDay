/**
 * The rules of the plan E3 adds to the engine (spec „Model dnia”, „Bloki”, „Zakres 1.0”): the day's type from its
 * weekday, the session layer's answers given after the day was made, the morning following the day's wake, the exchange
 * and „Dodaj bez wymiany”, a change of type during the day, getting up later, the morning plan's questions and warnings,
 * moving and copying.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, defaultDayType } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { exchangeCost, isFullExchange, proposeExchange } from '@shared/engine/exchange'
import { detectLateWake } from '@shared/engine/lateWake'
import { fromYesterday, holidayQuestions, morningWarnings, sessionQuestions, shiftNotice, weeklyAnalysisMove, type MorningInputs } from '@shared/engine/morning'
import { copiedDay, copiedTemplate, draggedBlock, moveBetweenDays, movedBlock, newBlockStart, newUserBlock } from '@shared/engine/planEdit'
import { applyTypeChange, planTypeChange } from '@shared/engine/typeChange'
import { defaultTemplates, firstComputerRecords, settingsPatch } from '@shared/model/defaults'
import { DEFAULT_GENERAL, rdFrom } from '@shared/model/rd'
import { dayFileFrom, emptyDayFile, templateFor, templateFrom, type DayFile } from '@shared/model/plan'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom, settingsOn } from '@shared/model/settings'
import { block, hhmm, lm, Scenario } from './dsl'

const noHolidays = () => ({ closed: false, earlyClose: null, names: [] })

describe('typ dnia z przypisania tygodnia', () => {
  it('dzień bez wpisu w kalendarzu ma typ swojego dnia tygodnia; zmiana przypisania zmienia typ', () => {
    expect(defaultDayType('2026-10-21')).toBe('zwykly')
    expect(defaultDayType('2026-10-24')).toBe('weekend')
    const changes = [{ id: 'a', from: '2026-01-01', at: null, patch: { weekTypes: ['zwykly', 'zwykly', 'regeneracyjny', 'zwykly', 'zwykly', 'weekend', 'weekend'] } }]
    const snap = createDay({ date: '2026-10-21', changes, templates: [], lectures: [], dayFile: null, holidays: noHolidays, at: null })
    expect(snap.dayType).toBe('regeneracyjny')
    // A day marked in the calendar keeps its own type.
    const marked = createDay({ date: '2026-10-21', changes, templates: [], lectures: [], dayFile: { ...emptyDayFile('2026-10-21'), dayType: 'zjazd-zdalny' }, holidays: noHolidays, at: null })
    expect(marked.dayType).toBe('zjazd-zdalny')
  })
})

describe('odpowiedzi warstwy sesji po utworzeniu dnia', () => {
  const tpl = templateFrom({ id: 't', dayType: 'zwykly', versions: [{ from: '2026-01-01', blocks: [{ id: 'j', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30 }] }] })!
  const snap = createDay({ date: '2026-10-21', changes: [], templates: [tpl], lectures: [], dayFile: null, holidays: marketDay, at: null })

  it('„nie” zabiera sesję i blok do niej zakotwiczony', () => {
    const file: DayFile = { ...emptyDayFile('2026-10-21'), sessions: { ny: 'no' } }
    const plan = dayPlan(snap, file)
    expect(plan.some((b) => b.sourceId === 'ny')).toBe(false)
    expect(plan.some((b) => b.categoryId === 'journaling')).toBe(false)
    expect(plan.some((b) => b.sourceId === 'londyn')).toBe(true)
  })

  it('„tak” dodaje sesję, której dzień nie miał (dzień bez sesji)', () => {
    const weekend = createDay({ date: '2026-10-24', changes: [], templates: [], lectures: [], dayFile: null, holidays: marketDay, at: null })
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
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [tpl], lectures: [], dayFile: null, holidays: marketDay, at: null })
    const plan = dayPlan(snap, { ...emptyDayFile('2026-10-21'), wakeMin: lm('07:30') })
    const at = (src: string) => plan.find((b) => b.sourceId === src)?.startMin
    expect(at('r')).toBe(lm('07:30'))
    expect(at('a')).toBe(lm('08:30'))
    // The first fixed block is the London session at 08:00: the meal after it stays.
    expect(at('p')).toBe(lm('13:00'))
    expect(plan.find((b) => b.sourceId === 'londyn')?.startMin).toBe(lm('08:00'))
  })

  it('w tygodniu przesunięcia sesji poranek idzie o godzinę wcześniej, a pobudka ustawiona ręcznie wygrywa', () => {
    const snap = createDay({ date: '2026-10-27', changes: [], templates: [tpl], lectures: [], dayFile: null, holidays: marketDay, at: null })
    expect(snap.wakeMin).toBe(lm('05:00'))
    expect(dayPlan(snap, null).find((b) => b.sourceId === 'r')?.startMin).toBe(lm('05:00'))
    expect(dayPlan(snap, { ...emptyDayFile('2026-10-27'), wakeMin: lm('06:00') }).find((b) => b.sourceId === 'r')?.startMin).toBe(lm('06:00'))
  })
})

describe('sesje niezaczęte do końca czekania', () => {
  const plan = [
    block({ id: 'lo', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
    block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
    block({ id: 'dz', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })
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

  it('praca zaplanowana po drugiej zmianie nie odbiera im roli końca pracy', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [...plan, block({ id: 'late', cat: 'inne', at: '21:15', min: 30 })] })
    const st = s.state('18:00')
    expect(hhmm(st, st.firstEnd)).toBe('17:00')
    expect(st.hardEnd.unreachable).toBe(false)
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

  it('blok pracy po drugiej zmianie też kosztuje swoje minuty po granicy (otwiera pracę ponownie)', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [...plan, block({ id: 'dz', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })], settings: { transitionBufferMin: 0 } }).approve('12:45', '07:30')
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
    block({ id: 'dz', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })
  ]

  it('na dzień regeneracyjny: parkowanie elastycznych, stałe pojedynczo, maksimum i granica z nowego typu, minimum według regeneracji możliwej do zebrania, koniec pracy', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } }).approve('17:15', '07:30').ran('an', '08:00', '10:00')
    const ctx = s.contextAt(s.at('11:00'))
    const state = computeDay(ctx)
    const inp = { ctx, state, energyNow: null, to: 'regeneracyjny' as const, settings: s.settings, templates: [] }
    const p = planTypeChange(inp)
    expect(p.from).toBe('zwykly')
    expect(p.laterMax).toBe(false)
    expect(p.park.map((b) => b.id)).toEqual(['na'])
    expect(p.fixed.map((b) => b.id).sort()).toEqual(['dz', 'ny'])
    expect(p.minRegen.before).toBe(90)
    expect(p.minRegen.after).toBe(150)
    const r = applyTypeChange(inp, p, { park: ['na'], cancel: ['ny'], returnRequests: [], add: [] })
    expect(r.events.map((e) => e.k)).toEqual(['block.park', 'block.cancel', 'day.snapshot', 'boundary.approve', 'work.end'])
    expect(r.boundary).not.toBeNull()
    for (const e of r.events) s.raw({ ...e, at: s.at('11:00') }, '11:00')
    const after = s.state('11:05')
    expect(hhmm(after, after.boundary.max)).toBe('14:00')
    expect(hhmm(after, after.boundary.approved)).toBe('14:00')
    expect(after.regen.requiredMin).toBe(150)
    expect(hhmm(after, after.workEnd)).toBe('10:00')
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
    const snap = createDay({ date: '2026-11-27', changes, templates: [], lectures: [], dayFile: file, holidays: marketDay, at: null })
    expect(snap.blocks.some((b) => b.origin === 'session')).toBe(false)
    const rth = dayPlan(snap, { ...file, sessions: { rth: 'yes' } }).find((b) => b.sourceId === 'rth')!
    expect(rth.durationMin).toBe(210)
  })

  it('na typ z późniejszym maksimum: brakujące sesje i druga zmiana nowego typu do dodania, zaznaczone bez kosztu', () => {
    const s = new Scenario({ date: '2026-10-21', dayType: 'regeneracyjny', plan: [block({ id: 'sp', cat: 'regeneracja', at: '09:30', min: 30 })] })
    const ctx = s.contextAt(s.at('09:00'))
    const state = computeDay(ctx)
    const p = planTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: s.settings, templates: defaultTemplates() })
    expect(p.laterMax).toBe(true)
    const add = p.add.map((a) => [a.session ?? a.block.tag, a.checked])
    // London 08:00–11:00 runs by the plan already (from now), NY 14:00, the second shift 20:00 of the template.
    expect(add).toEqual(
      expect.arrayContaining([
        ['londyn', true],
        ['ny', true],
        ['secondShift', true]
      ])
    )
    const r = applyTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: s.settings, templates: defaultTemplates() }, p, { park: [], cancel: [], returnRequests: [], add: p.add.map((a) => a.block.id) })
    expect(r.sessionsYes.sort()).toEqual(['londyn', 'ny'])
    expect(r.blocks.map((b) => b.tag)).toEqual(['secondShift'])
    expect(r.events.find((e) => e.k === 'day.snapshot')).toMatchObject({ dayType: 'zwykly', minRegen: null })
  })
})

describe('późne wstanie', () => {
  const plan = [
    block({ id: 'ru', cat: 'rutyny', at: '06:00', min: 45 }),
    block({ id: 'po', cat: 'posilek', at: '06:45', min: 30 }),
    block({ id: 'an', cat: 'analiza', at: '07:30', min: 120 }),
    block({ id: 'na', cat: 'inne', at: '10:00', min: 240 })
  ]

  it('pierwsze użycie ponad 30 min po końcu rutyny: przesunięcie rutyn i posiłków, skrócenie pracy do granicy', () => {
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } }).presence('08:30')
    const ctx = s.contextAt(s.at('08:31'))
    const lw = detectLateWake(ctx, computeDay(ctx), null)!
    expect(lw).not.toBeNull()
    expect(lw.delayMin).toBe(105)
    expect(lw.shifts.map((x) => [x.block.id, x.toStartMin])).toEqual([
      ['ru', lm('07:45')],
      ['po', lm('08:30')]
    ])
    // The routine done by the first use, the meal 08:30–09:00 after it; from 08:31 the meal, the analysis to 11:01, the
    // duties to 15:01 – the plan's proposal was 14:15: the duties 46 min shorter.
    expect(lw.shortens.map((x) => [x.block.id, x.toMin])).toEqual([['na', 194]])
    expect(lw.parks).toEqual([])
  })

  it('nie pyta: w porę, po planie porannym, w zjazd stacjonarny, po odpowiedzi', () => {
    const early = new Scenario({ date: '2026-10-21', plan }).presence('07:10')
    const c1 = early.contextAt(early.at('07:11'))
    expect(detectLateWake(c1, computeDay(c1), null)).toBeNull()
    const planned = new Scenario({ date: '2026-10-21', plan }).approve('14:15', '06:30').presence('08:30')
    const c2 = planned.contextAt(planned.at('08:31'))
    expect(detectLateWake(c2, computeDay(c2), null)).toBeNull()
    const zjazd = new Scenario({ date: '2026-10-21', dayType: 'zjazd-stacjonarny', plan }).presence('08:30')
    const c3 = zjazd.contextAt(zjazd.at('08:31'))
    expect(detectLateWake(c3, computeDay(c3), null)).toBeNull()
    const answered = new Scenario({ date: '2026-10-21', plan }).presence('08:30')
    const c4 = answered.contextAt(answered.at('08:31'))
    expect(detectLateWake(c4, computeDay(c4), { ...emptyDayFile('2026-10-21'), asked: { lateWake: 'no' } })).toBeNull()
  })

  it('w czasie sesji propozycja czeka do jej końca', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [...plan, block({ id: 'lo', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' })] }).presence('08:30')
    const ctx = s.contextAt(s.at('08:31'))
    expect(detectLateWake(ctx, computeDay(ctx), null)?.waitUntilMin).toBe(lm('11:00'))
  })
})

describe('plan poranny', () => {
  const inputs = (date: string, files: Record<string, DayFile> = {}): MorningInputs => ({
    date,
    changes: [],
    templates: defaultTemplates(),
    lectures: [],
    holidays: marketDay,
    files: (d) => files[d] ?? null
  })

  it('bloki z wczoraj', () => {
    const b = movedBlock(block({ id: 'x', cat: 'analiza', at: '09:00', min: 60, origin: 'user' }), [], '2026-10-20', true)
    expect(fromYesterday([b], '2026-10-21').map((x) => x.id)).toEqual(['x'])
    expect(b.moves).toBe(1)
  })

  it('pytania warstwy sesji „pytaj” bez odpowiedzi', () => {
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], dayFile: { ...emptyDayFile('2026-10-21'), dayType: 'zjazd-zdalny' }, holidays: marketDay, at: null })
    expect(sessionQuestions(snap, null, '2026-10-21').map((s) => s.id)).toEqual(['londyn', 'ny'])
    expect(sessionQuestions(snap, { ...emptyDayFile('2026-10-21'), sessions: { ny: 'yes' } }, '2026-10-21').map((s) => s.id)).toEqual(['londyn'])
  })

  it('tydzień przed świętem w USA: raz pyta o sesje i drugą zmianę; przy skróconej sesji o drugą zmianę z godziną zamknięcia', () => {
    const q = holidayQuestions(inputs('2026-11-20'))
    expect(q.map((x) => x.text)).toEqual(['26.11 święto w USA — sesja Londyn i sesja NY i druga zmiana?', '27.11 CME zamyka o 19:15 — druga zmiana 20:00?'])
    const asked = holidayQuestions(inputs('2026-11-20', { '2026-11-26': { ...emptyDayFile('2026-11-26'), asked: { holiday: 'done' } } }))
    expect(asked.map((x) => x.date)).toEqual(['2026-11-27'])
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

  it('ostrzeżenia: praca po maksimum, minimum regeneracji, pora snu nie później niż koniec drugiej zmiany', () => {
    const s = new Scenario({ date: '2026-10-21', plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 13 * 60 }), block({ id: 'dz', cat: 'sesja', at: '21:30', min: 60, fixed: true, tag: 'secondShift' })] })
    const w = morningWarnings(s.state('07:00'))
    expect(w).toEqual(expect.arrayContaining(['max', 'minimum', 'bedtimeSecondShift', 'budget']))
  })

  it('sobota zjazdem: w piątek analiza tygodniowa 20:00–21:00 w miejsce drugiej zmiany, pytana raz', () => {
    const files = { '2026-10-24': { ...emptyDayFile('2026-10-24'), dayType: 'zjazd-stacjonarny' as const } }
    const m = weeklyAnalysisMove(inputs('2026-10-23', files), '2026-10-23')!
    expect(m.analysis).toMatchObject({ categoryId: 'analiza', startMin: lm('20:00'), durationMin: 60, tag: 'secondShift' })
    expect(m.secondShift).not.toBeNull()
    expect(weeklyAnalysisMove(inputs('2026-10-23', { ...files, '2026-10-23': { ...emptyDayFile('2026-10-23'), asked: { weeklyAnalysisMove: 'no' } } }), '2026-10-23')).toBeNull()
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
    const snap = createDay({ date: '2026-10-21', changes: [], templates: [], lectures: [], dayFile: null, holidays: noHolidays, at: null })
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
  it('zapisuje różnicę ustawień, szablony z drugą zmianą i analizą sobotnią, dni z kalendarza; dzień liczy się z nich', () => {
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
    const wed = createDay({ date: '2026-10-21', changes: rd.settings, templates, lectures: [], dayFile: null, holidays: marketDay, at: null })
    expect(wed.budgetMin).toBe(480)
    expect(wed.blocks.find((b) => b.tag === 'secondShift')).toMatchObject({ startMin: lm('20:00'), durationMin: 60, fixed: true })
    const sat = createDay({ date: '2026-10-24', changes: rd.settings, templates, lectures: [], dayFile: null, holidays: marketDay, at: null })
    expect(sat.blocks.find((b) => b.tag === 'weeklyAnalysis')).toMatchObject({ startMin: lm('09:00'), waitUntilMin: lm('15:00') })
    const zjazd = createDay({ date: '2026-10-31', changes: rd.settings, templates, lectures: [], dayFile: dayFileFrom(records[3]!.value, '2026-10-31'), holidays: marketDay, at: null })
    expect(zjazd.dayType).toBe('zjazd-stacjonarny')
  })
})
