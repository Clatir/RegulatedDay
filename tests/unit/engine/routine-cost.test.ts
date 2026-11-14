/**
 * D512: a routine's own cost per hour (−5…5 a pool, or none – „jak podkategoria”) and the order of a block's cost – its own, then its
 * routine's, then its variant's, then its category's. One rule for the engine (`costOf`), the tile (`blockCosts`, `begunCosts`), the
 * days of „Tydzień”, „Ułóż pod energię”, the variants at the reserve and the calibration's evidence. Only a block of a category of the kind
 * „rutyna” has its routine's cost (a routine left on a block of another category, where the panel hides it, costs nothing). A begun block
 * counts the routine's cost its start wrote (`planned.routineCosts`); a start of an older version (`v` < 14, no such field) – without it;
 * a start of this version without it (the routine's file could not be read then) – the routine's cost as known now.
 */
import { describe, expect, it } from 'vitest'
import { blockInfos, startPlanned, type BlockInfo } from '@shared/engine/blocks'
import { costKey } from '@shared/engine/calibration'
import { begunCosts } from '@shared/engine/costChange'
import { computeDay } from '@shared/engine/day'
import { computeEnergy, type EnergyState } from '@shared/engine/energy'
import { energyOrderVariant } from '@shared/engine/energyOrder'
import { variantCauses, variantsFor } from '@shared/engine/variants'
import { horizonDay } from '@shared/engine/week'
import type { Costs, Pool } from '@shared/model/categories'
import type { Answer } from '@shared/model/events'
import type { PlanBlock } from '@shared/model/plan'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { block, Scenario } from './dsl'

const DATE = '2026-11-18'
const R: Costs = { head: 5, emotions: 4, senses: -2 }
const ZERO_COSTS: Costs = { head: 0, emotions: 0, senses: 0 }
const ANSWERS: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }

/** A block of the plan pointing at a routine. */
const withRoutine = (b: PlanBlock, routine: string): PlanBlock => ({ ...b, routine })
/** The day's energy at every minute (the past and the forecast) – what two days are compared by. */
const curve = (e: EnergyState) => (['head', 'emotions', 'senses'] as const).map((p) => Array.from(e.series[p]))

/**
 * A day with a check-in at 07:00 and `plan`; `routineCosts` – the routines' costs the window knows (none – a version without them);
 * `settings` – over the defaults.
 */
function day(plan: PlanBlock[], routineCosts?: Record<string, Costs>, settings?: Record<string, unknown>): Scenario {
  return new Scenario({ date: DATE, plan, wake: '06:30', ...(routineCosts ? { routineCosts } : {}), ...(settings ? { settings } : {}) }).observe('06:30', null).checkin('07:00', ANSWERS)
}
/** A block of „Rutyny” (the kind „rutyna”, 1 · 0 · 1). */
const m = (o: Partial<PlanBlock> = {}) => ({ ...block({ id: 'm', cat: 'rutyny', at: '08:00', min: 90 }), ...o })
/** A start as a version before routine costs wrote it (`v` 13, no `routineCosts`), or as this one when the routine's file could not be read. */
const rawStart = (s: Scenario, at: string, v: number) =>
  s.write([{ k: 'block.start', block: 'm', at: s.at(at), bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, bgCostPct: null, routine: 'poranna' }, confirmUntil: null, how: 'click', v }], s.at(at))

