/**
 * The closing ritual (spec „Rytuał zamknięcia”, D246, D249, D254, D272): its rows from the day, answers as events, the
 * effect of a ✓ (the outcome as frozen), closing the day (untouched rows as written), the days the morning shows.
 */
import { describe, expect, it } from 'vitest'
import { closeEffect, closeEvents, feltRows, ritualActivity, ritualAnswer, ritualDue, ritualEffect, ritualRows, unclosedDays, type RitualRow } from '@shared/engine/ritual'
import { activityOf } from '@shared/engine/activity'
import { answerEvents, questionsOf } from '@shared/engine/auto'
import { dayOutcome } from '@shared/engine/outcome'
import { requestAction } from '@shared/engine/requests'
import { timerAction, timerNow, workEndOpen, type TimerAction } from '@shared/engine/timer'
import { engineView } from '@shared/engineView'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function silentEnd(s: Scenario, id: string, at: string, rule: string, written = at): Scenario {
  return s.write([{ id: `auto-${id}-${rule}`, k: 'block.end', block: id, at: s.at(at), done: null, rule, autoRule: rule }], s.at(written))
}

/** The use of the computers at t as the engine reads it (what the rows measure a skipped session by). */
const useAt = (s: Scenario, t: number) => ritualActivity(s.contextAt(t), s.stateAt(t))
/** The day's rows at a time. */
const rowsAt = (s: Scenario, time: string) => ritualRows(s.state(time), useAt(s, s.at(time)))

/** A row's answer written at `time` (asserting it is a choice of the row). */
function answer(s: Scenario, time: string, kind: RitualRow['kind'], choice: string, value: Parameters<typeof ritualAnswer>[4] = null, item: string | null = null) {
  const t = s.at(time)
  const st = s.stateAt(t)
  const row = ritualRows(st, useAt(s, t)).find((r) => r.kind === kind)!
  const drafts = ritualAnswer(st, row, choice, t, value, item)
  expect(drafts).not.toBeNull()
  s.write(drafts!, t)
  return drafts!
}

const row = <K extends RitualRow['kind']>(s: Scenario, time: string, kind: K) => rowsAt(s, time).find((r) => r.kind === kind) as Extract<RitualRow, { kind: K }> | undefined

