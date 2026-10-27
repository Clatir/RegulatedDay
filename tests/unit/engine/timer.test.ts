/**
 * The timer (spec „Timer”, „Bloki”, „Przedłużenie i przekroczenie”) and what the app does by itself (spec „Działania
 * automatyczne”, „Bezczynność i nieobecność”): clicks as events, the second click after the boundary, fixed blocks by
 * their plan, „Dalej?” counted from its seeing, the idle threshold, blocks away from the computer, absences, a close of
 * the app with a block running, and „Cofnij”.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, autoActions, questionsOf, type AutoEvent } from '@shared/engine/auto'
import { requestAction } from '@shared/engine/requests'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { block, hhmm, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function day(plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })], settings?: Record<string, unknown>) {
  return new Scenario({ date: DATE, plan, settings })
}

/** A click at `time`: the events the timer writes (asserting it does something). */
function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const r = timerAction(ctx, s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

/** The leader's automatic actions at `time` (gate = now), written; the boundary's own approval is left out of the result. */
function leader(s: Scenario, time: string, o: { write?: boolean; boundary?: boolean } = {}): AutoEvent[] {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const activity = activityOf(ctx.events, state.grid.start, t, 'pca')
  const out = autoActions({ ctx, state, activity, now: t, gate: t })
  if (o.write !== false) s.write(out, t)
  return o.boundary ? out : out.filter((e) => e.autoRule !== 'boundary')
}

function questions(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t })
}

const fgId = (s: Scenario, time: string) => timerNow(s.state(time)).fg?.info.id ?? null

describe('kliknięcia timera', () => {
  it('Start, Pauza, Wznów i Dalej – następny blok elastyczny z planu', () => {
    const s = day().observe('07:00', null)
    expect(click(s, '08:00', { a: 'start', block: 'a' }).ok).toBe(true)
    expect(fgId(s, '08:10')).toBe('a')
    click(s, '08:20', { a: 'pause' })
    expect(fgId(s, '08:25')).toBeNull()
    expect(timerNow(s.state('08:25')).paused.map((p) => p.info.id)).toEqual(['a'])
    click(s, '08:30', { a: 'start', block: 'a' })
    const st = s.state('08:40')
    // 60 min with 10 min of pause: the planned end moves by the pause.
    expect(hhmm(st, timerNow(st).fg!.plannedEnd)).toBe('09:10')
    click(s, '09:10', { a: 'next' })
    expect(fgId(s, '09:15')).toBe('b')
    const fa = s.state('09:15').facts.blocks.get('a')!
    expect(fa.done).toBe(true)
  })

  it('Dalej po zatwierdzonej granicy: pierwsze kliknięcie kończy blok i pokazuje koszt, drugie zaczyna następny', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })]).observe('07:00', null)
    s.approve('09:15', '07:30')
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '09:00', { a: 'next' })
    expect(r.ok).toBe(true)
    expect(r.confirm).toMatchObject({ block: 'b', minutes: 45 })
    expect(fgId(s, '09:01')).toBeNull()
    const r2 = click(s, '09:02', { a: 'start', block: 'b', confirm: true })
    expect(r2.ok).toBe(true)
    const st = s.state('09:30')
    expect(timerNow(st).fg?.info.id).toBe('b')
    expect(st.facts.blocks.get('b')!.confirms.length).toBe(1)
  })

  it('Start bloku pracy za granicą bez potwierdzenia nic nie zaczyna, tylko podaje koszt', () => {
    const s = day().observe('07:00', null)
    s.approve('08:30', '07:30')
    const r = click(s, '08:00', { a: 'start', block: 'a' })
    expect(r.ok).toBe(false)
    expect(r.confirm).toMatchObject({ block: 'a', minutes: 30, overrun: false })
    expect(fgId(s, '08:05')).toBeNull()
  })

  it('Koniec pracy kończy blok pracy i parkuje resztę elastycznych bloków pracy (poza „po końcu pracy jak projekt”)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '19:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:50', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.end', 'work.end', 'block.park'])
    const st = s.state('09:00')
    expect(st.facts.blocks.get('b')!.parkedAt).not.toBeNull()
    expect(st.facts.blocks.get('n')?.parkedAt ?? null).toBeNull()
    expect(st.ends.at(-1)).toMatchObject({ confirmed: true })
    expect(timerNow(st).workEndConfirmed).toBe(true)
    // „Cofnij” of the parking (an automatic action) brings the block back.
    const park = st.facts.autos.find((a) => a.k === 'block.park')!
    expect(park.rule).toBe('workEnd')
    s.write([{ k: 'undo', at: s.at('09:05'), target: park.id }], s.at('09:05'))
    expect(s.state('09:10').facts.blocks.get('b')?.parkedAt ?? null).toBeNull()
  })

  it('Koniec pracy nic nie parkuje, gdy w planie przed drugą zmianą zostaje blok stały pracy (D216)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '16:00', min: 90, fixed: true })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:50', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.end', 'work.end'])
  })

  it('blok stały się nie pauzuje; Skończyłem kończy sesję i niczego nie zaczyna', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false }), block({ id: 'b', cat: 'inne', at: '18:00', min: 60 })]).observe('07:00', null)
    expect(timerNow(s.state('15:40')).waiting.map((b) => b.id)).toEqual(['ny'])
    click(s, '15:40', { a: 'start', block: 'ny' })
    expect(click(s, '16:00', { a: 'pause' })).toMatchObject({ ok: false, why: 'blok stały się nie pauzuje' })
    const r = click(s, '16:30', { a: 'finish' })
    expect(r.ok && r.events).toEqual([expect.objectContaining({ k: 'block.end', block: 'ny', rule: 'finished' })])
    expect(fgId(s, '16:31')).toBeNull()
  })
})

