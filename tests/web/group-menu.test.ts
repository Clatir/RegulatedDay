/**
 * The menu „Zmień N bloków” and the helpers of the selection of blocks (D527, D528) without a DOM: the entries (✓ for the value all of the selected have,
 * „—” for some; the variants of the one subcategory they share; an entry that fits none disabled with its reason), „Przesuń o…” (later / earlier by 5,
 * 15, 30, 60 min and a number of the hand), a template without the day's actions, the keys of the blocks of several days, the line over the selection and
 * the engine's verdicts asked once per menu (T1720).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntry } from '@renderer/components/ContextMenu'
import { blockKey, blockMenu, blockMenuTitle, blockSummary, byStart, parseBlockKey, removeBlocksTarget, weekOrder, type BlockMenuOn, type GroupAction, type MenuBlock, type MenuCtx } from '@renderer/features/plan/groupMenu'
import { commonCosts } from '@renderer/features/plan/BlockGroupMenu'
import { restLeftIn, stateOfWeek } from '@renderer/features/week/weekSelect'
import type { HorizonBlock } from '@shared/engine/week'
import { useUi } from '@renderer/store/ui'

const CTX: MenuCtx = {
  groups: [{ group: 'praca', label: 'Praca', options: [{ value: 'analiza', label: 'Analiza' }, { value: 'nauka', label: 'Nauka' }] }, { group: 'zycie', label: 'Życie', options: [{ value: 'inne', label: 'Inne' }] }],
  variantsOf: (id) => (id === 'analiza' ? [{ id: 'gleboka', name: 'Głęboka' }, { id: 'plytka', name: 'Płytka' }] : []),
  kindOf: (id) => (id === 'rutyny' ? 'routine' : 'other'),
  routines: [{ id: 'r1', name: 'Poranna', minutes: 40 }, { id: 'r2', name: 'Bez kroków', minutes: 0 }]
}
const b = (id: string, o: Partial<MenuBlock> = {}): MenuBlock => ({ id, categoryId: 'analiza', variantId: null, routine: null, costs: { head: 3, emotions: 1, senses: 1, body: 0 }, state: 'open', movable: true, ...o })

const picked: GroupAction[] = []
let costOpened = 0
let moveOpened = 0
const ON: BlockMenuOn = { action: (a) => void picked.push(a), cost: () => void costOpened++, moveTo: () => void moveOpened++ }
afterEach(() => {
  picked.length = 0
  costOpened = 0
  moveOpened = 0
  useUi.setState({ toasts: [] })
})

const find = (entries: readonly MenuEntry[], testId: string): MenuEntry | undefined => {
  for (const e of entries) {
    if (e.kind === 'separator' || e.kind === 'field') {
      if (e.kind === 'field' && e.testId === testId) return e
      continue
    }
    if (e.testId === testId) return e
    const inner = e.submenu ? find(e.submenu, testId) : undefined
    if (inner) return inner
  }
  return undefined
}
const item = (entries: readonly MenuEntry[], testId: string) => find(entries, testId) as Extract<MenuEntry, { label: string }> & { check?: string; disabled?: string; onPick?: () => void; submenu?: MenuEntry[] }

describe('„Koszt…” w widoku bez kosztów (N18, T2614)', () => {
  const WHY = 'Koszt zmienisz w „Tygodniu”, „3 dniach” albo w „Dziś”'
  it('Agenda i miesiąc (`costsKnown: false`): pozycja wyłączona z powodem w podpowiedzi, nie otwiera okna', () => {
    const entries = blockMenu([b('a', { costs: null }), b('b', { costs: null })], { ...CTX, costsKnown: false }, ON)
    expect(item(entries, 'block-menu-cost').disabled).toBe(WHY)
    expect(item(entries, 'block-menu-cost').onPick).toBeUndefined()
    expect(costOpened).toBe(0)
  })

  it('Agenda i miesiąc (`costsKnown: false`): bez „Przesuń resztę dnia o…” (D584 – tylko „Dziś”, „Tydzień”, „3 dni”)', () => {
    const entries = blockMenu([b('a'), b('b')], { ...CTX, costsKnown: false }, ON)
    expect(JSON.stringify(entries)).not.toContain('block-menu-rest')
    expect(JSON.stringify(blockMenu([b('a'), b('b')], CTX, ON))).toContain('block-menu-rest')
  })

  it('„Tydzień”, „3 dni” i „Dziś”: blok bez kosztu własnego (costs: null) – pozycja czynna, jak dotąd', () => {
    for (const ctx of [CTX, { ...CTX, costsKnown: true }]) {
      const cost = item(blockMenu([b('a', { costs: null })], ctx, ON), 'block-menu-cost')
      expect(cost.disabled).toBeUndefined()
      cost.onPick!()
    }
    expect(costOpened).toBe(2)
  })
})

describe('podkategoria i wariant: ✓ i „—”', () => {
  it('✓ przy podkategorii wszystkich, „—” przy części, nic przy żadnej; wybór niesie `category` z wariantem null', () => {
    const m = blockMenu([b('a'), b('b', { categoryId: 'nauka' })], CTX, ON)
    expect(item(m, 'block-menu-category-analiza').check).toBe('some')
    expect(item(m, 'block-menu-category-nauka').check).toBe('some')
    expect(item(m, 'block-menu-category-inne').check).toBeUndefined()
    const same = blockMenu([b('a'), b('b')], CTX, ON)
    expect(item(same, 'block-menu-category-analiza').check).toBe('all')
    item(same, 'block-menu-category-nauka').onPick!()
    expect(picked).toEqual([{ kind: 'category', categoryId: 'nauka', variantId: null }])
  })

  it('wariant: dla jednej wspólnej podkategorii ✓ / „—” i „Bez wariantu”; różne podkategorie albo brak wariantów – wyłączony z powodem', () => {
    const m = blockMenu([b('a', { variantId: 'gleboka' }), b('b')], CTX, ON)
    expect(item(m, 'block-menu-variant-gleboka').check).toBe('some')
    expect(item(m, 'block-menu-variant-none').check).toBe('some')
    item(m, 'block-menu-variant-plytka').onPick!()
    expect(picked).toEqual([{ kind: 'variant', variantId: 'plytka' }])
    expect(item(blockMenu([b('a'), b('b', { categoryId: 'nauka' })], CTX, ON), 'block-menu-variant').disabled).toContain('różne podkategorie')
    expect(item(blockMenu([b('a', { categoryId: 'nauka' })], CTX, ON), 'block-menu-variant').disabled).toContain('nie ma wariantów')
  })
})

describe('koszt, rutyna', () => {
  it('„Koszt…” otwiera okno; „Rutyna” tylko dla bloków rodzaju „rutyna” (inaczej wyłączona z powodem), wybór niesie rutynę i jej długość', () => {
    const m = blockMenu([b('a')], CTX, ON)
    item(m, 'block-menu-cost').onPick!()
    expect(costOpened).toBe(1)
    expect(item(m, 'block-menu-routine').disabled).toContain('rodzaju „rutyna”')
    const r = blockMenu([b('a', { categoryId: 'rutyny', routine: 'r1' }), b('x', { categoryId: 'rutyny' })], CTX, ON)
    expect(item(r, 'block-menu-routine-r1').check).toBe('some')
    expect(item(r, 'block-menu-routine-none').check).toBe('some')
    item(r, 'block-menu-routine-r1').onPick!()
    item(r, 'block-menu-routine-r2').onPick!()
    item(r, 'block-menu-routine-none').onPick!()
    expect(picked).toEqual([
      { kind: 'routine', routine: 'r1', minutes: 40 },
      { kind: 'routine', routine: 'r2', minutes: null },
      { kind: 'routine', routine: null, minutes: null }
    ])
  })
})

describe('Przesuń o…, Przenieś na dzień…, Odwołaj, Zaparkuj, Usuń', () => {
  it('później / wcześniej o 5, 15, 30, 60 min i pole na własną liczbę („45”, „1:30”; zła – powód, menu zostaje)', () => {
    const m = blockMenu([b('a')], CTX, ON)
    item(m, 'block-menu-later-15').onPick!()
    item(m, 'block-menu-earlier-60').onPick!()
    const later = find(m, 'block-menu-later-own') as Extract<MenuEntry, { kind: 'field' }>
    expect(later.onSubmit('1:30')).toBeUndefined()
    const earlier = find(m, 'block-menu-earlier-own') as Extract<MenuEntry, { kind: 'field' }>
    expect(earlier.onSubmit('45')).toBeUndefined()
    expect(typeof later.onSubmit('abc')).toBe('string')
    expect(picked).toEqual([
      { kind: 'shift', minutes: 15 },
      { kind: 'shift', minutes: -60 },
      { kind: 'shift', minutes: 90 },
      { kind: 'shift', minutes: -45 }
    ])
    expect([5, 15, 30, 60].every((n) => item(m, `block-menu-later-${n}`) != null && item(m, `block-menu-earlier-${n}`) != null)).toBe(true)
  })

  it('wyłączone z powodem: wszystkie zaczęte – „Żaden blok nie jest niezaczęty”; żaden nie ma godziny do przesunięcia – osobny powód; pojedynczy niezaczęty włącza', () => {
    const begun = blockMenu([b('a', { state: 'begun', movable: false }), b('b', { state: 'begun', movable: false })], CTX, ON)
    for (const id of ['block-menu-shift', 'block-menu-moveto', 'block-menu-cancel', 'block-menu-park']) expect(item(begun, id).disabled, id).toBe('Żaden blok nie jest niezaczęty')
    const fixed = blockMenu([b('a', { movable: false })], CTX, ON)
    expect(item(fixed, 'block-menu-shift').disabled).toContain('godziny, którą da się przesunąć')
    expect(item(fixed, 'block-menu-moveto').disabled).toContain('godziny, którą da się przesunąć')
    expect(item(fixed, 'block-menu-cancel').disabled).toBeUndefined()
    // A block that is past without a start, one parked or cancelled is not „niezaczęty”: nothing to cancel, park or move there (the reason says what they are).
    const past = blockMenu([b('a', { state: 'past' }), b('b', { state: 'past' })], CTX, ON)
    for (const id of ['block-menu-shift', 'block-menu-moveto', 'block-menu-cancel', 'block-menu-park']) expect(item(past, id).disabled, id).toBe('Wszystkie wybrane bloki już minęły')
    const off = blockMenu([b('a', { state: 'off' }), b('b', { state: 'off' })], CTX, ON)
    for (const id of ['block-menu-shift', 'block-menu-cancel', 'block-menu-park']) expect(item(off, id).disabled, id).toContain('zdjęte z planu')
    const mixed = blockMenu([b('a', { state: 'past' }), b('b', { state: 'off' }), b('c', { state: 'begun' })], CTX, ON)
    expect(item(mixed, 'block-menu-cancel').disabled).toContain('nie jest do zrobienia')
    const some = blockMenu([b('a', { state: 'begun', movable: false }), b('b', { state: 'off' }), b('c')], CTX, ON)
    expect(item(some, 'block-menu-shift').disabled).toBeUndefined()
    expect(item(some, 'block-menu-cancel').disabled).toBeUndefined()
  })

  it('Przenieś na dzień…, Odwołaj, Zaparkuj, Usuń wołają swoje; szablon – bez odwołania, parkowania i przeniesienia na dzień', () => {
    const m = blockMenu([b('a')], CTX, ON)
    item(m, 'block-menu-moveto').onPick!()
    item(m, 'block-menu-cancel').onPick!()
    item(m, 'block-menu-park').onPick!()
    item(m, 'block-menu-remove').onPick!()
    expect(moveOpened).toBe(1)
    expect(picked).toEqual([{ kind: 'cancel' }, { kind: 'park' }, { kind: 'remove' }])
    const t = blockMenu([b('a')], { ...CTX, template: true }, ON)
    for (const id of ['block-menu-cancel', 'block-menu-park', 'block-menu-moveto']) expect(find(t, id), id).toBeUndefined()
    expect(find(t, 'block-menu-shift')).toBeDefined()
    expect(find(t, 'block-menu-remove')).toBeDefined()
  })
})

describe('„Przesuń resztę dnia o…” (N17, D584)', () => {
  it('później / wcześniej o 5, 15, 30, 60 min i pole na własną liczbę – działanie `shiftRest`; szablon – bez tej pozycji', () => {
    const m = blockMenu([b('a')], CTX, ON)
    expect(item(m, 'block-menu-rest').label).toBe('Przesuń resztę dnia o…')
    item(m, 'block-menu-rest-later-30').onPick!()
    item(m, 'block-menu-rest-earlier-15').onPick!()
    const own = find(m, 'block-menu-rest-later-own') as Extract<MenuEntry, { kind: 'field' }>
    expect(own.onSubmit('1:30')).toBeUndefined()
    expect(typeof own.onSubmit('abc')).toBe('string')
    expect((find(m, 'block-menu-rest-earlier-own') as Extract<MenuEntry, { kind: 'field' }>).onSubmit('45')).toBeUndefined()
    expect(picked).toEqual([
      { kind: 'shiftRest', minutes: 30 },
      { kind: 'shiftRest', minutes: -15 },
      { kind: 'shiftRest', minutes: 90 },
      { kind: 'shiftRest', minutes: -45 }
    ])
    expect([5, 15, 30, 60].every((n) => item(m, `block-menu-rest-later-${n}`) != null && item(m, `block-menu-rest-earlier-${n}`) != null)).toBe(true)
    // „Przesuń o…” keeps its own ids.
    item(m, 'block-menu-later-15').onPick!()
    expect(picked.at(-1)).toEqual({ kind: 'shift', minutes: 15 })
    expect(find(blockMenu([b('a')], { ...CTX, template: true }, ON), 'block-menu-rest')).toBeUndefined()
  })

  it('zaczęty, stały i minięty wyznaczają tylko początek – pozycja włączona; wszystkie z minionych dni („Tydzień”) – wyłączona z powodem', () => {
    for (const s of ['begun', 'past', 'off'] as const) expect(item(blockMenu([b('a', { state: s, movable: false })], CTX, ON), 'block-menu-rest').disabled, s).toBeUndefined()
    const gone = blockMenu([b('a', { pastDay: true, notToday: true }), b('b', { pastDay: true, notToday: true })], CTX, ON)
    expect(item(gone, 'block-menu-rest').disabled).toBe('Wszystkie wybrane bloki są z minionych dni')
    expect(item(blockMenu([b('a', { pastDay: true }), b('b')], CTX, ON), 'block-menu-rest').disabled).toBeUndefined()
  })

  it('kolumny (T2494): po zaznaczonych w ich dniach nic elastycznego – wyłączona z powodem; `restLeftIn` – od najwcześniejszego zaznaczonego', () => {
    const none = blockMenu([b('a', { restNone: true }), b('b', { restNone: true })], CTX, ON)
    expect(item(none, 'block-menu-rest').disabled).toBe('Po tych blokach nie ma bloków elastycznych do przesunięcia (stałe, chronione, zaczęte, sesje i wykłady zostają)')
    expect(item(blockMenu([b('a', { restNone: true }), b('b')], CTX, ON), 'block-menu-rest').disabled).toBeUndefined()
    const hb = (id: string, startMin: number, o: Partial<HorizonBlock> = {}) => ({ id, startMin, categoryId: 'inne', movable: true as const, background: false, ...o }) as HorizonBlock
    // `pushable` – the engine's rule (a protected one, a fixed one, one in the background: not).
    const day = { blocks: [hb('f', 600, { fixed: true, movable: undefined }), hb('p', 700, { categoryId: 'posilek' }), hb('x', 500, { pushable: true }), hb('bg', 800, { background: true })] }
    expect(restLeftIn(day, ['f'])).toBe(false)
    expect(restLeftIn(day, ['x'])).toBe(true)
    expect(restLeftIn({ blocks: [...day.blocks, hb('late', 900, { pushable: true })] }, ['f'])).toBe(true)
  })

  it('według silnika (T1720): nic do przesunięcia – wyłączona z powodem; dzień miniony – „już minęły”', () => {
    const none = { take: 0, skipped: [] }
    const off = blockMenu([b('a')], { ...CTX, judge: () => ({ rest: none }) }, ON)
    expect(item(off, 'block-menu-rest').disabled).toBe('Po tych blokach nie ma bloków elastycznych do przesunięcia (stałe, chronione, zaczęte, sesje i wykłady zostają)')
    const past = blockMenu([b('a')], { ...CTX, judge: () => ({ rest: { take: 0, skipped: ['miniony' as const] } }) }, ON)
    expect(item(past, 'block-menu-rest').disabled).toBe('Wszystkie wybrane bloki już minęły')
    expect(item(blockMenu([b('a')], { ...CTX, judge: () => ({ rest: { take: 3, skipped: [] } }) }, ON), 'block-menu-rest').disabled).toBeUndefined()
  })
})

describe('pozycje według silnika (T1720)', () => {
  it('jedno pytanie o werdykty reguł na otwarcie menu – nie po jednym na pozycję', () => {
    const judge = vi.fn(() => ({ fields: { take: 2, skipped: [] }, cost: { take: 2, skipped: [] }, routine: { take: 0, skipped: ['nie rutyna' as const, 'nie rutyna' as const] }, place: { take: 0, skipped: ['zaczęty' as const, 'zaczęty' as const] }, day: { take: 2, skipped: [] } }))
    const entries = blockMenu([b('a'), b('b')], { ...CTX, judge }, ON)
    expect(judge).toHaveBeenCalledTimes(1)
    expect(judge).toHaveBeenCalledWith(['a', 'b'])
    expect(item(entries, 'block-menu-shift').disabled).toBe('Żaden blok nie jest niezaczęty')
    expect(item(entries, 'block-menu-moveto').disabled).toBe('Żaden blok nie jest niezaczęty')
    expect(item(entries, 'block-menu-cancel').disabled).toBeUndefined()
  })

})

describe('okno kosztu i stany bloków tygodnia', () => {
  it('okno kosztu zaczyna od kosztu pierwszego zaznaczonego bloku – także przy różnych kosztach; bez kosztu – zera', () => {
    const a = { head: 4, emotions: 0, senses: 0, body: 1 }
    expect(commonCosts([b('a', { costs: a }), b('b')])).toEqual(a)
    expect(commonCosts([b('x', { costs: null }), b('a', { costs: a })])).toEqual(a)
    expect(commonCosts([b('x', { costs: null })])).toEqual({ head: 0, emotions: 0, senses: 0, body: 0 })
  })

  it('stan bloku kolumn: zaczęty (ran, running, paused), miniony niezaczęty, zdjęty z planu, do zrobienia', () => {
    expect(['ran', 'running', 'paused'].map((s) => stateOfWeek(s as never))).toEqual(['begun', 'begun', 'begun'])
    expect(stateOfWeek('missed')).toBe('past')
    expect(['parked', 'cancelled'].map((s) => stateOfWeek(s as never))).toEqual(['off', 'off'])
    expect(stateOfWeek('planned')).toBe('open')
  })
})

describe('tytuł, Del, klucze, napis', () => {
  it('tytuł i pytanie Del po polsku: „Zmień 4 bloki”, „Usunąć 5 bloków?”', () => {
    expect(blockMenuTitle(4)).toBe('Zmień 4 bloki')
    expect(blockMenuTitle(1)).toBe('Zmień 1 blok')
    const t = removeBlocksTarget(5, () => undefined)
    expect(t).toMatchObject({ title: 'Usunąć 5 bloków?', yes: 'Usuń' })
  })

  it('klucz bloku kilku dni: data i id (id z kreską pionową zostaje); kolejność dnia, potem startu', () => {
    expect(parseBlockKey(blockKey('2026-11-18', 'a|b'))).toEqual({ date: '2026-11-18', id: 'a|b' })
    const days = [
      { date: '2026-11-16', blocks: [{ id: 'm2', startMin: 660 }, { id: 'm1', startMin: 540 }] },
      { date: '2026-11-17', blocks: [{ id: 't1', startMin: 480 }] }
    ]
    expect(weekOrder(days)).toEqual(['2026-11-16|m1', '2026-11-16|m2', '2026-11-17|t1'])
    expect(byStart([{ id: 'x', startMin: 10 }, { id: 'y', startMin: 5 }]).map((t) => t.id)).toEqual(['y', 'x'])
  })

  it('napis nad zaznaczeniem: minuty i koszt/h bloku; jeden – nic; bez energii – bez części „energia”', () => {
    const tiles = [
      { startMin: 540, endMin: 600, cost: { costs: { head: 3, emotions: 1, senses: 1, body: 0 } } },
      { startMin: 600, endMin: 630, cost: { costs: { head: -2, emotions: 0, senses: 0, body: 0 } } }
    ]
    expect(blockSummary(tiles, true)).toBe('Zaznaczone: 2 · 1 h 30 min · energia −2 G · −1 E · −1 B · 0 C')
    expect(blockSummary(tiles, false)).toBe('Zaznaczone: 2 · 1 h 30 min')
    expect(blockSummary(tiles.slice(0, 1), true)).toBeNull()
  })
})