describe('wiersze rytuału', () => {
  // Work 08:00–09:00 ended after two asks; you used the computer to 10:30. A project 19:00–20:00 ended the same way,
  // used to 20:40.
  function day() {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'p', cat: 'projekty', at: '19:00', min: 60 })] }).using('07:00', '23:59')
    s.approve('09:15', '07:30')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    s.gap('10:30', '11:15')
    s.start('p', '19:00')
    silentEnd(s, 'p', '20:00', 'twoQuestions', '21:00')
    s.gap('20:40', '21:30')
    return s
  }

  it('koniec pracy, wiersz zbiorczy z czasem do wyjaśnienia, odpoczynek po końcu pracy', () => {
    const s = day()
    const rows = rowsAt(s, '21:40')
    expect(rows.map((r) => r.kind)).toEqual(['workEnd', 'silent', 'rest'])
    const st = s.state('21:40')
    const end = rows[0] as Extract<RitualRow, { kind: 'workEnd' }>
    expect([hhmm(st, end.end), end.confirmed, end.explain?.block]).toEqual(['09:00', false, 'a'])
    const silent = rows[1] as Extract<RitualRow, { kind: 'silent' }>
    expect(silent.items.map((x) => x.block)).toEqual(['a', 'p'])
    expect([silent.explainMin, silent.answered]).toEqual([90 + 40, false])
  })

  it('✓ wiersza zbiorczego: po pracy „odpoczynek”, po projekcie „projekt” (D249, D254); skutek – projekty', () => {
    const s = day()
    const t = s.at('21:40')
    const st = s.stateAt(t)
    const silent = ritualRows(st, useAt(s, t)).find((r) => r.kind === 'silent')!
    const effect = ritualEffect(s.contextAt(t), st, silent, t)!
    expect(effect.changes).toContainEqual({ kind: 'projects', deltaMin: 40, limitMin: 240 })
    answer(s, '21:40', 'silent', 'ok')
    const after = s.state('21:45')
    expect(after.explains.map((x) => [x.block, x.answer?.cls])).toEqual([
      ['a', 'rest'],
      ['p', 'project']
    ])
    expect(row(s, '21:45', 'silent')!.answered).toBe(true)
  })

  it('„Pracowałem do …” w wierszu końca pracy: praca do tej chwili i potwierdzony koniec', () => {
    const s = day()
    answer(s, '21:40', 'workEnd', 'workedUntil', s.at('10:00'))
    const st = s.state('21:45')
    expect(hhmm(st, st.workEnd)).toBe('10:00')
    expect(row(s, '21:45', 'workEnd')!.confirmed).toBe(true)
    // 09:15–10:00 after the boundary: the day is not kept.
    expect(dayOutcome(st).boundary).toBe('broken')
  })

  it('poprawka końca bloku w wierszu zbiorczym: automatyczny koniec cofnięty, Twój zapisany – bez czasu do wyjaśnienia', () => {
    const s = day()
    const drafts = answer(s, '21:40', 'silent', 'endedAt', s.at('08:50'), 'a')
    expect(drafts.map((d) => d.k)).toEqual(['undo', 'block.end'])
    const st = s.state('21:45')
    expect(hhmm(st, st.facts.blocks.get('a')!.endedAt)).toBe('08:50')
    expect(st.explains.map((x) => x.block)).toEqual(['p'])
  })

  it('zamknięcie rytuału: potwierdza koniec pracy, nieruszony wiersz zbiorczy jak „✓”', () => {
    const s = day()
    const t = s.at('21:40')
    s.write(closeEvents(s.stateAt(t), 'ritual', t), t)
    const st = s.state('21:45')
    expect(st.facts.closed).toMatchObject({ how: 'ritual' })
    expect(st.ends.at(-1)!.confirmed).toBe(true)
    expect(st.explains.map((x) => [x.block, x.answer?.cls])).toEqual([
      ['a', 'rest'],
      ['p', 'project']
    ])
  })

  it('zamknięcie rytuału kończy zapauzowany blok pracy (niezrobiony, z „Cofnij”) – także przy potwierdzonym już końcu (G1)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 })] }).using('07:00', '23:59')
    s.approve('15:00', '07:30')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    s.start('b', '13:00').pause('b', '13:20')
    const t = s.at('17:00')
    const drafts = closeEvents(s.stateAt(t), 'ritual', t)
    expect(drafts.map((d) => `${d.k} ${(d.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end b', 'ritual.close'])
    expect(drafts[1]).toMatchObject({ done: false, rule: 'workEnd', autoRule: 'workEnd' })
    s.write(drafts, t)
    const st = s.state('17:05')
    const b = st.facts.blocks.get('b')!
    expect(hhmm(st, b.endedAt)).toBe('13:20')
    expect(b.done).toBe(false)
    expect(timerNow(st).paused).toEqual([])
    // On the list „zrobione automatycznie” with „Cofnij”, as after „Tak” on „Koniec pracy?”.
    const t2 = s.at('17:05')
    const ctx = s.contextAt(t2)
    const v = engineView({ ctx, state: st, energy: null, activity: activityOf(ctx.events, st.grid.start, t2, 'pca'), now: t2, name: () => 'Inne obowiązki', care: { waterOn: false, waterEveryMin: 45, breakAfterMin: 0, solitudeAfterMin: 0 }, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(v.autos.items).toContainEqual(expect.objectContaining({ text: 'Inne obowiązki zaparkowany („Koniec pracy”)', undo: true }))
    // The end already confirmed (the paused block after it, as E8a.2): only the paused block ends.
    const c = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    c.start('a', '08:00').pause('a', '08:30')
    c.workEnd('08:40', '08:30')
    const ct = c.at('17:00')
    expect(closeEvents(c.stateAt(ct), 'ritual', ct).map((d) => d.k)).toEqual(['block.end', 'ritual.close'])
  })

  for (const how of ['ritual', 'asWritten'] as const) {
    it(`zamknięcie (${how}) przy pauzie krótszej niż 15 min potwierdza koniec tej pracy; „Koniec pracy” ani „Koniec pracy?” nie wracają`, () => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 300 })] }).using('07:00', '23:59')
      s.approve('19:00', '07:30')
      s.ran('a', '08:00', '09:00').workEnd('09:00')
      s.start('b', '13:00').pause('b', '16:55')
      const t = s.at('17:00')
      const drafts = closeEvents(s.stateAt(t), how, t)
      expect(drafts.find((d) => d.k === 'work.end')).toMatchObject({ end: s.at('16:55') })
      s.write(drafts, t)
      const ends = (time: string) => s.state(time).ends.map((e) => `${hhmm(s.state(time), e.at)}${e.confirmed ? '+' : '?'}`)
      expect(ends('17:05')).toEqual(['09:00+', '16:55+'])
      for (const time of ['17:05', '17:20']) {
        const st = s.state(time)
        expect(workEndOpen(st)).toBe(false)
        const ctx = s.contextAt(s.at(time))
        expect(questionsOf({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, s.at(time), 'pca'), now: s.at(time) }).some((q) => q.kind === 'workEnd')).toBe(false)
      }
    })
  }

  it('koniec potwierdzony przez „Odcinam się”: zamknięcie nie dopisuje drugiego „Koniec pracy”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 300 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    s.start('b', '13:00').pause('b', '16:55').disconnect('16:55', null)
    const t = s.at('22:00')
    const before = s.stateAt(t)
    expect(before.ends.at(-1)).toMatchObject({ confirmed: true })
    expect(closeEvents(before, 'ritual', t).map((d) => d.k)).toEqual(['block.end', 'ritual.close'])
  })

  it('w czasie prośby, która przerwała pracę, zamknięcie nie dopisuje „Koniec pracy” i nie kończy przerwanego bloku (T503)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 120 })] }).using('07:00', '23:59')
    s.start('a', '16:00')
    const t0 = s.at('17:00')
    const r = requestAction(s.stateAt(t0), { a: 'requestNow', request: 'r1', person: null }, t0)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t0)
    const t = s.at('17:30')
    expect(closeEvents(s.stateAt(t), 'ritual', t).map((d) => d.k)).toEqual(['ritual.close'])
  })

  it('w czasie prośby, po której blok pracy wróci, zamknięcie nie dopisuje „Koniec pracy” także z wiersza (wcześniejszy niepotwierdzony koniec)', () => {
    // b planned at 13:00, begun at 14:00 – more than 15 min late, so 09:00 is a valid (unconfirmed) end.
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 120 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.start('b', '14:00')
    const t0 = s.at('15:00')
    const r = requestAction(s.stateAt(t0), { a: 'requestNow', request: 'r1', person: null }, t0)
    if (!r.ok) throw new Error(r.why)
    s.write(r.events, t0)
    const t = s.at('15:30')
    const st = s.stateAt(t)
    expect(st.ends.map((e) => `${hhmm(st, e.at)}${e.confirmed ? '+' : '?'}`)).toEqual(['09:00?'])
    expect(closeEvents(st, 'ritual', t).map((d) => d.k)).toEqual(['ritual.close'])
    // The row waits as while work runs – its ✓ would write the end the close leaves (G1).
    expect(ritualRows(st, useAt(s, t)).some((x) => x.kind === 'workEnd')).toBe(false)
  })

  it('pominięta sesja (okno minęło) to nie stały blok, który zostaje: zamknięcie, „Koniec pracy” i „Tak” kończą zapauzowaną pracę', () => {
    const day = () => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true })] }).using('07:00', '23:59')
      s.start('a', '09:00').pause('a', '09:30')
      return s
    }
    const t = (s: Scenario) => s.at('21:00')
    const close = day()
    expect(closeEvents(close.stateAt(t(close)), 'ritual', t(close)).map((d) => `${d.k} ${(d.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end a', 'ritual.close'])
    const click = day()
    const r = timerAction(click.contextAt(t(click)), click.stateAt(t(click)), { a: 'workEnd' }, t(click))
    expect(r.ok && r.events.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end a'])
    const yes = day()
    const st = yes.stateAt(t(yes))
    const ctx = yes.contextAt(t(yes))
    const q = questionsOf({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, t(yes), 'pca'), now: t(yes) }).find((x) => x.kind === 'workEnd')!
    expect(answerEvents(st, q, 'yes', t(yes))!.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end a', 'question.answer'])
  })

  it('pominięta sesja za blokiem wciąż „due” w planie: silnik nie robi z niej stałego bloku, który zostaje – zamknięcie potwierdza koniec', () => {
    // b (21:30) still due keeps the stretch open; ny, skipped, comes after it in the plan.
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '21:30', min: 30 }), block({ id: 'ny', cat: 'sesja', at: '15:30', min: 60, fixed: true })] }).using('07:00', '23:59')
    s.ran('a', '09:00', '10:00')
    const t = s.at('21:00')
    const drafts = closeEvents(s.stateAt(t), 'ritual', t)
    expect(drafts.find((d) => d.k === 'work.end')).toMatchObject({ end: s.at('10:00') })
    s.write(drafts, t)
    expect(s.state('21:05').ends.at(-1)).toMatchObject({ confirmed: true })
  })

  it('wiersz „Koniec pracy o …” pokazuje i jego ✓ potwierdza tę godzinę, którą potwierdzi zamknięcie', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 300 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.start('b', '14:00').pause('b', '16:55')
    const t = s.at('17:00')
    const st = s.stateAt(t)
    const workRow = ritualRows(st, useAt(s, t)).find((x) => x.kind === 'workEnd') as Extract<RitualRow, { kind: 'workEnd' }>
    expect(hhmm(st, workRow.end)).toBe('16:55')
    expect(closeEvents(st, 'ritual', t).find((d) => d.k === 'work.end')).toMatchObject({ end: s.at('16:55') })
    expect(ritualAnswer(st, workRow, 'ok', t)).toEqual([{ k: 'work.end', at: t, end: s.at('16:55') }])
  })

  it('przy biegnącej pracy zamknięcie nie kończy zapauzowanych bloków', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 })] }).using('07:00', '23:59')
    s.start('a', '09:00').pause('a', '09:30').start('b', '10:00')
    const t = s.at('10:30')
    expect(closeEvents(s.stateAt(t), 'ritual', t).map((d) => d.k)).toEqual(['ritual.close'])
  })

  it('przy stałym bloku pracy przed drugą zmianą (D216) zamknięcie robi to, co „Koniec pracy”: nic nie kończy i nie potwierdza', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'f', cat: 'inne', at: '15:30', min: 60, fixed: true })] }).using('07:00', '23:59')
    s.start('a', '09:00').pause('a', '09:30')
    const t = s.at('12:00')
    expect(closeEvents(s.stateAt(t), 'ritual', t).map((d) => d.k)).toEqual(['ritual.close'])
  })

  it('przy biegnącym bloku liczonym jak projekt zamknięcie nie dopisuje „Koniec pracy” (jak wiersz końca pracy)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '15:00', min: 120 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    s.ran('b', '13:00', '14:00').start('n', '15:00')
    const t = s.at('16:00')
    const st = s.stateAt(t)
    expect(st.asProject).toContain('n')
    expect(closeEvents(st, 'ritual', t).map((d) => d.k)).toEqual(['ritual.close'])
  })

  const askedAt = (s: Scenario, time: string) => {
    const st = s.state(time)
    const ctx = s.contextAt(s.at(time))
    return questionsOf({ ctx, state: st, activity: activityOf(ctx.events, st.grid.start, s.at(time), 'pca'), now: s.at(time) }).some((q) => q.kind === 'workEnd')
  }

  it('po zamknięciu dnia przycisk i „Koniec pracy?” znikają tylko z końcem, który zamknięcie przyjęło; „Nie pamiętam” niczego nie przyjmuje', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    expect(workEndOpen(s.state('16:55'))).toBe(true)
    const t = s.at('17:00')
    s.write(closeEvents(s.stateAt(t), 'unknown', t), t)
    expect(s.state('17:05').ends.at(-1)?.confirmed).toBe(false)
    expect(workEndOpen(s.state('17:05'))).toBe(true)
    // The ritual's close confirms it: nothing comes back.
    const r = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    r.ran('a', '08:00', '09:00')
    r.write(closeEvents(r.stateAt(t), 'ritual', t), t)
    expect(workEndOpen(r.state('17:05'))).toBe(false)
    expect(askedAt(r, '17:05')).toBe(false)
    // A block outside the plan begun after the close: its end counts as before.
    r.ran('b', '18:00', '18:30', { cat: 'inne', min: 30 })
    expect(workEndOpen(r.state('18:35'))).toBe(true)
    // Ended at its planned end („Dalej”): asked 15 min later (T261).
    expect(askedAt(r, '18:50')).toBe(true)
  })

  it('zamknięcie w czasie prośby nic nie przyjęło: po jej końcu i „Zaparkuj” pytanie i przycisk wracają', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 120 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.start('b', '14:00')
    const t0 = s.at('15:00')
    const req = requestAction(s.stateAt(t0), { a: 'requestNow', request: 'r1', person: null }, t0)
    if (!req.ok) throw new Error(req.why)
    s.write(req.events, t0)
    const t = s.at('15:30')
    s.write(closeEvents(s.stateAt(t), 'ritual', t), t)
    // The request ends without resuming b; b is parked.
    s.raw({ k: 'request.end', request: 'r1', at: s.at('15:40') }, '15:40')
    const park = timerAction(s.contextAt(s.at('15:45')), s.stateAt(s.at('15:45')), { a: 'park', block: 'b' }, s.at('15:45'))
    if (park.ok) s.write(park.events, s.at('15:45'))
    const st = s.state('16:30')
    expect(st.ends.map((e) => `${hhmm(st, e.at)}${e.confirmed ? '+' : '?'}`)).toEqual(['09:00?', '15:00?'])
    expect(workEndOpen(st)).toBe(true)
    expect(askedAt(s, '16:30')).toBe(true)
  })

  it('praca zaczęta po zamknięciu w jego minucie (kolejność zdarzeń, nie minuta) ma przycisk', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    const t = s.at('17:00') + 20_000
    s.write(closeEvents(s.stateAt(t), 'ritual', t), t)
    // „Zacznij” by mistake at 17:00:25, ended at 17:00:28 – after the close, in its minute.
    const at = (ms: number, act: TimerAction) => {
      const r = timerAction(s.contextAt(ms), s.stateAt(ms), act, ms)
      if (r.ok) s.write(r.events, ms)
      return r
    }
    expect(at(s.at('17:00') + 25_000, { a: 'startNew', block: 'x', categoryId: 'inne', durationMin: 10, confirm: true }).ok).toBe(true)
    expect(at(s.at('17:00') + 28_000, { a: 'finish', block: 'x' }).ok).toBe(true)
    expect(workEndOpen(s.state('17:02'))).toBe(true)
  })

  it('zamknięcie dnia kończy te zapauzowane bloki pracy, które kończy „Koniec pracy” – analiza tygodniowa i „po końcu pracy jak projekt” zostają (D195)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'wa', cat: 'analiza', at: '10:00', min: 60, tag: 'weeklyAnalysis' }), block({ id: 'b', cat: 'inne', at: '12:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '13:00', min: 60 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.start('wa', '10:00').pause('wa', '10:30')
    s.start('b', '12:00').pause('b', '12:30')
    s.start('n', '13:00').pause('n', '13:20')
    const t = s.at('17:00')
    const ended = closeEvents(s.stateAt(t), 'ritual', t).filter((d) => d.k === 'block.end').map((d) => d.block)
    expect(ended).toEqual(['b'])
  })

  it('„Nie pamiętam” niczego nie potwierdza: granica bez danych', () => {
    const s = day()
    const t = s.at('23:00')
    s.write(closeEvents(s.stateAt(t), 'unknown', t), t)
    const st = s.state('23:05')
    expect(st.ends.at(-1)!.confirmed).toBe(false)
    expect(dayOutcome(st).boundary).toBe('noData')
  })

  it('skutek „Jak zapisano”: granica dotrzymana zamiast bez danych', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.approve('09:15', '07:30')
    s.ran('a', '08:00', '09:00')
    const t = s.at('20:00')
    const effect = closeEffect(s.contextAt(t), s.stateAt(t), t)
    expect(effect.changes).toContainEqual({ kind: 'boundary', before: 'noData', after: 'kept' })
    expect(effect.forecast).toBe(true)
  })
})

