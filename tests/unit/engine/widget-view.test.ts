/**
 * The widget's view from the engine (E4b; spec „Widget”, „Cisza”, „Odcinam się”, „Woda”, D225, D232, D240): the colour by
 * the block's class, the steps 15 · 5 · 0 min, the dot only for what waits for a click, „Odcinam się” hides the widget,
 * the quiet modes, the night's quiet, the water, the break after 90 min, the list of automatic actions.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions } from '@shared/engine/auto'
import { requestAction } from '@shared/engine/requests'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { fewerAt } from '@shared/engine/modes'
import { engineView, HARD_END_TEXT, warnDeadlines } from '@shared/engineView'
import { stepDelay, toneOnChange } from '../../../src/main/widget'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const care = { waterOn: true, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }

function view(s: Scenario, time: string, o: { sessionMode?: boolean } = {}) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (b) => ({ inne: 'Inne obowiązki', sesja: 'Sesja tradingowa', posilek: 'Posiłek', 'zajecia-zdalne': 'Zajęcia zdalne', regeneracja: 'Regeneracja' })[b.categoryId] ?? b.categoryId, care, modePrefs: { sessionMode: o.sessionMode ?? true, classMode: true }, pending: null })
}

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

function leader(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  s.write(autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }), t)
}

describe('widok paska z silnika', () => {
  it('kolor klasy bloku, kroki 15 · 5 · 0 min przed końcem, Start następnego bloku bez bloku', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })] }).observe('07:00', null)
    expect(view(s, '07:50')).toMatchObject({ tone: 'brak', block: null, buttons: { start: 'Start: Inne obowiązki', next: false } })
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(view(s, '08:30')).toMatchObject({ tone: 'praca', warn: 'none', block: { name: 'Inne obowiązki', className: 'praca' }, buttons: { next: true, pause: true, workEnd: true, start: null } })
    expect(view(s, '08:46').warn).toBe('warm')
    expect(view(s, '08:56').warn).toBe('five')
    expect(view(s, '09:00').warn).toBe('zero')
    click(s, '09:00', { a: 'next' })
    click(s, '13:00', { a: 'start', block: 'm' })
    expect(view(s, '13:05').tone).toBe('zycie')
  })

  it('trwająca prośba w miejscu bloku, przerwany blok cichą linią bez kropki i bez „Wznów · Zaparkuj” (D312, D247)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const t = s.at('08:30')
    const r = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: 'mama', urgent: true, estimateMin: 30 }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    const named = (time: string) => {
      const at = s.at(time)
      const ctx = s.contextAt(at)
      const state = s.stateAt(at)
      return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, at, 'pca'), now: at, name: () => 'Inne obowiązki', care, modePrefs: { sessionMode: true, classMode: true }, pending: null, person: (id) => (id === 'mama' ? 'Mama' : (id ?? 'osoba: ?')) })
    }
    const v = named('08:42')
    expect(v.requests.running).toMatchObject({ id: 'r1', day: DATE, mode: 'urgent', person: 'Mama', from: s.at('08:30'), estimateMin: 30 })
    expect(v.requests.interrupted).toBe('Inne obowiązki – pauza, wróci po „Koniec”')
    expect(v.lines.some((l) => l.id === 'paused:a')).toBe(false)
    expect(v.buttons.start).toBeNull()
    expect(v.dot).toBe(false)
    // Resumed from the main window meanwhile: it waits for nothing – no line.
    expect(click(s, '08:45', { a: 'start', block: 'a' }).ok).toBe(true)
    expect(named('08:46').requests.interrupted).toBeNull()
    // Without a person: „osoba: ?”.
    const t2 = s.at('08:50')
    const end = requestAction(s.stateAt(t2), { a: 'requestEnd', request: 'r1' }, t2)
    if (!end.ok) throw new Error(end.why)
    s.write(end.events, t2)
    const n = requestAction(s.stateAt(s.at('09:00')), { a: 'requestNow', request: 'r2', person: null }, s.at('09:00'))
    if (!n.ok) throw new Error(n.why)
    s.write(n.events, s.at('09:00'))
    expect(named('09:01').requests.running).toMatchObject({ id: 'r2', mode: 'now', person: 'osoba: ?', estimateMin: null })
  })

  it('„Rytuał” w pasku po końcu pracy – także w „Odcinam się”, nie przed pierwszym dniem rytuału (D318, T505)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    const at = (time: string, ritualFrom: string | null) => {
      const t = s.at(time)
      const ctx = s.contextAt(t)
      const state = s.stateAt(t)
      return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Inne obowiązki', care, modePrefs: { sessionMode: true, classMode: true }, pending: null, ritualFrom })
    }
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(at('08:30', DATE).ritual).toBe(false)
    click(s, '09:00', { a: 'workEnd' })
    expect(at('09:05', DATE).ritual).toBe(true)
    expect(at('09:05', '2026-10-29').ritual).toBe(false)
    click(s, '19:00', { a: 'cutOff' })
    expect(at('19:05', DATE)).toMatchObject({ hidden: true, ritual: true })
  })

  it('kolory paska, ikony i panelu z zestawu „cieplejsze” (D314)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(view(s, '08:30')).toMatchObject({ toneSet: 'cieple', color: '#E8A15A', iconColor: '#E8A15A' })
  })

  it('kropka tylko przy tym, co czeka na kliknięcie: „Dalej?” i „Zacznij · Odwołaj”; lista automatyczna z „Cofnij”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, bg: false })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(view(s, '08:30').dot).toBe(false)
    const v = view(s, '09:05')
    expect(v.dot).toBe(true)
    expect(v.question).toMatchObject({ text: 'Dalej?' })
    click(s, '09:10', { a: 'next' })
    leader(s, '09:11')
    const at = view(s, '15:35')
    expect(at.lines.find((l) => l.id === 'wait:ny')).toMatchObject({ text: 'Sesja tradingowa 15:30', dot: true })
    expect(at.autos.items.map((i) => i.text)).toContain('granica zatwierdzona sama o 08:00 (start pierwszego bloku pracy)')
    // The session waiting for „Zacznij” is the session mode: the bar compact (quiet), the icon darker.
    expect(at.quiet).toBe(true)
    expect(view(s, '15:35', { sessionMode: false }).quiet).toBe(false)
  })

  it('„Zrobione automatycznie” (D350): działania zgodne z planem w grupie, każde z „Cofnij”; pauza bloku elastycznego przy starcie stałego osobnym wierszem z „Cofnij”', () => {
    const s = new Scenario({
      date: DATE,
      plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'w1', cat: 'zajecia-zdalne', at: '08:30', min: 60, fixed: true, bg: true }), block({ id: 'w2', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true, bg: false })]
    }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    for (const time of ['08:30', '09:00', '09:30']) leader(s, time)
    const { groups, items } = view(s, '09:35').autos
    // The group of what went as the plan said: two fixed starts and an end by the plan, each with its own „Cofnij”.
    expect(groups).toHaveLength(1)
    expect(groups[0]!.text).toBe('bloki stałe według planu: 3')
    expect(groups[0]!.items.map((i) => i.text)).toEqual(['Zajęcia zdalne skończony o 09:30 (według planu)', 'Zajęcia zdalne zaczęty o 09:00 (blok stały według planu)', 'Zajęcia zdalne zaczęty o 08:30 (blok stały według planu)'])
    expect(groups[0]!.items.every((i) => i.undo)).toBe(true)
    // The flexible block's pause at that start changes the counting of time: its own row, not in the group.
    const pause = items.find((i) => i.text === 'Inne obowiązki – pauza o 09:00 (blok stały według planu)')
    expect(pause).toMatchObject({ undo: true })
    expect(groups[0]!.items.map((i) => i.id)).not.toContain(pause!.id)
    // Every one of them can be taken back (the pause and the start of „w2” together, one `undo` for both).
    const done = new Set<string>()
    for (const i of [...groups[0]!.items, pause!]) {
      if (done.has(i.id)) continue
      const r = click(s, '09:36', { a: 'undo', target: i.id })
      expect(r.ok).toBe(true)
      if (r.ok) for (const e of r.events) done.add((e as unknown as { target: string }).target)
    }
    expect(done.has(pause!.id)).toBe(true)
  })

  it('pauza przy starcie bloku stałego i ten start tracą „Cofnij”, gdy blok stały się skończył (informacja, D350)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true, bg: false })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    leader(s, '09:00')
    const rows = (time: string) => {
      const { groups, items } = view(s, time).autos
      return [...groups[0]!.items, ...items].filter((i) => i.text.includes('blok stały według planu')).map((i) => i.undo)
    }
    expect(rows('09:30')).toEqual([true, true])
    click(s, '10:00', { a: 'next' })
    expect(rows('10:05')).toEqual([false, false])
  })

  it('„Odcinam się”: widget ukryty, szara ikona, linia „Odcinam się od …”; blok elastyczny pauzuje, „Wracam” – „Wznów · Zaparkuj”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:30', { a: 'cutOff' })
    const v = view(s, '08:40')
    expect(v).toMatchObject({ hidden: true, dot: false, stateLine: 'Odcinam się od 08:30', iconColor: '#6E6870' })
    click(s, '09:00', { a: 'back' })
    const back = view(s, '09:01')
    expect(back.hidden).toBe(false)
    expect(back.lines.find((l) => l.id === 'paused:a')).toMatchObject({ actions: [{ id: 'start', label: 'Wznów' }, { id: 'park', label: 'Zaparkuj' }], dot: true })
  })

  it('„Odcinam się” kończy się samo o 04:00 (działanie informacyjne, bez „Cofnij”)', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    click(s, '22:00', { a: 'cutOff' })
    leader(s, '04:01+1')
    expect(s.state('04:02+1').facts.disconnect.at(-1)!.to).not.toBe(Number.POSITIVE_INFINITY)
    expect(view(s, '04:02+1').autos.items[0]).toMatchObject({ undo: false })
  })

  it('woda: 45 min po ostatnim „wypite”, nie w ciszy nocnej', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('05:00', null)
    expect(view(s, '06:30').drop).toBe(true)
    click(s, '06:31', { a: 'drink' })
    expect(view(s, '07:00').drop).toBe(false)
    expect(view(s, '07:17').drop).toBe(true)
    expect(view(s, '23:00').drop).toBe(false)
  })

  it('cisza nocna: tylko godzina i biegnący blok z Dalej, Przedłuż i Koniec pracy', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'p', cat: 'projekty', at: '21:30', min: 60 })] }).observe('07:00', null)
    click(s, '21:30', { a: 'start', block: 'p' })
    const v = view(s, '22:10')
    expect(v.night).toBe(true)
    expect(v.buttons).toMatchObject({ next: true, extend: true, pause: false, cutOff: false })
  })

  it('propozycja przerwy po 90 min ciągłej pracy, raz; „Kontynuuję” ją chowa', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'next' })
    const v = view(s, '09:31')
    const line = v.lines.find((l) => l.id.startsWith('break:'))!
    expect(line).toMatchObject({ dot: true })
    click(s, '09:32', { a: 'mark', question: line.id, answer: 'continue' })
    expect(view(s, '09:40').lines.some((l) => l.id.startsWith('break:'))).toBe(false)
  })

  it('„Włączyć mniej pytań?” po sygnale przeciążenia: raz dziennie na rodzaj, chowa się po 15 min; „Tak” włącza tryb ciszy', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    s.signal('glasses', '10:00', null)
    expect(view(s, '10:05').lines.find((l) => l.id.startsWith('fewerOffer:'))).toMatchObject({ text: 'Włączyć mniej pytań?' })
    expect(view(s, '10:16').lines.some((l) => l.id.startsWith('fewerOffer:'))).toBe(false)
    // Another kind within 60 min after it hid: counts as shown, no new proposal.
    s.signal('earplugs', '10:40', null)
    expect(view(s, '10:41').lines.some((l) => l.id.startsWith('fewerOffer:'))).toBe(false)
    s.signal('rocking', '12:00', null)
    const line = view(s, '12:01').lines.find((l) => l.id.startsWith('fewerOffer:'))!
    expect(line.id).toContain('rocking')
    click(s, '12:02', { a: 'fewer' })
    const quiet = view(s, '12:03')
    expect(quiet).toMatchObject({ quiet: true, fewer: true, soundOk: false })
    expect(quiet.lines.some((l) => l.id.startsWith('fewerOffer:'))).toBe(false)
    click(s, '13:00', { a: 'better' })
    expect(view(s, '13:01').quiet).toBe(false)
  })

  it('chwila samotności po kontakcie dłuższym niż 30 min – gdy się skończył, nie w jego trakcie', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'r', cat: 'prosby', at: '10:00', min: 45 })] }).observe('07:00', null)
    click(s, '10:00', { a: 'start', block: 'r' })
    expect(view(s, '10:40').lines.some((l) => l.id.startsWith('solitude:'))).toBe(false)
    click(s, '10:45', { a: 'next' })
    expect(view(s, '10:46').lines.find((l) => l.id.startsWith('solitude:'))).toMatchObject({ text: 'Po rozmowach – chwila samotności?' })
    expect(view(s, '11:05').lines.some((l) => l.id.startsWith('solitude:'))).toBe(false)
  })

  it('dźwięk tylko przy zmianie kroku tego samego bloku: nie przy starcie ani po powrocie z próby', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const warm = view(s, '08:50')
    const five = view(s, '08:56')
    const zero = view(s, '09:20')
    expect(toneOnChange(null, zero).play).toBeNull()
    expect(toneOnChange(toneOnChange(null, warm).next, five).play).toBe('five')
    expect(toneOnChange(toneOnChange(null, five).next, zero).play).toBe('zero')
    expect(toneOnChange(toneOnChange(null, zero).next, zero).play).toBeNull()
  })

  it('„Zacznij jeszcze raz” sesji skończonej przed planowanym końcem (D207)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false })] }).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    click(s, '16:00', { a: 'finish' })
    expect(view(s, '16:10').lines.find((l) => l.id === 'restart:ny')).toMatchObject({ actions: [{ label: 'Zacznij jeszcze raz' }] })
    expect(click(s, '16:20', { a: 'restart', block: 'ny' }).ok).toBe(true)
    expect(view(s, '16:25').block?.name).toBe('Sesja tradingowa')
  })
})

describe('odliczanie od faktycznej chwili startu (E4a.1; dzień liczy się dalej w minutach, T412)', () => {
  const SEC = 1000
  const MIN = 60 * SEC
  const viewMs = (s: Scenario, t: number) => {
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Inne obowiązki', care, modePrefs: { sessionMode: true, classMode: true }, pending: null })
  }
  const startAt = (s: Scenario, t: number, act: TimerAction) => {
    const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
  }
  const isNext = (id: string) => id.startsWith('next:') || id.startsWith('next2:')
  /** How long the main process waits for its refresh at the next step (`stepDelay` of the view's `warnDeadlines`). */
  const stepIn = (s: Scenario, t: number) => stepDelay(warnDeadlines(s.stateAt(t), viewMs(s, t).block?.endsAt ?? null, t), t)

  it('start 10:46:32 (minuta 10:47): na starcie 15:00, kroki 5 i 0 oraz „Dalej?” w chwili 0:00, nie wcześniej', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '10:45', min: 15 })] }).observe('07:00', null)
    const t0 = s.at('10:46') + 32 * SEC
    startAt(s, t0, { a: 'start', block: 'a' })
    // The day counts the block from 10:47 (T412); the bar from the click.
    expect(s.stateAt(t0).facts.blocks.get('a')!.startedAt).toBe(s.stateAt(t0).now)
    const ends = t0 + 15 * MIN
    expect(viewMs(s, t0 + 2 * SEC).block!.endsAt).toBe(ends)
    expect(viewMs(s, ends - 5 * MIN - SEC).warn).toBe('warm')
    expect(viewMs(s, ends - 5 * MIN).warn).toBe('five')
    // 11:01:31 – the day's minute is already 11:02 (its planned end), the countdown still 0:01: no „Dalej?” yet.
    const before = viewMs(s, ends - SEC)
    expect(before).toMatchObject({ warn: 'five', question: null, dot: false })
    expect(before.lines.some((l) => isNext(l.id))).toBe(false)
    const at0 = viewMs(s, ends)
    expect(at0).toMatchObject({ warn: 'zero', question: { text: 'Dalej?' }, dot: true })
    expect(at0.lines.some((l) => isNext(l.id))).toBe(false)
    // The tone at 5 and 0 goes with the same steps.
    expect(toneOnChange(toneOnChange(null, viewMs(s, ends - 5 * MIN - SEC)).next, viewMs(s, ends - 5 * MIN)).play).toBe('five')
    expect(toneOnChange(toneOnChange(null, before).next, at0).play).toBe('zero')
    // The main process counts the view again at the step itself, not up to 15 s after the countdown.
    expect(stepIn(s, t0 + 2 * SEC)).toBeNull()
    expect(stepIn(s, ends - 5 * MIN - 3 * SEC)).toBe(3 * SEC)
    expect(stepIn(s, ends - SEC)).toBe(SEC)
    expect(stepIn(s, ends)).toBeNull()
  })

  it('krok w chwili kroku także przed startem bloku stałego (15 · 5 · 0 min przed nim), bez biegnącego bloku', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, bg: false })] }).observe('07:00', null)
    expect(stepIn(s, s.at('15:14') + 50 * SEC)).toBe(10 * SEC)
    expect(viewMs(s, s.at('15:15')).warn).toBe('warm')
    expect(stepIn(s, s.at('15:24') + 57 * SEC)).toBe(3 * SEC)
    expect(viewMs(s, s.at('15:25')).warn).toBe('five')
    expect(stepIn(s, s.at('15:29') + 59 * SEC)).toBe(SEC)
    expect(stepIn(s, s.at('15:20'))).toBeNull()
  })

  it('start 10:46:20 (minuta 10:46): „Dalej?” i krok 0 dopiero o 11:01:20, nie od 11:00:30', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '10:45', min: 15 })] }).observe('07:00', null)
    const t0 = s.at('10:46') + 20 * SEC
    startAt(s, t0, { a: 'start', block: 'a' })
    const ends = t0 + 15 * MIN
    expect(viewMs(s, t0).block!.endsAt).toBe(ends)
    expect(viewMs(s, s.at('11:01'))).toMatchObject({ warn: 'five', question: null })
    expect(viewMs(s, ends - SEC)).toMatchObject({ warn: 'five', question: null })
    expect(viewMs(s, ends)).toMatchObject({ warn: 'zero', question: { text: 'Dalej?' } })
  })

  it('po pauzie od chwili wznowienia; przejście przez tło nie zmienia odliczania; blok stały kończy się z oknem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '10:00', min: 30 })] }).observe('07:00', null)
    startAt(s, s.at('10:00') + 10 * SEC, { a: 'start', block: 'a' })
    startAt(s, s.at('10:10') + 5 * SEC, { a: 'pause' })
    // Resumed at 10:20:40 (minute 10:21): 20 min were left by the minutes – from the click.
    const back = s.at('10:20') + 40 * SEC
    startAt(s, back, { a: 'start', block: 'a' })
    expect(viewMs(s, back + SEC).block!.endsAt).toBe(back + 20 * MIN)

    // To the background and back (one stretch): counted from its start, not from the switch.
    const b = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '10:00', min: 30 })] }).observe('07:00', null)
    const t0 = b.at('10:00') + 10 * SEC
    startAt(b, t0, { a: 'start', block: 'a' })
    b.write([{ k: 'block.fg', block: 'a', at: b.at('10:05') + 40 * SEC, bg: true }], b.at('10:05') + 40 * SEC)
    b.write([{ k: 'block.fg', block: 'a', at: b.at('10:08') + 20 * SEC, bg: false }], b.at('10:08') + 20 * SEC)
    expect(viewMs(b, b.at('10:09')).block!.endsAt).toBe(t0 + 30 * MIN)

    // The hours in words stay those of the day's minutes, as in 1.0.1 (only the countdown and the steps take δ): the
    // tooltip „do 10:30” in front, „W tle: … do 10:30” in the background.
    const g = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '10:00', min: 30 })] }).observe('07:00', null)
    startAt(g, g.at('10:00') + 40 * SEC, { a: 'start', block: 'a' })
    expect(viewMs(g, g.at('10:05')).tooltip).toContain('do 10:31')
    g.write([{ k: 'block.fg', block: 'a', at: g.at('10:05') + 40 * SEC, bg: true }], g.at('10:05') + 40 * SEC)
    expect(viewMs(g, g.at('10:06')).background).toEqual([expect.objectContaining({ id: 'a', endsAt: g.at('10:31') })])

    // A fixed block ends with its window, whenever its start was clicked.
    const f = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, bg: false })] }).observe('07:00', null)
    startAt(f, f.at('15:30') + 25 * SEC, { a: 'start', block: 'ny' })
    expect(viewMs(f, f.at('15:40')).block!.endsAt).toBe(f.at('16:30'))
  })
})

