/**
 * The timer (spec „Timer”, „Bloki”, „Przedłużenie i przekroczenie”) and what the app does by itself (spec „Działania
 * automatyczne”, „Bezczynność i nieobecność”): clicks as events, the second click after the boundary, fixed blocks by
 * their plan, „Dalej?” counted from its seeing, the idle threshold, blocks away from the computer, absences, a close of
 * the app with a block running, and „Cofnij”.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, autoActions, questionsOf, type AutoEvent } from '@shared/engine/auto'
import { blockEvidence } from '@shared/engine/game'
import { viewAt } from '@shared/engine/facts'
import { requestAction } from '@shared/engine/requests'
import { computeDay } from '@shared/engine/day'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { variantTriggers } from '@shared/engine/variants'
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

  it('„Odwołaj” po „Koniec pracy”, które zakończyło blok zaczęty w tej samej minucie, parkuje elastyczną pracę (G1, D216)', () => {
    const s = new Scenario({ date: '2026-11-12', plan: [block({ id: 'b', cat: 'inne', at: '12:59', min: 15 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 20, fixed: true }), block({ id: 'c', cat: 'inne', at: '16:00', min: 60 })] }).observe('07:00', null)
    const at = (ms: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(ms), s.stateAt(ms), act, ms)
      if (r.ok) s.write(r.events, ms)
      return r
    }
    at(s.at('12:59') + 19_000, { a: 'start', block: 'b' })
    const end = at(s.at('12:59') + 26_000, { a: 'workEnd' })
    expect(end.ok && end.events.map((e) => e.k)).toEqual(['block.end', 'work.end'])
    const r = click(s, '13:01', { a: 'cancel', block: 'ny' })
    expect(r.ok && r.events.map((e) => `${e.k} ${e.block as string}`)).toEqual(['block.cancel ny', 'block.park c'])
    expect(s.state('13:02').ends.at(-1)?.confirmed).toBe(true)
  })

  it('„Koniec pracy” przy posiłku na pierwszym planie nie parkuje bloków zakotwiczonych do posiłku (posiłek się nie kończy)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'm', cat: 'posilek', at: '12:00', min: 30 }), block({ id: 'r', cat: 'rutyny', after: 'm', min: 15 })]).observe('07:00', null)
    s.ran('a', '08:00', '09:00')
    click(s, '12:00', { a: 'start', block: 'm' })
    const r = click(s, '12:10', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end'])
  })

  it('świadome „Koniec pracy” w czasie prośby kończy przerwany blok – nie wraca po niej po potwierdzonym końcu (jak w 1.0.0)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '09:00', min: 120 })]).observe('07:00', null)
    click(s, '09:00', { a: 'start', block: 'a' })
    const t = s.at('10:00')
    const req = requestAction(s.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!req.ok) throw new Error(req.why)
    s.write(req.events, t)
    const r = click(s, '10:05', { a: 'workEnd' })
    expect(r.ok && r.events.some((e) => e.k === 'block.end' && e.block === 'a')).toBe(true)
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

  it('„Przedłuż” bloku dodanego bez wymiany: potwierdzone są minuty do planowanej długości, przedłużenie ma koszt (raport 816)', () => {
    const x = block({ id: 'x', cat: 'inne', at: '12:30', min: 60, origin: 'user' })
    const s = new Scenario({ date: DATE, plan: [x], settings: { transitionBufferMin: 0 } }).observe('07:00', null).approve('12:45', '07:30')
    s.raw({ k: 'block.addConfirm', block: 'x', at: s.at('09:00') }, '09:00')
    // The start inside the confirmed length costs nothing …
    expect(click(s, '12:30', { a: 'start', block: 'x' }).ok).toBe(true)
    // … but 15 more minutes past its planned end (13:30–13:45) are after the boundary and nobody confirmed them.
    expect(click(s, '13:20', { a: 'extend', minutes: 15 })).toMatchObject({ ok: false, confirm: { block: 'x', minutes: 15 } })
    expect(click(s, '13:20', { a: 'extend', minutes: 15, confirm: true }).ok).toBe(true)
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
    expect(q.answers.map((x) => x.id)).toEqual(['keep', 'end', 'leave', 'meal', 'regen', 'request'])
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

  it('zamknięcie aplikacji, a w jego czasie okno bloku stałego: blok kończy się w chwili zamknięcia, stały zaczyna się bez pauzy bloku (G2)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '10:22', min: 30, fixed: true })])
    s.observe('07:00', '10:20')
    click(s, '10:00', { a: 'start', block: 'a' })
    s.observe('10:25', null)
    const out = leader(s, '10:26')
    expect(out.map((e) => [e.k, e.block, e.autoRule, e.at])).toEqual([
      ['block.start', 'f', 'fixedStart', s.at('10:22')],
      ['block.end', 'a', 'shutdown', s.at('10:20')]
    ])
    const st = s.state('10:27')
    expect(hhmm(st, st.facts.blocks.get('a')!.endedAt!)).toBe('10:20')
    expect(timerNow(st).fg?.info.id).toBe('f')
  })

  it('blok stały w tle nie czeka na koniec przy zamknięciu, który jeszcze nie przeszedł bramki – czeka tylko ten, który pauzowałby blok z pierwszego planu (G2)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '10:22', min: 30, fixed: true, bg: true }), block({ id: 'g', cat: 'inne', at: '10:22', min: 30, fixed: true })])
    s.observe('07:00', '10:20')
    click(s, '10:00', { a: 'start', block: 'a' })
    s.observe('10:25', null)
    // The gate at 10:23: the end at the close (due from 10:25, the start) not yet – f in the background starts, g waits.
    const t = s.at('10:26')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: s.at('10:23') })
    expect(out.filter((e) => e.autoRule !== 'boundary').map((e) => [e.k, e.block, e.at, e.bg])).toEqual([['block.start', 'f', s.at('10:22'), true]])
  })

  it('„Koniec pracy?” raz po ostatnim bloku pracy – po „Dalej” na „Dalej?” 15 min później (T261); „Tak” potwierdza koniec', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '09:00', { a: 'next' })
    expect(questions(s, '09:01').some((x) => x.kind === 'workEnd')).toBe(false)
    expect(questions(s, '09:14').some((x) => x.kind === 'workEnd')).toBe(false)
    const q = questions(s, '09:15').find((x) => x.kind === 'workEnd')
    expect(q).toMatchObject({ askedAt: s.at('09:00') })
    const t = s.at('09:16')
    s.write(answerEvents(s.stateAt(t), q!, 'yes', t)!, t)
    const st = s.state('09:17')
    expect(st.ends.at(-1)).toMatchObject({ confirmed: true })
    expect(hhmm(st, st.ends.at(-1)!.at)).toBe('09:00')
    expect(questions(s, '09:18').some((x) => x.kind === 'workEnd')).toBe(false)
  })

  it('„Koniec pracy?” od razu po zakończeniu ostatniego bloku pracy przed jego planowanym końcem', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:40', { a: 'next' })
    expect(questions(s, '08:41').some((x) => x.kind === 'workEnd')).toBe(true)
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

  /** A flexible „a” running, a fixed „w” (not in the background) starting over it at 09:00 by the leader: the pause and the start written. */
  function fixedOverFlexible() {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'w', cat: 'inne', at: '09:00', min: 60, fixed: true, bg: false })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    leader(s, '09:00')
    const autos = s.state('09:05').facts.autos
    return { s, pause: autos.find((x) => x.k === 'block.pause')!, start: autos.find((x) => x.k === 'block.start' && x.block === 'w')! }
  }

  it.each([['pauzy', 'pause'], ['startu bloku stałego', 'start']] as const)('„Cofnij” %s przy starcie bloku stałego cofa parę (w czasie bloku stałego): elastyczny biegnie jak przed startem, stały niezaczęty, bez wyzwalacza wariantów (D350)', (_name, which) => {
    const { s, pause, start } = fixedOverFlexible()
    const before = s.state('09:05')
    expect(timerNow(before).fg?.info.id).toBe('w')
    expect(variantTriggers(before, null).time.map((x) => x.id)).toEqual(['fixed:w:a'])
    const r = click(s, '09:06', { a: 'undo', target: (which === 'pause' ? pause : start).id })
    expect(r.ok && r.events.map((e) => (e as unknown as { target: string }).target).sort()).toEqual([pause.id, start.id].sort())
    const st = s.state('09:10')
    const t = timerNow(st)
    // „a” goes on as before the start of „w”: one run in front, nothing in the background, „w” not begun (it can be started by hand).
    expect(t.fg?.info.id).toBe('a')
    expect(t.bg).toEqual([])
    expect(st.facts.blocks.get('w')?.startedAt ?? null).toBeNull()
    const open = [...st.facts.blocks.values()].flatMap((f) => f.runs.filter((r) => r.to === Number.POSITIVE_INFINITY).map((r) => [f.id, r.bg] as const))
    expect(open).toEqual([['a', false]])
    expect(variantTriggers(st, null).time).toEqual([])
    // The leader does not start „w” again (the undone ids do not come back) …
    expect(leader(s, '09:11')).toEqual([])
    // … but „w” can be started by hand.
    expect(click(s, '09:12', { a: 'start', block: 'w' }).ok).toBe(true)
  })

  it('para pauza ↔ start bloku stałego tylko póki ma sens: po końcu bloku stałego (albo po późniejszym kliknięciu) „Cofnij” jest odrzucone', () => {
    const { s, pause, start } = fixedOverFlexible()
    click(s, '10:02', { a: 'next' })
    for (const x of [pause, start]) expect(click(s, '10:03', { a: 'undo', target: x.id })).toMatchObject({ ok: false })
    // A click on the fixed block meanwhile (a longer „Przedłuż”) ends it too.
    const t = fixedOverFlexible()
    click(t.s, '09:20', { a: 'extend', minutes: 15 })
    for (const x of [t.pause, t.start]) expect(click(t.s, '09:21', { a: 'undo', target: x.id })).toMatchObject({ ok: false })
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

  it('po „Cofnij” zatwierdzenia minuty liczą się według propozycji: praca po maksimum to przekroczenie (A1-15)', () => {
    const s = day().observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    leader(s, '08:05', { boundary: true })
    click(s, '08:07', { a: 'undo', target: s.state('08:06').facts.autos[0]!.id })
    const st = s.state('23:30')
    expect(st.boundary.approved).toBeNull()
    expect(st.extensionMin).toBeGreaterThan(0)
    expect(st.overrunMin).toBeGreaterThan(0)
  })

  it('minuty pracy przed zatwierdzoną granicą nie są oceniane po kolei – 8 h pracy liczy się szybko (A1-15, T414)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 480 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const ctx = s.contextAt(s.at('16:30'))
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      computeDay(ctx)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    expect(times[2]!).toBeLessThan(40)
  })

  it('„Cofnij zatwierdzenie” z planu porannego otwiera granicę od teraz – przeszłość dnia się nie zmienia (A6-11)', () => {
    const s = day().observe('07:00', null)
    s.approve('16:00', '07:30')
    expect(s.state('07:31').boundary.approved).not.toBeNull()
    expect(click(s, '07:40', { a: 'undoApproval' }).ok).toBe(true)
    expect(s.state('07:41').boundary.approved).toBeNull()
    expect(click(s, '07:42', { a: 'undoApproval' })).toMatchObject({ ok: false })
    // The first work block does not approve it on its own afterwards.
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(leader(s, '08:05', { boundary: true })).toEqual([])
  })

  it('zatwierdzenie, „Cofnij” i zatwierdzenie jeszcze raz w tej samej minucie – granica zatwierdzona (kolejność logu, nie minuty)', () => {
    const s = day().observe('07:00', null)
    s.approve('16:00', '07:30')
    expect(click(s, '07:30', { a: 'undoApproval' }).ok).toBe(true)
    s.approve('16:30', '07:30')
    const st = s.state('07:31')
    expect(st.boundary.approved).not.toBeNull()
    expect(hhmm(st, st.boundary.approved!)).toBe('16:30')
  })

  it('„Cofnij zatwierdzenie” wieczorem: praca przed nim zostaje w granicy, którą zatwierdziłeś (A6-11, przegląd 0.26.0)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '09:00', min: 420 })]).observe('07:00', null)
    s.approve('18:00', '07:30')
    s.ran('a', '09:00', '17:30')
    expect(s.state('17:40').extensionMin).toBe(0)
    expect(click(s, '17:45', { a: 'undoApproval' }).ok).toBe(true)
    const st = s.state('17:50')
    expect(st.boundary.approved).toBeNull()
    // Not the day's own approval at the first work block (the proposal 16:15) rebuilt for the minutes before.
    expect(st.extensionMin).toBe(0)
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

  it('„Start” bloku życia i opieki przy biegnącej pracy pauzuje pracę; inny blok pracy dalej kończy biegnący (D335)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'p', cat: 'posilek', at: '09:00', min: 30 }), block({ id: 'r', cat: 'rutyny', at: '10:00', min: 20 }), block({ id: 'c', cat: 'analiza', at: '11:00', min: 30 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const meal = click(s, '09:00', { a: 'start', block: 'p' })
    expect(meal.ok && meal.events.map((e) => e.k)).toEqual(['block.pause', 'block.start'])
    expect(fgId(s, '09:01')).toBe('p')
    // After the meal „Dalej” brings the paused work back.
    click(s, '09:20', { a: 'next' })
    expect(fgId(s, '09:21')).toBe('a')
    // Care (routines) the same; another work block ends the running one, done.
    const care = click(s, '10:00', { a: 'start', block: 'r' })
    expect(care.ok && care.events.map((e) => e.k)).toEqual(['block.pause', 'block.start'])
    click(s, '10:10', { a: 'finish' })
    const other = click(s, '11:00', { a: 'start', block: 'c' })
    expect(other.ok && other.events.map((e) => e.k)).toEqual(['block.end', 'block.start'])
  })

  it('„Usuń” zaczętego bloku (D336): kończy go teraz, bez planu zostaje „poza planem” i liczy się do budżetu; „Cofnij” otwiera go dalej', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:30', { a: 'removeBegun', block: 'a' })
    expect(r).toMatchObject({ ok: true, events: [{ k: 'block.end', block: 'a', done: false, rule: 'removed' }] })
    // The plan without the block (the window took it out of the file): its run stays, outside the plan.
    const used = (plan: boolean) => s.stateAt(s.at('10:00'), plan ? {} : { plan: [] })
    expect(used(false).blocks.find((b) => b.id === 'a')).toMatchObject({ inPlan: false })
    expect(used(false).facts.blocks.get('a')).toMatchObject({ endedAt: used(true).facts.blocks.get('a')!.endedAt, endRule: 'removed' })
    expect(used(false).budgetUsedMin).toBe(used(true).budgetUsedMin)
    expect(used(false).budgetUsedMin).toBeGreaterThanOrEqual(30)
    // A block that is over has nothing to end; one that never began is not "begun".
    expect(click(s, '09:00', { a: 'removeBegun', block: 'a' })).toMatchObject({ ok: false })
    // „Cofnij”: the end is taken back, the block runs on as before.
    expect(click(s, '08:40', { a: 'undoRemove', block: 'a' }).ok).toBe(true)
    expect(timerNow(s.state('08:41')).fg?.info.id).toBe('a')
    expect(click(s, '08:45', { a: 'undoRemove', block: 'a' })).toMatchObject({ ok: false })
  })

  it('„Cofnij” zdjęcia zaczętego bloku tylko dopóki nic innego nie zaczęło się po nim (D336)', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(click(s, '08:30', { a: 'removeBegun', block: 'a' }).ok).toBe(true)
    expect(click(s, '08:35', { a: 'start', block: 'b' }).ok).toBe(true)
    // „A” would run beside „b” – refused, nothing written.
    expect(click(s, '08:36', { a: 'undoRemove', block: 'a' })).toMatchObject({ ok: false, why: 'tego już nie cofniesz – po usunięciu zaczął się inny blok, prośba albo „Odcinam się”' })
    expect(timerNow(s.state('08:37')).fg?.info.id).toBe('b')
    expect(click(s, '08:40', { a: 'removeBegun', block: 'a' })).toMatchObject({ ok: false, why: 'ten blok już się skończył', code: 'alreadyOver' })
    // A block whose start never was (or was taken back): its own code.
    expect(click(s, '08:41', { a: 'removeBegun', block: 'nie-ma' })).toMatchObject({ ok: false, code: 'notBegun' })
  })

  it('„Cofnij” zdjęcia także przy prośbie albo „Odcinam się”, które zaczęły się po usunięciu (D336)', () => {
    const mk = () => {
      const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })]).observe('07:00', null)
      click(s, '08:00', { a: 'start', block: 'a' })
      expect(click(s, '08:30', { a: 'removeBegun', block: 'a' }).ok).toBe(true)
      return s
    }
    const withRequest = mk()
    const t = withRequest.at('08:35')
    const r = requestAction(withRequest.stateAt(t), { a: 'requestNow', request: 'r1', person: null }, t)
    if (!r.ok) throw new Error(r.why)
    withRequest.write(r.events, t)
    expect(click(withRequest, '08:36', { a: 'undoRemove', block: 'a' })).toMatchObject({ ok: false })
    const cut = mk()
    expect(click(cut, '08:35', { a: 'cutOff' }).ok).toBe(true)
    expect(click(cut, '08:36', { a: 'undoRemove', block: 'a' })).toMatchObject({ ok: false })
    // Nothing since: it goes.
    expect(click(mk(), '08:36', { a: 'undoRemove', block: 'a' }).ok).toBe(true)
  })

  it('„Usuń” kończy blok jak „Skończyłem”: stały po planowanym końcu bez „Przedłuż” kończy się w swoim oknie (D336)', () => {
    const s = day([block({ id: 'ny', cat: 'sesja', at: '12:00', min: 60, fixed: true, bg: false })]).observe('07:00', null)
    click(s, '12:00', { a: 'start', block: 'ny' })
    const r = click(s, '14:00', { a: 'removeBegun', block: 'ny' })
    expect(r.ok && r.events[0]).toMatchObject({ k: 'block.end', rule: 'removed', at: s.at('13:00') })
    // The facts of the minutes before the end do not hold the end yet (the view of a minute before it).
    const state = s.state('14:05')
    const f = state.facts.blocks.get('ny')!
    expect(f.endId).not.toBeNull()
    expect(viewAt(state.facts, f.endedAt! - 1).blocks.get('ny')).toMatchObject({ endId: null, endOrder: null, endedAt: null })
  })

  it('„Cofnij” zdjęcia liczy od samego zdarzenia usunięcia, nie od minut: blok zapauzowany przed posiłkiem i start w tej samej minucie (D336)', () => {
    // A paused block: its end is the minute of the pause (10:00) – the meal that paused it began before the removal.
    const paused = day([block({ id: 'a', cat: 'inne', at: '09:00', min: 180 }), block({ id: 'p', cat: 'posilek', at: '10:00', min: 30 })]).observe('07:00', null)
    click(paused, '09:00', { a: 'start', block: 'a' })
    expect(click(paused, '10:00', { a: 'start', block: 'p' }).ok).toBe(true)
    expect(click(paused, '10:05', { a: 'removeBegun', block: 'a' }).ok).toBe(true)
    expect(click(paused, '10:06', { a: 'undoRemove', block: 'a' }).ok).toBe(true)
    // The same minute: „b” begins at 12:00:10, the session is removed at 12:00:40 – „b” came first.
    const s = day([block({ id: 'ny', cat: 'sesja', at: '12:00', min: 120, fixed: true, bg: false }), block({ id: 'b', cat: 'inne', at: '12:30', min: 60 })]).observe('07:00', null)
    click(s, '12:00', { a: 'start', block: 'ny' })
    const at = (sec: number) => s.at('12:00') + sec * 1000
    const go = (sec: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(at(sec)), s.stateAt(at(sec)), act, at(sec))
      if (r.ok) s.write(r.events, at(sec))
      return r
    }
    expect(go(10, { a: 'start', block: 'b' }).ok).toBe(true)
    expect(go(40, { a: 'removeBegun', block: 'ny' }).ok).toBe(true)
    expect(go(50, { a: 'undoRemove', block: 'ny' }).ok).toBe(true)
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

describe('druga zmiana poza swoim planowanym czasem (spec „Druga zmiana”, A1-04)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, tag: 'secondShift' })]

  it('wcześniejszy start: koszt minut przed oknem (nigdy przekroczenie) z „Przesuń na teraz”; w oknie – bez kosztu', () => {
    const s = day(plan()).approve('09:15', '10:15')
    const early = click(s, '19:40', { a: 'start', block: 'ds' })
    expect(early.ok).toBe(false)
    expect(early.confirm).toMatchObject({ block: 'ds', minutes: 20, overrun: false, moveToNow: true })
    const s2 = day(plan()).approve('09:15', '10:15')
    expect(click(s2, '20:00', { a: 'start', block: 'ds' }).ok).toBe(true)
  })

  it('„Przedłuż” drugiej zmiany za jej planowany koniec: zwykłe przedłużenie z kosztem, bez „Przesuń na teraz”', () => {
    const s = day(plan()).approve('09:15', '10:15')
    expect(click(s, '20:00', { a: 'start', block: 'ds' }).ok).toBe(true)
    const r = click(s, '20:55', { a: 'extend', minutes: 30 })
    expect(r.ok).toBe(false)
    expect(r.confirm).toMatchObject({ block: 'ds', minutes: 30, overrun: false })
    expect(r.confirm!.moveToNow).toBeUndefined()
  })

  // A flexible second shift in its window of „Zacznij”, and a template block anchored to it.
  const flex = () => [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'ds', cat: 'inne', at: '20:00', min: 60, tag: 'secondShift' }), block({ id: 'po', cat: 'inne', after: 'ds', min: 30 })]

  it('start później w swoim oknie kosztuje nic – tylko wcześniejszy start i „Przedłuż” (przegląd 0.21.0)', () => {
    const s = day(flex()).approve('09:15', '10:15')
    const r = click(s, '20:05', { a: 'start', block: 'ds' })
    expect([r.ok, r.confirm]).toEqual([true, null])
  })

  it('blok zakotwiczony do drugiej zmiany nie jest drugą zmianą: bez kosztu i bez „Przesuń na teraz” (przegląd 0.21.0)', () => {
    const s = day(flex()).approve('09:15', '10:15')
    const r = click(s, '19:00', { a: 'start', block: 'po' })
    expect([r.ok, r.confirm]).toEqual([true, null])
  })
})

