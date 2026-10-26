/**
 * The rules of „Model energii” beyond its example: the check-in, signals and anchors, costs an hour, the background,
 * switches and contact, time without a block, „Odcinam się”, the bounds, the reserve with its hysteresis, registered
 * descents, the module switched off, the forecast, and the energy events in the log.
 */
import { describe, expect, it } from 'vitest'
import { computeDay, newSegments } from '@shared/engine/day'
import { checkinStates, newDescents } from '@shared/engine/energy'
import type { Pool } from '@shared/model/categories'
import { parseEvent, type Answer } from '@shared/model/events'
import { planBlockFrom, type PlanBlock } from '@shared/model/plan'
import { Scenario, block, hhmm } from './dsl'

/** Every pool 1 + 1 → 65. */
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }
const FULL: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }
/** A work block late in the day: the morning is not a day without work (where time without a block is regeneration). */
const LATER = block({ id: 'later', cat: 'analiza', at: '20:00', min: 30, fixed: true })

const sc = (plan: PlanBlock[], settings: Record<string, unknown> = {}) => new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0, ...settings } })
const now = (s: Scenario, at: string) => s.energy(at).now!
const charges = (s: Scenario, at: string, kind: 'switch' | 'contact') => {
  const st = s.state(at)
  return s
    .energy(at)
    .charges.filter((c) => c.kind === kind)
    .map((c) => hhmm(st, c.at))
}
const own = (b: PlanBlock, costs: PlanBlock['costs'], bgCostPct: number | null = null): PlanBlock => ({ ...b, costs, bgCostPct })

describe('check-in', () => {
  it('suma odpowiedzi puli 0–4 ustawia stan na 100, 85, 65, 45 albo 25', () => {
    expect(checkinStates({ head: [0, 0], emotions: [0, 1], senses: [1, 1] })).toEqual({ head: 100, emotions: 85, senses: 65 })
    expect(checkinStates({ head: [2, 0], emotions: [2, 1], senses: [2, 2] })).toEqual({ head: 65, emotions: 45, senses: 25 })
  })

  it('energia liczy się od najwcześniejszego check-inu, także gdy jego log dotarł później; kolejny check-in ustawia pule od nowa', () => {
    const s = sc([LATER]).checkin('08:00', MID)
    // The other computer's check-in at 07:30, in its log written at 09:00.
    s.raw({ k: 'energy.checkin', dom: 'energy', at: s.at('07:30'), answers: FULL }, '09:00', 'pcb')
    const e = s.energy('09:00')
    expect(hhmm(s.state('09:00'), e.checkinAt)).toBe('07:30')
    expect(e.series.head[s.state('07:45').now]).toBe(100)
    expect(e.now).toEqual({ head: 65, emotions: 65, senses: 65 })
  })

  it('bez check-inu energia jest „nieznana”; bloki sprzed check-inu liczą się do czasu, nie do energii', () => {
    const s = sc([block({ id: 'a', cat: 'analiza', at: '07:00', min: 60 }), LATER]).ran('a', '07:00', '08:00')
    const before = s.energy('07:30')
    expect(before.known).toBe(false)
    expect(before.now).toBeNull()
    expect(before.forecast).toBeNull()
    expect(before.descents).toEqual([])
    s.checkin('08:00', MID)
    expect(now(s, '08:00')).toEqual({ head: 65, emotions: 65, senses: 65 })
  })
})

