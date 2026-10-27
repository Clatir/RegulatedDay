/**
 * The rules of the game (spec „Grywalizacja”: „Nagrody”, „Statusy dni i passa”, „Ocena dnia”; „Moduły”): every reward
 * with its conditions and exceptions, the order of statuses, the days outside the game, the streak with days without
 * data and the protection day, the grade stored with the rules' number.
 */
import { describe, expect, it } from 'vitest'
import { gradeOf, lastEventsOf } from '@shared/engine/freeze'
import { GAME_RULES, gameSummary, notesSum, reserveMessageId, storedGame, type GameDay, type GameDayInput, type GameGrade } from '@shared/engine/game'
import { gridOf, idxOf } from '@shared/engine/grid'
import type { Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import { questionId } from '@shared/model/ids'
import type { PlanBlock } from '@shared/model/plan'
import { dayEnd } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const H = 3_600_000
const AT = dayEnd(DATE) + 30 * H
const GAME: GameDayInput = { from: '2026-10-01', wizardDay: null, gameOn: true, energyOn: true }
const MID: Record<Pool, [Answer, Answer]> = { head: [1, 1], emotions: [1, 1], senses: [1, 1] }

const work = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min }), ...o })

/** A day with presence from 07:30, the boundary approved at 17:00, the check-in at 07:45, the plan given. */
function day(plan: PlanBlock[], o: { dayType?: 'zwykly' | 'zjazd-stacjonarny' | 'regeneracyjny' | 'wolne'; settings?: Record<string, unknown>; checkin?: boolean } = {}): Scenario {
  const s = new Scenario({ date: DATE, dayType: o.dayType, plan, settings: { transitionBufferMin: 0, ...o.settings } })
  s.presence('07:30')
  s.approve('17:00', '07:30')
  if (o.checkin !== false) s.checkin('07:45', MID)
  return s
}

const grade = (s: Scenario, game: Partial<GameDayInput> = {}): GameGrade => gradeOf({ ...s.contextAt(AT), now: AT }, lastEventsOf(s.events), { ...GAME, ...game }).game

/** An ordinary good day: one hour of work from 08:00, „Koniec pracy” at 09:00. */
const good = () => day([work('a', '08:00', 60)]).ran('a', '08:00', '09:00').workEnd('09:00')

describe('dotrzymana granica (3 nuty)', () => {
  it('bez minut przedłużenia, z potwierdzonym końcem pracy: dotrzymany i 3 nuty', () => {
    const g = grade(good())
    expect(g.status).toBe('kept')
    expect(g.earned.boundary).toBe(true)
    expect(g.notes.boundary).toBe(3)
  })

  it('minuty przedłużenia: niedotrzymany, bez nuty za granicę – także z potwierdzonym końcem pracy', () => {
    const s = day([work('a', '08:00', 60)])
    s.approve('08:30', '07:35')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    const g = grade(s)
    expect(g.status).toBe('broken')
    expect(g.notes.boundary).toBe(0)
  })

  it('bez potwierdzonego końca pracy: bez danych, bez nuty za granicę', () => {
    const s = day([work('a', '08:00', 60)]).ran('a', '08:00', '09:00')
    const g = grade(s)
    expect(g.status).toBe('noData')
    expect(g.notes.boundary).toBe(0)
  })

  it('niedotrzymany ma pierwszeństwo przed „bez danych” (D125)', () => {
    const s = day([work('a', '08:00', 60)])
    s.approve('08:30', '07:35')
    s.ran('a', '08:00', '09:00')
    expect(grade(s).status).toBe('broken')
  })

  it('dzień bez pracy potwierdza się sam: dotrzymany, także dzień regeneracyjny (D108)', () => {
    const s = new Scenario({ date: DATE, dayType: 'regeneracyjny', plan: [], settings: { transitionBufferMin: 0 } })
    s.presence('07:30')
    const g = grade(s)
    expect(g.status).toBe('kept')
    expect(g.notes.boundary).toBe(3)
  })
})

