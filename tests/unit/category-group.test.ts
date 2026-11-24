/**
 * Zaznaczanie w „Kategoriach” (D608, D609, N13) – czysta zmiana grupowa drzewa (`model/categoryGroup.ts`): koszt sześciu podkategorii od jutra
 * jednym wpisem ustawień, ✓ / „—” okna „Koszt…”, wariant bez własnego kosztu dostaje własny, przeniesienie z pominięciem wariantów, usunięcie
 * (archiwum; dodana od daty – znika całkiem), „Cofnij” tylko tego, co stoi jak po zmianie (`kept`).
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, costsOf } from '@shared/model/categories'
import {
  categoryKey,
  commonPools,
  treeCount,
  treeGroupStep,
  treeGroupUndo,
  treeItemOf,
  treeKeptText,
  treeLineText,
  treeOrder,
  treeValues,
  variantKey,
  type TreeAction
} from '@shared/model/categoryGroup'
import { categoryTree, groupOfCategory, HOME_GROUP, WORK_GROUP } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'

const TODAY = '2026-11-24'
const TOMORROW = '2026-11-25'
const FROM: { from: string; at: number | null } = { from: TOMORROW, at: null }

type Raw = Record<string, unknown>
let made = 0
/** rd.json with the dated patch written as `withSettingsChange` writes it (one more change from the date). */
const written = (raw: Raw, patch: Record<string, unknown> | null, f = FROM): Raw =>
  patch ? { ...raw, settings: [...(Array.isArray(raw.settings) ? raw.settings : []), { id: `ch${++made}`, from: f.from, at: f.at, made: 1000 + made, patch }] } : raw
const on = (raw: Raw, date: string) => settingsOn(rdFrom(raw).settings, date)
/** A change applied as the window applies it (rd.json part and the dated part in one record). */
const apply = (raw: Raw, keys: string[], a: TreeAction, f = FROM) => {
  const step = treeGroupStep(raw, keys, a, f, TODAY)
  return { step, raw: written(step.raw, step.patch, f) }
}

/** Six subcategories whose body cost is not 2 (the starting ones). */
const SIX = DEFAULT_CATEGORIES.filter((c) => c.costs.body !== 2)
  .slice(0, 6)
  .map((c) => c.id)

describe('klucze i kolejność drzewa', () => {
  it('klucz podkategorii i wariantu wraca do elementu; obcy tekst – nic', () => {
    expect(treeItemOf(categoryKey('analiza'))).toEqual({ kind: 'category', category: 'analiza' })
    expect(treeItemOf(variantKey('nauka', 'sluchanie'))).toEqual({ kind: 'variant', category: 'nauka', variant: 'sluchanie' })
    expect(treeItemOf('analiza')).toBeNull()
  })

  it('kolejność widoczna: podkategorie po grupach, warianty tylko otwartej (archiwalne z archiwum)', () => {
    const raw = { schema: 1 }
    const s = on(raw, TOMORROW)
    const tree = categoryTree(rdFrom(raw), s.categories)
    const order = treeOrder(tree, s.categories, 'nauka', false)
    const at = order.indexOf(categoryKey('nauka'))
    expect(order[at + 1]).toBe(variantKey('nauka', 'sluchanie'))
    expect(order.filter((k) => treeItemOf(k)?.kind === 'variant')).toEqual([variantKey('nauka', 'sluchanie')])
    expect(order.filter((k) => treeItemOf(k)?.kind === 'category')).toHaveLength(Object.keys(s.categories).length)
    // Every subcategory's variants – what a selection keeps when one is folded.
    const all = treeOrder(tree, s.categories, 'all', false)
    expect(all).toContain(variantKey('regeneracja', 'spacer'))
    expect(all.filter((k) => treeItemOf(k)?.kind === 'variant')).toHaveLength(Object.values(s.categories).reduce((n, c) => n + c.variants.length, 0))
  })
})

