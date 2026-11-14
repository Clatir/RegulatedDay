/**
 * The end of work after the E8 review (spec „Pierwszy koniec pracy”, „Granica i koniec pracy”, „Odcinam się”): a paused
 * last work block counts for 15 min and only then ends the work, „Koniec pracy” clicked with a paused block confirms its
 * real end and ends it, „Odcinam się” followed by work after „Wracam” before the boundary is only a break.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { questionsOf } from '@shared/engine/auto'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { workSince } from '@shared/engine/facts'
import { RULES_VERSION } from '@shared/model/events'
import { block, hhmm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

function workEndAsked(s: Scenario, time: string): boolean {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t }).some((q) => q.kind === 'workEnd')
}

const ends = (s: Scenario, time: string) => {
  const st = s.state(time)
  return st.ends.map((e) => `${hhmm(st, e.at)}${e.confirmed ? '+' : '?'}`)
}

describe('pauza ostatniego bloku pracy (A1-01)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 })]

  it('przez 15 min od pauzy nie ma końca pracy ani „Koniec pracy?”, potem koniec w chwili pauzy', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30')
    expect(ends(s, '09:31')).toEqual([])
    expect(workEndAsked(s, '09:31')).toBe(false)
    expect(ends(s, '09:44')).toEqual([])
    expect(ends(s, '09:46')).toEqual(['09:30?'])
    expect(workEndAsked(s, '09:46')).toBe(true)
  })

  it('wznowienie w ciągu 15 min: pauza nie jest końcem pracy, regeneracja liczy się od prawdziwego końca', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30').resume('a', '09:40').end('a', '10:10')
    const st = s.state('11:00')
    expect(ends(s, '11:00')).toEqual(['10:10?'])
    expect(hhmm(st, st.firstEnd)).toBe('10:10')
    expect(st.regen.totalMin).toBe(50)
  })

  it('blok przerwany prośbą czeka na jej koniec – długa prośba nie robi końca pracy (T503)', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:30')
    s.raw({ k: 'request.start', request: 'r1', at: s.at('09:30'), mode: 'now', person: null, estimateMin: null, hardEndAt: null, interrupts: 'a' }, '09:30')
    expect(ends(s, '10:00')).toEqual([])
    s.raw({ k: 'request.end', request: 'r1', at: s.at('10:05') }, '10:05').resume('a', '10:05')
    expect(ends(s, '10:20')).toEqual([])
  })
})

describe('„Koniec pracy” przy zapauzowanym bloku (A1-02)', () => {
  it('potwierdza koniec ostatniego przebiegu i kończy zapauzowany blok (z „Cofnij”)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })] }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').end('a', '10:00').start('b', '11:00').pause('b', '11:30')
    const r = click(s, '11:35', { a: 'workEnd' })
    expect(r.ok && r.events.map((e) => `${e.k} ${(e.block as string | undefined) ?? ''}`.trim())).toEqual(['work.end', 'block.end b'])
    expect(r.ok && r.events[0]!.end).toBe(s.at('11:30'))
    const st = s.state('12:30')
    // b began within 15 min of its time, so 10:00 was no end; the click confirms b's real end.
    expect(ends(s, '12:30')).toEqual(['11:30+'])
    expect(timerNow(st).paused).toEqual([])
    expect(timerNow(st).workEndConfirmed).toBe(true)
    expect(workEndAsked(s, '12:30')).toBe(false)
    expect(st.facts.autos.find((a) => a.k === 'block.end')?.rule).toBe('workEnd')
  })
})

describe('praca zaczęta po „Koniec pracy” w minucie kliknięcia albo zaraz po nim (G1, E8a.2)', () => {
  const at = (s: Scenario, ms: number, act: TimerAction) => {
    const r = timerAction(s.contextAt(ms), s.stateAt(ms), act, ms)
    if (r.ok) s.write(r.events, ms)
    return r
  }

  it('blok zaczęty w minucie końca poprzedniego: wcześniejsze kliknięcie nie potwierdza jego końca', () => {
    const s = new Scenario({ date: '2026-11-12', plan: [block({ id: 'b1', cat: 'inne', at: '13:00', min: 15 }), block({ id: 'b2', cat: 'inne', at: '13:03', min: 20 })] }).observe('07:00', null)
    const ms = (time: string, sec: number) => s.at(time) + sec * 1000
    s.approve('17:00', '07:30')
    at(s, ms('13:00', 16), { a: 'start', block: 'b1' })
    at(s, ms('13:01', 39), { a: 'workEnd' })
    expect(ends(s, '13:02')).toEqual(['13:02+'])
    at(s, ms('13:02', 29), { a: 'start', block: 'b2' })
    at(s, ms('13:03', 15), { a: 'pause' })
    // The work after the click reopened the day's work: its end waits for 15 min from the pause (T514) or a click.
    expect(ends(s, '13:05')).toEqual([])
    expect(timerNow(s.state('13:05')).workEndConfirmed).toBe(false)
    expect(ends(s, '13:19')).toEqual(['13:03?'])
    expect(workEndAsked(s, '13:19')).toBe(true)
  })

  it('pusty odcinek (T507) i blok zaczęty w tej samej minucie po kliknięciu: koniec bloku nie jest potwierdzony', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 })] }).observe('07:00', null)
    const ms = (sec: number) => s.at('09:00') + sec * 1000
    // „Zacznij” by mistake at 09:00:05, „Koniec pracy” at 09:00:10 ends it; b begun at 09:00:20 – after the click.
    at(s, ms(5), { a: 'start', block: 'a' })
    expect(at(s, ms(10), { a: 'workEnd' }).ok).toBe(true)
    at(s, ms(20), { a: 'start', block: 'b', confirm: true })
    at(s, s.at('09:30'), { a: 'pause' })
    const st = s.state('09:31')
    // a began before the click: only b is work since it.
    expect(st.facts.workEnds).toHaveLength(1)
    expect(st.facts.blocks.get('a')!.endedAt).toBe(st.facts.blocks.get('a')!.startedAt)
    expect(timerNow(st).workEndConfirmed).toBe(false)
    expect(ends(s, '09:46')).toEqual(['09:30?'])
  })

  it('blok pracy w tle biegnący przez kliknięcie i przeniesiony potem na pierwszy plan to ta sama praca – koniec zostaje potwierdzony', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'g', cat: 'inne', at: '08:00', min: 120, bg: true })] }).observe('07:00', null)
    s.start('g', '08:00', { bg: true }).start('a', '08:00')
    click(s, '08:30', { a: 'workEnd' })
    s.fg('g', false, '08:40').end('g', '09:00')
    expect(ends(s, '09:30')).toEqual(['09:00+'])
  })

  it('blok w tle zaczęty przed kliknięciem w tej samej minucie (zaokrąglonej) nie jest pracą „po” – rozstrzyga kolejność, nie minuta', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'g', cat: 'inne', at: '08:00', min: 120, bg: true })] }).observe('07:00', null)
    const ms = (time: string, sec: number) => s.at(time) + sec * 1000
    s.start('a', '08:00')
    // 08:29:35 and 08:29:50 both round to 08:30.
    expect(at(s, ms('08:29', 35), { a: 'start', block: 'g', confirm: true }).ok).toBe(true)
    at(s, ms('08:29', 50), { a: 'workEnd' })
    s.end('g', '09:00')
    expect(ends(s, '09:30')).toEqual(['09:00+'])
  })

  for (const sec of [15, 45])
    it(`„Nauka” zaczęta po „Koniec pracy” z tej samej minuty (17:00:05 → 17:00:${sec}) jest projektem, koniec 17:00 potwierdzony (D195)`, () => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 })] }).observe('07:00', null)
      s.approve('17:15', '07:30').start('a', '16:00')
      expect(at(s, s.at('17:00') + 5_000, { a: 'workEnd' }).ok).toBe(true)
      expect(at(s, s.at('17:00') + sec * 1000, { a: 'start', block: 'n', confirm: true }).ok).toBe(true)
      s.end('n', '18:00')
      const st = s.state('18:30')
      expect(st.asProject).toContain('n')
      expect(ends(s, '18:30')).toEqual(['17:00+'])
      expect(st.extensionMin).toBe(0)
    })

  it('„Nauka” zaczęta z biegnącego bloku pracy (koniec i start jednym kliknięciem) jest pracą, jak przed G1', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 })] }).observe('07:00', null)
    at(s, s.at('16:00'), { a: 'start', block: 'a' })
    const r = at(s, s.at('17:00') + 20_000, { a: 'startNew', block: 'n', categoryId: 'nauka', durationMin: 30, confirm: true })
    expect(r.ok && r.events.map((e) => e.k)).toEqual(['block.end', 'block.start'])
    const st = s.state('17:10')
    expect(st.asProject).toEqual([])
    expect(st.ends).toEqual([])
  })

  for (const how of ['na żywo', 'poprawką w rytuale'] as const)
    it(`„Nauka” ze startem 17:00:20 ${how} po „Koniec pracy” 17:00:05 jest projektem, koniec 17:00 potwierdzony`, () => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 })] }).observe('07:00', null)
      s.approve('17:15', '07:30').start('a', '16:00')
      expect(at(s, s.at('17:00') + 5_000, { a: 'workEnd' }).ok).toBe(true)
      if (how === 'na żywo') at(s, s.at('17:00') + 20_000, { a: 'start', block: 'n', confirm: true })
      else {
        at(s, s.at('17:10'), { a: 'start', block: 'n', confirm: true })
        s.end('n', '18:00')
        s.write([{ k: 'block.fix', block: 'n', at: s.at('20:00'), start: s.at('17:00') + 20_000, end: null }], s.at('20:00'))
      }
      if (how === 'na żywo') s.end('n', '18:00')
      const st = s.state('20:30')
      expect(st.asProject).toContain('n')
      expect(ends(s, '20:30')).toEqual(['17:00+'])
      expect(st.extensionMin).toBe(0)
    })

  it('blok „po końcu pracy jak projekt”, którego przebieg prośba po fakcie wycięła w całości – dzień się liczy', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '09:10', min: 30 })] }).observe('07:00', null)
    s.ran('a', '08:00', '09:00').ran('j', '09:10', '09:40')
    s.write([{ k: 'request.start', request: 'r1', at: s.at('09:05'), mode: 'after', person: null, estimateMin: null, hardEndAt: null, splits: ['j'] }, { k: 'request.end', request: 'r1', at: s.at('09:50') }], s.at('09:55'))
    const st = s.state('10:00')
    expect(st.facts.blocks.get('j')!.runs).toEqual([])
    expect(st.asProject).not.toContain('j')
  })

  it('zaparkowany wcześniej blok „po pracy” zaczęty w minucie innego zdarzenia – ten sam wynik co bez niego', () => {
    const run = (extra: boolean) => {
      // n planned at 17:10 (not „po pracy”: 10 min after a's planned end), parked at 16:40, begun early at 17:00:20.
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '17:10', min: 30 })] }).observe('07:00', null)
      s.start('a', '16:00').end('a', '16:30')
      expect(at(s, s.at('16:40'), { a: 'park', block: 'n' }).ok).toBe(true)
      if (extra) s.write([{ k: 'question.answer', at: s.at('17:00') + 10_000, question: 'break:x', answer: 'continue', value: null }], s.at('17:00') + 10_000)
      expect(at(s, s.at('17:00') + 20_000, { a: 'start', block: 'n', confirm: true }).ok).toBe(true)
      s.end('n', '17:30')
      const st = s.state('18:00')
      return { asProject: st.asProject, ends: st.ends }
    }
    const plain = run(false)
    expect(plain.asProject).toContain('n')
    expect(run(true)).toEqual(plain)
  })

  it('oba warianty sekund dają ten sam wynik – fakty składane od nowa tylko przy zdarzeniu z minuty startu zapisanym przed nim', () => {
    const run = (sec: number) => {
      const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '17:00', min: 60 })] }).observe('07:00', null)
      s.approve('17:15', '07:30').start('a', '16:00')
      at(s, s.at('17:00') + 5_000, { a: 'workEnd' })
      at(s, s.at('17:00') + sec * 1000, { a: 'start', block: 'n', confirm: true })
      s.end('n', '18:00')
      const st = s.state('18:30')
      return { asProject: st.asProject, ends: st.ends, extensionMin: st.extensionMin, workEnd: st.workEnd }
    }
    expect(run(15)).toEqual(run(45))
  })

  it('dwa komputery: start na B z zegarem 20 s z tyłu, po kliknięciu na A w kolejności logu – to praca „po” (kolejność logiczna, nie chwila)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '12:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '13:00', min: 60 })] }).observe('07:00', null)
    s.start('a', '12:00')
    expect(at(s, s.at('13:00') + 10_000, { a: 'workEnd' }).ok).toBe(true)
    const clickL = s.events.at(-1)!.l
    // B has seen the click (its logical clock is past it), but its own clock says 13:00:00.
    const t = s.at('13:00')
    const planned = { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: false, costs: null, bgCostPct: null }
    s.events.push({ id: 'pcb-0', c: 'pcb', n: 0, t, l: clickL + 1, v: RULES_VERSION, day: DATE, dom: 'timer', k: 'block.start', block: 'b', at: t, bg: false, planned, confirmUntil: null, how: 'click' } as never)
    const t2 = s.at('13:30') - 20_000
    s.events.push({ id: 'pcb-1', c: 'pcb', n: 1, t: t2, l: clickL + 2, v: RULES_VERSION, day: DATE, dom: 'timer', k: 'block.end', block: 'b', at: t2, done: true, rule: null } as never)
    expect(ends(s, '14:00')).toEqual(['13:30?'])
  })

  it('start bloku stałego zapisany przez prowadzącego po kliknięciu, z chwilą przed nim, nie jest pracą „po” kliknięciu', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '13:00', min: 120 }), block({ id: 'f', cat: 'inne', at: '14:00', min: 60, fixed: true })] }).observe('07:00', null)
    s.start('a', '13:00')
    s.write([{ k: 'work.end', at: s.at('14:00') + 30_000, end: s.at('14:00') + 30_000 }], s.at('14:00') + 30_000)
    const planned = { categoryId: 'inne', variantId: null, durationMin: 60, tag: null, fixed: true, costs: null, bgCostPct: null }
    s.write([{ id: 'auto-f-start', k: 'block.start', block: 'f', at: s.at('14:00'), bg: false, planned, confirmUntil: null, how: 'auto', autoRule: 'fixedStart' }], s.at('14:00') + 40_000)
    const f = s.state('14:05').facts
    expect(workSince(f, f.workEnds[0]!, (id) => id === 'f')).toBe(false)
  })

  it('poprawiony w rytuale start zostaje przed kliknięciem (miejsce z poprawionej chwili) – ocena dnia się nie zmienia', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '14:00', min: 120 }), block({ id: 'x', cat: 'inne', at: '15:00', min: 120, bg: true })] }).observe('07:00', null)
    s.start('a', '14:00')
    const planned = { categoryId: 'inne', variantId: null, durationMin: 120, tag: null, fixed: false, costs: null, bgCostPct: null }
    s.write([{ k: 'block.start', block: 'x', at: s.at('15:00') + 10_000, bg: true, planned, confirmUntil: null, how: 'click' }], s.at('15:00') + 10_000)
    expect(at(s, s.at('15:00') + 20_000, { a: 'workEnd' }).ok).toBe(true)
    s.end('x', '16:00')
    expect(ends(s, '16:30')).toEqual(['16:00+'])
    // The ritual corrects x's start: 15:00:05 – still before the click.
    s.write([{ k: 'block.fix', block: 'x', at: s.at('20:00'), start: s.at('15:00') + 5_000, end: null }], s.at('20:00'))
    expect(ends(s, '20:05')).toEqual(['16:00+'])
  })

  it('druga połowa przebiegu podzielonego prośbą dopisaną po fakcie to ten sam przebieg – zaczęty przed kliknięciem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'x', cat: 'inne', at: '14:00', min: 120 })] }).observe('07:00', null)
    s.start('x', '14:00').workEnd('14:30')
    s.write([{ k: 'request.start', request: 'r1', at: s.at('14:40'), mode: 'after', person: null, estimateMin: null, hardEndAt: null, splits: ['x'] }, { k: 'request.end', request: 'r1', at: s.at('14:50') }], s.at('15:10'))
    s.end('x', '15:20')
    const f = s.state('15:30').facts
    expect(f.blocks.get('x')!.runs).toHaveLength(2)
    expect(workSince(f, f.workEnds[0]!, (id) => id === 'x')).toBe(false)
  })

  it('poprawka startu przed podziałem przez prośbę obejmuje cały przebieg (obie połowy)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'x', cat: 'inne', at: '14:00', min: 120 })] }).observe('07:00', null)
    s.workEnd('14:10').start('x', '14:20')
    s.write([{ k: 'request.start', request: 'r1', at: s.at('14:40'), mode: 'after', person: null, estimateMin: null, hardEndAt: null, splits: ['x'] }, { k: 'request.end', request: 'r1', at: s.at('14:50') }], s.at('15:10'))
    s.end('x', '15:20')
    s.write([{ k: 'block.fix', block: 'x', at: s.at('20:00'), start: s.at('14:05'), end: null }], s.at('20:00'))
    const f = s.state('20:05').facts
    expect(f.blocks.get('x')!.runs).toHaveLength(2)
    expect(workSince(f, f.workEnds[0]!, (id) => id === 'x')).toBe(false)
  })

  it('dwa przełączenia tło ↔ pierwszy plan w jednej minucie (pusty przebieg) to dalej ten sam przebieg', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'g', cat: 'inne', at: '08:00', min: 120, bg: true })] }).observe('07:00', null)
    s.start('g', '08:00', { bg: true }).start('a', '08:00')
    click(s, '08:30', { a: 'workEnd' })
    s.fg('g', false, '08:40').fg('g', true, '08:40').end('g', '09:00')
    // bg 08:00–08:40, an empty foreground run in 08:40, bg 08:40–09:00.
    expect(s.state('09:30').facts.blocks.get('g')!.runs.map((r) => r.bg)).toEqual([true, false, true])
    expect(ends(s, '09:30')).toEqual(['09:00+'])
  })
})

describe('„Koniec pracy?” po pauzie, gdy wcześniejszy blok skończył się sam (G1, E8a.1)', () => {
  it('ostatnią pracą jest zapauzowany blok, nie blok zakończony progiem bezczynności – pytanie po 15 min jest (D165)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '15:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '16:55', min: 30 })] }).observe('07:00', null)
    s.approve('18:00', '07:30').start('a', '15:00')
    s.write([{ id: 'auto-a-idle', k: 'block.end', block: 'a', at: s.at('16:52'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('16:53'))
    s.start('b', '16:55').pause('b', '17:02')
    expect(workEndAsked(s, '17:10')).toBe(false)
    expect(ends(s, '17:18')).toEqual(['17:02?'])
    expect(workEndAsked(s, '17:18')).toBe(true)
  })

  it('zapauzowana „Nauka” zaczęta przed końcem pracy to ostatnia praca – pytanie po 15 min jest (jedna definicja pracy)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '16:00', min: 60 }), block({ id: 'n', cat: 'nauka', at: '16:55', min: 30 })] }).observe('07:00', null)
    s.approve('18:00', '07:30').start('a', '16:00')
    s.write([{ id: 'auto-a-idle', k: 'block.end', block: 'a', at: s.at('16:52'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('16:53'))
    s.start('n', '16:55').pause('n', '17:02')
    const st = s.state('17:18')
    expect(st.asProject).not.toContain('n')
    expect(ends(s, '17:18')).toEqual(['17:02?'])
    expect(workEndAsked(s, '17:18')).toBe(true)
  })

  it('blok, który naprawdę skończył się sam, dalej nie pyta (D165)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '15:00', min: 60 })] }).observe('07:00', null)
    s.approve('18:00', '07:30').start('a', '15:00')
    s.write([{ id: 'auto-a-idle', k: 'block.end', block: 'a', at: s.at('16:52'), done: null, rule: 'idle', autoRule: 'idle' }], s.at('16:53'))
    expect(ends(s, '17:10')).toEqual(['16:52?'])
    expect(workEndAsked(s, '17:10')).toBe(false)
  })
})

describe('„Odcinam się” i praca po „Wracam” przed granicą (A1-03)', () => {
  const plan = () => [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '10:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60 })]

  it('journaling zaczęty po „Wracam” przed granicą jest pracą, a „Odcinam się” tylko przerwą', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:50').disconnect('09:50', '10:20').start('j', '10:21')
    const st = s.state('10:40')
    expect(st.asProject).not.toContain('j')
    expect(ends(s, '10:40')).toEqual([])
  })

  it('bez pracy po „Wracam” „Odcinam się” dalej potwierdza koniec; blok „po pracy” z planu zostaje projektem', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '09:00', min: 60 }), block({ id: 'j', cat: 'journaling', at: '12:00', min: 60 })] }).observe('07:00', null)
    s.approve('17:00', '07:30').start('a', '09:00').pause('a', '09:50').disconnect('09:50', '10:20')
    expect(ends(s, '10:40')).toEqual(['09:50+'])
    s.start('j', '12:00')
    expect(s.state('12:30').asProject).toContain('j')
    expect(ends(s, '12:30')).toEqual(['09:50+'])
  })
})
