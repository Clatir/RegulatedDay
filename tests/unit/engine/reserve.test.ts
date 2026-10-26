/**
 * Reactions to the reserve (spec „Reakcje aplikacji”, Grywalizacja „Reakcja na rezerwę”, D241, D244, T176, T346): the
 * proposed way of regeneration and the reward – a rest of 10 min begun after the descent and at the latest 60 min after
 * the message was first seen, or going on at the descent; what does not take the reward away.
 */
import { describe, expect, it } from 'vitest'
import { reserveReaction, suggestRegen } from '@shared/engine/reserve'
import { idxOf } from '@shared/engine/grid'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom } from '@shared/model/settings'
import { Scenario, block, hhmm } from './dsl'

const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }
const LATER = block({ id: 'later', cat: 'analiza', at: '20:00', min: 30, fixed: true })
/** Head only, 15 an hour: from 65 at 09:00 to the reserve (15) at 12:20. */
const heavy = (min: number): PlanBlock => ({ ...block({ id: 'h', cat: 'inne', at: '09:00', min }), costs: { head: 5, emotions: 0, senses: 0 } })
const sc = (plan: PlanBlock[], settings: Record<string, unknown> = {}) => new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0, ...settings } })

function react(s: Scenario, now: string, seen: string | null, o: { iconOnly?: boolean; over?: boolean } = {}) {
  const { day, energy } = s.energyWithDay(now)
  const r = reserveReaction({
    events: s.events.filter((e) => e.t <= s.at(now)),
    day,
    energy,
    seen: () => ({ seenAt: seen ? idxOf(day.grid, s.at(seen)) : null, iconOnly: o.iconOnly === true }),
    over: o.over
  })
  return { ...r, statuses: r.descents.map((d) => d.status), at: r.descents.map((d) => hhmm(day, d.descent.at)) }
}

/** The head at the reserve at 12:20, then work to `restAt`, a rest of `restMin`, work again to 15:00. */
function day(restAt: string, restMin: number): Scenario {
  const [h, m] = restAt.split(':').map(Number) as [number, number]
  const restEnd = `${String(h + Math.floor((m + restMin) / 60)).padStart(2, '0')}:${String((m + restMin) % 60).padStart(2, '0')}`
  return sc([heavy(200), LATER])
    .checkin('08:00', MID)
    .ran('h', '09:00', '12:20')
    .ran('w', '12:20', restAt, { cat: 'analiza', min: 120 })
    .ran('r', restAt, restEnd, { cat: 'regeneracja', variant: 'drzemka', min: restMin })
    .ran('w2', restEnd, '15:00', { cat: 'analiza', min: 60 })
}

describe('propozycja regeneracji', () => {
  it('sposób o najniższym koszcie w wyczerpanej puli, przy remisie pierwszy z listy', () => {
    expect(suggestRegen(DEFAULT_SETTINGS, 'head')).toBe('drzemka')
    expect(suggestRegen(DEFAULT_SETTINGS, 'emotions')).toBe('spacer')
    // Cisza i prysznic mają po −3 dla bodźców: pierwsza z listy.
    expect(suggestRegen(DEFAULT_SETTINGS, 'senses')).toBe('cisza')
  })

  it('wariant bez własnych kosztów ma koszt kategorii', () => {
    const own = { id: 'sauna', name: 'Sauna' }
    const settings = settingsFrom(deepMerge<unknown>(DEFAULT_SETTINGS, { categories: { regeneracja: { costs: { head: -5, emotions: -5, senses: -5 }, variants: [...DEFAULT_SETTINGS.categories.regeneracja!.variants, own] } } }))
    expect(settings.categories.regeneracja!.variants.at(-1)).toEqual(own)
    expect(suggestRegen(settings, 'head')).toBe('sauna')
  })
})

