/**
 * D365: the end of a running block dragged on the axis of „Dziś” – the bottom edge changes its planned length, never
 * before now rounded up to 5 min; up to the boundary at once, past it the cost of „Przedłuż” (the same cost and the same
 * event) and nothing changes without „Potwierdź”. A session, a lecture, a class of a „zjazd”, the second shift (and a
 * block after another one or begun outside the plan) have no handle – „Przedłuż” on the bar stays theirs.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, questionsOf } from '@shared/engine/auto'
import { csvOf } from '@shared/engine/csv'
import { resizePreview, runningEdges } from '@shared/engine/resize'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { variantTriggers } from '@shared/engine/variants'
import { sessionsOf } from '@shared/engine/week'
import { isKnown, parseEvent, RULES_VERSION } from '@shared/model/events'
import { rdFrom } from '@shared/model/rd'
import { block, hhmm, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function day(plan = [block({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })]) {
  return new Scenario({ date: DATE, plan }).observe('07:00', null)
}

/** A click at the instant `t` (ms): written when it does something. */
function click(s: Scenario, t: number, act: TimerAction) {
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

const preview = (s: Scenario, t: number, id: string, end: string) => resizePreview(s.contextAt(t), s.stateAt(t), id, lm(end), t)
const edges = (s: Scenario, t: number) => runningEdges(s.stateAt(t), t)
const plannedEnd = (s: Scenario, t: number, id: string) => {
  const st = s.stateAt(t)
  const tb = [timerNow(st).fg, ...timerNow(st).bg].find((x) => x?.info.id === id)
  return hhmm(st, tb?.plannedEnd ?? null)
}
const SEC = 1000

/** The leader's automatic actions at `time`, written (the boundary's own approval left out of the result). */
function leader(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const st = s.stateAt(t)
  const out = autoActions({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, gate: t })
  s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
}

/** A minute's class as the day counts it at `now` (`upfront`: confirmed in advance). */
const minuteOf = (s: Scenario, now: string, time: string) => {
  const st = s.state(now)
  return st.minutes.get(Math.round((s.at(time) - st.grid.start) / 60_000))
}

describe('D365 – trwający blok: dolna krawędź nie schodzi przed teraz', () => {
  it('najwcześniejszy koniec to bieżąca chwila zaokrąglona w górę do 5 min', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    expect(edges(s, s.at('10:12') + 30 * SEC).get('a')).toEqual({ block: 'a', earliestEnd: lm('10:15'), latestEnd: lm('04:00+1'), plannedEnd: lm('11:00') })
    expect(edges(s, s.at('10:15')).get('a')?.earliestEnd).toBe(lm('10:15'))
    expect(edges(s, s.at('10:15') + SEC).get('a')?.earliestEnd).toBe(lm('10:20'))
    // A proposal before it goes to it.
    const p = preview(s, s.at('10:12') + 30 * SEC, 'a', '10:05')!
    expect(p).toMatchObject({ end: lm('10:15'), to: s.at('10:15'), minutes: -45, cost: null, refused: null })
  })

  it('najpóźniejszy koniec: koniec dnia (04:00)', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const t = s.at('10:20')
    expect(edges(s, t).get('a')).toEqual({ block: 'a', earliestEnd: lm('10:20'), latestEnd: lm('04:00+1'), plannedEnd: lm('11:00') })
    expect(preview(s, t, 'a', '05:00+1')).toMatchObject({ end: lm('04:00+1'), minutes: 17 * 60 })
  })

  it('blok zaczęty tuż przed 04:00 i sięgający za nią: limity spójne, na siatce 5 min, nie poniżej pokazanego końca', () => {
    const s = day([block({ id: 'n', cat: 'inne', at: '03:33', min: 60 })])
    click(s, s.at('03:33'), { a: 'start', block: 'n' })
    const t = s.at('03:40')
    // Planned end 04:33 (past the day's end): the latest is it rounded up to the grid, never the day's end below it.
    expect(edges(s, t).get('n')).toEqual({ block: 'n', earliestEnd: lm('03:40'), latestEnd: lm('04:35+1'), plannedEnd: lm('04:33+1') })
    const p = preview(s, t, 'n', '05:30+1')!
    expect(p).toMatchObject({ end: lm('04:35+1'), minutes: 2 })
    // What the main process writes for the preview's `to` is what the preview showed (past the maximum: with its cost).
    expect(click(s, t, { a: 'resize', block: 'n', to: p.to })).toMatchObject({ ok: false, confirm: p.cost })
    expect(click(s, t, { a: 'resize', block: 'n', to: p.to, confirm: true })).toMatchObject({ ok: true, events: [{ k: 'block.extend', minutes: p.minutes }] })
  })

  it('blok zaczęty minutę przed 04:00: najpóźniejszy koniec nie jest przed najwcześniejszym', () => {
    const s = day([block({ id: 'n', cat: 'inne', at: '03:58', min: 2 })])
    click(s, s.at('03:58'), { a: 'start', block: 'n' })
    const t = s.at('03:59')
    expect(edges(s, t).get('n')).toEqual({ block: 'n', earliestEnd: lm('04:05+1'), latestEnd: lm('04:05+1'), plannedEnd: lm('04:00+1') })
    const p = preview(s, t, 'n', '03:59')!
    expect(p).toMatchObject({ end: lm('04:05+1'), minutes: 5 })
    expect(click(s, t, { a: 'resize', block: 'n', to: p.to, confirm: true })).toMatchObject({ ok: true, events: [{ k: 'block.extend', minutes: 5 }] })
  })

  it('blok zaczęty przed chwilą: najkrótszy blok 5 min, koniec na siatce 5 min', () => {
    const s = day()
    click(s, s.at('10:13'), { a: 'start', block: 'a' })
    expect(edges(s, s.at('10:14')).get('a')?.earliestEnd).toBe(lm('10:20'))
  })

  it('koniec poza siatką 5 min idzie do najbliższego kroku', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    expect(preview(s, s.at('10:20'), 'a', '11:22')?.end).toBe(lm('11:20'))
    expect(preview(s, s.at('10:20'), 'a', '11:23')?.end).toBe(lm('11:25'))
  })

  it('zapis z procesu głównego: blok krótszy niż 5 min – odmowa, nic się nie zmienia', () => {
    const s = day()
    click(s, s.at('10:13'), { a: 'start', block: 'a' })
    const n = s.events.length
    expect(click(s, s.at('10:14'), { a: 'resize', block: 'a', to: s.at('10:15') })).toMatchObject({ ok: false, why: 'najkrótszy blok to 5 min', confirm: null })
    expect(s.events.length).toBe(n)
    expect(click(s, s.at('10:14'), { a: 'resize', block: 'a', to: s.at('10:20') })).toMatchObject({ ok: true, events: [{ k: 'block.shorten', minutes: 53 }] })
  })

  it('zapis z procesu głównego: koniec idzie na siatkę 5 min', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const t = s.at('10:20')
    const at = (end: string) => timerAction(s.contextAt(t), s.stateAt(t), { a: 'resize', block: 'a', to: s.at(end) }, t)
    expect(at('11:22')).toMatchObject({ ok: true, events: [{ k: 'block.extend', minutes: 20 }] })
    expect(at('11:23')).toMatchObject({ ok: true, events: [{ k: 'block.extend', minutes: 25 }] })
    expect(at('10:42')).toMatchObject({ ok: true, events: [{ k: 'block.shorten', minutes: 20 }] })
  })

  it('zapis końca przed teraz nic nie zmienia (odmowa)', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const n = s.events.length
    expect(click(s, s.at('10:12'), { a: 'resize', block: 'a', to: s.at('10:05') })).toMatchObject({ ok: false, confirm: null })
    expect(s.events.length).toBe(n)
    expect(plannedEnd(s, s.at('10:13'), 'a')).toBe('11:00')
  })
})