describe('Koszt… (D609)', () => {
  it('sześć podkategorii dostaje ciało 2 od jutra jednym wpisem ustawień; dziś bez zmiany', () => {
    const before = { schema: 1 }
    const { step, raw } = apply(before, SIX.map(categoryKey), { kind: 'costs', costs: { body: 2 } })
    expect(step.changes).toHaveLength(6)
    expect(Array.isArray(raw.settings) && raw.settings.length).toBe(1)
    for (const id of SIX) {
      const was = DEFAULT_CATEGORIES.find((c) => c.id === id)!.costs
      expect(on(raw, TOMORROW).categories[id]!.costs).toEqual({ ...was, body: 2 })
      expect(on(raw, TODAY).categories[id]!.costs).toEqual(was)
    }
    expect(treeLineText('costs', step.changes, step.skipped)).toBe('Zmieniono 6 podkategorii')
  })

  it('pula nietknięta zostaje każdemu; już takie – bez zmiany (same), nic się nie zmienia – bez wpisu', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), categoryKey('projekty')], { kind: 'costs', costs: { head: 3 } })
    expect(step.changes).toHaveLength(0)
    expect(step.same).toBe(2)
    expect(step.patch).toBeNull()
    expect(raw.settings).toBeUndefined()
  })

  it('wariant bez własnego kosztu dostaje własny (z kosztu podkategorii, zmieniona pula – nowa)', () => {
    const { step, raw } = apply({ schema: 1 }, [variantKey('sprawy', 'przy-komputerze'), variantKey('nauka', 'sluchanie')], { kind: 'costs', costs: { senses: 4 } })
    expect(step.changes.map((c) => c.before)).toEqual([null, { head: 2, emotions: 0, senses: 0, body: 0 }])
    const s = on(raw, TOMORROW)
    expect(s.categories.sprawy!.variants.find((v) => v.id === 'przy-komputerze')!.costs).toEqual({ head: 1, emotions: 1, senses: 4, body: 1 })
    expect(costsOf(s.categories.nauka!, 'sluchanie')).toEqual({ head: 2, emotions: 0, senses: 4, body: 0 })
    // The rest of the lists stays as it was (name, place).
    expect(s.categories.nauka!.variants[0]!.place).toBe('passive')
    expect(treeLineText('costs', step.changes, step.skipped)).toBe('Zmieniono 2 warianty')
  })

  it('✓ / „—”: wspólna wartość puli albo null (różne); koszt wariantu bez własnego – podkategorii', () => {
    const s = on({ schema: 1 }, TOMORROW)
    const list = [categoryKey('analiza'), categoryKey('journaling'), categoryKey('projekty')].map((k) => treeValues(s, treeItemOf(k)!)!.costs)
    expect(commonPools(list)).toEqual({ head: 3, emotions: null, senses: 1, body: 0 })
    expect(treeValues(s, treeItemOf(variantKey('sprawy', 'przy-komputerze'))!)).toEqual({ costs: { head: 1, emotions: 1, senses: 1, body: 1 }, place: 'computer' })
    expect(commonPools([])).toEqual({ head: null, emotions: null, senses: null, body: null })
  })
})