describe('linie chwil dnia w pasku (A1-12)', () => {
  it('blok zakotwiczony po końcu kotwicy: „Zacznij · Zaparkuj · Koniec pracy” z kropką; znika po starcie', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'j', cat: 'inne', after: 'a', min: 30 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(view(s, '08:30').lines.some((l) => l.id === 'anchor:j')).toBe(false)
    s.write([{ k: 'block.end', block: 'a', at: s.at('09:05'), done: true, rule: null }], s.at('09:05'))
    const line = view(s, '09:06').lines.find((l) => l.id === 'anchor:j')!
    expect(line).toMatchObject({ dot: true })
    expect(line.actions.map((a) => a.label)).toEqual(['Zacznij', 'Zaparkuj', 'Koniec pracy'])
    click(s, '09:07', { a: 'start', block: 'j' })
    expect(view(s, '09:08').lines.some((l) => l.id === 'anchor:j')).toBe(false)
  })

  it('po „Koniec pracy” stały blok pracy przed sobą: „… o 14:00 zostaje · Odwołaj”; blok stały skończony planem: „nie przedłużono · Przedłuż” przez 30 min', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '14:00', min: 60, fixed: true })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'workEnd' })
    expect(view(s, '09:05').lines.find((l) => l.id === 'fixedLeft:f')).toMatchObject({ text: 'Inne obowiązki o 14:00 zostaje', actions: [{ id: 'cancel', label: 'Odwołaj' }] })
    const s2 = new Scenario({ date: DATE, plan: [block({ id: 'f', cat: 'inne', at: '14:00', min: 60, fixed: true })] }).observe('07:00', null)
    leader(s2, '14:00')
    leader(s2, '15:11')
    expect(view(s2, '15:12').lines.some((l) => l.id === 'notExtended:f')).toBe(true)
    expect(view(s2, '15:31').lines.some((l) => l.id === 'notExtended:f')).toBe(false)
  })
})