describe('sygnały i kotwice', () => {
  it('okulary i zatyczki: bodźce −10, więcej bujania: każda pula −5, drażnią pytania: emocje −10, ocena względna ±10 / 0', () => {
    const s = sc([LATER])
      .checkin('08:00', MID)
      .signal('glasses', '08:10')
      .signal('earplugs', '08:20')
      .signal('rocking', '08:30')
      .signal('questions', '08:40')
      .relative('head', 10, '08:50')
      .relative('senses', -10, '09:00')
      .relative('emotions', 0, '09:00')
    expect(now(s, '08:10')).toEqual({ head: 65, emotions: 65, senses: 55 })
    expect(now(s, '09:00')).toEqual({ head: 70, emotions: 50, senses: 30 })
  })

  it('skutki sygnałów są ustawieniem', () => {
    const s = sc([LATER], { signalEffects: { glassesSenses: 20, rockingAll: 1, questionsEmotions: 3 } }).checkin('08:00', MID).signal('glasses', '08:10').signal('rocking', '08:20').signal('questions', '08:30')
    expect(now(s, '08:30')).toEqual({ head: 64, emotions: 61, senses: 44 })
  })

  it('sygnał sprzed pierwszego check-inu nie zmienia energii', () => {
    const s = sc([LATER]).signal('glasses', '07:00').checkin('08:00', MID)
    expect(s.events.find((e) => e.k === 'energy.signal')).toMatchObject({ before: null })
    expect(now(s, '08:30')).toEqual({ head: 65, emotions: 65, senses: 65 })
  })

  it('kotwica: blok sprzed sygnału dopisany później nie zmienia stanu po sygnale; bez zapisanego stanu – zmienia', () => {
    const late = (s: Scenario) =>
      s
        .raw({ k: 'block.start', block: 'late', at: s.at('08:00'), bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false }, confirmUntil: null, how: 'click' }, '10:15', 'pcb')
        .raw({ k: 'block.end', block: 'late', at: s.at('09:00'), done: true, rule: null }, '10:15', 'pcb')
    const base = (anchor: boolean) => {
      const s = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '10:00')
      return anchor ? s.signal('glasses', '10:00') : s.signal('glasses', '10:00', null)
    }
    expect(now(late(base(true)), '10:30')).toEqual(now(base(true), '10:30'))
    expect(now(late(base(false)), '10:30')).not.toEqual(now(base(false), '10:30'))
  })
})

