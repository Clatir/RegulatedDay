/**
 * The week (D356): one count of a day gives its column – type, blocks on the axis (the plan; days gone by – as it was),
 * the boundary kept or not, the regeneration against its minimum – and its measures of the month's goals: minutes of
 * study, trading sessions without an extension and outside the plan. A day gone by counts as its grade counts it (a
 * frozen one by its stored grade, up to the events its freeze named), today live, a day to come from its plan.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf } from '@shared/engine/context'
import { horizonDay, sessionsOf, unknownDay, weekDates, weekViewOf, whenOf, type HorizonDay } from '@shared/engine/week'
import { computeDay } from '@shared/engine/day'
import { dayFileFrom, planBlock, type Template } from '@shared/model/plan'
import { RULES_VERSION, type AnyEvent } from '@shared/model/events'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { dayEnd, placeLogical } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const PAST = '2026-11-03'

/** A Tuesday gone by: work 08:05–09:00 („Koniec pracy”), study 10:00–11:10, a block never begun, study begun outside the plan, a lecture watched. */
function pastDay(): Scenario {
  const s = new Scenario({
    date: PAST,
    plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '10:00', min: 60 }), block({ id: 'm', cat: 'inne', at: '12:00', min: 30 }), block({ id: 'o', cat: 'ogladanie', at: '18:00', min: 30 })],
    settings: { transitionBufferMin: 0 }
  })
  s.presence('07:30').using('07:30', '21:00').approve('17:00', '07:40')
  s.ran('a', '08:05', '09:00').workEnd('09:00')
  s.ran('n', '10:00', '11:10')
  s.ran('x', '13:00', '13:20', { cat: 'nauka', min: 20 })
  s.ran('o', '18:00', '18:30')
  return s
}

const pastCtx = (s: Scenario) => s.contextAt(dayEnd(PAST) + 3_600_000)

