/**
 * The closing ritual (spec „Rytuał zamknięcia”, D246, D249, D254, D272): its rows from the day, answers as events, the
 * effect of a ✓ (the outcome as frozen), closing the day (untouched rows as written), the days the morning shows.
 */
import { describe, expect, it } from 'vitest'
import { closeEffect, closeEvents, ritualAnswer, ritualEffect, ritualRows, unclosedDays, type RitualRow } from '@shared/engine/ritual'
import { dayOutcome } from '@shared/engine/outcome'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function silentEnd(s: Scenario, id: string, at: string, rule: string, written = at): Scenario {
  return s.write([{ id: `auto-${id}-${rule}`, k: 'block.end', block: id, at: s.at(at), done: null, rule, autoRule: rule }], s.at(written))
}

/** A row's answer written at `time` (asserting it is a choice of the row). */
function answer(s: Scenario, time: string, kind: RitualRow['kind'], choice: string, value: Parameters<typeof ritualAnswer>[4] = null, item: string | null = null) {
  const t = s.at(time)
  const st = s.stateAt(t)
  const row = ritualRows(st).find((r) => r.kind === kind)!
  const drafts = ritualAnswer(st, row, choice, t, value, item)
  expect(drafts).not.toBeNull()
  s.write(drafts!, t)
  return drafts!
}

const row = <K extends RitualRow['kind']>(s: Scenario, time: string, kind: K) => ritualRows(s.state(time)).find((r) => r.kind === kind) as Extract<RitualRow, { kind: K }> | undefined

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
    const rows = ritualRows(s.state('21:40'))
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
    const silent = ritualRows(st).find((r) => r.kind === 'silent')!
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
    const r = ritualRows(st).find((x) => x.kind === 'workEnd')!
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
    const r = ritualRows(st).find((x) => x.kind === 'silent')!
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('13:00'), 'a')).toBeNull()
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('07:30'), 'a')).toBeNull()
    expect(ritualAnswer(st, r, 'endedAt', t, s.at('08:50'), 'a')).not.toBeNull()
  })

  it('zaparkowany blok zakotwiczony do bloku, który minął: „usuń” go odwołuje, „zostaw” zamyka wiersz', () => {
    const plan = [block({ id: 'ny', cat: 'inne', at: '14:00', min: 60 }), block({ id: 'j', cat: 'journaling', after: 'ny', min: 30 }), block({ id: 'k', cat: 'inne', after: 'ny', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).using('07:00', '23:59')
    s.ran('ny', '14:00', '15:00')
    s.write([{ k: 'block.park', block: 'j', at: s.at('15:00'), rule: 'workEnd' }, { k: 'block.park', block: 'k', at: s.at('15:00'), rule: 'workEnd' }], s.at('15:00'))
    const rows = ritualRows(s.state('20:00')).filter((r) => r.kind === 'parkedAnchored')
    expect(rows.map((r) => (r as { block: string }).block)).toEqual(['j', 'k'])
    const t = s.at('20:00')
    const st = s.stateAt(t)
    s.write(ritualAnswer(st, rows[0]!, 'drop', t)!, t)
    s.write(ritualAnswer(st, rows[1]!, 'ok', t)!, t)
    const after = ritualRows(s.state('20:05')).filter((r) => r.kind === 'parkedAnchored')
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
    expect(ritualRows(s.state('20:00')).filter((r) => r.kind === 'skipped').map((r) => (r as { block: string }).block)).toEqual(['b', 'c'])
    const t = s.at('20:00')
    const st = s.stateAt(t)
    const rows = ritualRows(st).filter((r) => r.kind === 'skipped')
    s.write(ritualAnswer(st, rows[0]!, 'park', t)!, t)
    s.write(ritualAnswer(st, rows[1]!, 'happened', t)!, t)
    const after = s.state('20:05')
    expect(after.facts.blocks.get('b')!.parkedAt).not.toBeNull()
    expect([hhmm(after, after.facts.blocks.get('c')!.startedAt), hhmm(after, after.facts.blocks.get('c')!.endedAt)]).toEqual(['12:00', '12:30'])
    expect(ritualRows(after).some((r) => r.kind === 'skipped')).toBe(false)
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