describe('wiersze rytuału – przypadki z przeglądu', () => {
  it('wiersz zbiorczy bez czasu do wyjaśnienia (gra 40 min ponad plan) czeka na odpowiedź', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'g', cat: 'regeneracja', variant: 'gra', at: '19:00', min: 30 })] }).using('07:00', '23:59')
    s.start('g', '19:00')
    silentEnd(s, 'g', '20:10', 'twoQuestions', '20:50')
    const r = row(s, '21:00', 'silent')!
    expect([r.items[0]!.extraMin, r.items[0]!.explain, r.answered]).toEqual([40, null, false])
  })

  it('„Pracowałem do …” tylko w czasie do wyjaśnienia (od końca bloku do teraz); „Projekt do …” tylko po bloku liczonym jak projekt', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    s.gap('10:30', '11:15')
    const t = s.at('12:00')
    const st = s.stateAt(t)
    const r = ritualRows(st, useAt(s, t)).find((x) => x.kind === 'workEnd')!
    expect(ritualAnswer(st, r, 'workedUntil', t, s.at('08:30'))).toBeNull()
    expect(ritualAnswer(st, r, 'workedUntil', t, s.at('12:30'))).toBeNull()
    expect(ritualAnswer(st, r, 'workedUntil', t, s.at('11:00'))).toBeNull()
    expect(ritualAnswer(st, r, 'projectUntil', t, s.at('10:00'))).toBeNull()
    expect(ritualAnswer(st, r, 'workedUntil', t, s.at('10:00'))).not.toBeNull()
  })

  it('„skończył się o …” tylko między startem bloku a teraz', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    s.gap('10:30', '11:15')
    const t = s.at('12:00')
    const st = s.stateAt(t)
    const r = ritualRows(st, useAt(s, t)).find((x) => x.kind === 'silent')!
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('13:00'), 'a')).toBeNull()
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('07:30'), 'a')).toBeNull()
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('08:50'), 'a')).not.toBeNull()
  })

  it('zaparkowany blok zakotwiczony do bloku, który minął: „usuń” go odwołuje, „zostaw” zamyka wiersz', () => {
    const plan = [block({ id: 'ny', cat: 'inne', at: '14:00', min: 60 }), block({ id: 'j', cat: 'journaling', after: 'ny', min: 30 }), block({ id: 'k', cat: 'inne', after: 'ny', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).using('07:00', '23:59')
    s.ran('ny', '14:00', '15:00')
    s.write([{ k: 'block.park', block: 'j', at: s.at('15:00'), rule: 'workEnd' }, { k: 'block.park', block: 'k', at: s.at('15:00'), rule: 'workEnd' }], s.at('15:00'))
    const rows = rowsAt(s, '20:00').filter((r) => r.kind === 'parkedAnchored')
    expect(rows.map((r) => (r as { block: string }).block)).toEqual(['j', 'k'])
    const t = s.at('20:00')
    const st = s.stateAt(t)
    s.write(ritualAnswer(st, rows[0]!, 'drop', t)!, t)
    s.write(ritualAnswer(st, rows[1]!, 'ok', t)!, t)
    const after = rowsAt(s, '20:05').filter((r) => r.kind === 'parkedAnchored')
    expect(after.map((r) => [(r as { block: string }).block, (r as { answered: boolean }).answered])).toEqual([['k', true]])
  })
})