describe('miejsce, przeniesienie, usunięcie (D609)', () => {
  it('miejsce: podkategorie i warianty (wariant dostaje własne); już takie – bez zmiany', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), categoryKey('posilek'), variantKey('nauka', 'sluchanie')], { kind: 'place', place: 'away' })
    expect(step.changes.map((c) => c.key)).toEqual([categoryKey('analiza'), variantKey('nauka', 'sluchanie')])
    expect(step.same).toBe(1)
    const s = on(raw, TOMORROW)
    expect(s.categories.analiza!.place).toBe('away')
    expect(s.categories.nauka!.variants[0]!.place).toBe('away')
    expect(on(raw, TODAY).categories.analiza!.place).toBe('computer')
  })

  it('przenieś do kategorii: tylko podkategorie, od razu (bez wpisu ustawień); warianty pominięte z powodem', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), categoryKey('journaling'), variantKey('nauka', 'sluchanie')], { kind: 'move', group: HOME_GROUP })
    expect(step.patch).toBeNull()
    expect(groupOfCategory(rdFrom(raw), 'analiza')).toBe(HOME_GROUP)
    expect(groupOfCategory(rdFrom(raw), 'journaling')).toBe(HOME_GROUP)
    expect(step.skipped).toEqual(['warianty zostają przy swojej podkategorii'])
    expect(treeLineText('move', step.changes, step.skipped)).toBe('Przeniesiono 2 podkategorie · pominięto 1: warianty zostają przy swojej podkategorii')
  })

  it('usuń: podkategorie do archiwum od razu, wariant – archiwum od daty; już w archiwum – pominięty', () => {
    const start = { schema: 1, categories: { projekty: { name: 'Projekty', archived: true } } }
    const { step, raw } = apply(start, [categoryKey('analiza'), categoryKey('projekty'), variantKey('nauka', 'sluchanie')], { kind: 'remove' })
    expect(rdFrom(raw).categories.analiza!.archived).toBe(true)
    expect(on(raw, TOMORROW).categories.nauka!.variants[0]!.archived).toBe(true)
    expect(on(raw, TODAY).categories.nauka!.variants[0]!.archived).toBeFalsy()
    expect(step.skipped).toEqual(['już w archiwum'])
    expect(treeLineText('remove', step.changes, step.skipped)).toBe('Usunięto 1 podkategorię i 1 wariant · pominięto 1: już w archiwum')
  })

  it('usuń podkategorię dodaną od daty – znika całkiem (jak pojedyncze, T2353); „Cofnij” ją przywraca', () => {
    const added = { id: 'add', from: '2026-11-27', at: null, made: 1, patch: { categories: { nowa: { cls: 'work', kind: 'other', place: 'computer', costs: { head: 1, emotions: 1, senses: 1, body: 0 } } } } }
    const start = { schema: 1, settings: [added], categories: { nowa: { name: 'Nowa', group: WORK_GROUP } } }
    const { step, raw } = apply(start, [categoryKey('nowa')], { kind: 'remove' })
    expect(step.changes[0]!.field).toBe('whole')
    expect(raw.settings).toEqual([])
    expect((raw.categories as Raw).nowa).toBeUndefined()
    const u = treeGroupUndo(raw, step.changes, FROM, TODAY)
    expect(u.restored).toHaveLength(1)
    expect(u.raw.settings).toEqual([added])
    expect((u.raw.categories as Raw).nowa).toEqual({ name: 'Nowa', group: WORK_GROUP })
    // Its date came meanwhile: it stays gone.
    expect(treeGroupUndo(raw, step.changes, FROM, '2026-11-27').kept).toHaveLength(1)
  })
})

describe('„Cofnij” (jak D567 p.4)', () => {
  it('przywraca koszt od tej samej daty; zmieniona w międzyczasie zostaje i linia to mówi', () => {
    const { step, raw } = apply({ schema: 1 }, SIX.map(categoryKey), { kind: 'costs', costs: { body: 2 } })
    // Another change of one of them since (another computer): its cost stays.
    const changed = written(raw, { categories: { [SIX[0]!]: { costs: { head: 9, emotions: 9, senses: 9, body: 9 } } } })
    const u = treeGroupUndo(changed, step.changes, FROM, TODAY)
    expect(u.restored).toHaveLength(5)
    expect(u.kept.map((c) => c.key)).toEqual([categoryKey(SIX[0]!)])
    const back = written(u.raw, u.patch)
    for (const id of SIX.slice(1)) expect(on(back, TOMORROW).categories[id]!.costs).toEqual(DEFAULT_CATEGORIES.find((c) => c.id === id)!.costs)
    expect(on(back, TOMORROW).categories[SIX[0]!]!.costs.body).toBe(9)
    expect(treeKeptText(u.kept, u.restored.length)).toBe('Cofnięto · 1 została, bo się zmieniła')
    expect(treeKeptText([...u.kept, ...u.kept], 0)).toBe('Nic nie cofnięto – 2 zostały, bo się zmieniły')
  })

  it('wariant wraca do „jak podkategoria”; miejsce i archiwum wariantu wracają', () => {
    const { step: c1, raw: r1 } = apply({ schema: 1 }, [variantKey('sprawy', 'przy-komputerze')], { kind: 'costs', costs: { body: 2 } })
    const u1 = treeGroupUndo(r1, c1.changes, FROM, TODAY)
    const b1 = written(u1.raw, u1.patch)
    const v = on(b1, TOMORROW).categories.sprawy!.variants[0]!
    expect(v.costs).toBeUndefined()
    expect(costsOf(on(b1, TOMORROW).categories.sprawy!, 'przy-komputerze')).toEqual(on(b1, TOMORROW).categories.sprawy!.costs)

    const { step: c2, raw: r2 } = apply({ schema: 1 }, [variantKey('nauka', 'sluchanie')], { kind: 'remove' })
    const u2 = treeGroupUndo(r2, c2.changes, FROM, TODAY)
    expect(on(written(u2.raw, u2.patch), TOMORROW).categories.nauka!.variants[0]!.archived).toBeFalsy()
  })

  it('przeniesienie i archiwum podkategorii wracają pole po polu; zmienione od tego czasu – zostają', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), categoryKey('journaling')], { kind: 'move', group: HOME_GROUP })
    // `journaling` moved again elsewhere since.
    const moved = { ...raw, categories: { ...(raw.categories as Raw), journaling: { ...((raw.categories as Raw).journaling as Raw), group: 'g-wolne' } } }
    const u = treeGroupUndo(moved, step.changes, FROM, TODAY)
    expect(u.patch).toBeNull()
    expect(groupOfCategory(rdFrom(u.raw), 'analiza')).toBe(WORK_GROUP)
    expect(groupOfCategory(rdFrom(u.raw), 'journaling')).toBe('g-wolne')
    expect(u.kept).toHaveLength(1)
    // The entry the move made goes with it (no `{}` left in rd.json).
    expect((u.raw.categories as Raw).analiza).toBeUndefined()

    const { step: r, raw: removed } = apply({ schema: 1 }, [categoryKey('analiza')], { kind: 'remove' })
    expect(rdFrom(treeGroupUndo(removed, r.changes, FROM, TODAY).raw).categories.analiza!.archived).toBeFalsy()
  })
})