describe('odpowiedzi na nieobecność po przeglądzie 0.21.0', () => {
  const answer = (s: Scenario, time: string, answerId: string) => {
    const q = questions(s, time).find((x) => x.kind === 'absence')!
    const t = s.at(time)
    s.write(answerEvents(s.stateAt(t), q, answerId, t)!, t)
  }
  // Work 08:00–11:00 with lunch at 09:00 in the plan; away 08:30–09:15, counted out by the leader.
  const away = () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'obiad', cat: 'posilek', at: '09:00', min: 30 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:15')
    leader(s, '09:16')
    return s
  }

  it('blok, który po powrocie biegł dalej i się skończył, zostaje z odliczoną nieobecnością – minuty nie liczą się dwa razy', () => {
    const s = away()
    expect(click(s, '10:00', { a: 'finish', block: 'a' }).ok).toBe(true)
    answer(s, '10:05', 'meal')
    const st = s.state('10:06')
    const a = st.facts.blocks.get('a')!
    expect(a.endedAt).toBe(lm('10:00') - 240)
    expect(a.runs.map((r) => [r.from, r.to])).toEqual([
      [lm('08:00') - 240, lm('08:30') - 240],
      [lm('09:15') - 240, lm('10:00') - 240]
    ])
    const meal = st.facts.blocks.get('obiad')!
    expect([meal.startedAt, meal.endedAt]).toEqual([lm('08:30') - 240, lm('09:15') - 240])
  })

  it('koniec w chwili odejścia z odpowiedzi, która tylko nazywa nieobecność, nie jest Twoim końcem (LEFT_RULES)', () => {
    const s = away()
    answer(s, '09:20', 'regen')
    const t = s.at('09:21')
    const ev = blockEvidence(s.contextAt(t), s.stateAt(t)).find((e) => e.f.id === 'a')!
    expect(ev.f.endedAt).toBe(lm('08:30') - 240)
    expect(ev.givenEnd).toBe(false)
  })

  it('„byłem na prośbie”, gdy prośba po fakcie już obejmuje ten czas: druga się nie dopisuje', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:40', '09:30')
    leader(s, '09:05')
    leader(s, '09:31')
    const t = s.at('09:32')
    const r = requestAction(s.stateAt(t), { a: 'requestAfter', request: 'r1', person: null, from: s.at('08:40'), to: s.at('09:30') }, t)
    expect(r.ok).toBe(true)
    if (r.ok) s.write(r.events, t)
    answer(s, '09:35', 'request')
    expect(s.state('09:36').facts.requests.map((x) => x.id)).toEqual(['r1'])
  })
})

