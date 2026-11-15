/**
 * D514 with D512 (T1430–T1433): the cost of a routine changed while a block of it runs reaches the block from that moment on. The main
 * process writes one `routine.cost` (`routine`, `at`, `costs`, `was`) whenever it writes the routine's record with another cost – a save
 * of „Rutyny” or ✎, an answer to a question of a conflict, „Przywróć”, a joined conflict copy –, and the engine matches it to the day's
 * begun blocks by their start's routine and category of the kind „rutyna” (the plan's for a start without them): the routine's cost from
 * the minute of the change on, the minutes before as they were. It changes the block's routine's cost, not its own: a block with its own
 * cost keeps it, and „Jak rutyna” (`block.cost` null) goes back to the new cost of the routine. The day's logs are every computer's: a
 * change of another computer reaches a block here the same way, also one begun here before its new file came.
 */
import { describe, expect, it } from 'vitest'
import { costEvidence } from '@shared/engine/calibration'
import { begunCosts, costChangesOf, startRoutine } from '@shared/engine/costChange'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, type EnergyState } from '@shared/engine/energy'
import { isPassive } from '@shared/engine/facts'
import type { Costs, Pool } from '@shared/model/categories'
import { parseEvent, type Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-11-18'
const R: Costs = { head: 5, emotions: 4, senses: -2 }
const R2: Costs = { head: -1, emotions: 2, senses: 3 }
const R3: Costs = { head: 3, emotions: 3, senses: 0 }
const OWN: Costs = { head: 2, emotions: 2, senses: 2 }
/** The category „Rutyny” (the kind „rutyna”): 1 · 0 · 1. */
const RUTYNY: Costs = { head: 1, emotions: 0, senses: 1 }
const ANSWERS: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }

const curve = (e: EnergyState) => (['head', 'emotions', 'senses'] as const).map((p) => Array.from(e.series[p]))
const at = (e: EnergyState, time: string) => {
  const k = lm(time) - 4 * 60
  return { head: e.series.head[k], emotions: e.series.emotions[k], senses: e.series.senses[k] }
}
/** A block of „Rutyny” with the routine „poranna”, 08:00–09:30. */
const m = (o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id: 'm', cat: 'rutyny', at: '08:00', min: 90 }), routine: 'poranna', ...o })
/** A day with a check-in at 07:00; `routineCosts` – the routines' costs known at a start (none – a start without the field). */
const day = (plan: PlanBlock[], routineCosts: Record<string, Costs> | null = { poranna: R }) =>
  new Scenario({ date: DATE, plan, wake: '06:30', ...(routineCosts ? { routineCosts } : {}) }).observe('06:30', null).checkin('07:00', ANSWERS)
/** The routine's record written with another cost at `time` (`routine.cost` of the main process, the timer's domain). */
const routineCost = (s: Scenario, time: string, costs: Costs | null, was: Costs | null = R, computer?: string, routine = 'poranna') =>
  s.write([{ k: 'routine.cost', routine, at: s.at(time), costs, was }], s.at(time), computer)
/** A start of „m” (or `id`) at `time` as this version writes it, with the routine's cost `routineCosts` known then. */
const startWith = (s: Scenario, time: string, routineCosts: Costs | null, id = 'm') =>
  s.write([{ k: 'block.start', block: id, at: s.at(time), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null, routine: 'poranna', routineCosts }, confirmUntil: null, how: 'click' }], s.at(time))
const ownCost = (s: Scenario, time: string, costs: Costs | null) => s.write([{ k: 'block.cost', block: 'm', at: s.at(time), costs }], s.at(time))
const tile = (s: Scenario, time: string, id = 'm') => {
  const ctx = s.contextAt(s.at(time))
  const state = computeDay(ctx)
  return begunCosts(ctx, state, state.blocks.find((b) => b.id === id)!)
}
/** The day's energy at `time` with the routines' costs known then (`routineCosts` – what the window's files say then). */
const energyWith = (s: Scenario, time: string, routineCosts: Record<string, Costs>) => {
  const ctx = s.contextAt(s.at(time), { routineCosts })
  return computeEnergy(ctx, computeDay(ctx))
}