describe('koszt rutyny w silniku energii (D512)', () => {
  it('blok z rutyną z kosztem liczy koszt rutyny – jak ten sam koszt własny bloku; bez kosztu rutyny – koszt kategorii', () => {
    const viaRoutine = day([withRoutine(m(), 'poranna')], { poranna: R }).energy('07:30')
    const asOwn = day([m({ costs: R })]).energy('07:30')
    const category = day([withRoutine(m(), 'poranna')], {}).energy('07:30')
    expect(curve(viaRoutine)).toEqual(curve(asOwn))
    expect(curve(viaRoutine)).not.toEqual(curve(category))
    // A routine without a cost of its own (not in the map) – the category's, as before D512.
    expect(curve(category)).toEqual(curve(day([m()]).energy('07:30')))
  })

  it('rutyna przed wariantem: wariant „Rutyn” z własnym kosztem, blok z rutyną – kosztuje jak rutyna', () => {
    const settings = { categories: { rutyny: { variants: [{ id: 'krotka', name: 'Krótka', costs: { head: -2, emotions: -2, senses: -2 } }] } } }
    const short = (o: Partial<PlanBlock>) => m({ variantId: 'krotka', ...o })
    expect(curve(day([withRoutine(short({}), 'r')], { r: R }, settings).energy('07:30'))).toEqual(curve(day([short({ costs: R })], undefined, settings).energy('07:30')))
    // Without the routine the variant's cost counts (the variant is there).
    expect(curve(day([short({})], undefined, settings).energy('07:30'))).not.toEqual(curve(day([m()]).energy('07:30')))
  })

  it('rutyna zostawiona na bloku kategorii innego rodzaju (panel jej nie pokazuje) nie daje kosztu: silnik, kafelek, start', () => {
    const hidden = { ...block({ id: 'm', cat: 'inne', at: '08:00', min: 90 }), routine: 'poranna' }
    const s = day([hidden], { poranna: R })
    expect(curve(s.energy('07:30'))).toEqual(curve(day([block({ id: 'm', cat: 'inne', at: '08:00', min: 90 })]).energy('07:30')))
    const ctx = s.contextAt(s.at('07:30'))
    const state = computeDay(ctx)
    const info = state.blocks.find((b) => b.id === 'm')!
    expect(info.routineCosts).toBeNull()
    expect(startPlanned(info, ctx.plan)).toMatchObject({ routineCosts: null })
    s.start('m', '08:00')
    const ctx2 = s.contextAt(s.at('08:10'))
    const state2 = computeDay(ctx2)
    expect(begunCosts(ctx2, state2, state2.blocks.find((b) => b.id === 'm')!)).toEqual({ costs: { head: 1, emotions: 1, senses: 1 }, base: { head: 1, emotions: 1, senses: 1 }, own: false })
  })

  it('własny koszt bloku wygrywa z kosztem rutyny', () => {
    const own: Costs = { head: -1, emotions: 2, senses: 0 }
    expect(curve(day([withRoutine(m({ costs: own }), 'poranna')], { poranna: R }).energy('07:30'))).toEqual(curve(day([m({ costs: own })]).energy('07:30')))
  })

  it('zaczęty blok liczy koszt rutyny ze startu: rutyna zmieniona po starcie nic mu nie zmienia', () => {
    const s = day([withRoutine(m(), 'poranna')], { poranna: R }).start('m', '08:00')
    const b = day([m({ costs: R })]).start('m', '08:00')
    const at = s.at('08:30')
    const ctx = s.contextAt(at, { routineCosts: { poranna: ZERO_COSTS } })
    const edited = computeEnergy(ctx, computeDay(ctx))
    expect(curve(edited)).toEqual(curve(b.energy('08:30')))
    expect(computeDay(ctx).facts.blocks.get('m')!.planned!.routineCosts).toEqual(R)
  })

  it('start starszej wersji (v 13, bez pola kosztu rutyny) – blok liczy się bez kosztu rutyny, przeszłość się nie zmienia', () => {
    const old = day([withRoutine(m(), 'poranna')], { poranna: R })
    rawStart(old, '08:00', 13)
    const category = day([withRoutine(m(), 'poranna')]).start('m', '08:00')
    expect(curve(old.energy('08:30'))).toEqual(curve(category.energy('08:30')))
    expect(old.state('08:30').facts.blocks.get('m')!.planned!.routineCosts).toBeNull()
  })

  it('start tej wersji bez pola (plik rutyny był nieczytelny) – koszt rutyny znany teraz, nie zamrożony brak', () => {
    const s = day([withRoutine(m(), 'poranna')], { poranna: R })
    rawStart(s, '08:00', 14)
    expect(s.state('08:30').facts.blocks.get('m')!.planned!.routineCosts).toBeUndefined()
    expect(curve(s.energy('08:30'))).toEqual(curve(day([withRoutine(m(), 'poranna')], { poranna: R }).start('m', '08:00').energy('08:30')))
  })

  it('rutyna, której pliku nie da się teraz odczytać: blok bez jej kosztu, a start nie zapisuje pustego kosztu', () => {
    const s = day([withRoutine(m(), 'poranna')], { poranna: R })
    const ctx = s.contextAt(s.at('07:30'), { routineCosts: { poranna: 'unknown' } })
    const info = computeDay(ctx).blocks.find((b) => b.id === 'm')!
    expect(info.routineCosts).toBeUndefined()
    expect(startPlanned(info, ctx.plan)).not.toHaveProperty('routineCosts')
    expect(curve(computeEnergy(ctx, computeDay(ctx)))).toEqual(curve(day([m()]).energy('07:30')))
  })

  it('koszt rutyny spoza zakresu w zdarzeniu startu nie jest kosztem (jak brak kosztu rutyny)', () => {
    const s = day([withRoutine(m(), 'poranna')], { poranna: R })
    const t = s.at('08:00')
    s.write([{ k: 'block.start', block: 'm', at: t, bg: false, planned: { categoryId: 'rutyny', variantId: null, durationMin: 90, fixed: false, costs: null, routineCosts: { head: 9, emotions: 0, senses: 0 } }, confirmUntil: null, how: 'click' }], t)
    expect(s.state('08:10').facts.blocks.get('m')!.planned!.routineCosts).toBeNull()
    expect(curve(s.energy('08:30'))).toEqual(curve(day([m()]).start('m', '08:00').energy('08:30')))
  })

  it('„Jak kategoria” na zaczętym bloku (block.cost null) wraca do kosztu rutyny, nie kategorii', () => {
    const back = day([withRoutine(m(), 'poranna')], { poranna: R }).start('m', '08:00')
    const asOwn = day([withRoutine(m(), 'poranna')], { poranna: R }).start('m', '08:00')
    for (const [s, last] of [
      [back, null],
      [asOwn, R]
    ] as const) {
      s.write([{ k: 'block.cost', block: 'm', at: s.at('08:10'), costs: ZERO_COSTS }], s.at('08:10'))
      s.write([{ k: 'block.cost', block: 'm', at: s.at('08:20'), costs: last }], s.at('08:20'))
    }
    expect(curve(back.energy('08:40'))).toEqual(curve(asOwn.energy('08:40')))
  })
})

