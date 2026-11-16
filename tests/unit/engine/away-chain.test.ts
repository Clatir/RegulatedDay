/**
 * 1.30.0 – „Bloki poza komputerem jednym ciągiem” (D553–D556, T1962–T1966): with the setting on, a block away from the
 * computer ends at the return, at the latest at its planned end (done, without a question), and the next one begins by
 * itself at once; „Cofnij” of such an end takes back what the app began after it before your return.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, awayKnownAt, nextCheckAt, questionsOf, type AutoEvent } from '@shared/engine/auto'
import { timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { ritualRows } from '@shared/engine/ritual'
import { autoText, engineView } from '@shared/engineView'
import { settingsFrom } from '@shared/model/settings'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday
const MIN = 60_000

const day = (plan: ReturnType<typeof block>[], chain = true) => new Scenario({ date: DATE, plan, settings: { awayChain: chain } })
/** At a computer from 07:00, without input from `away` (to `back`, or still). */
const used = (plan: ReturnType<typeof block>[], away: string, back: string | null = null, chain = true) => day(plan, chain).observe('07:00', null).gap(away, back)

function click(s: Scenario, time: string, act: TimerAction) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const r = timerAction(ctx, state, act, t, activityOf(ctx.events, state.grid.start, t, 'pca'))
  if (r.ok) s.write(r.events, t)
  return r
}

function leader(s: Scenario, time: string): AutoEvent[] {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
  s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
}

/** The leader every minute from `from` to `to` (both included): what it wrote, as „rule block HH:MM”. */
function run(s: Scenario, from: string, to: string): string[] {
  const out: string[] = []
  const clock = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
  for (let t = s.at(from); t <= s.at(to); t += MIN) {
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    const list = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t })
    s.write(list, t)
    for (const e of list) if (e.autoRule !== 'boundary') out.push(`${e.autoRule} ${e.block ?? '-'} ${clock(e.at)}`)
  }
  return out
}

function questions(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  return questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t })
}

function autoList(s: Scenario, time: string) {
  const t = s.at(time)
  const ctx = s.contextAt(t)
  const state = s.stateAt(t)
  const care = { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }
  const view = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Blok', care, modePrefs: { sessionMode: true, classMode: true }, pending: null })
  return view.autos
}

const meal = () => block({ id: 'm', cat: 'posilek', at: '12:00', min: 30 })
const walk = (at = '12:30') => block({ id: 'w', cat: 'regeneracja', at, min: 60 })

describe('ustawienie „jednym ciągiem” (D553)', () => {
  it('jest domyślnie wyłączone, a ustawienia czytają je z rd.json', () => {
    expect(settingsFrom({}).awayChain).toBe(false)
    expect(settingsFrom({ awayChain: true }).awayChain).toBe(true)
    expect(settingsFrom({ awayChain: 'tak' }).awayChain).toBe(false)
  })

  it('wyłączone – jak dotąd: posiłek trwa do limitu, spacer zaczyna się od niego i kończy przy powrocie, z pytaniem', () => {
    const s = used([meal(), walk()], '11:50', '14:00', false)
    expect(run(s, '11:55', '14:05')).toEqual(['awayStart m 12:00', 'limit m 13:00', 'awayStart w 13:00', 'firstUse w 14:00'])
  })
})