describe('linie chwil dnia po przeglądzie 0.21.0', () => {
  it('druga zmiana po „Koniec pracy” zostaje bez pytania – żadnego „Odwołaj”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'ds', cat: 'inne', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'workEnd' })
    expect(view(s, '09:05').lines.filter((l) => l.id.startsWith('fixedLeft:'))).toEqual([])
  })

  it('„nie przedłużono” liczy 30 min od końca z przedłużeniem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'f', cat: 'inne', at: '14:00', min: 60, fixed: true })] }).observe('07:00', null)
    leader(s, '14:00')
    expect(click(s, '14:50', { a: 'extend', minutes: 30, confirm: true }).ok).toBe(true)
    leader(s, '15:41')
    expect(s.state('15:42').facts.blocks.get('f')!.endedAt).not.toBeNull()
    expect(view(s, '15:42').lines.some((l) => l.id === 'notExtended:f')).toBe(true)
    expect(view(s, '16:01').lines.some((l) => l.id === 'notExtended:f')).toBe(false)
  })

  it('sesja skończona planem: „Sesja … – nie przedłużono · Przedłuż” przez 30 min (D227)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '14:00', min: 60, fixed: true })] }).observe('07:00', null)
    click(s, '14:00', { a: 'start', block: 'ny' })
    leader(s, '15:01')
    expect(s.state('15:02').facts.blocks.get('ny')!.endedAt).not.toBeNull()
    expect(view(s, '15:05').lines.find((l) => l.id === 'notExtended:ny')).toMatchObject({ text: 'Sesja tradingowa – nie przedłużono' })
    expect(view(s, '15:31').lines.some((l) => l.id === 'notExtended:ny')).toBe(false)
  })

  it('„… zostaje · Odwołaj” pyta raz: praca po „Koniec pracy” zabiera linię na dobre', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '15:30', min: 60, fixed: true })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '11:00', { a: 'workEnd' })
    expect(view(s, '11:05').lines.some((l) => l.id === 'fixedLeft:f')).toBe(true)
    click(s, '13:00', { a: 'start', block: 'b' })
    click(s, '14:00', { a: 'finish', block: 'b' })
    expect(view(s, '14:05').lines.some((l) => l.id === 'fixedLeft:f')).toBe(false)
  })

  it('blok zakotwiczony: kropka tylko, gdy nic nie biegnie, i nigdy w „mniej pytań”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'j', cat: 'inne', after: 'a', min: 30 }), block({ id: 'k', cat: 'inne', at: '10:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'finish', block: 'a' })
    expect(view(s, '09:05').lines.find((l) => l.id === 'anchor:j')?.dot).toBe(true)
    click(s, '09:10', { a: 'start', block: 'k' })
    expect(view(s, '09:20').lines.find((l) => l.id === 'anchor:j')?.dot).toBe(false)
    click(s, '09:30', { a: 'finish', block: 'k' })
    click(s, '09:31', { a: 'fewer' })
    expect(view(s, '09:35').lines.find((l) => l.id === 'anchor:j')?.dot).toBe(false)
  })

  it('„Odwołaj” ostatniego stałego bloku pracy potwierdza koniec i dopiero wtedy parkuje elastyczną pracę (D216)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '14:00', min: 60, fixed: true }), block({ id: 'b', cat: 'inne', at: '16:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'workEnd' })
    expect(s.state('09:01').facts.blocks.get('b')?.parkedAt ?? null).toBeNull()
    expect(click(s, '09:05', { a: 'cancel', block: 'f' }).ok).toBe(true)
    const st = s.state('09:06')
    expect(st.facts.blocks.get('b')?.parkedAt ?? null).not.toBeNull()
    expect(st.ends.at(-1)?.confirmed).toBe(true)
  })
})

