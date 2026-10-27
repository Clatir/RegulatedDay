/**
 * The states of a day and its freeze (spec „Ocena dnia”): the stage, the window of corrections, whose records the leader
 * waits for, the freeze after 72 h without waiting, the grade counted up to the events the freeze names, and which of
 * two freezes counts.
 */
import { describe, expect, it } from 'vitest'
import { correctionEnd, dayStage, freezeDecision, gradeOf, lastEventsOf, openedAtOf, outsideGrade, type FreezeComputer } from '@shared/engine/freeze'
import { foldFacts } from '@shared/engine/facts'
import { gridOf } from '@shared/engine/grid'
import type { Presence } from '@shared/sync/presence'
import { dayEnd, dayStart } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const H = 3_600_000
/** The day in the game, both modules on. */
const GAME = { from: '2026-10-01', wizardDay: null, gameOn: true, energyOn: true }
const END = dayEnd(DATE)

const presence = (o: Partial<Presence>): Presence => ({
  format: 1,
  computer: 'lap',
  name: 'Laptop',
  windowsId: null,
  appVersion: '0.7.0',
  rulesVersion: 1,
  versions: [],
  installing: null,
  lastPresence: dayStart(DATE) + 10 * H,
  lastUse: dayStart(DATE) + 10 * H,
  lastOutsideInput: null,
  state: 'idle',
  locked: false,
  power: null,
  seenLeader: 'pca',
  settled: true,
  lastEvents: {},
  writtenAt: END + H,
  ...o
})

describe('etap dnia i okno korekty', () => {
  it('otwarty do końca dnia, potem wstępnie oceniony (także po zamknięciu wcześniej), zamrożony po zamrożeniu', () => {
    expect(dayStage(DATE, { closed: null, frozen: null }, END - 1)).toBe('open')
    expect(dayStage(DATE, { closed: { at: 0, how: 'ritual' }, frozen: null }, END - 1)).toBe('graded')
    expect(dayStage(DATE, { closed: null, frozen: null }, END)).toBe('graded')
    expect(dayStage(DATE, { closed: null, frozen: { id: 'f', c: 'pca', v: 1, l: 0, at: 0, how: 'ready', know: {}, missing: [], grade: {} } }, END)).toBe('frozen')
  })

  it('24 h od otwarcia dnia po jego końcu, najwyżej 72 h od końca dnia', () => {
    expect(correctionEnd(DATE, END + 4 * H)).toBe(END + 28 * H)
    expect(correctionEnd(DATE, null)).toBe(END + 72 * H)
    expect(correctionEnd(DATE, END + 60 * H)).toBe(END + 72 * H)
    const next = [{ id: 'x', c: 'lap', n: 0, t: 0, l: 0, v: 1, day: '2026-10-29', dom: 'meta', k: 'presence.first', at: END + 5 * H }, { id: 'y', c: 'pca', n: 0, t: 0, l: 0, v: 1, day: '2026-10-29', dom: 'meta', k: 'presence.first', at: END + 3 * H }] as never
    expect(openedAtOf(next)).toBe(END + 3 * H)
  })
})

describe('kiedy prowadzący zamraża', () => {
  const self: FreezeComputer = { id: 'pca', self: true, presence: null, visibleLast: 40 }
  const base = { date: DATE, now: END + 30 * H, mayFreeze: true, openedAt: END + 4 * H, filesQuiet: true }

  it('nie prowadzący (albo nieustalony, ze starszymi regułami) nie zamraża; w oknie korekty nikt', () => {
    expect(freezeDecision({ ...base, mayFreeze: false, computers: [self] })).toMatchObject({ freeze: false })
    expect(freezeDecision({ ...base, now: END + 20 * H, computers: [self] })).toMatchObject({ freeze: false, why: 'trwa okno korekty' })
    expect(freezeDecision({ ...base, computers: [self] })).toEqual({ freeze: true, how: 'ready', missing: [] })
  })

  it('czeka na komputer, którego obecność jest sprzed końca dnia albo którego ostatnie zdarzenie jeszcze nie dotarło', () => {
    const old = { id: 'lap', self: false, presence: presence({ writtenAt: END - H }), visibleLast: 5 }
    expect(freezeDecision({ ...base, computers: [self, old] })).toMatchObject({ freeze: false, why: 'czeka na zapisy: lap' })
    const behind = { id: 'lap', self: false, presence: presence({ lastEvents: { [DATE]: 9 } }), visibleLast: 5 }
    expect(freezeDecision({ ...base, computers: [self, behind] })).toMatchObject({ freeze: false })
    // Its presence after the day's end and its last event visible: ready. A clean close counts too.
    expect(freezeDecision({ ...base, computers: [self, { ...behind, visibleLast: 9 }] })).toMatchObject({ freeze: true, how: 'ready' })
    expect(freezeDecision({ ...base, computers: [self, { ...old, presence: presence({ writtenAt: END - H, state: 'closed' }) }] })).toMatchObject({ freeze: true })
  })

  it('komputer widziany ostatnio przed początkiem dnia czeka najwyżej 24 h po końcu dnia', () => {
    const stale = { id: 'lap', self: false, presence: presence({ lastPresence: dayStart(DATE) - 5 * H, lastUse: dayStart(DATE) - 5 * H, writtenAt: dayStart(DATE) - 5 * H }), visibleLast: -1 }
    expect(freezeDecision({ ...base, openedAt: END, now: END + 23 * H, computers: [self, stale] })).toMatchObject({ freeze: false })
    expect(freezeDecision({ ...base, openedAt: END, now: END + 24 * H, computers: [self, stale] })).toMatchObject({ freeze: true, how: 'ready' })
  })

  it('pliki dnia jeszcze się zmieniają – czeka; po 72 h zamraża bez czekania i mówi, czyich zapisów brakowało', () => {
    expect(freezeDecision({ ...base, filesQuiet: false, computers: [self] })).toMatchObject({ freeze: false })
    const missing = { id: 'lap', self: false, presence: null, visibleLast: 3 }
    expect(freezeDecision({ ...base, now: END + 72 * H, computers: [self, missing] })).toEqual({ freeze: true, how: 'timeout', missing: ['lap'] })
  })
})

