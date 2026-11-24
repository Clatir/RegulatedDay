/**
 * N1 – „Bloki przy komputerze jednym ciągiem” (D570, D620, D621, T2495–T2499): with the setting on, a block at the computer that
 * reaches its planned end while you are active (input in the last 2 min) ends there, done, and the next flexible block at the computer
 * that begins at most 5 min later begins by itself – one „Cofnij” brings both back. Idle, off, or one of the exceptions – as before.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { activityOf } from '@shared/engine/activity'
import { autoActions, DESK_CHAIN_RULE, DESK_HOLD_MS, nextDeadline, questionsOf, type AutoEvent } from '@shared/engine/auto'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { computeDay, type DayContext } from '@shared/engine/day'
import { csvOf } from '@shared/engine/csv'
import { ALREADY_OVER, MOVED_ON, SHOWN_PAUSED, timerAction, timerNow, type TimerAction } from '@shared/engine/timer'
import { autoText, engineView } from '@shared/engineView'
import { TOGGLE_FIELDS } from '@shared/model/fields'
import { rdFrom } from '@shared/model/rd'
import { RULES_VERSION } from '@shared/model/events'
import { derivedId, questionId } from '@shared/model/ids'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import { settingsFrom, type SettingsChange } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-28' // a Wednesday
const MIN = 60_000

const ON = { deskChain: true }
type Plan = PlanBlock[]

const analiza = (id: string, at: string, min = 30) => block({ id, cat: 'analiza', at, min })
const inne = (id: string, at: string, min = 30) => block({ id, cat: 'inne', at, min })
/** A, its next B at A's end and C after it (B is no last work block). */
const abc = (bAt = '10:30'): Plan => [analiza('a', '10:00'), inne('b', bAt), analiza('c', '11:00')]

/** At the computer from 07:00 (input all the time unless a gap says otherwise), A begun at 10:00 by a click. */
function day(plan: Plan = abc(), settings: Record<string, unknown> = ON): Scenario {
  return new Scenario({ date: DATE, plan, settings }).observe('07:00', null).start('a', '10:00')
}

const activityAt = (ctx: DayContext, t: number) => activityOf(ctx.events, computeDay(ctx).grid.start, t, 'pca')

function leaderAt(s: Scenario, t: number, hold?: ReadonlySet<string>): AutoEvent[] {
  const ctx = s.contextAt(t)
  const state = computeDay(ctx)
  const out = autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t, ...(hold ? { hold } : {}) })
  s.write(out, t)
  return out.filter((e) => e.autoRule !== 'boundary')
}
const leader = (s: Scenario, time: string, hold?: ReadonlySet<string>) => leaderAt(s, s.at(time), hold)
const chainOf = (list: AutoEvent[]) => list.filter((e) => e.autoRule === DESK_CHAIN_RULE)

function clickAt(s: Scenario, t: number, act: TimerAction) {
  const ctx = s.contextAt(t)
  const r = timerAction(ctx, computeDay(ctx), act, t, activityAt(ctx, t))
  if (r.ok) s.write(r.events, t)
  return r
}

function questionsAt(s: Scenario, t: number) {
  const ctx = s.contextAt(t)
  const state = computeDay(ctx)
  return questionsOf({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t })
}
const asksNext = (s: Scenario, t: number) => questionsAt(s, t).some((q) => q.kind === 'next')
const fgAt = (s: Scenario, t: number) => timerNow(s.stateAt(t)).fg?.info.id ?? null

function autoList(s: Scenario, t: number) {
  const ctx = s.contextAt(t)
  const state = computeDay(ctx)
  const care = { waterOn: false, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }
  return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Blok', care, modePrefs: { sessionMode: true, classMode: true }, pending: null }).autos
}

describe('ustawienie „Bloki przy komputerze jednym ciągiem” (D570)', () => {
  it('jest domyślnie wyłączone, czytane z rd.json, w „Pytaniach w ciągu dnia” z datą obowiązywania', () => {
    expect(settingsFrom({}).deskChain).toBe(false)
    expect(settingsFrom({ deskChain: true }).deskChain).toBe(true)
    expect(settingsFrom({ deskChain: 'tak' }).deskChain).toBe(false)
    expect(TOGGLE_FIELDS.find((f) => f.key === 'deskChain')).toMatchObject({ path: ['deskChain'], group: 'timer', label: 'Bloki przy komputerze jednym ciągiem' })
    // A rule an older version does not know: it gives way as the leader (T2860).
    expect(RULES_VERSION).toBe(21)
  })
})

