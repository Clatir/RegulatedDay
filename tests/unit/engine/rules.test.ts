/**
 * Rules of „Model dnia” beyond the example: the boundary approved on its own, the 15-minute rule of the first end of work,
 * a day without work, the maximum moved by lectures, sessions and exceptions, „Odcinam się”, the budget, the second shift
 * outside its time, requests that take rest away, a block through 04:00 and the days of the clock change.
 */
import { describe, expect, it } from 'vitest'
import { Scenario, block, hhmm } from './dsl'

const ordinary = (plan: ReturnType<typeof block>[], settings: Record<string, unknown> = { transitionBufferMin: 0 }) =>
  new Scenario({ date: '2026-10-21', plan, settings })

describe('granica', () => {
  it('bez zatwierdzenia propozycja zatwierdza się sama w chwili startu pierwszego bloku pracy', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '08:00', min: 240 }), block({ id: 'b', cat: 'analiza', at: '13:00', min: 180 })])
    s.start('a', '08:00')
    const st = s.state('09:00')
    expect(hhmm(st, st.boundary.approved)).toBe('16:15')
    expect(st.boundary.auto).toBe(true)
    expect(hhmm(st, st.boundary.approvedAt)).toBe('08:00')
    // Before the first work block there is only the proposal.
    const before = s.state('07:30')
    expect(before.boundary.approved).toBeNull()
    expect(hhmm(before, before.boundary.proposal)).toBe('16:15')
  })

  it('propozycja granicy nie wychodzi poza maksimum', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '12:00', min: 480 })])
    const st = s.state('08:00')
    expect(hhmm(st, st.boundary.proposal)).toBe('19:00')
  })

  it('wykład z planu wykładów kończący się po maksimum przesuwa je do swojego końca plus bufor granicy', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '09:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '18:00', min: 120, fixed: true, origin: 'lecture' })
    ])
    const st = s.state('08:00')
    expect(hhmm(st, st.boundary.max)).toBe('20:15')
    expect(hhmm(st, st.boundary.proposal)).toBe('20:15')
  })

  it('sesja zostawiona w dniu domyślnie bez sesji przesuwa maksimum do jej końca plus bufor', () => {
    const s = new Scenario({
      date: '2026-10-24',
      dayType: 'weekend',
      plan: [block({ id: 'ny', cat: 'sesja', at: '14:00', min: 180, fixed: true, origin: 'session', source: 'ny' })]
    })
    const st = s.state('08:00')
    expect(hhmm(st, st.boundary.max)).toBe('17:15')
  })

  it('wyjątek granicy przesuwa maksimum o wybraną wartość, a propozycja liczy się od nowego maksimum', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '12:00', min: 480 })])
    s.exception(60, '07:00')
    const st = s.state('08:00')
    expect(hhmm(st, st.boundary.max)).toBe('20:00')
    expect(hhmm(st, st.boundary.proposal)).toBe('20:00')
  })
})