describe('wiersze nieobecności, powrotu i zamknięcia aplikacji', () => {
  it('nieobecność odliczona: ✓ to „odlicz” (D272)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 180 })] }).using('07:00', '23:59')
    s.start('a', '08:00')
    s.gap('08:30', '09:15')
    s.write([
      { id: 'abs-p', k: 'block.pause', block: 'a', at: s.at('08:30'), autoRule: 'absence' },
      { id: 'abs-r', k: 'block.resume', block: 'a', at: s.at('09:15'), confirmUntil: null, autoRule: 'absence' }
    ], s.at('09:16'))
    s.end('a', '11:15')
    const r = row(s, '20:00', 'absence')!
    expect([r.mode, hhmm(s.state('20:00'), r.away), r.answered]).toEqual(['counted', '08:30', false])
    const drafts = answer(s, '20:00', 'absence', 'ok')
    expect(drafts.map((d) => [d.k, d.answer])).toEqual([
      ['question.answer', 'keep'],
      ['question.answer', 'ok']
    ])
    expect(row(s, '20:05', 'absence')!.answered).toBe(true)
  })

  it('blok „poza komputerem” zakończony limitem: wiersz z „trwał do …”, poprawka przesuwa koniec', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })] }).using('07:00', '23:59')
    s.start('m', '13:00')
    s.gap('13:01', '15:00')
    s.write([{ id: 'lim', k: 'block.end', block: 'm', at: s.at('14:00'), done: null, rule: 'limit', autoRule: 'limit' }], s.at('15:01'))
    const r = row(s, '20:00', 'away')!
    expect([r.rule, hhmm(s.state('20:00'), r.end), hhmm(s.state('20:00'), r.plannedEnd)]).toEqual(['limit', '14:00', '13:30'])
    answer(s, '20:00', 'away', 'endedAt', s.at('13:45'))
    const st = s.state('20:05')
    expect(hhmm(st, st.facts.blocks.get('m')!.endedAt)).toBe('13:45')
    expect(row(s, '20:05', 'away')).toBeUndefined()
  })

  it('blok przerwany zamknięciem aplikacji: ✓ „skończył się przy wyłączeniu”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 })] }).using('07:00', '23:59')
    s.start('a', '08:00')
    s.write([{ id: 'sd', k: 'block.end', block: 'a', at: s.at('08:30'), done: null, rule: 'shutdown', autoRule: 'shutdown' }], s.at('09:31'))
    expect(row(s, '20:00', 'shutdown')!.answered).toBe(false)
    answer(s, '20:00', 'shutdown', 'ok')
    expect(row(s, '20:05', 'shutdown')!.answered).toBe(true)
  })
})

