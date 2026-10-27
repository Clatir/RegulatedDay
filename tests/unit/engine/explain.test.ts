/**
 * Time to explain (spec „Model dnia” – „Czas do wyjaśnienia”, D238, D243, D249, D250, D254, D255, D262, D264–D266, D271,
 * D276, D281): after a work or project block that ended by itself, the further use of the computers waits for your
 * answer – neither work, nor a project, nor regeneration; after a work block rest for the hard end and the pool.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

/** A block's end as the leader writes it (an automatic action with its rule). */
function silentEnd(s: Scenario, id: string, at: string, rule: string, written = at): Scenario {
  return s.write([{ id: `auto-${id}-${rule}`, k: 'block.end', block: id, at: s.at(at), done: null, rule, autoRule: rule }], s.at(written))
}

/** Your answer to a time to explain („praca”, „projekt”, „odpoczynek”, with „… do” as `until`). */
function answer(s: Scenario, id: string, cls: 'work' | 'project' | 'rest', at: string, until?: string): Scenario {
  return s.write([{ k: 'question.answer', at: s.at(at), question: id, answer: cls, value: until ? s.at(until) : null }], s.at(at))
}

const span = (st: ReturnType<Scenario['state']>, i = 0) => {
  const x = st.explains[i]!
  return { from: hhmm(st, x.from), to: x.to === Number.POSITIVE_INFINITY ? 'trwa' : hhmm(st, x.to), until: x.until, kind: x.kind, answer: x.answer?.cls ?? null }
}

describe('czas do wyjaśnienia po bloku pracy', () => {
  function workDay() {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    // Two asks without an answer: the block ends at its planned end (written an hour after the first was seen).
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    // You use the computer until 10:30, then a break of 45 min.
    s.gap('10:30', '11:15')
    return s
  }

  it('trwa od zapisanego końca do pierwszej przerwy w używaniu ponad 10 min; nie jest regeneracją, energia się nie zmienia', () => {
    const s = workDay()
    const st = s.state('12:00')
    expect(span(st)).toEqual({ from: '09:00', to: '10:30', until: 'break', kind: 'work', answer: null })
    expect(st.regen.explainMin).toBe(90)
    // After the end of work time without a block is regeneration – but not the time to explain (10:30–12:00 only).
    expect(st.regen.totalMin).toBe(90)
    // At the freeze it is taken as written: rest (D265).
    expect(s.state('12:00', { asWritten: true }).regen.totalMin).toBe(180)
    // The energy does not change in it (no cost, no regeneration).
    s.checkin('07:30', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const e = s.energyWithDay('12:00').energy
    const at = (time: string) => Math.round((s.at(time) - st.grid.start) / 60_000)
    expect(e.series.head[at('10:30')]).toBe(e.series.head[at('09:00')])
    expect(e.series.head[at('11:30')]).toBeGreaterThan(e.series.head[at('10:30')]!)
  })

  it('krótsza przerwa (do 10 min) go nie kończy; trwa, dopóki używasz komputera', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    s.gap('09:20', '09:28')
    expect(span(s.state('10:40'))).toEqual({ from: '09:00', to: 'trwa', until: null, kind: 'work', answer: null })
  })

  it('„Koniec pracy” kończy go i odpowiada „odpoczynek” (D249): liczy się jak czas bez bloku', () => {
    const s = workDay()
    s.workEnd('10:00', '09:00')
    const st = s.state('12:00')
    expect(span(st)).toEqual({ from: '09:00', to: '10:00', until: 'workEnd', kind: 'work', answer: 'rest' })
    expect(st.regen.explainMin).toBe(0)
    expect(st.regen.totalMin).toBe(180)
  })

  it('„Odcinam się” też odpowiada „odpoczynek”, a start bloku na pierwszym planie go kończy', () => {
    const s = workDay()
    s.disconnect('09:40', '10:10')
    expect(span(s.state('12:00'))).toMatchObject({ to: '09:40', until: 'disconnect', answer: 'rest' })

    const s2 = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })] }).using('07:00', '23:00')
    s2.start('a', '08:00')
    silentEnd(s2, 'a', '09:00', 'twoQuestions', '10:00')
    s2.start('b', '09:50')
    expect(span(s2.state('10:30'))).toEqual({ from: '09:00', to: '09:50', until: 'block', kind: 'work', answer: null })
  })

  it('„Pracowałem do …”: praca do tej chwili (po granicy – przedłużenie), dalej odpoczynek; koniec pracy przesuwa się', () => {
    const s = workDay()
    s.approve('09:15', '07:30')
    answer(s, `explain:${DATE}:a:${s.state('12:00').explains[0]!.blockEnd}`, 'work', '11:30', '10:00')
    s.workEnd('11:30', '10:00')
    const st = s.state('12:00')
    expect(span(st)).toMatchObject({ answer: 'work' })
    expect(st.extensionMin).toBe(45)
    expect(hhmm(st, st.workEnd)).toBe('10:00')
    // 10:00–10:30 rest, 10:30–12:00 regeneration.
    expect(st.regen.totalMin).toBe(120)
    // The answer does not change the energy back in time.
    s.checkin('07:30', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const e = s.energyWithDay('12:00').energy
    const at = (time: string) => Math.round((s.at(time) - st.grid.start) / 60_000)
    expect(e.series.head[at('10:30')]).toBe(e.series.head[at('09:00')])
  })
})