describe('koszty', () => {
  it('koszt k zjada 3·k jednostek na godzinę: 30 min przy koszcie 3 to 4,5', () => {
    const s = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '09:30')
    expect(now(s, '09:30')).toEqual({ head: 60.5, emotions: 63.5, senses: 63.5 })
  })

  it('blok w tle kosztuje 50% (ustawienie, każdy blok może mieć własny udział)', () => {
    const run = (s: Scenario) => s.checkin('08:00', MID).start('a', '09:00').start('w', '09:00', { bg: true }).end('a', '10:00').end('w', '10:00')
    const plan = (w: PlanBlock) => [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), w, LATER]
    const lecture = block({ id: 'w', cat: 'wyklad', at: '09:00', min: 60, fixed: true, origin: 'lecture' })
    expect(now(run(sc(plan(lecture))), '10:00')).toEqual({ head: 54.5, emotions: 62, senses: 60.5 })
    expect(now(run(sc(plan({ ...lecture, bgCostPct: 100 }))), '10:00')).toEqual({ head: 53, emotions: 62, senses: 59 })
    expect(now(run(sc(plan(lecture), { backgroundCostPct: 0 })), '10:00')).toEqual({ head: 56, emotions: 62, senses: 62 })
  })

  it('sesja w tle za innym blokiem nic nie kosztuje (D202), sama w tle – pełny koszt; powrót z tła bez przełączenia', () => {
    const plan = [block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }), LATER]
    const day = (back: boolean) => {
      const s = sc(plan).checkin('13:00', MID).start('ny', '14:00').start('a', '14:30', { cat: 'analiza', min: 30 }).fg('ny', true, '14:30').end('a', '15:00')
      return (back ? s.fg('ny', false, '15:00') : s).end('ny', '15:30')
    }
    // 14:00–14:30 sesja 3 / 3 / 3, 14:30–15:00 analiza 4,5 / 1,5 / 1,5 i przełączenie 2, 15:00–15:30 sesja 3 / 3 / 3.
    expect(now(day(true), '15:30')).toEqual({ head: 52.5, emotions: 57.5, senses: 57.5 })
    expect(now(day(false), '15:30')).toEqual({ head: 52.5, emotions: 57.5, senses: 57.5 })
    expect(charges(day(true), '15:30', 'switch')).toEqual(['14:30'])
  })

  it('blok stały odsunięty w tło blokiem elastycznym – koszt tła; zaczęty w tle za chronionym blokiem życia albo odsunięty blokiem stałym – pełny', () => {
    const w = block({ id: 'w', cat: 'wyklad', at: '10:00', min: 60, fixed: true, bg: false })
    const aside = sc([w, LATER]).checkin('08:00', MID).start('w', '10:00').start('a', '10:30', { cat: 'analiza', min: 30 }).fg('w', true, '10:30').end('a', '11:00').end('w', '11:00')
    expect(now(aside, '11:00')).toEqual({ head: 56.25, emotions: 63.5, senses: 61.25 })
    const meal = sc([block({ id: 'obiad', cat: 'posilek', at: '10:00', min: 60 }), w, LATER])
      .checkin('08:00', MID)
      .start('obiad', '10:00')
      .start('w', '10:00', { bg: true })
      .end('obiad', '11:00')
      .end('w', '11:00')
    expect(now(meal, '11:00')).toEqual({ head: 62, emotions: 62, senses: 59 })
    const fixed = sc([w, block({ id: 'zz', cat: 'zajecia-zdalne', at: '10:30', min: 30, fixed: true }), LATER])
      .checkin('08:00', MID)
      .start('w', '10:00')
      .start('zz', '10:30')
      .fg('w', true, '10:30')
      .end('zz', '11:00')
      .end('w', '11:00')
    expect(now(fixed, '11:00')).toEqual({ head: 57, emotions: 62, senses: 59 })
  })

  it('suma kosztów bloków biegnących razem mieści się w ±5 na godzinę', () => {
    const up = sc([own(block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), { head: 5, emotions: 5, senses: 5 }), own(block({ id: 'b', cat: 'inne', at: '09:00', min: 60, bg: true }), { head: 5, emotions: 5, senses: 5 }, 100), LATER])
      .checkin('08:00', MID)
      .start('a', '09:00')
      .start('b', '09:00', { bg: true })
      .end('a', '10:00')
      .end('b', '10:00')
    expect(now(up, '10:00')).toEqual({ head: 50, emotions: 50, senses: 50 })
    const down = sc([own(block({ id: 'r', cat: 'regeneracja', at: '09:00', min: 60 }), { head: -3, emotions: -3, senses: -3 }), own(block({ id: 'b', cat: 'inne', at: '09:00', min: 60, bg: true }), { head: -5, emotions: -5, senses: -5 }, 100), LATER])
      .checkin('08:00', MID)
      .start('r', '09:00')
      .start('b', '09:00', { bg: true })
      .end('r', '10:00')
      .end('b', '10:00')
    expect(now(down, '10:00')).toEqual({ head: 80, emotions: 80, senses: 80 })
  })

  it('prośba na pierwszym planie: blok stały za nią z pełnym kosztem, kontakt −2, powrót do pracy to przełączenie', () => {
    const s = sc([block({ id: 'zz', cat: 'zajecia-zdalne', at: '10:00', min: 60, fixed: true }), LATER]).checkin('08:00', MID).start('zz', '10:00').request('q', '10:20', '10:30').end('zz', '11:00')
    expect(now(s, '11:00')).toEqual({ head: 56.5, emotions: 55.5, senses: 58 })
    expect(charges(s, '11:00', 'contact')).toEqual(['10:20'])
    expect(charges(s, '11:00', 'switch')).toEqual(['10:30'])
  })

  it('sesja za prośbą nic nie kosztuje (T319); powrót do sesji po prośbie kosztuje przełączenie', () => {
    const s = sc([block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }), LATER]).checkin('13:00', MID).start('ny', '14:00').request('q', '14:30', '14:40').end('ny', '15:00')
    expect(now(s, '15:00')).toEqual({ head: 57.5, emotions: 56.5, senses: 59 })
    expect(charges(s, '15:00', 'switch')).toEqual(['14:40'])
  })

  it('każda prośba to jeden kontakt; blok kategorii próśb też, nawet po pauzie', () => {
    const two = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 120 }), LATER]).checkin('08:00', MID).request('q1', '09:00', '09:10').request('q2', '09:30', '09:40')
    expect(charges(two, '10:00', 'contact')).toEqual(['09:00', '09:30'])
    const blockReq = sc([block({ id: 'a', cat: 'analiza', at: '08:30', min: 30 }), block({ id: 'pr', cat: 'prosby', at: '09:00', min: 30 }), block({ id: 'a2', cat: 'analiza', at: '09:30', min: 30 }), LATER])
      .checkin('08:00', MID)
      .ran('a', '08:30', '09:00')
      .start('pr', '09:00')
      .pause('pr', '09:10')
      .resume('pr', '09:20')
      .end('pr', '09:30')
      .ran('a2', '09:30', '10:00')
    expect(charges(blockReq, '10:00', 'contact')).toEqual(['09:00'])
    expect(charges(blockReq, '10:00', 'switch')).toEqual(['09:30'])
  })
})