describe('wykorzystana regeneracja (3 nuty)', () => {
  it('regeneracja do minimum co najmniej równa minimum typu dnia: 3 nuty', () => {
    const g = grade(good())
    expect(g.earned.regen).toBe(true)
    expect(g.notes.regen).toBe(3)
  })

  it('minimum typu dnia poniżej 30 min: nagroda się nie liczy', () => {
    const s = day([work('a', '08:00', 60)], { settings: { dayTypes: { zwykly: { minRegenMin: 20 } } } }).ran('a', '08:00', '09:00').workEnd('09:00')
    const g = grade(s)
    expect(g.earned.regen).toBe(false)
    expect(g.notes.regen).toBe(0)
    // The boundary is still kept.
    expect(g.notes.boundary).toBe(3)
  })
})

describe('reakcja na rezerwę (2 nuty)', () => {
  /** Head only, 15 an hour: from 65 at 09:00 to the reserve (15) at 12:20. */
  const heavy = (min: number): PlanBlock => ({ ...work('h', '09:00', min), costs: { head: 5, emotions: 0, senses: 0 } })
  const LATER = block({ id: 'later', cat: 'analiza', at: '20:00', min: 30, fixed: true })

  /** The head at the reserve at 12:20, then work to `restAt`, a rest of 15 min, work again to 15:00. */
  function descent(restAt: string): Scenario {
    const [h, m] = restAt.split(':').map(Number) as [number, number]
    const restEnd = `${String(h + Math.floor((m + 15) / 60)).padStart(2, '0')}:${String((m + 15) % 60).padStart(2, '0')}`
    return day([heavy(200), LATER])
      .ran('h', '09:00', '12:20')
      .ran('w', '12:20', restAt, { cat: 'analiza', min: 120 })
      .ran('r', restAt, restEnd, { cat: 'regeneracja', variant: 'drzemka', min: 15 })
      .ran('w2', restEnd, '15:00', { cat: 'analiza', min: 60 })
      .workEnd('15:00')
  }
  const seen = (s: Scenario, at: string) => s.seen(reserveMessageId(DATE, 'head', idxOf(gridOf(DATE), s.at('12:20'))), at)

  it('żadna pula nie zeszła do rezerwy, check-in przed pierwszym blokiem pracy: 2 nuty', () => {
    const g = grade(good())
    expect(g.earned.reserve).toBe(true)
    expect(g.notes.reserve).toBe(2)
  })

  it('bez check-inu albo z check-inem po pierwszym bloku pracy: bez nagrody', () => {
    expect(grade(day([work('a', '08:00', 60)], { checkin: false }).ran('a', '08:00', '09:00').workEnd('09:00')).notes.reserve).toBe(0)
    const late = day([work('a', '08:00', 60)], { checkin: false }).ran('a', '08:00', '09:00').checkin('08:30', MID).workEnd('09:00')
    expect(grade(late).notes.reserve).toBe(0)
  })

  it('odpoczynek zaczęty najpóźniej 60 min po pierwszym zobaczeniu komunikatu: nagroda; minutę później – brak', () => {
    expect(grade(seen(descent('14:00'), '13:00')).notes.reserve).toBe(2)
    expect(grade(seen(descent('14:01'), '13:00')).notes.reserve).toBe(0)
  })

  it('komunikat niezobaczony do końca dnia nagrody nie odbiera (D241)', () => {
    expect(grade(descent('14:01')).notes.reserve).toBe(2)
  })

  it('komunikat zobaczony tylko jako cicha ikona „mniej pytań” – także zejście sprzed jej włączenia (D157)', () => {
    const s = descent('14:01')
    s.raw({ k: 'fewer.start', at: s.at('12:50') }, '12:50')
    expect(grade(seen(s, '13:00')).notes.reserve).toBe(2)
  })

  it('cicha ikona w „mniej pytań”, a komunikat zobaczony dopiero po „Jest lepiej” – nadal bez utraty nagrody', () => {
    const s = descent('14:01')
    s.raw({ k: 'fewer.start', at: s.at('12:00') }, '12:00').raw({ k: 'fewer.end', at: s.at('12:45') }, '12:45')
    expect(grade(seen(s, '13:00')).notes.reserve).toBe(2)
    // „Mniej pytań” only before the descent: the message was a plain one – the late rest loses the reward.
    const t = descent('14:01')
    t.raw({ k: 'fewer.start', at: t.at('11:00') }, '11:00').raw({ k: 'fewer.end', at: t.at('12:00') }, '12:00')
    expect(grade(seen(t, '13:00')).notes.reserve).toBe(0)
  })

  it('zjazd stacjonarny: bez nagrody za rezerwę', () => {
    const s = day([work('a', '08:00', 60)], { dayType: 'zjazd-stacjonarny' }).ran('a', '08:00', '09:00').workEnd('09:00')
    const g = grade(s)
    expect(g.earned.reserve).toBe(false)
    expect(g.notes.reserve).toBe(0)
  })
})