describe('bloki pominięte, prośby, odpoczynek, poprawki', () => {
  it('pominięty blok: zaparkuj, nie było, było – według planu', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '10:00', min: 60 }), block({ id: 'c', cat: 'inne', at: '12:00', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    expect(rowsAt(s, '20:00').filter((r) => r.kind === 'skipped').map((r) => (r as { block: string }).block)).toEqual(['b', 'c'])
    const t = s.at('20:00')
    const st = s.stateAt(t)
    const rows = ritualRows(st, useAt(s, t)).filter((r) => r.kind === 'skipped')
    s.write(ritualAnswer(st, rows[0]!, 'park', t)!, t)
    s.write(ritualAnswer(st, rows[1]!, 'happened', t)!, t)
    const after = s.state('20:05')
    expect(after.facts.blocks.get('b')!.parkedAt).not.toBeNull()
    expect([hhmm(after, after.facts.blocks.get('c')!.startedAt), hhmm(after, after.facts.blocks.get('c')!.endedAt)]).toEqual(['12:00', '12:30'])
    expect(rowsAt(s, '20:05').some((r) => r.kind === 'skipped')).toBe(false)
  })

  it('niezaczęta sesja „odbyła się”: czasy z użycia komputerów w jej oknie, bez użycia – z planu (T500)', () => {
    const plan = [block({ id: 's', cat: 'sesja', at: '14:00', min: 180, fixed: true })]
    const happened = (s: Scenario) => {
      const t = s.at('20:00')
      const st = s.stateAt(t)
      const r = ritualRows(st, useAt(s, t)).find((x) => x.kind === 'skipped')!
      s.write(ritualAnswer(st, r, 'happened', t)!, t)
      const b = s.state('20:05').facts.blocks.get('s')!
      return { used: (r as Extract<RitualRow, { kind: 'skipped' }>).used, times: [hhmm(s.state('20:05'), b.startedAt), hhmm(s.state('20:05'), b.endedAt)] }
    }
    // Used from 14:20 (a gap from 13:50) to 16:35 (a gap to 20:00) – never „Zacznij”.
    const used = new Scenario({ date: DATE, plan }).using('07:00', '23:59').gap('13:50', '14:20').gap('16:35', '20:00')
    const a = happened(used)
    expect(a.used).toEqual({ from: used.at('14:20'), to: used.at('16:35') })
    expect(a.times).toEqual(['14:20', '16:35'])
    // Nobody at a computer the whole window: the plan's times.
    const away = new Scenario({ date: DATE, plan }).using('07:00', '23:59').gap('13:30', '17:30')
    const b = happened(away)
    expect(b.used).toBeNull()
    expect(b.times).toEqual(['14:00', '17:00'])
  })

  it('prośba z „osoba: ?” dostaje osobę', () => {
    const s = new Scenario({ date: DATE, plan: [] }).using('07:00', '23:59')
    s.request('r1', '15:00', '15:20')
    expect(row(s, '20:00', 'person')!.request).toBe('r1')
    answer(s, '20:00', 'person', 'person', 'Mama')
    const st = s.state('20:05')
    expect(st.facts.requests[0]!.person).toBe('Mama')
    expect(row(s, '20:05', 'person')).toBeUndefined()
  })

  it('odcinek wieczoru oznaczony jako nie-odpoczynek nie liczy się do regeneracji', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    const before = s.state('21:05').regen.totalMin
    answer(s, '21:00', 'rest', 'notRest', { from: s.at('19:00'), to: s.at('20:00') })
    expect(s.state('21:05').regen.totalMin).toBe(before - 60)
    expect(row(s, '21:05', 'rest')!.answered).toBe(true)
  })

  it('odcinek „nie odpoczynek” tylko wieczorem albo w „Odcinam się” – sięgający przed koniec pracy odrzucony, drzemka zostaje (A2-05)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'n', cat: 'regeneracja', at: '13:00', min: 30 }), block({ id: 'b', cat: 'inne', at: '14:00', min: 180 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').ran('n', '13:00', '13:30').ran('b', '14:00', '17:00').workEnd('17:00')
    const before = s.state('21:05').regen.totalMin
    // Typed 12:00–18:00: refused (never cut in silence), the nap stays.
    expect(ritualAnswer(s.state('21:00'), row(s, '21:00', 'rest')!, 'notRest', s.at('21:00'), { from: s.at('12:00'), to: s.at('18:00') })).toBeNull()
    // 17:00–18:00 – the evening: taken.
    answer(s, '21:00', 'rest', 'notRest', { from: s.at('17:00'), to: s.at('18:00') })
    expect(s.state('21:05').regen.totalMin).toBe(before - 60)
  })

  it('korekta realnych czasów bloku i oznaczenie „niedokończony”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.write([{ k: 'block.fix', block: 'a', at: s.at('20:00'), start: s.at('08:10'), end: s.at('09:20') }, { k: 'block.mark', block: 'a', at: s.at('20:00'), done: false }], s.at('20:00'))
    const f = s.state('20:05').facts.blocks.get('a')!
    expect([hhmm(s.state('20:05'), f.startedAt), hhmm(s.state('20:05'), f.endedAt), f.done]).toEqual(['08:10', '09:20', false])
    // A start after the block's end is refused (a problem, nothing changes).
    s.write([{ k: 'block.fix', block: 'a', at: s.at('20:10'), start: s.at('10:00'), end: null }], s.at('20:10'))
    expect(hhmm(s.state('20:15'), s.state('20:15').facts.blocks.get('a')!.startedAt)).toBe('08:10')
  })
})