describe('przełączenia', () => {
  it('tylko wejście w pracę albo projekt innej kategorii; regeneracja, posiłek i wariant tej samej kategorii bez kosztu', () => {
    const s = sc([LATER])
      .checkin('08:00', MID)
      .ran('a', '09:00', '09:30', { cat: 'analiza' })
      .ran('n', '09:30', '10:00', { cat: 'nauka' })
      .ran('ns', '10:00', '10:30', { cat: 'nauka', variant: 'sluchanie' })
      .ran('p', '10:30', '11:00', { cat: 'projekty' })
      .ran('r', '11:00', '11:30', { cat: 'regeneracja' })
      .ran('m', '11:30', '12:00', { cat: 'posilek' })
      .ran('a2', '12:00', '12:30', { cat: 'analiza' })
    expect(charges(s, '12:30', 'switch')).toEqual(['09:30', '10:30', '12:00'])
  })

  it('wznowienie po zwykłej pauzie bez kosztu; po prośbie w pauzie – kontakt i przełączenie', () => {
    const plain = sc([LATER]).checkin('08:00', MID).ran('j', '08:00', '08:30', { cat: 'journaling' }).start('a', '08:30', { cat: 'analiza' }).pause('a', '09:00').resume('a', '09:15').end('a', '09:30')
    expect(charges(plain, '09:30', 'switch')).toEqual(['08:30'])
    const req = sc([LATER]).checkin('08:00', MID).start('a', '08:30', { cat: 'analiza' }).pause('a', '09:00').request('q', '09:00', '09:10').resume('a', '09:10').end('a', '09:30')
    expect(charges(req, '09:30', 'contact')).toEqual(['09:00'])
    expect(charges(req, '09:30', 'switch')).toEqual(['09:10'])
  })

  it('blok z planu, który jeszcze się nie zaczął, nie kosztuje teraz; zaczęty – od razu', () => {
    const plan = [block({ id: 'j', cat: 'journaling', at: '08:30', min: 30 }), block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), LATER]
    const waiting = sc(plan).checkin('08:00', MID).ran('j', '08:30', '09:00')
    expect(charges(waiting, '09:00', 'switch')).toEqual([])
    const started = sc(plan).checkin('08:00', MID).ran('j', '08:30', '09:00').start('a', '09:00')
    expect(charges(started, '09:00', 'switch')).toEqual(['09:00'])
    expect(now(started, '09:00').head).toBe(now(waiting, '09:00').head - 2)
    // Prognoza liczy przełączenie zaplanowanego bloku zaraz po teraz (z kosztem jego pierwszej minuty, 3 / 20).
    const e = waiting.energy('09:00')
    const k = waiting.state('09:00').now
    expect(e.series.head[k]).toBe(60.5)
    expect(e.series.head[k + 1]).toBe(58.35)
  })
})

