/**
 * The progress of the game (spec „Progresja”, „Świętowanie”): the room's items unlocked by the notes of frozen days
 * (notes still open to corrections never unlock – once unlocked, an item stays), a cassette for every week closed by its
 * frozen Sunday – its cover from the season and the week's favourite regeneration, a sticker when at least 70% of the
 * days kept or counted as broken were kept – and the full-screen celebrations: a streak of 7, 14, 30, 60 or 100 days
 * (unless one at least as long ended in the 30 days before), and every new item of the room. What was celebrated
 * already, and when a celebration may show (the main window, no quiet mode), the caller keeps. Pure.
 */
import { REGEN_CATEGORY } from '../model/categories'
import { addDays } from '../time/zone'
import type { DayState } from './day'
import { OPEN, ranMinutes } from './facts'
import { gameSummary, weekOf, type GameDay, type GameSummary, type StreakStep } from './game'

export interface RoomItem {
  id: string
  name: string
  /** Notes of frozen days that unlock it. */
  notes: number
}

/**
 * The room's items (spec: „roślina rośnie, pojawiają się płyty, lampki i plakaty”) – a working list (D301): you accept
 * it with the thresholds and the stickers' look before the game's screens. About 6–9 notes on an ordinary good day.
 */
export const ROOM_ITEMS: readonly RoomItem[] = [
  { id: 'roslina-1', name: 'Roślina – sadzonka', notes: 0 },
  { id: 'plyta-1', name: 'Pierwsza płyta', notes: 20 },
  { id: 'roslina-2', name: 'Roślina – pierwsze liście', notes: 50 },
  { id: 'plakat-1', name: 'Plakat', notes: 80 },
  { id: 'plyta-2', name: 'Druga płyta', notes: 120 },
  { id: 'lampki', name: 'Lampki', notes: 170 },
  { id: 'roslina-3', name: 'Roślina – większa', notes: 230 },
  { id: 'plyta-3', name: 'Trzecia płyta', notes: 300 },
  { id: 'plakat-2', name: 'Drugi plakat', notes: 380 },
  { id: 'roslina-4', name: 'Roślina – kwitnie', notes: 470 },
  { id: 'plyta-4', name: 'Czwarta płyta', notes: 570 },
  { id: 'plakat-3', name: 'Trzeci plakat', notes: 680 },
  { id: 'plyta-5', name: 'Półka płyt', notes: 800 }
]

/**
 * The room now: the items the frozen notes unlocked – and every item unlocked before (`kept`: once unlocked, always,
 * also when the notes of a day are counted again lower) – and the next one with the notes it still needs.
 */
export function roomOf(finalNotes: number, items: readonly RoomItem[] = ROOM_ITEMS, kept: ReadonlySet<string> = new Set()): { unlocked: RoomItem[]; next: { item: RoomItem; missing: number } | null } {
  const sorted = [...items].sort((a, b) => a.notes - b.notes)
  const unlocked = sorted.filter((x) => x.notes <= finalNotes || kept.has(x.id))
  const next = sorted.find((x) => x.notes > finalNotes && !kept.has(x.id))
  return { unlocked, next: next ? { item: next, missing: next.notes - finalNotes } : null }
}

/** The day's minutes of regeneration by its way (a variant of „Regeneracja”, „Odcinam się”): the cassette's cover. */
export function regenWaysOf(state: DayState): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (k: string, min: number) => {
    if (min > 0) out[k] = (out[k] ?? 0) + min
  }
  for (const f of state.facts.blocks.values()) {
    if (f.startedAt == null || f.planned?.categoryId !== REGEN_CATEGORY) continue
    add(f.planned.variantId ?? REGEN_CATEGORY, ranMinutes(f, state.now))
  }
  for (const d of state.facts.disconnect) add(DISCONNECT_WAY, Math.max(0, Math.min(d.to === OPEN ? state.now : d.to, state.now) - d.from))
  return out
}

/** „Odcinam się” as a way of regeneration. */
export const DISCONNECT_WAY = 'odcinam'

