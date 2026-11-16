/**
 * 1.30.0 – „Bloki poza komputerem jednym ciągiem” (D553–D556, T1962–T1966): with the setting on, a block away from the
 * computer ends at the return, at the latest at its planned end (done, without a question), and the next one begins by
 * itself at once; „Cofnij” of such an end takes back what the app began after it before your return.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { autoActions, awayKnownAt, questionsOf, type AutoEvent } from '@shared/engine/auto'
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
  const r = timerAction(s.contextAt(t), s.stateAt(t), act, t)
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

  it('wyłączone – jak dotąd: posiłek trwa do limitu, spacer się nie zaczyna', () => {
    const s = used([meal(), walk()], '11:50', '14:00', false)
    expect(run(s, '11:55', '14:01')).toEqual(['awayStart m 12:00', 'limit m 13:00'])
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
    run(off, '11:55', '14:01')
    const so = off.state('14:02')
    expect(ritualRows(so, activityOf(off.contextAt(off.at('14:02')).events, so.grid.start, off.at('14:02'))).filter((r) => r.kind === 'away')).toHaveLength(1)
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
    expect(awayKnownAt(x, 10 * MIN, true)).toBe(12 * MIN)
    expect(awayKnownAt(x, 10 * MIN, false)).toBeNull()
    // Left only 3 min before: still 10 min of the stretch first.
    expect(awayKnownAt({ from: 7 * MIN, to: 30 * MIN }, 10 * MIN, true)).toBe(17 * MIN)
    // Back within 2 min of the hour: it does not begin.
    expect(awayKnownAt({ from: 0, to: 11 * MIN }, 10 * MIN, true)).toBeNull()
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