describe('Reakcja na rezerwę', () => {
  it('żadna pula nie zeszła do rezerwy: nagroda', () => {
    const r = react(sc([LATER]).checkin('08:00', MID), '12:00', null)
    expect(r.verdict).toBe('reward')
    expect(r.descents).toEqual([])
  })

  it('odpoczynek zaczęty najpóźniej 60 min po pierwszym zobaczeniu komunikatu (D241); minutę później – brak nagrody', () => {
    const ok = react(day('14:00', 15), '15:00', '13:00')
    expect(ok.at).toEqual(['12:20'])
    expect(ok.statuses).toEqual(['met'])
    expect(ok.verdict).toBe('reward')
    const late = react(day('14:01', 15), '15:00', '13:00')
    expect(late.statuses).toEqual(['missed'])
    expect(late.verdict).toBe('missed')
    // Zanim minie 60 min od zobaczenia, wynik czeka.
    expect(react(day('14:00', 15), '13:30', '13:00').verdict).toBe('pending')
  })

  it('odpoczynek zaczęty po zejściu i trwający w chwili zobaczenia (D244)', () => {
    const s = sc([heavy(200), LATER]).checkin('08:00', MID).ran('h', '09:00', '12:20').ran('r', '12:20', '12:50', { cat: 'regeneracja', variant: 'drzemka', min: 30 }).ran('w', '12:50', '14:00', { cat: 'analiza', min: 70 })
    expect(react(s, '14:00', '12:40').statuses).toEqual(['met'])
  })

  it('odpoczynek trwający już w chwili zejścia daje nagrodę także bez zobaczenia komunikatu', () => {
    const s = sc([heavy(180), LATER])
      .checkin('08:00', MID)
      .ran('h', '09:00', '12:00')
      .start('r', '12:00', { cat: 'regeneracja', variant: 'drzemka', min: 30 })
      .relative('head', -10, '12:05')
      .end('r', '12:30')
    const r = react(s, '12:30', null)
    expect(r.at).toEqual(['12:05'])
    expect(r.statuses).toEqual(['met'])
  })

  it('odpoczynek krótszy niż 10 min nie wystarcza', () => {
    expect(react(day('12:30', 9), '15:00', '12:20').statuses).toEqual(['missed'])
    expect(react(day('12:30', 10), '15:00', '12:20').statuses).toEqual(['met'])
  })

  it('zmiana formy odpoczynku nie przerywa ciągłości: czas bez bloku po końcu pracy, blok regeneracji, znów czas bez bloku', () => {
    const s = sc([heavy(200)]).checkin('08:00', MID).ran('h', '09:00', '12:20').ran('r', '12:25', '12:30', { cat: 'regeneracja', min: 5 })
    const r = react(s, '12:32', '12:20')
    expect(r.statuses).toEqual(['met'])
    expect(hhmm(s.state('12:32'), r.descents[0]!.rest!.from)).toBe('12:20')
  })

  it('komunikat niezobaczony do 10 min przed porą snu nie odbiera nagrody; do tej chwili wynik czeka', () => {
    const s = day('14:01', 15)
    expect(react(s, '15:00', null).verdict).toBe('pending')
    expect(react(s, '21:51', null).statuses).toEqual(['excused'])
    expect(react(s, '15:00', null, { over: true }).verdict).toBe('reward')
    // Zobaczony po raz pierwszy 5 min przed porą snu (22:00) liczy się jak niezobaczony.
    expect(react(s, '21:59', '21:55').statuses).toEqual(['excused'])
  })

  it('komunikat tylko jako cicha ikona „mniej pytań” nie odbiera nagrody (D157)', () => {
    expect(react(day('14:01', 15), '15:00', '13:00', { iconOnly: true }).verdict).toBe('reward')
  })

  it('zejście tej puli powtórzone tego dnia nie odbiera nagrody', () => {
    const s = sc([LATER], { reserve: 10 }).checkin('08:00', MID)
    for (let i = 0; i < 6; i++) s.relative('head', -10, `09:0${i}`)
    s.ran('r', '09:05', '09:20', { cat: 'regeneracja', variant: 'drzemka', min: 15 })
      .start('w', '09:20', { cat: 'analiza', min: 70 })
      .relative('head', 10, '09:20')
      .relative('head', 10, '09:21')
      .relative('head', -10, '09:22')
      .relative('head', -10, '09:23')
      .end('w', '10:30')
    const r = react(s, '10:30', '09:05')
    expect(r.at).toEqual(['09:05', '09:23'])
    expect(r.statuses).toEqual(['met', 'excused'])
    expect(r.verdict).toBe('reward')
  })

  it('dzień z wyłączonym modułem energii nie liczy się w żadną stronę', () => {
    const s = day('14:01', 15).module(false, '15:10')
    const r = react(s, '15:20', '13:00')
    expect(r.verdict).toBe('none')
    expect(r.why).toBe('energia wyłączona tego dnia')
  })

  it('tylko przy pierwszym check-inie przed pierwszym blokiem pracy; blok sprzed pierwszego użycia liczy się od tego użycia', () => {
    const late = () => sc([block({ id: 'a', cat: 'analiza', at: '07:00', min: 60 }), LATER]).ran('a', '07:00', '08:00')
    const r = react(late().checkin('08:30', MID), '09:00', null)
    expect(r.verdict).toBe('none')
    expect(r.why).toBe('check-in po pierwszym bloku pracy')
    expect(react(late().presence('08:45').checkin('08:30', MID), '09:00', null).verdict).toBe('reward')
    expect(react(sc([LATER]), '09:00', null).why).toBe('energia nieznana')
  })
})
