/**
 * 1.23-B – the timer of parallel blocks (D476, D493, D494): blocks begun as a group (`block.start.group`) run together; the
 * block in front costs energy, the others behind cost nothing; when the block in front ends, the one begun last takes the
 * foreground; „front” brings another block of the group to the foreground.
 */
import { describe, expect, it } from 'vitest'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const plan = () => [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '08:00', min: 120 }), block({ id: 'c', cat: 'nauka', at: '08:00', min: 90 })]

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
  if (r.ok) s.write(r.events, t)
  return r
}

/** A group begun at `time`: `front` in the foreground, the rest behind, all with the group's first block `root`. */
function startGroup(s: Scenario, time: string, front: string, rest: string[], root = 'a') {
  const t = s.at(time)
  const planned = (id: string) => {
    const p = s.opts.plan.find((b) => b.id === id)!
    return { categoryId: p.categoryId, variantId: null, durationMin: p.durationMin, fixed: false, costs: null, bgCostPct: null }
  }
  s.write([front, ...rest].map((id) => ({ k: 'block.start', block: id, at: t, bg: id !== front, planned: planned(id), confirmUntil: null, how: 'click', group: root })), t)
}

const fgOf = (s: Scenario, time: string) => timerNow(s.state(time)).fg?.info.id ?? null
const bgOf = (s: Scenario, time: string) => timerNow(s.state(time)).bg.map((b) => b.info.id).sort()
const energyAt = (s: Scenario, time: string) => s.energy(time).now

describe('grupa równoległa w timerze (D476, D493)', () => {
  it('kliknięty na pierwszym planie, reszta w tle; koniec pierwszego planu – przejmuje ostatnio zaczęty', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    startGroup(s, '08:00', 'a', ['b'])
    s.write([{ k: 'block.start', block: 'c', at: s.at('08:10'), bg: true, planned: { categoryId: 'nauka', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click', group: 'a' }], s.at('08:10'))
    expect(fgOf(s, '08:20')).toBe('a')
    expect(bgOf(s, '08:20')).toEqual(['b', 'c'])
    click(s, '08:30', { a: 'finish', block: 'a' })
    // c began after b: it takes the foreground.
    expect(fgOf(s, '08:31')).toBe('c')
    expect(timerNow(s.state('08:31')).fg!.bg).toBe(false)
    expect(bgOf(s, '08:31')).toEqual(['b'])
    click(s, '08:40', { a: 'finish', block: 'c' })
    expect(fgOf(s, '08:41')).toBe('b')
  })

  it('pauza bloku z pierwszego planu: on czeka na „Wznów”, a pierwszy plan ma blok grupy, który biegnie (T1191)', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    startGroup(s, '08:00', 'a', ['b'])
    click(s, '08:20', { a: 'pause' })
    const t = timerNow(s.state('08:21'))
    expect(t.paused.map((p) => p.info.id)).toEqual(['a'])
    // Only the block behind runs: it is in front meanwhile.
    expect(t.fg?.info.id ?? null).toBe('b')
  })

  it('energię kosztuje tylko blok z pierwszego planu; blok grupy w tle – nic (D476)', () => {
    const alone = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null).checkin('07:30', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    alone.start('a', '08:00')
    const grouped = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null).checkin('07:30', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    startGroup(grouped, '08:00', 'a', ['b'])
    const aside = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null).checkin('07:30', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    aside.start('a', '08:00').start('b', '08:00', { bg: true })
    expect(energyAt(grouped, '08:40')).toEqual(energyAt(alone, '08:40'))
    expect(energyAt(aside, '08:40')).not.toEqual(energyAt(alone, '08:40'))
  })

  it('po końcu pierwszego planu blok, który przejął, kosztuje jak na pierwszym planie (D493)', () => {
    const grouped = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null).checkin('07:30', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    startGroup(grouped, '08:00', 'a', ['b'])
    grouped.end('a', '08:30')
    const handed = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null).checkin('07:30', { head: [2, 2], emotions: [2, 2], senses: [2, 2] })
    handed.start('a', '08:00').end('a', '08:30').start('b', '08:30')
    expect(energyAt(grouped, '09:10')).toEqual(energyAt(handed, '09:10'))
  })
})

describe('zmiana pierwszego planu w grupie (D494)', () => {
  it('„front” stawia wybrany blok grupy z tła na pierwszym planie, a poprzedni idzie w tło grupy', () => {
    const s = new Scenario({ date: DATE, plan: plan() }).observe('07:00', null)
    startGroup(s, '08:00', 'a', ['b', 'c'])
    const r = click(s, '08:20', { a: 'front', block: 'c' })
    expect(r.ok && r.events.map((e) => [e.k, e.block, e.bg])).toEqual([
      ['block.fg', 'a', true],
      ['block.fg', 'c', false]
    ])
    expect(fgOf(s, '08:21')).toBe('c')
    expect(bgOf(s, '08:21')).toEqual(['a', 'b'])
  })

  it('odmawia: blok spoza grupy w tle, blok, który nie biegnie, i blok spoza grupy na pierwszym planie', () => {
    const s = new Scenario({ date: DATE, plan: [...plan(), block({ id: 'x', cat: 'inne', at: '08:00', min: 60, bg: true })] }).observe('07:00', null)
    startGroup(s, '08:00', 'a', ['b'])
    s.start('x', '08:00', { bg: true })
    expect(click(s, '08:10', { a: 'front', block: 'x' })).toMatchObject({ ok: false })
    expect(click(s, '08:10', { a: 'front', block: 'c' })).toMatchObject({ ok: false })
    click(s, '08:15', { a: 'finish', block: 'a' })
    // An outside block started in front while b runs behind.
    s.start('c', '08:20')
    expect(click(s, '08:25', { a: 'front', block: 'b' })).toMatchObject({ ok: false })
  })
})