describe('„Koniec pracy” bez biegnącego bloku pracy (G1, spec „Granica i koniec pracy”, T152)', () => {
  it('przy zapauzowanym bloku pracy od razu, nie dopiero po 15 min; kliknięcie kończy blok i przycisk znika (E8a.2)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })] }).observe('07:00', null)
    click(s, '09:00', { a: 'start', block: 'a' })
    click(s, '09:30', { a: 'pause' })
    expect(view(s, '09:31').buttons.workEnd).toBe(true)
    expect(click(s, '09:32', { a: 'workEnd' }).ok).toBe(true)
    const after = view(s, '09:33')
    expect(after.buttons.workEnd).toBe(false)
    expect(after.lines.some((l) => l.id === 'paused:a')).toBe(false)
  })

  it('po samoczynnym końcu bloku, gdy w planie przed drugą zmianą zostaje elastyczna praca (E6a.2, E8f.2 cz. 1)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '17:30', min: 60 }), block({ id: 'ds', cat: 'inne', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })] }).observe('07:00', null)
    click(s, '16:00', { a: 'start', block: 'a' })
    s.write([{ id: 'auto-a-two', k: 'block.end', block: 'a', at: s.at('17:00'), done: null, rule: 'twoQuestions', autoRule: 'twoQuestions' }], s.at('17:05'))
    expect(view(s, '17:10').buttons.workEnd).toBe(true)
    const r = click(s, '17:10', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.park b'])
    expect(r.ok && r.events[0]!.end).toBe(s.at('17:00'))
    expect(view(s, '17:11').buttons.workEnd).toBe(false)
  })

  it('bez pracy dnia i po potwierdzonym końcu pracy – nie ma go', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })] }).observe('07:00', null)
    expect(view(s, '08:30').buttons.workEnd).toBe(false)
    click(s, '09:00', { a: 'start', block: 'a' })
    click(s, '09:40', { a: 'workEnd' })
    expect(view(s, '09:45').buttons.workEnd).toBe(false)
  })

  it('pusty przebieg po kliknięciu w jego minucie: silnik nie bierze kliknięcia za koniec – przycisk zostaje (jak silnik, nie po minucie)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '14:00', min: 90 }), block({ id: 'b', cat: 'inne', at: '17:00', min: 30 })] }).observe('07:00', null)
    const at = (t: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (r.ok) s.write(r.events, t)
      return r
    }
    s.start('a', '14:00')
    at(s.at('15:30') + 10_000, { a: 'workEnd' })
    at(s.at('15:30') + 20_000, { a: 'start', block: 'b', confirm: true })
    at(s.at('15:30') + 25_000, { a: 'finish', block: 'b' })
    const st = s.state('15:35')
    expect(st.ends.map((e) => e.confirmed)).toEqual([false])
    expect(view(s, '15:35').buttons.workEnd).toBe(true)
  })

  it('dzień bez pracy (sama niezaczęta sesja) – nie ma go, choć silnik ma koniec po końcu okna sesji', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true })] }).observe('07:00', null)
    expect(s.state('17:00').ends.length).toBe(1)
    expect(view(s, '17:00').buttons.workEnd).toBe(false)
  })

  it('blok pracy biegnący w tle przy pustym pierwszym planie – nie ma go (jak przed G1)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'g', cat: 'inne', at: '09:30', min: 120, bg: true })] }).observe('07:00', null)
    s.ran('a', '08:00', '09:00').start('g', '09:30', { bg: true })
    const v = view(s, '10:00')
    expect(v.block).toBeNull()
    expect(v.buttons.workEnd).toBe(false)
  })

  it('w czasie prośby, która przerwała blok pracy – nie ma go (blok wraca po „Koniec” prośby, T503)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })] }).observe('07:00', null)
    click(s, '09:00', { a: 'start', block: 'a' })
    const t = s.at('10:00')
    const r = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(view(s, '10:05').buttons.workEnd).toBe(false)
  })

  it('prośba, która przerwała „Naukę” zaczętą przed końcem pracy (praca, nie projekt) – też go nie ma', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'n', cat: 'nauka', at: '16:55', min: 60 })] }).observe('07:00', null)
    click(s, '16:55', { a: 'start', block: 'n' })
    const t = s.at('17:00')
    const r = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(s.state('17:05').asProject).not.toContain('n')
    expect(view(s, '17:05').buttons.workEnd).toBe(false)
  })

  it('koniec silnika z czasu do wyjaśnienia odpowiedzianego „praca” – przycisk potwierdza go, nie wcześniejszy koniec bloku', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 90 })] }).using('07:00', '23:59')
    s.start('a', '16:00')
    s.gap('17:30', '18:00')
    s.write([{ id: 'auto-a-idle', k: 'block.end', block: 'a', at: s.at('17:30'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('17:40'))
    s.gap('19:00', '19:30')
    const x = s.state('19:35').explains[0]!
    s.write([{ k: 'question.answer', at: s.at('19:35'), question: x.id, answer: 'work', value: null }], s.at('19:35'))
    const before = s.state('19:40')
    expect(before.ends.map((e) => `${e.confirmed}`).at(-1)).toBe('false')
    expect(view(s, '19:40').buttons.workEnd).toBe(true)
    const r = click(s, '19:40', { a: 'workEnd' })
    expect(r.ok && r.events[0]).toMatchObject({ k: 'work.end', end: s.at('19:00') })
    const st = s.state('19:45')
    expect(st.ends.at(-1)).toMatchObject({ at: before.ends.at(-1)!.at, confirmed: true })
  })

  it('przerwany blok zakończony w czasie prośby nic nie wstrzymuje: jest „Koniec pracy” i „Koniec pracy?”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })] }).observe('07:00', null)
    click(s, '09:00', { a: 'start', block: 'a' })
    const t = s.at('10:00')
    const r = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(click(s, '10:05', { a: 'park', block: 'a' }).ok).toBe(true)
    const v = view(s, '10:06')
    expect(v.buttons.workEnd).toBe(true)
    expect(v.lines.some((l) => l.text === 'Koniec pracy?')).toBe(true)
  })
})