describe('ciąg bloków poza komputerem (D553, D554)', () => {
  it('każdy blok kończy się o planowanym końcu, następny zaczyna się od razu, ostatni też według planu', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    expect(run(s, '11:55', '14:01')).toEqual(['awayStart m 12:00', 'awayChain m 12:30', 'awayStart w 12:30', 'awayChain w 13:30'])
    const st = s.state('14:02')
    expect(st.facts.blocks.get('m')).toMatchObject({ endedAt: st.facts.blocks.get('w')!.startedAt, finished: true })
    expect(st.facts.blocks.get('w')).toMatchObject({ finished: true })
    expect(timerNow(st).fg).toBeNull()
  })

  it('po powrocie po całym ciągu – bez pytania; starty i końce na liście z „Cofnij” (D555)', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '14:01')
    expect(questions(s, '14:02').filter((q) => q.kind === 'return')).toEqual([])
    const end = s.state('14:02').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(autoText(end, 'Posiłek', '12:30')).toBe('Posiłek skończony o 12:30 (według planu, jednym ciągiem)')
    const list = autoList(s, '14:02')
    const items = [...list.groups.flatMap((g) => g.items), ...list.items]
    expect(items.filter((x) => /jednym ciągiem/.test(x.text)).map((x) => x.undo)).toEqual([true, true])
  })

  it('rytuał nie ma wiersza o końcu według planu (T1965); koniec limitem bez ustawienia – ma', () => {
    const on = used([meal(), walk()], '11:50', '14:00')
    run(on, '11:55', '14:01')
    const st = on.state('14:02')
    expect(ritualRows(st, activityOf(on.contextAt(on.at('14:02')).events, st.grid.start, on.at('14:02'))).filter((r) => r.kind === 'away')).toEqual([])
    const off = used([meal(), walk()], '11:50', '14:00', false)
    run(off, '11:55', '14:05')
    const so = off.state('14:06')
    expect(ritualRows(so, activityOf(off.contextAt(off.at('14:06')).events, so.grid.start, off.at('14:06'))).filter((r) => r.kind === 'away')).toHaveLength(1)
  })

  it('sprawy domowe, rutyna i prośby domowe też idą ciągiem', () => {
    const s = used([block({ id: 'r', cat: 'rutyny', at: '12:00', min: 20 }), block({ id: 'h', cat: 'sprawy', at: '12:20', min: 40 }), block({ id: 'q', cat: 'prosby', at: '13:00', min: 15 })], '11:50', '14:00')
    expect(run(s, '11:55', '14:01')).toEqual(['awayStart r 12:00', 'awayChain r 12:20', 'awayStart h 12:20', 'awayChain h 13:00', 'awayStart q 13:00', 'awayChain q 13:15'])
  })

  it('blok stały po ciągu zaczyna się o swojej godzinie', () => {
    const s = used([meal(), block({ id: 'f', cat: 'regeneracja', at: '12:30', min: 30, fixed: true })], '11:50', '14:00')
    const out = run(s, '11:55', '14:01')
    // One pass: the fixed start does not wait for an end at its start (T1137).
    expect(out.slice(0, 3).sort()).toEqual(['awayChain m 12:30', 'awayStart m 12:00', 'fixedStart f 12:30'])
  })

  it('powrót w trakcie bloku kończy go przy powrocie, z krótkim pytaniem (D554)', () => {
    const s = used([meal(), walk()], '11:50', '13:00')
    expect(run(s, '11:55', '13:02')).toEqual(['awayStart m 12:00', 'awayChain m 12:30', 'awayStart w 12:30', 'firstUse w 13:00'])
    expect(questions(s, '13:03').filter((q) => q.kind === 'return').map((q) => q.block)).toEqual(['w'])
  })

  it('przerwa w planie między blokami: następny zaczyna się o swojej godzinie', () => {
    const s = used([meal(), walk('12:45')], '11:50', '14:00')
    expect(run(s, '11:55', '14:01')).toEqual(['awayStart m 12:00', 'awayChain m 12:30', 'awayStart w 12:45', 'awayChain w 13:45'])
  })

  it('blok zaczęty kliknięciem też kończy się według planu', () => {
    const s = day([meal(), walk()]).observe('07:00', null)
    click(s, '12:00', { a: 'start', block: 'm' })
    s.gap('12:00', '14:00')
    expect(run(s, '12:01', '14:01')).toEqual(['awayChain m 12:30', 'awayStart w 12:30', 'awayChain w 13:30'])
  })

  it('blok za porą snu kończy się najpóźniej o porze snu', () => {
    const s = used([block({ id: 'e', cat: 'posilek', at: '21:45', min: 30 })], '21:30')
    expect(run(s, '21:40', '22:30')).toEqual(['awayStart e 21:45', 'awayChain e 22:00'])
  })

  it('pierwszy blok ciągu: odejście sprzed jego godziny wystarcza po 2 min (T1963)', () => {
    const x = { from: 0, to: 15 * MIN }
    expect(awayKnownAt(x, 10 * MIN, 10 * MIN)).toBe(12 * MIN)
    expect(awayKnownAt(x, 10 * MIN, null)).toBeNull()
    // Left only 3 min before: still 10 min of the stretch first.
    expect(awayKnownAt({ from: 7 * MIN, to: 30 * MIN }, 10 * MIN, 10 * MIN)).toBe(17 * MIN)
    // Back within 2 min of the hour: it does not begin.
    expect(awayKnownAt({ from: 0, to: 11 * MIN }, 10 * MIN, 10 * MIN)).toBeNull()
    // Left after the chain's end (you came back in between): its 10 min, from the hour (T1969).
    expect(awayKnownAt({ from: 12 * MIN, to: 40 * MIN }, 15 * MIN, 10 * MIN)).toBe(25 * MIN)
  })

  it('późniejszy log z wejściem w czasie bloku cofa koniec według planu – koniec przy pierwszym użyciu (T465)', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '12:31')
    // The other computer's log shows a use at 12:20 (after more than 2 min without input).
    s.observe('12:20', '12:21', 'pcb').using('12:20', '12:21', 'pcb')
    // The undo and the new end in the same pass (T1966); the walk begins at its hour, never beside the meal.
    expect(leader(s, '12:32').map((e) => e.autoRule)).toEqual(['awayStart', 'revalidate', 'firstUse'])
    const st = s.state('12:33')
    expect(st.facts.blocks.get('m')).toMatchObject({ endRule: 'firstUse', endedAt: st.facts.blocks.get('m')!.startedAt! + 20 })
    expect(timerNow(st).fg?.info.id).toBe('w')
    expect(run(s, '12:33', '12:40')).toEqual([])
  })
})