describe('trafne szacowanie (1 nuta za blok, najwyżej 3 dziennie)', () => {
  const plan = [work('x', '08:00', 60), work('y', '10:00', 60), work('z', '12:00', 60), work('q', '14:00', 60)]

  it('realny czas w 15% długości z chwili startu, w obie strony: nuta; poza nią – nie', () => {
    const s = day(plan).ran('x', '08:00', '09:09').ran('y', '10:00', '10:51').ran('z', '12:00', '13:10').workEnd('13:10')
    const g = grade(s)
    expect(g.earned.accuracy).toEqual(['x', 'y'])
    expect(g.notes.accuracy).toBe(2)
  })

  it('tolerancja nie mniejsza niż 5 min (blok 20 min: 25 min się mieści, 26 – nie); blok krótszy niż 20 min – bez nuty', () => {
    const s = day([work('a', '08:00', 20), work('b', '09:00', 20), work('c', '10:00', 19)]).ran('a', '08:00', '08:25').ran('b', '09:00', '09:26').ran('c', '10:00', '10:19').workEnd('10:19')
    expect(grade(s).earned.accuracy).toEqual(['a'])
  })

  it('najwyżej 3 nuty dziennie', () => {
    const s = day(plan).ran('x', '08:00', '09:00').ran('y', '10:00', '11:00').ran('z', '12:00', '13:00').ran('q', '14:00', '15:00').workEnd('15:00')
    const g = grade(s)
    expect(g.earned.accuracy).toHaveLength(4)
    expect(g.notes.accuracy).toBe(3)
  })

  it('pauzy nie liczą się do realnego czasu', () => {
    const s = day([work('x', '08:00', 60)]).start('x', '08:00').pause('x', '08:30').resume('x', '09:00').end('x', '09:30').workEnd('09:30')
    expect(grade(s).earned.accuracy).toEqual(['x'])
  })

  it('blok stały, blok bez klasy pracy albo życia i opieki – bez nuty; blok życia i opieki – z nutą (D200)', () => {
    const s = day([work('f', '08:00', 60, { fixed: true }), block({ id: 'p', cat: 'projekty', at: '18:00', min: 60 }), block({ id: 's', cat: 'sprawy', variant: 'przy-komputerze', at: '10:00', min: 60 })])
    s.ran('f', '08:00', '09:00').workEnd('09:00').ran('s', '10:00', '11:00').ran('p', '18:00', '19:00')
    expect(grade(s).earned.accuracy).toEqual(['s'])
  })

  it('start albo koniec nie z kliknięcia (dopisany później, z planu), koniec automatyczny – bez nuty', () => {
    const s = day(plan)
    // Written in the ritual at 22:00 as „odbył się o planowanej porze”.
    s.write([{ k: 'block.start', block: 'x', at: s.at('08:00'), bg: false, planned: { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false }, confirmUntil: null, how: 'click' }, { k: 'block.end', block: 'x', at: s.at('09:00'), done: true, rule: null }], s.at('22:00'))
    s.start('y', '10:00').write([{ k: 'block.end', block: 'y', at: s.at('11:00'), done: true, rule: 'twoQuestions', autoRule: 'twoQuestions' }], s.at('11:00'))
    s.start('z', '12:00').write([{ k: 'block.end', block: 'z', at: s.at('13:00'), done: true, rule: null }], s.at('20:00'))
    s.workEnd('13:00')
    expect(grade(s).earned.accuracy).toEqual([])
  })

  it('„Zakończ” bloku w tle to koniec z kliknięcia; „Zakończyć w chwili odejścia” na pytanie o nieobecność – nie (D275)', () => {
    const s = day([work('x', '08:00', 60, { background: true }), work('y', '10:00', 60)]).start('x', '08:00', { bg: true })
    s.write([{ k: 'block.end', block: 'x', at: s.at('09:02'), done: true, rule: 'endNow' }], s.at('09:02'))
    s.start('y', '10:00').write([{ k: 'block.end', block: 'y', at: s.at('11:00'), done: null, rule: 'absenceAnswer' }], s.at('11:00'))
    s.workEnd('11:00')
    expect(grade(s).earned.accuracy).toEqual(['x'])
  })

  it('niedokończony – bez nuty', () => {
    const s = day([work('x', '08:00', 60)]).start('x', '08:00')
    s.write([{ k: 'block.end', block: 'x', at: s.at('09:00'), done: false, rule: null }], s.at('09:00')).workEnd('09:00')
    expect(grade(s).earned.accuracy).toEqual([])
    // Marked done in the ritual: a note.
    s.write([{ k: 'block.mark', block: 'x', at: s.at('22:00'), done: true }], s.at('22:00'))
    expect(grade(s).earned.accuracy).toEqual(['x'])
  })

  it('zaczęty na jednym komputerze, skończony na drugim – bez nuty', () => {
    const s = day([work('x', '08:00', 60)]).start('x', '08:00')
    s.write([{ k: 'block.end', block: 'x', at: s.at('09:00'), done: true, rule: null }], s.at('09:00'), 'lap')
    s.workEnd('09:00')
    expect(grade(s).earned.accuracy).toEqual([])
  })

  it('poprawka czasu bloku albo zmiana wariantem – bez nuty', () => {
    const s = day([work('x', '08:00', 60), work('y', '10:00', 60, { byVariant: true })]).ran('x', '08:00', '09:00').ran('y', '10:00', '11:00').workEnd('11:00')
    s.write([{ k: 'block.fix', block: 'x', at: s.at('22:00'), start: s.at('08:05'), end: null }], s.at('22:00'))
    expect(grade(s).earned.accuracy).toEqual([])
  })

  it('nieobecność odliczona bez Twojej odpowiedzi – bez nuty; „odlicz” (✓ w rytuale) przywraca nutę (D269, D272)', () => {
    const counted = () => {
      const s = day([work('x', '08:00', 60)]).start('x', '08:00')
      s.write([{ k: 'block.pause', block: 'x', at: s.at('08:20'), autoRule: 'absence' }, { k: 'block.resume', block: 'x', at: s.at('08:40'), confirmUntil: null, autoRule: 'absence' }], s.at('08:40'))
      return s.end('x', '09:20').workEnd('09:20')
    }
    expect(grade(counted()).earned.accuracy).toEqual([])
    const s = counted()
    s.write([{ k: 'question.answer', at: s.at('22:00'), question: questionId(DATE, 'absence', 'x', idxOf(gridOf(DATE), s.at('08:20'))), answer: 'keep' }], s.at('22:00'))
    expect(grade(s).earned.accuracy).toEqual(['x'])
  })

  it('blok „poza komputerem”: koniec z odpowiedzi po powrocie, także na innym komputerze; bez odpowiedzi – bez nuty', () => {
    const away = () => day([block({ id: 'w', cat: 'sprawy', at: '10:00', min: 60 })])
    const ended = (s: Scenario) => s.start('w', '10:00').write([{ k: 'block.end', block: 'w', at: s.at('11:05'), done: null, rule: 'firstUse', autoRule: 'firstUse' }], s.at('11:05'), 'lap')
    expect(grade(ended(away())).earned.accuracy).toEqual([])
    const s = ended(away())
    s.write([{ k: 'question.answer', at: s.at('11:06'), question: questionId(DATE, 'return', 'w', idxOf(gridOf(DATE), s.at('11:05'))), answer: 'keep' }], s.at('11:06'), 'lap')
    expect(grade(s).earned.accuracy).toEqual(['w'])
    // „Skończył się o …” after the return: an end given later counts away from the computer.
    const t = away().start('w', '10:00')
    t.write([{ k: 'block.end', block: 'w', at: t.at('11:00'), done: true, rule: null }], t.at('12:00'), 'lap')
    expect(grade(t).earned.accuracy).toEqual(['w'])
  })

  it('zjazd stacjonarny: bez nut za trafność', () => {
    const s = day([work('x', '08:00', 60)], { dayType: 'zjazd-stacjonarny' }).ran('x', '08:00', '09:00').workEnd('09:00')
    expect(grade(s).notes.accuracy).toBe(0)
  })
})