describe('czas bez bloku i „Odcinam się”', () => {
  it('przerwa krótsza niż 30 min w ciągu dnia nie zmienia stanu; od 30 min liczy się od początku jak „gra, film”', () => {
    const short = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), block({ id: 'a2', cat: 'analiza', at: '09:50', min: 30 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '09:30').start('a2', '09:50')
    expect(now(short, '09:50')).toEqual({ head: 60.5, emotions: 63.5, senses: 63.5 })
    const long = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), block({ id: 'a2', cat: 'analiza', at: '10:10', min: 30 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '09:30').start('a2', '10:10')
    expect(now(long, '10:10')).toEqual({ head: 62.5, emotions: 65.5, senses: 63.5 })
  })

  it('czas bez bloku po końcu pracy odnawia jak „gra, film” (−1 / −1 / 0)', () => {
    const s = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 })]).checkin('08:00', MID).ran('a', '09:00', '09:30')
    expect(now(s, '10:30')).toEqual({ head: 63.5, emotions: 66.5, senses: 63.5 })
  })

  it('„Odcinam się” liczy się jak cisza, koc obciążeniowy, ciepłe światło (−1 / −2 / −3); nagrywanie w tle kosztuje dalej', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), LATER]
    const s = sc(plan).checkin('08:00', MID).ran('a', '09:00', '09:30').disconnect('09:30', '10:30')
    expect(now(s, '10:30')).toEqual({ head: 63.5, emotions: 69.5, senses: 72.5 })
    const rec = sc([...plan, block({ id: 'w', cat: 'wyklad', at: '09:30', min: 60, fixed: true, origin: 'lecture' })])
      .checkin('08:00', MID)
      .ran('a', '09:00', '09:30')
      .disconnect('09:30', '10:30')
      .ran('w', '09:30', '10:30', { bg: true })
    expect(now(rec, '10:30')).toEqual({ head: 62, emotions: 69.5, senses: 71 })
  })
})

describe('zakres i wyświetlanie', () => {
  it('stan obcięty do 0–100', () => {
    const top = sc([block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }), LATER]).checkin('08:00', FULL).ran('r', '09:00', '10:00')
    expect(now(top, '10:00')).toEqual({ head: 100, emotions: 100, senses: 100 })
    const bottom = sc([own(block({ id: 'h', cat: 'inne', at: '09:00', min: 480 }), { head: 5, emotions: 5, senses: 5 })]).checkin('08:00', MID).ran('h', '09:00', '17:00')
    expect(now(bottom, '17:00')).toEqual({ head: 0, emotions: 0, senses: 0 })
  })

  it('wyświetlanie zaokrągla do pełnych jednostek, połówki w górę', () => {
    const s = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 30 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '09:30')
    expect(s.energy('09:30').now).toEqual({ head: 60.5, emotions: 63.5, senses: 63.5 })
    expect(s.energy('09:30').shown).toEqual({ head: 61, emotions: 64, senses: 64 })
  })
})