describe('„Cofnij” końca według planu (D555, T1964)', () => {
  it('cofa też bloki zaczęte po nim przed powrotem; blok trwa dalej według zwykłych reguł', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '14:01')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    const r = click(s, '14:05', { a: 'undo', target: end.id })
    expect(r.ok).toBe(true)
    const st = s.state('14:06')
    expect(st.facts.blocks.get('w')?.startedAt ?? null).toBeNull()
    // The meal: back at 14:00, after its limit (12:00 + 30 + 30 min) – it ended at the limit; the walk does not start again.
    expect(run(s, '14:06', '14:30')).toEqual(['limit m 13:00'])
  })

  it('blok zaczęty przez Ciebie po powrocie zostaje', () => {
    const s = used([meal(), walk(), block({ id: 'x', cat: 'inne', at: '15:00', min: 30 })], '11:50', '14:00')
    run(s, '11:55', '14:01')
    click(s, '14:02', { a: 'start', block: 'x' })
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id }).ok).toBe(true)
    expect(s.state('14:06').facts.blocks.get('x')?.startedAt).not.toBeNull()
  })
})

describe('poprawki po przeglądzie (T1968)', () => {
  /** „Od dziś” at `time`: the day's settings with the chain switched to `on`. */
  const switchAt = (s: Scenario, time: string, on: boolean) =>
    s.raw({ k: 'day.snapshot', at: s.at(time), dayType: 'zwykly', settings: { ...s.settings, awayChain: on }, reason: 'today', max: null, minRegen: null }, time)

  it('wyłączenie „od dziś” nie przepisuje bloków zaczętych przy włączonym', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '14:01')
    switchAt(s, '15:00', false)
    expect(run(s, '15:01', '15:05')).toEqual([])
    expect(s.state('15:06').facts.blocks.get('m')?.endRule).toBe('awayChain')
  })

  it('włączenie „od dziś” nie przepisuje końców sprzed niego', () => {
    const s = used([meal(), walk()], '11:50', '14:00', false)
    run(s, '11:55', '14:05')
    switchAt(s, '15:00', true)
    expect(run(s, '15:01', '15:05')).toEqual([])
    expect(s.state('15:06').facts.blocks.get('m')?.endRule).toBe('limit')
  })

  it('pierwszy blok ciągu czeka swoje 10 min (bez odejścia „od razu” – także rano przed pierwszym użyciem)', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    // Known only at 12:10 (T1138), as without the setting.
    expect(run(s, '11:55', '12:09')).toEqual([])
    const morning = day([block({ id: 'r', cat: 'rutyny', at: '07:00', min: 30 })]).observe('07:05', null)
    expect(run(morning, '06:55', '07:06')).toEqual([])
  })

  it('dojazd w ciągu – start po swoich 10 min (D553: dojazd bez zmian)', () => {
    const s = used([meal(), block({ id: 'd', cat: 'dojazd', variant: 'dojazd', at: '12:30', min: 30 })], '11:50', '12:35')
    expect(run(s, '11:55', '12:36')).toEqual(['awayStart m 12:00', 'awayChain m 12:30'])
  })

  it('późniejszy log dzieli otwartą przerwę: start ciągu czeka, aż przerwa ma 10 min', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '12:32')
    s.observe('12:24', '12:25', 'pcb').using('12:24', '12:25', 'pcb')
    // The meal ends at the use 12:24 (earlier), the walk's start (12:30) stays – the stretch from 12:25 is 10 min long at 12:35.
    const out = run(s, '12:33', '12:40')
    expect(out).toEqual(['revalidate - 12:33', 'firstUse m 12:24'])
    expect(s.state('12:41').facts.blocks.get('w')?.startedAt).not.toBeNull()
  })

  it('„Cofnij” końca przy pierwszym użyciu: blok kończy się dalej najpóźniej o planowanym końcu', () => {
    const s = used([meal(), walk()], '11:50', '13:00')
    run(s, '11:55', '13:02')
    s.gap('13:03', null)
    const end = s.state('13:05').facts.autos.find((a) => a.rule === 'firstUse' && a.block === 'w')!
    expect(click(s, '13:05', { a: 'undo', target: end.id }).ok).toBe(true)
    expect(run(s, '13:06', '13:31')).toEqual(['awayChain w 13:30'])
  })

  it('„Cofnij” końca odmawia, gdy w czasie ciągu zaczął się blok stały', () => {
    const s = used([meal(), block({ id: 'f', cat: 'regeneracja', at: '12:30', min: 30, fixed: true })], '11:50', '14:00')
    run(s, '11:55', '14:01')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id })).toMatchObject({ ok: false })
    const list = autoList(s, '14:05')
    expect([...list.groups.flatMap((g) => g.items), ...list.items].find((x) => x.id === end.id)?.undo).toBe(false)
  })

  it('Twoje „Cofnij” końca ciągu – zwykłe reguły na stałe, bez nowego końca według planu', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '14:01')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    click(s, '14:05', { a: 'undo', target: end.id })
    // Taken back by you: the usual rules for good – no end by the chain again.
    expect(run(s, '14:06', '14:10').some((x) => x.startsWith('awayChain'))).toBe(false)
  })

  it('prowadzący sprawdza od razu po przebiegu, który coś zapisał', () => {
    expect(nextCheckAt(2, 1000, 5000)).toBe(1000)
    expect(nextCheckAt(0, 1000, 5000)).toBe(5000)
    expect(nextCheckAt(0, 1000, null)).toBeNull()
  })
})