describe('D365 – do granicy od razu, za granicą koszt jak „Przedłuż”', () => {
  it('do granicy: bez kosztu, zapis od razu – to samo zdarzenie co „Przedłuż”', () => {
    const s = day().approve('13:00', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const t = s.at('10:30')
    expect(preview(s, t, 'a', '12:00')).toMatchObject({ minutes: 60, cost: null, costText: null, refused: null })
    const ext = timerAction(s.contextAt(t), s.stateAt(t), { a: 'extend', block: 'a', minutes: 60 }, t)
    const r = click(s, t, { a: 'resize', block: 'a', to: s.at('12:00') })
    expect(r.ok).toBe(true)
    expect(r.ok && r.events).toEqual(ext.ok && ext.events)
    expect(r.ok && r.events).toEqual([{ k: 'block.extend', block: 'a', at: t, minutes: 60 }])
    expect(plannedEnd(s, s.at('10:31'), 'a')).toBe('12:00')
  })

  it('za granicą: koszt identyczny z „Przedłuż” na tych samych danych; bez „Potwierdź” nic się nie zmienia', () => {
    const s = day().approve('11:15', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const t = s.at('10:30')
    const ext = timerAction(s.contextAt(t), s.stateAt(t), { a: 'extend', block: 'a', minutes: 60 }, t)
    expect(ext).toMatchObject({ ok: false, confirm: { block: 'a', minutes: 45 } })
    const p = preview(s, t, 'a', '12:00')!
    expect(p.cost).toEqual(ext.confirm)
    expect(p.costText).toBe('Przedłuż +60: przedłużenie · −45 min puli')
    // Released without „Potwierdź”: the first call only returns the cost – nothing is written, the plan stays.
    const n = s.events.length
    const first = click(s, t, { a: 'resize', block: 'a', to: s.at('12:00') })
    expect(first).toMatchObject({ ok: false, confirm: ext.confirm })
    expect(s.events.length).toBe(n)
    expect(plannedEnd(s, s.at('10:31'), 'a')).toBe('11:00')
    // „Potwierdź” within the 10 s: the events of the confirmed „Przedłuż”.
    const t2 = t + 5 * SEC
    const confirmed = timerAction(s.contextAt(t2), s.stateAt(t2), { a: 'extend', block: 'a', minutes: 60, confirm: true }, t2)
    const r = click(s, t2, { a: 'resize', block: 'a', to: s.at('12:00'), confirm: true })
    expect(r.ok && r.events).toEqual(confirmed.ok && confirmed.events)
    expect(plannedEnd(s, s.at('10:31'), 'a')).toBe('12:00')
    // The same „Potwierdź” again finds the end there: nothing more is written.
    const again = click(s, t2 + SEC, { a: 'resize', block: 'a', to: s.at('12:00'), confirm: true })
    expect(again).toMatchObject({ ok: true, events: [] })
  })

  it('po maksimum: przekroczenie, jak przy „Przedłuż”', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '18:00', min: 60 })]).approve('18:30', '07:30')
    click(s, s.at('18:00'), { a: 'start', block: 'a', confirm: true })
    const t = s.at('18:40')
    const ext = timerAction(s.contextAt(t), s.stateAt(t), { a: 'extend', block: 'a', minutes: 30 }, t)
    const p = preview(s, t, 'a', '19:30')!
    expect(p.cost).toEqual(ext.confirm)
    expect(p.cost).toMatchObject({ minutes: 30, overrun: true })
    expect(p.costText).toBe('Przedłuż +30: przekroczenie · −30 min puli')
  })

  it('ostrzeżenia dnia po zmianie, jak przy polu „Długość” – nic nie blokuje (D72)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '18:00', min: 60 })]).approve('18:30', '07:30')
    click(s, s.at('18:00'), { a: 'start', block: 'a', confirm: true })
    const p = preview(s, s.at('18:40'), 'a', '19:30')!
    expect(p.warnings).toContain('praca kończy się po maksimum')
    expect(preview(s, s.at('18:40'), 'a', '18:50')!.warnings).toEqual([])
  })
})