describe('rezerwa', () => {
  /** The head moved by assessments, one a minute from 09:00 (reserve 10, its colour to above 15). */
  const steps = (deltas: Array<-10 | 0 | 10>) => {
    let s = sc([LATER], { reserve: 10 }).checkin('08:00', MID)
    deltas.forEach((d, i) => (s = s.relative('head', d, `09:0${i}`)))
    return s
  }

  it('zejście: pierwsza chwila na poziomie rezerwy albo niżej; kolor do wzrostu powyżej rezerwy plus 5; kolejne zejście bez komunikatu', () => {
    const s = steps([-10, -10, -10, -10, -10, -10, 10, 10, -10, -10])
    const st = s.state('09:09')
    expect(s.energy('09:04').atReserve.head).toBe(false)
    expect(s.energy('09:05').descents.map((d) => [hhmm(st, d.at), d.message])).toEqual([['09:05', true]])
    // 15 = rezerwa plus 5: kolor zostaje; 25: znika.
    expect(s.energy('09:06').atReserve.head).toBe(true)
    expect(s.energy('09:07').atReserve.head).toBe(false)
    const e = s.energy('09:09')
    expect(e.descents.map((d) => [hhmm(st, d.at), d.message])).toEqual([
      ['09:05', true],
      ['09:09', false]
    ])
    expect(e.atReserve).toEqual({ head: true, emotions: false, senses: false })
  })

  it('równo rezerwa to już rezerwa (porównanie dokładne)', () => {
    const s = sc([LATER], { reserve: 15 }).checkin('08:00', MID).relative('head', -10, '09:00').relative('head', -10, '09:01').relative('head', -10, '09:02').relative('head', -10, '09:03')
    expect(s.energy('09:03').now!.head).toBe(25)
    expect(s.energy('09:03').descents).toEqual([])
    s.relative('head', -10, '09:04')
    expect(s.energy('09:04').descents.map((d) => d.pool)).toEqual(['head'])
  })

  /** Head only: 15 a hour from 09:00, at the reserve (15) at 12:20. */
  const heavy = () => sc([own(block({ id: 'h', cat: 'inne', at: '09:00', min: 240 }), { head: 5, emotions: 0, senses: 0 })]).checkin('08:00', MID).start('h', '09:00')

  it('zarejestrowane zejście zostaje mimo późniejszej poprawki; policzone w tym samym epizodzie nie dubluje się', () => {
    const s = heavy()
    const st = s.state('12:20')
    expect(newDescents(st.grid, s.energy('12:20'))).toEqual([{ pool: 'head', at: s.at('12:20'), silent: false }])
    s.reserve('head', '12:21')
    const after = s.energy('12:30')
    expect(after.descents.map((d) => [d.pool, hhmm(st, d.at), d.recorded])).toEqual([['head', '12:21', true]])
    expect(newDescents(st.grid, after)).toEqual([])
    // Drugi komputer dopisuje pauzę o 11:00: stan wraca nad rezerwę, zejście zostaje, kolor znika.
    s.raw({ k: 'block.pause', block: 'h', at: s.at('11:00') }, '12:40', 'pcb')
    const fixed = s.energy('12:45')
    expect(fixed.descents.map((d) => [hhmm(st, d.at), d.recorded])).toEqual([['12:21', true]])
    expect(fixed.atReserve.head).toBe(false)
  })

  it('moduł wyłączony: zejście tylko barwi pasek, bez komunikatu; po włączeniu energia liczy się od check-inu', () => {
    const s = heavy().module(false, '08:30')
    const off = s.energy('12:30')
    expect(off.enabled).toBe(false)
    expect(off.offToday).toBe(true)
    expect(off.forecast).toBeNull()
    expect(off.atReserve.head).toBe(false)
    expect(off.descents.map((d) => [d.silent, d.message])).toEqual([[true, false]])
    s.module(true, '13:00')
    const on = s.energy('13:00')
    expect(on.enabled).toBe(true)
    expect(on.offToday).toBe(true)
    expect(on.now!.head).toBe(5)
    expect(on.atReserve.head).toBe(true)
    expect(on.descents.map((d) => [d.silent, d.message])).toEqual([[true, false]])
    expect(sc([LATER]).checkin('08:00', MID).energy('09:00', { moduleOn: false }).enabled).toBe(false)
  })

  it('w okresie kalibracji reakcje tylko informują, bez wariantów', () => {
    const s = heavy()
    expect(s.energy('12:30').variants).toBe(true)
    expect(s.energy('12:30', { calibration: true }).variants).toBe(false)
  })
})

describe('prognoza', () => {
  it('prognoza na poziomie rezerwy daje ostrzeżenie: pierwsza minuta i najniższy stan do pory snu', () => {
    const s = sc([own(block({ id: 'h', cat: 'inne', at: '10:00', min: 240 }), { head: 5, emotions: 5, senses: 5 })]).checkin('08:00', MID)
    const e = s.energy('09:00')
    const st = s.state('09:00')
    expect(e.now).toEqual({ head: 65, emotions: 65, senses: 65 })
    expect(hhmm(st, e.forecast!.reserveAt.head)).toBe('13:20')
    expect(e.forecast!.min).toEqual({ head: 5, emotions: 5, senses: 5 })
    expect(e.warnings).toContain('prognoza energii na poziomie rezerwy')
    expect(e.descents).toEqual([])
  })

  it('bez ostrzeżenia, gdy prognoza zostaje nad rezerwą', () => {
    const e = sc([block({ id: 'a', cat: 'analiza', at: '10:00', min: 60 })]).checkin('08:00', MID).energy('09:00')
    expect(e.forecast!.reserveAt).toEqual({ head: null, emotions: null, senses: null })
    expect(e.warnings).toEqual([])
  })
})