describe('poprawki po przeglądzie, runda 2 (T1969)', () => {
  it('„Cofnij” pierwszego użycia, które zastąpiło koniec ciągu po późniejszym logu: blok kończy się według zwykłych reguł', () => {
    const s = used([meal(), walk('13:00')], '11:50', '14:00')
    run(s, '11:55', '12:31')
    s.observe('12:20', '12:21', 'pcb').using('12:20', '12:21', 'pcb')
    run(s, '12:32', '12:33')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'firstUse' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id }).ok).toBe(true)
    run(s, '14:06', '14:08')
    expect(s.state('14:09').facts.blocks.get('m')).toMatchObject({ endRule: 'limit' })
  })

  it('po cofniętym pierwszym użyciu liczy się następny powrót', () => {
    const s = used([meal(), walk()], '11:50', '13:00')
    run(s, '11:55', '13:02')
    s.gap('13:03', '13:20')
    const end = s.state('13:05').facts.autos.find((a) => a.rule === 'firstUse' && a.block === 'w')!
    expect(click(s, '13:05', { a: 'undo', target: end.id }).ok).toBe(true)
    expect(run(s, '13:06', '13:25')).toEqual(['firstUse w 13:20'])
  })

  it('bez ustawienia też: po cofniętym pierwszym użyciu – następny powrót', () => {
    const s = used([walk()], '12:20', '13:00', false)
    run(s, '12:25', '13:02')
    s.gap('13:03', '13:20')
    const end = s.state('13:05').facts.autos.find((a) => a.rule === 'firstUse' && a.block === 'w')!
    expect(click(s, '13:05', { a: 'undo', target: end.id }).ok).toBe(true)
    expect(run(s, '13:06', '13:25')).toEqual(['firstUse w 13:20'])
  })

  it('blok cofnięty razem z końcem ciągu i zaczęty później kliknięciem znów kończy się według planu', () => {
    const s = used([meal(), walk()], '11:50', '14:00')
    run(s, '11:55', '14:01')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id }).ok).toBe(true)
    run(s, '14:06', '14:10')
    click(s, '18:00', { a: 'start', block: 'w' })
    s.gap('18:00', '20:00')
    expect(run(s, '18:01', '19:01')).toEqual(['awayChain w 19:00'])
  })

  it('powrót do komputera po końcu ciągu zrywa ciąg: następny blok czeka swoje 10 min', () => {
    const s = used([meal(), block({ id: 'h', cat: 'sprawy', at: '18:00', min: 30 })], '11:50', '12:45')
    s.gap('17:52', null)
    run(s, '11:55', '12:46')
    expect(run(s, '17:55', '18:09')).toEqual([])
    expect(run(s, '18:10', '18:10')).toEqual(['awayStart h 18:00'])
  })

  it('regeneracja w ciągu trwa do swojego planowanego końca także po porze snu', () => {
    const s = used([block({ id: 'e', cat: 'regeneracja', at: '21:30', min: 60 })], '21:20')
    expect(run(s, '21:25', '22:31')).toEqual(['awayStart e 21:30', 'awayChain e 22:30'])
  })

  it('blok kliknięty w minucie powrotu nie blokuje „Cofnij”', () => {
    const s = used([meal(), walk(), block({ id: 'x', cat: 'inne', at: '15:00', min: 30 })], '11:50', '14:00')
    run(s, '11:55', '13:59')
    click(s, '14:00', { a: 'start', block: 'x' })
    run(s, '14:01', '14:02')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id }).ok).toBe(true)
  })

  it('prośba w czasie ciągu: „Cofnij” końca odmawia', () => {
    const s = used([meal(), walk('13:00')], '11:50', '14:00')
    run(s, '11:55', '12:39')
    s.request('r1', '12:40', '12:45')
    run(s, '12:40', '14:01')
    const end = s.state('14:05').facts.autos.find((a) => a.rule === 'awayChain' && a.block === 'm')!
    expect(click(s, '14:05', { a: 'undo', target: end.id })).toMatchObject({ ok: false, why: 'tego już nie cofniesz – po tym końcu kolejny blok zmienił się albo biegło coś innego' })
  })

  it('dojazd według planu: późniejszy log z wcześniejszym użyciem – nowy koniec w tym samym przebiegu (T1966)', () => {
    const s = used([block({ id: 'd', cat: 'dojazd', variant: 'dojazd', at: '13:00', min: 30 })], '12:50', null, false)
    run(s, '12:55', '13:31')
    s.observe('13:20', '13:21', 'pcb').using('13:20', '13:21', 'pcb')
    expect(leader(s, '13:32').map((e) => e.autoRule)).toEqual(['revalidate', 'firstUse'])
  })
})