describe('minuta kliknięcia „Koniec pracy” (G1, E8f.2 cz. 4)', () => {
  it('blok zaczęty i zakończony „Koniec pracy” w tej samej minucie: „… o 15:30 zostaje · Odwołaj” jest', () => {
    const s = new Scenario({ date: '2026-11-12', plan: [block({ id: 'b', cat: 'inne', at: '12:59', min: 15 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 20, fixed: true })] }).observe('07:00', null)
    const ms = (time: string, sec: number) => s.at(time) + sec * 1000
    const at = (t: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (r.ok) s.write(r.events, t)
      return r
    }
    at(ms('12:59', 19), { a: 'start', block: 'b' })
    at(ms('12:59', 26), { a: 'workEnd' })
    expect(view(s, '13:00').lines.find((l) => l.id === 'fixedLeft:ny')).toMatchObject({ text: 'Sesja tradingowa o 15:30 zostaje', actions: [{ id: 'cancel', label: 'Odwołaj' }] })
    // A block begun after the click, in the same minute too, is work after it: the line goes.
    expect(at(ms('12:59', 28), { a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 10 }).ok).toBe(true)
    expect(view(s, '13:01').lines.some((l) => l.id === 'fixedLeft:ny')).toBe(false)
  })

  it('blok pracy w tle zaczęty przed kliknięciem w tej samej minucie nie zabiera linii (kolejność, nie minuta)', () => {
    const s = new Scenario({ date: '2026-11-12', plan: [block({ id: 'a', cat: 'inne', at: '12:00', min: 60 }), block({ id: 'g', cat: 'inne', at: '12:00', min: 120, bg: true }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 20, fixed: true }), block({ id: 'c', cat: 'inne', at: '17:00', min: 60 })] }).observe('07:00', null)
    const ms = (time: string, sec: number) => s.at(time) + sec * 1000
    const at = (t: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (r.ok) s.write(r.events, t)
      return r
    }
    click(s, '12:00', { a: 'start', block: 'a' })
    expect(at(ms('12:29', 35), { a: 'start', block: 'g', confirm: true }).ok).toBe(true)
    at(ms('12:29', 50), { a: 'workEnd' })
    at(ms('12:40', 0), { a: 'finish', block: 'g' })
    expect(view(s, '12:45').lines.some((l) => l.id === 'fixedLeft:ny')).toBe(true)
    // „Odwołaj” reads the same: no work came back, so the flexible work is parked.
    const r = click(s, '12:50', { a: 'cancel', block: 'ny' })
    expect(r.ok && r.events.map((e) => `${e.k} ${e.block as string}`)).toEqual(['block.cancel ny', 'block.park c'])
  })

  it('pusty przebieg zaczęty po kliknięciu w jego minucie: silnik, pasek i „Odwołaj” oceniają kliknięcie tak samo', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '14:00', min: 90 }), block({ id: 'b', cat: 'inne', at: '17:00', min: 30 }), block({ id: 'ny', cat: 'sesja', at: '16:00', min: 30, fixed: true }), block({ id: 'c', cat: 'inne', at: '18:00', min: 60 })] }).observe('07:00', null)
    const at = (t: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
      if (r.ok) s.write(r.events, t)
      return r
    }
    s.start('a', '14:00')
    expect(at(s.at('15:30') + 10_000, { a: 'workEnd' }).ok).toBe(true)
    expect(at(s.at('15:30') + 20_000, { a: 'start', block: 'b', confirm: true }).ok).toBe(true)
    expect(at(s.at('15:30') + 25_000, { a: 'finish', block: 'b' }).ok).toBe(true)
    // b ran after the click, within its minute: work came back – no line, „Odwołaj” parks nothing …
    expect(view(s, '15:31').lines.some((l) => l.id === 'fixedLeft:ny')).toBe(false)
    const r = click(s, '15:32', { a: 'cancel', block: 'ny' })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.cancel'])
    // … and the engine does not take the click as the end either.
    expect(s.state('15:33').ends.some((e) => e.confirmed)).toBe(false)
  })

  it('po „Koniec pracy” każdy blok pracy (też wykład w tle) zabiera linię „zostaje · Odwołaj” – pasek pyta raz; „Odwołaj” liczy pracę jak silnik i parkuje (D216)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'w', cat: 'wyklad', at: '10:00', min: 60 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 20, fixed: true }), block({ id: 'c', cat: 'inne', at: '17:00', min: 60 })] }).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'workEnd' })
    expect(view(s, '09:05').lines.some((l) => l.id === 'fixedLeft:ny')).toBe(true)
    expect(click(s, '10:00', { a: 'start', block: 'w' }).ok).toBe(true)
    click(s, '11:00', { a: 'finish', block: 'w' })
    expect(view(s, '11:05').lines.some((l) => l.id === 'fixedLeft:ny')).toBe(false)
    // A lecture that keeps regeneration is no work back for the engine: cancelling the session confirms the end and parks.
    const r = click(s, '11:10', { a: 'cancel', block: 'ny' })
    expect(r.ok && r.events.map((e) => `${e.k} ${e.block as string}`)).toEqual(['block.cancel ny', 'block.park c'])
  })
})