describe('działania automatyczne prowadzącego', () => {
  it('blok stały zaczyna się sam o czasie z planu i pauzuje biegnący blok elastyczny; Dalej po nim wznawia przerwany', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const out = leader(s, '09:00')
    expect(out.map((e) => [e.k, e.block, e.autoRule])).toEqual([
      ['block.pause', 'a', 'fixedStart'],
      ['block.start', 'w', 'fixedStart']
    ])
    // Written once: the next check writes nothing more.
    expect(leader(s, '09:01')).toEqual([])
    expect(fgId(s, '09:05')).toBe('w')
    expect(timerNow(s.state('09:05')).paused.map((p) => p.info.id)).toEqual(['a'])
    // 10 min after its planned end without a reaction it ends at its planned end.
    expect(leader(s, '10:05')).toEqual([])
    const end = leader(s, '10:10')
    expect(end).toEqual([expect.objectContaining({ k: 'block.end', block: 'w', autoRule: 'fixedNoReaction', at: s.at('10:00') })])
    expect(timerNow(s.state('10:11')).next?.id).toBe('a')
    click(s, '10:12', { a: 'next' })
    expect(fgId(s, '10:13')).toBe('a')
  })

  it('blok stały sprzed pierwszego użycia komputera zaczyna się przy pierwszym użyciu („do potwierdzenia”)', () => {
    const s = day([block({ id: 'w', cat: 'zajecia-zdalne', at: '08:00', min: 90, fixed: true })]).observe('08:20', null)
    expect(leader(s, '08:10')).toEqual([])
    expect(leader(s, '08:21')).toEqual([expect.objectContaining({ k: 'block.start', block: 'w', at: s.at('08:20') })])
  })

  it('Przedłuż bloku stałego zakończonego przez plan działa do 30 min po planowanym końcu i cofa koniec', () => {
    const s = day([block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true, bg: true })]).observe('07:00', null)
    leader(s, '09:00')
    expect(leader(s, '10:00')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'plan' })])
    // The boundary approved itself at 09:00 (10:15): a late „Przedłuż” costs only the minutes after the click (10:20–10:30).
    expect(click(s, '10:20', { a: 'extend', block: 'w', minutes: 30 })).toMatchObject({ ok: false, confirm: { minutes: 10 } })
    const r = click(s, '10:20', { a: 'extend', block: 'w', minutes: 30, confirm: true })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['undo', 'block.extend'])
    const st = s.state('10:25')
    expect(timerNow(st).bg.map((b) => b.info.id)).toEqual(['w'])
    expect(hhmm(st, timerNow(st).bg[0]!.plannedEnd)).toBe('10:30')
    // A new end at the new planned end, with a new id.
    expect(leader(s, '10:30')).toEqual([expect.objectContaining({ k: 'block.end', at: s.at('10:30') })])
    expect(click(s, '11:01', { a: 'extend', block: 'w', minutes: 15 }).ok).toBe(false)
  })

  it('sesja kończy się o planowanym końcu, także gdy dalej używasz komputera', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true, bg: false })]).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    expect(leader(s, '16:29')).toEqual([])
    expect(leader(s, '16:30')).toEqual([expect.objectContaining({ k: 'block.end', block: 'ny', autoRule: 'plan' })])
  })

  it('sesja kończy się w chwili ostatniego wejścia poza aplikacją, gdy przez 30 min nie ma obecności (D193)', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 300, fixed: true, bg: false })]).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    s.gap('16:00', null, { lastOutside: '15:58' })
    expect(leader(s, '16:29')).toEqual([])
    expect(leader(s, '16:30')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'lastInput', at: s.at('15:58') })])
  })

  it('„Dalej?” liczy się od zobaczenia: drugie pytanie 30 min po nim, koniec godzinę po zobaczeniu (D238), w chwili pierwszego zobaczenia', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const q = questions(s, '09:00')
    expect(q).toEqual([expect.objectContaining({ kind: 'next', block: 'a', dot: true, seenAt: null })])
    expect(q[0]!.answers.map((x) => x.id)).toEqual(['next', 'extend', 'workEnd'])
    s.seen(q[0]!.id, '09:20')
    expect(questions(s, '09:49')[0]!.kind).toBe('next')
    const q2 = questions(s, '09:50')[0]!
    expect(q2).toMatchObject({ kind: 'next2', silent: true })
    // Seen at least 10 min after the planned end: „Skończył się o 09:00”.
    expect(q2.answers.map((x) => x.label)).toContain('Skończył się o 09:00')
    // Nobody sees the second (silent) ask – you left after the first: the block still ends an hour after it was seen.
    expect(leader(s, '10:19')).toEqual([])
    expect(leader(s, '10:20')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'twoQuestions', at: s.at('09:20') })])
  })

  it('niezobaczone „Dalej?”: blok przy komputerze kończy próg bezczynności w chwili ostatniego wejścia, nie przed planowanym końcem', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    // Input stops at 08:50 – before the planned end: at 09:00 the threshold has passed, the end is at the planned end.
    s.gap('08:50', null)
    expect(leader(s, '08:59')).toEqual([])
    expect(leader(s, '09:00')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'idle', at: s.at('09:00') })])
    // Away longer than the absence question's threshold (from before the planned end): that end wins – when you left.
    const out = leader(s, '09:20')
    expect(out.map((e) => [e.k, e.autoRule])).toEqual([
      ['undo', 'revalidate'],
      ['block.end', 'absence']
    ])
    expect(out[1]!.at).toBe(s.at('08:50'))
  })

  it('próg bezczynności liczy wejście na wszystkich komputerach; log, który przyjdzie później z wejściem, cofa koniec', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('09:05', null)
    const end = leader(s, '09:15')
    expect(end).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'idle', at: s.at('09:05') })])
    // The laptop's log arrives: it was used until 09:20.
    s.observe('08:30', null, 'lap').gap('09:20', null, { computer: 'lap' }).alive('09:24', 'lap')
    const fix = leader(s, '09:25')
    expect(fix.map((e) => e.k)).toEqual(['undo'])
    expect(fgId(s, '09:26')).toBe('a')
    // Now nobody: idle from 09:20 – it ends at 09:20 (a new id).
    expect(leader(s, '09:30')).toEqual([expect.objectContaining({ k: 'block.end', at: s.at('09:20') })])
  })

  it('blok „poza komputerem” kończy się przy pierwszym użyciu po co najmniej 2 min bez wejścia, z pytaniem po powrocie', () => {
    const s = day([block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })]).observe('07:00', null)
    click(s, '13:00', { a: 'start', block: 'm' })
    s.gap('13:01', '13:40')
    expect(leader(s, '13:39')).toEqual([])
    expect(leader(s, '13:41')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'firstUse', at: s.at('13:40') })])
    const q = questions(s, '13:42')
    expect(q).toEqual([expect.objectContaining({ kind: 'return', block: 'm', dot: false })])
    // „Skończył się o …”: the end moves.
    const t = s.at('13:43')
    const st = s.stateAt(t)
    const ev = answerEvents(st, q[0]!, 'endedAt', t, s.at('13:25'))!
    s.write(ev, t)
    const after = s.state('13:44')
    expect(hhmm(after, after.facts.blocks.get('m')!.endedAt)).toBe('13:25')
    expect(questions(s, '13:45')).toEqual([])
  })

  it('posiłek bez odpowiedzi trwa najwyżej swoją długość plus 30 min (D258)', () => {
    const s = day([block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })]).observe('07:00', null)
    click(s, '13:00', { a: 'start', block: 'm' })
    s.gap('13:01', '15:00')
    expect(leader(s, '15:01')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'limit', at: s.at('14:00') })])
  })

  it('nieobecność dłuższa niż próg przed planowanym końcem: blok trwa dalej, nieobecność odliczona; po planowanym końcu: koniec w chwili odejścia', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:15')
    const out = leader(s, '09:16')
    expect(out.map((e) => [e.k, hhmm(s.state('09:16'), Math.round((e.at - s.state('09:16').grid.start) / 60_000))])).toEqual([
      ['block.pause', '08:30'],
      ['block.resume', '09:15']
    ])
    expect(fgId(s, '09:20')).toBe('a')
    const q = questions(s, '09:20').find((x) => x.kind === 'absence')!
    expect(q.answers.map((x) => x.id)).toEqual(['keep', 'end', 'leave'])
    // „Zostawić”: the absence counts to the block.
    const t = s.at('09:21')
    s.write(answerEvents(s.stateAt(t), q, 'leave', t)!, t)
    expect(s.state('09:22').facts.blocks.get('a')!.runs.length).toBe(1)

    const s2 = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s2, '08:00', { a: 'start', block: 'a' })
    s2.gap('08:40', null)
    // At the planned end the idle threshold has passed: it ends there; once the absence reaches 30 min, it ends when you left.
    expect(leader(s2, '09:05')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'idle', at: s2.at('09:00') })])
    expect(leader(s2, '09:10').map((e) => [e.k, e.autoRule, e.at])).toEqual([
      ['undo', 'revalidate', s2.at('09:10')],
      ['block.end', 'absence', s2.at('08:40')]
    ])
  })

  it('zamknięcie aplikacji przy biegnącym bloku: koniec w chwili zamknięcia, pytanie bez kropki z „trwał do teraz”', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })])
    s.observe('07:00', '08:30')
    click(s, '08:00', { a: 'start', block: 'a' })
    s.observe('09:30', null)
    expect(leader(s, '09:31')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'shutdown', at: s.at('08:30') })])
    const q = questions(s, '09:32').find((x) => x.kind === 'shutdown')!
    expect(q).toMatchObject({ dot: false, block: 'a' })
    expect(q.answers[0]!.label).toBe('Skończył się przy wyłączeniu')
  })

  it('„Koniec pracy?” raz po ostatnim bloku pracy; „Tak” potwierdza koniec', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'next' })
    const q = questions(s, '09:01').find((x) => x.kind === 'workEnd')
    expect(q).toBeDefined()
    const t = s.at('09:05')
    s.write(answerEvents(s.stateAt(t), q!, 'yes', t)!, t)
    expect(s.state('09:06').ends.at(-1)).toMatchObject({ confirmed: true })
    expect(questions(s, '09:07').some((x) => x.kind === 'workEnd')).toBe(false)
  })

  it('bez „Koniec pracy?” w czasie prośby, która przerwała blok pracy – wróci po jej końcu (T503)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const t = s.at('08:30')
    const r = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(questions(s, '08:50').some((x) => x.kind === 'workEnd')).toBe(false)
  })

  it('granica zatwierdzona sama przy starcie pierwszego bloku pracy trafia na listę z „Cofnij”', () => {
    const s = day().observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const out = leader(s, '08:05', { boundary: true })
    // It names the blocks of the plan then (the game: who may give way in an exchange).
    expect(out).toEqual([expect.objectContaining({ k: 'boundary.approve', autoRule: 'boundary', plan: s.opts.plan.map((b) => b.id) })])
    expect(s.state('08:06').facts.autos.map((a) => a.rule)).toEqual(['boundary'])
  })
})