describe('niezamknięte dni', () => {
  it('przed dziś, od pierwszego dnia z rytuałem, bez zamknięcia, najwyżej 72 h po końcu dnia', () => {
    const ev = (k: string) => [{ id: 'x', c: 'pca', n: 0, t: 0, l: 0, v: 1, day: '2026-10-26', dom: 'timer', k, at: 0 }] as never
    const days = [
      { date: '2026-10-25', events: [] },
      { date: '2026-10-26', events: ev('presence.first') },
      { date: '2026-10-27', events: ev('ritual.close') },
      { date: '2026-10-28', events: [] }
    ]
    const now = new Scenario({ date: '2026-10-28', plan: [] }).at('08:00')
    expect(unclosedDays(days, '2026-10-28', now, '2026-10-26')).toEqual([{ date: '2026-10-26', presence: true }])
    // Before the first version with the ritual nothing waits (T482).
    expect(unclosedDays(days, '2026-10-28', now, null)).toEqual([])
    // A close undone („Cofnij”) does not close the day.
    const undone = [
      { id: 'c1', c: 'pca', n: 0, t: 0, l: 0, v: 1, day: '2026-10-27', dom: 'timer', k: 'ritual.close', at: 0, how: 'ritual' },
      { id: 'u1', c: 'pca', n: 1, t: 1, l: 1, v: 1, day: '2026-10-27', dom: 'timer', k: 'undo', at: 1, target: 'c1' }
    ] as never
    expect(unclosedDays([{ date: '2026-10-27', events: undone }], '2026-10-28', now, '2026-10-26').map((d) => d.date)).toEqual(['2026-10-27'])
    // 72 h after the day's end it is no longer shown.
    expect(unclosedDays(days, '2026-10-30', new Scenario({ date: '2026-10-30', plan: [] }).at('05:00'), '2026-10-20').map((d) => d.date)).toEqual(['2026-10-28'])
  })
})