describe('koniec pracy', () => {
  it('reguła 15 min: blok elastyczny, który nie zaczął się w ciągu 15 min, nie trzyma pracy otwartej, a regeneracja dopisuje się wstecz', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 420 }),
      block({ id: 'b', cat: 'analiza', at: '15:00', min: 60 })
    ])
    s.approve('16:15', '07:00').ran('a', '08:00', '15:00')
    const at1510 = s.state('15:10')
    expect(at1510.firstEnd).toBeNull()
    const at1520 = s.state('15:20')
    expect(hhmm(at1520, at1520.firstEnd)).toBe('15:00')
    expect(at1520.ends[0]?.confirmed).toBe(false)
    // 15:00–15:20 is regeneration now (before the boundary, a third of the minimum at most).
    expect(at1520.regen.totalMin).toBe(20)
  })

  it('„Koniec pracy”, po którym zostaje blok stały pracy, jest tylko przerwą', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 240 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '15:00', min: 90, fixed: true, origin: 'lecture' })
    ])
    s.approve('16:45', '07:00').ran('a', '08:00', '12:00').workEnd('12:00')
    const st = s.state('13:00')
    expect(st.firstEnd).toBeNull()
    expect(st.workEnd).toBeNull()
  })

  it('„Koniec pracy” po bloku pracy krótszym od minuty (np. „Zacznij” przez pomyłkę) potwierdza koniec w tej chwili (T507)', () => {
    const s = ordinary([block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })])
    s.ran('a', '09:00', '09:00').workEnd('09:00')
    const st = s.state('09:30')
    expect(hhmm(st, st.workEnd)).toBe('09:00')
    expect(st.ends).toEqual([{ at: st.workEnd, confirmed: true }])
    expect(st.extensionMin).toBe(0)
    // A fixed work block still to come makes it a break, as after any work.
    const fixed = ordinary([block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '15:00', min: 90, fixed: true, origin: 'lecture' })])
    fixed.ran('a', '09:00', '09:00').workEnd('09:00')
    expect(fixed.state('09:30').workEnd).toBeNull()
    // Without „Koniec pracy” nothing is confirmed by itself.
    const plain = ordinary([block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })])
    plain.ran('a', '09:00', '09:00')
    expect(plain.state('09:05').ends.some((e) => e.confirmed)).toBe(false)
  })

  it('pusty odcinek pracy (T507) jak każdy: zostaje przed późniejszą pracą, potwierdza go „Odcinam się”, nie „Koniec pracy” sprzed niego', () => {
    const plan = () => [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 120 })]
    // Work later in the day: the first end stays where it was confirmed.
    const later = ordinary(plan())
    later.ran('a', '09:00', '09:00').workEnd('09:00').ran('b', '13:00', '15:00')
    const st = later.state('16:00')
    expect(hhmm(st, st.firstEnd)).toBe('09:00')
    expect(st.ends[0]).toEqual({ at: st.firstEnd, confirmed: true })
    // „Odcinam się” right after it confirms it, as after a minute of work.
    const cut = ordinary(plan())
    cut.ran('a', '09:00', '09:00').disconnect('09:00', null)
    const cs = cut.state('09:30')
    expect(hhmm(cs, cs.workEnd)).toBe('09:00')
    expect(cs.ends[0]?.confirmed).toBe(true)
    // „Koniec pracy” at 08:00, before any work: it does not confirm the empty stretch of 10:00.
    const early = ordinary([block({ id: 'a', cat: 'inne', at: '10:00', min: 60 })])
    early.workEnd('08:00').ran('a', '10:00', '10:00')
    expect(early.state('10:30').ends.some((e) => e.confirmed)).toBe(false)
  })

  it('dzień bez bloków pracy: koniec pracy to pobudka, regeneracja od pobudki', () => {
    const s = new Scenario({ date: '2026-10-24', dayType: 'weekend', plan: [block({ id: 'm', cat: 'posilek', at: '09:00', min: 30 })], nextWake: '08:00' })
    s.ran('m', '09:00', '09:30')
    const st = s.state('11:00')
    expect(st.noWorkDay).toBe(true)
    expect(hhmm(st, st.workEnd)).toBe('08:00')
    // 08:00–09:00 and 09:30–11:00 are time without a block after the end of work.
    expect(st.regen.totalMin).toBe(150)
  })

  it('„Odcinam się” w trakcie pracy kończy pracę w tej chwili i jest regeneracją', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '08:00', min: 600 })])
    s.approve('18:15', '07:00').start('a', '08:00').end('a', '16:00').disconnect('16:00', '17:00')
    const st = s.state('17:00')
    expect(hhmm(st, st.firstEnd)).toBe('16:00')
    expect(st.ends[0]?.confirmed).toBe(true)
    expect(st.regen.totalMin).toBe(60)
  })
})