describe('zmiana kosztu rutyny przy zaczętym bloku (D514, T1430)', () => {
  it('stary koszt rutyny do chwili zmiany, nowy od niej – jak ten sam koszt własny bloku od tej minuty', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    const same = ownCost(day([m()]).start('m', '08:00'), '08:30', R2)
    expect(curve(s.energy('09:00'))).toEqual(curve(same.energy('09:00')))
    // The minutes before the change – as without it (the state at the change; the forecast from it is the new cost's).
    const plain = day([m()]).start('m', '08:00')
    expect(s.energy('08:30').now).toEqual(plain.energy('08:30').now)
    expect(s.energy('09:00').now).not.toEqual(plain.energy('09:00').now)
  })

  it('kafelek: przed zmianą – koszt rutyny ze startu, od niej – nowy (nie własny), „Jak rutyna”', () => {
    const s = day([m()]).start('m', '08:00')
    expect(tile(s, '08:20')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    routineCost(s, '08:30', R2)
    expect(tile(s, '08:20')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('rutyna bez kosztu od chwili zmiany (null) – blok kosztuje jak podkategoria', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', null)
    expect(tile(s, '08:40')).toEqual({ costs: RUTYNY, base: RUTYNY, own: false })
    expect(curve(s.energy('09:00'))).toEqual(curve(ownCost(day([m()]).start('m', '08:00'), '08:30', RUTYNY).energy('09:00')))
  })

  it('blok z kosztem rutyny od zmiany, choć start był bez niego (rutyna nie miała kosztu)', () => {
    const s = routineCost(day([m()], {}).start('m', '08:00'), '08:30', R2, null)
    expect(tile(s, '08:20')).toEqual({ costs: RUTYNY, base: RUTYNY, own: false })
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('własny koszt bloku wygrywa; „Jak rutyna” potem wraca do nowego kosztu rutyny, nie do starego', () => {
    const s = day([m()]).start('m', '08:00')
    ownCost(s, '08:10', OWN)
    routineCost(s, '08:20', R2)
    expect(tile(s, '08:25')).toEqual({ costs: OWN, base: R2, own: true, baseFrom: 'routine' })
    ownCost(s, '08:30', null)
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
    // The energy: own from 08:10, the routine's new cost from 08:30 (the change of 08:20 is under the own cost).
    const same = day([m()]).start('m', '08:00')
    ownCost(same, '08:10', OWN)
    ownCost(same, '08:30', R2)
    expect(curve(s.energy('09:00'))).toEqual(curve(same.energy('09:00')))
  })

  it('przeliczenie później daje to samo: minione minuty zostają po staremu', () => {
    const s = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    const then = s.energy('08:45').now
    s.end('m', '09:30')
    expect(at(s.energy('11:00'), '08:45')).toEqual(then)
  })

  it('blok skończony przed zmianą i niezaczęty – bez zmiany (niezaczęty bierze koszt rutyny teraz); zaczęty po niej – koszt ze swojego startu (tu już nowy)', () => {
    const plan = [m({ durationMin: 15 }), m({ id: 'next', startMin: lm('09:00') })]
    const s = routineCost(day(plan).ran('m', '08:00', '08:15'), '08:30', R2)
    expect(curve(s.energy('08:50'))).toEqual(curve(day(plan).ran('m', '08:00', '08:15').energy('08:50')))
    // Begun after the change on this computer: its start wrote the new cost (the file has it).
    startWith(s, '09:00', R2, 'next')
    expect(tile(s, '09:10', 'next')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('kafelek bloku skończonego: koszt, z którym biegł – zmiana po jego końcu go nie sięga (jak energia, tydzień i kalibracja); „Zacznij jeszcze raz” – od nowa tak', () => {
    const s = routineCost(day([m({ durationMin: 15 })]).ran('m', '08:00', '08:15'), '08:30', R2)
    expect(tile(s, '08:50')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    // A change while it ran: the tile of the ended block says the cost of its last minute, not one of a change after its end.
    const t = routineCost(day([m()]).start('m', '08:00'), '08:10', R2).end('m', '08:20')
    routineCost(t, '08:30', null, R2)
    expect(tile(t, '08:50')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
    // Paused, the change, then ended: its last minute ran before the change.
    const p = day([m()]).start('m', '08:00').pause('m', '08:10')
    routineCost(p, '08:20', R2).end('m', '08:30')
    expect(tile(p, '08:40')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
    // Begun again (D207): the change counts in the new stretch from its minute (here before it – from the new stretch on).
    t.write([{ k: 'block.restart', block: 'm', at: t.at('08:40') }], t.at('08:40'))
    expect(tile(t, '08:50')).toEqual({ costs: RUTYNY, base: RUTYNY, own: false })
  })

  it('start bez kosztu rutyny w zdarzeniu (rutyna nieodczytana przy starcie, T1372): przeszłość stała – przed zmianą koszt sprzed niej (`was`), nie koszt rutyny teraz', () => {
    // Before the change: the start has no field, the routine costs R now – its minutes count R.
    const s = day([m()], null).start('m', '08:00')
    const before = energyWith(s, '08:30', { poranna: R })
    // The routine's record written with R2 at 08:30: the window and the engine know R2 now.
    routineCost(s, '08:30', R2, R)
    const after = energyWith(s, '09:00', { poranna: R2 })
    expect(at(after, '08:30')).toEqual(before.now)
    expect(at(after, '08:20')).toEqual(at(before, '08:20'))
    // From the change on – the new cost (as a start that wrote R and the same change).
    expect(curve(after)).toEqual(curve(routineCost(day([m()]).start('m', '08:00'), '08:30', R2).energy('09:00')))
  })

  it('dwa komputery: zmiana z logu drugiego komputera liczy się tak samo; w jednej minucie wygrywa późniejsza w logu', () => {
    const one = routineCost(day([m()]).start('m', '08:00'), '08:30', R2, R, 'pcb')
    const here = routineCost(day([m()]).start('m', '08:00'), '08:30', R2)
    expect(curve(one.energy('09:00'))).toEqual(curve(here.energy('09:00')))
    const both = day([m()]).start('m', '08:00')
    routineCost(both, '08:30', OWN, R, 'pcb')
    routineCost(both, '08:30', R2, OWN, 'pcc')
    // The logs arrive in any order: the later of the minute (the log's full order) wins.
    const n = both.events.length
    ;[both.events[n - 2], both.events[n - 1]] = [both.events[n - 1]!, both.events[n - 2]!]
    expect(tile(both, '08:40').costs).toEqual(R2)
    expect(curve(both.energy('09:00'))).toEqual(curve(here.energy('09:00')))
  })

  it('zmiana sprzed startu: start z kosztem rutyny liczy swój – także nowszy niż zmiana (plik dotarł przed logiem drugiego komputera, T1440); zmiana po starcie – zawsze', () => {
    // pcb changed R → R2 at 07:50; this computer began at 08:00 with R3 – a newer file (a change of pcc whose log has not come yet).
    const s = startWith(routineCost(day([m()]), '07:50', R2, R, 'pcb'), '08:00', R3)
    expect(tile(s, '08:10')).toEqual({ costs: R3, base: R3, own: false, baseFrom: 'routine' })
    expect(curve(s.energy('08:30'))).toEqual(curve(startWith(day([m()]), '08:00', R3).energy('08:30')))
    // A change after the start reaches it from its minute, whichever computer wrote it.
    routineCost(s, '08:20', R2, R3, 'pcb')
    expect(tile(s, '08:30')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
    // Begun here with the old cost before the new file came: the cost of its start too (a known limit of two computers, T1440).
    const old = routineCost(day([m()]), '07:50', R2, R, 'pcb').start('m', '08:00')
    expect(tile(old, '08:10')).toEqual({ costs: R, base: R, own: false, baseFrom: 'routine' })
  })

  it('zmiana sprzed startu bez kosztu rutyny w zdarzeniu (T1372): start jej nie zna – liczy się od startu', () => {
    const s = routineCost(day([m()], null), '07:50', R2, R, 'pcb').start('m', '08:00')
    expect(tile(s, '08:10')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
  })

  it('start cofnięty i ponowny: ponowny liczy koszt rutyny swojego startu, zmiana po nim – od swojej chwili', () => {
    const s = day([m()])
    const t = s.at('08:00')
    s.write([{ id: 'first', k: 'block.start', block: 'm', at: t, bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null, routine: 'poranna', routineCosts: R }, confirmUntil: null, how: 'click' }], t)
    routineCost(s, '08:10', R2)
    s.write([{ k: 'undo', at: s.at('08:20'), target: 'first' }], s.at('08:20'))
    startWith(s, '08:30', R2)
    expect(tile(s, '08:40')).toEqual({ costs: R2, base: R2, own: false, baseFrom: 'routine' })
    routineCost(s, '08:45', null, R2)
    expect(tile(s, '08:50')).toEqual({ costs: RUTYNY, base: RUTYNY, own: false })
  })

  it('kalibracja: minuty z kosztem rutyny nie są dowodem; po zmianie rutyny na „jak podkategoria” – znów są', () => {
    const s = day([m()]).start('m', '08:00')
    routineCost(s, '08:40', null).end('m', '09:30')
    const ctx = s.contextAt(s.at('10:00'))
    expect(costEvidence(ctx, computeDay(ctx), true)!.minutes).toEqual({ rutyny: 50 })
  })

  it('kalibracja bierze koszt tak jak energia (startCostOf): start bez kosztu rutyny w zdarzeniu, bez zmiany tego dnia – koszt rutyny teraz, więc bez dowodu', () => {
    const s = day([m()], null).ran('m', '08:00', '09:30')
    const evidence = (routineCosts: Record<string, Costs>) => {
      const ctx = s.contextAt(s.at('10:00'), { routineCosts })
      return costEvidence(ctx, computeDay(ctx), true)!.minutes
    }
    // The routine has a cost now: the energy counts it (`startCostOf`) – no evidence for the subcategory; without one – evidence.
    expect(evidence({ poranna: R })).toEqual({})
    expect(evidence({})).toEqual({ rutyny: 90 })
  })

  it('zdarzenie: znane z polami routine, at, costs i was (−5…5 albo null); bierne dla silnika dnia', () => {
    const line = (o: Record<string, unknown>) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 1, l: 1, v: 14, day: DATE, dom: 'timer', at: 1, ...o })
    expect(parseEvent(line({ k: 'routine.cost', routine: 'poranna', costs: R2, was: null }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'routine.cost', routine: 'poranna', costs: null, was: R }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ k: 'routine.cost', routine: 'poranna', costs: { head: 6, emotions: 0, senses: 0 }, was: null }))).toEqual({ ok: false, why: 'pole costs' })
    expect(parseEvent(line({ k: 'routine.cost', routine: 'poranna', costs: null }))).toEqual({ ok: false, why: 'pole was' })
    expect(parseEvent(line({ k: 'routine.cost', costs: null, was: null }))).toEqual({ ok: false, why: 'pole routine' })
    const parsed = parseEvent(line({ k: 'routine.cost', routine: 'poranna', costs: null, was: null }))
    expect(parsed.ok && isPassive(parsed.event)).toBe(true)
    // Passive: the day (its facts, the end of work, the bedtime) as without it.
    const s = day([m()]).start('m', '08:00')
    const plain = s.state('09:00')
    routineCost(s, '08:30', R2)
    const changed = s.state('09:00')
    expect([changed.boundary, changed.workEnd, changed.bedtime, changed.facts.blocks.get('m')]).toEqual([plain.boundary, plain.workEnd, plain.bedtime, plain.facts.blocks.get('m')])
  })
})

describe('które zaczęte bloki zmiana kosztu rutyny sięga (costChangesOf, T1430)', () => {
  const plan = [
    m(),
    m({ id: 'own', costs: OWN }),
    m({ id: 'later', startMin: lm('12:00') }),
    m({ id: 'other', routine: 'wieczorna' }),
    { ...block({ id: 'inne', cat: 'inne', at: '08:00', min: 30 }), routine: 'poranna' }
  ]
  /** A start as this version writes it (`startPlanned`: with the block's routine and the routine's cost). */
  const begin = (s: Scenario, p: PlanBlock, o: { routine?: string | null; categoryId?: string } = {}) => {
    const planned = { categoryId: o.categoryId ?? p.categoryId, variantId: null, durationMin: p.durationMin, fixed: false, costs: p.costs, bgCostPct: null, routine: o.routine !== undefined ? o.routine : p.routine, routineCosts: null }
    s.write([{ k: 'block.start', block: p.id, at: s.at('08:00'), bg: false, planned, confirmUntil: null, how: 'click' }], s.at('08:00'))
  }
  const reached = (s: Scenario, ps: readonly PlanBlock[], time = '08:40') => {
    const ctx = { ...s.contextAt(s.at(time)), plan: ps }
    const changes = costChangesOf(ctx, computeDay(ctx).facts)
    return [...changes.entries()].filter(([, list]) => list.some((c) => c.routine)).map(([id]) => id).sort()
  }

  it('zaczęte bloki tej rutyny w kategorii rodzaju „rutyna” – także z własnym kosztem; bez niezaczętych, innej rutyny i innej kategorii', () => {
    const s = day(plan)
    for (const p of plan.filter((x) => x.id !== 'later')) begin(s, p)
    routineCost(s, '08:30', R2)
    expect(reached(s, plan)).toEqual(['m', 'own'])
    routineCost(s, '08:35', R2, null, undefined, 'wieczorna')
    expect(reached(s, plan)).toEqual(['m', 'other', 'own'])
  })

  it('rutyna i kategoria ze startu: blok, któremu po starcie zmieniono rutynę w planie, idzie za rutyną startu; kategoria startu innego rodzaju – nie', () => {
    const s = day(plan)
    begin(s, plan[0]!)
    begin(s, plan[1]!, { categoryId: 'inne' })
    routineCost(s, '08:30', R2)
    const changed = plan.map((b) => (b.id === 'm' ? { ...b, routine: 'wieczorna' } : b.id === 'own' ? { ...b, categoryId: 'rutyny' } : b))
    expect(reached(s, changed)).toEqual(['m'])
  })

  it('rutyna startu (startRoutine – jedna reguła silnika i liczby ✎): ze startu, także „bez rutyny”; start bez pola – z planu', () => {
    const planned = { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false }
    expect(startRoutine({ planned: { ...planned, routine: 'poranna' } }, { routine: 'wieczorna' })).toBe('poranna')
    expect(startRoutine({ planned: { ...planned, routine: null } }, { routine: 'wieczorna' })).toBeNull()
    expect(startRoutine({ planned }, { routine: 'wieczorna' })).toBe('wieczorna')
    expect(startRoutine({ planned }, undefined)).toBeNull()
  })

  it('start bez rutyny w zdarzeniu (starsza wersja) – rutyna i kategoria z planu', () => {
    const old = day([m()])
    old.write([{ k: 'block.start', block: 'm', at: old.at('08:00'), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null }, confirmUntil: null, how: 'click', v: 13 }], old.at('08:00'))
    routineCost(old, '08:30', R2)
    expect(reached(old, [m()])).toEqual(['m'])
    expect(reached(old, [m({ routine: 'wieczorna' })])).toEqual([])
  })
})