describe('runda 1 przeglądu (T2704–T2706)', () => {
  it('łatka z datą pisze tylko ruszone pule: zmiana innej puli „od dziś” po niej zostaje także od jutra', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza')], { kind: 'costs', costs: { body: 2 } })
    expect(step.patch).toEqual({ categories: { analiza: { costs: { body: 2 } } } })
    // „Od dziś” in the row afterwards: the head 5 from today's instant.
    const today = written(raw, { categories: { analiza: { costs: { head: 5 } } } }, { from: TODAY, at: Date.parse('2026-11-24T12:00:00Z') })
    expect(on(today, TOMORROW).categories.analiza!.costs).toEqual({ head: 5, emotions: 1, senses: 1, body: 2 })
  })

  it('„Cofnij” cofa tylko ruszone pule, póki one stoją jak po zmianie (inna pula zmieniona od tego czasu – bez znaczenia)', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), variantKey('nauka', 'sluchanie')], { kind: 'costs', costs: { body: 2 } })
    // Another computer changed the head of both since (a later change from the same date).
    const sluchanie = on(raw, TOMORROW).categories.nauka!.variants.map((v) => (v.id === 'sluchanie' ? { ...v, costs: { ...v.costs!, head: 7 } } : v))
    const since = written(raw, { categories: { analiza: { costs: { head: 9 } }, nauka: { variants: sluchanie } } })
    const u = treeGroupUndo(since, step.changes, FROM, TODAY)
    expect(u.kept).toEqual([])
    expect(u.patch).toMatchObject({ categories: { analiza: { costs: { body: 0 } } } })
    const back = written(u.raw, u.patch)
    expect(on(back, TOMORROW).categories.analiza!.costs).toEqual({ head: 9, emotions: 1, senses: 1, body: 0 })
    expect(costsOf(on(back, TOMORROW).categories.nauka!, 'sluchanie')).toEqual({ head: 7, emotions: 0, senses: 0, body: 0 })
    // The pool touched changed since: it stays.
    const changed = written(raw, { categories: { analiza: { costs: { body: 4 } } } })
    expect(treeGroupUndo(changed, step.changes, FROM, TODAY).kept.map((c) => c.key)).toEqual([categoryKey('analiza')])
  })

  it('„Cofnij” zmian bez daty w odwrotnej kolejności: rd.json wraca do `{ schema: 1 }` (bez pustego `categories`)', () => {
    const { step, raw } = apply({ schema: 1 }, [categoryKey('analiza'), categoryKey('journaling')], { kind: 'move', group: HOME_GROUP })
    expect(treeGroupUndo(raw, step.changes, FROM, TODAY).raw).toEqual({ schema: 1 })
  })
})

describe('słowa', () => {
  it('liczba podkategorii i wariantów', () => {
    const k = (key: string) => ({ item: treeItemOf(key)! })
    expect(treeCount([k(categoryKey('a'))])).toBe('1 podkategorię')
    expect(treeCount([k(categoryKey('a')), k(categoryKey('b')), k(variantKey('a', 'x'))])).toBe('2 podkategorie i 1 wariant')
    expect(treeCount([k(variantKey('a', 'x')), k(variantKey('a', 'y')), k(variantKey('a', 'z')), k(variantKey('a', 'w')), k(variantKey('a', 'v'))])).toBe('5 wariantów')
  })
})
