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

describe('D365 – trwający blok: dolna krawędź nie schodzi przed teraz', () => {
  it('najwcześniejszy koniec to bieżąca chwila zaokrąglona w górę do 5 min', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    expect(edges(s, s.at('10:12') + 30 * SEC).get('a')).toEqual({ block: 'a', earliestEnd: lm('10:15'), plannedEnd: lm('11:00') })
    expect(edges(s, s.at('10:15')).get('a')?.earliestEnd).toBe(lm('10:15'))
    expect(edges(s, s.at('10:15') + SEC).get('a')?.earliestEnd).toBe(lm('10:20'))
    // A proposal before it goes to it.
    const p = preview(s, s.at('10:12') + 30 * SEC, 'a', '10:05')!
    expect(p).toMatchObject({ end: lm('10:15'), to: s.at('10:15'), minutes: -45, cost: null, refused: null })
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

  it('ten sam koniec drugi raz nic nie zapisuje', () => {
    const s = day()
    click(s, s.at('10:00'), { a: 'start', block: 'a' })
    click(s, s.at('10:12'), { a: 'resize', block: 'a', to: s.at('10:30') })
    expect(click(s, s.at('10:13'), { a: 'resize', block: 'a', to: s.at('10:30') })).toMatchObject({ ok: true, events: [] })
  })

  it('blok stały z własną godziną: krócej – koniec według planu w nowym miejscu', () => {
    const s = day([block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true, bg: true })])
    const lead = (time: string) => {
      const t = s.at(time)
      const ctx = s.contextAt(t)
      const st = s.stateAt(t)
      const out = autoActions({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, t, 'pca'), now: t, gate: t })
      s.write(out, t)
      return out.filter((e) => e.autoRule !== 'boundary')
    }
    lead('09:00')
    expect(edges(s, s.at('09:20')).has('w')).toBe(true)
    click(s, s.at('09:20'), { a: 'resize', block: 'w', to: s.at('09:45') })
    expect(lead('09:44')).toEqual([])
    expect(lead('09:45')).toEqual([expect.objectContaining({ k: 'block.end', block: 'w', autoRule: 'plan', at: s.at('09:45') })])
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