describe('poprawki po przeglądzie E4a', () => {
  it('nieobecność cofnięta odpowiedzią „Zostawić” nie blokuje dalszych reguł: niezobaczone „Dalej?” kończy potem próg bezczynności', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:15')
    leader(s, '09:16')
    const q = questions(s, '09:20').find((x) => x.kind === 'absence')!
    const t = s.at('09:21')
    s.write(answerEvents(s.stateAt(t), q, 'leave', t)!, t)
    // After the planned end (11:00) nobody is there and nobody saw „Dalej?”: the idle threshold ends it.
    s.gap('11:05', null)
    expect(leader(s, '11:15')).toEqual([expect.objectContaining({ k: 'block.end', autoRule: 'idle', at: s.at('11:05') })])
  })

  it('kolejna nieobecność po cofniętej jest oceniana osobno, a odpowiedź dotyczy tylko swojej nieobecności', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 240 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:10')
    leader(s, '09:11')
    s.gap('10:00', '10:40')
    const second = leader(s, '10:41')
    expect(second.map((e) => e.k)).toEqual(['block.pause', 'block.resume'])
    const q2 = questions(s, '10:42').filter((x) => x.kind === 'absence').find((x) => x.askedAt === s.at('10:00'))!
    const t = s.at('10:43')
    s.write(answerEvents(s.stateAt(t), q2, 'leave', t)!, t)
    // Only the 10:00 absence counts to the block again; the 08:30 one stays counted out.
    const runs = s.state('10:45').facts.blocks.get('a')!.runs
    expect(runs.length).toBe(2)
    expect(hhmm(s.state('10:45'), runs[0]!.to)).toBe('08:30')
  })

  it('koniec sesji przy ostatnim wejściu cofa się, gdy log laptopa pokaże wejście w tych 30 min', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 300, fixed: true, bg: false })]).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    s.gap('16:00', null, { lastOutside: '15:58' })
    expect(leader(s, '16:30')).toEqual([expect.objectContaining({ autoRule: 'lastInput' })])
    s.observe('15:00', null, 'lap').gap('16:20', null, { computer: 'lap' }).alive('16:34', 'lap')
    expect(leader(s, '16:35').map((e) => e.k)).toEqual(['undo'])
    expect(fgId(s, '16:36')).toBe('ny')
  })

  it('blok stały startuje o planowanym czasie, gdy komputer był używany wcześniej tego dnia (także przy przerwie tuż przed nim)', () => {
    const s = day([block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true })]).observe('07:00', null)
    s.gap('08:56', null)
    expect(leader(s, '09:02')).toEqual([expect.objectContaining({ k: 'block.start', block: 'w', at: s.at('09:00') })])
  })

  it('„Cofnij” automatycznego zatwierdzenia granicy zdejmuje je z listy; drugie „Cofnij” nic nie robi', () => {
    const s = day().observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    leader(s, '08:05', { boundary: true })
    const id = s.state('08:06').facts.autos[0]!.id
    expect(click(s, '08:07', { a: 'undo', target: id }).ok).toBe(true)
    const st = s.state('08:08')
    expect(st.facts.autos).toEqual([])
    expect(st.boundary.approved).toBeNull()
    expect(click(s, '08:09', { a: 'undo', target: id })).toMatchObject({ ok: false })
    // The leader does not approve it a second time.
    expect(leader(s, '08:10', { boundary: true })).toEqual([])
  })

  it('cofnięcie korekty przywraca cofnięte działanie; korekty prowadzącego nie ma na liście', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('09:05', null)
    leader(s, '09:15')
    s.observe('08:30', null, 'lap').gap('09:20', null, { computer: 'lap' }).alive('09:24', 'lap')
    const [fix] = leader(s, '09:25')
    expect(s.state('09:26').facts.autos.some((a) => a.rule === 'revalidate')).toBe(false)
    s.write([{ k: 'undo', at: s.at('09:27'), target: fix!.id }], s.at('09:27'))
    expect(fgId(s, '09:28')).toBeNull()
  })

  it('„Przerwa” w „Koniec pracy?” odkłada do późniejszej z chwil: kliknięcie + 60 min albo planowany koniec pozostałej pracy', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'pause' })
    const t = s.at('09:20')
    const state = s.stateAt(t)
    const q = { id: 'workEnd:x', kind: 'workEnd' as const, block: null, askedAt: t, seenAt: null, text: '', answers: [], dot: true, silent: true }
    const [mark] = answerEvents(state, q, 'break', t)!
    expect(mark!.value).toBe(s.at('14:00'))
  })
})