describe('D365 – krócej: planowany koniec wcześniej, nie przed teraz', () => {
  it('krótszy blok: `block.shorten`, bez kosztu; „Dalej?” i znacznik wariantów liczą nowy koniec', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    const t = s.at('10:12')
    expect(preview(s, t, 'a', '10:30')).toMatchObject({ minutes: -30, cost: null, refused: null })
    const r = click(s, t, { a: 'resize', block: 'a', to: s.at('10:30') })
    expect(r.ok && r.events).toEqual([{ k: 'block.shorten', block: 'a', at: t, minutes: 30 }])
    expect(plannedEnd(s, s.at('10:20'), 'a')).toBe('10:30')
    expect(edges(s, s.at('10:20')).get('a')?.plannedEnd).toBe(lm('10:30'))
    // „Dalej?” at the new planned end (index 390 = 10:30).
    const qt = s.at('10:31')
    const ctx = s.contextAt(qt)
    const st = s.stateAt(qt)
    expect(questionsOf({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, qt, 'pca'), now: qt }).map((q) => q.id)).toContain(`next:${DATE}:a:390`)
    // The check of variants 2 min past the new 0.
    expect(variantTriggers(s.stateAt(s.at('10:33')), null).time.map((x) => x.id)).toEqual([`overrun:a:390`])
  })

  it('przedłużenie, potem skrócenie: planowany koniec liczy oba', () => {
    const s = day().approve('13:00', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:20'), { a: 'resize', block: 'a', to: s.at('12:00') })
    const r = click(s, s.at('10:40'), { a: 'resize', block: 'a', to: s.at('11:30') })
    expect(r.ok && r.events).toEqual([{ k: 'block.shorten', block: 'a', at: s.at('10:40'), minutes: 30 }])
    expect(plannedEnd(s, s.at('10:41'), 'a')).toBe('11:30')
  })

  it('skrócenie, potem „Przedłuż” za granicę: minuty potwierdzone z góry liczą się od skróconego końca', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 30 })]).approve('10:45', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:05'), { a: 'resize', block: 'a', to: s.at('10:20') })
    // 10:20 → 11:00: 15 min past the boundary, confirmed with „Potwierdź”.
    expect(click(s, s.at('10:10'), { a: 'resize', block: 'a', to: s.at('11:00') })).toMatchObject({ ok: false, confirm: { minutes: 15 } })
    expect(click(s, s.at('10:10'), { a: 'resize', block: 'a', to: s.at('11:00'), confirm: true }).ok).toBe(true)
    const st = s.state('11:15')
    const minute = (time: string) => st.minutes.get(Math.round((s.at(time) - st.grid.start) / 60_000))
    expect(minute('10:50')).toMatchObject({ upfront: true })
    // Past the new planned end (11:00) the minutes were never confirmed.
    expect(minute('11:05')).toMatchObject({ upfront: false })
  })

  it('skrócenie przycina okno potwierdzone startem: bieg za nowy koniec nie jest potwierdzony z góry', () => {
    const started = () => {
      const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 60 })]).approve('10:45', '07:30')
      expect(click(s, s.at('10:00'), { a: 'start', block: 'a' })).toMatchObject({ ok: false, confirm: { minutes: 15 } })
      expect(click(s, s.at('10:00'), { a: 'start', block: 'a', confirm: true }).ok).toBe(true)
      return s
    }
    // Confirmed with the start up to 11:00 …
    expect(minuteOf(started(), '11:05', '10:50')).toMatchObject({ cls: 'after', upfront: true })
    const s = started()
    click(s, s.at('10:20'), { a: 'resize', block: 'a', to: s.at('10:40') })
    // … but after the end dragged to 10:40, the work run on to 11:00 without „Dalej” is unconfirmed past the boundary.
    expect(minuteOf(s, '11:05', '10:50')).toMatchObject({ cls: 'after', upfront: false })
    expect(minuteOf(s, '11:05', '10:58')).toMatchObject({ upfront: false })
  })

  it('„Przedłuż”, potem skrócenie: bieg do starego końca nie jest potwierdzony z góry za nowym końcem', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 30 })]).approve('10:45', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    expect(click(s, s.at('10:10'), { a: 'extend', block: 'a', minutes: 60 })).toMatchObject({ ok: false, confirm: { minutes: 45 } })
    expect(click(s, s.at('10:10'), { a: 'extend', block: 'a', minutes: 60, confirm: true }).ok).toBe(true)
    click(s, s.at('10:40'), { a: 'resize', block: 'a', to: s.at('10:50') })
    expect(minuteOf(s, '11:35', '10:47')).toMatchObject({ upfront: true })
    expect(minuteOf(s, '11:35', '10:55')).toMatchObject({ upfront: false })
    expect(minuteOf(s, '11:35', '11:20')).toMatchObject({ upfront: false })
  })

  it('„Potwierdź” w tej samej minucie, ale po skróceniu, nie jest przycinane (kolejność zdarzeń, nie minuta)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 60 })]).approve('10:00', '07:30')
    expect(click(s, s.at('10:00'), { a: 'start', block: 'a', confirm: true }).ok).toBe(true)
    // 10:20:05 – the end dragged to 10:40; 10:20:25 – „Potwierdź”: up to its planned end with the extensions.
    expect(click(s, s.at('10:20') + 5 * SEC, { a: 'resize', block: 'a', to: s.at('10:40') }).ok).toBe(true)
    expect(click(s, s.at('10:20') + 25 * SEC, { a: 'confirm', block: 'a' }).ok).toBe(true)
    // Run on past 10:40, „Przedłuż +30” at 10:50 (from the planned end): 10:40–10:50 stay confirmed by „Potwierdź”.
    expect(click(s, s.at('10:50'), { a: 'extend', block: 'a', minutes: 30, confirm: true }).ok).toBe(true)
    expect(minuteOf(s, '11:15', '10:45')).toMatchObject({ cls: 'after', upfront: true })
    expect(minuteOf(s, '11:15', '11:05')).toMatchObject({ upfront: true })
  })

  it('„Przedłuż” w `extendedMin` to tylko „Przedłuż” – skrócenie przesuwa sam planowany koniec', () => {
    const s = day().approve('13:00', '07:30')
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:10'), { a: 'resize', block: 'a', to: s.at('10:40') })
    expect(timerNow(s.state('10:11')).fg).toMatchObject({ extendedMin: 0 })
    click(s, s.at('10:20'), { a: 'resize', block: 'a', to: s.at('12:00') })
    click(s, s.at('10:30'), { a: 'resize', block: 'a', to: s.at('11:30') })
    const fg = timerNow(s.state('10:31')).fg!
    expect(fg.extendedMin).toBe(80)
    expect(plannedEnd(s, s.at('10:31'), 'a')).toBe('11:30')
  })

  it('para startu bloku stałego: po skróceniu stałego „Cofnij” już jej nie cofa (jak po „Przedłuż”)', () => {
    const s = day([block({ id: 'f', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true })])
    click(s, s.at('08:00'), { a: 'start', block: 'f' })
    expect(leader(s, '09:00').map((e) => [e.k, e.block])).toEqual([
      ['block.pause', 'f'],
      ['block.start', 'w']
    ])
    const pause = s.state('09:05').facts.autos.find((a) => a.rule === 'fixedStart' && a.k === 'block.pause')!
    expect(click(s, s.at('09:10'), { a: 'resize', block: 'w', to: s.at('09:45') }).ok).toBe(true)
    expect(click(s, s.at('09:15'), { a: 'undo', target: pause.id })).toMatchObject({ ok: false, why: 'tego już nie cofniesz – blok stały ruszył dalej według planu' })
  })

  it('ten sam koniec drugi raz nic nie zapisuje', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:12'), { a: 'resize', block: 'a', to: s.at('10:30') })
    expect(click(s, s.at('10:13'), { a: 'resize', block: 'a', to: s.at('10:30') })).toMatchObject({ ok: true, events: [] })
  })

  it('blok stały z własną godziną: krócej – koniec według planu w nowym miejscu', () => {
    const s = day([block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true, bg: true })])
    leader(s, '09:00')
    expect(edges(s, s.at('09:20')).has('w')).toBe(true)
    click(s, s.at('09:20'), { a: 'resize', block: 'w', to: s.at('09:45') })
    expect(leader(s, '09:44')).toEqual([])
    expect(leader(s, '09:45')).toEqual([expect.objectContaining({ k: 'block.end', block: 'w', autoRule: 'plan', at: s.at('09:45') })])
  })

  it('„Tydzień”: skrócona sesja dodana przez Ciebie nie liczy się jako przedłużona', () => {
    const s = day([block({ id: 'ns', cat: 'sesja', at: '15:30', min: 90, fixed: true, origin: 'user' })])
    s.start('ns', '15:30')
    expect(click(s, s.at('15:40'), { a: 'resize', block: 'ns', to: s.at('16:00') }).ok).toBe(true)
    s.end('ns', '16:00')
    const t = s.at('16:10')
    expect(sessionsOf(s.contextAt(t), s.stateAt(t), 'today')).toMatchObject({ clean: 1, extended: 0 })
  })

  it('eksport CSV: skrócony blok nie jest „przedłużony”', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:12'), { a: 'resize', block: 'a', to: s.at('10:30') })
    click(s, s.at('10:30'), { a: 'next' })
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const rows = csvOf([{ ctx: s.contextAt(s.at('20:00')), names }])['bloki.csv']
    expect(rows).not.toContain('przedłużony')
  })
})