describe('komputer nagrywający w widoku paska (A8-04)', () => {
  it('dwa wykłady naraz: każdy komputer nagrywający, także ten w tle (przegląd 0.23.0)', () => {
    const s = new Scenario({ date: DATE, plan: [{ ...block({ id: 'w', cat: 'wyklad', at: '10:00', min: 90, fixed: true }), recorder: 'pcb' }, { ...block({ id: 'v', cat: 'wyklad', at: '10:00', min: 90, fixed: true, bg: true }), recorder: 'pca' }] }).observe('07:00', null)
    click(s, '10:00', { a: 'start', block: 'w' })
    click(s, '10:00', { a: 'start', block: 'v' })
    const t = s.at('10:30')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Wykład', care, modePrefs: { sessionMode: true, classMode: true }, pending: null, computer: 'pca' })
    expect([...v.recorders].sort()).toEqual(['pca', 'pcb'])
    expect(v.recording).toBe(true)
  })

  it('nagrywany wykład biegnie: widok podaje komputer nagrywający; poza wykładem – nikt', () => {
    const s = new Scenario({ date: DATE, plan: [{ ...block({ id: 'w', cat: 'wyklad', at: '10:00', min: 90, fixed: true }), recorder: 'pcb' }] }).observe('07:00', null)
    expect(view(s, '09:30').recorders).toEqual([])
    click(s, '10:00', { a: 'start', block: 'w' })
    expect(view(s, '10:30')).toMatchObject({ recorders: ['pcb'], recording: false })
  })
})

