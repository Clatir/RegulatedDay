/**
 * The variants of a change of the plan (E5, spec „Warianty zmiany planu”): for a request that pushes the end of work
 * past the boundary, for a block dragged past its planned end, and for a pool at the reserve – 2–3 deterministic
 * variants, the candidates first from the same gap between fixed blocks, then the latest; protected blocks never.
 */
import { describe, expect, it } from 'vitest'
import type { EnergyState } from '@shared/engine/energy'
import { applyVariant, markerCause, planCause, planWith, variantCauses, variantsFor } from '@shared/engine/variants'
import { dayFileFrom } from '@shared/model/plan'
import { block, Scenario } from './dsl'

const DATE = '2026-10-28'
const names = (b: { categoryId: string }) => ({ inne: 'Inne obowiązki', analiza: 'Analiza', posilek: 'Posiłek', 'zajecia-zdalne': 'Zajęcia zdalne' })[b.categoryId] ?? b.categoryId

describe('warianty przy brakującym czasie', () => {
  it('prośba dopisana po fakcie wypycha koniec pracy za granicę: skróć, przesuń na jutro, zostaw', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'b', cat: 'analiza', at: '10:00', min: 120 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('12:15', '07:30')
    // The request is written in at 10:45, at the end of „a” (it ran past its 0 at 10:00 too).
    s.start('a', '08:00').end('a', '10:45').request('r1', '08:30', '09:15', 'urgent')
    s.events.filter((e) => (e as { k?: string }).k?.startsWith('request.')).forEach((e) => ((e as { t: number }).t = s.at('10:45')))
    const st = s.state('10:46')
    const causes = variantCauses(st, null)
    expect(causes.map((c) => [c.kind, c.id.replace(/^variants:[\d-]+:/, '')])).toEqual([
      ['time', 'overrun:a:360'],
      ['time', 'request:r1:start'],
      ['time', 'request:r1:end']
    ])
    const cause = causes.at(-1)!
    expect(cause.at).toBe(s.at('10:45'))
    const v = variantsFor(s.contextAt(s.at('10:46')), st, cause, names)
    expect(v.map((x) => x.id)).toEqual(['shorten', 'tomorrow', 'keep'])
    expect(v[0]!.changes).toEqual([{ k: 'shorten', block: 'b', toMin: 120 - (cause as { minutes: number }).minutes }])
    expect(v[0]!.effect.withinBoundary).toBe(true)
    expect(v[1]!.label).toMatch(/^Przesuń Analiza na jutro/)
    expect(v[2]!.label).toMatch(/^Zostaw · przedłużenie \d+ min$/)
    // Deterministic: the same day gives the same variants.
    expect(variantsFor(s.contextAt(s.at('10:46')), st, cause, names)).toEqual(v)
  })

  it('blok po 0: wyzwala sprawdzenie dopiero po 2 min bez reakcji; „Przedłuż” przesuwa jego 0', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '09:00', min: 120 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('11:00', '07:30')
    s.start('a', '08:00')
    const ids = (time: string) => variantCauses(s.state(time), null).map((c) => c.id.replace(/^variants:[\d-]+:/, ''))
    expect(ids('09:01')).toEqual([])
    expect(ids('09:02')).toEqual(['overrun:a:300'])
    const t = new Scenario({ date: DATE, plan }).observe('07:00', null)
    t.approve('11:00', '07:30')
    t.start('a', '08:00').extend('a', 15, '09:01')
    expect(variantCauses(t.state('09:10'), null)).toEqual([])
    expect(variantCauses(t.state('09:17'), null).map((c) => c.id.replace(/^variants:[\d-]+:/, ''))).toEqual(['overrun:a:315'])
    // A pause is a reaction too: the block paused at 09:01 does not trigger it.
    const p = new Scenario({ date: DATE, plan }).observe('07:00', null)
    p.approve('11:00', '07:30')
    p.start('a', '08:00').pause('a', '09:01')
    expect(variantCauses(p.state('09:30'), null)).toEqual([])
  })

  it('blok stały, który zaczął się nad biegnącym blokiem elastycznym, wyzwala sprawdzenie', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 120 }), block({ id: 'w', cat: 'zajecia-zdalne', at: '09:00', min: 60, fixed: true }), block({ id: 'c', cat: 'analiza', at: '10:00', min: 60 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('11:15', '07:30')
    s.start('a', '08:00').pause('a', '09:00').start('w', '09:00')
    const causes = variantCauses(s.state('09:01'), null)
    expect(causes.map((c) => c.id.replace(/^variants:[\d-]+:/, ''))).toEqual(['fixed:w:a'])
    expect(causes[0]!.at).toBe(s.at('09:00'))
  })

  it('przeciągnięty blok: kandydaci najpierw z tej samej przerwy między blokami stałymi, potem najpóźniejsze', () => {
    const plan = [
      block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }),
      block({ id: 'b', cat: 'inne', at: '09:00', min: 60 }),
      block({ id: 'w', cat: 'zajecia-zdalne', at: '11:00', min: 60, fixed: true }),
      block({ id: 'c', cat: 'analiza', at: '12:00', min: 120 })
    ]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('13:30', '07:30')
    // „a” ran 60 min over its end: the end of work 14:00 is 30 min past the boundary.
    s.start('a', '08:00')
    const st = s.state('10:00')
    const cause = variantCauses(st, null)[0]!
    expect(cause.kind).toBe('time')
    const v = variantsFor(s.contextAt(s.at('10:00')), st, cause, names)
    // „b” is in the same gap (before the fixed class): it is shortened first, the latest „c” only after it.
    expect(cause).toMatchObject({ minutes: 30 })
    expect(v[0]!.changes).toEqual([{ k: 'shorten', block: 'b', toMin: 30 }])
    expect(v[1]!.changes).toEqual([{ k: 'tomorrow', block: 'b' }])
  })

  it('prośba pauzuje ostatni blok pracy, a wznowienie kosztuje: przyczyna z prognozy (blok czeka, ale praca jeszcze będzie)', () => {
    const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
    s.approve('09:00', '07:30')
    s.start('a', '08:00').pause('a', '08:30').request('r1', '08:30', '08:50')
    const st = s.state('08:51')
    const causes = variantCauses(st, null)
    expect(causes.map((c) => c.id.replace(/^variants:[\d-]+:/, ''))).toEqual(['request:r1:start', 'request:r1:end'])
    expect(causes.at(-1)).toMatchObject({ kind: 'time', minutes: 21 })
  })

  it('pilna prośba z szacunkiem: prognoza zna go od razu – przyczyna już przy jej starcie', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 }), block({ id: 'b', cat: 'inne', at: '09:00', min: 60 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('10:30', '07:30')
    s.start('a', '08:00').pause('a', '08:30')
    s.raw({ k: 'request.start', request: 'r1', at: s.at('08:30'), mode: 'urgent', person: null, estimateMin: 45, hardEndAt: null, interrupts: 'a' }, '08:30')
    const causes = variantCauses(s.state('08:31'), null)
    expect(causes.map((c) => c.id.replace(/^variants:[\d-]+:/, ''))).toEqual(['request:r1:start'])
    // „a” after the estimate (09:15–09:45), „b” after it: the end of work 10:45, 15 min past the boundary.
    expect(causes[0]).toMatchObject({ minutes: 15 })
  })

  it('etykieta końca pracy po północy ma „+1”', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '20:00', min: 120 }), block({ id: 'b', cat: 'inne', at: '22:00', min: 150 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('22:30', '19:30')
    s.start('a', '20:00')
    // „a” runs to 23:50: „b” (150 min) shortened to 15 min still ends after midnight.
    const st = s.state('23:50')
    const v = variantsFor(s.contextAt(s.at('23:50')), st, variantCauses(st, null).at(-1)!, names)
    expect(v[0]).toMatchObject({ id: 'shorten', changes: [{ k: 'shorten', block: 'b', toMin: 15 }] })
    expect(v[0]!.label).toBe('Skróć Inne obowiązki o 135 min · koniec pracy 00:05 +1')
  })

  it('blok chroniony i blok stały nigdy nie są kandydatami; bez kandydatów zostaje tylko „Zostaw”', () => {
    const plan = [block({ id: 'w', cat: 'zajecia-zdalne', at: '08:00', min: 300, fixed: true }), block({ id: 'm', cat: 'posilek', at: '13:00', min: 30 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    s.approve('12:00', '07:30')
    s.start('w', '08:00')
    const st = s.state('09:00')
    const cause = { kind: 'time' as const, id: 'variants:x', at: s.at('09:00'), minutes: 60 }
    expect(variantsFor(s.contextAt(s.at('09:00')), st, cause, names).map((x) => x.id)).toEqual(['keep'])
  })
})

describe('warianty przy rezerwie energii', () => {
  it('pula na poziomie rezerwy: regeneracja sposobem dobranym do puli i najdroższy blok tej puli na jutro albo krócej', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '13:00', min: 60 }), block({ id: 'b', cat: 'analiza', at: '14:00', min: 90 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const st = s.state('12:00')
    const energy = { known: true, enabled: true, variants: true, atReserve: { head: true, emotions: false, senses: false }, descents: [{ pool: 'head', at: st.now, silent: false }] } as unknown as EnergyState
    const cause = variantCauses(st, energy).find((c) => c.kind === 'energy')!
    expect(cause).toMatchObject({ pool: 'head' })
    const v = variantsFor(s.contextAt(s.at('12:00')), st, cause, names)
    expect(v.map((x) => x.id)).toEqual(['regenTomorrow', 'regenShorter', 'keep'])
    // „Analiza” costs the head the most (3 per hour against 1): it goes.
    expect(v[0]!.changes).toEqual([expect.objectContaining({ k: 'regen', durationMin: 20 }), { k: 'tomorrow', block: 'b' }])
    expect(v[0]!.label).toMatch(/20 min teraz · Analiza na jutro$/)
    // The regeneration lands in the plan as a block.
    expect(planWith(s.contextAt(s.at('12:00')), v[0]!.changes).some((p) => p.categoryId === 'regeneracja')).toBe(true)
  })

  it('„Przestaw plan” bez znacznika: przyczyna z chwili – pula w rezerwie, ale nie w okresie kalibracji (reakcje tylko informują)', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '13:00', min: 60 })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const st = s.state('12:00')
    const energy = (variants: boolean) => ({ known: true, enabled: true, variants, atReserve: { head: true, emotions: false, senses: false }, descents: [] }) as unknown as EnergyState
    expect(planCause(st, energy(true), s.at('12:00'))).toMatchObject({ kind: 'energy', pool: 'head' })
    expect(planCause(st, energy(false), s.at('12:00'))).toBeNull()
    expect(planCause(st, null, s.at('12:00'))).toBeNull()
  })

  it('wybrany wariant jako pliki dni: krótszy blok, blok na jutro bez licznika przeniesień, regeneracja do startu', () => {
    const plan = [block({ id: 'a', cat: 'inne', at: '13:00', min: 60, origin: 'user' }), block({ id: 'b', cat: 'analiza', at: '14:00', min: 90, origin: 'user' })]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const ctx = s.contextAt(s.at('12:00'))
    const raw = { schema: 1, date: DATE, blocks: plan }
    const r = applyVariant(ctx, raw, null, { id: 'x', label: '', effect: { workEndMin: null, extensionMin: 0, regenMin: 0, withinBoundary: true }, changes: [{ k: 'shorten', block: 'a', toMin: 30 }, { k: 'tomorrow', block: 'b' }, { k: 'regen', startMin: 12 * 60, durationMin: 20, variantId: 'cisza' }] }, '2026-10-29')
    const today = dayFileFrom(r.today, DATE)
    expect(today.blocks.find((b) => b.id === 'a')!.durationMin).toBe(30)
    expect(today.blocks.some((b) => b.id === 'b')).toBe(false)
    expect(today.blocks.find((b) => b.id === r.start)).toMatchObject({ categoryId: 'regeneracja', variantId: 'cisza', startMin: 720 })
    const moved = dayFileFrom(r.tomorrow, '2026-10-29').blocks.find((b) => b.id === 'b')!
    expect(moved).toMatchObject({ movedFrom: DATE, moves: 0 })
  })

  it('znacznik raz na przyczynę, tylko przy wyzwalaczu: zostaje, póki przyczyna trwa; zamknięty nie wraca; w trybie sesji i zajęć czeka', () => {
    const T = Date.UTC(2026, 9, 28, 9)
    const M = 60_000
    const cause = { kind: 'time' as const, id: 'variants:x:request:r1:end', at: T, minutes: 30 }
    const none = new Set<string>()
    const at = (now: number, o: Partial<Parameters<typeof markerCause>[1]> = {}) => markerCause([cause], { shown: none, done: none, quiet: false, lastQuiet: null, now, ...o })
    expect(at(T + 1 * M)).toBe(cause)
    // Not checked at its trigger (the app was not running, the cause came later): no marker.
    expect(at(T + 10 * M)).toBeNull()
    expect(at(T + 10 * M, { shown: new Set([cause.id]) })).toBe(cause)
    expect(at(T + 1 * M, { done: new Set([cause.id]) })).toBeNull()
    expect(at(T + 1 * M, { quiet: true })).toBeNull()
    // Shown before a session: hidden in it, back after it while the cause holds.
    expect(at(T + 30 * M, { quiet: true, shown: new Set([cause.id]) })).toBeNull()
    expect(at(T + 90 * M, { shown: new Set([cause.id]), lastQuiet: { from: T + 20 * M, to: T + 80 * M } })).toBe(cause)
    // The trigger fell in the session mode: it is checked at the mode's end.
    expect(at(T + 62 * M, { lastQuiet: { from: T - 30 * M, to: T + 60 * M } })).toBe(cause)
    expect(at(T + 70 * M, { lastQuiet: { from: T - 30 * M, to: T + 60 * M } })).toBeNull()
  })

  it('w okresie kalibracji (bez wariantów energii) albo przy nieznanej energii przyczyny energii nie ma', () => {
    const s = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    const st = s.state('12:00')
    const calibrating = { known: true, enabled: true, variants: false, atReserve: { head: true, emotions: false, senses: false }, descents: [] } as unknown as EnergyState
    expect(variantCauses(st, calibrating)).toEqual([])
  })
})
