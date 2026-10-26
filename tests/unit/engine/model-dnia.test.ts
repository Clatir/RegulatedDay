/**
 * The example of „Model dnia” (spec table „Przykład (dzień zwykły)”), every row a test: an ordinary day with a 9 h
 * budget, maximum 19:00, bedtime 22:00 (tomorrow's wake 06:00), minimum 90 min, project limit 4 h, boundary buffer
 * 15 min and the transition buffer set to 0.
 */
import { describe, expect, it } from 'vitest'
import { Scenario, block, hhmm } from './dsl'

const plan = () => [
  block({ id: 'a1', cat: 'analiza', at: '07:30', min: 30 }),
  block({ id: 'londyn', cat: 'sesja', at: '08:00', min: 180, fixed: true, origin: 'session', source: 'londyn' }),
  block({ id: 'r1', cat: 'sprawy', at: '11:00', min: 30 }),
  block({ id: 'obiad', cat: 'posilek', at: '11:30', min: 45 }),
  block({ id: 'spacer', cat: 'regeneracja', variant: 'spacer', at: '12:15', min: 30 }),
  block({ id: 'r2', cat: 'sprawy', at: '12:45', min: 45 }),
  block({ id: 'a2', cat: 'analiza', at: '13:30', min: 30 }),
  block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' }),
  block({ id: 'jrn', cat: 'journaling', after: 'ny', min: 30 }),
  block({ id: 'kolacja', cat: 'posilek', at: '19:15', min: 30 }),
  block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' }),
  block({ id: 'rutyna', cat: 'rutyny', at: '21:00', min: 15 })
]

/** The day as planned up to the end of the NY session (sessions begun with „Zacznij” on time). */
function day(): Scenario {
  const s = new Scenario({ date: '2026-10-21', plan: plan(), settings: { transitionBufferMin: 0 } })
  s.approve('17:45', '07:00')
    .ran('a1', '07:30', '08:00')
    .ran('londyn', '08:00', '11:00')
    .ran('r1', '11:00', '11:30')
    .ran('obiad', '11:30', '12:15')
    .ran('spacer', '12:15', '12:45')
    .ran('r2', '12:45', '13:30')
    .ran('a2', '13:30', '14:00')
  return s
}

