/**
 * N21 (D595, T2600–T2602, T2607): the energy of a day of the month – the weakest pool of the day and its shade as the strip of a column
 * shades it (dobrze · uwaga · poniżej rezerwy, D500; the strip's darkest minute, read by the same walk), from the curve the column draws (a day gone by from its log, a day to come
 * and today before its check-in from the assumed one); only this summary goes to the month (`MonthDay.energy`).
 */
import { describe, expect, it } from 'vitest'
import { monthDayOf } from '@shared/engine/calendarViews'
import { dayEnergy, onScreen, shadeOf, WATCH_ABOVE_RESERVE } from '@shared/engine/energyCurve'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import { horizonDay, unknownDay, type HorizonDay } from '@shared/engine/week'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { dayEnd, placeLogical } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const TODAY = '2026-11-04'
const PAST = '2026-11-03'
const FUT = '2026-11-05'
const NOW = placeLogical(TODAY, 12 * 60)

type Sample = EnergyTrack['samples'][number]
const at = (clock: string, head: number, emotions = 90, senses = 90, body = 90): Sample => ({ at: lm(clock), head, emotions, senses, body })
const track = (samples: Sample[], reserve = 30, assumed = false): EnergyTrack => ({ samples, reserve, ...(assumed ? { assumed: true as const } : {}) })

describe('N21 – energia dnia z krzywej (`dayEnergy`)', () => {
  it('zejście poniżej rezerwy: „poniżej rezerwy”, pula z najniższym minimum dnia i jej wartość', () => {
    const t = track([at('07:00', 85, 80, 70), at('10:00', 40, 75, 60), at('13:00', 22, 70, 55), at('16:00', 48, 66, 50), at('19:00', 60, 64, 52)])
    expect(dayEnergy(t)).toEqual({ pool: 'head', value: 22, state: 'low', reserve: 30, assumed: false })
  })

  it('najsłabsza 10 nad rezerwą – „uwaga”; wysoko – „dobrze”; granica rezerwa + 15 – już „dobrze”', () => {
    expect(dayEnergy(track([at('07:00', 90, 80, 70), at('12:00', 70, 40, 60), at('18:00', 75, 55, 50)]))).toMatchObject({ pool: 'emotions', value: 40, state: 'watch' })
    expect(dayEnergy(track([at('07:00', 95, 90, 90), at('12:00', 80, 75, 70, 66), at('18:00', 85, 80, 78, 72)]))).toMatchObject({ pool: 'body', value: 66, state: 'ok' })
    expect(dayEnergy(track([at('07:00', 90, 90, 30 + WATCH_ABOVE_RESERVE), at('12:00', 90, 90, 60)]))).toMatchObject({ pool: 'senses', value: 45, state: 'ok' })
    expect(dayEnergy(track([at('07:00', 90, 90, 44), at('12:00', 90, 90, 60)]))).toMatchObject({ pool: 'senses', value: 44, state: 'watch' })
  })

  it('wartość jak na ekranie (jedno zaokrąglenie, T1290): 29,6 przy rezerwie 30 to 30 – „uwaga”, jak pasek; 44,6 – 45, „dobrze”', () => {
    expect(dayEnergy(track([at('07:00', 29.6), at('12:00', 50)]))).toMatchObject({ pool: 'head', value: 30, state: 'watch' })
    expect(dayEnergy(track([at('07:00', 44.6), at('12:00', 50)]))).toMatchObject({ value: 45, state: 'ok' })
    expect(dayEnergy(track([at('07:00', 29.4), at('12:00', 50)]))).toMatchObject({ value: 29, state: 'low' })
  })

  it('remis – pierwsza pula w kolejności głowa, emocje, bodźce, ciało (także remis liczb na ekranie)', () => {
    expect(dayEnergy(track([at('07:00', 90, 40, 90, 40), at('12:00', 90, 60, 90, 60)]))!.pool).toBe('emotions')
    // 40,2 and 39,6 are both 40 on the screen.
    expect(dayEnergy(track([at('07:00', 90, 90, 40.2, 39.6), at('12:00', 90, 90, 60, 60)]))).toMatchObject({ pool: 'senses', value: 40 })
    // Lows at different hours: the lowest of the lows wins, whenever it is.
    expect(dayEnergy(track([at('07:00', 35, 90), at('12:00', 60, 34), at('18:00', 36, 60)]))).toMatchObject({ pool: 'emotions', value: 34 })
  })

  it('brak krzywej – null; mniej niż dwie próbki – null (pasek nie rysuje nic); próbka nie po kolei – poza krzywą', () => {
    expect(dayEnergy(null)).toBeNull()
    expect(dayEnergy(undefined)).toBeNull()
    expect(dayEnergy(track([]))).toBeNull()
    expect(dayEnergy(track([at('07:00', 10)]))).toBeNull()
    // A sample back in time is on no pool's curve (`poolCurve` keeps rising times): its 1 does not count.
    expect(dayEnergy(track([at('07:00', 80), at('10:00', 60), at('09:30', 1)]))).toMatchObject({ pool: 'head', value: 60 })
  })

  it('każda pula ze swoich próbek (T2607): próbka bez wartości jednej puli nie gubi minimum innej – głowa 5 o 09:00 to „poniżej”, jak pasek', () => {
    // At 09:00 the emotions have no value, the head 5: the head's curve has that sample (each pool is filtered on its own), the strip shades it.
    const t = track([at('07:00', 80), { ...at('09:00', 5), emotions: Number.NaN }, at('10:00', 60), at('11:00', 70)])
    expect(dayEnergy(t)).toMatchObject({ pool: 'head', value: 5, state: 'low' })
  })

  it('ostatnia próbka nie jest minutą paska (T2607): ostry spadek do 29 tuż na końcu krzywej, minuta przed nim 30 – „uwaga”, nie „poniżej”', () => {
    // The strip shades the minutes [first, last): 10:00 – 30,4 on the screen 30 (reserve 30: „uwaga”); the last sample's 29 is never shaded.
    expect(dayEnergy(track([{ at: 600, head: 30.4, emotions: 90, senses: 90, body: 90 }, { at: 601, head: 29, emotions: 90, senses: 90, body: 90 }]))).toMatchObject({ pool: 'head', value: 30, state: 'watch' })
  })

  it('przyjęty check-in przenosi się (`assumed`), rezerwa z krzywej', () => {
    expect(dayEnergy(track([at('04:00', 100, 100, 100, 100), at('20:00', 50)], 20, true))).toEqual({ pool: 'head', value: 50, state: 'ok', reserve: 20, assumed: true })
  })

  it('jedna reguła odcienia (T2600): `shadeOf` – poniżej rezerwy, mniej niż 15 nad nią, reszta', () => {
    expect([shadeOf(onScreen(14), 15), shadeOf(onScreen(15), 15), shadeOf(onScreen(29), 15), shadeOf(onScreen(30), 15)]).toEqual(['low', 'watch', 'watch', 'ok'])
  })
})