describe('poprawki po przeglądzie E4b', () => {
  it('przerwa (regeneracja zaczęta teraz) pauzuje biegnący blok pracy, nie kończy go', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '09:30', { a: 'startNew', block: 'brk', categoryId: 'regeneracja', variantId: 'przerwa-od-ekranu', durationMin: 15 })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.pause', 'block.start'])
    expect(s.state('09:35').facts.blocks.get('brk')!.planned).toMatchObject({ variantId: 'przerwa-od-ekranu' })
    click(s, '09:45', { a: 'next' })
    expect(fgId(s, '09:46')).toBe('a')
  })

  it('„Zacznij jeszcze raz” sesji przy innym bloku stałym: sesja na pierwszym planie, tamten w tle', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '15:30', min: 120, fixed: true, bg: false }), block({ id: 'w', cat: 'zajecia-zdalne', at: '16:05', min: 60, fixed: true })]).observe('07:00', null)
    click(s, '15:30', { a: 'start', block: 'ny' })
    click(s, '16:00', { a: 'finish' })
    leader(s, '16:05')
    expect(fgId(s, '16:06')).toBe('w')
    expect(click(s, '16:10', { a: 'restart', block: 'ny' }).ok).toBe(true)
    const t = timerNow(s.state('16:11'))
    expect(t.fg?.info.id).toBe('ny')
    expect(t.bg.map((b) => b.info.id)).toEqual(['w'])
  })
})

