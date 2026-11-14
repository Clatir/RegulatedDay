/**
 * 1.22.0 – the timer (D475, D478): blocks away from the computer begin by themselves at their hour when nothing runs in
 * the foreground and nobody is at a computer, and „Zacznij” on another block while one runs swaps the two – the running
 * one pauses, not done, and stands where the clicked one stood.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, nextDeadline, type AutoEvent } from '@shared/engine/auto'
import { blockAt, pausedPlaceOf } from '@shared/engine/facts'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { autoText } from '@shared/engineView'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

const day = (plan: ReturnType<typeof block>[], settings?: Record<string, unknown>) => new Scenario({ date: DATE, plan, settings })

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

function leader(s: Scenario, time: string, write = true): AutoEvent[] {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
  if (write) s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
}

const fgId = (s: Scenario, time: string) => timerNow(s.state(time)).fg?.info.id ?? null
const placedAt = (s: Scenario, time: string, id: string) => {
  const st = s.state(time)
  const p = st.forecast.find((x) => x.block.id === id)
  return p ? hhmm(st, p.from) : null
}

describe('„Zacznij” na innym bloku zamienia bloki miejscami (D478)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '10:00', min: 30 })]

  it('biegnący pauzuje niedokończony i staje na miejscu klikniętego; „Dalej” idzie po planie i wraca do niego', () => {
    const s = day(plan()).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:20', { a: 'start', block: 'c' })
    expect(r.ok && r.events.map((e) => [e.k, e.block])).toEqual([
      ['block.pause', 'a'],
      ['block.start', 'c']
    ])
    expect(r.ok && r.events[0]!.place).toBe(s.at('10:00'))
    const fa = s.state('08:25').facts.blocks.get('a')!
    expect(fa.endedAt).toBeNull()
    expect(fgId(s, '08:25')).toBe('c')
    // „a” has 40 min left and stands at 10:00, after „b” – it never left the plan.
    expect(placedAt(s, '08:25', 'a')).toBe('10:00')
    expect(placedAt(s, '08:25', 'b')).toBe('09:00')
    click(s, '08:50', { a: 'next' })
    expect(fgId(s, '08:51')).toBe('b')
    const back = click(s, '09:50', { a: 'next' })
    expect(back.ok && back.events.map((e) => e.k)).toEqual(['block.end', 'block.resume'])
    expect(fgId(s, '09:51')).toBe('a')
  })

  it('bez miejsca w prognozie (blok zaczęty poza planem) biegnący czeka jako następny na swoim miejscu', () => {
    const s = day(plan()).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:20', { a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 20 })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.pause', 'block.start'])
    expect(r.ok && 'place' in r.events[0]!).toBe(false)
    expect(placedAt(s, '08:25', 'a')).toBe('08:40')
    expect(timerNow(s.state('08:41')).next?.id).toBe('a')
  })

  it('regeneracja i blok poza komputerem dalej kończą się przy starcie innego bloku (T1130)', () => {
    const s = day([block({ id: 'r', cat: 'regeneracja', at: '08:00', min: 30 }), block({ id: 'p', cat: 'posilek', at: '09:00', min: 30 }), ...plan().slice(1)]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'r' })
    const fromRegen = click(s, '08:10', { a: 'start', block: 'b' })
    expect(fromRegen.ok && fromRegen.events.map((e) => [e.k, e.block])).toEqual([
      ['block.end', 'r'],
      ['block.start', 'b']
    ])
    click(s, '08:20', { a: 'start', block: 'p' })
    const fromMeal = click(s, '08:40', { a: 'start', block: 'c' })
    expect(fromMeal.ok && fromMeal.events.map((e) => [e.k, e.block])).toEqual([
      ['block.end', 'p'],
      ['block.start', 'c']
    ])
  })

  it('blok w chwili planowanego końca albo po nim kończy się jako skończony (T1130)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '10:00', min: 30 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '09:05', { a: 'start', block: 'c' })
    expect(r.ok && r.events.map((e) => [e.k, e.block, e.done])).toEqual([
      ['block.end', 'a', true],
      ['block.start', 'c', undefined]
    ])
  })

  it('miejsce z pauzy nie sięga minut przed pauzą (widok minionej minuty, T1131)', () => {
    const s = day(plan()).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:20', { a: 'start', block: 'c' })
    const fa = s.state('08:30').facts.blocks.get('a')!
    expect(pausedPlaceOf(fa)).not.toBeNull()
    expect(pausedPlaceOf(blockAt(fa, fa.runs[0]!.to))).toBeNull()
    expect(blockAt(fa, fa.runs[0]!.to).runs[0]).not.toHaveProperty('place')
  })

  it('prośba wpisana po fakcie dzieli przebieg – miejsce zostaje przy drugiej połowie (T1131)', () => {
    const s = day(plan()).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:40', { a: 'start', block: 'c' })
    s.raw({ k: 'request.start', request: 'q', at: s.at('08:10'), mode: 'now', person: null, estimateMin: null, hardEndAt: null, splits: ['a'] }, '09:00')
    s.raw({ k: 'request.end', request: 'q', at: s.at('08:20') }, '09:00')
    const st = s.state('09:05')
    const fa = st.facts.blocks.get('a')!
    expect(fa.runs.map((r) => [hhmm(st, r.from), r.place != null])).toEqual([
      ['08:00', false],
      ['08:20', true]
    ])
    // Inside the request the block stood paused at its own place – no swap yet.
    expect(pausedPlaceOf(blockAt(fa, fa.runs[0]!.to + 1))).toBeNull()
  })

  it('praca zamieniona z projektem nie kończy pracy, póki czeka na swoim miejscu, ani po wznowieniu tam (T1132)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'c', cat: 'projekty', at: '10:00', min: 30 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:20', { a: 'start', block: 'c' })
    const st = s.state('09:00')
    expect(st.ends.filter((e) => e.at <= st.now)).toEqual([])
    expect(placedAt(s, '09:00', 'a')).toBe('10:00')
    click(s, '09:00', { a: 'finish', block: 'c' })
    // Not resumed within 15 min of its place: the end of work stands where it stopped, as a block never started.
    const idle = s.state('10:30')
    expect(idle.ends.map((e) => hhmm(idle, e.at))).toEqual(['08:20'])
    expect(click(s, '10:05', { a: 'start', block: 'a', confirm: true }).ok).toBe(true)
    const later = s.state('10:30')
    expect(later.ends.filter((e) => e.at <= later.now)).toEqual([])
  })
})

describe('bloki bez komputera zaczynają się same (D475)', () => {
  const meal = (o: Partial<Parameters<typeof block>[0]> = {}) => block({ id: 'p', cat: 'posilek', at: '13:00', min: 30, ...o })
  /** A day used from 07:00, nobody at a computer from `away` (and back at `back`). */
  const used = (plan: ReturnType<typeof block>[], away = '12:50', back: string | null = null) => day(plan).observe('07:00', null).gap(away, back)

  it('o swojej godzinie, gdy nic nie biegnie i nikogo nie ma przy komputerze – na liście z „Cofnij”; kończy go powrót', () => {
    const s = used([meal()], '12:50', '13:25')
    expect(leader(s, '12:59')).toEqual([])
    // Known as away once 2 min of its time have passed without input.
    expect(leader(s, '13:01')).toEqual([])
    expect(leader(s, '13:02')).toMatchObject([{ k: 'block.start', block: 'p', at: s.at('13:00'), bg: false, how: 'auto', autoRule: 'awayStart' }])
    expect(fgId(s, '13:03')).toBe('p')
    expect(leader(s, '13:04')).toEqual([])
    const a = s.state('13:05').facts.autos.find((x) => x.rule === 'awayStart')!
    expect(autoText(a, 'Posiłek', '13:00')).toBe('Posiłek zaczęty o 13:00 (bez komputera, według planu)')
    expect(leader(s, '13:26')).toMatchObject([{ k: 'block.end', block: 'p', at: s.at('13:25'), autoRule: 'firstUse' }])
    // The exact timer of the main process is set on its hour.
    expect(nextDeadline(s.state('12:00'))).toBe(s.at('13:00'))
  })

  it('przy komputerze (wejście trwa) nie zaczyna się; zaczyna się, gdy wejście ustaje w jego czasie', () => {
    const busy = day([meal()]).observe('07:00', null)
    for (const t of ['13:00', '13:10', '13:29', '13:45']) expect(leader(busy, t)).toEqual([])
    const s = day([meal()]).observe('07:00', null).gap('13:10', '13:40')
    expect(leader(s, '13:11')).toEqual([])
    expect(leader(s, '13:12')).toMatchObject([{ block: 'p', at: s.at('13:10') }])
    expect(leader(s, '13:41')).toMatchObject([{ k: 'block.end', block: 'p', at: s.at('13:40'), autoRule: 'firstUse' }])
  })

  it('rutyny, prośby domowe, sprawy i regeneracja tak samo; dojazd, wariant przy komputerze i praca nie (T1134)', () => {
    for (const cat of ['rutyny', 'prosby', 'sprawy', 'regeneracja']) expect(leader(used([block({ id: 'p', cat, at: '13:00', min: 30 })]), '13:02').map((e) => e.block)).toEqual(['p'])
    for (const b of [block({ id: 'p', cat: 'dojazd', at: '13:00', min: 30 }), block({ id: 'p', cat: 'regeneracja', variant: 'gra', at: '13:00', min: 30 }), block({ id: 'p', cat: 'inne', at: '13:00', min: 30 })]) {
      const s = used([b])
      expect(leader(s, '13:02')).toEqual([])
      expect(nextDeadline(s.state('12:00'))).toBeNull()
    }
  })

  it('gdy coś biegnie o jego godzinie – zaczyna się po tym, póki trwa jego planowany czas', () => {
    const s = used([block({ id: 'a', cat: 'inne', at: '12:00', min: 70 }), meal()], '13:10')
    click(s, '12:00', { a: 'start', block: 'a' })
    expect(leader(s, '13:00')).toEqual([])
    click(s, '13:10', { a: 'finish', block: 'a' })
    expect(leader(s, '13:12')).toMatchObject([{ block: 'p', at: s.at('13:10') }])
    // Its time over before the foreground was free: it does not begin.
    const late = used([block({ id: 'a', cat: 'inne', at: '12:00', min: 100 }), meal()], '13:40')
    click(late, '12:00', { a: 'start', block: 'a' })
    click(late, '13:40', { a: 'finish', block: 'a' })
    expect(leader(late, '13:45')).toEqual([])
  })

  it('nigdy: zakotwiczony (D194), w tle, po porze snu, w „Odcinam się”, w czasie prośby, przed pierwszym użyciem dnia (D337)', () => {
    const anchored = used([block({ id: 'a', cat: 'inne', at: '12:00', min: 30 }), block({ id: 'p', cat: 'posilek', after: 'a', min: 30 })], '12:30')
    click(anchored, '12:00', { a: 'start', block: 'a' })
    click(anchored, '12:30', { a: 'finish', block: 'a' })
    expect(leader(anchored, '12:35')).toEqual([])
    expect(leader(used([meal({ bg: true })]), '13:05')).toEqual([])
    const night = used([block({ id: 'p', cat: 'rutyny', at: '23:30', min: 30 })], '23:00')
    expect(night.state('23:30').bedtime.effective).toBeLessThanOrEqual(night.state('23:30').now)
    expect(leader(night, '23:35')).toEqual([])
    expect(leader(used([meal()]).disconnect('12:30', null), '13:05')).toEqual([])
    expect(leader(used([meal()]).request('q', '12:55', null), '13:05')).toEqual([])
    expect(leader(day([meal()]), '13:05')).toEqual([])
    // A late wake: nobody used a computer before 09:20 – the morning routine is not written as done while you slept.
    const lateWake = day([block({ id: 'r', cat: 'rutyny', at: '07:00', min: 45 })]).observe('09:20', null)
    expect(leader(lateWake, '09:21')).toEqual([])
    lateWake.gap('09:30', null)
    expect(leader(lateWake, '09:40')).toEqual([])
  })

  it('„Cofnij” zabiera start i jego koniec; ten blok nie zaczyna się już sam tego dnia', () => {
    const s = used([meal({ min: 60 }), block({ id: 'x', cat: 'inne', at: '15:00', min: 30 })], '13:00', '13:20')
    const [start] = leader(s, '13:02')
    expect(leader(s, '13:21')).toMatchObject([{ k: 'block.end', block: 'p', autoRule: 'firstUse' }])
    const r = click(s, '13:25', { a: 'undo', target: start!.id })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['undo', 'undo'])
    const f = s.state('13:26').facts.blocks.get('p')
    expect(f?.startedAt ?? null).toBeNull()
    expect(s.state('13:26').facts.problems).toEqual([])
    s.gap('13:30', null)
    expect(leader(s, '13:40')).toEqual([])
  })

  it('po Twoim kliknięciu na tym bloku start jest już tylko informacją (T1136)', () => {
    const s = used([meal({ min: 60 }), block({ id: 'x', cat: 'inne', at: '15:00', min: 30 })], '12:50', '13:10')
    const [start] = leader(s, '13:02')
    // Back at the computer, „Zacznij” on another block before the first use ended the meal: the click ends it.
    expect(click(s, '13:10', { a: 'start', block: 'x' }).ok).toBe(true)
    expect(click(s, '13:15', { a: 'undo', target: start!.id })).toMatchObject({ ok: false })
    expect(s.state('13:16').facts.problems).toEqual([])
  })

  it('posiłek z przodu, który limit skończył przed startem bloku stałego, nie spycha go w tło (T1135)', () => {
    const s = day([block({ id: 'p', cat: 'posilek', at: '12:00', min: 30 }), block({ id: 'f', cat: 'analiza', at: '13:30', min: 60, fixed: true })]).observe('07:00', null)
    click(s, '12:00', { a: 'start', block: 'p' })
    s.gap('12:00', '14:00')
    // The leader was not running meanwhile (the computer asleep): at 14:01 the meal ended at its limit 13:00.
    const out = leader(s, '14:01')
    expect(out.map((e) => [e.k, e.block, e.autoRule])).toEqual([
      ['block.start', 'f', 'fixedStart'],
      ['block.end', 'p', 'limit']
    ])
    expect(out[0]).toMatchObject({ bg: false, at: s.at('13:30') })
    expect(fgId(s, '14:02')).toBe('f')
  })

  it('start bez komputera przed startem stałego w tym samym przebiegu idzie pierwszy (T1137)', () => {
    const s = used([meal(), block({ id: 'f', cat: 'analiza', at: '14:15', min: 60, fixed: true })], '12:50', '14:30')
    const first = leader(s, '14:31')
    expect(first.map((e) => [e.k, e.block, e.autoRule])).toEqual([['block.start', 'p', 'awayStart']])
    // Judged with the meal in front: it ended at its limit (14:00) before 14:15 – the fixed block takes the foreground.
    const second = leader(s, '14:31')
    expect(second.map((e) => [e.k, e.block, e.autoRule])).toEqual([
      ['block.start', 'f', 'fixedStart'],
      ['block.end', 'p', 'limit']
    ])
    expect(second[0]).toMatchObject({ bg: false })
  })
})