describe('D365 – bez uchwytu: sesja, wykład, zjazd, druga zmiana (dalej „Przedłuż” w pasku)', () => {
  it('trwające sesja, wykład, zajęcia zjazdu, druga zmiana, blok po innym i blok spoza planu nie mają dolnej krawędzi', () => {
    const s = day([
      block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }),
      block({ id: 'p', cat: 'inne', after: 'a', min: 30 }),
      block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, origin: 'session' }),
      block({ id: 'wy', cat: 'wyklad', at: '15:30', min: 90, fixed: true, origin: 'lecture' }),
      block({ id: 'zj', cat: 'zajecia-zdalne', at: '15:30', min: 90, fixed: true, origin: 'zjazd' }),
      block({ id: 'dz', cat: 'inne', at: '15:30', min: 60, tag: 'secondShift' })
    ])
    for (const id of ['a', 'p', 'ny', 'wy', 'zj', 'dz']) s.start(id, '15:30')
    s.start('x', '15:30', { cat: 'inne', min: 30 })
    const t = s.at('15:40')
    expect([...edges(s, t).keys()]).toEqual(['a'])
    for (const id of ['p', 'ny', 'wy', 'zj', 'dz', 'x']) {
      expect(preview(s, t, id, '18:00')).toBeNull()
      expect(click(s, t, { a: 'resize', block: id, to: s.at('18:00') }).ok).toBe(false)
    }
  })

  it('zapauzowany blok nie ma dolnej krawędzi', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:10'), { a: 'pause' })
    expect(edges(s, s.at('10:20')).has('a')).toBe(false)
    expect(click(s, s.at('10:20'), { a: 'resize', block: 'a', to: s.at('11:30') }).ok).toBe(false)
  })
})

describe('D365 – zdarzenie skrócenia w logu', () => {
  it('`block.shorten` z minutami 1–1440 jest znanym zdarzeniem; inne minuty – uszkodzone', () => {
    const line = (minutes: number) => JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: 0, l: 0, v: RULES_VERSION, day: DATE, dom: 'timer', k: 'block.shorten', block: 'a', at: 0, minutes })
    const ok = parseEvent(line(15))
    expect(ok.ok && isKnown(ok.event)).toBe(true)
    expect(parseEvent(line(0)).ok).toBe(false)
    expect(parseEvent(line(-5)).ok).toBe(false)
  })

  it('nowa wersja reguł: starsza wersja ustępuje prowadzenia (nie zna skrócenia)', () => {
    expect(RULES_VERSION).toBe(7)
  })
})
