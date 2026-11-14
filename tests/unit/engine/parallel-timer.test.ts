/**
 * 1.23-B – the timer of parallel blocks (D476, D493, D494): blocks begun as a group (`block.start.group`) run together; the
 * block in front costs energy, the others behind cost nothing; when the block in front ends, the one begun last takes the
 * foreground; „front” brings another block of the group to the foreground.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, type AutoEvent } from '@shared/engine/auto'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { autoText } from '@shared/engineView'
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

function leader(s: Scenario, time: string): AutoEvent[] {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
  s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
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

describe('start i koniec grupy z planu (D493, D499)', () => {
  const beside = (b: ReturnType<typeof block>, root: string) => ({ ...b, alongside: root })
  /** a (analiza 60) + b (nauka 90, obok a) + c (inne 30, obok a) o 08:00; potem d o 10:00 i blok stały f o 12:00. */
  const groupPlan = () => [
    block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
    beside(block({ id: 'b', cat: 'nauka', at: '08:00', min: 90 }), 'a'),
    beside(block({ id: 'c', cat: 'inne', at: '08:00', min: 30 }), 'a'),
    block({ id: 'd', cat: 'inne', at: '10:00', min: 30 })
  ]
  const day = (plan = groupPlan()) => new Scenario({ date: DATE, plan }).observe('07:00', null)

  it('„Zacznij” na bloku grupy zaczyna całą grupę: kliknięty na pierwszym planie, reszta w tle (T1193)', () => {
    const s = day()
    const r = click(s, '08:00', { a: 'start', block: 'b' })
    expect(r.ok && r.events.map((e) => [e.k, e.block, e.bg, e.group])).toEqual([
      ['block.start', 'b', false, 'a'],
      ['block.start', 'a', true, 'a'],
      ['block.start', 'c', true, 'a']
    ])
    expect(fgOf(s, '08:10')).toBe('b')
    expect(bgOf(s, '08:10')).toEqual(['a', 'c'])
  })

  it('cała grupa także ponad limit bloków naraz (D499, pytanie 5)', () => {
    const plan = [...groupPlan(), beside(block({ id: 'e', cat: 'inne', at: '08:00', min: 30 }), 'a'), beside(block({ id: 'g', cat: 'inne', at: '08:00', min: 30 }), 'a')]
    const s = day(plan)
    const r = click(s, '08:00', { a: 'start', block: 'a' })
    expect(r.ok && r.events.filter((e) => e.k === 'block.start').map((e) => e.block)).toEqual(['a', 'b', 'c', 'e', 'g'])
  })

  it('blok grupy w tle kończy się sam o planowanym końcu, pierwszy plan biegnie dalej (D499, T1198)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'b' })
    expect(leader(s, '08:29')).toEqual([])
    expect(leader(s, '08:30')).toMatchObject([{ k: 'block.end', block: 'c', at: s.at('08:30'), done: true, autoRule: 'groupPlan' }])
    expect(fgOf(s, '08:31')).toBe('b')
    const a = s.state('08:31').facts.autos.find((x) => x.rule === 'groupPlan')!
    expect(autoText(a, 'Inne obowiązki', '08:30')).toBe('Inne obowiązki skończony o 08:30 (według planu, w tle grupy)')
  })

  it('„Dalej” na pierwszym planie, gdy grupa biegnie: kończy go, przejmuje ostatnio zaczęty, następny blok planu się nie zaczyna (D499, T1196)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'c' })
    const r = click(s, '08:20', { a: 'next' })
    expect(r.ok && r.events.map((e) => [e.k, e.block])).toEqual([['block.end', 'c']])
    expect(['a', 'b']).toContain(fgOf(s, '08:21'))
    expect(timerNow(s.state('08:21')).fg!.info.id).not.toBe('d')
  })

  it('„Zacznij” na bloku spoza grupy: cała grupa pauzuje niedokończona i staje na miejscu klikniętego (D499, T1195)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const r = click(s, '08:15', { a: 'start', block: 'd' })
    expect(r.ok && r.events.map((e) => [e.k, e.block, e.place ?? null])).toEqual([
      ['block.pause', 'a', s.at('10:00')],
      ['block.pause', 'b', s.at('10:00')],
      ['block.pause', 'c', s.at('10:00')],
      ['block.start', 'd', null]
    ])
    expect(fgOf(s, '08:16')).toBe('d')
    expect(bgOf(s, '08:16')).toEqual([])
  })

  it('„Zacznij” na innym bloku tej samej grupy, który biegnie w tle – odmowa; na niezaczętym bloku grupy – on z przodu, reszta w tle (T1194)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    expect(click(s, '08:05', { a: 'start', block: 'b' })).toMatchObject({ ok: false })
    expect(click(s, '08:05', { a: 'front', block: 'b' }).ok).toBe(true)
    expect(fgOf(s, '08:06')).toBe('b')
  })

  it('blok stały grupy zaczyna się sam i zaczyna całą grupę (D499, pytanie 3, T1197)', () => {
    const plan = [block({ id: 'f', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true }), beside(block({ id: 'n', cat: 'nauka', at: '09:00', min: 45 }), 'f')]
    const s = day(plan)
    const out = leader(s, '09:00')
    expect(out.map((e) => [e.k, e.block, e.autoRule, e.bg, e.group])).toEqual([
      ['block.start', 'f', 'fixedStart', false, 'f'],
      ['block.start', 'n', 'groupStart', true, 'f']
    ])
    const a = s.state('09:01').facts.autos.find((x) => x.rule === 'groupStart')!
    expect(autoText(a, 'Nauka', '09:00')).toBe('Nauka zaczęty o 09:00 (razem z grupą)')
  })

  it('blok bez komputera grupy zaczyna się sam i zaczyna całą grupę (D475, D499, T1197)', () => {
    const plan = [block({ id: 'p', cat: 'posilek', at: '13:00', min: 30 }), beside(block({ id: 'r', cat: 'regeneracja', at: '13:00', min: 30 }), 'p')]
    const s = day(plan).gap('12:50', null)
    expect(leader(s, '13:10').map((e) => [e.block, e.autoRule, e.bg])).toEqual([
      ['p', 'awayStart', false],
      ['r', 'groupStart', true]
    ])
  })

  it('praca i budżet liczą się raz na minutę, choć biegną dwa bloki pracy (D476)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const solo = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 })] }).observe('07:00', null)
    click(solo, '08:00', { a: 'start', block: 'a' })
    expect(s.state('08:40').budgetUsedMin).toBe(solo.state('08:40').budgetUsedMin)
  })
})

describe('prognoza energii grupy, która się jeszcze nie zaczęła (D476, T1199)', () => {
  it('bloki grupy w tle prognozy nic nie kosztują – jak sam blok z pierwszego planu', () => {
    const checkin: Parameters<Scenario['checkin']>[1] = { head: [2, 2], emotions: [2, 2], senses: [2, 2] }
    const mk = (plan: ReturnType<typeof block>[]) => new Scenario({ date: DATE, plan }).observe('07:00', null).checkin('07:30', checkin)
    const a = block({ id: 'a', cat: 'analiza', at: '10:00', min: 60 })
    const grouped = mk([a, { ...block({ id: 'b', cat: 'nauka', at: '10:00', min: 60 }), alongside: 'a' }])
    const solo = mk([a])
    // 11:00 – after the group (index from 04:00).
    const at11 = (s: Scenario) => { const e = s.energy('08:00').series; return [e.head[7 * 60], e.emotions[7 * 60], e.senses[7 * 60]] }
    expect(at11(grouped)).toEqual(at11(solo))
  })
})
