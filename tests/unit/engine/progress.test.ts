/**
 * The progress of the game (spec „Progresja”, „Świętowanie”): the room unlocked by the notes of frozen days, the
 * cassettes of weeks closed by their frozen Sunday (the cover's season and favourite regeneration, the sticker from 70%
 * of the counted days kept), the full-screen celebrations of streaks and new items of the room.
 */
import { describe, expect, it } from 'vitest'
import { gameSummary, type GameDay } from '@shared/engine/game'
import { cassettesOf, celebrationsOf, DISCONNECT_WAY, gameView, regenWaysOf, roomOf, seasonOf, type RoomItem } from '@shared/engine/progress'
import { addDays } from '@shared/time/zone'
import { Scenario, block } from './dsl'

const day = (date: string, status: GameDay['status'], o: Partial<GameDay> = {}): GameDay => ({ date, status, notes: status === 'kept' ? 6 : 0, frozen: true, ...o })
/** Days from `from`, one status each. */
const run = (from: string, statuses: Array<GameDay['status']>, o: Partial<GameDay> = {}): GameDay[] => statuses.map((s, i) => day(addDays(from, i), s, o))

describe('pokój', () => {
  const items: RoomItem[] = [
    { id: 'a', name: 'A', notes: 0 },
    { id: 'b', name: 'B', notes: 20 },
    { id: 'c', name: 'C', notes: 50 }
  ]

  it('nuty zamrożonych dni odblokowują elementy; następny z brakującymi nutami', () => {
    expect(roomOf(0, items)).toEqual({ unlocked: [items[0]], next: { item: items[1], missing: 20 } })
    expect(roomOf(20, items).unlocked.map((x) => x.id)).toEqual(['a', 'b'])
    expect(roomOf(75, items)).toEqual({ unlocked: items, next: null })
  })

  it('pokój liczy tylko nuty zamrożonych dni: nuty „w toku” niczego nie odblokowują', () => {
    const days = [day('2026-11-02', 'kept', { notes: 15 }), day('2026-11-03', 'kept', { notes: 10, frozen: false })]
    const v = gameView(days, '2026-11-04', items)
    expect(v.notes).toEqual({ final: 15, pending: 10 })
    expect(v.room.unlocked.map((x) => x.id)).toEqual(['a'])
  })
})