describe('dzień miniony – jak było', () => {
  it('bloki tam, gdzie biegły; niezaczęty – „minął”; zaczęty poza planem – osobno; nauka i oglądanie wykładu', () => {
    const d = horizonDay(pastCtx(pastDay()), 'past')
    expect(d).toMatchObject({ date: PAST, when: 'past', read: 'full', dayType: 'zwykly', frozen: false, boundary: 'kept', extensionMin: 0 })
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b]))
    expect(by.a).toMatchObject({ state: 'ran', startMin: lm('08:05'), endMin: lm('09:00'), outsidePlan: false, categoryId: 'inne' })
    expect(by.n).toMatchObject({ state: 'ran', startMin: lm('10:00'), endMin: lm('11:10') })
    expect(by.m).toMatchObject({ state: 'missed', startMin: lm('12:00'), endMin: lm('12:30') })
    expect(by.x).toMatchObject({ state: 'ran', outsidePlan: true, startMin: lm('13:00'), endMin: lm('13:20'), named: { categoryId: 'nauka' } })
    // Ordered by the hour.
    expect(d.blocks.map((b) => b.id)).toEqual(['a', 'n', 'm', 'x', 'o'])
    // Study: 70 + 20 + 30 min (no class, lecture nor „zjazd” among them).
    expect(d.studyMin).toBe(120)
    expect(d.wakeMin).toBe(lm('06:00'))
    expect(d.sessions).toEqual({ clean: 0, extended: 0, outsidePlan: 0 })
  })

  it('regeneracja wobec minimum – tak, jak policzy ją ocena (jak zapisano, do końca dnia)', () => {
    const s = pastDay()
    const d = horizonDay(pastCtx(s), 'past')
    const graded = computeDay({ ...s.contextAt(dayEnd(PAST)), now: dayEnd(PAST), asWritten: true })
    expect(d.regen).toEqual({ towardMin: graded.regen.towardMinMin, requiredMin: 90, reached: graded.regen.towardMinMin >= 90 })
  })

  it('granica złamana: praca po zatwierdzonej granicy (przedłużenie)', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '12:00').approve('08:30', '07:40').ran('a', '08:00', '09:00').workEnd('09:00')
    const d = horizonDay(pastCtx(s), 'past')
    expect(d.boundary).toBe('broken')
    expect(d.extensionMin).toBe(30)
  })

  it('dzień bez Twojej obecności – wolny (poza „x z y”), jak go zamrozi ocena; bez pomiaru regeneracji (jak „Strona B”)', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', after: 'a', min: 30 })] })
    // Not a single event: the plan, nothing begun – without the full count of the day.
    const quiet = horizonDay(pastCtx(s), 'past')
    expect(quiet).toMatchObject({ boundary: 'free', regen: null, studyMin: 0, dayType: 'zwykly', wakeMin: lm('06:00') })
    expect(quiet.blocks.map((b) => [b.id, b.state, b.startMin, b.endMin])).toEqual([
      ['a', 'missed', lm('08:00'), lm('09:00')],
      ['b', 'missed', lm('09:00'), lm('09:30')]
    ])
    // Events without your presence (another computer's observation): the same, counted in full.
    s.observe('10:00', '10:05', 'pcb')
    const counted = horizonDay(pastCtx(s), 'past')
    expect(counted).toMatchObject({ boundary: 'free', regen: null })
    expect(counted.blocks.map((b) => [b.id, b.state, b.startMin, b.endMin])).toEqual(quiet.blocks.map((b) => [b.id, b.state, b.startMin, b.endMin]))
  })

  it('zjazd stacjonarny bez obecności: plan jest zapisem – nie wolny, z regeneracją', () => {
    const s = new Scenario({ date: PAST, dayType: 'zjazd-stacjonarny', plan: [block({ id: 'z', cat: 'dojazd', at: '08:00', min: 480, fixed: true })] })
    const d = horizonDay(pastCtx(s), 'past')
    expect(d.boundary).not.toBe('free')
    expect(d.regen).not.toBeNull()
  })

  it('dzień zamrożony: granica, przedłużenie i regeneracja z zapisanej oceny, zdarzenia tylko do tych, które ocena policzyła', () => {
    const s = pastDay()
    // The freeze counted the events up to the end of „n” (the study outside the plan and the lecture came after it).
    const lastCounted = s.events.find((e) => e.k === 'block.end' && (e as { block?: string }).block === 'n')!.n
    const grade = { boundary: 'noData', free: false, extensionMin: 0, regen: { towardMin: 40, requiredMin: 90, reached: false, counts: true } }
    const d = horizonDay(pastCtx(s), 'past', { know: { pca: lastCounted }, grade })
    expect(d).toMatchObject({ frozen: true, boundary: 'noData', regen: { towardMin: 40, requiredMin: 90, reached: false } })
    expect(d.studyMin).toBe(70)
    // The axis as the day's plan shows it: also what came after the freeze („poza oceną” – not in its measures).
    expect(d.blocks.find((b) => b.id === 'x')).toMatchObject({ state: 'ran', outsidePlan: true })
    expect(d.blocks.find((b) => b.id === 'o')).toMatchObject({ state: 'ran' })
    // After the freeze only bookkeeping (a question seen, the freeze itself): the axis is the counted day.
    const cut = new Scenario(s.opts)
    cut.events.push(...s.events.filter((e) => e.n <= lastCounted))
    const t = s.at('23:00')
    const late = { c: 'pca', t, l: t, v: RULES_VERSION, day: PAST, at: t }
    cut.events.push({ ...late, id: 'seen', n: lastCounted + 50, dom: 'timer', k: 'question.seen', question: 'q1', how: 'main' } as unknown as AnyEvent)
    cut.events.push({ ...late, id: 'freeze', n: lastCounted + 51, dom: 'game', k: 'day.freeze', how: 'ready', know: { pca: lastCounted }, missing: [], grade } as unknown as AnyEvent)
    const axis = horizonDay(pastCtx(cut), 'past', { know: { pca: lastCounted }, grade }).blocks
    expect(axis.map((b) => b.id)).not.toContain('x')
    expect(axis.find((b) => b.id === 'o')).toMatchObject({ state: 'missed' })
  })

  it('nauka, której nikt nie zakończył: do planowanego końca (jak na osi), nie do 04:00', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'n', cat: 'nauka', at: '22:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '23:30').start('n', '22:00')
    const d = horizonDay(pastCtx(s), 'past')
    expect(d.blocks.find((b) => b.id === 'n')).toMatchObject({ state: 'ran', startMin: lm('22:00'), endMin: lm('23:00') })
    expect(d.studyMin).toBe(60)
  })

  it('blok zapauzowany i niezakończony: do końca ostatniego przebiegu (nie do planowanego końca z całą pauzą)', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'n', cat: 'nauka', at: '10:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '12:00').start('n', '10:00').pause('n', '10:30')
    const d = horizonDay(pastCtx(s), 'past')
    expect(d.blocks.find((b) => b.id === 'n')).toMatchObject({ state: 'ran', startMin: lm('10:00'), endMin: lm('10:30') })
    expect(d.studyMin).toBe(30)
  })

  it('ocena bez pola (starsza): to pole policzone od nowa', () => {
    const s = pastDay()
    const d = horizonDay(pastCtx(s), 'past', { know: { pca: s.events.at(-1)!.n }, grade: { free: false } })
    expect(d.boundary).toBe('kept')
    expect(d.regen?.requiredMin).toBe(90)
  })
})

