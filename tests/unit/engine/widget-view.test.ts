/**
 * The widget's view from the engine (E4b; spec „Widget”, „Cisza”, „Odcinam się”, „Woda”, D225, D232, D240): the colour by
 * the block's class, the steps 15 · 5 · 0 min, the dot only for what waits for a click, „Odcinam się” hides the widget,
 * the quiet modes, the night's quiet, the water, the break after 90 min, the list of automatic actions.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions } from '@shared/engine/auto'
import { timerAction, type TimerAction } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const care = { waterOn: true, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }

function view(s: Scenario, time: string, o: { sessionMode?: boolean } = {}) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: (c) => ({ inne: 'Inne obowiązki', sesja: 'Sesja tradingowa', posilek: 'Posiłek', 'zajecia-zdalne': 'Zajęcia zdalne', regeneracja: 'Regeneracja' })[c] ?? c, care, modePrefs: { sessionMode: o.sessionMode ?? true, classMode: true }, pending: null })
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

  it('„Zacznij jeszcze raz” sesji skończonej przed planowanym końcem (D207)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false })] }).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    click(s, '16:00', { a: 'finish' })
    expect(view(s, '16:10').lines.find((l) => l.id === 'restart:ny')).toMatchObject({ actions: [{ label: 'Zacznij jeszcze raz' }] })
    expect(click(s, '16:20', { a: 'restart', block: 'ny' }).ok).toBe(true)
    expect(view(s, '16:25').block?.name).toBe('Sesja tradingowa')
  })
})