describe('ocena przy zamrożeniu', () => {
  function day(o: { presence?: boolean; dayType?: 'zwykly' | 'zjazd-stacjonarny' } = {}) {
    const s = new Scenario({ date: DATE, dayType: o.dayType, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] })
    if (o.presence !== false) s.presence('07:30')
    s.approve('09:15', '07:30')
    s.ran('a', '08:00', '09:00')
    return s
  }
  const at = END + 30 * H
  const ctx = (s: Scenario) => ({ ...s.contextAt(at), now: at })

  it('jak zapisano: bez potwierdzonego końca pracy granica bez danych; zamknięcie „Jak zapisano” – dotrzymana', () => {
    const s = day()
    expect(gradeOf(ctx(s), lastEventsOf(s.events), GAME)).toMatchObject({ boundary: 'noData', endConfirmed: false, free: false, closed: null })
    s.write([{ k: 'work.end', at: s.at('22:00'), end: s.at('09:00') }, { k: 'ritual.close', at: s.at('22:00'), how: 'asWritten' }], s.at('22:00'))
    expect(gradeOf(ctx(s), lastEventsOf(s.events), GAME)).toMatchObject({ boundary: 'kept', endConfirmed: true, closed: 'asWritten' })
  })

  it('ocena liczy tylko zdarzenia, które zamrożenie zna; późniejsze są „poza oceną”', () => {
    const s = day()
    const know = lastEventsOf(s.events)
    s.workEnd('22:00', '09:00')
    expect(gradeOf(ctx(s), know, GAME).boundary).toBe('noData')
    expect(outsideGrade(s.events, know).map((e) => e.k)).toEqual(['work.end'])
  })

  it('dzień bez obecności, bez odpowiedzi, jest wolny – poza zjazdem stacjonarnym', () => {
    const s = day({ presence: false })
    expect(gradeOf(ctx(s), lastEventsOf(s.events), GAME).free).toBe(true)
    expect(gradeOf(ctx(day({ presence: false, dayType: 'zjazd-stacjonarny' })), lastEventsOf(day({ presence: false, dayType: 'zjazd-stacjonarny' }).events), GAME).free).toBe(false)
    // Answered („Nie pamiętam”): not free.
    s.write([{ k: 'ritual.close', at: s.at('22:00'), how: 'unknown' }], s.at('22:00'))
    expect(gradeOf(ctx(s), lastEventsOf(s.events), GAME).free).toBe(false)
  })

  it('z dwóch zamrożeń liczy się to według nowszych reguł, przy tych samych – to, które zna więcej zdarzeń; remis – niższy identyfikator komputera', () => {
    const f = (id: string, c: string, v: number, l: number, know: Record<string, number>) => ({ id, c, n: 100, t: l, l, v, day: DATE, dom: 'timer', k: 'day.freeze', at: END + 30 * H, how: 'ready', know, missing: [], grade: { boundary: 'kept' } })
    const g = gridOf(DATE)
    expect(foldFacts(g, [f('a', 'pca', 1, 1, { pca: 10, lap: 5 }), f('b', 'lap', 1, 2, { pca: 10, lap: 8 })] as never).frozen?.id).toBe('b')
    expect(foldFacts(g, [f('a', 'pca', 2, 1, { pca: 10 }), f('b', 'lap', 1, 2, { pca: 10, lap: 8 })] as never).frozen?.id).toBe('a')
    // A tie: the lower computer id, whatever the order – the files of grades choose the same (`betterFreeze`).
    expect(foldFacts(g, [f('a', 'pca', 1, 1, { pca: 10 }), f('b', 'lap', 1, 2, { pca: 10 })] as never).frozen?.id).toBe('b')
    expect(foldFacts(g, [f('b', 'lap', 1, 1, { pca: 10 }), f('a', 'pca', 1, 2, { pca: 10 })] as never).frozen?.id).toBe('b')
  })
})