describe('dziś – na żywo', () => {
  it('biegnący blok do teraz, dalsze według prognozy, zaparkowany osobno; granica „w toku”; nauka do teraz', () => {
    const date = '2026-11-04'
    const s = new Scenario({
      date,
      plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '10:00', min: 120 }), block({ id: 'm', cat: 'inne', at: '13:00', min: 30 }), block({ id: 'p', cat: 'inne', at: '15:00', min: 30 })],
      settings: { transitionBufferMin: 0 }
    })
    s.presence('07:30').using('07:30', '11:30').approve('17:00', '07:40').ran('a', '08:00', '09:00').start('n', '10:00')
    s.raw({ k: 'block.park', block: 'p', at: s.at('09:30'), rule: 'user' }, '09:30')
    const d = horizonDay(s.contextAt(s.at('11:30')), 'today')
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b]))
    expect(d).toMatchObject({ when: 'today', boundary: 'open', frozen: false })
    expect(by.a).toMatchObject({ state: 'ran', endMin: lm('09:00') })
    expect(by.n).toMatchObject({ state: 'running', startMin: lm('10:00'), endMin: lm('12:00') })
    expect(by.m).toMatchObject({ state: 'planned' })
    expect(by.m!.startMin).toBeGreaterThanOrEqual(lm('12:00'))
    expect(by.p).toMatchObject({ state: 'parked', startMin: lm('15:00') })
    expect(d.studyMin).toBe(90)
    const now = computeDay(s.contextAt(s.at('11:30')))
    expect(d.regen).toEqual({ towardMin: now.regen.towardMinMin, requiredMin: 90, reached: false })
  })

  it('blok zapauzowany dziś: „zapauzowany”, do końca ostatniego przebiegu – nie „trwa” do teraz', () => {
    const s = new Scenario({ date: '2026-11-04', plan: [block({ id: 'n', cat: 'nauka', at: '10:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '11:30').start('n', '10:00').pause('n', '10:30')
    const d = horizonDay(s.contextAt(s.at('11:30')), 'today')
    expect(d.blocks.find((b) => b.id === 'n')).toMatchObject({ state: 'paused', startMin: lm('10:00'), endMin: lm('10:30') })
    expect(d.studyMin).toBe(30)
    // Resumed: running again, up to now.
    s.resume('n', '11:00')
    expect(horizonDay(s.contextAt(s.at('11:30')), 'today').blocks.find((b) => b.id === 'n')).toMatchObject({ state: 'running', endMin: lm('11:30') })
  })

  it('dziś zamknięte rytuałem: granica z wyniku dnia, nie „w toku”', () => {
    const date = '2026-11-04'
    const day = (boundary: string) => {
      const s = new Scenario({ date, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })], settings: { transitionBufferMin: 0 } })
      s.presence('07:30').using('07:30', '21:00').approve(boundary, '07:40').ran('a', '08:00', '09:00').workEnd('09:00')
      return s
    }
    const open = day('17:00')
    expect(horizonDay(open.contextAt(open.at('21:00')), 'today').boundary).toBe('open')
    open.raw({ k: 'ritual.close', at: open.at('21:00'), how: 'ritual' }, '21:00')
    expect(horizonDay(open.contextAt(open.at('21:01')), 'today').boundary).toBe('kept')
    const late = day('08:30')
    late.raw({ k: 'ritual.close', at: late.at('21:00'), how: 'asWritten' }, '21:00')
    expect(horizonDay(late.contextAt(late.at('21:01')), 'today')).toMatchObject({ boundary: 'broken', extensionMin: 30 })
  })

  it('dzień wolny dziś: „wolny”, nie „w toku”', () => {
    const s = new Scenario({ date: '2026-11-04', dayType: 'wolne', plan: [] })
    s.presence('09:00')
    expect(horizonDay(s.contextAt(s.at('10:00')), 'today').boundary).toBe('free')
  })
})