describe('koszt rutyny na kafelku i w zdarzeniu startu (D512)', () => {
  it('zaczęty blok: koszt rutyny ze startu, „Jak kategoria” wraca do niego; zmiana na kafelku wygrywa', () => {
    const s = day([withRoutine(m(), 'poranna')], { poranna: R }).start('m', '08:00')
    const ctx = s.contextAt(s.at('08:10'))
    const state = computeDay(ctx)
    const info = state.blocks.find((b) => b.id === 'm')!
    expect(begunCosts(ctx, state, info)).toEqual({ costs: R, base: R, own: false })
    const own: Costs = { head: 1, emotions: 1, senses: 1 }
    s.write([{ k: 'block.cost', block: 'm', at: s.at('08:20'), costs: own }], s.at('08:20'))
    const ctx2 = s.contextAt(s.at('08:30'))
    const state2 = computeDay(ctx2)
    expect(begunCosts(ctx2, state2, state2.blocks.find((b) => b.id === 'm')!)).toEqual({ costs: own, base: R, own: true })
  })

  it('start bloku zapisuje koszt rutyny z tej chwili (blok bez rutyny – null)', () => {
    const s = day([withRoutine(m(), 'poranna'), block({ id: 'x', cat: 'analiza', at: '10:00', min: 30 })], { poranna: R })
    const ctx = s.contextAt(s.at('07:30'))
    const state = computeDay(ctx)
    const by = new Map(state.blocks.map((b) => [b.id, b]))
    expect(by.get('m')!.routineCosts).toEqual(R)
    expect(startPlanned(by.get('m')!, ctx.plan)).toMatchObject({ routine: 'poranna', routineCosts: R })
    expect(startPlanned(by.get('x')!, ctx.plan)).toMatchObject({ routineCosts: null })
  })

  it('identyfikator rutyny, który jest nazwą pola obiektu, nie daje kosztu', () => {
    const s = day([withRoutine(m(), 'constructor'), withRoutine(block({ id: 'p', cat: 'rutyny', at: '10:00', min: 30 }), '__proto__')], { poranna: R })
    const state = s.state('07:30')
    const infos = blockInfos(state.grid, s.opts.plan, state.facts, DEFAULT_SETTINGS, { poranna: R })
    expect(infos.map((b) => b.routineCosts)).toEqual([null, null])
  })
})

