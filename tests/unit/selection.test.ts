/**
 * The model of selecting many (D527): a click, Ctrl+click, Shift+click with its anchor and the part kept from before the range,
 * Shift+arrows, select all, pruning of what vanished, the right button (D528), the three states of a ✓.
 */
import { describe, expect, it } from 'vitest'
import { clearSelect, clickSelect, contextSelect, EMPTY_SELECTION, extendSelect, inRange, pruneSelect, selectAll, triState, type Selection } from '@shared/selection'

const ORDER = ['A', 'B', 'C', 'D', 'E', 'F']
const NONE = { ctrl: false, shift: false }
const CTRL = { ctrl: true, shift: false }
const SHIFT = { ctrl: false, shift: true }

describe('klik, Ctrl+klik, Shift+klik (D527)', () => {
  it('zwykły klik zaznacza tylko kliknięty i ustawia kotwicę', () => {
    const s = clickSelect(clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER), 'C', NONE, ORDER)
    expect(s.ids).toEqual(['C'])
    expect(s.anchor).toBe('C')
  })

  it('Ctrl+klik dokłada i zdejmuje element, kotwica to ostatnio kliknięty', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'C', CTRL, ORDER)
    expect(s.ids).toEqual(['A', 'C'])
    expect(s.anchor).toBe('C')
    s = clickSelect(s, 'A', CTRL, ORDER)
    expect(s.ids).toEqual(['C'])
    expect(s.anchor).toBe('A')
  })

  it('przykład ze specyfikacji: Ctrl+klik A, Ctrl+klik C, Shift+klik E → A, C, D, E (kotwica C)', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'C', CTRL, ORDER)
    s = clickSelect(s, 'E', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'C', 'D', 'E'])
    expect(s.anchor).toBe('C')
  })

  it('kolejny Shift+klik z tej samej kotwicy zastępuje poprzedni zakres, to co było przed zakresem zostaje', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'C', CTRL, ORDER)
    s = clickSelect(s, 'F', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'C', 'D', 'E', 'F'])
    s = clickSelect(s, 'D', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'C', 'D'])
    // The other way round from the anchor.
    s = clickSelect(s, 'B', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'B', 'C'])
    expect(s.anchor).toBe('C')
  })

  it('Shift+klik po zwykłym kliknięciu: zakres od kliknietego, w obie strony', () => {
    let s = clickSelect(EMPTY_SELECTION, 'D', NONE, ORDER)
    expect(clickSelect(s, 'B', SHIFT, ORDER).ids).toEqual(['B', 'C', 'D'])
    s = clickSelect(s, 'F', SHIFT, ORDER)
    expect(s.ids).toEqual(['D', 'E', 'F'])
  })

  it('Shift+klik bez kotwicy albo z kotwicą spoza kolejności – tylko kliknięty', () => {
    expect(clickSelect(EMPTY_SELECTION, 'C', SHIFT, ORDER)).toMatchObject({ ids: ['C'], anchor: 'C' })
    const s = clickSelect(EMPTY_SELECTION, 'Z', NONE, [...ORDER, 'Z'])
    expect(clickSelect(s, 'C', SHIFT, ORDER)).toMatchObject({ ids: ['C'], anchor: 'C' })
  })

  it('po Ctrl+kliku zakres liczy się od nowa: to, co zaznaczone, jest „przed zakresem”', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', NONE, ORDER)
    s = clickSelect(s, 'C', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'B', 'C'])
    s = clickSelect(s, 'E', CTRL, ORDER)
    s = clickSelect(s, 'F', SHIFT, ORDER)
    expect(s.ids).toEqual(['A', 'B', 'C', 'E', 'F'])
  })

  it('ids są w kolejności ekranu bez powtórzeń, także gdy klikano w innej', () => {
    let s = clickSelect(EMPTY_SELECTION, 'E', CTRL, ORDER)
    s = clickSelect(s, 'B', CTRL, ORDER)
    s = clickSelect(s, 'E', CTRL, ORDER)
    s = clickSelect(s, 'E', CTRL, ORDER)
    expect(s.ids).toEqual(['B', 'E'])
  })

  it('Ctrl+Shift+klik działa jak Shift+klik', () => {
    let s = clickSelect(EMPTY_SELECTION, 'B', NONE, ORDER)
    s = clickSelect(s, 'D', { ctrl: true, shift: true }, ORDER)
    expect(s.ids).toEqual(['B', 'C', 'D'])
  })

  it('element spoza kolejności (inna lista Spraw): Ctrl+klik go dokłada, ids zostają po tych z kolejności', () => {
    let s = clickSelect(EMPTY_SELECTION, 'B', NONE, ORDER)
    s = clickSelect(s, 'X', CTRL, ORDER)
    expect(s.ids).toEqual(['B', 'X'])
    s = clickSelect(s, 'A', CTRL, ORDER)
    expect(s.ids).toEqual(['A', 'B', 'X'])
  })
})