describe('czas do wyjaśnienia po projekcie', () => {
  it('od powrotu po końcu progiem bezczynności; przerwa 10–30 min jest odpoczynkiem, kończy go dopiero przerwa od 30 min (D281)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'p', cat: 'projekty', at: '19:00', min: 60 })] }).using('07:00', '23:59')
    s.start('p', '19:00')
    s.gap('20:05', '20:20')
    silentEnd(s, 'p', '20:05', 'idle', '20:15')
    s.gap('20:40', '20:55')
    s.gap('21:10', '21:50')
    const st = s.state('22:00')
    expect(span(st)).toEqual({ from: '20:20', to: '21:10', until: 'break', kind: 'project', answer: null })
    expect(st.explains[0]!.rests.map((r) => [hhmm(st, r.from), hhmm(st, r.to)])).toEqual([['20:40', '20:55']])
    expect(st.regen.explainMin).toBe(35)
    // „Koniec pracy” does not answer it after a project (D254).
    s.workEnd('22:05', '17:00')
    expect(span(s.state('22:10')).answer).toBeNull()
  })

  it('nie liczy się do projektów ani do regeneracji, dopóki nie odpowiesz; „projekt” liczy go jak projekt', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'p', cat: 'projekty', at: '19:00', min: 60 })] }).using('07:00', '23:59')
    s.start('p', '19:00')
    silentEnd(s, 'p', '20:00', 'twoQuestions', '21:00')
    s.gap('20:30', '21:30')
    const before = s.state('21:40')
    expect(span(before)).toMatchObject({ from: '20:00', to: '20:30', kind: 'project' })
    expect(before.projectsMin).toBe(60)
    answer(s, before.explains[0]!.id, 'project', '21:45')
    const after = s.state('21:50')
    expect(after.projectsMin).toBe(90)
    expect(after.regen.explainMin).toBe(0)
  })
})

