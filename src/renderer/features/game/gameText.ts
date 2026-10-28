/**
 * The game's words (D322, spec „Statusy dni i passa”, „Progresja”, „Świętowanie”): the line of „Dziś”, the statuses of
 * days, the cassettes' labels, the next item of the room, the celebrations. Never a reproach: a broken day is named, not
 * judged. Pure – the window's tests check them without a DOM.
 */
import type { Celebration, GameView, Season } from '@shared/engine/progress'
import { DISCONNECT_WAY } from '@shared/engine/progress'
import type { StreakStep } from '@shared/engine/game'
import { countLabel, plDate } from '@shared/format'
import { REGEN_CATEGORY, type Variant } from '@shared/model/categories'
import { addDays } from '@shared/time/zone'

const notes = (n: number) => countLabel(n, 'nuta', 'nuty', 'nut')

/** „Passa 5 · 142 nuty · dziś +6 w toku” (today's part only once it has notes). */
export function gameLine(g: Pick<GameView, 'streak' | 'notes' | 'notesToday'>): string {
  const parts = [`Passa ${g.streak}`, notes(g.notes.final)]
  if (g.notesToday > 0) parts.push(`dziś +${g.notesToday} w toku`)
  return parts.join(' · ')
}

/** What a day did, in words (a day still open to corrections: „w toku”). */
export function stepText(s: Pick<StreakStep, 'move' | 'frozen'>): string {
  const text = { up: 'dotrzymany', held: 'bez danych', protected: 'dzień ochronny', broken: 'niedotrzymany', skip: 'poza grą' }[s.move]
  return s.frozen ? text : `${text} · w toku`
}

/** The ISO week's number of a Monday (its Thursday carries it). */
export function weekNumber(monday: string): number {
  const thursday = addDays(monday, 3)
  const start = Date.UTC(Number(thursday.slice(0, 4)), 0, 1)
  const day = Date.UTC(Number(thursday.slice(0, 4)), Number(thursday.slice(5, 7)) - 1, Number(thursday.slice(8, 10)))
  return Math.floor((day - start) / 86_400_000 / 7) + 1
}

/** „tydz. 44 · 26.10–1.11” */
export function weekLabel(monday: string): string {
  const short = (d: string) => `${Number(d.slice(8, 10))}.${d.slice(5, 7)}`
  return `tydz. ${weekNumber(monday)} · ${short(monday)}–${short(addDays(monday, 6))}`
}

export const SEASON_NAMES: Record<Season, string> = { winter: 'zima', spring: 'wiosna', summer: 'lato', autumn: 'jesień' }

/** The week's favourite way of regeneration by its name (a variant of „Regeneracja”, „Odcinam się”); none – null. */
export function wayName(id: string | null, variants: readonly Variant[]): string | null {
  if (!id) return null
  if (id === DISCONNECT_WAY) return 'Odcinam się'
  if (id === REGEN_CATEGORY) return 'Regeneracja'
  return variants.find((v) => v.id === id)?.name ?? 'sposób usunięty'
}

/** „Następny: Druga płyta – jeszcze 23 nuty”; the room full – null. */
export function nextText(room: GameView['room']): string | null {
  return room.next ? `Następny: ${room.next.item.name} – jeszcze ${notes(room.next.missing)}` : null
}

/** The celebration's words: a title and one quiet line. */
export function celebrationText(c: Celebration): { title: string; line: string } {
  if (c.kind === 'streak') return { title: `Passa ${c.streak} dni`, line: `${countLabel(c.streak ?? 0, 'dotrzymany dzień', 'dotrzymane dni', 'dotrzymanych dni')} z rzędu – do ${plDate(c.date)}.` }
  return { title: `Nowe w pokoju: ${c.item?.name ?? ''}`, line: `Nuty zamrożonych dni odblokowały to ${plDate(c.date)}.` }
}