describe('wymiana zamiast dokładania (1 nuta, najwyżej raz dziennie)', () => {
  /**
   * Yielding `y` for the new `n` (yours, added at 10:00); the approval at 07:30 names the plan then (`planned`, by
   * default „a” and „y”; null – an approval written before E7, without the list).
   */
  function exchanged(o: { newMin?: number; yieldMin?: number; planned?: string[] | null; approve?: boolean } = {}): Scenario {
    const plan = [work('a', '08:00', 60), work('y', '14:00', o.yieldMin ?? 60), work('n', '15:00', o.newMin ?? 60, { origin: 'user' })]
    const s = new Scenario({ date: DATE, plan, settings: { transitionBufferMin: 0 } })
    s.presence('07:30').checkin('07:45', MID)
    const planned = o.planned === undefined ? ['a', 'y'] : o.planned
    if (o.approve !== false) s.raw({ k: 'boundary.approve', at: s.at('07:30'), boundary: s.at('17:00'), auto: false, ...(planned ? { plan: planned } : {}) }, '07:30')
    s.ran('a', '08:00', '09:00')
    s.raw({ k: 'block.exchange', at: s.at('10:00'), block: 'n', minutes: o.newMin ?? 60, yielding: [{ block: 'y', minutes: o.yieldMin ?? 60 }] }, '10:00')
    s.raw({ k: 'block.park', at: s.at('10:00'), block: 'y', rule: 'exchange' }, '10:00')
    return s.ran('n', '15:00', '16:00').workEnd('16:00')
  }

  it('pełna wymiana po zatwierdzeniu granicy: nuta', () => {
    const g = grade(exchanged())
    expect(g.earned.exchange).toBe('n')
    expect(g.notes.exchange).toBe(1)
  })

  it('niepełna wymiana, blok krótszy niż 15 min albo bez zatwierdzonej granicy – bez nuty', () => {
    expect(grade(exchanged({ yieldMin: 45 })).notes.exchange).toBe(0)
    expect(grade(exchanged({ newMin: 10, yieldMin: 10 })).notes.exchange).toBe(0)
    expect(grade(exchanged({ approve: false })).notes.exchange).toBe(0)
  })

  it('ustępujący blok spoza planu w chwili pierwszego zatwierdzenia – bez nuty; zatwierdzenie bez listy (sprzed E7) – z nutą', () => {
    expect(grade(exchanged({ planned: ['a'] })).notes.exchange).toBe(0)
    expect(grade(exchanged({ planned: null })).notes.exchange).toBe(1)
    // A later approval (another boundary) names more blocks: the first one decides.
    const s = exchanged({ planned: ['a'] })
    s.raw({ k: 'boundary.approve', at: s.at('09:30'), boundary: s.at('17:30'), auto: false, plan: ['a', 'y'] }, '09:30')
    expect(grade(s).notes.exchange).toBe(0)
  })

  it('cofnięcie wcześniejszej wymiany nie daje nuty; najwyżej jedna nuta dziennie', () => {
    const s = new Scenario({ date: DATE, plan: [work('a', '08:00', 60), work('y', '14:00', 60), work('z', '16:00', 60)], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').approve('17:00', '07:30').ran('a', '08:00', '09:00')
    // An exchange that gives no note (partial), then its undo: „y” comes back, „n” (added by it) gives way.
    s.raw({ k: 'block.exchange', at: s.at('10:00'), block: 'n', minutes: 60, yielding: [{ block: 'y', minutes: 30 }] }, '10:00')
    s.raw({ k: 'block.exchange', at: s.at('11:00'), block: 'y', minutes: 60, yielding: [{ block: 'n', minutes: 60 }] }, '11:00')
    expect(grade(s.workEnd('12:00')).earned.exchange).toBeNull()
    const two = exchanged()
    two.raw({ k: 'block.exchange', at: two.at('17:30'), block: 'm', minutes: 30, yielding: [{ block: 'a', minutes: 60 }] }, '17:30')
    expect(grade(two).notes.exchange).toBe(1)
  })

  it('zjazd stacjonarny: bez nuty za wymianę', () => {
    const s = exchanged()
    const z = new Scenario({ date: DATE, dayType: 'zjazd-stacjonarny', plan: s.opts.plan, settings: { transitionBufferMin: 0 } })
    for (const e of s.events) z.events.push(e)
    expect(grade(z).notes.exchange).toBe(0)
  })
})

describe('zjazd stacjonarny', () => {
  it('liczą się tylko granica i regeneracja', () => {
    const s = day([work('x', '08:00', 60)], { dayType: 'zjazd-stacjonarny' }).ran('x', '08:00', '09:00').workEnd('09:00')
    const g = grade(s)
    expect(g.status).toBe('kept')
    expect(g.notes).toEqual({ boundary: 3, regen: 3, reserve: 0, accuracy: 0, exchange: 0 })
  })
})

describe('poza grą', () => {
  it('dzień typu „wolne”, dzień sprzed pierwszego dnia z grą (przed wydaniem i dzień instalacji), dzień kreatora: poza grą, bez nut', () => {
    const free = new Scenario({ date: DATE, dayType: 'wolne', plan: [], settings: { transitionBufferMin: 0 } })
    free.presence('09:00')
    expect(grade(free)).toMatchObject({ status: 'out', out: 'free' })
    expect(grade(good(), { from: '2026-10-29' })).toMatchObject({ status: 'out', out: 'beforeGame' })
    expect(grade(good(), { from: null })).toMatchObject({ status: 'out', out: 'beforeGame' })
    const wizard = grade(good(), { wizardDay: DATE })
    expect(wizard).toMatchObject({ status: 'out', out: 'wizard' })
    expect(notesSum(wizard.notes)).toBe(0)
    // What it earned stays in the grade (the „Strona B tygodnia” measures it).
    expect(wizard.earned.boundary).toBe(true)
  })

  it('gra wyłączona przed pierwszym blokiem pracy – poza grą; po jego starcie – dzień liczy się zwykle (D160)', () => {
    const before = good()
    before.raw({ k: 'module.set', at: before.at('07:40'), module: 'game', on: false, was: true }, '07:40')
    expect(grade(before)).toMatchObject({ status: 'out', out: 'gameOff' })
    const after = good()
    after.raw({ k: 'module.set', at: after.at('08:30'), module: 'game', on: false, was: true }, '08:30')
    expect(grade(after)).toMatchObject({ status: 'kept', out: null })
    expect(notesSum(grade(after).notes)).toBeGreaterThan(0)
  })

  it('w dniu bez pracy: wyłączona przed pobudką – poza grą, po pobudce – zwykły dzień (D170)', () => {
    const noWork = (at: string) => {
      const s = new Scenario({ date: DATE, dayType: 'regeneracyjny', plan: [], settings: { transitionBufferMin: 0 } })
      s.presence('07:30')
      return s.raw({ k: 'module.set', at: s.at(at), module: 'game', on: false, was: true }, at)
    }
    expect(grade(noWork('05:00')).status).toBe('out')
    expect(grade(noWork('10:00')).status).toBe('kept')
  })

  it('dzień bez pracy w chwili wyłączenia liczy się tak, choć potem dodasz i zaczniesz blok pracy', () => {
    const s = new Scenario({ date: DATE, plan: [], settings: { transitionBufferMin: 0 } })
    s.presence('07:30').raw({ k: 'module.set', at: s.at('10:00'), module: 'game', on: false, was: true }, '10:00')
    s.ran('x', '14:00', '15:00', { cat: 'inne', min: 60 }).workEnd('15:00')
    expect(grade(s).out).toBeNull()
    // Work planned at the switch-off (and none begun yet): outside the game.
    const w = day([work('a', '14:00', 60)])
    w.raw({ k: 'module.set', at: w.at('10:00'), module: 'game', on: false, was: true }, '10:00').ran('a', '14:00', '15:00').workEnd('15:00')
    expect(grade(w)).toMatchObject({ status: 'out', out: 'gameOff' })
  })

  it('gra wyłączona cały dzień albo włączona ponownie tego dnia – poza grą; wyłączona i włączona tego samego dnia – zwykły dzień (D176)', () => {
    expect(grade(good(), { gameOn: false })).toMatchObject({ status: 'out', out: 'gameOff' })
    const on = good()
    on.raw({ k: 'module.set', at: on.at('12:00'), module: 'game', on: true, was: false }, '12:00')
    expect(grade(on)).toMatchObject({ status: 'out', out: 'gameOn' })
    const both = good()
    both.raw({ k: 'module.set', at: both.at('07:40'), module: 'game', on: false, was: true }, '07:40').raw({ k: 'module.set', at: both.at('12:00'), module: 'game', on: true, was: false }, '12:00')
    expect(grade(both)).toMatchObject({ status: 'kept', out: null })
  })

  it('dzień bez obecności, bez odpowiedzi, jest wolny – poza grą', () => {
    const s = new Scenario({ date: DATE, plan: [work('a', '08:00', 60)], settings: { transitionBufferMin: 0 } })
    expect(grade(s)).toMatchObject({ status: 'out', out: 'free' })
  })
})

describe('ocena z wersją reguł', () => {
  it('ocena zapisuje numer reguł gry, to, co dzień zdobył, i nuty', () => {
    const g = grade(good())
    expect(g.v).toBe(GAME_RULES.version)
    expect(g.notes).toEqual({ boundary: 3, regen: 3, reserve: 2, accuracy: 1, exchange: 0 })
  })

  it('zapisana ocena: status i nuty takie, jak policzono; nieznane nuty nowszych reguł też; bez gry – poza grą', () => {
    expect(storedGame({ game: { status: 'kept', notes: { boundary: 3, regen: 3, future: 4 } } })).toEqual({ status: 'kept', notes: 10 })
    expect(storedGame({ boundary: 'kept' })).toEqual({ status: 'out', notes: 0 })
    expect(storedGame({ game: { status: 'weird', notes: { boundary: 3 } } })).toEqual({ status: 'out', notes: 0 })
  })
})

describe('passa', () => {
  const days = (list: Array<[string, GameDay['status']]>, frozen = true): GameDay[] => list.map(([date, status]) => ({ date, status, notes: status === 'kept' ? 6 : 0, frozen }))

  it('kolejne dotrzymane dni wydłużają passę; dzień poza grą jej nie przerywa ani nie wydłuża', () => {
    const s = gameSummary(days([['2026-10-26', 'kept'], ['2026-10-27', 'out'], ['2026-10-28', 'kept']]), '2026-10-29')
    expect(s.streak).toBe(2)
    expect(s.steps.map((x) => x.move)).toEqual(['up', 'skip', 'up'])
  })

  it('dzień bez danych trzyma passę najwyżej 2 razy w tygodniu; kolejny liczy się jak niedotrzymany i zastępuje go dzień ochronny', () => {
    const s = gameSummary(days([['2026-10-26', 'kept'], ['2026-10-27', 'noData'], ['2026-10-28', 'noData'], ['2026-10-29', 'noData'], ['2026-10-30', 'kept']]), '2026-10-31')
    expect(s.steps.map((x) => x.move)).toEqual(['up', 'held', 'held', 'protected', 'up'])
    expect(s.streak).toBe(2)
    // The week's days without data that held the streak: at most the limit.
    expect(s.week).toEqual({ noData: 2, protection: true })
  })

  it('dzień ochronny zastępuje pierwszy niedotrzymany dzień tygodnia; drugi przerywa passę', () => {
    const s = gameSummary(days([['2026-10-26', 'kept'], ['2026-10-27', 'broken'], ['2026-10-28', 'kept'], ['2026-10-29', 'broken'], ['2026-10-30', 'kept']]), '2026-10-31')
    expect(s.steps.map((x) => [x.move, x.streak])).toEqual([
      ['up', 1],
      ['protected', 1],
      ['up', 2],
      ['broken', 0],
      ['up', 1]
    ])
  })

  it('niewykorzystany dzień ochronny nie przechodzi dalej; limit dni bez danych liczy się od poniedziałku', () => {
    const s = gameSummary(
      days([
        ['2026-10-30', 'noData'],
        ['2026-10-31', 'noData'],
        ['2026-11-01', 'kept'],
        // Monday: a new week – two days without data again, one protection day.
        ['2026-11-02', 'noData'],
        ['2026-11-03', 'noData'],
        ['2026-11-04', 'broken'],
        ['2026-11-05', 'broken']
      ]),
      '2026-11-06'
    )
    expect(s.steps.map((x) => x.move)).toEqual(['held', 'held', 'up', 'held', 'held', 'protected', 'broken'])
  })

  it('kolejność dat, nie kolejność listy; dzień jeszcze trwający nie liczy się do passy, jego nuty są „w toku”', () => {
    const list: GameDay[] = [
      { date: '2026-10-28', status: null, notes: 4, frozen: false },
      { date: '2026-10-27', status: 'kept', notes: 7, frozen: false },
      { date: '2026-10-26', status: 'kept', notes: 9, frozen: true }
    ]
    const s = gameSummary(list, '2026-10-28')
    expect(s.streak).toBe(2)
    expect(s.notes).toEqual({ final: 9, pending: 11 })
  })
})