describe('odczuwany koszt (D319)', () => {
  it('wiersz na każdą kategorię dnia, w kolejności startów; ostatnia odpowiedź wygrywa', () => {
    const plan = [
      block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
      block({ id: 'b', cat: 'inne', at: '10:00', min: 10 }),
      block({ id: 'r', cat: 'regeneracja', at: '11:00', min: 30 }),
      block({ id: 'c', cat: 'inne', at: '12:00', min: 30 })
    ]
    const s = new Scenario({ date: DATE, plan }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00')
    s.ran('b', '10:00', '10:10')
    s.ran('r', '11:00', '11:30')
    s.ran('c', '12:00', '12:30')
    s.raw({ k: 'cost.felt', at: s.at('20:00'), category: 'analiza', feel: 'heavier' }, '20:00')
    s.raw({ k: 'cost.felt', at: s.at('20:01'), category: 'analiza', feel: 'usual' }, '20:01')
    const t = s.at('20:05')
    expect(feltRows(s.contextAt(t), s.stateAt(t))).toEqual([
      { category: 'analiza', minutes: 60, feel: 'usual' },
      { category: 'inne', minutes: 40, feel: null },
      { category: 'regeneracja', minutes: 30, feel: null }
    ])
  })

  it('prośby zrobione poza blokiem mają wiersz „Prośby domowe” – w kolejności pierwszego startu (A2-08)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.request('r1', '07:30', '07:50')
    s.ran('a', '08:00', '09:00')
    s.request('r2', '15:00', '15:30', 'urgent')
    const t = s.at('20:05')
    expect(feltRows(s.contextAt(t), s.stateAt(t))).toEqual([
      { category: 'prosby', minutes: 50, feel: null },
      { category: 'analiza', minutes: 60, feel: null }
    ])
  })
})

