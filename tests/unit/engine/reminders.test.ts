/**
 * The reminders of the morning plan and of the ritual (UX13, D565 P21; spec „Plan poranny”, „Macierz ustawień” –
 * „Przypomnienia”, „Powiadomienia i dźwięki”): their moments from the day's settings (30 min after the wake, at the latest
 * 20 min before the first fixed block of work, never before the wake; 30 min before the effective bedtime; 0 – off), when
 * they hold (the morning plan not done, the day not closed), never in the night, a session, the class mode or „Odcinam się”,
 * quiet in „mniej pytań”, and their quiet lines in the bar.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { modesOf, type ModePrefs, type Modes } from '@shared/engine/modes'
import { checkinSkipId, morningReminderAt, REMINDER_LINE_MIN, reminderLineId, remindersDue, reminderWords, ritualReminderAt } from '@shared/engine/reminders'
import { timerAction, timerNow } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import { idxOf } from '@shared/engine/grid'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, Scenario } from './dsl'

// A Wednesday: the ordinary day – wake 06:00, bedtime 22:00 (the next wake 06:00 less 8 h of sleep).
const DATE = '2026-10-28'
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1], body: [1, 1] }
const care = { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }

function day(plan: PlanBlock[] = [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })], reminders: Record<string, number> = {}): Scenario {
  return new Scenario({ date: DATE, plan, settings: { transitionBufferMin: 0, reminders } }).observe('06:00', null)
}

const idx = (s: Scenario, hhmm: string) => idxOf(s.stateAt(s.at('06:00')).grid, s.at(hhmm))

/** The reminders at `time`: the energy module on unless said; `prefs` – this computer's session and class modes (both on by default). */
function due(s: Scenario, time: string, o: { ritualFrom?: string | null; modes?: Partial<Modes>; prefs?: ModePrefs; energyOn?: boolean } = {}) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const modes = { ...modesOf(state, timerNow(state), ctx.events, t, o.prefs), ...o.modes }
  return remindersDue({ ctx, state, now: t, modes, ritualFrom: o.ritualFrom === undefined ? DATE : o.ritualFrom, energyOn: o.energyOn ?? true })
}

/** „Pomiń” of the check-in as the window writes it (`checkinSkipId`). */
const skipped = (s: Scenario, at: string) => s.raw({ k: 'question.answer', at: s.at(at), question: checkinSkipId(DATE), answer: 'skip', value: null }, at)

describe('chwila przypomnienia o planie porannym', () => {
  it('30 min po pobudce; najpóźniej 20 min przed pierwszym blokiem stałym pracy; gdy ta chwila wypada przed pobudką – w chwili pobudki', () => {
    const s = day()
    expect(morningReminderAt(s.stateAt(s.at('06:00')))).toBe(idx(s, '06:30'))
    const fixed = day([block({ id: 'f', cat: 'inne', at: '06:45', min: 60, fixed: true })])
    expect(morningReminderAt(fixed.stateAt(fixed.at('06:00')))).toBe(idx(fixed, '06:25'))
    const early = day([block({ id: 'f', cat: 'inne', at: '06:10', min: 60, fixed: true })])
    expect(morningReminderAt(early.stateAt(early.at('06:00')))).toBe(idx(early, '06:00'))
  })

  it('blok stały spoza pracy, elastyczny albo odwołany nie przyspiesza przypomnienia', () => {
    const s = day([block({ id: 'm', cat: 'posilek', at: '06:30', min: 30, fixed: true }), block({ id: 'a', cat: 'inne', at: '06:40', min: 60 }), block({ id: 'f', cat: 'inne', at: '06:45', min: 60, fixed: true })])
    s.raw({ k: 'block.cancel', block: 'f', at: s.at('06:01'), rule: 'user' }, '06:01')
    expect(morningReminderAt(s.stateAt(s.at('06:02')))).toBe(idx(s, '06:30'))
  })

  it('0 „po pobudce” wyłącza przypomnienie; 0 „najpóźniej przed blokiem stałym” wyłącza tylko tę granicę', () => {
    const fixed = [block({ id: 'f', cat: 'inne', at: '06:45', min: 60, fixed: true })]
    const off = day(fixed, { morningAfterWakeMin: 0 })
    expect(morningReminderAt(off.stateAt(off.at('06:00')))).toBeNull()
    const noBound = day(fixed, { morningBeforeFixedMin: 0 })
    expect(morningReminderAt(noBound.stateAt(noBound.at('06:00')))).toBe(idx(noBound, '06:30'))
  })

  it('pobudka dnia ustawiona ręcznie przesuwa przypomnienie', () => {
    const s = new Scenario({ date: DATE, wake: '07:15', plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })], settings: { transitionBufferMin: 0 } })
    expect(morningReminderAt(s.stateAt(s.at('07:15')))).toBe(idx(s, '07:45'))
  })
})