describe('czym była nieobecność: posiłek, regeneracja, prośba (spec „Bezczynność i nieobecność”, A1-09)', () => {
  const answer = (s: Scenario, time: string, answerId: string) => {
    const q = questions(s, time).find((x) => x.kind === 'absence')!
    const t = s.at(time)
    s.write(answerEvents(s.stateAt(t), q, answerId, t)!, t)
  }

  it('„posiłek” przy powrocie przed planowanym końcem: blok kończy się w chwili odejścia, obiad z planu odhaczony z czasami nieobecności, z „Cofnij” obu', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 }), block({ id: 'obiad', cat: 'posilek', at: '09:00', min: 30 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:15')
    leader(s, '09:16')
    answer(s, '09:20', 'meal')
    const st = s.state('09:21')
    expect(st.facts.blocks.get('a')!.endedAt).toBe(lm('08:30') - 240)
    const meal = st.facts.blocks.get('obiad')!
    expect([meal.startedAt, meal.endedAt]).toEqual([lm('08:30') - 240, lm('09:15') - 240])
    // One line in „zrobione automatycznie”; its „Cofnij” takes the meal's start back too.
    const end = st.facts.autos.find((x) => x.rule === 'absenceMeal' && x.k === 'block.end')!
    click(s, '09:22', { a: 'undo', target: end.id })
    expect(s.state('09:23').facts.blocks.get('obiad')?.startedAt ?? null).toBeNull()
  })

  it('„posiłek” bez posiłku w planie: żaden blok, ale nieobecność nie jest odpoczynkiem', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 180 })]).observe('07:00', null)
    click(s, '08:00', { a: 'start', block: 'a' })
    s.gap('08:30', '09:15')
    leader(s, '09:16')
    answer(s, '09:20', 'meal')
    expect(s.state('09:21').facts.notRest).toEqual([expect.objectContaining({ from: lm('08:30') - 240, to: lm('09:15') - 240 })])
  })

  it('„regeneracja” i „byłem na prośbie” po planowanym końcu: koniec w chwili odejścia zostaje, nieobecność jest regeneracją albo prośbą po fakcie', () => {
    const make = () => {
      const s = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })]).observe('07:00', null)
      click(s, '08:00', { a: 'start', block: 'a' })
      s.gap('08:40', '09:30')
      leader(s, '09:05')
      leader(s, '09:31')
      return s
    }
    const r = make()
    answer(r, '09:35', 'regen')
    const regen = [...r.state('09:36').facts.blocks.values()].find((b) => b.planned?.categoryId === 'regeneracja')!
    expect([regen.startedAt, regen.endedAt]).toEqual([lm('08:40') - 240, lm('09:30') - 240])
    expect(r.state('09:36').facts.blocks.get('a')!.endedAt).toBe(lm('08:40') - 240)
    const q = make()
    answer(q, '09:35', 'request')
    expect(q.state('09:36').facts.requests).toEqual([expect.objectContaining({ mode: 'after', person: null, from: lm('08:40') - 240, to: lm('09:30') - 240 })])
  })
})