describe('kopie reguły kosztu z rutyną (D512)', () => {
  it('„Tydzień” i „3 dni”: kafelek bloku z rutyną mówi koszt rutyny, „Jak kategoria” wraca do niego', () => {
    const s = new Scenario({ date: DATE, plan: [withRoutine(m(), 'poranna'), m({ id: 'own', startMin: 11 * 60, costs: ZERO_COSTS, routine: 'poranna' })], routineCosts: { poranna: R } })
    const by = Object.fromEntries(horizonDay(s.contextAt(s.at('04:00')), 'future').blocks.map((b) => [b.id, b.cost]))
    expect(by.m).toEqual({ costs: R, base: R, own: false, edit: true })
    expect(by.own).toEqual({ costs: ZERO_COSTS, base: R, own: true, edit: true })
  })

  it('wariant przy rezerwie: najdroższy blok puli liczy koszt rutyny', () => {
    // „Rutyny” (head 1; here neither protected nor kept from tomorrow) with a routine of head 5 – dearer than „Analiza” (head 3): it goes.
    const plan = [withRoutine(block({ id: 'a', cat: 'rutyny', at: '13:00', min: 60 }), 'poranna'), block({ id: 'b', cat: 'analiza', at: '14:00', min: 90 })]
    const settings = { categories: { rutyny: { protected: false, noMoveTomorrow: false } } }
    const s = new Scenario({ date: DATE, plan, settings, routineCosts: { poranna: R } }).observe('07:00', null)
    const st = s.state('12:00')
    const energy = { known: true, enabled: true, variants: true, atReserve: { head: true, emotions: false, senses: false }, descents: [{ pool: 'head', at: st.now, silent: false }] } as unknown as EnergyState
    const cause = variantCauses(st, energy).find((c) => c.kind === 'energy')!
    const v = variantsFor(s.contextAt(s.at('12:00')), st, cause, (b) => b.categoryId)
    expect(v[0]!.changes).toContainEqual({ k: 'tomorrow', block: 'a' })
  })

  it('„Ułóż pod energię”: koszt z rutyny układa dzień tak samo jak ten sam koszt własny bloku', () => {
    const DEAR: Costs = { head: 5, emotions: 2, senses: 1 }
    const plan = (e: Partial<PlanBlock>) => [
      block({ id: 'c', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'r', cat: 'regeneracja', variant: 'drzemka', at: '09:00', min: 60 }),
      { ...block({ id: 'e', cat: 'rutyny', at: '10:00', min: 60 }), ...e },
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 370, fixed: true })
    ]
    const variant = (s: Scenario) => {
      const ctx = s.contextAt(s.at('07:30'))
      const state = computeDay(ctx)
      return energyOrderVariant(ctx, state, computeEnergy(ctx, state), (b) => b.id, { top: 1 })
    }
    const own = variant(new Scenario({ date: DATE, plan: plan({ costs: DEAR }), wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null).checkin('07:00', ANSWERS))
    const viaRoutine = variant(new Scenario({ date: DATE, plan: plan({ routine: 'trudna' }), wake: '06:30', settings: { transitionBufferMin: 0 }, routineCosts: { trudna: DEAR } }).observe('06:30', null).checkin('07:00', ANSWERS))
    expect(own).not.toBeNull()
    expect(viaRoutine).toEqual(own)
  })

  it('wariant przy rezerwie: koszt bloku z reguł bloku – kategoria o nazwie pola obiektu („constructor”) nie psuje liczenia', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '13:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '14:00', min: 90 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const st = s.state('12:00')
    // The block's rules are „Analiza”'s; only its id is a name of Object.prototype's (no category of the settings has it).
    for (const p of st.forecast) if (p.block.id === 'b') (p.block as { categoryId: BlockInfo['categoryId'] }).categoryId = 'constructor'
    const energy = { known: true, enabled: true, variants: true, atReserve: { head: true, emotions: false, senses: false }, descents: [{ pool: 'head', at: st.now, silent: false }] } as unknown as EnergyState
    const cause = variantCauses(st, energy).find((c) => c.kind === 'energy')!
    expect(variantsFor(s.contextAt(s.at('12:00')), st, cause, (b) => b.categoryId)[0]!.changes).toContainEqual({ k: 'tomorrow', block: 'b' })
  })

  it('kalibracja: blok, który biegł z kosztem rutyny, nie jest dowodem dla kosztu kategorii ani wariantu', () => {
    expect(costKey(DEFAULT_SETTINGS, { categoryId: 'inne', variantId: null, costs: null, routineCosts: R })).toBeNull()
    expect(costKey(DEFAULT_SETTINGS, { categoryId: 'inne', variantId: null, costs: null, routineCosts: null })).toBe('inne')
    // A start of an older version (no field): its category, as before.
    expect(costKey(DEFAULT_SETTINGS, { categoryId: 'inne', variantId: null, costs: null })).toBe('inne')
  })
})