describe('czas do wyjaśnienia – zapisy w środku minuty, poprawki z rytuału, druga zmiana', () => {
  it('koniec progiem bezczynności w środku minuty (20:05:17): czas od powrotu, nie od końca bloku', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'p', cat: 'projekty', at: '19:00', min: 60 })] }).using('07:00', '23:59')
    s.start('p', '19:00')
    const away = s.at('20:05') + 17_000
    const back = s.at('20:20') + 17_000
    s.write([{ k: 'gap.open', gap: 'gi', kind: 'input', from: away, lastOutside: away }, { k: 'gap.open', gap: 'gu', kind: 'use', from: away, lastOutside: null }], away)
    s.write([{ k: 'gap.close', gap: 'gi', to: back }, { k: 'gap.close', gap: 'gu', to: back }], back)
    s.write([{ id: 'auto-p-idle', k: 'block.end', block: 'p', at: away, done: null, rule: 'idle', autoRule: 'idle' }], away + 10 * 60_000)
    expect(span(s.state('21:00'))).toEqual({ from: '20:20', to: 'trwa', until: null, kind: 'project', answer: null })
  })

  it('minięcie twardego końca zapisane przez prowadzącego: komunikat zostaje (czas do wyjaśnienia po projekcie, D250)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id: 'p', cat: 'projekty', at: '17:30', min: 120 })] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.start('p', '17:30')
    silentEnd(s, 'p', '19:30', 'twoQuestions', '20:30')
    s.gap('21:20', '22:10')
    s.write([{ id: 'he', k: 'hardend.pass', at: s.at('21:00'), basis: 'prowadzący' }], s.at('21:01'))
    const st = s.state('22:30')
    expect(hhmm(st, st.hardEnd.passed)).toBe('21:00')
    expect(st.hardEnd.message).toBe(true)
  })

  it('odcinek oznaczony w rytuale jako nie-odpoczynek w czasie do wyjaśnienia po pracy nie jest odpoczynkiem także „jak zapisano”', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    s.gap('10:30', '11:15')
    s.write([{ k: 'rest.not', at: s.at('11:50'), from: s.at('09:00'), to: s.at('10:00') }], s.at('11:50'))
    expect(s.state('12:00', { asWritten: true }).regen.totalMin).toBe(120)
  })

  it('oznaczenie „nie był odpoczynkiem” liczy się od swojej chwili: twardy koniec nie mija przez nie wstecz, energia się nie zmienia', () => {
    // Work to 17:00 (confirmed), 17:00–19:00 free (the minimum reached), a project 19:00–20:45. Marked at 21:30: 17:00–19:00
    // was no rest – judged at 20:30 with it, the hard end would have passed then.
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id: 'p', cat: 'projekty', at: '19:00', min: 30 })] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.ran('p', '19:00', '20:45')
    s.checkin('07:30', { head: [0, 0], emotions: [0, 0], senses: [0, 0] })
    const at = (st: ReturnType<Scenario['state']>, time: string) => Math.round((s.at(time) - st.grid.start) / 60_000)
    const before = s.energyWithDay('21:40')
    s.write([{ k: 'rest.not', at: s.at('21:30'), from: s.at('17:00'), to: s.at('19:00') }], s.at('21:30'))
    const after = s.energyWithDay('21:40')
    expect(after.day.hardEnd.passed).toBeNull()
    expect(after.day.regen.totalMin).toBe(before.day.regen.totalMin - 120)
    expect(after.energy.series.head[at(after.day, '18:30')]).toBe(before.energy.series.head[at(before.day, '18:30')])
  })

  it('po drugiej zmianie odpowiedź „praca” liczy się jak druga zmiana poza swoim czasem – nie przesuwa końca pracy', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 's2', cat: 'inne', at: '20:00', min: 60, tag: 'secondShift' })] }).using('07:00', '23:59')
    s.ran('a', '08:00', '09:00').workEnd('09:00')
    s.start('s2', '20:00')
    silentEnd(s, 's2', '21:00', 'twoQuestions', '22:00')
    s.gap('21:40', '22:30')
    answer(s, s.state('22:35').explains[0]!.id, 'work', '22:40')
    const st = s.state('22:45')
    expect(hhmm(st, st.workEnd)).toBe('09:00')
  })

  it('długi czas do wyjaśnienia nie spowalnia liczenia dnia (sprawdzanie twardego końca przeskakuje jego minuty)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'projekty', at: '08:00', min: 60 })] }).using('07:00', '23:59')
    s.start('a', '08:00')
    silentEnd(s, 'a', '09:00', 'twoQuestions', '10:00')
    const ctx = s.contextAt(s.at('21:00'))
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      computeDay(ctx)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    expect(times[2]!).toBeLessThan(40)
  })
})