describe('po przeglądzie kodu (E2)', () => {
  it('regeneracja za prośbą nie odnawia – prośba ją przerywa, jak w silniku dnia', () => {
    const s = sc([block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }), LATER]).checkin('08:00', MID).start('r', '09:00').request('q', '09:10', '09:40').end('r', '09:40')
    expect(now(s, '09:40')).toEqual({ head: 65, emotions: 59, senses: 63 })
  })

  it('koszty bloku według jego startu: późniejsza zmiana planu nie zmienia przeszłej energii', () => {
    const s = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), LATER]).checkin('08:00', MID).ran('a', '09:00', '10:00')
    const before = now(s, '10:00')
    s.opts.plan[0] = { ...s.opts.plan[0]!, categoryId: 'projekty', costs: { head: 5, emotions: 5, senses: 5 } }
    expect(now(s, '10:00')).toEqual(before)
  })

  it('blok elastyczny w tle kosztuje udział tła, także zaczęty w tle bez planu tła', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'n', cat: 'nauka', variant: 'sluchanie', at: '09:00', min: 60 }), LATER]
    const s = sc(plan).checkin('08:00', MID).start('a', '09:00').start('n', '09:00', { bg: true }).end('a', '10:00').end('n', '10:00')
    expect(now(s, '10:00').head).toBe(53)
  })

  it('powtórzone „włączone” przy włączonym module nie robi z dnia dnia wyłączenia; starszy zapis bez stanu sprzed – tak', () => {
    expect(sc([LATER]).checkin('08:00', MID).module(true, '09:00', true).energy('09:30').offToday).toBe(false)
    const legacy = sc([LATER]).checkin('08:00', MID)
    legacy.raw({ k: 'energy.module', dom: 'energy', at: legacy.at('09:00'), on: true }, '09:00')
    expect(legacy.energy('09:30').offToday).toBe(true)
  })

  it('kontakt prośby zaczętej w minucie check-inu się liczy', () => {
    const s = sc([LATER]).checkin('08:00', MID).request('q', '08:00', '08:10')
    expect(now(s, '08:10')).toEqual({ head: 64.5, emotions: 61.5, senses: 64 })
  })

  it('lista poniesionych kosztów nie zawiera przyszłych z prognozy', () => {
    const plan = [block({ id: 'j', cat: 'journaling', at: '12:30', min: 30 }), block({ id: 'a', cat: 'analiza', at: '13:00', min: 60 }), block({ id: 'obiad', cat: 'posilek', at: '13:30', min: 15, fixed: true }), LATER]
    const s = sc(plan).checkin('08:00', MID).ran('j', '12:30', '13:00').start('a', '13:00')
    expect(charges(s, '13:10', 'switch')).toEqual(['13:00'])
  })

  it('blok elastyczny pod chronionym blokiem życia pauzuje, a powrót do niego to przełączenie; blok stały za nim wraca bez przełączenia', () => {
    const flex = sc([block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'obiad', cat: 'posilek', at: '09:20', min: 10 }), LATER])
      .checkin('08:00', MID)
      .start('a', '09:00')
      .ran('obiad', '09:20', '09:30')
      .end('a', '10:00')
    expect(now(flex, '10:00')).toEqual({ head: 55.5, emotions: 62, senses: 62 })
    expect(charges(flex, '10:00', 'switch')).toEqual(['09:30'])
    const fixed = sc([block({ id: 'j', cat: 'journaling', at: '09:30', min: 30 }), block({ id: 'w', cat: 'wyklad', at: '10:00', min: 60, fixed: true, bg: false }), block({ id: 'obiad', cat: 'posilek', at: '10:20', min: 10 }), LATER])
      .checkin('08:00', MID)
      .ran('j', '09:30', '10:00')
      .start('w', '10:00')
      .ran('obiad', '10:20', '10:30')
      .end('w', '11:00')
    expect(charges(fixed, '11:00', 'switch')).toEqual(['10:00'])
  })

  it('powód tła nie zależy od kolejności bloków w planie', () => {
    const w = block({ id: 'w', cat: 'wyklad', at: '10:00', min: 60, fixed: true, bg: false })
    const zz = block({ id: 'zz', cat: 'zajecia-zdalne', at: '10:30', min: 30, fixed: true })
    const a = block({ id: 'a', cat: 'analiza', at: '10:30', min: 30 })
    const run = (plan: PlanBlock[]) => sc(plan).checkin('08:00', MID).start('w', '10:00').start('zz', '10:30').start('a', '10:30').fg('w', true, '10:30').end('a', '11:00').end('zz', '11:00').end('w', '11:00')
    expect(now(run([w, a, zz, LATER]), '11:00')).toEqual(now(run([w, zz, a, LATER]), '11:00'))
  })
})