describe('przypomnienie o planie porannym – kiedy jest', () => {
  it('od swojej chwili przez 3 h, póki plan poranny nie jest zrobiony', () => {
    const s = day()
    expect(due(s, '06:29')).toEqual([])
    expect(due(s, '06:30')).toEqual([{ kind: 'morning', line: reminderLineId(DATE, 'morning'), at: s.at('06:30'), quiet: false, checkin: false }])
    expect(due(s, '09:29').map((r) => r.kind)).toEqual(['morning'])
    expect(REMINDER_LINE_MIN).toBe(180)
    expect(due(s, '09:30')).toEqual([])
  })

  it('dzień z granicą do zatwierdzenia: przypomnienie zamyka każde zatwierdzenie – Twoje i samo (start pierwszego bloku pracy), choć karta pisze „zatwierdzony” tylko przy Twoim; check-in tego nie zmienia', () => {
    // Approved by you, no check-in (the energy on): none – the card says „zatwierdzony”.
    const approved = day()
    approved.approve('17:00', '06:20')
    expect(due(approved, '06:30')).toEqual([])
    // Approved by the first work block's start: none – the card still says „do zrobienia” (it names only your approval).
    const auto = day([block({ id: 'a', cat: 'inne', at: '06:20', min: 60 })]).start('a', '06:20')
    expect(auto.stateAt(auto.at('06:30')).boundary).toMatchObject({ auto: true })
    expect(due(auto, '06:30')).toEqual([])
    // Not approved: it holds – with the check-in done or not, and with the energy off – and says the plan (`checkin` false).
    expect(due(day(), '06:30')).toMatchObject([{ kind: 'morning', checkin: false }])
    expect(due(day().checkin('06:15', MID), '06:30')).toMatchObject([{ kind: 'morning', checkin: false }])
    expect(due(day(), '06:30', { energyOn: false })).toMatchObject([{ kind: 'morning', checkin: false }])
  })

  it('dzień bez pracy (nic do zatwierdzenia): przypomnienie tylko o check-inie – przy wyłączonej energii, po check-inie albo „Pomiń” go nie ma', () => {
    const free = day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })])
    expect(free.stateAt(free.at('06:30')).boundary.proposal).toBeNull()
    expect(due(free, '06:30')).toMatchObject([{ kind: 'morning', checkin: true }])
    expect(due(free, '06:30', { energyOn: false })).toEqual([])
    expect(due(skipped(day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })]), '06:20'), '06:30')).toEqual([])
    expect(due(day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })]).checkin('06:10', MID), '06:30')).toEqual([])
  })

  it('„nie dziś” zamyka je do końca dnia', () => {
    const s = day()
    s.raw({ k: 'question.answer', at: s.at('06:35'), question: reminderLineId(DATE, 'morning'), answer: 'notToday', value: null }, '06:35')
    expect(due(s, '06:40')).toEqual([])
  })

  it('nigdy w sesji ani w zajęciach według faktów dnia – także gdy ten komputer ma tryb sesji i zajęć wyłączony', () => {
    const off: ModePrefs = { sessionMode: false, classMode: false }
    // A session waiting for its „Zacznij” from 06:50 (planned start passed): none; cancelled – the reminder comes.
    const session = day([block({ id: 'ny', cat: 'sesja', at: '06:50', min: 60, fixed: true }), block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })])
    expect(due(session, '06:45', { prefs: off }).map((r) => r.kind)).toEqual(['morning'])
    expect(due(session, '06:55', { prefs: off })).toEqual([])
    expect(due(session, '06:55')).toEqual([])
    session.raw({ k: 'block.cancel', block: 'ny', at: session.at('06:56'), rule: 'user' }, '06:56')
    expect(due(session, '06:57', { prefs: off }).map((r) => r.kind)).toEqual(['morning'])
    // A remote class (the class mode's category) and the commute running: none (their start approves the boundary too).
    const remote = day([block({ id: 'z', cat: 'zajecia-zdalne', at: '07:00', min: 60, fixed: true })]).start('z', '07:00')
    expect(due(remote, '07:05', { prefs: off })).toEqual([])
    const commute = day([block({ id: 'd', cat: 'dojazd', at: '07:00', min: 60 })]).start('d', '07:00')
    expect(due(commute, '07:05', { prefs: off })).toEqual([])
  })

  it('„Pomiń” zapisany drugi raz (np. na innym komputerze) – odmowa z kodem „answered”, nie błąd', () => {
    const s = skipped(day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })]), '06:20')
    const t = s.at('06:25')
    expect(timerAction(s.contextAt(t), s.stateAt(t), { a: 'mark', question: checkinSkipId(DATE), answer: 'skip' }, t)).toMatchObject({ ok: false, code: 'answered' })
  })

  it('„Pomiń” cofnięte („Cofnij” dymka = `unmark`): check-in znów czeka i przypomnienie wraca', () => {
    const s = skipped(day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })]), '06:20')
    expect(due(s, '06:30')).toEqual([])
    const t = s.at('06:31')
    const r = timerAction(s.contextAt(t), s.stateAt(t), { a: 'unmark', question: checkinSkipId(DATE) }, t)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t)
    expect(due(s, '06:32')).toMatchObject([{ kind: 'morning', checkin: true }])
  })

  it('nigdy w „Odcinam się”; w „mniej pytań” cicho (bez powiadomienia)', () => {
    const s = day()
    expect(due(s, '06:40', { modes: { disconnect: s.at('06:35') } })).toEqual([])
    expect(due(s, '06:40', { modes: { fewer: true, quiet: true } })).toEqual([{ kind: 'morning', line: reminderLineId(DATE, 'morning'), at: s.at('06:30'), quiet: true, checkin: false }])
  })

  it('tylko w dniu dzisiejszym', () => {
    const s = day()
    // The day after (its 06:40) – the bar of yesterday's day asks nothing of it.
    const t = s.at('06:40') + 24 * 3_600_000
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    expect(remindersDue({ ctx, state, now: t, modes: modesOf(state, timerNow(state), ctx.events, t), ritualFrom: DATE, energyOn: true })).toEqual([])
  })
})