describe('kiedy rytuał (D318, T505)', () => {
  it('dziś po końcu pracy, gdy nic z pracy nie biegnie; dzień bez pracy – zawsze; wcześniej od pierwszego dnia; nigdy przed nim', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '18:00', min: 60 })] }).using('07:00', '23:59')
    expect(ritualDue(s.state('08:30'), DATE, DATE)).toBe(false)
    s.ran('a', '08:00', '09:00')
    s.workEnd('09:00')
    expect(ritualDue(s.state('09:05'), DATE, DATE)).toBe(true)
    // Work again: not while it runs.
    s.start('b', '18:00')
    expect(ritualDue(s.state('18:10'), DATE, DATE)).toBe(false)
    expect(ritualDue(s.state('18:10'), DATE, null)).toBe(false)
    expect(ritualDue(s.state('09:05'), DATE, '2026-10-29')).toBe(false)
    // A day before: from the first day, while not frozen.
    expect(ritualDue(s.state('09:05'), '2026-10-29', DATE)).toBe(true)
    const free = new Scenario({ date: DATE, plan: [] }).using('07:00', '23:59')
    expect(ritualDue(free.state('10:00'), DATE, DATE)).toBe(true)
  })

  // Flexible work 08:00–09:00 and 14:00–15:30, never begun: the forecast keeps them ahead, the plan's end does not move.
  const unbegun = () => new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '14:00', min: 90 })] }).using('07:00', '23:59')

  it('praca z planu się nie zaczęła: od planowanego końca ostatniego bloku pracy (D329)', () => {
    const s = unbegun()
    expect(ritualDue(s.state('15:29'), DATE, DATE)).toBe(false)
    expect(ritualDue(s.state('15:30'), DATE, DATE)).toBe(true)
    expect(ritualDue(s.state('21:00'), DATE, DATE)).toBe(true)
  })

  it('zaparkowany ostatni blok się nie liczy; praca zaczęta później – rytuał czeka na jej koniec (D329)', () => {
    const parked = unbegun()
    parked.raw({ k: 'block.park', at: parked.at('09:00'), block: 'b', rule: 'park' }, '09:00')
    expect(ritualDue(parked.state('09:30'), DATE, DATE)).toBe(true)
    const late = unbegun()
    late.start('b', '16:00')
    expect(ritualDue(late.state('16:30'), DATE, DATE)).toBe(false)
  })

  it('blok „po pracy” zaczęty wieczorem nie jest zaczętą pracą – rytuał zostaje (D329, przegląd 0.22.0)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '20:00', min: 60 })] }).using('07:00', '23:59')
    expect(ritualDue(s.state('19:00'), DATE, DATE)).toBe(true)
    s.ran('n', '20:00', '21:00')
    expect(ritualDue(s.state('21:30'), DATE, DATE)).toBe(true)
  })
})
