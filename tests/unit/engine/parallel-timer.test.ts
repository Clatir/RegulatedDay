/**
 * 1.23-B – the timer of parallel blocks (D476, D493, D494): blocks begun as a group (`block.start.group`) run together; the
 * block in front costs energy, the others behind cost nothing; when the block in front ends, the one begun last takes the
 * foreground; „front” brings another block of the group to the foreground.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, type AutoEvent } from '@shared/engine/auto'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { autoText, engineView } from '@shared/engineView'
import { requestAction } from '@shared/engine/requests'
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

describe('grupa – poprawki po przeglądzie (T1195, T1200–T1207)', () => {
  const beside = (b: ReturnType<typeof block>, root: string) => ({ ...b, alongside: root })
  const groupPlan = () => [
    block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
    beside(block({ id: 'b', cat: 'nauka', at: '08:00', min: 120 }), 'a'),
    beside(block({ id: 'c', cat: 'inne', at: '08:00', min: 120 }), 'a'),
    block({ id: 'd', cat: 'inne', at: '10:30', min: 30 })
  ]
  const day = (plan = groupPlan()) => new Scenario({ date: DATE, plan }).observe('07:00', null)

  it('prośba: z przodu nikt nie przejmuje, a po niej wraca przerwany blok (T1200)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const t1 = s.at('08:10')
    const req = requestAction(s.stateAt(t1), { a: 'requestNow', request: 'q', person: null }, t1)
    if (!req.ok) throw new Error(req.why)
    s.write(req.events, t1)
    expect(fgOf(s, '08:15')).toBeNull()
    const t2 = s.at('08:20')
    const end = requestAction(s.stateAt(t2), { a: 'requestEnd', request: 'q' }, t2)
    if (!end.ok) throw new Error(end.why)
    s.write(end.events, t2)
    expect(fgOf(s, '08:21')).toBe('a')
  })

  it('„Odcinam się” pauzuje całą grupę; „Koniec pracy” kończy też pracę grupy w tle (T1202, T1203)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    const cut = click(s, '08:10', { a: 'cutOff' })
    expect(cut.ok && cut.events.filter((e) => e.k === 'block.pause').map((e) => e.block).sort()).toEqual(['a', 'b', 'c'])
    const w = day()
    click(w, '08:00', { a: 'start', block: 'a' })
    const end = click(w, '08:20', { a: 'workEnd' })
    expect(end.ok && end.events.filter((e) => e.k === 'block.end').map((e) => e.block).sort()).toEqual(['a', 'b', 'c'])
  })

  it('cała grupa zapauzowana czeka na „Wznów”; „Zacznij” na jednym z nich stawia go z przodu, resztę w tle (T1201)', () => {
    const s = day()
    click(s, '08:00', { a: 'start', block: 'a' })
    click(s, '08:15', { a: 'start', block: 'd' })
    click(s, '08:30', { a: 'finish', block: 'd' })
    expect(timerNow(s.state('08:31')).paused.map((p) => p.info.id).sort()).toEqual(['a', 'b', 'c'])
    expect(click(s, '08:35', { a: 'start', block: 'b' }).ok).toBe(true)
    expect(fgOf(s, '08:36')).toBe('b')
    expect(bgOf(s, '08:36')).toEqual(['a', 'c'])
  })

  it('blok stały z przodu grupy i „Zacznij” na bloku spoza grupy: stały idzie w tło, reszta grupy pauzuje (T1195)', () => {
    const plan = [block({ id: 'f', cat: 'zajecia-zdalne', at: '08:00', min: 60, fixed: true }), beside(block({ id: 'n', cat: 'nauka', at: '08:00', min: 60 }), 'f'), block({ id: 'x', cat: 'inne', at: '10:00', min: 30 })]
    const s = day(plan)
    leader(s, '08:00')
    const r = click(s, '08:10', { a: 'start', block: 'x' })
    expect(r.ok && r.events.map((e) => [e.k, e.block])).toEqual([
      ['block.fg', 'f'],
      ['block.pause', 'n'],
      ['block.start', 'x']
    ])
  })

  it('blok stały zaczyna się sam nad biegnącą grupą: pauzuje cała grupa (T1195)', () => {
    const plan = [...groupPlan(), block({ id: 'f', cat: 'zajecia-zdalne', at: '08:30', min: 60, fixed: true })]
    const s = day(plan)
    click(s, '08:00', { a: 'start', block: 'a' })
    const out = leader(s, '08:30')
    expect(out.filter((e) => e.k === 'block.pause').map((e) => e.block).sort()).toEqual(['a', 'b', 'c'])
  })

  it('„+K w tle” tylko bloki grupy z przodu: blok stały grupy za blokiem spoza grupy się nie liczy, „front” odmawia (T1206)', () => {
    const plan = [block({ id: 'f', cat: 'zajecia-zdalne', at: '08:00', min: 60, fixed: true }), beside(block({ id: 'n', cat: 'nauka', at: '08:00', min: 60 }), 'f'), block({ id: 'x', cat: 'inne', at: '10:00', min: 30 })]
    const s = day(plan)
    leader(s, '08:00')
    click(s, '08:10', { a: 'start', block: 'x' })
    const t = s.at('08:15')
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const care = { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Blok', care, modePrefs: { sessionMode: true, classMode: true }, pending: null })
    expect(v.background.map((b) => [b.id, b.group ?? false])).toEqual([['f', false]])
    expect(click(s, '08:16', { a: 'front', block: 'f' })).toMatchObject({ ok: false })
  })

  it('cofnięcie startu bloku bez komputera albo późniejszy log cofa też starty reszty grupy (T1204)', () => {
    const plan = [block({ id: 'p', cat: 'posilek', at: '13:00', min: 30 }), beside(block({ id: 'r', cat: 'regeneracja', at: '13:00', min: 30 }), 'p')]
    const s = day(plan).gap('12:50', null)
    const [lead] = leader(s, '13:10')
    const r = click(s, '13:12', { a: 'undo', target: lead!.id })
    expect(r.ok && r.events.length).toBe(2)
    expect(fgOf(s, '13:13')).toBeNull()
    expect(bgOf(s, '13:13')).toEqual([])
  })

  it('wznowiony blok grupy zaczęty sam: bez drugiego wiersza na liście (T1204)', () => {
    const plan = [block({ id: 'f', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true }), beside(block({ id: 'n', cat: 'nauka', at: '09:00', min: 60 }), 'f')]
    const s = day(plan)
    click(s, '08:30', { a: 'start', block: 'n' })
    click(s, '08:40', { a: 'pause' })
    leader(s, '09:00')
    const rows = s.state('09:01').facts.autos.filter((a) => a.rule === 'groupStart')
    expect(rows.map((a) => [a.k, a.block])).toEqual([['block.resume', 'n']])
  })

  it('praca grupy po granicy: koszt drugiego kliknięcia także z bloku obok; zaczęta sama – blok pracy czeka (T1205)', () => {
    const plan = [block({ id: 'm', cat: 'posilek', at: '18:00', min: 30 }), beside(block({ id: 'w', cat: 'inne', at: '18:00', min: 60 }), 'm')]
    const s = day(plan)
    s.approve('17:00', '07:30')
    const first = click(s, '18:00', { a: 'start', block: 'm' })
    expect(first).toMatchObject({ ok: false, confirm: { block: 'w' } })
    const second = click(s, '18:00', { a: 'start', block: 'm', confirm: true })
    expect(second.ok && second.events.find((e) => e.block === 'w')?.confirmUntil).toBe(s.at('19:00'))
    const away = day(plan).gap('17:50', null)
    away.approve('17:00', '07:30')
    expect(leader(away, '18:10').map((e) => e.block)).toEqual(['m'])
  })

  it('prognoza: biegnąca grupa trzyma pierwszy plan do końca najdłuższego bloku (T1207)', () => {
    const s = day([...groupPlan().filter((b) => b.id !== 'd'), block({ id: 'd', cat: 'inne', at: '09:00', min: 30 })])
    click(s, '08:00', { a: 'start', block: 'a' })
    const st = s.state('08:10')
    const d = st.forecast.find((p) => p.block.id === 'd')!
    expect(d.from).toBeGreaterThanOrEqual(st.forecast.find((p) => p.block.id === 'b')!.to)
  })

  it('energia: z przodu ten sam blok co w timerze (ta sama kolejność startu, T1191)', () => {
    const checkin: Parameters<Scenario['checkin']>[1] = { head: [2, 2], emotions: [2, 2], senses: [2, 2] }
    const s = day().checkin('07:30', checkin)
    click(s, '08:00', { a: 'start', block: 'b' })
    s.end('b', '08:20')
    expect(fgOf(s, '08:21')).toBe('c')
    const front = (id: string) => new Scenario({ date: DATE, plan: groupPlan() }).observe('07:00', null).checkin('07:30', checkin).start('b', '08:00').end('b', '08:20').start(id, '08:20')
    // The cost a minute after the hand-over: c's (inne), not a's (analiza) – the one-off switch aside.
    const slope = (x: Scenario) => x.energy('08:40').now!.head - x.energy('08:30').now!.head
    expect(slope(s)).toBe(slope(front('c')))
    expect(slope(s)).not.toBe(slope(front('a')))
  })
})

describe('grupa z blokiem stałym albo sesją (T1208)', () => {
  it('„Zacznij” na bloku grupy przed godziną bloku stałego obok: stały nie zaczyna się wcześniej, sesja – tylko swoim „Zacznij”', () => {
    const plan = [block({ id: 'f', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true }), { ...block({ id: 'n', cat: 'nauka', at: '09:00', min: 60 }), alongside: 'f' }, { ...block({ id: 's', cat: 'sesja', at: '09:00', min: 60, fixed: true }), alongside: 'f' }]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const early = click(s, '08:30', { a: 'start', block: 'n' })
    expect(early.ok && early.events.map((e) => e.block)).toEqual(['n'])
    const t = timerAction(s.contextAt(s.at('09:05')), s.stateAt(s.at('09:05')), { a: 'start', block: 'f' }, s.at('09:05'))
    expect(t.ok && t.events.map((e) => e.block)).not.toContain('s')
  })
})

describe('grupa – poprawki po drugim przeglądzie (T1206, T1209)', () => {
  const beside = (b: ReturnType<typeof block>, root: string) => ({ ...b, alongside: root })
  const checkin: Parameters<Scenario['checkin']>[1] = { head: [2, 2], emotions: [2, 2], senses: [2, 2] }
  const day = (plan: ReturnType<typeof block>[]) => new Scenario({ date: DATE, plan }).observe('07:00', null)
  const groupABC = () => [block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), beside(block({ id: 'b', cat: 'nauka', at: '08:00', min: 120 }), 'a'), beside(block({ id: 'c', cat: 'inne', at: '08:00', min: 120 }), 'a')]
  const fixedGroup = () => [block({ id: 'f', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true }), beside(block({ id: 'n', cat: 'nauka', at: '09:00', min: 60 }), 'f')]

  it('blok stały tej samej grupy zaczyna się obok niej, niczego nie pauzuje', () => {
    const s = day(fixedGroup())
    click(s, '08:30', { a: 'start', block: 'n' })
    const out = leader(s, '09:00')
    expect(out.map((e) => [e.k, e.block, e.bg])).toEqual([['block.start', 'f', true]])
    expect(fgOf(s, '09:01')).toBe('n')
    expect(bgOf(s, '09:01')).toEqual(['f'])
  })

  it('„Cofnij” startu bloku bez komputera nie zabiera bloku grupy, który Ty już skończyłeś', () => {
    const s = day([block({ id: 'p', cat: 'posilek', at: '13:00', min: 30 }), beside(block({ id: 'r', cat: 'regeneracja', at: '13:00', min: 30 }), 'p')]).gap('12:50', null)
    const [lead] = leader(s, '13:10')
    click(s, '13:12', { a: 'finish', block: 'r' })
    const r = click(s, '13:13', { a: 'undo', target: lead!.id })
    expect(r.ok && r.events.map((e) => e.target)).toEqual([lead!.id])
    expect(s.state('13:14').facts.blocks.get('r')?.startedAt).not.toBeNull()
    expect(s.state('13:14').facts.problems).toEqual([])
  })

  it('„Cofnij” startu bloku stałego wraca całą grupę, nie tylko blok z przodu', () => {
    const s = day([...groupABC(), block({ id: 'f', cat: 'zajecia-zdalne', at: '08:30', min: 60, fixed: true })])
    click(s, '08:00', { a: 'start', block: 'a' })
    const out = leader(s, '08:30')
    const fStart = out.find((e) => e.k === 'block.start' && e.block === 'f')!
    const r = click(s, '08:35', { a: 'undo', target: fStart.id })
    expect(r.ok && r.events.length).toBe(4)
    expect(fgOf(s, '08:36')).toBe('a')
    expect(bgOf(s, '08:36')).toEqual(['b', 'c'])
  })

  it('prognoza energii po przejęciu: z przodu ten sam blok co timer', () => {
    const s = day(groupABC()).checkin('07:30', checkin)
    click(s, '08:00', { a: 'start', block: 'b' })
    s.end('b', '08:20')
    const cFront = day(groupABC()).checkin('07:30', checkin).start('b', '08:00').end('b', '08:20').start('c', '08:20')
    const slope = (x: Scenario) => {
      const e = x.energy('08:25').series.head
      return e[(8 - 4) * 60 + 50]! - e[(8 - 4) * 60 + 30]!
    }
    expect(slope(s)).toBe(slope(cFront))
  })

  it('blok stały grupy w tle za prośbą kosztuje pełno, jak każdy stały', () => {
    const run = (plan: ReturnType<typeof block>[]) => {
      const s = day(plan).checkin('07:30', checkin)
      leader(s, '09:00')
      const t = s.at('09:10')
      const req = requestAction(s.stateAt(t), { a: 'requestNow', request: 'q', person: null }, t)
      if (!req.ok) throw new Error(req.why)
      s.write(req.events, t)
      return s.energy('09:40').now!.head - s.energy('09:20').now!.head
    }
    expect(run(fixedGroup())).toBe(run([fixedGroup()[0]!]))
  })

  it('blok stały grupy w tle za blokiem spoza grupy kosztuje jak stały w tle (T1206)', () => {
    const outside = block({ id: 'x', cat: 'inne', at: '11:00', min: 30 })
    const run = (plan: ReturnType<typeof block>[]) => {
      const s = day(plan).checkin('07:30', checkin)
      leader(s, '09:00')
      click(s, '09:10', { a: 'start', block: 'x' })
      // The minutes gone by (the forecast of „now” differs by the paused block of the group to come).
      const e = s.energy('09:50').series.head
      return e[(9 - 4) * 60 + 40]! - e[(9 - 4) * 60 + 20]!
    }
    expect(run([...fixedGroup(), outside])).toBe(run([fixedGroup()[0]!, outside]))
  })

  it('koszt grupy: zaparkowany blok obok nie pyta; „Dalej” i „Wznów” pytają o pracę grupy po granicy', () => {
    const plan = [block({ id: 'x', cat: 'inne', at: '17:30', min: 30 }), block({ id: 'm', cat: 'posilek', at: '18:00', min: 30 }), beside(block({ id: 'w', cat: 'inne', at: '18:00', min: 60 }), 'm')]
    const parked = day(plan)
    parked.approve('17:00', '07:30').raw({ k: 'block.park', block: 'w', at: parked.at('17:00'), rule: 'user' }, '17:00')
    expect(click(parked, '18:00', { a: 'start', block: 'm' }).ok).toBe(true)
    const next = day(plan)
    next.approve('17:00', '07:30')
    click(next, '17:30', { a: 'start', block: 'x', confirm: true })
    expect(click(next, '18:00', { a: 'next' })).toMatchObject({ ok: true, confirm: { block: 'w' } })
    const resume = day(plan)
    resume.approve('17:00', '07:30')
    click(resume, '18:00', { a: 'start', block: 'm', confirm: true })
    click(resume, '18:05', { a: 'cutOff' })
    click(resume, '18:10', { a: 'back' })
    expect(click(resume, '18:12', { a: 'start', block: 'm' })).toMatchObject({ ok: false, confirm: { block: 'w' } })
  })
})
