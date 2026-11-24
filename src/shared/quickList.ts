/**
 * A list pasted into a field of the quick capture (N11, D605, D606): a text of two or more lines is offered as that many sprawy
 * („Dodać 5 spraw? · Enter · Esc – jeden tytuł”) – the markers of a list at the start of a line leave („- ”, „* ”, „• ”, „1. ”, „1) ”,
 * „[ ] ”, „[x] ”, also „- [ ] ”), the empty lines and the lines of a marker alone are left out, at most `LIST_MAX` lines at once; each line
 * then goes through the words of the quick capture (`parseQuickWords`). Esc takes the paste as one title. And the words the fields say
 * after the save and the „Cofnij”. Pure and light – the window „Do skrzynki”, the bar's field, the page „Sprawy” and the main process.
 */
import { countLabel, plural } from './format'
import { keptText } from './groupText'

/** The most sprawy one paste makes (D605): the first lines, the rest is told in the question. */
export const LIST_MAX = 50

/** A pasted text taken as a list. */
export interface PastedList {
  /** The titles, the markers gone – at most `LIST_MAX`, in the order pasted. */
  lines: string[]
  /** How many lines (not empty, not a marker alone) were left out past `LIST_MAX`. */
  skipped: number
}

/** A marker of a list or of a task at the start of a line: „- ”, „* ”, „• ”, „1. ”, „12) ”, then „[ ] ” / „[x] ” – each with its space (or the end of the line). */
const BULLET = /^(?:[-*•]|\d{1,3}[.)])(?:\s+|$)/
const CHECKBOX = /^\[[ xX]\](?:\s+|$)/

/** The lines of a text (LF, CRLF, CR). */
const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/)

/** One line without its marker, trimmed. */
export function withoutMarker(line: string): string {
  return line.trim().replace(BULLET, '').replace(CHECKBOX, '').trim()
}

/** The text as a list: null when it has fewer than two lines left after the markers and the empty lines are gone (then it is pasted as any text). */
export function pastedLines(text: string): PastedList | null {
  const all = splitLines(text).map(withoutMarker).filter(Boolean)
  if (all.length < 2) return null
  return { lines: all.slice(0, LIST_MAX), skipped: Math.max(0, all.length - LIST_MAX) }
}

/** The paste as one title (Esc): the lines as they were, trimmed, the empty ones gone, joined with a space. */
export const pastedOneTitle = (text: string): string =>
  splitLines(text)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')

/** „1 sprawę”, „2 sprawy”, „5 spraw” – what a line of the fields says it did. */
const sprawy = (n: number): string => (n === 1 ? '1 sprawę' : countLabel(n, 'sprawa', 'sprawy', 'spraw'))

/** „(1 linię pominięto)”, „(12 linii pominięto)”. */
const skippedLines = (n: number): string => `${n === 1 ? '1 linię' : countLabel(n, 'linia', 'linie', 'linii')} pominięto`

/** The question under the field: „Dodać 5 spraw? · Enter · Esc – jeden tytuł”, past the limit „Dodać 50 spraw? (12 linii pominięto) · …”. */
export function pasteQuestion(p: PastedList): string {
  return `Dodać ${countLabel(p.lines.length, 'sprawę', 'sprawy', 'spraw')}?${p.skipped ? ` (${skippedLines(p.skipped)})` : ''} · Enter · Esc – jeden tytuł`
}

/**
 * What the field says after the list was saved (D606): „Dodano 5 spraw” – and „· 1 bez miejsca na osi” for those whose „@dzień godzina”
 * could not be put on the axis (they are saved without a block); the queue asking about a change of another computer (`asked`) – saved, waiting.
 * „Cofnij” is a button beside it.
 */
export function quickListSavedText(count: number, o: { notPlaced?: number; asked?: boolean } = {}): string {
  if (o.asked) return `Zapisano ${sprawy(count)} – czeka na odpowiedź o zmianie z innego komputera`
  return `Dodano ${sprawy(count)}${o.notPlaced ? ` · ${o.notPlaced} bez miejsca na osi` : ''}`
}

/**
 * What „Cofnij” of a list says when only a part of it could be written (D607): how many of the sprawy went, and what became of the rest – those left
 * because they changed since, those waiting for the answer of the queue, those that could not be written (or only the day's file did not go).
 * „Cofnięto 1 z 5 · 2 zostały, bo się zmieniły · 1 czeka na odpowiedź · 1 nie dała się cofnąć”.
 */
export function quickUndoPartialText(p: { done: number; total: number; kept: number; waiting: number; refused: number; dayRefused: boolean }): string {
  const parts = [`Cofnięto ${p.done} z ${p.total}`]
  if (p.kept) parts.push(`${p.kept} ${plural(p.kept, 'została', 'zostały', 'zostało')}, bo się ${plural(p.kept, 'zmieniła', 'zmieniły', 'zmieniło')}`)
  if (p.waiting) parts.push(`${p.waiting} ${plural(p.waiting, 'czeka', 'czekają', 'czeka')} na odpowiedź`)
  if (p.refused) parts.push(`${p.refused} ${plural(p.refused, 'nie dała się cofnąć', 'nie dały się cofnąć', 'nie dało się cofnąć')}`)
  else if (p.dayRefused) parts.push('plik dnia nie dał się cofnąć')
  return parts.join(' · ')
}

/** What „Cofnij” of a list says when the queue asks about a change on another computer (D607): the undo waits for the answer. */
export const QUICK_UNDO_ASKED = 'Cofnięcie czeka na odpowiedź o zmianie z innego komputera'

/** What „Cofnij” of a list says: „Cofnięto 5 spraw”; those changed since stay – „· 2 sprawy zmienione od tego czasu – zostały” (D606, D529). */
export function quickUndoText(undone: number, kept: number): string {
  if (!kept) return `Cofnięto ${sprawy(undone)}`
  return undone ? `Cofnięto ${sprawy(undone)} · ${keptText(kept, 'case')}` : keptText(kept, 'case')
}