describe('Model dnia – przykład (dzień zwykły)', () => {
  it('granica: 17:30 + 15 min = 17:45, zatwierdzona; druga zmiana jej nie zmienia', () => {
    const s = day()
    const st = s.state('09:00')
    expect(hhmm(st, st.boundary.proposal)).toBe('17:45')
    expect(hhmm(st, st.boundary.approved)).toBe('17:45')
    expect(hhmm(st, st.boundary.max)).toBe('19:00')
  })

  it('regeneracja w ciągu dnia: spacer 30 min (jedna trzecia minimum), do minimum brakuje 60 min', () => {
    const s = day().ran('ny', '14:00', '17:00').start('jrn', '17:00')
    const st = s.state('17:15')
    expect(st.regen.towardMinMin).toBe(30)
    expect(st.regen.missingMin).toBe(60)
  })

  it('twardy koniec projektów: od 22:00 wstecz – 21:15–22:00 daje 45 min, 19:45–20:00 brakujące 15; twardy koniec o 19:45', () => {
    const s = day().ran('ny', '14:00', '17:00').start('jrn', '17:00')
    const st = s.state('17:15')
    expect(hhmm(st, st.hardEnd.at)).toBe('19:45')
    expect(st.hardEnd.unreachable).toBe(false)
  })

  it('koniec pracy o 17:30, kliknięty w widgecie: granica dotrzymana, pula 1 h 45', () => {
    const s = day().ran('ny', '14:00', '17:00').start('jrn', '17:00').end('jrn', '17:30').workEnd('17:30')
    const st = s.state('17:30')
    expect(hhmm(st, st.workEnd)).toBe('17:30')
    expect(st.extensionMin).toBe(0)
    expect(hhmm(st, st.hardEnd.at)).toBe('19:45')
    expect(st.pool.byLimit).toBe(240)
    expect(st.pool.byTime).toBe(105)
    expect(st.pool.min).toBe(105)
  })

  it('wariant: sesja NY dłuższa o 30 min – przedłużenie 15 min, pula 1 h 15', () => {
    const s = day().start('ny', '14:00').extend('ny', 30, '16:50').end('ny', '17:30').start('jrn', '17:30').end('jrn', '18:00').workEnd('18:00')
    const st = s.state('18:00')
    expect(hhmm(st, st.workEnd)).toBe('18:00')
    expect(st.extensionMin).toBe(15)
    expect([...st.minutes.values()].filter((m) => m.cls === 'after').length).toBe(15)
    expect(st.pool.byLimit).toBe(225)
    expect(st.pool.byTime).toBe(75)
    expect(st.pool.min).toBe(75)
  })

  it('wariant: praca do 19:10 – przedłużenie 75 min, przekroczenie 10 min, pula 5 min, pora snu bez zmian', () => {
    const s = day()
      .start('ny', '14:00')
      .extend('ny', 90, '16:50')
      .end('ny', '18:30')
      .start('jrn', '18:30')
      .end('jrn', '19:00')
      .start('analiza-dodana', '19:00', { cat: 'analiza', min: 10, confirmUntil: '19:10' })
      .end('analiza-dodana', '19:10')
      .workEnd('19:10')
    const st = s.state('19:10')
    const cls = [...st.minutes.values()].map((m) => m.cls)
    expect(cls.filter((c) => c === 'after').length).toBe(75)
    expect(cls.filter((c) => c === 'max').length).toBe(10)
    expect(cls.filter((c) => c === 'empty').length).toBe(0)
    expect(st.extensionMin).toBe(85)
    expect(st.overrunMin).toBe(10)
    expect(st.pool.byLimit).toBe(155)
    expect(st.pool.byTime).toBe(5)
    expect(st.pool.min).toBe(5)
    expect(st.bedtime.shiftMin).toBe(0)
    expect(hhmm(st, st.bedtime.effective)).toBe('22:00')
  })

  /** Work to 17:30 (end clicked), then projects 17:30–19:15 and dinner 19:15–19:45. */
  const evening = () =>
    day()
      .ran('ny', '14:00', '17:00')
      .ran('jrn', '17:00', '17:30')
      .workEnd('17:30')
      .ran('p1', '17:30', '19:15', { cat: 'projekty', min: 105 })
      .ran('kolacja', '19:15', '19:45')

  it('wariant: projekty 17:30–19:15, po kolacji druga zmiana do 21:30 – twardy koniec nie mija, pora snu 22:30, nagroda za regenerację zostaje', () => {
    const s = evening().start('ds', '20:00').extend('ds', 30, '20:50').end('ds', '21:30').ran('rutyna', '21:30', '21:45')
    // O 19:45 zaczyna się odpoczynek zgodny z planem: twardy koniec nie mija, a komunikatu nie ma.
    const at1950 = s.state('19:50')
    expect(at1950.hardEnd.passed).toBeNull()
    // O 20:00 twardy koniec przelicza się na 21:15 i nie mija.
    const at2000 = s.state('20:00')
    expect(hhmm(at2000, at2000.hardEnd.at)).toBe('21:15')
    expect(at2000.hardEnd.passed).toBeNull()
    // Przedłużenie drugiej zmiany o 30 min, potwierdzone z góry: każda minuta po kolei przesuwa porę snu, do 22:30.
    const st = s.state('22:30')
    expect([...st.minutes.values()].filter((m) => m.cls === 'empty' && m.upfront).length).toBe(30)
    expect(st.extensionMin).toBe(30)
    expect(st.bedtime.shiftMin).toBe(30)
    expect(hhmm(st, st.bedtime.effective)).toBe('22:30')
    expect(st.hardEnd.passed).toBeNull()
    expect(st.regen.towardMinMin).toBe(90)
    // Twardy koniec liczony z prognozą pory snu (22:30) to 21:45 i nie mija.
    const at2100 = s.state('21:00')
    expect(hhmm(at2100, at2100.bedtime.forecast)).toBe('22:30')
    expect(hhmm(at2100, at2100.hardEnd.at)).toBe('21:45')
  })

  it('wariant: projekty od 17:30 do 20:00 z przerwą na kolację – twardy koniec mija o 19:45, regeneracja 75 min', () => {
    const s = evening().ran('p2', '19:45', '20:00', { cat: 'projekty', min: 15 }).ran('ds', '20:00', '21:00').ran('rutyna', '21:00', '21:15')
    const st = s.state('22:00')
    expect(hhmm(st, st.hardEnd.passed)).toBe('19:45')
    expect(st.hardEnd.message).toBe(true)
    expect(st.pool.min).toBe(0)
    expect(st.regen.towardMinMin).toBe(75)
    expect(st.regen.towardMinMin < st.regen.requiredMin).toBe(true)
    expect(hhmm(st, st.bedtime.effective)).toBe('22:00')
  })

  it('wariant: projekty do 19:15, kolacja, potem prośba 19:45–20:00 – minimum spada do 75 min, nagroda zostaje', () => {
    const s = evening().request('q1', '19:45', '20:00').ran('ds', '20:00', '21:00').ran('rutyna', '21:00', '21:15')
    const st = s.state('22:00')
    expect(st.hardEnd.passed).toBeNull()
    expect(st.hardEnd.message).toBe(false)
    expect(st.regen.justifiedRequestMin).toBe(15)
    expect(st.regen.requiredMin).toBe(75)
    expect(st.regen.towardMinMin).toBe(75)
    expect(hhmm(st, st.bedtime.effective)).toBe('22:00')
  })

  it('wariant: koniec pracy o 17:30, potem 18:30–19:00 analiza – 45 min z przerwy do minimum, przedłużenie 30 min, pula 1 h', () => {
    const s = day()
      .ran('ny', '14:00', '17:00')
      .ran('jrn', '17:00', '17:30')
      .workEnd('17:30')
      .start('analiza-wieczor', '18:30', { cat: 'analiza', min: 30, confirmUntil: '19:00' })
      .end('analiza-wieczor', '19:00')
      .workEnd('19:00')
    const at1900 = s.state('19:00')
    expect(at1900.regen.towardMinMin).toBe(75)
    expect(at1900.extensionMin).toBe(30)
    const st = s.state('19:15')
    expect(st.regen.towardMinMin).toBe(90)
    expect(hhmm(st, st.hardEnd.at)).toBe('22:00')
    expect(st.pool.byLimit).toBe(210)
    expect(st.pool.byTime).toBe(60)
    expect(st.pool.min).toBe(60)
  })

  it('gdy pula się wyczerpie: minuty potwierdzone z góry przesuwają porę snu najwyżej o 2 h, reszta „poza limitem”', () => {
    // Praca potwierdzona z góry od 18:00 do 01:00 przy pustej puli (twardy koniec nieosiągalny).
    const s = day()
      .ran('ny', '14:00', '17:00')
      .ran('jrn', '17:00', '17:30')
      .workEnd('17:30')
      .start('noc', '18:00', { cat: 'analiza', min: 420, confirmUntil: '01:00+1' })
      .end('noc', '01:00+1')
    const st = s.state('01:00+1')
    expect(st.bedtime.shiftMin).toBe(120)
    expect(hhmm(st, st.bedtime.effective)).toBe('00:00')
    expect(st.bedtime.overLimitMin).toBeGreaterThan(0)
  })
})