describe('aktywny i następny w 5 min – start sam (D620, T2495)', () => {
  it('o planowanym końcu: bieżący skończony (zrobiony), następny zaczęty w tej chwili – id z reguły, bloku i chwili', () => {
    const s = day()
    expect(chainOf(leader(s, '10:29'))).toEqual([])
    const out = chainOf(leader(s, '10:30'))
    const at = s.at('10:30')
    expect(out).toMatchObject([
      { id: derivedId(DATE, 'auto', DESK_CHAIN_RULE, 'block.end', 'a', at), k: 'block.end', block: 'a', at, done: true, fin: true, rule: DESK_CHAIN_RULE },
      { id: derivedId(DATE, 'auto', DESK_CHAIN_RULE, 'block.start', 'b', at), k: 'block.start', block: 'b', at, bg: false, how: 'auto', planned: { categoryId: 'inne', durationMin: 30 } }
    ])
    expect(fgAt(s, s.at('10:31'))).toBe('b')
    // Written once: the next pass writes nothing more.
    expect(chainOf(leader(s, '10:31'))).toEqual([])
    const f = s.stateAt(s.at('10:31')).facts.blocks.get('a')!
    expect(f).toMatchObject({ finished: true, done: true, endRule: DESK_CHAIN_RULE })
  })

  it('następny o swojej godzinie do 5 min po końcu zaczyna się od razu; 6 min po – jak dotąd', () => {
    const near = day(abc('10:35'))
    expect(chainOf(leader(near, '10:30'))).toMatchObject([{ block: 'a' }, { block: 'b', at: near.at('10:30') }])
    const far = day(abc('10:36'))
    expect(chainOf(leader(far, '10:30'))).toEqual([])
    expect(asksNext(far, far.at('10:30'))).toBe(true)
  })

  it('klik w środku minuty: koniec w chwili zera odliczania (z sekundami), także jako termin prowadzącego (T2499)', () => {
    const s = new Scenario({ date: DATE, plan: abc(), settings: ON }).observe('07:00', null)
    const from = s.at('10:00') + 20_000
    s.write([{ k: 'block.start', block: 'a', at: from, bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 30, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click' }], from)
    // The leader's exact timer: within the minute of the end – the second the countdown reaches 0:00; past it – nothing of that minute.
    const in30 = s.at('10:30') + 5_000
    expect(nextDeadline(s.stateAt(in30), in30)).toBe(s.at('10:30') + 20_000)
    const past = s.at('10:30') + 25_000
    expect(nextDeadline(s.stateAt(past), past)!).toBeGreaterThan(past)
    expect(chainOf(leaderAt(s, s.at('10:30') + 10_000))).toEqual([])
    expect(chainOf(leaderAt(s, s.at('10:30') + 20_000))).toMatchObject([{ block: 'a', at: s.at('10:30') + 20_000 }, { block: 'b', at: s.at('10:30') + 20_000 }])
  })

  it('kaskada: następny też kończy się o swoim końcu i zaczyna kolejny', () => {
    const s = day([analiza('a', '10:00'), inne('b', '10:30'), analiza('c', '11:00'), inne('d', '11:30')])
    expect(chainOf(leader(s, '10:30')).map((e) => `${e.k} ${e.block}`)).toEqual(['block.end a', 'block.start b'])
    expect(chainOf(leader(s, '11:00')).map((e) => `${e.k} ${e.block}`)).toEqual(['block.end b', 'block.start c'])
  })
})

describe('bezczynny albo wyłączone – jak dotąd (T2496)', () => {
  it('bez wejścia od 3 min przed końcem: nic, „Dalej?” jak dotąd', () => {
    const s = day().gap('10:27', null)
    expect(chainOf(leader(s, '10:30'))).toEqual([])
    expect(asksNext(s, s.at('10:30'))).toBe(true)
    expect(fgAt(s, s.at('10:31'))).toBe('a')
  })

  it('wejście w ciągu 2 min przed końcem (po przerwie) – aktywny', () => {
    const s = day().gap('10:20', '10:29')
    expect(chainOf(leader(s, '10:30'))).toHaveLength(2)
  })

  it('wyłączone (domyślnie): nic, „Dalej?” jak dotąd', () => {
    const s = day(abc(), {})
    expect(chainOf(leader(s, '10:30'))).toEqual([])
    expect(asksNext(s, s.at('10:30'))).toBe(true)
  })

  it('dwa komputery: wejście na drugim się liczy – do jego ostatniego „obserwacja trwa”', () => {
    const plan = abc()
    // Nobody at pca since 09:00; pcb in use – its stretch counts to its last „trwa”.
    const at = new Scenario({ date: DATE, plan, settings: ON }).observe('07:00', null).gap('09:00', null).using('07:00', '10:30', 'pcb').start('a', '10:00')
    expect(chainOf(leader(at, '10:30'))).toHaveLength(2)
    const stale = new Scenario({ date: DATE, plan, settings: ON }).observe('07:00', null).gap('09:00', null).using('07:00', '10:25', 'pcb').start('a', '10:00')
    expect(chainOf(leader(stale, '10:30'))).toEqual([])
  })
})

describe('wyjątki – jak dotąd (D620, T2497)', () => {
  const none = (plan: Plan, o: { before?: (s: Scenario) => void } = {}) => {
    const s = new Scenario({ date: DATE, plan, settings: ON }).observe('07:00', null)
    o.before?.(s)
    s.start('a', '10:00')
    expect(chainOf(leader(s, '10:30'))).toEqual([])
    expect(asksNext(s, s.at('10:30'))).toBe(true)
  }

  it('następny poza komputerem albo bierny', () => {
    none([analiza('a', '10:00'), block({ id: 'b', cat: 'posilek', at: '10:30', min: 30 }), analiza('c', '11:00')])
    none([analiza('a', '10:00'), block({ id: 'b', cat: 'ogladanie', at: '10:30', min: 30 }), analiza('c', '11:00')])
  })

  it('bieżący to ostatni blok pracy („Dalej?” ma „Koniec pracy”)', () => {
    none([analiza('a', '10:00'), block({ id: 'b', cat: 'projekty', at: '10:30', min: 30 })])
    // A later work block: no longer the last one – the chain goes on to the project.
    const s = day([analiza('a', '10:00'), block({ id: 'b', cat: 'projekty', at: '10:30', min: 30 }), inne('c', '12:00')])
    expect(chainOf(leader(s, '10:30')).map((e) => e.block)).toEqual(['a', 'b'])
  })

  it('sesja, wykład albo blok stały w ciągu 5 min po końcu', () => {
    none([...abc(), block({ id: 's', cat: 'sesja', at: '10:33', min: 60, fixed: true, bg: true })])
    none([...abc(), block({ id: 'w', cat: 'wyklad', at: '10:32', min: 60, fixed: true })])
    none([...abc(), block({ id: 'f', cat: 'inne', at: '10:34', min: 15, fixed: true })])
    // A commute (T2864: its rules – a start of its own, D486) – also by its window.
    none([...abc(), block({ id: 'd', cat: 'dojazd', variant: 'dojazd', at: '10:33', min: 30 })])
    // Later than 5 min – the chain goes on.
    const s = day([...abc(), block({ id: 's', cat: 'sesja', at: '10:40', min: 60, fixed: true, bg: true })])
    expect(chainOf(leader(s, '10:30'))).toHaveLength(2)
  })

  it('za granicą: start następnego ma koszt jak „Dalej” (granica zatwierdzona)', () => {
    none(abc(), { before: (s) => s.approve('10:40', '09:00') })
  })

  it('następny w grupie równoległej', () => {
    none([analiza('a', '10:00'), inne('b', '10:30'), { ...inne('b2', '10:30'), alongside: 'b' }, analiza('c', '11:00')])
  })

  it('czekające „Przedłuż” na komputerze prowadzącego (`hold`): po nim – ten sam koniec', () => {
    const s = day()
    expect(chainOf(leader(s, '10:30', new Set(['a'])))).toEqual([])
    expect(chainOf(leaderAt(s, s.at('10:30') + 15_000))).toMatchObject([{ block: 'a', at: s.at('10:30') }, { block: 'b' }])
  })

  it('bufor dekompresji po bloku wygrywa (D620): ciąg nie startuje, bez bufora – startuje', () => {
    const SAT = '2026-10-31'
    const meet: PlanBlock = { ...block({ id: 'a', cat: 'inne', at: '10:00', min: 90, origin: 'user' }), costs: { head: 0, emotions: 4, senses: 0, body: 0 } }
    const plan = [meet, block({ id: 'b', cat: 'inne', at: '11:30', min: 30, origin: 'user' }), block({ id: 'c', cat: 'inne', at: '12:00', min: 30, origin: 'user' })]
    const run = (decompress: boolean) => {
      const s = new Scenario({ date: SAT, dayType: 'weekend', plan })
      const changes: SettingsChange[] = [{ id: 'c1', from: SAT, at: null, made: 1, patch: { deskChain: true, decompress: { on: decompress } } }]
      const inputs: PlanInputs = { changes, templates: [], lectures: [], series: [], routines: [] }
      const file: DayFile = { ...dayFileFrom({}, SAT), dayType: 'weekend', blocks: plan }
      const ctxAt = (t: number) => dayContextOf(inputs, { date: SAT, events: s.events.filter((e) => e.t <= t), dayFile: file, nextFile: null }, marketDay, t)
      s.observe('08:00', null).start('a', '10:00')
      const t = placeLogical(SAT, lm('11:30'))
      const ctx = ctxAt(t)
      const state = computeDay(ctx)
      expect(state.blocks.some((b) => b.decompress != null)).toBe(decompress)
      return autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: t }).filter((e) => e.autoRule === DESK_CHAIN_RULE)
    }
    expect(run(true)).toEqual([])
    expect(run(false).map((e) => e.block)).toEqual(['a', 'b'])
  })
})

describe('„Dalej?” czeka na ciąg (T2499)', () => {
  it('póki ciąg obowiązuje – najwyżej 60 s po końcu – pasek nie pyta; potem pyta, a zobaczone pytanie wyłącza ciąg', () => {
    const s = day()
    expect(asksNext(s, s.at('10:30') + 10_000)).toBe(false)
    expect(asksNext(s, s.at('10:30') + DESK_HOLD_MS + 1_000)).toBe(true)
    const seen = day()
    seen.seen(questionId(DATE, 'next', 'a', lm('10:30') - 240), '10:30')
    expect(chainOf(leaderAt(seen, seen.at('10:30') + 5_000))).toEqual([])
  })
})

describe('„Cofnij” przywraca oba bloki (D620, T2498)', () => {
  it('cofnięcie końca albo startu: bieżący biegnie dalej, następny niezaczęty – ciąg nie wraca, też po „Przedłuż”', () => {
    for (const which of ['block.end', 'block.start']) {
      const s = day()
      const out = chainOf(leader(s, '10:30'))
      const target = out.find((e) => e.k === which)!.id
      const r = clickAt(s, s.at('10:31'), { a: 'undo', target })
      expect(r.ok).toBe(true)
      expect(r.ok && r.events.map((e) => e.target).sort()).toEqual(out.map((e) => e.id).sort())
      const state = s.stateAt(s.at('10:31'))
      expect(timerNow(state).fg?.info.id).toBe('a')
      expect(state.facts.blocks.get('b')?.startedAt ?? null).toBeNull()
      expect(chainOf(leader(s, '10:32'))).toEqual([])
      expect(asksNext(s, s.at('10:32'))).toBe(true)
      // „Przedłuż” gives a new planned end – your „Cofnij” keeps the chain off for this start of the block.
      clickAt(s, s.at('10:33'), { a: 'extend', minutes: 15 })
      expect(chainOf(leader(s, '10:45'))).toEqual([])
    }
  })

  it('po zmianie następnego (pauza) – odmowa, lista bez „Cofnij”', () => {
    const s = day()
    const out = chainOf(leader(s, '10:30'))
    expect(autoList(s, s.at('10:31')).items.filter((x) => out.some((e) => e.id === x.id)).map((x) => x.undo)).toEqual([true, true])
    clickAt(s, s.at('10:35'), { a: 'pause' })
    const r = clickAt(s, s.at('10:36'), { a: 'undo', target: out[0]!.id })
    expect(r).toMatchObject({ ok: false, why: 'tego już nie cofniesz – następny blok zmienił się po starcie' })
    expect(autoList(s, s.at('10:36')).items.filter((x) => out.some((e) => e.id === x.id)).map((x) => x.undo)).toEqual([false, false])
  })
})

describe('„Zrobione automatycznie” i CSV', () => {
  it('teksty listy i uwaga w CSV', () => {
    const a = (k: string) => ({ id: 'x', k, rule: DESK_CHAIN_RULE, block: 'a', request: null, at: 0, c: 'pca' })
    expect(autoText(a('block.end'), 'Analiza', '10:30')).toBe('Analiza skończony o 10:30 (według planu, jednym ciągiem przy komputerze)')
    expect(autoText(a('block.start'), 'Inne obowiązki', '10:30')).toBe('Inne obowiązki zaczęty o 10:30 (jednym ciągiem przy komputerze)')
    const s = day()
    leader(s, '10:30')
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const rows = csvOf([{ ctx: s.contextAt(s.at('20:00')), names }])['bloki.csv']
    expect(rows).toContain('koniec według planu (jednym ciągiem przy komputerze)')
  })
})

describe('kliknięcie paska z pokazanym blokiem (D621)', () => {
  it('„Dalej” i „Przedłuż” z blokiem, którego już nie ma z przodu – odmowa; z tym z przodu – jak dotąd', () => {
    const s = day()
    leader(s, '10:30')
    const t = s.at('10:30') + 2_000
    expect(clickAt(s, t, { a: 'next', shown: 'a' })).toMatchObject({ ok: false, why: MOVED_ON, code: 'moved' })
    expect(clickAt(s, t, { a: 'extend', minutes: 15, shown: 'a' })).toMatchObject({ ok: false, why: MOVED_ON, code: 'moved' })
    expect(fgAt(s, t)).toBe('b')
    expect(clickAt(s, t, { a: 'extend', minutes: 15, shown: 'b' })).toMatchObject({ ok: true })
    expect(clickAt(s, t + 1_000, { a: 'next', shown: 'b' })).toMatchObject({ ok: true })
    // Without a block shown (an older caller) – as before.
    expect(timerAction(s.contextAt(t + 2_000), s.stateAt(t + 2_000), { a: 'next' }, t + 2_000).ok).toBe(true)
  })
})

/** The leader's chain judged every 10 s from the end to 2 min after: written once, at the end. */
describe('prowadzący spóźniony', () => {
  it('ten sam zapis w każdym przebiegu do zobaczenia pytania', () => {
    const s = day()
    const ids: string[] = []
    for (let t = s.at('10:30') + 5_000; t <= s.at('10:30') + 2 * MIN; t += 10_000) ids.push(...chainOf(leaderAt(s, t)).map((e) => e.id))
    expect(ids).toHaveLength(2)
  })
})

describe('przegląd r1 (T2863–T2866)', () => {
  it('górna granica: prowadzący pierwszy raz 60 s po końcu albo później – ciąg już nie rusza, zostaje „Dalej?” (T2863)', () => {
    const s = day()
    expect(chainOf(leaderAt(s, s.at('10:30') + DESK_HOLD_MS))).toEqual([])
    expect(fgAt(s, s.at('10:31') + 1_000)).toBe('a')
    expect(asksNext(s, s.at('10:31') + 1_000)).toBe(true)
  })

  it('niezaczęty blok stały, którego okno obejmuje koniec, i jego start w tym samym przejściu: bez ciągu – jeden blok z przodu (T2864)', () => {
    // A fixed block at the computer 10:20–11:00 the late leader starts only now (a pass at 10:30, nothing before it).
    const s = day([...abc(), block({ id: 'f', cat: 'inne', at: '10:20', min: 40, fixed: true })])
    const out = leader(s, '10:30')
    expect(chainOf(out)).toEqual([])
    expect(out.filter((e) => e.autoRule === 'fixedStart').map((e) => `${e.k} ${e.block}`)).toEqual(['block.pause a', 'block.start f'])
    const t = timerNow(s.stateAt(s.at('10:31')))
    expect(t.fg?.info.id).toBe('f')
    expect(t.bg.map((x) => x.info.id)).toEqual([])
  })

  it('log drugiego komputera z przerwą w wejściu przed końcem, który przyszedł po ciągu: obie połówki cofnięte, póki następny nietknięty (T2865)', () => {
    const plan = abc()
    const s = new Scenario({ date: DATE, plan, settings: ON }).observe('07:00', null).gap('09:00', null).using('07:00', '10:30', 'pcb').start('a', '10:00')
    const out = chainOf(leader(s, '10:30'))
    expect(out).toHaveLength(2)
    // pcb's gap from 10:26 arrives at 10:31 (written after its last „trwa”).
    const t = s.at('10:31')
    for (const kind of ['input', 'use'] as const) s.events.push({ id: `pcb-late-${kind}`, c: 'pcb', n: 1000 + (kind === 'input' ? 0 : 1), t, l: t, v: RULES_VERSION, day: DATE, dom: 'meta', k: 'gap.open', gap: `pcb-${kind}-late`, kind, from: s.at('10:26'), lastOutside: s.at('10:26') } as never)
    const undone = leaderAt(s, t + 5_000).filter((e) => e.k === 'undo')
    expect(undone.map((e) => e.target).sort()).toEqual(out.map((e) => e.id).sort())
    const state = s.stateAt(t + 10_000)
    expect(timerNow(state).fg?.info.id).toBe('a')
    expect(state.facts.blocks.get('b')?.startedAt ?? null).toBeNull()
    // Taken back by the check: never again for that end.
    expect(chainOf(leaderAt(s, t + 15_000))).toEqual([])
  })

  it('nieobecność odliczona wcześniej w bloku: ten sam wynik przy prowadzącym na czas i spóźnionym (bramka) – najpierw nieobecność, potem ciąg (T2866)', () => {
    const plan = [inne('a', '10:00', 60), inne('b', '11:00'), analiza('c', '11:30')]
    const seed = () => new Scenario({ date: DATE, plan, settings: ON }).observe('07:00', null).start('a', '10:00').gap('10:05', '10:40')
    const shape = (s: Scenario) => {
      const f = s.stateAt(s.at('11:02')).facts
      const a = f.blocks.get('a')!
      return { runs: a.runs.map((r) => [r.from, r.to]), end: a.endRule, b: f.blocks.get('b')?.startedAt ?? null }
    }
    // On time: a pass every minute.
    const timely = seed()
    for (let t = timely.at('10:00'); t <= timely.at('11:01'); t += MIN) leaderAt(timely, t)
    // Late: the gate held everything back until 11:00:05 (another computer's log), then passes at once (`nextCheckAt`).
    const late = seed()
    for (let t = late.at('10:00'); t <= late.at('10:59'); t += MIN) {
      const ctx = late.contextAt(t)
      const state = computeDay(ctx)
      late.write(autoActions({ ctx, state, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, gate: late.at('09:59') }), t)
    }
    for (let i = 0; i < 3; i++) leaderAt(late, late.at('11:00') + 5_000 + i)
    expect(shape(late)).toEqual(shape(timely))
    // The absence counted out moves the planned end by its 35 min: no chain at 11:00 either way – it comes at 11:35.
    expect(shape(timely)).toMatchObject({ end: null, b: null })
    expect(shape(timely).runs).toHaveLength(2)
    expect(chainOf(leader(timely, '11:35')).map((e) => e.block)).toEqual(['a', 'b'])
  })
})

describe('pokazany blok skończył się gdzie indziej (T2869)', () => {
  it('nic z przodu: „Dalej” zaczyna następny, „Przedłuż” – „ten blok już się skończył”', () => {
    const s = day(abc(), {})
    // A ended elsewhere (another computer's „Skończyłem”); the bar still shows it.
    expect(clickAt(s, s.at('10:20'), { a: 'finish', block: 'a' }).ok).toBe(true)
    const t = s.at('10:21')
    expect(clickAt(s, t, { a: 'extend', minutes: 15, shown: 'a' })).toMatchObject({ ok: false, why: ALREADY_OVER, code: 'alreadyOver' })
    expect(clickAt(s, t, { a: 'next', shown: 'a' })).toMatchObject({ ok: true })
    expect(fgAt(s, t)).toBe('b')
  })
})

describe('pokazany blok zapauzowany gdzie indziej (T2869)', () => {
  it('nic z przodu, ale pokazany nie skończony: „Dalej” i „Przedłuż” – odmowa „ten blok jest teraz zapauzowany”', () => {
    const s = day(abc(), {})
    expect(clickAt(s, s.at('10:20'), { a: 'pause' }).ok).toBe(true)
    const t = s.at('10:21')
    expect(clickAt(s, t, { a: 'next', shown: 'a' })).toMatchObject({ ok: false, why: SHOWN_PAUSED, code: 'moved' })
    expect(clickAt(s, t, { a: 'extend', minutes: 15, shown: 'a' })).toMatchObject({ ok: false, why: SHOWN_PAUSED, code: 'moved' })
    expect(fgAt(s, t)).toBeNull()
  })
})