describe('przypomnienie o rytuale', () => {
  it('30 min przed efektywną porą snu, do pory snu, póki dzień nie jest zamknięty i rytuał jest dostępny', () => {
    const s = day([])
    expect(ritualReminderAt(s.stateAt(s.at('20:00')))).toBe(idx(s, '21:30'))
    expect(due(s, '21:29')).toEqual([])
    expect(due(s, '21:30')).toEqual([{ kind: 'ritual', line: reminderLineId(DATE, 'ritual'), at: s.at('21:30'), quiet: false, checkin: false }])
    // The night's quiet from the bedtime: none.
    expect(due(s, '22:00')).toEqual([])
    // No ritual yet (before its first day): none.
    expect(due(s, '21:40', { ritualFrom: null })).toEqual([])
    s.raw({ k: 'ritual.close', at: s.at('21:35'), how: 'ritual' }, '21:35')
    expect(due(s, '21:40')).toEqual([])
  })

  it('praca biegnie – rytuał niedostępny, więc i przypomnienie; po jej końcu przychodzi', () => {
    const s = day([block({ id: 'a', cat: 'inne', at: '21:00', min: 60 })])
    s.approve('23:00', '20:00')
    s.start('a', '21:00')
    expect(due(s, '21:35')).toEqual([])
    s.end('a', '21:40').workEnd('21:40')
    expect(due(s, '21:41').map((r) => r.kind)).toEqual(['ritual'])
  })

  it('w sesji (trwającej albo czekającej na „Zacznij”) i w dojeździe według faktów dnia – także przy wyłączonych trybach tego komputera', () => {
    const off: ModePrefs = { sessionMode: false, classMode: false }
    // An evening session after the day's work: waiting for „Zacznij” at 21:35 and running at 21:45 – none.
    const session = day([block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'ny', cat: 'sesja', at: '21:20', min: 60, fixed: true })])
    session.ran('a', '08:00', '09:00').workEnd('09:00')
    expect(due(session, '21:35', { prefs: off })).toEqual([])
    session.start('ny', '21:40')
    expect(due(session, '21:45', { prefs: off })).toEqual([])
    // Ended before the bedtime: the ritual's reminder comes.
    session.end('ny', '21:50').workEnd('21:50')
    expect(due(session, '21:51', { prefs: off }).map((r) => r.kind)).toEqual(['ritual'])
    // The commute running in the evening: none; over – it comes.
    const commute = day([block({ id: 'd', cat: 'dojazd', at: '21:30', min: 20 })])
    commute.start('d', '21:30')
    expect(due(commute, '21:40', { prefs: off })).toEqual([])
    commute.end('d', '21:45').workEnd('21:45')
    expect(due(commute, '21:46', { prefs: off }).map((r) => r.kind)).toEqual(['ritual'])
  })

  it('0 wyłącza; w „mniej pytań” cicha linia (spec „Cisza”)', () => {
    const off = day([], { ritualBeforeBedMin: 0 })
    expect(ritualReminderAt(off.stateAt(off.at('20:00')))).toBeNull()
    expect(due(off, '21:45')).toEqual([])
    const s = day([])
    expect(due(s, '21:45', { modes: { fewer: true, quiet: true } }).map((r) => [r.kind, r.quiet])).toEqual([['ritual', true]])
  })
})