describe('czas do wyjaśnienia – kiedy go nie ma', () => {
  it('po nieobecności z odpowiedzią „Zakończyć” czas od powrotu liczy się według zwykłych reguł (D276)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    s.gap('08:40', '09:30')
    silentEnd(s, 'a', '08:40', 'absence', '09:10')
    expect(span(s.state('10:00'))).toEqual({ from: '09:30', to: 'trwa', until: null, kind: 'work', answer: null })
    s.write([{ k: 'question.answer', at: s.at('10:01'), question: `absence:${DATE}:a:${s.state('10:00').explains[0]!.blockEnd}`, answer: 'keep', value: null }], s.at('10:01'))
    expect(s.state('10:05').explains).toEqual([])
  })

  it('po bloku, który skończył się sam inaczej (np. „poza komputerem” przy pierwszym użyciu) – nie ma go', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })] }).using('07:00', '23:00')
    s.start('m', '13:00')
    s.gap('13:01', '13:40')
    silentEnd(s, 'm', '13:40', 'firstUse', '13:41')
    expect(s.state('14:30').explains).toEqual([])
  })

  it('nikt nie wrócił do komputera – jeszcze go nie ma', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).using('07:00', '23:00')
    s.start('a', '08:00')
    s.gap('09:05', null)
    silentEnd(s, 'a', '09:05', 'idle', '09:15')
    expect(s.state('09:40').explains).toEqual([])
  })
})

describe('twardy koniec w czasie do wyjaśnienia', () => {
  // Work to 17:00, a project 17:30–19:30 that ends by itself; you use the computer to 21:20. Minimum 90 min, bedtime
  // 22:00: 17:00–17:30 gives 30 min, the hard end is 21:00 (60 min before the bedtime).
  function evening(cat: string) {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'w', cat: 'inne', at: '08:00', min: 540 }), block({ id: 'p', cat, at: '17:30', min: 120 })] }).using('07:00', '23:59')
    s.ran('w', '08:00', '17:00').workEnd('17:00')
    s.start('p', '17:30')
    silentEnd(s, 'p', '19:30', 'twoQuestions', '20:30')
    s.gap('21:20', '22:10')
    return s
  }

  it('po projekcie mija w nim przy wejściu, z komunikatem (D250)', () => {
    const st = evening('projekty').state('22:30')
    expect(span(st)).toMatchObject({ kind: 'project', from: '19:30', to: '21:20' })
    expect(hhmm(st, st.hardEnd.passed)).toBe('21:00')
    expect(st.hardEnd.message).toBe(true)
  })

  it('po projekcie przy przerwie w wejściu w minucie twardego końca mija dopiero przy wejściu', () => {
    const s = evening('projekty')
    s.gap('20:58', '21:04', { kind: 'input' })
    const st = s.state('22:30')
    expect(hhmm(st, st.hardEnd.passed)).toBe('21:04')
  })

  it('po bloku pracy przesuwa się z nim jak przy odpoczynku – nie mija, bez komunikatu (D255, D262)', () => {
    const st = evening('inne').state('22:30')
    expect(span(st)).toMatchObject({ kind: 'work', from: '19:30', to: '21:20' })
    expect(st.hardEnd.passed).toBeNull()
  })

  it('późniejsza odpowiedź „praca” liczy dzień od nowa, ale twardy koniec nie mija przez nią wstecz (D262)', () => {
    const s = evening('inne')
    const id = s.state('21:30').explains[0]!.id
    answer(s, id, 'work', '23:30')
    const st = s.state('23:40')
    expect(span(st)).toMatchObject({ answer: 'work' })
    expect(st.hardEnd.passed).toBeNull()
    // The minutes are work now: 19:30–21:20 after the boundary.
    expect(st.extensionMin).toBeGreaterThan(0)
  })
})