describe('„mniej pytań” w minucie (fewerAt)', () => {
  it('odcinek zaczęty i skończony w tej samej minucie liczy się dla tej minuty, sąsiednie nie', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    click(s, '10:00', { a: 'fewer' })
    click(s, '10:00', { a: 'better' })
    const t = s.at('10:30')
    const ctx = s.contextAt(t)
    const grid = s.stateAt(t).grid
    const idx = (time: string) => Math.round((s.at(time) - grid.start) / 60_000)
    expect(fewerAt(ctx.events, grid, idx('10:00'))).toBe(true)
    expect(fewerAt(ctx.events, grid, idx('09:59'))).toBe(false)
    expect(fewerAt(ctx.events, grid, idx('10:01'))).toBe(false)
  })
})

describe('linia twardego końca projektów w pasku (D228, D240, D352)', () => {
  const hard = (v: ReturnType<typeof view>) => v.lines.filter((l) => l.id.startsWith('hardEnd:'))
  /** The same view with the day's figures set by hand (what the engine would have counted in another day). */
  function patched(s: Scenario, time: string, patch: (st: ReturnType<Scenario['stateAt']>) => Partial<ReturnType<Scenario['stateAt']>>, o: { sessionMode?: boolean } = {}) {
    const t = s.at(time)
    const ctx = s.contextAt(t)
    const base = s.stateAt(t)
    const state = { ...base, ...patch(base) }
    return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Projekt', care, modePrefs: { sessionMode: o.sessionMode ?? true, classMode: true }, pending: null })
  }
  const passedAt = (st: ReturnType<Scenario['stateAt']>) => ({ hardEnd: { ...st.hardEnd, passed: st.now - 10, message: true, nothingMissing: false }, regen: { ...st.regen, missingMin: 60 } })

  // Work to 17:00 (the end clicked), a project begun at 17:30 that runs on: minimum 90 min, 30 min collected, bedtime 22:00 –
  // the hard end is 21:00 and passes with the project running.
  function running(cat = 'projekty', id = 'p') {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id, cat, at: '17:30', min: 120 })] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.start(id, '17:30')
    return s
  }

  // The same day, but the project ended by itself at 19:30 (two questions): time to explain after it; you use the computer
  // until 21:20, then a break of 50 min.
  function explaining(extra: ReturnType<typeof block>[] = []) {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id: 'p', cat: 'projekty', at: '17:30', min: 120 }), ...extra] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.start('p', '17:30')
    s.write([{ id: 'auto-p-twoQuestions', k: 'block.end', block: 'p', at: s.at('19:30'), done: null, rule: 'twoQuestions', autoRule: 'twoQuestions' }], s.at('20:30'))
    s.gap('21:20', '22:10')
    return s
  }

  it('biegnący projekt po minięciu twardego końca: linia tekstu bez przycisków i bez kropki; przed minięciem jej nie ma', () => {
    const s = running()
    expect(hard(view(s, '20:30'))).toEqual([])
    expect(hard(view(s, '21:10'))).toEqual([{ id: `hardEnd:${DATE}:${s.state('21:10').hardEnd.passed}`, text: HARD_END_TEXT, actions: [], dot: false }])
  })

  it('blok liczony jak projekt („Nauka” po końcu pracy) też daje linię (spec: także blok liczony jak projekt, D195, D209)', () => {
    const s = running('nauka', 'n')
    expect(s.state('21:10').asProject).toContain('n')
    expect(hard(view(s, '21:10'))).toHaveLength(1)
  })

  it('blok pasywny liczony jak projekt („Oglądanie”) po planowanym końcu: linia jest (spec wyłącza go tylko z minuty minięcia, nie ze stanu po nim)', () => {
    const s = running('ogladanie', 'o')
    const st = s.state('21:10')
    expect(st.asProject).toContain('o')
    expect(st.blocks.find((b) => b.id === 'o')!.rules.place).toBe('passive')
    // Planned 17:30–19:30, it runs on at 21:10: past its planned end. The hard end passed before – set by hand, as the pass
    // itself does not come in a passive block after its planned end (spec).
    const v = view(s, '21:10')
    expect(v.block!.endsAt).toBeLessThan(s.at('21:10'))
    expect(hard(patched(s, '21:10', passedAt))).toHaveLength(1)
  })

  it('w czasie do wyjaśnienia po projekcie linia jest, po jego końcu (przerwa w używaniu) już nie', () => {
    const s = explaining()
    expect(hard(view(s, '21:10'))).toHaveLength(1)
    // The break of 35 min (from 21:20) ended the time to explain: the hard end passed, no project, nothing to wait in.
    expect(s.state('21:55').hardEnd.passed).not.toBeNull()
    expect(hard(view(s, '21:55'))).toEqual([])
  })

  it('czas do wyjaśnienia po projekcie, który zaczął się po minięciu twardego końca w innym bloku: linia jest bez „message” minięcia', () => {
    // The hard end passed in a block of life, the project began after it and ended by itself – no message of the pass.
    const s = explaining()
    const v = patched(s, '21:10', (st) => ({ hardEnd: { ...st.hardEnd, message: false } }))
    expect(hard(v)).toHaveLength(1)
  })

  it('czas do wyjaśnienia już odpowiedziany nie jest trwającym: bez linii (odpowiedź „Projekt do …”)', () => {
    const s = explaining()
    expect(hard(view(s, '21:10'))).toHaveLength(1)
    s.write([{ k: 'question.answer', at: s.at('21:12'), question: s.state('21:12').explains[0]!.id, answer: 'project', value: null }], s.at('21:12'))
    expect(s.state('21:15').explains[0]!.answer).not.toBeNull()
    expect(hard(view(s, '21:15'))).toEqual([])
  })

  it('blok, który nie jest projektem, na pierwszym planie (wykład online nie kończy czasu do wyjaśnienia): bez linii', () => {
    const s = explaining([block({ id: 'l', cat: 'wyklad', at: '21:12', min: 30 })])
    s.start('l', '21:12', { bg: false })
    const v = view(s, '21:15')
    expect(v.block).not.toBeNull()
    expect(s.state('21:15').explains[0]!.to).toBe(Number.POSITIVE_INFINITY)
    expect(hard(v)).toEqual([])
  })

  it('po projekcie, który skończył się zwykłym końcem (bez czasu do wyjaśnienia), linii nie ma', () => {
    const s = running()
    click(s, '21:20', { a: 'finish', block: 'p' })
    expect(s.state('21:30').hardEnd.passed).not.toBeNull()
    expect(hard(view(s, '21:15')).length).toBe(1)
    expect(hard(view(s, '21:30'))).toEqual([])
  })

  it('brakująca część minimum 0 albo twardy koniec bez „brakuje” – bez linii, tak jak bez powiadomienia', () => {
    const s = running()
    expect(hard(patched(s, '21:10', () => ({})))).toHaveLength(1)
    expect(hard(patched(s, '21:10', (st) => ({ hardEnd: { ...st.hardEnd, nothingMissing: true } })))).toEqual([])
    expect(hard(patched(s, '21:10', (st) => ({ regen: { ...st.regen, missingMin: 0 } })))).toEqual([])
    expect(hard(patched(s, '21:10', (st) => ({ hardEnd: { ...st.hardEnd, passed: null } })))).toEqual([])
  })

  it('„mniej pytań”: linia zostaje jako cicha (bez kropki, D134, D240)', () => {
    const s = running()
    click(s, '21:05', { a: 'fewer' })
    const v = view(s, '21:10')
    expect(v.fewer).toBe(true)
    expect(hard(v)).toEqual([expect.objectContaining({ text: HARD_END_TEXT, dot: false, actions: [] })])
  })

  it('cicha ikona twardego końca stoi na końcu, po liniach z przyciskami (nie spycha ich do „⋯”)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'j', cat: 'inne', after: 'a', min: 30 }), block({ id: 'p', cat: 'projekty', at: '17:30', min: 120 })] }).using('07:00', '23:59')
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'finish', block: 'a' })
    click(s, '17:30', { a: 'start', block: 'p' })
    click(s, '17:35', { a: 'fewer' })
    const v = patched(s, '17:40', passedAt)
    const ids = v.lines.map((l) => l.id)
    expect(ids).toContain('anchor:j')
    expect(ids.findIndex((x) => x.startsWith('hardEnd:'))).toBeGreaterThan(ids.indexOf('anchor:j'))
    expect(v.quiet).toBe(true)
  })

  it('tryb sesji (sesja czeka na „Zacznij” w tle projektu): linia nie czeka na koniec trybu (D228)', () => {
    // A session ahead takes the free time from the forecast (the hard end would be unreachable): the day's figures are set
    // as the leader wrote them when the hard end passed in the project.
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id: 'p', cat: 'projekty', at: '17:30', min: 120 }), block({ id: 'ny', cat: 'sesja', at: '21:05', min: 60, fixed: true, bg: false })] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.start('p', '17:30')
    leader(s, '21:06')
    const v = patched(s, '21:10', passedAt)
    expect(v.lines.find((l) => l.id === 'wait:ny')).toBeDefined()
    expect(v.quiet).toBe(true)
    expect(hard(v)).toHaveLength(1)
    expect(hard(patched(s, '21:10', passedAt, { sessionMode: false }))).toHaveLength(1)
  })

  it('cisza nocna i „Odcinam się”: bez linii (po porze snu, przy ukrytym pasku)', () => {
    const s = running()
    expect(hard(view(s, '21:10'))).toHaveLength(1)
    expect(view(s, '22:10')).toMatchObject({ night: true, lines: [] })
    click(s, '21:30', { a: 'cutOff' })
    expect(view(s, '21:40')).toMatchObject({ hidden: true, lines: [] })
  })
})
