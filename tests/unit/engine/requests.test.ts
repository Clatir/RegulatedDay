/**
 * Requests in the day (E5, spec „Prośba”, „Przerwania”): „zrobione teraz” and urgent pause the flexible block (a fixed one
 * goes on in the background), „Koniec” resumes it by itself unless that costs minutes after the boundary; written in
 * after the fact a request splits a running flexible block; without „Koniec” a request ends at the first use after 2 min
 * without input, at its limit (60 min, or the estimate plus 30) or the bedtime; „jeszcze trwa”; the counters.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, autoActions, questionsOf } from '@shared/engine/auto'
import { requestAction, requestCounters, type RequestAction } from '@shared/engine/requests'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { autoText } from '@shared/engineView'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28'

function act(s: Scenario, time: string, a: RequestAction | TimerAction) {
  const t = s.at(time)
  const state = s.stateAt(t)
  const r = a.a.startsWith('request') ? requestAction(state, a as RequestAction, t) : timerAction(s.contextAt(t), state, a as TimerAction, t)
  if (r.ok) s.write(r.events, t)
  return r
}

function leader(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }).filter((e) => e.autoRule !== 'boundary')
  s.write(out, t)
  return out
}

const fg = (s: Scenario, time: string) => timerNow(s.state(time)).fg?.info.id ?? null

describe('prośby w dniu', () => {
  it('„zrobione teraz” pauzuje blok elastyczny, „Koniec” wznawia go sam (zrobione automatycznie)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    act(s, '08:00', { a: 'start', block: 'a' })
    const r = act(s, '08:30', { a: 'requestNow', request: 'r1', person: 'mama' })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.pause', 'request.start'])
    expect(fg(s, '08:35')).toBeNull()
    // Its 30 min left from 08:40 end at 09:10 – inside the boundary (approved on its own at 08:00: 09:00 + 15 min).
    const end = act(s, '08:40', { a: 'requestEnd', request: 'r1' })
    expect(end.ok && end.events.map((e) => [e.k, e.autoRule])).toEqual([
      ['request.end', undefined],
      ['block.resume', 'requestResume']
    ])
    expect(fg(s, '08:41')).toBe('a')
    expect(s.state('08:42').facts.autos.map((x) => x.rule)).toContain('requestResume')
  })

  it('blok stały nie pauzuje: w czasie prośby jest w tle, potem wraca na pierwszy plan', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 120, fixed: true })] }).observe('07:00', null)
    leader(s, '09:00')
    act(s, '09:30', { a: 'requestNow', request: 'r1', person: 'mama', urgent: true, estimateMin: 10 })
    const mid = timerNow(s.state('09:35'))
    expect(mid.bg.map((b) => b.info.id)).toEqual(['w'])
    act(s, '09:40', { a: 'requestEnd', request: 'r1' })
    expect(fg(s, '09:41')).toBe('w')
  })

  it('wznowienie, które dałoby niepotwierdzone minuty po granicy, czeka jako „Wznów · Zaparkuj”', () => {
    // The same block as above, with the boundary approved at its planned end: resumed at 08:50, it would end at 09:20.
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    s.approve('09:00', '07:30')
    act(s, '08:00', { a: 'start', block: 'a' })
    act(s, '08:30', { a: 'requestNow', request: 'r1', person: 'mama' })
    const end = act(s, '08:50', { a: 'requestEnd', request: 'r1' })
    expect(end.ok && end.events.map((e) => e.k)).toEqual(['request.end'])
    expect(timerNow(s.state('08:51')).paused.map((p) => p.info.id)).toEqual(['a'])
  })

  it('prośba dopisana po fakcie nad biegnącym blokiem elastycznym dzieli go na dwie części', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 180 })] }).observe('07:00', null)
    act(s, '08:00', { a: 'start', block: 'a' })
    act(s, '10:00', { a: 'requestAfter', request: 'r1', person: 'mama', from: s.at('09:00'), to: s.at('09:20') })
    const f = s.state('10:01').facts.blocks.get('a')!
    expect(f.runs.map((r) => [hhmm(s.state('10:01'), r.from), r.to === Number.POSITIVE_INFINITY ? 'teraz' : hhmm(s.state('10:01'), r.to)])).toEqual([
      ['08:00', '09:00'],
      ['09:20', 'teraz']
    ])
  })

  it('bez „Koniec”: przy pierwszym użyciu po 2 min bez wejścia, z pytaniem po powrocie; „jeszcze trwa” – do limitu', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    act(s, '10:00', { a: 'requestNow', request: 'r1', person: 'mama' })
    s.gap('10:01', '10:20')
    const ends = leader(s, '10:21')
    expect(ends).toEqual([expect.objectContaining({ k: 'request.end', autoRule: 'firstUse', at: s.at('10:20') })])
    const t = s.at('10:22')
    const ctx = s.contextAt(t)
    const q = questionsOf({ ctx, state: s.stateAt(t), activity: activityOf(ctx.events, s.stateAt(t).grid.start, t, 'pca'), now: t }).find((x) => x.kind === 'request')!
    expect(q.answers.map((a) => a.id)).toEqual(['keep', 'endedAt', 'ongoing'])
    s.write(answerEvents(s.stateAt(t), q, 'ongoing', t)!, t)
    expect(s.state('10:23').facts.requests[0]!.to).toBe(Number.POSITIVE_INFINITY)
    // Used again: no second end at the first use – it lasts to its limit, 60 min after its start.
    s.gap('10:30', '10:40')
    expect(leader(s, '10:41')).toEqual([])
    expect(leader(s, '11:00')).toEqual([expect.objectContaining({ k: 'request.end', autoRule: 'limit', at: s.at('11:00') })])
  })

  it('późniejszy log z wcześniejszym użyciem cofa koniec przy pierwszym użyciu razem ze wznowieniem bloku', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    act(s, '08:00', { a: 'start', block: 'a' })
    act(s, '08:10', { a: 'requestNow', request: 'r1', person: 'mama' })
    s.gap('08:11', '08:20')
    expect(leader(s, '08:21').map((e) => [e.k, e.autoRule])).toEqual([
      ['request.end', 'firstUse'],
      ['block.resume', 'requestResume']
    ])
    // The other computer's log comes later: it was used from 08:14.
    s.observe('08:14', null, 'pcb').alive('08:21', 'pcb')
    expect(leader(s, '08:22').map((e) => [e.k, e.autoRule])).toEqual([
      ['undo', 'revalidate'],
      ['undo', 'revalidate']
    ])
    expect(leader(s, '08:23')).toEqual([expect.objectContaining({ k: 'request.end', autoRule: 'firstUse', at: s.at('08:14') }), expect.objectContaining({ k: 'block.resume', at: s.at('08:14') })])
    const st = s.state('08:24')
    expect(hhmm(st, st.facts.requests[0]!.to!)).toBe('08:14')
    expect(hhmm(st, st.facts.blocks.get('a')!.runs.at(-1)!.from)).toBe('08:14')
  })

  it('limit pilnej prośby z szacunkiem 45 min: szacunek + 30 min, zapisany dopiero przy pierwszym użyciu (T372); pytanie po nim', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    act(s, '10:00', { a: 'requestNow', request: 'r1', person: 'mama', urgent: true, estimateMin: 45 })
    expect(leader(s, '11:20')).toEqual([])
    s.gap('10:01', '11:30')
    expect(leader(s, '11:31')).toEqual([expect.objectContaining({ autoRule: 'limit', at: s.at('11:15') })])
    // „Trwała do teraz” takes the limit away: it ends at the answer.
    const t = s.at('11:32')
    const ctx = s.contextAt(t)
    const q = questionsOf({ ctx, state: s.stateAt(t), activity: activityOf(ctx.events, s.stateAt(t).grid.start, t, 'pca'), now: t }).find((x) => x.kind === 'request')!
    expect(q.answers.map((a) => a.id)).toEqual(['keep', 'untilNow', 'endedAt'])
    s.write(answerEvents(s.stateAt(t), q, 'untilNow', t)!, t)
    expect(hhmm(s.state('11:33'), s.state('11:33').facts.requests[0]!.to)).toBe('11:32')
  })

  it('bez nikogo przy komputerze do pory snu: koniec o wcześniejszym z limitu i pory snu', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    const bed = s.state('12:00').bedtime.effective
    const bedAt = s.stateAt(s.at('12:00')).grid.start + bed * 60_000
    s.write([{ k: 'request.start', request: 'r1', at: bedAt - 30 * 60_000, mode: 'now', person: null, estimateMin: null, hardEndAt: null, interrupts: null }], bedAt - 30 * 60_000)
    s.gap(hhmm(s.state('12:00'), bed - 29)!, null)
    const t = bedAt + 60_000
    const state = s.stateAt(t)
    const ctx = s.contextAt(t)
    const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }).filter((e) => e.k === 'request.end')
    expect(out).toEqual([expect.objectContaining({ autoRule: 'bedtime', at: bedAt })])
  })

  it('„Cofnij” końca przy pierwszym użyciu cofa też wznowienie bloku; prośba kończy się potem limitem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    s.approve('12:00', '07:30')
    act(s, '08:00', { a: 'start', block: 'a' })
    act(s, '08:10', { a: 'requestNow', request: 'r1', person: 'mama' })
    s.gap('08:11', '08:20')
    leader(s, '08:21')
    const end = s.state('08:22').facts.autos.find((x) => x.k === 'request.end')!
    const undo = act(s, '08:25', { a: 'undo', target: end.id })
    expect(undo.ok && undo.events.map((e) => e.k)).toEqual(['undo', 'undo'])
    expect(fg(s, '08:26')).toBeNull()
    expect(s.state('08:26').facts.requests[0]!.to).toBe(Number.POSITIVE_INFINITY)
    // The first use is undone: at the limit (09:10) – the user is at the computer since 08:20.
    expect(leader(s, '09:00')).toEqual([])
    expect(leader(s, '09:11').map((e) => [e.k, e.autoRule])).toEqual([
      ['request.end', 'limit'],
      ['block.resume', 'requestResume']
    ])
  })

  it('„Jeszcze trwa” cofa wznowienie bloku razem z końcem; „Skończyła się o…” wznawia blok wtedy', () => {
    const run = (answer: 'ongoing' | 'endedAt') => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
      act(s, '08:00', { a: 'start', block: 'a' })
      act(s, '08:10', { a: 'requestNow', request: 'r1', person: 'mama' })
      s.gap('08:11', '08:20')
      leader(s, '08:21')
      const t = s.at('08:22')
      const ctx = s.contextAt(t)
      const q = questionsOf({ ctx, state: s.stateAt(t), activity: activityOf(ctx.events, s.stateAt(t).grid.start, t, 'pca'), now: t }).find((x) => x.kind === 'request')!
      s.write(answerEvents(s.stateAt(t), q, answer, t, s.at('08:15'))!, t)
      return s
    }
    const ongoing = run('ongoing')
    expect(fg(ongoing, '08:23')).toBeNull()
    expect(timerNow(ongoing.state('08:23')).paused.map((p) => p.info.id)).toEqual(['a'])
    const ended = run('endedAt')
    const st = ended.state('08:23')
    expect(hhmm(st, st.facts.requests[0]!.to)).toBe('08:15')
    expect(hhmm(st, st.facts.blocks.get('a')!.runs.at(-1)!.from)).toBe('08:15')
    expect(fg(ended, '08:23')).toBe('a')
  })

  it('druga prośba w trakcie pierwszej: blok wraca dopiero po ostatniej', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    act(s, '08:00', { a: 'start', block: 'a' })
    act(s, '08:10', { a: 'requestNow', request: 'r1', person: 'mama' })
    act(s, '08:12', { a: 'requestNow', request: 'r2', person: 'ola' })
    const e1 = act(s, '08:15', { a: 'requestEnd', request: 'r1' })
    expect(e1.ok && e1.events.map((e) => e.k)).toEqual(['request.end'])
    expect(fg(s, '08:16')).toBeNull()
    const e2 = act(s, '08:20', { a: 'requestEnd', request: 'r2' })
    expect(e2.ok && e2.events.map((e) => e.k)).toEqual(['request.end', 'block.resume'])
    expect(fg(s, '08:21')).toBe('a')
  })

  it('szacunek pilnej prośby poza 1–480 min – odmowa; blok czekający na „Zacznij” idzie w tło, nie pauzuje', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    expect(act(s, '10:00', { a: 'requestNow', request: 'r1', person: null, urgent: true, estimateMin: 0 }).ok).toBe(false)
    expect(act(s, '10:00', { a: 'requestNow', request: 'r1', person: null, urgent: true, estimateMin: 100_000 }).ok).toBe(false)
    expect(act(s, '10:00', { a: 'requestNow', request: 'r1', person: null, urgent: true })).toMatchObject({ ok: true, events: [expect.objectContaining({ estimateMin: 15 })] })
    const w = new Scenario({ date: DATE, plan: [block({ id: 'x', cat: 'analiza', at: '10:00', min: 60, tag: 'weeklyAnalysis' })] }).observe('07:00', null)
    const info = w.state('10:00').blocks.find((b) => b.id === 'x')!
    expect(info.waits).toBe(true)
    act(w, '10:00', { a: 'start', block: 'x' })
    const r = act(w, '10:10', { a: 'requestNow', request: 'r1', person: null })
    expect(r.ok && r.events[0]).toMatchObject({ k: 'block.fg', block: 'x', bg: true })
  })

  it('prośba po fakcie dzieli też blok już skończony i odmawia, gdy nachodzi na inną prośbę', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).observe('07:00', null)
    act(s, '08:00', { a: 'start', block: 'a' })
    s.end('a', '10:00')
    act(s, '11:00', { a: 'requestAfter', request: 'r1', person: 'mama', from: s.at('09:00'), to: s.at('09:20') })
    const st = s.state('11:01')
    expect(st.facts.blocks.get('a')!.runs.filter((r) => r.to > r.from).map((r) => [hhmm(st, r.from), hhmm(st, r.to)])).toEqual([
      ['08:00', '09:00'],
      ['09:20', '10:00']
    ])
    expect(act(s, '11:05', { a: 'requestAfter', request: 'r2', person: 'ola', from: s.at('09:10'), to: s.at('09:30') })).toMatchObject({ ok: false, why: 'w tym czasie jest już prośba' })
  })

  it('lista „zrobione automatycznie” nazywa koniec prośby i wznowienie bloku po polsku', () => {
    const a = { id: 'x', c: 'pca', at: 0, block: null, request: 'r1' }
    expect(autoText({ ...a, k: 'request.end', rule: 'firstUse' }, '', '10:20')).toBe('Prośba do 10:20 (pierwsze użycie komputera)')
    expect(autoText({ ...a, k: 'block.resume', rule: 'requestResume', block: 'a' }, 'Inne obowiązki', '10:20')).toBe('Inne obowiązki wznowiony o 10:20 (po prośbie)')
    expect(autoText({ ...a, k: 'block.fg', rule: 'requestResume', block: 'w' }, 'Zajęcia zdalne', '10:20')).toBe('Zajęcia zdalne znów na pierwszym planie o 10:20 (po prośbie)')
  })

  it('liczniki: prośba z dawnego dnia bez końca liczy się najwyżej do swojego limitu', () => {
    const s = new Scenario({ date: '2026-10-26', plan: [] })
    s.write([{ k: 'request.start', request: 'a', at: s.at('22:50'), mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null }], s.at('22:50'))
    const c = requestCounters([{ date: '2026-10-26', events: s.events }], '2026-10-28', '2026-10-26', Date.UTC(2026, 9, 28, 20))
    expect(c.week).toEqual({ count: 1, minutes: 60 })
  })

  it('liczniki: liczba i minuty dziś, w tygodniu i dla każdej osoby', () => {
    const day = (date: string, list: Array<[string, string, string, string]>) => {
      const s = new Scenario({ date, plan: [] })
      for (const [id, person, from, to] of list) {
        s.write([{ k: 'request.start', request: id, at: s.at(from), mode: 'now', person, estimateMin: null, hardEndAt: null }], s.at(from))
        s.write([{ k: 'request.end', request: id, at: s.at(to) }], s.at(to))
      }
      return { date, events: s.events }
    }
    const c = requestCounters([day('2026-10-26', [['a', 'mama', '10:00', '10:20']]), day('2026-10-28', [['b', 'mama', '09:00', '09:15'], ['c', 'ola', '12:00', '12:45']])], '2026-10-28', '2026-10-26', Date.UTC(2026, 9, 28, 20))
    expect(c.today).toEqual({ count: 2, minutes: 60 })
    expect(c.week).toEqual({ count: 3, minutes: 80 })
    expect(c.byPerson).toEqual({ mama: { count: 2, minutes: 35 }, ola: { count: 1, minutes: 45 } })
  })
})