describe('Shift+strzałki (D527)', () => {
  it('koniec zakresu przesuwa się od kotwicy, w obie strony, zakres od kotwicy do końca', () => {
    let s = clickSelect(EMPTY_SELECTION, 'C', NONE, ORDER)
    s = extendSelect(s, 1, ORDER)
    expect(s.ids).toEqual(['C', 'D'])
    s = extendSelect(s, 1, ORDER)
    expect(s.ids).toEqual(['C', 'D', 'E'])
    s = extendSelect(s, -1, ORDER)
    expect(s.ids).toEqual(['C', 'D'])
    s = extendSelect(s, -1, ORDER)
    expect(s.ids).toEqual(['C'])
    s = extendSelect(s, -1, ORDER)
    expect(s.ids).toEqual(['B', 'C'])
    expect(s.anchor).toBe('C')
  })

  it('zachowuje to, co było zaznaczone przed zakresem, i nie wychodzi poza koniec listy', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'E', CTRL, ORDER)
    s = extendSelect(s, 1, ORDER)
    expect(s.ids).toEqual(['A', 'E', 'F'])
    const end = extendSelect(s, 1, ORDER)
    expect(end.ids).toEqual(['A', 'E', 'F'])
    s = extendSelect(s, -1, ORDER)
    expect(s.ids).toEqual(['A', 'E'])
  })

  it('bez zaznaczenia nic nie robi', () => {
    expect(extendSelect(EMPTY_SELECTION, 1, ORDER)).toBe(EMPTY_SELECTION)
  })

  it('po Shift+kliku strzałka rusza koniec zakresu od miejsca ostatniego kliknięcia', () => {
    let s = clickSelect(EMPTY_SELECTION, 'B', NONE, ORDER)
    s = clickSelect(s, 'D', SHIFT, ORDER)
    s = extendSelect(s, 1, ORDER)
    expect(s.ids).toEqual(['B', 'C', 'D', 'E'])
  })
})

describe('zaznacz wszystko, wyczyść, wypadanie, prawy przycisk', () => {
  it('selectAll – wszystko w kolejności; kotwica zostaje, gdy jest w kolejności', () => {
    expect(selectAll(ORDER).ids).toEqual(ORDER)
    const before = clickSelect(EMPTY_SELECTION, 'C', NONE, ORDER)
    const all = selectAll(ORDER, before)
    expect(all.ids).toEqual(ORDER)
    expect(all.anchor).toBe('C')
    expect(selectAll(['X', 'Y'], before).anchor).toBeNull()
    // After it Shift+click and Shift+arrow work from the anchor, over the whole.
    expect(clickSelect(all, 'E', SHIFT, ORDER).ids).toEqual(ORDER)
  })

  it('selectAll na pustej liście to puste zaznaczenie', () => {
    expect(selectAll([]).ids).toEqual([])
  })

  it('clearSelect – puste, bez kotwicy', () => {
    expect(clearSelect()).toEqual({ ids: [], anchor: null, cursor: null, base: [] })
  })

  it('pruneSelect: element, który zniknął, wypada; kotwica spoza – null; bez zmian – ten sam obiekt', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'C', CTRL, ORDER)
    s = clickSelect(s, 'E', SHIFT, ORDER)
    expect(pruneSelect(s, ORDER)).toBe(s)
    const cut = pruneSelect(s, ['A', 'B', 'D', 'E'])
    expect(cut.ids).toEqual(['A', 'D', 'E'])
    expect(cut.anchor).toBeNull()
    expect(cut.base).toEqual(['A'])
    expect(pruneSelect(s, new Set(['B']))).toEqual(EMPTY_SELECTION)
    expect(pruneSelect(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION)
  })

  it('prawy przycisk (D528): na zaznaczonym zostaje całe zaznaczenie, na spoza – tylko ten element', () => {
    let s = clickSelect(EMPTY_SELECTION, 'A', CTRL, ORDER)
    s = clickSelect(s, 'C', CTRL, ORDER)
    expect(contextSelect(s, 'A')).toBe(s)
    const other = contextSelect(s, 'D')
    expect(other.ids).toEqual(['D'])
    expect(other.anchor).toBe('D')
  })
})

describe('inRange i triState', () => {
  it('inRange – zakres włącznie, w obie strony; brak jednego końca – pusty', () => {
    expect(inRange(ORDER, 'B', 'D')).toEqual(['B', 'C', 'D'])
    expect(inRange(ORDER, 'D', 'B')).toEqual(['B', 'C', 'D'])
    expect(inRange(ORDER, 'B', 'B')).toEqual(['B'])
    expect(inRange(ORDER, 'B', 'Z')).toEqual([])
  })

  it('triState – wszystkie / część / żaden (✓ i „—” menu)', () => {
    expect(triState([true, true])).toBe('all')
    expect(triState([true, false, true])).toBe('some')
    expect(triState([false, false])).toBe('none')
    expect(triState([])).toBe('none')
  })

  it('stan jest zwykłymi danymi (bez klas) – można go porównać i zapisać', () => {
    const s: Selection = clickSelect(EMPTY_SELECTION, 'B', NONE, ORDER)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
})

describe('Shift+strzałki o więcej niż jeden element (siatka dni, Z3)', () => {
  const DAYS = Array.from({ length: 14 }, (_, i) => `d${i}`)

  it('krok 7 – tydzień niżej / wyżej od kotwicy: zakres wszystkich dni pomiędzy', () => {
    let s = clickSelect(EMPTY_SELECTION, 'd2', NONE, DAYS)
    s = extendSelect(s, 7, DAYS)
    expect(s.ids).toEqual(DAYS.slice(2, 10))
    s = extendSelect(s, -7, DAYS)
    expect(s.ids).toEqual(['d2'])
    s = extendSelect(s, -7, DAYS)
    expect(s.ids).toEqual(DAYS.slice(0, 3))
  })

  it('krok przy końcu listy przycina się do końca; będąc na końcu – bez zmiany', () => {
    let s = clickSelect(EMPTY_SELECTION, 'd10', NONE, DAYS)
    s = extendSelect(s, 7, DAYS)
    expect(s.ids).toEqual(DAYS.slice(10))
    expect(extendSelect(s, 7, DAYS)).toBe(s)
  })
})