/** A „zjazd” Saturday's template: commute 07:00, classes 08:00–16:00. */
const zjazd: Template = {
  id: 'zjazd',
  name: 'Zjazd',
  dayType: 'zjazd-stacjonarny',
  weekdays: [],
  archived: false,
  versions: [
    {
      from: '2026-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'dj', categoryId: 'dojazd', variantId: 'dojazd', startMin: 7 * 60, durationMin: 60, fixed: true, origin: 'template' }),
        planBlock({ id: 'zaj', categoryId: 'dojazd', variantId: 'zajecia', startMin: 8 * 60, durationMin: 8 * 60, fixed: true, origin: 'template' })
      ]
    }
  ]
}

const NOW = placeLogical('2026-11-04', 11 * 60 + 30)

describe('dzień przyszły – z planu', () => {
  it('zjazd zaznaczony w kalendarzu: typ dnia i bloki szablonu zjazdu; bez granicy, minimum bez prognozy przeszłości', () => {
    const date = '2026-11-07'
    const ctx = dayContextOf({ changes: [], templates: [zjazd], lectures: [] }, { date, events: [], dayFile: dayFileFrom({ schema: 1, date, dayType: 'zjazd-stacjonarny' }, date), nextFile: null }, marketDay, NOW)
    const d = horizonDay(ctx, 'future')
    expect(d).toMatchObject({ when: 'future', dayType: 'zjazd-stacjonarny', boundary: null, extensionMin: 0, studyMin: 0, sessions: { clean: 0, extended: 0, outsidePlan: 0 } })
    // A template's blocks have ids derived for the day: told by what names them.
    expect(d.blocks.map((b) => [b.categoryId, b.named.variantId, b.state, b.startMin, b.endMin])).toEqual([
      ['dojazd', 'dojazd', 'planned', 7 * 60, 8 * 60],
      ['dojazd', 'zajecia', 'planned', 8 * 60, 16 * 60]
    ])
    expect(d.regen).toMatchObject({ towardMin: 0, requiredMin: DEFAULT_SETTINGS.dayTypes['zjazd-stacjonarny'].minRegenMin, reached: false })
  })

  it('zwykły dzień roboczy: sesje warstwy (Londyn, NY) w planie, nazwane jak wszędzie (skąd pochodzą)', () => {
    const date = '2026-11-05'
    const ctx = dayContextOf({ changes: [], templates: [], lectures: [] }, { date, events: [], dayFile: null, nextFile: null }, marketDay, NOW)
    const d = horizonDay(ctx, 'future')
    expect(d.dayType).toBe('zwykly')
    expect(d.blocks.map((b) => [b.named.origin, b.named.sourceId, b.state])).toEqual([
      ['session', 'londyn', 'planned'],
      ['session', 'ny', 'planned']
    ])
    expect(d.blocks[0]).toMatchObject({ startMin: 8 * 60, endMin: 11 * 60 })
  })

  it('dzień wolny w przyszłości: „wolny”', () => {
    const date = '2026-11-06'
    const ctx = dayContextOf({ changes: [], templates: [], lectures: [] }, { date, events: [], dayFile: dayFileFrom({ schema: 1, date, dayType: 'wolne' }, date), nextFile: null }, marketDay, NOW)
    expect(horizonDay(ctx, 'future').boundary).toBe('free')
  })
})