describe('budżet i druga zmiana', () => {
  it('budżet to czas zegarowy bloków pracy razem z drugą zmianą; nakładające się liczą się raz', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 }),
      block({ id: 'rec', cat: 'wyklad', at: '09:00', min: 120, fixed: true, bg: true, origin: 'lecture' }),
      block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })
    ])
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').start('rec', '09:00', { bg: true }).end('rec', '11:00').ran('ds', '20:00', '21:00')
    const st = s.state('21:30')
    // 08:00–11:00 (the recording overlaps the analysis) and 20:00–21:00.
    expect(st.budgetUsedMin).toBe(240)
    expect(st.extensionMin).toBe(0)
  })

  it('wcześniejszy start drugiej zmiany to zwykłe przedłużenie, nigdy przekroczenie', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 }),
      block({ id: 'ds', cat: 'sesja', at: '20:00', min: 60, fixed: true, tag: 'secondShift' })
    ])
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').workEnd('10:00').start('ds', '19:40', { confirmUntil: '20:00' }).end('ds', '21:00')
    const st = s.state('21:00')
    const cls = [...st.minutes.values()].map((m) => m.cls)
    // 19:40–20:00 after the maximum (19:00), yet only an extension; 20:00–21:00 is the second shift's own time.
    expect(cls.filter((c) => c === 'after').length).toBe(20)
    expect(cls.filter((c) => c === 'max').length).toBe(0)
    expect(st.extensionMin).toBe(20)
  })
})

describe('prośby', () => {
  it('prośba, która przerwała blok regeneracji, jest usprawiedliwiona i pomniejsza minimum', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 }), block({ id: 'r', cat: 'regeneracja', at: '11:00', min: 60 })])
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').workEnd('10:00').start('r', '11:00').pause('r', '11:20').request('q', '11:20', '11:35').resume('r', '11:35').end('r', '12:00')
    const st = s.state('12:30')
    expect(st.regen.justifiedRequestMin).toBe(15)
    expect(st.regen.requiredMin).toBe(75)
  })

  it('prośba w czasie bez bloku przed twardym końcem nie zmienia minimum', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 })])
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').workEnd('10:00').request('q', '12:00', '12:30')
    const st = s.state('13:00')
    expect(st.regen.justifiedRequestMin).toBe(0)
    expect(st.regen.requiredMin).toBe(90)
  })
})

describe('zmiana czasu i 04:00', () => {
  it('dzień 24.10.2026 trwa 25 h: blok przez podwójną godzinę liczy się z różnicy znaczników czasu', () => {
    const s = new Scenario({ date: '2026-10-24', dayType: 'weekend', plan: [block({ id: 'p', cat: 'analiza', at: '01:30', min: 180 })], nextWake: '08:00' })
    // 01:30 CEST → 03:30 CET is three hours of the clock.
    s.start('p', '01:30')
    s.raw({ k: 'block.end', block: 'p', at: Date.parse('2026-10-25T02:30:00Z'), done: true, rule: null }, '03:30+1')
    const st = s.state('03:40+1')
    expect(st.grid.length).toBe(1500)
    expect(st.budgetUsedMin).toBe(180)
  })

  it('dzień 27.03.2027 trwa 23 h: blok 01:30–03:30 trwa godzinę', () => {
    const s = new Scenario({ date: '2027-03-27', dayType: 'weekend', plan: [block({ id: 'p', cat: 'analiza', at: '01:30', min: 60 })], nextWake: '08:00' })
    s.start('p', '01:30').end('p', '03:30')
    const st = s.state('03:40')
    expect(st.grid.length).toBe(1380)
    expect(st.budgetUsedMin).toBe(60)
  })

  it('blok biegnący przez 04:00 należy do dnia, w którym się zaczął', () => {
    const s = ordinary([block({ id: 'a', cat: 'analiza', at: '08:00', min: 120 })])
    s.approve('10:15', '07:00').ran('a', '08:00', '10:00').workEnd('10:00')
    s.start('noc', '03:00+1', { cat: 'analiza', min: 120, confirmUntil: '05:00+1' }).end('noc', '05:00+1')
    const st = s.state('05:10+1')
    expect(st.budgetUsedMin).toBe(240)
    // All 120 minutes of the night block are this day's extension, also the hour after 04:00.
    expect(st.extensionMin).toBe(120)
  })
})

describe('plan odporny na błędy', () => {
  it('blok zakotwiczony do siebie albo w cyklu kotwic nie wysypuje silnika i wypada z planu', () => {
    const s = ordinary([
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
      block({ id: 'self', cat: 'journaling', after: 'self', min: 30 }),
      block({ id: 'x', cat: 'journaling', after: 'y', min: 30 }),
      block({ id: 'y', cat: 'journaling', after: 'x', min: 30 })
    ])
    expect(() => s.state('09:00')).not.toThrow()
  })
})