describe('zdarzenia energii w logu', () => {
  const line = (o: Record<string, unknown>) => JSON.stringify({ id: 'pca-1', c: 'pca', n: 1, t: 1, l: 1, v: 1, day: '2026-10-21', dom: 'energy', at: 1, ...o })

  it('poprawne zdarzenia są znane, błędne pole robi zdarzenie uszkodzonym', () => {
    expect(parseEvent(line({ k: 'energy.checkin', answers: MID }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.signal', signal: 'earplugs', before: { head: 18.25, emotions: 28, senses: 45.25 } }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.signal', signal: 'rocking', before: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.relative', pool: 'head', delta: -10, before: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.reserve', pool: 'senses', silent: false }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.module', on: false }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'energy.checkin', answers: { ...MID, head: [3, 0] } }))).toEqual({ ok: false, why: 'pole answers' })
    expect(parseEvent(line({ k: 'energy.signal', signal: 'foo' }))).toEqual({ ok: false, why: 'pole signal' })
    expect(parseEvent(line({ k: 'energy.signal', signal: 'glasses', before: { head: 101, emotions: 1, senses: 1 } }))).toEqual({ ok: false, why: 'pole before' })
    expect(parseEvent(line({ k: 'energy.relative', pool: 'x', delta: 10 }))).toEqual({ ok: false, why: 'pole pool' })
    expect(parseEvent(line({ k: 'energy.relative', pool: 'head', delta: 5 }))).toEqual({ ok: false, why: 'pole delta' })
    expect(parseEvent(line({ k: 'energy.module', on: 'yes' }))).toEqual({ ok: false, why: 'pole on' })
  })

  it('udział kosztu w tle bloku: liczba całkowita 0–100, inaczej ustawienie', () => {
    const b = (bgCostPct: unknown) => planBlockFrom({ id: 'x', categoryId: 'wyklad', startMin: 600, durationMin: 60, bgCostPct })
    expect(b(30)?.bgCostPct).toBe(30)
    expect(b(0)?.bgCostPct).toBe(0)
    expect(b(101)?.bgCostPct).toBeNull()
    expect(b('50')?.bgCostPct).toBeNull()
  })

  it('zdarzenia energii nie zmieniają dnia i nie unieważniają odcinków klasyfikacji', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '17:00', min: 60 })]
    const s = sc(plan).approve('10:15', '08:00').checkin('08:00', MID).ran('a', '09:00', '10:00').start('b', '17:00', { confirmUntil: '18:00' }).end('b', '18:00')
    const st = s.state('18:00')
    for (const seg of newSegments(st, st.grid.start, s.at('18:00'))) s.raw({ k: 'minutes', ...seg }, '18:00')
    const before = s.state('18:30')
    expect([...before.minutes.values()].every((m) => m.recorded)).toBe(true)
    // Check-in drugiego komputera z 17:00, który dotarł później.
    s.raw({ k: 'energy.checkin', dom: 'energy', at: s.at('17:00'), answers: FULL }, '18:20', 'pcb').signal('glasses', '18:25')
    const after = s.state('18:30')
    expect([...after.minutes.values()].every((m) => m.recorded)).toBe(true)
    expect(after.minutes).toEqual(before.minutes)
    expect({ ...after, facts: null, rest: [...after.rest] }).toEqual({ ...before, facts: null, rest: [...before.rest] })
    expect(computeDay(s.contextAt(s.at('18:30'))).ends).toEqual(before.ends)
  })
})
