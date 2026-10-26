/**
 * The example of „Model energii” (spec table „Przykład”), every row a test: the transition buffer is 0, so the hours are
 * round; the sessions begin with „Zacznij” on time and have presence to their end (T314); the lecture runs in the
 * background as planned. A row's state is the one after its step, as the bar shows it before the next step begins:
 * the log holds the steps up to that row (the rest of the plan is the forecast). Shown: head / emotions / senses.
 */
import { describe, expect, it } from 'vitest'
import { suggestRegen, reserveReaction } from '@shared/engine/reserve'
import { Scenario, block, hhmm } from './dsl'

const plan = () => [
  block({ id: 'rutyna', cat: 'rutyny', at: '07:00', min: 40 }),
  block({ id: 'londyn', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
  block({ id: 'spacer', cat: 'regeneracja', variant: 'spacer', at: '11:00', min: 35 }),
  block({ id: 'obiad', cat: 'posilek', at: '12:05', min: 30 }),
  block({ id: 'opieka', cat: 'rutyny', at: '12:35', min: 25 }),
  block({ id: 'nauka', cat: 'nauka', at: '13:00', min: 60 }),
  block({ id: 'wyklad', cat: 'wyklad', at: '13:00', min: 60, fixed: true, origin: 'lecture' }),
  block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' })
]

/** The steps of the table, in order; `day(n)` is the day after step n. */
const steps: Array<(s: Scenario) => Scenario> = [
  (s) => s.ran('rutyna', '07:00', '07:40').checkin('07:40', { head: [1, 1], emotions: [1, 1], senses: [1, 0] }),
  (s) => s.ran('londyn', '08:00', '11:00'),
  (s) => s.ran('spacer', '11:00', '11:35'),
  (s) => s.request('q1', '11:35', '12:05', 'queue'),
  (s) => s.ran('obiad', '12:05', '12:35'),
  (s) => s.ran('opieka', '12:35', '13:00'),
  (s) => s.start('nauka', '13:00').start('wyklad', '13:00', { bg: true }).end('nauka', '14:00').end('wyklad', '14:00'),
  (s) => s.start('ny', '14:00'),
  (s) => s.end('ny', '17:00'),
  (s) => s.ran('lezenie', '17:00', '17:30', { cat: 'regeneracja', variant: 'drzemka', min: 30 })
]

function day(n: number): Scenario {
  let s = new Scenario({ date: '2026-10-21', plan: plan(), settings: { transitionBufferMin: 0 } })
  for (let i = 0; i <= n; i++) s = steps[i]!(s)
  return s
}

const shown = (s: Scenario, at: string) => {
  const e = s.energy(at).shown!
  return [e.head, e.emotions, e.senses]
}

describe('Model energii – przykład', () => {
  it('07:40 check-in po porannej rutynie: wyniki 2 / 2 / 1 → 65 / 65 / 85; rutyna sprzed check-inu się nie liczy', () => {
    const s = day(0)
    const e = s.energy('07:40')
    expect(e.known).toBe(true)
    expect(hhmm(s.state('07:40'), e.checkinAt)).toBe('07:40')
    expect(shown(s, '07:40')).toEqual([65, 65, 85])
  })

  it('08:00–11:00 sesja Londyn: pierwszy blok po check-inie bez kosztu przełączenia → 47 / 47 / 67', () => {
    const s = day(1)
    expect(shown(s, '11:00')).toEqual([47, 47, 67])
    expect(s.energy('11:00').charges).toEqual([])
  })

  it('11:00–11:35 samotny spacer bez kosztu przełączenia (D205) → 49 / 52 / 71', () => {
    const s = day(2)
    expect(shown(s, '11:35')).toEqual([49, 52, 71])
    expect(s.energy('11:35').now).toEqual({ head: 48.75, emotions: 52.25, senses: 70.5 })
    expect(s.energy('11:35').charges).toEqual([])
  })

  it('11:35–12:05 prośba z kolejki: jeden kontakt −2 psychiczne zamiast przełączenia → 47 / 46 / 68', () => {
    const s = day(3)
    expect(shown(s, '12:05')).toEqual([47, 46, 68])
    const st = s.state('12:05')
    expect(s.energy('12:05').charges.map((c) => [c.kind, hhmm(st, c.at)])).toEqual([['contact', '11:35']])
  })

  it('12:05–12:35 obiad → 47 / 44 / 66', () => {
    expect(shown(day(4), '12:35')).toEqual([47, 44, 66])
  })

  it('12:35–13:00 opieka nad zwierzętami → 46 / 44 / 65', () => {
    expect(shown(day(5), '13:00')).toEqual([46, 44, 65])
  })

  it('13:00–14:00 nauka i wykład w tle (50% kosztu), jedno przełączenie −2 → 34 / 44 / 60', () => {
    const s = day(6)
    expect(shown(s, '14:00')).toEqual([34, 44, 60])
    const st = s.state('14:00')
    expect(s.energy('14:00').charges.filter((c) => c.kind === 'switch').map((c) => hhmm(st, c.at))).toEqual(['13:00'])
  })

  it('14:00–16:45 sesja NY, przełączenie −2; o 16:45 głowa schodzi do rezerwy i pasek zmienia kolor → 15 / 28 / 44', () => {
    const s = day(7)
    const e = s.energy('16:45')
    expect(shown(s, '16:45')).toEqual([15, 28, 44])
    expect(e.now!.head).toBe(15)
    expect(e.atReserve).toEqual({ head: true, emotions: false, senses: false })
    const st = s.state('16:45')
    expect(e.charges.filter((c) => c.kind === 'switch').map((c) => hhmm(st, c.at))).toEqual(['13:00', '14:00'])
    expect(e.descents.map((d) => [d.pool, hhmm(st, d.at), d.message, d.recorded])).toEqual([['head', '16:45', true, false]])
    // Minutę wcześniej głowa jest jeszcze nad rezerwą.
    expect(s.energy('16:44').descents).toEqual([])
    expect(s.energy('16:44').atReserve.head).toBe(false)
  })

  it('17:00 koniec sesji NY: komunikat proponuje leżenie, bo wyczerpana jest pula poznawcza → 14 / 26 / 42', () => {
    const s = day(8)
    expect(shown(s, '17:00')).toEqual([14, 26, 42])
    expect(suggestRegen(s.settings, 'head')).toBe('drzemka')
  })

  it('17:00–17:30 leżenie bez kosztu przełączenia; nagroda zostaje (start po zejściu, w 60 min od zobaczenia o 17:00) → 18 / 28 / 45', () => {
    const s = day(9)
    expect(shown(s, '17:30')).toEqual([18, 28, 45])
    const { day: st, energy } = s.energyWithDay('17:30')
    expect(energy.charges.filter((c) => c.kind === 'switch')).toHaveLength(2)
    // Komunikat czekał w trybie sesji do jej końca: zobaczony o 17:00.
    const seenAt = s.state('17:00').now
    const reaction = reserveReaction({ events: s.events, day: st, energy, seen: () => ({ seenAt, iconOnly: false }) })
    expect(reaction.descents.map((d) => d.status)).toEqual(['met'])
    expect(hhmm(st, reaction.descents[0]!.rest!.from)).toBe('17:00')
    expect(reaction.verdict).toBe('reward')
  })

  it('17:30–17:35 czas bez bloku po końcu pracy (+0,25 / +0,25 / 0); 17:35 sygnał „Zatyczki”: bodźce −10 → 18 / 28 / 35', () => {
    const s = day(9)
    expect(s.energy('17:35').now).toEqual({ head: 18.25, emotions: 28, senses: 45.25 })
    s.signal('earplugs', '17:35')
    expect(shown(s, '17:35')).toEqual([18, 28, 35])
    expect(s.energy('17:35').now!.senses).toBe(35.25)
  })
})