describe('sesje tradingowe – bez przedłużenia, poza planem', () => {
  /** London 08:00–11:00 and NY 14:00–17:00 of the layer, the second shift 20:00–21:00 of the template. */
  const sessions = () => [
    block({ id: 'lon', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
    block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
    block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })
  ]
  const approve = (s: Scenario, plan: string[]) => s.raw({ k: 'boundary.approve', at: s.at('07:40'), boundary: s.at('17:15'), auto: false, plan }, '07:40')

  it('z planu: w oknie – bez przedłużenia; z „Przedłuż” – z przedłużeniem; dodana po zatwierdzeniu i zaczęta poza planem – poza planem', () => {
    const extra = block({ id: 'extra', cat: 'sesja', at: '18:00', min: 60, origin: 'user' })
    const s = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:00')
    approve(s, ['lon', 'ny', 'ds'])
    s.ran('lon', '08:10', '10:30')
    s.start('ny', '14:00').extend('ny', 30, '16:55').end('ny', '17:30')
    s.ran('extra', '18:00', '19:00', { cat: 'sesja', min: 60 })
    s.ran('adhoc', '19:10', '19:40', { cat: 'sesja', min: 30 })
    s.ran('ds', '20:00', '21:00')
    const ctx = { ...pastCtx(s), plan: [...s.opts.plan, extra] }
    expect(horizonDay(ctx, 'past').sessions).toEqual({ clean: 2, extended: 1, outsidePlan: 2 })
  })

  it('przedłużenie to „Przedłuż” albo bieg po planowanym końcu, jak go liczy silnik – nie wcześniejszy start drugiej zmiany', () => {
    const s = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:00')
    // Begun 10 min early, ended with its window: no minute after its planned end.
    s.ran('ds', '19:50', '21:00')
    expect(horizonDay(pastCtx(s), 'past').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 0 })
    // Run on past the window without „Przedłuż”: with an extension.
    const over = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    over.presence('07:30').using('07:30', '22:00').ran('ds', '20:00', '21:10')
    expect(horizonDay(pastCtx(over), 'past').sessions).toEqual({ clean: 0, extended: 1, outsidePlan: 0 })
  })

  it('sesja niestała z planu: zaczęta 5 min później i trwająca planowaną długość – bez przedłużenia; dłużej – z przedłużeniem', () => {
    const plan = [block({ id: 'h', cat: 'sesja', at: '15:00', min: 60, origin: 'user' })]
    const late = new Scenario({ date: PAST, plan, settings: { transitionBufferMin: 0 } })
    late.presence('07:30').using('07:30', '22:00').ran('h', '15:05', '16:05')
    expect(horizonDay(pastCtx(late), 'past').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 0 })
    const long = new Scenario({ date: PAST, plan, settings: { transitionBufferMin: 0 } })
    long.presence('07:30').using('07:30', '22:00').ran('h', '15:05', '16:20')
    expect(horizonDay(pastCtx(long), 'past').sessions).toEqual({ clean: 0, extended: 1, outsidePlan: 0 })
  })

  it('sesja z migawki zdjęta z planu po starcie (D336) – poza planem, jak na osi', () => {
    const s = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:00').ran('lon', '08:00', '09:00')
    // „Usuń” of the begun block: out of the day's plan, its run stays in the day.
    const ctx = { ...pastCtx(s), plan: s.opts.plan.filter((b) => b.id !== 'lon') }
    const d = horizonDay(ctx, 'past')
    expect(d.blocks.find((b) => b.id === 'lon')).toMatchObject({ outsidePlan: true })
    expect(d.sessions).toEqual({ clean: 0, extended: 0, outsidePlan: 1 })
  })

  it('bez zatwierdzenia z listą bloków: sesja w planie dnia jest z planu', () => {
    const extra = block({ id: 'extra', cat: 'sesja', at: '18:00', min: 60, origin: 'user' })
    const s = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:00').ran('extra', '18:00', '19:00', { cat: 'sesja', min: 60 })
    expect(horizonDay({ ...pastCtx(s), plan: [...s.opts.plan, extra] }, 'past').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 0 })
  })

  it('obowiązujące zatwierdzenie to ostatnie: zmiana typu w południe (zatwierdzenie bez listy bloków) – sesja dodana po niej jest z planu', () => {
    const extra = block({ id: 'extra', cat: 'sesja', at: '18:00', min: 60, origin: 'user' })
    const s = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '22:00')
    approve(s, ['lon', 'ny', 'ds'])
    // The change of type at noon approves the boundary again without naming the blocks.
    s.raw({ k: 'boundary.approve', at: s.at('12:00'), boundary: s.at('19:15'), auto: false }, '12:00')
    s.ran('extra', '18:00', '19:00', { cat: 'sesja', min: 60 })
    const ctx = { ...pastCtx(s), plan: [...s.opts.plan, extra] }
    expect(horizonDay(ctx, 'past').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 0 })
    // The approval with its list opened again by „Cofnij”: none in force – the plan as it is.
    const undone = new Scenario({ date: PAST, plan: sessions(), settings: { transitionBufferMin: 0 } })
    undone.presence('07:30').using('07:30', '22:00')
    approve(undone, ['lon', 'ny', 'ds'])
    undone.raw({ k: 'boundary.undo', at: undone.at('12:00') }, '12:00').ran('extra', '18:00', '19:00', { cat: 'sesja', min: 60 })
    expect(horizonDay({ ...pastCtx(undone), plan: [...undone.opts.plan, extra] }, 'past').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 0 })
  })

  it('dziś: biegnąca sesja jeszcze się nie liczy; zaczęta poza planem – od razu', () => {
    const date = '2026-11-04'
    const s = new Scenario({ date, plan: sessions(), settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '15:00')
    approve(s, ['lon', 'ny', 'ds'])
    s.ran('lon', '08:00', '11:00').start('ny', '14:00').ran('adhoc', '12:00', '12:30', { cat: 'sesja', min: 30 })
    const ctx = s.contextAt(s.at('15:00'))
    expect(horizonDay(ctx, 'today').sessions).toEqual({ clean: 1, extended: 0, outsidePlan: 1 })
    expect(sessionsOf(ctx, computeDay(ctx), 'future')).toEqual({ clean: 0, extended: 0, outsidePlan: 0 })
  })
})