describe('dwa komputery', () => {
  it('dwa prowadzące po przerwie synchronizacji zapisują to samo działanie z tym samym identyfikatorem (bez podwójnych wpisów)', () => {
    const plan = [block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true })]
    const a = new Scenario({ date: DATE, plan }, 'pca').observe('07:00', null)
    const b = new Scenario({ date: DATE, plan }, 'pcb').observe('07:30', null, 'pcb')
    const at = a.at('09:01')
    const run = (s: Scenario, self: string) => {
      const ctx = s.contextAt(at)
      const state = s.stateAt(at)
      return autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, at, self), now: at, gate: at })
    }
    const ia = run(a, 'pca').map((e) => e.id)
    const ib = run(b, 'pcb').map((e) => e.id)
    expect(ia).toEqual(ib)
    expect(ia.length).toBe(1)
  })

  it('pytanie ma stały identyfikator: po przejęciu prowadzenia drugi komputer zadaje to samo pytanie, już zobaczone', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]
    const s = new Scenario({ date: DATE, plan }, 'pca').observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const q1 = questions(s, '09:05')[0]!
    s.seen(q1.id, '09:06')
    // The laptop takes the lead: it reads the same log and asks the same question, seen already – no second „first” ask.
    const t = s.at('09:10')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const onLaptop = questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'lap'), now: t })
    expect(onLaptop[0]).toMatchObject({ id: q1.id, seenAt: s.at('09:06') })
  })
})

describe('liczby pomocnicze', () => {
  it('lm i godziny w testach', () => {
    expect(lm('08:00')).toBe(480)
  })
})
