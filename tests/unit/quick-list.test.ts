/**
 * Wklejenie listy w polu szybkiego zapisu (N11, D605, D606): linie bez znaczników, limit 50, jeden tytuł, teksty pól.
 */
import { describe, expect, it } from 'vitest'
import { LIST_MAX, pastedLines, pastedOneTitle, pasteQuestion, quickListSavedText, quickUndoText, withoutMarker } from '@shared/quickList'

describe('znaczniki na początku linii', () => {
  it('„- ”, „* ”, „• ”, „1. ”, „1) ”, „[ ] ”, „[x] ”, „[X] ” i „- [ ] ” schodzą; reszta linii zostaje', () => {
    expect(withoutMarker('- Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('* Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('• Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('1. Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('12) Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('[ ] Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('[x] Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('[X] Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('- [ ] Kup mleko')).toBe('Kup mleko')
    expect(withoutMarker('  3) [x]   Kup mleko  ')).toBe('Kup mleko')
  })

  it('myślnik, gwiazdka i cyfra bez spacji po nich to część tytułu; rok „2024. …” nie jest znacznikiem (więcej niż 3 cyfry)', () => {
    expect(withoutMarker('-5 stopni')).toBe('-5 stopni')
    expect(withoutMarker('*ważne* sprawa')).toBe('*ważne* sprawa')
    expect(withoutMarker('3D druk')).toBe('3D druk')
    expect(withoutMarker('2024. Podsumowanie')).toBe('2024. Podsumowanie')
    expect(withoutMarker('Kup [x] mleko')).toBe('Kup [x] mleko')
  })

  it('sam znacznik daje pustą linię', () => {
    for (const l of ['-', '* ', '•', '1.', '[ ]', '- [x]', '']) expect(withoutMarker(l)).toBe('')
  })
})

describe('pastedLines – lista czy zwykły tekst', () => {
  it('pięć linii – pięć tytułów w kolejności wklejenia', () => {
    const p = pastedLines('- jeden\n- dwa\n- trzy\n- cztery\n- pięć')
    expect(p).toEqual({ lines: ['jeden', 'dwa', 'trzy', 'cztery', 'pięć'], skipped: 0 })
  })

  it('CRLF i CR jak LF; puste linie i same znaczniki nie liczą się', () => {
    expect(pastedLines('a\r\n\r\n- \r\nb\r\n[ ]\r\n')).toEqual({ lines: ['a', 'b'], skipped: 0 })
    expect(pastedLines('a\rb')).toEqual({ lines: ['a', 'b'], skipped: 0 })
  })

  it('jedna niepusta linia (także z końcowym enterem albo z pustymi liniami wokół) – null: wkleja się jak zwykły tekst', () => {
    expect(pastedLines('Kup mleko')).toBeNull()
    expect(pastedLines('Kup mleko\n')).toBeNull()
    expect(pastedLines('\n\n- Kup mleko\r\n\r\n')).toBeNull()
    expect(pastedLines('- a\n- \n')).toBeNull()
    expect(pastedLines('')).toBeNull()
  })

  it('więcej niż 50 linii – pierwsze 50, reszta policzona jako pominięta (D605)', () => {
    const text = Array.from({ length: 62 }, (_, i) => `zadanie ${i + 1}`).join('\n')
    const p = pastedLines(text)!
    expect(p.lines).toHaveLength(LIST_MAX)
    expect(p.lines[0]).toBe('zadanie 1')
    expect(p.lines[49]).toBe('zadanie 50')
    expect(p.skipped).toBe(12)
    expect(pastedLines(Array.from({ length: 50 }, (_, i) => `z${i}`).join('\n'))!.skipped).toBe(0)
  })
})

describe('pastedOneTitle – Esc', () => {
  it('linie połączone spacją, przycięte, puste pominięte; znaczniki zostają (zwykłe wklejenie)', () => {
    expect(pastedOneTitle('  - a  \r\n\r\nb\n c ')).toBe('- a b c')
    expect(pastedOneTitle('')).toBe('')
  })
})

describe('teksty pól', () => {
  it('pytanie: liczba spraw w odmianie, pominięte linie przy limicie', () => {
    expect(pasteQuestion({ lines: ['a', 'b'], skipped: 0 })).toBe('Dodać 2 sprawy? · Enter · Esc – jeden tytuł')
    expect(pasteQuestion({ lines: Array(5).fill('x'), skipped: 0 })).toBe('Dodać 5 spraw? · Enter · Esc – jeden tytuł')
    expect(pasteQuestion({ lines: Array(50).fill('x'), skipped: 12 })).toBe('Dodać 50 spraw? (12 linii pominięto) · Enter · Esc – jeden tytuł')
    expect(pasteQuestion({ lines: Array(50).fill('x'), skipped: 1 })).toContain('(1 linię pominięto)')
    expect(pasteQuestion({ lines: Array(50).fill('x'), skipped: 3 })).toContain('(3 linie pominięto)')
  })

  it('po zapisie: „Dodano 5 spraw”, „· 1 bez miejsca na osi”, czeka na odpowiedź', () => {
    expect(quickListSavedText(5)).toBe('Dodano 5 spraw')
    expect(quickListSavedText(5, { notPlaced: 1 })).toBe('Dodano 5 spraw · 1 bez miejsca na osi')
    expect(quickListSavedText(2)).toBe('Dodano 2 sprawy')
    expect(quickListSavedText(1)).toBe('Dodano 1 sprawę')
    expect(quickListSavedText(5, { asked: true })).toBe('Zapisano 5 spraw – czeka na odpowiedź o zmianie z innego komputera')
  })

  it('po „Cofnij”: ile cofnięto i ile zostało, bo zmieniono je od zapisu (D529)', () => {
    expect(quickUndoText(5, 0)).toBe('Cofnięto 5 spraw')
    expect(quickUndoText(3, 2)).toBe('Cofnięto 3 sprawy · 2 sprawy zmienione od tego czasu – zostały')
    expect(quickUndoText(0, 5)).toBe('5 spraw zmienionych od tego czasu – zostało')
  })
})