/** The minutes by way a stored grade carries (read tolerantly; a grade from before them has none). */
export function storedWays(grade: Readonly<Record<string, unknown>>): Record<string, number> {
  const w = grade.regenWays
  const out: Record<string, number> = {}
  if (!w || typeof w !== 'object' || Array.isArray(w)) return out
  for (const [k, v] of Object.entries(w as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
  return out
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** The season of a week (by its Thursday – the day that carries the week's number). */
export function seasonOf(monday: string): Season {
  const m = Number(addDays(monday, 3).slice(5, 7))
  return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
}

export interface Cassette {
  /** The week's Monday. */
  week: string
  season: Season
  /** The week's favourite way of regeneration (most minutes; on a tie the first by name), null: none. */
  favourite: string | null
  /** Days kept, and days kept or counted as broken (the sticker's base, T44). */
  kept: number
  counted: number
  sticker: boolean
}

/** At least this share of the counted days kept gives the sticker. */
export const STICKER_SHARE = 0.7

/**
 * The cassettes (spec „Każdy tydzień zamyka się kasetą na półce po zamrożeniu niedzieli”): one for every week whose
 * Sunday is frozen. Counted as broken: a broken day (also one the protection day replaced) and a day without data over
 * the week's limit; days without data within it and days outside the game are not counted. A week without such days
 * has no sticker.
 */
export function cassettesOf(days: readonly GameDay[], steps: readonly StreakStep[]): Cassette[] {
  const moves = new Map(steps.map((s) => [s.date, s.move]))
  const weeks = new Map<string, GameDay[]>()
  for (const d of days) {
    const w = weekOf(d.date)
    const list = weeks.get(w) ?? []
    list.push(d)
    weeks.set(w, list)
  }
  const out: Cassette[] = []
  for (const [week, list] of [...weeks].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sunday = list.find((d) => d.date === addDays(week, 6))
    if (!sunday?.frozen) continue
    let kept = 0
    let counted = 0
    const ways: Record<string, number> = {}
    for (const d of list) {
      const m = moves.get(d.date)
      if (m === 'up') kept++
      if (m === 'up' || m === 'broken' || m === 'protected') counted++
      for (const [k, v] of Object.entries(d.regenWays ?? {})) ways[k] = (ways[k] ?? 0) + v
    }
    const favourite = Object.entries(ways).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null
    out.push({ week, season: seasonOf(week), favourite, kept, counted, sticker: counted > 0 && kept / counted >= STICKER_SHARE })
  }
  return out
}

/** Streaks celebrated full-screen (spec). */
export const STREAK_MILESTONES: readonly number[] = [7, 14, 30, 60, 100]
/** A streak at least as long that ended within this many days before takes the celebration away. */
const ENDED_WITHIN_DAYS = 30

export interface Celebration {
  /** Stable: the caller remembers it was shown (once). */
  key: string
  kind: 'streak' | 'room'
  /** The day that brought it. */
  date: string
  streak: number | null
  item: RoomItem | null
}

/**
 * The full-screen celebrations so far, in the order of dates: every streak milestone reached on a frozen day (a day
 * still open to corrections waits), unless a streak at least that long ended in the 30 days before; every item of the
 * room, on the frozen day whose notes unlocked it (the items of the start – 0 notes – are no news).
 */
export function celebrationsOf(days: readonly GameDay[], steps: readonly StreakStep[], items: readonly RoomItem[] = ROOM_ITEMS): Celebration[] {
  const out: Celebration[] = []
  const ended: Array<{ date: string; length: number }> = []
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    if (s.move === 'broken') ended.push({ date: s.date, length: steps[i - 1]?.streak ?? 0 })
    if (s.move !== 'up' || !s.frozen || !STREAK_MILESTONES.includes(s.streak)) continue
    const since = addDays(s.date, -ENDED_WITHIN_DAYS)
    if (ended.some((e) => e.date > since && e.length >= s.streak)) continue
    out.push({ key: `streak:${s.date}:${s.streak}`, kind: 'streak', date: s.date, streak: s.streak, item: null })
  }
  const sorted = [...items].filter((x) => x.notes > 0).sort((a, b) => a.notes - b.notes)
  let total = 0
  let next = 0
  for (const d of [...days].filter((x) => x.frozen).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    total += d.notes
    while (next < sorted.length && sorted[next]!.notes <= total) {
      const item = sorted[next++]!
      out.push({ key: `room:${item.id}`, kind: 'room', date: d.date, streak: null, item })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** The game as its screens show it: the streak and notes, the room, the shelf of cassettes, the celebrations so far. */
export interface GameView extends GameSummary {
  room: ReturnType<typeof roomOf>
  cassettes: Cassette[]
  celebrations: Celebration[]
}

export function gameView(days: readonly GameDay[], today: string, items: readonly RoomItem[] = ROOM_ITEMS, kept: ReadonlySet<string> = new Set()): GameView {
  const summary = gameSummary(days, today)
  return { ...summary, room: roomOf(summary.notes.final, items, kept), cassettes: cassettesOf(days, summary.steps), celebrations: celebrationsOf(days, summary.steps, items) }
}