describe('linie paska', () => {
  function view(s: Scenario, time: string, ritualFrom: string | null = DATE) {
    const t = s.at(time)
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Inne obowiązki', care, modePrefs: { sessionMode: true, classMode: true }, pending: null, ritualFrom })
  }

  it('plan poranny: cicha linia „Plan poranny czeka · Otwórz · nie dziś” na końcu linii, bez kropki', () => {
    const s = day()
    const v = view(s, '06:30')
    expect(v.lines.at(-1)).toEqual({ id: reminderLineId(DATE, 'morning'), text: 'Plan poranny czeka', actions: [{ id: 'open', label: 'Otwórz' }, { id: 'notToday', label: 'nie dziś' }], dot: false })
    expect(v.dot).toBe(false)
    expect(view(s, '06:29').lines.filter((l) => l.id.startsWith('remind:'))).toEqual([])
  })

  it('powiadomienie planu porannego: „Plan dnia czeka…” przy granicy do zatwierdzenia, „Pytania o objawy czekają…” przy samym check-inie', () => {
    const s = day()
    expect(reminderWords(due(s, '06:30')[0]!, s.stateAt(s.at('06:30')))).toMatchObject({ title: 'Plan poranny', body: 'Plan dnia czeka w oknie głównym.' })
    const free = day([block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })])
    expect(reminderWords(due(free, '06:30')[0]!, free.stateAt(free.at('06:30')))).toMatchObject({ title: 'Plan poranny', body: 'Pytania o objawy czekają w oknie głównym.' })
  })

  it('rytuał: „Pora snu o 22:00 – rytuał zamknięcia · Rytuał · nie dziś”', () => {
    const s = day([])
    expect(view(s, '21:30').lines.filter((l) => l.id.startsWith('remind:'))).toEqual([
      { id: reminderLineId(DATE, 'ritual'), text: 'Pora snu o 22:00 – rytuał zamknięcia', actions: [{ id: 'open', label: 'Rytuał' }, { id: 'notToday', label: 'nie dziś' }], dot: false }
    ])
  })
})