describe('N21 – `MonthDay.energy` z dnia horyzontu', () => {
  const day = (o: Partial<HorizonDay> = {}): HorizonDay => ({ ...unknownDay(FUT, 'future'), read: 'full', dayType: 'zwykly', ...o })

  it('dzień z krzywą pod rezerwą – kropka „poniżej”; bez krzywej – null; nieczytelny – null', () => {
    const low = track([at('07:00', 80), at('12:00', 12), at('18:00', 30)], 15, true)
    expect(monthDayOf(day({ energy: low })).energy).toEqual({ pool: 'head', value: 12, state: 'low', reserve: 15, assumed: true })
    expect(monthDayOf(day({ energy: null })).energy).toBeNull()
    expect(monthDayOf({ ...unknownDay(FUT, 'future'), energy: low }).energy).toBeNull()
  })

  it('silnikiem dnia: przyszły – z przyjętego check-inu (`assumed`), długa analiza schodzi pod rezerwę – „poniżej”, pula głowa', () => {
    const s = new Scenario({ date: FUT, plan: [block({ id: 'a', cat: 'analiza', at: '07:00', min: 720, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    const m = monthDayOf(horizonDay(s.contextAt(NOW), 'future'))
    expect(m.energy).toMatchObject({ pool: 'head', state: 'low', reserve: DEFAULT_SETTINGS.reserve, assumed: true })
    expect(m.energy!.value).toBeLessThan(DEFAULT_SETTINGS.reserve)
    // The module off now – no dot for a day to come.
    expect(monthDayOf(horizonDay(s.contextAt(NOW), 'future', null, { moduleOn: false })).energy).toBeNull()
    // Without the curve (as the month counted before N21): none.
    expect(monthDayOf(horizonDay(s.contextAt(NOW), 'future', null, { curve: false })).energy).toBeNull()
  })

  it('dzień miniony: bez check-inu – null; z check-inem – z logu, nie przyjęte', () => {
    const s = new Scenario({ date: PAST, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '21:00').ran('a', '09:00', '10:00')
    const after = dayEnd(PAST) + 3_600_000
    expect(monthDayOf(horizonDay(s.contextAt(after), 'past')).energy).toBeNull()
    s.checkin('07:40', { head: [2, 2], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
    const m = monthDayOf(horizonDay(s.contextAt(after), 'past'))
    // The check-in's 25 for the head – the weakest pool, 10 above the reserve of 15: „uwaga” at worst.
    expect(m.energy).toMatchObject({ pool: 'head', assumed: false, reserve: DEFAULT_SETTINGS.reserve })
    expect(m.energy!.value).toBeLessThanOrEqual(25)
  })

  it('dziś przed check-inem – przyjęte; po check-inie – Twoje', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'a', cat: 'analiza', at: '13:00', min: 60, origin: 'user' })], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').using('07:30', '12:00')
    expect(monthDayOf(horizonDay(s.contextAt(NOW), 'today')).energy).toMatchObject({ assumed: true })
    s.checkin('07:40', { head: [1, 1], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
    expect(monthDayOf(horizonDay(s.contextAt(NOW), 'today')).energy).toMatchObject({ pool: 'head', assumed: false })
  })
})