describe('tydzień', () => {
  const day = (date: string, o: Partial<HorizonDay> = {}): HorizonDay => ({ ...unknownDay(date, 'past'), read: 'full', dayType: 'zwykly', wakeMin: 6 * 60, bedtimeMin: 22 * 60, ...o })

  it('siedem dni od poniedziałku; dzień, którego nie podano – nieznany; wspólna oś godzin', () => {
    expect(weekDates('2026-11-02')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect([whenOf('2026-11-03', '2026-11-04'), whenOf('2026-11-04', '2026-11-04'), whenOf('2026-11-05', '2026-11-04')]).toEqual(['past', 'today', 'future'])
    const w = weekViewOf('2026-11-02', '2026-11-04', [
      day('2026-11-03', { wakeMin: 5 * 60 }),
      day('2026-11-02'),
      day('2026-11-06', { when: 'future', bedtimeMin: 23 * 60, blocks: [{ id: 'b', named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '' }, categoryId: 'inne', startMin: 23 * 60, endMin: 24 * 60 + 30, state: 'planned', outsidePlan: false, background: false }] })
    ])
    expect(w.days.map((d) => [d.date, d.read])).toEqual([
      ['2026-11-02', 'full'],
      ['2026-11-03', 'full'],
      ['2026-11-04', 'unknown'],
      ['2026-11-05', 'unknown'],
      ['2026-11-06', 'full'],
      ['2026-11-07', 'unknown'],
      ['2026-11-08', 'unknown']
    ])
    expect(w.days[3]!.when).toBe('future')
    expect([w.from, w.to]).toEqual([4 * 60 + 30, 24 * 60 + 30])
    // Without anything early or late: 06:00–22:00 at least.
    expect([weekViewOf('2026-11-02', '2026-11-04', []).from, weekViewOf('2026-11-02', '2026-11-04', []).to]).toEqual([6 * 60, 22 * 60])
  })
})