describe('kasety', () => {
  const MON = '2026-11-02'

  it('tydzień zamyka się kasetą dopiero po zamrożeniu niedzieli', () => {
    const open = run(MON, ['kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'kept'])
    open[6] = { ...open[6]!, frozen: false }
    expect(cassettesOf(open, gameSummary(open, '2026-11-09').steps)).toEqual([])
    const closed = run(MON, ['kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'kept'])
    expect(cassettesOf(closed, gameSummary(closed, '2026-11-09').steps).map((c) => c.week)).toEqual([MON])
  })

  it('naklejka, gdy co najmniej 70% dni dotrzymanych i liczonych jako niedotrzymane to dni dotrzymane (T44)', () => {
    // 5 kept, 2 broken: 5/7 ≈ 71% – a sticker.
    const a = run(MON, ['kept', 'broken', 'kept', 'kept', 'broken', 'kept', 'kept'])
    expect(cassettesOf(a, gameSummary(a, '2026-11-09').steps)[0]).toMatchObject({ kept: 5, counted: 7, sticker: true })
    // 4 kept, 2 broken, 1 outside the game: 4/6 ≈ 67% – none.
    const b = run(MON, ['kept', 'broken', 'kept', 'out', 'broken', 'kept', 'kept'])
    expect(cassettesOf(b, gameSummary(b, '2026-11-09').steps)[0]).toMatchObject({ kept: 4, counted: 6, sticker: false })
  })

  it('dni bez danych w limicie nie liczą się do naklejki, trzeci w tygodniu – jak niedotrzymany; tydzień bez takich dni – bez naklejki', () => {
    const a = run(MON, ['kept', 'noData', 'noData', 'noData', 'kept', 'kept', 'kept'])
    expect(cassettesOf(a, gameSummary(a, '2026-11-09').steps)[0]).toMatchObject({ kept: 4, counted: 5, sticker: true })
    const free = run(MON, ['out', 'out', 'out', 'out', 'out', 'out', 'out'])
    expect(cassettesOf(free, gameSummary(free, '2026-11-09').steps)[0]).toMatchObject({ counted: 0, sticker: false })
  })

  it('okładka: pora roku tygodnia (według czwartku) i ulubiona regeneracja – najwięcej minut, przy remisie pierwsza według nazwy', () => {
    expect(seasonOf('2026-11-30')).toBe('winter')
    expect(seasonOf('2027-02-22')).toBe('winter')
    expect(seasonOf('2027-03-01')).toBe('spring')
    // The week of 30.11 has its Thursday on 3.12.
    expect(seasonOf('2026-08-31')).toBe('autumn')
    const days = run(MON, ['kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'kept'])
    days[0] = { ...days[0]!, regenWays: { spacer: 30, drzemka: 20 } }
    days[1] = { ...days[1]!, regenWays: { drzemka: 10, [DISCONNECT_WAY]: 40 } }
    const [c] = cassettesOf(days, gameSummary(days, '2026-11-09').steps)
    expect(c).toMatchObject({ season: 'autumn', favourite: DISCONNECT_WAY })
    days[2] = { ...days[2]!, regenWays: { drzemka: 10 } }
    // drzemka 40, odcinam 40: a tie – the first by name.
    expect(cassettesOf(days, gameSummary(days, '2026-11-09').steps)[0]!.favourite).toBe('drzemka')
  })

  it('minuty regeneracji dnia według sposobu: bloki regeneracji według wariantu i „Odcinam się”', () => {
    const s = new Scenario({ date: '2026-10-28', plan: [block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '13:00', min: 20 }), block({ id: 'w', cat: 'regeneracja', variant: 'spacer', at: '15:00', min: 30 })], settings: { transitionBufferMin: 0 } })
    s.ran('r', '13:00', '13:25').ran('w', '15:00', '15:30').disconnect('20:00', '20:45')
    expect(regenWaysOf(s.state('23:00'))).toEqual({ drzemka: 25, spacer: 30, [DISCONNECT_WAY]: 45 })
  })
})

describe('świętowanie', () => {
  it('passa 7, 14, 30 dni na zamrożonym dniu: pełny ekran raz, z kluczem; dzień jeszcze otwarty na poprawki – czeka', () => {
    const days = run('2026-10-01', new Array(14).fill('kept'))
    const c = celebrationsOf(days, gameSummary(days, '2026-10-20').steps, [])
    expect(c.map((x) => x.key)).toEqual(['streak:2026-10-07:7', 'streak:2026-10-14:14'])
    const pending = run('2026-10-01', new Array(7).fill('kept'))
    pending[6] = { ...pending[6]!, frozen: false }
    expect(celebrationsOf(pending, gameSummary(pending, '2026-10-20').steps, [])).toEqual([])
  })

  it('bez świętowania passy, gdy w ostatnich 30 dniach skończyła się passa co najmniej tej długości', () => {
    // 10 kept, two broken (the protection day takes the first), then 7 kept: a streak of 10 ended 8 days before.
    const days = run('2026-10-05', [...new Array(10).fill('kept'), 'broken', 'broken', ...new Array(7).fill('kept')])
    const c = celebrationsOf(days, gameSummary(days, '2026-11-01').steps, [])
    expect(c.map((x) => x.key)).toEqual(['streak:2026-10-11:7'])
    // A streak of only 5 that ended: 7 is celebrated again.
    const short = run('2026-10-05', [...new Array(5).fill('kept'), 'broken', 'broken', ...new Array(7).fill('kept')])
    expect(celebrationsOf(short, gameSummary(short, '2026-11-01').steps, []).map((x) => x.key)).toEqual(['streak:2026-10-18:7'])
    // A streak of exactly 7 that ended: „co najmniej tej długości” – the next 7 is no celebration.
    const same = run('2026-10-05', [...new Array(7).fill('kept'), 'broken', 'broken', ...new Array(7).fill('kept')])
    expect(celebrationsOf(same, gameSummary(same, '2026-11-01').steps, []).map((x) => x.key)).toEqual(['streak:2026-10-11:7'])
  })

  it('po 30 dniach od końca dłuższej passy ta sama długość znów jest świętem', () => {
    const days = run('2026-09-01', [...new Array(8).fill('kept'), 'broken', 'broken', ...new Array(29).fill('out'), ...new Array(7).fill('kept')])
    const keys = celebrationsOf(days, gameSummary(days, '2026-11-01').steps, []).map((x) => x.key)
    // The streak of 8 broke on 10.09 (9.09 took the protection day); 7 days again reached on 16.10 – 36 days later.
    expect(keys).toEqual(['streak:2026-09-07:7', 'streak:2026-10-16:7'])
  })

  it('raz przy każdym nowym elemencie pokoju – w zamrożonym dniu, którego nuty go odblokowały; elementy startowe bez święta', () => {
    const items: RoomItem[] = [
      { id: 'start', name: 'S', notes: 0 },
      { id: 'b', name: 'B', notes: 10 },
      { id: 'c', name: 'C', notes: 12 }
    ]
    const days = [day('2026-11-02', 'kept', { notes: 6 }), day('2026-11-03', 'kept', { notes: 7 }), day('2026-11-04', 'kept', { notes: 9, frozen: false })]
    expect(celebrationsOf(days, gameSummary(days, '2026-11-05').steps, items).map((x) => [x.key, x.date])).toEqual([
      ['room:b', '2026-11-03'],
      ['room:c', '2026-11-03']
    ])
    // Notes of a day still open to corrections unlock nothing – no celebration either.
    const open = [day('2026-11-02', 'kept', { notes: 6 }), day('2026-11-03', 'kept', { notes: 7, frozen: false })]
    expect(celebrationsOf(open, gameSummary(open, '2026-11-05').steps, items)).toEqual([])
  })
})
